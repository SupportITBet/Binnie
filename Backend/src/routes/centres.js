import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();
console.log("✅ Route centres chargée");

// GET / - liste publique
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("centres")
      .select("id, nom, ville, adresse, telephone, email, actif")
      .eq("actif", true)
      .order("ville");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ centres: data || [] });
  } catch { res.status(500).json({ error: "Erreur interne" }); }
});

// GET /admin/all - liste complète admin (actifs + inactifs)
router.get("/admin/all", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("centres")
      .select("*, assistantes(id,nom,prenom,actif,type_cours)")
      .order("ville");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ centres: data || [] });
  } catch { res.status(500).json({ error: "Erreur interne" }); }
});

// GET /:id - détail
router.get("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("centres").select("*").eq("id", req.params.id).single();
    if (error || !data) return res.status(404).json({ error: "Centre introuvable" });
    res.json({ centre: data });
  } catch { res.status(500).json({ error: "Erreur interne" }); }
});

// POST / - créer un centre
router.post("/", authenticateAdmin, requirePermission("offres_catalogue","create"), async (req, res) => {
  try {
    const { nom, ville, adresse, telephone, email, couleur, key_local, actif } = req.body;
    if (!nom || !ville) return res.status(400).json({ error: "nom et ville sont requis" });
    const { data, error } = await supabase
      .from("centres")
      .insert({ nom, ville, adresse, telephone, email, couleur: couleur||"#0891b2", key_local: key_local||nom.toLowerCase().replace(/\s+/g,"_"), actif: actif??true })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ centre: data });
  } catch { res.status(500).json({ error: "Erreur interne" }); }
});

// PATCH /:id - modifier
router.patch("/:id", authenticateAdmin, requirePermission("offres_catalogue","update"), async (req, res) => {
  try {
    const allowed = ["nom","ville","adresse","telephone","email","actif","couleur","key_local"];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await supabase
      .from("centres").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ centre: data });
  } catch { res.status(500).json({ error: "Erreur interne" }); }
});

// DELETE /:id
router.delete("/:id", authenticateAdmin, requirePermission("offres_catalogue","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("centres").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Centre supprimé" });
  } catch { res.status(500).json({ error: "Erreur interne" }); }
});

export default router;
