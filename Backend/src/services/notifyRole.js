// Envoie des notifications aux utilisateurs actifs
import supabase from "../config/supabase.js";
import { plateformeCourante } from "./contextePlateforme.js";

// Rôles qui n'existent QUE dans app_metadata.role (Supabase Auth) et jamais dans la
// colonne utilisateurs.role - "super_admin" notamment n'a aucune ligne utilisateurs.role
// correspondante (confirmé en base), donc notifyRole(["super_admin"], ...) ne trouvait
// jamais aucun destinataire, silencieusement, pour absolument toutes les notifications
// qui lui étaient adressées (paiements, assignations, transferts...).
const ROLES_AUTH_ONLY = ["super_admin", "admin_superviseur", "admin_pa_advisor", "admin_deputy_superviseur"];

// Le dashboard staff (useNotifications.js côté dash) appelle TOUJOURS son fetch avec
// ?source=dash - jamais sans ce paramètre - donc toute notification écrite avec un autre
// source (l'ancien défaut "bet-elearning") était invisible dans sa cloche, quel que soit le
// destinataire réel, y compris super_admin/PA/commerciale/onboarding déjà correctement
// résolus par ailleurs dans ce fichier. Le fetch apprenant (/api/apprenants/mes-notifs), lui,
// n'applique un filtre sur `source` QUE si le paramètre est explicitement fourni - il n'est
// jamais passé depuis EspaceApprenant.jsx, donc ce changement de défaut ne lui retire rien.
async function _insertNotifs(userIds, { type = 'info', titre, message = null, meta = null, source = null }) {
  /* LA SOURCE VIENT DE LA REQUÊTE, plus d'un défaut écrit en dur.
     Elle valait `'dash'` par défaut : sur 108 points d'appel, 107 ne la précisaient pas et
     écrivaient donc `dash`, y compris quand l'action venait de bet-elearning. Les
     notifications e-learning tombaient dans la cloche de dash, et inversement une fois le
     filtre de lecture rétabli. `plateformeCourante()` lit l'en-tête `X-Plateforme` de la
     requête en cours (AsyncLocalStorage), ce qui règle d'un coup les 108 appels et ceux à
     venir — y compris dans les routes PARTAGÉES, où le fichier ne dit rien de la
     plateforme puisqu'il répond aux deux.
     Un appel qui précise `source` explicitement garde le dernier mot. */
  source = source || plateformeCourante();
  if (!userIds?.length) return;
  const rows = userIds.map(id => ({ user_id: id, type, titre, message, meta, source, lu: false }));
  const { error } = await supabase.from('notifications').insert(rows);
  // Le résultat de l'insert n'était jamais vérifié - une erreur (RLS, colonne manquante,
  // user_id invalide) échouait silencieusement, sans aucun log nulle part, ce qui rendait
  // tout dysfonctionnement du système de notifications impossible à diagnostiquer.
  if (error) console.error('[notifyRole/_insertNotifs] insertion notifications échouée:', error.message);
}

// Résout les ids des rôles qui ne vivent que dans app_metadata.role (Supabase Auth),
// via l'API admin listUsers - la table utilisateurs ne les contient jamais.
async function _resoudreIdsParRoleAuth(rolesAuthOnly) {
  if (!rolesAuthOnly.length) return [];
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) { console.error('[notifyRole] listUsers échoué:', error.message); return []; }
    return (data?.users || [])
      .filter(u => rolesAuthOnly.includes(u.app_metadata?.role) && u.app_metadata?.actif !== false)
      .map(u => u.id);
  } catch (err) {
    console.error('[notifyRole] résolution rôles auth-only échouée:', err.message);
    return [];
  }
}

