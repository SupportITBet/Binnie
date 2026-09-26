// Relance marketing quotidienne - notifie l'assistante marketing pour chaque fiche
// suivis_marketing dont la date de prochaine relance est dépassée.
import supabase from "../config/supabase.js";
import { notifyRole } from "../services/notifyRole.js";

const INTERVALLE_MS = 24 * 60 * 60 * 1000; // quotidien

async function relancerSuivisMarketing() {
  try {
    const now = new Date().toISOString();
    const { data: suivis, error } = await supabase
      .from("suivis_marketing")
      .select("id, nom, statut, prochaine_relance_at")
      .not("prochaine_relance_at", "is", null)
      .lt("prochaine_relance_at", now)
      .not("statut", "in", "(perdu,ambassadeur)");
    if (error) { console.error("[relancesMarketing] lecture suivis:", error.message); return; }
    if (!suivis?.length) return;

    for (const s of suivis) {
      await notifyRole("marketing", {
        type: "relance_marketing",
        titre: `📣 Relance à faire - ${s.nom}`,
        message: `La relance prévue pour ${s.nom} est arrivée à échéance.`,
        meta: { suivi_id: s.id },
      });
    }
  } catch (err) {
    console.error("[relancesMarketing] échec:", err.message);
  }
}

export function demarrerRelancesMarketing() {
  setTimeout(relancerSuivisMarketing, 90 * 1000);
  setInterval(relancerSuivisMarketing, INTERVALLE_MS);
}
