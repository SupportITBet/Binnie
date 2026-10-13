import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission, messagePermissionRefusee } from "../middlewares/requireAdmin.js";
import { notifyRole, notifyUser, notifyEntreprise } from "../services/notifyRole.js";
import { logAudit } from "../middlewares/logAudit.js";
import { testsNiveauParEmail } from "./placementRoutes.js";
import { enregistrerEncaissementEntreprise } from "./comptabilite.js";
import { publicFormLimiter } from "../middlewares/rateLimiters.js";
import { sendStaffWelcomeEmail } from "../services/emailService.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = express.Router();

console.log("✅ Route entreprise chargée");

// Compte les bénéficiaires actifs de l'entreprise, toutes classes confondues - même logique
// que le contrôle de quota dans classesElearning.js (verifierQuotas). Utilisé pour empêcher
// de renouveler un contrat avec moins de licences que de bénéficiaires déjà actifs : nb_licences
// est un remplacement (pas un cumul avec l'ancien contrat), donc sans ce garde-fou une saisie
// mal comprise ("10 licences en plus" au lieu du total) mettrait l'entreprise en dépassement
// de quota instantané et silencieux.
async function compterBeneficiairesActifs(entrepriseId) {
  const { data: classesEnt } = await supabase
    .from("classes_elearning")
    .select("id")
    .eq("entreprise_id", entrepriseId);
  const classeIds = (classesEnt || []).map(c => c.id);
  if (!classeIds.length) return 0;
  const { count } = await supabase
    .from("classes_elearning_apprenants")
    .select("id", { count: "exact", head: true })
    .in("classe_id", classeIds)
    .eq("statut", "actif");
  return count || 0;
}

// La "preuve d'inscription" reste écrite sur comptes_entreprises.fichier_preuve_url (colonne
// dénormalisée, encore lue par la liste des entreprises et le formulaire d'édition) MAIS est
// aussi reflétée comme un document normal dans entreprise_documents (type='preuve_inscription'),
// pour que l'onglet "Documents" n'ait plus besoin de fabriquer une ligne synthétique côté client.
// Best-effort : ne bloque jamais la requête appelante en cas d'échec.
async function syncPreuveDocument(entrepriseId, url, profil, nom) {
  if (!entrepriseId || !url) return;
  try {
    const deposantNom = profil ? (`${profil.prenom || ""} ${profil.nom || ""}`.trim() || profil.email || null) : null;
    await supabase.from("entreprise_documents").delete().eq("entreprise_id", entrepriseId).eq("type", "preuve_inscription");
    await supabase.from("entreprise_documents").insert({
      entreprise_id: entrepriseId,
      nom: nom || "Preuve d'inscription",
      url,
      type: "preuve_inscription",
      depose_par_id: profil?.id || null,
      depose_par_nom: deposantNom,
    });
  } catch (e) {
    console.warn("[entreprise] syncPreuveDocument échoué:", e.message);
  }
}