/**
 * LA DIRECTION REÇOIT TOUT, et elle le reçoit d'ici plutôt que de 108 endroits.
 *
 * Audit du 11 octobre 2026 sur les 108 appels à `notifyRole` : `admin` était absent des
 * destinataires de 97 d'entre eux, `super_admin` de 71. Coach assigné, apprenant assigné à
 * une classe, classe créée, test de niveau terminé, honoraires transmis, remplacement
 * confirmé - aucun ne remontait à l'Administrateur, la moitié pas au SuperAdmin. Chaque
 * point d'appel avait été écrit en pensant au métier concerné, et la supervision s'ajoutait
 * au cas par cas ; c'est cette recopie qui a produit la dérive.
 *
 * Les ajouter ici plutôt que dans chaque appel ferme le trou pour de bon : une notification
 * écrite demain remonte sans qu'on ait à y penser. Deux comptes en base (un de chaque), donc
 * aucun effet de volume.
 */
const ROLES_DIRECTION = ["super_admin", "admin"];

/** Notifie tous les utilisateurs actifs d'un rôle (string) ou d'une liste de rôles (array).
 *  `excludeUserId` évite de notifier l'auteur de l'action lorsqu'il fait lui-même partie
 *  des rôles ciblés (ex: un admin_manager qui enregistre lui-même un versement).
 *
 *  `payload.supervision: false` retire la direction des destinataires. À réserver aux
 *  notifications ADRESSÉES, dont le texte ne vaut que pour son destinataire - « Nouvel
 *  apprenant dans VOTRE classe », « VOS honoraires » : les envoyer au SuperAdmin
 *  produirait un message faux. Une notification de supervision, elle, n'a rien à exclure. */
export async function notifyRole(roleOrRoles, payload, excludeUserId = null) {
  try {
    const { supervision = true, ...corps } = payload || {};
    const demandes = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
    const roles = supervision ? [...new Set([...demandes, ...ROLES_DIRECTION])] : demandes;
    payload = corps;
    const rolesAuthOnly = roles.filter(r => ROLES_AUTH_ONLY.includes(r));
    const rolesTable    = roles.filter(r => !ROLES_AUTH_ONLY.includes(r));

    let users = [];
    if (rolesTable.length) {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id')
        .in('role', rolesTable)
        .eq('actif', true);
      if (error) {
        // Un seul rôle absent de l'enum bet_role (ex: pas encore migré en base) fait échouer
        // la requête groupée entière - on repasse rôle par rôle pour ne pas priver les rôles
        // valides de leur notification à cause d'un seul rôle invalide.
        console.error('[notifyRole] requête groupée échouée, retry rôle par rôle:', error.message);
        for (const role of rolesTable) {
          const { data: u, error: e } = await supabase.from('utilisateurs').select('id').eq('role', role).eq('actif', true);
          if (e) { console.error(`[notifyRole] rôle "${role}" ignoré:`, e.message); continue; }
          users.push(...(u || []));
        }
      } else {
        users = data || [];
      }
    }

    const idsAuthOnly = await _resoudreIdsParRoleAuth(rolesAuthOnly);
    const allIds = [...users.map(u => u.id), ...idsAuthOnly];
    if (!allIds.length) return;
    const uniqueIds = [...new Set(allIds)].filter(id => id !== excludeUserId);
    await _insertNotifs(uniqueIds, payload);
  } catch (err) {
    console.error('[notifyRole]', err.message);
  }
}

/** Résout les emails (+ prénom) des utilisateurs actifs d'un rôle ou d'une liste de rôles -
 *  même logique de résolution que notifyRole (table utilisateurs + rôles auth-only via
 *  Supabase Auth), mais retourne les coordonnées au lieu d'insérer des notifications.
 *  Utilisé pour doubler une notification in-app d'un email (ex: relancesFacturesImpayees). */
