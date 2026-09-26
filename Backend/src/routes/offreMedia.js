import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

// Public : médias actifs pour un type d'offre
router.get("/:offreType/publiques", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("offre_media")
      .select("id, type, url, titre, description, ordre")
      .eq("offre_type", req.params.offreType)
      .eq("actif", true)
      .order("ordre", { ascending: true });
    if (error) throw error;
    res.json({ media: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin : liste complète pour un type
router.get("/:offreType", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("offre_media")
      .select("*")
      .eq("offre_type", req.params.offreType)
      .order("ordre", { ascending: true });
    if (error) throw error;
    res.json({ media: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin : création
router.post("/", authenticateAdmin, requirePermission("offres_catalogue","create"), async (req, res) => {
  try {
    const { offre_type, type, url, titre, description, ordre, actif } = req.body;
    if (!offre_type?.trim()) return res.status(400).json({ error: "offre_type requis" });
    if (!url?.trim())        return res.status(400).json({ error: "URL requise" });

    let nextOrdre = ordre != null ? Number(ordre) : 0;
    if (ordre == null) {
      const { data: last } = await supabase
        .from("offre_media")
        .select("ordre")
        .eq("offre_type", offre_type)
        .order("ordre", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextOrdre = (last?.ordre ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from("offre_media")
      .insert({
        offre_type: offre_type.trim(),
        type:       type || "video",
        url:        url.trim(),
        titre:       titre?.trim() || "",
        description: description?.trim() || "",
        ordre:       nextOrdre,
        actif:      actif !== false,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin : modification
router.patch("/:id", authenticateAdmin, requirePermission("offres_catalogue","update"), async (req, res) => {
  try {
    const allowed = ["type", "url", "titre", "description", "ordre", "actif"];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (updates.url)   updates.url   = updates.url.trim();
    if (updates.titre) updates.titre = updates.titre.trim();
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("offre_media")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin : suppression
router.delete("/:id", authenticateAdmin, requirePermission("offres_catalogue","delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("offre_media")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Média supprimé" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
