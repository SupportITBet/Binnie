import express from "express";
import supabase from "../config/supabase.js";
import { notifyUser } from "../services/notifyRole.js";
import { sendBadgeFideliteEmail } from "../services/emailService.js";
import { moisEcoules, nombreMoisPayes } from "./badgesFidelite.js";

const router = express.Router();

/* ══════════════════════════════════════════════════════════════
   GET /api/jobs/badges-fidelite - déclenché par un cron externe (Vercel
   Cron ou équivalent), 1×/jour. Protégé par CRON_SECRET (même secret que
   jobsPaiements.js).

   Pour chaque apprenant actif ayant une date de début réelle : calcule son
   ancienneté en mois, et si elle correspond exactement à un badge (1 à 24)
   pas encore notifié, envoie une notification in-app + un email (Brevo).
   La gratuité/réduction associée à un badge n'est JAMAIS appliquée
   automatiquement sur le plan de paiement - seulement mentionnée dans le
   message, à la commerciale d'agir manuellement (décision confirmée avant
   implémentation).
══════════════════════════════════════════════════════════════ */
router.get("/badges-fidelite", async (req, res) => {
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const secret = bearer || req.query.secret || req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const resultat = { apprenants_traites: 0, badges_envoyes: 0, erreurs: [] };

  try {
    const { data: badges, error: errBadges } = await supabase
      .from("badges_fidelite")
      .select("id, mois, message, image_url, type_recompense, valeur_recompense")
      .eq("actif", true);
    if (errBadges) throw errBadges;
    const badgeParMois = new Map((badges || []).map(b => [b.mois, b]));
    if (!badgeParMois.size) return res.json(resultat);

    // Un apprenant par ligne groupes_apprenants active/archivée, avec l'assignation liée via
    // `note` (assignation_id) - même pattern que resoudreDateDebutApprenant côté route, mais
    // en lot ici pour tout traiter en une seule passe au lieu d'un appel par apprenant.
    const { data: gaRows, error: errGa } = await supabase
      .from("groupes_apprenants")
      .select("apprenant_id, note")
      .not("apprenant_id", "is", null)
      .in("statut", ["actif", "archive"]);
    if (errGa) throw errGa;

    const assignationIdParApprenant = new Map();
    for (const ga of gaRows || []) {
      if (assignationIdParApprenant.has(ga.apprenant_id)) continue; // garde la 1ère trouvée
      try {
        const assignationId = JSON.parse(ga.note || "{}")?.assignation_id;
        if (assignationId) assignationIdParApprenant.set(ga.apprenant_id, assignationId);
      } catch { /* note pas JSON - ignoré */ }
    }
    if (!assignationIdParApprenant.size) return res.json(resultat);

    // Pas de filtre sur date_debut_formation ici : certains dossiers n'ont cette date que dans
    // plan_paiement.date_debut_formation (JSON), jamais reportée sur la colonne de l'assignation
    // elle-même - un dossier piloté par le nombre de mois payés (le cas normal désormais) n'a
    // donc pas besoin de cette colonne pour débloquer ses badges.
    const { data: assignations, error: errAsg } = await supabase
      .from("assignations_parcours")
      .select("id, date_debut_formation, plan_paiement")
      .in("id", [...new Set(assignationIdParApprenant.values())]);
    if (errAsg) throw errAsg;
    const dossierParAssignation = new Map((assignations || []).map(a => [a.id, a]));

    // Le déclencheur est le PAIEMENT, pas le calendrier : le palier débloqué = nombre de mois
    // réellement réglés sur le plan (mois_paiements.statut === "paye"). Peu importe le retard -
    // dès qu'un versement arrive, tous les paliers couverts sont rattrapés d'un coup dans cette
    // même passe (décision produit du 2026-09-03). Fallback calendaire uniquement si le dossier
    // n'a aucun plan de paiement suivi.
    for (const [apprenantId, assignationId] of assignationIdParApprenant) {
      const dossier = dossierParAssignation.get(assignationId);
      if (!dossier) continue;
      resultat.apprenants_traites++;

      const moisPayes = nombreMoisPayes(dossier.plan_paiement);
      const palierDebloque = moisPayes !== null ? moisPayes : (dossier.date_debut_formation ? moisEcoules(dossier.date_debut_formation) : 0);
      if (!palierDebloque) continue;

      // Rattrapage : tous les badges de 1 à palierDebloque pas encore envoyés, pas seulement
      // le palier du jour.
      for (let n = 1; n <= palierDebloque; n++) {
        const badge = badgeParMois.get(n);
        if (!badge) continue;

        try {
          const { data: dejaEnvoye } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", apprenantId)
            .eq("meta->>badge_mois", String(n))
            .limit(1);
          if (dejaEnvoye?.length) continue; // déjà notifié pour ce mois précis

          const { data: userRow } = await supabase.from("utilisateurs").select("email, prenom, nom").eq("id", apprenantId).maybeSingle();

          await notifyUser(apprenantId, {
            type: "badge_fidelite",
            titre: `🏅 ${n}e mois avec BET !`,
            message: badge.message,
            meta: { badge_mois: n, image_url: badge.image_url, type_recompense: badge.type_recompense, valeur_recompense: badge.valeur_recompense },
          });
          resultat.badges_envoyes++;

          if (userRow?.email) {
            try {
              await sendBadgeFideliteEmail({
                prenom: userRow.prenom || "",
                email: userRow.email,
                mois: n,
                message: badge.message,
                imageUrl: badge.image_url,
                typeRecompense: badge.type_recompense,
                valeurRecompense: badge.valeur_recompense,
              });
            } catch (errMail) {
              resultat.erreurs.push({ apprenant_id: apprenantId, badge_mois: n, etape: "email", erreur: errMail.message });
            }
          }
        } catch (errApp) {
          resultat.erreurs.push({ apprenant_id: apprenantId, badge_mois: n, erreur: errApp.message });
        }
      }
    }

    console.log(`[jobsBadgesFidelite] ${resultat.apprenants_traites} apprenant(s) traité(s), ${resultat.badges_envoyes} badge(s) envoyé(s)`);
    res.json(resultat);
  } catch (err) {
    console.error("[jobsBadgesFidelite] échec:", err.message);
    res.status(500).json({ error: "Erreur interne", detail: err.message });
  }
});

export default router;
