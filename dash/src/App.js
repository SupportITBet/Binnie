import './App.css';
import {Routes,Route,Navigate,useLocation} from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import 'animate.css';
import './chartConfig';
import { supabase } from './config/supabase';
import Home from './Pages/Home';
import NotFoundPage from './Pages/NotFoundPage';
import AccessGate from './Pages/AccessGate';
import RequireGateAccess from './Pages/RequireGateAccess';
import { UserProvider } from './contexts/UserContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { clearAllSessionStorage, retirerBanniereExpiration, sessionCourante } from './utils/session';
import LanguageToggle from './Components/LanguageToggle';
// import Profil from './Pages/Profil';
import Newsletter from './Pages/Newsletter';
import Accueil from './Pages/Accueil';
import Administrator from './Pages/Admin/Administrator';
import Tracabilite from './Pages/Statistiques/Tracabilite';
import AdminDashboard from './Pages/AdminDashboard/AdminDashboard';
import TeachersPage from './Pages/Admin/TeachersPage';
import DetailTeacher from './Pages/Admin/DetailTeacher';
import Courses from './Pages/Courses/Courses';
import Exams from './Pages/Exam/Exams';
import Classes from './Pages/Classes/Classes';
import Student from './Pages/Admin/Student';
import Notifications from './Pages/Notifications/Notifications';
import StudentDetail from './Pages/Admin/StudentDetail';
import Rooms from './Pages/Salles/Rooms';
import Bulletins from './Pages/Bulletins/Bulletins';
import Administration from './Pages/Administration/Administration';
import Tests from './Pages/Tests/Tests';
import EspaceApprenant from './Pages/EspaceApprenant/EspaceApprenant';
import EspaceProfesseur from './Pages/EspaceProfesseur/EspaceProfesseur';
import LoginApprenant from './Pages/Auth/LoginApprenant';
import LoginProfesseur from './Pages/Auth/LoginProfesseur';
import LoginAdmin from './Pages/Auth/LoginAdmin';
import LoginParticulier from './Pages/Auth/LoginParticulier';
import ResetPasswordAdmin from './Pages/Auth/ResetPasswordAdmin';
import RendezVous from './Pages/Outils/RendezVous';
import SimulateurFormation from './Pages/Outils/SimulateurFormation';
import GestionDroits from './Pages/GestionDroits/GestionDroits';
import CommercialDashboard from './Pages/CommercialDashboard/CommercialDashboard';
import GestionnaireDashboard from './Pages/GestionnaireDashboard/GestionnaireDashboard';
import { db } from "./config/firebase";
import { collection, addDoc } from "firebase/firestore";
import ParentDashboard from './Pages/ParentDashboard/ParentDashboard';
import Footer from './Pages/Footer';
import SuperAdminDashboard from './Pages/SuperAdminDashboard/SuperAdminDashboard';
import DataCollectorDashboard from './Pages/DataCollectorDashboard/DataCollectorDashboard';
import OnboardingDashboard from './Pages/OnboardingDashboard/OnboardingDashboard';
import PedagogicalAdvisorDashboard from './Pages/PedagogicalAdvisorDashboard/PedagogicalAdvisorDashboard';
import ComptableDashboard from './Pages/ComptableDashboard/ComptableDashboard';
import PlacementTestDashboard from './Pages/PlacementTestDashboard/PlacementTestDashboard';
import RHPaieDashboard from './Pages/RHPaieDashboard/RHPaieDashboard';
import SuperviseurDashboard from './Pages/SuperviseurDashboard/SuperviseurDashboard';
import CustomerCareDashboard from './Pages/CustomerCareDashboard/CustomerCareDashboard';
import SavDashboard from './Pages/SavDashboard/SavDashboard';
import ManagerDashboard from './Pages/ManagerDashboard/ManagerDashboard';
import GardeInactivite from "./Components/GardeInactivite";
// Cette IIFE tourne au chargement du module, hors arbre React - impossible d'y utiliser le
// modal React (ConfirmContext). On injecte donc une bannière stylée directement en DOM,
// cohérente visuellement avec le reste de l'app, plutôt que le window.alert() natif du
// navigateur qui bloquait le fil d'exécution en attendant un clic manuel sur "OK".
function afficherBanniereSessionExpiree() {
  // Plusieurs requêtes parallèles peuvent recevoir un 401 en même temps : sans ce garde,
  // chacune empilait son propre voile plein écran.
  if (document.getElementById('bet-session-expiree')) return;
  const overlay = document.createElement('div');
  overlay.id = 'bet-session-expiree';
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

// Rafraîchit la session admin à partir des tokens stockés (les admins se connectent
// côté serveur donc le client Supabase n'a pas de session active - on doit la restaurer
// manuellement). Partagé entre l'intercepteur 401 (réactif) et le bandeau de préavis
// d'expiration (proactif, cf. installExpirySoonWarning ci-dessous).
async function refreshAdminSession() {
  try {
    // Le portail décide des clés : un coach porte coach_token/coach_refresh. Lire les
    // clés admin en dur faisait échouer tout rafraîchissement chez lui, donc éjection.
    const { cleAcces, cleRefresh, access: storedAccess, refresh: storedRefresh } = sessionCourante();
    let refreshedSession = null;

    if (storedRefresh) {
      // Restaurer la session admin dans le client Supabase puis la rafraîchir
      const { data: sd } = await supabase.auth.setSession({ access_token: storedAccess, refresh_token: storedRefresh });
      refreshedSession = sd?.session;
    } else {
      const { data: rd } = await supabase.auth.refreshSession();
      refreshedSession = rd?.session;
    }

    if (refreshedSession?.access_token) {
      const role = refreshedSession.user?.app_metadata?.role;
      if (role && ROLES_ADMIN_VALIDES.includes(role)) {
        localStorage.setItem(cleAcces, refreshedSession.access_token);
        if (refreshedSession.refresh_token) localStorage.setItem(cleRefresh, refreshedSession.refresh_token);
        return true;
      }
    }
  } catch (_) {}
  return false;
}

// Intercepteur global : déconnexion sur 401 avec tentative de refresh préalable
(function installFetchInterceptor() {
  const _fetch = window.fetch;
  let _dejaDeclenche = false;

  window.fetch = async function (...args) {
    const response = await _fetch(...args);
    if (response.status === 401 && !_dejaDeclenche) {
      const url = typeof args[0] === "string" ? args[0] : (args[0]?.url || "");

      // Ignorer les appels Supabase (ils gèrent leur propre 401)
      const sbUrl = process.env.REACT_APP_SUPABASE_URL || "";
      if (url.includes("supabase.co") || url.includes("supabase.io") || (sbUrl && url.startsWith(sbUrl))) {
        return response;
      }

      // Ignorer si on est sur une route apprenant/parent - ces espaces gèrent leur propre
      // session (token "user_token", pas "admin_token") : sans cette exclusion, un 401 y
      // déclenchait quand même le refresh admin (qui échoue, ce token n'existe pas pour eux)
      // puis une redirection vers "/" (portail staff BET) au lieu de leur propre page de connexion.
      const pathname = window.location.pathname;
      const isApprenantRoute = pathname.startsWith("/espace-apprenant") ||
                               pathname.startsWith("/login-apprenant") ||
                               pathname.startsWith("/connexion/apprenant") ||
                               pathname.startsWith("/login-particulier") ||
                               pathname.startsWith("/dashboard/parent") ||
                               pathname.startsWith("/connexion/");
      if (isApprenantRoute) return response;

      // Ignorer les routes d'auth (login, MFA…) - elles gèrent leurs propres erreurs
      if (
        url.includes("/api/apprenants/") ||
        url.includes("/api/auth/login")  ||
        url.includes("/api/admin/login") ||
        url.includes("/api/admin/mfa/") ||
        url.includes("/api/admin/reset-password") ||
        url.includes("/api/admin/forgot-password")
      ) {
        return response;
      }

      // Rafraîchir puis REJOUER la requête. L'ancienne version renvoyait la réponse 401
      // d'origine même après un refresh réussi : l'appelant voyait donc un échec, et la
      // saisie en cours - un contenu, ses blocs, une évaluation - était perdue alors que
      // la session venait d'être rétablie. C'est ce qui obligeait à tout refaire.
      if (await refreshAdminSession()) {
        try {
          const { access } = sessionCourante();
          const [cible, init] = args;
          const entetes = new Headers(
            (init && init.headers) || (cible instanceof Request ? cible.headers : undefined)
          );
          if (access) entetes.set("Authorization", `Bearer ${access}`);

          // Une requête déjà consommée ne se rejoue pas : on la reconstruit à partir de
          // la cible et des options, en ne remplaçant que l'en-tête d'autorisation.
          if (cible instanceof Request) {
            return await _fetch(new Request(cible, { headers: entetes }));
          }
          return await _fetch(cible, { ...(init || {}), headers: entetes });
        } catch (e) {
          console.warn("[session] rejeu impossible après rafraîchissement :", e.message);
          return response;
        }
      }

      // Refresh impossible → session vraiment expirée → déconnexion propre.
      // Chaque portail a sa page : renvoyer un coach vers l'accès staff l'obligeait à
      // retrouver la sienne.
      const retour = sessionCourante().portail === "coach" ? "/login-professeur" : "/bet-staff-access";
      _dejaDeclenche = true;
      clearAllSessionStorage();
      afficherBanniereSessionExpiree();
      // Laisse la bannière visible un court instant avant la redirection - plus proche du
      // comportement "automatique" annoncé que le window.alert() bloquant qu'il remplace.
      setTimeout(() => { window.location.href = retour; }, 1800);
    }
    return response;
  };
})();

// Décode l'expiration (claim "exp", en secondes epoch) d'un JWT sans vérifier sa signature
// - usage purement informatif côté client (savoir QUAND avertir), jamais pour valider l'accès.
function decodeJwtExp(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp ? payload.exp * 1000 : null;
  } catch { return null; }
}

