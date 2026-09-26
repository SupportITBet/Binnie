import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();
console.log("✅ Route corporate chargée");

// Toutes les routes sont protégées
router.use(authenticateAdmin);

// ── Helper : résoudre l'assistante_id du compte connecté ─────
async function getAssistanteId(req) {
  const GLOBAUX = ["super_admin", "admin", "responsable", "gestionnaire", "manager"];
  if (GLOBAUX.includes(req.role)) return null; // accès global
  const { data } = await supabase
    .from("assistantes")
    .select("id")
    .eq("email", req.profil.email)
    .maybeSingle();
  return data?.id || null;
}

// ════════════════════════════════════════════════════════════
// COMPTES ENTREPRISES
// ════════════════════════════════════════════════════════════

router.get("/entreprises", async (req, res) => {
  try {
    const aid = await getAssistanteId(req);
    let q = supabase.from("comptes_entreprises").select("*").order("created_at", { ascending: false });
    if (aid) q = q.eq("assistante_id", aid);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ entreprises: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/entreprises", async (req, res) => {
  try {
    const aid = await getAssistanteId(req);
    const {
      nom, rccm, secteur, nb_employes, referent_rh_nom, referent_rh_email, referent_rh_telephone,
      budget_formation, ville, adresse, site_web, notes,
      couleur, logo_url, fichier_preuve_url,
      package_elearning, nb_licences, montant_contrat, devise,
      date_debut_contrat, date_fin_contrat, option_replay, types_sessions,
      libelle_personnalise, tarif_personnalise,
      // Compte RH - même logique que POST /api/entreprise/admin/creer, pour qu'une
      // entreprise créée depuis dash arrive chez l'admin BET avec contrat + accès RH déjà
      // prêts, au lieu de rester incomplète tant qu'un admin ne repasse pas par bet-elearning.
      rh_prenom, rh_nom, rh_email,
    } = req.body;
    if (!nom) return res.status(400).json({ error: "Le nom de l'entreprise est requis" });

    const { data: ent, error } = await supabase.from("comptes_entreprises").insert({
      assistante_id: aid,
      nom: nom.trim(), rccm: rccm || null, secteur: secteur || null,
      nb_employes: nb_employes ? parseInt(nb_employes) : null,
      referent_rh_nom: referent_rh_nom || null, referent_rh_email: referent_rh_email || null,
      referent_rh_telephone: referent_rh_telephone || null,
      budget_formation: budget_formation ? parseFloat(budget_formation) : null,
      ville: ville || null, adresse: adresse || null, site_web: site_web || null, notes: notes || null,
      couleur: couleur || '#0891B2',
      initiales: nom.trim().substring(0, 2).toUpperCase(),
      logo_url: logo_url || null,
      fichier_preuve_url: fichier_preuve_url || null,
      package_elearning: package_elearning || null,
      nb_licences: nb_licences || 0,
      montant_contrat: montant_contrat || 0,
      devise: devise || 'FCFA',
      libelle_personnalise: package_elearning === 'personnalise' ? (libelle_personnalise || null) : null,
      tarif_personnalise:   package_elearning === 'personnalise' ? (tarif_personnalise  || null) : null,
      date_debut_contrat: date_debut_contrat || null,
      date_fin_contrat: date_fin_contrat || null,
      option_replay: option_replay ?? false,
      types_sessions: types_sessions || ['ligne'],
      acces_elearning: true,
      cree_par_id: req.profil.id,
      cree_dans: 'dash',
      statut: 'actif',
    }).select().single();
    if (error) throw error;

    let compteRH = null;

    // Créer le contrat si package renseigné
    if (package_elearning && date_debut_contrat && date_fin_contrat) {
      await supabase.from("contrats_entreprises_elearning").insert({
        entreprise_id: ent.id,
        package: package_elearning === 'personnalise' ? (libelle_personnalise || 'Personnalisé') : package_elearning,
        nb_licences: nb_licences || 0,
        montant_ht: montant_contrat || 0,
        devise: devise || 'FCFA',
        date_debut: date_debut_contrat,
        date_fin: date_fin_contrat,
        option_replay: option_replay ?? false,
        types_sessions: types_sessions || ['ligne'],
        statut: 'actif',
        cree_par_id: req.profil.id,
      });
    }

    // Créer le compte RH dans Supabase Auth + utilisateurs
    if (rh_email && rh_prenom && rh_nom) {
      const base = nom.trim().replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
      const mdp  = `BET-${base}-${new Date().getFullYear()}`;

      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email:    rh_email.toLowerCase(),
        password: mdp,
        email_confirm: true,
        app_metadata: { role: 'client_entreprise', actif: true },
        user_metadata: { prenom: rh_prenom, nom: rh_nom },
      });

      if (!authErr && authUser?.user) {
        await supabase.from("utilisateurs").upsert({
          id:             authUser.user.id,
          email:          rh_email.toLowerCase(),
          nom:            rh_nom,
          prenom:         rh_prenom,
          role:           'client_entreprise',
          entreprise_id:  ent.id,
          acces_elearning: true,
          actif:          true,
          mdp_temporaire: true,
          mdp_initial:    mdp,
          scope:          ['national'],
          cree_par_id:    req.profil.id,
        }, { onConflict: 'id' });

        compteRH = { email: rh_email.toLowerCase(), mot_de_passe: mdp, prenom: rh_prenom, nom: rh_nom };
      }
    }

    res.status(201).json({ ...ent, compteRH });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/entreprises/:id", async (req, res) => {
  try {
    const allowed = [
      "nom","rccm","secteur","nb_employes","referent_rh_nom","referent_rh_email","referent_rh_telephone",
      "budget_formation","ville","adresse","site_web","notes","statut",
      "couleur","logo_url","fichier_preuve_url","package_elearning","nb_licences",
      "montant_contrat","devise","date_debut_contrat","date_fin_contrat",
      "option_replay","types_sessions","libelle_personnalise","tarif_personnalise",
    ];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("comptes_entreprises").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;

    // Répercuter sur le contrat - même logique que PATCH /api/entreprise/admin/:id
    const CHAMPS_CONTRAT = ["package_elearning","nb_licences","montant_contrat","devise","date_debut_contrat","date_fin_contrat","option_replay","types_sessions"];
    if (CHAMPS_CONTRAT.some(c => Object.prototype.hasOwnProperty.call(updates, c)) && data.package_elearning && data.date_debut_contrat && data.date_fin_contrat) {
      const { data: contratExistant } = await supabase
        .from("contrats_entreprises_elearning").select("id").eq("entreprise_id", data.id).eq("statut", "actif").maybeSingle();
      const payloadContrat = {
        package: data.package_elearning === 'personnalise' ? (data.libelle_personnalise || 'Personnalisé') : data.package_elearning,
        nb_licences: data.nb_licences || 0,
        montant_ht: data.montant_contrat || 0,
        devise: data.devise || 'FCFA',
        date_debut: data.date_debut_contrat,
        date_fin: data.date_fin_contrat,
        option_replay: data.option_replay ?? false,
        types_sessions: data.types_sessions || ['ligne'],
      };
      if (contratExistant) {
        await supabase.from("contrats_entreprises_elearning").update(payloadContrat).eq("id", contratExistant.id);
      } else {
        await supabase.from("contrats_entreprises_elearning").insert({
          entreprise_id: data.id, ...payloadContrat, statut: 'actif', cree_par_id: req.profil.id,
        });
      }
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/entreprises/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("comptes_entreprises").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Entreprise supprimée" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// PIPELINE PROSPECTS B2B
// ════════════════════════════════════════════════════════════

router.get("/prospects", async (req, res) => {
  try {
    const aid = await getAssistanteId(req);
    let q = supabase
      .from("prospects_b2b")
      .select("*, comptes_entreprises(nom, secteur, referent_rh_nom, referent_rh_email)")
      .order("updated_at", { ascending: false });
    if (aid) q = q.eq("assistante_id", aid);
    const { data, error } = await q;
    if (error) throw error;
    res.json({
      prospects: (data || []).map(p => ({
        ...p,
        entreprise_nom: p.comptes_entreprises?.nom || "-",
        entreprise_secteur: p.comptes_entreprises?.secteur || null,
        referent_nom: p.comptes_entreprises?.referent_rh_nom || null,
        referent_email: p.comptes_entreprises?.referent_rh_email || null,
        comptes_entreprises: undefined,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/prospects", async (req, res) => {
  try {
    const aid = await getAssistanteId(req);
    const { entreprise_id, titre, statut, montant_estime, date_cloture_prevue, notes } = req.body;
    if (!entreprise_id || !titre) return res.status(400).json({ error: "entreprise_id et titre sont requis" });
    const { data, error } = await supabase.from("prospects_b2b").insert({
      assistante_id: aid,
      entreprise_id, titre: titre.trim(),
      statut: statut || "prospection",
      montant_estime: montant_estime ? parseFloat(montant_estime) : null,
      date_cloture_prevue: date_cloture_prevue || null,
      notes: notes || null,
      historique: JSON.stringify([{ date: new Date().toISOString(), action: "Prospect créé", statut: statut || "prospection" }]),
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/prospects/:id", async (req, res) => {
  try {
    const allowed = ["titre","statut","montant_estime","date_cloture_prevue","notes"];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    updates.updated_at = new Date().toISOString();

    // Ajouter à l'historique si changement de statut
    if (req.body.statut) {
      const { data: existing } = await supabase.from("prospects_b2b").select("historique").eq("id", req.params.id).single();
      const hist = existing?.historique || [];
      hist.push({ date: new Date().toISOString(), action: `Statut → ${req.body.statut}`, statut: req.body.statut, note: req.body.note_historique || null });
      updates.historique = hist;
    }

    const { data, error } = await supabase.from("prospects_b2b").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/prospects/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("prospects_b2b").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Prospect supprimé" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// DOCUMENTS COMMERCIAUX
// ════════════════════════════════════════════════════════════

router.get("/documents", async (req, res) => {
  try {
    const aid = await getAssistanteId(req);
    let q = supabase
      .from("documents_b2b")
      .select("*, comptes_entreprises(nom)")
      .order("created_at", { ascending: false });
    if (aid) q = q.eq("assistante_id", aid);
    const { data, error } = await q;
    if (error) throw error;
    res.json({
      documents: (data || []).map(d => ({
        ...d,
        entreprise_nom: d.comptes_entreprises?.nom || "-",
        comptes_entreprises: undefined,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/documents", async (req, res) => {
  try {
    const aid = await getAssistanteId(req);
    const { entreprise_id, prospect_id, type_doc, titre, fichier_url, montant, statut, notes } = req.body;
    if (!entreprise_id || !type_doc || !titre) return res.status(400).json({ error: "entreprise_id, type_doc et titre sont requis" });
    const { data, error } = await supabase.from("documents_b2b").insert({
      assistante_id: aid,
      entreprise_id, prospect_id: prospect_id || null,
      type_doc, titre: titre.trim(),
      fichier_url: fichier_url || null,
      montant: montant ? parseFloat(montant) : null,
      statut: statut || "brouillon",
      notes: notes || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/documents/:id", async (req, res) => {
  try {
    const allowed = ["titre","fichier_url","montant","statut","notes","type_doc"];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    const { data, error } = await supabase.from("documents_b2b").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// FACTURATION B2B
// ════════════════════════════════════════════════════════════

router.get("/factures", async (req, res) => {
  try {
    const aid = await getAssistanteId(req);
    let q = supabase
      .from("factures_b2b")
      .select("*, comptes_entreprises(nom)")
      .order("created_at", { ascending: false });
    if (aid) q = q.eq("assistante_id", aid);
    const { data, error } = await q;
    if (error) throw error;
    res.json({
      factures: (data || []).map(f => ({
        ...f,
        entreprise_nom: f.comptes_entreprises?.nom || "-",
        comptes_entreprises: undefined,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/factures", async (req, res) => {
  try {
    const aid = await getAssistanteId(req);
    const { entreprise_id, objet, montant_ht, taux_tva, date_echeance, notes } = req.body;
    if (!entreprise_id || !montant_ht) return res.status(400).json({ error: "entreprise_id et montant_ht sont requis" });

    // Générer un numéro de facture automatique : FAC-YYYYMM-XXXX
    const { count } = await supabase.from("factures_b2b").select("*", { count: "exact", head: true });
    const numero = `FAC-${new Date().toISOString().slice(0,7).replace("-","")}-${String((count||0)+1).padStart(4,"0")}`;

    const { data, error } = await supabase.from("factures_b2b").insert({
      assistante_id: aid,
      entreprise_id, numero, objet: objet || null,
      montant_ht: parseFloat(montant_ht),
      taux_tva: taux_tva ? parseFloat(taux_tva) : 18,
      date_echeance: date_echeance || null,
      notes: notes || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/factures/:id", async (req, res) => {
  try {
    const allowed = ["objet","montant_ht","taux_tva","statut","date_echeance","date_paiement","mode_paiement","notes"];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("factures_b2b").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
