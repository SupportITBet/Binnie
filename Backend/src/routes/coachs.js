import express from "express";
import supabase from "../config/supabase.js";
import { authenticateUser } from "../middlewares/auth.js";
import { estPersonnel, groupesDeLUtilisateur } from "../services/accesApprenant.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { sendCoachWelcomeEmail } from "../services/emailService.js";
import { logAudit } from "../middlewares/logAudit.js";
import { notifyRole, notifyUser, ROLES_SUPERVISION_GLOBALE, notifyDeputiesDuCoach } from "../services/notifyRole.js";
import { sessionsDeleguesA, sessionsDeleguesPar, refuserSiTitulaireDelegue } from "../services/delegations.js";
import { resolveParentUserId } from "./groupes.js";
import { clotureSeance } from "./seances.js";

import { staffDesClasses } from "../services/staffDesClasses.js";

const router = express.Router();

console.log("✅ Route coachs chargée");

// assistantes.utilisateur_id n'existe pas en base (jamais migrée) - le lien vers utilisateurs
// se fait par email. Résout l'id utilisateurs correspondant à l'email d'une assistante.
async function resolveAssistanteUserId(email) {
  if (!email) return null;
  const { data } = await supabase.from("utilisateurs").select("id").ilike("email", email).maybeSingle();
  return data?.id || null;
}

// ── Auth middleware pour les coachs (JWT Supabase) ──────────
const ROLES_COACH_VALIDES = ["coach", "professeur_titulaire", "professeur_remplacant"];

const authenticateCoach = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Non authentifié" });
  const token = auth.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "Token invalide" });
  const role = data.user.app_metadata?.role;
  if (!ROLES_COACH_VALIDES.includes(role)) return res.status(403).json({ error: "Accès réservé aux coachs" });
  // authenticateAdmin (requireAdmin.js) rejette déjà un compte désactivé via `utilisateurs.actif`
  // - mais ce middleware, propre aux routes coach de ce fichier, ne le vérifiait jamais : un
  // coach dont l'accès est bloqué (PATCH /:id/suspension) pouvait continuer à utiliser son
  // profil, ses disponibilités et ses Session Live normalement.
  if (data.user.app_metadata?.acces_bloque) return res.status(403).json({ error: "Accès bloqué - contactez votre PA Advisor" });
  req.coachId = data.user.id;
  next();
};

