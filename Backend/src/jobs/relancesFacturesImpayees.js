// Relance quotidienne des factures impayées (bet-elearning, comptabilite_factures) - passe les
// factures en retard, journalise une relance par palier (1x max par palier) et notifie le comptable.
import supabase from "../config/supabase.js";
import { notifyRole, resoudreEmailsParRole } from "../services/notifyRole.js";
import { sendNotificationEmail } from "../services/emailService.js";

const INTERVALLE_MS = 24 * 60 * 60 * 1000; // quotidien

function niveauRetard(jours) {
  if (jours <= 7) return 1;
  if (jours <= 30) return 2;
  return 3;
}

async function relancerFacturesImpayees() {
  try {
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const { data: factures, error } = await supabase
      .from("comptabilite_factures")
      .select("*")
      .in("statut", ["envoyee", "partiellement_payee", "en_retard"])
      .not("date_echeance", "is", null)
      .lt("date_echeance", aujourdHui);
    if (error) { console.error("[relancesFacturesImpayees] lecture factures:", error.message); return; }
    if (!factures?.length) return;

    // Résolu une seule fois - les destinataires (comptable/super admin) ne varient pas par facture.
    const destinataires = await resoudreEmailsParRole(["admin_comptable", "super_admin"]);

    for (const facture of factures) {
      if (facture.statut !== "en_retard") {
        await supabase.from("comptabilite_factures").update({ statut: "en_retard", updated_at: new Date().toISOString() }).eq("id", facture.id);
      }

      const joursRetard = Math.floor((Date.now() - new Date(facture.date_echeance).getTime()) / 86400000);
      const niveau = niveauRetard(joursRetard);

      const { data: dejaRelance } = await supabase.from("comptabilite_relances").select("id")
        .eq("facture_id", facture.id).eq("type", "auto").eq("niveau", niveau).limit(1);
      if (dejaRelance?.length) continue;

      await supabase.from("comptabilite_relances").insert({
        facture_id: facture.id, type: "auto", niveau,
        message: `Relance automatique niveau ${niveau} - facture ${facture.numero} (${facture.client_nom}), ${joursRetard}j de retard`,
      });

      const titre = `🔴 Facture en retard - ${facture.client_nom}`;
      const message = `Facture ${facture.numero} en retard de ${joursRetard} jour(s), ${Number(facture.montant_ttc - facture.montant_paye).toLocaleString("fr-FR")} FCFA restant dû.`;

      await notifyRole(["admin_comptable", "super_admin"], {
        type: "facture_retard",
        titre,
        message,
        meta: { facture_id: facture.id, niveau },
      });

      for (const d of destinataires) {
        sendNotificationEmail({ prenom: d.prenom, email: d.email, titre, message, tag: "facture_impayee" })
          .catch(err => console.error("[relancesFacturesImpayees] email:", err.message));
      }
    }
  } catch (err) {
    console.error("[relancesFacturesImpayees] échec:", err.message);
  }
}

export function demarrerRelancesFacturesImpayees() {
  setTimeout(relancerFacturesImpayees, 90 * 1000);
  setInterval(relancerFacturesImpayees, INTERVALLE_MS);
}
