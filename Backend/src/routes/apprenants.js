import express from "express";
import fetch from "node-fetch";
import { bornerAFenetre } from "../services/lectureSequentielle.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";
import { sendApprenantWelcomeEmail, sendParentWelcomeEmail, sendNotificationEmail, sendContactNotificationEmail } from "../services/emailService.js";
import { bloquerAcces, debloquerAcces, catalogueMotifs, propagerALaFamille } from "../services/blocageAcces.js";
import { assurerActiviteDuJour, attribuerPoints } from "../services/gamificationDash.js";
import { enrichirPaiementsAvecTouchPoint } from "../utils/enrichirPaiementsTouchpoint.js";
import { notifyRole, notifyUser, notifyOnboarding, ROLES_SUPERVISION_GLOBALE } from "../services/notifyRole.js";
import { contexteMarquage, noterLectureEnCache, MOTIF } from "../services/lectureSequentielle.js";
import { utilisateurDuJeton } from "../services/cacheAuth.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadRendu = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const CINETPAY_APIKEY  = process.env.CINETPAY_APIKEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const FRONTEND_URL     = process.env.FRONTEND_URL || "http://localhost:3001";
const BACKEND_URL      = process.env.BACKEND_URL  || "http://localhost:5001";

const router = express.Router();

// Normalize phone: strip non-digits, remove leading 00
export function normalizePhone(tel) {
  if (!tel) return "";
  return String(tel).replace(/\D/g, "").replace(/^00/, "");
}

// Slug ASCII simple depuis un nom (pour différencier plusieurs personnes qui partagent
// le même téléphone - ex : un enfant et son parent, ou plusieurs enfants du même parent)
function slugify(str) {
  return String(str || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
}

// Generate a deterministic virtual email from phone number. `seed` (ex: nom complet) permet
// de distinguer plusieurs comptes qui partagent le même numéro de téléphone.
// N'utiliser QUE lorsque ce téléphone appartient réellement à la personne concernée -
// jamais pour un enfant dont le seul numéro connu est celui de son parent (voir
// `identifiantTechniqueApprenant` ci-dessous), sous peine de rendre ambiguë toute future
// recherche de compte par téléphone (le parent pourrait retomber sur le compte de l'enfant).
export function phoneToVirtualEmail(tel, seed) {
  const digits = normalizePhone(tel);
  const slug   = seed ? slugify(seed) : "";
  if (digits && slug) return `tel.${digits}.${slug}@betacademy.app`;
  if (digits)         return `tel.${digits}@betacademy.app`;
  if (slug)           return `id.${slug}@betacademy.app`;
  return `tel.${digits}@betacademy.app`;
}

// Identifiant technique pour un enfant sans email/téléphone qui lui soit propre (tout ce
// qu'on connaît de lui appartient à son parent) : <nom>@betacademy.app. Jamais basé sur un
// numéro de téléphone humain, pour qu'aucune recherche par téléphone ne puisse confondre ce
// compte avec celui d'un parent. En cas d'homonymie, un suffixe numérique est ajouté.
export async function identifiantTechniqueApprenant(seed) {
  const base = slugify(seed) || "eleve";
  let candidate = `${base}@betacademy.app`;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase.from("utilisateurs").select("id").eq("email", candidate).maybeSingle();
    if (!data) return candidate;
    n += 1;
    candidate = `${base}${n}@betacademy.app`;
  }
}

// Determine if a string is a valid real email
export function isRealEmail(str) {
  return !!str && str.includes("@") && !str.endsWith("@betacademy.app");
}

// ── POST /api/apprenants/resolve-phone-parent ─────────────────────
// Résout un numéro de téléphone parent vers l'email de connexion Supabase
// Utilisé pour la connexion parent par téléphone dans LoginParent
router.post("/resolve-phone-parent", async (req, res) => {
  try {
    const { telephone } = req.body;
    if (!telephone) return res.status(400).json({ error: "Numéro de téléphone requis" });

    // Normalise : retire espaces, tirets, points, parenthèses, puis strip indicatif +225 / 00225
    const norm = (t) => {
      let n = (t || '').replace(/[\s\-\.\(\)\+]/g, '');
      if (n.startsWith('225')) n = n.slice(3);
      if (n.startsWith('00225')) n = n.slice(5);
      return n;
    };
    const telNorm = norm(telephone);
    if (telNorm.length < 6) return res.status(400).json({ error: "Numéro invalide" });

    // Récupère tous les enregistrements avec un telephone_parent (petit volume)
    const { data: rows, error } = await supabase
      .from('classes_elearning_apprenants')
      .select('email, email_parent, telephone_parent, profil_type, statut')
      .not('telephone_parent', 'is', null)
      .neq('statut', 'suspendu');

    if (error) return res.status(500).json({ error: "Erreur base de données" });

    const found = (rows || []).find(r => norm(r.telephone_parent) === telNorm);
    if (!found) {
      return res.status(404).json({ error: "Aucun compte parent trouvé pour ce numéro de téléphone" });
    }

    // L'email de connexion Supabase pour ce parent
    // (email_parent si compte séparé, ou email si cas enfant sans email propre)
    const loginEmail = found.email_parent || found.email;
    return res.json({ email: loginEmail });
  } catch (err) {
    console.error("[resolve-phone-parent]", err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── GET /api/apprenants/check-eligibilite ─────────────────────────
// Vérifie si l'apprenant a passé son test de niveau ET a une classe assignée
// Utilisé après le login pour décider d'accorder ou non l'accès à l'espace
router.get("/check-eligibilite", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.json({ eligible: false, raison: "non_authentifie" });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.json({ eligible: false, raison: "token_invalide" });

    const email = user.email;

    // 0. Vérifier si le compte est suspendu via app_metadata (priorité absolue)
    const appMeta = user.app_metadata || {};
    if (appMeta.acces_bloque) {
      const type = appMeta.type_suspension || 'momentanee';
      const raison = type === 'definitive' ? 'acces_suspendu_definitif' : 'acces_suspendu_momentane';
      return res.json({ eligible: false, raison, motif: appMeta.motif_suspension || null });
    }

    // 1. Vérifie inscription e-learning avec test + classe assignée
    const { data: insc } = await supabase
      .from("inscriptions_elearning")
      .select("id, niveau_detecte, classe_id, statut")
      .ilike("email", email)
      .not("niveau_detecte", "is", null)
      .not("classe_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (insc) return res.json({ eligible: true, raison: null });

    // 2. Vérifie présence directe dans une classe e-learning (non suspendue)
    const { data: classeApp } = await supabase
      .from("classes_elearning_apprenants")
      .select("id, statut, niveau_cecr, email_parent, profil_type")
      .ilike("email", email)
      .neq("statut", "suspendu")
      .limit(1)
      .maybeSingle();

    if (classeApp) {
      // Cas enfant sans email propre : email de connexion = email du parent
      // → la personne qui se connecte EST le parent, pas l'apprenant
      const estParent =
        classeApp.profil_type === 'enfant' &&
        (classeApp.email_parent || '').toLowerCase().trim() === email.toLowerCase().trim();
      return res.json({ eligible: true, raison: null, estParent: estParent || false });
    }

    // 2b. Apprenant suspendu dans la table (mais app_metadata pas encore mis à jour)
    const { data: classeAppSusp } = await supabase
      .from("classes_elearning_apprenants")
      .select("id, statut, notes")
      .ilike("email", email)
      .eq("statut", "suspendu")
      .limit(1)
      .maybeSingle();

    if (classeAppSusp) {
      const definitif = (classeAppSusp.notes || '').includes('[SUSPENSION DÉFINITIVE]');
      return res.json({ eligible: false, raison: definitif ? 'acces_suspendu_definitif' : 'acces_suspendu_momentane', motif: null });
    }

    // 3. Vérifier si test fait mais pas encore de classe
    const { data: inscAvecTest } = await supabase
      .from("inscriptions_elearning")
      .select("id, niveau_detecte, classe_id")
      .ilike("email", email)
      .not("niveau_detecte", "is", null)
      .limit(1)
      .maybeSingle();

    if (inscAvecTest && !inscAvecTest.classe_id) {
      return res.json({ eligible: false, raison: "classe_manquante" });
    }

    // Test non fait du tout
    return res.json({ eligible: false, raison: "test_manquant" });
  } catch (err) {
    console.error("[check-eligibilite]", err.message);
    return res.status(500).json({ eligible: false, raison: "erreur_serveur" });
  }
});

// ── GET /api/apprenants/check-acces ───────────────────────────────
// Vérifie si l'apprenant est suspendu - lit depuis app_metadata (source fiable)
router.get("/check-acces", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.json({ acces_bloque: false });
    const { data: { user }, error } = await supabase.auth.getUser(bearer);
    if (error || !user) return res.json({ acces_bloque: false });
    // app_metadata est la source de vérité (tous les comptes Auth l'ont)
    const { data: authData } = await supabase.auth.admin.getUserById(user.id);
    // Le motif accompagne le booleen : ce chemin sert la connexion par telephone, ou le
    // JWT du client ne porte pas app_metadata a jour. Sans lui, l'apprenant arrivant par
    // ce chemin resterait sur le message generique.
    const meta = authData?.user?.app_metadata || {};
    return res.json({
      acces_bloque:    meta.acces_bloque || false,
      blocage_motif:   meta.blocage_motif || null,
      blocage_message: meta.blocage_message || null,
    });
  } catch {
    return res.json({ acces_bloque: false });
  }
});

// ── GET /api/apprenants/motifs-blocage ────────────────────────────
// Le catalogue vient du serveur, pas d'une liste recopiee dans chaque dashboard : le
// texte affiche a la commerciale est EXACTEMENT celui que lira l'apprenant et que
// recevra son email.
router.get("/motifs-blocage", authenticateAdmin, (req, res) => {
  res.json({ motifs: catalogueMotifs() });
});

// ── PATCH /api/apprenants/:id/suspension ──────────────────────────
// Admin/commercial only: suspendre ou réintégrer un apprenant globalement
router.patch("/:id/suspension", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { bloque, motif, message } = req.body;
  if (typeof bloque !== "boolean") return res.status(400).json({ error: "bloque (boolean) requis" });

  try {
    // Le blocage passe par le service commun : il consigne le motif dans app_metadata
    // (lu par la page de connexion depuis le JWT, sans requête) et prévient l'apprenant
    // par email. Le déblocage efface le motif et remet le compteur d'absences à zéro.
    const resultat = bloque
      ? await bloquerAcces({ apprenantId: id, motif: motif || "manuel", message: message || null })
      : await debloquerAcces({ apprenantId: id });
    if (!resultat.ok) throw new Error(resultat.error);

    /* COACHING PRIVÉ EN FAMILLE : un impayé vaut pour toute la famille.
       Le forfait est global - bloquer le seul payeur pendant que son conjoint et ses
       enfants continuent les séances viderait la sanction de son sens, le coach se
       déplaçant de toute façon. La propagation ne concerne QUE le non-paiement : des
       absences répétées sont le fait d'une personne, en punir sa famille serait absurde.
       Non bloquant : un membre qui échoue n'annule pas l'action sur le payeur. */
    const famille = await propagerALaFamille({
      apprenantId: id,
      bloque,
      motif: motif || "manuel",
      message: message || null,
    });

    const { data: authData } = await supabase.auth.admin.getUserById(id);
    const authUser = authData?.user;
    const meta     = authUser?.user_metadata || {};
    const nom      = meta.nom    || "";
    const prenom   = meta.prenom || "";
    const email    = authUser?.email || "";

    logAudit({
      acteur_id:    req.profil?.id || null,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || null,
      acteur_role:  req.role || "commercial",
      plateforme:   "dash",
      action_type:  bloque ? "APPRENANT_SUSPENDU" : "APPRENANT_REINSTATE",
      module:       "apprenants",
      entite_type:  "user",
      entite_id:    id,
      detail:       `${bloque ? "Suspension" : "Réintégration"} de ${prenom} ${nom} (${email})`,
      statut:       "success",
    }).catch(() => {});

    // Notifier les coachs des groupes de cet apprenant
    (async () => {
      try {
        const { data: groupes, error: gaErr } = await supabase
          .from("groupes_apprenants")
          .select("groupe_id")
          .eq("apprenant_id", id)
          .eq("statut", "actif");
        console.log(`[suspension notif] apprenant_id=${id} groupes_apprenants:`, groupes?.length, gaErr?.message);
        if (!groupes?.length) return;
        const groupeIds = groupes.map(g => g.groupe_id);
        const { data: groupeData, error: gErr } = await supabase
          .from("groupes")
          .select("id, coach_id, nom")
          .in("id", groupeIds)
          .not("coach_id", "is", null);
        console.log(`[suspension notif] groupes avec coach:`, groupeData?.length, gErr?.message);
        const nomComplet = [prenom, nom].filter(Boolean).join(" ") || email;
        const notifs = (groupeData || []).map(g => ({
          user_id: g.coach_id,
          type:    bloque ? "suspension" : "reinstatement",
          titre:   bloque ? `🔒 Apprenant suspendu` : `🔓 Apprenant réintégré`,
          message: bloque
            ? `${nomComplet} a été suspendu(e). Il/Elle n'apparaîtra plus dans les listes de présences de "${g.nom}".`
            : `${nomComplet} a été réintégré(e). Il/Elle réapparaîtra dans les listes de présences de "${g.nom}".`,
          lu:   false,
          meta: { apprenant_id: id, groupe_id: g.id },
          // Destinataire = coach, un rôle dash - pas bet-elearning (invisible dans sa
          // cloche sinon, cf. correctif du même bug sur notifyRole.js et groupes.js).
          source: 'dash',
        }));
        console.log(`[suspension notif] notifs à insérer:`, notifs.length, notifs.map(n => n.user_id));
        if (notifs.length) {
          const { error: nErr } = await supabase.from("notifications").insert(notifs);
          console.log(`[suspension notif] insert résultat:`, nErr?.message || "OK");
        }
        // Notifier l'apprenant lui-même
        await supabase.from("notifications").insert({
          user_id: id,
          type:    bloque ? "alerte" : "info",
          titre:   bloque ? "🔒 Accès suspendu" : "🔓 Accès rétabli",
          message: bloque
            ? "Votre accès à la plateforme a été suspendu. Veuillez contacter votre conseiller."
            : "Votre accès à la plateforme a été rétabli. Vous pouvez vous reconnecter.",
          lu:   false,
          meta: {},
          source: 'bet-elearning',
        });

        // PA + onboarding - jamais notifiés jusqu'ici (seuls le coach du groupe et
        // l'apprenant l'étaient), alors que le PA suit ce dossier pédagogiquement et
        // l'onboarding a géré son affectation initiale.
        const { data: asg } = await supabase
          .from("assignations_parcours")
          .select("pa_advisor_id, onboarding_id")
          .ilike("prospect_email", email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const payloadSuivi = {
          type:  bloque ? "suspension" : "reinstatement",
          titre: bloque ? "🔒 Apprenant suspendu" : "🔓 Apprenant réintégré",
          message: bloque
            ? `${nomComplet} a été suspendu(e) après 4 absences consécutives.`
            : `${nomComplet} a été réintégré(e) - accès restauré.`,
          meta: { apprenant_id: id },
          // 'dash' et non 'bet-elearning' : la cloche du dash appelle toujours
          // ?source=dash, la notification y etait donc invisible pour tout le monde -
          // y compris le PA, qui en est pourtant destinataire depuis l'origine.
          source: 'dash',
        };
        if (asg?.pa_advisor_id) await notifyUser(asg.pa_advisor_id, payloadSuivi).catch(() => {});
        else await notifyRole(["pedagogical_advisor", "admin_pa_advisor"], payloadSuivi).catch(() => {});
        // Le superviseur general, dans tous les cas : une suspension pour absences
        // repetees est un signal sur la classe autant que sur l'apprenant.
        await notifyRole(ROLES_SUPERVISION_GLOBALE, payloadSuivi).catch(() => {});
        await notifyOnboarding(asg?.onboarding_id, payloadSuivi).catch(() => {});
      } catch (e) {
        console.error("[suspension notif] erreur:", e.message);
      }
    })();

    /* `famille` remonte au client pour qu'il puisse le DIRE. Bloquer trois personnes d'un
       geste sans l'annoncer serait une surprise désagréable, et l'assistante découvrirait
       l'étendue de son action par les appels des intéressés. */
    return res.json({ ok: true, acces_bloque: bloque, famille });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apprenants/login-lookup?identifier=xxx ───────────────
// Public endpoint: resolves phone/email to the Supabase account email
router.get("/login-lookup", async (req, res) => {
  const { identifier } = req.query;
  if (!identifier) return res.status(400).json({ error: "identifier requis" });

  try {
    const trimmed = identifier.trim();

    // If it looks like a real email, return as-is (verify it exists)
    if (trimmed.includes("@") && !trimmed.endsWith("@betacademy.app")) {
      const { data: u } = await supabase
        .from("utilisateurs")
        .select("email")
        .ilike("email", trimmed)
        .eq("role", "apprenant")
        .maybeSingle();
      if (u) return res.json({ email: u.email, login_type: "email", found: true });
      // Allow it anyway - Supabase will reject if not found
      return res.json({ email: trimmed, login_type: "email", found: false });
    }

    // Treat as phone number
    const digits = normalizePhone(trimmed);
    if (!digits) return res.status(400).json({ error: "Identifiant invalide" });

    // 1. Try virtual email pattern
    const virtualEmail = `tel.${digits}@betacademy.app`;
    const { data: byVirtual } = await supabase
      .from("utilisateurs")
      .select("email, telephone")
      .eq("email", virtualEmail)
      .eq("role", "apprenant")
      .maybeSingle();
    if (byVirtual) return res.json({ email: byVirtual.email, login_type: "telephone", found: true });

    // 2. Try by telephone column (various formats stored)
    const { data: byPhone, error: phoneErr } = await supabase
      .from("utilisateurs")
      .select("email, telephone")
      .eq("role", "apprenant")
      .not("email", "like", "tel.%@betacademy.app") // already covered above
      .ilike("telephone", `%${digits.slice(-8)}%`)  // match last 8 digits
      .maybeSingle();
    if (byPhone) return res.json({ email: byPhone.email, login_type: "telephone", found: true });

    return res.status(404).json({ error: "Aucun compte trouvé avec cet identifiant" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apprenants/profil-acces?email=xxx ─────────────────
router.get("/profil-acces", authenticateAdmin, async (req, res) => {
  const { email, telephone, apprenant_id, assignation_id } = req.query;

  const PROFIL_FIELDS = "id, email, nom, prenom, actif, acces_bloque, role, mdp_temporaire, mdp_initial, date_creation, telephone, avatar_url, adresse";

  // utilisateurs.acces_bloque n'est écrit nulle part (ni la suspension auto après 4
  // absences, ni le bouton manuel PATCH /:id/suspension, ne touchent cette colonne -
  // seul app_metadata côté Supabase Auth est mis à jour) : elle reste bloquée à sa
  // valeur d'origine pour toujours. Cette correction n'existait que sur UN des 4 chemins
  // de retour de cette route (celui par email/téléphone) ; le chemin assignation_id,
  // systématiquement emprunté en premier par CommercialDashboard.jsx (qui envoie toujours
  // assignation_id), la contournait entièrement - d'où le bouton "Débloquer" absent alors
  // que le message "Accès bloqué" (lui basé sur /acces-status, correct) s'affichait bien.
  const avecAccesBloqueReel = async (profil) => {
    if (!profil) return profil;
    const { data: authData } = await supabase.auth.admin.getUserById(profil.id).catch(() => ({ data: null }));
    profil.acces_bloque = authData?.user?.app_metadata?.acces_bloque || false;
    return profil;
  };

  let query = supabase
    .from("utilisateurs")
    .select(PROFIL_FIELDS);

  if (assignation_id) {
    // Lien fiable posé dans groupes_apprenants.note à la création de la classe - indispensable
    // pour un profil enfant, où l'email/téléphone connu sur le dossier est celui du PARENT,
    // jamais celui de l'enfant. Sans ce lien, impossible de retrouver le compte réel de
    // l'enfant depuis une liste (assignations_parcours) qui ne connaît que ses coordonnées.
    const { data: gaRows } = await supabase
      .from("groupes_apprenants")
      .select("apprenant_id, email_apprenant")
      .ilike("note", `%${assignation_id}%`);
    const ga = (gaRows || []).find(row => {
      try { return JSON.parse(row.note || "{}").assignation_id === assignation_id; } catch { return false; }
    }) || gaRows?.[0];
    if (ga?.apprenant_id) {
      const { data: profil } = await supabase.from("utilisateurs").select(PROFIL_FIELDS).eq("id", ga.apprenant_id).eq("role", "apprenant").maybeSingle();
      if (profil) return res.json({ has_account: true, profil: await avecAccesBloqueReel(profil) });
    }
    if (ga?.email_apprenant) {
      const { data: profil } = await supabase.from("utilisateurs").select(PROFIL_FIELDS).ilike("email", ga.email_apprenant).eq("role", "apprenant").maybeSingle();
      if (profil) return res.json({ has_account: true, profil: await avecAccesBloqueReel(profil) });
    }
    // Rien trouvé via le lien fiable - repli sur email/téléphone/apprenant_id si fournis
    // (ex: adulte dont prospect_email est bien son propre email de connexion), sinon "aucun
    // compte" (ex: enfant pas encore inscrit en classe, donc pas encore de ga à résoudre).
    if (!email && !telephone && !apprenant_id) return res.json({ has_account: false, profil: null });
  }

  if (apprenant_id) {
    // Recherche directe par id - nécessaire pour un enfant dont l'identifiant de connexion
    // (ex: <nom>@betacademy.app) ne correspond à aucun email/téléphone connu par ailleurs
    // (l'email/téléphone affiché sur la fiche est celui du parent, jamais celui du login).
    const { data: profil } = await supabase.from("utilisateurs").select(PROFIL_FIELDS).eq("id", apprenant_id).eq("role", "apprenant").maybeSingle();
    return res.json({ has_account: !!profil, profil: profil ? await avecAccesBloqueReel(profil) : null });
  } else if (email) {
    // Ne jamais afficher ici un compte d'un autre rôle (parent, coach…) qui partagerait
    // le même email - cet endpoint sert uniquement à vérifier l'accès de l'apprenant.
    query = query.ilike("email", email.trim()).eq("role", "apprenant");
  } else if (telephone) {
    const digits = normalizePhone(telephone);
    // Try virtual email or telephone column
    const virtualEmail = phoneToVirtualEmail(telephone);
    const [{ data: byVirtual }, { data: byPhone }] = await Promise.all([
      supabase.from("utilisateurs").select(PROFIL_FIELDS).eq("email", virtualEmail).maybeSingle(),
      supabase.from("utilisateurs").select(PROFIL_FIELDS).ilike("telephone", `%${digits.slice(-8)}%`).eq("role","apprenant").maybeSingle(),
    ]);
    const profil = byVirtual || byPhone;
    return res.json({ has_account: !!profil, profil: profil ? await avecAccesBloqueReel(profil) : null });
  } else {
    return res.status(400).json({ error: "email ou telephone requis" });
  }

  const { data: profil, error: profilErr } = await query.maybeSingle();
  console.log(`[profil-acces] email=${email} found=${!!profil} id=${profil?.id} err=${profilErr?.message}`);

  if (profil) {
    return res.json({ has_account: true, profil: await avecAccesBloqueReel(profil) });
  }

  // Fallback : vérifier dans Supabase Auth (cas où utilisateurs INSERT a raté).
  // Ne jamais renvoyer un compte d'un autre rôle explicite (parent, coach…) - même garde que
  // ci-dessus, appliquée ici à app_metadata.role puisqu'il n'y a pas de ligne utilisateurs.
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUser = (listData?.users || []).find(u =>
    u.email?.toLowerCase() === email.trim().toLowerCase()
    && (!u.app_metadata?.role || u.app_metadata.role === "apprenant")
  );
  if (authUser) {
    const meta     = authUser.user_metadata || {};
    const appMeta  = authUser.app_metadata  || {};
    return res.json({
      has_account: true,
      profil: {
        id:             authUser.id,
        email:          authUser.email,
        nom:            meta.nom    || "",
        prenom:         meta.prenom || "",
        telephone:      meta.telephone || null,
        actif:          true,
        acces_bloque:   appMeta.acces_bloque || false,
        role:           "apprenant",
        // Compte trouvé uniquement dans Supabase Auth, sans ligne "utilisateurs" - cela signifie
        // qu'il vient de l'auto-inscription sur le site public (mot de passe choisi par la
        // personne elle-même, éventuellement via Google). Ce n'est jamais un mot de passe
        // temporaire généré par le staff : ne jamais l'annoncer comme tel (cf. creerAccesApprenantCore
        // qui s'appuie sur ce même signal pour ne jamais écraser ce mot de passe réel).
        mdp_temporaire: false,
        mdp_initial:    null,
        created_at:     authUser.created_at,
        _source:        "auth_only",
      },
    });
  }

  return res.json({ has_account: false, profil: null });
});

// ── GET /api/apprenants/parent-acces?email=xxx ──────────────────
// Identifiants de connexion du COMPTE PARENT (role="parent") - utilisé côté PA
// Advisor/Onboarding pour afficher, en plus des accès de l'enfant, ceux de son parent
// quand le dossier est profil_type="enfant". Lecture seule (pas de création/renvoi ici).
router.get("/parent-acces", authenticateAdmin, async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "email requis" });

  const PROFIL_FIELDS = "id, email, nom, prenom, actif, mdp_temporaire, mdp_initial, telephone, avatar_url";
  const { data: profil, error } = await supabase
    .from("utilisateurs")
    .select(PROFIL_FIELDS)
    .ilike("email", email.trim())
    .eq("role", "parent")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ has_account: !!profil, profil: profil || null });
});

// ── GET /api/apprenants/sans-acces ─────────────────────────────
router.get("/sans-acces", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("groupes_apprenants")
      .select("id, nom_apprenant, prenom_apprenant, email_apprenant, telephone, niveau, groupe_id, groupes(nom, filiere)")
      .is("apprenant_id", null)
      .or("email_apprenant.not.is.null,telephone.not.is.null")
      .eq("statut", "actif")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ apprenants: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/apprenants/creer-acces-bulk ──────────────────────
router.post("/creer-acces-bulk", authenticateAdmin, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "items[] requis" });

  const results = [];
  for (const item of items) {
    if (!item.nom) { results.push({ status: "skip", reason: "nom manquant" }); continue; }
    if (!item.email && !item.telephone) { results.push({ nom: item.nom, status: "skip", reason: "email et téléphone manquants" }); continue; }
    try {
      const useEmail   = isRealEmail(item.email);
      const loginEmail = useEmail ? item.email.toLowerCase().trim() : phoneToVirtualEmail(item.telephone);
      const loginType  = useEmail ? "email" : "telephone";
      const mdpTemp    = "BET@" + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(6, "X") + "!";
      let uid = null;
      // true si le compte a déjà un mot de passe réel (auto-inscription site web/Google avant
      // l'import) - jamais l'écraser ni l'annoncer comme "temporaire" (même garde que
      // creerAccesApprenantCore).
      let motDePasseDejaReel = false;

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: loginEmail, password: mdpTemp, email_confirm: true,
        app_metadata: { role: "apprenant", actif: true },
        user_metadata: { nom: item.nom, prenom: item.prenom || "", telephone: item.telephone || null },
      });

      if (authError) {
        if (authError.message?.toLowerCase().includes("already")) {
          const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          const ex = (listData?.users || []).find(u => u.email?.toLowerCase() === loginEmail);
          if (ex) uid = ex.id;
          else { results.push({ email: loginEmail, status: "error", reason: authError.message }); continue; }
        } else { results.push({ email: loginEmail, status: "error", reason: authError.message }); continue; }
      } else if (authData?.user?.id) {
        uid = authData.user.id;
      } else { results.push({ email: loginEmail, status: "error", reason: "user_id absent" }); continue; }

      const { data: ex2 } = await supabase.from("utilisateurs").select("id, mdp_temporaire").eq("id", uid).maybeSingle();
      if (!ex2) {
        await supabase.from("utilisateurs").insert({
          id: uid, email: loginEmail, nom: item.nom, prenom: item.prenom || "",
          telephone: item.telephone || null, role: "apprenant", actif: true,
          mdp_temporaire: true, mdp_initial: mdpTemp, cree_par_id: req.profil?.id || null,
        });
      } else {
        motDePasseDejaReel = ex2.mdp_temporaire === false;
      }

      if (item.ga_id) {
        await supabase.from("groupes_apprenants").update({ apprenant_id: uid }).eq("id", item.ga_id);
      }

      if (useEmail) {
        await sendApprenantWelcomeEmail({ prenom: item.prenom || "", nom: item.nom, email: loginEmail, mdpTemp, compteExistant: motDePasseDejaReel }).catch(() => {});
      }
      results.push({ login_email: loginEmail, login_type: loginType, status: "ok", user_id: uid });
    } catch (e) {
      results.push({ nom: item.nom, status: "error", reason: e.message });
    }
  }

  const ok  = results.filter(r => r.status === "ok").length;
  const err = results.filter(r => r.status === "error").length;
  return res.json({ message: `${ok} comptes créés, ${err} erreurs`, results });
});