// ── GET profil complet du coach connecté (contrat, grade, tarif) ──
router.get("/moi", authenticateCoach, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("coachs")
      .select("*")
      .eq("id", req.coachId)
      .maybeSingle();
    if (error) throw error;
    res.json({ coach: data || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MIGRATION_DISPO_MOIS = "Backend/sql/coach_disponibilites_mois_migration.sql";
const isMissingMoisColumn = (err) => (err?.message || "").includes("mois") || (err?.message || "").includes("column");

// ── GET disponibilités du coach connecté (mois/année, défaut = mois courant) ──
router.get("/disponibilites", authenticateCoach, async (req, res) => {
  try {
    const now   = new Date();
    const mois  = parseInt(req.query.mois, 10)  || (now.getMonth() + 1);
    const annee = parseInt(req.query.annee, 10) || now.getFullYear();

    const { data, error } = await supabase
      .from("coach_disponibilites")
      .select("*")
      .eq("coach_id", req.coachId)
      .eq("mois", mois)
      .eq("annee", annee);
    if (error) {
      if (isMissingMoisColumn(error)) {
        return res.json({ ok: false, error: "MIGRATION SQL NON JOUÉE - colonnes mois/annee absentes de coach_disponibilites", migration_file: MIGRATION_DISPO_MOIS, disponibilites: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ disponibilites: data || [], mois, annee });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST upsert disponibilités du mois (slots non verrouillés) ─────
router.post("/disponibilites", authenticateCoach, async (req, res) => {
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots)) return res.status(400).json({ error: "slots doit être un tableau" });
    const now   = new Date();
    const mois  = parseInt(req.body.mois, 10)  || (now.getMonth() + 1);
    const annee = parseInt(req.body.annee, 10) || now.getFullYear();

    // Récupérer les créneaux verrouillés existants pour ce mois
    const { data: existing, error: existErr } = await supabase
      .from("coach_disponibilites")
      .select("jour, creneau, verrouille")
      .eq("coach_id", req.coachId)
      .eq("mois", mois)
      .eq("annee", annee);
    if (existErr && isMissingMoisColumn(existErr)) {
      return res.status(409).json({ error: "MIGRATION SQL NON JOUÉE - colonnes mois/annee absentes de coach_disponibilites", migration_file: MIGRATION_DISPO_MOIS });
    }

    const lockedKeys = new Set(
      (existing || []).filter(r => r.verrouille).map(r => `${r.jour}|${r.creneau}`)
    );

    const toUpsert = slots
      .filter(s => !lockedKeys.has(`${s.jour}|${s.creneau}`))
      .map(s => ({
        coach_id:   req.coachId,
        mois,
        annee,
        jour:       s.jour,
        creneau:    s.creneau,
        debut:      s.debut,
        fin:        s.fin,
        dispo:      s.dispo,
        verrouille: false,
        updated_at: new Date().toISOString(),
      }));

    if (toUpsert.length === 0) {
      return res.json({ message: "Aucun créneau modifiable (tous verrouillés)", updated: 0 });
    }

    const { error } = await supabase
      .from("coach_disponibilites")
      .upsert(toUpsert, { onConflict: "coach_id,mois,annee,jour,creneau" });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Disponibilités enregistrées", updated: toUpsert.length, mois, annee });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET disponibilités d'un coach par ID (admin) - défaut = mois courant ──
router.get("/:id/disponibilites", authenticateAdmin, async (req, res) => {
  try {
    const now   = new Date();
    const mois  = parseInt(req.query.mois, 10)  || (now.getMonth() + 1);
    const annee = parseInt(req.query.annee, 10) || now.getFullYear();

    const { data, error } = await supabase
      .from("coach_disponibilites")
      .select("*")
      .eq("coach_id", req.params.id)
      .eq("mois", mois)
      .eq("annee", annee)
      .eq("dispo", true)
      .order("debut", { ascending: true });
    if (error) {
      if (isMissingMoisColumn(error)) {
        return res.json({ ok: false, error: "MIGRATION SQL NON JOUÉE - colonnes mois/annee absentes de coach_disponibilites", migration_file: MIGRATION_DISPO_MOIS, disponibilites: [] });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ disponibilites: data || [], mois, annee });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Lecture publique : coachs actifs (site frontend) ────────
router.get("/publics", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("coachs")
      .select("id, nom, prenom, grade, photo_url")
      .eq("actif", true)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lister tous les coachs ──────────────────────────────────
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("coachs")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    // Normalise les champs selon ce qui existe réellement dans la table
    const normalized = (data || []).map(c => ({
      id:                c.id,
      nom:               c.nom               || null,
      prenom:            c.prenom            || null,
      grade:             c.grade             || "Coach",
      photo_url:         c.photo_url         || null,
      actif:             c.actif             !== false,
      biographie:        c.biographie        || c.bio          || null,
      specialites:       c.specialites       || [],
      niveaux_enseignes: c.niveaux_enseignes || [],
      experience_annees: c.experience_annees || null,
      email_professionnel: c.email_professionnel || c.email    || null,
      type_contrat:      c.type_contrat      || null,
      taux_horaire:      c.taux_horaire      || null,
    }));
    res.json({ coachs: normalized });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Créer un coach affichage uniquement (sans compte auth) ──
router.post("/display", authenticateAdmin, async (req, res) => {
  try {
    const { nom, prenom, grade, photo_url } = req.body;
    if (!nom) return res.status(400).json({ error: "Le nom est requis" });

    const { data, error } = await supabase
      .from("coachs")
      .insert({
        id:        crypto.randomUUID(),
        nom:       nom.trim(),
        prenom:    (prenom || "").trim() || null,
        grade:     grade    || "Coach",
        photo_url: photo_url || null,
        actif:     true,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Créer un coach + accès auth + mail de bienvenue ─────────
router.post("/", authenticateAdmin, async (req, res) => {
  try {
    const {
      photo_url, nom, prenom, genre, date_naissance, nationalite,
      email, telephone, telephone2, adresse, ville,
      grade, specialites, niveaux_enseignes, experience_annees,
      date_embauche, type_contrat, taux_horaire,
      certifications, langues, bio, linkedin,
      cv_url, statut,
    } = req.body;

    if (!nom || !prenom || !email) {
      return res.status(400).json({ error: "nom, prenom et email sont obligatoires" });
    }

    // 1. Générer un mot de passe temporaire
    const mdpTemp = "BET@" + Math.random().toString(36).slice(2, 8).toUpperCase() + "!";

    // 2. Créer le compte Supabase Auth avec le rôle "coach"
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password: mdpTemp,
      email_confirm: true,
      app_metadata: { role: "coach", actif: true },
      user_metadata:  { nom: nom.trim(), prenom: prenom.trim(), telephone: telephone || null },
    });

    if (authError) {
      console.error("❌ Création auth coach :", authError);
      // Si l'email existe déjà dans Supabase Auth
      if (authError.message?.includes("already") || authError.status === 422) {
        return res.status(409).json({ error: "Un compte avec cet email existe déjà" });
      }
      return res.status(400).json({ error: authError.message });
    }

    const coachId = authData.user.id;

    // 3. Insérer dans la table utilisateurs (pour la connexion au dashboard)
    await supabase.from("utilisateurs").insert({
      id:           coachId,
      email:        email.trim(),
      nom:          nom.trim(),
      prenom:       prenom.trim(),
      telephone:    telephone || null,
      role:         "coach",
      scope:        ["national"],
      actif:        true,
      mdp_temporaire: true,
      mdp_initial:  mdpTemp,
      cree_par_id:  req.profil.id,
    });

    // 4. Insérer le profil complet dans la table coachs
    const { data: coachData, error: coachError } = await supabase.from("coachs").insert({
      id:                 coachId,        // même ID que Supabase Auth
      photo_url:          photo_url        || null,
      nom:                nom.trim(),
      prenom:             prenom.trim(),
      genre:              genre            || null,
      date_naissance:     date_naissance   || null,
      nationalite:        nationalite      || null,
      email:              email.trim(),
      telephone:          telephone        || null,
      telephone2:         telephone2       || null,
      adresse:            adresse          || null,
      ville:              ville            || null,
      grade:              grade            || "Coach",
      specialites:        specialites      || [],
      niveaux_enseignes:  niveaux_enseignes|| [],
      experience_annees:  experience_annees|| 0,
      date_embauche:      date_embauche    || null,
      type_contrat:       type_contrat     || "Freelance",
      taux_horaire:       taux_horaire     || null,
      certifications:     certifications   || [],
      langues:            langues          || ["Français","Anglais"],
      bio:                bio              || null,
      linkedin:           linkedin         || null,
      cv_url:             cv_url           || null,
      statut:             statut           || "actif",
      evaluation_moyenne: 0,
      heures_effectuees:  0,
      heures_planifiees:  0,
    }).select().single();

    if (coachError) {
      // Rollback : supprimer le compte auth si l'insertion profil échoue
      await supabase.auth.admin.deleteUser(coachId);
      await supabase.from("utilisateurs").delete().eq("id", coachId);
      console.error("Erreur insertion coach :", coachError);
      return res.status(500).json({ error: coachError.message });
    }

    // 5. Audit
    await supabase.from("audit_admin").insert({
      acteur_id:  req.profil.id,
      acteur_nom: `${req.profil.prenom} ${req.profil.nom}`,
      action:     "COACH_CREE",
      cible_id:   coachId,
      detail:     `Coach créé : ${prenom} ${nom} (${email})`,
      statut:     "success",
    }).catch(() => {});

    // 6. Envoyer l'email de bienvenue (non-bloquant)
    let emailSent = false;
    try {
      await sendCoachWelcomeEmail({ prenom: prenom.trim(), nom: nom.trim(), email: email.trim(), mdpTemp });
      emailSent = true;
    } catch (mailErr) {
      console.error("⚠️  Email non envoyé :", mailErr.message);
    }

    res.status(201).json({
      message: "Coach créé",
      coach:   coachData,
      acces: {
        email:      email.trim(),
        mdp_temp:   mdpTemp,
        email_sent: emailSent,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Modifier un coach ───────────────────────────────────────
router.patch("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.id;
    delete updates.created_at;
    delete updates.statut; // colonne inexistante, remplacée par actif

    // Convertit statut → actif si envoyé
    if (req.body.statut !== undefined) {
      updates.actif = req.body.statut === "actif";
    }

    const { error } = await supabase
      .from("coachs")
      .update(updates)
      .eq("id", id);

    if (error) return res.status(500).json({ error: error.message });

    // Sync email/nom/prenom dans utilisateurs si modifiés
    const syncFields = {};
    if (updates.email)  syncFields.email  = updates.email;
    if (updates.nom)    syncFields.nom    = updates.nom;
    if (updates.prenom) syncFields.prenom = updates.prenom;
    if (Object.keys(syncFields).length > 0) {
      await supabase.from("utilisateurs").update(syncFields).eq("id", id).catch(() => {});
    }

    res.json({ message: "Coach mis à jour" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Supprimer un coach - DÉSACTIVÉ ───────────────────────────
// La suppression définitive supprimait le compte Auth, qui cascade-supprime
// silencieusement cours_elearning/modules_elearning (FK ON DELETE CASCADE sur
// auth.users), puis tentait de supprimer la ligne utilisateurs en avalant
// l'erreur (.catch(()=>{})) - si une écriture comptable (comptabilite_*, en
// RESTRICT) bloquait cette suppression, l'échec passait inaperçu et la ligne
// utilisateurs restait orpheline pendant que les cours avaient déjà disparu.
// Utiliser PATCH /:id/suspension (definitif:true) à la place.
router.delete("/:id", authenticateAdmin, async (req, res) => {
  res.status(410).json({
    error: "Suppression définitive désactivée - utilisez la suspension (PATCH /:id/suspension) pour retirer l'accès d'un coach sans perdre ses données (honoraires, cours, historique).",
  });
});

// ── Renvoyer les accès par email ────────────────────────────
router.post("/:id/renvoyer-acces", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: u } = await supabase
      .from("utilisateurs")
      .select("email, nom, prenom, mdp_initial")
      .eq("id", id)
      .maybeSingle();

    if (!u) return res.status(404).json({ error: "Coach introuvable" });
    if (!u.mdp_initial) return res.status(400).json({ error: "Aucun mot de passe initial enregistré" });

    await sendCoachWelcomeEmail({
      prenom: u.prenom, nom: u.nom, email: u.email, mdpTemp: u.mdp_initial
    });

    res.json({ message: "Accès renvoyé par email", email: u.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur envoi email" });
  }
});

// ── PATCH /api/coachs/presences/by-email ─────────────────────
// Le coach met à jour les présences/absences d'un apprenant par email
router.patch("/presences/by-email", authenticateCoach, async (req, res) => {
  try {
    const { email, seances_effectuees, presences, absences } = req.body;
    if (!email) return res.status(400).json({ error: "email requis" });

    const { data: asgn, error: findErr } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_nom, assistantes(email)")
      .eq("prospect_email", email)
      .eq("statut", "converti")
      .maybeSingle();

    if (findErr || !asgn) return res.status(404).json({ error: "Apprenant introuvable" });

    const { data, error } = await supabase
      .from("assignations_parcours")
      .update({
        suivi_presences: {
          seances_effectuees: Number(seances_effectuees) || 0,
          presences:          Number(presences)          || 0,
          absences:           Number(absences)           || 0,
          updated_at:         new Date().toISOString(),
        },
      })
      .eq("id", asgn.id)
      .select("id, suivi_presences")
      .single();

    if (error) throw error;

    // Notifier l'assistante en charge du dossier - sans ça, elle ne voit jamais que le coach
    // a mis à jour les présences directement sur son dossier.
    const assistanteUserId = await resolveAssistanteUserId(asgn.assistantes?.email);
    if (assistanteUserId) {
      await notifyUser(assistanteUserId, {
        type:    "presences",
        titre:   `✅ Présences mises à jour - ${asgn.prospect_nom || "un apprenant"}`,
        message: `Le coach a mis à jour les présences/absences de ${asgn.prospect_nom || "l'apprenant"}.`,
        meta:    { assignation_id: asgn.id },
        source:  "dash",
      }).catch(() => {});
    }

    res.json({ message: "Présences mises à jour", data });
  } catch (err) {
    console.error("presences/by-email error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/coachs/:id/suspension  - bloquer/débloquer un coach
══════════════════════════════════════════════════════════════ */
router.patch("/:id/suspension", authenticateAdmin, requirePermission("classes", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    const { bloque, raison, definitif, plateforme } = req.body;

    if (typeof bloque !== "boolean") return res.status(400).json({ error: "bloque (boolean) requis" });

    // `acces_bloque` sert à la fois à verrouiller temporairement l'accès d'un coach (congé
    // couvert par un remplacement - voir remplacements.js, qui ne touche jamais ce champ) ET à
    // en faire un départ définitif. Ces deux usages n'ont pas les mêmes conséquences : bloquer
    // un compte pour un congé ne doit jamais exiger de transférer ses groupes/classes (ils
    // restent siens, couverts entre-temps par délégation) - seule une suspension DÉFINITIVE
    // (`definitif:true`, coché explicitement côté front) doit l'exiger.
    // `plateforme` restreint la vérification/le transfert à un seul univers (dash → `groupes`,
    // bet-elearning → `classes_elearning`) - un coach qui enseigne sur les deux ne doit pas voir
    // ses classes de l'AUTRE plateforme remonter dans un flux de suspension définitive déclenché
    // depuis celle-ci : chaque plateforme gère son propre transfert, indépendamment de l'autre.
    // Sans ce paramètre (anciens appelants), on vérifie les deux, comme avant.
    let groupesActifs = [], classesActives = [];
    if (bloque) {
      const [{ data: g }, { data: c }] = await Promise.all([
        plateforme && plateforme !== "dash"
          ? Promise.resolve({ data: [] })
          : supabase.from("groupes").select("id, nom, niveau").eq("coach_id", id).neq("statut", "cloture"),
        plateforme && plateforme !== "bet-elearning"
          ? Promise.resolve({ data: [] })
          : supabase.from("classes_elearning").select("id, nom, niveau").eq("coach_id", id).neq("statut", "clos"),
      ]);
      groupesActifs  = g || [];
      classesActives = c || [];

      if (definitif && (groupesActifs.length || classesActives.length)) {
        return res.status(409).json({
          error: `Transférez d'abord les ${groupesActifs.length} groupe(s) et ${classesActives.length} classe(s) encore actifs de ce coach avant une suspension définitive.`,
          groupes_a_reaffecter: groupesActifs,
          classes_a_reaffecter: classesActives,
        });
      }
    }

    // Mettre à jour app_metadata dans Supabase Auth
    const { error: authErr } = await supabase.auth.admin.updateUserById(id, {
      app_metadata: { acces_bloque: bloque },
    });
    if (authErr) return res.status(500).json({ error: authErr.message });

    // Sync champ actif dans la table coachs
    await supabase.from("coachs").update({ actif: !bloque }).eq("id", id).then(() => {}).catch(() => {});
    await supabase.from("utilisateurs").update({ actif: !bloque }).eq("id", id).then(() => {}).catch(() => {});

    // Log audit
    req._auditLogged = true;
    logAudit({
      acteur_id:   req.user?.id || null,
      acteur_role: req.profil?.role || "admin",
      action_type: bloque ? "COACH_SUSPENDU" : "COACH_REINSTATE",
      module:      "coachs",
      entite_type: "user",
      entite_id:   id,
      detail:      bloque
        ? `Accès coach bloqué. Raison : ${raison || "non précisée"}${(groupesActifs.length||classesActives.length) ? ` - ${groupesActifs.length} groupe(s) + ${classesActives.length} classe(s) encore à réaffecter` : ""}`
        : "Accès coach rétabli",
      statut:      "success",
    }).catch(() => {});

    // Notifier le coach concerné et les PA Advisors - jusqu'ici, personne n'était jamais
    // prévenu d'une suspension/réintégration de coach (contrairement à la même action sur
    // un apprenant, qui notifie déjà correctement tout le monde).
    (async () => {
      try {
        const { data: coachUser } = await supabase.from("utilisateurs").select("nom, prenom").eq("id", id).maybeSingle();
        const nomComplet = coachUser ? `${coachUser.prenom || ""} ${coachUser.nom || ""}`.trim() : "Ce coach";
        await notifyUser(id, {
          type:    bloque ? "suspension" : "reinstatement",
          titre:   bloque ? "🔒 Accès suspendu" : "🔓 Accès rétabli",
          message: bloque
            ? `Votre accès a été suspendu.${raison ? ` Raison : ${raison}.` : ""} Contactez votre PA Advisor.`
            : "Votre accès a été rétabli.",
          meta: { coach_id: id },
          source: "dash",
        }).catch(() => {});
        const payloadEncadrement = {
          type:    bloque ? "suspension" : "reinstatement",
          titre:   bloque ? `🔒 Coach suspendu - ${nomComplet}` : `🔓 Coach réintégré - ${nomComplet}`,
          message: bloque
            ? `${nomComplet} a été suspendu(e). Raison : ${raison || "non précisée"}.${(groupesActifs.length||classesActives.length) ? ` ${groupesActifs.length} groupe(s) + ${classesActives.length} classe(s) encore à réaffecter.` : ""}`
            : `${nomComplet} a retrouvé son accès.`,
          meta: { coach_id: id },
          source: "dash",
        };
        // Le superviseur general suit tous les coachs : il tient leur cahier et leur
        // classement, et ignorait jusqu'ici qu'un coach avait ete suspendu.
        await notifyRole(["pedagogical_advisor", "admin_pa_advisor", ...ROLES_SUPERVISION_GLOBALE], payloadEncadrement).catch(() => {});
        // Les deputies, eux, seulement s'ils suivent CE coach.
        await notifyDeputiesDuCoach(id, payloadEncadrement).catch(() => {});
      } catch (e) { console.warn("[coach suspension notif]", e.message); }
    })();

    return res.json({ ok: true, acces_bloque: bloque, groupes_a_reaffecter: groupesActifs, classes_a_reaffecter: classesActives });
  } catch (err) {
    console.error("[coach suspension]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/coachs/ma-note  - le coach connecte lit SA propre note
   ──────────────────────────────────────────────────────────────
   Route distincte de /classement, qui est reservee aux admins et renverrait les notes
   de TOUS les coachs. Ici un coach ne peut lire que la sienne : l'identifiant n'est pas
   un parametre, il vient du jeton.

   La moyenne porte sur les OBSERVATIONS - evaluations du conseiller pedagogique et
   rapports des deputy superviseurs. Les appreciations laissees par les apprenants n'y
   entrent pas : decision explicite, elles ne sont pas comptabilisees, et le coach ne
   doit de toute facon jamais les voir.

   La formule est celle de /classement, a l'identique : une note affichee au coach qui
   differerait de celle que lit son superviseur serait pire que pas de note du tout.
══════════════════════════════════════════════════════════════ */
router.get("/ma-note", authenticateAdmin, async (req, res) => {
  try {
    if (req.role !== "coach") {
      return res.status(403).json({ error: "Route reservee aux coachs" });
    }
    const moi = req.user.id;

    const [{ data: evals }, { data: rapports }] = await Promise.all([
      supabase.from("evaluations_coachs")
        .select("note_finale, ponctualite, qualite_pedagogique, satisfaction_apprenants, respect_programme, communication, periode, date_evaluation")
        .eq("coach_id", moi).order("date_evaluation", { ascending: false }),
      supabase.from("rapports_observation")
        .select("note_globale, date_observation")
        .eq("coach_id", moi).order("date_observation", { ascending: false }),
    ]);

    const notes = [];
    let nbTotal = 0;

    (evals || []).forEach(e => {
      nbTotal += 1;
      let note = parseFloat(e.note_finale);
      // Repli sur les criteres : certaines evaluations anciennes n'ont pas de note_finale
      // calculee, et les ignorer donnerait au coach une moyenne differente du classement.
      if (isNaN(note) || note <= 0) {
        const criteres = [e.ponctualite, e.qualite_pedagogique, e.satisfaction_apprenants, e.respect_programme, e.communication]
          .map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
        note = criteres.length ? Math.round((criteres.reduce((s, v) => s + v, 0) / criteres.length) * 10) / 10 : null;
      }
      if (note !== null && note > 0) notes.push({ note, date: e.date_evaluation, source: "evaluation" });
    });

    (rapports || []).forEach(r => {
      nbTotal += 1;
      const note = parseFloat(r.note_globale);
      if (!isNaN(note) && note > 0) notes.push({ note, date: r.date_observation, source: "rapport" });
    });

    const moyenne = notes.length
      ? Math.round((notes.reduce((s, n) => s + n.note, 0) / notes.length) * 10) / 10
      : null;

    const hist = notes.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const tendance = hist.length >= 2
      ? (hist[hist.length - 1].note > hist[hist.length - 2].note ? "hausse"
        : hist[hist.length - 1].note < hist[hist.length - 2].note ? "baisse" : "stable")
      : "stable";

    res.json({
      moyenne,
      nb_evaluations: nbTotal,
      nb_avec_note: notes.length,
      tendance,
      // Les cinq dernieres, pour la petite barre de progression du header.
      dernieres_notes: hist.slice(-5).map(h => h.note),
    });
  } catch (err) {
    console.error("[coachs/ma-note]", err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/coachs/classement  - classement des coachs (par note moyenne)
══════════════════════════════════════════════════════════════ */
router.get("/classement", authenticateAdmin, async (req, res) => {
  try {
    // Toutes les évaluations (pas de filtre statut pour compter toutes les évals)
    const { data: evals, error: errEvals } = await supabase
      .from("evaluations_coachs")
      .select("coach_id, note_finale, ponctualite, qualite_pedagogique, satisfaction_apprenants, respect_programme, communication, periode, date_evaluation, statut")
      .order("date_evaluation", { ascending: false });
    if (errEvals) console.warn("[classement] evaluations_coachs:", errEvals.message);

    // Rapports d'observation (deputy superviseur)
    const { data: rapports, error: errRapports } = await supabase
      .from("rapports_observation")
      .select("coach_id, note_globale, date_observation")
      .order("date_observation", { ascending: false });
    if (errRapports) console.warn("[classement] rapports_observation:", errRapports.message);

    // Récupérer les infos des coachs
    const { data: coachUsers, error: errUsers } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, avatar_url, coach_info, actif")
      .eq("role", "coach");
    if (errUsers) console.error("[classement] utilisateurs:", errUsers.message);

    // Agréger les scores par coach (évaluations + rapports)
    const scoreMap = {};
    const ensureEntry = (id) => {
      if (!scoreMap[id]) scoreMap[id] = { notes: [], derniereNote: null, dernierePeriode: null, historique: [] };
    };

    (evals || []).forEach(e => {
      ensureEntry(e.coach_id);
      // Calcule la note depuis note_finale ou depuis les critères individuels
      let note = parseFloat(e.note_finale);
      if (isNaN(note) || note <= 0) {
        const criteres = [e.ponctualite, e.qualite_pedagogique, e.satisfaction_apprenants, e.respect_programme, e.communication]
          .map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
        note = criteres.length > 0 ? Math.round((criteres.reduce((s, v) => s + v, 0) / criteres.length) * 10) / 10 : null;
      }
      // Toujours compter l'éval (même sans note) pour nb_evaluations
      scoreMap[e.coach_id].nb_total = (scoreMap[e.coach_id].nb_total || 0) + 1;
      if (note !== null && note > 0) {
        scoreMap[e.coach_id].notes.push(note);
        scoreMap[e.coach_id].historique.push({ note, periode: e.periode, date: e.date_evaluation, source: "evaluation" });
        if (!scoreMap[e.coach_id].derniereNote) {
          scoreMap[e.coach_id].derniereNote    = note;
          scoreMap[e.coach_id].dernierePeriode = e.periode;
        }
      }
    });

    (rapports || []).forEach(r => {
      const note = parseFloat(r.note_globale);
      ensureEntry(r.coach_id);
      scoreMap[r.coach_id].nb_total = (scoreMap[r.coach_id].nb_total || 0) + 1;
      if (!isNaN(note) && note > 0) {
        scoreMap[r.coach_id].notes.push(note);
        scoreMap[r.coach_id].historique.push({ note, date: r.date_observation, source: "rapport" });
      }
    });

    const classement = (coachUsers || [])
      .map(c => {
        const stats   = scoreMap[c.id] || { notes: [], derniereNote: null, dernierePeriode: null, historique: [] };
        const moyenne = stats.notes.length > 0
          ? Math.round((stats.notes.reduce((s, n) => s + n, 0) / stats.notes.length) * 10) / 10
          : null;
        const hist    = stats.historique.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        const tendance = hist.length >= 2
          ? (hist[hist.length-1].note > hist[hist.length-2].note ? "hausse"
            : hist[hist.length-1].note < hist[hist.length-2].note ? "baisse" : "stable")
          : "stable";
        return {
          ...c,
          moyenne,
          nb_evaluations:  stats.nb_total || 0,
          nb_avec_note:    stats.notes.length,
          derniere_note:   stats.derniereNote,
          derniere_periode: stats.dernierePeriode,
          tendance,
          historique: stats.historique,
        };
      })
      .filter(c => c.actif)
      .sort((a, b) => {
        if (a.moyenne === null && b.moyenne === null) return 0;
        if (a.moyenne === null) return 1;
        if (b.moyenne === null) return -1;
        return b.moyenne - a.moyenne;
      });

    res.json({ classement });
  } catch (err) {
    console.error("[coachs/classement]", err);
    res.status(500).json({ error: "Erreur classement" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/coachs/rapports-transmis
   TOUS les rapports transmis au PA (vue globale)
   Doit être défini AVANT /:id pour éviter la capture du param
══════════════════════════════════════════════════════════════ */
router.get("/rapports-transmis", authenticateAdmin, async (req, res) => {
  try {
    // dash et bet-elearning partagent cette table - même dissociation par header que le
    // module Superviseur Général (cf. superviseurRoutes.js) pour que le PA Advisor de
    // bet-elearning ne voie jamais les rapports transmis côté dash, et inversement.
    const plateforme = req.headers["x-plateforme"] === "bet-elearning" ? "bet-elearning" : "dash";
    const { data, error } = await supabase
      .from("rapports_observation")
      .select(`
        id, date_observation, centre, classe,
        seance_id, groupe_id, session_live_id,
        ponctualite, preparation, pedagogie, gestion_classe,
        professionnalisme, respect_programme,
        expression_engagement, feedback_correction,
        interactivite_classe, approche_grammaticale,
        type_observation, type_lecon, internet,
        incident_technique, incident_technique_detail,
        note_globale, synthese, observations, recommandations, commentaire_superviseur,
        statut, transmis_pa_le, created_at,
        coach:coach_id(id, nom, prenom, avatar_url),
        deputy:deputy_id(id, nom, prenom, avatar_url)
      `)
      .eq("statut", "transmis_pa")
      .eq("plateforme", plateforme)
      .order("transmis_pa_le", { ascending: false });
    if (error) {
      if (error.code === "42P01") return res.json({ rapports: [] });
      throw error;
    }
    res.json({ rapports: data || [] });
  } catch (err) {
    console.error("[coachs/rapports-transmis ALL]", err);
    res.status(500).json({ error: "Erreur récupération rapports" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/coachs/:id/rapports-transmis
   Rapports Deputy transmis au PA (statut = 'transmis_pa')
   Accessible au PA (pedagogical_advisor) et superviseurs
══════════════════════════════════════════════════════════════ */
router.get("/:id/rapports-transmis", authenticateAdmin, async (req, res) => {
  try {
    const plateforme = req.headers["x-plateforme"] === "bet-elearning" ? "bet-elearning" : "dash";
    const { data, error } = await supabase
      .from("rapports_observation")
      .select(`
        id, date_observation, centre, classe,
        seance_id, groupe_id, session_live_id,
        ponctualite, preparation, pedagogie, gestion_classe,
        professionnalisme, respect_programme,
        expression_engagement, feedback_correction,
        interactivite_classe, approche_grammaticale,
        type_observation, type_lecon, internet,
        incident_technique, incident_technique_detail,
        note_globale, synthese, observations, recommandations, commentaire_superviseur,
        statut, transmis_pa_le, created_at,
        deputy:deputy_id(id, nom, prenom, avatar_url)
      `)
      .eq("coach_id", req.params.id)
      .eq("statut", "transmis_pa")
      .eq("plateforme", plateforme)
      .order("date_observation", { ascending: false });
    if (error) {
      if (error.code === "42P01") return res.json({ rapports: [] });
      throw error;
    }
    res.json({ rapports: data || [] });
  } catch (err) {
    console.error("[coachs/rapports-transmis]", err);
    res.status(500).json({ error: "Erreur récupération rapports" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/coachs/:id/evaluations  - historique évals d'un coach
   POST /api/coachs/:id/evaluations  - créer une évaluation
══════════════════════════════════════════════════════════════ */
router.get("/:id/evaluations", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("evaluations_coachs")
      .select("*")
      .eq("coach_id", req.params.id)
      .order("date_evaluation", { ascending: false });
    if (error) throw error;
    res.json({ evaluations: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération évaluations" });
  }
});

router.post("/:id/evaluations", authenticateAdmin, async (req, res) => {
  try {
    const { periode, ponctualite, qualite_pedagogique, satisfaction_apprenants, respect_programme, communication, rapport, points_forts, axes_amelioration, statut } = req.body;
    if (!periode) return res.status(400).json({ error: "La période est requise" });

    // Calcul note finale : moyenne simple des critères renseignés
    const criteres = [ponctualite, qualite_pedagogique, satisfaction_apprenants, respect_programme, communication].filter(v => v != null);
    const note_finale = criteres.length > 0 ? Math.round((criteres.reduce((s, v) => s + v, 0) / criteres.length) * 10) / 10 : null;

    // dash et bet-elearning partagent cette table ET le même rôle DB - on tague l'origine via
    // un header explicite (le rôle seul ne distingue pas la plateforme, cf. superviseurRoutes.js).
    const plateforme = req.headers["x-plateforme"] === "bet-elearning" ? "bet-elearning" : "dash";

    const { data, error } = await supabase.from("evaluations_coachs").insert({
      coach_id: req.params.id,
      evaluateur_id:  req.profil?.id,
      evaluateur_nom: `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim(),
      periode, ponctualite, qualite_pedagogique, satisfaction_apprenants, respect_programme, communication,
      note_finale, rapport, points_forts, axes_amelioration,
      statut: statut || "validée",
      plateforme,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ evaluation: data });
  } catch (err) {
    console.error("[coachs/evaluations POST]", err);
    res.status(500).json({ error: "Erreur création évaluation" });
  }
});

// ══════════════════════════════════════════════════════════════
// SESSIONS LIVE
// ══════════════════════════════════════════════════════════════

// GET - admin : toutes les sessions-live avec filtrage mois/annee pour honoraires PA
router.get("/sessions-live/admin-all", authenticateAdmin, async (req, res) => {
  try {
    const { mois, annee, coach_id, groupe_id } = req.query;
    let q = supabase
      .from("sessions_live")
      .select("id, coach_id, groupe_id, date, heure, heure_fin, statut, duree, titre, plateforme, demarree_at, terminee_at, duree_reelle_s, groupes(nom, niveau, type_cours)")
      .neq("is_corbeille", true)
      .order("date", { ascending: false });
    if (coach_id)  q = q.eq("coach_id", coach_id);
    if (groupe_id) q = q.eq("groupe_id", groupe_id);
    if (mois && annee) {
      const debut = `${annee}-${String(mois).padStart(2,"0")}-01`;
      const fin   = new Date(Number(annee), Number(mois), 0).toISOString().slice(0,10);
      q = q.gte("date", debut).lte("date", fin);
    }
    const { data, error } = await q;
    if (error) throw error;

    // Agréger par coach
    const byCoach = {};
    (data || []).forEach(s => {
      const cid = s.coach_id;
      if (!cid) return;
      if (!byCoach[cid]) byCoach[cid] = { coach_id: cid, nb_seances: 0, groupes: {}, seances: [] };
      byCoach[cid].nb_seances++;
      byCoach[cid].seances.push({
        id:         s.id,
        date:       s.date,
        statut:     s.statut,
        duree:      s.duree,
        titre:      s.titre,
        groupe_id:  s.groupe_id,
        groupe_nom: s.groupes?.nom || "-",
        // Même oubli que sur la route superviseur : les champs étaient lus mais perdus à la
        // reprojection. Les transmettre ici évite qu'un écran branché plus tard sur cette
        // route reparte d'un « non relevé » alors que la donnée existe.
        demarree_at:    s.demarree_at ?? null,
        terminee_at:    s.terminee_at ?? null,
        duree_reelle_s: s.duree_reelle_s ?? null,
      });
      if (s.groupe_id) {
        const gid = s.groupe_id;
        if (!byCoach[cid].groupes[gid]) {
          byCoach[cid].groupes[gid] = {
            groupe_id: gid,
            nom:        s.groupes?.nom       || "-",
            niveau:     s.groupes?.niveau    || null,
            type_cours: s.groupes?.type_cours|| null,
            nb_seances: 0,
          };
        }
        byCoach[cid].groupes[gid].nb_seances++;
      }
    });
    const honoraires = Object.values(byCoach)
      .map(h => ({ ...h, groupes: Object.values(h.groupes).sort((a,b)=>b.nb_seances-a.nb_seances) }))
      .sort((a,b) => b.nb_seances - a.nb_seances);
    res.json({ honoraires, total: (data||[]).length });
  } catch (err) {
    console.error("[sessions-live/admin-all]", err.message);
    res.status(500).json({ error: "Erreur récupération sessions" });
  }
});

// GET - superviseur/deputy : liste brute (non agrégée) de toutes les sessions,
// pour l'onglet "Plannings" (filtrage par statut/date/coach/groupe).
const ROLES_SUP_PLANNINGS = ["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur", "super_admin"];
router.get("/sessions-live/superviseur", authenticateAdmin, async (req, res) => {
  try {
    if (!ROLES_SUP_PLANNINGS.includes(req.role)) {
      return res.status(403).json({ error: "Accès réservé aux superviseurs" });
    }
    const { statut, date_debut, date_fin, coach_id, groupe_id } = req.query;
    let q = supabase
      .from("sessions_live")
      .select("id, titre, coach_id, groupe_id, seance_id, plateforme, lien, notes, date, heure, heure_fin, duree, statut, demarree_at, terminee_at, duree_reelle_s, groupes(nom, niveau, type_cours)")
      .neq("is_corbeille", true)
      .order("date", { ascending: false })
      .order("heure", { ascending: false });
    if (statut)     q = q.eq("statut", statut);
    if (coach_id)   q = q.eq("coach_id", coach_id);
    if (groupe_id)  q = q.eq("groupe_id", groupe_id);
    if (date_debut) q = q.gte("date", date_debut);
    if (date_fin)   q = q.lte("date", date_fin);
    const { data, error } = await q;
    if (error) throw error;

    // Pas de FK reconnue par PostgREST entre sessions_live.coach_id et utilisateurs
    // (coach_id référence auth.users) - on résout les noms via une requête séparée.
    const coachIds = [...new Set((data || []).map(s => s.coach_id).filter(Boolean))];
    const coachNoms = {};
    if (coachIds.length) {
      const { data: coachsData } = await supabase
        .from("utilisateurs").select("id, nom, prenom").in("id", coachIds);
      (coachsData || []).forEach(c => { coachNoms[c.id] = `${c.prenom || ""} ${c.nom || ""}`.trim(); });
    }

    const sessions = (data || []).map(s => ({
      id: s.id,
      titre: s.titre,
      coach_id: s.coach_id,
      coach_nom: coachNoms[s.coach_id] || "-",
      groupe_id: s.groupe_id,
      groupe_nom: s.groupes?.nom || "-",
      groupe_niveau: s.groupes?.niveau || null,
      seance_id: s.seance_id,
      plateforme: s.plateforme,
      lien: s.lien,
      notes: s.notes,
      date: s.date,
      heure: s.heure,
      heure_fin: s.heure_fin,
      duree: s.duree,
      statut: s.statut,
      // Traçabilité : ces trois champs étaient bien lus en base mais perdus ICI, à la
      // reprojection. Le superviseur voyait donc « aucun démarrage enregistré » sur une
      // séance dont la durée réelle existait pourtant - c'est lui, précisément, qui contrôle
      // qu'un cours a été donné.
      demarree_at: s.demarree_at ?? null,
      terminee_at: s.terminee_at ?? null,
      duree_reelle_s: s.duree_reelle_s ?? null,
    }));
    res.json({ sessions, total: sessions.length });
  } catch (err) {
    console.error("[sessions-live/superviseur]", err.message);
    res.status(500).json({ error: "Erreur récupération plannings" });
  }
});

// GET - corbeille sessions (coach_token OU admin_token)
router.get("/sessions-live/corbeille", authenticateAdmin, async (req, res) => {
  try {
    const coachId = req.profil?.id;
    if (!coachId) return res.status(401).json({ error: "Coach non identifié" });
    const { data, error } = await supabase
      .from("sessions_live")
      .select("*, groupes(nom, niveau, filiere)")
      .eq("coach_id", coachId)
      .eq("is_corbeille", true)
      .order("date", { ascending: false });
    if (error) throw error;
    res.json({ sessions: data || [] });
  } catch (err) {
    console.error("[sessions-live corbeille GET]", err);
    res.status(500).json({ error: "Erreur récupération corbeille" });
  }
});

// GET - coach: ses propres sessions (hors corbeille)
router.get("/sessions-live", authenticateCoach, async (req, res) => {
  try {
    // Élargissement borné aux séances précisément déléguées (pas au groupe entier) - un
    // remplacement porte sur une ou plusieurs séances pour une cause donnée, jamais sur "toute
    // la classe" : sans ce filtre par seance_id, le remplaçant verrait toutes les sessions du
    // titulaire sur le groupe concerné, y compris celles qui ne lui ont jamais été confiées.
    const [sessionIdsRecus, sessionIdsCedes] = await Promise.all([
      sessionsDeleguesA(req.coachId),
      sessionsDeleguesPar(req.coachId),
    ]);
    let q = supabase.from("sessions_live").select("*").neq("is_corbeille", true);
    q = sessionIdsRecus.length
      ? q.or(`coach_id.eq.${req.coachId},seance_id.in.(${sessionIdsRecus.join(",")})`)
      : q.eq("coach_id", req.coachId);
    const { data, error } = await q
      .order("date", { ascending: true })
      .order("heure", { ascending: true });
    if (error) throw error;
    // Dès qu'une séance est déléguée à un remplaçant, elle doit disparaître des données du
    // titulaire - sinon les deux coachs la voient et pourraient tous les deux tenter de
    // l'animer/la clôturer (cf. constat direct : "Enfant A2 Live" restait visible chez
    // Thierry alors que Pascal en était désormais responsable).
    const visibles = sessionIdsCedes.length
      ? (data || []).filter(s => !(s.coach_id === req.coachId && sessionIdsCedes.includes(s.seance_id)))
      : (data || []);
    res.json({ sessions: visibles });
  } catch (err) {
    console.error("[sessions-live GET]", err);
    res.status(500).json({ error: "Erreur récupération sessions" });
  }
});

// GET public - apprenants: sessions à venir + terminées des 60 derniers jours
router.get("/sessions-live/upcoming", authenticateUser, async (req, res) => {
  try {
    /* BORNÉE AU PÉRIMÈTRE DU DEMANDEUR.
       Cette route répondait sans jeton et renvoyait le planning de TOUS les coachs, toutes
       classes confondues - plus de dix kilo-octets de sessions nominatives à qui la
       demandait. Le personnel garde la vue large, dont c'est le métier ; un apprenant ou
       un parent ne reçoit que les sessions de ses propres classes, filtrées ICI et non
       plus à l'écran, où il suffisait de lire la réponse réseau pour tout voir. */
    const large = estPersonnel(req.user);
    let mesGroupes = null;
    if (!large) {
      mesGroupes = await groupesDeLUtilisateur(req.user);
      // Aucun rattachement : on ne renvoie rien plutôt que tout.
      if (!mesGroupes.length) return res.json({ sessions: [] });
    }

    const today = new Date().toISOString().slice(0, 10);
    const since60 = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Mode corbeille : retourner uniquement les sessions supprimées
    if (req.query.corbeille === "true") {
      let qCorbeille = supabase
        .from("sessions_live")
        .select("*, groupes(nom, niveau, filiere)")
        .eq("is_corbeille", true)
        .order("date", { ascending: false });
      if (req.query.coach_id)  qCorbeille = qCorbeille.eq("coach_id", req.query.coach_id);
      if (req.query.groupe_id) qCorbeille = qCorbeille.eq("groupe_id", req.query.groupe_id);
    if (mesGroupes) qCorbeille = qCorbeille.in("groupe_id", mesGroupes);
      const { data, error } = await qCorbeille;
      if (error) throw error;
      return res.json({ sessions: data || [] });
    }

    // Sessions à venir non clôturées (exclure corbeille)
    let qUpcoming = supabase
      .from("sessions_live")
      .select("*, groupes(nom, niveau, filiere)")
      .neq("statut", "terminee")
      .neq("is_corbeille", true)
      .gte("date", today)
      .order("date", { ascending: true })
      .order("heure", { ascending: true });
    if (req.query.coach_id)  qUpcoming = qUpcoming.eq("coach_id", req.query.coach_id);
    if (req.query.groupe_id) qUpcoming = qUpcoming.eq("groupe_id", req.query.groupe_id);
    if (mesGroupes) qUpcoming = qUpcoming.in("groupe_id", mesGroupes);

    // Sessions terminées des 60 derniers jours (exclure corbeille)
    let qPast = supabase
      .from("sessions_live")
      .select("*, groupes(nom, niveau, filiere)")
      .eq("statut", "terminee")
      .neq("is_corbeille", true)
      .gte("date", since60)
      .order("date", { ascending: false });
    if (req.query.coach_id)  qPast = qPast.eq("coach_id", req.query.coach_id);
    if (req.query.groupe_id) qPast = qPast.eq("groupe_id", req.query.groupe_id);
    if (mesGroupes) qPast = qPast.in("groupe_id", mesGroupes);

    const [rUp, rPast] = await Promise.all([qUpcoming, qPast]);
    if (rUp.error) throw rUp.error;

    const sessions = [...(rUp.data || []), ...(rPast.data || [])];

    // Enrichir avec les titres des modules (contenu_ids)
    const allModuleIds = [...new Set(sessions.flatMap(s => s.contenu_ids || []))].filter(Boolean);
    let moduleMap = {};
    if (allModuleIds.length > 0) {
      const { data: mods } = await supabase
        .from("modules_elearning")
        .select("id, titre, cours_id")
        .in("id", allModuleIds);
      (mods || []).forEach(m => { moduleMap[m.id] = { titre: m.titre, cours_id: m.cours_id }; });
    }
    /* LE LIEN N'EST PAS SERVI AVANT L'OUVERTURE DE LA SALLE, et seulement aux apprenants
       et aux parents. Un lien Meet, Zoom ou Jitsi est public : quiconque l'a copié la
       veille entre quand il veut, quoi qu'affiche l'écran. Griser un bouton ne protège
       donc rien - c'est en ne transmettant pas l'adresse que la règle tient.
       Le personnel garde le lien en permanence : le coach prépare sa salle, et la colonne
       « Visio » du planning des assistantes en a besoin pour signaler les séances qui n'en
       ont pas. Le présentiel n'est pas concerné, il n'a pas de salle à ouvrir. */
    const MINUTES_OUVERTURE_SALLE = 10;
    const maintenantMs = Date.now();
    const salleOuverte = (s) => {
      if (!s.date || !s.heure) return true;          // horaire inconnu : on ne retient rien
      const debut = new Date(`${s.date}T${String(s.heure).slice(0, 5)}:00`).getTime();
      if (!Number.isFinite(debut)) return true;
      return maintenantMs >= debut - MINUTES_OUVERTURE_SALLE * 60 * 1000;
    };

    const enriched = sessions.map(s => ({
      ...s,
      ...(!large && !salleOuverte(s) ? { lien: null, salle_ouvre_a: s.heure } : {}),
      contenu_titres: (s.contenu_ids || []).map(id => moduleMap[id]?.titre).filter(Boolean),
    }));

    res.json({ sessions: enriched });
  } catch (err) {
    console.error("[sessions-live/upcoming GET]", err);
    res.status(500).json({ error: "Erreur récupération sessions publiques" });
  }
});

// POST - coach: créer une session
router.post("/sessions-live", authenticateCoach, async (req, res) => {
  try {
    const { titre, plateforme, lien, date, heure, heure_fin, duree, groupe_id, notes, contenu_ids } = req.body;
    console.log("[sessions-live POST] body:", req.body);
    console.log("[sessions-live POST] coachId:", req.coachId);

    if (!titre || !lien || !date || !heure) return res.status(400).json({ error: "Champs obligatoires manquants" });

    if (groupe_id) {
      const msgDelegue = await refuserSiTitulaireDelegue(req.coachId, groupe_id);
      if (msgDelegue) return res.status(403).json({ error: msgDelegue });
    }

    // Insérer directement dans sessions_live (sans seance_id tant que migration pas lancée)
    const insertPayload = {
      coach_id:  req.coachId,
      titre,
      plateforme: plateforme || "zoom",
      lien,
      date,
      heure,
      duree:     duree || 60,
      groupe_id: groupe_id || null,
      notes:     notes || null,
      // Les supports rattachés à la séance. Le champ était accepté par le PATCH mais pas
      // par la création : une session créée avec des supports les perdait aussitôt, et
      // l'apprenant comme le coach voyaient une séance sans aucun contenu associé.
      contenu_ids: Array.isArray(contenu_ids) ? contenu_ids.filter(Boolean) : [],
    };
    if (heure_fin) insertPayload.heure_fin = heure_fin;

    console.log("[sessions-live POST] insertPayload:", insertPayload);

    const { data, error } = await supabase
      .from("sessions_live")
      .insert(insertPayload)
      .select().single();

    console.log("[sessions-live POST] result:", { data, error });

    if (error) throw error;

    // Créer la séance unifiée en arrière-plan (best-effort, ne bloque pas la réponse) -
    // grade_coach/niveau renseignés ici (absents avant), car sans eux le calcul d'honoraire à
    // la clôture retombe sur les valeurs par défaut ("Vacataire", niveau vide).
    const typeCours = plateforme === "presentiel" ? "presentiel" : "en_ligne";
    (async () => {
      let gradeCoachLive = "Vacataire", niveauLive = null;
      try {
        const { data: coachData } = await supabase.from("utilisateurs").select("coach_info").eq("id", req.coachId).single();
        gradeCoachLive = coachData?.coach_info?.type_contrat || "Vacataire";
      } catch {}
      if (groupe_id) {
        try {
          const { data: grp } = await supabase.from("groupes").select("niveau").eq("id", groupe_id).maybeSingle();
          niveauLive = grp?.niveau || null;
        } catch {}
      }
      const { data: su, error: serr } = await supabase.from("seances").insert({
        circuit:    "live",
        coach_id:   req.coachId,
        groupe_id:  groupe_id || null,
        titre,
        date_seance: date,
        heure_debut: heure,
        duree_h:    Math.round(((duree || 60) / 60) * 10) / 10,
        lieu:       plateforme === "presentiel" ? null : lien,
        type_cours: typeCours,
        niveau:     niveauLive,
        grade_coach: gradeCoachLive,
        notes:      notes || null,
        statut:     "planifiee",
      }).select().single();
      if (serr) { console.error("[sessions-live POST] échec création séance unifiée liée:", serr.message); return; }
      if (su?.id) {
        const { error: eLink } = await supabase.from("sessions_live").update({ seance_id: su.id }).eq("id", data.id);
        if (eLink) console.error("[sessions-live POST] échec liaison seance_id:", eLink.message);
      }
    })().catch(e => console.error("[sessions-live POST] bridge seances:", e.message));

    res.status(201).json({ session: data });

    // Notifier les apprenants et commerciales du groupe (best-effort)
    if (groupe_id) {
      try {
        console.log(`[sessions-live NOTIF] groupe_id=${groupe_id} titre="${titre}"`);
        const { data: gas } = await supabase
          .from("groupes_apprenants")
          .select("apprenant_id, email_apprenant, note")
          .eq("groupe_id", groupe_id)
          .eq("statut", "actif");

        console.log(`[sessions-live NOTIF] ${gas?.length || 0} apprenants actifs`);

        if (gas?.length) {
          const userIds = [];
          for (const ga of gas) {
            if (ga.apprenant_id) {
              userIds.push(ga.apprenant_id);
            } else if (ga.email_apprenant) {
              const { data: u } = await supabase
                .from("utilisateurs").select("id").ilike("email", ga.email_apprenant).maybeSingle();
              if (u?.id) userIds.push(u.id);
            }
          }

          const dateLabel = new Date(date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
          const typeLabel = plateforme === "presentiel" ? "présentielle" : "en ligne";
          console.log(`[sessions-live NOTIF] userIds apprenants:`, userIds);

          if (userIds.length) {
            const notifAppr = userIds.map(uid => ({
              user_id: uid,
              type: "cours",
              titre: `📅 Nouvelle session programmée`,
              message: `Une session ${typeLabel} "${titre}" est prévue le ${dateLabel} à ${heure}.`,
              meta: { session_id: data?.id, groupe_id, date, heure, plateforme },
              lu: false,
            }));
            const { error: ne } = await supabase.from("notifications").insert(notifAppr);
            console.log(`[sessions-live NOTIF] INSERT apprenants:`, ne ? "ERREUR: "+ne.message : `OK (${notifAppr.length})`);
          }

          // Notifier le(s) parent(s) des enfants du groupe - cette route ne les notifiait
          // jamais du tout jusqu'ici (contrairement au partage de fichier et à l'ajout d'un
          // cours dans groupes.js), alors que c'est justement ici qu'est programmée la session
          // avec son lien à rejoindre.
          try {
            const notifsParents = [];
            for (const ga of gas) {
              const parentId = await resolveParentUserId(ga);
              if (parentId) {
                notifsParents.push({
                  user_id: parentId,
                  type: "cours",
                  titre: `📅 Nouvelle session programmée pour votre enfant`,
                  message: `Une session ${typeLabel} "${titre}" est prévue le ${dateLabel} à ${heure}.`,
                  meta: { session_id: data?.id, groupe_id, date, heure, plateforme },
                  lu: false,
                });
              }
            }
            if (notifsParents.length) {
              const { error: neP } = await supabase.from("notifications").insert(notifsParents);
              console.log(`[sessions-live NOTIF] INSERT parents:`, neP ? "ERREUR: "+neP.message : `OK (${notifsParents.length})`);
            }
          } catch (e) { console.warn("[sessions-live NOTIF] notif parent échouée:", e.message); }

          // Notifier la commerciale - double approche
          const commercialeIds = new Set();

          // Approche 1 : via assignations_parcours (lien CRM email → assistante)
          const emailsAll = gas.map(g => g.email_apprenant).filter(Boolean);
          for (const email of emailsAll) {
            const { data: a } = await supabase
              .from("assignations_parcours")
              .select("assistantes(email)")
              .ilike("prospect_email", email)
              .maybeSingle();
            if (!a?.assistantes) continue;
            if (a.assistantes.email) {
              const uid = await resolveAssistanteUserId(a.assistantes.email);
              if (uid) commercialeIds.add(uid);
            }
          }

          // Approche 2 : via le créateur du groupe (created_by = commercial/onboarding)
          const { data: grp } = await supabase
            .from("groupes").select("created_by").eq("id", groupe_id).maybeSingle();
          if (grp?.created_by) {
            const { data: createur } = await supabase
              .from("utilisateurs").select("id, role").eq("id", grp.created_by).maybeSingle();
            const ROLES_COMM = ["commercial", "onboarding", "assistant_elearning", "customer_care"];
            if (createur && ROLES_COMM.includes(createur.role)) {
              commercialeIds.add(createur.id);
            }
          }

          console.log(`[sessions-live NOTIF] commercialeIds:`, [...commercialeIds]);
          if (commercialeIds.size) {
            const dateLabel2 = new Date(date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
            const notifComm = [...commercialeIds].map(uid => ({
              user_id: uid,
              type: "cours",
              titre: `📅 Session programmée dans un groupe`,
              message: `Le coach a ajouté une session "${titre}" le ${dateLabel2} à ${heure} (${plateforme || "en ligne"}).`,
              meta: { session_id: data?.id, groupe_id, date, heure, plateforme },
              lu: false, source: "dash",
            }));
            const { error: ne2 } = await supabase.from("notifications").insert(notifComm);
            console.log(`[sessions-live NOTIF] INSERT commerciales:`, ne2 ? "ERREUR: "+ne2.message : "OK");
          }

          // Notifier TOUS les PA Advisors actifs (supervision globale) + l'onboarding
          // responsable du dossier si connu. pa_advisor_id sur l'assignation n'est renseigné
          // que pour un dossier de coaching privé qu'un PA a personnellement traité - il reste
          // null pour la quasi-totalité des dossiers "groupe", donc un lookup par dossier
          // laissait le PA sans aucune notification la plupart du temps. On diffuse à tout
          // le rôle à la place, comme pour l'alerte "coaching privé sans PA assigné".
          const onboardingIds = new Set();
          for (const email of emailsAll) {
            const { data: asg } = await supabase
              .from("assignations_parcours")
              .select("onboarding_id")
              .ilike("prospect_email", email)
              .maybeSingle();
            if (asg?.onboarding_id) onboardingIds.add(asg.onboarding_id);
          }
          const dateLabel3 = new Date(date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
          const payloadSuivi = {
            type: "cours",
            titre: `📅 Session programmée dans un groupe suivi`,
            message: `Le coach a ajouté une session "${titre}" le ${dateLabel3} à ${heure} (${plateforme || "en ligne"}).`,
            meta: { session_id: data?.id, groupe_id, date, heure, plateforme },
          };
          await notifyRole(["pedagogical_advisor", "admin_pa_advisor"], { ...payloadSuivi, source: "dash" });

          // Superviseur / Deputy - leur permet de vérifier que la session a bien eu lieu
          // (lien direct + suivi statut/présences dans "Observer un cours").
          await notifyRole(["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur", "super_admin"], {
            type: "cours",
            titre: `🎥 Nouvelle session à observer`,
            message: `Session "${titre}" programmée le ${dateLabel3} à ${heure}${plateforme && plateforme !== "presentiel" ? " - lien disponible" : ""}.`,
            meta: { session_id: data?.id, groupe_id, date, heure, plateforme, lien: plateforme === "presentiel" ? null : lien },
            source: "dash",
          });
          if (onboardingIds.size) {
            const notifOb = [...onboardingIds].map(uid => ({ ...payloadSuivi, user_id: uid, lu: false, source: "dash" }));
            const { error: ne3 } = await supabase.from("notifications").insert(notifOb);
            console.log(`[sessions-live NOTIF] INSERT onboarding:`, ne3 ? "ERREUR: "+ne3.message : `OK (${notifOb.length})`);
          }
        }
      } catch (notifErr) {
        console.warn("[sessions-live NOTIF] notification échouée:", notifErr.message);
      }
    }
  } catch (err) {
    console.error("[sessions-live POST] ERREUR:", err.message, err.details || "", err.hint || "");
    res.status(500).json({ error: err.message || "Erreur création session" });
  }
});

/**
 * POST - coach : reprogrammer une séance non effectuée.
 *
 * Volontairement distinct du PATCH ci-dessous, qui sert à l'animation et à la clôture :
 * reporter un cours n'est pas le modifier. C'est un acte qui se refuse (séance déjà tenue,
 * date passée), se trace (`date_seance_initiale`) et se communique (apprenants, parents,
 * assistante, onboarding).
 *
 * Le PATCH acceptait déjà `date`/`heure`, mais n'écrivait que dans `sessions_live` : la ligne
 * `seances` - celle que lisent le planning commerciale, le PA et le calcul d'honoraires -
 * restait sur l'ancienne date. Une séance déplacée portait donc deux dates contradictoires.
 * On écrit ici les deux tables.
 */
router.post("/sessions-live/:id/reprogrammer", authenticateCoach, async (req, res) => {
  try {
    const { date, heure, heure_fin, motif } = req.body || {};
    if (!date || !heure) return res.status(400).json({ error: "Nouvelle date et heure obligatoires" });

    const { data: sl, error: eSl } = await supabase
      .from("sessions_live")
      .select("id, coach_id, seance_id, groupe_id, titre, plateforme, statut, date, heure")
      .eq("id", req.params.id)
      .maybeSingle();
    if (eSl) throw eSl;
    if (!sl) return res.status(404).json({ error: "Session introuvable" });

    // Mêmes règles de délégation que le PATCH : le remplaçant à qui la séance a été confiée
    // peut la reporter, le titulaire qui l'a déléguée ne le peut plus.
    if (sl.coach_id !== req.coachId) {
      const delegues = await sessionsDeleguesA(req.coachId);
      if (!sl.seance_id || !delegues.includes(sl.seance_id)) {
        return res.status(403).json({ error: "Accès refusé" });
      }
    } else if (sl.seance_id) {
      const deleguees = await sessionsDeleguesPar(req.coachId);
      if (deleguees.includes(sl.seance_id)) {
        return res.status(403).json({ error: "Cette session a été déléguée à un remplaçant - vous ne pouvez plus la reprogrammer." });
      }
    }

    // On ne déplace pas ce qui a eu lieu : une séance clôturée a produit des présences et,
    // le cas échéant, un honoraire calculé sur sa date.
    if (["terminee", "en_cours"].includes(sl.statut)) {
      return res.status(409).json({ error: "Cette séance a déjà été ouverte ou clôturée - elle ne peut plus être reprogrammée." });
    }
    let seanceAvant = null;
    if (sl.seance_id) {
      // L'erreur de cette lecture était ignorée. Elle ne l'est plus : une lecture qui échoue
      // laissait `seanceAvant` à null, et le report se poursuivait sur des bases fausses.
      const { data: sa, error: eSa } = await supabase
        .from("seances")
        .select("statut, date_seance, heure_debut, heure_fin, date_seance_initiale")
        .eq("id", sl.seance_id).maybeSingle();
      if (eSa) {
        console.error("[reprogrammer] lecture séance impossible:", eSa.message);
        return res.status(500).json({ error: "Impossible de lire la séance liée - report annulé." });
      }
      seanceAvant = sa || null;
      if (["realisee", "annulee"].includes(sa?.statut)) {
        return res.status(409).json({ error: "Cette séance est clôturée - elle ne peut plus être reprogrammée." });
      }
    }

    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (date < aujourdhui) return res.status(400).json({ error: "La nouvelle date doit être aujourd'hui ou plus tard." });

    if (sl.groupe_id) {
      const msgDelegueGrp = await refuserSiTitulaireDelegue(req.coachId, sl.groupe_id);
      if (msgDelegueGrp) return res.status(403).json({ error: msgDelegueGrp });
    }

    // `seances` EN PREMIER, et son échec est bloquant.
    //
    // L'ordre inverse, avec un simple console.error, a réellement laissé « A1 soir » avec deux
    // dates contradictoires : la session au 25/09, la séance au 15/09, et un report annoncé
    // aux apprenants qui n'avait eu lieu qu'à moitié. `seances` est la table que lisent le
    // planning, le PA et le calcul d'honoraires : si elle ne peut pas être écrite, il n'y a
    // pas de report du tout, et personne ne doit être prévenu.
    if (sl.seance_id) {
      const majSeance = {
        date_seance: date,
        heure_debut: heure,
        reprogrammee_le: new Date().toISOString(),
        reprogrammee_motif: motif || null,
      };
      if (heure_fin !== undefined) majSeance.heure_fin = heure_fin || null;
      // Figée au premier report seulement : elle porte la date d'origine, pas la précédente.
      if (!seanceAvant?.date_seance_initiale) majSeance.date_seance_initiale = seanceAvant?.date_seance || sl.date;
      const { error: eSeance } = await supabase.from("seances").update(majSeance).eq("id", sl.seance_id);
      if (eSeance) {
        console.error("[reprogrammer] échec mise à jour séance unifiée:", eSeance.message);
        return res.status(500).json({
          error: "La séance n'a pas pu être déplacée dans le planning - report annulé, rien n'a été modifié.",
        });
      }
    }

    const { data: session, error: eMaj } = await supabase
      .from("sessions_live")
      .update({ date, heure, ...(heure_fin !== undefined ? { heure_fin: heure_fin || null } : {}) })
      .eq("id", sl.id)
      .select().single();
    if (eMaj) {
      // `seances` est déjà déplacée : on la remet où elle était plutôt que de laisser
      // subsister la divergence que toute cette correction vise à empêcher.
      if (sl.seance_id && seanceAvant) {
        await supabase.from("seances").update({
          date_seance: seanceAvant.date_seance,
          heure_debut: seanceAvant.heure_debut,
          heure_fin: seanceAvant.heure_fin,
          date_seance_initiale: seanceAvant.date_seance_initiale ?? null,
          reprogrammee_le: null,
          reprogrammee_motif: null,
        }).eq("id", sl.seance_id);
      }
      throw eMaj;
    }

    res.json({ ok: true, session });

    // Un cours déplacé sans prévenir personne est pire qu'un cours manqué (best-effort).
    (async () => {
      const dateLabel = new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      const ancienLabel = new Date(sl.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      // « 12:00 », pas « 12:00:00 » : la base stocke des secondes dont personne n'a l'usage
      // dans une phrase adressée à un apprenant.
      const message = `La séance "${sl.titre}" du ${ancienLabel} est reportée au ${dateLabel} à ${String(heure).slice(0, 5)}.`
        + (motif ? ` Motif : ${motif}.` : "");
      const meta = { session_id: sl.id, seance_id: sl.seance_id, groupe_id: sl.groupe_id, date, heure, ancienne_date: sl.date };

      if (sl.groupe_id) {
        const { data: gas } = await supabase
          .from("groupes_apprenants")
          .select("apprenant_id, email_apprenant, note")
          .eq("groupe_id", sl.groupe_id)
          .in("statut", ["actif", "periode_test"]);

        const destinataires = new Set();
        for (const ga of gas || []) {
          if (ga.apprenant_id) destinataires.add(ga.apprenant_id);
          else if (ga.email_apprenant) {
            const { data: u } = await supabase
              .from("utilisateurs").select("id").ilike("email", ga.email_apprenant).maybeSingle();
            if (u?.id) destinataires.add(u.id);
          }
          const parentId = await resolveParentUserId(ga);
          if (parentId) destinataires.add(parentId);
        }
        for (const uid of await staffDesClasses([sl.groupe_id])) destinataires.add(uid);

        if (destinataires.size) {
          const { error: ne } = await supabase.from("notifications").insert(
            [...destinataires].map((uid) => ({
              user_id: uid, type: "cours", titre: "📅 Séance reportée", message, meta, lu: false,
            }))
          );
          if (ne) console.warn("[reprogrammer] notifications:", ne.message);
        }
      }

      await notifyRole(
        ["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur"],
        { type: "cours", titre: "📅 Séance reportée", message, meta, source: "dash" }
      );
    })().catch((e) => console.warn("[reprogrammer] notifications échouées:", e.message));
  } catch (err) {
    console.error("[sessions-live REPROGRAMMER]", err);
    if (!res.headersSent) res.status(500).json({ error: err.message || "Erreur reprogrammation" });
  }
});

// PATCH - restaurer depuis la corbeille
router.patch("/sessions-live/:id/restore", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sessions_live")
      .update({ is_corbeille: false })
      .eq("id", req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ ok: true, session: data });
  } catch (err) {
    console.error("[sessions-live RESTORE]", err);
    res.status(500).json({ error: "Erreur restauration" });
  }
});

// PATCH - coach: modifier une session
router.patch("/sessions-live/:id", authenticateCoach, async (req, res) => {
  try {
    const { titre, plateforme, lien, date, heure, heure_fin, duree, groupe_id, notes, statut, contenu_ids, duree_reelle_s } = req.body;
    const updates = {};

    // Traçabilité : la salle affiche un chronomètre au coach, mais la clôture n'envoyait
    // que le statut - le temps réellement passé disparaissait avec la fenêtre. On horodate
    // l'ouverture et la fermeture, et on conserve la durée relevée.
    // La PREMIÈRE ouverture fait foi. Réécrire l'horodatage à chaque passage en « en_cours »
    // effaçait l'heure de début réelle dès que le coach rafraîchissait sa page et retrouvait
    // sa salle : la traçabilité affichait alors une séance commencée bien plus tard qu'en
    // réalité, ce qui est pire que pas de traçabilité du tout.
    // (renseigné plus bas, une fois la session relue - on ne peut pas savoir ici si elle
    //  porte déjà un `demarree_at`.)
    if (statut === "terminee") {
      updates.terminee_at = new Date().toISOString();
      if (Number.isFinite(Number(duree_reelle_s))) updates.duree_reelle_s = Math.max(0, Math.round(Number(duree_reelle_s)));
    }
    if (titre        !== undefined) updates.titre        = titre;
    if (plateforme   !== undefined) updates.plateforme   = plateforme;
    if (lien         !== undefined) updates.lien         = lien;
    if (date         !== undefined) updates.date         = date;
    if (heure        !== undefined) updates.heure        = heure;
    if (heure_fin    !== undefined) updates.heure_fin    = heure_fin || null;
    if (duree        !== undefined) updates.duree        = duree;
    if (groupe_id    !== undefined) updates.groupe_id    = groupe_id || null;
    if (notes        !== undefined) updates.notes        = notes;
    if (statut       !== undefined) updates.statut       = statut;
    if (contenu_ids  !== undefined) updates.contenu_ids  = contenu_ids;

    // Autoriser aussi le remplaçant sur cette séance précise (pas tout le groupe, cf. même
    // périmètre que GET /sessions-live juste au-dessus) - sinon un remplaçant qui anime
    // effectivement la session (présences, clôture) se heurte silencieusement à un update qui
    // ne matche aucune ligne (coach_id pointe toujours sur le titulaire absent).
    const { data: avant, error: eAvant } = await supabase
      .from("sessions_live").select("coach_id, seance_id, groupe_id, demarree_at").eq("id", req.params.id).maybeSingle();
    if (eAvant) throw eAvant;
    if (!avant) return res.status(404).json({ error: "Session introuvable" });
    if (avant.coach_id !== req.coachId) {
      const sessionIdsDelegues = await sessionsDeleguesA(req.coachId);
      if (!avant.seance_id || !sessionIdsDelegues.includes(avant.seance_id)) {
        return res.status(403).json({ error: "Accès refusé" });
      }
    } else if (avant.seance_id) {
      // Le titulaire ne doit plus pouvoir agir sur UNE séance précise qu'il a lui-même
      // déléguée à un remplaçant (sessionsDeleguesPar existait déjà mais n'était utilisé
      // nulle part - les deux coachs pouvaient jusqu'ici animer/clôturer la même session).
      const sessionIdsDelegues = await sessionsDeleguesPar(req.coachId);
      if (sessionIdsDelegues.includes(avant.seance_id)) {
        return res.status(403).json({ error: "Cette session a été déléguée à un remplaçant - vous ne pouvez plus la modifier tant que la délégation n'est pas clôturée." });
      }
    }

    // Le groupe entier peut aussi être délégué (pas juste cette session précise) - même
    // règle que sur les autres actions d'écriture liées à une classe.
    const groupeCible = updates.groupe_id !== undefined ? updates.groupe_id : avant.groupe_id;
    if (groupeCible) {
      const msgDelegueGrp = await refuserSiTitulaireDelegue(req.coachId, groupeCible);
      if (msgDelegueGrp) return res.status(403).json({ error: msgDelegueGrp });
    }

    // Horodatage d'ouverture : posé une seule fois, à la première mise en « en_cours ».
    if (statut === "en_cours" && !avant.demarree_at) {
      updates.demarree_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("sessions_live")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;

    // Si session terminée → clôturer la séance unifiée liée (calcul honoraire auto +
    // notifications apprenant/PA/onboarding). Appel de fonction direct - l'ancien
    // auto-appel HTTP vers "http://localhost" ne fonctionnait jamais en production
    // (déploiement serverless Vercel, aucun serveur n'écoute réellement sur ce port),
    // échouait silencieusement (.catch(()=>{})), et empêchait donc TOUTE notification
    // de fin de séance de partir en prod.
    if (statut === "terminee" && data.seance_id) {
      clotureSeance(data.seance_id, { statut: "realisee" }).catch(e =>
        console.warn("[sessions-live PATCH] clôture séance liée échouée:", e.message)
      );
    }

    // Superviseur / Deputy - notifiés au démarrage et à la clôture, pour vérifier en direct
    // ou a posteriori que le cours a bien été donné (best-effort, ne bloque pas la réponse).
    // Une réouverture de salle (le coach revient sur sa page) ne redéclenche pas l'alerte
    // « session démarrée » : le superviseur recevrait plusieurs fois le même avertissement
    // pour un seul cours, et finirait par n'en lire aucun.
    const premierDemarrage = statut === "en_cours" && !avant.demarree_at;
    if ((statut === "en_cours" && premierDemarrage) || statut === "terminee") {
      (async () => {
        try {
          const payload = statut === "en_cours"
            ? { type:"cours", titre:"🎥 Session démarrée", message:`Le coach vient d'ouvrir la salle pour "${data.titre}".`, meta:{ session_id:data.id, groupe_id:data.groupe_id, lien: data.plateforme==="presentiel" ? null : data.lien } }
            : { type:"cours", titre:"✅ Session clôturée", message:`"${data.titre}" a été marquée comme terminée par le coach - présences consultables dans "Observer un cours".`, meta:{ session_id:data.id, groupe_id:data.groupe_id, seance_id:data.seance_id } };
          await notifyRole(["superviseur", "admin_superviseur", "deputy_superviseur", "admin_deputy_superviseur"], { ...payload, source: "dash" });
        } catch (e) { console.warn("[sessions-live PATCH] notif superviseur échouée:", e.message); }
      })();

      // Commerciale responsable du groupe - jusqu'ici seule la PROGRAMMATION d'une
      // session la notifiait (POST /sessions-live) ; le démarrage et la clôture ne lui
      // parvenaient jamais, alors que l'apprenant lui les recevait déjà (cf. clotureSeance).
      // Même double résolution que POST /sessions-live : via l'assistante liée aux
      // apprenants du groupe, avec repli sur le créateur du groupe.
      if (data.groupe_id) {
        (async () => {
          try {
            // Assistante de chaque apprenant + créateur du groupe, via le service
            // partagé : l'ancienne version interrogeait la base une fois PAR apprenant,
            // et ne couvrait l'onboarding que s'il avait créé la classe lui-même.
            const commercialeIds = new Set(await staffDesClasses([data.groupe_id]));
            if (commercialeIds.size) {
              const notifComm = [...commercialeIds].map(uid => ({
                user_id: uid, type: "cours",
                titre: statut === "en_cours" ? "🎥 Session démarrée" : "✅ Session clôturée",
                message: statut === "en_cours"
                  ? `Le coach vient d'ouvrir la salle pour "${data.titre}".`
                  : `"${data.titre}" a été marquée comme terminée par le coach.`,
                meta: { session_id: data.id, groupe_id: data.groupe_id },
                lu: false, source: "dash",
              }));
              await supabase.from("notifications").insert(notifComm);
            }
          } catch (e) { console.warn("[sessions-live PATCH] notif commerciale échouée:", e.message); }
        })();

        // Apprenants du groupe - au DÉMARRAGE uniquement (la clôture les notifie déjà via
        // clotureSeance, plus haut). Sans ce bloc l'apprenant n'apprenait jamais qu'une
        // session venait de s'ouvrir, seulement qu'elle s'était terminée.
        if (statut === "en_cours") {
          (async () => {
            try {
              const { data: gasApp } = await supabase
                .from("groupes_apprenants").select("apprenant_id, email_apprenant").eq("groupe_id", data.groupe_id).eq("statut", "actif");
              const apprenantIds = new Set();
              for (const ga of gasApp || []) {
                if (ga.apprenant_id) apprenantIds.add(ga.apprenant_id);
                else if (ga.email_apprenant) {
                  const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", ga.email_apprenant).maybeSingle();
                  if (u?.id) apprenantIds.add(u.id);
                }
              }
              if (apprenantIds.size) {
                const notifsApp = [...apprenantIds].map(uid => ({
                  user_id: uid, type: "cours", lu: false,
                  titre: "🎥 Session démarrée",
                  message: `Le coach vient d'ouvrir la salle pour "${data.titre}".`,
                  meta: { session_id: data.id, groupe_id: data.groupe_id, lien: data.plateforme==="presentiel" ? null : data.lien },
                }));
                await supabase.from("notifications").insert(notifsApp);
              }
            } catch (e) { console.warn("[sessions-live PATCH] notif apprenants échouée:", e.message); }
          })();
        }
      }
    }

    res.json({ session: data });
  } catch (err) {
    console.error("[sessions-live PATCH]", err);
    res.status(500).json({ error: "Erreur mise à jour session" });
  }
});

// Mise en corbeille (soft delete) - accepte coach_token ET admin_token
router.delete("/sessions-live/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sessions_live")
      .update({ is_corbeille: true })
      .eq("id", req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ ok: true, session: data });
  } catch (err) {
    console.error("[sessions-live DELETE]", err);
    res.status(500).json({ error: "Erreur mise en corbeille" });
  }
});

// Suppression définitive depuis la corbeille
router.delete("/sessions-live/:id/permanent", authenticateAdmin, requirePermission("classes","delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("sessions_live")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[sessions-live DELETE permanent]", err);
    res.status(500).json({ error: "Erreur suppression définitive" });
  }
});


/* ══════════════════════════════════════════════════════════════
   ARCHIVE DES APPRENANTS D'UN COACH
══════════════════════════════════════════════════════════════ */

/**
 * Tous les apprenants passés par les classes d'un coach - présents ET partis.
 *
 * Le coach n'avait aucun moyen de retracer qui il a formé : la liste d'une classe montre
 * ses inscrits du jour, et un apprenant qui part en disparaît. Au bout d'un an, personne
 * ne peut dire combien il en a accompagnés, ni pourquoi les autres sont partis.
 *
 * Les PRÉSENTS sont inclus délibérément. Dix départs sur douze apprenants ou sur cent
 * vingt ne racontent pas la même histoire : sans le dénominateur, l'archive se lit comme
 * un acte d'accusation.
 *
 * LE MOTIF vit dans la colonne `note`, en JSON - `{ arret_formation: { motif, date } }` -
 * là où l'écran d'arrêt l'écrit. On le déplie ici plutôt que dans chaque écran qui lira
 * cette liste.
 */
router.get("/:id/archive-apprenants", authenticateAdmin, async (req, res) => {
  try {
    const coachId = req.params.id;
    const annee = req.query.annee ? Number(req.query.annee) : null;

    const { data: groupes, error: eG } = await supabase
      .from("groupes").select("id, nom, niveau, type_cours, date_debut, date_fin, statut")
      .eq("coach_id", coachId);
    if (eG) throw eG;
    if (!groupes?.length) return res.json({ apprenants: [], classes: [], totaux: videTotaux() });

    const { data: rattachements, error: eR } = await supabase
      .from("groupes_apprenants").select("*")
      .in("groupe_id", groupes.map(g => g.id))
      .order("date_ajout", { ascending: false });
    if (eR) throw eR;

    // Les coordonnées viennent de `utilisateurs` quand le compte existe : le rattachement
    // porte une copie qui peut dater, et un numéro périmé ne sert à personne.
    const ids = [...new Set((rattachements || []).map(r => r.apprenant_id).filter(Boolean))];
    const { data: comptes } = ids.length
      ? await supabase.from("utilisateurs").select("id, email, telephone, prenom, nom").in("id", ids)
      : { data: [] };
    const parId = Object.fromEntries((comptes || []).map(u => [u.id, u]));
    const parGroupe = Object.fromEntries(groupes.map(g => [g.id, g]));

    /** Le motif du départ, déplié depuis le JSON de `note`. */
    const motifDe = (r) => {
      try {
        const n = typeof r.note === "string" ? JSON.parse(r.note) : r.note;
        const a = n?.arret_formation;
        if (a?.motif) return { motif: a.motif, detail: a.detail || null, par: a.par || null };
        /* UN TRANSFERT N'EST PAS UN ARRÊT. L'apprenant n'a pas quitté BET : il a changé de
           classe, souvent parce que le niveau ne lui convenait pas. Le classeur affichait
           « A arrêté · motif non renseigné », ce qui dit exactement le contraire de ce qui
           s'est passé et fausse le taux de rétention du coach. */
        const d = n?.depart;
        if (d?.motif) {
          /* LE CHANGEMENT DE NIVEAU DANS LE DÉTAIL. « Transféré vers Anglais B2 » laisse croire
             à un simple changement d'horaire ; « C1 → B2 » dit que le niveau ne convenait pas,
             ce qui est presque toujours la vraie raison du départ. On ne l'affiche que s'il a
             réellement changé - « C1 → C1 » serait du bruit. */
          const bougé = d.niveau_avant && d.niveau_apres
            && String(d.niveau_avant).toUpperCase() !== String(d.niveau_apres).toUpperCase();
          const morceaux = [
            d.vers ? `Transféré vers « ${d.vers} »` : null,
            bougé ? `niveau ${String(d.niveau_avant).toUpperCase()} → ${String(d.niveau_apres).toUpperCase()}` : null,
          ].filter(Boolean);
          return {
            motif:  d.motif,
            detail: morceaux.length ? morceaux.join(" · ") : null,
            par:    d.par || null,
            transfert: d.type === "transfert",
            niveau_avant: d.niveau_avant || null,
            niveau_apres: d.niveau_apres || null,
          };
        }
      } catch { /* `note` peut contenir du texte libre : ce n'est pas une erreur */ }
      // Repli sur les colonnes de pause, renseignées par l'onglet Archive.
      return { motif: r.motif_pause || null, detail: r.detail_motif || null, par: null };
    };

    /**
     * Les périodes de présence d'un rattachement, et ce qu'elles racontent.
     *
     * Un apprenant peut arrêter puis revenir. Sans cette lecture, la reprise remettait
     * `statut = actif` et `date_retrait = null`, et il ressortait de l'archive comme
     * quelqu'un qui n'était jamais parti - avec une ancienneté gonflée de tous les mois
     * où il n'était pas là. La feuille ON BREAK perdait justement la pause qu'elle existe
     * pour consigner.
     *
     * `periodes` est écrit par la route d'arrêt/reprise. Les rattachements antérieurs à ce
     * mécanisme n'en ont pas : on retombe alors sur l'unique fenêtre des colonnes, ce qui
     * reproduit exactement l'ancien calcul.
     */
    const periodesDe = (r) => {
      let p = null;
      try {
        const n = typeof r.note === "string" ? JSON.parse(r.note) : r.note;
        if (Array.isArray(n?.periodes) && n.periodes.length) p = n.periodes;
      } catch { /* `note` peut contenir du texte libre */ }
      const brut = p || [{ debut: r.date_ajout, fin: r.date_retrait }];
      return brut
        .filter(x => x?.debut)
        .sort((a, b) => new Date(a.debut) - new Date(b.debut));
    };

    /** Le nombre de jours réellement suivis, trous d'absence exclus. */
    const joursSuivis = (periodes) => {
      const now = Date.now();
      return periodes.reduce((total, p) => {
        const d = new Date(p.debut).getTime();
        const f = p.fin ? new Date(p.fin).getTime() : now;
        if (Number.isNaN(d) || Number.isNaN(f) || f < d) return total;
        return total + (f - d);
      }, 0) / 86400000;
    };

    /** « 5 mois et 17 jours » à partir d'un nombre de jours. */
    const dureeDepuisJours = (jours) => {
      if (jours == null || jours < 0) return null;
      const mois = Math.floor(jours / 30.44);
      const reste = Math.round(jours - mois * 30.44);
      return { mois, jours: reste, texte: `${mois} mois et ${reste} jour${reste > 1 ? "s" : ""}` };
    };

    /** « 5 mois et 17 jours » - la forme exacte du classeur des coachs. */
    const dureeLisible = (debut, fin) => {
      if (!debut) return null;
      const d = new Date(debut), f = fin ? new Date(fin) : new Date();
      if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime()) || f < d) return null;
      let mois = (f.getFullYear() - d.getFullYear()) * 12 + (f.getMonth() - d.getMonth());
      let jours = f.getDate() - d.getDate();
      if (jours < 0) { mois -= 1; const prec = new Date(f.getFullYear(), f.getMonth(), 0).getDate(); jours += prec; }
      return { mois: Math.max(0, mois), jours: Math.max(0, jours),
        texte: `${Math.max(0, mois)} mois et ${Math.max(0, jours)} jour${jours > 1 ? "s" : ""}` };
    };

    const apprenants = (rattachements || [])
      .filter(r => {
        if (!annee) return true;
        // Présent dans l'année si sa période la CROISE - pas seulement s'il est arrivé
        // dedans : quelqu'un inscrit en décembre et parti en mars appartient aux deux.
        const debut = r.date_ajout ? new Date(r.date_ajout).getFullYear() : null;
        const fin = r.date_retrait ? new Date(r.date_retrait).getFullYear() : new Date().getFullYear();
        return debut !== null && debut <= annee && fin >= annee;
      })
      .map(r => {
        const g = parGroupe[r.groupe_id] || {};
        const u = parId[r.apprenant_id] || {};
        const m = motifDe(r);
        const parti = r.statut !== "actif";

        const periodes = periodesDe(r);
        /* Les pauses = les périodes FERMÉES suivies d'une autre. Une période fermée en
           dernier n'est pas une pause : c'est un départ, et il est déjà porté par `parti`. */
        const pauses = periodes.slice(0, -1).filter(p => p.fin).map((p, i) => ({
          du: p.fin, au: periodes[i + 1]?.debut || null, motif: p.motif || null, par: p.par || null,
        }));
        const revenu = !parti && pauses.length > 0;
        const derniere = pauses[pauses.length - 1] || null;

        /* La durée COMPTE LE TEMPS RÉELLEMENT SUIVI. Sur un rattachement sans pause, le
           calcul par périodes et l'ancien donnent le même résultat ; dès qu'il y a un trou,
           l'ancien facturait à l'apprenant des mois où il n'était pas là. */
        const duree = pauses.length
          ? dureeDepuisJours(joursSuivis(periodes))
          : dureeLisible(r.date_ajout, r.date_retrait);

        return {
          id: r.id,
          nom: [r.prenom_apprenant, r.nom_apprenant].filter(Boolean).join(" ").trim()
            || [u.prenom, u.nom].filter(Boolean).join(" ").trim() || "-",
          email: u.email || r.email_apprenant || null,
          telephone: u.telephone || r.telephone || null,
          classe: g.nom || "-",
          classe_id: r.groupe_id,
          niveau: r.niveau || g.niveau || null,
          type_cours: g.type_cours || null,
          date_arrivee: r.date_ajout || null,
          // Pour un apprenant REVENU, la date de sortie de sa dernière pause : sans elle,
          // la colonne « Took a break on » reste vide alors qu'il a bien fait une pause.
          date_sortie: r.date_retrait || derniere?.du || null,
          duree_texte: duree?.texte || null,
          duree_mois: duree?.mois ?? null,
          statut: r.statut,
          parti,
          /* TRANSFÉRÉ ≠ A ARRÊTÉ. L'un a changé de classe, l'autre a quitté BET. Les confondre
             donnait « A arrêté » à un apprenant toujours en formation, et faisait baisser à
             tort le taux de rétention du coach. L'écran et l'export distinguent désormais. */
          transfere: r.statut === "transfere" || !!m.transfert,
          revenu,
          // La date de reprise et les pauses antérieures, pour l'écran et pour l'export.
          date_reprise: revenu ? derniere?.au || null : null,
          pauses,
          nb_pauses: pauses.length,
          // Le motif de l'arrêt en cours, ou à défaut celui de la dernière pause - que la
          // reprise effaçait jusqu'ici.
          motif: m.motif || derniere?.motif || null,
          detail_motif: m.detail,
          // Exposés à part du détail : l'export Excel en fait sa propre colonne.
          niveau_avant: m.niveau_avant || null,
          niveau_apres: m.niveau_apres || null,
          recommandations: r.suivi_notes || null,
        };
      });

    /* UN TRANSFÉRÉ N'A PAS ARRÊTÉ. Il a changé de classe et suit toujours ses cours - le
       compter parmi les départs faisait baisser la rétention du coach pour un apprenant que
       BET n'a jamais perdu, et sur un motif qui relevait souvent d'un mauvais niveau de départ.
       Il reste visible dans la liste, avec son propre statut : c'est le comptage qui change,
       pas la traçabilité. */
    const partis     = apprenants.filter(a => a.parti && !a.transfere);
    const transferes = apprenants.filter(a => a.transfere);
    res.json({
      apprenants,
      classes: groupes.map(g => ({ id: g.id, nom: g.nom, niveau: g.niveau })),
      totaux: {
        total: apprenants.length,
        actifs: apprenants.length - partis.length - transferes.length,
        partis: partis.length,
        transferes: transferes.length,
        // Le taux n'a de sens qu'avec des apprenants : 0/0 n'est pas 0 %.
        taux_retention: apprenants.length
          ? Math.round(((apprenants.length - partis.length) / apprenants.length) * 100)
          : null,
        duree_moyenne_mois: apprenants.filter(a => a.duree_mois != null).length
          ? Math.round(apprenants.reduce((s, a) => s + (a.duree_mois || 0), 0)
            / apprenants.filter(a => a.duree_mois != null).length)
          : null,
      },
    });
  } catch (err) {
    console.error("[coachs/archive-apprenants]", err.message || err);
    res.status(500).json({ error: "Lecture de l'archive impossible" });
  }
});

const videTotaux = () => ({ total: 0, actifs: 0, partis: 0, taux_retention: null, duree_moyenne_mois: null });

export default router;
