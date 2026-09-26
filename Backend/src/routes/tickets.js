import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyRole, notifyUser } from "../services/notifyRole.js";

const router = express.Router();

const ROLES_CUSTOMER_CARE = ["admin_customer_care", "customer_care"];

// GET /api/tickets/mes-tickets - tickets créés par l'utilisateur connecté (parent, apprenant…)
router.get("/mes-tickets", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("cree_par_id", req.profil.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ tickets: data || [] });
  } catch {
    res.status(500).json({ error: "Erreur récupération tickets" });
  }
});

// POST /api/tickets/moi - un utilisateur (parent, apprenant…) ouvre lui-même un ticket
router.post("/moi", authenticateUser, async (req, res) => {
  try {
    const { sujet, description, canal, apprenant_nom, entreprise_nom } = req.body;
    if (!sujet) return res.status(400).json({ error: "sujet requis" });

    const auteur = req.profil;
    const { data, error } = await supabase.from("tickets").insert({
      sujet,
      description:    description    || null,
      canal:          canal          || "email",
      priorite:       "normale",
      statut:         "ouvert",
      contact_prenom: auteur.prenom  || null,
      contact_nom:    auteur.nom     || null,
      contact_email:  auteur.email   || null,
      apprenant_nom:  apprenant_nom  || null,
      entreprise_nom: entreprise_nom || null,
      cree_par_id:    auteur.id,
      cree_par_nom:   `${auteur.prenom || ""} ${auteur.nom || ""}`.trim(),
    }).select().single();
    if (error) throw error;
    res.status(201).json({ message: "Ticket créé", ticket: data });

    await notifyRole([...ROLES_CUSTOMER_CARE, "super_admin"], {
      type:  "ticket",
      titre: "🎧 Nouveau ticket support",
      message: `${auteur.prenom || ""} ${auteur.nom || ""}`.trim() + ` - ${sujet}`,
      meta: { ticket_id: data.id, canal: data.canal },
    }).catch(() => {});
  } catch {
    res.status(500).json({ error: "Erreur création ticket" });
  }
});

// GET /api/tickets?statut=ouvert&canal=email&priorite=haute
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { statut, canal, priorite } = req.query;
    let q = supabase.from("tickets").select("*").order("created_at", { ascending: false });
    if (statut)   q = q.eq("statut", statut);
    if (canal)    q = q.eq("canal", canal);
    if (priorite) q = q.eq("priorite", priorite);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ tickets: data || [] });
  } catch {
    res.status(500).json({ error: "Erreur récupération tickets" });
  }
});

// POST /api/tickets
router.post("/", authenticateAdmin, requirePermission("support", "create"), async (req, res) => {
  try {
    const {
      sujet, description, canal, priorite,
      contact_prenom, contact_nom, contact_email,
      apprenant_nom, entreprise_nom,
    } = req.body;
    if (!sujet) return res.status(400).json({ error: "sujet requis" });

    const creePar = req.profil;
    const { data, error } = await supabase.from("tickets").insert({
      sujet,
      description:    description    || null,
      canal:          canal          || "email",
      priorite:       priorite       || "normale",
      statut:         "ouvert",
      contact_prenom: contact_prenom || null,
      contact_nom:    contact_nom    || null,
      contact_email:  contact_email  || null,
      apprenant_nom:  apprenant_nom  || null,
      entreprise_nom: entreprise_nom || null,
      cree_par_id:    creePar?.id    || null,
      cree_par_nom:   creePar ? `${creePar.prenom || ""} ${creePar.nom || ""}`.trim() : null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ message: "Ticket créé", ticket: data });
  } catch {
    res.status(500).json({ error: "Erreur création ticket" });
  }
});

// PATCH /api/tickets/:id
router.patch("/:id", authenticateAdmin, requirePermission("support", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      "statut", "priorite", "canal", "sujet", "description", "reponse_texte", "date_resolution",
    ];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("tickets").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json({ message: "Ticket mis à jour", ticket: data });

    if (data.cree_par_id && (updates.reponse_texte !== undefined || updates.statut !== undefined)) {
      const STATUT_LIB = { ouvert: "Ouvert", en_cours: "En cours", resolu: "Résolu" };
      const titre   = updates.reponse_texte !== undefined
        ? "💬 Réponse à votre ticket"
        : `🎧 Ticket ${STATUT_LIB[data.statut] || data.statut}`;
      const message = updates.reponse_texte !== undefined
        ? `${data.sujet} - ${updates.reponse_texte}`
        : `Votre ticket "${data.sujet}" est maintenant : ${STATUT_LIB[data.statut] || data.statut}`;
      await notifyUser(data.cree_par_id, {
        type: "ticket",
        titre, message,
        meta: { ticket_id: data.id, statut: data.statut },
      }).catch(() => {});
    }
  } catch {
    res.status(500).json({ error: "Erreur mise à jour ticket" });
  }
});

// DELETE /api/tickets/:id
router.delete("/:id", authenticateAdmin, requirePermission("support", "delete"), async (req, res) => {
  try {
    await supabase.from("tickets").delete().eq("id", req.params.id);
    res.json({ message: "Ticket supprimé" });
  } catch {
    res.status(500).json({ error: "Erreur suppression ticket" });
  }
});

export default router;