// ── GET /api/entreprise/clients-publics ──────────────────────
// Entreprises clientes actives, pour affichage public (ex: "Ils nous font confiance"
// sur /bet-for-business) - uniquement nom/logo/initiales, aucune donnée sensible.
router.get("/clients-publics", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("comptes_entreprises")
      .select("nom, logo_url, initiales, couleur")
      .eq("statut", "actif")
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ entreprises: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /api/entreprise/submit ──────────────────────────────
// Enregistre une demande de devis entreprise (public, depuis le site web)
router.post("/submit", publicFormLimiter, async (req, res) => {
  try {
    const { entreprise, contact, email, telephone, nb_employes, besoins, commercial_id } = req.body;

    if (!entreprise || !contact || !email || !telephone) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { error } = await supabase.from("demandes_entreprise").insert({
      entreprise,
      contact,
      email,
      telephone,
      nb_employes:   nb_employes   || null,
      besoins:       besoins       || null,
      commercial_id: commercial_id || null,
      statut:        "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase entreprise :", error);
      return res.status(500).json({ error: error.message });
    }

    // Notifier toutes les assistantes Corporate (B2B) actives - même logique que
    // POST /api/simulateur/submit : la demande est visible par toutes, donc toutes
    // doivent être notifiées de son arrivée.
    try {
      const { data: assistantesB2B } = await supabase
        .from("assistantes").select("email").eq("profil", "b2b").eq("actif", true);
      const emails = (assistantesB2B || []).map(a => a.email).filter(Boolean);
      if (emails.length) {
        const { data: users } = await supabase
          .from("utilisateurs").select("id").eq("role", "commercial").eq("actif", true).in("email", emails);
        await Promise.all((users || []).map(u => notifyUser(u.id, {
          type:    "nouvelle_demande_entreprise",
          titre:   `🏢 Nouvelle demande Corporate - ${entreprise}`,
          message: `${entreprise} a soumis une demande de devis (${nb_employes || "?"} employés). À traiter dans "Mes demandes".`,
          meta:    { email_contact: email },
          source:  "dash",
        })));
      }
    } catch (ne) {
      console.warn("[entreprise] notif assistantes B2B échouée:", ne.message);
    }

    res.status(201).json({ message: "Demande entreprise enregistrée" });
  } catch (err) {
    console.error("Erreur serveur entreprise :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /api/entreprise/mes-demandes ────────────────────────
// Retourne TOUTES les demandes entreprise pour la commerciale B2B.
// Source principale : demandes_entreprise + simulateurs_formation (toujours présents).
// Enrichissement optionnel : assignations_parcours (statut + notes).
router.get("/mes-demandes", authenticateAdmin, async (req, res) => {
  try {
    // Vérifier que c'est bien une commerciale B2B
    const { data: assistante } = await supabase
      .from("assistantes")
      .select("id")
      .eq("email", req.profil.email)
      .eq("profil", "b2b")
      .maybeSingle();

    if (!assistante) {
      console.warn("[mes-demandes] Aucune assistante b2b trouvée pour", req.profil.email);
      return res.json({ demandes: [] });
    }

    // ── Charger les centres depuis plateforme_config ─────────
    const { data: centresConfig } = await supabase
      .from("plateforme_config")
      .select("valeur")
      .eq("key", "centres_master")
      .maybeSingle();

    const centresMap = {};
    if (Array.isArray(centresConfig?.valeur)) {
      for (const c of centresConfig.valeur) {
        if (c.key) centresMap[c.key] = { nom: c.name || c.nom || c.key, adresse: c.addr || c.adresse || null, horaires: c.horaires || null };
      }
    }

    // ── Source 1 : formulaires devis simples ────────────────
    const { data: devisData } = await supabase
      .from("demandes_entreprise")
      .select("*")
      .order("created_at", { ascending: false });

    // ── Source 2 : simulateurs formation 3 étapes ───────────
    const { data: simData } = await supabase
      .from("simulateurs_formation")
      .select("*")
      .order("created_at", { ascending: false });

    // ── Source 3 : assignations (statut + notes) ─────────────
    // select(*) pour éviter les erreurs si certaines colonnes n'existent pas encore
    const { data: assignations } = await supabase
      .from("assignations_parcours")
      .select("*")
      .eq("assistante_id", assistante.id);

    // Indexer les assignations par email du prospect
    const assignByEmail = {};
    (assignations || []).forEach(a => {
      if (a.prospect_email && !assignByEmail[a.prospect_email]) {
        assignByEmail[a.prospect_email] = a;
      }
    });

    // Indexer les simulateurs par email
    const simByEmail = {};
    (simData || []).forEach(s => { simByEmail[s.email_contact] = s; });

    const buildCentreInfo = (centreKey) => {
      if (!centreKey) return { centre_nom: null, centre_adresse: null, centre_horaires: null };
      const c = centresMap[centreKey];
      return {
        centre_nom:      c?.nom      || centreKey,
        centre_adresse:  c?.adresse  || null,
        centre_horaires: c?.horaires || null,
      };
    };

    // ── Fusionner toutes les sources ─────────────────────────
    const vus = new Set();
    const demandes = [];

    // Parcourir les devis (formulaire simple)
    for (const devis of (devisData || [])) {
      const email = devis.email;
      if (vus.has(email)) continue;
      vus.add(email);

      const sim    = simByEmail[email];
      const assign = assignByEmail[email];
      const centreInfo = buildCentreInfo(sim?.centre);

      demandes.push({
        assignation_id:   assign?.id              || null,
        statut:           assign?.statut          || devis.statut || "en_attente",
        source:           assign?.source          || "devis_entreprise",
        notes_commercial: assign?.notes           || devis.notes_commercial || sim?.notes_commercial || null,
        date_reception:   devis.created_at,
        contact:          devis.contact || sim?.nom_contact || null,
        email:            devis.email,
        telephone:        devis.telephone,
        entreprise:       devis.entreprise        || sim?.nom_entreprise || null,
        nb_employes:      devis.nb_employes       || sim?.nb_employes    || null,
        besoins:          devis.besoins           || null,
        secteur:          sim?.secteur            || null,
        niveau_actuel:    sim?.niveau_actuel      || null,
        niveau_cible:     sim?.niveau_cible       || null,
        objectifs:        sim?.objectifs          || [],
        format_souhaite:  sim?.format             || null,
        rythme_souhaite:  sim?.rythme             || null,
        groupe:           sim?.groupe             || null,
        nb_participants:  sim?.nb_participants    || null,
        duree_semaines:   sim?.duree_semaines     || null,
        centre_key:       sim?.centre             || null,
        ...centreInfo,
        type_demande:     sim ? "simulateur" : "devis",
      });
    }

    // Parcourir les simulateurs sans devis correspondant
    for (const sim of (simData || [])) {
      const email = sim.email_contact;
      if (vus.has(email)) continue;
      vus.add(email);

      const assign = assignByEmail[email];
      const centreInfo = buildCentreInfo(sim.centre);

      demandes.push({
        assignation_id:   assign?.id              || null,
        statut:           assign?.statut          || sim.statut || "en_attente",
        source:           assign?.source          || "devis_entreprise",
        notes_commercial: assign?.notes           || sim.notes_commercial || null,
        date_reception:   sim.created_at,
        contact:          sim.nom_contact || sim.email_contact,
        email:            sim.email_contact,
        telephone:        sim.tel                 || null,
        entreprise:       sim.nom_entreprise      || null,
        nb_employes:      sim.nb_employes         || null,
        besoins:          null,
        secteur:          sim.secteur             || null,
        niveau_actuel:    sim.niveau_actuel       || null,
        niveau_cible:     sim.niveau_cible        || null,
        objectifs:        sim.objectifs           || [],
        format_souhaite:  sim.format              || null,
        rythme_souhaite:  sim.rythme              || null,
        groupe:           sim.groupe              || null,
        nb_participants:  sim.nb_participants     || null,
        duree_semaines:   sim.duree_semaines      || null,
        centre_key:       sim.centre              || null,
        ...centreInfo,
        type_demande:     "simulateur",
      });
    }

    // Trier par date desc
    demandes.sort((a, b) => new Date(b.date_reception) - new Date(a.date_reception));

    console.log(`[mes-demandes B2B] ${demandes.length} demandes retournées pour ${req.profil.email}`);
    res.json({ demandes });
  } catch (err) {
    console.error("Erreur mes-demandes entreprise :", err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/entreprise/demandes/suivi ────────────────────
// Met à jour statut et/ou notes d'une demande entreprise identifiée par email.
// Utilisé quand assignation_id est null (pas encore d'assignation créée).
router.patch("/demandes/suivi", authenticateAdmin, async (req, res) => {
  try {
    const { email, statut, notes_commercial } = req.body;
    if (!email) return res.status(400).json({ error: "email requis" });

    const updates = {};
    if (statut           !== undefined) updates.statut           = statut;
    if (notes_commercial !== undefined) updates.notes_commercial = notes_commercial;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Aucune mise à jour fournie" });
    }

    // Une fois le contrat signé (transmis à l'admin BET pour validation), une assistante
    // ne peut plus modifier le statut - seul un rôle admin/global le peut désormais.
    const ROLES_GLOBAUX = ["super_admin", "admin", "responsable", "gestionnaire", "manager", "pedagogical_advisor", "onboarding"];
    if (statut !== undefined && !ROLES_GLOBAUX.includes(req.role)) {
      const { data: devisActuel } = await supabase.from("demandes_entreprise").select("statut").eq("email", email).maybeSingle();
      const { data: simActuel }   = await supabase.from("simulateurs_formation").select("statut").eq("email_contact", email).maybeSingle();
      const statutActuel = devisActuel?.statut || simActuel?.statut;
      if (statutActuel === "converti" && statut !== "converti") {
        return res.status(403).json({ error: "Ce dossier a été transmis à l'admin BET pour validation - le statut ne peut plus être modifié depuis cet écran." });
      }
    }

    // Mettre à jour dans demandes_entreprise
    const { error: e1 } = await supabase
      .from("demandes_entreprise")
      .update(updates)
      .eq("email", email);

    // Mettre à jour dans simulateurs_formation
    const { error: e2 } = await supabase
      .from("simulateurs_formation")
      .update(updates)
      .eq("email_contact", email);

    if (e1 && e2) {
      console.error("Erreur suivi entreprise:", e1, e2);
      return res.status(500).json({ error: e1?.message || e2?.message });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur PATCH suivi entreprise:", err);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// ADMIN BET - CRUD ENTREPRISES (GestionEntreprises.jsx)
// ════════════════════════════════════════════════════════════════════

// GET /api/entreprise/admin/liste - toutes les entreprises elearning
router.get("/admin/liste", authenticateAdmin, async (req, res) => {
  try {
    const [{ data: entreprises, error: errEnt }, { data: beneficiairesLegacy, error: errBen }, { data: classes, error: errCl }] = await Promise.all([
      supabase.from("comptes_entreprises").select("*").order("created_at", { ascending: false }),
      supabase.from("beneficiaires_entreprise").select("id, entreprise_id, statut"),
      supabase.from("classes_elearning").select("id, entreprise_id").not("entreprise_id", "is", null),
    ]);
    if (errEnt) return res.status(500).json({ error: errEnt.message });
    if (errBen) return res.status(500).json({ error: errBen.message });
    if (errCl)  return res.status(500).json({ error: errCl.message });

    // `beneficiaires_entreprise` (table legacy) est vide en pratique - les vrais apprenants
    // d'une entreprise sont ceux inscrits (classes_elearning_apprenants) dans une classe
    // (classes_elearning) rattachée à cette entreprise. On les convertit au même format
    // { id, entreprise_id, statut } que l'ancien système pour que le frontend n'ait rien à
    // changer, et on les fusionne avec le legacy pour rester compatible s'il est réutilisé
    // un jour.
    const entrepriseParClasse = {};
    (classes || []).forEach(c => { entrepriseParClasse[c.id] = c.entreprise_id; });
    const classeIds = (classes || []).map(c => c.id);

    let beneficiairesReels = [];
    if (classeIds.length > 0) {
      const { data: inscrits, error: errIns } = await supabase
        .from("classes_elearning_apprenants")
        .select("id, classe_id, statut")
        .in("classe_id", classeIds);
      if (errIns) return res.status(500).json({ error: errIns.message });
      beneficiairesReels = (inscrits || []).map(i => ({
        id: i.id, entreprise_id: entrepriseParClasse[i.classe_id], statut: i.statut,
      }));
    }

    // fichier_preuve_nom n'existe pas sur comptes_entreprises (voir syncPreuveDocument) - le
    // vrai nom du fichier vit uniquement dans entreprise_documents. On l'attache ici pour que
    // le formulaire d'édition affiche le nom réel au lieu du texte générique "Voir le fichier".
    const entIds = (entreprises || []).map(e => e.id);
    let preuveNomParEntreprise = {};
    if (entIds.length > 0) {
      const { data: preuves } = await supabase
        .from("entreprise_documents")
        .select("entreprise_id, nom")
        .eq("type", "preuve_inscription")
        .in("entreprise_id", entIds);
      (preuves || []).forEach(p => { preuveNomParEntreprise[p.entreprise_id] = p.nom; });
    }
    const entreprisesEnrichies = (entreprises || []).map(e => ({
      ...e,
      fichier_preuve_nom: preuveNomParEntreprise[e.id] || null,
    }));

    res.json({ entreprises: entreprisesEnrichies, beneficiaires: [...(beneficiairesLegacy || []), ...beneficiairesReels] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/entreprise/admin/creer - créer une entreprise + compte RH
router.post("/admin/creer", authenticateAdmin, requirePermission("crm_entreprises","create"), async (req, res) => {
  try {
    const {
      nom, rccm, secteur, ville, adresse, site_web, notes,
      nb_employes, referent_rh_nom, referent_rh_email, referent_rh_telephone,
      couleur, initiales, logo_url, fichier_preuve_url, fichier_preuve_nom,
      package_elearning, nb_licences, montant_contrat, devise,
      date_debut_contrat, date_fin_contrat, option_replay, types_sessions,
      libelle_personnalise, tarif_personnalise,
      // Compte RH
      rh_prenom, rh_nom, rh_email,
    } = req.body;

    if (!nom) return res.status(400).json({ error: "Le nom de l'entreprise est requis" });

    // 1. Créer l'entreprise
    const { data: ent, error: entErr } = await supabase
      .from("comptes_entreprises")
      .insert({
        nom, rccm: rccm || null, secteur, ville, adresse, site_web, notes,
        nb_employes: nb_employes || null,
        referent_rh_nom, referent_rh_email, referent_rh_telephone,
        couleur: couleur || '#0891B2',
        initiales: initiales || nom.substring(0, 2).toUpperCase(),
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
        cree_dans: 'elearning',
        statut: 'actif',
      })
      .select()
      .single();

    if (entErr) return res.status(500).json({ error: entErr.message });

    if (fichier_preuve_url) await syncPreuveDocument(ent.id, fichier_preuve_url, req.profil, fichier_preuve_nom);

    let compteRH = null;

    // 2. Créer le contrat si package renseigné
    if (package_elearning && date_debut_contrat && date_fin_contrat) {
      await supabase.from("contrats_entreprises_elearning").insert({
        entreprise_id: ent.id,
        // Pour un package personnalisé, stocker directement le libellé saisi (pas l'id
        // "personnalise") - ce champ est affiché tel quel dans l'onglet Contrat.
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

    // 3. Créer le compte RH dans Supabase Auth + utilisateurs
    if (rh_email && rh_prenom && rh_nom) {
      const base = nom.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
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


        /* ── LES ACCÈS DE LA RH PARTENT MAINTENANT PAR E-MAIL ──
           Le mot de passe était généré, stocké, puis renvoyé dans la réponse HTTP : il
           s'affichait à l'écran de celui qui créait le compte, à charge pour lui de le
           recopier et de le transmettre à la main. Ce fichier n'importait même pas le
           service d'e-mail, qui expose pourtant `sendStaffWelcomeEmail` depuis toujours.
           `compteRH` RESTE DANS LA RÉPONSE : si l'envoi échoue - adresse erronée, service
           indisponible - celui qui crée le compte garde de quoi dépanner. L'e-mail est le
           chemin normal, pas le seul. */
        await sendStaffWelcomeEmail({
          prenom: rh_prenom || '', nom: rh_nom || '', email: rh_email.toLowerCase(),
          mdpTemp: mdp, departement: ent?.nom_entreprise || 'Entreprise cliente',
        }).catch(e => console.error('[entreprise] e-mail RH non parti:', e.message || e));

        compteRH = { email: rh_email.toLowerCase(), mot_de_passe: mdp, prenom: rh_prenom, nom: rh_nom };
      }
    }

    res.status(201).json({ entreprise: ent, compteRH });
  } catch (err) {
    console.error("Erreur création entreprise:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/entreprise/admin/upload-logo - upload logo vers Cloudinary
router.post("/admin/upload-logo", authenticateAdmin, requirePermission("crm_entreprises","update"), upload.single("logo"), async (req, res) => {
  try {
    const { entrepriseId } = req.body;
    if (!req.file) return res.status(400).json({ error: "Fichier manquant" });

    // Upload vers Cloudinary via upload_stream (buffer en mémoire)
    const publicUrl = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder:        "bet/logos-entreprises",
          resource_type: "image",
          transformation: [{ width: 400, height: 400, crop: "fill" }],
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result.secure_url);
        }
      );
      stream.end(req.file.buffer);
    });

    if (entrepriseId) {
      await supabase
        .from("comptes_entreprises")
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", entrepriseId);
    }

    res.json({ logo_url: publicUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/entreprise/admin/:id - modifier une entreprise
// Modifier une entreprise. Deux façons d'y avoir droit : (1) le droit "Modifier"
// classique sur crm_entreprises (admins / rôles pleinement habilités), ou (2) le
// dossier est encore "en_attente" de validation ET l'utilisateur a au moins le
// droit "Créer" (celui qui l'a soumis peut corriger une erreur avant validation) -
// verrouillé dès que le dossier passe "actif".
router.patch("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data: current, error: eCurrent } = await supabase
      .from("comptes_entreprises").select("statut").eq("id", req.params.id).single();
    if (eCurrent || !current) return res.status(404).json({ error: "Entreprise introuvable" });

    const perms = req.profil?.permissions?.crm_entreprises || {};
    const peutModifierPleinement = req.role === "super_admin" || perms.update;
    const peutCorrigerEnAttente  = current.statut === "en_attente" && perms.create;
    if (!peutModifierPleinement && !peutCorrigerEnAttente) {
      return res.status(403).json({ error: messagePermissionRefusee("crm_entreprises", "update") });
    }

    const allowed = [
      "nom","rccm","secteur","ville","adresse","site_web","notes","nb_employes",
      "referent_rh_nom","referent_rh_email","referent_rh_telephone",
      "couleur","initiales","logo_url","fichier_preuve_url","package_elearning","nb_licences",
      "montant_contrat","devise","date_debut_contrat","date_fin_contrat",
      "option_replay","types_sessions","statut","acces_elearning",
      "libelle_personnalise","tarif_personnalise",
    ];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("comptes_entreprises").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Répercuter sur le contrat (table séparée, lue par les onglets Contrat/Paiements et
    // la modale de versement) - sans ça, changer le package ou le nombre de bénéficiaires
    // d'une entreprise existante laisse ces écrans figés sur l'ancien montant pour toujours.
    const CHAMPS_CONTRAT = ["package_elearning","nb_licences","montant_contrat","devise","date_debut_contrat","date_fin_contrat","option_replay","types_sessions"];
    if (CHAMPS_CONTRAT.some(c => Object.prototype.hasOwnProperty.call(updates, c))) {
      const { data: contratActif } = await supabase
        .from("contrats_entreprises_elearning")
        .select("id")
        .eq("entreprise_id", req.params.id)
        .eq("statut", "actif")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const majContrat = {};
      if (updates.package_elearning   !== undefined) {
        // Le contrat stocke le libellé affichable, pas l'id "personnalise" (voir création).
        majContrat.package = updates.package_elearning === 'personnalise'
          ? (data.libelle_personnalise || 'Personnalisé')
          : updates.package_elearning;
      }
      if (updates.nb_licences         !== undefined) majContrat.nb_licences     = updates.nb_licences;
      if (updates.montant_contrat     !== undefined) majContrat.montant_ht      = updates.montant_contrat;
      if (updates.devise              !== undefined) majContrat.devise         = updates.devise;
      if (updates.date_debut_contrat  !== undefined) majContrat.date_debut     = updates.date_debut_contrat;
      if (updates.date_fin_contrat    !== undefined) majContrat.date_fin       = updates.date_fin_contrat;
      if (updates.option_replay       !== undefined) majContrat.option_replay  = updates.option_replay;
      if (updates.types_sessions      !== undefined) majContrat.types_sessions = updates.types_sessions;

      if (contratActif) {
        await supabase.from("contrats_entreprises_elearning").update(majContrat).eq("id", contratActif.id);
      } else if (data.package_elearning && data.date_debut_contrat && data.date_fin_contrat) {
        // Aucun contrat existant (ex: entreprise créée sans package puis complétée après
        // coup) - on en crée un, avec les mêmes champs que la création initiale.
        await supabase.from("contrats_entreprises_elearning").insert({
          entreprise_id:  req.params.id,
          package:        data.package_elearning === 'personnalise' ? (data.libelle_personnalise || 'Personnalisé') : data.package_elearning,
          nb_licences:    data.nb_licences || 0,
          montant_ht:     data.montant_contrat || 0,
          devise:         data.devise || 'FCFA',
          date_debut:     data.date_debut_contrat,
          date_fin:       data.date_fin_contrat,
          option_replay:  data.option_replay ?? false,
          types_sessions: data.types_sessions || ['ligne'],
          statut:         'actif',
          cree_par_id:    req.profil.id,
        });
      }
    }

    // Le champ était présent dans la requête (même à null) : soit on (re)synchronise la
    // preuve, soit - cas du bouton "🗑 Retirer" du formulaire d'édition, qui ne fait que vider
    // le champ côté client - on supprime la ligne entreprise_documents correspondante, pour
    // qu'elle cesse réellement d'apparaître dans l'onglet Documents.
    if (Object.prototype.hasOwnProperty.call(updates, "fichier_preuve_url")) {
      if (updates.fichier_preuve_url) {
        await syncPreuveDocument(req.params.id, updates.fichier_preuve_url, req.profil, req.body.fichier_preuve_nom);
      } else {
        await supabase.from("entreprise_documents").delete().eq("entreprise_id", req.params.id).eq("type", "preuve_inscription");
      }
    }

    res.json({ entreprise: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/entreprise/admin/:id
router.delete("/admin/:id", authenticateAdmin, requirePermission("crm_entreprises","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("comptes_entreprises").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/entreprise/admin/:id/credentials - récupérer les accès du compte RH
router.get("/admin/:id/credentials", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("utilisateurs")
      .select("id, email, prenom, nom, mdp_initial, mdp_temporaire, actif")
      .eq("entreprise_id", req.params.id)
      .eq("role", "client_entreprise")
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Aucun compte RH trouvé pour cette entreprise." });
    res.json({ credentials: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/entreprise/admin/:id/creer-compte-rh - créer le compte RH si inexistant
router.post("/admin/:id/creer-compte-rh", authenticateAdmin, requirePermission("crm_comptes_acces","manage"), async (req, res) => {
  try {
    const { rh_prenom, rh_nom, rh_email } = req.body;

    // Récupérer l'entreprise
    const { data: ent, error: errEnt } = await supabase
      .from("comptes_entreprises")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (errEnt || !ent) return res.status(404).json({ error: "Entreprise introuvable." });

    const email  = (rh_email || ent.referent_rh_email || '').toLowerCase().trim();
    const prenom = rh_prenom || ent.referent_rh_nom?.split(' ')[0] || 'RH';
    const nom    = rh_nom    || ent.referent_rh_nom?.split(' ').slice(1).join(' ') || ent.nom;

    if (!email) return res.status(400).json({ error: "Email RH requis." });

    // Vérifier qu'aucun compte n'existe déjà
    const { data: existing } = await supabase
      .from("utilisateurs")
      .select("id")
      .eq("entreprise_id", req.params.id)
      .eq("role", "client_entreprise")
      .maybeSingle();

    if (existing) return res.status(409).json({ error: "Un compte RH existe déjà pour cette entreprise." });

    // Générer le mot de passe
    const base = ent.nom.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
    const mdp  = `BET-${base}-${new Date().getFullYear()}`;

    // Créer dans Supabase Auth
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: mdp,
      email_confirm: true,
      app_metadata: { role: 'client_entreprise', actif: true },
      user_metadata: { prenom, nom },
    });

    if (authErr) return res.status(500).json({ error: authErr.message });

    // Insérer dans utilisateurs
    await supabase.from("utilisateurs").upsert({
      id:              authUser.user.id,
      email,
      nom, prenom,
      role:            'client_entreprise',
      entreprise_id:   ent.id,
      acces_elearning: true,
      actif:           true,
      mdp_temporaire:  true,
      mdp_initial:     mdp,
      scope:           ['national'],
      cree_par_id:     req.profil.id,
    }, { onConflict: 'id' });

    // Même envoi qu'à la création de l'entreprise : la RH reçoit ses accès plutôt qu'on
    // les lui dicte. L'échec est journalisé sans bloquer la création du compte.
    await sendStaffWelcomeEmail({
      prenom: prenom || '', nom: nom || '', email,
      mdpTemp: mdp, departement: ent?.nom_entreprise || 'Entreprise cliente',
    }).catch(e => console.error('[entreprise] e-mail RH non parti:', e.message || e));

    // Mettre à jour l'entreprise avec le email RH
    await supabase.from("comptes_entreprises").update({
      referent_rh_nom:   `${prenom} ${nom}`.trim(),
      referent_rh_email: email,
      updated_at: new Date().toISOString(),
    }).eq("id", ent.id);

    res.status(201).json({ email, mot_de_passe: mdp, prenom, nom });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/entreprise/admin/:id/reset-password - réinitialiser le mot de passe du compte RH
router.patch("/admin/:id/reset-password", authenticateAdmin, requirePermission("crm_comptes_acces","manage"), async (req, res) => {
  try {
    // Récupérer le compte RH de l'entreprise
    const { data: utilisateur, error: errU } = await supabase
      .from("utilisateurs")
      .select("id, email, nom")
      .eq("entreprise_id", req.params.id)
      .eq("role", "client_entreprise")
      .maybeSingle();

    if (errU) return res.status(500).json({ error: errU.message });
    if (!utilisateur) return res.status(404).json({ error: "Aucun compte RH trouvé pour cette entreprise." });

    // Générer un nouveau mot de passe temporaire
    const { data: ent } = await supabase.from("comptes_entreprises").select("nom").eq("id", req.params.id).maybeSingle();
    const base = (ent?.nom || "ENT").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6);
    const nouveauMdp = `BET-${base}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    // Mettre à jour dans Supabase Auth
    const { error: errAuth } = await supabase.auth.admin.updateUserById(utilisateur.id, {
      password: nouveauMdp,
    });
    if (errAuth) return res.status(500).json({ error: errAuth.message });

    // Mettre à jour mdp_initial dans utilisateurs
    await supabase.from("utilisateurs").update({
      mdp_initial:    nouveauMdp,
      mdp_temporaire: true,
      updated_at:     new Date().toISOString(),
    }).eq("id", utilisateur.id);

    res.json({ nouveau_mdp: nouveauMdp, email: utilisateur.email });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/entreprise/admin/:id/beneficiaires
router.get("/admin/:id/beneficiaires", authenticateAdmin, async (req, res) => {
  try {
    const entrepriseId = req.params.id;

    // Ancien système
    const { data: anciens } = await supabase
      .from("beneficiaires_entreprise")
      .select("*, utilisateur:utilisateurs(id,nom,prenom,email,telephone,avatar_url)")
      .eq("entreprise_id", entrepriseId)
      .order("created_at", { ascending: false });

    const beneficiaires = (anciens || []).map(b => ({
      ...b,
      nom:       b.utilisateur?.nom       || "",
      prenom:    b.utilisateur?.prenom    || "",
      email:     b.utilisateur?.email     || b.email || "",
      telephone: b.utilisateur?.telephone || b.telephone || "",
      _source:   'ancien',
    }));

    // Nouveau système e-learning
    const { data: classes } = await supabase
      .from("classes_elearning")
      .select("id, nom, niveau, coach_nom, statut")
      .eq("entreprise_id", entrepriseId)
      .neq("statut", "archive");

    if (classes?.length) {
      const classeIds = classes.map(c => c.id);
      const { data: apprenants } = await supabase
        .from("classes_elearning_apprenants")
        .select("*")
        .in("classe_id", classeIds)
        .eq("statut", "actif");

      const emailsExistants = new Set(beneficiaires.map(b => b.email).filter(Boolean));
      (apprenants || []).forEach(a => {
        if (a.email && emailsExistants.has(a.email)) return;
        const classe = classes.find(c => c.id === a.classe_id);
        const parts  = (a.nom_complet || '').trim().split(/\s+/);
        beneficiaires.push({
          id:              a.id,
          entreprise_id:   entrepriseId,
          nom:             parts.length > 1 ? parts.slice(-1)[0] : parts[0] || '',
          prenom:          parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
          nom_complet:     a.nom_complet,
          email:           a.email      || "",
          telephone:       a.telephone  || "",
          niveau_cecr:     a.niveau_cecr,
          statut:          a.statut,
          classe_id:       a.classe_id,
          classe_nom:      classe?.nom   || null,
          coach_nom:       classe?.coach_nom || null,
          groupe_id:       a.classe_id,
          date_inscription: a.date_inscription,
          notes_internes:  a.notes_internes || '',
          apprenant_id:    a.apprenant_id || null,
          _source:         'elearning',
        });
        if (a.email) emailsExistants.add(a.email);
      });
    }

    // Statut réel du compte - aucune des deux sources ci-dessus ne porte de champ
    // "acces_elearning" à jour (l'ancien système ne l'a jamais eu ; le nouveau système
    // ne relie jamais /api/apprenants/creer-acces à classes_elearning_apprenants).
    // On résout par email (trim + insensible à la casse, comme /api/apprenants/profil-acces)
    // contre utilisateurs, avec apprenant_id comme filet de secours si l'email a divergé.
    const emails = [...new Set(beneficiaires.map(b => b.email).filter(Boolean).map(e => e.trim().toLowerCase()))];
    let comptesParEmail = {};
    if (emails.length) {
      const { data: comptes } = await supabase
        .from("utilisateurs")
        .select("id, email")
        .eq("role", "apprenant")
        .in("email", emails);
      (comptes || []).forEach(u => { if (u.email) comptesParEmail[u.email.trim().toLowerCase()] = u; });
    }
    beneficiaires.forEach(b => {
      const compte = b.email ? comptesParEmail[b.email.trim().toLowerCase()] : null;
      b.acces_elearning = !!compte || !!b.apprenant_id;
    });

    res.json({ beneficiaires });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/entreprise/admin/:id/classes - classes e-learning avec leurs apprenants
router.get("/admin/:id/classes", authenticateAdmin, async (req, res) => {
  try {
    const { data: classes, error } = await supabase
      .from("classes_elearning")
      .select("*")
      .eq("entreprise_id", req.params.id)
      .neq("statut", "archive")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    if (!classes?.length) return res.json({ classes: [] });

    const ids = classes.map(c => c.id);
    const { data: apprenants } = await supabase
      .from("classes_elearning_apprenants")
      .select("*")
      .in("classe_id", ids);

    // classes_elearning_apprenants n'a pas de colonne "acces_elearning" (elle ne
    // vit que sur utilisateurs) et /api/apprenants/creer-acces ne relie jamais un
    // compte créé à cette table - donc on résout le vrai statut du compte par
    // email, comme le fait déjà correctement le modal détail employé. Les comptes
    // apprenants créés via ce flux n'ont pas de flag "acces_elearning" (spécifique
    // aux comptes RH entreprise) : ici, l'existence même de la ligne utilisateurs
    // (role "apprenant") signifie que le compte a été créé.
    const emails = [...new Set((apprenants || []).map(a => a.email).filter(Boolean).map(e => e.trim().toLowerCase()))];
    let comptesParEmail = {};
    if (emails.length) {
      const { data: comptes } = await supabase
        .from("utilisateurs")
        .select("email, mdp_temporaire")
        .eq("role", "apprenant")
        .in("email", emails);
      (comptes || []).forEach(u => { if (u.email) comptesParEmail[u.email.trim().toLowerCase()] = u; });
    }
    const apprenantsEnrichis = (apprenants || []).map(a => {
      const compte = a.email ? comptesParEmail[a.email.trim().toLowerCase()] : null;
      return { ...a, acces_elearning: !!compte || !!a.apprenant_id, mdp_temporaire: compte?.mdp_temporaire ?? null };
    });

    const result = classes.map(c => ({
      ...c,
      apprenants:    apprenantsEnrichis.filter(a => a.classe_id === c.id),
      nb_apprenants: apprenantsEnrichis.filter(a => a.classe_id === c.id).length,
    }));

    res.json({ classes: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/entreprise/admin/beneficiaire - ajouter un bénéficiaire
router.post("/admin/beneficiaire", authenticateAdmin, requirePermission("crm_beneficiaires","create"), async (req, res) => {
  try {
    const { entreprise_id, prenom, nom, email, telephone, poste, departement, niveau_initial, groupe_id, notes } = req.body;
    if (!entreprise_id || !email) return res.status(400).json({ error: "entreprise_id et email requis" });

    // Chercher ou créer l'utilisateur
    let utilisateurId = null;
    const { data: existing } = await supabase.from("utilisateurs").select("id").eq("email", email.toLowerCase()).maybeSingle();
    if (existing) {
      utilisateurId = existing.id;
      await supabase.from("utilisateurs").update({ entreprise_id, telephone, actif: true }).eq("id", utilisateurId);
    } else {
      const mdpBase = `${nom.replace(/[^a-zA-Z]/g,'').toUpperCase().slice(0,4)}-BET-${new Date().getFullYear()}`;
      const { data: authUser } = await supabase.auth.admin.createUser({
        email: email.toLowerCase(), password: mdpBase, email_confirm: true,
        app_metadata: { role: 'beneficiaire_entreprise', actif: true },
        user_metadata: { prenom, nom },
      });
      if (authUser?.user) {
        utilisateurId = authUser.user.id;
        await supabase.from("utilisateurs").upsert({
          id: utilisateurId, email: email.toLowerCase(), nom, prenom,
          telephone, role: 'beneficiaire_entreprise', entreprise_id,
          acces_elearning: true, actif: true, mdp_temporaire: true, mdp_initial: mdpBase,
          scope: ['national'], cree_par_id: req.profil.id,
        }, { onConflict: 'id' });
      }
    }

    if (!utilisateurId) return res.status(500).json({ error: "Impossible de créer l'utilisateur" });

    const { data: benef, error } = await supabase
      .from("beneficiaires_entreprise")
      .upsert({ entreprise_id, utilisateur_id: utilisateurId, niveau_initial, groupe_id, notes, statut: 'actif', cree_par_id: req.profil.id }, { onConflict: 'entreprise_id,utilisateur_id' })
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ beneficiaire: { ...benef, nom, prenom, email, telephone } });

    // Notifier la RH entreprise (client_entreprise) de l'ajout du bénéficiaire
    (async () => {
      try {
        const { data: rhUsers } = await supabase.from("utilisateurs").select("id")
          .eq("role", "client_entreprise").eq("entreprise_id", entreprise_id).eq("actif", true);
        if (rhUsers?.length) {
          const nomComplet = [prenom, nom].filter(Boolean).join(" ");
          await supabase.from("notifications").insert(rhUsers.map(u => ({
            user_id: u.id, type: "inscription", lu: false,
            titre: `👤 Nouveau bénéficiaire ajouté`,
            message: `${nomComplet} a été ajouté(e) à votre espace formation.`,
            meta: { utilisateur_id: utilisateurId, entreprise_id },
          })));
        }
      } catch (e) {
        console.warn("[entreprise] RH notif ajout bénéficiaire échouée:", e.message);
      }
    })();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/entreprise/admin/beneficiaire/:id
router.patch("/admin/beneficiaire/:id", authenticateAdmin, requirePermission("crm_beneficiaires","update"), async (req, res) => {
  try {
    const allowed = ["statut","progression","groupe_id","niveau_actuel","niveau_initial","notes","date_fin"];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    updates.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("beneficiaires_entreprise").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ beneficiaire: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/entreprise/admin/soumettre-parcours - inscription soumise par une assistante (statut en_attente)
router.post("/admin/soumettre-parcours", authenticateAdmin, requirePermission("crm_entreprises","create"), async (req, res) => {
  try {
    const {
      nom, rccm, secteur, ville, adresse, site_web, notes, nb_employes,
      referent_rh_nom, referent_rh_email, referent_rh_telephone,
      couleur, initiales, logo_url, fichier_preuve_url, fichier_preuve_nom,
      package_elearning, nb_licences, montant_contrat, devise,
      date_debut_contrat, date_fin_contrat, option_replay, types_sessions,
      libelle_personnalise, tarif_personnalise,
    } = req.body;

    if (!nom) return res.status(400).json({ error: "Le nom de l'entreprise est requis" });

    const { data: ent, error } = await supabase
      .from("comptes_entreprises")
      .insert({
        nom, rccm: rccm || null, secteur, ville, adresse, site_web, notes,
        nb_employes: nb_employes || null,
        referent_rh_nom: referent_rh_nom || null,
        referent_rh_email: referent_rh_email || null,
        referent_rh_telephone: referent_rh_telephone || null,
        couleur: couleur || '#0891B2',
        initiales: initiales || nom.substring(0, 2).toUpperCase(),
        logo_url: logo_url || null,
        fichier_preuve_url: fichier_preuve_url || null,
        package_elearning: package_elearning || null,
        libelle_personnalise: package_elearning === 'personnalise' ? (libelle_personnalise || null) : null,
        tarif_personnalise: package_elearning === 'personnalise' ? (tarif_personnalise || null) : null,
        nb_licences: nb_licences || 0,
        montant_contrat: montant_contrat || 0,
        devise: devise || 'FCFA',
        date_debut_contrat: date_debut_contrat || null,
        date_fin_contrat: date_fin_contrat || null,
        option_replay: option_replay ?? false,
        types_sessions: types_sessions || ['ligne'],
        acces_elearning: false,
        statut: 'en_attente',
        cree_par_id: req.profil.id,
        cree_dans: 'elearning',
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    if (fichier_preuve_url) await syncPreuveDocument(ent.id, fichier_preuve_url, req.profil, fichier_preuve_nom);

    // Notifie tous les rôles habilités à valider une inscription entreprise (mêmes rôles que
    // ceux autorisés à ouvrir /admin/entreprises côté frontend) - pour que la demande ne reste
    // pas invisible tant que personne n'a pensé à consulter l'onglet "Entreprise Parcours".
    // ⚠️ notifyRole filtre sur utilisateurs.role, qui contient le rôle BRUT stocké en base
    // (ex: "manager", "superviseur") - jamais le rôle "façade" recalculé côté frontend par
    // ROLE_MAP_BET (ex: "admin_manager"). Utiliser la façade ici ne matcherait personne.
    const acteurNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Une assistante";
    await notifyRole(
      ["super_admin", "admin", "manager", "superviseur", "comptable", "onboarding", "commercial"],
      {
        type:    "entreprise_parcours",
        titre:   "🏢 Nouvelle inscription entreprise à valider",
        message: `${acteurNom} a soumis "${ent.nom}" pour validation - Entreprise → Entreprise Parcours.`,
        meta:    { entreprise_id: ent.id },
        source:  "dash",
      }
    ).catch(() => {});

    res.status(201).json({ entreprise: ent });
  } catch (err) {
    console.error("Erreur soumission parcours:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/entreprise/admin/:id/valider - validation d'un parcours par l'admin (actif + compte RH)
// L'admin peut avoir corrigé n'importe quel champ soumis par l'assistante (le modal de
// validation réutilise le formulaire complet de création d'entreprise) - on les persiste
// tous ici, pas seulement le compte RH.
router.patch("/admin/:id/valider", authenticateAdmin, requirePermission("crm_entreprises","update"), async (req, res) => {
  try {
    const {
      rh_prenom, rh_nom, rh_email,
      nom, rccm, secteur, ville, adresse, notes,
      referent_rh_nom, referent_rh_email, referent_rh_telephone,
      couleur, initiales, logo_url, fichier_preuve_url, fichier_preuve_nom,
      package_elearning, nb_licences, montant_contrat, devise,
      date_debut_contrat, date_fin_contrat, option_replay, types_sessions,
      libelle_personnalise, tarif_personnalise,
    } = req.body;

    const updates = { statut: 'actif', acces_elearning: true, updated_at: new Date().toISOString() };
    const champsEditables = {
      // "pays" retiré : ce champ n'existe pas sur comptes_entreprises (colonne absente en base),
      // l'envoyer faisait échouer toute validation avec une erreur 500 Supabase.
      nom, rccm, secteur, ville, adresse, notes,
      referent_rh_nom, referent_rh_email, referent_rh_telephone,
      couleur, initiales, logo_url, fichier_preuve_url,
      package_elearning, nb_licences, montant_contrat, devise,
      date_debut_contrat, date_fin_contrat, option_replay, types_sessions,
      libelle_personnalise: package_elearning === 'personnalise' ? (libelle_personnalise || null) : null,
      tarif_personnalise: package_elearning === 'personnalise' ? (tarif_personnalise || null) : null,
    };
    // fichier_preuve_nom n'est volontairement pas dans champsEditables : cette colonne
    // n'existe pas sur comptes_entreprises (seul fichier_preuve_url y est stocké) - le nom
    // du fichier n'est utilisé que pour syncPreuveDocument() plus bas.
    Object.entries(champsEditables).forEach(([k, v]) => { if (v !== undefined) updates[k] = v; });

    // 1. Activer l'entreprise (avec les éventuelles corrections de l'admin)
    const { data: ent, error: entErr } = await supabase
      .from("comptes_entreprises")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (entErr) return res.status(500).json({ error: entErr.message });

    if (fichier_preuve_url) await syncPreuveDocument(ent.id, fichier_preuve_url, req.profil, fichier_preuve_nom);

    let compteRH = null;

    // 2. Créer le compte RH si email fourni
    if (rh_email && rh_prenom && rh_nom) {
      const base = (ent.nom || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
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

        // Mettre à jour les infos RH sur l'entreprise
        await supabase.from("comptes_entreprises")
          .update({ referent_rh_nom: rh_nom, referent_rh_email: rh_email.toLowerCase(), updated_at: new Date().toISOString() })
          .eq("id", ent.id);

        compteRH = { email: rh_email.toLowerCase(), mot_de_passe: mdp, prenom: rh_prenom, nom: rh_nom };
      }
    }

    // 3. Créer le contrat si package + dates renseignés
    if (ent.package_elearning && ent.date_debut_contrat && ent.date_fin_contrat) {
      const { data: existingContrat } = await supabase
        .from("contrats_entreprises_elearning")
        .select("id").eq("entreprise_id", ent.id).maybeSingle();
      if (!existingContrat) {
        await supabase.from("contrats_entreprises_elearning").insert({
          entreprise_id: ent.id,
          package:       ent.package_elearning,
          nb_licences:   ent.nb_licences || 0,
          montant_ht:    ent.montant_contrat || 0,
          devise:        ent.devise || 'FCFA',
          date_debut:    ent.date_debut_contrat,
          date_fin:      ent.date_fin_contrat,
          option_replay: ent.option_replay ?? false,
          types_sessions: ent.types_sessions || ['ligne'],
          statut:        'actif',
          cree_par_id:   req.profil.id,
        });
      }
    }

    // Notifier l'assistante qui avait soumis ce parcours - jusqu'ici, elle n'apprenait
    // jamais que sa soumission avait été validée (ni qu'un compte RH avait été créé).
    if (ent.cree_par_id) {
      await notifyUser(ent.cree_par_id, {
        type:    "entreprise_parcours",
        titre:   `✅ Parcours entreprise validé - ${ent.nom}`,
        message: `"${ent.nom}" a été validé et activé.${compteRH ? ` Un compte RH a été créé (${compteRH.email}).` : ""}`,
        meta:    { entreprise_id: ent.id },
        source:  "dash",
      }).catch(() => {});
    }

    res.json({ entreprise: ent, compteRH });
  } catch (err) {
    console.error("Erreur validation parcours:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/entreprise/admin/:id/refuser - refuser un parcours (statut = 'refuse')
router.patch("/admin/:id/refuser", authenticateAdmin, requirePermission("crm_entreprises","update"), async (req, res) => {
  try {
    const { motif } = req.body;
    const { data, error } = await supabase
      .from("comptes_entreprises")
      .update({ statut: 'refuse', notes: motif || null, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Notifier l'assistante qui avait soumis ce parcours - même trou que pour la validation.
    if (data.cree_par_id) {
      await notifyUser(data.cree_par_id, {
        type:    "entreprise_parcours",
        titre:   `❌ Parcours entreprise refusé - ${data.nom}`,
        message: `"${data.nom}" a été refusé.${motif ? ` Motif : ${motif}.` : ""}`,
        meta:    { entreprise_id: data.id },
        source:  "dash",
      }).catch(() => {});
    }
    res.json({ entreprise: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/entreprise/admin/contrats - tous les contrats
router.get("/admin/contrats", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contrats_entreprises_elearning")
      .select("*, entreprise:comptes_entreprises(nom,couleur,initiales)")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ contrats: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const STATUTS_CONTRAT_VALIDES = ["brouillon", "actif", "suspendu", "expire", "resilie"];

// PATCH /api/entreprise/admin/contrat/:contratId/statut - changer le statut d'UN contrat précis
// (utilisé par le sélecteur de statut dans l'onglet Contrat). Si on repasse un contrat à
// "actif", on désactive automatiquement les autres contrats actifs de la même entreprise -
// toute la logique existante (calcul du solde, quotas, etc.) suppose un seul contrat actif
// à la fois par entreprise (.eq("statut","actif").limit(1)).
router.patch("/admin/contrat/:contratId/statut", authenticateAdmin, requirePermission("contrat", "update"), async (req, res) => {
  try {
    const { statut } = req.body;
    if (!STATUTS_CONTRAT_VALIDES.includes(statut)) {
      return res.status(400).json({ error: `Statut invalide - valeurs acceptées : ${STATUTS_CONTRAT_VALIDES.join(", ")}` });
    }

    const { data: avant, error: avantErr } = await supabase
      .from("contrats_entreprises_elearning")
      .select("*")
      .eq("id", req.params.contratId)
      .maybeSingle();
    if (avantErr) return res.status(500).json({ error: avantErr.message });
    if (!avant) return res.status(404).json({ error: "Contrat introuvable" });

    if (statut === "actif") {
      await supabase
        .from("contrats_entreprises_elearning")
        .update({ statut: "expire" })
        .eq("entreprise_id", avant.entreprise_id)
        .eq("statut", "actif")
        .neq("id", req.params.contratId);
    }

    const { data, error } = await supabase
      .from("contrats_entreprises_elearning")
      .update({ statut })
      .eq("id", req.params.contratId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const acteurNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";
    const { data: ent } = await supabase.from("comptes_entreprises").select("nom").eq("id", avant.entreprise_id).maybeSingle();
    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   acteurNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "CONTRAT_STATUT_MODIFIE",
      module:       "crm_entreprises",
      entite_type:  "contrats_entreprises_elearning",
      entite_id:    data.id,
      detail:       `Statut du contrat de ${ent?.nom || avant.entreprise_id} changé : ${avant.statut} → ${statut}`,
      metadata:     { entreprise_id: avant.entreprise_id, statut_avant: avant.statut, statut_apres: statut },
      statut:       "success",
    }).catch(() => {});

    res.json({ contrat: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/entreprise/admin/:id/renouveler-contrat - renouvellement propre : archive l'ancien
// contrat actif (statut → 'expire') et en crée un nouveau (statut 'actif'), sans jamais toucher
// aux classes, bénéficiaires ou versements de l'entreprise (tous rattachés à entreprise_id,
// pas au contrat) - contrairement à PATCH /admin/:id qui mutait le contrat actif en place.
router.post("/admin/:id/renouveler-contrat", authenticateAdmin, requirePermission("contrat", "update"), async (req, res) => {
  try {
    const {
      package_elearning, nb_licences, montant_contrat, devise,
      date_debut_contrat, date_fin_contrat, option_replay, types_sessions,
      libelle_personnalise, tarif_personnalise,
    } = req.body;

    if (!package_elearning || !nb_licences || !date_debut_contrat || !date_fin_contrat) {
      return res.status(400).json({ error: "Package, nombre de bénéficiaires et dates du nouveau contrat sont requis" });
    }

    const { data: ent, error: entErr } = await supabase
      .from("comptes_entreprises")
      .select("nom")
      .eq("id", req.params.id)
      .maybeSingle();
    if (entErr) return res.status(500).json({ error: entErr.message });
    if (!ent) return res.status(404).json({ error: "Entreprise introuvable" });

    // nb_licences remplace l'ancien total (pas un cumul) - refuser si ça repasserait
    // l'entreprise sous son nombre de bénéficiaires déjà actifs.
    const nbActifs = await compterBeneficiairesActifs(req.params.id);
    if (nb_licences < nbActifs) {
      return res.status(400).json({ error: `Impossible : ${nbActifs} bénéficiaire(s) déjà actif(s) sur cette entreprise - le nouveau contrat doit couvrir au moins ${nbActifs} licences.` });
    }

    // 1. Archiver le(s) contrat(s) actif(s) existant(s)
    await supabase
      .from("contrats_entreprises_elearning")
      .update({ statut: "expire" })
      .eq("entreprise_id", req.params.id)
      .eq("statut", "actif");

    const packageLibelle = package_elearning === "personnalise" ? (libelle_personnalise || "Personnalisé") : package_elearning;

    // 2. Créer le nouveau contrat
    const { data: nouveauContrat, error: contratErr } = await supabase
      .from("contrats_entreprises_elearning")
      .insert({
        entreprise_id:  req.params.id,
        package:        packageLibelle,
        nb_licences:    nb_licences || 0,
        montant_ht:     montant_contrat || 0,
        devise:         devise || "FCFA",
        date_debut:     date_debut_contrat,
        date_fin:       date_fin_contrat,
        option_replay:  option_replay ?? false,
        types_sessions: types_sessions || ["ligne"],
        statut:         "actif",
        cree_par_id:    req.profil.id,
      })
      .select()
      .single();
    if (contratErr) return res.status(500).json({ error: contratErr.message });

    // 3. Répercuter les nouvelles conditions sur la fiche entreprise (état courant)
    const { data: entMaj, error: majErr } = await supabase
      .from("comptes_entreprises")
      .update({
        package_elearning,
        nb_licences,
        montant_contrat: montant_contrat || 0,
        devise: devise || "FCFA",
        date_debut_contrat,
        date_fin_contrat,
        option_replay: option_replay ?? false,
        types_sessions: types_sessions || ["ligne"],
        libelle_personnalise: package_elearning === "personnalise" ? (libelle_personnalise || null) : null,
        tarif_personnalise: package_elearning === "personnalise" ? (tarif_personnalise || null) : null,
        statut: "actif",
        acces_elearning: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select()
      .single();
    if (majErr) return res.status(500).json({ error: majErr.message });

    const acteurNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";
    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   acteurNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "CONTRAT_RENOUVELE",
      module:       "crm_entreprises",
      entite_type:  "contrats_entreprises_elearning",
      entite_id:    nouveauContrat.id,
      detail:       `Contrat renouvelé pour ${ent.nom} - package ${packageLibelle}, ${nb_licences} licences, du ${date_debut_contrat} au ${date_fin_contrat}`,
      metadata:     { entreprise_id: req.params.id, nouveau_contrat_id: nouveauContrat.id },
      statut:       "success",
    }).catch(() => {});

    await notifyRole(
      ["super_admin", "admin", "manager", "superviseur", "comptable"],
      {
        type:    "entreprise",
        titre:   "🔄 Contrat renouvelé",
        message: `${acteurNom} a renouvelé le contrat de ${ent.nom} (${nb_licences} licences, jusqu'au ${date_fin_contrat}).`,
        meta:    { entreprise_id: req.params.id, contrat_id: nouveauContrat.id },
        source:  "dash",
      },
      req.profil.id
    ).catch(() => {});

    notifyEntreprise(req.params.id, {
      type:    "entreprise",
      titre:   "🔄 Votre contrat a été renouvelé",
      message: `Votre nouveau contrat "${packageLibelle}" (${nb_licences} bénéficiaires) a démarré, du ${date_debut_contrat} au ${date_fin_contrat}.`,
      meta:    { contrat_id: nouveauContrat.id, package: packageLibelle, nb_licences, date_debut_contrat, date_fin_contrat },
    }).catch(() => {});

    res.status(201).json({ entreprise: entMaj, contrat: nouveauContrat });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/entreprise/admin/:id/proposer-renouvellement - l'assistante e-learning (droit
// "créer" mais pas "modifier" sur crm_entreprises) propose un renouvellement : crée un contrat
// en statut 'brouillon' (ne touche ni comptes_entreprises ni le contrat actif existant) et
// notifie l'admin BET, qui doit ensuite le valider via PATCH .../valider-renouvellement.
router.post("/admin/:id/proposer-renouvellement", authenticateAdmin, requirePermission("contrat", "create"), async (req, res) => {
  try {
    const {
      package_elearning, nb_licences, montant_contrat, devise,
      date_debut_contrat, date_fin_contrat, option_replay, types_sessions,
      libelle_personnalise, tarif_personnalise,
    } = req.body;

    if (!package_elearning || !nb_licences || !date_debut_contrat || !date_fin_contrat) {
      return res.status(400).json({ error: "Package, nombre de bénéficiaires et dates du nouveau contrat sont requis" });
    }

    const { data: ent, error: entErr } = await supabase.from("comptes_entreprises").select("nom").eq("id", req.params.id).maybeSingle();
    if (entErr) return res.status(500).json({ error: entErr.message });
    if (!ent) return res.status(404).json({ error: "Entreprise introuvable" });

    // nb_licences remplace l'ancien total (pas un cumul) - refuser si ça repasserait
    // l'entreprise sous son nombre de bénéficiaires déjà actifs.
    const nbActifs = await compterBeneficiairesActifs(req.params.id);
    if (nb_licences < nbActifs) {
      return res.status(400).json({ error: `Impossible : ${nbActifs} bénéficiaire(s) déjà actif(s) sur cette entreprise - le nouveau contrat doit couvrir au moins ${nbActifs} licences.` });
    }

    const packageLibelle = package_elearning === "personnalise" ? (libelle_personnalise || "Personnalisé") : package_elearning;

    const { data: proposition, error: propErr } = await supabase
      .from("contrats_entreprises_elearning")
      .insert({
        entreprise_id:  req.params.id,
        package:        packageLibelle,
        nb_licences:    nb_licences || 0,
        montant_ht:     montant_contrat || 0,
        devise:         devise || "FCFA",
        date_debut:     date_debut_contrat,
        date_fin:       date_fin_contrat,
        option_replay:  option_replay ?? false,
        types_sessions: types_sessions || ["ligne"],
        statut:         "brouillon",
        cree_par_id:    req.profil.id,
      })
      .select()
      .single();
    if (propErr) return res.status(500).json({ error: propErr.message });

    const acteurNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Assistante";
    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   acteurNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "CONTRAT_RENOUVELLEMENT_PROPOSE",
      module:       "crm_entreprises",
      entite_type:  "contrats_entreprises_elearning",
      entite_id:    proposition.id,
      detail:       `Renouvellement proposé pour ${ent.nom} - package ${packageLibelle}, ${nb_licences} licences, du ${date_debut_contrat} au ${date_fin_contrat}`,
      metadata:     { entreprise_id: req.params.id, proposition_id: proposition.id },
      statut:       "success",
    }).catch(() => {});

    await notifyRole(
      ["super_admin", "admin", "manager", "superviseur"],
      {
        type:    "entreprise",
        titre:   "🔄 Renouvellement de contrat à valider",
        message: `${acteurNom} propose un renouvellement pour ${ent.nom} (${nb_licences} licences, jusqu'au ${date_fin_contrat}) - validation requise.`,
        meta:    { entreprise_id: req.params.id, proposition_id: proposition.id },
        source:  "dash",
      },
      req.profil.id
    ).catch(() => {});

    res.status(201).json({ contrat: proposition });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/entreprise/admin/contrat/:contratId/valider-renouvellement - l'admin BET valide
// une proposition de renouvellement soumise par l'assistante : archive l'ancien contrat actif,
// active la proposition, synchronise comptes_entreprises et notifie la RH entreprise.
router.patch("/admin/contrat/:contratId/valider-renouvellement", authenticateAdmin, requirePermission("contrat", "update"), async (req, res) => {
  try {
    const { data: proposition, error: propErr } = await supabase
      .from("contrats_entreprises_elearning")
      .select("*")
      .eq("id", req.params.contratId)
      .eq("statut", "brouillon")
      .maybeSingle();
    if (propErr) return res.status(500).json({ error: propErr.message });
    if (!proposition) return res.status(404).json({ error: "Proposition de renouvellement introuvable" });

    const { data: ent, error: entErr } = await supabase.from("comptes_entreprises").select("*").eq("id", proposition.entreprise_id).maybeSingle();
    if (entErr) return res.status(500).json({ error: entErr.message });
    if (!ent) return res.status(404).json({ error: "Entreprise introuvable" });

    // Re-vérifié à la validation (pas seulement à la proposition) : le nombre de bénéficiaires
    // actifs a pu augmenter entre-temps.
    const nbActifs = await compterBeneficiairesActifs(proposition.entreprise_id);
    if ((proposition.nb_licences || 0) < nbActifs) {
      return res.status(400).json({ error: `Impossible de valider : ${nbActifs} bénéficiaire(s) sont désormais actifs, au-dessus des ${proposition.nb_licences} licences proposées.` });
    }

    // 1. Archiver le(s) contrat(s) actif(s) existant(s)
    await supabase
      .from("contrats_entreprises_elearning")
      .update({ statut: "expire" })
      .eq("entreprise_id", proposition.entreprise_id)
      .eq("statut", "actif");

    // 2. Activer la proposition
    const { data: contratActive, error: activeErr } = await supabase
      .from("contrats_entreprises_elearning")
      .update({ statut: "actif" })
      .eq("id", req.params.contratId)
      .select()
      .single();
    if (activeErr) return res.status(500).json({ error: activeErr.message });

    // 3. Répercuter sur la fiche entreprise - comptes_entreprises.package_elearning stocke un id
    // de catalogue (ou 'personnalise'), alors que contrats_entreprises_elearning.package stocke le
    // libellé affichable (même limitation que le reste de ce fichier, ex: PATCH /admin/:id ci-dessus,
    // qui ne fait la conversion que dans l'autre sens). On retrouve l'id correspondant si le libellé
    // correspond à un package du catalogue, sinon on considère qu'il s'agit d'un package personnalisé.
    const { data: pkgCatalogue } = await supabase
      .from("packages_commerciaux")
      .select("id")
      .eq("id", proposition.package)
      .maybeSingle();
    const estPersonnalise = !pkgCatalogue;
    const { data: entMaj, error: majErr } = await supabase
      .from("comptes_entreprises")
      .update({
        package_elearning: estPersonnalise ? "personnalise" : proposition.package,
        libelle_personnalise: estPersonnalise ? proposition.package : null,
        tarif_personnalise: estPersonnalise && proposition.nb_licences > 0 ? Math.round((proposition.montant_ht || 0) / proposition.nb_licences) : null,
        nb_licences: proposition.nb_licences || 0,
        montant_contrat: proposition.montant_ht || 0,
        devise: proposition.devise || "FCFA",
        date_debut_contrat: proposition.date_debut,
        date_fin_contrat: proposition.date_fin,
        option_replay: proposition.option_replay ?? false,
        types_sessions: proposition.types_sessions || ["ligne"],
        statut: "actif",
        acces_elearning: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposition.entreprise_id)
      .select()
      .single();
    if (majErr) return res.status(500).json({ error: majErr.message });

    const acteurNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";
    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   acteurNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "CONTRAT_RENOUVELLEMENT_VALIDE",
      module:       "crm_entreprises",
      entite_type:  "contrats_entreprises_elearning",
      entite_id:    contratActive.id,
      detail:       `Renouvellement validé pour ${ent.nom} - package ${proposition.package}, ${proposition.nb_licences} licences, du ${proposition.date_debut} au ${proposition.date_fin}`,
      metadata:     { entreprise_id: proposition.entreprise_id, contrat_id: contratActive.id },
      statut:       "success",
    }).catch(() => {});

    notifyEntreprise(proposition.entreprise_id, {
      type:    "entreprise",
      titre:   "🔄 Votre contrat a été renouvelé",
      message: `Votre nouveau contrat "${proposition.package}" (${proposition.nb_licences} bénéficiaires) a démarré, du ${proposition.date_debut} au ${proposition.date_fin}.`,
      meta:    { contrat_id: contratActive.id, package: proposition.package, nb_licences: proposition.nb_licences, date_debut_contrat: proposition.date_debut, date_fin_contrat: proposition.date_fin },
    }).catch(() => {});

    await notifyRole(
      ["super_admin", "admin", "manager", "superviseur", "comptable"],
      {
        type:    "entreprise",
        titre:   "✅ Renouvellement validé",
        message: `${acteurNom} a validé le renouvellement du contrat de ${ent.nom}.`,
        meta:    { entreprise_id: proposition.entreprise_id, contrat_id: contratActive.id },
        source:  "dash",
      },
      req.profil.id
    ).catch(() => {});

    res.json({ entreprise: entMaj, contrat: contratActive });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/entreprise/admin/paiements - tous les versements (toutes entreprises)
router.get("/admin/paiements", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("paiements_entreprises")
      .select("*")
      .order("date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ paiements: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/entreprise/admin/:id/paiements - versements d'une seule entreprise
// (utilisé par ModalOnboardingEntreprise dans DashboardAdmin.jsx, ouverte par entreprise)
router.get("/admin/:id/paiements", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("paiements_entreprises")
      .select("*")
      .eq("entreprise_id", req.params.id)
      .order("date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ paiements: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/entreprise/admin/:id/paiements - enregistrer un versement
router.post("/admin/:id/paiements", authenticateAdmin, requirePermission("finances","create"), async (req, res) => {
  try {
    const { montant, date, mode, reference, note, echeance_id } = req.body;
    if (!montant || !date) return res.status(400).json({ error: "Montant et date requis" });

    const creeParNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";

    const { data, error } = await supabase
      .from("paiements_entreprises")
      .insert({
        entreprise_id: req.params.id,
        montant,
        date,
        mode:          mode      || null,
        reference:     reference || null,
        note:          note      || null,
        echeance_id:   echeance_id || null,
        cree_par_id:   req.profil.id,
        cree_par_nom:  creeParNom,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const { data: ent } = await supabase.from("comptes_entreprises").select("nom").eq("id", req.params.id).maybeSingle();

    // Versement entreprise confirmé → vraie entrée dans le suivi des paiements + la trésorerie.
    enregistrerEncaissementEntreprise({
      client_nom: ent?.nom || "Entreprise", montant, date_paiement: date,
      mode_paiement: mode, reference, notes: note, created_by: req.profil?.id || null,
    }).catch(() => {});

    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   creeParNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "VERSEMENT_ENREGISTRE",
      module:       "finances",
      entite_type:  "paiements_entreprises",
      entite_id:    data.id,
      detail:       `Versement de ${montant.toLocaleString('fr-FR')} FCFA enregistré pour ${ent?.nom || req.params.id}`,
      metadata:     { entreprise_id: req.params.id, montant, mode, reference },
      statut:       "success",
    }).catch(() => {});

    // Notifie les rôles admin BET habilités à consulter les finances - même liste que la
    // notification "entreprise_parcours" ci-dessus - sans notifier l'auteur du versement
    // lui-même s'il fait déjà partie de ces rôles (ex: admin_manager qui saisit son propre versement).
    await notifyRole(
      ["super_admin", "admin", "manager", "superviseur", "comptable"],
      {
        type:    "paiement",
        titre:   "💰 Nouveau versement enregistré",
        message: `${creeParNom} a enregistré un versement de ${montant.toLocaleString('fr-FR')} FCFA pour ${ent?.nom || "une entreprise"}.`,
        meta:    { entreprise_id: req.params.id, paiement_id: data.id, montant },
        source:  "dash",
      },
      req.profil.id
    ).catch(() => {});

    // Le RH doit être notifié des versements effectués sur son propre contrat - sinon il
    // découvre l'encaissement seulement en consultant lui-même l'onglet Paiements.
    notifyEntreprise(req.params.id, {
      type:    "paiement",
      titre:   "💰 Versement enregistré",
      message: `Un versement de ${montant.toLocaleString('fr-FR')} FCFA a été enregistré sur votre contrat.`,
      meta:    { paiement_id: data.id, montant },
    }).catch(() => {});

    res.status(201).json({ paiement: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/entreprise/admin/:id/paiements/:paieId - corriger un versement déjà enregistré
router.patch("/admin/:id/paiements/:paieId", authenticateAdmin, requirePermission("finances","update"), async (req, res) => {
  try {
    const { montant, date, mode, reference, note } = req.body;
    if (!montant || !date) return res.status(400).json({ error: "Montant et date requis" });

    const { data: avant } = await supabase
      .from("paiements_entreprises")
      .select("*")
      .eq("id", req.params.paieId)
      .eq("entreprise_id", req.params.id)
      .maybeSingle();
    if (!avant) return res.status(404).json({ error: "Versement introuvable" });

    const modifParNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";

    const { data, error } = await supabase
      .from("paiements_entreprises")
      .update({
        montant,
        date,
        mode:      mode      || null,
        reference: reference || null,
        note:      note      || null,
      })
      .eq("id", req.params.paieId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const { data: ent } = await supabase.from("comptes_entreprises").select("nom").eq("id", req.params.id).maybeSingle();
    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   modifParNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "VERSEMENT_MODIFIE",
      module:       "finances",
      entite_type:  "paiements_entreprises",
      entite_id:    data.id,
      detail:       `Versement corrigé pour ${ent?.nom || req.params.id} : ${avant.montant.toLocaleString('fr-FR')} FCFA → ${montant.toLocaleString('fr-FR')} FCFA`,
      metadata:     { entreprise_id: req.params.id, avant, apres: data },
      statut:       "success",
    }).catch(() => {});

    await notifyRole(
      ["super_admin", "admin", "manager", "superviseur", "comptable"],
      {
        type:    "paiement",
        titre:   "✏️ Versement corrigé",
        message: `${modifParNom} a corrigé un versement pour ${ent?.nom || "une entreprise"} : ${avant.montant.toLocaleString('fr-FR')} FCFA → ${montant.toLocaleString('fr-FR')} FCFA.`,
        meta:    { entreprise_id: req.params.id, paiement_id: data.id, montant },
        source:  "dash",
      },
      req.profil.id
    ).catch(() => {});

    notifyEntreprise(req.params.id, {
      type:    "paiement",
      titre:   "✏️ Versement corrigé",
      message: `Un versement sur votre contrat a été corrigé : ${avant.montant.toLocaleString('fr-FR')} FCFA → ${montant.toLocaleString('fr-FR')} FCFA.`,
      meta:    { paiement_id: data.id, montant },
    }).catch(() => {});

    res.json({ paiement: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/entreprise/admin/:id/paiements/:paieId - supprimer un versement
// Réservé à l'admin BET (finances.delete) : une assistante peut saisir/corriger un versement
// mais jamais en effacer un - seul un rôle admin BET habilité peut annuler un encaissement enregistré.
router.delete("/admin/:id/paiements/:paieId", authenticateAdmin, requirePermission("finances","delete"), async (req, res) => {
  try {
    const { data: avant } = await supabase
      .from("paiements_entreprises")
      .select("*")
      .eq("id", req.params.paieId)
      .eq("entreprise_id", req.params.id)
      .maybeSingle();
    if (!avant) return res.status(404).json({ error: "Versement introuvable" });

    const { error } = await supabase
      .from("paiements_entreprises")
      .delete()
      .eq("id", req.params.paieId);
    if (error) return res.status(500).json({ error: error.message });

    const suppParNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";
    const { data: ent } = await supabase.from("comptes_entreprises").select("nom").eq("id", req.params.id).maybeSingle();

    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   suppParNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "VERSEMENT_SUPPRIME",
      module:       "finances",
      entite_type:  "paiements_entreprises",
      entite_id:    req.params.paieId,
      detail:       `Versement de ${avant.montant.toLocaleString('fr-FR')} FCFA supprimé pour ${ent?.nom || req.params.id}`,
      metadata:     { entreprise_id: req.params.id, paiement_supprime: avant },
      statut:       "success",
    }).catch(() => {});

    await notifyRole(
      ["super_admin", "admin", "manager", "superviseur", "comptable"],
      {
        type:    "paiement",
        titre:   "🗑️ Versement supprimé",
        message: `${suppParNom} a supprimé un versement de ${avant.montant.toLocaleString('fr-FR')} FCFA pour ${ent?.nom || "une entreprise"}.`,
        meta:    { entreprise_id: req.params.id, montant: avant.montant },
        source:  "dash",
      },
      req.profil.id
    ).catch(() => {});

    notifyEntreprise(req.params.id, {
      type:    "paiement",
      titre:   "🗑️ Versement supprimé",
      message: `Un versement de ${avant.montant.toLocaleString('fr-FR')} FCFA a été retiré de votre historique (erreur de saisie corrigée).`,
      meta:    { montant: avant.montant },
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
// VÉRIFICATION DES VERSEMENTS DÉCLARÉS PAR L'ENTREPRISE
//
// Un versement saisi par un admin BET naît 'recu' : la personne qui le saisit
// EST la vérification. Un versement déclaré par le RH de l'entreprise naît
// 'declare' et n'entre dans aucun total tant qu'un humain de BET n'a pas ouvert
// la pièce jointe. Ces deux routes sont ce moment-là.
// ════════════════════════════════════════════════════════════════════

// PATCH /api/entreprise/admin/:id/paiements/:paieId/valider
// La preuve a été regardée et elle tient : le versement devient un encaissement.
router.patch("/admin/:id/paiements/:paieId/valider", authenticateAdmin, requirePermission("finances","update"), async (req, res) => {
  try {
    const { data: paie } = await supabase
      .from("paiements_entreprises")
      .select("*")
      .eq("id", req.params.paieId)
      .eq("entreprise_id", req.params.id)
      .maybeSingle();
    if (!paie) return res.status(404).json({ error: "Versement introuvable" });

    /* Garde-fou contre le double-clic et contre deux vérificatrices qui ouvrent
       la même fiche : sans lui, le second appel repasserait l'encaissement en
       trésorerie et le montant serait compté deux fois. */
    if (paie.statut === "recu") return res.status(409).json({ error: "Ce versement est déjà validé" });

    const valideParNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";

    const { data, error } = await supabase
      .from("paiements_entreprises")
      .update({
        statut:         "recu",
        valide_par_id:  req.profil.id,
        valide_par_nom: valideParNom,
        valide_le:      new Date().toISOString(),
        motif_rejet:    null,   // efface la trace d'un rejet précédent corrigé puis revalidé
      })
      .eq("id", req.params.paieId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const { data: ent } = await supabase.from("comptes_entreprises").select("nom").eq("id", req.params.id).maybeSingle();

    /* L'ENCAISSEMENT PART ICI, et nulle part ailleurs pour une déclaration RH :
       c'est tout l'intérêt du statut 'declare'. La saisie admin directe
       (POST ci-dessus) encaisse à la saisie, puisqu'elle naît déjà validée. */
    enregistrerEncaissementEntreprise({
      client_nom: ent?.nom || "Entreprise", montant: paie.montant, date_paiement: paie.date,
      mode_paiement: paie.mode, reference: paie.reference, notes: paie.note, created_by: req.profil?.id || null,
    }).catch(() => {});

    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   valideParNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "VERSEMENT_VALIDE",
      module:       "finances",
      entite_type:  "paiements_entreprises",
      entite_id:    data.id,
      detail:       `Versement de ${paie.montant.toLocaleString('fr-FR')} FCFA validé pour ${ent?.nom || req.params.id} (déclaré par ${paie.declare_par_nom || "l'entreprise"})`,
      metadata:     { entreprise_id: req.params.id, montant: paie.montant, preuves: (paie.preuves || []).length },
      statut:       "success",
    }).catch(() => {});

    await notifyRole(
      ["super_admin", "admin", "manager", "superviseur", "comptable"],
      {
        type:    "paiement",
        titre:   "✅ Versement entreprise validé",
        message: `${valideParNom} a validé le versement de ${paie.montant.toLocaleString('fr-FR')} FCFA déclaré par ${ent?.nom || "une entreprise"}.`,
        meta:    { entreprise_id: req.params.id, paiement_id: data.id, montant: paie.montant },
        source:  "dash",
      },
      req.profil.id
    ).catch(() => {});

    notifyEntreprise(req.params.id, {
      type:    "paiement",
      titre:   "✅ Votre versement a été validé",
      message: `Votre versement de ${paie.montant.toLocaleString('fr-FR')} FCFA a été vérifié et enregistré sur votre contrat.`,
      meta:    { paiement_id: data.id, montant: paie.montant },
    }).catch(() => {});

    res.json({ paiement: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/entreprise/admin/:id/paiements/:paieId/rejeter
// La preuve ne tient pas. On ne supprime pas la ligne : le RH doit voir POURQUOI,
// sinon il redéclare à l'identique et la même pièce revient en boucle.
router.patch("/admin/:id/paiements/:paieId/rejeter", authenticateAdmin, requirePermission("finances","update"), async (req, res) => {
  try {
    const motif = (req.body?.motif || "").trim();
    if (!motif) return res.status(400).json({ error: "Le motif du rejet est obligatoire" });

    const { data: paie } = await supabase
      .from("paiements_entreprises")
      .select("*")
      .eq("id", req.params.paieId)
      .eq("entreprise_id", req.params.id)
      .maybeSingle();
    if (!paie) return res.status(404).json({ error: "Versement introuvable" });

    /* Un versement déjà encaissé ne se rejette pas : l'argent est entré en
       trésorerie, le défaire relève de la suppression (finances.delete), pas d'ici. */
    if (paie.statut === "recu") {
      return res.status(409).json({ error: "Ce versement est déjà validé - utilisez la suppression pour l'annuler" });
    }

    const rejeteParNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";

    const { data, error } = await supabase
      .from("paiements_entreprises")
      .update({
        statut:         "rejete",
        motif_rejet:    motif,
        valide_par_id:  req.profil.id,
        valide_par_nom: rejeteParNom,
        valide_le:      new Date().toISOString(),
      })
      .eq("id", req.params.paieId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const { data: ent } = await supabase.from("comptes_entreprises").select("nom").eq("id", req.params.id).maybeSingle();

    req._auditLogged = true;
    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   rejeteParNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "VERSEMENT_REJETE",
      module:       "finances",
      entite_type:  "paiements_entreprises",
      entite_id:    data.id,
      detail:       `Versement de ${paie.montant.toLocaleString('fr-FR')} FCFA rejeté pour ${ent?.nom || req.params.id} - motif : ${motif}`,
      metadata:     { entreprise_id: req.params.id, montant: paie.montant, motif },
      statut:       "success",
    }).catch(() => {});

    notifyEntreprise(req.params.id, {
      type:    "paiement",
      titre:   "⚠️ Votre versement n'a pas pu être validé",
      message: `Le versement de ${paie.montant.toLocaleString('fr-FR')} FCFA déclaré n'a pas été validé : ${motif}`,
      meta:    { paiement_id: data.id, montant: paie.montant, motif },
    }).catch(() => {});

    res.json({ paiement: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Documents entreprise (onglet "Documents" du modal détail) ─────────
// GET /api/entreprise/admin/:id/documents - liste des documents déposés
router.get("/admin/:id/documents", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("entreprise_documents")
      .select("*")
      .eq("entreprise_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ documents: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/entreprise/admin/:id/documents - enregistre un document déjà uploadé (Cloudinary)
router.post("/admin/:id/documents", authenticateAdmin, requirePermission("crm_entreprises","create"), async (req, res) => {
  try {
    const { nom, url, format, taille } = req.body;
    if (!nom || !url) return res.status(400).json({ error: "Nom et URL du document requis" });
    const deposantNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Admin";
    const { data, error } = await supabase
      .from("entreprise_documents")
      .insert({
        entreprise_id:  req.params.id,
        nom, url,
        format:         format || null,
        taille:         taille || null,
        depose_par_id:  req.profil?.id || null,
        depose_par_nom: deposantNom,
      })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ document: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/entreprise/admin/:id/documents/:docId
router.delete("/admin/:id/documents/:docId", authenticateAdmin, requirePermission("crm_entreprises","delete"), async (req, res) => {
  try {
    // Si le document supprimé est la "preuve d'inscription", on doit aussi vider
    // comptes_entreprises.fichier_preuve_url - sinon la prochaine modification de
    // l'entreprise (qui renvoie toujours ce champ dans son payload) la ferait
    // réapparaître via syncPreuveDocument().
    const { data: doc } = await supabase
      .from("entreprise_documents")
      .select("type")
      .eq("id", req.params.docId)
      .eq("entreprise_id", req.params.id)
      .maybeSingle();

    const { error } = await supabase
      .from("entreprise_documents")
      .delete()
      .eq("id", req.params.docId)
      .eq("entreprise_id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });

    if (doc?.type === "preuve_inscription") {
      await supabase.from("comptes_entreprises").update({ fichier_preuve_url: null }).eq("id", req.params.id);
    }

    res.json({ message: "Document supprimé" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════════
// ESPACE BET E-LEARNING - ENTREPRISES
// Routes consommées par DashboardEntreprise (bet-elearning)
// Auth : token admin_token stocké côté client (même flux que LoginAdmin)
// ════════════════════════════════════════════════════════════════════

// Middleware interne : vérifie que l'utilisateur connecté est client_entreprise
// ou un admin BET (pour permettre la prévisualisation admin)
async function requireEntrepriseOrAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant" });
  }
  const token = authHeader.split(" ")[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Token invalide ou expiré" });

  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profil) return res.status(403).json({ error: "Profil introuvable" });
  if (!profil.actif) return res.status(403).json({ error: "Compte désactivé" });

  const rolesAutorises = [
    "client_entreprise",
    "super_admin","admin","manager","admin_elearning","assistant_elearning",
    "superviseur","deputy_superviseur",
  ];
  if (!rolesAutorises.includes(profil.role)) {
    return res.status(403).json({ error: "Accès réservé à l'espace entreprise" });
  }

  req.user   = user;
  req.profil = profil;
  req.role   = profil.role;
  next();
}

// ── PATCH /api/entreprise/elearning/update-avatar - photo de profil personnelle ──
router.patch("/elearning/update-avatar", requireEntrepriseOrAdmin, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier manquant" });

    const publicUrl = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "bet/avatars-utilisateurs", resource_type: "image", transformation: [{ width: 300, height: 300, crop: "fill", gravity: "face" }] },
        (err, result) => { if (err) return reject(err); resolve(result.secure_url); }
      );
      stream.end(req.file.buffer);
    });

    await supabase.from("utilisateurs").update({ avatar_url: publicUrl }).eq("id", req.user.id);

    res.json({ avatar_url: publicUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/entreprise/elearning/update-logo - le RH met à jour le logo ──
router.patch("/elearning/update-logo", requireEntrepriseOrAdmin, upload.single("logo"), async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.status(400).json({ error: "Aucune entreprise liée à ce compte" });
    if (!req.file)     return res.status(400).json({ error: "Fichier manquant" });

    const publicUrl = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "bet/logos-entreprises", resource_type: "image", transformation: [{ width: 400, height: 400, crop: "fill" }] },
        (err, result) => { if (err) return reject(err); resolve(result.secure_url); }
      );
      stream.end(req.file.buffer);
    });

    await supabase.from("comptes_entreprises").update({ logo_url: publicUrl, updated_at: new Date().toISOString() }).eq("id", entrepriseId);

    res.json({ logo_url: publicUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/entreprise/elearning/mon-compte ─────────────────────────────────
// Retourne les infos de l'entreprise + contrat actif du RH connecté
router.get("/elearning/mon-compte", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée à ce compte" });

    const { data: entreprise, error: eErr } = await supabase
      .from("comptes_entreprises")
      .select("*")
      .eq("id", entrepriseId)
      .single();

    if (eErr || !entreprise) return res.status(404).json({ error: "Entreprise introuvable" });

    const { data: contrat } = await supabase
      .from("contrats_entreprises_elearning")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .eq("statut", "actif")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Historique complet (contrats précédents inclus) - pour que le RH puisse voir les
    // renouvellements passés de son entreprise, pas seulement le contrat en cours.
    const { data: contratsHistorique } = await supabase
      .from("contrats_entreprises_elearning")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .order("created_at", { ascending: false });

    res.json({ entreprise, contrat: contrat || null, contratsHistorique: contratsHistorique || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entreprise/elearning/mes-paiements ──────────────────────────────
// Historique complet des versements de l'entreprise du RH connecté. Le RH peut
// DÉCLARER un versement (POST ci-dessous) mais jamais le valider ni le corriger :
// la vérification de la preuve appartient à BET.
router.get("/elearning/mes-paiements", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée à ce compte" });

    const { data: paiements, error } = await supabase
      .from("paiements_entreprises")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .order("date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    res.json({ paiements: paiements || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/entreprise/elearning/preuve-paiement ───────────────────────────
// Dépose UNE pièce justificative et renvoie son URL. Le RH en envoie souvent
// deux (ordre de virement + avis de débit), d'où un appel par fichier plutôt
// qu'un envoi groupé : un PDF qui échoue ne fait pas retomber les autres, et la
// déclaration elle-même (POST ci-dessous) ne part qu'avec les URL déjà obtenues.
//
// `resource_type: "auto"` parce qu'un justificatif est tantôt une photo du reçu,
// tantôt un PDF bancaire. Cloudinary classe le PDF en `image` ou `raw` selon le
// cas et, pour `raw`, ne rajoute PAS l'extension au nom : sans elle le fichier
// arrive inouvrable. On la recolle donc au public_id, comme uploadRoutes.js.
router.post("/elearning/preuve-paiement", requireEntrepriseOrAdmin, upload.single("preuve"), async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId && req.role === "client_entreprise") {
      return res.status(400).json({ error: "Aucune entreprise liée à ce compte" });
    }
    if (!req.file) return res.status(400).json({ error: "Fichier manquant" });

    const FORMATS_OK = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
    if (!FORMATS_OK.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Format non accepté - envoyez une image (JPG, PNG) ou un PDF" });
    }

    const nomOriginal = req.file.originalname || "preuve";
    const ext  = nomOriginal.includes(".") ? nomOriginal.split(".").pop().toLowerCase() : "";
    const base = `preuve_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const resultat = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder:        "bet/preuves-paiements",
          resource_type: "auto",
          public_id:     ext ? `${base}.${ext}` : base,
        },
        (err, result) => { if (err) return reject(err); resolve(result); }
      );
      stream.end(req.file.buffer);
    });

    res.json({
      preuve: {
        url:    resultat.secure_url,
        nom:    nomOriginal,
        type:   req.file.mimetype,
        taille: req.file.size,
      },
    });
  } catch (err) {
    console.error("[entreprise/preuve-paiement]", err);
    res.status(500).json({ error: err.message || "Envoi de la pièce jointe impossible" });
  }
});

// ── POST /api/entreprise/elearning/mes-paiements ─────────────────────────────
// Le RH déclare un versement qu'il a effectué. La ligne naît 'declare' : elle
// apparaît dans l'historique, marquée en attente, mais n'entre dans AUCUN total
// et ne touche PAS la trésorerie tant que BET n'a pas ouvert la pièce jointe
// (voir PATCH .../valider plus haut).
router.post("/elearning/mes-paiements", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée à ce compte" });

    const { montant, date, mode, reference, note, preuves } = req.body || {};
    const montantNum = Number(montant);
    if (!montantNum || montantNum <= 0) return res.status(400).json({ error: "Montant invalide" });
    if (!date) return res.status(400).json({ error: "Date requise" });

    /* La preuve est le cœur du dispositif : sans pièce jointe, la vérificatrice
       n'a rien à vérifier et la déclaration n'est qu'une affirmation. On exige
       donc au moins une pièce, plutôt que d'accepter une ligne invérifiable. */
    const listePreuves = Array.isArray(preuves) ? preuves.filter(p => p?.url) : [];
    if (listePreuves.length === 0) {
      return res.status(400).json({ error: "Au moins une pièce justificative est requise" });
    }

    const declareParNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Entreprise";

    const { data, error } = await supabase
      .from("paiements_entreprises")
      .insert({
        entreprise_id:   entrepriseId,
        montant:         Math.round(montantNum),
        date,
        mode:            mode      || null,
        reference:       reference || null,
        note:            note      || null,
        statut:          "declare",
        preuves:         listePreuves,
        declare_par_id:  req.profil.id,
        declare_par_nom: declareParNom,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const { data: ent } = await supabase.from("comptes_entreprises").select("nom").eq("id", entrepriseId).maybeSingle();
    const nomEnt = ent?.nom || "Une entreprise";

    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   declareParNom,
      acteur_email: req.profil.email,
      acteur_role:  req.role,
      action_type:  "VERSEMENT_DECLARE",
      module:       "finances",
      entite_type:  "paiements_entreprises",
      entite_id:    data.id,
      detail:       `${nomEnt} a déclaré un versement de ${Math.round(montantNum).toLocaleString('fr-FR')} FCFA (${listePreuves.length} pièce(s) jointe(s))`,
      metadata:     { entreprise_id: entrepriseId, montant: Math.round(montantNum), mode, reference, nb_preuves: listePreuves.length },
      statut:       "success",
    }).catch(() => {});

    const corpsNotif = {
      type:    "paiement",
      titre:   "🧾 Versement déclaré - à vérifier",
      message: `${nomEnt} a déclaré un versement de ${Math.round(montantNum).toLocaleString('fr-FR')} FCFA avec ${listePreuves.length} justificatif(s). À vérifier avant validation.`,
      meta:    { entreprise_id: entrepriseId, paiement_id: data.id, montant: Math.round(montantNum), a_verifier: true },
    };

    /* UN SEUL ENVOI, et la source n'est plus écrite à la main : la déclaration vient
       de l'espace RH, donc de bet-elearning, et `plateformeCourante()` le déduit de
       l'en-tête de la requête. `super_admin` et `admin` ne sont pas listés non plus -
       `notifyRole` les ajoute d'office. */
    await notifyRole(
      ["assistant_elearning", "commercial", "corporate", "admin_commercial", "manager", "comptable"],
      corpsNotif,
      req.profil.id
    ).catch(() => {});

    res.status(201).json({ paiement: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entreprise/elearning/beneficiaires/:id/tests ───────────────────
// L'historique des tests de niveau d'UN bénéficiaire, pour l'espace RH.
//
// Un apprenant en passe plusieurs au fil de sa formation - à l'entrée, puis à chaque
// changement de classe - et le RH qui finance la formation a de quoi vouloir suivre cette
// progression. C'est la même agrégation que côté BET (`testsNiveauParEmail`), les deux
// circuits de test confondus.
//
// LE CONTRÔLE D'ACCÈS EST LA RAISON D'ÊTRE DE CETTE ROUTE. L'équivalent côté BET
// (`/api/placement/tests-apprenant?email=…`) prend l'adresse en paramètre et la croit :
// l'exposer au RH lui permettrait de lire les résultats de n'importe quel apprenant, y
// compris ceux d'une autre société. Ici l'appelant désigne un BÉNÉFICIAIRE par son id, et
// on vérifie qu'il appartient bien à son entreprise AVANT de résoudre quoi que ce soit -
// l'e-mail est lu en base, jamais reçu du client.
router.get("/elearning/beneficiaires/:id/tests", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.status(404).json({ error: "Aucune entreprise liée à ce compte" });

    // Les classes de CETTE entreprise, et elles seules.
    const { data: classes } = await supabase
      .from("classes_elearning").select("id").eq("entreprise_id", entrepriseId);
    const classeIds = (classes || []).map(c => c.id);

    let email = null;
    if (classeIds.length) {
      const { data: appr } = await supabase
        .from("classes_elearning_apprenants")
        .select("email, classe_id")
        .eq("id", req.params.id)
        .in("classe_id", classeIds)
        .maybeSingle();
      email = appr?.email || null;
    }

    // Repli sur l'ancien système de bénéficiaires, lui aussi borné à l'entreprise.
    if (!email) {
      const { data: ancien } = await supabase
        .from("beneficiaires_entreprise")
        .select("email, utilisateur:utilisateurs(email)")
        .eq("id", req.params.id)
        .eq("entreprise_id", entrepriseId)
        .maybeSingle();
      email = ancien?.utilisateur?.email || ancien?.email || null;
    }

    /* 404 et non 403 : ne pas confirmer qu'un identifiant existe quand il ne vous
       appartient pas - c'est ce qui permettrait de deviner les bénéficiaires d'autrui. */
    if (!email) return res.status(404).json({ error: "Bénéficiaire introuvable" });

    res.json({ tests: await testsNiveauParEmail(email) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entreprise/elearning/beneficiaires ───────────────────────────────
// Liste des bénéficiaires de l'entreprise : ancien système (beneficiaires_entreprise)
// + nouveau système e-learning (classes_elearning_apprenants)
router.get("/elearning/beneficiaires", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.json({ beneficiaires: [] });

    // 1. Ancien système - bénéficiaires avec compte utilisateur
    const { data: anciens } = await supabase
      .from("beneficiaires_entreprise")
      .select(`*, utilisateur:utilisateurs(id, nom, prenom, email, telephone, avatar_url, acces_elearning)`)
      .eq("entreprise_id", entrepriseId)
      .order("date_inscription", { ascending: false });

    const beneficiaires = (anciens || []).map(b => ({
      ...b,
      nom:             b.utilisateur?.nom       || "",
      prenom:          b.utilisateur?.prenom    || "",
      email:           b.utilisateur?.email     || b.email || "",
      telephone:       b.utilisateur?.telephone || b.telephone || "",
      avatar_url:      b.utilisateur?.avatar_url || null,
      acces_elearning: b.utilisateur?.acces_elearning ?? false,
      _source:         'ancien',
    }));

    // 2. Nouveau système e-learning - apprenants dans les classes de l'entreprise
    const { data: classes } = await supabase
      .from("classes_elearning")
      .select("id, nom, niveau, coach_nom, statut")
      .eq("entreprise_id", entrepriseId)
      .neq("statut", "archive");

    if (classes?.length) {
      const classeIds = classes.map(c => c.id);
      const { data: apprenants } = await supabase
        .from("classes_elearning_apprenants")
        .select("*")
        .in("classe_id", classeIds)
        .eq("statut", "actif");

      const emailsExistants = new Set(beneficiaires.map(b => b.email).filter(Boolean));

      (apprenants || []).forEach(a => {
        if (a.email && emailsExistants.has(a.email)) return; // déjà présent
        const classe = classes.find(c => c.id === a.classe_id);
        const parts  = (a.nom_complet || '').trim().split(/\s+/);
        beneficiaires.push({
          id:              a.id,
          nom:             parts.length > 1 ? parts.slice(-1)[0] : parts[0] || '',
          prenom:          parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
          nom_complet:     a.nom_complet,
          email:           a.email   || "",
          telephone:       a.telephone || "",
          niveau_cecr:     a.niveau_cecr,
          statut:          a.statut,
          avatar_url:      null,
          acces_elearning: false,
          groupe_id:       a.classe_id,
          groupe_nom:      classe?.nom || null,
          classe_id:       a.classe_id,
          classe_nom:      classe?.nom || null,
          coach_nom:       classe?.coach_nom || null,
          date_inscription: a.date_inscription,
          date_naissance:  a.date_naissance    || null,
          profil_type:     a.profil_type       || 'adulte',
          prenom_parent:   a.prenom_parent     || null,
          nom_parent:      a.nom_parent        || null,
          email_parent:    a.email_parent      || null,
          telephone_parent: a.telephone_parent || null,
          classe_scolaire: a.classe            || null,
          _source:         'elearning',
        });
        if (a.email) emailsExistants.add(a.email);
      });
    }

    res.json({ beneficiaires });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entreprise/elearning/groupes ─────────────────────────────────────
// Groupes de cours liés à l'entreprise
router.get("/elearning/groupes", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.json({ groupes: [] });

    const { data, error } = await supabase
      .from("groupes")
      .select("id, nom, statut, niveau, nb_seances_total, nb_seances_realisees, coach_id, coach_nom, date_debut, date_fin, horaires, centre")
      .eq("entreprise_id", entrepriseId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ groupes: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/entreprise/elearning/apprenants/:id/statut ────────────────────
// Le RH entreprise active ou suspend un apprenant dans ses classes e-learning
router.patch("/elearning/apprenants/:id/statut", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const { statut, type_suspension, motif } = req.body;
    if (!['actif', 'suspendu'].includes(statut)) return res.status(400).json({ error: 'statut invalide (actif|suspendu)' });

    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.status(403).json({ error: 'Accès refusé' });

    // Vérifier que l'apprenant appartient bien à une classe de cette entreprise
    const { data: app } = await supabase
      .from('classes_elearning_apprenants')
      .select('id, classe_id, email, nom_complet, apprenant_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!app) return res.status(404).json({ error: 'Apprenant introuvable' });

    const { data: classe } = await supabase
      .from('classes_elearning')
      .select('id, entreprise_id, coach_id, nom')
      .eq('id', app.classe_id)
      .maybeSingle();

    if (!classe || classe.entreprise_id !== entrepriseId) return res.status(403).json({ error: 'Non autorisé' });

    // Mettre à jour le statut dans la table
    const updatePayload = { statut };
    if (statut === 'suspendu') {
      updatePayload.notes = [
        type_suspension === 'definitive' ? '[SUSPENSION DÉFINITIVE]' : '[SUSPENSION MOMENTANÉE]',
        motif || '',
      ].filter(Boolean).join(' - ');
    } else {
      updatePayload.notes = null;
    }

    const { data, error } = await supabase
      .from('classes_elearning_apprenants')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Bloquer / débloquer le compte Auth Supabase via email
    if (app.email) {
      try {
        const { data: { users } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = (users || []).find(u => u.email?.toLowerCase() === app.email.toLowerCase());
        if (authUser) {
          const appMeta = authUser.app_metadata || {};
          const newMeta = statut === 'suspendu'
            ? { ...appMeta, acces_bloque: true,  type_suspension: type_suspension || 'momentanee', motif_suspension: motif || null }
            : { ...appMeta, acces_bloque: false, type_suspension: null, motif_suspension: null };
          await supabase.auth.admin.updateUserById(authUser.id, { app_metadata: newMeta });
        }
      } catch (authErr) {
        console.warn('[suspension] mise à jour auth_metadata échouée:', authErr.message);
      }
    }

    // Notifier l'apprenant et le coach de sa classe - jusqu'ici, une suspension/réactivation
    // déclenchée par le RH entreprise ne prévenait personne, contrairement à la même action
    // déclenchée en interne (cf. apprenants.js /:id/suspension).
    const nomCompletApp = app.nom_complet || app.email || 'Cet apprenant';
    if (data.apprenant_id) {
      await notifyUser(data.apprenant_id, {
        type:    statut === 'suspendu' ? 'suspension' : 'reinstatement',
        titre:   statut === 'suspendu' ? '🔒 Accès suspendu' : '🔓 Accès rétabli',
        message: statut === 'suspendu'
          ? `Votre accès a été suspendu par votre entreprise.${motif ? ` Motif : ${motif}.` : ''}`
          : 'Votre accès a été rétabli par votre entreprise.',
        meta: { classe_apprenant_id: data.id },
      }).catch(() => {});
    }
    if (classe?.coach_id) {
      await notifyUser(classe.coach_id, {
        type:    statut === 'suspendu' ? 'suspension' : 'reinstatement',
        titre:   statut === 'suspendu' ? `🔒 Apprenant suspendu - ${nomCompletApp}` : `🔓 Apprenant réintégré - ${nomCompletApp}`,
        message: statut === 'suspendu'
          ? `${nomCompletApp} a été suspendu(e) par son entreprise dans "${classe.nom || 'sa classe'}".`
          : `${nomCompletApp} a été réintégré(e) par son entreprise dans "${classe.nom || 'sa classe'}".`,
        meta: { classe_apprenant_id: data.id, classe_id: classe.id },
      }).catch(() => {});
    }

    res.json({ apprenant: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entreprise/elearning/mes-classes ────────────────────────────────
// Classes e-learning de l'entreprise avec leurs apprenants
router.get("/elearning/mes-classes", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.json({ classes: [] });

    const { data: classes, error } = await supabase
      .from("classes_elearning")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .neq("statut", "archive")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const ids = (classes || []).map(c => c.id);
    let apprenants = [];
    if (ids.length) {
      const { data: app } = await supabase
        .from("classes_elearning_apprenants")
        .select("*")
        .in("classe_id", ids)
        .eq("statut", "actif");
      apprenants = app || [];
    }

    const result = (classes || []).map(c => ({
      ...c,
      apprenants:    apprenants.filter(a => a.classe_id === c.id),
      nb_apprenants: apprenants.filter(a => a.classe_id === c.id).length,
    }));

    res.json({ classes: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entreprise/elearning/rapports ────────────────────────────────────
// Rapports mensuels publiés pour l'entreprise
router.get("/elearning/rapports", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.json({ rapports: [] });

    const { data, error } = await supabase
      .from("rapports_entreprise")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .eq("statut", "publie")
      .order("annee", { ascending: false })
      .order("mois",  { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ rapports: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entreprise/elearning/messages ────────────────────────────────────
router.get("/elearning/messages", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.json({ messages: [] });

    const { data, error } = await supabase
      .from("messages_entreprise")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ messages: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/entreprise/elearning/messages ───────────────────────────────────
router.post("/elearning/messages", requireEntrepriseOrAdmin, async (req, res) => {
  try {
    const entrepriseId = req.profil.entreprise_id;
    if (!entrepriseId) return res.status(400).json({ error: "Aucune entreprise liée" });

    const { contenu, piece_jointe_url } = req.body;
    if (!contenu?.trim()) return res.status(400).json({ error: "Contenu requis" });

    const { data, error } = await supabase
      .from("messages_entreprise")
      .insert({
        entreprise_id,
        expediteur_id:   req.profil.id,
        expediteur_role: req.role,
        contenu:         contenu.trim(),
        piece_jointe_url: piece_jointe_url || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ message: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
