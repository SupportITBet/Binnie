import express from "express";
import { createClient } from "@supabase/supabase-js";
import supabase, { supabaseAuth } from "../config/supabase.js";
import {
  authenticateAdmin,
  authenticateUser,
  requireSuperAdmin,
  requirePermission,
  resolvePermissions,
} from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";
import { PLATEFORME_PAR_ROLE } from "../middlewares/plateformeParModule.js";
import { sendCoachWelcomeEmail, sendStaffWelcomeEmail, sendAccessRegeneratedEmail } from "../services/emailService.js";
import { authLimiter } from "../middlewares/rateLimiters.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// Client utilisateur temporaire pour les opérations MFA (nécessite la session de l'utilisateur)
const getUserClient = async (accessToken, refreshToken) => {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return client;
};

const router = express.Router();

/* ══════════════════════════════════════════════════════════════
   PERMISSIONS PAR DÉFAUT PAR TYPE DE PROFIL
   Le super_admin peut les ajuster au moment de la création.
══════════════════════════════════════════════════════════════ */
const PERMISSIONS_DEFAUT = {
  super_admin: Object.fromEntries(
    ["dashboard","users","roles","cours","examens","finances","rh",
     "commercial","audit","plateforme","coachs","apprenants","support"]
      .map(m => [m, { create:true, read:true, update:true, delete:true, manage:true }])
  ),
  admin_pedagogique: Object.fromEntries(
    ["dashboard","cours","examens","coachs","apprenants"]
      .map(m => [m, { create:true, read:true, update:true, delete:false, manage:false }])
  ),
  admin_financier: Object.fromEntries(
    ["dashboard","finances","paiements","ca"]
      .map(m => [m, { create:true, read:true, update:true, delete:false, manage:false }])
  ),
  admin_rh: Object.fromEntries(
    ["dashboard","coachs","rh","absences"]
      .map(m => [m, { create:true, read:true, update:true, delete:false, manage:true }])
  ),
  admin_commercial: Object.fromEntries(
    ["dashboard","clients","offres","commercial"]
      .map(m => [m, { create:true, read:true, update:true, delete:false, manage:false }])
  ),
  responsable_centre: Object.fromEntries(
    ["dashboard","cours","examens","coachs","apprenants","planning","presences"]
      .map(m => [m, { create:true, read:true, update:true, delete:false, manage:true }])
  ),
  observateur: Object.fromEntries(
    ["dashboard","cours","apprenants"]
      .map(m => [m, { create:false, read:true, update:false, delete:false, manage:false }])
  ),
};

const LABELS_TYPE = {
  super_admin:        "Direction Générale",
  admin_pedagogique:  "Administration Pédagogique",
  admin_financier:    "Administration Financière",
  admin_rh:           "Ressources Humaines",
  admin_commercial:   "Administration Commerciale",
  responsable_centre: "Responsable de Centre",
  observateur:        "Observateur",
};


/* ══════════════════════════════════════════════════════════════
   POST /api/admin/login
   Login spécifique aux comptes admin du dashboard.
   Vérifie que le compte a bien un rôle admin dans app_metadata.
══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   POST /api/admin/reset-password
   Envoie un email de réinitialisation du mot de passe.
   Vérifie que l'email appartient bien à un compte admin.
══════════════════════════════════════════════════════════════ */
router.post("/reset-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requis" });

    const normalizedEmail = email.toLowerCase().trim();

    // Vérifier que l'email appartient à un compte admin (ne pas révéler si inexistant)
    const { data: profil } = await supabase
      .from("profils_admin")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    if (profil) {
      const DASH_URL = process.env.DASHBOARD_URL || "https://dashboard.bet-academy.ci";
      await supabaseAuth.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${DASH_URL}/reset-password`,
      });
    }

    // Réponse identique que l'email existe ou non (sécurité)
    res.json({ message: "Si cet email est enregistré, un lien de réinitialisation a été envoyé." });
  } catch (err) {
    console.error("reset-password error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/admin/login
   Login spécifique aux comptes admin du dashboard.
   Vérifie que le compte a bien un rôle admin dans app_metadata.
══════════════════════════════════════════════════════════════ */
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    // Cette route est appelée par les deux frontends (dash ET bet-elearning) avec la même URL
    // - sans ce champ envoyé par le client, impossible pour l'audit log de savoir qui s'est
    // connecté depuis où, et tous les logs de connexion finissent visibles des deux côtés.
    const plateformeAppelante = req.body.plateforme === "dash" ? "dash" : "bet-elearning";
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    // 1. Authentifier via Supabase Auth
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Supabase auth error:", error.message);
      logAudit({
        acteur_email: email,
        plateforme:   plateformeAppelante,
        action_type:  "LOGIN_FAILED",
        module:       "auth",
        detail:       `Échec de connexion admin pour ${email}`,
        ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
        user_agent:   req.headers["user-agent"] || null,
        statut:       "danger",
      }).catch(() => {});
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const user = data.user;

    // 2. Chercher le profil dans `utilisateurs` (nouveaux comptes)
    //    puis fallback sur `profils_admin` (super_admin historique)
    let profil = null;
    let source = null;

    const { data: u } = await supabase
      .from("utilisateurs")
      .select("*")
      .eq("id", user.id)
      .single();

    if (u) {
      profil = u;
      source = "utilisateurs";
    } else {
      const { data: pa } = await supabase
        .from("profils_admin")
        .select("*")
        .eq("id", user.id)
        .single();
      if (pa) {
        profil = { ...pa, role: pa.profil_type };
        source = "profils_admin";
      }
    }

    // ── Auto-réparation : si le profil n'est pas en base mais que
    //    app_metadata.role est valide, on le recrée silencieusement.
    //    Cela évite le 403 lorsque la table utilisateurs est réinitialisée.
    if (!profil) {
      const roleFromAuth = user.app_metadata?.role;
      const ROLES_VALIDES = [
        "super_admin","admin","manager","responsable","commercial",
        "gestionnaire","coach","data_collector","superviseur","deputy_superviseur",
        "pedagogical_advisor","onboarding","rh","comptable","customer_care",
        "placement_test","assistant_elearning","admin_elearning",
        "admin_manager","admin_superviseur","admin_placement","admin_onboarding",
        "admin_customer_care","admin_pa_advisor",
        "admin_rh_paie","admin_comptable","admin_commercial",
        "professeur_titulaire","professeur_remplacant",
        "admin_pedagogique","admin_financier","admin_rh","responsable_centre","observateur",
        "marketing",
      ];
      if (!roleFromAuth || !ROLES_VALIDES.includes(roleFromAuth)) {
        return res.status(403).json({ error: "Accès refusé - rôle admin non reconnu" });
      }
      const DEPT_PAR_ROLE = {
        super_admin:"Direction Générale", admin:"Administration",
        manager:"Management", superviseur:"Supervision", deputy_superviseur:"Supervision Déléguée",
        responsable:"Responsable de Centre", pedagogical_advisor:"Conseil Pédagogique",
        commercial:"Commercial / Assistante", onboarding:"Onboarding & Classes",
        gestionnaire:"Gestion Administrative", rh:"Ressources Humaines / Paie",
        comptable:"Comptabilité / Trésorerie", coach:"Pédagogie",
        customer_care:"Customer Care", data_collector:"Collecte de Données",
        marketing:"Marketing & Communication",
      };
      const nomMeta    = user.user_metadata?.nom    || user.email.split("@")[0];
      const prenomMeta = user.user_metadata?.prenom || "Admin";
      const { data: created, error: createErr } = await supabase
        .from("utilisateurs")
        .upsert({
          id: user.id, email: user.email,
          nom: nomMeta, prenom: prenomMeta,
          role: roleFromAuth,
          scope: ["national"],
          departement: DEPT_PAR_ROLE[roleFromAuth] || null,
          actif: true,
          mdp_temporaire: false,
        }, { onConflict: "id" })
        .select()
        .single();
      if (createErr || !created) {
        return res.status(403).json({ error: "Profil introuvable et impossible à recréer - contactez le support" });
      }
      await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, role: roleFromAuth, actif: true },
      });
      profil = created;
      source = "utilisateurs";
      console.log(`[LOGIN AUTO-REPAIR] Profil recréé pour ${user.email} (rôle: ${roleFromAuth})`);
    }

    if (!profil.actif) {
      return res.status(403).json({ error: "Compte désactivé - contactez le Super Admin BET" });
    }

    // 3. Vérifier le statut MFA
    const userClient = await getUserClient(data.session.access_token, data.session.refresh_token);
    const { data: aalData } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel();

    // Résoudre twofa_obligatoire EN PREMIER (avant tout check Supabase MFA)
    // Pour utilisateurs : twofa_active | Pour profils_admin : twofa_obligatoire
    const twofa_obligatoire = profil.twofa_obligatoire ?? profil.twofa_active ?? false;
    console.log(`[LOGIN] ${profil.email} | twofa_active=${profil.twofa_active} | twofa_obligatoire=${profil.twofa_obligatoire} | résolu=${twofa_obligatoire} | nextLevel=${aalData?.nextLevel} | currentLevel=${aalData?.currentLevel}`);

    // Résout la matrice de permissions effective (rôle + exceptions individuelles) pour que
    // le frontend puisse vérifier profile.permissions.<module>.<action> au lieu de se baser
    // uniquement sur une liste de rôles codée en dur - sans ça, la matrice configurée dans
    // Gestion des droits n'a aucun effet réel côté interface (ex: bouton "Modifier un versement").
    const permissions = await resolvePermissions(profil.role, user.id);

    const profilPublic = {
      permissions,
      id:                 profil.id,
      email:              profil.email,
      nom:                profil.nom,
      prenom:             profil.prenom,
      telephone:          profil.telephone || null,
      role:               profil.role,
      scope:              profil.scope || ["national"],
      departement:        profil.departement || null,
      actif:              profil.actif,
      twofa_active:       twofa_obligatoire,
      mdp_temporaire:     profil.mdp_temporaire ?? false,
      derniere_connexion: profil.derniere_connexion,
      date_creation:      profil.date_creation,
      avatar_url:         profil.avatar_url  || null,
      coach_info:         profil.coach_info  || null,
      couleur:            profil.couleur     || null,
      acces_elearning:    profil.acces_elearning ?? false,
      type_coach:         profil.type_coach      || null,
    };

    // Si 2FA désactivée en DB → connexion directe, ignorer l'état Supabase MFA
    if (twofa_obligatoire) {
      // 3a. MFA déjà configurée → demander le code TOTP
      if (aalData?.nextLevel === "aal2") {
        const { data: factorsData } = await userClient.auth.mfa.listFactors();
        const totpFactor = factorsData?.totp?.[0];
        return res.json({
          requires_mfa: true,
          factor_id:    totpFactor?.id,
          session:      data.session,
          profil:       profilPublic,
        });
      }

      // 3b. 2FA obligatoire mais pas encore configurée → enrôlement
      return res.json({
        requires_enrollment: true,
        session:             data.session,
        profil:              profilPublic,
      });
    }

    // 3c. Connexion directe
    const table = source === "utilisateurs" ? "utilisateurs" : "profils_admin";
    await supabase.from(table).update({ derniere_connexion: new Date().toISOString() }).eq("id", user.id);

    // audit non bloquant
    supabase.from("audit_admin").insert({
      acteur_id:  user.id,
      acteur_nom: `${profil.prenom} ${profil.nom}`,
      action:     "LOGIN",
      detail:     `Connexion - rôle : ${profil.role}`,
      ip:         req.headers["x-forwarded-for"] || req.socket.remoteAddress || "-",
      statut:     "success",
    }).then(() => {}).catch(() => {});

    logAudit({
      acteur_id:    user.id,
      acteur_nom:   `${profil.prenom} ${profil.nom}`,
      acteur_email: profil.email,
      acteur_role:  profil.role,
      plateforme:   plateformeAppelante,
      action_type:  "LOGIN_SUCCESS",
      module:       "auth",
      entite_type:  "admin",
      entite_id:    user.id,
      detail:       `Connexion admin - rôle : ${profil.role}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.json({ message: "Connexion réussie", session: data.session, profil: profilPublic });
  } catch (err) {
    console.error("Erreur login admin :", err);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});


