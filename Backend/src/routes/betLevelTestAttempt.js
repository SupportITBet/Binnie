// src/routes/betLevelTestAttempt.js
// Suivi côté serveur d'un test de niveau BET E-Learning EN COURS - équivalent
// de levelTestAttempt.js (dash/Frontend) sur la table bet_level_test_attempts.
// Clé d'identité : apprenant_id (voir bet_level_test_attempts_migration.sql -
// aucune protection possible sans apprenant_id, cas des liens publics anonymes).
import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

/* ══════════════════════════════════════════════════════════════
   POST /api/bet-elearning/level-test/attempt/start - idempotent
   get-or-create, scopé (apprenant_id, test_id). Si apprenant_id est
   absent (lien public anonyme), aucune tentative n'est créée - le
   frontend continue alors sans protection anti-rafraîchissement.
══════════════════════════════════════════════════════════════ */
router.post("/start", async (req, res) => {
  try {
    const { apprenant_id, test_id, question_ids } = req.body;
    if (!apprenant_id) return res.json({ attempt: null, resumed: false });
    if (!Array.isArray(question_ids) || question_ids.length === 0) {
      return res.status(400).json({ error: "question_ids requis" });
    }

    const { data: existing, error: existingErr } = await supabase
      .from("bet_level_test_attempts")
      .select("*")
      .eq("apprenant_id", apprenant_id)
      .eq("test_id", test_id || null)
      .eq("status", "in_progress")
      .maybeSingle();
    if (existingErr) return res.status(500).json({ error: existingErr.message });
    if (existing) return res.json({ attempt: existing, resumed: true });

    const { data: created, error } = await supabase.from("bet_level_test_attempts").insert({
      apprenant_id,
      test_id: test_id || null,
      question_ids,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json({ attempt: created, resumed: false });
  } catch (err) {
    console.error("Erreur /bet-elearning/level-test/attempt/start:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/bet-elearning/level-test/attempt/:id/progress
══════════════════════════════════════════════════════════════ */
router.patch("/:id/progress", async (req, res) => {
  try {
    const { answers, audio_answers, current_index, quiz_phase, tab_switch_increment } = req.body;
    const upd = { updated_at: new Date().toISOString() };
    if (answers        !== undefined) upd.answers        = answers;
    if (audio_answers  !== undefined) upd.audio_answers  = audio_answers;
    if (current_index  !== undefined) upd.current_index  = current_index;
    if (quiz_phase     !== undefined) upd.quiz_phase     = quiz_phase;

    if (tab_switch_increment) {
      const { data: cur } = await supabase.from("bet_level_test_attempts").select("tab_switch_count").eq("id", req.params.id).maybeSingle();
      upd.tab_switch_count = (cur?.tab_switch_count || 0) + 1;
    }

    const { error } = await supabase
      .from("bet_level_test_attempts")
      .update(upd)
      .eq("id", req.params.id)
      .eq("status", "in_progress");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur /bet-elearning/level-test/attempt/:id/progress:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/bet-elearning/level-test/attempt/:id/close
══════════════════════════════════════════════════════════════ */
router.patch("/:id/close", async (req, res) => {
  try {
    const status = req.body?.status === "expired" ? "expired" : "submitted";
    const { error } = await supabase
      .from("bet_level_test_attempts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur /bet-elearning/level-test/attempt/:id/close:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
