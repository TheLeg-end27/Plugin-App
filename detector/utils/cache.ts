/**
 * cache.ts
 * Gestión de caché local en chrome.storage.local.
 * Entrada por dominio con TTL diferenciado por nivel de riesgo.
 */

import type { RiskLevel } from './scoring';

const PREFIX = 'cache:';
const LRU_KEY = 'meta:lru_index';
const QUOTA_BYTES = 10 * 1024 * 1024;       // 10 MB
const EVICTION_THRESHOLD = 0.85;            // 85% de la cuota
const EVICTION_PERCENT   = 0.20;            // purgar 20% más antiguo

// TTL en milisegundos por nivel de riesgo
const TTL: Record<RiskLevel | 'error', number> = {
  high:     2  * 60 * 60 * 1000,    //  2 horas
  moderate: 24 * 60 * 60 * 1000,    // 24 horas
  low:      72 * 60 * 60 * 1000,    // 72 horas
  error:    30 * 60 * 1000,         // 30 minutos
};

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  domain:           string;
  tsConsulta:       number;
  tsExpiracion:     number;
  ageDays:          number | null;
  entropia:         number;
  scoreVT:          number;
  scoreTLS:         number;
  scoreFinal:       number;
  nivel:            RiskLevel;
  fuenteRdap:       string | null;
  vtActivado:       boolean;
  fechaRegistro:    string | null;
  error:            string | null;
}

// ── Lectura ───────────────────────────────────────────────────────────────────

export async function getCached(domain: string): Promise<CacheEntry | null> {
  const key = PREFIX + domain;
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key] as CacheEntry | undefined;

  if (!entry) return null;
  if (Date.now() > entry.tsExpiracion) return null;   // TTL expirado

  // Actualizar posición en índice LRU
  await touchLru(domain);
  return entry;
}

// ── Escritura ─────────────────────────────────────────────────────────────────

export async function setCached(
  entry: Omit<CacheEntry, 'tsConsulta' | 'tsExpiracion'>
): Promise<void> {
  const now = Date.now();
  const ttlKey: RiskLevel | 'error' = entry.error ? 'error' : entry.nivel;

  const full: CacheEntry = {
    ...entry,
    tsConsulta:   now,
    tsExpiracion: now + TTL[ttlKey],
  };

  await chrome.storage.local.set({ [PREFIX + entry.domain]: full });
  await touchLru(entry.domain);
  await maybeEvict();
}

// ── Whitelist ─────────────────────────────────────────────────────────────────

export async function isWhitelisted(domain: string): Promise<boolean> {
  const stored = await chrome.storage.local.get('whitelist:' + domain);
  return !!stored['whitelist:' + domain];
}

export async function addToWhitelist(domain: string, score: number, level: RiskLevel): Promise<void> {
  await chrome.storage.local.set({
    ['whitelist:' + domain]: {
      domain,
      tsAdded: Date.now(),
      scoreEnMomentoWhitelist: score,
      nivelEnMomentoWhitelist: level,
    },
  });
}

// ── Vaciado de caché de dominio (botón en popup) ──────────────────────────────

export async function clearDomainCache(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter(k => k.startsWith(PREFIX));
  await chrome.storage.local.remove(cacheKeys);
  await chrome.storage.local.remove(LRU_KEY);
}

// ── LRU index ─────────────────────────────────────────────────────────────────

async function touchLru(domain: string): Promise<void> {
  const stored = await chrome.storage.local.get(LRU_KEY);
  const index: string[] = Array.isArray(stored[LRU_KEY]) ? stored[LRU_KEY] : [];
  const updated = [...index.filter(d => d !== domain), domain];
  await chrome.storage.local.set({ [LRU_KEY]: updated });
}

// ── Evicción LRU ──────────────────────────────────────────────────────────────
async function maybeEvict(): Promise<void> {
  // Estimamos el tamaño serializando todas las entradas de caché
  const all = await chrome.storage.local.get(null);
  const serialized = JSON.stringify(all);
  const estimatedBytes = new TextEncoder().encode(serialized).length;

  if (estimatedBytes < QUOTA_BYTES * EVICTION_THRESHOLD) return;

  const index: string[] = Array.isArray(all[LRU_KEY]) ? all[LRU_KEY] : [];
  const toRemove = index.slice(0, Math.floor(index.length * EVICTION_PERCENT));

  if (toRemove.length === 0) return;

  await chrome.storage.local.remove(toRemove.map(d => PREFIX + d));
  await chrome.storage.local.set({
    [LRU_KEY]: index.slice(toRemove.length),
  });

  console.log(`[CACHE] Evicción LRU: ${toRemove.length} entradas eliminadas`);
}