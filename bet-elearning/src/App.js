import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UsersProvider } from './contexts/UsersContext';
import { MessagerieProvider } from './contexts/MessagerieContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { pageAccueilDe, pageConnexionDe, estRole } from './constants/roles';
import { LangueProvider } from './contexts/LangueContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { installerInterceptionSession } from './utils/sessionInterceptor';
import './App.css';

// Pages Auth
import Login             from './pages/auth/Login';
// `LoginAdmin` n'est plus routé : la porte du personnel sert désormais `Login`, la page
// qui REGROUPE TOUS LES PROFILS. Le fichier est conservé, il reste la variante « identifiant
// sans choix de profil » si on veut la remonter un jour.
// import LoginAdmin        from './pages/auth/LoginAdmin';
import LoginApprenant    from './pages/auth/LoginApprenant';
import LoginParent       from './pages/auth/LoginParent';
import LoginEntreprise   from './pages/auth/LoginEntreprise';
import SSOLogin          from './pages/auth/SSOLogin';
import AccessGate        from './pages/auth/AccessGate';
import RequireGateAccess from './pages/auth/RequireGateAccess';

// Pages Apprenant
import DashboardApprenant from './pages/apprenant/DashboardApprenant';

// Pages Parent
import DashboardParent from './pages/parent/DashboardParent';

// Pages Professeur
import DashboardProfesseur from './pages/professeur/DashboardProfesseur';

// Pages Admin
import DashboardAdmin from './pages/admin/DashboardAdmin';
import GestionDroits from './pages/admin/GestionDroits';
import GestionEntreprises from './pages/admin/GestionEntreprises';
import GestionProfesseurs from './pages/admin/GestionProfesseurs';
import GestionConfiguration from './pages/admin/GestionConfiguration';
import ReportingExecutif from './pages/admin/ReportingExecutif';
import DashboardAssistantCommercial from './pages/admin/DashboardAssistantCommercial';
import DashboardDeputySuperviseur from './pages/admin/DashboardDeputySuperviseur';

// Pages Entreprise
import DashboardEntreprise from './pages/entreprise/DashboardEntreprise';

// Seed données de démonstration localStorage
import { seedLocalStorageIfNeeded } from './mock/seedLocalStorage';

// Pages partagées
import PageMessages             from './pages/shared/PageMessages';
import PageNotifications        from './pages/shared/PageNotifications';
import TestNiveau               from './pages/shared/TestNiveau';
import PageIntrouvable         from './pages/shared/PageIntrouvable';
import LevelTest                from './pages/shared/LevelTest';

installerInterceptionSession();

function Chargement() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#F8FAFC',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      fontSize: 14,
      color: '#475569',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{
        width: 40,
        height: 40,
        border: '3px solid #E2E8F0',
        borderTop: '3px solid #0891B2',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      Chargement…
    </div>
  );
}

function RoutePrivee({ children, rolesAutorises }) {
  const { profile, loading } = useAuth();

  if (loading) return <Chargement />;
  if (!profile) {
    const loginPage = rolesAutorises?.length === 1
      ? (pageConnexionDe(rolesAutorises[0]) || '/access/bet-learning')
      : '/access/bet-learning';
    return <Navigate to={loginPage} replace />;
  }

  /* `estRole` AU LIEU DE `includes`, ET C'EST LE POINT CLÉ DE LA DÉ-FUSION DES RÔLES.
     Les onze listes `rolesAutorises` de ce fichier nomment des FAMILLES d'écrans
     (`admin_manager`, `admin_elearning`…). Depuis que chaque métier a son propre rôle, un
     `includes` strict rejetterait `admin`, `super_admin` et `manager` de la route
     `admin_manager` — c'est-à-dire de leur propre écran.
     `estRole` répond vrai pour le rôle lui-même ET pour ceux de sa famille (voir
     `constants/roles.js`). Une seule ligne ici évite de réécrire les onze listes et garantit
     qu'aucun accès n'est perdu. Restreindre une route à un seul rôle reste possible : il
     suffit d'y nommer ce rôle, qui n'est la famille de personne d'autre. */
  if (rolesAutorises && !estRole(profile.role, rolesAutorises)) {
    return <Navigate to={pageAccueilDe(profile.role) || '/access/bet-learning'} replace />;
  }

  return children;
}