// Bandeau non-bloquant (coin de l'écran) affiché ~60s avant l'expiration du token admin,
// avec un bouton pour prolonger la session sans perdre le travail en cours - remplace le
// seul mécanisme existant jusqu'ici (bannière + déconnexion après coup, une fois le 401
// déjà survenu).
function installExpirySoonWarning() {
  const SEUIL_MS = 60 * 1000;
  let dernierTokenAverti = null;

  const verifier = async () => {
    const pathname = window.location.pathname;
    const isApprenantRoute = pathname.startsWith("/espace-apprenant") ||
                             pathname.startsWith("/login-apprenant") ||
                             pathname.startsWith("/connexion/apprenant") ||
                             pathname.startsWith("/login-particulier") ||
                             pathname.startsWith("/dashboard/parent") ||
                             pathname.startsWith("/connexion/");
    // Les pages de connexion du personnel comptent autant que celles des apprenants :
    // proposer d'y « prolonger sa session » n'a aucun sens, puisqu'on vient justement
    // d'en sortir.
    // Même liste que LOGIN_ROUTES plus bas, recopiée plutôt que partagée : cette boucle
    // démarre au chargement du module, avant que la constante ne soit initialisée.
    const isPageConnexion = ["/access", "/bet-staff-access", "/administrator",
                             "/login-professeur", "/reset-password"]
                            .some((r) => pathname.startsWith(r));

    if (isApprenantRoute || isPageConnexion) { retirerBanniereExpiration(); return; }

    const token = sessionCourante().access;

    // Plus de token = déconnecté. Le bandeau est créé hors de React et ne se démonte donc
    // pas tout seul : sans ce retrait explicite, il restait affiché après la déconnexion,
    // son bouton « Prolonger » toujours actif. On réarme aussi l'avertissement, pour que
    // la prochaine session puisse être prévenue à son tour.
    if (!token) { retirerBanniereExpiration(); dernierTokenAverti = null; return; }
    if (token === dernierTokenAverti) return;

    const expMs = decodeJwtExp(token);
    if (!expMs) return;

    const restant = expMs - Date.now();
    if (restant > 0 && restant <= SEUIL_MS) {
      dernierTokenAverti = token;
      afficherBanniereProlongerSession();
    }
  };

  verifier();
  setInterval(verifier, 15000);
}

