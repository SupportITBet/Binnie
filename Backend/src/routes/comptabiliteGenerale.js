// routes/comptabiliteGenerale.js - Comptabilité générale en partie double (SYSCOHADA, bet-elearning)
//
// Cœur du système comptable : plan comptable + journal d'écritures débit/crédit.
// `passerEcriture()` est appelée automatiquement par comptabilite.js et elearning.js à
// chaque facture, paiement, dépense ou paiement coach - jamais de saisie manuelle pour
// les opérations courantes. Le module "Opérations diverses" (OD) reste disponible pour
// les régularisations (frais bancaires, amortissements...).

import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();
console.log("✅ Route comptabilité générale chargée");

// Compte de trésorerie selon le mode de paiement - tout ce qui n'est pas espèces passe en banque.
export function compteTresorerie(mode) {
  return (mode || "").toLowerCase() === "especes" ? "571000" : "512000";
}

// Mapping catégorie (dépenses/factures d'achat) → compte de charge SYSCOHADA.
export const COMPTE_PAR_CATEGORIE = {
  loyer: "613000", salaires: "661000", marketing: "623000", materiel: "605000",
  services: "611000", utilities: "626000", autre: "628000",
};

/* ── Helper central : passer une écriture équilibrée ─────────────── */
export async function passerEcriture({ journal, date_ecriture, libelle, lignes, source_type, source_id, created_by }) {
  const totalDebit  = lignes.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    console.error(`[comptabilite-generale] écriture déséquilibrée refusée (${libelle}) - débit ${totalDebit} ≠ crédit ${totalCredit}`);
    return null;
  }
  if (totalDebit <= 0) return null;

  const dateEcr = date_ecriture || new Date().toISOString().slice(0, 10);
  const annee = new Date(dateEcr).getFullYear();

  const { data: exerciceCloture } = await supabase.from("comptabilite_exercices").select("id").eq("annee", annee).eq("statut", "cloture").maybeSingle();
  if (exerciceCloture) {
    console.error(`[comptabilite-generale] écriture refusée - l'exercice ${annee} est clôturé (${libelle})`);
    return null;
  }
  const { count } = await supabase.from("comptabilite_ecritures").select("*", { count: "exact", head: true })
    .eq("journal", journal).gte("date_ecriture", `${annee}-01-01`).lte("date_ecriture", `${annee}-12-31`);
  const numero_piece = `${journal}-${annee}-${String((count || 0) + 1).padStart(4, "0")}`;

  const { data: ecriture, error } = await supabase.from("comptabilite_ecritures").insert({
    numero_piece, journal, date_ecriture: dateEcr, libelle,
    source_type: source_type || null, source_id: source_id ? String(source_id) : null,
    created_by: created_by || null,
  }).select().single();
  if (error) { console.error("[comptabilite-generale] échec création écriture:", error.message); return null; }

  const lignesToInsert = lignes.filter(l => (l.debit || l.credit)).map((l, i) => ({
    ecriture_id: ecriture.id, compte_numero: l.compte_numero, libelle: l.libelle || libelle,
    debit: l.debit || 0, credit: l.credit || 0, ordre: i,
  }));
  const { error: e2 } = await supabase.from("comptabilite_ecritures_lignes").insert(lignesToInsert);
  if (e2) { console.error("[comptabilite-generale] échec lignes écriture:", e2.message); return null; }

  return ecriture;
}

