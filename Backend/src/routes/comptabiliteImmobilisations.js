// routes/comptabiliteImmobilisations.js - Immobilisations & amortissements linéaires (bet-elearning)

import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { passerEcriture } from "./comptabiliteGenerale.js";

const router = express.Router();
console.log("✅ Route comptabilité immobilisations chargée");

function vncActuelle(immo, amortissements) {
  const cumul = amortissements.filter(a => a.immobilisation_id === immo.id).reduce((s, a) => Math.max(s, a.cumul_amortissement), 0);
  return Number(immo.valeur_acquisition) - cumul;
}

router.get("/", authenticateAdmin, requirePermission("finances_immobilisations", "read"), async (req, res) => {
  try {
    const { data: immos, error } = await supabase.from("comptabilite_immobilisations").select("*").order("date_acquisition", { ascending: false });
    if (error) throw error;
    const { data: amorts } = await supabase.from("comptabilite_immobilisations_amortissements").select("*");
    const enrichies = (immos || []).map(i => ({
      ...i,
      cumul_amortissement: (amorts || []).filter(a => a.immobilisation_id === i.id).reduce((s, a) => Math.max(s, a.cumul_amortissement), 0),
      valeur_nette_comptable: vncActuelle(i, amorts || []),
    }));
    res.json({ immobilisations: enrichies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authenticateAdmin, requirePermission("finances_immobilisations", "manage"), async (req, res) => {
  try {
    const { libelle, categorie, valeur_acquisition, date_acquisition, duree_amortissement_annees, valeur_residuelle, fournisseur_id, notes } = req.body;
    if (!libelle?.trim() || !valeur_acquisition || !duree_amortissement_annees) return res.status(400).json({ error: "Libellé, valeur d'acquisition et durée obligatoires" });
    const { data, error } = await supabase.from("comptabilite_immobilisations").insert({
      libelle: libelle.trim(), categorie: categorie || "materiel", valeur_acquisition: parseFloat(valeur_acquisition),
      date_acquisition: date_acquisition || new Date().toISOString().slice(0, 10),
      duree_amortissement_annees: parseInt(duree_amortissement_annees, 10), valeur_residuelle: parseFloat(valeur_residuelle) || 0,
      fournisseur_id: fournisseur_id || null, notes: notes || null, created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ immobilisation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", authenticateAdmin, requirePermission("finances_immobilisations", "manage"), async (req, res) => {
  try {
    const allowed = ["libelle", "categorie", "statut", "date_cession", "valeur_cession", "notes"];
    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const { data, error } = await supabase.from("comptabilite_immobilisations").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ immobilisation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authenticateAdmin, requirePermission("finances_immobilisations", "manage"), async (req, res) => {
  try {
    const { error } = await supabase.from("comptabilite_immobilisations").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function amortirUneImmobilisation(immo, exerciceAnnee, createdBy) {
  const { data: deja } = await supabase.from("comptabilite_immobilisations_amortissements").select("id")
    .eq("immobilisation_id", immo.id).eq("exercice_annee", exerciceAnnee).maybeSingle();
  if (deja) return { skipped: true, immobilisation_id: immo.id };

  const { data: amortsPrecedents } = await supabase.from("comptabilite_immobilisations_amortissements").select("cumul_amortissement")
    .eq("immobilisation_id", immo.id);
  const cumulPrecedent = (amortsPrecedents || []).reduce((s, a) => Math.max(s, a.cumul_amortissement), 0);
  const baseAmortissable = Number(immo.valeur_acquisition) - Number(immo.valeur_residuelle || 0);
  const annuite = Math.round((baseAmortissable / immo.duree_amortissement_annees) * 100) / 100;
  const restant = baseAmortissable - cumulPrecedent;
  if (restant <= 0) return { skipped: true, immobilisation_id: immo.id, raison: "déjà totalement amorti" };
  const montant = Math.min(annuite, restant);
  const cumul = cumulPrecedent + montant;
  const vnc = Number(immo.valeur_acquisition) - cumul;

  const ecriture = await passerEcriture({
    journal: "OD", date_ecriture: `${exerciceAnnee}-12-31`, libelle: `Dotation amortissement - ${immo.libelle} (${exerciceAnnee})`,
    source_type: "immobilisation", source_id: immo.id, created_by: createdBy,
    lignes: [
      { compte_numero: "681000", debit: montant },
      { compte_numero: "281800", credit: montant },
    ],
  });
  if (!ecriture) return { skipped: true, immobilisation_id: immo.id, raison: "échec écriture (exercice peut-être clôturé)" };

  const { data: row, error } = await supabase.from("comptabilite_immobilisations_amortissements").insert({
    immobilisation_id: immo.id, exercice_annee: exerciceAnnee, montant_amortissement: montant,
    cumul_amortissement: cumul, valeur_nette_comptable: vnc, ecriture_id: ecriture.id,
  }).select().single();
  if (error) throw error;
  return { skipped: false, amortissement: row };
}

router.post("/:id/amortir", authenticateAdmin, requirePermission("finances_immobilisations", "manage"), async (req, res) => {
  try {
    const { data: immo } = await supabase.from("comptabilite_immobilisations").select("*").eq("id", req.params.id).maybeSingle();
    if (!immo) return res.status(404).json({ error: "Immobilisation introuvable" });
    const exercice = parseInt(req.body.exercice_annee, 10) || new Date().getFullYear();
    const resultat = await amortirUneImmobilisation(immo, exercice, req.profil?.id || null);
    if (resultat.skipped) return res.status(400).json({ error: resultat.raison || "Amortissement déjà enregistré pour cet exercice" });
    res.status(201).json(resultat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/amortir-tout", authenticateAdmin, requirePermission("finances_immobilisations", "manage"), async (req, res) => {
  try {
    const exercice = parseInt(req.body.exercice_annee, 10) || new Date().getFullYear();
    const { data: immos } = await supabase.from("comptabilite_immobilisations").select("*").eq("statut", "active");
    const resultats = [];
    for (const immo of (immos || [])) {
      resultats.push(await amortirUneImmobilisation(immo, exercice, req.profil?.id || null));
    }
    res.json({ traites: resultats.length, generes: resultats.filter(r => !r.skipped).length, resultats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
