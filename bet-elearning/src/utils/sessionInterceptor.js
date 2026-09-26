// Déconnexion automatique quand la session Supabase n'est plus valide -
// même principe que côté BET (dash) : on ne surveille pas l'inactivité avec un minuteur,
// on intercepte les réponses 401 des appels API et on tente un refresh silencieux avant
// de forcer la déconnexion si la session est réellement expirée.
import { supabase } from '../services/supabase';
import { ROLE_LOGIN } from '../constants/roles';

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

        if (storedRefresh) {
          const { data: sd } = await supabase.auth.setSession({ access_token: storedAccess, refresh_token: storedRefresh });
          refreshedSession = sd?.session;
        } else {
          const { data: rd } = await supabase.auth.refreshSession();
          refreshedSession = rd?.session;
        }

        if (refreshedSession?.access_token) {
          localStorage.setItem('admin_token', refreshedSession.access_token);
          if (refreshedSession.refresh_token) localStorage.setItem('admin_refresh', refreshedSession.refresh_token);
          return response; // le listener onAuthStateChange met déjà à jour bet_access_token
        }
      } catch { /* refresh impossible, on continue vers la déconnexion */ }

      // Session vraiment expirée → déconnexion propre
      dejaDeclenche = true;

      // Retrouver le rôle AVANT de vider le storage - sinon la redirection tombe toujours
      // sur la page de connexion générique (portail BET), même pour un compte entreprise,
      // apprenant, parent ou professeur qui a sa propre page de connexion dédiée.
      let pageConnexion = '/connexion';
      try {
        const profilSauvegarde = JSON.parse(sessionStorage.getItem('bet_profil_mock') || 'null');
        if (profilSauvegarde?.role && ROLE_LOGIN[profilSauvegarde.role]) {
          pageConnexion = ROLE_LOGIN[profilSauvegarde.role];
        }
      } catch { /* rôle indisponible, on garde /connexion par défaut (comptes BET) */ }

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
