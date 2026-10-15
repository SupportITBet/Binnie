// Déconnexion automatique quand la session Supabase n'est plus valide -
// même principe que côté BET (dash) : on ne surveille pas l'inactivité avec un minuteur,
// on intercepte les réponses 401 des appels API et on tente un refresh silencieux avant
// de forcer la déconnexion si la session est réellement expirée.
import { supabase } from '../services/supabase';
import { pageConnexionDe } from '../constants/roles';

const ENDPOINTS_EXCLUS = [
  '/api/admin/login',
  '/api/admin/mfa',
  '/api/apprenants/check-eligibilite',
  '/api/auth/',
];

// Ce fichier tourne hors React (patch de window.fetch installé une seule fois au démarrage) -
// impossible d'y utiliser le modal React (ConfirmContext). On injecte donc une bannière stylée
// directement en DOM, cohérente visuellement avec le reste de l'app, plutôt que le window.alert()
// natif du navigateur qui bloquait le fil d'exécution en attendant un clic manuel sur "OK".
function afficherBanniereSessionExpiree() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,18,35,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:26px 28px;max-width:380px;width:90vw;box-shadow:0 30px 80px rgba(0,0,0,0.3);font-family:'Plus Jakarta Sans',sans-serif;text-align:center;">
      <div style="font-size:32px;margin-bottom:10px;">⏳</div>
      <div style="font-size:16px;font-weight:800;color:#0B1220;margin-bottom:8px;">Session expirée</div>
      <div style="font-size:13.5px;color:#4B5563;line-height:1.6;">Vous allez être déconnecté(e) automatiquement.<br/>Reconnectez-vous pour continuer.</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

/* ── UNE DÉCONNEXION VOLONTAIRE N'EST PAS UNE SESSION EXPIRÉE ──
   `seDeconnecter()` vide `bet_profil_mock` PUIS appelle `signOut()`. Les requêtes encore
   en vol répondent alors 401, l'intercepteur se déclenche, cherche le rôle dans un stockage
   qu'on vient d'effacer, ne le trouve pas, et renvoie vers le portail générique
   `/connexion` — en écrasant par `window.location.href` la navigation React qui menait
   pourtant à `/connexion/apprenant`.
   L'apprenant atterrissait donc sur la page de l'administration BET à chaque déconnexion.

   Ce drapeau dit à l'intercepteur de se taire : il n'y a pas de session à sauver ni de
   bannière « session expirée » à afficher quand c'est l'utilisateur qui est parti. */
let deconnexionVolontaire = false;
export function signalerDeconnexionVolontaire() {
  deconnexionVolontaire = true;
  // Les 401 d'une déconnexion arrivent dans la foulée ; au-delà, c'est une vraie expiration.
  setTimeout(() => { deconnexionVolontaire = false; }, 10_000);
}

/* ══ LE RÔLE DE LA SESSION EN COURS, EN MÉMOIRE ══════════════════════════════════════════
   LA CAUSE RÉELLE DU BUG, après deux correctifs qui visaient à côté.

   L'intercepteur cherchait le rôle dans deux stockages, dans cet ordre : `bet_profil_mock`
   (sessionStorage, posé par AuthContext) puis `admin_profil` (localStorage, posé par les
   cinq pages de connexion dédiées). Or AUCUNE déconnexion n'effaçait `admin_profil`,
   `admin_token` ni `admin_refresh` : ces clés survivaient à tout, indéfiniment.

   Dans un navigateur où l'on s'est connecté une fois comme coach ou comme admin — ce qui
   est le cas de tout poste de test —, un apprenant dont la session expire déclenchait donc :
     · soit la résurrection de la session de l'AUTRE compte, `admin_refresh` étant passé à
       `setSession()` ; le profil basculait alors sur ce rôle et écrasait `bet_profil_mock` ;
     · soit, si `bet_profil_mock` manquait à cet instant — un nouvel onglet dont le profil
       n'est pas encore résolu, et c'est précisément là que tombent les premiers appels —,
       la lecture du `admin_profil` périmé.
   Dans les deux cas le rôle trouvé était celui d'un coach ou d'un admin. Ces rôles n'ont
   pas de page de connexion dédiée (choix assumé), `pageConnexionDe` rend donc `null`, et
   `pageConnexion` restait sur `/connexion`. La résolution du rôle n'a jamais été en cause :
   c'était la MAUVAISE IDENTITÉ qu'on résolvait correctement.

   La variable ci-dessous est la seule source qui ne puisse pas être périmée ni partagée
   entre deux comptes : elle vit dans le module, donc dans l'onglet, et AuthContext la
   réécrit à chaque changement de profil. Les stockages restent en repli pour le cas d'un
   rechargement complet où le module repart à zéro avant que React ait monté. */
