// routes/simulateur.js  - À copier dans ton projet backend
// Montage : app.use("/api/simulateur", simulateurRouter)

import express from "express";
import supabase from "../config/supabase.js";
import { notifyUser } from "../services/notifyRole.js";
import { publicFormLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();

console.log("✅ Route simulateur chargée");

router.post("/submit", publicFormLimiter, async (req, res) => {
  try {
    const {
      nom_entreprise, secteur, nb_employes, nom_contact, email_contact, tel,
      niveau_actuel, niveau_cible, objectifs, format, rythme, groupe,
      centre, nb_participants, duree_semaines, certifications,
      avec_support, avec_rapport, budget_max, email_devis, montant_estime,
    } = req.body;

    if (!nom_entreprise || !email_contact) {
      return res.status(400).json({ error: "Champs obligatoires manquants (nom_entreprise, email_contact)" });
    }

    const payload = {
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
    };

    // centre / nom_contact optionnels (colonnes ajoutées via migrations séparées)
    if (centre) payload.centre = centre;
    if (nom_contact) payload.nom_contact = nom_contact;

    let { error } = await supabase.from("simulateurs_formation").insert(payload);

    // Si une colonne optionnelle n'existe pas encore en base, réessayer sans elle
    if (error && (
      error.code === "42703" || error.code === "PGRST204" ||
      (error.message || "").includes("Could not find") ||
      (error.message || "").includes("column")
    )) {
      console.warn("Colonne optionnelle absente, réessai sans elle :", error.message);
      const { centre: _c, nom_contact: _nc, ...payloadSansOptionnel } = payload;
      const retry = await supabase.from("simulateurs_formation").insert(payloadSansOptionnel);
      error = retry.error;
    }

    if (error) {
      console.error("Erreur Supabase simulateur :", error);
      return res.status(500).json({ error: error.message });
    }

    // Notifier toutes les assistantes Corporate (B2B) actives - la demande est visible par
    // toutes (voir GET /api/entreprise/mes-demandes, non filtré par assistante), donc toutes
    // doivent être notifiées de son arrivée, pas une seule assignée arbitrairement.
    try {
      const { data: assistantesB2B } = await supabase
        .from("assistantes").select("email").eq("profil", "b2b").eq("actif", true);
      const emails = (assistantesB2B || []).map(a => a.email).filter(Boolean);
      if (emails.length) {
        const { data: users } = await supabase
          .from("utilisateurs").select("id").eq("role", "commercial").eq("actif", true).in("email", emails);
        await Promise.all((users || []).map(u => notifyUser(u.id, {
          type:    "nouvelle_demande_entreprise",
          titre:   `🏢 Nouvelle demande Corporate - ${nom_entreprise}`,
          message: `${nom_entreprise} a soumis une demande de formation (${nb_employes || "?"} employés). À traiter dans "Mes demandes".`,
          meta:    { email_contact },
          source:  "dash",
        })));
      }
    } catch (ne) {
      console.warn("[simulateur] notif assistantes B2B échouée:", ne.message);
    }

    res.status(201).json({ message: "Simulation enregistrée" });
  } catch (err) {
    console.error("Erreur serveur simulateur :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