// ── creerAccesApprenantCore ─────────────────────────────────────
// Logique de création d'un compte apprenant, factorisée pour être appelée à la fois depuis
// la route manuelle (POST /creer-acces) et depuis le déclenchement automatique à l'inscription
// en classe (voir POST /:id/apprenants dans groupes.js). Comportement strictement identique à
// l'ancienne route inline - pur refactor, `acteur` remplace `req.profil`/`req.role`/`req.ip`.
// Retourne { ok:true, data } ou { ok:false, status, error }.
export async function creerAccesApprenantCore({ nom, prenom, email, telephone, ga_id, cea_id, email_parent, telephone_parent, acteur = {} }) {
  if (!nom) {
    return { ok: false, status: 400, error: "Champ requis : nom" };
  }

  // Si l'email/le téléphone fourni pour l'enfant est en réalité celui du parent (le champ
  // retombe sur ses coordonnées faute de mieux), ne pas le réutiliser comme identifiant réel :
  // cela le rendrait indisponible pour le compte du parent, et rendrait ambiguë toute future
  // recherche de compte par téléphone (le parent pourrait retomber sur le compte de l'enfant).
  const emailEstCeluiDuParent = isRealEmail(email) && email_parent
    && email.toLowerCase().trim() === String(email_parent).toLowerCase().trim();
  const telEstCeluiDuParent = telephone && telephone_parent
    && normalizePhone(telephone) === normalizePhone(telephone_parent);

  // Même si l'email n'est pas explicitement celui du parent, il peut déjà appartenir à un
  // compte d'un AUTRE rôle (parent créé séparément, coach, staff…). Ne jamais réutiliser/
  // détourner ce compte comme login de l'enfant - on bascule aussi vers l'identifiant technique.
  let emailAppartientAutreRole = false;
  if (isRealEmail(email) && !emailEstCeluiDuParent) {
    const { data: existingRole } = await supabase.from("utilisateurs").select("role").ilike("email", email.trim()).maybeSingle();
    if (existingRole?.role && existingRole.role !== "apprenant") emailAppartientAutreRole = true;
  }

  const useEmail   = isRealEmail(email) && !emailEstCeluiDuParent && !emailAppartientAutreRole;
  const usePhone   = !useEmail && !!telephone && !telEstCeluiDuParent;
  const enfantSeed = `${prenom || ""} ${nom || ""}`.trim();

  if (!useEmail && !usePhone && !enfantSeed) {
    return { ok: false, status: 400, error: "Fournir un email, un téléphone propre à l'enfant, ou son nom" };
  }

  // Si un compte technique (<nom>@betacademy.app) existe déjà pour CETTE fiche (ga_id), le
  // réutiliser plutôt que d'en générer un nouveau. Sans ça, chaque nouvel appel - l'auto-création
  // à l'ajout en classe (POST /:id/apprenants), puis un "Créer/Renvoyer les accès" manuel plus
  // tard - regénère un identifiant différent (identifiantTechniqueApprenant ajoute un suffixe
  // numérique dès que le premier existe), et le compte apprenant_id de groupes_apprenants finit
  // par pointer vers ce compte tout neuf jamais utilisé, orphelinant celui que l'apprenant a
  // réellement déjà utilisé pour se connecter.
  let compteTechniqueExistant = null;
  if (!useEmail && !usePhone && ga_id) {
    const { data: gaRow } = await supabase.from("groupes_apprenants").select("apprenant_id").eq("id", ga_id).maybeSingle();
    if (gaRow?.apprenant_id) {
      const { data: compteExistant } = await supabase.from("utilisateurs").select("id, email, role").eq("id", gaRow.apprenant_id).maybeSingle();
      if (compteExistant?.role === "apprenant" && compteExistant.email?.endsWith("@betacademy.app") && !compteExistant.email.startsWith("tel.")) {
        compteTechniqueExistant = compteExistant;
      }
    }
  }

  const loginEmail = useEmail ? email.toLowerCase().trim()
    : usePhone ? phoneToVirtualEmail(telephone, enfantSeed)
    : compteTechniqueExistant ? compteTechniqueExistant.email
    : await identifiantTechniqueApprenant(enfantSeed);
  const loginType  = useEmail ? "email" : usePhone ? "telephone" : "technique";
  const loginIdent = useEmail ? loginEmail : usePhone ? telephone : loginEmail; // what to show to user
  const mdpTemp    = "BET@" + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(6, "X") + "!";
  let newUserId = null;
  // true si le compte a déjà un mot de passe réel (auto-inscription site web / Google) qu'il ne
  // faut jamais écraser ni annoncer comme "temporaire" - voir le commentaire plus bas.
  let motDePasseDejaReel = false;

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: loginEmail,
      password: mdpTemp,
      email_confirm: true,
      app_metadata: { role: "apprenant", actif: true },
      user_metadata: { nom, prenom: prenom || "", telephone: telephone || null },
    });

    console.log(`[creer-acces] createUser loginEmail=${loginEmail} error=${authError?.message || "none"} userId=${authData?.user?.id || "none"}`);

    if (authError) {
      const msg = authError.message || "";
      if (msg.toLowerCase().includes("already")) {
        // User exists in Auth - find their ID
        const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        if (listError) {
          console.error("[creer-acces] listUsers error:", listError.message);
          return { ok: false, status: 500, error: "Erreur listUsers : " + listError.message };
        }
        const existing = (listData?.users || []).find(u => u.email?.toLowerCase() === loginEmail);
        if (existing) newUserId = existing.id;
        else {
          // Fallback: search by virtual email in utilisateurs table
          const { data: existingInDb } = await supabase.from("utilisateurs").select("id").eq("email", loginEmail).maybeSingle();
          if (existingInDb) newUserId = existingInDb.id;
          else return { ok: false, status: 400, error: "Identifiant déjà utilisé mais introuvable." };
        }
        // Ne JAMAIS écraser le mot de passe d'un compte qui en a déjà un réel - ce cas couvre
        // l'auto-inscription sur le site public (mot de passe choisi par la personne, éventuellement
        // via Google) : soit il n'existe pas encore de ligne "utilisateurs" (compte auth-only, jamais
        // passé par ce flux), soit mdp_temporaire y est explicitement à false (déjà changé/confirmé).
        // Cette route ne doit régénérer un mot de passe que pour les comptes que le staff a
        // lui-même créés (ex: enfants/ados sans email propre) et dont le mot de passe est encore
        // le temporaire d'origine.
        if (newUserId) {
          const { data: compteExistant } = await supabase
            .from("utilisateurs").select("mdp_temporaire").eq("id", newUserId).maybeSingle();
          motDePasseDejaReel = !compteExistant || compteExistant.mdp_temporaire === false;
          if (!motDePasseDejaReel) {
            await supabase.auth.admin.updateUserById(newUserId, { password: mdpTemp, email_confirm: true });
          }
        }
      } else {
        return { ok: false, status: 400, error: authError.message };
      }
    } else if (authData?.user?.id) {
      newUserId = authData.user.id;
    } else {
      return { ok: false, status: 500, error: "Création Auth sans erreur mais user_id absent" };
    }

    // Check by ID first, then by email (covers case where email exists with different UUID)
    const { data: existingById }    = await supabase.from("utilisateurs").select("id").eq("id", newUserId).maybeSingle();
    const { data: existingByEmail } = await supabase.from("utilisateurs").select("id").ilike("email", loginEmail).maybeSingle();

    console.log(`[creer-acces] existingById=${existingById?.id || "none"} existingByEmail=${existingByEmail?.id || "none"}`);

    const updatePayload = motDePasseDejaReel
      ? { nom, prenom: prenom || "", telephone: telephone || null, actif: true }
      : { nom, prenom: prenom || "", telephone: telephone || null, actif: true, mdp_temporaire: true, mdp_initial: mdpTemp };

    if (existingById) {
      // Row already exists with the correct UUID - always refresh mdp_initial (sauf mot de passe réel)
      await supabase.from("utilisateurs").update(updatePayload).eq("id", newUserId);
    } else if (existingByEmail) {
      // Email exists with a different UUID - update that row and align UUID
      await supabase.from("utilisateurs").update(updatePayload).eq("id", existingByEmail.id);
      newUserId = existingByEmail.id;
    } else {
      // New user - insert. Si le compte a déjà un mot de passe réel (auto-inscription auth-only,
      // détectée plus haut), ne jamais enregistrer de mdp_initial fictif ni marquer temporaire.
      const { error: insertErr } = await supabase
        .from("utilisateurs")
        .insert({
          id:             newUserId,
          email:          loginEmail,
          nom,
          prenom:         prenom || "",
          telephone:      telephone || null,
          role:           "apprenant",
          actif:          true,
          mdp_temporaire: motDePasseDejaReel ? false : true,
          mdp_initial:    motDePasseDejaReel ? null : mdpTemp,
          cree_par_id:    acteur.id || null,
        });

      if (insertErr) {
        console.error("[creer-acces] insertErr:", insertErr.message);
        if (!authError) await supabase.auth.admin.deleteUser(newUserId).catch(() => {});
        return { ok: false, status: 500, error: "Erreur création profil : " + insertErr.message };
      }
    }

    if (ga_id) {
      // Aligner email_apprenant sur le véritable email de connexion (ex: identifiant technique
      // <nom>@betacademy.app généré pour un enfant sans email propre) - sinon toute recherche
      // faite par email seul (présences, séances, ressources...) ne retrouve plus cette fiche.
      await supabase.from("groupes_apprenants").update({ apprenant_id: newUserId, email_apprenant: loginEmail }).eq("id", ga_id);
    }
    if (cea_id) {
      // Même besoin côté monde bet-elearning (classes_elearning_apprenants) : sans ce lien,
      // apprenant_id reste null et la fiche ne retrouve plus jamais son compte au rechargement
      // (l'email affiché sur la fiche est celui du parent, différent du login réel de l'enfant).
      await supabase.from("classes_elearning_apprenants").update({ apprenant_id: newUserId, email: loginEmail }).eq("id", cea_id);
    }

    // Création automatique du compte parent, si ce dossier est un profil "enfant"
    // avec des coordonnées parent renseignées sur l'assignation d'origine.
    // Best-effort : ne bloque jamais la création du compte apprenant.
    let parentAccountCreated = false;
    let parentAccountError = null;
    if (ga_id) {
      try {
        // Utiliser l'email d'origine (celui reçu dans la requête, avant qu'on ne le remplace
        // ci-dessus par loginEmail) - c'est lui qui correspond à assignations_parcours.prospect_email,
        // pas le nouvel identifiant de connexion (potentiellement technique) de l'enfant.
        // Les coordonnées du parent sont d'abord celles que l'appelant transmet : l'import
        // en masse les a déjà en main (colonnes du fichier) et les passe ici. On ne
        // retombait sur le dossier que par `prospect_email`, NULL pour un enfant - donc ce
        // bloc ne s'exécutait jamais pour un enfant importé, et aucun compte parent n'était
        // créé. Le repli par dossier reste, pour les appels qui ne transmettent rien.
        let infosParent = (email_parent || telephone_parent)
          ? { nom_parent: null, email_parent: email_parent || null, telephone_parent: telephone_parent || null,
              prenom_enfant: null, nom_enfant: null }
          : null;

        if (!infosParent && email) {
          const { data: assignRow } = await supabase
            .from("assignations_parcours")
            .select("profil_type, nom_parent, telephone_parent, email_parent, prenom_enfant, nom_enfant")
            .ilike("prospect_email", email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (assignRow?.profil_type === "enfant") infosParent = assignRow;
        }

        // Complète le nom du parent depuis le dossier rattaché à CETTE ligne de classe
        // (lien fiable, indépendant de prospect_email) - sans quoi le compte s'appellerait
        // « Parent » ou porterait le préfixe de l'email.
        if (infosParent && !infosParent.nom_parent) {
          const { data: gaRow } = await supabase
            .from("groupes_apprenants").select("note").eq("id", ga_id).maybeSingle();
          let assignationId = null;
          try { assignationId = JSON.parse(gaRow?.note || "{}").assignation_id || null; } catch { /* note non JSON */ }
          if (assignationId) {
            const { data: parDossier } = await supabase
              .from("assignations_parcours")
              .select("nom_parent, prenom_enfant, nom_enfant")
              .eq("id", assignationId).maybeSingle();
            if (parDossier) {
              infosParent.nom_parent    = infosParent.nom_parent    || parDossier.nom_parent    || null;
              infosParent.prenom_enfant = infosParent.prenom_enfant || parDossier.prenom_enfant || null;
              infosParent.nom_enfant    = infosParent.nom_enfant    || parDossier.nom_enfant    || null;
            }
          }
        }

        if (infosParent && (infosParent.email_parent || infosParent.telephone_parent)) {
          const parentResult = await creerAccesParentCore({
            nom_parent:       infosParent.nom_parent || null,
            email_parent:     infosParent.email_parent || null,
            telephone_parent: infosParent.telephone_parent || null,
            enfant_nom:       [infosParent.prenom_enfant, infosParent.nom_enfant].filter(Boolean).join(" ") || nom,
            cree_par_id:      acteur.id || null,
          });
          if (parentResult.ok) parentAccountCreated = true;
          else parentAccountError = parentResult.error;
        }
      } catch (e) {
        console.warn("[creer-acces] création auto compte parent échouée:", e.message);
        parentAccountError = e.message;
      }
    }

    logAudit({
      acteur_id:    acteur.id || null,
      acteur_nom:   acteur.nom || acteur.prenom ? `${acteur.prenom || ""} ${acteur.nom || ""}`.trim() : null,
      acteur_email: acteur.email || null,
      acteur_role:  acteur.role || "onboarding",
      plateforme:   "dash",
      action_type:  "APPRENANT_ACCES_CREE",
      module:       "apprenants",
      entite_type:  "user",
      entite_id:    newUserId,
      detail:       `Accès créé pour ${prenom || ""} ${nom} (${loginType}: ${loginIdent})`,
      ip_address:   acteur.ip_address || null,
      statut:       "success",
    }).catch(() => {});

    // Ne jamais annoncer un "nouveau mot de passe" à quelqu'un qui a déjà le sien (auto-
    // inscription site web / Google) - ce serait faux et source de confusion. Mais il reçoit
    // quand même un email de bienvenue (compteExistant:true - gabarit dédié, sans identifiants
    // fictifs), au lieu de ne rien recevoir du tout comme avant.
    if (useEmail) {
      await sendApprenantWelcomeEmail({ prenom: prenom || "", nom, email: loginEmail, mdpTemp, compteExistant: motDePasseDejaReel })
        .catch(e => console.error("⚠️ Email bienvenue apprenant:", e.message));
    }

    // Notifier l'assistant e-learning + l'apprenant lui-même
    try {
      const nomComplet = [prenom, nom].filter(Boolean).join(" ");
      const { data: assistants } = await supabase
        .from("utilisateurs")
        .select("id")
        .eq("role", "assistant_elearning")
        .eq("actif", true);
      const rows = (assistants || []).map(u => ({
        user_id: u.id,
        type:    "inscription",
        titre:   `🎓 Nouvel apprenant : ${nomComplet}`,
        message: `Un compte apprenant a été créé pour ${nomComplet}.`,
        lu:      false,
        meta:    { user_id: newUserId },
      }));
      // Notifier l'apprenant lui-même
      rows.push({
        user_id: newUserId,
        type:    "inscription",
        titre:   "🎉 Bienvenue sur BET E-Learning !",
        message: `Votre compte a été créé. Vous pouvez dès maintenant accéder à vos cours et ressources.`,
        lu:      false,
        meta:    {},
        source:  'bet-elearning',
      });
      if (rows.length) await supabase.from("notifications").insert(rows);
    } catch (ne) {
      console.warn("[apprenants/creer-acces] notif échouée:", ne.message);
    }

    return {
      ok: true,
      data: {
        message:          motDePasseDejaReel
          ? `${prenom || ""} ${nom} a déjà un compte avec son propre mot de passe - non modifié`
          : `Accès créé pour ${prenom || ""} ${nom}`,
        user_id:          newUserId,
        login_email:      loginEmail,
        login_type:       loginType,
        login_identifier: loginIdent,
        mdp_temp_envoye:  useEmail && !motDePasseDejaReel,
        mdp_initial:      motDePasseDejaReel ? null : mdpTemp,
        mot_de_passe_conserve: motDePasseDejaReel,
        parent_account_created: parentAccountCreated,
        parent_account_error:   parentAccountError,
      },
    };
  } catch (err) {
    console.error("[apprenants/creer-acces]", err);
    return { ok: false, status: 500, error: err.message };
  }
}

