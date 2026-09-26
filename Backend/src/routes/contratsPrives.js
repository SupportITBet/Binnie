import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyUser } from "../services/notifyRole.js";

const router = express.Router();

// GET /api/contrats-prives?coach_id=xxx&statut=actif
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { coach_id, statut } = req.query;
    let q = supabase.from("contrats_prives").select("*").order("created_at", { ascending: false });
    if (coach_id) q = q.eq("coach_id", coach_id);
    if (statut)   q = q.eq("statut", statut);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ contrats: data || [] });
  } catch {
    res.status(500).json({ error: "Erreur récupération contrats" });
  }
});

// POST /api/contrats-prives
router.post("/", authenticateAdmin, requirePermission("inscriptions", "create"), async (req, res) => {
  try {
    const {
      coach_id, apprenant_nom, apprenant_prenom, apprenant_email, apprenant_telephone,
      type_contrat, niveau, objectif, prix_h, nb_seances_total, duree_seance_h,
      date_debut, date_fin, note,
    } = req.body;
    if (!coach_id || !apprenant_nom || prix_h == null) {
      return res.status(400).json({ error: "coach_id, apprenant_nom et prix_h sont requis" });
    }
    const { data, error } = await supabase.from("contrats_prives").insert({
      coach_id,
      apprenant_nom,
      apprenant_prenom:    apprenant_prenom    || null,
      apprenant_email:     apprenant_email     || null,
      apprenant_telephone: apprenant_telephone || null,
      type_contrat:        type_contrat        || "en_ligne",
      niveau:              niveau              || null,
      objectif:            objectif            || null,
      prix_h:              parseFloat(prix_h)  || 0,
      nb_seances_total:    parseInt(nb_seances_total) || 0,
      duree_seance_h:      parseFloat(duree_seance_h) || 1.5,
      date_debut:          date_debut          || null,
      date_fin:            date_fin            || null,
      statut:              "en_attente",
      note:                note                || null,
      created_by:          req.profil.id,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ message: "Contrat créé", contrat: data });
    await notifyUser(coach_id, {
      type: "contrat",
      titre: "📄 Nouveau contrat privé assigné",
      message: `Un contrat privé avec ${apprenant_prenom || ""} ${apprenant_nom} vous a été assigné.`.replace(/\s+/g, " "),
      meta: { contrat_id: data?.id },
    }).catch(() => {});
  } catch {
    res.status(500).json({ error: "Erreur création contrat" });
  }
});

// PATCH /api/contrats-prives/:id
router.patch("/:id", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      "statut", "paiement_confirme", "paiement_montant", "paiement_date",
      "renouvellement_statut", "renouvellement_demande_date", "renouvellement_decision_date",
      "renouvellement_note", "note", "prix_h", "nb_seances_total", "nb_seances_realisees",
      "duree_seance_h", "date_debut", "date_fin", "type_contrat", "niveau", "objectif",
      "apprenant_nom", "apprenant_prenom", "apprenant_email", "apprenant_telephone",
    ];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date().toISOString();

    // Activer automatiquement si paiement confirmé et contrat en attente
    if (updates.paiement_confirme === true) {
      const { data: cur } = await supabase
        .from("contrats_prives").select("statut").eq("id", id).single();
      if (cur?.statut === "en_attente") updates.statut = "actif";
    }

    const { data, error } = await supabase
      .from("contrats_prives").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json({ message: "Contrat mis à jour", contrat: data });
  } catch {
    res.status(500).json({ error: "Erreur mise à jour contrat" });
  }
});

// DELETE /api/contrats-prives/:id
router.delete("/:id", authenticateAdmin, requirePermission("inscriptions", "delete"), async (req, res) => {
  try {
    await supabase.from("contrats_prives").delete().eq("id", req.params.id);
    res.json({ message: "Contrat supprimé" });
  } catch {
    res.status(500).json({ error: "Erreur suppression contrat" });
  }
});

export default router;
