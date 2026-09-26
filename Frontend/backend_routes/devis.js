// routes/devis.js  — À copier dans ton projet backend
// Montage : app.use("/api/devis", devisRouter)
// Reçoit les demandes de devis de : CourseDetail, CertificationDetail, ServiceDetail

import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

console.log("✅ Route devis chargée");

router.post("/submit", async (req, res) => {
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
