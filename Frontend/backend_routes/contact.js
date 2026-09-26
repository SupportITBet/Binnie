// routes/contact.js  — À copier dans ton projet backend
// Montage : app.use("/api/contact", contactRouter)

import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

console.log("✅ Route contact chargée");

router.post("/submit", async (req, res) => {
  try {
    const { nom, email, telephone, type, sujet, message } = req.body;

    if (!nom || !email || !message) {
      return res.status(400).json({ error: "Champs obligatoires manquants (nom, email, message)" });
    }

    const { error } = await supabase.from("contacts").insert({
      nom,
      email,
      telephone: telephone || null,
      type:      type      || "particulier",
      sujet:     sujet     || null,
      message,
      statut:    "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase contact :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Message de contact enregistré" });
  } catch (err) {
    console.error("Erreur serveur contact :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
