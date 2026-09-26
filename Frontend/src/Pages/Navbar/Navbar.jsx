import React, { useEffect, useState, useRef, useCallback } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import "./navbar.css";
import { supabase } from '../../config/supabase';
import ParcoursModal from "../Parcours/ParcoursModal";
import EntrepriseParcoursModal from "../Parcours/EntrepriseParcoursModal";
import EnfantParcoursModal from "../Parcours/EnfantParcoursModal";
import CentresEnLigneModal from "../Parcours/CentresEnLigneModal";

const JOURS_LABELS_COURTS = { lundi:"Lun", mardi:"Mar", mercredi:"Mer", jeudi:"Jeu", vendredi:"Ven", samedi:"Sam", dimanche:"Dim" };
function formatJoursTravail(jours) {
  return (jours || []).map(j => JOURS_LABELS_COURTS[j] || j).join(", ");
}

/* ─── ICÔNES SVG INLINE (inchangées) ───────────────────────────────────────── */
const IcoSearch  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IcoClose   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoBuild   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M9 12h.01M15 12h.01"/></svg>;
const IcoUser    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IcoCheck   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoPhone   = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>;
const IcoCard    = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
const IcoArrow   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
const IcoChevron = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>;
const IcoLogout  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoGlobe   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
const IcoStar    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const IcoChild   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><path d="M12 8v5m0 0-3 4m3-4 3 4"/><path d="M9 21h6"/></svg>;
const IcoGoogle  = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);
const IcoMail    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
const IcoLock    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IcoEye     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoEyeOff  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

/* ─── DONNÉES (inchangées) ───────────────────────────────────────────────── */
const searchableItems = [
  { type:"page",          title:"Accueil",                path:"/",                     keywords:["accueil","home"] },
  { type:"page",          title:"À propos",               path:"/about",                keywords:["à propos","about"] },
  { type:"page",          title:"FAQ",                    path:"/faq",                  keywords:["faq","questions","réponses","aide"] },
  { type:"cours",         title:"Cours en ligne",         path:"/cours/en-ligne",        keywords:["en ligne","online","distance"] },
  { type:"cours",         title:"Cours aux cabinets",     path:"/cours/cabinet",         keywords:["cabinet","présentiel"] },
  { type:"cours",         title:"Cours à domicile",       path:"/cours/domicile",        keywords:["domicile","particulier"] },
  { type:"certification", title:"TOEIC",                  path:"/certification/toeic",   keywords:["toeic","anglais","certification"] },
  { type:"certification", title:"TOEFL",                  path:"/certification/toefl",   keywords:["toefl","américain"] },
  { type:"certification", title:"IELTS",                  path:"/certification/ielts",   keywords:["ielts","britannique"] },
  { type:"centre",        title:"Centre Bouaké",          path:"/centre/bouake",         keywords:["bouaké"] },
  { type:"centre",        title:"Centre Angré",           path:"/centre/angre",          keywords:["angré"] },
  { type:"centre",        title:"Centre Abatta",          path:"/centre/abatta",         keywords:["abatta"] },
  { type:"centre",        title:"Centre Yopougon",        path:"/centre/yopougon",       keywords:["yopougon"] },
  { type:"centre",        title:"Centre Koumassi",        path:"/centre/koumassi",       keywords:["koumassi"] },
  { type:"centre",        title:"Centre II Plateaux",     path:"/centre/2plateaux",      keywords:["plateaux"] },
  // { type:"service",       title:"Séjour linguistique",    path:"/service/sejour",        keywords:["séjour","linguistique"] },
  { type:"service",       title:"Préparation interviews", path:"/service/interview",     keywords:["interview","entretien"] },
  { type:"service",       title:"Plateforme natifs",      path:"/service/natifs",        keywords:["natifs","native"] },
  { type:"service",       title:"Interprétariat",         path:"/service/interpretariat",keywords:["interprétariat"] },
];

const popularTopics = ["TOEIC","Cours en ligne","Anglais des affaires","Préparation IELTS","Cours à domicile","Séjour linguistique"];


const plansEntreprise = [
  { id:"starter",    label:"Starter",    price:"75 000",   freq:"/mois", features:["Jusqu'à 5 employés","Cours en ligne illimités","Rapports mensuels","Support email"] },
  { id:"business",   label:"Business",   price:"150 000",  freq:"/mois", features:["Jusqu'à 20 employés","Cours présentiel 2×/sem.","Dashboard RH","Support dédié"], popular:true },
  { id:"enterprise", label:"Enterprise", price:"Sur devis",freq:"",      features:["Effectif illimité","Programme sur-mesure","Chef de projet attitré","API & intégrations"] },
];
const plansParticulier = [
  { id:"decouverte", label:"Découverte", price:"15 000", freq:"/mois", features:["2 cours / semaine","Exercices en ligne","Accès 3 mois","Support communauté"] },
  { id:"intensif",   label:"Intensif",   price:"30 000", freq:"/mois", features:["5 cours / semaine","Coach personnel","Accès illimité","Préparation certif."], popular:true },
  { id:"premium",    label:"Premium",    price:"50 000", freq:"/mois", features:["Cours illimités","Tuteur natif","Immersion linguistique","Certification incluse"] },
];
const plansEnfant = [
  { id:"junior",   label:"Junior (6–10 ans)",  price:"12 000", freq:"/mois", features:["2 cours/semaine","Niveau A1–A2","Supports illustrés","Suivi mensuel parent"] },
  { id:"ado",      label:"Ado (11–17 ans)",     price:"20 000", freq:"/mois", features:["3 cours/semaine","Niveaux A1–B1","Coach dédié","Prépa examens scolaires"], popular:true },
  { id:"intensif", label:"Intensif Junior",     price:"35 000", freq:"/mois", features:["5 cours/semaine","Tous niveaux","Tuteur natif","Certification junior"] },
];

const NAV_DROPDOWNS = [
  { key:"cours",          label:"Nos cours",      links:[{to:"/cours/en-ligne",l:"Cours en ligne"},{to:"/cours/cabinet",l:"Cours aux cabinets"},{to:"/cours/domicile",l:"Cours à domicile"}] },
  { key:"certifications", label:"Certifications", links:[{to:"/certification/toeic",l:"TOEIC"},{to:"/certification/toefl",l:"TOEFL"},{to:"/certification/ielts",l:"IELTS"}] },
  { key:"communaute",     label:"Témoignages",     links:[{to:"/temoignages",l:"Témoignages"},{to:"/blog",l:"Newsletters"}] },
];

const OFFRES_DATA = [
  {
    key: "adultes",
    emoji: "🎓",
    titre: "Adultes",
    tagline: "Apprenez à votre rythme",
    couleur: "#0c33ac",
    bg: "#eef1ff",
    description: "Cours d'anglais général ou professionnel pour adultes actifs. Formats flexibles adaptés à votre emploi du temps.",
    plans: [
      { nom:"Cours en ligne",   emoji:"💻", prix:"Voir les offres", detail:"Apprenez depuis chez vous · Accès illimité · Tous niveaux", to:"/cours/en-ligne",  popular:false },
      { nom:"Cours en cabinet", emoji:"🏫", prix:"Voir les offres", detail:"Dans nos centres · Interaction directe avec le formateur",  to:"/cours/cabinet",  popular:true  },
      { nom:"Cours à domicile", emoji:"🏠", prix:"Voir les offres", detail:"Le formateur se déplace chez vous · 100% personnalisé",    to:"/cours/domicile", popular:false },
    ],
    ctas: [{ label:"Test de niveau gratuit", to:"/test-niveau", primary:true }],
  },
  {
    key: "enfants",
    emoji: "🧒",
    titre: "Enfants & Ados",
    tagline: "3 à 17 ans · Méthode ludique",
    couleur: "#7c3aed",
    bg: "#f3e8ff",
    description: "Programme d'anglais conçu pour les enfants et adolescents avec une pédagogie adaptée à chaque tranche d'âge.",
    plans: [
      { nom:"Petits Explorateurs",  emoji:"🧸", prix:"60 000 FCFA/mois", detail:"3–6 ans · 30 min/séance · Jeux, chansons & histoires", to:"@parcours-enfant", popular:false },
      { nom:"Juniors",              emoji:"🚀", prix:"75 000 FCFA/mois", detail:"7–12 ans · 45 min/séance · Préparation scolaire", to:"@parcours-enfant", popular:true },
      { nom:"Ados",                 emoji:"⭐", prix:"90 000 FCFA/mois", detail:"13–17 ans · 60 min/séance · TOEFL Junior & examens", to:"@parcours-enfant", popular:false },
    ],
    ctas: [{ label:"En savoir plus", to:"/contact", primary:true }],
  },
  {
    key: "entreprises",
    emoji: "🏢",
    titre: "Entreprises",
    tagline: "Formations sur-mesure pour vos équipes",
    couleur: "#0891b2",
    bg: "#e0f2fe",
    description: "Solutions de formation professionnelle adaptées aux besoins de votre entreprise. Cours intra, programmes sur-mesure et tableau de bord RH.",
    plans: [
      { nom:"Sur-mesure",      emoji:"🎯", prix:"Sur devis", detail:"Effectif illimité · Programme 100% personnalisé · Chef de projet", to:"/contact", popular:false },
    ],
    ctas: [{ label:"Contactez-nous", to:"/contact", primary:true }],
  },
  {
    key: "certifications",
    emoji: "🏆",
    titre: "Certifications",
    tagline: "TOEIC · TOEFL · IELTS",
    couleur: "#d97706",
    bg: "#fef3c7",
    description: "Préparation intensive aux grandes certifications internationales. Moyenne de 750+ au TOEIC dès le 1er passage.",
    plans: [
      { nom:"TOEIC",  emoji:"📋", prix:"390 000 FCFA", detail:"40h · Score garanti 700+ · 15 tests blancs · Vocab pro", to:"/certification/toeic", popular:true },
      { nom:"IELTS",  emoji:"🇬🇧", prix:"390 000 FCFA", detail:"6 semaines · Band 6.5+ · Méthode Cambridge · Coach dédié", to:"/certification/ielts", popular:false },
      { nom:"TOEFL",  emoji:"🇺🇸", prix:"390 000 FCFA", detail:"6 semaines · iBT Focus · Suivi individuel · Score garanti", to:"/certification/toefl", popular:false },
    ],
    ctas: [{ label:"Préparer ma certification", to:"@parcours-particulier", primary:true },{ label:"Test de niveau", to:"/test-niveau" }],
  },
  {
    key: "interpretariat",
    emoji: "🌍",
    titre: "Interprétariat",
    tagline: "Conférences · Réunions · Événements",
    couleur: "#059669",
    bg: "#f0fdf4",
    description: "Services d'interprétation professionnelle assurés par des interprètes certifiés pour vos événements et réunions d'affaires.",
    plans: [
      { nom:"Interprétariat simultané",    emoji:"🎙️", prix:"Sur devis", detail:"Conférences · Équipement cabine fourni", to:"/service/interpretariat", popular:false },
      { nom:"Interprétariat consécutif",   emoji:"🤝", prix:"Sur devis", detail:"Réunions & négociations · Sans équipement", to:"/service/interpretariat", popular:true },
      { nom:"Interprétariat de liaison",   emoji:"🌐", prix:"Sur devis", detail:"Visites & délégations · Format souple", to:"/service/interpretariat", popular:false },
    ],
    ctas: [{ label:"Demander un devis", to:"/service/interpretariat", primary:true },{ label:"Nous contacter", to:"/contact" }],
  },
  {
    key: "traduction",
    emoji: "📄",
    titre: "Traduction",
    tagline: "Documents · Contrats · Certifiée",
    couleur: "#ff2945",
    bg: "#fff0f2",
    description: "Service de traduction professionnelle de documents juridiques, commerciaux et techniques. Traductions certifiées disponibles.",
    plans: [
      { nom:"Traduction standard", emoji:"📝", prix:"Sur devis", detail:"3-5 jours ouvrés · Tarif au mot · Anglais ↔ Français", to:"/contact", popular:false },
      { nom:"Traduction express",  emoji:"⚡", prix:"Sur devis", detail:"24-48h · Disponible 7j/7 · Majoration urgence", to:"/contact", popular:true },
      { nom:"Traduction certifiée",emoji:"📜", prix:"Sur devis", detail:"Cachet officiel · Légalisation · Actes & contrats", to:"/contact", popular:false },
    ],
    ctas: [{ label:"Obtenir un devis", to:"/contact", primary:true },{ label:"En savoir plus", to:"/service/interpretariat" }],
  },
];