let roleCourant = null;
export function memoriserRoleSession(role) { roleCourant = role || null; }
export function oublierRoleSession() { roleCourant = null; }

/* Les comptes qui se connectent CÔTÉ SERVEUR (POST /api/admin/login) n'ont aucune session
   Supabase dans le navigateur : leur seul moyen de rafraîchir est le couple
   `admin_token`/`admin_refresh`. Un apprenant ou un parent, lui, a une vraie session
   Supabase — lui passer ces clés revient à lui prêter l'identité de quelqu'un d'autre. */
const ROLES_SANS_SESSION_SUPABASE = ['client_entreprise', 'professeur_titulaire', 'professeur_remplacant'];
const estCompteServeur = (role) =>
  !!role && (role.startsWith('admin') || ROLES_SANS_SESSION_SUPABASE.includes(role)
    || !['apprenant', 'parent'].includes(role));

export function installerInterceptionSession() {
  if (window.__betElearningSessionInterceptorInstalle) return;
  window.__betElearningSessionInterceptorInstalle = true;

  const fetchOrigine = window.fetch;
  let dejaDeclenche = false;

  window.fetch = async function (...args) {
    const response = await fetchOrigine(...args);

    if (response.status === 401 && !dejaDeclenche) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

      // Ignorer les appels Supabase eux-mêmes (ils gèrent déjà leurs propres 401)
      const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
      if (url.includes('supabase.co') || url.includes('supabase.io') || (supabaseUrl && url.startsWith(supabaseUrl))) {
        return response;
      }

      // Ignorer les routes de connexion/MFA - un 401 y est normal (mauvais mot de passe, etc.)
      if (ENDPOINTS_EXCLUS.some(ep => url.includes(ep))) {
        return response;
      }

      /* L'utilisateur vient de cliquer « Déconnexion » : les 401 qui suivent sont attendus.
         Les traiter comme une expiration afficherait une bannière inquiétante et
         détournerait la redirection vers le portail générique. */
      if (deconnexionVolontaire) {
        return response;
      }

      // Tenter un refresh silencieux de la session avant de conclure qu'elle est vraiment expirée.
      // Les admins se connectent côté serveur (POST /api/admin/login) sans jamais appeler
      // supabase.auth.setSession(...) - le client Supabase du navigateur n'a donc AUCUNE session
      // active à rafraîchir via refreshSession() seul, qui échoue systématiquement pour eux et
      // provoquait une déconnexion au premier 401, même transitoire (voir dash/src/App.js pour
      // le même correctif déjà appliqué côté dash).
      try {
        const storedAccess  = localStorage.getItem('admin_token')   || '';
        const storedRefresh = localStorage.getItem('admin_refresh') || '';
        let refreshedSession = null;

        /* `admin_refresh` N'EST UTILISÉ QUE PAR LES COMPTES QUI EN ONT BESOIN.
           Ces clés ne sont effacées par aucune déconnexion : dans un navigateur ayant servi
           à un coach ou à un admin, elles restent là pour toujours. Les passer à
           `setSession()` pour un apprenant ressuscitait la session de l'autre compte — son
           profil écrasait celui de l'apprenant, et la redirection suivait ce rôle-là.
           Un apprenant a sa propre session Supabase : c'est elle qu'on rafraîchit. */
        if (storedRefresh && estCompteServeur(roleCourant)) {
          const { data: sd } = await supabase.auth.setSession({ access_token: storedAccess, refresh_token: storedRefresh });
          refreshedSession = sd?.session;
        } else {
          const { data: rd } = await supabase.auth.refreshSession();
          refreshedSession = rd?.session;
        }

        if (refreshedSession?.access_token) {
          // On ne réécrit `admin_*` que pour les comptes dont c'est le stockage : sinon on
          // y déposerait les jetons d'un apprenant, et le mélange recommencerait.
          if (estCompteServeur(roleCourant)) {
            localStorage.setItem('admin_token', refreshedSession.access_token);
            if (refreshedSession.refresh_token) localStorage.setItem('admin_refresh', refreshedSession.refresh_token);
          }
          return response; // le listener onAuthStateChange met déjà à jour bet_access_token
        }
      } catch { /* refresh impossible, on continue vers la déconnexion */ }

      // Session vraiment expirée → déconnexion propre
      dejaDeclenche = true;

      // Retrouver le rôle AVANT de vider le storage - sinon la redirection tombe toujours
      // sur la page de connexion générique (portail BET), même pour un compte entreprise,
      // apprenant, parent ou professeur qui a sa propre page de connexion dédiée.
      /* DEUX EMPLACEMENTS, PARCE QUE LES PAGES DE CONNEXION N'ÉCRIVENT PAS AU MÊME ENDROIT.
         `bet_profil_mock` (sessionStorage) est posé par AuthContext ; les pages de connexion
         dédiées - entreprise, professeur, admin - écrivent, elles, `admin_profil`
         (localStorage) après l'appel API. Un RH entreprise n'a donc PAS de `bet_profil_mock` :
         la recherche échouait, `pageConnexion` restait sur le portail générique `/connexion`,
         et une session expirée le renvoyait vers un écran qui n'est pas le sien au lieu de
         `/connexion/entreprise`. On lit les deux, le premier qui donne un rôle connu gagne. */
      /* LE RÔLE VIVANT PASSE DEVANT LES STOCKAGES. C'est celui de la session réellement
         ouverte dans cet onglet, qu'aucune clé périmée d'un autre compte ne peut contredire.
         Les deux stockages ne servent plus qu'au cas où ce module vient d'être rechargé :
         `bet_profil_mock` est propre à l'onglet, `admin_profil` ne l'est pas — il est donc
         lu en DERNIER, et c'est bien ce qu'il est, un dernier recours. */
      let pageConnexion = '/connexion';
      const sources = [
        () => (roleCourant ? JSON.stringify({ role: roleCourant }) : null),
        () => sessionStorage.getItem('bet_profil_mock'),
        () => localStorage.getItem('admin_profil'),
      ];
      for (const lire of sources) {
        try {
          const profilSauvegarde = JSON.parse(lire() || 'null');
          /* `pageConnexionDe` plutôt que `ROLE_LOGIN[...]` : il résout la FAMILLE du rôle,
             et ne rate donc pas une variante (un apprenant par tranche d'âge, un `coach`
             au lieu de `professeur_titulaire`) qui n'a pas de clé exacte dans la table. */
          const page = profilSauvegarde?.role ? pageConnexionDe(profilSauvegarde.role) : null;
          if (page) { pageConnexion = page; break; }
        } catch { /* source illisible, on tente la suivante */ }
      }

      sessionStorage.removeItem('bet_profil_mock');
      localStorage.removeItem('bet_access_token');
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_refresh');
      localStorage.removeItem('admin_profil');
      try { await supabase.auth.signOut(); } catch { /* best-effort */ }
      afficherBanniereSessionExpiree();
      // Laisse la bannière visible un court instant avant la redirection - plus proche du
      // comportement "automatique" annoncé que le window.alert() bloquant qu'il remplace.
      setTimeout(() => { window.location.href = pageConnexion; }, 1800);
    }

    return response;
  };
}
