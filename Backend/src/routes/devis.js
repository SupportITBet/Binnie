// routes/devis.js  - À copier dans ton projet backend
// Montage : app.use("/api/devis", devisRouter)
// Reçoit les demandes de devis de : CourseDetail, CertificationDetail, ServiceDetail

import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { publicFormLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();

console.log("✅ Route devis chargée");

// GET /api/devis/admin/liste - toutes les demandes de devis reçues (espace commercial admin)
router.get("/admin/liste", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("demandes_devis")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ devis: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/submit", publicFormLimiter, async (req, res) => {
  try {
    const { nom, email, tel, entreprise, participants, message, source, source_nom } = req.body;

    if (!nom || !email || !tel) {
      return res.status(400).json({ error: "Champs obligatoires manquants (nom, email, tel)" });
    }

    const { error } = await supabase.from("demandes_devis").insert({
      nom,
      email,
      tel,
      entreprise:   entreprise   || null,
      participants: participants || "1",
      message:      message      || null,
      source:       source       || null,   // 'cours' | 'certification' | 'service'
      source_nom:   source_nom   || null,
      statut:       "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase devis :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Demande de devis enregistrée" });
  } catch (err) {
    console.error("Erreur serveur devis :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
