// src/Pages/SuperviseurDashboard/SuperviseurDashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RangeePastilles } from "../../Components/BarreFiltres";
import NotificationsTab    from "../../Components/NotificationsTab";
import NotificationBell    from "../../Components/NotificationBell";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import MessagerieTab        from "../../Components/MessagerieTab";
import { useLanguage }     from "../../contexts/LanguageContext";
import { useConfirm }      from "../../contexts/ConfirmContext";
import FooterSaaS          from "../../Components/FooterSaaS";
import DerouleReel, { dureeReelleMin, dureePrevueMin } from "../../Components/DerouleReel";
import { exporterAppraisalCoachs } from "../../utils/exporterAppraisalCoachs";
import { clearAllSessionStorage } from "../../utils/session";
import { assombrirCouleur } from "../../utils/couleurs";
import { useLivePermissions } from "../../utils/permissions";
import { openElearningSSO } from "../../utils/ssoElearning";
import { useTabState } from "../../hooks/useTabState";
import { useNotifications } from "../../hooks/useNotifications";
import { useFirebaseChat } from "../../hooks/useFirebaseChat";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";
import ChatGroupe from "../../Components/ChatGroupe";
import GroupesLibres from "../../Components/GroupesLibres";
import RessourcesCoach from "../../Components/RessourcesCoach";
import ArchiveApprenantsCoach from "../../Components/ArchiveApprenantsCoach";
import { useGroupesLibresNonLus } from "../../hooks/useGroupeChat";
import { useGroupesChatUnreadTotal } from "../../hooks/useGroupeChat";
import SeanceDetailModal from "../../Components/SeanceDetailModal";
import NomAvecSurnom from "../../Components/NomAvecSurnom";
import EvaluationsApprenants from "../../Components/EvaluationsApprenants";
import { exporterClassementCoachs } from "../../utils/exporterClassementCoachs";
import EvaluationsParents from "../../Components/EvaluationsParents";
import BadgeCategorieCoach from "../../Components/BadgeCategorieCoach";
import ContenuElearningDetail from "../../Components/ContenuElearningDetail";
import PlanningClasse, { SESSION_CLOSE, RAISON_CLOSE } from "../../Components/PlanningClasse";
import { estClassePrivee } from "../../utils/classePrivee";
import { FiltrePeriode, BarrePagination, paginer, dansLaPeriode } from "../../Components/FiltrePeriode";
import { urlDocument } from "../../utils/urlDocument";
import { CRITERES_OBSERVATION, CRITERES_LECTURE, LIBELLES_CRITERES,
         TYPES_OBSERVATION, TYPES_LECON, ETATS_INTERNET,
         libelleLecon, libelleObservation, libelleInternet } from "../../utils/criteresObservation";
import { NOTE_COULEUR, NOTE_FOND as NOTE_FOND_CAT,
         CATEGORIES_COACH, CATEGORIE_SANS_NOTE, categorieCoach } from "../../utils/categorieCoach";
// Une séance close n'a plus de salle ouverte : ni réalisée, ni terminée, ni annulée.
// `peutRejoindre` ne testait que la plateforme et la présence d'un lien - le statut
// n'entrait pas dans la décision, si bien que « Rejoindre » s'affichait en vert sur des
// cours donnés depuis des jours, menant vers une réunion fermée.
/** Une date ISO `YYYY-MM-DD` en heure locale - `toISOString()` décale d'un jour à l'ouest d'UTC. */
const isoJour = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
/** Premier et dernier jour d'un mois (mois de 1 à 12). */
const bornesMois = (mois, annee) => ({
  du: isoJour(new Date(annee, mois-1, 1)),
  au: isoJour(new Date(annee, mois, 0)),
});
const libelleMois = (mois, annee) =>
  new Date(annee, mois-1, 1).toLocaleDateString("fr-FR", { month:"long", year:"numeric" });

const STATUT_SEANCE_SUP = {
  realisee:  { lib:"Réalisée",  bg:"#DCFCE7", c:"#166534" },
  planifiee: { lib:"Planifiée", bg:"#DBEAFE", c:"#1E40AF" },
  annulee:   { lib:"Annulée",   bg:"#FEE2E2", c:"#991B1B" },
  en_cours:  { lib:"En cours",  bg:"#FEF3C7", c:"#92400E" },
};

/* SESSION_CLOSE / RAISON_CLOSE vivent désormais dans PlanningClasse, avec le seul écran
   qui dessine une séance. Les garder ici en aurait fait deux définitions de « une séance
   est-elle encore ouverte ? » — exactement la divergence que ce composant supprime. */

// Une salle ouverte et jamais refermée reste « en_cours » indéfiniment en base : sans borne,
// elle s'afficherait « En cours » pendant des jours et le superviseur croirait à un cours en
// train de se tenir. Au-delà de ce seuil, ce n'est plus un direct, c'est une anomalie.
const HEURES_AVANT_SALLE_ABANDONNEE = 4;
const SALLE_ABANDONNEE = (s) =>
  s?.statut === "en_cours" && !!s.demarree_at &&
  (Date.now() - new Date(s.demarree_at).getTime()) > HEURES_AVANT_SALLE_ABANDONNEE * 3600000;
const EN_DIRECT = (s) => s?.statut === "en_cours" && !SALLE_ABANDONNEE(s);

const API_URL       = process.env.REACT_APP_API_URL       || "http://localhost:5001";
const ELEARNING_URL = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";

const BET_COLOR    = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur || "#b45309"; } catch { return "#b45309"; } })();
const BET_LIGHT    = BET_COLOR + "18";
const BET_GRADIENT = `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(BET_COLOR)} 100%)`;

const authHdrs = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
});

const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric" }) : "-";