/* ══════════════════════════════════════════════════════════════
   GET /api/admin/profils-chat?ids=a,b,c
   Identité d'un lot d'auteurs de messages → { id: { avatar_url, role } }.

   Le chat de classe ne stocke dans chaque message que `auteur_id` et
   `auteur_nom` : ni photo ni rôle n'y ont jamais circulé. Les bulles se
   rabattaient sur l'initiale du nom, et rien ne disait si l'auteur était
   un apprenant, son coach ou son assistante - alors que tout le monde
   écrit dans la même conversation.

   Les résoudre ICI plutôt que de les recopier dans chaque message a deux
   conséquences voulues : l'historique déjà écrit en bénéficie lui aussi,
   et un changement de photo - ou de rôle - se propage partout au lieu de
   rester figé dans les anciens messages.

   `authenticateUser` et non `authenticateAdmin` : ce chat est partagé
   avec les coachs et les apprenants, qui doivent voir les mêmes visages.
══════════════════════════════════════════════════════════════ */
/**
 * GET /api/admin/surnoms - la correspondance e-mail → surnom, pour les listes.
 *
 * Les listes d'apprenants du SuperAdmin ne sont pas construites depuis `utilisateurs` mais
 * depuis `assignations_parcours` et `contrats_prives`, qui n'ont pas de colonne `surnom` ni
 * d'identifiant commun avec le compte. L'e-mail est le seul lien qui tienne entre les deux.
 *
 * La reponse ne porte QUE les comptes ayant effectivement un surnom : c'est une poignee de
 * lignes, pas un annuaire, et rien n'y est expose qui ne le soit deja dans ces listes.
 */
router.get("/surnoms", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("utilisateurs")
      .select("id, email, surnom")
      .not("surnom", "is", null)
      .neq("surnom", "");
    if (error) throw error;

    const parEmail = {};
    const parId = {};
    for (const u of data || []) {
      if (u.email) parEmail[u.email.trim().toLowerCase()] = u.surnom;
      if (u.id) parId[u.id] = u.surnom;
    }
    res.json({ parEmail, parId });
  } catch (err) {
    console.error("[GET /admin/surnoms]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

router.get("/profils-chat", authenticateUser, async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",").map(s => s.trim()).filter(Boolean)
      .slice(0, 200);                       // borne : un fil de discussion, pas un annuaire
    if (!ids.length) return res.json({ profils: {} });

    const profils = {};
    const { data: us } = await supabase
      .from("utilisateurs").select("id, avatar_url, role").in("id", ids);
    (us || []).forEach(u => { profils[u.id] = { avatar_url: u.avatar_url || null, role: u.role || null }; });

    // Pas de repli sur `profils_admin` : son unique compte (le super admin) existe aussi
    // dans `utilisateurs`, avec le même identifiant - la requête ci-dessus le trouve donc
    // déjà, et avec une vraie photo si un jour il en charge une.

    res.json({ profils });
  } catch (err) {
    console.error("[admin/profils-chat]", err.message);
    res.status(500).json({ error: "Erreur récupération des profils" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/admin/me
   Profil de l'admin connecté.
══════════════════════════════════════════════════════════════ */
router.get("/me", authenticateAdmin, async (req, res) => {
  const profil = { ...req.profil };
  if (profil.role === "coach") {
    const { count } = await supabase
      .from("groupes")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", profil.id)
      .eq("statut", "actif");
    profil.nbr_contrats_actifs = count || 0;
  }
  res.json({ profil });
});


/* ══════════════════════════════════════════════════════════════
   SSO dash → bet-elearning
   Le token de session admin ne transite plus en clair dans l'URL :
   on émet un ticket signé, à usage unique, valable 45s, qui encapsule
   le token réel + le profil cible. bet-elearning l'échange une seule
   fois contre ces informations avant d'ouvrir une session.
══════════════════════════════════════════════════════════════ */
const SSO_TICKET_SECRET = process.env.SUPABASE_SERVICE_KEY;
const usedSsoTickets = new Set();
setInterval(() => usedSsoTickets.clear(), 5 * 60 * 1000); // les tickets expirent en 45s, purge de sécurité toutes les 5 min

router.post("/sso/ticket", authenticateAdmin, async (req, res) => {
  try {
    const token   = req.headers.authorization.split(" ")[1];
    const { refresh, targetId } = req.body || {};

    let profil = req.profil;

    if (targetId && targetId !== req.profil.id) {
      if (!["super_admin", "admin"].includes(req.role)) {
        return res.status(403).json({ error: "Non autorisé à ouvrir la plateforme e-learning pour un autre utilisateur" });
      }
      const { data: target } = await supabase.from("utilisateurs").select("*").eq("id", targetId).single();
      if (!target) return res.status(404).json({ error: "Utilisateur introuvable" });
      profil = target;
    }

    const jti = crypto.randomUUID();
    const ticket = jwt.sign({ token, refresh: refresh || null, profil, jti }, SSO_TICKET_SECRET, { expiresIn: "45s" });
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la génération du ticket SSO" });
  }
});

router.get("/sso/consume", async (req, res) => {
  const { ticket } = req.query;
  if (!ticket) return res.status(400).json({ error: "Ticket manquant" });
  try {
    const payload = jwt.verify(ticket, SSO_TICKET_SECRET);
    if (usedSsoTickets.has(payload.jti)) {
      return res.status(401).json({ error: "Ticket déjà utilisé" });
    }
    usedSsoTickets.add(payload.jti);
    res.json({ token: payload.token, refresh: payload.refresh, profil: payload.profil });
  } catch {
    res.status(401).json({ error: "Ticket invalide ou expiré" });
  }
});


/* ══════════════════════════════════════════════════════════════
   PATCH /api/admin/me
   Mise à jour de la couleur du dashboard par l'utilisateur lui-même.
   Met à jour les deux tables selon où se trouve le profil.
══════════════════════════════════════════════════════════════ */
router.patch("/me", authenticateAdmin, async (req, res) => {
  try {
    const { couleur, avatar_url, surnom } = req.body;
    const updates = {};
    if (couleur && typeof couleur === "string") updates.couleur = couleur;
    if (avatar_url && typeof avatar_url === "string") updates.avatar_url = avatar_url;
    // `surnom` accepte la chaîne vide et null : c'est ainsi qu'on le RETIRE. Le tester
    // comme les deux précédents (valeur truthy) rendrait la suppression impossible.
    if (surnom !== undefined) updates.surnom = (typeof surnom === "string" && surnom.trim()) ? surnom.trim().slice(0, 40) : null;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "couleur, avatar_url ou surnom requis" });
    }
    const id = req.profil.id;
    console.log(`[PATCH /me] id=${id} role=${req.profil.role}`, updates);

    // Tenter la mise à jour dans `utilisateurs` d'abord
    const { data: u, error: eu } = await supabase
      .from("utilisateurs")
      .update(updates)
      .eq("id", id)
      .select("id, couleur, avatar_url, surnom")
      .single();

    console.log(`[PATCH /me] utilisateurs → data=${JSON.stringify(u)} error=${eu?.message}`);

    // Le repli sur `profils_admin` a été retiré : cette table n'a NI `couleur` NI
    // `avatar_url` (ses colonnes sont id, email, nom, prenom, telephone, profil_type,
    // scope, departement, permissions, actif…). L'écriture y échouait donc toujours, et
    // masquait au passage la vraie cause d'un échec sur `utilisateurs` derrière un
    // « Erreur mise à jour profil » générique. Son unique compte - le super admin -
    // existe de toute façon dans `utilisateurs` avec le même identifiant.
    if (eu) throw eu;
    if (!u) return res.status(404).json({ error: "Profil introuvable" });
    res.json({ ok: true, ...u, table: "utilisateurs" });
  } catch (err) {
    console.error("[PATCH /me] ERREUR:", err.message || err);
    res.status(500).json({ error: err.message || "Erreur mise à jour profil" });
  }
});


/* ══════════════════════════════════════════════════════════════
   GET /api/admin/profils
   Liste tous les profils admin (accessible à tous les admins actifs).
══════════════════════════════════════════════════════════════ */
router.get("/profils", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("profils_admin")
      .select("id, email, nom, prenom, profil_type, scope, departement, actif, twofa_obligatoire, date_creation, derniere_connexion, cree_par_id, note")
      .order("date_creation", { ascending: false });

    if (error) throw error;
    res.json({ profils: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la récupération des profils" });
  }
});


/* ══════════════════════════════════════════════════════════════
   POST /api/admin/profils
   Créer un nouveau profil admin.
   RÉSERVÉ AU SUPER ADMIN UNIQUEMENT.
══════════════════════════════════════════════════════════════ */
router.post("/profils", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const {
      nom, prenom, email, telephone,
      profil_type, scope,
      permissions_custom,   // optionnel : override des permissions par défaut
      twofa_obligatoire,
      note,
    } = req.body;

    // Validation
    if (!nom || !prenom || !email || !profil_type || !scope?.length) {
      return res.status(400).json({
        error: "Champs requis : nom, prenom, email, profil_type, scope"
      });
    }

    const TYPES_VALIDES = [
      "admin_pedagogique", "admin_financier", "admin_rh",
      "admin_commercial", "responsable_centre", "observateur",
    ];
    if (!TYPES_VALIDES.includes(profil_type)) {
      return res.status(400).json({
        error: `Type de profil invalide. Types autorisés : ${TYPES_VALIDES.join(", ")}`
      });
    }

    // Générer un mot de passe temporaire sécurisé
    const mdpTemp = "BET@" + Math.random().toString(36).slice(2, 8).toUpperCase() + "!";

    // 1. Créer l'utilisateur dans Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: mdpTemp,
      email_confirm: true,  // confirmé d'office par le super_admin
      app_metadata: {
        role:  profil_type,
        actif: true,
      },
      user_metadata: { nom, prenom, telephone },
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const newUserId = authData.user.id;

    // 2. Permissions : utiliser les permissions par défaut du type + éventuels overrides
    const permissions = permissions_custom || PERMISSIONS_DEFAUT[profil_type] || {};

    // 3. Insérer le profil dans profils_admin
    const { data: profil, error: insertError } = await supabase
      .from("profils_admin")
      .insert({
        id:                newUserId,
        email,
        nom,
        prenom,
        telephone:         telephone || null,
        profil_type,
        scope:             scope,
        departement:       LABELS_TYPE[profil_type],
        permissions,
        actif:             true,
        twofa_obligatoire: twofa_obligatoire ?? false,
        mdp_temporaire:    true,
        cree_par_id:       req.profil.id,
        note:              note || null,
      })
      .select()
      .single();

    if (insertError) {
      // Rollback : supprimer l'utilisateur Auth si l'insert DB a échoué
      await supabase.auth.admin.deleteUser(newUserId);
      throw insertError;
    }

    // 4. Audit
    await supabase.from("audit_admin").insert({
      acteur_id:  req.profil.id,
      acteur_nom: `${req.profil.prenom} ${req.profil.nom}`,
      action:     "PROFIL_CREE",
      cible_id:   newUserId,
      detail:     `Profil ${profil_type} créé pour ${prenom} ${nom} (${email}) - périmètre : ${scope.join(", ")}`,
      statut:     "success",
    });

    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   `${req.profil.prenom} ${req.profil.nom}`,
      acteur_email: req.profil.email,
      acteur_role:  req.role || req.profil.role,
      action_type:  "USER_CREATED",
      module:       "users",
      entite_type:  "profil_admin",
      entite_id:    newUserId,
      detail:       `Profil admin ${profil_type} créé pour ${prenom} ${nom} (${email})`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    // 5. Réponse (inclut le mdp temporaire pour que le super_admin le transmette)
    res.status(201).json({
      message:      `Profil ${LABELS_TYPE[profil_type]} créé pour ${prenom} ${nom}`,
      profil,
      mdp_temporaire: mdpTemp,  // À transmettre de façon sécurisée à l'utilisateur
    });

  } catch (err) {
    console.error("Erreur création profil :", err);
    res.status(500).json({ error: "Erreur lors de la création du profil" });
  }
});


