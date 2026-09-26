// Envoi des campagnes newsletter programmées.
//
// C'EST LE MÉCANISME DE PRODUCTION depuis la migration sur le VPS : le processus y reste en
// vie, donc cette minuterie tourne réellement. La route GET /api/jobs/newsletter-programmee
// fait la même chose et existait pour Vercel, où rien ne survivait entre deux requêtes ; elle
// est conservée pour un déclenchement manuel, mais AUCUN cron ne doit l'appeler ici - ce
// serait un second déclencheur sur la même file.
import supabase from "../config/supabase.js";
import { envoyerCampagneParId } from "../routes/newsletter.js";

const INTERVALLE_MS = 60 * 1000; // 1 min

// `setInterval` ne patiente pas que la passe précédente ait fini : sur une campagne de 2 000
// adresses qui met trois minutes à partir, il en lancerait trois. Ce drapeau garde une seule
// passe en vol à la fois. `envoyerCampagneParId` réserve en plus chaque campagne côté base -
// deux protections pour deux risques distincts : celui-ci empêche l'empilement des passes,
// l'autre couvre les envois qui ne viennent pas d'ici (route manuelle, double-clic).
let enCours = false;

async function envoyerCampagnesDues() {
  if (enCours) return;
  enCours = true;
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
  } finally {
    // `finally` et non une affectation en fin de bloc : les deux `return` précoces ci-dessus
    // (erreur de lecture, aucune campagne due) laisseraient sinon le drapeau levé pour de bon,
    // et la minuterie ne repartirait plus jamais.
    enCours = false;
  }
}

export function demarrerEnvoiCampagnesProgrammees() {
  setInterval(envoyerCampagnesDues, INTERVALLE_MS);
}
