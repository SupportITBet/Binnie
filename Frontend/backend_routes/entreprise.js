// routes/entreprise.js  — À copier dans ton projet backend
// Montage : app.use("/api/entreprise", entrepriseRouter)

import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

console.log("✅ Route entreprise chargée");

router.post("/submit", async (req, res) => {
  try {
    const { entreprise, contact, email, telephone, nb_employes, besoins } = req.body;

    if (!entreprise || !contact || !email || !telephone) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { error } = await supabase.from("demandes_entreprise").insert({
      entreprise,
      contact,
      email,
      telephone,
      nb_employes: nb_employes || null,
      besoins:     besoins     || null,
      statut:      "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase entreprise :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Demande entreprise enregistrée" });
  } catch (err) {
    console.error("Erreur serveur entreprise :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
