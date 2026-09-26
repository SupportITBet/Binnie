// src/analytics.js
// ─────────────────────────────────────────────────────
// Fonctions utilitaires pour tracker les conversions
// sur GA4, Meta Pixel et LinkedIn en même temps.
// ─────────────────────────────────────────────────────

// ── GOOGLE ANALYTICS 4 ──────────────────────────────
export const gaEvent = (eventName, params = {}) => {
  if (window.gtag) {
    window.gtag("event", eventName, params);
  }
};

// ── META PIXEL ───────────────────────────────────────
export const metaEvent = (eventName, params = {}) => {
  if (window.fbq) {
    window.fbq("track", eventName, params);
  }
};

// ── LINKEDIN ─────────────────────────────────────────
export const linkedinEvent = (conversionId) => {
  if (window.lintrk) {
    window.lintrk("track", { conversion_id: conversionId });
  }
};

// ── TOUT EN UNE SEULE FONCTION ───────────────────────
export const trackConversion = (eventName, data = {}) => {
  gaEvent(eventName, data);
  metaEvent(eventName, data);
  linkedinEvent(data.linkedinConversionId || null);
};

// ══════════════════════════════════════════════════════
//  ÉVÉNEMENTS PRÉDÉFINIS POUR TON PROJET BET
// ══════════════════════════════════════════════════════

// Quelqu'un soumet le formulaire du test de niveau
export const trackTestStarted = (profile) => {
  gaEvent("test_niveau_start", { profile });
  metaEvent("Lead", { content_name: "test_niveau", profile });
};

// Quelqu'un obtient son résultat
export const trackTestCompleted = (level, score) => {
  gaEvent("test_niveau_complete", { level, score });
  metaEvent("CompleteRegistration", { content_name: "test_niveau", level });
};

// Quelqu'un clique sur "Demander un bilan gratuit"
export const trackBilanRequest = () => {
  gaEvent("bilan_request");
  metaEvent("Contact");
  linkedinEvent("VOTRE_CONVERSION_ID_LINKEDIN");
};

// Quelqu'un se connecte
export const trackLogin = (role) => {
  gaEvent("login", { method: role });
};

// Quelqu'un s'inscrit
export const trackSignup = (role) => {
  gaEvent("sign_up", { method: role });
  metaEvent("CompleteRegistration", { content_name: role });
};

// Quelqu'un consulte un cours
export const trackCourseView = (courseTitle, level) => {
  gaEvent("view_item", {
    item_id: courseTitle,
    item_name: courseTitle,
    item_category: level,
  });
  metaEvent("ViewContent", { content_name: courseTitle, content_category: level });
};

// Quelqu'un s'inscrit à un cours (conversion principale)
export const trackEnrollment = (courseTitle, price) => {
  gaEvent("purchase", {
    transaction_id: Date.now().toString(),
    value: price,
    currency: "XOF",
    items: [{ item_name: courseTitle }],
  });
  metaEvent("Purchase", { value: price, currency: "XOF", content_name: courseTitle });
  linkedinEvent("VOTRE_CONVERSION_ID_LINKEDIN");
};