function afficherBanniereProlongerSession() {
  if (document.querySelector("#bet-prolonger-session")) return;

  const box = document.createElement("div");
  box.id = "bet-prolonger-session";
  box.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999998;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.18);padding:16px 18px;max-width:340px;font-family:"Plus Jakarta Sans",sans-serif;border:1px solid #fde68a;animation:betSlideUp .25s ease;';
  if (!document.querySelector("#bet-prolonger-anim")) {
    const style = document.createElement("style");
    style.id = "bet-prolonger-anim";
    style.textContent = "@keyframes betSlideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}";
    document.head.appendChild(style);
  }
  box.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start;">
      <div style="font-size:22px;flex-shrink:0;">⏳</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13.5px;font-weight:800;color:#0B1220;margin-bottom:3px;">Session bientôt expirée</div>
        <div style="font-size:12.5px;color:#4B5563;line-height:1.5;margin-bottom:10px;">Votre session va se terminer dans moins d'une minute.</div>
        <div style="display:flex;gap:8px;">
          <button id="bet-prolonger-btn" style="flex:1;background:#0891b2;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">Prolonger ma session</button>
          <button id="bet-prolonger-close" style="background:#f1f5f9;color:#64748b;border:none;border-radius:8px;padding:8px 12px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;">✕</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(box);

  const btn = box.querySelector("#bet-prolonger-btn");
  box.querySelector("#bet-prolonger-close").onclick = () => box.remove();
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "⏳ Prolongation…";
    const ok = await refreshAdminSession();
    if (ok) {
      btn.textContent = "✅ Session prolongée";
      box.style.borderColor = "#86efac";
      setTimeout(() => box.remove(), 1800);
    } else {
      const retour = sessionCourante().portail === "coach" ? "/login-professeur" : "/bet-staff-access";
      box.remove();
      clearAllSessionStorage();
      afficherBanniereSessionExpiree();
      setTimeout(() => { window.location.href = retour; }, 1800);
    }
  };
}

