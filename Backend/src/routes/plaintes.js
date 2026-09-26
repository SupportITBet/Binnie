import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

// GET /api/plaintes?statut=ouverte&priorite=haute
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { statut, priorite, ref_type, ref_id } = req.query;
    let q = supabase.from("plaintes").select("*").order("created_at", { ascending: false });
    if (statut)   q = q.eq("statut", statut);
    if (priorite) q = q.eq("priorite", priorite);
    if (ref_type) q = q.eq("ref_type", ref_type);
    if (ref_id)   q = q.eq("ref_id", ref_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ plaintes: data || [] });
  } catch {
    res.status(500).json({ error: "Erreur récupération plaintes" });
  }
});

// POST /api/plaintes
router.post("/", authenticateAdmin, requirePermission("support", "create"), async (req, res) => {
  try {
    const {
      ref_type, ref_id,
      apprenant_nom, apprenant_email, apprenant_telephone,
      coach_id, coach_nom,
      objet, description, priorite,
    } = req.body;
    if (!apprenant_nom || !objet) {
      return res.status(400).json({ error: "apprenant_nom et objet sont requis" });
    }
    const signale_par = req.profil;
    const { data, error } = await supabase.from("plaintes").insert({
      ref_type:           ref_type          || "general",
      ref_id:             ref_id            || null,
      apprenant_nom,
      apprenant_email:    apprenant_email   || null,
      apprenant_telephone:apprenant_telephone || null,
      coach_id:           coach_id          || null,
      coach_nom:          coach_nom         || null,
      objet,
      description:        description       || null,
      priorite:           priorite          || "normale",
      statut:             "ouverte",
      signale_par_id:     signale_par?.id   || null,
      signale_par_nom:    signale_par ? `${signale_par.prenom || ""} ${signale_par.nom || ""}`.trim() : null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ message: "Plainte créée", plainte: data });
  } catch {
    res.status(500).json({ error: "Erreur création plainte" });
  }
});

// PATCH /api/plaintes/:id
router.patch("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      "statut", "priorite", "objet", "description",
      "note_resolution", "date_resolution",
      "prise_en_charge_par_id", "prise_en_charge_par_nom",
    ];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("plaintes").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json({ message: "Plainte mise à jour", plainte: data });
  } catch {
    res.status(500).json({ error: "Erreur mise à jour plainte" });
  }
});

// DELETE /api/plaintes/:id
router.delete("/:id", authenticateAdmin, async (req, res) => {
  try {
    await supabase.from("plaintes").delete().eq("id", req.params.id);
    res.json({ message: "Plainte supprimée" });
  } catch {
    res.status(500).json({ error: "Erreur suppression plainte" });
  }
});

export default router;