/* ══════════════════════════════════════════════════════════════
   PATCH /api/admin/profils/:id
   Modifier un profil (permissions, scope, note, twofa).
   RÉSERVÉ AU SUPER ADMIN.
   Le super_admin NE PEUT PAS modifier son propre profil_type.
══════════════════════════════════════════════════════════════ */
router.patch("/profils/:id", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { scope, permissions, twofa_obligatoire, note, actif } = req.body;

    // Récupérer le profil cible
    const { data: cible, error: findError } = await supabase
      .from("profils_admin")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !cible) {
      return res.status(404).json({ error: "Profil introuvable" });
    }

    // Interdire la modification du super_admin
    if (cible.profil_type === "super_admin") {
      return res.status(403).json({
        error: "Le profil Super Admin ne peut pas être modifié"
      });
    }

    // Construire les champs à mettre à jour
    const updates = {};
    if (scope !== undefined)              updates.scope              = scope;
    if (permissions !== undefined)        updates.permissions        = permissions;
    if (twofa_obligatoire !== undefined)  updates.twofa_obligatoire  = twofa_obligatoire;
    if (note !== undefined)               updates.note               = note;
    if (actif !== undefined) {
      updates.actif = actif;
      // Synchroniser dans app_metadata Auth
      await supabase.auth.admin.updateUserById(id, {
        app_metadata: { actif }
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("profils_admin")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    await supabase.from("audit_admin").insert({
      acteur_id:  req.profil.id,
      acteur_nom: `${req.profil.prenom} ${req.profil.nom}`,
      action:     actif === false ? "PROFIL_DESACTIVE" : "PROFIL_MODIFIE",
      cible_id:   id,
      detail:     `Profil de ${cible.prenom} ${cible.nom} modifié - champs : ${Object.keys(updates).join(", ")}`,
      statut:     "warning",
    });

    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   `${req.profil.prenom} ${req.profil.nom}`,
      acteur_email: req.profil.email,
      acteur_role:  req.role || req.profil.role,
      action_type:  "USER_UPDATED",
      module:       "users",
      entite_type:  "profil_admin",
      entite_id:    id,
      detail:       `Profil admin de ${cible.prenom} ${cible.nom} modifié - champs : ${Object.keys(updates).join(", ")}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "warning",
    }).catch(() => {});

    res.json({ message: "Profil mis à jour", profil: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la modification du profil" });
  }
});


/* ══════════════════════════════════════════════════════════════
   GET /api/admin/audit
   Logs d'audit (super_admin voit tout, les autres voient les leurs).
══════════════════════════════════════════════════════════════ */
router.get("/audit", authenticateAdmin, async (req, res) => {
  try {
    let query = supabase
      .from("audit_admin")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (req.role !== "super_admin") {
      query = query.eq("acteur_id", req.profil.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ audit: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur audit" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/admin/mfa/enroll
   Lance l'enrôlement TOTP - renvoie le QR code SVG + le secret.
   Appelé quand requires_enrollment = true après le login.
══════════════════════════════════════════════════════════════ */
router.post("/mfa/enroll", async (req, res) => {
  try {
    const { access_token, refresh_token } = req.body;
    if (!access_token) return res.status(400).json({ error: "Session requise" });

    const userClient = await getUserClient(access_token, refresh_token);
    const { data, error } = await userClient.auth.mfa.enroll({
      factorType:   "totp",
      issuer:       "BET Admin Dashboard",
      friendlyName: "Authentificateur BET",
    });
    if (error) return res.status(400).json({ error: error.message });

    res.json({
      factor_id: data.id,
      qr_code:   data.totp.qr_code, // SVG à afficher directement
      secret:    data.totp.secret,  // Pour saisie manuelle
      uri:       data.totp.uri,
    });
  } catch (err) {
    console.error("MFA enroll error:", err);
    res.status(500).json({ error: "Erreur lors de l'initialisation 2FA" });
  }
});


/* ══════════════════════════════════════════════════════════════
   POST /api/admin/mfa/enroll/confirm
   Confirme l'enrôlement avec le premier code TOTP scanné.
══════════════════════════════════════════════════════════════ */
router.post("/mfa/enroll/confirm", async (req, res) => {
  try {
    const { access_token, refresh_token, factor_id, code } = req.body;
    const plateformeAppelante = req.body.plateforme === "dash" ? "dash" : "bet-elearning";
    if (!access_token || !factor_id || !code) {
      return res.status(400).json({ error: "Paramètres manquants" });
    }

    const userClient = await getUserClient(access_token, refresh_token);

    const { data: challenge, error: challengeErr } = await userClient.auth.mfa.challenge({ factorId: factor_id });
    if (challengeErr) return res.status(400).json({ error: challengeErr.message });

    const { data: verifyData, error: verifyErr } = await userClient.auth.mfa.verify({
      factorId:    factor_id,
      challengeId: challenge.id,
      code,
    });
    if (verifyErr) return res.status(401).json({ error: "Code invalide - vérifiez votre application" });

    // Récupérer le profil pour l'audit (utilisateurs ou profils_admin)
    const { data: enrollUserData } = await userClient.auth.getUser();
    const user = enrollUserData?.user;
    let profil = null;
    const { data: u1 } = user ? await supabase.from("utilisateurs").select("*").eq("id", user.id).single() : { data: null };
    if (u1) { profil = u1; }
    else if (user) {
      const { data: pa } = await supabase.from("profils_admin").select("*").eq("id", user.id).single();
      profil = pa;
    }

    try {
      await supabase.from("audit_admin").insert({
        acteur_id:  user?.id,
        acteur_nom: `${profil?.prenom} ${profil?.nom}`,
        action:     "MFA_ENROLEE",
        detail:     "Authentification à 2 facteurs (TOTP) configurée avec succès",
        statut:     "success",
      });
    } catch {}

    logAudit({
      acteur_id:    user?.id,
      acteur_nom:   profil ? `${profil.prenom} ${profil.nom}` : null,
      acteur_email: profil?.email || null,
      acteur_role:  profil?.role || profil?.profil_type || "admin",
      plateforme:   plateformeAppelante,
      action_type:  "LOGIN_SUCCESS",
      module:       "auth",
      entite_type:  "admin",
      entite_id:    user?.id,
      detail:       `Connexion admin (enrôlement 2FA validé) - rôle : ${profil?.role || profil?.profil_type}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.json({ message: "2FA configurée avec succès", session: verifyData.session });
  } catch (err) {
    console.error("MFA enroll confirm error:", err);
    res.status(500).json({ error: "Erreur lors de la confirmation 2FA" });
  }
});