/* ══════════════════════════════════════════════════════════════════
   DONNÉES CENTRES MODAL - synchronisées avec bet_centres_master
══════════════════════════════════════════════════════════════════ */
const CENTRES_MASTER_KEY = "bet_centres_master";
const CENTRES_PHY_FALLBACK = [
  { key:"angre",    name:"BET Angré",       addr:"Angré 7ème Tranche, Abidjan",    lat:5.3699, lng:-3.9674, color:"#25d366" },
  { key:"bouake",   name:"BET Bouaké",      addr:"Centre-Ville, Bouaké",            lat:7.6936, lng:-5.0232, color:"#facc15" },
  { key:"plateaux", name:"BET II Plateaux", addr:"Riviera II Plateaux, Abidjan",   lat:5.3611, lng:-4.0103, color:"#0891b2" },
  { key:"yopougon", name:"BET Yopougon",    addr:"Yopougon Sicogi, Abidjan",       lat:5.3264, lng:-4.0709, color:"#a855f7" },
  { key:"koumassi", name:"BET Koumassi",    addr:"Koumassi Remblai, Abidjan",      lat:5.3001, lng:-3.9500, color:"#f97316" },
  { key:"abatta",   name:"BET Abatta",      addr:"Abatta, Grand-Bassam",            lat:5.2667, lng:-3.8333, color:"#ef4444" },
  { key:"cocody",   name:"BET Cocody",      addr:"Cocody Danga, Abidjan",           lat:5.3742, lng:-3.9832, color:"#8b5cf6" },
];
function loadCentresMaster() {
  try {
    const s = localStorage.getItem(CENTRES_MASTER_KEY);
    if (!s) return CENTRES_PHY_FALLBACK;
    const parsed = JSON.parse(s);
    return parsed.filter(c => c.actif !== false).map(c => ({ key:c.key, name:c.name, addr:c.addr||"", lat:c.lat||0, lng:c.lng||0, color:c.color||"#0891b2", description:c.description, horaires:c.horaires, telephone:c.telephone, email:c.email, photos:c.photos||[], brochure_url:c.brochure_url||"", brochure_nom:c.brochure_nom||"", offres:c.offres||[], cta:c.cta||{}, maps_url:c.maps_url||"", maps_embed:c.maps_embed||"" }));
  } catch { return CENTRES_PHY_FALLBACK; }
}