installExpirySoonWarning();

const ROLES_ADMIN_VALIDES = [
  // Rôles /dash
  "super_admin", "admin", "manager", "commercial", "gestionnaire",
  "coach", "data_collector", "placement_test", "superviseur", "deputy_superviseur",
  "pedagogical_advisor", "onboarding", "rh", "rh_paie", "comptable", "customer_care",
  "assistant_sav", "marketing",
  "admin_elearning", "assistant_elearning",
  // Rôles rétro-compat profils_admin
  "admin_pedagogique", "admin_financier", "admin_rh", "admin_commercial",
  "responsable_centre", "observateur",
  // Rôles bet-elearning
  "admin_manager", "admin_superviseur", "admin_placement", "admin_onboarding",
  "admin_customer_care", "admin_pa_advisor", "admin_contenus", "admin_rh_paie", "admin_comptable",
  "professeur_titulaire", "professeur_remplacant", "client_entreprise",
];

// Garder admin_token synchronisé quand Supabase rafraîchit le JWT automatiquement
// Ne mettre à jour admin_token QUE si la session appartient à un compte admin
supabase.auth.onAuthStateChange((event, session) => {
  if (session?.access_token) {
    const role = session.user?.app_metadata?.role;
    if (role && ROLES_ADMIN_VALIDES.includes(role)) {
      localStorage.setItem("admin_token", session.access_token);
      if (session.refresh_token) localStorage.setItem("admin_refresh", session.refresh_token);
    }
    // Si la session appartient à un apprenant, ne rien faire côté admin
  } else if (event === "SIGNED_OUT") {
    // ATTENTION : SIGNED_OUT peut être déclenché par un apprenant qui se déconnecte
    // (supabase.auth.signOut() dans LoginApprenant) - dans ce cas il ne faut PAS
    // toucher la session admin.
    // On ne réagit que si l'admin_token a déjà été supprimé manuellement (déconnexion admin volontaire)
    // Les dashboards admin gèrent leur propre déconnexion via localStorage.removeItem directement.
    // → On ignore complètement SIGNED_OUT ici pour éviter la déconnexion croisée.
  }
});

