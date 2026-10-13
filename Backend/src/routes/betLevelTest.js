// src/routes/betLevelTest.js
// Résultats des tests de niveau multi-format - BET E-Learning uniquement.
// Réplique de levelTest.js (dash) sur bet_level_test_results - aucune donnée
// partagée avec dash. Seul le rôle admin_placement gère la correction ici.
import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyRole } from "../services/notifyRole.js";
import { publicFormLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();

// POST /api/bet-elearning/level-test/submit - soumission (public, pas d'auth)
router.post("/submit", publicFormLimiter, async (req, res) => {
  try {
    const { user, test, submitted_at, apprenant_id, attempt_id } = req.body;

    if (!test?.level) return res.status(400).json({ error: "Le niveau CECRL est requis" });

    const { data: inserted, error } = await supabase.from("bet_level_test_results").insert({
      test_id:            test.test_id || null,
      apprenant_id:       apprenant_id || null,
      entreprise_id:      user?.entreprise_id || null,
      fullname:           user?.fullname || null,
      email:              user?.email || null,
      phone:              user?.phone || null,
      level:              test.level,
      score:              test.score ?? 0,
      points_earned:      test.points_earned ?? 0,
      points_total:       test.points_total ?? 100,
      correct_answers:    test.correct_answers ?? 0,
      total_questions:    test.total_questions ?? 0,
      time_taken_seconds: test.time_taken_seconds ?? 0,
      answers_details:    test.answers_details || [],
      audio_answers:      test.audio_answers || {},
      by_category:        test.by_category || {},
      by_cefr:            test.by_cefr || {},
      format_test:        test.format_test || "mixte",
      correction_statut:  test.correction_statut || "auto",
      tab_switch_count:   test.tab_switch_count || 0,
      submitted_at:       submitted_at || new Date().toISOString(),
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    // Marque la tentative "en cours" (bet_level_test_attempts) comme soumise -
    // best-effort, ne doit jamais faire échouer la soumission du résultat.
    if (attempt_id) {
      supabase.from("bet_level_test_attempts")
        .update({ status: "submitted", updated_at: new Date().toISOString() })
        .eq("id", attempt_id)
        .then(({ error: closeErr }) => { if (closeErr) console.warn("[bet-level-test/submit] clôture attempt échouée:", closeErr.message); });
    }

    const isManual = test.correction_statut === "en_attente";
    await notifyRole(["admin_placement", "super_admin"], {
      type:    "test_niveau",
      titre:   isManual ? "📝 Test reçu - correction requise" : "✅ Test de niveau reçu",
      message: isManual
        ? `${user?.fullname || "Un candidat"} a soumis un test ${test.format_test || ""} en attente de correction.`
        : `${user?.fullname || "Un candidat"} a passé son test de niveau : ${test.level}.`,
      meta: { bet_level_test_result_id: inserted.id },
    });

    res.status(201).json({ message: "Résultat enregistré", result: inserted });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// GET /api/bet-elearning/level-test/all - tous les résultats (admin_placement / super_admin)
router.get("/all", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bet_level_test_results")
      .select("*")
      .order("submitted_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ results: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// PATCH /api/bet-elearning/level-test/:id/statut - suivi CRM (nouveau/contacté/converti/archivé)
router.patch("/:id/statut", authenticateAdmin, async (req, res) => {
  try {
    const { statut } = req.body;
    const STATUTS_VALIDES = ["nouveau", "contacté", "converti", "archivé"];
    if (!STATUTS_VALIDES.includes(statut)) return res.status(400).json({ error: "Statut invalide" });

    const { data, error } = await supabase
      .from("bet_level_test_results")
      .update({ statut })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ result: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// PATCH /api/bet-elearning/level-test/:id/corriger - corriger un test Writing/Speaking
// (ou un test mixte partiellement manuel) - attribue le niveau/score final.
router.patch("/:id/corriger", authenticateAdmin, requirePermission("examens", "update"), async (req, res) => {
  try {
    const { level, score, notes_agent } = req.body;
    if (!level) return res.status(400).json({ error: "Le niveau CECRL est requis" });

    // Voir levelTest.js /corriger : "score" est un pourcentage, pas un nombre de
    // points brut - le copier tel quel dans points_earned cassait le pourcentage
    // affiché dès que points_total ≠ 100.
    const { data: existing } = await supabase
      .from("bet_level_test_results")
      .select("points_total")
      .eq("id", req.params.id)
      .maybeSingle();
    const scorePct    = Number(score) || 0;
    const pointsTotal  = existing?.points_total || 100;
    const pointsEarned = Math.round((scorePct / 100) * pointsTotal);

    const { data, error } = await supabase
      .from("bet_level_test_results")
      .update({
        level,
        score:             scorePct,
        points_earned:     pointsEarned,
        notes_agent:       notes_agent || null,
        correction_statut: "corrige",
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    /* ── LE NIVEAU CORRIGÉ REDESCEND SUR LA FICHE DE L'APPRENANT ──
       Même raison qu'après un test de placement (placementRoutes.js) : la fiche d'un
       apprenant portait le niveau de son assignation initiale et plus jamais celui de ses
       tests suivants, si bien que l'onglet « Compétences » - entièrement dérivé de
       `niveau_cecr` - décrivait un niveau que l'onglet « Test de niveau » contredisait.
       Ce circuit-ci est le test passé en ligne, l'autre celui de l'Agent Placement : les
       deux attribuent un niveau définitif, les deux doivent le propager.

       Seules les inscriptions ACTIVES sont touchées - une ligne `transfere` ou `retire`
       conserve le niveau qu'elle avait quand l'apprenant a quitté la classe. Non bloquant :
       la correction est déjà enregistrée, un échec ici ne doit pas la faire échouer. */
    if (data.email) {
      supabase
        .from("classes_elearning_apprenants")
        .update({ niveau_cecr: level })
        .ilike("email", data.email)
        .eq("statut", "actif")
        .then(({ error: errNiv }) => {
          if (errNiv) console.error("[bet-level-test/corriger] propagation niveau_cecr:", errNiv.message);
        });
    }

    res.json({ result: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// GET /api/bet-elearning/level-test/result - dernier résultat par email (auto-remplissage dossier)
router.get("/result", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email requis" });

    const { data, error } = await supabase
      .from("bet_level_test_results")
      .select("level, score, points_earned, points_total, correct_answers, total_questions, submitted_at, by_category")
      .eq("email", email)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ result: data || null });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
