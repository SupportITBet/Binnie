import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser } from "../middlewares/requireAdmin.js";

const router = express.Router();

// GET - lu par l'admin (Configuration) et les apprenants (DashboardApprenant)
router.get("/", authenticateUser, async (req, res) => {
  const { data, error } = await supabase
    .from("config_competences_elearning")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data?.data || {});
});

// PUT - enregistré depuis GestionConfiguration (admin uniquement)
router.put("/", authenticateAdmin, async (req, res) => {
  const { data: body } = req.body;
  if (!body || typeof body !== "object") return res.status(400).json({ error: "data (objet) requis" });

  const { data, error } = await supabase
    .from("config_competences_elearning")
    .upsert({ id: 1, data: body, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.data);
});

export default router;
