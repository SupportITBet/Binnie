// routes/leads.js  — À copier dans ton projet backend
// Montage : app.use("/api/leads", leadsRouter)

import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

console.log("✅ Route leads chargée");

router.post("/submit", async (req, res) => {
  try {
    const { nom, email, telephone, niveau, objectif } = req.body;

    if (!nom || !email || !telephone) {
      return res.status(400).json({ error: "Champs obligatoires manquants (nom, email, telephone)" });
    }

    const { error } = await supabase.from("leads_particuliers").insert({
      nom,
      email,
      telephone,
      niveau:   niveau   || null,
      objectif: objectif || null,
      statut:   "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase leads :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Lead enregistré" });
  } catch (err) {
    console.error("Erreur serveur leads :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
