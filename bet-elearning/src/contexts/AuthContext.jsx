import { createContext, useContext, useEffect, useState } from 'react';
import { signalerDeconnexionVolontaire, memoriserRoleSession, oublierRoleSession } from '../utils/sessionInterceptor';
import { supabase } from '../services/supabase';
import { calcTranche } from '../utils/trancheAge';
import { ROLE_MAP_BET } from '../constants/roles';

const _API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const AuthContext = createContext(null);

// Code 2FA mock (TOTP simulé) - toujours "123456" en dev
const CODE_2FA_MOCK = '123456';

// Profils mock pour développement sans Supabase configuré
const PROFILS_MOCK = {
  'apprenant@bet.ci': {
    id: 'prof-001', role: 'apprenant', prenom: 'Aminata', nom: 'Koné',
    email: 'apprenant@bet.ci', est_actif: true,
  },
  'adulte@bet.ci': {
    id: 'prof-adulte-001', role: 'apprenant', prenom: 'Kofi', nom: 'Asante',
    email: 'adulte@bet.ci', est_actif: true,
  },
  'parent@bet.ci': {
    id: 'par-001', role: 'parent', prenom: 'Djeneba', nom: 'Koné',
    email: 'parent@bet.ci', est_actif: true,
    deux_facteurs: false,
    enfants: [{ id: 'prof-001', prenom: 'Aminata', nom: 'Koné' }],
  },
  'prof@bet.ci': {
    id: 'teacher-001', role: 'professeur_titulaire', prenom: 'Marie', nom: 'Dupont',
    email: 'prof@bet.ci', est_actif: true,
  },
  'admin@bet.ci': {
    id: 'admin-001', role: 'admin_manager', prenom: 'Bernard', nom: 'Aka',
    email: 'admin@bet.ci', est_actif: true, deux_facteurs: true,
  },
  'superviseur@bet.ci': {
    id: 'admin-002', role: 'admin_superviseur', prenom: 'Clarisse', nom: 'Bah',
    email: 'superviseur@bet.ci', est_actif: true,
  },
  'deputy@bet.ci': {
    id: 'admin-012', role: 'admin_deputy_superviseur', prenom: 'Marc', nom: 'Kouassi',
    email: 'deputy@bet.ci', est_actif: true,
  },
  'placement@bet.ci': {
    id: 'admin-003', role: 'admin_placement', prenom: 'Eric', nom: 'Yao',
    email: 'placement@bet.ci', est_actif: true,
  },
  'onboarding@bet.ci': {
    id: 'admin-004', role: 'admin_onboarding', prenom: 'Fatoumata', nom: 'Sow',
    email: 'onboarding@bet.ci', est_actif: true,
  },
  'elearning@bet.ci': {
    id: 'admin-005', role: 'admin_elearning', prenom: 'Guy', nom: 'Assi',
    email: 'elearning@bet.ci', est_actif: true,
  },
  'support@bet.ci': {
    id: 'admin-006', role: 'admin_customer_care', prenom: 'Hawa', nom: 'Camara',
    email: 'support@bet.ci', est_actif: true,
  },
  'pa@bet.ci': {
    id: 'admin-007', role: 'admin_pa_advisor', prenom: 'Isabelle', nom: 'Kouassi',
    email: 'pa@bet.ci', est_actif: true,
  },
  'rh@bet.ci': {
    id: 'admin-008', role: 'admin_rh_paie', prenom: 'Jonas', nom: 'Diomandé',
    email: 'rh@bet.ci', est_actif: true,
  },
  'comptable@bet.ci': {
    id: 'admin-009', role: 'admin_comptable', prenom: 'Koffi', nom: 'Mensah',
    email: 'comptable@bet.ci', est_actif: true,
  },
  'commercial@bet.ci': {
    id: 'admin-011', role: 'admin_commercial', prenom: 'Nadia', nom: 'Koné',
    email: 'commercial@bet.ci', est_actif: true,
  },
  'remplacant@bet.ci': {
    id: 'teacher-003', role: 'professeur_remplacant', prenom: 'Sophie', nom: 'Leclerc',
    email: 'remplacant@bet.ci', est_actif: true,
  },
  'tlg@bet.ci': {
    id: 'tlg-rh-001', role: 'client_entreprise', prenom: 'Jean-Paul', nom: 'Kouamé',
    email: 'tlg@bet.ci', entreprise_id: 'ent-001', est_actif: true,
  },
};

