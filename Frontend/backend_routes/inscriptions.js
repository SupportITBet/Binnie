// routes/inscriptions.js  — À copier dans ton projet backend
// Montage : app.use("/api/inscriptions", inscriptionsRouter)
// Gère 3 sous-routes : /adulte/submit · /enfant/submit · /etudiant/submit

import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

console.log("✅ Route inscriptions chargée");

// ── Adultes (18+) ─────────────────────────────────────────────
router.post("/adulte/submit", async (req, res) => {
  try {
    const { nom_complet, email, telephone, date_naissance, offre_id, offre_titre, niveau_detecte } = req.body;

    if (!nom_complet || !email || !telephone) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { error } = await supabase.from("inscriptions_adultes").insert({
      nom_complet,
      email,
      telephone,
      date_naissance: date_naissance || null,
      offre_id:       offre_id       || null,
      offre_titre:    offre_titre    || null,
      niveau_detecte: niveau_detecte || null,
      statut:         "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase inscription adulte :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Inscription adulte enregistrée" });
  } catch (err) {
    console.error("Erreur serveur inscription adulte :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Enfants (3-17 ans) ────────────────────────────────────────
router.post("/enfant/submit", async (req, res) => {
  try {
    const { prenom_enfant, nom_enfant, date_naissance, tranche_age, nom_parent, email_parent, telephone_parent, adresse, notes } = req.body;

    if (!prenom_enfant || !nom_enfant || !nom_parent || !email_parent || !telephone_parent) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { error } = await supabase.from("inscriptions_enfants").insert({
      prenom_enfant,
      nom_enfant,
      date_naissance:   date_naissance || null,
      tranche_age:      tranche_age    || null,
      nom_parent,
      email_parent,
      telephone_parent,
      adresse:          adresse        || null,
      notes:            notes          || null,
      statut:           "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase inscription enfant :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Inscription enfant enregistrée" });
  } catch (err) {
    console.error("Erreur serveur inscription enfant :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Étudiants (18-25 ans) ─────────────────────────────────────
router.post("/etudiant/submit", async (req, res) => {
  try {
    const { prenom, nom, date_naissance, email, telephone, etablissement, filiere, annee_etudes, notes, consentement_donnees } = req.body;

    if (!prenom || !nom || !email || !telephone) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    if (!consentement_donnees) {
      return res.status(400).json({ error: "Consentement requis" });
    }

    const { error } = await supabase.from("inscriptions_etudiants").insert({
      prenom,
      nom,
      date_naissance:      date_naissance      || null,
      email,
      telephone,
      etablissement:       etablissement       || null,
      filiere:             filiere             || null,
      annee_etudes:        annee_etudes        || null,
      notes:               notes               || null,
      consentement_donnees: consentement_donnees,
      statut:              "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase inscription étudiant :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Inscription étudiant enregistrée" });
  } catch (err) {
    console.error("Erreur serveur inscription étudiant :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