// ── POST /api/apprenants/creer-acces ───────────────────────────
// Body: { nom, prenom?, email?, telephone?, ga_id?, email_parent?, telephone_parent? }
// Si pas d'email/téléphone propre à l'enfant → identifiant technique <nom>@betacademy.app
router.post("/creer-acces", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  console.log("[creer-acces] body=", JSON.stringify(req.body));
  const result = await creerAccesApprenantCore({
    ...req.body,
    acteur: {
      id:    req.profil?.id || null,
      nom:   req.profil?.nom,
      prenom: req.profil?.prenom,
      email: req.profil?.email || null,
      role:  req.role || "onboarding",
      ip_address: req.headers["x-forwarded-for"] || req.ip || null,
    },
  });
  if (!result.ok) return res.status(result.status || 500).json({ error: result.error });
  return res.json(result.data);
});

// ── GET /api/apprenants/acces-parent ───────────────────────────
// Vérifie si un compte parent existe déjà pour un email donné
router.get("/acces-parent", authenticateAdmin, async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ existe: false });
  try {
    const { data, error } = await supabase
      .from("utilisateurs")
      .select("id, email, nom, prenom, mdp_initial, mdp_temporaire")
      .ilike("email", email.trim())
      .eq("role", "parent")
      .maybeSingle();

    if (error) {
      // Colonnes mdp_initial/mdp_temporaire peut-être absentes → fallback select minimal
      const { data: d2 } = await supabase
        .from("utilisateurs")
        .select("id, email, nom, prenom")
        .ilike("email", email.trim())
        .eq("role", "parent")
        .maybeSingle();
      if (!d2) return res.json({ existe: false });
      return res.json({ existe: true, login_email: d2.email, mdp_initial: null });
    }

    if (!data) return res.json({ existe: false });
    return res.json({
      existe: true,
      login_email: data.email,
      mdp_initial: (data.mdp_temporaire !== false) ? data.mdp_initial : null,
    });
  } catch (err) {
    return res.json({ existe: false });
  }
});

// ── creerAccesParentCore ────────────────────────────────────────
// Logique de création d'un compte parent, factorisée pour être appelée
// à la fois depuis la route manuelle (POST /creer-acces-parent) et depuis
// le déclenchement automatique dans POST /creer-acces (voir plus bas).
// Retourne { ok:true, data } ou { ok:false, status, error }.
export async function creerAccesParentCore({ prenom_parent, nom_parent, email_parent, telephone_parent, inscription_id, enfant_nom, cree_par_id = null }) {
  if (!isRealEmail(email_parent) && !telephone_parent) {
    return { ok: false, status: 400, error: "Fournir un email ou téléphone du parent" };
  }
  // nom_parent est optionnel : on déduit depuis email si absent
  const nomFinal = nom_parent || (email_parent ? email_parent.split('@')[0] : 'Parent');

  const useEmail   = isRealEmail(email_parent);
  const loginEmail = useEmail ? email_parent.toLowerCase().trim() : phoneToVirtualEmail(telephone_parent);
  const mdpTemp    = "BET@" + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(6, "X") + "!";
  let newUserId = null;
  // true si le compte a déjà un mot de passe réel (le parent s'est inscrit/connecté lui-même
  // sur le site public pour inscrire son enfant - c'est SON compte, avec SON mot de passe) -
  // ne jamais l'écraser par un mot de passe temporaire généré ici. Même garde que
  // creerAccesApprenantCore ci-dessus.
  let motDePasseDejaReel = false;

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: loginEmail,
      password: mdpTemp,
      email_confirm: true,
      app_metadata: { role: "parent", actif: true },
      user_metadata: { nom: nomFinal, prenom: prenom_parent || "", telephone: telephone_parent || null },
    });

    if (authError) {
      const msg = authError.message || "";
      if (msg.toLowerCase().includes("already")) {
        const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const existing = (listData?.users || []).find(u => u.email?.toLowerCase() === loginEmail);
        if (existing) {
          // Vérifier que cet utilisateur n'est pas déjà un apprenant - ne jamais écraser son rôle
          const { data: existingProfile } = await supabase
            .from("utilisateurs")
            .select("role, mdp_temporaire")
            .eq("id", existing.id)
            .maybeSingle();
          if (existingProfile?.role === "apprenant") {
            return { ok: false, status: 409, error: `Cet email (${loginEmail}) appartient déjà à un apprenant inscrit. Utilisez un email différent pour le compte parent.` };
          }
          // Vérifier aussi dans classes_elearning_apprenants (apprenant sans utilisateurs)
          const { data: appRow } = await supabase
            .from("classes_elearning_apprenants")
            .select("id")
            .ilike("email", loginEmail)
            .limit(1)
            .maybeSingle();
          if (appRow) {
            return { ok: false, status: 409, error: `Cet email (${loginEmail}) est l'email de connexion d'un apprenant. Utilisez un email différent pour le compte parent.` };
          }
          newUserId = existing.id;
          motDePasseDejaReel = !existingProfile || existingProfile.mdp_temporaire === false;
          // Marquer comme parent sans toucher au mot de passe si celui-ci est déjà réel
          if (motDePasseDejaReel) {
            await supabase.auth.admin.updateUserById(newUserId, {
              email_confirm: true,
              app_metadata: { role: "parent", actif: true },
            });
          } else {
            await supabase.auth.admin.updateUserById(newUserId, {
              password: mdpTemp,
              email_confirm: true,
              app_metadata: { role: "parent", actif: true },
            });
          }
        } else {
          return { ok: false, status: 400, error: "Email déjà utilisé mais introuvable." };
        }
      } else {
        return { ok: false, status: 400, error: authError.message };
      }
    } else if (authData?.user?.id) {
      newUserId = authData.user.id;
    } else {
      return { ok: false, status: 500, error: "Création Auth sans erreur mais user_id absent" };
    }

    // Upsert dans utilisateurs - vérifier l'erreur explicitement. Si mot de passe déjà réel,
    // ne jamais réécrire mdp_temporaire/mdp_initial (sinon l'UI l'afficherait comme "temporaire"
    // et le prochain "Renvoyer les accès" régénérerait un mot de passe fictif à sa place).
    const fullPayload = {
      id: newUserId, email: loginEmail,
      nom: nomFinal, prenom: prenom_parent || "",
      telephone: telephone_parent || null,
      role: "parent", actif: true,
      ...(motDePasseDejaReel
        ? {}
        : { mdp_temporaire: true, mdp_initial: mdpTemp }),
      cree_par_id: cree_par_id || null,
    };

    // Chercher d'abord par email pour récupérer un id éventuel conflictuel
    const { data: existingByEmail } = await supabase.from("utilisateurs").select("id").ilike("email", loginEmail).maybeSingle();
    if (existingByEmail && existingByEmail.id !== newUserId) {
      newUserId = existingByEmail.id;
      fullPayload.id = newUserId;
    }

    const { error: upsertErr } = await supabase.from("utilisateurs")
      .upsert(fullPayload, { onConflict: "id" });

    if (upsertErr) {
      console.error("[creer-acces-parent] utilisateurs upsert error:", upsertErr.message);
      // Fallback : insert minimal sans colonnes potentiellement manquantes
      const minPayload = { id: newUserId, email: loginEmail, nom: nomFinal, prenom: prenom_parent || "", role: "parent", actif: true };
      const { error: minErr } = await supabase.from("utilisateurs").upsert(minPayload, { onConflict: "id" });
      if (minErr) {
        console.error("[creer-acces-parent] utilisateurs fallback error:", minErr.message);
        return { ok: false, status: 500, error: `Erreur enregistrement profil parent : ${upsertErr.message}` };
      }
    }

    // Toujours lier l'email_parent sur classes_elearning_apprenants
    if (inscription_id && email_parent) {
      await supabase.from("classes_elearning_apprenants")
        .update({ email_parent: email_parent.toLowerCase().trim() })
        .eq("id", inscription_id);
    }

    // Ne jamais annoncer un mot de passe temporaire fictif si le parent a déjà le sien - il
    // reçoit quand même un email de bienvenue (compteExistant:true), pas plus rien du tout.
    if (useEmail) {
      await sendParentWelcomeEmail({ prenom: prenom_parent || "", nom: nomFinal, email: loginEmail, mdpTemp, enfantNom: enfant_nom || "", compteExistant: motDePasseDejaReel })
        .catch(e => console.error("⚠️ Email bienvenue parent:", e.message));
    }

    return {
      ok: true,
      data: {
        message: motDePasseDejaReel
          ? `Compte parent lié - ${prenom_parent || ""} ${nomFinal} garde son mot de passe existant`
          : `Accès parent créé pour ${prenom_parent || ""} ${nomFinal}`,
        user_id:     newUserId,
        login_email: loginEmail,
        mdp_initial: motDePasseDejaReel ? null : mdpTemp,
        mot_de_passe_conserve: motDePasseDejaReel,
      },
    };
  } catch (err) {
    console.error("[creer-acces-parent]", err);
    return { ok: false, status: 500, error: err.message };
  }
}