const DASHBOARD_PAR_ROLE = {
  super_admin:         "/dashboard/superAdmin",
  admin:               "/AdminDashboard",
  manager:             "/manager-dashboard",
  superviseur:         "/superviseur-dashboard",
  deputy_superviseur:  "/superviseur-dashboard",
  pedagogical_advisor: "/pedagogical-advisor-dashboard",
  commercial:          "/commercial-dashboard",
  onboarding:          "/onboarding-dashboard",
  gestionnaire:        "/gestionnaire-dashboard",
  rh:                  "/rh-paie-dashboard",
  comptable:           "/comptable-dashboard",
  placement_test:      "/placement-test-dashboard",
  coach:               "/espace-professeur",
  customer_care:       "/customer-care-dashboard",
  assistant_sav:       "/sav-dashboard",
  data_collector:      "/datacollector-dashboard",
  marketing:           "/marketing-dashboard",
  // rétro-compat profils_admin - doit rester identique à ROUTE_PAR_TYPE de LoginAdmin.jsx
  admin_pedagogique:   "/AdminDashboard",
  admin_financier:     "/AdminDashboard",
  admin_rh:            "/AdminDashboard",
  admin_commercial:    "/AdminDashboard",
  responsable_centre:  "/AdminDashboard",
  observateur:         "/AdminDashboard",
};

// La page de connexion s'affiche toujours - on ne redirige plus silencieusement vers
// l'ancien dashboard d'une session précédente encore présente en localStorage. Ce
// comportement empêchait de se reconnecter avec un autre compte/rôle depuis le même
// navigateur (le token périmé du rôle précédent gagnait avant même d'afficher le
// formulaire). Chaque dashboard reste protégé indépendamment par PrivateStaffRoute.
function PublicAdminRoute({ children }) {
  return children;
}

// Redirige vers le login si pas connecté, et vers SON PROPRE dashboard si le token
// présent correspond à un autre rôle que celui attendu par cette route (ex: un token
// pedagogical_advisor encore valide utilisé pour accéder à /commercial-dashboard) -
// avant ce garde-fou, n'importe quel token staff valide donnait accès à n'importe
// quelle route de dashboard, indépendamment du rôle réel du compte.
function PrivateAdminRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("admin_token");
  if (!token) return <Navigate to="/bet-staff-access" replace />;

  const profil = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const role   = profil?.role || profil?.profil_type;
  const dest   = DASHBOARD_PAR_ROLE[role];
  // Rôle absent/non reconnu → session locale invalide, on nettoie et renvoie au login.
  if (!dest) {
    clearAllSessionStorage();
    return <Navigate to="/bet-staff-access" replace />;
  }
  // Ne bloque que l'accès à un AUTRE dashboard de rôle (ex: pedagogical_advisor sur
  // /commercial-dashboard) - ne touche pas aux pages utilitaires partagées entre rôles
  // (Notifications, Courses, Classes, TeachersPage…) qui ne figurent pas dans cette liste.
  const estUneRouteDeDashboardRole = Object.values(DASHBOARD_PAR_ROLE).includes(location.pathname);
  if (role !== "super_admin" && estUneRouteDeDashboardRole && dest !== location.pathname) {
    return <Navigate to={dest} replace />;
  }
  return children;
}
// Alias pour clarté
const PrivateStaffRoute = PrivateAdminRoute;

