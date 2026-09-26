// routes/comptabiliteTva.js - TVA collectée/déductible et déclarations (bet-elearning)

import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { passerEcriture, compteTresorerie } from "./comptabiliteGenerale.js";
import { enregistrerMouvementTresorerie } from "./comptabilite.js";

const router = express.Router();
console.log("✅ Route comptabilité TVA chargée");

async function calculerSynthese(mois, annee) {
  const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const fin   = new Date(annee, mois, 0).toISOString().slice(0, 10);

  const { data: factures } = await supabase.from("comptabilite_factures").select("montant_ht, montant_ttc, date_emission")
    .gte("date_emission", debut).lte("date_emission", fin);
  const { data: achats } = await supabase.from("comptabilite_factures_achat").select("montant_ht, montant_ttc, date_facture")
    .gte("date_facture", debut).lte("date_facture", fin);

  const tva_collectee  = (factures || []).reduce((s, f) => s + (Number(f.montant_ttc || 0) - Number(f.montant_ht || 0)), 0);
  const tva_deductible = (achats || []).reduce((s, f) => s + (Number(f.montant_ttc || 0) - Number(f.montant_ht || 0)), 0);
  return { tva_collectee, tva_deductible, tva_a_payer: tva_collectee - tva_deductible };
}

router.get("/synthese", authenticateAdmin, requirePermission("finances_tva", "read"), async (req, res) => {
  try {
    const now = new Date();
    const mois = parseInt(req.query.mois, 10) || (now.getMonth() + 1);
    const annee = parseInt(req.query.annee, 10) || now.getFullYear();
    const synthese = await calculerSynthese(mois, annee);
    res.json({ mois, annee, ...synthese });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/declarations", authenticateAdmin, requirePermission("finances_tva", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("comptabilite_tva_declarations").select("*")
      .order("periode_annee", { ascending: false }).order("periode_mois", { ascending: false });
    if (error) throw error;
    res.json({ declarations: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/declarations", authenticateAdmin, requirePermission("finances_tva", "manage"), async (req, res) => {
  try {
    const { mois, annee } = req.body;
    if (!mois || !annee) return res.status(400).json({ error: "Mois et année obligatoires" });
    const synthese = await calculerSynthese(mois, annee);
    const { data, error } = await supabase.from("comptabilite_tva_declarations").insert({
      periode_mois: mois, periode_annee: annee, ...synthese, statut: "brouillon", created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ declaration: data });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Une déclaration existe déjà pour cette période" });
    res.status(500).json({ error: err.message });
  }
});

router.patch("/declarations/:id", authenticateAdmin, requirePermission("finances_tva", "manage"), async (req, res) => {
  try {
    const { statut } = req.body;
    if (!["declaree", "payee"].includes(statut)) return res.status(400).json({ error: "Statut invalide" });

    const { data: decl } = await supabase.from("comptabilite_tva_declarations").select("*").eq("id", req.params.id).maybeSingle();
    if (!decl) return res.status(404).json({ error: "Déclaration introuvable" });

    if (statut === "declaree") {
      if (decl.statut !== "brouillon") return res.status(400).json({ error: "Seule une déclaration en brouillon peut être déclarée" });
      const libelle = `Déclaration TVA - ${String(decl.periode_mois).padStart(2, "0")}/${decl.periode_annee}`;
      const lignes = [];
      if (decl.tva_collectee > 0) lignes.push({ compte_numero: "443100", debit: decl.tva_collectee, libelle });
      if (decl.tva_deductible > 0) lignes.push({ compte_numero: "445200", credit: decl.tva_deductible, libelle });
      const solde = decl.tva_collectee - decl.tva_deductible;
      if (solde > 0) lignes.push({ compte_numero: "444000", credit: solde, libelle });
      else if (solde < 0) lignes.push({ compte_numero: "444000", debit: -solde, libelle });

      const ecriture = await passerEcriture({
        journal: "OD", date_ecriture: new Date().toISOString().slice(0, 10), libelle,
        lignes, source_type: "tva_declaration", source_id: decl.id, created_by: req.profil?.id || null,
      });
      if (!ecriture) return res.status(400).json({ error: "Échec de la génération de l'écriture de déclaration" });

      const { data, error } = await supabase.from("comptabilite_tva_declarations").update({
        statut: "declaree", date_declaration: new Date().toISOString().slice(0, 10), ecriture_id: ecriture.id,
      }).eq("id", decl.id).select().single();
      if (error) throw error;
      return res.json({ declaration: data });
    }

    // statut === "payee"
    if (decl.statut !== "declaree") return res.status(400).json({ error: "La déclaration doit d'abord être déclarée" });
    const montant = decl.tva_a_payer;
    if (montant > 0) {
      await enregistrerMouvementTresorerie({
        type: "sortie", categorie: "tva", montant, date_mouvement: new Date().toISOString().slice(0, 10),
        source_type: "tva_declaration", source_id: decl.id, description: `Paiement TVA - ${String(decl.periode_mois).padStart(2, "0")}/${decl.periode_annee}`,
        mode_paiement: req.body.mode_paiement || "virement", created_by: req.profil?.id || null,
      });
      await passerEcriture({
        journal: "BQ", date_ecriture: new Date().toISOString().slice(0, 10), libelle: `Paiement TVA - ${String(decl.periode_mois).padStart(2, "0")}/${decl.periode_annee}`,
        source_type: "tva_declaration", source_id: decl.id, created_by: req.profil?.id || null,
        lignes: [
          { compte_numero: "444000", debit: montant },
          { compte_numero: compteTresorerie(req.body.mode_paiement), credit: montant },
        ],
      });
    }
    const { data, error } = await supabase.from("comptabilite_tva_declarations").update({
      statut: "payee", date_paiement: new Date().toISOString().slice(0, 10),
    }).eq("id", decl.id).select().single();
    if (error) throw error;
    res.json({ declaration: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
