/* ─────────────────────────────────────────────────
   UTM Tracker - capture la source d'acquisition
   Stocke dans sessionStorage pour toute la visite.
   Appeler captureUTM() au démarrage de l'app.
───────────────────────────────────────────────── */

const KEY        = "bet_utm";
const TRACKED_KEY = "bet_utm_tracked"; // évite de tracker 2x la même session
const API         = process.env.REACT_APP_API_URL || "http://localhost:5001";

export function captureUTM() {
  const params   = new URLSearchParams(window.location.search);
  const source   = params.get("utm_source")   || null;
  const medium   = params.get("utm_medium")   || null;
  const campaign = params.get("utm_campaign") || null;
  const content  = params.get("utm_content")  || null;
  const page     = window.location.pathname;

  if (source) {
    const utm = { source, medium, campaign, content, captured_at: new Date().toISOString() };
    sessionStorage.setItem(KEY, JSON.stringify(utm));

    // Envoyer le ping de visite une seule fois par session
    if (!sessionStorage.getItem(TRACKED_KEY)) {
      sessionStorage.setItem(TRACKED_KEY, "1");
      fetch(`${API}/api/sondage/track-visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utm_source: source, utm_medium: medium, utm_campaign: campaign, page }),
      }).catch(() => {}); // silencieux - ne jamais bloquer l'UX
    }
  } else if (!sessionStorage.getItem(KEY)) {
    sessionStorage.setItem(KEY, JSON.stringify({ source: "direct", medium: null, campaign: null, content: null, captured_at: new Date().toISOString() }));
  }
}

export function getUTM() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch { return null; }
}
