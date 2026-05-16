import {parse} from 'tldts';
import { queryRdap } from '../utils/rdap';
import { calcEntropy } from '../utils/entropy';
import { calcScore } from '../utils/scoring';
import { getCached, setCached, isWhitelisted } from '../utils/cache';

const VT_SCORE_THRESHOLD = 45;   // activar VT si score preliminar ≥ este valor
const VT_API_KEY = '';           // añadir clave aquí en fase de integración VT

export default defineBackground(() => {
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    // Solo frame principal, ignorar iframes
    if (details.frameId !== 0) return;

    const url = details.url;
    if (!url.startsWith('http')) return;   // ignorar chrome://, about:, etc.

    // 1 — Extraer eTLD+1
    const parsed = parse(url);
    const domain = parsed?.domain;
    if (!domain) return;

    // 2 — Comprobar whitelist
    const whitelisted = await isWhitelisted(domain);
    if (whitelisted) {
      // Mostrar badge gris sin banner
      await updateBadge(details.tabId, '✓', '#555555');
      return;
    }

    // 3 — Consultar caché
    const cached = await getCached(domain);
    if (cached) {
      await updateBadge(
        details.tabId,
        formatDays(cached.ageDays),
        getBadgeColor(cached.nivel)
      );
      if (cached.scoreFinal >= 50) {
        await notifyContentScript(details.tabId, cached);
      }
      return;
    }

    // 4 — Pipeline de análisis
    const [rdap, entropy] = await Promise.all([
      queryRdap(domain),
      Promise.resolve(calcEntropy(domain)),
    ]);

    // Score preliminar sin VT para decidir si consultarlo
    const preliminary = calcScore({
      ageDays:      rdap.ageDays,
      entropyScore: entropy.score,
      vtScore:      0,
      tlsScore:     0,
      vtAvailable:  false,
    });

    let vtScore = 0;
    let vtAvailable = false;

    if (preliminary.score >= VT_SCORE_THRESHOLD && VT_API_KEY) {
      const vt = await queryVirusTotal(domain, VT_API_KEY);
      vtScore = vt.score;
      vtAvailable = true;
    }

    // Score final
    const result = calcScore({
      ageDays:      rdap.ageDays,
      entropyScore: entropy.score,
      vtScore,
      tlsScore:     0,           // TLS se añade en fase siguiente
      vtAvailable,
    });

    // 5 — Guardar en caché
    await setCached({
      domain,
      ageDays:       rdap.ageDays,
      entropia:      entropy.value,
      scoreVT:       vtScore,
      scoreTLS:      0,
      scoreFinal:    result.score,
      nivel:         result.level,
      fuenteRdap:    rdap.rdapServer,
      vtActivado:    vtAvailable,
      fechaRegistro: rdap.registrationDate,
      error:         rdap.error,
    });

    // 6 — Actualizar badge
    await updateBadge(
      details.tabId,
      formatDays(rdap.ageDays),
      result.badgeColor
    );

    // 7 — Notificar Content Script si riesgo alto 
    if (result.score >= 50) {
      await notifyContentScript(details.tabId, {
        domain,
        ageDays:    rdap.ageDays,
        scoreFinal: result.score,
        nivel:      result.level,
      });
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'ADD_WHITELIST') {
        import('../utils/cache').then(({ addToWhitelist }) => {
          addToWhitelist(message.domain, 0, 'high');
        });
      }
    });
    console.log(`[SW] ${domain} → score ${result.score} (${result.level}), edad ${rdap.ageDays}d`);
  });
});

// ── Helpers de badge ──────────────────────────────────────────────────────────

async function updateBadge(tabId: number, text: string, color: string) {
  await chrome.action.setBadgeText({ text, tabId });
  await chrome.action.setBadgeBackgroundColor({ color, tabId });
}

function formatDays(ageDays: number | null): string {
  if (ageDays === null)    return '?';
  if (ageDays < 1)         return '<1d';
  if (ageDays > 999)       return '+3y';
  return `${ageDays}d`;
}

function getBadgeColor(nivel: string): string {
  const colors: Record<string, string> = {
    high:     '#C0392B',
    moderate: '#F39C12',
    low:      '#27AE60',
  };
  return colors[nivel] ?? '#555555';
}

// ── Notificación al Content Script ───────────────────────────────────────────

async function notifyContentScript(tabId: number, data: object) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_BANNER', data });
  } catch {
    // El content script puede no estar listo todavía — ignorar silenciosamente
  }
}

// ── VirusTotal (stub — se completa en 6.3.9) ─────────────────────────────────

async function queryVirusTotal(domain: string, apiKey: string): Promise<{ score: number }> {
  // Implementación completa en sección 6.3.9
  return { score: 0 };
}