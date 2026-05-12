/**
 * scoring.ts
 * Motor de scoring de riesgo compuesto.
 * Combina antigüedad RDAP, entropía, VirusTotal y TLS
 * en una puntuación normalizada [0-100].
 */

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface ScoreInput {
  ageDays: number | null;
  entropyScore: number;       // [0-100] de calcEntropy()
  vtScore: number;            // [0-100], 0 si no consultado
  tlsScore: number;           // 0, 40 o 100
  vtAvailable: boolean;       // false → redistribuir peso
}

export interface ScoreResult {
  score: number;              // [0-100] redondeado
  level: RiskLevel;
  badgeColor: string;         // hex
  ageScore: number;           // score parcial de edad
  weights: {                  // pesos aplicados realmente
    age: number;
    entropy: number;
    vt: number;
    tls: number;
  };
}

// ── Score de antigüedad (no lineal) ─────────────────────────────────────────

function calcAgeScore(ageDays: number | null): number {
  if (ageDays === null) return 60;   // sin dato → moderado-alto por precaución
  if (ageDays < 2)     return 100;
  if (ageDays < 7)     return 85;
  if (ageDays < 30)    return 60;
  if (ageDays < 90)    return 30;
  return 5;
}

// ── Clasificación por score ───────────────────────────────────────────────────

function classify(score: number): { level: RiskLevel; badgeColor: string } {
  if (score >= 75) return { level: 'critical', badgeColor: '#C0392B' };
  if (score >= 50) return { level: 'high',     badgeColor: '#E67E22' };
  if (score >= 25) return { level: 'moderate', badgeColor: '#F39C12' };
  return              { level: 'low',          badgeColor: '#27AE60' };
}

// ── Score compuesto ───────────────────────────────────────────────────────────

export function calcScore(input: ScoreInput): ScoreResult {
  const ageScore = calcAgeScore(input.ageDays);

  // Pesos base: 60 / 25 / 10 / 5
  // Si VT no disponible → redistribuir su 10% entre edad y entropía
  const weights = input.vtAvailable
    ? { age: 0.60, entropy: 0.25, vt: 0.10, tls: 0.05 }
    : { age: 0.667, entropy: 0.278, vt: 0.00, tls: 0.055 };

  const score = Math.round(
    weights.age     * ageScore          +
    weights.entropy * input.entropyScore +
    weights.vt      * input.vtScore     +
    weights.tls     * input.tlsScore
  );

  return {
    score,
    ageScore,
    weights,
    ...classify(score),
  };
}