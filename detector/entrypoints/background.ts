import { parse } from 'tldts';
import { queryRdap, fetchWithTimeout } from '../utils/rdap';
import { calcEntropy } from '../utils/entropy';
import { calcScore } from '../utils/scoring';
import { getCached, setCached, isWhitelisted, addToWhitelist } from '../utils/cache';

const VT_SCORE_THRESHOLD = 45;
const VT_API_KEY = import.meta.env.WXT_VT_API_KEY ?? '';

export default defineBackground(() => {
  // ── Listener de navegación ────────────────────────────────────────────────
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    const url = details.url;
    if (!url.startsWith('http')) return;

    // 1 — Extraer eTLD+1
    const parsed = parse(url);
    const domain = parsed?.domain;
    if (!domain) return;

    // 2 — Comprobar whitelist
    const whitelisted = await isWhitelisted(domain);
    if (whitelisted) {
      await updateBadge(details.tabId, '✓', '#555555');
      return;
    }

    // 3 — Consultar caché
    const cached = await getCached(domain);
    if (cached) {
      await updateBadge(details.tabId, formatDays(cached.ageDays), getBadgeColor(cached.nivel));
      if (cached.scoreFinal >= 50) await notifyContentScript(details.tabId, cached);
      return;
    }

    // 4 — Pipeline de análisis
    const [rdap, entropy] = await Promise.all([
      queryRdap(domain),
      Promise.resolve(calcEntropy(domain)),
    ]);

    // Score preliminar para decidir si activar VT
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
      tlsScore:     0,
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
    await updateBadge(details.tabId, formatDays(rdap.ageDays), result.badgeColor);

    // 7 — Banner si score alto o crítico
    if (result.score >= 50) {
      await notifyContentScript(details.tabId, {
        domain,
        ageDays:    rdap.ageDays,
        scoreFinal: result.score,
        nivel:      result.level,
      });
    }

    console.log(`[SW] ${domain} → score ${result.score} (${result.level}), edad ${rdap.ageDays}d`);
  });

  // ── Listener de mensajes del Content Script ───────────────────────────────
  // Registrado UNA sola vez fuera del listener de navegación
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'ADD_WHITELIST') {
      addToWhitelist(message.domain, 0, 'high');
    }
  });
});

// ── Helpers de badge ──────────────────────────────────────────────────────────

async function updateBadge(tabId: number, text: string, color: string) {
  await chrome.action.setBadgeText({ text, tabId });
  await chrome.action.setBadgeBackgroundColor({ color, tabId });
}

function formatDays(ageDays: number | null): string {
  if (ageDays === null) return '?';
  if (ageDays < 1)     return '<1d';
  if (ageDays > 999)   return '+3y';
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
    // Content script puede no estar listo — ignorar
  }
}

// ── VirusTotal ────────────────────────────────────────────────────────────────

async function queryVirusTotal(domain: string, apiKey: string): Promise<{ score: number }> {
  try {
    const res = await fetchWithTimeout(
      `https://www.virustotal.com/api/v3/domains/${domain}`,
      4000,
      { 'x-apikey': apiKey }
    );

    if (!res.ok) {
      console.warn(`[VT] HTTP ${res.status} para ${domain}`);
      return { score: 0 };
    }

    const json = await res.json();
    const stats = json?.data?.attributes?.last_analysis_stats;
    if (!stats) return { score: 0 };

    const malicious  = stats.malicious  ?? 0;
    const suspicious = stats.suspicious ?? 0;
    const total      = malicious + suspicious;

    let score = 0;
    if      (total > 5) score = 100;
    else if (total > 2) score = 60;
    else if (total > 0) score = 25;

    console.log(`[VT] ${domain} → malicious: ${malicious}, suspicious: ${suspicious}, score: ${score}`);
    return { score };

  } catch (err) {
    console.warn('[VT] Error:', err);
    return { score: 0 };
  }
}