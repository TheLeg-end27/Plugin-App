/**
 * content.ts
 * Inyecta el banner de alerta en el DOM de la página visitada.
 * Recibe instrucciones del Service Worker vía chrome.runtime.onMessage.
 */

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type !== 'SHOW_BANNER') return;
      showBanner(message.data);
    });
  },
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface BannerData {
  domain: string;
  ageDays: number | null;
  scoreFinal: number;
  nivel: 'high' | 'moderate';
}

// ── Banner ────────────────────────────────────────────────────────────────────

function showBanner(data: BannerData) {
  if (document.getElementById('pd-banner-host')) return;
  const isCritical = data.nivel === 'high';
  const color      = isCritical ? '#C0392B' : '#E67E22';
  const icon       = isCritical ? '🛑' : '⚠️';
  const ageText    = data.ageDays === null
    ? 'antigüedad desconocida'
    : data.ageDays < 1
      ? 'menos de 24 horas de antigüedad'
      : `${data.ageDays} día${data.ageDays === 1 ? '' : 's'} de antigüedad`;

  const message = isCritical
    ? `Este dominio fue registrado hace ${ageText}. Los sitios de phishing suelen desaparecer en horas.`
    : `Este dominio tiene ${ageText}. Verifica que reconoces este sitio antes de introducir cualquier dato.`;

  // ── Host element con Shadow DOM ───────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'pd-banner-host';
  host.style.cssText = `
    all: initial;
    position: fixed;
    top: 0; left: 0; right: 0;
    width: 100%;
    z-index: 2147483647;
    display: block;
  `;

  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      #banner {
        background: ${color};
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.4);
        width: 100%;
        box-sizing: border-box;
      }
      .icon { font-size: 16px; flex-shrink: 0; }
      .text { flex: 1; min-width: 0; }
      .main { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sub  { font-size: 11px; opacity: 0.9; margin-top: 2px; }
      button {
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.4);
        color: white;
        padding: 5px 12px;
        border-radius: 5px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        white-space: nowrap;
        flex-shrink: 0;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .fp-btn {
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.6);
        font-size: 11px;
        cursor: pointer;
        padding: 4px 8px;
        flex-shrink: 0;
      }
    </style>
    <div id="banner">
      <span class="icon">${icon}</span>
      <div class="text">
        <div class="main">Dominio sospechoso · ${data.domain}</div>
        <div class="sub">${message}</div>
      </div>
      <button id="continue-btn" ${isCritical ? 'disabled' : ''}>
        ${isCritical ? 'Continuar (5s)' : 'Entendido'}
      </button>
      <button class="fp-btn" id="fp-btn">No mostrar más</button>
    </div>
  `;

  // ── Lógica de botones ─────────────────────────────────────────────────────

  const continueBtn = shadow.getElementById('continue-btn') as HTMLButtonElement;
  const fpBtn       = shadow.getElementById('fp-btn') as HTMLButtonElement;

  const removeBanner = () => {
    document.body.style.marginTop = '';
    host.remove();
  };

  if (isCritical) {
    let seconds = 5;
    const countdown = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        continueBtn.textContent = `Continuar (${seconds}s)`;
      } else {
        clearInterval(countdown);
        continueBtn.textContent = 'Continuar de todas formas';
        continueBtn.disabled = false;
      }
    }, 1000);
  }

  continueBtn.addEventListener('click', removeBanner);
  fpBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'ADD_WHITELIST', domain: data.domain });
    removeBanner();
  });

  // ── Insertar en el DOM ────────────────────────────────────────────────────
  document.documentElement.insertBefore(host, document.documentElement.firstChild);

  // Empujar contenido de la página hacia abajo
  requestAnimationFrame(() => {
    document.body.style.marginTop = `${host.offsetHeight + 4}px`;
  });
}