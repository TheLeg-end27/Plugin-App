import type { CacheEntry } from '../../utils/cache';

const LEVEL_META = {
  high:     { icon: '🛑', label: 'Riesgo Alto',     color: '#C0392B' },
  moderate: { icon: '⚠️', label: 'Riesgo Moderado', color: '#F39C12' },
  low:      { icon: '🛡️', label: 'Sin riesgo',      color: '#27AE60' },
} as const;

function explanation(entry: CacheEntry): string {
  const d = entry.ageDays;
  if (entry.error && !d) return 'No se pudo obtener la fecha de registro de este dominio.';
  if (d === null) return 'Datos de registro no disponibles.';
  if (d < 2)   return 'Este dominio fue registrado hace menos de 48 horas. Los sitios de phishing suelen desaparecer en horas.';
  if (d < 7)   return `Este dominio tiene ${d} días de vida. Verifica que reconoces este sitio antes de introducir cualquier dato.`;
  if (d < 30)  return `Este dominio fue registrado hace ${d} días. Procede con precaución si te solicita credenciales.`;
  return `Dominio con ${d} días de antigüedad. No se han detectado indicadores de riesgo relevantes.`;
}

function colorFor(score: number): string {
  if (score >= 61) return '#C0392B';
  if (score >= 30) return '#F39C12';
  return '#27AE60';
}

async function render() {
  const app = document.getElementById('app')!;

  // Obtener pestaña activa
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    app.innerHTML = `<div class="state-msg">No hay página activa.</div>`;
    return;
  }

  // Extraer dominio
  let domain: string;
  try {
    domain = new URL(tab.url).hostname.replace(/^www\./, '');
  } catch {
    app.innerHTML = `<div class="state-msg">URL no analizable.</div>`;
    return;
  }

  // Leer caché
  const key = 'cache:' + domain;
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key] as CacheEntry | undefined;

  if (!entry) {
    app.innerHTML = `<div class="state-msg">Analizando <strong>${domain}</strong>…<br>Recarga la página si tarda más de 5 s.</div>`;
    return;
  }

  const meta  = LEVEL_META[entry.nivel] ?? LEVEL_META.low;
  const color = meta.color;

  app.style.setProperty('--level-color', color);

  const ageDaysText = entry.ageDays === null ? 'N/D'
    : entry.ageDays < 1 ? '< 1 día'
    : `${entry.ageDays} días`;

  app.innerHTML = `
    <div class="header" style="background: ${meta.color}18;">
      <span class="header-icon">${meta.icon}</span>
      <div class="header-info">
        <div class="header-level">${meta.label}</div>
        <div class="header-domain">${domain}</div>
      </div>
      <div>
        <div class="header-score">${entry.scoreFinal}</div>
        <div class="header-score-label">/ 100</div>
      </div>
    </div>

    <div class="explanation">${explanation(entry)}</div>

    <div class="indicators">
      <div class="indicator">
        <span class="indicator-name">antigüedad</span>
        <span class="indicator-value" style="color:${colorFor(entry.scoreFinal)}">${ageDaysText}</span>
      </div>
      <div class="indicator">
        <span class="indicator-name">entropía</span>
        <span class="indicator-value" style="color:${colorFor(entry.entropia > 3 ? 60 : 0)}">${entry.entropia} bits</span>
      </div>
      <div class="indicator">
        <span class="indicator-name">VirusTotal</span>
        <span class="indicator-value" style="color:rgba(255,255,255,0.4)">${entry.vtActivado ? entry.scoreVT + ' / 100' : 'No consultado'}</span>
      </div>
      <div class="indicator">
        <span class="indicator-name">score final</span>
        <span class="indicator-value" style="color:${color}">${entry.scoreFinal} / 100</span>
      </div>
    </div>

    <div class="footer">
      <a class="footer-link" href="https://www.incibe.es/ciudadania/tematicas/phishing" target="_blank">¿Qué es el phishing?</a>
      <button class="clear-btn" id="clear-btn">Limpiar caché</button>
    </div>
    <div class="source">RDAP · ${entry.fuenteRdap ?? 'desconocido'}</div>
  `;

  document.getElementById('clear-btn')!.addEventListener('click', async () => {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith('cache:'));
    await chrome.storage.local.remove(keys);
    app.innerHTML = `<div class="state-msg">Caché eliminada.</div>`;
  });
}

render();
