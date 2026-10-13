// Routes inscriptions_elearning - parcours entreprise → onboarding → placement → classe
import { Router } from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, resolvePermissions, messagePermissionRefusee } from "../middlewares/requireAdmin.js";
import { notifyRole as _notifyRole, notifyEntreprise as _notifyEntreprise } from "../services/notifyRole.js";

/* ── TOUTE NOTIFICATION ÉCRITE ICI EST UNE NOTIFICATION BET E-LEARNING ──
   `notifyRole` / `notifyUser` / `notifyEntreprise` écrivent `source: 'dash'` PAR DÉFAUT,
   tandis que la cloche de bet-elearning n'interroge que `?source=bet-elearning` et que la
   route filtre strictement dessus. Chaque appel de ce fichier qui oubliait la source
   produisait donc une notification REÉLLEMENT CRÉÉE mais INVISIBLE pour son destinataire -
   la panne était silencieuse des deux côtés.
   On enveloppe à l'import plutôt que de corriger chaque appel : un appel ajouté demain
   hérite du bon comportement sans qu'on ait à y penser. Une notification qui doit partir
   vers dash peut toujours surcharger `source` explicitement. ── */
const _SRC = { source: 'bet-elearning' };
const notifyRole       = (r, p, x) => _notifyRole(r, { ..._SRC, ...p }, x);
const notifyEntreprise = (e, p)    => _notifyEntreprise(e, { ..._SRC, ...p });

import { logAudit } from "../middlewares/logAudit.js";
import { isRealEmail, phoneToVirtualEmail, identifiantTechniqueApprenant, normalizePhone } from "./apprenants.js";
import { sendApprenantWelcomeEmail } from "../services/emailService.js";

const router = Router();

