import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

console.log("✅ Route badges fidélité chargée");

/* ══════════════════════════════════════════════════════════
   Résout la date de début réelle d'un apprenant à partir de son
   utilisateurs.id - via groupes_apprenants (apprenant_id direct, ou
   assignation_id embarqué dans `note` pour les dossiers coaching privé/
   import), en retombant sur assignations_parcours.date_debut_formation.
══════════════════════════════════════════════════════════ */
async function resoudreDateDebutApprenant(apprenantUserId) {
  const dossier = await resoudreDossierApprenant(apprenantUserId);
  return dossier?.date_debut_formation || null;
}

// Variante qui retourne aussi plan_paiement - nécessaire pour vérifier si un mois donné a
// réellement été payé (cf. moisEstPaye), pas seulement le temps écoulé.
async function resoudreDossierApprenant(apprenantUserId) {
  // Ordonné par date_ajout - groupes_apprenants n'a pas de colonne created_at (contrairement
  // à ce que la requête tentait avant : ça la faisait échouer silencieusement, data jamais
  // vérifié ci-dessous, donc /mes-badges retombait toujours sur "aucun dossier" sans erreur
  // visible - c'est ce qui empêchait la galerie de badges de se débloquer côté apprenant,
  // alors que les notifications/emails du cron (qui n'utilise pas cette fonction) partaient
  // bien normalement).
  const { data: gaRows, error: errGa } = await supabase
    .from("groupes_apprenants")
    .select("apprenant_id, note")
    .eq("apprenant_id", apprenantUserId)
    .in("statut", ["actif", "archive"])
    .order("date_ajout", { ascending: true })
    .limit(1);
  if (errGa) { console.error("[resoudreDossierApprenant] groupes_apprenants:", errGa.message); return null; }

  const ga = gaRows?.[0];
  if (!ga) return null;

  let assignationId = null;
  try { assignationId = JSON.parse(ga.note || "{}")?.assignation_id || null; } catch { /* note pas JSON */ }
  if (!assignationId) return null;

  const { data: assignation } = await supabase
    .from("assignations_parcours")
    .select("date_debut_formation, plan_paiement")
    .eq("id", assignationId)
    .maybeSingle();

  return assignation || null;
}

// Un badge n'est considéré "obtenu" que si le mois correspondant est réellement payé - voir
// jobsBadgesFidelite.js pour la même règle appliquée à l'envoi. Si le dossier n'a aucun plan de
// paiement suivi, on ne peut pas vérifier : on retombe sur le calendaire seul (return null).
function moisEstPaye(planPaiement, numeroMois) {
  const moisPaiements = planPaiement?.mois_paiements;
  if (!Array.isArray(moisPaiements) || !moisPaiements.length) return null;
  const entree = moisPaiements[numeroMois - 1];
  if (!entree) return false;
  return entree.statut === "paye";
}

// Nombre de mois réellement réglés sur le plan - c'est CE nombre, pas le temps écoulé, qui
// déclenche les badges : peu importe le retard, dès qu'un versement arrive, tous les paliers
// couverts par le nombre de mois payés sont débloqués d'un coup (rattrapage automatique).
// Retourne null si le dossier n'a aucun plan suivi (impossible de vérifier).
function nombreMoisPayes(planPaiement) {
  const moisPaiements = planPaiement?.mois_paiements;
  if (!Array.isArray(moisPaiements) || !moisPaiements.length) return null;
  return moisPaiements.filter(m => m.statut === "paye").length;
}

// Nombre de mois entiers écoulés depuis une date de début (ancienneté).
function moisEcoules(dateDebut) {
  const debut = new Date(dateDebut);
  const now = new Date();
  let mois = (now.getFullYear() - debut.getFullYear()) * 12 + (now.getMonth() - debut.getMonth());
  if (now.getDate() < debut.getDate()) mois -= 1;
  return Math.max(0, mois + 1); // +1 : le jour de départ compte déjà comme le "1er mois"
}

/* ══════════════════════════════════════════════════════════
   GET /mes-badges - lecture apprenant (onglet Gamification)
   Retourne tous les badges (1-24), avec obtenu:true/false et la date
   d'obtention estimée pour chacun déjà atteint.
══════════════════════════════════════════════════════════ */
router.get("/mes-badges", authenticateUser, async (req, res) => {
  try {
    const dossier = await resoudreDossierApprenant(req.user.id);
    const dateDebut = dossier?.date_debut_formation || null;
    const { data: badges, error } = await supabase
      .from("badges_fidelite")
      .select("id, mois, titre, message, image_url, type_recompense, valeur_recompense")
      .eq("actif", true)
      .order("mois", { ascending: true });
    if (error) throw error;

    // Le palier débloqué est piloté par le nombre de mois réellement payés (rattrapage
    // automatique dès qu'un versement en retard arrive), pas par le temps écoulé - sauf
    // dossier sans plan suivi, où l'on retombe sur le calendaire seul.
    const moisPayes = nombreMoisPayes(dossier?.plan_paiement);
    const anciennete = dateDebut ? moisEcoules(dateDebut) : 0;
    const palierDebloque = moisPayes !== null ? moisPayes : anciennete;
    const resultat = (badges || []).map(b => ({ ...b, obtenu: b.mois <= palierDebloque }));
    res.json({ badges: resultat, anciennete: palierDebloque, date_debut_formation: dateDebut });
  } catch (err) {
    console.error("[badges-fidelite/mes-badges GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   Admin (SuperAdmin) - gestion des 24 badges (message/image modifiables
   sans redéploiement). Réutilise le module de permission "contenus_ressources"
   (même famille que les autres contenus back-office).
══════════════════════════════════════════════════════════ */
router.get("/", authenticateAdmin, requirePermission("contenus_ressources", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("badges_fidelite").select("*").order("mois", { ascending: true });
    if (error) throw error;
    res.json({ badges: data || [] });
  } catch (err) {
    console.error("[badges-fidelite GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.patch("/:id", authenticateAdmin, requirePermission("contenus_ressources", "update"), async (req, res) => {
  try {
    const allowed = ["titre", "message", "image_url", "type_recompense", "valeur_recompense", "actif"];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("badges_fidelite").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ badge: data });
  } catch (err) {
    console.error("[badges-fidelite PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
export { resoudreDateDebutApprenant, resoudreDossierApprenant, moisEcoules, moisEstPaye, nombreMoisPayes };
