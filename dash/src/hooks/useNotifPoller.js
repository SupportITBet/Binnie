import { useEffect, useRef } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";

const API_URL  = process.env.REACT_APP_API_URL || "http://localhost:5001";
const authHdrs = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
});

// ── Son identique à useFirebaseChat ──────────────────────────────────────────
function playNotifSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {}
}

function showBrowserNotif(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  const n = new Notification(title, { body, icon: "/favicon.ico", tag: title, renotify: true });
  n.onclick = () => { window.focus(); n.close(); };
}

// ── Écrire une notif dans Firestore (idempotent par eventId) ─────────────────
async function writeNotif(userId, eventId, payload) {
  try {
    await setDoc(
      doc(db, "notifications", userId, "items", eventId),
      { ...payload, lu: false, createdAt: serverTimestamp() },
      { merge: true }   // ne pas écraser lu:true si déjà marqué lu
    );
  } catch {}
}

// ── Clé localStorage pour les IDs déjà traités ───────────────────────────────
const seenKey = (userId, type) => `bet_notif_seen_${userId}_${type}`;

function getSeenIds(userId, type) {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(userId, type)) || "[]")); }
  catch { return new Set(); }
}

function addSeenId(userId, type, id) {
  const seen = getSeenIds(userId, type);
  seen.add(id);
  // Garder au plus 200 IDs pour ne pas saturer localStorage
  const arr = [...seen].slice(-200);
  localStorage.setItem(seenKey(userId, type), JSON.stringify(arr));
}

// ════════════════════════════════════════════════════════════════════════════
//  HOOK PRINCIPAL
//  Paramètres :
//    userId  - ID de l'utilisateur connecté
//    sources - tableau des sources à surveiller :
//              "tests"    → niveau tests reçus (commercial)
//              "contacts" → messages contact (commercial)
//              "inscriptions" → nouvelles inscriptions (gestionnaire / responsable)
//    interval - intervalle en ms (défaut : 30 000)
// ════════════════════════════════════════════════════════════════════════════
export function useNotifPoller({ userId, sources = [], interval = 30_000 }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!userId) return;

    const poll = async () => {
      await Promise.allSettled(sources.map(src => fetchSource(userId, src)));
    };

    poll(); // premier appel immédiat
    timerRef.current = setInterval(poll, interval);
    return () => clearInterval(timerRef.current);
  }, [userId, sources.join(","), interval]); // eslint-disable-line
}

// ── Fetchers par source ───────────────────────────────────────────────────────
async function fetchSource(userId, source) {
  try {
    switch (source) {
      case "tests":        return await pollTests(userId);
      case "contacts":     return await pollContacts(userId);
      case "inscriptions": return await pollInscriptions(userId);
      case "assignations": return await pollAssignations(userId);
      default: break;
    }
  } catch {}
}

// Tests de niveau reçus
async function pollTests(userId) {
  const res = await fetch(`${API_URL}/api/level-test/all`, { headers: authHdrs() });
  if (!res.ok) return;
  const { results } = await res.json();
  if (!Array.isArray(results)) return;

  const seen = getSeenIds(userId, "tests");
  for (const r of results) {
    const id = String(r.id);
    if (seen.has(id)) continue;
    addSeenId(userId, "tests", id);
    if (seen.size === 0) continue; // premier chargement - ne pas tout notifier

    const nom = r.fullname || r.email || "Prospect";
    const niveau = r.level || "-";
    const payload = {
      type:  "test",
      icon:  "📝",
      titre: "Nouveau test de niveau",
      corps: `${nom} · Niveau ${niveau} · Score ${r.score || 0}%`,
      link:  "/commercial-dashboard",
      meta:  { email: r.email, level: r.level, score: r.score },
    };
    await writeNotif(userId, `test_${id}`, payload);
    playNotifSound();
    showBrowserNotif("📝 Nouveau test de niveau", `${nom} a obtenu le niveau ${niveau}`);
    window.dispatchEvent(new CustomEvent("bet:test:new", { detail: r }));
  }
}

// Messages contact reçus
async function pollContacts(userId) {
  const res = await fetch(`${API_URL}/api/contact/mes-clients`, { headers: authHdrs() });
  if (!res.ok) return;
  const { contacts } = await res.json();
  if (!Array.isArray(contacts)) return;

  const seen = getSeenIds(userId, "contacts");
  for (const c of contacts) {
    const id = String(c.id);
    if (seen.has(id)) continue;
    addSeenId(userId, "contacts", id);
    if (seen.size === 0) continue;

    const payload = {
      type:  "contact",
      icon:  "✉️",
      titre: "Nouveau message reçu",
      corps: `${c.nom} · ${c.sujet || "sans sujet"}`,
      link:  "/commercial-dashboard",
      meta:  { email: c.email, sujet: c.sujet },
    };
    await writeNotif(userId, `contact_${id}`, payload);
    playNotifSound();
    showBrowserNotif("✉️ Nouveau message", `${c.nom} : ${c.sujet || c.message?.slice(0, 60) || ""}`);
  }
}

// Assignations parcours (commercial)
async function pollAssignations(userId) {
  const res = await fetch(`${API_URL}/api/parcours/assignations/recentes`, { headers: authHdrs() });
  if (!res.ok) return;
  const { assignations } = await res.json();
  if (!Array.isArray(assignations)) return;

  const seen = getSeenIds(userId, "assignations");
  for (const a of assignations) {
    const id = String(a.id);
    if (seen.has(id)) continue;
    addSeenId(userId, "assignations", id);
    if (seen.size === 0) continue;

    const typeCours = a.type_cours === "en_ligne" ? "En ligne" : "Présentiel";
    const coaching  = a.type_coaching ? ` · ${a.type_coaching}` : "";
    const payload = {
      type:  "assignation",
      icon:  "🎯",
      titre: "Nouveau prospect assigné",
      corps: `${a.prospect_nom} → ${a.assistante_nom} · ${typeCours}${coaching}`,
      link:  "/commercial-dashboard",
      meta:  { prospect: a.prospect_nom, assistante: a.assistante_nom, type_cours: a.type_cours },
    };
    await writeNotif(userId, `assignation_${id}`, payload);
    playNotifSound();
    showBrowserNotif("🎯 Nouveau prospect", `${a.prospect_nom} a choisi ${a.assistante_nom}`);
    window.dispatchEvent(new CustomEvent("bet:assignation:new", { detail: a }));
  }
}

// Inscriptions (gestionnaire / responsable)
async function pollInscriptions(userId) {
  const res = await fetch(`${API_URL}/api/inscriptions/recentes`, { headers: authHdrs() });
  if (!res.ok) return;
  const { inscriptions } = await res.json();
  if (!Array.isArray(inscriptions)) return;

  const seen = getSeenIds(userId, "inscriptions");
  for (const ins of inscriptions) {
    const id = String(ins.id);
    if (seen.has(id)) continue;
    addSeenId(userId, "inscriptions", id);
    if (seen.size === 0) continue;

    const payload = {
      type:  "inscription",
      icon:  "✅",
      titre: "Nouvelle inscription",
      corps: `${ins.nom || ins.email} · ${ins.offre || "Formation"}`,
      link:  "/gestionnaire-dashboard",
      meta:  { email: ins.email, offre: ins.offre },
    };
    await writeNotif(userId, `inscription_${id}`, payload);
    playNotifSound();
    showBrowserNotif("✅ Nouvelle inscription", `${ins.nom || ins.email} vient de s'inscrire`);
  }
}