// ── POST /api/apprenants/creer-acces-parent ────────────────────
// Crée un compte parent lié à un enfant (inscription e-learning)
// Body: { prenom_parent, nom_parent, email_parent, telephone_parent, inscription_id?, enfant_nom? }
router.post("/creer-acces-parent", authenticateAdmin, requirePermission("inscriptions", "update"), async (req, res) => {
  const result = await creerAccesParentCore({ ...req.body, cree_par_id: req.profil?.id || null });
  if (!result.ok) return res.status(result.status || 500).json({ error: result.error });
  return res.json(result.data);
});

// ── Espace Parent (dash) ────────────────────────────────────────
// Reste strictement dans le périmètre de dash : groupes_apprenants + assignations_parcours.
// dash et bet-elearning sont des projets volontairement indépendants - on ne va pas lire dans
// classes_elearning_apprenants (propre à bet-elearning) depuis ce dashboard.

// Un parent dont l'email réel était déjà pris par le compte de son enfant se connecte via un
// identifiant technique (tel.<téléphone>[.<slug>]@betacademy.app, voir phoneToVirtualEmail).
// Cette fonction en extrait le numéro pour retrouver ses enfants via telephone_parent quand
// la correspondance directe par email_parent n'est pas possible.
function phoneDigitsFromVirtualEmail(email) {
  const m = /^tel\.(\d+)(?:\.[a-z0-9]+)?@betacademy\.app$/i.exec(email || "");
  return m ? m[1] : null;
}

function resolveParentIdentity(user) {
  const emailLower  = (user.email || "").toLowerCase().trim();
  const phoneDigits = phoneDigitsFromVirtualEmail(emailLower);
  return { emailLower, phoneDigits };
}

// Vrai si `row` (email_parent/telephone_parent) correspond à l'identité du parent connecté,
// que la connexion se soit faite par email réel ou, à défaut, par téléphone (identifiant virtuel).
function estLeParentDe(row, identity) {
  if (identity.phoneDigits) {
    const tel = normalizePhone(row.telephone_parent);
    return !!tel && tel === identity.phoneDigits;
  }
  // Deux chaînes vides ne doivent jamais se reconnaître : un dossier sans email_parent
  // rapprocherait alors n'importe quelle identité sans email.
  const mailDossier = (row.email_parent || "").toLowerCase().trim();
  return !!identity.emailLower && !!mailDossier && mailDossier === identity.emailLower;
}