function PublicCoachRoute({ children }) {
  const token = localStorage.getItem("coach_token");
  if (!token) return children;
  return <Navigate to="/espace-professeur" replace />;
}

function PrivateParentRoute({ children }) {
  const token = localStorage.getItem("user_token");
  const type  = localStorage.getItem("user_profil_type");
  if (!token || type !== "parent") return <Navigate to="/login-particulier" replace />;
  return children;
}

const LOGIN_ROUTES = ["/access", "/bet-staff-access", "/connexion/apprenant", "/login-particulier", "/login-professeur", "/reset-password"];

// Dashboards internes (staff) - ont désormais leur propre footer SaaS (FooterSaaS) rendu à
// l'intérieur de chaque page, thémé sur la couleur choisie par l'utilisateur. Le Footer public
// ci-dessous doit rester réservé aux pages publiques/marketing, sinon les deux s'empilent.
const STAFF_DASHBOARD_ROUTES = [
  "/AdminDashboard", "/manager-dashboard", "/commercial-dashboard", "/gestionnaire-dashboard",
  "/datacollector-dashboard", "/onboarding-dashboard", "/corporate-dashboard",
  "/pedagogical-advisor-dashboard", "/comptable-dashboard", "/placement-test-dashboard",
  "/rh-paie-dashboard", "/superviseur-dashboard", "/customer-care-dashboard",
  "/assistant-elearning-dashboard", "/dashboard/superAdmin", "/espace-professeur",
  "/marketing-dashboard",
];