export async function resoudreEmailsParRole(roleOrRoles) {
  try {
    const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
    const rolesAuthOnly = roles.filter(r => ROLES_AUTH_ONLY.includes(r));
    const rolesTable    = roles.filter(r => !ROLES_AUTH_ONLY.includes(r));

    let table = [];
    if (rolesTable.length) {
      const { data, error } = await supabase
        .from('utilisateurs').select('email, prenom').in('role', rolesTable).eq('actif', true);
      if (error) { console.error('[resoudreEmailsParRole] table:', error.message); }
      else table = data || [];
    }

    let authOnly = [];
    if (rolesAuthOnly.length) {
      const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (error) console.error('[resoudreEmailsParRole] listUsers:', error.message);
      else {
        authOnly = (data?.users || [])
          .filter(u => rolesAuthOnly.includes(u.app_metadata?.role) && u.app_metadata?.actif !== false)
          .map(u => ({ email: u.email, prenom: u.user_metadata?.prenom || "" }));
      }
    }

    const all = [...table, ...authOnly].filter(u => u.email);
    const seen = new Set();
    return all.filter(u => { const k = u.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  } catch (err) {
    console.error('[resoudreEmailsParRole]', err.message);
    return [];
  }
}

/**
 * Les rôles de la supervision GLOBALE.
 *
 * Le superviseur général tient le cahier des coachs et leur classement, mais il n'était
 * destinataire d'aucune notification sur la vie des classes, des apprenants ni des coachs :
 * ces points d'appel ont été écrits en ciblant le conseiller pédagogique, et le superviseur
 * n'a été ajouté qu'à ceux construits après lui. Une constante plutôt que la paire recopiée
 * à dix endroits - c'est cette recopie qui avait produit la dérive.
 *
 * Le DEPUTY n'y figure pas, délibérément. Il observe des coachs qui lui sont assignés, pas
 * la vie de toutes les classes ; lui déverser chaque création de classe rendrait sa cloche
 * inutilisable. Ce qui le concerne lui parvient par `notifyDeputiesDuCoach`.
 */
export const ROLES_SUPERVISION_GLOBALE = ["superviseur", "admin_superviseur"];

/**
 * Notifie les deputies effectivement liés à un coach - ceux qui ont une mission en cours
 * sur lui, ou qui l'ont déjà observé.
 *
 * C'est le pendant filtré de `ROLES_SUPERVISION_GLOBALE` : sur un événement qui touche un
 * coach précis (suspension, réintégration), le superviseur général est informé parce qu'il
 * suit tout le monde ; un deputy ne l'est que s'il suit CE coach-là.
 */
export async function notifyDeputiesDuCoach(coachId, payload) {
  if (!coachId) return;
  try {
    const [{ data: missions }, { data: rapports }] = await Promise.all([
      supabase.from("missions_deputy").select("deputy_id, statut").eq("coach_id", coachId),
      supabase.from("rapports_observation").select("deputy_id").eq("coach_id", coachId),
    ]);

    // Filtrage en JS et non via `not(...in...)` : les statuts portent des accents
    // (« terminée », « annulée ») et le quoting PostgREST y echoue silencieusement -
    // la requete renverrait tout, sans erreur.
    const CLOSES = ["terminée", "annulée", "terminee", "annulee"];
    const ids = [...new Set([
      ...(missions || []).filter(m => !CLOSES.includes(m.statut)).map(m => m.deputy_id),
      ...(rapports || []).map(r => r.deputy_id),
    ].filter(Boolean))];
    if (!ids.length) return;

    // Vérifier que ces comptes sont toujours actifs et toujours deputies : un deputy
    // parti ou change de role garderait sinon des notifications sur ses anciens coachs.
    const { data: actifs } = await supabase.from("utilisateurs").select("id")
      .in("id", ids).eq("role", "deputy_superviseur").eq("actif", true);

    await _insertNotifs((actifs || []).map(u => u.id), payload);
  } catch (err) {
    console.error('[notifyDeputiesDuCoach]', err.message);
  }
}

/** Notifie un utilisateur précis (par son id) */
/**
 * Notifie PLUSIEURS personnes en une seule écriture.
 *
 * `notifyUser` appelé en boucle produit une insertion par destinataire : sur un groupe de
 * 237 membres, cela faisait 236 allers-retours vers Supabase et portait la création du
 * groupe à près de 4 secondes. Une seule insertion suffit - les lignes sont identiques à
 * l'exception du `user_id`.
 */
export async function notifyUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    await _insertNotifs(ids, payload);
  } catch (err) {
    console.error('[notifyUsers]', err.message);
  }
}

