import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser } from "../middlewares/requireAdmin.js";

const router = express.Router();

const COLONNES_DEFAUT = [
  { titre: 'Plateforme', liens: [
    { label: 'Tableau de bord', url: '' },
    { label: 'Mes cours', url: '' },
    { label: 'Planning des sessions', url: '' },
    { label: 'Suivi de progression', url: '' },
  ]},
  { titre: 'Support', liens: [
    { label: "Centre d'aide", url: '' },
    { label: "Contacter l'équipe", url: '' },
    { label: 'Signaler un problème', url: '' },
    { label: 'Documentation', url: '' },
  ]},
  { titre: 'Légal', liens: [
    { label: 'Politique de confidentialité', url: '' },
    { label: "Conditions d'utilisation", url: '' },
    { label: 'Mentions légales', url: '' },
  ]},
];

// GET - lu par TopNavLayout (n'importe quel rôle connecté)
router.get("/", authenticateUser, async (req, res) => {
  const { data, error } = await supabase
    .from("config_footer_elearning")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) {
    return res.json({
      visible: true,
      tagline: 'Plateforme E-Learning',
      description: "British English Training - Formation en anglais pour enfants, adolescents et entreprises. Abidjan, Côte d'Ivoire.",
      colonnes: COLONNES_DEFAUT,
      copyright_texte: "Tous droits réservés · Abidjan, Côte d'Ivoire",
      version: 'v1.0.0',
    });
  }
  res.json(data);
});

// PUT - enregistré depuis GestionConfiguration (admin uniquement)
router.put("/", authenticateAdmin, async (req, res) => {
  const { visible, tagline, description, colonnes, copyright_texte, version } = req.body;
  const { data, error } = await supabase
    .from("config_footer_elearning")
    .upsert({
      id: 1,
      visible:         visible !== false,
      tagline:         tagline || 'Plateforme E-Learning',
      description:     description || '',
      colonnes:        Array.isArray(colonnes) ? colonnes : COLONNES_DEFAUT,
      copyright_texte: copyright_texte || '',
      version:         version || 'v1.0.0',
      updated_at:      new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