const hdist = (la1, lo1, la2, lo2) => {
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((la2-la1)*d/2)**2 + Math.cos(la1*d)*Math.cos(la2*d)*Math.sin((lo2-lo1)*d/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

/* ════════════════════════════════════════════════════════════════════════════
   CONFIG CENTRES BET - partagée avec le SuperAdmin via localStorage
════════════════════════════════════════════════════════════════════════════ */
const BET_CENTERS_LS_KEY = "bet_centers_config";

function loadCenters() {
  try {
    const saved = localStorage.getItem(BET_CENTERS_LS_KEY);
    const list = saved ? JSON.parse(saved) : [];
    // Croiser avec le master pour exclure les centres inactifs
    try {
      const master = localStorage.getItem(CENTRES_MASTER_KEY);
      if (master) {
        const masterMap = {};
        JSON.parse(master).forEach(c => { masterMap[c.key] = c.actif; });
        const filtered = list.filter(c => masterMap[c.key] !== false);
        if (filtered.length) return filtered;
      }
    } catch {}
    // bet_centers_config n'est écrit nulle part côté Frontend (aucun admin panel ne
    // l'alimente sur ce domaine) - la barre "Contactez votre centre BET" restait donc
    // vide en permanence. On retombe sur la liste maître des centres (déjà utilisée
    // pour la modale "Nos centres", elle a un vrai fallback si le localStorage est vide).
    if (list.length) return list;
    return loadCentresMaster().map(c => ({ key: c.key, name: c.name }));
  } catch { return loadCentresMaster().map(c => ({ key: c.key, name: c.name })); }
}

/* ════════════════════════════════════════════════════════════════════════════
   NAVBAR (avec notifications)
════════════════════════════════════════════════════════════════════════════ */
const Navbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  const [scrolled,       setScrolled]       = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [lang,           setLang]           = useState("FR");

  /* Auth ── */
  const [user,            setUser]            = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef(null);

  /* Marquee dynamique ── */
  // Chaque item : { texte, code_promo, lien_url, lien_label } ou string (fallback)
  const [marqueeItems, setMarqueeItems] = useState([]);
  useEffect(() => {
    const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
    fetch(`${API}/api/marquee/publics`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.messages?.length) setMarqueeItems(d.messages); })
      .catch(() => {});
  }, []);

  /* Modal connexion ── */
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab,   setActiveTab]   = useState("login");
  const [showPwd,     setShowPwd]     = useState(false);
  const [loginData,   setLoginData]   = useState({ email:"", password:"" });
  const [regData,     setRegData]     = useState({ name:"", email:"", tel:"", password:"" });

  /* Notifications */
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");

  // Effacement automatique des messages après 3 secondes
  useEffect(() => {
    if (loginError) setTimeout(() => setLoginError(""), 3000);
    if (loginSuccess) setTimeout(() => setLoginSuccess(""), 3000);
    if (registerError) setTimeout(() => setRegisterError(""), 3000);
    if (registerSuccess) setTimeout(() => setRegisterSuccess(""), 3000);
  }, [loginError, loginSuccess, registerError, registerSuccess]);

  /* Recherche ── */
  const [isSearchOpen,  setIsSearchOpen]  = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const searchInputRef = useRef(null);

  /* Offres modal ── */
  const [showOffresModal,  setShowOffresModal]  = useState(false);
  const [offresSelected,   setOffresSelected]   = useState(null);
  const [dynInterp,         setDynInterp]         = useState(() => { try { const s=localStorage.getItem("bet_service_interpretariat"); return s?JSON.parse(s):null; } catch{return null;} });
  const [dynTrad,           setDynTrad]           = useState(() => { try { const s=localStorage.getItem("bet_service_traduction");    return s?JSON.parse(s):null; } catch{return null;} });
  const [dynCertif,         setDynCertif]         = useState(() => { try { const s=localStorage.getItem("bet_certifications_config"); return s?JSON.parse(s):null; } catch{return null;} });
  const [dynOffresEnLigne,  setDynOffresEnLigne]  = useState(() => { try { const s=localStorage.getItem("bet_offres_en_ligne");       return s?JSON.parse(s):null; } catch{return null;} });
  const [dynOffresDomicile, setDynOffresDomicile] = useState(() => { try { const s=localStorage.getItem("bet_offres_domicile");       return s?JSON.parse(s):null; } catch{return null;} });
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "bet_service_interpretariat") { try { setDynInterp(JSON.parse(e.newValue));         } catch{} }
      if (e.key === "bet_service_traduction")     { try { setDynTrad(JSON.parse(e.newValue));           } catch{} }
      if (e.key === "bet_certifications_config")  { try { setDynCertif(JSON.parse(e.newValue));         } catch{} }
      if (e.key === "bet_offres_en_ligne")        { try { setDynOffresEnLigne(JSON.parse(e.newValue));  } catch{} }
      if (e.key === "bet_offres_domicile")        { try { setDynOffresDomicile(JSON.parse(e.newValue)); } catch{} }
    };
    window.addEventListener("storage", onStorage);
    supabase.from("plateforme_config").select("key,valeur").in("key",["service_interpretariat","service_traduction","certifications_config","offres_en_ligne","offres_domicile","catalogue_pdf"]).then(({ data }) => {
      (data||[]).forEach(row => {
        if (row.key === "service_interpretariat" && row.valeur) { localStorage.setItem("bet_service_interpretariat", JSON.stringify(row.valeur)); setDynInterp(row.valeur);         }
        if (row.key === "service_traduction"     && row.valeur) { localStorage.setItem("bet_service_traduction",    JSON.stringify(row.valeur)); setDynTrad(row.valeur);            }
        if (row.key === "certifications_config"  && row.valeur) { localStorage.setItem("bet_certifications_config", JSON.stringify(row.valeur)); setDynCertif(row.valeur);          }
        if (row.key === "offres_en_ligne"        && row.valeur) { localStorage.setItem("bet_offres_en_ligne",       JSON.stringify(row.valeur)); setDynOffresEnLigne(row.valeur);   }
        if (row.key === "offres_domicile"        && row.valeur) { localStorage.setItem("bet_offres_domicile",       JSON.stringify(row.valeur)); setDynOffresDomicile(row.valeur);  }
        if (row.key === "catalogue_pdf"          && row.valeur) { const v=JSON.stringify(row.valeur); localStorage.setItem("bet_catalogue_pdf", v); window.dispatchEvent(new StorageEvent("storage",{key:"bet_catalogue_pdf",newValue:v})); }
      });
    });
    return () => window.removeEventListener("storage", onStorage);
  }, []); // eslint-disable-line

  /* Parcours modal ── */
  const [showParcoursModal,      setShowParcoursModal]      = useState(false);
  const [parcoursDefaultMode,    setParcoursDefaultMode]    = useState(null);
  const [showEntrepriseModal,    setShowEntrepriseModal]    = useState(false);
  const [showEnfantModal,        setShowEnfantModal]        = useState(false);
  const [showCentresLigneModal,  setShowCentresLigneModal]  = useState(false);

  // Résout un lien "sentinelle" (préfixe "@") du méga-menu "Nos offres" (OFFRES_DATA) en
  // ouverture de la vraie modale connectée à TouchPoint, au lieu d'une navigation vers
  // /parcours/particulier (page non utilisée).
  const openParcoursSentinel = (sentinel) => {
    if (sentinel === "@parcours-particulier") { setParcoursDefaultMode(null); setShowParcoursModal(true); }
    else if (sentinel === "@parcours-enfant") { setShowEnfantModal(true); }
  };

  /* Centres modal ── */
  const [showCentresModal, setShowCentresModal] = useState(false);
  const [centresTab,       setCentresTab]       = useState("physique");
  const [userCoords,       setUserCoords]       = useState(null);
  const [geoLoading,       setGeoLoading]       = useState(false);
  const [centresSorted,    setCentresSorted]    = useState(loadCentresMaster);

  /* Tunnel ── */
  const [tunnelOpen,    setTunnelOpen]    = useState(false);
  const [tunnelType]    = useState(null);
  const [tunnelStep,    setTunnelStep]    = useState(1);
  const [selectedPlan,  setSelectedPlan]  = useState(null);
  const [payMethod,     setPayMethod]     = useState(null);
  const [mobileOp,      setMobileOp]      = useState(null);
  const [formData,      setFormData]      = useState({ nom:"", email:"", tel:"", societe:"", effectif:"", besoin:"" });
  const [payData,       setPayData]       = useState({ numero:"", cardNum:"", expiry:"", cvv:"", holder:"" });
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelErreur,  setTunnelErreur]  = useState("");
  const [centerModal,   setCenterModal]   = useState(null); // centre sélectionné
  const [realCentresMap,         setRealCentresMap]         = useState({}); // nom.toLowerCase() → {id, nom, ville}
  const [modalAssistantes,       setModalAssistantes]       = useState([]);
  const [loadingModalAssistantes,setLoadingModalAssistantes]= useState(false);
  const [showConseillerModal,    setShowConseillerModal]    = useState(false);
  const [conseillerList,         setConseillerList]         = useState([]);
  const [loadingConseillers,     setLoadingConseillers]     = useState(false);
  const [enfantData,    setEnfantData]    = useState({ prenom_enfant:"", nom_enfant:"", tranche_age:"", nom_parent:"", email_parent:"", tel_parent:"", centre_key:"" });
  const [selectedCommercial, setSelectedCommercial] = useState("");
  const [betCenters, setBetCenters] = useState(loadCenters);

  /* ── Scroll ── */
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  /* ── Fermeture dropdown + profil au clic extérieur ── */
  useEffect(() => {
    const h = (e) => {
      if (!e.target.closest(".dropdown")) setActiveDropdown(null);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* ── Recherche ── */
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(searchableItems.filter(i =>
      i.title.toLowerCase().includes(q) || i.keywords.some(k => k.toLowerCase().includes(q))
    ));
  }, [searchQuery]);

  const handleNavClick = useCallback(() => {
    setActiveDropdown(null);
    setMenuOpen(false);
  }, []);

  const toggleDropdown = (key) => setActiveDropdown(p => p === key ? null : key);

  const openSearch = () => { setIsSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 80); };
  const closeSearch = () => { setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]); };

  /* ══════════════════════════════════════════════════════════
     AUTHENTIFICATION - source unique : session Supabase
     • Email/password  → backend → supabase.auth.setSession()
     • Google OAuth    → supabase.auth.signInWithOAuth()
     • Au chargement   → supabase.auth.getSession() + onAuthStateChange
  ══════════════════════════════════════════════════════════ */

  const buildUser = (supaUser) => {
    const meta = supaUser.user_metadata || {};
    const fullName = (meta.nom && meta.prenom)
      ? `${meta.nom} ${meta.prenom}`
      : meta.full_name || supaUser.email.split("@")[0];
    const roleRaw = meta.role || "prospect";
    const roleLabel = roleRaw === "apprenant" ? "Apprenant BET" : "Prospect";
    return {
      ...supaUser,
      name: fullName,
      avatar: meta.bet_avatar_url || null,
      role: roleLabel,
    };
  };

  const refreshApprenantStatus = async (email) => {
    if (!email) return;
    try {
      const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
      const r = await fetch(`${API}/api/auth/prospect-info?email=${encodeURIComponent(email)}`);
      if (r.ok) {
        const d = await r.json();
        if (d.is_apprenant) {
          setUser(prev => prev ? { ...prev, role: "Apprenant BET" } : prev);
        }
      }
    } catch {}
  };

  const syncProfile = async (session) => {
    try {
      await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5001"}/api/auth/sync-profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
      });
    } catch {}
  };

  useEffect(() => {
    // 1. Nettoyage de l'ancien système JWT (migration)
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");

    // 2. Vérifier la session Supabase existante (OAuth callback ou session persistée)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(buildUser(session.user));
        syncProfile(session);
        refreshApprenantStatus(session.user.email);
      }
    });

    // 3. Écouter tous les changements d'état (login, logout, OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(buildUser(session.user));
        syncProfile(session);
        refreshApprenantStatus(session.user.email);
        setIsModalOpen(false);
        // Redirige vers la page d'origine si l'user venait d'une auth gate (Google OAuth notamment)
        const pending = sessionStorage.getItem("bet_pending_auth");
        if (pending) {
          try {
            const { returnUrl, context } = JSON.parse(pending);
            sessionStorage.removeItem("bet_pending_auth");
            if (context && Object.keys(context).length) {
              sessionStorage.setItem("bet_return_context", JSON.stringify(context));
            }
            navigate(returnUrl + (returnUrl.includes("?") ? "&" : "?") + "openPayment=1");
          } catch {}
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        setUser(buildUser(session.user));
        refreshApprenantStatus(session.user.email);
      } else if (event === "USER_UPDATED" && session?.user) {
        setUser(buildUser(session.user));
        refreshApprenantStatus(session.user.email);
      }
    });

    // Ouvrir la modale de connexion à la demande d'une autre page (auth gate)
    const handleOpenLogin = (e) => {
      if (e.detail?.returnUrl) {
        sessionStorage.setItem("bet_pending_auth", JSON.stringify({
          returnUrl: e.detail.returnUrl,
          context:   e.detail.context || {}
        }));
      }
      setActiveTab("login");
      setIsModalOpen(true);
    };
    window.addEventListener("bet:openLoginModal", handleOpenLogin);

    // Ouvrir la modale "Je suis une entreprise" (devis + affectation Corporate) à la
    // demande d'une autre page - tous les boutons "Demander un devis" du site (parcours
    // entreprise, BET for Business…) déclenchent ce même modal plutôt que d'avoir chacun
    // leur propre implémentation.
    const handleOpenEntreprise = () => setShowEntrepriseModal(true);
    window.addEventListener("bet:openEntrepriseModal", handleOpenEntreprise);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("bet:openLoginModal", handleOpenLogin);
      window.removeEventListener("bet:openEntrepriseModal", handleOpenEntreprise);
    };
  }, [navigate]);

  /* ── Connexion email/password ── */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginSuccess("");
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5001"}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginData.email, password: loginData.password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Email ou mot de passe incorrect");

      // Synchroniser la session dans le client Supabase → onAuthStateChange prend le relais
      await supabase.auth.setSession({
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      setLoginSuccess("Connexion réussie !");
      setTimeout(() => setIsModalOpen(false), 800);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  /* ── Inscription email/password ── */
  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError("");
    setRegisterSuccess("");
    try {
      const nameParts = regData.name.trim().split(" ");
      const response = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5001"}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom:       nameParts[0] || "",
          prenom:    nameParts.slice(1).join(" ") || "",
          email:     regData.email,
          telephone: regData.tel,
          password:  regData.password,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur lors de l'inscription");

      setRegisterSuccess("Compte créé ! Connexion automatique…");

      // Connexion immédiate via Supabase client
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email:    regData.email,
        password: regData.password,
      });
      if (signInErr) throw new Error(signInErr.message);
      // onAuthStateChange déclenche setUser automatiquement
      setTimeout(() => setIsModalOpen(false), 800);
    } catch (err) {
      setRegisterError(err.message);
    }
  };

  /* ── Google OAuth (connexion ET inscription) ── */
  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
    } catch (err) {
      setRegisterError("Erreur lors de la connexion avec Google.");
    }
  };

  /* ── Déconnexion ── */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/";
  };

  const initials = (name = "") => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const isEnfant = tunnelType === "enfant";
  const maxStep = 4;
  const plans = tunnelType === "entreprise" ? plansEntreprise : isEnfant ? plansEnfant : plansParticulier;

  const selectedCentre = isEnfant ? betCenters.find(c => c.key === enfantData.centre_key) : null;
  const centreCommerciaux = selectedCentre?.commerciaux || [];

  const canGo1 = isEnfant
    ? (enfantData.prenom_enfant && enfantData.nom_enfant && enfantData.tranche_age)
    : (formData.nom && formData.email && formData.tel);
  const canGo2 = isEnfant
    ? enfantData.centre_key !== ""
    : !!selectedPlan;
  const canGo3 = isEnfant
    ? (enfantData.nom_parent && enfantData.email_parent && enfantData.tel_parent)
    : (payMethod === "mobile"
        ? mobileOp && payData.numero.length >= 8
        : payData.cardNum.length >= 16 && payData.expiry && payData.cvv && payData.holder);

  const stepLabels = isEnfant
    ? ["Mon enfant", "Votre centre", "Parent & Contact", "Confirmation"]
    : ["Profil", "Plan", "Paiement", "Confirmation"];
  const selectedPlanObj = plans?.find(p => p.id === selectedPlan);

  const nextStep = async () => {
    if (tunnelStep===1 && !canGo1) return;
    if (tunnelStep===2 && !canGo2) return;
    if (tunnelStep===3 && !canGo3) return;

    const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

    /* ── Tunnel Enfant : soumission à l'étape 3 ── */
    if (isEnfant && tunnelStep === 3) {
      setTunnelLoading(true);
      setTunnelErreur("");
      try {
        // Résoudre le centre_id réel (DB) à partir du nom affiché - même logique
        // fuzzy-match que handleCentreClick, car enfantData.centre_key n'est qu'une
        // clé locale de configuration (ex. "angre"), pas l'id réel attendu par le backend.
        let realCentreId = null;
        if (selectedCentre?.name) {
          const nomNorm = selectedCentre.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
          for (const [key, c] of Object.entries(realCentresMap)) {
            if (key.includes(nomNorm) || nomNorm.includes(key)) { realCentreId = c.id; break; }
          }
        }
        await fetch(`${API}/api/inscriptions/enfant/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prenom_enfant:  enfantData.prenom_enfant,
            nom_enfant:     enfantData.nom_enfant,
            tranche_age:    enfantData.tranche_age,
            centre_id:      realCentreId,
            nom_parent:     enfantData.nom_parent,
            email_parent:   enfantData.email_parent,
            tel_parent:     enfantData.tel_parent,
            commercial_id:  selectedCommercial || null,
            statut:         "en_attente",
          }),
        }).then(r => { if (!r.ok) throw new Error(); });
        setTunnelStep(4);
      } catch {
        setTunnelErreur("Une erreur est survenue. Veuillez réessayer ou nous contacter directement.");
      } finally {
        setTunnelLoading(false);
      }
      return;
    }

    /* ── Tunnel Particulier / Entreprise : soumission à l'étape 3 ── */
    if (!isEnfant && tunnelStep === 3) {
      setTunnelLoading(true);
      setTunnelErreur("");
      try {
        const modeP = payMethod === "mobile"
          ? `Mobile Money ${mobileOp || ""} - ${payData.numero}`
          : `Carte bancaire - ${payData.holder}`;
        if (tunnelType === "entreprise") {
          await fetch(`${API}/api/entreprise/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entreprise:    formData.societe || formData.nom,
              contact:       formData.nom,
              email:         formData.email,
              telephone:     formData.tel,
              nb_employes:   formData.effectif || null,
              besoins:       [formData.besoin, selectedPlanObj?.label, modeP].filter(Boolean).join(" | ") || null,
              commercial_id: selectedCommercial || null,
            }),
          }).then(r => { if (!r.ok) throw new Error(); });
        } else {
          await fetch(`${API}/api/inscriptions/adulte/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nom_complet:   formData.nom,
              email:         formData.email,
              telephone:     formData.tel,
              offre_titre:   selectedPlanObj?.label || null,
              mode_paiement: modeP,
              commercial_id: selectedCommercial || null,
              statut:        "nouveau",
            }),
          }).then(r => { if (!r.ok) throw new Error(); });
        }
        setTunnelStep(4);
      } catch {
        setTunnelErreur("Une erreur est survenue. Veuillez réessayer ou nous contacter directement.");
      } finally {
        setTunnelLoading(false);
      }
      return;
    }

    if (tunnelStep < maxStep) setTunnelStep(s => s + 1);
  };

  /* ── Charger les centres réels depuis l'API (pour résolution centre_id) ── */
  useEffect(() => {
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
    fetch(`${API_URL}/api/parcours/centres`)
      .then(r => r.json())
      .then(d => {
        const map = {};
        (d.centres || []).forEach(c => {
          // Clé normalisée sans accents + minuscules pour matching souple
          const key = c.nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
          map[key] = c;
        });
        setRealCentresMap(map);
      })
      .catch(() => {});
  }, []);

  /* ── Géolocalisation → trier les centres physiques par distance ── */
  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        setUserCoords({ lat, lng });
        const sorted = [...centresSorted].sort((a, b) =>
          hdist(lat, lng, a.lat, a.lng) - hdist(lat, lng, b.lat, b.lng)
        );
        setCentresSorted(sorted);
        setGeoLoading(false);
      },
      () => setGeoLoading(false)
    );
  };

  /* ── Ouvrir le modal conseillers (depuis "Nos offres") ── */
  const handleConseillerClick = async () => {
    setShowConseillerModal(true);
    setConseillerList([]);
    setLoadingConseillers(true);
    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
      const r = await fetch(`${API_URL}/api/parcours/assistantes-ligne?profil=b2c`);
      const d = await r.json();
      setConseillerList(d.assistantes || []);
    } catch {
      setConseillerList([]);
    } finally {
      setLoadingConseillers(false);
    }
  };

  /* ── Ouvrir le modal centre + charger les vraies assistantes depuis l'API ── */
  const handleCentreClick = async (center) => {
    setCenterModal(center);
    setModalAssistantes([]);
    setLoadingModalAssistantes(true);
    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
      // Chercher l'id réel en normalisant le nom
      const nomNorm = center.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      let realCentreId = null;
      for (const [key, c] of Object.entries(realCentresMap)) {
        if (key.includes(nomNorm) || nomNorm.includes(key)) { realCentreId = c.id; break; }
      }
      if (realCentreId) {
        const r = await fetch(`${API_URL}/api/parcours/assistantes-presentiel/${realCentreId}?tous=true`);
        const d = await r.json();
        setModalAssistantes(d.assistantes || []);
      } else {
        // Fallback : utiliser les données betCenters configurées par l'admin
        setModalAssistantes((center.assistantes || []).map(a => ({
          id: a.phone, prenom: a.nom, nom: "", telephone: a.phone,
        })));
      }
    } catch {
      setModalAssistantes((center.assistantes || []).map(a => ({
        id: a.phone, prenom: a.nom, nom: "", telephone: a.phone,
      })));
    } finally {
      setLoadingModalAssistantes(false);
    }
  };

  useEffect(() => {
    // 1. Charger depuis Supabase (source de vérité partagée avec le dashboard)
    supabase
      .from("plateforme_config")
      .select("valeur")
      .eq("key", "centres_wa")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.valeur?.length) {
          setBetCenters(data.valeur);
          localStorage.setItem(BET_CENTERS_LS_KEY, JSON.stringify(data.valeur));
        }
      });

    // 1b. Centres maître (actif/inactif + données riches)
    supabase
      .from("plateforme_config")
      .select("valeur")
      .eq("key", "centres_master")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.valeur?.length) {
          localStorage.setItem(CENTRES_MASTER_KEY, JSON.stringify(data.valeur));
          setCentresSorted(loadCentresMaster());
        }
      });

    // 2. Écouter les mises à jour depuis le dashboard (même navigateur)
    const onStorage = (e) => {
      if (e.key === BET_CENTERS_LS_KEY) setBetCenters(loadCenters());
      if (e.key === CENTRES_MASTER_KEY) setCentresSorted(loadCentresMaster());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []); // eslint-disable-line

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  return (
    <div className={`navbar-container ${scrolled ? "scrolled" : ""} ${isHome && !scrolled ? "at-hero" : ""}`}>
      {marqueeItems.length > 0 && (
      <div className="marquee-bar">
        <div className="marquee-track">
          {[...marqueeItems, ...marqueeItems].map((item, i) => {
            const texte      = typeof item === "string" ? item : item.texte;
            const codePromo  = typeof item === "string" ? null : item.code_promo;
            const lienUrl    = typeof item === "string" ? null : item.lien_url;
            const lienLabel  = typeof item === "string" ? null : (item.lien_label || lienUrl);
            return (
              <span key={i} className="marquee-item">
                {texte}
                {codePromo && (
                  <span style={{ marginLeft:6, background:"#fbbf24", color:"#78350f", padding:"1px 7px", borderRadius:4, fontWeight:700, fontSize:11 }}>
                    {codePromo}
                  </span>
                )}
                {lienUrl && (
                  <a href={lienUrl} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft:8, color:"#7dd3fc", fontWeight:700, textDecoration:"underline", fontSize:12 }}
                    onClick={e => e.stopPropagation()}>
                    {lienLabel} →
                  </a>
                )}
                <span className="marquee-dot">·</span>
              </span>
            );
          })}
        </div>
      </div>
      )}

      <div className="parcours-banner">
        {/* ── Ligne 1 : parcours ── */}
        <div className="parcours-group">
          <span className="parcours-label">Commencez votre parcours :</span>
          <button
            className="parcours-btn parcours-btn--b2c"
            onClick={() => {
              // Toujours ouvrir le tunnel - il gère déjà lui-même la réutilisation de
              // l'assistante existante par canal (findAssistanteExistante), donc un apprenant
              // déjà converti peut quand même souscrire une nouvelle offre sans être bloqué.
              setParcoursDefaultMode(null);
              setShowParcoursModal(true);
            }}
          >
            <IcoUser /> Je suis un particulier
          </button>
          <button className="parcours-btn parcours-btn--enfant" onClick={() => setShowEnfantModal(true)}>
            <IcoChild /> J'inscris mon enfant
          </button>
          <button className="parcours-btn parcours-btn--b2b" onClick={() => setShowEntrepriseModal(true)}>
            <IcoBuild /> Je suis une entreprise
          </button>
          <button className="lang-btn parcours-lang-btn" onClick={() => setLang(l => l==="FR"?"EN":"FR")}>
            <IcoGlobe />
            <span>{lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}</span>
            <span className="lang-slash">/</span>
            <span className="lang-other">{lang === "FR" ? "EN" : "FR"}</span>
          </button>
          <button className="icon-btn" onClick={openSearch} aria-label="Rechercher" style={{ padding:"6px 8px" }}><IcoSearch /></button>
        </div>

        {/* ── Séparateur horizontal ── */}
        <div className="banner-divider" />

        {/* ── Ligne 2 : centres ── */}
        <div className="bet-group">
          <span className="bet-label">📞 Contactez votre centre BET :</span>
          <div className="bet-buttons">
            {betCenters.map((center) => (
              <button
                key={center.key}
                className={`bet-btn bet-btn--${center.key}`}
                style={{ borderLeftColor: center.color }}
                onClick={() => handleCentreClick(center)}
              >
                📍 {center.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="navbar">
        <div className="logo">
          <NavLink to="/" onClick={handleNavClick}>
            <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's" className="logo-img" />
          </NavLink>
        </div>

        <ul className={`nav-links ${menuOpen ? "active" : ""}`}>
          <li><NavLink to="/" onClick={handleNavClick}>Accueil</NavLink></li>
          <li><NavLink to="/test-niveau" onClick={handleNavClick}>Test de niveau</NavLink></li>
          <li>
            <button className="nav-centres-btn" onClick={() => { setShowOffresModal(true); setOffresSelected(null); handleNavClick(); }}>
              Nos offres
            </button>
          </li>
          {NAV_DROPDOWNS.map(({ key, label, links }) => (
            <li key={key} className="dropdown">
              <div className="dropdown-trigger" onClick={() => toggleDropdown(key)}>
                {label} <span className={`chevron ${activeDropdown===key?"open":""}`}><IcoChevron /></span>
              </div>
              <ul className={`dropdown-menu ${activeDropdown===key ? "show" : ""}`}>
                {links.map(({ to, l }) => (
                  <li key={to}>
                    <NavLink to={to} onClick={handleNavClick}>{l}</NavLink>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          <li>
            <button className="nav-centres-btn" onClick={() => { setShowCentresModal(true); handleNavClick(); }}>
              📍 Nos centres
            </button>
          </li>
          <li><NavLink to="/bet-for-business" onClick={handleNavClick}>BET for Business</NavLink></li>
          <li><NavLink to="/about" onClick={handleNavClick}>À propos</NavLink></li>
          <li><NavLink to="/faq" onClick={handleNavClick}>FAQ</NavLink></li>
          <li><NavLink to="/boutique" onClick={handleNavClick}>🛍️ Boutique</NavLink></li>
          <li><NavLink to="/contact" onClick={handleNavClick}>Contact</NavLink></li>
        </ul>

        <div className="nav-right">
          {!user ? (
            <button className="btn-login" onClick={() => setIsModalOpen(true)}>Connexion</button>
          ) : (
            <div className="profile-wrap" ref={profileRef}>
              <button className="profile-btn" onClick={() => setProfileMenuOpen(p => !p)} title={user?.name || user?.email?.split("@")[0] || "Utilisateur"}>
                <div className="profile-avatar">
                  {user.avatar ? <img src={user.avatar} alt="" /> : <span>{initials(user.name)}</span>}
                  <span className="online-dot" />
                </div>
              </button>
              {profileMenuOpen && (
                <div className="profile-dropdown">
                  <div className="pd-header">
                    <div className="pd-avatar-lg" style={{ overflow:"hidden", padding:0 }}>
                      {user?.avatar
                        ? <img src={user.avatar} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%" }} />
                        : initials(user?.name || user?.email || "?")}
                    </div>
                    <div>
                      <div className="pd-name">{user.name}</div>
                      <div className="pd-email">{user.email}</div>
                      <span className="pd-badge">{user.role}</span>
                    </div>
                  </div>
                  <div className="pd-links">
                    <NavLink to="/mon-espace" className="pd-link" onClick={() => setProfileMenuOpen(false)}>Mon espace</NavLink>
                  </div>
                  <div className="pd-footer">
                    <button className="pd-logout" onClick={handleLogout}><IcoLogout /> Déconnexion</button>
                  </div>
                </div>
              )}
            </div>
          )}
          <button className={`burger ${menuOpen?"open":""}`} onClick={() => setMenuOpen(p=>!p)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>
      </div>

      {/* TUNNEL B2B / B2C (inchangé) */}
      {tunnelOpen && (
        <div className="tunnel-overlay" onClick={() => setTunnelOpen(false)}>
          <div className="tunnel-container" onClick={e => e.stopPropagation()}>
            <div className={`tunnel-header ${tunnelType==="entreprise"?"th--b2b":isEnfant?"th--enfant":"th--b2c"}`}>
              <div className="th-left">
                {tunnelType==="entreprise"?<IcoBuild />:isEnfant?<IcoChild />:<IcoUser />}
                <span>{tunnelType==="entreprise"?"Espace Entreprise":isEnfant?"Inscription Enfant":"Espace Particulier"}</span>
              </div>
              <button className="tunnel-close" onClick={() => setTunnelOpen(false)}><IcoClose /></button>
            </div>
            <div className="tunnel-stepper">
              {stepLabels.map((label, i) => (
                <React.Fragment key={i}>
                  <div className={`ts-step ${tunnelStep>i+1?"done":""} ${tunnelStep===i+1?"active":""}`}>
                    <div className="ts-dot">{tunnelStep>i+1?<IcoCheck />:i+1}</div>
                    <span className="ts-label">{label}</span>
                  </div>
                  {i < stepLabels.length-1 && <div className={`ts-line ${tunnelStep>i+1?"done":""}`} />}
                </React.Fragment>
              ))}
            </div>
            {/* ── Étape 1 ── */}
            {tunnelStep === 1 && !isEnfant && (
              <div className="tunnel-body">
                <h2 className="t-title">{tunnelType==="entreprise"?"Parlez-nous de votre entreprise":"Votre profil d'apprentissage"}</h2>
                <p className="t-sub">{tunnelType==="entreprise"?"Nous personnalisons votre programme selon vos besoins.":"Quelques infos pour adapter votre parcours."}</p>
                <div className="tunnel-form">
                  <div className="tfield"><label>Nom complet *</label><input placeholder="Jean Kouamé" value={formData.nom} onChange={e=>setFormData(p=>({...p,nom:e.target.value}))} /></div>
                  <div className="tfield"><label>Email *</label><input type="email" placeholder="jean@exemple.com" value={formData.email} onChange={e=>setFormData(p=>({...p,email:e.target.value}))} /></div>
                  <div className="tfield"><label>Téléphone *</label><input placeholder="+225 07 00 00 00 00" value={formData.tel} onChange={e=>setFormData(p=>({...p,tel:e.target.value}))} /></div>
                  {tunnelType==="entreprise" && <>
                    <div className="tfield"><label>Société</label><input placeholder="Mon Entreprise SARL" value={formData.societe} onChange={e=>setFormData(p=>({...p,societe:e.target.value}))} /></div>
                    <div className="tfield"><label>Effectif à former</label>
                      <select value={formData.effectif} onChange={e=>setFormData(p=>({...p,effectif:e.target.value}))}>
                        <option value="">Sélectionner</option>
                        <option>1–5</option><option>6–20</option><option>21–50</option><option>50+</option>
                      </select>
                    </div>
                  </>}
                  <div className="tfield tfield--full"><label>Objectif</label>
                    <select value={formData.besoin} onChange={e=>setFormData(p=>({...p,besoin:e.target.value}))}>
                      <option value="">Choisir un objectif</option>
                      {tunnelType==="entreprise"
                        ? <><option>Communication interne</option><option>Certifications</option><option>Relation client internationale</option><option>Missions à l'étranger</option></>
                        : <><option>TOEIC / TOEFL / IELTS</option><option>Anglais professionnel</option><option>Études à l'étranger</option><option>Parler couramment</option></>}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── Étape 1 Enfant ── */}
            {tunnelStep === 1 && isEnfant && (
              <div className="tunnel-body">
                <h2 className="t-title">Informations sur l'enfant</h2>
                <p className="t-sub">Dites-nous en plus sur votre enfant pour adapter le parcours.</p>
                <div className="tunnel-form">
                  <div className="tfield"><label>Prénom de l'enfant *</label><input placeholder="Kouamé" value={enfantData.prenom_enfant} onChange={e=>setEnfantData(p=>({...p,prenom_enfant:e.target.value}))} /></div>
                  <div className="tfield"><label>Nom de l'enfant *</label><input placeholder="Diallo" value={enfantData.nom_enfant} onChange={e=>setEnfantData(p=>({...p,nom_enfant:e.target.value}))} /></div>
                  <div className="tfield tfield--full"><label>Tranche d'âge *</label>
                    <select value={enfantData.tranche_age} onChange={e=>setEnfantData(p=>({...p,tranche_age:e.target.value}))}>
                      <option value="">Sélectionner l'âge</option>
                      <option value="4-5">4 – 5 ans</option>
                      <option value="6-7">6 – 7 ans</option>
                      <option value="8-10">8 – 10 ans</option>
                      <option value="11-13">11 – 13 ans</option>
                      <option value="14-17">14 – 17 ans</option>
                    </select>
                  </div>
                </div>
                <div style={{marginTop:20, padding:"14px 16px", background:"#fef9ec", borderRadius:10, fontSize:".82rem", color:"#92400e", border:"1px solid #fde68a"}}>
                  🎓 Nos parcours enfants sont animés par des coachs spécialisés en pédagogie jeunesse, niveau A1 à B1.
                </div>
              </div>
            )}

            {/* ── Étape 2 : Choix du plan (particulier / entreprise) ── */}
            {tunnelStep === 2 && !isEnfant && (
              <div className="tunnel-body">
                <h2 className="t-title">Choisissez votre formule</h2>
                <p className="t-sub">Sans engagement. Changez ou annulez à tout moment.</p>
                <div className="plans-grid">
                  {plans.map(p => (
                    <div key={p.id} className={`plan-card ${p.popular?"plan-card--pop":""} ${selectedPlan===p.id?"plan-card--sel":""}`} onClick={()=>setSelectedPlan(p.id)}>
                      {p.popular && <div className="plan-badge"><IcoStar /> Populaire</div>}
                      <div className="plan-name">{p.label}</div>
                      <div className="plan-price"><span className="plan-amt">{p.price}</span><span className="plan-freq"> FCFA{p.freq}</span></div>
                      <ul className="plan-features">{p.features.map((f,i)=><li key={i}><IcoCheck />{f}</li>)}</ul>
                      <div className={`plan-radio ${selectedPlan===p.id?"checked":""}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Étape 2 Enfant : choix du centre ── */}
            {tunnelStep === 2 && isEnfant && (
              <div className="tunnel-body">
                <h2 className="t-title">Choisissez votre centre BET</h2>
                <p className="t-sub">Sélectionnez le cabinet le plus proche de vous.</p>
                <div className="centre-picker">
                  {betCenters.map(centre => (
                    <div
                      key={centre.key}
                      className={`centre-card ${enfantData.centre_key === centre.key ? "centre-card--sel" : ""}`}
                      onClick={() => { setEnfantData(p => ({...p, centre_key: centre.key})); setSelectedCommercial(""); }}
                    >
                      <div className="centre-card__visual" style={{ background: centre.color }}>
                        <span className="centre-card__icon">📍</span>
                      </div>
                      <div className="centre-card__body">
                        <div className="centre-card__name">{centre.name}</div>
                        {enfantData.centre_key === centre.key && (
                          <div className="centre-card__check"><IcoCheck /> Sélectionné</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Étape 3 Enfant : infos parent + conseiller du centre ── */}
            {tunnelStep === 3 && isEnfant && (
              <div className="tunnel-body">
                {selectedCentre && (
                  <div className="centre-recap" style={{ borderLeft: `4px solid ${selectedCentre.color}` }}>
                    📍 Centre sélectionné : <strong>{selectedCentre.name}</strong>
                  </div>
                )}
                <h2 className="t-title">Informations du parent</h2>
                <p className="t-sub">Ces données nous permettent de vous contacter pour le suivi de votre enfant.</p>
                <div className="tunnel-form">
                  <div className="tfield"><label>Votre nom complet *</label><input placeholder="Jean Kouamé" value={enfantData.nom_parent} onChange={e=>setEnfantData(p=>({...p,nom_parent:e.target.value}))} /></div>
                  <div className="tfield"><label>Email *</label><input type="email" placeholder="parent@exemple.com" value={enfantData.email_parent} onChange={e=>setEnfantData(p=>({...p,email_parent:e.target.value}))} /></div>
                  <div className="tfield"><label>Téléphone *</label><input placeholder="+225 07 00 00 00 00" value={enfantData.tel_parent} onChange={e=>setEnfantData(p=>({...p,tel_parent:e.target.value}))} /></div>
                  {centreCommerciaux.length > 0 && (
                    <div className="tfield tfield--full">
                      <label>Votre conseiller(ère) BET <span style={{fontWeight:400,color:"#94a3b8"}}>(optionnel)</span></label>
                      <p style={{fontSize:".8rem",color:"#64748b",margin:"4px 0 10px"}}>Conseillers disponibles au centre {selectedCentre?.name}.</p>
                      <div className="commercial-grid">
                        {centreCommerciaux.map(c => (
                          <div
                            key={c.id}
                            className={`commercial-card ${selectedCommercial===c.id?"commercial-card--sel":""}`}
                            onClick={() => setSelectedCommercial(p => p===c.id ? "" : c.id)}
                          >
                            <div className="commercial-av">{c.initiales || c.nom?.slice(0,2).toUpperCase()}</div>
                            <div className="commercial-info">
                              <div className="commercial-nom">{c.nom}</div>
                              <div className="commercial-role">{c.role}</div>
                            </div>
                            {selectedCommercial===c.id && <div className="commercial-check"><IcoCheck /></div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Étape 3 : Paiement (particulier / entreprise) ── */}
            {tunnelStep === 3 && !isEnfant && (
              <div className="tunnel-body">
                <h2 className="t-title">Paiement sécurisé</h2>
                <div className="order-summary">
                  <span>Plan :</span>
                  <strong>{plans.find(p=>p.id===selectedPlan)?.label} - {plans.find(p=>p.id===selectedPlan)?.price} FCFA{plans.find(p=>p.id===selectedPlan)?.freq}</strong>
                </div>
                <div className="pay-methods">
                  <button className={`pay-btn ${payMethod==="mobile"?"active":""}`} onClick={()=>setPayMethod("mobile")}><IcoPhone /> Mobile Money</button>
                  <button className={`pay-btn ${payMethod==="card"?"active":""}`} onClick={()=>setPayMethod("card")}><IcoCard /> Carte bancaire</button>
                </div>
                {payMethod==="mobile" && (
                  <div>
                    <div className="mobile-ops">
                      {[{id:"orange",label:"Orange Money",color:"#ff7900"},{id:"mtn",label:"MTN MoMo",color:"#ffcc00"},{id:"wave",label:"Wave",color:"#1fb6ff"},{id:"moov",label:"Moov Money",color:"#00a86b"}].map(op=>(
                        <button key={op.id} className={`mobile-op ${mobileOp===op.id?"active":""}`} style={{"--oc":op.color}} onClick={()=>setMobileOp(op.id)}>{op.label}</button>
                      ))}
                    </div>
                    {mobileOp && <div className="tfield" style={{marginTop:"1rem"}}>
                      <label>Numéro {mobileOp}</label>
                      <input placeholder="07 00 00 00 00" value={payData.numero} onChange={e=>setPayData(p=>({...p,numero:e.target.value.replace(/\D/g,"")}))} maxLength={10} />
                      <span className="tfield-hint">Vous recevrez une invite de paiement sur ce numéro.</span>
                    </div>}
                  </div>
                )}
                {payMethod==="card" && (
                  <div className="tunnel-form">
                    <div className="tfield tfield--full"><label>Titulaire</label><input placeholder="Jean Kouamé" value={payData.holder} onChange={e=>setPayData(p=>({...p,holder:e.target.value}))} /></div>
                    <div className="tfield tfield--full"><label>Numéro de carte</label><input placeholder="•••• •••• •••• ••••" value={payData.cardNum.replace(/(.{4})/g,"$1 ").trim()} onChange={e=>setPayData(p=>({...p,cardNum:e.target.value.replace(/\D/g,"")}))} maxLength={19} /></div>
                    <div className="tfield"><label>Expiration</label><input placeholder="MM/AA" value={payData.expiry} onChange={e=>setPayData(p=>({...p,expiry:e.target.value}))} maxLength={5} /></div>
                    <div className="tfield"><label>CVV</label><input placeholder="•••" type="password" value={payData.cvv} onChange={e=>setPayData(p=>({...p,cvv:e.target.value.replace(/\D/g,"")}))} maxLength={4} /></div>
                    <div className="card-note">🔒 SSL 256-bit - Visa & Mastercard acceptés</div>
                  </div>
                )}
              </div>
            )}

            {/* ── Confirmation enfant (étape 4) ── */}
            {tunnelStep === 4 && isEnfant && (
              <div className="tunnel-body tunnel-confirm">
                <div className="confirm-icon">🎉</div>
                <h2 className="t-title">Inscription enregistrée !</h2>
                <p className="t-sub">Un conseiller du centre <strong>{selectedCentre?.name}</strong> vous contactera sous <strong>24h</strong>.</p>
                <div className="confirm-summary">
                  <div><span>Enfant</span><strong>{enfantData.prenom_enfant} {enfantData.nom_enfant}</strong></div>
                  <div><span>Âge</span><strong>{enfantData.tranche_age} ans</strong></div>
                  <div><span>Centre</span><strong>{selectedCentre?.name}</strong></div>
                  <div><span>Contact parent</span><strong>{enfantData.email_parent}</strong></div>
                  {selectedCommercial && <div><span>Conseiller(ère)</span><strong>{centreCommerciaux.find(c=>c.id===selectedCommercial)?.nom}</strong></div>}
                </div>
                <button className="t-action-btn" onClick={()=>setTunnelOpen(false)}>
                  Fermer <IcoArrow />
                </button>
              </div>
            )}

            {/* ── Confirmation adulte (étape 4) ── */}
            {tunnelStep === 4 && !isEnfant && (
              <div className="tunnel-body tunnel-confirm">
                <div className="confirm-icon">🎉</div>
                <h2 className="t-title">Bienvenue chez Binnie's !</h2>
                <p className="t-sub">Un conseiller vous contactera sous <strong>24h</strong> pour finaliser votre accès.</p>
                <div className="confirm-summary">
                  <div><span>Plan</span><strong>{plans.find(p=>p.id===selectedPlan)?.label}</strong></div>
                  <div><span>Email</span><strong>{formData.email}</strong></div>
                  <div><span>Tél.</span><strong>{formData.tel}</strong></div>
                </div>
                <button className="t-action-btn" onClick={()=>{setTunnelOpen(false);navigate("/");}}>
                  Accéder à mon espace <IcoArrow />
                </button>
              </div>
            )}

            {tunnelStep < maxStep && (
              <div className="tunnel-footer" style={{ flexDirection:"column", gap:8 }}>
                {tunnelErreur && <p style={{ color:"#e93747", fontSize:"0.82rem", textAlign:"center", margin:0 }}>⚠ {tunnelErreur}</p>}
                <div style={{ display:"flex", justifyContent:"space-between", width:"100%" }}>
                  {tunnelStep > 1 && <button className="t-back-btn" onClick={()=>{ setTunnelStep(s=>s-1); setTunnelErreur(""); }}>← Retour</button>}
                  <button
                    className={`t-action-btn ${(tunnelStep===1&&!canGo1)||(tunnelStep===2&&!canGo2)||(tunnelStep===3&&!canGo3)||tunnelLoading?"t-disabled":""}`}
                    onClick={nextStep}
                    disabled={tunnelLoading}
                    style={{ opacity: tunnelLoading ? 0.7 : 1 }}
                  >
                    {tunnelLoading ? "Envoi…" : (!isEnfant && tunnelStep===3) ? "Confirmer & payer" : (isEnfant && tunnelStep===3) ? "Envoyer la demande" : "Continuer"} {!tunnelLoading && <IcoArrow />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL RECHERCHE (inchangée) */}
      {isSearchOpen && (
        <div className="search-overlay" onClick={closeSearch}>
          <div className="search-box" onClick={e=>e.stopPropagation()}>
            <button className="search-close" onClick={closeSearch}><IcoClose /></button>
            <form onSubmit={e=>{e.preventDefault();if(searchResults.length){navigate(searchResults[0].path);closeSearch();}}} className="search-form">
              <span className="s-ico"><IcoSearch /></span>
              <input ref={searchInputRef} type="text" placeholder="Que souhaitez-vous apprendre ?" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="search-input" />
              <button type="submit" className="search-submit">Rechercher</button>
            </form>
            <p className="sug-title">Tendances</p>
            <div className="topics-grid">
              {popularTopics.map((t,i)=><button key={i} className="topic-chip" onClick={()=>setSearchQuery(t)}>{t}</button>)}
            </div>
            {searchQuery.trim() && (
              <div className="search-results">
                <p className="sug-title">Résultats pour « {searchQuery} »</p>
                {searchResults.length ? (
                  <ul className="results-list">
                    {searchResults.map((item,i)=>(
                      <li key={i} className="result-item" onClick={()=>{navigate(item.path);closeSearch();}}>
                        <span className="result-type">{item.type}</span>
                        <span className="result-title">{item.title}</span>
                        <IcoArrow />
                      </li>
                    ))}
                  </ul>
                ) : <p className="no-results">Aucun résultat pour « {searchQuery} »</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CONNEXION AVEC NOTIFICATIONS */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={()=>setIsModalOpen(false)}>
          <div className="modal-split" onClick={e=>e.stopPropagation()}>
            <div className="modal-left">
              <div className="ml-brand">B<em>ET</em></div>
              <h2 className="ml-title">Apprenez l'anglais<br /><span>comme jamais</span></h2>
              <p className="ml-desc">Rejoignez +8 000 apprenants qui progressent chaque jour avec Binnie's English Training.</p>
              <div className="ml-stats">
                <div><strong>8 000+</strong><span>Apprenants</span></div>
                <div><strong>100%</strong><span>Satisfaction</span></div>
                <div><strong>6</strong><span>Centres physiques</span></div>
              </div>
              <div className="ml-testi">
                <p>"J'ai obtenu 850 au TOEIC après seulement 3 mois !"</p>
                <div className="testi-row">
                  <div className="testi-av">AK</div>
                  <div><strong>Awa Koné</strong><br /><small>Étudiante, Abidjan</small></div>
                </div>
              </div>
            </div>
            <div className="modal-right">
              <button className="mr-close" onClick={()=>setIsModalOpen(false)}><IcoClose /></button>
              <div className="auth-tabs">
                <button className={`tab-btn ${activeTab==="login"?"active":""}`} onClick={()=>setActiveTab("login")}>Connexion</button>
                <button className={`tab-btn ${activeTab==="register"?"active":""}`} onClick={()=>setActiveTab("register")}>Inscription</button>
              </div>

              {activeTab === "login" && (
                <div className="auth-form">
                  <p className="auth-welcome">Bon retour parmi nous 👋</p>
                  {loginError && <div className="notification error">{loginError}</div>}
                  {loginSuccess && <div className="notification success">{loginSuccess}</div>}
                  <div className="tfield">
                    <label><IcoMail /> Email</label>
                    <input type="email" placeholder="jean@exemple.com" value={loginData.email} onChange={e=>setLoginData(p=>({...p,email:e.target.value}))} />
                  </div>
                  <div className="tfield">
                    <label><IcoLock /> Mot de passe</label>
                    <div className="pwd-wrap">
                      <input type={showPwd?"text":"password"} placeholder="••••••••" value={loginData.password} onChange={e=>setLoginData(p=>({...p,password:e.target.value}))} />
                      <button type="button" className="pwd-toggle" onClick={()=>setShowPwd(s=>!s)}>{showPwd?<IcoEyeOff />:<IcoEye />}</button>
                    </div>
                  </div>
                  <div className="auth-row">
                    <label className="check-lbl"><input type="checkbox" name="rememberMe" /> Se souvenir</label>
                    <button type="button" className="forgot-lnk">Mot de passe oublié ?</button>
                  </div>
                  <button className="auth-submit" onClick={handleLogin}>Se connecter</button>
                  <div className="auth-divider"><span>ou continuer avec</span></div>
                  <div className="social-row">
                    <button className="social-btn" onClick={handleGoogleSignIn} style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                      <IcoGoogle /> Continuer avec Google
                    </button>
                  </div>
                  <p className="auth-switch">Pas encore de compte ? <button type="button" className="auth-switch-lnk" onClick={()=>setActiveTab("register")}>S'inscrire gratuitement</button></p>
                </div>
              )}

              {activeTab === "register" && (
                <div className="auth-form">
                  <p className="auth-welcome">Créez votre compte gratuit 🚀</p>
                  {registerError && <div className="notification error">{registerError}</div>}
                  {registerSuccess && <div className="notification success">{registerSuccess}</div>}
                  <div className="tfield"><label>Nom complet</label><input type="text" placeholder="Jean Kouamé" value={regData.name} onChange={e=>setRegData(p=>({...p,name:e.target.value}))} /></div>
                  <div className="tfield"><label>Email</label><input type="email" placeholder="jean@exemple.com" value={regData.email} onChange={e=>setRegData(p=>({...p,email:e.target.value}))} /></div>
                  <div className="tfield"><label>Téléphone</label><input type="tel" placeholder="+225 07 00 00 00 00" value={regData.tel} onChange={e=>setRegData(p=>({...p,tel:e.target.value}))} /></div>
                  <div className="tfield">
                    <label>Mot de passe</label>
                    <div className="pwd-wrap">
                      <input type={showPwd?"text":"password"} placeholder="8 caractères minimum" value={regData.password} onChange={e=>setRegData(p=>({...p,password:e.target.value}))} />
                      <button type="button" className="pwd-toggle" onClick={()=>setShowPwd(s=>!s)}>{showPwd?<IcoEyeOff />:<IcoEye />}</button>
                    </div>
                  </div>
                  <button className="auth-submit" onClick={handleRegister}>Créer mon compte</button>
                  <div className="auth-divider"><span>ou s'inscrire avec</span></div>
                  <div className="social-row">
                    <button className="social-btn" onClick={handleGoogleSignIn} style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                      <IcoGoogle /> S'inscrire avec Google
                    </button>
                  </div>
                  <p className="auth-switch">Déjà un compte ? <button type="button" className="auth-switch-lnk" onClick={()=>setActiveTab("login")}>Se connecter</button></p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL NOS CENTRES ══════════════════════════════════ */}
      {showCentresModal && (
        <div className="centres-overlay" onClick={() => setShowCentresModal(false)}>
          <div className="centres-modal" onClick={e => e.stopPropagation()}>

            {/* En-tête */}
            <div className="centres-hdr">
              <div>
                <div className="centres-hdr__title">📍 Nos Centres BET</div>
                <div className="centres-hdr__sub">{centresSorted.length} centre{centresSorted.length > 1 ? "s" : ""} physique{centresSorted.length > 1 ? "s" : ""} · cours en ligne disponibles</div>
              </div>
              <button className="centres-hdr__close" onClick={() => setShowCentresModal(false)}><IcoClose /></button>
            </div>

            {/* Tabs */}
            <div className="centres-tabs">
              <button className={`ctab ${centresTab === "physique" ? "ctab--on" : ""}`} onClick={() => setCentresTab("physique")}>
                🏢 Centres physiques <span className="ctab-badge">{centresSorted.length}</span>
              </button>
              <button className={`ctab`} onClick={() => { setShowCentresModal(false); setShowCentresLigneModal(true); }}>
                💻 Centres virtuels
              </button>
            </div>

            <div className="centres-body">
              {/* ── Tab : centres physiques ── */}
              {centresTab === "physique" && (
                <>
                  {/* Carte OSM */}
                  <div className="centres-map-wrap">
                    <iframe
                      title="Carte Centres BET"
                      src="https://www.openstreetmap.org/export/embed.html?bbox=-4.25%2C5.18%2C-3.72%2C5.5&layer=mapnik"
                      style={{ width:"100%", height:"100%", border:0 }}
                      loading="lazy"
                    />
                    <div className="centres-map-pins">
                      {centresSorted.filter(c => c.key !== "bouake").map(c => (
                        <div key={c.key} className="map-pin" style={{ background: c.color }} title={c.name}>
                          📍
                        </div>
                      ))}
                    </div>
                    <a
                      href="https://www.google.com/maps/search/BET+Binnie+English+Training+Abidjan"
                      target="_blank" rel="noopener noreferrer"
                      className="centres-map-link"
                    >
                      Ouvrir dans Google Maps →
                    </a>
                  </div>

                  {/* Bouton géoloc */}
                  <button
                    className={`geo-btn ${geoLoading ? "geo-btn--loading" : ""} ${userCoords ? "geo-btn--done" : ""}`}
                    onClick={handleGeolocate}
                    disabled={geoLoading}
                  >
                    {geoLoading
                      ? <><span className="geo-spin" />Localisation…</>
                      : userCoords
                        ? <>✓ Centres triés par distance</>
                        : <>📍 Trouver le centre le plus proche</>}
                  </button>

                  {/* Grille centres */}
                  <div className="centres-grid">
                    {centresSorted.map((c, i) => {
                      const betC = betCenters.find(b => b.key === c.key);
                      const dist = userCoords ? hdist(userCoords.lat, userCoords.lng, c.lat, c.lng) : null;
                      const isNearest = userCoords && i === 0;
                      return (
                        <div key={c.key} className={`ccard ${isNearest ? "ccard--nearest" : ""}`} style={{ borderTopColor: c.color }}>
                          {isNearest && <div className="ccard-nearest-badge">⭐ Le plus proche</div>}
                          <div className="ccard__icon" style={{ background: c.color + "22", color: c.color }}>📍</div>
                          <div className="ccard__name">{c.name}</div>
                          <div className="ccard__addr">{c.addr}</div>
                          {dist !== null && (
                            <div className="ccard__dist" style={{ color: c.color }}>
                              ~{dist < 1 ? `${Math.round(dist*1000)} m` : `${dist.toFixed(1)} km`}
                            </div>
                          )}
                          <div className="ccard__actions">
                            <button
                              className="ccard__btn ccard__btn--contact"
                              style={{ background: c.color }}
                              onClick={() => { setShowCentresModal(false); if (betC) handleCentreClick(betC); }}
                            >
                              💬 Contacter
                            </button>
                            <a
                              className="ccard__btn ccard__btn--maps"
                              href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`}
                              target="_blank" rel="noopener noreferrer"
                            >
                              🗺 Itinéraire
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NOS OFFRES ────────────────────────────────── */}
      {showOffresModal && (
        <div className="tunnel-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowOffresModal(false); setOffresSelected(null); } }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"#fff", borderRadius:24, width:"100%", maxWidth:980,
            maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,.25)",
            display:"flex", flexDirection:"column", animation:"slideUp .28s ease",
          }}>

            {/* Header */}
            <div style={{
              background:"linear-gradient(135deg,#3b0000 0%,#7c0a0a 18%,#011451 40%,#0c33ac 72%,#1a4fd6 100%)",
              borderRadius:"24px 24px 0 0", padding:"22px 28px",
              display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0,
            }}>
              <div>
                {offresSelected
                  ? <button onClick={() => setOffresSelected(null)} style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
                      ← Toutes les offres
                    </button>
                  : <div>
                      <div style={{ color:"#fff", fontWeight:800, fontSize:"1.15rem" }}>Nos offres</div>
                      <div style={{ color:"rgba(255,255,255,.65)", fontSize:".82rem", marginTop:2 }}>Choisissez l'offre qui vous correspond</div>
                    </div>
                }
              </div>
              <button onClick={() => { setShowOffresModal(false); setOffresSelected(null); }} style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff", width:34, height:34, borderRadius:"50%", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>

            {/* ── Vue grille ── */}
            {!offresSelected && (
              <div className="offres-grid" style={{ padding:"28px 28px 32px", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
                {OFFRES_DATA.map(offre => {
                  const dyn = offre.key==="interpretariat" ? dynInterp : offre.key==="traduction" ? dynTrad : null;
                  const o = dyn ? { ...offre, description:dyn.description||offre.description, tagline:dyn.tagline||offre.tagline, plans:dyn.plans||offre.plans } : offre;
                  return (
                  <button key={o.key} onClick={(e) => { e.stopPropagation(); setOffresSelected(o.key); }}
                    style={{
                      background:o.bg, border:`2px solid ${o.couleur}22`,
                      borderRadius:16, padding:"22px 18px", cursor:"pointer", textAlign:"left",
                      transition:"all .22s ease", display:"flex", flexDirection:"column", gap:10,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform="translateY(-4px)"; e.currentTarget.style.boxShadow=`0 12px 32px ${o.couleur}28`; e.currentTarget.style.borderColor=o.couleur; }}
                    onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="none"; e.currentTarget.style.borderColor=`${o.couleur}22`; }}
                  >
                    <div style={{ width:48, height:48, borderRadius:12, background:`${o.couleur}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>{o.emoji}</div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:"1rem", color:"#011451", marginBottom:4 }}>{o.titre}</div>
                      <div style={{ fontSize:".78rem", color:o.couleur, fontWeight:600 }}>{o.tagline}</div>
                    </div>
                    <div style={{ fontSize:".8rem", color:"#475569", lineHeight:1.5 }}>{o.description.slice(0,90)}…</div>
                    <div style={{ marginTop:"auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:".75rem", background:`${o.couleur}18`, color:o.couleur, borderRadius:20, padding:"3px 10px", fontWeight:700 }}>{o.plans.length} formules</span>
                      <span style={{ color:o.couleur, fontWeight:800, fontSize:".82rem" }}>Voir →</span>
                    </div>
                  </button>
                  );
                })}
              </div>
            )}

            {/* ── Vue détail ── */}
            {offresSelected && (() => {
              const base = OFFRES_DATA.find(o => o.key === offresSelected);
              if (!base) return null;
              const dyn = base.key==="interpretariat" ? dynInterp : base.key==="traduction" ? dynTrad : null;
              let offre = dyn ? { ...base, description:dyn.description||base.description, tagline:dyn.tagline||base.tagline, details:dyn.details||base.details, plans:dyn.plans||base.plans } : base;

              // Injecter les prix dynamiques des certifications depuis la config SuperAdmin
              if (base.key === "certifications" && dynCertif) {
                offre = { ...offre, plans: offre.plans.map(p => {
                  const k = p.nom.toLowerCase().includes("toeic") ? "toeic"
                           : p.nom.toLowerCase().includes("ielts") ? "ielts"
                           : p.nom.toLowerCase().includes("toefl") ? "toefl" : null;
                  const dp = k && dynCertif[k]?.price;
                  return dp ? { ...p, prix: dp } : p;
                })};
              }

              // Injecter le prix de départ des cours en ligne / domicile depuis la config SuperAdmin
              if (base.key === "adultes") {
                const prixEnLigne  = (dynOffresEnLigne  ||[]).filter(o=>o.actif!==false)[0]?.prix || null;
                const prixDomicile = (dynOffresDomicile ||[]).filter(o=>o.actif!==false)[0]?.prix || null;
                offre = { ...offre, plans: offre.plans.map(p => {
                  if (p.to === "/cours/en-ligne"  && prixEnLigne)  return { ...p, prix: prixEnLigne };
                  if (p.to === "/cours/domicile"  && prixDomicile) return { ...p, prix: prixDomicile };
                  return p;
                })};
              }
              return (
                <div style={{ padding:"0 0 28px", display:"flex", flexDirection:"column", gap:20 }}>

                  {/* En-tête offre - gradient rouge → bleu */}
                  <div style={{
                    display:"flex", alignItems:"center", gap:14,
                    background:"linear-gradient(135deg,#3b0000 0%,#7c0a0a 20%,#011451 55%,#0c33ac 100%)",
                    padding:"22px 28px", borderRadius:0,
                  }}>
                    <div style={{ width:58, height:58, borderRadius:14, background:"rgba(255,255,255,.15)", border:"2px solid rgba(255,255,255,.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, flexShrink:0 }}>{offre.emoji}</div>
                    <div>
                      <h2 style={{ margin:0, fontSize:"1.2rem", fontWeight:900, color:"#fff" }}>{offre.titre}</h2>
                      <p style={{ margin:"4px 0 0", fontSize:".83rem", color:"rgba(255,255,255,.8)", fontWeight:600 }}>{offre.tagline}</p>
                    </div>
                  </div>

                  <div style={{ padding:"0 28px", display:"flex", flexDirection:"column", gap:20 }}>

                  {/* Cartes formules cliquables */}
                  <div>
                    <h3 style={{ margin:"0 0 12px", fontSize:".82rem", fontWeight:800, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em" }}>Nos formules</h3>
                    <style>{`
                      @media (max-width: 640px) {
                        .offre-plans-grid { grid-template-columns: 1fr !important; }
                      }
                    `}</style>
                    <div className="offre-plans-grid" style={{ display:"grid", gridTemplateColumns:`repeat(${offre.plans.length}, 1fr)`, gap:12 }}>
                      {offre.plans.map((p,i) => {
                        const cardStyle = {
                          borderRadius:14, padding:"18px 16px", cursor:"pointer",
                          border:`2px solid ${p.popular ? offre.couleur : "#e2e8f0"}`,
                          background: p.popular ? `${offre.couleur}0a` : "#fff",
                          position:"relative", display:"flex", flexDirection:"column", gap:8,
                          boxShadow: p.popular ? `0 4px 18px ${offre.couleur}22` : "none",
                          transition:"all .18s ease", height:"100%",
                        };
                        const cardContent = (
                          <>
                            {p.popular && (
                              <span style={{ position:"absolute", top:-11, left:"50%", transform:"translateX(-50%)", background:offre.couleur, color:"#fff", fontSize:".63rem", fontWeight:800, borderRadius:20, padding:"3px 12px", whiteSpace:"nowrap" }}>⭐ Populaire</span>
                            )}
                            <div style={{ fontSize:24 }}>{p.emoji}</div>
                            <div style={{ fontWeight:800, fontSize:".92rem", color:"#011451" }}>{p.nom}</div>
                            <div style={{ fontSize:".85rem", fontWeight:700, color:offre.couleur }}>{p.prix}</div>
                            <div style={{ fontSize:".73rem", color:"#64748b", lineHeight:1.4, flex:1 }}>{p.detail}</div>
                            <div style={{ fontSize:".75rem", fontWeight:700, color:offre.couleur, marginTop:4 }}>Voir →</div>
                          </>
                        );
                        // Certaines cartes ouvrent directement la vraie modale connectée à
                        // TouchPoint (au lieu de naviguer vers /parcours/particulier, page non
                        // utilisée) - repérées par un préfixe "@" plutôt qu'un vrai chemin.
                        if (p.to?.startsWith("@")) {
                          return (
                            <div key={i} onClick={() => { setShowOffresModal(false); setOffresSelected(null); openParcoursSentinel(p.to); }}
                              onMouseEnter={e => { e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=`0 8px 24px ${offre.couleur}30`; e.currentTarget.style.borderColor=offre.couleur; }}
                              onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=p.popular?`0 4px 18px ${offre.couleur}22`:"none"; e.currentTarget.style.borderColor=p.popular?offre.couleur:"#e2e8f0"; }}
                              style={cardStyle}
                            >
                              {cardContent}
                            </div>
                          );
                        }
                        return (
                          <NavLink key={i} to={p.to} onClick={() => { setShowOffresModal(false); setOffresSelected(null); }}
                            style={{ textDecoration:"none" }}
                          >
                            <div
                              style={cardStyle}
                              onMouseEnter={e => { e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=`0 8px 24px ${offre.couleur}30`; e.currentTarget.style.borderColor=offre.couleur; }}
                              onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow=p.popular?`0 4px 18px ${offre.couleur}22`:"none"; e.currentTarget.style.borderColor=p.popular?offre.couleur:"#e2e8f0"; }}
                            >
                              {cardContent}
                            </div>
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>

                  {/* CTAs */}
                  <div style={{ display:"flex", gap:10 }}>
                    {offre.ctas.map((cta,i) => {
                      const ctaStyle = {
                        flex:1, display:"block", textAlign:"center", padding:"11px 16px",
                        borderRadius:10, fontWeight:700, fontSize:".88rem", textDecoration:"none",
                        background: cta.primary ? offre.couleur : "transparent",
                        color: cta.primary ? "#fff" : offre.couleur,
                        border:`2px solid ${offre.couleur}`,
                        transition:"opacity .2s", cursor:"pointer",
                      };
                      if (cta.to?.startsWith("@")) {
                        return (
                          <button key={i} onClick={() => { setShowOffresModal(false); setOffresSelected(null); openParcoursSentinel(cta.to); }} style={ctaStyle}>
                            {cta.label}
                          </button>
                        );
                      }
                      return (
                        <NavLink key={i} to={cta.to} onClick={() => { setShowOffresModal(false); setOffresSelected(null); }} style={ctaStyle}>
                          {cta.label}
                        </NavLink>
                      );
                    })}
                  </div>
                  </div>
                </div>
              );
            })()}

            {/* Footer */}
            {!offresSelected && (
              <div style={{ borderTop:"1px solid #f1f5f9", padding:"14px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fafafa", borderRadius:"0 0 24px 24px", flexShrink:0 }}>
                <span style={{ fontSize:".8rem", color:"#9ca3af" }}>Besoin d'aide pour choisir ?</span>
                <button onClick={() => { setShowOffresModal(false); setOffresSelected(null); handleConseillerClick(); }}
                  style={{ fontSize:".82rem", fontWeight:700, color:"#0c33ac", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  Parler à un conseiller →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL CONSEILLERS (Nos offres → Parler à un conseiller) ── */}
      {showConseillerModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowConseillerModal(false); }} className="modal-overlay-mq"
          style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:580, boxShadow:"0 24px 60px rgba(0,0,0,.25)", overflow:"hidden" }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"18px 24px", borderBottom:"3px solid #25d366" }}>
              <span style={{ fontSize:"1.4rem" }}>💬</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:"1rem", color:"#011451" }}>Parler à un conseiller</div>
                <div style={{ fontSize:".78rem", color:"#64748b", marginTop:2 }}>Choisissez une assistante - réponse rapide sur WhatsApp</div>
              </div>
              <button onClick={() => setShowConseillerModal(false)}
                style={{ width:30, height:30, borderRadius:8, border:"none", background:"#f1f5f9", cursor:"pointer", fontSize:16, color:"#64748b" }}>✕</button>
            </div>
            {/* Corps - grille de cartes */}
            <div style={{ padding:"16px 20px", maxHeight:400, overflowY:"auto" }}>
              {loadingConseillers ? (
                <div style={{ textAlign:"center", padding:"32px 0", color:"#64748b", fontSize:".84rem" }}>
                  <div style={{ width:28, height:28, border:"3px solid #e2e8f0", borderTopColor:"#25d366", borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 10px" }} />
                  Chargement des conseillers…
                </div>
              ) : conseillerList.length === 0 ? (
                <div style={{ textAlign:"center", padding:"32px 0", color:"#94a3b8", fontSize:".85rem" }}>
                  😔 Aucun conseiller disponible pour le moment.<br />
                  <a href="/contact" onClick={() => setShowConseillerModal(false)} style={{ color:"#0c33ac", fontWeight:700 }}>Envoyer un message →</a>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                  {conseillerList.map((a, i) => {
                    const phone = (a.telephone || "").replace(/\D/g, "");
                    const msg = encodeURIComponent(`Bonjour ${a.prenom || ""}${a.nom ? " "+a.nom : ""}, je souhaite avoir des informations sur les formations BET.`);
                    const ini = `${a.prenom?.[0]||""}${a.nom?.[0]||""}`.toUpperCase() || "A";
                    const wa = phone ? `https://wa.me/${phone}?text=${msg}` : null;
                    return (
                      <div key={a.id || i}
                        style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, border:"2px solid #e2e8f0", borderRadius:18, padding:"20px 14px 16px", cursor:"pointer", transition:"all .22s", background:"#fff", textAlign:"center" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor="#25d366"; e.currentTarget.style.boxShadow="0 6px 20px rgba(37,211,102,.15)"; e.currentTarget.style.transform="translateY(-3px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="none"; }}>
                        {/* Photo + dot disponibilité */}
                        <div style={{ position:"relative" }}>
                          {a.photo_url
                            ? <img src={a.photo_url} alt={a.prenom} style={{ width:72, height:72, borderRadius:"50%", objectFit:"cover", flexShrink:0, border:"2.5px solid #e2e8f0" }} />
                            : <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#0c33ac,#0891b2)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"1.1rem", flexShrink:0 }}>{ini}</div>
                          }
                          <span style={{ position:"absolute", bottom:0, right:0, width:16, height:16, borderRadius:"50%", background:"#22c55e", border:"2.5px solid #fff" }} />
                        </div>
                        {/* Nom + rôle */}
                        <div>
                          <div style={{ fontWeight:800, fontSize:".88rem", color:"#011451", lineHeight:1.3 }}>{a.prenom} {a.nom}</div>
                          <div style={{ fontSize:".68rem", color:"#94a3b8", marginTop:3 }}>Assistante · Commerciale</div>
                        </div>
                        {/* Téléphone */}
                        {a.telephone && (
                          <div style={{ fontSize:".72rem", color:"#334155", fontWeight:600 }}>📞 {a.telephone}</div>
                        )}
                        {/* Bouton WhatsApp */}
                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer"
                            onClick={() => setShowConseillerModal(false)}
                            style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:5, width:"100%", padding:"8px 0", background:"#25d366", color:"#fff", borderRadius:999, textDecoration:"none", fontWeight:700, fontSize:".74rem", marginTop:"auto" }}>
                            💬 WhatsApp
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding:"12px 20px", borderTop:"1px solid #f1f5f9", background:"#f8fafc", fontSize:".75rem", color:"#94a3b8" }}>
              💬 Message pré-rempli envoyé automatiquement à l'assistante choisie.
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PARCOURS PARTICULIER ──────────────────────── */}
      <ParcoursModal
        isOpen={showParcoursModal}
        onClose={() => setShowParcoursModal(false)}
        user={user}
        defaultMode={parcoursDefaultMode}
      />

      {/* ── MODAL PARCOURS ENTREPRISE ───────────────────────── */}
      <EntrepriseParcoursModal
        isOpen={showEntrepriseModal}
        onClose={() => setShowEntrepriseModal(false)}
      />

      {/* ── MODAL PARCOURS ENFANT ───────────────────────────── */}
      <EnfantParcoursModal
        isOpen={showEnfantModal}
        onClose={() => setShowEnfantModal(false)}
      />

      {/* ── MODAL CENTRES EN LIGNE ──────────────────────────── */}
      <CentresEnLigneModal
        isOpen={showCentresLigneModal}
        onClose={() => setShowCentresLigneModal(false)}
        onSelectAssistante={(assistante, centre) => {
          setShowCentresLigneModal(false);
          setParcoursDefaultMode("en_ligne");
          setShowParcoursModal(true);
        }}
      />

      {/* ── MODAL CENTRE BET ────────────────────────────────── */}
      {centerModal && (
        <div
          className="center-modal-overlay"
          onClick={() => setCenterModal(null)}
        >
          <div
            className="center-modal"
            onClick={e => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="center-modal__header" style={{ borderBottom: `3px solid ${centerModal.color}` }}>
              <div className="center-modal__title">
                <span className="center-modal__icon" style={{ background: `${centerModal.color}22`, color: centerModal.color }}>📍</span>
                <div>
                  <div className="center-modal__name">BET {centerModal.name}</div>
                  <div className="center-modal__sub">Choisissez une assistante pour démarrer la conversation</div>
                </div>
              </div>
              <button className="center-modal__close" onClick={() => setCenterModal(null)} aria-label="Fermer">
                <IcoClose />
              </button>
            </div>

            {/* Boutons WhatsApp - assistantes réelles depuis la BDD */}
            <div className="center-modal__body">
              {loadingModalAssistantes ? (
                <div style={{ textAlign:"center", padding:"24px 0", color:"#64748b", fontSize:".84rem" }}>
                  <div style={{ width:28, height:28, border:"3px solid #e2e8f0", borderTopColor:"#25d366", borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 10px" }} />
                  Chargement des assistantes…
                </div>
              ) : modalAssistantes.length === 0 ? (
                <div style={{ textAlign:"center", padding:"24px 0", color:"#94a3b8", fontSize:".85rem" }}>
                  😔 Aucune assistante disponible pour ce centre.<br />
                  <span style={{ fontSize:".78rem" }}>Contactez-nous directement au centre.</span>
                </div>
              ) : (
                modalAssistantes.map((a, i) => {
                  const phoneRaw  = (a.telephone || "").replace(/[\s+\-()]/g, "");
                  const waMessage = encodeURIComponent(
                    `Bonjour ${a.prenom || ""}${a.nom ? " " + a.nom : ""}, je souhaite avoir des informations sur les cours d'anglais chez BET ${centerModal.name}.`
                  );
                  const ini = `${a.prenom?.[0] || ""}${a.nom?.[0] || ""}`.toUpperCase() || "A";
                  return (
                    <a
                      key={a.id || i}
                      href={phoneRaw ? `https://wa.me/${phoneRaw}?text=${waMessage}` : "#"}
                      target={phoneRaw ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="center-modal__wa-btn"
                      style={!phoneRaw ? { opacity:.5, pointerEvents:"none" } : {}}
                      onClick={(e) => { if (!phoneRaw) e.preventDefault(); else setCenterModal(null); }}
                    >
                      <span className="center-modal__wa-icon">
                        {a.photo_url ? (
                          <img src={a.photo_url} alt={a.prenom} style={{ width:40, height:40, borderRadius:"50%", objectFit:"cover" }} />
                        ) : (
                          <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#0c33ac,#0891b2)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:".88rem", flexShrink:0 }}>{ini}</div>
                        )}
                      </span>
                      <div className="center-modal__wa-info">
                        <span className="center-modal__wa-name">{a.prenom} {a.nom}</span>
                        <span className="center-modal__wa-phone">
                          {a.telephone || <em style={{ color:"#94a3b8" }}>Numéro non renseigné</em>}
                        </span>
                        {Array.isArray(a.jours_travail) && a.jours_travail.length > 0 && (
                          <span style={{ fontSize:".68rem", color:"#0891b2", marginTop:2, fontWeight:600, display:"block" }}>📅 {formatJoursTravail(a.jours_travail)}</span>
                        )}
                      </div>
                      <span className="center-modal__wa-cta">
                        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                          <circle cx="16" cy="16" r="16" fill="#25d366"/>
                          <path d="M23.5 19.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4-.1-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.3 4.7 2 .9 2.7.9 3.7.8.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" fill="#fff"/>
                        </svg>
                        <span style={{ fontSize:".72rem", display:"block", marginTop:2 }}>WhatsApp</span>
                      </span>
                    </a>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="center-modal__footer">
              💬 Message pré-rempli : <em>« Bonjour, je souhaite avoir des informations sur les cours d'anglais chez BET {centerModal.name}. »</em>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Navbar;