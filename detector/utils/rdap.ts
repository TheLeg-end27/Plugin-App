/**
 * rdap.ts
 * Cliente RDAP con bootstrapping IANA (RFC 9224).
 * Storage desacoplado mediante inyección de adaptador.
 */

const BOOTSTRAP_URL      = 'https://data.iana.org/rdap/dns.json';
const BOOTSTRAP_CACHE_KEY = 'rdap:bootstrap';
const BOOTSTRAP_TIMEOUT_MS = 3000;
const RDAP_TIMEOUT_MS      = 4000;

// ── Interfaz de storage (inyectable) ─────────────────────────────────────────

export interface StorageAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

// ── Adaptador Chrome (producción) ─────────────────────────────────────────────

export const chromeStorageAdapter: StorageAdapter = {
  async get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
};

// ── Adaptador en memoria (Node.js / tests) ────────────────────────────────────

const memoryStore = new Map<string, unknown>();

export const memoryStorageAdapter: StorageAdapter = {
  async get(key) {
    return memoryStore.get(key) ?? null;
  },
  async set(key, value) {
    memoryStore.set(key, value);
  },
};

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface BootstrapCache {
  data: Record<string, string[]>;
  expiresAt: number;
}

export interface RdapResult {
  domain:           string;
  registrationDate: string | null;
  ageDays:          number | null;
  rdapServer:       string | null;
  error:            string | null;
}

// ── Bootstrap IANA ────────────────────────────────────────────────────────────

async function getBootstrapMap(storage: StorageAdapter): Promise<Record<string, string[]>> {
  const cached = await storage.get(BOOTSTRAP_CACHE_KEY) as BootstrapCache | null;

  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const res  = await fetchWithTimeout(BOOTSTRAP_URL, BOOTSTRAP_TIMEOUT_MS);
  const json = await res.json();

  const map: Record<string, string[]> = {};
  for (const [tlds, servers] of json.services) {
    for (const tld of tlds) {
      map[(tld as string).toLowerCase()] = servers;
    }
  }

  const expires   = res.headers.get('Expires');
  const expiresAt = expires
    ? new Date(expires).getTime()
    : Date.now() + 24 * 60 * 60 * 1000;

  await storage.set(BOOTSTRAP_CACHE_KEY, { data: map, expiresAt });
  return map;
}

// ── Resolver servidor RDAP ────────────────────────────────────────────────────

async function resolveRdapServer(tld: string, storage: StorageAdapter): Promise<string | null> {
  const map     = await getBootstrapMap(storage);
  const servers = map[tld.toLowerCase()];
  if (!servers || servers.length === 0) return null;
  return servers.find(s => s.startsWith('https://')) ?? servers[0];
}

// ── Consulta RDAP ─────────────────────────────────────────────────────────────

export async function queryRdap(
  domain: string,
  storage: StorageAdapter = chromeStorageAdapter
): Promise<RdapResult> {
  const parts = domain.split('.');
  const tld   = parts[parts.length - 1];

  const result: RdapResult = {
    domain,
    registrationDate: null,
    ageDays:          null,
    rdapServer:       null,
    error:            null,
  };

  try {
    const server = await resolveRdapServer(tld, storage);
    if (!server) {
      result.error = 'RDAP_NO_SERVER';
      return result;
    }
    result.rdapServer = server;

    const url = `${server.replace(/\/$/, '')}/domain/${domain}`;
    const res = await fetchWithTimeout(url, RDAP_TIMEOUT_MS);

    if (!res.ok) {
      result.error = `RDAP_HTTP_${res.status}`;
      return result;
    }

    const json = await res.json();
    const events: Array<{ eventAction: string; eventDate: string }> = json.events ?? [];
    const regEvent = events.find(e => e.eventAction === 'registration');

    if (!regEvent) {
      result.error = 'RDAP_NO_REG_DATE';
      return result;
    }

    result.registrationDate = regEvent.eventDate;
    const diffMs  = Date.now() - new Date(regEvent.eventDate).getTime();
    result.ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  } catch (err) {
    result.error = err instanceof Error ? err.message : 'RDAP_UNKNOWN_ERROR';
  }

  return result;
}

// ── fetch con timeout y cabeceras opcionales ──────────────────────────────────

export async function fetchWithTimeout(
  url: string,
  ms: number,
  headers?: Record<string, string>
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, headers: headers ?? {} });
  } finally {
    clearTimeout(timer);
  }
}