import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

// ── Public : FAQ actives ────────────────────────────────────────────────────
router.get("/publiques", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("faq_items")
      .select("id, question, reponse, categorie, ordre")
      .eq("actif", true)
      .order("categorie", { ascending: true })
      .order("ordre", { ascending: true });
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : liste complète ──────────────────────────────────────────────────
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("faq_items")
      .select("*")
      .order("categorie", { ascending: true })
      .order("ordre", { ascending: true });
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : création ────────────────────────────────────────────────────────
router.post("/", authenticateAdmin, requirePermission("contenu_editorial","create"), async (req, res) => {
  try {
    const { question, reponse, categorie, ordre, actif } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: "La question est requise" });
    if (!reponse?.trim())  return res.status(400).json({ error: "La réponse est requise" });

    let nextOrdre = ordre != null ? Number(ordre) : 0;
    if (ordre == null) {
      const { data: last } = await supabase
        .from("faq_items")
        .select("ordre")
        .eq("categorie", categorie || "")
        .order("ordre", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextOrdre = (last?.ordre ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from("faq_items")
      .insert({
        question:  question.trim(),
        reponse:   reponse.trim(),
        categorie: categorie?.trim() || "Général",
        ordre:     nextOrdre,
        actif:     actif !== false,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : modification ────────────────────────────────────────────────────
router.patch("/:id", authenticateAdmin, requirePermission("contenu_editorial","update"), async (req, res) => {
  try {
    const allowed = ["question", "reponse", "categorie", "ordre", "actif"];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    if (updates.question) updates.question = updates.question.trim();
    if (updates.reponse)  updates.reponse  = updates.reponse.trim();
    if (updates.categorie) updates.categorie = updates.categorie.trim();
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("faq_items")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : suppression ─────────────────────────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("contenu_editorial","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("faq_items").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "FAQ supprimée" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
