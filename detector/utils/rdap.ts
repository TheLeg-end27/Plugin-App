/**
 * rdap.ts
 * Cliente RDAP con bootstrapping IANA (RFC 9224).
 * Localiza el servidor autoritativo para cualquier TLD
 * y extrae la fecha de registro del dominio.
 */

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const BOOTSTRAP_CACHE_KEY = 'rdap:bootstrap';
const BOOTSTRAP_TIMEOUT_MS = 3000;
const RDAP_TIMEOUT_MS = 4000;

// ── Tipos ────────────────────────────────────────────────────────────────────

interface BootstrapCache {
  data: Record<string, string[]>;  // tld → lista de servidores base
  expiresAt: number;               // Unix timestamp ms
}

export interface RdapResult {
  domain: string;
  registrationDate: string | null;  // ISO 8601
  ageDays: number | null;
  rdapServer: string | null;
  error: string | null;
}

// ── Bootstrap IANA ───────────────────────────────────────────────────────────

async function getBootstrapMap(): Promise<Record<string, string[]>> {
  // 1. Intentar leer del cache local
  const stored = await chrome.storage.local.get(BOOTSTRAP_CACHE_KEY);
  const cached = stored[BOOTSTRAP_CACHE_KEY] as BootstrapCache | undefined;

  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // 2. Fetch del archivo IANA
  const res = await fetchWithTimeout(BOOTSTRAP_URL, BOOTSTRAP_TIMEOUT_MS);
  const json = await res.json();

  // 3. Construir mapa tld → servidores
  const map: Record<string, string[]> = {};
  for (const [tlds, servers] of json.services) {
    for (const tld of tlds) {
      map[tld.toLowerCase()] = servers;
    }
  }

  // 4. Calcular expiración desde cabecera Expires (o 24h por defecto)
  const expires = res.headers.get('Expires');
  const expiresAt = expires
    ? new Date(expires).getTime()
    : Date.now() + 24 * 60 * 60 * 1000;

  await chrome.storage.local.set({
    [BOOTSTRAP_CACHE_KEY]: { data: map, expiresAt } satisfies BootstrapCache,
  });

  return map;
}

// ── Resolver servidor RDAP para un TLD ───────────────────────────────────────

async function resolveRdapServer(tld: string): Promise<string | null> {
  const map = await getBootstrapMap();
  const servers = map[tld.toLowerCase()];
  if (!servers || servers.length === 0) return null;

  // Preferir HTTPS sobre HTTP
  const https = servers.find(s => s.startsWith('https://'));
  return https ?? servers[0];
}

// ── Consulta RDAP ────────────────────────────────────────────────────────────

export async function queryRdap(domain: string): Promise<RdapResult> {
  const parts = domain.split('.');
  const tld = parts[parts.length - 1];

  const result: RdapResult = {
    domain,
    registrationDate: null,
    ageDays: null,
    rdapServer: null,
    error: null,
  };

  try {
    // 1. Localizar servidor
    const server = await resolveRdapServer(tld);
    if (!server) {
      result.error = 'RDAP_NO_SERVER';
      return result;
    }
    result.rdapServer = server;

    // 2. Consultar RDAP
    const url = `${server.replace(/\/$/, '')}/domain/${domain}`;
    const res = await fetchWithTimeout(url, RDAP_TIMEOUT_MS);

    if (!res.ok) {
      result.error = `RDAP_HTTP_${res.status}`;
      return result;
    }

    const json = await res.json();

    // 3. Extraer fecha de registro del array events
    const events: Array<{ eventAction: string; eventDate: string }> =
      json.events ?? [];

    const regEvent = events.find(
      e => e.eventAction === 'registration'
    );

    if (!regEvent) {
      result.error = 'RDAP_NO_REG_DATE';
      return result;
    }

    result.registrationDate = regEvent.eventDate;

    // 4. Calcular antigüedad en días
    const regDate = new Date(regEvent.eventDate);
    const diffMs = Date.now() - regDate.getTime();
    result.ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  } catch (err) {
    result.error = err instanceof Error ? err.message : 'RDAP_UNKNOWN_ERROR';
  }

  return result;
}

// ── Helper: fetch con timeout ─────────────────────────────────────────────────

export async function fetchWithTimeout(
  url: string,
  ms: number,
  headers?: Record<string, string>
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: headers ?? {},
    });
  } finally {
    clearTimeout(timer);
  }
}