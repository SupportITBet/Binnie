// Envoi des campagnes newsletter programmées - en production, Vercel Cron déclenche
// GET /api/jobs/newsletter-programmee toutes les 15 min. Mais ce cron ne s'exécute que sur
// Vercel : en local (node src/server.js), rien ne le déclenche automatiquement. Ce job
// reproduit donc la même vérification ici, uniquement pour le serveur persistant local.
import supabase from "../config/supabase.js";
import { envoyerCampagneParId } from "../routes/newsletter.js";

const INTERVALLE_MS = 60 * 1000; // 1 min

async function envoyerCampagnesDues() {
  try {
    const { data: campagnes, error } = await supabase
      .from("newsletter_campagnes")
      .select("id")
      .eq("statut", "programmee")
      .lte("date_programmee", new Date().toISOString());
    if (error) { console.error("[envoyerCampagnesProgrammees] lecture:", error.message); return; }
    if (!campagnes?.length) return;

    for (const c of campagnes) {
      try {
        await envoyerCampagneParId(c.id);
        console.log(`[envoyerCampagnesProgrammees] campagne ${c.id} envoyée`);
      } catch (err) {
        console.error(`[envoyerCampagnesProgrammees] échec campagne ${c.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[envoyerCampagnesProgrammees] échec:", err.message);
  }
}

export function demarrerEnvoiCampagnesProgrammees() {
  setInterval(envoyerCampagnesDues, INTERVALLE_MS);
}