export async function notifyUser(userId, payload) {
  if (!userId) return;
  try {
    await _insertNotifs([userId], payload);
  } catch (err) {
    console.error('[notifyUser]', err.message);
  }
}

// Cache très court pour éviter de re-requêter la liste des onboarding globaux à chaque
// notification individuelle envoyée dans une même requête (ex: boucle sur plusieurs dossiers).
let _cacheOnboardingGlobal = null;
let _cacheOnboardingGlobalAt = 0;
async function _idsOnboardingGlobal() {
  const maintenant = Date.now();
  if (_cacheOnboardingGlobal && maintenant - _cacheOnboardingGlobalAt < 10000) return _cacheOnboardingGlobal;
  try {
    const { data, error } = await supabase
      .from('utilisateurs').select('id').eq('role', 'onboarding').eq('onboarding_vue_globale', true);
    _cacheOnboardingGlobal = error ? [] : (data || []).map(u => u.id);
  } catch { _cacheOnboardingGlobal = []; }
  _cacheOnboardingGlobalAt = maintenant;
  return _cacheOnboardingGlobal;
}

/** Notifie l'onboarding précis d'un dossier (onboardingId, peut être null/undefined) ET,
 *  systématiquement, tout compte "Onboarding global" - jusqu'ici ce dernier ne recevait
 *  jamais ces notifications dès qu'un onboarding précis était déjà assigné au dossier
 *  (le cas normal), puisque seul notifyUser(onboardingId, ...) était appelé. */
export async function notifyOnboarding(onboardingId, payload) {
  try {
    const ids = new Set();
    if (onboardingId) ids.add(onboardingId);
    const globaux = await _idsOnboardingGlobal();
    globaux.forEach(id => ids.add(id));
    if (!ids.size) return;
    await _insertNotifs([...ids], payload);
  } catch (err) { console.error('[notifyOnboarding]', err.message); }
}

/** Notifie les utilisateurs client_entreprise d'une entreprise précise.
 *
 * LA SOURCE EST FORCÉE À 'bet-elearning', et c'est une correction, pas une
 * préférence. `_insertNotifs` retombe sur 'dash' quand l'appelant ne dit rien -
 * or AUCUN de ses appelants ne le disait, et l'espace RH entreprise n'existe
 * que dans bet-elearning : son centre de notifications interroge
 * `/api/notifications/mes-notifs?source=bet-elearning`
 * (NotificationsContext.jsx:62), et le filtre écartait donc TOUTES les
 * notifications destinées aux entreprises - versement enregistré, contrat
 * renouvelé, bénéficiaire ajouté. Elles étaient écrites en base et invisibles
 * dans la cloche. Il n'existe aucun écran entreprise dans dash, donc aucun cas
 * où 'dash' serait le bon choix ici ; le défaut est posé au seul endroit qui
 * connaît la réponse plutôt que recopié dans quatorze appels.
 * Un appelant peut toujours l'écraser en passant `source` dans le payload. */
export async function notifyEntreprise(entreprise_id, payload) {
  if (!entreprise_id) return;
  try {
    const { data: users, error } = await supabase
      .from('utilisateurs')
      .select('id')
      .eq('role', 'client_entreprise')
      .eq('entreprise_id', entreprise_id)
      .eq('actif', true);
    if (error || !users?.length) return;
    await _insertNotifs(users.map(u => u.id), { source: 'bet-elearning', ...payload });
  } catch (err) {
    console.error('[notifyEntreprise]', err.message);
  }
}
