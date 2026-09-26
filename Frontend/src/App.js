// src/App.js (extrait modifié, à remplacer dans votre fichier)
import './App.css';
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import BinnieLogo from './Assets/BIINIES-ENGLISH-LOGO.png';
import { Toaster } from 'react-hot-toast';
import './i18n/index';
import { HelmetProvider } from "react-helmet-async";
import Navbar from './Pages/Navbar/Navbar.jsx';
import OrganizationSchema from './Pages/Components/SEO/OrganizationSchema.jsx';
import CartContextProvider from './context/CartContext.js';
import FavoritesContextProvider from './context/FavoritesContext.js';
import { UserProvider } from './context/UserContext.js';
import WhatsAppButton from './Pages/Components/WhatsAppButton/WhatsAppButton.jsx';
import ProspectChat from './Pages/Components/ProspectChat/ProspectChat.jsx';
import { supabase } from './config/supabase.js';
import { captureUTM } from './utils/utm.js';
import { usePageTracking } from './hooks/usePageTracking.js';

// Pages chargées à la demande (code-splitting par route) - chaque page devient
// un fichier JS séparé, téléchargé uniquement quand le visiteur y accède, au
// lieu d'alourdir le bundle initial commun à toutes les pages.
const Accueil              = lazy(() => import('./Pages/Accueil/Accueil.jsx'));
const BlogDetail           = lazy(() => import('./Pages/Components/BlogSection/BlogDetail.jsx'));
const BlogList             = lazy(() => import('./Pages/Blog/BlogList.jsx'));
const TemoignagesPage      = lazy(() => import('./Pages/Temoignages/TemoignagesPage.jsx'));
// Formulaire de campagne - la page qu'ouvre un QR code. Publique, sans compte.
const FormulaireCampagne   = lazy(() => import('./Pages/Campagne/FormulaireCampagne.jsx'));
const CourseDetail         = lazy(() => import('./Pages/Courses/CourseDetail.jsx'));
const CertificationDetail  = lazy(() => import('./Pages/Components/CertificationDetail/CertificationDetail.jsx'));
const CenterDetail         = lazy(() => import('./Pages/Components/CenterDetail/CenterDetail.jsx'));
const ServiceDetail        = lazy(() => import('./Pages/Components/ServiceDetail/ServiceDetail.jsx'));
const About                = lazy(() => import('./Pages/About/About.jsx'));
const FreeLevelTest        = lazy(() => import('./Pages/FreeLevelTest/FreeLevelTest.jsx'));
const BetForBusiness       = lazy(() => import('./Pages/BetForBusiness/BetForBusiness.jsx'));
const LeadThankYou         = lazy(() => import('./Pages/LeadMagnet/LeadThankYou.jsx'));
const Contact              = lazy(() => import('./Pages/Contact/Contact.jsx'));
const AuditGratuit         = lazy(() => import('./Pages/Components/Audit/AuditGratuit.jsx'));
const ParcoursParticulier  = lazy(() => import('./Pages/Parcours/ParcoursParticulier.jsx'));
const ParcoursTunnel       = lazy(() => import('./Pages/Parcours/ParcoursTunnel.jsx'));
const MonEspace            = lazy(() => import('./Pages/Mon espace/MonEspace.jsx'));
const PaiementRetour       = lazy(() => import('./Pages/Paiement/PaiementRetour.jsx'));
const RelancerPaiement     = lazy(() => import('./Pages/Paiement/RelancerPaiement.jsx'));
const Boutique             = lazy(() => import('./Pages/Boutique/Boutique.jsx'));
const UpdatePassword       = lazy(() => import('./Pages/Components/Password/UpdatePassword.jsx'));
const Connexion            = lazy(() => import('./Pages/Connexion/Connexion.jsx'));
const FAQ                  = lazy(() => import('./Pages/FAQ/FAQ.jsx'));

function RouteLoader() {
  return (
    <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:34, height:34, border:"3px solid #e2e8f0", borderTopColor:"#0c33ac", borderRadius:"50%", animation:"betPulse 1s linear infinite, betSpin .8s linear infinite" }} />
    </div>
  );
}

/* ── Keyframes injectés une seule fois ── */
if (!document.querySelector("#bet-splash-kf")) {
  const s = document.createElement("style");
  s.id = "bet-splash-kf";
  s.textContent = `
    @keyframes betLogoIn  { from{opacity:0;transform:scale(.72)} to{opacity:1;transform:scale(1)} }
    @keyframes betTextIn  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes betBarFill { from{width:0} to{width:100%} }
    @keyframes betPulse   { 0%,100%{opacity:1} 50%{opacity:.45} }
    @keyframes betSplashOut { from{opacity:1} to{opacity:0;pointer-events:none} }
    @keyframes betSpin { to{transform:rotate(360deg)} }
  `;
  document.head.appendChild(s);
}

