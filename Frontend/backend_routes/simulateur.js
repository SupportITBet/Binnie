// routes/simulateur.js  — À copier dans ton projet backend
// Montage : app.use("/api/simulateur", simulateurRouter)

import express from "express";
import supabase from "../config/supabase.js";

const router = express.Router();

console.log("✅ Route simulateur chargée");

router.post("/submit", async (req, res) => {
  try {
    const {
      nom_entreprise, secteur, nb_employes, email_contact, tel,
      niveau_actuel, niveau_cible, objectifs, format, rythme, groupe,
      nb_participants, duree_semaines, certifications,
      avec_support, avec_rapport, budget_max, email_devis, montant_estime,
    } = req.body;

    if (!nom_entreprise || !email_contact) {
      return res.status(400).json({ error: "Champs obligatoires manquants (nom_entreprise, email_contact)" });
    }

    const { error } = await supabase.from("simulateurs_formation").insert({
      nom_entreprise,
      secteur:        secteur        || null,
      nb_employes:    nb_employes    || null,
      email_contact,
      tel:            tel            || null,
      niveau_actuel:  niveau_actuel  || null,
      niveau_cible:   niveau_cible   || null,
      objectifs:      objectifs      || [],
      format:         format         || null,
      rythme:         rythme         || null,
      groupe:         groupe         || null,
      nb_participants:nb_participants|| null,
      duree_semaines: duree_semaines || null,
      certifications: certifications || [],
      avec_support:   avec_support   || false,
      avec_rapport:   avec_rapport   || true,
      budget_max:     budget_max     || null,
      email_devis:    email_devis    || email_contact,
      montant_estime: montant_estime || null,
      statut:         "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase simulateur :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Simulation enregistrée" });
  } catch (err) {
    console.error("Erreur serveur simulateur :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
