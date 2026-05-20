import { readFileSync } from 'fs';
const records = JSON.parse(readFileSync('results/records.json', 'utf-8'));
const errors = records.filter(r => r.rdapError);

// Distribución de errores por tipo
const byError = {};
for (const r of errors) {
  byError[r.rdapError] = (byError[r.rdapError] || 0) + 1;
}
console.log('Errores por tipo:', byError);

// De los errores, cuántos son maliciosos vs legítimos
const malErrors = errors.filter(r => r.label === 1).length;
const legErrors = errors.filter(r => r.label === 0).length;
console.log('Errores en maliciosos:', malErrors);
console.log('Errores en legítimos:', legErrors);

// TLDs con más errores
const tldErrors = {};
for (const r of errors) {
  const tld = r.domain.split('.').pop();
  tldErrors[tld] = (tldErrors[tld] || 0) + 1;
}
const sorted = Object.entries(tldErrors).sort((a,b) => b[1]-a[1]).slice(0,10);
console.log('Top TLDs con errores:', sorted);