/**
 * evaluate.ts
 * Evaluación offline del motor de scoring sobre dataset etiquetado.
 * Uso: npx tsx scripts/evaluate.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { queryRdap, memoryStorageAdapter } from '../utils/rdap';
import { calcEntropy }                     from '../utils/entropy';
import { calcScore }                       from '../utils/scoring';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DomainRecord {
  domain:    string;
  label:     1 | 0;
  ageDays:   number | null;
  entropia:  number;
  score:     number;
  nivel:     string;
  rdapError: string | null;
}

// ── Dataset ───────────────────────────────────────────────────────────────────

function loadDataset(): Array<{ domain: string; label: 1 | 0 }> {
  const malicious = readFileSync('data/malicious.txt', 'utf-8')
    .split('\n').filter(Boolean)
    .map(d => ({ domain: d.trim(), label: 1 as const }));

  const legit = readFileSync('data/legit.txt', 'utf-8')
    .split('\n').filter(Boolean)
    .map(d => ({ domain: d.trim(), label: 0 as const }));

  return [...malicious, ...legit];
}

// ── Análisis de un dominio ────────────────────────────────────────────────────

async function analyze(domain: string) {
  const rdap    = await queryRdap(domain, memoryStorageAdapter);
  const entropy = calcEntropy(domain);
  const result  = calcScore({
    ageDays:      rdap.ageDays,
    entropyScore: entropy.score,
    vtScore:      0,
    tlsScore:     0,
    vtAvailable:  false,
  });
  return {
    ageDays:   rdap.ageDays,
    entropia:  entropy.value,
    score:     result.score,
    nivel:     result.level,
    rdapError: rdap.error,
  };
}

// ── Métricas ──────────────────────────────────────────────────────────────────

function calcMetrics(records: DomainRecord[], threshold: number) {
  let TP = 0, FP = 0, TN = 0, FN = 0;

  for (const r of records) {
    const predicted = r.score >= threshold ? 1 : 0;
    if      (predicted === 1 && r.label === 1) TP++;
    else if (predicted === 1 && r.label === 0) FP++;
    else if (predicted === 0 && r.label === 0) TN++;
    else                                        FN++;
  }

  const precision = TP / (TP + FP) || 0;
  const recall    = TP / (TP + FN) || 0;
  const f1        = 2 * (precision * recall) / (precision + recall) || 0;
  const fpr       = FP / (FP + TN) || 0;

  return {
    threshold,
    TP, FP, TN, FN,
    precision: +precision.toFixed(4),
    recall:    +recall.toFixed(4),
    f1:        +f1.toFixed(4),
    fpr:       +fpr.toFixed(4),
    accuracy:  +((TP + TN) / (TP + FP + TN + FN)).toFixed(4),
  };
}

// ── Curva ROC simplificada ────────────────────────────────────────────────────

function rocPoints(records: DomainRecord[]) {
  return [0, 10, 20, 25, 30, 40, 50, 60, 75, 85, 100]
    .map(t => {
      const m = calcMetrics(records, t);
      return { threshold: t, tpr: m.recall, fpr: m.fpr };
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync('results', { recursive: true });

  const dataset = loadDataset();
  console.log(`\nDataset cargado: ${dataset.length} dominios\n`);

  const records: DomainRecord[] = [];
  let i = 0;

  for (const item of dataset) {
    i++;
    process.stdout.write(`\r  Analizando [${i}/${dataset.length}] ${item.domain.padEnd(40)}`);

    try {
      const result = await analyze(item.domain);
      records.push({ domain: item.domain, label: item.label, ...result });
    } catch {
      records.push({
        domain: item.domain, label: item.label,
        ageDays: null, entropia: 0, score: 60,
        nivel: 'moderate', rdapError: 'EXCEPTION',
      });
    }

    await new Promise(r => setTimeout(r, 350));  // respetar rate limits RDAP
  }

  console.log('\n\n── Métricas por umbral ──────────────────────────────\n');

  const thresholds = [25, 40, 50, 60, 75];
  const metrics    = thresholds.map(t => calcMetrics(records, t));
  console.table(metrics);

  const roc  = rocPoints(records);
  const best = metrics.reduce((a, b) => a.f1 > b.f1 ? a : b);

  console.log(`\n── Mejor configuración ──────────────────────────────`);
  console.log(`  Umbral óptimo : ${best.threshold}`);
  console.log(`  F1-score      : ${best.f1}`);
  console.log(`  Precisión     : ${best.precision}`);
  console.log(`  Recall        : ${best.recall}`);
  console.log(`  FPR           : ${best.fpr}`);
  console.log(`  Accuracy      : ${best.accuracy}`);

  // Errores RDAP
  const rdapErrors = records.filter(r => r.rdapError);
  console.log(`\n── Cobertura RDAP ───────────────────────────────────`);
  console.log(`  Dominios con fecha obtenida : ${records.length - rdapErrors.length}`);
  console.log(`  Errores RDAP                : ${rdapErrors.length}`);
  console.log(`  Cobertura                   : ${((records.length - rdapErrors.length) / records.length * 100).toFixed(1)}%`);

  writeFileSync('results/records.json', JSON.stringify(records, null, 2));
  writeFileSync('results/metrics.json', JSON.stringify(metrics,  null, 2));
  writeFileSync('results/roc.json',     JSON.stringify(roc,      null, 2));
  console.log('\n  Resultados guardados en results/\n');
}

main().catch(console.error);