/* ══════════════════════════════════════════════════════════════
   POST /api/admin/mfa/verify
   Vérifie le code TOTP lors d'une connexion (après mot de passe).
   Élève la session de aal1 → aal2.
══════════════════════════════════════════════════════════════ */
router.post("/mfa/verify", async (req, res) => {
  try {
    const { access_token, refresh_token, factor_id, code } = req.body;
    const plateformeAppelante = req.body.plateforme === "dash" ? "dash" : "bet-elearning";
    if (!access_token || !factor_id || !code) {
      return res.status(400).json({ error: "Paramètres manquants" });
    }

    const userClient = await getUserClient(access_token, refresh_token);

    const { data: challenge, error: challengeErr } = await userClient.auth.mfa.challenge({ factorId: factor_id });
    if (challengeErr) return res.status(400).json({ error: challengeErr.message });

    const { data: verifyData, error: verifyErr } = await userClient.auth.mfa.verify({
      factorId:    factor_id,
      challengeId: challenge.id,
      code,
    });
    if (verifyErr) return res.status(401).json({ error: "Code invalide ou expiré" });

    // Récupérer le profil complet (utilisateurs ou profils_admin)
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("MFA getUser error:", userErr);
      return res.status(500).json({ error: "Impossible de récupérer le profil après la vérification 2FA" });
    }
    const user = userData.user;
    let profil = null;
    let source = null;
    const { data: u2 } = await supabase.from("utilisateurs").select("*").eq("id", user.id).single();
    if (u2) { profil = u2; source = "utilisateurs"; }
    else {
      const { data: pa } = await supabase.from("profils_admin").select("*").eq("id", user.id).single();
      if (pa) { profil = { ...pa, role: pa.profil_type }; source = "profils_admin"; }
    }
    if (!profil) return res.status(403).json({ error: "Profil introuvable" });

    const table = source === "utilisateurs" ? "utilisateurs" : "profils_admin";
    try { await supabase.from(table).update({ derniere_connexion: new Date().toISOString() }).eq("id", user.id); } catch {}
    try {
      await supabase.from("audit_admin").insert({
        acteur_id:  user.id,
        acteur_nom: `${profil.prenom} ${profil.nom}`,
        action:     "LOGIN_MFA",
        detail:     `Connexion 2FA validée - rôle : ${profil.role || profil.profil_type}`,
        ip:         req.headers["x-forwarded-for"] || req.socket.remoteAddress || "-",
        statut:     "success",
      });
    } catch {}

    logAudit({
      acteur_id:    user.id,
      acteur_nom:   `${profil.prenom} ${profil.nom}`,
      acteur_email: profil.email,
      acteur_role:  profil.role || profil.profil_type,
      plateforme:   plateformeAppelante,
      action_type:  "LOGIN_SUCCESS",
      module:       "auth",
      entite_type:  "admin",
      entite_id:    user.id,
      detail:       `Connexion admin 2FA - rôle : ${profil.role || profil.profil_type}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    const permissionsMfa = await resolvePermissions(profil.role || profil.profil_type, user.id);

    res.json({
      message: "Connexion 2FA réussie",
      session: verifyData.session,
      profil: {
        id:                 profil.id,
        email:              profil.email,
        nom:                profil.nom,
        prenom:             profil.prenom,
        telephone:          profil.telephone,
        role:               profil.role || profil.profil_type,
        scope:              profil.scope,
        departement:        profil.departement,
        actif:              profil.actif,
        twofa_active:       profil.twofa_active ?? profil.twofa_obligatoire ?? false,
        mdp_temporaire:     profil.mdp_temporaire,
        derniere_connexion: profil.derniere_connexion,
        date_creation:      profil.date_creation,
        avatar_url:         profil.avatar_url  || null,
        coach_info:         profil.coach_info  || null,
        couleur:            profil.couleur     || null,
        permissions:        permissionsMfa,
      },
    });
  } catch (err) {
    console.error("MFA verify error:", err);
    res.status(500).json({ error: "Erreur lors de la vérification 2FA" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/admin/mon-commercial       - renvoie la commerciale assignée à l'onboarding connecté
══════════════════════════════════════════════════════════════ */
router.get("/mon-commercial", authenticateAdmin, async (req, res) => {
  try {
    const myId = req.profil?.id || req.user?.id;
    if (!myId) return res.status(401).json({ error: "Non authentifié" });

    // Chercher TOUTES les commerciales dont l'assistante a onboarding_id = myId
    // (ne pas utiliser .maybeSingle() - une onboarding peut avoir plusieurs commerciales)
    const { data: assistantesRaw, error } = await supabase
      .from("assistantes")
      .select("id, nom, prenom, email, telephone, centre_id, type_cours, profil, photo_url, actif")
      .eq("onboarding_id", myId);

    if (error) {
      if ((error.message || "").includes("onboarding_id") || (error.message || "").includes("column")) {
        return res.json({ commercial: null, commerciales: [] });
      }
      throw error;
    }
    // L'onboarding ne gère jamais les assistantes centre (présentiel) - leur périmètre n'a
    // rien à voir avec le sien (uniquement en ligne / les_deux).
    const assistantes = (assistantesRaw || []).filter(a => a.type_cours !== "presentiel");
    if (!assistantes || assistantes.length === 0) return res.json({ commercial: null, commerciales: [] });

    // Enrichir avec les IDs utilisateurs
    const enriched = await Promise.all(assistantes.map(async (assistante) => {
      const { data: userCommercial } = await supabase
        .from("utilisateurs")
        .select("id, nom, prenom, email, avatar_url")
        .eq("email", assistante.email)
        .maybeSingle();
      return { ...assistante, utilisateur_id: userCommercial?.id || null };
    }));

    // commercial = première commerciale active (ou la première si toutes inactives)
    const principale = enriched.find(a => a.actif !== false) || enriched[0];
    return res.json({ commercial: principale, commerciales: enriched });
  } catch (err) {
    console.error("[mon-commercial]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/admin/mon-onboarding  - renvoie l'onboarding assigné à la commerciale connectée
══════════════════════════════════════════════════════════════ */
router.get("/mon-onboarding", authenticateAdmin, async (req, res) => {
  try {
    const myEmail = req.profil?.email;
    if (!myEmail) return res.status(401).json({ error: "Non authentifié" });

    // Trouver la fiche assistante de cette commerciale
    const { data: ass } = await supabase
      .from("assistantes")
      .select("onboarding_id")
      .eq("email", myEmail)
      .maybeSingle();

    if (!ass?.onboarding_id) return res.json({ onboarding: null });

    const { data: onboarding } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, avatar_url")
      .eq("id", ass.onboarding_id)
      .maybeSingle();

    return res.json({ onboarding: onboarding || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
   GET /api/admin/diagnostic-onboarding - vérifie toutes les assignations commerciale↔onboarding
══════════════════════════════════════════════════════════════ */
router.get("/diagnostic-onboarding", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    // 1. Toutes les assistantes avec leur onboarding_id
    const { data: assistantes, error: assErr } = await supabase
      .from("assistantes")
      .select("id, nom, prenom, email, type_cours, onboarding_id, actif")
      .order("nom");

    if (assErr) {
      if ((assErr.message || "").includes("onboarding_id") || (assErr.message || "").includes("column")) {
        return res.json({ ok: false, error: "MIGRATION SQL NON JOUÉE - la colonne onboarding_id n'existe pas encore dans la table assistantes", migration_file: "Backend/sql/assistantes_onboarding_migration.sql" });
      }
      throw assErr;
    }

    // 2. Tous les utilisateurs onboarding
    const { data: onboardings } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email")
      .eq("role", "onboarding");

    const obMap = Object.fromEntries((onboardings || []).map(o => [o.id, `${o.prenom} ${o.nom} <${o.email}>`]));

    const result = (assistantes || []).map(a => ({
      commerciale: `${a.prenom} ${a.nom} <${a.email}>`,
      type_cours: a.type_cours,
      actif: a.actif,
      onboarding_id: a.onboarding_id || null,
      onboarding_assignee: a.onboarding_id ? (obMap[a.onboarding_id] || `⚠️ ID inconnu: ${a.onboarding_id}`) : "❌ Aucune",
    }));

    res.json({ ok: true, assignations: result, onboardings: onboardings || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
   GET /api/admin/onboardings - liste tous les utilisateurs onboarding (utilisateurs + profils_admin)
══════════════════════════════════════════════════════════════ */
router.get("/onboardings", authenticateAdmin, async (req, res) => {
  try {
    // Table utilisateurs (nouveaux comptes)
    const { data: u1 } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, telephone, avatar_url, scope, departement, role, actif")
      .eq("role", "onboarding")
      .eq("actif", true);

    // Table profils_admin (anciens comptes) - pas de colonne avatar_url ici
    const { data: u2 } = await supabase
      .from("profils_admin")
      .select("id, nom, prenom, email, telephone, scope, departement, profil_type, actif")
      .eq("profil_type", "onboarding")
      .eq("actif", true);

    const fromUtilisateurs = (u1 || []).map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, telephone: u.telephone || null, avatar_url: u.avatar_url || null, scope: u.scope || null, departement: u.departement || null, source: "utilisateurs" }));
    const fromProfilsAdmin = (u2 || []).map(u => ({ id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, telephone: u.telephone || null, avatar_url: null, scope: u.scope || null, departement: u.departement || null, source: "profils_admin" }));

    // Dédupliquer par id
    const seen = new Set(fromUtilisateurs.map(u => u.id));
    const merged = [...fromUtilisateurs, ...fromProfilsAdmin.filter(u => !seen.has(u.id))];

    res.json({ onboardings: merged });
  } catch (err) {
    console.error("[GET /admin/onboardings]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/*
   GET  /api/messages/contacts  - contacts autorisés pour la messagerie interne
   Retourne les utilisateurs des tables `utilisateurs` + `profiles`
   qui ont un rôle e-learning, pour peupler la liste de contacts
══════════════════════════════════════════════════════════════ */
router.get("/messages/contacts", authenticateUser, async (req, res) => {
  try {
    const toContact = (u) => ({
      id:        u.id,
      nom:       u.nom    || "",
      prenom:    u.prenom || "",
      email:     u.email  || "",
      role:      u.role === "coach" ? (u.type_coach || "professeur_titulaire") : u.role,
      initiales: `${(u.prenom || "")[0] || ""}${(u.nom || "")[0] || ""}`.toUpperCase(),
    });

    const monRole = req.profil.role;
    const SCOPED_ROLES = ["apprenant", "parent", "client_entreprise"];

    // ── Rôles à correspondants restreints (apprenant, parent, entreprise) ──
    if (SCOPED_ROLES.includes(monRole)) {
      const contacts = [];
      const seen = new Set();
      const ajouter = (u) => {
        if (!u || seen.has(u.id)) return;
        seen.add(u.id);
        contacts.push(toContact(u));
      };

      const { data: onboardingEtPA } = await supabase
        .from("utilisateurs")
        .select("id, nom, prenom, email, role, actif")
        .in("role", ["admin_onboarding", "admin_pa_advisor"])
        .eq("actif", true);
      const onboardings = (onboardingEtPA || []).filter(u => u.role === "admin_onboarding");
      const paAdvisors  = (onboardingEtPA || []).filter(u => u.role === "admin_pa_advisor");

      if (monRole === "apprenant") {
        const { data: inscriptions } = await supabase
          .from("classes_elearning_apprenants")
          .select("classe_id, email_parent")
          .eq("apprenant_id", req.profil.id);

        const classeIds = [...new Set((inscriptions || []).map(i => i.classe_id).filter(Boolean))];
        if (classeIds.length) {
          const { data: classes } = await supabase
            .from("classes_elearning").select("coach_id").in("id", classeIds);
          const coachIds = [...new Set((classes || []).map(c => c.coach_id).filter(Boolean))];
          if (coachIds.length) {
            const { data: coachs } = await supabase
              .from("utilisateurs").select("id, nom, prenom, email, role, actif, type_coach")
              .in("id", coachIds).eq("actif", true);
            (coachs || []).forEach(ajouter);
          }
        }

        const emailsParent = [...new Set((inscriptions || []).map(i => i.email_parent).filter(Boolean))];
        if (emailsParent.length) {
          const { data: parents } = await supabase
            .from("utilisateurs").select("id, nom, prenom, email, role, actif")
            .in("email", emailsParent).eq("role", "parent").eq("actif", true);
          (parents || []).forEach(ajouter);
        }

        onboardings.forEach(ajouter);
      }

      if (monRole === "parent") {
        const { data: enfants } = await supabase
          .from("classes_elearning_apprenants")
          .select("classe_id, apprenant_id")
          .eq("email_parent", (req.profil.email || "").toLowerCase().trim());

        const classeIds = [...new Set((enfants || []).map(e => e.classe_id).filter(Boolean))];
        if (classeIds.length) {
          const { data: classes } = await supabase
            .from("classes_elearning").select("coach_id").in("id", classeIds);
          const coachIds = [...new Set((classes || []).map(c => c.coach_id).filter(Boolean))];
          if (coachIds.length) {
            const { data: coachs } = await supabase
              .from("utilisateurs").select("id, nom, prenom, email, role, actif, type_coach")
              .in("id", coachIds).eq("actif", true);
            (coachs || []).forEach(ajouter);
          }
        }

        const apprenantIds = [...new Set((enfants || []).map(e => e.apprenant_id).filter(Boolean))];
        if (apprenantIds.length) {
          const { data: apprenants } = await supabase
            .from("utilisateurs").select("id, nom, prenom, email, role, actif")
            .in("id", apprenantIds).eq("actif", true);
          (apprenants || []).forEach(ajouter);
        }

        paAdvisors.forEach(ajouter);
      }

      if (monRole === "client_entreprise") {
        const entrepriseId = req.profil.entreprise_id;
        if (entrepriseId) {
          // L'assistante e-learning "chargée du dossier" = celle qui a créé la fiche entreprise
          // (comptes_entreprises.cree_par_id) - seule trace d'affectation nominative qui existe
          // dans le modèle de données actuel. Si cette personne n'est plus commerciale (mutation,
          // compte désactivé), on ne remonte personne plutôt que d'afficher tous les commerciaux.
          const { data: entContact } = await supabase
            .from("comptes_entreprises").select("cree_par_id").eq("id", entrepriseId).maybeSingle();
          if (entContact?.cree_par_id) {
            const { data: assistante } = await supabase
              .from("utilisateurs").select("id, nom, prenom, email, role, actif")
              .eq("id", entContact.cree_par_id).eq("role", "commercial").eq("actif", true).maybeSingle();
            if (assistante) ajouter(assistante);
          }

          const { data: classes } = await supabase
            .from("classes_elearning").select("id, coach_id").eq("entreprise_id", entrepriseId);
          const coachIds = [...new Set((classes || []).map(c => c.coach_id).filter(Boolean))];
          if (coachIds.length) {
            const { data: coachs } = await supabase
              .from("utilisateurs").select("id, nom, prenom, email, role, actif, type_coach")
              .in("id", coachIds).eq("actif", true);
            (coachs || []).forEach(ajouter);
          }

          // Les apprenants (bénéficiaires) de cette entreprise, toutes classes confondues -
          // le RH doit pouvoir écrire directement à "ses" apprenants, pas seulement aux coachs.
          const classeIds = (classes || []).map(c => c.id);
          if (classeIds.length) {
            const { data: inscriptions } = await supabase
              .from("classes_elearning_apprenants")
              .select("apprenant_id")
              .in("classe_id", classeIds);
            const apprenantIds = [...new Set((inscriptions || []).map(i => i.apprenant_id).filter(Boolean))];
            if (apprenantIds.length) {
              const { data: apprenants } = await supabase
                .from("utilisateurs").select("id, nom, prenom, email, role, actif")
                .in("id", apprenantIds).eq("actif", true);
              (apprenants || []).forEach(ajouter);
            }
          }
        }

        paAdvisors.forEach(ajouter);
      }

      return res.json({ contacts });
    }

    // ── Autres rôles (admins, coachs, professeurs…) : liste complète inchangée ──
    // 1. Table `utilisateurs` (BET platform - contient coachs, admins BET, etc.)
    const { data: utilisateurs } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, role, actif, type_coach")
      .neq("actif", false);

    // 2. Table `profiles` (bet-elearning portal - contient admins e-learning)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nom, prenom, email, role, actif")
      .neq("actif", false);

    // 3. Fusionner et dédupliquer par ID
    const seen = new Set();
    const contacts = [];

    for (const u of [...(utilisateurs || []), ...(profiles || [])]) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      contacts.push(toContact(u));
    }

    res.json({ contacts });
  } catch (err) {
    console.error("[messages/contacts]", err);
    res.status(500).json({ error: "Erreur récupération contacts" });
  }
});

/*
   GET  /api/admin/utilisateurs        - liste tous les utilisateurs
   POST /api/admin/utilisateurs        - crée un utilisateur (super_admin)
   PATCH /api/admin/utilisateurs/:id   - modifie (actif, note…)
══════════════════════════════════════════════════════════════ */
router.get("/utilisateurs", authenticateAdmin, async (req, res) => {
  try {
    const SELECT_COLS = "id,email,nom,prenom,telephone,telephone_2,role,scope,departement,actif,twofa_active,mdp_temporaire,date_creation,derniere_connexion,note,cree_par_id,avatar_url,coach_info,couleur,acces_elearning,type_coach,onboarding_vue_globale,date_debut,nationalite,pays_residence,matricule,adresse,genre,surnom";
    const buildUsersQuery = (select) => {
      let qq = supabase
        .from("utilisateurs")
        .select(select)
        // Cette liste est réservée aux collaborateurs internes BET - les comptes externes
        // (apprenants, parents, entreprises clientes) ont leurs propres espaces dédiés.
        .not("role", "in", '("apprenant","parent","client_entreprise")')
        .order("date_creation", { ascending: false });
      if (req.query.role) qq = qq.eq("role", req.query.role);
      return qq;
    };
    let { data, error } = await buildUsersQuery(SELECT_COLS);
    // Repli si la migration ajoutant `onboarding_vue_globale` n'a pas encore été jouée - ne
    // doit jamais casser la liste entière des utilisateurs pour tout le monde.
    if (error && (error.code === "42703" || (error.message || "").includes("onboarding_vue_globale"))) {
      ({ data, error } = await buildUsersQuery(SELECT_COLS.replace(",onboarding_vue_globale", "")));
    }
    if (error) throw error;

    // Pour les coachs, enrichir avec le nombre de groupes actifs + acces_bloque
    let utilisateurs = data || [];
    const COACH_ROLES = ["coach", "professeur_titulaire", "professeur_remplacant"];
    const coachIds = utilisateurs.filter(u => COACH_ROLES.includes(u.role)).map(u => u.id);
    if (coachIds.length > 0) {
      const [groupesResult, contratsPrivesResult, authResults] = await Promise.all([
        supabase.from("groupes").select("coach_id").in("coach_id", coachIds).eq("statut", "actif"),
        supabase.from("contrats_prives").select("coach_id").in("coach_id", coachIds).eq("statut", "actif"),
        Promise.all(coachIds.map(id =>
          supabase.auth.admin.getUserById(id)
            .then(r => ({ id, acces_bloque: r.data?.user?.app_metadata?.acces_bloque || false }))
            .catch(() => ({ id, acces_bloque: false }))
        )),
      ]);
      const countMap = {};
      (groupesResult.data || []).forEach(g => { countMap[g.coach_id] = (countMap[g.coach_id] || 0) + 1; });
      // Un coach peut avoir des classes de groupe ET des contrats de coaching
      // privé (1-à-1, table séparée contrats_prives) - les deux comptent comme
      // des "contrats actifs", sans quoi la colonne sous-représentait les coachs
      // faisant surtout du privé.
      (contratsPrivesResult.data || []).forEach(c => { countMap[c.coach_id] = (countMap[c.coach_id] || 0) + 1; });
      const bloqueMap = {};
      authResults.forEach(r => { bloqueMap[r.id] = r.acces_bloque; });
      utilisateurs = utilisateurs.map(u => COACH_ROLES.includes(u.role)
        ? { ...u, nbr_contrats_actifs: countMap[u.id] || 0, acces_bloque: bloqueMap[u.id] || false }
        : u
      );
    }

    // Pour les assistantes onboarding, enrichir avec le nombre de commerciales déjà suivies.
    // La vraie relation un-à-plusieurs vit sur `assistantes.onboarding_id` (posée à la création/
    // sync de chaque commerciale) - `utilisateurs.onboarding_commercial_id` était une colonne
    // scalaire côté onboarding qui s'écrasait à chaque nouvelle commerciale assignée, donc ne
    // pouvait jamais représenter plusieurs commerciales pour un même onboarding (toujours 0
    // dès la 2e assignation).
    const onboardingIds = utilisateurs.filter(u => u.role === "onboarding").map(u => u.id);
    if (onboardingIds.length > 0) {
      const { data: suivis } = await supabase
        .from("assistantes")
        .select("onboarding_id")
        .in("onboarding_id", onboardingIds);
      const suiviMap = {};
      (suivis || []).forEach(s => { suiviMap[s.onboarding_id] = (suiviMap[s.onboarding_id] || 0) + 1; });
      utilisateurs = utilisateurs.map(u => u.role === "onboarding"
        ? { ...u, nb_commerciaux_assignes: suiviMap[u.id] || 0 }
        : u
      );
    }

    res.json({ utilisateurs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération utilisateurs" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/admin/generer-email - génère une adresse technique unique
   (id.<prenomnom>@betacademy.app) pour un profil créé sans vraie adresse
   email personnelle. Même principe que celui déjà utilisé pour les
   apprenants (identifiantTechniqueApprenant dans apprenants.js), mais
   basé uniquement sur le nom complet - jamais le téléphone, sur demande
   explicite (pas de lien avec un numéro qui pourrait changer de main).
══════════════════════════════════════════════════════════════ */
router.get("/generer-email", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { prenom, nom } = req.query;
    if (!prenom && !nom) return res.status(400).json({ error: "prenom ou nom requis" });
    const slug = `${prenom || ""}${nom || ""}`
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30) || "profil";
    let candidate = `id.${slug}@betacademy.app`;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase.from("utilisateurs").select("id").eq("email", candidate).maybeSingle();
      if (!data) return res.json({ email: candidate });
      n += 1;
      candidate = `id.${slug}${n}@betacademy.app`;
    }
  } catch (err) {
    res.status(500).json({ error: "Erreur génération email" });
  }
});

router.post("/utilisateurs", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { nom, prenom, email, telephone, telephone_2, role, scope, departement, note, planning, coach_info, avatar_url, couleur, date_debut, nationalite, pays_residence, matricule, adresse, genre, surnom } = req.body;
    if (!nom || !prenom || !email || !role) {
      return res.status(400).json({ error: "Champs requis : nom, prenom, email, role" });
    }

    const mdpTemp = "BET@" + Math.random().toString(36).slice(2, 8).toUpperCase() + "!";

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password: mdpTemp, email_confirm: true,
      app_metadata: { role, actif: true },
      user_metadata: { nom, prenom, telephone },
    });
    if (authError) {
      console.error("❌ createUser error:", JSON.stringify(authError, null, 2));
      return res.status(400).json({ error: authError.message, detail: authError });
    }

    const DEPT_PAR_ROLE = {
      super_admin:         "Direction Générale",
      admin:               "Administration",
      manager:             "Management",
      superviseur:         "Supervision",
      deputy_superviseur:  "Supervision Déléguée",
      responsable:         "Responsable de Centre",
      pedagogical_advisor: "Conseil Pédagogique",
      commercial:          "Commercial / Assistante",
      onboarding:          "Onboarding & Classes",
      gestionnaire:        "Gestion Administrative",
      rh:                  "Ressources Humaines / Paie",
      comptable:           "Comptabilité / Trésorerie",
      coach:               "Pédagogie",
      customer_care:       "Customer Care Service",
      assistant_sav:       "Service Après-Vente",
      data_collector:      "Collecte de Données",
      admin_elearning:     "Assistant E-Learning",
      assistant_elearning: "Assistant E-Learning",
      admin_manager:       "Management BET",
      admin_superviseur:   "Supervision BET",
      admin_placement:     "Tests de niveau & Placement",
      admin_onboarding:    "Onboarding & Classes",
      admin_customer_care: "Customer Care",
      admin_pa_advisor:    "PA Advisor",
      admin_rh_paie:       "RH / Paie",
      admin_comptable:     "Comptabilité",
      admin_commercial:    "Commercial Entreprises",
      professeur_titulaire:   "Pédagogie",
      professeur_remplacant:  "Pédagogie",
    };

    const insertPayload = {
      id: authData.user.id, email, nom, prenom,
      telephone: telephone || null, telephone_2: telephone_2 || null, role,
      scope: scope || ["national"],
      departement: departement || DEPT_PAR_ROLE[role] || null,
      actif: true, mdp_temporaire: true,
      mdp_initial: mdpTemp,
      cree_par_id: req.profil.id,
      note: note || null,
      avatar_url: avatar_url || coach_info?.photo_url || null,
      coach_info: coach_info || null,
      couleur: couleur || null,
      date_debut: role !== "coach" ? (date_debut || null) : null,
      nationalite: nationalite || null,
      pays_residence: pays_residence || null,
      matricule: role !== "coach" ? (matricule || null) : null,
      adresse: adresse || null,
      genre: genre || null,
      surnom: surnom?.trim() || null,
      acces_elearning: req.body.acces_elearning ?? (role?.startsWith("admin_") || ["admin_elearning", "assistant_elearning", "professeur_titulaire", "professeur_remplacant"].includes(role)),
    };

    let { data: utilisateur, error: insertError } = await supabase
      .from("utilisateurs")
      .insert(insertPayload)
      .select().single();

    // Tant que la migration du surnom n'a pas été jouée, Postgres rejette TOUTE la ligne
    // sur cette colonne inconnue : la création d'un compte échouerait pour un champ
    // facultatif. On réessaie sans lui, plutôt que de faire dépendre l'ouverture d'un
    // compte de l'ordre entre le déploiement et le SQL.
    if (insertError && /surnom/.test(insertError.message || "")) {
      console.warn("[utilisateurs] colonne surnom absente - exécuter "
        + "Backend/sql/utilisateurs_surnom.sql. Création sans le surnom en attendant.");
      const { surnom: _ignore, ...sansSurnom } = insertPayload;
      ({ data: utilisateur, error: insertError } = await supabase
        .from("utilisateurs").insert(sansSurnom).select().single());
    }

    if (insertError) {
      console.error("❌ utilisateurs insert error:", JSON.stringify(insertError, null, 2));
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: insertError.message || "Erreur insertion utilisateur", detail: insertError });
    }

    // Si c'est une assistante commerciale, créer automatiquement la ligne dans `assistantes`
    let assistanteWarning = null;
    if (role === "commercial" && planning) {
      const { centre_id, type_cours, type_semaine, quota_jour, jours_travail, profil, onboarding_id } = planning;
      if (type_cours === "les_deux") {
        return res.status(400).json({ error: "Le mode \"Les deux\" n'est plus disponible pour une assistante - choisissez En ligne ou Présentiel." });
      }
      const { error: assistanteErr } = await supabase.from("assistantes").insert({
        nom, prenom, email,
        telephone: telephone || null,
        centre_id: centre_id || null,
        type_cours: type_cours || "en_ligne",
        type_semaine: type_semaine || "semaine",
        quota_jour: quota_jour || 10,
        jours_travail: jours_travail || ["lundi","mardi","mercredi","jeudi","vendredi"],
        profil: profil || "b2c",
        onboarding_id: onboarding_id || null,
        actif: true,
      });
      if (assistanteErr) {
        console.error("⚠️ assistantes insert error:", JSON.stringify(assistanteErr, null, 2));
        assistanteWarning = assistanteErr.message;
      }
      // Le lien commerciale ↔ onboarding vit déjà sur assistantes.onboarding_id (ci-dessus) -
      // rien d'autre à écrire côté utilisateurs.
    }

    // Si c'est un Pedagogical Advisor, créer automatiquement sa ligne dans `assistantes`
    // (profil="pa") - sans elle, GET /api/parcours/assistantes-pa ne le trouve jamais et
    // les 3 parcours "coaching privé" (en ligne / présentiel / domicile) échouent tous avec
    // "Aucun conseiller pédagogique disponible", même quand un vrai PA existe dans `utilisateurs`.
    // Périmètre national par défaut (pas de centre_id), comme les autres rôles transversaux.
    if (role === "pedagogical_advisor") {
      const { error: paErr } = await supabase.from("assistantes").insert({
        nom, prenom, email,
        telephone: telephone || null,
        centre_id: null,
        type_cours: "en_ligne",
        profil: "pa",
        actif: true,
      });
      if (paErr) {
        console.error("⚠️ assistantes (pa) insert error:", JSON.stringify(paErr, null, 2));
        assistanteWarning = paErr.message;
      }
    }

    await supabase.from("audit_admin").insert({
      acteur_id: req.profil.id,
      acteur_nom: `${req.profil.prenom} ${req.profil.nom}`,
      action: "UTILISATEUR_CREE",
      cible_id: authData.user.id,
      detail: `Utilisateur ${role} créé : ${prenom} ${nom} (${email})${role === "commercial" ? " + profil assistante" : role === "pedagogical_advisor" ? " + profil PA" : ""}`,
      statut: "success",
    });

    logAudit({
      acteur_id:    req.profil.id,
      acteur_nom:   `${req.profil.prenom} ${req.profil.nom}`,
      acteur_email: req.profil.email,
      acteur_role:  req.role || req.profil.role,
      action_type:  "USER_CREATED",
      module:       "users",
      entite_type:  "utilisateur",
      entite_id:    authData.user.id,
      detail:       `Utilisateur ${role} créé : ${prenom} ${nom} (${email})`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    // Envoyer l'email de bienvenue avec les identifiants - gabarit dédié pour les coachs,
    // gabarit générique pour tous les autres rôles (jusqu'ici aucun email n'était envoyé
    // pour eux : le mot de passe temporaire n'était visible que dans la réponse à l'écran
    // du Super Admin, à charge pour lui de le transmettre manuellement).
    // Awaité (et non fire-and-forget) : sur Vercel, une fonction serverless est gelée dès
    // la réponse envoyée - un envoi non attendu n'a souvent pas le temps de partir avant que
    // le sandbox soit suspendu, contrairement à un serveur Node classique (nodemon en local)
    // qui reste actif. D'où les emails qui fonctionnaient en local mais jamais en prod.
    if (role === "coach") {
      await sendCoachWelcomeEmail({ prenom, nom, email, mdpTemp }).catch(err =>
        console.warn("[adminRoutes] Email bienvenue coach échoué:", err.message)
      );
    } else {
      await sendStaffWelcomeEmail({ prenom, nom, email, mdpTemp, departement: insertPayload.departement }).catch(err =>
        console.warn("[adminRoutes] Email bienvenue staff échoué:", err.message)
      );
    }

    // Notifier l'assistant e-learning si un coach est créé
    if (role === "coach") {
      try {
        const { data: assistants } = await supabase
          .from("utilisateurs")
          .select("id")
          .eq("role", "assistant_elearning")
          .eq("actif", true);
        if (assistants?.length) {
          await supabase.from("notifications").insert(
            assistants.map(u => ({
              user_id: u.id,
              type:    "assignation",
              titre:   `👨‍🏫 Nouveau coach : ${prenom} ${nom}`,
              message: `Le compte coach de ${prenom} ${nom} (${email}) a été créé.`,
              lu:      false,
              meta:    { utilisateur_id: utilisateur?.id },
            }))
          );
        }
      } catch (ne) {
        console.warn("[adminRoutes] notif coach→assistant_elearning échouée:", ne.message);
      }
    }

    res.status(201).json({ message: "Utilisateur créé", utilisateur, mdp_temporaire: mdpTemp, assistante_warning: assistanteWarning || undefined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur création utilisateur" });
  }
});

router.patch("/utilisateurs/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const isSelf = req.profil.id === id;
    const bodyKeys = Object.keys(req.body);
    // Ce qu'un utilisateur peut changer SUR LUI-MÊME, et rien d'autre. Liste blanche
    // volontairement courte : « surnom » rejoint « couleur » parce que c'est de la
    // présentation personnelle, sans effet sur les droits ni sur l'identité
    // administrative (nom, email, rôle restent réservés au SuperAdmin).
    const CHAMPS_LIBRES_SUR_SOI = ["couleur", "surnom"];
    const selfChampsLibres = isSelf && bodyKeys.length > 0
      && bodyKeys.every(k => CHAMPS_LIBRES_SUR_SOI.includes(k));

    // Champs e-learning (acces_elearning, type_coach, couleur, coach_info) modifiables par manager et admin_elearning
    const ELEARNING_ADMIN_ROLES = ["super_admin", "manager", "admin_elearning", "admin_manager", "professeur_titulaire", "professeur_remplacant"];
    const bodyKeys2 = new Set(bodyKeys);
    const isElearningOnlyUpdate = [...bodyKeys2].every(k => ["acces_elearning", "type_coach", "coach_info", "couleur", "nom", "prenom", "telephone", "telephone_2", "departement", "actif", "twofa_active", "acces_cours", "acces_tests", "acces_ressources", "acces_reporting", "acces_classes"].includes(k));
    const canUpdateElearning = ELEARNING_ADMIN_ROLES.includes(req.role);

    // Seul le super_admin peut modifier n'importe quel champ de n'importe quel utilisateur.
    // Exception : un utilisateur peut mettre à jour sa propre couleur et son surnom.
    // Exception : manager / admin_elearning peuvent modifier les champs e-learning.
    if (!selfChampsLibres && req.role !== "super_admin" && !(isElearningOnlyUpdate && canUpdateElearning)) {
      return res.status(403).json({ error: "Action réservée au Super Admin" });
    }

    const { actif, note, scope, departement, twofa_active, avatar_url, role, nom, prenom, telephone, telephone_2, couleur, coach_info, email: newEmail, acces_elearning, type_coach, onboarding_vue_globale, date_debut, nationalite, pays_residence, matricule, adresse, genre, surnom } = req.body;
    const updates = {};

    if (avatar_url  !== undefined)  updates.avatar_url  = avatar_url;
    if (nom         !== undefined)  updates.nom         = nom;
    if (prenom      !== undefined)  updates.prenom      = prenom;
    if (telephone   !== undefined)  updates.telephone   = telephone;
    if (telephone_2 !== undefined)  updates.telephone_2 = telephone_2;
    if (date_debut  !== undefined)  updates.date_debut  = date_debut;
    if (nationalite     !== undefined)  updates.nationalite     = nationalite;
    if (pays_residence  !== undefined)  updates.pays_residence  = pays_residence;
    if (matricule       !== undefined)  updates.matricule       = matricule;
    if (surnom          !== undefined)  updates.surnom          = surnom?.trim() || null;
    // Voir la création : la colonne peut ne pas encore exister. Le drapeau permet de
    // rejouer la mise à jour sans elle plutôt que de tout perdre.
    const surnomDemande = surnom !== undefined;
    if (adresse         !== undefined)  updates.adresse         = adresse;
    if (genre           !== undefined)  updates.genre           = genre;
    if (note        !== undefined)  updates.note        = note;
    if (scope       !== undefined)  updates.scope       = scope;
    if (departement !== undefined)  updates.departement = departement;
    if (couleur     !== undefined)  updates.couleur     = couleur;
    if (coach_info       !== undefined) updates.coach_info       = coach_info;
    if (acces_elearning  !== undefined) updates.acces_elearning  = acces_elearning;
    if (type_coach       !== undefined) updates.type_coach       = type_coach;
    if (onboarding_vue_globale !== undefined) updates.onboarding_vue_globale = onboarding_vue_globale;

    // Mise à jour de l'email (Auth + table utilisateurs)
    // La fiche `assistantes` est rapprochée par EMAIL - la colonne utilisateur_id n'a
    // jamais été migrée dans cette base. L'ancien email doit donc être capturé AVANT la
    // mise à jour : sans lui, un changement d'email rendrait la fiche introuvable et la
    // propagation ci-dessous la perdrait définitivement.
    const champsPropages = [nom, prenom, telephone, newEmail].some(v => v !== undefined);
    let emailAvant = null;
    if (champsPropages) {
      const { data: avant } = await supabase
        .from("utilisateurs").select("email").eq("id", id).maybeSingle();
      emailAvant = avant?.email || null;
    }

    if (newEmail !== undefined && newEmail) {
      const emailNorm = newEmail.trim().toLowerCase();
      await supabase.auth.admin.updateUserById(id, { email: emailNorm });
      updates.email = emailNorm;
    }

    // Récupérer app_metadata actuel une seule fois pour tous les champs Auth
    const needsAuthUpdate = actif !== undefined || role !== undefined;
    let currentMeta = {};
    if (needsAuthUpdate) {
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(id);
      currentMeta = authUser?.app_metadata || {};
    }

    if (actif !== undefined) {
      updates.actif = actif;
      await supabase.auth.admin.updateUserById(id, { app_metadata: { ...currentMeta, actif } });
      currentMeta = { ...currentMeta, actif };
    }
    if (role !== undefined) {
      updates.role = role;
      await supabase.auth.admin.updateUserById(id, { app_metadata: { ...currentMeta, role } });
    }
    if (twofa_active !== undefined) {
      updates.twofa_active = twofa_active;
      // Si désactivation : supprimer les facteurs TOTP enrôlés dans Supabase Auth
      if (!twofa_active) {
        try {
          const listRes = await fetch(
            `${process.env.SUPABASE_URL}/auth/v1/admin/users/${id}/factors`,
            { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, apikey: process.env.SUPABASE_SERVICE_KEY } }
          );
          const { factors } = await listRes.json();
          if (Array.isArray(factors) && factors.length > 0) {
            await Promise.allSettled(factors.map(f =>
              fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${id}/factors/${f.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, apikey: process.env.SUPABASE_SERVICE_KEY },
              })
            ));
            console.log(`[2FA] Facteurs TOTP supprimés pour user ${id} (${factors.length} facteur(s))`);
          }
        } catch (e) {
          console.warn("[2FA] Impossible de supprimer les facteurs TOTP:", e.message);
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Aucun champ à mettre à jour" });
    }

    let data, error;
    ({ data, error } = await supabase.from("utilisateurs").update(updates).eq("id", id).select().single());
    // Si acces_elearning provoque une erreur (colonne absente avant migration), on retire et on réessaie
    if (error && updates.acces_elearning !== undefined) {
      console.warn("PATCH utilisateur: acces_elearning ignoré (colonne absente ?), réessai sans ce champ.");
      const { acces_elearning: _skip, ...updatesWithout } = updates;
      if (Object.keys(updatesWithout).length === 0) {
        return res.status(200).json({ message: "Aucun autre champ à mettre à jour (acces_elearning ignoré)" });
      }
      ({ data, error } = await supabase.from("utilisateurs").update(updatesWithout).eq("id", id).select().single());
    }

    // Même repli pour le surnom, dont la colonne peut ne pas encore exister : sans lui,
    // un changement de couleur ou de téléphone échouerait à cause d'un champ facultatif.
    if (error && surnomDemande && /surnom/.test(error.message || "")) {
      console.warn("[utilisateurs] colonne surnom absente - exécuter "
        + "Backend/sql/utilisateurs_surnom.sql. Mise à jour sans le surnom en attendant.");
      const { surnom: _skipSurnom, ...sansSurnom } = updates;
      if (Object.keys(sansSurnom).length === 0) {
        return res.status(200).json({ message: "Surnom non enregistré : colonne absente, migration à exécuter." });
      }
      ({ data, error } = await supabase.from("utilisateurs").update(sansSurnom).eq("id", id).select().single());
    }
    if (error) {
      console.error("PATCH utilisateur error:", JSON.stringify(error));
      throw error;
    }

    // ── Propagation vers la fiche `assistantes` ────────────────────────────────
    // La création d'un compte recopiait déjà ces champs sur la fiche ; la modification,
    // elle, ne touchait que `utilisateurs`. Les deux tables divergeaient donc dès la
    // première correction - constaté sur le téléphone, absent de 22 fiches sur 23, et
    // affiché en "-" sur le dossier de chaque apprenant suivi par ces assistantes.
    //
    // Best-effort volontaire : la fiche n'existe que pour les rôles qui en ont une
    // (commercial, pedagogical_advisor), et un échec ici ne doit jamais faire échouer la
    // mise à jour du compte, déjà enregistrée.
    if (champsPropages && emailAvant) {
      try {
        const majAssistante = {};
        if (nom       !== undefined) majAssistante.nom       = nom;
        if (prenom    !== undefined) majAssistante.prenom    = prenom;
        if (telephone !== undefined) majAssistante.telephone = telephone || null;
        if (updates.email)           majAssistante.email     = updates.email;

        if (Object.keys(majAssistante).length) {
          const { data: fiche } = await supabase
            .from("assistantes").select("id").eq("email", emailAvant).maybeSingle();
          if (fiche?.id) {
            const { error: propErr } = await supabase
              .from("assistantes").update(majAssistante).eq("id", fiche.id);
            if (propErr) console.warn("[PATCH utilisateur] propagation fiche assistante:", propErr.message);
          }
        }
      } catch (errProp) {
        console.warn("[PATCH utilisateur] propagation fiche assistante:", errProp.message);
      }
    }

    // Determine the most significant action for audit
    const isRoleChange   = role    !== undefined;
    const isDeactivation = actif   === false;
    const auditActionType = isRoleChange ? "ROLE_CHANGED" : "USER_UPDATED";
    const auditStatut     = isDeactivation ? "warning" : isRoleChange ? "warning" : "success";

    logAudit({
      acteur_id:    req.profil?.id,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email,
      acteur_role:  req.role || req.profil?.role,
      action_type:  auditActionType,
      module:       "users",
      entite_type:  "utilisateur",
      entite_id:    id,
      detail:       `Mise à jour utilisateur ${id} - champs : ${Object.keys(updates).join(", ")}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       auditStatut,
    }).catch(() => {});

    res.json({ message: "Utilisateur mis à jour", utilisateur: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur mise à jour utilisateur" });
  }
});


/* ══════════════════════════════════════════════════════════════
   POST /api/admin/utilisateurs/:id/renvoyer-acces
   Retourne email + mdp_initial stocké pour que le superadmin
   puisse les retransmettre manuellement à l'utilisateur.
══════════════════════════════════════════════════════════════ */
router.post("/utilisateurs/:id/renvoyer-acces", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: u, error } = await supabase
      .from("utilisateurs")
      .select("id, email, nom, prenom, role, mdp_initial, mdp_temporaire")
      .eq("id", id)
      .single();
    if (error || !u) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (!u.mdp_initial) return res.status(400).json({ error: "Aucun mot de passe initial enregistré pour cet utilisateur" });

    supabase.from("audit_admin").insert({
      acteur_id:  req.profil.id,
      acteur_nom: `${req.profil.prenom} ${req.profil.nom}`,
      action:     "ACCES_RENVOYES",
      cible_id:   id,
      detail:     `Accès renvoyés pour ${u.prenom} ${u.nom} (${u.email})`,
      statut:     "warning",
    }).then(() => {}).catch(() => {});

    res.json({ email: u.email, mdp_initial: u.mdp_initial, nom: `${u.prenom} ${u.nom}`, role: u.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur renvoi accès" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/admin/utilisateurs/:id/regenerer-mdp
   Génère un nouveau mot de passe temporaire, l'applique réellement
   sur le compte Supabase Auth, et le stocke pour affichage/copie -
   contrairement à /renvoyer-acces qui ne fait que réafficher l'ancien
   mdp_initial (déjà perdu une fois l'utilisateur connecté au moins
   une fois, d'où les nombreux "- non disponible" du tableau).
══════════════════════════════════════════════════════════════ */
router.post("/utilisateurs/:id/regenerer-mdp", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: u, error } = await supabase
      .from("utilisateurs")
      .select("id, email, nom, prenom, role")
      .eq("id", id)
      .single();
    if (error || !u) return res.status(404).json({ error: "Utilisateur introuvable" });

    const mdpTemp = "BET@" + Math.random().toString(36).slice(2, 8).toUpperCase() + "!";

    const { error: authError } = await supabase.auth.admin.updateUserById(id, { password: mdpTemp });
    if (authError) return res.status(400).json({ error: authError.message });

    const { error: updateError } = await supabase
      .from("utilisateurs")
      .update({ mdp_initial: mdpTemp, mdp_temporaire: true })
      .eq("id", id);
    if (updateError) return res.status(500).json({ error: updateError.message });

    supabase.from("audit_admin").insert({
      acteur_id:  req.profil.id,
      acteur_nom: `${req.profil.prenom} ${req.profil.nom}`,
      action:     "MDP_REGENERE",
      cible_id:   id,
      detail:     `Mot de passe régénéré pour ${u.prenom} ${u.nom} (${u.email})`,
      statut:     "warning",
    }).then(() => {}).catch(() => {});

    // Renvoyer les nouveaux accès par email - jusqu'ici le mot de passe n'était
    // visible que dans la réponse à l'écran du Super Admin, à charge pour lui de
    // le transmettre manuellement (même lacune que pour la création, déjà corrigée).
    // Awaité pour la même raison que sur POST /utilisateurs : un envoi non attendu
    // n'a pas le temps de partir avant que Vercel gèle la fonction après la réponse.
    await sendAccessRegeneratedEmail({ prenom: u.prenom, nom: u.nom, email: u.email, mdpTemp }).catch(err =>
      console.warn("[adminRoutes] Email régénération mdp échoué:", err.message)
    );

    res.json({ email: u.email, mdp_initial: mdpTemp, nom: `${u.prenom} ${u.nom}`, role: u.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur régénération mot de passe" });
  }
});


/* ══════════════════════════════════════════════════════════════
   POST /api/admin/utilisateurs/:id/sync-assistante
   Crée (ou recrée) le profil assistante pour une commerciale
   qui n'en aurait pas encore un (création ratée silencieuse).
══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   POST /api/admin/fix-assignations-onboarding-id
   Backfill : renseigne onboarding_id sur toutes les assignations qui l'ont à NULL
   en utilisant l'onboarding_id actuel de l'assistante (meilleure approximation).
══════════════════════════════════════════════════════════════ */
router.post("/fix-assignations-onboarding-id", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    // 1. Récupérer toutes les assistantes avec un onboarding_id
    const { data: assistantes, error: aErr } = await supabase
      .from("assistantes")
      .select("id, onboarding_id")
      .not("onboarding_id", "is", null);
    if (aErr) throw aErr;
    if (!assistantes?.length) return res.json({ fixed: 0, message: "Aucune assistante avec onboarding_id" });

    let fixed = 0;
    for (const ass of assistantes) {
      const { data: rows, error: rErr } = await supabase
        .from("assignations_parcours")
        .update({ onboarding_id: ass.onboarding_id })
        .eq("assistante_id", ass.id)
        .is("onboarding_id", null)
        .select("id");
      if (!rErr && rows) fixed += rows.length;
    }
    res.json({ fixed, message: `${fixed} inscription(s) mise(s) à jour avec onboarding_id` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/utilisateurs/:id/sync-assistante", authenticateAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { type_cours, type_semaine, quota_jour, jours_travail, profil, centre_id, onboarding_id } = req.body;
    if (type_cours === "les_deux") {
      return res.status(400).json({ error: "Le mode \"Les deux\" n'est plus disponible pour une assistante - choisissez En ligne ou Présentiel." });
    }

    // Récupérer l'utilisateur
    const { data: u, error: uErr } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, telephone")
      .eq("id", id)
      .eq("role", "commercial")
      .single();
    if (uErr || !u) return res.status(404).json({ error: "Commerciale introuvable" });

    // Vérifier si un profil assistante existe déjà
    const { data: existing } = await supabase
      .from("assistantes")
      .select("id")
      .eq("email", u.email)
      .maybeSingle();

    if (existing) {
      // Mise à jour
      const { error: updErr } = await supabase.from("assistantes").update({
        nom: u.nom, prenom: u.prenom, telephone: u.telephone || null,
        centre_id: centre_id || null,
        type_cours: type_cours || "en_ligne",
        type_semaine: type_semaine || "semaine",
        quota_jour: quota_jour || 10,
        jours_travail: jours_travail || ["lundi","mardi","mercredi","jeudi","vendredi"],
        profil: profil || "b2c",
        onboarding_id: onboarding_id || null,
        actif: true,
      }).eq("id", existing.id);
      if (updErr) throw updErr;
      return res.json({ message: "Profil assistante mis à jour", action: "updated" });
    }

    // Création
    const { error: insErr } = await supabase.from("assistantes").insert({
      nom: u.nom, prenom: u.prenom, email: u.email,
      telephone: u.telephone || null,
      centre_id: centre_id || null,
      type_cours: type_cours || "en_ligne",
      type_semaine: type_semaine || "semaine",
      quota_jour: quota_jour || 10,
      jours_travail: jours_travail || ["lundi","mardi","mercredi","jeudi","vendredi"],
      profil: profil || "b2c",
      onboarding_id: onboarding_id || null,
      actif: true,
    });
    if (insErr) throw insErr;

    res.json({ message: "Profil assistante créé", action: "created" });
  } catch (err) {
    console.error("sync-assistante error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/admin/permissions-matrice
   Renvoie la matrice permissions_roles transformée en objet
   { role: { module: { peut_lire, peut_creer, ... } } }
══════════════════════════════════════════════════════════════ */
router.get("/permissions-matrice", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("permissions_roles")
      .select("role,module,peut_lire,peut_creer,peut_modifier,peut_supprimer,peut_gerer")
      .order("role").order("module");
    if (error) throw error;

    const matrice = {};
    for (const row of data) {
      if (!matrice[row.role]) matrice[row.role] = {};
      matrice[row.role][row.module] = {
        read:   row.peut_lire,
        create: row.peut_creer,
        update: row.peut_modifier,
        delete: row.peut_supprimer,
        manage: row.peut_gerer,
      };
    }
    res.json({ matrice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération permissions" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PUT /api/admin/permissions-matrice
   Écrit les permissions d'UN rôle (les 5 droits, module par module).
   Body: { role, permissions: { [module]: { read, create, update, delete, manage } } }
   Rôle = gabarit vivant : la modification s'applique immédiatement à
   tous les utilisateurs actuels de ce rôle (résolution à chaque
   requête dans authenticateAdmin, pas de propagation à faire ici).
══════════════════════════════════════════════════════════════ */
router.put("/permissions-matrice", authenticateAdmin, requirePermission("roles", "manage"), async (req, res) => {
  try {
    const { role, permissions } = req.body;
    if (!role || !permissions || typeof permissions !== "object") {
      return res.status(400).json({ error: "role et permissions requis" });
    }

    const rows = Object.entries(permissions).map(([module, p]) => ({
      role, module,
      peut_lire:      !!p.read,
      peut_creer:     !!p.create,
      peut_modifier:  !!p.update,
      peut_supprimer: !!p.delete,
      peut_gerer:     !!p.manage,
    }));

    const { error } = await supabase.from("permissions_roles").upsert(rows, { onConflict: "role,module" });
    if (error) throw error;

    logAudit({
      acteur_id: req.profil?.id, acteur_nom: `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim(),
      acteur_email: req.profil?.email, acteur_role: req.role,
      // Plateforme déduite du rôle CIBLE (celui dont on modifie les droits), pas de
      // l'acteur (souvent super_admin, qui administre les deux plateformes) - sinon
      // toute modif de permission, même pour un rôle 100% dash, remontait en dur
      // taguée "bet-elearning" (bug historique, corrigé ici).
      plateforme: PLATEFORME_PAR_ROLE[role] || null,
      action_type: "PERMISSIONS_ROLE_MODIFIEES", module: "roles", entite_type: "permissions_roles", entite_id: role,
      detail: `Permissions du rôle "${role}" modifiées (${rows.length} module(s))`, statut: "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur enregistrement permissions" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/admin/permissions-matrice/cloner
   Copie l'intégralité des permissions d'un rôle source vers un rôle
   cible (écrase les droits existants du rôle cible).
   Body: { role_source, role_cible }
══════════════════════════════════════════════════════════════ */
router.post("/permissions-matrice/cloner", authenticateAdmin, requirePermission("roles", "manage"), async (req, res) => {
  try {
    const { role_source, role_cible } = req.body;
    if (!role_source || !role_cible) return res.status(400).json({ error: "role_source et role_cible requis" });
    if (role_source === role_cible) return res.status(400).json({ error: "Les deux rôles doivent être différents" });

    const { data: source, error: errSource } = await supabase
      .from("permissions_roles")
      .select("module,peut_lire,peut_creer,peut_modifier,peut_supprimer,peut_gerer")
      .eq("role", role_source);
    if (errSource) throw errSource;
    if (!source?.length) return res.status(404).json({ error: `Aucune permission trouvée pour le rôle "${role_source}"` });

    const rows = source.map(r => ({ ...r, role: role_cible }));
    const { error } = await supabase.from("permissions_roles").upsert(rows, { onConflict: "role,module" });
    if (error) throw error;

    logAudit({
      acteur_id: req.profil?.id, acteur_nom: `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim(),
      acteur_email: req.profil?.email, acteur_role: req.role,
      plateforme: PLATEFORME_PAR_ROLE[role_cible] || null,
      action_type: "PERMISSIONS_ROLE_CLONEES", module: "roles", entite_type: "permissions_roles", entite_id: role_cible,
      detail: `Permissions clonées de "${role_source}" vers "${role_cible}" (${rows.length} module(s))`, statut: "warning",
    }).catch(() => {});

    res.json({ ok: true, modules: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur clonage permissions" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET/PUT /api/admin/permissions-exceptions/:userId
   Dérogations par utilisateur - une ligne pour un module remplace
   intégralement les droits du rôle pour ce module, sans toucher aux
   autres utilisateurs du même rôle.
══════════════════════════════════════════════════════════════ */
router.get("/permissions-exceptions/:userId", authenticateAdmin, requirePermission("roles", "manage"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("permission_exceptions")
      .select("module,peut_lire,peut_creer,peut_modifier,peut_supprimer,peut_gerer")
      .eq("utilisateur_id", req.params.userId);
    if (error) throw error;
    res.json({ exceptions: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur récupération exceptions" });
  }
});

router.put("/permissions-exceptions/:userId", authenticateAdmin, requirePermission("roles", "manage"), async (req, res) => {
  try {
    const { module, permissions } = req.body;
    if (!module || !permissions) return res.status(400).json({ error: "module et permissions requis" });

    // accorde_par_id référence utilisateurs(id) - les comptes super_admin historiques
    // n'existent que dans l'ancienne table profils_admin, donc req.profil.id peut ne
    // pas exister dans utilisateurs : on vérifie avant, sinon la FK fait échouer
    // l'upsert (500) dès qu'un super_admin legacy modifie une exception.
    let accordeParId = req.profil?.id || null;
    if (accordeParId) {
      const { data: acteurExiste } = await supabase
        .from("utilisateurs").select("id").eq("id", accordeParId).maybeSingle();
      if (!acteurExiste) accordeParId = null;
    }

    const { error } = await supabase.from("permission_exceptions").upsert({
      utilisateur_id: req.params.userId, module,
      peut_lire: !!permissions.read, peut_creer: !!permissions.create,
      peut_modifier: !!permissions.update, peut_supprimer: !!permissions.delete, peut_gerer: !!permissions.manage,
      accorde_par_id: accordeParId,
    }, { onConflict: "utilisateur_id,module" });
    if (error) throw error;

    // Plateforme déduite du rôle de l'utilisateur CIBLE (celui qui reçoit l'exception),
    // pas de l'acteur (souvent super_admin) - sinon une exception donnée à un rôle 100%
    // dash remontait en dur taguée "bet-elearning" (bug historique, corrigé ici).
    const { data: cible } = await supabase.from("utilisateurs").select("role").eq("id", req.params.userId).maybeSingle();

    logAudit({
      acteur_id: req.profil?.id, acteur_nom: `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim(),
      acteur_email: req.profil?.email, acteur_role: req.role,
      plateforme: PLATEFORME_PAR_ROLE[cible?.role] || null,
      action_type: "PERMISSIONS_EXCEPTION_UTILISATEUR", module: "roles", entite_type: "utilisateurs", entite_id: req.params.userId,
      detail: `Exception de permission ajoutée sur le module "${module}"`, statut: "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur enregistrement exception" });
  }
});

router.delete("/permissions-exceptions/:userId/:module", authenticateAdmin, requirePermission("roles", "manage"), async (req, res) => {
  try {
    const { error } = await supabase.from("permission_exceptions")
      .delete().eq("utilisateur_id", req.params.userId).eq("module", req.params.module);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur suppression exception" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/admin/catalogue-offres
   Retourne toutes les offres actives (en ligne + centres + certifs)
   depuis plateforme_config, groupées par catégorie avec prix parsé
══════════════════════════════════════════════════════════════ */
router.get("/catalogue-offres", authenticateAdmin, async (req, res) => {
  try {
    // Lecture des 4 clés en parallèle
    const [{ data: dEL }, { data: dDom }, { data: dCM }, { data: dCF }] = await Promise.all([
      supabase.from("plateforme_config").select("valeur").eq("key", "offres_en_ligne").maybeSingle(),
      supabase.from("plateforme_config").select("valeur").eq("key", "offres_domicile").maybeSingle(),
      supabase.from("plateforme_config").select("valeur").eq("key", "centres_master").maybeSingle(),
      supabase.from("plateforme_config").select("valeur").eq("key", "certifications_config").maybeSingle(),
    ]);

    // Parseur de prix "30 000 F/mois" / "390 000 FCFA" → number
    const parsePrix = (s) => {
      if (!s || typeof s !== "string") return 0;
      const m = s.replace(/\s/g, "").match(/\d+/);
      return m ? parseInt(m[0], 10) : 0;
    };

    // ── En ligne ──────────────────────────────────────────────
    const offresEnLigne = (Array.isArray(dEL?.valeur) ? dEL.valeur : [])
      .filter(o => o.actif !== false)
      /* `formules`, `formules_actif` et `type_coaching` DOIVENT suivre : sans eux, le
         sélecteur de formule du formulaire d'inscription manuelle ne s'affichait jamais -
         il lit `formules_actif` sur l'offre du catalogue, et cette projection le
         supprimait. Même défaut que celui corrigé sur la page publique CourseDetail. */
      .map(o => ({ id: o.id || `el_${o.label}`, label: o.label, prix_str: o.prix || "Sur devis", prix_num: parsePrix(o.prix), categorie: "en_ligne", icon: o.icon || "💻",
        type_coaching: o.type_coaching || "groupe", formules: o.formules || [], formules_actif: o.formules_actif === true }));

    // ── À domicile ────────────────────────────────────────────
    const offresDomicile = (Array.isArray(dDom?.valeur) ? dDom.valeur : [])
      .filter(o => o.actif !== false)
      .map(o => ({ id: o.id || `dom_${o.label}`, label: o.label, prix_str: o.prix || "Sur devis", prix_num: parsePrix(o.prix), categorie: "domicile", icon: o.icon || "🏠",
        type_coaching: o.type_coaching || "groupe", formules: o.formules || [], formules_actif: o.formules_actif === true }));

    // ── Centres - dédoublonner par id d'offre ─────────────────
    const seenCentre = new Set();
    const offrescentres = [];
    const centres = Array.isArray(dCM?.valeur) ? dCM.valeur : [];
    for (const c of centres) {
      if (!c.actif) continue;
      for (const o of (c.offres || [])) {
        if (o.actif === false || seenCentre.has(o.id)) continue;
        seenCentre.add(o.id);
        offrescentres.push({ id: o.id, label: o.label, prix_str: o.prix || "Sur devis", prix_num: parsePrix(o.prix), categorie: "presentiel", icon: o.icon || "🏢",
          type_coaching: o.type_coaching || "groupe", formules: o.formules || [], formules_actif: o.formules_actif === true });
      }
    }

    // ── Certifications ────────────────────────────────────────
    const certifMap = dCF?.valeur || {};
    const offresertifs = Object.entries(certifMap).map(([k, v]) => ({
      id:       `certif_${k}`,
      label:    v.name || k.toUpperCase(),
      prix_str: v.price || "Sur devis",
      prix_num: parsePrix(v.price),
      categorie:"certification",
      icon:     "📜",
    }));

    res.json({ offres: [...offresDomicile, ...offresEnLigne, ...offrescentres, ...offresertifs] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/admin/diagnostic?email=xxx&secret=yyy
   Diagnostique l'état du compte pour un email donné
   (auth.users + utilisateurs + profils_admin + app_metadata)
══════════════════════════════════════════════════════════════ */
router.get("/diagnostic", async (req, res) => {
  try {
    const { email, secret } = req.query;
    // Pas de valeur par défaut : un secret codé en dur dans le repo équivaudrait à
    // une porte dérobée super_admin permanente. Sans BOOTSTRAP_SECRET configuré,
    // cette route de récupération reste désactivée plutôt que de retomber sur une
    // valeur connue de quiconque lit le code source.
    const EXPECTED = process.env.BOOTSTRAP_SECRET;
    if (!EXPECTED) return res.status(503).json({ error: "BOOTSTRAP_SECRET non configuré côté serveur" });
    if (secret !== EXPECTED) return res.status(403).json({ error: "Secret incorrect" });
    if (!email) return res.status(400).json({ error: "email requis" });

    // 1. Chercher dans Supabase Auth
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUser = users.find(u => u.email === email);

    if (!authUser) {
      return res.json({ auth: null, utilisateur: null, profil_admin: null,
        diagnostic: "❌ Email introuvable dans Supabase Auth. Vérifiez l'adresse email." });
    }

    // 2. Chercher dans utilisateurs
    const { data: u } = await supabase.from("utilisateurs").select("id,email,nom,prenom,role,actif,scope").eq("id", authUser.id).maybeSingle();

    // 3. Chercher dans profils_admin
    const { data: pa } = await supabase.from("profils_admin").select("id,email,nom,prenom,profil_type,actif").eq("id", authUser.id).maybeSingle();

    const roleAuth = authUser.app_metadata?.role;

    let diagnostic = "";
    if (!u && !pa) diagnostic = "❌ Profil absent de utilisateurs ET profils_admin → c'est la cause du 403. Appeler /bootstrap.";
    else if (u && !u.actif) diagnostic = "⚠️ Profil trouvé dans utilisateurs mais actif=false → appeler /bootstrap pour réactiver.";
    else if (!roleAuth) diagnostic = "⚠️ Profil DB ok mais app_metadata.role absent → appeler /bootstrap pour corriger.";
    else if (roleAuth !== u?.role) diagnostic = `⚠️ Incohérence : role DB=${u?.role} / role auth=${roleAuth} → appeler /bootstrap.`;
    else diagnostic = "✅ Tout semble correct. Essayez de vous reconnecter.";

    res.json({
      auth: { id: authUser.id, email: authUser.email, role_app_metadata: roleAuth, confirmed: !!authUser.email_confirmed_at },
      utilisateur: u || null,
      profil_admin: pa || null,
      diagnostic,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/admin/bootstrap
   Corrige le profil super_admin manquant ou incomplet.
   Ne supprime AUCUNE donnée - upsert ciblé sur l'email.
   Corps : { email, secret }
══════════════════════════════════════════════════════════════ */
router.post("/bootstrap", async (req, res) => {
  try {
    const { email, secret } = req.body;
    // Idem /diagnostic ci-dessus : aucune valeur par défaut - cette route accorde
    // super_admin, un secret codé en dur serait une backdoor permanente.
    const EXPECTED = process.env.BOOTSTRAP_SECRET;
    if (!EXPECTED) return res.status(503).json({ error: "BOOTSTRAP_SECRET non configuré côté serveur" });
    if (secret !== EXPECTED) return res.status(403).json({ error: "Secret incorrect" });
    if (!email) return res.status(400).json({ error: "email requis" });

    // 1. Trouver dans Supabase Auth
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw listErr;
    const authUser = users.find(u => u.email === email);
    if (!authUser) return res.status(404).json({ error: `Aucun compte Supabase Auth trouvé pour ${email}` });

    // 2. Corriger app_metadata.role
    await supabase.auth.admin.updateUserById(authUser.id, {
      app_metadata: { ...authUser.app_metadata, role: "super_admin", actif: true },
    });

    // 3. Récupérer le profil existant (pour ne pas écraser ses données)
    const { data: existing } = await supabase.from("utilisateurs").select("*").eq("id", authUser.id).maybeSingle();

    const nom    = existing?.nom    || authUser.user_metadata?.nom    || email.split("@")[0];
    const prenom = existing?.prenom || authUser.user_metadata?.prenom || "Admin";

    // 4. Upsert - seuls role/actif/scope sont forcés, le reste est conservé
    const { data: profil, error: upsertErr } = await supabase
      .from("utilisateurs")
      .upsert({
        ...(existing || {}),        // garde toutes les données existantes
        id:          authUser.id,
        email:       authUser.email,
        nom,
        prenom,
        role:        "super_admin",
        scope:       existing?.scope || ["national"],
        departement: existing?.departement || "Direction Générale",
        actif:       true,
        mdp_temporaire: existing?.mdp_temporaire ?? false,
      }, { onConflict: "id" })
      .select()
      .single();

    if (upsertErr) throw upsertErr;

    res.json({
      message: `✅ Super Admin activé pour ${email} - reconnectez-vous sur /login-admin`,
      action:  existing ? "mise_a_jour" : "creation",
      profil:  { id: profil.id, email: profil.email, role: profil.role, actif: profil.actif, scope: profil.scope },
    });
  } catch (err) {
    console.error("Bootstrap error:", err);
    res.status(500).json({ error: err.message || "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET  /api/admin/parametres/:cle   - lire un paramètre JSON
   PUT  /api/admin/parametres/:cle   - sauvegarder un paramètre
══════════════════════════════════════════════════════════════ */
router.get("/parametres/:cle", authenticateAdmin, async (req, res) => {
  try {
    const { data } = await supabase
      .from("parametres")
      .select("valeur, updated_at")
      .eq("cle", req.params.cle)
      .maybeSingle();
    res.json({ valeur: data?.valeur || null, updated_at: data?.updated_at || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/parametres/:cle", authenticateAdmin, async (req, res) => {
  try {
    const { valeur } = req.body;
    if (valeur === undefined) return res.status(400).json({ error: "valeur requise" });
    const { error } = await supabase
      .from("parametres")
      .upsert({ cle: req.params.cle, valeur, updated_at: new Date().toISOString() }, { onConflict: "cle" });
    if (error) throw error;
    await supabase.from("audit_admin").insert({
      acteur_id:  req.profil.id,
      acteur_nom: `${req.profil.prenom} ${req.profil.nom}`,
      action:     "PARAMETRE_MAJ",
      detail:     `Paramètre "${req.params.cle}" mis à jour`,
      statut:     "success",
    }).then(() => {}).catch(() => {});
    res.json({ message: "Paramètre sauvegardé ✓" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/admin/plateforme-config/:key  (public - lecture seule)
   Retourne la valeur d'une clé de plateforme_config
══════════════════════════════════════════════════════════════ */
router.get("/plateforme-stats", authenticateAdmin, async (req, res) => {
  try {
    const [
      { count: totalApprenantsActifs },
      { data: paiements },
      { count: totalCertifications },
      { count: certificationsValides },
    ] = await Promise.all([
      // Total réel d'apprenants dash (jonction groupes_apprenants) - jamais groupes.nb_apprenants,
      // un compteur dénormalisé pas toujours maintenu à jour.
      supabase.from("groupes_apprenants").select("id", { count: "exact", head: true }).eq("statut", "actif"),
      supabase.from("paiements_parcours").select("montant_recu"),
      supabase.from("certifications").select("id", { count: "exact", head: true }),
      supabase.from("certifications").select("id", { count: "exact", head: true }).eq("valide", true),
    ]);

    const caTotal = (paiements || []).reduce((s, p) => s + (Number(p.montant_recu) || 0), 0);

    res.json({
      total_apprenants: totalApprenantsActifs || 0,
      ca_annuel: caTotal,
      total_certifications: totalCertifications || 0,
      taux_reussite_certifications: totalCertifications ? Math.round((certificationsValides / totalCertifications) * 100) : null,
    });
  } catch (err) {
    console.error("[plateforme-stats]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/plateforme-config/:key", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("plateforme_config")
      .select("valeur")
      .eq("key", req.params.key)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Clé introuvable" });
    res.json({ valeur: data.valeur });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   PUT /api/admin/plateforme-config/:key  (staff, permission "configuration")
   Écrit une clé de plateforme_config - remplace les écritures directes
   depuis le frontend (dash/SuperAdminDashboard, AdminDashboard) qui
   contournaient tout contrôle de permission. Restreint à une liste
   blanche de clés "Catalogue" pour ne pas devenir une écriture libre
   vers plateforme_config.
══════════════════════════════════════════════════════════════ */
const PLATEFORME_CONFIG_KEYS_AUTORISEES = [
  "offres_en_ligne", "offres_domicile", "service_interpretariat", "service_traduction",
  "coaching_prive_config", "catalogue_pdf", "course_apercu_config", "certifications_config",
  "centres_master", "centres_wa", "parcours_entreprise",
];

// Clé "parcours_entreprise" → module "communication" (config du bloc Parcours
// Entreprise), toutes les autres clés (catalogue/offres/centres) → "offres_catalogue".
const PLATEFORME_CONFIG_MODULE_PAR_CLE = { parcours_entreprise: "communication" };

router.put("/plateforme-config/:key", authenticateAdmin, async (req, res, next) => {
  const module = PLATEFORME_CONFIG_MODULE_PAR_CLE[req.params.key] || "offres_catalogue";
  return requirePermission(module, "update")(req, res, next);
}, async (req, res) => {
  try {
    const { key } = req.params;
    if (!PLATEFORME_CONFIG_KEYS_AUTORISEES.includes(key)) {
      return res.status(400).json({ error: "Clé non autorisée pour cette route" });
    }
    const { valeur } = req.body;
    if (valeur === undefined) return res.status(400).json({ error: "valeur requise" });

    const { data, error } = await supabase
      .from("plateforme_config")
      .upsert({ key, valeur, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