function acteurAudit(req) {
  return {
    acteur_id:    req.profil?.id    || null,
    acteur_nom:   `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
    acteur_email: req.profil?.email || req.user?.email || null,
    acteur_role:  req.role          || "admin",
    plateforme:   "bet-elearning",
  };
}

/* L'ordre du parcours, et qui tient la main à chaque étape :
 *   recu → verifie → transmis_placement → teste → transmis_onboarding → assigne → actif
 *   └──── assistante e-learning ────┘    agent   └ assistante ┘  └──── onboarding ────┘
 *                                      placement
 * `transmis_onboarding` marque le passage de main explicite entre l'assistante, qui lit le
 * résultat du test, et l'Onboarding, qui choisit la classe sur ce niveau mesuré. Colonne
 * TEXTE sans contrainte en base : son ajout n'a demandé aucune migration.
 * Constante déclarative - aucun contrôle ne s'y adosse aujourd'hui. */
const STATUTS = ['recu', 'verifie', 'transmis_placement', 'teste', 'transmis_onboarding', 'assigne', 'actif'];

// Normalise un email (le matching parent ↔ enfant se fait sur cette valeur exacte)
const normEmail = (e) => e ? e.toLowerCase().trim() : null;

// ── Helper : créer compte Supabase Auth + utilisateurs pour un apprenant elearning ──
async function creerCompteApprenant({ email, nom_complet, telephone, date_naissance }) {
  if (!email) return { ok: false, raison: 'email_manquant' };

  // Vérifier si un compte Supabase Auth existe déjà pour cet email
  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = (listData?.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());

  let uid;
  let mdpTemp;

  if (existing) {
    // Compte déjà existant → on met à jour le mot de passe et on retourne l'id
    uid = existing.id;
    mdpTemp = "BET@" + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(6, "X") + "!";
    await supabase.auth.admin.updateUserById(uid, { password: mdpTemp, email_confirm: true });
  } else {
    // Créer le compte Supabase Auth
    mdpTemp = "BET@" + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(6, "X") + "!";
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: mdpTemp,
      email_confirm: true,
      user_metadata: { nom: nom_complet, role: 'apprenant', date_naissance: date_naissance || null },
    });
    if (authErr) return { ok: false, raison: authErr.message };
    uid = authData.user.id;
  }

  // Insérer ou mettre à jour dans utilisateurs
  const nomParts = (nom_complet || '').trim().split(' ');
  const nom    = nomParts[0] || nom_complet;
  const prenom = nomParts.slice(1).join(' ') || '';

  await supabase.from('utilisateurs').upsert({
    id: uid, email: email.toLowerCase().trim(),
    nom, prenom, telephone: telephone || null,
    role: 'apprenant', actif: true,
    mdp_temporaire: true, mdp_initial: mdpTemp,
  }, { onConflict: 'id' });

  /* ── L'E-MAIL DE BIENVENUE PARTAIT POUR LES APPRENANTS DE DASH, JAMAIS POUR CEUX D'ICI ──
     `sendApprenantWelcomeEmail` existe depuis toujours et était appelée depuis
     `apprenants.js` et `parcours.js` - trois appels, aucun dans ce fichier. L'assignation
     e-learning créait donc un compte, générait un mot de passe, le stockait... et s'arrêtait
     là. L'apprenant avait un accès dont il ignorait l'existence.

     UNE ADRESSE TECHNIQUE NE REÇOIT RIEN. Un apprenant sans e-mail propre se voit attribuer
     un identifiant dérivé de son téléphone (`phoneToVirtualEmail`) : écrire à cette adresse
     serait écrire dans le vide, et compter l'envoi comme fait serait un mensonge. */
  let envoiOk = false;
  if (isRealEmail(email)) {
    try {
      // `plateforme` dirige le bouton « Se connecter » vers BET E-Learning et non vers
      // le tableau de bord du présentiel, où ce compte n'ouvre rien.
      await sendApprenantWelcomeEmail({ prenom, nom, email, mdpTemp, compteExistant: !!existing, plateforme: 'bet-elearning' });
      envoiOk = true;
    } catch (e) {
      console.error('[inscriptions-elearning] e-mail de bienvenue non parti:', e.message || e);
    }
  }

  /* `bienvenue` et `acces` ne sont cochées QUE si l'e-mail est réellement parti.
     L'écran de suivi les déduisait jusqu'ici de la seule présence d'un `apprenant_id`, en
     expliquant que « le compte créé vaut preuve d'envoi » - c'était vrai côté dash, faux
     ici : la checklist affichait 50 % de démarrage sur un dossier où rien n'avait été
     envoyé. On écrit le fait plutôt que de le supposer. */
  const majClasse = { apprenant_id: uid };
  if (envoiOk) majClasse.suivi_checklist = { bienvenue: true, acces: true };

  const { error: errMaj } = await supabase.from('classes_elearning_apprenants')
    .update(majClasse)
    .ilike('email', email);
  // La colonne `suivi_checklist` peut manquer si le SQL n'est pas joué : on réessaie sans
  // elle plutôt que de perdre le rattachement du compte, qui est l'essentiel.
  if (errMaj && (errMaj.code === '42703' || errMaj.code === 'PGRST204')) {
    await supabase.from('classes_elearning_apprenants')
      .update({ apprenant_id: uid }).ilike('email', email);
  }

  return { ok: true, uid, mdp_initial: mdpTemp, email, email_envoye: envoiOk };
}

// ── Middleware léger pour les entreprises (token JWT Supabase suffit) ────────
// Les entreprises s'authentifient avec leur propre session Supabase, sans compte staff
// dans `utilisateurs` - elles ne sont jamais soumises à la matrice de permissions interne.
// Quand l'appelant EST un membre du staff (trouvé dans `utilisateurs`), on résout son profil
// et ses permissions comme authenticateAdmin, pour que requireInscriptionPermission()
// puisse s'appliquer à tous les profils staff - pas seulement Onboarding.
async function authenticateAny(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requis' });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });
    req.authUser = user;

    const { data: profil } = await supabase.from('utilisateurs').select('*').eq('id', user.id).maybeSingle();
    if (profil && profil.role !== 'client_entreprise') {
      req.profil = { ...profil, permissions: await resolvePermissions(profil.role, user.id) };
      req.role   = profil.role;
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Erreur auth' });
  }
}

// ── Gating par la matrice de permissions - staff uniquement ─────────────────
// Les appels sans req.profil (entreprise self-service, ou tout token Supabase valide sans
// compte staff) restent toujours autorisés : la matrice ne gouverne que le personnel BET.
/**
 * QUI EST PRÉVENU QUAND UN DOSSIER ARRIVE.
 *
 * Le parcours a DEUX portes d'entrée, et les deux aboutissent à la même personne :
 *   · la RH de l'entreprise inscrit depuis son portail (import Excel ou saisie unitaire) ;
 *   · l'assistante e-learning inscrit elle-même depuis l'onglet « Inscrire ».
 *
 * Dans les deux cas c'est l'assistante qui vérifie puis transmet au test de niveau. Les
 * quatre noms couvrent la même personne vue sous ses différents rôles réels
 * (`ROLE_MAP_BET` les résout tous vers `admin_elearning` côté écran) ; sans cette liste,
 * un compte créé en `commercial` plutôt qu'en `assistant_elearning` ne recevrait rien.
 *
 * L'ONBOARDING N'Y EST PLUS : son rôle commence à l'assignation, et elle est déjà notifiée
 * à ce moment-là.
 */
const DESTINATAIRES_INSCRIPTION = [
  'assistant_elearning', 'commercial', 'corporate', 'admin_elearning', 'super_admin',
];

function requireInscriptionPermission(action) {
  return (req, res, next) => {
    if (!req.profil || req.role === 'super_admin') return next();
    const perms = req.profil.permissions?.inscriptions;
    // La matrice de permissions n'expose que update/delete/manage pour ce module (voir
    // ACTIONS_ACTIVES_PAR_MODULE.inscriptions côté frontend) - create/read n'y sont jamais
    // cochables. "Gérer" est donc le contrôle total du module : il satisfait n'importe quelle
    // action, sinon ces routes (create, verifier-doublons) restaient bloquées en permanence
    // pour tout le monde, quoi que l'admin coche.
    if (!perms || (!perms[action] && !perms.manage)) {
      return res.status(403).json({ error: messagePermissionRefusee('inscriptions', action) });
    }
    next();
  };
}

// ── GET /api/inscriptions-elearning ──────────────────────────────────────────
// Onboarding : liste de toutes les inscriptions avec filtres
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { statut, entreprise_id, source } = req.query;
    let q = supabase
      .from('inscriptions_elearning')
      .select('*')
      .order('created_at', { ascending: false });

    if (statut)        q = q.eq('statut', statut);
    if (entreprise_id) q = q.eq('entreprise_id', entreprise_id);
    if (source)        q = q.eq('source', source);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Photo de profil - inscriptions_elearning n'a pas de compte apprenant tant que le dossier
    // n'est pas traité ; jointure best-effort par email pour ceux qui ont déjà un compte réel.
    const emails = [...new Set((data || []).map(i => i.email).filter(Boolean).map(e => e.toLowerCase()))];
    let avatars = {};
    if (emails.length) {
      const { data: comptes } = await supabase.from('utilisateurs').select('email, avatar_url').in('email', emails);
      (comptes || []).forEach(c => { if (c.avatar_url) avatars[c.email?.toLowerCase()] = c.avatar_url; });
    }
    const inscriptions = (data || []).map(i => ({ ...i, avatar_url: i.email ? avatars[i.email.toLowerCase()] || null : null }));

    res.json({ inscriptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/inscriptions-elearning/stats ────────────────────────────────────
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .select('statut, source');
    if (error) return res.status(500).json({ error: error.message });

    const stats = (data || []).reduce((acc, r) => {
      acc.total = (acc.total || 0) + 1;
      acc[r.statut] = (acc[r.statut] || 0) + 1;
      return acc;
    }, {});
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/inscriptions-elearning ─────────────────────────────────────────
// Inscription unique - utilisable par l'entreprise (portail) ET onboarding
router.post('/', authenticateAny, requireInscriptionPermission('create'), async (req, res) => {
  try {
    const {
      entreprise_id, entreprise_nom,
      nom_complet, email, telephone, date_naissance, poste, departement,
      langue_souhaitee, niveau_declare, notes_onboarding, objectif_client, source,
      profil_type, prenom_parent, nom_parent, email_parent, telephone_parent,
      classe, niveau_cecr_estime, etablissement,
    } = req.body;

    if (!nom_complet?.trim()) return res.status(400).json({ error: 'nom_complet requis' });

    // Pour un enfant/ado, l'apprenant n'a souvent ni email ni téléphone propre - si le champ
    // générique du formulaire a été laissé vide, on retombe sur le contact du parent/tuteur
    // (même logique que l'import groupé, voir POST /bulk ci-dessous) pour éviter qu'un dossier
    // transmis plus tard à l'Agent Placement se retrouve sans aucun moyen de contact.
    const hasParent  = !!(email_parent || prenom_parent || nom_parent || telephone_parent);
    const profilType = profil_type || (hasParent ? 'enfant' : 'adulte');
    const emailFinal     = normEmail(email) || (profilType !== 'adulte' ? normEmail(email_parent) : null);
    const telephoneFinal = telephone || (profilType !== 'adulte' ? telephone_parent : null) || null;

    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .insert({
        entreprise_id:      entreprise_id    || null,
        entreprise_nom:     entreprise_nom   || null,
        nom_complet:        nom_complet.trim(),
        email:              emailFinal,
        telephone:          telephoneFinal,
        date_naissance:     date_naissance   || null,
        poste:              poste            || null,
        departement:        departement      || null,
        langue_souhaitee:   langue_souhaitee || 'Anglais',
      objectif_client:    objectif_client  || null,
        niveau_declare:     niveau_declare   || null,
        notes_onboarding:   notes_onboarding || null,
        source:             source           || 'entreprise_portail',
        statut:             'recu',
        profil_type:        profilType,
        prenom_parent:      prenom_parent    || null,
        nom_parent:         nom_parent       || null,
        email_parent:       normEmail(email_parent),
        telephone_parent:   telephone_parent || null,
        classe:             classe           || null,
        niveau_cecr_estime: niveau_cecr_estime || null,
        etablissement:      etablissement    || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    /* LA SAISIE UNITAIRE NE PRÉVENAIT PERSONNE - seul l'import groupé notifiait. Une RH
       d'entreprise qui inscrivait un bénéficiaire un par un déposait donc un dossier que
       personne n'attendait : il restait là jusqu'à ce qu'on pense à regarder.
       ON NE NOTIFIE QUE SI L'AUTEUR EST L'ENTREPRISE. `authenticateAny` ne renseigne
       `req.profil` que pour le personnel BET : son absence signe un compte
       `client_entreprise`. Quand l'assistante saisit elle-même, elle n'a pas à recevoir
       une alerte pour son propre geste. */
    if (!req.profil) {
      await notifyRole(DESTINATAIRES_INSCRIPTION, {
        type:    'info',
        titre:   'Nouvelle inscription reçue',
        message: `${data.nom_complet}${data.entreprise_nom ? ` (${data.entreprise_nom})` : ''} `
               + "vient d'être inscrit via le portail entreprise. À vérifier dans l'onglet Parcours.",
        meta:    { inscription_id: data.id, entreprise_id: data.entreprise_id, entreprise_nom: data.entreprise_nom },
      }).catch(err => console.error('[inscriptions-elearning] notify saisie unitaire', err.message));
    }

    res.status(201).json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Identifie un bénéficiaire pour la détection de doublons - surtout PAS sur email_parent /
// telephone_parent seuls : un même parent peut avoir plusieurs enfants/ados inscrits, qui
// partagent légitimement le même contact parent sans être des doublons l'un de l'autre.
// Clé : nom complet normalisé + date de naissance si connue (identifie une vraie personne même
// sans email propre), sinon nom complet + email propre (jamais celui du parent) en repli.
function normNom(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
function cleDoublon({ nomComplet, dateNaissance, emailPropre }) {
  const nom = normNom(nomComplet);
  if (!nom) return null;
  if (dateNaissance) return `${nom}|dn:${dateNaissance}`;
  if (emailPropre)   return `${nom}|em:${emailPropre.toLowerCase()}`;
  return null; // pas assez d'info fiable pour vérifier un doublon - on laisse passer
}

// ── POST /api/inscriptions-elearning/verifier-doublons ────────────────────────
// Vérification À BLANC avant import - ne touche pas la base, sert à bloquer l'import côté
// écran et à indiquer précisément quelle(s) ligne(s) corriger ou retirer avant d'envoyer.
router.post('/verifier-doublons', authenticateAny, requireInscriptionPermission('read'), async (req, res) => {
  try {
    const beneficiaires = Array.isArray(req.body.beneficiaires) ? req.body.beneficiaires : [];
    if (beneficiaires.length === 0) return res.json({ resultats: [], nbDoublons: 0 });

    const clesLignes = beneficiaires.map((b, i) => {
      const nomComplet = (b.nom_complet || `${b.prenom||''} ${b.nom||''}`).trim();
      const hasParent  = !!(b.email_parent || b.prenom_parent || b.nom_parent || b.telephone_parent);
      const profilType = b.profil_type || (hasParent ? 'enfant' : 'adulte');
      const emailPropre = normEmail(profilType === 'adulte' ? b.email : null);
      return { index: i, nomComplet, cle: cleDoublon({ nomComplet, dateNaissance: b.date_naissance || null, emailPropre }) };
    });

    const { data: existants, error } = await supabase
      .from('inscriptions_elearning')
      .select('nom_complet, date_naissance, email, profil_type');
    if (error) return res.status(500).json({ error: error.message });

    const clesExistantes = new Set(
      (existants || [])
        .map(e => cleDoublon({ nomComplet: e.nom_complet, dateNaissance: e.date_naissance, emailPropre: e.profil_type === 'adulte' ? e.email : null }))
        .filter(Boolean)
    );

    const vuesDansFichier = new Map();
    const resultats = clesLignes.map(l => {
      if (!l.cle) return { index: l.index, nom_complet: l.nomComplet, doublon: false };
      if (clesExistantes.has(l.cle)) {
        return { index: l.index, nom_complet: l.nomComplet, doublon: true, raison: 'deja_en_base' };
      }
      if (vuesDansFichier.has(l.cle)) {
        return { index: l.index, nom_complet: l.nomComplet, doublon: true, raison: 'doublon_fichier', ligneOriginale: vuesDansFichier.get(l.cle) + 1 };
      }
      vuesDansFichier.set(l.cle, l.index);
      return { index: l.index, nom_complet: l.nomComplet, doublon: false };
    });

    res.json({ resultats, nbDoublons: resultats.filter(r => r.doublon).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/inscriptions-elearning/bulk ────────────────────────────────────
// Inscriptions groupées (depuis Excel côté frontend)
router.post('/bulk', authenticateAny, requireInscriptionPermission('create'), async (req, res) => {
  try {
    const { beneficiaires, entreprise_id, entreprise_nom, source } = req.body;
    if (!Array.isArray(beneficiaires) || beneficiaires.length === 0) {
      return res.status(400).json({ error: 'beneficiaires[] requis' });
    }

    const rows = beneficiaires.map(b => {
      const nomComplet = (b.nom_complet || `${b.prenom||''} ${b.nom||''}`).trim();
      // Pour les enfants/ados : email = email_parent (l'apprenant n'a pas d'email propre)
      const hasParent  = !!(b.email_parent || b.prenom_parent || b.nom_parent || b.telephone_parent);
      const profilType = b.profil_type || (hasParent ? 'enfant' : 'adulte');
      const emailPropre = normEmail(b.email);
      const email      = emailPropre || normEmail(profilType !== 'adulte' ? b.email_parent : null);
      const telephone  = b.telephone || b.telephone_parent || null;

      return {
        entreprise_id:      entreprise_id    || null,
        entreprise_nom:     entreprise_nom   || null,
        nom_complet:        nomComplet,
        email,
        telephone,
        date_naissance:     b.date_naissance || null,
        poste:              b.poste          || null,
        departement:        b.departement    || null,
        langue_souhaitee:   b.langue         || 'Anglais',
        niveau_declare:     b.niveau         || b.niveau_cecr_estime || null,
        notes_onboarding:   b.notes          || null,
        source:             source           || 'entreprise_portail',
        statut:             'recu',
        // Champs parent (enfants/ados)
        profil_type:        profilType,
        prenom_parent:      b.prenom_parent  || null,
        nom_parent:         b.nom_parent     || null,
        email_parent:       normEmail(b.email_parent),
        telephone_parent:   b.telephone_parent || null,
        // Champs scolaires
        classe:             b.classe         || null,
        niveau_cecr_estime: b.niveau_cecr_estime || b.niveau || null,
        _cle: cleDoublon({ nomComplet, dateNaissance: b.date_naissance || null, emailPropre }),
      };
    }).filter(r => r.nom_complet.trim().length > 0);

    // Doublons déjà en base - recherche large (nom + date de naissance / email propre), pas
    // limitée à l'entreprise courante : un même bénéficiaire ne doit pas être réimporté ailleurs.
    const { data: existants } = await supabase
      .from('inscriptions_elearning')
      .select('nom_complet, date_naissance, email, profil_type');
    const clesExistantes = new Set(
      (existants || [])
        .map(e => cleDoublon({
          nomComplet: e.nom_complet,
          dateNaissance: e.date_naissance,
          emailPropre: e.profil_type === 'adulte' ? e.email : null, // email d'un enfant/ado en base peut être celui du parent
        }))
        .filter(Boolean)
    );

    const clesVues = new Set();
    const aInserer = [];
    const doublons = [];
    for (const r of rows) {
      const { _cle, ...ligne } = r;
      if (_cle && (clesExistantes.has(_cle) || clesVues.has(_cle))) {
        doublons.push(ligne.nom_complet);
        continue;
      }
      if (_cle) clesVues.add(_cle);
      aInserer.push(ligne);
    }

    if (aInserer.length === 0) {
      return res.status(200).json({ inscriptions: [], count: 0, doublons, doublonsCount: doublons.length });
    }

    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .insert(aInserer)
      .select();

    if (error) return res.status(500).json({ error: error.message });

    /* DESTINATAIRE CHANGÉ : l'assistante e-learning, plus l'Onboarding.
       Depuis la refonte du parcours, c'est elle qui vérifie et transmet ; l'Onboarding ne
       fait plus que l'assignation à la classe et n'a plus les boutons « Valider » ni
       « → Placement ». Continuer à l'alerter revenait à lui confier une tâche qu'elle ne
       peut plus exécuter, pendant que la personne concernée n'était prévenue de rien. */
    const nb     = (data || []).length;
    const entLib = entreprise_nom ? ` de ${entreprise_nom}` : '';
    await notifyRole(DESTINATAIRES_INSCRIPTION, {
      type:    'info',
      titre:   `${nb} nouvelle${nb > 1 ? 's' : ''} inscription${nb > 1 ? 's' : ''} reçue${nb > 1 ? 's' : ''}`,
      message: `${nb} bénéficiaire${nb > 1 ? 's' : ''}${entLib} vien${nb > 1 ? 'nent' : 't'} d'être inscrit${nb > 1 ? 's' : ''} via le portail entreprise.${doublons.length ? ` (${doublons.length} doublon${doublons.length>1?'s':''} ignoré${doublons.length>1?'s':''})` : ''}`,
      meta:    { entreprise_id, entreprise_nom, count: nb },
    });

    res.status(201).json({ inscriptions: data || [], count: nb, doublons, doublonsCount: doublons.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/inscriptions-elearning/:id/valider ────────────────────────────
// Onboarding vérifie et valide une inscription
router.patch('/:id/valider', authenticateAdmin, requireInscriptionPermission('update'), async (req, res) => {
  try {
    const { notes_onboarding } = req.body;
    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .update({
        statut: 'verifie',
        notes_onboarding: notes_onboarding || null,
        onboarding_id: req.profil.id,
      })
      .eq('id', req.params.id)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/inscriptions-elearning/:id/entreprise ──────────────────────────
// Rattrapage : rattacher a posteriori une inscription à une vraie entreprise
// (comptes_entreprises) - nécessaire quand l'import initial (ex: Import Excel côté
// Onboarding) a été fait sans sélectionner d'entreprise, laissant entreprise_id à null.
router.patch('/:id/entreprise', authenticateAdmin, requireInscriptionPermission('update'), async (req, res) => {
  try {
    const { entreprise_id } = req.body;
    if (!entreprise_id) return res.status(400).json({ error: 'entreprise_id requis' });

    const { data: entreprise, error: errEnt } = await supabase
      .from('comptes_entreprises').select('id, nom').eq('id', entreprise_id).maybeSingle();
    if (errEnt) return res.status(500).json({ error: errEnt.message });
    if (!entreprise) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .update({ entreprise_id: entreprise.id, entreprise_nom: entreprise.nom })
      .eq('id', req.params.id)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/inscriptions-elearning/:id/transmettre ────────────────────────
// Onboarding transmet à l'agent Placement Test
// → crée aussi une entrée dans inscriptions_adultes (queue placement)
router.patch('/:id/transmettre', authenticateAdmin, requireInscriptionPermission('update'), async (req, res) => {
  try {
    // 1. Récupérer l'inscription
    const { data: insc, error: fetchErr } = await supabase
      .from('inscriptions_elearning')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !insc) return res.status(404).json({ error: 'Inscription introuvable' });
    if (!['recu', 'verifie'].includes(insc.statut)) {
      return res.status(400).json({ error: 'Inscription déjà transmise ou en cours de traitement' });
    }

    // 2. Créer/vérifier dans la queue de placement
    // Vérification par onboarding_id (référence exacte vers CE dossier), pas par email :
    // un enfant/ado a souvent un email vide, et matcher sur `email: null` ferait croire
    // (à tort) qu'un autre enfant sans email - y compris un frère/sœur partageant le même
    // email parent - est "déjà en file", et sa transmission serait silencieusement ignorée.
    const { data: existing } = await supabase
      .from('inscriptions_adultes')
      .select('id')
      .eq('onboarding_id', insc.id)
      .in('statut', ['en_attente_test', 'test_en_cours'])
      .maybeSingle();

    if (!existing) {
      // Un enfant/ado n'a souvent ni email ni téléphone propre - on retombe sur le contact
      // du parent/tuteur pour que l'Agent Placement puisse joindre quelqu'un, et on propage
      // le profil + les infos parent pour qu'elles ne disparaissent pas à cette étape.
      const emailFinal     = insc.email     || (insc.profil_type !== 'adulte' ? insc.email_parent     : null) || null;
      const telephoneFinal = insc.telephone || (insc.profil_type !== 'adulte' ? insc.telephone_parent : null) || null;

      const { error: insertErr } = await supabase.from('inscriptions_adultes').insert({
        nom_complet:      insc.nom_complet,
        email:            emailFinal,
        telephone:        telephoneFinal,
        date_naissance:   insc.date_naissance || null,
        entreprise_nom:   insc.entreprise_nom,
        entreprise_id:    insc.entreprise_id,
        notes_placement:  insc.notes_onboarding,
        onboarding_id:    insc.id,           // référence vers inscriptions_elearning
        statut:           'en_attente_test',
        type_client:      insc.entreprise_id ? 'entreprise' : 'particulier',
        profil_type:      insc.profil_type      || 'adulte',
        nom_parent:       insc.nom_parent       || null,
        telephone_parent: insc.telephone_parent || null,
        email_parent:     insc.email_parent     || null,
      });
      // Ne jamais marquer "transmis" ni notifier l'Agent Placement si l'apprenant
      // n'a pas réellement été créé dans la file de placement (ex: contrainte DB) -
      // sinon le dossier disparaît côté Onboarding sans jamais apparaître côté Placement.
      if (insertErr) return res.status(500).json({ error: `Échec de la création dans la file de placement : ${insertErr.message}` });
    }

    // 3. Mettre à jour le statut
    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .update({ statut: 'transmis_placement', onboarding_id: req.profil.id })
      .eq('id', req.params.id)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });

    // 4. Notifier Agent Placement + confirmer à l'Onboarding
    const agentNom  = `${req.profil.prenom || ''} ${req.profil.nom || ''}`.trim() || 'Onboarding';
    const entNom    = insc.entreprise_nom ? ` (${insc.entreprise_nom})` : '';
    const metaTrans = { inscription_id: req.params.id, nom_complet: insc.nom_complet, entreprise_nom: insc.entreprise_nom };

    await Promise.all([
      await notifyRole(['admin_placement', 'super_admin'], {
        type:    'info',
        titre:   `Nouvel apprenant en attente de test`,
        message: `${insc.nom_complet}${entNom} - transmis par ${agentNom} pour un test de niveau.`,
        meta:    metaTrans,
      }),
    ]);

    res.json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/inscriptions-elearning/:id/transmettre-onboarding ─────────────
// Le second passage de main du parcours : le test est revenu, l'assistante e-learning en a
// pris connaissance et confie le dossier à l'Onboarding pour l'assignation en classe.
//
// C'est ce geste, et lui seul, qui fait APPARAÎTRE le dossier dans le Parcours de
// l'Onboarding (STATUTS_VISIBLES_ONBOARDING côté interface). Avant lui, l'Onboarding voyait
// tous les dossiers dès leur création et pouvait assigner une classe avant même que le test
// de niveau ait eu lieu - alors que c'est le niveau mesuré qui fonde le choix de la classe.
router.patch('/:id/transmettre-onboarding', authenticateAdmin, requireInscriptionPermission('update'), async (req, res) => {
  try {
    const { data: insc, error: fetchErr } = await supabase
      .from('inscriptions_elearning').select('*').eq('id', req.params.id).maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!insc)    return res.status(404).json({ error: 'Inscription introuvable' });

    /* LE TEST EST BLOQUANT, et le contrôle vit ici et pas seulement dans l'interface :
       un garde posé uniquement côté écran n'est qu'une décoration, la route reste
       appelable. `teste` est le seul statut qui ouvre la transmission. */
    if (insc.statut !== 'teste') {
      return res.status(409).json({
        error: insc.statut === 'transmis_placement'
          ? `Le test de niveau de ${insc.nom_complet} n'est pas encore revenu - impossible de transmettre à l'Onboarding.`
          : `Ce dossier est au statut « ${insc.statut} » : seul un dossier testé se transmet à l'Onboarding.`,
      });
    }

    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .update({ statut: 'transmis_onboarding' })
      .eq('id', req.params.id)
      .select().single();
    if (error) return res.status(500).json({ error: error.message });

    const acteurNom = `${req.profil.prenom || ''} ${req.profil.nom || ''}`.trim() || 'L\'assistante e-learning';
    const entNom    = insc.entreprise_nom ? ` (${insc.entreprise_nom})` : '';
    const niveau    = insc.niveau_cecr_estime || insc.niveau || null;

    await notifyRole(['onboarding', 'admin_onboarding'], {
      type:    'info',
      titre:   '📨 Dossier à assigner en classe',
      message: `${insc.nom_complet}${entNom} a passé son test${niveau ? ` (niveau ${niveau})` : ''} - transmis par ${acteurNom} pour l'assignation en classe.`,
      meta:    { inscription_id: req.params.id, nom_complet: insc.nom_complet, entreprise_nom: insc.entreprise_nom, niveau },
    }).catch(() => {});

    logAudit({
      ...acteurAudit(req),
      action_type: "DOSSIER_TRANSMIS_ONBOARDING",
      module:      "inscriptions",
      entite_type: "inscriptions_elearning",
      entite_id:   req.params.id,
      detail:      `Dossier de ${insc.nom_complet} transmis à l'Onboarding pour assignation${niveau ? ` - niveau ${niveau}` : ''}`,
      statut:      "success",
    }).catch(() => {});

    res.json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/inscriptions-elearning/:id/relancer-placement ──────────────────
// La porte de sortie d'un test qui ne revient pas. Le test étant devenu bloquant, un dossier
// resté en `transmis_placement` n'est plus contournable : il se relance. On notifie l'Agent
// Placement plutôt que d'ouvrir une dérogation vers l'assignation - le niveau mesuré reste
// la condition, et c'est le résultat qu'il faut obtenir, pas le contrôle qu'il faut lever.
router.post('/:id/relancer-placement', authenticateAdmin, requireInscriptionPermission('update'), async (req, res) => {
  try {
    const { data: insc } = await supabase
      .from('inscriptions_elearning').select('*').eq('id', req.params.id).maybeSingle();
    if (!insc) return res.status(404).json({ error: 'Inscription introuvable' });
    if (insc.statut !== 'transmis_placement') {
      return res.status(409).json({ error: 'Ce dossier n\'est pas en attente de test.' });
    }

    const acteurNom = `${req.profil.prenom || ''} ${req.profil.nom || ''}`.trim() || 'L\'assistante e-learning';
    const depuis    = (insc.updated_at || insc.created_at || '').slice(0, 10);

    await notifyRole(['admin_placement', 'placement_test'], {
      type:    'warning',
      titre:   '🔔 Test de niveau en attente - relance',
      message: `${acteurNom} relance au sujet de ${insc.nom_complet}${insc.entreprise_nom ? ` (${insc.entreprise_nom})` : ''}, en attente de test${depuis ? ` depuis le ${depuis}` : ''}. Le dossier ne peut pas avancer sans son résultat.`,
      meta:    { inscription_id: req.params.id, nom_complet: insc.nom_complet, relance: true },
    }).catch(() => {});

    logAudit({
      ...acteurAudit(req),
      action_type: "PLACEMENT_RELANCE",
      module:      "inscriptions",
      entite_type: "inscriptions_elearning",
      entite_id:   req.params.id,
      detail:      `Relance de l'Agent Placement pour le test de ${insc.nom_complet}`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/inscriptions-elearning/:id/assigner ───────────────────────────
// Onboarding assigne l'apprenant (après test, et après transmission par l'assistante)
// à une classe_elearning
router.patch('/:id/assigner', authenticateAdmin, requireInscriptionPermission('update'), async (req, res) => {
  try {
    const { classe_id, classe_nom } = req.body;
    if (!classe_id) return res.status(400).json({ error: 'classe_id requis' });

    /* LE DOSSIER DOIT AVOIR ÉTÉ TRANSMIS. L'assignation est le geste de l'Onboarding,
       et elle ne s'ouvre qu'une fois le test revenu ET l'assistante ayant passé la main.
       Le contrôle vit ici et pas seulement dans l'interface : un garde d'écran n'empêche
       pas d'appeler la route. On tolère `teste` pour les dossiers antérieurs à
       l'introduction de `transmis_onboarding`, qui n'ont jamais eu l'occasion d'y passer. */
    const { data: inscAvant } = await supabase
      .from('inscriptions_elearning').select('statut, nom_complet').eq('id', req.params.id).maybeSingle();
    if (inscAvant && !['transmis_onboarding', 'teste'].includes(inscAvant.statut)) {
      return res.status(409).json({
        error: inscAvant.statut === 'transmis_placement'
          ? `Le test de niveau de ${inscAvant.nom_complet} n'est pas encore revenu - la classe se choisit sur le niveau mesuré.`
          : `Ce dossier est au statut « ${inscAvant.statut} » : il n'est pas prêt à être assigné.`,
      });
    }

    // Récupérer le nom de la classe si pas fourni - et savoir si elle a un coach
    let nomClasse = classe_nom;
    const { data: clExistante } = await supabase.from('classes_elearning').select('nom, coach_id, coach_nom').eq('id', classe_id).maybeSingle();
    if (clExistante) {
      nomClasse = nomClasse || clExistante.nom;
    } else {
      // La classe n'existe plus dans classes_elearning (ex: table vidée) - la recréer
      const nomFallback = nomClasse || `Classe ${classe_id.slice(0, 8)}`;
      await supabase.from('classes_elearning').upsert({
        id:            classe_id,
        nom:           nomFallback,
        type_cours:    'en_ligne',
        statut:        'actif',
        capacite_max:  20,
        created_by:    req.profil.id,
        created_by_nom: [req.profil.prenom, req.profil.nom].filter(Boolean).join(' ') || req.profil.email,
      }, { onConflict: 'id', ignoreDuplicates: true });
      nomClasse = nomFallback;
    }

    const { data: insc, error: fetchErr } = await supabase
      .from('inscriptions_elearning').select('*').eq('id', req.params.id).single();
    if (fetchErr) return res.status(404).json({ error: 'Inscription introuvable' });

    // Un enfant/ado n'a souvent ni email ni téléphone propre - sans ce repli, l'assignation
    // en classe créait un bénéficiaire sans aucun contact (impossible de générer ses accès
    // ensuite, onglet "Accès" bloqué sur "Aucun email renseigné").
    const emailFinal     = insc.email     || (insc.profil_type !== 'adulte' ? insc.email_parent     : null) || null;
    const telephoneFinal = insc.telephone || (insc.profil_type !== 'adulte' ? insc.telephone_parent : null) || null;

    // Inscrire dans classes_elearning_apprenants (éviter doublons sur même classe+email)
    const { data: existing } = emailFinal
      ? await supabase.from('classes_elearning_apprenants')
          .select('id').eq('classe_id', classe_id).eq('email', emailFinal).maybeSingle()
      : { data: null };

    if (!existing) {
      const { error: inscErr } = await supabase.from('classes_elearning_apprenants').insert({
        classe_id,
        nom_complet:        insc.nom_complet,
        email:              normEmail(emailFinal),
        telephone:          telephoneFinal,
        date_naissance:     insc.date_naissance     || null,
        niveau_cecr:        insc.niveau_detecte     || insc.niveau_declare || null,
        statut:             'actif',
        // Champs parent/enfant propagés depuis l'inscription
        prenom_parent:      insc.prenom_parent      || null,
        nom_parent:         insc.nom_parent         || null,
        email_parent:       normEmail(insc.email_parent),
        telephone_parent:   insc.telephone_parent   || null,
        classe:             insc.classe             || null,
        niveau_cecr_estime: insc.niveau_cecr_estime || null,
        profil_type:        insc.profil_type        || 'adulte',
        /* L'OBJECTIF SUIT L'APPRENANT DANS SA CLASSE. Le PA Advisor choisit un coach
           pour une CLASSE : il lui faut les objectifs de ses apprenants sans remonter
           à des dossiers qui peuvent avoir été archivés entre-temps. */
        objectif_client:    insc.objectif_client    || null,
      });
      if (inscErr) console.error('[assigner] insert classes_elearning_apprenants:', inscErr.message);
    }

    // Créer automatiquement le compte Supabase Auth de l'apprenant - jamais avec l'email/
    // téléphone du parent tel quel : cela créerait un login enfant identique à celui du
    // parent (compte partagé, ambigu). Si l'enfant n'a aucun contact propre, on génère un
    // identifiant technique <nom>@betacademy.app, comme le fait déjà creerAccesApprenantCore
    // pour le bouton manuel "Générer les accès" (voir apprenants.js).
    const emailEstCeluiDuParent = isRealEmail(insc.email) && insc.email_parent
      && insc.email.toLowerCase().trim() === String(insc.email_parent).toLowerCase().trim();
    const telEstCeluiDuParent = insc.telephone && insc.telephone_parent
      && normalizePhone(insc.telephone) === normalizePhone(insc.telephone_parent);
    const useEmailPropre = isRealEmail(insc.email) && !emailEstCeluiDuParent;
    const usePhonePropre = !useEmailPropre && !!insc.telephone && !telEstCeluiDuParent;
    const seed = insc.nom_complet || '';
    const loginEmailPromise = useEmailPropre
      ? Promise.resolve(insc.email.toLowerCase().trim())
      : usePhonePropre
        ? Promise.resolve(phoneToVirtualEmail(insc.telephone, seed))
        : identifiantTechniqueApprenant(seed);

    loginEmailPromise.then(loginEmail => creerCompteApprenant({
      email:          loginEmail,
      nom_complet:    insc.nom_complet,
      telephone:      usePhonePropre ? insc.telephone : null,
      date_naissance: insc.date_naissance || null,
    })).catch(e => console.error('[assigner] creerCompteApprenant:', e.message));

    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .update({
        statut:          'assigne',
        classe_id,
        classe_nom:      nomClasse,
        date_assignation: new Date().toISOString().slice(0, 10),
        onboarding_id:   req.profil.id,
      })
      .eq('id', req.params.id)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });

    // Notifier PA + RH Entreprise de la nouvelle assignation
    const onbNom   = `${req.profil.prenom || ''} ${req.profil.nom || ''}`.trim() || 'Onboarding';
    const metaAssign = { inscription_id: req.params.id, nom_complet: insc.nom_complet, classe_nom: nomClasse, entreprise_nom: insc.entreprise_nom };

    /* LE PASSAGE AUTOMATIQUE AU PA QUAND LA CLASSE N'A PAS DE COACH.
       Jusqu'ici le PA recevait le même message dans les deux cas - « Nouvel apprenant dans
       votre classe » - sans que `coach_id` soit jamais lu : rien ne distinguait une classe
       pourvue d'une classe qui attendait un coach, et l'information se perdait dans le flux.
       Deux messages distincts désormais, dont un qui appelle une action et porte le
       `classe_id` en méta pour ouvrir directement l'écran d'assignation du coach. */
    const classeSansCoach = !clExistante?.coach_id;

    await Promise.all([
      await notifyRole(['pedagogical_advisor', 'admin_pa_advisor'], classeSansCoach ? {
        type:    'warning',
        titre:   `⚠️ Classe sans coach - ${nomClasse}`,
        message: `${insc.nom_complet} a été assigné(e) à la classe "${nomClasse}" par ${onbNom}, mais cette classe n'a aucun coach. À pourvoir pour que le programme démarre.`,
        meta:    { ...metaAssign, classe_id, coach_a_assigner: true },
      } : {
        type:    'success',
        titre:   `Nouvel apprenant assigné - ${nomClasse}`,
        message: `${insc.nom_complet} vient d'être assigné(e) à la classe "${nomClasse}" (coach : ${clExistante.coach_nom || 'assigné'}) par ${onbNom}.`,
        meta:    { ...metaAssign, classe_id },
      }),
      insc.entreprise_id && notifyEntreprise(insc.entreprise_id, {
        type:    'success',
        titre:   `Bénéficiaire intégré - ${insc.nom_complet}`,
        message: `${insc.nom_complet} a été intégré(e) à la classe "${nomClasse}". Le programme démarre.`,
        meta:    metaAssign,
      }),
      /* → L'ASSISTANTE E-LEARNING : LA BOUCLE SE REFERME OÙ ELLE S'EST OUVERTE.
         C'est elle qui a reçu le dossier, l'a vérifié, l'a envoyé au test puis transmis
         à l'Onboarding - et elle n'apprenait rien de son aboutissement. Les destinataires
         de l'assignation avaient été pensés comme ceux de la suite du parcours (le PA, le
         RH de l'entreprise), en oubliant celle qui l'avait lancé. Elle suit ses dossiers
         dans l'onglet Parcours : il lui faut savoir lesquels sont arrivés. */
      await notifyRole(DESTINATAIRES_INSCRIPTION.filter(r => r !== 'super_admin'), {
        type:    'success',
        titre:   `✅ Dossier abouti - ${insc.nom_complet}`,
        message: `${insc.nom_complet}${insc.entreprise_nom ? ` (${insc.entreprise_nom})` : ''}, que vous aviez transmis, a été assigné(e) à la classe "${nomClasse}" par ${onbNom}.`,
        meta:    { ...metaAssign, classe_id },
      }),
      /* → LA SUPERVISION. Le superviseur et ses adjoints suivent les effectifs sans
         intervenir dans le parcours : ils reçoivent le fait, pas la demande d'action.
         Les quatre noms de rôle sont nécessaires — `superviseur`/`deputy_superviseur`
         sont les rôles réels, les variantes `admin_*` les façades portées côté
         bet-elearning ; n'en citer qu'une moitié laisse l'autre moitié des comptes
         muette. */
      await notifyRole(['superviseur', 'admin_superviseur', 'deputy_superviseur', 'admin_deputy_superviseur'], {
        type:    'info',
        titre:   `🎓 Nouvel apprenant - ${nomClasse}`,
        message: `${insc.nom_complet}${insc.entreprise_nom ? ` (${insc.entreprise_nom})` : ''} a été assigné(e) à la classe "${nomClasse}" par ${onbNom}.`,
        meta:    { ...metaAssign, classe_id },
      }),
    ].filter(Boolean));

    logAudit({
      ...acteurAudit(req),
      action_type: "APPRENANT_ASSIGNE",
      module:      "onboarding",
      entite_type: "inscriptions_elearning",
      entite_id:   req.params.id,
      detail:      `Assignation de ${insc.nom_complet} à la classe "${nomClasse}"`,
      statut:      "success",
    }).catch(() => {});

    res.json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/inscriptions-elearning/:id ────────────────────────────────────
// Onboarding retire un bénéficiaire de la liste Parcours (erreur d'import, doublon manuel,
// dossier obsolète…). Interdit dès que le dossier est assigné à une classe - à ce stade
// l'apprenant est actif dans son parcours, le retirer de la liste romprait le suivi.
router.delete('/:id', authenticateAdmin, requireInscriptionPermission('delete'), async (req, res) => {
  try {
    const { data: insc, error: fetchErr } = await supabase
      .from('inscriptions_elearning').select('statut, classe_id, nom_complet').eq('id', req.params.id).maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!insc) return res.status(404).json({ error: 'Inscription introuvable' });
    // Dès que le dossier a été transmis à l'Agent Placement, une ligne inscriptions_adultes le
    // référence (onboarding_id) pour lui remonter le résultat du test - le supprimer casserait
    // ce lien et empêcherait le retour automatique du résultat vers Onboarding.
    if (!['recu', 'verifie'].includes(insc.statut) || insc.classe_id) {
      return res.status(409).json({ error: `${insc.nom_complet} a déjà été transmis à l'Agent Placement (ou assigné) - impossible de le/la retirer de la liste.` });
    }

    const { error } = await supabase.from('inscriptions_elearning').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });

    logAudit({
      ...acteurAudit(req),
      action_type: "APPRENANT_RETIRE",
      module:      "onboarding",
      entite_type: "inscriptions_elearning",
      entite_id:   req.params.id,
      detail:      `Retrait du dossier de ${insc.nom_complet} de la liste Parcours`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/inscriptions-elearning/bulk-supprimer ──────────────────────────
// Même règle : les dossiers déjà transmis à l'Agent Placement (ou assignés) sont ignorés
// (jamais supprimés), le reste de la sélection est retiré normalement.
router.patch('/bulk-supprimer', authenticateAdmin, requireInscriptionPermission('delete'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] requis' });

    const { data: candidats, error: fetchErr } = await supabase
      .from('inscriptions_elearning').select('id, statut, classe_id').in('id', ids);
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });

    const supprimables = (candidats || []).filter(c => ['recu', 'verifie'].includes(c.statut) && !c.classe_id).map(c => c.id);
    const bloques       = (candidats || []).length - supprimables.length;

    if (supprimables.length === 0) {
      return res.status(409).json({ error: 'Tous les dossiers sélectionnés ont déjà été transmis à l\'Agent Placement (ou assignés).' });
    }

    const { error } = await supabase.from('inscriptions_elearning').delete().in('id', supprimables);
    if (error) return res.status(500).json({ error: error.message });

    logAudit({
      ...acteurAudit(req),
      action_type: "APPRENANT_RETIRE",
      module:      "onboarding",
      entite_type: "inscriptions_elearning",
      detail:      `Retrait groupé de ${supprimables.length} dossier(s) de la liste Parcours${bloques ? ` (${bloques} ignoré(s), déjà transmis)` : ""}`,
      metadata:    { ids: supprimables },
      statut:      "warning",
    }).catch(() => {});

    res.json({ ok: true, count: supprimables.length, bloques });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/inscriptions-elearning/creer-comptes-batch ─────────────────────
// Crée les comptes Supabase Auth pour tous les apprenants sans compte dans classes_elearning_apprenants
router.post('/creer-comptes-batch', authenticateAdmin, requireInscriptionPermission('manage'), async (req, res) => {
  try {
    const { data: apprenants, error } = await supabase
      .from('classes_elearning_apprenants')
      .select('id, email, nom_complet, telephone, email_parent, telephone_parent')
      .is('apprenant_id', null)
      .not('email', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    if (!apprenants || apprenants.length === 0) return res.json({ results: [], message: 'Aucun apprenant sans compte' });

    // Dédupliquer par email (un compte par email, pas par ligne)
    const emailsSeen = new Set();
    const uniques = apprenants.filter(a => {
      const key = a.email.toLowerCase();
      if (emailsSeen.has(key)) return false;
      emailsSeen.add(key); return true;
    });

    const results = [];
    for (const ap of uniques) {
      // Pour un enfant/ado sans contact propre, `email`/`telephone` valent ceux du parent
      // (convention de la file de placement) - ne jamais les réutiliser comme login de
      // l'enfant, sinon parent et enfant partagent le même compte Supabase Auth.
      const emailEstCeluiDuParent = isRealEmail(ap.email) && ap.email_parent
        && ap.email.toLowerCase().trim() === String(ap.email_parent).toLowerCase().trim();
      const telEstCeluiDuParent = ap.telephone && ap.telephone_parent
        && normalizePhone(ap.telephone) === normalizePhone(ap.telephone_parent);
      const useEmailPropre = isRealEmail(ap.email) && !emailEstCeluiDuParent;
      const usePhonePropre = !useEmailPropre && !!ap.telephone && !telEstCeluiDuParent;
      const seed = ap.nom_complet || '';
      const loginEmail = useEmailPropre
        ? ap.email.toLowerCase().trim()
        : usePhonePropre
          ? phoneToVirtualEmail(ap.telephone, seed)
          : await identifiantTechniqueApprenant(seed);

      const r = await creerCompteApprenant({ email: loginEmail, nom_complet: ap.nom_complet, telephone: usePhonePropre ? ap.telephone : null });
      results.push({ email: loginEmail, ...r });
    }

    res.json({ results, total: uniques.length, ok: results.filter(r => r.ok).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/inscriptions-elearning/bulk-valider ───────────────────────────
// Valider plusieurs inscriptions en une fois
router.patch('/bulk-valider', authenticateAdmin, requireInscriptionPermission('update'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] requis' });

    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .update({ statut: 'verifie', onboarding_id: req.profil.id })
      .in('id', ids)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ inscriptions: data || [], count: (data || []).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/inscriptions-elearning/:id ─────────────────────────────────────
// Correction des champs d'un dossier Parcours avant validation - nécessaire quand
// l'import (Excel/site/manuel) contient une erreur (email mal saisi, nom tronqué,
// date de naissance incorrecte…). Volontairement limité aux champs saisis par
// erreur humaine - jamais les champs système (statut, classe_id, dates de suivi).
// Déclarée en dernier : "/:id" intercepterait sinon les routes littérales
// ci-dessus (/bulk-supprimer, /bulk-valider, /creer-comptes-batch…).
const CHAMPS_EDITABLES_PARCOURS = [
  'nom_complet', 'email', 'telephone', 'date_naissance', 'poste', 'departement',
  // `objectif_client` est éditable À TOUT MOMENT du parcours, et pas seulement à la
  // saisie : il se précise souvent après un échange avec le client, parfois après le
  // test de niveau. Le figer à la création obligerait à supprimer le dossier pour le
  // corriger.
  'objectif_client',
  'langue_souhaitee', 'niveau_declare', 'classe',
  'prenom_parent', 'nom_parent', 'email_parent', 'telephone_parent',
];
router.patch('/:id', authenticateAdmin, requireInscriptionPermission('update'), async (req, res) => {
  try {
    const updates = {};
    for (const champ of CHAMPS_EDITABLES_PARCOURS) {
      if (req.body[champ] !== undefined) {
        updates[champ] = champ === 'email' || champ === 'email_parent' ? normEmail(req.body[champ]) : (req.body[champ] || null);
      }
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucun champ à corriger fourni' });
    if (updates.nom_complet !== undefined && !updates.nom_complet?.trim()) {
      return res.status(400).json({ error: 'nom_complet ne peut pas être vide' });
    }

    const { data, error } = await supabase
      .from('inscriptions_elearning')
      .update(updates)
      .eq('id', req.params.id)
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Inscription introuvable' });
    res.json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
