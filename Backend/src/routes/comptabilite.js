// routes/comptabilite.js - Facturation, encaissements, dépenses et trésorerie (bet-elearning)
//
// Système entièrement indépendant des tables spécifiques à dash (factures_b2b,
// paiements_parcours appartiennent à dash/CorporateDashboard-CommercialDashboard) - ne
// jamais croiser ces deux mondes, cf. règle de séparation des plateformes déjà établie.
// `paiements_entreprises`/`comptes_entreprises` (entreprise.js) sont en revanche le vrai
// système B2B existant de bet-elearning lui-même (onglet "Entreprises") - synchronisés ici
// avec le registre de trésorerie et le suivi des paiements.
//
// Le registre de trésorerie (comptabilite_tresorerie_mouvements) n'est jamais écrit
// directement par le frontend : il est alimenté automatiquement par ce fichier à chaque
// encaissement confirmé ou dépense saisie, et par seances.js quand une fiche d'honoraires
// coach passe au statut "paye" - pour que la trésorerie reflète les vrais mouvements
// bancaires sans double-saisie ni risque de désynchronisation.

import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { passerEcriture, compteTresorerie, COMPTE_PAR_CATEGORIE } from "./comptabiliteGenerale.js";

const router = express.Router();
console.log("✅ Route comptabilité chargée");

/* ── Helper : enregistrer un mouvement de trésorerie ─────────────── */
export async function enregistrerMouvementTresorerie({
  type, categorie, montant, date_mouvement, source_type, source_id, description, mode_paiement, created_by,
}) {
  if (!montant || montant <= 0) return;
  const { error } = await supabase.from("comptabilite_tresorerie_mouvements").insert({
    type, categorie, montant,
    date_mouvement: date_mouvement || new Date().toISOString().slice(0, 10),
    source_type: source_type || null,
    source_id:   source_id ? String(source_id) : null,
    description: description || null,
    mode_paiement: mode_paiement || null,
    created_by:  created_by || null,
  });
  if (error) console.error("[comptabilite] échec enregistrement mouvement trésorerie:", error.message);
}

/* ── Helper : miroir d'un versement entreprise (entreprise.js) dans le suivi des
   paiements + la trésorerie - un seul appel, jamais de double-saisie manuelle. ── */
export async function enregistrerEncaissementEntreprise({
  client_nom, montant, date_paiement, mode_paiement, reference, notes, created_by,
}) {
  if (!montant || montant <= 0) return null;
  const { data, error } = await supabase.from("comptabilite_paiements").insert({
    facture_id: null, reference: reference || null, client_nom: client_nom || "Entreprise",
    client_type: "entreprise",
    montant, date_paiement: date_paiement || new Date().toISOString().slice(0, 10),
    mode_paiement: mode_paiement || "virement", statut: "recu", notes: notes || null,
    created_by: created_by || null,
  }).select().single();
  if (error) { console.error("[comptabilite] échec miroir paiement entreprise:", error.message); return null; }

  await enregistrerMouvementTresorerie({
    type: "entree", categorie: "encaissement_client_entreprise", montant,
    date_mouvement: data.date_paiement, source_type: "paiement", source_id: data.id,
    description: `Versement - ${data.client_nom}`, mode_paiement: data.mode_paiement, created_by,
  });
  passerEcriture({
    journal: "BQ", date_ecriture: data.date_paiement, libelle: `Versement - ${data.client_nom}`,
    source_type: "paiement", source_id: data.id, created_by,
    lignes: [
      { compte_numero: compteTresorerie(data.mode_paiement), debit: montant },
      { compte_numero: "411000", credit: montant },
    ],
  }).catch(() => {});
  return data;
}

