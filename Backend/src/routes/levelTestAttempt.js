import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

/* ══════════════════════════════════════════════════════════════
   POST /api/level-test/attempt/start - idempotent get-or-create.
   Ancre le début du test côté serveur (started_at, seconds_remaining)
   pour qu'un rafraîchissement de page ne puisse pas "recommencer" le
   chrono ni effacer les réponses déjà données. Si une tentative
   "in_progress" existe déjà pour cet email, elle est retournée telle
   quelle (jamais recréée) - c'est ce qui rend le test non-réinitialisable.
══════════════════════════════════════════════════════════════ */
router.post("/start", async (req, res) => {
  try {
    const { email, test_id, question_ids, seconds_total } = req.body;
    if (!email) return res.status(400).json({ error: "Email requis" });
    if (!Array.isArray(question_ids) || question_ids.length === 0) {
      return res.status(400).json({ error: "question_ids requis" });
    }

    const { data: existing, error: existingErr } = await supabase
      .from("level_test_attempts")
      .select("*")
      .eq("email", email)
      .eq("status", "in_progress")
      .maybeSingle();
    if (existingErr) return res.status(500).json({ error: existingErr.message });
    if (existing) return res.json({ attempt: existing, resumed: true });

    const { data: created, error } = await supabase.from("level_test_attempts").insert({
      email,
      test_id: test_id || null,
      question_ids,
      seconds_remaining: seconds_total ?? question_ids.length * 60,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json({ attempt: created, resumed: false });
  } catch (err) {
    console.error("Erreur /level-test/attempt/start:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/level-test/attempt/:id/progress - sauvegarde incrémentale
   (réponses, phase, index, temps restant, changements d'onglet).
   N'agit que sur une tentative encore "in_progress" - une fois soumise
   ou expirée, plus aucune écriture n'est acceptée.
══════════════════════════════════════════════════════════════ */
router.patch("/:id/progress", async (req, res) => {
  try {
    const { answers, current_index, quiz_phase, seconds_remaining, tab_switch_increment } = req.body;
    const upd = { updated_at: new Date().toISOString() };
    if (answers           !== undefined) upd.answers           = answers;
    if (current_index     !== undefined) upd.current_index     = current_index;
    if (quiz_phase        !== undefined) upd.quiz_phase        = quiz_phase;
    if (seconds_remaining !== undefined) upd.seconds_remaining = Math.max(0, seconds_remaining);

    if (tab_switch_increment) {
      const { data: cur } = await supabase.from("level_test_attempts").select("tab_switch_count").eq("id", req.params.id).maybeSingle();
      upd.tab_switch_count = (cur?.tab_switch_count || 0) + 1;
    }

    const { error } = await supabase
      .from("level_test_attempts")
      .update(upd)
      .eq("id", req.params.id)
      .eq("status", "in_progress");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur /level-test/attempt/:id/progress:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/level-test/attempt/:id/close - marque la tentative comme
   soumise (appelé depuis /api/level-test/submit) ou expirée.
══════════════════════════════════════════════════════════════ */
router.patch("/:id/close", async (req, res) => {
  try {
    const status = req.body?.status === "expired" ? "expired" : "submitted";
    const { error } = await supabase
      .from("level_test_attempts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur /level-test/attempt/:id/close:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
