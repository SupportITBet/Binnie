// routes/dashComptabiliteRrdBcBacn.js - RRD / BC / BACN (dash, miroir exact
// de comptabiliteRrdBcBacn.js sur les tables dash_comptabilite_*)
import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { enregistrerMouvementTresorerie } from "./dashComptabilite.js";
import { passerEcriture, compteTresorerie } from "./dashComptabiliteGenerale.js";

const router = express.Router();
console.log("✅ Route dash comptabilité RRD/BC/BACN chargée");

async function prochainNumero(table, prefixe) {
  const annee = new Date().getFullYear();
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true })
    .gte("created_at", `${annee}-01-01`);
  return `${prefixe}-${annee}-${String((count || 0) + 1).padStart(4, "0")}`;
}

/* ══════════════════════════════════════════════════════════════
   RRD - Registre des Recettes et Dépenses (lecture seule)
══════════════════════════════════════════════════════════════ */
router.get("/rrd", authenticateAdmin, requirePermission("dash_finances_tresorerie", "read"), async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let q = supabase.from("dash_comptabilite_tresorerie_mouvements").select("*").order("date_mouvement", { ascending: true }).order("created_at", { ascending: true });
    if (date_debut) q = q.gte("date_mouvement", date_debut);
    if (date_fin)   q = q.lte("date_mouvement", date_fin);
    const { data, error } = await q;
    if (error) throw error;

    let solde = 0;
    const registre = (data || []).map(m => {
      solde += m.type === "entree" ? Number(m.montant) : -Number(m.montant);
      return {
        ...m,
        recette: m.type === "entree" ? Number(m.montant) : 0,
        depense: m.type === "sortie" ? Number(m.montant) : 0,
        solde_cumule: solde,
      };
    });

    res.json({
      registre,
      total_recettes: registre.reduce((s, r) => s + r.recette, 0),
      total_depenses: registre.reduce((s, r) => s + r.depense, 0),
      solde_final: solde,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════════
   BC - Bon de Caisse
══════════════════════════════════════════════════════════════ */
router.get("/bons-caisse", authenticateAdmin, requirePermission("dash_finances_tresorerie", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("dash_comptabilite_bons_caisse").select("*").order("date_bc", { ascending: false });
    if (error) throw error;
    res.json({ bons_caisse: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/bons-caisse", authenticateAdmin, requirePermission("dash_finances_tresorerie", "manage"), async (req, res) => {
  try {
    const { beneficiaire, motif, montant, date_bc, mode_paiement, statut, justificatif_url, notes } = req.body;
    if (!beneficiaire?.trim()) return res.status(400).json({ error: "Le bénéficiaire est obligatoire" });
    if (!motif?.trim())        return res.status(400).json({ error: "Le motif est obligatoire" });
    if (!montant || montant <= 0) return res.status(400).json({ error: "Montant invalide" });

    const numero = await prochainNumero("dash_comptabilite_bons_caisse", "BC");
    const { data, error } = await supabase.from("dash_comptabilite_bons_caisse").insert({
      numero, beneficiaire: beneficiaire.trim(), motif: motif.trim(), montant: parseFloat(montant),
      date_bc: date_bc || new Date().toISOString().slice(0, 10),
      mode_paiement: mode_paiement || "especes", statut: statut || "valide",
      justificatif_url: justificatif_url || null, notes: notes || null,
      created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;

    if (data.statut === "valide") {
      await enregistrerMouvementTresorerie({
        type: "sortie", categorie: "bon_caisse", montant: data.montant,
        date_mouvement: data.date_bc, source_type: "bon_caisse", source_id: data.id,
        description: `Bon de caisse ${data.numero} - ${data.beneficiaire} (${data.motif})`,
        mode_paiement: data.mode_paiement, created_by: req.profil?.id || null,
      });
      passerEcriture({
        journal: "BQ", date_ecriture: data.date_bc, libelle: `Bon de caisse ${data.numero} - ${data.beneficiaire}`,
        source_type: "bon_caisse", source_id: data.id, created_by: req.profil?.id || null,
        lignes: [
          { compte_numero: "628000", debit: data.montant },
          { compte_numero: compteTresorerie(data.mode_paiement), credit: data.montant },
        ],
      }).catch(() => {});
    }

    res.status(201).json({ bon_caisse: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/bons-caisse/:id/annuler", authenticateAdmin, requirePermission("dash_finances_tresorerie", "manage"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("dash_comptabilite_bons_caisse").update({ statut: "annule" }).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ bon_caisse: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/bons-caisse/:id", authenticateAdmin, requirePermission("dash_finances_tresorerie", "manage"), async (req, res) => {
  try {
    const { error } = await supabase.from("dash_comptabilite_bons_caisse").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════════
   BACN - Bordereau d'Achat Conforme aux Normes
══════════════════════════════════════════════════════════════ */
router.get("/bordereaux-achat", authenticateAdmin, requirePermission("dash_finances_fournisseurs", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("dash_comptabilite_bordereaux_achat").select("*").order("date_bacn", { ascending: false });
    if (error) throw error;
    res.json({ bordereaux_achat: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/bordereaux-achat", authenticateAdmin, requirePermission("dash_finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { fournisseur_nom, lignes, date_bacn, statut, justificatif_url, notes } = req.body;
    if (!fournisseur_nom?.trim()) return res.status(400).json({ error: "Le fournisseur est obligatoire" });
    const lignesArr = Array.isArray(lignes) ? lignes : [];
    if (lignesArr.length === 0) return res.status(400).json({ error: "Au moins une ligne d'achat est requise" });

    const montantTotal = lignesArr.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0), 0);
    const lignesCalc = lignesArr.map(l => ({
      designation: l.designation || "", quantite: Number(l.quantite) || 0, prix_unitaire: Number(l.prix_unitaire) || 0,
      montant: (Number(l.quantite) || 0) * (Number(l.prix_unitaire) || 0),
    }));

    const numero = await prochainNumero("dash_comptabilite_bordereaux_achat", "BACN");
    const { data, error } = await supabase.from("dash_comptabilite_bordereaux_achat").insert({
      numero, fournisseur_nom: fournisseur_nom.trim(), lignes: lignesCalc, montant_total: montantTotal,
      date_bacn: date_bacn || new Date().toISOString().slice(0, 10), statut: statut || "brouillon",
      justificatif_url: justificatif_url || null, notes: notes || null,
      created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;

    res.status(201).json({ bordereau_achat: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/bordereaux-achat/:id/valider", authenticateAdmin, requirePermission("dash_finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("dash_comptabilite_bordereaux_achat").update({ statut: "valide" }).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ bordereau_achat: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/bordereaux-achat/:id/annuler", authenticateAdmin, requirePermission("dash_finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("dash_comptabilite_bordereaux_achat").update({ statut: "annule" }).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ bordereau_achat: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/bordereaux-achat/:id", authenticateAdmin, requirePermission("dash_finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { error } = await supabase.from("dash_comptabilite_bordereaux_achat").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
