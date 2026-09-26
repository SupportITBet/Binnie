// Vérification quotidienne des tranches de paiement (assignations_parcours.plan_paiement)
// dont l'échéance approche (≤30 jours) ou est dépassée - notifie l'assistante commerciale
// propriétaire du dossier. Complète la notification envoyée à la création d'une tranche
// (routes/parcours.js PATCH /assignations/:id) : celle-ci ne couvre que l'instant de l'ajout,
// pas les tranches ajoutées longtemps à l'avance qui deviennent "proches" avec le temps.
import supabase from "../config/supabase.js";
import { notifyUser } from "../services/notifyRole.js";
import { sendNotificationEmail } from "../services/emailService.js";

const INTERVALLE_MS = 24 * 60 * 60 * 1000; // quotidien

function niveauEcheance(joursRestants) {
  if (joursRestants < 0) return "retard";
  if (joursRestants <= 7) return "urgent";
  return "proche"; // 8 à 30 jours
}

async function notifierEcheancesPaiement() {
  try {
    const { data: assignations, error } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, assistante_id, plan_paiement")
      .not("plan_paiement", "is", null);
    if (error) { console.error("[notifierEcheancesPaiement] lecture assignations:", error.message); return; }
    if (!assignations?.length) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const assistanteUserIdCache = new Map();

    for (const a of assignations) {
      const tranches = a.plan_paiement?.tranches || [];
      const enAttente = tranches.filter(t => t.statut === "en_attente" && t.date_echeance);
      if (!enAttente.length || !a.assistante_id) continue;

      for (const t of enAttente) {
        const echeance = new Date(t.date_echeance); echeance.setHours(0, 0, 0, 0);
        const joursRestants = Math.ceil((echeance - today) / 86400000);
        if (joursRestants > 30) continue;
        const niveau = niveauEcheance(joursRestants);

        // Une seule notification par palier (retard / urgent / proche) et par tranche -
        // évite de re-notifier chaque jour pour la même échéance.
        const { data: dejaNotifie } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "paiement")
          .eq("meta->>tranche_id", t.id)
          .eq("meta->>niveau", niveau)
          .limit(1);
        if (dejaNotifie?.length) continue;

        if (!assistanteUserIdCache.has(a.assistante_id)) {
          const { data: assistante } = await supabase
            .from("assistantes").select("email, prenom").eq("id", a.assistante_id).maybeSingle();
          let uid = null;
          if (assistante?.email) {
            const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", assistante.email).maybeSingle();
            uid = u?.id || null;
          }
          assistanteUserIdCache.set(a.assistante_id, { uid, email: assistante?.email || null, prenom: assistante?.prenom || "" });
        }
        const assistanteInfo = assistanteUserIdCache.get(a.assistante_id);
        if (!assistanteInfo?.uid) continue;

        const titre = joursRestants < 0 ? `🚨 Échéance dépassée - ${a.prospect_nom}` : `⏰ Échéance proche - ${a.prospect_nom}`;
        const message = joursRestants < 0
          ? `La tranche "${t.label}" de ${a.prospect_nom} est en retard de ${Math.abs(joursRestants)} jour(s).`
          : `La tranche "${t.label}" de ${a.prospect_nom} arrive à échéance dans ${joursRestants} jour(s).`;

        await notifyUser(assistanteInfo.uid, {
          type:    "paiement",
          titre,
          message,
          meta:    { assignation_id: a.id, prospect_nom: a.prospect_nom, tranche_id: t.id, date_echeance: t.date_echeance, niveau },
          source:  "dash",
        });

        if (assistanteInfo.email) {
          sendNotificationEmail({ prenom: assistanteInfo.prenom, email: assistanteInfo.email, titre, message, tag: "echeance_paiement" })
            .catch(err => console.error("[notifierEcheancesPaiement] email:", err.message));
        }
      }
    }
  } catch (err) {
    console.error("[notifierEcheancesPaiement] échec:", err.message);
  }
}

export function demarrerNotificationEcheancesPaiement() {
  setTimeout(notifierEcheancesPaiement, 90 * 1000);
  setInterval(notifierEcheancesPaiement, INTERVALLE_MS);
}
