// src/routes/betLevelTests.js
// Gestion des tests de niveau multi-format : tests + questions - BET E-Learning
// uniquement. Réplique de levelTests.js (dash) sur des tables séparées
// (bet_level_tests / bet_level_questions) - aucune donnée partagée avec dash.
// Coexiste avec betElearningTestsNiveau.js (bet_elearning_tests_niveau), qui
// reste en place tel quel.
import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

// Lecture (GET) : accessible à tout staff authentifié, pas de permission
// dédiée. Les mutations (create/update/delete) exigent
// requirePermission("examens", ...), déjà assigné au rôle admin_placement.
const authRequired = authenticateAdmin;

/* ═══════════════════════════════════════════════════════
   TESTS - CRUD
═══════════════════════════════════════════════════════ */

// GET /api/bet-elearning/level-tests - liste tous les tests
router.get("/", authRequired, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bet_level_tests")
      .select("*, bet_level_questions(count)")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ tests: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// GET /api/bet-elearning/level-tests/actif - test actuellement actif (public)
router.get("/actif", async (req, res) => {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("bet_level_tests")
      .select(`*, bet_level_questions(*)`)
      .eq("actif", true)
      .or(`programme_jusqu_au.is.null,programme_jusqu_au.gte.${now}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.json({ test: null });

    if (data.bet_level_questions) {
      data.bet_level_questions.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    }

    res.json({ test: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// GET /api/bet-elearning/level-tests/:id/public - un test précis (lien envoyé, public)
// ?a=<apprenantId> - résout l'identité du bénéficiaire déjà lié au lien (voir
// betElearningTestsNiveau.js, dont ce comportement était absent ici : le lien envoyé
// par l'agent Placement Test contient déjà l'identité, inutile de la redemander).
router.get("/:id/public", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bet_level_tests")
      .select(`*, bet_level_questions(*)`)
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Test introuvable. Le lien est peut-être expiré ou incorrect." });

    if (data.bet_level_questions) {
      data.bet_level_questions.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    }

    let apprenant = null;
    let dejaPasse = false;
    const apprenantId = req.query.a;
    if (apprenantId) {
      const { data: insc } = await supabase
        .from("inscriptions_adultes").select("id, nom_complet, entreprise_nom").eq("id", apprenantId).maybeSingle();
      if (insc) {
        const [prenom, ...reste] = (insc.nom_complet || "").split(" ");
        apprenant = { id: insc.id, prenom: prenom || "Candidat", nom: reste.join(" "), entreprise: insc.entreprise_nom || "" };
      }
      const { data: tentativeExistante } = await supabase
        .from("bet_level_test_attempts")
        .select("id")
        .eq("test_id", req.params.id)
        .eq("apprenant_id", apprenantId)
        .limit(1)
        .maybeSingle();
      dejaPasse = !!tentativeExistante;
    }

    res.json({ test: data, apprenant, dejaPasse });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// POST /api/bet-elearning/level-tests - créer un test
router.post("/", authRequired, requirePermission("examens", "create"), async (req, res) => {
  try {
    const { titre, description, type, params, programme_le, programme_jusqu_au } = req.body;
    if (!titre) return res.status(400).json({ error: "Le titre est requis" });

    const { data, error } = await supabase
      .from("bet_level_tests")
      .insert({
        titre,
        description: description || "",
        type: type || "qcm",
        actif: false,
        params: params || {},
        programme_le: programme_le || null,
        programme_jusqu_au: programme_jusqu_au || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ test: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// PATCH /api/bet-elearning/level-tests/:id - modifier un test
router.patch("/:id", authRequired, requirePermission("examens", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    delete updates.id;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("bet_level_tests")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ test: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// PATCH /api/bet-elearning/level-tests/:id/activer
router.patch("/:id/activer", authRequired, requirePermission("examens", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    await supabase.from("bet_level_tests").update({ actif: false }).neq("id", id);

    const { data, error } = await supabase
      .from("bet_level_tests")
      .update({ actif: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ test: data, message: "Test activé ✓" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// PATCH /api/bet-elearning/level-tests/:id/desactiver
router.patch("/:id/desactiver", authRequired, requirePermission("examens", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("bet_level_tests")
      .update({ actif: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ test: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// POST /api/bet-elearning/level-tests/:id/dupliquer
router.post("/:id/dupliquer", authRequired, requirePermission("examens", "create"), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: original, error: errO } = await supabase
      .from("bet_level_tests")
      .select("*")
      .eq("id", id)
      .single();
    if (errO || !original) return res.status(404).json({ error: "Test introuvable" });

    const { data: questions } = await supabase
      .from("bet_level_questions")
      .select("*")
      .eq("test_id", id)
      .order("ordre");

    const { id: _id, created_at, updated_at, actif, ...rest } = original;
    const { data: clone, error: errC } = await supabase
      .from("bet_level_tests")
      .insert({ ...rest, titre: `${original.titre} (copie)`, actif: false })
      .select()
      .single();
    if (errC) return res.status(500).json({ error: errC.message });

    if (questions?.length) {
      const clonedQs = questions.map(({ id: _qid, created_at: _ca, ...q }) => ({ ...q, test_id: clone.id }));
      await supabase.from("bet_level_questions").insert(clonedQs);
    }

    res.status(201).json({ test: clone, message: "Test dupliqué ✓" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// DELETE /api/bet-elearning/level-tests/:id
router.delete("/:id", authRequired, requirePermission("examens", "delete"), async (req, res) => {
  try {
    const { id } = req.params;
    await supabase.from("bet_level_questions").delete().eq("test_id", id);
    const { error } = await supabase.from("bet_level_tests").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Test supprimé" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ═══════════════════════════════════════════════════════
   QUESTIONS - CRUD
═══════════════════════════════════════════════════════ */

// GET /api/bet-elearning/level-tests/:testId/questions
router.get("/:testId/questions", authRequired, async (req, res) => {
  try {
    const { testId } = req.params;
    const { data, error } = await supabase
      .from("bet_level_questions")
      .select("*")
      .eq("test_id", testId)
      .order("ordre", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ questions: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// POST /api/bet-elearning/level-tests/:testId/questions
router.post("/:testId/questions", authRequired, requirePermission("examens", "create"), async (req, res) => {
  try {
    const { testId } = req.params;
    const { type, text, audio_url, image_url, passage, options, correct, category, cefr, points, explanation, actif, ordre } = req.body;

    if (!text && !audio_url && !passage) {
      return res.status(400).json({ error: "Contenu de la question requis" });
    }

    let nextOrdre = ordre;
    if (nextOrdre === undefined) {
      const { data: last } = await supabase
        .from("bet_level_questions")
        .select("ordre")
        .eq("test_id", testId)
        .order("ordre", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextOrdre = (last?.ordre || 0) + 1;
    }

    const { data, error } = await supabase
      .from("bet_level_questions")
      .insert({
        test_id: testId,
        type: type || "qcm",
        text: text || "",
        audio_url: audio_url || null,
        image_url: image_url || null,
        passage: passage || null,
        options: options || [],
        correct: correct || "",
        category: category || "Grammaire",
        cefr: cefr || "A1",
        points: points || 1,
        explanation: explanation || "",
        actif: actif !== false,
        ordre: nextOrdre,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ question: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// PATCH /api/bet-elearning/level-tests/:testId/questions/:id
router.patch("/:testId/questions/:id", authRequired, requirePermission("examens", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.id;
    delete updates.test_id;

    const { data, error } = await supabase
      .from("bet_level_questions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ question: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// DELETE /api/bet-elearning/level-tests/:testId/questions/:id
router.delete("/:testId/questions/:id", authRequired, requirePermission("examens", "delete"), async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("bet_level_questions").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Question supprimée" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// PATCH /api/bet-elearning/level-tests/:testId/questions/reordonner
router.patch("/:testId/questions/reordonner", authRequired, requirePermission("examens", "update"), async (req, res) => {
  try {
    const { ordre } = req.body;
    if (!Array.isArray(ordre)) return res.status(400).json({ error: "Format invalide" });

    const updates = ordre.map(({ id, ordre: o }) =>
      supabase.from("bet_level_questions").update({ ordre: o }).eq("id", id)
    );
    await Promise.all(updates);
    res.json({ message: "Ordre mis à jour" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