/* ─── Composants réutilisables ─── */
const StatCard = ({ label, value, color, icon, sub, onClick }) => (
  <div onClick={onClick} style={{ background:"#fff", padding:16, borderRadius:12, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:12, cursor:onClick?"pointer":"default", border:"1px solid #f1f5f9", transition:"transform .15s" }}>
    <div style={{ width:46, height:46, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{icon}</div>
    <div style={{ minWidth:0 }}>
      <div style={{ fontSize:11, color:"#9ca3af" }}>{label}</div>
      <div style={{ fontSize:21, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);

const Modal = ({ title, subtitle, onClose, children, wide, xl, big }) => (
  <div style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
    <div style={{ background:"#fff", borderRadius:16, width:big?"90vw":"95%", height:big?"90vh":undefined, maxWidth:big?"none":xl?1100:wide?760:560, maxHeight:"90vh", overflowY:"auto", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <h3 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#9ca3af" }}>✕</button>
      </div>
      {subtitle && <p style={{ margin:"0 0 16px", fontSize:12, color:"#9ca3af" }}>{subtitle}</p>}
      {children}
    </div>
  </div>
);

const Th = ({ children }) => (
  <th style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:".04em", borderBottom:"1px solid #e5e7eb", background:"#f8fafc", whiteSpace:"nowrap" }}>{children}</th>
);
const Td = ({ children, bold, color, center }) => (
  <td style={{ padding:"10px 14px", fontSize:13, fontWeight:bold?700:400, color:color||"inherit", borderBottom:"1px solid #f1f5f9", textAlign:center?"center":"left" }}>{children}</td>
);

const Badge = ({ label, color, bg }) => (
  <span style={{ padding:"2px 10px", borderRadius:99, fontSize:11, fontWeight:700, color, background:bg, whiteSpace:"nowrap" }}>{label}</span>
);

const conformiteBadge = (s) => {
  const map = { conforme:{ label:"Conforme", color:"#166534", bg:"#dcfce7" }, non_conforme:{ label:"Non conforme", color:"#991b1b", bg:"#fee2e2" }, en_attente:{ label:"En attente", color:"#92400e", bg:"#fef3c7" } };
  const m = map[s] || { label:s, color:"#374151", bg:"#f3f4f6" };
  return <Badge {...m} />;
};

const statutBadge = (s) => {
  const map = {
    ouvert:      { label:"Ouvert",       color:"#dc2626", bg:"#fee2e2" },
    en_cours:    { label:"En cours",     color:"#d97706", bg:"#fef3c7" },
    "escaladé":  { label:"Escaladé",     color:"#7c3aed", bg:"#ede9fe" },
    "fermé":     { label:"Fermé",        color:"#6b7280", bg:"#f3f4f6" },
    soumis:      { label:"Soumis",       color:"#1d4ed8", bg:"#dbeafe" },
    lu:          { label:"Lu",           color:"#0891b2", bg:"#e0f2fe" },
    transmis_pa: { label:"Transmis PA",  color:"#166534", bg:"#dcfce7" },
    "archivé":   { label:"Archivé",      color:"#6b7280", bg:"#f3f4f6" },
    "assignée":  { label:"Assignée",     color:"#1d4ed8", bg:"#dbeafe" },
    terminée:    { label:"Terminée",     color:"#166534", bg:"#dcfce7" },
    annulée:     { label:"Annulée",      color:"#6b7280", bg:"#f3f4f6" },
  };
  const m = map[s] || { label:s, color:"#374151", bg:"#f3f4f6" };
  return <Badge {...m} />;
};

const NoteCircle = ({ note }) => {
  if (note === null || note === undefined) return <span style={{ color:"#9ca3af", fontSize:12 }}>-</span>;
  const n = parseFloat(note);
  const color = NOTE_COULEUR(n);
  return (
    <div style={{ display:"inline-flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <div style={{ width:40, height:40, borderRadius:"50%", background:color+"18", border:`2px solid ${color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color }}>{n.toFixed(1)}</div>
      <BadgeCategorieCoach note={n} taille="xs" />
    </div>
  );
};

const EtoileRating = ({ value, onChange }) => (
  <div style={{ display:"flex", gap:4 }}>
    {[1,2,3,4,5].map(i => (
      <button key={i} type="button" onClick={()=>onChange(i)} style={{ fontSize:22, background:"none", border:"none", cursor:"pointer", color:i<=value?"#f59e0b":"#e2e8f0", transition:"color .15s" }}>★</button>
    ))}
  </div>
);

/* Valeurs de départ du formulaire de correction : celles du deputy, jamais des cases vides.
   Le superviseur corrige une erreur ponctuelle, il ne ressaisit pas le rapport.
   Fonction partagée par les deux points d'entrée (carte et modal) pour qu'ils ne divergent pas. */
const formCorrectionDepuis = (r) => ({
  ponctualite:           r.ponctualite ?? "",
  preparation:           r.preparation ?? "",
  pedagogie:             r.pedagogie ?? "",
  gestion_classe:        r.gestion_classe ?? "",
  professionnalisme:     r.professionnalisme ?? "",
  interactivite_classe:  r.interactivite_classe ?? "",
  approche_grammaticale: r.approche_grammaticale ?? "",
  expression_engagement: r.expression_engagement ?? "",
  feedback_correction:   r.feedback_correction ?? "",
  observations:          r.observations || "",
  recommandations:       r.recommandations || "",
});

/* ══════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════════════════════════ */
export default function SuperviseurDashboard() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLanguage();
  const profilInitial = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const { profil, peut } = useLivePermissions(profilInitial);
  const prenom    = profil?.prenom || "";
  const nom       = profil?.nom    || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "Superviseur";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "SV";
  const role           = profil?.role || "superviseur";
  const IS_GENERAL     = role === "superviseur" || role === "super_admin";
  const accesElearning = profil?.acces_elearning === true;
  const confirm = useConfirm();
  const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
  const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";

  const handleLogout = async () => {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    clearAllSessionStorage();
    navigate("/bet-staff-access", { replace:true });
  };

  // ─ Tabs selon le rôle
  const TABS_GENERAL = [
    { key:"taches",         icon:"✅", label:"Mes tâches" },
    { key:"dashboard",      icon:"🏠", label:"Vue d'ensemble" },
    { key:"plannings",      icon:"📅", label:"Plannings" },
    { key:"observer-cours", icon:"👁️",  label:"Observer un cours" },
    { key:"deputies",       icon:"👥", label:"Gestion Deputies" },
    { key:"cahiers",        icon:"📓", label:"Cahiers coachs" },
    { key:"classement",     icon:"🏆", label:"Classement" },
    { key:"eval-apprenants", icon:"⭐", label:"Évaluations apprenants" },
    { key:"eval-parents",   icon:"👨‍👩‍👧", label:"Évaluations parents" },
    { key:"rapports",       icon:"📋", label:"Rapports Deputy" },
    { key:"anomalies",      icon:"⚠️",  label:"Anomalies" },
    { key:"messagerie",     icon:"💬", label:"Messagerie" },
    { key:"notifications",  icon:"🔔", label:"Notifications" },
  ];
  const TABS_DEPUTY = [
    { key:"taches",         icon:"✅", label:"Mes tâches" },
    { key:"dashboard",      icon:"🏠", label:"Vue d'ensemble" },
    { key:"plannings",      icon:"📅", label:"Plannings" },
    { key:"observer-cours", icon:"👁️",  label:"Observer un cours" },
    /* Le deputy prépare son observation en lisant le cahier du coach - jours, heures et lien
       de la classe - avant de s'y rendre. L'onglet est le même que celui du Superviseur
       Général : lecture seule de bout en bout, le signalement d'anomalie restant réservé
       au global (voir les gardes IS_GENERAL sur les boutons « Signaler »). */
    { key:"cahiers",        icon:"📓", label:"Cahiers coachs" },
    { key:"rapports",       icon:"📋", label:"Mes rapports" },
    { key:"missions",       icon:"🎯", label:"Mes missions" },
    { key:"messagerie",     icon:"💬", label:"Messagerie" },
    { key:"notifications",  icon:"🔔", label:"Notifications" },
  ];
  const tabs = IS_GENERAL ? TABS_GENERAL : TABS_DEPUTY;

  const [activeTab, setActiveTab] = useTabState("dashboard");
  const { notifications: toutesNotifsSup, nbNonLues: notifNonLuesSup, marquerLue: marquerNotifLueSup } = useNotifications(profil?.id);
  const { unreadTotal: msgNonLusSup } = useFirebaseChat();
  const [msgSubTab, setMsgSubTab] = useState("prive");
  const [banderoleFermeeSup, setBanderoleFermeeSup] = useState(false);
  const notifsBanderoleSup = toutesNotifsSup.filter(n => !n.lu).slice(0, 3);

  // ─ États données
  const [kpi,          setKpi]          = useState(null);
  const [kpiLoading,   setKpiLoading]   = useState(true);
  const [coachs,       setCoachs]       = useState([]);
  const [coachsLoading,setCoachsLoading]= useState(false);
  const [coachSearch,  setCoachSearch]  = useState("");
  // Filtre par categorie de contrat du cahier coachs. "" = toutes.
  const [coachCategorie, setCoachCategorie] = useState("");
  const [coachFiltre,  setCoachFiltre]  = useState("tous");
  const [coachDetail,       setCoachDetail]       = useState(null);
  const [coachModalTab,     setCoachModalTab]     = useState("infos");
  const [coachRapports,        setCoachRapports]        = useState([]);
  const [coachRapportsLoading, setCoachRapportsLoading] = useState(false);
  const [coachGroupes,      setCoachGroupes]      = useState([]);
  const [coachGroupesLoading,setCoachGroupesLoading]= useState(false);
  const [coachDispos,       setCoachDispos]       = useState([]);
  const [coachDisposLoading,setCoachDisposLoading]= useState(false);
  const [rapportExpanded,   setRapportExpanded]   = useState(new Set());
  // Filtre par date des observations d'un coach, dans sa fiche.
  const [coachObsDu, setCoachObsDu] = useState("");
  const [coachObsAu, setCoachObsAu] = useState("");
  const [coachCours,        setCoachCours]        = useState([]);
  const [coachCoursLoading, setCoachCoursLoading] = useState(false);
  const [supCoursPage,      setSupCoursPage]      = useState(1);
  const SUP_COURS_PER_PAGE = 10;
  const [supCoursDateFrom,  setSupCoursDateFrom]  = useState("");
  const [supCoursDateTo,    setSupCoursDateTo]    = useState("");
  // Filtre par classe des modules e-learning du coach. "" = toutes.
  const [supCoursClasse,    setSupCoursClasse]    = useState("");
  // Le contenu ouvert en lecture integrale. Monte a la RACINE du rendu et non dans
  // l'onglet : un modal declare dans une fonction de rendu d'onglet disparait des qu'on
  // change d'onglet - defaut deja rencontre trois fois dans cet ecran.
  const [contenuOuvert,     setContenuOuvert]     = useState(null);
  // Les séances réelles du coach, chargées pour l'onglet Séances du Cahier coachs : elles
  // portent leur date, leur durée prévue, le temps réellement passé en salle et les présences.
  const [coachSeances,   setCoachSeances]   = useState([]);
  const [coachSeancesLoading, setCoachSeancesLoading] = useState(false);
  // Onglet Séances du Cahier coachs - même source que l'onglet Honoraires (`coachSeances`),
  // lue ici pour elle-même : ce qui a été fait, quand, combien de temps et avec qui.
  const [supSeanceDetail, setSupSeanceDetail] = useState(null);
  const [supSeancesStatut, setSupSeancesStatut] = useState("toutes");
  const [supSeancesDu,     setSupSeancesDu]     = useState("");
  const [supSeancesAu,     setSupSeancesAu]     = useState("");
  const [supSeancesSearch, setSupSeancesSearch] = useState("");
  const [supSeancesPage,   setSupSeancesPage]   = useState(1);
  const SUP_SEANCES_PER_PAGE = 10;
  // Le coach renseigne ses disponibilités MOIS PAR MOIS : la route attend `mois` et `annee`,
  // mais l'écran ne les envoyait pas et retombait donc toujours sur le mois courant - sans
  // jamais le dire. Un superviseur consultant en octobre voyait « aucun créneau » pour un
  // coach qui avait rempli septembre.
  const now0 = new Date();
  const [coachDispoMois,  setCoachDispoMois]  = useState(now0.getMonth() + 1);
  const [coachDispoAnnee, setCoachDispoAnnee] = useState(now0.getFullYear());
  const [supClassePage,     setSupClassePage]     = useState(1);
  const SUP_CLASSE_PER_PAGE = 8;
  const [supClasseDateFrom, setSupClasseDateFrom] = useState("");
  const [supClasseDateTo,   setSupClasseDateTo]   = useState("");
  const [obsDateFrom,       setObsDateFrom]       = useState("");
  const [obsDateTo,         setObsDateTo]         = useState("");
  const [obsPage,           setObsPage]           = useState(1);
  const OBS_PER_PAGE = 10;
  // ─ États onglet Plannings
  const [plannings,         setPlannings]         = useState([]);
  const [planningsLoading,  setPlanningsLoading]  = useState(false);
  const [planningStatut,    setPlanningStatut]    = useState("tous");
  const [planningDateFrom,  setPlanningDateFrom]  = useState("");
  const [planningDateTo,    setPlanningDateTo]    = useState("");
  const [planningPage,      setPlanningPage]      = useState(1);
  const PLANNING_PER_PAGE = 20;
  const [planningDetail,    setPlanningDetail]    = useState(null);
  const [planningError,     setPlanningError]     = useState(null);
  const [planningPresences,        setPlanningPresences]        = useState([]);
  const [planningPresencesLoading, setPlanningPresencesLoading] = useState(false);
  // ─ Détail groupe/classe depuis modal coach
  const [selectedGroupe,    setSelectedGroupe]    = useState(null);
  const [groupeDetail,      setGroupeDetail]      = useState({ apprenants:[], fichiers:[] });
  const [groupeDetailLoading,setGroupeDetailLoading]= useState(false);
  const [groupeSeances,     setGroupeSeances]     = useState([]);
  const [groupeSeancesLoading, setGroupeSeancesLoading] = useState(false);
  const [groupePresences,   setGroupePresences]   = useState([]);
  const [groupePresencesLoading, setGroupePresencesLoading] = useState(false);
  // Filtres de période et pagination des onglets Présences et Fichiers du détail de classe.
  const [presDu, setPresDu] = useState(""); const [presAu, setPresAu] = useState(""); const [presPage, setPresPage] = useState(1);
  const [fichDu, setFichDu] = useState(""); const [fichAu, setFichAu] = useState(""); const [fichPage, setFichPage] = useState(1);
  const [groupeSubTab,      setGroupeSubTab]      = useState("apprenants");
  // ─ États deputy spécifiques
  const [classes,       setClasses]       = useState([]);
  const [classesLoading,setClassesLoading]= useState(false);

  // Le superviseur et le deputy suivent les cours : ils doivent voir ce qui se dit dans les
  // classes, au même titre que la commerciale et l'onboarding.
  const chatGroupeNonLus = useGroupesChatUnreadTotal(classes.map(g => g.id), profil?.id);
  // Les non-lus des groupes LIBRES, calculés ici et non dans l'écran des groupes : la
  // pastille doit s'allumer alors même que l'onglet n'est pas ouvert.
  const groupesLibresNonLus = useGroupesLibresNonLus(localStorage.getItem("admin_token"), profil?.id);
  const [classeDetail,  setClasseDetail]  = useState(null);
  const [classeApprenants, setClasseApprenants] = useState([]);
  const [classeAppLoading, setClasseAppLoading] = useState(false);
  const [classeModalTab, setClasseModalTab] = useState("apprenants");
  const [classeSessions, setClasseSessions] = useState([]);
  const [classeSessionsLoading, setClasseSessionsLoading] = useState(false);
  const [deputyKpi,    setDeputyKpi]    = useState({ rapports_soumis:0, rapports_en_attente:0, rapports_commentes:0, missions_actives:0, missions_total:0, derniere_observation:null });
  const [missions,     setMissions]     = useState([]);

  const [rapports,         setRapports]         = useState([]);
  // Classement des coachs - construit côté client depuis les rapports, comme chez le PA :
  // c'est ce qui permet de le recalculer par période sans rappeler le serveur.
  const [classementPeriode, setClassementPeriode] = useState("semaine");
  const [classementDu,   setClassementDu]   = useState("");
  const [classementAu,   setClassementAu]   = useState("");
  const [classementPage, setClassementPage] = useState(1);
  const CLASSEMENT_PAR_PAGE = 8;
  const [rapportsLoading,  setRapportsLoading]   = useState(false);
  const [rapportDetail,    setRapportDetail]     = useState(null);
  const [correctionForm,   setCorrectionForm]   = useState(null);   // null = mode lecture, jamais éditable par défaut
  const [motifCorrection,  setMotifCorrection]  = useState("");
  const [showRapportForm,  setShowRapportForm]   = useState(false);
  const [rapportExpanded2, setRapportExpanded2]  = useState(new Set());
  const [rapportPage,      setRapportPage]       = useState(1);
  const RAPPORT_PER_PAGE = 8;
  const [rapportDateFrom,  setRapportDateFrom]   = useState("");
  const [rapportDateTo,    setRapportDateTo]     = useState("");
  const [rapportCoachFilter, setRapportCoachFilter] = useState("");
  const [rapportStatutFilter, setRapportStatutFilter] = useState("");
  const RAPPORT_INIT = {
    coach_id:"", date_observation:"", centre:"", classe:"", groupe_id:"", seance_id:"", session_live_id:"",
    ponctualite:0, preparation:0, pedagogie:0, gestion_classe:0, professionnalisme:0,
    // Critères repris de la feuille terrain, absents jusqu'ici du rapport.
    expression_engagement:0, feedback_correction:0,
    interactivite_classe:"", approche_grammaticale:"",
    type_observation:"cours", type_lecon:"",
    // Hors note : constat de contexte, pas une performance du coach.
    internet:"",
    observations:"", recommandations:"",
  };

  // Les échelles fermées et leur conversion en points - mêmes valeurs que côté serveur, qui
  // reste seul juge de la note enregistrée. Ici, c'est pour montrer le poids à la saisie.
  const ECHELLE_INTERACTIVITE = [
    { v:"excellent",   l:"Excellent",   pts:5, d:"tous sollicités, échanges entre apprenants" },
    { v:"bon",         l:"Bon",         pts:4, d:"la majorité participe" },
    { v:"acceptable",  l:"Acceptable",  pts:3, d:"participation inégale" },
    { v:"insuffisant", l:"Insuffisant", pts:1, d:"cours frontal, apprenants passifs" },
  ];
  const ECHELLE_GRAMMAIRE = [
    { v:"inductive_claire",       l:"Inductive et claire",           pts:5, d:"la règle est dégagée par les apprenants" },
    { v:"inductive_perfectible",  l:"Inductive, explication à revoir", pts:4, d:"démarche juste, formulation confuse" },
    { v:"deductive_claire",       l:"Déductive mais claire",         pts:3, d:"règle donnée puis appliquée" },
    { v:"confuse",                l:"Confuse ou erronée",            pts:1, d:"« Not Induc & Confu » de la feuille" },
  ];
  const [rapportForm,  setRapportForm]  = useState(RAPPORT_INIT);
  const [rapportCoachGroupes,        setRapportCoachGroupes]        = useState([]);
  const [rapportCoachGroupesLoading, setRapportCoachGroupesLoading] = useState(false);
  const [rapportClasseFiltre,        setRapportClasseFiltre]        = useState("actif");
  // Les séances de la classe sélectionnée - pour dire QUELLE séance a été observée.
  // Sans ce lien, deux rapports sur la même classe le même jour sont indiscernables, et une
  // note ne se rapporte à aucun cours précis.
  const [rapportSeances,        setRapportSeances]        = useState([]);
  const [rapportSeancesLoading, setRapportSeancesLoading] = useState(false);
  // Les présences de la séance observée : noter « gestion de classe » n'a pas le même sens
  // devant 2 apprenants ou devant 12.
  const [rapportPresences,      setRapportPresences]      = useState({ loading:false, liste:null });
  const [rapportCoachRecherche, setRapportCoachRecherche] = useState("");
  const [centresBet,            setCentresBet]            = useState([]);
  const [anomalies,    setAnomalies]    = useState([]);
  const [anomLoading,  setAnomLoading]  = useState(false);
  const [showAnomForm, setShowAnomForm] = useState(false);
  const [anomDetail,   setAnomDetail]   = useState(null);
  const ANOM_INIT = { coach_id:"", type_anomalie:"cahier_incomplet", description:"", gravite:"moyenne" };
  const [anomForm,     setAnomForm]     = useState(ANOM_INIT);
  const [deputies,     setDeputies]     = useState([]);
  const [deputiesLoading,setDeputiesLoading] = useState(false);
  const [deputySelected,setDeputySelected] = useState(null);
  const [showMissionForm,setShowMissionForm] = useState(false);
  const MISSION_INIT = { type_mission:"observation", titre:"", description:"", coach_id:"", centre:"", date_debut:"", date_fin:"" };
  const [missionForm,  setMissionForm]  = useState(MISSION_INIT);
  const [missionSaving,setMissionSaving]= useState(false);
  const [rapportSaving, setRapportSaving] = useState(false);
  const [anomSaving, setAnomSaving] = useState(false);
  const [rapportActionLoading, setRapportActionLoading] = useState(new Set());
  const [anomActionLoading, setAnomActionLoading] = useState(new Set());

  /* ── Fetch ── */
  const fetchKpi = useCallback(async () => {
    setKpiLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/dashboard`, { headers:authHdrs() });
      if (r.ok) setKpi(await r.json());
    } catch {} finally { setKpiLoading(false); }
  }, []);

  const fetchCoachs = useCallback(async () => {
    setCoachsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/coachs-conformite`, { headers:authHdrs() });
      if (r.ok) {
        const d = await r.json();
        if ((d.coachs || []).length > 0) { setCoachs(d.coachs); return; }
      }
      // Fallback : récupérer la liste depuis /api/admin/utilisateurs?role=coach
      const r2 = await fetch(`${API_URL}/api/admin/utilisateurs?role=coach`, { headers:authHdrs() });
      if (r2.ok) {
        const d2 = await r2.json();
        const liste = (d2.utilisateurs || []).map(c => ({
          ...c,
          nb_groupes: c.nbr_contrats_actifs || 0, nb_evaluations: 0, note_moyenne: null,
          nb_anomalies: 0, statut_conformite: "en_attente", groupes: [],
        }));
        setCoachs(liste);
      }
    } catch (err) {
      console.error("[fetchCoachs]", err);
    } finally {
      setCoachsLoading(false);
    }
  }, []);

  const openCoachModal = (coach) => {
    setCoachDetail(coach);
    setCoachModalTab("infos");
    setCoachRapports([]);
    setCoachGroupes([]);
    setCoachDispos([]);
    setCoachCours([]);
    setRapportExpanded(new Set());
    setCoachObsDu(""); setCoachObsAu("");
    setCoachDispoMois(new Date().getMonth() + 1); setCoachDispoAnnee(new Date().getFullYear());
    setSelectedGroupe(null);
    setSupCoursPage(1); setSupCoursDateFrom(""); setSupCoursDateTo("");
    setCoachSeances([]);
    setSupSeancesStatut("toutes"); setSupSeancesDu(""); setSupSeancesAu(""); setSupSeancesSearch(""); setSupSeancesPage(1);
    setSupClassePage(1); setSupClasseDateFrom(""); setSupClasseDateTo("");
    // La requête vers /coachs/:id/evaluations a été retirée avec le bloc qu'elle alimentait :
    // `evaluations_coachs` n'a aucun écran de saisie dans toute l'application.
    // Rapports d'observation Deputy
    setCoachRapportsLoading(true);
    fetch(`${API_URL}/api/superviseur/rapports-deputy?coach_id=${coach.id}`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { rapports: [] })
      .then(d => setCoachRapports(d.rapports || []))
      .catch(() => {})
      .finally(() => setCoachRapportsLoading(false));
    // Groupes
    setCoachGroupesLoading(true);
    fetch(`${API_URL}/api/groupes?coach_id=${coach.id}`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { groupes: [] })
      .then(d => setCoachGroupes(d.groupes || []))
      .catch(() => setCoachGroupes([]))
      .finally(() => setCoachGroupesLoading(false));
  };

  const fetchCoachDispos = async (coachId, mois = coachDispoMois, annee = coachDispoAnnee) => {
    setCoachDisposLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/coachs/${coachId}/disponibilites?mois=${mois}&annee=${annee}`, { headers: authHdrs() });
      const d = r.ok ? await r.json() : { disponibilites: [] };
      setCoachDispos(d.disponibilites || []);
    } catch {}
    finally { setCoachDisposLoading(false); }
  };

  const fetchCoachCours = async (coachId) => {
    setCoachCoursLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/cours-elearning?coach_id=${coachId}`, { headers: authHdrs() });
      const d = r.ok ? await r.json() : { contenus: [] };
      setCoachCours(d.contenus || []);
    } catch { setCoachCours([]); }
    finally { setCoachCoursLoading(false); }
  };

  /* Détail d'une classe, ouvert depuis le Cahier coachs (coach → Classes → une classe).
     `/api/groupes/:id` renvoie la classe ENRICHIE - coach (nom, email, téléphone), centre
     (nom, ville, adresse) et toutes les colonnes, dont l'horaire hebdomadaire. Cet écran
     n'en gardait que les apprenants et les fichiers, et se rabattait sur la ligne du
     tableau pour l'onglet Infos : d'où huit champs figés là où l'API en offrait vingt. */
  const openGroupeDetail = async (groupe) => {
    setSelectedGroupe(groupe);
    setGroupeSubTab("infos");
    setGroupeDetail({ apprenants:[], fichiers:[] });
    setGroupeSeances([]); setGroupePresences([]);
    // Les filtres appartiennent à la classe consultée : les laisser en place ferait
    // ouvrir la classe suivante sur une période choisie pour la précédente.
    setPresDu(""); setPresAu(""); setPresPage(1);
    setFichDu(""); setFichAu(""); setFichPage(1);
    setGroupeDetailLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${groupe.id}`, { headers: authHdrs() });
      const d = await r.json();
      setGroupeDetail({ apprenants: d.apprenants || [], fichiers: d.fichiers || [] });
      // La ligne du tableau reste la base : elle porte nb_apprenants, que le détail ne calcule pas.
      if (d.groupe) setSelectedGroupe(g => (g && g.id === groupe.id) ? { ...g, ...d.groupe } : g);
    } catch {}
    finally { setGroupeDetailLoading(false); }

    // Séances et présences en parallèle : deux onglets distincts, aucune raison
    // d'attendre l'un pour afficher l'autre.
    setGroupeSeancesLoading(true);
    fetch(`${API_URL}/api/seances?groupe_id=${groupe.id}`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { seances: [] })
      .then(d => setGroupeSeances(d.seances || []))
      .catch(() => setGroupeSeances([]))
      .finally(() => setGroupeSeancesLoading(false));

    setGroupePresencesLoading(true);
    fetch(`${API_URL}/api/groupes/${groupe.id}/presences`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { presences: [] })
      .then(d => setGroupePresences(d.presences || []))
      .catch(() => setGroupePresences([]))
      .finally(() => setGroupePresencesLoading(false));
  };

  const fetchRapports = useCallback(async () => {
    setRapportsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/rapports-deputy`, { headers:authHdrs() });
      if (r.ok) { const d = await r.json(); setRapports(d.rapports || []); }
    } catch {} finally { setRapportsLoading(false); }
  }, []);

  const fetchAnomalies = useCallback(async () => {
    setAnomLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/anomalies`, { headers:authHdrs() });
      if (r.ok) { const d = await r.json(); setAnomalies(d.anomalies || []); }
    } catch {} finally { setAnomLoading(false); }
  }, []);

  const fetchDeputies = useCallback(async () => {
    setDeputiesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/deputies`, { headers:authHdrs() });
      if (r.ok) { const d = await r.json(); setDeputies(d.deputies || []); }
    } catch {} finally { setDeputiesLoading(false); }
  }, []);

  // ─ Fetch classes (lecture seule - pour le deputy)
  const fetchClasses = useCallback(async () => {
    setClassesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes`, { headers:authHdrs() });
      if (r.ok) { const d = await r.json(); setClasses(d.groupes || d || []); }
    } catch {} finally { setClassesLoading(false); }
  }, []);

  // Les classes sont chargées dès le départ, et non à l'ouverture d'« Observer un cours » :
  // le chat de classe et son compteur de non-lus en dépendent depuis n'importe quel onglet.
  useEffect(() => { fetchClasses(); }, [fetchClasses]);


  // ─ Fetch apprenants d'une classe (lecture seule)
  const fetchClasseApprenants = useCallback(async (classeId) => {
    setClasseAppLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${classeId}`, { headers:authHdrs() });
      if (r.ok) { const d = await r.json(); setClasseApprenants(d.apprenants || []); }
    } catch {} finally { setClasseAppLoading(false); }
  }, []);

  // ─ Fetch séances programmées d'une classe (lecture seule) - pour l'onglet Disponibilités et sessions
  const fetchClasseSessions = useCallback(async (classeId) => {
    setClasseSessionsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/seances?groupe_id=${classeId}`, { headers:authHdrs() });
      if (r.ok) { const d = await r.json(); setClasseSessions(d.seances || []); }
    } catch {} finally { setClasseSessionsLoading(false); }
  }, []);

  const fetchRapportCoachGroupes = useCallback(async (coachId) => {
    if (!coachId) { setRapportCoachGroupes([]); return; }
    setRapportCoachGroupesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes?coach_id=${coachId}`, { headers:authHdrs() });
      if (r.ok) { const d = await r.json(); setRapportCoachGroupes(d.groupes || d || []); }
    } catch {} finally { setRapportCoachGroupesLoading(false); }
  }, []);

  // Le lieu d'une classe, tel qu'on l'écrirait à la main.
  //
  // Le champ « Centre » restait systématiquement vide alors que l'information existe sur la
  // classe : `centre_id` pour le présentiel, `type_cours` pour le reste. On le pré-remplit,
  // sans jamais le verrouiller - un cours peut se tenir ailleurs que dans son centre de
  // rattachement, et le superviseur doit pouvoir le corriger.
  const lieuDeLaClasse = (g) => {
    if (!g) return "";
    if (g.centre_id) return centresBet.find(c => c.id === g.centre_id)?.nom || g.centre_id;
    if (g.type_cours === "en_ligne") return "En ligne";
    return "";
  };

  // Les centres BET - pour renseigner le lieu à partir de la classe choisie.
  useEffect(() => {
    fetch(`${API_URL}/api/centres`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setCentresBet(d?.centres || []))
      .catch(() => {});
  }, []);

  // Les classes du coach se chargent dès que `coach_id` change, et NON plus seulement dans
  // le `onChange` du sélecteur.
  //
  // Le formulaire s'ouvre par plusieurs chemins : le bouton « Nouveau rapport », une mission
  // assignée, et surtout « Observer » depuis la liste des classes, qui pré-remplit le coach
  // sans passer par le sélecteur. Par ces chemins-là, la liste des classes restait vide et le
  // modal paraissait différent de celui de « Mes rapports » - c'était le même, mal alimenté.
  useEffect(() => {
    fetchRapportCoachGroupes(rapportForm.coach_id);
  }, [rapportForm.coach_id, fetchRapportCoachGroupes]);

  // On ne propose que les séances qui ont EU LIEU : on n'observe pas un cours à venir.
  //
  // « A eu lieu » se juge sur le statut AVANT la date. Une séance clôturée par le coach mais
  // programmée la semaine prochaine s'est bel et bien tenue - la filtrer sur la seule date
  // vidait la liste. C'est le même piège que sur les compteurs de l'onboarding, du coach et
  // du superviseur : deux endroits qui décident séparément de ce qu'est « passé ».
  //
  // Les plus récentes d'abord : c'est presque toujours celle-là qu'on vient de superviser.
  useEffect(() => {
    const gid = rapportForm.groupe_id;
    if (!gid) { setRapportSeances([]); return; }
    let annule = false;
    setRapportSeancesLoading(true);
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/seances?groupe_id=${gid}`, { headers: authHdrs() });
        const d = await r.json().catch(() => ({}));
        if (annule) return;
        const maintenant = new Date();
        const aEuLieu = (x) =>
          ["realisee", "terminee", "en_cours"].includes(x.statut) ||
          (x.date_seance && new Date(`${x.date_seance}T${x.heure_debut || "00:00"}`) <= maintenant);
        const tenues = (d.seances || [])
          .filter(x => x.date_seance && aEuLieu(x) && x.statut !== "annulee")
          .sort((a, b) => String(b.date_seance).localeCompare(String(a.date_seance)));
        setRapportSeances(tenues);
      } catch { if (!annule) setRapportSeances([]); }
      finally { if (!annule) setRapportSeancesLoading(false); }
    })();
    return () => { annule = true; };
  }, [rapportForm.groupe_id]);

  // La route sait retrouver les présences aussi bien dans `seances_presences` que dans
  // `groupes_presences`, où le coach pointe en réalité.
  useEffect(() => {
    const sid = rapportForm.seance_id;
    if (!sid) { setRapportPresences({ loading:false, liste:null }); return; }
    let annule = false;
    setRapportPresences({ loading:true, liste:null });
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/seances/${sid}/presences`, { headers: authHdrs() });
        const d = await r.json().catch(() => ({}));
        if (!annule) setRapportPresences({ loading:false, liste: r.ok ? (d.presences || []) : [] });
      } catch { if (!annule) setRapportPresences({ loading:false, liste:[] }); }
    })();
    return () => { annule = true; };
  }, [rapportForm.seance_id]);

  // Présélection quand la date d'observation ne correspond qu'à une seule séance : c'est le
  // cas courant, et le superviseur n'a alors rien à choisir.
  useEffect(() => {
    if (!rapportForm.date_observation || rapportForm.seance_id) return;
    const duJour = rapportSeances.filter(x => x.date_seance === rapportForm.date_observation);
    if (duJour.length === 1) {
      setRapportForm(p => ({ ...p, seance_id: duJour[0].id, session_live_id: duJour[0].session_live_id || "" }));
    }
  }, [rapportSeances, rapportForm.date_observation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Fetch missions du deputy
  const fetchMissions = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/superviseur/anomalies`, { headers:authHdrs() });
      // Les missions sont récupérées via le dashboard KPI pour l'instant
    } catch {}
  }, []);

  // ─ Fetch KPI deputy (depuis ses rapports soumis)
  const fetchDeputyKpi = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/superviseur/rapports-deputy`, { headers:authHdrs() });
      if (r.ok) {
        const d = await r.json();
        const mesSrapports = (d.rapports||[]).filter(rp => rp.deputy_id === profil?.id);
        setDeputyKpi({
          rapports_soumis:   mesSrapports.length,
          rapports_transmis: mesSrapports.filter(rp => rp.statut === "transmis_pa").length,
          // « Rapports soumis » n'est pas une tâche : soumettre est déjà fait, et le compteur
          // ne redescend jamais. Ce qui attend réellement quelque chose, c'est un rapport que
          // le superviseur n'a pas encore lu - il disparaît de la liste dès qu'il clique « Lu ».
          rapports_en_attente: mesSrapports.filter(rp => rp.statut === "soumis").length,
          // Et un retour du superviseur que le deputy n'a pas encore vu : c'est le seul
          // commentaire qu'il reçoit sur son travail.
          rapports_commentes:  mesSrapports.filter(rp => rp.commentaire_superviseur && rp.statut !== "soumis").length,
          missions_actives:  0,
          missions_total:    0,
          derniere_observation: mesSrapports[0]?.date_observation || null,
        });
      }
    } catch {}
  }, [profil?.id]);

  // ─ Fetch plannings (toutes les sessions live, filtrables par statut/date)
  const fetchPlannings = useCallback(async () => {
    setPlanningsLoading(true);
    setPlanningError(null);
    try {
      const params = new URLSearchParams();
      if (planningStatut !== "tous") params.set("statut", planningStatut);
      if (planningDateFrom) params.set("date_debut", planningDateFrom);
      if (planningDateTo)   params.set("date_fin", planningDateTo);
      const r = await fetch(`${API_URL}/api/coachs/sessions-live/superviseur?${params}`, { headers:authHdrs() });
      if (r.ok) {
        const d = await r.json();
        setPlannings(d.sessions || []);
      } else {
        const body = await r.json().catch(()=>({}));
        setPlanningError(`Erreur ${r.status} : ${body.error || "requête refusée"}`);
        setPlannings([]);
      }
    } catch (e) {
      setPlanningError(`Erreur réseau : ${e.message}`);
      setPlannings([]);
    } finally {
      setPlanningsLoading(false);
    }
  }, [planningStatut, planningDateFrom, planningDateTo]);

  useEffect(() => {
    fetchKpi();
    if (!IS_GENERAL) fetchDeputyKpi();
  }, [fetchKpi, fetchDeputyKpi]); // eslint-disable-line

  useEffect(() => {
    if (activeTab === "cahiers")        fetchCoachs();
    if (activeTab === "classement")     { fetchRapports(); fetchCoachs(); }
    if (activeTab === "rapports")       { fetchRapports(); fetchCoachs(); }
    if (activeTab === "anomalies")      fetchAnomalies();
    if (activeTab === "deputies")       fetchDeputies();
    if (activeTab === "observer-cours") { fetchClasses(); fetchCoachs(); }
    if (activeTab === "missions")       fetchDeputyKpi();
    if (activeTab === "plannings")      fetchPlannings();
  }, [activeTab]); // eslint-disable-line

  // Le badge « en direct » de l'onglet Plannings se calcule sur cette liste : la charger
  // seulement à l'ouverture de l'onglet l'aurait laissé à zéro partout ailleurs - c'est
  // justement quand on regarde un autre onglet qu'il doit alerter.
  //
  // Et un direct commence et se termine pendant qu'on est ailleurs : sans rafraîchissement,
  // le badge annoncerait un cours fini depuis une heure, ou raterait celui qui vient de
  // s'ouvrir. Deux minutes suffisent pour un cours qui dure 90.
  useEffect(() => {
    fetchPlannings();
    const iv = setInterval(fetchPlannings, 2 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetchPlannings]);

  const coursEnDirect = plannings.filter(EN_DIRECT).length;
  // Les séances programmées à venir : c'est la charge d'observation qui attend le superviseur
  // et son deputy. Comptées sur les séances RÉELLEMENT à venir - une session clôturée mais
  // datée de la semaine prochaine n'attend plus personne.
  const seancesAVenir = plannings.filter(x =>
    !SESSION_CLOSE(x.statut) && x.statut !== "en_cours" &&
    x.date && new Date(`${x.date}T${x.heure || "00:00"}`) >= new Date()
  ).length;

  useEffect(() => {
    if (activeTab === "plannings") { fetchPlannings(); setPlanningPage(1); }
  }, [planningStatut, planningDateFrom, planningDateTo]); // eslint-disable-line

  useEffect(() => {
    if (!planningDetail?.seance_id) { setPlanningPresences([]); return; }
    setPlanningPresencesLoading(true);
    fetch(`${API_URL}/api/seances/${planningDetail.seance_id}/presences`, { headers:authHdrs() })
      .then(r => r.ok ? r.json() : { presences:[] })
      .then(d => setPlanningPresences(d.presences || []))
      .catch(() => setPlanningPresences([]))
      .finally(() => setPlanningPresencesLoading(false));
  }, [planningDetail?.seance_id]);

  useEffect(() => {
    if (coachModalTab === "disponibilite" && coachDetail) fetchCoachDispos(coachDetail.id, coachDispoMois, coachDispoAnnee);
    if (coachModalTab === "seances" && coachDetail) {
      setCoachSeancesLoading(true);
      fetch(`${API_URL}/api/seances?coach_id=${coachDetail.id}`, { headers: authHdrs() })
        .then(r => r.ok ? r.json() : { seances: [] })
        .then(d => setCoachSeances(d.seances || []))
        .catch(() => setCoachSeances([]))
        .finally(() => setCoachSeancesLoading(false));
    }
    if (coachModalTab === "modules"       && coachDetail) fetchCoachCours(coachDetail.id);
  }, [coachModalTab, coachDetail?.id, coachDispoMois, coachDispoAnnee]); // eslint-disable-line

  // Synchronise le modal coach avec la liste rafraîchie après fetchCoachs()
  useEffect(() => {
    if (coachDetail) {
      const updated = coachs.find(c => c.id === coachDetail.id);
      if (updated && updated.note_moyenne !== coachDetail.note_moyenne) {
        setCoachDetail(updated);
      }
    }
  }, [coachs]); // eslint-disable-line

  /* ── Actions ── */
  const marquerLu = async (id) => {
    if (rapportActionLoading.has(id)) return;
    setRapportActionLoading(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${API_URL}/api/superviseur/rapports-deputy/${id}`, { method:"PATCH", headers:authHdrs(), body:JSON.stringify({ statut:"lu" }) });
      if (r.ok) fetchRapports();
    } finally { setRapportActionLoading(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const transmettrePA = async (id) => {
    if (rapportActionLoading.has(id)) return;
    setRapportActionLoading(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${API_URL}/api/superviseur/rapports-deputy/${id}`, { method:"PATCH", headers:authHdrs(), body:JSON.stringify({ statut:"transmis_pa" }) });
      if (r.ok) { toast.success("Rapport transmis au Pedagogical Advisor"); fetchRapports(); }
    } finally { setRapportActionLoading(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const soumettrRapport = async () => {
    if (rapportSaving) return;
    if (!rapportForm.coach_id || !rapportForm.date_observation) { toast.error("Coach et date requis"); return; }

    /* LES SEPT CRITÈRES SONT OBLIGATOIRES, et c'est le barème qui l'impose.
       Un critère laissé vide est écarté AVEC SON POIDS : le rapport se calcule alors sur 30
       au lieu de 35, et sa note cesse d'être comparable à celle des autres. Quatre rapports
       de septembre 2026 sont dans ce cas - le professionnalisme n'y avait pas été saisi -
       et leur coach apparaît sur une échelle qui n'est pas celle de ses collègues.
       Mieux vaut refuser un rapport incomplet que le laisser fausser un classement. */
    const CRITERES_REQUIS = [
      ["preparation",           "Organisation du cours"],
      ["pedagogie",             "Pédagogie"],
      ["expression_engagement", "Expression & engagement"],
      ["gestion_classe",        "Gestion de classe"],
      ["feedback_correction",   "Feedback & correction"],
      ["ponctualite",           "Ponctualité"],
      ["professionnalisme",     "Professionnalisme"],
    ];
    const manquants = CRITERES_REQUIS.filter(([cle]) => !(Number(rapportForm[cle]) > 0)).map(([, l]) => l);
    if (manquants.length) {
      toast.error(
        manquants.length === 1
          ? `Critère non noté : ${manquants[0]}. Les sept critères sont requis pour que la note soit sur 35.`
          : `${manquants.length} critères non notés : ${manquants.join(", ")}. Les sept sont requis pour que la note soit sur 35.`,
        { duration: 7000 }
      );
      return;
    }

    // Confirmation avant envoi : un rapport d'observation porte une appréciation nominative
    // sur une personne, il part au Superviseur Général puis au conseil pédagogique, et rien
    // dans l'écran ne permet de le reprendre ensuite. Le récapitulatif sert autant à confirmer
    // qu'à relire - c'est le dernier moment où une note oubliée peut encore être vue.
    const coach = coachs.find(c => c.id === rapportForm.coach_id);
    const nomCoach = [coach?.prenom, coach?.nom].filter(Boolean).join(" ").trim() || "ce coach";

    const PTS_I = { excellent:5, bon:4, acceptable:3, insuffisant:1 };
    const PTS_G = { inductive_claire:5, inductive_perfectible:4, deductive_claire:3, confuse:1 };
    const notes = [
      rapportForm.ponctualite, rapportForm.preparation, rapportForm.pedagogie,
      rapportForm.gestion_classe, rapportForm.professionnalisme,
      rapportForm.expression_engagement, rapportForm.feedback_correction,
      PTS_I[rapportForm.interactivite_classe], PTS_G[rapportForm.approche_grammaticale],
    ].filter(v => Number(v) > 0);
    const moy = notes.length ? notes.reduce((a,b)=>a+Number(b),0) / notes.length : null;
    const libSynthese = moy === null ? null
      : moy >= 4.25 ? "Excellent" : moy >= 3.25 ? "Satisfaisant" : "À accompagner";

    const seance = rapportSeances.find(x => x.id === rapportForm.seance_id);
    const dateLisible = new Date(rapportForm.date_observation).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

    const lignes = [
      `Coach évalué : ${nomCoach}`,
      `Observation du ${dateLisible}`,
      rapportForm.classe ? `Classe : ${rapportForm.classe}` : null,
      seance ? `Séance : ${seance.titre || "Séance"}${seance.date_seance ? ` du ${new Date(seance.date_seance).toLocaleDateString("fr-FR")}` : ""}` : "Aucune séance rattachée",
      rapportForm.type_observation && rapportForm.type_observation !== "cours"
        ? `Type : ${libelleObservation(rapportForm.type_observation).toLowerCase()}` : null,
      rapportForm.type_lecon ? `Modalité : ${libelleLecon(rapportForm.type_lecon)}` : null,
      moy !== null
        ? `Note : ${moy.toFixed(1)}/5 - ${libSynthese} (${notes.length} critère${notes.length>1?"s":""} sur 9 renseigné${notes.length>1?"s":""})`
        : "⚠️ Aucun critère noté - le rapport partira sans note",
      rapportForm.internet === "instable" ? "Connexion signalée instable - hors note" : null,
    ].filter(Boolean);

    const ok = await confirm(
      `${lignes.join("\n")}\n\nLe rapport sera transmis au Superviseur Général, qui décidera de le faire suivre au conseil pédagogique.`,
      { titre: `Soumettre ce rapport sur ${nomCoach} ?`, confirmLabel: "📤 Soumettre", danger: false }
    );
    if (!ok) return;

    setRapportSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/rapports-deputy`, { method:"POST", headers:authHdrs(), body:JSON.stringify(rapportForm) });
      if (r.ok) { toast.success("Rapport soumis"); setShowRapportForm(false); setRapportForm(RAPPORT_INIT); setRapportCoachGroupes([]); setRapportClasseFiltre("actif"); fetchRapports(); fetchCoachs(); }
      else { const d = await r.json(); toast.error(d.error || "Erreur"); }
    } finally { setRapportSaving(false); }
  };

  const signalerAnomalie = async () => {
    if (anomSaving) return;
    if (!anomForm.coach_id || !anomForm.description) { toast.error("Coach et description requis"); return; }
    setAnomSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/anomalies`, { method:"POST", headers:authHdrs(), body:JSON.stringify(anomForm) });
      if (r.ok) { toast.success("Anomalie signalée - PA notifié"); setShowAnomForm(false); setAnomForm(ANOM_INIT); fetchAnomalies(); fetchKpi(); }
      else { const d = await r.json(); toast.error(d.error || "Erreur"); }
    } finally { setAnomSaving(false); }
  };

  const escaladerAnomalie = async (id, escalade_a) => {
    if (anomActionLoading.has(id)) return;
    setAnomActionLoading(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${API_URL}/api/superviseur/anomalies/${id}`, { method:"PATCH", headers:authHdrs(), body:JSON.stringify({ escalade_a }) });
      if (r.ok) { toast.success(`Escaladé vers ${escalade_a.toUpperCase()}`); fetchAnomalies(); setAnomDetail(null); }
    } finally { setAnomActionLoading(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const fermerAnomalie = async (id, resolution) => {
    if (anomActionLoading.has(id)) return;
    setAnomActionLoading(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${API_URL}/api/superviseur/anomalies/${id}`, { method:"PATCH", headers:authHdrs(), body:JSON.stringify({ statut:"fermé", resolution }) });
      if (r.ok) { toast.success("Anomalie fermée"); fetchAnomalies(); setAnomDetail(null); }
    } finally { setAnomActionLoading(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const assignerMission = async () => {
    if (missionSaving) return;
    if (!deputySelected || !missionForm.titre) { toast.error("Titre requis"); return; }
    setMissionSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/superviseur/deputies/${deputySelected.id}/missions`, { method:"POST", headers:authHdrs(), body:JSON.stringify(missionForm) });
      if (r.ok) { toast.success(`Mission assignée à ${deputySelected.prenom} ${deputySelected.nom}`); setShowMissionForm(false); setMissionForm(MISSION_INIT); fetchDeputies(); }
      else { const d = await r.json(); toast.error(d.error || "Erreur"); }
    } catch { toast.error("Erreur réseau"); } finally { setMissionSaving(false); }
  };

  /* ────────────────────────────────────────────────────────
     CONTENU DES ONGLETS
  ──────────────────────────────────────────────────────── */

  // ── "Mes tâches" - agrège les compteurs "à traiter" déjà calculés pour
  // chaque onglet, pour un point d'entrée unique selon le rôle (général/deputy).
  const tachesRapportsNonLus    = kpi?.nb_rapports_non_lus || 0;
  const tachesAnomaliesOuvertes = kpi?.nb_anomalies_ouvertes || 0;
  const tachesRapportsEnAttente = deputyKpi.rapports_en_attente || 0;
  const tachesRapportsCommentes = deputyKpi.rapports_commentes  || 0;
  const tachesTotal = IS_GENERAL
    ? (tachesRapportsNonLus + tachesAnomaliesOuvertes)
    : (tachesRapportsEnAttente + tachesRapportsCommentes);

  /* ── MES TÂCHES ── */
  const renderTaches = () => {
    const taches = IS_GENERAL ? [
      { icon:"📋", label:"Rapports non lus",     n:tachesRapportsNonLus,    tab:"rapports" },
      { icon:"⚠️", label:"Anomalies ouvertes",    n:tachesAnomaliesOuvertes, tab:"anomalies" },
    ] : [
      { icon:"📋", label:"Rapports en attente de lecture", n:tachesRapportsEnAttente, tab:"rapports" },
      { icon:"💬", label:"Retours du superviseur à lire",  n:tachesRapportsCommentes, tab:"rapports" },
    ];
    const enCours = taches.filter(t => t.n > 0);
    return (
      <div>
        <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:4 }}>✅ Mes tâches</div>
        <div style={{ fontSize:12, color:"#64748b", marginBottom:18 }}>
          {enCours.length > 0
            ? `${tachesTotal} élément${tachesTotal>1?"s":""} à traiter au total.`
            : "Rien à traiter pour le moment - tout est à jour."}
        </div>
        {enCours.length === 0 ? (
          <div style={{ textAlign:"center", padding:"50px 0", color:"#94a3b8" }}>
            <div style={{ fontSize:"2.4rem", marginBottom:8 }}>🎉</div>
            Aucune tâche en attente.
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:14 }}>
            {enCours.map((t,i) => (
              <div key={i} onClick={() => setActiveTab(t.tab)}
                style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"16px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:14, transition:"border-color .15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=BET_COLOR}
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
  };

  /* ── VUE D'ENSEMBLE ── */
  const renderDashboard = () => (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>
            {IS_GENERAL ? "🏠 Vue d'ensemble - Superviseur Général" : "🏠 Mon tableau de bord"}
          </h2>
          <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>
            {IS_GENERAL ? "Suivi administratif et pédagogique des coachs" : "Vos missions et rapports d'observation"}
          </p>
        </div>
        <div style={{ fontSize:12, color:"#9ca3af" }}>Mise à jour : {fmtDate(new Date())}</div>
      </div>

      {kpiLoading ? (
        <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>Chargement...</div>
      ) : IS_GENERAL ? (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px,1fr))", gap:12, marginBottom:24 }}>
            <StatCard label="Coachs actifs"           value={kpi?.nb_coachs ?? "-"}               color="#0891b2" icon="👨‍🏫" onClick={()=>setActiveTab("cahiers")} />
            <StatCard label="Coachs évalués"           value={kpi?.nb_coachs_evalues ?? "-"}         color="#7c3aed" icon="📊"  onClick={()=>setActiveTab("cahiers")} />
            <StatCard label="Rapports non lus"          value={kpi?.nb_rapports_non_lus ?? "-"}       color="#f59e0b" icon="📋" onClick={()=>setActiveTab("rapports")} />
            <StatCard label="Anomalies ouvertes"        value={kpi?.nb_anomalies_ouvertes ?? "-"}     color="#dc2626" icon="⚠️"  onClick={()=>setActiveTab("anomalies")} />
            <StatCard label="Deputy Superviseurs"       value={kpi?.nb_deputies ?? "-"}               color="#059669" icon="👥" onClick={()=>setActiveTab("deputies")} />
            <StatCard label="Missions actives"          value={kpi?.nb_missions_actives ?? "-"}       color="#0369a1" icon="🎯" onClick={()=>setActiveTab("deputies")} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"#0f172a" }}>⚡ Accès rapides</div>
              {[
                { icon:"📓", label:"Vérifier les cahiers de texte coachs",    tab:"cahiers" },
                { icon:"⚠️",  label:"Signaler une anomalie",                    tab:"anomalies", action:"new" },
                { icon:"🎯", label:"Assigner une mission à un deputy",          tab:"deputies" },
              ].map(a => (
                <button key={a.label} onClick={()=>{ setActiveTab(a.tab); if(a.action==="new") setTimeout(()=>setShowAnomForm(true),200); }}
                  style={{ display:"flex", alignItems:"center", gap:10, width:"100%", background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 14px", fontSize:13, cursor:"pointer", marginBottom:8, textAlign:"left" }}>
                  <span style={{ fontSize:17 }}>{a.icon}</span>
                  <span style={{ color:"#374151", fontWeight:500 }}>{a.label}</span>
                  <span style={{ marginLeft:"auto", color:"#94a3b8" }}>›</span>
                </button>
              ))}
            </div>
            <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"#0f172a" }}>📌 Responsabilités</div>
              {[
                "Vérifier les cahiers de texte (présences, cours, infos pédagogiques)",
                "Contrôler le respect des procédures et standards BET",
                "Établir la liste des coachs éligibles au paiement",
                "Transmettre les rapports et la liste au Pedagogical Advisor",
                "Encadrer et coordonner les Deputy Superviseurs",
                "Escalader les cas problématiques au PA ou CEO si nécessaire",
              ].map((r,i) => (
                <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:"#475569", marginBottom:8, lineHeight:1.5 }}>
                  <span style={{ color:BET_COLOR, flexShrink:0, marginTop:1 }}>✓</span><span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* ─── VUE DEPUTY ─── */
        <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px,1fr))", gap:12, marginBottom:24 }}>
            <StatCard label="Rapports soumis"      value={deputyKpi.rapports_soumis ?? 0}   color="#0891b2" icon="📋" onClick={()=>setActiveTab("rapports")} />
            <StatCard label="Missions actives"     value={deputyKpi.missions_actives ?? 0}  color="#f59e0b" icon="🎯" onClick={()=>setActiveTab("missions")} />
            <StatCard label="Dernière observation" value={deputyKpi.derniere_observation ? fmtDate(deputyKpi.derniere_observation) : "-"} color="#7c3aed" icon="📅" sub="date" />
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {/* Accès rapides deputy */}
            <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"#0f172a" }}>⚡ Accès rapides</div>
              {[
                { icon:"👁️",  label:"Observer un cours en ligne",             tab:"observer-cours" },
                { icon:"📋", label:"Soumettre un rapport d'observation",      tab:"rapports", action:"form" },
                { icon:"🎯", label:"Voir mes missions assignées",             tab:"missions" },
                { icon:"💬", label:"Contacter mon Superviseur Général",       tab:"messagerie" },
              ].map(a => (
                <button key={a.label} onClick={()=>{ setActiveTab(a.tab); if(a.action==="form") setTimeout(()=>setShowRapportForm(true),200); }}
                  style={{ display:"flex", alignItems:"center", gap:10, width:"100%", background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 14px", fontSize:13, cursor:"pointer", marginBottom:8, textAlign:"left" }}>
                  <span style={{ fontSize:17 }}>{a.icon}</span>
                  <span style={{ color:"#374151", fontWeight:500 }}>{a.label}</span>
                  <span style={{ marginLeft:"auto", color:"#94a3b8" }}>›</span>
                </button>
              ))}
            </div>

            {/* Responsabilités deputy */}
            <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"#0f172a" }}>📌 Mes responsabilités</div>
              {[
                "Effectuer des visites dans les centres et classes en ligne",
                "Évaluer les coachs selon les standards pédagogiques BET",
                "Identifier les points forts et axes d'amélioration",
                "Rédiger et soumettre des rapports au Superviseur Général",
                "Signaler toute non-conformité détectée lors des observations",
              ].map((r,i) => (
                <div key={i} style={{ display:"flex", gap:8, fontSize:12, color:"#475569", marginBottom:8, lineHeight:1.5 }}>
                  <span style={{ color:BET_COLOR, flexShrink:0, marginTop:1 }}>✓</span><span>{r}</span>
                </div>
              ))}

              {/* Restrictions visibles */}
              <div style={{ marginTop:14, padding:"10px 12px", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#92400e", marginBottom:6 }}>🔒 Accès restreint</div>
                {["Données clients et inscriptions","Montants des paiements et salaires","Modification des cours ou classes"].map((r,i)=>(
                  <div key={i} style={{ fontSize:11, color:"#b45309", display:"flex", gap:6, marginBottom:3 }}>
                    <span>✗</span><span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chaîne de supervision */}
          <div style={{ marginTop:16, background:"#f8fafc", borderRadius:12, padding:16, border:"1px solid #e5e7eb" }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:"#0f172a" }}>🔗 Votre position dans la chaîne de supervision</div>
            <div style={{ display:"flex", alignItems:"center", gap:0, overflowX:"auto" }}>
              {[
                { role:"Deputy Supervisor", desc:"Vous - observe & évalue", color:BET_COLOR, active:true },
                { role:"→", desc:"", color:"#9ca3af", arrow:true },
                { role:"General Supervisor", desc:"Centralise les rapports", color:"#0891b2" },
                { role:"→", desc:"", color:"#9ca3af", arrow:true },
                { role:"Pedagogical Advisor", desc:"Supervise la pédagogie", color:"#7c3aed" },
                { role:"→", desc:"", color:"#9ca3af", arrow:true },
                { role:"Direction", desc:"Décisions finales", color:"#059669" },
              ].map((n,i) => n.arrow ? (
                <div key={i} style={{ fontSize:20, color:"#cbd5e1", padding:"0 8px", flexShrink:0 }}>→</div>
              ) : (
                <div key={i} style={{ padding:"10px 14px", borderRadius:10, border:`2px solid ${n.active ? n.color : "#e2e8f0"}`, background:n.active ? n.color+"12" : "#fff", flexShrink:0, minWidth:140 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:n.color }}>{n.role}</div>
                  <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>{n.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  /* ── CAHIERS COACHS ── */
  const coachsFiltres = coachs.filter(c => {
    const q = coachSearch.toLowerCase();
    const matchQ = !q || `${c.nom} ${c.prenom} ${c.surnom || ""} ${c.email}`.toLowerCase().includes(q);
    const matchF = coachFiltre === "tous" || c.statut_conformite === coachFiltre;
    // La categorie se deduit de la note ; un coach jamais observe tombe dans
    // « Non evalue » et non dans la pire categorie.
    const matchC = !coachCategorie || categorieCoach(c.note_moyenne).cle === coachCategorie;
    return matchQ && matchF && matchC;
  });

  /* ═══════════════════════════════════════════════════════
     CLASSEMENT DES COACHS
     Construit depuis les rapports d'observation deja charges, filtres par periode.
     Cote serveur, /api/coachs/classement ne saurait pas faire ce decoupage - et
     recalculer ici evite un aller-retour a chaque changement de periode.
  ═══════════════════════════════════════════════════════ */
  const NOTE_COUL_SUP = NOTE_COULEUR;
  const NOTE_FOND_SUP = NOTE_FOND_CAT;

  const debutPeriodeClassement = (periode) => {
    const now = new Date();
    if (periode === "semaine") {
      const d = new Date(now);
      // Lundi comme premier jour : getDay() renvoie 0 le dimanche, d'ou le -6.
      d.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (periode === "mois") return new Date(now.getFullYear(), now.getMonth(), 1);
    return null;
  };

  const construireClassement = (periode, du = "", au = "") => {
    // Une plage explicite l'emporte sur le raccourci de periode : c'est le filtre le
    // plus precis qui gagne, sans quoi poser des dates n'aurait aucun effet visible.
    const dansPeriode = (du || au)
      ? rapports.filter(r => {
          const d = r.date_observation || "";
          if (du && d && d < du) return false;
          if (au && d && d > au) return false;
          return true;
        })
      : (() => {
          const debut = debutPeriodeClassement(periode);
          return debut
            ? rapports.filter(r => r.date_observation && new Date(r.date_observation) >= debut)
            : rapports;
        })();

    const parCoach = {};
    dansPeriode.forEach(r => {
      const c = r.coach;
      if (!c?.id || !r.note_globale) return;
      (parCoach[c.id] ??= { coach: c, notes: [], rapports: [] });
      parCoach[c.id].notes.push(Number(r.note_globale));
      parCoach[c.id].rapports.push(r);
    });

    return Object.values(parCoach)
      .map(e => {
        const moyenne = e.notes.reduce((a, b) => a + b, 0) / e.notes.length;
        // Tendance = derniere note comparee a la premiere de la periode. Sous deux
        // observations, il n'y a rien dont on puisse dire si ca monte ou descend.
        const tendance = e.notes.length >= 2
          ? (e.notes[e.notes.length - 1] > e.notes[0] ? "hausse"
            : e.notes[e.notes.length - 1] < e.notes[0] ? "baisse" : "stable")
          : "stable";
        return { ...e, moyenne, nb_rapports: e.notes.length, tendance };
      })
      .sort((a, b) => b.moyenne - a.moyenne);
  };

  const renderClassement = () => {
    const classement = construireClassement(classementPeriode, classementDu, classementAu);
    const libPeriode = classementPeriode === "semaine" ? "cette semaine"
      : classementPeriode === "mois" ? "ce mois" : "toute période";
    const medaille = i => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
    const tendIco = t => t === "hausse" ? "↗" : t === "baisse" ? "↘" : "→";
    const tendCol = t => t === "hausse" ? "#16a34a" : t === "baisse" ? "#ef4444" : "#94a3b8";

    const moyGlobale = classement.length
      ? classement.reduce((s, e) => s + e.moyenne, 0) / classement.length : null;

    const classementTotalPages = Math.max(1, Math.ceil(classement.length / CLASSEMENT_PAR_PAGE));
    // Borner la page courante : un filtre qui reduit la liste ne doit pas laisser
    // l'ecran sur une page devenue inexistante, donc vide.
    const classementPageSafe  = Math.min(classementPage, classementTotalPages);
    const classementPageItems = classement.slice(
      (classementPageSafe - 1) * CLASSEMENT_PAR_PAGE, classementPageSafe * CLASSEMENT_PAR_PAGE);
    const sousTrois = classement.filter(e => e.moyenne < 3).length;

    return (
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
          <div>
            <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>🏆 Classement des coachs</h2>
            <p style={{ margin:"4px 0 0", fontSize:13, color:"#94a3b8" }}>
              Basé sur les rapports d'observation de vos deputies · {libPeriode}
            </p>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {[{ v:"semaine", l:"Cette semaine" }, { v:"mois", l:"Ce mois" }, { v:"tous", l:"Tout" }].map(p => (
              // Un raccourci efface la plage explicite : les deux decideraient sinon de la
              // meme chose, et l'ecran afficherait un filtre qui ne s'applique pas.
              <button key={p.v} onClick={() => { setClassementPeriode(p.v); setClassementDu(""); setClassementAu(""); setClassementPage(1); }}
                style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                  border:`1.5px solid ${classementPeriode === p.v ? BET_COLOR : "#e2e8f0"}`,
                  background: classementPeriode === p.v ? BET_LIGHT : "#fff",
                  color: classementPeriode === p.v ? BET_COLOR : "#64748b" }}>
                {p.l}
              </button>
            ))}
          </div>
        </div>

        {/* Filtrage fin + export. Le mois ECRIT la plage ci-contre : une seule source. */}
        {(() => {
          const MOIS_LIB = ["janvier","février","mars","avril","mai","juin",
            "juillet","août","septembre","octobre","novembre","décembre"];
          const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
          const annees = [...new Set(rapports
            .map(r => r.date_observation && new Date(r.date_observation).getFullYear())
            .filter(Boolean))].sort((a,b) => b - a);
          if (!annees.length) annees.push(new Date().getFullYear());
          const actif = (() => {
            if (!classementDu || !classementAu) return null;
            const d = new Date(`${classementDu}T00:00:00`);
            const pr = new Date(d.getFullYear(), d.getMonth(), 1);
            const de = new Date(d.getFullYear(), d.getMonth()+1, 0);
            return (iso(pr) === classementDu && iso(de) === classementAu)
              ? { m: d.getMonth(), a: d.getFullYear() } : null;
          })();
          const poser = (m, a) => {
            if (m === "" || a === "") return;
            setClassementDu(iso(new Date(a, m, 1)));
            setClassementAu(iso(new Date(a, Number(m)+1, 0)));
            setClassementPage(1);
          };
          const anCourante = actif?.a ?? annees[0];
          const champ = { padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, background:"#fff" };
          return (
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:16,
              background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"9px 13px" }}>
              <span style={{ fontSize:12, color:"#64748b", fontWeight:700 }}>Mois</span>
              <select value={actif ? actif.m : ""} style={champ}
                onChange={e => e.target.value === ""
                  ? (setClassementDu(""), setClassementAu(""), setClassementPage(1))
                  : poser(Number(e.target.value), anCourante)}>
                <option value="">- Tous -</option>
                {MOIS_LIB.map((lib, k) => <option key={k} value={k}>{lib}</option>)}
              </select>
              <select value={anCourante} style={champ}
                onChange={e => { if (actif) poser(actif.m, Number(e.target.value)); }}>
                {annees.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span style={{ fontSize:12, color:"#64748b", fontWeight:700, marginLeft:4 }}>Du</span>
              <input type="date" value={classementDu} style={champ}
                onChange={e => { setClassementDu(e.target.value); setClassementPage(1); }} />
              <span style={{ fontSize:12, color:"#64748b", fontWeight:700 }}>au</span>
              <input type="date" value={classementAu} style={champ}
                onChange={e => { setClassementAu(e.target.value); setClassementPage(1); }} />
              {(classementDu || classementAu) && (
                <button onClick={() => { setClassementDu(""); setClassementAu(""); setClassementPage(1); }}
                  style={{ ...champ, cursor:"pointer", border:"1.5px solid #fca5a5", background:"#fef2f2", color:"#b91c1c", fontWeight:700 }}>
                  ✕ Effacer
                </button>
              )}
              <button
                onClick={() => exporterClassementCoachs({
                  lignes: classement.map(e => ({
                    nom: `${e.coach.prenom || ""} ${e.coach.nom || ""}`.trim(),
                    nb: e.nb_rapports, moyenne: e.moyenne, notes: e.notes, tendance: e.tendance,
                  })),
                  periode: libPeriode,
                  libelleVolume: "Observations",
                  titre: "Classement des coachs - observations",
                  nomFichier: "classement_coachs",
                })}
                disabled={!classement.length}
                style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:7, border:"none",
                  background: classement.length ? "#16a34a" : "#e2e8f0",
                  color: classement.length ? "#fff" : "#94a3b8",
                  fontSize:12, fontWeight:700, cursor: classement.length ? "pointer" : "not-allowed" }}>
                📊 Excel
              </button>
            </div>
          );
        })()}

        {classement.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:10, marginBottom:20 }}>
            {[
              { icon:"👨‍🏫", label:"Coachs évalués", v:classement.length, c:BET_COLOR },
              { icon:"⭐", label:"Meilleure note", v:`${classement[0].moyenne.toFixed(1)}/5`, c:"#f59e0b",
                sub:`${classement[0].coach.prenom || ""} ${classement[0].coach.nom || ""}`.trim() },
              { icon:"📊", label:"Note moyenne", v:`${moyGlobale.toFixed(1)}/5`, c:"#0891b2" },
              // Le seuil qui declenche un accompagnement : c'est le chiffre que le
              // superviseur cherche en premier.
              { icon:"⚠️", label:"Notes < 3", v:sousTrois, c: sousTrois > 0 ? "#ef4444" : "#16a34a" },
            ].map(k => (
              <div key={k.label} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 16px" }}>
                <div style={{ fontSize:11, color:"#94a3b8", fontWeight:600, marginBottom:4 }}>{k.icon} {k.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                {k.sub && <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{k.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {rapportsLoading ? (
          <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>⏳ Chargement…</div>
        ) : classement.length === 0 ? (
          <div style={{ textAlign:"center", padding:"50px 0", color:"#9ca3af", background:"#f8fafc", borderRadius:12 }}>
            <div style={{ fontSize:40, marginBottom:10 }}>🏆</div>
            <div style={{ fontWeight:600, color:"#374151" }}>Aucun coach évalué {libPeriode}</div>
            <div style={{ fontSize:12, marginTop:4 }}>
              Le classement se construit à partir des rapports d'observation notés.
            </div>
          </div>
        ) : (
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}>
            <div style={{ padding:"11px 18px", background:"#f8fafc", borderBottom:"1px solid #e5e7eb",
              display:"flex", justifyContent:"space-between", fontSize:12, color:"#64748b", fontWeight:600 }}>
              <span>Classement par note moyenne · {libPeriode}</span>
              <span>{classement.length} coach{classement.length > 1 ? "s" : ""} évalué{classement.length > 1 ? "s" : ""}</span>
            </div>

            {classementPageItems.map((e, iPage) => {
              // Le rang reste celui du classement ENTIER : sur la page 2, le premier
              // n'est pas le premier du classement.
              const i = (classementPageSafe - 1) * CLASSEMENT_PAR_PAGE + iPage;
              const nom = `${e.coach.prenom || ""} ${e.coach.nom || ""}`.trim() || "-";
              const initiales = `${(e.coach.prenom||"")[0]||""}${(e.coach.nom||"")[0]||""}`.toUpperCase() || "CO";
              const med = medaille(i);
              return (
                <div key={e.coach.id}
                  // Ouvre la fiche du coach directement sur ses observations : le detail
                  // complet existe deja la, inutile d'en construire un second.
                  onClick={() => { const c = coachs.find(x => String(x.id) === String(e.coach.id)) || e.coach; openCoachModal(c); setCoachModalTab("evaluations"); }}
                  title={`Voir les ${e.nb_rapports} observation${e.nb_rapports > 1 ? "s" : ""} de ${nom}`}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", cursor:"pointer",
                    borderBottom: iPage < classementPageItems.length - 1 ? "1px solid #f1f5f9" : "none",
                    background: i === 0 ? "#fffbeb" : "#fff" }}>

                  <div style={{ width:30, textAlign:"center", fontSize:med ? 20 : 13, fontWeight:800, color:"#94a3b8", flexShrink:0 }}>
                    {med || i + 1}
                  </div>

                  <div style={{ position:"relative", flexShrink:0 }}>
                    {e.coach.avatar_url
                      ? <img src={e.coach.avatar_url} alt={nom} style={{ width:44, height:44, borderRadius:"50%", objectFit:"cover", border:`2px solid ${NOTE_COUL_SUP(e.moyenne)}` }} />
                      : <div style={{ width:44, height:44, borderRadius:"50%", background:BET_LIGHT, color:BET_COLOR,
                          display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14,
                          border:`2px solid ${NOTE_COUL_SUP(e.moyenne)}` }}>{initiales}</div>}
                  </div>

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{nom}</div>
                    <div style={{ fontSize:12, color:"#94a3b8" }}>
                      {e.nb_rapports} rapport{e.nb_rapports > 1 ? "s" : ""} · {libPeriode}
                    </div>
                    <div style={{ marginTop:5 }}>
                      <BadgeCategorieCoach note={e.moyenne} taille="xs" />
                    </div>
                  </div>

                  {/* Les cinq dernieres notes, dans l'ordre : la barre se lit comme une progression. */}
                  <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:26, flexShrink:0 }}>
                    {e.notes.slice(-5).map((n, ni) => (
                      <div key={ni} title={`Note : ${n}/5`}
                        style={{ width:8, borderRadius:3, background:NOTE_COUL_SUP(n), height:`${(n/5)*100}%`, minHeight:4 }} />
                    ))}
                  </div>

                  <div style={{ width:48, height:48, borderRadius:"50%", flexShrink:0,
                    background:NOTE_FOND_SUP(e.moyenne), border:`2.5px solid ${NOTE_COUL_SUP(e.moyenne)}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontWeight:900, fontSize:15, color:NOTE_COUL_SUP(e.moyenne) }}>
                    {e.moyenne.toFixed(1)}
                  </div>

                  <div style={{ fontSize:18, fontWeight:900, color:tendCol(e.tendance), width:22, textAlign:"center", flexShrink:0 }}
                    title={`Tendance : ${e.tendance}`}>
                    {e.nb_rapports >= 2 ? tendIco(e.tendance) : ""}
                  </div>
                </div>
              );
            })}

            {classementTotalPages > 1 && (
              <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center",
                flexWrap:"wrap", padding:"12px 0", borderTop:"1px solid #f1f5f9" }}>
                <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>
                  Page {classementPageSafe}/{classementTotalPages} · {classement.length} coach{classement.length > 1 ? "s" : ""}
                </span>
                <button onClick={() => setClassementPage(p => Math.max(1, p - 1))} disabled={classementPageSafe === 1}
                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0",
                    background: classementPageSafe === 1 ? "#f1f5f9" : "#fff", fontSize:12,
                    cursor: classementPageSafe === 1 ? "default" : "pointer",
                    color: classementPageSafe === 1 ? "#cbd5e1" : "#374151", fontWeight:600 }}>← Préc.</button>
                {Array.from({ length: classementTotalPages }, (_, k) => k + 1).map(pg => (
                  <button key={pg} onClick={() => setClassementPage(pg)}
                    style={{ padding:"4px 9px", borderRadius:7,
                      border:`1.5px solid ${pg === classementPageSafe ? BET_COLOR : "#e2e8f0"}`,
                      background: pg === classementPageSafe ? BET_COLOR : "#fff", fontSize:12, cursor:"pointer",
                      color: pg === classementPageSafe ? "#fff" : "#374151",
                      fontWeight: pg === classementPageSafe ? 800 : 400 }}>{pg}</button>
                ))}
                <button onClick={() => setClassementPage(p => Math.min(classementTotalPages, p + 1))} disabled={classementPageSafe === classementTotalPages}
                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0",
                    background: classementPageSafe === classementTotalPages ? "#f1f5f9" : "#fff", fontSize:12,
                    cursor: classementPageSafe === classementTotalPages ? "default" : "pointer",
                    color: classementPageSafe === classementTotalPages ? "#cbd5e1" : "#374151", fontWeight:600 }}>Suiv. →</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCahiers = () => (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>📓 Cahiers de texte coachs</h2>
          <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Présences, cours dispensés, conformité pédagogique</p>
        </div>
        <button onClick={fetchCoachs} style={{ padding:"7px 14px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}40`, borderRadius:8, fontSize:12, color:BET_COLOR, fontWeight:600, cursor:"pointer" }}>↻ Actualiser</button>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <input value={coachSearch} onChange={e=>setCoachSearch(e.target.value)} placeholder="Rechercher un coach..."
          style={{ flex:1, minWidth:200, padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none" }} />
        <RangeePastilles accent={BET_COLOR} valeur={coachFiltre} style={{ marginBottom:0 }}
          onChange={(v)=>setCoachFiltre(v)}
          options={[
            { v:"tous",         l:"Tous" },
            { v:"conforme",     l:"Conformes" },
            { v:"non_conforme", l:"Non conformes" },
            { v:"en_attente",   l:"En attente" },
          ]}
          compte={(v)=> v==="tous" ? coachs.length : coachs.filter(c=>c.statut_conformite===v).length} />
      </div>

      {/* Filtre par categorie de contrat. Le compte est porte par chaque puce : une
          categorie vide se voit avant d'etre cliquee, plutot que de renvoyer un
          tableau vide sans raison apparente. */}
      <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap", marginBottom:14 }}>
        <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>🏷 Catégorie :</span>
        {[{ cle:"", libelle:"Toutes", couleur:"#475569", fond:"#f1f5f9", bord:"#e2e8f0" },
          ...CATEGORIES_COACH, CATEGORIE_SANS_NOTE].map(cat => {
          const actif = coachCategorie === cat.cle;
          const nb = cat.cle === ""
            ? coachs.length
            : coachs.filter(c => categorieCoach(c.note_moyenne).cle === cat.cle).length;
          return (
            <button key={cat.cle || "toutes"} type="button"
              onClick={()=>setCoachCategorie(actif ? "" : cat.cle)}
              style={{ padding:"4px 10px", borderRadius:99, cursor:"pointer",
                fontSize:11, fontWeight:700, lineHeight:1.5,
                border:`1.5px solid ${actif ? cat.couleur : cat.bord}`,
                background: actif ? cat.fond : "#fff",
                color: actif ? cat.couleur : "#64748b",
                opacity: nb === 0 && cat.cle !== "" ? .5 : 1 }}>
              {cat.libelle} <span style={{ opacity:.75 }}>({nb})</span>
            </button>
          );
        })}
      </div>

      {coachsLoading ? (
        <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Chargement...</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>
              <Th>Coach</Th><Th>Groupes</Th><Th>Note qualité</Th><Th>Évaluations</Th><Th>Anomalies</Th><Th>Statut</Th><Th>Actions</Th>
            </tr></thead>
            <tbody>
              {coachsFiltres.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Aucun coach trouvé</td></tr>
              )}
              {coachsFiltres.map(c => (
                /* La ligne entière ouvre la fiche : le bouton « Détail » restait le seul point
                   d'entrée, alors que c'est le nom du coach qu'on cherche à cliquer. */
                <tr key={c.id} onClick={()=>openCoachModal(c)}
                  title={`Ouvrir la fiche de ${c.prenom} ${c.nom}`}
                  style={{ cursor:"pointer" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <Td>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:34, height:34, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:BET_COLOR, flexShrink:0, overflow:"hidden" }}>
                        {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : `${(c.prenom||"")[0]||""}${(c.nom||"")[0]||""}`}
                      </div>
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                          <NomAvecSurnom prenom={c.prenom} nom={c.nom} surnom={c.surnom} style={{ fontWeight:600, fontSize:13 }} />
                          {c.acces_bloque && <span style={{ fontSize:9, fontWeight:700, background:"#dc2626", color:"#fff", borderRadius:99, padding:"1px 7px", whiteSpace:"nowrap" }}>🔒 SUSPENDU</span>}
                        </div>
                        <div style={{ fontSize:11, color:"#94a3b8" }}>{c.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td center><span style={{ fontWeight:700, color:"#0891b2" }}>{c.nb_groupes}</span></Td>
                  <Td center><NoteCircle note={c.note_moyenne} /></Td>
                  <Td center bold>
                    <span title={`${c.nb_evaluations||0} éval. CP + ${c.nb_rapports_deputy||0} rapports Deputy`}>
                      {(c.nb_evaluations||0) + (c.nb_rapports_deputy||0)}
                    </span>
                  </Td>
                  <Td center>
                    {c.nb_anomalies > 0 ? <span style={{ fontWeight:700, color:"#dc2626" }}>{c.nb_anomalies} ⚠️</span> : <span style={{ color:"#94a3b8" }}>-</span>}
                  </Td>
                  <Td>{conformiteBadge(c.statut_conformite)}</Td>
                  <Td>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={e=>{ e.stopPropagation(); openCoachModal(c); }} style={{ padding:"4px 10px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}40`, borderRadius:6, fontSize:11, color:BET_COLOR, fontWeight:600, cursor:"pointer" }}>Détail</button>
                      {IS_GENERAL && c.statut_conformite === "non_conforme" && (
                        <button disabled={!peut("rapports","manage")} title={permBtnTitle("Signaler",peut("rapports","manage"))} onClick={e=>{ e.stopPropagation(); setAnomForm({...ANOM_INIT, coach_id:c.id}); setActiveTab("anomalies"); setTimeout(()=>setShowAnomForm(true),100); }}
                          style={permBtnStyle({ padding:"4px 10px", background:"#fee2e2", border:"1px solid #fecaca", borderRadius:6, fontSize:11, color:"#dc2626", fontWeight:600, cursor:"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"":"🔒 "}Signaler</button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


    </div>
  );

  /* ── RAPPORTS DEPUTY ── */
  const renderRapports = () => {
    const nc  = NOTE_COULEUR;
    const nbg = NOTE_FOND_CAT;
    const CRITERES = CRITERES_LECTURE.map(c => ({ key:c.cle, label:c.label, icon:c.icon }));
    // Les deux échelles fermées s'affichent à part : elles portent un libellé, pas une note.
    const LIB_INTERACTIVITE = { excellent:"Excellent", bon:"Bon", acceptable:"Acceptable", insuffisant:"Insuffisant" };
    const LIB_GRAMMAIRE     = { inductive_claire:"Inductive et claire", inductive_perfectible:"Inductive, à revoir", deductive_claire:"Déductive mais claire", confuse:"Confuse ou erronée" };
    const LIB_SYNTHESE      = { excellent:{ l:"Excellent", c:"#15803d", bg:"#dcfce7" },
                                satisfaisant:{ l:"Satisfaisant", c:"#b45309", bg:"#fef3c7" },
                                a_accompagner:{ l:"À accompagner", c:"#b91c1c", bg:"#fee2e2" } };

    const rapportsFiltres = rapports.filter(r => {
      if (rapportDateFrom && r.date_observation && r.date_observation < rapportDateFrom) return false;
      if (rapportDateTo   && r.date_observation && r.date_observation > rapportDateTo)   return false;
      if (rapportStatutFilter && r.statut !== rapportStatutFilter) return false;
      if (rapportCoachFilter) {
        const nom = `${r.coach?.prenom||""} ${r.coach?.nom||""}`.toLowerCase();
        if (!nom.includes(rapportCoachFilter.toLowerCase())) return false;
      }
      return true;
    });

    const totalPages = Math.max(1, Math.ceil(rapportsFiltres.length / RAPPORT_PER_PAGE));
    const pageSafe   = Math.min(rapportPage, totalPages);
    const pageItems  = rapportsFiltres.slice((pageSafe - 1) * RAPPORT_PER_PAGE, pageSafe * RAPPORT_PER_PAGE);

    const PagBar = () => totalPages <= 1 ? null : (
      <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", padding:"12px 0", flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>Page {pageSafe}/{totalPages} · {rapportsFiltres.length} rapport{rapportsFiltres.length!==1?"s":""}</span>
        <button onClick={()=>setRapportPage(p=>Math.max(1,p-1))} disabled={pageSafe===1}
          style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:pageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:pageSafe===1?"default":"pointer", color:pageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
        {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>Math.abs(p-pageSafe)<=2).map(p=>(
          <button key={p} onClick={()=>setRapportPage(p)}
            style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===pageSafe?BET_COLOR:"#e2e8f0"}`, background:p===pageSafe?BET_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===pageSafe?"#fff":"#374151", fontWeight:p===pageSafe?800:400 }}>{p}</button>
        ))}
        <button onClick={()=>setRapportPage(p=>Math.min(totalPages,p+1))} disabled={pageSafe===totalPages}
          style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:pageSafe===totalPages?"#f1f5f9":"#fff", fontSize:12, cursor:pageSafe===totalPages?"default":"pointer", color:pageSafe===totalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
      </div>
    );

    return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>
            {IS_GENERAL ? "📋 Rapports d'observation des Deputies" : "📋 Mes rapports d'observation"}
          </h2>
          <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>
            {IS_GENERAL ? "Consultez, commentez et transmettez au PA" : "Soumettez vos observations terrain"}
            {rapports.length > 0 && <span style={{ marginLeft:8, fontWeight:600, color:BET_COLOR }}>{rapports.length} rapport{rapports.length!==1?"s":""}</span>}
          </p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={fetchRapports} style={{ padding:"7px 14px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}40`, borderRadius:8, fontSize:12, color:BET_COLOR, fontWeight:600, cursor:"pointer" }}>↻ Actualiser</button>
          {IS_GENERAL && (
            <>
            {/* Export au format de la feuille terrain : un bloc par coach, critères en
                lignes, observations en colonnes. Rendre un tableau plat obligerait la
                direction à réapprendre à lire son propre document. */}
            <button onClick={()=>exporterAppraisalCoachs({ rapports: rapportsFiltres, nomFichier:`appraisal_coachs_${new Date().toISOString().slice(0,10)}` })}
              disabled={!rapportsFiltres.length}
              title={rapportsFiltres.length ? "Exporter au format de la feuille d'évaluation" : "Aucun rapport à exporter"}
              style={{ padding:"7px 14px", background: rapportsFiltres.length ? "#15803d" : "#e2e8f0", border:"none", borderRadius:8, fontSize:12, color: rapportsFiltres.length ? "#fff" : "#94a3b8", fontWeight:600, cursor: rapportsFiltres.length ? "pointer" : "not-allowed" }}>
              📊 Excel
            </button>
            <button disabled={!peut("rapports","manage")} title={permBtnTitle("Nouveau rapport",peut("rapports","manage"))} onClick={()=>setShowRapportForm(true)} style={permBtnStyle({ padding:"7px 14px", background:BET_COLOR, border:"none", borderRadius:8, fontSize:12, color:"#fff", fontWeight:600, cursor:"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"+":"🔒"} Nouveau rapport</button>
            </>
          )}
          {!IS_GENERAL && (
            <button disabled={!peut("rapports","manage")} title={permBtnTitle("Soumettre un rapport",peut("rapports","manage"))} onClick={()=>setShowRapportForm(true)} style={permBtnStyle({ padding:"7px 14px", background:BET_COLOR, border:"none", borderRadius:8, fontSize:12, color:"#fff", fontWeight:600, cursor:"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"+":"🔒"} Soumettre un rapport</button>
          )}
        </div>
      </div>

      {/* Filtres */}
      {rapports.length > 0 && (
        <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"10px 14px" }}>
          {IS_GENERAL && (
            <input placeholder="🔍 Coach…" value={rapportCoachFilter} onChange={e=>{ setRapportCoachFilter(e.target.value); setRapportPage(1); }}
              style={{ flex:1, minWidth:140, padding:"6px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, outline:"none" }} />
          )}
          {IS_GENERAL && (
            <RangeePastilles accent={BET_COLOR} valeur={rapportStatutFilter} style={{ marginBottom:0 }}
              onChange={(v)=>{ setRapportStatutFilter(v); setRapportPage(1); }}
              options={[
                { v:"",            l:"Tous" },
                { v:"soumis",      l:"🕐 Soumis" },
                { v:"lu",          l:"👁 Lu" },
                { v:"transmis_pa", l:"✅ Transmis PA" },
                { v:"archivé",     l:"📁 Archivé" },
              ]}
              compte={(v)=> v==="" ? rapports.length : rapports.filter(r=>r.statut===v).length} />
          )}
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600, flexShrink:0 }}>Du</label>
            <input type="date" value={rapportDateFrom} onChange={e=>{ setRapportDateFrom(e.target.value); setRapportPage(1); }}
              style={{ padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, outline:"none" }} />
            <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600, flexShrink:0 }}>au</label>
            <input type="date" value={rapportDateTo} onChange={e=>{ setRapportDateTo(e.target.value); setRapportPage(1); }}
              style={{ padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, outline:"none" }} />
          </div>
          {(rapportDateFrom||rapportDateTo||rapportCoachFilter||rapportStatutFilter) && (
            <button onClick={()=>{ setRapportDateFrom(""); setRapportDateTo(""); setRapportCoachFilter(""); setRapportStatutFilter(""); setRapportPage(1); }}
              style={{ fontSize:12, color:"#ef4444", background:"transparent", border:"none", cursor:"pointer", fontWeight:700, flexShrink:0 }}>✕</button>
          )}
          {rapportsFiltres.length !== rapports.length && (
            <span style={{ fontSize:11, color:BET_COLOR, fontWeight:600, flexShrink:0 }}>{rapportsFiltres.length}/{rapports.length}</span>
          )}
        </div>
      )}

      {rapportsLoading ? (
        <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Chargement...</div>
      ) : rapports.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
          <div style={{ fontWeight:600 }}>Aucun rapport pour le moment</div>
          <button disabled={!peut("rapports","manage")} title={permBtnTitle("Nouveau rapport",peut("rapports","manage"))} onClick={()=>setShowRapportForm(true)} style={permBtnStyle({ marginTop:16, padding:"9px 18px", background:BET_COLOR, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" },peut("rapports","manage"))}>
            {!peut("rapports","manage") ? "🔒 " : ""}{IS_GENERAL ? "+ Nouveau rapport" : "Soumettre mon premier rapport"}
          </button>
        </div>
      ) : rapportsFiltres.length === 0 ? (
        <div style={{ textAlign:"center", padding:40, color:"#94a3b8", background:"#fff", borderRadius:12, border:"1.5px solid #e2e8f0" }}>
          Aucun rapport ne correspond aux filtres.
        </div>
      ) : (
        <>
          <PagBar />
          <div style={{ border:"1.5px solid #e2e8f0", borderRadius:14, overflow:"hidden" }}>
            {/* Contrôles tout déplier */}
            <div style={{ padding:"8px 14px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12, fontWeight:700, color:"#64748b" }}>
                {pageItems.length} rapport{pageItems.length!==1?"s":""} sur cette page
              </span>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setRapportExpanded2(new Set(pageItems.map(r=>r.id)))}
                  style={{ fontSize:11, fontWeight:700, color:BET_COLOR, background:"transparent", border:"none", cursor:"pointer" }}>Tout déplier ↓</button>
                <button onClick={()=>setRapportExpanded2(new Set())}
                  style={{ fontSize:11, fontWeight:700, color:"#94a3b8", background:"transparent", border:"none", cursor:"pointer" }}>Tout replier ↑</button>
              </div>
            </div>

            {pageItems.map((r, idx) => {
              const open  = rapportExpanded2.has(r.id);
              const note  = r.note_globale ? Number(r.note_globale) : null;
              const hasTxt = r.observations || r.recommandations || r.commentaire_superviseur;
              const toggleR = () => setRapportExpanded2(prev => { const n = new Set(prev); n.has(r.id)?n.delete(r.id):n.add(r.id); return n; });

              return (
                <div key={r.id} style={{ borderBottom: idx < pageItems.length-1 ? "1px solid #f1f5f9" : "none" }}>
                  {/* Ligne résumé - cliquable */}
                  <div onClick={toggleR}
                    style={{ padding:"12px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, background:open?"#fdf6ff":"#fff", transition:"background .15s" }}
                    onMouseEnter={e=>{ if(!open) e.currentTarget.style.background="#f8fafc"; }}
                    onMouseLeave={e=>{ if(!open) e.currentTarget.style.background="#fff"; }}>
                    <span style={{ fontSize:12, color:"#94a3b8", flexShrink:0, display:"inline-block", transform:open?"rotate(90deg)":"rotate(0deg)", transition:"transform .2s" }}>▶</span>

                    {/* Avatar deputy */}
                    <div style={{ width:36, height:36, borderRadius:8, background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, color:BET_COLOR, fontSize:12, flexShrink:0 }}>
                      {(r.deputy?.prenom||"D")[0]}{(r.deputy?.nom||"")[0]}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>
                        {IS_GENERAL ? `${r.deputy?.prenom||""} ${r.deputy?.nom||""}` : `Coach : ${r.coach?.prenom||""} ${r.coach?.nom||""}`}
                      </div>
                      <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>
                        {IS_GENERAL ? `Coach : ${r.coach?.prenom||""} ${r.coach?.nom||""}` : fmtDate(r.date_observation)}
                        {r.classe && <span style={{ marginLeft:7, background:"#e0f2fe", color:"#0369a1", borderRadius:5, padding:"1px 6px", fontSize:10, fontWeight:600 }}>{r.classe}</span>}
                        {r.centre && <span style={{ marginLeft:6, color:"#94a3b8" }}>· {r.centre}</span>}
                        {/* La séance observée : sans elle, deux rapports sur la même classe le
                            même jour restaient indiscernables. */}
                        {r.seance && (
                          <span title={`Séance observée${dureeReelleMin(r.seance) != null ? ` - ${dureeReelleMin(r.seance)} min en salle` : ""}`}
                            style={{ marginLeft:7, background:"#f0fdf4", color:"#15803d", borderRadius:5, padding:"1px 6px", fontSize:10, fontWeight:600 }}>
                            🎥 {r.seance.titre || "Séance"}
                            {r.seance.date_seance ? ` · ${new Date(r.seance.date_seance).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}` : ""}
                            {dureeReelleMin(r.seance) != null ? ` · ${dureeReelleMin(r.seance)} min` : ""}
                          </span>
                        )}
                        {hasTxt && <span style={{ marginLeft:6, color:BET_COLOR }}>📝</span>}
                      </div>
                    </div>

                    {/* Mini barres */}
                    <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:22, flexShrink:0 }}>
                      {CRITERES.map(c => {
                        const v = r[c.key];
                        return <div key={c.key} title={c.label} style={{ width:6, borderRadius:2, background:v?nc(v):"#e5e7eb", height:v?`${v/5*100}%`:"20%" }} />;
                      })}
                    </div>

                    {note && (
                      <div style={{ width:40, height:40, borderRadius:9, background:nbg(note), display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:15, color:nc(note), flexShrink:0 }}>
                        {note.toFixed(1)}
                      </div>
                    )}

                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
                      {statutBadge(r.statut)}
                      {IS_GENERAL && <span style={{ fontSize:10, color:"#9ca3af" }}>{fmtDate(r.date_observation)}</span>}
                    </div>
                  </div>

                  {/* Détail déployé */}
                  {open && (
                    <div style={{ padding:"16px 20px", background:"#fdf6ff", borderTop:"1px solid #ede9fe" }}>
                      {/* Synthèse, contexte et incident - ce que le PA doit voir en premier.
                          La synthèse est calculée, jamais saisie : dans la feuille terrain,
                          « Satisfaction » était renseignée à la main et pouvait contredire
                          les critères qui la précédaient. */}
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:14 }}>
                        {r.synthese && LIB_SYNTHESE[r.synthese] && (
                          <span style={{ padding:"5px 12px", borderRadius:8, fontSize:12, fontWeight:800, background:LIB_SYNTHESE[r.synthese].bg, color:LIB_SYNTHESE[r.synthese].c }}>
                            {LIB_SYNTHESE[r.synthese].l}
                          </span>
                        )}
                        {r.type_observation && r.type_observation !== "cours" && (
                          <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:700, background:"#ede9fe", color:"#6d28d9" }}>
                            {r.type_observation === "evaluation" ? "📊" : "🎭"} {libelleObservation(r.type_observation)}
                          </span>
                        )}
                        {/* Les rapports anterieurs portent ici un type de CONTENU
                            (« Grammaire »...) : `libelleLecon` les rend tels quels. */}
                        {r.type_lecon && (
                          <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#e0f2fe", color:"#0369a1" }}>📖 {libelleLecon(r.type_lecon)}</span>
                        )}
                        {r.internet && (
                          <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:700,
                            background: r.internet === "instable" ? "#fee2e2" : "#f1f5f9",
                            color: r.internet === "instable" ? "#b91c1c" : "#475569" }}>
                            📶 Internet : <strong>{libelleInternet(r.internet)}</strong>
                          </span>
                        )}
                        {r.interactivite_classe && (
                          <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#fff", border:"1px solid #e2e8f0", color:"#475569" }}>
                            👥 Interactivité : <strong>{LIB_INTERACTIVITE[r.interactivite_classe] || r.interactivite_classe}</strong>
                          </span>
                        )}
                        {r.approche_grammaticale && (
                          <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#fff", border:"1px solid #e2e8f0", color:"#475569" }}>
                            📖 Grammaire : <strong>{LIB_GRAMMAIRE[r.approche_grammaticale] || r.approche_grammaticale}</strong>
                          </span>
                        )}
                        {r.incident_technique && (
                          <span title={r.incident_technique_detail || "Incident signalé"}
                            style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:700, background:"#fffbeb", border:"1px solid #fcd34d", color:"#92400e" }}>
                            📡 Incident technique{r.incident_technique_detail ? ` - ${r.incident_technique_detail}` : ""}
                          </span>
                        )}
                      </div>

                      {/* Critères */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:8, marginBottom:14 }}>
                        {CRITERES.map(c => {
                          const val = r[c.key];
                          return (
                            <div key={c.key} style={{ background:"#fff", borderRadius:9, padding:"10px 12px", border:"1px solid #e2e8f0" }}>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:6 }}>{c.icon} {c.label}</div>
                              <div style={{ display:"flex", gap:3 }}>
                                {[1,2,3,4,5].map(n=>(
                                  <div key={n} style={{ width:18, height:18, borderRadius:3, fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", background:val>=n?nc(val):"#e5e7eb", color:val>=n?"#fff":"#9ca3af" }}>{n}</div>
                                ))}
                                {val && <span style={{ marginLeft:4, fontSize:11, fontWeight:800, color:nc(val), alignSelf:"center" }}>{val}/5</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Textes */}
                      {hasTxt && (
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                          {r.observations && (
                            <div style={{ background:"#f0f9ff", borderRadius:9, padding:"10px 13px", border:"1px solid #bae6fd" }}>
                              <div style={{ fontSize:11, fontWeight:800, color:"#0369a1", marginBottom:5 }}>👁 Observations</div>
                              <p style={{ margin:0, fontSize:12, color:"#0c4a6e", lineHeight:1.6 }}>{r.observations}</p>
                            </div>
                          )}
                          {r.recommandations && (
                            <div style={{ background:"#f0fdf4", borderRadius:9, padding:"10px 13px", border:"1px solid #bbf7d0" }}>
                              <div style={{ fontSize:11, fontWeight:800, color:"#16a34a", marginBottom:5 }}>💡 Recommandations</div>
                              <p style={{ margin:0, fontSize:12, color:"#14532d", lineHeight:1.6 }}>{r.recommandations}</p>
                            </div>
                          )}
                          {r.commentaire_superviseur && (
                            <div style={{ gridColumn:"1/-1", background:"#fef9c3", borderRadius:9, padding:"10px 13px", border:"1px solid #fde047" }}>
                              <div style={{ fontSize:11, fontWeight:800, color:"#854d0e", marginBottom:5 }}>💬 Commentaire Superviseur</div>
                              <p style={{ margin:0, fontSize:12, color:"#713f12", lineHeight:1.6 }}>{r.commentaire_superviseur}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions Global Superviseur */}
                      {IS_GENERAL && (
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {r.statut === "soumis" && <button disabled={rapportActionLoading.has(r.id)} onClick={e=>{ e.stopPropagation(); marquerLu(r.id); }} style={{ padding:"6px 14px", background:"#e0f2fe", border:"1px solid #bae6fd", borderRadius:7, fontSize:12, color:"#0369a1", fontWeight:600, cursor:rapportActionLoading.has(r.id)?"not-allowed":"pointer" }}>👁 Marquer lu</button>}
                          {["soumis","lu"].includes(r.statut) && <button disabled={rapportActionLoading.has(r.id)||!peut("rapports","manage")} title={permBtnTitle("Transmettre au PA",peut("rapports","manage"))} onClick={e=>{ e.stopPropagation(); transmettrePA(r.id); }} style={permBtnStyle({ padding:"6px 14px", background:BET_COLOR, border:"none", borderRadius:7, fontSize:12, color:"#fff", fontWeight:600, cursor:rapportActionLoading.has(r.id)?"not-allowed":"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"📤":"🔒"} Transmettre au PA</button>}
                          {/* La correction se fait AVANT la transmission : une fois le rapport parti
                              chez le conseiller pédagogique, la note a déjà crédité le coach.
                              D'où le bouton ici, sur la carte, et non caché derrière « Commenter ». */}
                          {["soumis","lu"].includes(r.statut) && <button disabled={rapportActionLoading.has(r.id)||!peut("rapports","manage")} title={permBtnTitle("Corriger une erreur de saisie du deputy",peut("rapports","manage"))} onClick={e=>{ e.stopPropagation(); setRapportDetail(r); setCorrectionForm(formCorrectionDepuis(r)); setMotifCorrection(""); }} style={permBtnStyle({ padding:"6px 14px", background:"#fff", border:"1.5px solid #c4b5fd", borderRadius:7, fontSize:12, color:"#6d28d9", fontWeight:600, cursor:rapportActionLoading.has(r.id)?"not-allowed":"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"✏️":"🔒"} Corriger</button>}
                          <button onClick={e=>{ e.stopPropagation(); setRapportDetail(r); }} style={{ padding:"6px 14px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:7, fontSize:12, color:"#374151", fontWeight:600, cursor:"pointer" }}>💬 Commenter</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <PagBar />
        </>
      )}

      {rapportDetail && IS_GENERAL && (
        <Modal title="Rapport du deputy" subtitle="Commentez, ou corrigez avant de transmettre au conseiller pédagogique" onClose={()=>{ setRapportDetail(null); setCorrectionForm(null); setMotifCorrection(""); }}>

          {/* LA TRACE D'UNE CORRECTION ANTÉRIEURE, en tête et avant tout le reste.
              Un rapport corrigé n'est plus tout à fait le témoignage du deputy : celui qui
              le lit doit le savoir avant d'en tirer une conclusion sur un coach. */}
          {rapportDetail.correction_superviseur && (
            <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
              <div style={{ fontSize:10.5, fontWeight:800, color:"#92400e", textTransform:"uppercase", letterSpacing:".05em", marginBottom:6 }}>
                ✏️ Rapport corrigé
              </div>
              <div style={{ fontSize:12.5, color:"#78350f", lineHeight:1.6 }}>
                Par {[rapportDetail.correction_superviseur.par?.prenom, rapportDetail.correction_superviseur.par?.nom].filter(Boolean).join(" ") || "le superviseur"}
                {rapportDetail.correction_superviseur.le ? ` le ${new Date(rapportDetail.correction_superviseur.le).toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}` : ""}.
                {rapportDetail.correction_superviseur.motif ? <> Motif : <strong>{rapportDetail.correction_superviseur.motif}</strong>.</> : null}
              </div>
              {rapportDetail.correction_superviseur.original && (
                <div style={{ fontSize:11.5, color:"#92400e", marginTop:8, lineHeight:1.6 }}>
                  Note d'origine du deputy :{" "}
                  <strong>{rapportDetail.correction_superviseur.original.note_globale ?? "-"}/5</strong>
                  {rapportDetail.note_globale ? <> · après correction : <strong>{rapportDetail.note_globale}/5</strong></> : null}
                </div>
              )}
            </div>
          )}

          {/* ── MODE CORRECTION ───────────────────────────────────────────────────────
              Ouvert à la demande, jamais par défaut : la relecture d'un rapport n'est pas
              une réécriture, et un formulaire éditable d'emblée inviterait à modifier ce
              qu'on venait seulement lire.

              LA NOTE GLOBALE N'EST PAS SAISISSABLE - elle se recalcule côté serveur à
              partir des cinq critères du barème officiel. La proposer ici laisserait croire
              qu'on peut la fixer à la main, et elle serait écrasée au premier enregistrement. */}
          {!correctionForm ? (
            <button
              disabled={!peut("rapports","manage") || rapportDetail.statut === "transmis_pa"}
              title={rapportDetail.statut === "transmis_pa"
                ? "Rapport déjà transmis au conseiller pédagogique - la correction n'est plus possible"
                : "Corriger une erreur de saisie du deputy"}
              onClick={() => setCorrectionForm(formCorrectionDepuis(rapportDetail))}
              style={{ padding:"8px 16px", background:"#fff", border:"1.5px solid #c4b5fd", borderRadius:8,
                color:"#6d28d9", fontSize:12.5, fontWeight:700,
                cursor: rapportDetail.statut === "transmis_pa" ? "not-allowed" : "pointer",
                opacity: rapportDetail.statut === "transmis_pa" ? 0.5 : 1, marginBottom:16 }}>
              ✏️ Corriger ce rapport
            </button>
          ) : (
            <div style={{ background:"#faf9ff", border:"1.5px solid #ddd6fe", borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#6d28d9", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>
                ✏️ Correction du rapport
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                {[
                  ["ponctualite",           "Ponctualité"],
                  ["preparation",           "Préparation"],
                  ["pedagogie",             "Pédagogie"],
                  ["gestion_classe",        "Gestion de classe"],
                  ["professionnalisme",     "Professionnalisme"],
                  ["interactivite_classe",  "Interactivité"],
                  ["approche_grammaticale", "Approche grammaticale"],
                  ["expression_engagement", "Expression & engagement"],
                  ["feedback_correction",   "Feedback & correction"],
                ].map(([cle, label]) => (
                  <div key={cle}>
                    <label style={{ fontSize:10.5, fontWeight:700, color:"#6b7280", display:"block", marginBottom:3 }}>{label}</label>
                    <select value={correctionForm[cle]} onChange={e => setCorrectionForm(f => ({ ...f, [cle]: e.target.value }))}
                      style={{ width:"100%", padding:"6px 8px", border:"1px solid #c4b5fd", borderRadius:7, fontSize:12, background:"#fff", cursor:"pointer" }}>
                      <option value="">Non noté</option>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}/5</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {[["observations","Observations"],["recommandations","Recommandations"]].map(([cle,label]) => (
                <div key={cle} style={{ marginBottom:10 }}>
                  <label style={{ fontSize:10.5, fontWeight:700, color:"#6b7280", display:"block", marginBottom:3 }}>{label}</label>
                  <textarea rows={3} value={correctionForm[cle]} onChange={e => setCorrectionForm(f => ({ ...f, [cle]: e.target.value }))}
                    style={{ width:"100%", padding:"8px 10px", border:"1px solid #c4b5fd", borderRadius:7, fontSize:12.5, resize:"vertical", boxSizing:"border-box" }} />
                </div>
              ))}

              {/* LE MOTIF EST OBLIGATOIRE. Corriger le témoignage d'un collègue sans dire
                  pourquoi rend la correction indéfendable le jour où le deputy ou le coach
                  la conteste - et c'est la seule ligne que le conseiller lira pour comprendre. */}
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:10.5, fontWeight:700, color:"#6b7280", display:"block", marginBottom:3 }}>
                  Motif de la correction <span style={{ color:"#dc2626" }}>*</span>
                </label>
                <input type="text" value={motifCorrection} onChange={e => setMotifCorrection(e.target.value)}
                  placeholder="Ex : critère de ponctualité inversé lors de la saisie"
                  style={{ width:"100%", padding:"8px 10px", border:`1.5px solid ${motifCorrection.trim() ? "#c4b5fd" : "#fca5a5"}`,
                    borderRadius:7, fontSize:12.5, boxSizing:"border-box" }} />
              </div>

              <div style={{ fontSize:10.5, color:"#6b7280", lineHeight:1.55, marginBottom:12 }}>
                La note globale sera recalculée à partir des critères du barème officiel.
                Les valeurs d'origine du deputy sont conservées et resteront lisibles.
              </div>

              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => { setCorrectionForm(null); setMotifCorrection(""); }}
                  style={{ padding:"8px 16px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:8, color:"#64748b", fontSize:12.5, fontWeight:700, cursor:"pointer" }}>
                  Annuler
                </button>
                <button
                  disabled={!motifCorrection.trim() || rapportActionLoading.has(rapportDetail.id)}
                  onClick={async () => {
                    if (!motifCorrection.trim() || rapportActionLoading.has(rapportDetail.id)) return;
                    setRapportActionLoading(prev => new Set(prev).add(rapportDetail.id));
                    try {
                      const r = await fetch(`${API_URL}/api/superviseur/rapports-deputy/${rapportDetail.id}`, {
                        method:"PATCH", headers:authHdrs(),
                        body: JSON.stringify({ correction: correctionForm, motif_correction: motifCorrection.trim() }),
                      });
                      const d = await r.json().catch(()=>({}));
                      if (!r.ok) { toast.error(d.error || "Erreur lors de la correction"); return; }
                      toast.success(`✏️ Rapport corrigé - note recalculée : ${d.rapport?.note_globale ?? "-"}/5`);
                      setCorrectionForm(null); setMotifCorrection(""); setRapportDetail(null); fetchRapports();
                    } catch { toast.error("Erreur réseau"); }
                    finally { setRapportActionLoading(prev => { const n = new Set(prev); n.delete(rapportDetail.id); return n; }); }
                  }}
                  style={{ padding:"8px 16px", background: motifCorrection.trim() ? "#6d28d9" : "#cbd5e1", border:"none", borderRadius:8,
                    color:"#fff", fontSize:12.5, fontWeight:700, cursor: motifCorrection.trim() ? "pointer" : "not-allowed" }}>
                  {rapportActionLoading.has(rapportDetail.id) ? "⏳…" : "Enregistrer la correction"}
                </button>
              </div>
            </div>
          )}

          <label style={{ fontSize:11, fontWeight:700, color:"#6b7280", display:"block", marginBottom:4 }}>Commentaire du superviseur</label>
          <textarea id="cmtSup" rows={5} defaultValue={rapportDetail.commentaire_superviseur||""} placeholder="Votre commentaire..."
            style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, resize:"vertical", boxSizing:"border-box", marginBottom:12 }} />
          <button disabled={rapportActionLoading.has(rapportDetail.id)} onClick={async()=>{
              if (rapportActionLoading.has(rapportDetail.id)) return;
              setRapportActionLoading(prev => new Set(prev).add(rapportDetail.id));
              try {
                const v=document.getElementById("cmtSup")?.value;
                const r=await fetch(`${API_URL}/api/superviseur/rapports-deputy/${rapportDetail.id}`,{method:"PATCH",headers:authHdrs(),body:JSON.stringify({commentaire_superviseur:v})});
                if(r.ok){toast.success("Commentaire enregistré");setRapportDetail(null);setCorrectionForm(null);setMotifCorrection("");fetchRapports();}
              } finally { setRapportActionLoading(prev => { const n = new Set(prev); n.delete(rapportDetail.id); return n; }); }
            }}
            style={{ padding:"9px 18px", background:BET_COLOR, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:rapportActionLoading.has(rapportDetail.id)?"wait":"pointer" }}>
            {rapportActionLoading.has(rapportDetail.id) ? "⏳…" : "Enregistrer le commentaire"}
          </button>
        </Modal>
      )}

      {showRapportForm && (
        <Modal title="📋 Soumettre un rapport d'observation" subtitle="Renseignez les critères d'observation du cours" onClose={()=>{ setShowRapportForm(false); setRapportForm(RAPPORT_INIT); setRapportCoachGroupes([]); }} xl>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>

            {/* Coach */}
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>Coach observé *</label>
              {/* 189 coachs en base : la liste déroulante seule oblige à faire défiler.
                  Le champ filtre ce que le select contient - il reste utilisable au clavier,
                  et le coach déjà choisi reste sélectionnable même si la recherche l'exclut. */}
              {(() => {
                const q = rapportCoachRecherche.trim().toLowerCase();
                const listes = q
                  ? coachs.filter(c => `${c.prenom || ""} ${c.nom || ""} ${c.email || ""}`.toLowerCase().includes(q))
                  : coachs;
                const choisi = coachs.find(c => c.id === rapportForm.coach_id);
                return (
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <select value={rapportForm.coach_id}
                      onChange={e=>{ const id=e.target.value; setRapportForm(p=>({...p, coach_id:id, classe:"", groupe_id:"", seance_id:"", session_live_id:"" })); setRapportClasseFiltre("actif"); }}
                      style={{ flex:"1 1 280px", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff" }}>
                      <option value="">-- Sélectionner un coach --</option>
                      {listes.map(c=><option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                      {choisi && !listes.some(c => c.id === choisi.id) && (
                        <option value={choisi.id}>{choisi.prenom} {choisi.nom}</option>
                      )}
                    </select>
                    <input value={rapportCoachRecherche} onChange={e=>setRapportCoachRecherche(e.target.value)}
                      placeholder="🔍 Rechercher un coach…"
                      style={{ flex:"0 1 240px", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                    {/* La personnalité du coach, telle que renseignée sur sa fiche. Dans la
                        feuille terrain, elle n'était portée que par la couleur de fond de la
                        cellule du nom - invisible à l'export, indéchiffrable sans le code.
                        Ici elle est écrite, et l'observateur l'a sous les yeux. */}
                    {choisi?.coach_info?.personnalite && (
                      <div style={{ flexBasis:"100%", fontSize:11.5, color:"#6d28d9", background:"#ede9fe", borderRadius:7, padding:"6px 11px", fontWeight:600 }}>
                        🎭 Personnalité : {choisi.coach_info.personnalite}
                      </div>
                    )}
                    {q && (
                      <div style={{ flexBasis:"100%", fontSize:11.5, color: listes.length ? "#94a3b8" : "#b45309", fontWeight: listes.length ? 400 : 700 }}>
                        {listes.length
                          ? `${listes.length} coach${listes.length > 1 ? "s" : ""} sur ${coachs.length}`
                          : `Aucun coach ne correspond à « ${rapportCoachRecherche.trim()} »`}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Date */}
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>Date d'observation *</label>
              <input type="date" value={rapportForm.date_observation} onChange={e=>setRapportForm(p=>({...p,date_observation:e.target.value}))}
                style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, boxSizing:"border-box" }} />
            </div>

            {/* Centre */}
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>Centre</label>
              <input type="text" value={rapportForm.centre} onChange={e=>setRapportForm(p=>({...p,centre:e.target.value}))}
                placeholder="ex: Cocody, En ligne…"
                style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, boxSizing:"border-box" }} />
            </div>

            {/* Classe - select avec filtre actif/terminé */}
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6, flexWrap:"wrap", gap:8 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#475569" }}>
                  Classe observée
                  {rapportCoachGroupesLoading && <span style={{ marginLeft:8, fontSize:11, color:"#94a3b8" }}>Chargement…</span>}
                </label>
                {rapportCoachGroupes.length > 0 && (
                  <div style={{ display:"flex", gap:4 }}>
                    {[{v:"actif",l:"🟢 Actives"},{v:"termine",l:"⬛ Terminées"},{v:"tous",l:"Toutes"}].map(f=>(
                      <button key={f.v} type="button" onClick={()=>{ setRapportClasseFiltre(f.v); setRapportForm(p=>({...p,classe:""})); }}
                        style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, border:`1.5px solid ${rapportClasseFiltre===f.v?BET_COLOR:"#e2e8f0"}`, background:rapportClasseFiltre===f.v?BET_LIGHT:"#fff", color:rapportClasseFiltre===f.v?BET_COLOR:"#64748b", cursor:"pointer" }}>
                        {f.l}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {rapportCoachGroupes.length > 0 ? (() => {
                const grouped = rapportCoachGroupes.filter(g =>
                  rapportClasseFiltre === "tous" ? true :
                  rapportClasseFiltre === "termine" ? g.statut === "termine" :
                  g.statut === "actif" || !g.statut
                );
                const nbTerminees = rapportCoachGroupes.filter(g => g.statut === "termine").length;
                const nbActives   = rapportCoachGroupes.filter(g => g.statut === "actif" || !g.statut).length;
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {grouped.length === 0 ? (
                      <div style={{ padding:"10px 14px", background:"#f8fafc", borderRadius:8, fontSize:12, color:"#9ca3af", textAlign:"center" }}>
                        {rapportClasseFiltre === "actif"
                          ? `Aucune classe active - ${nbTerminees} terminée(s) disponible(s)`
                          : "Aucune classe dans cette catégorie"}
                      </div>
                    ) : (
                      <>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {grouped.map(g => {
                            const isTermine = g.statut === "termine";
                            const isSelected = rapportForm.classe === g.nom;
                            return (
                              <button key={g.id} type="button"
                                onClick={()=>setRapportForm(p=>({ ...p, classe:g.nom, groupe_id:g.id, seance_id:"", session_live_id:"",
                                  // Pré-saisie seulement si le champ est vide : ne jamais écraser
                                  // ce que le superviseur a déjà tapé.
                                  centre: p.centre || lieuDeLaClasse(g) }))}
                                style={{ padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:600,
                                  border:`1.5px solid ${isSelected?BET_COLOR:isTermine?"#d1d5db":"#e2e8f0"}`,
                                  background:isSelected?BET_LIGHT:isTermine?"#f1f5f9":"#fff",
                                  color:isSelected?BET_COLOR:isTermine?"#64748b":"#374151",
                                  cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                                <span>{isTermine?"⬛":"🟢"}</span>
                                <span>{g.nom}</span>
                                {g.niveau && <span style={{ fontSize:10, color:isSelected?BET_COLOR:"#94a3b8", fontWeight:400 }}>· {g.niveau}</span>}
                                {isTermine && <span style={{ fontSize:10, color:"#94a3b8", fontWeight:400 }}>(terminée)</span>}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ display:"flex", gap:6, alignItems:"center", fontSize:11, color:"#94a3b8" }}>
                          <span>✅ {nbActives} active{nbActives!==1?"s":""}</span>
                          <span>·</span>
                          <span>⬛ {nbTerminees} terminée{nbTerminees!==1?"s":""}</span>
                        </div>
                      </>
                    )}
                    <input type="text" value={rapportForm.classe} onChange={e=>setRapportForm(p=>({...p,classe:e.target.value}))}
                      placeholder="Ou saisir / corriger le nom de classe…"
                      style={{ width:"100%", padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, boxSizing:"border-box", color:"#374151" }} />

                    {/* La séance observée. Facultative - un cours présentiel sans session
                        enregistrée, ou un rapport rédigé a posteriori, restent légitimes -
                        mais mise en avant : c'est elle qui rattache la note à un cours réel,
                        avec son heure d'ouverture, sa durée en salle et ses présences. */}
                    {rapportForm.groupe_id && (
                      <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"12px 14px" }}>
                        <label style={{ fontSize:12, fontWeight:700, color:"#475569", display:"block", marginBottom:6 }}>
                          🎥 Séance observée
                          <span style={{ fontWeight:400, color:"#94a3b8" }}> - facultatif</span>
                          {rapportSeancesLoading && <span style={{ marginLeft:8, fontSize:11, color:"#94a3b8" }}>Chargement…</span>}
                        </label>
                        {!rapportSeancesLoading && rapportSeances.length === 0 ? (
                          <div style={{ fontSize:12, color:"#94a3b8" }}>
                            Aucune séance passée enregistrée pour cette classe - le rapport reste valable sans.
                          </div>
                        ) : (
                          <>
                            <select value={rapportForm.seance_id}
                              onChange={e => {
                                const sel = rapportSeances.find(x => x.id === e.target.value);
                                setRapportForm(p => ({ ...p, seance_id: e.target.value, session_live_id: sel?.session_live_id || "" }));
                              }}
                              style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12.5, background:"#fff", boxSizing:"border-box", cursor:"pointer" }}>
                              <option value="">- Aucune séance précise -</option>
                              {rapportSeances.map(x => {
                                const d = x.date_seance ? new Date(x.date_seance).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}) : "-";
                                const reel = dureeReelleMin(x);
                                const st = { realisee:"Réalisée", terminee:"Réalisée", annulee:"Annulée", en_cours:"En cours" }[x.statut] || "Planifiée";
                                return (
                                  <option key={x.id} value={x.id}>
                                    {d}{x.heure_debut ? ` · ${String(x.heure_debut).slice(0,5)}` : ""} - {x.titre || "Séance"} · {st}{reel != null ? ` · ${reel} min en salle` : ""}
                                  </option>
                                );
                              })}
                            </select>
                            {/* Le déroulé réel de la séance choisie, sous les yeux du superviseur
                                pendant qu'il note : une note de ponctualité prend un autre sens à
                                côté d'une salle ouverte en retard. */}
                            {rapportForm.seance_id && (
                              <DerouleReel seance={rapportSeances.find(x => x.id === rapportForm.seance_id)} style={{ marginTop:10 }} />
                            )}

                            {/* Les présences de cette séance : noter « gestion de classe »
                                devant 2 apprenants ou devant 12 n'est pas la même observation. */}
                            {rapportForm.seance_id && (
                              <div style={{ marginTop:10, background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:"11px 13px" }}>
                                <div style={{ fontSize:11, fontWeight:800, color:"#94a3b8", letterSpacing:".05em", marginBottom:8 }}>PRÉSENCES</div>
                                {rapportPresences.loading ? (
                                  <div style={{ fontSize:12, color:"#94a3b8" }}>⏳ Chargement…</div>
                                ) : !rapportPresences.liste?.length ? (
                                  <div style={{ fontSize:12, color:"#92400e" }}>
                                    Aucune présence saisie par le coach pour cette séance.
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginBottom:7 }}>
                                      {rapportPresences.liste.filter(x=>x.statut==="present").length}/{rapportPresences.liste.length}
                                      <span style={{ fontSize:12, fontWeight:600, color:"#64748b", marginLeft:6 }}>apprenants présents</span>
                                    </div>
                                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                                      {rapportPresences.liste.map((x,i) => {
                                        const cfg = { present:{ l:"✅ Présent", c:"#15803d", bg:"#dcfce7" },
                                                      retard:{ l:"⏱ Retard", c:"#92400e", bg:"#fef3c7" },
                                                      absent:{ l:"❌ Absent", c:"#991b1b", bg:"#fee2e2" },
                                                      excuse:{ l:"📝 Excusé", c:"#1d4ed8", bg:"#dbeafe" } }[x.statut]
                                                   || { l:x.statut || "-", c:"#64748b", bg:"#f1f5f9" };
                                        return (
                                          <div key={x.id || i} style={{ display:"flex", alignItems:"center", gap:10, background:"#f8fafc", borderRadius:7, padding:"6px 10px", flexWrap:"wrap" }}>
                                            <span style={{ flex:"1 1 140px", fontSize:12, fontWeight:600, color:"#0f172a" }}>
                                              {[x.prenom_apprenant, x.nom_apprenant].filter(Boolean).join(" ") || "Apprenant"}
                                            </span>
                                            <span style={{ fontSize:10.5, fontWeight:700, padding:"2px 8px", borderRadius:999, background:cfg.bg, color:cfg.c, whiteSpace:"nowrap" }}>{cfg.l}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <input type="text" value={rapportForm.classe} onChange={e=>setRapportForm(p=>({...p,classe:e.target.value}))}
                  placeholder={rapportForm.coach_id ? "Aucune classe trouvée - saisir manuellement" : "Sélectionnez d'abord un coach"}
                  style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, boxSizing:"border-box" }} />
              )}
            </div>
          </div>

          {/* Critères */}
          <div style={{ background:"#f8fafc", borderRadius:12, padding:16, marginBottom:16, border:"1px solid #e2e8f0" }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:"#374151" }}>📊 Critères d'évaluation (1 à 5 étoiles) <span style={{ color:"#dc2626" }}>*</span><div style={{ fontSize:11, fontWeight:500, color:"#64748b", marginTop:3 }}>Les sept critères sont requis : un critère laissé vide calculerait la note sur 30 au lieu de 35, et elle cesserait d'être comparable à celle des autres coachs.</div></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {CRITERES_OBSERVATION.map(c=>(
                <div key={c.cle} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", borderRadius:8, padding:"10px 12px", border:`1px solid ${(Number(rapportForm[c.cle]) > 0) ? "#e2e8f0" : "#fca5a5"}`, background: (Number(rapportForm[c.cle]) > 0) ? "#fff" : "#fffbfb" }}>
                  <div style={{ fontSize:12, color:"#475569", fontWeight:600, minWidth:160 }}>{c.icon} {c.label}</div>
                  <EtoileRating value={rapportForm[c.cle]||0} onChange={v=>setRapportForm(p=>({...p,[c.cle]:v}))} />
                  <span style={{ fontSize:11, color:"#94a3b8", marginLeft:"auto" }}>{rapportForm[c.cle]||0}/5</span>
                </div>
              ))}
            </div>
          </div>

          {/* Échelles fermées - reprises de « Class Interactivity » et « Grammar ».
              Fermées et non libres : dans la feuille, ces lignes portaient des abréviations
              personnelles (« Induct & Great Exp », « Not Induc & Confu ») qui ne se trient
              ni ne se comparent, et dont la valeur la plus fréquente était « … ». */}
          <div style={{ background:"#f8fafc", borderRadius:12, padding:16, marginBottom:16, border:"1px solid #e2e8f0" }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:"#374151" }}>🎯 Appréciations</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {[{ cle:"interactivite_classe", titre:"👥 Interactivité de la classe", opts:ECHELLE_INTERACTIVITE },
                { cle:"approche_grammaticale", titre:"📖 Approche grammaticale",      opts:ECHELLE_GRAMMAIRE }].map(bloc => (
                <div key={bloc.cle}>
                  <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>{bloc.titre}</label>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    {bloc.opts.map(o => {
                      const actif = rapportForm[bloc.cle] === o.v;
                      return (
                        <button key={o.v} type="button"
                          onClick={()=>setRapportForm(p=>({ ...p, [bloc.cle]: actif ? "" : o.v }))}
                          style={{ textAlign:"left", padding:"8px 11px", borderRadius:8, cursor:"pointer",
                            border:`1.5px solid ${actif ? BET_COLOR : "#e2e8f0"}`,
                            background: actif ? BET_LIGHT : "#fff" }}>
                          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                            <span style={{ fontSize:12.5, fontWeight:700, color: actif ? BET_COLOR : "#374151" }}>{o.l}</span>
                            <span style={{ fontSize:11, color:"#94a3b8", marginLeft:"auto", fontWeight:700 }}>{o.pts}/5</span>
                          </div>
                          <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{o.d}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop:"1px solid #e2e8f0", marginTop:14, paddingTop:14 }}>
              <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, fontWeight:700, color:"#475569", marginBottom:7, flexWrap:"wrap" }}>
                📶 Internet
                <span style={{ fontWeight:400, color:"#94a3b8", fontSize:11 }}>
                  - constat de contexte, sans effet sur la note
                </span>
              </label>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {/* Les trois options sont toujours proposées. « Autre » était auparavant
                    conditionné au champ « Type de leçon » plus bas dans le formulaire :
                    l'observateur qui venait de choisir une séance en présentiel ne le
                    voyait pas apparaître, puisque ce champ-là n'était pas encore rempli. */}
                {ETATS_INTERNET
                  .map(o => {
                    const actif = rapportForm.internet === o.v;
                    return (
                      <button key={o.v} type="button" title={o.aide || undefined}
                        onClick={()=>setRapportForm(p=>({ ...p, internet: actif ? "" : o.v }))}
                        style={{ padding:"8px 14px", borderRadius:8, cursor:"pointer", fontSize:12.5, fontWeight:700,
                          border:`1.5px solid ${actif ? o.coul : "#e2e8f0"}`,
                          background: actif ? o.fond : "#fff",
                          color: actif ? o.coul : "#64748b" }}>
                        {o.icon} {o.l}
                      </button>
                    );
                  })}
              </div>
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:7 }}>
                « Autre » vaut « non applicable » - un cours en présentiel n'a pas d'état de connexion.
              </div>
            </div>
          </div>

          {/* Contexte de l'observation - les deux colonnes déclarées en en-tête de la feuille
              (« LESSON TYPES », et l'onglet « Mock Teaching ») qui n'avaient nulle part où
              être saisies. */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>Type d'observation</label>
              <div style={{ display:"flex", gap:6 }}>
                {TYPES_OBSERVATION.map(t=>(
                  <button key={t.v} type="button" onClick={()=>setRapportForm(p=>({...p,type_observation:t.v}))}
                    style={{ flex:1, padding:"9px 10px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
                      border:`1.5px solid ${rapportForm.type_observation===t.v?BET_COLOR:"#e2e8f0"}`,
                      background: rapportForm.type_observation===t.v?BET_LIGHT:"#fff",
                      color: rapportForm.type_observation===t.v?BET_COLOR:"#64748b" }}>{t.icon} {t.l}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>Type de leçon</label>
              <div style={{ display:"flex", gap:6 }}>
                {TYPES_LECON.map(t=>(
                  <button key={t.v} type="button"
                    onClick={()=>setRapportForm(p=>({
                      ...p,
                      type_lecon: p.type_lecon === t.v ? "" : t.v,
                    }))}
                    style={{ flex:1, padding:"9px 10px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
                      border:`1.5px solid ${rapportForm.type_lecon===t.v?BET_COLOR:"#e2e8f0"}`,
                      background: rapportForm.type_lecon===t.v?BET_LIGHT:"#fff",
                      color: rapportForm.type_lecon===t.v?BET_COLOR:"#64748b" }}>{t.icon} {t.l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Synthèse en direct - dans la feuille, « Satisfaction » était saisie à la main
              alors qu'elle résume les autres critères, d'où des rapports où elle les
              contredisait. Elle se calcule, et le superviseur la voit avant d'envoyer. */}
          {(() => {
            const PTS_I = { excellent:5, bon:4, acceptable:3, insuffisant:1 };
            const PTS_G = { inductive_claire:5, inductive_perfectible:4, deductive_claire:3, confuse:1 };
            const notes = [
              rapportForm.ponctualite, rapportForm.preparation, rapportForm.pedagogie,
              rapportForm.gestion_classe, rapportForm.professionnalisme,
              rapportForm.expression_engagement, rapportForm.feedback_correction,
              PTS_I[rapportForm.interactivite_classe], PTS_G[rapportForm.approche_grammaticale],
            ].filter(v => Number(v) > 0);
            if (!notes.length) return null;
            const moy = notes.reduce((a,b)=>a+Number(b),0) / notes.length;
            const pct = Math.round(moy / 5 * 100);
            const v = moy >= 4.25 ? { l:"Excellent", c:"#15803d", bg:"#dcfce7" }
                    : moy >= 3.25 ? { l:"Satisfaisant", c:"#b45309", bg:"#fef3c7" }
                    : { l:"À accompagner", c:"#b91c1c", bg:"#fee2e2" };
            return (
              <div style={{ display:"flex", alignItems:"center", gap:14, background:v.bg, border:`1.5px solid ${v.c}33`, borderRadius:12, padding:"14px 18px", marginBottom:16, flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontSize:10.5, fontWeight:800, color:v.c, letterSpacing:".07em" }}>SYNTHÈSE</div>
                  <div style={{ fontSize:18, fontWeight:800, color:v.c, marginTop:2 }}>{v.l}</div>
                </div>
                <div style={{ marginLeft:"auto", textAlign:"right" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:v.c }}>{moy.toFixed(1)}<span style={{ fontSize:13, fontWeight:600 }}>/5</span></div>
                  <div style={{ fontSize:11, color:v.c, opacity:.8 }}>{pct}% · {notes.length} critère{notes.length>1?"s":""} renseigné{notes.length>1?"s":""} sur 9</div>
                </div>
              </div>
            );
          })()}

          {/* Observations + Recommandations */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            {[{l:"💬 Observations",k:"observations",ph:"Points observés pendant le cours…"},{l:"✅ Recommandations",k:"recommandations",ph:"Suggestions d'amélioration…"}].map(f=>(
              <div key={f.k}>
                <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>{f.l}</label>
                <textarea rows={5} value={rapportForm[f.k]} onChange={e=>setRapportForm(p=>({...p,[f.k]:e.target.value}))}
                  placeholder={f.ph}
                  style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit", lineHeight:1.6 }} />
              </div>
            ))}
          </div>

          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", paddingTop:8, borderTop:"1px solid #e2e8f0" }}>
            <button onClick={()=>{ setShowRapportForm(false); setRapportForm(RAPPORT_INIT); setRapportCoachGroupes([]); }} style={{ padding:"10px 20px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:13, color:"#374151", cursor:"pointer", fontWeight:600 }}>Annuler</button>
            <button disabled={rapportSaving||!peut("rapports","manage")} title={permBtnTitle("Soumettre le rapport",peut("rapports","manage"))} onClick={soumettrRapport} style={permBtnStyle({ padding:"10px 24px", background:BET_COLOR, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:700, cursor:rapportSaving?"not-allowed":"pointer", opacity:rapportSaving?0.6:1 },peut("rapports","manage"))}>{rapportSaving?"⏳ Envoi…":peut("rapports","manage")?"📤 Soumettre le rapport":"🔒 Soumettre le rapport"}</button>
          </div>
        </Modal>
      )}
    </div>
    );
  };

  /* ── ÉLIGIBILITÉ ── */
  /* ── ANOMALIES ── */
  const renderAnomalies = () => (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>⚠️ Suivi des anomalies</h2>
          <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Non-conformités - alertes transmises au PA automatiquement</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={fetchAnomalies} style={{ padding:"7px 14px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}40`, borderRadius:8, fontSize:12, color:BET_COLOR, fontWeight:600, cursor:"pointer" }}>↻ Actualiser</button>
          <button disabled={!peut("rapports","manage")} title={permBtnTitle("Signaler une anomalie",peut("rapports","manage"))} onClick={()=>setShowAnomForm(true)} style={permBtnStyle({ padding:"7px 14px", background:"#dc2626", border:"none", borderRadius:8, fontSize:12, color:"#fff", fontWeight:600, cursor:"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"+":"🔒"} Signaler une anomalie</button>
        </div>
      </div>

      {anomLoading ? <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Chargement...</div>
      : anomalies.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
          <div style={{ fontWeight:600 }}>Aucune anomalie active</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {anomalies.map(a => {
            const gc = a.gravite==="haute"?"#dc2626":a.gravite==="moyenne"?"#d97706":"#6b7280";
            const gb = a.gravite==="haute"?"#fee2e2":a.gravite==="moyenne"?"#fef3c7":"#f3f4f6";
            return (
              <div key={a.id} style={{ background:"#f8fafc", borderRadius:12, padding:16, border:`1px solid ${a.gravite==="haute"?"#fecaca":"#e5e7eb"}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontWeight:700, fontSize:13 }}>{a.coach?.prenom} {a.coach?.nom}</span>
                      {statutBadge(a.statut)}
                      <Badge label={a.gravite.charAt(0).toUpperCase()+a.gravite.slice(1)} color={gc} bg={gb} />
                    </div>
                    <div style={{ fontSize:12, color:"#64748b", marginBottom:6 }}>Type : <strong>{a.type_anomalie.replace(/_/g," ")}</strong> - le {fmtDate(a.created_at)}</div>
                    <p style={{ fontSize:12, color:"#374151", margin:0, lineHeight:1.6 }}>{a.description}</p>
                    {a.escalade_a && <div style={{ marginTop:6, fontSize:11, color:"#7c3aed" }}>Escaladé vers <strong>{a.escalade_a.toUpperCase()}</strong> le {fmtDate(a.escalade_le)}</div>}
                    {a.resolution && <div style={{ marginTop:6, fontSize:11, color:"#166534" }}>Résolution : {a.resolution}</div>}
                  </div>
                  {a.statut !== "fermé" && IS_GENERAL && (
                    <button onClick={()=>setAnomDetail(a)} style={{ padding:"5px 12px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}40`, borderRadius:6, fontSize:11, color:BET_COLOR, fontWeight:600, cursor:"pointer", flexShrink:0, marginLeft:12 }}>Actions</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAnomForm && (
        <Modal title="Signaler une anomalie" subtitle="L'alerte sera automatiquement transmise au PA" onClose={()=>{setShowAnomForm(false);setAnomForm(ANOM_INIT);}}>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Coach concerné *</label>
            <select value={anomForm.coach_id} onChange={e=>setAnomForm(p=>({...p,coach_id:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff" }}>
              <option value="">-- Sélectionner --</option>
              {coachs.map(c=><option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Type d'anomalie *</label>
            <select value={anomForm.type_anomalie} onChange={e=>setAnomForm(p=>({...p,type_anomalie:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff" }}>
              <option value="cahier_incomplet">Cahier de texte incomplet</option>
              <option value="absence_non_justifiee">Absence non justifiée</option>
              <option value="qualite_faible">Qualité pédagogique insuffisante</option>
              <option value="retard_recurrent">Retards récurrents</option>
              <option value="non_respect_programme">Non-respect du programme</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Gravité</label>
            <div style={{ display:"flex", gap:8 }}>
              {["basse","moyenne","haute"].map(g=>{
                const gc=g==="haute"?"#dc2626":g==="moyenne"?"#d97706":"#6b7280";
                return <button key={g} type="button" onClick={()=>setAnomForm(p=>({...p,gravite:g}))} style={{ flex:1, padding:"8px", borderRadius:8, border:`2px solid ${anomForm.gravite===g?gc:"#e2e8f0"}`, background:anomForm.gravite===g?(g==="haute"?"#fee2e2":g==="moyenne"?"#fef3c7":"#f3f4f6"):"#fff", fontSize:12, fontWeight:700, cursor:"pointer", color:anomForm.gravite===g?gc:"#9ca3af" }}>
                  {g.charAt(0).toUpperCase()+g.slice(1)}
                </button>;
              })}
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Description *</label>
            <textarea rows={4} value={anomForm.description} onChange={e=>setAnomForm(p=>({...p,description:e.target.value}))} placeholder="Décrivez l'anomalie constatée..." style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, resize:"vertical", boxSizing:"border-box" }} />
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button disabled={anomSaving||!peut("rapports","manage")} title={permBtnTitle("Signaler et notifier PA",peut("rapports","manage"))} onClick={signalerAnomalie} style={permBtnStyle({ padding:"9px 18px", background:"#dc2626", border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:anomSaving?"not-allowed":"pointer", opacity:anomSaving?0.6:1 },peut("rapports","manage"))}>{anomSaving?"⏳…":peut("rapports","manage")?"Signaler et notifier PA":"🔒 Signaler et notifier PA"}</button>
            <button onClick={()=>{setShowAnomForm(false);setAnomForm(ANOM_INIT);}} style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:13, color:"#374151", cursor:"pointer" }}>Annuler</button>
          </div>
        </Modal>
      )}

      {anomDetail && (
        <Modal title="Actions sur l'anomalie" onClose={()=>setAnomDetail(null)}>
          <p style={{ fontSize:13, color:"#475569", marginBottom:16, lineHeight:1.7 }}><strong>{anomDetail.type_anomalie.replace(/_/g," ")}</strong> - {anomDetail.description}</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {anomDetail.statut !== "escaladé" && (
              <>
                <button disabled={anomActionLoading.has(anomDetail.id)||!peut("rapports","manage")} title={permBtnTitle("Escalader vers le PA",peut("rapports","manage"))} onClick={()=>escaladerAnomalie(anomDetail.id,"pa")} style={permBtnStyle({ padding:"9px 18px", background:BET_COLOR, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:anomActionLoading.has(anomDetail.id)?"not-allowed":"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"":"🔒 "}Escalader vers le PA</button>
                <button disabled={anomActionLoading.has(anomDetail.id)||!peut("rapports","manage")} title={permBtnTitle("Escalader vers le CEO",peut("rapports","manage"))} onClick={()=>escaladerAnomalie(anomDetail.id,"ceo")} style={permBtnStyle({ padding:"9px 18px", background:"#dc2626", border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:anomActionLoading.has(anomDetail.id)?"not-allowed":"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"":"🔒 "}Escalader vers le CEO</button>
              </>
            )}
            <textarea id="resoTxt" rows={3} placeholder="Saisissez la résolution..." style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, resize:"vertical", boxSizing:"border-box" }} />
            <button disabled={anomActionLoading.has(anomDetail.id)||!peut("rapports","manage")} title={permBtnTitle("Fermer l'anomalie",peut("rapports","manage"))} onClick={()=>fermerAnomalie(anomDetail.id, document.getElementById("resoTxt")?.value)} style={permBtnStyle({ padding:"9px 18px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, color:"#374151", fontWeight:600, cursor:anomActionLoading.has(anomDetail.id)?"not-allowed":"pointer" },peut("rapports","manage"))}>{peut("rapports","manage")?"":"🔒 "}Fermer l'anomalie</button>
          </div>
        </Modal>
      )}
    </div>
  );

  /* ── GESTION DEPUTIES ── */
  const renderDeputies = () => (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>👥 Gestion des Deputy Superviseurs</h2>
          <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Assignez des missions et suivez leur activité</p>
        </div>
        <button onClick={fetchDeputies} style={{ padding:"7px 14px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}40`, borderRadius:8, fontSize:12, color:BET_COLOR, fontWeight:600, cursor:"pointer" }}>↻ Actualiser</button>
      </div>

      {deputiesLoading ? <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Chargement...</div>
      : deputies.length === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
          <div style={{ fontWeight:600 }}>Aucun Deputy Superviseur enregistré</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px,1fr))", gap:14 }}>
          {deputies.map(d=>(
            <div key={d.id} style={{ background:"#f8fafc", borderRadius:12, padding:18, border:"1px solid #e5e7eb" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                <div style={{ width:46, height:46, borderRadius:10, background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color:BET_COLOR }}>{(d.prenom||"")[0]}{(d.nom||"")[0]}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{d.prenom} {d.nom}</div>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>{d.email}</div>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                <div style={{ background:"#fff", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:BET_COLOR }}>{d.nb_missions_actives}</div>
                  <div style={{ fontSize:10, color:"#9ca3af" }}>Missions actives</div>
                </div>
                <div style={{ background:"#fff", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:"#059669" }}>{d.nb_rapports_soumis}</div>
                  <div style={{ fontSize:10, color:"#9ca3af" }}>Rapports soumis</div>
                </div>
              </div>
              {d.missions?.slice(0,3).map(m=>(
                <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:12, padding:"5px 0", borderBottom:"1px solid #f1f5f9" }}>
                  <span style={{ color:"#374151" }}>{m.titre}</span>
                  {statutBadge(m.statut)}
                </div>
              ))}
              <button disabled={!peut("missions","update")} title={permBtnTitle("Assigner une mission",peut("missions","update"))} onClick={()=>{setDeputySelected(d);setShowMissionForm(true);}} style={permBtnStyle({ width:"100%", marginTop:12, padding:"8px", background:BET_COLOR, border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" },peut("missions","update"))}>
                {peut("missions","update")?"+":"🔒"} Assigner une mission
              </button>
            </div>
          ))}
        </div>
      )}

      {showMissionForm && deputySelected && (
        <Modal title={`Mission pour ${deputySelected.prenom} ${deputySelected.nom}`} onClose={()=>{setShowMissionForm(false);setMissionForm(MISSION_INIT);}}>
          {[
            { l:"Type de mission *", k:"type_mission", type:"select", opts:[{v:"observation",l:"Observation de cours"},{v:"verification_cahier",l:"Vérification cahier"},{v:"suivi_absence",l:"Suivi d'absence"},{v:"autre",l:"Autre"}] },
          ].map(f=>(
            <div key={f.k} style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>{f.l}</label>
              <select value={missionForm[f.k]} onChange={e=>setMissionForm(p=>({...p,[f.k]:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff" }}>
                {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Titre *</label>
            <input value={missionForm.titre} onChange={e=>setMissionForm(p=>({...p,titre:e.target.value}))} placeholder="ex: Observer le cours B1 de Coach Koné" style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, boxSizing:"border-box" }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Coach ciblé (optionnel)</label>
            <select value={missionForm.coach_id} onChange={e=>setMissionForm(p=>({...p,coach_id:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff" }}>
              <option value="">-- Aucun coach spécifique --</option>
              {coachs.map(c=><option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </select>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
            {[{l:"Centre",k:"centre",t:"text"},{l:"Date début",k:"date_debut",t:"date"},{l:"Date fin",k:"date_fin",t:"date"}].map(f=>(
              <div key={f.k}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>{f.l}</label>
                <input type={f.t} value={missionForm[f.k]} onChange={e=>setMissionForm(p=>({...p,[f.k]:e.target.value}))} style={{ width:"100%", padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, boxSizing:"border-box" }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Instructions</label>
            <textarea rows={3} value={missionForm.description} onChange={e=>setMissionForm(p=>({...p,description:e.target.value}))} placeholder="Instructions spécifiques..." style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, resize:"vertical", boxSizing:"border-box" }} />
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={assignerMission} disabled={missionSaving||!peut("missions","update")} title={permBtnTitle("Assigner et notifier",peut("missions","update"))} style={permBtnStyle({ padding:"9px 18px", background:BET_COLOR, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", opacity:missionSaving?0.6:1 },peut("missions","update"))}>{missionSaving?"Envoi...":peut("missions","update")?"Assigner et notifier":"🔒 Assigner et notifier"}</button>
            <button onClick={()=>{setShowMissionForm(false);setMissionForm(MISSION_INIT);}} style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:8, fontSize:13, color:"#374151", cursor:"pointer" }}>Annuler</button>
          </div>
        </Modal>
      )}
    </div>
  );

  /* ── OBSERVER UN COURS (superviseur général + deputy - lecture seule) ── */
  const PLANNING_STATUTS = [
    { key:"tous",       label:"Tous" },
    { key:"planifiee",  label:"Planifiées" },
    { key:"en_cours",   label:"En cours" },
    { key:"terminee",   label:"Terminées" },
    { key:"annulee",    label:"Annulées" },
  ];
  const PLANNING_BADGE = {
    planifiee: { c:"#d97706", bg:"#fef9c3", label:"🟡 Planifiée" },
    en_cours:  { c:"#16a34a", bg:"#dcfce7", label:"🟢 En cours" },
    terminee:  { c:"#475569", bg:"#f1f5f9", label:"⚪ Terminée" },
    annulee:   { c:"#dc2626", bg:"#fee2e2", label:"🔴 Annulée" },
  };
  const PLATEFORME_BADGE = {
    zoom:       { icon:"📹", label:"Zoom" },
    meet:       { icon:"📹", label:"Google Meet" },
    teams:      { icon:"📹", label:"Teams" },
    webex:      { icon:"📹", label:"Webex" },
    presentiel: { icon:"🏢", label:"Présentiel" },
    domicile:   { icon:"🏠", label:"Domicile" },
  };

  const renderPlannings = () => {
    const totalPages = Math.max(1, Math.ceil(plannings.length / PLANNING_PER_PAGE));
    const pageSafe   = Math.min(planningPage, totalPages);
    const pageItems  = plannings.slice((pageSafe - 1) * PLANNING_PER_PAGE, pageSafe * PLANNING_PER_PAGE);
    // Le direct se cherche sur TOUT le planning, pas sur la page affichée : un cours en cours
    // à la page 3 doit pouvoir être rejoint depuis la page 1.
    const enDirect  = plannings.filter(EN_DIRECT);
    const abandonnees = plannings.filter(SALLE_ABANDONNEE);

    return (
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:10 }}>
          <div>
            <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>📅 Plannings</h2>
            <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Toutes les sessions live programmées par les coachs - présentiel et en ligne</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <input type="date" value={planningDateFrom} onChange={e=>setPlanningDateFrom(e.target.value)}
              style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>au</span>
            <input type="date" value={planningDateTo} onChange={e=>setPlanningDateTo(e.target.value)}
              style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
            {(planningDateFrom||planningDateTo) && (
              <button onClick={()=>{ setPlanningDateFrom(""); setPlanningDateTo(""); }}
                style={{ padding:"3px 9px", borderRadius:7, border:"1.5px solid #fca5a5", background:"#fef2f2", fontSize:12, color:"#b91c1c", cursor:"pointer", fontWeight:600 }}>✕</button>
            )}
            <button onClick={fetchPlannings} style={{ padding:"5px 12px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}40`, borderRadius:7, fontSize:12, color:BET_COLOR, fontWeight:600, cursor:"pointer" }}>↻ Actualiser</button>
          </div>
        </div>

        {/* Observer un cours pendant qu'il se donne est le métier même de ces deux rôles :
            sans ce bandeau, il fallait repérer la bonne ligne dans le tableau. */}
        {enDirect.length > 0 && (
          <div style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:12, padding:"14px 16px", marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#b91c1c", marginBottom:10 }}>
              🔴 EN DIRECT MAINTENANT - {enDirect.length} cours
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {enDirect.map(s => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", border:"1px solid #fecaca", borderRadius:9, padding:"9px 12px", flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{s.titre || "Séance"}</span>
                  <span style={{ fontSize:12, color:"#64748b" }}>
                    {s.coach_nom || "-"}{s.groupe_nom ? ` · ${s.groupe_nom}` : ""}{s.heure ? ` · ${s.heure.slice(0,5)}` : ""}
                  </span>
                  {s.plateforme !== "presentiel" && s.lien && (
                    <button onClick={()=>window.open(s.lien, "_blank", "noopener,noreferrer")}
                      style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:8, border:"none", background:"#b91c1c", color:"#fff", fontSize:12, fontWeight:800, cursor:"pointer", whiteSpace:"nowrap" }}>
                      ▶ Rejoindre maintenant
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Une salle laissée ouverte n'est pas un cours en direct : la signaler évite de
            partir observer un cours qui s'est terminé depuis longtemps. */}
        {abandonnees.length > 0 && (
          <div style={{ background:"#fffbeb", border:"1.5px solid #fcd34d", borderRadius:12, padding:"12px 16px", marginBottom:14, fontSize:12.5, color:"#92400e" }}>
            <strong>⚠️ {abandonnees.length} salle{abandonnees.length>1?"s":""} restée{abandonnees.length>1?"s":""} ouverte{abandonnees.length>1?"s":""}</strong> - ouverte
            depuis plus de {HEURES_AVANT_SALLE_ABANDONNEE} h sans clôture : {abandonnees.map(s=>s.titre||"Séance").join(" · ")}. Le cours est probablement terminé, la durée réelle restera inconnue.
          </div>
        )}

        {/* Filtres statut */}
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {PLANNING_STATUTS.map(s => (
            <button key={s.key} onClick={()=>setPlanningStatut(s.key)} style={{
              padding:"5px 14px", borderRadius:999, border:`1.5px solid ${planningStatut===s.key?BET_COLOR:"#e2e8f0"}`,
              background: planningStatut===s.key ? BET_COLOR : "#fff", color: planningStatut===s.key ? "#fff" : "#374151",
              fontSize:12, fontWeight:600, cursor:"pointer",
            }}>{s.label}</button>
          ))}
        </div>

        {planningsLoading ? (
          <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Chargement des plannings...</div>
        ) : planningError ? (
          <div style={{ textAlign:"center", padding:60, color:"#b91c1c", background:"#fef2f2", borderRadius:12, border:"1px dashed #fca5a5" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
            <div style={{ fontWeight:700, marginBottom:6 }}>Impossible de charger les plannings</div>
            <div style={{ fontSize:12 }}>{planningError}</div>
            <button onClick={fetchPlannings} style={{ marginTop:14, padding:"6px 16px", borderRadius:8, border:"none", background:"#b91c1c", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:12 }}>Réessayer</button>
          </div>
        ) : plannings.length === 0 ? (
          <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
            <div style={{ fontWeight:600 }}>Aucune session sur cette période</div>
          </div>
        ) : (
          <>
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                    {["Session","Coach","Groupe","Plateforme","Date","Heure","Statut","Actions"].map(h=>(
                      <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:".03em", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((s, idx) => {
                    const badge = PLANNING_BADGE[s.statut] || { c:"#6b7280", bg:"#f1f5f9", label:s.statut||"-" };
                    const plat  = PLATEFORME_BADGE[s.plateforme] || { icon:"💻", label:s.plateforme||"-" };
                    const rowBg = idx%2===0?"#fff":"#fafafa";
                    const peutRejoindre = s.plateforme !== "presentiel" && s.lien && !SESSION_CLOSE(s.statut);
                    const lienInerte    = s.plateforme !== "presentiel" && s.lien && SESSION_CLOSE(s.statut);
                    return (
                      <tr key={s.id} style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer" }}
                        onClick={()=>setPlanningDetail(s)}
                        onMouseEnter={e=>e.currentTarget.style.background=BET_LIGHT}
                        onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                        <td style={{ padding:"10px 12px", fontWeight:700, color:"#0f172a" }}>{s.titre||"-"}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#374151" }}>{s.coach_nom||"-"}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#374151" }}>{s.groupe_nom||"-"}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#374151", whiteSpace:"nowrap" }}>{plat.icon} {plat.label}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>{fmtDate(s.date)}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>{s.heure?.slice(0,5)||"-"}{s.heure_fin ? ` - ${s.heure_fin.slice(0,5)}` : ""}</td>
                        <td style={{ padding:"10px 12px" }}>
                          {/* « En cours » sans borne de temps désignait aussi bien un cours en
                              train de se donner qu'une salle oubliée ouverte depuis trois jours. */}
                          <span title={SALLE_ABANDONNEE(s) ? "Salle ouverte depuis plus de 4 h sans clôture" : undefined}
                            style={{ background: SALLE_ABANDONNEE(s) ? "#fffbeb" : badge.bg, color: SALLE_ABANDONNEE(s) ? "#b45309" : badge.c, borderRadius:99, padding:"3px 10px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>
                            {SALLE_ABANDONNEE(s) ? "⚠️ Salle non clôturée" : badge.label}
                          </span>
                        </td>
                        <td style={{ padding:"10px 12px" }}>
                          <div style={{ display:"flex", gap:6 }}>
                            {peutRejoindre && (
                              <button onClick={e=>{ e.stopPropagation(); window.open(s.lien, "_blank", "noopener,noreferrer"); }}
                                style={{ padding:"4px 10px", borderRadius:7, border:"none", background: EN_DIRECT(s) ? "#b91c1c" : "#16a34a", color:"#fff", fontSize:11, fontWeight: EN_DIRECT(s) ? 800 : 700, cursor:"pointer", whiteSpace:"nowrap" }}>
                                {EN_DIRECT(s) ? "▶ Rejoindre maintenant" : "🔗 Rejoindre"}
                              </button>
                            )}
                            {/* Le lien reste visible mais inerte : le masquer laisserait croire
                                qu'aucune salle n'avait été prévue pour ce cours. */}
                            {lienInerte && (
                              <span title={RAISON_CLOSE(s.statut)}
                                style={{ padding:"4px 10px", borderRadius:7, background:"#f1f5f9", color:"#94a3b8", fontSize:11, fontWeight:700, whiteSpace:"nowrap", cursor:"not-allowed" }}>🔗 Rejoindre</span>
                            )}
                            <button onClick={e=>{ e.stopPropagation(); setPlanningDetail(s); }}
                              style={{ padding:"4px 10px", borderRadius:7, border:`1.5px solid ${BET_COLOR}40`, background:BET_LIGHT, color:BET_COLOR, fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>Détails</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", padding:"12px 0" }}>
                <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>Page {pageSafe}/{totalPages} · {plannings.length} session{plannings.length!==1?"s":""}</span>
                <button onClick={()=>setPlanningPage(p=>Math.max(1,p-1))} disabled={pageSafe===1}
                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:pageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:pageSafe===1?"default":"pointer", color:pageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                  <button key={p} onClick={()=>setPlanningPage(p)}
                    style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===pageSafe?BET_COLOR:"#e2e8f0"}`, background:p===pageSafe?BET_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===pageSafe?"#fff":"#374151", fontWeight:p===pageSafe?800:400 }}>{p}</button>
                ))}
                <button onClick={()=>setPlanningPage(p=>Math.min(totalPages,p+1))} disabled={pageSafe===totalPages}
                  style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:pageSafe===totalPages?"#f1f5f9":"#fff", fontSize:12, cursor:pageSafe===totalPages?"default":"pointer", color:pageSafe===totalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
              </div>
            )}
          </>
        )}

        {planningDetail && (() => {
          const badge = PLANNING_BADGE[planningDetail.statut] || { c:"#6b7280", bg:"#f1f5f9", label:planningDetail.statut||"-" };
          const plat  = PLATEFORME_BADGE[planningDetail.plateforme] || { icon:"💻", label:planningDetail.plateforme||"-" };
          const peutRejoindre = planningDetail.plateforme !== "presentiel" && planningDetail.lien && !SESSION_CLOSE(planningDetail.statut);
          const lienInerteDetail = planningDetail.plateforme !== "presentiel" && planningDetail.lien && SESSION_CLOSE(planningDetail.statut);
          return (
            <div onClick={()=>setPlanningDetail(null)} style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
              <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:14, padding:28, maxWidth:640, width:"100%", maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:"#0f172a" }}>{planningDetail.titre||"-"}</h3>
                  <button onClick={()=>setPlanningDetail(null)} style={{ border:"none", background:"none", fontSize:18, cursor:"pointer", color:"#94a3b8", lineHeight:1 }}>✕</button>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10, fontSize:13 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#9ca3af" }}>Coach</span><span style={{ fontWeight:600, color:"#374151" }}>{planningDetail.coach_nom||"-"}</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#9ca3af" }}>Groupe</span><span style={{ fontWeight:600, color:"#374151" }}>{planningDetail.groupe_nom||"-"}{planningDetail.groupe_niveau ? ` (${planningDetail.groupe_niveau})` : ""}</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#9ca3af" }}>Plateforme</span><span style={{ fontWeight:600, color:"#374151" }}>{plat.icon} {plat.label}</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#9ca3af" }}>Date</span><span style={{ fontWeight:600, color:"#374151" }}>{fmtDate(planningDetail.date)}</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#9ca3af" }}>Heure</span><span style={{ fontWeight:600, color:"#374151" }}>{planningDetail.heure?.slice(0,5)||"-"}{planningDetail.heure_fin ? ` - ${planningDetail.heure_fin.slice(0,5)}` : ""} ({planningDetail.duree||"-"} min)</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#9ca3af" }}>Statut</span><span style={{ background:badge.bg, color:badge.c, borderRadius:99, padding:"2px 10px", fontSize:11, fontWeight:700 }}>{badge.label}</span></div>
                  {planningDetail.notes && (
                    <div>
                      <div style={{ color:"#9ca3af", marginBottom:4 }}>Notes</div>
                      <div style={{ background:"#f8fafc", borderRadius:8, padding:10, color:"#374151", fontSize:12 }}>{planningDetail.notes}</div>
                    </div>
                  )}
                </div>

                {/* Le temps réellement passé en salle - ce que le superviseur vérifie
                    précisément quand il contrôle qu'un cours a bien été donné. */}
                <DerouleReel seance={planningDetail} style={{ marginTop:16 }} />

                {/* Liste de présence du groupe */}
                <div style={{ marginTop:20, paddingTop:16, borderTop:"1px solid #f1f5f9" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:10 }}>👥 Liste de présence</div>
                  {!planningDetail.seance_id ? (
                    <div style={{ fontSize:12, color:"#9ca3af" }}>Aucune séance liée à cette session.</div>
                  ) : planningPresencesLoading ? (
                    <div style={{ fontSize:12, color:"#9ca3af" }}>Chargement...</div>
                  ) : planningPresences.length === 0 ? (
                    <div style={{ fontSize:12, color:"#9ca3af" }}>Présences pas encore enregistrées (à saisir par le coach en clôturant la session).</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:220, overflowY:"auto" }}>
                      {planningPresences.map(p => {
                        const PSTATUT = {
                          present: { c:"#16a34a", bg:"#dcfce7", label:"Présent" },
                          absent:  { c:"#dc2626", bg:"#fee2e2", label:"Absent" },
                          retard:  { c:"#d97706", bg:"#fef9c3", label:"Retard" },
                          excuse:  { c:"#6366f1", bg:"#e0e7ff", label:"Excusé" },
                        };
                        const ps = PSTATUT[p.statut] || { c:"#6b7280", bg:"#f1f5f9", label:p.statut||"-" };
                        return (
                          <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", background:"#f8fafc", borderRadius:8 }}>
                            <span style={{ fontSize:12, color:"#374151", fontWeight:600 }}>{`${p.prenom_apprenant||""} ${p.nom_apprenant||""}`.trim()}</span>
                            <span style={{ background:ps.bg, color:ps.c, borderRadius:99, padding:"2px 9px", fontSize:10, fontWeight:700 }}>{ps.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {peutRejoindre && (
                  <button onClick={()=>window.open(planningDetail.lien, "_blank", "noopener,noreferrer")}
                    style={{ marginTop:18, width:"100%", padding:"10px", borderRadius:9, border:"none", background: EN_DIRECT(planningDetail) ? "#b91c1c" : "#16a34a", color:"#fff", fontWeight: EN_DIRECT(planningDetail) ? 800 : 700, fontSize:13, cursor:"pointer" }}>
                    {EN_DIRECT(planningDetail) ? "▶ Rejoindre maintenant" : "🔗 Rejoindre la session"}
                  </button>
                )}
                {lienInerteDetail && (
                  <div title={RAISON_CLOSE(planningDetail.statut)}
                    style={{ marginTop:18, width:"100%", padding:"10px", borderRadius:9, background:"#f1f5f9", color:"#94a3b8", fontWeight:700, fontSize:13, textAlign:"center", cursor:"not-allowed" }}>
                    🔒 {RAISON_CLOSE(planningDetail.statut)}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderObserverCours = () => {

    const classesFiltrees = (Array.isArray(classes) ? classes : []).filter(cl => {
      if (!cl.date_debut) return true;
      const d = new Date(cl.date_debut);
      if (obsDateFrom && d < new Date(obsDateFrom)) return false;
      if (obsDateTo   && d > new Date(obsDateTo + "T23:59:59")) return false;
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(classesFiltrees.length / OBS_PER_PAGE));
    const pageSafe   = Math.min(obsPage, totalPages);
    const pageItems  = classesFiltrees.slice((pageSafe - 1) * OBS_PER_PAGE, pageSafe * OBS_PER_PAGE);

    const PagBar = () => totalPages <= 1 ? null : (
      <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", padding:"12px 0" }}>
        <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>Page {pageSafe}/{totalPages} · {classesFiltrees.length} classe{classesFiltrees.length!==1?"s":""}{(obsDateFrom||obsDateTo)?" (filtrées)":""}</span>
        <button onClick={()=>setObsPage(p=>Math.max(1,p-1))} disabled={pageSafe===1}
          style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:pageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:pageSafe===1?"default":"pointer", color:pageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
        {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
          <button key={p} onClick={()=>setObsPage(p)}
            style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===pageSafe?BET_COLOR:"#e2e8f0"}`, background:p===pageSafe?BET_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===pageSafe?"#fff":"#374151", fontWeight:p===pageSafe?800:400 }}>{p}</button>
        ))}
        <button onClick={()=>setObsPage(p=>Math.min(totalPages,p+1))} disabled={pageSafe===totalPages}
          style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:pageSafe===totalPages?"#f1f5f9":"#fff", fontSize:12, cursor:pageSafe===totalPages?"default":"pointer", color:pageSafe===totalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
      </div>
    );

    return (
      <div>
        {/* En-tête + filtres */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:10 }}>
          <div>
            <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>👁️ Observer un cours</h2>
            <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Accès lecture seule - lien de salle + liste apprenants du cours observé</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>Début du</span>
            <input type="date" value={obsDateFrom} onChange={e=>{ setObsDateFrom(e.target.value); setObsPage(1); }}
              style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
            <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>au</span>
            <input type="date" value={obsDateTo} onChange={e=>{ setObsDateTo(e.target.value); setObsPage(1); }}
              style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
            {(obsDateFrom||obsDateTo) && (
              <button onClick={()=>{ setObsDateFrom(""); setObsDateTo(""); setObsPage(1); }}
                style={{ padding:"3px 9px", borderRadius:7, border:"1.5px solid #fca5a5", background:"#fef2f2", fontSize:12, color:"#b91c1c", cursor:"pointer", fontWeight:600 }}>✕</button>
            )}
            <button onClick={fetchClasses} style={{ padding:"5px 12px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}40`, borderRadius:7, fontSize:12, color:BET_COLOR, fontWeight:600, cursor:"pointer" }}>↻ Actualiser</button>
          </div>
        </div>

        {/* Bandeau restrictions */}
        <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#92400e", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>🔒</span>
          <span>Accès <strong>lecture seule</strong>. Vous pouvez consulter les classes et rejoindre une salle d'observation, sans modifier aucune donnée.</span>
        </div>

        {classesLoading ? (
          <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Chargement des classes...</div>
        ) : (Array.isArray(classes) ? classes : []).length === 0 ? (
          <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📚</div>
            <div style={{ fontWeight:600 }}>Aucune classe disponible</div>
          </div>
        ) : classesFiltrees.length === 0 ? (
          <div style={{ textAlign:"center", padding:"40px 0", background:"#fff7ed", borderRadius:12, border:"1px dashed #fed7aa", color:"#9ca3af" }}>
            <div style={{ fontSize:36, marginBottom:8 }}>🗓️</div>
            <div style={{ fontWeight:600, color:"#374151", marginBottom:8 }}>Aucune classe sur cette période</div>
            <button onClick={()=>{ setObsDateFrom(""); setObsDateTo(""); setObsPage(1); }}
              style={{ padding:"6px 16px", borderRadius:8, border:"none", background:BET_COLOR, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:12 }}>Effacer le filtre</button>
          </div>
        ) : (
          <>
            <PagBar />
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                    {["#","Classe","Coach","Niveau","Type","Apprenants","Séances","Début","Statut","Actions"].map(h=>(
                      <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:".03em", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((cl, idx) => {
                    const sCol = cl.statut==="actif" ? { c:"#16a34a",bg:"#dcfce7" } : cl.statut==="termine" ? { c:"#475569",bg:"#f1f5f9" } : { c:"#d97706",bg:"#fef9c3" };
                    const typeLabel = cl.type_cours==="en_ligne" ? "💻 En ligne" : cl.type_cours==="domicile" ? "🏠 Domicile" : "🏢 Présentiel";
                    const rowBg = idx%2===0?"#fff":"#fafafa";
                    return (
                      /* La ligne entière ouvre la fiche de la classe, sur ses apprenants -
                         c'est le nom de la classe qu'on cherche à cliquer, pas le bouton. */
                      <tr key={cl.id}
                        onClick={async()=>{ setClasseDetail(cl); setClasseModalTab("apprenants"); await Promise.all([fetchClasseApprenants(cl.id), fetchClasseSessions(cl.id)]); }}
                        title={`Ouvrir la classe ${cl.nom || ""}`}
                        style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer" }}
                        onMouseEnter={e=>e.currentTarget.style.background=BET_LIGHT}
                        onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                        <td style={{ padding:"10px 12px", color:"#94a3b8", fontWeight:600, fontSize:12 }}>{(pageSafe-1)*OBS_PER_PAGE+idx+1}</td>
                        <td style={{ padding:"10px 12px" }}>
                          <div style={{ fontWeight:700, color:"#0f172a" }}>{cl.nom||"-"}</div>
                          {cl.code && <div style={{ fontSize:10, color:"#94a3b8", marginTop:1 }}>{cl.code}</div>}
                        </td>
                        <td style={{ padding:"10px 12px" }}>
                          {cl.coach_nom
                            ? <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <div style={{ width:26, height:26, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:BET_COLOR, flexShrink:0 }}>{(cl.coach_nom||"")[0]}</div>
                                <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{cl.coach_nom}</span>
                              </div>
                            : <span style={{ color:"#94a3b8", fontSize:12 }}>-</span>
                          }
                        </td>
                        <td style={{ padding:"10px 12px" }}>
                          {cl.niveau
                            ? <span style={{ fontSize:11, fontWeight:800, padding:"2px 8px", borderRadius:999, background:BET_LIGHT, color:BET_COLOR }}>{cl.niveau}</span>
                            : <span style={{ color:"#94a3b8" }}>-</span>}
                        </td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#374151", whiteSpace:"nowrap" }}>{cl.type_cours ? typeLabel : "-"}</td>
                        <td style={{ padding:"10px 12px", textAlign:"center", fontWeight:700, color:BET_COLOR, fontSize:14 }}>{cl.nb_apprenants ?? "-"}</td>
                        <td style={{ padding:"10px 12px", textAlign:"center", color:"#374151" }}>{cl.nb_seances_realisees ?? "-"}</td>
                        <td style={{ padding:"10px 12px", fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>{cl.date_debut ? fmtDate(cl.date_debut) : "-"}</td>
                        <td style={{ padding:"10px 12px" }}>
                          <span style={{ background:sCol.bg, color:sCol.c, borderRadius:99, padding:"3px 10px", fontSize:10, fontWeight:700 }}>{cl.statut||"-"}</span>
                        </td>
                        <td style={{ padding:"10px 12px" }}>
                          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                            <button onClick={async(e)=>{ e.stopPropagation(); setClasseDetail(cl); setClasseModalTab("apprenants"); await Promise.all([fetchClasseApprenants(cl.id), fetchClasseSessions(cl.id)]); }}
                              style={{ padding:"4px 9px", background:BET_LIGHT, border:`1px solid ${BET_COLOR}30`, borderRadius:6, fontSize:11, color:BET_COLOR, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                              👥 Apprenants
                            </button>
                            <button onClick={async(e)=>{ e.stopPropagation(); setClasseDetail(cl); setClasseModalTab("disponibilite"); await Promise.all([fetchClasseApprenants(cl.id), fetchClasseSessions(cl.id)]); }}
                              style={{ padding:"4px 9px", background:"#1d4ed8", border:"none", borderRadius:6, fontSize:11, color:"#fff", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                              🎥 Sessions
                            </button>
                            <button disabled={!peut("rapports","manage")} title={permBtnTitle("Observer",peut("rapports","manage"))} onClick={(e)=>{ e.stopPropagation(); /* `groupe_id` en plus du nom : c'est lui qui déclenche le chargement des
                                                 séances de la classe. Sans lui, le rapport ouvert depuis ici
                                                 n'affichait ni les classes du coach ni ses séances. */
                                              setRapportForm(p=>({...p, coach_id: cl.coach_id||"", classe: cl.nom||"", groupe_id: cl.id||"", seance_id:"", session_live_id:"", centre: p.centre || lieuDeLaClasse(cl) })); setActiveTab("rapports"); setTimeout(()=>setShowRapportForm(true), 80); }}
                              style={permBtnStyle({ padding:"4px 9px", background:"#fff", border:"1px solid #e2e8f0", borderRadius:6, fontSize:11, color:"#374151", cursor:"pointer", whiteSpace:"nowrap" },peut("rapports","manage"))}>
                              {peut("rapports","manage")?"📋":"🔒"} Observer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PagBar />
          </>
        )}

        {/* Modal liste apprenants - lecture seule */}
        {classeDetail && (
          <Modal title={`👥 ${classeDetail.nom}`} subtitle="Vue lecture seule" onClose={()=>{ setClasseDetail(null); setClasseApprenants([]); setClasseSessions([]); }} big>
            <div style={{ display:"flex", gap:4, marginBottom:18, background:"#f1f5f9", borderRadius:10, padding:4, width:"fit-content" }}>
              {[
                { id:"apprenants",    label:`🎓 Apprenants${classeApprenants.length ? ` (${classeApprenants.length})` : ""}` },
                { id:"disponibilite", label:`📅 Disponibilités et sessions${classeSessions.length ? ` (${classeSessions.length})` : ""}` },
              ].map(t => (
                <button key={t.id} onClick={()=>setClasseModalTab(t.id)}
                  style={{ padding:"7px 14px", borderRadius:7, border:"none", fontSize:12, fontWeight:700, cursor:"pointer",
                    background: classeModalTab===t.id ? "#fff" : "transparent",
                    color: classeModalTab===t.id ? BET_COLOR : "#64748b",
                    boxShadow: classeModalTab===t.id ? "0 1px 6px rgba(0,0,0,.08)" : "none" }}>
                  {t.label}
                </button>
              ))}
            </div>

            {classeModalTab === "apprenants" && (
              classeAppLoading ? (
                <div style={{ textAlign:"center", padding:30, color:"#94a3b8" }}>Chargement...</div>
              ) : classeApprenants.length === 0 ? (
                <div style={{ textAlign:"center", padding:30, color:"#94a3b8" }}>Aucun apprenant inscrit</div>
              ) : (
                <div>
                  <div style={{ marginBottom:12, fontSize:12, color:"#64748b" }}>
                    {classeApprenants.length} apprenant(s) inscrit(s) - données en lecture seule
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#f8fafc" }}>
                          {["#","Prénom","Nom","Email","Téléphone","Présences","Absences"].map(h => (
                            <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:"#6b7280", borderBottom:"1px solid #e5e7eb" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {classeApprenants.map((a, i) => (
                          <tr key={a.id||i} style={{ borderBottom:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafafa" }}>
                            <td style={{ padding:"8px 12px", fontSize:12, color:"#94a3b8", fontWeight:600 }}>{i+1}</td>
                            <td style={{ padding:"8px 12px", fontSize:13 }}>{a.prenom_apprenant||a.prenom||"-"}</td>
                            <td style={{ padding:"8px 12px", fontSize:13, fontWeight:600 }}>{a.nom_apprenant||a.nom||"-"}</td>
                            <td style={{ padding:"8px 12px", fontSize:12, color:"#64748b" }}>{a.email_apprenant||a.email||"-"}</td>
                            <td style={{ padding:"8px 12px", fontSize:12, color:"#64748b" }}>{a.telephone||"-"}</td>
                            <td style={{ padding:"8px 12px", fontSize:13, color:"#16a34a", fontWeight:600 }}>{a.nb_presences??a.presences??'-'}</td>
                            <td style={{ padding:"8px 12px", fontSize:13, fontWeight:600, color:(a.nb_absences||a.absences||0)>3?"#dc2626":"#374151" }}>
                              {a.nb_absences??a.absences??'-'}{(a.nb_absences||a.absences||0)>3&&<span style={{ marginLeft:4, fontSize:10 }}>⚠️</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {classeModalTab === "disponibilite" && (
              <PlanningClasse
                horaire={classeDetail.horaire}
                sessions={classeSessions}
                loading={classeSessionsLoading}
                accent={BET_COLOR}
              />
            )}
          </Modal>
        )}
      </div>
    );
  };

  /* ── MES MISSIONS (deputy only) ── */
  const renderMissions = () => (
    <div>
      <div style={{ marginBottom:16 }}>
        <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:"#0f172a" }}>🎯 Mes missions</h2>
        <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Missions assignées par votre Superviseur Général</p>
      </div>

      {deputyKpi.missions_total === 0 ? (
        <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🎯</div>
          <div style={{ fontWeight:600 }}>Aucune mission pour le moment</div>
          <div style={{ fontSize:13, marginTop:6 }}>Vous recevrez une notification dès qu'une mission vous est assignée par votre Superviseur Général.</div>
          <div style={{ marginTop:20, padding:"12px 16px", background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", maxWidth:320, margin:"20px auto 0" }}>
            <div style={{ fontSize:12, color:"#64748b", marginBottom:8 }}>Une question ? Contactez la supervision via la messagerie.</div>
            <button onClick={()=>setActiveTab("messagerie")} style={{ padding:"6px 14px", background:BET_COLOR, border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              💬 Ouvrir la messagerie
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {missions.map(m => (
            <div key={m.id} style={{ background:"#f8fafc", borderRadius:12, padding:16, border:"1px solid #e5e7eb" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontWeight:700, fontSize:14 }}>{m.titre}</div>
                {statutBadge(m.statut)}
              </div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:6 }}>
                Type : <strong>{m.type_mission?.replace(/_/g," ")}</strong>
                {m.centre && <span> - 🏢 {m.centre}</span>}
                {m.date_debut && <span> - 📅 {fmtDate(m.date_debut)}{m.date_fin ? ` → ${fmtDate(m.date_fin)}` : ""}</span>}
              </div>
              {m.description && <p style={{ fontSize:12, color:"#374151", margin:0, lineHeight:1.6 }}>{m.description}</p>}
              {m.statut === "assignée" && (
                <button disabled={!peut("rapports","manage")} title={permBtnTitle("Soumettre un rapport d'observation",peut("rapports","manage"))} onClick={()=>{ setShowRapportForm(true); }} style={permBtnStyle({ marginTop:10, padding:"6px 14px", background:BET_COLOR, border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" },peut("rapports","manage"))}>
                  {peut("rapports","manage")?"📋":"🔒"} Soumettre un rapport d'observation
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* ── MESSAGERIE (deputy → General Supervisor) ── */
  const renderMessagerie = () => {
    const token = localStorage.getItem("admin_token");
    // La distinction IS_GENERAL a été retirée : les deux branches renvoyaient exactement le
    // même composant. Superviseur et deputy ont les mêmes besoins ici.
    return (
      <div>
        {/* Deux canaux distincts : la messagerie privée parle à une personne, le chat de
            classe parle à TOUS ses apprenants. */}
        <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e7eb", marginBottom:18 }}>
          {[{ key:"prive", label:"💬 Messagerie privée", badge:0 },
            { key:"groupe", label:"👥 Chat de classe", badge: chatGroupeNonLus },
            // Les groupes LIBRES - ceux qui ne suivent pas une classe. Onglet distinct et
            // non fondu dans le précédent : écrire à une classe atteint des apprenants,
            // écrire à un groupe libre n'atteint que du personnel. Les confondre ferait
            // partir un message interne devant des familles.
            { key:"libre", label:"💬 Groupes", badge: groupesLibresNonLus }].map(t => (
            <button key={t.key} onClick={() => setMsgSubTab(t.key)}
              style={{ padding:"10px 20px", border:"none", borderBottom: msgSubTab===t.key ? `2px solid ${BET_COLOR}` : "2px solid transparent", marginBottom:-1, fontSize:13, fontWeight:600, cursor:"pointer", background:"transparent", color: msgSubTab===t.key ? BET_COLOR : "#64748b" }}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ marginLeft:7, display:"inline-block", minWidth:18, padding:"1px 6px", borderRadius:99, background:"#dc2626", color:"#fff", fontSize:10.5, fontWeight:800, lineHeight:"16px", textAlign:"center" }}>
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        {msgSubTab === "prive" ? (
          <MessagerieTab accentColor={BET_COLOR} profil={profil} token={token} />
        ) : msgSubTab === "libre" ? (
          <GroupesLibres profil={profil} token={token} accent={BET_COLOR} accentClair={BET_LIGHT} />
        ) : (
          <ChatGroupe
            groupes={classes}
            profil={profil}
            token={token}
            accent={BET_COLOR}
            accentClair={BET_LIGHT}
          />
        )}
      </div>
    );
  };

  /* ────────────────────────────────────────────────────────
     RENDU PRINCIPAL - même structure que AdminDashboard
  ──────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#fafafa" }}>

      {/* HERO HEADER */}
      <div style={{ flexShrink:0, background:BET_GRADIENT, padding:"28px 32px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.04)", zIndex:0 }} />
        <div style={{ position:"absolute", bottom:-60, right:80, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.03)", zIndex:0 }} />

        <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:22, color:"#fff", border:"3px solid rgba(255,255,255,0.3)" }}>{initiales}</div>
            <div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", fontWeight:600, letterSpacing:"0.08em" }}>Bonjour 👋</div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff" }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} /></h1>
              {surnomPerso.trim() && nomComplet !== nomAffiche && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:1 }}>{nomComplet}</div>
              )}
              <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                onEnregistre={(v) => setSurnomPerso(v || "")} />
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginTop:3 }}>
                {IS_GENERAL ? "Superviseur Général - Contrôle pédagogique & administratif des coachs" : "Deputy Superviseur - Observations terrain"}
              </div>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <NotificationBell userId={profil?.id} />
            <button onClick={toggleLang} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              {lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}
            </button>
            <DashboardColorPicker />
            {accesElearning && (
              <button type="button"
                onClick={() => openElearningSSO(ELEARNING_URL)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", background:"rgba(8,145,178,0.25)", border:"1.5px solid rgba(8,145,178,0.5)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(8,145,178,0.45)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(8,145,178,0.25)"}
                title="Accéder à la plateforme E-Learning BET">
                <span style={{ fontSize:15 }}>🎓</span> E-Learning
              </button>
            )}
            <button onClick={handleLogout} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              <span>🚪</span> Déconnexion
            </button>
          </div>
        </div>

        {/* Mini-stats sous le header - différenciées selon le rôle */}
        <div style={{ display:"flex", gap:0, background:"rgba(0,0,0,0.15)", borderRadius:"12px 12px 0 0", overflow:"hidden" }}>
          {(IS_GENERAL ? [
            { l:"Coachs actifs",      v: kpi?.nb_coachs            ?? "…", c:"#7dd3fc" },
            { l:"Rapports non lus",   v: kpi?.nb_rapports_non_lus  ?? "…", c:"#fcd34d" },
            { l:"Anomalies ouvertes", v: kpi?.nb_anomalies_ouvertes ?? "…", c:"#f87171" },
            { l:"Deputies actifs",    v: kpi?.nb_deputies          ?? "…", c:"#6ee7b7" },
          ] : [
            { l:"Rapports soumis",      v: deputyKpi.rapports_soumis    ?? "…", c:"#7dd3fc" },
            { l:"Missions actives",     v: deputyKpi.missions_actives   ?? "…", c:"#fcd34d" },
            { l:"Dernière observation", v: deputyKpi.derniere_observation ? fmtDate(deputyKpi.derniere_observation) : "-", c:"#6ee7b7" },
            { l:"Rapports transmis au PA", v: deputyKpi.rapports_transmis ?? "…", c:"#c4b5fd" },
          ]).map((s,i,arr)=>(
            <div key={s.l} style={{ flex:1, textAlign:"center", padding:"14px 8px", borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.08)":"none" }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:3 }}>{s.l}</div>
              <div style={{ fontSize:20, fontWeight:800, color:s.c, lineHeight:1.2 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:"1 1 auto", padding:"0 24px 24px" }}>
        {/* ONGLETS */}
        <div style={{ display:"flex", gap:3, marginBottom:0, flexWrap:"wrap", paddingTop:20 }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{
                padding:"10px 16px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer", fontWeight:600, fontSize:13,
                background: isActive ? "#fff" : BET_LIGHT, color: isActive ? BET_COLOR : "#374151",
                boxShadow: isActive ? "0 -2px 8px rgba(0,0,0,0.08)" : "none",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                flex:"1 1 130px", whiteSpace:"nowrap",
              }}>
                <span style={{ fontSize:14 }}>{tab.icon}</span>
                {tab.label}
                {tab.key === "taches" && tachesTotal > 0 && (
                  <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:"#fee2e2", color:"#dc2626" }}>{tachesTotal}</span>
                )}
                {tab.key === "rapports" && (kpi?.nb_rapports_non_lus||0) > 0 && (
                  <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:"#fee2e2", color:"#dc2626" }}>{kpi.nb_rapports_non_lus}</span>
                )}
                {tab.key === "anomalies" && (kpi?.nb_anomalies_ouvertes||0) > 0 && (
                  <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:"#fee2e2", color:"#dc2626" }}>{kpi.nb_anomalies_ouvertes}</span>
                )}
                {tab.key === "messagerie" && (msgNonLusSup + chatGroupeNonLus) > 0 && (
                  <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:"#fee2e2", color:"#dc2626" }}>{msgNonLusSup + chatGroupeNonLus}</span>
                )}
                {/* Le direct appelle une action immédiate - observer le cours pendant qu'il
                    se donne. Les séances sans lien ou non effectuées ne sont pas du ressort
                    de ces rôles : les compter ici rendrait le chiffre illisible. */}
                {/* Le direct prime sur le décompte : quand un cours a lieu maintenant, c'est
                    lui qu'il faut voir, pas le nombre de séances de la semaine. En dehors de
                    ce moment, le badge annonce les séances programmées à venir - la charge
                    d'observation qui attend. */}
                {tab.key === "plannings" && coursEnDirect > 0 && (
                  <span title="Cours en direct en ce moment"
                    style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:800, background:"#fee2e2", color:"#b91c1c" }}>🔴 {coursEnDirect}</span>
                )}
                {tab.key === "plannings" && coursEnDirect === 0 && seancesAVenir > 0 && (
                  <span title={`${seancesAVenir} séance${seancesAVenir>1?"s":""} programmée${seancesAVenir>1?"s":""} à venir`}
                    style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:BET_LIGHT, color:BET_COLOR }}>{seancesAVenir}</span>
                )}
                {tab.key === "missions" && (deputyKpi?.missions_actives||0) > 0 && (
                  <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:"#fee2e2", color:"#dc2626" }}>{deputyKpi.missions_actives}</span>
                )}
                {tab.key === "notifications" && notifNonLuesSup > 0 && (
                  <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:"#fee2e2", color:"#dc2626" }}>{notifNonLuesSup}</span>
                )}
              </button>
            );
          })}
        </div>

        {!banderoleFermeeSup && notifsBanderoleSup.length > 0 && (
          <div style={{ padding:"10px 20px", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:8, marginTop:10, display:"flex", alignItems:"flex-start", gap:10 }}>
            <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
              {notifsBanderoleSup.map(n => (
                <div key={n.id} onClick={() => { marquerNotifLueSup(n.id); setActiveTab("notifications"); }}
                  style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                  <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                  <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                </div>
              ))}
              {notifNonLuesSup > notifsBanderoleSup.length && (
                <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                  +{notifNonLuesSup - notifsBanderoleSup.length} autre{notifNonLuesSup - notifsBanderoleSup.length > 1 ? "s" : ""} →
                </button>
              )}
            </div>
            <button onClick={()=>setBanderoleFermeeSup(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
          </div>
        )}

        {/* CARTE PRINCIPALE */}
        <div style={{ background:"#fff", padding:24, borderRadius:"0 12px 12px 12px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
          {activeTab === "taches"         && renderTaches()}
          {activeTab === "dashboard"      && renderDashboard()}
          {activeTab === "plannings"      && renderPlannings()}
          {activeTab === "cahiers"        && renderCahiers()}
          {activeTab === "classement"     && renderClassement()}
          {activeTab === "eval-apprenants" && (
            <EvaluationsApprenants apiUrl={API_URL} authHeaders={authHdrs} accent={BET_COLOR} accentLight={BET_LIGHT} />
          )}
          {activeTab === "eval-parents" && (
            <EvaluationsParents apiUrl={API_URL} authHeaders={authHdrs}
              accent={BET_COLOR} accentLight={BET_LIGHT} accentGradient={BET_GRADIENT} />
          )}
          {activeTab === "rapports"       && renderRapports()}
          {activeTab === "anomalies"      && renderAnomalies()}
          {activeTab === "deputies"       && renderDeputies()}
          {activeTab === "missions"       && renderMissions()}
          {activeTab === "observer-cours" && renderObserverCours()}
          {activeTab === "messagerie"     && renderMessagerie()}
          {/* `userId` et non `profil` : le composant attend un identifiant, pas un objet.
              Passer la mauvaise prop laissait `useNotifications(undefined)` sans rien charger,
              d'où un onglet vide pendant que le bandeau et le badge, eux, affichaient bien
              les notifications. React ne signale pas une prop inconnue. */}
          {activeTab === "notifications"  && <NotificationsTab userId={profil?.id} accentColor={BET_COLOR} />}
        </div>

      {/* ════ MODAL DÉTAIL GROUPE / APPRENANTS ════ */}
      {selectedGroupe && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1100 }}
          onClick={e=>{ if(e.target===e.currentTarget){ setSelectedGroupe(null); setGroupeDetail({ apprenants:[], fichiers:[] }); setGroupeSeances([]); setGroupePresences([]); }}}>
          <div style={{ background:"#fff", borderRadius:16, width:"85vw", height:"85vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

            {/* Header */}
            <div style={{ background:BET_GRADIENT, padding:"20px 24px", borderRadius:"16px 16px 0 0", flexShrink:0, position:"relative" }}>
              <button onClick={()=>{ setSelectedGroupe(null); setGroupeDetail({ apprenants:[], fichiers:[] }); setGroupeSeances([]); setGroupePresences([]); }}
                style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:"50%", width:30, height:30, cursor:"pointer", color:"#fff", fontSize:16 }}>✕</button>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", fontWeight:600, marginBottom:4 }}>👥 Groupe de cours</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:6 }}>{selectedGroupe.nom || "-"}</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", fontSize:12, color:"rgba(255,255,255,0.75)", alignItems:"center" }}>
                {selectedGroupe.niveau && <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:6, padding:"2px 10px", fontWeight:700, color:"#fff" }}>Niveau {selectedGroupe.niveau}</span>}
                {selectedGroupe.statut && <span style={{ background:"rgba(255,255,255,0.12)", borderRadius:6, padding:"2px 10px" }}>{selectedGroupe.statut}</span>}
                {selectedGroupe.nb_apprenants !== undefined && <span>👤 {selectedGroupe.nb_apprenants} apprenant{selectedGroupe.nb_apprenants!==1?"s":""}</span>}
                {selectedGroupe.filiere && <span>📂 {selectedGroupe.filiere}</span>}
                {selectedGroupe.type_cours && <span>{selectedGroupe.type_cours==="en_ligne"?"💻 En ligne":selectedGroupe.type_cours==="domicile"?"🏠 Domicile":"🏢 Présentiel"}</span>}
              </div>
            </div>

            {/* Sous-onglets */}
            <div style={{ display:"flex", borderBottom:"2px solid #e5e7eb", background:"#fafafa", flexShrink:0, overflowX:"auto" }}>
              {[
                { id:"infos",      label:"📋 Infos classe" },
                { id:"apprenants", label:`🎓 Apprenants${groupeDetail.apprenants.length ? ` (${groupeDetail.apprenants.length})` : ""}` },
                { id:"planning",   label:`📅 Planning & séances${groupeSeances.length ? ` (${groupeSeances.length})` : ""}` },
                { id:"presences",  label:`📊 Présences${groupePresences.length ? ` (${groupePresences.length})` : ""}` },
                { id:"fichiers",   label:`📂 Fichiers${groupeDetail.fichiers.length ? ` (${groupeDetail.fichiers.length})` : ""}` },
              ].map(t => (
                <button key={t.id} onClick={()=>setGroupeSubTab(t.id)}
                  style={{ padding:"12px 20px", border:"none", borderBottom:`3px solid ${groupeSubTab===t.id?BET_COLOR:"transparent"}`,
                    background:"transparent", cursor:"pointer", fontSize:13,
                    fontWeight:groupeSubTab===t.id?800:500, color:groupeSubTab===t.id?BET_COLOR:"#64748b", whiteSpace:"nowrap" }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Contenu */}
            <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

              {/* ─ Infos ─ Trois blocs plutôt qu'une grille unique : la classe, le coach et
                   le lieu répondent à trois questions différentes, et le superviseur qui
                   prépare une observation cherche l'une des trois, pas les vingt champs. */}
              {groupeSubTab === "infos" && (() => {
                const Bloc = ({ titre, lignes }) => {
                  const remplies = lignes.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== "-");
                  if (!remplies.length) return null;
                  return (
                    <div style={{ background:"#f8fafc", borderRadius:12, border:"1px solid #e2e8f0", padding:"14px 18px", marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#64748b", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>{titre}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"9px 20px", fontSize:13 }}>
                        {remplies.map(([l,v])=>(
                          <div key={l}><span style={{ color:"#9ca3af", fontWeight:600 }}>{l} : </span><strong style={{ color:"#0f172a" }}>{v}</strong></div>
                        ))}
                      </div>
                    </div>
                  );
                };
                const g = selectedGroupe;
                const creneaux = Array.isArray(g.horaire) ? g.horaire : [];
                return (
                  <div>
                    <Bloc titre="La classe" lignes={[
                      ["Nom",        g.nom||"-"],
                      ["Code",       g.code||"-"],
                      ["Niveau",     g.niveau||"-"],
                      ["Filière",    g.filiere||"-"],
                      ["Type",       g.type_cours==="en_ligne"?"💻 En ligne":g.type_cours==="domicile"?"🏠 Domicile":"🏢 Présentiel"],
                      ["Effectif",   `${g.nb_apprenants ?? groupeDetail.apprenants.length ?? 0} / ${g.capacite_max||20}`],
                      ["Statut",     g.statut||"-"],
                      ["Début",      g.date_debut ? fmtDate(g.date_debut) : "-"],
                      ["Fin",        g.date_fin   ? fmtDate(g.date_fin)   : "-"],
                      ["Coaching privé", estClassePrivee(g) ? "Oui" : "-"],
                    ]} />

                    <Bloc titre="Le coach" lignes={[
                      ["Nom",       g.coach_nom||"-"],
                      ["Email",     g.coach_email||"-"],
                      ["Téléphone", g.coach_telephone||"-"],
                      ["Grade",     g.coach_grade||"-"],
                    ]} />

                    <Bloc titre="Le lieu" lignes={[
                      ["Centre",  g.centre_nom||"-"],
                      ["Ville",   g.centre_ville||"-"],
                      ["Adresse", g.centre_adresse||"-"],
                    ]} />

                    {/* L'emploi du temps EST une info de classe - c'est ce que BET demande de
                        voir « à l'avance ». Le détail séance par séance vit dans l'onglet Planning. */}
                    <div style={{ background:"#f8fafc", borderRadius:12, border:"1px solid #e2e8f0", padding:"14px 18px" }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#64748b", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>Horaires hebdomadaires</div>
                      {creneaux.length === 0 ? (
                        <div style={{ fontSize:12, color:"#94a3b8" }}>Aucun créneau récurrent renseigné pour cette classe.</div>
                      ) : (
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {creneaux.map((h,i) => (
                            <span key={i} style={{ background:BET_LIGHT, border:`1px solid ${BET_COLOR}30`, borderRadius:99, padding:"4px 12px", fontSize:12, fontWeight:700, color:BET_COLOR }}>
                              {h.jour} · {h.debut} – {h.fin}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ─ Planning & séances ─ même composant que l'onglet Plannings du dashboard. */}
              {groupeSubTab === "planning" && (
                <PlanningClasse
                  horaire={selectedGroupe.horaire}
                  sessions={groupeSeances}
                  loading={groupeSeancesLoading}
                  accent={BET_COLOR}
                />
              )}

              {/* ─ Présences ─ La feuille d'appel telle que le coach l'a remplie, séance par
                   séance. C'est la pièce que le superviseur vient vérifier dans un cahier. */}
              {groupeSubTab === "presences" && (
                groupePresencesLoading ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8" }}>Chargement des présences…</div>
                ) : groupePresences.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"50px 0", color:"#9ca3af" }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>📊</div>
                    <div style={{ fontWeight:600 }}>Aucune feuille de présence</div>
                    <div style={{ fontSize:12, marginTop:4 }}>Le coach n'a encore pointé aucune séance pour cette classe.</div>
                  </div>
                ) : (() => {
                  const LIB = { present:{ l:"Présent", c:"#15803d", bg:"#dcfce7" }, retard:{ l:"Retard", c:"#b45309", bg:"#fef3c7" },
                                excuse:{ l:"Excusé", c:"#1d4ed8", bg:"#dbeafe" },  absent:{ l:"Absent", c:"#b91c1c", bg:"#fee2e2" } };
                  const parDate = {};
                  groupePresences.forEach(p => { (parDate[p.date_seance] ||= []).push(p); });
                  // On pagine des FEUILLES D'APPEL, pas des lignes : couper au milieu d'une
                  // séance donnerait un taux de présence calculé sur une demi-classe.
                  const toutesDates = Object.keys(parDate).sort().reverse();
                  const datesFiltrees = toutesDates.filter(d => dansLaPeriode(d, presDu, presAu));
                  const pg = paginer(datesFiltrees, presPage, 10);
                  return (
                    <div>
                      <FiltrePeriode du={presDu} au={presAu}
                        onChange={(d,a)=>{ setPresDu(d); setPresAu(a); setPresPage(1); }}
                        accent={BET_COLOR} total={toutesDates.length} affiches={datesFiltrees.length} labelItem="feuille" />

                      {datesFiltrees.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"30px 20px", background:"#fff7ed", borderRadius:10, border:"1px dashed #fed7aa", fontSize:12.5, color:"#9a3412" }}>
                          <div style={{ fontSize:30, marginBottom:8 }}>📊</div>
                          Aucune feuille de présence sur cette période. Les {toutesDates.length} feuilles de la classe sont en dehors des dates choisies.
                        </div>
                      ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {pg.items.map(d => {
                        const liste = parDate[d];
                        const presents = liste.filter(p => p.statut === "present" || p.statut === "retard").length;
                        const taux = Math.round(presents / liste.length * 100);
                        const c = taux>=80?"#15803d":taux>=60?"#b45309":"#b91c1c";
                        const bg = taux>=80?"#dcfce7":taux>=60?"#fef3c7":"#fee2e2";
                        return (
                          <div key={d} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:11, padding:"12px 16px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:10 }}>
                              <span style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>{fmtDate(d)}</span>
                              <span style={{ background:bg, color:c, borderRadius:99, padding:"2px 10px", fontSize:11, fontWeight:800 }}>{taux}% · {presents}/{liste.length}</span>
                            </div>
                            <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                              {liste.map((p, i) => {
                                const s = LIB[p.statut] || { l:p.statut||"-", c:"#475569", bg:"#f1f5f9" };
                                return (
                                  <span key={p.id||i} title={p.note || undefined}
                                    style={{ background:s.bg, color:s.c, border:`1px solid ${s.c}25`, borderRadius:8, padding:"4px 10px", fontSize:11.5, fontWeight:600 }}>
                                    {[p.prenom_apprenant, p.nom_apprenant].filter(Boolean).join(" ") || "-"}
                                    <span style={{ opacity:.75, fontWeight:800 }}> · {s.l}</span>
                                    {p.note ? <span style={{ opacity:.6 }}> 📝</span> : null}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                      )}
                      <BarrePagination page={pg.page} totalPages={pg.totalPages} onPage={setPresPage} accent={BET_COLOR} />
                    </div>
                  );
                })()
              )}

              {/* ─ Fichiers ─ Déjà chargés par /api/groupes/:id depuis toujours, et affichés
                   nulle part : le fetch existait, l'écran ne les montrait pas. */}
              {groupeSubTab === "fichiers" && (
                groupeDetailLoading ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8" }}>Chargement…</div>
                ) : groupeDetail.fichiers.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"50px 0", color:"#9ca3af" }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>📂</div>
                    <div style={{ fontWeight:600 }}>Aucun fichier partagé</div>
                    <div style={{ fontSize:12, marginTop:4 }}>Rien n'a été déposé dans cette classe.</div>
                  </div>
                ) : (() => {
                  const filtres = groupeDetail.fichiers.filter(f => dansLaPeriode(f.created_at, fichDu, fichAu));
                  const pg = paginer(filtres, fichPage, 10);
                  return (
                  <div>
                    <FiltrePeriode du={fichDu} au={fichAu}
                      onChange={(d,a)=>{ setFichDu(d); setFichAu(a); setFichPage(1); }}
                      accent={BET_COLOR} total={groupeDetail.fichiers.length} affiches={filtres.length} labelItem="fichier" />

                    {filtres.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"30px 20px", background:"#fff7ed", borderRadius:10, border:"1px dashed #fed7aa", fontSize:12.5, color:"#9a3412" }}>
                        <div style={{ fontSize:30, marginBottom:8 }}>📂</div>
                        Aucun fichier déposé sur cette période. Les {groupeDetail.fichiers.length} fichiers de la classe sont en dehors des dates choisies.
                      </div>
                    ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {pg.items.map((f, i) => (
                      <div key={f.id||i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, flexWrap:"wrap" }}>
                        <span style={{ fontSize:18 }}>📄</span>
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", wordBreak:"break-word" }}>{f.nom || "Fichier"}</div>
                          <div style={{ fontSize:11, color:"#94a3b8" }}>
                            {[f.created_at ? fmtDate(f.created_at) : null,
                              f.type_fichier && f.type_fichier !== "autre" ? f.type_fichier : null,
                              f.taille_ko ? `${Math.round(f.taille_ko)} Ko` : null,
                              f.visible === false ? "🔒 masqué aux apprenants" : null,
                            ].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {/* JAMAIS l'URL Cloudinary en direct : le compte refuse la livraison
                            publique des PDF et des ZIP (401 Unauthorized), et c'est ce que
                            voyaient superviseurs et deputies en cliquant. Le relais du backend
                            signe la requête. Voir utils/urlDocument.js. */}
                        {f.url && (
                          <div style={{ display:"flex", gap:10, whiteSpace:"nowrap" }}>
                            <a href={urlDocument(f.url, { nom: f.nom, inline: true })} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize:11.5, fontWeight:700, color:"#1d4ed8", textDecoration:"none" }}>Ouvrir ↗</a>
                            <a href={urlDocument(f.url, { nom: f.nom })}
                              style={{ fontSize:11.5, fontWeight:700, color:"#64748b", textDecoration:"none" }}>Télécharger ⬇</a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                    )}
                    <BarrePagination page={pg.page} totalPages={pg.totalPages} onPage={setFichPage} accent={BET_COLOR} />
                  </div>
                  );
                })()
              )}

              {/* ─ Apprenants ─ */}
              {groupeSubTab === "apprenants" && (
                groupeDetailLoading ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8" }}>Chargement des apprenants…</div>
                ) : groupeDetail.apprenants.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"50px 0", color:"#9ca3af" }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>🎓</div>
                    <div style={{ fontWeight:600 }}>Aucun apprenant inscrit dans ce groupe</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom:12, fontSize:12, color:"#64748b", fontWeight:600 }}>
                      {groupeDetail.apprenants.length} apprenant{groupeDetail.apprenants.length!==1?"s":""} inscrit{groupeDetail.apprenants.length!==1?"s":""}
                      {(() => {
                        // Taux de la classe : total des présences sur total des pointages, et
                        // NON la moyenne des taux individuels - un apprenant pointé une fois
                        // pèserait alors autant qu'un autre pointé dix fois.
                        const p = groupeDetail.apprenants.reduce((a,x)=>a+(x.presences||0),0);
                        const t = groupeDetail.apprenants.reduce((a,x)=>a+(x.seances_pointees||0),0);
                        if (!t) return <span style={{ marginLeft:10, fontSize:12, color:"#94a3b8", fontWeight:400 }}>· aucune présence pointée</span>;
                        const taux = Math.round(p/t*100);
                        const c = taux>=80?"#15803d":taux>=60?"#b45309":"#b91c1c";
                        const bg = taux>=80?"#dcfce7":taux>=60?"#fef3c7":"#fee2e2";
                        return (
                          <span style={{ marginLeft:10, padding:"3px 11px", borderRadius:999, background:bg, color:c, fontSize:12, fontWeight:800 }}>
                            📊 Assiduité de la classe : {taux}% <span style={{ fontWeight:600, opacity:.8 }}>({p}/{t} pointages)</span>
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                        <thead>
                          <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                            {["#","Prénom","Nom","Email","Téléphone","Présences","Absences","Taux","Statut"].map(h=>(
                              <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {groupeDetail.apprenants.map((a, idx) => {
                            const rowBg = idx%2===0?"#fff":"#fafafa";
                            const absences = a.absences ?? a.nb_absences ?? 0;
                            return (
                              <tr key={a.id||idx} style={{ borderBottom:"1px solid #f1f5f9", background:rowBg }}
                                onMouseEnter={e=>e.currentTarget.style.background=BET_LIGHT}
                                onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                                <td style={{ padding:"10px 14px", color:"#9ca3af", fontWeight:600 }}>{idx+1}</td>
                                <td style={{ padding:"10px 14px" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                    <div style={{ width:30, height:30, borderRadius:"50%", background:BET_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:BET_COLOR, flexShrink:0 }}>
                                      {/* `groupes_apprenants` porte nom_apprenant / prenom_apprenant /
                                          email_apprenant. Cet écran lisait nom / prenom / email, qui
                                          n'existent pas : le tableau s'affichait entièrement vide,
                                          « - » sur chaque colonne. Les autres tableaux de bord lisent
                                          déjà les bons champs. */}
                                      {((a.prenom_apprenant||a.prenom||"?")[0]||"?").toUpperCase()}
                                    </div>
                                    <span style={{ fontWeight:600 }}>{a.prenom_apprenant||a.prenom||"-"}</span>
                                  </div>
                                </td>
                                <td style={{ padding:"10px 14px", fontWeight:700 }}>{a.nom_apprenant||a.nom||"-"}</td>
                                <td style={{ padding:"10px 14px", fontSize:12, color:"#64748b" }}>{a.email_apprenant||a.email||"-"}</td>
                                <td style={{ padding:"10px 14px", fontSize:12, color:"#64748b" }}>{a.telephone||a.phone||"-"}</td>
                                <td style={{ padding:"10px 14px", textAlign:"center", fontWeight:700, color:"#16a34a", fontSize:14 }}>{a.presences??a.nb_presences??"-"}</td>
                                <td style={{ padding:"10px 14px", textAlign:"center", fontWeight:700, color:absences>3?"#dc2626":"#374151", fontSize:14 }}>
                                  {absences}
                                  {absences>3 && <span style={{ marginLeft:4, fontSize:11 }}>⚠️</span>}
                                </td>
                                <td style={{ padding:"10px 14px", textAlign:"center" }}>
                                  {/* `null` quand rien n'a été pointé : afficher 0 % laisserait
                                      croire que l'apprenant n'est jamais venu. */}
                                  {a.taux_presence == null ? (
                                    <span style={{ fontSize:11.5, color:"#cbd5e1" }} title="Aucune séance pointée">-</span>
                                  ) : (() => {
                                    const t = a.taux_presence;
                                    const c = t>=80?"#15803d":t>=60?"#b45309":"#b91c1c";
                                    const bg = t>=80?"#dcfce7":t>=60?"#fef3c7":"#fee2e2";
                                    return (
                                      <span title={`${a.presences||0} présence(s) sur ${a.seances_pointees||0} séance(s) pointée(s)${a.retards ? ` · dont ${a.retards} retard(s)` : ""}`}
                                        style={{ display:"inline-block", minWidth:44, padding:"2px 9px", borderRadius:999, background:bg, color:c, fontSize:12, fontWeight:800 }}>
                                        {t}%
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td style={{ padding:"10px 14px" }}>
                                  <span style={{ padding:"3px 10px", borderRadius:99, fontSize:10, fontWeight:700,
                                    background:a.statut==="actif"?"#dcfce7":a.statut==="suspendu"?"#fee2e2":"#f3f4f6",
                                    color:a.statut==="actif"?"#16a34a":a.statut==="suspendu"?"#dc2626":"#6b7280" }}>
                                    {a.statut||"-"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}

            </div>
          </div>
        </div>
      )}
      {/* Modaux au niveau du rendu, et non dans renderCahiers : ils y etaient
          enfermes, donc invisibles depuis tout autre onglet. Un clic dans le
          Classement posait bien l'etat, mais rien ne s'affichait. */}

      {/* Contenu e-learning en lecture integrale. Au-dessus du modal coach (z-index
          plus eleve), dont il est ouvert. */}
      {contenuOuvert && (
        <ContenuElearningDetail
          contenu={contenuOuvert}
          coachNom={coachDetail ? `${coachDetail.prenom || ""} ${coachDetail.nom || ""}`.trim() : ""}
          accent={BET_COLOR}
          onClose={()=>setContenuOuvert(null)}
        />
      )}

      {/* Détail d'une séance ouverte depuis l'onglet Séances du Cahier coachs. Vue partagée
          avec l'onglet Honoraires du PA - c'est la même séance, et la dupliquer garantirait
          qu'une des deux copies cesse d'afficher ce que l'autre affiche. */}
      {supSeanceDetail && (
        <SeanceDetailModal
          seance={supSeanceDetail}
          onClose={()=>setSupSeanceDetail(null)}
          apiUrl={API_URL}
          authHeaders={authHdrs}
          afficherHonoraire={false}
        />
      )}

      {coachDetail && (() => {
        const coach = coachDetail;
        const initiales = `${(coach.prenom||"")[0]||""}${(coach.nom||"")[0]||""}`.toUpperCase();
        const photoUrl  = coach.avatar_url || null;
        const centre    = coach.scope?.join(", ") || coach.departement || "-";

        const COACH_TABS = [
          { id:"infos",         label:"Infos",                                                                           icon:"👤" },
          { id:"evaluations",   label:`Observations${coachRapports.length > 0 ? ` (${coachRapports.length})` : ""}`, icon:"📋" },
          { id:"classes",       label:`Classes (${coachGroupes.length})`,                                                icon:"🏫" },
          { id:"seances",       label:"Séances",                                                                         icon:"📆" },
          { id:"disponibilite", label:`Disponibilités${coachDispos.length > 0 ? ` (${coachDispos.length})` : ""}`,      icon:"📅" },
          { id:"modules",       label:`Modules e-learning${coachCours.length > 0 ? ` (${coachCours.length})` : ""}`,    icon:"🧩" },
          // Les FICHIERS, là où l'onglet précédent montre les MODULES. Un coach peut avoir
          // publié trois modules contenant douze documents : la liste des modules ne le dit
          // pas, et rien ne montrait ce qu'il dépose dans la conversation de ses classes.
          { id:"ressources",    label:"Ressources partagées",                                                            icon:"📂" },
          // Qui ce coach a formé cette année, et qui est parti - avec le motif saisi par
          // l'assistante. Rien ne permettait de retracer une année de classes.
          { id:"archive",       label:"Archive apprenants",                                                              icon:"📒" },
        ];

        const CRIT = {
          ponctualite:            { label:"Ponctualité",            icon:"⏰" },
          qualite_pedagogique:    { label:"Qualité pédagogique",    icon:"📚" },
          satisfaction_apprenants:{ label:"Satisfaction apprenants",icon:"😊" },
          communication:          { label:"Communication",          icon:"💬" },
        };
        // Les observations retenues par le filtre de dates. Bornes INCLUSES des deux côtés :
        // « du 1er au 31 » doit contenir le 31, ce qu'une comparaison stricte exclurait.
        const obsFiltrees = coachRapports.filter(r => {
          const d = r.date_observation || "";
          if (coachObsDu && d < coachObsDu) return false;
          if (coachObsAu && d > coachObsAu) return false;
          return true;
        });

        const nc  = NOTE_COULEUR;
        const nbg = NOTE_FOND_CAT;

        const JOURS_ORDER = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
        const byJour = {};
        coachDispos.forEach(d => {
          if (!d.jour) return;
          if (!byJour[d.jour]) byJour[d.jour] = [];
          byJour[d.jour].push(`${d.debut}–${d.fin}`);
        });
        const joursAvecDispo = JOURS_ORDER.filter(j => (byJour[j]||[]).length > 0);

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}
            onClick={e => { if (e.target === e.currentTarget) setCoachDetail(null); }}>
            <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

              {/* HEADER */}
              <div style={{ background:BET_GRADIENT, padding:"20px 24px", flexShrink:0, position:"relative" }}>
                <button onClick={()=>setCoachDetail(null)} style={{ position:"absolute", top:14, right:16, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:"50%", width:32, height:32, cursor:"pointer", color:"#fff", fontSize:18, lineHeight:1 }}>✕</button>
                <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                  {/* Photo + note globale */}
                  <div style={{ position:"relative", flexShrink:0 }}>
                    {photoUrl
                      ? <img src={photoUrl} alt={coach.prenom} style={{ width:64, height:64, borderRadius:"50%", objectFit:"cover", border:"3px solid rgba(255,255,255,0.4)" }} />
                      : <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,255,255,0.2)", color:"#fff", fontWeight:800, fontSize:22, display:"flex", alignItems:"center", justifyContent:"center" }}>{initiales}</div>
                    }
                    {coach.note_moyenne && (
                      <div title="Note moyenne (évaluations CP)" style={{ position:"absolute", bottom:-4, right:-8, background: NOTE_COULEUR(coach.note_moyenne), color:"#fff", borderRadius:20, padding:"2px 7px", fontSize:11, fontWeight:900, border:"2px solid #fff", whiteSpace:"nowrap", lineHeight:1.4 }}>
                        ⭐ {Number(coach.note_moyenne).toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", fontWeight:600, marginBottom:2 }}>👨‍🏫 Formateur BET</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <NomAvecSurnom prenom={coach.prenom} nom={coach.nom} surnom={coach.surnom}
                        style={{ fontSize:20, fontWeight:800, color:"#fff" }} styleSurnom={{ color:"#bae6fd" }} />
                      {coach.acces_bloque && <span style={{ fontSize:10, fontWeight:800, background:"#dc2626", color:"#fff", borderRadius:99, padding:"2px 10px" }}>🔒 SUSPENDU</span>}
                    </div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:4, fontSize:12, color:"rgba(255,255,255,.75)" }}>
                      <span>{coach.coach_info?.filiere || coach.departement || "-"}</span>
                      <span style={{ background:"rgba(255,255,255,.18)", borderRadius:6, padding:"1px 8px", color:"#fff", fontWeight:700 }}>{coach.acces_bloque ? "🔒 Suspendu" : coach.actif ? "✅ Actif" : "🔴 Inactif"}</span>
                      <span>{conformiteBadge(coach.statut_conformite)}</span>
                      <BadgeCategorieCoach note={coach.note_moyenne} taille="sm" />
                    </div>
                  </div>
                  {IS_GENERAL && (
                    <button disabled={!peut("rapports","manage")} title={permBtnTitle("Signaler anomalie",peut("rapports","manage"))} onClick={()=>{ setCoachDetail(null); setAnomForm({...ANOM_INIT, coach_id:coach.id}); setActiveTab("anomalies"); setTimeout(()=>setShowAnomForm(true),80); }}
                      style={permBtnStyle({ padding:"7px 14px", background:"rgba(239,68,68,0.25)", border:"1px solid rgba(239,68,68,0.5)", borderRadius:9, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" },peut("rapports","manage"))}>
                      {peut("rapports","manage")?"⚠️":"🔒"} Signaler anomalie
                    </button>
                  )}
                </div>
              </div>

              {/* ONGLETS */}
              <div style={{ display:"flex", borderBottom:"2px solid #e5e7eb", background:"#fafafa", flexShrink:0, overflowX:"auto" }}>
                {COACH_TABS.map(t => (
                  <button key={t.id} onClick={()=>setCoachModalTab(t.id)}
                    style={{ padding:"12px 18px", border:"none", borderBottom:`3px solid ${coachModalTab===t.id?BET_COLOR:"transparent"}`,
                      background:"transparent", cursor:"pointer", fontWeight:coachModalTab===t.id?700:400,
                      color:coachModalTab===t.id?BET_COLOR:"#6b7280", fontSize:12, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5 }}>
                    <span>{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>

              {/* CONTENU */}
              <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

                {/* ════ INFOS ════ */}
                {coachModalTab === "infos" && (
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
                        ["Date début BET",  fmtDate(coach.coach_info?.date_debut_bet || coach.date_creation)],
                        ["Centre",          centre],
                        ["Statut",          coach.actif ? "✅ Actif" : "🔴 Inactif"],
                        ["Conformité",      coach.statut_conformite || "-"],
                      ].map(([l,v])=>(
                        <div key={l} style={{ display:"flex", padding:"6px 0", borderBottom:"1px solid #f1f5f9", fontSize:13 }}>
                          <span style={{ color:"#9ca3af", width:150, flexShrink:0, fontWeight:500 }}>{l}</span>
                          <span style={{ fontWeight:600 }}>{typeof v === "string" ? v : v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                      <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                        <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800 }}>Certifications</h3>
                        {(() => {
                          const certs = coach.coach_info?.certifications;
                          const list = Array.isArray(certs) ? certs : (typeof certs==="string" ? certs.split(",").map(s=>s.trim()).filter(Boolean) : []);
                          return list.length
                            ? <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>{list.map((c,i)=><span key={i} style={{ padding:"4px 12px", borderRadius:99, background:BET_LIGHT, color:BET_COLOR, fontSize:12, fontWeight:700 }}>🏆 {c}</span>)}</div>
                            : <p style={{ fontSize:13, color:"#9ca3af" }}>Aucune certification renseignée</p>;
                        })()}
                      </div>
                      <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                        <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800 }}>Résumé activité</h3>
                        {[
                          { l:"Classes assignées",  v: coachGroupesLoading ? "…" : coachGroupes.length, c:BET_COLOR },
                          { l:"Observations reçues", v: coachRapportsLoading ? "…" : coachRapports.length, c:"#0891b2" },
                          { l:"Note moyenne",       v: coach.note_moyenne ? `${coach.note_moyenne}/5` : "-", c: coach.note_moyenne ? nc(coach.note_moyenne) : "#94a3b8" },
                          { l:"Catégorie de contrat", v: <BadgeCategorieCoach note={coach.note_moyenne} taille="xs" />, c:"#0f172a" },
                          { l:"Anomalies actives",  v: coach.nb_anomalies || 0,                          c: coach.nb_anomalies > 0 ? "#dc2626" : "#16a34a" },
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
                {coachModalTab === "evaluations" && (() => {
                  // Cette liste était restée aux cinq critères d'origine, alors que le rapport
                  // en porte sept notés depuis l'ajout des critères de la feuille terrain.
                  // Déplier une observation n'en montrait donc qu'une partie.
                  const CRIT_RAPPORT = LIBELLES_CRITERES;
                  const LIB_INTER  = { excellent:"Excellent", bon:"Bon", acceptable:"Acceptable", insuffisant:"Insuffisant" };
                  const LIB_GRAM   = { inductive_claire:"Inductive et claire", inductive_perfectible:"Inductive, à revoir", deductive_claire:"Déductive mais claire", confuse:"Confuse ou erronée" };
                  const LIB_SYNTH  = { excellent:{ l:"Excellent", c:"#15803d", bg:"#dcfce7" },
                                       satisfaisant:{ l:"Satisfaisant", c:"#b45309", bg:"#fef3c7" },
                                       a_accompagner:{ l:"À accompagner", c:"#b91c1c", bg:"#fee2e2" } };
                  return (
                  <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                    {/* Le bloc « Évaluations Conseiller Pédagogique » a été retiré : la table
                        `evaluations_coachs` est lue par cinq tableaux de bord et alimentée par
                        AUCUN. La route POST existe côté serveur, mais aucun écran ne l'appelle -
                        il n'existe nulle part de formulaire de saisie. Le bloc affichait donc un
                        vide définitif, et laissait croire qu'un coach n'avait jamais été évalué
                        alors que ses rapports d'observation sont juste en dessous. */}

                    {/* ── Rapports d'observation Deputy ── */}
                    <div>
                      <h3 style={{ margin:"0 0 10px", fontSize:13, fontWeight:800, color:"#0891b2", display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ background:"#e0f2fe", borderRadius:8, padding:"3px 10px", fontSize:12 }}>📋 Rapports d'observation Deputy</span>
                        <span style={{ fontSize:11, color:"#94a3b8", fontWeight:400 }}>
                          {coachRapportsLoading ? "…" : `${coachRapports.length} rapport${coachRapports.length !== 1 ? "s" : ""}`}
                        </span>
                      </h3>
                      {/* Filtre par date + export - les observations d'un coach s'accumulent au
                          fil des mois, et c'est presque toujours une période précise qu'on vient
                          regarder : le trimestre écoulé, ou l'intervalle depuis le dernier
                          entretien. */}
                      {!coachRapportsLoading && coachRapports.length > 0 && (
                        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:12, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 14px" }}>
                          {/* Mois / année - un raccourci qui ÉCRIT la plage ci-dessous plutôt
                              que d'être un second filtre : deux états décidant de la même
                              chose finiraient par se contredire. On voit donc les dates
                              changer en choisissant un mois, et l'inverse reste possible. */}
                          {(() => {
                            const MOIS = ["janvier","février","mars","avril","mai","juin",
                              "juillet","août","septembre","octobre","novembre","décembre"];
                            // Les années réellement présentes dans les rapports : proposer
                            // 2020-2030 en dur afficherait des années sans une seule observation.
                            const annees = [...new Set(coachRapports
                              .map(r => r.date_observation && new Date(r.date_observation).getFullYear())
                              .filter(Boolean))].sort((a,b) => b - a);
                            if (!annees.length) annees.push(new Date().getFullYear());

                            // Le mois actif se DÉDUIT de la plage : si elle couvre exactement
                            // un mois entier, c'est celui-là.
                            const actif = (() => {
                              if (!coachObsDu || !coachObsAu) return null;
                              const d = new Date(`${coachObsDu}T00:00:00`);
                              const prem = new Date(d.getFullYear(), d.getMonth(), 1);
                              const dern = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                              const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
                              return (iso(prem) === coachObsDu && iso(dern) === coachObsAu)
                                ? { m: d.getMonth(), a: d.getFullYear() } : null;
                            })();

                            const poser = (m, a) => {
                              if (m === "" || a === "") return;
                              const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
                              setCoachObsDu(iso(new Date(a, m, 1)));
                              setCoachObsAu(iso(new Date(a, Number(m) + 1, 0)));
                            };
                            const anneeCourante = actif?.a ?? annees[0];

                            return (
                              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                                <span style={{ fontSize:12, color:"#64748b", fontWeight:600 }}>Mois</span>
                                <select value={actif ? actif.m : ""}
                                  onChange={e => poser(e.target.value === "" ? "" : Number(e.target.value), anneeCourante)}
                                  style={{ padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, background:"#fff" }}>
                                  <option value="">- Tous -</option>
                                  {MOIS.map((lib, i) => <option key={i} value={i}>{lib}</option>)}
                                </select>
                                <select value={anneeCourante}
                                  onChange={e => { if (actif) poser(actif.m, Number(e.target.value)); }}
                                  style={{ padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, background:"#fff" }}>
                                  {annees.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                              </div>
                            );
                          })()}

                          <label style={{ fontSize:12, color:"#64748b", fontWeight:600 }}>Du&nbsp;
                            <input type="date" value={coachObsDu} onChange={e=>setCoachObsDu(e.target.value)}
                              style={{ padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12 }} />
                          </label>
                          <label style={{ fontSize:12, color:"#64748b", fontWeight:600 }}>au&nbsp;
                            <input type="date" value={coachObsAu} onChange={e=>setCoachObsAu(e.target.value)}
                              style={{ padding:"5px 9px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12 }} />
                          </label>
                          {(coachObsDu || coachObsAu) && (
                            <button onClick={()=>{ setCoachObsDu(""); setCoachObsAu(""); }}
                              style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #fca5a5", background:"#fef2f2", fontSize:11.5, color:"#b91c1c", cursor:"pointer", fontWeight:600 }}>✕ Effacer</button>
                          )}
                          <span style={{ fontSize:11.5, color: obsFiltrees.length ? "#94a3b8" : "#b45309", fontWeight: obsFiltrees.length ? 400 : 700 }}>
                            {obsFiltrees.length === coachRapports.length
                              ? `${coachRapports.length} observation${coachRapports.length>1?"s":""}`
                              : obsFiltrees.length
                                ? `${obsFiltrees.length} sur ${coachRapports.length}`
                                : "Aucune observation sur cette période"}
                          </span>
                          <button onClick={()=>exporterAppraisalCoachs({ rapports: obsFiltrees, nomFichier:`observations_${(coachDetail.nom||"coach").replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}` })}
                            disabled={!obsFiltrees.length}
                            title={obsFiltrees.length ? "Exporter au format de la feuille d'évaluation" : "Aucune observation à exporter"}
                            style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:8, border:"none", fontSize:12, fontWeight:700, cursor: obsFiltrees.length ? "pointer" : "not-allowed",
                              background: obsFiltrees.length ? "#15803d" : "#e2e8f0", color: obsFiltrees.length ? "#fff" : "#94a3b8" }}>
                            📊 Excel
                          </button>
                        </div>
                      )}

                      {coachRapportsLoading && <div style={{ textAlign:"center", padding:"30px 0", color:"#94a3b8", fontSize:13 }}>Chargement des rapports…</div>}
                      {!coachRapportsLoading && coachRapports.length === 0 && (
                        <div style={{ textAlign:"center", padding:"30px 0", background:"#f0f9ff", borderRadius:12, border:"1px dashed #bae6fd" }}>
                          <div style={{ fontSize:"2rem", marginBottom:8 }}>📋</div>
                          <div style={{ fontSize:13, fontWeight:700, color:"#0891b2", marginBottom:4 }}>Aucun rapport Deputy</div>
                          <div style={{ fontSize:12, color:"#94a3b8" }}>Les rapports soumis par les Deputy Superviseurs apparaîtront ici.</div>
                        </div>
                      )}
                      {!coachRapportsLoading && coachRapports.length > 0 && (
                        <div style={{ border:"1.5px solid #bae6fd", borderRadius:14, overflow:"hidden" }}>
                          <div style={{ padding:"10px 16px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"#0369a1" }}>{obsFiltrees.length} rapport{obsFiltrees.length !== 1 ? "s" : ""}</span>
                            <div style={{ display:"flex", gap:8 }}>
                              <button onClick={()=>setRapportExpanded(new Set(obsFiltrees.map(r=>r.id)))} style={{ fontSize:11, fontWeight:700, color:"#0891b2", background:"transparent", border:"none", cursor:"pointer" }}>Tout déplier ↓</button>
                              <button onClick={()=>setRapportExpanded(new Set())} style={{ fontSize:11, fontWeight:700, color:"#94a3b8", background:"transparent", border:"none", cursor:"pointer" }}>Tout replier ↑</button>
                            </div>
                          </div>
                          {obsFiltrees.map((rp, idx) => {
                            const rpOpen = rapportExpanded.has(rp.id);
                            const note   = rp.note_globale ? Number(rp.note_globale) : null;
                            const deputyNom = rp.deputy ? `${rp.deputy.prenom||""} ${rp.deputy.nom||""}`.trim() : "Deputy";
                            const hasTxt = rp.observations || rp.recommandations || rp.commentaire_superviseur;
                            const toggleRp = () => setRapportExpanded(prev => { const n = new Set(prev); n.has(rp.id) ? n.delete(rp.id) : n.add(rp.id); return n; });
                            return (
                              <div key={rp.id} style={{ borderBottom: idx < coachRapports.length-1 ? "1px solid #e0f2fe" : "none" }}>
                                <div onClick={toggleRp}
                                  style={{ padding:"12px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, background:rpOpen?"#e0f2fe":"#fff", transition:"background .15s" }}
                                  onMouseEnter={e=>{ if(!rpOpen) e.currentTarget.style.background="#f0f9ff"; }}
                                  onMouseLeave={e=>{ if(!rpOpen) e.currentTarget.style.background="#fff"; }}>
                                  <span style={{ fontSize:12, color:"#94a3b8", flexShrink:0, transition:"transform .2s", display:"inline-block", transform:rpOpen?"rotate(90deg)":"rotate(0deg)" }}>▶</span>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>
                                      {rp.date_observation ? new Date(rp.date_observation).toLocaleDateString("fr-FR") : "-"}
                                      {rp.classe && <span style={{ marginLeft:8, fontSize:11, fontWeight:600, color:"#0891b2" }}>{rp.classe}</span>}
                                    </div>
                                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                                      {deputyNom}{rp.centre && ` · ${rp.centre}`}
                                      {hasTxt && <span style={{ marginLeft:6, color:"#0891b2" }}>📝</span>}
                                    </div>
                                  </div>
                                  <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:20, flexShrink:0 }}>
                                    {Object.keys(CRIT_RAPPORT).map(k => {
                                      const v = rp[k];
                                      return <div key={k} title={CRIT_RAPPORT[k].label} style={{ width:6, borderRadius:2, background:v?nc(v):"#e5e7eb", height:v?`${v/5*100}%`:"20%" }} />;
                                    })}
                                  </div>
                                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, background:rp.statut==="archivé"?"#f3f4f6":rp.statut==="transmis_pa"?"#dcfce7":rp.statut==="lu"?"#e0f2fe":"#fef3c7", color:rp.statut==="archivé"?"#6b7280":rp.statut==="transmis_pa"?"#16a34a":rp.statut==="lu"?"#0891b2":"#f59e0b", flexShrink:0 }}>
                                    {rp.statut==="transmis_pa"?"✅ PA":rp.statut==="lu"?"👁 Lu":rp.statut==="archivé"?"📁":"🕐"}
                                  </span>
                                  {note && (
                                    <div style={{ width:40, height:40, borderRadius:9, background:nbg(note), display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:15, color:nc(note), flexShrink:0 }}>
                                      {note.toFixed(1)}
                                    </div>
                                  )}
                                </div>
                                {rpOpen && (
                                  <div style={{ padding:"16px 20px", background:"#e0f2fe", borderTop:"1px solid #bae6fd" }}>
                                    {/* Synthèse, contexte, séance et incident - tout ce que le
                                        rapport porte désormais, et que ce bloc ignorait. */}
                                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
                                      {rp.synthese && LIB_SYNTH[rp.synthese] && (
                                        <span style={{ padding:"5px 12px", borderRadius:8, fontSize:12, fontWeight:800, background:LIB_SYNTH[rp.synthese].bg, color:LIB_SYNTH[rp.synthese].c }}>{LIB_SYNTH[rp.synthese].l}</span>
                                      )}
                                      {rp.type_observation && rp.type_observation !== "cours" && (
                                        <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:700, background:"#ede9fe", color:"#6d28d9" }}>
                                          {rp.type_observation === "evaluation" ? "📊" : "🎭"} {libelleObservation(rp.type_observation)}
                                        </span>
                                      )}
                                      {rp.type_lecon && (
                                        <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#fff", border:"1px solid #bae6fd", color:"#0369a1" }}>📖 {libelleLecon(rp.type_lecon)}</span>
                                      )}
                                      {rp.internet && (
                                        <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:700,
                                          background: rp.internet === "instable" ? "#fee2e2" : "#f1f5f9",
                                          color: rp.internet === "instable" ? "#b91c1c" : "#475569" }}>
                                          📶 Internet : <strong>{libelleInternet(rp.internet)}</strong>
                                        </span>
                                      )}
                                      {rp.seance && (
                                        <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#15803d" }}>
                                          🎥 {rp.seance.titre || "Séance"}
                                          {dureeReelleMin(rp.seance) != null ? ` · ${dureeReelleMin(rp.seance)} min en salle` : ""}
                                        </span>
                                      )}
                                      {rp.interactivite_classe && (
                                        <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#fff", border:"1px solid #bae6fd", color:"#475569" }}>
                                          👥 Interactivité : <strong>{LIB_INTER[rp.interactivite_classe] || rp.interactivite_classe}</strong>
                                        </span>
                                      )}
                                      {rp.approche_grammaticale && (
                                        <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#fff", border:"1px solid #bae6fd", color:"#475569" }}>
                                          📖 Grammaire : <strong>{LIB_GRAM[rp.approche_grammaticale] || rp.approche_grammaticale}</strong>
                                        </span>
                                      )}
                                      {rp.centre && (
                                        <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#fff", border:"1px solid #bae6fd", color:"#475569" }}>📍 {rp.centre}</span>
                                      )}
                                      {rp.incident_technique && (
                                        <span title={rp.incident_technique_detail || "Incident signalé"}
                                          style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:700, background:"#fffbeb", border:"1px solid #fcd34d", color:"#92400e" }}>
                                          📡 Incident{rp.incident_technique_detail ? ` - ${rp.incident_technique_detail}` : ""}
                                        </span>
                                      )}
                                      <span style={{ marginLeft:"auto", fontSize:11, color:"#64748b" }}>
                                        Observé par <strong>{deputyNom}</strong>
                                      </span>
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:8, marginBottom:hasTxt?14:0 }}>
                                      {Object.entries(CRIT_RAPPORT).map(([key, meta]) => {
                                        const val = rp[key];
                                        return (
                                          <div key={key} style={{ background:"#fff", borderRadius:9, padding:"10px 12px", border:"1px solid #bae6fd" }}>
                                            <div style={{ fontSize:11, color:"#0369a1", fontWeight:600, marginBottom:6 }}>{meta.icon} {meta.label}</div>
                                            <div style={{ display:"flex", gap:3 }}>
                                              {[1,2,3,4,5].map(n=>(
                                                <div key={n} style={{ width:18, height:18, borderRadius:3, fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", background:val>=n?nc(val):"#e5e7eb", color:val>=n?"#fff":"#9ca3af" }}>{n}</div>
                                              ))}
                                              {val && <span style={{ marginLeft:4, fontSize:11, fontWeight:800, color:nc(val), alignSelf:"center" }}>{val}/5</span>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {hasTxt && (
                                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                        {rp.observations && (
                                          <div style={{ background:"#f0f9ff", borderRadius:9, padding:"10px 13px", border:"1px solid #bae6fd" }}>
                                            <div style={{ fontSize:11, fontWeight:800, color:"#0369a1", marginBottom:5 }}>👁 Observations</div>
                                            <p style={{ margin:0, fontSize:12, color:"#0c4a6e", lineHeight:1.6 }}>{rp.observations}</p>
                                          </div>
                                        )}
                                        {rp.recommandations && (
                                          <div style={{ background:"#f0fdf4", borderRadius:9, padding:"10px 13px", border:"1px solid #bbf7d0" }}>
                                            <div style={{ fontSize:11, fontWeight:800, color:"#16a34a", marginBottom:5 }}>💡 Recommandations</div>
                                            <p style={{ margin:0, fontSize:12, color:"#14532d", lineHeight:1.6 }}>{rp.recommandations}</p>
                                          </div>
                                        )}
                                        {rp.commentaire_superviseur && (
                                          <div style={{ gridColumn:"1/-1", background:"#fef9c3", borderRadius:9, padding:"10px 13px", border:"1px solid #fde047" }}>
                                            <div style={{ fontSize:11, fontWeight:800, color:"#854d0e", marginBottom:5 }}>💬 Commentaire Superviseur</div>
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

                  </div>
                  );
                })()}

                {/* ════ CLASSES ════ */}
                {coachModalTab === "classes" && (() => {
                  const classesFiltrees = coachGroupes.filter(g => {
                    if (!g.date_debut) return true;
                    const d = new Date(g.date_debut);
                    if (supClasseDateFrom && d < new Date(supClasseDateFrom)) return false;
                    if (supClasseDateTo   && d > new Date(supClasseDateTo + "T23:59:59")) return false;
                    return true;
                  });
                  const supClTotalPages = Math.max(1, Math.ceil(classesFiltrees.length / SUP_CLASSE_PER_PAGE));
                  const supClPageSafe   = Math.min(supClassePage, supClTotalPages);
                  const supClPageItems  = classesFiltrees.slice((supClPageSafe - 1) * SUP_CLASSE_PER_PAGE, supClPageSafe * SUP_CLASSE_PER_PAGE);

                  const SupClPagBar = () => supClTotalPages <= 1 ? null : (
                    <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", padding:"10px 0" }}>
                      <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>Page {supClPageSafe}/{supClTotalPages} · {classesFiltrees.length} classe{classesFiltrees.length!==1?"s":""}{(supClasseDateFrom||supClasseDateTo)?" (filtrées)":""}</span>
                      <button onClick={()=>setSupClassePage(p=>Math.max(1,p-1))} disabled={supClPageSafe===1}
                        style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:supClPageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:supClPageSafe===1?"default":"pointer", color:supClPageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
                      {Array.from({length:supClTotalPages},(_,i)=>i+1).map(p=>(
                        <button key={p} onClick={()=>setSupClassePage(p)}
                          style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===supClPageSafe?BET_COLOR:"#e2e8f0"}`, background:p===supClPageSafe?BET_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===supClPageSafe?"#fff":"#374151", fontWeight:p===supClPageSafe?800:400 }}>{p}</button>
                      ))}
                      <button onClick={()=>setSupClassePage(p=>Math.min(supClTotalPages,p+1))} disabled={supClPageSafe===supClTotalPages}
                        style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:supClPageSafe===supClTotalPages?"#f1f5f9":"#fff", fontSize:12, cursor:supClPageSafe===supClTotalPages?"default":"pointer", color:supClPageSafe===supClTotalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
                    </div>
                  );

                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                      {/* En-tête + filtre date */}
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                        <div>
                          <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Classes assignées</h3>
                          <p style={{ margin:"3px 0 0", fontSize:12, color:"#9ca3af" }}>Groupes de cours dont ce coach est responsable</p>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>Début du</span>
                          <input type="date" value={supClasseDateFrom} onChange={e=>{ setSupClasseDateFrom(e.target.value); setSupClassePage(1); }}
                            style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
                          <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>au</span>
                          <input type="date" value={supClasseDateTo} onChange={e=>{ setSupClasseDateTo(e.target.value); setSupClassePage(1); }}
                            style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
                          {(supClasseDateFrom||supClasseDateTo) && (
                            <button onClick={()=>{ setSupClasseDateFrom(""); setSupClasseDateTo(""); setSupClassePage(1); }}
                              style={{ padding:"3px 9px", borderRadius:7, border:"1.5px solid #fca5a5", background:"#fef2f2", fontSize:12, color:"#b91c1c", cursor:"pointer", fontWeight:600 }}>✕</button>
                          )}
                        </div>
                      </div>

                      {coachGroupesLoading ? (
                        <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>Chargement…</div>
                      ) : coachGroupes.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"50px 0", color:"#9ca3af" }}>
                          <div style={{ fontSize:40, marginBottom:10 }}>🏫</div>
                          <div style={{ fontWeight:600 }}>Aucune classe assignée</div>
                          <div style={{ fontSize:12, marginTop:4 }}>Ce coach n'est associé à aucun groupe pour le moment.</div>
                        </div>
                      ) : classesFiltrees.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"40px 0", background:"#fff7ed", borderRadius:12, border:"1px dashed #fed7aa", color:"#9ca3af" }}>
                          <div style={{ fontSize:36, marginBottom:8 }}>🗓️</div>
                          <div style={{ fontWeight:600, color:"#374151", marginBottom:8 }}>Aucune classe sur cette période</div>
                          <button onClick={()=>{ setSupClasseDateFrom(""); setSupClasseDateTo(""); setSupClassePage(1); }}
                            style={{ padding:"6px 16px", borderRadius:8, border:"none", background:BET_COLOR, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:12 }}>Effacer le filtre</button>
                        </div>
                      ) : (
                        <>
                          <SupClPagBar />
                          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                              <thead>
                                <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                                  {["Classe","Filière","Niveau","Type","Apprenants","Début","Statut"].map(h=>(
                                    <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {supClPageItems.map((g, idx) => {
                                  const sCol = g.statut==="actif" ? { c:"#16a34a",bg:"#dcfce7" } : g.statut==="cloture" ? { c:"#475569",bg:"#f1f5f9" } : g.statut==="termine" ? { c:"#475569",bg:"#f1f5f9" } : { c:"#d97706",bg:"#fef9c3" };
                                  const sLabel = g.statut==="actif" ? "Actif" : g.statut==="cloture" ? "🔒 Clôturée" : g.statut==="termine" ? "Terminée" : (g.statut||"-");
                                  const typeLabel = g.type_cours==="en_ligne" ? "💻 En ligne" : g.type_cours==="domicile" ? "🏠 Domicile" : "🏢 Présentiel";
                                  const rowBg = idx%2===0?"#fff":"#fafafa";
                                  return (
                                    <tr key={g.id} style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer" }}
                                      onClick={()=>openGroupeDetail(g)}
                                      onMouseEnter={e=>e.currentTarget.style.background=BET_LIGHT}
                                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                                      <td style={{ padding:"12px 16px" }}>
                                        <div style={{ fontWeight:700, color:"#0f172a" }}>{g.nom||"-"}</div>
                                        {g.code && <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>{g.code}</div>}
                                      </td>
                                      <td style={{ padding:"12px 16px", fontSize:12, color:"#374151" }}>{g.filiere||"-"}</td>
                                      <td style={{ padding:"12px 16px" }}>
                                        {g.niveau ? <span style={{ fontSize:11, fontWeight:800, padding:"3px 9px", borderRadius:999, background:BET_LIGHT, color:BET_COLOR }}>{g.niveau}</span> : <span style={{ color:"#94a3b8" }}>-</span>}
                                      </td>
                                      <td style={{ padding:"12px 16px", fontSize:12, color:"#374151" }}>{g.type_cours ? typeLabel : "-"}</td>
                                      <td style={{ padding:"12px 16px", textAlign:"center", fontWeight:700, color:BET_COLOR, fontSize:14 }}>{g.nb_apprenants ?? "-"}</td>
                                      <td style={{ padding:"12px 16px", fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>{g.date_debut ? fmtDate(g.date_debut) : "-"}</td>
                                      <td style={{ padding:"12px 16px" }}>
                                        <span style={{ background:sCol.bg, color:sCol.c, borderRadius:99, padding:"3px 10px", fontSize:10, fontWeight:700 }}>{sLabel}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <SupClPagBar />
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* ════ DISPONIBILITÉS ════ */}
                {coachModalTab === "disponibilite" && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>📅 Créneaux déclarés par le coach</div>
                        <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>Disponibilités renseignées dans l'Espace Professeur - déclarées mois par mois</div>
                      </div>
                      {/* Sélecteur de mois : les disponibilités sont mensuelles. Sans lui,
                          l'écran retombait sur le mois courant sans le dire, et affichait
                          « aucun créneau » pour un coach qui avait rempli le mois précédent. */}
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <button onClick={()=>{ const m = coachDispoMois === 1 ? 12 : coachDispoMois - 1; const a = coachDispoMois === 1 ? coachDispoAnnee - 1 : coachDispoAnnee; setCoachDispoMois(m); setCoachDispoAnnee(a); }}
                          title="Mois précédent"
                          style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:13, color:"#374151" }}>‹</button>
                        <span style={{ fontSize:12.5, fontWeight:700, color:"#0f172a", minWidth:118, textAlign:"center" }}>
                          {new Date(coachDispoAnnee, coachDispoMois - 1, 1).toLocaleDateString("fr-FR", { month:"long", year:"numeric" })}
                        </span>
                        <button onClick={()=>{ const m = coachDispoMois === 12 ? 1 : coachDispoMois + 1; const a = coachDispoMois === 12 ? coachDispoAnnee + 1 : coachDispoAnnee; setCoachDispoMois(m); setCoachDispoAnnee(a); }}
                          title="Mois suivant"
                          style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:13, color:"#374151" }}>›</button>
                        <button onClick={()=>fetchCoachDispos(coach.id, coachDispoMois, coachDispoAnnee)} style={{ padding:"5px 12px", borderRadius:7, border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:12, color:"#374151" }}>🔄 Actualiser</button>
                      </div>
                    </div>
                    {coachDisposLoading && <div style={{ textAlign:"center", padding:40, color:"#9ca3af", fontSize:13 }}>Chargement des disponibilités…</div>}
                    {!coachDisposLoading && joursAvecDispo.length === 0 && (
                      <div style={{ textAlign:"center", padding:40, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", color:"#9ca3af" }}>
                        <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                        <div style={{ fontWeight:600, color:"#374151", marginBottom:4 }}>
                          Aucun créneau en {new Date(coachDispoAnnee, coachDispoMois - 1, 1).toLocaleDateString("fr-FR", { month:"long", year:"numeric" })}
                        </div>
                        <div style={{ fontSize:12 }}>Ce coach n'a pas déclaré de disponibilité pour ce mois - essayez un autre mois avec les flèches.</div>
                      </div>
                    )}
                    {!coachDisposLoading && joursAvecDispo.length > 0 && (
                      <>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:10, marginBottom:14 }}>
                          {joursAvecDispo.map(jour => (
                            <div key={jour} style={{ background:"#fff", border:`1.5px solid ${BET_COLOR}30`, borderRadius:12, padding:"12px 14px" }}>
                              <div style={{ fontWeight:700, fontSize:12, color:BET_COLOR, marginBottom:8 }}>📅 {jour}</div>
                              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                                {byJour[jour].map((c,i) => (
                                  <span key={i} style={{ background:BET_LIGHT, color:BET_COLOR, borderRadius:7, padding:"3px 10px", fontSize:12, fontWeight:600, width:"fit-content" }}>🕐 {c}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize:11, color:"#9ca3af", textAlign:"right" }}>
                          {coachDispos.length} créneau{coachDispos.length!==1?"x":""} · {joursAvecDispo.length} jour{joursAvecDispo.length!==1?"s":""}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ════ SÉANCES ════
                    Ce que le coach a réellement fait. L'onglet Honoraires projette des
                    montants par classe ; celui-ci part de la séance elle-même - sa durée
                    prévue, le temps réellement passé en salle, et qui était présent. */}
                {coachModalTab === "seances" && (() => {
                  // Le mois affiché se DÉDUIT de la plage de dates au lieu d'être un second
                  // état : naviguer d'un mois à l'autre ne fait qu'écrire cette plage, donc
                  // les deux contrôles ne peuvent jamais afficher des choses différentes.
                  const moisActif = (() => {
                    if (!supSeancesDu || !supSeancesAu) return null;
                    const d = new Date(`${supSeancesDu}T00:00:00`);
                    const b = bornesMois(d.getMonth()+1, d.getFullYear());
                    return (b.du === supSeancesDu && b.au === supSeancesAu)
                      ? { mois: d.getMonth()+1, annee: d.getFullYear() } : null;
                  })();

                  // Point de départ quand aucun mois n'est encore choisi : le mois de la séance
                  // la plus récente, pas le mois courant - les séances d'un coach ne tombent pas
                  // forcément sur aujourd'hui, et ouvrir sur un mois vide n'apprend rien.
                  const moisDepart = (() => {
                    const dates = coachSeances.map(x => x.date_seance).filter(Boolean).sort();
                    const ref = dates.length ? new Date(`${dates[dates.length-1]}T00:00:00`) : new Date();
                    return { mois: ref.getMonth()+1, annee: ref.getFullYear() };
                  })();

                  const allerAuMois = (mois, annee) => {
                    const b = bornesMois(mois, annee);
                    setSupSeancesDu(b.du); setSupSeancesAu(b.au); setSupSeancesPage(1);
                  };
                  const decalerMois = (pas) => {
                    const base = moisActif || moisDepart;
                    const d = new Date(base.annee, base.mois - 1 + pas, 1);
                    allerAuMois(d.getMonth()+1, d.getFullYear());
                  };

                  // Nombre de séances par mois, sur le périmètre hors dates : sert à indiquer
                  // où chercher quand le mois affiché est vide.
                  const parMois = {};
                  for (const x of coachSeances) {
                    if (!x.date_seance) continue;
                    if (supSeancesStatut !== "toutes" && x.statut !== supSeancesStatut) continue;
                    const k = x.date_seance.slice(0,7);
                    parMois[k] = (parMois[k] || 0) + 1;
                  }
                  const moisRenseignes = Object.keys(parMois).sort().reverse();

                  const seancesFiltrees = coachSeances
                    .filter(x => {
                      if (supSeancesStatut !== "toutes" && x.statut !== supSeancesStatut) return false;
                      const d = x.date_seance || "";
                      if (supSeancesDu && d < supSeancesDu) return false;
                      if (supSeancesAu && d > supSeancesAu) return false;
                      const q = supSeancesSearch.trim().toLowerCase();
                      if (q && !`${x.titre||""} ${x.groupe_nom||""} ${x.niveau||""}`.toLowerCase().includes(q)) return false;
                      return true;
                    })
                    .sort((a,b) => (b.date_seance||"").localeCompare(a.date_seance||""));

                  const realisees = seancesFiltrees.filter(x => x.statut === "realisee");
                  const heuresPrevues = realisees.reduce((t,x) => t + (parseFloat(x.duree_h)||0), 0);
                  // Le temps réellement passé n'existe que pour les séances dont la salle a été
                  // ouverte : le moyenner sur toutes fausserait la comparaison, on ne compte que
                  // celles qui l'ont relevé.
                  const avecReel = realisees.map(x => dureeReelleMin(x)).filter(v => v != null);
                  const heuresReelles = avecReel.reduce((t,v) => t + v, 0) / 60;

                  // Le découpage porte sur la liste DÉJÀ filtrée : les compteurs du haut
                  // continuent de décrire l'ensemble, la pagination ne concerne que l'affichage.
                  const supSeTotalPages = Math.max(1, Math.ceil(seancesFiltrees.length / SUP_SEANCES_PER_PAGE));
                  const supSePageSafe   = Math.min(supSeancesPage, supSeTotalPages);
                  const supSePageItems  = seancesFiltrees.slice((supSePageSafe - 1) * SUP_SEANCES_PER_PAGE, supSePageSafe * SUP_SEANCES_PER_PAGE);
                  // Fenêtre de 5 numéros autour de la page courante : un coach avec deux ans
                  // de séances produirait sinon une trentaine de boutons sur une seule ligne.
                  const supSeFenetre = (() => {
                    const debut = Math.max(1, Math.min(supSePageSafe - 2, supSeTotalPages - 4));
                    return Array.from({ length: Math.min(5, supSeTotalPages) }, (_, i) => debut + i);
                  })();

                  const th = { padding:"8px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", borderBottom:"1px solid #E5E7EB", whiteSpace:"nowrap" };
                  const td = { padding:"9px 12px", fontSize:12, color:"#374151" };
                  const champ = { padding:"7px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontSize:12, color:"#0f172a", background:"#fff" };

                  return (
                    <div>
                      {/* Navigation par mois - elle n'écrit que la plage de dates ci-dessous,
                          qu'on voit changer : un seul filtre, deux façons de le poser. */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:12, padding:"10px 12px", background:"#F8FAFC", borderRadius:10, border:"1px solid #E5E7EB" }}>
                        <button onClick={()=>decalerMois(-1)} title="Mois précédent"
                          style={{ padding:"5px 11px", borderRadius:7, border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:13, color:"#374151" }}>←</button>
                        <div style={{ minWidth:170, textAlign:"center" }}>
                          <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", textTransform:"capitalize" }}>
                            {moisActif ? libelleMois(moisActif.mois, moisActif.annee) : "Toute la période"}
                          </div>
                          <div style={{ fontSize:10.5, color:"#94a3b8" }}>
                            {moisActif
                              ? `${parMois[`${moisActif.annee}-${String(moisActif.mois).padStart(2,"0")}`] || 0} séance${(parMois[`${moisActif.annee}-${String(moisActif.mois).padStart(2,"0")}`] || 0) > 1 ? "s" : ""}`
                              : `${coachSeances.length} séance${coachSeances.length > 1 ? "s" : ""} au total`}
                          </div>
                        </div>
                        <button onClick={()=>decalerMois(1)} title="Mois suivant"
                          style={{ padding:"5px 11px", borderRadius:7, border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:13, color:"#374151" }}>→</button>
                        <button onClick={()=>{ setSupSeancesDu(""); setSupSeancesAu(""); setSupSeancesPage(1); }} disabled={!supSeancesDu && !supSeancesAu}
                          style={{ padding:"5px 12px", borderRadius:7, fontSize:12, fontWeight:600, cursor:(!supSeancesDu && !supSeancesAu)?"default":"pointer",
                            border:`1.5px solid ${(!supSeancesDu && !supSeancesAu) ? BET_COLOR : "#e5e7eb"}`,
                            background:(!supSeancesDu && !supSeancesAu) ? BET_LIGHT : "#fff",
                            color:(!supSeancesDu && !supSeancesAu) ? BET_COLOR : "#64748b" }}>Tous les mois</button>

                        {/* Accès direct aux mois qui contiennent effectivement des séances -
                            sans cela, trouver un mois isolé demande de cliquer ← autant de fois. */}
                        {moisRenseignes.length > 1 && (
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginLeft:"auto" }}>
                            {moisRenseignes.slice(0, 6).map(k => {
                              const [a, m] = k.split("-").map(Number);
                              const actif = moisActif && moisActif.mois === m && moisActif.annee === a;
                              return (
                                <button key={k} onClick={()=>allerAuMois(m, a)}
                                  style={{ padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer",
                                    border:`1.5px solid ${actif ? BET_COLOR : "#e2e8f0"}`,
                                    background: actif ? BET_COLOR : "#fff", color: actif ? "#fff" : "#64748b" }}>
                                  {new Date(a, m-1, 1).toLocaleDateString("fr-FR", { month:"short", year:"2-digit" })} · {parMois[k]}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", marginBottom:14 }}>
                        <input value={supSeancesSearch} onChange={e=>{ setSupSeancesSearch(e.target.value); setSupSeancesPage(1); }}
                          placeholder="🔍 Titre, classe, niveau…" style={{ ...champ, flex:"1 1 200px", minWidth:170 }} />
                        <select value={supSeancesStatut} onChange={e=>{ setSupSeancesStatut(e.target.value); setSupSeancesPage(1); }} style={champ}>
                          <option value="toutes">Tous les statuts</option>
                          <option value="realisee">Réalisées</option>
                          <option value="planifiee">Planifiées</option>
                          <option value="annulee">Annulées</option>
                        </select>
                        <label style={{ fontSize:11, color:"#64748b", display:"flex", alignItems:"center", gap:5 }}>
                          Du <input type="date" value={supSeancesDu} onChange={e=>{ setSupSeancesDu(e.target.value); setSupSeancesPage(1); }} style={champ} />
                        </label>
                        <label style={{ fontSize:11, color:"#64748b", display:"flex", alignItems:"center", gap:5 }}>
                          Au <input type="date" value={supSeancesAu} onChange={e=>{ setSupSeancesAu(e.target.value); setSupSeancesPage(1); }} style={champ} />
                        </label>
                        {(supSeancesSearch || supSeancesDu || supSeancesAu || supSeancesStatut !== "toutes") && (
                          <button onClick={()=>{ setSupSeancesSearch(""); setSupSeancesDu(""); setSupSeancesAu(""); setSupSeancesStatut("toutes"); setSupSeancesPage(1); }}
                            style={{ ...champ, cursor:"pointer", color:"#64748b", fontWeight:600 }}>✕ Réinitialiser</button>
                        )}
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))", gap:10, marginBottom:16 }}>
                        {[
                          { l:"Séances réalisées", v: realisees.length },
                          { l:"Heures prévues",    v: `${heuresPrevues.toFixed(1)}h` },
                          { l:"Heures en salle",   v: avecReel.length ? `${heuresReelles.toFixed(1)}h` : "-",
                            note: avecReel.length ? `sur ${avecReel.length} séance${avecReel.length>1?"s":""} relevée${avecReel.length>1?"s":""}` : "aucun relevé" },
                          { l:"Affichées",         v: seancesFiltrees.length },
                        ].map(k => (
                          <div key={k.l} style={{ background:"#F8FAFC", borderRadius:10, padding:"11px 14px", border:"1px solid #E5E7EB" }}>
                            <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>{k.l}</div>
                            <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>{k.v}</div>
                            {k.note && <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{k.note}</div>}
                          </div>
                        ))}
                      </div>

                      {coachSeancesLoading ? (
                        <div style={{ textAlign:"center", padding:24, color:"#94a3b8", fontSize:12 }}>⏳ Chargement des séances…</div>
                      ) : seancesFiltrees.length === 0 ? (
                        <div style={{ textAlign:"center", padding:24, color:"#94a3b8", fontSize:12, background:"#F8FAFC", borderRadius:10 }}>
                          {coachSeances.length === 0 ? "Aucune séance enregistrée pour ce coach." : (
                            <>
                              <div style={{ fontWeight:600, color:"#374151" }}>
                                {moisActif ? `Aucune séance en ${libelleMois(moisActif.mois, moisActif.annee)}` : "Aucune séance ne correspond à ces filtres."}
                              </div>
                              {moisRenseignes.length > 0 && (
                                <div style={{ marginTop:6 }}>
                                  Séances enregistrées en {moisRenseignes.slice(0,4).map(k => {
                                    const [a,m] = k.split("-").map(Number);
                                    return libelleMois(m, a);
                                  }).join(", ")}.
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <div style={{ border:"1px solid #E5E7EB", borderRadius:10, overflowX:"auto" }}>
                          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:680 }}>
                            <thead>
                              <tr style={{ background:"#F8FAFC" }}>
                                {["Date","Titre","Classe","Prévu","Réel","Présences","Statut"].map(c => (
                                  <th key={c} style={th}>{c}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {supSePageItems.map((x,i) => {
                                const reel    = dureeReelleMin(x);
                                const prevu   = dureePrevueMin(x);
                                // Un écart franc doit sauter aux yeux : c'est le signal que
                                // le superviseur cherche en ouvrant cet onglet.
                                const ecartFort = reel != null && prevu ? reel < prevu * 0.6 : false;
                                const stat = STATUT_SEANCE_SUP[x.statut] || { lib:x.statut||"-", bg:"#f1f5f9", c:"#475569" };
                                return (
                                  <tr key={x.id} onClick={()=>setSupSeanceDetail(x)}
                                    style={{ borderBottom:"1px solid #F1F5F9", cursor:"pointer", background: i%2===0 ? "#fff" : "#FAFAFA" }}>
                                    <td style={{ ...td, whiteSpace:"nowrap" }}>
                                      {x.date_seance ? new Date(x.date_seance).toLocaleDateString("fr-FR") : "-"}
                                      {x.date_seance_initiale && x.date_seance_initiale !== x.date_seance && (
                                        <span title={`Initialement le ${new Date(x.date_seance_initiale).toLocaleDateString("fr-FR")}`} style={{ marginLeft:5 }}>🔁</span>
                                      )}
                                    </td>
                                    <td style={{ ...td, fontWeight:600, color:"#0f172a" }}>{x.titre || "-"}</td>
                                    <td style={td}>{x.groupe_nom || (x.circuit==="prive" ? "Coaching privé" : "-")}</td>
                                    <td style={{ ...td, whiteSpace:"nowrap" }}>{prevu != null ? `${prevu} min` : "-"}</td>
                                    <td style={{ ...td, whiteSpace:"nowrap", fontWeight: ecartFort ? 800 : 600, color: ecartFort ? "#b91c1c" : reel != null ? "#166534" : "#9ca3af" }}>
                                      {reel != null ? `${reel} min` : "non relevé"}
                                    </td>
                                    <td style={td}>
                                      {x.nb_presences_total ? `${x.nb_presents}/${x.nb_presences_total}` : "-"}
                                    </td>
                                    <td style={td}>
                                      <span style={{ padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:700, background:stat.bg, color:stat.c }}>{stat.lib}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {supSeTotalPages > 1 && (
                        <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", flexWrap:"wrap", padding:"12px 0 2px" }}>
                          <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>
                            Page {supSePageSafe}/{supSeTotalPages} · {seancesFiltrees.length} séance{seancesFiltrees.length!==1?"s":""}
                          </span>
                          <button onClick={()=>setSupSeancesPage(p=>Math.max(1,p-1))} disabled={supSePageSafe===1}
                            style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:supSePageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:supSePageSafe===1?"default":"pointer", color:supSePageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
                          {supSeFenetre[0] > 1 && <span style={{ fontSize:12, color:"#cbd5e1" }}>…</span>}
                          {supSeFenetre.map(pg => (
                            <button key={pg} onClick={()=>setSupSeancesPage(pg)}
                              style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${pg===supSePageSafe?BET_COLOR:"#e2e8f0"}`, background:pg===supSePageSafe?BET_COLOR:"#fff", fontSize:12, cursor:"pointer", color:pg===supSePageSafe?"#fff":"#374151", fontWeight:pg===supSePageSafe?800:400 }}>{pg}</button>
                          ))}
                          {supSeFenetre[supSeFenetre.length-1] < supSeTotalPages && <span style={{ fontSize:12, color:"#cbd5e1" }}>…</span>}
                          <button onClick={()=>setSupSeancesPage(p=>Math.min(supSeTotalPages,p+1))} disabled={supSePageSafe===supSeTotalPages}
                            style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:supSePageSafe===supSeTotalPages?"#f1f5f9":"#fff", fontSize:12, cursor:supSePageSafe===supSeTotalPages?"default":"pointer", color:supSePageSafe===supSeTotalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ════ MODULES E-LEARNING ════ */}
                {coachModalTab === "archive" && (
                  <ArchiveApprenantsCoach
                    coachId={coach.id}
                    coachNom={[coach.prenom, coach.nom].filter(Boolean).join(" ")}
                    accent={BET_COLOR}
                    authHdrs={authHdrs}
                  />
                )}

                {coachModalTab === "ressources" && (
                  <RessourcesCoach
                    coachId={coach.id}
                    coachNom={[coach.prenom, coach.nom].filter(Boolean).join(" ")}
                    accent={BET_COLOR}
                    authHdrs={authHdrs}
                  />
                )}

                {coachModalTab === "modules" && (() => {
                  const totalModules = coachCours.length;
                  const totalPublies = coachCours.filter(c=>c.statut==="publie").length;

                  // Filtrage par date
                  // Les classes que touchent ces contenus, pour alimenter le selecteur.
                  const classesCours = [...new Set(coachCours.flatMap(c => c.groupe_noms || []))].sort();

                  const coursFiltres = coachCours.filter(c => {
                    if (supCoursClasse && !(c.groupe_noms || []).includes(supCoursClasse)) return false;
                    if (!c.created_at) return true;
                    const d = new Date(c.created_at);
                    if (supCoursDateFrom && d < new Date(supCoursDateFrom)) return false;
                    if (supCoursDateTo   && d > new Date(supCoursDateTo + "T23:59:59")) return false;
                    return true;
                  });

                  /* Mois / annee. Le selecteur ECRIT la plage de dates, et le mois actif
                     s'en DEDUIT : deux etats decidant de la meme periode finiraient par se
                     contredire - c'est le defaut qu'on a deja corrige ailleurs ici. */
                  const MOIS_LIB_C = ["janvier","février","mars","avril","mai","juin",
                                      "juillet","août","septembre","octobre","novembre","décembre"];
                  const isoC = (y, m, dernier) =>
                    `${y}-${String(m + 1).padStart(2, "0")}-${String(dernier ? new Date(y, m + 1, 0).getDate() : 1).padStart(2, "0")}`;
                  const anneesC = [...new Set([
                    ...coachCours.map(c => c.created_at ? new Date(c.created_at).getFullYear() : null).filter(Boolean),
                    new Date().getFullYear(),
                  ])].sort((a, b) => b - a);
                  // Un mois n'est « actif » que si la plage couvre exactement ce mois.
                  const debutC = supCoursDateFrom ? new Date(supCoursDateFrom + "T12:00:00") : null;
                  const finC   = supCoursDateTo   ? new Date(supCoursDateTo   + "T12:00:00") : null;
                  const moisActifC = (debutC && finC
                    && debutC.getDate() === 1
                    && finC.getTime() === new Date(finC.getFullYear(), finC.getMonth() + 1, 0, 12).getTime()
                    && debutC.getMonth() === finC.getMonth()
                    && debutC.getFullYear() === finC.getFullYear())
                    ? { m: debutC.getMonth(), y: debutC.getFullYear() } : null;
                  const poserMoisC = (m, y) => {
                    if (m === "" || y === "") return;
                    setSupCoursDateFrom(isoC(y, m, false));
                    setSupCoursDateTo(isoC(y, m, true));
                    setSupCoursPage(1);
                  };
                  const supCTotalPages = Math.max(1, Math.ceil(coursFiltres.length / SUP_COURS_PER_PAGE));
                  const supCPageSafe   = Math.min(supCoursPage, supCTotalPages);
                  const supCPageItems  = coursFiltres.slice((supCPageSafe - 1) * SUP_COURS_PER_PAGE, supCPageSafe * SUP_COURS_PER_PAGE);

                  /* Le compteur s'affiche TOUJOURS, les boutons seulement s'il y a
                     plusieurs pages : une barre entierement masquee sur une seule page ne
                     se distinguait pas d'une pagination absente. */
                  const SupCPagBar = () => (
                    <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center", padding:"10px 0", flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, color:"#9ca3af", marginRight:4 }}>
                        {supCTotalPages > 1 ? `Page ${supCPageSafe}/${supCTotalPages} · ` : ""}
                        {coursFiltres.length} cours{coursFiltres.length > 1 ? "" : ""}{(supCoursDateFrom||supCoursDateTo||supCoursClasse)?" (filtrés)":""}
                        {supCTotalPages > 1 ? "" : ` · ${SUP_COURS_PER_PAGE} par page`}
                      </span>
                      {supCTotalPages <= 1 ? null : <>
                      <button onClick={()=>setSupCoursPage(p=>Math.max(1,p-1))} disabled={supCPageSafe===1}
                        style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:supCPageSafe===1?"#f1f5f9":"#fff", fontSize:12, cursor:supCPageSafe===1?"default":"pointer", color:supCPageSafe===1?"#cbd5e1":"#374151", fontWeight:600 }}>← Préc.</button>
                      {Array.from({length:supCTotalPages},(_,i)=>i+1).map(p=>(
                        <button key={p} onClick={()=>setSupCoursPage(p)}
                          style={{ padding:"4px 9px", borderRadius:7, border:`1.5px solid ${p===supCPageSafe?BET_COLOR:"#e2e8f0"}`, background:p===supCPageSafe?BET_COLOR:"#fff", fontSize:12, cursor:"pointer", color:p===supCPageSafe?"#fff":"#374151", fontWeight:p===supCPageSafe?800:400 }}>{p}</button>
                      ))}
                      <button onClick={()=>setSupCoursPage(p=>Math.min(supCTotalPages,p+1))} disabled={supCPageSafe===supCTotalPages}
                        style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:supCPageSafe===supCTotalPages?"#f1f5f9":"#fff", fontSize:12, cursor:supCPageSafe===supCTotalPages?"default":"pointer", color:supCPageSafe===supCTotalPages?"#cbd5e1":"#374151", fontWeight:600 }}>Suiv. →</button>
                      </>}
                    </div>
                  );

                  return (
                    <div>
                      {/* En-tête + filtre date + actualsier */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>🧩 Cours & modules créés par ce coach</div>
                          <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{totalModules} contenu{totalModules>1?"s":""} dont {totalPublies} publié{totalPublies>1?"s":""}</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          {/* Classe - les contenus visent plusieurs classes, le selecteur
                              ne liste que celles reellement touchees par ce coach. */}
                          {classesCours.length > 0 && (
                            <select value={supCoursClasse} onChange={e=>{ setSupCoursClasse(e.target.value); setSupCoursPage(1); }}
                              style={{ padding:"4px 8px", borderRadius:7, border:`1.5px solid ${supCoursClasse?BET_COLOR:"#e2e8f0"}`, fontSize:12, color:"#374151", background:"#fff", fontWeight:supCoursClasse?700:400 }}>
                              <option value="">🏫 Toutes les classes ({coachCours.length})</option>
                              {classesCours.map(cl => (
                                <option key={cl} value={cl}>
                                  {cl} ({coachCours.filter(c => (c.groupe_noms||[]).includes(cl)).length})
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Mois / annee : ecrit la plage « du - au » ci-contre. */}
                          <select value={moisActifC ? moisActifC.m : ""}
                            onChange={e=>poserMoisC(e.target.value === "" ? "" : Number(e.target.value),
                                                    moisActifC ? moisActifC.y : anneesC[0])}
                            style={{ padding:"4px 8px", borderRadius:7, border:`1.5px solid ${moisActifC?BET_COLOR:"#e2e8f0"}`, fontSize:12, color:"#374151", background:"#fff", fontWeight:moisActifC?700:400 }}>
                            <option value="">📅 Mois</option>
                            {MOIS_LIB_C.map((lib, k) => <option key={k} value={k}>{lib}</option>)}
                          </select>
                          <select value={moisActifC ? moisActifC.y : ""}
                            onChange={e=>poserMoisC(moisActifC ? moisActifC.m : new Date().getMonth(),
                                                    e.target.value === "" ? "" : Number(e.target.value))}
                            style={{ padding:"4px 8px", borderRadius:7, border:`1.5px solid ${moisActifC?BET_COLOR:"#e2e8f0"}`, fontSize:12, color:"#374151", background:"#fff", fontWeight:moisActifC?700:400 }}>
                            <option value="">Année</option>
                            {anneesC.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>

                          <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>Du</span>
                          <input type="date" value={supCoursDateFrom} onChange={e=>{ setSupCoursDateFrom(e.target.value); setSupCoursPage(1); }}
                            style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
                          <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>au</span>
                          <input type="date" value={supCoursDateTo} onChange={e=>{ setSupCoursDateTo(e.target.value); setSupCoursPage(1); }}
                            style={{ padding:"4px 8px", borderRadius:7, border:"1.5px solid #e2e8f0", fontSize:12, color:"#374151", background:"#fff" }} />
                          {(supCoursDateFrom||supCoursDateTo||supCoursClasse) && (
                            <button onClick={()=>{ setSupCoursDateFrom(""); setSupCoursDateTo(""); setSupCoursClasse(""); setSupCoursPage(1); }}
                              style={{ padding:"3px 9px", borderRadius:7, border:"1.5px solid #fca5a5", background:"#fef2f2", fontSize:12, color:"#b91c1c", cursor:"pointer", fontWeight:600 }}>✕</button>
                          )}
                          <button onClick={()=>fetchCoachCours(coach.id)} style={{ padding:"5px 12px", borderRadius:7, border:"1.5px solid #e5e7eb", background:"#fff", cursor:"pointer", fontSize:12, color:"#374151" }}>🔄 Actualiser</button>
                        </div>
                      </div>

                      {coachCoursLoading && <div style={{ textAlign:"center", padding:40, color:"#9ca3af", fontSize:13 }}>Chargement des cours…</div>}
                      {!coachCoursLoading && coachCours.length === 0 && (
                        <div style={{ textAlign:"center", padding:40, background:"#f8fafc", borderRadius:12, border:"1px dashed #e5e7eb", color:"#9ca3af" }}>
                          <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                          <div style={{ fontWeight:600, color:"#374151", marginBottom:4 }}>Aucun cours créé</div>
                          <div style={{ fontSize:12 }}>Ce coach n'a pas encore créé de cours e-learning.</div>
                        </div>
                      )}
                      {!coachCoursLoading && coachCours.length > 0 && coursFiltres.length === 0 && (
                        <div style={{ textAlign:"center", padding:40, background:"#fff7ed", borderRadius:12, border:"1px dashed #fed7aa", color:"#9ca3af" }}>
                          <div style={{ fontSize:32, marginBottom:8 }}>🗓️</div>
                          <div style={{ fontWeight:600, color:"#374151", marginBottom:8 }}>
                            Aucun cours {supCoursClasse ? `pour « ${supCoursClasse} »` : ""}{(supCoursDateFrom||supCoursDateTo) ? " sur cette période" : ""}
                          </div>
                          <button onClick={()=>{ setSupCoursDateFrom(""); setSupCoursDateTo(""); setSupCoursClasse(""); setSupCoursPage(1); }}
                            style={{ padding:"6px 16px", borderRadius:8, border:"none", background:BET_COLOR, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:12 }}>Effacer le filtre</button>
                        </div>
                      )}
                      {!coachCoursLoading && coursFiltres.length > 0 && (
                        <>
                          <SupCPagBar />
                          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                                {supCPageItems.map(c => {
                                  // Le niveau « Cours » a été supprimé : un CONTENU est
                                  // l'unité, il vise plusieurs classes et porte ses parties
                                  // (blocs). Les champs emoji/couleur/niveau/modules_list
                                  // appartenaient au cours et valent désormais undefined.
                                  const tm = ({ lecon:{e:"📖",l:"Leçon",c:"#2563eb"}, audio:{e:"🎧",l:"Audio",c:"#7c3aed"}, video:{e:"🎬",l:"Vidéo",c:"#dc2626"} })[c.type_contenu]
                                    || { e:"📚", l:"Contenu", c:BET_COLOR };
                                  const nbBlocs = (c.blocs || []).length;
                                  const classes = c.groupe_noms || [];
                                  const publie  = c.statut === "publie";
                                  return (
                                    <div key={c.id}
                                      onClick={()=>setContenuOuvert(c)}
                                      title="Voir le contenu intégral"
                                      style={{ background:"#fff", border:`2px solid ${tm.c}30`, borderRadius:14, overflow:"hidden", cursor:"pointer", transition:"box-shadow .15s, transform .15s" }}
                                      onMouseEnter={e=>{ e.currentTarget.style.boxShadow=`0 4px 16px ${tm.c}30`; e.currentTarget.style.transform="translateY(-1px)"; }}
                                      onMouseLeave={e=>{ e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="none"; }}>
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
                                          <div style={{ marginTop:4, color:tm.c, fontWeight:700 }}>Ouvrir →</div>
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
                          <SupCPagBar />
                        </>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        );
      })()}

      </div>
      <FooterSaaS couleurTheme={BET_COLOR} />
    </div>
  );
}
