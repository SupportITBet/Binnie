import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UsersProvider } from './contexts/UsersContext';
import { MessagerieProvider } from './contexts/MessagerieContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { ROLE_REDIRECT, ROLE_LOGIN } from './constants/roles';
import { LangueProvider } from './contexts/LangueContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { installerInterceptionSession } from './utils/sessionInterceptor';
import './App.css';

// Pages Auth
import Login             from './pages/auth/Login';
import PortailConnexion  from './pages/auth/PortailConnexion';
import LoginAdmin        from './pages/auth/LoginAdmin';
import LoginProfesseur   from './pages/auth/LoginProfesseur';
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
      ? (ROLE_LOGIN[rolesAutorises[0]] || '/connexion')
      : '/connexion';
    return <Navigate to={loginPage} replace />;
  }

  if (rolesAutorises && !rolesAutorises.includes(profile.role)) {
    return <Navigate to={ROLE_REDIRECT[profile.role] || '/connexion'} replace />;
  }

  return children;
}

function RedirectRacine() {
  const { profile, loading } = useAuth();
  if (loading) return <Chargement />;
  if (!profile) return <Navigate to="/connexion" replace />;
  return <Navigate to={ROLE_REDIRECT[profile.role] || '/connexion'} replace />;
}

const ROLES_ADMIN = [
  'admin_manager', 'admin_superviseur', 'admin_deputy_superviseur', 'admin_responsable', 'admin_gestionnaire',
  'admin_placement', 'admin_onboarding', 'admin_elearning', 'admin_customer_care',
  'admin_pa_advisor', 'admin_rh_paie', 'admin_comptable',
  'admin_commercial', 'admin_observateur', 'assistant_sav',
];

function AppRoutes() {
  seedLocalStorageIfNeeded();
  return (
    <Routes>
      {/* ── Pages de connexion ── */}
      <Route path="/connexion"             element={<Login />} />
      <Route path="/connexion/portail"     element={<PortailConnexion />} />
      {/* ── LA PORTE D'ACCÈS DU STAFF ──
          Même page et même code que dash : les deux interrogent `/api/access-gate/verify`,
          qui lit l'unique ligne de `access_gate_config`. Le Super Admin change le code une
          fois et il vaut des deux côtés. Voir `pages/auth/AccessGate.jsx`.
          Seules les connexions STAFF sont protégées, comme sur dash — un apprenant, un parent
          ou un coach n'a pas à connaître le code du personnel. */}
      <Route path="/access"                element={<AccessGate />} />
      <Route path="/connexion/admin"       element={<RequireGateAccess><LoginAdmin /></RequireGateAccess>} />
      <Route path="/connexion/professeur"  element={<LoginProfesseur />} />
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
      <Route
        path="/admin/manager/configuration"
        element={
          <RoutePrivee rolesAutorises={['admin_manager']}>
            <GestionConfiguration />
          </RoutePrivee>
        }
      />

      {/* Admin BET - Reporting exécutif */}
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
      <Route
        path="/admin/droits"
        element={
          <RoutePrivee rolesAutorises={['admin_manager', 'admin_superviseur']}>
            <GestionDroits />
          </RoutePrivee>
        }
      />

      {/* Admin BET - Gestion des entreprises */}
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

      {/* Racine - redirect selon rôle */}
      <Route path="/" element={<RedirectRacine />} />

      {/* 404 → connexion */}
      <Route path="*" element={<Navigate to="/connexion" replace />} />
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