/* LA RACINE NE MÈNE PLUS À LA CONNEXION. Taper le domaine seul renvoyait vers `/connexion`,
   donc vers l'écran du personnel : la porte se trouvait sans rien chercher. Un visiteur non
   connecté reçoit désormais la page « introuvable », exactement comme pour une adresse
   inventée — c'est le fonctionnement de dash, dont la route `/` est commentée et tombe sur
   son 404.
   Un utilisateur DÉJÀ CONNECTÉ garde son raccourci vers son tableau de bord : il est
   authentifié, lui renvoyer un 404 ne protégerait rien et casserait un favori. */
function RedirectRacine() {
  const { profile, loading } = useAuth();
  if (loading) return <Chargement />;
  if (!profile) return <PageIntrouvable />;
  return <Navigate to={pageAccueilDe(profile.role) || '/access/bet-learning'} replace />;
}

/* ADMIS SUR LES ROUTES /admin/* — un nom par métier, plus les anciens noms de façade.
   Depuis la dé-fusion des rôles, un compte arrive avec le nom de SON métier (`admin`,
   `commercial`, `rh`…) et non plus avec une façade. Les seize noms de métier manquaient ici :
   ces comptes étaient refusés à l'entrée. Les anciens noms `admin_*` sont conservés — un alias
   encore en base ou un jeton déjà émis ne doit pas se retrouver dehors. */
const ROLES_ADMIN = [
  // ── Direction ──
  'super_admin', 'admin', 'manager',
  // ── Pédagogie & supervision ──
  'superviseur', 'deputy_superviseur', 'pedagogical_advisor', 'onboarding',
  'placement_test', 'data_collector',
  // ── Commerce & relation client ──
  'commercial', 'admin_elearning', 'customer_care', 'assistant_sav', 'marketing',
  // ── Administration & finances ──
  'rh', 'comptable', 'gestionnaire', 'responsable', 'observateur',
  // ── Anciens noms de façade, gardés par sécurité ──
  'admin_manager', 'admin_superviseur', 'admin_deputy_superviseur', 'admin_responsable',
  'admin_gestionnaire', 'admin_placement', 'admin_onboarding', 'admin_customer_care',
  'admin_pa_advisor', 'admin_rh_paie', 'admin_comptable', 'admin_commercial',
  'admin_observateur',
];


