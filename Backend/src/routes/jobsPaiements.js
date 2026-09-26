import express from "express";
import supabase from "../config/supabase.js";
import { notifyUser } from "../services/notifyRole.js";
import { dateEcheanceMois, totalPayeMois, estNeutralise, getMoisLabel } from "../services/planPaiement.js";

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Échéance et total payé viennent du service : ils étaient dupliqués ici, dans deux
// dashboards et dans le webhook TouchPoint, avec des comportements déjà divergents.
// La version du service honore `echeance_override`, ce que celle-ci ignorait - un mois
// dont l'échéance avait été déplacée à la main était donc relancé à la mauvaise date.

// Construit exactement le même lien que envoyerLienMois() côté Commercial/PA - un paiement
// réglé via ce lien est déjà su être rattaché au bon mois par le webhook TouchPoint existant
// (mois_id dans ses métadonnées), rien de nouveau à câbler côté paiement en ligne.
const construireLienPaiement = ({ assignation, mois, montant, assistanteId }) => {
  const qs = new URLSearchParams({
    nom: assignation.prospect_nom || "",
    email: assignation.prospect_email || "",
    telephone: assignation.prospect_telephone || "",
    montant: String(montant),
    offre: assignation.inscription_offre || mois.label || "Votre formation",
    assignation_id: assignation.id || "",
    assistante_id: assistanteId || "",
    mois_id: mois.id,
  });
  return `${FRONTEND_URL}/paiement/relancer?${qs.toString()}`;
};

// Retrouve le compte utilisateur (utilisateurs.id, role apprenant) lié à ce dossier - via
// l'assignation_id posé dans groupes_apprenants.note à l'inscription (lien fiable, y compris
// pour un profil enfant où prospect_email est celui du parent, jamais de l'apprenant).
const resoudreApprenantUserId = async (assignationId) => {
  const { data: gaRows } = await supabase
    .from("groupes_apprenants")
    .select("email_apprenant, note")
    .ilike("note", `%"assignation_id":"${assignationId}"%`)
    .limit(1);
  const email = gaRows?.[0]?.email_apprenant;
  if (!email) return null;
  const { data: user } = await supabase
    .from("utilisateurs")
    .select("id")
    .ilike("email", email)
    .eq("role", "apprenant")
    .maybeSingle();
  return user?.id || null;
};

// Une notification par dossier + mois + seuil au maximum - sans ça, le job (quotidien)
// renverrait le même rappel en boucle tant que l'apprenant n'a pas payé.
const dejaNotifie = async (assignationId, periode, seuil, destinataire) => {
  const { data } = await supabase
    .from("notifications")
    .select("id")
    .eq("meta->>assignation_id", assignationId)
    .eq("meta->>periode", periode)
    .eq("meta->>seuil", String(seuil))
    .eq("meta->>destinataire", destinataire)
    .limit(1);
  return (data || []).length > 0;
};

// Résout le compte utilisateur de l'assistante (même pattern que
// notifierEcheancesPaiement.js) - pour qu'elle relance le client de son côté si besoin.
const _assistanteUserIdCache = new Map();
const resoudreAssistanteUserId = async (assistanteId) => {
  if (!assistanteId) return null;
  if (_assistanteUserIdCache.has(assistanteId)) return _assistanteUserIdCache.get(assistanteId);
  const { data: assistante } = await supabase.from("assistantes").select("email").eq("id", assistanteId).maybeSingle();
  let uid = null;
  if (assistante?.email) {
    const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", assistante.email).maybeSingle();
    uid = u?.id || null;
  }
  _assistanteUserIdCache.set(assistanteId, uid);
  return uid;
};

