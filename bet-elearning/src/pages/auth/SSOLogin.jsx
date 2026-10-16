import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_REDIRECT, ROLE_MAP_BET, roleBetDe } from '../../constants/roles';
import { supabase } from '../../services/supabase';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/* LA TABLE DE CORRESPONDANCE N'EST PLUS RECOPIÉE ICI.
   Ce fichier portait sa propre copie de trente-et-une entrées, figée sur l'ancienne fusion des
   rôles : `admin`, `super_admin` et `manager` y aboutissaient encore tous à `admin_manager`.
   Résultat, le rôle obtenu dépendait de la page de connexion utilisée — la table centrale avait
   dé-fusionné, celle-ci non. On importe désormais la seule qui fasse foi. */


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
      navigate('/access/bet-learning', { replace: true });
      return;
    }

    (async () => {
    try {
      // Le ticket est signé côté Backend, valable 45s et à usage unique - il encapsule le
      // vrai token de session et le profil cible (vérifié serveur), plus jamais transmis en
      // clair dans l'URL. Un ticket expiré, rejoué ou forgé est rejeté ici, avant tout rendu.
      const r = await fetch(`${API_URL}/api/admin/sso/consume?ticket=${encodeURIComponent(ticket)}`);
      if (!r.ok) {
        navigate('/access/bet-learning', { replace: true });
        return;
      }
      const { token, refresh, profil } = await r.json();

      // Le rôle backend doit être connu de la table de correspondance - un rôle non mappé
      // (typo, nouveau rôle jamais synchronisé ici) ne doit jamais retomber sur un rôle
      // à privilèges élevés par défaut.
      const roleBet = roleBetDe(profil.role);
      if (!roleBet) {
        navigate('/access/bet-learning', { replace: true });
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
        // C'EST LE CHEMIN QUE PREND LE SUPER ADMIN : son dashboard de dash propose un bouton
        // SSO vers bet-elearning (SuperAdminDashboard.jsx). Sans `role_reel` ici, il arrivait
        // etiquete « Manager BET » - la facade `admin_manager` etant correcte pour le routage,
        // mais fausse pour dire qui est connecte.
        role_reel:  profil.role,
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
      navigate('/access/bet-learning', { replace: true });
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