const SUPABASE_ACTIF = !!(supabase);

export function AuthProvider({ children }) {
  const [profile, setProfile]               = useState(null);
  const [loading, setLoading]               = useState(true);
  const [delegation, setDelegation]         = useState(null);
  const [delegationsSortantes, setDelegationsSortantes] = useState([]);
  const [delegationsRecues, setDelegationsRecues] = useState([]);
  const [profilEnAttente2FA, setProfilEnAttente2FA] = useState(null);

  useEffect(() => {
    if (!SUPABASE_ACTIF) {
      // Mode développement : lire le profil depuis sessionStorage
      const profilSauvegarde = sessionStorage.getItem('bet_profil_mock');
      if (profilSauvegarde) setProfile(JSON.parse(profilSauvegarde));
      setLoading(false);
      return;
    }

    // Sur /sso, SSOLogin possède seul la résolution d'identité (il coupe explicitement toute
    // session Supabase réelle avant de poser le profil mock) - si on laisse chargerProfil()
    // tourner ici en parallèle, une session encore valide au moment du montage (ex: un coach
    // resté connecté dans cet onglet) gagne la course et écrase le profil visé par le SSO.
    const surRouteSSO = window.location.pathname === '/sso';

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (surRouteSSO) { setLoading(false); return; }
      if (session?.user) {
        if (session.access_token) localStorage.setItem('bet_access_token', session.access_token);
        chargerProfil(session.user.id);
      } else {
        // Pas de session Supabase → fallback sur profil SSO/mock en sessionStorage
        const saved = sessionStorage.getItem('bet_profil_mock');
        if (saved) setProfile(JSON.parse(saved));
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (surRouteSSO) { setLoading(false); return; }
      if (session?.user) {
        if (session.access_token) localStorage.setItem('bet_access_token', session.access_token);
        chargerProfil(session.user.id);
      } else {
        localStorage.removeItem('bet_access_token');
        // Ne pas effacer un profil SSO stocké en sessionStorage
        const saved = sessionStorage.getItem('bet_profil_mock');
        if (!saved) { setProfile(null); setDelegation(null); }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /* ── LE RÔLE VIVANT, DONNÉ À L'INTERCEPTEUR DE SESSION ──
     Il en a besoin pour savoir vers quelle page de connexion renvoyer quand la session
     expire. Il le cherchait dans les stockages ; or `admin_profil` (localStorage) n'est
     effacé par personne et appartient au compte connecté AVANT celui-ci, si bien qu'un
     apprenant était renvoyé vers la page du coach ou de l'admin — c'est-à-dire, ces rôles
     n'ayant pas de page dédiée, vers le portail générique `/connexion`.
     Un seul effet couvre TOUS les chemins qui posent un profil (connexion directe, reprise
     de session, 2FA, SSO, profils mock) : les traiter un par un en aurait forcément oublié
     un, et c'est exactement ce qui est arrivé deux fois. */
  useEffect(() => {
    if (profile?.role) memoriserRoleSession(profile.role);
    else oublierRoleSession();
  }, [profile?.role]);

  async function chargerProfil(userId) {
    // Si la connexion a été faite explicitement en tant que parent (via seConnecterParent),
    // on respecte ce choix sans interroger utilisateurs - le rôle est déjà dans sessionStorage.
    try {
      const saved = sessionStorage.getItem('bet_profil_mock');
      if (saved) {
        const s = JSON.parse(saved);
        if (s?.role === 'parent' && s?.id === userId) {
          setProfile(s);
          setLoading(false);
          return;
        }
      }
    } catch { /* ignore */ }

    // Les apprenants/coachs bet-elearning sont dans `utilisateurs` (pas de table `profiles`)
    let data = null;
    const { data: u } = await supabase.from('utilisateurs').select('*').eq('id', userId).maybeSingle();
    if (u) {
      data = { ...u };
      // Remapper le rôle DB brut vers le rôle "façade" attendu par le frontend (même mapping
      // qu'au login, cf. LoginAdmin.jsx) - sans ça, un F5 sur un compte admin_* (onboarding,
      // superviseur, manager…) fait perdre le rôle façade et casse tout le routing basé dessus.
      /* `role_reel` GARDE LE RÔLE DE LA BASE avant que la façade l'écrase. Sans lui, un super
         admin devient indistinguable d'un manager : il s'affichait « Manager BET » dans
         l'en-tête, et aucun écran ne pouvait savoir à qui il parlait. On ne s'en sert JAMAIS
         pour router ou autoriser - c'est le rôle façade qui le fait, et le backend tranche de
         son côté - uniquement pour dire qui est connecté. */
      data.role_reel = data.role;
      if (data.role === 'coach') {
        data.role = data.type_coach === 'professeur_remplacant' ? 'professeur_remplacant' : 'professeur_titulaire';
      } else if (ROLE_MAP_BET[data.role]) {
        data.role = ROLE_MAP_BET[data.role];
      }
      // Pour les apprenants : enrichir avec tranche_age depuis classes_elearning_apprenants
      if (data.role === 'apprenant') {
        const { data: inscr } = await supabase
          .from('classes_elearning_apprenants')
          .select('date_naissance')
          .eq('apprenant_id', userId)
          .neq('statut', 'suspendu')
          .limit(1)
          .maybeSingle();
        data.tranche_age = calcTranche(inscr?.date_naissance);
      }
    } else {
      // Fallback : si l'apprenant n'est pas dans `utilisateurs`,
      // utiliser le profil minimal sauvegardé par seConnecter dans sessionStorage
      try {
        const saved = sessionStorage.getItem('bet_profil_mock');
        if (saved) data = JSON.parse(saved);
      } catch { /* ignore */ }
    }
    setProfile(data);
    /* ── LE PROFIL EST AUSSI PERSISTÉ ICI, ET C'EST CE QUI MANQUAIT ──
       `bet_profil_mock` n'était écrit qu'à la CONNEXION. Or `sessionStorage` est propre à
       un onglet : rouvrir l'application dans un nouvel onglet reprenait bien la session
       Supabase (stockée, elle, dans `localStorage`) et rechargeait le profil depuis la
       base — mais sans jamais réécrire cette clé.

       Conséquence, invisible jusqu'à l'expiration : l'intercepteur de session cherche le
       rôle dans `bet_profil_mock` pour savoir vers quelle page de connexion renvoyer. Il
       ne trouvait rien, retombait sur le portail générique, et un apprenant déconnecté
       automatiquement atterrissait sur l'écran de l'administration BET au lieu du sien.

       On l'écrit à chaque chargement de profil : la clé suit l'onglet, quel que soit le
       chemin par lequel la session y est arrivée. */
    try {
      if (data?.role) sessionStorage.setItem('bet_profil_mock', JSON.stringify(data));
    } catch { /* stockage refusé (navigation privée) : l'intercepteur retombera sur le portail */ }
    setLoading(false);
  }

  // Charge la délégation active d'un coach quel que soit le chemin de connexion emprunté
  // (chargerProfil, connexionReel, ou restauration depuis sessionStorage au rechargement de
  // page) - un seul point d'entrée pour ne rater aucun cas. N'importe quel coach (titulaire
  // ou remplaçant dédié) peut se voir confier une délégation temporaire, voir
  // Backend/docs/remplacement-schema.html.
  useEffect(() => {
    if (!profile?.id) { setDelegation(null); return; }
    if (profile.role !== 'professeur_remplacant' && profile.role !== 'professeur_titulaire') return;

    let annule = false;

    async function chargerDelegation() {
      // Select simple (pas d'embed titulaire:/groupe:) - `delegations.titulaire_id` et
      // `.groupe_id` n'ont pas de contrainte FK déclarée, donc PostgREST ne peut pas résoudre
      // une syntaxe d'embed et renvoie une erreur pour toute la requête. On récupère donc
      // titulaire/groupe via deux requêtes ciblées séparées, juste pour l'affichage (bannière).
      const { data: del, error } = await supabase
        .from('delegations')
        .select('*')
        .eq('remplacant_id', profile.id)
        .eq('statut', 'active')
        .maybeSingle();
      if (error) { console.error('[AuthContext] chargement délégation:', error.message); if (!annule) setDelegation(null); return; }
      if (annule) return;
      if (!del) { setDelegation(null); return; }
      const [{ data: titulaire }, { data: groupe }, { data: remplacement }] = await Promise.all([
        del.titulaire_id
          ? supabase.from('utilisateurs').select('prenom, nom').eq('id', del.titulaire_id).maybeSingle()
          : Promise.resolve({ data: null }),
        del.groupe_id
          ? supabase.from('classes_elearning').select('nom').eq('id', del.groupe_id).maybeSingle()
          : Promise.resolve({ data: null }),
        // `remplacement_id` permet de retrouver qui (quel PA Advisor, parmi les 2 à 5 en poste)
        // a validé cette assignation - sans ça, le remplaçant voit "vous remplacez X" sans
        // jamais savoir qui a pris la décision de l'y affecter.
        del.remplacement_id
          ? supabase.from('remplacements').select('assigne_par_nom').eq('id', del.remplacement_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (annule) return;
      setDelegation({ ...del, titulaire: titulaire || null, groupe: groupe || null, assigne_par_nom: remplacement?.assigne_par_nom || null });
    }

    async function chargerDelegationsRecues() {
      // Historique complet des délégations reçues (tous statuts, pas seulement "active") -
      // utilisé pour garder le badge "🔄 Remplacement" sur une session dans "Mes paiements"
      // même après la clôture de la délégation qui l'a couverte (contrairement à `delegation`,
      // qui ne reflète que la délégation EN COURS).
      const { data: dels, error } = await supabase
        .from('delegations')
        .select('remplacement_id, groupe_id, sessions_ids, statut')
        .eq('remplacant_id', profile.id);
      if (error) { console.error('[AuthContext] chargement délégations reçues:', error.message); return; }
      if (!annule) setDelegationsRecues(dels || []);
    }

    async function chargerDelegationsSortantes() {
      // Délégations sortantes (le coach connecté est titulaire ET a délégué certaines de ses
      // séances), TOUS statuts confondus - pas seulement "active". Nécessaire pour que "Mes
      // paiements" côté titulaire exclue ces séances en permanence, y compris après la clôture
      // de la délégation : `sessionsLocales` côté titulaire n'est chargé qu'une fois au
      // montage (pas de refetch périodique), donc une copie obsolète avec l'ancien
      // professeur_id peut y rester même après la réattribution réelle de coach_id en base -
      // sans cette exclusion permanente, la séance réapparaît chez le titulaire dès que la
      // délégation quitte le statut "active".
      const { data: dels, error } = await supabase
        .from('delegations')
        .select('*')
        .eq('titulaire_id', profile.id);
      if (error) { console.error('[AuthContext] chargement délégations sortantes:', error.message); return; }
      if (!annule) setDelegationsSortantes(dels || []);
    }

    function rafraichir() {
      chargerDelegation().catch(() => { if (!annule) setDelegation(null); });
      chargerDelegationsSortantes().catch(() => { if (!annule) setDelegationsSortantes([]); });
      chargerDelegationsRecues().catch(() => { if (!annule) setDelegationsRecues([]); });
    }

    rafraichir();
    // Une délégation peut être créée/clôturée côté serveur (par le PA, ou automatiquement à la
    // clôture de la dernière séance couverte) pendant que cet onglet reste ouvert - sans
    // rafraîchissement périodique, la bannière "Délégation active" restait figée indéfiniment
    // après la fin réelle de la délégation, jusqu'au rechargement manuel de la page.
    const intervalId = setInterval(rafraichir, 45000);
    return () => { annule = true; clearInterval(intervalId); };
  }, [profile?.id, profile?.role]);

  // ── Rafraîchissement périodique des permissions (tous rôles admin/staff) ──
  // profile.permissions est résolu UNE SEULE FOIS, au login, et mis en cache dans
  // sessionStorage - un admin qui modifie les droits d'un utilisateur déjà connecté (Gestion
  // des droits) n'a jusqu'ici jamais d'effet tant que cette session reste ouverte, obligeant à
  // se déconnecter/reconnecter à chaque changement. GET /api/admin/me renvoie req.profil.permissions,
  // recalculé à chaque requête par authenticateAdmin - on le réinterroge périodiquement pour que
  // les boutons dépendant des permissions (Finances, Contrats…) se mettent à jour tout seuls.
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!profile?.id || !token) return;
    let annule = false;

    async function rafraichirPermissions() {
      try {
        const res = await fetch(`${_API}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const { profil } = await res.json();
        if (annule || !profil?.permissions) return;
        setProfile(prev => {
          if (!prev) return prev;
          const maj = { ...prev, permissions: profil.permissions };
          sessionStorage.setItem('bet_profil_mock', JSON.stringify(maj));
          return maj;
        });
      } catch { /* silencieux - on retentera au prochain intervalle */ }
    }

    rafraichirPermissions();
    const intervalId = setInterval(rafraichirPermissions, 60000);
    return () => { annule = true; clearInterval(intervalId); };
  }, [profile?.id]);

  async function seConnecter(email, motDePasse) {
    if (!SUPABASE_ACTIF) {
      const emailNorm = email.toLowerCase();

      // 1) Profils statiques mock
      const profilMock = PROFILS_MOCK[emailNorm];
      if (profilMock && motDePasse === 'bet2026') {
        if (profilMock.deux_facteurs) { setProfilEnAttente2FA(profilMock); return { besoin2FA: true }; }
        sessionStorage.setItem('bet_profil_mock', JSON.stringify(profilMock));
        setProfile(profilMock);
        return { besoin2FA: false };
      }

      // 2) Comptes parents dynamiques
      try {
        const p = JSON.parse(sessionStorage.getItem('bet_comptes_parents') || '{}')[emailNorm];
        if (p && p.mot_de_passe === motDePasse) {
          const profil = { ...p }; delete profil.mot_de_passe;
          if (profil.deux_facteurs) { setProfilEnAttente2FA(profil); return { besoin2FA: true }; }
          sessionStorage.setItem('bet_profil_mock', JSON.stringify(profil));
          setProfile(profil); return { besoin2FA: false };
        }
      } catch { /* ignore */ }

      // 3) Comptes entreprises dynamiques
      try {
        const e = JSON.parse(sessionStorage.getItem('bet_comptes_entreprises') || '{}')[emailNorm];
        if (e && e.mot_de_passe === motDePasse) {
          const profil = { id: e.id, role: e.role, prenom: e.prenom, nom: e.nom, email: e.email, entreprise_id: e.entreprise_id, est_actif: e.est_actif };
          sessionStorage.setItem('bet_profil_mock', JSON.stringify(profil));
          setProfile(profil); return { besoin2FA: false };
        }
      } catch { /* ignore */ }

      throw new Error('Email ou mot de passe incorrect');
    }

    // ── Mode réel : signInWithPassword direct (même approche que dash/LoginApprenant) ──
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password: motDePasse,
    });
    if (authErr) throw new Error('Email ou mot de passe incorrect');

    const token = authData.session?.access_token;
    const user  = authData.user;
    const appMeta  = user?.app_metadata  || {};
    const userMeta = user?.user_metadata || {};

    // Les parents avec un compte Supabase dédié ont app_metadata.role = 'parent'
    const roleJWT = appMeta.role || userMeta.role || null;
    const estParent = roleJWT === 'parent';

    if (!estParent && token) {
      try {
        const checkRes = await fetch(`${_API}/api/apprenants/check-eligibilite`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const check = await checkRes.json();
        if (!check.eligible) {
          await supabase.auth.signOut();
          const raisons = {
            acces_suspendu_definitif: `🚫 Votre accès a été définitivement suspendu.${check.motif ? ' Motif : ' + check.motif : ''}`,
            acces_suspendu_momentane: `⏸️ Votre accès est temporairement suspendu.${check.motif ? ' Motif : ' + check.motif : ''}`,
            test_manquant:            "⏳ Votre test de niveau n'a pas encore été effectué. Contactez votre responsable BET.",
            classe_manquante:         "⏳ Votre classe n'a pas encore été assignée. Contactez votre responsable BET.",
          };
          throw new Error(raisons[check.raison] || '⏳ Votre dossier est en cours de traitement. Contactez votre responsable BET.');
        }
      } catch (checkErr) {
        if (['⏳','🚫','⏸️'].some(p => checkErr.message?.startsWith(p))) throw checkErr;
        console.warn('[check-eligibilite] non bloquant:', checkErr.message);
      }
    }

    const profilMinimal = {
      id:     user?.id,
      email:  user?.email,
      nom:    userMeta.nom    || user?.email?.split('@')[0] || '',
      prenom: userMeta.prenom || '',
      role:   estParent ? 'parent' : 'apprenant',
      actif:  true,
    };
    /* ON REPART D'UN STOCKAGE PROPRE. Un apprenant ou un parent n'a rien à faire des clés
       `admin_*` : elles appartiennent au compte qui s'est connecté avant lui par une page
       dédiée, et elles ne s'effaçaient jusqu'ici jamais. Les laisser là, c'est lui prêter
       le profil et le jeton de rafraîchissement de quelqu'un d'autre — et c'est ce que
       l'intercepteur lisait à l'expiration de SA session.
       Nettoyer ici, et pas seulement à la déconnexion, remet d'aplomb les navigateurs déjà
       pollués : le poste de test n'a pas besoin d'être vidé à la main. */
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh');
    localStorage.removeItem('admin_profil');
    sessionStorage.setItem('bet_profil_mock', JSON.stringify(profilMinimal));
    memoriserRoleSession(profilMinimal.role);
    setProfile(profilMinimal);

    return { besoin2FA: false };
  }

  // Connexion directe parent (via téléphone) - role forcé à 'parent', pas de check-eligibilite
  async function seConnecterParent(email, motDePasse) {
    if (!SUPABASE_ACTIF) {
      const profilMock = { id: 'par-phone-001', role: 'parent', prenom: 'Parent', nom: 'Demo', email, est_actif: true };
      sessionStorage.setItem('bet_profil_mock', JSON.stringify(profilMock));
      setProfile(profilMock);
      return { besoin2FA: false };
    }

    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password: motDePasse,
    });
    if (authErr) throw new Error('Mot de passe incorrect');

    const user     = authData.user;
    const userMeta = user?.user_metadata || {};
    const profilMinimal = {
      id:     user?.id,
      email:  user?.email,
      nom:    userMeta.nom    || user?.email?.split('@')[0] || '',
      prenom: userMeta.prenom || '',
      role:   'parent',
      actif:  true,
    };
    // Même nettoyage que pour l'apprenant : le parent a sa propre session Supabase et sa
    // propre page de connexion, il ne doit pas hériter des clés `admin_*` du compte d'avant.
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh');
    localStorage.removeItem('admin_profil');
    sessionStorage.setItem('bet_profil_mock', JSON.stringify(profilMinimal));
    memoriserRoleSession(profilMinimal.role);
    setProfile(profilMinimal);
    return { besoin2FA: false };
  }

  function valider2FA(code) {
    if (!profilEnAttente2FA) return false;
    const codeAttendu = !SUPABASE_ACTIF ? CODE_2FA_MOCK : null;
    if (code !== codeAttendu) return false;
    sessionStorage.setItem('bet_profil_mock', JSON.stringify(profilEnAttente2FA));
    setProfile(profilEnAttente2FA);
    setProfilEnAttente2FA(null);
    return true;
  }

  function annuler2FA() {
    setProfilEnAttente2FA(null);
  }

  function activer2FA(actif) {
    if (!profile) return;
    const updated = { ...profile, deux_facteurs: actif };
    sessionStorage.setItem('bet_profil_mock', JSON.stringify(updated));
    setProfile(updated);
  }

  async function reinitMDP(email) {
    if (!SUPABASE_ACTIF) {
      // Mock : simule l'envoi d'un email de réinitialisation
      return { succes: true, message: `Un lien de réinitialisation a été envoyé à ${email}.` };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinit-mdp`,
    });
    if (error) throw error;
    return { succes: true };
  }

  function connexionReel(profilData) {
    sessionStorage.setItem('bet_profil_mock', JSON.stringify(profilData));
    setProfile(profilData);
  }

  async function seDeconnecter() {
    /* On PRÉVIENT L'INTERCEPTEUR AVANT de vider quoi que ce soit. Il surveille les 401
       pour détecter une session expirée ; ceux qui suivent une déconnexion volontaire n'en
       sont pas, et il les traitait pourtant comme telle — redirigeant vers le portail
       générique `/connexion` au lieu de la page du rôle, par `window.location.href` qui
       écrase la navigation React. */
    signalerDeconnexionVolontaire();
    oublierRoleSession();
    /* ── TOUTES LES CLÉS D'IDENTITÉ, PAS SEULEMENT `bet_profil_mock` ──
       Le commentaire que cette ligne remplace affirmait que `bet_profil_mock` était « la
       source unique de vérité ». C'était faux : les cinq pages de connexion dédiées
       (admin, professeur, entreprise, portail, SSO) écrivent `admin_profil`, `admin_token`
       et `admin_refresh` dans localStorage, et RIEN ne les effaçait jamais. Elles
       survivaient à la déconnexion, au changement de compte et à la fermeture du
       navigateur.
       Un apprenant se connectant ensuite sur ce poste héritait donc, sans le savoir, du
       profil et du jeton de rafraîchissement du compte précédent — et c'est ce qui le
       renvoyait vers `/connexion` à l'expiration : l'intercepteur résolvait correctement
       le rôle… de quelqu'un d'autre. On part proprement. */
    sessionStorage.removeItem('bet_profil_mock');
    localStorage.removeItem('bet_access_token');
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh');
    localStorage.removeItem('admin_profil');
    setProfile(null);
    setDelegation(null);
    setDelegationsSortantes([]);
    setDelegationsRecues([]);
    if (SUPABASE_ACTIF) await supabase.auth.signOut().catch(() => {});
  }

  return (
    <AuthContext.Provider value={{
      profile, loading, delegation, delegationsSortantes, delegationsRecues,
      profilEnAttente2FA,
      seConnecter, seConnecterParent, seDeconnecter,
      valider2FA, annuler2FA, activer2FA,
      reinitMDP, connexionReel,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