/* ══════════════════════════════════════════════════════════════
   PLAN COMPTABLE
══════════════════════════════════════════════════════════════ */
router.get("/plan-comptable", authenticateAdmin, requirePermission("finances_generale", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("comptabilite_plan_comptable").select("*").order("numero");
    if (error) throw error;
    res.json({ comptes: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/plan-comptable", authenticateAdmin, requirePermission("finances_generale", "manage"), async (req, res) => {
  try {
    const { numero, libelle, classe, type } = req.body;
    if (!numero || !libelle || !classe || !type) return res.status(400).json({ error: "Champs manquants" });
    const { data, error } = await supabase.from("comptabilite_plan_comptable").insert({ numero, libelle, classe, type }).select().single();
    if (error) throw error;
    res.status(201).json({ compte: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/plan-comptable/:numero", authenticateAdmin, requirePermission("finances_generale", "manage"), async (req, res) => {
  try {
    const allowed = ["libelle", "actif"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const { data, error } = await supabase.from("comptabilite_plan_comptable").update(updates).eq("numero", req.params.numero).select().single();
    if (error) throw error;
    res.json({ compte: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   JOURNAL - liste des écritures (avec leurs lignes)
══════════════════════════════════════════════════════════════ */
router.get("/journal", authenticateAdmin, requirePermission("finances_generale", "read"), async (req, res) => {
  try {
    const { journal, mois, annee } = req.query;
    let q = supabase.from("comptabilite_ecritures").select("*, lignes:comptabilite_ecritures_lignes(*)").order("date_ecriture", { ascending: false }).order("numero_piece", { ascending: false });
    if (journal) q = q.eq("journal", journal);
    if (mois && annee) {
      const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
      const fin   = new Date(annee, mois, 0).toISOString().slice(0, 10);
      q = q.gte("date_ecriture", debut).lte("date_ecriture", fin);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json({ ecritures: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Écriture manuelle (opérations diverses) - seul cas de saisie libre.
router.post("/journal/manuel", authenticateAdmin, requirePermission("finances_generale", "manage"), async (req, res) => {
  try {
    const { date_ecriture, libelle, lignes } = req.body;
    if (!libelle?.trim()) return res.status(400).json({ error: "Libellé obligatoire" });
    if (!Array.isArray(lignes) || lignes.length < 2) return res.status(400).json({ error: "Une écriture nécessite au moins 2 lignes" });

    const ecriture = await passerEcriture({
      journal: "OD", date_ecriture, libelle, lignes, source_type: "manuel", created_by: req.profil?.id || null,
    });
    if (!ecriture) return res.status(400).json({ error: "Écriture déséquilibrée (le total débit doit égaler le total crédit)" });
    res.status(201).json({ ecriture });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GRAND LIVRE - mouvements d'un compte avec solde progressif
══════════════════════════════════════════════════════════════ */
router.get("/grand-livre/:compte", authenticateAdmin, requirePermission("finances_generale", "read"), async (req, res) => {
  try {
    const { data: compte } = await supabase.from("comptabilite_plan_comptable").select("*").eq("numero", req.params.compte).maybeSingle();
    if (!compte) return res.status(404).json({ error: "Compte introuvable" });

    const { data: lignes, error } = await supabase
      .from("comptabilite_ecritures_lignes")
      .select("*, ecriture:comptabilite_ecritures(numero_piece, date_ecriture, journal, libelle, source_type, source_id)")
      .eq("compte_numero", req.params.compte);
    if (error) throw error;

    const tries = (lignes || []).sort((a, b) => {
      const da = a.ecriture?.date_ecriture || ""; const db = b.ecriture?.date_ecriture || "";
      return da === db ? (a.ecriture?.numero_piece || "").localeCompare(b.ecriture?.numero_piece || "") : da.localeCompare(db);
    });

    let solde = 0;
    const mouvements = tries.map(l => {
      solde += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      return {
        date: l.ecriture?.date_ecriture, piece: l.ecriture?.numero_piece, journal: l.ecriture?.journal,
        libelle: l.libelle || l.ecriture?.libelle, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0,
        solde_progressif: solde, source_type: l.ecriture?.source_type, source_id: l.ecriture?.source_id,
      };
    });

    res.json({ compte, mouvements, solde_final: solde });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   BALANCE GÉNÉRALE - total débit/crédit/solde par compte
══════════════════════════════════════════════════════════════ */
router.get("/balance", authenticateAdmin, requirePermission("finances_generale", "read"), async (req, res) => {
  try {
    const { data: comptes } = await supabase.from("comptabilite_plan_comptable").select("*").order("numero");
    const { data: lignes, error } = await supabase.from("comptabilite_ecritures_lignes").select("compte_numero, debit, credit");
    if (error) throw error;

    const parCompte = {};
    (lignes || []).forEach(l => {
      if (!parCompte[l.compte_numero]) parCompte[l.compte_numero] = { debit: 0, credit: 0 };
      parCompte[l.compte_numero].debit  += Number(l.debit)  || 0;
      parCompte[l.compte_numero].credit += Number(l.credit) || 0;
    });

    const balance = (comptes || [])
      .map(c => {
        const m = parCompte[c.numero] || { debit: 0, credit: 0 };
        const solde = m.debit - m.credit;
        return {
          numero: c.numero, libelle: c.libelle, classe: c.classe, type: c.type,
          total_debit: m.debit, total_credit: m.credit,
          solde_debiteur: solde > 0 ? solde : 0, solde_crediteur: solde < 0 ? -solde : 0,
        };
      })
      .filter(c => c.total_debit > 0 || c.total_credit > 0);

    res.json({
      balance,
      totaux: {
        debit: balance.reduce((s, c) => s + c.total_debit, 0),
        credit: balance.reduce((s, c) => s + c.total_credit, 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   BILAN - Actif / Passif (soldes des comptes de classe 1-2-4-5)
══════════════════════════════════════════════════════════════ */
router.get("/bilan", authenticateAdmin, requirePermission("finances_generale", "read"), async (req, res) => {
  try {
    const { data: comptes } = await supabase.from("comptabilite_plan_comptable").select("*");
    const { data: lignes, error } = await supabase.from("comptabilite_ecritures_lignes").select("compte_numero, debit, credit");
    if (error) throw error;

    const parCompte = {};
    (lignes || []).forEach(l => {
      if (!parCompte[l.compte_numero]) parCompte[l.compte_numero] = { debit: 0, credit: 0 };
      parCompte[l.compte_numero].debit  += Number(l.debit)  || 0;
      parCompte[l.compte_numero].credit += Number(l.credit) || 0;
    });

    // Résultat de l'exercice = produits (classe 7) − charges (classe 6), injecté au passif.
    let produits = 0, charges = 0;
    (comptes || []).forEach(c => {
      const m = parCompte[c.numero]; if (!m) return;
      if (c.classe === 7) produits += m.credit - m.debit;
      if (c.classe === 6) charges  += m.debit - m.credit;
    });
    const resultatExercice = produits - charges;

    const actif = [], passif = [];
    (comptes || []).forEach(c => {
      const m = parCompte[c.numero] || { debit: 0, credit: 0 };
      const solde = m.debit - m.credit;
      if (solde === 0 || c.classe === 6 || c.classe === 7) return; // charges/produits n'apparaissent pas au bilan, seulement leur résultat net
      if (c.type === 'actif' && solde > 0) actif.push({ numero: c.numero, libelle: c.libelle, montant: solde });
      if (c.type === 'passif' && -solde > 0) passif.push({ numero: c.numero, libelle: c.libelle, montant: -solde });
    });
    passif.push({ numero: '120000', libelle: "Résultat de l'exercice (calculé)", montant: resultatExercice });

    const totalActif  = actif.reduce((s, a) => s + a.montant, 0);
    const totalPassif = passif.reduce((s, p) => s + p.montant, 0);

    res.json({ actif, passif, total_actif: totalActif, total_passif: totalPassif, equilibre: Math.round(totalActif) === Math.round(totalPassif), resultat_exercice: resultatExercice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   COMPTE DE RÉSULTAT - Charges / Produits (classe 6 / classe 7)
══════════════════════════════════════════════════════════════ */
router.get("/compte-resultat", authenticateAdmin, requirePermission("finances_generale", "read"), async (req, res) => {
  try {
    const { mois, annee } = req.query;
    const { data: comptes } = await supabase.from("comptabilite_plan_comptable").select("*").in("classe", [6, 7]);

    let q = supabase.from("comptabilite_ecritures_lignes").select("compte_numero, debit, credit, ecriture:comptabilite_ecritures(date_ecriture)");
    const { data: lignes, error } = await q;
    if (error) throw error;

    const filtrees = (lignes || []).filter(l => {
      if (!mois || !annee) return true;
      const d = l.ecriture?.date_ecriture || "";
      return d.slice(0, 7) === `${annee}-${String(mois).padStart(2, "0")}`;
    });

    const parCompte = {};
    filtrees.forEach(l => {
      if (!parCompte[l.compte_numero]) parCompte[l.compte_numero] = { debit: 0, credit: 0 };
      parCompte[l.compte_numero].debit  += Number(l.debit)  || 0;
      parCompte[l.compte_numero].credit += Number(l.credit) || 0;
    });

    const charges = [], produits = [];
    (comptes || []).forEach(c => {
      const m = parCompte[c.numero]; if (!m) return;
      if (c.classe === 6 && m.debit - m.credit > 0) charges.push({ numero: c.numero, libelle: c.libelle, montant: m.debit - m.credit });
      if (c.classe === 7 && m.credit - m.debit > 0) produits.push({ numero: c.numero, libelle: c.libelle, montant: m.credit - m.debit });
    });

    const totalCharges = charges.reduce((s, c) => s + c.montant, 0);
    const totalProduits = produits.reduce((s, p) => s + p.montant, 0);

    res.json({ charges, produits, total_charges: totalCharges, total_produits: totalProduits, resultat_net: totalProduits - totalCharges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   CLÔTURE D'EXERCICE
══════════════════════════════════════════════════════════════ */
router.get("/exercices", authenticateAdmin, requirePermission("finances_generale", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("comptabilite_exercices").select("*").order("annee", { ascending: false });
    if (error) throw error;
    res.json({ exercices: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/exercices/:annee/cloturer", authenticateAdmin, requirePermission("finances_generale", "manage"), async (req, res) => {
  try {
    const annee = parseInt(req.params.annee, 10);
    const { data: deja } = await supabase.from("comptabilite_exercices").select("id, statut").eq("annee", annee).maybeSingle();
    if (deja?.statut === "cloture") return res.status(400).json({ error: "Cet exercice est déjà clôturé" });

    const { data: comptes } = await supabase.from("comptabilite_plan_comptable").select("*").in("classe", [6, 7]);
    const { data: lignes, error } = await supabase
      .from("comptabilite_ecritures_lignes")
      .select("compte_numero, debit, credit, ecriture:comptabilite_ecritures(date_ecriture)");
    if (error) throw error;

    const filtrees = (lignes || []).filter(l => (l.ecriture?.date_ecriture || "").startsWith(`${annee}-`));
    const parCompte = {};
    filtrees.forEach(l => {
      if (!parCompte[l.compte_numero]) parCompte[l.compte_numero] = { debit: 0, credit: 0 };
      parCompte[l.compte_numero].debit  += Number(l.debit)  || 0;
      parCompte[l.compte_numero].credit += Number(l.credit) || 0;
    });

    const lignesCloture = [];
    let resultat = 0;
    (comptes || []).forEach(c => {
      const m = parCompte[c.numero]; if (!m) return;
      if (c.classe === 6) {
        const solde = m.debit - m.credit;
        if (solde > 0) { lignesCloture.push({ compte_numero: c.numero, credit: solde, libelle: `Clôture ${annee} - ${c.libelle}` }); resultat -= solde; }
      }
      if (c.classe === 7) {
        const solde = m.credit - m.debit;
        if (solde > 0) { lignesCloture.push({ compte_numero: c.numero, debit: solde, libelle: `Clôture ${annee} - ${c.libelle}` }); resultat += solde; }
      }
    });

    if (lignesCloture.length === 0) {
      return res.status(400).json({ error: "Aucun mouvement de charge/produit trouvé pour cet exercice - rien à clôturer" });
    }

    if (resultat >= 0) lignesCloture.push({ compte_numero: "120000", credit: resultat, libelle: `Résultat de l'exercice ${annee}` });
    else lignesCloture.push({ compte_numero: "120000", debit: -resultat, libelle: `Résultat de l'exercice ${annee}` });

    const ecriture = await passerEcriture({
      journal: "OD", date_ecriture: `${annee}-12-31`, libelle: `Écriture de clôture - exercice ${annee}`,
      lignes: lignesCloture, source_type: "cloture_exercice", created_by: req.profil?.id || null,
    });
    if (!ecriture) return res.status(400).json({ error: "Échec de la génération de l'écriture de clôture (vérifier l'équilibre)" });

    const payload = {
      annee, statut: "cloture", date_cloture: new Date().toISOString(), cloture_par: req.profil?.id || null,
      resultat_exercice: resultat, ecriture_cloture_id: ecriture.id,
    };
    const { data: exercice, error: e2 } = deja
      ? await supabase.from("comptabilite_exercices").update(payload).eq("id", deja.id).select().single()
      : await supabase.from("comptabilite_exercices").insert(payload).select().single();
    if (e2) throw e2;

    res.json({ exercice, ecriture });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