function SplashScreen({ fading }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "linear-gradient(135deg,#011451 0%,#061d6e 55%,#0c33ac 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: fading ? "betSplashOut .55s ease forwards" : "none",
    }}>
      {/* Orbes décoratifs */}
      <div style={{ position:"absolute", width:380, height:380, borderRadius:"50%", background:"rgba(233,55,71,.08)", top:-80, right:-80, pointerEvents:"none" }} />
      <div style={{ position:"absolute", width:260, height:260, borderRadius:"50%", background:"rgba(255,255,255,.04)", bottom:-60, left:-60, pointerEvents:"none" }} />

      {/* Logo */}
      <img src={BinnieLogo} alt="Binnie's English Training"
        style={{ width: "clamp(140px,28vw,220px)", animation: "betLogoIn .7s cubic-bezier(.22,1,.36,1) both" }} />

      {/* Nom + tagline */}
      <div style={{ textAlign:"center", marginTop:22, animation:"betTextIn .6s ease .35s both" }}>
        <div style={{ color:"#fff", fontFamily:"'Montserrat','Segoe UI',sans-serif", fontSize:"clamp(.9rem,2.5vw,1.15rem)", fontWeight:800, letterSpacing:".08em" }}>
          BINNIE'S ENGLISH TRAINING
        </div>
        <div style={{ color:"rgba(255,255,255,.45)", fontFamily:"'Montserrat','Segoe UI',sans-serif", fontSize:".72rem", fontWeight:500, letterSpacing:".12em", marginTop:5 }}>
          CERTIFICATIONS · FORMATIONS · EXCELLENCE
        </div>
      </div>

      {/* Barre de progression */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:3, background:"rgba(255,255,255,.1)" }}>
        <div style={{ height:"100%", background:"linear-gradient(90deg,#e93747,#fbbf24,#0891b2)", animation:"betBarFill 2s ease forwards", borderRadius:"0 3px 3px 0" }} />
      </div>

      {/* Points de chargement */}
      <div style={{ display:"flex", gap:8, marginTop:32, animation:"betTextIn .6s ease .5s both" }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"rgba(255,255,255,.5)", animation:`betPulse 1.2s ease ${i*0.2}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function PageTracker() {
  usePageTracking();
  return null;
}

const App = () => {
  const [user, setUser] = useState(null);
  const [assignation, setAssignation] = useState(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading,  setSplashFading]  = useState(false);

  useEffect(() => {
    const fadeTimer   = setTimeout(() => setSplashFading(true),  2000);
    const removeTimer = setTimeout(() => setSplashVisible(false), 2600);
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, []);

  // Capture UTM au chargement + à chaque navigation
  useEffect(() => { captureUTM(); }, []);

  // Charge l'assignation (assistante attitrée) du prospect/apprenant connecté, pour le
  // bouton de chat flottant global - sans ça, le chat privé restait enfoui dans "Mon
  // espace" et personne ne le trouvait.
  useEffect(() => {
    if (!user?.email) { setAssignation(null); return; }
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
    fetch(`${API_URL}/api/parcours/mon-assignation?email=${encodeURIComponent(user.email)}`)
      .then(r => r.ok ? r.json() : { assignation: null })
      .then(d => setAssignation(d.assignation || null))
      .catch(() => setAssignation(null));
  }, [user?.email]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);

        // Synchronisation du profil après connexion (email/password ou Google)
        if (event === 'SIGNED_IN' && session?.user) {
          const token = session.access_token;
          // Stocker le token pour compatibilité avec MonEspace (getToken)
          localStorage.setItem('token', token);
          
          try {
            await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/auth/sync-profile`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            });
          } catch (err) {
            console.error('Erreur synchronisation profil:', err);
          }
        }
        
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem('token');
          sessionStorage.removeItem('token');
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.access_token) {
        localStorage.setItem('token', session.access_token);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      {splashVisible && <SplashScreen fading={splashFading} />}
      <HelmetProvider>
        <UserProvider>
          <CartContextProvider>
            <FavoritesContextProvider>
              <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ScrollToTop />
                <PageTracker />
                <OrganizationSchema />
                <Navbar user={user} />
                <Suspense fallback={<RouteLoader />}>
                  <Routes>
                    <Route path="/" element={<Accueil />} />
                    <Route path="/blog" element={<BlogList />} />
                    <Route path="/blog/:id" element={<BlogDetail />} />
                    <Route path="/temoignages" element={<TemoignagesPage />} />
                    {/* Adresse COURTE et stable : elle est encodée dans des QR imprimés
                        et se dicte à l'oral. « /formulaires/campagne/… » tiendrait mal
                        sur une affiche et se recopierait mal. */}
                    <Route path="/f/:slug" element={<FormulaireCampagne />} />
                    <Route path="/cours/:type" element={<CourseDetail />} />
                    <Route path="/certification/:certId" element={<CertificationDetail />} />
                    <Route path="/centre/:centerId" element={<CenterDetail />} />
                    <Route path="/service/:serviceId" element={<ServiceDetail />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/test-niveau" element={<FreeLevelTest />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/lead-magnet/audit-gratuit" element={<AuditGratuit />} />
                    <Route path="/mon-espace" element={<MonEspace />} />
                    <Route path="/bet-for-business" element={<BetForBusiness />} />
                    <Route path="/parcours/particulier" element={<ParcoursParticulier />} />
                    <Route path="/parcours/inscription" element={<ParcoursTunnel />} />
                    <Route path="/lead-magnet/merci" element={<LeadThankYou />} />
                    <Route path="/update-password" element={<UpdatePassword />} />
                    <Route path="/connexion" element={<Connexion />} />
                    <Route path="/faq" element={<FAQ />} />
                    <Route path="/paiement/retour" element={<PaiementRetour />} />
                    <Route path="/paiement/relancer" element={<RelancerPaiement />} />
                    <Route path="/boutique" element={<Boutique />} />
                  </Routes>
                </Suspense>
                <WhatsAppButton />
                {assignation && <ProspectChat sbUser={user} assignation={assignation} floating />}
              </Router>
            </FavoritesContextProvider>
          </CartContextProvider>
        </UserProvider>
        <Toaster position="top-right" />
      </HelmetProvider>
    </>
  );
};

export default App;