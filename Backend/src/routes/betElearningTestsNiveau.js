// Routes bibliothèque de tests de niveau + résultats - BET E-Learning uniquement.
// ⚠️ Distinctes de /api/level-test (utilisées par dash) : les deux plateformes
// doivent rester dissociées, ces routes/tables sont propres à bet-elearning.
import { Router } from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = Router();

function mapTest(t) {
  if (!t) return null;
  return {
    id: t.id, titre: t.titre, type: t.type, niveau: t.niveau,
    dureeMin: t.duree_min, tranche_cible: t.tranche_cible,
    questions: t.questions || [], ressourceUrl: t.ressource_url,
    speakType: t.speak_type, speakConsigne: t.speak_consigne, speakAudioUrl: t.speak_audio_url,
    speakTextePassage: t.speak_texte_passage, speakTip: t.speak_tip, speakNiveau: t.speak_niveau,
    speakPrepTime: t.speak_prep_time, speakRecordTime: t.speak_record_time,
    notifierEleves: t.notifier_eleves, notifierResponsable: t.notifier_responsable,
    nbUtilisations: t.nb_utilisations, dateCreation: t.created_at?.slice(0, 10),
  };
}

// ── GET /api/bet-elearning/tests-niveau - bibliothèque (agent Placement) ──────
router.get("/", authenticateAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("bet_elearning_tests_niveau").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[tests-niveau] GET /", error); return res.status(500).json({ error: error.message }); }
  res.json({ tests: (data || []).map(mapTest) });
});

// ── POST /api/bet-elearning/tests-niveau - créer un test ──────────────────────
router.post("/", authenticateAdmin, requirePermission("examens", "create"), async (req, res) => {
  const b = req.body;
  const id = `test-${Date.now()}`;
  const { data, error } = await supabase.from("bet_elearning_tests_niveau").insert({
    id, titre: b.titre, type: b.type || "qcm", niveau: b.niveau, duree_min: b.dureeMin || 30,
    tranche_cible: b.tranche_cible || "tous", questions: b.questions || [], ressource_url: b.ressourceUrl || null,
    speak_type: b.speakType || null, speak_consigne: b.speakConsigne || null, speak_audio_url: b.speakAudioUrl || null,
    speak_texte_passage: b.speakTextePassage || null, speak_tip: b.speakTip || null, speak_niveau: b.speakNiveau || null,
    speak_prep_time: b.speakPrepTime || null, speak_record_time: b.speakRecordTime || null,
    notifier_eleves: b.notifierEleves !== false, notifier_responsable: !!b.notifierResponsable,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ test: mapTest(data) });
});

// ── POST /api/bet-elearning/tests-niveau/import - migration ponctuelle depuis
// l'ancien stockage localStorage (bet_tests_niveau), conserve les ids et compteurs
// d'origine pour ne pas casser les liens déjà envoyés. Idempotent (ignore les doublons).
router.post("/import", authenticateAdmin, requirePermission("examens", "create"), async (req, res) => {
  const items = Array.isArray(req.body.tests) ? req.body.tests : [];
  if (!items.length) return res.json({ importes: 0 });
  const rows = items.filter(t => t?.id && t?.titre).map(b => ({
    id: b.id, titre: b.titre, type: b.type || "qcm", niveau: b.niveau, duree_min: b.dureeMin || 30,
    tranche_cible: b.tranche_cible || "tous", questions: b.questions || [], ressource_url: b.ressourceUrl || null,
    speak_type: b.speakType || null, speak_consigne: b.speakConsigne || null, speak_audio_url: b.speakAudioUrl || null,
    speak_texte_passage: b.speakTextePassage || null, speak_tip: b.speakTip || null, speak_niveau: b.speakNiveau || null,
    speak_prep_time: b.speakPrepTime || null, speak_record_time: b.speakRecordTime || null,
    notifier_eleves: b.notifierEleves !== false, notifier_responsable: !!b.notifierResponsable,
    nb_utilisations: b.nbUtilisations || 0,
    created_at: b.dateCreation ? new Date(b.dateCreation).toISOString() : new Date().toISOString(),
  }));
  const { data, error } = await supabase
    .from("bet_elearning_tests_niveau")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ importes: data?.length || 0 });
});

// ── PATCH /api/bet-elearning/tests-niveau/:id - modifier un test ──────────────
router.patch("/:id", authenticateAdmin, requirePermission("examens", "update"), async (req, res) => {
  const b = req.body;
  const { data, error } = await supabase.from("bet_elearning_tests_niveau").update({
    titre: b.titre, type: b.type, niveau: b.niveau, duree_min: b.dureeMin,
    tranche_cible: b.tranche_cible, questions: b.questions || [], ressource_url: b.ressourceUrl || null,
    speak_type: b.speakType || null, speak_consigne: b.speakConsigne || null, speak_audio_url: b.speakAudioUrl || null,
    speak_texte_passage: b.speakTextePassage || null, speak_tip: b.speakTip || null, speak_niveau: b.speakNiveau || null,
    speak_prep_time: b.speakPrepTime || null, speak_record_time: b.speakRecordTime || null,
    notifier_eleves: b.notifierEleves !== false, notifier_responsable: !!b.notifierResponsable,
    updated_at: new Date().toISOString(),
  }).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ test: mapTest(data) });
});

