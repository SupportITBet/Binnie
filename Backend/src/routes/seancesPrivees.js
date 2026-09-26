import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { clotureSeance } from "./seances.js";
import { notifyUser } from "../services/notifyRole.js";

const router = express.Router();

// Résout l'utilisateur apprenant lié à une assignation privée - via apprenant_id direct s'il
// existe, sinon via prospect_email (souvent le seul lien fiable, cf. audit notifications de
// cette session : apprenant_id est fréquemment null sur les dossiers privés).
async function resolveApprenantUserId(assignation_id) {
  if (!assignation_id) return null;
  const { data: asg } = await supabase
    .from("assignations_parcours")
    .select("apprenant_id, prospect_email")
    .eq("id", assignation_id)
    .maybeSingle();
  if (asg?.apprenant_id) return asg.apprenant_id;
  if (asg?.prospect_email) {
    const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", asg.prospect_email).maybeSingle();
    if (u?.id) return u.id;
  }
  return null;
}

// GET /api/seances-privees?assignation_id=xxx
router.get("/", authenticateAdmin, async (req, res) => {
  const { assignation_id, contrat_prive_id } = req.query;
  if (!assignation_id && !contrat_prive_id)
    return res.status(400).json({ error: "assignation_id ou contrat_prive_id requis" });

  let q = supabase
    .from("seances_privees")
    .select("*")
    .order("date_seance", { ascending: false });

  if (assignation_id)   q = q.eq("assignation_id", assignation_id);
  if (contrat_prive_id) q = q.eq("contrat_prive_id", contrat_prive_id);

  const { data, error } = await q;
  if (error) { console.error("[seances-privees GET]", error.message); return res.status(500).json({ error: error.message }); }
  res.json({ seances: data || [] });
});

// POST /api/seances-privees
router.post("/", authenticateAdmin, async (req, res) => {
  const {
    assignation_id, contrat_prive_id,
    date_seance, heure_debut, duree_h, lieu,
    type_cours, niveau, notes,
  } = req.body;

  if (!date_seance) return res.status(400).json({ error: "date_seance requis" });
  const coach_id = req.profil?.id;
  if (!coach_id) return res.status(401).json({ error: "Profil coach introuvable" });

  // Récupérer grade du coach
  const { data: coachData } = await supabase
    .from("utilisateurs").select("coach_info").eq("id", coach_id).single();
  const gradeCoach = coachData?.coach_info?.type_contrat || "Vacataire";

  // Titre - dérivé de l'apprenant du contrat privé si possible, sinon générique.
  // `seances.titre` est NOT NULL en base : son absence ici faisait échouer 100% des
  // insertions dans `seances` (silencieusement, via le .catch() plus bas), ce qui
  // explique pourquoi la table restait vide malgré de vraies séances privées effectuées.
  let titrePrive = "Séance privée";
  if (contrat_prive_id) {
    const { data: contrat } = await supabase.from("contrats_prives").select("apprenant_nom, apprenant_prenom").eq("id", contrat_prive_id).maybeSingle();
    if (contrat?.apprenant_nom) titrePrive = `Séance privée - ${contrat.apprenant_prenom || ""} ${contrat.apprenant_nom}`.trim();
  }

  // Créer la séance unifiée
  const { data: seanceUnif, error: eSeanceUnif } = await supabase.from("seances").insert({
    circuit:          "prive",
    coach_id,
    assignation_id:   assignation_id   || null,
    contrat_prive_id: contrat_prive_id || null,
    titre:            titrePrive,
    date_seance,
    heure_debut:      heure_debut || null,
    duree_h:          parseFloat(duree_h) || 1.5,
    lieu:             lieu || null,
    type_cours:       type_cours || "en_ligne",
    niveau:           niveau || null,
    grade_coach:      gradeCoach,
    notes:            notes || null,
    statut:           "planifiee",
  }).select().single();
  if (eSeanceUnif) console.error("[seances-privees POST] échec création séance unifiée:", eSeanceUnif.message);

  // Créer dans la table legacy (rétrocompatibilité)
  const legacyPayload = {
    assignation_id:   assignation_id   || null,
    contrat_prive_id: contrat_prive_id || null,
    coach_id,
    date_seance,
    heure_debut:      heure_debut || null,
    duree_h:          parseFloat(duree_h) || 1.5,
    lieu:             lieu || null,
    statut:           "planifiee",
    notes:            notes || null,
  };
  const seanceUnifId = seanceUnif?.data?.id || null;
  if (seanceUnifId) legacyPayload.seance_id = seanceUnifId;

  let { data, error } = await supabase.from("seances_privees").insert(legacyPayload).select().single();

  // Si seance_id n'existe pas encore (migration pas lancée), on réessaie sans
  if (error && error.message?.includes("seance_id")) {
    delete legacyPayload.seance_id;
    const retry = await supabase.from("seances_privees").insert(legacyPayload).select().single();
    data  = retry.data;
    error = retry.error;
  }

  if (error) { console.error("[seances-privees POST]", error.message); return res.status(500).json({ error: error.message }); }

  // Awaité avant la réponse - sur Vercel, une fonction serverless est gelée dès la réponse
  // envoyée, donc un envoi déclenché après res.json() n'a pas la garantie de partir.
  try {
    const uid = await resolveApprenantUserId(assignation_id);
    if (uid) {
      await notifyUser(uid, {
        type: "cours",
        titre: "📅 Nouvelle séance programmée",
        message: `Votre coach a programmé une séance le ${date_seance}${heure_debut ? ` à ${heure_debut}` : ""}.`,
        meta: { assignation_id, seance_id: seanceUnifId },
      }).catch(() => {});
    }
  } catch {}

  res.status(201).json({ seance: data, seance_unif_id: seanceUnif?.data?.id || null });
});

// PATCH /api/seances-privees/:id
// Quand statut passe à "effectuee" → clôturer la séance unifiée aussi
router.patch("/:id", authenticateAdmin, async (req, res) => {
  const allowed = ["statut", "notes", "date_seance", "heure_debut", "duree_h", "lieu"];
  const updates = { updated_at: new Date().toISOString() };
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const { data, error } = await supabase
    .from("seances_privees").update(updates).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Si on passe à "effectuee", clôturer la séance unifiée liée - appel direct de la fonction
  // (un fetch vers son propre localhost ne fonctionne jamais en serverless/Vercel, cf. le même
  // bug déjà corrigé côté coachs.js cette session : la clôture échouait silencieusement en prod).
  if (req.body.statut === "effectuee" && data.seance_id) {
    clotureSeance(data.seance_id, { statut: "realisee" }).catch(e =>
      console.warn("[seances-privees PATCH] clôture séance liée échouée:", e.message)
    );
  }

  res.json({ seance: data });
});

// DELETE /api/seances-privees/:id
router.delete("/:id", authenticateAdmin, requirePermission("classes","delete"), async (req, res) => {
  await supabase.from("seances_privees").delete().eq("id", req.params.id);
  res.json({ ok: true });
});

export default router;
