/**
 * prepare-dataset.ts
 * Descarga y prepara los datasets de evaluación.
 * Uso: npx tsx scripts/prepare-dataset.ts
 */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { parse } from 'tldts';

mkdirSync('data', { recursive: true });

// ── PhishTank ─────────────────────────────────────────────────────────────────

async function fetchPhishtank(limit = 500): Promise<string[]> {
  console.log('Descargando PhishTank...');
  const res  = await fetch('https://data.phishtank.com/data/online-valid.csv');
  const text = await res.text();

  const domains = new Set<string>();
  const lines   = text.split('\n').slice(1); // saltar cabecera

  for (const line of lines) {
    if (domains.size >= limit) break;
    const url = line.split(',')[1]?.replace(/"/g, '').trim();
    if (!url) continue;
    const parsed = parse(url);
    if (parsed?.domain) domains.add(parsed.domain);
  }

  return [...domains];
}

// ── Tranco Top 1M ─────────────────────────────────────────────────────────────

function loadTrancoLocal(from = 1000, limit = 500): string[] {
  console.log('Cargando Tranco desde archivo local...');
  const text    = readFileSync('./data/tranco_XWL8N.csv', 'utf-8');
  const domains: string[] = [];
  const lines   = text.split('\n');

  for (const line of lines) {
    const [rankStr, domain] = line.split(',');
    const rank = parseInt(rankStr);
    if (isNaN(rank) || !domain) continue;
    if (rank < from) continue;
    if (domains.length >= limit) break;
    domains.push(domain.trim());
  }

  return domains;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [malicious, legit] = await Promise.all([
    fetchPhishtank(500),
    loadTrancoLocal(1000, 500),
  ]);

  writeFileSync('data/malicious.txt', malicious.join('\n'));
  writeFileSync('data/legit.txt',     legit.join('\n'));

  console.log(`✓ malicious.txt: ${malicious.length} dominios`);
  console.log(`✓ legit.txt:     ${legit.length} dominios`);
}

main().catch(console.error);