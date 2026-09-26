import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();
console.log("✅ Route partenaires chargée");

// Public : partenaires actifs pour l'Accueil
router.get("/publics", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("partenaires")
      .select("id, nom, logo_url, site_web, ordre")
      .eq("actif", true)
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin : liste complète
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("partenaires").select("*").order("ordre").order("created_at");
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin : ajouter
router.post("/", authenticateAdmin, requirePermission("communication","create"), async (req, res) => {
  const { nom, logo_url, site_web, ordre } = req.body;
  if (!nom || !logo_url) return res.status(400).json({ error: "nom et logo_url requis" });
  try {
    const { data, error } = await supabase.from("partenaires")
      .insert({ nom, logo_url, site_web: site_web || null, ordre: ordre || 0, actif: true })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin : modifier
router.patch("/:id", authenticateAdmin, requirePermission("communication","update"), async (req, res) => {
  const allowed = ["nom", "logo_url", "site_web", "ordre", "actif"];
  const updates = {};
  for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
  try {
    const { data, error } = await supabase.from("partenaires").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin : supprimer
router.delete("/:id", authenticateAdmin, requirePermission("communication","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("partenaires").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