// ── DELETE /api/bet-elearning/tests-niveau/:id ─────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("examens", "delete"), async (req, res) => {
  const { error } = await supabase.from("bet_elearning_tests_niveau").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── GET /api/bet-elearning/tests-niveau/resultats/:apprenantId - historique (agent) ──
router.get("/resultats/:apprenantId", authenticateAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("bet_elearning_tests_niveau_resultats").select("*")
    .eq("apprenant_id", req.params.apprenantId).order("created_at", { ascending: false });
  if (error) { console.error(`[tests-niveau] GET /resultats/${req.params.apprenantId}`, error); return res.status(500).json({ error: error.message }); }
  res.json({
    resultats: (data || []).map(r => ({
      apprenantId: r.apprenant_id, testId: r.test_id, score: r.score, total: r.total,
      niveauDetecte: r.niveau_detecte, dureeMin: r.duree_min, detailReponses: r.detail_reponses,
      type: r.type, titreTest: r.titre_test, speakConsigne: r.speak_consigne, speakType: r.speak_type,
      notes_agent: r.notes_agent, audioUrl: r.audio_url, date: r.created_at,
    })),
  });
});

// ── GET /api/bet-elearning/tests-niveau/:id/public - chargé par le lien envoyé à l'apprenant (PUBLIC, pas d'auth) ──
router.get("/:id/public", async (req, res) => {
  const { data: test, error } = await supabase
    .from("bet_elearning_tests_niveau").select("*").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!test) return res.status(404).json({ error: "Test introuvable. Le lien est peut-être expiré ou incorrect." });

  let apprenant = null;
  let dejaPasse = false;
  const apprenantId = req.query.a;
  if (apprenantId) {
    const { data: insc } = await supabase
      .from("inscriptions_adultes").select("id, nom_complet, entreprise_nom").eq("id", apprenantId).maybeSingle();
    if (insc) {
      const [prenom, ...reste] = (insc.nom_complet || "").split(" ");
      apprenant = { id: insc.id, prenom: prenom || "Apprenant", nom: reste.join(" "), entreprise: insc.entreprise_nom || "" };
    }
    const { data: existingResultat } = await supabase
      .from("bet_elearning_tests_niveau_resultats")
      .select("id")
      .eq("test_id", req.params.id)
      .eq("apprenant_id", apprenantId)
      .limit(1)
      .maybeSingle();
    dejaPasse = !!existingResultat;
  }
  res.json({ test: mapTest(test), apprenant, dejaPasse });
});

// ── POST /api/bet-elearning/tests-niveau/:id/resultat - soumission par l'apprenant (PUBLIC, pas d'auth) ──
router.post("/:id/resultat", async (req, res) => {
  const { apprenantId, score, total, niveauDetecte, dureeMin, detailReponses, type, titreTest, speakConsigne, speakType, audioUrl } = req.body;
  if (!apprenantId) return res.status(400).json({ error: "apprenantId requis" });

  // Anti-doublon : un apprenant ne peut soumettre qu'un seul résultat pour un même test
  // (le lien envoyé à l'apprenant reste valide mais ne doit pas être resoumissible).
  const { data: existingResultat, error: existingErr } = await supabase
    .from("bet_elearning_tests_niveau_resultats")
    .select("id")
    .eq("test_id", req.params.id)
    .eq("apprenant_id", apprenantId)
    .limit(1)
    .maybeSingle();
  if (existingErr) {
    console.error(`[tests-niveau] POST /${req.params.id}/resultat - vérif doublon`, existingErr);
    return res.status(500).json({ error: existingErr.message });
  }
  if (existingResultat) {
    return res.status(409).json({ error: "Ce test a déjà été soumis pour cet apprenant." });
  }

  const { error: errInsert } = await supabase.from("bet_elearning_tests_niveau_resultats").insert({
    test_id: req.params.id, apprenant_id: apprenantId, score: score ?? null, total: total ?? null,
    niveau_detecte: niveauDetecte || null, duree_min: dureeMin || null, detail_reponses: detailReponses || null,
    type: type || null, titre_test: titreTest || null, speak_consigne: speakConsigne || null, speak_type: speakType || null,
    audio_url: audioUrl || null,
  });
  if (errInsert) {
    console.error(`[tests-niveau] POST /${req.params.id}/resultat - apprenantId=${apprenantId}`, errInsert);
    return res.status(500).json({ error: errInsert.message });
  }

  // Incrémenter le compteur d'utilisation du test (best-effort, ne bloque pas la réponse)
  const { data: t } = await supabase.from("bet_elearning_tests_niveau").select("nb_utilisations").eq("id", req.params.id).maybeSingle();
  if (t) await supabase.from("bet_elearning_tests_niveau").update({ nb_utilisations: (t.nb_utilisations || 0) + 1 }).eq("id", req.params.id);

  // Faire passer l'inscription en statut "test_en_cours" → prête pour la confirmation manuelle de l'agent,
  // avec le niveau auto-détecté déjà pré-rempli comme suggestion.
  await supabase.from("inscriptions_adultes")
    .update({ statut: "test_en_cours", niveau_detecte: niveauDetecte || null })
    .eq("id", apprenantId).eq("statut", "en_attente_test");

  res.status(201).json({ ok: true });
});

export default router;
