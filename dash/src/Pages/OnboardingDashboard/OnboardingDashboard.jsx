// src/Pages/OnboardingDashboard/OnboardingDashboard.jsx
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { chargerFilieresCatalogue } from "../../utils/catalogueOffres";
import * as XLSX from "xlsx";
import { clearAllSessionStorage } from "../../utils/session";
import { useLivePermissions } from "../../utils/permissions";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import NotificationsTab from "../../Components/NotificationsTab";
import NotificationBell from "../../Components/NotificationBell";
import BarreFiltres, { RangeePastilles } from "../../Components/BarreFiltres";
import MessagerieTab from "../../Components/MessagerieTab";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import ChampPhotoClasse from "../../Components/ChampPhotoClasse";
import ChampTarifMigration from "../../Components/ChampTarifMigration";
import PastilleGroupe from "../../Components/PastilleGroupe";
import PhotoClasseEntete from "../../Components/PhotoClasseEntete";
import { iconeEtTexteTypeCours } from "../../utils/typeCours";
import ArchiveTab, { ArchiveModal } from "../../Components/ArchiveTab";
import { useLanguage } from "../../contexts/LanguageContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useTabState } from "../../hooks/useTabState";
import FooterSaaS from "../../Components/FooterSaaS";
import { assombrirCouleur } from "../../utils/couleurs";
import { lancerImport, ouvrirImport, annulerImport, compterResultats, listerImports, lignesDeLImport, peutEtreAnnule, peutEtreRelance, FENETRE_ANNULATION_HEURES,
  supprimerImport, peutEtreEfface, marquerImportRepris, STATUT_IMPORT } from "../../utils/importEnMasse";
import { useNotifications } from "../../hooks/useNotifications";
import { useFirebaseChat } from "../../hooks/useFirebaseChat";
import { openElearningSSO } from "../../utils/ssoElearning";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";
import { libelleMoisSolde } from "../../utils/moisDuVersement";
import { dureeReelleMin, dureePrevueMin } from "../../Components/DerouleReel";
import PlanningSeances, { usePlanningSeances } from "../../Components/PlanningSeances";
import ChatGroupe from "../../Components/ChatGroupe";
import GroupesLibres from "../../Components/GroupesLibres";
import BadgeCategorieCoach from "../../Components/BadgeCategorieCoach";
import ModifierEmailApprenant from "../../Components/ModifierEmailApprenant";
import IdentifiantConnexion from "../../Components/IdentifiantConnexion";
import { useGroupesChatUnreadTotal, useGroupesLibresNonLus } from "../../hooks/useGroupeChat";

import { uploadFichier, libelleLimite } from "../../utils/uploadFichier";
import VisionneuseImage from "../../Components/VisionneuseImage";
import { genererPDF, fmtDatePDF } from "../../utils/genererPDF";
import { estClassePrivee } from "../../utils/classePrivee";
import FileDemandesTransfert, { useCompteDemandesTransfert, BoutonDemandeTransfert, BoutonMigrationCanal } from "../../Components/DemandeTransfert";
import { AncienNiveau } from "../../Components/NiveauApprenant";
import EvolutionNiveauTests from "../../Components/EvolutionNiveauTests";
import HistoriqueTestsNiveau from "../../Components/HistoriqueTestsNiveau";
import SelecteurAssistante from "../../Components/SelecteurAssistante";
import { exporterFicheApprenantPDF, ligneInfo } from "../../utils/fichePdfApprenant";
const ELEARNING_URL = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";

/* ═══════════════════════════════════════════════════════
   CHARTE BET ONBOARDING
═══════════════════════════════════════════════════════ */
const _C0     = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur||"#7c3aed"; } catch { return "#7c3aed"; } })();
const C       = _C0;
const C_DARK  = _C0;
const C_LIGHT = _C0 + "18";
const C_GRAD  = `linear-gradient(135deg,#0f172a 0%,${assombrirCouleur(C)} 100%)`;

/* ═══════════════════════════════════════════════════════
   COMPOSANTS
═══════════════════════════════════════════════════════ */
const Modal = ({ title, onClose, children, headerExtra }) => (
  <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
    <div style={{ background:"#fff",borderRadius:16,width:"90vw",height:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,0.25)" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid #e5e7eb",flexShrink:0,gap:10 }}>
        <h3 style={{ margin:0,fontSize:15,fontWeight:800,color:"#0f172a",flex:1 }}>{title}</h3>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          {headerExtra}
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#6b7280" }}>✕</button>
        </div>
      </div>
      <div style={{ padding:"20px 24px",overflowY:"auto",flex:1 }}>{children}</div>
    </div>
  </div>
);

const Badge = ({ label, color, bg }) => (
  <span style={{ display:"inline-block",padding:"2px 9px",borderRadius:99,fontSize:10,fontWeight:700,color,background:bg,whiteSpace:"nowrap" }}>{label}</span>
);

const KpiCard = ({ icon, label, value, color, sub, onClick }) => (
  <div onClick={onClick} style={{ background:"#fff",borderRadius:12,padding:"16px 18px",border:"1px solid #f1f5f9",boxShadow:"0 1px 6px rgba(0,0,0,0.05)",display:"flex",alignItems:"center",gap:14,cursor:onClick?"pointer":"default" }}>
    <div style={{ width:46,height:46,borderRadius:10,background:color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>{icon}</div>
    <div>
      <div style={{ fontSize:11,color:"#9ca3af" }}>{label}</div>
      <div style={{ fontSize:22,fontWeight:900,color,lineHeight:1.1 }}>{value}</div>
      {sub&&<div style={{ fontSize:11,color:"#9ca3af",marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);

const Checkbox = ({ checked, onChange, label }) => (
  <label style={{ display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:checked?"#6b7280":"#0f172a",textDecoration:checked?"line-through":"none" }}>
    <div onClick={onChange} style={{ width:18,height:18,borderRadius:4,border:`2px solid ${checked?"#22c55e":"#d1d5db"}`,background:checked?"#22c55e":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer" }}>
      {checked&&<span style={{ color:"#fff",fontSize:11,fontWeight:800 }}>✓</span>}
    </div>
    {label}
  </label>
);

const fmtHoraire = (h) => {
  if (!h) return "";
  if (typeof h === "string") return h;
  if (typeof h === "object") return `${h.jour||""} ${h.debut||""}${h.fin?"–"+h.fin:""}`.trim();
  return String(h);
};

/* ── Création de groupe - même modèle que "Nouvelle classe" côté assistante présentiel
   (CommercialDashboard.jsx) : cartes coach avec disponibilités réelles du mois plutôt
   qu'un simple select. ── */
const TYPE_COURS_GRP = [
  { id:"presentiel", label:"Présentiel 🏢" },
  { id:"en_ligne",   label:"En ligne 🌐" },
  { id:"hybride",    label:"Hybride ⚡" },
];
const MOIS_LABELS_DISPO = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const JOURS_ORDRE_DISPO = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const getPeriodesDispo = () => {
  const now = new Date();
  const courant = { mois: now.getMonth() + 1, annee: now.getFullYear() };
  const suivant = courant.mois === 12 ? { mois: 1, annee: courant.annee + 1 } : { mois: courant.mois + 1, annee: courant.annee };
  return { courant, suivant };
};
const formatDispoSlots = (slots) => {
  if (!slots || slots.length === 0) return [];
  const parJour = {};
  slots.forEach(s => { (parJour[s.jour] = parJour[s.jour] || []).push(s); });
  return JOURS_ORDRE_DISPO
    .filter(j => parJour[j]?.length)
    .map(j => ({
      jour: j,
      creneaux: parJour[j].sort((a,b) => (a.debut||"").localeCompare(b.debut||"")).map(s => `${(s.debut||"").slice(0,5)}–${(s.fin||"").slice(0,5)}`),
    }));
};
const CoachDispoBlock = ({ coachId, coachDispoMap, mois, annee }) => {
  const slots = coachDispoMap[`${coachId}_${mois}_${annee}`];
  if (slots === undefined) {
    return <div style={{ fontSize:10, color:"#9ca3af", fontStyle:"italic", marginTop:4 }}>Chargement des disponibilités…</div>;
  }
  const parJour = formatDispoSlots(slots);
  if (parJour.length === 0) {
    return (
      <div style={{ fontSize:10, color:"#b45309", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:6, padding:"3px 7px", marginTop:4, display:"inline-block" }}>
        ⚠️ Disponibilités non renseignées pour {MOIS_LABELS_DISPO[mois]}
      </div>
    );
  }
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:4 }}>
      {parJour.map(({ jour, creneaux }) => (
        <span key={jour} title={`${jour} · ${MOIS_LABELS_DISPO[mois]}`} style={{ fontSize:9.5, fontWeight:600, color:"#166534", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:5, padding:"1px 6px" }}>
          📅 {jour} {creneaux.join(", ")}
        </span>
      ))}
    </div>
  );
};
const DispoMoisToggle = ({ moisSel, setMoisSel, periodes }) => (
  <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
    <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>📅 Disponibilités :</span>
    {["courant","suivant"].map(v => (
      <button key={v} type="button" onClick={() => setMoisSel(v)}
        style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99, cursor:"pointer", border:`1.5px solid ${moisSel===v?"#16a34a":"#e2e8f0"}`, background:moisSel===v?"#dcfce7":"#fff", color:moisSel===v?"#166534":"#6b7280" }}>
        {v==="courant" ? `Ce mois (${MOIS_LABELS_DISPO[periodes.courant.mois]})` : `Mois prochain (${MOIS_LABELS_DISPO[periodes.suivant.mois]})`}
      </button>
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════
   DONNÉES MOCK
═══════════════════════════════════════════════════════ */
const NIVEAUX = { A1:"Débutant",A2:"Élémentaire",B1:"Intermédiaire",B2:"Interm. Sup.",C1:"Avancé",C2:"Maîtrise" };

const MODE_PAI_LABELS = {
  en_ligne:              "💻 En ligne",
  especes:               "💵 Espèces",
  mobile_money_ria:      "📱 Mobile Money - Ria",
  mobile_money_moneygram:"📱 Mobile Money - MoneyGram",
  mobile_money_autres:   "📱 Mobile Money - Autres",
};

const CHECKLIST_ITEMS = [
  { id:"bienvenue", label:"Email de bienvenue envoyé",        icon:"✉️" },
  { id:"acces",     label:"Lien espace apprenant transmis",   icon:"🔗" },
  { id:"kit",       label:"Lien matériel de cours envoyé",    icon:"📚" },
  { id:"planning",  label:"Planning des séances envoyé",      icon:"📅" },
];


/* ═══════════════════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════════════════ */
// Libellé du champ lien selon le type de contenu - le champ sert les quatre types.
const LIBELLE_LIEN_CONTENU = {
  video: "Lien vidéo (YouTube, Vimeo, lien direct…)",
  audio: "Lien audio",
  image: "Lien de l'image",
  pdf:   "Lien du document",
};

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/* ═══════════════════════════════════════════════════════
   ONGLET COACHS - calqué sur PedagogicalAdvisorDashboard.jsx
═══════════════════════════════════════════════════════ */
const authHeaders  = () => ({ "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("admin_token")}` });
const formatMoney  = (v) => (v||0).toLocaleString("fr-FR") + " FCFA";
const FF           = "'Inter','Segoe UI',sans-serif";
const CONTRAT_TYPE = {
  en_ligne:       { label:"En ligne",       icon:"💻", color:"#0891b2", bg:"#e0f2fe" },
  presentiel_bet: { label:"Présentiel BET", icon:"🏢", color:"#7c3aed", bg:"#ede9fe" },
  domicile:       { label:"À domicile",     icon:"🏠", color:"#d97706", bg:"#fef3c7" },
};
const RENOUV_STATUT = {
  en_attente: { label:"Demandé",  color:"#d97706", bg:"#fef3c7" },
  confirme:   { label:"Confirmé", color:"#16a34a", bg:"#dcfce7" },
  refuse:     { label:"Refusé",   color:"#dc2626", bg:"#fee2e2" },
};
const PA_COLOR     = C;
const PA_LIGHT     = C_LIGHT;
const PA_GRADIENT  = C_GRAD;
const GRADES       = ["Vacataire","CDD","CDI","Freelance"];
const TYPES_COURS  = [
  { key:"en_ligne",   label:"En ligne",    icon:"💻" },
  { key:"presentiel", label:"Présentiel",  icon:"🏢" },
  { key:"hybride",    label:"Hybride",     icon:"⚡" },
  { key:"domicile",   label:"Domicile",    icon:"🏠" },
];
const GRILLE_DEFAULT = {
  tarifs: {
    "Vacataire": { en_ligne:5000,  presentiel:6500,  domicile:7500  },
    "CDD":       { en_ligne:6500,  presentiel:8000,  domicile:9000  },
    "CDI":       { en_ligne:8000,  presentiel:9500,  domicile:11000 },
    "Freelance": { en_ligne:6000,  presentiel:7500,  domicile:8500  },
  },
  multiplicateurs: { "A1-A2":1.0, "B1-B2":1.2, "C1-C2":1.5 },
};

export default function OnboardingDashboard() {
  const navigate = useNavigate();
  const profilInitial = JSON.parse(localStorage.getItem("admin_profil") || "{}");
  const { profil, peut } = useLivePermissions(profilInitial);
  const [msgSubTab, setMsgSubTab] = useState("prive");
  const token  = localStorage.getItem("admin_token");
  const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
  const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";

  const prenom    = profil?.prenom || "";
  const nom       = profil?.nom    || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "Assistante Onboarding";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "AO";

  const [accesElearning, setAccesElearning] = useState(profil?.acces_elearning === true);

  const { lang, toggleLang } = useLanguage();
  const confirm = useConfirm();
  const handleLogout = async () => {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    clearAllSessionStorage();
    navigate("/bet-staff-access", { replace: true });
  };

  // ── Refresh couleur depuis le serveur ───
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) return;
    fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.profil) return;
        if (sessionStorage.getItem("_bet_color_guard")) { sessionStorage.removeItem("_bet_color_guard"); return; }
        const freshColor = data.profil.couleur || null;
        const stored = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}"); } catch { return {}; } })();
        const _mp = { ...stored, ...data.profil }; if (!data.profil.couleur && stored.couleur) _mp.couleur = stored.couleur; localStorage.setItem("admin_profil", JSON.stringify(_mp));
        if (data.profil.acces_elearning !== undefined) setAccesElearning(data.profil.acces_elearning === true);
        if (freshColor && freshColor !== _C0) window.location.reload();
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  const [activeTab, setActiveTab] = useTabState("dashboard");

  // ── Contenus (bibliothèque onboarding + autres vidéos) ──────
  const [contenusSousTab, setContenusSousTab]   = useState("bibliotheque"); // "bibliotheque" | "upload" | "stats"
  const [filtreCatOnb, setFiltreCatOnb]         = useState("tous");
  const [uploadDestination, setUploadDestination] = useState("onboarding"); // "onboarding" | "video"
  const [contenusOnb, setContenusOnb]           = useState([]);
  const [contenusVideos, setContenusVideos]     = useState([]);
  const [contenusLoading, setContenusLoading]   = useState(false);
  const [modalContenuOnb, setModalContenuOnb]   = useState(false);
  const [editingContenuOnbId, setEditingContenuOnbId] = useState(null);
  // Progression de l'envoi : une vidéo de 80 Mo ne peut pas partir sans retour visuel.
  const [contenuProgress, setContenuProgress]   = useState(0);
  const [contenuOnbForm, setContenuOnbForm]     = useState({ titre:"", cat:"bienvenue", type:"pdf", detail:"", cible_coaching:"tous", lienVideo:"", fichier:null, visible:true });
  const [modalVideo, setModalVideo]             = useState(false);
  const [editingVideoId, setEditingVideoId]     = useState(null);
  const [videoForm, setVideoForm]               = useState({ titre:"", type:"video", cible:"tous", duree:"", niveau:"", icone:"🎬", lienVideo:"", fichier:null, visible:true });
  const [contenuUploading, setContenuUploading] = useState(false);
  const [savingMiniJeu, setSavingMiniJeu] = useState(false);
  const [sendingAlerteCommId, setSendingAlerteCommId] = useState(null);
  const [miniJeuActionLoading, setMiniJeuActionLoading] = useState(new Set());
  const [contenuActionLoading, setContenuActionLoading] = useState(new Set());
  const [videoActionLoading, setVideoActionLoading] = useState(new Set());

  // ── Mini-jeux ────────────────────────────────────────────
  const TYPES_JEUX_DASH = [
    { id:"qcm",         icone:"⚡", lib:"QCM Flash" },
    { id:"association", icone:"🔀", lib:"Association" },
    { id:"lacunes",     icone:"✏️", lib:"Mot manquant" },
    { id:"anagramme",   icone:"🔤", lib:"Anagramme" },
    { id:"sprint",      icone:"⏱️", lib:"Sprint vocabulaire" },
    { id:"vrai_faux",   icone:"🎯", lib:"Vrai ou Faux" },
    { id:"reordre",     icone:"🧩", lib:"Phrases à réordonner" },
    { id:"dialogue",    icone:"💬", lib:"Complétion de dialogue" },
    { id:"flashcards",  icone:"🃏", lib:"Flashcards" },
    { id:"conjugaison", icone:"🔁", lib:"Conjugaison express" },
    { id:"cecr",        icone:"🏆", lib:"Défi CECR" },
    { id:"dictee",      icone:"📖", lib:"Dictée éclair" },
    { id:"traduction",   icone:"🔃", lib:"Traduction inverse" },
    { id:"mots_croises", icone:"🔍", lib:"Mots croisés" },
    { id:"mots_caches",  icone:"🕵️", lib:"Mots cachés" },
  ];
  const [jeuxMiniAdmin, setJeuxMiniAdmin] = useState([]);
  const [modalMiniJeu, setModalMiniJeu]   = useState(false);
  const [editingMiniJeuId, setEditingMiniJeuId] = useState(null);
  const [miniJeuForm, setMiniJeuForm] = useState({ nom:"", type:"qcm", cible:"tous", nb_questions:10, max_tentatives:2 });
  const [detailsMiniJeu, setDetailsMiniJeu] = useState(null);
  const [resultatsMiniJeu, setResultatsMiniJeu] = useState([]);
  const [resultatsMiniJeuLoading, setResultatsMiniJeuLoading] = useState(false);
  const [apprenantDetailMiniJeu, setApprenantDetailMiniJeu] = useState(null);
  const [pageResultatsMiniJeu, setPageResultatsMiniJeu] = useState(1);
  const [periodeResultatsMiniJeu, setPeriodeResultatsMiniJeu] = useState("tout"); // tout | 7j | 30j | 90j

  const fetchContenusDash = async () => {
    setContenusLoading(true);
    try {
      const headers = authHeaders();
      const [r1, r2, r3] = await Promise.all([
        fetch(`${API_URL}/api/dash/contenus/onboarding`, { headers }),
        fetch(`${API_URL}/api/dash/contenus/videos`, { headers }),
        fetch(`${API_URL}/api/dash/contenus/mini-jeux`, { headers }),
      ]);
      const [d1, d2, d3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
      setContenusOnb(d1.contenus || []);
      setContenusVideos(d2.videos || []);
      setJeuxMiniAdmin(d3.jeux || []);
    } catch { /* silencieux - l'onglet Contenus restera vide */ }
    finally { setContenusLoading(false); }
  };

  function ouvrirCreationMiniJeu() {
    setEditingMiniJeuId(null);
    const typeInfo = TYPES_JEUX_DASH[0];
    setMiniJeuForm({ nom: typeInfo.lib, type: typeInfo.id, cible:"tous", nb_questions:10, max_tentatives:2 });
    setModalMiniJeu(true);
  }
  function ouvrirEditionMiniJeu(j) {
    setEditingMiniJeuId(j.id);
    setMiniJeuForm({ nom:j.nom, type:j.type, cible:j.cible, nb_questions:j.nb_questions||10, max_tentatives:j.max_tentatives });
    setModalMiniJeu(true);
  }
  async function enregistrerMiniJeu() {
    if (savingMiniJeu) return;
    if (!miniJeuForm.nom.trim()) { toast.error("Le nom du jeu est requis."); return; }
    setSavingMiniJeu(true);
    const body = { nom: miniJeuForm.nom, type: miniJeuForm.type, cible: miniJeuForm.cible, nb_questions: miniJeuForm.nb_questions, max_tentatives: miniJeuForm.max_tentatives };
    try {
      if (editingMiniJeuId) {
        const r = await fetch(`${API_URL}/api/dash/contenus/mini-jeux/${editingMiniJeuId}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setJeuxMiniAdmin(prev => prev.map(j => j.id === editingMiniJeuId ? d.jeu : j));
        toast.success("Mini-jeu mis à jour.");
      } else {
        const r = await fetch(`${API_URL}/api/dash/contenus/mini-jeux`, { method:"POST", headers:authHeaders(), body:JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setJeuxMiniAdmin(prev => [...prev, d.jeu]);
        toast.success("Mini-jeu ajouté au catalogue.");
      }
      setModalMiniJeu(false);
      setEditingMiniJeuId(null);
    } catch (e) { toast.error(e.message || "Erreur lors de l'enregistrement."); }
    finally { setSavingMiniJeu(false); }
  }
  async function toggleActifMiniJeu(j) {
    setJeuxMiniAdmin(prev => prev.map(x => x.id === j.id ? { ...x, actif: !x.actif } : x));
    try {
      await fetch(`${API_URL}/api/dash/contenus/mini-jeux/${j.id}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify({ actif: !j.actif }) });
    } catch {}
  }
  async function modifierTentativesMiniJeu(id, valeur) {
    const v = Math.max(1, Math.min(10, parseInt(valeur) || 1));
    setJeuxMiniAdmin(prev => prev.map(j => j.id === id ? { ...j, max_tentatives: v } : j));
    try {
      await fetch(`${API_URL}/api/dash/contenus/mini-jeux/${id}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify({ max_tentatives: v }) });
    } catch {}
  }
  async function reinitialiserMiniJeu(id) {
    if (miniJeuActionLoading.has(id)) return;
    const ok = await confirm("Les scores et l'historique des tentatives des apprenants pour ce jeu seront remis à zéro.", { titre:"Réinitialiser ce mini-jeu ?", danger:true });
    if (!ok) return;
    setMiniJeuActionLoading(prev => new Set(prev).add(id));
    setJeuxMiniAdmin(prev => prev.map(j => j.id === id ? { ...j, parties_jouees:0, score_moyen:0 } : j));
    try {
      await fetch(`${API_URL}/api/dash/contenus/mini-jeux/${id}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify({ reset:true }) });
    } catch {}
    finally { setMiniJeuActionLoading(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  }
  async function supprimerMiniJeu(id) {
    if (miniJeuActionLoading.has(id)) return;
    const ok = await confirm("Cette action est irréversible.", { titre:"Retirer ce mini-jeu du catalogue ?", danger:true });
    if (!ok) return;
    setMiniJeuActionLoading(prev => new Set(prev).add(id));
    setJeuxMiniAdmin(prev => prev.filter(j => j.id !== id));
    try {
      await fetch(`${API_URL}/api/dash/contenus/mini-jeux/${id}`, { method:"DELETE", headers:authHeaders() });
    } catch {}
    finally { setMiniJeuActionLoading(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  }
  async function ouvrirDetailsMiniJeu(j) {
    setDetailsMiniJeu(j);
    setApprenantDetailMiniJeu(null);
    setPageResultatsMiniJeu(1);
    setPeriodeResultatsMiniJeu("tout");
    setResultatsMiniJeuLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/dash/contenus/mini-jeux/${j.id}/resultats`, { headers:authHeaders() });
      const d = await r.json();
      setResultatsMiniJeu(d.resultats || []);
    } catch { setResultatsMiniJeu([]); }
    finally { setResultatsMiniJeuLoading(false); }
  }

  useEffect(() => {
    if (activeTab === "contenus") fetchContenusDash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Envoi direct vers Cloudinary : le relais par le backend plafonnait à 4,5 Mo (limite
  // Vercel), ce qui rendait impossible tout envoi de vidéo et se manifestait par une
  // erreur CORS trompeuse. Voir utils/uploadFichier.js.
  async function uploaderFichierContenu(fichier, type = "contenu") {
    const { url } = await uploadFichier(fichier, type, { onProgress: setContenuProgress });
    return url;
  }

  function ouvrirCreationContenuOnb() {
    setEditingContenuOnbId(null);
    setContenuOnbForm({ titre:"", cat:"bienvenue", type:"pdf", detail:"", cible_coaching:"tous", lienVideo:"", fichier:null, fichierUrlActuel:"", visible:true });
    setModalContenuOnb(true);
  }
  function ouvrirEditionContenuOnb(c) {
    setEditingContenuOnbId(c.id);
    // Le lien était repris pour les vidéos seulement : modifier une image, un audio ou un PDF
    // rouvrait le formulaire avec un champ vide, sans aucun moyen de voir ni corriger l'URL.
    setContenuOnbForm({ titre:c.titre, cat:c.cat, type:c.type, detail:c.detail || "", cible_coaching:c.cible_coaching || "tous", lienVideo: c.fichier_url || "", fichier:null, fichierUrlActuel: c.fichier_url || "", visible:c.visible });
    setModalContenuOnb(true);
  }
  async function enregistrerContenuOnb() {
    if (contenuUploading) return;
    setContenuProgress(0);
    if (!contenuOnbForm.titre.trim()) { toast.error("Le titre est requis."); return; }
    setContenuUploading(true);
    try {
      let fichier_url;
      // `detail` est la description lue par l'apprenant dans son espace : ne jamais la
      // remplacer par la taille du fichier ni par « Lien vidéo », qui ne décrivent rien.
      const detail = contenuOnbForm.detail ?? "";
      // Un fichier fraîchement choisi l'emporte ; sinon on prend le lien saisi, quel que
      // soit le type - un PDF hébergé ailleurs ou une image externe sont légitimes.
      if (contenuOnbForm.fichier) {
        fichier_url = await uploaderFichierContenu(contenuOnbForm.fichier);
      } else if (contenuOnbForm.lienVideo?.trim()) {
        fichier_url = contenuOnbForm.lienVideo.trim();
      } else if (editingContenuOnbId && contenuOnbForm.fichierUrlActuel) {
        // Champ lien vidé à l'édition = retrait volontaire du fichier.
        fichier_url = null;
      }
      const body = { titre: contenuOnbForm.titre, cat: contenuOnbForm.cat, type: contenuOnbForm.type, visible: contenuOnbForm.visible, cible_coaching: contenuOnbForm.cible_coaching || "tous" };
      if (fichier_url !== undefined) body.fichier_url = fichier_url;
      body.detail = detail;

      if (editingContenuOnbId) {
        const r = await fetch(`${API_URL}/api/dash/contenus/onboarding/${editingContenuOnbId}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setContenusOnb(prev => prev.map(x => x.id === editingContenuOnbId ? d.contenu : x));
        toast.success("Contenu mis à jour.");
      } else {
        const r = await fetch(`${API_URL}/api/dash/contenus/onboarding`, { method:"POST", headers:authHeaders(), body:JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setContenusOnb(prev => [d.contenu, ...prev]);
        toast.success("Contenu ajouté.");
      }
      setModalContenuOnb(false);
      setEditingContenuOnbId(null);
    } catch (e) { toast.error(e.message || "Erreur lors de l'enregistrement."); }
    finally { setContenuUploading(false); }
  }
  async function toggleVisibContenuOnb(c) {
    setContenusOnb(prev => prev.map(x => x.id === c.id ? { ...x, visible: !x.visible } : x));
    try {
      await fetch(`${API_URL}/api/dash/contenus/onboarding/${c.id}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify({ visible: !c.visible }) });
    } catch {}
  }
  async function supprimerContenuOnb(id) {
    if (contenuActionLoading.has(id)) return;
    const ok = await confirm("Cette action est irréversible.", { titre:"Supprimer ce contenu ?", danger:true });
    if (!ok) return;
    setContenuActionLoading(prev => new Set(prev).add(id));
    setContenusOnb(prev => prev.filter(x => x.id !== id));
    try {
      await fetch(`${API_URL}/api/dash/contenus/onboarding/${id}`, { method:"DELETE", headers:authHeaders() });
    } catch {}
    finally { setContenuActionLoading(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  }

  function ouvrirCreationVideo() {
    setEditingVideoId(null);
    setVideoForm({ titre:"", type:"video", cible:"tous", duree:"", niveau:"", icone:"🎬", lienVideo:"", fichier:null, visible:true });
    setModalVideo(true);
  }
  function ouvrirEditionVideo(v) {
    setEditingVideoId(v.id);
    setVideoForm({ titre:v.titre, type:v.type, cible:v.cible || "tous", duree:v.duree || "", niveau:v.niveau || "", icone:v.icone || "🎬", lienVideo: v.fichier_url || "", fichier:null, visible:v.visible });
    setModalVideo(true);
  }
  async function enregistrerVideo() {
    if (contenuUploading) return;
    setContenuProgress(0);
    if (!videoForm.titre.trim()) { toast.error("Le titre est requis."); return; }
    setContenuUploading(true);
    try {
      let fichier_url;
      if (videoForm.lienVideo?.trim() && !videoForm.fichier) {
        fichier_url = videoForm.lienVideo.trim();
      } else if (videoForm.fichier) {
        fichier_url = await uploaderFichierContenu(videoForm.fichier);
      }
      const body = { titre: videoForm.titre, type: videoForm.type, cible: videoForm.cible, duree: videoForm.duree || null, niveau: videoForm.niveau || null, icone: videoForm.icone, visible: videoForm.visible };
      if (fichier_url !== undefined) body.fichier_url = fichier_url;

      if (editingVideoId) {
        const r = await fetch(`${API_URL}/api/dash/contenus/videos/${editingVideoId}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setContenusVideos(prev => prev.map(x => x.id === editingVideoId ? d.video : x));
        toast.success("Vidéo mise à jour.");
      } else {
        const r = await fetch(`${API_URL}/api/dash/contenus/videos`, { method:"POST", headers:authHeaders(), body:JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setContenusVideos(prev => [d.video, ...prev]);
        toast.success("Vidéo ajoutée.");
      }
      setModalVideo(false);
      setEditingVideoId(null);
    } catch (e) { toast.error(e.message || "Erreur lors de l'enregistrement."); }
    finally { setContenuUploading(false); }
  }
  async function toggleVisibVideo(v) {
    setContenusVideos(prev => prev.map(x => x.id === v.id ? { ...x, visible: !x.visible } : x));
    try {
      await fetch(`${API_URL}/api/dash/contenus/videos/${v.id}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify({ visible: !v.visible }) });
    } catch {}
  }
  async function supprimerVideo(id) {
    if (videoActionLoading.has(id)) return;
    const ok = await confirm("Cette action est irréversible.", { titre:"Supprimer cette vidéo ?", danger:true });
    if (!ok) return;
    setVideoActionLoading(prev => new Set(prev).add(id));
    setContenusVideos(prev => prev.filter(x => x.id !== id));
    try {
      await fetch(`${API_URL}/api/dash/contenus/videos/${id}`, { method:"DELETE", headers:authHeaders() });
    } catch {}
    finally { setVideoActionLoading(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  }
  const [avatarUrl, setAvatarUrl] = useState(profil?.avatar_url || null);
  // Cliquer sur la photo la montre en grand ; le bouton 📷 en coin garde le remplacement.
  const [photoProfilOuverte, setPhotoProfilOuverte] = useState(false);
  const handleAvatarSuccess = async (file) => {
    setAvatarUrl(file.url);
    try {
      const r = await fetch(`${API_URL}/api/admin/me`, { method:"PATCH", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("admin_token")}` }, body: JSON.stringify({ avatar_url: file.url }) });
      if (r.ok) { const s = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}"); } catch { return {}; } })(); localStorage.setItem("admin_profil", JSON.stringify({ ...s, avatar_url: file.url })); }
    } catch {}
  };

  // ── Commerciale assignée (scope de visibilité) ──────────────
  const [myCommercial, setMyCommercial]         = useState(null);
  const [myCommerciales, setMyCommerciales]     = useState([]); // toutes les commerciales liées
  const [myCommercialLoading, setMyCommercialLoading] = useState(true);
  const [apprenants, setApprenants] = useState([]);
  const [apprenantsLoading, setApprenantsLoading] = useState(false);
  const [bilans, setBilans] = useState([]);
  const [bilansLoading, setBilansLoading] = useState(false);
  const [detailBilan, setDetailBilan] = useState(null);

  // Modaux
  const [showPlanningModal, setShowPlanningModal] = useState(false);
  const [selectedPlanning, setSelectedPlanning]   = useState(null);
  const [showSuiviModal, setShowSuiviModal]       = useState(false);
  const [selectedSuivi, setSelectedSuivi]         = useState(null);
  const [showBilanModal, setShowBilanModal]       = useState(false);
  const [selectedBilan, setSelectedBilan]         = useState(null);

  // Groupes state
  const [groupes, setGroupes] = useState([]);
  const [groupesLoading, setGroupesLoading] = useState(false);
  const [selectedGroupe, setSelectedGroupe] = useState(null);
  const [groupeDetail, setGroupeDetail] = useState({ apprenants:[], fichiers:[] });
  const [showCreateGroupe, setShowCreateGroupe] = useState(false);
  const [allStaff, setAllStaff]   = useState([]);
  const [coaches, setCoaches]     = useState([]);
  const [assistantesEnLigne, setAssistantesEnLigne] = useState([]);
  const fetchAssistantesEnLigne = useCallback(() => {
    fetch(`${API_URL}/api/parcours/assistantes`, { headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` } })
      .then(r => r.ok ? r.json() : { assistantes: [] })
      .then(d => setAssistantesEnLigne((d.assistantes || []).filter(a => a.type_cours === "en_ligne" || a.type_cours === "les_deux")))
      .catch(() => {});
  }, []);
  const [groupeForm, setGroupeForm] = useState({ nom:"", niveau:"", filiere:"", type_cours:"", coach_id:"", date_debut:"", date_fin:"", capacite_max:20, horaire:[], photo_url:null });
  // Voir CommercialDashboard : les filières viennent du catalogue réel, jamais d'une
  // liste recopiée - c'est elle qui reliait les inscriptions à leur offre.
  const [filieresCatalogue, setFilieresCatalogue] = useState([]);
  useEffect(() => {
    chargerFilieresCatalogue(API_URL, localStorage.getItem("admin_token")).then(setFilieresCatalogue);
  }, []);
  const [horaireTmp, setHoraireTmp] = useState({ jour:"Lun", debut:"08:00", fin:"10:00" });
  // Disponibilités réelles des coachs (même source que côté assistante présentiel) -
  // clé = `${coachId}_${mois}_${annee}`, préchargée pour le mois courant + le suivant.
  const [coachDispoMap, setCoachDispoMap] = useState({});
  const [groupeCoachDispoMois, setGroupeCoachDispoMois] = useState("courant");
  const [groupeCoachSearch, setGroupeCoachSearch] = useState("");
  const fetchCoachsDispos = async (coachIds) => {
    if (!coachIds.length) return;
    const { courant, suivant } = getPeriodesDispo();
    const periodes = [courant, suivant];
    try {
      const results = await Promise.all(
        coachIds.flatMap(id => periodes.map(({ mois, annee }) =>
          fetch(`${API_URL}/api/coachs/${id}/disponibilites?mois=${mois}&annee=${annee}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { disponibilites: [] })
            .then(d => ({ id, mois, annee, slots: d.disponibilites || [] }))
            .catch(() => ({ id, mois, annee, slots: [] }))
        ))
      );
      setCoachDispoMap(prev => {
        const next = { ...prev };
        results.forEach(({ id, mois, annee, slots }) => { next[`${id}_${mois}_${annee}`] = slots; });
        return next;
      });
    } catch {}
  };
  const [groupeSaving, setGroupeSaving] = useState(false);
  const [showEditGroupe, setShowEditGroupe] = useState(false);

  // ── Apprenant detail modal ───────────────────────────────────
  const [selectedApprenantGroupe, setSelectedApprenantGroupe]       = useState(null);
  const [apprenantTab, setApprenantTab]                 = useState("profil");
  const [apprenantTest, setApprenantTest]               = useState(null);
  // Tous ses tests, du plus ancien au plus récent - l'évolution, pas seulement le dernier.
  const [apprenantTests, setApprenantTests] = useState([]);
  const [apprenantTestLoading, setApprenantTestLoading] = useState(false);
  const [apprenantPresences, setApprenantPresences]     = useState([]);
  const [apprenantPresLoading, setApprenantPresLoading] = useState(false);
  const [apprenantAssignation, setApprenantAssignation] = useState(null);
  const [apprenantAssLoading,  setApprenantAssLoading]  = useState(false);
  const [apprenantPmts,        setApprenantPmts]        = useState([]);
  const [apprenantCours,       setApprenantCours]       = useState([]);
  const [apprenantCoursLoading,setApprenantCoursLoading]= useState(false);
  // Notes/évaluations de classe (données par le coach) - dossier apprenant onboarding
  const [apprenantEvals,        setApprenantEvals]        = useState([]);
  const [apprenantEvalsLoading, setApprenantEvalsLoading] = useState(false);
  // Historique de parcours (changements de classe et autres événements à venir)
  const [apprenantHistorique,        setApprenantHistorique]        = useState([]);
  const [apprenantHistoriqueLoading, setApprenantHistoriqueLoading] = useState(false);
  const [apprenantHistoriqueOuvert, setApprenantHistoriqueOuvert] = useState(null); // id de la ligne dépliée

  // ── Création d'accès apprenant ──────────────────────────────
  const [creerAccesLoading, setCreerAccesLoading] = useState(false);
  const [creerAccesStatut,  setCreerAccesStatut]  = useState(null); // null | "ok" | "err"
  const [onbApprenantAcces, setOnbApprenantAcces] = useState(null);
  const [onbAccesLoad,      setOnbAccesLoad]      = useState(false);
  const [onbParentAcces,    setOnbParentAcces]    = useState(null);
  const [onbParentAccesLoad,setOnbParentAccesLoad]= useState(false);
  const [creerAccesParentLoading, setCreerAccesParentLoading] = useState(false);

  const handleCreerAcces = async (ga) => {
    if (!ga || creerAccesLoading) return;
    setCreerAccesLoading(true);
    setCreerAccesStatut(null);
    const token = localStorage.getItem("admin_token");
    try {
      let noteObj = {};
      try { noteObj = JSON.parse(ga.note || "{}"); } catch {}
      const res = await fetch(`${API_URL}/api/apprenants/creer-acces`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          nom:              ga.nom_apprenant,
          prenom:           ga.prenom_apprenant,
          email:            ga.email_apprenant,
          telephone:        noteObj.telephone || ga.telephone || null,
          ga_id:            ga.id,
          email_parent:     ga.email_parent || null,
          telephone_parent: ga.telephone_parent || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur création accès");
      setCreerAccesStatut("ok");
      setSelectedApprenantGroupe(prev => ({ ...prev, apprenant_id: d.user_id }));
      // Mettre à jour l'affichage accès immédiatement - respecter mot_de_passe_conserve
      // (compte auto-inscrit sur le site, jamais de mot de passe temporaire écrasé : cf.
      // Backend/src/routes/apprenants.js, même correctif que côté CommercialDashboard).
      setOnbApprenantAcces(prev => ({
        has_account: true,
        profil: {
          ...(prev?.profil || {}),
          id:             d.user_id,
          email:          d.login_email || ga.email_apprenant,
          telephone:      ga.telephone || null,
          actif:          true,
          role:           "apprenant",
          mdp_temporaire: !d.mot_de_passe_conserve,
          mdp_initial:    d.mot_de_passe_conserve ? null : (d.mdp_initial || null),
          date_creation:     prev?.profil?.date_creation || new Date().toISOString(),
        },
      }));
      const ident = d.login_identifier || ga.email_apprenant;
      if (d.mot_de_passe_conserve) {
        toast(`ℹ️ ${ga.prenom_apprenant||""} ${ga.nom_apprenant||""} a déjà son propre mot de passe (compte auto-inscrit) - non modifié.`);
      } else {
        toast.success(d.login_type === "telephone"
          ? `✅ Accès envoyés - identifiant: ${ident} (connexion par téléphone)`
          : d.login_type === "technique"
          ? `✅ Accès envoyés - identifiant technique : ${ident} (à communiquer manuellement, aucun email réel)`
          : `✅ Accès envoyés à ${ident}`);
      }
      if (d.parent_account_created) {
        toast.success("👨‍👩‍👧 Accès parent créé automatiquement et envoyé par email");
      } else if (d.parent_account_error) {
        toast(`⚠️ Compte apprenant créé, mais accès parent non créé : ${d.parent_account_error}`, { duration: 6000 });
      }
    } catch (e) {
      setCreerAccesStatut("err");
      toast.error(e.message || "Erreur création accès");
    } finally {
      setCreerAccesLoading(false);
    }
  };

  // ── Transfert de groupe ──────────────────────────────────────
  const [showTransfert,        setShowTransfert]        = useState(false);
  const [transfertForm,        setTransfertForm]        = useState({ nouveau_groupe_id:"", motif:"", initiateur:"apprenant", jours:[] });
  const [groupesCibles,        setGroupesCibles]        = useState([]);
  const [groupesCiblesLoading, setGroupesCiblesLoading] = useState(false);
  // Niveau cible du transfert - librement modifiable (rétrogradation A2→A1, accélération
  // A2→B1, etc.), initialisé sur le niveau actuel de l'apprenant mais pas figé dessus.
  const [transfertNiveauCible, setTransfertNiveauCible] = useState("");
  const [transfertSaving,      setTransfertSaving]      = useState(false);
  // Clôturer la classe quittée si le transfert la laisse sans aucun apprenant.
  const [cloturerSourceTransfert, setCloturerSourceTransfert] = useState(false);
  /* Pré-cochée à l'ouverture seulement quand la classe est privée ET que l'apprenant déplacé
     est le dernier. Recalculée à chaque ouverture : entre deux transferts, un frère ou une
     sœur a pu rejoindre la classe de famille. */
  useEffect(() => {
    if (!showTransfert) { setCloturerSourceTransfert(false); return; }
    const src = selectedGroupe
      || (groupes || []).find(g => g.id === selectedApprenantGroupe?.groupe_id) || null;
    const privee = !!src && (src.is_prive === true || src.type_cours === "prive"
      || Number(src.capacite_max) === 1);
    setCloturerSourceTransfert(privee && Math.max(0, (Number(src.nb_apprenants) || 0) - 1) === 0);
  }, [showTransfert]); // eslint-disable-line

  const [filtreTypeGroupes, setFiltreTypeGroupes] = useState("tous");
  const [filtreStatutGroupes, setFiltreStatutGroupes] = useState("tous"); // tous | actif | cloture
  const [filtreCategorieGroupes, setFiltreCategorieGroupes] = useState("tous"); // tous | groupe | prive

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 10;
  const [pageApprenants,   setPageApprenants]   = useState(1);
  const [pageMesApp,       setPageMesApp]       = useState(1);
  const [pageGroupes,      setPageGroupes]      = useState(1);

  const paginate = (items, page) => items.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const totalPages = (items) => Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  const Pagination = ({ page, setPage, total }) => {
    const nb = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (nb <= 1) return null;
    const pages = [];
    for (let i = 1; i <= nb; i++) {
      if (i === 1 || i === nb || Math.abs(i - page) <= 1) pages.push(i);
      else if (pages[pages.length-1] !== "…") pages.push("…");
    }
    return (
      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:16 }}>
        <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
          style={{ padding:"5px 12px",borderRadius:7,border:"1px solid #e2e8f0",background:page===1?"#f8fafc":"#fff",color:page===1?"#cbd5e1":"#374151",fontWeight:700,fontSize:12,cursor:page===1?"default":"pointer" }}>‹</button>
        {pages.map((p,i)=>
          p==="…"
            ? <span key={`e${i}`} style={{ fontSize:12,color:"#9ca3af",padding:"0 2px" }}>…</span>
            : <button key={p} onClick={()=>setPage(p)}
                style={{ width:32,height:32,borderRadius:7,border:`1.5px solid ${page===p?C:"#e2e8f0"}`,background:page===p?C:"#fff",color:page===p?"#fff":"#374151",fontWeight:700,fontSize:12,cursor:"pointer" }}>{p}</button>
        )}
        <button onClick={()=>setPage(p=>Math.min(nb,p+1))} disabled={page===nb}
          style={{ padding:"5px 12px",borderRadius:7,border:"1px solid #e2e8f0",background:page===nb?"#f8fafc":"#fff",color:page===nb?"#cbd5e1":"#374151",fontWeight:700,fontSize:12,cursor:page===nb?"default":"pointer" }}>›</button>
        <span style={{ fontSize:11,color:"#9ca3af",marginLeft:4 }}>{page} / {nb}</span>
      </div>
    );
  };

  // ── Groupes sub-tabs: Présences & Sessions ───────────
  const [obPresences, setObPresences]         = useState([]);
  const [obPresencesLoading, setObPresencesLoading] = useState(false);
  const [obGroupeSubTab, setObGroupeSubTab]   = useState("apprenants"); // apprenants | presences | sessions | historique
  // Mouvements d'apprenants du groupe (arrivées / départs par transfert).
  const [obGroupeHistorique,        setObGroupeHistorique]        = useState([]);
  const [obGroupeHistoriqueLoading, setObGroupeHistoriqueLoading] = useState(false);
  const [obSessions, setObSessions]           = useState([]);
  const [obSessionsLoading, setObSessionsLoading] = useState(false);
  const [obSessionsMoisFiltre, setObSessionsMoisFiltre] = useState("");
  const [obSessionsPage, setObSessionsPage]   = useState(1);
  const OB_SESSIONS_PAR_PAGE = 15;

  const [archiveTarget, setArchiveTarget] = useState(null); // apprenant à archiver

  const enAttente = useMemo(() => apprenants.filter(a=>a.statut==="en_attente").length, [apprenants]);
  const enCours   = useMemo(() => apprenants.filter(a=>a.statut==="en_cours").length, [apprenants]);
  const bilansDus  = useMemo(() => bilans.filter(b=>!b.bilan_alerte_envoyee).length, [bilans]);

  // ── Fetch de la commerciale assignée + apprenants entrants ──
  useEffect(() => {
    if (!token) { setMyCommercialLoading(false); return; }
    fetch(`${API_URL}/api/admin/mon-commercial`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { commercial: null })
      .then(d => {
        setMyCommercial(d.commercial || null);
        setMyCommerciales(d.commerciales || (d.commercial ? [d.commercial] : []));
      })
      .catch(() => {})
      .finally(() => setMyCommercialLoading(false));
  }, [token]);

  // ── Fetch apprenants convertis en attente de traitement ─────
  useEffect(() => {
    if (!token) return;
    setApprenantsLoading(true);
    fetch(`${API_URL}/api/parcours/mes-apprenants-onboarding`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { apprenants: [] })
      .then(d => {
        const mapped = (d.apprenants || []).map(a => ({
          id:                  a.id,
          nom:                 a.prospect_nom             || "",
          email:               a.prospect_email           || "",
          telephone:           a.prospect_telephone       || "",
          offre:               a.inscription_offre        || "",
          niveau:              a.niveau_client            || "",
          coach:               "",
          dateConversion:      a.created_at               || "",
          statut:              "en_attente",
          profil_type:         a.profil_type              || "adulte",
          profil:              a.profil_type === "enfant" ? "Enfant" : a.profil_type === "etudiant" ? "Étudiant" : "Adulte",
          entreprise:          "",
          objectif:            a.objectif_client          || "",
          notes_commerciale:   a.notes                    || "",
          statut_paiement:     a.statut_paiement          || "",
          mode_paiement:       a.mode_paiement            || "",
          montant_paye:        a.montant_paye             || 0,
          type_cours:          a.type_cours               || "",
          type_coaching:       a.type_coaching            || "",
          centre_nom:          a.centre_nom               || "",
          routing_statut:      a.routing_statut           || "",
          nom_parent:           a.nom_parent               || "",
          telephone_parent:     a.telephone_parent         || "",
          email_parent:         a.email_parent             || "",
          prenom_enfant:        a.prenom_enfant            || "",
          nom_enfant:           a.nom_enfant               || "",
          age_enfant:           a.age_enfant               || "",
          niveau_classe_enfant: a.niveau_classe_enfant     || "",
          suivi_demarrage:      a.suivi_demarrage          || null,
          date_debut_formation: a.date_debut_formation     || "",
          pa_advisor_nom:       a.pa_advisor_nom           || "",
          assignation_id:      a.id,
        }));
        setApprenants(mapped);
      })
      .catch(() => {})
      .finally(() => setApprenantsLoading(false));
  }, [token]); // eslint-disable-line

  // Fetch groupes and coaches
  useEffect(() => {
    if (!token) return;
    setGroupesLoading(true);
    // Pas besoin de passer commercial_email : le backend résout via req.role === "onboarding"
    const params = "";
    Promise.all([
      fetch(`${API_URL}/api/groupes${params}`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.ok?r.json():{groupes:[]}),
      fetch(`${API_URL}/api/admin/utilisateurs`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.ok?r.json():{utilisateurs:[]}),
      fetch(`${API_URL}/api/coachs`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.ok?r.json():{coachs:[]})
    ]).then(([gData, uData, cData]) => {
      setGroupes(gData.groupes || []);
      const staff = uData.utilisateurs || [];
      setAllStaff(staff);
      // Fusionner table coachs + utilisateurs role=coach (sans doublons)
      const coachsTable = (cData.coachs || []).filter(c => c.actif !== false);
      const coachsTableIds = new Set(coachsTable.map(c => c.id));
      const coachsUsers = staff
        .filter(u => u.role === "coach" && u.actif && !coachsTableIds.has(u.id))
        .map(u => ({
          id: u.id, nom: u.nom, prenom: u.prenom,
          grade: u.coach_info?.grade || "Coach",
          photo_url: u.avatar_url || null,
          specialites: u.coach_info?.specialites || [],
          niveaux_enseignes: u.coach_info?.niveaux_enseignes || [],
          email: u.email || null, telephone: u.telephone || null,
          actif: true, role: "coach",
        }));
      setCoaches([...coachsTable, ...coachsUsers]);
    }).catch(()=>{}).finally(()=>setGroupesLoading(false));
  }, [myCommercial, token]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedGroupe) return;
    if (obGroupeSubTab === "presences") fetchObPresences();
    if (obGroupeSubTab === "sessions")  fetchObSessions();
    if (obGroupeSubTab === "historique" && selectedGroupe?.id) {
      setObGroupeHistoriqueLoading(true);
      fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/historique`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
      })
        .then(r => r.ok ? r.json() : { historique: [] })
        .then(d => setObGroupeHistorique(d.historique || []))
        .catch(() => {})
        .finally(() => setObGroupeHistoriqueLoading(false));
    }
  }, [obGroupeSubTab, selectedGroupe]);

  // Fetch "Mes apprenants" réels depuis l'API (filtrés via req.role onboarding côté backend)
  // Réutilisé aussi par l'onglet "Suivi démarrage" - mêmes apprenants, checklist réelle
  // portée par groupes_apprenants.suivi_checklist (plus de mock INIT_SUIVIS).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab !== "mes_apprenants" && activeTab !== "suivi") return;
    setMesAppLoading(true);
    fetch(`${API_URL}/api/groupes/apprenants`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { apprenants:[] })
      .then(d => setMesApprenants(d.apprenants || []))
      .catch(() => {})
      .finally(() => setMesAppLoading(false));
  }, [activeTab, myCommercial, token]);

  // Fetch "Bilans & Renouvellements" réels - apprenants approchant la fin
  // de leur groupe, calculés côté backend (plus de mock INIT_BILANS).
  // Chargé au montage (pas seulement à l'ouverture de l'onglet) pour que
  // le KPI "Bilans à traiter" du header reste juste.
  useEffect(() => {
    if (!token) return;
    setBilansLoading(true);
    fetch(`${API_URL}/api/groupes/apprenants/bilans`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { bilans:[] })
      .then(d => setBilans(d.bilans || []))
      .catch(() => {})
      .finally(() => setBilansLoading(false));
  }, [token]);

  const fetchGroupeDetail = async (groupe) => {
    const token = localStorage.getItem("admin_token");
    setObGroupeSubTab("infos");
    setObPresences([]); setObSessions([]); setObGroupeHistorique([]);
    setObSessionsMoisFiltre(""); setObSessionsPage(1);
    setSelectedGroupe(groupe);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${groupe.id}`, { headers: { Authorization:`Bearer ${token}` } });
      const d = await r.json();
      setGroupeDetail({ groupe: d.groupe || null, apprenants: d.apprenants || [], fichiers: d.fichiers || [] });
    } catch {}
  };

  const openApprenantDetail = async (a) => {
    setSelectedApprenantGroupe(a);
    setApprenantTab("profil");
    setApprenantTest(null);
    setApprenantPresences([]);
    setApprenantCours([]);
    setApprenantEvals([]);
    setApprenantHistorique([]);
    setApprenantHistoriqueOuvert(null);
    setApprenantAssignation(null);
    setApprenantPmts([]);
    setOnbApprenantAcces(null);
    const token = localStorage.getItem("admin_token");

    /* LE DOSSIER DÈS L'OUVERTURE, et non plus seulement au clic sur « Paiements » ou « Test
       de niveau ». C'est lui qui porte le CANAL de l'apprenant (`type_cours` : en ligne ou
       présentiel), et pour un apprenant en coaching privé c'est le SEUL endroit où il
       figure - sa classe porte `prive`, qui est un type de coaching, pas un endroit.
       Sans ce chargement, le bouton « Migrer » ne pouvait pas nommer sa destination et
       restait invisible sur l'onglet d'accueil de la fiche, c'est-à-dire presque toujours. */
    fetchApprenantAssignation(a.email_apprenant, a.email_parent, a.assignation_id);

    if (a.email_apprenant) {
      /* L'HISTORIQUE COMPLET, par `/historique` et non plus par `/result`.
         `/result` rendait le dernier test et une liste réduite (ni l'origine du test, ni le
         rattachement au dossier) : un niveau évalué en présentiel par l'agent placement test
         y apparaissait comme « passé en ligne », et le test d'un transfert, enregistré sans
         dossier résolu, n'y figurait pas du tout. `/historique` part de l'inscription, ce que
         cet écran connaît toujours, et applique la même règle que partout ailleurs. */
      setApprenantTestLoading(true);
      try {
        const p = new URLSearchParams({ ga_id: a.id, email: a.email_apprenant });
        const r = await fetch(`${API_URL}/api/level-test/historique?${p}`, { headers: { Authorization:`Bearer ${token}` } });
        let hist = r.ok ? ((await r.json()).historique || []) : [];
        // Repli sur l'e-mail du parent : un enfant sans adresse propre n'a de test que sous
        // celle de son parent, qui a rempli le formulaire à sa place.
        if (!hist.length && a.email_parent) {
          const r2 = await fetch(`${API_URL}/api/level-test/historique?email=${encodeURIComponent(a.email_parent)}`, { headers: { Authorization:`Bearer ${token}` } });
          if (r2.ok) hist = (await r2.json()).historique || [];
        }
        setApprenantTests(hist);
        setApprenantTest(hist[0] || null);   // trié du plus récent au plus ancien
      } catch {
        setApprenantTests([]); setApprenantTest(null);
      } finally { setApprenantTestLoading(false); }
      // Fetch statut accès
      setOnbAccesLoad(true);
      fetch(`${API_URL}/api/apprenants/profil-acces?email=${encodeURIComponent(a.email_apprenant)}`, { headers:{ Authorization:`Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { setOnbApprenantAcces(d); setOnbAccesLoad(false); })
        .catch(() => setOnbAccesLoad(false));
    }
    // Profil enfant : le PARENT est celui qui se connecte réellement pour suivre son
    // enfant - sans ce fetch, onboarding ne voit jamais si un accès parent existe déjà.
    setOnbParentAcces(null);
    if (a.profil_type === "enfant" && a.email_parent) {
      setOnbParentAccesLoad(true);
      fetch(`${API_URL}/api/apprenants/acces-parent?email=${encodeURIComponent(a.email_parent)}`, { headers:{ Authorization:`Bearer ${token}` } })
        .then(r => r.ok ? r.json() : { existe:false })
        .then(d => { setOnbParentAcces(d); setOnbParentAccesLoad(false); })
        .catch(() => setOnbParentAccesLoad(false));
    }
  };

  const handleCreerAccesParent = async (a) => {
    if (!a?.email_parent || creerAccesParentLoading) return;
    setCreerAccesParentLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const r = await fetch(`${API_URL}/api/apprenants/creer-acces-parent`, {
        method: "POST", headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          nom_parent:       a.nom_parent || null,
          email_parent:     a.email_parent,
          telephone_parent: a.telephone_parent || null,
          enfant_nom:       `${a.prenom_apprenant||""} ${a.nom_apprenant||""}`.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur création accès parent");
      toast.success(`✅ Accès parent créé - email envoyé à ${d.login_email || a.email_parent}`);
      setOnbParentAcces({ existe:true, login_email: d.login_email || a.email_parent, mdp_initial: d.mdp_initial || null });
    } catch (e) { toast.error(e.message || "Erreur création accès parent"); }
    finally { setCreerAccesParentLoading(false); }
  };

  /* Recharge la liste des groupes après un import : sans cela, les groupes créés et les
     effectifs mis à jour n'apparaissaient qu'après une actualisation manuelle de la page.
     Le dashboard commercial le fait déjà via fetchClasses() en fin d'import ; côté
     onboarding le chargement vit dans un useEffect, donc inappelable - d'où ce point
     d'entrée nommé. */
  const rechargerGroupesOnb = async () => {
    try {
      const r = await fetch(`${API_URL}/api/groupes`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
      });
      if (r.ok) { const d = await r.json(); setGroupes(d.groupes || []); }
    } catch { /* l'utilisateur peut toujours actualiser lui-même */ }
  };

  const searchGroupesCibles = async (niveau) => {
    if (!niveau) return;
    setGroupesCiblesLoading(true);
    const token = localStorage.getItem("admin_token");
    try {
      // "tous" = aucun filtre niveau (rétrogradation/accélération vers n'importe quelle classe)
      const q = niveau === "tous" ? "" : `niveau=${encodeURIComponent(niveau)}&`;
      const r = await fetch(`${API_URL}/api/groupes?${q}statut=actif`, { headers:{ Authorization:`Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        setGroupesCibles((d.groupes||[]).filter(g => g.id !== selectedGroupe?.id));
      }
    } catch {} finally { setGroupesCiblesLoading(false); }
  };

  const executerTransfert = async () => {
    if (transfertSaving) return;
    if (!transfertForm.nouveau_groupe_id) { toast.error("Sélectionnez un groupe cible"); return; }
    const nomApp = `${selectedApprenantGroupe?.prenom_apprenant||""} ${selectedApprenantGroupe?.nom_apprenant||""}`.trim() || "cet apprenant";
    const nomCible = groupesCibles.find(g=>g.id===transfertForm.nouveau_groupe_id)?.nom || "la classe sélectionnée";
    const veut = await confirm(
      `Transférer ${nomApp} vers "${nomCible}" ?`,
      { titre: "Confirmer le transfert", confirmLabel: "✅ Confirmer", danger: false }
    );
    if (!veut) return;
    setTransfertSaving(true);
    const token = localStorage.getItem("admin_token");
    try {
      const motifFinal = transfertForm.motif || "Changement de classe";
      const r = await fetch(`${API_URL}/api/groupes/transfert`, {
        method:"POST",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({
          ga_id:             selectedApprenantGroupe.id,
          nouveau_groupe_id: transfertForm.nouveau_groupe_id,
          motif:             motifFinal,
          initiateur:        transfertForm.initiateur,
          /* Sans lui, la route refuserait de sortir l'apprenant d'une classe en ligne : c'est
             la demande acceptée qui autorise ce mouvement, et le serveur la relit pour s'en
             assurer. */
          ...(demandeEnCours?.type_demande === "changement_coaching"
              || demandeEnCours?.type_demande === "changement_centre"
              ? { demande_id: demandeEnCours.id } : {}),
          ...(cloturerSourceTransfert ? { cloturer_groupe_source: true } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      toast.success(d.message || "Transfert effectué ✓");

      /* La clôture de la classe quittée est annoncée À PART, et son refus aussi : elle a ses
         propres conséquences (plans gelés, évaluations closes) et se tairait dans le message
         du transfert. Le serveur recompte les apprenants restants — si l'écran a proposé la
         case sur un compteur périmé, c'est ici qu'on l'apprend. */
      if (d.cloture_source?.fait) {
        toast.success(`Classe « ${d.cloture_source.nom || "privée"} » clôturée — elle n'avait plus d'apprenant.`);
      } else if (d.cloture_source?.raison === "apprenants_restants") {
        toast(`Classe non clôturée : ${d.cloture_source.restants} apprenant(s) y suivent encore leurs cours.`, { icon: "ℹ️" });
      }

      /* LE DOSSIER NE SE REFERME QU'ICI, après que le déplacement a réussi. L'inverse - clore
         puis transférer - faisait disparaître le dossier de la file même quand le transfert
         échouait, et l'apprenant restait dans la classe qu'il devait quitter.
         Non bloquant : le transfert, lui, est fait ; échouer à refermer le dossier ne doit pas
         faire croire le contraire. Il resterait simplement à traiter. */
      if (demandeEnCours) {
        try {
          const rd = await fetch(`${API_URL}/api/demandes-transfert/${demandeEnCours.id}`, {
            method: "PATCH",
            headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
            body: JSON.stringify({
              statut: "traitee", groupe_cible_id: transfertForm.nouveau_groupe_id,
              ...(Number(nouvelleMensualite) > 0 ? { nouvelle_mensualite: Number(nouvelleMensualite), appliquer_mois_en_cours: tarifDesLeMoisEnCours } : {}),
            }),
          });
          if (!rd.ok) {
            const dd = await rd.json().catch(()=>({}));
            toast.error(dd.error || "Transfert fait, mais le dossier n'a pas pu être refermé.");
          }
        } catch {
          toast.error("Transfert fait, mais le dossier n'a pas pu être refermé.");
        }
        setDemandeEnCours(null);
        setRefreshReaffecter(n => n + 1);
      }

      setShowTransfert(false);
      setSelectedApprenantGroupe(null);
      const gr = await fetch(`${API_URL}/api/groupes`, { headers:{ Authorization:`Bearer ${token}` } });
      if (gr.ok) { const gd = await gr.json(); setGroupes(gd.groupes||[]); }
    } catch (e) { toast.error(e.message); } finally { setTransfertSaving(false); }
  };

  const fetchApprenantAssignation = async (email, fallbackEmail, assignationId) => {
    if (!email && !assignationId) return;
    setApprenantAssLoading(true);
    setApprenantPmts([]);
    const tok = localStorage.getItem("admin_token");
    try {
      // Lien direct par id (stocké dans note à la création de la classe privée) - prioritaire
      // et fiable, contrairement au match par email qui échoue quand prospect_email (le parent)
      // diffère de email_apprenant (l'email de connexion propre à l'enfant).
      let ass = null;
      if (assignationId) {
        const r0 = await fetch(`${API_URL}/api/parcours/assignations?id=${encodeURIComponent(assignationId)}`, { headers:{ Authorization:`Bearer ${tok}` } });
        if (r0.ok) { const d0 = await r0.json(); ass = (d0.assignations || [])[0] || null; }
      }
      if (!ass && email) {
        const r = await fetch(`${API_URL}/api/parcours/assignations?prospect_email=${encodeURIComponent(email)}`, { headers:{ Authorization:`Bearer ${tok}` } });
        if (r.ok) { const d = await r.json(); ass = (d.assignations || [])[0] || null; }
      }
      // Fallback sur email_parent si aucune assignation trouvée (enfant avec email propre)
      if (!ass && fallbackEmail) {
        const r2 = await fetch(`${API_URL}/api/parcours/assignations?prospect_email=${encodeURIComponent(fallbackEmail)}`, { headers:{ Authorization:`Bearer ${tok}` } });
        if (r2.ok) { const d2 = await r2.json(); ass = (d2.assignations || [])[0] || null; }
      }
      setApprenantAssignation(ass);
      // Fetch individual payments for this assignation
      if (ass?.id) {
        const rp = await fetch(`${API_URL}/api/paiements/assignation/${ass.id}`, { headers:{ Authorization:`Bearer ${tok}` } });
        if (rp.ok) { const dp = await rp.json(); setApprenantPmts(dp.paiements || []); }
      }
    } catch {} finally { setApprenantAssLoading(false); }
  };

  const fetchApprenantPresences = async (a) => {
    setApprenantPresLoading(true);
    const token = localStorage.getItem("admin_token");
    try {
      // 1. assignation_id lié dès la création de la classe privée (fiable, cf. note stockée
      // dans groupes_apprenants) - prioritaire sur le match par email qui échoue quand
      // prospect_email (le parent) diffère de email_apprenant (l'enfant).
      let assignationId = a.assignation_id || apprenantAssignation?.id || null;
      if (!assignationId && a.email_apprenant) {
        const rAss = await fetch(`${API_URL}/api/parcours/assignations?prospect_email=${encodeURIComponent(a.email_apprenant)}`, { headers:{ Authorization:`Bearer ${token}` } });
        if (rAss.ok) {
          const dAss = await rAss.json();
          assignationId = (dAss.assignations || [])[0]?.id || null;
        }
      }

      // 2. Source principale : presences_privees (même table que PA et Coach)
      let presences = [];
      if (assignationId) {
        const rPv = await fetch(`${API_URL}/api/presences-privees?assignation_id=${assignationId}`, { headers:{ Authorization:`Bearer ${token}` } });
        if (rPv.ok) {
          const dPv = await rPv.json();
          // Normaliser : date_presence → date_seance pour l'affichage uniforme
          presences = (dPv.presences || []).map(p => ({
            ...p,
            date_seance: p.date_presence || p.seances_privees?.date_seance || p.date_seance || null,
          }));
        }
      }

      // 3. Fallback : groupes_presences filtrée par ga_id / nom (cours en groupe)
      if (presences.length === 0 && selectedGroupe) {
        const rGrp = await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/presences`, { headers:{ Authorization:`Bearer ${token}` } });
        if (rGrp.ok) {
          const dGrp = await rGrp.json();
          presences = (dGrp.presences || []).filter(p =>
            String(p.ga_id) === String(a.id) ||
            (p.nom_apprenant === a.nom_apprenant && p.prenom_apprenant === a.prenom_apprenant)
          );
        }
      }

      setApprenantPresences(presences);
    } catch {} finally { setApprenantPresLoading(false); }
  };

  const fetchApprenantCours = async (apprenant) => {
    setApprenantCoursLoading(true);
    const token = localStorage.getItem("admin_token");
    const a = apprenant || selectedApprenantGroupe;
    const now = new Date();
    try {
      let allCours = [];

      // 0. Source actuelle : table unifiée `seances` (remplace groupes_cours ET
      // seances_privees - le coach l'utilise désormais pour TOUTES ses séances, groupe
      // comme privé, via groupe_id). Sans cette requête, une séance enregistrée par le
      // coach aujourd'hui n'apparaît nulle part côté onboarding/PA/apprenant alors qu'elle
      // est bien comptée dans ses honoraires.
      if (selectedGroupe) {
        const rNew = await fetch(`${API_URL}/api/seances?groupe_id=${selectedGroupe.id}`, { headers:{ Authorization:`Bearer ${token}` } });
        if (rNew.ok) {
          const dNew = await rNew.json();
          const statutMap = { planifiee:"planifie", realisee:"effectue", annulee:"annule", reportee:"reporte" };
          allCours = (dNew.seances || []).map(s => {
            let heure_fin = null;
            if (s.heure_debut && s.duree_h) {
              const [h, m] = s.heure_debut.split(":").map(Number);
              const totalMin = h * 60 + m + Math.round(s.duree_h * 60);
              heure_fin = `${String(Math.floor(totalMin/60)).padStart(2,"0")}:${String(totalMin%60).padStart(2,"0")}`;
            }
            return {
              ...s,
              date_cours: s.date_seance || null,
              heure_fin,
              statut: statutMap[s.statut] || s.statut || "planifie",
              _source: "seances",
            };
          });
        }
      }

      // 1. assignation_id lié dès la création de la classe privée (fiable) - prioritaire
      // sur le match par email, cf. même correctif dans fetchApprenantPresences ci-dessus.
      let assignationId = a?.assignation_id || apprenantAssignation?.id || null;
      if (!assignationId && a?.email_apprenant) {
        const rAss = await fetch(`${API_URL}/api/parcours/assignations?prospect_email=${encodeURIComponent(a.email_apprenant)}`, { headers:{ Authorization:`Bearer ${token}` } });
        if (rAss.ok) {
          const dAss = await rAss.json();
          assignationId = (dAss.assignations || [])[0]?.id || null;
        }
      }

      // 2. Repli : seances_privees (ancien système, coachings privés créés avant la
      // bascule vers la table unifiée `seances`)
      if (allCours.length === 0 && assignationId) {
        const rSv = await fetch(`${API_URL}/api/seances-privees?assignation_id=${assignationId}`, { headers:{ Authorization:`Bearer ${token}` } });
        if (rSv.ok) {
          const dSv = await rSv.json();
          allCours = (dSv.seances || []).map(s => {
            // Calculer heure_fin depuis heure_debut + duree_h
            let heure_fin = null;
            if (s.heure_debut && s.duree_h) {
              const [h, m] = s.heure_debut.split(":").map(Number);
              const totalMin = h * 60 + m + Math.round(s.duree_h * 60);
              heure_fin = `${String(Math.floor(totalMin/60)).padStart(2,"0")}:${String(totalMin%60).padStart(2,"0")}`;
            }
            // Normaliser statut : "planifiee" → "planifie", "effectuee" → "effectue", etc.
            const statutNorm = (s.statut || "planifie").replace(/ee$/, "e").replace(/ie$/, "i");
            return {
              ...s,
              date_cours: s.date_seance || s.date_cours || null,
              heure_debut: s.heure_debut || null,
              heure_fin,
              statut: statutNorm,
              _source: "prive",
            };
          });
        }
      }

      // 3. Fallback : cours en groupe sur 3 mois
      if (allCours.length === 0 && selectedGroupe) {
        const requests = [];
        for (let i = -2; i <= 1; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          requests.push(
            fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/cours?mois=${d.getMonth()+1}&annee=${d.getFullYear()}`, { headers:{ Authorization:`Bearer ${token}` } })
              .then(r => r.ok ? r.json() : { cours:[] })
              .then(data => (data.cours || []).map(c => ({ ...c, _source:"groupe" })))
          );
        }
        const results = await Promise.all(requests);
        allCours = results.flat();
      }

      allCours.sort((a,b) => (b.date_cours||"").localeCompare(a.date_cours||""));
      setApprenantCours(allCours);
    } catch {} finally { setApprenantCoursLoading(false); }
  };

  const createGroupe = async () => {
    if (groupeSaving) return;
    if (!groupeForm.nom.trim()) { toast.error("Le nom du groupe est requis"); return; }
    const token = localStorage.getItem("admin_token");
    setGroupeSaving(true);
    try {
      // onboarding n'a pas le droit d'assigner un coach à la création - la classe est créée
      // sans coach, et c'est le PA Advisor qui la récupère (déjà notifié + déjà visible dans
      // sa liste "Groupes" avec le badge "⚠ Coach manquant") pour lui en assigner un.
      const { coach_id: _coachId, ...groupeFormSansCoach } = groupeForm;
      const r = await fetch(`${API_URL}/api/groupes`, {
        method:"POST",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ ...groupeFormSansCoach, coach_id: null })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setGroupes(prev => [{ ...d.groupe, nb_apprenants:0 }, ...prev]);
      setShowCreateGroupe(false);
      setGroupeForm({ nom:"", niveau:"", filiere:"", type_cours:"en_ligne", coach_id:"", date_debut:"", date_fin:"", capacite_max:20, horaire:[], photo_url:null });
      toast.success("Groupe créé ✓");
      // Créée depuis le modal de transfert (ex: aucune classe compatible trouvée) -
      // la présélectionner directement au lieu de forcer un clic "Actualiser" en plus.
      if (showTransfert) {
        setGroupesCibles(prev => [{ ...d.groupe, nb_apprenants:0 }, ...prev]);
        setTransfertForm(f => ({ ...f, nouveau_groupe_id: d.groupe.id }));
      }
    } catch(e) { toast.error(e.message || "Erreur création"); }
    finally { setGroupeSaving(false); }
  };

  /* ══════════════════════════════════════════════════════
     IMPORT EN MASSE DES GROUPES (Excel) - en ligne uniquement.
     Réutilise POST /api/groupes ligne par ligne (même endpoint que
     "Créer un groupe"), type_cours forcé "en_ligne" et coach_id
     toujours null - onboarding n'assigne jamais de coach à la
     création (cf. createGroupe ci-dessus), le PA Advisor le fait
     ensuite.
  ══════════════════════════════════════════════════════ */
  const importGroupesFileRef = useRef(null);
  const [importGroupesPreviewRows, setImportGroupesPreviewRows] = useState([]);
  const [showImportGroupesUpload,  setShowImportGroupesUpload]  = useState(false);
  const [showImportGroupesPreview, setShowImportGroupesPreview] = useState(false);
  // Communs aux 3 imports : nom du fichier (pour l'historique) et identifiant du
  // dernier lot, qui rend le bouton "Annuler cet import" possible depuis le rapport.
  const [importFichierNom, setImportFichierNom] = useState("");
  const [dernierImportId,  setDernierImportId]  = useState(null);
  // Lot ouvert dès la lecture d'un fichier "Import global" : les classes y sont déjà
  // créées et estampillées, les apprenants doivent rejoindre LE MÊME lot pour que
  // l'annulation défasse l'ensemble d'un seul coup.
  const [importGlobalJobId, setImportGlobalJobId] = useState(null);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);
  // Progression unifiee des 3 imports : alimente le modal bloquant ci-dessous.
  const [importProgress, setImportProgress] = useState(null); // { label, pct, traites, total }
  // Drapeau d'interruption : une ref, pas un state - le rappel doitArreter est capturé
  // dans une closure, où un state serait lu périmé et l'arrêt jamais pris en compte.
  const arretImportRef = useRef(false);
  const [arretDemande, setArretDemande] = useState(false);
  const ACCENT_IMPORT = "#1d4ed8";

  /* Rapport d'import : défaire le lot qui vient d'être créé, sans script ni
     intervention en base. Le serveur supprime exactement ce que CE lot a produit
     (filtre sur import_id), donc aucune saisie manuelle ne peut être touchée. */

  /* Borne de génération de l'échéancier.
     Un plan ouvert s'arrête au mois courant : les versements réglés D'AVANCE (mois
     futurs) n'ont alors aucun mois où s'imputer et disparaissent silencieusement du
     plan - mesuré à 50 000 à 80 000 FCFA par apprenant sur un échéancier de 2 à 3
     versements. Pire, le cron ajoutera plus tard ces mois en "en_attente" et
     déclenchera des relances J-7/J-3/J-1 pour des sommes DÉJÀ payées.
     On étend donc la génération jusqu'au dernier versement connu, sans toucher à
     date_fin_formation : le plan reste ouvert et le cron continue de le prolonger. */
  const borneEcheancier = (dateDebut, dateFin, paiements) => {
    const dates = (paiements || []).map((p) => p.date).filter(Boolean).sort();
    const dernierVersement = dates[dates.length - 1] || null;
    const socle = dateFin || new Date().toISOString().slice(0, 10);
    if (!dernierVersement) return dateFin || null;
    return dernierVersement > socle ? dernierVersement : (dateFin || null);
  };

  /* ══ HISTORIQUE DES IMPORTS ══
     L'annulation ne vivait que dans le rapport de fin : la fenêtre fermée, plus aucun
     moyen de défaire un lot depuis l'interface (il a fallu un script de suppression
     sur mesure pour nettoyer un import de test). Cet écran la rend accessible à tout
     moment, et permet aussi de relancer un lot interrompu - l'idempotence ne recrée
     que les lignes manquantes. Le serveur cloisonne : chacune ne voit que ses lots. */
  const [showHistoriqueImports, setShowHistoriqueImports] = useState(false);
  const [historiqueImports, setHistoriqueImports] = useState([]);
  const [historiqueChargement, setHistoriqueChargement] = useState(false);
  const [relanceEnCours, setRelanceEnCours] = useState(null);
  // Détail d'un lot passé. Le serveur conserve le résultat ligne par ligne dans
  // imports.resultats : c'est ce qui permet de rouvrir un import annulé et de lire
  // pourquoi ses lignes ont échoué, longtemps après que le rapport a été fermé.
  const [detailImport, setDetailImport] = useState(null);

  const ouvrirDetailImport = async (job) => {
    setDetailImport({ job, lignes: null, erreur: null });
    try {
      const r = await fetch(`${API_URL}/api/imports/${job.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("admin_token")}` },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Import introuvable");
      setDetailImport({ job: d.import || job, lignes: d.import?.resultats || [], erreur: null });
    } catch (err) {
      setDetailImport({ job, lignes: [], erreur: err.message });
    }
  };

  const chargerHistoriqueImports = async () => {
    setHistoriqueChargement(true);
    try {
      setHistoriqueImports(await listerImports({
        apiUrl: API_URL, token: localStorage.getItem("admin_token"), limit: 30,
      }));
    } catch (err) {
      toast.error("Historique indisponible : " + err.message);
    } finally {
      setHistoriqueChargement(false);
    }
  };

  const ouvrirHistoriqueImports = () => { setDetailImport(null); setShowHistoriqueImports(true); chargerHistoriqueImports(); };

  const annulerDepuisHistorique = async (job) => {
    const ok = await confirm(
      `Tout ce que l'import « ${job.fichier_nom || job.type} » a créé sera supprimé : dossiers, `
      + "versements, classes et comptes d'accès. Cette action est définitive.",
      { titre: "Annuler cet import ?", confirmLabel: "Annuler l'import", danger: true },
    );
    if (!ok) return;
    setRelanceEnCours(job.id);
    try {
      const s = await annulerImport({ apiUrl: API_URL, token: localStorage.getItem("admin_token"), importId: job.id });
      toast.success(`Import annulé - ${s.assignations_parcours || 0} dossier(s), ${s.paiements_parcours || 0} versement(s), `
        + `${s.groupes || 0} classe(s), ${s.comptes || 0} compte(s) supprimé(s)`);
      await chargerHistoriqueImports();
      
    } catch (err) {
      toast.error("Annulation impossible : " + err.message);
    } finally {
      setRelanceEnCours(null);
    }
  };

  const relancerDepuisHistorique = async (job) => {
    setRelanceEnCours(job.id);
    try {
      const complet = await lignesDeLImport({
        apiUrl: API_URL, token: localStorage.getItem("admin_token"), importId: job.id,
      });
      const ok = await confirm(
        `${complet.lignes_source.length} ligne(s) vont être rejouées. Celles déjà créées lors du `
        + "premier passage seront automatiquement ignorées - seules les manquantes seront créées.",
        { titre: "Relancer cet import ?", confirmLabel: "Relancer", danger: false },
      );
      if (!ok) { setRelanceEnCours(null); return; }

      setShowHistoriqueImports(false);
      arretImportRef.current = false;
      setArretDemande(false);
      setImportProgress({ label: "Reprise de l'import", pct: 0, traites: 0, total: complet.lignes_source.length });

      const { importId, resultats, interrompu } = await lancerImport({
        apiUrl: API_URL, token: localStorage.getItem("admin_token"),
        type: complet.type, fichierNom: complet.fichier_nom, contexte: complet.contexte || {},
        lignes: complet.lignes_source,
        doitArreter: () => arretImportRef.current,
        onProgress: (pct, info) => setImportProgress({
          label: "Reprise de l'import", pct, traites: info.traites, total: info.total,
        }),
      });

      const { ok: nbOk, erreur, ignore } = compterResultats(resultats);
      setDernierImportId(importId);
      // L'ancien lot est desormais repris : sans ce marquage il resterait
      // "interrompu" pour toujours (il ne peut pas etre efface, il a des donnees).
      if (!interrompu) {
        await marquerImportRepris({
          apiUrl: API_URL, token: localStorage.getItem("admin_token"), importId: job.id,
        });
      }
      toast.success(`Reprise terminée - ${nbOk} créée(s)`
        + (ignore ? `, ${ignore} déjà présente(s)` : "")
        + (erreur ? `, ${erreur} en erreur` : "")
        + (interrompu ? " (interrompue)" : "") + " ✓");
      
    } catch (err) {
      toast.error("Relance impossible : " + err.message);
    } finally {
      setImportProgress(null);
      setRelanceEnCours(null);
    }
  };

  /* Compteur d'alerte sur le bouton Historique : un lot annulé signifie que des
     données créées ont été supprimées - la commerciale doit le savoir, surtout si
     l'annulation vient d'une autre personne (rôle à vue totale). Le badge s'éteint
     quand elle efface l'entrée du journal : c'est un accusé de réception, pas une
     alerte permanente qu'on finirait par ne plus voir. */
  // Deux niveaux distincts : un lot interrompu ATTEND une action (le relancer pour
  // créer les lignes manquantes) ; un lot annulé CONSTATE une suppression. Le premier
  // est le plus actionnable, d'où sa place en tête.
  const nbImportsInterrompus = historiqueImports.filter(j => j.statut === "interrompu").length;
  const nbImportsAnnules     = historiqueImports.filter(j => j.statut === "annule").length;

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const liste = await listerImports({
          apiUrl: API_URL, token: localStorage.getItem("admin_token"), limit: 30,
        });
        if (!annule) setHistoriqueImports(liste);
      } catch { /* l'historique reste consultable a la demande, pas d'alerte au chargement */ }
    })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const supprimerDepuisHistorique = async (job) => {
    const ok = await confirm(
      "L'entrée disparaîtra de l'historique. Les données ne sont pas touchées - ce lot "
      + (job.statut === "annule" ? "a déjà été annulé." : "n'a rien créé."),
      { titre: "Effacer cette ligne de l'historique ?", confirmLabel: "Effacer", danger: true },
    );
    if (!ok) return;
    setRelanceEnCours(job.id);
    try {
      await supprimerImport({ apiUrl: API_URL, token: localStorage.getItem("admin_token"), importId: job.id });
      toast.success("Entrée effacée de l'historique");
      await chargerHistoriqueImports();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRelanceEnCours(null);
    }
  };

  const rendreModalHistoriqueImports = () => !showHistoriqueImports ? null : (
    <Modal title="📥 Historique des imports" onClose={() => { setShowHistoriqueImports(false); setDetailImport(null); }} size="xl">
      <p style={{ margin:"-8px 0 16px", fontSize:12, color:"#6b7280" }}>
        Vos imports récents - cliquez une ligne pour voir son détail ligne par ligne.
        « Relancer » rejoue un lot incomplet sans recréer ce qui existe déjà ; « Annuler »
        supprime tout ce que le lot a créé, dans les {FENETRE_ANNULATION_HEURES} h qui suivent l'import.
      </p>
      {detailImport ? (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
            <button onClick={() => setDetailImport(null)}
              style={{ padding:"5px 12px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:7,
                fontSize:11, fontWeight:700, color:"#334155", cursor:"pointer" }}>← Retour</button>
            <strong style={{ fontSize:13, color:"#0f172a" }}>{detailImport.job.fichier_nom || detailImport.job.type}</strong>
            <span style={{ fontSize:11, color:"#94a3b8" }}>
              {new Date(detailImport.job.created_at).toLocaleString("fr-FR")}
            </span>
          </div>
          {detailImport.erreur ? (
            <p style={{ padding:"24px 0", textAlign:"center", color:"#dc2626", fontSize:13 }}>{detailImport.erreur}</p>
          ) : !detailImport.lignes ? (
            <p style={{ padding:"24px 0", textAlign:"center", color:"#94a3b8", fontSize:13 }}>Chargement du détail…</p>
          ) : !detailImport.lignes.length ? (
            <p style={{ padding:"24px 0", textAlign:"center", color:"#94a3b8", fontSize:13 }}>
              Aucun détail conservé pour cet import.
            </p>
          ) : (
            <div style={{ overflowX:"auto", maxHeight:420, overflowY:"auto", borderRadius:10, border:"1.5px solid #e2e8f0" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead style={{ position:"sticky", top:0, zIndex:2 }}>
                  <tr style={{ background:"#f8fafc" }}>
                    {["Ligne","Statut","Détail"].map(h => (
                      <th key={h} style={{ padding:"9px 10px", textAlign:"left", fontWeight:700, fontSize:11,
                        color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detailImport.lignes.map((l, i) => {
                    const cfg = l.statut === "ok"     ? { c:"#16a34a", bg:"#dcfce7", t:"✓ Créé" }
                              : l.statut === "ignore" ? { c:"#92400e", bg:"#fef3c7", t:"= Ignoré" }
                              :                         { c:"#dc2626", bg:"#fee2e2", t:"✗ Erreur" };
                    return (
                      <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background: l.statut === "erreur" ? "#fffbfb" : "#fff" }}>
                        <td style={{ padding:"7px 10px", fontWeight:600, color:"#0f172a" }}>{l.nom || "-"}</td>
                        <td style={{ padding:"7px 10px", whiteSpace:"nowrap" }}>
                          <span style={{ background:cfg.bg, color:cfg.c, borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>{cfg.t}</span>
                        </td>
                        <td style={{ padding:"7px 10px", color: l.statut === "erreur" ? "#dc2626" : "#64748b" }}>{l.detail || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : historiqueChargement ? (
        <p style={{ padding:"24px 0", textAlign:"center", color:"#94a3b8", fontSize:13 }}>Chargement…</p>
      ) : !historiqueImports.length ? (
        <p style={{ padding:"24px 0", textAlign:"center", color:"#94a3b8", fontSize:13 }}>
          Aucun import pour l'instant.
        </p>
      ) : (
        <div style={{ overflowX:"auto", maxHeight:460, overflowY:"auto", borderRadius:10, border:"1.5px solid #e2e8f0" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead style={{ position:"sticky", top:0, zIndex:2 }}>
              <tr style={{ background:"#f8fafc" }}>
                {["Date","Fichier","Type","Résultat","Statut","Actions"].map(h => (
                  <th key={h} style={{ padding:"9px 10px", textAlign:"left", fontWeight:700, fontSize:11,
                    color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historiqueImports.map(job => {
                const st = STATUT_IMPORT[job.statut] || { label: job.statut, couleur:"#64748b", fond:"#f1f5f9" };
                const occupe = relanceEnCours === job.id;
                return (
                  <tr key={job.id} onClick={() => ouvrirDetailImport(job)}
                    title="Voir le détail ligne par ligne de cet import"
                    style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer",
                    background: job.statut === "annule" ? "#fafafa" : "#fff" }}>
                    <td style={{ padding:"8px 10px", whiteSpace:"nowrap", color:"#475569" }}>
                      {new Date(job.created_at).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                    </td>
                    <td style={{ padding:"8px 10px", fontWeight:600, maxWidth:220, overflow:"hidden",
                      textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.fichier_nom || "-"}</td>
                    <td style={{ padding:"8px 10px", color:"#64748b", whiteSpace:"nowrap" }}>{job.type}</td>
                    <td style={{ padding:"8px 10px", whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums" }}>
                      <span style={{ color:"#16a34a", fontWeight:700 }}>{job.nb_ok}</span>
                      <span style={{ color:"#94a3b8" }}> / {job.nb_lignes}</span>
                      {job.nb_erreur > 0 && <span style={{ color:"#dc2626", marginLeft:6 }}>· {job.nb_erreur} err.</span>}
                      {job.nb_ignore > 0 && <span style={{ color:"#92400e", marginLeft:6 }}>· {job.nb_ignore} ign.</span>}
                    </td>
                    <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                      <span style={{ background:st.fond, color:st.couleur, borderRadius:20, padding:"2px 9px",
                        fontSize:10, fontWeight:700 }}>{st.label}</span>
                    </td>
                    <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:6 }} onClick={(e) => e.stopPropagation()}>
                        {peutEtreRelance(job) && (
                          <button onClick={() => relancerDepuisHistorique(job)} disabled={occupe || !!importProgress}
                            style={{ padding:"5px 10px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:7,
                              fontSize:11, fontWeight:600, color:"#334155",
                              cursor:(occupe || importProgress) ? "not-allowed" : "pointer" }}>
                            {occupe ? "…" : "↻ Relancer"}
                          </button>
                        )}
                        {peutEtreAnnule(job) && (
                          <button onClick={() => annulerDepuisHistorique(job)} disabled={occupe || !!importProgress}
                            style={{ padding:"5px 10px", background:"#fff", border:"1.5px solid #fecaca", borderRadius:7,
                              fontSize:11, fontWeight:600, color:"#dc2626",
                              cursor:(occupe || importProgress) ? "not-allowed" : "pointer" }}>
                            {occupe ? "…" : "↩︎ Annuler"}
                          </button>
                        )}
                        {job.statut !== "annule" && !peutEtreAnnule(job) && (
                          <span title={`Passé ${FENETRE_ANNULATION_HEURES} h, l'annulation passe par un administrateur - les apprenants de ce lot ont depuis été assignés, ont payé ou ont été transférés.`}
                            style={{ fontSize:10, color:"#94a3b8", fontWeight:600, alignSelf:"center" }}>
                            🔒 Annulation close
                          </span>
                        )}
                        {peutEtreEfface(job) && (
                          <button onClick={() => supprimerDepuisHistorique(job)} disabled={occupe || !!importProgress}
                            title="Effacer cette ligne de l'historique (les données ne sont pas touchées)"
                            style={{ padding:"5px 10px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:7,
                              fontSize:11, fontWeight:600, color:"#64748b",
                              cursor:(occupe || importProgress) ? "not-allowed" : "pointer" }}>
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );

  /* Modal de progression - s'affiche dès la confirmation et reste jusqu'à la fin.
     Volontairement SANS bouton de fermeture : l'import tourne dans la page, la
     fermer en cours de route couperait le lot en deux (situation déjà vécue, où
     l'import a continué 25 minutes dans un onglet abandonné, invisible). */
  const rendreModalProgressionImport = () => !importProgress ? null : (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.62)", display:"flex",
      alignItems:"center", justifyContent:"center", zIndex:10050, padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:"28px 32px", width:440, maxWidth:"92vw",
        boxShadow:"0 24px 60px rgba(0,0,0,0.28)", textAlign:"center" }}>
        <div style={{ fontSize:34, marginBottom:10 }}>📥</div>
        <h3 style={{ margin:"0 0 4px", fontSize:17, color:"#0f172a" }}>{importProgress.label}</h3>
        <p style={{ margin:"0 0 20px", fontSize:12.5, color:"#64748b" }}>
          Création en cours dans la base - merci de patienter.
        </p>

        <div style={{ fontSize:40, fontWeight:800, color: ACCENT_IMPORT, lineHeight:1, marginBottom:14,
          fontVariantNumeric:"tabular-nums" }}>
          {importProgress.pct}%
        </div>

        <div style={{ height:10, background:"#e2e8f0", borderRadius:99, overflow:"hidden", marginBottom:10 }}>
          <div style={{ height:"100%", width:`${importProgress.pct}%`, background: ACCENT_IMPORT,
            borderRadius:99, transition:"width 0.35s ease" }} />
        </div>

        <p style={{ margin:"0 0 18px", fontSize:12, color:"#475569", fontVariantNumeric:"tabular-nums" }}>
          {importProgress.traites} / {importProgress.total} ligne(s) traitée(s)
        </p>


        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"10px 14px",
          fontSize:11.5, color:"#92400e", lineHeight:1.55 }}>
          ⚠️ Ne fermez pas cette page et ne quittez pas l'onglet tant que l'import n'est pas terminé.
        </div>

        {/* Interruption propre : le moteur s'arrête ENTRE deux paquets, jamais au milieu
            d'une ligne. Les lignes déjà créées restent en base - le rapport les liste, et
            le bouton "Annuler cet import" permet ensuite de tout défaire d'un coup. */}
        <button
          onClick={() => { arretImportRef.current = true; setArretDemande(true); }}
          disabled={arretDemande}
          style={{ marginTop:16, padding:"8px 16px", background:"#fff", border:"1.5px solid #e2e8f0",
            borderRadius:8, fontSize:12, fontWeight:600, color: arretDemande ? "#94a3b8" : "#dc2626",
            cursor: arretDemande ? "not-allowed" : "pointer" }}>
          {arretDemande ? "⏳ Arrêt après le paquet en cours…" : "✕ Interrompre l'import"}
        </button>
      </div>
    </div>
  );

  const rendreBoutonAnnulerImport = (onFini) => !dernierImportId ? <span /> : (
    <button
      onClick={async () => {
        const ok = await confirm(
          "Tout ce que cet import a créé sera supprimé : dossiers, versements, classes et comptes d'accès. Cette action est définitive.",
          { titre: "Annuler cet import ?", confirmLabel: "Annuler l'import", danger: true },
        );
        if (!ok) return;
        setAnnulationEnCours(true);
        try {
          const s = await annulerImport({
            apiUrl: API_URL, token: localStorage.getItem("admin_token"), importId: dernierImportId,
          });
          toast.success(`Import annulé - ${s.assignations_parcours || 0} dossier(s), ${s.paiements_parcours || 0} versement(s), `
            + `${s.groupes || 0} classe(s), ${s.comptes || 0} compte(s) supprimé(s)`);
          setDernierImportId(null);
          onFini?.();
        } catch (err) {
          toast.error("Annulation impossible : " + err.message);
        } finally {
          setAnnulationEnCours(false);
        }
      }}
      disabled={annulationEnCours}
      style={{ padding:"9px 18px", background:"#fff", border:"1.5px solid #fecaca", borderRadius:8,
        fontSize:12, color:"#dc2626", cursor: annulationEnCours ? "not-allowed" : "pointer", fontWeight:700 }}>
      {annulationEnCours ? "⏳ Annulation…" : "↩︎ Annuler cet import"}
    </button>
  );


  const [importGroupesConfirming,  setImportGroupesConfirming]  = useState(false);
  const [importGroupesProgress,    setImportGroupesProgress]    = useState(0); // 0-100, pendant confirmerImportGroupes
  const [importGroupesResultats,   setImportGroupesResultats]   = useState([]);
  const [showImportGroupesResultat, setShowImportGroupesResultat] = useState(false);

  // Créneaux séparés par ";" ou ",", format "Lun 08:00-10:00" - non bloquant, un créneau mal
  // formé est signalé en avertissement mais n'empêche pas l'import de la ligne.
  const JOURS_VALIDES_IMPORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const parseHorairesImport = (str) => {
    const horaire = [];
    const erreurs = [];
    if (!str) return { horaire, erreurs };
    str.split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(slot => {
      const m = slot.match(/^([A-Za-zÀ-ÿ]{3,})\.?\s+(\d{1,2}:\d{2})\s*[-–àa]+\s*(\d{1,2}:\d{2})$/i);
      if (!m) { erreurs.push(`Créneau "${slot}" non reconnu (format attendu : Lun 08:00-10:00)`); return; }
      const jourNorm = m[1].slice(0, 3);
      const jour = JOURS_VALIDES_IMPORT.find(j => j.toLowerCase() === jourNorm.toLowerCase());
      if (!jour) { erreurs.push(`Jour "${m[1]}" non reconnu dans "${slot}"`); return; }
      horaire.push({ jour, debut: m[2], fin: m[3] });
    });
    return { horaire, erreurs };
  };

  // Nombre de versements illimité par apprenant (relation déjà réelle : ça peut être 1
  // comme 20 versements déjà encaissés avant la migration) - une cellule =
  // "montant@date@référence" séparés par ";", date et référence optionnelles.
  const parsePaiementsImport = (str) => {
    const paiements = [];
    const erreurs = [];
    if (!str) return { paiements, erreurs };
    str.split(";").map(s => s.trim()).filter(Boolean).forEach(entree => {
      const parts = entree.split("@").map(p => p.trim());
      const montant = Number(parts[0]);
      if (!Number.isFinite(montant) || montant <= 0) { erreurs.push(`Versement "${entree}" non reconnu (montant attendu en premier, ex: 80000@2026-09-01@TP-001)`); return; }
      paiements.push({ montant, date: parts[1] || "", reference: parts[2] || "" });
    });
    return { paiements, erreurs };
  };

  // Grille tarifaire du coaching privé en ligne - mêmes valeurs par défaut que côté Commercial
  // (GRILLE_PRIVE_COM_DEFAULT), ce fichier n'a pas son propre état de config admin. Sert
  // uniquement à dériver la mensualité récurrente à l'import, sans nouvelle colonne Excel.
  const GRILLE_PRIVE_ONB_DEFAULT = {
    classique: { cabinet: 150000, domicile: 200000, en_ligne: 100000 },
    intensive: { cabinet: 200000, domicile: 300000, en_ligne: 200000 },
  };

  // Mois de paiement mensuel - même logique que côté Commercial/PA (mois par mois entre
  // date_debut et date_fin, ou un seul mois si le plan est ouvert).
  const MOIS_FR_ONB = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const getMoisLabelOnb = (periode) => { const [y, m] = periode.split("-"); return `${MOIS_FR_ONB[parseInt(m, 10) - 1]} ${y}`; };
  const genererMoisPaiementsOnb = (dateDebut, dateFin, mensualite) => {
    if (!dateDebut || !mensualite) return [];
    const mois = [];
    const curr = new Date(dateDebut); curr.setDate(1); curr.setHours(0, 0, 0, 0);
    // Plan ouvert (pas de date de fin) : rattrape aussi tous les mois déjà écoulés jusqu'au
    // mois courant inclus (ex: import d'un dossier existant depuis 4 mois) - sinon un seul
    // mois est généré et les versements déjà réalisés n'ont nulle part où s'appliquer ; le
    // cron générerait ensuite les mois suivants comme "en_attente" alors qu'ils sont réglés.
    const limite = dateFin
      ? (() => { const d = new Date(dateFin); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })()
      : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })();
    let i = 0;
    do {
      const periode = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, "0")}`;
      mois.push({ id: `m_${periode}`, periode, label: getMoisLabelOnb(periode), montant: mensualite, statut: "en_attente", tranches: [] });
      curr.setMonth(curr.getMonth() + 1);
      i++;
    } while (curr <= limite && i < 60);
    return mois;
  };

  // Applique les versements déjà importés (montants réels déjà reçus, colonne
  // "Paiements") aux premiers mois générés, dans l'ordre chronologique - sans ça,
  // le mois 1 restait affiché "en attente" alors que l'argent avait bien été perçu
  // (le versement n'existait que dans la liste "Versements enregistrés", jamais
  // rapproché du plan mensuel).
  const appliquerVersementsAuPlanOnb = (moisListe, paiements) => {
    const mois = (moisListe || []).map(m => ({ ...m, tranches: [...(m.tranches || [])] }));
    const versements = [...(paiements || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let idx = 0;
    for (const pmt of versements) {
      let restant = Number(pmt.montant) || 0;
      while (restant > 0 && idx < mois.length) {
        const m = mois[idx];
        const dejaPaye = (m.tranches || []).reduce((s, t) => s + (t.montant || 0), 0);
        const capacite = Math.max(0, m.montant - dejaPaye);
        if (capacite <= 0) { idx++; continue; }
        const part = Math.min(restant, capacite);
        m.tranches.push({ id: `t_imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, montant: part, statut: "paye", date_paiement: pmt.date || null, mode: "Mobile Money", ref: pmt.reference || "", notes: "Import en masse" });
        restant -= part;
        if (part === capacite) idx++;
      }
    }
    return mois.map(m => {
      const totalPaye = (m.tranches || []).reduce((s, t) => s + (t.montant || 0), 0);
      return { ...m, statut: totalPaye >= m.montant ? "paye" : totalPaye > 0 ? "partiel" : "en_attente" };
    });
  };

  const telechargerModeleImportGroupes = () => {
    const headers = ["Nom groupe*", "Filière", "Niveau", "Date de début (AAAA-MM-JJ)", "Date de fin (AAAA-MM-JJ)", "Capacité max", "Coach (email)*", "Assistante (email)*", "Horaires (ex: Lun 08:00-10:00; Mer 14:00-16:00)"];
    const exemple = ["Anglais B1 Soir 3", "Anglais Pro", "B1", "2026-09-01", "", "20", "coach@bet-coaching.ci", "assistante@bet-coaching.ci", "Lun 18:00-20:00; Mer 18:00-20:00"];
    const ws = XLSX.utils.aoa_to_sheet([headers, exemple]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import groupes");
    XLSX.writeFile(wb, "modele_import_groupes_bet.xlsx");
    toast.success("Modèle téléchargé ✓");
  };

  const lireEtPrevisualiserGroupes = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportFichierNom(file.name);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { toast.error("Fichier vide ou non reconnu"); return; }

      const norm = (s) => String(s || "").toLowerCase().trim()
        .replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a").replace(/[ùûü]/g, "u").replace(/[îï]/g, "i").replace(/[ôö]/g, "o")
        .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      const NIVEAUX_VALIDES = ["A1", "A2", "B1", "B2", "C1", "C2"];
      const nomsExistants = new Set(groupes.map(g => (g.nom || "").toLowerCase().trim()));
      const nomsVusDansBatch = new Set();
      const coachsParEmail = new Map(coaches.filter(c => c.email).map(c => [c.email.toLowerCase().trim(), c]));
      const assistantesParEmail = new Map(assistantesEnLigne.filter(a => a.email).map(a => [a.email.toLowerCase().trim(), a]));

      const lignes = rows.map((row, idx) => {
        const r = {};
        Object.keys(row).forEach(k => { r[norm(k)] = String(row[k] || "").trim(); });

        const nom      = r.nom_groupe || r.nom_classe || r.nom || "";
        const filiere  = r.filiere || "";
        const niveauBrut = (r.niveau || "").toUpperCase();
        const niveau   = NIVEAUX_VALIDES.includes(niveauBrut) ? niveauBrut : "";
        const dateDebut = r.date_de_debut_aaaa_mm_jj || r.date_de_debut || r.date_debut || "";
        const dateFin   = r.date_de_fin_aaaa_mm_jj || r.date_de_fin || r.date_fin || "";
        const capaciteBrut = r.capacite_max || r.capacite || "";
        const capacite_max = capaciteBrut ? Number(capaciteBrut) : 20;
        const coachEmailBrut = r.coach_email || r.coach || "";
        const coachTrouve = coachEmailBrut ? coachsParEmail.get(coachEmailBrut.toLowerCase().trim()) : null;
        const assistanteEmailBrut = r.assistante_email || r.assistante || "";
        const assistanteTrouvee = assistanteEmailBrut ? assistantesParEmail.get(assistanteEmailBrut.toLowerCase().trim()) : null;
        const horairesBrut = r.horaires_ex_lun_08_00_10_00_mer_14_00_16_00 || r.horaires || r.horaire || "";
        const { horaire, erreurs: erreursHoraires } = parseHorairesImport(horairesBrut);

        const erreurs = [];
        const avertissements = [...erreursHoraires];
        if (!nom) erreurs.push("Nom du groupe manquant");
        else {
          const nomLower = nom.toLowerCase();
          if (nomsExistants.has(nomLower)) erreurs.push("Un groupe avec ce nom existe déjà");
          if (nomsVusDansBatch.has(nomLower)) erreurs.push("Nom en doublon dans le fichier");
          nomsVusDansBatch.add(nomLower);
        }
        if (!assistanteEmailBrut) erreurs.push("Assistante manquante - obligatoire (elle intervient dès la création, comme pour une inscription manuelle)");
        else if (!assistanteTrouvee) erreurs.push(`Assistante "${assistanteEmailBrut}" introuvable`);
        if (niveauBrut && !niveau) avertissements.push(`Niveau "${niveauBrut}" non reconnu (A1 à C2) - laissé vide`);
        if (!filiere) avertissements.push("Filière non renseignée");
        if (capaciteBrut && (!Number.isFinite(capacite_max) || capacite_max <= 0)) avertissements.push("Capacité invalide - 20 par défaut appliqué");
        if (!coachEmailBrut) erreurs.push("Coach manquant - obligatoire pour une classe déjà existante");
        else if (!coachTrouve) erreurs.push(`Coach "${coachEmailBrut}" introuvable`);

        const ligneVide = Object.values(row).every(v => String(v || "").trim() === "");

        return {
          _idx: idx + 2, nom, filiere, niveau, date_debut: dateDebut, date_fin: dateFin, horaire,
          coach_id: coachTrouve?.id || null, coach_nom: coachTrouve ? `${coachTrouve.prenom||""} ${coachTrouve.nom||""}`.trim() : "",
          assistante_nom: assistanteTrouvee ? `${assistanteTrouvee.prenom||""} ${assistanteTrouvee.nom||""}`.trim() : "",
          capacite_max: (Number.isFinite(capacite_max) && capacite_max > 0) ? capacite_max : 20,
          _erreurs: erreurs, _avertissements: avertissements, _ligneVide: ligneVide,
          _statut: erreurs.length > 0 ? "erreur" : avertissements.length > 0 ? "avertissement" : "ok",
        };
      }).filter(l => !l._ligneVide);

      if (!lignes.length) { toast.error("Aucune ligne exploitable dans le fichier"); return; }
      setImportGroupesPreviewRows(lignes);
      setShowImportGroupesUpload(false);
      setShowImportGroupesPreview(true);
    } catch (err) { toast.error("Erreur lecture fichier : " + err.message); }
  };

  const confirmerImportGroupes = async () => {
    const lignesValides = importGroupesPreviewRows.filter(l => l._statut !== "erreur");
    if (!lignesValides.length) return;
    setImportGroupesConfirming(true);
    setImportGroupesProgress(0);
    arretImportRef.current = false;
    setArretDemande(false);
    setImportProgress({ label: "Import des groupes", pct: 0, traites: 0, total: lignesValides.length });

    try {
      const { importId, resultats, interrompu } = await lancerImport({
        apiUrl: API_URL,
        token: localStorage.getItem("admin_token"),
        type: "groupe",
        fichierNom: importFichierNom || "Import groupes",
        contexte: { type_cours: "en_ligne" },
        // created_by_nom trace l'assistante en ligne qui a réellement amené la
        // classe, comme pour une inscription manuelle.
        lignes: lignesValides.map(l => ({
          ...l,
          created_by_nom: l.assistante_nom ? `${l.assistante_nom} (assistante en ligne)` : null,
        })),
        doitArreter: () => arretImportRef.current,
        onProgress: (pct, info) => {
          setImportGroupesProgress(pct);
          setImportProgress({ label: "Import des groupes", pct, traites: info.traites, total: info.total });
        },
      });

      const { ok, erreur, ignore } = compterResultats(resultats);
      setDernierImportId(importId);
      setImportGroupesResultats(resultats);
      setShowImportGroupesPreview(false);
      setImportGroupesPreviewRows([]);
      setShowImportGroupesResultat(true);
      if (interrompu) {
        toast("Import interrompu - " + ok + " ligne(s) créée(s) avant l'arrêt. "
          + "Le rapport les liste, et « Annuler cet import » permet de tout défaire.",
          { icon: "⏹️", duration: 7000 });
      }
      if (ok > 0) {
        toast.success(`${ok} groupe(s) créé(s)`
          + (erreur ? ` · ${erreur} erreur(s)` : "")
          + (ignore ? ` · ${ignore} déjà présent(s)` : "") + " ✓");
      } else if (ignore > 0) {
        toast(`${ignore} groupe(s) déjà importé(s) - rien à créer`);
      } else {
        toast.error("Aucun groupe créé");
      }
    } catch (err) {
      toast.error("Import interrompu : " + err.message);
    } finally {
      setImportGroupesConfirming(false);
      setImportProgress(null);
    }
  };

  /* ══════════════════════════════════════════════════════
     IMPORT GLOBAL (combiné) - groupes + apprenants en un seul fichier.
     Garde les 2 imports séparés ci-dessus tels quels : celui-ci s'ajoute en complément
     pour le cas où groupes et apprenants sont connus en même temps. Crée d'abord les
     groupes manquants (mêmes règles que "Importer des groupes"), puis réutilise à
     l'identique le pipeline "Importer des apprenants" une fois les classe_id résolus -
     aucune duplication de cette logique déjà existante.
  ══════════════════════════════════════════════════════ */
  const importGlobalFileRef = useRef(null);
  const [showImportGlobalUpload, setShowImportGlobalUpload] = useState(false);
  const [importGlobalProcessing, setImportGlobalProcessing] = useState(false);

  const telechargerModeleImportGlobal = () => {
    const headers = [
      "Nom groupe*", "Filière groupe", "Niveau groupe", "Date début groupe (AAAA-MM-JJ)", "Date fin groupe (AAAA-MM-JJ)",
      "Capacité max groupe", "Coach groupe (email)*", "Horaires groupe (ex: Lun 08:00-10:00; Mer 14:00-16:00)",
      "Nom apprenant*", "Prénom apprenant", "Email apprenant", "Téléphone apprenant", "Niveau apprenant",
      "Date de début formation (AAAA-MM-JJ)", "Assistante (email)*", "Profil (adulte/enfant)",
      "Nom du parent (si enfant)", "Téléphone du parent (si enfant)", "Email du parent (si enfant)", "Paiements", "Notes",
    ];
    const exemple1 = ["Anglais B1 Onboarding 3", "Anglais Pro", "B1", "2026-09-01", "", "20", "coach@bet-coaching.ci", "Lun 18:00-20:00; Mer 18:00-20:00",
      "Kouassi", "Awa", "awa.kouassi@example.com", "0700000000", "B1", "2026-09-01", "assistante@bet-coaching.ci", "adulte", "", "", "", "80000@2026-09-01@TP-001", ""];
    const exemple2 = ["Anglais B1 Onboarding 3", "", "", "", "", "", "", "",
      "Bamba", "Moussa", "moussa.bamba@example.com", "0700000001", "B1", "2026-09-01", "assistante@bet-coaching.ci", "adulte", "", "", "", "80000@2026-09-01@TP-002", ""];
    const ws = XLSX.utils.aoa_to_sheet([headers, exemple1, exemple2]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import global");
    XLSX.writeFile(wb, "modele_import_global_onboarding_bet.xlsx");
    toast.success("Modèle téléchargé ✓");
  };

  const lireEtPrevisualiserGlobal = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportFichierNom(file.name);
    setImportGlobalProcessing(true);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { toast.error("Fichier vide ou non reconnu"); return; }

      const norm = (s) => String(s || "").toLowerCase().trim()
        .replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a").replace(/[ùûü]/g, "u").replace(/[îï]/g, "i").replace(/[ôö]/g, "o")
        .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      const NIVEAUX_VALIDES = ["A1", "A2", "B1", "B2", "C1", "C2"];
      const coachsParEmail = new Map(coaches.filter(c => c.email).map(c => [c.email.toLowerCase().trim(), c]));
      const assistantesParEmail = new Map(assistantesEnLigne.filter(a => a.email).map(a => [a.email.toLowerCase().trim(), a]));
      const token = localStorage.getItem("admin_token");

      const rowsNorm = rows.map(row => {
        const r = {};
        Object.keys(row).forEach(k => { r[norm(k)] = String(row[k] || "").trim(); });
        return r;
      }).filter(r => Object.values(r).some(v => v !== ""));
      if (!rowsNorm.length) { toast.error("Aucune ligne exploitable dans le fichier"); return; }

      // 1. Regroupement par groupe - la 1ère ligne rencontrée pour un nom donné porte les
      //    métadonnées du groupe (les lignes suivantes du même groupe peuvent les laisser vides).
      const groupesGroupes = new Map(); // clé normalisée -> { nom, filiere, ..., rows:[] }
      rowsNorm.forEach(r => {
        const groupeNom = r.nom_groupe || "";
        const cle = normNomImportOnb(groupeNom);
        if (!groupesGroupes.has(cle)) {
          groupesGroupes.set(cle, {
            nom: groupeNom,
            filiere: r.filiere_groupe || "",
            niveauBrut: (r.niveau_groupe || "").toUpperCase(),
            date_debut: r.date_debut_groupe_aaaa_mm_jj || r.date_debut_groupe || "",
            date_fin: r.date_fin_groupe_aaaa_mm_jj || r.date_fin_groupe || "",
            capaciteBrut: r.capacite_max_groupe || "",
            coachEmailBrut: r.coach_groupe_email || r.coach_groupe || "",
            horairesBrut: r.horaires_groupe_ex_lun_08_00_10_00_mer_14_00_16_00 || r.horaires_groupe || "",
            assistanteEmailBrut: r.assistante_email || r.assistante || "",
            rows: [],
          });
        }
        groupesGroupes.get(cle).rows.push(r);
      });

      // 2. Créer les groupes manquants (ceux dont le nom ne correspond à aucun groupe
      //    ouvert existant) - mêmes règles/erreurs que "Importer des groupes".
      let rG = await fetch(`${API_URL}/api/groupes`, { headers: { Authorization: `Bearer ${token}` } });
      let groupesFrais = rG.ok ? ((await rG.json()).groupes || groupes) : groupes;
      let classesOuvertes = groupesFrais.filter(c => c.statut !== "terminé" && c.statut !== "cloture");
      let classesParNom = new Map(classesOuvertes.map(c => [normNomImportOnb(c.nom), c]));
      const erreurCreationParGroupe = new Map();
      let nbGroupesCrees = 0;
      const classesACreer = [];
      let jobImportGlobal = null;

      for (const [cle, g] of groupesGroupes) {
        if (!g.nom || classesParNom.has(cle)) continue;
        const coachTrouve = g.coachEmailBrut ? coachsParEmail.get(g.coachEmailBrut.toLowerCase().trim()) : null;
        const assistanteTrouvee = g.assistanteEmailBrut ? assistantesParEmail.get(g.assistanteEmailBrut.toLowerCase().trim()) : null;
        if (!g.assistanteEmailBrut) { erreurCreationParGroupe.set(cle, "Groupe non créé - assistante manquante"); continue; }
        if (!assistanteTrouvee) { erreurCreationParGroupe.set(cle, `Groupe non créé - assistante "${g.assistanteEmailBrut}" introuvable`); continue; }
        if (!g.coachEmailBrut) { erreurCreationParGroupe.set(cle, "Groupe non créé - coach manquant"); continue; }
        if (!coachTrouve) { erreurCreationParGroupe.set(cle, `Groupe non créé - coach "${g.coachEmailBrut}" introuvable`); continue; }
        const niveau = NIVEAUX_VALIDES.includes(g.niveauBrut) ? g.niveauBrut : "";
        const capaciteBrutNum = g.capaciteBrut ? Number(g.capaciteBrut) : 20;
        const capacite_max = (Number.isFinite(capaciteBrutNum) && capaciteBrutNum > 0) ? capaciteBrutNum : 20;
        const { horaire } = parseHorairesImport(g.horairesBrut);
        classesACreer.push({ cle, ligne: {
          nom: g.nom, filiere: g.filiere || null, niveau: niveau || null,
          date_debut: g.date_debut || null, date_fin: g.date_fin || null,
          capacite_max, horaire, coach_id: coachTrouve.id,
          created_by_nom: `${`${assistanteTrouvee.prenom||""} ${assistanteTrouvee.nom||""}`.trim()} (assistante en ligne)`,
        }});
      }

      // Création des groupes PAR LE MOTEUR, dans le même lot que les apprenants qui
      // suivront. C'est ce qui leur donne un import_id - donc ce qui les rend annulables
      // avec le reste. Créés hors moteur (ancien appel direct à POST /api/groupes), ils
      // n'étaient estampillés nulle part et survivaient à l'annulation, laissant des
      // groupes vides derrière elle.
      if (classesACreer.length) {
        jobImportGlobal = await ouvrirImport({
          apiUrl: API_URL, token: localStorage.getItem("admin_token"),
          type: "apprenant", fichierNom: file.name, nbLignes: rowsNorm.length,
          contexte: { source: "import_masse_onboarding", type_cours: "en_ligne" },
        });
        const { resultats: resGroupes } = await lancerImport({
          apiUrl: API_URL, token: localStorage.getItem("admin_token"),
          importIdExistant: jobImportGlobal, typeLot: "groupe", cloturer: false,
          contexte: { type_cours: "en_ligne" },
          lignes: classesACreer.map(c => c.ligne),
        });
        const parNom = new Map((resGroupes || []).map(r => [r.nom, r]));
        classesACreer.forEach(({ cle, ligne }) => {
          const r = parNom.get(ligne.nom);
          if (!r || r.statut === "erreur") erreurCreationParGroupe.set(cle, `Groupe non créé - ${r?.detail || "erreur inconnue"}`);
          else nbGroupesCrees++;
        });
      }

      // 3. Recharger les groupes puis construire les lignes apprenants exactement comme
      //    "Importer des apprenants".
      rG = await fetch(`${API_URL}/api/groupes`, { headers: { Authorization: `Bearer ${token}` } });
      groupesFrais = rG.ok ? ((await rG.json()).groupes || groupesFrais) : groupesFrais;
      setGroupes(groupesFrais);
      classesOuvertes = groupesFrais.filter(c => c.statut !== "terminé" && c.statut !== "cloture");
      classesParNom = new Map(classesOuvertes.map(c => [normNomImportOnb(c.nom), c]));
      const compteParClasse = new Map();

      const lignesApprenants = [];
      let idx = 1;
      for (const [cle, g] of groupesGroupes) {
        const classeTrouvee = g.nom ? classesParNom.get(cle) : null;
        for (const r of g.rows) {
          idx++;
          const nom        = r.nom_apprenant || r.nom || "";
          const prenom     = r.prenom_apprenant || r.prenom || "";
          const email      = r.email_apprenant || r.email || "";
          const telephone  = r.telephone_apprenant || r.telephone || "";
          const niveauBrut = (r.niveau_apprenant || r.niveau || "").toUpperCase();
          const niveau     = NIVEAUX_VALIDES.includes(niveauBrut) ? niveauBrut : "";
          const dateDebut  = r.date_de_debut_formation_aaaa_mm_jj || r.date_de_debut_formation || "";
          const assistanteEmailBrut = r.assistante_email || r.assistante || g.assistanteEmailBrut || "";
          const assistanteTrouvee = assistanteEmailBrut ? assistantesParEmail.get(assistanteEmailBrut.toLowerCase().trim()) : null;
          const profilBrut = (r.profil_adulte_enfant || r.profil || "adulte").toLowerCase();
          const profilType = profilBrut === "enfant" ? "enfant" : "adulte";
          const nomParent  = r.nom_du_parent_si_enfant || r.nom_parent || "";
          const telParent  = r.telephone_du_parent_si_enfant || r.telephone_parent || "";
        const emailParent = r.email_du_parent_si_enfant || r.email_parent || "";
          const notes      = r.notes || "";

          const erreurs = [];
          const avertissements = [];
          const paiementsBrut = r.paiements || r.versements || "";
          const { paiements, erreurs: erreursPaiements } = parsePaiementsImport(paiementsBrut);
          avertissements.push(...erreursPaiements);
          const montant_paye = paiements.length ? paiements.reduce((s, p) => s + p.montant, 0) : null;

          if (!nom) erreurs.push("Nom de l'apprenant manquant");
          if (g.nom && !classeTrouvee) erreurs.push(erreurCreationParGroupe.get(cle) || `Classe "${g.nom}" introuvable`);
          if (!g.nom) avertissements.push("Aucune classe précisée - sera assignée après l'import (choix groupé)");
          if (!paiements.length) avertissements.push("Aucun paiement renseigné - aucun plan mensuel ne sera créé pour cet apprenant");
          if (!assistanteEmailBrut) erreurs.push("Assistante manquante - obligatoire (elle intervient dès la création, comme pour une inscription manuelle)");
          else if (!assistanteTrouvee) erreurs.push(`Assistante "${assistanteEmailBrut}" introuvable`);
          if (niveauBrut && !niveau) avertissements.push(`Niveau "${niveauBrut}" non reconnu (A1 à C2) - laissé vide`);
          if (!email) avertissements.push("Email non renseigné - un identifiant technique sera généré");
          if (profilType === "enfant" && (!nomParent || !telParent)) erreurs.push("Nom et téléphone du parent obligatoires pour un profil enfant");
        // Non bloquant : sans email du parent, l'enfant reçoit un identifiant technique
        // (<nom>@betacademy.app) et la famille ne reçoit jamais ses accès.
        if (profilType === "enfant" && !emailParent) avertissements.push("Email du parent non renseigné - la famille ne recevra pas les accès de l'enfant");

          if (classeTrouvee) {
            const n = (compteParClasse.get(classeTrouvee.id) || 0) + 1;
            compteParClasse.set(classeTrouvee.id, n);
            const dejaInscrits = classeTrouvee.nb_apprenants || 0;
            if (classeTrouvee.capacite_max && (dejaInscrits + n) > classeTrouvee.capacite_max) {
              avertissements.push(`Classe "${classeTrouvee.nom}" bientôt/déjà à capacité (${dejaInscrits}/${classeTrouvee.capacite_max}) - inscription quand même, ce sont des places déjà réelles`);
            }
          }

          lignesApprenants.push({
            _idx: idx, nom, prenom, email, telephone, niveau, notes, date_debut: dateDebut,
            classe_saisie: g.nom, classe_id: classeTrouvee?.id || null, classe_nom: classeTrouvee?.nom || null,
            assistante_id: assistanteTrouvee?.id || null, assistante_nom: assistanteTrouvee ? `${assistanteTrouvee.prenom||""} ${assistanteTrouvee.nom||""}`.trim() : "",
            profil_type: profilType, nom_parent: nomParent, telephone_parent: telParent, email_parent: emailParent,
            paiements, montant_paye: Number.isFinite(montant_paye) ? montant_paye : null,
            _erreurs: erreurs, _avertissements: avertissements, _ligneVide: false,
            _statut: erreurs.length > 0 ? "erreur" : avertissements.length > 0 ? "avertissement" : "ok",
          });
        }
      }

      if (nbGroupesCrees > 0) toast.success(`${nbGroupesCrees} groupe(s) créé(s) ✓`);
      if (erreurCreationParGroupe.size > 0) toast.error(`${erreurCreationParGroupe.size} groupe(s) n'ont pas pu être créés - voir le détail par ligne`);

      // Réutilise à l'identique la suite du pipeline "Importer des apprenants" déjà existant.
      setImportGlobalJobId(jobImportGlobal);
      setImportApprenantsPreviewRows(lignesApprenants);
      setShowImportGlobalUpload(false);
      setShowImportApprenantsPreview(true);
    } catch (err) {
      toast.error("Erreur lecture fichier : " + err.message);
    } finally {
      setImportGlobalProcessing(false);
    }
  };

  /* ══════════════════════════════════════════════════════
     IMPORT COACHING PRIVÉ EN LIGNE (Excel) - pour des relations
     déjà réelles (apprenant + coach déjà ensemble). Reproduit
     directement l'état final que produit normalement le flux
     PA → Onboarding (dossierForm/finaliserDossier ci-dessus) :
     classe type_cours:"prive", capacite_max:1, coach déjà assigné,
     dossier avec routing_statut:"onboarding_affecte". Coach
     obligatoire - un privé sans coach n'a pas de sens pour une
     relation déjà réelle.
  ══════════════════════════════════════════════════════ */
  const importPriveFileRef = useRef(null);
  const [showImportPriveUpload,  setShowImportPriveUpload]  = useState(false);
  const [importPrivePreviewRows, setImportPrivePreviewRows] = useState([]);
  const [showImportPrivePreview, setShowImportPrivePreview] = useState(false);
  const [importPriveConfirming,  setImportPriveConfirming]  = useState(false);
  const [importPriveProgress,    setImportPriveProgress]    = useState(0); // 0-100, pendant confirmerImportPrive
  const [importPriveResultats,   setImportPriveResultats]   = useState([]);
  const [showImportPriveResultat, setShowImportPriveResultat] = useState(false);

  const telechargerModeleImportPrive = () => {
    const headers = [
      "Nom apprenant*", "Prénom apprenant", "Email apprenant", "Téléphone apprenant", "Niveau",
      "Filière / Formation", "Coach (email)*", "Assistante (email)*",
      "Date de début (AAAA-MM-JJ)", "Date de fin (AAAA-MM-JJ)", "Pack (classique/intensive)",
      "Profil (adulte/enfant)", "Nom du parent (si enfant)", "Téléphone du parent (si enfant)", "Email du parent (si enfant)",
      "Paiements", "Objectif client", "Notes", "Disponibilités (ex: Lun 08:00-10:00; Mer 14:00-16:00)",
    ];
    const exemple = [
      "Kouassi", "Awa", "awa.kouassi@example.com", "0700000000", "B1", "Anglais Pro",
      "coach@bet-coaching.ci", "assistante@bet-coaching.ci", "2026-09-01", "", "classique",
      "adulte", "", "", "",
      "80000@2026-09-01@TP-001; 70000@2026-10-01@TP-002",
      "", "", "Lun 18:00-20:00; Mer 18:00-20:00",
    ];
    // 2e ligne : profil enfant - email/téléphone de l'apprenant laissés vides (ce sont ceux
    // du parent qui font foi), nom ET téléphone du parent obligatoires.
    const exempleEnfant = [
      "Bamba", "Yannick", "", "", "A1", "Anglais Kids",
      "coach@bet-coaching.ci", "assistante@bet-coaching.ci", "2026-09-01", "", "classique",
      "enfant", "Bamba Bernard", "0500000000", "parent.bamba@example.com",
      "50000@2026-09-01@TP-003",
      "", "", "Sam 10:00-12:00",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, exemple, exempleEnfant]);
    ws["!cols"] = headers.map(() => ({ wch: 24 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import coaching privé");
    XLSX.writeFile(wb, "modele_import_coaching_prive_en_ligne_bet.xlsx");
    toast.success("Modèle téléchargé ✓");
  };

  const lireEtPrevisualiserPrive = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportFichierNom(file.name);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { toast.error("Fichier vide ou non reconnu"); return; }

      const norm = (s) => String(s || "").toLowerCase().trim()
        .replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a").replace(/[ùûü]/g, "u").replace(/[îï]/g, "i").replace(/[ôö]/g, "o")
        .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      const NIVEAUX_VALIDES = ["A1", "A2", "B1", "B2", "C1", "C2"];
      const coachsParEmail = new Map(coaches.filter(c => c.email).map(c => [c.email.toLowerCase().trim(), c]));
      const assistantesParEmail = new Map(assistantesEnLigne.filter(a => a.email).map(a => [a.email.toLowerCase().trim(), a]));

      const lignes = rows.map((row, idx) => {
        const r = {};
        Object.keys(row).forEach(k => { r[norm(k)] = String(row[k] || "").trim(); });

        const nom       = r.nom_apprenant || r.nom || "";
        const prenom    = r.prenom_apprenant || r.prenom || "";
        const email     = r.email_apprenant || r.email || "";
        const telephone = r.telephone_apprenant || r.telephone || "";
        const niveauBrut = (r.niveau || "").toUpperCase();
        const niveau    = NIVEAUX_VALIDES.includes(niveauBrut) ? niveauBrut : "";
        const filiere   = r.filiere_formation || r.filiere || r.formation || "";
        const dateDebut = r.date_de_debut_aaaa_mm_jj || r.date_de_debut || r.date_debut || "";
        const dateFin   = r.date_de_fin_aaaa_mm_jj || r.date_de_fin || r.date_fin || "";
        const packBrut  = (r.pack_classique_intensive || r.pack || "classique").toLowerCase();
        const pack      = packBrut === "intensive" ? "intensive" : "classique";
        const profilBrut = (r.profil_adulte_enfant || r.profil || "adulte").toLowerCase();
        const profilType = profilBrut === "enfant" ? "enfant" : "adulte";
        const nomParent  = r.nom_du_parent_si_enfant || r.nom_parent || "";
        const telParent  = r.telephone_du_parent_si_enfant || r.telephone_parent || "";
        const emailParent = r.email_du_parent_si_enfant || r.email_parent || "";
        const objectif  = r.objectif_client || r.objectif || "";
        const notes     = r.notes || "";
        const coachEmailBrut = r.coach_email || r.coach || "";
        const coachTrouve = coachEmailBrut ? coachsParEmail.get(coachEmailBrut.toLowerCase().trim()) : null;
        const assistanteEmailBrut = r.assistante_email || r.assistante || "";
        const assistanteTrouvee = assistanteEmailBrut ? assistantesParEmail.get(assistanteEmailBrut.toLowerCase().trim()) : null;
        const disposBrut = r.disponibilites_ex_lun_08_00_10_00_mer_14_00_16_00 || r.disponibilites || r.horaires || "";
        const { horaire, erreurs: erreursHoraires } = parseHorairesImport(disposBrut);

        const erreurs = [];
        const avertissements = [...erreursHoraires];

        // Nombre de versements illimité - colonne unique "montant@date@référence" séparés par ";".
        const paiementsBrut = r.paiements || r.versements || "";
        const { paiements, erreurs: erreursPaiements } = parsePaiementsImport(paiementsBrut);
        avertissements.push(...erreursPaiements);
        const montant_paye = paiements.length ? paiements.reduce((s, p) => s + p.montant, 0) : null;

        if (!nom) erreurs.push("Nom de l'apprenant manquant");
        if (!coachEmailBrut) erreurs.push("Coach manquant - obligatoire pour du coaching privé");
        else if (!coachTrouve) erreurs.push(`Coach "${coachEmailBrut}" introuvable`);
        if (!assistanteEmailBrut) erreurs.push("Assistante manquante - obligatoire (elle intervient dès la création, comme pour une inscription manuelle)");
        else if (!assistanteTrouvee) erreurs.push(`Assistante "${assistanteEmailBrut}" introuvable`);
        if (niveauBrut && !niveau) avertissements.push(`Niveau "${niveauBrut}" non reconnu (A1 à C2) - laissé vide`);
        // Un enfant n'a pas d'email propre (ce sont les coordonnées du parent qui font foi) :
        // l'avertissement ne concerne donc que les profils adultes.
        if (!email && profilType !== "enfant") avertissements.push("Email non renseigné - un identifiant technique sera généré");
        if (profilType === "enfant" && (!nomParent || !telParent)) erreurs.push("Nom et téléphone du parent obligatoires pour un profil enfant");
        // Non bloquant : sans email du parent, l'enfant reçoit un identifiant technique
        // (<nom>@betacademy.app) et la famille ne reçoit jamais ses accès.
        if (profilType === "enfant" && !emailParent) avertissements.push("Email du parent non renseigné - la famille ne recevra pas les accès de l'enfant");

        // Une ligne n'est ignorée que si TOUTE la ligne Excel est vide - sinon elle doit
        // rester visible (même invalide) pour que l'utilisateur voie ce qui a été lu, au
        // lieu de la faire disparaître silencieusement de l'aperçu (ex: mauvais modèle
        // importé par erreur - colonnes reconnues partiellement, nom/coach absents).
        const ligneVide = Object.values(row).every(v => String(v || "").trim() === "");

        return {
          _idx: idx + 2, nom, prenom, email, telephone, niveau, filiere, date_debut: dateDebut, date_fin: dateFin, horaire,
          pack, profil_type: profilType, nom_parent: nomParent, telephone_parent: telParent, email_parent: emailParent,
          paiements, montant_paye: Number.isFinite(montant_paye) ? montant_paye : null, objectif, notes,
          coach_id: coachTrouve?.id || null, coach_nom: coachTrouve ? `${coachTrouve.prenom||""} ${coachTrouve.nom||""}`.trim() : "",
          assistante_id: assistanteTrouvee?.id || null, assistante_nom: assistanteTrouvee ? `${assistanteTrouvee.prenom||""} ${assistanteTrouvee.nom||""}`.trim() : "",
          _erreurs: erreurs, _avertissements: avertissements, _ligneVide: ligneVide,
          _statut: erreurs.length > 0 ? "erreur" : avertissements.length > 0 ? "avertissement" : "ok",
        };
      }).filter(l => !l._ligneVide);

      if (!lignes.length) { toast.error("Aucune ligne exploitable dans le fichier"); return; }
      setImportPrivePreviewRows(lignes);
      setShowImportPriveUpload(false);
      setShowImportPrivePreview(true);
    } catch (err) { toast.error("Erreur lecture fichier : " + err.message); }
  };

  const confirmerImportPrive = async () => {
    const lignesValides = importPrivePreviewRows.filter(l => l._statut !== "erreur");
    if (!lignesValides.length) return;
    setImportPriveConfirming(true);
    setImportPriveProgress(0);
    arretImportRef.current = false;
    setArretDemande(false);
    setImportProgress({ label: "Import des coachings privés", pct: 0, traites: 0, total: lignesValides.length });

    // Le plan mensuel dérive de la grille tarifaire, qui vit côté dashboard : il est
    // donc calculé ici et voyage avec la ligne, plutôt que d'être recalculé côté serveur.
    const lignes = lignesValides.map((l) => {
      if (!l.date_debut) return l;
      const mensualite = GRILLE_PRIVE_ONB_DEFAULT[l.pack]?.en_ligne || 0;
      if (mensualite <= 0) return l;
      return {
        ...l,
        plan_paiement: {
          type: "mensuel", mensualite,
          date_debut_formation: l.date_debut, date_fin_formation: l.date_fin || null,
          mois_paiements: appliquerVersementsAuPlanOnb(
            genererMoisPaiementsOnb(l.date_debut, borneEcheancier(l.date_debut, l.date_fin || null, l.paiements), mensualite),
            l.paiements || [],
          ),
          jour_echeance: new Date(l.date_debut).getDate(), actif: true,
        },
      };
    });

    try {
      const { importId, resultats, interrompu } = await lancerImport({
        apiUrl: API_URL,
        token: localStorage.getItem("admin_token"),
        type: "prive_en_ligne",
        fichierNom: importFichierNom || "Import coaching privé en ligne",
        contexte: { source: "import_masse_onboarding", type_cours: "en_ligne" },
        lignes,
        doitArreter: () => arretImportRef.current,
        onProgress: (pct, info) => {
          setImportPriveProgress(pct);
          setImportProgress({ label: "Import des coachings privés", pct, traites: info.traites, total: info.total });
        },
      });

      const { ok, erreur, ignore } = compterResultats(resultats);
      setDernierImportId(importId);
      setImportPriveResultats(resultats);
      setShowImportPrivePreview(false);
      setImportPrivePreviewRows([]);
      setShowImportPriveResultat(true);
      if (interrompu) {
        toast("Import interrompu - " + ok + " ligne(s) créée(s) avant l'arrêt. "
          + "Le rapport les liste, et « Annuler cet import » permet de tout défaire.",
          { icon: "⏹️", duration: 7000 });
      }
      if (ok > 0) {
        toast.success(`${ok} coaching(s) privé(s) créé(s)`
          + (erreur ? ` · ${erreur} erreur(s)` : "")
          + (ignore ? ` · ${ignore} déjà présent(s)` : "") + " ✓");
      } else if (ignore > 0) {
        toast(`${ignore} ligne(s) déjà importée(s) - rien à créer`);
      } else {
        toast.error("Aucun coaching privé créé");
      }
    } catch (err) {
      toast.error("Import interrompu : " + err.message);
    } finally {
      setImportPriveConfirming(false);
      setImportProgress(null);
    }
  };

  /* ══════════════════════════════════════════════════════
     IMPORT APPRENANTS (Excel) - dans des classes de groupe EN LIGNE
     déjà existantes. Miroir exact de l'import apprenants côté
     Commercial : colonne "Classe" optionnelle (résolution par nom
     exact, lignes sans classe mises de côté pour un choix groupé
     après import), colonne "Paiements" illimitée (montant@date@réf),
     plan mensuel récurrent activé automatiquement dès que la date de
     début est renseignée (mensualité = 1er versement). "Assistante
     (email)" obligatoire - comme pour les 2 autres imports Onboarding,
     elle intervient dès le début côté site web, une migration doit
     refléter ça.
  ══════════════════════════════════════════════════════ */
  const importApprenantsFileRef = useRef(null);
  const [showImportApprenantsUpload,   setShowImportApprenantsUpload]   = useState(false);
  const [importApprenantsPreviewRows,  setImportApprenantsPreviewRows]  = useState([]);
  const [showImportApprenantsPreview,  setShowImportApprenantsPreview]  = useState(false);
  const [importApprenantsConfirming,   setImportApprenantsConfirming]   = useState(false);
  const [importApprenantsResultats,    setImportApprenantsResultats]    = useState([]);
  const [showImportApprenantsResultat, setShowImportApprenantsResultat] = useState(false);
  const [importApprenantsEnAttente,    setImportApprenantsEnAttente]    = useState([]);
  const [showImportApprenantsChoixClasse, setShowImportApprenantsChoixClasse] = useState(false);
  const [importApprenantsClasseChoisieId, setImportApprenantsClasseChoisieId] = useState("");
  const [importApprenantsProgress, setImportApprenantsProgress] = useState(0);

  /* Un import en masse tourne DANS la page, pas sur le serveur : chaque ligne enchaîne
     plusieurs appels (dossier, versements, groupe, apprenant). Fermer l'onglet ou
     recharger tue la boucle en plein milieu - le lot est alors à moitié importé, sans
     aucun signal. Le navigateur demande donc confirmation tant qu'un import tourne
     (les modales, elles, refusent déjà de se fermer - voir leurs onClose). */
  const importEnCours = importGroupesConfirming || importPriveConfirming || importApprenantsConfirming || importGlobalProcessing;
  useEffect(() => {
    if (!importEnCours) return;
    const avertirAvantFermeture = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", avertirAvantFermeture);
    return () => window.removeEventListener("beforeunload", avertirAvantFermeture);
  }, [importEnCours]);
  const TAILLE_LOT_IMPORT_APPRENANTS_ONB = 10;

  const normNomImportOnb = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");

  const telechargerModeleImportApprenants = () => {
    const headers = [
      "Nom apprenant*", "Prénom apprenant", "Email apprenant", "Téléphone apprenant", "Niveau",
      "Classe (nom exact, laisser vide pour choisir après import)", "Date de début (AAAA-MM-JJ)",
      "Assistante (email)*", "Profil (adulte/enfant)", "Nom du parent (si enfant)", "Téléphone du parent (si enfant)", "Email du parent (si enfant)",
      "Paiements", "Notes",
    ];
    const exemple = [
      "Kouassi", "Awa", "awa.kouassi@example.com", "0700000000", "B1", "Anglais B1 Onboarding Test", "2026-09-01",
      "assistante@bet-coaching.ci", "adulte", "", "", "",
      "80000@2026-09-01@TP-001; 70000@2026-10-01@TP-002",
      "",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, exemple]);
    ws["!cols"] = headers.map(() => ({ wch: 26 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import apprenants");
    XLSX.writeFile(wb, "modele_import_apprenants_onboarding_bet.xlsx");
    toast.success("Modèle téléchargé ✓");
  };

  const lireEtPrevisualiserApprenants = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportFichierNom(file.name);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { toast.error("Fichier vide ou non reconnu"); return; }

      const norm = (s) => String(s || "").toLowerCase().trim()
        .replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a").replace(/[ùûü]/g, "u").replace(/[îï]/g, "i").replace(/[ôö]/g, "o")
        .replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      const NIVEAUX_VALIDES = ["A1", "A2", "B1", "B2", "C1", "C2"];

      // Liste fraîche des classes en ligne - jamais se fier au seul état déjà chargé (bug déjà
      // rencontré côté Commercial : une liste pas encore chargée fait échouer TOUTE résolution).
      const token = localStorage.getItem("admin_token");
      let groupesFrais = groupes;
      try {
        const rG = await fetch(`${API_URL}/api/groupes`, { headers: { Authorization: `Bearer ${token}` } });
        if (rG.ok) { const dG = await rG.json(); groupesFrais = dG.groupes || groupes; setGroupes(groupesFrais); }
      } catch { /* on retombe sur l'état déjà en mémoire */ }
      const classesOuvertes = groupesFrais.filter(c => c.statut !== "terminé" && c.statut !== "cloture");
      const classesParNom   = new Map(classesOuvertes.map(c => [normNomImportOnb(c.nom), c]));
      const compteParClasse = new Map();
      const assistantesParEmail = new Map(assistantesEnLigne.filter(a => a.email).map(a => [a.email.toLowerCase().trim(), a]));

      const lignes = rows.map((row, idx) => {
        const r = {};
        Object.keys(row).forEach(k => { r[norm(k)] = String(row[k] || "").trim(); });

        const nom        = r.nom_apprenant || r.nom || "";
        const prenom     = r.prenom_apprenant || r.prenom || "";
        const email      = r.email_apprenant || r.email || "";
        const telephone  = r.telephone_apprenant || r.telephone || "";
        const niveauBrut = (r.niveau || "").toUpperCase();
        const niveau     = NIVEAUX_VALIDES.includes(niveauBrut) ? niveauBrut : "";
        const classeBrut = r.classe_nom_exact_laisser_vide_pour_choisir_apres_import || r.classe || r.nom_classe || r.classe_nom || "";
        const classeTrouvee = classeBrut ? classesParNom.get(normNomImportOnb(classeBrut)) : null;
        const dateDebut  = r.date_de_debut_aaaa_mm_jj || r.date_de_debut || r.date_debut || "";
        const assistanteEmailBrut = r.assistante_email || r.assistante || "";
        const assistanteTrouvee = assistanteEmailBrut ? assistantesParEmail.get(assistanteEmailBrut.toLowerCase().trim()) : null;
        const profilBrut = (r.profil_adulte_enfant || r.profil || "adulte").toLowerCase();
        const profilType = profilBrut === "enfant" ? "enfant" : "adulte";
        const nomParent   = r.nom_du_parent_si_enfant || r.nom_parent || "";
        const telParent   = r.telephone_du_parent_si_enfant || r.telephone_parent || "";
        const emailParent = r.email_du_parent_si_enfant || r.email_parent || "";
        const notes       = r.notes || "";

        const erreurs = [];
        const avertissements = [];
        const paiementsBrut = r.paiements || r.versements || "";
        const { paiements, erreurs: erreursPaiements } = parsePaiementsImport(paiementsBrut);
        avertissements.push(...erreursPaiements);
        const montant_paye = paiements.length ? paiements.reduce((s, p) => s + p.montant, 0) : null;

        if (!nom) erreurs.push("Nom de l'apprenant manquant");
        if (classeBrut && !classeTrouvee) erreurs.push(`Classe "${classeBrut}" introuvable ou clôturée`);
        if (!classeBrut) avertissements.push("Aucune classe précisée - sera assignée après l'import (choix groupé)");
        // Un apprenant n'est normalement jamais assigné à une classe sans avoir déjà payé -
        // sans versement, aucun plan mensuel ne peut être créé (la mensualité se dérive du
        // montant du 1er versement). Import quand même autorisé, mais signalé.
        if (!paiements.length) avertissements.push("Aucun paiement renseigné - aucun plan mensuel ne sera créé pour cet apprenant");
        if (!assistanteEmailBrut) erreurs.push("Assistante manquante - obligatoire (elle intervient dès la création, comme pour une inscription manuelle)");
        else if (!assistanteTrouvee) erreurs.push(`Assistante "${assistanteEmailBrut}" introuvable`);
        if (niveauBrut && !niveau) avertissements.push(`Niveau "${niveauBrut}" non reconnu (A1 à C2) - laissé vide`);
        if (!email) avertissements.push("Email non renseigné - un identifiant technique sera généré");
        if (profilType === "enfant" && (!nomParent || !telParent)) erreurs.push("Nom et téléphone du parent obligatoires pour un profil enfant");
        // Non bloquant : sans email du parent, l'enfant reçoit un identifiant technique
        // (<nom>@betacademy.app) et la famille ne reçoit jamais ses accès.
        if (profilType === "enfant" && !emailParent) avertissements.push("Email du parent non renseigné - la famille ne recevra pas les accès de l'enfant");

        if (classeTrouvee) {
          const n = (compteParClasse.get(classeTrouvee.id) || 0) + 1;
          compteParClasse.set(classeTrouvee.id, n);
          const dejaInscrits = classeTrouvee.nb_apprenants || 0;
          if (classeTrouvee.capacite_max && (dejaInscrits + n) > classeTrouvee.capacite_max) {
            avertissements.push(`Classe "${classeTrouvee.nom}" bientôt/déjà à capacité (${dejaInscrits}/${classeTrouvee.capacite_max}) - inscription quand même, ce sont des places déjà réelles`);
          }
        }

        const ligneVide = Object.values(row).every(v => String(v || "").trim() === "");

        return {
          _idx: idx + 2, nom, prenom, email, telephone, niveau, notes, date_debut: dateDebut,
          classe_saisie: classeBrut, classe_id: classeTrouvee?.id || null, classe_nom: classeTrouvee?.nom || null,
          assistante_id: assistanteTrouvee?.id || null, assistante_nom: assistanteTrouvee ? `${assistanteTrouvee.prenom||""} ${assistanteTrouvee.nom||""}`.trim() : "",
          profil_type: profilType, nom_parent: nomParent, telephone_parent: telParent, email_parent: emailParent,
          paiements, montant_paye: Number.isFinite(montant_paye) ? montant_paye : null,
          _erreurs: erreurs, _avertissements: avertissements, _ligneVide: ligneVide,
          _statut: erreurs.length > 0 ? "erreur" : avertissements.length > 0 ? "avertissement" : "ok",
        };
      }).filter(l => !l._ligneVide);

      if (!lignes.length) { toast.error("Aucune ligne exploitable dans le fichier"); return; }
      setImportApprenantsPreviewRows(lignes);
      setShowImportApprenantsUpload(false);
      setShowImportApprenantsPreview(true);
    } catch (err) { toast.error("Erreur lecture fichier : " + err.message); }
  };

  // Corrige en direct la classe saisie sur une ligne de l'aperçu (sans réuploader le fichier).
  const corrigerClasseLigneApprenant = (idx, nouvelleValeur) => {
    const classesOuvertes = groupes.filter(c => c.statut !== "terminé" && c.statut !== "cloture");
    const classesParNom   = new Map(classesOuvertes.map(c => [normNomImportOnb(c.nom), c]));
    setImportApprenantsPreviewRows(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const classeBrut = nouvelleValeur.trim();
      const classeTrouvee = classeBrut ? classesParNom.get(normNomImportOnb(classeBrut)) : null;
      const erreurs = l._erreurs.filter(e2 => !e2.startsWith("Classe "));
      const avertissements = l._avertissements.filter(w => !w.startsWith("Aucune classe précisée"));
      if (classeBrut && !classeTrouvee) erreurs.push(`Classe "${classeBrut}" introuvable ou clôturée`);
      if (!classeBrut) avertissements.push("Aucune classe précisée - sera assignée après l'import (choix groupé)");
      return {
        ...l, classe_saisie: classeBrut, classe_id: classeTrouvee?.id || null, classe_nom: classeTrouvee?.nom || null,
        _erreurs: erreurs, _avertissements: avertissements,
        _statut: erreurs.length > 0 ? "erreur" : avertissements.length > 0 ? "avertissement" : "ok",
      };
    }));
  };

  const confirmerImportApprenants = async () => {
    const lignesValides = importApprenantsPreviewRows.filter(l => l._statut !== "erreur");
    if (!lignesValides.length) return;
    setImportApprenantsConfirming(true);
    setImportApprenantsProgress(0);
    arretImportRef.current = false;
    setArretDemande(false);
    setImportProgress({ label: "Import des apprenants", pct: 0, traites: 0, total: lignesValides.length });

    // Plan mensuel récurrent, dès qu'une date de début et au moins un versement sont
    // connus. La mensualité vient du PREMIER versement - c'est ce que l'apprenant paie
    // réellement chaque mois - là où le coaching privé la tire de la grille tarifaire.
    // Sans ce plan, l'onglet Paiement de la fiche reste vide malgré des versements bien
    // enregistrés : c'est autour du plan que la fiche affiche l'échéancier.
    const lignes = lignesValides.map((l) => {
      if (!l.date_debut || !l.paiements?.length) return l;
      const mensualite = l.paiements[0].montant;
      if (!(mensualite > 0)) return l;
      return {
        ...l,
        plan_paiement: {
          type: "mensuel", mensualite,
          date_debut_formation: l.date_debut, date_fin_formation: null,
          mois_paiements: appliquerVersementsAuPlanOnb(
            genererMoisPaiementsOnb(l.date_debut, borneEcheancier(l.date_debut, null, l.paiements), mensualite),
            l.paiements,
          ),
          jour_echeance: new Date(l.date_debut).getDate(), actif: true,
        },
      };
    });

    try {
      const { importId, resultats, interrompu } = await lancerImport({
        apiUrl: API_URL,
        token: localStorage.getItem("admin_token"),
        type: "apprenant",
        importIdExistant: importGlobalJobId,
        fichierNom: importFichierNom || "Import apprenants",
        contexte: { source: "import_masse_onboarding", type_cours: "en_ligne" },
        lignes,
        doitArreter: () => arretImportRef.current,
        onProgress: (pct, info) => {
          setImportApprenantsProgress(pct);
          setImportProgress({ label: "Import des apprenants", pct, traites: info.traites, total: info.total });
        },
      });

      const { ok, erreur, ignore } = compterResultats(resultats);
      setDernierImportId(importId);
      setImportGlobalJobId(null); // lot consommé - l'import suivant ouvrira le sien
      setImportApprenantsResultats(resultats);
      setShowImportApprenantsPreview(false);
      setImportApprenantsPreviewRows([]);
      setShowImportApprenantsResultat(true);

      // Lignes sans groupe : elles restent à affecter en une fois, comme avant.
      const sansGroupe = lignesValides.filter(l => !l.classe_id);
      if (sansGroupe.length) {
        const parNom = new Map(resultats.map(r => [r.nom, r]));
        setImportApprenantsEnAttente(sansGroupe.filter(l => {
          const r = parNom.get([l.prenom, l.nom].filter(Boolean).join(" "));
          return r && r.statut === "ok";
        }).map(l => ({
          nom: [l.prenom, l.nom].filter(Boolean).join(" "), nomSeul: l.nom, prenom: l.prenom,
          email: l.email, telephone: l.telephone, niveau: l.niveau, profil_type: l.profil_type,
        })));
      }

      if (interrompu) {
        toast("Import interrompu - " + ok + " ligne(s) créée(s) avant l'arrêt. "
          + "Le rapport les liste, et « Annuler cet import » permet de tout défaire.",
          { icon: "⏹️", duration: 7000 });
      }
      if (ok > 0) {
        toast.success(`${ok} apprenant(s) importé(s)`
          + (erreur ? ` · ${erreur} erreur(s)` : "")
          + (ignore ? ` · ${ignore} déjà présent(s)` : "") + " ✓");
      } else if (ignore > 0) {
        toast(`${ignore} apprenant(s) déjà importé(s) - rien à créer`);
      } else {
        toast.error("Aucun apprenant importé");
      }
    } catch (err) {
      toast.error("Import interrompu : " + err.message);
    } finally {
      setImportApprenantsConfirming(false);
      setImportProgress(null);
    }
  };

  const confirmerChoixClasseGroupe = async () => {
    const classeCible = groupes.find(c => String(c.id) === String(importApprenantsClasseChoisieId));
    if (!classeCible) { toast.error("Choisissez une classe"); return; }
    setImportApprenantsConfirming(true);
    setImportApprenantsProgress(0);
    const token = localStorage.getItem("admin_token");
    const authH = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const resultatsMaj = [...importApprenantsResultats];
    let traites = 0;
    const total = importApprenantsEnAttente.length;

    const traiterLigne = async (l) => {
      try {
        await fetch(`${API_URL}/api/parcours/assignations/${l.assignationId}`, {
          method: "PATCH", headers: authH,
          body: JSON.stringify({
            /* Fusion et non remplacement : le PATCH écrase `suivi_demarrage` en entier, et
               une ligne d'import rapprochée d'un dossier web existant effaçait la formule
               choisie par le client - justement celle qui sert à l'affecter en classe. */
            suivi_demarrage: { ...(apprenants.find(x => x.id === l.assignationId)?.suivi_demarrage || {}), classe_id: classeCible.id, classe_nom: classeCible.nom, coach_id: classeCible.coach_id || null, coach_nom: classeCible.coach_nom || null, date_assignation: new Date().toISOString().slice(0, 10) },
            routing_statut: "onboarding_affecte", statut: "converti",
          }),
        });
        const rApp = await fetch(`${API_URL}/api/groupes/${classeCible.id}/apprenants`, {
          method: "POST", headers: authH,
          body: JSON.stringify({
            nom_apprenant: l.nomSeul, prenom_apprenant: l.prenom || "",
            email_apprenant: l.profil_type === "enfant" ? "" : (l.email || ""),
            telephone: l.profil_type === "enfant" ? "" : (l.telephone || ""),
            niveau: l.niveau || classeCible.niveau || "",
            note: JSON.stringify({ programme: classeCible.filiere || "Formation", date_debut: classeCible.date_debut || null, assignation_id: l.assignationId }),
          }),
        });
        const idx = resultatsMaj.findIndex(r => r.nom === l.nom && r.detail.startsWith("À assigner après import"));
        if (rApp.ok) {
          if (idx >= 0) resultatsMaj[idx] = { ...resultatsMaj[idx], detail: `Inscrit dans "${classeCible.nom}"` };
        } else {
          const d = await rApp.json().catch(() => ({}));
          if (idx >= 0) resultatsMaj[idx] = { ...resultatsMaj[idx], statut: "erreur", detail: "Apprenant : " + (d.error || rApp.statusText) };
        }
      } catch (err) {
        const idx = resultatsMaj.findIndex(r => r.nom === l.nom && r.detail.startsWith("À assigner après import"));
        if (idx >= 0) resultatsMaj[idx] = { ...resultatsMaj[idx], statut: "erreur", detail: err.message };
      } finally {
        traites++;
        setImportApprenantsProgress(Math.round((traites / total) * 100));
      }
    };

    for (let i = 0; i < importApprenantsEnAttente.length; i += TAILLE_LOT_IMPORT_APPRENANTS_ONB) {
      const lot = importApprenantsEnAttente.slice(i, i + TAILLE_LOT_IMPORT_APPRENANTS_ONB);
      await Promise.all(lot.map(traiterLigne));
    }

    setImportApprenantsConfirming(false);
    setImportApprenantsResultats(resultatsMaj);
    setImportApprenantsEnAttente([]);
    setImportApprenantsClasseChoisieId("");
    setShowImportApprenantsChoixClasse(false);
    setShowImportApprenantsResultat(true);
    toast.success(`Lot assigné à "${classeCible.nom}" ✓`);
  };

  const editGroupe = async () => {
    if (!groupeForm.nom.trim()) { toast.error("Le nom du groupe est requis"); return; }
    const token = localStorage.getItem("admin_token");
    setGroupeSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}`, {
        method:"PATCH",
        headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ ...groupeForm, coach_id: groupeForm.coach_id || null })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const updated = d.groupe || { ...selectedGroupe, ...groupeForm };
      setGroupes(prev => prev.map(g => g.id===selectedGroupe.id ? {...g,...updated} : g));
      setSelectedGroupe(prev => ({...prev,...updated}));
      setShowEditGroupe(false);
      toast.success("Groupe mis à jour ✓");
    } catch(e) { toast.error(e.message || "Erreur modification"); }
    finally { setGroupeSaving(false); }
  };

  const fetchObPresences = async () => {
    if (!selectedGroupe) return;
    const token = localStorage.getItem("admin_token");
    setObPresencesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/presences`, { headers:{ Authorization:`Bearer ${token}` } });
      if (!r.ok) { console.error("[presences PA] HTTP", r.status); setObPresences([]); return; }
      const d = await r.json();
      setObPresences(d.presences || []);
    } catch (e) {
      console.error("[presences PA]", e);
      setObPresences([]);
    } finally { setObPresencesLoading(false); }
  };

  const fetchObSessions = async () => {
    if (!selectedGroupe) return;
    const token = localStorage.getItem("admin_token");
    setObSessionsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${selectedGroupe.id}/cours`, { headers:{ Authorization:`Bearer ${token}` } });
      if (!r.ok) { setObSessions([]); return; }
      const d = await r.json();
      setObSessions(d.cours || []);
    } catch { setObSessions([]); }
    finally { setObSessionsLoading(false); }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}) : "–";

  const pctChecklist = (cl) => {
    const keys = CHECKLIST_ITEMS.map(i => i.id);
    const vals = keys.map(k => (cl||{})[k] || false);
    return Math.round((vals.filter(Boolean).length / keys.length) * 100);
  };

  // Items "bienvenue"/"acces" reflètent l'envoi réellement automatique (compte créé dès
  // l'ajout au groupe, cf. creerAccesApprenantCore côté backend) - ils ne sont donc plus
  // cochés manuellement, ils suivent simplement la présence d'un compte apprenant réel.
  // "kit"/"planning" restent manuels : aucun envoi automatique n'existe pour eux aujourd'hui.
  const ITEMS_AUTO = ["bienvenue", "acces"];
  const checklistEffectif = (a) => ({
    ...(a.suivi_checklist || {}),
    bienvenue: !!a.apprenant_id,
    acces:     !!a.apprenant_id,
  });

  // Suivi de démarrage réel : PATCH groupes_apprenants.suivi_checklist, avec mise à jour
  // optimiste locale sur mesApprenants (source commune avec l'onglet "Mes apprenants").
  const toggleCheck = async (gaId, itemId) => {
    const cible = mesApprenants.find(a => a.id === gaId);
    if (!cible) return;
    const nvlChecklist = { ...(cible.suivi_checklist||{}), [itemId]: !((cible.suivi_checklist||{})[itemId]) };
    setMesApprenants(prev => prev.map(a => a.id === gaId ? { ...a, suivi_checklist: nvlChecklist } : a));
    try {
      await fetch(`${API_URL}/api/groupes/apprenants/${gaId}/suivi`, {
        method:"PATCH", headers:authHeaders(), body:JSON.stringify({ checklist: nvlChecklist }),
      });
    } catch { toast.error("Erreur lors de la mise à jour du suivi."); }
  };

  const enregistrerNotesSuivi = async (gaId, notes) => {
    setMesApprenants(prev => prev.map(a => a.id === gaId ? { ...a, suivi_notes: notes } : a));
    try {
      await fetch(`${API_URL}/api/groupes/apprenants/${gaId}/suivi`, {
        method:"PATCH", headers:authHeaders(), body:JSON.stringify({ notes }),
      });
    } catch { toast.error("Erreur lors de l'enregistrement des notes."); }
  };

  const envoyerAlerteCommerciale = async (bilanId) => {
    if (sendingAlerteCommId === bilanId) return;
    setSendingAlerteCommId(bilanId);
    try {
      const r = await fetch(`${API_URL}/api/groupes/apprenants/${bilanId}/alerte-renouvellement`, {
        method:"POST", headers:authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setBilans(prev=>prev.map(b=>b.id===bilanId?{...b,bilan_alerte_envoyee:true,bilan_alerte_date:new Date().toISOString()}:b));
      if (d.notified?.includes("commerciale")) {
        toast.success("📣 Alerte de renouvellement envoyée à l'équipe commerciale ✓");
      } else {
        toast("⚠️ Alerte enregistrée mais aucune commerciale n'a pu être notifiée (dossier non rattaché).", { icon:"⚠️", duration:5000 });
      }
    } catch {
      toast.error("Erreur lors de l'envoi de l'alerte.");
    }
    finally { setSendingAlerteCommId(null); }
  };

  const STATUT_APP = {
    en_attente: { label:"En attente",  color:"#d97706", bg:"#fef3c7" },
    en_cours:   { label:"En cours",    color:"#0891b2", bg:"#e0f2fe" },
    terminé:    { label:"Terminé",     color:"#22c55e", bg:"#dcfce7" },
  };


  // ── Modal Dossier - 2 étapes : Dossier (lecture seule) → Groupe ─
  const DOSSIER_INIT = { nom:"", prenom:"", email:"", telephone:"", niveau:"", programme:"", date_debut_supposee:"" };
  const [showDossierModal,     setShowDossierModal]     = useState(false);
  const [dossierTarget,        setDossierTarget]        = useState(null);
  const [dossierStep,          setDossierStep]          = useState(1);
  const [dossierForm,          setDossierForm]          = useState(DOSSIER_INIT);
  const [dossierSelectedGroupe,setDossierSelectedGroupe]= useState(null);
  const [dossierCreerGroupe,   setDossierCreerGroupe]   = useState(false);
  const [dossierPaiements,     setDossierPaiements]     = useState([]);
  const [dossierNouveauGroupe, setDossierNouveauGroupe] = useState({ nom:"", date_debut:"", date_fin:"", capacite_max:20, horaire:[], photo_url:null });
  const [dossierHoraireTmp,    setDossierHoraireTmp]    = useState({ jour:"Lun", debut:"08:00", fin:"10:00" });
  /* Filtres de la liste des classes (étape 2). `filtreNiveauClasse` vide = le niveau de
     l'apprenant, valeur par défaut ; "tous" lève la restriction. Ils ne pilotent QUE
     l'affichage : la logique de création et le bouton d'affectation continuent de lire la
     liste non filtrée, sinon une recherche sans résultat basculerait l'écran en création. */
  const [filtreNiveauClasse,   setFiltreNiveauClasse]   = useState("");
  const [rechercheClasse,      setRechercheClasse]      = useState("");
  /* La création de classe est passée d'un formulaire déplié dans la page à un modal :
     il cohabitait mal avec la liste filtrée et poussait le récapitulatif hors de vue. */
  const [showCreerGroupeModal, setShowCreerGroupeModal] = useState(false);
  const [dossierSaving,        setDossierSaving]        = useState(false);
  const [cancelModalOB,        setCancelModalOB]        = useState({ open:false, target:null, raison:"", raisonLibre:"", context:"" });
  const [cancelSavingOB,       setCancelSavingOB]       = useState(false);

  const handleAnnulerDossierOB = async () => {
    if (cancelSavingOB) return;
    const { target, raison, raisonLibre } = cancelModalOB;
    if (!target) return;
    const motifFinal = raison === "Autre" ? (raisonLibre.trim() || "Autre") : raison;
    if (!motifFinal) return;
    setCancelSavingOB(true);
    try {
      const notesAnnotees = `[ANNULE] ${motifFinal}`;
      const r = await fetch(`${API_URL}/api/parcours/assignations/${target.assignation_id || target.id}`, {
        method: "PATCH",
        headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ statut: "annule", routing_statut: "annule", notes: notesAnnotees }),
      });
      if (!r.ok) throw new Error("Erreur serveur");
      setApprenants(prev => prev.filter(a => a.id !== target.id));
      setCancelModalOB({ open:false, target:null, raison:"", raisonLibre:"", context:"" });
      toast.success("Dossier annulé avec succès");
    } catch { toast.error("Impossible d'annuler le dossier"); }
    finally { setCancelSavingOB(false); }
  };

  const openDossierModal = (a) => {
    // Rafraîchir la liste des groupes à l'ouverture - évite de proposer une classe
    // clôturée entre-temps (ex : par le PA Advisor) si l'onglet est resté ouvert.
    (async () => {
      try {
        const token = localStorage.getItem("admin_token");
        const gr = await fetch(`${API_URL}/api/groupes`, { headers:{ Authorization:`Bearer ${token}` } });
        if (gr.ok) { const gd = await gr.json(); setGroupes(gd.groupes||[]); }
      } catch {}
    })();
    setDossierTarget(a);
    const parts = (a.nom || "").trim().split(/\s+/);
    const sd = a.suivi_demarrage || {};
    const niveau = a.niveau || sd.niveau_prospect || "";
    // Pour un profil enfant, a.email/a.telephone sont ceux du PARENT (prospect_email/
    // prospect_telephone) - jamais ceux de l'enfant. Les laisser vides ici force le système à
    // générer un identifiant purement technique propre à l'enfant à la création des accès, au
    // lieu de réutiliser les coordonnées réelles du parent comme login de l'enfant (ce qui
    // bloque ensuite la création d'un compte parent séparé avec les mêmes coordonnées).
    const isEnfantProfil = a.profil_type === "enfant";
    setDossierForm({
      nom:                 parts.slice(1).join(" ") || parts[0] || "",
      prenom:              parts[0] || "",
      email:               isEnfantProfil ? "" : (a.email || ""),
      telephone:           isEnfantProfil ? "" : (a.telephone || ""),
      niveau,
      programme:           a.offre || sd.formation_souhaitee || "",
      date_debut_supposee: sd.date_debut_formation || a.date_debut_formation || "",
    });
    setDossierStep(1);
    setDossierSelectedGroupe(null);
    // Les filtres de classes sont propres au dossier consulté : les laisser d'un dossier
    // à l'autre ferait croire qu'aucune classe n'existe pour le suivant.
    setFiltreNiveauClasse("");
    setRechercheClasse("");
    setShowCreerGroupeModal(false);

    // Détecter coaching privé : type_coaching du dossier, jamais la présence d'un coach déjà
    // assigné - pour un dossier fraîchement routé par le PA (cas normal), aucun coach n'est
    // encore assigné, c'est justement le travail de l'Onboarding de le faire ici. L'ancienne
    // condition (coach_id/coach_nom_manuel/onboarding_id) ratait donc systématiquement ce cas
    // et sautait tout le pré-remplissage (disponibilités, nom de classe, capacité à 1…).
    const isPrivate = a.type_coaching === "prive";
    if (isPrivate) {
      const dispos = sd.disponibilites || {};

      // Priorité 1 : horaires précis saisis par le PA ({jour, debut, fin})
      let horairePrefill = Array.isArray(dispos.horaires) && dispos.horaires.length > 0
        ? dispos.horaires.map(h => ({ ...h }))
        : null;

      // Priorité 2 : convertir les labels jours/creneaux
      if (!horairePrefill) {
        const jours    = Array.isArray(dispos.jours)    ? dispos.jours    : [];
        const creneaux = Array.isArray(dispos.creneaux) ? dispos.creneaux : [];
        const CRENEAU_TO_TIME = {
          "matin":           { debut:"08:00", fin:"12:00" },
          "après-midi":      { debut:"14:00", fin:"18:00" },
          "apres-midi":      { debut:"14:00", fin:"18:00" },
          "après midi":      { debut:"14:00", fin:"18:00" },
          "soir":            { debut:"18:00", fin:"20:00" },
          "journee":         { debut:"08:00", fin:"18:00" },
          "journée":         { debut:"08:00", fin:"18:00" },
          "lun–ven · matin": { debut:"08:00", fin:"12:00" },
          "lun–ven · après-midi": { debut:"14:00", fin:"18:00" },
          "lun–ven · soir":  { debut:"18:00", fin:"20:00" },
        };
        const parseLabel = (label) => {
          const key = label.toLowerCase().trim();
          // Extraire le jour depuis un label composite "Lun–Ven · Matin"
          const match = key.match(/^([a-zéèê–\-]+)\s*·\s*(.+)$/);
          if (match) return { jourLabel: match[1].trim(), timeKey: match[2].trim() };
          return { jourLabel: null, timeKey: key };
        };
        const parseTime = (key) => {
          if (CRENEAU_TO_TIME[key]) return CRENEAU_TO_TIME[key];
          const norm = key.replace(/h(\d)/g, ":$1").replace(/h$/,"").replace(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/, "$1:$2|$3:$4");
          if (norm.includes("|")) { const [d,f]=norm.split("|"); return { debut:d.trim(), fin:f.trim() }; }
          if (norm.includes("-")) { const [d,f]=norm.split("-"); return { debut:d.trim(), fin:f.trim() }; }
          return { debut:"08:00", fin:"10:00" };
        };
        horairePrefill = [];
        // Normalise un label de jour vers un code court valide pour le <select>
        const JOUR_SHORT_MAP = {
          "lun":"Lun","mar":"Mar","mer":"Mer","jeu":"Jeu","ven":"Ven","sam":"Sam","dim":"Dim",
          "lundi":"Lun","mardi":"Mar","mercredi":"Mer","jeudi":"Jeu","vendredi":"Ven","samedi":"Sam","dimanche":"Dim"
        };
        // Étend une plage "lun–ven" en liste de codes courts
        const expandRange = (rangeStr) => {
          const ORDER = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
          const parts = rangeStr.split(/[–\-]/);
          const start = JOUR_SHORT_MAP[parts[0]?.trim().toLowerCase()];
          const end   = JOUR_SHORT_MAP[parts[1]?.trim().toLowerCase()];
          if (!start) return [];
          if (!end || start === end) return [start];
          const si = ORDER.indexOf(start), ei = ORDER.indexOf(end);
          return si >= 0 && ei >= 0 && ei >= si ? ORDER.slice(si, ei + 1) : [start];
        };

        jours.forEach(j => {
          const { jourLabel, timeKey } = parseLabel(j);
          const { debut, fin } = parseTime(timeKey || j.toLowerCase().trim());

          if (jourLabel) {
            // Peut être une plage ("lun–ven") ou un jour simple ("lun")
            const rangeJours = jourLabel.includes("–") || jourLabel.includes("-")
              ? expandRange(jourLabel)
              : [JOUR_SHORT_MAP[jourLabel.toLowerCase()] || "Lun"];
            rangeJours.forEach(jourShort => horairePrefill.push({ jour: jourShort, debut, fin }));
          } else {
            // Pas de partie jour dans le label → combiner avec les creneaux
            const jourShort = JOUR_SHORT_MAP[j.toLowerCase().trim()];
            if (jourShort) {
              if (creneaux.length === 0) {
                horairePrefill.push({ jour: jourShort, debut:"08:00", fin:"10:00" });
              } else {
                creneaux.forEach(cr => {
                  const { debut: d, fin: f } = parseTime(cr.toLowerCase().trim());
                  horairePrefill.push({ jour: jourShort, debut: d, fin: f });
                });
              }
            } else {
              // Fallback
              horairePrefill.push({ jour: "Lun", debut, fin });
            }
          }
        });
        if (horairePrefill.length === 0) {
          horairePrefill = [{ jour:"Lun", debut:"08:00", fin:"10:00" }];
        }
      }

      const nomGroupe = `Coaching privé - ${parts[0]} ${parts.slice(1).join(" ")} ${niveau}`.trim();
      setDossierCreerGroupe(true);
      /* La capacité proposée suit la famille : le payeur plus les personnes saisies à
         l'inscription. Figée à 1, elle affichait « 1 place » sur une classe qui en
         accueille trois, et l'onboarding ne pouvait y inscrire que le payeur. */
      setDossierNouveauGroupe({ nom: nomGroupe, date_debut: sd.date_debut_formation || a.date_debut_formation || "", date_fin: "",
        capacite_max: 1 + (Array.isArray(sd.membres_famille) ? sd.membres_famille.length : 0), horaire: horairePrefill });
    } else {
      setDossierCreerGroupe(false);
      setDossierNouveauGroupe({ nom:"", date_debut:"", date_fin:"", capacite_max:20, horaire:[], photo_url:null });
    }

    setDossierHoraireTmp({ jour:"Lun", debut:"08:00", fin:"10:00" });
    setDossierPaiements([]);
    setShowDossierModal(true);
    const assId = a.assignation_id || a.id;
    if (assId) {
      fetch(`${API_URL}/api/paiements/assignation/${assId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : { paiements: [] })
        .then(d => setDossierPaiements(d.paiements || []))
        .catch(() => {});
    }
  };

  // Tous les groupes actifs correspondant au niveau de l'apprenant (pas filtré par coach)
  const groupesNiveau      = groupes.filter(g => g.niveau === dossierForm.niveau && g.statut === "actif");
  const groupesDisponibles = groupesNiveau.filter(g => (g.nb_apprenants||0) < (g.capacite_max||20));
  const tousComplets       = groupesNiveau.length > 0 && groupesDisponibles.length === 0;

  const confirmerAffectation = async () => {
    if (dossierSaving) return;
    const sdForCheck = dossierTarget?.suivi_demarrage || {};
    const isPrivateFlow = !!(sdForCheck.coach_id || sdForCheck.coach_nom_manuel || sdForCheck.onboarding_id);
    // Pour le flux privé, on force la création de groupe même si le flag a été réinitialisé
    const shouldCreate = dossierCreerGroupe || isPrivateFlow;
    if (!shouldCreate && !dossierSelectedGroupe) { toast.error("Sélectionnez un groupe ou créez-en un"); return; }
    const nomApp = `${dossierForm.prenom || ""} ${dossierForm.nom || ""}`.trim() || "cet apprenant";
    /* LE NOM PAR DÉFAUT suivait le seul flux privé : une classe de groupe créée sans nom
       se retrouvait baptisée « Coaching privé - Untel ». Le message de confirmation, lui,
       disparaît au bout de quelques secondes ; le nom, non - il reste en base et s'affiche
       ensuite partout. C'est donc la faute la plus durable des deux.
       Calculé ici une seule fois : la confirmation annonce ainsi exactement le nom qui
       sera créé, ce que deux expressions recopiées ne garantissaient pas. */
    const nomParDefautClasse = isPrivateFlow
      ? `Coaching privé - ${nomApp} ${dossierForm.niveau || ""}`.trim()
      : `Groupe ${dossierForm.niveau || ""}`.trim();
    const nomGroupeAffiche = shouldCreate
      ? (dossierNouveauGroupe.nom || nomParDefautClasse)
      : (dossierSelectedGroupe?.nom || "-");
    const veut = await confirm(
      shouldCreate
        ? `Créer la classe "${nomGroupeAffiche}" et y affecter ${nomApp} ?`
        : `Affecter ${nomApp} à la classe "${nomGroupeAffiche}" ?`,
      { titre: "Confirmer l'affectation", confirmLabel: "✅ Confirmer", danger: false }
    );
    if (!veut) return;
    const token = localStorage.getItem("admin_token");
    setDossierSaving(true);
    try {
      let groupeId   = dossierSelectedGroupe?.id;
      let groupeNom  = dossierSelectedGroupe?.nom || "";

      // Créer un nouveau groupe si demandé
      if (shouldCreate) {
        const sd = dossierTarget?.suivi_demarrage || {};

        // Déduire type_cours depuis lieu_coaching du dossier PA - uniquement pertinent
        // pour le flux coaching privé. Un groupe classique créé depuis ce formulaire
        // est toujours "en_ligne" (cf. libellé "En ligne" affiché dans ce même formulaire).
        const lieuCoaching = sd.lieu_coaching || "";
        const typeCours = !isPrivateFlow
          ? "en_ligne"
          : lieuCoaching === "domicile" ? "domicile"
          : lieuCoaching === "cabinet"  ? "centre"
          : "prive";

        // Convertir disponibilites en tableau horaire exploitable
        const dispos = sd.disponibilites || {};
        const jours   = Array.isArray(dispos.jours)    ? dispos.jours    : [];
        const creneaux = Array.isArray(dispos.creneaux) ? dispos.creneaux : [];
        const horaireDepuisDispo = jours.map(jour => {
          const creneau = creneaux[0] || "08:00-10:00";
          const [debut, fin] = creneau.includes("-") ? creneau.split("-") : [creneau, ""];
          return { jour, debut: debut.trim(), fin: fin.trim() };
        });

        groupeNom = dossierNouveauGroupe.nom || nomParDefautClasse;
        const r = await fetch(`${API_URL}/api/groupes`, {
          method: "POST",
          headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
          body: JSON.stringify({
            nom:          groupeNom,
            niveau:       dossierForm.niveau,
            filiere:      dossierForm.programme,
            type_cours:   typeCours,
            coach_id:     sd.coach_id || null,
            date_debut:   dossierNouveauGroupe.date_debut || sd.date_debut_formation || dossierForm.date_debut_supposee || null,
            date_fin:     dossierNouveauGroupe.date_fin   || null,
            /* LA CAPACITÉ D'UN COACHING PRIVÉ N'EST PLUS FIGÉE À 1.
               Un couple ou une famille prend un coaching privé ensemble : un seul dossier,
               un seul montant, mais plusieurs apprenants. La classe doit naître à la bonne
               taille, sinon l'onboarding ne peut y inscrire que le payeur.
               `is_prive` accompagne la capacité : c'est lui qui dit désormais qu'une classe
               est privée, la capacité ayant cessé de pouvoir le faire (cf. utils/classePrivee.js). */
            capacite_max: isPrivateFlow
              ? 1 + (Array.isArray(sd.membres_famille) ? sd.membres_famille.length : 0)
              : (dossierNouveauGroupe.capacite_max || 20),
            is_prive:     isPrivateFlow || undefined,
            horaire:      dossierNouveauGroupe.horaire?.length > 0
                            ? dossierNouveauGroupe.horaire
                            : horaireDepuisDispo.length > 0 ? horaireDepuisDispo : null,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erreur création groupe");
        groupeId = d.groupe.id;
        setGroupes(prev => [{ ...d.groupe, nb_apprenants:0 }, ...prev]);
        /* Ce libellé n'avait été pensé que pour le coaching privé : une classe de groupe,
           dont le `typeCours` vaut « en_ligne », ne tombait dans aucune de ses branches et
           héritait du repli « 🔒 privé » - l'écran annonçait donc l'inverse de ce qui
           venait d'être créé. Le flux décide d'abord, le lieu ensuite. */
        const lieuLabel = !isPrivateFlow
          ? "💻 en ligne"
          : typeCours === "domicile" ? "🏠 à domicile"
          : typeCours === "centre"   ? "🏢 au cabinet"
          : "🔒 privé";
        toast(`📣 Classe "${groupeNom}" créée ${lieuLabel}${sd.coach_id ? " - coach notifié" : ""}`, { icon:"👥" });
      }

      // Ajouter l'apprenant au groupe (l'API notifie le coach + l'apprenant s'il y a un coach)
      // assignation_id stocké dans note : lien direct et fiable vers assignations_parcours,
      // indispensable pour le coaching privé enfant où prospect_email (le parent, qui a rempli
      // le formulaire) diffère de email_apprenant (l'email de connexion propre à l'enfant) -
      // sans lui, parent et paiement ne peuvent jamais être retrouvés côté backend.
      const assIdPourNote = dossierTarget?.assignation_id || dossierTarget?.id || null;
      if (groupeId) {
        const r2 = await fetch(`${API_URL}/api/groupes/${groupeId}/apprenants`, {
          method: "POST",
          headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
          body: JSON.stringify({
            nom_apprenant:    dossierForm.nom,
            prenom_apprenant: dossierForm.prenom,
            email_apprenant:  dossierForm.email,
            telephone:        dossierForm.telephone,
            niveau:           dossierForm.niveau,
            note: JSON.stringify({ programme: dossierForm.programme, date_debut: dossierForm.date_debut_supposee, assignation_id: assIdPourNote }),
          }),
        });
        const d2 = await r2.json();
        if (!r2.ok) throw new Error(d2.error || "Erreur ajout apprenant au groupe");
        setGroupes(prev => prev.map(g => g.id===groupeId ? {...g, nb_apprenants:(g.nb_apprenants||0)+1} : g));

        /* ── LES AUTRES PERSONNES DE LA FAMILLE ───────────────────────────────────────────
           Un couple ou une famille inscrit en coaching privé : un seul dossier, un seul
           montant, mais plusieurs apprenants. La classe a été créée à la bonne taille
           quelques lignes plus haut ; il reste à y inscrire les personnes, faute de quoi
           l'onboarding devait les ajouter une à une à la main - avec le risque d'en
           oublier une et de laisser un coach découvrir un élève non déclaré.

           CHACUNE PORTE LE MÊME `assignation_id` dans sa note : c'est ce lien qui rattache
           tout la famille au dossier payeur. Sans lui, ces apprenants flotteraient sans
           paiement ni parcours rattaché, et les écrans qui remontent du dossier vers la
           classe ne les verraient pas.

           ÉCHECS TOLÉRÉS, et c'est délibéré : une adresse déjà utilisée ou un doublon ne
           doit pas faire échouer l'affectation du payeur, qui est l'acte principal. On
           compte les réussites et on le dit - une inscription partielle annoncée vaut
           mieux qu'une inscription complète supposée. */
        /* Dérivé ici et non repris du bloc de création de classe : `sd` y est déclaré dans
           une portée plus étroite, et cette inscription-ci s'exécute aussi quand la classe
           existait déjà - donc quand ce bloc n'a pas tourné. */
        const sdFamille = dossierTarget?.suivi_demarrage || {};
        const membresFamille = Array.isArray(sdFamille.membres_famille) ? sdFamille.membres_famille : [];
        if (membresFamille.length > 0) {
          let ajoutes = 0;
          const echecs = [];
          for (const membre of membresFamille) {
            const prenomM = (membre?.prenom || "").trim();
            const nomM    = (membre?.nom || "").trim();
            if (!prenomM && !nomM) continue;
            try {
              const rm = await fetch(`${API_URL}/api/groupes/${groupeId}/apprenants`, {
                method: "POST",
                headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
                body: JSON.stringify({
                  nom_apprenant:    nomM || dossierForm.nom,
                  prenom_apprenant: prenomM,
                  email_apprenant:  (membre?.email || "").trim() || null,
                  telephone:        (membre?.telephone || "").trim() || null,
                  niveau:           membre?.niveau || dossierForm.niveau,
                  note: JSON.stringify({
                    programme:      dossierForm.programme,
                    date_debut:     dossierForm.date_debut_supposee,
                    assignation_id: assIdPourNote,
                    membre_famille:   true,
                    lien_famille:     membre?.lien || null,
                  }),
                }),
              });
              if (rm.ok) ajoutes++;
              else {
                const dm = await rm.json().catch(() => ({}));
                echecs.push(`${prenomM || nomM} : ${dm.error || `erreur ${rm.status}`}`);
              }
            } catch (e) {
              echecs.push(`${prenomM || nomM} : ${e.message}`);
            }
          }
          if (ajoutes > 0) {
            setGroupes(prev => prev.map(g => g.id===groupeId ? {...g, nb_apprenants:(g.nb_apprenants||0)+ajoutes} : g));
            toast.success(`👥 ${ajoutes} personne${ajoutes > 1 ? "s" : ""} de la famille inscrite${ajoutes > 1 ? "s" : ""} dans la classe`);
          }
          if (echecs.length > 0) {
            toast.error(`Famille - ${echecs.length} non inscrite(s) : ${echecs[0]}`, { duration: 8000 });
            console.warn("[famille] échecs d'inscription :", echecs);
          }
        }
      }

      setApprenants(prev => prev.map(ap => ap.id === dossierTarget.id
        ? { ...ap, statut:"en_cours", groupe_nom: groupeNom }
        : ap
      ));
      // L'apprenant vient d'être ajouté pour de vrai à groupes_apprenants (ci-dessus) -
      // il apparaîtra automatiquement dans l'onglet "Suivi démarrage" au prochain chargement,
      // plus besoin de le pousser manuellement dans un état local mocké.

      // Mettre à jour routing_statut → onboarding_affecte dans assignations_parcours
      const assId = dossierTarget.assignation_id || dossierTarget.id;
      if (assId) {
        const patchR = await fetch(`${API_URL}/api/parcours/assignations/${assId}`, {
          method: "PATCH",
          headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
          body: JSON.stringify({
            routing_statut: "onboarding_affecte", statut: "converti",
            // Coaching privé : le pipeline (validation → paiement → routage) est terminé
            // une fois la classe affectée - sinon le badge "Paiement reçu - en attente de
            // vérification du PA" reste affiché indéfiniment (même bug déjà corrigé côté
            // assignation présentiel/domicile dans CommercialDashboard.jsx).
            ...(dossierTarget?.type_coaching === "prive" ? { dossier_statut: null } : {}),
          }),
        }).catch(() => null);
        if (patchR && !patchR.ok) {
          const errBody = await patchR.json().catch(() => ({}));
          console.error("❌ PATCH routing_statut onboarding_affecte:", patchR.status, errBody);
        }
      }

      setApprenants(prev => prev.filter(ap => ap.id !== dossierTarget.id));
      const coachGroupe = dossierSelectedGroupe?.coach_nom || dossierSelectedGroupe?.coach || (dossierTarget?.suivi_demarrage?.coach_nom_manuel) || "";
      const sdFinal = dossierTarget?.suivi_demarrage || {};
      const coachAssigne = sdFinal.coach_id || coachGroupe;
      toast.success(`✅ ${dossierTarget.nom} affecté à "${groupeNom}"${coachAssigne ? ` · Coach notifié` : " · Aucun coach assigné - à faire par le PA"}`);
      setShowDossierModal(false);
    } catch(e) {
      toast.error(e.message || "Erreur lors de la finalisation");
    } finally {
      setDossierSaving(false);
    }
  };

  // ── Mes apprenants (données réelles) ─────────────────────────────
  const [mesApprenants,      setMesApprenants]      = useState([]);
  const [mesAppLoading,      setMesAppLoading]      = useState(false);
  const [detailSuiviApprenant, setDetailSuiviApprenant] = useState(null);
  const [suiviFiltreStatut,  setSuiviFiltreStatut]  = useState("tous"); // tous | termine | non_termine
  const [suiviFiltreDateDebut, setSuiviFiltreDateDebut] = useState("");
  const [suiviFiltreDateFin,   setSuiviFiltreDateFin]   = useState("");
  const [pageSuivi,          setPageSuivi]          = useState(1);
  const [mesAppSearch,       setMesAppSearch]       = useState("");
  const [mesAppNiveau,       setMesAppNiveau]       = useState("tous");
  const [mesAppStatut,       setMesAppStatut]       = useState("tous");
  const [mesAppGroupe,       setMesAppGroupe]       = useState("tous");

  /* ── Onglet Coachs (calqué sur PedagogicalAdvisorDashboard) ── */
  const [paCoachsList,         setPaCoachsList]         = useState([]);
  const [paCoachsLoading,      setPaCoachsLoading]      = useState(false);
  const [paCoachsVue,          setPaCoachsVue]          = useState("liste"); // "liste" | "classement"
  const [paClassement,         setPaClassement]         = useState([]);
  const [paCoachEvals,              setPaCoachEvals]              = useState([]);
  const [paCoachEvalsLoading,       setPaCoachEvalsLoading]       = useState(false);
  const [paEvalExpanded,            setPaEvalExpanded]            = useState(new Set());
  const [paCoachRapportsTransmis,   setPaCoachRapportsTransmis]   = useState([]);
  const [paCoachRapportsLoading,    setPaCoachRapportsLoading]    = useState(false);
  const [paRapportExpanded,         setPaRapportExpanded]         = useState(new Set());
  const [paSelectedCoach,      setPaSelectedCoach]      = useState(null);
  const [paCoachGroupes,       setPaCoachGroupes]       = useState([]);
  const [paCoachGroupesLoading,setPaCoachGroupesLoading] = useState(false);
  const [paCoachHonMois,       setPaCoachHonMois]       = useState(null);
  const [paCoachHonAnnee,      setPaCoachHonAnnee]      = useState(null);
  const [paCoachCours,         setPaCoachCours]         = useState([]);
  const [paCoachCoursLoading,  setPaCoachCoursLoading]  = useState(false);
  const [paCoachSearch,        setPaCoachSearch]        = useState("");
  const [paCoachModalTab,      setPaCoachModalTab]      = useState("infos");
  const [evalDateFrom,         setEvalDateFrom]         = useState("");
  const [evalDateTo,           setEvalDateTo]           = useState("");
  const [evalPage,             setEvalPage]             = useState(1);
  const EVAL_PER_PAGE = 5;
  const [rapportDateFrom,      setRapportDateFrom]      = useState("");
  const [rapportDateTo,        setRapportDateTo]        = useState("");
  const [rapportPage,          setRapportPage]          = useState(1);
  const RAPPORT_PER_PAGE = 5;
  const [historiqueRemplDateFrom, setHistoriqueRemplDateFrom] = useState("");
  const [historiqueRemplDateTo,   setHistoriqueRemplDateTo]   = useState("");
  const [historiqueRemplPage,     setHistoriqueRemplPage]     = useState(1);
  const HISTORIQUE_REMPL_PER_PAGE = 5;
  const [classeDateFrom,       setClasseDateFrom]       = useState("");
  const [classeDateTo,         setClasseDateTo]         = useState("");
  const [classePage,           setClassePage]           = useState(1);
  const [classeFiltreCategorie,setClasseFiltreCategorie] = useState("tous"); // tous | groupe | prive
  const [classeFiltreStatut,   setClasseFiltreStatut]    = useState("tous"); // tous | actif | cloture
  const CLASSE_PER_PAGE = 8;
  const [coursPage,            setCoursPage]            = useState(1);
  const COURS_PER_PAGE = 5;
  const [coursDateFrom,        setCoursDateFrom]        = useState("");
  const [coursDateTo,          setCoursDateTo]          = useState("");
  const [honorairePage,        setHonorairePage]        = useState(1);
  const HONOR_PER_PAGE = 8;
  const [paCoachDispoData,     setPaCoachDispoData]     = useState([]);
  const [paCoachDispoLoading,  setPaCoachDispoLoading]  = useState(false);
  const [paDispoMois,          setPaDispoMois]          = useState(() => new Date().getMonth() + 1);
  const [paDispoAnnee,         setPaDispoAnnee]         = useState(() => new Date().getFullYear());
  const [paCoachContrats,      setPaCoachContrats]      = useState([]);
  const [paCoachContratsLoading,setPaCoachContratsLoading] = useState(false);
  const [paCoachAccesBloque,        setPaCoachAccesBloque]        = useState(false);
  const [paCoachAccesLoading,       setPaCoachAccesLoading]       = useState(false);
  const [paCoachBloqueRaison,       setPaCoachBloqueRaison]       = useState("");
  const [paCoachSuspensionDefinitive, setPaCoachSuspensionDefinitive] = useState(false);
  const [paCoachRemplForm,          setPaCoachRemplForm]          = useState({ remplacant_id:"", groupe_id:"", date_debut:"", date_fin:"", motif:"" });
  const [paCoachRemplSaving,        setPaCoachRemplSaving]        = useState(false);
  const [paCoachRemplacementsListe, setPaCoachRemplacementsListe] = useState([]);
  const [paCoachRemplSessions,      setPaCoachRemplSessions]      = useState([]);
  const [paCoachRemplSessionsLoading, setPaCoachRemplSessionsLoading] = useState(false);
  const [paCoachRemplSessionsSelec, setPaCoachRemplSessionsSelec] = useState([]); // IDs sélectionnés
  const [grille, setGrille] = useState(GRILLE_DEFAULT);

  const fetchGrille = async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/parametres/grille_tarifaire`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        if (d.valeur) setGrille(d.valeur);
      }
    } catch {}
  };

  // Mapper niveau coach (A1,B2…) vers groupe de la grille tarifaire
  const niveauToGroupe = (n) => {
    if (!n) return "A1-A2";
    if (["A1","A2"].includes(n)) return "A1-A2";
    if (["B1","B2"].includes(n)) return "B1-B2";
    return "C1-C2";
  };

  // Liste des coachs + classement (basé sur évaluations superviseurs)
  useEffect(() => {
    const tok = localStorage.getItem("admin_token");
    setPaCoachsLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/admin/utilisateurs?role=coach`, { headers:{ Authorization:`Bearer ${tok}` } }).then(r=>r.ok?r.json():{utilisateurs:[]}),
      fetch(`${API_URL}/api/coachs/classement`,              { headers:{ Authorization:`Bearer ${tok}` } }).then(r=>r.ok?r.json():{classement:[]}),
    ]).then(([uData, cData]) => {
      const classement = cData.classement || [];
      setPaClassement(classement);
      /* On garde la TENDANCE et l'HISTORIQUE, pas seulement la moyenne. Deux coachs à 3,1
         n'ont pas la même trajectoire - l'un remonte, l'autre s'enfonce - et l'assistante
         choisit à qui confier une classe. Ces champs étaient jetés à la lecture. */
      const statsMap = {};
      classement.forEach(c => {
        statsMap[String(c.id)] = {
          moyenne:        c.moyenne,
          tendance:       c.tendance || "stable",
          historique:     Array.isArray(c.historique) ? c.historique : [],
          nb_evaluations: c.nb_avec_note ?? c.nb_evaluations ?? 0,
        };
      });
      const coachs = (uData.utilisateurs || []).map(u => {
        const st = statsMap[String(u.id)] || {};
        return {
          ...u,
          moyenne:        st.moyenne ?? u.note_moyenne ?? null,
          tendance:       st.tendance || "stable",
          historique:     st.historique || [],
          nb_evaluations: st.nb_evaluations ?? 0,
        };
      });
      setPaCoachsList(coachs);
    }).catch(e => console.warn("[Coachs]", e)).finally(()=>setPaCoachsLoading(false));
    fetchGrille();
  }, []); // eslint-disable-line

  const fetchPaCoachContrats = async (coachId) => {
    setPaCoachContratsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/contrats-prives?coach_id=${coachId}`, { headers: authHeaders() });
      const d = await r.json();
      setPaCoachContrats(d.contrats || []);
    } catch {}
    finally { setPaCoachContratsLoading(false); }
  };

  const fetchPaCoachGroupes = async (coachId, mois, annee) => {
    setPaCoachGroupesLoading(true);
    try {
      const params = new URLSearchParams({ coach_id: coachId });
      if (mois && annee) { params.set("mois", mois); params.set("annee", annee); }
      const [rGroupes, rSessions] = await Promise.all([
        fetch(`${API_URL}/api/groupes?coach_id=${coachId}`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/coachs/sessions-live/admin-all?${params}`, { headers: authHeaders() }),
      ]);
      const dGroupes  = await rGroupes.json();
      const dSessions = rSessions.ok ? await rSessions.json() : { honoraires: [] };
      const coachHon  = (dSessions.honoraires || []).find(h => String(h.coach_id) === String(coachId));
      const seancesMap = {};
      (coachHon?.groupes || []).forEach(g => { seancesMap[String(g.groupe_id)] = g.nb_seances; });
      const groupesRes = (dGroupes.groupes || []).map(g => ({
        ...g,
        nb_seances_realisees: seancesMap[String(g.id)] || 0,
      }));
      setPaCoachGroupes(groupesRes);
    } catch { setPaCoachGroupes([]); }
    finally { setPaCoachGroupesLoading(false); }
  };

  const fetchPaCoachCours = async (coachId) => {
    setPaCoachCoursLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning?coach_id=${coachId}`, { headers: authHeaders() });
      const d = r.ok ? await r.json() : { contenus: [] };
      setPaCoachCours(d.contenus || []);
    } catch { setPaCoachCours([]); }
    finally { setPaCoachCoursLoading(false); }
  };

  const fetchPaCoachDispos = async (coachId, mois, annee) => {
    setPaCoachDispoLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/coachs/${coachId}/disponibilites?mois=${mois}&annee=${annee}`, { headers: authHeaders() });
      const d = r.ok ? await r.json() : { disponibilites: [] };
      setPaCoachDispoData(d.disponibilites || []);
    } catch {}
    finally { setPaCoachDispoLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (paCoachModalTab === "disponibilite" && paSelectedCoach) fetchPaCoachDispos(paSelectedCoach.id, paDispoMois, paDispoAnnee);
  }, [paCoachModalTab, paSelectedCoach, paDispoMois, paDispoAnnee]); // eslint-disable-line react-hooks/exhaustive-deps
  // Réinitialiser sur le mois courant à chaque changement de coach sélectionné
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (paSelectedCoach) { setPaDispoMois(new Date().getMonth()+1); setPaDispoAnnee(new Date().getFullYear()); }
  }, [paSelectedCoach?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPaCoachModal = (coach) => {
    setPaSelectedCoach(coach);
    setPaCoachModalTab("infos");
    setPaCoachContrats([]);
    setPaCoachGroupes([]);
    setEvalPage(1); setEvalDateFrom(""); setEvalDateTo("");
    setClassePage(1); setClasseDateFrom(""); setClasseDateTo("");
    setCoursPage(1); setCoursDateFrom(""); setCoursDateTo("");
    setHonorairePage(1);
    setPaCoachEvals([]);
    setPaCoachRapportsTransmis([]);
    setPaCoachDispoData([]);
    setPaEvalExpanded(new Set());
    setPaRapportExpanded(new Set());
    // Charger les évaluations du coach
    const tok = localStorage.getItem("admin_token");
    setPaCoachEvalsLoading(true);
    fetch(`${API_URL}/api/coachs/${coach.id}/evaluations`, { headers:{ Authorization:`Bearer ${tok}` } })
      .then(r=>r.ok?r.json():{evaluations:[]})
      .then(d=>setPaCoachEvals(d.evaluations||[]))
      .catch(()=>{})
      .finally(()=>setPaCoachEvalsLoading(false));
    // Rapports Deputy transmis au PA
    setPaCoachRapportsLoading(true);
    fetch(`${API_URL}/api/coachs/${coach.id}/rapports-transmis`, { headers:{ Authorization:`Bearer ${tok}` } })
      .then(r=>r.ok?r.json():{rapports:[]})
      .then(d=>setPaCoachRapportsTransmis(d.rapports||[]))
      .catch(()=>{})
      .finally(()=>setPaCoachRapportsLoading(false));
    setPaCoachHonMois(null);
    setPaCoachHonAnnee(null);
    fetchPaCoachContrats(coach.id);
    fetchPaCoachGroupes(coach.id, null, null);
    setPaCoachCours([]);
    fetchPaCoachCours(coach.id);
    // Accès
    setPaCoachBloqueRaison("");
    setPaCoachSuspensionDefinitive(false);
    setPaCoachAccesBloque(coach.acces_bloque || false);
    setPaCoachRemplForm({ remplacant_id:"", groupe_id:"", date_debut:"", date_fin:"", motif:"" });
    setPaCoachRemplSessions([]);
    setPaCoachRemplSessionsSelec([]);
    setPaCoachRemplacementsListe([]);
    // Charger les remplacements existants pour ce coach
    fetch(`${API_URL}/api/remplacements?absent_id=${coach.id}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { remplacements: [] })
      .then(d => setPaCoachRemplacementsListe(d.remplacements || []))
      .catch(() => {});
  };

  const paPatchContrat = async (id, updates) => {
    try {
      const r = await fetch(`${API_URL}/api/contrats-prives/${id}`, { method:"PATCH", headers: authHeaders(), body: JSON.stringify(updates) });
      if (!r.ok) throw new Error();
      fetchPaCoachContrats(paSelectedCoach.id);
    } catch { toast.error("Erreur mise à jour"); }
  };

  const PROGRAMMES = [
    "Anglais Pro B2","Anglais Pro B1","Anglais Essentiel A2","Anglais Expert C2",
    "Anglais Général","Anglais Enfant","Anglais Enfants",
    "Business English","Certification TOEIC","Certification IELTS",
    "Formation Entreprise","Coaching de groupe","Coaching privé",
    "Cours débutant / Alpha","Formation Personnalisée","Autre",
  ];
  const NIVEAU_COLOR = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };

  // ── Badges d'onglets - signaux réels déjà chargés, pas de fetch supplémentaire ──
  const groupesSansCoach = useMemo(() => groupes.filter(g => g.statut==="actif" && !g.coach_id).length, [groupes]);
  const { notifications: toutesNotifs, nbNonLues: notifNonLues, marquerLue: marquerNotifLue } = useNotifications(profil?.id);
  // Combien de dossiers de transfert attendent MON action - le badge de l'onglet.
  const dossiersAReaffecter = useCompteDemandesTransfert(authHeaders, "onboarding");
  /* La demande qu'on est en train de réaffecter, et un compteur pour relire la file après
     coup. Le transfert s'exécute dans NOTRE modal - plus riche que celui du composant
     partagé - et c'est ensuite seulement que le dossier se referme. */
  const [demandeEnCours, setDemandeEnCours] = useState(null);
  const [refreshReaffecter, setRefreshReaffecter] = useState(0);

  /* Ouvrir NOTRE écran de transfert depuis un dossier à réaffecter, pré-réglé sur le niveau
     rendu par le test : c'est lui qui désigne la classe d'arrivée, et l'ouvrir sur « tous »
     obligerait à refaire à la main le tri que le test vient de trancher. */
  /* LE TARIF DANS L'ÉCRAN DE TRANSFERT. Une migration de canal change le prix - en ligne et
     présentiel ne coûtent pas la même chose - et c'est l'assistante qui accepte qui le sait.
     On charge le plan du dossier pour lui MONTRER la mensualité actuelle : saisir un nouveau
     montant sans voir l'ancien, c'est décider à l'aveugle. */
  /* ATTRIBUER UN DOSSIER MIGRÉ. Après une migration vers le en ligne, le dossier perd son
     assistante : celle du présentiel ne suit plus l'apprenant, et aucune assistante en ligne
     ne le voit tant qu'il ne lui a pas été confié. C'est voulu - mieux vaut un dossier
     visiblement sans propriétaire qu'un dossier attribué au hasard - mais encore faut-il
     pouvoir l'attribuer, et l'onboarding n'avait aucun écran pour le faire. */
  const [assistantesLigne, setAssistantesLigne] = useState([]);
  const [attributionEnCours, setAttributionEnCours] = useState(false);
  // Le dossier en cours d'attribution, ou null. Porte aussi de quoi titrer le modal.
  const [selecteurAssistante, setSelecteurAssistante] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/parcours/assistantes-ligne`)
      .then(r => r.ok ? r.json() : { assistantes: [] })
      .then(d => setAssistantesLigne(d.assistantes || []))
      .catch(() => {});
  }, []);

  /* LES DOSSIERS QUI N'APPARTIENNENT À PERSONNE, réclamés dans « Mes tâches ».
     Ils ne viennent PAS de `assignations` : la vue onboarding y est bornée par un
     `.in("assistante_id", ...)` qui écarte les NULL, donc exactement ces dossiers-là. D'où
     une route dédiée. Sans elle, l'attribution n'existait qu'au fond d'une fiche - ouvrir le
     groupe, ouvrir l'apprenant, faire défiler - et rien ne la réclamait. */
  const [dossiersAAttribuer, setDossiersAAttribuer] = useState([]);
  const chargerDossiersAAttribuer = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/parcours/dossiers-a-attribuer`, { headers: authHeaders() });
      setDossiersAAttribuer(r.ok ? (await r.json()).dossiers || [] : []);
    } catch { setDossiersAAttribuer([]); }
  }, []);
  useEffect(() => { chargerDossiersAAttribuer(); }, [chargerDossiersAAttribuer]);

  const attribuerAssistante = async (assignationId, assistanteId) => {
    if (!assignationId || !assistanteId) return;
    setAttributionEnCours(true);
    try {
      const r = await fetch(`${API_URL}/api/parcours/assignations/${assignationId}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ assistante_id: assistanteId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Attribution impossible");
      const choisie = assistantesLigne.find(a => String(a.id) === String(assistanteId));
      setSelectedApprenantGroupe(prev => prev ? { ...prev, assistante_commerciale: choisie || prev.assistante_commerciale } : prev);
      /* La tâche disparaît de « Mes tâches » dans le même geste. Retirer la ligne localement
         plutôt que recharger : la liste est courte, et voir la ligne s'en aller confirme que
         l'attribution a pris - un rechargement silencieux laisse douter. */
      setDossiersAAttribuer(prev => prev.filter(d => String(d.id) !== String(assignationId)));
      setSelecteurAssistante(null);
      toast.success(`Dossier confié à ${choisie ? `${choisie.prenom || ""} ${choisie.nom || ""}`.trim() : "l'assistante"} ✓`);
    } catch (e) {
      toast.error(e.message || "Attribution impossible");
    } finally { setAttributionEnCours(false); }
  };

  const [planMigration, setPlanMigration] = useState(null);      // null = non chargé
  const [nouvelleMensualite, setNouvelleMensualite] = useState("");
  /* Appliquer le nouveau tarif dès le mois EN COURS, et pas seulement aux mois créés ensuite.
     Décidé dossier par dossier : un transfert en début de mois et un transfert en fin de mois
     n'appellent pas la même réponse, et seule celle qui traite le dossier le sait. */
  const [tarifDesLeMoisEnCours, setTarifDesLeMoisEnCours] = useState(false);

  /* LE SERVEUR RÉSOUT LE DOSSIER, pas l'écran. Le rapprochement n'a rien d'évident :
     l'e-mail de l'inscription est parfois un identifiant technique fabriqué à partir du
     téléphone, et ne correspond alors à aucun dossier. Le refaire ici aurait donné deux
     résolutions pour la même question, dont une seule juste - et c'est l'écran qui aurait
     affiché « aucun plan mensuel » sur un dossier qui en a un. */
  const chargerPlanDeLApprenant = async (demandeId) => {
    setPlanMigration(null);
    if (!demandeId) { setPlanMigration({}); return; }
    try {
      const r = await fetch(`${API_URL}/api/demandes-transfert/${demandeId}/dossier`, { headers: { Authorization:`Bearer ${localStorage.getItem("admin_token")}` } });
      const j = await r.json();
      setPlanMigration(j.plan || {});
    } catch { setPlanMigration({}); }
  };

  const ouvrirTransfertDepuisDemande = (d) => {
    setDemandeEnCours(d);
    setSelectedApprenantGroupe({
      id: d.ga_id,
      nom_apprenant: d.nom_apprenant,
      prenom_apprenant: d.prenom_apprenant,
      email_apprenant: d.email_apprenant,
      niveau: d.niveau_obtenu || d.niveau_actuel,
      groupe_id: d.groupe_id,
      groupes: { nom: d.groupe_nom },
    });
    setTransfertForm({ nouveau_groupe_id:"", motif: d.detail || "", initiateur:"coach", jours:[] });
    setNouvelleMensualite(""); setTarifDesLeMoisEnCours(false);
    /* Les deux circuits sans test ajustent le tarif : la migration de canal et le transfert
       de centre. Charger le plan pour l'un seulement laissait l'autre devant un champ vide. */
    /* Le plan pour TOUS les types : les trois circuits peuvent ajuster le tarif. Le charger
       pour deux seulement laissait le troisième devant « Aucun plan mensuel » sur un dossier
       qui en a un. */
    chargerPlanDeLApprenant(d.id);
    setGroupesCibles([]);
    const niv = d.niveau_obtenu || "tous";
    setTransfertNiveauCible(niv);
    searchGroupesCibles(niv);
    setShowTransfert(true);
  };
  const [banderoleFermee, setBanderoleFermee] = useState(false);
  const notifsBanderole = toutesNotifs.filter(n => !n.lu).slice(0, 3);
  const { unreadTotal: msgNonLus } = useFirebaseChat();
  // Même raison que chez la commerciale : sans ce complément, le badge ignore tout ce qui
  // se dit dans les chats de classe.
  const chatGroupeNonLus = useGroupesChatUnreadTotal(groupes.map(g => g.id), profil?.id);
  // Les non-lus des groupes LIBRES : calculés ici pour que la pastille s'allume
  // même quand l'onglet n'est pas ouvert.
  const groupesLibresNonLus = useGroupesLibresNonLus(localStorage.getItem("admin_token"), profil?.id);

  // ── "Mes tâches" - agrège les compteurs "à traiter" déjà calculés pour
  // chaque onglet, pour un point d'entrée unique.
  const tachesApprenants = enAttente;
  const tachesSuivi      = mesApprenants.filter(a=>!Object.values(a.suivi_checklist||{}).every(Boolean)).length;
  const tachesGroupes    = groupesSansCoach;
  // Les dossiers sans assistante entrent dans le total : sans ça, la pastille de l'onglet reste
  // éteinte et la tâche n'existe que pour qui pense déjà à la chercher.
  const tachesAttribuer  = dossiersAAttribuer.length;
  const tachesTotal = tachesApprenants + tachesSuivi + tachesGroupes + dossiersAReaffecter + tachesAttribuer;

  // Le même planning que la commerciale : l'onboarding suit elle aussi les cours en ligne,
  // avec les liens Zoom/Teams, pour vérifier qu'ils ont bien eu lieu.
  const planning = usePlanningSeances(authHeaders);

  const TABS = [
    { key:"taches", label:"Mes tâches", icon:"✅", badge: tachesTotal || null },
    { key:"dashboard",      label:"Tableau de bord",         icon:"📊" },
    { key:"apprenants",     label:"Nouveaux apprenants",      icon:"📥", badge:enAttente },
    { key:"mes_apprenants", label:"Mes apprenants",           icon:"🎓" },
    { key:"suivi",          label:"Suivi démarrage",          icon:"✅", badge:mesApprenants.filter(a=>!Object.values(a.suivi_checklist||{}).every(Boolean)).length || null },
    // { key:"bilans",         label:"Bilans & Renouvellements", icon:"📋", badge:bilansDus }, // désactivé temporairement
    { key:"groupes",        label:"Groupes",                  icon:"👥", badge:groupesSansCoach || null },
    // Les demandes de transfert emises par les coachs. L'onboarding est le seul a
    // pouvoir reaffecter ; le dossier reste ferme tant que le test de niveau n'est pas revenu.
    { key:"reaffecter",     label:"Dossiers à réaffecter",    icon:"🔄", badge: dossiersAReaffecter || null },
    { key:"plannings",      label:"Plannings",                icon:"📅", badge: planning.planningsAAlerter || null },
    { key:"coachs",         label:"Coachs",                   icon:"👨‍🏫" },
    { key:"contenus",       label:"Contenus",                 icon:"📚" },
    // { key:"archives",       label:"Archives",                 icon:"📦" }, // désactivé temporairement
    { key:"messages",       label:"Messages",                 icon:"💬", badge:(msgNonLus || 0) + chatGroupeNonLus || null },
    { key:"notifications",  label:"Notifications",            icon:"🔔", badge:notifNonLues || null },
  ];

  const inp = { padding:"9px 11px",borderRadius:8,border:"1px solid #d1d5db",fontSize:13,width:"100%",boxSizing:"border-box" };
  const lbl = { display:"block",fontSize:12,fontWeight:600,color:"#374151",marginBottom:4 };
  const btnP = { padding:"9px 16px",background:C,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12 };
  const btnS = { padding:"9px 16px",background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:12 };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#f5f3ff" }}>

      {/* HERO */}
      <div style={{ flexShrink:0, background:C_GRAD,padding:"28px 32px 0",color:"#fff",position:"relative",overflow:"hidden" }}>
        <div style={{ position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.05)" }}/>
        <div style={{ position:"absolute",bottom:-50,right:100,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.04)" }}/>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,marginBottom:26 }}>
          <div style={{ display:"flex",alignItems:"center",gap:18 }}>
            <div style={{ position:"relative", flexShrink:0 }} onClick={()=>{ if (avatarUrl) setPhotoProfilOuverte(true); }}>
              <div style={{ width:60,height:60,borderRadius:"50%",background:"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:20,border:"3px solid rgba(255,255,255,0.3)",overflow:"hidden" , cursor: avatarUrl ? "zoom-in" : "default"}}>
                {avatarUrl ? <img src={avatarUrl} alt={initiales} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}
              </div>
              {photoProfilOuverte && <VisionneuseImage url={avatarUrl} onClose={()=>setPhotoProfilOuverte(false)} />}
              <label title="Changer la photo" onClick={e=>e.stopPropagation()} style={{ position:"absolute",bottom:0,right:0,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11,border:"2px solid #fff" }}>
                📷<input type="file" accept="image/*" style={{ display:"none" }} onChange={(e)=>{ const f=e.target.files?.[0]; if(f){ uploadFichier(f, "avatar").then(handleAvatarSuccess).catch(e=>{}); } e.target.value=""; }} />
              </label>
            </div>
            <div>
              <div style={{ fontSize:11,color:"#d8b4fe",fontWeight:600,letterSpacing:"0.08em" }}>Bonjour 👋</div>
              <h1 style={{ margin:0,fontSize:21,fontWeight:900,color:"#fff" }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} /></h1>
              {surnomPerso.trim() && nomComplet !== nomAffiche && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:1 }}>{nomComplet}</div>
              )}
              <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                onEnregistre={(v) => setSurnomPerso(v || "")} />
              <div style={{ fontSize:12,color:"#c4b5fd",marginTop:3,display:"flex",alignItems:"center",gap:8 }}>
                <span>Assistante Onboarding · {profil?.email || ""}</span>
                {profil?.onboarding_vue_globale && (
                  <span style={{ fontSize:10,fontWeight:800,color:"#fff",background:"rgba(255,255,255,0.22)",border:"1px solid rgba(255,255,255,0.4)",borderRadius:99,padding:"2px 9px",letterSpacing:"0.03em" }}>🌍 Global</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <NotificationBell userId={profil?.id} />
              <button onClick={toggleLang} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", transition:"background .2s", letterSpacing:"0.06em" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
                {lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}
              </button>
            <DashboardColorPicker />
          {accesElearning && (
            <button
              type="button"
              onClick={() => openElearningSSO(ELEARNING_URL)}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", background:"rgba(8,145,178,0.25)", border:"1.5px solid rgba(8,145,178,0.5)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", transition:"background .2s", flexShrink:0 }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(8,145,178,0.45)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(8,145,178,0.25)"}
              title="Accéder à la plateforme E-Learning BET"
            >
              <span style={{ fontSize:15 }}>🎓</span> E-Learning
            </button>
          )}
          <button onClick={handleLogout}
            style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:10,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",backdropFilter:"blur(4px)",flexShrink:0 }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
            <span>🚪</span> Déconnexion
          </button>
          </div>
        </div>
        {/* Mini KPIs header */}
        <div style={{ display:"flex",gap:0,background:"rgba(0,0,0,0.18)",borderRadius:"10px 10px 0 0",overflow:"hidden" }}>
          {[
            { l:"En attente onboarding", v:enAttente,  c:"#f9a8d4" },
            { l:"Onboarding en cours",   v:enCours,    c:"#7dd3fc" },
            { l:"Bilans à traiter",      v:bilansDus,  c:"#fcd34d" },
          ].map((s,i,arr)=>(
            <div key={s.l} style={{ flex:1,textAlign:"center",padding:"12px 8px",borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.08)":"none" }}>
              <div style={{ fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:2 }}>{s.l}</div>
              <div style={{ fontSize:20,fontWeight:900,color:s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:"1 1 auto", padding:"0 24px 40px" }}>
        <div style={{ background:"#fff",borderRadius:"0 0 14px 14px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)",overflow:"hidden" }}>
          {/* TABS */}
          <div style={{ display:"flex",gap:0,borderBottom:"1px solid #e5e7eb",flexWrap:"wrap",background:"#fafafa" }}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setActiveTab(t.key)} style={{
                padding:"12px 16px",border:"none",borderBottom:activeTab===t.key?`3px solid ${C}`:"3px solid transparent",
                cursor:"pointer",fontWeight:600,fontSize:12,whiteSpace:"nowrap",
                background:"transparent",color:activeTab===t.key?C:"#6b7280",
                display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                flex:"1 1 130px",
              }}>
                <span style={{ fontSize:14 }}>{t.icon}</span>{t.label}
                {t.badge>0&&<span style={{ background:"#ef4444",color:"#fff",borderRadius:99,fontSize:9,fontWeight:800,padding:"1px 6px" }}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* ── Bannière scope commerciale ── */}
          {profil?.onboarding_vue_globale ? (
            <div style={{ padding:"10px 24px", background:"#f5f3ff", borderBottom:"1px solid #ddd6fe", display:"flex", alignItems:"center", gap:10, fontSize:12 }}>
              <span style={{ fontSize:16 }}>🌍</span>
              <span style={{ color:"#5b21b6" }}>
                <strong>Périmètre global</strong> - vous voyez toutes les demandes en attente, quelle que soit la commerciale ou le centre.
              </span>
            </div>
          ) : myCommercialLoading ? (
            <div style={{ padding:"10px 24px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd", fontSize:12, color:"#0369a1" }}>
              Chargement de votre périmètre…
            </div>
          ) : myCommerciales.length > 0 ? (
            <div style={{ padding:"10px 24px", background:"#f0fdf4", borderBottom:"1px solid #bbf7d0", display:"flex", alignItems:"center", gap:10, fontSize:12 }}>
              <span style={{ fontSize:16 }}>🔗</span>
              <span style={{ color:"#166534" }}>
                Votre périmètre couvre {myCommerciales.length > 1 ? `${myCommerciales.length} commerciales : ` : "les données de "}
                {myCommerciales.map((c,i) => (
                  <span key={c.id}>
                    <strong>{c.prenom} {c.nom}</strong>
                    {c.email && <span style={{ color:"#6b7280" }}> ({c.email})</span>}
                    {i < myCommerciales.length - 1 ? ", " : ""}
                  </span>
                ))}
              </span>
            </div>
          ) : (
            <div style={{ padding:"10px 24px", background:"#fffbeb", borderBottom:"1px solid #fde68a", display:"flex", alignItems:"center", gap:10, fontSize:12 }}>
              <span style={{ fontSize:16 }}>⚠️</span>
              <span style={{ color:"#92400e" }}>
                Vous n'êtes assignée à aucune assistante commerciale pour l'instant. Contactez votre Super Admin.
              </span>
            </div>
          )}

          {/* ── Banderole notifications non lues - complète la cloche, ne dépend pas d'un clic ── */}
          {!banderoleFermee && notifsBanderole.length > 0 && (
            <div style={{ padding:"10px 24px", background:"#fff7ed", borderBottom:"1px solid #fed7aa", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                {notifsBanderole.map(n => (
                  <div key={n.id} onClick={() => { marquerNotifLue(n.id); if (n.link) setActiveTab("notifications"); }}
                    style={{ display:"flex", alignItems:"baseline", gap:8, fontSize:12, cursor:"pointer" }}>
                    <span style={{ fontWeight:700, color:"#9a3412" }}>{n.titre}</span>
                    <span style={{ color:"#78716c", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.message}</span>
                  </div>
                ))}
                {notifNonLues > notifsBanderole.length && (
                  <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#c2410c", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                    +{notifNonLues - notifsBanderole.length} autre{notifNonLues - notifsBanderole.length > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
              <button onClick={()=>setBanderoleFermee(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
            </div>
          )}

          <div style={{ padding:24 }}>

            {/* ══ MES TÂCHES ══ */}
            {activeTab === "taches" && (() => {
              const taches = [
                { icon:"📥", label:"Apprenants en attente d'affectation", n:tachesApprenants, tab:"apprenants" },
                { icon:"✅", label:"Suivis de démarrage incomplets",      n:tachesSuivi,       tab:"suivi" },
                { icon:"👥", label:"Groupes actifs sans coach",           n:tachesGroupes,     tab:"groupes" },
                // Le test est revenu, le niveau est connu : ces dossiers n'attendent plus que
                // l'affectation a leur nouvelle classe. Sans cette ligne, ils dormaient dans
                // leur onglet jusqu'a ce qu'on pense a l'ouvrir.
                { icon:"🔄", label:"Transferts prêts à réaffecter",      n:dossiersAReaffecter, tab:"reaffecter" },
              ];
              const enCours = taches.filter(t => t.n > 0);
              /* Les dossiers à attribuer comptent comme du travail en attente, même quand
                 aucune des quatre autres tâches n'est ouverte. Sans ce `||`, le bloc d'alerte
                 s'affichait sous un « 🎉 Aucune tâche en attente » qui le contredisait. */
              const riemAFaire = enCours.length === 0 && tachesAttribuer === 0;
              return (
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:4 }}>✅ Mes tâches</div>
                  <div style={{ fontSize:12, color:"#64748b", marginBottom:18 }}>
                    {!riemAFaire
                      ? `${tachesTotal} élément${tachesTotal>1?"s":""} à traiter au total.`
                      : "Rien à traiter pour le moment - tout est à jour."}
                  </div>
                  {/* ── LES DOSSIERS SANS ASSISTANTE, DÉPLIÉS ET NON RÉSUMÉS ──
                      Les autres tâches sont des compteurs qui renvoient vers leur onglet. Pas
                      celle-ci : l'attribution n'existait qu'au fond d'une fiche - ouvrir le
                      groupe, ouvrir l'apprenant, faire défiler - et c'est exactement là qu'elle
                      s'oubliait. Une carte de plus à cliquer aurait reproduit l'oubli d'un cran
                      plus loin. Le geste se fait donc ici, en deux clics, sans quitter l'écran.

                      ET C'EST URGENT SANS ÊTRE VISIBLE : tant que personne n'est désigné,
                      AUCUNE assistante en ligne ne voit cet apprenant - leur liste est filtrée
                      sur ce champ. Le dossier n'est pas en retard, il est invisible. */}
                  {dossiersAAttribuer.length > 0 && (
                    <div style={{ border:"1.5px solid #fbbf24", background:"#fffbeb", borderRadius:14, padding:"14px 16px", marginBottom:16 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap", marginBottom:3 }}>
                        <span style={{ fontSize:13.5, fontWeight:800, color:"#92400e" }}>
                          ⚠ {dossiersAAttribuer.length} apprenant{dossiersAAttribuer.length>1?"s":""} sans assistante en ligne
                        </span>
                      </div>
                      <div style={{ fontSize:11.5, color:"#b45309", marginBottom:12, lineHeight:1.5 }}>
                        Tant qu'ils ne sont pas confiés, aucune assistante en ligne ne les voit.
                        À faire juste après l'affectation à la classe.
                      </div>

                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {dossiersAAttribuer.map(d => (
                          <div key={d.id} style={{ background:"#fff", border:"1px solid #fde68a", borderRadius:10,
                            padding:"11px 13px", display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
                            <div style={{ flex:"1 1 220px", minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{d.nom}</div>
                              <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
                                {d.telephone || d.email || "—"}
                                {d.canal_libelle && <> · {d.canal_libelle}</>}
                                {d.mensualite ? <> · {Number(d.mensualite).toLocaleString("fr-FR")} F/mois</> : null}
                              </div>
                              <div style={{ fontSize:11, marginTop:3, color: d.sans_classe ? "#b91c1c" : "#64748b" }}>
                                {/* Un dossier sans classe se dit : c'est une anomalie d'un autre
                                    ordre, et choisir une assistante ne la réglera pas. */}
                                {d.sans_classe
                                  ? "⚠ pas encore inscrit dans une classe"
                                  : <>📚 {d.classe}{d.niveau ? ` · ${d.niveau}` : ""}
                                      {d.coach_nom
                                        ? <span style={{ color:"#94a3b8" }}> · coach {d.coach_nom}</span>
                                        : <span style={{ color:"#b45309" }}> · sans coach</span>}
                                    </>}
                              </div>
                            </div>

                            {/* Le même sélecteur que dans la fiche : la question posée est la
                                même, elle doit se poser pareil. Deux écrans différents pour un
                                seul geste, c'est deux occasions de se tromper. */}
                            <button onClick={() => setSelecteurAssistante({ ...d, assignation_id: d.id })}
                              disabled={attributionEnCours}
                              style={{ flex:"0 1 240px", padding:"9px 13px", borderRadius:8, border:"none",
                                background: attributionEnCours ? "#cbd5e1" : "#d97706", color:"#fff",
                                fontSize:12.5, fontWeight:700, fontFamily:"inherit",
                                cursor: attributionEnCours ? "not-allowed" : "pointer" }}>
                              Confier à une assistante →
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {riemAFaire ? (
                    <div style={{ textAlign:"center", padding:"50px 0", color:"#94a3b8" }}>
                      <div style={{ fontSize:"2.4rem", marginBottom:8 }}>🎉</div>
                      Aucune tâche en attente.
                    </div>
                  ) : enCours.length === 0 ? null : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:14 }}>
                      {enCours.map((t,i) => (
                        <div key={i} onClick={() => setActiveTab(t.tab)}
                          style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"16px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:14, transition:"border-color .15s" }}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=C}
                          onMouseLeave={e=>e.currentTarget.style.borderColor="#e2e8f0"}>
                          <div style={{ fontSize:"1.6rem" }}>{t.icon}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{t.label}</div>
                            <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>Cliquer pour ouvrir</div>
                          </div>
                          <div style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:13, fontWeight:800, padding:"3px 11px", minWidth:26, textAlign:"center" }}>{t.n}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ══ TABLEAU DE BORD ══ */}
            {activeTab==="dashboard" && (() => {
              const totalActifs   = mesApprenants.filter(a=>a.statut==="actif").length;
              const groupesActifs = groupes.filter(g=>g.statut==="actif");
              const sansCoachs    = groupesActifs.filter(g=>!g.coach_id).length;
              const enAttenteList = apprenants.filter(a=>a.statut==="en_attente");

              // Répartition par niveau (mesApprenants réels)
              const niveauxCount = {};
              mesApprenants.forEach(a => {
                const niv = a.niveau || a.groupe_niveau || "-";
                niveauxCount[niv] = (niveauxCount[niv]||0) + 1;
              });
              const niveauxSorted = Object.entries(niveauxCount).sort((a,b)=>b[1]-a[1]);
              const NIVEAUX_COLORS2 = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };

              // Taux de remplissage moyen des groupes actifs
              const tauxRemplissage = groupesActifs.length
                ? Math.round(groupesActifs.reduce((s,g)=>s+Math.min(100,Math.round(((g.nb_apprenants||0)/(g.capacite_max||20))*100)),0)/groupesActifs.length)
                : 0;

              // Derniers apprenants ajoutés dans mes groupes (5 plus récents)
              const derniersApp = [...mesApprenants]
                .sort((a,b)=>(b.date_ajout||"").localeCompare(a.date_ajout||""))
                .slice(0,5);

              return (
                <div style={{ display:"grid",gap:20 }}>

                  {/* ── Ligne 1 : KPIs ── */}
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14 }}>
                    {[
                      { icon:"📥", label:"Dossiers en attente",   value:enAttenteList.length,  color:"#d97706", bg:"#fef3c7", sub:"à traiter maintenant",   onClick:()=>setActiveTab("apprenants") },
                      { icon:"🎓", label:"Apprenants actifs",      value:totalActifs,            color:"#16a34a", bg:"#dcfce7", sub:"dans mes groupes",        onClick:()=>setActiveTab("mes_apprenants") },
                      { icon:"👥", label:"Groupes actifs",         value:groupesActifs.length,   color:C,         bg:C_LIGHT,   sub:`${tauxRemplissage}% remplissage moy.`, onClick:()=>setActiveTab("groupes") },
                      { icon:"⚠️", label:"Groupes sans coach",     value:sansCoachs,             color:sansCoachs>0?"#dc2626":"#16a34a", bg:sansCoachs>0?"#fee2e2":"#dcfce7", sub:sansCoachs>0?"coach à assigner":"tous assignés", onClick:()=>setActiveTab("groupes") },
                    ].map(k=>(
                      <div key={k.label} onClick={k.onClick} style={{ background:"#fff",borderRadius:14,padding:"16px 18px",border:`1px solid ${k.color}20`,boxShadow:"0 2px 8px rgba(0,0,0,0.05)",cursor:"pointer",transition:"box-shadow .15s" }}
                        onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.1)"}
                        onMouseLeave={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.05)"}>
                        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                          <div style={{ width:46,height:46,borderRadius:12,background:k.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>{k.icon}</div>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ fontSize:10,color:"#9ca3af",fontWeight:600,marginBottom:1 }}>{k.label}</div>
                            <div style={{ fontSize:26,fontWeight:900,color:k.color,lineHeight:1 }}>{k.value}</div>
                            <div style={{ fontSize:10,color:"#94a3b8",marginTop:2 }}>{k.sub}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Ligne 2 : KPIs secondaires ── */}
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14 }}>
                    {[
                      { icon:"📊", label:"Total apprenants",   value:mesApprenants.length,                                  color:"#0891b2" },
                      { icon:"👤", label:"Avec coach",         value:groupesActifs.filter(g=>!!g.coach_id).length + " / " + groupesActifs.length, color:"#059669" },
                    ].map(k=>(
                      <div key={k.label} style={{ background:"#fff",borderRadius:12,padding:"12px 16px",border:"1px solid #f1f5f9",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",gap:12 }}>
                        <div style={{ width:38,height:38,borderRadius:10,background:k.color+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>{k.icon}</div>
                        <div>
                          <div style={{ fontSize:10,color:"#9ca3af" }}>{k.label}</div>
                          <div style={{ fontSize:20,fontWeight:900,color:k.color }}>{k.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Ligne 3 : Dossiers urgents + Répartition niveaux ── */}
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>

                    {/* Dossiers urgents */}
                    <div style={{ background:"#fff",borderRadius:14,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #f1f5f9",background:"#fafafa" }}>
                        <div style={{ fontSize:13,fontWeight:800,color:"#0f172a" }}>📥 Dossiers en attente</div>
                        {enAttenteList.length>0&&(
                          <button onClick={()=>setActiveTab("apprenants")} style={{ fontSize:11,color:C,fontWeight:700,background:"none",border:"none",cursor:"pointer" }}>Voir tous ({enAttenteList.length}) →</button>
                        )}
                      </div>
                      {enAttenteList.length===0 ? (
                        <div style={{ padding:"36px 20px",textAlign:"center" }}>
                          <div style={{ fontSize:32,marginBottom:8 }}>✅</div>
                          <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>Aucun dossier en attente</div>
                          <div style={{ fontSize:11,color:"#9ca3af",marginTop:4 }}>Tous les dossiers ont été traités</div>
                        </div>
                      ) : (
                        <div>
                          {enAttenteList.slice(0,4).map((a,i)=>(
                            <div key={a.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 18px",borderBottom:i<Math.min(enAttenteList.length,4)-1?"1px solid #f8fafc":"none",gap:10 }}>
                              <div style={{ display:"flex",gap:10,alignItems:"center",minWidth:0,flex:1 }}>
                                <div style={{ width:36,height:36,borderRadius:"50%",background:C_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:C,flexShrink:0 }}>{(a.nom||"?")[0]}</div>
                                <div style={{ minWidth:0 }}>
                                  <div style={{ fontSize:13,fontWeight:700,color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{a.nom}</div>
                                  <div style={{ fontSize:11,color:"#6b7280" }}>{a.offre||"-"} {a.niveau?`· ${a.niveau}`:""}</div>
                                </div>
                              </div>
                              <button onClick={()=>openDossierModal(a)} style={{ padding:"5px 12px",background:C,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontWeight:700,fontSize:11,flexShrink:0 }}>Traiter</button>
                            </div>
                          ))}
                          {enAttenteList.length>4&&(
                            <div style={{ padding:"10px 18px",fontSize:11,color:"#9ca3af",textAlign:"center",cursor:"pointer",background:"#fafafa" }} onClick={()=>setActiveTab("apprenants")}>
                              +{enAttenteList.length-4} autres dossiers →
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Répartition par niveau */}
                    <div style={{ background:"#fff",borderRadius:14,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                      <div style={{ padding:"14px 18px",borderBottom:"1px solid #f1f5f9",background:"#fafafa" }}>
                        <div style={{ fontSize:13,fontWeight:800,color:"#0f172a" }}>📊 Répartition par niveau</div>
                        <div style={{ fontSize:11,color:"#9ca3af",marginTop:2 }}>Apprenants actifs dans mes groupes</div>
                      </div>
                      {mesApprenants.length===0 ? (
                        <div style={{ padding:"36px 20px",textAlign:"center",fontSize:12,color:"#9ca3af" }}>Aucun apprenant dans vos groupes</div>
                      ) : (
                        <div style={{ padding:"16px 18px",display:"flex",flexDirection:"column",gap:10 }}>
                          {niveauxSorted.map(([niv,count])=>{
                            const pct = Math.round((count/mesApprenants.length)*100);
                            const col = NIVEAUX_COLORS2[niv]||"#6b7280";
                            return (
                              <div key={niv}>
                                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
                                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                                    <span style={{ display:"inline-block",width:28,padding:"2px 0",borderRadius:6,background:col,color:"#fff",fontSize:11,fontWeight:800,textAlign:"center" }}>{niv}</span>
                                    <span style={{ fontSize:12,color:"#374151",fontWeight:600 }}>{count} apprenant{count>1?"s":""}</span>
                                  </div>
                                  <span style={{ fontSize:12,fontWeight:700,color:col }}>{pct}%</span>
                                </div>
                                <div style={{ height:7,background:"#f1f5f9",borderRadius:99,overflow:"hidden" }}>
                                  <div style={{ height:"100%",width:`${pct}%`,background:col,borderRadius:99,transition:"width .4s" }}/>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Ligne 4 : Groupes + Dernières activités ── */}
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>

                    {/* État des groupes */}
                    <div style={{ background:"#fff",borderRadius:14,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #f1f5f9",background:"#fafafa" }}>
                        <div style={{ fontSize:13,fontWeight:800,color:"#0f172a" }}>👥 État des groupes</div>
                        <button onClick={()=>setActiveTab("groupes")} style={{ fontSize:11,color:C,fontWeight:700,background:"none",border:"none",cursor:"pointer" }}>Voir tous →</button>
                      </div>
                      {groupesActifs.length===0 ? (
                        <div style={{ padding:"36px 20px",textAlign:"center",fontSize:12,color:"#9ca3af" }}>Aucun groupe actif</div>
                      ) : (
                        <div>
                          {groupesActifs.slice(0,5).map((g,i)=>{
                            const nb  = g.nb_apprenants||0;
                            const cap = g.capacite_max||20;
                            const pct = Math.min(100,Math.round((nb/cap)*100));
                            const col = pct>=100?"#dc2626":pct>=80?"#d97706":"#16a34a";
                            return (
                              <div key={g.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"10px 18px",borderBottom:i<Math.min(groupesActifs.length,5)-1?"1px solid #f8fafc":"none" }}>
                                <div style={{ flex:1,minWidth:0 }}>
                                  <div style={{ fontSize:12,fontWeight:700,color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{g.nom}</div>
                                  <div style={{ fontSize:10,color:"#9ca3af" }}>{g.coach_nom||"Sans coach"} {g.niveau?`· ${g.niveau}`:""}</div>
                                </div>
                                <div style={{ textAlign:"right",flexShrink:0 }}>
                                  <div style={{ fontSize:12,fontWeight:800,color:col }}>{nb}<span style={{ fontWeight:400,color:"#9ca3af" }}>/{cap}</span></div>
                                  <div style={{ width:64,height:4,background:"#f1f5f9",borderRadius:99,overflow:"hidden",marginTop:3 }}>
                                    <div style={{ height:"100%",width:`${pct}%`,background:col,borderRadius:99 }}/>
                                  </div>
                                </div>
                                {!g.coach_id&&<span style={{ padding:"2px 7px",borderRadius:99,background:"#fee2e2",color:"#dc2626",fontSize:9,fontWeight:700,flexShrink:0 }}>Sans coach</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Dernières activités */}
                    <div style={{ background:"#fff",borderRadius:14,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #f1f5f9",background:"#fafafa" }}>
                        <div style={{ fontSize:13,fontWeight:800,color:"#0f172a" }}>🕐 Derniers apprenants ajoutés</div>
                        <button onClick={()=>setActiveTab("mes_apprenants")} style={{ fontSize:11,color:C,fontWeight:700,background:"none",border:"none",cursor:"pointer" }}>Voir tous →</button>
                      </div>
                      {derniersApp.length===0 ? (
                        <div style={{ padding:"36px 20px",textAlign:"center",fontSize:12,color:"#9ca3af" }}>Aucun apprenant pour l'instant</div>
                      ) : (
                        <div>
                          {derniersApp.map((a,i)=>{
                            const STATUT_GA = { actif:{c:"#16a34a",bg:"#dcfce7",l:"Actif"}, transfere:{c:"#0891b2",bg:"#e0f2fe",l:"Transféré"} };
                            const st = STATUT_GA[a.statut]||{c:"#6b7280",bg:"#f1f5f9",l:a.statut||"-"};
                            const niv = a.niveau||a.groupe_niveau;
                            const col = NIVEAUX_COLORS2[niv]||"#6b7280";
                            const initiales = ((a.prenom_apprenant?.[0]||"")+(a.nom_apprenant?.[0]||"")).toUpperCase()||"?";
                            return (
                              <div key={a.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 18px",borderBottom:i<derniersApp.length-1?"1px solid #f8fafc":"none" }}>
                                <div style={{ width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,#0f172a,${assombrirCouleur(C)})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,color:"#fff",flexShrink:0,overflow:"hidden" }}>{a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}</div>
                                <div style={{ flex:1,minWidth:0 }}>
                                  <div style={{ fontSize:12,fontWeight:700,color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{a.prenom_apprenant} {a.nom_apprenant}</div>
                                  <div style={{ fontSize:10,color:"#9ca3af" }}>{a.groupe_nom||"-"}</div>
                                </div>
                                <div style={{ display:"flex",gap:4,alignItems:"center",flexShrink:0 }}>
                                  {niv&&<span style={{ padding:"2px 7px",borderRadius:99,background:col+"20",color:col,fontSize:10,fontWeight:800 }}>{niv}</span>}
                                  <span style={{ padding:"2px 7px",borderRadius:99,background:st.bg,color:st.c,fontSize:10,fontWeight:700 }}>{st.l}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              );
            })()}
            

            {/* ══ NOUVEAUX APPRENANTS - Réception des dossiers ══ */}
            {activeTab==="apprenants" && (() => {
              const enAttentes = apprenants.filter(a => a.statut === "en_attente");
              return (
                <div>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
                    <div>
                      <h2 style={{ margin:0,fontSize:17,fontWeight:800,color:"#0f172a" }}>📥 Réception des dossiers</h2>
                      <p style={{ margin:"4px 0 0",fontSize:12,color:"#6b7280" }}>Apprenants convertis par la commerciale - à traiter avant transfert dans <strong>Mes apprenants</strong></p>
                    </div>
                    <span style={{ padding:"4px 12px",borderRadius:99,background:C_LIGHT,color:C,fontSize:12,fontWeight:700 }}>{enAttentes.length} en attente</span>
                  </div>

                  {/* Explication du processus */}
                  <div style={{ background:"linear-gradient(135deg,#f3e8ff,#e0f2fe)",borderRadius:12,padding:"14px 18px",marginBottom:22,border:"1px solid #ddd6fe",display:"flex",gap:14,alignItems:"flex-start" }}>
                    <span style={{ fontSize:22,flexShrink:0 }}>ℹ️</span>
                    <div style={{ fontSize:12,color:"#374151",lineHeight:1.7 }}>
                      <strong>Processus de traitement :</strong><br/>
                      <span style={{ color:C,fontWeight:700 }}>Étape 1</span> - Vérification et complétion du profil (coordonnées, niveau, programme, attentes, dates).<br/>
                      <span style={{ color:"#0891b2",fontWeight:700 }}>Étape 2</span> - Recherche et affectation d'un coach selon le niveau et le programme.<br/>
                      <span style={{ color:"#22c55e",fontWeight:700 }}>Étape 3</span> - Affectation au groupe du coach pour ce niveau. Si quota atteint ou aucun groupe disponible, un nouveau groupe est créé (le coach est notifié automatiquement).<br/>
                      Une fois validé, l'apprenant est transféré dans <strong>Mes apprenants</strong> pour le suivi.
                    </div>
                  </div>

                  {apprenantsLoading && (
                    <div style={{ textAlign:"center",padding:"40px 24px",color:"#9ca3af" }}>⏳ Chargement des apprenants…</div>
                  )}
                  {!apprenantsLoading && enAttentes.length === 0 && (
                    <div style={{ textAlign:"center",padding:"50px 24px",background:"#f8fafc",borderRadius:16,border:"2px dashed #e2e8f0" }}>
                      <div style={{ fontSize:"3rem",marginBottom:10 }}>✅</div>
                      <div style={{ fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:6 }}>Aucun dossier en attente</div>
                      <div style={{ fontSize:12,color:"#9ca3af" }}>Tous les dossiers ont été traités. Consultez <strong>Mes apprenants</strong> pour le suivi.</div>
                      <button onClick={()=>setActiveTab("mes_apprenants")} style={{ marginTop:16,padding:"9px 20px",background:C,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12 }}>Voir Mes apprenants →</button>
                    </div>
                  )}

                  <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                    {paginate(enAttentes, pageApprenants).map(a => (
                      <div key={a.id} style={{ background:"#fff",borderRadius:14,border:`1.5px solid ${C}30`,overflow:"hidden",boxShadow:"0 2px 10px rgba(124,58,237,0.07)" }}>
                        <div style={{ height:3,background:`linear-gradient(90deg,${C},#0891b2)` }}/>
                        <div style={{ padding:"16px 20px",display:"flex",gap:16,alignItems:"flex-start" }}>
                          {/* Avatar */}
                          <div style={{ width:48,height:48,borderRadius:"50%",background:C_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:18,color:C,flexShrink:0 }}>{a.nom[0]}</div>
                          {/* Infos */}
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:6 }}>
                              <span style={{ fontSize:15,fontWeight:800,color:"#0f172a" }}>{a.nom}</span>
                              <Badge label="En attente" color="#d97706" bg="#fef3c7" />
                              {a.suivi_demarrage?.coach_id && (
                                <Badge label="🔒 Coaching Privé PA" color="#7c3aed" bg="#f3e8ff" />
                              )}
                              {a.pa_advisor_nom && (
                                <Badge label={`👤 PA : ${a.pa_advisor_nom}`} color="#6d28d9" bg="#ede9fe" />
                              )}
                              <span style={{ fontSize:11,color:"#9ca3af" }}>Reçu le {formatDate(a.dateConversion)}</span>
                            </div>
                            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:6 }}>
                              {[
                                { l:"Email",    v:a.email||"-",         icon:"📧" },
                                { l:"Téléphone",v:a.telephone||"-",     icon:"📞" },
                                { l:"Programme",v:a.offre||"-",         icon:"📚" },
                                { l:"Niveau",   v:a.niveau?(a.niveau+" - "+(NIVEAUX[a.niveau]||"")):"-", icon:"🎯" },
                                { l:"Profil",   v:a.entreprise||a.profil||"-", icon:"🏢" },
                              ].map(s=>(
                                <div key={s.l} style={{ padding:"5px 8px",borderRadius:6,background:"#f8fafc",display:"flex",gap:6,alignItems:"flex-start" }}>
                                  <span style={{ fontSize:11,flexShrink:0 }}>{s.icon}</span>
                                  <div>
                                    <div style={{ fontSize:9,color:"#9ca3af",lineHeight:1 }}>{s.l}</div>
                                    <div style={{ fontSize:11,fontWeight:700,color:"#374151" }}>{s.v}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Action */}
                          <div style={{ flexShrink:0, display:"flex", flexDirection:"column", gap:6 }}>
                            <button onClick={()=>openDossierModal(a)} style={{ padding:"10px 18px",background:C,color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap",boxShadow:`0 2px 8px ${C}40` }}>
                              📋 Traiter le dossier
                            </button>
                            <button
                              onClick={() => setCancelModalOB({ open:true, target:a, raison:"", raisonLibre:"", context:"nouveau" })}
                              style={{ padding:"7px 14px",background:"#fff5f5",color:"#dc2626",border:"1px solid #fecaca",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:11,whiteSpace:"nowrap" }}
                            >
                              ✕ Annuler le dossier
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Pagination page={pageApprenants} setPage={setPageApprenants} total={enAttentes.length} />
                </div>
              );
            })()}

            {/* ══ MES APPRENANTS - Suivi ══ */}
            {activeTab==="mes_apprenants" && (() => {
              const STATUT_GA = {
                actif:        { label:"Actif",          color:"#166534", bg:"#dcfce7" },
                transfere:    { label:"Transféré",      color:"#0891b2", bg:"#e0f2fe" },
                retire:       { label:"Retiré",         color:"#6b7280", bg:"#f1f5f9" },
              };
              const NIVEAUX_COLORS = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
              const TYPE_ICO = { prive:"🔒",en_ligne:"💻",domicile:"🏠",centre:"🏢" };
              const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}) : "-";

              const groupesUniq = [...new Set(mesApprenants.map(a=>a.groupe_nom).filter(Boolean))];

              const filtered = mesApprenants.filter(a => {
                const q = mesAppSearch.toLowerCase();
                const nom = `${a.prenom_apprenant||""} ${a.nom_apprenant||""}`.toLowerCase();
                if (q && !nom.includes(q) && !(a.email_apprenant||"").toLowerCase().includes(q) && !(a.coach_nom||"").toLowerCase().includes(q)) return false;
                const niv = a.niveau || a.groupe_niveau;
                if (mesAppNiveau !== "tous" && niv !== mesAppNiveau) return false;
                if (mesAppStatut !== "tous" && a.statut !== mesAppStatut) return false;
                if (mesAppGroupe !== "tous" && a.groupe_nom !== mesAppGroupe) return false;
                return true;
              });

              const kpiActif   = mesApprenants.filter(a=>a.statut==="actif").length;
              const kpiTransf  = mesApprenants.filter(a=>a.statut==="transfere").length;

              return (
                <div>
                  {/* Header */}
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
                    <div>
                      <h2 style={{ margin:0,fontSize:17,fontWeight:800,color:"#0f172a" }}>🎓 Mes apprenants</h2>
                      <p style={{ margin:"4px 0 0",fontSize:12,color:"#6b7280" }}>Tous les apprenants inscrits dans les groupes - données réelles</p>
                    </div>
                    <button onClick={()=>{ setMesAppLoading(true); const tok=localStorage.getItem("admin_token"); fetch(`${API_URL}/api/groupes/apprenants`,{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.ok?r.json():{apprenants:[]}).then(d=>setMesApprenants(d.apprenants||[])).catch(()=>{}).finally(()=>setMesAppLoading(false)); }}
                      style={{ padding:"7px 14px",background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:11 }}>
                      🔄 Actualiser
                    </button>
                  </div>

                  {/* KPIs */}
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:22 }}>
                    {[
                      { icon:"🎓", label:"Total",          value:mesApprenants.length,  color:C },
                      { icon:"✅", label:"Actifs",          value:kpiActif,              color:"#16a34a" },
                      { icon:"🔄", label:"Transférés",      value:kpiTransf,             color:"#0891b2" },
                    ].map(k=>(
                      <div key={k.label} style={{ background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #f1f5f9",boxShadow:"0 1px 6px rgba(0,0,0,0.05)",display:"flex",alignItems:"center",gap:12 }}>
                        <div style={{ width:42,height:42,borderRadius:10,background:k.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0 }}>{k.icon}</div>
                        <div>
                          <div style={{ fontSize:10,color:"#9ca3af" }}>{k.label}</div>
                          <div style={{ fontSize:22,fontWeight:900,color:k.color,lineHeight:1.1 }}>{k.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Filtres */}
                  <div style={{ display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:18,padding:"10px 14px",background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0" }}>
                    <input value={mesAppSearch} onChange={e=>{setMesAppSearch(e.target.value);setPageMesApp(1);}} placeholder="🔍 Nom, email ou coach…" style={{ padding:"8px 11px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12,width:220 }} />
                    <select value={mesAppNiveau} onChange={e=>{setMesAppNiveau(e.target.value);setPageMesApp(1);}} style={{ padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12 }}>
                      <option value="tous">Tous niveaux</option>
                      {["A1","A2","B1","B2","C1","C2"].map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                    <select value={mesAppStatut} onChange={e=>{setMesAppStatut(e.target.value);setPageMesApp(1);}} style={{ padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12 }}>
                      <option value="tous">Tous statuts</option>
                      <option value="actif">Actif</option>
                      <option value="transfere">Transféré</option>
                    </select>
                    {groupesUniq.length > 1 && (
                      <select value={mesAppGroupe} onChange={e=>{setMesAppGroupe(e.target.value);setPageMesApp(1);}} style={{ padding:"8px 10px",borderRadius:8,border:"1px solid #d1d5db",fontSize:12 }}>
                        <option value="tous">Tous les groupes</option>
                        {groupesUniq.map(g=><option key={g} value={g}>{g}</option>)}
                      </select>
                    )}
                    {(mesAppSearch||mesAppNiveau!=="tous"||mesAppStatut!=="tous"||mesAppGroupe!=="tous") && (
                      <button onClick={()=>{setMesAppSearch("");setMesAppNiveau("tous");setMesAppStatut("tous");setMesAppGroupe("tous");setPageMesApp(1);}}
                        style={{ padding:"7px 12px",background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0",borderRadius:8,cursor:"pointer",fontSize:11 }}>✕ Effacer</button>
                    )}
                    <span style={{ marginLeft:"auto",fontSize:11,color:"#6b7280" }}>{filtered.length} apprenant{filtered.length!==1?"s":""} · page {pageMesApp}/{totalPages(filtered)}</span>
                  </div>

                  {/* États vides */}
                  {mesAppLoading && <div style={{ textAlign:"center",padding:60,color:"#9ca3af" }}>Chargement des apprenants…</div>}
                  {!mesAppLoading && mesApprenants.length===0 && (
                    <div style={{ textAlign:"center",padding:"50px 24px",background:"#f8fafc",borderRadius:16,border:"2px dashed #e2e8f0" }}>
                      <div style={{ fontSize:"3rem",marginBottom:10 }}>🎓</div>
                      <div style={{ fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:6 }}>Aucun apprenant dans vos groupes</div>
                      <div style={{ fontSize:12,color:"#9ca3af",marginBottom:16 }}>Ajoutez des apprenants dans vos groupes depuis l'onglet <strong>Groupes</strong>.</div>
                      <button onClick={()=>setActiveTab("groupes")} style={{ padding:"9px 20px",background:C,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:12 }}>👥 Voir les groupes</button>
                    </div>
                  )}
                  {!mesAppLoading && mesApprenants.length>0 && filtered.length===0 && (
                    <div style={{ textAlign:"center",padding:"40px 0",color:"#94a3b8",fontSize:13 }}>Aucun apprenant ne correspond aux filtres.</div>
                  )}

                  {/* Tableau */}
                  {!mesAppLoading && filtered.length>0 && (
                    <div style={{ background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
                      <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
                        <thead>
                          <tr style={{ background:"#f8fafc",borderBottom:"2px solid #e2e8f0" }}>
                            {["Apprenant","Niveau","Programme","Groupe","Coach","Ajouté le","Statut","Actions"].map(h=>(
                              <th key={h} style={{ padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:".05em",whiteSpace:"nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paginate(filtered, pageMesApp).map((a,i) => {
                            const statCfg = STATUT_GA[a.statut] || { label:a.statut||"-", color:"#6b7280", bg:"#f1f5f9" };
                            const niv = a.niveau || a.groupe_niveau;
                            const nvColor = NIVEAUX_COLORS[niv] || "#6b7280";
                            const initiales = ((a.prenom_apprenant?.[0]||"")+(a.nom_apprenant?.[0]||"")).toUpperCase() || "?";
                            const prog = a.note_obj?.programme || a.groupe_filiere || "-";
                            const ouvrirDossier = () => {
                              const grp = groupes.find(g=>g.id===a.groupe_id);
                              if (grp) setSelectedGroupe(grp);
                              // Le modal est rendu dans l'onglet "groupes" → basculer d'abord
                              setActiveTab("groupes");
                              setTimeout(()=>openApprenantDetail(a), 100);
                            };
                            return (
                              <tr key={a.id} onClick={ouvrirDossier} style={{ borderBottom:i<filtered.length-1?"1px solid #f1f5f9":"none", background:i%2===0?"#fff":"#fafafa", cursor:"pointer" }}
                                onMouseEnter={e=>e.currentTarget.style.background="#f0f4ff"}
                                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafafa"}>

                                {/* Apprenant */}
                                <td style={{ padding:"10px 14px" }}>
                                  <div style={{ display:"flex",alignItems:"center",gap:9 }}>
                                    <div style={{ width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,#0f172a,${assombrirCouleur(C)})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,color:"#fff",flexShrink:0,overflow:"hidden" }}>{a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}</div>
                                    <div style={{ minWidth:0 }}>
                                      <div style={{ fontWeight:700,color:"#0f172a",whiteSpace:"nowrap" }}>{a.prenom_apprenant} {a.nom_apprenant}</div>
                                      <div style={{ fontSize:11,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180 }}>{a.email_apprenant||"-"}</div>
                                    </div>
                                  </div>
                                </td>

                                {/* Niveau */}
                                <td style={{ padding:"10px 14px" }}>
                                  {niv ? <span style={{ padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:800,color:"#fff",background:nvColor }}>{niv}</span> : <span style={{ color:"#9ca3af" }}>-</span>}
                                </td>

                                {/* Programme */}
                                <td style={{ padding:"10px 14px",maxWidth:160 }}>
                                  <span style={{ fontSize:11,color:prog!=="-"?C:"#9ca3af",fontWeight:prog!=="-"?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block" }}>{prog}</span>
                                </td>

                                {/* Groupe */}
                                <td style={{ padding:"10px 14px",maxWidth:160 }}>
                                  <span style={{ fontSize:11,fontWeight:600,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block" }}>{a.groupe_nom||"-"}</span>
                                </td>

                                {/* Coach */}
                                <td style={{ padding:"10px 14px",whiteSpace:"nowrap" }}>
                                  <span style={{ fontSize:11,fontWeight:600,color:"#374151" }}>{a.coach_nom||"-"}</span>
                                </td>

                                {/* Date ajout */}
                                <td style={{ padding:"10px 14px",whiteSpace:"nowrap",color:"#6b7280",fontSize:11 }}>
                                  {fmtDate(a.date_ajout)}
                                </td>

                                {/* Statut */}
                                <td style={{ padding:"10px 14px" }}>
                                  <span style={{ padding:"3px 10px",borderRadius:99,fontSize:10,fontWeight:700,color:statCfg.color,background:statCfg.bg,whiteSpace:"nowrap" }}>{statCfg.label}</span>
                                </td>

                                {/* Actions */}
                                <td style={{ padding:"10px 14px" }} onClick={e=>e.stopPropagation()}>
                                  <div style={{ display:"flex",gap:6 }}>
                                    <button onClick={ouvrirDossier}
                                      style={{ padding:"5px 11px",background:C_LIGHT,color:C,border:`1px solid ${C}30`,borderRadius:7,cursor:"pointer",fontWeight:700,fontSize:11,whiteSpace:"nowrap" }}>
                                      👤 Dossier
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!mesAppLoading && filtered.length>0 && <Pagination page={pageMesApp} setPage={setPageMesApp} total={filtered.length} />}
                </div>
              );
            })()}

            {/* ══ SUIVI DÉMARRAGE ══ */}
            {activeTab==="suivi" && (
              <div>
                <div style={{ marginBottom:18 }}>
                  <h2 style={{ margin:0,fontSize:17,fontWeight:800,color:"#0f172a" }}>🚀 Kick-off & Onboarding apprenant</h2>
                  <p style={{ margin:"4px 0 0",fontSize:12,color:"#6b7280" }}>Envoi automatique : email de bienvenue · lien espace apprenant · lien matériel de cours · planning</p>
                </div>
                {(() => {
                  const suiviFiltres = mesApprenants.filter(a => {
                    const pct = pctChecklist(checklistEffectif(a));
                    if (suiviFiltreStatut === "termine" && pct !== 100) return false;
                    if (suiviFiltreStatut === "non_termine" && pct === 100) return false;
                    if (suiviFiltreDateDebut && (!a.date_ajout || a.date_ajout < suiviFiltreDateDebut)) return false;
                    if (suiviFiltreDateFin && (!a.date_ajout || a.date_ajout > suiviFiltreDateFin)) return false;
                    return true;
                  });
                  const suiviPage = paginate(suiviFiltres, pageSuivi);
                  return (
                    <>
                      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:16 }}>
                        <div style={{ display:"flex", gap:6 }}>
                          {[{v:"tous",l:"Tous"},{v:"non_termine",l:"Non terminés"},{v:"termine",l:"Terminés"}].map(s=>(
                            <button key={s.v} onClick={()=>{ setSuiviFiltreStatut(s.v); setPageSuivi(1); }}
                              style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${suiviFiltreStatut===s.v?C:"#e2e8f0"}`, background:suiviFiltreStatut===s.v?C_LIGHT:"#fff", color:suiviFiltreStatut===s.v?C:"#374151", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                              {s.l}
                            </button>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:6, alignItems:"center", marginLeft:"auto" }}>
                          <label style={{ fontSize:11, color:"#6b7280" }}>Du</label>
                          <input type="date" value={suiviFiltreDateDebut} onChange={e=>{ setSuiviFiltreDateDebut(e.target.value); setPageSuivi(1); }}
                            style={{ padding:"5px 8px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }} />
                          <label style={{ fontSize:11, color:"#6b7280" }}>au</label>
                          <input type="date" value={suiviFiltreDateFin} onChange={e=>{ setSuiviFiltreDateFin(e.target.value); setPageSuivi(1); }}
                            style={{ padding:"5px 8px", borderRadius:7, border:"1px solid #d1d5db", fontSize:12 }} />
                          {(suiviFiltreDateDebut||suiviFiltreDateFin) && (
                            <button onClick={()=>{ setSuiviFiltreDateDebut(""); setSuiviFiltreDateFin(""); setPageSuivi(1); }}
                              style={{ padding:"5px 10px", borderRadius:7, border:"1px solid #e2e8f0", background:"#fff", color:"#6b7280", fontSize:11, cursor:"pointer" }}>✕</button>
                          )}
                        </div>
                      </div>
                      {suiviFiltres.length===0 ? (
                        <div style={{ textAlign:"center",padding:40,color:"#9ca3af",fontSize:13,background:"#f8fafc",borderRadius:12 }}>
                          {mesApprenants.length===0 ? `Aucun apprenant inscrit pour le moment - démarrez depuis l'onglet "Nouveaux apprenants"` : "Aucun apprenant ne correspond à ces filtres."}
                        </div>
                      ) : (
                        <>
                          <div className="table-wrap" style={{ overflowX:"auto", border:"1px solid #e5e7eb", borderRadius:10 }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                              <thead>
                                <tr style={{ textAlign:"left", background:"#f8fafc", borderBottom:"1px solid #e5e7eb" }}>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Apprenant</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Groupe</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Coach</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Inscrit le</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Progression</th>
                                </tr>
                              </thead>
                              <tbody>
                                {suiviPage.map(a=>{
                                  const pct=pctChecklist(checklistEffectif(a));
                                  const nomComplet = `${a.prenom_apprenant||""} ${a.nom_apprenant||""}`.trim()||"?";
                                  return (
                                    <tr key={a.id} onClick={()=>setDetailSuiviApprenant(a)} style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer" }}
                                      onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                      <td style={{ padding:"10px 12px" }}>
                                        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                                          <div style={{ width:32,height:32,borderRadius:"50%",background:C_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:C,flexShrink:0,overflow:"hidden" }}>
                                            {a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : nomComplet[0].toUpperCase()}
                                          </div>
                                          <span style={{ fontWeight:700,color:"#0f172a" }}>{nomComplet} <span style={{ fontSize:10 }}>✅</span></span>
                                        </div>
                                      </td>
                                      <td style={{ padding:"10px 12px", color:"#374151" }}>{a.groupe_nom||"-"}</td>
                                      <td style={{ padding:"10px 12px", color:"#374151" }}>{a.coach_nom||"-"}</td>
                                      <td style={{ padding:"10px 12px", color:"#6b7280", fontSize:11 }}>{formatDate(a.date_ajout)}</td>
                                      <td style={{ padding:"10px 12px" }}>
                                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                                          <div style={{ flex:1,maxWidth:80,height:6,background:"#e5e7eb",borderRadius:4,overflow:"hidden" }}>
                                            <div style={{ height:"100%",width:`${pct}%`,background:pct===100?"#22c55e":pct>=50?C:"#d97706",borderRadius:4 }}/>
                                          </div>
                                          <span style={{ fontSize:12,fontWeight:800,color:pct===100?"#22c55e":pct>=50?C:"#d97706" }}>{pct}%</span>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <Pagination page={pageSuivi} setPage={setPageSuivi} total={suiviFiltres.length} />
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ══ PLANNINGS ══ */}
            {/* Exactement l'écran de la commerciale, monté depuis le même composant :
                deux copies auraient fini par décrire différemment le même cours. */}
            {activeTab==="plannings" && <PlanningSeances {...planning} />}

            {/* ══ GROUPES ══ */}
            {activeTab==="groupes" && (
              <div>
              {/* ── Grille groupes (toujours visible) ── */}
              <div>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:10 }}>
                  <div>
                    <h2 style={{ margin:0,fontSize:17,fontWeight:800,color:"#0f172a" }}>👥 Groupes de cours</h2>
                    <p style={{ margin:"4px 0 0",fontSize:12,color:"#6b7280" }}>{groupes.length} groupe{groupes.length>1?"s":""} - cliquez sur une carte pour ouvrir le détail</p>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button disabled={!peut("classes","create")} title={permBtnTitle("Importer du coaching privé",peut("classes","create"))} onClick={() => { fetchAssistantesEnLigne(); setShowImportPriveUpload(true); }} style={{ ...permBtnStyle(btnP,peut("classes","create")), background:"#fdf2f8", color:"#be185d", border:"1px solid #fbcfe8" }}>
                      🔒 Importer coaching privé
                    </button>
                    <button disabled={!peut("classes","create")} title={permBtnTitle("Import global - groupes + apprenants en un seul fichier",peut("classes","create"))} onClick={() => { fetchAssistantesEnLigne(); setShowImportGlobalUpload(true); }} style={{ ...permBtnStyle(btnP,peut("classes","create")), background:"#ecfeff", color:"#0e7490", border:"1px solid #a5f3fc" }}>
                      🌐 Import global
                    </button>
                    <button onClick={ouvrirHistoriqueImports} title="Historique des imports - relancer un lot interrompu ou annuler un lot créé par erreur" style={{ position:"relative", padding:"8px 16px", background:"#fff", border:"1.5px solid #cbd5e1", borderRadius:8, fontSize:12, color:"#334155", cursor:"pointer", fontWeight:700 }}>📥 Historique{(nbImportsInterrompus > 0 || nbImportsAnnules > 0) && (<span style={{ position:"absolute", top:-7, right:-7, display:"flex", gap:3 }}>{nbImportsInterrompus > 0 && (<span title={`${nbImportsInterrompus} import(s) interrompu(s) - à relancer pour créer les lignes manquantes`} style={{ minWidth:18, height:18, padding:"0 5px", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 0 2px #fff", background:"#f59e0b" }}>{nbImportsInterrompus}</span>)}{nbImportsAnnules > 0 && (<span title={`${nbImportsAnnules} import(s) annulé(s) - les données créées ont été supprimées`} style={{ minWidth:18, height:18, padding:"0 5px", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 0 2px #fff", background:"#dc2626" }}>{nbImportsAnnules}</span>)}</span>)}</button>
                    <button disabled={!peut("classes","create")} title={permBtnTitle("Créer un groupe",peut("classes","create"))} onClick={()=>{ setGroupeForm({ nom:"", niveau:"", filiere:"", type_cours:"en_ligne", coach_id:"", date_debut:"", date_fin:"", capacite_max:20, horaire:[], photo_url:null }); setGroupeCoachSearch(""); fetchCoachsDispos(coaches.map(c=>c.id)); setShowCreateGroupe(true); }} style={permBtnStyle(btnP,peut("classes","create"))}>{peut("classes","create")?"+":"🔒"} Créer un groupe</button>
                  </div>
                </div>
                {/* Filtres rapides - type de cours + statut */}
                {(()=>{
                  // Capacité max === 1 est le marqueur fiable d'une classe privée (posé à la
                  // création par le flux coaching privé) - la colonne is_prive en base n'est
                  // jamais renseignée par le code et reste incohérente sur les anciennes lignes.
                  // « prive » est la convention BET pour un coaching privé EN LIGNE : le filtre
                  // Type doit donc le ramener avec les cours en ligne, sans quoi ces classes
                  // n'apparaissent sous aucun type.
                  const estPrive  = g => estClassePrivee(g) || g.type_cours === "prive";
                  const cadreType = (g,t) => t === "en_ligne"
                    ? (g.type_cours === "en_ligne" || g.type_cours === "prive")
                    : g.type_cours === t;
                  const groupesFiltres = groupes
                    .filter(g => filtreTypeGroupes === "tous" || cadreType(g, filtreTypeGroupes))
                    .filter(g => filtreStatutGroupes === "tous" || g.statut === filtreStatutGroupes)
                    .filter(g => filtreCategorieGroupes === "tous" || (filtreCategorieGroupes === "prive") === estPrive(g));
                  return (
                    <>
                      <BarreFiltres accent={C}>
                        <RangeePastilles label="Catégorie :" valeur={filtreCategorieGroupes}
                          onChange={(v)=>{ setFiltreCategorieGroupes(v); setPageGroupes(1); }}
                          options={[{v:"tous",l:"Tous"},{v:"groupe",l:"👥 Cours groupe"},{v:"prive",l:"🔒 Cours privés"}]}
                          compte={(v)=> v==="tous" ? groupes.length : groupes.filter(g=>(v==="prive")===estPrive(g)).length} />

                        <RangeePastilles label="Type :" valeur={filtreTypeGroupes}
                          onChange={(v)=>{ setFiltreTypeGroupes(v); setPageGroupes(1); }}
                          options={[{v:"tous",l:"Tous"},{v:"en_ligne",l:"💻 En ligne"}]}
                          compte={(v)=> v==="tous" ? groupes.length : groupes.filter(g=>cadreType(g,v)).length} />

                        <RangeePastilles label="Statut :" valeur={filtreStatutGroupes} style={{ marginBottom:16 }}
                          onChange={(v)=>{ setFiltreStatutGroupes(v); setPageGroupes(1); }}
                          options={[{v:"tous",l:"Tous"},{v:"actif",l:"🟢 Actives"},{v:"cloture",l:"🔒 Terminées"}]}
                          compte={(v)=> v==="tous" ? groupes.length : groupes.filter(g=>g.statut===v).length} />
                      </BarreFiltres>
                      {groupesLoading && (
                        <div style={{ textAlign:"center",padding:40,color:"#9ca3af",fontSize:13 }}>Chargement des groupes…</div>
                      )}
                      {!groupesLoading && groupesFiltres.length===0 && (
                        <div style={{ textAlign:"center",padding:60,color:"#9ca3af",fontSize:13 }}>
                          <div style={{ fontSize:40,marginBottom:12 }}>👥</div>
                          {filtreTypeGroupes==="tous" && filtreStatutGroupes==="tous" ? "Aucun groupe créé - cliquez sur \"+ Créer un groupe\"" : "Aucun groupe ne correspond à ces filtres."}
                        </div>
                      )}
                      {!groupesLoading && groupesFiltres.length>0 && (
                        <div style={{ background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
                          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
                            <thead>
                              <tr style={{ background:"#f8fafc",borderBottom:"2px solid #e2e8f0" }}>
                                {["Groupe","Filière / Niveau","Coach","Type","Apprenants","Remplissage","Début","Statut",""].map(h=>(
                                  <th key={h} style={{ padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:".05em",whiteSpace:"nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {paginate(groupesFiltres, pageGroupes).map((g,i) => {
                                const isActif = g.statut==="actif";
                                const coachObj = coaches.find(c=>c.id===g.coach_id);
                                const coachNom = coachObj ? `${coachObj.prenom||""} ${coachObj.nom||""}`.trim() : (g.coach_nom||"-");
                                const horaires = Array.isArray(g.horaire)?g.horaire:(typeof g.horaire==="string"?(()=>{try{return JSON.parse(g.horaire);}catch{return[];}})():[]);
                                const nbApp = g.nb_apprenants||0;
                                const cap = g.capacite_max||20;
                                const pct = Math.min(100,Math.round((nbApp/cap)*100));
                                const estPriveRow = estClassePrivee(g);
                                const NIVEAUX_COLORS = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
                                return (
                                  <tr key={g.id}
                                    style={{ borderBottom:i<groupesFiltres.length-1?"1px solid #f1f5f9":"none",background:i%2===0?"#fff":"#fafafa",cursor:"pointer" }}
                                    onMouseEnter={e=>e.currentTarget.style.background="#f0f4ff"}
                                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafafa"}
                                    onClick={()=>fetchGroupeDetail(g)}>

                                    {/* Nom groupe */}
                                    <td style={{ padding:"10px 14px" }}>
                                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                                        <div style={{ width:4,height:36,borderRadius:99,background:isActif?C:"#94a3b8",flexShrink:0 }}/>
                                        {/* La photo de la classe, celle-là même qui habille son
                                            fil de discussion. */}
                                        <PastilleGroupe nom={g.nom} url={g.photo_url} taille={32} accent={C} />
                                        <div>
                                          <div style={{ fontWeight:800,color:"#0f172a",whiteSpace:"nowrap" }}>{g.nom}</div>
                                          {horaires.length>0 && (
                                            <div style={{ display:"flex",gap:3,flexWrap:"wrap",marginTop:2 }}>
                                              {horaires.slice(0,2).map((h,j)=>(
                                                <span key={j} style={{ fontSize:9,padding:"1px 6px",borderRadius:4,background:C_LIGHT,color:C,fontWeight:600 }}>{fmtHoraire(h)}</span>
                                              ))}
                                              {horaires.length>2&&<span style={{ fontSize:9,color:"#9ca3af" }}>+{horaires.length-2}</span>}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </td>

                                    {/* Filière / Niveau */}
                                    <td style={{ padding:"10px 14px" }}>
                                      <div style={{ fontSize:11,color:"#374151",fontWeight:600 }}>{g.filiere||"-"}</div>
                                      {g.niveau && <span style={{ fontSize:10,fontWeight:800,padding:"1px 8px",borderRadius:99,color:"#fff",background:NIVEAUX_COLORS[g.niveau]||"#6b7280",marginTop:2,display:"inline-block" }}>{g.niveau}</span>}
                                    </td>

                                    {/* Coach */}
                                    <td style={{ padding:"10px 14px",whiteSpace:"nowrap" }}>
                                      <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                                        {coachObj?.photo_url
                                          ? <img src={coachObj.photo_url} alt={coachNom} style={{ width:22,height:22,borderRadius:"50%",objectFit:"cover",flexShrink:0 }} />
                                          : coachObj
                                            ? <div style={{ width:22,height:22,borderRadius:"50%",background:"#ede9fe",color:"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,flexShrink:0 }}>{((coachObj.prenom?.[0]||"")+(coachObj.nom?.[0]||"")).toUpperCase()||"CO"}</div>
                                            : <span style={{ fontSize:12 }}>👤</span>
                                        }
                                        <span style={{ fontSize:11,fontWeight:600,color:"#7c3aed" }}>{coachNom}</span>
                                      </div>
                                    </td>

                                    {/* Type */}
                                    <td style={{ padding:"10px 14px",whiteSpace:"nowrap",fontSize:11,color:"#374151",fontWeight:600 }}>
                                      {estPriveRow && <span style={{ display:"block",fontSize:9,fontWeight:800,color:"#9333ea",marginBottom:2 }}>🔒 COACHING PRIVÉ</span>}
                                      {g.type_cours==="hybride"?"⚡ Hybride":g.type_cours==="en_ligne"||g.type_cours==="prive"?"💻 En ligne":g.type_cours==="domicile"?"🏠 Domicile":g.type_cours==="centre"?"🏢 Centre":"-"}
                                    </td>

                                    {/* Apprenants - un ratio "X / 20" n'a pas de sens pour un binôme
                                        coach-apprenant à capacité 1 : on affiche l'occupation à la place. */}
                                    <td style={{ padding:"10px 14px",textAlign:"center" }}>
                                      {estPriveRow ? (
                                        <span style={{ fontSize:11,fontWeight:700,color:nbApp>0?"#16a34a":"#9ca3af" }}>{nbApp>0?"👤 Occupé":"- Vacant"}</span>
                                      ) : (
                                        <>
                                          <span style={{ fontWeight:800,color:C,fontSize:13 }}>{nbApp}</span>
                                          <span style={{ color:"#9ca3af",fontSize:11 }}> / {cap}</span>
                                        </>
                                      )}
                                    </td>

                                    {/* Remplissage barre - non pertinente en 1:1, remplacée par le nom
                                        de l'unique apprenant assigné. */}
                                    <td style={{ padding:"10px 14px",minWidth:100 }}>
                                      {estPriveRow ? (
                                        <span style={{ fontSize:11,color:"#374151" }}>{g.nom?.replace(/^Coaching privé\s*-\s*/i,"") || "-"}</span>
                                      ) : (
                                      <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                                        <div style={{ flex:1,height:6,background:"#f1f5f9",borderRadius:99,overflow:"hidden" }}>
                                          <div style={{ height:"100%",width:`${pct}%`,background:pct>=100?"#dc2626":pct>=80?"#d97706":C,borderRadius:99,transition:"width 0.3s" }}/>
                                        </div>
                                        <span style={{ fontSize:10,fontWeight:700,color:pct>=100?"#dc2626":pct>=80?"#d97706":"#16a34a",whiteSpace:"nowrap" }}>{pct}%</span>
                                      </div>
                                      )}
                                    </td>

                                    {/* Date début */}
                                    <td style={{ padding:"10px 14px",whiteSpace:"nowrap",fontSize:11,color:"#6b7280" }}>
                                      {g.date_debut?new Date(g.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"-"}
                                    </td>

                                    {/* Statut */}
                                    <td style={{ padding:"10px 14px" }}>
                                      <span style={{ padding:"3px 10px",borderRadius:99,fontSize:10,fontWeight:700,color:isActif?"#166534":"#6b7280",background:isActif?"#dcfce7":"#f1f5f9",whiteSpace:"nowrap" }}>
                                        {isActif?"Actif":"Inactif"}
                                      </span>
                                    </td>

                                    {/* Ouvrir */}
                                    <td style={{ padding:"10px 14px" }}>
                                      <span style={{ fontSize:11,color:C,fontWeight:700,whiteSpace:"nowrap" }}>Ouvrir →</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {!groupesLoading && groupesFiltres.length>0 && <Pagination page={pageGroupes} setPage={setPageGroupes} total={groupesFiltres.length} />}
                    </>
                  );
                })()}
              </div>

              {/* ── Modal détail groupe ── */}
              {selectedGroupe && (
                <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:12 }}
                  onClick={()=>{ setSelectedGroupe(null); setGroupeDetail({apprenants:[],fichiers:[]}); }}>
                  <div style={{ background:"#fff",borderRadius:18,width:"90vw",height:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,0.35)",overflow:"hidden" }}
                    onClick={e=>e.stopPropagation()}>

                    {/* En-tête modal */}
                    <div style={{ background:C_GRAD,padding:"18px 24px",color:"#fff",flexShrink:0,display:"flex",gap:16,alignItems:"flex-start" }}>
                      {/* LA PHOTO DU GROUPE, modifiable d'ici. L'onboarding crée la classe :
                          elle doit pouvoir corriger l'image en consultant la fiche, sans
                          rouvrir le formulaire. L'enregistrement est immédiat - cette modale
                          n'a pas de bouton « Enregistrer ». */}
                      <PhotoClasseEntete
                        groupe={selectedGroupe}
                        modifiable={peut("classes","update")}
                        authHeaders={authHeaders}
                        onChange={url => {
                          setSelectedGroupe(g => g ? { ...g, photo_url: url } : g);
                          setGroupes(prev => prev.map(g => g.id === selectedGroupe.id ? { ...g, photo_url: url } : g));
                        }} />
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:10,color:"#c4b5fd",fontWeight:700,letterSpacing:"0.08em",marginBottom:3 }}>GROUPE</div>
                        <div style={{ fontSize:19,fontWeight:900,marginBottom:5 }}>{selectedGroupe.nom}</div>
                        <div style={{ fontSize:12,color:"#c4b5fd",display:"flex",gap:14,flexWrap:"wrap" }}>
                          {selectedGroupe.niveau && <span>📊 {selectedGroupe.niveau}</span>}
                          {selectedGroupe.filiere && <span>🎓 {selectedGroupe.filiere}</span>}
                          {(()=>{ const c=coaches.find(x=>x.id===selectedGroupe.coach_id); const n=c?`${c.prenom||""} ${c.nom||""}`.trim():(selectedGroupe.coach_nom||null); return n?<span style={{ fontWeight:700,color:"#e9d5ff" }}>👤 {n}</span>:null; })()}
                          <span>🧑‍🎓 {groupeDetail.apprenants.filter(a=>a.statut!=="retire").length} apprenant{groupeDetail.apprenants.filter(a=>a.statut!=="retire").length!==1?"s":""}</span>
                          {selectedGroupe.date_debut && <span>📅 Début : {new Date(selectedGroupe.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</span>}
                          <span>{selectedGroupe.type_cours==="hybride"?"⚡ Hybride":selectedGroupe.type_cours==="prive"?"🔒 Privé":selectedGroupe.type_cours==="en_ligne"?"💻 En ligne":selectedGroupe.type_cours==="domicile"?"🏠 Domicile":"🏢 Centre"}</span>
                          <span style={{ padding:"1px 8px",borderRadius:99,background:selectedGroupe.statut==="actif"?"rgba(34,197,94,0.3)":"rgba(148,163,184,0.3)",fontSize:10,fontWeight:700 }}>{selectedGroupe.statut==="actif"?"Actif":selectedGroupe.statut==="cloture"?"🔒 Clôturée":"Inactif"}</span>
                        </div>
                        {(() => {
                          const hs = Array.isArray(selectedGroupe.horaire)?selectedGroupe.horaire:(typeof selectedGroupe.horaire==="string"?(()=>{try{return JSON.parse(selectedGroupe.horaire);}catch{return[];}})():[]);
                          return hs.length>0 ? (
                            <div style={{ marginTop:8,display:"flex",gap:5,flexWrap:"wrap" }}>
                              {hs.map((h,i)=><span key={i} style={{ padding:"2px 9px",borderRadius:7,background:"rgba(255,255,255,0.18)",fontSize:11,fontWeight:600 }}>{fmtHoraire(h)}</span>)}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div style={{ display:"flex",gap:8,flexShrink:0,marginTop:2 }}>
                        <button disabled={!peut("classes","update")} title={permBtnTitle("Modifier",peut("classes","update"))} onClick={()=>{
                          const hs = Array.isArray(selectedGroupe.horaire)?selectedGroupe.horaire:(typeof selectedGroupe.horaire==="string"?(()=>{try{return JSON.parse(selectedGroupe.horaire);}catch{return[];}})():[]);
                          setGroupeForm({ nom:selectedGroupe.nom||"", niveau:selectedGroupe.niveau||"", filiere:selectedGroupe.filiere||"", type_cours:selectedGroupe.type_cours||"en_ligne", coach_id:selectedGroupe.coach_id||"", date_debut:selectedGroupe.date_debut?selectedGroupe.date_debut.slice(0,10):"", date_fin:selectedGroupe.date_fin?selectedGroupe.date_fin.slice(0,10):"", capacite_max:selectedGroupe.capacite_max||20, horaire:hs, photo_url:selectedGroupe.photo_url||null });
                          setShowEditGroupe(true);
                        }} style={permBtnStyle({ padding:"7px 14px",background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",color:"#fff",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:12 },peut("classes","update"))}>
                          {peut("classes","update")?"✏️":"🔒"} Modifier
                        </button>
                        <button onClick={()=>{ setSelectedGroupe(null); setGroupeDetail({apprenants:[],fichiers:[]}); }}
                          style={{ background:"rgba(255,255,255,0.18)",border:"none",color:"#fff",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Onglets */}
                    <div style={{ display:"flex",gap:0,background:"#fafafa",borderBottom:"1px solid #e5e7eb",flexShrink:0,overflowX:"auto" }}>
                      {[
                        { k:"infos",      l:"Infos",            icon:"ℹ️" },
                        { k:"apprenants", l:`Apprenants (${groupeDetail.apprenants.filter(a=>a.statut!=="retire").length})`, icon:"👤" },
                        { k:"sessions",   l:"Sessions",        icon:"🗓" },
                        { k:"presences",  l:"Présences",        icon:"✅" },
                        { k:"historique", l:"Historique",       icon:"🕓" },
                      ].map(t=>(
                        <button key={t.k} onClick={()=>setObGroupeSubTab(t.k)}
                          style={{ padding:"12px 18px",border:"none",borderBottom:obGroupeSubTab===t.k?`3px solid ${C}`:"3px solid transparent",fontSize:12,fontWeight:600,cursor:"pointer",background:"transparent",color:obGroupeSubTab===t.k?C:"#64748b",whiteSpace:"nowrap",flexShrink:0 }}>
                          {t.icon} {t.l}
                        </button>
                      ))}
                    </div>

                    {/* Corps scrollable */}
                    <div style={{ flex:1,overflowY:"auto",padding:"20px 24px" }}>

                      {/* Infos */}
                      {obGroupeSubTab==="infos" && (() => {
                        const NIVEAUX_LABELS_INFOS = { A1:"Débutant",A2:"Élémentaire",B1:"Intermédiaire",B2:"Interm. Supérieur",C1:"Avancé",C2:"Maîtrise" };
                        const c = coaches.find(x=>x.id===selectedGroupe.coach_id);
                        const coachNomInfos = c ? `${c.prenom||""} ${c.nom||""}`.trim() : (selectedGroupe.coach_nom||"-");
                        const hs = Array.isArray(selectedGroupe.horaire)?selectedGroupe.horaire:(typeof selectedGroupe.horaire==="string"?(()=>{try{return JSON.parse(selectedGroupe.horaire);}catch{return[];}})():[]);
                        const nbActifs = groupeDetail.apprenants.filter(a=>a.statut!=="retire").length;
                        const estPriveInfos = estClassePrivee(selectedGroupe);
                        return (
                          <div style={{ display:"grid",gap:16 }}>

                            {estPriveInfos && (
                              <div style={{ background:C_GRAD,borderRadius:12,padding:"14px 18px",color:"#fff",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8 }}>
                                🔒 Coaching privé - binôme coach / apprenant en 1:1, distinct d'une classe de groupe
                              </div>
                            )}

                            {/* Identification */}
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:C,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>🏷️ Identification</div>
                              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>{estPriveInfos ? "Nom de l'apprenant" : "Nom du groupe"}</div><div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>{estPriveInfos ? (selectedGroupe.nom?.replace(/^Coaching privé\s*-\s*/i,"") || "-") : (selectedGroupe.nom||"-")}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Statut</div><div style={{ fontSize:13,fontWeight:700,color:selectedGroupe.statut==="actif"?"#22c55e":"#6b7280" }}>{selectedGroupe.statut==="actif"?"Actif":selectedGroupe.statut==="cloture"?"🔒 Clôturée":selectedGroupe.statut||"-"}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Niveau</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.niveau||"-"} {NIVEAUX_LABELS_INFOS[selectedGroupe.niveau]?`- ${NIVEAUX_LABELS_INFOS[selectedGroupe.niveau]}`:""}</div></div>
                                {!estPriveInfos && <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Filière</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.filiere||"-"}</div></div>}
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Lieu de coaching</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.type_cours==="hybride"?"⚡ Hybride":selectedGroupe.type_cours==="en_ligne"||selectedGroupe.type_cours==="prive"?"💻 En ligne":selectedGroupe.type_cours==="domicile"?"🏠 Domicile":selectedGroupe.type_cours==="centre"?"🏢 Centre":selectedGroupe.type_cours||"-"}</div></div>
                                {!estPriveInfos && <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Centre</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.centre_id||"-"}</div></div>}
                              </div>
                            </div>

                            {/* Commerciale en charge du dossier - deduite des apprenants du
                                groupe. Sans elle, il fallait ouvrir la fiche de chaque
                                apprenant pour savoir qui le suit. */}
                            {(selectedGroupe.assistantes_commerciales || []).length > 0 && (
                              <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                <div style={{ fontSize:11,fontWeight:800,color:C,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>
                                  💼 Assistante{(selectedGroupe.assistantes_commerciales||[]).length>1?"s":""} en charge du dossier
                                </div>
                                <div style={{ display:"grid",gap:8 }}>
                                  {(selectedGroupe.assistantes_commerciales||[]).map((ac,idx)=>(
                                    <div key={ac.id||idx} style={{ display:"flex",alignItems:"center",gap:10,background:"#fff",
                                      borderRadius:8,border:"1px solid #e5e7eb",padding:"10px 12px" }}>
                                      {ac.photo_url ? (
                                        <img src={ac.photo_url} alt="" style={{ width:34,height:34,borderRadius:"50%",objectFit:"cover",flexShrink:0 }} />
                                      ) : (
                                        <div style={{ width:34,height:34,borderRadius:"50%",background:"#0891b2",color:"#fff",flexShrink:0,
                                          display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800 }}>
                                          {(ac.nom||"?").split(" ").map(x=>x[0]).slice(0,2).join("")}
                                        </div>
                                      )}
                                      <div style={{ flex:1,minWidth:0 }}>
                                        <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>{ac.nom || "-"}</div>
                                        <div style={{ fontSize:11,color:"#64748b" }}>
                                          {ac.email && <span>✉ {ac.email}</span>}
                                          {ac.telephone && <span> · 📞 {ac.telephone}</span>}
                                          {!ac.email && !ac.telephone && <span>Coordonnées non renseignées</span>}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}


                            {/* Encadrement */}
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:C,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>👤 {estPriveInfos ? "Coach assigné" : "Encadrement & effectif"}</div>
                              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                                <div>
                                  <div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Coach</div>
                                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                                    {c?.photo_url
                                      ? <img src={c.photo_url} alt={coachNomInfos} style={{ width:28,height:28,borderRadius:"50%",objectFit:"cover",flexShrink:0 }} />
                                      : c
                                        ? <div style={{ width:28,height:28,borderRadius:"50%",background:"#ede9fe",color:"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0 }}>{((c.prenom?.[0]||"")+(c.nom?.[0]||"")).toUpperCase()||"CO"}</div>
                                        : null
                                    }
                                    <div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{coachNomInfos||"-"}</div>
                                  </div>
                                </div>
                                {estPriveInfos ? (
                                  <>
                                    <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Occupation</div><div style={{ fontSize:13,fontWeight:700,color:nbActifs>0?"#16a34a":"#9ca3af" }}>{nbActifs>0?"👤 Occupé":"- Vacant"}</div></div>
                                    {/* L'Onboarding ne gère que du en ligne ; la ligne ne s'affiche donc
                                        que si un coaching à domicile lui arrive un jour. */}
                                    {groupeDetail?.groupe?.lieu_coaching === "domicile" && (
                                      <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Adresse</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>🏠 {groupeDetail.groupe.adresse_coaching || "Non renseignée"}</div></div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Capacité max</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.capacite_max||"-"}</div></div>
                                    <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Apprenants actifs</div><div style={{ fontSize:13,fontWeight:700,color:C }}>{nbActifs}{selectedGroupe.capacite_max?` / ${selectedGroupe.capacite_max}`:""}</div></div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Planning */}
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:C,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>📅 Planning</div>
                              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:hs.length>0?12:0 }}>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Date de début</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.date_debut?new Date(selectedGroupe.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"-"}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Date de fin</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.date_fin?new Date(selectedGroupe.date_fin).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"-"}</div></div>
                              </div>
                              {hs.length>0 && (
                                <div>
                                  <div style={{ fontSize:10,color:"#9ca3af",marginBottom:6 }}>Créneaux hebdomadaires</div>
                                  <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                                    {hs.map((h,i)=><span key={i} style={{ padding:"4px 10px",borderRadius:8,background:C_LIGHT,color:C,fontSize:12,fontWeight:700 }}>{fmtHoraire(h)}</span>)}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Métadonnées */}
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:C,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>🗂️ Métadonnées</div>
                              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Créé par</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.created_by_nom||"-"}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Créé le</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe.created_at?new Date(selectedGroupe.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"-"}</div></div>
                                <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>ID groupe</div><div style={{ fontSize:11,fontWeight:500,color:"#9ca3af",fontFamily:"monospace" }}>{selectedGroupe.id}</div></div>
                              </div>
                            </div>

                          </div>
                        );
                      })()}

                      {/* Apprenants */}
                      {obGroupeSubTab==="apprenants" && (
                        <div style={{ background:"#fff",borderRadius:14,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid #e5e7eb",background:"#fafafa" }}>
                            <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>Apprenants ({groupeDetail.apprenants.length})</div>
                          </div>
                          {groupeDetail.apprenants.length===0 && (
                            <div style={{ textAlign:"center",padding:32,color:"#9ca3af",fontSize:12 }}>Aucun apprenant dans ce groupe</div>
                          )}
                          {groupeDetail.apprenants.map(a=>{
                            let noteObj = {};
                            try { noteObj = JSON.parse(a.note||"{}"); } catch {}
                            const estRetire = a.statut==="retire";
                            return (
                              <div key={a.id} onClick={()=>openApprenantDetail(a)}
                                style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderBottom:"1px solid #f1f5f9",gap:10,cursor:"pointer",transition:"background 0.1s", opacity:estRetire?0.6:1 }}
                                onMouseEnter={e=>e.currentTarget.style.background="#faf5ff"}
                                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                <div style={{ display:"flex",gap:10,alignItems:"center",minWidth:0,flex:1 }}>
                                  <div style={{ width:38,height:38,borderRadius:"50%",background:C_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:C,flexShrink:0,overflow:"hidden" }}>
                                    {a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : (a.prenom_apprenant||a.nom_apprenant||"?")[0].toUpperCase()}
                                  </div>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontSize:13,fontWeight:700,color:"#0f172a",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
                                      <span style={{ textDecoration:estRetire?"line-through":"none" }}>{a.prenom_apprenant} {a.nom_apprenant}</span>
                                      {(a.acces_bloque||estRetire) && <span style={{ fontSize:9,background:"#dc2626",color:"#fff",borderRadius:99,padding:"1px 7px",fontWeight:700 }}>🔒 SUSPENDU</span>}
                                    </div>
                                    <div style={{ fontSize:11,color:"#6b7280",display:"flex",gap:8,flexWrap:"wrap" }}>
                                      <span>{a.email_apprenant||"-"}</span>
                                      {a.niveau && <span style={{ padding:"1px 6px",borderRadius:99,background:C_LIGHT,color:C,fontWeight:700 }}>{a.niveau}</span>}
                                      <AncienNiveau niveau={a.niveau} precedent={a.niveau_precedent} changeLe={a.niveau_change_le} />
                                      {noteObj.programme && <span style={{ color:"#9ca3af" }}>· {noteObj.programme}</span>}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display:"flex",gap:6,alignItems:"center",flexShrink:0 }}>
                                  <span style={{ fontSize:10,color:C,fontWeight:600 }}>Voir le dossier →</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Sessions */}
                      {obGroupeSubTab==="sessions" && (() => {
                        // Ce tableau ne connaissait QUE le vocabulaire de l'ancienne table
                        // `groupes_cours` (dispense, catch_up, apprenant_absent…). Depuis que
                        // les séances viennent de la table unifiée `seances`, leur statut vaut
                        // « planifiee » ou « realisee » : aucun ne figurait ici, et la colonne
                        // Statut affichait donc « - » sur absolument toutes les lignes.
                        const STATUT_S = {
                          // Vocabulaire de la table `seances` (féminin - « une séance »).
                          planifiee:        { label:"Planifiée",     bg:"#e0f2fe", c:"#0369a1" },
                          en_cours:         { label:"🔴 En direct",  bg:"#fee2e2", c:"#b91c1c" },
                          realisee:         { label:"Réalisée",      bg:"#dcfce7", c:"#166534" },
                          terminee:         { label:"Réalisée",      bg:"#dcfce7", c:"#166534" },
                          annulee:          { label:"Annulée",       bg:"#fee2e2", c:"#991b1b" },
                          non_effectuee:    { label:"❌ Non effectuée", bg:"#fef2f2", c:"#b91c1c" },
                          // Vocabulaire hérité de `groupes_cours`, conservé : d'anciennes
                          // lignes peuvent encore le porter.
                          dispense:         { label:"Dispensé",      bg:"#dcfce7", c:"#166534" },
                          catch_up:         { label:"Rattrapé",      bg:"#dbeafe", c:"#1e40af" },
                          annule:           { label:"Annulé",        bg:"#fee2e2", c:"#991b1b" },
                          apprenant_absent: { label:"Appr. absent",  bg:"#fef3c7", c:"#92400e" },
                          coach_absent:     { label:"Coach absent",  bg:"#fee2e2", c:"#991b1b" },
                          holiday:          { label:"Congé/Férié",   bg:"#f3f4f6", c:"#6b7280" },
                        };
                        const today = new Date().toISOString().slice(0,10);
                        const FAITES  = ["realisee","terminee","dispense","catch_up"];
                        const CLOSES  = [...FAITES, "annulee", "annule", "coach_absent", "holiday"];
                        // Une séance passée jamais tenue n'est ni « à venir » ni « terminée » :
                        // c'est une séance manquée, et c'est elle qu'il faut reprogrammer.
                        // Limite assumée : une salle ouverte sans être clôturée reste
                        // « planifiee » côté `seances` et sera comptée ici comme non effectuée.
                        const estNonEffectuee = (x) => !CLOSES.includes(x.statut) && x.statut !== "en_cours" && (x.date_cours || "") < today;
                        const sessionsSorted = [...obSessions].sort((a,b) => b.date_cours.localeCompare(a.date_cours));
                        const moisDispo = [...new Set(sessionsSorted.map(s => s.date_cours?.slice(0,7)).filter(Boolean))];
                        const nomMoisOB = (ym) => { const [y,m]=ym.split("-"); return new Date(+y,+m-1,1).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}); };
                        const filtered = obSessionsMoisFiltre ? sessionsSorted.filter(s=>s.date_cours?.startsWith(obSessionsMoisFiltre)) : sessionsSorted;
                        const totalPagesS = Math.max(1, Math.ceil(filtered.length / OB_SESSIONS_PAR_PAGE));
                        const pageS = Math.min(obSessionsPage, totalPagesS);
                        const pageItems = filtered.slice((pageS-1)*OB_SESSIONS_PAR_PAGE, pageS*OB_SESSIONS_PAR_PAGE);
                        // Les compteurs se calculaient sur la SEULE date : une séance clôturée
                        // par le coach mais programmée la semaine prochaine comptait comme
                        // « à venir », et « Terminées » restait à 0 quoi qu'il arrive.
                        const nbActives   = obSessions.filter(x=>!CLOSES.includes(x.statut) && !estNonEffectuee(x)).length;
                        const nbTerminees = obSessions.filter(x=>FAITES.includes(x.statut)).length;
                        const nbManquees  = obSessions.filter(estNonEffectuee).length;

                        return (
                          <div>
                            {/* KPIs */}
                            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16 }}>
                              {[
                                { l:"Total sessions", v:obSessions.length, c:"#0f172a" },
                                { l:"À venir / En cours", v:nbActives, c:"#059669" },
                                { l:"Terminées", v:nbTerminees, c:"#6b7280" },
                                { l:"Non effectuées", v:nbManquees, c: nbManquees ? "#b91c1c" : "#6b7280" },
                              ].map(k=>(
                                <div key={k.l} style={{ background:"#fff",borderRadius:10,border:"1px solid #e5e7eb",padding:"12px 16px",textAlign:"center" }}>
                                  <div style={{ fontSize:10,color:"#9ca3af",fontWeight:600,marginBottom:4 }}>{k.l}</div>
                                  <div style={{ fontSize:18,fontWeight:800,color:k.c }}>{k.v}</div>
                                </div>
                              ))}
                            </div>

                            {/* Filtre mois */}
                            {moisDispo.length > 1 && (
                              <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,alignItems:"center" }}>
                                <span style={{ fontSize:11,fontWeight:700,color:"#64748b" }}>Mois :</span>
                                <button onClick={()=>{setObSessionsMoisFiltre("");setObSessionsPage(1);}}
                                  style={{ padding:"3px 10px",borderRadius:99,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,background:obSessionsMoisFiltre===""?C:"#e2e8f0",color:obSessionsMoisFiltre===""?"#fff":"#374151" }}>
                                  Tous ({obSessions.length})
                                </button>
                                {moisDispo.map(ym=>(
                                  <button key={ym} onClick={()=>{setObSessionsMoisFiltre(ym);setObSessionsPage(1);}}
                                    style={{ padding:"3px 10px",borderRadius:99,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,background:obSessionsMoisFiltre===ym?C:"#e2e8f0",color:obSessionsMoisFiltre===ym?"#fff":"#374151" }}>
                                    {nomMoisOB(ym)} ({sessionsSorted.filter(s=>s.date_cours?.startsWith(ym)).length})
                                  </button>
                                ))}
                              </div>
                            )}

                            {obSessionsLoading && <p style={{ textAlign:"center",color:"#9ca3af",padding:24 }}>Chargement…</p>}
                            {!obSessionsLoading && obSessions.length===0 && (
                              <div style={{ textAlign:"center",padding:32,color:"#9ca3af" }}>
                                <div style={{ fontSize:28,marginBottom:8 }}>🗓</div>
                                <div>Aucune session enregistrée pour ce groupe.</div>
                              </div>
                            )}
                            {!obSessionsLoading && filtered.length===0 && obSessions.length>0 && (
                              <p style={{ textAlign:"center",color:"#9ca3af",padding:20 }}>Aucune session ce mois-ci.</p>
                            )}
                            {!obSessionsLoading && pageItems.length>0 && (
                              <div style={{ borderRadius:10,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                                <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
                                  <thead>
                                    <tr style={{ background:"#f8fafc" }}>
                                      {/* Grammaire, Contenu et Commentaire retirés : ces trois
                                          colonnes venaient de l'ancienne table `groupes_cours`,
                                          que le coach ne remplit plus depuis le passage à
                                          `seances`. Elles affichaient « - » sur chaque ligne et
                                          repoussaient hors de vue ce qu'on vient lire ici :
                                          la date, le statut et l'objectif de la séance. */}
                                      {["Date","Statut","Objectif"].map((h,i)=>(
                                        <th key={i} style={{ padding:"9px 12px",textAlign:"left",fontWeight:700,color:"#374151",fontSize:11,borderBottom:"2px solid #e5e7eb",whiteSpace:"nowrap" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pageItems.map((s,idx)=>{
                                      // « À venir » ne peut pas se déduire de la date seule : une
                                      // séance déjà réalisée ou annulée n'est pas à venir, quelle
                                      // que soit la date à laquelle elle était programmée.
                                      const isFuture = s.date_cours >= today && !CLOSES.includes(s.statut) && s.statut !== "en_cours";
                                      const st = estNonEffectuee(s) ? STATUT_S.non_effectuee : STATUT_S[s.statut];
                                      return (
                                        <tr key={s.id} style={{ background:idx%2===0?"#fff":"#fafafa",borderBottom:"1px solid #f1f5f9" }}>
                                          <td style={{ padding:"9px 12px",fontWeight:600,whiteSpace:"nowrap" }}>
                                            {new Date(s.date_cours).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}
                                            {isFuture && <span style={{ marginLeft:6,fontSize:9,background:"#dbeafe",color:"#1e40af",borderRadius:99,padding:"1px 5px",fontWeight:700 }}>À venir</span>}
                                          </td>
                                          <td style={{ padding:"9px 12px" }}>
                                            {st ? <span style={{ padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:st.bg,color:st.c }}>{st.label}</span>
                                                 : <span style={{ fontSize:11,color:"#9ca3af" }}>-</span>}
                                          </td>
                                          <td style={{ padding:"9px 12px",color:"#374151" }}>{s.objectif||"-"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Pagination */}
                            {totalPagesS > 1 && (
                              <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:12 }}>
                                <button disabled={pageS===1} onClick={()=>setObSessionsPage(1)} style={{ padding:"4px 8px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",cursor:pageS===1?"default":"pointer",color:pageS===1?"#cbd5e1":"#374151",fontWeight:700,fontSize:12 }}>«</button>
                                <button disabled={pageS===1} onClick={()=>setObSessionsPage(p=>p-1)} style={{ padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",cursor:pageS===1?"default":"pointer",color:pageS===1?"#cbd5e1":"#374151",fontWeight:700,fontSize:12 }}>‹</button>
                                <span style={{ fontSize:12,color:"#64748b",fontWeight:600,padding:"0 8px" }}>Page {pageS} / {totalPagesS} - {filtered.length} session{filtered.length>1?"s":""}</span>
                                <button disabled={pageS===totalPagesS} onClick={()=>setObSessionsPage(p=>p+1)} style={{ padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",cursor:pageS===totalPagesS?"default":"pointer",color:pageS===totalPagesS?"#cbd5e1":"#374151",fontWeight:700,fontSize:12 }}>›</button>
                                <button disabled={pageS===totalPagesS} onClick={()=>setObSessionsPage(totalPagesS)} style={{ padding:"4px 8px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",cursor:pageS===totalPagesS?"default":"pointer",color:pageS===totalPagesS?"#cbd5e1":"#374151",fontWeight:700,fontSize:12 }}>»</button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Présences */}
                      {obGroupeSubTab==="presences" && (
                        <div>
                          {obPresencesLoading && <p style={{ textAlign:"center",color:"#9ca3af",padding:24 }}>Chargement des présences…</p>}
                          {!obPresencesLoading && obPresences.length===0 && (
                            <div style={{ textAlign:"center",padding:32,color:"#9ca3af" }}>
                              <div style={{ fontSize:28,marginBottom:8 }}>✅</div>
                              <div>Aucune présence enregistrée par le coach pour ce groupe.</div>
                            </div>
                          )}
                          {!obPresencesLoading && obPresences.length>0 && (() => {
                            const parDate = {};
                            obPresences.forEach(p=>{ if(!parDate[p.date_seance]) parDate[p.date_seance]=[]; parDate[p.date_seance].push(p); });
                            return Object.entries(parDate).sort(([a],[b])=>b.localeCompare(a)).map(([date,rows])=>{
                              const presents = rows.filter(r=>r.statut==="present").length;
                              const taux = rows.length ? Math.round(presents/rows.length*100) : 0;
                              return (
                                <div key={date} style={{ marginBottom:12,background:"#fff",borderRadius:10,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                                  <div style={{ padding:"10px 14px",background:"#f8fafc",borderBottom:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                                    <span style={{ fontWeight:700,fontSize:13,color:"#0f172a" }}>📅 {new Date(date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</span>
                                    <span style={{ fontSize:11,fontWeight:700,color:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626" }}>{presents}/{rows.length} - {taux}%</span>
                                  </div>
                                  <div style={{ padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:6 }}>
                                    {rows.map(r=>(
                                      <span key={r.id} style={{ padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600,
                                        background:r.statut==="present"?"#d1fae5":r.statut==="absent"?"#fee2e2":r.statut==="retard"?"#fef3c7":"#ede9fe",
                                        color:r.statut==="present"?"#065f46":r.statut==="absent"?"#991b1b":r.statut==="retard"?"#92400e":"#5b21b6" }}>
                                        {r.statut==="present"?"✅":r.statut==="absent"?"❌":r.statut==="retard"?"⏰":"📝"} {[r.prenom_apprenant,r.nom_apprenant].filter(Boolean).join(" ")}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}

                      {/* Historique - mouvements d'apprenants du groupe */}
                      {obGroupeSubTab==="historique" && (() => {
                        const fmt = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric" }) : "-";
                        return (
                          <div>
                            <div style={{ display:"flex",alignItems:"baseline",gap:10,marginBottom:16 }}>
                              <h4 style={{ margin:0,fontSize:14,fontWeight:800,color:"#0f172a" }}>🕓 Mouvements d'apprenants</h4>
                              <span style={{ fontSize:11,color:"#94a3b8" }}>
                                {obGroupeHistorique.length} mouvement{obGroupeHistorique.length>1?"s":""}
                              </span>
                            </div>

                            {obGroupeHistoriqueLoading ? (
                              <div style={{ textAlign:"center",padding:40,color:"#94a3b8",fontSize:13 }}>Chargement…</div>
                            ) : obGroupeHistorique.length===0 ? (
                              <div style={{ textAlign:"center",padding:48,color:"#94a3b8" }}>
                                <div style={{ fontSize:32,marginBottom:10 }}>🕓</div>
                                <div style={{ fontWeight:700,fontSize:13 }}>Aucun mouvement d'apprenant</div>
                                <div style={{ fontSize:12,marginTop:6 }}>
                                  Les arrivées et départs par transfert apparaîtront ici.
                                </div>
                              </div>
                            ) : (
                              <div style={{ display:"grid",gap:10 }}>
                                {obGroupeHistorique.map((m,i)=>{
                                  const entrant = m.type==="arrivee";
                                  const teinte  = entrant ? "#16a34a" : "#b45309";
                                  const fond    = entrant ? "#f0fdf4" : "#fffbeb";
                                  return (
                                    <div key={i} style={{ display:"flex",gap:12,alignItems:"flex-start",background:fond,
                                      border:`1px solid ${teinte}22`,borderLeft:`3px solid ${teinte}`,borderRadius:8,padding:"12px 14px" }}>
                                      <span style={{ fontSize:16,lineHeight:1.2 }}>{entrant?"↘":"↗"}</span>
                                      <div style={{ flex:1,minWidth:0 }}>
                                        <div style={{ display:"flex",flexWrap:"wrap",alignItems:"baseline",gap:8 }}>
                                          <span style={{ fontWeight:700,fontSize:13,color:"#0f172a" }}>{m.apprenant}</span>
                                          {m.niveau && (
                                            <span style={{ fontSize:10,fontWeight:700,color:teinte,background:"#fff",
                                              border:`1px solid ${teinte}44`,borderRadius:99,padding:"1px 7px" }}>{m.niveau}</span>
                                          )}
                                          <span style={{ fontSize:12,color:teinte,fontWeight:600 }}>
                                            {entrant?"a rejoint ce groupe":"a quitté ce groupe"}
                                          </span>
                                        </div>
                                        {m.classe_liee && (
                                          <div style={{ fontSize:12,color:"#475569",marginTop:3 }}>
                                            {entrant?"En provenance de":"Vers"} <strong>{m.classe_liee}</strong>
                                          </div>
                                        )}
                                        {m.motif && (
                                          <div style={{ fontSize:12,color:"#64748b",marginTop:3,fontStyle:"italic" }}>« {m.motif} »</div>
                                        )}
                                        <div style={{ fontSize:11,color:"#94a3b8",marginTop:4 }}>
                                          {fmt(m.date)}{m.par?` · par ${m.par}`:""}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}


                    </div>
                  </div>
                </div>
              )}

              {/* ── MODAL DÉTAIL APPRENANT ── */}
              {selectedApprenantGroupe && (() => {
                let noteObj = {};
                try { noteObj = JSON.parse(selectedApprenantGroupe.note||"{}"); } catch {}
                const NIVEAUX_LABELS = { A1:"Débutant",A2:"Élémentaire",B1:"Intermédiaire",B2:"Interm. Supérieur",C1:"Avancé",C2:"Maîtrise" };
                const NIVEAUX_COLORS = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
                const nvColor = NIVEAUX_COLORS[selectedApprenantGroupe.niveau] || "#6b7280";
                const _coachObj = coaches.find(c => c.id === (selectedApprenantGroupe?.coach_id || selectedGroupe?.coach_id));
                const coachNom = _coachObj
                  ? `${_coachObj.prenom||""} ${_coachObj.nom||""}`.trim()
                  : (selectedApprenantGroupe?.coach_nom || selectedGroupe?.coach_nom || "-");
                const initiales = ((selectedApprenantGroupe.prenom_apprenant?.[0]||"") + (selectedApprenantGroupe.nom_apprenant?.[0]||"")).toUpperCase() || "?";
                // Commercial from test
                const commercialNom = apprenantTest?.commercial_id ? (allStaff.find(s=>s.id===apprenantTest.commercial_id) ? `${allStaff.find(s=>s.id===apprenantTest.commercial_id).prenom||""} ${allStaff.find(s=>s.id===apprenantTest.commercial_id).nom||""}`.trim() : "-") : "-";
                // Taux présences
                const nbPresent = apprenantPresences.filter(p=>p.statut==="present").length;
                const tauxPres = apprenantPresences.length ? Math.round(nbPresent/apprenantPresences.length*100) : null;

                /* EXPORT PDF DE LA FICHE. Onboarding en avait un, accroché à un modal
                   qu'aucun bouton n'ouvrait plus : la fonction existait, le document
                   n'était jamais produit. Il vit maintenant sur la fiche réellement
                   utilisée, et sur le constructeur partagé (utils/fichePdfApprenant.js) -
                   la charte et le tableau des tests ne se réécrivent plus par service. */
                const ga = selectedApprenantGroupe;
                const exporterFichePDF = () => {
                  const nomComplet = [ga.prenom_apprenant, ga.nom_apprenant].filter(Boolean).join(" ");
                  exporterFicheApprenantPDF({
                    nom: nomComplet,
                    id: apprenantAssignation?.id || ga.id,
                    tests: {
                      apiUrl: API_URL, authHeaders,
                      assignationId: apprenantAssignation?.id || null,
                      gaId: ga.id || null,
                      email: ga.email_apprenant || null,
                    },
                    sections: [
                      { titre: "👤 Informations personnelles", lignes: [
                        ligneInfo("Nom complet", nomComplet),
                        ligneInfo("Email", ga.email_apprenant),
                        ligneInfo("Téléphone", ga.telephone || apprenantAssignation?.prospect_telephone),
                        ligneInfo("Profil", apprenantAssignation?.profil_type),
                      ]},
                      { titre: "🎓 Formation suivie", lignes: [
                        ligneInfo("Classe", selectedGroupe?.nom || ga.groupe_nom),
                        ligneInfo("Niveau", `${ga.niveau || "-"}${NIVEAUX_LABELS[ga.niveau] ? " - " + NIVEAUX_LABELS[ga.niveau] : ""}`),
                        // L'ancien niveau à côté du nouveau : c'est lui qui explique le
                        // changement de classe qu'on lit juste au-dessus.
                        ligneInfo("Niveau précédent", ga.niveau_precedent && ga.niveau_precedent !== ga.niveau ? ga.niveau_precedent : null),
                        ligneInfo("Coach", coachNom),
                        ligneInfo("Conseillère", commercialNom),
                        ligneInfo("Programme", noteObj.programme),
                        ligneInfo("Inscrit le", ga.date_ajout ? fmtDatePDF(ga.date_ajout) : null),
                        ligneInfo("Statut", { actif:"Actif", retire:"Retiré", archive:"Archivé", en_pause:"En pause" }[ga.statut] || ga.statut),
                      ]},
                    ],
                    kpis: apprenantPresences.length ? [{ titre: "📅 Assiduité", cartes: [
                      { valeur: apprenantPresences.length, libelle: "Séances" },
                      { valeur: nbPresent, libelle: "Présences" },
                      { valeur: apprenantPresences.length - nbPresent, libelle: "Absences" },
                      { valeur: tauxPres !== null ? `${tauxPres}%` : "-", libelle: "Taux de présence" },
                    ]}] : [],
                    tableaux: [
                      { titre: "📅 Détail des séances", entetes: ["Date","Statut"],
                        lignes: apprenantPresences.map(p => [
                          p.date_seance ? fmtDatePDF(p.date_seance) : "-",
                          p.statut === "present" ? "Présent" : p.statut === "absent" ? "Absent" : (p.statut || "-"),
                        ]) },
                      { titre: "💰 Versements reçus", entetes: ["Date","Mode","Montant","Statut"],
                        lignes: apprenantPmts.map(p => [
                          p.date_paiement ? fmtDatePDF(p.date_paiement) : "-",
                          p.mode_paiement || "-",
                          p.montant_recu != null ? `${Number(p.montant_recu).toLocaleString("fr-FR")} FCFA` : "-",
                          p.statut || "-",
                        ]) },
                    ],
                  }).catch(() => toast.error("Erreur lors de l'export PDF"));
                };

                return (
                  <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.75)",zIndex:1050,display:"flex",alignItems:"center",justifyContent:"center",padding:12 }}
                    onClick={()=>setSelectedApprenantGroupe(null)}>
                    <div style={{ background:"#fff",borderRadius:18,width:"90vw",height:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,0.4)",overflow:"hidden" }}
                      onClick={e=>e.stopPropagation()}>

                      {/* Header */}
                      <div style={{ background:C_GRAD,padding:"20px 24px",color:"#fff",flexShrink:0 }}>
                        <div style={{ display:"flex",gap:16,alignItems:"flex-start" }}>
                          <div style={{ width:54,height:54,borderRadius:"50%",background:"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,flexShrink:0,overflow:"hidden" }}>
                            {selectedApprenantGroupe.avatar_url ? <img src={selectedApprenantGroupe.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}
                          </div>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ fontSize:10,color:"#c4b5fd",fontWeight:700,letterSpacing:"0.08em",marginBottom:3 }}>DOSSIER APPRENANT</div>
                            <div style={{ fontSize:18,fontWeight:900,marginBottom:5 }}>{selectedApprenantGroupe.prenom_apprenant} {selectedApprenantGroupe.nom_apprenant}</div>
                            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                              {selectedApprenantGroupe.niveau && (
                                <span style={{ padding:"2px 10px",borderRadius:99,background:"rgba(255,255,255,0.2)",fontSize:11,fontWeight:700 }}>
                                  {selectedApprenantGroupe.niveau} - {NIVEAUX_LABELS[selectedApprenantGroupe.niveau]||""}
                                </span>
                              )}
                              {noteObj.programme && <span style={{ padding:"2px 10px",borderRadius:99,background:"rgba(255,255,255,0.15)",fontSize:11 }}>{noteObj.programme}</span>}
                              <span style={{ padding:"2px 10px",borderRadius:99,background:selectedApprenantGroupe.statut==="actif"?"rgba(34,197,94,0.3)":selectedApprenantGroupe.statut==="retire"?"rgba(239,68,68,0.3)":"rgba(148,163,184,0.3)",fontSize:11,fontWeight:700 }}>
                                {{ actif:"Actif", retire:"Retiré", archive:"Archivé (classe clôturée)", en_pause:"En pause" }[selectedApprenantGroupe.statut] || selectedApprenantGroupe.statut}
                              </span>
                            </div>
                          </div>
                          <div style={{ display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end",flexShrink:0 }}>
                            <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                              {/* DEMANDER UN TRANSFERT. L'onboarding est souvent le premier
                                  averti qu'une classe ne convient plus — l'assistante lui
                                  écrit, ou l'apprenant l'appelle — mais seul le coach pouvait
                                  ouvrir le dossier. Elle devait donc attendre que le coach le
                                  fasse, ou déplacer l'apprenant sans test de niveau.
                                  Réservé aux inscriptions ACTIVES : un apprenant retiré ou déjà
                                  transféré n'a plus de classe à quitter, et le serveur refuse. */}
                              {selectedApprenantGroupe.statut === "actif" && (
                                <BoutonDemandeTransfert
                                  gaId={selectedApprenantGroupe.id}
                                  nomApprenant={`${selectedApprenantGroupe.prenom_apprenant||""} ${selectedApprenantGroupe.nom_apprenant||""}`.trim() || "cet apprenant"}
                                  demandeur="onboarding"
                                  affecteElleMeme
                                  authHdrs={authHeaders}
                                  onEmise={() => toast("Suivez l'avancement dans « Dossiers à réaffecter ».", { icon: "🔄" })}
                                  styleBouton={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",
                                    background:"rgba(255,255,255,0.18)",color:"#fff",border:"none",borderRadius:7,
                                    cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap",fontFamily:"inherit" }} />
                              )}
                              {/* MIGRER DE CANAL, comme chez la commerciale. L'onboarding est
                                  le seul à pouvoir EXÉCUTER une migration vers le en ligne ;
                                  ne pas lui donner le bouton pour en OUVRIR une l'obligeait à
                                  attendre qu'une assistante le fasse, alors que l'apprenant
                                  l'appelle tout aussi souvent pour demander à passer en centre.
                                  Deux gestes distincts, volontairement côte à côte : le
                                  transfert interroge le NIVEAU et passe par un test, la
                                  migration change l'ENDROIT et n'en demande aucun.
                                  Coaching privé exclu, comme chez la commerciale. */}
                              {/* LA CONDITION NE REGARDE PAS LE DOSSIER COMMERCIAL, et c'est
                                  délibéré : `apprenantAssignation` n'est chargé QUE si l'on
                                  clique sur l'onglet « Paiements » ou « Test de niveau »
                                  (fetchApprenantAssignation, plus haut). Le tester ici faisait
                                  disparaître le bouton sur l'onglet d'accueil de la fiche —
                                  c'est-à-dire presque toujours.
                                  Tout ce dont la migration a besoin est là sans lui : le
                                  serveur retrouve le dossier seul, et le canal de départ se
                                  lit sur la CLASSE — ce qui est d'ailleurs ce que la demande
                                  enregistre réellement dans `type_cours`. */}
                              {(() => {
                                /* LE CANAL VIENT DU DOSSIER EN PREMIER. Une classe de coaching
                                   privé porte `type_cours = "prive"` : un type de coaching, pas
                                   un endroit. Le lire là donnerait toujours la même destination
                                   — on proposerait « migrer vers le en ligne » à quelqu'un qui y
                                   est déjà. Le dossier, lui, dit toujours `en_ligne` ou
                                   `presentiel`, y compris pour les 13 dossiers en privé.
                                   La classe ne sert que de repli, pour les écrans où le dossier
                                   n'a pas encore répondu. Le coaching privé n'est PAS exclu :
                                   l'apprenant garde sa formule, il change d'endroit. */
                                const cl = selectedGroupe || selectedApprenantGroupe.groupes || null;
                                const canal = [apprenantAssignation?.type_cours, cl?.type_cours,
                                               selectedApprenantGroupe.type_cours]
                                  .find(v => v === "en_ligne" || v === "presentiel" || v === "hybride") || null;
                                if (selectedApprenantGroupe.statut !== "actif") return null;
                                if (!canal) return null;
                                return (
                                <BoutonMigrationCanal
                                  gaId={selectedApprenantGroupe.id}
                                  nomApprenant={`${selectedApprenantGroupe.prenom_apprenant||""} ${selectedApprenantGroupe.nom_apprenant||""}`.trim() || "cet apprenant"}
                                  canalActuel={canal}
                                  authHdrs={authHeaders}
                                  onEmise={() => toast("Suivez l'avancement dans « Dossiers à réaffecter ».", { icon: "🔀" })}
                                  styleBouton={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",
                                    background:"rgba(255,255,255,0.18)",color:"#fff",border:"none",borderRadius:7,
                                    cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap",fontFamily:"inherit" }} />
                                );
                              })()}
                              <button onClick={exporterFichePDF}
                                style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:"rgba(255,255,255,0.18)",color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap" }}>
                                📄 Export PDF
                              </button>
                              <button onClick={()=>setSelectedApprenantGroupe(null)}
                                style={{ background:"rgba(255,255,255,0.18)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>
                                ✕
                              </button>
                            </div>
                            {/* Bouton créer accès */}
                            {selectedApprenantGroupe.apprenant_id ? (
                              <span style={{ padding:"4px 10px",borderRadius:99,background:"rgba(34,197,94,0.3)",fontSize:10,fontWeight:700,color:"#dcfce7",whiteSpace:"nowrap" }}>
                                ✅ Compte actif
                              </span>
                            ) : (
                              <button
                                onClick={()=>{ if (peut("inscriptions","update")) handleCreerAcces(selectedApprenantGroupe); }}
                                disabled={creerAccesLoading||!peut("inscriptions","update")}
                                title={permBtnTitle("Créer les accès",peut("inscriptions","update"))}
                                style={{ padding:"6px 12px",borderRadius:99,background:(creerAccesLoading||!peut("inscriptions","update"))?"rgba(255,255,255,0.15)":"rgba(255,41,69,0.85)",border:"none",color:"#fff",fontSize:11,fontWeight:700,cursor:(creerAccesLoading||!peut("inscriptions","update"))?"not-allowed":"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5 }}>
                                {creerAccesLoading
                                  ? <><span style={{ width:10,height:10,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",display:"inline-block",animation:"obSpin .7s linear infinite" }}/>Création…</>
                                  : !peut("inscriptions","update") ? "🔒 Créer les accès" : "🔑 Créer les accès"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Onglets */}
                      <div style={{ display:"flex",background:"#fafafa",borderBottom:"1px solid #e5e7eb",flexShrink:0 }}>
                        {[
                          { k:"profil",    l:"Profil & Formation",   icon:"👤" },
                          { k:"planning",  l:"Planning officiel",     icon:"📅" },
                          { k:"sessions",  l:"Sessions",              icon:"🗓️" },
                          { k:"test",      l:"Test de niveau",        icon:"📊" },
                          { k:"presences", l:`Présences${tauxPres!==null?` (${tauxPres}%)`:""}`, icon:"✅" },
                          { k:"paiements", l:"Paiements",             icon:"💳" },
                          { k:"notes",     l:"Notes",                 icon:"📝" },
                          { k:"historique",l:"Historique",            icon:"🕓" },
                        ].map(t=>(
                          <button key={t.k} onClick={()=>{
                            setApprenantTab(t.k);
                            // Même correction que pour Sessions ci-dessous : le garde-fou
                            // « length===0 » ne rechargeait qu'une fois. Une présence pointée
                            // par le coach pendant que la fiche est ouverte n'apparaissait
                            // jamais - et le taux affiché dans l'onglet restait celui du premier
                            // chargement, donc faux.
                            if (t.k==="presences") fetchApprenantPresences(selectedApprenantGroupe);
                            if (t.k==="paiements" || t.k==="test") fetchApprenantAssignation(selectedApprenantGroupe.email_apprenant, selectedApprenantGroupe.email_parent, selectedApprenantGroupe.assignation_id);
                            // Rechargé à CHAQUE ouverture de l'onglet, et non la première fois
                            // seulement. Le garde-fou « length===0 » figeait la liste : une
                            // séance clôturée par le coach pendant que la fiche est ouverte
                            // restait affichée « Planifiée » tant qu'on ne fermait pas la fiche.
                            // Un statut de séance change en cours de journée - c'est même tout
                            // l'intérêt de l'écran.
                            if (t.k==="sessions") fetchApprenantCours(selectedApprenantGroupe);
                            // Une note saisie par le coach doit apparaître au prochain clic sur
                            // l'onglet, pas à la prochaine réouverture de la fiche.
                            if (t.k==="notes" && selectedApprenantGroupe?.id) {
                              setApprenantEvalsLoading(true);
                              fetch(`${API_URL}/api/groupes/apprenants/${selectedApprenantGroupe.id}/evaluations`, { headers: authHeaders() })
                                .then(r => r.ok ? r.json() : { evaluations: [] })
                                .then(d => setApprenantEvals(d.evaluations || []))
                                .catch(() => {})
                                .finally(() => setApprenantEvalsLoading(false));
                            }
                            // Un historique est par nature ce qui s'allonge : le figer au premier
                            // chargement est le pire endroit où appliquer ce garde-fou.
                            if (t.k==="historique" && selectedApprenantGroupe?.id) {
                              setApprenantHistoriqueLoading(true);
                              fetch(`${API_URL}/api/groupes/apprenants/${selectedApprenantGroupe.id}/historique`, { headers: authHeaders() })
                                .then(r => r.ok ? r.json() : { historique: [] })
                                .then(d => setApprenantHistorique(d.historique || []))
                                .catch(() => {})
                                .finally(() => setApprenantHistoriqueLoading(false));
                            }
                          }}
                            style={{ padding:"11px 18px",border:"none",borderBottom:apprenantTab===t.k?`3px solid ${C}`:"3px solid transparent",fontSize:12,fontWeight:600,cursor:"pointer",background:"transparent",color:apprenantTab===t.k?C:"#64748b",whiteSpace:"nowrap" }}>
                            {t.icon} {t.l}
                          </button>
                        ))}
                      </div>

                      {/* Corps */}
                      <div style={{ flex:1,overflowY:"auto",padding:"20px 24px" }}>

                        {/* ── PROFIL ── */}
                        {apprenantTab==="profil" && (
                          <div style={{ display:"grid",gap:16 }}>

                            {/* Coordonnées */}
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:"#7c3aed",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>📬 Coordonnées</div>
                              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Email</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedApprenantGroupe.email_apprenant||"-"}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Téléphone</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{noteObj.telephone||selectedApprenantGroupe.telephone||"-"}</div></div>
                              </div>
                            </div>

                            {/* Parent / Tuteur - profil enfant uniquement. C'est le parent qui se
                                connecte réellement pour voir les données de son enfant : sans cette
                                carte, onboarding n'a aucune visibilité sur qui contacter/avec qui
                                les accès doivent être partagés. */}
                            {selectedApprenantGroupe.profil_type === "enfant" && selectedApprenantGroupe.nom_parent && (
                              <div style={{ background:"#fffbeb",borderRadius:12,padding:16,border:"1px solid #fde68a" }}>
                                <div style={{ fontSize:11,fontWeight:800,color:"#92400e",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>👨‍👩‍👧 Parent / Tuteur</div>
                                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                                  <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Nom</div><div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>{selectedApprenantGroupe.nom_parent}</div></div>
                                  {selectedApprenantGroupe.telephone_parent && <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Téléphone</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedApprenantGroupe.telephone_parent}</div></div>}
                                  {selectedApprenantGroupe.email_parent && <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Email</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedApprenantGroupe.email_parent}</div></div>}
                                </div>
                              </div>
                            )}

                            {/* Formation */}
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:"#7c3aed",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>🎓 Formation</div>
                              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                                <div>
                                  <div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Niveau</div>
                                  <div style={{ fontSize:13,fontWeight:700,color:nvColor }}>{selectedApprenantGroupe.niveau||"-"} {NIVEAUX_LABELS[selectedApprenantGroupe.niveau]?`- ${NIVEAUX_LABELS[selectedApprenantGroupe.niveau]}`:""}</div>
                                </div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Programme</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{noteObj.programme||"-"}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Groupe</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{selectedGroupe?.nom||"-"}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Coach</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{coachNom}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Début supposé</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{noteObj.date_debut?new Date(noteObj.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"-"}</div></div>
                                <div><div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Renouvellement</div><div style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>{noteObj.date_renouvellement?new Date(noteObj.date_renouvellement).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"-"}</div></div>
                              </div>
                            </div>

                            {/* Description / Attentes */}
                            {(noteObj.description||noteObj.attentes) && (
                              <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                <div style={{ fontSize:11,fontWeight:800,color:"#7c3aed",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>📝 Profil & Objectifs</div>
                                {noteObj.description && (
                                  <div style={{ marginBottom:10 }}>
                                    <div style={{ fontSize:11,color:"#9ca3af",marginBottom:4 }}>Description du profil</div>
                                    <div style={{ fontSize:13,color:"#374151",lineHeight:1.6 }}>{noteObj.description}</div>
                                  </div>
                                )}
                                {noteObj.attentes && (
                                  <div>
                                    <div style={{ fontSize:11,color:"#9ca3af",marginBottom:4 }}>Attentes / Objectifs</div>
                                    <div style={{ fontSize:13,color:"#374151",lineHeight:1.6 }}>{noteObj.attentes}</div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ── Accès & Connexion ── */}
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:"#7c3aed",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>🔑 Accès & Connexion</div>
                              {onbAccesLoad ? (
                                <div style={{ fontSize:12,color:"#9ca3af" }}>Vérification…</div>
                              ) : onbApprenantAcces?.has_account ? (
                                <div>
                                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                                    <span style={{ fontSize:15 }}>✅</span>
                                    <span style={{ fontWeight:700,color:"#065f46",fontSize:13 }}>Compte actif</span>
                                    {onbApprenantAcces.profil?.mdp_temporaire ? (
                                      <>
                                        <span style={{ padding:"2px 8px",background:"#fef3c7",color:"#92400e",borderRadius:99,fontSize:10,fontWeight:700 }}>Mot de passe temporaire</span>
                                        <button
                                          disabled={creerAccesLoading||!peut("inscriptions","update")}
                                          title={!peut("inscriptions","update") ? permBtnTitle("Renvoyer les accès",false) : "Régénère et renvoie un nouveau mot de passe temporaire - uniquement pour les comptes créés par le staff"}
                                          onClick={()=>{ if (peut("inscriptions","update")) handleCreerAcces(selectedApprenantGroupe); }}
                                          style={{ marginLeft:"auto", padding:"5px 12px", borderRadius:8, border:"1px solid #86efac", background:(creerAccesLoading||!peut("inscriptions","update"))?"#f1f5f9":"#fff", color:(creerAccesLoading||!peut("inscriptions","update"))?"#9ca3af":"#15803d", fontSize:11, fontWeight:700, cursor:(creerAccesLoading||!peut("inscriptions","update"))?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
                                          {!peut("inscriptions","update") ? "🔒 Renvoyer les accès" : "📧 Renvoyer les accès"}
                                        </button>
                                      </>
                                    ) : (
                                      <span style={{ marginLeft:"auto", fontSize:11, color:"#9ca3af" }} title="Compte auto-inscrit avec son propre mot de passe - impossible et inutile de le renvoyer">🔒 Mot de passe personnel</span>
                                    )}
                                  </div>
                                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                                    <div style={{ background:"#fff",borderRadius:8,padding:"8px 10px",border:"1px solid #d1fae5" }}>
                                      <IdentifiantConnexion compact
                                        email={onbApprenantAcces.profil?.email || selectedApprenantGroupe.email_apprenant}
                                        telephone={onbApprenantAcces.profil?.telephone || selectedApprenantGroupe.telephone}
                                      />
                                      {/* L'identifiant se corrige APRÈS l'inscription : une
                                          adresse saisie de travers condamnait sinon
                                          l'apprenant à un compte inutilisable. */}
                                      {onbApprenantAcces.profil?.id && (
                                        <ModifierEmailApprenant
                                          apprenantId={onbApprenantAcces.profil.id}
                                          emailActuel={onbApprenantAcces.profil.email}
                                          nomApprenant={selectedApprenantGroupe?.nom_apprenant || ""}
                                          accent={C}
                                          onChange={(mail) => setOnbApprenantAcces(p => p ? { ...p, profil: { ...p.profil, email: mail } } : p)}
                                        />
                                      )}
                                    </div>
                                    {onbApprenantAcces.profil?.mdp_temporaire && onbApprenantAcces.profil?.mdp_initial ? (
                                      <div style={{ background:"#fffbeb",borderRadius:8,padding:"8px 10px",border:"1px solid #fde68a" }}>
                                        <div style={{ fontSize:9,color:"#92400e",marginBottom:2 }}>MOT DE PASSE TEMPORAIRE</div>
                                        <div style={{ fontSize:14,fontWeight:800,color:"#0f172a",fontFamily:"monospace",letterSpacing:"0.05em" }}>{onbApprenantAcces.profil.mdp_initial}</div>
                                      </div>
                                    ) : (
                                      <div style={{ background:"#f0fdf4",borderRadius:8,padding:"8px 10px",border:"1px solid #86efac" }}>
                                        <div style={{ fontSize:9,color:"#065f46",marginBottom:2 }}>MOT DE PASSE</div>
                                        <div style={{ fontSize:12,fontWeight:700,color:"#065f46" }}>✅ Changé par l'apprenant</div>
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ fontSize:11,color:"#6b7280",marginTop:8 }}>
                                    Compte créé le {onbApprenantAcces.profil?.date_creation ? new Date(onbApprenantAcces.profil.date_creation).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "-"}
                                  </div>
                                </div>
                              ) : selectedApprenantGroupe.email_apprenant ? (
                                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,background:"#fff7ed",borderRadius:10,padding:"12px 14px",border:"1px solid #fed7aa" }}>
                                  <div>
                                    <div style={{ fontWeight:700,color:"#92400e",fontSize:13,marginBottom:2 }}>⚠️ Aucun compte créé</div>
                                    <div style={{ fontSize:11,color:"#78350f" }}>Cet apprenant n'a pas encore d'accès à l'espace apprenant.</div>
                                  </div>
                                  <button
                                    onClick={()=>{ if (peut("inscriptions","update")) handleCreerAcces(selectedApprenantGroupe); }}
                                    disabled={creerAccesLoading||!peut("inscriptions","update")}
                                    title={permBtnTitle("Créer les accès",peut("inscriptions","update"))}
                                    style={{ padding:"7px 14px",background:peut("inscriptions","update")?"#f97316":"#e2e8f0",color:peut("inscriptions","update")?"#fff":"#94a3b8",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:peut("inscriptions","update")?"pointer":"not-allowed",whiteSpace:"nowrap",flexShrink:0 }}>
                                    {peut("inscriptions","update")?"🔑":"🔒"} Créer les accès
                                  </button>
                                </div>
                              ) : (
                                <div style={{ fontSize:12,color:"#9ca3af",fontStyle:"italic" }}>Aucun email - impossible de créer un compte.</div>
                              )}
                            </div>

                            {/* ── Accès Parent - c'est LUI qui se connecte réellement pour un
                                profil enfant, jamais mis en avant nulle part avant ce correctif. ── */}
                            {selectedApprenantGroupe.profil_type === "enfant" && selectedApprenantGroupe.email_parent && (
                              <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                <div style={{ fontSize:11,fontWeight:800,color:"#7c3aed",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>🔑 Accès Parent</div>
                                {onbParentAccesLoad ? (
                                  <div style={{ fontSize:12,color:"#9ca3af" }}>Vérification…</div>
                                ) : onbParentAcces?.existe ? (
                                  <div>
                                    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                                      <span style={{ fontSize:15 }}>✅</span>
                                      <span style={{ fontWeight:700,color:"#065f46",fontSize:13 }}>Compte parent actif</span>
                                    </div>
                                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                                      <div style={{ background:"#fff",borderRadius:8,padding:"8px 10px",border:"1px solid #d1fae5" }}>
                                        <div style={{ fontSize:9,color:"#9ca3af",marginBottom:2 }}>EMAIL DE CONNEXION</div>
                                        <div style={{ fontSize:12,fontWeight:700,color:"#0f172a",wordBreak:"break-all" }}>{onbParentAcces.login_email || selectedApprenantGroupe.email_parent}</div>
                                      </div>
                                      {onbParentAcces.mdp_initial && (
                                        <div style={{ background:"#fffbeb",borderRadius:8,padding:"8px 10px",border:"1px solid #fde68a" }}>
                                          <div style={{ fontSize:9,color:"#92400e",marginBottom:2 }}>MOT DE PASSE TEMPORAIRE</div>
                                          <div style={{ fontSize:14,fontWeight:800,color:"#0f172a",fontFamily:"monospace",letterSpacing:"0.05em" }}>{onbParentAcces.mdp_initial}</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,background:"#fff7ed",borderRadius:10,padding:"12px 14px",border:"1px solid #fed7aa" }}>
                                    <div>
                                      <div style={{ fontWeight:700,color:"#92400e",fontSize:13,marginBottom:2 }}>⚠️ Aucun compte parent créé</div>
                                      <div style={{ fontSize:11,color:"#78350f" }}>Le parent n'a pas encore d'accès pour suivre son enfant.</div>
                                    </div>
                                    <button
                                      onClick={()=>{ if (peut("inscriptions","update")) handleCreerAccesParent(selectedApprenantGroupe); }}
                                      disabled={creerAccesParentLoading||!peut("inscriptions","update")}
                                      title={permBtnTitle("Créer l'accès parent",peut("inscriptions","update"))}
                                      style={{ padding:"7px 14px",background:peut("inscriptions","update")?"#f97316":"#e2e8f0",color:peut("inscriptions","update")?"#fff":"#94a3b8",border:"none",borderRadius:8,fontSize:11,fontWeight:700,cursor:peut("inscriptions","update")?"pointer":"not-allowed",whiteSpace:"nowrap",flexShrink:0 }}>
                                      {creerAccesParentLoading ? "⏳…" : !peut("inscriptions","update") ? "🔒 Créer l'accès parent" : "🔑 Créer l'accès parent"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Équipe assignée */}
                            <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:11,fontWeight:800,color:"#7c3aed",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>👥 Équipe assignée</div>
                              <div style={{ display:"grid",gap:10 }}>
                                <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#fff",borderRadius:8,border:"1px solid #ede9fe" }}>
                                  <div style={{ width:32,height:32,borderRadius:"50%",background:"#ede9fe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>🟣</div>
                                  <div>
                                    <div style={{ fontSize:10,color:"#9ca3af" }}>Assistante Onboarding (affectation)</div>
                                    <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>{selectedApprenantGroupe.assistante_nom||"-"}</div>
                                  </div>
                                </div>
                                {(() => {
                                  const ac = selectedApprenantGroupe.assistante_commerciale;
                                  return (
                                    <div style={{ display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"linear-gradient(135deg,#f0fdf4,#dcfce7)",borderRadius:8,border:"1.5px solid #86efac" }}>
                                      <div style={{ width:38,height:38,borderRadius:"50%",background:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,color:"#fff",flexShrink:0,overflow:"hidden" }}>
                                        {ac?.photo_url
                                          ? <img src={ac.photo_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{e.currentTarget.style.display="none";}} />
                                          : ac ? ((ac.prenom?.[0]||"")+(ac.nom?.[0]||"")).toUpperCase()||"💼" : "💼"
                                        }
                                      </div>
                                      <div style={{ flex:1,minWidth:0 }}>
                                        <div style={{ fontSize:10,color:"#16a34a",fontWeight:700 }}>Assistante Commerciale (prise en charge)</div>
                                        <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>{ac ? `${ac.prenom||""} ${ac.nom||""}`.trim() : "Non renseignée"}</div>
                                        {ac?.telephone && <div style={{ fontSize:11,color:"#0891b2",marginTop:1 }}>📞 {ac.telephone}</div>}
                                      </div>
                                    </div>
                                  );
                                })()}
                                {/* ATTRIBUER LE DOSSIER. Visible quand il n'a plus d'assistante — le cas d'une
                                    migration vers le en ligne, qui le laisse volontairement sans propriétaire.
                                    Tant que personne n'est choisi, aucune assistante en ligne ne voit ce dossier :
                                    c'est l'onboarding qui le lui confie, et lui seul. */}
                                {!selectedApprenantGroupe.assistante_commerciale && selectedApprenantGroupe.assignation_id && (
                                  <div style={{ padding:"12px 14px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10 }}>
                                    <div style={{ fontSize:11.5, fontWeight:800, color:"#92400e", marginBottom:6 }}>
                                      ⚠ Dossier sans assistante — à attribuer
                                    </div>
                                    <div style={{ fontSize:11.5, color:"#92400e", marginBottom:8, lineHeight:1.5 }}>
                                      Tant qu'il n'est pas confié, aucune assistante en ligne ne voit cet apprenant.
                                    </div>
                                    {/* UN BOUTON, PAS UNE LISTE DÉROULANTE. Le `<select>` natif
                                        attribuait au `onChange` : le choix ÉTAIT l'action, et un
                                        clic de travers confiait l'apprenant sans retour possible.
                                        Il n'affichait par ailleurs que quatorze noms nus, sans
                                        dire laquelle est déjà surchargée - de quoi donner tout
                                        à la première de la liste. */}
                                    <button onClick={() => setSelecteurAssistante({
                                      assignation_id: selectedApprenantGroupe.assignation_id,
                                      nom: `${selectedApprenantGroupe.prenom_apprenant||""} ${selectedApprenantGroupe.nom_apprenant||""}`.trim(),
                                      classe: selectedGroupe?.nom || null,
                                      niveau: selectedApprenantGroupe.niveau || null,
                                      canal: selectedGroupe?.type_cours || null,
                                    })}
                                      style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"none",
                                        background:"#d97706", color:"#fff", fontSize:12.5, fontWeight:700,
                                        fontFamily:"inherit", cursor:"pointer" }}>
                                      Confier à une assistante en ligne →
                                    </button>
                                  </div>
                                )}
                                <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#fff",borderRadius:8,border:"1px solid #d1fae5" }}>
                                  <div style={{ width:32,height:32,borderRadius:"50%",background:"#d1fae5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>🎓</div>
                                  <div>
                                    <div style={{ fontSize:10,color:"#9ca3af" }}>Coach</div>
                                    <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>{coachNom}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {/* LE CHANGEMENT DE GROUPE SE FAIT DEPUIS « Dossiers à réaffecter ».
                                Le bouton vivait ici, hors du circuit : on pouvait déplacer un apprenant
                                sans demande du coach ni test de niveau, donc sans savoir vers quelle
                                classe. Le transfert part désormais d'une demande, passe par le test, et
                                le niveau obtenu désigne la classe d'arrivée. */}

                          </div>
                        )}

                        {/* ── PLANNING OFFICIEL ── */}
                        {apprenantTab==="planning" && (() => {
                          const rawHoraire = selectedGroupe?.horaire;
                          const horaires = Array.isArray(rawHoraire) ? rawHoraire
                            : typeof rawHoraire === "string" ? (() => { try { return JSON.parse(rawHoraire); } catch { return []; } })()
                            : [];
                          const JOUR_ORDER = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
                          const sorted = [...horaires].sort((a,b) => JOUR_ORDER.indexOf(a.jour) - JOUR_ORDER.indexOf(b.jour));
                          return (
                            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                              {/* Bannière groupe */}
                              <div style={{ background:C_GRAD, borderRadius:14, padding:"18px 22px", color:"#fff" }}>
                                <div style={{ fontSize:10, color:"#c4b5fd", fontWeight:800, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Planning officiel validé</div>
                                <div style={{ fontSize:17, fontWeight:900, marginBottom:4 }}>{selectedGroupe?.nom || "-"}</div>
                                <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:12, color:"#ddd6fe" }}>
                                  {selectedGroupe?.niveau && <span>📊 {selectedGroupe.niveau}</span>}
                                  {selectedGroupe?.filiere && <span>🎓 {selectedGroupe.filiere}</span>}
                                  {selectedGroupe?.type_cours && <span>{selectedGroupe.type_cours === "hybride" ? "⚡ Hybride" : selectedGroupe.type_cours === "prive" ? "🔒 Privé" : selectedGroupe.type_cours === "en_ligne" ? "💻 En ligne" : selectedGroupe.type_cours === "domicile" ? "🏠 Domicile" : "🏢 Centre"}</span>}
                                  {selectedGroupe?.date_debut && <span>📅 Début : {new Date(selectedGroupe.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</span>}
                                </div>
                              </div>

                              {/* Créneaux */}
                              {sorted.length === 0 ? (
                                <div style={{ background:"#fffbeb", borderRadius:12, padding:"20px 18px", border:"1.5px solid #fde68a", textAlign:"center" }}>
                                  <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
                                  <div style={{ fontWeight:700, color:"#92400e", fontSize:14, marginBottom:4 }}>Aucun créneau défini</div>
                                  <p style={{ fontSize:12, color:"#78350f" }}>Le planning de ce groupe n'a pas encore été renseigné. Modifiez le groupe pour ajouter des créneaux.</p>
                                </div>
                              ) : (
                                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                  <div style={{ fontSize:11, fontWeight:800, color:"#7c3aed", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:2 }}>🗓️ Créneaux hebdomadaires</div>
                                  {sorted.map((h, i) => (
                                    <div key={i} style={{ display:"flex", alignItems:"center", gap:14, background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", border:"1.5px solid #c4b5fd", borderRadius:12, padding:"14px 18px" }}>
                                      <div style={{ width:48, height:48, borderRadius:12, background:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                        <span style={{ fontSize:13, fontWeight:900, color:"#fff" }}>{h.jour}</span>
                                      </div>
                                      <div style={{ flex:1 }}>
                                        <div style={{ fontSize:15, fontWeight:800, color:"#6d28d9" }}>
                                          {h.debut || "-"}{h.fin ? ` – ${h.fin}` : ""}
                                        </div>
                                        {h.debut && h.fin && (
                                          <div style={{ fontSize:11, color:"#7c3aed", marginTop:2 }}>
                                            {(() => {
                                              try {
                                                const [dh, dm] = h.debut.split(":").map(Number);
                                                const [fh, fm] = h.fin.split(":").map(Number);
                                                const dur = (fh * 60 + fm) - (dh * 60 + dm);
                                                return `Durée : ${Math.floor(dur/60)}h${dur%60 > 0 ? String(dur%60).padStart(2,"0") : ""}`;
                                              } catch { return ""; }
                                            })()}
                                          </div>
                                        )}
                                      </div>
                                      <span style={{ padding:"4px 12px", background:"#ede9fe", color:"#6d28d9", borderRadius:20, fontSize:11, fontWeight:700 }}>Récurrent</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Info readonly */}
                              <div style={{ padding:"10px 14px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, fontSize:12, color:"#1e40af" }}>
                                🔒 Ce planning est géré depuis la fiche groupe. Pour modifier les créneaux, éditez le groupe correspondant.
                              </div>
                            </div>
                          );
                        })()}

                        {/* ── SESSIONS ── */}
                        {apprenantTab==="sessions" && (() => {
                          const now = new Date();
                          const futureCours = apprenantCours.filter(c => c.date_cours && new Date(c.date_cours) >= now);
                          const pastCours   = apprenantCours.filter(c => c.date_cours && new Date(c.date_cours) <  now);
                          const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : "-";
                          const fmtHeure = (h) => h ? h.slice(0,5) : "-";
                          const statutCours = {
                            planifie:  { bg:"#e0f2fe", c:"#0369a1", l:"Planifiée" },
                            planifiee: { bg:"#e0f2fe", c:"#0369a1", l:"Planifiée" },
                            // « en_cours » et « realisee » n'étaient pas répertoriés : une séance
                            // en direct retombait sur le repli et s'affichait « Planifiée ».
                            en_cours:  { bg:"#fee2e2", c:"#b91c1c", l:"🔴 En direct" },
                            realisee:  { bg:"#d1fae5", c:"#065f46", l:"Effectuée" },
                            terminee:  { bg:"#d1fae5", c:"#065f46", l:"Effectuée" },
                            non_effectuee: { bg:"#fef2f2", c:"#b91c1c", l:"❌ Non effectuée" },
                            effectue:  { bg:"#d1fae5", c:"#065f46", l:"Effectuée" },
                            effectuee: { bg:"#d1fae5", c:"#065f46", l:"Effectuée" },
                            dispense:  { bg:"#d1fae5", c:"#065f46", l:"Dispensée" },
                            annule:    { bg:"#fee2e2", c:"#991b1b", l:"Annulée" },
                            annulee:   { bg:"#fee2e2", c:"#991b1b", l:"Annulée" },
                            reporte:   { bg:"#fef3c7", c:"#92400e", l:"Reportée" },
                            reportee:  { bg:"#fef3c7", c:"#92400e", l:"Reportée" },
                          };
                          return (
                            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                              {apprenantCoursLoading ? (
                                <p style={{ textAlign:"center", color:"#9ca3af", padding:40 }}>Chargement des sessions…</p>
                              ) : apprenantCours.length === 0 ? (
                                <div style={{ textAlign:"center", padding:"50px 20px", background:"#f8fafc", borderRadius:14, border:"1px solid #e5e7eb" }}>
                                  <div style={{ fontSize:42, marginBottom:10 }}>🗓️</div>
                                  <div style={{ fontWeight:700, color:"#0f172a", marginBottom:4 }}>Aucune session enregistrée</div>
                                  <p style={{ color:"#9ca3af", fontSize:13 }}>Les sessions de ce groupe apparaîtront ici au fur et à mesure de leur programmation.</p>
                                </div>
                              ) : (
                                <>
                                  {/* Stats rapides */}
                                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                                    {[
                                      { l:"Total", v:apprenantCours.length, c:"#0f172a", bg:"#f8fafc" },
                                      { l:"À venir", v:futureCours.length,  c:"#0369a1", bg:"#e0f2fe" },
                                      { l:"Passées", v:pastCours.length,    c:"#065f46", bg:"#d1fae5" },
                                    ].map(s=>(
                                      <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:"12px 10px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                                        <div style={{ fontSize:22, fontWeight:900, color:s.c }}>{s.v}</div>
                                        <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>{s.l}</div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Sessions à venir */}
                                  {futureCours.length > 0 && (
                                    <div>
                                      <div style={{ fontSize:11, fontWeight:800, color:"#0369a1", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>📅 Sessions à venir</div>
                                      <div style={{ borderRadius:12, border:"1px solid #e0f2fe", overflow:"hidden" }}>
                                        {futureCours.map((c, i) => {
                                          const sc = statutCours[c.statut] || { bg:"#f1f5f9", c:"#64748b", l:c.statut || "-" };
                                          return (
                                            <div key={c.id||i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:i%2===0?"#fff":"#f8fafc", borderBottom:i<futureCours.length-1?"1px solid #f1f5f9":"none" }}>
                                              <div>
                                                <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>📅 {fmtDate(c.date_cours)}</div>
                                                {(c.heure_debut||c.heure_fin) && (
                                                  <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                                                    🕐 {fmtHeure(c.heure_debut)}{c.heure_fin ? ` – ${fmtHeure(c.heure_fin)}` : ""}
                                                  </div>
                                                )}
                                                {c.titre && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{c.titre}</div>}
                                              </div>
                                              <span style={{ padding:"3px 10px", borderRadius:20, fontSize:10, fontWeight:700, background:sc.bg, color:sc.c, flexShrink:0 }}>{sc.l}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Sessions passées */}
                                  {pastCours.length > 0 && (
                                    <div>
                                      <div style={{ fontSize:11, fontWeight:800, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>⏳ Sessions passées ({pastCours.length})</div>
                                      <div style={{ borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                                        {pastCours.slice(0, 20).map((c, i) => {
                                          // Le repli sur « Effectuée » affirmait qu'un cours avait
                                          // eu lieu au seul motif que sa date était passée. Une
                                          // séance restée « planifiée » dont la salle n'a jamais
                                          // été ouverte n'a pas été donnée - c'est l'inverse qu'il
                                          // faut dire, et c'est ce que le coach doit reprogrammer.
                                          const jamaisOuverte = !c.demarree_at && ["planifie","planifiee"].includes(c.statut);
                                          const sc = jamaisOuverte
                                            ? statutCours.non_effectuee
                                            : (statutCours[c.statut] || { bg:"#f1f5f9", c:"#64748b", l:c.statut || "-" });
                                          const presence = apprenantPresences.find(p => p.date_seance === c.date_cours);
                                          const presConfig = {
                                            present: { bg:"#d1fae5", c:"#065f46", icon:"✅", l:"Présent" },
                                            absent:  { bg:"#fee2e2", c:"#991b1b", icon:"❌", l:"Absent" },
                                            retard:  { bg:"#fef3c7", c:"#92400e", icon:"⏰", l:"Retard" },
                                          };
                                          const ps = presence ? (presConfig[presence.statut] || presConfig.present) : null;
                                          return (
                                            <div key={c.id||i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 16px", background:i%2===0?"#fff":"#fafafa", borderBottom:i<Math.min(pastCours.length,20)-1?"1px solid #f1f5f9":"none" }}>
                                              <div>
                                                <div style={{ fontSize:12, fontWeight:600, color:"#374151" }}>📅 {fmtDate(c.date_cours)}</div>
                                                {(c.heure_debut||c.heure_fin) && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>🕐 {fmtHeure(c.heure_debut)}{c.heure_fin ? ` – ${fmtHeure(c.heure_fin)}` : ""}</div>}
                                                {/* Le temps réellement passé en salle, relevé par le chronomètre
                                                    du coach : jusqu'ici il n'arrivait jamais jusqu'ici, et une
                                                    séance « effectuée » ne disait pas si elle avait duré 90 min
                                                    ou 5. La liste est trop dense pour le bloc complet - une
                                                    ligne suffit à rendre l'écart visible. */}
                                                {(() => {
                                                  const reel = dureeReelleMin(c); if (reel == null) return null;
                                                  const prevu = dureePrevueMin(c);
                                                  const court = prevu && reel < prevu - 5;
                                                  return (
                                                    <div style={{ fontSize:11, marginTop:2, fontWeight:700, color: court ? "#b91c1c" : "#15803d" }}>
                                                      ⏱ {reel} min en salle{prevu ? ` (prévu ${prevu})` : ""}
                                                    </div>
                                                  );
                                                })()}
                                              </div>
                                              <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
                                                <span style={{ padding:"3px 9px", borderRadius:20, fontSize:10, fontWeight:700, background:sc.bg, color:sc.c }}>{sc.l}</span>
                                                {ps && <span style={{ padding:"3px 9px", borderRadius:20, fontSize:10, fontWeight:700, background:ps.bg, color:ps.c }}>{ps.icon} {ps.l}</span>}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {pastCours.length > 20 && (
                                        <div style={{ fontSize:11, color:"#9ca3af", textAlign:"center", padding:"8px 0" }}>… et {pastCours.length - 20} session{pastCours.length-20>1?"s":""} plus anciennes</div>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {/* ── TEST DE NIVEAU ── */}
                        {apprenantTab==="test" && (
                          <div>
                            {/* TOUS SES PASSAGES, avant le détail du dernier. Cet onglet n'en
                                montrait qu'un : depuis qu'un transfert fait repasser le test,
                                l'ancien niveau disparaissait de l'écran au moment précis où il
                                devenait utile - c'est lui qui explique le changement de classe. */}
                            <div style={{ marginBottom:18 }}>
                              <HistoriqueTestsNiveau
                                apiUrl={API_URL}
                                authHeaders={authHeaders}
                                assignationId={apprenantAssignation?.id || null}
                                gaId={selectedApprenantGroupe?.id || null}
                                email={selectedApprenantGroupe?.email_apprenant || apprenantAssignation?.prospect_email || null}
                                mode="compact"
                                titre="🎓 Historique des tests"
                              />
                            </div>
                            {/* Bloc identité enfant */}
                            {(() => {
                              const ass = apprenantAssignation;
                              const sd  = ass?.suivi_demarrage || {};
                              const isEnfant = (selectedApprenantGroupe?.profil_type || ass?.profil_type) === "enfant";
                              if (!isEnfant) return null;
                              const prenomE = ass?.prenom_enfant || sd.prenom_enfant || "";
                              const nomE    = ass?.nom_enfant    || sd.nom_enfant    || "";
                              const ageE    = ass?.age_enfant    || sd.age_enfant    || "";
                              const classeE = ass?.niveau_classe_enfant || sd.niveau_classe_enfant || "";
                              const nomParent = ass?.nom_parent || sd.nom_parent || "";
                              const telParent = ass?.telephone_parent || sd.telephone_parent || "";
                              if (!prenomE && !nomE && !ageE && !classeE && !nomParent) return null;
                              return (
                                <div style={{ background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:12,padding:"14px 18px",marginBottom:14 }}>
                                  <div style={{ fontSize:11,fontWeight:800,color:"#1e40af",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10 }}>👶 Informations de l'enfant</div>
                                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px" }}>
                                    {(prenomE||nomE) && <div><div style={{ fontSize:10,color:"#6b7280",marginBottom:2 }}>Nom complet</div><div style={{ fontSize:13,fontWeight:700,color:"#1e3a8a" }}>{[prenomE,nomE].filter(Boolean).join(" ")}</div></div>}
                                    {ageE && <div><div style={{ fontSize:10,color:"#6b7280",marginBottom:2 }}>Âge</div><div style={{ fontSize:13,fontWeight:700,color:"#1e3a8a" }}>{ageE} ans</div></div>}
                                    {classeE && <div><div style={{ fontSize:10,color:"#6b7280",marginBottom:2 }}>Classe</div><div style={{ fontSize:13,fontWeight:700,color:"#1e3a8a" }}>{classeE}</div></div>}
                                    {nomParent && <div><div style={{ fontSize:10,color:"#6b7280",marginBottom:2 }}>Parent / Tuteur</div><div style={{ fontSize:13,fontWeight:600,color:"#374151" }}>{nomParent}{telParent ? ` - ${telParent}` : ""}</div></div>}
                                  </div>
                                </div>
                              );
                            })()}
                            {apprenantTestLoading && <p style={{ textAlign:"center",color:"#9ca3af",padding:40 }}>Chargement…</p>}
                            {!apprenantTestLoading && !apprenantTest && (() => {
                              const niveauManuel = apprenantAssignation?.niveau_client;
                              const CEFR_COLOR = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
                              if (niveauManuel) {
                                const c = CEFR_COLOR[niveauManuel] || "#6b7280";
                                return (
                                  <div style={{ display:"grid",gap:16 }}>
                                    <div style={{ background:`linear-gradient(135deg, ${c}dd, ${c}99)`,borderRadius:14,padding:"24px 28px",color:"#fff",display:"flex",gap:24,alignItems:"center",flexWrap:"wrap" }}>
                                      <div style={{ textAlign:"center",flexShrink:0 }}>
                                        <div style={{ fontSize:48,fontWeight:900,lineHeight:1 }}>{niveauManuel}</div>
                                        <div style={{ fontSize:12,color:"rgba(255,255,255,0.8)",marginTop:4 }}>{NIVEAUX_LABELS?.[niveauManuel]||"Niveau CECRL"}</div>
                                      </div>
                                      <div style={{ flex:1,minWidth:160 }}>
                                        <div style={{ fontSize:13,color:"rgba(255,255,255,0.8)",marginBottom:4 }}>Source</div>
                                        <div style={{ fontSize:16,fontWeight:700 }}>Niveau renseigné manuellement</div>
                                        <div style={{ fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4 }}>Aucun test automatique lié à cet email.</div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div style={{ textAlign:"center",padding:"60px 20px",background:"#f8fafc",borderRadius:14,border:"1px solid #e5e7eb" }}>
                                  <div style={{ fontSize:42,marginBottom:10 }}>📊</div>
                                  <div style={{ fontWeight:700,color:"#0f172a",marginBottom:4 }}>Aucun test de niveau enregistré</div>
                                  <p style={{ color:"#9ca3af",fontSize:13 }}>Le test de placement n'a pas encore été passé ou n'est pas lié à cet email.</p>
                                </div>
                              );
                            })()}
                            {!apprenantTestLoading && apprenantTest && (() => {
                              const CEFR_COLOR = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
                              const c = CEFR_COLOR[apprenantTest.level] || "#6b7280";
                              return (
                                <div style={{ display:"grid",gap:16 }}>
                                  {/* L'ÉVOLUTION AVANT LE SCORE. Le dernier test ne dit pas d'où
                                      vient l'apprenant ; c'est la suite qui explique un transfert. */}
                                  {/* `apprenantTests` arrive du plus récent au plus ancien ;
                                      une frise de progression se lit dans l'autre sens. */}
                                  <EvolutionNiveauTests tests={[...apprenantTests].reverse()} />

                                  {/* Score principal */}
                                  <div style={{ background:C_GRAD,borderRadius:14,padding:"24px 28px",color:"#fff",display:"flex",gap:24,alignItems:"center",flexWrap:"wrap" }}>
                                    <div style={{ textAlign:"center",flexShrink:0 }}>
                                      <div style={{ fontSize:48,fontWeight:900,lineHeight:1 }}>{apprenantTest.level||"-"}</div>
                                      <div style={{ fontSize:12,color:"#c4b5fd",marginTop:4 }}>{NIVEAUX_LABELS[apprenantTest.level]||"Niveau CECRL"}</div>
                                    </div>
                                    <div style={{ flex:1,minWidth:160 }}>
                                      <div style={{ fontSize:13,color:"#c4b5fd",marginBottom:4 }}>Score</div>
                                      <div style={{ fontSize:28,fontWeight:800 }}>{apprenantTest.score??apprenantTest.points_earned??0} pts</div>
                                      {apprenantTest.points_total && <div style={{ fontSize:12,color:"#c4b5fd" }}>sur {apprenantTest.points_total} · {apprenantTest.correct_answers||0}/{apprenantTest.total_questions||0} bonnes réponses</div>}
                                      {apprenantTest.submitted_at && <div style={{ fontSize:11,color:"#c4b5fd",marginTop:6 }}>📅 {new Date(apprenantTest.submitted_at).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}</div>}
                                    </div>
                                  </div>

                                  {/* Par catégorie */}
                                  {apprenantTest.by_category && Object.keys(apprenantTest.by_category).length>0 && (
                                    <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                      <div style={{ fontSize:11,fontWeight:800,color:C,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>Résultats par catégorie</div>
                                      <div style={{ display:"grid",gap:8 }}>
                                        {Object.entries(apprenantTest.by_category).map(([cat,val])=>{
                                          const total = val.total||val.max||10;
                                          const score = val.score??val.correct??0;
                                          const pct = Math.round((score/total)*100);
                                          return (
                                            <div key={cat}>
                                              <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3 }}>
                                                <span style={{ fontWeight:600,color:"#374151" }}>{cat}</span>
                                                <span style={{ color:pct>=70?c:"#dc2626",fontWeight:700 }}>{score}/{total} ({pct}%)</span>
                                              </div>
                                              <div style={{ height:6,background:"#e5e7eb",borderRadius:99,overflow:"hidden" }}>
                                                <div style={{ height:"100%",width:`${pct}%`,background:pct>=70?c:"#f87171",borderRadius:99 }}/>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Par CEFR */}
                                  {apprenantTest.by_cefr && Object.keys(apprenantTest.by_cefr).length>0 && (
                                    <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                      <div style={{ fontSize:11,fontWeight:800,color:C,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>Répartition CECRL</div>
                                      <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                                        {Object.entries(apprenantTest.by_cefr).map(([level,count])=>(
                                          <div key={level} style={{ padding:"6px 14px",borderRadius:8,background:CEFR_COLOR[level]+"18",border:`1px solid ${CEFR_COLOR[level]||"#e5e7eb"}30` }}>
                                            <div style={{ fontSize:14,fontWeight:800,color:CEFR_COLOR[level]||"#374151" }}>{level}</div>
                                            <div style={{ fontSize:11,color:"#6b7280" }}>{count} question{count>1?"s":""}</div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {apprenantTest.notes_oral && (
                                    <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                      <div style={{ fontSize:11,fontWeight:800,color:C,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8 }}>Notes de l'oral</div>
                                      <p style={{ color:"#374151",fontSize:13,lineHeight:1.6,margin:0 }}>{apprenantTest.notes_oral}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* ── PAIEMENTS ── */}
                        {apprenantTab==="paiements" && (
                          <div>
                            {apprenantAssLoading && <p style={{ textAlign:"center",color:"#9ca3af",padding:40 }}>Chargement…</p>}
                            {!apprenantAssLoading && !apprenantAssignation && (
                              <div style={{ textAlign:"center",padding:"60px 20px",background:"#f8fafc",borderRadius:14,border:"1px solid #e5e7eb" }}>
                                <div style={{ fontSize:42,marginBottom:10 }}>💳</div>
                                <div style={{ fontWeight:700,color:"#0f172a",marginBottom:4 }}>Aucune donnée de paiement</div>
                                <p style={{ color:"#9ca3af",fontSize:13 }}>Les informations de paiement apparaîtront ici après la finalisation de l'inscription.</p>
                              </div>
                            )}
                            {!apprenantAssLoading && apprenantAssignation && (() => {
                              const ass = apprenantAssignation;
                              const statutCfg = {
                                paye:        { bg:"#d1fae5", c:"#065f46", label:"Payé ✓" },
                                confirme:    { bg:"#d1fae5", c:"#065f46", label:"Payé ✓" },
                                partiel:     { bg:"#fef3c7", c:"#92400e", label:"Partiel" },
                                en_attente:  { bg:"#e0f2fe", c:"#0369a1", label:"En attente" },
                                impaye:      { bg:"#fee2e2", c:"#991b1b", label:"Impayé" },
                              };
                              const sc = statutCfg[ass.statut_paiement] || { bg:"#f1f5f9", c:"#64748b", label: ass.statut_paiement || "-" };

                              // plan_paiement est une colonne JSONB objet ({tranches, mois_paiements,
                              // acces_bloque}), déjà désérialisée par le client Supabase - ce n'est
                              // jamais une string à repasser dans JSON.parse (échouait silencieusement
                              // à chaque fois, le bloc "Plan de paiement" restant toujours vide).
                              const planPaiement = ass.plan_paiement || {};
                              let tranches = Array.isArray(planPaiement) ? planPaiement : (planPaiement.tranches || []);
                              if (!Array.isArray(tranches)) tranches = [];

                              return (
                                <div style={{ display:"grid",gap:16 }}>

                                  {/* Résumé */}
                                  <div style={{ background:C_GRAD,borderRadius:14,padding:"20px 24px",color:"#fff",display:"flex",gap:20,alignItems:"center",flexWrap:"wrap" }}>
                                    <div style={{ fontSize:36 }}>💳</div>
                                    <div style={{ flex:1,minWidth:160 }}>
                                      <div style={{ fontSize:11,color:"#a5b4fc",fontWeight:700,marginBottom:4 }}>STATUT PAIEMENT</div>
                                      <span style={{ display:"inline-block",padding:"4px 14px",borderRadius:20,background:sc.bg,color:sc.c,fontWeight:800,fontSize:13 }}>{sc.label}</span>
                                    </div>
                                    {ass.montant_paye != null && (
                                      <div style={{ textAlign:"right" }}>
                                        <div style={{ fontSize:11,color:"#a5b4fc",fontWeight:700 }}>MONTANT PAYÉ</div>
                                        <div style={{ fontSize:26,fontWeight:900 }}>{Number(ass.montant_paye).toLocaleString("fr-FR")} <span style={{ fontSize:14 }}>FCFA</span></div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Détails */}
                                  <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                    <div style={{ fontSize:11,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>📋 Détails</div>
                                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                                      <div>
                                        <div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Offre souscrite</div>
                                        <div style={{ fontSize:13,fontWeight:700,color: ass.inscription_offre?"#0f172a":"#94a3b8" }}>{ass.inscription_offre||"Non renseignée"}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Mode de paiement</div>
                                        <div style={{ fontSize:13,fontWeight:700,color: ass.mode_paiement?"#0f172a":"#94a3b8" }}>{ass.mode_paiement||"Non renseigné"}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Date de début de formation</div>
                                        <div style={{ fontSize:13,fontWeight:700,color: ass.date_debut_formation?"#0f172a":"#94a3b8" }}>
                                          {ass.date_debut_formation ? new Date(ass.date_debut_formation).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "Non renseignée"}
                                        </div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize:10,color:"#9ca3af",marginBottom:2 }}>Niveau</div>
                                        <div style={{ fontSize:13,fontWeight:700,color: ass.niveau_client?"#0f172a":"#94a3b8" }}>{ass.niveau_client||"Non renseigné"}</div>
                                      </div>
                                      {/* L'OBJECTIF sur toute la largeur : c'est une phrase, pas une
                                          étiquette, et l'onboarding s'en sert pour choisir la classe
                                          autant que le PA pour choisir le coach. */}
                                      <div style={{ gridColumn:"1/-1", background: ass.objectif_client ? "#f5f3ff" : "#fffbeb",
                                        border:`1px solid ${ass.objectif_client ? "#ddd6fe" : "#fde68a"}`, borderRadius:10, padding:"10px 12px" }}>
                                        <div style={{ fontSize:10, color: ass.objectif_client ? "#6d28d9" : "#92400e", fontWeight:700, marginBottom:3 }}>
                                          🎯 Objectif du client
                                        </div>
                                        <div style={{ fontSize:12.5, lineHeight:1.6, whiteSpace:"pre-wrap",
                                          color: ass.objectif_client ? "#0f172a" : "#92400e" }}>
                                          {ass.objectif_client || "Non renseigné"}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Versements réels */}
                                  {apprenantPmts.length > 0 && (
                                    <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                      <div style={{ fontSize:11,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>💰 Versements reçus ({apprenantPmts.length})</div>
                                      <div style={{ borderRadius:10,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                                        {apprenantPmts.map((p,i)=>{
                                          const statCfg = { reçu:{bg:"#d1fae5",c:"#065f46",l:"Reçu"}, recu:{bg:"#d1fae5",c:"#065f46",l:"Reçu"}, confirme:{bg:"#d1fae5",c:"#065f46",l:"Confirmé"}, en_attente:{bg:"#fef3c7",c:"#92400e",l:"En attente"}, annule:{bg:"#fee2e2",c:"#991b1b",l:"Annulé"} };
                                          const sc2 = statCfg[p.statut] || { bg:"#f1f5f9",c:"#64748b",l:p.statut||"-" };
                                          return (
                                            <div key={p.id||i} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:i%2===0?"#fff":"#fafafa",borderBottom:i<apprenantPmts.length-1?"1px solid #f1f5f9":"none" }}>
                                              <div>
                                                <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>{p.mode_paiement||"-"}</div>
                                                {p.date_paiement && <div style={{ fontSize:11,color:"#9ca3af",marginTop:1 }}>📅 Encaissé le {new Date(p.date_paiement).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>}
                                                {/* Sans cette ligne, la date d'encaissement se lit comme le mois facturé -
                                                    alors qu'un paiement échelonné solde un mois bien antérieur. */}
                                                {(()=>{ const lbl=libelleMoisSolde(p, ass?.plan_paiement); return lbl
                                                  ? <div style={{ fontSize:10.5,fontWeight:700,color:"#0369a1",background:"#e0f2fe",display:"inline-block",padding:"1px 8px",borderRadius:999,marginTop:3 }}>{lbl}</div>
                                                  : null; })()}
                                                {p.ref_transaction && <div style={{ fontSize:10,color:"#64748b",marginTop:1 }}>Réf: {p.ref_transaction}</div>}
                                              </div>
                                              <div style={{ textAlign:"right" }}>
                                                <div style={{ fontSize:14,fontWeight:800,color:"#0f172a" }}>{p.montant_recu!=null?Number(p.montant_recu).toLocaleString("fr-FR")+" FCFA":"-"}</div>
                                                <span style={{ display:"inline-block",marginTop:2,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:sc2.bg,color:sc2.c }}>{sc2.l}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Plan de paiement (tranches prévisionnelles) */}
                                  {tranches.length > 0 && (
                                    <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e5e7eb" }}>
                                      <div style={{ fontSize:11,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12 }}>🗓️ Plan de paiement ({tranches.length} tranche{tranches.length>1?"s":""})</div>
                                      <div style={{ borderRadius:10,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                                        {tranches.map((t,i)=>{
                                          const paid = t.statut==="paye"||t.statut==="payé"||t.paid||t.payee;
                                          return (
                                            <div key={i} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:i%2===0?"#fff":"#fafafa",borderBottom:i<tranches.length-1?"1px solid #f1f5f9":"none" }}>
                                              <div>
                                                <div style={{ fontSize:13,fontWeight:700,color:"#0f172a" }}>Tranche {i+1}</div>
                                                {(t.date||t.echeance) && <div style={{ fontSize:11,color:"#9ca3af",marginTop:1 }}>📅 {new Date(t.date||t.echeance).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>}
                                              </div>
                                              <div style={{ textAlign:"right" }}>
                                                <div style={{ fontSize:14,fontWeight:800,color:"#0f172a" }}>{t.montant!=null?Number(t.montant).toLocaleString("fr-FR")+" FCFA":"-"}</div>
                                                <span style={{ display:"inline-block",marginTop:2,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:paid?"#d1fae5":"#fef3c7",color:paid?"#065f46":"#92400e" }}>{paid?"Payé":"En attente"}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {apprenantPmts.length === 0 && tranches.length === 0 && (
                                    <div style={{ textAlign:"center",padding:"20px",background:"#fafafa",borderRadius:10,border:"1px solid #e5e7eb",fontSize:12,color:"#9ca3af" }}>
                                      Aucun versement ni plan de paiement enregistré.
                                    </div>
                                  )}

                                  <div style={{ padding:"10px 14px",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,fontSize:12,color:"#1e40af" }}>
                                    🔒 Ces informations sont en lecture seule. Pour toute modification, contacter l'assistante commerciale.
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* ── NOTES DE CLASSE (évaluées par le coach) ── */}
                        {apprenantTab==="notes" && (
                          <div>
                            {apprenantEvalsLoading ? (
                              <div style={{ textAlign:"center",padding:"32px 0",color:"#9ca3af",fontSize:13 }}>Chargement…</div>
                            ) : apprenantEvals.length === 0 ? (
                              <div style={{ textAlign:"center",padding:"60px 20px",background:"#f8fafc",borderRadius:14,border:"1px solid #e5e7eb" }}>
                                <div style={{ fontSize:42,marginBottom:10 }}>📝</div>
                                <div style={{ fontWeight:700,color:"#0f172a",marginBottom:4 }}>Aucune évaluation publiée</div>
                                <p style={{ color:"#9ca3af",fontSize:13 }}>Le coach publie et corrige les évaluations depuis son espace.</p>
                              </div>
                            ) : (
                              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                                {apprenantEvals.map(ev => {
                                  const r = ev.resultat || {};
                                  const ST = {
                                    a_faire: { label:"À faire",  bg:"#f1f5f9", c:"#64748b" },
                                    rendu:   { label:"Rendu",    bg:"#e0f2fe", c:"#0891b2" },
                                    corrige: { label:"Corrigé",  bg:"#dcfce7", c:"#16a34a" },
                                  };
                                  const st = ST[r.statut] || ST.a_faire;
                                  return (
                                    <div key={ev.id} style={{ display:"flex",alignItems:"flex-start",gap:12,padding:"12px 14px",borderRadius:10,border:"1px solid #e2e8f0",background:"#fff" }}>
                                      <div style={{ flex:1,minWidth:0 }}>
                                        <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                                          <span style={{ fontWeight:700,fontSize:13,color:"#0f172a" }}>{ev.titre || "Évaluation"}</span>
                                          <span style={{ fontSize:10,background:"#ede9fe",color:"#6d28d9",padding:"2px 8px",borderRadius:5,fontWeight:600 }}>{ev.type_evaluation || "devoir"}</span>
                                          <span style={{ fontSize:10,background:st.bg,color:st.c,padding:"2px 8px",borderRadius:5,fontWeight:700 }}>{st.label}</span>
                                        </div>
                                        <div style={{ fontSize:11,color:"#94a3b8",marginTop:3 }}>
                                          {ev.date_evaluation ? new Date(ev.date_evaluation).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "-"}
                                        </div>
                                        {r.commentaire_coach && (
                                          <div style={{ fontSize:12,color:"#6b7280",marginTop:6,fontStyle:"italic" }}>💬 {r.commentaire_coach}</div>
                                        )}
                                      </div>
                                      <div style={{ textAlign:"center",flexShrink:0 }}>
                                        <div style={{ fontSize:18,fontWeight:900,color: r.note!=null ? "#0f172a" : "#cbd5e1" }}>
                                          {r.note!=null ? r.note : "-"}<span style={{ fontSize:11,fontWeight:600,color:"#94a3b8" }}>/{r.note_max ?? ev.note_max ?? "-"}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── HISTORIQUE ── */}
                        {apprenantTab==="historique" && (
                          <div>
                            {apprenantHistoriqueLoading ? (
                              <div style={{ textAlign:"center",padding:"32px 0",color:"#9ca3af",fontSize:13 }}>Chargement…</div>
                            ) : apprenantHistorique.length === 0 ? (
                              <div style={{ textAlign:"center",padding:"60px 20px",background:"#f8fafc",borderRadius:14,border:"1px solid #e5e7eb" }}>
                                <div style={{ fontSize:42,marginBottom:10 }}>🕓</div>
                                <div style={{ fontWeight:700,color:"#0f172a",marginBottom:4 }}>Aucun historique</div>
                                <p style={{ color:"#9ca3af",fontSize:13 }}>Les changements de classe et autres événements apparaîtront ici.</p>
                              </div>
                            ) : (
                              <div style={{ display:"flex",flexDirection:"column",gap:0 }}>
                                {[...apprenantHistorique].reverse().map((h,i) => {
                                  const estActuel = h.statut === "actif" || h.statut === "periode_test";
                                  const typeLabel = h.type_cours==="en_ligne"?"💻 En ligne":h.type_cours==="hybride"?"⚡ Hybride":h.type_cours?"🏢 Présentiel":null;
                                  const ouvert = apprenantHistoriqueOuvert === h.id;
                                  return (
                                    <div key={h.id} style={{ display:"grid",gridTemplateColumns:"20px 1fr",gap:12 }}>
                                      <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                                        <div style={{ width:12,height:12,borderRadius:"50%",background:estActuel?"#16a34a":"#cbd5e1",marginTop:6,flexShrink:0 }} />
                                        {i < apprenantHistorique.length-1 && <div style={{ width:2,flex:1,background:"#e5e7eb",marginTop:2 }} />}
                                      </div>
                                      <div style={{ paddingBottom:18 }}>
                                        <div onClick={()=>setApprenantHistoriqueOuvert(ouvert?null:h.id)} style={{ cursor:"pointer" }}>
                                          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                                            <span style={{ fontWeight:800,fontSize:13,color:"#0f172a" }}>{h.groupe_nom}</span>
                                            {h.niveau && <span style={{ fontSize:10,fontWeight:800,padding:"1px 8px",borderRadius:99,background:"#1e3a8a",color:"#fff" }}>{h.niveau}</span>}
                                            {typeLabel && <span style={{ fontSize:10,fontWeight:600,color:"#64748b" }}>{typeLabel}</span>}
                                            <span style={{ fontSize:10,fontWeight:700,padding:"1px 8px",borderRadius:99,background:estActuel?"#dcfce7":"#f1f5f9",color:estActuel?"#166534":"#6b7280" }}>
                                              {estActuel ? "Classe actuelle" : "Transféré"}
                                            </span>
                                            <span style={{ fontSize:11,color:"#94a3b8",marginLeft:"auto" }}>{ouvert?"▲":"▼"}</span>
                                          </div>
                                          <div style={{ fontSize:11,color:"#94a3b8",marginTop:3 }}>
                                            {h.date_ajout ? new Date(h.date_ajout).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "-"}
                                            {h.date_retrait ? ` → ${new Date(h.date_retrait).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}` : estActuel ? " → aujourd'hui" : ""}
                                          </div>
                                          {h.motif && <div style={{ fontSize:12,color:"#6b7280",marginTop:4,fontStyle:"italic" }}>💬 {h.motif}</div>}
                                        </div>
                                        {ouvert && (
                                          <div style={{ marginTop:10,padding:"10px 12px",borderRadius:10,background:"#f8fafc",border:"1px solid #e2e8f0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                                            <div>
                                              <div style={{ fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>Coach</div>
                                              <div style={{ fontSize:12,fontWeight:600,color:"#0f172a" }}>{h.coach_nom || "Non assigné"}</div>
                                              {h.coach_telephone && <div style={{ fontSize:11,color:"#0891b2" }}>📞 {h.coach_telephone}</div>}
                                            </div>
                                            <div>
                                              <div style={{ fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>Assistante</div>
                                              <div style={{ fontSize:12,fontWeight:600,color:"#0f172a" }}>{h.assistante_nom || "-"}</div>
                                            </div>
                                            {h.centre_nom && (
                                              <div style={{ gridColumn:"1/-1" }}>
                                                <div style={{ fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>Centre</div>
                                                <div style={{ fontSize:12,fontWeight:600,color:"#0f172a" }}>📍 {h.centre_nom}{h.centre_ville?` · ${h.centre_ville}`:""}</div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── PRÉSENCES ── */}
                        {apprenantTab==="presences" && (
                          <div>
                            {apprenantPresLoading && <p style={{ textAlign:"center",color:"#9ca3af",padding:40 }}>Chargement…</p>}
                            {!apprenantPresLoading && apprenantPresences.length===0 && (
                              <div style={{ textAlign:"center",padding:"60px 20px",background:"#f8fafc",borderRadius:14,border:"1px solid #e5e7eb" }}>
                                <div style={{ fontSize:42,marginBottom:10 }}>✅</div>
                                <div style={{ fontWeight:700,color:"#0f172a",marginBottom:4 }}>Aucune présence enregistrée</div>
                                <p style={{ color:"#9ca3af",fontSize:13 }}>Les présences apparaîtront ici au fil des séances.</p>
                              </div>
                            )}
                            {!apprenantPresLoading && apprenantPresences.length>0 && (() => {
                              const presents = apprenantPresences.filter(p=>p.statut==="present").length;
                              const absents  = apprenantPresences.filter(p=>p.statut==="absent").length;
                              const retards  = apprenantPresences.filter(p=>p.statut==="retard").length;
                              const taux = Math.round(presents/apprenantPresences.length*100);
                              return (
                                <div style={{ display:"grid",gap:14 }}>
                                  {/* Stats */}
                                  <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
                                    {[
                                      { l:"Séances", v:apprenantPresences.length, c:"#0f172a" },
                                      { l:"Présent", v:presents, c:"#059669" },
                                      { l:"Absent", v:absents, c:"#dc2626" },
                                      { l:"Retard", v:retards, c:"#d97706" },
                                    ].map(s=>(
                                      <div key={s.l} style={{ background:"#f8fafc",borderRadius:10,padding:"12px",border:"1px solid #e5e7eb",textAlign:"center" }}>
                                        <div style={{ fontSize:20,fontWeight:900,color:s.c }}>{s.v}</div>
                                        <div style={{ fontSize:10,color:"#9ca3af",marginTop:2 }}>{s.l}</div>
                                      </div>
                                    ))}
                                  </div>
                                  {/* Barre taux */}
                                  <div style={{ background:"#f8fafc",borderRadius:10,padding:"12px 16px",border:"1px solid #e5e7eb" }}>
                                    <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6 }}>
                                      <span style={{ fontWeight:700,color:"#374151" }}>Taux de présence global</span>
                                      <span style={{ fontWeight:800,color:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626" }}>{taux}%</span>
                                    </div>
                                    <div style={{ height:8,background:"#e5e7eb",borderRadius:99,overflow:"hidden" }}>
                                      <div style={{ height:"100%",width:`${taux}%`,background:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626",borderRadius:99 }}/>
                                    </div>
                                  </div>
                                  {/* Liste séances */}
                                  <div style={{ borderRadius:12,border:"1px solid #e5e7eb",overflow:"hidden" }}>
                                    {apprenantPresences.sort((a,b)=>b.date_seance?.localeCompare(a.date_seance)).map((p,i)=>{
                                      const cfg = { present:{bg:"#d1fae5",c:"#065f46",icon:"✅",l:"Présent"}, absent:{bg:"#fee2e2",c:"#991b1b",icon:"❌",l:"Absent"}, retard:{bg:"#fef3c7",c:"#92400e",icon:"⏰",l:"Retard"} };
                                      const s = cfg[p.statut] || cfg.present;
                                      return (
                                        <div key={p.id||i} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:i%2===0?"#fff":"#fafafa",borderBottom:"1px solid #f1f5f9" }}>
                                          <span style={{ fontSize:13,fontWeight:600,color:"#0f172a" }}>📅 {p.date_seance?new Date(p.date_seance).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"}):"-"}</span>
                                          <span style={{ padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:s.bg,color:s.c }}>{s.icon} {s.l}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── MODAL TRANSFERT DE GROUPE ──
                  PLUS AUCUN BOUTON NE L'OUVRE. Son point d'entrée - « 🔄 Changer de groupe »
                  dans la fiche apprenant - a été retiré : le transfert part désormais d'une
                  demande du coach, passe par le test de niveau, et s'exécute depuis l'onglet
                  « Dossiers à réaffecter ». Le code est conservé le temps que le nouveau
                  circuit soit éprouvé en production ; il sera supprimé ensuite. */}
              {/* Le modal de transfert a été déplacé hors des onglets (voir plus bas, avec les
                  autres modaux) : enfermé ici, il n'existait que tant que l'onglet Groupes
                  était affiché, et le bouton de « Dossiers à réaffecter » n'ouvrait rien. */}

              {/* ── EDIT GROUPE MODAL ── */}
              {showEditGroupe && (
                <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
                  <div style={{ background:"#fff",borderRadius:16,width:"90vw",height:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.25)" }}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid #e5e7eb" }}>
                      <h3 style={{ margin:0,fontSize:15,fontWeight:800,color:"#0f172a" }}>✏️ Modifier le groupe</h3>
                      <button onClick={()=>setShowEditGroupe(false)} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#6b7280" }}>✕</button>
                    </div>
                    <div style={{ padding:"20px 24px" }}>
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
                        <div style={{ gridColumn:"1/-1" }}>
                          <label style={lbl}>Nom du groupe *</label>
                          <input style={inp} value={groupeForm.nom} onChange={e=>setGroupeForm(f=>({...f,nom:e.target.value}))} placeholder="ex: Groupe B2 Soir" />
                        </div>
                        <div style={{ gridColumn:"1/-1" }}>
                          {/* Photo - la même que celle du fil de discussion de la classe. */}
                          <ChampPhotoClasse
                            valeur={groupeForm.photo_url || null}
                            onChange={url => setGroupeForm(f => ({ ...f, photo_url: url }))}
                            nom={groupeForm.nom}
                            accent={_C0} />
                        </div>
                        <div>
                          <label style={lbl}>Niveau</label>
                          <select style={inp} value={groupeForm.niveau} onChange={e=>setGroupeForm(f=>({...f,niveau:e.target.value}))}>
                            <option value="">- Sélectionner -</option>
                            {["A1","A2","B1","B2","C1","C2"].map(n=><option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Filière</label>
                          {/* LE CATALOGUE, ET NON UNE LISTE ÉCRITE EN DUR.
                              Ce select proposait sept libellés figés — « Anglais Général »,
                              « Business », « TOEIC »… — dont aucun n'existe forcément au
                              catalogue réel. Or `inscription_offre` dérive de la filière de la
                              classe : c'est la clé qui relie un dossier à son offre dans
                              « Offres & Formations ». Modifier un groupe par cet écran lui
                              posait donc un libellé hors catalogue, et le chiffre d'affaires
                              de ses inscriptions sortait des statistiques en silence.
                              Le formulaire de CRÉATION lit déjà le catalogue ; seul celui-ci
                              était resté en arrière. Voir `utils/catalogueOffres.js`. */}
                          {filieresCatalogue.length > 0 ? (
                            <select style={inp} value={groupeForm.filiere} onChange={e=>setGroupeForm(f=>({...f,filiere:e.target.value}))}>
                              <option value="">- Sélectionner -</option>
                              {filieresCatalogue.map(f=><option key={f} value={f}>{f}</option>)}
                              {/* LA VALEUR ACTUELLE SURVIT, même absente du catalogue. Les
                                  groupes créés avant cette correction en portent une : sans
                                  cette option, le select s'afficherait vide et le premier
                                  enregistrement EFFACERAIT la filière sans rien demander. */}
                              {groupeForm.filiere && !filieresCatalogue.includes(groupeForm.filiere) && (
                                <option value={groupeForm.filiere}>
                                  {groupeForm.filiere} — hors catalogue
                                </option>
                              )}
                            </select>
                          ) : (
                            <>
                              <input style={inp} value={groupeForm.filiere} placeholder="Libellé exact de l'offre"
                                onChange={e=>setGroupeForm(f=>({...f,filiere:e.target.value}))} />
                              <div style={{ fontSize:10, color:"#b45309", marginTop:3 }}>
                                Catalogue indisponible - saisissez le libellé exact d'une offre, sinon les
                                inscriptions de ce groupe seront exclues des statistiques.
                              </div>
                            </>
                          )}
                        </div>
                        <div>
                          <label style={lbl}>Type de cours</label>
                          <select style={inp} value={groupeForm.type_cours} onChange={e=>setGroupeForm(f=>({...f,type_cours:e.target.value}))}>
                            <option value="en_ligne">💻 En ligne</option>
                            <option value="domicile">🏠 Domicile</option>
                            <option value="centre">🏢 Centre</option>
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Capacité max</label>
                          <input type="number" min={1} max={50} style={inp} value={groupeForm.capacite_max} onChange={e=>setGroupeForm(f=>({...f,capacite_max:Number(e.target.value)}))} />
                        </div>
                        <div>
                          <label style={lbl}>Date début</label>
                          <input type="date" style={inp} value={groupeForm.date_debut} onChange={e=>setGroupeForm(f=>({...f,date_debut:e.target.value}))} />
                        </div>
                        <div>
                          <label style={lbl}>Date fin</label>
                          <input type="date" style={inp} value={groupeForm.date_fin} onChange={e=>setGroupeForm(f=>({...f,date_fin:e.target.value}))} />
                        </div>
                      </div>
                      <div style={{ marginBottom:16 }}>
                        <label style={lbl}>Horaires</label>
                        <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8 }}>
                          <select style={{ ...inp,width:"auto",flex:"0 0 80px" }} value={horaireTmp.jour} onChange={e=>setHoraireTmp(h=>({...h,jour:e.target.value}))}>
                            {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(j=><option key={j} value={j}>{j}</option>)}
                          </select>
                          <input type="time" style={{ ...inp,width:"auto",flex:"0 0 100px" }} value={horaireTmp.debut} onChange={e=>setHoraireTmp(h=>({...h,debut:e.target.value}))} />
                          <span style={{ fontSize:12,color:"#6b7280",flexShrink:0 }}>→</span>
                          <input type="time" style={{ ...inp,width:"auto",flex:"0 0 100px" }} value={horaireTmp.fin} onChange={e=>setHoraireTmp(h=>({...h,fin:e.target.value}))} />
                          <button onClick={()=>setGroupeForm(f=>({...f,horaire:[...f.horaire,{...horaireTmp}]}))} style={{ ...btnP,flexShrink:0,whiteSpace:"nowrap" }}>+ Ajouter</button>
                        </div>
                        {groupeForm.horaire.length>0 && (
                          <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                            {groupeForm.horaire.map((h,i)=>(
                              <span key={i} style={{ padding:"3px 10px",borderRadius:8,background:C_LIGHT,color:C,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5 }}>
                                {h.jour} {h.debut}–{h.fin}
                                <button onClick={()=>setGroupeForm(f=>({...f,horaire:f.horaire.filter((_,j)=>j!==i)}))} style={{ background:"none",border:"none",cursor:"pointer",color:C,fontWeight:900,fontSize:13,padding:0,lineHeight:1 }}>×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
                        <button onClick={()=>setShowEditGroupe(false)} style={btnS}>Annuler</button>
                        <button onClick={editGroupe} disabled={groupeSaving||!peut("classes","update")} title={permBtnTitle("Enregistrer les modifications",peut("classes","update"))} style={permBtnStyle({ ...btnP,opacity:groupeSaving?0.7:1 },peut("classes","update"))}>{groupeSaving?"Mise à jour…":peut("classes","update")?"💾 Enregistrer les modifications":"🔒 Enregistrer les modifications"}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

                {/* Le modal de création de classe a été déplacé hors des onglets (voir plus bas) :
                    son unique point d'entrée est « + Nouvelle classe » dans le modal de transfert,
                    qui vit désormais au niveau du rendu. Enfermé ici, il n'était jamais monté. */}

                {/* ══ MODAL IMPORT GROUPES - étape 1 : modèle + upload ══ */}
                {showImportGroupesUpload && (
                  <Modal title="📤 Importer des groupes" onClose={() => setShowImportGroupesUpload(false)}>
                    <p style={{ margin:"-8px 0 18px", fontSize:12.5, color:"#6b7280", lineHeight:1.6 }}>
                      1. Téléchargez le modèle Excel ci-dessous.<br/>
                      2. Remplissez une ligne par groupe (seul le nom est obligatoire).<br/>
                      3. Importez le fichier rempli - vous pourrez vérifier chaque ligne avant de valider.
                    </p>
                    <button onClick={telechargerModeleImportGroupes} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", justifyContent:"center", padding:"12px 0", background:"#f0fdf4", color:"#16a34a", border:"1.5px solid #bbf7d0", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:14 }}>
                      📄 Télécharger le modèle Excel
                    </button>
                    <label htmlFor="import-groupes-file" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, width:"100%", padding:"28px 0", border:"2px dashed #ddd6fe", borderRadius:10, background:"#f5f3ff", cursor:"pointer" }}>
                      <span style={{ fontSize:24 }}>📁</span>
                      <span style={{ fontSize:13, fontWeight:700, color:"#7c3aed" }}>Cliquez pour choisir le fichier rempli</span>
                      <span style={{ fontSize:11, color:"#94a3b8" }}>.xlsx, .xls ou .csv</span>
                    </label>
                    <input id="import-groupes-file" ref={importGroupesFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={lireEtPrevisualiserGroupes} />
                  </Modal>
                )}

                {/* ══ MODAL IMPORT GLOBAL - groupes + apprenants combinés ══ */}
                {showImportGlobalUpload && (
                  <Modal title="🌐 Import global - groupes + apprenants" onClose={() => { if (!importGlobalProcessing) setShowImportGlobalUpload(false); }}>
                    <p style={{ margin:"-8px 0 18px", fontSize:12.5, color:"#6b7280", lineHeight:1.6 }}>
                      Combine en un seul fichier la création des groupes <strong>et</strong> l'inscription des apprenants qui y vont directement.<br/><br/>
                      1. Téléchargez le modèle Excel ci-dessous.<br/>
                      2. Une ligne par apprenant - répétez le même nom de groupe sur toutes ses lignes (seule la 1ère ligne d'un groupe a besoin de ses colonnes filière/niveau/coach/horaires, les suivantes peuvent les laisser vides).<br/>
                      3. Importez le fichier - les groupes manquants sont créés automatiquement, puis vous retrouvez l'aperçu apprenants habituel pour vérifier avant de valider.
                    </p>
                    <button onClick={telechargerModeleImportGlobal} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", justifyContent:"center", padding:"12px 0", background:"#f0fdf4", color:"#16a34a", border:"1.5px solid #bbf7d0", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:14 }}>
                      📄 Télécharger le modèle Excel
                    </button>
                    {importGlobalProcessing ? (
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, width:"100%", padding:"28px 0", border:"2px dashed #a5f3fc", borderRadius:10, background:"#ecfeff" }}>
                        <span style={{ fontSize:24 }}>⏳</span>
                        <span style={{ fontSize:13, fontWeight:700, color:"#0e7490" }}>Création des groupes en cours…</span>
                      </div>
                    ) : (
                      <label htmlFor="import-global-file" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, width:"100%", padding:"28px 0", border:"2px dashed #a5f3fc", borderRadius:10, background:"#ecfeff", cursor:"pointer" }}>
                        <span style={{ fontSize:24 }}>📁</span>
                        <span style={{ fontSize:13, fontWeight:700, color:"#0e7490" }}>Cliquez pour choisir le fichier rempli</span>
                        <span style={{ fontSize:11, color:"#94a3b8" }}>.xlsx, .xls ou .csv</span>
                      </label>
                    )}
                    <input id="import-global-file" ref={importGlobalFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={lireEtPrevisualiserGlobal} disabled={importGlobalProcessing} />
                  </Modal>
                )}

                {/* ══ MODAL IMPORT GROUPES - prévisualisation ══ */}
                {showImportGroupesPreview && (() => {
                  const nbErreurs     = importGroupesPreviewRows.filter(l => l._statut === "erreur").length;
                  const nbAvertiss    = importGroupesPreviewRows.filter(l => l._statut === "avertissement").length;
                  const nbOk          = importGroupesPreviewRows.filter(l => l._statut === "ok").length;
                  const nbImportables = importGroupesPreviewRows.filter(l => l._statut !== "erreur").length;
                  return (
                    <Modal
                      title="🔍 Prévisualisation - Import de groupes - Vérifiez avant de valider"
                      onClose={() => { if (importGroupesConfirming) { toast.error("Import en cours - ne fermez pas cette fenêtre."); return; } setShowImportGroupesPreview(false); setImportGroupesPreviewRows([]); }}
                    >
                      <p style={{ margin:"-8px 0 14px", fontSize:12, color:"#6b7280" }}>{importGroupesPreviewRows.length} ligne(s) · {nbOk} OK · {nbAvertiss} avertissement(s) · {nbErreurs} erreur(s) bloquante(s)</p>
                      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                        {nbOk > 0 && <div style={{ background:"#dcfce7", color:"#16a34a", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>✅ {nbOk} valide{nbOk>1?"s":""}</div>}
                        {nbAvertiss > 0 && <div style={{ background:"#fef3c7", color:"#92400e", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>⚠️ {nbAvertiss} avertissement{nbAvertiss>1?"s":""}</div>}
                        {nbErreurs > 0 && <div style={{ background:"#fee2e2", color:"#dc2626", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>🚫 {nbErreurs} erreur{nbErreurs>1?"s":""} bloquante{nbErreurs>1?"s":""}</div>}
                        <div style={{ background:"#f1f5f9", color:"#475569", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>📍 Tous les groupes seront créés en "en_ligne"</div>
                      </div>

                      {nbErreurs > 0 && (
                        <div style={{ background:"#fff1f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#991b1b" }}>
                          ⚠️ Les lignes en rouge <strong>ne seront pas importées</strong>. Corrigez le fichier et réimportez.
                        </div>
                      )}

                      <div style={{ overflowX:"auto", maxHeight:420, overflowY:"auto", marginBottom:16, borderRadius:10, border:"1.5px solid #e2e8f0" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead style={{ position:"sticky", top:0, zIndex:2 }}>
                            <tr style={{ background:"#f8fafc" }}>
                              {["#","Statut","Nom groupe","Filière","Niveau","Date début","Date fin","Capacité","Coach","Assistante","Horaires","Problèmes détectés"].map(h => (
                                <th key={h} style={{ padding:"9px 10px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importGroupesPreviewRows.map((l, i) => {
                              const bgRow = l._statut==="erreur" ? "#fff1f2" : l._statut==="avertissement" ? "#fffbeb" : "#f0fdf4";
                              const allIssues = [
                                ...l._erreurs.map(e2 => ({ text:e2, type:"erreur" })),
                                ...l._avertissements.map(w => ({ text:w, type:"avertissement" })),
                              ];
                              return (
                                <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:bgRow }}>
                                  <td style={{ padding:"8px 10px", color:"#94a3b8", fontSize:11, fontWeight:600 }}>{l._idx}</td>
                                  <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                                    {l._statut==="erreur"
                                      ? <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>🚫 Erreur</span>
                                      : l._statut==="avertissement"
                                      ? <span style={{ background:"#fef3c7", color:"#92400e", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>⚠️ Attention</span>
                                      : <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>✅ Valide</span>
                                    }
                                  </td>
                                  <td style={{ padding:"8px 10px", fontWeight:600 }}>{l.nom || <span style={{ color:"#ef4444" }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151" }}>{l.filiere || <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151" }}>{l.niveau || <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#64748b", whiteSpace:"nowrap" }}>{l.date_debut || <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#64748b", whiteSpace:"nowrap" }}>{l.date_fin || <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#64748b" }}>{l.capacite_max}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151", whiteSpace:"nowrap" }}>{l.coach_nom || <span style={{ color:"#ef4444" }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151", whiteSpace:"nowrap" }}>{l.assistante_nom || <span style={{ color:"#ef4444" }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#64748b", maxWidth:180 }}>{l.horaire?.length ? l.horaire.map(fmtHoraire).join(", ") : <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", maxWidth:260 }}>
                                    {allIssues.length === 0
                                      ? <span style={{ color:"#86efac", fontSize:11 }}>Aucun problème</span>
                                      : <ul style={{ margin:0, paddingLeft:14 }}>
                                          {allIssues.map((iss, j) => (
                                            <li key={j} style={{ fontSize:11, color: iss.type==="erreur"?"#dc2626":"#92400e", fontWeight: iss.type==="erreur"?700:500, marginBottom:2 }}>
                                              {iss.text}
                                            </li>
                                          ))}
                                        </ul>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", alignItems:"center", flexWrap:"wrap" }}>
                        {nbErreurs > 0 && <span style={{ fontSize:11, color:"#94a3b8", marginRight:"auto" }}>
                          {nbImportables} ligne{nbImportables>1?"s":""} importable{nbImportables>1?"s":""} sur {importGroupesPreviewRows.length}
                        </span>}
                        <button
                          onClick={() => { setShowImportGroupesPreview(false); setImportGroupesPreviewRows([]); }}
                          style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:12, color:"#374151", cursor:"pointer", fontWeight:600 }}>
                          ✕ Fermer et corriger
                        </button>
                        {nbImportables > 0 && (
                          <button
                            onClick={async () => {
                              if (await confirm(`${nbImportables} groupe${nbImportables>1?"s vont être créés":" va être créé"} directement en base - vérifiez l'aperçu ci-dessus avant de continuer.`, { titre: `Importer ${nbImportables} groupe${nbImportables>1?"s":""} ?`, confirmLabel: "Importer", danger: false })) confirmerImportGroupes();
                            }}
                            disabled={importGroupesConfirming}
                            style={{ padding:"9px 20px",
                              // Pendant l'import, le fond devient une barre de progression : la
                              // partie déjà traitée est en couleur pleine, le reste en teinte claire.
                              background: importGroupesConfirming
                                ? `linear-gradient(to right, #6d28d9 ${importGroupesProgress}%, #c4b5fd ${importGroupesProgress}%)`
                                : (nbErreurs>0 ? "#f59e0b" : "#7c3aed"),
                              transition:"background 0.3s ease",
                              border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor: importGroupesConfirming ? "not-allowed" : "pointer", fontWeight:700, opacity: importGroupesConfirming?0.9:1 }}>
                            {importGroupesConfirming ? `⏳ Import en cours… ${importGroupesProgress}%` : nbErreurs > 0
                              ? `⚠️ Importer uniquement les ${nbImportables} ligne${nbImportables>1?"s":""} valides`
                              : `✅ Valider et importer ${nbImportables} groupe${nbImportables>1?"s":""}`
                            }
                          </button>
                        )}
                      </div>
                    </Modal>
                  );
                })()}

                {/* ══ MODAL IMPORT GROUPES - résultat ══ */}
                {rendreModalProgressionImport()}
      {rendreModalHistoriqueImports()}

                {showImportGroupesResultat && importGroupesResultats.length > 0 && (
                  <Modal
                    title="✅ Import terminé - Groupes créés"
                    onClose={() => { setShowImportGroupesResultat(false); rechargerGroupesOnb(); }}
                  >
                    <p style={{ margin:"-8px 0 14px", fontSize:12, color:"#6b7280" }}>Récapitulatif ligne par ligne.</p>
                    <div style={{ overflowX:"auto", marginBottom:16 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead>
                          <tr style={{ background:"#f8fafc" }}>
                            {["Nom groupe","Statut","Détail"].map(h=>(
                              <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importGroupesResultats.map((r,i)=>(
                            <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:r.statut==="ok"?"#fff":"#fff1f2" }}>
                              <td style={{ padding:"8px 12px", fontWeight:600 }}>{r.nom}</td>
                              <td style={{ padding:"8px 12px" }}>
                                {r.statut==="ok"
                                  ? <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✓ Créé</span>
                                  : <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✗ Erreur</span>
                                }
                              </td>
                              <td style={{ padding:"8px 12px", color:"#ef4444", fontSize:11 }}>{r.detail || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                      {rendreBoutonAnnulerImport()}
                      <button onClick={() => { setShowImportGroupesResultat(false); rechargerGroupesOnb(); }} style={{ padding:"9px 18px", background:"#7c3aed", border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor:"pointer", fontWeight:700 }}>Fermer</button>
                    </div>
                  </Modal>
                )}

                {/* ══ MODAL IMPORT COACHING PRIVÉ - étape 1 : modèle + upload ══ */}
                {showImportPriveUpload && (
                  <Modal title="🔒 Importer du coaching privé en ligne" onClose={() => setShowImportPriveUpload(false)}>
                    <p style={{ margin:"-8px 0 18px", fontSize:12.5, color:"#6b7280", lineHeight:1.6 }}>
                      Pour des relations <strong>déjà réelles</strong> (apprenant et coach déjà ensemble) - pas de nouveaux dossiers à faire valider.<br/><br/>
                      1. Téléchargez le modèle Excel ci-dessous.<br/>
                      2. Remplissez une ligne par coaching privé (nom apprenant et coach sont obligatoires).<br/>
                      3. Importez le fichier rempli - vous pourrez vérifier chaque ligne avant de valider.
                    </p>
                    <button onClick={telechargerModeleImportPrive} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", justifyContent:"center", padding:"12px 0", background:"#f0fdf4", color:"#16a34a", border:"1.5px solid #bbf7d0", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:14 }}>
                      📄 Télécharger le modèle Excel
                    </button>
                    <label htmlFor="import-prive-onboarding-file" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, width:"100%", padding:"28px 0", border:"2px dashed #fbcfe8", borderRadius:10, background:"#fdf2f8", cursor:"pointer" }}>
                      <span style={{ fontSize:24 }}>📁</span>
                      <span style={{ fontSize:13, fontWeight:700, color:"#be185d" }}>Cliquez pour choisir le fichier rempli</span>
                      <span style={{ fontSize:11, color:"#94a3b8" }}>.xlsx, .xls ou .csv</span>
                    </label>
                    <input id="import-prive-onboarding-file" ref={importPriveFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={lireEtPrevisualiserPrive} />
                  </Modal>
                )}

                {/* ══ MODAL IMPORT COACHING PRIVÉ - prévisualisation ══ */}
                {showImportPrivePreview && (() => {
                  const nbErreurs     = importPrivePreviewRows.filter(l => l._statut === "erreur").length;
                  const nbAvertiss    = importPrivePreviewRows.filter(l => l._statut === "avertissement").length;
                  const nbOk          = importPrivePreviewRows.filter(l => l._statut === "ok").length;
                  const nbImportables = importPrivePreviewRows.filter(l => l._statut !== "erreur").length;
                  return (
                    <Modal title="🔍 Prévisualisation - Import coaching privé en ligne - Vérifiez avant de valider" onClose={() => { if (importPriveConfirming) { toast.error("Import en cours - ne fermez pas cette fenêtre."); return; } setShowImportPrivePreview(false); setImportPrivePreviewRows([]); }}>
                      <p style={{ margin:"-8px 0 14px", fontSize:12, color:"#6b7280" }}>{importPrivePreviewRows.length} ligne(s) · {nbOk} OK · {nbAvertiss} avertissement(s) · {nbErreurs} erreur(s) bloquante(s)</p>
                      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                        {nbOk > 0 && <div style={{ background:"#dcfce7", color:"#16a34a", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>✅ {nbOk} valide{nbOk>1?"s":""}</div>}
                        {nbAvertiss > 0 && <div style={{ background:"#fef3c7", color:"#92400e", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>⚠️ {nbAvertiss} avertissement{nbAvertiss>1?"s":""}</div>}
                        {nbErreurs > 0 && <div style={{ background:"#fee2e2", color:"#dc2626", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>🚫 {nbErreurs} erreur{nbErreurs>1?"s":""} bloquante{nbErreurs>1?"s":""}</div>}
                        <div style={{ background:"#fdf2f8", color:"#be185d", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>🔒 Dossier + classe + coach créés directement à l'état final</div>
                      </div>

                      {nbErreurs > 0 && (
                        <div style={{ background:"#fff1f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#991b1b" }}>
                          ⚠️ Les lignes en rouge <strong>ne seront pas importées</strong>. Corrigez le fichier et réimportez.
                        </div>
                      )}

                      <div style={{ overflowX:"auto", maxHeight:420, overflowY:"auto", marginBottom:16, borderRadius:10, border:"1.5px solid #e2e8f0" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead style={{ position:"sticky", top:0, zIndex:2 }}>
                            <tr style={{ background:"#f8fafc" }}>
                              {["#","Statut","Apprenant","Email","Niveau","Coach","Assistante","Pack","Montant payé","Disponibilités","Problèmes détectés"].map(h => (
                                <th key={h} style={{ padding:"9px 10px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importPrivePreviewRows.map((l, i) => {
                              const bgRow = l._statut==="erreur" ? "#fff1f2" : l._statut==="avertissement" ? "#fffbeb" : "#f0fdf4";
                              const allIssues = [
                                ...l._erreurs.map(e2 => ({ text:e2, type:"erreur" })),
                                ...l._avertissements.map(w => ({ text:w, type:"avertissement" })),
                              ];
                              return (
                                <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:bgRow }}>
                                  <td style={{ padding:"8px 10px", color:"#94a3b8", fontSize:11, fontWeight:600 }}>{l._idx}</td>
                                  <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                                    {l._statut==="erreur"
                                      ? <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>🚫 Erreur</span>
                                      : l._statut==="avertissement"
                                      ? <span style={{ background:"#fef3c7", color:"#92400e", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>⚠️ Attention</span>
                                      : <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>✅ Valide</span>
                                    }
                                  </td>
                                  <td style={{ padding:"8px 10px", fontWeight:600 }}>
                                    {[l.prenom, l.nom].filter(Boolean).join(" ") || <span style={{ color:"#ef4444" }}>-</span>}
                                    {l.profil_type === "enfant" && (
                                      <span style={{ marginLeft:6, background:"#fef9c3", color:"#854d0e", borderRadius:20, padding:"2px 7px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>
                                        👶 Enfant{l.nom_parent ? ` · ${l.nom_parent}` : ""}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding:"8px 10px", color:"#374151", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.email || <span style={{ color:"#d1d5db", fontSize:11 }}>{l.profil_type === "enfant" ? "- (parent)" : "-"}</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151" }}>{l.niveau || <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151", whiteSpace:"nowrap" }}>{l.coach_nom || <span style={{ color:"#ef4444" }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151", whiteSpace:"nowrap" }}>{l.assistante_nom || <span style={{ color:"#ef4444" }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#64748b", whiteSpace:"nowrap" }}>{l.pack === "intensive" ? "Intensive" : "Classique"}</td>
                                  <td style={{ padding:"8px 10px", color:"#64748b", whiteSpace:"nowrap" }}>{l.montant_paye != null ? l.montant_paye.toLocaleString("fr-FR") + " F" : <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#64748b", maxWidth:180 }}>{l.horaire?.length ? l.horaire.map(fmtHoraire).join(", ") : <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", maxWidth:260 }}>
                                    {allIssues.length === 0
                                      ? <span style={{ color:"#86efac", fontSize:11 }}>Aucun problème</span>
                                      : <ul style={{ margin:0, paddingLeft:14 }}>
                                          {allIssues.map((iss, j) => (
                                            <li key={j} style={{ fontSize:11, color: iss.type==="erreur"?"#dc2626":"#92400e", fontWeight: iss.type==="erreur"?700:500, marginBottom:2 }}>
                                              {iss.text}
                                            </li>
                                          ))}
                                        </ul>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", alignItems:"center", flexWrap:"wrap" }}>
                        {nbErreurs > 0 && <span style={{ fontSize:11, color:"#94a3b8", marginRight:"auto" }}>
                          {nbImportables} ligne{nbImportables>1?"s":""} importable{nbImportables>1?"s":""} sur {importPrivePreviewRows.length}
                        </span>}
                        <button
                          onClick={() => { setShowImportPrivePreview(false); setImportPrivePreviewRows([]); }}
                          style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:12, color:"#374151", cursor:"pointer", fontWeight:600 }}>
                          ✕ Fermer et corriger
                        </button>
                        {nbImportables > 0 && (
                          <button
                            onClick={async () => {
                              if (await confirm(`${nbImportables} coaching${nbImportables>1?"s privés vont être créés":" privé va être créé"} directement en base - vérifiez l'aperçu ci-dessus avant de continuer.`, { titre: `Importer ${nbImportables} coaching${nbImportables>1?"s":""} privé${nbImportables>1?"s":""} ?`, confirmLabel: "Importer", danger: false })) confirmerImportPrive();
                            }}
                            disabled={importPriveConfirming}
                            style={{ padding:"9px 20px",
                              background: importPriveConfirming
                                ? `linear-gradient(to right, #9d174d ${importPriveProgress}%, #f9a8d4 ${importPriveProgress}%)`
                                : (nbErreurs>0 ? "#f59e0b" : "#be185d"),
                              transition:"background 0.3s ease",
                              border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor: importPriveConfirming ? "not-allowed" : "pointer", fontWeight:700, opacity: importPriveConfirming?0.9:1 }}>
                            {importPriveConfirming ? `⏳ Import en cours… ${importPriveProgress}%` : nbErreurs > 0
                              ? `⚠️ Importer uniquement les ${nbImportables} ligne${nbImportables>1?"s":""} valides`
                              : `✅ Valider et importer ${nbImportables} coaching${nbImportables>1?"s":""} privé${nbImportables>1?"s":""}`
                            }
                          </button>
                        )}
                      </div>
                    </Modal>
                  );
                })()}

                {/* ══ MODAL IMPORT COACHING PRIVÉ - résultat ══ */}
                {showImportPriveResultat && importPriveResultats.length > 0 && (
                  <Modal title="✅ Import terminé - Coachings privés créés" onClose={() => { setShowImportPriveResultat(false); rechargerGroupesOnb(); }}>
                    <p style={{ margin:"-8px 0 14px", fontSize:12, color:"#6b7280" }}>Récapitulatif ligne par ligne.</p>
                    <div style={{ overflowX:"auto", marginBottom:16 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead>
                          <tr style={{ background:"#f8fafc" }}>
                            {["Apprenant","Statut","Détail"].map(h=>(
                              <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importPriveResultats.map((r,i)=>(
                            <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:r.statut==="ok"?"#fff":r.statut==="avertissement"?"#fffbeb":"#fff1f2" }}>
                              <td style={{ padding:"8px 12px", fontWeight:600 }}>{r.nom}</td>
                              <td style={{ padding:"8px 12px" }}>
                                {r.statut==="ok"
                                  ? <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✓ Créé</span>
                                  : r.statut==="avertissement"
                                  ? <span style={{ background:"#fef3c7", color:"#b45309", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>⚠ Créé avec avertissement</span>
                                  : <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✗ Erreur</span>
                                }
                              </td>
                              <td style={{ padding:"8px 12px", color:r.statut==="avertissement"?"#b45309":"#ef4444", fontSize:11 }}>{r.detail || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                      {rendreBoutonAnnulerImport()}
                      <button onClick={() => { setShowImportPriveResultat(false); rechargerGroupesOnb(); }} style={{ padding:"9px 18px", background:"#be185d", border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor:"pointer", fontWeight:700 }}>Fermer</button>
                    </div>
                  </Modal>
                )}

                {/* ══ MODAL IMPORT APPRENANTS - étape 1 : modèle + upload ══ */}
                {showImportApprenantsUpload && (
                  <Modal title="📤 Importer des apprenants dans des classes en ligne existantes" onClose={() => setShowImportApprenantsUpload(false)}>
                    <p style={{ margin:"-8px 0 18px", fontSize:12.5, color:"#6b7280", lineHeight:1.6 }}>
                      Pour des apprenants déjà dans une classe en ligne existante - aucune classe ni coach n'est créé ici.<br/><br/>
                      1. Téléchargez le modèle Excel ci-dessous.<br/>
                      2. Remplissez une ligne par apprenant - la colonne "Classe" est optionnelle : renseignez-la si vous
                      connaissez le nom exact de la classe, sinon laissez-la vide, vous choisirez une classe pour tout
                      le lot juste après l'import. "Assistante (email)" reste obligatoire.<br/>
                      3. Importez le fichier rempli - un résumé des classes reconnues s'affiche avant le détail ligne par ligne.
                    </p>
                    <button onClick={telechargerModeleImportApprenants} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", justifyContent:"center", padding:"12px 0", background:"#f0fdf4", color:"#16a34a", border:"1.5px solid #bbf7d0", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:14 }}>
                      📄 Télécharger le modèle Excel
                    </button>
                    <label htmlFor="import-apprenants-file-onb" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, width:"100%", padding:"28px 0", border:"2px dashed #93c5fd", borderRadius:10, background:"#eff6ff", cursor:"pointer" }}>
                      <span style={{ fontSize:24 }}>📁</span>
                      <span style={{ fontSize:13, fontWeight:700, color:"#1d4ed8" }}>Cliquez pour choisir le fichier rempli</span>
                      <span style={{ fontSize:11, color:"#94a3b8" }}>.xlsx, .xls ou .csv</span>
                    </label>
                    <input id="import-apprenants-file-onb" ref={importApprenantsFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={lireEtPrevisualiserApprenants} />
                  </Modal>
                )}

                {/* ══ MODAL IMPORT APPRENANTS - prévisualisation (résumé des classes + détail) ══ */}
                {showImportApprenantsPreview && (() => {
                  const nbErreurs     = importApprenantsPreviewRows.filter(l => l._statut === "erreur").length;
                  const nbAvertiss    = importApprenantsPreviewRows.filter(l => l._statut === "avertissement").length;
                  const nbOk          = importApprenantsPreviewRows.filter(l => l._statut === "ok").length;
                  const nbImportables = importApprenantsPreviewRows.filter(l => l._statut !== "erreur").length;

                  const parClasse = new Map();
                  importApprenantsPreviewRows.forEach(l => {
                    const cle = normNomImportOnb(l.classe_saisie || "");
                    if (!parClasse.has(cle)) parClasse.set(cle, { libelle: l.classe_saisie || "", trouvee: !!l.classe_id, nomReel: l.classe_nom, count: 0 });
                    parClasse.get(cle).count++;
                  });
                  const resumeClasses = Array.from(parClasse.values()).sort((a, b) => b.count - a.count);
                  const bloqueParClasseIntrouvable = resumeClasses.some(c => c.libelle && !c.trouvee);

                  return (
                    <Modal title="🔍 Prévisualisation - Import apprenants - Vérifiez avant de valider" onClose={() => { if (importApprenantsConfirming) { toast.error("Import en cours - ne fermez pas cette fenêtre."); return; } setShowImportApprenantsPreview(false); setImportApprenantsPreviewRows([]); }}>
                      <p style={{ margin:"-8px 0 14px", fontSize:12, color:"#6b7280" }}>{importApprenantsPreviewRows.length} ligne(s) · {nbOk} OK · {nbAvertiss} avertissement(s) · {nbErreurs} erreur(s) bloquante(s)</p>

                      <h4 style={{ margin:"0 0 8px", fontSize:13, fontWeight:800, color:"#0f172a" }}>🔎 Résumé des classes référencées</h4>
                      <div style={{ overflowX:"auto", marginBottom:18, borderRadius:10, border:"1.5px solid #e2e8f0" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead>
                            <tr style={{ background:"#f8fafc" }}>
                              {["Classe référencée dans le fichier", "Lignes concernées", "Statut"].map(h => (
                                <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {resumeClasses.map((c, i) => (
                              <tr key={i} style={{ borderBottom:"1px solid #f1f5f9" }}>
                                <td style={{ padding:"8px 12px", fontWeight:600 }}>{c.libelle ? c.nomReel || c.libelle : <span style={{ color:"#9ca3af", fontStyle:"italic" }}>(cellule vide)</span>}</td>
                                <td style={{ padding:"8px 12px" }}>{c.count}</td>
                                <td style={{ padding:"8px 12px" }}>
                                  {!c.libelle
                                    ? <span style={{ background:"#ede9fe", color:"#6d28d9", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>🕓 À assigner après import</span>
                                    : c.trouvee
                                    ? <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✅ Trouvée</span>
                                    : <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>❌ Introuvable</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {bloqueParClasseIntrouvable && (
                        <div style={{ background:"#fff1f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#991b1b" }}>
                          🚫 Au moins une classe référencée est introuvable - corrigez directement la cellule "Classe" sur
                          la ou les lignes concernées ci-dessous (pas besoin de réuploader le fichier), ou laissez-la vide
                          pour l'assigner après l'import.
                        </div>
                      )}

                      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
                        {nbOk > 0 && <div style={{ background:"#dcfce7", color:"#16a34a", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>✅ {nbOk} valide{nbOk>1?"s":""}</div>}
                        {nbAvertiss > 0 && <div style={{ background:"#fef3c7", color:"#92400e", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>⚠️ {nbAvertiss} avertissement{nbAvertiss>1?"s":""}</div>}
                        {nbErreurs > 0 && <div style={{ background:"#fee2e2", color:"#dc2626", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700 }}>🚫 {nbErreurs} erreur{nbErreurs>1?"s":""} bloquante{nbErreurs>1?"s":""}</div>}
                      </div>

                      {nbErreurs > 0 && (
                        <div style={{ background:"#fff1f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#991b1b" }}>
                          ⚠️ Les lignes en rouge <strong>ne seront pas importées</strong>. Corrigez-les directement dans le tableau (colonne Classe) ou dans le fichier et réimportez.
                        </div>
                      )}

                      <div style={{ overflowX:"auto", maxHeight:420, overflowY:"auto", marginBottom:16, borderRadius:10, border:"1.5px solid #e2e8f0" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead style={{ position:"sticky", top:0, zIndex:2 }}>
                            <tr style={{ background:"#f8fafc" }}>
                              {["#","Statut","Apprenant","Email","Niveau","Classe","Assistante","Paiements","Problèmes détectés"].map(h => (
                                <th key={h} style={{ padding:"9px 10px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importApprenantsPreviewRows.map((l, i) => {
                              const bgRow = l._statut==="erreur" ? "#fff1f2" : l._statut==="avertissement" ? "#fffbeb" : "#f0fdf4";
                              const allIssues = [
                                ...l._erreurs.map(e2 => ({ text:e2, type:"erreur" })),
                                ...l._avertissements.map(w => ({ text:w, type:"avertissement" })),
                              ];
                              return (
                                <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:bgRow }}>
                                  <td style={{ padding:"8px 10px", color:"#94a3b8", fontSize:11, fontWeight:600 }}>{l._idx}</td>
                                  <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                                    {l._statut==="erreur"
                                      ? <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>🚫 Erreur</span>
                                      : l._statut==="avertissement"
                                      ? <span style={{ background:"#fef3c7", color:"#92400e", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>⚠️ Attention</span>
                                      : <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>✅ Valide</span>
                                    }
                                  </td>
                                  <td style={{ padding:"8px 10px", fontWeight:600 }}>{[l.prenom, l.nom].filter(Boolean).join(" ") || <span style={{ color:"#ef4444" }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.email || <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#374151" }}>{l.niveau || <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", minWidth:200 }}>
                                    <input
                                      defaultValue={l.classe_saisie}
                                      placeholder="(vide → après import)"
                                      onBlur={ev => { if (ev.target.value !== l.classe_saisie) corrigerClasseLigneApprenant(i, ev.target.value); }}
                                      style={{ width:"100%", padding:"5px 8px", borderRadius:6, border: l.classe_saisie && !l.classe_id ? "1.5px solid #ef4444" : "1px solid #e2e8f0", fontSize:11.5 }}
                                    />
                                  </td>
                                  <td style={{ padding:"8px 10px", color:"#374151", whiteSpace:"nowrap" }}>{l.assistante_nom || <span style={{ color:"#ef4444" }}>-</span>}</td>
                                  <td style={{ padding:"8px 10px", color:"#64748b", whiteSpace:"nowrap" }}>
                                    {l.paiements?.length
                                      ? <div title={l.paiements.map(p => `${p.montant.toLocaleString("fr-FR")} F${p.date ? " · " + p.date : ""}${p.reference ? " · " + p.reference : ""}`).join("\n")}>
                                          <div style={{ fontWeight:700, color:"#16a34a" }}>{l.montant_paye.toLocaleString("fr-FR")} F</div>
                                          <div style={{ fontSize:10, color:"#94a3b8" }}>{l.paiements.length} versement{l.paiements.length>1?"s":""}</div>
                                        </div>
                                      : <span style={{ color:"#d1d5db", fontSize:11 }}>-</span>}
                                  </td>
                                  <td style={{ padding:"8px 10px", maxWidth:260 }}>
                                    {allIssues.length === 0
                                      ? <span style={{ color:"#86efac", fontSize:11 }}>Aucun problème</span>
                                      : <ul style={{ margin:0, paddingLeft:14 }}>
                                          {allIssues.map((iss, j) => (
                                            <li key={j} style={{ fontSize:11, color: iss.type==="erreur"?"#dc2626":"#92400e", fontWeight: iss.type==="erreur"?700:500, marginBottom:2 }}>
                                              {iss.text}
                                            </li>
                                          ))}
                                        </ul>
                                    }
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", alignItems:"center", flexWrap:"wrap" }}>
                        {nbErreurs > 0 && <span style={{ fontSize:11, color:"#94a3b8", marginRight:"auto" }}>
                          {nbImportables} ligne{nbImportables>1?"s":""} importable{nbImportables>1?"s":""} sur {importApprenantsPreviewRows.length}
                        </span>}
                        <button
                          onClick={() => { setShowImportApprenantsPreview(false); setImportApprenantsPreviewRows([]); }}
                          disabled={importApprenantsConfirming}
                          style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:12, color:"#374151", cursor: importApprenantsConfirming ? "not-allowed" : "pointer", fontWeight:600, opacity: importApprenantsConfirming ? 0.5 : 1 }}>
                          ✕ Fermer et corriger
                        </button>
                        {nbImportables > 0 && (
                          <button
                            onClick={async () => {
                              if (await confirm(`${nbImportables} dossier${nbImportables>1?"s vont être créés":" va être créé"} - vérifiez l'aperçu ci-dessus avant de continuer.`, { titre: `Importer ${nbImportables} apprenant${nbImportables>1?"s":""} ?`, confirmLabel: "Importer", danger: false })) confirmerImportApprenants();
                            }}
                            disabled={importApprenantsConfirming}
                            style={{ padding:"9px 20px",
                              background: importApprenantsConfirming
                                ? `linear-gradient(to right, #1e3a8a ${importApprenantsProgress}%, #93c5fd ${importApprenantsProgress}%)`
                                : (nbErreurs>0 ? "#f59e0b" : "#1d4ed8"),
                              transition:"background 0.3s ease",
                              border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor: importApprenantsConfirming ? "not-allowed" : "pointer", fontWeight:700, opacity: importApprenantsConfirming?0.9:1 }}>
                            {importApprenantsConfirming ? `⏳ Import en cours… ${importApprenantsProgress}%` : nbErreurs > 0
                              ? `⚠️ Importer uniquement les ${nbImportables} ligne${nbImportables>1?"s":""} valides`
                              : `✅ Valider et importer ${nbImportables} apprenant${nbImportables>1?"s":""}`
                            }
                          </button>
                        )}
                      </div>
                    </Modal>
                  );
                })()}

                {/* ══ MODAL IMPORT APPRENANTS - choix groupé de la classe ══ */}
                {showImportApprenantsChoixClasse && (
                  <Modal title="🎯 Choisir la classe pour les apprenants restants" onClose={() => {}}>
                    {importApprenantsConfirming && (
                      <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <span style={{ fontSize:12.5, fontWeight:700, color:"#1e40af" }}>⏳ Affectation en cours - {importApprenantsProgress}%</span>
                          <span style={{ fontSize:11, fontWeight:700, color:"#1d4ed8" }}>⚠️ Ne fermez pas cette fenêtre</span>
                        </div>
                        <div style={{ height:8, background:"#dbeafe", borderRadius:99, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${importApprenantsProgress}%`, background:"#1d4ed8", borderRadius:99, transition:"width .2s" }} />
                        </div>
                      </div>
                    )}
                    <p style={{ margin:"-8px 0 16px", fontSize:12.5, color:"#6b7280", lineHeight:1.6 }}>
                      {importApprenantsEnAttente.length} apprenant{importApprenantsEnAttente.length>1?"s n'avaient":" n'avait"} pas de classe précisée dans le fichier - leur dossier est déjà créé. Choisissez une seule classe existante : tous seront inscrits dedans en une fois.
                    </p>
                    <select
                      value={importApprenantsClasseChoisieId}
                      onChange={e => setImportApprenantsClasseChoisieId(e.target.value)}
                      disabled={importApprenantsConfirming}
                      style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, marginBottom:18, boxSizing:"border-box" }}
                    >
                      <option value="">- Choisir une classe -</option>
                      {groupes.filter(c => c.statut !== "terminé" && c.statut !== "cloture").map(c => (
                        <option key={c.id} value={c.id}>{c.nom} {c.niveau ? `(${c.niveau})` : ""} - {c.nb_apprenants||0}/{c.capacite_max||20}</option>
                      ))}
                    </select>
                    <div style={{ display:"flex", justifyContent:"flex-end" }}>
                      <button
                        onClick={async () => {
                          const classeCible = groupes.find(c => String(c.id) === String(importApprenantsClasseChoisieId));
                          if (!classeCible) { toast.error("Choisissez une classe"); return; }
                          if (await confirm(`${importApprenantsEnAttente.length} apprenant(s) vont être inscrits dans "${classeCible.nom}".`, { titre: "Confirmer l'affectation groupée", confirmLabel: "Affecter", danger: false })) confirmerChoixClasseGroupe();
                        }}
                        disabled={importApprenantsConfirming || !importApprenantsClasseChoisieId}
                        style={{ padding:"9px 20px",
                          background: importApprenantsConfirming
                            ? `linear-gradient(to right, #1e3a8a ${importApprenantsProgress}%, #93c5fd ${importApprenantsProgress}%)`
                            : "#1d4ed8",
                          transition:"background 0.3s ease",
                          border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor: (importApprenantsConfirming || !importApprenantsClasseChoisieId) ? "not-allowed" : "pointer", fontWeight:700, opacity: importApprenantsConfirming ? 0.9 : (!importApprenantsClasseChoisieId ? 0.6 : 1) }}>
                        {importApprenantsConfirming ? `⏳ Affectation en cours… ${importApprenantsProgress}%` : `✅ Affecter les ${importApprenantsEnAttente.length} apprenant${importApprenantsEnAttente.length>1?"s":""}`}
                      </button>
                    </div>
                  </Modal>
                )}

                {/* ══ MODAL IMPORT APPRENANTS - résultat ══ */}
                {showImportApprenantsResultat && importApprenantsResultats.length > 0 && (
                  <Modal title="✅ Import terminé - Apprenants" onClose={() => { setShowImportApprenantsResultat(false); setImportApprenantsResultats([]); rechargerGroupesOnb(); }}>
                    <p style={{ margin:"-8px 0 14px", fontSize:12, color:"#6b7280" }}>Récapitulatif ligne par ligne.</p>
                    <div style={{ overflowX:"auto", marginBottom:16 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead>
                          <tr style={{ background:"#f8fafc" }}>
                            {["Apprenant","Statut","Détail"].map(h=>(
                              <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importApprenantsResultats.map((r,i)=>(
                            <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background:r.statut==="ok"?"#fff":r.statut==="avertissement"?"#fffbeb":"#fff1f2" }}>
                              <td style={{ padding:"8px 12px", fontWeight:600 }}>{r.nom}</td>
                              <td style={{ padding:"8px 12px" }}>
                                {r.statut==="ok"
                                  ? <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✓ Créé</span>
                                  : r.statut==="avertissement"
                                  ? <span style={{ background:"#fef3c7", color:"#b45309", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>⚠ Avertissement</span>
                                  : <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 9px", fontSize:10, fontWeight:700 }}>✗ Erreur</span>
                                }
                              </td>
                              <td style={{ padding:"8px 12px", color: r.statut==="ok" ? "#16a34a" : r.statut==="avertissement" ? "#b45309" : "#ef4444", fontSize:11 }}>{r.detail || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}>
                      {rendreBoutonAnnulerImport()}
                      <button onClick={() => { setShowImportApprenantsResultat(false); setImportApprenantsResultats([]); rechargerGroupesOnb(); }} style={{ padding:"9px 18px", background:"#1d4ed8", border:"none", borderRadius:8, fontSize:12, color:"#fff", cursor:"pointer", fontWeight:700 }}>Fermer</button>
                    </div>
                  </Modal>
                )}

              </div>
            )}

            {/* DOSSIERS À RÉAFFECTER. Placé AVANT le bloc commenté des bilans : inséré après,
                il se retrouvait à l'intérieur du commentaire JSX qui les désactive, et l'onglet
                s'affichait entièrement vide - pas même son message « aucun dossier ». */}
            {activeTab==="reaffecter" && (
              <FileDemandesTransfert accent={C} authHdrs={authHeaders} mode="onboarding"
                onReaffecter={ouvrirTransfertDepuisDemande} refreshKey={refreshReaffecter} />
            )}

            {/* ══ BILANS & RENOUVELLEMENTS ══ (désactivé temporairement)
            {activeTab==="bilans" && (
              <div>
                <div style={{ marginBottom:18 }}>
                  <h2 style={{ margin:0,fontSize:17,fontWeight:800,color:"#0f172a" }}>Bilans & Renouvellements</h2>
                  <p style={{ margin:"4px 0 0",fontSize:12,color:"#6b7280" }}>Apprenants dont le groupe se termine (≤30j) ou est terminé - préparez le bilan et déclenchez l'alerte commerciale</p>
                </div>
                {bilansLoading ? (
                  <div style={{ textAlign:"center", padding:40, color:"#9ca3af", fontSize:13 }}>⏳ Chargement…</div>
                ) : bilans.length===0 ? (
                  <div style={{ textAlign:"center",padding:40,color:"#9ca3af",fontSize:13,background:"#f8fafc",borderRadius:12 }}>Aucun bilan à traiter actuellement</div>
                ) : (
                  <div className="table-wrap" style={{ overflowX:"auto", border:"1px solid #e5e7eb", borderRadius:10 }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ textAlign:"left", background:"#f8fafc", borderBottom:"1px solid #e5e7eb" }}>
                          <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Apprenant</th>
                          <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Groupe</th>
                          <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Coach</th>
                          <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Fin de groupe</th>
                          <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Présence</th>
                          <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Note finale</th>
                          <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bilans.map(b=>{
                          const nomComplet = `${b.prenom_apprenant||""} ${b.nom_apprenant||""}`.trim()||"?";
                          return (
                            <tr key={b.id} onClick={()=>setDetailBilan(b)} style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer" }}
                              onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                              <td style={{ padding:"10px 12px" }}>
                                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                                  <div style={{ width:32,height:32,borderRadius:"50%",background:C_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:C,flexShrink:0,overflow:"hidden" }}>
                                    {b.avatar_url ? <img src={b.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : nomComplet[0].toUpperCase()}
                                  </div>
                                  <span style={{ fontWeight:700,color:"#0f172a" }}>{nomComplet} <span style={{ fontSize:10 }}>📋</span></span>
                                </div>
                              </td>
                              <td style={{ padding:"10px 12px", color:"#374151" }}>{b.groupe_nom||"-"}</td>
                              <td style={{ padding:"10px 12px", color:"#374151" }}>{b.coach_nom||"-"}</td>
                              <td style={{ padding:"10px 12px", color:"#6b7280", fontSize:11 }}>{b.date_fin?formatDate(b.date_fin):"-"}</td>
                              <td style={{ padding:"10px 12px", fontWeight:700, color:b.taux_presence>=80?"#22c55e":b.taux_presence!=null?"#f59e0b":"#9ca3af" }}>{b.taux_presence!=null?`${b.taux_presence}%`:"-"}</td>
                              <td style={{ padding:"10px 12px", fontWeight:700, color:b.note_finale>=70?"#22c55e":b.note_finale>=50?"#f59e0b":b.note_finale!=null?"#ef4444":"#9ca3af" }}>{b.note_finale!=null?`${b.note_finale}%`:"-"}</td>
                              <td style={{ padding:"10px 12px" }}>
                                {b.bilan_alerte_envoyee
                                  ? <Badge label="✅ Alerte envoyée" color="#166534" bg="#dcfce7" />
                                  : <Badge label="⚠️ Action requise"  color="#92400e" bg="#fef3c7" />
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            */}

            {/* ══ COACHS ══ */}
          {activeTab === "coachs" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                <div>
                  <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:"#0f172a" }}>👨‍🏫 Coachs BET</h2>
                  <p style={{ margin:"4px 0 0", fontSize:13, color:"#64748b" }}>
                    {paCoachsVue==="liste"
                      ? `${paCoachsList.length} coach${paCoachsList.length!==1?"s":""} enregistré${paCoachsList.length!==1?"s":""}`
                      : "Classement basé sur les évaluations terrain des Superviseurs"}
                  </p>
                </div>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  {/* Toggle Liste / Classement */}
                  <div style={{ display:"flex", background:"#f1f5f9", borderRadius:9, padding:3, gap:2 }}>
                    {[{v:"liste",l:"📋 Liste"},{v:"classement",l:"🏆 Classement"}].map(t=>(
                      <button key={t.v} onClick={()=>setPaCoachsVue(t.v)}
                        style={{ padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontSize:12, fontWeight:700,
                          background:paCoachsVue===t.v?"#fff":"transparent",
                          color:paCoachsVue===t.v?PA_COLOR:"#6b7280",
                          boxShadow:paCoachsVue===t.v?"0 1px 4px rgba(0,0,0,.1)":"none" }}>
                        {t.l}
                      </button>
                    ))}
                  </div>
                  {paCoachsVue==="liste" && (
                    <input placeholder="Rechercher un coach…" value={paCoachSearch} onChange={e=>setPaCoachSearch(e.target.value)}
                      style={{ padding:"9px 14px", borderRadius:9, border:"1.5px solid #e2e8f0", fontSize:13, width:200, outline:"none" }} />
                  )}
                </div>
              </div>

              {/* ── VUE CLASSEMENT ── */}
              {paCoachsVue==="classement" && (() => {
                const ncColor = (n) => n===null?"#94a3b8":n>=4.5?"#16a34a":n>=3.5?"#d97706":"#dc2626";
                const ncBg    = (n) => n===null?"#f1f5f9":n>=4.5?"#dcfce7":n>=3.5?"#fef9c3":"#fee2e2";
                const med     = (i, hasEval) => hasEval ? (i===0?"🥇":i===1?"🥈":i===2?"🥉":null) : null;
                // Merge : classement API + coachs sans éval depuis paCoachsList
                const evalIds = new Set(paClassement.map(c => c.id));
                const sansEval = paCoachsList
                  .filter(c => c.actif && !evalIds.has(c.id))
                  .map(c => ({ ...c, moyenne: null, nb_evaluations: 0, tendance: "stable", derniere_periode: null }));
                const listeComplete = [...paClassement, ...sansEval];
                const evalues  = listeComplete.filter(c => c.nb_evaluations > 0);
                const avecNote = listeComplete.filter(c => c.moyenne !== null);
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {/* KPIs */}
                    {listeComplete.length > 0 && (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:10 }}>
                        {[
                          { l:"Total coachs",   v:listeComplete.length,                                              icon:"👨‍🏫", c:PA_COLOR  },
                          { l:"Évalués",        v:evalues.length,                                                icon:"✅",   c:"#16a34a", sub:`${avecNote.length} avec note calculée` },
                          { l:"Meilleure note", v:avecNote[0]?.moyenne ? `${avecNote[0].moyenne}/5` : "-",      icon:"🥇",   c:"#f59e0b", sub: avecNote[0] ? `${avecNote[0].prenom||""} ${avecNote[0].nom||""}`.trim() : "" },
                          { l:"Notes < 3.5",   v:avecNote.filter(c=>c.moyenne!==null&&c.moyenne<3.5).length,   icon:"⚠️",   c:"#dc2626", sub:"nécessitent attention" },
                        ].map(s=>(
                          <div key={s.l} style={{ background:"#fff", padding:"14px 16px", borderRadius:12, border:"1.5px solid #e2e8f0", display:"flex", alignItems:"center", gap:12 }}>
                            <span style={{ fontSize:22 }}>{s.icon}</span>
                            <div>
                              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{s.l}</div>
                              <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
                              {s.sub && <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>{s.sub}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {listeComplete.length===0 && !paCoachsLoading ? (
                      <div style={{ textAlign:"center", padding:60, background:"#fff", borderRadius:12, border:"1.5px dashed #e2e8f0", color:"#9ca3af" }}>
                        <div style={{ fontSize:36, marginBottom:10 }}>🏆</div>
                        <div style={{ fontWeight:600 }}>Aucun coach enregistré</div>
                      </div>
                    ) : (
                      <div style={{ background:"#fff", borderRadius:14, overflow:"hidden", border:"1px solid #e2e8f0", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                          <thead>
                            <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                              {["#","Coach","Filière","Évaluations","Note moyenne","Tendance"].map(col=>(
                                <th key={col} style={{ padding:"11px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".03em", whiteSpace:"nowrap" }}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {listeComplete.map((c, i) => {
                              const ranked  = c.nb_evaluations > 0;
                              const medal   = med(i, ranked);
                              const photo   = c.avatar_url || c.coach_info?.photo_url;
                              const initC   = ((c.prenom?.[0]||"")+(c.nom?.[0]||"")).toUpperCase() || "CO";
                              const moy     = c.moyenne !== null ? Number(c.moyenne) : null;
                              const tIco    = c.tendance==="hausse"?"↗ Hausse":c.tendance==="baisse"?"↘ Baisse":"→ Stable";
                              const tCol    = c.tendance==="hausse"?"#16a34a":c.tendance==="baisse"?"#dc2626":"#94a3b8";
                              const rowBg   = !ranked ? "#fafafa" : i < 3 ? "#fffbeb" : "#fff";
                              // Étoiles visuelles
                              const stars   = moy !== null ? Math.round(moy) : 0;
                              return (
                                <tr key={c.id} style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer", transition:"background .12s" }}
                                  onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"12"}
                                  onMouseLeave={e=>e.currentTarget.style.background=rowBg}
                                  onClick={()=>openPaCoachModal(c)}>
                                  {/* Rang */}
                                  <td style={{ padding:"12px 16px", textAlign:"center", width:48 }}>
                                    {ranked
                                      ? medal
                                        ? <span style={{ fontSize:22 }}>{medal}</span>
                                        : <span style={{ fontWeight:800, fontSize:13, color:"#94a3b8" }}>#{i+1}</span>
                                      : <span style={{ fontSize:12, color:"#cbd5e1" }}>-</span>}
                                  </td>
                                  {/* Coach */}
                                  <td style={{ padding:"12px 16px" }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                      {photo
                                        ? <img src={photo} alt={c.prenom} style={{ width:38,height:38,borderRadius:"50%",objectFit:"cover",border:`2px solid ${PA_COLOR}30`,flexShrink:0 }} />
                                        : <div style={{ width:38,height:38,borderRadius:"50%",background:PA_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:PA_COLOR,flexShrink:0 }}>{initC}</div>
                                      }
                                      <div>
                                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                                          <span style={{ fontWeight:700, color:"#0f172a" }}>{c.prenom} {c.nom}</span>
                                          {c.acces_bloque && <span style={{ fontSize:9, fontWeight:700, background:"#dc2626", color:"#fff", borderRadius:99, padding:"1px 7px", whiteSpace:"nowrap" }}>🔒 SUSPENDU</span>}
                                        </div>
                                        <div style={{ fontSize:11, color:"#94a3b8" }}>{c.derniere_periode || (ranked ? "évalué" : "non évalué")}</div>
                                      </div>
                                    </div>
                                  </td>
                                  {/* Filière */}
                                  <td style={{ padding:"12px 16px", color:"#64748b", fontSize:12 }}>{c.coach_info?.filiere || c.departement || "-"}</td>
                                  {/* Nb évals */}
                                  <td style={{ padding:"12px 16px" }}>
                                    {ranked
                                      ? <span style={{ background:"#ede9fe",color:PA_COLOR,borderRadius:99,padding:"3px 10px",fontWeight:700,fontSize:12 }}>{c.nb_evaluations} éval{c.nb_evaluations!==1?"s":""}</span>
                                      : <span style={{ color:"#cbd5e1", fontSize:12 }}>Aucune</span>}
                                  </td>
                                  {/* Note moyenne */}
                                  <td style={{ padding:"12px 16px" }}>
                                    {moy !== null ? (
                                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                        <div style={{ display:"flex", gap:1 }}>
                                          {[1,2,3,4,5].map(s=>(
                                            <span key={s} style={{ fontSize:14, color: s<=stars ? "#f59e0b" : "#e5e7eb" }}>★</span>
                                          ))}
                                        </div>
                                        <span style={{ fontWeight:900, fontSize:16, color:ncColor(moy), minWidth:28 }}>{moy.toFixed(1)}</span>
                                        <span style={{ fontSize:11, color:"#94a3b8" }}>/5</span>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize:12, color:"#cbd5e1", fontStyle:"italic" }}>à évaluer</span>
                                    )}
                                  </td>
                                  {/* Tendance */}
                                  <td style={{ padding:"12px 16px" }}>
                                    {ranked
                                      ? <span style={{ fontSize:12, fontWeight:700, color:tCol }}>{tIco}</span>
                                      : <span style={{ color:"#e5e7eb" }}>-</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── VUE LISTE ── */}
              {paCoachsVue==="liste" && (paCoachsLoading ? (
                <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}>Chargement…</div>
              ) : (() => {
                const coachsFiltres = paCoachsList.filter(c => {
                  const q = paCoachSearch.toLowerCase();
                  return !q || `${c.prenom} ${c.nom} ${c.email} ${c.coach_info?.filiere||""}`.toLowerCase().includes(q);
                });
                if (coachsFiltres.length === 0) return (
                  <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>👨‍🏫</div>
                    <div style={{ fontWeight:600 }}>Aucun coach trouvé</div>
                  </div>
                );
                return (
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Coach</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Email</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Filière</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Matricule</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Contrats actifs</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Statut</th>
                          <th style={{ padding:"11px 16px", textAlign:"center", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coachsFiltres.map((c, idx) => {
                          const photo = c.avatar_url || c.coach_info?.photo_url;
                          const initC = ((c.prenom?.[0]||"")+(c.nom?.[0]||"")).toUpperCase() || "CO";
                          const rowBg = idx%2===0?"#fff":"#fafafa";
                          return (
                            <tr key={c.id}
                              style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer", transition:"background .15s" }}
                              onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"0d"}
                              onMouseLeave={e=>e.currentTarget.style.background=rowBg}
                              onClick={() => openPaCoachModal(c)}
                            >
                              <td style={{ padding:"12px 16px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  {(() => {
                                    const moy = c.moyenne ? Number(c.moyenne) : null;
                                    const noteColor = !moy ? null : moy >= 4 ? "#16a34a" : moy >= 3 ? "#f59e0b" : "#ef4444";
                                    return (
                                      <div style={{ position:"relative", flexShrink:0 }}>
                                        {photo
                                          ? <img src={photo} alt={c.prenom} style={{ width:36, height:36, borderRadius:"50%", objectFit:"cover", border:`2px solid ${PA_COLOR}30` }} />
                                          : <div style={{ width:36, height:36, borderRadius:"50%", background:PA_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, color:PA_COLOR }}>{initC}</div>
                                        }
                                        {moy !== null && (
                                          <div title="Note moyenne (évaluations CP)" style={{ position:"absolute", bottom:-4, right:-8, background:noteColor, color:"#fff", borderRadius:20, padding:"1px 5px", fontSize:9, fontWeight:900, border:"2px solid #fff", whiteSpace:"nowrap", lineHeight:1.4, zIndex:2 }}>
                                            ⭐ {moy.toFixed(1)}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <div>
                                    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                                      <span style={{ fontWeight:700, color:"#0f172a" }}>{c.prenom} {c.nom}</span>
                                      {c.acces_bloque && <span style={{ fontSize:9, fontWeight:700, background:"#dc2626", color:"#fff", borderRadius:99, padding:"1px 7px", whiteSpace:"nowrap" }}>🔒 SUSPENDU</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding:"12px 16px", fontSize:12, color:"#374151" }}>{c.email}</td>
                              <td style={{ padding:"12px 16px", fontSize:12, color:"#64748b" }}>{c.coach_info?.filiere || c.departement || "-"}</td>
                              <td style={{ padding:"12px 16px", fontSize:12, color:"#64748b" }}>{c.coach_info?.matricule || "-"}</td>
                              <td style={{ padding:"12px 16px" }}>
                                {c.nbr_contrats_actifs !== undefined
                                  ? <span style={{ fontWeight:700, color: c.nbr_contrats_actifs>0?PA_COLOR:"#9ca3af", fontSize:13 }}>
                                      {c.nbr_contrats_actifs} contrat{c.nbr_contrats_actifs!==1?"s":""}
                                    </span>
                                  : <span style={{ color:"#94a3b8", fontSize:12 }}>-</span>
                                }
                              </td>
                              <td style={{ padding:"12px 16px" }}>
                                {c.acces_bloque
                                  ? <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:99, padding:"3px 10px", fontSize:10, fontWeight:700 }}>🔒 Suspendu</span>
                                  : <span style={{ background:c.actif?"#dcfce7":"#f3f4f6", color:c.actif?"#16a34a":"#9ca3af", borderRadius:99, padding:"3px 10px", fontSize:10, fontWeight:700 }}>
                                      {c.actif ? "Actif" : "Inactif"}
                                    </span>
                                }
                              </td>
                              <td style={{ padding:"12px 16px", textAlign:"center" }}>
                                <button onClick={e=>{ e.stopPropagation(); openPaCoachModal(c); }}
                                  style={{ padding:"6px 14px", background:PA_LIGHT, border:`1px solid ${PA_COLOR}30`, color:PA_COLOR, borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                                  Gérer →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })())}
            </div>
          )}

          {paSelectedCoach && (() => {
            const coach = paSelectedCoach;
            const photoUrl = coach.avatar_url || coach.coach_info?.photo_url || null;
            const initiales = ((coach.prenom?.[0]||"")+(coach.nom?.[0]||"")).toUpperCase();
            const centre = (coach.scope?.filter(s=>s!=="national")||[]).join(", ") || "National";
            const totalDu = paCoachContrats.reduce((s,c)=>s+(c.prix_h||0)*(c.duree_seance_h||1.5)*(c.nb_seances_total||0),0);
            const totalRealise = paCoachContrats.reduce((s,c)=>s+(c.prix_h||0)*(c.duree_seance_h||1.5)*(c.nb_seances_realisees||0),0);
            const contratsActifs = paCoachContrats.filter(c=>c.statut==="actif").length;
            const engagementsActifs = contratsActifs + paCoachGroupes.length;
            const today = new Date(); today.setHours(0,0,0,0);
            const contratsARenouveler = paCoachContrats.filter(c => {
              if (!c.date_fin) return false;
              const fin = new Date(c.date_fin);
              const j = Math.ceil((fin-today)/86400000);
              return (j<=60 && c.statut==="actif") || c.renouvellement_statut;
            });
            const PA_TABS = [
              { id:"infos",          label:"Infos",                                                                          icon:"👤" },
              { id:"evaluations",    label:`Évaluations${(paCoachEvals.length+paCoachRapportsTransmis.length)>0?` (${paCoachEvals.length+paCoachRapportsTransmis.length})`:""}`, icon:"⭐" },
              { id:"contrats",       label:`Classes (${paCoachGroupes.length})`,                                              icon:"🏫" },
              { id:"honoraires",     label:"Honoraires",                                                                      icon:"💰" },
              // { id:"renouvellement", label:`Renouvellement${contratsARenouveler.length>0?` 🔴${contratsARenouveler.length}`:""}`, icon:"🔄" }, // désactivé temporairement
              { id:"disponibilite",  label:`Disponibilités${paCoachDispoData.length>0?` (${paCoachDispoData.length})`:""}`,  icon:"📅" },
              { id:"modules",        label:`Modules e-learning${paCoachCours.length>0?` (${paCoachCours.length})`:""}`,        icon:"🧩" },
              { id:"historique",     label:`Historique${paCoachRemplacementsListe.length>0?` (${paCoachRemplacementsListe.length})`:""}`, icon:"🕓" },
              { id:"acces",          label:`Accès${paCoachAccesBloque?" 🔴":""}`,                                              icon:"🔒" },
            ];
            return (
              <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}
                onClick={e=>{ if(e.target===e.currentTarget) setPaSelectedCoach(null); }}>
                <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

                  {/* HEADER */}
                  <div style={{ background:PA_GRADIENT, padding:"20px 24px", flexShrink:0, position:"relative" }}>
                    <button onClick={()=>setPaSelectedCoach(null)} style={{ position:"absolute", top:14, right:16, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:"50%", width:32, height:32, cursor:"pointer", color:"#fff", fontSize:18, lineHeight:1 }}>✕</button>
                    {(() => {
                      const clmt = paClassement.find(c => c.id === coach.id);
                      const noteMoy = clmt?.moyenne ? Number(clmt.moyenne) : null;
                      const noteColor = !noteMoy ? null : noteMoy >= 4 ? "#16a34a" : noteMoy >= 3 ? "#f59e0b" : "#ef4444";
                      /* Les dernières notes, de la plus ANCIENNE à la plus récente : le
                         classement les renvoie dans l'ordre inverse, et la courbe se
                         lirait à l'envers. */
                      const dernieres = [...(clmt?.historique || [])]
                        .map(h => Number(h?.note)).filter(n => Number.isFinite(n) && n > 0)
                        .reverse().slice(-6);
                      const tendance = clmt?.tendance || "stable";
                      const nbNotes = clmt?.nb_avec_note ?? clmt?.nb_evaluations ?? dernieres.length;
                      const coulNote = (n) => !n ? "#94a3b8" : n >= 4 ? "#16a34a" : n >= 3 ? "#f59e0b" : "#ef4444";
                      return (
                    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                      {/* Photo + note */}
                      <div style={{ position:"relative", flexShrink:0 }}>
                        {photoUrl
                          ? <img src={photoUrl} alt={coach.prenom} style={{ width:64, height:64, borderRadius:"50%", objectFit:"cover", border:"3px solid rgba(255,255,255,0.4)" }} />
                          : <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,255,255,0.2)", color:"#fff", fontWeight:800, fontSize:22, display:"flex", alignItems:"center", justifyContent:"center" }}>{initiales}</div>
                        }
                        {noteMoy && (
                          <div title="Note moyenne (évaluations CP)" style={{ position:"absolute", bottom:-4, right:-8, background:noteColor, color:"#fff", borderRadius:20, padding:"2px 7px", fontSize:11, fontWeight:900, border:"2px solid #fff", whiteSpace:"nowrap", lineHeight:1.4 }}>
                            ⭐ {noteMoy.toFixed(1)}
                          </div>
                        )}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, color:"#c4b5fd", fontWeight:600, marginBottom:2 }}>👨‍🏫 Formateur BET</div>
                        <div style={{ fontSize:20, fontWeight:800, color:"#fff" }}>{coach.prenom} {coach.nom}</div>
                        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:4, fontSize:12, color:"rgba(255,255,255,.75)" }}>
                          <span>{coach.coach_info?.filiere || coach.departement || "-"}</span>
                          <span style={{ background:"rgba(255,255,255,.18)", borderRadius:6, padding:"1px 8px", color:"#fff", fontWeight:700 }}>{coach.actif ? "✅ Actif" : "🔴 Inactif"}</span>
                          <span>📋 {engagementsActifs} engagement{engagementsActifs!==1?"s":""} actif{engagementsActifs!==1?"s":""}</span>
                          <BadgeCategorieCoach note={noteMoy} taille="sm" />

                          {/* LA TENDANCE. La moyenne seule est un instantané : elle ne dit
                              pas si le coach progresse ou décroche. */}
                          {dernieres.length > 0 && (
                            <span style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.14)", borderRadius:8, padding:"3px 10px" }}
                              title={`${nbNotes} note${nbNotes>1?"s":""} - de la plus ancienne à la plus récente : ${dernieres.join(" · ")}`}>
                              <span style={{ fontSize:10.5, color:"rgba(255,255,255,.7)", fontWeight:600 }}>Tendance</span>
                              <span style={{ display:"flex", gap:3, alignItems:"flex-end", height:20 }}>
                                {dernieres.map((n, ni) => (
                                  <span key={ni} style={{ width:6, borderRadius:3, background:coulNote(n),
                                    height:`${(n / 5) * 100}%`, minHeight:4, display:"block" }} />
                                ))}
                              </span>
                              {/* La flèche n'a de sens qu'à partir de DEUX notes. */}
                              {dernieres.length >= 2 && (
                                <span style={{ fontSize:15, fontWeight:900, lineHeight:1,
                                  color: tendance === "hausse" ? "#4ade80" : tendance === "baisse" ? "#f87171" : "#cbd5e1" }}>
                                  {tendance === "hausse" ? "↗" : tendance === "baisse" ? "↘" : "→"}
                                </span>
                              )}
                            </span>
                          )}

                          {/* Le NOMBRE d'évaluations : une moyenne de 4,5 tirée d'une seule
                              observation ne vaut pas celle qui en résume douze. */}
                          {noteMoy != null && (
                            <span style={{ fontSize:11.5, color:"rgba(255,255,255,.7)" }}>
                              {nbNotes} évaluation{nbNotes > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                      );
                    })()}
                  </div>

                  {/* ONGLETS */}
                  <div style={{ display:"flex", borderBottom:"2px solid #e5e7eb", background:"#fafafa", flexShrink:0, flexWrap:"wrap" }}>
                    {PA_TABS.map(t => (
                      <button key={t.id} onClick={()=>setPaCoachModalTab(t.id)}
                        style={{ padding:"12px 18px", border:"none", borderBottom:`3px solid ${paCoachModalTab===t.id?PA_COLOR:"transparent"}`,
                          background:"transparent", cursor:"pointer", fontWeight:paCoachModalTab===t.id?700:400,
                          color:paCoachModalTab===t.id?PA_COLOR:"#6b7280", fontSize:12, whiteSpace:"nowrap", display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                          flex:"1 1 110px" }}>
                        <span>{t.icon}</span>{t.label}
                      </button>
                    ))}
                  </div>

                  {/* CONTENU */}
                  <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

                    {/* ════ INFOS ════ */}
                    {paCoachModalTab === "infos" && (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                        <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                          <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:800 }}>Informations personnelles</h3>
                          {[
                            ["Prénom",          coach.prenom || "-"],
                            ["Nom",             coach.nom    || "-"],
                            ["Email",           coach.email  || "-"],
                            ["Téléphone",       coach.telephone || "-"],
                            ["Matricule",       coach.coach_info?.matricule || "-"],
                            ["Filière",         coach.coach_info?.filiere || coach.departement || "-"],
                            ["Lieu habitation", coach.coach_info?.lieu_habitation || "-"],
                            ["Date début BET",  formatDate(coach.coach_info?.date_debut_bet || coach.date_creation)],
                            ["Centre",          centre],
                            ["Statut",          coach.actif ? "✅ Actif" : "🔴 Inactif"],
                          ].map(([l,v])=>(
                            <div key={l} style={{ display:"flex", padding:"6px 0", borderBottom:"1px solid #f1f5f9", fontSize:13 }}>
                              <span style={{ color:"#9ca3af", width:140, flexShrink:0, fontWeight:500 }}>{l}</span>
                              <span style={{ fontWeight:600 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                          <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                            <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800 }}>Certifications</h3>
                            {(() => {
                              const certs = coach.coach_info?.certifications;
                              const list = Array.isArray(certs) ? certs : (typeof certs==="string" ? certs.split(",").map(s=>s.trim()).filter(Boolean) : []);
                              return list.length ? (
                                <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                                  {list.map((c,i)=><span key={i} style={{ padding:"4px 12px", borderRadius:99, background:PA_LIGHT, color:PA_COLOR, fontSize:12, fontWeight:700 }}>🏆 {c}</span>)}
                                </div>
                              ) : <p style={{ fontSize:13, color:"#9ca3af" }}>Aucune certification</p>;
                            })()}
                          </div>
                          <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                            <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800 }}>Résumé activité</h3>
                            {[
                              { l:"Classes assignées", v:paCoachGroupes.length,    c:PA_COLOR },
                              { l:"Montant total dû",  v:formatMoney(totalDu),     c:"#16a34a" },
                              { l:"Montant réalisé",   v:formatMoney(totalRealise),c:"#0891b2" },
                            ].map(s=>(
                              <div key={s.l} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #f1f5f9", fontSize:13 }}>
                                <span style={{ color:"#6b7280" }}>{s.l}</span>
                                <span style={{ fontWeight:800, color:s.c }}>{s.v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ════ ÉVALUATIONS ════ */}
                    {paCoachModalTab === "evaluations" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                        {/* KPI résumé */}
                        {(() => {
                          const clmt = paClassement.find(c => c.id === paSelectedCoach?.id);
                          if (!clmt || clmt.nb_evaluations === 0) return null;
                          const ncColor = n => n >= 4.5 ? "#16a34a" : n >= 3.5 ? "#0891b2" : n >= 2.5 ? "#f59e0b" : "#ef4444";
                          const rank = paClassement.filter(c=>c.nb_evaluations>0).findIndex(c=>c.id===paSelectedCoach?.id);
                          const total = paClassement.filter(c=>c.nb_evaluations>0).length;
                          return (
                            <div style={{ background:C_GRAD, borderRadius:14, padding:20, color:"#fff", display:"flex", alignItems:"center", gap:24 }}>
                              <div style={{ textAlign:"center" }}>
                                <div style={{ fontSize:36, fontWeight:900, color: clmt.moyenne >= 4 ? "#6ee7b7" : clmt.moyenne >= 3 ? "#fcd34d" : "#fca5a5" }}>
                                  {Number(clmt.moyenne).toFixed(1)}
                                </div>
                                <div style={{ fontSize:11, color:"#c4b5fd", fontWeight:600 }}>Note moyenne</div>
                              </div>
                              <div style={{ width:1, background:"rgba(255,255,255,.15)", alignSelf:"stretch" }} />
                              <div style={{ flex:1, display:"flex", gap:20, flexWrap:"wrap" }}>
                                {[
                                  { l:"Évaluations",  v: clmt.nb_evaluations },
                                  { l:"Tendance",     v: clmt.tendance === "hausse" ? "↗ Hausse" : clmt.tendance === "baisse" ? "↘ Baisse" : "→ Stable" },
                                  { l:"Classement",   v: rank >= 0 ? `#${rank+1} / ${total}` : "-" },
                                ].map(s=>(
                                  <div key={s.l}>
                                    <div style={{ fontSize:10, color:"rgba(255,255,255,.55)", fontWeight:600 }}>{s.l}</div>
                                    <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{s.v}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                      {/* ── Rapports Deputy transmis au PA ── */}
                      {(() => {
                        const CRIT_RP = {
                          ponctualite:       { label:"Ponctualité",         icon:"⏰" },
                          preparation:       { label:"Préparation",          icon:"📝" },
                          pedagogie:         { label:"Pédagogie",            icon:"🎓" },
                          gestion_classe:    { label:"Gestion de classe",    icon:"🧑‍🏫" },
                        };
                        const nc2  = n => !n ? "#9ca3af" : n >= 4.5 ? "#16a34a" : n >= 3.5 ? "#0891b2" : n >= 2.5 ? "#f59e0b" : "#ef4444";
                        const nbg2 = n => !n ? "#f3f4f6" : n >= 4.5 ? "#dcfce7" : n >= 3.5 ? "#e0f2fe" : n >= 2.5 ? "#fef3c7" : "#fee2e2";
                        const rapportsFiltres = paCoachRapportsTransmis.filter(rp => {
                          const d = rp.date_observation ? new Date(rp.date_observation) : null;
                          if (rapportDateFrom && d && d < new Date(rapportDateFrom)) return false;
                          if (rapportDateTo   && d && d > new Date(rapportDateTo))   return false;
                          return true;
                        });
                        const rapportTotalPages = Math.max(1, Math.ceil(rapportsFiltres.length / RAPPORT_PER_PAGE));
                        const rapportPageSafe   = Math.min(rapportPage, rapportTotalPages);
                        const rapportsPage      = rapportsFiltres.slice((rapportPageSafe-1)*RAPPORT_PER_PAGE, rapportPageSafe*RAPPORT_PER_PAGE);
                        return (
                          <div style={{ marginTop:8 }}>
                            <h3 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:"#0891b2", display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ background:"#e0f2fe", borderRadius:8, padding:"3px 10px", fontSize:12 }}>📋 Rapports d'observation (Superviseur)</span>
                              <span style={{ fontSize:11, color:"#94a3b8", fontWeight:400 }}>
                                {paCoachRapportsLoading ? "…" : `${paCoachRapportsTransmis.length} rapport${paCoachRapportsTransmis.length !== 1 ? "s" : ""} transmis`}
                              </span>
                            </h3>
                            {paCoachRapportsLoading && <div style={{ textAlign:"center", padding:"20px 0", color:"#94a3b8", fontSize:13 }}>Chargement…</div>}
                            {!paCoachRapportsLoading && paCoachRapportsTransmis.length === 0 && (
                              <div style={{ textAlign:"center", padding:"24px 0", background:"#f0f9ff", borderRadius:12, border:"1px dashed #bae6fd" }}>
                                <div style={{ fontSize:"1.8rem", marginBottom:6 }}>📋</div>
                                <div style={{ fontSize:12, color:"#0891b2", fontWeight:600 }}>Aucun rapport transmis</div>
                                <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>Les rapports envoyés par le Superviseur apparaîtront ici.</div>
                              </div>
                            )}
                            {!paCoachRapportsLoading && paCoachRapportsTransmis.length > 0 && (
                              <div style={{ border:"1.5px solid #bae6fd", borderRadius:14, overflow:"hidden" }}>
                                <div style={{ padding:"10px 14px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                    <span style={{ fontSize:12, fontWeight:700, color:"#0369a1" }}>
                                      {rapportsFiltres.length} rapport{rapportsFiltres.length!==1?"s":""}
                                      {(rapportDateFrom||rapportDateTo) && <span style={{ marginLeft:4, fontSize:10, color:"#0891b2" }}>(filtrés)</span>}
                                    </span>
                                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                                      <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>Du</label>
                                      <input type="date" value={rapportDateFrom} onChange={e=>{ setRapportDateFrom(e.target.value); setRapportPage(1); }}
                                        style={{ padding:"4px 8px", border:"1.5px solid #bae6fd", borderRadius:7, fontSize:12, outline:"none" }} />
                                      <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>au</label>
                                      <input type="date" value={rapportDateTo} onChange={e=>{ setRapportDateTo(e.target.value); setRapportPage(1); }}
                                        style={{ padding:"4px 8px", border:"1.5px solid #bae6fd", borderRadius:7, fontSize:12, outline:"none" }} />
                                      {(rapportDateFrom||rapportDateTo) && (
                                        <button onClick={()=>{ setRapportDateFrom(""); setRapportDateTo(""); setRapportPage(1); }}
                                          style={{ fontSize:11, color:"#ef4444", background:"transparent", border:"none", cursor:"pointer", fontWeight:700 }}>✕</button>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ display:"flex", gap:8 }}>
                                    <button onClick={()=>setPaRapportExpanded(new Set(rapportsPage.map(r=>r.id)))} style={{ fontSize:11, fontWeight:700, color:"#0891b2", background:"transparent", border:"none", cursor:"pointer" }}>Tout déplier ↓</button>
                                    <button onClick={()=>setPaRapportExpanded(new Set())} style={{ fontSize:11, fontWeight:700, color:"#94a3b8", background:"transparent", border:"none", cursor:"pointer" }}>Tout replier ↑</button>
                                  </div>
                                </div>
                                {rapportTotalPages > 1 && (
                                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd" }}>
                                    <span style={{ fontSize:12, color:"#0369a1" }}>Page {rapportPageSafe} / {rapportTotalPages}</span>
                                    <div style={{ display:"flex", gap:4 }}>
                                      <button onClick={()=>setRapportPage(p=>Math.max(1,p-1))} disabled={rapportPageSafe===1}
                                        style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #bae6fd", background:rapportPageSafe===1?"#f0f9ff":"#fff", fontSize:12, cursor:rapportPageSafe===1?"default":"pointer", color:rapportPageSafe===1?"#93c5fd":"#0369a1", fontWeight:600 }}>← Préc.</button>
                                      {Array.from({length:rapportTotalPages},(_,i)=>i+1).map(p=>(
                                        <button key={p} onClick={()=>setRapportPage(p)}
                                          style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===rapportPageSafe?"#0891b2":"#bae6fd"}`, background:p===rapportPageSafe?"#0891b2":"#fff", fontSize:12, cursor:"pointer", color:p===rapportPageSafe?"#fff":"#0369a1", fontWeight:p===rapportPageSafe?800:400 }}>{p}</button>
                                      ))}
                                      <button onClick={()=>setRapportPage(p=>Math.min(rapportTotalPages,p+1))} disabled={rapportPageSafe===rapportTotalPages}
                                        style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #bae6fd", background:rapportPageSafe===rapportTotalPages?"#f0f9ff":"#fff", fontSize:12, cursor:rapportPageSafe===rapportTotalPages?"default":"pointer", color:rapportPageSafe===rapportTotalPages?"#93c5fd":"#0369a1", fontWeight:600 }}>Suiv. →</button>
                                    </div>
                                  </div>
                                )}
                                {rapportsPage.length === 0 && (
                                  <div style={{ textAlign:"center", padding:"24px 0", color:"#94a3b8", fontSize:13 }}>Aucun rapport sur cette période</div>
                                )}
                                {rapportsPage.map((rp, idx) => {
                                  const rpOpen = paRapportExpanded.has(rp.id);
                                  const note   = rp.note_globale ? Number(rp.note_globale) : null;
                                  const depNom = rp.deputy ? `${rp.deputy.prenom||""} ${rp.deputy.nom||""}`.trim() : "Deputy";
                                  const hasTxt = rp.observations || rp.recommandations || rp.commentaire_superviseur;
                                  const toggleRp = () => setPaRapportExpanded(prev => { const n2 = new Set(prev); n2.has(rp.id) ? n2.delete(rp.id) : n2.add(rp.id); return n2; });
                                  return (
                                    <div key={rp.id} style={{ borderBottom: idx < rapportsPage.length-1 ? "1px solid #e0f2fe" : "none" }}>
                                      <div onClick={toggleRp}
                                        style={{ padding:"12px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, background:rpOpen?"#e0f2fe":"#fff", transition:"background .15s" }}
                                        onMouseEnter={e=>{ if(!rpOpen) e.currentTarget.style.background="#f0f9ff"; }}
                                        onMouseLeave={e=>{ if(!rpOpen) e.currentTarget.style.background="#fff"; }}>
                                        <span style={{ fontSize:12, color:"#94a3b8", flexShrink:0, display:"inline-block", transform:rpOpen?"rotate(90deg)":"rotate(0deg)", transition:"transform .2s" }}>▶</span>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>
                                            {rp.date_observation ? new Date(rp.date_observation).toLocaleDateString("fr-FR") : "-"}
                                            {rp.classe && <span style={{ marginLeft:8, fontSize:11, fontWeight:600, color:"#0891b2" }}>{rp.classe}</span>}
                                          </div>
                                          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                                            Observé par {depNom}{rp.centre && ` · ${rp.centre}`}
                                            {hasTxt && <span style={{ marginLeft:6, color:"#0891b2" }}>📝</span>}
                                          </div>
                                        </div>
                                        <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:20, flexShrink:0 }}>
                                          {Object.keys(CRIT_RP).map(k => {
                                            const v = rp[k];
                                            return <div key={k} title={CRIT_RP[k].label} style={{ width:6, borderRadius:2, background:v?nc2(v):"#e5e7eb", height:v?`${v/5*100}%`:"20%" }} />;
                                          })}
                                        </div>
                                        {note && (
                                          <div style={{ width:38, height:38, borderRadius:8, background:nbg2(note), display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:14, color:nc2(note), flexShrink:0 }}>
                                            {note.toFixed(1)}
                                          </div>
                                        )}
                                      </div>
                                      {rpOpen && (
                                        <div style={{ padding:"14px 18px", background:"#e0f2fe", borderTop:"1px solid #bae6fd" }}>
                                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:8, marginBottom:hasTxt?12:0 }}>
                                            {Object.entries(CRIT_RP).map(([key, meta]) => {
                                              const val = rp[key];
                                              return (
                                                <div key={key} style={{ background:"#fff", borderRadius:9, padding:"9px 11px", border:"1px solid #bae6fd" }}>
                                                  <div style={{ fontSize:11, color:"#0369a1", fontWeight:600, marginBottom:5 }}>{meta.icon} {meta.label}</div>
                                                  <div style={{ display:"flex", gap:3 }}>
                                                    {[1,2,3,4,5].map(n=>(
                                                      <div key={n} style={{ width:16, height:16, borderRadius:3, fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", background:val>=n?nc2(val):"#e5e7eb", color:val>=n?"#fff":"#9ca3af" }}>{n}</div>
                                                    ))}
                                                    {val && <span style={{ marginLeft:4, fontSize:11, fontWeight:800, color:nc2(val), alignSelf:"center" }}>{val}/5</span>}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                          {hasTxt && (
                                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                                              {rp.observations && (
                                                <div style={{ background:"#f0f9ff", borderRadius:9, padding:"9px 12px", border:"1px solid #bae6fd" }}>
                                                  <div style={{ fontSize:11, fontWeight:800, color:"#0369a1", marginBottom:4 }}>👁 Observations</div>
                                                  <p style={{ margin:0, fontSize:12, color:"#0c4a6e", lineHeight:1.6 }}>{rp.observations}</p>
                                                </div>
                                              )}
                                              {rp.recommandations && (
                                                <div style={{ background:"#f0fdf4", borderRadius:9, padding:"9px 12px", border:"1px solid #bbf7d0" }}>
                                                  <div style={{ fontSize:11, fontWeight:800, color:"#16a34a", marginBottom:4 }}>💡 Recommandations</div>
                                                  <p style={{ margin:0, fontSize:12, color:"#14532d", lineHeight:1.6 }}>{rp.recommandations}</p>
                                                </div>
                                              )}
                                              {rp.commentaire_superviseur && (
                                                <div style={{ gridColumn:"1/-1", background:"#fef9c3", borderRadius:9, padding:"9px 12px", border:"1px solid #fde047" }}>
                                                  <div style={{ fontSize:11, fontWeight:800, color:"#854d0e", marginBottom:4 }}>💬 Note du Superviseur</div>
                                                  <p style={{ margin:0, fontSize:12, color:"#713f12", lineHeight:1.6 }}>{rp.commentaire_superviseur}</p>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      </div>
                    )}

                    {/* ════ CONTRATS ════ */}
                    {paCoachModalTab === "contrats" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
                          <div>
                            <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Classes assignées</h3>
                            <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Groupes de cours dont ce coach est responsable</p>
                          </div>
                          {paCoachGroupes.length > 0 && (
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>Début Du</label>
                              <input type="date" value={classeDateFrom} onChange={e=>{ setClasseDateFrom(e.target.value); setClassePage(1); }}
                                style={{ padding:"5px 8px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
                              <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>au</label>
                              <input type="date" value={classeDateTo} onChange={e=>{ setClasseDateTo(e.target.value); setClassePage(1); }}
                                style={{ padding:"5px 8px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
                              {(classeDateFrom||classeDateTo) && (
                                <button onClick={()=>{ setClasseDateFrom(""); setClasseDateTo(""); setClassePage(1); }}
                                  style={{ fontSize:11, color:"#ef4444", background:"transparent", border:"none", cursor:"pointer", fontWeight:700 }}>✕ Effacer</button>
                              )}
                            </div>
                          )}
                        </div>

                        <BarreFiltres accent={PA_COLOR} style={{ marginBottom:0 }}>
                          <RangeePastilles label="Catégorie :" valeur={classeFiltreCategorie}
                            onChange={(v)=>{ setClasseFiltreCategorie(v); setClassePage(1); }}
                            options={[{v:"tous",l:"Tous"},{v:"groupe",l:"👥 Cours groupe"},{v:"prive",l:"🔒 Cours privés"}]} />

                          <RangeePastilles label="Statut :" valeur={classeFiltreStatut} style={{ marginBottom:0 }}
                            onChange={(v)=>{ setClasseFiltreStatut(v); setClassePage(1); }}
                            options={[{v:"tous",l:"Tous"},{v:"actif",l:"Actives"},{v:"cloture",l:"🔒 Terminées"}]} />
                        </BarreFiltres>


                        {paCoachGroupesLoading ? (
                          <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>Chargement…</div>
                        ) : paCoachGroupes.length === 0 ? (
                          <div style={{ textAlign:"center", padding:"50px 0", color:"#9ca3af" }}>
                            <div style={{ fontSize:40, marginBottom:10 }}>🏫</div>
                            <div style={{ fontWeight:600 }}>Aucune classe assignée</div>
                            <div style={{ fontSize:12, marginTop:4 }}>Ce coach n'est associé à aucun groupe pour le moment.</div>
                          </div>
                        ) : (() => {
                          // Capacité max === 1 est le marqueur fiable d'une classe privée (posé à la
                          // création par le flux coaching privé) - la colonne is_prive en base n'est
                          // jamais renseignée par le code et reste incohérente sur les anciennes lignes.
                          const estPrive = g => estClassePrivee(g);
                          const classesFiltrees = paCoachGroupes.filter(g => {
                            const d = g.date_debut ? new Date(g.date_debut) : null;
                            if (classeDateFrom && d && d < new Date(classeDateFrom)) return false;
                            if (classeDateTo   && d && d > new Date(classeDateTo))   return false;
                            if (classeFiltreCategorie !== "tous" && (classeFiltreCategorie === "prive" ? !estPrive(g) : estPrive(g))) return false;
                            if (classeFiltreStatut    !== "tous" && g.statut !== classeFiltreStatut) return false;
                            return true;
                          });
                          const classeTotalPages = Math.max(1, Math.ceil(classesFiltrees.length / CLASSE_PER_PAGE));
                          const classePageSafe   = Math.min(classePage, classeTotalPages);
                          const classesPage      = classesFiltrees.slice((classePageSafe-1)*CLASSE_PER_PAGE, classePageSafe*CLASSE_PER_PAGE);
                          return (
                          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                            {(classeDateFrom||classeDateTo) && (
                              <div style={{ fontSize:12, color:"#64748b", fontWeight:600 }}>
                                {classesFiltrees.length} classe{classesFiltrees.length!==1?"s":""} sur cette période
                              </div>
                            )}
                          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                              <thead>
                                <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                                  <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Classe</th>
                                  <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Filière</th>
                                  <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Niveau</th>
                                  <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Type</th>
                                  <th style={{ padding:"10px 16px", textAlign:"center", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Apprenants</th>
                                  <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Début</th>
                                  <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Statut</th>
                                </tr>
                              </thead>
                              <tbody>
                                {classesPage.length === 0 ? (
                                  <tr><td colSpan={7} style={{ textAlign:"center", padding:24, color:"#9ca3af", fontSize:13 }}>Aucune classe sur cette période</td></tr>
                                ) : classesPage.map((g, idx) => {
                                  const sCol = g.statut==="actif"
                                    ? { c:"#16a34a", bg:"#dcfce7" }
                                    : g.statut==="cloture"
                                    ? { c:"#475569", bg:"#f1f5f9" }
                                    : { c:"#d97706", bg:"#fef9c3" };
                                  const sLabel = g.statut==="actif" ? "Actif" : g.statut==="cloture" ? "🔒 Clôturée" : (g.statut||"-");
                                  // Le repli AFFIRMAIT « Présentiel » pour toute valeur inattendue,
                                  // hybride compris.
                                  const { icone: _ic, texte: _tx } = iconeEtTexteTypeCours(g);
                                  const typeLabel = { icon: _ic, label: _tx };
                                  const rowBg = idx%2===0?"#fff":"#fafafa";
                                  return (
                                    <tr key={g.id}
                                      style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer", transition:"background .15s" }}
                                      onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"0d"}
                                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}
                                    >
                                      <td style={{ padding:"12px 16px" }}>
                                        <div style={{ fontWeight:700, color:"#0f172a" }}>{g.nom||"-"}</div>
                                        {g.code && <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>{g.code}</div>}
                                      </td>
                                      <td style={{ padding:"12px 16px", fontSize:12, color:"#374151" }}>{g.filiere||"-"}</td>
                                      <td style={{ padding:"12px 16px" }}>
                                        {g.niveau
                                          ? <span style={{ fontSize:11, fontWeight:800, padding:"3px 9px", borderRadius:999, background:PA_LIGHT, color:PA_COLOR }}>{g.niveau}</span>
                                          : <span style={{ color:"#94a3b8", fontSize:12 }}>-</span>
                                        }
                                      </td>
                                      <td style={{ padding:"12px 16px" }}>
                                        {g.type_cours
                                          ? <span style={{ fontSize:11, fontWeight:600, color:"#374151" }}>{typeLabel.icon} {typeLabel.label}</span>
                                          : <span style={{ color:"#94a3b8", fontSize:12 }}>-</span>
                                        }
                                      </td>
                                      <td style={{ padding:"12px 16px", textAlign:"center" }}>
                                        <span style={{ fontWeight:700, color:PA_COLOR, fontSize:14 }}>
                                          {g.nb_apprenants !== undefined ? g.nb_apprenants : "-"}
                                        </span>
                                      </td>
                                      <td style={{ padding:"12px 16px", fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>
                                        {g.date_debut ? formatDate(g.date_debut) : "-"}
                                      </td>
                                      <td style={{ padding:"12px 16px" }}>
                                        <span style={{ background:sCol.bg, color:sCol.c, borderRadius:99, padding:"3px 10px", fontSize:10, fontWeight:700 }}>
                                          {sLabel}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {classeTotalPages > 1 && (
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0" }}>
                              <span style={{ fontSize:12, color:"#64748b" }}>Page {classePageSafe} / {classeTotalPages}</span>
                              <div style={{ display:"flex", gap:4 }}>
                                <button onClick={()=>setClassePage(p=>Math.max(1,p-1))} disabled={classePageSafe===1}
                                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:classePageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:classePageSafe===1?"default":"pointer", color:classePageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
                                {Array.from({length:classeTotalPages},(_,i)=>i+1).map(p=>(
                                  <button key={p} onClick={()=>setClassePage(p)}
                                    style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===classePageSafe?PA_COLOR:"#e2e8f0"}`, background:p===classePageSafe?PA_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===classePageSafe?"#fff":"#374151", fontWeight:p===classePageSafe?800:400 }}>{p}</button>
                                ))}
                                <button onClick={()=>setClassePage(p=>Math.min(classeTotalPages,p+1))} disabled={classePageSafe===classeTotalPages}
                                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:classePageSafe===classeTotalPages?"#f1f5f9":"#fff", fontSize:12, cursor:classePageSafe===classeTotalPages?"default":"pointer", color:classePageSafe===classeTotalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
                              </div>
                            </div>
                          )}
                          </div>
                        );
                        })()}
                      </div>
                    )}

                    {/* ════ HONORAIRES ════ */}
                    {paCoachModalTab === "honoraires" && (() => {
                      const grade = coach.coach_info?.type_contrat || coach.contrat || "Vacataire";
                      const gradeValide = GRADES.includes(grade) ? grade : "Vacataire";

                      // Calcul honoraire par classe via grille tarifaire
                      const lignes = paCoachGroupes.map(g => {
                        /* ⚠ UNE CLASSE HYBRIDE EST FACTURÉE AU TARIF PRÉSENTIEL, faute d'une
                           règle établie. Ce n'est pas un choix technique : la grille tarifaire
                           ne connaît que en_ligne / présentiel / domicile, et personne n'a
                           encore tranché ce que vaut l'heure d'une classe qui mélange les deux.
                           Le repli retenu est le plus cher des deux, pour ne pas sous-payer un
                           coach par défaut. À revoir dès que la règle existe. */
                        const typeKey = g.type_cours === "en_ligne" ? "en_ligne"
                          : g.type_cours === "domicile" ? "domicile"
                          : "presentiel";
                        const niveauGrp = niveauToGroupe(g.niveau);
                        const duree = g.duree_seance_h || 1.5;
                        const nbSeances = g.nb_seances_realisees ?? g.nb_seances ?? 0;
                        const nbSeancesTotal = g.nb_seances_total ?? g.nb_seances ?? 0;
                        const tarifH = grille.tarifs?.[gradeValide]?.[typeKey] || 0;
                        const mult   = grille.multiplicateurs?.[niveauGrp] || 1;
                        const tarifSeance  = Math.round(tarifH * duree * mult);
                        const honoraireRealise = Math.round(tarifSeance * nbSeances);
                        const honoraireTotal   = Math.round(tarifSeance * nbSeancesTotal);
                        return { g, typeKey, niveauGrp, duree, nbSeances, nbSeancesTotal, tarifH, mult, tarifSeance, honoraireRealise, honoraireTotal };
                      });

                      const totalRealiseGrille = lignes.reduce((s,l)=>s+l.honoraireRealise, 0);
                      const totalGrille        = lignes.reduce((s,l)=>s+l.honoraireTotal,   0);

                      const typeLabel = (k) => k==="en_ligne"?{icon:"💻",label:"En ligne"}:k==="domicile"?{icon:"🏠",label:"Domicile"}:{icon:"🏢",label:"Présentiel"};

                      return (
                        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                          {/* ── Filtre mois / année ── */}
                          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                            <button onClick={()=>{ setPaCoachHonMois(null); setPaCoachHonAnnee(null); fetchPaCoachGroupes(paSelectedCoach.id, null, null); }}
                              style={{ padding:"4px 11px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:!paCoachHonMois&&!paCoachHonAnnee?PA_COLOR:"#f1f5f9", color:!paCoachHonMois&&!paCoachHonAnnee?"#fff":"#64748b" }}>
                              Tous
                            </button>
                            {[{l:"Jan",v:1},{l:"Fév",v:2},{l:"Mar",v:3},{l:"Avr",v:4},{l:"Mai",v:5},{l:"Juin",v:6},{l:"Juil",v:7},{l:"Aoû",v:8},{l:"Sep",v:9},{l:"Oct",v:10},{l:"Nov",v:11},{l:"Déc",v:12}].map(m=>(
                              <button key={m.v}
                                onClick={()=>{
                                  const newAnnee = paCoachHonAnnee || new Date().getFullYear();
                                  setPaCoachHonMois(m.v); setPaCoachHonAnnee(newAnnee);
                                  fetchPaCoachGroupes(paSelectedCoach.id, m.v, newAnnee);
                                }}
                                style={{ padding:"4px 11px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:paCoachHonMois===m.v?PA_COLOR:"#f1f5f9", color:paCoachHonMois===m.v?"#fff":"#64748b" }}>
                                {m.l}
                              </button>
                            ))}
                            <div style={{ width:1, height:18, background:"#e5e7eb", margin:"0 2px" }} />
                            {[2024,2025,2026,2027].map(y=>(
                              <button key={y}
                                onClick={()=>{
                                  setPaCoachHonAnnee(y);
                                  fetchPaCoachGroupes(paSelectedCoach.id, paCoachHonMois, y);
                                }}
                                style={{ padding:"4px 11px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:paCoachHonAnnee===y?PA_COLOR:"#f1f5f9", color:paCoachHonAnnee===y?"#fff":"#64748b" }}>
                                {y}
                              </button>
                            ))}
                            {(paCoachHonMois||paCoachHonAnnee) && (
                              <span style={{ fontSize:11, color:"#64748b", marginLeft:4 }}>
                                - {paCoachHonMois?["Janv.","Févr.","Mars","Avr.","Mai","Juin","Juil.","Août","Sept.","Oct.","Nov.","Déc."][paCoachHonMois-1]:""}
                                {paCoachHonAnnee?` ${paCoachHonAnnee}`:""}
                              </span>
                            )}
                          </div>

                          {/* Entête grade + info grille */}
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                            <div>
                              <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Honoraires - {coach.prenom} {coach.nom}</h3>
                              <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Calculés selon la grille tarifaire BET</p>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", background:PA_LIGHT, borderRadius:10, border:`1.5px solid ${PA_COLOR}30` }}>
                              <span style={{ fontSize:13, fontWeight:700, color:PA_COLOR }}>Grade : {gradeValide}</span>
                              <span style={{ fontSize:11, color:"#64748b" }}>· taux grille</span>
                            </div>
                          </div>

                          {/* Récap taux grille pour ce grade */}
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                            {TYPES_COURS.map(t => {
                              const taux = grille.tarifs?.[gradeValide]?.[t.key] || 0;
                              return (
                                <div key={t.key} style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", border:"1px solid #e2e8f0" }}>
                                  <div style={{ fontSize:11, color:"#9ca3af", fontWeight:600, marginBottom:3 }}>{t.icon} {t.label}</div>
                                  <div style={{ fontSize:18, fontWeight:900, color:PA_COLOR }}>{formatMoney(taux)}<span style={{ fontSize:11, fontWeight:500, color:"#64748b" }}>/h</span></div>
                                </div>
                              );
                            })}
                          </div>

                          {/* KPIs totaux */}
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                            {[
                              { l:"Total estimé (toutes séances)",   v:formatMoney(totalGrille),        c:"#16a34a", bg:"#dcfce7" },
                              { l:"Honoraires réalisés",              v:formatMoney(totalRealiseGrille), c:"#0891b2", bg:"#e0f2fe" },
                              { l:"Reste à réaliser",                 v:formatMoney(Math.max(0, totalGrille-totalRealiseGrille)), c:"#d97706", bg:"#fef3c7" },
                            ].map(s=>(
                              <div key={s.l} style={{ background:s.bg, borderRadius:12, padding:"14px 16px" }}>
                                <div style={{ fontSize:11, color:s.c, fontWeight:600, marginBottom:4 }}>{s.l}</div>
                                <div style={{ fontSize:20, fontWeight:900, color:s.c }}>{s.v}</div>
                              </div>
                            ))}
                          </div>

                          {/* Tableau par classe */}
                          {paCoachGroupesLoading ? (
                            <div style={{ textAlign:"center", padding:"30px 0", color:"#9ca3af" }}>Chargement…</div>
                          ) : lignes.length === 0 ? (
                            <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>
                              <div style={{ fontSize:36, marginBottom:8 }}>🏫</div>
                              <div style={{ fontWeight:600 }}>Aucune classe - pas d'honoraires à calculer.</div>
                            </div>
                          ) : (() => {
                            const honorTotalPages = Math.max(1, Math.ceil(lignes.length / HONOR_PER_PAGE));
                            const honorPageSafe   = Math.min(honorairePage, honorTotalPages);
                            const honorPageItems  = lignes.slice((honorPageSafe - 1) * HONOR_PER_PAGE, honorPageSafe * HONOR_PER_PAGE);
                            const HonorPagBar = () => honorTotalPages <= 1 ? null : (
                              <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", padding:"10px 0" }}>
                                <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>Page {honorPageSafe}/{honorTotalPages} · {lignes.length} classe{lignes.length!==1?"s":""}</span>
                                <button onClick={()=>setHonorairePage(p=>Math.max(1,p-1))} disabled={honorPageSafe===1}
                                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:honorPageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:honorPageSafe===1?"default":"pointer", color:honorPageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
                                {Array.from({length:honorTotalPages},(_,i)=>i+1).map(p=>(
                                  <button key={p} onClick={()=>setHonorairePage(p)}
                                    style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===honorPageSafe?PA_COLOR:"#e2e8f0"}`, background:p===honorPageSafe?PA_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===honorPageSafe?"#fff":"#374151", fontWeight:p===honorPageSafe?800:400 }}>{p}</button>
                                ))}
                                <button onClick={()=>setHonorairePage(p=>Math.min(honorTotalPages,p+1))} disabled={honorPageSafe===honorTotalPages}
                                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:honorPageSafe===honorTotalPages?"#f1f5f9":"#fff", fontSize:12, cursor:honorPageSafe===honorTotalPages?"default":"pointer", color:honorPageSafe===honorTotalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
                              </div>
                            );
                            return (
                              <>
                                <HonorPagBar />
                                <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>
                                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                                    <thead>
                                      <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                                        {["Classe","Type","Niveau","Taux/h","×Mult.","Taux/séance","Séances réalisées","Honoraires réalisés","Total estimé"].map(h=>(
                                          <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:".03em" }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {honorPageItems.map(({ g, typeKey, niveauGrp, duree, nbSeances, nbSeancesTotal, tarifH, mult, tarifSeance, honoraireRealise, honoraireTotal }, idx) => {
                                        const tl = typeLabel(typeKey);
                                        const rowBg = idx%2===0?"#fff":"#fafafa";
                                        return (
                                          <tr key={g.id}
                                            style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer", transition:"background .15s" }}
                                            onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"0d"}
                                            onMouseLeave={e=>e.currentTarget.style.background=rowBg}
                                          >
                                            <td style={{ padding:"11px 12px", fontWeight:700, color:"#0f172a" }}>
                                              {g.nom||"-"}
                                              {g.filiere && <div style={{ fontSize:10, color:"#94a3b8", fontWeight:400, marginTop:1 }}>{g.filiere}</div>}
                                            </td>
                                            <td style={{ padding:"11px 12px" }}>
                                              <span style={{ fontSize:11, fontWeight:600, color:"#374151" }}>{tl.icon} {tl.label}</span>
                                            </td>
                                            <td style={{ padding:"11px 12px" }}>
                                              {g.niveau
                                                ? <span style={{ fontSize:11, fontWeight:800, padding:"2px 8px", borderRadius:999, background:PA_LIGHT, color:PA_COLOR }}>{g.niveau}</span>
                                                : <span style={{ color:"#94a3b8" }}>-</span>
                                              }
                                              <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>groupe {niveauGrp}</div>
                                            </td>
                                            <td style={{ padding:"11px 12px", fontWeight:700, color:"#374151" }}>
                                              {formatMoney(tarifH)}<span style={{ fontSize:10, color:"#9ca3af", fontWeight:400 }}>/h</span>
                                            </td>
                                            <td style={{ padding:"11px 12px", color:"#7c3aed", fontWeight:700 }}>
                                              ×{mult}
                                              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:400 }}>{duree}h/séance</div>
                                            </td>
                                            <td style={{ padding:"11px 12px", fontWeight:800, color:"#0891b2" }}>
                                              {formatMoney(tarifSeance)}
                                            </td>
                                            <td style={{ padding:"11px 12px", color:"#374151", fontWeight:700 }}>
                                              {nbSeances}
                                              {nbSeancesTotal > 0 && nbSeancesTotal !== nbSeances && (
                                                <span style={{ color:"#9ca3af", fontWeight:400 }}>/{nbSeancesTotal}</span>
                                              )}
                                            </td>
                                            <td style={{ padding:"11px 12px", fontWeight:800, color:"#0891b2" }}>
                                              {formatMoney(honoraireRealise)}
                                            </td>
                                            <td style={{ padding:"11px 12px", fontWeight:800, color:"#16a34a" }}>
                                              {formatMoney(honoraireTotal)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr style={{ background:"#f0fdf4", borderTop:"2px solid #bbf7d0" }}>
                                        <td colSpan={7} style={{ padding:"11px 12px", fontWeight:800, fontSize:13, color:"#374151" }}>
                                          Total - {lignes.length} classe{lignes.length!==1?"s":""}
                                        </td>
                                        <td style={{ padding:"11px 12px", fontWeight:900, fontSize:14, color:"#0891b2" }}>
                                          {formatMoney(totalRealiseGrille)}
                                        </td>
                                        <td style={{ padding:"11px 12px", fontWeight:900, fontSize:14, color:"#16a34a" }}>
                                          {formatMoney(totalGrille)}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                                <HonorPagBar />
                              </>
                            );
                          })()}

                          {/* Note grille */}
                          <div style={{ padding:"10px 14px", background:"#faf5ff", borderRadius:8, border:"1px solid #e9d5ff", fontSize:12, color:"#7c3aed" }}>
                            💡 Taux grille : {gradeValide} · Multiplicateurs niveaux - A1-A2 ×{grille.multiplicateurs?.["A1-A2"]||1} · B1-B2 ×{grille.multiplicateurs?.["B1-B2"]||1.2} · C1-C2 ×{grille.multiplicateurs?.["C1-C2"]||1.5}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ════ GROUPES ════ */}

                    {/* ════ RENOUVELLEMENT ════ */}
                    {/* ════ RENOUVELLEMENT ════ (désactivé temporairement)
                    {paCoachModalTab === "renouvellement" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                        <div>
                          <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Gestion des renouvellements</h3>
                          <p style={{ margin:"4px 0 0", fontSize:12, color:"#9ca3af" }}>Contrats arrivant à échéance dans les 60 jours ou en cours de renouvellement</p>
                        </div>
                        {contratsARenouveler.length===0 ? (
                          <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>
                            <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
                            <div style={{ fontWeight:600 }}>Aucun contrat à renouveler</div>
                            <div style={{ fontSize:12, marginTop:4 }}>Tous les contrats actifs ont plus de 60 jours restants.</div>
                          </div>
                        ) : contratsARenouveler.map(c => {
                          const fin = new Date(c.date_fin);
                          const joursRestants = Math.ceil((fin-today)/86400000);
                          const rCfg = c.renouvellement_statut ? (RENOUV_STATUT[c.renouvellement_statut]||RENOUV_STATUT.en_attente) : null;
                          const urgence = joursRestants<=0?"expired":joursRestants<=14?"critical":joursRestants<=30?"warning":"ok";
                          const urgCfg = { expired:{bg:"#fee2e2",c:"#dc2626",label:"Expiré"}, critical:{bg:"#fee2e2",c:"#dc2626",label:`${joursRestants}j restants`}, warning:{bg:"#fef3c7",c:"#d97706",label:`${joursRestants}j restants`}, ok:{bg:"#dcfce7",c:"#16a34a",label:`${joursRestants}j restants`} }[urgence];
                          return (
                            <div key={c.id} style={{ background:"#fff", border:`1.5px solid ${urgence==="expired"||urgence==="critical"?"#fca5a5":"#e5e7eb"}`, borderRadius:12, padding:"16px 18px" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                                <div>
                                  <div style={{ fontSize:15, fontWeight:800 }}>{c.apprenant_prenom||""} {c.apprenant_nom}</div>
                                  <div style={{ fontSize:12, color:"#6b7280", marginTop:3 }}>
                                    📅 {formatDate(c.date_debut)} → {formatDate(c.date_fin)} · {CONTRAT_TYPE[c.type_contrat]?.label||c.type_contrat}
                                  </div>
                                </div>
                                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                                  <span style={{ background:urgCfg.bg, color:urgCfg.c, borderRadius:99, padding:"3px 12px", fontSize:11, fontWeight:800 }}>{urgCfg.label}</span>
                                  {rCfg && <span style={{ background:rCfg.bg, color:rCfg.color, borderRadius:99, padding:"3px 12px", fontSize:11, fontWeight:800 }}>🔄 {rCfg.label}</span>}
                                </div>
                              </div>
                              <div style={{ background:"#f8fafc", borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
                                <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>Décision de renouvellement</div>
                                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                                  {!c.renouvellement_statut && (
                                    <button disabled={!peut("inscriptions","update")} title={permBtnTitle("Demander renouvellement",peut("inscriptions","update"))} onClick={()=>paPatchContrat(c.id,{ renouvellement_statut:"en_attente", renouvellement_demande_date:new Date().toISOString().slice(0,10) })}
                                      style={{ padding:"6px 14px", background:"#fef3c7", color:"#92400e", border:"1px solid #fcd34d", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer", opacity:peut("inscriptions","update")?1:0.6 }}>
                                      {peut("inscriptions","update")?"⏳":"🔒"} Demander renouvellement
                                    </button>
                                  )}
                                  {c.renouvellement_statut==="en_attente" && (<>
                                    <button disabled={!peut("inscriptions","update")} title={permBtnTitle("Confirmer - Renouveler",peut("inscriptions","update"))} onClick={()=>paPatchContrat(c.id,{ renouvellement_statut:"confirme", renouvellement_decision_date:new Date().toISOString().slice(0,10), statut:"renouvele" })}
                                      style={{ padding:"6px 14px", background:"#dcfce7", color:"#15803d", border:"1px solid #86efac", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer", opacity:peut("inscriptions","update")?1:0.6 }}>
                                      {peut("inscriptions","update")?"✅":"🔒"} Confirmer - Renouveler
                                    </button>
                                    <button disabled={!peut("inscriptions","update")} title={permBtnTitle("Refuser - Arrêter le contrat",peut("inscriptions","update"))} onClick={()=>paPatchContrat(c.id,{ renouvellement_statut:"refuse", renouvellement_decision_date:new Date().toISOString().slice(0,10), statut:"non_renouvele" })}
                                      style={{ padding:"6px 14px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer", opacity:peut("inscriptions","update")?1:0.6 }}>
                                      {peut("inscriptions","update")?"❌":"🔒"} Refuser - Arrêter le contrat
                                    </button>
                                  </>)}
                                  {c.renouvellement_statut==="confirme" && (
                                    <div style={{ fontSize:12, color:"#15803d", fontWeight:700 }}>✅ Contrat renouvelé · Décidé le {formatDate(c.renouvellement_decision_date)}</div>
                                  )}
                                  {c.renouvellement_statut==="refuse" && (
                                    <div style={{ fontSize:12, color:"#dc2626", fontWeight:700 }}>❌ Contrat non renouvelé · Décidé le {formatDate(c.renouvellement_decision_date)}</div>
                                  )}
                                </div>
                              </div>
                              {c.renouvellement_note!==undefined && (
                                <div style={{ marginTop:6 }}>
                                  <label style={{ fontSize:11, fontWeight:600, color:"#374151", display:"block", marginBottom:3 }}>Note renouvellement</label>
                                  <textarea defaultValue={c.renouvellement_note||""}
                                    onBlur={e=>{ if (peut("inscriptions","update")) paPatchContrat(c.id,{renouvellement_note:e.target.value}); }}
                                    disabled={!peut("inscriptions","update")}
                                    rows={2} placeholder="Motif, conditions…"
                                    style={{ width:"100%", padding:"7px 10px", border:"1.5px solid #e5e7eb", borderRadius:7, fontSize:12, resize:"vertical", boxSizing:"border-box", background:peut("inscriptions","update")?"#fff":"#f1f5f9", cursor:peut("inscriptions","update")?"text":"not-allowed" }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    */}

                    {/* ════ DISPONIBILITÉS ════ */}
                    {paCoachModalTab === "disponibilite" && (() => {
                      const JOURS_ORDER_PA = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
                      const MOIS_LABELS_PA = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
                      const now = new Date();
                      const estMoisReelCourantPA = paDispoMois === now.getMonth()+1 && paDispoAnnee === now.getFullYear();
                      const byJour = {};
                      paCoachDispoData.forEach(d => {
                        if (!d.jour) return;
                        if (!byJour[d.jour]) byJour[d.jour] = [];
                        byJour[d.jour].push(`${d.debut}–${d.fin}`);
                      });
                      const joursAvecDispo = JOURS_ORDER_PA.filter(j => (byJour[j]||[]).length > 0);
                      return (
                        <div>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>📅 Créneaux déclarés par le coach</div>
                              <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>Disponibilités renseignées dans l'Espace Professeur - mois par mois</div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <select value={paDispoMois} onChange={e=>setPaDispoMois(Number(e.target.value))}
                                style={{ padding:"6px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, fontWeight:600 }}>
                                {MOIS_LABELS_PA.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
                              </select>
                              <select value={paDispoAnnee} onChange={e=>setPaDispoAnnee(Number(e.target.value))}
                                style={{ padding:"6px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, fontWeight:600 }}>
                                {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(a=><option key={a} value={a}>{a}</option>)}
                              </select>
                              {estMoisReelCourantPA && <span style={{ fontSize:10, fontWeight:700, color:PA_COLOR, background:PA_LIGHT, padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap" }}>Mois courant</span>}
                              <button onClick={()=>fetchPaCoachDispos(coach.id, paDispoMois, paDispoAnnee)}
                                style={{ padding:"5px 12px", borderRadius:7, border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:12, color:"#374151" }}>
                                🔄 Actualiser
                              </button>
                            </div>
                          </div>

                          {!paCoachDispoLoading && joursAvecDispo.length === 0 && estMoisReelCourantPA && (
                            <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"10px 16px", marginBottom:14, color:"#991b1b", fontWeight:600, fontSize:12 }}>
                              ⚠️ Ce coach n'a pas encore renseigné ses disponibilités pour {MOIS_LABELS_PA[now.getMonth()]} {now.getFullYear()}.
                            </div>
                          )}

                          {paCoachDispoLoading && (
                            <div style={{ textAlign:"center", padding:40, color:"#9ca3af", fontSize:13 }}>Chargement des disponibilités…</div>
                          )}

                          {!paCoachDispoLoading && joursAvecDispo.length === 0 && (
                            <div style={{ textAlign:"center", padding:40, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", color:"#9ca3af" }}>
                              <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                              <div style={{ fontWeight:600, color:"#374151", marginBottom:4 }}>Aucun créneau renseigné pour {MOIS_LABELS_PA[paDispoMois-1]} {paDispoAnnee}</div>
                              <div style={{ fontSize:12 }}>Ce coach n'a pas configuré ses disponibilités pour ce mois dans son espace.</div>
                            </div>
                          )}

                          {!paCoachDispoLoading && joursAvecDispo.length > 0 && (
                            <>
                              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:10, marginBottom:14 }}>
                                {joursAvecDispo.map(jour => (
                                  <div key={jour} style={{ background:"#fff", border:`1.5px solid ${PA_COLOR}30`, borderRadius:12, padding:"12px 14px" }}>
                                    <div style={{ fontWeight:700, fontSize:12, color:PA_COLOR, marginBottom:8 }}>📅 {jour}</div>
                                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                                      {byJour[jour].map((c,i) => (
                                        <span key={i} style={{ background:PA_LIGHT, color:PA_COLOR, borderRadius:7, padding:"3px 10px", fontSize:12, fontWeight:600, width:"fit-content" }}>🕐 {c}</span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize:11, color:"#9ca3af", textAlign:"right" }}>
                                {paCoachDispoData.length} créneau{paCoachDispoData.length!==1?"x":""} · {joursAvecDispo.length} jour{joursAvecDispo.length!==1?"s":""} · {MOIS_LABELS_PA[paDispoMois-1]} {paDispoAnnee}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* ════ MODULES E-LEARNING ════ */}
                    {paCoachModalTab === "modules" && (() => {
                      const totalModules = paCoachCours.length;
                      const totalPublies = paCoachCours.filter(c=>c.statut==="publie").length;

                      // ── Filtre date sur created_at du cours ──
                      const coursFiltres = paCoachCours.filter(c => {
                        const d = c.created_at ? new Date(c.created_at) : null;
                        if (coursDateFrom && d && d < new Date(coursDateFrom)) return false;
                        if (coursDateTo   && d && d > new Date(coursDateTo + "T23:59:59")) return false;
                        return true;
                      });

                      // ── Pagination ──
                      const coursTotalPages = Math.max(1, Math.ceil(coursFiltres.length / COURS_PER_PAGE));
                      const coursPageSafe   = Math.min(coursPage, coursTotalPages);
                      const coursPageItems  = coursFiltres.slice((coursPageSafe - 1) * COURS_PER_PAGE, coursPageSafe * COURS_PER_PAGE);

                      const PaginationBar = () => coursTotalPages <= 1 ? null : (
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", marginTop:8 }}>
                          <span style={{ fontSize:12, color:"#64748b" }}>
                            Page {coursPageSafe} / {coursTotalPages} · {coursFiltres.length} cours{(coursDateFrom||coursDateTo)?" (filtrés)":""}
                          </span>
                          <div style={{ display:"flex", gap:4 }}>
                            <button onClick={()=>setCoursPage(p=>Math.max(1,p-1))} disabled={coursPageSafe===1}
                              style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:coursPageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:coursPageSafe===1?"default":"pointer", color:coursPageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
                            {Array.from({length:coursTotalPages},(_,i)=>i+1).map(p=>(
                              <button key={p} onClick={()=>setCoursPage(p)}
                                style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===coursPageSafe?PA_COLOR:"#e2e8f0"}`, background:p===coursPageSafe?PA_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===coursPageSafe?"#fff":"#374151", fontWeight:p===coursPageSafe?800:400 }}>{p}</button>
                            ))}
                            <button onClick={()=>setCoursPage(p=>Math.min(coursTotalPages,p+1))} disabled={coursPageSafe===coursTotalPages}
                              style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:coursPageSafe===coursTotalPages?"#f1f5f9":"#fff", fontSize:12, cursor:coursPageSafe===coursTotalPages?"default":"pointer", color:coursPageSafe===coursTotalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
                          </div>
                        </div>
                      );

                      return (
                        <div>
                          {/* ── En-tête + filtre date ── */}
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>🧩 Cours & modules créés par ce coach</div>
                              <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>
                                {totalModules} contenu{totalModules>1?"s":""} dont {totalPublies} publié{totalPublies>1?"s":""}
                              </div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                              <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>Créé du</label>
                              <input type="date" value={coursDateFrom} onChange={e=>{ setCoursDateFrom(e.target.value); setCoursPage(1); }}
                                style={{ padding:"5px 8px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
                              <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>au</label>
                              <input type="date" value={coursDateTo} onChange={e=>{ setCoursDateTo(e.target.value); setCoursPage(1); }}
                                style={{ padding:"5px 8px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
                              {(coursDateFrom||coursDateTo) && (
                                <button onClick={()=>{ setCoursDateFrom(""); setCoursDateTo(""); setCoursPage(1); }}
                                  style={{ fontSize:11, color:"#ef4444", background:"transparent", border:"none", cursor:"pointer", fontWeight:700 }}>✕</button>
                              )}
                              <button onClick={()=>fetchPaCoachCours(coach.id)}
                                style={{ padding:"5px 12px", borderRadius:7, border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:12, color:"#374151" }}>
                                🔄 Actualiser
                              </button>
                            </div>
                          </div>

                          {paCoachCoursLoading && (
                            <div style={{ textAlign:"center", padding:40, color:"#9ca3af", fontSize:13 }}>Chargement des cours…</div>
                          )}

                          {!paCoachCoursLoading && paCoachCours.length === 0 && (
                            <div style={{ textAlign:"center", padding:40, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", color:"#9ca3af" }}>
                              <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                              <div style={{ fontWeight:600, color:"#374151", marginBottom:4 }}>Aucun cours créé</div>
                              <div style={{ fontSize:12 }}>Ce coach n'a pas encore créé de cours e-learning.</div>
                            </div>
                          )}

                          {!paCoachCoursLoading && paCoachCours.length > 0 && coursFiltres.length === 0 && (
                            <div style={{ textAlign:"center", padding:32, color:"#9ca3af", fontSize:13 }}>
                              Aucun cours sur cette période.
                              <button onClick={()=>{ setCoursDateFrom(""); setCoursDateTo(""); setCoursPage(1); }}
                                style={{ marginLeft:8, fontSize:11, color:PA_COLOR, background:"transparent", border:"none", cursor:"pointer", fontWeight:700 }}>Effacer le filtre</button>
                            </div>
                          )}

                          {!paCoachCoursLoading && coursFiltres.length > 0 && (
                            <>
                              <PaginationBar />
                              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                                {coursPageItems.map(c => {
                                  // Le niveau « Cours » a été supprimé : un CONTENU est
                                  // l'unité, il vise plusieurs classes et porte ses parties
                                  // (blocs). Les champs emoji/couleur/niveau/modules_list
                                  // appartenaient au cours et valent désormais undefined.
                                  const tm = ({ lecon:{e:"📖",l:"Leçon",c:"#2563eb"}, audio:{e:"🎧",l:"Audio",c:"#7c3aed"}, video:{e:"🎬",l:"Vidéo",c:"#dc2626"} })[c.type_contenu]
                                    || { e:"📚", l:"Contenu", c:PA_COLOR };
                                  const nbBlocs = (c.blocs || []).length;
                                  const classes = c.groupe_noms || [];
                                  const publie  = c.statut === "publie";
                                  return (
                                    <div key={c.id} style={{ background:"#fff", border:`2px solid ${tm.c}30`, borderRadius:14, overflow:"hidden" }}>
                                      <div style={{ background:`${tm.c}10`, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, borderBottom:`1px solid ${tm.c}20` }}>
                                        <span style={{ fontSize:28 }}>{tm.e}</span>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontWeight:800, fontSize:14, color:"#0f172a" }}>{c.titre}</div>
                                          <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap" }}>
                                            <span style={{ padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700, background:`${tm.c}20`, color:tm.c }}>{tm.l}</span>
                                            {classes.length
                                              ? classes.map(n => <span key={n} style={{ padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700, background:"#dbeafe", color:"#1e40af" }}>🏫 {n}</span>)
                                              : <span style={{ padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:600, background:"#fef2f2", color:"#b91c1c" }}>⚠️ Aucune classe destinataire</span>
                                            }
                                            <span style={{ padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:600, background:"#f1f5f9", color:"#64748b" }}>{nbBlocs} partie{nbBlocs!==1?"s":""}</span>
                                            <span style={{ padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700, background:publie?"#dcfce7":"#fef9c3", color:publie?"#15803d":"#a16207" }}>{publie?"Publié":"Brouillon"}</span>
                                          </div>
                                        </div>
                                        <div style={{ textAlign:"right", fontSize:11, color:"#9ca3af", flexShrink:0 }}>
                                          <div>{c.dureeEstimee || 0} min</div>
                                          {c.created_at && <div style={{ marginTop:2, color:"#cbd5e1" }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>}
                                        </div>
                                      </div>

                                      {nbBlocs === 0 ? (
                                        <div style={{ padding:"12px 18px", color:"#9ca3af", fontSize:12, fontStyle:"italic" }}>Aucune partie dans ce contenu.</div>
                                      ) : (
                                        <div style={{ padding:"10px 18px", display:"flex", flexDirection:"column", gap:6 }}>
                                          {(c.blocs || []).map((b, i) => (
                                            <div key={b.id || i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, color:"#374151" }}>
                                              <span style={{ color:"#cbd5e1", fontWeight:700 }}>{i+1}.</span>
                                              <span style={{ flex:1 }}>{b.titre || "Sans titre"}</span>
                                              <span style={{ fontSize:11, color:"#9ca3af" }}>{b.type}{b.dureeMin?` · ${b.dureeMin}min`:""}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <PaginationBar />
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* ════ ACCÈS ════ */}
                    {paCoachModalTab === "acces" && (() => {
                      const handleToggleAcces = async () => {
                        const newBloque = !paCoachAccesBloque;
                        if (newBloque && !paCoachBloqueRaison.trim()) {
                          toast.error("Veuillez indiquer une raison avant de bloquer l'accès.");
                          return;
                        }
                        setPaCoachAccesLoading(true);
                        try {
                          const r = await fetch(`${API_URL}/api/coachs/${coach.id}/suspension`, {
                            method: "PATCH",
                            headers: { ...authHeaders(), "Content-Type": "application/json" },
                            body: JSON.stringify({ bloque: newBloque, raison: paCoachBloqueRaison, definitif: newBloque && paCoachSuspensionDefinitive }),
                          });
                          const d = await r.json();
                          if (!r.ok) {
                            if (r.status === 409 && (d.groupes_a_reaffecter || d.classes_a_reaffecter)) {
                              const items = [...(d.groupes_a_reaffecter||[]), ...(d.classes_a_reaffecter||[])].map(x => x.nom).join(", ");
                              toast.error(`${d.error} (${items})`);
                            } else {
                              toast.error(d.error || "Erreur");
                            }
                            return;
                          }
                          setPaCoachAccesBloque(newBloque);
                          setPaSelectedCoach(prev => ({ ...prev, acces_bloque: newBloque, actif: !newBloque }));
                          if (!newBloque) { setPaCoachBloqueRaison(""); setPaCoachSuspensionDefinitive(false); }
                          toast.success(newBloque ? "Accès coach bloqué." : "Accès coach rétabli.");
                        } catch { toast.error("Erreur réseau"); }
                        finally { setPaCoachAccesLoading(false); }
                      };

                      const fetchSessionsRestantes = async (groupeId) => {
                        if (!groupeId) { setPaCoachRemplSessions([]); setPaCoachRemplSessionsSelec([]); return; }
                        setPaCoachRemplSessionsLoading(true);
                        try {
                          // On filtre par groupe uniquement : toutes les sessions du groupe sont
                          // celles du coach bloqué (propriétaire du groupe), pas du remplaçant
                          const r = await fetch(
                            `${API_URL}/api/coachs/sessions-live/upcoming?groupe_id=${groupeId}`,
                            { headers: authHeaders() }
                          );
                          const d = r.ok ? await r.json() : { sessions: [] };
                          // Garder uniquement sessions non terminées (à venir ou planifiées)
                          const restantes = (d.sessions || []).filter(s => s.statut !== "terminee");
                          setPaCoachRemplSessions(restantes);
                          // Pré-sélectionner toutes les sessions restantes
                          setPaCoachRemplSessionsSelec(restantes.map(s => s.id));
                        } catch { setPaCoachRemplSessions([]); }
                        finally { setPaCoachRemplSessionsLoading(false); }
                      };

                      const handleCreerRemplacement = async () => {
                        if (paCoachRemplSaving) return;
                        const { remplacant_id, groupe_id, date_debut, motif } = paCoachRemplForm;
                        if (!remplacant_id || !groupe_id || !date_debut) {
                          toast.error("Remplaçant, groupe et date de début sont requis."); return;
                        }
                        const remplacant = paCoachsList.find(c => String(c.id) === String(remplacant_id));
                        const groupe     = paCoachGroupes.find(g => String(g.id) === String(groupe_id));
                        setPaCoachRemplSaving(true);
                        try {
                          const r = await fetch(`${API_URL}/api/remplacements`, {
                            method: "POST",
                            headers: { ...authHeaders(), "Content-Type": "application/json" },
                            body: JSON.stringify({
                              absent_id:      coach.id,
                              absent_nom:     `${coach.prenom} ${coach.nom}`,
                              groupe_id,
                              groupe_nom:     groupe?.nom || "-",
                              remplacant_id,
                              remplacant_nom: remplacant ? `${remplacant.prenom} ${remplacant.nom}` : "-",
                              date_debut,
                              date_fin:       paCoachRemplForm.date_fin || null,
                              motif:          motif || paCoachBloqueRaison || null,
                              sessions_ids:   paCoachRemplSessionsSelec,
                              nb_sessions:    paCoachRemplSessionsSelec.length,
                              statut:         "planifie",
                            }),
                          });
                          const d = await r.json();
                          if (!r.ok) { toast.error(d.error || "Erreur"); return; }

                          // Réassigner le groupe au coach remplaçant
                          if (remplacant_id && groupe_id) {
                            await fetch(`${API_URL}/api/groupes/${groupe_id}`, {
                              method: "PATCH",
                              headers: { ...authHeaders(), "Content-Type": "application/json" },
                              body: JSON.stringify({
                                coach_id:    remplacant_id,
                                coach_nom:   remplacant ? `${remplacant.prenom} ${remplacant.nom}` : null,
                                coach_email: remplacant?.email || null,
                              }),
                            }).catch(() => {});
                          }

                          toast.success("Remplacement enregistré et groupe réassigné.");
                          setPaCoachRemplacementsListe(prev => [d.remplacement || {}, ...prev]);
                          setPaCoachRemplForm({ remplacant_id:"", groupe_id:"", date_debut:"", date_fin:"", motif:"" });
                          setPaCoachRemplSessions([]);
                          setPaCoachRemplSessionsSelec([]);
                        } catch { toast.error("Erreur réseau"); }
                        finally { setPaCoachRemplSaving(false); }
                      };

                      const coachsDispos = paCoachsList.filter(c => String(c.id) !== String(coach.id));

                      return (
                        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                          {/* ── Statut accès ── */}
                          <div style={{ background: paCoachAccesBloque ? "#fef2f2" : "#f0fdf4", border:`1.5px solid ${paCoachAccesBloque?"#fca5a5":"#86efac"}`, borderRadius:14, padding:"18px 22px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                              <span style={{ fontSize:28 }}>{paCoachAccesBloque ? "🔒" : "🔓"}</span>
                              <div>
                                <div style={{ fontWeight:800, fontSize:15, color: paCoachAccesBloque ? "#dc2626" : "#16a34a" }}>
                                  {paCoachAccesBloque ? "Accès bloqué" : "Accès actif"}
                                </div>
                                <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                                  {paCoachAccesBloque
                                    ? "Ce coach ne peut plus se connecter à la plateforme."
                                    : "Ce coach a accès normal à la plateforme."}
                                </div>
                              </div>
                            </div>

                            {/* Raison (si bloquer) */}
                            {!paCoachAccesBloque && (
                              <div style={{ marginBottom:12 }}>
                                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>
                                  Raison du blocage <span style={{ color:"#ef4444" }}>*</span>
                                </label>
                                <textarea
                                  value={paCoachBloqueRaison}
                                  onChange={e => setPaCoachBloqueRaison(e.target.value)}
                                  placeholder="Ex : absences répétées non justifiées, comportement inapproprié…"
                                  rows={3}
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, resize:"vertical", boxSizing:"border-box", outline:"none" }}
                                />
                              </div>
                            )}

                            {!paCoachAccesBloque && (
                              <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, fontSize:12, color:"#374151", cursor:"pointer" }}>
                                <input type="checkbox" checked={paCoachSuspensionDefinitive} onChange={e=>setPaCoachSuspensionDefinitive(e.target.checked)} />
                                <span><strong>Suspension définitive</strong> (fin de collaboration) - exigera de transférer d'abord ses groupes/classes actifs à un autre coach.</span>
                              </label>
                            )}

                            <button
                              onClick={handleToggleAcces}
                              disabled={paCoachAccesLoading || !peut("classes","update")}
                              title={permBtnTitle(paCoachAccesBloque ? "Débloquer l'accès" : "Bloquer l'accès", peut("classes","update"))}
                              style={{
                                background: paCoachAccesBloque ? "#16a34a" : "#dc2626",
                                color:"#fff", border:"none", borderRadius:8,
                                padding:"9px 20px", fontWeight:700, fontSize:13,
                                cursor: (paCoachAccesLoading || !peut("classes","update")) ? "not-allowed" : "pointer",
                                opacity: (paCoachAccesLoading || !peut("classes","update")) ? .6 : 1,
                              }}
                            >
                              {paCoachAccesLoading
                                ? "En cours…"
                                : !peut("classes","update") ? "🔒 Accès coach"
                                : paCoachAccesBloque ? "🔓 Débloquer l'accès" : "🔒 Bloquer l'accès"}
                            </button>
                          </div>

                          {/* ── Remplacement (visible uniquement si coach bloqué) ── */}
                          {paCoachAccesBloque && <div style={{ background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:14, padding:"18px 22px" }}>
                            <div style={{ fontWeight:800, fontSize:14, color:"#0f172a", marginBottom:16 }}>👥 Désigner un remplaçant</div>

                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                              <div>
                                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Remplaçant <span style={{ color:"#ef4444" }}>*</span></label>
                                <select
                                  value={paCoachRemplForm.remplacant_id}
                                  onChange={e => setPaCoachRemplForm(p => ({ ...p, remplacant_id: e.target.value }))}
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, background:"#fff", outline:"none" }}
                                >
                                  <option value="">- Choisir un remplaçant -</option>
                                  {coachsDispos.map(c => (
                                    <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Groupe / Classe <span style={{ color:"#ef4444" }}>*</span></label>
                                <select
                                  value={paCoachRemplForm.groupe_id}
                                  onChange={e => {
                                    const gid = e.target.value;
                                    setPaCoachRemplForm(p => ({ ...p, groupe_id: gid }));
                                    fetchSessionsRestantes(gid);
                                  }}
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, background:"#fff", outline:"none" }}
                                >
                                  <option value="">- Choisir un groupe -</option>
                                  {paCoachGroupes.map(g => (
                                    <option key={g.id} value={g.id}>{g.nom}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Date début <span style={{ color:"#ef4444" }}>*</span></label>
                                <input type="date" value={paCoachRemplForm.date_debut}
                                  onChange={e => setPaCoachRemplForm(p => ({ ...p, date_debut: e.target.value }))}
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, outline:"none", boxSizing:"border-box" }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Date fin (optionnel)</label>
                                <input type="date" value={paCoachRemplForm.date_fin}
                                  onChange={e => setPaCoachRemplForm(p => ({ ...p, date_fin: e.target.value }))}
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, outline:"none", boxSizing:"border-box" }}
                                />
                              </div>
                            </div>

                            {/* ── Sessions restantes ── */}
                            {paCoachRemplForm.groupe_id && (
                              <div style={{ marginBottom:14, background:"#f8fafc", borderRadius:10, border:"1px solid #e5e7eb", padding:"14px 16px" }}>
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>
                                    📋 Sessions restantes
                                    {paCoachRemplSessions.length > 0 && (
                                      <span style={{ marginLeft:8, fontSize:11, color:"#6b7280", fontWeight:400 }}>
                                        {paCoachRemplSessionsSelec.length}/{paCoachRemplSessions.length} sélectionnées
                                      </span>
                                    )}
                                  </div>
                                  {paCoachRemplSessions.length > 0 && (
                                    <div style={{ display:"flex", gap:6 }}>
                                      <button
                                        onClick={() => setPaCoachRemplSessionsSelec(paCoachRemplSessions.map(s => s.id))}
                                        style={{ fontSize:11, padding:"4px 10px", borderRadius:7, border:`1.5px solid ${PA_COLOR}`, background:PA_COLOR+"15", color:PA_COLOR, fontWeight:700, cursor:"pointer" }}
                                      >Tout sélectionner</button>
                                      <button
                                        onClick={() => setPaCoachRemplSessionsSelec([])}
                                        style={{ fontSize:11, padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", color:"#6b7280", fontWeight:600, cursor:"pointer" }}
                                      >Tout désélectionner</button>
                                    </div>
                                  )}
                                </div>

                                {paCoachRemplSessionsLoading && (
                                  <div style={{ textAlign:"center", padding:"14px 0", color:"#9ca3af", fontSize:12 }}>Chargement des sessions…</div>
                                )}
                                {!paCoachRemplSessionsLoading && paCoachRemplSessions.length === 0 && (
                                  <div style={{ textAlign:"center", padding:"14px 0", color:"#9ca3af", fontSize:12 }}>
                                    Aucune session restante pour ce groupe.
                                  </div>
                                )}
                                {!paCoachRemplSessionsLoading && paCoachRemplSessions.length > 0 && (
                                  <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
                                    {paCoachRemplSessions.map(s => {
                                      const checked = paCoachRemplSessionsSelec.includes(s.id);
                                      const dateStr = s.date ? new Date(s.date).toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short", year:"numeric" }) : "-";
                                      const statutColor = s.statut === "planifiee" ? "#2563eb" : s.statut === "en_cours" ? "#d97706" : "#6b7280";
                                      return (
                                        <label key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", background: checked ? PA_COLOR+"0D" : "#fff", border:`1.5px solid ${checked ? PA_COLOR : "#e5e7eb"}`, borderRadius:8, cursor:"pointer", transition:"all .1s" }}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => {
                                              setPaCoachRemplSessionsSelec(prev =>
                                                checked ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                              );
                                            }}
                                            style={{ width:15, height:15, accentColor:PA_COLOR, flexShrink:0 }}
                                          />
                                          <div style={{ flex:1 }}>
                                            <div style={{ fontWeight:700, fontSize:12, color:"#0f172a" }}>
                                              {s.titre || "Session sans titre"}
                                            </div>
                                            <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>
                                              📅 {dateStr}
                                              {s.heure && ` · 🕐 ${s.heure}`}
                                              {s.duree && ` · ⏱ ${s.duree}h`}
                                            </div>
                                          </div>
                                          <span style={{ fontSize:10, fontWeight:700, color:statutColor, background:statutColor+"15", borderRadius:99, padding:"2px 8px", whiteSpace:"nowrap" }}>
                                            {s.statut === "planifiee" ? "Planifiée" : s.statut === "en_cours" ? "En cours" : s.statut}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            <div style={{ marginBottom:12 }}>
                              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Motif (optionnel)</label>
                              <input type="text" value={paCoachRemplForm.motif}
                                onChange={e => setPaCoachRemplForm(p => ({ ...p, motif: e.target.value }))}
                                placeholder="Ex : congé maladie, suspension…"
                                style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, outline:"none", boxSizing:"border-box" }}
                              />
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                              <button
                                onClick={handleCreerRemplacement}
                                disabled={paCoachRemplSaving||!peut("remplacements","create")}
                                title={permBtnTitle("Enregistrer le remplacement",peut("remplacements","create"))}
                                style={{ background:PA_COLOR, color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:700, fontSize:13, cursor: (paCoachRemplSaving||!peut("remplacements","create"))?"not-allowed":"pointer", opacity:(paCoachRemplSaving||!peut("remplacements","create"))?.6:1 }}
                              >
                                {paCoachRemplSaving ? "Enregistrement…" : !peut("remplacements","create") ? "🔒 Enregistrer le remplacement" : "✅ Enregistrer le remplacement"}
                              </button>
                              {paCoachRemplSessionsSelec.length > 0 && (
                                <span style={{ fontSize:12, color:"#6b7280" }}>
                                  {paCoachRemplSessionsSelec.length} session{paCoachRemplSessionsSelec.length > 1 ? "s" : ""} attribuée{paCoachRemplSessionsSelec.length > 1 ? "s" : ""} au remplaçant
                                </span>
                              )}
                            </div>
                          </div>}
                        </div>
                      );
                    })()}

                    {/* ════ HISTORIQUE (remplacements) ════ */}
                    {paCoachModalTab === "historique" && (() => {
                      const remplFiltres = paCoachRemplacementsListe.filter(r => {
                        const d = r.date_debut ? new Date(r.date_debut) : null;
                        if (historiqueRemplDateFrom && d && d < new Date(historiqueRemplDateFrom)) return false;
                        if (historiqueRemplDateTo   && d && d > new Date(historiqueRemplDateTo))   return false;
                        return true;
                      });
                      const remplTotalPages = Math.max(1, Math.ceil(remplFiltres.length / HISTORIQUE_REMPL_PER_PAGE));
                      const remplPageSafe   = Math.min(historiqueRemplPage, remplTotalPages);
                      const remplPage       = remplFiltres.slice((remplPageSafe-1)*HISTORIQUE_REMPL_PER_PAGE, remplPageSafe*HISTORIQUE_REMPL_PER_PAGE);
                      return (
                        <div>
                          <div style={{ marginBottom:14 }}>
                            <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>🕓 Historique des remplacements</h3>
                            <p style={{ margin:"4px 0 0", fontSize:12, color:"#9ca3af" }}>Tous les remplacements enregistrés pour ce coach</p>
                          </div>
                          {paCoachRemplacementsListe.length===0 ? (
                            <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>
                              <div style={{ fontSize:36, marginBottom:8 }}>🕓</div>
                              <div style={{ fontWeight:600 }}>Aucun remplacement enregistré</div>
                            </div>
                          ) : (
                            <div style={{ border:"1.5px solid #e2e8f0", borderRadius:14, overflow:"hidden" }}>
                              <div style={{ padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                <span style={{ fontSize:12, fontWeight:700, color:"#64748b" }}>
                                  {remplFiltres.length} remplacement{remplFiltres.length!==1?"s":""}
                                  {(historiqueRemplDateFrom||historiqueRemplDateTo) && <span style={{ marginLeft:4, fontSize:10, color:PA_COLOR }}>(filtrés)</span>}
                                </span>
                                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                                  <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>Du</label>
                                  <input type="date" value={historiqueRemplDateFrom} onChange={e=>{ setHistoriqueRemplDateFrom(e.target.value); setHistoriqueRemplPage(1); }}
                                    style={{ padding:"4px 8px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
                                  <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600 }}>au</label>
                                  <input type="date" value={historiqueRemplDateTo} onChange={e=>{ setHistoriqueRemplDateTo(e.target.value); setHistoriqueRemplPage(1); }}
                                    style={{ padding:"4px 8px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
                                  {(historiqueRemplDateFrom||historiqueRemplDateTo) && (
                                    <button onClick={()=>{ setHistoriqueRemplDateFrom(""); setHistoriqueRemplDateTo(""); setHistoriqueRemplPage(1); }}
                                      style={{ fontSize:11, color:"#ef4444", background:"transparent", border:"none", cursor:"pointer", fontWeight:700 }}>✕</button>
                                  )}
                                </div>
                              </div>
                              {remplTotalPages > 1 && (
                                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                                  <span style={{ fontSize:12, color:"#64748b" }}>Page {remplPageSafe} / {remplTotalPages}</span>
                                  <div style={{ display:"flex", gap:4 }}>
                                    <button onClick={()=>setHistoriqueRemplPage(p=>Math.max(1,p-1))} disabled={remplPageSafe===1}
                                      style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:remplPageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:remplPageSafe===1?"default":"pointer", color:remplPageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
                                    {Array.from({length:remplTotalPages},(_,i)=>i+1).map(p=>(
                                      <button key={p} onClick={()=>setHistoriqueRemplPage(p)}
                                        style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===remplPageSafe?PA_COLOR:"#e2e8f0"}`, background:p===remplPageSafe?PA_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===remplPageSafe?"#fff":"#374151", fontWeight:p===remplPageSafe?800:400 }}>{p}</button>
                                    ))}
                                    <button onClick={()=>setHistoriqueRemplPage(p=>Math.min(remplTotalPages,p+1))} disabled={remplPageSafe===remplTotalPages}
                                      style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:remplPageSafe===remplTotalPages?"#f1f5f9":"#fff", fontSize:12, cursor:remplPageSafe===remplTotalPages?"default":"pointer", color:remplPageSafe===remplTotalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
                                  </div>
                                </div>
                              )}
                              <div style={{ display:"flex", flexDirection:"column", gap:8, padding:"14px 16px" }}>
                                {remplPage.length===0 && (
                                  <div style={{ textAlign:"center", padding:"20px 0", color:"#9ca3af", fontSize:13 }}>Aucun remplacement sur cette période</div>
                                )}
                                {remplPage.map((r, i) => {
                                  const sColor = r.statut==="termine" ? "#16a34a" : r.statut==="en_cours" ? "#2563eb" : r.statut==="planifie" ? "#d97706" : "#dc2626";
                                  return (
                                    <div key={r.id || i} style={{ background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:12 }}>
                                      <div style={{ flex:1 }}>
                                        <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{r.groupe_nom || "-"}</div>
                                        <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                                          Remplaçant : <strong>{r.remplacant_nom || "Non assigné"}</strong>
                                          {r.date_debut && ` · Du ${new Date(r.date_debut).toLocaleDateString("fr-FR")}`}
                                          {r.date_fin   && ` au ${new Date(r.date_fin).toLocaleDateString("fr-FR")}`}
                                        </div>
                                        {r.motif && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{r.motif}</div>}
                                      </div>
                                      <span style={{ fontSize:11, fontWeight:700, color:sColor, background:sColor+"15", padding:"3px 10px", borderRadius:99, whiteSpace:"nowrap" }}>
                                        {r.statut === "termine" ? "✅ Terminé" : r.statut === "en_cours" ? "🔵 En cours" : r.statut === "planifie" ? "📅 Planifié" : "🔴 À pourvoir"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  </div>{/* fin contenu */}
                </div>
              </div>
            );
          })()}

            {/* ══ CONTENUS ══ */}
            {activeTab==="contenus" && (() => {
              const CATS_ONB = [
                { id:"bienvenue",     lib:"Présentation & Bienvenue", icone:"🎬", couleur:"#7C3AED" },
                { id:"regles",        lib:"Règles & Charte",          icone:"📋", couleur:"#0891B2" },
                { id:"processus",     lib:"Processus d'apprentissage",icone:"🗺️", couleur:"#059669" },
                { id:"certification", lib:"Certification",            icone:"🏆", couleur:"#F59E0B" },
              ];
              const itemsOnbFiltres = filtreCatOnb === "tous" ? contenusOnb : contenusOnb.filter(c => c.cat === filtreCatOnb);
              const totalVues = contenusOnb.reduce((s,c)=>s+(c.vues||0),0) + contenusVideos.reduce((s,v)=>s+(v.vues||0),0);
              const topContenus = [...contenusOnb.map(c=>({...c,_type:"onboarding"})), ...contenusVideos.map(v=>({...v,_type:"video"}))]
                .sort((a,b)=>(b.vues||0)-(a.vues||0)).slice(0,8);

              return (
              <div style={{ padding:"24px 0" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>Contenus</h2>
                    <p style={{ margin:"4px 0 0", fontSize:13, color:"#6b7280" }}>Guide de bienvenue diffusé à la première connexion, et bibliothèque de vidéos consultable à tout moment.</p>
                  </div>
                  <div style={{ display:"flex", gap:4, background:"#f1f5f9", borderRadius:10, padding:4, width:"fit-content" }}>
                    {[["bibliotheque","📚 Bibliothèque"],["upload","⬆️ Mise en ligne"],["stats","📈 Statistiques"],["minijeux","🎮 Mini-jeux"]].map(([id,lib]) => (
                      <button key={id} onClick={()=>setContenusSousTab(id)} style={{ padding:"8px 16px", borderRadius:7, border:"none", fontSize:12, fontWeight:700, cursor:"pointer",
                        background:contenusSousTab===id?"#fff":"transparent", color:contenusSousTab===id?C:"#64748b",
                        boxShadow:contenusSousTab===id?"0 1px 6px rgba(0,0,0,.08)":"none" }}>{lib}</button>
                    ))}
                  </div>
                </div>

                {contenusLoading && <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>⏳ Chargement…</div>}

                {/* ══ SOUS-ONGLET BIBLIOTHÈQUE ══ */}
                {!contenusLoading && contenusSousTab === "bibliotheque" && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                      <h3 style={{ margin:0, fontSize:15, fontWeight:800, color:"#0f172a" }}>📚 Contenus d'onboarding</h3>
                      <button disabled={!peut("contenus_ressources","create")} title={permBtnTitle("Ajouter un contenu",peut("contenus_ressources","create"))} onClick={ouvrirCreationContenuOnb} style={permBtnStyle(btnP,peut("contenus_ressources","create"))}>{peut("contenus_ressources","create")?"+":"🔒"} Ajouter un contenu</button>
                    </div>

                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
                      <button onClick={()=>setFiltreCatOnb("tous")} style={{ padding:"7px 16px", borderRadius:20, border:"1.5px solid", fontSize:12, fontWeight:700, cursor:"pointer",
                        background:filtreCatOnb==="tous"?"#0f172a":"#fff", color:filtreCatOnb==="tous"?"#fff":"#374151", borderColor:filtreCatOnb==="tous"?"#0f172a":"#e5e7eb" }}>
                        Tous ({contenusOnb.length})
                      </button>
                      {CATS_ONB.map(cat => {
                        const n = contenusOnb.filter(c=>c.cat===cat.id).length;
                        const actif = filtreCatOnb === cat.id;
                        return (
                          <button key={cat.id} onClick={()=>setFiltreCatOnb(cat.id)} style={{ padding:"7px 16px", borderRadius:20, border:"1.5px solid", fontSize:12, fontWeight:700, cursor:"pointer",
                            background:actif?cat.couleur:"#fff", color:actif?"#fff":"#374151", borderColor:actif?cat.couleur:"#e5e7eb" }}>
                            {cat.icone} {cat.lib} ({n})
                          </button>
                        );
                      })}
                    </div>

                    {itemsOnbFiltres.length === 0 ? (
                      <div style={{ textAlign:"center", padding:40, color:"#9ca3af", background:"#f8fafc", borderRadius:12, marginBottom:32 }}>
                        <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
                        Aucun contenu pour ce filtre.
                      </div>
                    ) : (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14, marginBottom:32 }}>
                        {itemsOnbFiltres.map(c => {
                          const cat = CATS_ONB.find(x=>x.id===c.cat);
                          return (
                            <div key={c.id} style={{ background:"#fff", border:"1px solid #e5e7eb", borderTop:`4px solid ${cat?.couleur||"#94a3b8"}`, borderRadius:10, padding:"14px 16px" }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:4 }}>{c.type==='video'?'🎬':c.type==='audio'?'🎧':c.type==='image'?'🖼️':'📄'} {c.titre}</div>
                              <div style={{ fontSize:11, color:"#9ca3af", marginBottom:12 }}>{[c.detail, c.created_at?.slice(0,10)].filter(Boolean).join(" · ")}</div>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, fontSize:11, color:"#6b7280" }}>
                                <span>👁 {c.vues} vue{c.vues!==1?"s":""}</span>
                                <Badge label={c.visible?"Visible":"Masqué"} color={c.visible?"#166534":"#6b7280"} bg={c.visible?"#dcfce7":"#f1f5f9"} />
                              </div>
                              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                <button disabled={!peut("contenus_ressources","update")} title={permBtnTitle("Modifier",peut("contenus_ressources","update"))} onClick={()=>ouvrirEditionContenuOnb(c)} style={permBtnStyle({ ...btnS, padding:"5px 10px", fontSize:11 },peut("contenus_ressources","update"))}>{peut("contenus_ressources","update")?"✏️":"🔒"} Modifier</button>
                                <button disabled={!peut("contenus_ressources","update")} title={permBtnTitle(c.visible?"Masquer":"Publier",peut("contenus_ressources","update"))} onClick={()=>toggleVisibContenuOnb(c)} style={permBtnStyle({ ...btnS, padding:"5px 10px", fontSize:11 },peut("contenus_ressources","update"))}>{peut("contenus_ressources","update")?(c.visible?"🔒 Masquer":"👁 Publier"):"🔒"}</button>
                                <button disabled={contenuActionLoading.has(c.id)||!peut("contenus_ressources","delete")} title={permBtnTitle("Supprimer",peut("contenus_ressources","delete"))} onClick={()=>supprimerContenuOnb(c.id)} style={{ padding:"5px 10px", fontSize:11, background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", borderRadius:8, cursor:(contenuActionLoading.has(c.id)||!peut("contenus_ressources","delete"))?"not-allowed":"pointer", fontWeight:600, opacity:(contenuActionLoading.has(c.id)||!peut("contenus_ressources","delete"))?0.45:1 }}>{peut("contenus_ressources","delete")?"🗑":"🔒"}</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10, borderTop:"1px solid #e5e7eb", paddingTop:24 }}>
                      <div>
                        <h3 style={{ margin:0, fontSize:15, fontWeight:800, color:"#0f172a" }}>🌍 Bibliothèque de vidéos</h3>
                        <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Accessible à tout moment, indépendamment des étapes d'onboarding.</p>
                      </div>
                      <button disabled={!peut("contenus_biblio","create")} title={permBtnTitle("Ajouter",peut("contenus_biblio","create"))} onClick={ouvrirCreationVideo} style={permBtnStyle({ ...btnP, background:"#F97316" },peut("contenus_biblio","create"))}>{peut("contenus_biblio","create")?"+":"🔒"} Ajouter</button>
                    </div>

                    {contenusVideos.length === 0 ? (
                      <div style={{ textAlign:"center", padding:40, color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>
                        <div style={{ fontSize:36, marginBottom:8 }}>🎬</div>
                        Aucune vidéo dans la bibliothèque pour le moment.
                      </div>
                    ) : (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
                        {contenusVideos.map(v => (
                          <div key={v.id} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"14px 16px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                              <span style={{ fontSize:18 }}>{v.icone || "🎬"}</span>
                              <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{v.titre}</span>
                            </div>
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                              {v.cible && <Badge label={v.cible==="tous"?"Tous":v.cible==="enfant"?"👶 Enfants":v.cible==="etudiant"?"🎒 Étudiants":"👔 Adultes"} color="#7c3aed" bg="#f5f3ff" />}
                              {v.type && <Badge label={v.type} color="#374151" bg="#f1f5f9" />}
                              {v.duree && <span style={{ fontSize:11, color:"#9ca3af" }}>⏱ {v.duree}</span>}
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, fontSize:11, color:"#6b7280" }}>
                              <span>👁 {v.vues} vue{v.vues!==1?"s":""}</span>
                              <Badge label={v.visible?"Visible":"Masqué"} color={v.visible?"#166534":"#6b7280"} bg={v.visible?"#dcfce7":"#f1f5f9"} />
                            </div>
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                              <button disabled={!peut("contenus_biblio","update")} title={permBtnTitle("Modifier",peut("contenus_biblio","update"))} onClick={()=>ouvrirEditionVideo(v)} style={permBtnStyle({ ...btnS, padding:"5px 10px", fontSize:11 },peut("contenus_biblio","update"))}>{peut("contenus_biblio","update")?"✏️":"🔒"} Modifier</button>
                              <button disabled={!peut("contenus_biblio","update")} title={permBtnTitle(v.visible?"Masquer":"Publier",peut("contenus_biblio","update"))} onClick={()=>toggleVisibVideo(v)} style={permBtnStyle({ ...btnS, padding:"5px 10px", fontSize:11 },peut("contenus_biblio","update"))}>{peut("contenus_biblio","update")?(v.visible?"🔒 Masquer":"👁 Publier"):"🔒"}</button>
                              <button disabled={videoActionLoading.has(v.id)||!peut("contenus_biblio","delete")} title={permBtnTitle("Supprimer",peut("contenus_biblio","delete"))} onClick={()=>supprimerVideo(v.id)} style={{ padding:"5px 10px", fontSize:11, background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", borderRadius:8, cursor:(videoActionLoading.has(v.id)||!peut("contenus_biblio","delete"))?"not-allowed":"pointer", fontWeight:600, opacity:(videoActionLoading.has(v.id)||!peut("contenus_biblio","delete"))?0.45:1 }}>{peut("contenus_biblio","delete")?"🗑":"🔒"}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ══ SOUS-ONGLET MISE EN LIGNE ══ */}
                {!contenusLoading && contenusSousTab === "upload" && (
                  <div style={{ maxWidth:560 }}>
                    <h3 style={{ margin:"0 0 14px", fontSize:15, fontWeight:800, color:"#0f172a" }}>⬆️ Mettre un contenu en ligne</h3>
                    <div style={{ marginBottom:16 }}>
                      <label style={lbl}>Destination</label>
                      <div style={{ display:"flex", gap:4, background:"#f1f5f9", borderRadius:10, padding:4, width:"fit-content" }}>
                        {[["onboarding","📖 Étape d'onboarding"],["video","🎬 Bibliothèque de vidéos"]].map(([id,libD]) => (
                          <button key={id} onClick={()=>setUploadDestination(id)} style={{ padding:"8px 16px", borderRadius:7, border:"none", fontSize:12, fontWeight:700, cursor:"pointer",
                            background:uploadDestination===id?"#fff":"transparent", color:uploadDestination===id?C:"#64748b",
                            boxShadow:uploadDestination===id?"0 1px 6px rgba(0,0,0,.08)":"none" }}>{libD}</button>
                        ))}
                      </div>
                    </div>

                    {uploadDestination === "onboarding" ? (
                      <div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Titre *</label>
                          <input style={inp} value={contenuOnbForm.titre} onChange={e=>setContenuOnbForm(f=>({...f,titre:e.target.value}))} placeholder="Ex : Vidéo de bienvenue" />
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Description</label>
                          <textarea style={{ ...inp, resize:"vertical" }} rows={3} value={contenuOnbForm.detail} onChange={e=>setContenuOnbForm(f=>({...f,detail:e.target.value}))} placeholder="Ce que contient ce document, à qui il s'adresse, quand le consulter…" />
                        </div>
                        <div style={{ display:"flex", gap:12, marginBottom:12 }}>
                          <div style={{ flex:1 }}>
                            <label style={lbl}>Étape</label>
                            <select style={inp} value={contenuOnbForm.cat} onChange={e=>setContenuOnbForm(f=>({...f,cat:e.target.value}))}>
                              <option value="bienvenue">Présentation & Bienvenue</option>
                              <option value="regles">Règles & Charte</option>
                              <option value="processus">Processus d'apprentissage</option>
                              <option value="certification">Certification</option>
                            </select>
                          </div>
                          <div style={{ flex:1 }}>
                            <label style={lbl}>Type</label>
                            <select style={inp} value={contenuOnbForm.type} onChange={e=>setContenuOnbForm(f=>({...f,type:e.target.value, fichier:null}))}>
                              <option value="pdf">PDF</option>
                              <option value="video">Vidéo</option>
                              <option value="audio">Audio</option>
                              <option value="image">Image</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Catégorie du client - le message de bienvenue diffère selon le type de coaching</label>
                          <select style={inp} value={contenuOnbForm.cible_coaching} onChange={e=>setContenuOnbForm(f=>({...f,cible_coaching:e.target.value}))}>
                            <option value="tous">Tous les apprenants</option>
                            <option value="particulier">Particulier (cours en groupe)</option>
                            <option value="prive">Coaching privé</option>
                          </select>
                        </div>
                        {/* Le champ lien n'existait que pour les vidéos : une image ou un PDF déjà
                            hébergé ailleurs ne pouvait pas être référencé, et à l'édition l'URL
                            enregistrée n'était visible nulle part. */}
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>{LIBELLE_LIEN_CONTENU[contenuOnbForm.type] || "Lien du fichier"} - ou un fichier ci-dessous</label>
                          <input style={inp} value={contenuOnbForm.lienVideo} onChange={e=>setContenuOnbForm(f=>({...f,lienVideo:e.target.value, fichier:null}))} placeholder="https://..." />
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Fichier</label>
                          <input type="file" accept={contenuOnbForm.type==="video"?"video/*":contenuOnbForm.type==="audio"?"audio/*":contenuOnbForm.type==="image"?"image/*":".pdf"} onChange={e=>setContenuOnbForm(f=>({...f,fichier:e.target.files[0]||null}))} style={inp} />
                          <p style={{ fontSize:11, color:"#94a3b8", margin:"5px 0 0" }}>
                            {libelleLimite("contenu", contenuOnbForm.fichier?.type || (contenuOnbForm.type==="video"?"video/mp4":contenuOnbForm.type==="audio"?"audio/mpeg":contenuOnbForm.type==="image"?"image/jpeg":"application/pdf"))}
                            {contenuOnbForm.fichier ? " · Le fichier choisi remplacera le lien ci-dessus." : ""}
                          </p>
                        </div>
                        <div style={{ marginBottom:16 }}>
                          <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, cursor:"pointer" }}>
                            <input type="checkbox" checked={contenuOnbForm.visible} onChange={e=>setContenuOnbForm(f=>({...f,visible:e.target.checked}))} />
                            Publier immédiatement (visible par les apprenants)
                          </label>
                        </div>
                        {contenuUploading && contenuProgress > 0 && (
                          <div style={{ marginBottom:12 }}>
                            <div style={{ height:6, background:"#e2e8f0", borderRadius:20, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${contenuProgress}%`, background:C, transition:"width .2s" }} />
                            </div>
                            <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>Envoi en cours - {contenuProgress}%</div>
                          </div>
                        )}
                        <button onClick={async ()=>{ await enregistrerContenuOnb(); setContenusSousTab("bibliotheque"); }} disabled={contenuUploading||!peut("contenus_ressources",editingContenuOnbId?"update":"create")} title={permBtnTitle("Publier ce contenu",peut("contenus_ressources",editingContenuOnbId?"update":"create"))} style={permBtnStyle({ ...btnP, opacity:contenuUploading?0.6:1, cursor:contenuUploading?"not-allowed":"pointer" },peut("contenus_ressources",editingContenuOnbId?"update":"create"))}>{contenuUploading?"⏳ Envoi…":peut("contenus_ressources",editingContenuOnbId?"update":"create")?"✅ Publier ce contenu":"🔒 Publier ce contenu"}</button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Titre *</label>
                          <input style={inp} value={videoForm.titre} onChange={e=>setVideoForm(f=>({...f,titre:e.target.value}))} placeholder="Ex : Astuces pour progresser en anglais" />
                        </div>
                        <div style={{ display:"flex", gap:12, marginBottom:12 }}>
                          <div style={{ flex:1 }}>
                            <label style={lbl}>Type</label>
                            <select style={inp} value={videoForm.type} onChange={e=>setVideoForm(f=>({...f,type:e.target.value, fichier:null}))}>
                              <option value="video">Vidéo</option>
                              <option value="audio">Audio</option>
                            </select>
                          </div>
                          <div style={{ flex:1 }}>
                            <label style={lbl}>Durée</label>
                            <input style={inp} value={videoForm.duree} onChange={e=>setVideoForm(f=>({...f,duree:e.target.value}))} placeholder="Ex : 5 min" />
                          </div>
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Public visé</label>
                          <select style={inp} value={videoForm.cible} onChange={e=>setVideoForm(f=>({...f,cible:e.target.value}))}>
                            <option value="tous">Tous les apprenants</option>
                            <option value="enfant">Enfants</option>
                            <option value="etudiant">Étudiants / Adolescents</option>
                            <option value="adulte">Adultes</option>
                          </select>
                        </div>
                        <div style={{ display:"flex", gap:12, marginBottom:12 }}>
                          <div style={{ flex:1 }}>
                            <label style={lbl}>Niveau (optionnel)</label>
                            <input style={inp} value={videoForm.niveau} onChange={e=>setVideoForm(f=>({...f,niveau:e.target.value}))} placeholder="Ex : B1" />
                          </div>
                          <div style={{ flex:1 }}>
                            <label style={lbl}>Icône</label>
                            <input style={inp} value={videoForm.icone} onChange={e=>setVideoForm(f=>({...f,icone:e.target.value}))} placeholder="🎬" />
                          </div>
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>{videoForm.type === "audio" ? "Lien audio" : "Lien vidéo (YouTube, Vimeo…)"} - ou un fichier ci-dessous</label>
                          <input style={inp} value={videoForm.lienVideo} onChange={e=>setVideoForm(f=>({...f,lienVideo:e.target.value, fichier:null}))} placeholder="https://..." />
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Fichier</label>
                          <input type="file" accept={videoForm.type==="video"?"video/*":"audio/*"} onChange={e=>setVideoForm(f=>({...f,fichier:e.target.files[0]||null}))} style={inp} />
                        </div>
                        <div style={{ marginBottom:16 }}>
                          <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, cursor:"pointer" }}>
                            <input type="checkbox" checked={videoForm.visible} onChange={e=>setVideoForm(f=>({...f,visible:e.target.checked}))} />
                            Publier immédiatement (visible par les apprenants)
                          </label>
                        </div>
                        <button onClick={async ()=>{ await enregistrerVideo(); setContenusSousTab("bibliotheque"); }} disabled={contenuUploading||!peut("contenus_biblio",editingVideoId?"update":"create")} title={permBtnTitle("Publier cette vidéo",peut("contenus_biblio",editingVideoId?"update":"create"))} style={permBtnStyle({ ...btnP, background:"#F97316", opacity:contenuUploading?0.6:1, cursor:contenuUploading?"not-allowed":"pointer" },peut("contenus_biblio",editingVideoId?"update":"create"))}>{contenuUploading?"⏳ Envoi…":peut("contenus_biblio",editingVideoId?"update":"create")?"✅ Publier cette vidéo":"🔒 Publier cette vidéo"}</button>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ SOUS-ONGLET STATISTIQUES ══ */}
                {!contenusLoading && contenusSousTab === "stats" && (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
                      <KpiCard icon="📚" label="Contenus onboarding" value={contenusOnb.length} color="#7C3AED" />
                      <KpiCard icon="🎬" label="Vidéos bibliothèque" value={contenusVideos.length} color="#F97316" />
                      <KpiCard icon="👁" label="Vues totales" value={totalVues} color="#0891B2" />
                      <KpiCard icon="✅" label="Contenus publiés" value={contenusOnb.filter(c=>c.visible).length + contenusVideos.filter(v=>v.visible).length} color="#059669" />
                    </div>
                    <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800, color:"#0f172a" }}>Contenus les plus consultés</h3>
                    {topContenus.length === 0 ? (
                      <div style={{ textAlign:"center", padding:30, color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>Aucune donnée pour le moment.</div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {topContenus.map((c,i) => (
                          <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"10px 14px" }}>
                            <span style={{ fontSize:12, fontWeight:800, color:"#9ca3af", width:20 }}>#{i+1}</span>
                            <span style={{ fontSize:16 }}>{c.type==='video'?'🎬':c.type==='audio'?'🎧':c.type==='image'?'🖼️':c.icone||'📄'}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{c.titre}</div>
                              <div style={{ fontSize:11, color:"#9ca3af" }}>{c._type === "onboarding" ? "Onboarding" : "Bibliothèque vidéos"}</div>
                            </div>
                            <div style={{ fontSize:13, fontWeight:800, color:C }}>{c.vues} 👁</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ══ SOUS-ONGLET MINI-JEUX ══ */}
                {!contenusLoading && contenusSousTab === "minijeux" && (() => {
                  const GROUPES_CIBLE = [
                    { id:"enfant",   label:"🧒 Enfants",       couleur:"#F97316", bg:"#FFF7ED", bord:"#FED7AA" },
                    { id:"etudiant", label:"🎒 Étudiants",     couleur:"#8B5CF6", bg:"#F5F3FF", bord:"#DDD6FE" },
                    { id:"adulte",   label:"👔 Adultes",       couleur:"#0891B2", bg:"#ECFEFF", bord:"#A5F3FC" },
                    { id:"tous",     label:"🌐 Tous niveaux",  couleur:"#2563EB", bg:"#EFF6FF", bord:"#BFDBFE" },
                  ];
                  const totalActifs = jeuxMiniAdmin.filter(j=>j.actif).length;
                  const totalParties = jeuxMiniAdmin.reduce((s,j)=>s+(j.parties_jouees||0),0);
                  const scoresAvecParties = jeuxMiniAdmin.filter(j=>j.parties_jouees>0);
                  const scoreMoyenGlobal = scoresAvecParties.length ? Math.round(scoresAvecParties.reduce((s,j)=>s+Number(j.score_moyen||0),0)/scoresAvecParties.length) : null;
                  const tentativesMin = jeuxMiniAdmin.length ? Math.min(...jeuxMiniAdmin.map(j=>j.max_tentatives)) : 0;
                  const tentativesMax = jeuxMiniAdmin.length ? Math.max(...jeuxMiniAdmin.map(j=>j.max_tentatives)) : 0;

                  const toggleSw = (actif, onClick, allowed=true) => (
                    <button disabled={!allowed} title={permBtnTitle("",allowed)} onClick={onClick} style={{ position:"relative", width:38, height:20, borderRadius:20, border:"none", background:actif?"#22c55e":"#e2e8f0", cursor:allowed?"pointer":"not-allowed", flexShrink:0, transition:"background .15s", opacity:allowed?1:0.45, filter:allowed?"none":"grayscale(70%)" }}>
                      <span style={{ position:"absolute", top:2, left:actif?20:2, width:16, height:16, borderRadius:"50%", background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,0.3)", transition:"left .15s" }} />
                    </button>
                  );

                  return (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                      <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:"#0f172a" }}>🎮 Gestion des mini-jeux</h3>
                      <button disabled={!peut("contenus_minijeux","create")} title={permBtnTitle("Créer un jeu",peut("contenus_minijeux","create"))} onClick={ouvrirCreationMiniJeu} style={permBtnStyle({ ...btnP, background:"#F97316" },peut("contenus_minijeux","create"))}>{peut("contenus_minijeux","create")?"+":"🔒"} Créer un jeu</button>
                    </div>

                    <div style={{ display:"flex", gap:12, alignItems:"flex-start", background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:10, padding:"14px 18px", marginBottom:20 }}>
                      <span style={{ fontSize:20 }}>📋</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#92400E", marginBottom:2 }}>Règle d'utilisation des mini-jeux</div>
                        <div style={{ fontSize:12, color:"#92400E" }}>L'apprenant dispose d'un nombre de tentatives <strong>réglable par jeu</strong> (colonne "Tentatives" dans le tableau ci-dessous, 1 à 10). Au-delà, le jeu est 🔒 verrouillé - seule l'équipe Onboarding/PA peut réinitialiser les tentatives d'un apprenant.</div>
                      </div>
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
                      <KpiCard icon="✅" label="Jeux actifs" value={`${totalActifs} – ${jeuxMiniAdmin.length}`} color="#059669" />
                      <KpiCard icon="🎮" label="Total parties" value={totalParties} color="#F97316" />
                      <KpiCard icon="📊" label="Score moyen" value={scoreMoyenGlobal!=null?`${scoreMoyenGlobal}%`:"-"} color="#7C3AED" />
                      <KpiCard icon="🔁" label="Tentatives (min-max)" value={jeuxMiniAdmin.length?`${tentativesMin}-${tentativesMax}`:"-"} color="#0891B2" />
                    </div>

                    {jeuxMiniAdmin.length === 0 ? (
                      <div style={{ textAlign:"center", padding:40, color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>
                        <div style={{ fontSize:36, marginBottom:8 }}>🎮</div>
                        Aucun mini-jeu dans le catalogue pour le moment.
                      </div>
                    ) : GROUPES_CIBLE.map(groupe => {
                      const jeuxGroupe = jeuxMiniAdmin.filter(j => j.cible === groupe.id);
                      if (jeuxGroupe.length === 0) return null;
                      const actifsGroupe = jeuxGroupe.filter(j=>j.actif).length;
                      return (
                        <div key={groupe.id} style={{ marginBottom:28 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:groupe.bg, border:`1px solid ${groupe.bord}`, borderRadius:10, padding:"10px 16px", marginBottom:10 }}>
                            <span style={{ fontSize:14, fontWeight:800, color:groupe.couleur }}>{groupe.label}</span>
                            <span style={{ fontSize:12, fontWeight:700, color:groupe.couleur }}>{actifsGroupe} actif{actifsGroupe!==1?"s":""} / {jeuxGroupe.length}</span>
                          </div>
                          <div className="table-wrap" style={{ overflowX:"auto", border:"1px solid #e5e7eb", borderRadius:10 }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                              <thead>
                                <tr style={{ textAlign:"left", background:"#f8fafc", borderBottom:"1px solid #e5e7eb" }}>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Jeu</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Type</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Cible</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Parties</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Score moy.</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Tentatives</th>
                                  <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Statut / Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {jeuxGroupe.map(j => {
                                  const info = TYPES_JEUX_DASH.find(t=>t.id===j.type);
                                  return (
                                    <tr key={j.id} style={{ borderBottom:"1px solid #f1f5f9", opacity:j.actif?1:0.55 }}>
                                      <td style={{ padding:"10px 12px" }}>
                                        <div style={{ fontWeight:700, color:"#0f172a", cursor:"pointer" }} onClick={()=>ouvrirDetailsMiniJeu(j)}>{j.nom} <span style={{ fontSize:11 }}>📊</span></div>
                                        {j.nb_questions && <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>{j.nb_questions} questions</div>}
                                      </td>
                                      <td style={{ padding:"10px 12px" }}>
                                        <span style={{ padding:"3px 10px", borderRadius:20, background:"#f5f3ff", color:"#7c3aed", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{info?.icone} {info?.lib}</span>
                                      </td>
                                      <td style={{ padding:"10px 12px", color:"#374151" }}>{j.cible}</td>
                                      <td style={{ padding:"10px 12px", color:"#F97316", fontWeight:700 }}>{j.parties_jouees}</td>
                                      <td style={{ padding:"10px 12px", fontWeight:700, color:j.parties_jouees>0?"#059669":"#9ca3af" }}>{j.parties_jouees>0?`${Number(j.score_moyen||0)}%`:"-"}</td>
                                      <td style={{ padding:"10px 12px" }}>
                                        <input type="number" min={1} max={10} defaultValue={j.max_tentatives} onBlur={e=>{ if (peut("contenus_minijeux","update")) modifierTentativesMiniJeu(j.id, e.target.value); }}
                                          disabled={!peut("contenus_minijeux","update")}
                                          title={permBtnTitle("Modifier le nombre de tentatives",peut("contenus_minijeux","update"))}
                                          style={{ width:56, padding:"6px 8px", borderRadius:6, border:"1px solid #d1d5db", fontSize:13, textAlign:"center", background:peut("contenus_minijeux","update")?"#fff":"#f1f5f9", cursor:peut("contenus_minijeux","update")?"text":"not-allowed" }} />
                                      </td>
                                      <td style={{ padding:"10px 12px" }}>
                                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                          {toggleSw(j.actif, ()=>toggleActifMiniJeu(j), peut("contenus_minijeux","update"))}
                                          <span style={{ fontSize:12, fontWeight:700, color:j.actif?"#166534":"#9ca3af" }}>{j.actif?"Actif":"Inactif"}</span>
                                          <button disabled={!peut("contenus_minijeux","update")} onClick={()=>ouvrirEditionMiniJeu(j)} title={permBtnTitle("Modifier",peut("contenus_minijeux","update"))} style={{ background:"none", border:"none", cursor:peut("contenus_minijeux","update")?"pointer":"not-allowed", fontSize:14, opacity:peut("contenus_minijeux","update")?1:0.45 }}>{peut("contenus_minijeux","update")?"✏️":"🔒"}</button>
                                          <button disabled={miniJeuActionLoading.has(j.id)||!peut("contenus_minijeux","update")} title={permBtnTitle("Réinitialiser",peut("contenus_minijeux","update"))} onClick={()=>reinitialiserMiniJeu(j.id)} style={permBtnStyle({ padding:"4px 9px", fontSize:11, borderRadius:6, border:"1px solid #e5e7eb", background:"#fff", color:"#374151", cursor:miniJeuActionLoading.has(j.id)?"not-allowed":"pointer", fontWeight:600, opacity:miniJeuActionLoading.has(j.id)?0.5:1 },peut("contenus_minijeux","update"))}>🔁 Réinit.</button>
                                          <button disabled={miniJeuActionLoading.has(j.id)||!peut("contenus_minijeux","delete")} title={permBtnTitle("Supprimer",peut("contenus_minijeux","delete"))} onClick={()=>supprimerMiniJeu(j.id)} style={{ background:"none", border:"none", cursor:(miniJeuActionLoading.has(j.id)||!peut("contenus_minijeux","delete"))?"not-allowed":"pointer", fontSize:14, color:"#dc2626", opacity:(miniJeuActionLoading.has(j.id)||!peut("contenus_minijeux","delete"))?0.45:1 }}>{peut("contenus_minijeux","delete")?"🗑":"🔒"}</button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
              </div>
              );
            })()}

            {/* ══ NOTIFICATIONS ══ */}
            {activeTab==="notifications" && (
              <div style={{ padding: "24px 0" }}>
                <NotificationsTab userId={profil?.id} accentColor="#7c3aed" />
              </div>
            )}

            {/* ══ ARCHIVES ══ (désactivé temporairement)
            {activeTab==="archives" && (
              <ArchiveTab accentColor={C} />
            )}
            */}

            {/* ══ MESSAGES ══ */}
            {activeTab==="messages" && (
              <div style={{ padding:"0 0 32px" }}>
                {/* Deux canaux distincts : la messagerie privée parle à une personne, le chat
                    de classe parle à TOUS ses apprenants. Les séparer évite de confondre
                    une relance individuelle avec une annonce collective. */}
                <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e7eb", marginBottom:18 }}>
                  {[{ key:"prive", label:"💬 Messagerie privée", badge:0 },
                    { key:"groupe", label:"👥 Chat de classe", badge: chatGroupeNonLus },
                    // Les groupes LIBRES, ceux qui ne suivent pas une classe. Sans cet onglet, une
                    // personne ajoutée à un groupe recevait la notification sans avoir nulle part
                    // où ouvrir le fil - c'est ce qui a été constaté.
                    { key:"libre", label:"💬 Groupes", badge: groupesLibresNonLus }].map(t => (
                    <button key={t.key} onClick={() => setMsgSubTab(t.key)}
                      style={{ padding:"10px 20px", border:"none", borderBottom: msgSubTab===t.key ? `2px solid ${C}` : "2px solid transparent", marginBottom:-1, fontSize:13, fontWeight:600, cursor:"pointer", background:"transparent", color: msgSubTab===t.key ? C : "#64748b" }}>
                      {t.label}
                    {t.badge > 0 && (
                      <span style={{ marginLeft:7, display:"inline-block", minWidth:18, padding:"1px 6px", borderRadius:99, background:"#dc2626", color:"#fff", fontSize:10.5, fontWeight:800, lineHeight:"16px", textAlign:"center" }}>
                        {t.badge > 99 ? "99+" : t.badge}
                      </span>
                    )}
                    </button>
                  ))}
                </div>
                {msgSubTab === "prive" ? <MessagerieTab accentColor={C} /> : msgSubTab === "libre" ? (
                  <GroupesLibres profil={profil} token={localStorage.getItem("admin_token")} accent={C} />
                ) : (
                  <ChatGroupe
                    groupes={groupes}
                    profil={profil}
                    token={localStorage.getItem("admin_token")}
                    accent={C}
                  />
                )}
              </div>
            )}

          </div>
        </div>
      </div>

                {/* ── CREATE GROUPE MODAL - même modèle que "Nouvelle classe" chez l'assistante
                     présentiel (CommercialDashboard.jsx) : cartes coach avec disponibilités
                     réelles du mois, plutôt qu'un simple select. ── */}
                {showCreateGroupe && (() => {
                  const q = groupeCoachSearch.toLowerCase();
                  const niveauGroupe = groupeForm.niveau || "";
                  const filteredCoachsGrp = coaches
                    .filter(c => {
                      if (!q) return true;
                      const name = [c.prenom, c.nom].filter(Boolean).join(" ").toLowerCase();
                      return name.includes(q) || (c.grade||"").toLowerCase().includes(q) ||
                        (c.specialites||[]).join(" ").toLowerCase().includes(q);
                    })
                    .sort((a,b) => {
                      const aC = niveauGroupe && (a.niveaux_enseignes||[]).includes(niveauGroupe);
                      const bC = niveauGroupe && (b.niveaux_enseignes||[]).includes(niveauGroupe);
                      if (aC && !bC) return -1;
                      if (!aC && bC) return 1;
                      return 0;
                    });
                  return (
                  <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.6)",zIndex:1300,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}
                    onClick={e => { if (e.target === e.currentTarget) setShowCreateGroupe(false); }}>
                    <div style={{ background:"#fff",borderRadius:16,width:"90vw",maxWidth:"90vw",height:"90vh",maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,0.25)" }}>

                      {/* Header */}
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid #e5e7eb",flex:"0 0 auto" }}>
                        <h3 style={{ margin:0,fontSize:15,fontWeight:800,color:"#0f172a" }}>👥 Nouveau groupe</h3>
                        <button onClick={()=>setShowCreateGroupe(false)} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#6b7280" }}>✕</button>
                      </div>

                      <div style={{ padding:"20px 24px",overflowY:"auto",flex:"1 1 auto" }}>
                        <div style={{ display:"grid", gap:14 }}>
                          {/* Nom */}
                          <div>
                            <label style={lbl}>Nom du groupe *</label>
                            <input style={inp} value={groupeForm.nom} onChange={e=>setGroupeForm(f=>({...f,nom:e.target.value}))} placeholder="ex: Anglais Pro B2 - Mardi/Jeudi" />
                          </div>
                          {/* Photo - la même que celle du fil de discussion de la classe. */}
                          <ChampPhotoClasse
                            valeur={groupeForm.photo_url || null}
                            onChange={url => setGroupeForm(f => ({ ...f, photo_url: url }))}
                            nom={groupeForm.nom}
                            accent={_C0} />
                          {/* Filière + Niveau */}
                          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                            <div>
                              <label style={lbl}>Filière</label>
                              {filieresCatalogue.length > 0 ? (
                                <select style={inp} value={groupeForm.filiere} onChange={e=>setGroupeForm(f=>({...f,filiere:e.target.value}))}>
                                  <option value="">- Sélectionner -</option>
                                  {filieresCatalogue.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                              ) : (
                                <>
                                  <input style={inp} value={groupeForm.filiere} placeholder="Libellé exact de l'offre"
                                    onChange={e=>setGroupeForm(f=>({...f,filiere:e.target.value}))} />
                                  <div style={{ fontSize:10, color:"#b45309", marginTop:3 }}>
                                    Catalogue indisponible - saisissez le libellé exact d'une offre, sinon les
                                    inscriptions de ce groupe seront exclues des statistiques.
                                  </div>
                                </>
                              )}
                            </div>
                            <div>
                              <label style={lbl}>Niveau CECRL</label>
                              <select style={inp} value={groupeForm.niveau} onChange={e=>setGroupeForm(f=>({...f,niveau:e.target.value}))}>
                                <option value="">- Sélectionner -</option>
                                {Object.keys(NIVEAUX).map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                          </div>
                          {/* Type de cours. HYBRIDE EST DÉSORMAIS PROPOSÉ : des apprenants
                              suivent une partie de leurs séances en ligne et l'autre au centre.
                              Une classe hybride reste UNE classe - c'est chaque SÉANCE qui se
                              tient d'une façon ou de l'autre. Le Présentiel seul reste grisé :
                              l'onboarding ne gère pas de classe uniquement présentielle. */}
                          <div>
                            <label style={lbl}>Type de cours</label>
                            <div style={{ display:"flex", gap:8 }}>
                              {TYPE_COURS_GRP.map(t => {
                                const disabled = t.id !== "en_ligne" && t.id !== "hybride";
                                return (
                                  <button key={t.id} disabled={disabled} onClick={() => !disabled && setGroupeForm(f=>({...f,type_cours:t.id}))}
                                    style={{ flex:1, padding:"8px 12px", borderRadius:8, fontSize:12, fontWeight:700, cursor: disabled ? "not-allowed" : "pointer",
                                      border: groupeForm.type_cours===t.id ? `2px solid ${C}` : "1px solid #e2e8f0",
                                      background: disabled ? "#f1f5f9" : groupeForm.type_cours===t.id ? C_LIGHT : "#f8fafc",
                                      color: disabled ? "#94a3b8" : groupeForm.type_cours===t.id ? C : "#64748b",
                                      opacity: disabled ? 0.7 : 1 }}>{t.label}</button>
                                );
                              })}
                            </div>
                          </div>
                          {/* Dates */}
                          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                            <div>
                              <label style={lbl}>Date début</label>
                              <input type="date" style={inp} value={groupeForm.date_debut} onChange={e=>setGroupeForm(f=>({...f,date_debut:e.target.value}))} />
                            </div>
                            <div>
                              <label style={lbl}>Date fin</label>
                              <input type="date" style={inp} value={groupeForm.date_fin} onChange={e=>setGroupeForm(f=>({...f,date_fin:e.target.value}))} />
                            </div>
                          </div>
                          {/* Horaires */}
                          <div>
                            <label style={lbl}>Horaires</label>
                            <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap" }}>
                              <select style={{ ...inp,width:"auto",flex:"0 0 80px" }} value={horaireTmp.jour} onChange={e=>setHoraireTmp(h=>({...h,jour:e.target.value}))}>
                                {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(j=><option key={j} value={j}>{j}</option>)}
                              </select>
                              <input type="time" style={{ ...inp,width:"auto",flex:"0 0 100px" }} value={horaireTmp.debut} onChange={e=>setHoraireTmp(h=>({...h,debut:e.target.value}))} />
                              <span style={{ fontSize:12,color:"#6b7280",flexShrink:0 }}>→</span>
                              <input type="time" style={{ ...inp,width:"auto",flex:"0 0 100px" }} value={horaireTmp.fin} onChange={e=>setHoraireTmp(h=>({...h,fin:e.target.value}))} />
                              <button onClick={()=>setGroupeForm(f=>({...f,horaire:[...f.horaire,{...horaireTmp}]}))} style={{ ...btnP,flexShrink:0,whiteSpace:"nowrap" }}>+ Ajouter</button>
                            </div>
                            {groupeForm.horaire.length>0 && (
                              <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                                {groupeForm.horaire.map((h,i)=>(
                                  <span key={i} style={{ padding:"3px 10px",borderRadius:8,background:C_LIGHT,color:C,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5 }}>
                                    {h.jour} {h.debut}–{h.fin}
                                    <button onClick={()=>setGroupeForm(f=>({...f,horaire:f.horaire.filter((_,j)=>j!==i)}))} style={{ background:"none",border:"none",cursor:"pointer",color:C,fontWeight:900,fontSize:13,padding:0,lineHeight:1 }}>×</button>
                                  </span>
                                ))}
                              </div>
                            )}
                            {groupeForm.horaire.length === 0 && (
                              <div style={{ fontSize:11, color:"#94a3b8", marginTop:5 }}>Aucun créneau ajouté - le groupe sera sans horaire fixe</div>
                            )}
                          </div>
                          {/* Capacité */}
                          <div>
                            <label style={lbl}>Capacité max (apprenants)</label>
                            <input type="number" min={1} max={50} style={{ ...inp, width:120 }} value={groupeForm.capacite_max} onChange={e=>setGroupeForm(f=>({...f,capacite_max:Number(e.target.value)}))} />
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex",justifyContent:"flex-end",gap:10,padding:"14px 24px",borderTop:"1px solid #e5e7eb",flex:"0 0 auto" }}>
                        <button onClick={()=>setShowCreateGroupe(false)} style={btnS}>Annuler</button>
                        <button onClick={createGroupe} disabled={groupeSaving||!peut("classes","create")} title={permBtnTitle("Créer le groupe",peut("classes","create"))} style={permBtnStyle({ ...btnP,opacity:groupeSaving?0.7:1 },peut("classes","create"))}>{groupeSaving?"Création…":peut("classes","create")?"✅ Créer le groupe":"🔒 Créer le groupe"}</button>
                      </div>
                    </div>
                  </div>
                  );
                })()}

      {/* ══ MODAL TRANSFERT DE GROUPE ══
          HORS DES ONGLETS, et c'est essentiel : il vivait dans le bloc de l'onglet Groupes,
          donc React ne le montait que lorsque cet onglet était affiché. Depuis « Dossiers à
          réaffecter », l'état s'ouvrait bien mais rien n'apparaissait - le bouton semblait mort.
          Un modal appelé depuis plusieurs écrans appartient au rendu, pas à l'un d'eux. */}
              {showTransfert && selectedApprenantGroupe && (
                <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.75)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:12 }}
                  onClick={()=>setShowTransfert(false)}>
                  <div style={{ background:"#fff",borderRadius:18,width:"90vw",height:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,0.35)",overflow:"hidden" }}
                    onClick={e=>e.stopPropagation()}>

                    {/* Header */}
                    <div style={{ background:C_GRAD,borderRadius:"18px 18px 0 0",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0 }}>
                      <div>
                        <div style={{ color:"#c4b5fd",fontSize:11,fontWeight:700,marginBottom:3 }}>CHANGEMENT DE PROGRAMME</div>
                        <div style={{ color:"#fff",fontSize:16,fontWeight:800 }}>🔄 {selectedApprenantGroupe.prenom_apprenant} {selectedApprenantGroupe.nom_apprenant}</div>
                        <div style={{ color:"#c4b5fd",fontSize:12,marginTop:2 }}>Groupe actuel : {selectedGroupe?.nom||"-"} · Niveau {selectedApprenantGroupe.niveau||"-"}</div>
                      </div>
                      <button onClick={()=>setShowTransfert(false)} style={{ background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:20,width:36,height:36,borderRadius:"50%",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
                    </div>

                    {/* Corps scrollable */}
                    <div style={{ flex:1,overflowY:"auto",padding:"24px" }}>

                      {/* MIGRATION DE CANAL — le contexte, puis le tarif. L'assistante qui
                          accepte ne connaît pas forcément le dossier : lui dire d'où part
                          l'apprenant et où il va évite qu'elle le cherche ailleurs. */}
                      {/* LES DEUX CIRCUITS SANS TEST, chacun annoncé pour ce qu'il est. Le
                          bandeau disait « Migration de canal » quel que soit le type : sur un
                          transfert d'Angré à Yopougon, il annonçait un changement de canal qui
                          n'a pas lieu, et taisait le seul qui compte. Le champ de tarif, lui,
                          vaut pour les deux - deux centres ne pratiquent pas le même prix,
                          comme deux canaux. */}
                      {(() => {
                        /* Le tarif vaut pour les TROIS circuits : un changement de classe
                           peut lui aussi changer le prix. Même bloc que chez la commerciale. */
                        const t = demandeEnCours?.type_demande;
                        if (!t) return null;
                        const centre = t === "changement_centre";
                        const migration = t === "changement_coaching";
                        return (
                          <>
                            <div style={{ background: centre ? "#e0f2fe" : migration ? "#f2edfb" : "#f0fdf4",
                              border: `1px solid ${centre ? "#bae6fd" : migration ? "#ddd0f5" : "#bbf7d0"}`, borderRadius:10,
                              padding:"11px 14px", marginBottom:14, fontSize:12.5,
                              color: centre ? "#075985" : migration ? "#5b3a94" : "#15803d", lineHeight:1.6 }}>
                              {centre ? (
                                <>🏢 <strong>Transfert de centre</strong> — aucun test de niveau requis.
                                L'apprenant garde son niveau, son historique et toutes ses données :
                                seuls sa classe et son centre changent.</>
                              ) : migration ? (
                                <>🔀 <strong>Migration de canal</strong> — aucun test de niveau requis.
                                L'apprenant garde son niveau, son historique et toutes ses données :
                                seules sa classe et son canal changent.</>
                              ) : (
                                <>🔄 <strong>Changement de classe</strong> — le niveau est revenu du test.
                                L'apprenant garde son historique et toutes ses données ; ajustez la
                                mensualité ci-dessous si la nouvelle classe n'a pas le même tarif.</>
                              )}
                            </div>
                            <ChampTarifMigration
                              plan={planMigration}
                              valeur={nouvelleMensualite}
                              onChange={setNouvelleMensualite}
                              desLeMoisEnCours={tarifDesLeMoisEnCours}
                              onChangeDesLeMoisEnCours={setTarifDesLeMoisEnCours} />
                          </>
                        );
                      })()}

                      {/* Motif */}
                      <div style={{ marginBottom:20 }}>
                        <label style={{ display:"block",fontSize:12,fontWeight:700,color:"#374151",marginBottom:6 }}>Motif / contexte (optionnel)</label>
                        <textarea
                          value={transfertForm.motif}
                          onChange={e=>setTransfertForm(f=>({...f,motif:e.target.value}))}
                          rows={2}
                          placeholder="Ex: Changement d'horaires de travail, déménagement, …"
                          style={{ width:"100%",padding:"9px 12px",border:"1.5px solid #e5e7eb",borderRadius:8,fontSize:13,resize:"vertical",boxSizing:"border-box" }}
                        />
                      </div>

                      {/* Sélection du groupe cible */}
                      <div>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:10 }}>
                          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                            <label style={{ fontSize:12,fontWeight:700,color:"#374151" }}>Groupes compatibles - Niveau</label>
                            <select value={transfertNiveauCible} onChange={e=>{ setTransfertNiveauCible(e.target.value); searchGroupesCibles(e.target.value); }}
                              style={{ padding:"5px 10px",borderRadius:7,border:"1.5px solid #e5e7eb",fontSize:12,fontWeight:700,color:C,background:"#fff" }}>
                              {/* "Tous niveaux" en tête : c'est la valeur par défaut, et le cas
                                  courant - restreindre à un niveau est le choix particulier. */}
                              <option value="tous">Tous niveaux</option>
                              {["A1","A2","B1","B2","C1","C2"].map(n=><option key={n} value={n}>{n}</option>)}
                            </select>
                            <span style={{ fontSize:11,color:"#9ca3af" }}>Niveau actuel de l'apprenant : {selectedApprenantGroupe.niveau||"-"}</span>
                          </div>
                          <div style={{ display:"flex",gap:8 }}>
                            <button onClick={()=>{
                              setGroupeForm({ nom:"", niveau: transfertNiveauCible!=="tous" ? transfertNiveauCible : (selectedApprenantGroupe.niveau||""), filiere:"", type_cours:"en_ligne", coach_id:"", date_debut:"", date_fin:"", capacite_max:20, horaire:[], photo_url:null });
                              setGroupeCoachSearch("");
                              fetchCoachsDispos(coaches.map(c=>c.id));
                              setShowCreateGroupe(true);
                            }}
                              style={{ padding:"5px 12px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:11 }}>
                              + Nouvelle classe
                            </button>
                            <button onClick={()=>searchGroupesCibles(transfertNiveauCible)}
                              style={{ padding:"5px 12px",background:"#ede9fe",color:"#7c3aed",border:"none",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:11 }}>
                              🔄 Actualiser
                            </button>
                          </div>
                        </div>

                        {groupesCiblesLoading && <p style={{ textAlign:"center",color:"#9ca3af",padding:20 }}>Recherche des groupes…</p>}
                        {!groupesCiblesLoading && groupesCibles.length===0 && (
                          <div style={{ textAlign:"center",padding:24,background:"#f8fafc",borderRadius:10,border:"1px solid #e5e7eb",color:"#9ca3af",fontSize:13 }}>
                            Aucun groupe actif {transfertNiveauCible!=="tous" ? `de niveau ${transfertNiveauCible}` : ""} trouvé.
                          </div>
                        )}
                        {!groupesCiblesLoading && groupesCibles.length>0 && (
                          <div style={{ display:"grid",gap:10 }}>
                            {groupesCibles.map(g=>{
                              const sel = transfertForm.nouveau_groupe_id===g.id;
                              const TYPE_ICO = { prive:"🔒",en_ligne:"💻",domicile:"🏠",centre:"🏢" };
                              // Dernier repli qui affirmait « Centre » pour toute valeur inattendue.
                              const typeLabel = iconeEtTexteTypeCours(g).texte;
                              return (
                                <div key={g.id} onClick={()=>setTransfertForm(f=>({...f,nouveau_groupe_id:g.id}))}
                                  style={{ padding:"14px 16px",borderRadius:12,border:`2px solid ${sel?"#7c3aed":"#e5e7eb"}`,
                                    background:sel?"#faf5ff":"#fff",cursor:"pointer",transition:"all .15s" }}>
                                  {/* En-tête : nom, badges, effectif */}
                                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10 }}>
                                    <div style={{ display:"flex",gap:10,alignItems:"center",minWidth:0 }}>
                                      <div style={{ width:38,height:38,borderRadius:"50%",background:sel?"#7c3aed":"#ede9fe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0 }}>
                                        {sel?"✅":"👥"}
                                      </div>
                                      <div style={{ minWidth:0 }}>
                                        <div style={{ fontWeight:800,fontSize:14,color:sel?"#7c3aed":"#0f172a" }}>{g.nom}</div>
                                        <div style={{ display:"flex",gap:6,marginTop:3,flexWrap:"wrap" }}>
                                          {g.niveau && <span style={{ fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:99,background:"#1e3a8a",color:"#fff" }}>{g.niveau}</span>}
                                          <span style={{ fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#ede9fe",color:"#7c3aed" }}>{TYPE_ICO[g.type_cours]||"🏢"} {typeLabel}</span>
                                          {g.filiere && <span style={{ fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:"#f1f5f9",color:"#374151" }}>{g.filiere}</span>}
                                        </div>
                                      </div>
                                    </div>
                                    <span style={{ padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,whiteSpace:"nowrap",
                                      background:g.statut==="actif"?"#dcfce7":"#f1f5f9",
                                      color:g.statut==="actif"?"#166534":"#6b7280" }}>
                                      {g.nb_apprenants||0}/{g.capacite_max||20} appr.
                                    </span>
                                  </div>
                                  {/* Détails : coach, centre, dates */}
                                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10 }}>
                                    <div>
                                      <div style={{ fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>Coach</div>
                                      <div style={{ fontSize:12,fontWeight:600,color:"#0f172a" }}>{g.coach_nom||g.nom_coach||"Non assigné"}</div>
                                      {g.coach_telephone && <div style={{ fontSize:10,color:"#0891b2" }}>📞 {g.coach_telephone}</div>}
                                    </div>
                                    {g.centre_nom && (
                                      <div>
                                        <div style={{ fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>Centre</div>
                                        <div style={{ fontSize:12,fontWeight:600,color:"#0f172a" }}>📍 {g.centre_nom}{g.centre_ville?` · ${g.centre_ville}`:""}</div>
                                      </div>
                                    )}
                                    {(g.date_debut||g.date_fin) && (
                                      <div>
                                        <div style={{ fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:2 }}>Période</div>
                                        <div style={{ fontSize:12,fontWeight:600,color:"#0f172a" }}>
                                          {g.date_debut?new Date(g.date_debut).toLocaleDateString("fr-FR"):"-"}{g.date_fin?` → ${new Date(g.date_fin).toLocaleDateString("fr-FR")}`:""}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  {/* Horaires */}
                                  {g.horaire?.length>0 && (
                                    <div style={{ marginTop:10 }}>
                                      <div style={{ fontSize:9,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",marginBottom:5 }}>Horaires</div>
                                      <div style={{ display:"flex",flexWrap:"wrap",gap:5 }}>
                                        {g.horaire.map((h,i)=>(
                                          <span key={i} style={{ padding:"2px 9px",borderRadius:99,background:"#eff6ff",color:"#1e3a8a",fontSize:10.5,fontWeight:700,border:"1px solid #bfdbfe" }}>🕐 {fmtHoraire(h)}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ padding:"16px 24px",borderTop:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10 }}>
                      <button onClick={()=>setShowTransfert(false)}
                        style={{ padding:"10px 20px",background:"#f1f5f9",color:"#374151",border:"none",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:13 }}>
                        Annuler
                      </button>

                      {/* CLÔTURER LA CLASSE QUITTÉE SI ELLE SE VIDE. Une classe de coaching
                          privé n'existe que pour ses apprenants : le dernier parti, elle n'a
                          plus d'objet, mais rien ne la fermait — elle restait « active »,
                          comptée dans la charge de son coach et proposée dans les sélecteurs.
                          LE CRITÈRE EST LE VIDE, PAS LE PRIVÉ : une classe privée peut
                          accueillir une FAMILLE, et tant qu'un frère ou une sœur y suit ses
                          cours elle doit vivre. Le serveur recompte et refuse s'il reste
                          quelqu'un : cet écran propose, il ne décide pas. */}
                      {(() => {
                        const src = selectedGroupe
                          || (groupes || []).find(g => g.id === selectedApprenantGroupe?.groupe_id)
                          || null;
                        const privee = !!src && (src.is_prive === true || src.type_cours === "prive"
                          || Number(src.capacite_max) === 1);
                        if (!privee) return null;
                        const reste = Math.max(0, (Number(src.nb_apprenants) || 0) - 1);
                        return (
                          <label style={{ display:"flex",alignItems:"flex-start",gap:9,flex:1,margin:"0 12px",
                            padding:"9px 12px",borderRadius:9,cursor: reste === 0 ? "pointer" : "not-allowed",
                            background: reste === 0 ? "#fffbeb" : "#f8fafc",
                            border:`1px solid ${reste === 0 ? "#fde68a" : "#e2e8f0"}` }}>
                            <input type="checkbox" checked={cloturerSourceTransfert} disabled={reste > 0}
                              onChange={e=>setCloturerSourceTransfert(e.target.checked)}
                              style={{ marginTop:2,cursor:"inherit" }} />
                            <span style={{ fontSize:11.5,lineHeight:1.5,color: reste === 0 ? "#92400e" : "#94a3b8" }}>
                              {reste === 0 ? (
                                <>Clôturer <strong>{src.nom}</strong>, qui n'aura plus aucun apprenant.
                                  <span style={{ color:"#b45309" }}> Les plans de paiement sont gelés.</span></>
                              ) : (
                                <>Clôture impossible : <strong>{reste}</strong> apprenant{reste>1?"s":""} y rest{reste>1?"ent":"e"}.</>
                              )}
                            </span>
                          </label>
                        );
                      })()}

                      <button onClick={executerTransfert} disabled={!transfertForm.nouveau_groupe_id||transfertSaving||!peut("classes","update")} title={permBtnTitle("Confirmer le transfert",peut("classes","update"))}
                        style={{ padding:"10px 24px",background:(transfertForm.nouveau_groupe_id&&peut("classes","update"))?C_GRAD:"#e5e7eb",
                          color:(transfertForm.nouveau_groupe_id&&peut("classes","update"))?"#fff":"#9ca3af",border:"none",borderRadius:9,cursor:(transfertForm.nouveau_groupe_id&&peut("classes","update"))?"pointer":"default",
                          fontWeight:700,fontSize:13,opacity:transfertSaving?0.7:1 }}>
                        {transfertSaving ? "⏳ Transfert en cours…" : peut("classes","update") ? "✅ Confirmer le transfert" : "🔒 Confirmer le transfert"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

      {/* ══ MODAL ANNULER DOSSIER (Onboarding) ══ */}
      {cancelModalOB.open && cancelModalOB.target && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.25)", overflow:"hidden" }}>
            <div style={{ background:"linear-gradient(135deg,#dc2626,#ef4444)", padding:"18px 24px", color:"#fff", flexShrink:0 }}>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>🚫 Annuler le dossier</div>
              <div style={{ fontSize:12, opacity:0.85 }}>{cancelModalOB.target.nom || cancelModalOB.target.prospect_nom || cancelModalOB.target.prenom_apprenant}</div>
            </div>
            <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:14, flex:1, overflowY:"auto" }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>Raison de l'annulation *</label>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {["Prospect injoignable","Offre non adaptée","Abandon volontaire","Doublon / erreur de saisie","Autre"].map(r => (
                    <label key={r} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, padding:"8px 12px", borderRadius:8, background: cancelModalOB.raison===r ? "#fff5f5" : "#f8fafc", border:`1.5px solid ${cancelModalOB.raison===r ? "#fca5a5" : "#e2e8f0"}` }}>
                      <input type="radio" name="raison_annul_ob" value={r} checked={cancelModalOB.raison===r} onChange={() => setCancelModalOB(p=>({...p, raison:r}))} style={{ accentColor:"#dc2626" }} />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
              {cancelModalOB.raison === "Autre" && (
                <textarea
                  value={cancelModalOB.raisonLibre}
                  onChange={e => setCancelModalOB(p=>({...p, raisonLibre:e.target.value}))}
                  placeholder="Précisez la raison…"
                  style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #fca5a5", fontSize:13, resize:"vertical", minHeight:70, boxSizing:"border-box" }}
                />
              )}
            </div>
            <div style={{ display:"flex", gap:10, padding:"0 24px 20px" }}>
              <button onClick={() => setCancelModalOB({ open:false, target:null, raison:"", raisonLibre:"", context:"" })}
                style={{ flex:1, padding:"10px", border:"1.5px solid #e2e8f0", borderRadius:9, background:"#f8fafc", color:"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                ← Retour
              </button>
              <button
                onClick={handleAnnulerDossierOB}
                disabled={!cancelModalOB.raison || cancelSavingOB || !peut("inscriptions","delete")}
                title={permBtnTitle("Confirmer l'annulation",peut("inscriptions","delete"))}
                style={{ flex:2, padding:"10px", background: (cancelModalOB.raison && peut("inscriptions","delete")) ? "linear-gradient(135deg,#dc2626,#ef4444)" : "#e5e7eb", color: (cancelModalOB.raison && peut("inscriptions","delete")) ? "#fff" : "#9ca3af", border:"none", borderRadius:9, fontWeight:700, fontSize:13, cursor: (cancelModalOB.raison && peut("inscriptions","delete")) ? "pointer" : "not-allowed" }}
              >
                {cancelSavingOB ? "Annulation…" : peut("inscriptions","delete")?"✕ Confirmer l'annulation":"🔒 Confirmer l'annulation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ARCHIVER APPRENANT ══ */}
      {archiveTarget && (
        <ArchiveModal
          apprenant={archiveTarget}
          accentColor={C}
          onClose={() => setArchiveTarget(null)}
          onDone={() => setArchiveTarget(null)}
        />
      )}

      {/* LE MODAL « DOSSIER APPRENANT » A ÉTÉ RETIRÉ ICI.
         Il n'était plus atteignable : `setShowAppModal(true)` n'existait nulle part, donc
         ni le modal ni son export PDF ne s'ouvraient jamais. Son seul contenu utile - la
         fiche en PDF - vit désormais sur la fiche réellement utilisée
         (`selectedApprenantGroupe`, bouton « 📄 Export PDF » de son en-tête), bâtie sur
         utils/fichePdfApprenant.js. Garder une copie morte du document, c'était garantir
         qu'une correction de charte soit un jour appliquée à celle qu'on ne voit pas. */}

      {/* ══ MODAL DOSSIER - 2 étapes : Dossier (lecture seule) → Groupe ══ */}
      {showDossierModal && dossierTarget && (
        <div style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.65)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
          <div style={{ background:"#fff",borderRadius:18,width:"90vw",height:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.3)" }}>
            {/* Header */}
            <div style={{ background:`linear-gradient(135deg,#0f172a,${assombrirCouleur(C)})`,padding:"20px 26px",color:"#fff",borderRadius:"18px 18px 0 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:11,color:"#c4b5fd",fontWeight:600,marginBottom:4 }}>Traitement du dossier</div>
                <h3 style={{ margin:0,fontSize:17,fontWeight:900 }}>📋 {dossierTarget.nom}</h3>
                {/* Stepper 2 étapes */}
                <div style={{ display:"flex",gap:0,marginTop:12,alignItems:"center" }}>
                  {[{n:1,l:"Dossier"},{n:2,l:dossierTarget?.type_coaching === "prive" ? "🔒 Classe Privée" : "Classe / Groupe"}].map((s,i,arr)=>(
                    <React.Fragment key={s.n}>
                      <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                        <div style={{ width:24,height:24,borderRadius:"50%",background:dossierStep>=s.n?"#a78bfa":"rgba(255,255,255,0.2)",color:dossierStep>=s.n?"#0f172a":"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:11,flexShrink:0 }}>{s.n}</div>
                        <span style={{ fontSize:10,fontWeight:dossierStep===s.n?700:400,color:dossierStep>=s.n?"#e9d5ff":"rgba(255,255,255,0.4)",whiteSpace:"nowrap" }}>{s.l}</span>
                      </div>
                      {i<arr.length-1&&<div style={{ width:24,height:2,background:"rgba(255,255,255,0.2)",margin:"0 6px",flexShrink:0 }}/>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <button onClick={()=>setShowDossierModal(false)} style={{ background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>✕</button>
            </div>

            <div style={{ padding:"24px 26px" }}>
              {/* ── ÉTAPE 1 : DOSSIER (LECTURE SEULE) ── */}
              {dossierStep===1&&(()=>{
                const t = dossierTarget;
                const sd = t.suivi_demarrage || {};
                const isCoachingPrive = t.type_coaching === "prive";
                const PAI_LABELS = { en_attente:"En attente", partiel:"Partiel", confirme:"Confirmé ✓", paye:"Confirmé ✓", rejete:"Rejeté ✗" };
                const PAI_COLORS = { en_attente:"#d97706", partiel:"#0891b2", confirme:"#16a34a", paye:"#16a34a", rejete:"#dc2626" };
                const TYPE_C_LABELS = { en_ligne:"💻 En ligne", presentiel:"🏢 Présentiel", domicile:"🏠 À domicile" };
                // "standard" (dossiers créés depuis Inscriptions) et "groupe" (anciens dossiers)
                // désignent la même chose - jamais unifiées côté données.
                const COACHING_LABELS = { prive:"Cours privé", groupe:"Cours en groupe", standard:"Cours en groupe", semi_prive:"Semi-privé" };
                return (
                  <div>
                    <div style={{ fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:12,display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ width:24,height:24,borderRadius:"50%",background:C,color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900 }}>1</span>
                      {isCoachingPrive ? "Dossier coaching privé - transmis par le PA Advisor" : "Dossier reçu de l'assistante commerciale"}
                    </div>

                    {/* ── Bannière Coaching Privé PA ── */}
                    {isCoachingPrive && (() => {
                      const lieuLabel = sd.lieu_coaching === "domicile"
                        ? `🏠 À domicile${sd.adresse_coaching ? " - " + sd.adresse_coaching : ""}`
                        : sd.lieu_coaching === "cabinet"
                          ? `🏢 Au cabinet${sd.centre_coaching ? " - " + sd.centre_coaching : ""}`
                          : sd.lieu_coaching || "-";
                      const dispos = sd.disponibilites || {};
                      const horairesOnb = Array.isArray(dispos.horaires) && dispos.horaires.length > 0 ? dispos.horaires : [];
                      const joursLegacyOnb = horairesOnb.length === 0
                        ? [...(Array.isArray(dispos.jours) ? dispos.jours : []), ...(Array.isArray(dispos.creneaux) ? dispos.creneaux : [])]
                        : [];
                      const hasDispos = horairesOnb.length > 0 || joursLegacyOnb.length > 0;
                      // Coach affecté par le PA - soit un vrai coach (sd.coach_id, à résoudre dans
                      // la liste `coaches` déjà chargée pour l'onglet Groupes), soit une saisie
                      // manuelle (sd.coach_nom_manuel + coach_telephone/coach_email).
                      const coachReel = sd.coach_id ? coaches.find(c => String(c.id) === String(sd.coach_id)) : null;
                      const coachNomAffiche = coachReel ? `${coachReel.prenom||""} ${coachReel.nom||""}`.trim() : (sd.coach_nom_manuel || null);
                      return (
                        <div style={{ background:"linear-gradient(135deg,#faf5ff,#f3e8ff)",border:"2px solid #a855f7",borderRadius:12,padding:"14px 16px",marginBottom:16 }}>
                          <div style={{ fontSize:12,fontWeight:800,color:"#6d28d9",marginBottom:10,display:"flex",alignItems:"center",gap:8 }}>
                            🔒 Coaching Privé - Assigné par le PA Advisor
                          </div>
                          {coachNomAffiche && (
                            <div style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", borderRadius:10, padding:"10px 12px", border:"1.5px solid #ddd6fe", marginBottom:12 }}>
                              {coachReel?.photo_url
                                ? <img src={coachReel.photo_url} alt={coachNomAffiche} style={{ width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0 }} />
                                : <div style={{ width:36,height:36,borderRadius:"50%",background:"#a855f7",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:"#fff",flexShrink:0 }}>{coachNomAffiche.split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase()}</div>
                              }
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:9, color:"#9ca3af", fontWeight:700, textTransform:"uppercase" }}>Coach assigné</div>
                                <div style={{ fontWeight:800, fontSize:13, color:"#0f172a" }}>{coachNomAffiche}{!coachReel && <span style={{ fontWeight:600, color:"#9ca3af", fontSize:10 }}> (saisie manuelle)</span>}</div>
                                <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:2 }}>
                                  {coachReel?.grade && <span style={{ fontSize:11, color:"#6d28d9" }}>🎖 {coachReel.grade}</span>}
                                  {(sd.coach_telephone) && <span style={{ fontSize:11, color:"#0891b2" }}>📞 {sd.coach_telephone}</span>}
                                  {(sd.coach_email) && <span style={{ fontSize:11, color:"#0891b2" }}>✉️ {sd.coach_email}</span>}
                                </div>
                              </div>
                            </div>
                          )}
                          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px",fontSize:12 }}>
                            {t.pa_advisor_nom && (
                              <div>
                                <span style={{ color:"#9ca3af",fontWeight:600 }}>PA en charge : </span>
                                <span style={{ fontWeight:700,color:"#6d28d9" }}>👤 {t.pa_advisor_nom}</span>
                              </div>
                            )}
                            <div>
                              <span style={{ color:"#9ca3af",fontWeight:600 }}>Lieu : </span>
                              <span style={{ fontWeight:700,color:"#0f172a" }}>{lieuLabel}</span>
                            </div>
                            <div>
                              <span style={{ color:"#9ca3af",fontWeight:600 }}>Formation : </span>
                              <span style={{ fontWeight:700,color:"#0f172a" }}>{sd.formation_souhaitee || t.offre || "-"}</span>
                            </div>
                            <div>
                              <span style={{ color:"#9ca3af",fontWeight:600 }}>Niveau : </span>
                              <span style={{ padding:"1px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:"#ede9fe",color:"#6d28d9" }}>{sd.niveau_prospect || t.niveau || "-"}</span>
                            </div>
                            {sd.type_coaching && (
                              <div>
                                <span style={{ color:"#9ca3af",fontWeight:600 }}>Pack : </span>
                                <span style={{ fontWeight:700,color:"#0f172a" }}>{sd.type_coaching === "intensive" ? "Intensive - 5 séances/sem" : "Classique - 3 séances × 2h/sem"}</span>
                              </div>
                            )}
                            {sd.cout_formation > 0 && (
                              <div>
                                <span style={{ color:"#9ca3af",fontWeight:600 }}>Montant : </span>
                                <span style={{ fontWeight:700,color:"#15803d" }}>{Number(sd.cout_formation).toLocaleString("fr-FR")} FCFA/mois</span>
                              </div>
                            )}
                            <div>
                              <span style={{ color:"#9ca3af",fontWeight:600 }}>Date début : </span>
                              <span style={{ fontWeight:700,color:"#15803d" }}>{sd.date_debut_formation ? new Date(sd.date_debut_formation).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}) : "-"}</span>
                            </div>
                            {hasDispos && (
                              <div style={{ gridColumn:"1/-1" }}>
                                <span style={{ color:"#9ca3af",fontWeight:600 }}>Disponibilités : </span>
                                <div style={{ display:"flex",gap:4,flexWrap:"wrap",marginTop:4 }}>
                                  {horairesOnb.map((h,i) => (
                                    <span key={i} style={{ padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:"#ede9fe",color:"#7c3aed" }}>{h.jour} {h.debut}</span>
                                  ))}
                                  {joursLegacyOnb.map(j => (
                                    <span key={j} style={{ padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:"#ede9fe",color:"#7c3aed" }}>{j}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div style={{ marginTop:10,padding:"8px 10px",background:"#fef3c7",borderRadius:8,fontSize:11,color:"#92400e",fontWeight:600 }}>
                            ⚡ Le formulaire de création de classe est pré-rempli avec ces données. Vérifiez et confirmez à l'étape suivante.
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ background:"#f8faff",border:"1.5px solid #c7d2fe",borderRadius:12,padding:"14px 16px",marginBottom:20 }}>
                      <div style={{ fontSize:11,fontWeight:800,color:"#4338ca",marginBottom:12,display:"flex",alignItems:"center",gap:6 }}>
                        📋 Données du dossier
                        <span style={{ fontWeight:400,color:"#6366f1",fontSize:10 }}>{isCoachingPrive ? "(transmis par le PA Advisor)" : "(validé par l'assistante commerciale)"}</span>
                      </div>
                      {/* Ce dossier est un coaching privé : offre/niveau vivent dans sd.formation_souhaitee/
                          sd.niveau_prospect (déjà affichés dans la bannière violette ci-dessus), pas dans
                          t.offre/t.niveau qui sont spécifiques au flux commercial classique - donc jamais
                          renseignés ici pour un dossier privé. Ne pas afficher un avertissement qui blâme
                          une "assistante commerciale" inexistante dans ce parcours. */}
                      {(!t.offre || !t.niveau) && !isCoachingPrive && (
                        <div style={{ marginBottom:10,padding:"8px 12px",background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,fontSize:11,color:"#92400e" }}>
                          ⚠️ Offre ou niveau non renseigné - l'assistante commerciale devra compléter le dossier.
                        </div>
                      )}
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 16px",fontSize:12 }}>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Nom complet : </span><strong style={{ color:"#0f172a" }}>{t.nom||"-"}</strong></div>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Email : </span><span style={{ color:"#0f172a" }}>{t.email||"-"}</span></div>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Téléphone : </span><span style={{ color:"#0f172a" }}>{t.telephone||"-"}</span></div>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Profil : </span>
                          <span style={{ padding:"1px 8px",borderRadius:99,fontSize:11,fontWeight:700,
                            background:t.profil_type==="enfant"?"#fef9c3":t.profil_type==="etudiant"?"#dcfce7":"#eff6ff",
                            color:     t.profil_type==="enfant"?"#854d0e":t.profil_type==="etudiant"?"#15803d":"#1d4ed8",
                          }}>{t.profil||"Adulte"}</span>
                        </div>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Offre souscrite : </span><strong style={{ color:"#0f172a" }}>{t.offre||t.suivi_demarrage?.formation_souhaitee||"-"}</strong></div>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Niveau évalué : </span>
                          {/* t.niveau (niveau_client) n'est jamais renseigné pour un dossier coaching
                              privé - le vrai niveau vit dans suivi_demarrage.niveau_prospect (celui
                              que le PA renseigne/teste), déjà affiché dans la bannière violette
                              ci-dessus mais absent ici sans ce repli. */}
                          <span style={{ padding:"1px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:"#f3e8ff",color:"#6d28d9" }}>{t.niveau||t.suivi_demarrage?.niveau_prospect||"-"}</span>
                        </div>
                        {t.type_cours&&<div><span style={{ color:"#9ca3af",fontWeight:600 }}>Mode : </span><span style={{ color:"#0f172a" }}>{TYPE_C_LABELS[t.type_cours]||t.type_cours}</span></div>}
                        {t.type_coaching&&<div><span style={{ color:"#9ca3af",fontWeight:600 }}>Coaching : </span><span style={{ color:"#0f172a" }}>{COACHING_LABELS[t.type_coaching]||t.type_coaching}</span></div>}
                        {t.centre_nom&&<div><span style={{ color:"#9ca3af",fontWeight:600 }}>Centre : </span><span style={{ color:"#0f172a" }}>{t.centre_nom}</span></div>}
                        {/* La formule choisie par le client : c'est elle qui dit le rythme
                            (3×/semaine, week-end…) et donc dans quelle classe l'affecter.
                            Volontairement sans le tarif - l'onboarding ne traite pas les
                            paiements, cette information reste chez la commerciale. */}
                        {(() => {
                          const fg = t.suivi_demarrage?.formule_groupe;
                          const packSeul = !fg && t.type_coaching !== "prive" ? t.suivi_demarrage?.pack_coaching : null;
                          if (!fg && !packSeul) return null;
                          return (
                            <div style={{ gridColumn:"1/-1",marginTop:6,padding:"8px 12px",borderRadius:8,background:"#f0fdf4",border:"1px solid #bbf7d0" }}>
                              <div style={{ fontSize:11,fontWeight:700,color:"#15803d",marginBottom:4 }}>👥 Formule choisie par le client</div>
                              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:12 }}>
                                <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Formule : </span><strong style={{ color:"#0f172a" }}>{fg?.label||packSeul}</strong></div>
                                {fg?.canal&&<div><span style={{ color:"#9ca3af",fontWeight:600 }}>Canal : </span><span>{fg.canal==="presentiel"?"🏢 Présentiel":"💻 En ligne"}</span></div>}
                                {fg?.frequence&&<div style={{ gridColumn:"1/-1" }}><span style={{ color:"#9ca3af",fontWeight:600 }}>Rythme : </span><span style={{ color:"#374151" }}>{fg.frequence}</span></div>}
                              </div>
                            </div>
                          );
                        })()}
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Paiement : </span>
                          <span style={{ fontWeight:700,color:PAI_COLORS[t.statut_paiement]||"#9ca3af" }}>{PAI_LABELS[t.statut_paiement]||"-"}</span>
                          {t.montant_paye>0&&<span style={{ color:"#374151",marginLeft:6 }}>({Number(t.montant_paye).toLocaleString("fr-FR")} FCFA)</span>}
                        </div>
                        {t.date_debut_formation&&<div><span style={{ color:"#9ca3af",fontWeight:600 }}>Date de début : </span><strong style={{ color:"#15803d" }}>{new Date(t.date_debut_formation).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</strong></div>}
                        {t.objectif&&<div style={{ gridColumn:"1/-1" }}><span style={{ color:"#9ca3af",fontWeight:600 }}>Objectif : </span><span style={{ color:"#374151",fontStyle:"italic" }}>"{t.objectif}"</span></div>}
                        {t.notes_commerciale&&<div style={{ gridColumn:"1/-1" }}><span style={{ color:"#9ca3af",fontWeight:600 }}>Notes : </span><span style={{ color:"#374151" }}>{t.notes_commerciale}</span></div>}
                        {t.profil_type==="enfant"&&(()=>{
                          const sd2 = t.suivi_demarrage || {};
                          const prenomE = t.prenom_enfant||sd2.prenom_enfant||"";
                          const nomE    = t.nom_enfant   ||sd2.nom_enfant   ||"";
                          const ageE    = t.age_enfant   ||sd2.age_enfant   ||"";
                          const classeE = t.niveau_classe_enfant||sd2.niveau_classe_enfant||"";
                          if (!prenomE&&!nomE&&!ageE&&!classeE) return null;
                          return (
                            <div style={{ gridColumn:"1/-1",marginTop:6,padding:"8px 12px",borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe" }}>
                              <div style={{ fontSize:11,fontWeight:700,color:"#1d4ed8",marginBottom:4 }}>👶 Informations de l'enfant</div>
                              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:12 }}>
                                {(prenomE||nomE)&&<div style={{ gridColumn:"1/-1" }}><span style={{ color:"#9ca3af",fontWeight:600 }}>Nom : </span><strong>{`${prenomE} ${nomE}`.trim()}</strong></div>}
                                {ageE&&<div><span style={{ color:"#9ca3af",fontWeight:600 }}>Âge : </span><span>{ageE}</span></div>}
                                {classeE&&<div><span style={{ color:"#9ca3af",fontWeight:600 }}>Classe : </span><span>{classeE}</span></div>}
                              </div>
                            </div>
                          );
                        })()}
                        {t.profil_type==="enfant"&&t.nom_parent&&(
                          <div style={{ gridColumn:"1/-1",marginTop:6,padding:"8px 12px",borderRadius:8,background:"#fefce8",border:"1px solid #fde047" }}>
                            <div style={{ fontSize:11,fontWeight:700,color:"#854d0e",marginBottom:4 }}>👨‍👩‍👧 Parent / tuteur</div>
                            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:12 }}>
                              <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Nom : </span><strong>{t.nom_parent}</strong></div>
                              {t.telephone_parent&&<div><span style={{ color:"#9ca3af",fontWeight:600 }}>Tél. : </span><span>{t.telephone_parent}</span></div>}
                              {t.email_parent&&<div style={{ gridColumn:"1/-1" }}><span style={{ color:"#9ca3af",fontWeight:600 }}>Email : </span><span>{t.email_parent}</span></div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {dossierPaiements.length > 0 && (
                      <div style={{ background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:12,padding:"14px 16px",marginBottom:20 }}>
                        <div style={{ fontSize:11,fontWeight:800,color:"#15803d",marginBottom:10,display:"flex",alignItems:"center",gap:6 }}>
                          💳 Versements enregistrés ({dossierPaiements.length})
                        </div>
                        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                          {dossierPaiements.map((p,i) => {
                            const pSt = { en_attente:{c:"#d97706",bg:"#fef3c7",l:"En attente"}, confirme:{c:"#16a34a",bg:"#dcfce7",l:"Confirmé"}, rejete:{c:"#dc2626",bg:"#fee2e2",l:"Rejeté"}, partiel:{c:"#0891b2",bg:"#e0f2fe",l:"Partiel"} };
                            const st = pSt[p.statut] || { c:"#9ca3af",bg:"#f1f5f9",l:p.statut||"-" };
                            return (
                              <div key={p.id||i} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:"#fff",borderRadius:8,border:"1px solid #d1fae5",fontSize:12 }}>
                                <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                                  <span style={{ fontWeight:700,color:"#0f172a" }}>{Number(p.montant_recu||0).toLocaleString("fr-FR")} FCFA</span>
                                  <span style={{ color:"#6b7280" }}>{p.mode_paiement||"-"} · {p.date_paiement ? new Date(p.date_paiement).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}) : "-"}</span>
                                  {p.ref_transaction && <span style={{ color:"#9ca3af",fontSize:11 }}>Réf : {p.ref_transaction}</span>}
                                  {p.notes && <span style={{ color:"#374151",fontStyle:"italic",fontSize:11 }}>{p.notes}</span>}
                                </div>
                                <span style={{ padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:700,color:st.c,background:st.bg }}>{st.l}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ marginTop:8,fontSize:12,fontWeight:700,color:"#15803d",textAlign:"right" }}>
                          Total reçu : {dossierPaiements.reduce((s,p)=>s+(Number(p.montant_recu)||0),0).toLocaleString("fr-FR")} FCFA
                        </div>
                      </div>
                    )}

                    <div style={{ display:"flex",justifyContent:"flex-end",marginTop:4 }}>
                      <button onClick={()=>{ setDossierSelectedGroupe(null); if (!isCoachingPrive) setDossierCreerGroupe(false); setDossierStep(2); }}
                        style={{ padding:"10px 24px",background:C,color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:13 }}>
                        {isCoachingPrive ? "Créer la classe privée →" : "Affecter à un groupe →"}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ── ÉTAPE 2 : AFFECTATION GROUPE ── */}
              {dossierStep===2&&(()=>{
                const sdEt2 = dossierTarget?.suivi_demarrage || {};
                const isCoachingPriveEt2 = dossierTarget?.type_coaching === "prive";

                const LIBELLES_MODE = { en_ligne:"💻 En ligne", presentiel:"🏢 Présentiel", domicile:"🏠 À domicile" };

                /* La formule retenue par le client - le rythme qu'il a acheté. Repli sur
                   `pack_coaching` pour les dossiers antérieurs à l'objet complet. */
                const formuleEt2  = sdEt2.formule_groupe || null;
                const packSeulEt2 = !formuleEt2 && !isCoachingPriveEt2 ? sdEt2.pack_coaching : null;

                /* Les centres, pour nommer `groupes.centre_id` (« angre ») au lieu de
                   l'afficher brut. Même source que le dashboard commercial ; en cas
                   d'absence, on retombe sur la clé, jamais sur du vide. */
                const centresNoms = (() => {
                  try {
                    const s = localStorage.getItem("bet_centres_master");
                    if (!s) return {};
                    return Object.fromEntries(JSON.parse(s).map(c => [c.key, c.name]));
                  } catch { return {}; }
                })();
                const nomCentre = (key) => key ? (centresNoms[key] || key) : null;

                /* `groupes.horaire` est un JSONB `[{jour, debut, fin}]`, pas une chaîne :
                   le lire comme du texte faisait planter l'écran entier. On le met en forme
                   ici, en tolérant les anciennes lignes stockées en texte libre. */
                const formaterHoraire = (h) => {
                  if (!h) return null;
                  if (typeof h === "string") return h.trim() || null;
                  if (!Array.isArray(h)) return null;
                  const parts = h
                    .filter(c => c && (c.jour || c.debut))
                    .map(c => `${c.jour || ""} ${c.debut || ""}${c.fin ? `-${c.fin}` : ""}`.trim());
                  return parts.length ? parts.join(" · ") : null;
                };

                /* Le rythme de la classe correspond-il à celui acheté ? Comparaison souple
                   (accents, casse, ponctuation ignorés) sur les mots significatifs de la
                   fréquence : « Lun/Mer/Ven - séances de 2h » retrouve « Lun 18:00 · Mer… ».
                   Purement indicatif : rien n'est filtré ni bloqué. */
                const normaliser = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim();
                const motsFormule = formuleEt2?.frequence
                  ? normaliser(formuleEt2.frequence).split(" ").filter(m => m.length >= 3)
                  : [];
                const correspondAuRythme = (horaire) => {
                  const texte = formaterHoraire(horaire);
                  if (!texte || motsFormule.length === 0) return false;
                  const h = normaliser(texte);
                  return motsFormule.some(m => h.includes(m));
                };

                /* ── Liste AFFICHÉE ───────────────────────────────────────────────────
                   Distincte de `groupesNiveau`, qui reste la liste du niveau de l'apprenant
                   et continue de piloter la création et le bouton d'affectation. Filtrer
                   celle-là ferait basculer l'écran en création dès qu'une recherche ne
                   donne rien. */
                const niveauAffiche = filtreNiveauClasse || dossierForm.niveau;
                const groupesActifs = groupes.filter(g => g.statut === "actif");
                const nomCoachDe = (g) => {
                  const c = coaches.find(x => x.id === g.coach_id);
                  return c ? `${c.prenom||""} ${c.nom||""}`.trim() : "";
                };
                const q = normaliser(rechercheClasse);
                const groupesAffiches = groupesActifs
                  .filter(g => filtreNiveauClasse === "tous" || g.niveau === niveauAffiche)
                  .filter(g => {
                    if (!q) return true;
                    // Nom, filière, coach, horaire et centre : tout ce qui identifie une
                    // classe à l'œil, pour ne pas obliger à connaître son intitulé exact.
                    const champs = [g.nom, g.filiere, g.niveau, nomCoachDe(g), formaterHoraire(g.horaire), nomCentre(g.centre_id)];
                    return champs.some(v => normaliser(v).includes(q));
                  });
                const nbParNiveau = (n) => groupesActifs.filter(g => g.niveau === n).length;
                const filtresActifs = !!filtreNiveauClasse || !!rechercheClasse.trim();
                const lieuLabelEt2 = sdEt2.lieu_coaching === "domicile"
                  ? `🏠 À domicile${sdEt2.adresse_coaching ? " - " + sdEt2.adresse_coaching : ""}`
                  : sdEt2.lieu_coaching === "cabinet"
                    ? `🏢 Au cabinet${sdEt2.centre_coaching ? " - " + sdEt2.centre_coaching : ""}`
                    : sdEt2.lieu_coaching === "en_ligne"
                      ? "💻 En ligne"
                      : sdEt2.lieu_coaching || "-";

                // ── MODE COACHING PRIVÉ PA ──
                if (isCoachingPriveEt2) {
                  return (
                    <div>
                      <div style={{ fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:12,display:"flex",alignItems:"center",gap:8 }}>
                        <span style={{ width:24,height:24,borderRadius:"50%",background:"#22c55e",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900 }}>2</span>
                        Création de la classe de coaching privé
                      </div>

                      {/* Recap coaching privé */}
                      <div style={{ background:"linear-gradient(135deg,#faf5ff,#f3e8ff)",border:"2px solid #a855f7",borderRadius:12,padding:"14px 16px",marginBottom:16 }}>
                        <div style={{ fontSize:12,fontWeight:800,color:"#6d28d9",marginBottom:10 }}>🔒 Classe privée individuelle - Capacité : 1 apprenant</div>
                        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px",fontSize:12,marginBottom:10 }}>
                          <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Apprenant : </span><strong style={{ color:"#0f172a" }}>{dossierTarget.nom}</strong></div>
                          <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Niveau : </span><span style={{ padding:"1px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:"#ede9fe",color:"#6d28d9" }}>{dossierForm.niveau||"-"}</span></div>
                          <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Lieu : </span><strong style={{ color:"#0f172a" }}>{lieuLabelEt2}</strong></div>
                          <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Type : </span><span style={{ fontWeight:600,color:"#7c3aed" }}>{sdEt2.lieu_coaching === "domicile" ? "Domicile" : sdEt2.lieu_coaching === "en_ligne" ? "En ligne" : sdEt2.lieu_coaching === "cabinet" ? "Centre" : "Privé"}</span></div>
                        </div>
                        {/* Horaire pré-rempli */}
                        {/* Créneaux existants - modifiables inline */}
                        <div style={{ marginBottom:8 }}>
                          <div style={{ fontSize:11,fontWeight:700,color:"#6d28d9",marginBottom:6 }}>📅 Créneaux horaires {dossierNouveauGroupe.horaire.length === 0 ? "(aucun - ajoutez-en ci-dessous)" : `(${dossierNouveauGroupe.horaire.length})`} :</div>
                          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                            {dossierNouveauGroupe.horaire.map((h,i) => (
                              <div key={i} style={{ display:"flex",alignItems:"center",gap:6,background:"#f3e8ff",borderRadius:8,padding:"6px 10px",border:"1px solid #c4b5fd" }}>
                                <select value={h.jour}
                                  onChange={e=>setDossierNouveauGroupe(f=>({...f,horaire:f.horaire.map((x,j)=>j===i?{...x,jour:e.target.value}:x)}))}
                                  style={{ padding:"4px 6px",border:"1px solid #c4b5fd",borderRadius:6,fontSize:11,fontWeight:700,background:"#fff",color:"#4c1d95" }}>
                                  {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(j=><option key={j}>{j}</option>)}
                                </select>
                                <input type="time" value={h.debut}
                                  onChange={e=>setDossierNouveauGroupe(f=>({...f,horaire:f.horaire.map((x,j)=>j===i?{...x,debut:e.target.value}:x)}))}
                                  style={{ padding:"4px 6px",border:"1px solid #c4b5fd",borderRadius:6,fontSize:11,background:"#fff",color:"#4c1d95" }} />
                                <span style={{ fontSize:11,color:"#7c3aed",fontWeight:700 }}>→</span>
                                <input type="time" value={h.fin}
                                  onChange={e=>setDossierNouveauGroupe(f=>({...f,horaire:f.horaire.map((x,j)=>j===i?{...x,fin:e.target.value}:x)}))}
                                  style={{ padding:"4px 6px",border:"1px solid #c4b5fd",borderRadius:6,fontSize:11,background:"#fff",color:"#4c1d95" }} />
                                {h.label && <span style={{ fontSize:10,color:"#9ca3af",fontStyle:"italic",flexShrink:0 }}>({h.label})</span>}
                                <button type="button" onClick={()=>setDossierNouveauGroupe(f=>({...f,horaire:f.horaire.filter((_,j)=>j!==i)}))}
                                  style={{ background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontWeight:900,fontSize:14,padding:0,marginLeft:"auto" }}>×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Ajouter un nouveau créneau */}
                        <div style={{ display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",padding:"6px 8px",background:"#faf5ff",borderRadius:8,border:"1px dashed #c4b5fd" }}>
                          <span style={{ fontSize:10,color:"#7c3aed",fontWeight:700,flexShrink:0 }}>+ Ajouter :</span>
                          <select style={{ padding:"4px 6px",border:"1px solid #c4b5fd",borderRadius:6,fontSize:11,background:"#fff" }} value={dossierHoraireTmp.jour} onChange={e=>setDossierHoraireTmp(h=>({...h,jour:e.target.value}))}>
                            {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(j=><option key={j}>{j}</option>)}
                          </select>
                          <input type="time" style={{ padding:"4px 6px",border:"1px solid #c4b5fd",borderRadius:6,fontSize:11 }} value={dossierHoraireTmp.debut} onChange={e=>setDossierHoraireTmp(h=>({...h,debut:e.target.value}))} />
                          <span style={{ fontSize:11,color:"#9ca3af" }}>→</span>
                          <input type="time" style={{ padding:"4px 6px",border:"1px solid #c4b5fd",borderRadius:6,fontSize:11 }} value={dossierHoraireTmp.fin} onChange={e=>setDossierHoraireTmp(h=>({...h,fin:e.target.value}))} />
                          <button type="button" onClick={()=>{ if(!dossierHoraireTmp.debut||!dossierHoraireTmp.fin) return; setDossierNouveauGroupe(f=>({...f,horaire:[...f.horaire,{jour:dossierHoraireTmp.jour,debut:dossierHoraireTmp.debut,fin:dossierHoraireTmp.fin}]})); }}
                            style={{ padding:"4px 10px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:11 }}>✓</button>
                        </div>
                      </div>

                      {/* Champs éditables */}
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16 }}>
                        <div style={{ gridColumn:"1/-1" }}>
                          <label style={lbl}>Nom de la classe *</label>
                          <input style={inp} value={dossierNouveauGroupe.nom}
                            onChange={e=>setDossierNouveauGroupe(f=>({...f,nom:e.target.value}))}
                            placeholder="Coaching privé - Prénom Nom Niveau" />
                        </div>
                        <div>
                          <label style={lbl}>Date de début</label>
                          <input type="date" style={inp} value={dossierNouveauGroupe.date_debut}
                            onChange={e=>setDossierNouveauGroupe(f=>({...f,date_debut:e.target.value}))} />
                        </div>
                        <div>
                          <label style={lbl}>Date de fin (optionnel)</label>
                          <input type="date" style={inp} value={dossierNouveauGroupe.date_fin}
                            onChange={e=>setDossierNouveauGroupe(f=>({...f,date_fin:e.target.value}))} />
                        </div>
                      </div>

                      {/* Recap final */}
                      <div style={{ padding:"10px 14px",borderRadius:10,background:"#f0fdf4",border:"1px solid #86efac",marginBottom:16,fontSize:12 }}>
                        <div style={{ fontWeight:700,color:"#166534",marginBottom:4 }}>✅ Ce qui va être créé</div>
                        <div style={{ color:"#374151" }}>
                          Classe <strong>"{dossierNouveauGroupe.nom || "Coaching privé"}"</strong> · 1 place · {lieuLabelEt2}
                          {dossierNouveauGroupe.date_debut && <span> · Début : <strong>{new Date(dossierNouveauGroupe.date_debut).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"})}</strong></span>}
                          <div style={{ marginTop:4,color:"#166534" }}>🔔 Créée sans coach - le PA Advisor en assignera un depuis l'onglet Groupes</div>
                        </div>
                      </div>

                      <div style={{ display:"flex",gap:10,justifyContent:"space-between" }}>
                        <button onClick={()=>setDossierStep(1)} style={btnS}>← Retour</button>
                        <button onClick={confirmerAffectation} disabled={dossierSaving||!dossierNouveauGroupe.nom||!peut("inscriptions","update")} title={permBtnTitle("Créer la classe",peut("inscriptions","update"))}
                          style={{ padding:"10px 24px",background:dossierSaving?"#9ca3af":"#7c3aed",color:"#fff",border:"none",borderRadius:9,cursor:dossierSaving?"wait":"pointer",fontWeight:700,fontSize:13,opacity:(dossierSaving||!dossierNouveauGroupe.nom||!peut("inscriptions","update"))?0.6:1 }}>
                          {dossierSaving ? "⏳ Création en cours…" : peut("inscriptions","update")?"🔒 Créer la classe":"🔒 Vous n'avez pas la permission"}
                        </button>
                      </div>
                    </div>
                  );
                }

                // ── MODE CLASSIQUE (groupe existant ou nouveau) ──
                return (
                  <div>
                    <div style={{ fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:6,display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ width:24,height:24,borderRadius:"50%",background:"#22c55e",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900 }}>2</span>
                      Affectation à un groupe / classe
                    </div>

                    {/* ── Rappel dossier ──────────────────────────────────────────────────
                        Une seule ligne « nom · niveau · programme » ne suffisait pas pour
                        choisir une classe : le rythme retenu par l'apprenant, son canal et
                        sa date de début souhaitée n'apparaissaient nulle part. Les montants
                        restent absents - l'onboarding ne traite pas les paiements. ── */}
                    <div style={{ borderRadius:12,border:"2px solid #86efac",overflow:"hidden",marginBottom:16 }}>
                      <div style={{ padding:"10px 14px",background:"#f0fdf4",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                        <span style={{ fontSize:13,fontWeight:800,color:"#166534" }}>{dossierTarget.nom}</span>
                        <span style={{ fontSize:10.5,padding:"2px 9px",borderRadius:99,background:"#dcfce7",color:"#15803d",fontWeight:800 }}>
                          Niveau {dossierForm.niveau||"-"}
                        </span>
                        <span style={{ fontSize:10.5,padding:"2px 9px",borderRadius:99,background:"#eff6ff",color:"#1d4ed8",fontWeight:800 }}>
                          {dossierTarget.profil || "Adulte"}
                        </span>
                        <span style={{ marginLeft:"auto",fontSize:11,color:"#9ca3af",fontWeight:500 }}>- Le coach sera assigné par le PA Advisor</span>
                      </div>
                      <div style={{ padding:"12px 14px",background:"#fff",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 18px",fontSize:12 }}>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Programme : </span><strong style={{ color:"#0f172a" }}>{dossierForm.programme||"-"}</strong></div>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Offre : </span><span style={{ color:"#0f172a" }}>{dossierTarget.offre || sdEt2.formation_souhaitee || "-"}</span></div>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Mode : </span>
                          <span style={{ color:"#0f172a" }}>
                            {LIBELLES_MODE[dossierTarget.type_cours] || dossierTarget.type_cours || "-"}
                            {dossierTarget.centre_nom ? ` · ${dossierTarget.centre_nom}` : ""}
                          </span>
                        </div>
                        <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Début souhaité : </span>
                          <span style={{ color:dossierTarget.date_debut_formation?"#15803d":"#9ca3af",fontWeight:dossierTarget.date_debut_formation?700:400 }}>
                            {dossierTarget.date_debut_formation ? formatDate(dossierTarget.date_debut_formation) : "non précisé"}
                          </span>
                        </div>
                        {dossierTarget.telephone && <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Téléphone : </span><span style={{ color:"#0f172a" }}>{dossierTarget.telephone}</span></div>}
                        {dossierTarget.email && <div style={{ minWidth:0,overflow:"hidden",textOverflow:"ellipsis" }}><span style={{ color:"#9ca3af",fontWeight:600 }}>Email : </span><span style={{ color:"#0f172a" }}>{dossierTarget.email}</span></div>}

                        {/* Profil enfant : la classe dépend de l'âge autant que du niveau. */}
                        {dossierTarget.profil_type==="enfant" && (dossierTarget.prenom_enfant || dossierTarget.nom_enfant || dossierTarget.age_enfant || dossierTarget.nom_parent) && (
                          <div style={{ gridColumn:"1/-1",marginTop:4,padding:"8px 12px",borderRadius:8,background:"#fefce8",border:"1px solid #fde047" }}>
                            <div style={{ fontSize:10.5,fontWeight:800,color:"#854d0e",marginBottom:4 }}>👶 Enfant & parent</div>
                            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 16px",fontSize:11.5 }}>
                              {(dossierTarget.prenom_enfant||dossierTarget.nom_enfant) && <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Enfant : </span><strong>{`${dossierTarget.prenom_enfant||""} ${dossierTarget.nom_enfant||""}`.trim()}</strong></div>}
                              {dossierTarget.age_enfant && <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Âge : </span><span>{dossierTarget.age_enfant}</span></div>}
                              {dossierTarget.nom_parent && <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Parent : </span><span>{dossierTarget.nom_parent}</span></div>}
                              {dossierTarget.telephone_parent && <div><span style={{ color:"#9ca3af",fontWeight:600 }}>Tél. parent : </span><span>{dossierTarget.telephone_parent}</span></div>}
                            </div>
                          </div>
                        )}

                        {/* La formule : c'est elle qui dit à quelle classe rattacher l'apprenant. */}
                        {(formuleEt2 || packSeulEt2) && (
                          <div style={{ gridColumn:"1/-1",marginTop:4,padding:"9px 12px",borderRadius:8,background:"#f0fdf4",border:"1.5px solid #bbf7d0",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:10.5,fontWeight:800,color:"#15803d",marginBottom:3 }}>👥 Formule choisie par le client</div>
                              <div style={{ fontSize:12.5,fontWeight:800,color:"#0f172a" }}>{formuleEt2?.label || packSeulEt2}</div>
                              {formuleEt2?.frequence && <div style={{ fontSize:11,color:"#64748b",marginTop:2 }}>🕐 {formuleEt2.frequence}</div>}
                            </div>
                            {formuleEt2?.canal && (
                              <span style={{ fontSize:10.5,padding:"2px 9px",borderRadius:99,background:"#dcfce7",color:"#15803d",fontWeight:800,whiteSpace:"nowrap",flexShrink:0 }}>
                                {formuleEt2.canal === "presentiel" ? "🏢 Présentiel" : "💻 En ligne"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Filtres de niveau + recherche ───────────────────────────────── */}
                    <div style={{ marginBottom:12 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8 }}>
                        <span style={{ fontSize:11,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:".05em" }}>Niveau</span>
                        {[{ val:"", label:`${dossierForm.niveau||"-"} · apprenant`, n:nbParNiveau(dossierForm.niveau) },
                          ...["A1","A2","B1","B2","C1","C2"].filter(n => n !== dossierForm.niveau).map(n => ({ val:n, label:n, n:nbParNiveau(n) })),
                          { val:"tous", label:"Tous", n:groupesActifs.length }].map(f=>{
                          const actif = filtreNiveauClasse === f.val;
                          const coul  = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" }[f.val] || C;
                          return (
                            <button key={f.val||"apprenant"} type="button"
                              onClick={()=>setFiltreNiveauClasse(f.val)}
                              style={{ padding:"4px 11px",borderRadius:99,border:`1.5px solid ${actif?coul:"#e5e7eb"}`,background:actif?`${coul}15`:"#fff",
                                color:actif?coul:"#6b7280",fontWeight:actif?800:600,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                              {f.label}
                              <span style={{ fontSize:10,fontWeight:800,color:actif?coul:"#9ca3af" }}>({f.n})</span>
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                        <div style={{ position:"relative",flex:"1 1 240px",minWidth:180 }}>
                          <input value={rechercheClasse} onChange={e=>setRechercheClasse(e.target.value)}
                            placeholder="🔍 Rechercher une classe (nom, coach, horaire, centre…)"
                            style={{ ...inp,paddingRight:30 }} />
                          {rechercheClasse && (
                            <button type="button" onClick={()=>setRechercheClasse("")}
                              style={{ position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:14,lineHeight:1,padding:0 }}>✕</button>
                          )}
                        </div>
                        <span style={{ fontSize:11,color:"#6b7280",fontWeight:600,whiteSpace:"nowrap" }}>
                          {groupesAffiches.length} classe{groupesAffiches.length>1?"s":""}
                        </span>
                        {filtresActifs && (
                          <button type="button" onClick={()=>{ setFiltreNiveauClasse(""); setRechercheClasse(""); }}
                            style={{ padding:"4px 10px",borderRadius:7,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#475569",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap" }}>
                            ↺ Réinitialiser
                          </button>
                        )}
                      </div>
                      {/* Affecter hors du niveau de l'apprenant reste permis - un transfert
                          acte parfois une progression - mais ne doit plus être silencieux. */}
                      {filtreNiveauClasse && filtreNiveauClasse !== "tous" && filtreNiveauClasse !== dossierForm.niveau && (
                        <div style={{ marginTop:8,padding:"6px 11px",borderRadius:7,background:"#fff7ed",border:"1px solid #fed7aa",fontSize:11,color:"#c2410c" }}>
                          Vous consultez le niveau <strong>{filtreNiveauClasse}</strong> ; l'apprenant est en <strong>{dossierForm.niveau||"-"}</strong>.
                        </div>
                      )}
                    </div>

                    {/* Groupes disponibles */}
                    {groupesAffiches.length > 0 ? (
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:12,fontWeight:700,color:"#374151",marginBottom:10 }}>
                          {filtreNiveauClasse === "tous"
                            ? <>Groupes disponibles - <strong>tous niveaux</strong></>
                            : <>Groupes disponibles - Niveau <strong>{niveauAffiche||"-"}</strong></>}
                        </div>
                        <div style={{ display:"flex",flexDirection:"column",gap:8,maxHeight:280,overflowY:"auto" }}>
                          {groupesAffiches.map(g=>{
                            const nbApp    = g.nb_apprenants || 0;
                            const cap      = g.capacite_max  || 20;
                            const cloturee = g.statut === "cloture";
                            const plein    = nbApp >= cap || cloturee;
                            const selected = dossierSelectedGroupe?.id === g.id;
                            const pct      = Math.round((nbApp / cap) * 100);
                            const coachG   = coaches.find(c=>c.id===g.coach_id);
                            const coachNomG = coachG ? `${coachG.prenom||""} ${coachG.nom||""}`.trim() : null;
                            const memeRythme = correspondAuRythme(g.horaire);
                            return (
                              <div key={g.id}
                                onClick={()=>{ if(plein) return; setDossierSelectedGroupe(selected?null:g); setDossierCreerGroupe(false); }}
                                style={{ padding:"12px 14px",borderRadius:10,border:`2px solid ${selected?"#22c55e":plein?"#e5e7eb":"#e5e7eb"}`,background:selected?"#f0fdf4":plein?"#f9fafb":"#fafafa",cursor:plein?"not-allowed":"pointer",opacity:plein?0.6:1,display:"flex",gap:12,alignItems:"center" }}>
                                <div style={{ flex:1,minWidth:0 }}>
                                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                                    <span style={{ fontSize:13,fontWeight:800,color:plein?"#9ca3af":"#0f172a" }}>{g.nom}</span>
                                    {cloturee
                                      ? <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#f1f5f9",color:"#475569",fontWeight:700 }}>🔒 Clôturée</span>
                                      : plein
                                      ? <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#fee2e2",color:"#dc2626",fontWeight:700 }}>🔒 Complet</span>
                                      : <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#d1fae5",color:"#065f46",fontWeight:700 }}>✓ Disponible</span>
                                    }
                                    {g.filiere&&<span style={{ fontSize:10,color:"#6b7280" }}>{g.filiere}</span>}
                                    {/* Aide au rapprochement : l'horaire de la classe reprend
                                        le rythme acheté. Indicatif, rien n'est filtré. */}
                                    {memeRythme && !plein && (
                                      <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#dcfce7",color:"#15803d",fontWeight:800 }}>✓ correspond à la formule</span>
                                    )}
                                  </div>
                                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                                    <div style={{ flex:1,height:6,background:"#e5e7eb",borderRadius:3,overflow:"hidden" }}>
                                      <div style={{ height:"100%",width:`${pct}%`,background:plein?"#ef4444":pct>=75?"#f59e0b":"#22c55e",borderRadius:3 }}/>
                                    </div>
                                    <span style={{ fontSize:11,fontWeight:700,color:plein?"#dc2626":"#374151",flexShrink:0 }}>{nbApp}/{cap} places</span>
                                  </div>
                                  {/* L'HORAIRE - l'information qui permet de rapprocher la classe
                                      du rythme choisi, et qui n'était pas affichée du tout. */}
                                  <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",fontSize:10.5,marginBottom:3 }}>
                                    <span style={{ fontWeight:700,color:formaterHoraire(g.horaire)?(memeRythme?"#15803d":"#374151"):"#c2410c" }}>
                                      🕐 {formaterHoraire(g.horaire) || "Horaire non renseigné"}
                                    </span>
                                    {g.type_cours && <span style={{ color:"#6b7280" }}>· {LIBELLES_MODE[g.type_cours] || g.type_cours}</span>}
                                    {nomCentre(g.centre_id) && <span style={{ color:"#6b7280" }}>· {nomCentre(g.centre_id)}</span>}
                                    {g.niveau && <span style={{ color:"#6b7280" }}>· Niveau {g.niveau}</span>}
                                  </div>
                                  <div style={{ fontSize:10,color:"#9ca3af" }}>
                                    {coachNomG ? `Coach : ${coachNomG}` : "⚠ Pas de coach assigné"}
                                    {g.date_debut&&` · Début : ${formatDate(g.date_debut)}`}
                                    {g.date_fin&&` · Fin : ${formatDate(g.date_fin)}`}
                                  </div>
                                </div>
                                {selected&&<span style={{ color:"#22c55e",fontWeight:900,fontSize:20,flexShrink:0 }}>✓</span>}
                              </div>
                            );
                          })}
                        </div>

                        {tousComplets && !dossierCreerGroupe && !filtresActifs && (
                          <div style={{ marginTop:12,padding:"10px 14px",borderRadius:10,background:"#fff7ed",border:"1px solid #fed7aa",fontSize:12,color:"#c2410c" }}>
                            ⚠️ Tous les groupes de ce niveau sont complets.
                            <button onClick={()=>{ setDossierSelectedGroupe(null); setShowCreerGroupeModal(true); }} style={{ marginLeft:10,padding:"3px 10px",background:"#ea580c",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:700,fontSize:11 }}>
                              + Créer un nouveau groupe
                            </button>
                          </div>
                        )}
                      </div>
                    ) : filtresActifs ? (
                      /* Aucun résultat à cause des filtres - surtout ne pas proposer de créer
                         une classe ici : il en existe peut-être, simplement masquées. */
                      <div style={{ padding:"14px",borderRadius:10,background:"#f8fafc",border:"1px solid #e2e8f0",marginBottom:16,fontSize:12,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
                        <span>Aucune classe ne correspond à cette recherche.</span>
                        <button type="button" onClick={()=>{ setFiltreNiveauClasse(""); setRechercheClasse(""); }}
                          style={{ padding:"5px 12px",borderRadius:7,border:"1px solid #cbd5e1",background:"#fff",color:"#334155",fontSize:11,fontWeight:700,cursor:"pointer" }}>
                          ↺ Effacer les filtres
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding:"14px",borderRadius:10,background:"#fff7ed",border:"1px solid #fed7aa",marginBottom:16,fontSize:12,color:"#c2410c" }}>
                        ⚠️ Aucun groupe actif au niveau <strong>{dossierForm.niveau||"-"}</strong>. Créez-en un avec le bouton ci-dessous.
                      </div>
                    )}

                    {/* Bouton créer - ouvre le modal au lieu de déplier un formulaire */}
                    {!dossierCreerGroupe && (
                      <button onClick={()=>{ setDossierSelectedGroupe(null); setShowCreerGroupeModal(true); }} style={{ padding:"8px 14px",background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:12,marginBottom:16 }}>
                        + Créer un nouveau groupe
                      </button>
                    )}

                    {/* La classe à créer, en résumé - le formulaire complet vit dans un modal. */}
                    {dossierCreerGroupe && (
                      <div style={{ padding:"12px 14px",borderRadius:12,background:"#f8fafc",border:"2px dashed #c4b5fd",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:11,fontWeight:800,color:C,marginBottom:3 }}>👥 Nouvelle classe à créer</div>
                          <div style={{ fontSize:13,fontWeight:800,color:"#0f172a" }}>
                            {dossierNouveauGroupe.nom || `Nouveau groupe ${dossierForm.niveau||""}`.trim()}
                          </div>
                          <div style={{ fontSize:11,color:"#64748b",marginTop:2 }}>
                            Niveau {dossierForm.niveau||"-"} · {dossierForm.programme||"-"} · {dossierNouveauGroupe.capacite_max||20} places
                            {dossierNouveauGroupe.horaire.length > 0
                              ? ` · 🕐 ${dossierNouveauGroupe.horaire.map(h=>`${h.jour} ${h.debut}-${h.fin}`).join(" · ")}`
                              : " · 🕐 aucun créneau"}
                          </div>
                        </div>
                        <div style={{ display:"flex",gap:8,flexShrink:0 }}>
                          <button type="button" onClick={()=>setShowCreerGroupeModal(true)}
                            style={{ padding:"7px 14px",borderRadius:8,border:"1px solid #c4b5fd",background:"#fff",color:C,fontWeight:700,fontSize:12,cursor:"pointer" }}>
                            ✏️ Modifier
                          </button>
                          <button type="button" onClick={()=>setDossierCreerGroupe(false)}
                            style={{ padding:"7px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer" }}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Résumé final - le choix est désormais toujours explicite (une classe
                        sélectionnée, ou une classe configurée dans le modal de création). */}
                    {(dossierSelectedGroupe||dossierCreerGroupe)&&(
                      <div style={{ padding:"10px 14px",borderRadius:10,background:`${C_LIGHT}`,border:`1px solid ${C}30`,marginBottom:16,fontSize:12 }}>
                        <div style={{ fontWeight:700,color:C,marginBottom:4 }}>✅ Récapitulatif de l'affectation</div>
                        <div style={{ color:"#374151" }}>
                          <strong>{dossierTarget.nom}</strong> · {dossierForm.niveau} · {dossierForm.programme}<br/>
                          Groupe : <strong>{dossierSelectedGroupe?.nom || dossierNouveauGroupe.nom || `Nouveau groupe ${dossierForm.niveau}`}</strong>
                          {dossierCreerGroupe && <span style={{ marginLeft:6,padding:"1px 6px",borderRadius:99,background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700 }}>À créer</span>}
                          {dossierSelectedGroupe?.coach_id
                            ? <div style={{ marginTop:4,color:"#166534" }}>🔔 Le coach et l'apprenant recevront une notification</div>
                            : <div style={{ marginTop:4,color:"#92400e" }}>⚠ Aucun coach dans ce groupe - le PA Advisor en assignera un</div>
                          }
                        </div>
                      </div>
                    )}

                    <div style={{ display:"flex",gap:10,justifyContent:"space-between" }}>
                      <button onClick={()=>setDossierStep(1)} style={btnS}>← Retour</button>
                      {/* Un choix explicite est requis : sans classe sélectionnée ni classe à
                          créer, le bouton était actif alors que l'envoi échouait aussitôt. */}
                      <button onClick={confirmerAffectation} disabled={dossierSaving||(!dossierSelectedGroupe&&!dossierCreerGroupe)||!peut("inscriptions","update")} title={permBtnTitle("Affecter au groupe",peut("inscriptions","update"))}
                        style={{ padding:"10px 24px",background:dossierSaving?"#9ca3af":"#22c55e",color:"#fff",border:"none",borderRadius:9,cursor:dossierSaving?"wait":"pointer",fontWeight:700,fontSize:13,opacity:((!dossierSelectedGroupe&&!dossierCreerGroupe)||dossierSaving||!peut("inscriptions","update"))?0.6:1 }}>
                        {dossierSaving ? "⏳ En cours…" : peut("inscriptions","update")?"✅ Affecter au groupe":"🔒 Affecter au groupe"}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CRÉATION DE CLASSE (étape 2 de l'affectation) ══════════════════
          Le formulaire se dépliait dans l'écran d'affectation, entre la liste des classes
          et le récapitulatif, qu'il repoussait hors de vue. Il vit maintenant dans son
          propre modal : mêmes champs, même état (`dossierNouveauGroupe`), création toujours
          effectuée à la validation finale par `confirmerAffectation`. ══ */}
      {showCreerGroupeModal && (
        <div onClick={e=>{ if(e.target===e.currentTarget) setShowCreerGroupeModal(false); }}
          style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
          <div style={{ background:"#fff",borderRadius:16,width:"100%",maxWidth:620,maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 24px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ padding:"16px 22px",borderBottom:"1px solid #f1f5f9",flexShrink:0,display:"flex",alignItems:"center",gap:10 }}>
              <span style={{ fontSize:18 }}>👥</span>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:14,fontWeight:800,color:"#0f172a" }}>Créer une classe</div>
                <div style={{ fontSize:11,color:"#64748b" }}>Niveau {dossierForm.niveau||"-"} · {dossierForm.programme||"-"}</div>
              </div>
              <button onClick={()=>setShowCreerGroupeModal(false)} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9ca3af",lineHeight:1,padding:0 }}>✕</button>
            </div>
            <div style={{ padding:"18px 22px",overflowY:"auto",flex:1 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
              <div style={{ gridColumn:"1/-1" }}>
                <label style={lbl}>Nom du groupe *</label>
                <input style={inp} value={dossierNouveauGroupe.nom}
                  onChange={e=>setDossierNouveauGroupe(f=>({...f,nom:e.target.value}))}
                  placeholder={`Ex : ${dossierForm.programme} - ${dossierForm.niveau} Soir`} />
              </div>
              <div>
                <label style={lbl}>Date de début</label>
                <input type="date" style={inp} value={dossierNouveauGroupe.date_debut}
                  onChange={e=>setDossierNouveauGroupe(f=>({...f,date_debut:e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Date de fin</label>
                <input type="date" style={inp} value={dossierNouveauGroupe.date_fin}
                  onChange={e=>setDossierNouveauGroupe(f=>({...f,date_fin:e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Capacité maximale</label>
                <input type="number" min={2} max={30} style={inp} value={dossierNouveauGroupe.capacite_max}
                  onChange={e=>setDossierNouveauGroupe(f=>({...f,capacite_max:Number(e.target.value)}))} />
              </div>
              <div style={{ display:"flex",alignItems:"flex-end",gap:0 }}>
                <div style={{ fontSize:11,fontWeight:600,color:"#374151",marginBottom:4,gridColumn:"1/-1" }}>Filière / Type</div>
                <div style={{ background:"#e0e7ff",padding:"8px 12px",borderRadius:8,fontSize:12,color:"#3730a3",fontWeight:600 }}>
                  {dossierForm.programme || "-"} · En ligne
                </div>
              </div>
            </div>
            {/* Créneaux horaires */}
            <div style={{ marginTop:12 }}>
              <label style={lbl}>Créneaux horaires</label>
              <div style={{ display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:6 }}>
                <select style={{ ...inp,flex:"0 0 auto",width:"auto",padding:"7px 8px" }} value={dossierHoraireTmp.jour} onChange={e=>setDossierHoraireTmp(h=>({...h,jour:e.target.value}))}>
                  {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(j=><option key={j}>{j}</option>)}
                </select>
                <input type="time" style={{ ...inp,flex:"0 0 auto",width:"auto",padding:"7px 8px" }} value={dossierHoraireTmp.debut} onChange={e=>setDossierHoraireTmp(h=>({...h,debut:e.target.value}))} />
                <span style={{ fontSize:11,color:"#9ca3af" }}>→</span>
                <input type="time" style={{ ...inp,flex:"0 0 auto",width:"auto",padding:"7px 8px" }} value={dossierHoraireTmp.fin} onChange={e=>setDossierHoraireTmp(h=>({...h,fin:e.target.value}))} />
                <button type="button" onClick={()=>setDossierNouveauGroupe(f=>({...f,horaire:[...f.horaire,{...dossierHoraireTmp}]}))} style={{ padding:"7px 12px",background:C,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap",flexShrink:0 }}>+ Ajouter</button>
              </div>
              {dossierNouveauGroupe.horaire.length > 0 && (
                <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                  {dossierNouveauGroupe.horaire.map((h,i)=>(
                    <span key={i} style={{ padding:"3px 10px",background:"#e0e7ff",borderRadius:99,fontSize:11,color:"#3730a3",fontWeight:600,display:"flex",alignItems:"center",gap:6 }}>
                      {h.jour} {h.debut}–{h.fin}
                      <button type="button" onClick={()=>setDossierNouveauGroupe(f=>({...f,horaire:f.horaire.filter((_,j)=>j!==i)}))} style={{ background:"none",border:"none",cursor:"pointer",color:"#6366f1",fontWeight:900,fontSize:13,padding:0,lineHeight:1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize:10,color:"#9ca3af",marginTop:8 }}>
              Le PA Advisor assignera un coach à ce groupe.
            </div>
            </div>
            <div style={{ display:"flex",gap:10,justifyContent:"flex-end",padding:"14px 22px",borderTop:"1px solid #f1f5f9",background:"#fafafa",flexShrink:0 }}>
              <button onClick={()=>setShowCreerGroupeModal(false)}
                style={{ padding:"9px 18px",background:"#f1f5f9",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,color:"#374151" }}>Annuler</button>
              {/* Le nom est le seul champ vraiment requis : tout le reste a un défaut ou
                  sera complété par le PA Advisor. */}
              <button onClick={()=>{
                  if (!dossierNouveauGroupe.nom.trim()) { toast.error("Nom du groupe requis"); return; }
                  setDossierCreerGroupe(true);
                  setDossierSelectedGroupe(null);
                  setShowCreerGroupeModal(false);
                }}
                style={{ padding:"9px 22px",background:C,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:13 }}>
                ✓ Utiliser cette classe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CONTENU ONBOARDING ══ */}
      {modalContenuOnb && (
        <Modal title={editingContenuOnbId ? "Modifier le contenu" : "Ajouter un contenu d'onboarding"} onClose={()=>setModalContenuOnb(false)}>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Titre *</label>
            <input style={inp} value={contenuOnbForm.titre} onChange={e=>setContenuOnbForm(f=>({...f,titre:e.target.value}))} placeholder="Ex : Vidéo de bienvenue" />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, resize:"vertical" }} rows={3} value={contenuOnbForm.detail} onChange={e=>setContenuOnbForm(f=>({...f,detail:e.target.value}))} placeholder="Ce que contient ce document, à qui il s'adresse, quand le consulter…" />
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <label style={lbl}>Étape</label>
              <select style={inp} value={contenuOnbForm.cat} onChange={e=>setContenuOnbForm(f=>({...f,cat:e.target.value}))}>
                <option value="bienvenue">Présentation & Bienvenue</option>
                <option value="regles">Règles & Charte</option>
                <option value="processus">Processus d'apprentissage</option>
                <option value="certification">Certification</option>
              </select>
            </div>
            <div style={{ flex:1 }}>
              <label style={lbl}>Type</label>
              <select style={inp} value={contenuOnbForm.type} onChange={e=>setContenuOnbForm(f=>({...f,type:e.target.value, fichier:null}))}>
                <option value="pdf">PDF</option>
                <option value="video">Vidéo</option>
                <option value="audio">Audio</option>
                <option value="image">Image</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Catégorie du client - le message de bienvenue diffère selon le type de coaching</label>
            <select style={inp} value={contenuOnbForm.cible_coaching} onChange={e=>setContenuOnbForm(f=>({...f,cible_coaching:e.target.value}))}>
              <option value="tous">Tous les apprenants</option>
              <option value="particulier">Particulier (cours en groupe)</option>
              <option value="prive">Coaching privé</option>
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>{LIBELLE_LIEN_CONTENU[contenuOnbForm.type] || "Lien du fichier"} - ou un fichier ci-dessous</label>
            <input style={inp} value={contenuOnbForm.lienVideo} onChange={e=>setContenuOnbForm(f=>({...f,lienVideo:e.target.value, fichier:null}))} placeholder="https://..." />
            {editingContenuOnbId && contenuOnbForm.fichierUrlActuel && !contenuOnbForm.lienVideo?.trim() && !contenuOnbForm.fichier && (
              <p style={{ fontSize:11, color:"#b45309", margin:"5px 0 0" }}>⚠️ Champ vidé : le fichier actuel sera retiré du contenu à l'enregistrement.</p>
            )}
          </div>
          {/* Toujours accessible : à l'édition le champ lien est pré-rempli, et le masquer
              dès qu'un lien est présent interdisait de remplacer un fichier déjà en ligne.
              Un fichier choisi l'emporte sur le lien, comme dans enregistrerContenuOnb. */}
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>{editingContenuOnbId ? "Remplacer par un fichier" : "Fichier"}</label>
            <input type="file" accept={contenuOnbForm.type==="video"?"video/*":contenuOnbForm.type==="audio"?"audio/*":contenuOnbForm.type==="image"?"image/*":".pdf"} onChange={e=>setContenuOnbForm(f=>({...f,fichier:e.target.files[0]||null}))} style={inp} />
            <p style={{ fontSize:11, color:"#94a3b8", margin:"5px 0 0" }}>
              {libelleLimite("contenu", contenuOnbForm.fichier?.type || (contenuOnbForm.type==="video"?"video/mp4":contenuOnbForm.type==="audio"?"audio/mpeg":contenuOnbForm.type==="image"?"image/jpeg":"application/pdf"))}
              {contenuOnbForm.fichier ? " · Le fichier choisi remplacera le lien ci-dessus." : ""}
            </p>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, cursor:"pointer" }}>
              <input type="checkbox" checked={contenuOnbForm.visible} onChange={e=>setContenuOnbForm(f=>({...f,visible:e.target.checked}))} />
              Publier immédiatement (visible par les apprenants)
            </label>
          </div>
          {contenuUploading && contenuProgress > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ height:6, background:"#e2e8f0", borderRadius:20, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${contenuProgress}%`, background:C, transition:"width .2s" }} />
              </div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>Envoi en cours - {contenuProgress}%</div>
            </div>
          )}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button onClick={()=>setModalContenuOnb(false)} style={btnS}>Annuler</button>
            <button onClick={enregistrerContenuOnb} disabled={contenuUploading||!peut("contenus_ressources",editingContenuOnbId?"update":"create")} title={permBtnTitle("Enregistrer",peut("contenus_ressources",editingContenuOnbId?"update":"create"))} style={permBtnStyle({ ...btnP, opacity:contenuUploading?0.6:1, cursor:contenuUploading?"not-allowed":"pointer" },peut("contenus_ressources",editingContenuOnbId?"update":"create"))}>{contenuUploading?"⏳ Envoi…":peut("contenus_ressources",editingContenuOnbId?"update":"create")?"✅ Enregistrer":"🔒 Enregistrer"}</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL VIDÉO BIBLIOTHÈQUE ══ */}
      {modalVideo && (
        <Modal title={editingVideoId ? "Modifier la vidéo" : "Ajouter une vidéo"} onClose={()=>setModalVideo(false)}>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Titre *</label>
            <input style={inp} value={videoForm.titre} onChange={e=>setVideoForm(f=>({...f,titre:e.target.value}))} placeholder="Ex : Astuces pour progresser en anglais" />
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <label style={lbl}>Type</label>
              <select style={inp} value={videoForm.type} onChange={e=>setVideoForm(f=>({...f,type:e.target.value, fichier:null}))}>
                <option value="video">Vidéo</option>
                <option value="audio">Audio</option>
              </select>
            </div>
            <div style={{ flex:1 }}>
              <label style={lbl}>Durée</label>
              <input style={inp} value={videoForm.duree} onChange={e=>setVideoForm(f=>({...f,duree:e.target.value}))} placeholder="Ex : 5 min" />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Public visé</label>
            <select style={inp} value={videoForm.cible} onChange={e=>setVideoForm(f=>({...f,cible:e.target.value}))}>
              <option value="tous">Tous les apprenants</option>
              <option value="enfant">Enfants</option>
              <option value="etudiant">Étudiants / Adolescents</option>
              <option value="adulte">Adultes</option>
            </select>
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <label style={lbl}>Niveau (optionnel)</label>
              <input style={inp} value={videoForm.niveau} onChange={e=>setVideoForm(f=>({...f,niveau:e.target.value}))} placeholder="Ex : B1" />
            </div>
            <div style={{ flex:1 }}>
              <label style={lbl}>Icône</label>
              <input style={inp} value={videoForm.icone} onChange={e=>setVideoForm(f=>({...f,icone:e.target.value}))} placeholder="🎬" />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>{videoForm.type === "audio" ? "Lien audio" : "Lien vidéo (YouTube, Vimeo…)"} - ou un fichier ci-dessous</label>
            <input style={inp} value={videoForm.lienVideo} onChange={e=>setVideoForm(f=>({...f,lienVideo:e.target.value, fichier:null}))} placeholder="https://..." />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>{editingVideoId ? "Remplacer par un fichier" : "Fichier"}</label>
            <input type="file" accept={videoForm.type==="video"?"video/*":"audio/*"} onChange={e=>setVideoForm(f=>({...f,fichier:e.target.files[0]||null}))} style={inp} />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, cursor:"pointer" }}>
              <input type="checkbox" checked={videoForm.visible} onChange={e=>setVideoForm(f=>({...f,visible:e.target.checked}))} />
              Publier immédiatement (visible par les apprenants)
            </label>
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button onClick={()=>setModalVideo(false)} style={btnS}>Annuler</button>
            <button onClick={enregistrerVideo} disabled={contenuUploading||!peut("contenus_biblio",editingVideoId?"update":"create")} title={permBtnTitle("Enregistrer",peut("contenus_biblio",editingVideoId?"update":"create"))} style={permBtnStyle({ ...btnP, opacity:contenuUploading?0.6:1, cursor:contenuUploading?"not-allowed":"pointer" },peut("contenus_biblio",editingVideoId?"update":"create"))}>{contenuUploading?"⏳ Envoi…":peut("contenus_biblio",editingVideoId?"update":"create")?"✅ Enregistrer":"🔒 Enregistrer"}</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL MINI-JEU ══ */}
      {modalMiniJeu && (
        <Modal title={editingMiniJeuId ? "Modifier le mini-jeu" : "Créer un mini-jeu"} onClose={()=>setModalMiniJeu(false)}>
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Nom du jeu *</label>
            <input style={inp} value={miniJeuForm.nom} onChange={e=>setMiniJeuForm(f=>({...f,nom:e.target.value}))} placeholder="Ex : Anagramme - Animaux A1" />
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <label style={lbl}>Type de jeu (moteur)</label>
              <select style={inp} value={miniJeuForm.type} onChange={e=>{
                const t = TYPES_JEUX_DASH.find(x=>x.id===e.target.value);
                setMiniJeuForm(f=>({...f, type:e.target.value, nom: (!editingMiniJeuId && (!f.nom || TYPES_JEUX_DASH.some(x=>x.lib===f.nom))) ? (t?.lib||f.nom) : f.nom }));
              }}>
                {TYPES_JEUX_DASH.map(t => (
                  <option key={t.id} value={t.id}>{t.icone} {t.lib}</option>
                ))}
              </select>
            </div>
            <div style={{ flex:1 }}>
              <label style={lbl}>Public visé</label>
              <select style={inp} value={miniJeuForm.cible} onChange={e=>setMiniJeuForm(f=>({...f,cible:e.target.value}))}>
                <option value="tous">Tous les apprenants</option>
                <option value="enfant">Enfants</option>
                <option value="etudiant">Étudiants / Adolescents</option>
                <option value="adulte">Adultes</option>
              </select>
            </div>
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:16 }}>
            <div style={{ flex:1 }}>
              <label style={lbl}>Nombre de questions / éléments</label>
              <input type="number" min={1} max={50} style={inp} value={miniJeuForm.nb_questions} onChange={e=>setMiniJeuForm(f=>({...f,nb_questions:Math.max(1,Math.min(50,parseInt(e.target.value)||1))}))} />
            </div>
            <div style={{ flex:1 }}>
              <label style={lbl}>Tentatives autorisées</label>
              <input type="number" min={1} max={10} style={inp} value={miniJeuForm.max_tentatives} onChange={e=>setMiniJeuForm(f=>({...f,max_tentatives:Math.max(1,Math.min(10,parseInt(e.target.value)||1))}))} />
            </div>
          </div>
          <div style={{ background:"#FFF7ED", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#92400E", marginBottom:16 }}>
            📋 Plusieurs jeux peuvent utiliser le même moteur (ex. deux "QCM Flash" nommés différemment) - chacun garde son propre suivi de tentatives et de résultats.
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <button onClick={()=>setModalMiniJeu(false)} style={btnS}>Annuler</button>
            <button disabled={savingMiniJeu||!peut("contenus_minijeux",editingMiniJeuId?"update":"create")} title={permBtnTitle("Enregistrer",peut("contenus_minijeux",editingMiniJeuId?"update":"create"))} onClick={enregistrerMiniJeu} style={permBtnStyle(btnP,peut("contenus_minijeux",editingMiniJeuId?"update":"create"))}>{savingMiniJeu?"⏳…":peut("contenus_minijeux",editingMiniJeuId?"update":"create")?"✅ Enregistrer":"🔒 Enregistrer"}</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL RÉSULTATS D'UN MINI-JEU - groupés par apprenant ══ */}
      {detailsMiniJeu && !apprenantDetailMiniJeu && (
        <Modal title={`📊 ${detailsMiniJeu.nom}`} onClose={()=>{ setDetailsMiniJeu(null); setApprenantDetailMiniJeu(null); }} wide>
          {(() => {
            const apprenantsDistincts = new Set(resultatsMiniJeu.map(r=>r.apprenant_id)).size;
            return (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:20 }}>
                <KpiCard icon="🎮" label="Parties jouées" value={detailsMiniJeu.parties_jouees} color="#F97316" />
                <KpiCard icon="📊" label="Score moyen" value={detailsMiniJeu.parties_jouees>0?`${Number(detailsMiniJeu.score_moyen||0)}%`:"-"} color="#7C3AED" />
                <KpiCard icon="👥" label="Apprenants distincts" value={apprenantsDistincts} color="#0891B2" />
                <KpiCard icon="🔄" label="Tentatives autorisées" value={detailsMiniJeu.max_tentatives} color="#059669" />
              </div>
            );
          })()}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:10 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>Résultats par apprenant</div>
            <div style={{ display:"flex", gap:6 }}>
              {[{v:"tout",l:"Tout"},{v:"7j",l:"7 jours"},{v:"30j",l:"30 jours"},{v:"90j",l:"90 jours"}].map(p=>(
                <button key={p.v} onClick={()=>{ setPeriodeResultatsMiniJeu(p.v); setPageResultatsMiniJeu(1); }}
                  style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${periodeResultatsMiniJeu===p.v?"#F97316":"#e2e8f0"}`, background:periodeResultatsMiniJeu===p.v?"#FFF7ED":"#fff", color:periodeResultatsMiniJeu===p.v?"#C2410C":"#374151", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
          {resultatsMiniJeuLoading ? (
            <div style={{ textAlign:"center", padding:30, color:"#9ca3af" }}>⏳ Chargement…</div>
          ) : resultatsMiniJeu.length === 0 ? (
            <div style={{ textAlign:"center", padding:30, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", color:"#9ca3af" }}>Aucune partie jouée pour ce jeu pour le moment.</div>
          ) : (() => {
            const seuilPeriode = periodeResultatsMiniJeu === "tout" ? null : Date.now() - { "7j":7, "30j":30, "90j":90 }[periodeResultatsMiniJeu] * 86400000;
            const resultatsFiltres = seuilPeriode ? resultatsMiniJeu.filter(r => new Date(r.created_at).getTime() >= seuilPeriode) : resultatsMiniJeu;
            const parApprenant = {};
            resultatsFiltres.forEach(r => {
              if (!parApprenant[r.apprenant_id]) parApprenant[r.apprenant_id] = { apprenant_id:r.apprenant_id, apprenant_nom:r.apprenant_nom, tentatives:[] };
              parApprenant[r.apprenant_id].tentatives.push(r);
            });
            const lignes = Object.values(parApprenant).map(a => {
              const avecPct = a.tentatives.filter(t=>t.pourcentage!=null);
              const meilleur = avecPct.length ? Math.max(...avecPct.map(t=>t.pourcentage)) : null;
              const moyenne = avecPct.length ? Math.round(avecPct.reduce((s,t)=>s+t.pourcentage,0)/avecPct.length) : null;
              const dernier = [...a.tentatives].sort((x,y)=>new Date(y.created_at)-new Date(x.created_at))[0];
              return { ...a, meilleur, moyenne, dernier };
            }).sort((x,y) => (y.meilleur ?? -1) - (x.meilleur ?? -1));
            if (lignes.length === 0) {
              return <div style={{ textAlign:"center", padding:30, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", color:"#9ca3af" }}>Aucune partie sur cette période.</div>;
            }
            const lignesPage = paginate(lignes, pageResultatsMiniJeu);
            return (
              <>
                <div style={{ maxHeight:420, overflowY:"auto", border:"1px solid #e5e7eb", borderRadius:10 }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ textAlign:"left", background:"#f8fafc", borderBottom:"1px solid #e5e7eb" }}>
                        <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Apprenant</th>
                        <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Tentatives</th>
                        <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Meilleur score</th>
                        <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Moyenne</th>
                        <th style={{ padding:"9px 12px", fontSize:11, color:"#6b7280", textTransform:"uppercase" }}>Dernière partie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesPage.map(a => (
                        <tr key={a.apprenant_id} onClick={()=>setApprenantDetailMiniJeu(a)} style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer" }}
                          onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <td style={{ padding:"10px 12px", fontWeight:600 }}>{a.apprenant_nom || "-"} <span style={{ fontSize:10, color:"#9ca3af" }}>📊</span></td>
                          <td style={{ padding:"10px 12px" }}><span style={{ padding:"2px 8px", borderRadius:10, background:a.tentatives.length>1?"#FEF3C7":"#F1F5F9", color:a.tentatives.length>1?"#92400E":"#6b7280", fontSize:11, fontWeight:700 }}>{a.tentatives.length}</span></td>
                          <td style={{ padding:"10px 12px", fontWeight:700, color:a.meilleur>=70?"#059669":a.meilleur>=40?"#D97706":"#DC2626" }}>{a.meilleur!=null?`${a.meilleur}%`:"-"}</td>
                          <td style={{ padding:"10px 12px", color:"#6b7280" }}>{a.moyenne!=null?`${a.moyenne}%`:"-"}</td>
                          <td style={{ padding:"10px 12px", fontSize:11, color:"#9ca3af" }}>{new Date(a.dernier.created_at).toLocaleString("fr-FR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={pageResultatsMiniJeu} setPage={setPageResultatsMiniJeu} total={lignes.length} />
              </>
            );
          })()}
        </Modal>
      )}

      {/* ══ MODAL DÉTAIL SUIVI DÉMARRAGE D'UN APPRENANT ══ */}
      {detailSuiviApprenant && (() => {
        const a = mesApprenants.find(x=>x.id===detailSuiviApprenant.id) || detailSuiviApprenant;
        const checklist = checklistEffectif(a);
        const pct = pctChecklist(checklist);
        const tousEnvoyes = CHECKLIST_ITEMS.every(it=>checklist[it.id]);
        const nomComplet = `${a.prenom_apprenant||""} ${a.nom_apprenant||""}`.trim()||"?";
        return (
          <Modal title={`✅ Suivi démarrage - ${nomComplet}`} onClose={()=>setDetailSuiviApprenant(null)}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16 }}>
              <div style={{ display:"flex",gap:12,alignItems:"center" }}>
                <div style={{ width:42,height:42,borderRadius:"50%",background:C_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:15,color:C,overflow:"hidden" }}>
                  {a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : nomComplet[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight:800,fontSize:14,color:"#0f172a" }}>{nomComplet}</div>
                  <div style={{ fontSize:11,color:"#6b7280" }}>{a.groupe_nom||""} · Coach : {a.coach_nom||"-"}</div>
                  <div style={{ fontSize:11,color:"#9ca3af" }}>Inscrit le : {formatDate(a.date_ajout)}</div>
                </div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:24,fontWeight:900,color:pct===100?"#22c55e":pct>=50?C:"#d97706" }}>{pct}%</div>
                <div style={{ fontSize:10,color:"#9ca3af" }}>envoyé</div>
              </div>
            </div>
            <div style={{ height:6,background:"#e5e7eb",borderRadius:4,overflow:"hidden",marginBottom:16 }}>
              <div style={{ height:"100%",width:`${pct}%`,background:pct===100?"#22c55e":pct>=50?C:"#d97706",borderRadius:4,transition:"width .3s" }}/>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12 }}>
              {CHECKLIST_ITEMS.map(item=>{
                const fait = checklist[item.id]||false;
                const isAuto = ITEMS_AUTO.includes(item.id);
                const peutModifier = !isAuto && peut("inscriptions","update");
                return (
                  <button
                    key={item.id}
                    disabled={!peutModifier}
                    title={isAuto ? "Automatique - déclenché dès la création du compte apprenant, non modifiable manuellement" : permBtnTitle(item.label,peut("inscriptions","update"))}
                    onClick={()=>{ if (!isAuto) toggleCheck(a.id,item.id); }}
                    style={{
                      display:"flex",alignItems:"center",gap:10,
                      padding:"10px 14px",borderRadius:10,cursor:peutModifier?"pointer":"default",
                      border:`1.5px solid ${fait?"#bbf7d0":"#e5e7eb"}`,
                      background:fait?"#f0fdf4":"#f8fafc",
                      textAlign:"left",width:"100%",
                      opacity:isAuto?1:(peut("inscriptions","update")?1:0.45),
                    }}
                  >
                    <span style={{ fontSize:18,flexShrink:0 }}>{fait?"✅":item.icon}</span>
                    <div>
                      <div style={{ fontSize:12,fontWeight:700,color:fait?"#166534":"#374151" }}>{item.label}</div>
                      <div style={{ fontSize:10,color:fait?"#22c55e":"#9ca3af" }}>
                        {isAuto ? (fait?"Envoyé automatiquement":"En attente - compte pas encore créé") : (fait?"Envoyé":"En attente")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <textarea
              value={a.suivi_notes||""}
              disabled={!peut("inscriptions","update")}
              title={permBtnTitle("Notes de suivi",peut("inscriptions","update"))}
              onChange={e=>setMesApprenants(prev=>prev.map(x=>x.id===a.id?{...x,suivi_notes:e.target.value}:x))}
              onBlur={e=>enregistrerNotesSuivi(a.id,e.target.value)}
              placeholder="Notes de suivi…"
              style={{ width:"100%",minHeight:60,padding:"8px 12px",borderRadius:8,background:peut("inscriptions","update")?"#f8fafc":"#f1f5f9",border:"1px solid #e2e8f0",fontSize:12,color:"#374151",fontFamily:"inherit",resize:"vertical",opacity:peut("inscriptions","update")?1:0.6 }}
            />
            {tousEnvoyes&&(
              <div style={{ marginTop:12,padding:"10px 14px",borderRadius:10,background:"#dcfce7",border:"1px solid #bbf7d0",fontSize:13,color:"#166534",fontWeight:700,textAlign:"center" }}>
                🎉 Kick-off complet ! Tous les envois ont été effectués.
              </div>
            )}
          </Modal>
        );
      })()}

      {/* ══ MODAL DÉTAIL BILAN & RENOUVELLEMENT D'UN APPRENANT ══ */}
      {detailBilan && (() => {
        const b = bilans.find(x=>x.id===detailBilan.id) || detailBilan;
        const nomComplet = `${b.prenom_apprenant||""} ${b.nom_apprenant||""}`.trim()||"?";
        return (
          <Modal title={`📋 Bilan & renouvellement - ${nomComplet}`} onClose={()=>setDetailBilan(null)}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16 }}>
              <div>
                <div style={{ fontWeight:800,fontSize:15,color:"#0f172a",marginBottom:3 }}>{nomComplet}</div>
                <div style={{ fontSize:12,color:"#6b7280" }}>{b.groupe_nom||"-"} · {b.coach_nom||"-"}</div>
                <div style={{ fontSize:11,color:"#9ca3af",marginTop:2 }}>Fin de groupe : {b.date_fin?formatDate(b.date_fin):"-"}</div>
              </div>
              {b.bilan_alerte_envoyee
                ? <Badge label="✅ Alerte envoyée" color="#166534" bg="#dcfce7" />
                : <Badge label="⚠️ Action requise"  color="#92400e" bg="#fef3c7" />
              }
            </div>
            {/* Résultats */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14 }}>
              {[
                { l:"Niveau initial",v:b.niveau_debut||"-",c:"#6b7280" },
                { l:"Niveau final",  v:b.niveau_fin||"-",  c:"#22c55e" },
                { l:"Note finale",   v:b.note_finale!=null?`${b.note_finale}%`:"-",c:b.note_finale>=70?"#22c55e":b.note_finale>=50?"#f59e0b":"#ef4444" },
                { l:"Séances",       v:b.nb_seances,  c:"#0891b2" },
                { l:"Présence",      v:b.taux_presence!=null?`${b.taux_presence}%`:"-",c:b.taux_presence>=80?"#22c55e":"#f59e0b" },
                { l:"Renouvellement",v:b.renouvellement_suggere||"-",c:C },
              ].map(s=>(
                <div key={s.l} style={{ padding:"8px 10px",borderRadius:8,background:"#f8fafc",textAlign:"center" }}>
                  <div style={{ fontSize:9,color:"#9ca3af" }}>{s.l}</div>
                  <div style={{ fontSize:13,fontWeight:800,color:s.c,marginTop:2 }}>{s.v}</div>
                </div>
              ))}
            </div>
            {/* Commentaire coach */}
            {b.commentaire_coach && (
              <div style={{ padding:"10px 14px",borderRadius:10,background:"#f0f9ff",border:"1px solid #bae6fd",fontSize:12,color:"#374151",marginBottom:16,lineHeight:1.6 }}>
                💬 <strong>Commentaire coach :</strong> {b.commentaire_coach}
              </div>
            )}
            {/* Offre de renouvellement */}
            {b.renouvellement_suggere && (
              <div style={{ padding:"10px 14px",borderRadius:10,background:`${C_LIGHT}`,border:`1px solid ${C}30`,fontSize:12,marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div><div style={{ fontSize:10,color:C,fontWeight:700 }}>OFFRE DE RENOUVELLEMENT SUGGÉRÉE</div><div style={{ fontWeight:800,color:"#0f172a",marginTop:2 }}>Niveau {b.renouvellement_suggere}</div></div>
                <span style={{ fontSize:22 }}>🎓</span>
              </div>
            )}
            {!b.bilan_alerte_envoyee
              ? <button disabled={sendingAlerteCommId===b.id||!peut("inscriptions","update")} title={permBtnTitle("Envoyer l'alerte de renouvellement à la Commerciale",peut("inscriptions","update"))} onClick={()=>envoyerAlerteCommerciale(b.id)} style={{ width:"100%",padding:"10px",background:peut("inscriptions","update")?"#d97706":"#e2e8f0",color:peut("inscriptions","update")?"#fff":"#94a3b8",border:"none",borderRadius:8,cursor:(sendingAlerteCommId===b.id||!peut("inscriptions","update"))?"not-allowed":"pointer",fontWeight:700,fontSize:13,opacity:sendingAlerteCommId===b.id?0.6:1 }}>{sendingAlerteCommId===b.id?"⏳ Envoi…":!peut("inscriptions","update")?"🔒 Envoyer l'alerte de renouvellement à la Commerciale":"📣 Envoyer l'alerte de renouvellement à la Commerciale"}</button>
              : <div style={{ padding:"10px",background:"#dcfce7",borderRadius:8,fontSize:13,color:"#166534",fontWeight:700,textAlign:"center" }}>✅ Alerte commerciale envoyée - suivi en cours</div>
            }
          </Modal>
        );
      })()}

      {/* ══ MODAL DÉTAIL D'UN APPRENANT SUR UN JEU - tendance + historique ══ */}
      {apprenantDetailMiniJeu && (() => {
        const tentatives = [...apprenantDetailMiniJeu.tentatives].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
        const avecPct = tentatives.filter(t=>t.pourcentage!=null);
        const meilleur = avecPct.length ? Math.max(...avecPct.map(t=>t.pourcentage)) : null;
        const moyenne = avecPct.length ? Math.round(avecPct.reduce((s,t)=>s+t.pourcentage,0)/avecPct.length) : null;
        const premier = avecPct[0]?.pourcentage;
        const dernierPct = avecPct[avecPct.length-1]?.pourcentage;
        const tendance = (premier!=null && dernierPct!=null && tentatives.length>1) ? (dernierPct>premier?"hausse":dernierPct<premier?"baisse":"stable") : null;
        return (
          <Modal title={`👤 ${apprenantDetailMiniJeu.apprenant_nom || "-"}`} onClose={()=>setApprenantDetailMiniJeu(null)} wide>
            <div style={{ display:"flex", alignItems:"center", gap:14, background:"#F5F3FF", border:"1px solid #DDD6FE", borderRadius:12, padding:"12px 16px", marginBottom:20, flexWrap:"wrap" }}>
              <span style={{ fontSize:22 }}>🎮</span>
              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ fontSize:14, fontWeight:800, color:"#5B21B6" }}>{detailsMiniJeu?.nom}</div>
                <div style={{ fontSize:11, color:"#6D28D9", marginTop:1 }}>{TYPES_JEUX_DASH.find(t=>t.id===detailsMiniJeu?.type)?.lib || detailsMiniJeu?.type}</div>
              </div>
              <div style={{ display:"flex", gap:18, fontSize:12, color:"#5B21B6" }}>
                <div><div style={{ fontWeight:800, fontSize:15 }}>{detailsMiniJeu?.max_tentatives}</div><div style={{ fontSize:10 }}>tentatives autorisées</div></div>
                <div><div style={{ fontWeight:800, fontSize:15 }}>{detailsMiniJeu?.parties_jouees>0?`${Number(detailsMiniJeu.score_moyen||0)}%`:"-"}</div><div style={{ fontSize:10 }}>score moyen global</div></div>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:12, marginBottom:24 }}>
              <KpiCard icon="🎮" label="Tentatives" value={tentatives.length} color="#0891B2" />
              <KpiCard icon="🏆" label="Meilleur score" value={meilleur!=null?`${meilleur}%`:"-"} color="#059669" />
              <KpiCard icon="📊" label="Score moyen" value={moyenne!=null?`${moyenne}%`:"-"} color="#7C3AED" />
              <KpiCard icon="📈" label="Tendance" value={tendance==="hausse"?"↗ En progrès":tendance==="baisse"?"↘ En baisse":tendance==="stable"?"→ Stable":"-"} color={tendance==="hausse"?"#059669":tendance==="baisse"?"#DC2626":"#6b7280"} />
            </div>

            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:10 }}>Historique des tentatives</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {tentatives.map(t => (
                <div key={t.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#f8fafc", borderRadius:10, border:"1px solid #e5e7eb" }}>
                  <span style={{ padding:"3px 9px", borderRadius:10, background:"#EDE9FE", color:"#6D28D9", fontSize:11, fontWeight:700, flexShrink:0 }}>#{t.tentative_numero}</span>
                  <span style={{ fontSize:12, color:"#0f172a", fontWeight:600 }}>{t.score}{t.score_max?` / ${t.score_max}`:""}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:t.pourcentage>=70?"#059669":t.pourcentage>=40?"#D97706":"#DC2626" }}>{t.pourcentage!=null?`${t.pourcentage}%`:"-"}</span>
                  <span style={{ fontSize:11, color:"#9ca3af", marginLeft:"auto" }}>{new Date(t.created_at).toLocaleString("fr-FR")}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:16, textAlign:"right" }}>
              <button onClick={()=>setApprenantDetailMiniJeu(null)} style={btnS}>← Retour aux résultats</button>
            </div>
          </Modal>
        );
      })()}
      {/* À qui confier ce dossier. Monté à la racine, au-dessus de la fiche apprenant qui
          reste ouverte derrière : c'est de là qu'on l'ouvre le plus souvent. */}
      <SelecteurAssistante
        ouvert={!!selecteurAssistante}
        apprenant={selecteurAssistante}
        enCours={attributionEnCours}
        accent={PA_COLOR}
        onFermer={() => setSelecteurAssistante(null)}
        onConfirmer={(a) => attribuerAssistante(selecteurAssistante?.assignation_id, a.id)}
      />

      <FooterSaaS couleurTheme={PA_COLOR} />
    </div>
  );
}