// Authentifie le bearer token et vérifie que le parent connecté possède bien l'enfant :id
// (groupes_apprenants, rattaché via l'assignation correspondante pour email_parent/telephone_parent).
/* ─────────────────────────────────────────────────────────────
   PATCH /api/apprenants/mon-surnom
   L'apprenant choisit le nom sous lequel il apparaît.

   Le staff dispose déjà d'un surnom, posé via /api/admin/utilisateurs/:id -
   route fermée à l'apprenant, qui porte un `user_token` et non un
   `admin_token`. D'où cette route dédiée.

   La liste blanche est volontairement réduite à UN champ. Le surnom est de
   la présentation ; l'identité (nom, email) et les droits restent hors de
   portée de l'intéressé, comme côté staff.

   Pour un enfant, c'est le parent qui renseigne - il passe par
   PATCH /api/apprenants/enfants/:id/surnom, plus bas.
───────────────────────────────────────────────────────────── */
router.patch("/mon-surnom", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error } = await supabase.auth.getUser(bearer);
    if (error || !user) return res.status(401).json({ error: "Token invalide" });

    const surnom = typeof req.body.surnom === "string" ? req.body.surnom.trim().slice(0, 40) : "";

    // On cible par email : l'identifiant du compte auth et celui de `utilisateurs`
    // coïncident en principe, mais l'email est le lien qui a toujours tenu entre les deux.
    const { data, error: errMaj } = await supabase
      .from("utilisateurs")
      .update({ surnom: surnom || null })
      .ilike("email", user.email)
      .select("id, surnom")
      .maybeSingle();
    if (errMaj) return res.status(500).json({ error: errMaj.message });
    if (!data) return res.status(404).json({ error: "Profil introuvable" });

    res.json({ success: true, surnom: data.surnom });
  } catch (e) {
    console.error("[mon-surnom]", e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   PATCH /api/apprenants/enfants/:id/surnom
   Le parent renseigne le surnom de son enfant.

   Un enfant ne saisit pas lui-même : son compte sert surtout à consulter, et
   c'est le parent qui connaît le prénom d'usage. La filiation est vérifiée
   par authParentEnfant - la même que pour le reste de l'espace parent.
───────────────────────────────────────────────────────────── */
router.patch("/enfants/:id/surnom", async (req, res) => {
  try {
    const ga = await authParentEnfant(req, res, req.params.id);
    if (!ga) return; // la réponse d'erreur a déjà été envoyée

    const surnom = typeof req.body.surnom === "string" ? req.body.surnom.trim().slice(0, 40) : "";
    if (!ga.email_apprenant && !ga.apprenant_id) {
      return res.status(404).json({ error: "Aucun compte rattaché à cet enfant" });
    }

    let q = supabase.from("utilisateurs").update({ surnom: surnom || null });
    q = ga.apprenant_id ? q.eq("id", ga.apprenant_id) : q.ilike("email", ga.email_apprenant);

    const { data, error } = await q.select("id, surnom").maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Profil enfant introuvable" });

    res.json({ success: true, surnom: data.surnom });
  } catch (e) {
    console.error("[enfant surnom]", e.message);
    res.status(500).json({ error: e.message });
  }
});

async function authParentEnfant(req, res, enfantId) {
  const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!bearer) { res.status(401).json({ error: "Non authentifié" }); return null; }
  const { data: { user }, error } = await supabase.auth.getUser(bearer);
  if (error || !user) { res.status(401).json({ error: "Token invalide" }); return null; }
  const identity = resolveParentIdentity(user);

  const { data: ga, error: e2 } = await supabase
    .from("groupes_apprenants")
    .select("*")
    .eq("id", enfantId)
    .maybeSingle();
  if (e2 || !ga) { res.status(403).json({ error: "Accès refusé" }); return null; }

  // assignation_id posé dans groupes_apprenants.note à la création de la classe privée -
  // lien direct et fiable, prioritaire sur le match par prospect_email qui échoue pour un
  // coaching privé enfant (prospect_email est celui du PARENT, jamais celui de l'enfant).
  let assignationIdParNote = null;
  if (ga.note) {
    try { assignationIdParNote = JSON.parse(ga.note).assignation_id || null; } catch {}
  }

  let assign = null;
  if (assignationIdParNote) {
    const { data } = await supabase
      .from("assignations_parcours")
      .select("email_parent, telephone_parent, profil_type")
      .eq("id", assignationIdParNote)
      .maybeSingle();
    assign = data || null;
  }
  if (!assign) {
    const { data } = await supabase
      .from("assignations_parcours")
      .select("email_parent, telephone_parent, profil_type")
      .ilike("prospect_email", ga.email_apprenant || "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assign = data || null;
  }
  if (!assign || !estLeParentDe(assign, identity)) { res.status(403).json({ error: "Accès refusé" }); return null; }
  return { user, enfant: ga };
}

// ── GET /api/apprenants/parent/mes-enfants ─────────────────────
router.get("/parent/mes-enfants", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error } = await supabase.auth.getUser(bearer);
    if (error || !user) return res.status(401).json({ error: "Token invalide" });

    const identity = resolveParentIdentity(user);

    const { data: assigns, error: e3 } = await supabase
      .from("assignations_parcours")
      .select("id, prospect_email, telephone_parent, email_parent, profil_type, assistante_id, pa_advisor_id")
      .eq("profil_type", "enfant");
    // Aucun filtre sur prospect_email : il est NULL pour un enfant, dont les coordonnées
    // connues sont celles du parent (email_parent). L'écarter d'avance revenait à exclure
    // exactement les dossiers qu'on cherche - un parent voyait « aucun enfant rattaché »
    // alors que son compte était valide. Le rapprochement ci-dessous se fait de toute
    // façon sur email_parent/telephone_parent, et la classe est retrouvée par
    // groupes_apprenants.note quand prospect_email manque.
    if (e3) return res.status(500).json({ error: e3.message });
    const assignsMatch = (assigns || []).filter(a => estLeParentDe(a, identity));
    const emailsEnfants = [...new Set(assignsMatch.map(a => a.prospect_email).filter(Boolean))];
    const idsAssignsMatch = assignsMatch.map(a => a.id).filter(Boolean);

    if (!emailsEnfants.length && !idsAssignsMatch.length) return res.json({ enfants: [] });

    // Le match par email (email_apprenant.ilike.<prospect_email>) suppose que prospect_email
    // est celui de l'enfant - faux pour un coaching privé enfant où c'est le PARENT qui s'est
    // inscrit : prospect_email est alors SON email, jamais celui de l'enfant (email_apprenant).
    // On ajoute le lien fiable posé dans groupes_apprenants.note à la création de la classe.
    const orParts = emailsEnfants.map(e => `email_apprenant.ilike.${e}`);
    if (idsAssignsMatch.length) orParts.push(...idsAssignsMatch.map(id => `note.ilike.%${id}%`));
    const orExpr = orParts.join(",");
    const { data: gas, error: e4 } = await supabase
      .from("groupes_apprenants")
      .select("*")
      .or(orExpr)
      .neq("statut", "retire");
    if (e4) return res.status(500).json({ error: e4.message });

    const groupeIds = [...new Set((gas || []).map(g => g.groupe_id).filter(Boolean))];
    let groupesMap = {};
    if (groupeIds.length) {
      const { data: groupes } = await supabase.from("groupes").select("id, nom, filiere, coach_id").in("id", groupeIds);
      const coachIds = [...new Set((groupes || []).map(g => g.coach_id).filter(Boolean))];
      let coachMap = {};
      let coachContactMap = {};
      if (coachIds.length) {
        const { data: coaches } = await supabase.from("utilisateurs").select("id, nom, prenom, telephone, email, avatar_url").in("id", coachIds);
        (coaches || []).forEach(c => {
          const nom = `${c.prenom || ""} ${c.nom || ""}`.trim();
          coachMap[c.id] = nom;
          coachContactMap[c.id] = { nom, telephone: c.telephone || null, email: c.email || null, photo_url: c.avatar_url || null };
        });
      }
      (groupes || []).forEach(g => { groupesMap[g.id] = { ...g, coach_nom: coachMap[g.coach_id] || null, coach_contact: coachContactMap[g.coach_id] || null }; });
    }

    // Photo de profil : vit sur utilisateurs.avatar_url (mise à jour par l'apprenant lui-même
    // depuis son espace), accessible une fois son compte créé et lié via apprenant_id.
    // On en profite pour renvoyer aussi le statut d'accès (identifiant de connexion, compte
    // actif, mot de passe encore temporaire) - jamais le mot de passe lui-même, seulement son
    // statut - pour que le parent sache comment/si son enfant peut se connecter.
    const apprenantIds = [...new Set((gas || []).map(g => g.apprenant_id).filter(Boolean))];
    let avatarMap = {};
    // Le surnom de l'enfant, renseigné par le parent - le nom complet reste la référence.
    let surnomMap = {};
    let accesMap = {};
    if (apprenantIds.length) {
      const { data: comptes } = await supabase.from("utilisateurs").select("id, avatar_url, email, actif, mdp_temporaire, surnom").in("id", apprenantIds);
      (comptes || []).forEach(c => {
        if (c.avatar_url) avatarMap[c.id] = c.avatar_url;
        if (c.surnom) surnomMap[c.id] = c.surnom;
        accesMap[c.id] = { compte_cree: true, identifiant: c.email || null, actif: c.actif !== false, mdp_temporaire: !!c.mdp_temporaire };
      });
    }

    // Contacts réels (Assistante, Coach, PA Advisor) pour l'onglet "Contactez BET" - remplace
    // les 4 contacts fictifs codés en dur côté frontend. L'assistante et le PA Advisor sont
    // résolus via l'assignation retrouvée grâce au lien assignation_id posé dans
    // groupes_apprenants.note (même repère fiable que pour le reste du dossier de l'enfant).
    const assignById = {};
    assignsMatch.forEach(a => { assignById[a.id] = a; });
    const assistanteIds = [...new Set(assignsMatch.map(a => a.assistante_id).filter(Boolean))];
    const paAdvisorIds  = [...new Set(assignsMatch.map(a => a.pa_advisor_id).filter(Boolean))];
    let assistanteMap = {};
    if (assistanteIds.length) {
      const { data: assistantes } = await supabase.from("assistantes").select("id, nom, prenom, telephone, email, photo_url").in("id", assistanteIds);
      (assistantes || []).forEach(a => {
        assistanteMap[a.id] = { nom: `${a.prenom || ""} ${a.nom || ""}`.trim(), telephone: a.telephone || null, email: a.email || null, photo_url: a.photo_url || null };
      });
    }
    let paMap = {};
    if (paAdvisorIds.length) {
      const { data: pas } = await supabase.from("utilisateurs").select("id, nom, prenom, telephone, email, avatar_url").in("id", paAdvisorIds);
      (pas || []).forEach(p => {
        paMap[p.id] = { nom: `${p.prenom || ""} ${p.nom || ""}`.trim(), telephone: p.telephone || null, email: p.email || null, photo_url: p.avatar_url || null };
      });
    }

    const enfants = (gas || []).map(ga => {
      let assignationIdDeNote = null;
      try { assignationIdDeNote = JSON.parse(ga.note || "{}").assignation_id || null; } catch {}
      const assignLiee = assignationIdDeNote ? assignById[assignationIdDeNote] : null;
      return {
        ...ga,
        classe:     groupesMap[ga.groupe_id] ? { id: ga.groupe_id, nom: groupesMap[ga.groupe_id].nom, niveau_cecr: ga.niveau || null } : null,
        coach_nom:  groupesMap[ga.groupe_id]?.coach_nom || null,
        prenom:     ga.prenom_apprenant || "",
        nom:        ga.nom_apprenant || "",
        avatar_url: ga.apprenant_id ? (avatarMap[ga.apprenant_id] || null) : null,
        surnom:     ga.apprenant_id ? (surnomMap[ga.apprenant_id] || null) : null,
        acces: ga.apprenant_id
          ? (accesMap[ga.apprenant_id] || { compte_cree: true, identifiant: ga.email_apprenant || null, actif: true, mdp_temporaire: false })
          : { compte_cree: false, identifiant: ga.email_apprenant || null, actif: false, mdp_temporaire: false },
        contacts: {
          assistante: assignLiee?.assistante_id ? (assistanteMap[assignLiee.assistante_id] || null) : null,
          coach:      groupesMap[ga.groupe_id]?.coach_contact || null,
          pa_advisor: assignLiee?.pa_advisor_id ? (paMap[assignLiee.pa_advisor_id] || null) : null,
        },
      };
    });

    return res.json({ enfants });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apprenants/parent/enfant/:id/presences ────────────
router.get("/parent/enfant/:id/presences", async (req, res) => {
  const auth = await authParentEnfant(req, res, req.params.id);
  if (!auth) return;
  try {
    const { data, error } = await supabase
      .from("groupes_presences")
      .select("*")
      .eq("ga_id", req.params.id)
      .order("date_seance", { ascending: false });
    if (error) throw error;
    return res.json({ presences: (data || []).map(p => ({ ...p, seance: { date: p.date_seance, statut: p.statut } })) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apprenants/parent/enfant/:id/resultats ────────────
router.get("/parent/enfant/:id/resultats", async (req, res) => {
  const auth = await authParentEnfant(req, res, req.params.id);
  if (!auth) return;
  try {
    const { data: rendus, error } = await supabase
      .from("resultats_evaluations_groupes")
      .select("*")
      .eq("ga_id", req.params.id)
      .not("note", "is", null)
      .order("corrige_at", { ascending: false });
    if (error) throw error;
    const evalIds = [...new Set((rendus || []).map(r => r.evaluation_id).filter(Boolean))];
    let evalsMap = {};
    if (evalIds.length) {
      const { data: evals } = await supabase.from("evaluations_groupes").select("id, titre, date_evaluation").in("id", evalIds);
      (evals || []).forEach(e => { evalsMap[e.id] = e; });
    }
    const resultats = (rendus || []).map(r => ({
      id: r.id,
      titre: evalsMap[r.evaluation_id]?.titre || "Évaluation",
      note: r.note, note_max: r.note_max,
      date_evaluation: evalsMap[r.evaluation_id]?.date_evaluation || r.corrige_at,
    }));
    return res.json({ resultats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apprenants/parent/enfant/:id/devoirs ──────────────
router.get("/parent/enfant/:id/devoirs", async (req, res) => {
  const auth = await authParentEnfant(req, res, req.params.id);
  if (!auth) return;
  try {
    const groupeId = auth.enfant.groupe_id;
    if (!groupeId) return res.json({ devoirs: [] });
    const [{ data: evals }, { data: rendus }] = await Promise.all([
      supabase.from("evaluations_groupes").select("*").eq("groupe_id", groupeId).order("created_at", { ascending: false }),
      supabase.from("resultats_evaluations_groupes").select("*").eq("ga_id", req.params.id),
    ]);
    const rendusMap = {};
    (rendus || []).forEach(r => { rendusMap[r.evaluation_id] = r; });
    const devoirs = (evals || []).map(e => ({
      id: e.id, titre: e.titre, description: e.instructions, statut: e.statut,
      rendu: rendusMap[e.id] ? {
        statut: rendusMap[e.id].statut, note: rendusMap[e.id].note, note_max: rendusMap[e.id].note_max,
        commentaire_coach: rendusMap[e.id].commentaire_coach, rendu_at: rendusMap[e.id].rendu_at, corrige_at: rendusMap[e.id].corrige_at,
      } : null,
    }));
    return res.json({ devoirs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apprenants/parent/enfant/:id/seances ──────────────
router.get("/parent/enfant/:id/seances", async (req, res) => {
  const auth = await authParentEnfant(req, res, req.params.id);
  if (!auth) return;
  try {
    const groupeId = auth.enfant.groupe_id;
    if (!groupeId) return res.json({ seances: [] });

    // Le coach peut marquer les présences sans jamais remplir le formulaire "Ajouter un cours"
    // (les deux sont indépendants) - donc `groupes_cours` seul manque souvent des séances qui
    // ont réellement eu lieu. On complète avec les dates distinctes trouvées dans les présences
    // de CET enfant, pour toute date qui n'a pas déjà une fiche "cours" correspondante.
    const [{ data: cours, error: e1 }, { data: presDates, error: e2 }, { data: seancesNew, error: e3 }] = await Promise.all([
      supabase.from("groupes_cours").select("*").eq("groupe_id", groupeId).order("date_cours", { ascending: false }),
      supabase.from("groupes_presences").select("date_seance, statut").eq("ga_id", req.params.id),
      // Table unifiée `seances` (remplace groupes_cours/seances_privees - le coach l'utilise
      // désormais pour toutes ses séances via groupe_id) : sans elle, une séance récente
      // n'apparaîtrait jamais ici.
      supabase.from("seances").select("*").eq("groupe_id", groupeId).order("date_seance", { ascending: false }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;

    const statutMap = { realisee:"effectue", planifiee:"planifie", annulee:"annule" };
    const seances = [
      ...(cours || []).map(s => ({ ...s, date: s.date_cours, objectifs_session: s.objectif || s.sujet_discussion, source: "cours" })),
      ...(seancesNew || []).map(s => ({ ...s, date: s.date_seance, date_cours: s.date_seance, objectifs_session: s.objectif || s.titre, statut: statutMap[s.statut] || s.statut, source: "seances" })),
    ];
    const datesConnues = new Set(seances.map(s => s.date));

    const parDate = {};
    (presDates || []).forEach(p => {
      if (!p.date_seance || datesConnues.has(p.date_seance)) return;
      if (!parDate[p.date_seance]) parDate[p.date_seance] = true;
    });
    Object.keys(parDate).forEach(date => {
      seances.push({ id: `presence-${date}`, date, date_cours: date, objectifs_session: null, statut: "dispense", source: "presence" });
    });

    seances.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return res.json({ seances });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apprenants/parent/enfant/:id/contenus ─────────────
// Pas de bibliothèque de contenus en ligne côté école présentielle : rien à renvoyer.
router.get("/parent/enfant/:id/contenus", async (req, res) => {
  const auth = await authParentEnfant(req, res, req.params.id);
  if (!auth) return;
  return res.json({ contenus: [], non_applicable: true });
});

// ── GET /api/apprenants/parent/enfant/:id/avis-coach ───────────
// (la soumission d'un avis se fait via l'endpoint public existant POST /api/analytics/avis-parent)
router.get("/parent/enfant/:id/avis-coach", async (req, res) => {
  const auth = await authParentEnfant(req, res, req.params.id);
  if (!auth) return;
  try {
    const { data, error } = await supabase
      .from("avis_parents_coach")
      .select("*")
      .eq("inscription_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ evaluations: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apprenants/parent/enfant/:id/paiements ────────────
router.get("/parent/enfant/:id/paiements", async (req, res) => {
  const auth = await authParentEnfant(req, res, req.params.id);
  if (!auth) return;
  try {
    // assignation_id posé dans groupes_apprenants.note à la création de la classe privée -
    // prioritaire et fiable, contrairement au match par prospect_email qui échoue pour un
    // coaching privé enfant (prospect_email est celui du parent, pas de l'enfant).
    let assignationIdParNote = null;
    if (auth.enfant.note) {
      try { assignationIdParNote = JSON.parse(auth.enfant.note).assignation_id || null; } catch {}
    }
    let assign = null;
    if (assignationIdParNote) {
      const { data } = await supabase.from("assignations_parcours").select("id, plan_paiement").eq("id", assignationIdParNote).maybeSingle();
      assign = data || null;
    }
    if (!assign) {
      const { data } = await supabase
        .from("assignations_parcours")
        .select("id, plan_paiement")
        .ilike("prospect_email", auth.enfant.email_apprenant || "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      assign = data || null;
    }

    let paiements = [];
    if (assign?.id) {
      const { data, error } = await supabase
        .from("paiements_parcours")
        .select("id, inscription, montant_du, montant_recu, date_paiement, mode_paiement, statut, ref_transaction, notes, assignation_id, created_at")
        .eq("assignation_id", assign.id)
        .order("date_paiement", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      paiements = data || [];
    }

    return res.json({ paiements, plan_paiement: assign?.plan_paiement || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * À qui l'apprenant s'adresse pour une question sur son dossier ou son paiement.
 *
 * L'espace apprenant affichait une adresse écrite en dur (`client@bet-formation.com`) qui
 * n'existe dans aucune boîte : ni celle de son assistante, ni l'adresse centrale gérée par
 * le SuperAdmin. On renvoie donc son assistante réelle quand elle est connue - même
 * résolution que la route parent - et l'adresse centrale de `config_contact` sinon.
 *
 * Ne lève jamais : un contact absent dégrade l'affichage, il ne doit pas casser l'espace.
 */
async function resoudreContactAssistance(assistanteId) {
  const central = { type: "central", nom: null, email: null, telephone: null };
  try {
    const { data: cfg } = await supabase
      .from("config_contact")
      .select("email_central, whatsapp_number")
      .eq("id", 1)
      .maybeSingle();
    central.email     = cfg?.email_central   || null;
    central.telephone = cfg?.whatsapp_number || null;
  } catch { /* l'adresse centrale reste nulle - le front a son propre repli */ }

  if (!assistanteId) return central;
  try {
    const { data: a } = await supabase
      .from("assistantes")
      .select("nom, prenom, email, telephone")
      .eq("id", assistanteId)
      .maybeSingle();
    // Une assistante sans e-mail NI téléphone ne rend pas service : on garde le central.
    if (a && (a.email || a.telephone)) {
      return {
        type:      "assistante",
        nom:       `${a.prenom || ""} ${a.nom || ""}`.trim() || null,
        email:     a.email     || central.email,
        telephone: a.telephone || central.telephone,
      };
    }
  } catch { /* idem */ }
  return central;
}

// ── GET /api/apprenants/mon-espace ─────────────────────────────
router.get("/mon-espace", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });

    const { data: { user }, error } = await supabase.auth.getUser(bearer);
    if (error || !user) return res.status(401).json({ error: "Token invalide" });

    const email = user.email;

    const { data: profil } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, role, actif, avatar_url, telephone, adresse, couleur")
      .eq("id", user.id)
      .maybeSingle();

    // Determine display identifier (use phone if virtual email)
    const isVirtualEmail = email?.endsWith("@betacademy.app");
    const profilBase = profil
      ? { ...profil, id: profil.id || user.id }
      : {
          id:     user.id,
          nom:    user.user_metadata?.nom    || "",
          prenom: user.user_metadata?.prenom || "",
          email,
          actif:  true,
        };
    // Add display_identifier for the pending screen
    profilBase.display_identifier = isVirtualEmail
      ? (profil?.telephone || user.user_metadata?.telephone || email)
      : email;
    profilBase.login_type = isVirtualEmail ? "telephone" : "email";

    if (profil && profil.actif === false) {
      return res.json({
        actif: false,
        profil: profilBase,
        groupe: null,
        statut_detail: { compte_actif: false, classe_trouvee: false, coach_assigne: false, classe_active: false },
        message_blocage: "Votre compte a été désactivé. Contactez l'administration.",
      });
    }

    // Gamification : connexion quotidienne (+2 pts, streak) - non-bloquant, ne doit jamais
    // faire échouer le chargement de l'espace apprenant.
    if (profil?.role === "apprenant") {
      assurerActiviteDuJour(profil.id).catch(() => {});
    }

    const telephone = profil?.telephone || user.user_metadata?.telephone || null;
    const telDigits = telephone ? telephone.replace(/\D/g, "").replace(/^00/, "").slice(-8) : null;

    const GA_SELECT = "id, groupe_id, statut, niveau, nom_apprenant, prenom_apprenant, email_apprenant, telephone, date_ajout, groupes(id, nom, filiere, statut, coach_id, utilisateurs(nom, prenom))";

    // Requête sans jointure utilisateurs pour éviter erreur FK manquante
    // `date_retrait` : une formation arrêtée garde son espace, et l'écran doit pouvoir
    // dire depuis quand.
    const GA_SELECT_SIMPLE = "id, groupe_id, statut, niveau, nom_apprenant, prenom_apprenant, email_apprenant, telephone, apprenant_id, date_ajout, date_retrait, note, groupes(id, nom, filiere, statut, coach_id)";

    const queries = [
      supabase.from("groupes_apprenants").select(GA_SELECT_SIMPLE).ilike("email_apprenant", email).order("date_ajout", { ascending: false }),
      supabase.from("groupes_apprenants").select(GA_SELECT_SIMPLE).eq("apprenant_id", user.id).order("date_ajout", { ascending: false }),
    ];
    if (telDigits) {
      queries.push(supabase.from("groupes_apprenants").select(GA_SELECT_SIMPLE).ilike("telephone", `%${telDigits}%`).order("date_ajout", { ascending: false }));
    }

    const results = await Promise.all(queries);
    const [resEmail, resId, resTel] = results;
    const gaByEmail = resEmail.data || [];
    const gaById    = resId.data    || [];
    const gaByTel   = resTel?.data  || [];

    if (resEmail.error || resId.error || resTel?.error) {
      console.error("[mon-espace] erreurs requêtes GA:", resEmail.error?.message, resId.error?.message, resTel?.error?.message);
    }

    // Merge results deduped by id
    const seen = new Set();
    const gaRows = [...(gaByEmail || []), ...(gaById || []), ...gaByTel].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    let rows = gaRows;
    // L'auto-link est fait après sélection de bonneEntree pour éviter de lier
    // l'apprenant à tous les groupes où son email apparaît (anciens groupes, groupes test…)
    // → voir le bloc auto-link après bonneEntree ci-dessous

    // ── Phase 2 : fallback via assignations_parcours ─────────────
    // Couvre : coaching privé, décalage email CRM vs email website
    let assignationFallback = null;
    if (rows.length === 0) {
      const apSelect = "id, prospect_email, prospect_telephone, statut, suivi_demarrage, routing_statut";
      const apQueries = [
        supabase.from("assignations_parcours")
          .select(apSelect)
          .ilike("prospect_email", email)
          .in("statut", ["converti", "en_cours"])
          .order("created_at", { ascending: false })
          .limit(5),
      ];
      if (telDigits) {
        apQueries.push(
          supabase.from("assignations_parcours")
            .select(apSelect)
            .ilike("prospect_telephone", `%${telDigits}%`)
            .in("statut", ["converti", "en_cours"])
            .order("created_at", { ascending: false })
            .limit(5)
        );
      }
      const apResults = await Promise.all(apQueries);
      const seenAp = new Set();
      const apRows = apResults.flatMap(r => r.data || []).filter(r => {
        if (seenAp.has(r.id)) return false;
        seenAp.add(r.id);
        return true;
      });

      if (apRows.length > 0) {
        assignationFallback = apRows[0];
        // Re-chercher groupes_apprenants avec les emails alternatifs des assignations
        const altEmails = [...new Set(apRows.map(r => r.prospect_email).filter(Boolean))];
        const altGaResults = await Promise.all(
          altEmails.map(altEmail =>
            supabase.from("groupes_apprenants").select(GA_SELECT_SIMPLE).ilike("email_apprenant", altEmail).order("date_ajout", { ascending: false })
          )
        );
        const seenAlt = new Set();
        const altRows = altGaResults.flatMap(r => r.data || []).filter(r => {
          if (seenAlt.has(r.id)) return false;
          seenAlt.add(r.id);
          return true;
        });
        rows = altRows;
      }
    }
    // ─────────────────────────────────────────────────────────────

    const bonneEntree =
      // 1. Priorité : groupe actif
      rows.find(ga => {
        const g = ga.groupes;
        return ga.statut === "actif" && g && g.statut === "actif";
      }) ||
      // 2. Fallback : classe clôturée (l'apprenant garde accès en lecture)
      rows.find(ga => {
        const g = ga.groupes;
        return g && g.statut === "cloture";
      }) ||
      /* 3. Fallback : FORMATION ARRÊTÉE. Sans ce cas, déclarer un arrêt fermait l'espace
            entier : l'apprenant retombait sur l'écran « Dossier en cours de traitement »,
            comme s'il n'avait jamais été inscrit. Or l'arrêt promet exactement l'inverse -
            « il garde l'accès aux cours déjà suivis » - et la fenêtre de présence le fait
            déjà respecter, contenu par contenu. Lui fermer la porte ici annulait cette
            promesse et effaçait son historique de son propre écran.
            Ce cas vient en DERNIER : un apprenant réinscrit ailleurs entre par son
            rattachement actif, jamais par l'ancien. */
      rows.find(ga => ga.statut === "retire" && ga.groupes);

    if (bonneEntree) {
      // Auto-lier uniquement ce groupe actif (pas tous les groupes où l'email apparaît)
      if (!bonneEntree.apprenant_id) {
        await supabase.from("groupes_apprenants")
          .update({ apprenant_id: user.id })
          .eq("id", bonneEntree.id);
      }
      const coachId = bonneEntree.groupes?.coach_id || null;

      // Fetch coach name from utilisateurs
      let coachInfo = null;
      if (coachId) {
        const { data: coachRow } = await supabase
          .from("utilisateurs")
          .select("id, nom, prenom, email")
          .eq("id", coachId)
          .maybeSingle();
        coachInfo = coachRow || null;
      }

      // Fetch parcours info (id inclus pour retrouver les paiements liés)
      const PARCOURS_FIELDS = "id, niveau_client, objectif_client, type_cours, statut_paiement, statut, plan_paiement, montant_paye, profil_type, suivi_demarrage, nom_parent, email_parent, telephone_parent, assistante_id";
      let parcoursInfo = null;

      // Priorité : lien direct posé dans groupes_apprenants.note à la création du dossier
      // ({assignation_id}) - le seul lien fiable pour un profil ENFANT, dont prospect_email/
      // prospect_telephone sur l'assignation sont ceux du PARENT, jamais les siens. Un enfant
      // connecté avec son propre compte (email technique ou téléphone du parent partagé avec
      // un autre enfant) ne retrouvait donc jamais son dossier via les deux repères ci-dessous,
      // et retombait sur profil_type absent → tranche d'âge "adulte" par défaut.
      let assignationIdDeNote = null;
      try { assignationIdDeNote = JSON.parse(bonneEntree.note || "{}").assignation_id || null; } catch {}
      if (assignationIdDeNote) {
        const { data: parcoursParNote } = await supabase
          .from("assignations_parcours").select(PARCOURS_FIELDS).eq("id", assignationIdDeNote).maybeSingle();
        parcoursInfo = parcoursParNote || null;
      }

      if (!parcoursInfo) {
        const emailForParcours = isVirtualEmail ? null : email;
        const parcoursQueries = [];
        if (emailForParcours) {
          parcoursQueries.push(
            supabase.from("assignations_parcours")
              .select(PARCOURS_FIELDS)
              .ilike("prospect_email", emailForParcours)
              .order("created_at", { ascending: false })
              .limit(1)
          );
        }
        if (telDigits) {
          parcoursQueries.push(
            supabase.from("assignations_parcours")
              .select(PARCOURS_FIELDS)
              .ilike("prospect_telephone", `%${telDigits}%`)
              .order("created_at", { ascending: false })
              .limit(1)
          );
        }
        if (parcoursQueries.length > 0) {
          const parcoursResults = await Promise.all(parcoursQueries);
          const parcoursRow = parcoursResults.map(r => r.data?.[0]).find(r => !!r);
          parcoursInfo = parcoursRow || null;
        }
      }

      // Fetch paiements : priorité assignation_id, fallback email + téléphone
      const PAI_FIELDS = "id, inscription, montant_du, montant_recu, date_paiement, mode_paiement, statut, ref_transaction, notes, preuve_image, assignation_id, created_at";
      let paiements = [];

      // 1. Par assignation_id (lien direct - le plus fiable)
      if (parcoursInfo?.id) {
        const { data: paiData } = await supabase
          .from("paiements_parcours")
          .select(PAI_FIELDS)
          .eq("assignation_id", parcoursInfo.id)
          .order("date_paiement", { ascending: true }).order("created_at", { ascending: true });
        paiements = paiData || [];
      }

      // 2. Fallback par email / téléphone (paiements anciens sans assignation_id)
      if (paiements.length === 0) {
        const fallbackQueries = [];
        if (emailForParcours) {
          fallbackQueries.push(
            supabase.from("paiements_parcours")
              .select(PAI_FIELDS)
              .ilike("email", emailForParcours)
              .order("date_paiement", { ascending: true }).order("created_at", { ascending: true })
          );
        }
        if (telDigits) {
          fallbackQueries.push(
            supabase.from("paiements_parcours")
              .select(PAI_FIELDS)
              .ilike("telephone", `%${telDigits}%`)
              .order("date_paiement", { ascending: true }).order("created_at", { ascending: true })
          );
        }
        if (fallbackQueries.length > 0) {
          const fbResults = await Promise.all(fallbackQueries);
          const seen = new Set();
          paiements = fbResults
            .flatMap(r => r.data || [])
            .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
            .sort((a, b) => new Date(a.date_paiement) - new Date(b.date_paiement));
        }
      }

      const classeCloturee = bonneEntree.groupes?.statut === "cloture";

      // Formation arrêtée : l'espace reste ouvert, mais l'écran doit le DIRE - sinon
      // l'apprenant verrait ses cours se figer sans comprendre pourquoi.
      let formationArretee = null;
      if (bonneEntree.statut === "retire" || bonneEntree.date_retrait) {
        let infos = {};
        try { infos = JSON.parse(bonneEntree.note || "{}").arret_formation || {}; } catch { /* note libre */ }
        formationArretee = {
          date:  bonneEntree.date_retrait || infos.date || null,
          motif: infos.motif || null,
        };
      }

      const paiementsEnrichis = await enrichirPaiementsAvecTouchPoint(paiements);
      const contactAssistance = await resoudreContactAssistance(parcoursInfo?.assistante_id);
      return res.json({
        actif: true,
        profil: profilBase,
        groupe: bonneEntree,
        coach: coachInfo,
        parcours: parcoursInfo,
        paiements: paiementsEnrichis,
        classe_cloturee: classeCloturee,
        formation_arretee: formationArretee,
        // À qui l'apprenant écrit quand il a une question : son assistante si elle est
        // connue, sinon l'adresse centrale de `config_contact`.
        contact_assistance: contactAssistance,
        statut_detail: { compte_actif: true, classe_trouvee: true, coach_assigne: !!coachId, classe_active: !classeCloturee },
        message_blocage: null,
      });
    }

    const classeTrouvee = rows.length > 0;
    const gaActif       = rows.find(ga => ga.statut === "actif");
    const classeActive  = gaActif && gaActif.groupes?.statut === "actif";

    // Coaching privé : le coach peut être dans suivi_demarrage de l'assignation
    const sdFallback      = assignationFallback?.suivi_demarrage || {};
    const coachAssigneGA  = gaActif && !!gaActif.groupes?.coach_id;
    const coachAssigneSD  = !!(sdFallback.coach_id || sdFallback.coach_nom_manuel);
    const coachAssigne    = coachAssigneGA || coachAssigneSD;

    // Routing statut indique que l'onboarding a affecté une classe
    const rStatut         = assignationFallback?.routing_statut || "";
    const classeViaRStat  = rStatut === "onboarding_affecte" || rStatut.includes("affecte");

    let message_blocage = "Votre dossier est en cours de traitement par notre équipe.";
    if (!classeTrouvee && !classeViaRStat) {
      message_blocage = coachAssigne
        ? "Un coach vous a été assigné. L'affectation à votre classe est en cours."
        : "Vous n'êtes pas encore affecté(e) à une classe. Notre équipe s'en charge.";
    } else if (!coachAssigne) {
      message_blocage = "Vous êtes inscrit(e) dans une classe, mais un coach n'a pas encore été assigné.";
    } else if (!classeActive) {
      message_blocage = "Votre classe est en cours de démarrage. Vous aurez accès dès qu'elle sera ouverte.";
    }

    return res.json({
      actif: false,
      profil: profilBase,
      groupe: gaActif || null,
      statut_detail: {
        compte_actif:  true,
        classe_trouvee: classeTrouvee || classeViaRStat,
        coach_assigne:  coachAssigne,
        classe_active:  classeActive || false,
      },
      message_blocage,
    });

  } catch (err) {
    console.error("[apprenants/mon-espace]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/apprenants/initier-paiement ────────────────────
// Initie un paiement TouchPoint (Checkout page) depuis l'espace apprenant.
// Contrairement à l'ancien flux CinetPay (le serveur renvoyait un payment_url
// à rediriger), TouchPoint est piloté côté client : cette route renvoie les
// paramètres nécessaires pour que le frontend charge le script TouchPoint et
// appelle SendPaymentInfos() lui-même - voir Backend/docs/touchpoint-integration.md
// et Backend/src/routes/touchpoint.js (même logique, dupliquée ici car cette
// route est authentifiée apprenant et rattache le paiement à une tranche).
const TOUCHPOINT_AGENCY_CODE = process.env.TOUCHPOINT_AGENCY_CODE || "";
const TOUCHPOINT_SECURE_CODE = process.env.TOUCHPOINT_SECURE_CODE || "";
const TOUCHPOINT_DOMAIN_NAME = process.env.TOUCHPOINT_DOMAIN_NAME || "";
const TOUCHPOINT_SCRIPT_URL  = "https://touchpay.gutouch.com/touchpay/script2/prod_touchpay-0.0.2.js";

router.post("/initier-paiement", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    const { montant, description, tranche_id, assignation_id } = req.body;
    if (!montant || Number(montant) <= 0) return res.status(400).json({ error: "Montant invalide" });
    if (!assignation_id) return res.status(400).json({ error: "assignation_id requis" });
    if (!TOUCHPOINT_AGENCY_CODE || !TOUCHPOINT_SECURE_CODE || !TOUCHPOINT_DOMAIN_NAME) {
      return res.status(503).json({ error: "Paiement en ligne non configuré. Contactez l'administration." });
    }

    const { data: profil } = await supabase
      .from("utilisateurs")
      .select("nom, prenom, email, telephone")
      .eq("id", user.id)
      .maybeSingle();

    const order_number = `BET-APR-${Date.now()}-${uuidv4().slice(0,6).toUpperCase()}`;
    const metadata = JSON.stringify({ assignation_id, tranche_id: tranche_id || null, apprenant_id: user.id, context: "apprenant" });

    const { error: dbErr } = await supabase.from("paiements_touchpoint").insert({
      order_number,
      client_nom:       profil?.nom      || user.email,
      client_prenom:    profil?.prenom   || null,
      client_email:     user.email,
      client_telephone: profil?.telephone || null,
      montant:          Number(montant),
      statut:           "en_attente",
      message:          metadata,
    });
    if (dbErr) {
      console.error("[initier-paiement] DB insert error:", dbErr.message);
      return res.status(500).json({ error: dbErr.message });
    }

    res.json({
      order_number,
      script_url:               TOUCHPOINT_SCRIPT_URL,
      agency_code:               TOUCHPOINT_AGENCY_CODE,
      secure_code:                TOUCHPOINT_SECURE_CODE,
      domain_name:               TOUCHPOINT_DOMAIN_NAME,
      amount:                    Number(montant),
      city:                      "Abidjan",
      email:                     user.email,
      clientFirstName:           profil?.prenom || "Apprenant",
      clientLastName:            profil?.nom    || user.email.split("@")[0],
      clientPhone:               profil?.telephone || "",
      url_redirection_success:   `${FRONTEND_URL}/espace-apprenant?paiement=retour&order_number=${order_number}`,
      url_redirection_failed:    `${FRONTEND_URL}/espace-apprenant?paiement=retour&order_number=${order_number}`,
    });
  } catch (err) {
    console.error("[initier-paiement]", err);
    return res.status(500).json({ error: err.message });
  }
});
/* ── Ancienne implémentation CinetPay (conservée pour référence) ──
router.post("/initier-paiement", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    const { montant, description, tranche_id, assignation_id } = req.body;
    if (!montant || Number(montant) <= 0) return res.status(400).json({ error: "Montant invalide" });
    if (!assignation_id) return res.status(400).json({ error: "assignation_id requis" });

    const { data: profil } = await supabase
      .from("utilisateurs")
      .select("nom, prenom, email, telephone")
      .eq("id", user.id)
      .maybeSingle();

    const transaction_id = `BET-APR-${Date.now()}-${uuidv4().slice(0,6).toUpperCase()}`;
    const metadata = JSON.stringify({ assignation_id, tranche_id: tranche_id || null, apprenant_id: user.id, context: "apprenant" });

    if (!CINETPAY_APIKEY || !CINETPAY_SITE_ID) {
      console.error("[initier-paiement] CINETPAY_APIKEY ou CINETPAY_SITE_ID non configuré");
      return res.status(500).json({ error: "Paiement en ligne non configuré. Contactez l'administration." });
    }

    const { error: dbErr } = await supabase.from("paiements_cinetpay").insert({
      transaction_id,
      client_nom:       profil?.nom      || user.email,
      client_prenom:    profil?.prenom   || null,
      client_email:     user.email,
      client_telephone: profil?.telephone || null,
      montant:          Number(montant),
      statut:           "en_attente",
      message:          metadata,
    });
    if (dbErr) {
      console.error("[initier-paiement] DB insert error:", dbErr.message);
      return res.status(500).json({ error: dbErr.message });
    }

    const rawPhone = (profil?.telephone || "").replace(/\s+/g, "").replace(/\D/g, "");
    const cpBody = {
      apikey:         CINETPAY_APIKEY,
      site_id:        Number(CINETPAY_SITE_ID),
      transaction_id,
      amount:         Number(montant),
      currency:       "XOF",
      description:    (description || "Paiement formation BET").slice(0, 100),
      return_url:     `${FRONTEND_URL}/espace-apprenant?paiement=retour&tid=${transaction_id}`,
      notify_url:     `${BACKEND_URL}/api/cinetpay/notify`,
      customer_name:     (profil?.prenom || "Apprenant").trim(),
      customer_surname:  (profil?.nom    || user.email.split("@")[0]).trim(),
      customer_email:    user.email,
      customer_phone_number: rawPhone || "0000000000",
      customer_address:  "Abidjan",
      customer_city:     "Abidjan",
      customer_country:  "CI",
      customer_state:    "CI",
      customer_zip_code: "00225",
      channels:          "ALL",
      lang:              "fr",
    };

    const cpRes  = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cpBody),
    });
    const cpData = await cpRes.json();
    console.log("[initier-paiement] CinetPay réponse:", JSON.stringify(cpData));

    if (cpData.code !== "201") {
      await supabase.from("paiements_cinetpay").update({ statut: "échoué" }).eq("transaction_id", transaction_id);
      const errMsg = cpData.message || cpData.data?.message || `Code CinetPay: ${cpData.code}`;
      return res.status(502).json({ error: errMsg, cinetpay_code: cpData.code });
    }

    return res.json({ transaction_id, payment_url: cpData.data.payment_url });
  } catch (err) {
    console.error("[initier-paiement]", err);
    return res.status(500).json({ error: err.message });
  }
});
── fin ancienne implémentation ── */

// PATCH /api/apprenants/preferences - sauvegarder la couleur du dashboard
router.patch("/preferences", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    const { couleur, adresse, avatar_url } = req.body;
    const allowed = {};
    if (couleur)     allowed.couleur     = couleur;
    if (adresse !== undefined) allowed.adresse = adresse;
    if (avatar_url)  allowed.avatar_url  = avatar_url;
    if (!Object.keys(allowed).length) return res.status(400).json({ error: "Rien à mettre à jour" });

    const { error } = await supabase.from("utilisateurs").update(allowed).eq("id", user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   GET  /api/apprenants/mes-notifs     - notifications de l'apprenant
   PATCH /api/apprenants/notifs/:id/lu - marquer comme lue
───────────────────────────────────────────────────────────── */
const getApprenantUser = async (req) => {
  const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
  if (!bearer) return null;
  // Meme cache que `authenticateUser` : ~175 ms d'appel reseau evites par requete.
  return await utilisateurDuJeton(bearer);
};

// Query params optionnels : ?source=bet-elearning · ?page=1 · ?limit=20 · ?date_debut=YYYY-MM-DD · ?date_fin=YYYY-MM-DD
router.get("/mes-notifs", async (req, res) => {
  const user = await getApprenantUser(req);
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (req.query.source)     query = query.eq("source", req.query.source);
  if (req.query.date_debut) query = query.gte("created_at", req.query.date_debut);
  if (req.query.date_fin)   query = query.lte("created_at", `${req.query.date_fin}T23:59:59`);

  const { data, error, count } = await query.range(from, to);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ notifications: data || [], total: count || 0, page, limit });
});

router.patch("/notifs/tout-lire", async (req, res) => {
  const user = await getApprenantUser(req);
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const { error } = await supabase
    .from("notifications")
    .update({ lu: true })
    .eq("user_id", user.id)
    .eq("lu", false);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.patch("/notifs/:id/lu", async (req, res) => {
  const user = await getApprenantUser(req);
  if (!user) return res.status(401).json({ error: "Non authentifié" });

  const { error } = await supabase
    .from("notifications")
    .update({ lu: true })
    .eq("id", req.params.id)
    .eq("user_id", user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── GET  /api/apprenants/mes-cours-lus          - contenus marqués comme lus
// ── POST /api/apprenants/contenus/:id/lu        - marquer comme lu
// ── DELETE /api/apprenants/contenus/:id/lu      - démarquer
router.get("/mes-cours-lus", async (req, res) => {
  const user = await getApprenantUser(req);
  if (!user) return res.status(401).json({ error: "Non authentifié" });
  const { data, error } = await supabase
    .from("contenus_lus")
    .select("contenu_id, lu_le")
    .eq("apprenant_id", user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ lus: data || [] });
});

router.post("/contenus/:contenu_id/lu", async (req, res) => {
  // Chronometrage par etape. Pose deliberement : un ecran « lent » ne dit pas OU le temps
  // passe, et sans cette mesure on ne peut que supposer. Le cout est nul (trois
  // Date.now()) et la ligne rend le diagnostic immediat.
  const t0 = Date.now();
  const user = await getApprenantUser(req);
  const tAuth = Date.now() - t0;
  if (!user) return res.status(401).json({ error: "Non authentifié" });
  const { contenu_id } = req.params;
  const { classe_id } = req.body;

  // Verifie ICI et pas seulement dans l'interface : sans ce controle, appeler la route
  // dans l'ordre inverse deverrouillerait toute la suite sans avoir rien lu.
  //
  // UN SEUL contexte, dont les lectures partent en parallele. La version precedente
  // enchainait cinq requetes sequentielles avant de repondre, ce qui rendait le bouton
  // « Marquer comme termine » perceptiblement lent derriere une connexion chargee.
  let dejaLu = false;
  const tVerrou0 = Date.now();
  let tVerrou = 0;
  try {
    const ctx = await contexteMarquage(user, contenu_id);
    tVerrou = Date.now() - tVerrou0;
    dejaLu = ctx.dejaLu;
    if (!ctx.accessible) {
      // Trois causes, trois messages : « terminez le precedent » ne se repare pas de la
      // meme facon que « publie avant votre arrivee », et un refus sans motif laisse
      // l'apprenant devant un bouton qui ne fait rien.
      const message =
        ctx.motif === MOTIF.AVANT_ARRIVEE
          ? "Ce cours a été publié avant votre arrivée dans la classe."
          : ctx.motif === MOTIF.APRES_DEPART
          ? "Ce cours a été publié après la fin de votre formation."
          : ctx.bloque_par
          ? `Terminez d'abord « ${ctx.bloque_par.titre} ».`
          : "Ce cours n'est pas encore accessible.";
      return res.status(403).json({ error: message, motif: ctx.motif || null, bloque_par: ctx.bloque_par || null });
    }
  } catch (e) {
    // Le verrou ne doit pas empecher de travailler s'il tombe en panne : on trace et on
    // laisse passer, plutot que de bloquer toute la classe sur une erreur de lecture.
    console.error("[contenus/lu] verrou non evalue:", e.message);
  }

  const tEcriture0 = Date.now();
  const { error } = await supabase
    .from("contenus_lus")
    .upsert({ contenu_id, apprenant_id: user.id, classe_id: classe_id || null, lu_le: new Date().toISOString() },
             { onConflict: "contenu_id,apprenant_id" });
  if (error) return res.status(500).json({ error: error.message });
  // Le contexte garde en memoire sait desormais que ce contenu est lu : sans cela il
  // repondrait « pas encore lu » pendant 60 s, et le contenu suivant resterait verrouille
  // alors que son prerequis vient d'etre rempli.
  noterLectureEnCache(user.id, contenu_id);
  res.json({ ok: true });
  console.log(`[contenus/lu] ${Date.now() - t0} ms au total - auth ${tAuth} ms · verrou ${tVerrou} ms · ecriture ${Date.now() - tEcriture0} ms`);

  // Le coach est prevenu APRES la reponse : la notification ne doit ni ralentir
  // l'apprenant ni faire echouer son marquage si elle tombe en panne.
  if (!dejaLu) notifierCoachLecture(user, contenu_id, classe_id).catch(() => {});
});

/**
 * Prevenir le coach qu'un apprenant a termine son contenu.
 *
 * Le coach disposait de l'ecran « Lectures » (qui a lu, qui n'a pas ouvert), mais devait
 * aller le consulter : rien ne lui parvenait au moment ou la lecture avait lieu.
 *
 * Volontairement silencieuse en cas d'echec : une notification perdue est sans gravite,
 * un marquage perdu ne l'est pas.
 */
async function notifierCoachLecture(user, contenuId, classeId) {
  const { data: contenu } = await supabase
    .from("modules_elearning").select("id, titre, coach_id").eq("id", contenuId).maybeSingle();
  if (!contenu?.coach_id) return;

  // Le nom porte par le rattachement a la classe, plus fiable que celui du compte :
  // les apprenants importes n'ont pas toujours de profil `utilisateurs` renseigne.
  let nom = "";
  const { data: ga } = await supabase
    .from("groupes_apprenants").select("prenom_apprenant, nom_apprenant")
    .eq("apprenant_id", user.id).limit(1);
  if (ga?.[0]) nom = `${ga[0].prenom_apprenant || ""} ${ga[0].nom_apprenant || ""}`.trim();
  if (!nom) {
    const { data: u } = await supabase
      .from("utilisateurs").select("prenom, nom").eq("id", user.id).maybeSingle();
    nom = u ? `${u.prenom || ""} ${u.nom || ""}`.trim() : "";
  }
  if (!nom) nom = user.email || "Un apprenant";

  let classe = "";
  if (classeId) {
    const { data: g } = await supabase.from("groupes").select("nom").eq("id", classeId).maybeSingle();
    classe = g?.nom || "";
  }

  await notifyUser(contenu.coach_id, {
    type:    "contenu_lu",
    titre:   `✅ ${nom} a terminé « ${contenu.titre} »`,
    message: `${nom}${classe ? ` (${classe})` : ""} a marqué votre contenu « ${contenu.titre} » comme terminé.`,
    meta:    { contenu_id: contenu.id, apprenant_id: user.id, classe_id: classeId || null },
    source:  "dash",
  });
}

/* DELETE /api/apprenants/contenus/:id/lu - DESACTIVE.
   Marquer un cours comme termine est desormais DEFINITIF : c'est une declaration de
   l'apprenant, pas un etat qu'on bascule. Pouvoir revenir dessus ouvrait une serie de
   questions sans bonne reponse - que devient la progression des cours deja debloques par
   cette lecture, que voit le coach qui avait ete notifie - pour un besoin que personne
   n'avait exprime.
   La route repond 403 plutot que de disparaitre : un client pas encore redeploye recoit
   une explication au lieu d'un 404 muet. */
router.delete("/contenus/:contenu_id/lu", async (req, res) => {
  res.status(403).json({
    error: "Un cours marqué comme terminé ne peut plus être annulé.",
  });
});

// ── GET /api/apprenants/mes-fichiers ───────────────────────────────────────
router.get("/mes-fichiers", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    const email = user.email;
    const [resEmail, resId] = await Promise.all([
      supabase.from("groupes_apprenants").select("id, groupe_id, statut").ilike("email_apprenant", email),
      supabase.from("groupes_apprenants").select("id, groupe_id, statut").eq("apprenant_id", user.id),
    ]);

    const seen = new Set();
    const allRows = [...(resEmail.data || []), ...(resId.data || [])].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (!allRows.length) return res.json({ fichiers: [] });

    const groupeIds = [...new Set(allRows.map(r => r.groupe_id).filter(Boolean))];
    if (!groupeIds.length) return res.json({ fichiers: [] });

    const { data, error } = await supabase
      .from("groupes_fichiers")
      .select("id, nom, url, public_id, type_fichier, taille_ko, created_at, coach_id, groupe_id, visible")
      .in("groupe_id", groupeIds)
      .order("created_at", { ascending: false });

    if (error) throw error;
    // Filtrer les fichiers masqués (visible = false), garder null/true/undefined
    const fichiers = (data || []).filter(f => f.visible !== false);
    res.json({ fichiers });
  } catch (err) {
    console.error("[apprenants/mes-fichiers]", err);
    res.status(500).json({ error: "Erreur récupération fichiers" });
  }
});

// ── GET /api/apprenants/mes-presences ──────────────────────────────────────
router.get("/mes-presences", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    const email = user.email;
    const GA_SELECT = "id, groupe_id, statut, nom_apprenant, prenom_apprenant, email_apprenant, apprenant_id";

    // Chercher toutes les entrées GA (sans filtre de statut)
    const [resEmail, resId] = await Promise.all([
      supabase.from("groupes_apprenants").select(GA_SELECT).ilike("email_apprenant", email),
      supabase.from("groupes_apprenants").select(GA_SELECT).eq("apprenant_id", user.id),
    ]);

    const seen = new Set();
    const allRows = [...(resEmail.data || []), ...(resId.data || [])].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (!allRows.length) {
      console.log(`[mes-presences] aucun GA trouvé pour email=${email} uid=${user.id}`);
      return res.json({ presences: [], parDate: {} });
    }

    const gaRow = allRows.find(r => r.statut === "actif") || allRows[0];
    const gaIds = allRows.map(r => r.id);
    const groupeIds = [...new Set(allRows.map(r => r.groupe_id).filter(Boolean))];
    console.log(`[mes-presences] gaRow id=${gaRow.id} groupe_id=${gaRow.groupe_id} nom=${gaRow.nom_apprenant} | allGA: ${allRows.length} | gaIds: ${gaIds} | groupeIds: ${groupeIds}`);

    // Stratégie 1: chercher par ga_id
    const { data: byGaId } = await supabase
      .from("groupes_presences")
      .select("id, date_seance, statut, note, nom_apprenant, prenom_apprenant, ga_id, groupe_id")
      .in("ga_id", gaIds)
      .order("date_seance", { ascending: false });

    let data = byGaId || [];
    console.log(`[mes-presences] par ga_id: ${data.length}`);

    // Stratégie 2: fallback par nom dans tous les groupes de l'apprenant
    if (!data.length && groupeIds.length && gaRow.nom_apprenant) {
      const { data: allPresences } = await supabase
        .from("groupes_presences")
        .select("id, date_seance, statut, note, nom_apprenant, prenom_apprenant, ga_id, groupe_id")
        .in("groupe_id", groupeIds)
        .order("date_seance", { ascending: false });

      const nomRef = gaRow.nom_apprenant.toLowerCase().trim();
      const prenomRef = (gaRow.prenom_apprenant || "").toLowerCase().trim();
      data = (allPresences || []).filter(p => {
        const pNom = (p.nom_apprenant || "").toLowerCase().trim();
        const pPrenom = (p.prenom_apprenant || "").toLowerCase().trim();
        return pNom === nomRef || (prenomRef && pNom === prenomRef) ||
               (prenomRef && pPrenom === nomRef) ||
               pNom.includes(nomRef.split(" ").pop()) ||
               nomRef.includes(pNom);
      });
      console.log(`[mes-presences] fallback nom "${nomRef}" dans groupes [${groupeIds}]: ${data.length} (total séances: ${(allPresences||[]).length})`);
    }

    const parDate = {};
    data.forEach(p => {
      if (!parDate[p.date_seance]) parDate[p.date_seance] = [];
      parDate[p.date_seance].push(p);
    });

    res.json({ presences: data, parDate });
  } catch (err) {
    console.error("[apprenants/mes-presences]", err);
    res.status(500).json({ error: "Erreur récupération présences" });
  }
});

// ══════════════════════════════════════════════════════════════
// ÉVALUATIONS GROUPES - côté apprenant
// ══════════════════════════════════════════════════════════════

// GET /api/apprenants/mes-evaluations
// Retourne les évaluations publiées du groupe de l'apprenant + ses résultats
router.get("/mes-evaluations", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    // Trouver le groupes_apprenants de cet utilisateur
    // « retire » EST INCLUS : un apprenant qui a arrêté sa formation garde l'accès à ce qu'il
    // a déjà suivi - c'est ce que lui promet le message d'arrêt. L'exclure fermait son
    // historique entier, et l'écran affichait « Compte non lié à un groupe » à quelqu'un qui
    // avait bien été inscrit. L'arrêt ferme l'AVENIR, pas le passé.
    // 1. Chercher par apprenant_id (lien Supabase auth établi)
    let ga = null;

    // 1. Chercher par apprenant_id (lien Supabase auth établi)
    const { data: gasById, error: errById } = await supabase
      .from("groupes_apprenants")
      .select("id, groupe_id, statut, apprenant_id, email_apprenant, date_ajout, date_retrait, note")
      .eq("apprenant_id", user.id)
      .in("statut", ["actif", "en_cours", "inscrit", "en_attente", "pending", "archive", "retire"]);
    if (errById) console.warn("[mes-evaluations] erreur recherche par apprenant_id:", errById.message);
    if (gasById && gasById.length > 0) ga = gasById[0];

    // 2. Fallback par email si pas encore lié
    if (!ga && user.email) {
      const { data: gasByEmail, error: errByEmail } = await supabase
        .from("groupes_apprenants")
        .select("id, groupe_id, statut, apprenant_id, email_apprenant, date_ajout, date_retrait, note")
        .ilike("email_apprenant", user.email)
        .in("statut", ["actif", "en_cours", "inscrit", "en_attente", "pending", "archive", "retire"]);
      if (errByEmail) console.warn("[mes-evaluations] erreur recherche par email:", errByEmail.message);
      if (gasByEmail && gasByEmail.length > 0) {
        ga = gasByEmail[0];
        // Auto-lier l'apprenant_id pour les prochains appels
        if (!ga.apprenant_id) {
          await supabase.from("groupes_apprenants")
            .update({ apprenant_id: user.id })
            .eq("id", ga.id);
        }
      }
    }

    if (!ga) {
      console.warn(`[mes-evaluations] aucun groupe trouvé pour user ${user.id} / ${user.email}`);
      return res.json({ evaluations: [], ga_id: null, debug: "aucun groupe actif trouvé pour cet apprenant" });
    }
    console.log(`[mes-evaluations] ga trouvé: id=${ga.id} groupe=${ga.groupe_id} statut=${ga.statut}`);

    // Évaluations publiées du groupe
    const { data: evals } = await supabase
      .from("evaluations_groupes")
      .select("id, titre, type, categorie, type_rendu, instructions, questions, ressource_url, blocs, sur_toeic, duree_min, date_evaluation, heure_debut, date_ouverture, heure_ouverture, statut, created_at")
      .eq("groupe_id", ga.groupe_id)
      .in("statut", ga.statut === "archive" ? ["publie", "cloture"] : ["publie"])
      .order("date_evaluation", { ascending: false });

    /* BORNÉES A SA FENÊTRE DE PRÉSENCE, comme les contenus e-learning.
       Un apprenant qui a arrêté voyait apparaître en « à rendre » les devoirs publiés
       APRÈS son départ - des travaux qu'on ne lui a jamais demandés, et qu'il ne peut
       plus rendre. On lui laisse ce qui relève de sa période, rien de plus. */
    const evalsFenetre = bornerAFenetre(evals, ga, (e) => e.date_ouverture || e.date_evaluation || e.created_at);

    if (!evalsFenetre || evalsFenetre.length === 0) return res.json({ evaluations: [], ga_id: ga.id });

    // Résultats de cet apprenant
    const { data: resultats } = await supabase
      .from("resultats_evaluations_groupes")
      .select("*")
      .eq("ga_id", ga.id)
      .in("evaluation_id", evalsFenetre.map(e => e.id));

    const resultatsMap = {};
    (resultats || []).forEach(r => { resultatsMap[r.evaluation_id] = r; });

    // Ne pas exposer les bonnes réponses si l'apprenant n'a pas encore soumis
    const enriched = evalsFenetre.map(e => {
      const resultat = resultatsMap[e.id] || null;
      const dejaRendu = resultat && resultat.statut !== "a_faire";
      const redact = q => dejaRendu ? q : { ...q, correct: undefined, explication: undefined };
      return {
        ...e,
        questions: (e.questions || []).map(redact),
        blocs: (e.blocs || []).map(b => ({ ...b, questions: (b.questions || []).map(redact) })),
        resultat,
      };
    });

    res.json({ evaluations: enriched, ga_id: ga.id });
  } catch (err) {
    console.error("[apprenants/mes-evaluations]", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/apprenants/upload-audio - enregistrement micro navigateur pour un bloc Speaking
router.post("/upload-audio", (req, res) => {
  uploadRendu.single("audio")(req, res, async (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.message });
    try {
      const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
      if (!bearer) return res.status(401).json({ error: "Non authentifié" });
      const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
      if (authErr || !user) return res.status(401).json({ error: "Token invalide" });
      if (!req.file) return res.status(400).json({ error: "Aucun fichier audio reçu" });

      const pubId = `speaking_${user.id}_${Date.now()}`;
      const url = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "bet/dash-devoirs-rendus/speaking", resource_type: "video", public_id: pubId },
          (error, result) => error ? reject(error) : resolve(result.secure_url)
        );
        stream.end(req.file.buffer);
      });
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erreur upload audio" });
    }
  });
});

// POST /api/apprenants/evaluations/:evalId/soumettre
// Accepte JSON (texte/QCM) OU multipart/form-data (fichier → Cloudinary)
router.post("/evaluations/:evalId/soumettre", (req, res) => {
  uploadRendu.single("fichier")(req, res, async (multerErr) => {
    if (multerErr) return res.status(400).json({ error: multerErr.message });
    try {
      const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
      if (!bearer) return res.status(401).json({ error: "Non authentifié" });
      const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
      if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

      const { evalId } = req.params;
      const body = req.body || {};

      // ga_id peut arriver comme champ JSON ou FormData
      const ga_id = body.ga_id;
      if (!ga_id) return res.status(400).json({ error: "ga_id requis" });

      // Récupérer l'évaluation
      const { data: eval0 } = await supabase
        .from("evaluations_groupes")
        .select("*")
        .eq("id", evalId)
        .eq("statut", "publie")
        .maybeSingle();
      if (!eval0) return res.status(404).json({ error: "Évaluation introuvable ou non publiée" });

      // Vérifier ouverture (date_ouverture)
      if (eval0.date_ouverture) {
        const hOuv = eval0.heure_ouverture || "00:00";
        const ouverture = new Date(`${eval0.date_ouverture}T${hOuv}:00`);
        if (new Date() < ouverture) {
          return res.status(403).json({ error: "Ce devoir n'est pas encore ouvert.", code: "NOT_YET_OPEN" });
        }
      }

      // Vérifier deadline
      if (eval0.date_evaluation) {
        const hLim = eval0.heure_debut || "23:59";
        const deadline = new Date(`${eval0.date_evaluation}T${hLim}:00`);
        if (new Date() > deadline) {
          return res.status(403).json({ error: "Le délai de soumission est dépassé.", code: "DEADLINE_PASSED" });
        }
      }

      // Vérifier que l'apprenant est dans ce groupe
      const { data: ga } = await supabase
        .from("groupes_apprenants")
        .select("id, groupe_id, nom_apprenant, prenom_apprenant, groupes(nom, coach_id)")
        .eq("id", ga_id)
        .eq("apprenant_id", user.id)
        .maybeSingle();
      if (!ga) return res.status(403).json({ error: "Accès refusé" });

      // Modification autorisée tant que le coach n'a pas corrigé - une fois "corrige", le
      // rendu est figé (l'apprenant ne doit plus pouvoir écraser une note déjà donnée).
      const { data: resultatExistant } = await supabase
        .from("resultats_evaluations_groupes")
        .select("statut, fichier_url, fichier_nom")
        .eq("evaluation_id", evalId).eq("ga_id", ga_id).maybeSingle();
      if (resultatExistant?.statut === "corrige") {
        return res.status(403).json({ error: "Ce devoir a déjà été corrigé par votre coach - vous ne pouvez plus le modifier.", code: "DEJA_CORRIGE" });
      }

      // reponses_qcm peut arriver comme string JSON via FormData
      let reponses_qcm = {};
      if (body.reponses_qcm) {
        reponses_qcm = typeof body.reponses_qcm === "string" ? JSON.parse(body.reponses_qcm) : body.reponses_qcm;
      }
      // Ancien champ "reponses" (compatibilité)
      if (body.reponses && Object.keys(reponses_qcm).length === 0) {
        reponses_qcm = typeof body.reponses === "string" ? JSON.parse(body.reponses) : body.reponses;
      }

      // reponses_blocs - soumission "mixte" (plusieurs blocs QCM/Listening/Audio/Quiz/Speaking
      // dans une même évaluation) : { [bloc_id]: { "0": "optionA", ..., texte: "..." } }
      let reponses_blocs = {};
      if (body.reponses_blocs) {
        reponses_blocs = typeof body.reponses_blocs === "string" ? JSON.parse(body.reponses_blocs) : body.reponses_blocs;
      }

      // Upload fichier sur Cloudinary si présent - sinon, en cas de modification d'un rendu
      // déjà envoyé, on garde le fichier précédent au lieu de l'écraser avec null (l'apprenant
      // qui modifie sa réponse texte sans redéposer de fichier ne doit pas perdre son dépôt).
      let fichier_url = resultatExistant?.fichier_url || null;
      let fichier_nom = resultatExistant?.fichier_nom || null;
      if (req.file) {
        const ext = req.file.originalname.split(".").pop().toLowerCase();
        const isVideo = ["mp3","mp4","mov","avi","mkv","wav","ogg"].includes(ext);
        const isImage = ["jpg","jpeg","png","gif","webp","bmp"].includes(ext);
        const resType = isVideo ? "video" : isImage ? "image" : "raw";
        const pubId   = `dash_devoirs/${evalId}_${ga_id}_${Date.now()}.${ext}`;
        await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "bet/dash-devoirs-rendus", resource_type: resType, public_id: pubId },
            (error, result) => {
              if (error) reject(error);
              else { fichier_url = result.secure_url; fichier_nom = req.file.originalname; resolve(); }
            }
          );
          stream.end(req.file.buffer);
        });
      }

      // Calcul note automatique si QCM (format unique) - inchangé, rétrocompatible
      let note = null;
      const questions = Array.isArray(eval0.questions) ? eval0.questions : [];
      const isQcm = ["qcm","positionnement","listening","audio"].includes(eval0.type);
      if (isQcm && questions.length > 0 && Object.keys(reponses_qcm).length > 0) {
        const bonnes = questions.filter((q, i) => reponses_qcm[String(i)] === q.correct).length;
        const noteMax = eval0.sur_toeic ? 990 : 20;
        note = Math.round((bonnes / questions.length) * noteMax * 10) / 10;
      }

      // Calcul note automatique si "mixte" (blocs) - cumule les bonnes réponses de TOUS les
      // blocs à questions (qcm/listening/audio/quiz), sur le total de questions de ces blocs ;
      // les blocs "speaking" (pas de bonne réponse type) sont ignorés du calcul automatique.
      const blocs = Array.isArray(eval0.blocs) ? eval0.blocs : [];
      const isMixte = eval0.type === "mixte" && blocs.length > 0;
      if (isMixte) {
        const blocsNotables = blocs.filter(b => ["qcm","listening","audio","quiz"].includes(b.type) && (b.questions||[]).length > 0);
        const totalQuestions = blocsNotables.reduce((s, b) => s + b.questions.length, 0);
        if (totalQuestions > 0 && Object.keys(reponses_blocs).length > 0) {
          const bonnes = blocsNotables.reduce((s, b) => {
            const rep = reponses_blocs[b.id] || {};
            return s + b.questions.filter((q, i) => rep[String(i)] === q.correct).length;
          }, 0);
          const noteMax = eval0.sur_toeic ? 990 : 20;
          note = Math.round((bonnes / totalQuestions) * noteMax * 10) / 10;
        }
      }

      const contenu_texte = body.contenu_texte || body.texte || null;
      const aReponduBlocs = Object.keys(reponses_blocs).length > 0;
      const type_soumission = req.file ? "fichier" : (Object.keys(reponses_qcm).length > 0 || aReponduBlocs) ? "qcm" : "texte";
      const noteCalculee = isQcm ? note : isMixte ? note : null;

      const { data, error } = await supabase
        .from("resultats_evaluations_groupes")
        .upsert({
          evaluation_id:  evalId,
          ga_id,
          groupe_id:      eval0.groupe_id,
          type_soumission,
          contenu_texte,
          reponses_qcm,
          reponses_blocs,
          fichier_url,
          fichier_nom,
          note:           noteCalculee,
          note_max:       eval0.sur_toeic ? 990 : 20,
          statut:         noteCalculee !== null ? "corrige" : "rendu",
          rendu_at:       new Date().toISOString(),
        }, { onConflict: "evaluation_id,ga_id" })
        .select().single();
      if (error) throw error;

      // Gamification : le contrôle de deadline plus haut garantit qu'on est forcément "à
      // temps" ici - la soumission a été rejetée avant si le délai était dépassé.
      if (eval0.categorie === "devoir") {
        attribuerPoints(user.id, "devoir", evalId, 15, `Devoir rendu à temps - ${eval0.titre || ""}`).catch(() => {});
      }

      // Notifier le coach du groupe - jusqu'ici aucune alerte n'était envoyée à la
      // soumission d'un devoir ou d'une composition/évaluation.
      (async () => {
        try {
          const coachId = ga.groupes?.coach_id;
          if (!coachId) return;
          const nomApp = `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim() || "Un apprenant";
          const label  = eval0.categorie === "devoir" ? "devoir" : eval0.categorie === "examen" ? "examen" : "évaluation";
          await supabase.from("notifications").insert({
            user_id: coachId,
            type:    "devoir_rendu",
            titre:   eval0.categorie === "devoir" ? "📝 Devoir rendu" : "🖊️ Composition rendue",
            message: `${nomApp} a rendu le ${label} "${eval0.titre || ""}" (${ga.groupes?.nom || "groupe"}).`,
            meta:    { evaluation_id: evalId, ga_id, groupe_id: eval0.groupe_id },
            source:  "dash",
            lu:      false,
          });
        } catch (e) { console.error("[notif coach evaluation soumise]", e.message); }
      })();

      res.status(201).json({ resultat: data, note });
    } catch (err) {
      console.error("[apprenants/evaluations/soumettre]", err);
      res.status(500).json({ error: err.message });
    }
  });
});

// DELETE /api/apprenants/evaluations/:evalId/rendu - annule un rendu déjà envoyé (retour à "à
// rendre"), uniquement tant que le coach ne l'a pas corrigé.
router.delete("/evaluations/:evalId/rendu", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    const { evalId } = req.params;
    const ga_id = req.query.ga_id || req.body?.ga_id;
    if (!ga_id) return res.status(400).json({ error: "ga_id requis" });

    const { data: ga } = await supabase
      .from("groupes_apprenants").select("id").eq("id", ga_id).eq("apprenant_id", user.id).maybeSingle();
    if (!ga) return res.status(403).json({ error: "Accès refusé" });

    const { data: resultatExistant } = await supabase
      .from("resultats_evaluations_groupes")
      .select("id, statut").eq("evaluation_id", evalId).eq("ga_id", ga_id).maybeSingle();
    if (!resultatExistant) return res.status(404).json({ error: "Aucun rendu à annuler" });
    if (resultatExistant.statut === "corrige") {
      return res.status(403).json({ error: "Ce devoir a déjà été corrigé par votre coach - vous ne pouvez plus l'annuler.", code: "DEJA_CORRIGE" });
    }

    const { error } = await supabase.from("resultats_evaluations_groupes").delete().eq("id", resultatExistant.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[apprenants/evaluations/rendu DELETE]", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * L'équipe réellement rattachée à un apprenant : coach de sa classe, assistante de son
 * dossier, PA Advisor.
 *
 * Extrait de la route `mes-contacts` pour que l'envoi de message (`/contacter`) valide son
 * destinataire sur EXACTEMENT la même source. Sans ce partage, la route d'envoi devrait
 * refaire la résolution - et la moindre divergence entre les deux ouvrirait un relais de
 * courrier : un apprenant connecté ferait partir un mail des serveurs BET vers l'adresse
 * de son choix.
 */
async function contactsDeLApprenant(user) {
    // Trouver le groupes_apprenants de l'apprenant
    let ga = null;
    const { data: gaById } = await supabase.from("groupes_apprenants")
      .select("id, groupe_id, email_apprenant, note, groupes(id, nom, coach_id)")
      .eq("apprenant_id", user.id)
      .in("statut", ["actif", "en_cours", "inscrit", "archive", "retire"])
      .limit(1).maybeSingle();
    if (gaById) ga = gaById;
    else if (user.email) {
      const { data: gaByEmail } = await supabase.from("groupes_apprenants")
        .select("id, groupe_id, email_apprenant, note, groupes(id, nom, coach_id)")
        .ilike("email_apprenant", user.email)
        .in("statut", ["actif", "en_cours", "inscrit", "archive", "retire"])
        .limit(1).maybeSingle();
      if (gaByEmail) ga = gaByEmail;
    }

    const contacts = [];

    // 1. Coach de la classe
    const coachId = ga?.groupes?.coach_id;
    if (coachId) {
      const { data: coach } = await supabase.from("utilisateurs")
        .select("id, nom, prenom, email, telephone, role")
        .eq("id", coachId).maybeSingle();
      if (coach) contacts.push({
        id: coach.id, role: "Coach", nom: `${coach.prenom || ""} ${coach.nom || ""}`.trim(),
        email: coach.email || null, telephone: coach.telephone || null,
        disponible: "Selon planning de cours",
      });
    }

    // 2. Commercial / Onboarding via assignations_parcours
    // Pour un profil enfant, email_apprenant est un identifiant technique
    // (xxx@betacademy.app), jamais égal à prospect_email (celui du PARENT) - un match par
    // email échoue donc systématiquement. Le lien fiable est assignation_id, posé dans
    // groupes_apprenants.note à la création de la classe (cf. CommercialDashboard.jsx).
    let assignationIdDeNote = null;
    try { assignationIdDeNote = JSON.parse(ga?.note || "{}").assignation_id || null; } catch {}
    const emailApprenant = ga?.email_apprenant || user.email;
    if (assignationIdDeNote || emailApprenant) {
      const apQuery = assignationIdDeNote
        ? supabase.from("assignations_parcours").select("assistantes(id, email, nom, prenom)").eq("id", assignationIdDeNote).maybeSingle()
        : supabase.from("assignations_parcours").select("assistantes(id, email, nom, prenom)").ilike("prospect_email", emailApprenant).limit(1).maybeSingle();
      const { data: ap } = await apQuery;
      const asst = ap?.assistantes;
      if (asst) {
        let staffInfo = null;
        if (asst.email) {
          const { data: u } = await supabase.from("utilisateurs")
            .select("id, nom, prenom, email, telephone, role").ilike("email", asst.email).maybeSingle();
          staffInfo = u;
        }
        if (staffInfo) {
          const roleLabel = staffInfo.role === "commercial" ? "Commercial(e)"
            : staffInfo.role === "onboarding" ? "Onboarding"
            : staffInfo.role === "customer_care" ? "Customer Care"
            : "Assistante";
          contacts.push({
            id: staffInfo.id, role: roleLabel,
            nom: `${staffInfo.prenom || ""} ${staffInfo.nom || ""}`.trim(),
            email: staffInfo.email || null, telephone: staffInfo.telephone || null,
            disponible: "Lun-Ven 8h-18h",
          });
        }
      }

      // 3. PA Advisor lié à la classe (via created_by du groupe ou assignation)
      if (ga?.groupes) {
        const { data: paAdvisors } = await supabase.from("utilisateurs")
          .select("id, nom, prenom, email, telephone, role")
          .eq("role", "pedagogical_advisor")
          .eq("actif", true)
          .limit(1);
        if (paAdvisors && paAdvisors.length > 0) {
          const pa = paAdvisors[0];
          contacts.push({
            id: pa.id, role: "PA Advisor",
            nom: `${pa.prenom || ""} ${pa.nom || ""}`.trim(),
            email: pa.email || null, telephone: pa.telephone || null,
            disponible: "Sur rendez-vous",
          });
        }
      }
    }

  return contacts;
}

// GET /api/apprenants/mes-contacts
// Retourne le coach, le commercial et l'onboarding liés à la classe de l'apprenant
router.get("/mes-contacts", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    res.json({ contacts: await contactsDeLApprenant(user) });
  } catch (err) {
    console.error("[apprenants/mes-contacts]", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/apprenants/contacter
 * L'apprenant écrit à un membre de SON équipe, depuis son espace.
 *
 * L'onglet « Contacts & Support » n'offrait que des liens `mailto:`/`tel:` : sur un poste
 * sans client de messagerie configuré, cliquer « Email » n'ouvrait rien, et « Appeler » non
 * plus. Le message part donc désormais du serveur.
 *
 * Le destinataire est désigné par son `id`, jamais par son adresse : on le cherche dans les
 * contacts résolus pour CET utilisateur, et on refuse tout ce qui n'y figure pas.
 */
router.post("/contacter", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    const { destinataire_id, sujet, message } = req.body || {};
    if (!destinataire_id) return res.status(400).json({ error: "Destinataire manquant" });
    const sujetNet   = String(sujet   || "").trim().slice(0, 150);
    const messageNet = String(message || "").trim().slice(0, 4000);
    if (!messageNet) return res.status(400).json({ error: "Le message est vide" });

    const contacts = await contactsDeLApprenant(user);
    const cible = contacts.find(c => String(c.id) === String(destinataire_id));
    if (!cible)        return res.status(403).json({ error: "Ce contact ne fait pas partie de votre équipe" });
    if (!cible.email)  return res.status(400).json({ error: "Ce contact n'a pas d'adresse e-mail enregistrée" });

    // L'expéditeur : ses vraies coordonnées, pour que le destinataire réponde directement.
    const { data: profil } = await supabase
      .from("utilisateurs").select("nom, prenom, email, telephone").eq("id", user.id).maybeSingle();
    const nomExp = `${profil?.prenom || user.user_metadata?.prenom || ""} ${profil?.nom || user.user_metadata?.nom || ""}`.trim() || "Un apprenant BET";
    // Une adresse technique (@betacademy.app) n'est pas une boîte : ne pas la proposer en réponse.
    const emailExp = profil?.email && !profil.email.endsWith("@betacademy.app") ? profil.email : "";

    await sendContactNotificationEmail({
      to:        cible.email,
      nom:       nomExp,
      email:     emailExp,
      telephone: profil?.telephone || user.user_metadata?.telephone || "",
      type:      `Apprenant → ${cible.role}`,
      sujet:     sujetNet || "Message depuis l'espace apprenant",
      message:   messageNet,
    });

    return res.json({ success: true, destinataire: cible.nom || cible.role });
  } catch (err) {
    console.error("[apprenants/contacter]", err);
    return res.status(500).json({ error: "L'envoi a échoué. Réessayez dans un instant." });
  }
});

// GET /api/apprenants/mes-resultats
// Tous les résultats corrigés de l'apprenant (note + commentaire coach)
router.get("/mes-resultats", async (req, res) => {
  try {
    const bearer = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!bearer) return res.status(401).json({ error: "Non authentifié" });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
    if (authErr || !user) return res.status(401).json({ error: "Token invalide" });

    // Recherche avec fallback email
    let ga = null;
    const { data: gaById } = await supabase.from("groupes_apprenants")
      .select("id, groupe_id").eq("apprenant_id", user.id)
      .in("statut", ["actif", "en_cours", "inscrit", "archive", "retire"]).limit(1).maybeSingle();
    if (gaById) ga = gaById;
    else if (user.email) {
      const { data: gaByEmail } = await supabase.from("groupes_apprenants")
        .select("id, groupe_id").ilike("email_apprenant", user.email)
        .in("statut", ["actif", "en_cours", "inscrit", "archive", "retire"]).limit(1).maybeSingle();
      if (gaByEmail) ga = gaByEmail;
    }
    if (!ga) return res.json({ resultats: [] });

    const { data: resultats, error } = await supabase
      .from("resultats_evaluations_groupes")
      .select("*, evaluation:evaluations_groupes(titre, type, categorie, sur_toeic, date_evaluation)")
      .eq("ga_id", ga.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    res.json({ resultats: resultats || [], ga_id: ga.id });
  } catch (err) {
    console.error("[apprenants/mes-resultats]", err);
    res.status(500).json({ error: err.message });
  }
});


/* ══════════════════════════════════════════════════════════════
   CHANGER L'E-MAIL DE CONNEXION D'UN APPRENANT
══════════════════════════════════════════════════════════════ */

/** Les rôles qui gèrent les dossiers apprenants au quotidien - ce sont eux qui reçoivent
 *  la demande de changement d'adresse. */
const ROLES_CHANGEMENT_EMAIL = [
  "onboarding", "commercial", "admin_commercial", "super_admin", "admin",
];

/**
 * PATCH /api/apprenants/:id/email - change l'identifiant de connexion.
 *
 * CE QUI NE BOUGE PAS : l'identifiant `utilisateurs.id`, qui est aussi celui du compte
 * Auth. Classes, présences, paiements, cours lus, notes - tout pend de cet identifiant,
 * jamais de l'adresse. Changer l'e-mail ne fait donc rien perdre du tableau de bord.
 *
 * CE QUI BOUGE : l'adresse est RECOPIÉE à trois endroits en plus de l'authentification,
 * et le code s'en sert comme repli quand `apprenant_id` est absent. Les oublier laisserait
 * des rattachements introuvables - ou, pire, retrouvables par quelqu'un d'autre le jour où
 * l'ancienne adresse serait réattribuée.
 *
 * CE QU'ON NE TOUCHE PAS : `campagne_reponses.email`. C'est l'archive d'un formulaire
 * rempli à une date donnée, pas une identité. La réécrire falsifierait un historique.
 */
router.patch("/:id/email", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const nouveau = String(req.body?.email || "").trim().toLowerCase();

  try {
    if (!ROLES_CHANGEMENT_EMAIL.includes(req.role)) {
      return res.status(403).json({ error: "Seules les assistantes onboarding et commerciales peuvent modifier un e-mail de connexion." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nouveau)) {
      return res.status(400).json({ error: "Adresse e-mail invalide." });
    }

    const { data: cible } = await supabase
      .from("utilisateurs").select("id, prenom, nom, email, role").eq("id", id).maybeSingle();
    if (!cible) return res.status(404).json({ error: "Apprenant introuvable" });
    const ancien = (cible.email || "").toLowerCase();
    if (ancien === nouveau) return res.status(409).json({ error: "C'est déjà l'adresse actuelle." });

    // L'unicité est vérifiée AVANT de toucher à quoi que ce soit : Auth refuserait de
    // toute façon, mais après coup, une fois les copies déjà réécrites.
    const { data: occupe } = await supabase
      .from("utilisateurs").select("id, prenom, nom").ilike("email", nouveau).neq("id", id).maybeSingle();
    if (occupe) {
      return res.status(409).json({
        error: `Cette adresse est déjà celle de ${occupe.prenom || ""} ${occupe.nom || ""}`.trim() + ". Deux comptes ne peuvent pas la partager.",
      });
    }

    /* L'AUTHENTIFICATION D'ABORD. C'est la seule écriture qui peut échouer pour une raison
       qu'on ne contrôle pas (adresse déjà connue d'Auth, quota). La faire en premier évite
       de réécrire trois tables pour rien. `email_confirm` : sans lui, Supabase attend une
       confirmation par courrier et l'apprenant ne peut plus se connecter entre-temps. */
    const { error: eAuth } = await supabase.auth.admin.updateUserById(id, {
      email: nouveau, email_confirm: true,
    });
    if (eAuth) {
      return res.status(409).json({ error: `Changement refusé par l'authentification : ${eAuth.message}` });
    }

    // Les copies. Chacune est indépendante : `apprenants` peut ne pas exister pour un
    // compte créé autrement, et `groupes_apprenants` peut porter plusieurs lignes.
    const copies = await Promise.all([
      supabase.from("utilisateurs").update({ email: nouveau }).eq("id", id),
      supabase.from("apprenants").update({ email: nouveau }).eq("id", id),
      supabase.from("groupes_apprenants").update({ email_apprenant: nouveau }).eq("apprenant_id", id),
      // Les lignes historiques rattachées par la seule adresse : sans ce second passage,
      // un rattachement créé avant l'existence du compte resterait sur l'ancienne.
      supabase.from("groupes_apprenants").update({ email_apprenant: nouveau }).ilike("email_apprenant", ancien),
    ]);
    const echecs = copies.filter(c => c.error).map(c => c.error.message);

    if (echecs.length) {
      /* RETOUR EN ARRIÈRE sur l'authentification. Un compte dont l'adresse de connexion a
         changé mais dont les tables portent l'ancienne est le pire des deux mondes :
         l'apprenant se connecte, et la plateforme ne le reconnaît plus. */
      await supabase.auth.admin.updateUserById(id, { email: ancien, email_confirm: true }).catch(() => {});
      console.error("[apprenants/email] copies échouées, retour en arrière :", echecs.join(" | "));
      return res.status(500).json({ error: "Changement annulé : la mise à jour du dossier a échoué." });
    }

    logAudit({
      acteur_id:    req.profil?.id || null,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || null,
      acteur_role:  req.role,
      plateforme:   "dash",
      action_type:  "APPRENANT_EMAIL_MODIFIE",
      module:       "apprenants",
      entite_type:  "user",
      entite_id:    id,
      detail:       `E-mail de connexion de ${cible.prenom} ${cible.nom} : ${ancien} → ${nouveau}`,
      metadata:     { ancien, nouveau },
      statut:       "success",
    }).catch(() => {});

    /* L'apprenant est prévenu À LA NOUVELLE ADRESSE, et SON MOT DE PASSE N'EST PAS TOUCHÉ :
       il n'a demandé qu'un changement d'adresse. Lui en imposer un nouveau lui ferait
       perdre celui qu'il connaît. */
    const envoi = await sendNotificationEmail({
      prenom: cible.prenom || "",
      email: nouveau,
      titre: "Votre adresse de connexion a changé",
      message: `Votre espace BET se connecte désormais avec l'adresse <strong>${nouveau}</strong>, `
        + `au lieu de ${ancien}.<br><br>`
        + `<strong>Votre mot de passe reste le même</strong> - rien d'autre ne change, et vous retrouvez `
        + `votre espace exactement comme vous l'aviez laissé. Si vous ne vous en souvenez plus, `
        + `utilisez « Mot de passe oublié » sur la page de connexion.`,
      ctaLabel: "Accéder à mon espace",
      ctaUrl: `${process.env.DASH_URL || "https://dash.binniesenglish.com"}/connexion`,
      tag: "changement-email",
    }).catch(e => ({ ok: false, erreur: e.message }));

    res.json({
      ok: true,
      email: nouveau,
      ancien,
      // L'envoi peut échouer sans que le changement soit faux : on le dit plutôt que de
      // laisser croire que l'apprenant a été prévenu.
      email_envoye: envoi?.ok !== false,
    });
  } catch (err) {
    console.error("[apprenants/email]", err.message || err);
    res.status(500).json({ error: "Changement impossible" });
  }
});

export default router;