/* ══════════════════════════════════════════════════════════════
   GET /api/jobs/paiements-mensuels - déclenché par un cron externe
   (Vercel Cron ou équivalent), 1×/jour. Protégé par CRON_SECRET.

   Pour chaque dossier avec un plan_paiement.mois_paiements actif
   (coaching privé ET classes de groupe, présentiel comme en ligne,
   sans distinction) :
   1. Backfill jour_echeance si absent (ancien plan créé avant ce
      correctif) - dérivé du jour de date_debut_formation.
   2. Génère le mois suivant automatiquement si le plan est ouvert
      (pas de date_fin_formation) et que le dernier mois généré est
      déjà échu.
   3. Pour chaque mois non soldé : à J-7/J-3/J-1 de son échéance,
      notifie l'apprenant (in-app + lien de paiement TouchPoint,
      déjà existant, réutilisé tel quel) ET la commerciale (assistante_id
      du dossier), pour qu'elle puisse relancer le client de son côté.
   Un dossier annulé (statut="annule") ou dont le plan a été
   explicitement arrêté (plan_paiement.actif===false) est ignoré.
══════════════════════════════════════════════════════════════ */
router.get("/paiements-mensuels", async (req, res) => {
  // Vercel Cron envoie automatiquement "Authorization: Bearer <CRON_SECRET>" quand cette
  // variable d'env est définie sur le projet - on accepte aussi ?secret=/x-cron-secret pour
  // un déclenchement manuel ou un cron externe (autre que Vercel Cron).
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const secret = bearer || req.query.secret || req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const resultat = { traites: 0, ignores: 0, mois_generes: 0, notifications_envoyees: 0, erreurs: [] };

  try {
    const { data: assignations, error } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, prospect_email, prospect_telephone, inscription_offre, statut, assistante_id, plan_paiement")
      .not("plan_paiement", "is", null)
      .not("statut", "eq", "annule");
    if (error) throw error;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    for (const a of (assignations || [])) {
      const plan = a.plan_paiement || {};
      const moisPaiements = plan.mois_paiements || [];
      if (!moisPaiements.length) continue; // pas de plan mensuel sur ce dossier - hors périmètre

      resultat.traites++;
      if (plan.actif === false) { resultat.ignores++; continue; }

      let planModifie = false;
      const nouveauPlan = { ...plan };

      // 1. Backfill jour_echeance pour les plans créés avant ce correctif.
      let jourEcheance = plan.jour_echeance;
      if (!jourEcheance) {
        jourEcheance = plan.date_debut_formation ? new Date(plan.date_debut_formation).getDate() : 1;
        nouveauPlan.jour_echeance = jourEcheance;
        planModifie = true;
      }

      // 2. Génération automatique du mois suivant (plan ouvert uniquement, échéance
      //    passée), plafonnée par sécurité comme le générateur manuel existant.
      let moisActuels = [...moisPaiements];
      if (!plan.date_fin_formation) {
        let garde = 0;
        while (garde < 60) {
          const dernier = moisActuels[moisActuels.length - 1];
          if (!dernier) break;
          const echeanceDernier = dateEcheanceMois(dernier.periode, jourEcheance, dernier.echeance_override);
          if (echeanceDernier >= today) break; // le mois courant est déjà couvert
          const d = new Date(dernier.periode + "-01"); d.setMonth(d.getMonth() + 1);
          const nextPeriode = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          moisActuels.push({ id: `m_${nextPeriode}`, periode: nextPeriode, label: getMoisLabel(nextPeriode), montant: plan.mensualite || 0, statut: "en_attente", tranches: [] });
          planModifie = true;
          resultat.mois_generes++;
          garde++;
        }
        if (garde > 0) nouveauPlan.mois_paiements = moisActuels;
      }

      // 3. Rappels J-7/J-3/J-1 sur chaque mois non soldé.
      for (const mois of moisActuels) {
        // Un mois gelé par une pause ne doit jamais être relancé. Le test de solde
        // ci-dessous y suffirait (montant ramené au déjà-payé, donc 0 >= 0), mais
        // l'expliciter évite qu'une future retouche du montant le réveille par accident.
        if (estNeutralise(mois)) continue;
        if (totalPayeMois(mois) >= mois.montant) continue; // déjà payé, rien à rappeler
        const echeance = dateEcheanceMois(mois.periode, jourEcheance, mois.echeance_override);
        const joursRestants = Math.round((echeance - today) / 86400000);
        if (![7, 3, 1].includes(joursRestants)) continue;

        const montantRestant = Math.max(0, mois.montant - totalPayeMois(mois));
        const lien = construireLienPaiement({ assignation: a, mois, montant: montantRestant, assistanteId: a.assistante_id });
        const dateEcheanceStr = echeance.toLocaleDateString("fr-FR");

        // 3a. Rappel à l'apprenant - inchangé.
        try {
          if (!(await dejaNotifie(a.id, mois.periode, joursRestants, "apprenant"))) {
            const userId = await resoudreApprenantUserId(a.id);
            if (userId) {
              await notifyUser(userId, {
                type: "paiement",
                titre: joursRestants === 1 ? `⏰ Dernier rappel - mensualité due demain` : `💳 Mensualité à venir - ${mois.label}`,
                message: `Votre mensualité de ${Number(montantRestant).toLocaleString("fr-FR")} F (${mois.label}) est due le ${dateEcheanceStr}. Payez directement en ligne : ${lien}`,
                meta: { assignation_id: a.id, periode: mois.periode, seuil: joursRestants, destinataire: "apprenant", lien_paiement: lien },
              });
              resultat.notifications_envoyees++;
            }
          }
        } catch (errNotif) {
          resultat.erreurs.push({ assignation_id: a.id, periode: mois.periode, erreur: errNotif.message });
        }

        // 3b. Même rappel à la commerciale (assistante_id du dossier), à chaque seuil -
        // pour qu'elle puisse relancer le client de son côté si besoin.
        try {
          if (!(await dejaNotifie(a.id, mois.periode, joursRestants, "assistante"))) {
            const assistanteUserId = await resoudreAssistanteUserId(a.assistante_id);
            if (assistanteUserId) {
              await notifyUser(assistanteUserId, {
                type: "paiement",
                titre: joursRestants === 1 ? `⏰ J-1 - mensualité de ${a.prospect_nom}` : `💳 Échéance à venir - ${a.prospect_nom}`,
                message: `La mensualité de ${a.prospect_nom} (${mois.label}, ${Number(montantRestant).toLocaleString("fr-FR")} F) est due le ${dateEcheanceStr} - l'apprenant a été rappelé automatiquement.`,
                meta: { assignation_id: a.id, periode: mois.periode, seuil: joursRestants, destinataire: "assistante" },
              });
              resultat.notifications_envoyees++;
            }
          }
        } catch (errNotif) {
          resultat.erreurs.push({ assignation_id: a.id, periode: mois.periode, erreur: errNotif.message });
        }
      }

      if (planModifie) {
        const { error: errUpdate } = await supabase
          .from("assignations_parcours")
          .update({ plan_paiement: nouveauPlan })
          .eq("id", a.id);
        if (errUpdate) resultat.erreurs.push({ assignation_id: a.id, erreur: errUpdate.message });
      }
    }

    console.log(`[jobsPaiements] ${todayStr} - ${resultat.traites} dossier(s) traité(s), ${resultat.mois_generes} mois généré(s), ${resultat.notifications_envoyees} notification(s) envoyée(s)`);
    res.json(resultat);
  } catch (err) {
    console.error("[jobsPaiements] échec:", err.message);
    res.status(500).json({ error: "Erreur interne", detail: err.message });
  }
});

export default router;
