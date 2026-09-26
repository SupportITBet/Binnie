// Purge les notifications de plus de 45 jours pour ne pas surcharger la base.
import supabase from "../config/supabase.js";

const RETENTION_JOURS = 45;
const UNE_HEURE_MS = 60 * 60 * 1000;

export async function purgerAnciennesNotifications() {
  try {
    const seuil = new Date(Date.now() - RETENTION_JOURS * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from("notifications")
      .delete({ count: "exact" })
      .lt("created_at", seuil);
    if (error) {
      console.error("[cleanupNotifications] erreur :", error.message);
      return;
    }
    if (count) console.log(`🧹 [cleanupNotifications] ${count} notification(s) de plus de ${RETENTION_JOURS}j supprimée(s)`);
  } catch (err) {
    console.error("[cleanupNotifications] erreur :", err.message);
  }
}

export function demarrerPurgeNotifications() {
  purgerAnciennesNotifications();
  setInterval(purgerAnciennesNotifications, 24 * UNE_HEURE_MS);
}