function AppRoutes() {
  seedLocalStorageIfNeeded();
  return (
    <Routes>
      {/* ── Pages de connexion ── */}
      {/* TROIS ADRESSES SUPPRIMÉES, et aucune n'a de remplaçante publique.
          `/connexion` servait la page de connexion GROUPÉE DU PERSONNEL sur l'adresse la plus
          devinable du site ; `/connexion/portail` affichait la liste de TOUS les espaces, donc
          la carte de l'administration ; `/connexion/professeur` était la porte des coachs.
          Les coachs font partie du personnel (`ROLES_STAFF`) et entrent par le même chemin que
          lui — le code d'accès, puis la page groupée. Le repli générique des redirections est
          désormais le portail d'accès lui-même : il ne montre rien sans le code. */}
      {/* ── LA PORTE D'ACCÈS DU STAFF ──
          Même page et même code que dash : les deux interrogent `/api/access-gate/verify`,
          qui lit l'unique ligne de `access_gate_config`. Le Super Admin change le code une
          fois et il vaut des deux côtés. Voir `pages/auth/AccessGate.jsx`.
          Seules les connexions STAFF sont protégées, comme sur dash — un apprenant, un parent
          ou un coach n'a pas à connaître le code du personnel.

          DEUX ADRESSES QUI NE SE DEVINENT PAS, et c'est tout leur intérêt. Elles étaient
          `/access` et `/connexion/admin` : la seconde se tapait au hasard, ce qui donnait à
          n'importe quel visiteur le formulaire de connexion du personnel — le code du
          portail le protégeait, mais autant ne pas exposer la porte. Elles suivent
          désormais la logique de dash (`/access` → `/bet-staff-access`), en nommant la
          plateforme.

          AUCUNE REDIRECTION DEPUIS LES ANCIENNES ADRESSES, volontairement : en renvoyer une
          vers la nouvelle révélerait précisément ce qu'on vient de cacher. Les anciennes
          tombent donc sur la page « introuvable », comme n'importe quelle URL inventée. */}
      <Route path="/access/bet-learning"      element={<AccessGate />} />
      <Route path="/e-learning-staff-access"  element={<RequireGateAccess><Login /></RequireGateAccess>} />
      <Route path="/connexion/apprenant"   element={<LoginApprenant />} />
      <Route path="/connexion/parent"      element={<LoginParent />} />
      <Route path="/connexion/entreprise"  element={<LoginEntreprise />} />
      <Route path="/sso"                   element={<SSOLogin />} />

      {/* Apprenant */}
      <Route
        path="/apprenant/dashboard"
        element={
          <RoutePrivee rolesAutorises={['apprenant']}>
            <DashboardApprenant />
          </RoutePrivee>
        }
      />
      <Route
        path="/apprenant/cours"
        element={
          <RoutePrivee rolesAutorises={['apprenant']}>
            <DashboardApprenant />
          </RoutePrivee>
        }
      />
      <Route
        path="/apprenant/messages"
        element={
          <RoutePrivee rolesAutorises={['apprenant']}>
            <PageMessages />
          </RoutePrivee>
        }
      />
      <Route
        path="/apprenant/notifications"
        element={
          <RoutePrivee rolesAutorises={['apprenant']}>
            <PageNotifications />
          </RoutePrivee>
        }
      />
      <Route
        path="/apprenant/ressources"
        element={
          <RoutePrivee rolesAutorises={['apprenant']}>
            <DashboardApprenant />
          </RoutePrivee>
        }
      />
      <Route
        path="/apprenant/presences"
        element={
          <RoutePrivee rolesAutorises={['apprenant']}>
            <DashboardApprenant />
          </RoutePrivee>
        }
      />
      <Route
        path="/apprenant/*"
        element={
          <RoutePrivee rolesAutorises={['apprenant']}>
            <DashboardApprenant />
          </RoutePrivee>
        }
      />

      {/* Parent */}
      <Route
        path="/parent/dashboard"
        element={
          <RoutePrivee rolesAutorises={['parent']}>
            <DashboardParent />
          </RoutePrivee>
        }
      />
      <Route
        path="/parent/messages"
        element={
          <RoutePrivee rolesAutorises={['parent']}>
            <PageMessages />
          </RoutePrivee>
        }
      />
      <Route
        path="/parent/notifications"
        element={
          <RoutePrivee rolesAutorises={['parent']}>
            <PageNotifications />
          </RoutePrivee>
        }
      />
      <Route
        path="/parent/*"
        element={
          <RoutePrivee rolesAutorises={['parent']}>
            <DashboardParent />
          </RoutePrivee>
        }
      />

      {/* Professeur */}
      <Route
        path="/professeur/dashboard"
        element={
          <RoutePrivee rolesAutorises={['professeur_titulaire', 'professeur_remplacant']}>
            <DashboardProfesseur />
          </RoutePrivee>
        }
      />
      <Route
        path="/professeur/messages"
        element={
          <RoutePrivee rolesAutorises={['professeur_titulaire', 'professeur_remplacant']}>
            <PageMessages />
          </RoutePrivee>
        }
      />
      <Route
        path="/professeur/notifications"
        element={
          <RoutePrivee rolesAutorises={['professeur_titulaire', 'professeur_remplacant']}>
            <PageNotifications />
          </RoutePrivee>
        }
      />
      <Route
        path="/professeur/*"
        element={
          <RoutePrivee rolesAutorises={['professeur_titulaire', 'professeur_remplacant']}>
            <DashboardProfesseur />
          </RoutePrivee>
        }
      />

      {/* Admin BET - Professeurs */}
      <Route
        path="/admin/manager/professeurs"
        element={
          <RoutePrivee rolesAutorises={['admin_manager', 'admin_superviseur', 'admin_rh_paie']}>
            <GestionProfesseurs />
          </RoutePrivee>
        }
      />
      <Route
        path="/admin/rh/professeurs"
        element={
          <RoutePrivee rolesAutorises={['admin_rh_paie']}>
            <GestionProfesseurs />
          </RoutePrivee>
        }
      />

      {/* Admin BET - Configuration */}
      {/* PILOTAGE : `configuration.gerer` n'est accordé qu'au super_admin en base — la garde le reflète.
          Elle nommait la famille `admin_manager`, ce qui laissait aussi entrer le manager. */}
      <Route
        path="/admin/manager/configuration"
        element={
          <RoutePrivee rolesAutorises={['super_admin']}>
            <GestionConfiguration />
          </RoutePrivee>
        }
      />

      <Route
        path="/admin/reporting"
        element={
          <RoutePrivee rolesAutorises={['admin_manager', 'admin_superviseur']}>
            <ReportingExecutif />
          </RoutePrivee>
        }
      />

      {/* Admin BET - Assistant Commercial */}
      <Route
        path="/admin/commercial/entreprises"
        element={
          <RoutePrivee rolesAutorises={['admin_commercial', 'admin_manager', 'admin_elearning']}>
            <DashboardAssistantCommercial />
          </RoutePrivee>
        }
      />
      <Route
        path="/admin/commercial"
        element={
          <RoutePrivee rolesAutorises={['admin_commercial', 'admin_manager', 'admin_elearning']}>
            <DashboardAssistantCommercial />
          </RoutePrivee>
        }
      />
      <Route
        path="/admin/commercial/*"
        element={
          <RoutePrivee rolesAutorises={['admin_commercial', 'admin_manager', 'admin_elearning']}>
            <DashboardAssistantCommercial />
          </RoutePrivee>
        }
      />

      {/* Admin BET - Gestion des droits */}
      {/* PILOTAGE : réservé au Super Admin et à l'Administrateur, les deux seuls à détenir
          `roles.manage` en base. La liste nommait `admin_manager` — le manager entrait — et
          `admin_superviseur` — un superviseur atteignait la matrice des permissions. */}
      <Route
        path="/admin/droits"
        element={
          <RoutePrivee rolesAutorises={['super_admin', 'admin']}>
            <GestionDroits />
          </RoutePrivee>
        }
      />

      <Route
        path="/admin/entreprises"
        element={
          <RoutePrivee rolesAutorises={['admin_manager', 'admin_superviseur', 'admin_comptable', 'admin_onboarding', 'admin_commercial', 'admin_elearning']}>
            <GestionEntreprises />
          </RoutePrivee>
        }
      />

      {/* Admin BET - Messages & Notifications */}
      <Route
        path="/admin/messages"
        element={
          <RoutePrivee rolesAutorises={ROLES_ADMIN}>
            <PageMessages />
          </RoutePrivee>
        }
      />
      <Route
        path="/admin/notifications"
        element={
          <RoutePrivee rolesAutorises={ROLES_ADMIN}>
            <PageNotifications />
          </RoutePrivee>
        }
      />

      {/* Deputy Superviseur */}
      <Route
        path="/admin/deputy-superviseur/*"
        element={
          <RoutePrivee rolesAutorises={['admin_deputy_superviseur']}>
            <DashboardDeputySuperviseur />
          </RoutePrivee>
        }
      />

      {/* Admin BET - toutes les autres routes admin */}
      <Route
        path="/admin/*"
        element={
          <RoutePrivee rolesAutorises={ROLES_ADMIN}>
            <DashboardAdmin />
          </RoutePrivee>
        }
      />

      {/* Client Entreprise */}
      <Route
        path="/entreprise/dashboard"
        element={
          <RoutePrivee rolesAutorises={['client_entreprise']}>
            <DashboardEntreprise />
          </RoutePrivee>
        }
      />
      <Route
        path="/entreprise/messages"
        element={
          <RoutePrivee rolesAutorises={['client_entreprise']}>
            <PageMessages />
          </RoutePrivee>
        }
      />
      <Route
        path="/entreprise/notifications"
        element={
          <RoutePrivee rolesAutorises={['client_entreprise']}>
            <PageNotifications />
          </RoutePrivee>
        }
      />
      <Route
        path="/entreprise/*"
        element={
          <RoutePrivee rolesAutorises={['client_entreprise']}>
            <DashboardEntreprise />
          </RoutePrivee>
        }
      />

      {/* Test de niveau - route publique (lien envoyé aux parents/apprenants) */}
      <Route path="/test/:testId" element={<TestNiveau />} />

      {/* Test de niveau multi-format (nouveau modèle, réplique dash) - route publique */}
      <Route path="/level-test/:testId" element={<LevelTest />} />

      {/* Racine - le tableau de bord si l'on est connecté, 404 sinon (cf. RedirectRacine) */}
      <Route path="/" element={<RedirectRacine />} />

      {/* ── 404 ──
          Ces deux routes renvoyaient vers `/connexion` : taper n'importe quoi après le
          domaine affichait donc l'écran de connexion du personnel, et la racine seule
          suffisait a le trouver. Elles rendent desormais une vraie page « introuvable »,
          sans aucun lien de retour - la meme reponse que pour une adresse inventee, ce
          qui est bien ce qu'elles sont. dash fonctionne ainsi depuis toujours. */}
      <Route path="*" element={<PageIntrouvable />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LangueProvider>
    <AuthProvider>
      <ThemeProvider>
      <UsersProvider>
        <BrowserRouter>
          <ConfirmProvider>
          <MessagerieProvider>
          <NotificationsProvider>
            <Toaster position="top-right" toastOptions={{style: {fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: 14,},}}/>
            <AppRoutes />
          </NotificationsProvider>
          </MessagerieProvider>
          </ConfirmProvider>
        </BrowserRouter>
      </UsersProvider>
      </ThemeProvider>
    </AuthProvider>
    </LangueProvider>
  );
}
