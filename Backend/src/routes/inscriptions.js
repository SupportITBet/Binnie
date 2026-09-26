// routes/inscriptions.js
import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { publicFormLimiter } from "../middlewares/rateLimiters.js";
import { notifyRole } from "../services/notifyRole.js";

const router = express.Router();

console.log("✅ Route inscriptions chargée");

// ── GET /api/inscriptions/places-restantes ──────────────────────
// Public - nombre réel d'inscriptions actives par offre (offre_id), pour calculer les
// "places restantes" sur le catalogue public (Frontend/Accueil.jsx) à partir de la vraie
// capacité_max définie par offre côté admin, plutôt qu'un chiffre fixe.
router.get("/places-restantes", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inscriptions_adultes")
      .select("offre_id")
      .not("offre_id", "is", null)
      .not("statut", "in", "(annule,perdu)");
    if (error) throw error;

    const counts = {};
    for (const row of data || []) {
      counts[row.offre_id] = (counts[row.offre_id] || 0) + 1;
    }
    res.json({ counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Adultes (18+) ─────────────────────────────────────────────
router.post("/adulte/submit", publicFormLimiter, async (req, res) => {
  try {
    const { nom_complet, email, telephone, date_naissance, offre_id, offre_titre, mode_paiement, niveau_detecte, adresse, statut, commercial_id, centre_id, type_client, profil_type, nom_parent, telephone_parent, email_parent } = req.body;

    if (!nom_complet || !telephone) {
      return res.status(400).json({ error: "Champs obligatoires manquants (nom et téléphone)" });
    }

    const payloadFull = {
      nom_complet,
      telephone,
      email:             email             || "",
      date_naissance:    date_naissance     || null,
      offre_id:          offre_id           || null,
      offre_titre:       offre_titre        || null,
      mode_paiement:     mode_paiement      || null,
      niveau_detecte:    niveau_detecte     || null,
      adresse:           adresse            || null,
      commercial_id:     commercial_id      || null,
      centre_id:         centre_id          || null,
      statut:            statut             || "nouveau",
      type_client:       type_client        || "particulier",
      profil_type:       profil_type        || "adulte",
      nom_parent:        profil_type === "enfant" ? (nom_parent        || null) : null,
      telephone_parent:  profil_type === "enfant" ? (telephone_parent  || null) : null,
      email_parent:      profil_type === "enfant" ? (email_parent      || null) : null,
    };

    let { data, error } = await supabase.from("inscriptions_adultes").insert(payloadFull).select("id").single();

    // Si colonne manquante, réessayer avec le payload minimal garanti
    if (error?.code === "PGRST204" || error?.code === "42703") {
      console.warn("⚠️ Colonnes manquantes, réessai payload minimal:", error.message);
      const payloadMin = { nom_complet, telephone, email: email||"", offre_titre: offre_titre||null, niveau_detecte: niveau_detecte||null, statut: statut||"nouveau", commercial_id: commercial_id||null, centre_id: centre_id||null };
      ({ data, error } = await supabase.from("inscriptions_adultes").insert(payloadMin).select("id").single());
    }

    if (error) {
      console.error("❌ Supabase inscription adulte:", error.code, error.message);
      return res.status(500).json({ error: error.message, code: error.code });
    }

    res.status(201).json({ message: "Inscription adulte enregistrée", id: data?.id });
    await notifyRole(["commercial"], {
      type: "inscription",
      titre: "📝 Nouvelle inscription adulte",
      message: `${nom_complet} vient de s'inscrire (${offre_titre || "offre non précisée"}).`,
      meta: { inscription_id: data?.id, type: "adulte" },
    }).catch(() => {});
  } catch (err) {
    console.error("❌ Erreur serveur inscription adulte:", err);
    res.status(500).json({ error: err.message || "Erreur interne" });
  }
});

// ── Enfants (3-17 ans) ────────────────────────────────────────
router.post("/enfant/submit", publicFormLimiter, async (req, res) => {
  try {
    const { prenom_enfant, nom_enfant, date_naissance, tranche_age, nom_parent, email_parent, telephone_parent, tel_parent, adresse, notes, commercial_id, statut, centre_id } = req.body;
    const telephone = telephone_parent || tel_parent;

    if (!prenom_enfant || !nom_enfant || !nom_parent || !email_parent || !telephone) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { error } = await supabase.from("inscriptions_enfants").insert({
      prenom_enfant,
      nom_enfant,
      date_naissance:   date_naissance || null,
      tranche_age:      tranche_age    || null,
      nom_parent,
      email_parent,
      telephone_parent: telephone,
      adresse:          adresse        || null,
      notes:            notes          || null,
      commercial_id:    commercial_id  || null,
      centre_id:        centre_id      || null,
      statut:           statut         || "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase inscription enfant :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Inscription enfant enregistrée" });
    await notifyRole(["commercial"], {
      type: "inscription",
      titre: "📝 Nouvelle inscription enfant",
      message: `${prenom_enfant} ${nom_enfant} (parent : ${nom_parent}) vient d'être inscrit(e).`,
      meta: { type: "enfant" },
    }).catch(() => {});
  } catch (err) {
    console.error("Erreur serveur inscription enfant :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Étudiants (18-25 ans) ─────────────────────────────────────
router.post("/etudiant/submit", publicFormLimiter, async (req, res) => {
  try {
    const { prenom, nom, date_naissance, email, telephone, etablissement, filiere, annee_etudes, notes, consentement_donnees, centre_id } = req.body;

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
      centre_id:           centre_id           || null,
      statut:              "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase inscription étudiant :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Inscription étudiant enregistrée" });
    await notifyRole(["commercial"], {
      type: "inscription",
      titre: "📝 Nouvelle inscription étudiant",
      message: `${prenom} ${nom} (${etablissement || "établissement non précisé"}) vient de s'inscrire.`,
      meta: { type: "etudiant" },
    }).catch(() => {});
  } catch (err) {
    console.error("Erreur serveur inscription étudiant :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Lister toutes les inscriptions (dashboard, filtrées par scope) ──
router.get("/all", authenticateAdmin, async (req, res) => {
  try {
    const scope        = req.profil?.scope || [];
    const isNational   = scope.includes("national") || req.role === "super_admin";
    const isCommercial = req.role === "commercial";
    const commercialId = req.profil?.id || null;
    const centreScope  = scope.filter(s => s !== "national");

    const applyFilter = (q) => {
      // Commerciale : uniquement ses propres inscriptions
      if (isCommercial && commercialId) return q.eq("commercial_id", commercialId);
      // Autres rôles : filtre par centre(s) si scope non-national
      if (!isNational && centreScope.length > 0) return q.in("centre_id", centreScope);
      return q;
    };

    const safeQuery = async (q) => {
      const { data, error } = await q;
      if (error) { console.warn("⚠️ safeQuery:", error.message); return []; }
      return data || [];
    };

    const [adultes, enfants, etudiants] = await Promise.all([
      safeQuery(applyFilter(supabase.from("inscriptions_adultes").select("id, nom_complet, email, telephone, offre_titre, niveau_detecte, mode_paiement, statut, centre_id, commercial_id, created_at").order("created_at", { ascending: false }))),
      safeQuery(applyFilter(supabase.from("inscriptions_enfants").select("id, prenom_enfant, nom_enfant, nom_parent, email_parent, telephone_parent, tranche_age, statut, centre_id, commercial_id, created_at").order("created_at", { ascending: false }))),
      safeQuery(applyFilter(supabase.from("inscriptions_etudiants").select("id, prenom, nom, email, telephone, etablissement, statut, centre_id, commercial_id, created_at").order("created_at", { ascending: false }))),
    ]);

    res.json({ adultes, enfants, etudiants });
  } catch (err) {
    console.error("❌ GET /inscriptions/all :", err);
    res.status(500).json({ error: err.message || "Erreur interne" });
  }
});

// ── Supprimer une inscription (adulte / enfant / étudiant) ─────
const TABLE_PAR_TYPE = {
  adulte:   "inscriptions_adultes",
  enfant:   "inscriptions_enfants",
  etudiant: "inscriptions_etudiants",
};
router.delete("/:type/:id", authenticateAdmin, async (req, res) => {
  try {
    const table = TABLE_PAR_TYPE[req.params.type];
    if (!table) return res.status(400).json({ error: "Type d'inscription invalide" });

    let q = supabase.from(table).delete().eq("id", req.params.id);
    // Un commercial ne peut supprimer que ses propres inscriptions.
    if (req.role === "commercial" && req.profil?.id) {
      q = q.eq("commercial_id", req.profil.id);
    }
    const { error, count } = await q.select("id", { count: "exact" });
    if (error) return res.status(500).json({ error: error.message });
    if (!count) return res.status(404).json({ error: "Inscription introuvable ou non autorisée" });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erreur interne" });
  }
});

export default router;