/* ══════════════════════════════════════════════════════════════
   FACTURES
══════════════════════════════════════════════════════════════ */
router.get("/factures", authenticateAdmin, requirePermission("finances_facturation", "read"), async (req, res) => {
  try {
    const { statut, client_type } = req.query;
    let q = supabase.from("comptabilite_factures").select("*").order("date_emission", { ascending: false });
    if (statut)      q = q.eq("statut", statut);
    if (client_type) q = q.eq("client_type", client_type);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ factures: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/factures", authenticateAdmin, requirePermission("finances_facturation", "manage"), async (req, res) => {
  try {
    const { client_nom, client_type, client_email, montant_ht, tva_taux, date_echeance, lignes, notes } = req.body;
    if (!client_nom?.trim()) return res.status(400).json({ error: "Le nom du client est obligatoire" });
    if (!montant_ht || montant_ht <= 0) return res.status(400).json({ error: "Montant HT invalide" });

    const tauxTva = parseFloat(tva_taux) || 0;
    const montantHt  = parseFloat(montant_ht);
    const montantTtc = Math.round(montantHt * (1 + tauxTva / 100));

    const annee = new Date().getFullYear();
    const { count } = await supabase.from("comptabilite_factures").select("*", { count: "exact", head: true })
      .gte("created_at", `${annee}-01-01`);
    const numero = `FA-${annee}-${String((count || 0) + 1).padStart(4, "0")}`;

    const { data, error } = await supabase.from("comptabilite_factures").insert({
      numero, client_nom: client_nom.trim(), client_type: client_type || "entreprise",
      client_email: client_email || null,
      montant_ht: montantHt, tva_taux: tauxTva, montant_ttc: montantTtc, montant_paye: 0,
      date_echeance: date_echeance || null, lignes: lignes || [], notes: notes || null,
      statut: "envoyee", created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;

    const tvaMontant = montantTtc - montantHt;
    passerEcriture({
      journal: "VT", date_ecriture: data.date_emission, libelle: `Facture ${data.numero} - ${data.client_nom}`,
      source_type: "facture", source_id: data.id, created_by: req.profil?.id || null,
      lignes: [
        { compte_numero: "411000", debit: montantTtc },
        { compte_numero: "706000", credit: montantHt },
        ...(tvaMontant > 0 ? [{ compte_numero: "443100", credit: tvaMontant }] : []),
      ],
    }).catch(() => {});

    res.status(201).json({ facture: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/factures/:id", authenticateAdmin, requirePermission("finances_facturation", "manage"), async (req, res) => {
  try {
    const allowed = ["client_nom", "client_type", "client_email", "date_echeance", "statut", "notes", "lignes"];
    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const { data, error } = await supabase.from("comptabilite_factures")
      .update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ facture: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/factures/:id", authenticateAdmin, requirePermission("finances_facturation", "manage"), async (req, res) => {
  try {
    const { data: pmts } = await supabase.from("comptabilite_paiements").select("id").eq("facture_id", req.params.id).limit(1);
    if (pmts?.length) return res.status(409).json({ error: "Facture liée à des paiements - impossible de la supprimer" });
    const { error } = await supabase.from("comptabilite_factures").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   RELANCES CLIENTS
══════════════════════════════════════════════════════════════ */
router.get("/factures/:id/relances", authenticateAdmin, requirePermission("finances_facturation", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("comptabilite_relances").select("*").eq("facture_id", req.params.id).order("date_relance", { ascending: false });
    if (error) throw error;
    res.json({ relances: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/factures/:id/relancer", authenticateAdmin, requirePermission("finances_facturation", "manage"), async (req, res) => {
  try {
    const { data: facture } = await supabase.from("comptabilite_factures").select("*").eq("id", req.params.id).maybeSingle();
    if (!facture) return res.status(404).json({ error: "Facture introuvable" });
    const { data, error } = await supabase.from("comptabilite_relances").insert({
      facture_id: facture.id, type: "manuelle", niveau: req.body.niveau || 1,
      message: req.body.message || `Relance manuelle - facture ${facture.numero} (${facture.client_nom})`,
      created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ relance: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   BUDGETS / PRÉVISIONNEL
══════════════════════════════════════════════════════════════ */
router.get("/budgets", authenticateAdmin, requirePermission("finances_budgets", "read"), async (req, res) => {
  try {
    const { annee } = req.query;
    let q = supabase.from("comptabilite_budgets").select("*").order("categorie");
    if (annee) q = q.eq("annee", annee);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ budgets: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/budgets", authenticateAdmin, requirePermission("finances_budgets", "manage"), async (req, res) => {
  try {
    const { annee, categorie, type, montant_prevu, notes } = req.body;
    if (!annee || !categorie?.trim() || !type) return res.status(400).json({ error: "Année, catégorie et type obligatoires" });
    const { data, error } = await supabase.from("comptabilite_budgets")
      .upsert({ annee, categorie: categorie.trim(), type, montant_prevu: parseFloat(montant_prevu) || 0, notes: notes || null, created_by: req.profil?.id || null, updated_at: new Date().toISOString() }, { onConflict: "annee,categorie,type" })
      .select().single();
    if (error) throw error;
    res.status(201).json({ budget: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/budgets/:id", authenticateAdmin, requirePermission("finances_budgets", "manage"), async (req, res) => {
  try {
    const { montant_prevu, notes } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (montant_prevu !== undefined) updates.montant_prevu = parseFloat(montant_prevu) || 0;
    if (notes !== undefined) updates.notes = notes;
    const { data, error } = await supabase.from("comptabilite_budgets").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ budget: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/budgets/:id", authenticateAdmin, requirePermission("finances_budgets", "manage"), async (req, res) => {
  try {
    const { error } = await supabase.from("comptabilite_budgets").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const CATEGORIES_BUDGET_CHARGE = ["loyer", "salaires", "marketing", "materiel", "services", "utilities", "autre"];

router.get("/budgets/suivi", authenticateAdmin, requirePermission("finances_budgets", "read"), async (req, res) => {
  try {
    const annee = parseInt(req.query.annee, 10) || new Date().getFullYear();
    const debut = `${annee}-01-01`, fin = `${annee}-12-31`;

    const { data: budgets } = await supabase.from("comptabilite_budgets").select("*").eq("annee", annee);
    const { data: depenses } = await supabase.from("comptabilite_depenses").select("categorie, montant, date_depense").gte("date_depense", debut).lte("date_depense", fin);
    const { data: paiementsFourn } = await supabase.from("comptabilite_paiements_fournisseurs").select("montant, date_paiement, facture_achat_id").gte("date_paiement", debut).lte("date_paiement", fin);
    const { data: facturesAchat } = await supabase.from("comptabilite_factures_achat").select("id, categorie");
    const { data: paiementsRecus } = await supabase.from("comptabilite_paiements").select("montant, date_paiement, statut").eq("statut", "recu").gte("date_paiement", debut).lte("date_paiement", fin);

    const catParFactureAchat = {};
    (facturesAchat || []).forEach(f => { catParFactureAchat[f.id] = f.categorie || "autre"; });

    const reelCharge = {};
    (depenses || []).forEach(d => { reelCharge[d.categorie] = (reelCharge[d.categorie] || 0) + Number(d.montant || 0); });
    (paiementsFourn || []).forEach(p => {
      const cat = catParFactureAchat[p.facture_achat_id] || "autre";
      reelCharge[cat] = (reelCharge[cat] || 0) + Number(p.montant || 0);
    });
    const reelProduitTotal = (paiementsRecus || []).reduce((s, p) => s + Number(p.montant || 0), 0);

    const suivi = (budgets || []).map(b => {
      const reel = b.type === "produit" ? reelProduitTotal : (reelCharge[b.categorie] || 0);
      const prevu = Number(b.montant_prevu || 0);
      return { id: b.id, categorie: b.categorie, type: b.type, prevu, reel, ecart: reel - prevu, pct: prevu > 0 ? Math.round((reel / prevu) * 1000) / 10 : null };
    });

    res.json({ annee, suivi, categories_charge_disponibles: CATEGORIES_BUDGET_CHARGE });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   COMPTABILITÉ ANALYTIQUE
══════════════════════════════════════════════════════════════ */
router.get("/axes-analytiques", authenticateAdmin, requirePermission("finances_analytique", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("comptabilite_axes_analytiques").select("*").order("libelle");
    if (error) throw error;
    res.json({ axes: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/axes-analytiques", authenticateAdmin, requirePermission("finances_analytique", "manage"), async (req, res) => {
  try {
    const { code, libelle } = req.body;
    if (!code?.trim() || !libelle?.trim()) return res.status(400).json({ error: "Code et libellé obligatoires" });
    const { data, error } = await supabase.from("comptabilite_axes_analytiques").insert({ code: code.trim(), libelle: libelle.trim() }).select().single();
    if (error) throw error;
    res.status(201).json({ axe: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/axes-analytiques/:id", authenticateAdmin, requirePermission("finances_analytique", "manage"), async (req, res) => {
  try {
    const allowed = ["libelle", "actif"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const { data, error } = await supabase.from("comptabilite_axes_analytiques").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ axe: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analytique/repartition", authenticateAdmin, requirePermission("finances_analytique", "read"), async (req, res) => {
  try {
    const now = new Date();
    const annee = parseInt(req.query.annee, 10) || now.getFullYear();
    const mois = req.query.mois ? parseInt(req.query.mois, 10) : null;
    const debut = mois ? `${annee}-${String(mois).padStart(2, "0")}-01` : `${annee}-01-01`;
    const fin   = mois ? new Date(annee, mois, 0).toISOString().slice(0, 10) : `${annee}-12-31`;

    const { data: axes } = await supabase.from("comptabilite_axes_analytiques").select("*");
    const { data: depenses } = await supabase.from("comptabilite_depenses").select("montant, axe_analytique_id, date_depense").gte("date_depense", debut).lte("date_depense", fin);
    const { data: achats } = await supabase.from("comptabilite_factures_achat").select("montant_ttc, axe_analytique_id, date_facture").gte("date_facture", debut).lte("date_facture", fin);

    const parAxe = {};
    (depenses || []).forEach(d => { const k = d.axe_analytique_id || "non_affecte"; parAxe[k] = (parAxe[k] || 0) + Number(d.montant || 0); });
    (achats || []).forEach(a => { const k = a.axe_analytique_id || "non_affecte"; parAxe[k] = (parAxe[k] || 0) + Number(a.montant_ttc || 0); });

    const repartition = (axes || []).map(a => ({ axe_id: a.id, code: a.code, libelle: a.libelle, montant: parAxe[a.id] || 0 }));
    if (parAxe.non_affecte) repartition.push({ axe_id: null, code: null, libelle: "Non affecté", montant: parAxe.non_affecte });

    res.json({ annee, mois, repartition, total: repartition.reduce((s, r) => s + r.montant, 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   PAIEMENTS (encaissements)
══════════════════════════════════════════════════════════════ */
router.get("/paiements", authenticateAdmin, requirePermission("finances_paiements", "read"), async (req, res) => {
  try {
    const { statut } = req.query;
    let q = supabase.from("comptabilite_paiements").select("*").order("date_paiement", { ascending: false });
    if (statut) q = q.eq("statut", statut);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ paiements: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recalcule montant_paye + statut d'une facture à partir de ses paiements réels
async function resyncFacture(factureId) {
  if (!factureId) return;
  const { data: facture } = await supabase.from("comptabilite_factures").select("montant_ttc").eq("id", factureId).maybeSingle();
  if (!facture) return;
  const { data: pmts } = await supabase.from("comptabilite_paiements").select("montant").eq("facture_id", factureId).eq("statut", "recu");
  const totalPaye = (pmts || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
  const statut = totalPaye <= 0 ? "envoyee" : totalPaye >= facture.montant_ttc ? "payee" : "partiellement_payee";
  await supabase.from("comptabilite_factures").update({ montant_paye: totalPaye, statut, updated_at: new Date().toISOString() }).eq("id", factureId);
}

// Un paiement sans facture liée est présumé particulier (aucune autre info disponible).
async function resolveClientType(factureId) {
  if (!factureId) return "particulier";
  const { data } = await supabase.from("comptabilite_factures").select("client_type").eq("id", factureId).maybeSingle();
  return data?.client_type || "particulier";
}

router.post("/paiements", authenticateAdmin, requirePermission("finances_paiements", "manage"), async (req, res) => {
  try {
    const { facture_id, reference, client_nom, montant, date_paiement, mode_paiement, statut, notes } = req.body;
    if (!client_nom?.trim()) return res.status(400).json({ error: "Le nom du client est obligatoire" });
    if (!montant || montant <= 0) return res.status(400).json({ error: "Montant invalide" });

    const clientType = facture_id ? await resolveClientType(facture_id) : "particulier";
    const { data, error } = await supabase.from("comptabilite_paiements").insert({
      facture_id: facture_id || null, reference: reference || null, client_nom: client_nom.trim(),
      client_type: clientType,
      montant: parseFloat(montant), date_paiement: date_paiement || new Date().toISOString().slice(0, 10),
      mode_paiement: mode_paiement || "virement", statut: statut || "recu", notes: notes || null,
      created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;

    if (data.facture_id) await resyncFacture(data.facture_id);

    if (data.statut === "recu") {
      await enregistrerMouvementTresorerie({
        type: "entree", categorie: `encaissement_client_${clientType}`, montant: data.montant,
        date_mouvement: data.date_paiement, source_type: "paiement", source_id: data.id,
        description: `Encaissement - ${data.client_nom}`, mode_paiement: data.mode_paiement,
        created_by: req.profil?.id || null,
      });
      passerEcriture({
        journal: "BQ", date_ecriture: data.date_paiement, libelle: `Encaissement - ${data.client_nom}`,
        source_type: "paiement", source_id: data.id, created_by: req.profil?.id || null,
        lignes: [
          { compte_numero: compteTresorerie(data.mode_paiement), debit: data.montant },
          { compte_numero: "411000", credit: data.montant },
        ],
      }).catch(() => {});
    }

    res.status(201).json({ paiement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/paiements/:id", authenticateAdmin, requirePermission("finances_paiements", "manage"), async (req, res) => {
  try {
    const allowed = ["statut", "rapproche", "mode_paiement", "notes", "reference"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const { data: avant } = await supabase.from("comptabilite_paiements").select("statut, facture_id").eq("id", req.params.id).maybeSingle();
    const { data, error } = await supabase.from("comptabilite_paiements").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;

    if (data.facture_id) await resyncFacture(data.facture_id);

    // Passage à "reçu" après coup → enregistrer le mouvement de trésorerie manquant
    if (avant?.statut !== "recu" && data.statut === "recu") {
      const clientType = await resolveClientType(data.facture_id);
      await enregistrerMouvementTresorerie({
        type: "entree", categorie: `encaissement_client_${clientType}`, montant: data.montant,
        date_mouvement: data.date_paiement, source_type: "paiement", source_id: data.id,
        description: `Encaissement - ${data.client_nom}`, mode_paiement: data.mode_paiement,
        created_by: req.profil?.id || null,
      });
      passerEcriture({
        journal: "BQ", date_ecriture: data.date_paiement, libelle: `Encaissement - ${data.client_nom}`,
        source_type: "paiement", source_id: data.id, created_by: req.profil?.id || null,
        lignes: [
          { compte_numero: compteTresorerie(data.mode_paiement), debit: data.montant },
          { compte_numero: "411000", credit: data.montant },
        ],
      }).catch(() => {});
    }

    res.json({ paiement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   DÉPENSES
══════════════════════════════════════════════════════════════ */
router.get("/depenses", authenticateAdmin, requirePermission("finances_tresorerie", "read"), async (req, res) => {
  try {
    const { categorie } = req.query;
    let q = supabase.from("comptabilite_depenses").select("*").order("date_depense", { ascending: false });
    if (categorie) q = q.eq("categorie", categorie);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ depenses: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/depenses", authenticateAdmin, requirePermission("finances_tresorerie", "manage"), async (req, res) => {
  try {
    const { categorie, libelle, montant, date_depense, mode_paiement, beneficiaire, justificatif_url, statut, notes } = req.body;
    if (!libelle?.trim()) return res.status(400).json({ error: "Le libellé est obligatoire" });
    if (!montant || montant <= 0) return res.status(400).json({ error: "Montant invalide" });

    const { data, error } = await supabase.from("comptabilite_depenses").insert({
      categorie: categorie || "autre", libelle: libelle.trim(), montant: parseFloat(montant),
      date_depense: date_depense || new Date().toISOString().slice(0, 10),
      mode_paiement: mode_paiement || "virement", beneficiaire: beneficiaire || null,
      justificatif_url: justificatif_url || null, statut: statut || "payee", notes: notes || null,
      created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;

    if (data.statut === "payee") {
      await enregistrerMouvementTresorerie({
        type: "sortie", categorie: "depense", montant: data.montant,
        date_mouvement: data.date_depense, source_type: "depense", source_id: data.id,
        description: `${data.categorie} - ${data.libelle}`, mode_paiement: data.mode_paiement,
        created_by: req.profil?.id || null,
      });
      passerEcriture({
        journal: "BQ", date_ecriture: data.date_depense, libelle: `${data.categorie} - ${data.libelle}`,
        source_type: "depense", source_id: data.id, created_by: req.profil?.id || null,
        lignes: [
          { compte_numero: COMPTE_PAR_CATEGORIE[data.categorie] || "628000", debit: data.montant },
          { compte_numero: compteTresorerie(data.mode_paiement), credit: data.montant },
        ],
      }).catch(() => {});
    }

    res.status(201).json({ depense: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/depenses/:id", authenticateAdmin, requirePermission("finances_tresorerie", "manage"), async (req, res) => {
  try {
    const allowed = ["categorie", "libelle", "montant", "date_depense", "mode_paiement", "beneficiaire", "justificatif_url", "statut", "notes"];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const { data: avant } = await supabase.from("comptabilite_depenses").select("statut").eq("id", req.params.id).maybeSingle();
    const { data, error } = await supabase.from("comptabilite_depenses").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;

    if (avant?.statut !== "payee" && data.statut === "payee") {
      await enregistrerMouvementTresorerie({
        type: "sortie", categorie: "depense", montant: data.montant,
        date_mouvement: data.date_depense, source_type: "depense", source_id: data.id,
        description: `${data.categorie} - ${data.libelle}`, mode_paiement: data.mode_paiement,
        created_by: req.profil?.id || null,
      });
      passerEcriture({
        journal: "BQ", date_ecriture: data.date_depense, libelle: `${data.categorie} - ${data.libelle}`,
        source_type: "depense", source_id: data.id, created_by: req.profil?.id || null,
        lignes: [
          { compte_numero: COMPTE_PAR_CATEGORIE[data.categorie] || "628000", debit: data.montant },
          { compte_numero: compteTresorerie(data.mode_paiement), credit: data.montant },
        ],
      }).catch(() => {});
    }

    res.json({ depense: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/depenses/:id", authenticateAdmin, requirePermission("finances_tresorerie", "manage"), async (req, res) => {
  try {
    const { error } = await supabase.from("comptabilite_depenses").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   FOURNISSEURS
══════════════════════════════════════════════════════════════ */
router.get("/fournisseurs", authenticateAdmin, requirePermission("finances_fournisseurs", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("comptabilite_fournisseurs").select("*").order("nom");
    if (error) throw error;
    res.json({ fournisseurs: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/fournisseurs", authenticateAdmin, requirePermission("finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { nom, contact_nom, email, telephone, adresse, ncc, categorie, notes } = req.body;
    if (!nom?.trim()) return res.status(400).json({ error: "Le nom du fournisseur est obligatoire" });

    const { data, error } = await supabase.from("comptabilite_fournisseurs").insert({
      nom: nom.trim(), contact_nom: contact_nom || null, email: email || null, telephone: telephone || null,
      adresse: adresse || null, ncc: ncc || null, categorie: categorie || "autre", notes: notes || null,
      created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ fournisseur: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/fournisseurs/:id", authenticateAdmin, requirePermission("finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const allowed = ["nom", "contact_nom", "email", "telephone", "adresse", "ncc", "categorie", "notes", "actif"];
    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const { data, error } = await supabase.from("comptabilite_fournisseurs").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ fournisseur: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/fournisseurs/:id", authenticateAdmin, requirePermission("finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { data: fact } = await supabase.from("comptabilite_factures_achat").select("id").eq("fournisseur_id", req.params.id).limit(1);
    if (fact?.length) return res.status(409).json({ error: "Fournisseur lié à des factures d'achat - impossible de le supprimer (le désactiver à la place)" });
    const { error } = await supabase.from("comptabilite_fournisseurs").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   FACTURES D'ACHAT (fournisseurs → nous)
══════════════════════════════════════════════════════════════ */
router.get("/factures-achat", authenticateAdmin, requirePermission("finances_fournisseurs", "read"), async (req, res) => {
  try {
    const { statut } = req.query;
    let q = supabase.from("comptabilite_factures_achat").select("*, fournisseur:comptabilite_fournisseurs(nom, categorie)").order("date_facture", { ascending: false });
    if (statut) q = q.eq("statut", statut);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ factures: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/factures-achat", authenticateAdmin, requirePermission("finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { fournisseur_id, reference_fournisseur, categorie, montant_ht, tva_taux, date_facture, date_echeance, notes } = req.body;
    if (!fournisseur_id) return res.status(400).json({ error: "Le fournisseur est obligatoire" });
    if (!montant_ht || montant_ht <= 0) return res.status(400).json({ error: "Montant HT invalide" });

    const tauxTva = parseFloat(tva_taux) || 0;
    const montantHt  = parseFloat(montant_ht);
    const montantTtc = Math.round(montantHt * (1 + tauxTva / 100));

    const annee = new Date().getFullYear();
    const { count } = await supabase.from("comptabilite_factures_achat").select("*", { count: "exact", head: true })
      .gte("created_at", `${annee}-01-01`);
    const numero = `FACH-${annee}-${String((count || 0) + 1).padStart(4, "0")}`;

    const { data, error } = await supabase.from("comptabilite_factures_achat").insert({
      numero, fournisseur_id, reference_fournisseur: reference_fournisseur || null, categorie: categorie || "autre",
      montant_ht: montantHt, tva_taux: tauxTva, montant_ttc: montantTtc, montant_paye: 0,
      date_facture: date_facture || new Date().toISOString().slice(0, 10), date_echeance: date_echeance || null,
      notes: notes || null, statut: "recue", created_by: req.profil?.id || null,
    }).select("*, fournisseur:comptabilite_fournisseurs(nom, categorie)").single();
    if (error) throw error;

    const tvaMontant = montantTtc - montantHt;
    passerEcriture({
      journal: "AC", date_ecriture: data.date_facture, libelle: `Facture achat ${data.numero} - ${data.fournisseur?.nom || ""}`,
      source_type: "facture_achat", source_id: data.id, created_by: req.profil?.id || null,
      lignes: [
        { compte_numero: COMPTE_PAR_CATEGORIE[data.categorie] || "628000", debit: montantHt },
        ...(tvaMontant > 0 ? [{ compte_numero: "445200", debit: tvaMontant }] : []),
        { compte_numero: "401000", credit: montantTtc },
      ],
    }).catch(() => {});

    res.status(201).json({ facture: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/factures-achat/:id", authenticateAdmin, requirePermission("finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const allowed = ["reference_fournisseur", "categorie", "date_echeance", "statut", "notes", "justificatif_url"];
    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const { data, error } = await supabase.from("comptabilite_factures_achat").update(updates).eq("id", req.params.id)
      .select("*, fournisseur:comptabilite_fournisseurs(nom, categorie)").single();
    if (error) throw error;
    res.json({ facture: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/factures-achat/:id", authenticateAdmin, requirePermission("finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { data: pmts } = await supabase.from("comptabilite_paiements_fournisseurs").select("id").eq("facture_achat_id", req.params.id).limit(1);
    if (pmts?.length) return res.status(409).json({ error: "Facture liée à des paiements - impossible de la supprimer" });
    const { error } = await supabase.from("comptabilite_factures_achat").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   PAIEMENTS FOURNISSEURS (décaissements)
══════════════════════════════════════════════════════════════ */
async function resyncFactureAchat(factureId) {
  if (!factureId) return;
  const { data: facture } = await supabase.from("comptabilite_factures_achat").select("montant_ttc").eq("id", factureId).maybeSingle();
  if (!facture) return;
  const { data: pmts } = await supabase.from("comptabilite_paiements_fournisseurs").select("montant").eq("facture_achat_id", factureId).eq("statut", "paye");
  const totalPaye = (pmts || []).reduce((s, p) => s + (Number(p.montant) || 0), 0);
  const statut = totalPaye <= 0 ? "recue" : totalPaye >= facture.montant_ttc ? "payee" : "partiellement_payee";
  await supabase.from("comptabilite_factures_achat").update({ montant_paye: totalPaye, statut, updated_at: new Date().toISOString() }).eq("id", factureId);
}

router.get("/paiements-fournisseurs", authenticateAdmin, requirePermission("finances_fournisseurs", "read"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("comptabilite_paiements_fournisseurs")
      .select("*, fournisseur:comptabilite_fournisseurs(nom)").order("date_paiement", { ascending: false });
    if (error) throw error;
    res.json({ paiements: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/paiements-fournisseurs", authenticateAdmin, requirePermission("finances_fournisseurs", "manage"), async (req, res) => {
  try {
    const { facture_achat_id, fournisseur_id, reference, montant, date_paiement, mode_paiement, notes } = req.body;
    if (!fournisseur_id) return res.status(400).json({ error: "Le fournisseur est obligatoire" });
    if (!montant || montant <= 0) return res.status(400).json({ error: "Montant invalide" });

    const { data, error } = await supabase.from("comptabilite_paiements_fournisseurs").insert({
      facture_achat_id: facture_achat_id || null, fournisseur_id, reference: reference || null,
      montant: parseFloat(montant), date_paiement: date_paiement || new Date().toISOString().slice(0, 10),
      mode_paiement: mode_paiement || "virement", statut: "paye", notes: notes || null,
      created_by: req.profil?.id || null,
    }).select("*, fournisseur:comptabilite_fournisseurs(nom)").single();
    if (error) throw error;

    if (data.facture_achat_id) await resyncFactureAchat(data.facture_achat_id);

    await enregistrerMouvementTresorerie({
      type: "sortie", categorie: "paiement_fournisseur", montant: data.montant,
      date_mouvement: data.date_paiement, source_type: "paiement_fournisseur", source_id: data.id,
      description: `Paiement fournisseur - ${data.fournisseur?.nom || "Fournisseur"}`, mode_paiement: data.mode_paiement,
      created_by: req.profil?.id || null,
    });

    passerEcriture({
      journal: "BQ", date_ecriture: data.date_paiement, libelle: `Paiement fournisseur - ${data.fournisseur?.nom || ""}`,
      source_type: "paiement_fournisseur", source_id: data.id, created_by: req.profil?.id || null,
      lignes: [
        { compte_numero: "401000", debit: data.montant },
        { compte_numero: compteTresorerie(data.mode_paiement), credit: data.montant },
      ],
    }).catch(() => {});

    res.status(201).json({ paiement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   TRÉSORERIE
══════════════════════════════════════════════════════════════ */

// Journal brut des mouvements (audit / rapprochement)
router.get("/tresorerie/mouvements", authenticateAdmin, requirePermission("finances_tresorerie", "read"), async (req, res) => {
  try {
    const { type, mois, annee } = req.query;
    let q = supabase.from("comptabilite_tresorerie_mouvements").select("*").order("date_mouvement", { ascending: false });
    if (type) q = q.eq("type", type);
    if (mois && annee) {
      const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
      const fin   = new Date(annee, mois, 0).toISOString().slice(0, 10);
      q = q.gte("date_mouvement", debut).lte("date_mouvement", fin);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json({ mouvements: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mouvement manuel (frais bancaires, régularisation...) - pas de source_type auto
router.post("/tresorerie/mouvements", authenticateAdmin, requirePermission("finances_tresorerie", "manage"), async (req, res) => {
  try {
    const { type, montant, date_mouvement, description, mode_paiement } = req.body;
    if (!["entree", "sortie"].includes(type)) return res.status(400).json({ error: "type invalide" });
    if (!montant || montant <= 0) return res.status(400).json({ error: "Montant invalide" });

    const { data, error } = await supabase.from("comptabilite_tresorerie_mouvements").insert({
      type, categorie: "manuel", montant: parseFloat(montant),
      date_mouvement: date_mouvement || new Date().toISOString().slice(0, 10),
      source_type: "manuel", description: description || null, mode_paiement: mode_paiement || null,
      created_by: req.profil?.id || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ mouvement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vue agrégée : solde courant + flux des N derniers mois
router.get("/tresorerie/synthese", authenticateAdmin, requirePermission("finances_tresorerie", "read"), async (req, res) => {
  try {
    const nbMois = parseInt(req.query.mois_historique, 10) || 6;

    const { data: tous, error } = await supabase.from("comptabilite_tresorerie_mouvements").select("type, categorie, montant, date_mouvement");
    if (error) throw error;
    const rows = tous || [];

    const solde = rows.reduce((s, r) => s + (r.type === "entree" ? Number(r.montant) : -Number(r.montant)), 0);

    const now = new Date();
    const flux = [];
    for (let i = nbMois - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mois = d.getMonth() + 1, annee = d.getFullYear();
      const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
      const fin   = new Date(annee, mois, 0).toISOString().slice(0, 10);
      const rowsMois = rows.filter(r => r.date_mouvement >= debut && r.date_mouvement <= fin);
      const entrees = rowsMois.filter(r => r.type === "entree").reduce((s, r) => s + Number(r.montant), 0);
      const sorties = rowsMois.filter(r => r.type === "sortie").reduce((s, r) => s + Number(r.montant), 0);
      flux.push({ mois, annee, label: d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), entrees, sorties });
    }

    const moisCourant = flux[flux.length - 1] || { entrees: 0, sorties: 0 };

    const debutMoisCourant = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const finMoisCourant   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const rowsMoisCourant  = rows.filter(r => r.date_mouvement >= debutMoisCourant && r.date_mouvement <= finMoisCourant);

    const sortiesParCategorie = {};
    rowsMoisCourant.filter(r => r.type === "sortie").forEach(r => {
      sortiesParCategorie[r.categorie] = (sortiesParCategorie[r.categorie] || 0) + Number(r.montant);
    });
    const entreesParCategorie = {};
    rowsMoisCourant.filter(r => r.type === "entree").forEach(r => {
      entreesParCategorie[r.categorie] = (entreesParCategorie[r.categorie] || 0) + Number(r.montant);
    });

    res.json({
      solde,
      entrees_mois: moisCourant.entrees,
      sorties_mois: moisCourant.sorties,
      flux_mensuels: flux,
      sorties_par_categorie: sortiesParCategorie,
      entrees_par_categorie: entreesParCategorie,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