function AppContent() {
  const { pathname } = useLocation();
  const showFooter = !LOGIN_ROUTES.includes(pathname) && !STAFF_DASHBOARD_ROUTES.includes(pathname);
  const showLangToggle = LOGIN_ROUTES.includes(pathname);
  return (
    <>
    <Routes>
    {/* <Route path='/' element={ <Home/> }/> */}
       <Route path='/Accueil' element={ <Accueil/> }/>
   <Route path="/actions" element={<Tracabilite />} />
     {/* <Route path="/Mon--profil" element={<Profil/>} /> */}
    <Route path="/newsletter" element={<Newsletter />} />
    <Route path="*" element={<NotFoundPage />} />
    <Route path="/administrator" element={<Administrator />} />
    <Route path="/AdminDashboard"           element={<PrivateStaffRoute><AdminDashboard /></PrivateStaffRoute>} />
    <Route path="/manager-dashboard"        element={<PrivateStaffRoute><ManagerDashboard /></PrivateStaffRoute>} />
    <Route path="/TeachersPage"             element={<PrivateStaffRoute><TeachersPage /></PrivateStaffRoute>} />
    <Route path="/teachers/:teacherId"      element={<PrivateStaffRoute><DetailTeacher /></PrivateStaffRoute>} />
    <Route path="/courses"                  element={<PrivateStaffRoute><Courses /></PrivateStaffRoute>} />
    <Route path="/exams"                    element={<PrivateStaffRoute><Exams /></PrivateStaffRoute>} />
    <Route path="/classes"                  element={<PrivateStaffRoute><Classes /></PrivateStaffRoute>} />
    <Route path="/student"                  element={<PrivateStaffRoute><Student /></PrivateStaffRoute>} />
    <Route path="/notifications"            element={<PrivateStaffRoute><Notifications /></PrivateStaffRoute>} />
    <Route path="/student/:id"              element={<PrivateStaffRoute><StudentDetail /></PrivateStaffRoute>} />
    <Route path="/rooms"                    element={<PrivateStaffRoute><Rooms /></PrivateStaffRoute>} />
    <Route path="/bulletins"               element={<PrivateStaffRoute><Bulletins /></PrivateStaffRoute>} />
    <Route path="/administration"           element={<PrivateStaffRoute><Administration /></PrivateStaffRoute>} />
    <Route path="/test-niveau"              element={<PrivateStaffRoute><Tests /></PrivateStaffRoute>} />
    <Route path="/gestion-droits"           element={<PrivateStaffRoute><GestionDroits /></PrivateStaffRoute>} />
    <Route path="/commercial-dashboard"     element={<PrivateStaffRoute><CommercialDashboard /></PrivateStaffRoute>} />
    <Route path="/gestionnaire-dashboard"   element={<PrivateStaffRoute><GestionnaireDashboard /></PrivateStaffRoute>} />
    <Route path="/datacollector-dashboard"  element={<PrivateStaffRoute><DataCollectorDashboard /></PrivateStaffRoute>} />
    <Route path="/onboarding-dashboard"     element={<PrivateStaffRoute><OnboardingDashboard /></PrivateStaffRoute>} />
    <Route path="/pedagogical-advisor-dashboard" element={<PrivateStaffRoute><PedagogicalAdvisorDashboard /></PrivateStaffRoute>} />
    <Route path="/comptable-dashboard"           element={<PrivateStaffRoute><ComptableDashboard /></PrivateStaffRoute>} />
    <Route path="/placement-test-dashboard"      element={<PrivateStaffRoute><PlacementTestDashboard /></PrivateStaffRoute>} />
    <Route path="/rh-paie-dashboard"             element={<PrivateStaffRoute><RHPaieDashboard /></PrivateStaffRoute>} />
    <Route path="/superviseur-dashboard"         element={<PrivateStaffRoute><SuperviseurDashboard /></PrivateStaffRoute>} />
    <Route path="/customer-care-dashboard"       element={<PrivateStaffRoute><CustomerCareDashboard /></PrivateStaffRoute>} />
    <Route path="/sav-dashboard"                 element={<PrivateStaffRoute><SavDashboard /></PrivateStaffRoute>} />
    <Route path="/dashboard/superAdmin"     element={<PrivateStaffRoute><SuperAdminDashboard /></PrivateStaffRoute>} />
    <Route path="/marketing-dashboard"      element={<PrivateStaffRoute><SuperAdminDashboard /></PrivateStaffRoute>} />
    <Route path="/dashboard/parent"         element={<PrivateParentRoute><ParentDashboard /></PrivateParentRoute>} />
<Route path="/espace-apprenant" element={<EspaceApprenant />} />
<Route path="/espace-professeur" element={<PrivateStaffRoute><EspaceProfesseur /></PrivateStaffRoute>} />
<Route path="/connexion/apprenant" element={<LoginApprenant />} />
<Route path="/login-particulier"  element={<LoginParticulier />} />
<Route path="/login-professeur"  element={<PublicCoachRoute><LoginProfesseur /></PublicCoachRoute>} />
<Route path="/access" element={<AccessGate />} />
<Route path="/bet-staff-access" element={<RequireGateAccess><PublicAdminRoute><LoginAdmin /></PublicAdminRoute></RequireGateAccess>} />
<Route path="/reset-password"    element={<ResetPasswordAdmin />} />
<Route path="/simulateur"        element={<SimulateurFormation />} />
  </Routes>
  {showFooter && <Footer />}
  {showLangToggle && <LanguageToggle />}
  <Toaster position="top-right" />
  {/* LA DÉCONNEXION AUTOMATIQUE, montée une seule fois pour toute l'application : une règle
      de sécurité recopiée dans dix-sept tableaux de bord finirait par diverger, et l'écran
      oublié serait justement celui qu'on laisse ouvert toute la journée. */}
  <GardeInactivite />
  </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <UserProvider>
        <ConfirmProvider>
          <AppContent />
        </ConfirmProvider>
      </UserProvider>
    </LanguageProvider>
  );
}

