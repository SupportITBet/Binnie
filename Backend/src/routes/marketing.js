import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();
console.log("✅ Route marketing chargée");

/* ═══════════════════════════════════════════════════════
   SUIVI MARKETING (relance, fidélisation, ambassadeur)
   Le volet communication (offres en cours) réutilise le carrousel
   (/api/carousel) et le marquee (/api/marquee) déjà existants.
═══════════════════════════════════════════════════════ */

// ── Liste (filtrable par statut) ──
router.get("/suivis", authenticateAdmin, requirePermission("suivi_prospects","read"), async (req, res) => {
  try {
    let q = supabase.from("suivis_marketing").select("*").order("created_at", { ascending: false });
    if (req.query.statut) q = q.eq("statut", req.query.statut);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ suivis: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Créer une fiche de suivi ──
router.post("/suivis", authenticateAdmin, requirePermission("suivi_prospects","create"), async (req, res) => {
  try {
    const { nom, email, telephone, assignation_id, statut, canal_dernier_contact, notes, prochaine_relance_at } = req.body;
    if (!nom?.trim()) return res.status(400).json({ error: "Nom requis" });
    if (!email?.trim() && !telephone?.trim()) return res.status(400).json({ error: "Email ou téléphone requis" });

    const { data, error } = await supabase
      .from("suivis_marketing")
      .insert({
        nom: nom.trim(), email: email?.trim() || null, telephone: telephone?.trim() || null,
        assignation_id: assignation_id || null, statut: statut || "nouveau",
        canal_dernier_contact: canal_dernier_contact || null,
        dernier_contact_at: canal_dernier_contact ? new Date().toISOString() : null,
        notes: notes || null, prochaine_relance_at: prochaine_relance_at || null,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ suivi: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Modifier une fiche (qualification, changement de statut) ──
router.patch("/suivis/:id", authenticateAdmin, requirePermission("suivi_prospects","update"), async (req, res) => {
  try {
    const { nom, email, telephone, statut, canal_dernier_contact, notes, prochaine_relance_at } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (nom !== undefined) updates.nom = nom;
    if (email !== undefined) updates.email = email || null;
    if (telephone !== undefined) updates.telephone = telephone || null;
    if (statut !== undefined) updates.statut = statut;
    if (notes !== undefined) updates.notes = notes || null;
    if (prochaine_relance_at !== undefined) updates.prochaine_relance_at = prochaine_relance_at || null;
    if (canal_dernier_contact !== undefined) {
      updates.canal_dernier_contact = canal_dernier_contact || null;
      updates.dernier_contact_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("suivis_marketing")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ suivi: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Marquer une relance faite (raccourci utilisé depuis le tableau) ──
router.post("/suivis/:id/relance", authenticateAdmin, requirePermission("suivi_prospects","update"), async (req, res) => {
  try {
    const { canal, prochaine_relance_at, notes } = req.body;
    const updates = {
      canal_dernier_contact: canal || null,
      dernier_contact_at: new Date().toISOString(),
      statut: "relance",
      updated_at: new Date().toISOString(),
    };
    if (prochaine_relance_at !== undefined) updates.prochaine_relance_at = prochaine_relance_at || null;
    if (notes) updates.notes = notes;

    const { data, error } = await supabase
      .from("suivis_marketing")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ suivi: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Supprimer une fiche ──
router.delete("/suivis/:id", authenticateAdmin, requirePermission("suivi_prospects","delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("suivis_marketing")
      .delete()
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Fiche supprimée" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
