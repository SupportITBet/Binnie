import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_REDIRECT } from '../../constants/roles';
import { supabase } from '../../services/supabase';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Mapping rôles backend BET → rôles bet-elearning
const ROLE_MAP_BET = {
  super_admin:         'admin_manager',
  admin:               'admin_manager',
  manager:             'admin_manager',
  superviseur:         'admin_superviseur',
  deputy_superviseur:  'admin_deputy_superviseur',
  data_collector:      'admin_placement',
  placement_test:      'admin_placement',
  onboarding:          'admin_onboarding',
  pedagogical_advisor: 'admin_pa_advisor',
  admin_elearning:     'admin_elearning',
  assistant_elearning: 'admin_elearning',
  customer_care:       'admin_customer_care',
  // Assistante Corporate fusionnée avec Assistant E-Learning - voir constants/roles.js
  commercial:          'admin_elearning',
  rh:                  'admin_rh_paie',
  rh_paie:             'admin_rh_paie',
  comptable:           'admin_comptable',
  coach:               'professeur_titulaire',
  responsable:         'admin_responsable',
  gestionnaire:        'admin_gestionnaire',
  // Rôles admin_* stockés directement en base
  admin_placement:     'admin_placement',
  admin_onboarding:    'admin_onboarding',
  admin_customer_care: 'admin_customer_care',
  admin_commercial:    'admin_elearning',
  admin_pa_advisor:    'admin_pa_advisor',
  admin_rh_paie:       'admin_rh_paie',
  admin_comptable:     'admin_comptable',
  admin_manager:       'admin_manager',
  admin_superviseur:        'admin_superviseur',
  admin_deputy_superviseur: 'admin_deputy_superviseur',
  professeur_titulaire:  'professeur_titulaire',
  professeur_remplacant: 'professeur_remplacant',
};

export default function SSOLogin() {
  const { connexionReel } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const params = new URLSearchParams(window.location.search);
    const ticket = params.get('ticket');

    if (!ticket) {
      navigate('/connexion', { replace: true });
      return;
    }

    (async () => {
    try {
      // Le ticket est signé côté Backend, valable 45s et à usage unique - il encapsule le
      // vrai token de session et le profil cible (vérifié serveur), plus jamais transmis en
      // clair dans l'URL. Un ticket expiré, rejoué ou forgé est rejeté ici, avant tout rendu.
      const r = await fetch(`${API_URL}/api/admin/sso/consume?ticket=${encodeURIComponent(ticket)}`);
      if (!r.ok) {
        navigate('/connexion', { replace: true });
        return;
      }
      const { token, refresh, profil } = await r.json();

      // Le rôle backend doit être connu de la table de correspondance - un rôle non mappé
      // (typo, nouveau rôle jamais synchronisé ici) ne doit jamais retomber sur un rôle
      // à privilèges élevés par défaut.
      const roleBet = ROLE_MAP_BET[profil.role];
      if (!roleBet) {
        navigate('/connexion', { replace: true });
        return;
      }

      // Si une vraie session Supabase Auth (ex: coach connecté normalement dans cet onglet/
      // navigateur) est encore active, elle reprend la main sur le profil mock SSO au prochain
      // getSession()/onAuthStateChange de AuthContext et écrase le profil qu'on vient de poser.
      // Il faut donc la couper explicitement avant d'appliquer le profil SSO.
      if (supabase) await supabase.auth.signOut().catch(() => {});

      // Stocker les tokens pour les appels API admin (token du super admin qui a initié le SSO)
      localStorage.setItem('admin_token',   token);
      if (refresh) localStorage.setItem('admin_refresh', refresh);
      localStorage.setItem('admin_profil',  JSON.stringify(profil));

      const profilBet = {
        id:         profil.id,
        role:       roleBet,
        prenom:     profil.prenom  || '',
        nom:        profil.nom     || '',
        email:      profil.email   || '',
        avatar_url: profil.avatar_url || null,
        couleur:    profil.couleur    || null,
        est_actif:  true,
      };

      connexionReel(profilBet);
      navigate(ROLE_REDIRECT[roleBet] || '/admin/manager', { replace: true });
    } catch {
      navigate('/connexion', { replace: true });
    }
    })();
  }, []);

  return (
    <div style={{
      display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
      background: '#F8FAFC', fontFamily: '"Plus Jakarta Sans", sans-serif', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ width: 44, height: 44, border: '3px solid #E2E8F0', borderTopColor: '#0891B2',
        borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <div style={{ fontSize: 14, color: '#475569', fontWeight: 500 }}>Connexion en cours…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
