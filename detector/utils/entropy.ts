/**
 * entropy.ts
 * Calcula la entropía de Shannon del nombre de un dominio
 * como indicador de aleatoriedad léxica (detección de DGAs).
 */

export interface EntropyResult {
  value: number;       // bits, redondeado a 2 decimales
  score: number;       // normalizado [0-100]
  label: 'low' | 'moderate' | 'high' | 'very_high';
}

export function calcEntropy(domainName: string): EntropyResult {
  // Trabajamos solo con el nombre, sin TLD
  const name = domainName.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (name.length === 0) {
    return { value: 0, score: 0, label: 'low' };
  }

  // Frecuencia relativa de cada carácter
  const freq: Record<string, number> = {};
  for (const char of name) {
    freq[char] = (freq[char] ?? 0) + 1;
  }

  // H(X) = -Σ p(x) · log₂(p(x))
  let H = 0;
  for (const count of Object.values(freq)) {
    const p = count / name.length;
    H -= p * Math.log2(p);
  }

  H = Math.round(H * 100) / 100;

  // Normalización a score [0-100] y etiqueta
  let score: number;
  let label: EntropyResult['label'];

  if (H < 2.5) {
    score = 0;
    label = 'low';
  } else if (H < 3.0) {
    score = 30;
    label = 'moderate';
  } else if (H < 3.5) {
    score = 60;
    label = 'high';
  } else {
    score = 100;
    label = 'very_high';
  }

  return { value: H, score, label };
}