import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser } from "../middlewares/requireAdmin.js";

const router = express.Router();

// GET - lu par GestionEntreprises (création entreprise, calcul CA/versements) et
// GestionConfiguration (admin) - tout utilisateur BET connecté.
router.get("/", authenticateUser, async (req, res) => {
  const { data, error } = await supabase
    .from("packages_commerciaux")
    .select("*")
    .order("tarif", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ packages: data || [] });
});

// POST - créer un package (admin uniquement)
router.post("/", authenticateAdmin, async (req, res) => {
  const { libelle, description, tarif, max_benef, couleur, actif } = req.body;
  if (!libelle?.trim()) return res.status(400).json({ error: "Libellé requis" });
  // id TEXT sans défaut DB (voir migration - les id historiques "starter"/"business"/…
  // doivent rester stables) : on en génère un ici pour les nouveaux packages.
  const id = `pkg-${Date.now()}`;
  const { data, error } = await supabase
    .from("packages_commerciaux")
    .insert({
      id,
      libelle:     libelle.trim(),
      description: description || null,
      tarif:       tarif      || 0,
      max_benef:   max_benef  || 10,
      couleur:     couleur    || '#0891B2',
      actif:       actif !== false,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ package: data });
});

// PATCH - modifier un package (admin uniquement)
router.patch("/:id", authenticateAdmin, async (req, res) => {
  const { libelle, description, tarif, max_benef, couleur, actif } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (libelle     !== undefined) updates.libelle     = libelle;
  if (description !== undefined) updates.description = description;
  if (tarif       !== undefined) updates.tarif       = tarif;
  if (max_benef   !== undefined) updates.max_benef   = max_benef;
  if (couleur     !== undefined) updates.couleur     = couleur;
  if (actif       !== undefined) updates.actif       = actif;

  const { data, error } = await supabase
    .from("packages_commerciaux")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ package: data });
});

// DELETE - supprimer un package (admin uniquement)
router.delete("/:id", authenticateAdmin, async (req, res) => {
  const { error } = await supabase.from("packages_commerciaux").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
