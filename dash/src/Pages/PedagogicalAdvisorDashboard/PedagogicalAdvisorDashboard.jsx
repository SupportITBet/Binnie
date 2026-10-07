// src/Pages/PedagogicalAdvisorDashboard/PedagogicalAdvisorDashboard.jsx
import React, { useState, useMemo, useEffect, useCallback } from "react";
// Même source que la commerciale et l'espace apprenant : trois copies divergeaient.
import { statutMoisEcran as getMoisStatutPA } from "../../utils/planMensuel";
import { useNavigate } from "react-router-dom";
import { useTabState } from "../../hooks/useTabState";
import { supabase } from "../../config/supabase";
import { clearAllSessionStorage } from "../../utils/session";
import { openElearningSSO } from "../../utils/ssoElearning";
import toast from "react-hot-toast";
import NotificationBell from "../../Components/NotificationBell";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import NotificationsTab from "../../Components/NotificationsTab";
import BarreFiltres, { RangeePastilles, RangeeChamps, champFiltre } from "../../Components/BarreFiltres";
import { useNotifPoller } from "../../hooks/useNotifPoller";
import { useNotifications } from "../../hooks/useNotifications";
import { useFirebaseChat } from "../../hooks/useFirebaseChat";
import { useNouveauteBadge } from "../../hooks/useNouveauteBadge";
import ProspectChatPanel from "../../Components/ProspectChatPanel";
import MessagerieTab from "../../Components/MessagerieTab";
import { useLanguage } from "../../contexts/LanguageContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import FooterSaaS from "../../Components/FooterSaaS";
import { assombrirCouleur } from "../../utils/couleurs";
import { exporterExcelStyle } from "../../utils/exporterExcel";
import { genererPDF, fmtDatePDF } from "../../utils/genererPDF";
import { useLivePermissions } from "../../utils/permissions";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";
import { libelleMoisSolde } from "../../utils/moisDuVersement";
import { dureeReelleMin, dureePrevueMin } from "../../Components/DerouleReel";
import { exporterAppraisalCoachs } from "../../utils/exporterAppraisalCoachs";
import ChatGroupe from "../../Components/ChatGroupe";
import GroupesLibres from "../../Components/GroupesLibres";
import { useGroupesLibresNonLus } from "../../hooks/useGroupeChat";
import { useGroupesChatUnreadTotal } from "../../hooks/useGroupeChat";

import SeanceDetailModal from "../../Components/SeanceDetailModal";
import { uploadFichier } from "../../utils/uploadFichier";
import NomAvecSurnom from "../../Components/NomAvecSurnom";
import VisionneuseImage from "../../Components/VisionneuseImage";
import EvaluationsApprenants from "../../Components/EvaluationsApprenants";
import EvaluationsParents from "../../Components/EvaluationsParents";
import BadgeCategorieCoach from "../../Components/BadgeCategorieCoach";
import { LIBELLES_CRITERES, libelleLecon, libelleObservation, libelleInternet } from "../../utils/criteresObservation";
import { CATEGORIES_COACH, CATEGORIE_SANS_NOTE, categorieCoach } from "../../utils/categorieCoach";
import { NOTE_COULEUR as NOTE_COULEUR_CAT, NOTE_FOND as NOTE_FOND_CAT } from "../../utils/categorieCoach";
import { estClassePrivee } from "../../utils/classePrivee";
import HistoriqueTestsNiveau, { useHistoriqueTests, lignesTestsPourPDF } from "../../Components/HistoriqueTestsNiveau";
/* ═══════════════════════════════════════════════════════
   CHARTE COULEURS - Pedagogical Advisor (violet)
═══════════════════════════════════════════════════════ */
const ELEARNING_URL = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";
// Couleurs d'une note sur 5 : alignees sur les seuils des categories de contrat, pour
// que le cercle et le badge ne disent jamais deux choses differentes du meme coach.
const NOTE_COUL = NOTE_COULEUR_CAT;
const NOTE_FOND = NOTE_FOND_CAT;
const NOTE_TEND_COUL = t => t === "hausse" ? "#16a34a" : t === "baisse" ? "#ef4444" : "#94a3b8";
const NOTE_TEND_ICO  = t => t === "hausse" ? "↗" : t === "baisse" ? "↘" : "→";

const PA_COLOR    = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur||"#7c3aed"; } catch { return "#7c3aed"; } })();
const PA_DARK     = PA_COLOR;
// « prive » est la convention BET pour une classe de coaching prive EN LIGNE : le type
// doit donc se lire comme « en ligne », et la capacite 1 comme le marqueur « prive ».
const paEstPrive  = (g) => estClassePrivee(g) || g?.type_cours === "prive";
const paCadreType = (g, t) => t === "en_ligne"  ? (g?.type_cours === "en_ligne" || g?.type_cours === "prive")
                            : t === "presentiel" ? (g?.type_cours === "presentiel" || g?.type_cours === "centre")
                            : g?.type_cours === t;
const paLibelleType = (g) => paCadreType(g, "en_ligne") ? "💻 En ligne"
                           : g?.type_cours === "domicile" ? "🏠 Domicile"
                           : paCadreType(g, "presentiel") ? "🏢 Présentiel" : "-";
const PA_LIGHT    = PA_COLOR + "18";
const PA_GRADIENT = `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(PA_COLOR)} 100%)`;
const FF          = "'Inter','Segoe UI',sans-serif";

/* ═══════════════════════════════════════════════════════
   DISPONIBILITÉS COACH (table coach_disponibilites - renseignée par le coach
   CHAQUE MOIS depuis son espace, jamais un planning hebdomadaire fixe)
═══════════════════════════════════════════════════════ */
const MOIS_LABELS_DISPO = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const JOURS_ORDRE_DISPO = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
// Mois en cours + mois suivant (avec bascule d'année en décembre) - un coach peut renseigner
// ses disponibilités du mois prochain en avance, donc on prépare toujours les deux périodes.
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
   COMPOSANTS RÉUTILISABLES
═══════════════════════════════════════════════════════ */
const StatCard = ({ label, value, color, icon, sub, onClick }) => (
  <div onClick={onClick} style={{ background:"#fff", padding:18, borderRadius:14, boxShadow:"0 2px 8px rgba(0,0,0,.06)", display:"flex", alignItems:"center", gap:14, cursor:onClick?"pointer":"default", border:"1px solid #f1f5f9", transition:"transform .15s, box-shadow .15s" }}
    onMouseOver={e => { if(onClick) e.currentTarget.style.transform="translateY(-2px)"; }}
    onMouseOut={e => { e.currentTarget.style.transform="none"; }}
  >
    <div style={{ width:50, height:50, borderRadius:12, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{icon}</div>
    <div>
      <div style={{ fontSize:11, color:"#9ca3af", fontWeight:600, textTransform:"uppercase", letterSpacing:".04em" }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);

const Badge = ({ label, color, bg }) => (
  <span style={{ display:"inline-block", padding:"3px 10px", borderRadius:99, fontSize:10, fontWeight:700, color, background:bg, whiteSpace:"nowrap" }}>{label}</span>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}>
    <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.2)", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h3 style={{ margin:0, fontSize:17, fontWeight:800, color:"#0f172a" }}>{title}</h3>
        <button onClick={onClose} style={{ background:"#f1f5f9", border:"none", borderRadius:8, width:32, height:32, fontSize:16, cursor:"pointer", color:"#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const Section = ({ title, children, action }) => (
  <div style={{ background:"#fff", borderRadius:14, padding:"20px 22px", boxShadow:"0 2px 8px rgba(0,0,0,.06)", border:"1px solid #f1f5f9" }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
      <h4 style={{ margin:0, fontSize:14, fontWeight:800, color:"#0f172a" }}>{title}</h4>
      {action}
    </div>
    {children}
  </div>
);

const Input = ({ label, ...props }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
    {label && <label style={{ fontSize:12, fontWeight:700, color:"#374151" }}>{label}</label>}
    <input style={{ padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", fontFamily:FF }} {...props} />
  </div>
);

const Select = ({ label, children, ...props }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
    {label && <label style={{ fontSize:12, fontWeight:700, color:"#374151" }}>{label}</label>}
    <select style={{ padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", fontFamily:FF, background:"#fff" }} {...props}>
      {children}
    </select>
  </div>
);

const Btn = ({ children, onClick, color = PA_COLOR, outline, small, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: outline ? "transparent" : color,
    color: outline ? color : "#fff",
    border: `1.5px solid ${color}`,
    borderRadius: 8, padding: small ? "6px 12px" : "9px 18px",
    fontSize: small ? 12 : 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? .6 : 1, fontFamily: FF, whiteSpace:"nowrap",
    transition:"all .15s",
  }}>{children}</button>
);

const ProgressBar = ({ value, color = PA_COLOR }) => (
  <div style={{ height:7, background:"#e5e7eb", borderRadius:999, overflow:"hidden" }}>
    <div style={{ height:"100%", width:`${Math.min(100,value)}%`, background:color, borderRadius:999, transition:"width .4s" }} />
  </div>
);

function EcheancePicker({ tranche, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(tranche.date_echeance || "");
  if (!editing) return (
    <button onClick={() => setEditing(true)} title="Modifier l'échéance" style={{ background:"#e0f2fe", border:"1px solid #bae6fd", borderRadius:6, padding:"4px 8px", fontSize:12, cursor:"pointer" }}>📅</button>
  );
  return (
    <div style={{ display:"flex", gap:4 }}>
      <input type="date" value={val} onChange={e=>setVal(e.target.value)} style={{ padding:"3px 6px", border:"1.5px solid #0891b2", borderRadius:6, fontSize:11 }} />
      <button onClick={async()=>{await onSave(val);setEditing(false);}} style={{ background:"#0891b2", color:"#fff", border:"none", borderRadius:6, padding:"4px 8px", fontSize:11, cursor:"pointer" }}>✓</button>
      <button onClick={()=>setEditing(false)} style={{ background:"#e5e7eb", border:"none", borderRadius:6, padding:"4px 8px", fontSize:11, cursor:"pointer" }}>✕</button>
    </div>
  );
}

/* ── Plan mensuel helpers ─────────────────────────────────────────────────── */
const MOIS_FR_PA = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const getMoisLabelPA  = (p) => { const [y,m]=p.split("-"); return `${MOIS_FR_PA[parseInt(m,10)-1]} ${y}`; };
// Jour d'échéance ancré sur le vrai jour de départ (ex: démarré le 20 → dû le 20 chaque
// mois), pas toujours le 1er - clampé au dernier jour du mois si celui-ci est plus court.

function AddTrancheForm({ onAdd }) {
  const [form, setForm] = React.useState({ label:"", montant:"", date_echeance:"" });
  const [saving, setSaving] = React.useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const canSubmit = form.label.trim() && form.montant && form.date_echeance;
  const handleAdd = async () => {
    if (!canSubmit) return;
    setSaving(true);
    await onAdd({ label:form.label.trim(), montant:Number(form.montant), date_echeance:form.date_echeance, notes:null });
    setForm({ label:"", montant:"", date_echeance:"" });
    setSaving(false);
  };
  return (
    <div style={{ padding:"14px", background:"#f8fafc", borderRadius:10, border:"1.5px dashed #cbd5e1" }}>
      <div style={{ fontSize:12, fontWeight:800, color:"#374151", marginBottom:10 }}>+ Ajouter une tranche</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
        <input placeholder="Label (ex: Acompte)" value={form.label} onChange={e=>set("label",e.target.value)} style={{ padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
        <input type="number" placeholder="Montant (FCFA)" value={form.montant} onChange={e=>set("montant",e.target.value)} style={{ padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
        <input type="date" value={form.date_echeance} onChange={e=>set("date_echeance",e.target.value)} style={{ padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none" }} />
      </div>
      <button onClick={handleAdd} disabled={!canSubmit||saving} style={{ padding:"8px 18px", background:PA_COLOR, color:"#fff", border:"none", borderRadius:7, fontWeight:700, fontSize:12, cursor:canSubmit?"pointer":"not-allowed", opacity:canSubmit?1:.5 }}>
        {saving?"Ajout…":"+ Ajouter la tranche"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DONNÉES MOCK
═══════════════════════════════════════════════════════ */
const NIVEAUX = ["A1","A2","B1","B2","C1","C2"];

// Normalise les horaires existants : s'assure que h.jour est toujours un code court valide
const JOUR_SHORT_NORMALIZE = {
  "lun":"Lun","mar":"Mar","mer":"Mer","jeu":"Jeu","ven":"Ven","sam":"Sam","dim":"Dim",
  "lundi":"Lun","mardi":"Mar","mercredi":"Mer","jeudi":"Jeu","vendredi":"Ven","samedi":"Sam","dimanche":"Dim"
};
const VALID_JOURS_COURTS = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const normalizeHoraires = (horaires) => {
  if (!Array.isArray(horaires)) return [];
  return horaires.map(h => {
    if (!h) return h;
    const jourKey = (h.jour || "").toLowerCase().trim();
    const normalized = JOUR_SHORT_NORMALIZE[jourKey];
    if (normalized) return { ...h, jour: normalized };
    if (VALID_JOURS_COURTS.includes(h.jour)) return h;
    return { ...h, jour: "Lun" };
  });
};


const STATUT_COURS = {
  actif:    { label:"Actif",    color:"#16a34a", bg:"#dcfce7" },
  terminé:  { label:"Terminé",  color:"#6b7280", bg:"#f3f4f6" },
  suspendu: { label:"Suspendu", color:"#f59e0b", bg:"#fef3c7" },
};

const STATUT_PROSPECT = {
  nouveau:    { label:"Nouveau",    color:"#0891b2", bg:"#e0f2fe",  icon:"🆕" },
  en_cours:   { label:"En cours",   color:"#f59e0b", bg:"#fef3c7",  icon:"⏳" },
  converti:   { label:"Converti",   color:"#22c55e", bg:"#dcfce7",  icon:"✅" },
  perdu:      { label:"Perdu",      color:"#ef4444", bg:"#fee2e2",  icon:"❌" },
};

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const FRONTEND_URL = process.env.REACT_APP_FRONTEND_URL || "http://localhost:3000";
const authHeaders = () => ({ "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("admin_token")}` });

const formatMoney = (v) => (v||0).toLocaleString("fr-FR") + " FCFA";
const formatDate  = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" }) : "-";

const CONTRAT_TYPE = {
  en_ligne:       { label:"En ligne",       icon:"💻", color:"#0891b2", bg:"#e0f2fe" },
  presentiel_bet: { label:"Présentiel BET", icon:"🏢", color:"#7c3aed", bg:"#ede9fe" },
  domicile:       { label:"À domicile",     icon:"🏠", color:"#d97706", bg:"#fef3c7" },
};
const CONTRAT_STATUT = {
  en_attente:   { label:"En attente",   color:"#d97706", bg:"#fef3c7" },
  actif:        { label:"Actif",        color:"#16a34a", bg:"#dcfce7" },
  suspendu:     { label:"Suspendu",     color:"#6b7280", bg:"#f3f4f6" },
  termine:      { label:"Terminé",      color:"#475569", bg:"#f1f5f9" },
  renouvele:    { label:"Renouvelé",    color:"#7c3aed", bg:"#ede9fe" },
  non_renouvele:{ label:"Non renouvelé",color:"#dc2626", bg:"#fee2e2" },
};
const CONTRAT_FORM_INIT = { apprenant_nom:"", apprenant_prenom:"", apprenant_email:"", apprenant_telephone:"", type_contrat:"en_ligne", niveau:"B1", objectif:"", prix_h:"", nb_seances_total:"", duree_seance_h:"1.5", date_debut:"", date_fin:"", note:"" };

/* ═══════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
═══════════════════════════════════════════════════════ */
export default function PedagogicalAdvisorDashboard() {
  const navigate  = useNavigate();
  const profilInitial = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const { profil, peut } = useLivePermissions(profilInitial);
  const [msgSubTab, setMsgSubTab] = useState("prive");
  const prenom    = profil?.prenom || "";
  const nom       = profil?.nom    || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "Pedagogical Advisor";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "PA";

  const [accesElearning, setAccesElearning] = useState(profil?.acces_elearning === true);
  const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
  const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";

  const { lang, toggleLang } = useLanguage();
  const confirm = useConfirm();
  const handleLogout = async () => {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    clearAllSessionStorage();
    navigate("/bet-staff-access", { replace:true });
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
        if (freshColor && freshColor !== PA_COLOR) window.location.reload();
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  useNotifPoller({ userId: profil?.id, sources: ["cours_prives"] });

  useEffect(() => {
    fetch(`${API_URL}/api/coachs`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(() => {})
      .catch(() => {});
  }, []); // eslint-disable-line

  /* ── États principaux ── */
  const [activeTab, setActiveTab] = useTabState("dashboard");
  const [paChatTarget, setPaChatTarget] = useState(null); // { uid, nom, role, photo, ts }
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
  const [cours,     setCours]     = useState([]);

  /* ── Prospects domicile (depuis l'API) ── */
  const [prospects,        setProspects]        = useState([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);

  const [prospectSearch,   setProspectSearch]   = useState("");
  const [prospectFiltreStatut, setProspectFiltreStatut] = useState("tous");
  const [prospectModal,    setProspectModal]    = useState(null);
  const [prospectActionLoading, setProspectActionLoading] = useState(new Set());
  const [prospectDossier,  setProspectDossier]  = useState({ niveau:"", duree_mois:"", formation:"", type_coaching:"classique", lieu:"cabinet", cout_formation:"", adresse_coaching:"", centre_coaching:"", disponibilites:{ jours:[], creneaux:[] }, date_debut:"" });
  const [savingDossier,    setSavingDossier]    = useState(false);
  const [paCatalogueOffres, setPaCatalogueOffres] = useState([]);

  const paCentresList = (() => {
    const FALLBACK = [
      { key:"angre",    name:"BET Angré" },
      { key:"bouake",   name:"BET Bouaké" },
      { key:"plateaux", name:"BET II Plateaux" },
      { key:"yopougon", name:"BET Yopougon" },
      { key:"koumassi", name:"BET Koumassi" },
      { key:"abatta",   name:"BET Abatta" },
    ];
    try {
      const s = localStorage.getItem("bet_centres_master");
      if (s) {
        const parsed = JSON.parse(s);
        const actifs = parsed.filter(c => c.actif !== false).map(c => ({ key: c.key, name: c.name }));
        return actifs.length ? actifs : FALLBACK;
      }
    } catch {}
    return FALLBACK;
  })();

  // ── Mini test de niveau ──────────────────────────────
  const [miniTest,         setMiniTest]         = useState(null);    // questions chargées
  const [miniTestLoading,  setMiniTestLoading]  = useState(false);
  const [miniTestAnswers,  setMiniTestAnswers]  = useState({});      // { qIndex: optionIndex }
  const [miniTestStep,     setMiniTestStep]     = useState("idle");  // "idle"|"running"|"result"
  const [miniTestResult,   setMiniTestResult]   = useState(null);    // { score, pct, level }
  // ── Modal "Test de niveau" (envoi du lien + vérification auto) ──────
  const [showTestNiveauModal, setShowTestNiveauModal] = useState(false);
  const [verifyingTestResult, setVerifyingTestResult] = useState(false);

  const verifierResultatTest = async (email) => {
    if (!email) { toast.error("Aucun email pour ce prospect"); return; }
    setVerifyingTestResult(true);
    try {
      const r = await fetch(`${API_URL}/api/level-test/result?email=${encodeURIComponent(email)}`);
      const d = await r.json();
      if (d?.result?.level) {
        setProspectDossier(prev => ({ ...prev, niveau: d.result.level }));
        toast.success(`✅ Niveau ${d.result.level} récupéré depuis le test passé`);
      } else {
        toast("⏳ Ce prospect n'a pas encore passé le test de niveau.");
      }
    } catch { toast.error("Erreur lors de la vérification"); }
    finally { setVerifyingTestResult(false); }
  };

  const SCORE_TO_CEFR = (pct) => {
    if (pct <= 20) return "A1";
    if (pct <= 40) return "A2";
    if (pct <= 58) return "B1";
    if (pct <= 74) return "B2";
    if (pct <= 88) return "C1";
    return "C2";
  };
  const CEFR_COLOR = { A1:"#6b7280", A2:"#d97706", B1:"#2563eb", B2:"#7c3aed", C1:"#059669", C2:"#dc2626" };

  const launchMiniTest = async () => {
    setMiniTestLoading(true);
    setMiniTestAnswers({});
    setMiniTestResult(null);
    try {
      const r = await fetch(`${API_URL}/api/level-tests/actif`);
      const d = r.ok ? await r.json() : { test: null };
      const activeTest = d.test;
      // Filtrer questions QCM/vrai_faux uniquement, max 10 - champs réels de
      // level_questions (text/options/correct), pas de contenu fictif de repli :
      // si le test actif configuré par le staff n'a pas assez de questions
      // utilisables, on l'affiche honnêtement plutôt que de simuler un résultat.
      const qcmQs = activeTest?.level_questions
        ?.filter(q => q.type === "qcm" || q.type === "vrai_faux")
        ?.slice(0, 10) || [];
      if (qcmQs.length >= 3) {
        setMiniTest(qcmQs.map(q => ({
          question: q.text,
          options:  q.options || [],
          correct:  (q.options || []).indexOf(q.correct),
        })));
        setMiniTestStep("running");
      } else {
        setMiniTest(null);
        setMiniTestStep("unavailable");
      }
    } catch {
      setMiniTest(null);
      setMiniTestStep("unavailable");
    } finally {
      setMiniTestLoading(false);
    }
  };

  const finishMiniTest = () => {
    const questions = miniTest || [];
    if (!questions.length) return;
    let correct = 0;
    questions.forEach((q, i) => { if (miniTestAnswers[i] === q.correct) correct++; });
    const pct   = Math.round((correct / questions.length) * 100);
    const level = SCORE_TO_CEFR(pct);
    setMiniTestResult({ score: correct, total: questions.length, pct, level });
    setMiniTestStep("result");
  };

  const applyTestLevel = (level) => {
    setProspectDossier(prev => ({ ...prev, niveau: level }));
    setMiniTestStep("idle");
    setMiniTest(null);
    setMiniTestAnswers({});
    setMiniTestResult(null);
  };

  // Grille tarifaire coaching privé - chargée depuis plateforme_config (source unique,
  // partagée avec CommercialDashboard/SuperAdminDashboard) ; ces valeurs par défaut ne
  // servent que de filet de sécurité si le fetch échoue.
  const GRILLE_PRIVE_DEFAUT = {
    classique: { label:"Classique (3 séances × 2h/sem)", cabinet:150000, domicile:200000, en_ligne:100000 },
    intensive:  { label:"Intensive (5 séances/sem)",       cabinet:200000, domicile:300000, en_ligne:200000 },
  };
  const [GRILLE_PRIVE, setGrillePrive] = useState(GRILLE_PRIVE_DEFAUT);
  useEffect(() => {
    supabase.from("plateforme_config").select("valeur").eq("key","coaching_prive_config").maybeSingle()
      .then(({ data }) => { if (data?.valeur) setGrillePrive(data.valeur); })
      .catch(() => {});
  }, []);

  // Charger les offres du catalogue une seule fois
  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    fetch(`${API_URL}/api/admin/catalogue-offres`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { offres: [] })
      .then(d => setPaCatalogueOffres(d.offres || []))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProspects = useCallback(async () => {
    setProspectsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/parcours/assignations`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        setProspects(d.assignations || []);
      }
    } catch (e) { console.error("Chargement prospects PA:", e); }
    finally { setProspectsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === "prospects" || activeTab === "apprenants") fetchProspects();
  }, [activeTab, fetchProspects]);

  /* ── Coaching privé : validation/invalidation du dossier + routage final
     (cf. workflow "Cours Privé" - assistante choisie par le client, PA valide,
     paiement collecté par l'assistante, PA route ensuite vers Onboarding/Assistante) ── */
  const [invaliderTarget,   setInvaliderTarget]   = useState(null);
  const [invaliderMotif,    setInvaliderMotif]    = useState("");
  const [validationLoading, setValidationLoading] = useState(false);
  const [confirmValiderTarget, setConfirmValiderTarget] = useState(null); // dossier en attente de confirmation "Valider"
  const [preuvePaiementView,   setPreuvePaiementView]   = useState(null); // preuve_image (data URI ou lien) à afficher en grand
  const [confirmRouterTarget,  setConfirmRouterTarget]  = useState(null); // dossier en attente de confirmation "Router"

  /* ── FICHE DE RECHERCHE DE COACH ────────────────────────────────────────────
     Le PA reçoit un dossier privé et doit trouver le coach qui correspond. Il
     diffuse donc ce document à PLUSIEURS coachs, dont un seul sera retenu.

     L'OBJECTIF DU CLIENT A SA PROPRE SECTION, en tête et en toutes lettres :
     c'est sur lui qu'un coach reconnaît un dossier pour lui. Noyé dans un
     tableau à deux colonnes, il se lirait comme une ligne parmi quinze - alors
     que tout le reste (niveau, rythme, lieu) ne sert qu'à confirmer un choix
     déjà fait sur l'objectif.

     LA FICHE PORTE L'IDENTITÉ DU PROSPECT, décision assumée : les coachs
     prennent eux-mêmes contact. Elle devient donc un document diffusable
     contenant des coordonnées personnelles - d'où l'encart de confidentialité
     et le nom du conseiller émetteur : un document qui circule doit dire d'où
     il vient et à quoi il engage.

     MÊME TECHNIQUE QUE LE REÇU DE PAIEMENT ci-dessous : un modèle HTML
     imprimé dans une fenêtre, et non jsPDF. Ce document sort de l'entreprise ;
     il doit porter l'en-tête BET comme les reçus, et une mise en page HTML le
     permet là où autoTable ne produit que des tableaux. Les styles sont ceux
     du reçu, à l'identique - deux documents officiels de la même maison ne
     doivent pas avoir l'air de venir de deux logiciels différents.
  */
  const exporterFicheRechercheCoachPDF = (p) => {
    try {
      const sd  = p.suivi_demarrage || {};
      const ref = `BET-CCH-${String(p.id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      const now = new Date().toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" });
      const emetteur = [profil?.prenom, profil?.nom].filter(Boolean).join(" ") || "Conseiller pédagogique";

      const row = (lbl, val) => val == null || val === "" ? "" :
        `<tr><td class="lbl">${lbl}</td><td class="val">${val}</td></tr>`;

      const objectif = (p.objectif_client || "").trim();
      const lieu = { cabinet:"🏢 Au cabinet", domicile:"🏠 À domicile", en_ligne:"💻 En ligne" }[sd.lieu_coaching] || "-";
      const centre = paCentresList.find(c => c.key === sd.centre_coaching)?.name || sd.centre_coaching || "";

      const dsp = sd.disponibilites || {};
      const hor = Array.isArray(dsp.horaires) && dsp.horaires.length ? dsp.horaires : [];
      const leg = hor.length === 0 ? [...(dsp.jours || []), ...(dsp.creneaux || [])] : [];
      const creneaux = hor.length
        ? hor.map(h => `<span class="chip">${h.jour} ${h.debut}${h.fin ? `–${h.fin}` : ""}</span>`).join(" ")
        : (leg.length ? leg.map(j => `<span class="chip">${j}</span>`).join(" ") : "");

      const estEnfant = p.profil_type === "enfant";
      const nomApprenant = estEnfant
        ? ([p.prenom_enfant || sd.prenom_enfant, p.nom_enfant || sd.nom_enfant].filter(Boolean).join(" ") || p.prospect_nom)
        : p.prospect_nom;

      const w = window.open("", "_blank", "width=760,height=920");
      w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche de recherche de coach - ${nomApprenant || ref}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,sans-serif;margin:0;padding:40px;color:#1e293b;background:#fff}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #7c3aed;padding-bottom:20px;margin-bottom:28px}
        .logo{font-size:28px;font-weight:900;color:#7c3aed;letter-spacing:-1pxdisplay:flex;align-items:center;gap:11px}.logo::before{content:'';width:40px;height:40px;flex-shrink:0;background:#fff url('https://res.cloudinary.com/nvp7nxqp/image/upload/v1788473005/bet/branding/bet-logo.png') center / 28px 28px no-repeat;border-radius:9px;box-shadow:0 2px 7px rgba(0,0,0,.14)}
        .logo span{color:#0f172a}
        .logo-sub{font-size:11px;color:#6b7280;margin-top:4px;margin-left:51px}
        h2{margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a}
        .num{font-size:11px;color:#6b7280;margin-top:2px}
        section{margin-bottom:20px}
        .section-title{font-size:11px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;border-bottom:1px solid #ede9fe;padding-bottom:5px}
        table{width:100%;border-collapse:collapse}
        td{padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
        .lbl{color:#6b7280;font-weight:500;width:42%}
        .val{font-weight:600;color:#0f172a}
        .objectif{background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:12px;padding:18px 20px;margin-bottom:22px}
        .objectif .tag{display:inline-block;background:#ede9fe;color:#5b21b6;padding:4px 14px;border-radius:20px;font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px}
        .objectif .txt{font-size:15px;font-weight:700;color:#0f172a;line-height:1.55;white-space:pre-wrap}
        .objectif.vide{background:#fffbeb;border-color:#fde68a}
        .objectif.vide .tag{background:#fef3c7;color:#92400e}
        .objectif.vide .txt{font-size:13px;font-weight:600;color:#92400e}
        .chip{display:inline-block;background:#ede9fe;color:#5b21b6;padding:3px 11px;border-radius:20px;font-weight:700;font-size:11.5px;margin:2px 3px 2px 0}
        .confid{margin-top:26px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:11px 14px;font-size:10.5px;color:#b91c1c;line-height:1.6}
        .footer{margin-top:20px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center;line-height:1.7}
        @media print{body{padding:20px}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}}
      </style></head><body>
      <div class="header">
        <div>
          <div class="logo">BET<span>Languages</span></div>
          <div class="logo-sub">Centre de langues - Abidjan, Côte d'Ivoire</div>
          <div class="logo-sub" style="margin-top:2px">📧 contact@binniesenglish.com · 📞 +225 27 22 40 71 99</div>
        </div>
        <div style="text-align:right">
          <h2>FICHE DE RECHERCHE DE COACH</h2>
          <div class="num">N° ${ref}</div>
          <div class="num">Émise le ${now}</div>
        </div>
      </div>

      <div class="objectif${objectif ? "" : " vide"}">
        <div class="tag">🎯 Objectif du client</div>
        <div class="txt">${objectif || "Non renseigné — à obtenir auprès de l'assistante commerciale avant d'affecter un coach."}</div>
      </div>

      <section><div class="section-title">🎓 Besoin pédagogique</div><table>
        ${row("Niveau évalué",   sd.niveau_prospect || p.niveau_client)}
        ${row("Formation",       sd.formation_souhaitee || p.inscription_offre)}
        ${row("Rythme",          sd.type_coaching === "intensive" ? "Intensive - 5 séances/semaine" : "Classique - 3 séances × 2h/semaine")}
        ${row("Durée",           sd.nb_seances_souhaitees ? `${sd.nb_seances_souhaitees} mois` : null)}
        ${row("Date de début",   (p.date_debut_formation || sd.date_debut_formation)
                                   ? new Date(p.date_debut_formation || sd.date_debut_formation).toLocaleDateString("fr-FR")
                                   : null)}
      </table></section>

      <section><div class="section-title">📍 Lieu et disponibilités</div><table>
        ${row("Lieu du coaching", lieu)}
        ${row("Centre",           sd.lieu_coaching === "cabinet"  ? centre : null)}
        ${row("Adresse",          sd.lieu_coaching === "domicile" ? sd.adresse_coaching : null)}
        ${row("Créneaux",         creneaux || "Non renseignés")}
      </table></section>

      <section><div class="section-title">👤 Apprenant</div><table>
        ${row("Profil",          estEnfant ? "Enfant" : "Adulte")}
        ${row("Nom",             nomApprenant)}
        ${row("Âge",             estEnfant ? (p.age_enfant || sd.age_enfant) : null)}
        ${row("Classe",          estEnfant ? (p.niveau_classe_enfant || sd.niveau_classe_enfant) : null)}
        ${row("Contact parent",  estEnfant ? p.nom_parent : null)}
        ${row("Téléphone",       estEnfant ? (p.telephone_parent || p.prospect_telephone) : p.prospect_telephone)}
        ${row("E-mail",          estEnfant ? (p.email_parent || p.prospect_email) : p.prospect_email)}
      </table></section>

      <div class="confid">
        🔒 Document interne — émis par ${emetteur}. Il contient les coordonnées d'un prospect qui n'est pas encore client :
        à ne transmettre qu'aux coachs consultés pour ce dossier, et à ne pas rediffuser au-delà.
      </div>

      <div class="footer">
        Fiche générée automatiquement par le système BET Languages pour l'affectation d'un coach.<br/>
        BET Languages · Centre de langues agréé · Abidjan, Côte d'Ivoire<br/>
        contact@binniesenglish.com · +225 27 22 40 71 99
      </div>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
      w.document.close();
      toast.success("Fiche coach exportée en PDF");
    } catch (e) {
      console.error("Fiche recherche coach:", e);
      toast.error("Erreur lors de l'export de la fiche");
    }
  };

  const validerDossierPrive = async (p) => {
    if (validationLoading) return;
    setValidationLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/parcours/assignations/${p.id}/valider-prive`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ decision: "valide" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      toast.success(`✅ Dossier de ${p.prospect_nom} validé - l'assistante peut activer le paiement.`);
      setProspectModal(prev => prev?.id === p.id ? { ...prev, dossier_statut: "paiement_en_attente", motif_invalidation: null } : prev);
      setProspects(prev => prev.map(x => x.id === p.id ? { ...x, dossier_statut: "paiement_en_attente", motif_invalidation: null } : x));
      fetchProspects();
    } catch (e) { toast.error(e.message || "Erreur lors de la validation"); }
    finally { setValidationLoading(false); setConfirmValiderTarget(null); }
  };

  const confirmerInvalidation = async () => {
    if (!invaliderMotif.trim()) { toast.error("Le motif est requis"); return; }
    setValidationLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/parcours/assignations/${invaliderTarget.id}/valider-prive`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ decision: "invalide", motif: invaliderMotif.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      toast.success(`Dossier de ${invaliderTarget.prospect_nom} invalidé.`);
      setProspectModal(prev => prev?.id === invaliderTarget.id ? { ...prev, dossier_statut: "invalide", motif_invalidation: invaliderMotif.trim() } : prev);
      setInvaliderTarget(null); setInvaliderMotif("");
      fetchProspects();
    } catch (e) { toast.error(e.message || "Erreur lors de l'invalidation"); }
    finally { setValidationLoading(false); }
  };

  const routerDossierPrive = async (p) => {
    if (validationLoading) return;
    setValidationLoading(true);
    try {
      const isEnLigne = p.type_cours === "en_ligne";
      const body = isEnLigne ? { routing_statut: "onboarding_en_attente" } : { routing_statut: "assistante_a_traiter" };
      const r = await fetch(`${API_URL}/api/parcours/assignations/${p.id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur");
      toast.success(isEnLigne ? `${p.prospect_nom} transmis à l'Onboarding.` : `${p.prospect_nom} transmis à l'assistante pour finalisation.`);
      setProspectModal(prev => prev?.id === p.id ? { ...prev, routing_statut: body.routing_statut } : prev);
      setProspects(prev => prev.map(x => x.id === p.id ? { ...x, routing_statut: body.routing_statut } : x));
      fetchProspects();
    } catch (e) { toast.error(e.message || "Erreur lors de la transmission"); }
    finally { setValidationLoading(false); setConfirmRouterTarget(null); }
  };

  /* ── Apprenants privés entrants (routés par commerciale) ── */
  const [apprenantsEntrants,        setApprenantsEntrants]        = useState([]);
  const [apprenantsEntrantsLoading, setApprenantsEntrantsLoading] = useState(false);
  const [coachPickerTarget,         setCoachPickerTarget]         = useState(null); // apprenant en cours d'affectation
  const [coachPickerCoachId,        setCoachPickerCoachId]        = useState("");
  const [savingCoachAffect,         setSavingCoachAffect]         = useState(false);

  const fetchApprenantsEntrants = useCallback(async () => {
    setApprenantsEntrantsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/parcours/mes-apprenants-pa`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setApprenantsEntrants(d.apprenants || []); }
    } catch { /* silencieux */ }
    finally { setApprenantsEntrantsLoading(false); }
  }, []);

  useEffect(() => { fetchApprenantsEntrants(); }, []); // eslint-disable-line

  const handleAffecterCoachEntrant = async (apprenant) => {
    if (!apprenant || !coachPickerCoachId) return;
    setSavingCoachAffect(true);
    try {
      const coach = paCoachsList.find(c => String(c.id) === String(coachPickerCoachId));
      const r = await fetch(`${API_URL}/api/parcours/assignations/${apprenant.id}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ routing_statut: "pa_affecte", notes_coach: coach ? `Coach affecté: ${coach.prenom} ${coach.nom}` : undefined }),
      });
      if (r.ok) {
        setApprenantsEntrants(prev => prev.filter(a => a.id !== apprenant.id));
        toast.success(`✅ Coach affecté à ${apprenant.prospect_nom}`);
        setCoachPickerTarget(null);
        setCoachPickerCoachId("");
      } else { toast.error("Erreur lors de l'affectation"); }
    } catch { toast.error("Erreur réseau"); }
    finally { setSavingCoachAffect(false); }
  };

  /* ── Tous les contrats privés (pour onglet apprenants) ── */
  const [allContratsPrives,        setAllContratsPrives]        = useState([]);
  const [allContratsPrivesLoading, setAllContratsPrivesLoading] = useState(false);
  const fetchContratsPrives = () => {
    setAllContratsPrivesLoading(true);
    fetch(`${API_URL}/api/contrats-prives`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { contrats:[] })
      .then(d => { setAllContratsPrives(d.contrats || []); setCours(d.contrats || []); })
      .catch(() => {})
      .finally(() => setAllContratsPrivesLoading(false));
  };
  useEffect(() => { fetchContratsPrives(); }, []); // eslint-disable-line

  // ── Apprenants réels des groupes "coaching privé" (is_prive=true) ──────────
  // `contrats_prives` (au-dessus) est un système hérité, vide en production - les
  // coachings privés réels vivent aujourd'hui comme des `groupes` avec is_prive=true
  // + leurs `groupes_apprenants`. Sans ce fetch, le filtre "Privés" de l'onglet
  // Apprenants restait toujours vide alors que 9 coachings privés existent réellement.
  const [allApprenantsGroupes,        setAllApprenantsGroupes]        = useState([]);
  const [allApprenantsGroupesLoading, setAllApprenantsGroupesLoading] = useState(false);
  const fetchApprenantsGroupes = () => {
    setAllApprenantsGroupesLoading(true);
    fetch(`${API_URL}/api/groupes/apprenants`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { apprenants: [] })
      .then(d => setAllApprenantsGroupes(d.apprenants || []))
      .catch(() => {})
      .finally(() => setAllApprenantsGroupesLoading(false));
  };
  useEffect(() => { if (activeTab === "apprenants") fetchApprenantsGroupes(); }, [activeTab]); // eslint-disable-line

  // ── Vraies séances par classe (table unifiée `seances`) ──────────────────────
  // Sans ça, la colonne "Séances" de l'onglet Apprenants affichait 0/0 (privé) ou "-" (coaching
  // de groupe), même quand le coach avait bien enregistré des séances réelles - couvre les deux
  // types de lignes (parcours ET privé), pas seulement le coaching privé.
  const [paSeancesParGroupe, setPaSeancesParGroupe] = useState({});
  useEffect(() => {
    if (activeTab !== "apprenants") return;
    const groupeIdsPrives = allApprenantsGroupes
      .filter(ga => estClassePrivee(ga))
      .map(ga => ga.groupe_id);
    const groupeIdsParcours = prospects.filter(p => p.statut === "converti").map(p => p.groupe_id);
    const groupeIds = [...new Set([...groupeIdsPrives, ...groupeIdsParcours])].filter(Boolean);
    if (!groupeIds.length) return;
    const token = localStorage.getItem("admin_token");
    Promise.all(groupeIds.map(gid =>
      fetch(`${API_URL}/api/seances?groupe_id=${gid}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : { seances: [] })
        .then(d => ({ gid, seances: d.seances || [] }))
        .catch(() => ({ gid, seances: [] }))
    )).then(results => {
      const map = {};
      results.forEach(({ gid, seances }) => {
        map[gid] = {
          total: seances.length,
          realisees: seances.filter(s => s.statut === "realisee").length,
        };
      });
      setPaSeancesParGroupe(map);
    });
  }, [activeTab, allApprenantsGroupes, prospects]); // eslint-disable-line

  useEffect(() => {
    if (activeTab === "apprenants") fetchContratsPrives();
  }, [activeTab]); // eslint-disable-line


  const saveDossierProspect = async (prospectId) => {
    if (savingDossier) return;
    if (!prospectDossier.niveau || !prospectDossier.formation) {
      toast.error("Remplissez tous les champs du dossier"); return;
    }
    setSavingDossier(true);
    try {
      // Merger avec le suivi_demarrage existant pour ne pas écraser coach_id, pack_coaching, etc.
      const existing = prospects.find(p => p.id === prospectId)?.suivi_demarrage || {};
      const sd = {
        ...existing,
        niveau_prospect:       prospectDossier.niveau,
        nb_seances_souhaitees: prospectDossier.duree_mois ? Number(prospectDossier.duree_mois) : (existing.nb_seances_souhaitees || null),
        formation_souhaitee:   prospectDossier.formation,
        type_coaching:         prospectDossier.type_coaching || "classique",
        lieu_coaching:         prospectDossier.lieu          || "cabinet",
        cout_formation:        prospectDossier.cout_formation ? Number(prospectDossier.cout_formation) : null,
        adresse_coaching:      prospectDossier.lieu === "domicile" ? (prospectDossier.adresse_coaching || "") : null,
        centre_coaching:       prospectDossier.lieu === "cabinet"  ? (prospectDossier.centre_coaching  || null) : null,
        disponibilites:        prospectDossier.disponibilites || existing.disponibilites || { jours:[], creneaux:[] },
        date_debut_formation:  prospectDossier.date_debut    || existing.date_debut_formation || null,
      };
      const r = await fetch(`${API_URL}/api/parcours/assignations/${prospectId}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ suivi_demarrage: sd, date_debut_formation: prospectDossier.date_debut || null }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur");
      const updated = { suivi_demarrage: sd };
      setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, ...updated } : p));
      setProspectModal(prev => prev?.id === prospectId ? { ...prev, ...updated } : prev);
      toast.success("Dossier prospect mis à jour ✓");
    } catch (e) { toast.error(e.message || "Erreur lors de la sauvegarde"); }
    finally { setSavingDossier(false); }
  };

  const prospectsFiltered = useMemo(() => {
    // Les convertis sont devenus apprenants - ils n'apparaissent plus dans l'onglet prospects.
    // Un dossier annulé par l'assistante (bouton "❌ Annuler", statut "annule") ne doit pas non
    // plus rester affiché indéfiniment - même liste de statuts "annulé" que celle déjà utilisée
    // côté backend (anti-doublon dans parcours.js). "archivé" : doublon hors-canal consolidé par
    // un PA (cf. "Dossiers à réaffecter") - sans ça, les deux dossiers d'un même prospect
    // restaient visibles et modifiables ici indéfiniment, même après la décision du PA.
    const STATUTS_MASQUES = ["converti", "annule", "annulee", "refuse", "refusee", "archivé"];
    let list = prospects.filter(p => !STATUTS_MASQUES.includes(p.statut));
    if (prospectFiltreStatut !== "tous") list = list.filter(p => p.statut === prospectFiltreStatut);
    if (prospectSearch.trim()) {
      const q = prospectSearch.toLowerCase();
      list = list.filter(p =>
        (p.prospect_nom || "").toLowerCase().includes(q) ||
        (p.prospect_email || "").toLowerCase().includes(q) ||
        (p.prospect_telephone || "").includes(q)
      );
    }
    return list;
  }, [prospects, prospectFiltreStatut, prospectSearch]);

  /* ── Mes apprenants ── */
  const [apprenantModal,   setApprenantModal]   = useState(null);
  const [apprenantTab,     setApprenantTab]     = useState("infos");
  /* SES TESTS DE NIVEAU, chargés au niveau du composant et non dans le modal : l'export PDF
     en a besoin lui aussi, et un hook ne peut pas vivre dans la fonction de rendu du modal.
     La fiche n'affichait que `niveau_prospect` - un seul niveau, écrasé au test suivant. */
  const { historique: paTestsNiveau, chargement: paTestsNiveauLoading } = useHistoriqueTests({
    apiUrl: API_URL, authHeaders,
    assignationId: apprenantModal?.id || null,
    email: apprenantModal?.prospect_email || null,
  });
  const [accesCreesModal,  setAccesCreesModal]  = useState(null);  // credentials après conversion
  const [showMdpCrees,     setShowMdpCrees]     = useState(false); // toggle visibilité mdp
  const [showMdpAcces,     setShowMdpAcces]     = useState(false); // toggle dans onglet Accès
  const [renvoyerLoading,  setRenvoyerLoading]  = useState(false);
  const [editDispoAppr,    setEditDispoAppr]    = useState(false);
  const [selDispoAppr,     setSelDispoAppr]     = useState([]);
  const [savingDispoAppr,  setSavingDispoAppr]  = useState(false);
  // Notes/évaluations de classe (données par le coach) - modal apprenantModal
  const [appModalEvals,        setAppModalEvals]        = useState([]);
  const [appModalEvalsLoading, setAppModalEvalsLoading] = useState(false);
  const [appSearchQ,       setAppSearchQ]       = useState("");
  const [appNiveau,        setAppNiveau]        = useState("tous");
  const [appType,          setAppType]          = useState("tous");
  const [chatApprenant,    setChatApprenant]    = useState(null);
  /* ── Pagination ── */
  const [prospectPage,     setProspectPage]     = useState(1);
  const [apprenantPage,    setApprenantPage]    = useState(1);
  const [progNotes,        setProgNotes]        = useState({});
  const [addingSession,    setAddingSession]    = useState(false);
  const [sessionActionSaving, setSessionActionSaving] = useState(false);
  const [sessionForm,      setSessionForm]      = useState({ date:new Date().toISOString().slice(0,10), statut:"present" });
  const [progNote,         setProgNote]         = useState("");
  const [savingProgNote,   setSavingProgNote]   = useState(false);
  const [apprenantPaiements, setApprenantPaiements] = useState([]);
  const [loadingPaiements,   setLoadingPaiements]   = useState(false);
  const [versementForm,      setVersementForm]       = useState({ montant:"", date:new Date().toISOString().slice(0,10), mode:"Mobile Money", ref:"", notes:"", preuve:null });
  const [moisPayTargetPA,    setMoisPayTargetPA]     = useState(null); // { mois, plan } pour paiement inline d'un mois
  const [addingVersement,    setAddingVersement]    = useState(false);
  const [savingVersement,    setSavingVersement]    = useState(false);
  const [recuModal,          setRecuModal]          = useState(null);
  const ouvrirRecu = (versement, personne) => setRecuModal({
    num:        versement.ref_transaction || `REC-${String(versement.id||Date.now()).slice(-8).toUpperCase()}`,
    client:     personne?.prospect_nom || personne?.nom_complet || "",
    email:      personne?.prospect_email || personne?.email || "",
    telephone:  personne?.prospect_telephone || personne?.telephone || "",
    formation:  (personne?.suivi_demarrage||{}).formation_souhaitee || versement.offre || "Coaching Privé",
    centre:     (personne?.suivi_demarrage||{}).centre_coaching || "",
    montant:    Number(versement.montant_recu||0),
    date:       versement.date_paiement || "",
    mode:       versement.mode_paiement || "",
    ref:        versement.ref_transaction || "",
    notes:      versement.notes || "",
    moisLabel:  "",
  });
  // Séances & présences du coach (cours privés)
  const [paSeancesPrivees,   setPaSeancesPrivees]   = useState([]);
  const [paPresencesPrivees, setPaPresencesPrivees] = useState([]);
  const [paSeancesLoading,   setPaSeancesLoading]   = useState(false);

  /* ── Détail d'un apprenant en coaching privé (groupes is_prive=true) ── */
  const [priveDetailModal, setPriveDetailModal] = useState(null); // apprenant cible
  const [priveDetailTab,   setPriveDetailTab]   = useState("infos");

  /* ── Signaler un problème ── */
  const [plainteModal,     setPlainteModal]     = useState(null); // apprenant cible
  const [plainteForm,      setPlainteForm]      = useState({ objet:"", description:"", priorite:"normale" });
  const [plainteSaving,    setPlainteSaving]    = useState(false);
  const OBJETS_PLAINTE = [
    "Absence/retard du coach",
    "Qualité des cours insuffisante",
    "Problème de communication avec le coach",
    "Problème technique (cours en ligne)",
    "Facturation / paiement incorrect",
    "Non-respect des horaires",
    "Comportement inapproprié",
    "Contenu du cours non adapté",
    "Demande de remboursement",
    "Autre",
  ];
  const signalerPlainte = async () => {
    if (plainteSaving) return;
    if (!plainteForm.objet) { toast.error("Veuillez sélectionner un objet"); return; }
    setPlainteSaving(true);
    try {
      const a = plainteModal;
      const isPrive = a._type === "prive";
      const body = {
        ref_type:            a._type || "general",
        ref_id:              String(a.id),
        apprenant_nom:       isPrive ? `${a.apprenant_prenom||""} ${a.apprenant_nom}`.trim() : (a.prospect_nom || ""),
        apprenant_email:     isPrive ? a.apprenant_email : a.prospect_email,
        apprenant_telephone: isPrive ? a.apprenant_telephone : a.prospect_telephone,
        coach_id:            isPrive ? a.coach_id : null,
        coach_nom:           isPrive ? (paCoachsList.find(c=>c.id===a.coach_id) ? `${paCoachsList.find(c=>c.id===a.coach_id).prenom} ${paCoachsList.find(c=>c.id===a.coach_id).nom}` : null) : null,
        objet:               plainteForm.objet,
        description:         plainteForm.description,
        priorite:            plainteForm.priorite,
      };
      const r = await fetch(`${API_URL}/api/plaintes`, { method:"POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      toast.success("Plainte signalée ✓ - transmise au Customer Care");
      setPlainteModal(null);
      setPlainteForm({ objet:"", description:"", priorite:"normale" });
    } catch { toast.error("Erreur lors du signalement"); }
    finally { setPlainteSaving(false); }
  };

  const fetchPaiementsApprenant = useCallback(async (assignationId) => {
    setLoadingPaiements(true);
    try {
      const r = await fetch(`${API_URL}/api/paiements/assignation/${assignationId}`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setApprenantPaiements(d.paiements || []); }
    } catch { /* silencieux */ }
    finally { setLoadingPaiements(false); }
  }, []);

  const fetchPaSeancesPresences = async (assignationId, groupeId, prospectNom, prospectEmail) => {
    if (!assignationId) return;
    setPaSeancesLoading(true);
    try {
      // groupeId (résolu côté backend via le lien note posé à la création de la classe)
      // est absent pour tout apprenant ajouté à son groupe sans ce lien - repli robuste
      // par email, indépendant de ce lien, même correctif que chargerEvalsApprenant. On en
      // profite aussi pour récupérer date_ajout (nécessaire pour ne pas afficher de séance
      // antérieure à l'arrivée de l'apprenant dans le groupe).
      let dateAjout = null;
      if (prospectEmail) {
        try {
          const rByEmail = await fetch(`${API_URL}/api/groupes/apprenant-by-email?email=${encodeURIComponent(prospectEmail)}`, { headers: authHeaders() });
          const dByEmail = await rByEmail.json();
          if (!groupeId) groupeId = dByEmail?.groupe?.id || null;
          dateAjout = dByEmail?.groupe?.date_ajout ? dByEmail.groupe.date_ajout.slice(0,10) : null;
        } catch {}
      }
      const [rs, rp] = await Promise.all([
        fetch(`${API_URL}/api/seances-privees?assignation_id=${assignationId}`,   { headers: authHeaders() }),
        fetch(`${API_URL}/api/presences-privees?assignation_id=${assignationId}`, { headers: authHeaders() }),
      ]);
      const ds = rs.ok ? await rs.json() : { seances: [] };
      const dp = rp.ok ? await rp.json() : { presences: [] };
      let seances = ds.seances || [];
      let presences = dp.presences || [];

      // Table unifiée `seances` (remplace seances_privees - le coach l'utilise désormais
      // pour toutes ses séances via groupe_id) : sans elle, une séance récente n'apparaît
      // pas ici alors qu'elle est bien comptée dans les honoraires du coach.
      if (groupeId) {
        const rNew = await fetch(`${API_URL}/api/seances?groupe_id=${groupeId}`, { headers: authHeaders() });
        if (rNew.ok) {
          const dNew = await rNew.json();
          const statutMap = { realisee:"effectuee", planifiee:"planifiee", annulee:"annulee" };
          const seancesNew = (dNew.seances || []).map(s => ({
            ...s,
            statut: (dateAjout && s.date_seance < dateAjout) ? "non_inscrit" : (statutMap[s.statut] || s.statut),
          }));
          const existingDates = new Set(seances.map(s => s.date_seance));
          seances = [...seances, ...seancesNew.filter(s => !existingDates.has(s.date_seance))];
        }

        // Présences de groupe (table `groupes_presences`, utilisée par le coach pour toutes
        // les classes de groupe) : jusqu'ici on ne lisait que `presences-privees` (coaching
        // privé uniquement), donc un apprenant en groupe n'affichait jamais aucune présence
        // réelle côté PA, ni dans "Séances" ni dans "Suivi assiduité".
        const rGp = await fetch(`${API_URL}/api/groupes/${groupeId}/presences`, { headers: authHeaders() });
        if (rGp.ok) {
          const dGp = await rGp.json();
          const nomRef = (prospectNom || "").trim().toLowerCase();
          const filtered = (dGp.presences || []).filter(p => {
            const nomComplet = `${p.prenom_apprenant||""} ${p.nom_apprenant||""}`.trim().toLowerCase();
            return nomComplet === nomRef;
          });
          const presencesGroupe = filtered.map(p => ({
            date_presence: p.date_seance, statut: p.statut, note: p.note,
          }));
          presences = [...presences, ...presencesGroupe];
        }
      }

      setPaSeancesPrivees(seances);
      setPaPresencesPrivees(presences);
    } catch {}
    finally { setPaSeancesLoading(false); }
  };

  const handleSaveVersement = async (a) => {
    if (savingVersement) return;
    if (!versementForm.montant) { toast.error("Montant requis"); return; }
    setSavingVersement(true);
    try {
      const r = await fetch(`${API_URL}/api/paiements/submit`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          client:         a.prospect_nom || "",
          email:          a.prospect_email || "",
          telephone:      a.prospect_telephone || "",
          offre:          (a.suivi_demarrage||{}).formation_souhaitee || "Cours domicile privé",
          inscription:    `Cours à domicile · Niveau ${(a.suivi_demarrage||{}).niveau_prospect||"?"} · ${(a.suivi_demarrage||{}).nb_seances_souhaitees||"?"} mois`,
          montant_du:     (a.suivi_demarrage||{}).cout_formation ? Number((a.suivi_demarrage||{}).cout_formation) : Number(versementForm.montant),
          montant_recu:   Number(versementForm.montant),
          date_paiement:  versementForm.date,
          mode_paiement:  versementForm.mode,
          statut:         "reçu",
          ref_transaction: versementForm.ref || null,
          notes:          versementForm.notes || null,
          assignation_id: a.id,
          preuve_image:   versementForm.preuve || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erreur");
      await fetchPaiementsApprenant(a.id);
      // Si un mois cible est actif, marquer ce mois comme payé dans le plan mensuel
      if (moisPayTargetPA) {
        const { moisId, plan: targetPlan } = moisPayTargetPA;
        const moisPaiements = (targetPlan?.mois_paiements || []).map(m => {
          if (m.id !== moisId) return m;
          const newTranche = { id:`t_${moisId}_${Date.now()}`, montant:Number(versementForm.montant), statut:"paye", date:versementForm.date };
          const allTranches = [...(m.tranches||[]).filter(t=>(t.statut==="paye"||t.statut==="payé")), newTranche];
          const totalPaye = allTranches.reduce((s,t)=>s+(t.montant||0),0);
          return { ...m, tranches:[...(m.tranches||[]).filter(t=>t.id!==newTranche.id), newTranche], statut: totalPaye>=m.montant ? "paye" : "partiel" };
        });
        await handleSavePlanPaiement(a.id, { ...targetPlan, mois_paiements:moisPaiements });
        setMoisPayTargetPA(null);
      }
      setRecuModal({
        num:        `REC-${Date.now().toString(36).toUpperCase()}`,
        client:     a.prospect_nom || "",
        email:      a.prospect_email || "",
        telephone:  a.prospect_telephone || "",
        formation:  (a.suivi_demarrage||{}).formation_souhaitee || "Coaching Privé",
        centre:     (a.suivi_demarrage||{}).centre_coaching || "",
        montant:    Number(versementForm.montant),
        date:       versementForm.date,
        mode:       versementForm.mode,
        ref:        versementForm.ref || "",
        notes:      versementForm.notes || "",
        moisLabel:  moisPayTargetPA?.label || "",
      });
      setVersementForm({ montant:"", date:new Date().toISOString().slice(0,10), mode:"Mobile Money", ref:"", notes:"", preuve:null });
      setAddingVersement(false);
      toast.success("Versement enregistré ✓");
    } catch (e) { toast.error(e.message || "Erreur"); }
    finally { setSavingVersement(false); }
  };

  const handleSavePlanPaiement = useCallback(async (id, plan_paiement) => {
    try {
      await fetch(`${API_URL}/api/parcours/assignations/${id}`, {
        method:"PATCH", headers:authHeaders(), body:JSON.stringify({ plan_paiement }),
      });
      setProspects(prev => prev.map(p => p.id === id ? { ...p, plan_paiement } : p));
      setApprenantModal(prev => prev?.id === id ? { ...prev, plan_paiement } : prev);
    } catch { toast.error("Erreur sauvegarde plan paiement"); }
  }, []);

  const handleSavePresencesPA = useCallback(async (id, suivi_presences) => {
    try {
      await fetch(`${API_URL}/api/parcours/assignations/${id}`, {
        method:"PATCH", headers:authHeaders(), body:JSON.stringify({ suivi_presences }),
      });
      setProspects(prev => prev.map(p => p.id === id ? { ...p, suivi_presences } : p));
      setApprenantModal(prev => prev?.id === id ? { ...prev, suivi_presences } : prev);
      toast.success("Suivi mis à jour ✓");
    } catch { toast.error("Erreur sauvegarde suivi présences"); }
  }, []);

  /* ── Groupes (consultation lecture seule) ── */
  const [paGroupes,          setPaGroupes]          = useState([]);
  const [paGroupesLoading,   setPaGroupesLoading]   = useState(false);
  const [paSelectedGroupe,   setPaSelectedGroupe]   = useState(null);
  const [paGroupeDetail,     setPaGroupeDetail]     = useState({ apprenants:[], fichiers:[] });
  const [paCoursListe,       setPaCoursListe]       = useState([]);
  const [paCoursLoading,     setPaCoursLoading]     = useState(false);
  const [paPresences,        setPaPresences]        = useState([]);
  const [paFiltreCoach,      setPaFiltreCoach]      = useState("tous");
  const [paFiltreSearch,     setPaFiltreSearch]     = useState("");
  const [paFiltreNiveau,     setPaFiltreNiveau]     = useState("tous");
  const [paFiltreStatut,     setPaFiltreStatut]     = useState("tous");
  const [paFiltreType,       setPaFiltreType]       = useState("tous");
  const [paFiltreCategorie,  setPaFiltreCategorie]  = useState("tous");
  const [paPeriodeDebut,     setPaPeriodeDebut]     = useState("");
  const [paPeriodeFin,       setPaPeriodeFin]       = useState("");
  const [paPage,             setPaPage]             = useState(1);
  const PA_PAGE_SIZE = 12;
  const [paAssignCoachId,    setPaAssignCoachId]    = useState("");
  const [paAssignLoading,    setPaAssignLoading]    = useState(false);
  const [paAssignSearch,     setPaAssignSearch]     = useState("");
  // Filtre par categorie de contrat lors de l'assignation : confier une classe sensible
  // a un coach « Needs Retraining » se decide, cela ne se decouvre pas en parcourant
  // 189 cartes. "" = toutes.
  const [paAssignCategorie,  setPaAssignCategorie]  = useState("");
  const [paAssignManuel,     setPaAssignManuel]     = useState(false);
  const [paAssignManuelNom,  setPaAssignManuelNom]  = useState("");
  const [paSubTab,           setPaSubTab]           = useState("apprenants");
  const [paSelectedApprenant,   setPaSelectedApprenant]   = useState(null);
  const [paApprenantTab,        setPaApprenantTab]        = useState("infos");
  const [paApprenantAssignation,setPaApprenantAssignation] = useState(null);
  const [paApprenantSeancesReelles, setPaApprenantSeancesReelles] = useState([]);
  const [paApprenantPresencesReelles, setPaApprenantPresencesReelles] = useState([]);
  const [paApprenantPresencesLoading, setPaApprenantPresencesLoading] = useState(false);
  const [paApprenantLoading,    setPaApprenantLoading]    = useState(false);
  const [paApprenantAccesInfo,  setPaApprenantAccesInfo]  = useState(null);
  const [paApprenantAccesLoad,  setPaApprenantAccesLoad]  = useState(false);
  // Accès du compte PARENT (profil_type="enfant" uniquement) - lecture seule.
  const [paApprenantParentAcces, setPaApprenantParentAcces] = useState(null);
  const [paApprenantAccesCreating, setPaApprenantAccesCreating] = useState(false);
  // Notes/évaluations de classe (données par le coach) - modal détail apprenant PA
  const [paApprenantEvals,        setPaApprenantEvals]        = useState([]);
  const [paApprenantEvalsLoading, setPaApprenantEvalsLoading] = useState(false);
  const [paCoursFiltreMois,  setPaCoursFiltreMois]  = useState(() => new Date().getMonth() + 1);
  const [paCoursAnnee,       setPaCoursAnnee]       = useState(() => new Date().getFullYear());
  const [paSessionsListe,    setPaSessionsListe]    = useState([]);
  const [paSessionsLoading,  setPaSessionsLoading]  = useState(false);
  const [paSessionsMoisFiltre,setPaSessionsMoisFiltre] = useState("");
  const [paSessionsPage,     setPaSessionsPage]     = useState(1);
  const PA_SESSIONS_PAR_PAGE = 15;
  const [paPresencesLoading, setPaPresencesLoading] = useState(false);
  const [paPresencesMoisFiltre, setPaPresencesMoisFiltre] = useState("");
  const [paPresencesPage,    setPaPresencesPage]    = useState(1);
  const PA_PRESENCES_PAR_PAGE = 10;
  const [paCloturModal,      setPaCloturModal]      = useState(false);
  // Réouverture d'une classe clôturée. La date de fin est redemandée plutôt que devinée :
  // la clôture avait posé la sienne, et la garder donnerait une classe « active mais
  // terminée » - avec, pour un coaching privé, un plan de paiement borné par cette date.
  const [paReouvrirModal,   setPaReouvrirModal]   = useState(false);
  const [paReouvrirDateFin, setPaReouvrirDateFin] = useState("");
  const [paReouvrirLoading, setPaReouvrirLoading] = useState(false);
  const [paCloturLoading,    setPaCloturLoading]    = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    setPaGroupesLoading(true);
    fetch(`${API_URL}/api/groupes`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { groupes:[] })
      .then(d => setPaGroupes(d.groupes || []))
      .catch(() => {})
      .finally(() => setPaGroupesLoading(false));
  }, []);

  const fetchPaGroupeDetail = async (groupe) => {
    const token = localStorage.getItem("admin_token");
    setPaSelectedGroupe(groupe);
    setPaSubTab(groupe.coach_id ? "apprenants" : "infos");
    setPaAssignCoachId(groupe.coach_id ? String(groupe.coach_id) : "");
    setPaAssignSearch("");
    setPaAssignManuel(false);
    setPaAssignManuelNom("");
    setPaCoursListe([]);
    setPaPresences([]);
    setPaSessionsListe([]);
    setPaSessionsMoisFiltre("");
    setPaSessionsPage(1);
    setPaPresencesMoisFiltre("");
    setPaPresencesPage(1);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${groupe.id}`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      setPaGroupeDetail({ groupe: d.groupe || null, apprenants: d.apprenants || [], fichiers: d.fichiers || [] });
    } catch {}
  };

  const fetchPaCours = async () => {
    if (!paSelectedGroupe) return;
    const token = localStorage.getItem("admin_token");
    setPaCoursLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${paSelectedGroupe.id}/cours?mois=${paCoursFiltreMois}&annee=${paCoursAnnee}`, { headers:{ Authorization:`Bearer ${token}` } });
      const d = await r.json();
      setPaCoursListe(d.cours || []);
    } catch {}
    finally { setPaCoursLoading(false); }
  };

  const fetchPaPresences = async () => {
    if (!paSelectedGroupe) return;
    const token = localStorage.getItem("admin_token");
    setPaPresencesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/groupes/${paSelectedGroupe.id}/presences`, { headers:{ Authorization:`Bearer ${token}` } });
      if (!r.ok) throw new Error("Erreur " + r.status);
      const d = await r.json();
      // Grouper le tableau plat par date_seance
      const flat = d.presences || [];
      const grouped = {};
      flat.forEach(p => {
        const key = p.date_seance;
        if (!grouped[key]) grouped[key] = { date: key, apprenants: [] };
        grouped[key].apprenants.push({ nom: p.nom_apprenant, prenom: p.prenom_apprenant, statut: p.statut, note: p.note });
      });
      setPaPresences(Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e) { console.error("[PA presences]", e.message); }
    finally { setPaPresencesLoading(false); }
  };

  const fetchPaSessions = async () => {
    if (!paSelectedGroupe) return;
    const token = localStorage.getItem("admin_token");
    setPaSessionsLoading(true);
    try {
      const [rLive, rCours] = await Promise.all([
        fetch(`${API_URL}/api/coachs/sessions-live/upcoming?groupe_id=${paSelectedGroupe.id}`, { headers:{ Authorization:`Bearer ${token}` } }),
        fetch(`${API_URL}/api/groupes/${paSelectedGroupe.id}/cours`, { headers:{ Authorization:`Bearer ${token}` } }),
      ]);
      const live  = rLive.ok  ? (await rLive.json()).sessions || [] : [];
      const cours = rCours.ok ? (await rCours.json()).cours   || [] : [];
      // Normaliser en format commun et fusionner
      const liveNorm  = live.map(s  => ({ ...s,  _type:"live",  _date: s.date       || "" }));
      const coursNorm = cours.map(c => ({ ...c,  _type:"cours", _date: c.date_cours  || "" }));
      const merged = [...liveNorm, ...coursNorm].sort((a, b) => b._date.localeCompare(a._date));
      setPaSessionsListe(merged);
      setPaSessionsPage(1);
      setPaSessionsMoisFiltre("");
    } catch (e) { console.error("[PA sessions]", e.message); }
    finally { setPaSessionsLoading(false); }
  };

  useEffect(() => {
    if (paSubTab === "presences" && paSelectedGroupe) fetchPaPresences();
    if (paSubTab === "sessions"  && paSelectedGroupe) fetchPaSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paSubTab, paSelectedGroupe, paCoursFiltreMois, paCoursAnnee]);

  /* ── Coachs (depuis API) ── */
  const [paCoachsList,         setPaCoachsList]         = useState([]);
  const [paCoachDispoMap,      setPaCoachDispoMap]      = useState({});
  const [paGroupeDispoMois,    setPaGroupeDispoMois]    = useState("courant"); // "courant" | "suivant"
  const [paPriveDispoMois,     setPaPriveDispoMois]     = useState("courant"); // "courant" | "suivant"
  const fetchPaCoachsDispos = async (coachIds) => {
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
      setPaCoachDispoMap(prev => {
        const next = { ...prev };
        results.forEach(({ id, mois, annee, slots }) => { next[`${id}_${mois}_${annee}`] = slots; });
        return next;
      });
    } catch {}
  };
  const [paCoachsLoading,      setPaCoachsLoading]      = useState(false);
  // ── Classement coachs (basé sur évaluations superviseurs) ──
  const [paCoachsVue,          setPaCoachsVue]          = useState("liste"); // "liste" | "classement"
  const [paClassement,         setPaClassement]         = useState([]);
  const [paClassementLoading,  setPaClassementLoading]  = useState(false);
  const [paEvalExpanded,            setPaEvalExpanded]            = useState(new Set());
  const [paCoachRapportsTransmis,   setPaCoachRapportsTransmis]   = useState([]);
  const [paCoachRapportsLoading,    setPaCoachRapportsLoading]    = useState(false);
  const [paRapportExpanded,         setPaRapportExpanded]         = useState(new Set());
  // Vue globale : TOUS les rapports transmis au PA
  const [paAllRapports,             setPaAllRapports]             = useState([]);
  const [paAllRapportsLoading,      setPaAllRapportsLoading]      = useState(false);
  const [paAllRapportExpanded,      setPaAllRapportExpanded]      = useState(new Set());
  const [paAllRapportCoachFilter,   setPaAllRapportCoachFilter]   = useState("");
  const [paAllRapportDateFrom,      setPaAllRapportDateFrom]      = useState("");
  const [paAllRapportDateTo,        setPaAllRapportDateTo]        = useState("");
  const [paRapportSubTab,           setPaRapportSubTab]           = useState("rapports");
  const [paClassementPeriode,       setPaClassementPeriode]       = useState("semaine");

  const [paSelectedCoach,      setPaSelectedCoach]      = useState(null);
  const [paCoachGroupes,       setPaCoachGroupes]       = useState([]);
  const [paCoachGroupesLoading,setPaCoachGroupesLoading] = useState(false);
  const [paCoachHonMois,       setPaCoachHonMois]       = useState(null);
  const [paCoachHonAnnee,      setPaCoachHonAnnee]      = useState(null);
  const [paCoachCours,         setPaCoachCours]         = useState([]);
  const [paCoachCoursLoading,  setPaCoachCoursLoading]  = useState(false);
  const [paCoachSearch,        setPaCoachSearch]        = useState("");
  // Filtre par categorie de contrat de l'onglet Coachs - partage par les deux vues
  // (Liste et Classement) : un filtre qui se reinitialiserait en basculant de l'une a
  // l'autre obligerait a le reposer a chaque bascule. "" = toutes.
  const [paCoachCategorie,     setPaCoachCategorie]     = useState("");
  const [paCoachModalTab,      setPaCoachModalTab]      = useState("infos");
  const [evalDateFrom,         setEvalDateFrom]         = useState("");
  const [evalDateTo,           setEvalDateTo]           = useState("");
  const [evalPage,             setEvalPage]             = useState(1);
  const EVAL_PER_PAGE = 5;
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
  const [paHonorairesGroupes,      setPaHonorairesGroupes]      = useState([]);
  const [paHonorairesGroupesLoading, setPaHonorairesGroupesLoading] = useState(false);
  const [paHonMois,            setPaHonMois]            = useState(null);
  const [paHonAnnee,           setPaHonAnnee]           = useState(null);
  const [paHonModalCoach,      setPaHonModalCoach]      = useState(null);
  const [paHonConfirm,         setPaHonConfirm]         = useState(false);

  // ── Onglet Transmission RH (réel - honoraires_mois / seances) ──────────
  const [trCoachs,        setTrCoachs]        = useState([]);
  const [trBulletins,     setTrBulletins]     = useState([]);
  const [trLoading,       setTrLoading]       = useState(false);
  const [trMois,          setTrMois]          = useState(new Date().getMonth()+1);
  const [trAnnee,         setTrAnnee]         = useState(new Date().getFullYear());
  const [trCalcEnCours,   setTrCalcEnCours]   = useState({});
  // Séances facturables du mois, par coach : sans ce décompte l'écran proposait de
  // calculer des fiches vides sans jamais dire lesquelles le seraient.
  const [trAFacturer,     setTrAFacturer]     = useState({ total_seances: 0, par_coach: {} });
  const [trLot,           setTrLot]           = useState(null);   // { fait, total } pendant un calcul en lot
  const [trRechCoach,     setTrRechCoach]     = useState("");
  const [trListeOuverte,  setTrListeOuverte]  = useState(false);
  const [trModal,         setTrModal]         = useState(null); // { hon, coachNom }
  const [trModalSeances,  setTrModalSeances]  = useState([]);
  const [trModalSeancesLoading, setTrModalSeancesLoading] = useState(false);
  const [trSeanceDetail,  setTrSeanceDetail]  = useState(null); // séance cliquée dans la liste - détail + présences
  const [trSeanceDetailPresences, setTrSeanceDetailPresences] = useState([]);
  const [trSeanceDetailPresencesLoading, setTrSeanceDetailPresencesLoading] = useState(false);
  const [trSeanceConfirm, setTrSeanceConfirm] = useState(null); // { seance, statut }
  const [trSeanceConfirmMotif, setTrSeanceConfirmMotif] = useState("");
  const [trConfirm,       setTrConfirm]       = useState(false); // confirm "Valider"
  const [trTransmisConfirm, setTrTransmisConfirm] = useState(false);
  const [trRefuseModal,   setTrRefuseModal]   = useState(false);
  const [trEdit,          setTrEdit]          = useState({ retenues:"", note_pa:"" });
  const [trActionEnCours, setTrActionEnCours] = useState(false);
  const [trSeanceActionEnCours, setTrSeanceActionEnCours] = useState({});
  const [trFlash,         setTrFlash]         = useState(null);

  // ── Onglet Accès du coach modal ──────────────────────────────
  const [paCoachAccesBloque,        setPaCoachAccesBloque]        = useState(false);
  const [paCoachAccesLoading,       setPaCoachAccesLoading]       = useState(false);
  const [paCoachBloqueRaison,       setPaCoachBloqueRaison]       = useState("");
  const [paCoachRemplForm,          setPaCoachRemplForm]          = useState({ remplacant_id:"", groupe_id:"", date_debut:"", date_fin:"", motif:"" });
  const [paCoachRemplSaving,        setPaCoachRemplSaving]        = useState(false);
  const [paCoachRemplacementsListe, setPaCoachRemplacementsListe] = useState([]);
  const [paCoachRemplSessions,      setPaCoachRemplSessions]      = useState([]);
  const [paCoachRemplSessionsLoading, setPaCoachRemplSessionsLoading] = useState(false);
  const [paCoachRemplSessionsSelec, setPaCoachRemplSessionsSelec] = useState([]); // IDs sélectionnés

  const fetchHonorairesGroupes = (mois, annee) => {
    setPaHonorairesGroupesLoading(true);
    // groupes_cours = source réelle des séances enregistrées par les coaches
    const params = new URLSearchParams();
    if (mois)  params.set("mois",  mois);
    if (annee) params.set("annee", annee);
    fetch(`${API_URL}/api/coachs/sessions-live/admin-all?${params}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { honoraires: [] })
      .then(d => setPaHonorairesGroupes(d.honoraires || []))
      .catch(() => {})
      .finally(() => setPaHonorairesGroupesLoading(false));
  };
  useEffect(() => {
    if (activeTab === "honoraires") fetchHonorairesGroupes(paHonMois, paHonAnnee);
  }, [activeTab, paHonMois, paHonAnnee]); // eslint-disable-line

  // ── Transmission RH (réel) ──────────────────────────────────────────────
  function fetchTrBulletins() {
    setTrLoading(true);
    fetch(`${API_URL}/api/seances/honoraires-mois?mois=${trMois}&annee=${trAnnee}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setTrBulletins(d.honoraires || []))
      .catch(() => setTrBulletins([])).finally(() => setTrLoading(false));
  }
  useEffect(() => {
    if (activeTab !== "honoraires" && activeTab !== "dashboard") return;
    fetch(`${API_URL}/api/seances/coachs`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setTrCoachs(d.coachs || [])).catch(() => {});
    fetch(`${API_URL}/api/seances/a-facturer?mois=${trMois}&annee=${trAnnee}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { total_seances: 0, par_coach: {} })
      .then(d => setTrAFacturer({ total_seances: d.total_seances || 0, par_coach: d.par_coach || {} }))
      .catch(() => setTrAFacturer({ total_seances: 0, par_coach: {} }));
    fetchTrBulletins();
    setTrRechCoach(""); setTrListeOuverte(false);
  }, [activeTab, trMois, trAnnee]); // eslint-disable-line

  useEffect(() => {
    if (!trModal) { setTrModalSeances([]); return; }
    setTrEdit({ retenues: trModal.hon.retenues || "", note_pa: trModal.hon.note_pa || "" });
    setTrModalSeancesLoading(true);
    fetch(`${API_URL}/api/seances/honoraires-mois/${trModal.hon.id}/seances`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setTrModalSeances(d.seances || []))
      .catch(() => setTrModalSeances([])).finally(() => setTrModalSeancesLoading(false));
  }, [trModal?.hon?.id]); // eslint-disable-line

  // Détail d'une séance cliquée (Créneau/Durée/Classe/Niveau/Montant + présences) - même
  // vue que celle déjà offerte au coach lui-même dans EspaceProfesseur.jsx, absente ici
  // jusqu'à présent (liste des séances non cliquable côté PA).
  useEffect(() => {
    if (!trSeanceDetail) { setTrSeanceDetailPresences([]); return; }
    setTrSeanceDetailPresencesLoading(true);
    fetch(`${API_URL}/api/seances/${trSeanceDetail.id}/presences`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setTrSeanceDetailPresences(d.presences || []))
      .catch(() => setTrSeanceDetailPresences([])).finally(() => setTrSeanceDetailPresencesLoading(false));
  }, [trSeanceDetail?.id]); // eslint-disable-line

  async function trCalculer(coach) {
    if (trCalcEnCours[coach.id]) return;
    setTrCalcEnCours(p => ({ ...p, [coach.id]: true }));
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/calculer`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ coach_id: coach.id, mois: trMois, annee: trAnnee }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur calcul");
      fetchTrBulletins();
      setTrFlash({ type:"ok", msg:`✅ Honoraires de ${coach.prenom||""} ${coach.nom||""} calculés.` });
    } catch (e) { setTrFlash({ type:"err", msg: e.message }); }
    finally { setTrCalcEnCours(p => ({ ...p, [coach.id]: false })); setTimeout(() => setTrFlash(null), 4000); }
  }

  /**
   * Calcule en une fois les fiches de plusieurs coachs.
   *
   * L'ancien écran offrait un bouton par coach - 186 clics et deux fois plus de requêtes
   * pour un mois complet. Le serveur fait désormais le tour et ne répond qu'une fois ;
   * la liste n'est rechargée qu'à la fin, pas après chaque coach.
   */
  async function trCalculerLot(coachs) {
    if (trLot || !coachs.length) return;
    setTrLot({ fait: 0, total: coachs.length });
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/calculer-lot`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ coach_ids: coachs.map(c => c.id), mois: trMois, annee: trAnnee }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur calcul en lot");

      setTrLot({ fait: coachs.length, total: coachs.length });
      const nbEchecs = (d.echecs || []).length;
      setTrFlash(nbEchecs
        ? { type: "err", msg: `${d.calcules} fiche(s) calculée(s), ${nbEchecs} en échec - fiche déjà transmise à la RH ?` }
        : { type: "ok",  msg: `✅ ${d.calcules} fiche${d.calcules > 1 ? "s" : ""} calculée${d.calcules > 1 ? "s" : ""}.` });
      fetchTrBulletins();
    } catch (e) {
      setTrFlash({ type: "err", msg: e.message });
    } finally {
      setTrLot(null);
      setTimeout(() => setTrFlash(null), 6000);
    }
  }

  function ficheHonorairesExportData() {
    const moisLabelTr = `${MOIS_LABELS[trMois]} ${trAnnee}`;
    const colonnes = [
      { label: "Date" }, { label: "Titre" }, { label: "Durée", align: "right" },
      { label: "Montant", align: "right" }, { label: "Statut" },
    ];
    const lignes = trModalSeances.map(s => [
      s.date_seance ? new Date(s.date_seance).toLocaleDateString("fr-FR") : "-",
      s.titre || "-",
      `${parseFloat(s.duree_h || 0).toFixed(1)}h`,
      `${Math.round(s.honoraire_montant || 0).toLocaleString("fr-FR")} FCFA`,
      s.honoraire_statut === "rejete" ? "Rejetée" : s.honoraire_statut === "valide" ? "Validée" : "En attente",
    ]);
    const sousTitre = `${trModal.hon.nb_seances || 0} séance(s) · ${(trModal.hon.total_heures || 0).toFixed(1)}h · Montant net : ${formatMoney(trModal.hon.montant_net ?? trModal.hon.montant_total)}`;
    return { titre: `Honoraires ${trModal.coachNom} - ${moisLabelTr}`, sousTitre, colonnes, lignes };
  }

  function grilleExporterExcel() {
    exporterExcelStyle({
      nomFichier: "grille_tarifaire",
      titre: "Grille tarifaire des honoraires",
      sousTitre: grilleUpdatedAt ? `Mise à jour ${formatDate(grilleUpdatedAt)}` : "",
      colonnes: [{ label:"Grade" }, ...TYPES_COURS.map(t => ({ label:`${t.label} (FCFA/h)`, align:"right" }))],
      lignes: GRADES.map(grade => [grade, ...TYPES_COURS.map(t => grille.tarifs?.[grade]?.[t.key] || 0)]),
      feuilles: [
        {
          nom: "Taux horaires",
          titre: "Grille tarifaire des honoraires",
          sousTitre: grilleUpdatedAt ? `Mise à jour ${formatDate(grilleUpdatedAt)}` : "",
          colonnes: [{ label:"Grade" }, ...TYPES_COURS.map(t => ({ label:`${t.label} (FCFA/h)`, align:"right" }))],
          lignes: GRADES.map(grade => [grade, ...TYPES_COURS.map(t => grille.tarifs?.[grade]?.[t.key] || 0)]),
        },
        {
          nom: "Multiplicateurs",
          titre: "Multiplicateurs par niveau",
          colonnes: [{ label:"Niveau" }, { label:"Multiplicateur", align:"right" }],
          lignes: NIVEAUX_GRP.map(niv => [niv, grille.multiplicateurs?.[niv] || 1]),
        },
        {
          nom: "Récapitulatif",
          titre: "Forfaits par séance - toutes combinaisons",
          colonnes: [{ label:"Grade" }, { label:"Niveau" }, ...TYPES_COURS.flatMap(t => DUREES.map(d => ({ label:`${t.label} ${d}h`, align:"right" })))],
          lignes: GRADES.flatMap(grade => NIVEAUX_GRP.map(niv => [grade, niv, ...TYPES_COURS.flatMap(t => DUREES.map(d => calcHonoraire(grade, t.key, niv, d)))])),
        },
      ],
    });
  }

  function grilleExporterPdf() {
    const tarifsLignes = GRADES.map(grade => `
      <tr><td>${grade}</td>${TYPES_COURS.map(t => `<td class="td-right">${(grille.tarifs?.[grade]?.[t.key]||0).toLocaleString("fr-FR")} FCFA</td>`).join("")}</tr>
    `).join("");
    const multLignes = NIVEAUX_GRP.map(niv => `
      <tr><td>${niv}</td><td class="td-right">× ${grille.multiplicateurs?.[niv] || 1}</td></tr>
    `).join("");
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Pédagogie</div><div class="doc-header-sub">Grille tarifaire des honoraires</div></div><div class="doc-header-right">${grilleUpdatedAt ? `Mise à jour ${fmtDatePDF(grilleUpdatedAt)}<br/>` : ""}Émis le ${fmtDatePDF(new Date().toISOString())}</div></div>
      <div class="doc-title-band">📊 GRILLE TARIFAIRE DES HONORAIRES</div>
      <div class="doc-body">
        <div class="section-title">Taux horaire de base (FCFA/heure)</div>
        <table><thead><tr><th>Grade</th>${TYPES_COURS.map(t=>`<th>${t.label}</th>`).join("")}</tr></thead>
        <tbody>${tarifsLignes}</tbody></table>
        <div class="section-title">Multiplicateurs par niveau</div>
        <table><thead><tr><th>Niveau</th><th>Multiplicateur</th></tr></thead>
        <tbody>${multLignes}</tbody></table>
        <div class="doc-footer"><span>BET · Grille tarifaire · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, "Grille tarifaire des honoraires");
  }

  function listeHonorairesExportData() {
    const moisLabelTr = `${MOIS_LABELS[trMois]} ${trAnnee}`;
    const colonnes = [
      { label: "Coach" }, { label: "Séances", align: "right" }, { label: "Heures", align: "right" },
      { label: "Montant brut", align: "right" }, { label: "Retenues", align: "right" },
      { label: "Montant net", align: "right" }, { label: "Statut" },
    ];
    const STATUT_LIB = { en_attente:"En attente", valide:"Validé", transmis:"Transmis", paye:"Payé", litige:"Litige" };
    const lignes = trBulletins.map(h => {
      const c = h.coach || {};
      return [
        `${c.prenom || ""} ${c.nom || ""}`.trim() || "-",
        h.nb_seances || 0,
        `${(h.total_heures || 0).toFixed(1)}h`,
        `${Math.round(h.montant_total || 0).toLocaleString("fr-FR")} FCFA`,
        `${Math.round(h.retenues || 0).toLocaleString("fr-FR")} FCFA`,
        `${Math.round(h.montant_net ?? h.montant_total ?? 0).toLocaleString("fr-FR")} FCFA`,
        STATUT_LIB[h.statut] || h.statut,
      ];
    });
    const totalNet = trBulletins.reduce((s,h)=>s+(h.montant_net??h.montant_total??0),0);
    const sousTitre = `${trBulletins.length} coach(s) · Total net : ${formatMoney(totalNet)}`;
    return { titre: `Honoraires - ${moisLabelTr}`, sousTitre, colonnes, lignes };
  }

  function trExporterListePdf() {
    const periode = `${MOIS_LABELS[trMois]} ${trAnnee}`;
    const STATUT_LIB = { en_attente:"En attente", valide:"Validé", transmis:"Transmis", paye:"Payé", litige:"Litige" };
    const totalNet = trBulletins.reduce((s,h)=>s+(h.montant_net??h.montant_total??0),0);
    const totalSeances = trBulletins.reduce((s,h)=>s+(h.nb_seances||0),0);
    const totalHeures  = trBulletins.reduce((s,h)=>s+(h.total_heures||0),0);
    const lignes = trBulletins.map(h => {
      const c = h.coach || {};
      return `
      <tr>
        <td>${`${c.prenom || ""} ${c.nom || ""}`.trim() || "-"}</td>
        <td class="td-right">${h.nb_seances||0}</td>
        <td class="td-right">${(h.total_heures||0).toFixed(1)}h</td>
        <td class="td-right">${Math.round(h.montant_total||0).toLocaleString("fr-FR")} FCFA</td>
        <td class="td-right">${Math.round(h.montant_net??h.montant_total??0).toLocaleString("fr-FR")} FCFA</td>
        <td><span class="badge badge-${h.statut==="paye"?"green":h.statut==="litige"?"red":h.statut==="transmis"?"blue":"orange"}">${STATUT_LIB[h.statut]||h.statut}</span></td>
      </tr>`;
    }).join("");
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Pédagogie</div><div class="doc-header-sub">Récapitulatif honoraires</div></div><div class="doc-header-right">Période : ${periode}<br/>Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">💰 HONORAIRES - TOUS LES COACHS - ${periode.toUpperCase()}</div>
      <div class="doc-body">
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#0EA5E9"><div class="kpi-val">${trBulletins.length}</div><div class="kpi-lbl">Coachs</div></div>
          <div class="kpi-card" style="border-top-color:#8B5CF6"><div class="kpi-val">${totalSeances}</div><div class="kpi-lbl">Séances</div></div>
          <div class="kpi-card" style="border-top-color:#0EA5E9"><div class="kpi-val">${totalHeures.toFixed(1)}h</div><div class="kpi-lbl">Heures</div></div>
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val">${Math.round(totalNet).toLocaleString("fr-FR")}</div><div class="kpi-lbl">Net total (FCFA)</div></div>
        </div>
        <div class="section-title">Détail par coach</div>
        <table><thead><tr><th>Coach</th><th>Séances</th><th>Heures</th><th>Brut</th><th>Net</th><th>Statut</th></tr></thead>
        <tbody>${lignes || '<tr><td colspan="6" style="text-align:center;color:#94A3B8">Aucune fiche</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Honoraires ${periode} · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, `Honoraires ${periode}`);
  }

  function trExporterListeExcel() {
    const d = listeHonorairesExportData();
    exporterExcelStyle({ nomFichier: `honoraires_${MOIS_LABELS[trMois]}_${trAnnee}`.replace(/\s+/g, "_"), ...d });
  }

  function trExporterPdf() {
    if (!trModal) return;
    const nom = trModal.coachNom;
    const periode = `${MOIS_LABELS[trMois]} ${trAnnee}`;
    const b = trModal.hon;
    const STATUT_LIB = { en_attente:"En attente", valide:"Validé (à envoyer)", transmis:"Transmis → RH", paye:"Payé", litige:"Litige" };
    const lignes = trModalSeances.map(s => `
      <tr${s.honoraire_statut==="rejete"?' style="opacity:0.5;text-decoration:line-through"':""}>
        <td>${s.date_seance ? new Date(s.date_seance).toLocaleDateString("fr-FR") : "-"}</td>
        <td>${s.titre||"-"}</td>
        <td class="td-right">${parseFloat(s.duree_h||0).toFixed(1)}h</td>
        <td class="td-right">${Math.round(s.honoraire_montant||0).toLocaleString("fr-FR")} FCFA</td>
      </tr>`).join("");
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Pédagogie</div><div class="doc-header-sub">Fiche d'honoraires</div></div><div class="doc-header-right">Période : ${periode}<br/>Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">💰 FICHE D'HONORAIRES - ${nom.toUpperCase()} - ${periode.toUpperCase()}</div>
      <div class="doc-body">
        <div class="section-title">Coach</div>
        <div class="info-grid">
          <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${nom}</span></div>
          <div class="info-row"><span class="info-label">Statut</span><span class="info-value">${STATUT_LIB[b.statut] || b.statut}</span></div>
        </div>
        <div class="section-title">Rémunération</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#0EA5E9"><div class="kpi-val">${b.nb_seances||0}</div><div class="kpi-lbl">Séances</div></div>
          <div class="kpi-card" style="border-top-color:#8B5CF6"><div class="kpi-val">${(b.total_heures||0).toFixed(1)}h</div><div class="kpi-lbl">Heures</div></div>
          <div class="kpi-card" style="border-top-color:#059669"><div class="kpi-val">${Math.round(b.montant_net??b.montant_total).toLocaleString("fr-FR")}</div><div class="kpi-lbl">Net (FCFA)</div></div>
        </div>
        <table><thead><tr><th>Rubrique</th><th>Montant</th></tr></thead><tbody>
          <tr><td>Montant brut</td><td class="td-right">${Math.round(b.montant_total).toLocaleString("fr-FR")} FCFA</td></tr>
          <tr><td>Retenues</td><td class="td-right" style="color:#DC2626">${b.retenues?`- ${Math.round(b.retenues).toLocaleString("fr-FR")} FCFA`:"Aucune"}</td></tr>
        </tbody><tfoot><tr><td>NET</td><td style="font-size:16px">${Math.round(b.montant_net??b.montant_total).toLocaleString("fr-FR")} FCFA</td></tr></tfoot></table>
        <div class="section-title">Détail des séances réalisées</div>
        <table><thead><tr><th>Date</th><th>Titre</th><th>Durée</th><th>Montant</th></tr></thead>
        <tbody>${lignes || '<tr><td colspan="4" style="text-align:center;color:#94A3B8">Aucune séance</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Fiche d'honoraires ${periode} · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, `Fiche honoraires ${nom} - ${periode}`);
  }

  function trExporterExcel() {
    if (!trModal) return;
    const d = ficheHonorairesExportData();
    exporterExcelStyle({ nomFichier: `honoraires_${trModal.coachNom}_${MOIS_LABELS[trMois]}_${trAnnee}`.replace(/\s+/g, "_"), ...d });
  }

  async function trValiderHon(honId, coachNom, statut = "valide") {
    if (trActionEnCours) return;
    setTrActionEnCours(true);
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/${honId}/statut`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ statut }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setTrBulletins(prev => prev.map(h => h.id === honId ? d.honoraire : h));
      const MSG = { valide:`✅ Honoraires de ${coachNom} validés (pas encore transmis).`, en_attente:`↩️ Honoraires de ${coachNom} remis en attente.` };
      setTrFlash({ type:"ok", msg: MSG[statut] || `Statut mis à jour pour ${coachNom}.` });
      setTrModal(m => m ? { ...m, hon: d.honoraire } : m);
      setTrConfirm(false);
    } catch (e) { setTrFlash({ type:"err", msg: e.message }); }
    finally { setTrActionEnCours(false); setTimeout(() => setTrFlash(null), 5000); }
  }

  async function trTransmettreHon() {
    if (trActionEnCours || !trModal) return;
    setTrActionEnCours(true);
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/${trModal.hon.id}/statut`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ statut:"transmis" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setTrBulletins(prev => prev.map(h => h.id === d.honoraire.id ? d.honoraire : h));
      setTrFlash({ type:"ok", msg:`📤 Honoraires de ${trModal.coachNom} transmis à la RH.` });
      setTrModal(m => m ? { ...m, hon: d.honoraire } : m);
      setTrTransmisConfirm(false);
    } catch (e) { setTrFlash({ type:"err", msg: e.message }); }
    finally { setTrActionEnCours(false); setTimeout(() => setTrFlash(null), 5000); }
  }

  async function trRefuserHon(note) {
    if (trActionEnCours || !trModal) return;
    setTrActionEnCours(true);
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/${trModal.hon.id}/statut`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ statut:"litige", note_pa: note }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setTrBulletins(prev => prev.map(h => h.id === d.honoraire.id ? d.honoraire : h));
      setTrFlash({ type:"ok", msg:`🚫 Honoraires de ${trModal.coachNom} marqués en litige.` });
      setTrModal(null); setTrRefuseModal(false);
    } catch (e) { setTrFlash({ type:"err", msg: e.message }); }
    finally { setTrActionEnCours(false); setTimeout(() => setTrFlash(null), 5000); }
  }

  async function trModifierHon() {
    if (trActionEnCours || !trModal) return;
    setTrActionEnCours(true);
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/${trModal.hon.id}/statut`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ statut: trModal.hon.statut, retenues: Number(trEdit.retenues)||0, note_pa: trEdit.note_pa }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setTrBulletins(prev => prev.map(h => h.id === d.honoraire.id ? d.honoraire : h));
      setTrModal(m => m ? { ...m, hon: d.honoraire } : m);
      setTrFlash({ type:"ok", msg:`✏️ Fiche de ${trModal.coachNom} mise à jour.` });
    } catch (e) { setTrFlash({ type:"err", msg: e.message }); }
    finally { setTrActionEnCours(false); setTimeout(() => setTrFlash(null), 5000); }
  }

  async function trValiderSeance(seanceId, statut, note) {
    if (trSeanceActionEnCours[seanceId]) return;
    setTrSeanceActionEnCours(p => ({ ...p, [seanceId]: true }));
    try {
      const r = await fetch(`${API_URL}/api/seances/${seanceId}/honoraire-statut`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ statut, note: note || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setTrModalSeances(prev => prev.map(s => s.id === seanceId ? { ...s, honoraire_statut: statut, honoraire_statut_note: note || null } : s));
      if (d.honoraire) {
        setTrBulletins(prev => prev.map(h => h.id === d.honoraire.id ? d.honoraire : h));
        setTrModal(m => m ? { ...m, hon: d.honoraire } : m);
      }
      setTrSeanceConfirm(null);
      setTrSeanceConfirmMotif("");
    } catch (e) { setTrFlash({ type:"err", msg: e.message }); setTimeout(() => setTrFlash(null), 5000); }
    finally { setTrSeanceActionEnCours(p => ({ ...p, [seanceId]: false })); }
  }

  const [paCoachDispoData,     setPaCoachDispoData]     = useState([]);
  const [paCoachDispoLoading,  setPaCoachDispoLoading]  = useState(false);
  const [paDispoMois,          setPaDispoMois]          = useState(() => new Date().getMonth() + 1);
  const [paDispoAnnee,         setPaDispoAnnee]         = useState(() => new Date().getFullYear());
  const [paCoachContrats,      setPaCoachContrats]      = useState([]);
  const [paCoachContratsLoading,setPaCoachContratsLoading] = useState(false);
  const [paShowContratForm,    setPaShowContratForm]    = useState(false);
  const [paContratEditId,      setPaContratEditId]      = useState(null);
  const [paContratSaving,      setPaContratSaving]      = useState(false);
  const [paContratForm,        setPaContratForm]        = useState(CONTRAT_FORM_INIT);

  const [paRemplacements,        setPaRemplacements]        = useState([]);
  const [paRemplacementsLoading, setPaRemplacementsLoading] = useState(false);
  const [paRemplModal,           setPaRemplModal]           = useState(null);
  const [paStatutsSessions,      setPaStatutsSessions]      = useState({});
  const [paAlertesAuto,          setPaAlertesAuto]          = useState([]);
  const [paRemplSelCoach,        setPaRemplSelCoach]        = useState(null);
  const [paRemplSessionsSelec,   setPaRemplSessionsSelec]   = useState([]);
  const [paRemplRefuseOuvert,    setPaRemplRefuseOuvert]    = useState(false);
  const [paRemplRefuseMotif,     setPaRemplRefuseMotif]     = useState("");
  const [paRemplConfirmAction,   setPaRemplConfirmAction]   = useState(null); // { type:'assign'|'refuse', coach?, motif? }
  const [paRemplAssignerLot,     setPaRemplAssignerLot]     = useState(false);

  // ── Modal "Remplacement définitif" (= suspension définitive avec transfert) ──
  const [paDefinitifOpen,     setPaDefinitifOpen]     = useState(false);
  const [paDefinitifStep,     setPaDefinitifStep]     = useState('choisir_coach'); // choisir_coach | transferer | termine
  const [paDefinitifCoachId,  setPaDefinitifCoachId]  = useState('');
  const [paDefinitifRaison,   setPaDefinitifRaison]   = useState('');
  const [paDefinitifItems,    setPaDefinitifItems]    = useState([]); // [{type:'groupe'|'classe', id, nom, niveau, nouveau_coach_id, motif}]
  const [paDefinitifLoading,  setPaDefinitifLoading]  = useState(false);
  const [paDefinitifErreur,   setPaDefinitifErreur]   = useState('');
  const [paDefinitifConfirm,  setPaDefinitifConfirm]  = useState(false);
  const [paDefinitifRecherche,setPaDefinitifRecherche]= useState('');

  // ── Filtres onglet Remplacements ────────────────────────────
  const [paRemplFiltreStatut,    setPaRemplFiltreStatut]    = useState('tous'); // tous | a_pourvoir | en_cours | planifie | termine | refuse
  const [paRemplFiltreRecherche, setPaRemplFiltreRecherche] = useState('');
  const [paRemplFiltreDateDebut, setPaRemplFiltreDateDebut] = useState('');
  const [paRemplFiltreDateFin,   setPaRemplFiltreDateFin]   = useState('');
  const [paRemplPage,            setPaRemplPage]            = useState(1);
  useEffect(() => { setPaRemplPage(1); }, [paRemplFiltreStatut, paRemplFiltreRecherche, paRemplFiltreDateDebut, paRemplFiltreDateFin]);

  // ── Modal "Remplacement manuel" ────────────────────────────
  const [paNewRemplOpen,         setPaNewRemplOpen]         = useState(false);
  const [paNewRemplSaving,       setPaNewRemplSaving]       = useState(false);
  const [paNewRemplForm,         setPaNewRemplForm]         = useState({ absent_id:"", groupe_id:"", remplacant_id:"", date_debut:"", date_fin:"", motif:"" });
  const [paNewRemplGroupes,      setPaNewRemplGroupes]      = useState([]);
  const [paNewRemplSessions,     setPaNewRemplSessions]     = useState([]);
  const [paNewRemplSessionsSelec,setPaNewRemplSessionsSelec]= useState([]);
  const [paNewRemplSessionsLoad, setPaNewRemplSessionsLoad] = useState(false);
  const [paNewRemplConfirm,      setPaNewRemplConfirm]      = useState(false);
  // Mode "transfert" - transfert DÉFINITIF d'une ou plusieurs classes vers un nouveau coach,
  // sans suspendre le compte du titulaire (contrairement à "Remplacement définitif", qui exige
  // de transférer TOUTES ses classes puis bloque son accès - trop large quand la PA veut juste
  // déplacer une ou deux classes précises). Réutilise PATCH /api/groupes/:id/suspendre-coach,
  // déjà existant, jamais branché à une UI dédiée jusqu'ici.
  const [paNewRemplMode,          setPaNewRemplMode]          = useState('delegation'); // delegation | transfert
  const [paNewRemplClassesSelec,  setPaNewRemplClassesSelec]  = useState([]);
  const [paNewRemplTransfertVers, setPaNewRemplTransfertVers] = useState('');

  useEffect(() => {
    if (!paRemplModal) return;
    setPaRemplSessionsSelec(paRemplModal.sessions_ids || []);
    setPaRemplSelCoach(paRemplModal.remplacant_id || null);
    setPaRemplRefuseOuvert(false);
    setPaRemplRefuseMotif("");
    setPaRemplConfirmAction(null);
    setPaRemplAssignerLot(false);
  }, [paRemplModal]);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    setPaCoachsLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/admin/utilisateurs?role=coach`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.ok?r.json():{utilisateurs:[]}),
      fetch(`${API_URL}/api/coachs/classement`,              { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.ok?r.json():{classement:[]}),
    ]).then(([uData, cData]) => {
      const classement = cData.classement || [];
      setPaClassement(classement);
      // On garde aussi le NOMBRE d'évaluations et la tendance : une moyenne de 4,5
      // fondée sur une seule observation ne vaut pas celle qui en résume douze, et le
      // PA doit pouvoir faire la différence avant d'assigner une classe.
      const statsMap = {};
      classement.forEach(c => {
        statsMap[String(c.id)] = {
          moyenne:        c.moyenne,
          nb_evaluations: c.nb_avec_note ?? c.nb_evaluations ?? 0,
          tendance:       c.tendance || "stable",
          // Les dernières notes, pour la petite barre de progression de la carte.
          historique:     Array.isArray(c.historique) ? c.historique : [],
        };
      });
      const coachs = (uData.utilisateurs || []).map(u => {
        const st = statsMap[String(u.id)] || {};
        return {
          ...u,
          moyenne:        st.moyenne ?? u.note_moyenne ?? null,
          nb_evaluations: st.nb_evaluations ?? 0,
          tendance:       st.tendance || "stable",
          historique:     st.historique || [],
        };
      });
      setPaCoachsList(coachs);
      fetchPaCoachsDispos(coachs.map(c => c.id));
    }).catch(e => console.warn("[PA coachs]", e)).finally(()=>setPaCoachsLoading(false));
  }, []); // eslint-disable-line

  const openPaCoachModal = (coach) => {
    setPaSelectedCoach(coach);
    setPaCoachModalTab("infos");
    setPaCoachContrats([]);
    setPaCoachGroupes([]);
    setEvalPage(1); setEvalDateFrom(""); setEvalDateTo("");
    setClassePage(1); setClasseDateFrom(""); setClasseDateTo("");
    setCoursPage(1); setCoursDateFrom(""); setCoursDateTo("");
    setHonorairePage(1);
    setPaCoachRapportsTransmis([]);
    setPaCoachDispoData([]);
    setPaEvalExpanded(new Set());
    setPaRapportExpanded(new Set());
    setPaShowContratForm(false);
    setPaContratEditId(null);
    const token = localStorage.getItem("admin_token");
    // Rapports Deputy transmis au PA
    setPaCoachRapportsLoading(true);
    fetch(`${API_URL}/api/coachs/${coach.id}/rapports-transmis`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.ok?r.json():{rapports:[]})
      .then(d=>setPaCoachRapportsTransmis(d.rapports||[]))
      .catch(()=>{})
      .finally(()=>setPaCoachRapportsLoading(false));
    setPaContratForm(CONTRAT_FORM_INIT);
    setPaCoachHonMois(null);
    setPaCoachHonAnnee(null);
    fetchPaCoachContrats(coach.id);
    fetchPaCoachGroupes(coach.id, null, null);
    setPaCoachCours([]);
    fetchPaCoachCours(coach.id);
    // Accès
    setPaCoachBloqueRaison("");
    setPaCoachAccesBloque(coach.acces_bloque || false);
    setPaCoachRemplForm({ remplacant_id:"", groupe_id:"", date_debut:"", date_fin:"", motif:"" });
    setPaCoachRemplSessions([]);
    setPaCoachRemplSessionsSelec([]);
    setPaCoachRemplacementsListe([]);
    // Charger les remplacements existants pour ce coach
    fetch(`${API_URL}/api/remplacements?absent_id=${coach.id}&plateforme=dash`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { remplacements: [] })
      .then(d => setPaCoachRemplacementsListe(d.remplacements || []))
      .catch(() => {});
  };

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
      const groupes = (dGroupes.groupes || []).map(g => ({
        ...g,
        nb_seances_realisees: seancesMap[String(g.id)] || 0,
      }));
      setPaCoachGroupes(groupes);
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

  const fetchPaRemplacements = async () => {
    setPaRemplacementsLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/remplacements?plateforme=dash`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        const remps = d.remplacements || [];
        setPaRemplacements(remps);
        // Resynchronise l'état "réalisée" des séances depuis la vraie source (table
        // séances) - sans ça, tout réapparaissait à 0% à chaque rechargement de page
        // même si le remplaçant avait réellement assuré les séances.
        setPaStatutsSessions(prev => {
          const next = { ...prev };
          remps.forEach(r2 => (r2.sessions_realisees_ids || []).forEach(id => { next[id] = "realisee"; }));
          return next;
        });
      }
    } catch {}
    finally { setPaRemplacementsLoading(false); }
  };

  useEffect(() => {
    if (activeTab !== "remplacements") return;
    fetchPaRemplacements();
    // La clôture d'une délégation peut se déclencher automatiquement côté serveur (dès que la
    // dernière séance couverte passe à "réalisée", voir traiterClotureSeanceRemplacement côté
    // Backend) pendant que cet onglet reste ouvert. Sans rafraîchissement périodique, le PA
    // Advisor continuait de voir "En cours" avec un bouton "Clôturer" manuel bien après la
    // clôture réelle - donnant l'impression, à tort, qu'il fallait cliquer pour finaliser.
    const intervalId = setInterval(fetchPaRemplacements, 30000);
    return () => clearInterval(intervalId);
  }, [activeTab]);

  // ── Helpers compatibilité CECR pour remplacements ────────────────────────
  const PA_REMP_ORDRE_CECR = ['A1','A2','B1','B2','C1','C2'];
  function paRemplExtraireNiveaux(str) { return (str||'').match(/[A-C][12]/g)||[]; }
  function paRemplNiveauCompat(profNiveaux, niveauGroupe) {
    const codes = paRemplExtraireNiveaux(profNiveaux);
    if (!codes.length||!niveauGroupe) return false;
    const iMin = PA_REMP_ORDRE_CECR.indexOf(codes[0]);
    const iMax = PA_REMP_ORDRE_CECR.indexOf(codes[codes.length-1]);
    const iCible = PA_REMP_ORDRE_CECR.indexOf(niveauGroupe);
    return iCible>=iMin && iCible<=iMax;
  }
  function paRemplNiveauDepuisGroupe(groupe) {
    const match = (groupe||'').match(/([A-C][12])/);
    if (match) return match[1];
    const g = (groupe||'').toLowerCase();
    if (g.includes('débutant')||g.includes('debutant')) return 'A1';
    if (g.includes('intermédiaire')||g.includes('intermediaire')) return 'B1';
    if (g.includes('avancé')||g.includes('avance')) return 'C1';
    return null;
  }
  function paRemplTypePublic(groupe) {
    const g = (groupe||'').toLowerCase();
    if (g.includes('kid')||g.includes('enfant')||g.includes('cp')||g.includes('cm')) return 'kids';
    if (g.includes('ado')||g.includes('junior')) return 'ados';
    if (g.includes('business')||g.includes('corporate')) return 'business';
    return 'general';
  }
  function paRemplScoreCompat(coach, groupe) {
    const niveauG = paRemplNiveauDepuisGroupe(groupe);
    const publicG = paRemplTypePublic(groupe);
    const spec    = (coach.specialite||coach.coach_info?.specialite||'').toLowerCase();
    const niveaux = coach.niveaux||coach.coach_info?.niveaux||'';
    let score = 0;
    if (niveauG && paRemplNiveauCompat(niveaux, niveauG)) score += 2;
    if (publicG==='kids'     && spec.includes('kid'))                        score += 1;
    if (publicG==='ados'     && (spec.includes('ado')||spec.includes('junior'))) score += 1;
    if (publicG==='business' && spec.includes('business'))                   score += 1;
    if (publicG==='general'  && spec.includes('general'))                    score += 1;
    return score;
  }
  function paRemplRaisons(coach, groupe) {
    const raisons = [];
    const niveauG = paRemplNiveauDepuisGroupe(groupe);
    const publicG = paRemplTypePublic(groupe);
    const spec    = (coach.specialite||coach.coach_info?.specialite||'').toLowerCase();
    const niveaux = coach.niveaux||coach.coach_info?.niveaux||'';
    const ev      = coach.evaluation||coach.coach_info?.evaluation||0;
    if (niveauG && paRemplNiveauCompat(niveaux, niveauG)) raisons.push(`Niveaux compatibles (${niveaux} couvre ${niveauG})`);
    if (publicG==='kids'     && spec.includes('kid'))          raisons.push('Spécialiste Kids English');
    if (publicG==='ados'     && (spec.includes('ado')||spec.includes('junior'))) raisons.push('Spécialiste Ados');
    if (publicG==='business' && spec.includes('business'))     raisons.push('Spécialiste Business English');
    if (publicG==='general'  && spec.includes('general'))      raisons.push('Spécialiste General English');
    if (ev>=4.5) raisons.push(`Évaluation excellente (${ev}/5)`);
    else if (ev>=4.0) raisons.push(`Bonne évaluation (${ev}/5)`);
    return raisons;
  }
  function paRemplNomCoach(c) {
    return c.prenom && c.nom ? `${c.prenom} ${c.nom}` : c.nom_complet || c.username || '';
  }

  const paSaveContrat = async () => {
    if (!paContratForm.apprenant_nom || !paContratForm.prix_h) {
      toast.error("Nom apprenant et prix/h sont requis"); return;
    }
    setPaContratSaving(true);
    try {
      const url = paContratEditId
        ? `${API_URL}/api/contrats-prives/${paContratEditId}`
        : `${API_URL}/api/contrats-prives`;
      const method = paContratEditId ? "PATCH" : "POST";
      const body = paContratEditId ? paContratForm : { ...paContratForm, coach_id: paSelectedCoach.id };
      const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      toast.success(paContratEditId ? "Contrat mis à jour ✓" : "Contrat créé ✓");
      setPaShowContratForm(false);
      setPaContratEditId(null);
      setPaContratForm(CONTRAT_FORM_INIT);
      fetchPaCoachContrats(paSelectedCoach.id);
    } catch { toast.error("Erreur sauvegarde contrat"); }
    finally { setPaContratSaving(false); }
  };

  /* ── Grille tarifaire ── */
  const GRADES       = ["Vacataire","CDD","CDI","Freelance"];
  const TYPES_COURS  = [
    { key:"en_ligne",   label:"En ligne",    icon:"💻" },
    { key:"presentiel", label:"Présentiel",  icon:"🏢" },
    { key:"hybride",    label:"Hybride",     icon:"⚡" },
    { key:"domicile",   label:"Domicile",    icon:"🏠" },
  ];
  const NIVEAUX_GRP  = ["A1-A2","B1-B2","C1-C2"];
  const DUREES       = [1, 1.5, 2];

  const GRILLE_DEFAULT = {
    tarifs: {
      "Vacataire": { en_ligne:5000,  presentiel:6500,  domicile:7500  },
      "CDD":       { en_ligne:6500,  presentiel:8000,  domicile:9000  },
      "CDI":       { en_ligne:8000,  presentiel:9500,  domicile:11000 },
      "Freelance": { en_ligne:6000,  presentiel:7500,  domicile:8500  },
    },
    multiplicateurs: { "A1-A2":1.0, "B1-B2":1.2, "C1-C2":1.5 },
  };

  const [grille,        setGrille]        = useState(GRILLE_DEFAULT);
  const [grilleLoading, setGrilleLoading] = useState(false);
  const [grilleSaving,  setGrilleSaving]  = useState(false);
  const [grilleEdited,  setGrilleEdited]  = useState(false);
  const [grilleUpdatedAt, setGrilleUpdatedAt] = useState(null);
  const [calcForm,      setCalcForm]      = useState({ grade:"CDI", type:"presentiel", niveau:"B1-B2", duree:1.5 });
  const [grilleModalOpen, setGrilleModalOpen] = useState(false);

  const fetchGrille = useCallback(async () => {
    setGrilleLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/parametres/grille_tarifaire`, { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        if (d.valeur) { setGrille(d.valeur); setGrilleUpdatedAt(d.updated_at); }
      }
    } catch {}
    finally { setGrilleLoading(false); }
  }, []);

  const saveGrille = async () => {
    if (grilleSaving) return;
    setGrilleSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/parametres/grille_tarifaire`, {
        method:"PUT", headers: authHeaders(), body: JSON.stringify({ valeur: grille }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      toast.success("Grille tarifaire sauvegardée ✓");
      setGrilleEdited(false);
      setGrilleUpdatedAt(new Date().toISOString());
    } catch (e) { toast.error(e.message || "Erreur sauvegarde"); }
    finally { setGrilleSaving(false); }
  };

  const setTarif = (grade, type, val) => {
    const n = parseInt(val, 10);
    setGrille(g => ({ ...g, tarifs: { ...g.tarifs, [grade]: { ...g.tarifs[grade], [type]: isNaN(n)?0:n } } }));
    setGrilleEdited(true);
  };

  const setMult = (niveau, val) => {
    const n = parseFloat(val);
    setGrille(g => ({ ...g, multiplicateurs: { ...g.multiplicateurs, [niveau]: isNaN(n)?1:n } }));
    setGrilleEdited(true);
  };

  const calcHonoraire = (grade, type, niveau, duree) => {
    const base = grille.tarifs?.[grade]?.[type] || 0;
    const mult = grille.multiplicateurs?.[niveau] || 1;
    return Math.round(base * duree * mult);
  };

  // Mapper niveau coach (A1,B2…) vers groupe
  const niveauToGroupe = (n) => {
    if (!n) return "A1-A2";
    if (["A1","A2"].includes(n)) return "A1-A2";
    if (["B1","B2"].includes(n)) return "B1-B2";
    return "C1-C2";
  };
  // Mapper typeSeance (présentiel / en ligne) vers clé
  const typeToKey = (t) => {
    if (!t) return "presentiel";
    if (t.toLowerCase().includes("ligne")) return "en_ligne";
    if (t.toLowerCase().includes("domicile")) return "domicile";
    return "presentiel";
  };

  useEffect(() => {
    if (activeTab === "honoraires") fetchGrille();
  }, [activeTab, fetchGrille]);

  useEffect(() => {
    if (activeTab !== "rapports-superviseur") return;
    const token = localStorage.getItem("admin_token");
    setPaAllRapportsLoading(true);
    fetch(`${API_URL}/api/coachs/rapports-transmis`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { rapports: [] })
      .then(d => setPaAllRapports(d.rapports || []))
      .catch(() => {})
      .finally(() => setPaAllRapportsLoading(false));
  }, [activeTab]); // eslint-disable-line

  /* ── Évaluations coaches reçues des parents ── */
  const [paEvaluations,    setPaEvaluations]    = useState([]);

  useEffect(() => {
    if (activeTab !== "evaluations") return;
    // Le composant EvaluationsParents charge sa propre liste ; celle-ci ne sert plus
    // qu'au badge de nouveaute de l'onglet.
    fetch(`${API_URL}/api/analytics/evaluations-coach`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { evaluations: [] })
      .then(d => setPaEvaluations(d.evaluations || []))
      .catch(() => {});
  }, [activeTab]); // eslint-disable-line

  /* ── Dossiers signalés "hors canal" à réaffecter ── */
  const [paReaffectations,        setPaReaffectations]        = useState([]);
  const [paReaffLoading,          setPaReaffLoading]           = useState(false);
  const [paAssistantesToutes,     setPaAssistantesToutes]      = useState([]);
  const [paReaffSelection,        setPaReaffSelection]         = useState({}); // notifId -> assistante_id choisie
  const [paReaffTransferEnCours,  setPaReaffTransferEnCours]   = useState(null); // notifId en cours de transfert
  const [paReaffSearch,           setPaReaffSearch]            = useState({}); // notifId -> texte de recherche assistante
  const [paReaffConfirm,          setPaReaffConfirm]           = useState(null); // { notif, assistante } en attente de confirmation
  const [paReaffDossiers,         setPaReaffDossiers]          = useState({}); // notifId -> { nouveau, ancien }
  const [paReaffDossiersLoading,  setPaReaffDossiersLoading]   = useState(false);
  const [paReaffDossierChoisi,    setPaReaffDossierChoisi]     = useState({}); // notifId -> "nouveau" | "ancien"

  const fetchReaffectations = () => {
    setPaReaffLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/notifications/mes-notifs?limit=50`, { headers: authHeaders() }).then(r => r.ok ? r.json() : { notifications: [] }),
      fetch(`${API_URL}/api/parcours/assistantes`, { headers: authHeaders() }).then(r => r.ok ? r.json() : { assistantes: [] }),
    ])
      .then(([notifD, assD]) => {
        const signalements = (notifD.notifications || []).filter(n => n.meta?.autre_assignation_id && !n.lu);
        setPaReaffectations(signalements);
        setPaAssistantesToutes(assD.assistantes || []);
        // Détail des deux dossiers (offres) concernés par chaque alerte, pour que
        // le PA voie concrètement ce qu'il tranche avant de choisir une assistante.
        setPaReaffDossiersLoading(true);
        Promise.all(signalements.map(n =>
          Promise.all([
            fetch(`${API_URL}/api/parcours/assignations/${n.meta.assignation_id}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : { assignation: null }),
            fetch(`${API_URL}/api/parcours/assignations/${n.meta.autre_assignation_id}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : { assignation: null }),
          ]).then(([nouveauD, ancienD]) => ({ notifId: n.id, nouveau: nouveauD.assignation || null, ancien: ancienD.assignation || null }))
        ))
          .then(results => {
            const map = {};
            results.forEach(r => { map[r.notifId] = { nouveau: r.nouveau, ancien: r.ancien }; });
            setPaReaffDossiers(map);
          })
          .catch(() => {})
          .finally(() => setPaReaffDossiersLoading(false));
      })
      .catch(() => {})
      .finally(() => setPaReaffLoading(false));
  };

  useEffect(() => {
    if (activeTab !== "reaffectations") return;
    fetchReaffectations();
  }, [activeTab]); // eslint-disable-line

  const transfererDossier = async (notif) => {
    const assistanteId = paReaffSelection[notif.id];
    if (!assistanteId) { toast.error("Choisissez une assistante"); return; }
    // Le PA choisit lequel des deux dossiers (nouveau ou existant) il réaffecte -
    // par défaut le nouveau, comme avant.
    const cible = paReaffDossierChoisi[notif.id] || "nouveau";
    const assignationCibleId = cible === "ancien" ? notif.meta.autre_assignation_id : notif.meta.assignation_id;
    // L'autre dossier (celui non choisi) est le doublon à consolider/archiver -
    // sans ça il continue d'exister indéfiniment côté ancienne assistante.
    const assignationDoublonId = cible === "ancien" ? notif.meta.assignation_id : notif.meta.autre_assignation_id;
    setPaReaffTransferEnCours(notif.id);
    try {
      const r = await fetch(`${API_URL}/api/parcours/assignations/${assignationCibleId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ assistante_id: assistanteId, assignation_doublon_id: assignationDoublonId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur serveur");
      await fetch(`${API_URL}/api/notifications/${notif.id}/lu`, { method: "PATCH", headers: authHeaders() }).catch(() => {});
      toast.success("Dossier transféré avec succès");
      setPaReaffectations(prev => prev.filter(n => n.id !== notif.id));
    } catch (e) {
      toast.error(e.message || "Erreur lors du transfert");
    } finally {
      setPaReaffTransferEnCours(null);
    }
  };

  /* ── Modals ── */
  const [modalCours,       setModalCours]       = useState(false);
  const [selectedCours,    setSelectedCours]    = useState(null);
  const [modalAttrib,      setModalAttrib]       = useState(false);
  const [modalValidation,  setModalValidation]   = useState(false);
  const [selectedApprenant, setSelectedApprenant] = useState(null);
  // Reprise des cours après une pause. Le mois de reprise est demandé explicitement : c'est
  // lui qui rebase le plan, et donc ce qui évite que les mensualités du creux réapparaissent
  // toutes en même temps le jour du retour.
  const [paRepriseModal,   setPaRepriseModal]   = useState(null);
  const [paRepriseMois,    setPaRepriseMois]    = useState(() => new Date().toISOString().slice(0,7));
  const [paRepriseLoading, setPaRepriseLoading] = useState(false);
  const [selectedCoach,     setSelectedCoach]     = useState(null);

  /* ── Formulaire nouveau cours ── */
  const FORM_COURS_INIT = { ...CONTRAT_FORM_INIT, coach_id:"" };
  const [formCours,       setFormCours]       = useState({ ...CONTRAT_FORM_INIT, coach_id:"" });
  const [creatingContrat, setCreatingContrat] = useState(false);
  const [validatingCoachId, setValidatingCoachId] = useState(null);
  const [validatingTout, setValidatingTout] = useState(false);
  const [remplActionLoading, setRemplActionLoading] = useState(new Set());
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [confirmingPaiementId, setConfirmingPaiementId] = useState(null);
  const [filtreCoachNiveau, setFiltreCoachNiveau] = useState("Tous");
  const [searchApprenant,   setSearchApprenant]   = useState("");
  const [moisValidation, setMoisValidation] = useState(() => {
    const n = new Date();
    return `${["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"][n.getMonth()]} ${n.getFullYear()}`;
  });

  /* ── KPIs ── */
  const stats = useMemo(() => {
    const groupesActifs  = paGroupes.filter(g => g.statut === "actif");
    const actifs         = groupesActifs.length || allContratsPrives.filter(c => c.statut === "actif").length;
    const coachesActifs  = [...new Set(groupesActifs.map(g => g.coach_id).filter(Boolean))].length
      || [...new Set(allContratsPrives.filter(c => c.statut === "actif").map(c => c.coach_id).filter(Boolean))].length;
    const honorairesGroupes = trBulletins.reduce((s, h) => s + (h.montant_net ?? h.montant_total ?? 0), 0);
    const honorairesContrats = allContratsPrives.filter(c => c.statut === "actif")
      .reduce((s, c) => s + (c.prix_h||0) * (c.nb_seances_realisees||0) * (c.duree_seance_h||1.5), 0);
    const totalHonoraires = honorairesGroupes || honorairesContrats;
    const seancesValidees = trBulletins.reduce((s, h) => s + (h.nb_seances || 0), 0)
      || allContratsPrives.filter(c => c.statut === "actif").reduce((s, c) => s + (c.nb_seances_realisees||0), 0);
    const seancesTotal    = groupesActifs.reduce((s, g) => s + (g.nb_seances_total || 0), 0)
      || allContratsPrives.filter(c => c.statut === "actif").reduce((s, c) => s + (c.nb_seances_total||0), 0);
    const aValider        = Math.max(0, seancesTotal - seancesValidees);
    return { actifs, coachesActifs, totalHonoraires, seancesValidees, seancesTotal, aValider };
  }, [paGroupes, trBulletins, allContratsPrives]);

  /* ── Récapitulatif honoraires par coach (données réelles) ── */
  const honorairesParCoach = useMemo(() => {
    const map = {};
    allContratsPrives
      .filter(c => c.coach_id && c.statut !== "terminé")
      .forEach(c => {
        const cid    = String(c.coach_id);
        const coachR = paCoachsList.find(x => String(x.id) === cid);
        const nom    = coachR ? `${coachR.prenom||""} ${coachR.nom||""}`.trim() : (c.coach_nom || `Coach #${cid}`);
        const contrat = coachR?.type_contrat || coachR?.contrat || c.type_contrat || "-";
        const tarifH  = Number(c.prix_h) || 0;
        const nbReal  = Number(c.nb_seances_realisees) || 0;
        const dureeH  = Number(c.duree_seance_h) || 1.5;
        const montant = tarifH * dureeH * nbReal;
        const heures  = dureeH * nbReal;
        if (!map[cid]) {
          map[cid] = { coachId: cid, coachNom: nom, tarif_h: tarifH, contrat, contrats: [], totalH: 0, totalMontant: 0, toutValidee: true };
        }
        map[cid].contrats.push({ ...c, _montant: montant, _heures: heures, _valide: c.paiement_confirme === true });
        map[cid].totalH       += heures;
        map[cid].totalMontant += montant;
        if (!(c.paiement_confirme === true)) map[cid].toutValidee = false;
      });
    return Object.values(map).sort((a, b) => b.totalMontant - a.totalMontant);
  }, [allContratsPrives, paCoachsList]);

  /* ── Coach recommandés pour attribution ── */
  const coachesCompatibles = useMemo(() => {
    if (!selectedApprenant) return paCoachsList;
    return paCoachsList
      .filter(c => {
        const niveaux = Array.isArray(c.niveaux) ? c.niveaux : String(c.niveaux||"").split(/[,;\/]/).map(s=>s.trim()).filter(Boolean);
        return niveaux.includes(selectedApprenant.niveau);
      })
      .sort((a,b) => (b.actif!==false?1:0) - (a.actif!==false?1:0));
  }, [selectedApprenant, paCoachsList]);

  /* ── Créer un contrat privé ── */
  const handleCreerCours = async () => {
    if (creatingContrat) return;
    if (!formCours.apprenant_nom || !formCours.coach_id || !formCours.prix_h) {
      toast.error("Nom de l'apprenant, coach et prix/h sont obligatoires"); return;
    }
    setCreatingContrat(true);
    try {
      const r = await fetch(`${API_URL}/api/contrats-prives`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ ...formCours, coach_id: formCours.coach_id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `Erreur ${r.status}`);
      setCours(p => [d.contrat, ...p]);
      setAllContratsPrives(p => [d.contrat, ...p]);
      toast.success(`Contrat créé pour ${formCours.apprenant_nom}`);
      setModalCours(false);
      setFormCours({ ...CONTRAT_FORM_INIT, coach_id:"" });
    } catch (e) { toast.error(e.message || "Erreur création contrat"); }
    finally { setCreatingContrat(false); }
  };

  /* ── Mettre à jour le statut d'un contrat ── */
  const handleUpdateContratStatut = async (id, statut) => {
    try {
      const r = await fetch(`${API_URL}/api/contrats-prives/${id}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ statut }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error);
      setCours(p => p.map(c => c.id === id ? d.contrat : c));
      setAllContratsPrives(p => p.map(c => c.id === id ? d.contrat : c));
      if (selectedCours?.id === id) setSelectedCours(d.contrat);
      toast.success(`Contrat ${statut}`);
    } catch (e) { toast.error(e.message || "Erreur mise à jour"); }
  };

  /* ── Valider les honoraires d'un coach ── */
  const handleValiderCoach = async (coachId) => {
    if (validatingCoachId || validatingTout) return;
    setValidatingCoachId(coachId);
    const contratsCoach = allContratsPrives.filter(c => String(c.coach_id) === String(coachId));
    try {
      await Promise.all(contratsCoach.map(c =>
        fetch(`${API_URL}/api/contrats-prives/${c.id}`, {
          method: "PATCH", headers: authHeaders(),
          body: JSON.stringify({ paiement_confirme: true }),
        })
      ));
      setAllContratsPrives(p => p.map(c => String(c.coach_id) === String(coachId) ? { ...c, paiement_confirme: true } : c));
      toast.success("Honoraires validés - transmission RH en cours…");
    } catch { toast.error("Erreur lors de la validation des honoraires"); }
    finally { setValidatingCoachId(null); }
  };

  const handleValiderTout = async () => {
    if (validatingTout || validatingCoachId) return;
    setValidatingTout(true);
    const contratsActifs = allContratsPrives.filter(c => c.statut === "actif" || (c.nb_seances_realisees || 0) > 0);
    try {
      await Promise.all(contratsActifs.map(c =>
        fetch(`${API_URL}/api/contrats-prives/${c.id}`, {
          method: "PATCH", headers: authHeaders(),
          body: JSON.stringify({ paiement_confirme: true }),
        })
      ));
      setAllContratsPrives(p => p.map(c =>
        (c.statut === "actif" || (c.nb_seances_realisees || 0) > 0) ? { ...c, paiement_confirme: true } : c
      ));
      toast.success(`Récapitulatif ${moisValidation} validé et transmis aux RH`);
      setModalValidation(false);
    } catch { toast.error("Erreur lors de la validation globale"); }
    finally { setValidatingTout(false); }
  };

  /* ── Affecter coach depuis modal attribution ── */
  const handleAffecterCoach = () => {
    if (!selectedApprenant || !selectedCoach) { toast.error("Sélectionnez un apprenant et un coach."); return; }
    toast.success(`${selectedCoach.nom} affecté à ${selectedApprenant.nom}`);
    setModalAttrib(false);
    setSelectedApprenant(null); setSelectedCoach(null);
  };

  /* ══════════════════════════════════════════════════════
     RENDU
  ══════════════════════════════════════════════════════ */
  const STATUT_COURS_CFG = {
    dispense:         { label:"Dispensé",         color:"#065f46", bg:"#d1fae5", icon:"✅" },
    annule:           { label:"Annulé",           color:"#991b1b", bg:"#fee2e2", icon:"❌" },
    apprenant_absent: { label:"Apprenant absent", color:"#92400e", bg:"#fef3c7", icon:"👤" },
    coach_absent:     { label:"Coach absent",     color:"#1e40af", bg:"#dbeafe", icon:"🏃" },
    catch_up:         { label:"Catch up",         color:"#5b21b6", bg:"#ede9fe", icon:"🔄" },
    holiday:          { label:"Congé / Férié",    color:"#374151", bg:"#f1f5f9", icon:"🏖️" },
  };

  const MOIS_LABELS = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];

  // Badges "nouveau depuis dernière visite" - pas de statut en attente côté
  // backend pour ces listes, donc un total figé n'aurait pas de sens ici.
  const evaluationsBadge = useNouveauteBadge("evaluations", paEvaluations, activeTab, { userId: profil?.id });
  const rapportsSuperviseurBadge = useNouveauteBadge("rapports-superviseur", paAllRapports, activeTab, { userId: profil?.id, dateKey: "date_observation" });

  // ── Badges d'onglets supplémentaires - signaux réels déjà chargés ──
  // NB: "prospects" et "apprenants" ont déjà leur propre badge inline (voir rendu des
  // onglets plus bas) - ne pas en ajouter un second ici, il ne serait jamais affiché
  // (le rendu générique t.badge exclut explicitement ces deux ids).
  const remplacementsAPourvoir = useMemo(() => (paRemplacements||[]).filter(r => r.statut === "a_pourvoir").length, [paRemplacements]);
  const honorairesAValider = useMemo(() => (trBulletins||[]).filter(h => h.statut === "en_attente").length, [trBulletins]);
  const { notifications: toutesNotifsPA, nbNonLues: notifNonLues, marquerLue: marquerNotifLuePA } = useNotifications(profil?.id);
  const { unreadTotal: msgNonLus } = useFirebaseChat();
  // Le badge ne comptait que la messagerie privée : un message posté dans le chat d'une
  // classe n'apparaissait nulle part, et personne n'allait le chercher.
  const chatGroupeNonLus = useGroupesChatUnreadTotal(paGroupes.map(g => g.id), profil?.id);
  // Les non-lus des groupes LIBRES, calculés ici et non dans l'écran des groupes : la
  // pastille doit s'allumer alors même que l'onglet n'est pas ouvert.
  const groupesLibresNonLus = useGroupesLibresNonLus(localStorage.getItem("admin_token"), profil?.id);
  const [banderoleFermeePA, setBanderoleFermeePA] = useState(false);
  const notifsBanderolePA = toutesNotifsPA.filter(n => !n.lu).slice(0, 3);

  // ── "Mes tâches" - agrège les compteurs "à traiter" déjà calculés pour
  // chaque onglet, pour un point d'entrée unique.
  const tachesGroupesSansCoach = paGroupes.filter(g=>!g.coach_id&&g.statut==="actif").length;
  const tachesProspects = prospects.filter(p=>p.statut==="en_attente").length;
  const tachesTotal = tachesGroupesSansCoach + remplacementsAPourvoir + honorairesAValider + paReaffectations.length + tachesProspects;

  const TABS = [
    { id:"taches", icon:"✅", label:"Mes tâches", badge: tachesTotal || null },
    { id:"dashboard",   icon:"🏠", label:"Tableau de bord"   },
    { id:"prospects",   icon:"📋", label:"Prospects parcours" },
    { id:"apprenants",  icon:"🎓", label:"Apprenants"     },
    { id:"groupes",        icon:"👥", label:"Groupes", badge: paGroupes.filter(g=>!g.coach_id&&g.statut==="actif").length||null },
    { id:"coachs",         icon:"👨‍🏫", label:"Coachs"              },
    { id:"remplacements",  icon:"🔄", label:"Remplacements", badge: remplacementsAPourvoir || null },
    { id:"honoraires",  icon:"💰", label:"Honoraires", badge: honorairesAValider || null },
    { id:"evaluations", icon:"⭐", label:"Évaluations parents", badge: evaluationsBadge },
    { id:"eval-apprenants", icon:"🎓", label:"Évaluations apprenants" },
    { id:"rapports-superviseur", icon:"📋", label:"Rapports Superviseur", badge: rapportsSuperviseurBadge },
    { id:"reaffectations", icon:"🔀", label:"Dossiers à réaffecter", badge: paReaffectations.length || null },
    { id:"messages",    icon:"💬", label:"Messages", badge: (msgNonLus || 0) + chatGroupeNonLus || null },
    { id:"notifications", icon:"🔔", label:"Notifications", badge: notifNonLues || null },
  ];

  return (
    <>
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#f5f3ff", fontFamily:FF }}>

      {/* ── HERO HEADER ── */}
      <div style={{ flexShrink:0, background:PA_GRADIENT, padding:"28px 32px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.04)", zIndex:0 }} />
        <div style={{ position:"absolute", bottom:-60, right:80, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.03)", zIndex:0 }} />

        {/* Infos utilisateur + actions */}
        <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <div style={{ position:"relative", flexShrink:0 }} onClick={()=>{ if (avatarUrl) setPhotoProfilOuverte(true); }}>
              <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:22, color:"#fff", border:"3px solid rgba(255,255,255,0.3)", overflow:"hidden" , cursor: avatarUrl ? "zoom-in" : "default"}}>
                {avatarUrl ? <img src={avatarUrl} alt={initiales} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}
              </div>
              {photoProfilOuverte && <VisionneuseImage url={avatarUrl} onClose={()=>setPhotoProfilOuverte(false)} />}
              <label title="Changer la photo" onClick={e=>e.stopPropagation()} style={{ position:"absolute",bottom:0,right:0,width:22,height:22,borderRadius:"50%",background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,border:"2px solid #fff" }}>
                📷<input type="file" accept="image/*" style={{ display:"none" }} onChange={(e)=>{ const f=e.target.files?.[0]; if(f){ uploadFichier(f, "avatar").then(handleAvatarSuccess).catch(e=>{}); } e.target.value=""; }} />
              </label>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#c4b5fd", fontWeight:600, letterSpacing:"0.08em" }}>Bonjour 👋</div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff" }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} /></h1>
              {surnomPerso.trim() && nomComplet !== nomAffiche && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:1 }}>{nomComplet}</div>
              )}
              <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                onEnregistre={(v) => setSurnomPerso(v || "")} />
              <div style={{ fontSize:12, color:"#ddd6fe", marginTop:3 }}>📚 Conseiller Pédagogique · {profil?.email || ""}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {stats.aValider > 0 && (
              <div style={{ background:"rgba(239,68,68,.28)", border:"1px solid rgba(239,68,68,.5)", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}
                onClick={()=>setActiveTab("honoraires")}>
                ⚠️ {stats.aValider} séance{stats.aValider>1?"s":""} à valider
              </div>
            )}
            <NotificationBell userId={profil?.id} />
            <DashboardColorPicker />
              <button onClick={toggleLang} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", transition:"background .2s", letterSpacing:"0.06em" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
                {lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}
              </button>
            {accesElearning && (
              <button
                type="button"
                onClick={() => openElearningSSO(ELEARNING_URL)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", background:"rgba(8,145,178,0.25)", border:"1.5px solid rgba(8,145,178,0.5)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", transition:"background .2s" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(8,145,178,0.45)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(8,145,178,0.25)"}
                title="Accéder à la plateforme E-Learning BET"
              >
                <span style={{ fontSize:15 }}>🎓</span> E-Learning
              </button>
            )}
            <button onClick={handleLogout}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", backdropFilter:"blur(4px)" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
              <span>🚪</span> Déconnexion
            </button>
          </div>
        </div>

        {/* Mini KPIs dans le hero */}
        <div style={{ display:"flex", gap:0, background:"rgba(0,0,0,0.15)", borderRadius:"12px 12px 0 0", overflow:"hidden", position:"relative", zIndex:1 }}>
          {[
            { l:"Cours actifs",        v:stats.actifs,                                                                   c:"#c4b5fd" },
            { l:"Coaches affectés",    v:stats.coachesActifs,                                                            c:"#93c5fd" },
            { l:"Honoraires du mois",  v:formatMoney(stats.totalHonoraires),                                             c:"#6ee7b7" },
            { l:"Séances validées",    v:`${stats.seancesValidees}/${stats.seancesTotal}`,                               c:"#fcd34d" },
          ].map((s,i,arr)=>(
            <div key={s.l} style={{ flex:1, textAlign:"center", padding:"14px 8px", borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.08)":"none" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", marginBottom:3 }}>{s.l}</div>
              <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:"1 1 auto", padding:"0 24px 32px" }}>
        <div style={{ background:"#fff", borderRadius:"0 0 12px 12px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", overflow:"hidden" }}>

          {/* ── Onglets horizontaux ── */}
          <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e7eb", flexWrap:"wrap", background:"#fafafa" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                padding:"12px 16px", border:"none",
                borderBottom: activeTab===t.id ? `3px solid ${PA_COLOR}` : "3px solid transparent",
                cursor:"pointer", fontWeight:600, fontSize:12, whiteSpace:"nowrap",
                background:"transparent", color:activeTab===t.id ? PA_COLOR : "#6b7280",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"color .15s",
                flex:"1 1 130px",
              }}>
                <span style={{ fontSize:14 }}>{t.icon}</span>
                {t.label}
                {t.id==="validation" && stats.aValider>0 && (
                  <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px" }}>{stats.aValider}</span>
                )}
                {t.id==="prospects" && prospects.filter(p=>p.statut==="en_attente").length > 0 && (
                  <span style={{ background:"#0891b2", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px" }}>{prospects.filter(p=>p.statut==="en_attente").length}</span>
                )}
                {t.id==="apprenants" && prospects.filter(p=>p.statut==="converti").length > 0 && (
                  <span style={{ background:"#22c55e", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px" }}>{prospects.filter(p=>p.statut==="converti").length}</span>
                )}
                {t.badge > 0 && t.id !== "validation" && t.id !== "prospects" && t.id !== "apprenants" && (
                  <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px" }}>{t.badge}</span>
                )}
              </button>
            ))}
          </div>

          {!banderoleFermeePA && notifsBanderolePA.length > 0 && (
            <div style={{ padding:"10px 24px", background:"#fff7ed", borderBottom:"1px solid #fed7aa", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                {notifsBanderolePA.map(n => (
                  <div key={n.id} onClick={() => { marquerNotifLuePA(n.id); setActiveTab("notifications"); }}
                    style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                    <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                    <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                  </div>
                ))}
                {notifNonLues > notifsBanderolePA.length && (
                  <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                    +{notifNonLues - notifsBanderolePA.length} autre{notifNonLues - notifsBanderolePA.length > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
              <button onClick={()=>setBanderoleFermeePA(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
            </div>
          )}

          <div style={{ padding:24 }}>

          {/* ══ MES TÂCHES ══ */}
          {activeTab === "taches" && (() => {
            const taches = [
              { icon:"👥", label:"Groupes sans coach",         n:tachesGroupesSansCoach,  tab:"groupes" },
              { icon:"🔄", label:"Remplacements à pourvoir",    n:remplacementsAPourvoir,  tab:"remplacements" },
              { icon:"💰", label:"Honoraires à valider",        n:honorairesAValider,      tab:"honoraires" },
              { icon:"🔀", label:"Dossiers à réaffecter",       n:paReaffectations.length, tab:"reaffectations" },
              { icon:"📋", label:"Prospects en attente",        n:tachesProspects,         tab:"prospects" },
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
                        onMouseEnter={e=>e.currentTarget.style.borderColor=PA_COLOR}
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

          {/* ══════════════════════════════════
              ONGLET PROSPECTS PARCOURS
          ══════════════════════════════════ */}
          {activeTab === "prospects" && (
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

              {/* Header + filtres */}
              <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                <div style={{ flex:1, minWidth:220 }}>
                  <input
                    value={prospectSearch} onChange={e=>{ setProspectSearch(e.target.value); setProspectPage(1); }}
                    placeholder="🔍 Rechercher un prospect…"
                    style={{ width:"100%", padding:"9px 14px", border:"1.5px solid #e2e8f0", borderRadius:9, fontSize:13, outline:"none", boxSizing:"border-box" }}
                  />
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {["tous","en_attente","en_cours","perdu"].map(s => (
                    <button key={s} onClick={()=>{ setProspectFiltreStatut(s); setProspectPage(1); }}
                      style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:700, border:"1.5px solid", cursor:"pointer",
                        background: prospectFiltreStatut===s ? PA_COLOR : "transparent",
                        color: prospectFiltreStatut===s ? "#fff" : "#6b7280",
                        borderColor: prospectFiltreStatut===s ? PA_COLOR : "#e2e8f0" }}>
                      {s==="tous"?"Tous":s==="en_attente"?"Nouveau":STATUT_PROSPECT[s]?.label||s}
                      {s==="en_attente" && prospects.filter(p=>p.statut==="en_attente").length>0 && (
                        <span style={{ marginLeft:5, background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, padding:"0px 5px" }}>
                          {prospects.filter(p=>p.statut==="en_attente").length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <button onClick={fetchProspects} style={{ padding:"8px 14px", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:"pointer", color:"#6b7280", fontWeight:600 }}>
                  🔄 Actualiser
                </button>
              </div>

              {/* KPIs rapides */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                {[
                  { l:"Total actifs",  v:prospects.filter(p=>p.statut!=="converti").length,        c:PA_COLOR,   icon:"📋" },
                  { l:"Nouveaux",     v:prospects.filter(p=>p.statut==="en_attente").length,      c:"#0891b2",  icon:"🆕" },
                  { l:"En cours",     v:prospects.filter(p=>p.statut==="en_cours").length,        c:"#f59e0b",  icon:"⏳" },
                  { l:"Perdus",       v:prospects.filter(p=>p.statut==="perdu").length,           c:"#ef4444",  icon:"❌" },
                ].map(s=>(
                  <div key={s.l} style={{ background:"#fff", borderRadius:12, padding:"14px 16px", border:"1.5px solid #e2e8f0", display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:22 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{s.l}</div>
                      <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chargement */}
              {prospectsLoading && (
                <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8", fontSize:13 }}>Chargement des prospects…</div>
              )}

              {/* Vide */}
              {!prospectsLoading && prospectsFiltered.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 0" }}>
                  <div style={{ fontSize:"3rem", marginBottom:10 }}>🏠</div>
                  <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:6 }}>
                    {prospectSearch || prospectFiltreStatut!=="tous" ? "Aucun résultat" : "Aucun prospect reçu"}
                  </div>
                  <div style={{ fontSize:13, color:"#94a3b8" }}>
                    Les demandes de cours à domicile apparaîtront ici automatiquement.
                  </div>
                </div>
              )}

              {/* Tableau prospects */}
              {!prospectsLoading && prospectsFiltered.length > 0 && (() => {
                const prospectTotalPages = Math.ceil(prospectsFiltered.length / PA_PAGE_SIZE);
                const prospectPageSafe   = Math.min(prospectPage, prospectTotalPages);
                const prospectsPage      = prospectsFiltered.slice((prospectPageSafe - 1) * PA_PAGE_SIZE, prospectPageSafe * PA_PAGE_SIZE);
                return (
                <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                        <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Prospect</th>
                        <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Contact</th>
                        <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Type</th>
                        <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Source</th>
                        <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Date</th>
                        <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Statut</th>
                        <th style={{ padding:"11px 16px", textAlign:"center", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prospectsPage.map((p, idx) => {
                        const st = STATUT_PROSPECT[p.statut] || STATUT_PROSPECT.nouveau;
                        const initiales = (p.prospect_nom||"?").split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase();
                        return (
                          <tr key={p.id}
                            style={{ borderBottom:"1px solid #f1f5f9", background: idx%2===0?"#fff":"#fafafa", cursor:"pointer", transition:"background .15s" }}
                            onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"0d"}
                            onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?"#fff":"#fafafa"}
                            onClick={() => {
                              setProspectModal(p);
                              const sd = p.suivi_demarrage || {};
                              const rawDispos = sd.disponibilites || { jours:[], creneaux:[] };
                              setProspectDossier({ niveau: sd.niveau_prospect||p.niveau_client||"", duree_mois: sd.nb_seances_souhaitees||"", formation: sd.formation_souhaitee||"", type_coaching: sd.type_coaching||sd.pack_coaching||"classique", lieu: sd.lieu_coaching||"cabinet", cout_formation: sd.cout_formation||"", adresse_coaching: sd.adresse_coaching||"", centre_coaching: sd.centre_coaching||"", disponibilites: { ...rawDispos, horaires: normalizeHoraires(rawDispos.horaires) }, date_debut: sd.date_debut_formation||p.date_debut_formation||"" });
                              fetchPaiementsApprenant(p.id);
                              setAddingVersement(false);
                              setVersementForm({ montant:"", date:new Date().toISOString().slice(0,10), mode:"Mobile Money", ref:"", notes:"", preuve:null });
                            }}
                          >
                            <td style={{ padding:"12px 16px" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                <div style={{ width:34, height:34, borderRadius:"50%", background:PA_GRADIENT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:12, color:"#fff", flexShrink:0, overflow:"hidden" }}>{p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}</div>
                                <span style={{ fontWeight:700, color:"#0f172a" }}>{p.prospect_nom||"-"}</span>
                              </div>
                            </td>
                            <td style={{ padding:"12px 16px" }}>
                              <div style={{ fontSize:12, color:"#374151" }}>{p.prospect_email||"-"}</div>
                              {p.prospect_telephone && <div style={{ fontSize:11, color:"#64748b" }}>📞 {p.prospect_telephone}</div>}
                            </td>
                            <td style={{ padding:"12px 16px" }}>
                              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"#f0fdf4", color:"#15803d", display:"inline-block", width:"fit-content" }}>
                                  {p.type_cours === "hybride" ? "⚡ Hybride" : p.type_cours === "en_ligne" ? "💻 En ligne" : p.type_cours === "domicile" ? "🏠 À domicile" : p.type_cours === "presentiel" ? "🏢 Présentiel" : "-"}
                                </span>
                                {p.type_coaching && (
                                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"#f3e8ff", color:"#7c3aed", display:"inline-block", width:"fit-content" }}>
                                    {p.type_coaching === "prive" ? "👤 Cours privé" : p.type_coaching === "groupe" ? "👥 Groupe" : p.type_coaching}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding:"12px 16px", fontSize:12, color:"#64748b" }}>{p.source||"-"}</td>
                            <td style={{ padding:"12px 16px", fontSize:12, color:"#64748b", whiteSpace:"nowrap" }}>📅 {formatDate(p.created_at)}</td>
                            <td style={{ padding:"12px 16px" }}>
                              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                <span style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:999, color:st.color, background:st.bg, whiteSpace:"nowrap", width:"fit-content" }}>
                                  {st.icon} {st.label}
                                </span>
                                {p.type_coaching === "prive" && p.dossier_statut && (
                                  <span title={p.dossier_statut === "invalide" ? (p.motif_invalidation || "") : undefined}
                                    style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, width:"fit-content",
                                      color: p.dossier_statut==="invalide"?"#dc2626":p.dossier_statut==="en_attente_validation"?"#d97706":"#0891b2",
                                      background: p.dossier_statut==="invalide"?"#fee2e2":p.dossier_statut==="en_attente_validation"?"#fef3c7":"#e0f2fe" }}>
                                    {{ en_attente_validation:"⏳ À valider", valide:"✅ Validé", invalide:"❌ Invalidé", paiement_en_attente:"💳 Paiement en attente", paiement_recu:"💰 Paiement reçu" }[p.dossier_statut] || p.dossier_statut}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding:"12px 16px", textAlign:"center" }}>
                              {p.type_coaching === "prive" && p.dossier_statut === "en_attente_validation" ? (
                                <div style={{ display:"flex", gap:6, justifyContent:"center" }} onClick={e => e.stopPropagation()}>
                                  <button onClick={() => setConfirmValiderTarget(p)} disabled={validationLoading || !peut("inscriptions","update")}
                                    style={{ padding:"6px 10px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:700, fontSize:11, cursor: validationLoading?"wait":"pointer" }}>
                                    ✅ Valider
                                  </button>
                                  <button onClick={() => { setInvaliderTarget(p); setInvaliderMotif(""); }} disabled={validationLoading || !peut("inscriptions","update")}
                                    style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #fca5a5", background:"#fff", color:"#dc2626", fontWeight:700, fontSize:11, cursor: validationLoading?"wait":"pointer" }}>
                                    ❌ Invalider
                                  </button>
                                </div>
                              ) : p.type_coaching === "prive" && p.dossier_statut === "paiement_recu" && p.routing_statut ? (
                                <span style={{ fontSize:10.5, fontWeight:700, padding:"4px 10px", borderRadius:99, background:"#f0fdf4", color:"#15803d", whiteSpace:"nowrap" }}>
                                  ✅ Transmis{p.type_cours === "en_ligne" ? " à l'Onboarding" : " à l'assistante"}
                                </span>
                              ) : p.type_coaching === "prive" && p.dossier_statut === "paiement_recu" ? (
                                <button onClick={e => { e.stopPropagation(); setConfirmRouterTarget(p); }} disabled={validationLoading || !peut("inscriptions","update")}
                                  style={{ padding:"6px 12px", borderRadius:8, border:"none", background:PA_COLOR, color:"#fff", fontWeight:700, fontSize:11, cursor: validationLoading?"wait":"pointer", whiteSpace:"nowrap" }}>
                                  {p.type_cours === "en_ligne" ? "📥 Transmettre à l'Onboarding" : "🏢 Transmettre à l'assistante"}
                                </button>
                              ) : (
                                <span style={{ color:PA_COLOR, fontWeight:700, fontSize:12 }}>Voir →</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Pagination prospects ── */}
                {prospectTotalPages > 1 && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"#fff", borderTop:"1px solid #e2e8f0", borderRadius:"0 0 14px 14px", marginTop:-1 }}>
                    <span style={{ fontSize:12, color:"#6b7280" }}>
                      {(prospectPageSafe-1)*PA_PAGE_SIZE+1}–{Math.min(prospectPageSafe*PA_PAGE_SIZE, prospectsFiltered.length)} sur {prospectsFiltered.length} prospects
                    </span>
                    <div style={{ display:"flex", gap:4 }}>
                      <button onClick={()=>setProspectPage(1)} disabled={prospectPageSafe===1}
                        style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:prospectPageSafe===1?"not-allowed":"pointer", color:"#6b7280", opacity:prospectPageSafe===1?.4:1 }}>«</button>
                      <button onClick={()=>setProspectPage(p=>Math.max(1,p-1))} disabled={prospectPageSafe===1}
                        style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:prospectPageSafe===1?"not-allowed":"pointer", color:"#6b7280", opacity:prospectPageSafe===1?.4:1 }}>‹</button>
                      {Array.from({length:prospectTotalPages},(_,i)=>i+1).filter(n=>Math.abs(n-prospectPageSafe)<=2).map(n=>(
                        <button key={n} onClick={()=>setProspectPage(n)}
                          style={{ padding:"5px 10px", borderRadius:7, border:`1.5px solid ${n===prospectPageSafe?PA_COLOR:"#e2e8f0"}`, background:n===prospectPageSafe?PA_COLOR:"#f8fafc", fontSize:12, fontWeight:700, cursor:"pointer", color:n===prospectPageSafe?"#fff":"#374151", minWidth:32 }}>{n}</button>
                      ))}
                      <button onClick={()=>setProspectPage(p=>Math.min(prospectTotalPages,p+1))} disabled={prospectPageSafe===prospectTotalPages}
                        style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:prospectPageSafe===prospectTotalPages?"not-allowed":"pointer", color:"#6b7280", opacity:prospectPageSafe===prospectTotalPages?.4:1 }}>›</button>
                      <button onClick={()=>setProspectPage(prospectTotalPages)} disabled={prospectPageSafe===prospectTotalPages}
                        style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:prospectPageSafe===prospectTotalPages?"not-allowed":"pointer", color:"#6b7280", opacity:prospectPageSafe===prospectTotalPages?.4:1 }}>»</button>
                    </div>
                  </div>
                )}

                </div>
                );
              })()}

            </div>
          )}

          {/* ── Modal visionneuse justificatif de paiement ── */}
          {preuvePaiementView && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
              onClick={() => setPreuvePaiementView(null)}>
              <div style={{ background:"#fff", borderRadius:14, padding:16, maxWidth:"92vw", maxHeight:"92vh", overflow:"auto", position:"relative" }} onClick={e=>e.stopPropagation()}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontWeight:800, fontSize:14, color:"#0f172a" }}>📎 Justificatif de paiement</div>
                  <button onClick={() => setPreuvePaiementView(null)} style={{ background:"#f1f5f9", border:"none", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:14 }}>✕</button>
                </div>
                {preuvePaiementView.startsWith("data:application/pdf") || preuvePaiementView.toLowerCase().endsWith(".pdf") ? (
                  <a href={preuvePaiementView} target="_blank" rel="noopener noreferrer"
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 16px", background:"#f5f3ff", borderRadius:10, color:"#6d28d9", fontWeight:700, fontSize:13, textDecoration:"none" }}>
                    📄 Ouvrir le PDF dans un nouvel onglet →
                  </a>
                ) : (
                  <img src={preuvePaiementView} alt="Justificatif de paiement" style={{ maxWidth:"100%", maxHeight:"78vh", objectFit:"contain", borderRadius:8 }} />
                )}
              </div>
            </div>
          )}

          {/* ── Modal confirmation "Valider" (dossier coaching privé) ── */}
          {confirmValiderTarget && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
              onClick={e => { if (e.target === e.currentTarget) setConfirmValiderTarget(null); }}>
              <div style={{ background:"#fff", borderRadius:14, padding:22, width:"100%", maxWidth:440 }}>
                <div style={{ fontWeight:800, fontSize:15, color:"#0f172a", marginBottom:4 }}>✅ Valider le dossier</div>
                <div style={{ fontSize:12.5, color:"#64748b", marginBottom:18 }}>
                  Confirmer la validation du dossier de <strong>{confirmValiderTarget.prospect_nom}</strong> ? L'assistante sera notifiée et pourra activer le paiement.
                </div>
                <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                  <button onClick={() => setConfirmValiderTarget(null)} disabled={validationLoading}
                    style={{ padding:"8px 16px", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#64748b", fontWeight:700, fontSize:12.5, cursor:"pointer" }}>Annuler</button>
                  <button onClick={() => validerDossierPrive(confirmValiderTarget)} disabled={validationLoading}
                    style={{ padding:"8px 16px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:700, fontSize:12.5, cursor: validationLoading?"wait":"pointer" }}>
                    {validationLoading ? "⏳ Envoi…" : "Confirmer la validation"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Modal confirmation "Router" (dossier coaching privé) ── */}
          {confirmRouterTarget && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
              onClick={e => { if (e.target === e.currentTarget) setConfirmRouterTarget(null); }}>
              <div style={{ background:"#fff", borderRadius:14, padding:22, width:"100%", maxWidth:440 }}>
                <div style={{ fontWeight:800, fontSize:15, color:"#0f172a", marginBottom:4 }}>
                  {confirmRouterTarget.type_cours === "en_ligne" ? "📥 Transmettre à l'Onboarding" : "🏢 Transmettre à l'assistante"}
                </div>
                <div style={{ fontSize:12.5, color:"#64748b", marginBottom:18 }}>
                  Confirmer la transmission du dossier de <strong>{confirmRouterTarget.prospect_nom}</strong> {confirmRouterTarget.type_cours === "en_ligne" ? "à l'Onboarding" : "à son assistante"} pour finalisation (classe & coach) ?
                </div>
                <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                  <button onClick={() => setConfirmRouterTarget(null)} disabled={validationLoading}
                    style={{ padding:"8px 16px", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#64748b", fontWeight:700, fontSize:12.5, cursor:"pointer" }}>Annuler</button>
                  <button onClick={() => routerDossierPrive(confirmRouterTarget)} disabled={validationLoading}
                    style={{ padding:"8px 16px", borderRadius:8, border:"none", background:PA_COLOR, color:"#fff", fontWeight:700, fontSize:12.5, cursor: validationLoading?"wait":"pointer" }}>
                    {validationLoading ? "⏳ Envoi…" : "Confirmer la transmission"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Modal motif d'invalidation (dossier coaching privé) ── */}
          {invaliderTarget && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
              onClick={e => { if (e.target === e.currentTarget) setInvaliderTarget(null); }}>
              <div style={{ background:"#fff", borderRadius:14, padding:22, width:"100%", maxWidth:440 }}>
                <div style={{ fontWeight:800, fontSize:15, color:"#0f172a", marginBottom:4 }}>❌ Invalider le dossier</div>
                <div style={{ fontSize:12.5, color:"#64748b", marginBottom:14 }}>{invaliderTarget.prospect_nom} - un motif est requis, il sera transmis à l'assistante puis au client.</div>
                <textarea value={invaliderMotif} onChange={e => setInvaliderMotif(e.target.value)}
                  placeholder="Ex : coach non disponible sur ce créneau, niveau à revoir…"
                  style={{ width:"100%", minHeight:90, padding:"10px 12px", borderRadius:9, border:"1.5px solid #e2e8f0", fontSize:13, fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" }} />
                <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
                  <button onClick={() => setInvaliderTarget(null)} style={{ padding:"8px 16px", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#64748b", fontWeight:700, fontSize:12.5, cursor:"pointer" }}>Annuler</button>
                  <button onClick={confirmerInvalidation} disabled={validationLoading}
                    style={{ padding:"8px 16px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontWeight:700, fontSize:12.5, cursor: validationLoading?"wait":"pointer" }}>
                    {validationLoading ? "⏳ Envoi…" : "Confirmer l'invalidation"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════
              ONGLET MES APPRENANTS
          ══════════════════════════════════ */}
          {activeTab === "apprenants" && (() => {
            const NIVEAU_COLOR = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
            const apprenantsParcours = prospects.filter(p => p.statut === "converti").map(a => ({ ...a, _type:"parcours" }));
            // Coach réel de la classe, par groupe_id - indispensable pour un coaching de GROUPE :
            // suivi_demarrage.coach_id n'est renseigné que pour le coaching privé (assigné par le
            // PA), jamais pour un apprenant simplement inscrit dans une classe de groupe par
            // Onboarding. Sans ce repli, la colonne Coach affichait "-" pour tout le coaching
            // de groupe alors qu'un coach réel est bien assigné à la classe.
            const coachNomParGroupe = {};
            allApprenantsGroupes.forEach(ga => { if (ga.groupe_id && ga.coach_nom && ga.coach_nom !== "-") coachNomParGroupe[ga.groupe_id] = ga.coach_nom; });
            // Les vrais coachings privés vivent comme des `groupes` (is_prive=true) + leurs
            // `groupes_apprenants`, pas dans `contrats_prives` (système hérité, vide en
            // production) - on mappe les champs réels vers les noms attendus par le rendu
            // ci-dessous pour ne pas avoir à réécrire tout le tableau.
            // groupe_is_prive (colonne groupes.is_prive) n'est jamais mise à jour par le code
            // de création et reste souvent "false" pour une vraie classe privée - capacite_max
            // === 1 est le signal fiable posé par le flux de création (cf. même correctif déjà
            // appliqué côté Onboarding). Sans ce repli, des apprenants en coaching privé
            // disparaissaient purement et simplement de cet onglet.
            const apprenantsPrive = allApprenantsGroupes.filter(ga => estClassePrivee(ga)).map(ga => {
              const seancesReelles = paSeancesParGroupe[ga.groupe_id] || { realisees: 0, total: 0 };
              return {
              ...ga, // conserve tous les champs réels (assiduite, progression, coach_nom, groupe_nom, note_obj…) pour le modal de détail
              id:                   ga.id,
              apprenant_nom:        ga.nom_apprenant,
              apprenant_prenom:     ga.prenom_apprenant,
              apprenant_email:      ga.email_apprenant,
              apprenant_telephone:  ga.telephone,
              /* LE NIVEAU DE L'APPRENANT, PAS CELUI DE LA CLASSE. Le repli
                 `|| ga.groupe_niveau` a été retiré : il affichait le niveau du GROUPE comme
                 celui de la personne dès que l'inscription n'avait pas le sien. Même défaut,
                 et même conséquence, que celui corrigé le 07/10/2026 dans la file des dossiers
                 à réaffecter : un apprenant testé A2 s'y lisait B1. */
              niveau:               ga.niveau || null,
              niveau_classe:        ga.groupe_niveau || null,
              statut:               ga.statut,
              coach_id:             ga.coach_id,
              type_contrat:         ga.groupe_type_cours,
              // Séances réellement enregistrées par le coach (table unifiée `seances`, par
              // groupe_id) - remplace les 0/0 figés en dur qui s'affichaient systématiquement.
              nb_seances_total:     seancesReelles.total,
              nb_seances_realisees: seancesReelles.realisees,
              // Le paiement réel du coaching privé vit sur l'assignation d'origine
              // (ga.montant_paye/statut_paiement/plan_paiement, enrichis côté backend
              // GET /api/groupes/apprenants) - jamais figé à false comme avant, sinon
              // la colonne Paiement affiche "En attente" même quand des versements existent.
              // Valeurs réelles en base : en_attente, reçu, confirme, partiel, paye - "reçu"
              // manquait ici, faisant passer 26 dossiers réellement payés pour "en attente".
              paiement_confirme:    ["paye","payé","confirme","reçu","recu"].includes(ga.statut_paiement),
              _type: "prive",
              };
            });

            const allApprenants = [
              ...(appType === "prives"  ? [] : apprenantsParcours),
              ...(appType === "parcours" ? [] : apprenantsPrive),
            ];

            const appFiltered = allApprenants.filter(a => {
              const q = appSearchQ.toLowerCase();
              const searchStr = a._type === "parcours"
                ? `${a.prospect_nom} ${a.prospect_email} ${a.prospect_telephone}`
                : `${a.apprenant_nom} ${a.apprenant_prenom} ${a.apprenant_email} ${a.apprenant_telephone}`;
              if (q && !searchStr.toLowerCase().includes(q)) return false;
              if (appNiveau !== "tous") {
                const niv = a._type === "parcours" ? ((a.suivi_demarrage||{}).niveau_prospect || a.niveau_client) : a.niveau;
                if (niv !== appNiveau) return false;
              }
              return true;
            });

            // KPIs - on garde uniquement sur les parcours pour les totaux financiers
            const apprenants = apprenantsParcours;

            // "payé" est écrit avec ou sans accent selon l'écran d'origine
            // (CommercialDashboard écrit tantôt "paye", tantôt "payé) - on tolère les deux.
            const estTranchePayee = tr => tr.statut === "payé" || tr.statut === "paye";
            const totalTranchesGlobal = apprenants.reduce((s,a) => {
              const t = (a.plan_paiement?.tranches || []);
              return s + t.reduce((ss,tr)=>ss+(tr.montant||0),0);
            },0);
            const totalPayeGlobal = apprenants.reduce((s,a) => {
              const tranches = a.plan_paiement?.tranches || [];
              // Fallback sur montant_paye si aucun plan de paiement par tranches n'existe
              if (tranches.length === 0) return s + (a.montant_paye || 0);
              const t = tranches.filter(estTranchePayee);
              return s + t.reduce((ss,tr)=>ss+(tr.montant||0),0);
            },0);
            const nbAvecPlan = apprenants.filter(a=>(a.plan_paiement?.tranches||[]).length>0).length;
            const nbAvecSuivi = apprenants.filter(a=>(a.suivi_presences?.seances_effectuees||0)>0).length;

            return (
              <div>
                {/* Header */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>🎓 Apprenants BET</h2>
                    <p style={{ margin:"4px 0 0", fontSize:12, color:"#9ca3af" }}>
                      {apprenantsParcours.length} parcours · {apprenantsPrive.length} privés · {allApprenants.length} au total
                    </p>
                  </div>
                  <Btn small outline onClick={()=>setActiveTab("prospects")}>← Retour aux prospects</Btn>
                </div>

                {/* KPIs */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:22 }}>
                  <StatCard label="Total apprenants"      value={allApprenants.length}         icon="🎓" color={PA_COLOR}   sub={`${apprenantsParcours.length} parcours + ${apprenantsPrive.length} privés`} />
                  <StatCard label="Contrats privés actifs" value={apprenantsPrive.filter(c=>c.statut==="actif").length} icon="📋" color="#7c3aed" sub="en cours" />
                  <StatCard label="Encaissé (parcours)"   value={formatMoney(totalPayeGlobal)} icon="✅" color="#22c55e" />
                  <StatCard label="Reste (parcours)"      value={formatMoney(Math.max(0,totalTranchesGlobal-totalPayeGlobal))} icon="⏳" color={totalTranchesGlobal-totalPayeGlobal>0?"#ef4444":"#22c55e"} />
                </div>

                {/* Filtres */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:18, padding:"12px 14px", background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0" }}>
                  {/* Filtre type - pills */}
                  <div style={{ display:"flex", gap:4, background:"#e2e8f0", borderRadius:8, padding:3 }}>
                    {[
                      { val:"tous",     label:"Tous",     count: apprenantsParcours.length + apprenantsPrive.length },
                      { val:"parcours", label:"🏫 Parcours", count: apprenantsParcours.length },
                      { val:"prives",   label:"🔒 Privés",   count: apprenantsPrive.length },
                    ].map(opt => (
                      <button key={opt.val} onClick={()=>{ setAppType(opt.val); setApprenantPage(1); }}
                        style={{ padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, transition:"all .15s",
                          background: appType===opt.val ? "#fff" : "transparent",
                          color: appType===opt.val ? PA_COLOR : "#6b7280",
                          boxShadow: appType===opt.val ? "0 1px 4px rgba(0,0,0,.10)" : "none",
                        }}>
                        {opt.label} <span style={{ fontSize:10, fontWeight:600, color: appType===opt.val ? PA_COLOR : "#9ca3af" }}>({opt.count})</span>
                      </button>
                    ))}
                  </div>
                  <input
                    value={appSearchQ} onChange={e=>{ setAppSearchQ(e.target.value); setApprenantPage(1); }}
                    placeholder="🔍 Rechercher un apprenant…"
                    style={{ padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", width:200 }}
                  />
                  <select value={appNiveau} onChange={e=>{ setAppNiveau(e.target.value); setApprenantPage(1); }}
                    style={{ padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", background:"#fff" }}>
                    <option value="tous">Tous niveaux</option>
                    {NIVEAUX.map(n=><option key={n} value={n}>{n}</option>)}
                  </select>
                  {(appSearchQ || appNiveau!=="tous" || appType!=="tous") && (
                    <button onClick={()=>{setAppSearchQ("");setAppNiveau("tous");setAppType("tous");setApprenantPage(1);}} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid #e2e8f0", background:"#f1f5f9", fontSize:12, cursor:"pointer", color:"#6b7280" }}>✕ Effacer</button>
                  )}
                  <span style={{ marginLeft:"auto", fontSize:11, color:"#6b7280" }}>{appFiltered.length} apprenant{appFiltered.length!==1?"s":""}</span>
                </div>

                {/* Chargement */}
                {allApprenantsGroupesLoading && (
                  <div style={{ textAlign:"center", padding:"16px 0", fontSize:12, color:"#9ca3af" }}>Chargement des apprenants…</div>
                )}

                {/* Vide */}
                {allApprenants.length === 0 && !allApprenantsGroupesLoading && (
                  <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"2px dashed #e2e8f0" }}>
                    <div style={{ fontSize:"3.5rem", marginBottom:12 }}>🎓</div>
                    <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:6 }}>Aucun apprenant pour l'instant</div>
                    <div style={{ fontSize:13, color:"#9ca3af", maxWidth:360, margin:"0 auto 20px" }}>
                      Les prospects convertis et les contrats privés apparaîtront ici.
                    </div>
                    <Btn onClick={()=>setActiveTab("prospects")}>Voir les prospects →</Btn>
                  </div>
                )}

                {allApprenants.length > 0 && appFiltered.length === 0 && (
                  <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8", fontSize:13 }}>Aucun apprenant ne correspond aux filtres.</div>
                )}

                {/* Tableau apprenants */}
                {appFiltered.length > 0 && (() => {
                  const appTotalPages = Math.ceil(appFiltered.length / PA_PAGE_SIZE);
                  const appPageSafe   = Math.min(apprenantPage, appTotalPages);
                  const appPage       = appFiltered.slice((appPageSafe - 1) * PA_PAGE_SIZE, appPageSafe * PA_PAGE_SIZE);
                  return (
                  <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Apprenant</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Contact</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Type</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Niveau</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Coach</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Séances</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Paiement</th>
                          <th style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Statut</th>
                          <th style={{ padding:"11px 16px", textAlign:"center", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appPage.map((a, idx) => {
                          if (a._type === "parcours") {
                            const initiales = (a.prospect_nom||"?").split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase();
                            const sd = a.suivi_demarrage || {};
                            // suivi_demarrage.niveau_prospect n'est rempli que par le workflow PA/onboarding
                            // classique - un apprenant créé depuis Inscriptions n'a que niveau_client.
                            const niveauAffiche = sd.niveau_prospect || a.niveau_client || "";
                            const niveauColor = NIVEAU_COLOR[niveauAffiche] || "#6b7280";
                            const tranches = (a.plan_paiement?.tranches) || [];
                            const today2 = new Date(); today2.setHours(0,0,0,0);
                            const tranchesPaye  = tranches.filter(estTranchePayee).reduce((s,t)=>s+(t.montant||0),0);
                            const tranchesTotal = tranches.reduce((s,t)=>s+(t.montant||0),0);
                            const pctTranches = tranchesTotal>0?Math.round((tranchesPaye/tranchesTotal)*100):0;
                            const hasAlertePmt = tranches.some(t=>{ if(t.statut!=="en_attente") return false; const d=new Date(t.date_echeance); d.setHours(0,0,0,0); return d<today2; });
                            const hasAlerteCritique = tranches.some(t=>{ if(t.statut!=="en_attente") return false; const d=new Date(t.date_echeance); d.setHours(0,0,0,0); return Math.ceil((today2-d)/86400000)>7; });
                            const sp = a.suivi_presences || {};
                            const sessions = sp.sessions || [];
                            const seancesCnt = sp.seances_effectuees || sessions.length || 0;
                            const presences = sp.presences || 0;
                            const tauxPart = seancesCnt>0?Math.round((presences/seancesCnt)*100):null;
                            const now2=new Date(); const monday=new Date(now2); monday.setDate(now2.getDate()-((now2.getDay()+6)%7)); monday.setHours(0,0,0,0);
                            const absWeek=sessions.filter(s=>new Date(s.date)>=monday&&s.statut==="absent").length;
                            const sorted2=[...sessions].sort((x,y)=>x.date.localeCompare(y.date));
                            let c2=0,mc2=0; for(const s of sorted2){if(s.statut==="absent"){c2++;if(c2>mc2)mc2=c2;}else c2=0;}
                            const hasAlerteAss = absWeek>2 || mc2>=3;
                            const rowBg = hasAlerteCritique?"#fff1f2":hasAlertePmt?"#fffbeb":hasAlerteAss?"#fefce8":idx%2===0?"#fff":"#fafafa";
                            return (
                              <tr key={`p-${a.id}`}
                                style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer", transition:"background .15s" }}
                                onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"0d"}
                                onMouseLeave={e=>e.currentTarget.style.background=rowBg}
                                onClick={()=>{ setApprenantModal(a); setApprenantTab("infos"); setShowMdpAcces(false); setAddingSession(false); setAddingVersement(false); setSessionForm({date:new Date().toISOString().slice(0,10),statut:"present"}); setVersementForm({montant:"",date:new Date().toISOString().slice(0,10),mode:"Mobile Money",ref:"",notes:"",preuve:null}); setProgNote((a.suivi_presences||{}).notes_progression||""); fetchPaiementsApprenant(a.id); fetchPaSeancesPresences(a.id, a.groupe_id, a.prospect_nom, a.prospect_email); setPaSeancesPrivees([]); setPaPresencesPrivees([]); setAppModalEvals([]); }}
                              >
                                <td style={{ padding:"12px 16px" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                    <div style={{ width:32, height:32, borderRadius:"50%", background:PA_GRADIENT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:11, color:"#fff", flexShrink:0, overflow:"hidden" }}>{a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}</div>
                                    <div>
                                      <div style={{ fontWeight:700, color:"#0f172a" }}>{a.prospect_nom||"-"}</div>
                                      <div style={{ fontSize:10, display:"flex", gap:4, marginTop:2 }}>
                                        {hasAlertePmt && <span title="Retard paiement">💳</span>}
                                        {hasAlerteAss && <span title="Alerte assiduité">⚠️</span>}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding:"12px 16px", fontSize:12, color:"#374151" }}>{a.prospect_email||"-"}</td>
                                <td style={{ padding:"12px 16px" }}>
                                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:"#dbeafe", color:"#1d4ed8", display:"inline-block", width:"fit-content" }}>
                                      {a.type_cours === "hybride" ? "⚡ Hybride" : a.type_cours === "en_ligne" ? "💻 En ligne" : a.type_cours === "domicile" ? "🏠 Domicile" : a.type_cours === "presentiel" ? "🏢 Présentiel" : "-"}
                                    </span>
                                    {a.type_coaching && (
                                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:"#f0fdf4", color:"#15803d", display:"inline-block", width:"fit-content" }}>
                                        {a.type_coaching === "prive" ? "👤 Privé" : ["groupe","standard"].includes(a.type_coaching) ? "👥 Groupe" : a.type_coaching}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding:"12px 16px" }}>
                                  {niveauAffiche
                                    ? <span style={{ fontSize:11, fontWeight:800, padding:"3px 9px", borderRadius:999, color:"#fff", background:niveauColor }}>{niveauAffiche}</span>
                                    : <span style={{ color:"#94a3b8", fontSize:12 }}>-</span>
                                  }
                                </td>
                                <td style={{ padding:"12px 16px", fontSize:12, color:"#64748b" }}>
                                  {(() => {
                                    const coachInfo = paCoachsList.find(c=>c.id===sd.coach_id);
                                    // Repli sur le coach réel de la classe (coaching de groupe) quand
                                    // suivi_demarrage.coach_id n'est pas renseigné (uniquement rempli
                                    // pour un coaching privé assigné par le PA).
                                    return coachInfo ? `${coachInfo.prenom} ${coachInfo.nom}` : (coachNomParGroupe[a.groupe_id] || "-");
                                  })()}
                                </td>
                                <td style={{ padding:"12px 16px" }}>
                                  {(() => {
                                    // Vraies séances (table unifiée `seances`, par groupe_id) prioritaires
                                    // sur suivi_presences (blob JSON manuel jamais alimenté par le coach).
                                    const seancesReelles = paSeancesParGroupe[a.groupe_id];
                                    const cnt = seancesReelles?.realisees || seancesCnt;
                                    return cnt > 0
                                      ? <div style={{ fontSize:12, color:"#374151" }}>
                                          <div>{cnt} séance{cnt>1?"s":""}</div>
                                          {tauxPart!==null && <div style={{ fontSize:11, color:tauxPart>=80?"#15803d":tauxPart>=60?"#d97706":"#ef4444", fontWeight:700 }}>✅ {tauxPart}%</div>}
                                        </div>
                                      : <span style={{ fontSize:11, color:"#94a3b8" }}>-</span>;
                                  })()}
                                </td>
                                <td style={{ padding:"12px 16px" }}>
                                  {tranches.length > 0
                                    ? <div>
                                        <div style={{ height:5, borderRadius:999, background:"#e5e7eb", overflow:"hidden", marginBottom:3, width:80 }}>
                                          <div style={{ height:"100%", borderRadius:999, background:pctTranches>=100?"#22c55e":"#7c3aed", width:`${Math.min(100,pctTranches)}%` }} />
                                        </div>
                                        <div style={{ fontSize:10, fontWeight:700, color:(tranchesTotal-tranchesPaye)>0?"#ef4444":"#22c55e" }}>
                                          {(tranchesTotal-tranchesPaye)>0?`${Number(tranchesTotal-tranchesPaye).toLocaleString("fr-FR")} F rest.`:"✓ Soldé"}
                                        </div>
                                      </div>
                                    // Pas de plan à échéances (tranches) : afficher le montant réel déjà
                                    // encaissé (montant_paye) plutôt que "Aucun plan" alors qu'un
                                    // paiement existe bel et bien (enregistré côté commerciale/onboarding).
                                    : a.montant_paye > 0
                                    ? <div style={{ fontSize:12, fontWeight:700, color:"#16a34a" }}>{Number(a.montant_paye).toLocaleString("fr-FR")} F</div>
                                    : <span style={{ fontSize:11, color:"#94a3b8" }}>Aucun plan</span>
                                  }
                                </td>
                                <td style={{ padding:"12px 16px" }}>
                                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                    <span style={{ fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:999, background:"#dcfce7", color:"#16a34a", width:"fit-content" }}>✅ Converti</span>
                                    {a.acces_bloque && <span title="Accès bloqué" style={{ fontSize:10, background:"#fee2e2", color:"#991b1b", border:"1px solid #fca5a5", borderRadius:99, padding:"2px 7px", fontWeight:700, whiteSpace:"nowrap", width:"fit-content" }}>🔒 Suspendu</span>}
                                  </div>
                                </td>
                                <td style={{ padding:"12px 16px", textAlign:"center" }}>
                                  <button onClick={e=>{ e.stopPropagation(); setPlainteModal(a); setPlainteForm({ objet:"", description:"", priorite:"normale" }); }}
                                    style={{ padding:"4px 9px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:6, fontSize:10, fontWeight:700, cursor:"pointer" }}>
                                    🚨
                                  </button>
                                </td>
                              </tr>
                            );
                          }

                          /* ── Ligne PRIVÉ ── */
                          const nom = `${a.apprenant_prenom||""} ${a.apprenant_nom}`.trim();
                          const initiales = nom.split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase() || "?";
                          const niveauColor = NIVEAU_COLOR[a.niveau] || "#6b7280";
                          const type = CONTRAT_TYPE[a.type_contrat] || CONTRAT_TYPE.en_ligne;
                          const stCfg = CONTRAT_STATUT[a.statut] || CONTRAT_STATUT.en_attente;
                          const coachInfo = paCoachsList.find(c=>c.id===a.coach_id);
                          const rowBg2 = idx%2===0?"#fff":"#fafafa";
                          return (
                            <tr key={`c-${a.id}`}
                              style={{ borderBottom:"1px solid #f1f5f9", background:rowBg2, transition:"background .15s", cursor:"pointer" }}
                              onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"0d"}
                              onMouseLeave={e=>e.currentTarget.style.background=rowBg2}
                              onClick={()=>{ setPriveDetailModal(a); setPriveDetailTab("infos"); }}
                            >
                              <td style={{ padding:"12px 16px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <div style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,#0f172a,${type.color})`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:11, color:"#fff", flexShrink:0 }}>{initiales}</div>
                                  <span style={{ fontWeight:700, color:"#0f172a" }}>{nom||"-"}</span>
                                </div>
                              </td>
                              <td style={{ padding:"12px 16px" }}>
                                <div style={{ fontSize:12, color:"#374151" }}>{a.apprenant_email||"-"}</div>
                                {a.apprenant_telephone && <div style={{ fontSize:11, color:"#64748b" }}>📞 {a.apprenant_telephone}</div>}
                              </td>
                              <td style={{ padding:"12px 16px" }}>
                                <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:"#f3e8ff", color:"#7c3aed", display:"inline-block", width:"fit-content" }}>🔒 Privé</span>
                                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:999, background:type.bg, color:type.color, display:"inline-block", width:"fit-content" }}>{type.icon} {type.label}</span>
                                </div>
                              </td>
                              <td style={{ padding:"12px 16px" }}>
                                {/* Pas d'ancien niveau ici : cette liste lit `assignations_parcours`
                                    (le dossier commercial), pas `groupes_apprenants` (l'inscription en
                                    classe) - `niveau_precedent` n'y existe pas. L'afficher aurait été du
                                    code mort donnant l'illusion de fonctionner. */}
                                {a.niveau
                                  ? <span style={{ fontSize:11, fontWeight:800, padding:"3px 9px", borderRadius:999, color:"#fff", background:niveauColor }}>{a.niveau}</span>
                                  : <span style={{ color:"#94a3b8", fontSize:12 }}>-</span>
                                }
                              </td>
                              <td style={{ padding:"12px 16px", fontSize:12, color:"#64748b" }}>
                                {coachInfo ? `${coachInfo.prenom} ${coachInfo.nom}` : "-"}
                              </td>
                              <td style={{ padding:"12px 16px", fontSize:12, color:"#374151" }}>
                                {a.nb_seances_realisees||0}/{a.nb_seances_total||0}
                              </td>
                              <td style={{ padding:"12px 16px" }}>
                                {/* Montant réellement payé (assignations_parcours.montant_paye) - le calcul
                                    prix_h × durée × séances n'a jamais eu de tarif réel derrière (toujours 0),
                                    donc la barre de progression ne s'affichait jamais. */}
                                {a.montant_paye > 0
                                  ? <div>
                                      <div style={{ fontSize:12, fontWeight:700, color:"#16a34a" }}>{formatMoney(a.montant_paye)}</div>
                                      <span style={{ fontSize:10, color: a.paiement_confirme?"#15803d":"#d97706", fontWeight:700 }}>
                                        {a.paiement_confirme?"✅ Confirmé":"⏳ En attente"}
                                      </span>
                                    </div>
                                  : <span style={{ fontSize:11, color: a.paiement_confirme?"#15803d":"#d97706", fontWeight:700 }}>
                                      {a.paiement_confirme?"✅ Confirmé":"⏳ En attente"}
                                    </span>
                                }
                              </td>
                              <td style={{ padding:"12px 16px" }}>
                                <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                  <span style={{ background:stCfg.bg, color:stCfg.color, borderRadius:99, padding:"3px 9px", fontSize:10, fontWeight:800, whiteSpace:"nowrap", width:"fit-content" }}>{stCfg.label}</span>
                                  {a.acces_bloque && <span title="Accès bloqué" style={{ fontSize:10, background:"#fee2e2", color:"#991b1b", border:"1px solid #fca5a5", borderRadius:99, padding:"2px 7px", fontWeight:700, whiteSpace:"nowrap", width:"fit-content" }}>🔒 Suspendu</span>}
                                </div>
                              </td>
                              <td style={{ padding:"12px 16px", textAlign:"center" }}>
                                <button onClick={e=>{ e.stopPropagation(); setPlainteModal(a); setPlainteForm({ objet:"", description:"", priorite:"normale" }); }}
                                  style={{ padding:"4px 9px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:6, fontSize:10, fontWeight:700, cursor:"pointer" }}>
                                  🚨
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Pagination apprenants ── */}
                  {appTotalPages > 1 && (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"#fff", borderTop:"1px solid #e2e8f0", borderRadius:"0 0 14px 14px", marginTop:-1 }}>
                      <span style={{ fontSize:12, color:"#6b7280" }}>
                        {(appPageSafe-1)*PA_PAGE_SIZE+1}–{Math.min(appPageSafe*PA_PAGE_SIZE, appFiltered.length)} sur {appFiltered.length} apprenants
                      </span>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>setApprenantPage(1)} disabled={appPageSafe===1}
                          style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:appPageSafe===1?"not-allowed":"pointer", color:"#6b7280", opacity:appPageSafe===1?.4:1 }}>«</button>
                        <button onClick={()=>setApprenantPage(p=>Math.max(1,p-1))} disabled={appPageSafe===1}
                          style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:appPageSafe===1?"not-allowed":"pointer", color:"#6b7280", opacity:appPageSafe===1?.4:1 }}>‹</button>
                        {Array.from({length:appTotalPages},(_,i)=>i+1).filter(n=>Math.abs(n-appPageSafe)<=2).map(n=>(
                          <button key={n} onClick={()=>setApprenantPage(n)}
                            style={{ padding:"5px 10px", borderRadius:7, border:`1.5px solid ${n===appPageSafe?PA_COLOR:"#e2e8f0"}`, background:n===appPageSafe?PA_COLOR:"#f8fafc", fontSize:12, fontWeight:700, cursor:"pointer", color:n===appPageSafe?"#fff":"#374151", minWidth:32 }}>{n}</button>
                        ))}
                        <button onClick={()=>setApprenantPage(p=>Math.min(appTotalPages,p+1))} disabled={appPageSafe===appTotalPages}
                          style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:appPageSafe===appTotalPages?"not-allowed":"pointer", color:"#6b7280", opacity:appPageSafe===appTotalPages?.4:1 }}>›</button>
                        <button onClick={()=>setApprenantPage(appTotalPages)} disabled={appPageSafe===appTotalPages}
                          style={{ padding:"5px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#f8fafc", fontSize:12, cursor:appPageSafe===appTotalPages?"not-allowed":"pointer", color:"#6b7280", opacity:appPageSafe===appTotalPages?.4:1 }}>»</button>
                      </div>
                    </div>
                  )}

                  </div>
                  );
                })()}

                {/* Chat panel */}
                {chatApprenant && activeTab === "apprenants" && (
                  <div style={{ marginTop:24 }}>
                    <ProspectChatPanel assignation={chatApprenant} profil={profil} onClose={()=>setChatApprenant(null)} />
                  </div>
                )}

              </div>
            );
          })()}

          {/* ── MODAL DÉTAIL APPRENANT PRIVÉ (groupes is_prive=true) ──
              Même habillage visuel que le modal "Parcours" (header dégradé, avatar,
              barre d'onglets) mais logique séparée : les données viennent de
              `groupes_apprenants`, pas de `assignations_parcours`. */}
          {priveDetailModal && (() => {
            const pd = priveDetailModal;
            const nomComplet = `${pd.prenom_apprenant||""} ${pd.nom_apprenant||""}`.trim() || "-";
            const initialesP = nomComplet.split(" ").map(p=>p[0]).filter(Boolean).slice(0,2).join("").toUpperCase() || "?";
            let noteObj = {};
            try { noteObj = pd.note_obj && typeof pd.note_obj === "object" ? pd.note_obj : JSON.parse(pd.note || "{}"); } catch {}
            const NIVEAU_COLOR_P = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
            const niveauColorP = NIVEAU_COLOR_P[pd.niveau] || "#6b7280";
            const STATUT_CFG = {
              actif:   { label:"Actif",   bg:"#dcfce7", color:"#16a34a" },
              pause:   { label:"En pause",bg:"#fef3c7", color:"#b45309" },
              retire:  { label:"Retiré",  bg:"#fee2e2", color:"#dc2626" },
            };
            const stCfg2 = STATUT_CFG[pd.statut] || { label:pd.statut||"-", bg:"#f1f5f9", color:"#64748b" };
            const PRIVE_TABS = [
              { id:"infos",     label:"📋 Informations" },
              { id:"paiement",  label:"💳 Paiement" },
              { id:"suivi",     label:"📊 Suivi assiduité" },
              { id:"prog",      label:"📈 Progression" },
            ];
            const PAIEMENT_CFG_PRIVE = {
              paye:        { bg:"#dcfce7", color:"#15803d", label:"Payé ✓" },
              payé:        { bg:"#dcfce7", color:"#15803d", label:"Payé ✓" },
              confirme:    { bg:"#dcfce7", color:"#15803d", label:"Payé ✓" },
              partiel:     { bg:"#fef3c7", color:"#92400e", label:"Partiel" },
              en_attente:  { bg:"#e0f2fe", color:"#0369a1", label:"En attente" },
              impaye:      { bg:"#fee2e2", color:"#991b1b", label:"Impayé" },
            };
            const pdPaiementCfg = PAIEMENT_CFG_PRIVE[pd.statut_paiement] || { bg:"#f1f5f9", color:"#64748b", label: pd.statut_paiement || "-" };
            const pdPlan = pd.plan_paiement || {};
            const pdTranches = Array.isArray(pdPlan) ? pdPlan : (pdPlan.tranches || []);
            return (
              <div onClick={()=>setPriveDetailModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}>
                <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.25)", display:"flex", flexDirection:"column" }}>

                  {/* Header gradient - même style que le modal Parcours */}
                  <div style={{ background:PA_GRADIENT, padding:"20px 26px", borderRadius:"18px 18px 0 0", display:"flex", alignItems:"center", gap:14, position:"sticky", top:0, zIndex:10, flexShrink:0 }}>
                    <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:18, color:"#fff", flexShrink:0 }}>{initialesP}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:17, fontWeight:800, color:"#fff" }}>{nomComplet}</div>
                      <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", display:"flex", gap:12, flexWrap:"wrap", marginTop:2 }}>
                        {(pd.apprenant_email || pd.email_apprenant) && <span>{pd.apprenant_email || pd.email_apprenant}</span>}
                        {(pd.apprenant_telephone || pd.telephone) && <span>📞 {pd.apprenant_telephone || pd.telephone}</span>}
                        {pd.niveau && <span style={{ background:niveauColorP, color:"#fff", borderRadius:99, padding:"1px 8px", fontWeight:800, fontSize:11 }}>{pd.niveau}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:800, padding:"4px 12px", borderRadius:999, background:"rgba(255,255,255,0.2)", color:"#fff" }}>🔒 Privé</span>
                    <span style={{ fontSize:11, fontWeight:800, padding:"4px 12px", borderRadius:999, background:stCfg2.bg, color:stCfg2.color }}>{stCfg2.label}</span>
                    <button onClick={()=>setPriveDetailModal(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:16, flexShrink:0 }}>✕</button>
                  </div>

                  {/* Onglets - même style que le modal Parcours */}
                  <div style={{ display:"flex", borderBottom:"2px solid #e2e8f0", background:"#f8fafc", padding:"0 24px", flexShrink:0, overflowX:"auto" }}>
                    {PRIVE_TABS.map(t=>(
                      <button key={t.id} onClick={()=>setPriveDetailTab(t.id)}
                        style={{ padding:"12px 16px", border:"none", background:"none", cursor:"pointer", fontSize:13, fontWeight:priveDetailTab===t.id?800:500, color:priveDetailTab===t.id?PA_COLOR:"#64748b", borderBottom:priveDetailTab===t.id?`2.5px solid ${PA_COLOR}`:"2.5px solid transparent", marginBottom:-2, whiteSpace:"nowrap" }}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Contenu */}
                  <div style={{ padding:24, flex:1 }}>

                    {priveDetailTab === "infos" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        <div>
                          <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:10 }}>Coaching</div>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:10 }}>
                            <div style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Groupe / contrat</div>
                              <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{pd.groupe_nom || "-"}</div>
                            </div>
                            <div style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Coach</div>
                              <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{pd.coach_nom || "-"}</div>
                            </div>
                            <div style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Format</div>
                              <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{pd.groupe_type_cours || "-"}</div>
                            </div>
                            <div style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
                              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:3 }}>Depuis le</div>
                              <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{pd.date_ajout ? new Date(pd.date_ajout).toLocaleDateString("fr-FR") : "-"}</div>
                            </div>
                          </div>
                        </div>

                        {(noteObj.programme || noteObj.description || noteObj.attentes) ? (
                          <div>
                            <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", marginBottom:10 }}>Programme</div>
                            <div style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", borderRadius:12, padding:"16px 18px", border:"1.5px solid #c4b5fd", display:"flex", flexDirection:"column", gap:8, fontSize:13, color:"#374151" }}>
                              {noteObj.programme && <div><strong>Programme :</strong> {noteObj.programme}</div>}
                              {noteObj.description && <div><strong>Description :</strong> {noteObj.description}</div>}
                              {noteObj.attentes && <div><strong>Attentes :</strong> {noteObj.attentes}</div>}
                            </div>
                          </div>
                        ) : (
                          <div style={{ background:"#fffbeb", borderRadius:10, padding:"12px 16px", border:"1.5px solid #fde68a", fontSize:12, color:"#92400e", fontWeight:700 }}>
                            ⚠️ Programme non encore renseigné.
                          </div>
                        )}
                      </div>
                    )}

                    {priveDetailTab === "paiement" && (
                      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
                          <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", border:"1px solid #e5e7eb" }}>
                            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Statut</div>
                            <span style={{ display:"inline-block", padding:"3px 12px", borderRadius:20, background:pdPaiementCfg.bg, color:pdPaiementCfg.color, fontWeight:800, fontSize:12 }}>{pdPaiementCfg.label}</span>
                          </div>
                          <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", border:"1px solid #e5e7eb" }}>
                            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Montant payé</div>
                            <div style={{ fontSize:16, fontWeight:800, color:"#0f172a" }}>{pd.montant_paye!=null ? `${Number(pd.montant_paye).toLocaleString("fr-FR")} FCFA` : "-"}</div>
                          </div>
                          <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", border:"1px solid #e5e7eb" }}>
                            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Mode de paiement</div>
                            <div style={{ fontSize:13, fontWeight:600, color: pd.mode_paiement?"#0f172a":"#94a3b8" }}>{pd.mode_paiement || "Non renseigné"}</div>
                          </div>
                          <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", border:"1px solid #e5e7eb" }}>
                            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Offre souscrite</div>
                            <div style={{ fontSize:13, fontWeight:600, color: pd.inscription_offre?"#0f172a":"#94a3b8" }}>{pd.inscription_offre || "Non renseignée"}</div>
                          </div>
                        </div>

                        {pdTranches.length > 0 ? (
                          <div style={{ background:"#f8fafc", borderRadius:12, padding:16, border:"1px solid #e5e7eb" }}>
                            <div style={{ fontSize:11, fontWeight:800, color:"#1e3a5f", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>🗓️ Plan de paiement ({pdTranches.length} tranche{pdTranches.length>1?"s":""})</div>
                            <div style={{ borderRadius:10, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                              {pdTranches.map((t,i)=>{
                                const estPaye = t.statut==="paye"||t.statut==="payé";
                                return (
                                  <div key={t.id||i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:i%2===0?"#fff":"#fafafa", borderBottom:i<pdTranches.length-1?"1px solid #f1f5f9":"none" }}>
                                    <div>
                                      <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{t.label || `Tranche ${i+1}`}</div>
                                      {(t.date||t.date_echeance) && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>📅 {new Date(t.date||t.date_echeance).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>}
                                    </div>
                                    <div style={{ textAlign:"right" }}>
                                      <div style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>{t.montant!=null ? `${Number(t.montant).toLocaleString("fr-FR")} FCFA` : "-"}</div>
                                      <span style={{ display:"inline-block", marginTop:2, padding:"2px 8px", borderRadius:20, fontSize:10, fontWeight:700, background:estPaye?"#dcfce7":"#fef3c7", color:estPaye?"#15803d":"#92400e" }}>{estPaye?"Payé":"En attente"}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ background:"#fffbeb", borderRadius:10, padding:"12px 16px", border:"1.5px solid #fde68a", fontSize:12, color:"#92400e", fontWeight:700 }}>
                            ⚠️ Aucun plan de paiement échelonné enregistré pour ce dossier.
                          </div>
                        )}
                      </div>
                    )}

                    {priveDetailTab === "suivi" && (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12 }}>
                        {[
                          { l:"Assiduité", v:pd.assiduite!=null?`${pd.assiduite}%`:"-", color: pd.assiduite>=80?"#16a34a":pd.assiduite>=60?"#d97706":"#dc2626" },
                          { l:"Absences",  v:pd.absences ?? "-", color:"#374151" },
                          { l:"Retards",   v:pd.retards ?? "-", color:"#374151" },
                        ].map(k => (
                          <div key={k.l} style={{ background:"#f8fafc", borderRadius:10, padding:"14px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>{k.l}</div>
                            <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.v}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {priveDetailTab === "prog" && (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12 }}>
                        {[
                          { l:"Progression",    v:pd.progression!=null?`${pd.progression}%`:"-", color: pd.progression>=60?"#16a34a":"#d97706" },
                          { l:"Dernière note",  v:pd.derniere_note!=null?`${pd.derniere_note}/20`:"-", color:"#374151" },
                        ].map(k => (
                          <div key={k.l} style={{ background:"#f8fafc", borderRadius:10, padding:"14px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                            <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>{k.l}</div>
                            <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.v}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ padding:"14px 24px", borderTop:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", flexShrink:0 }}>
                    <button onClick={()=>{ setPriveDetailModal(null); setPlainteModal(pd); setPlainteForm({ objet:"", description:"", priorite:"normale" }); }}
                      style={{ padding:"9px 16px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      🚨 Signaler un problème
                    </button>
                    <button onClick={()=>setPriveDetailModal(null)}
                      style={{ padding:"9px 18px", background:"#f1f5f9", border:"none", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:13, color:"#475569" }}>
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── MODAL SIGNALER UN PROBLÈME ── */}
          {plainteModal && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}
              onClick={e=>{ if(e.target===e.currentTarget) setPlainteModal(null); }}>
              <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", boxShadow:"0 24px 64px rgba(0,0,0,.2)", overflow:"hidden", display:"flex", flexDirection:"column" }}>
                <div style={{ background:"linear-gradient(135deg,#7f1d1d,#dc2626)", padding:"18px 24px", color:"#fff" }}>
                  <div style={{ fontSize:18, fontWeight:800 }}>🚨 Signaler un problème</div>
                  <div style={{ fontSize:12, color:"#fecaca", marginTop:3 }}>
                    {plainteModal._type === "prive"
                      ? `${plainteModal.apprenant_prenom||""} ${plainteModal.apprenant_nom}`.trim()
                      : plainteModal.prospect_nom}
                    {" "}- sera transmis au Customer Care
                  </div>
                </div>
                <div style={{ padding:24, display:"flex", flexDirection:"column", gap:14, overflowY:"auto", flex:1 }}>
                  <div>
                    <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Objet de la plainte *</label>
                    <select value={plainteForm.objet} onChange={e=>setPlainteForm(p=>({...p,objet:e.target.value}))}
                      style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff", outline:"none" }}>
                      <option value="">- Sélectionner un objet -</option>
                      {OBJETS_PLAINTE.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Priorité</label>
                    <div style={{ display:"flex", gap:6 }}>
                      {[
                        { val:"faible",   label:"🟢 Faible",   bg:"#dcfce7", c:"#16a34a" },
                        { val:"normale",  label:"🔵 Normale",  bg:"#e0f2fe", c:"#0891b2" },
                        { val:"haute",    label:"🟡 Haute",    bg:"#fef3c7", c:"#d97706" },
                        { val:"critique", label:"🔴 Critique", bg:"#fee2e2", c:"#dc2626" },
                      ].map(opt=>(
                        <button key={opt.val} onClick={()=>setPlainteForm(p=>({...p,priorite:opt.val}))}
                          style={{ flex:1, padding:"6px 4px", border:`1.5px solid ${plainteForm.priorite===opt.val?opt.c:"#e2e8f0"}`, borderRadius:7, background:plainteForm.priorite===opt.val?opt.bg:"#fff", color:plainteForm.priorite===opt.val?opt.c:"#9ca3af", fontWeight:700, fontSize:10, cursor:"pointer" }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Description du problème</label>
                    <textarea value={plainteForm.description} onChange={e=>setPlainteForm(p=>({...p,description:e.target.value}))}
                      placeholder="Décrivez le problème en détail…"
                      rows={4} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, resize:"vertical", outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
                    <button onClick={()=>setPlainteModal(null)} style={{ padding:"9px 18px", background:"#f3f4f6", color:"#374151", border:"none", borderRadius:8, fontSize:13, cursor:"pointer" }}>Annuler</button>
                    <button onClick={signalerPlainte} disabled={plainteSaving||!plainteForm.objet||!peut("support","create")}
                      title={permBtnTitle("Signaler", peut("support","create"))}
                      style={{ padding:"9px 20px", background:"#dc2626", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", opacity:(plainteSaving||!plainteForm.objet||!peut("support","create"))?.6:1 }}>
                      {plainteSaving ? "⏳ Envoi…" : peut("support","create") ? "🚨 Signaler" : "🔒 Signaler"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════
              ONGLET DASHBOARD
          ══════════════════════════════════ */}
          {activeTab === "dashboard" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {/* KPIs */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                <StatCard label="Cours privés actifs" value={stats.actifs}           icon="📚" color={PA_COLOR} sub="en cours"  />
                <StatCard label="Coaches affectés"    value={stats.coachesActifs}     icon="👨‍🏫" color="#0891b2" sub="ce mois"   />
                <StatCard label="Honoraires du mois"  value={formatMoney(stats.totalHonoraires)} icon="💰" color="#16a34a" sub="à transmettre RH" onClick={()=>setActiveTab("honoraires")} />
                <StatCard label="Séances validées"    value={`${stats.seancesValidees}/${stats.seancesTotal}`} icon="✅" color="#f59e0b" sub="ce mois" onClick={()=>setActiveTab("honoraires")} />
              </div>

              {/* Alertes */}
              {stats.aValider > 0 && (
                <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:12, padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:20 }}>⏰</span>
                    <div>
                      <div style={{ fontWeight:700, color:"#c2410c", fontSize:13 }}>{stats.aValider} séance{stats.aValider>1?"s":""} en attente de validation</div>
                      <div style={{ fontSize:12, color:"#9a3412", marginTop:1 }}>Validez les récapitulatifs mensuels avant transmission aux RH</div>
                    </div>
                  </div>
                  <Btn onClick={()=>setActiveTab("honoraires")}>Valider maintenant →</Btn>
                </div>
              )}

              {/* Cours actifs + suivi rapide */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <Section title="🏃 Cours en cours">
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {allContratsPrives.filter(c=>c.statut==="actif").slice(0,4).map(c => {
                      const coachInfo = paCoachsList.find(co=>String(co.id)===String(c.coach_id));
                      const coachNom  = coachInfo ? `${coachInfo.prenom||""} ${coachInfo.nom||""}`.trim() : "-";
                      const appNom    = `${c.apprenant_prenom||""} ${c.apprenant_nom||""}`.trim();
                      return (
                        <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", background:"#f8fafc", borderRadius:8 }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13 }}>{appNom||"-"}</div>
                            <div style={{ fontSize:11, color:"#64748b" }}>{coachNom} · {c.niveau||"-"} · {c.type_contrat||"-"}</div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <Badge label={c.niveau||"-"} color={PA_COLOR} bg={PA_LIGHT} />
                            <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{c.date_debut ? new Date(c.date_debut).toLocaleDateString("fr-FR",{month:"short",year:"numeric"}) : "-"}</div>
                          </div>
                        </div>
                      );
                    })}
                    {allContratsPrives.filter(c=>c.statut==="actif").length === 0 && (
                      <div style={{ textAlign:"center", padding:16, color:"#9ca3af", fontSize:13 }}>Aucun cours actif</div>
                    )}
                  </div>
                </Section>

                <Section title="👨‍🏫 Coaches actifs">
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {paCoachsList.filter(c=>c.actif!==false).slice(0,5).map(c => (
                      <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", background:"#f8fafc", borderRadius:8 }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13 }}>{`${c.prenom||""} ${c.nom||""}`.trim()||"-"}</div>
                          <div style={{ fontSize:11, color:"#64748b" }}>{Array.isArray(c.specialites)?c.specialites[0]:c.specialites||"-"}</div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                          <Badge label={c.actif!==false?"Actif":"Inactif"} color={c.actif!==false?"#16a34a":"#dc2626"} bg={c.actif!==false?"#dcfce7":"#fee2e2"} />
                          {c.taux_horaire ? <div style={{ fontSize:10, color:"#94a3b8" }}>{formatMoney(c.taux_horaire)}/h</div> : null}
                        </div>
                      </div>
                    ))}
                    {paCoachsList.length===0 && <div style={{ textAlign:"center", padding:16, color:"#9ca3af", fontSize:13 }}>Aucun coach enregistré</div>}
                  </div>
                </Section>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════
              ONGLET HONORAIRES (réel - honoraires_mois / seances)
              Un seul écran, design aligné sur bet-elearning : liste des coachs +
              modal détail gérant tout le cycle (calcul → validation par séance →
              validation fiche → transmission RH → paiement).
          ══════════════════════════════════ */}
          {activeTab === "honoraires" && (() => {
            const STATUT_HON_TR = {
              en_attente: { lib:"En attente",          bg:"#FEF3C7", c:"#B45309" },
              valide:     { lib:"Validé (à envoyer)",  bg:"#E0E7FF", c:"#4338CA" },
              transmis:   { lib:"Transmis → RH",       bg:"#DBEAFE", c:"#1D4ED8" },
              paye:       { lib:"Payé",                bg:"#D1FAE5", c:"#065F46" },
              litige:     { lib:"Litige",              bg:"#FEE2E2", c:"#991B1B" },
            };
            const STATUT_SEANCE_TR = {
              en_attente: { lib:"En attente", bg:"#FEF3C7", c:"#B45309" },
              valide:     { lib:"Validée",    bg:"#DBEAFE", c:"#1D4ED8" },
              rejete:     { lib:"Rejetée",    bg:"#FEE2E2", c:"#991B1B" },
            };
            const coachsAvecHon = new Set(trBulletins.map(h=>h.coach_id));
            const coachsSansHon = trCoachs.filter(c=>!coachsAvecHon.has(c.id));
            const moisLabelTr = `${MOIS_LABELS[trMois]} ${trAnnee}`;

            return (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {trFlash && (
                <div style={{ padding:"12px 18px", borderRadius:10, background:trFlash.type==="ok"?"#D1FAE5":"#FEE2E2", color:trFlash.type==="ok"?"#065F46":"#991B1B", fontSize:13, fontWeight:600 }}>
                  {trFlash.msg}
                </div>
              )}

              <div style={{ background:"linear-gradient(135deg,#059669,#047857)", borderRadius:14, padding:"18px 24px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                  <div>
                    <div style={{ fontSize:17, fontWeight:800, color:"#fff" }}>📤 Transmission des honoraires à la RH</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.75)", marginTop:3 }}>Calcul depuis les séances réalisées · Validation puis transmission séparées</div>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    {MOIS_LABELS.slice(1).map((m,i) => (
                      <button key={m} onClick={() => setTrMois(i+1)}
                        style={{ padding:"4px 9px", borderRadius:20, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", background:trMois===i+1?"#fff":"rgba(255,255,255,0.2)", color:trMois===i+1?"#059669":"#fff" }}>
                        {m}
                      </button>
                    ))}
                    {[2024,2025,2026,2027].map(y => (
                      <button key={y} onClick={() => setTrAnnee(y)}
                        style={{ padding:"4px 9px", borderRadius:20, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", background:trAnnee===y?"#fff":"rgba(255,255,255,0.2)", color:trAnnee===y?"#059669":"#fff" }}>
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                <button onClick={()=>setGrilleModalOpen(true)}
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, border:"1px solid #DDD6FE", background:"#F5F3FF", color:"#6D28D9", fontSize:12, fontWeight:700, cursor:"pointer" }}>🎛️ Grille tarifaire</button>
                <button onClick={trExporterListePdf}
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, border:"1px solid #FCA5A5", background:"#FEF2F2", color:"#991B1B", fontSize:12, fontWeight:700, cursor:"pointer" }}>📄 PDF</button>
                <button onClick={trExporterListeExcel}
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, border:"1px solid #BBF7D0", background:"#F0FDF4", color:"#059669", fontSize:12, fontWeight:700, cursor:"pointer" }}>📊 Excel</button>
              </div>

              {/* KPI cards - mêmes 6 indicateurs que côté bet-elearning */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
                {[
                  { l:"Coachs",        v: trBulletins.length, c:"#0f172a" },
                  { l:"Total séances", v: trBulletins.reduce((s,h)=>s+(h.nb_seances||0),0), c:"#0EA5E9" },
                  { l:"Total heures",  v: `${trBulletins.reduce((s,h)=>s+(h.total_heures||0),0).toFixed(1)}h`, c:"#8B5CF6" },
                  { l:"Montant total", v: formatMoney(trBulletins.reduce((s,h)=>s+(h.montant_net??h.montant_total??0),0)), c:"#059669" },
                  { l:"À valider",     v: trBulletins.filter(h=>h.statut==="en_attente").length, c:"#D97706" },
                  { l:"Validés RH",    v: trBulletins.filter(h=>h.statut==="transmis"||h.statut==="paye").length, c:"#4338CA" },
                ].map(k => (
                  <div key={k.l} style={{ background:"#fff", borderRadius:12, border:"1px solid #E5E7EB", padding:"14px 16px", textAlign:"center" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#94a3af", textTransform:"uppercase", letterSpacing:".04em", marginBottom:6 }}>{k.l}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                  </div>
                ))}
              </div>

              {coachsSansHon.length > 0 && (() => {
                // Un coach sans séance n'a rien à facturer : lui calculer une fiche produit
                // un bulletin à 0 FCFA, indistinguable d'un vrai. On sépare donc les deux
                // populations plutôt que de tous les présenter à l'identique.
                const nbSeancesDe = (id) => trAFacturer.par_coach?.[id]?.total || 0;
                const aCalculer   = coachsSansHon.filter(c => nbSeancesDe(c.id) > 0);
                const sansSeance  = coachsSansHon.filter(c => nbSeancesDe(c.id) === 0);
                const peutGerer   = peut("honoraires","manage");

                // Mois entièrement vide : ce n'est pas un manquement du PA, c'est qu'il n'y
                // a rien eu à facturer. L'avertissement orange serait un faux signal.
                if (trAFacturer.total_seances === 0) return (
                  <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:20 }}>📭</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13.5, color:"#334155" }}>Aucune séance enregistrée pour {moisLabelTr}</div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
                        Rien à facturer : les {coachsSansHon.length} coachs sans fiche n'ont donné aucune séance ce mois-ci.
                      </div>
                    </div>
                  </div>
                );

                const filtres = (trRechCoach.trim()
                  ? aCalculer.filter(c => `${c.prenom||""} ${c.nom||""}`.toLowerCase().includes(trRechCoach.trim().toLowerCase()))
                  : aCalculer);

                return (
                <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12, padding:16 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:240 }}>
                      <div style={{ fontWeight:700, fontSize:13.5, color:"#92400E" }}>
                        {aCalculer.length} fiche{aCalculer.length>1?"s":""} à calculer pour {moisLabelTr}
                      </div>
                      <div style={{ fontSize:12, color:"#a16207", marginTop:2 }}>
                        {sansSeance.length > 0
                          ? `${sansSeance.length} autre${sansSeance.length>1?"s":""} coach${sansSeance.length>1?"s":""} sans fiche n'${sansSeance.length>1?"ont":"a"} aucune séance ce mois-ci - rien à facturer.`
                          : "Tous les coachs sans fiche ont des séances à facturer."}
                      </div>
                    </div>
                    {aCalculer.length > 0 && (
                      <button
                        onClick={() => trCalculerLot(aCalculer)}
                        disabled={!!trLot || !peutGerer}
                        title={permBtnTitle("Calculer toutes les fiches", peutGerer)}
                        style={{ padding:"9px 18px", borderRadius:8, border:"none",
                          background: (trLot||!peutGerer) ? "#e5e7eb" : "#92400E",
                          color: (trLot||!peutGerer) ? "#9ca3af" : "#fff",
                          fontSize:12.5, fontWeight:800, cursor:(trLot||!peutGerer)?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
                        {trLot ? `⏳ ${trLot.fait}/${trLot.total}…` : !peutGerer ? "🔒 Calculer" : `🔢 Calculer les ${aCalculer.length} fiches`}
                      </button>
                    )}
                    {aCalculer.length > 0 && (
                      <button onClick={() => setTrListeOuverte(o => !o)}
                        style={{ padding:"9px 14px", borderRadius:8, border:"1px solid #FDE68A", background:"#FEF3C7", color:"#92400E", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                        {trListeOuverte ? "▲ Masquer le détail" : "▼ Calculer au cas par cas"}
                      </button>
                    )}
                  </div>

                  {trLot && (
                    <div style={{ marginTop:12, height:6, borderRadius:99, background:"#FDE68A", overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${Math.round((trLot.fait/Math.max(1,trLot.total))*100)}%`, background:"#92400E", transition:"width .3s" }} />
                    </div>
                  )}

                  {trListeOuverte && (
                    <div style={{ marginTop:14, borderTop:"1px solid #FDE68A", paddingTop:12 }}>
                      <input
                        value={trRechCoach}
                        onChange={(e) => setTrRechCoach(e.target.value)}
                        placeholder={`Rechercher parmi ${aCalculer.length} coachs…`}
                        style={{ width:"100%", maxWidth:340, padding:"8px 12px", borderRadius:8, border:"1px solid #FDE68A",
                          background:"#fff", fontSize:13, boxSizing:"border-box", outline:"none", marginBottom:10 }}
                      />
                      {filtres.length === 0 ? (
                        <div style={{ fontSize:12.5, color:"#a16207", padding:"6px 0" }}>Aucun coach ne correspond à « {trRechCoach} ».</div>
                      ) : (
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap", maxHeight:260, overflowY:"auto" }}>
                          {filtres.map(co => {
                            const n = nbSeancesDe(co.id);
                            return (
                              <button key={co.id} onClick={() => trCalculer(co)} disabled={trCalcEnCours[co.id]||!peutGerer||!!trLot}
                                title={permBtnTitle("Calculer", peutGerer)}
                                style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #FDE68A", background:"#FEF3C7", color:"#92400E", fontSize:12, fontWeight:700, cursor:(trCalcEnCours[co.id]||!peutGerer||trLot)?"not-allowed":"pointer", opacity:peutGerer?1:0.6 }}>
                                {trCalcEnCours[co.id] ? "⏳" : !peutGerer ? "🔒" : "🔢"} {co.prenom} {co.nom}
                                <span style={{ marginLeft:6, fontWeight:800, color:"#b45309" }}>· {n} séance{n>1?"s":""}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}

              {trLoading ? (
                <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>⏳ Chargement…</div>
              ) : trBulletins.length === 0 ? (
                <div style={{ textAlign:"center", padding:"48px 20px", border:"2px dashed #E5E7EB", borderRadius:14, color:"#94a3b8" }}>
                  <div style={{ fontSize:44, marginBottom:12 }}>💰</div>
                  <div style={{ fontWeight:700, color:"#0f172a", marginBottom:6, fontSize:15 }}>Aucune fiche pour {moisLabelTr}</div>
                  <div style={{ fontSize:12 }}>Utilisez les boutons "🔢 Calculer" ci-dessus.</div>
                </div>
              ) : (
                <div style={{ background:"#fff", borderRadius:12, border:"1px solid #E5E7EB", overflow:"hidden" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"#F8FAFC" }}>
                        {["Coach","Contrat","Séances","Heures","Tarif/h","Montant brut","Retenues","Montant net","Statut","Actions"].map(col => (
                          <th key={col} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", borderBottom:"1px solid #E5E7EB" }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trBulletins.map((h,i) => {
                        const coachObj = trCoachs.find(c=>c.id===h.coach_id);
                        const nom = coachObj ? `${coachObj.prenom||""} ${coachObj.nom||""}`.trim() : `Coach #${(h.coach_id||"").slice(0,6)}`;
                        const st = STATUT_HON_TR[h.statut] || STATUT_HON_TR.en_attente;
                        const verrou = h.statut==="transmis" || h.statut==="paye";
                        const gradeCoach = coachObj?.coach_info?.type_contrat || coachObj?.contrat || "Vacataire";
                        const gradeCoachValide = GRADES.includes(gradeCoach) ? gradeCoach : "Vacataire";
                        return (
                          <tr key={h.id} onClick={()=>setTrModal({ hon:h, coachNom:nom })}
                            style={{ borderBottom:"1px solid #F1F5F9", cursor:"pointer", background:i%2===0?"#fff":"#FAFAFA" }}>
                            <td style={{ padding:"12px 14px", fontWeight:700, color:"#0f172a" }}>{nom}</td>
                            <td style={{ padding:"12px 14px" }}><span style={{ fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:999, background:"#EDE9FE", color:"#6D28D9" }}>{gradeCoachValide}</span></td>
                            <td style={{ padding:"12px 14px" }}>{h.nb_seances||0}</td>
                            <td style={{ padding:"12px 14px" }}>{(h.total_heures||0).toFixed(1)}h</td>
                            <td style={{ padding:"12px 14px" }}>{formatMoney(h.total_heures>0 ? Math.round((h.montant_brut??h.montant_total??0)/h.total_heures) : 0)}</td>
                            <td style={{ padding:"12px 14px" }}>{formatMoney(h.montant_brut??h.montant_total)}</td>
                            <td style={{ padding:"12px 14px", color: h.retenues>0?"#DC2626":"#94a3af" }}>{h.retenues>0?`-${formatMoney(h.retenues)}`:"-"}</td>
                            <td style={{ padding:"12px 14px", fontWeight:800, color:"#059669" }}>{formatMoney(h.montant_net??h.montant_total)}</td>
                            <td style={{ padding:"12px 14px" }}><Badge label={st.lib} color={st.c} bg={st.bg} /></td>
                            <td style={{ padding:"12px 14px" }} onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>trCalculer(coachObj||{id:h.coach_id})} disabled={trCalcEnCours[h.coach_id]||verrou||!peut("honoraires","manage")}
                                title={!peut("honoraires","manage")?permBtnTitle("Recalculer",false):verrou?"Déjà transmis - remettre en attente pour recalculer":"Recalculer"}
                                style={{ padding:"5px 10px", borderRadius:7, border:"1px solid #E5E7EB", background:verrou?"#F1F5F9":"#F9FAFB", fontSize:11, fontWeight:600, cursor:verrou?"not-allowed":"pointer", color:verrou?"#CBD5E1":"#64748b", opacity:peut("honoraires","manage")?1:0.6 }}>
                                {trCalcEnCours[h.coach_id] ? "⏳" : !peut("honoraires","manage") ? "🔒" : "🔢"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:"#F8FAFC", borderTop:"2px solid #E5E7EB" }}>
                        <td style={{ padding:"10px 14px", fontWeight:800, color:"#0f172a" }}>Total - {trBulletins.length} coach{trBulletins.length>1?"s":""}</td>
                        <td></td><td></td><td></td>
                        <td style={{ padding:"10px 14px", fontWeight:800 }}>{formatMoney(trBulletins.reduce((s,h)=>s+(h.montant_brut??h.montant_total??0),0))}</td>
                        <td style={{ padding:"10px 14px", fontWeight:800, color:"#DC2626" }}>{formatMoney(trBulletins.reduce((s,h)=>s+(h.retenues||0),0))}</td>
                        <td style={{ padding:"10px 14px", fontWeight:800, color:"#059669" }}>{formatMoney(trBulletins.reduce((s,h)=>s+(h.montant_net??h.montant_total??0),0))}</td>
                        <td></td><td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Modal détail fiche ── */}
              {trModal && !trConfirm && !trTransmisConfirm && !trRefuseModal && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
                  onClick={e=>{ if(e.target===e.currentTarget) setTrModal(null); }}>
                  <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", overflow:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.3)" }}>
                    <div style={{ padding:"18px 24px", borderBottom:"1px solid #E5E7EB", background:"#F0FDF4", borderRadius:"16px 16px 0 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>{trModal.coachNom}</div>
                          {(() => {
                            const coachObj = trCoachs.find(c=>c.id===trModal.hon.coach_id);
                            const grade = coachObj?.coach_info?.type_contrat || coachObj?.contrat || "Vacataire";
                            const gradeValide = GRADES.includes(grade) ? grade : "Vacataire";
                            return <span style={{ fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:999, background:"#EDE9FE", color:"#6D28D9" }}>{gradeValide}</span>;
                          })()}
                        </div>
                        <div style={{ fontSize:12, color:"#64748b" }}>Honoraires {moisLabelTr} · {trModal.hon.nb_seances||0} séance{(trModal.hon.nb_seances||0)!==1?"s":""}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase" }}>Montant net</div>
                          <div style={{ fontSize:20, fontWeight:900, color:"#059669" }}>{formatMoney(trModal.hon.montant_net??trModal.hon.montant_total)}</div>
                        </div>
                        <button onClick={trExporterPdf} title="Exporter en PDF"
                          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", borderRadius:8, border:"1px solid #FCA5A5", background:"#FEF2F2", color:"#991B1B", fontSize:12, fontWeight:700, cursor:"pointer" }}>📄 PDF</button>
                        <button onClick={trExporterExcel} title="Exporter en Excel"
                          style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", borderRadius:8, border:"1px solid #BBF7D0", background:"#F0FDF4", color:"#059669", fontSize:12, fontWeight:700, cursor:"pointer" }}>📊 Excel</button>
                        <button onClick={()=>setTrModal(null)} style={{ width:30, height:30, borderRadius:"50%", border:"none", background:"#E2E8F0", cursor:"pointer", fontSize:16 }}>×</button>
                      </div>
                    </div>
                    <div style={{ padding:24 }}>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:20 }}>
                        {[
                          { l:"Séances", v: trModal.hon.nb_seances||0, c:"#0EA5E9" },
                          { l:"Heures",  v: `${(trModal.hon.total_heures||0).toFixed(1)}h`, c:"#8B5CF6" },
                          { l:"Tarif/h moyen", v: formatMoney(trModal.hon.total_heures>0 ? Math.round((trModal.hon.montant_brut??trModal.hon.montant_total??0)/trModal.hon.total_heures) : 0), c:"#0EA5E9" },
                          { l:"Montant brut", v: formatMoney(trModal.hon.montant_brut??trModal.hon.montant_total), c:"#0f172a" },
                          { l:"Retenues", v: trModal.hon.retenues ? formatMoney(trModal.hon.retenues) : "Aucune", c:"#DC2626" },
                        ].map(k=>(
                          <div key={k.l} style={{ background:"#F8FAFC", borderRadius:10, padding:"12px 16px", border:"1px solid #E5E7EB" }}>
                            <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>{k.l}</div>
                            <div style={{ fontWeight:800, fontSize:15, color:k.c }}>{k.v}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontSize:12, fontWeight:800, color:"#64748b", textTransform:"uppercase", marginBottom:8 }}>📋 Séances prises en compte</div>
                      {trModalSeancesLoading ? (
                        <div style={{ textAlign:"center", padding:20, color:"#94a3b8", fontSize:12 }}>⏳ Chargement…</div>
                      ) : trModalSeances.length === 0 ? (
                        <div style={{ textAlign:"center", padding:20, color:"#94a3b8", fontSize:12, background:"#F8FAFC", borderRadius:10 }}>Aucune séance.</div>
                      ) : (
                        <div style={{ border:"1px solid #E5E7EB", borderRadius:10, overflow:"hidden", marginBottom:20 }}>
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                            <thead>
                              <tr style={{ background:"#F8FAFC" }}>
                                {["Date","Titre","Durée","Montant","Statut","Action"].map(col => (
                                  <th key={col} style={{ padding:"7px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", borderBottom:"1px solid #E5E7EB" }}>{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {trModalSeances.map((s,i) => {
                                const stS = STATUT_SEANCE_TR[s.honoraire_statut] || STATUT_SEANCE_TR.en_attente;
                                const ficheVerrouillee = trModal.hon.statut==="transmis" || trModal.hon.statut==="paye";
                                return (
                                  <tr key={s.id} onClick={() => setTrSeanceDetail(s)} style={{ borderBottom:"1px solid #F1F5F9", cursor:"pointer", background: s.honoraire_statut==="rejete" ? "#FEF2F2" : (i%2===0?"#fff":"#FAFAFA") }}>
                                    <td style={{ padding:"7px 12px" }}>{s.date_seance ? new Date(s.date_seance).toLocaleDateString("fr-FR") : "-"}</td>
                                    <td style={{ padding:"7px 12px", fontWeight:600 }}>{s.titre||"-"}</td>
                                    <td style={{ padding:"7px 12px" }}>{parseFloat(s.duree_h||0).toFixed(1)}h</td>
                                    <td style={{ padding:"7px 12px", fontWeight:700, color: s.honoraire_statut==="rejete"?"#9ca3af":"#059669", textDecoration: s.honoraire_statut==="rejete"?"line-through":"none" }}>
                                      {Math.round(s.honoraire_montant||0).toLocaleString("fr-FR")} FCFA
                                    </td>
                                    <td style={{ padding:"7px 12px" }}>
                                      <span title={s.honoraire_statut==="rejete" && s.honoraire_statut_note ? `Motif : ${s.honoraire_statut_note}` : undefined}>
                                        <Badge label={stS.lib} color={stS.c} bg={stS.bg} />
                                      </span>
                                      {s.honoraire_statut==="rejete" && s.honoraire_statut_note && (
                                        <div style={{ fontSize:10, color:"#b91c1c", marginTop:3, maxWidth:180, whiteSpace:"normal", lineHeight:1.3 }}>💬 {s.honoraire_statut_note}</div>
                                      )}
                                    </td>
                                    <td style={{ padding:"7px 12px" }} onClick={e => e.stopPropagation()}>
                                      {ficheVerrouillee ? (
                                        <span style={{ fontSize:10, color:"#94a3b8", fontStyle:"italic" }}>Verrouillée</span>
                                      ) : (
                                        <div style={{ display:"flex", gap:5 }}>
                                          {s.honoraire_statut !== "valide" && (
                                            <button onClick={()=>{ setTrSeanceConfirmMotif(""); setTrSeanceConfirm({ seance:s, statut:"valide" }); }} disabled={trSeanceActionEnCours[s.id]}
                                              style={{ padding:"3px 7px", borderRadius:6, border:"1px solid #BBF7D0", background:"#F0FDF4", color:"#059669", fontSize:11, fontWeight:700, cursor:"pointer" }}>✅</button>
                                          )}
                                          {s.honoraire_statut !== "rejete" && (
                                            <button onClick={()=>{ setTrSeanceConfirmMotif(""); setTrSeanceConfirm({ seance:s, statut:"rejete" }); }} disabled={trSeanceActionEnCours[s.id]}
                                              style={{ padding:"3px 7px", borderRadius:6, border:"1px solid #FCA5A5", background:"#FEF2F2", color:"#DC2626", fontSize:11, fontWeight:700, cursor:"pointer" }}>🚫</button>
                                          )}
                                          {s.honoraire_statut !== "en_attente" && (
                                            <button onClick={()=>{ setTrSeanceConfirmMotif(""); setTrSeanceConfirm({ seance:s, statut:"en_attente" }); }} disabled={trSeanceActionEnCours[s.id]}
                                              style={{ padding:"3px 7px", borderRadius:6, border:"1px solid #E5E7EB", background:"#F9FAFB", color:"#6B7280", fontSize:11, fontWeight:700, cursor:"pointer" }}>↩️</button>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div style={{ fontSize:12, fontWeight:800, color:"#64748b", textTransform:"uppercase", marginBottom:10 }}>✏️ Ajustements (retenues, note)</div>
                      <div style={{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap", marginBottom:16 }}>
                        <div>
                          <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>Retenues (FCFA)</div>
                          <input type="number" min="0" value={trEdit.retenues} onChange={e=>setTrEdit(f=>({...f, retenues:e.target.value}))}
                            style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:13, width:140 }} />
                        </div>
                        <div style={{ flex:1, minWidth:220 }}>
                          <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>Note du PA</div>
                          <input type="text" value={trEdit.note_pa} onChange={e=>setTrEdit(f=>({...f, note_pa:e.target.value}))}
                            style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:13, width:"100%" }} />
                        </div>
                        <button onClick={trModifierHon} disabled={trActionEnCours||!peut("honoraires","manage")}
                          title={permBtnTitle("Enregistrer",peut("honoraires","manage"))}
                          style={{ padding:"9px 16px", background:"#6366F1", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", color:"#fff", opacity:peut("honoraires","manage")?1:0.6 }}>
                          {peut("honoraires","manage")?"💾":"🔒"} Enregistrer
                        </button>
                      </div>

                      {trModal.hon.statut !== "en_attente" && trModal.hon.statut !== "litige" && (
                        <div style={{ padding:"10px 16px", borderRadius:10, marginBottom:16, fontSize:13, fontWeight:600,
                          background: trModal.hon.statut==="paye" ? "#D1FAE5" : trModal.hon.statut==="transmis" ? "#DBEAFE" : "#E0E7FF",
                          color: trModal.hon.statut==="paye" ? "#065F46" : trModal.hon.statut==="transmis" ? "#1D4ED8" : "#4338CA" }}>
                          {trModal.hon.statut==="paye"
                            ? `💵 Payée${trModal.hon.paye_at ? ` le ${new Date(trModal.hon.paye_at).toLocaleDateString("fr-FR")}` : ""}`
                            : trModal.hon.statut==="transmis"
                            ? `📤 Transmise à la RH${trModal.hon.transmis_at ? ` le ${new Date(trModal.hon.transmis_at).toLocaleDateString("fr-FR")}` : ""}`
                            : `✅ Validée${trModal.hon.valide_at ? ` le ${new Date(trModal.hon.valide_at).toLocaleDateString("fr-FR")}` : ""}`}
                        </div>
                      )}

                      <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap", borderTop:"1px solid #E5E7EB", paddingTop:16 }}>
                        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                          {trModal.hon.statut !== "valide" && trModal.hon.statut !== "transmis" && trModal.hon.statut !== "paye" && (
                            <button disabled={!peut("honoraires","manage")} title={permBtnTitle("Valider",peut("honoraires","manage"))} onClick={()=>setTrConfirm(true)} style={{ padding:"10px 20px", background:"#059669", border:"none", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer", color:"#fff", opacity:peut("honoraires","manage")?1:0.6 }}>{peut("honoraires","manage")?"✅":"🔒"} Valider</button>
                          )}
                          {trModal.hon.statut === "valide" && (() => {
                            const nbEnAttente = trModalSeances.filter(s=>s.honoraire_statut==="en_attente").length;
                            return (
                              <button onClick={()=>nbEnAttente===0 && peut("honoraires","manage") && setTrTransmisConfirm(true)} disabled={nbEnAttente>0||!peut("honoraires","manage")}
                                title={!peut("honoraires","manage")?permBtnTitle("Transmettre à la RH",false):nbEnAttente>0?`${nbEnAttente} séance(s) en attente`:""}
                                style={{ padding:"10px 20px", background:(nbEnAttente>0||!peut("honoraires","manage"))?"#94A3B8":"#1D4ED8", border:"none", borderRadius:9, fontSize:13, fontWeight:700, cursor:(nbEnAttente>0||!peut("honoraires","manage"))?"not-allowed":"pointer", color:"#fff" }}>
                                {peut("honoraires","manage")?"📤":"🔒"} Transmettre à la RH{nbEnAttente>0?` (${nbEnAttente} en attente)`:""}
                              </button>
                            );
                          })()}
                          {trModal.hon.statut !== "litige" && (
                            <button disabled={!peut("honoraires","manage")} title={permBtnTitle("Refuser",peut("honoraires","manage"))} onClick={()=>setTrRefuseModal(true)} style={{ padding:"10px 16px", background:"#FEE2E2", border:"1px solid #FCA5A5", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer", color:"#991B1B", opacity:peut("honoraires","manage")?1:0.6 }}>{peut("honoraires","manage")?"🚫":"🔒"} Refuser</button>
                          )}
                          {trModal.hon.statut !== "en_attente" && (
                            <button onClick={()=>trValiderHon(trModal.hon.id, trModal.coachNom, "en_attente")} disabled={trActionEnCours||!peut("honoraires","manage")}
                              title={permBtnTitle("Remettre en attente",peut("honoraires","manage"))}
                              style={{ padding:"10px 16px", background:"#F1F5F9", border:"1px solid #E5E7EB", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer", color:"#64748b", opacity:peut("honoraires","manage")?1:0.6 }}>{peut("honoraires","manage")?"↩️":"🔒"} Remettre en attente</button>
                          )}
                        </div>
                        <button onClick={()=>setTrModal(null)} style={{ padding:"10px 18px", background:"#F1F5F9", border:"none", borderRadius:9, fontSize:13, fontWeight:600, cursor:"pointer", color:"#64748b" }}>Fermer</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Détail d'une séance cliquée dans la liste. La vue est partagée avec le
                  Cahier coachs du superviseur (SeanceDetailModal) : c'est la même séance,
                  et la version locale d'ici n'avait jamais reçu le chronomètre de la salle
                  ni la reprogrammation, ajoutés en base depuis. */}
              {trSeanceDetail && (
                <SeanceDetailModal
                  seance={trSeanceDetail}
                  onClose={() => setTrSeanceDetail(null)}
                  presences={trSeanceDetailPresences}
                  presencesLoading={trSeanceDetailPresencesLoading}
                />
              )}

              {/* Confirm : valider séance */}
              {trSeanceConfirm && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1600, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
                  <div style={{ background:"#fff", borderRadius:14, width:"min(480px, 90vw)", maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
                    <div style={{ padding:"18px 22px", flex:1, overflowY:"auto" }}>
                      <div style={{ fontWeight:800, fontSize:15, marginBottom:6 }}>
                        {trSeanceConfirm.statut==="valide"?"✅ Valider cette séance ?":trSeanceConfirm.statut==="rejete"?"🚫 Rejeter cette séance ?":"↩️ Remettre en attente ?"}
                      </div>
                      <div style={{ fontSize:12, color:"#64748b" }}>{trSeanceConfirm.seance.titre} - {trSeanceConfirm.seance.date_seance ? new Date(trSeanceConfirm.seance.date_seance).toLocaleDateString("fr-FR") : ""}</div>
                      {trSeanceConfirm.statut==="rejete" && (
                        <div style={{ marginTop:14 }}>
                          <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#374151", marginBottom:5 }}>Motif du rejet - visible par le coach</label>
                          <textarea value={trSeanceConfirmMotif} onChange={e=>setTrSeanceConfirmMotif(e.target.value)} rows={3}
                            placeholder="Ex : séance non couverte par le planning validé, présences manquantes…"
                            style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #FCA5A5", borderRadius:8, fontSize:13, resize:"vertical", boxSizing:"border-box" }} />
                        </div>
                      )}
                    </div>
                    <div style={{ padding:"14px 22px", borderTop:"1px solid #E5E7EB", display:"flex", gap:10, justifyContent:"flex-end", flexShrink:0 }}>
                      <button onClick={()=>{ setTrSeanceConfirm(null); setTrSeanceConfirmMotif(""); }} style={{ padding:"9px 16px", background:"#F1F5F9", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Annuler</button>
                      <button onClick={()=>trValiderSeance(trSeanceConfirm.seance.id, trSeanceConfirm.statut, trSeanceConfirmMotif.trim())} disabled={trSeanceActionEnCours[trSeanceConfirm.seance.id]||!peut("honoraires","manage")}
                        title={permBtnTitle("Confirmer",peut("honoraires","manage"))}
                        style={{ padding:"9px 20px", background:"#059669", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", color:"#fff", opacity:peut("honoraires","manage")?1:0.6 }}>{peut("honoraires","manage")?"":"🔒 "}Confirmer</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm : valider fiche */}
              {trModal && trConfirm && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
                  <div style={{ background:"#fff", borderRadius:14, width:"min(480px, 90vw)", maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
                    <div style={{ padding:"20px 24px 16px", background:"#F0FDF4", flexShrink:0 }}>
                      <div style={{ fontSize:15, fontWeight:800 }}>✅ Confirmer la validation</div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>Pas encore transmis à la RH - le coach pourra contester avant l'envoi.</div>
                    </div>
                    <div style={{ padding:"20px 24px", flex:1, overflowY:"auto" }}>{trModal.coachNom} - {moisLabelTr} - {formatMoney(trModal.hon.montant_net??trModal.hon.montant_total)}</div>
                    <div style={{ padding:"14px 24px", borderTop:"1px solid #E5E7EB", display:"flex", gap:10, justifyContent:"flex-end", flexShrink:0 }}>
                      <button onClick={()=>setTrConfirm(false)} style={{ padding:"9px 16px", background:"#F1F5F9", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Annuler</button>
                      <button onClick={()=>trValiderHon(trModal.hon.id, trModal.coachNom, "valide")} disabled={trActionEnCours||!peut("honoraires","manage")}
                        title={permBtnTitle("Confirmer",peut("honoraires","manage"))}
                        style={{ padding:"9px 20px", background:"#059669", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", color:"#fff", opacity:peut("honoraires","manage")?1:0.6 }}>{peut("honoraires","manage")?"✅":"🔒"} Confirmer</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm : transmettre */}
              {trModal && trTransmisConfirm && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
                  <div style={{ background:"#fff", borderRadius:14, width:"min(480px, 90vw)", maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
                    <div style={{ padding:"20px 24px 16px", background:"#EFF6FF", flexShrink:0 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:"#1D4ED8" }}>📤 Confirmer la transmission à la RH</div>
                      <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>Envoi définitif pour paiement.</div>
                    </div>
                    <div style={{ padding:"20px 24px", flex:1, overflowY:"auto" }}>{trModal.coachNom} - {moisLabelTr} - {formatMoney(trModal.hon.montant_net??trModal.hon.montant_total)}</div>
                    <div style={{ padding:"14px 24px", borderTop:"1px solid #E5E7EB", display:"flex", gap:10, justifyContent:"flex-end", flexShrink:0 }}>
                      <button onClick={()=>setTrTransmisConfirm(false)} style={{ padding:"9px 16px", background:"#F1F5F9", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Annuler</button>
                      <button onClick={trTransmettreHon} disabled={trActionEnCours||!peut("honoraires","manage")}
                        title={permBtnTitle("Confirmer",peut("honoraires","manage"))}
                        style={{ padding:"9px 20px", background:"#1D4ED8", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", color:"#fff", opacity:peut("honoraires","manage")?1:0.6 }}>{peut("honoraires","manage")?"📤":"🔒"} Confirmer</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Refuser */}
              {trModal && trRefuseModal && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
                  <div style={{ background:"#fff", borderRadius:14, width:"min(480px, 90vw)", maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
                    <div style={{ padding:"20px 24px 16px", background:"#FEF2F2", flexShrink:0 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:"#991B1B" }}>🚫 Refuser cette fiche</div>
                    </div>
                    <div style={{ padding:"20px 24px", flex:1, overflowY:"auto" }}>
                      <textarea rows={3} value={trEdit.note_pa} onChange={e=>setTrEdit(f=>({...f, note_pa:e.target.value}))}
                        placeholder="Motif du refus…" style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:13, resize:"vertical" }} />
                    </div>
                    <div style={{ padding:"14px 24px", borderTop:"1px solid #E5E7EB", display:"flex", gap:10, justifyContent:"flex-end", flexShrink:0 }}>
                      <button onClick={()=>setTrRefuseModal(false)} style={{ padding:"9px 16px", background:"#F1F5F9", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>Annuler</button>
                      <button onClick={()=>trRefuserHon(trEdit.note_pa)} disabled={trActionEnCours||!peut("honoraires","manage")}
                        title={permBtnTitle("Confirmer",peut("honoraires","manage"))}
                        style={{ padding:"9px 20px", background:"#DC2626", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", color:"#fff", opacity:peut("honoraires","manage")?1:0.6 }}>{peut("honoraires","manage")?"🚫":"🔒"} Confirmer</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {/* ══════════════════════════════════
              ONGLET GRILLE TARIFAIRE
          ══════════════════════════════════ */}
          {grilleModalOpen && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
              onClick={e=>{ if(e.target===e.currentTarget) setGrilleModalOpen(false); }}>
            <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.3)", padding:28 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:22 }}>

              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                <div>
                  <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:"#0f172a" }}>📊 Grille tarifaire des honoraires</h2>
                  <p style={{ margin:"4px 0 0", fontSize:12, color:"#64748b" }}>
                    Taux horaires (FCFA) par grade et type de cours · Calcul automatique dans l'onglet Honoraires
                    {grilleUpdatedAt && <span style={{ marginLeft:8, color:"#94a3b8" }}>- Mise à jour {formatDate(grilleUpdatedAt)}</span>}
                  </p>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>{ setGrille(GRILLE_DEFAULT); setGrilleEdited(true); }}
                    style={{ padding:"8px 16px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", color:"#64748b" }}>
                    ↺ Réinitialiser
                  </button>
                  <button onClick={saveGrille} disabled={!grilleEdited || grilleSaving || !peut("honoraires","manage")}
                    title={permBtnTitle("Sauvegarder",peut("honoraires","manage"))}
                    style={{ padding:"8px 20px", background: (grilleEdited&&peut("honoraires","manage")) ? PA_COLOR : "#9ca3af", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor: (grilleEdited&&peut("honoraires","manage"))?"pointer":"not-allowed" }}>
                    {grilleSaving ? "Sauvegarde…" : peut("honoraires","manage") ? "💾 Sauvegarder" : "🔒 Sauvegarder"}
                  </button>
                  <button onClick={grilleExporterPdf}
                    style={{ padding:"8px 14px", borderRadius:8, border:"1px solid #FCA5A5", background:"#FEF2F2", color:"#991B1B", fontSize:12, fontWeight:700, cursor:"pointer" }}>📄 PDF</button>
                  <button onClick={grilleExporterExcel}
                    style={{ padding:"8px 14px", borderRadius:8, border:"1px solid #BBF7D0", background:"#F0FDF4", color:"#059669", fontSize:12, fontWeight:700, cursor:"pointer" }}>📊 Excel</button>
                  <button onClick={()=>setGrilleModalOpen(false)} style={{ width:36, height:36, borderRadius:"50%", border:"none", background:"#E2E8F0", cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              </div>

              {grilleLoading ? (
                <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>Chargement…</div>
              ) : (
                <>
                  {/* ── Matrice tarifaire ── */}
                  <div style={{ background:"#fff", borderRadius:14, overflow:"hidden", border:"1px solid #e2e8f0", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                    <div style={{ padding:"14px 20px", background:PA_GRADIENT, color:"#fff" }}>
                      <div style={{ fontWeight:800, fontSize:14 }}>Taux horaire de base (FCFA/heure)</div>
                      <div style={{ fontSize:11, color:"#c4b5fd", marginTop:2 }}>Saisir le montant pour chaque combinaison Grade × Type de cours</div>
                    </div>
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", minWidth:500 }}>
                        <thead>
                          <tr style={{ background:"#f8fafc" }}>
                            <th style={{ padding:"12px 18px", textAlign:"left", fontSize:12, fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0" }}>Grade</th>
                            {TYPES_COURS.map(t => (
                              <th key={t.key} style={{ padding:"12px 18px", textAlign:"center", fontSize:12, fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0", borderLeft:"1px solid #f1f5f9" }}>
                                {t.icon} {t.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {GRADES.map((grade, gi) => (
                            <tr key={grade} style={{ background: gi%2===0?"#fff":"#fafafa" }}>
                              <td style={{ padding:"12px 18px", borderBottom:"1px solid #f1f5f9" }}>
                                <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{grade}</div>
                              </td>
                              {TYPES_COURS.map(t => {
                                const val = grille.tarifs?.[grade]?.[t.key] || 0;
                                return (
                                  <td key={t.key} style={{ padding:"10px 18px", borderBottom:"1px solid #f1f5f9", borderLeft:"1px solid #f1f5f9", textAlign:"center" }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"center" }}>
                                      <input
                                        type="number" min="0" step="500" value={val}
                                        onChange={e => setTarif(grade, t.key, e.target.value)}
                                        style={{ width:90, padding:"7px 10px", border:`1.5px solid ${grilleEdited?"#7c3aed30":"#e2e8f0"}`, borderRadius:8, fontSize:13, fontWeight:700, textAlign:"right", outline:"none", color:"#0f172a" }}
                                      />
                                      <span style={{ fontSize:11, color:"#9ca3af", flexShrink:0 }}>FCFA</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── Multiplicateurs de niveau ── */}
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                    <div style={{ padding:"14px 20px", borderBottom:"1px solid #f1f5f9", background:"#fafafa", display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontWeight:800, fontSize:14 }}>🎓 Multiplicateurs par niveau</span>
                      <span style={{ fontSize:11, color:"#94a3b8" }}>- appliqués sur le taux horaire de base</span>
                    </div>
                    <div style={{ padding:"18px 20px", display:"flex", gap:16, flexWrap:"wrap" }}>
                      {NIVEAUX_GRP.map(niv => {
                        const mult = grille.multiplicateurs?.[niv] || 1;
                        return (
                          <div key={niv} style={{ background:"#f8fafc", borderRadius:12, padding:"16px 20px", border:"1.5px solid #e2e8f0", minWidth:160, flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginBottom:10 }}>{niv}</div>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ fontSize:12, color:"#9ca3af" }}>×</span>
                              <input
                                type="number" min="0.5" max="3" step="0.1" value={mult}
                                onChange={e => setMult(niv, e.target.value)}
                                style={{ width:70, padding:"7px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:14, fontWeight:800, textAlign:"center", outline:"none", color:PA_COLOR }}
                              />
                            </div>
                            <div style={{ fontSize:10, color:"#9ca3af", marginTop:8 }}>
                              Ex : {(grille.tarifs?.["CDI"]?.["presentiel"]||0).toLocaleString("fr-FR")} × {mult} × 1h = <strong>{((grille.tarifs?.["CDI"]?.["presentiel"]||0)*mult*1).toLocaleString("fr-FR")} FCFA</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Calculateur interactif ── */}
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                    <div style={{ padding:"14px 20px", borderBottom:"1px solid #f1f5f9", background:"linear-gradient(135deg,#ede9fe,#f5f3ff)" }}>
                      <div style={{ fontWeight:800, fontSize:14, color:PA_COLOR }}>🧮 Calculateur d'honoraires</div>
                      <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Simulez le montant d'une séance selon les paramètres de la grille</div>
                    </div>
                    <div style={{ padding:"20px 24px" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:14, marginBottom:24 }}>
                        {[
                          { label:"Grade du coach", key:"grade", opts: GRADES.map(g=>({v:g,l:g})) },
                          { label:"Type de cours",  key:"type",  opts: TYPES_COURS.map(t=>({v:t.key,l:`${t.icon} ${t.label}`})) },
                          { label:"Niveau",         key:"niveau",opts: NIVEAUX_GRP.map(n=>({v:n,l:n})) },
                          { label:"Durée (heures)", key:"duree", opts: DUREES.map(d=>({v:d,l:`${d}h`})) },
                        ].map(f => (
                          <div key={f.key}>
                            <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>{f.label}</label>
                            <select value={calcForm[f.key]} onChange={e=>setCalcForm(c=>({...c,[f.key]:f.key==="duree"?parseFloat(e.target.value):e.target.value}))}
                              style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", background:"#fff", cursor:"pointer" }}>
                              {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>

                      {/* Résultat */}
                      {(() => {
                        const base  = grille.tarifs?.[calcForm.grade]?.[calcForm.type] || 0;
                        const mult  = grille.multiplicateurs?.[calcForm.niveau] || 1;
                        const total = Math.round(base * calcForm.duree * mult);
                        const typeL = TYPES_COURS.find(t=>t.key===calcForm.type)?.label||"";
                        return (
                          <div style={{ background:PA_GRADIENT, borderRadius:14, padding:"20px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:20, flexWrap:"wrap" }}>
                            <div style={{ color:"rgba(255,255,255,.7)", fontSize:13 }}>
                              <div style={{ fontWeight:700, color:"#fff", fontSize:15, marginBottom:6 }}>
                                {calcForm.grade} · {typeL} · {calcForm.niveau} · {calcForm.duree}h
                              </div>
                              <div style={{ fontSize:12 }}>
                                {base.toLocaleString("fr-FR")} FCFA/h × {calcForm.duree}h × ×{mult} (niveau) =
                              </div>
                            </div>
                            <div style={{ textAlign:"right" }}>
                              <div style={{ fontSize:36, fontWeight:900, color:"#6ee7b7", lineHeight:1 }}>
                                {total.toLocaleString("fr-FR")}
                              </div>
                              <div style={{ fontSize:13, color:"#c4b5fd", marginTop:4 }}>FCFA / séance</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* ── Tableau récap toutes combinaisons ── */}
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                    <div style={{ padding:"14px 20px", borderBottom:"1px solid #f1f5f9", background:"#fafafa" }}>
                      <span style={{ fontWeight:800, fontSize:14 }}>📋 Récapitulatif - forfaits par séance</span>
                      <span style={{ fontSize:11, color:"#94a3b8", marginLeft:8 }}>Pour chaque durée</span>
                    </div>
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", minWidth:700, fontSize:12 }}>
                        <thead>
                          <tr style={{ background:"#f8fafc" }}>
                            <th style={{ padding:"10px 14px", textAlign:"left", fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0" }}>Grade</th>
                            <th style={{ padding:"10px 14px", textAlign:"left", fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0" }}>Niveau</th>
                            {TYPES_COURS.map(t => DUREES.map(d => (
                              <th key={`${t.key}-${d}`} style={{ padding:"10px 10px", textAlign:"center", fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0", borderLeft:"1px solid #f1f5f9", whiteSpace:"nowrap" }}>
                                {t.icon} {d}h
                              </th>
                            )))}
                          </tr>
                        </thead>
                        <tbody>
                          {GRADES.flatMap((grade, gi) =>
                            NIVEAUX_GRP.map((niv, ni) => (
                              <tr key={`${grade}-${niv}`} style={{ background: gi%2===0&&ni%2===0?"#fff":gi%2===0&&ni%2!==0?"#fafafa":gi%2!==0&&ni%2===0?"#f8fafc":"#f5f3ff" }}>
                                <td style={{ padding:"9px 14px", fontWeight:ni===0?700:400, color:"#0f172a", borderBottom:"1px solid #f1f5f9" }}>
                                  {ni===0 ? grade : ""}
                                </td>
                                <td style={{ padding:"9px 14px", color:"#64748b", fontWeight:600, borderBottom:"1px solid #f1f5f9" }}>{niv}</td>
                                {TYPES_COURS.flatMap(t => DUREES.map(d => {
                                  const montant = calcHonoraire(grade, t.key, niv, d);
                                  return (
                                    <td key={`${t.key}-${d}`} style={{ padding:"9px 10px", textAlign:"center", borderBottom:"1px solid #f1f5f9", borderLeft:"1px solid #f1f5f9", fontWeight:600, color: montant>10000?"#7c3aed":montant>7000?"#0891b2":"#374151" }}>
                                      {montant.toLocaleString("fr-FR")}
                                    </td>
                                  );
                                }))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding:"10px 16px", fontSize:11, color:"#9ca3af", borderTop:"1px solid #f1f5f9", background:"#fafafa" }}>
                      Tous les montants en FCFA · Calculés selon la grille courante
                    </div>
                  </div>
                </>
              )}
            </div>
            </div>
            </div>
          )}

          {/* ══════════════════════════════════

          {/* ══════════════════════════════════
              ONGLET GROUPES (lecture seule)
          ══════════════════════════════════ */}
          {activeTab === "groupes" && (() => {
            // ── Calcul des groupes filtrés ──
            const sq = paFiltreSearch.toLowerCase().trim();
            const paGroupesFiltres = paGroupes.filter(g => {
              if (paFiltreCoach !== "tous" && g.coach_nom !== paFiltreCoach) return false;
              if (paFiltreNiveau !== "tous" && g.niveau !== paFiltreNiveau) return false;
              if (paFiltreStatut !== "tous" && g.statut !== paFiltreStatut) return false;
              if (paFiltreType !== "tous" && !paCadreType(g, paFiltreType)) return false;
              if (paFiltreCategorie !== "tous" && (paFiltreCategorie === "prive") !== paEstPrive(g)) return false;
              if (paPeriodeDebut && g.date_debut && g.date_debut < paPeriodeDebut) return false;
              if (paPeriodeFin  && g.date_fin   && g.date_fin   > paPeriodeFin)   return false;
              if (sq) {
                const haystack = `${g.nom||""} ${g.coach_nom||""} ${g.filiere||""} ${g.created_by_nom||""}`.toLowerCase();
                if (!haystack.includes(sq)) return false;
              }
              return true;
            });
            const totalPages = Math.max(1, Math.ceil(paGroupesFiltres.length / PA_PAGE_SIZE));
            const pageClamp = Math.min(paPage, totalPages);
            const paGroupesPage = paGroupesFiltres.slice((pageClamp-1)*PA_PAGE_SIZE, pageClamp*PA_PAGE_SIZE);
            const hasActiveFilters = sq || paFiltreCoach!=="tous" || paFiltreNiveau!=="tous" || paFiltreStatut!=="tous" || paFiltreType!=="tous" || paFiltreCategorie!=="tous" || paPeriodeDebut || paPeriodeFin;

            return (
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

              {/* ── Header ── */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                <h3 style={{ margin:0, fontSize:17, fontWeight:800, color:"#0f172a" }}>👥 Groupes de cours - Vue d'ensemble</h3>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {hasActiveFilters && (
                    <button onClick={()=>{ setPaFiltreSearch(""); setPaFiltreCoach("tous"); setPaFiltreNiveau("tous"); setPaFiltreStatut("tous"); setPaFiltreType("tous"); setPaFiltreCategorie("tous"); setPaPeriodeDebut(""); setPaPeriodeFin(""); setPaPage(1); }}
                      style={{ fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:8, border:"1.5px solid #fca5a5", background:"#fff1f2", color:"#dc2626", cursor:"pointer" }}>
                      ✕ Réinitialiser filtres
                    </button>
                  )}
                  <span style={{ fontSize:12, color:"#9ca3af" }}>{paGroupesFiltres.length} / {paGroupes.length} groupe{paGroupes.length!==1?"s":""}</span>
                </div>
              </div>

              {/* ── Filtres - modèle pastilles partagé (Components/BarreFiltres). Coach,
                   recherche et période gardent des champs : une liste de coachs ne se
                   prête pas à des pastilles, ni une plage de dates. ── */}
              <BarreFiltres accent={PA_COLOR}>
                <RangeePastilles label="Catégorie :" valeur={paFiltreCategorie}
                  onChange={(v) => { setPaFiltreCategorie(v); setPaPage(1); }}
                  options={[{ v:"tous", l:"Tous" }, { v:"groupe", l:"👥 Cours groupe" }, { v:"prive", l:"🔒 Cours privés" }]}
                  compte={(v) => v === "tous" ? paGroupes.length : paGroupes.filter(g => (v === "prive") === paEstPrive(g)).length} />

                <RangeePastilles label="Type :" valeur={paFiltreType}
                  onChange={(v) => { setPaFiltreType(v); setPaPage(1); }}
                  options={[{ v:"tous", l:"Tous" }, { v:"presentiel", l:"🏢 Présentiel" }, { v:"en_ligne", l:"💻 En ligne" }, { v:"domicile", l:"🏠 Domicile" }]}
                  compte={(v) => v === "tous" ? paGroupes.length : paGroupes.filter(g => paCadreType(g, v)).length} />

                <RangeePastilles label="Statut :" valeur={paFiltreStatut}
                  onChange={(v) => { setPaFiltreStatut(v); setPaPage(1); }}
                  options={[{ v:"tous", l:"Tous" }, { v:"actif", l:"🟢 Actifs" }, { v:"cloture", l:"🔒 Clôturés" }]}
                  compte={(v) => v === "tous" ? paGroupes.length : paGroupes.filter(g => g.statut === v).length} />

                <RangeePastilles label="Niveau :" valeur={paFiltreNiveau}
                  onChange={(v) => { setPaFiltreNiveau(v); setPaPage(1); }}
                  options={[{ v:"tous", l:"Tous" }, ...["A1","A2","B1","B2","C1","C2"].map(n => ({ v:n, l:n }))]}
                  compte={(v) => v === "tous" ? paGroupes.length : paGroupes.filter(g => g.niveau === v).length} />

                <RangeeChamps label="Recherche :"
                  resume={`${paGroupesFiltres.length} / ${paGroupes.length} groupe${paGroupes.length > 1 ? "s" : ""}`}
                  onReinitialiser={hasActiveFilters ? () => {
                    setPaFiltreCategorie("tous"); setPaFiltreType("tous"); setPaFiltreStatut("tous");
                    setPaFiltreNiveau("tous"); setPaFiltreCoach("tous"); setPaFiltreSearch("");
                    setPaPeriodeDebut(""); setPaPeriodeFin(""); setPaPage(1);
                  } : null}>
                  <input value={paFiltreSearch} onChange={(e) => { setPaFiltreSearch(e.target.value); setPaPage(1); }}
                    placeholder="Groupe, coach, filière…" aria-label="Rechercher un groupe"
                    style={{ ...champFiltre, minWidth:190 }} />

                  <select value={paFiltreCoach} onChange={(e) => { setPaFiltreCoach(e.target.value); setPaPage(1); }}
                    aria-label="Filtrer par coach" style={champFiltre}>
                    <option value="tous">Tous les coachs</option>
                    {[...new Set(paGroupes.map(g => g.coach_nom).filter(Boolean))].sort().map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <input type="date" value={paPeriodeDebut} aria-label="Début de la période"
                    onChange={(e) => { setPaPeriodeDebut(e.target.value); setPaPage(1); }} style={champFiltre} />
                  <span style={{ fontSize:11, color:"#9ca3af" }}>au</span>
                  <input type="date" value={paPeriodeFin} aria-label="Fin de la période"
                    onChange={(e) => { setPaPeriodeFin(e.target.value); setPaPage(1); }} style={champFiltre} />
                </RangeeChamps>
              </BarreFiltres>


              {/* ── Tableau ── */}
              {paGroupesLoading ? (
                <div style={{ textAlign:"center", padding:"48px 0", color:"#9ca3af" }}>Chargement…</div>
              ) : paGroupesFiltres.length === 0 ? (
                <div style={{ textAlign:"center", padding:"48px 0", color:"#9ca3af" }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>👥</div>
                  <div style={{ fontWeight:600 }}>Aucun groupe trouvé</div>
                  {hasActiveFilters && <div style={{ fontSize:12, marginTop:6 }}>Modifiez les filtres pour voir plus de résultats</div>}
                </div>
              ) : (
                <>
                <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                        {["Groupe","Niveau","Filière","Type","Coach","Onboarding","Apprenants","Horaires","Statut"].map(h => (
                          <th key={h} style={{ padding:"11px 16px", textAlign:"left", fontWeight:700, fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paGroupesPage.map((g, idx) => {
                        const statutCfg = g.statut === "actif"
                          ? { label:"Actif",    color:"#16a34a", bg:"#dcfce7" }
                          : g.statut === "terminé"
                          ? { label:"Terminé",  color:"#6b7280", bg:"#f3f4f6" }
                          : g.statut === "cloture"
                          ? { label:"Clôturée", color:"#dc2626", bg:"#fee2e2" }
                          : { label:"Suspendu", color:"#f59e0b", bg:"#fef3c7" };
                        const roleLabel = g.created_by_role === "onboarding" ? "Onboarding" : g.created_by_role === "commercial" ? "Commercial" : null;
                        const isClotureRow = g.statut === "cloture";
                        return (
                          <tr key={g.id} onClick={() => fetchPaGroupeDetail(g)}
                            style={{ borderBottom:"1px solid #f1f5f9", background: isClotureRow ? "#f8f8f8" : idx%2===0?"#fff":"#fafafa", transition:"background .15s", cursor:"pointer", opacity: isClotureRow ? 0.72 : 1 }}
                            onMouseEnter={e => e.currentTarget.style.background = isClotureRow ? "#f0f0f0" : PA_COLOR+"0d"}
                            onMouseLeave={e => e.currentTarget.style.background = isClotureRow ? "#f8f8f8" : idx%2===0?"#fff":"#fafafa"}>
                            <td style={{ padding:"12px 16px" }}>
                              <div style={{ fontWeight:800, color: isClotureRow ? "#9ca3af" : "#0f172a", display:"flex", alignItems:"center", gap:6 }}>
                                {isClotureRow && <span>🔒</span>}
                                {g.nom || "-"}
                                {!g.coach_id && g.statut==="actif" && (
                                  <span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:99, background:"#fef3c7", color:"#92400e", whiteSpace:"nowrap" }}>⚠ Coach manquant</span>
                                )}
                              </div>
                              {g.date_debut && <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{isClotureRow ? "Clôturée depuis" : "Depuis"} {new Date(isClotureRow && g.date_fin ? g.date_fin : g.date_debut).toLocaleDateString("fr-FR",{month:"short",year:"numeric"})}</div>}
                            </td>
                            <td style={{ padding:"12px 16px" }}>
                              {g.niveau
                                ? <span style={{ fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:99, background:PA_COLOR+"18", color:PA_COLOR }}>{g.niveau}</span>
                                : <span style={{ color:"#d1d5db" }}>-</span>}
                            </td>
                            <td style={{ padding:"12px 16px", color:"#64748b" }}>{g.filiere || "-"}</td>
                            <td style={{ padding:"12px 16px", fontSize:12, color:"#475569", whiteSpace:"nowrap" }}>
                              {estClassePrivee(g) && <span style={{ display:"block", fontSize:9, fontWeight:800, color:"#9333ea", marginBottom:2 }}>🔒 COACHING PRIVÉ</span>}
                              {g.type_cours==="hybride" ? "⚡ Hybride" : g.type_cours==="en_ligne"||g.type_cours==="prive" ? "💻 En ligne" : g.type_cours==="domicile" ? "🏠 Domicile" : g.type_cours==="presentiel"||g.type_cours==="centre" ? "🏢 Présentiel" : "-"}
                            </td>
                            <td style={{ padding:"12px 16px", color: g.coach_nom ? "#374151" : "#f59e0b", fontWeight:600 }}>
                              {g.coach_nom ? (
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <div style={{ width:24, height:24, borderRadius:"50%", background:PA_GRADIENT, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:"#fff", flexShrink:0, overflow:"hidden" }}>
                                    {g.coach_photo_url ? <img src={g.coach_photo_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : g.coach_nom.split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase()}
                                  </div>
                                  <span>{g.coach_nom}</span>
                                </div>
                              ) : "⚠ À assigner"}
                            </td>
                            <td style={{ padding:"12px 16px" }}>
                              {g.created_by_nom ? (
                                <div>
                                  <div style={{ fontWeight:600, color:"#374151", fontSize:12 }}>{g.created_by_nom}</div>
                                  {roleLabel && <div style={{ fontSize:10, color:"#8b5cf6", fontWeight:700 }}>{roleLabel}</div>}
                                </div>
                              ) : <span style={{ color:"#d1d5db" }}>-</span>}
                            </td>
                            <td style={{ padding:"12px 16px", textAlign:"center" }}>
                              <span style={{ fontSize:13, fontWeight:700, color: (g.nb_apprenants||0) > 0 ? "#0f172a" : "#9ca3af" }}>
                                {g.nb_apprenants ?? "-"}
                              </span>
                            </td>
                            <td style={{ padding:"12px 16px" }}>
                              {g.horaires ? (
                                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                  {(Array.isArray(g.horaires) ? g.horaires : [g.horaires]).map((h,i) => (
                                    <span key={i} style={{ background:"#ede9fe", color:PA_COLOR, borderRadius:6, padding:"2px 7px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{h}</span>
                                  ))}
                                </div>
                              ) : <span style={{ color:"#d1d5db" }}>-</span>}
                            </td>
                            <td style={{ padding:"12px 16px" }}>
                              <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99, color:statutCfg.color, background:statutCfg.bg }}>{statutCfg.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, paddingTop:4 }}>
                    <button onClick={()=>setPaPage(1)} disabled={pageClamp===1}
                      style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClamp===1?"not-allowed":"pointer", color:pageClamp===1?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>«</button>
                    <button onClick={()=>setPaPage(p=>Math.max(1,p-1))} disabled={pageClamp===1}
                      style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClamp===1?"not-allowed":"pointer", color:pageClamp===1?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>‹</button>
                    {Array.from({length:totalPages},(_,i)=>i+1).filter(p=> Math.abs(p-pageClamp)<=2 || p===1 || p===totalPages).reduce((acc,p,i,arr)=>{
                      if(i>0 && p-arr[i-1]>1) acc.push("...");
                      acc.push(p);
                      return acc;
                    },[]).map((p,i) => p==="..." ? (
                      <span key={"e"+i} style={{ fontSize:12, color:"#9ca3af", padding:"0 4px" }}>…</span>
                    ) : (
                      <button key={p} onClick={()=>setPaPage(p)}
                        style={{ padding:"6px 12px", borderRadius:7, border:"1.5px solid", fontSize:12, fontWeight:700, cursor:"pointer",
                          background: pageClamp===p ? PA_COLOR : "#fff",
                          borderColor: pageClamp===p ? PA_COLOR : "#e2e8f0",
                          color: pageClamp===p ? "#fff" : "#374151" }}>{p}</button>
                    ))}
                    <button onClick={()=>setPaPage(p=>Math.min(totalPages,p+1))} disabled={pageClamp===totalPages}
                      style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClamp===totalPages?"not-allowed":"pointer", color:pageClamp===totalPages?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>›</button>
                    <button onClick={()=>setPaPage(totalPages)} disabled={pageClamp===totalPages}
                      style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClamp===totalPages?"not-allowed":"pointer", color:pageClamp===totalPages?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>»</button>
                    <span style={{ fontSize:11, color:"#9ca3af", marginLeft:6 }}>Page {pageClamp}/{totalPages} · {paGroupesFiltres.length} résultat{paGroupesFiltres.length!==1?"s":""}</span>
                  </div>
                )}
                </>
              )}
            </div>
            );
          })()}

          {/* ── MODAL DÉTAIL GROUPE ── */}
          {paSelectedGroupe && (
            <div style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10001 }}
              onClick={e => { if (e.target===e.currentTarget) { setPaSelectedGroupe(null); setPaGroupeDetail({ apprenants:[], fichiers:[] }); setPaCoursListe([]); setPaPresences([]); } }}>
              <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

                {/* Header */}
                <div style={{ background:`linear-gradient(135deg,#0f172a 0%,${PA_COLOR} 100%)`, padding:"20px 24px", borderRadius:"16px 16px 0 0", flexShrink:0, position:"relative" }}>
                  <button onClick={async () => {
                      try {
                        const { jsPDF } = await import("jspdf");
                        const autoTable = (await import("jspdf-autotable")).default;
                        const doc = new jsPDF();
                        doc.setFontSize(16); doc.setTextColor(15,23,42);
                        doc.text(`Groupe - ${paSelectedGroupe.nom || "-"}`, 14, 16);
                        doc.setFontSize(10); doc.setTextColor(100);
                        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 23);

                        autoTable(doc, {
                          startY: 30,
                          head: [["Groupe", ""]],
                          body: [
                            ["Niveau", paSelectedGroupe.niveau || "-"],
                            ["Filière", paSelectedGroupe.filiere || "-"],
                            ["Coach", paSelectedGroupe.coach_nom || "-"],
                            ["Type de cours", `${paLibelleType(paSelectedGroupe)}${paEstPrive(paSelectedGroupe) ? " · 🔒 Coaching privé" : ""}`],
                            ["Statut", paSelectedGroupe.statut || "-"],
                            ["Apprenants", `${paSelectedGroupe.nb_apprenants ?? 0} / ${paSelectedGroupe.capacite_max || 20}`],
                          ],
                          theme:"striped", headStyles:{ fillColor:[8,145,178] }, styles:{ fontSize:9 },
                        });

                        autoTable(doc, {
                          startY: doc.lastAutoTable.finalY + 10,
                          head: [["Apprenant","Email","Niveau"]],
                          body: (paGroupeDetail.apprenants || []).map(ap => [ap.nom || ap.prospect_nom || "-", ap.email || ap.prospect_email || "-", ap.niveau || "-"]),
                          theme:"striped", headStyles:{ fillColor:[124,58,237] }, styles:{ fontSize:9 },
                        });

                        doc.save(`groupe-${paSelectedGroupe.nom || "groupe"}-${Date.now()}.pdf`);
                        toast.success("Fiche groupe exportée en PDF");
                      } catch (e) { toast.error("Erreur lors de l'export PDF"); }
                    }}
                    style={{ position:"absolute", top:14, right:56, display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, cursor:"pointer", color:"#fff", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>📄 Export PDF</button>
                  <button onClick={() => { setPaSelectedGroupe(null); setPaGroupeDetail({ apprenants:[], fichiers:[] }); setPaCoursListe([]); setPaPresences([]); }}
                    style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:"50%", width:30, height:30, cursor:"pointer", color:"#fff", fontSize:16 }}>✕</button>
                  <div style={{ fontSize:11, color:"#c4b5fd", fontWeight:600, marginBottom:4 }}>👥 Groupe de cours</div>
                  <div style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:6 }}>{paSelectedGroupe.nom || "-"}</div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", fontSize:12, color:"rgba(255,255,255,0.75)", alignItems:"center" }}>
                    {paSelectedGroupe.niveau && (
                      <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:6, padding:"2px 10px", fontWeight:700, color:"#fff" }}>
                        Niveau {paSelectedGroupe.niveau}
                      </span>
                    )}
                    {paSelectedGroupe.statut && (
                      <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:6, padding:"2px 10px" }}>{paSelectedGroupe.statut}</span>
                    )}
                    {paSelectedGroupe.nb_apprenants !== undefined && (
                      <span>👤 {paSelectedGroupe.nb_apprenants} apprenant{paSelectedGroupe.nb_apprenants!==1?"s":""}</span>
                    )}
                    {paSelectedGroupe.coach_nom && <span>👨‍🏫 {paSelectedGroupe.coach_nom}</span>}
                    {paSelectedGroupe.filiere    && <span>📂 {paSelectedGroupe.filiere}</span>}
                    {paSelectedGroupe.type_cours && <span>{paLibelleType(paSelectedGroupe)}</span>}
                    {paEstPrive(paSelectedGroupe) && <span>🔒 Coaching privé</span>}
                  </div>
                </div>

                {/* Sous-onglets */}
                <div style={{ display:"flex", borderBottom:"2px solid #e5e7eb", background:"#fafafa", flexShrink:0, overflowX:"auto" }}>
                  {[
                    { id:"infos",      label: !paSelectedGroupe?.coach_id ? "👨‍🏫 Coach ⚠" : "👨‍🏫 Infos / Coach" },
                    { id:"apprenants", label:"🎓 Apprenants" },
                    { id:"sessions",   label:"🗓️ Sessions" },
                    { id:"presences",  label:"✅ Présences" },
                  ].map(t => (
                    <button key={t.id} onClick={() => setPaSubTab(t.id)}
                      style={{ padding:"12px 20px", border:"none", borderBottom:`3px solid ${paSubTab===t.id?PA_COLOR:"transparent"}`,
                        background:"transparent", cursor:"pointer", fontSize:13,
                        fontWeight: paSubTab===t.id ? 800 : 500,
                        color: paSubTab===t.id ? PA_COLOR : (t.id==="infos"&&!paSelectedGroupe?.coach_id ? "#f59e0b" : "#64748b"),
                        whiteSpace:"nowrap" }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Contenu scrollable */}
                <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

                  {/* ─ Infos / Coach ─ */}
                  {paSubTab === "infos" && (()=>{
                    /* helpers chat - accessibles dans toute cette section */
                    const openChat = (uid, nom, role, photo) => {
                      if (!uid) return;
                      setPaChatTarget({ uid, nom: nom||"", role: role||"", photo: photo||null, ts: Date.now() });
                      setPaSelectedGroupe(null);
                      setPaGroupeDetail({ apprenants:[], fichiers:[] });
                      setPaCoursListe([]); setPaPresences([]);
                      setActiveTab("messages");
                    };
                    const ChatBtn = ({ uid, nom, role, photo }) => uid ? (
                      <button onClick={()=>openChat(uid, nom, role, photo)}
                        title={`Envoyer un message à ${nom||"…"}`}
                        style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"6px 13px", borderRadius:8, border:"1.5px solid #7c3aed", background:"#f5f3ff", color:"#7c3aed", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                        💬 Message
                      </button>
                    ) : null;

                    return (
                    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                      {/* Récap groupe */}
                      <div style={{ background:"#f8fafc", borderRadius:12, border:"1px solid #e2e8f0", padding:"16px 18px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 20px", fontSize:13 }}>
                        <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Nom : </span><strong>{paSelectedGroupe.nom||"-"}</strong></div>
                        <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Niveau : </span><strong>{paSelectedGroupe.niveau||"-"}</strong></div>
                        <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Filière : </span><span>{paSelectedGroupe.filiere||"-"}</span></div>
                        <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Type : </span><span>{paLibelleType(paSelectedGroupe)}{paEstPrive(paSelectedGroupe) ? " · 🔒 Coaching privé" : ""}</span></div>
                        {paGroupeDetail?.groupe?.lieu_coaching === "domicile" && (
                          <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Adresse : </span><span>🏠 {paGroupeDetail.groupe.adresse_coaching || "Non renseignée"}</span></div>
                        )}
                        <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Apprenants : </span><strong>{paSelectedGroupe.nb_apprenants??0}</strong> / {paSelectedGroupe.capacite_max||20}</div>
                        <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Statut : </span><span>{paSelectedGroupe.statut||"-"}</span></div>
                        {paSelectedGroupe.date_debut&&<div><span style={{ color:"#9ca3af", fontWeight:600 }}>Début : </span><span>{new Date(paSelectedGroupe.date_debut).toLocaleDateString("fr-FR")}</span></div>}
                        {paSelectedGroupe.date_fin&&<div><span style={{ color:"#9ca3af", fontWeight:600 }}>Fin : </span><span>{new Date(paSelectedGroupe.date_fin).toLocaleDateString("fr-FR")}</span></div>}
                      </div>

                      {/* ─ Clôture de la classe ─ */}
                      {paSelectedGroupe.statut !== "cloture" && (
                        <div style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                          <div>
                            <div style={{ fontWeight:800, color:"#991b1b", fontSize:13, marginBottom:2 }}>🔒 Clôturer cette classe</div>
                            <div style={{ fontSize:11, color:"#b91c1c" }}>Verrouille la classe et gèle les mensualités non dispensées. Les apprenants gardent leur accès, et la classe pourra être rouverte.</div>
                          </div>
                          <button
                            onClick={() => setPaCloturModal(true)}
                            style={{ padding:"8px 16px", borderRadius:8, border:"none", background:"#dc2626", color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}
                          >
                            🔒 Clôturer
                          </button>
                        </div>
                      )}
                      {paSelectedGroupe.statut === "cloture" && (
                        <div style={{ background:"#f1f5f9", border:"1.5px solid #cbd5e1", borderRadius:12, padding:"12px 18px", display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontSize:20 }}>🔒</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:800, color:"#475569", fontSize:13 }}>Classe clôturée</div>
                            <div style={{ fontSize:11, color:"#94a3b8" }}>
                              Cette classe est terminée. Les apprenants y restent rattachés avec tout leur historique -
                              la rouvrir suffit à reprendre les cours.
                            </div>
                          </div>
                          <button
                            disabled={paReouvrirLoading}
                            onClick={() => { setPaReouvrirDateFin(paSelectedGroupe.date_fin || ""); setPaReouvrirModal(true); }}
                            style={{ padding:"8px 16px", borderRadius:8, border:"none", background: paReouvrirLoading?"#e2e8f0":"#15803d", color: paReouvrirLoading?"#9ca3af":"#fff", fontWeight:700, fontSize:12, cursor: paReouvrirLoading?"not-allowed":"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                            ▶️ Rouvrir la classe
                          </button>
                        </div>
                      )}

                      {/* ── Réouverture ─────────────────────────────────────────────────
                          Les évaluations ne sont volontairement pas republiées : la clôture
                          les a fermées en masse sans marquer lesquelles, et les rouvrir
                          toutes ressusciterait celles que le coach avait fermées lui-même. */}
                      {paReouvrirModal && (
                        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:10002, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                          onClick={e => { if (e.target===e.currentTarget && !paReouvrirLoading) setPaReouvrirModal(false); }}>
                          <div style={{ background:"#fff", borderRadius:16, padding:26, width:"100%", maxWidth:480 }}>
                            <div style={{ fontSize:26, textAlign:"center", marginBottom:6 }}>▶️</div>
                            <h3 style={{ margin:"0 0 6px", fontSize:17, fontWeight:800, color:"#0f172a", textAlign:"center" }}>Rouvrir la classe</h3>
                            <p style={{ textAlign:"center", fontSize:13, color:"#6b7280", margin:"0 0 18px" }}>
                              <strong>{paSelectedGroupe.nom}</strong>
                            </p>

                            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:5 }}>
                              Nouvelle date de fin <span style={{ fontWeight:400, color:"#9ca3af" }}>(laisser vide = sans terme)</span>
                            </label>
                            <input type="date" value={paReouvrirDateFin} onChange={e => setPaReouvrirDateFin(e.target.value)}
                              style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:14, boxSizing:"border-box" }} />
                            <div style={{ fontSize:11, color:"#6b7280", marginTop:5 }}>
                              La clôture avait posé le {paSelectedGroupe.date_fin || "-"}. Garder une date passée
                              laisserait la classe active mais déjà terminée.
                            </div>

                            <div style={{ marginTop:16, padding:"12px 14px", borderRadius:10, background:"#f0fdf4", border:"1px solid #bbf7d0", fontSize:12.5, color:"#166534", lineHeight:1.65 }}>
                              Les apprenants sont toujours rattachés : séances, présences et progression sont intactes.
                              <br />Les évaluations fermées à la clôture <strong>ne sont pas republiées</strong> - le coach
                              republie celles qu'il souhaite.
                            </div>

                            <div style={{ display:"flex", gap:10, marginTop:20 }}>
                              <button onClick={() => setPaReouvrirModal(false)} disabled={paReouvrirLoading}
                                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:13, cursor:paReouvrirLoading?"not-allowed":"pointer" }}>
                                Annuler
                              </button>
                              <button disabled={paReouvrirLoading}
                                onClick={async () => {
                                  setPaReouvrirLoading(true);
                                  try {
                                    const r = await fetch(`${API_URL}/api/groupes/${paSelectedGroupe.id}/reouvrir`, {
                                      method:"POST", headers: authHeaders(),
                                      body: JSON.stringify({ date_fin: paReouvrirDateFin || null }),
                                    });
                                    const d = await r.json().catch(()=>({}));
                                    if (!r.ok) { toast.error(d.error || "Réouverture impossible"); return; }
                                    toast.success(`▶️ Classe rouverte - ${d.apprenants_notifies} apprenant(s) prévenu(s)`);
                                    setPaSelectedGroupe(prev => prev ? { ...prev, statut:"actif", date_fin: d.date_fin } : prev);
                                    setPaGroupes(prev => prev.map(g => g.id === paSelectedGroupe.id ? { ...g, statut:"actif", date_fin: d.date_fin } : g));
                                    setPaReouvrirModal(false);
                                  } catch { toast.error("Erreur réseau"); }
                                  finally { setPaReouvrirLoading(false); }
                                }}
                                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none", background: paReouvrirLoading?"#e2e8f0":"#15803d", color: paReouvrirLoading?"#9ca3af":"#fff", fontWeight:800, fontSize:13, cursor: paReouvrirLoading?"not-allowed":"pointer" }}>
                                {paReouvrirLoading ? "…" : "Confirmer la réouverture"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Modal confirmation clôture */}
                      {/* ── Reprise des cours ──────────────────────────────────────────
                          Une seule saisie : le mois de reprise. Tout le reste en découle -
                          les mois du creux restent neutralisés, la mensualité d'origine est
                          conservée, et un contrat borné est prolongé d'autant. */}
                      {paRepriseModal && (
                        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:10002, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                          onClick={e => { if (e.target===e.currentTarget && !paRepriseLoading) setPaRepriseModal(null); }}>
                          <div style={{ background:"#fff", borderRadius:16, padding:26, width:"100%", maxWidth:470 }}>
                            <div style={{ fontSize:26, textAlign:"center", marginBottom:6 }}>▶️</div>
                            <h3 style={{ margin:"0 0 6px", fontSize:16, fontWeight:800, color:"#0f172a", textAlign:"center" }}>Reprendre les cours</h3>
                            <p style={{ textAlign:"center", fontSize:12.5, color:"#6b7280", margin:"0 0 18px" }}>
                              <strong>{paRepriseModal.nom}</strong>
                            </p>

                            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:5 }}>Mois de reprise</label>
                            <input type="month" value={paRepriseMois} onChange={e => setPaRepriseMois(e.target.value)}
                              style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:14, boxSizing:"border-box" }} />

                            <div style={{ marginTop:14, padding:"12px 14px", borderRadius:10, background:"#f0fdf4", border:"1px solid #bbf7d0", fontSize:12.5, color:"#166534", lineHeight:1.65 }}>
                              Les <strong>{(paRepriseModal.suspension?.mois_neutralises||[]).length} mois</strong> de la pause
                              restent neutralisés - ils ne seront jamais facturés. La facturation redémarre
                              au mois choisi, à la mensualité d'origine.
                            </div>

                            <div style={{ display:"flex", gap:10, marginTop:20 }}>
                              <button onClick={() => setPaRepriseModal(null)} disabled={paRepriseLoading}
                                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:13, cursor:paRepriseLoading?"not-allowed":"pointer" }}>
                                Annuler
                              </button>
                              <button disabled={paRepriseLoading || !paRepriseMois}
                                onClick={async () => {
                                  setPaRepriseLoading(true);
                                  try {
                                    const r = await fetch(`${API_URL}/api/parcours/assignations/${paRepriseModal.assignationId}/reprendre-plan`, {
                                      method:"POST", headers: authHeaders(),
                                      body: JSON.stringify({ mois_reprise: paRepriseMois, date_reprise: new Date().toISOString().slice(0,10) }),
                                    });
                                    const d = await r.json().catch(()=>({}));
                                    if (!r.ok) { toast.error(d.error || "Reprise impossible"); return; }
                                    toast.success(d.prolongation
                                      ? `▶️ Cours repris - contrat prolongé de ${d.prolongation} mois`
                                      : "▶️ Cours repris - facturation relancée");
                                    setPaRepriseModal(null);
                                    setPaApprenantAssignation(prev => prev && prev.id === paRepriseModal.assignationId
                                      ? { ...prev, plan_paiement: d.plan_paiement }
                                      : prev);
                                  } catch { toast.error("Erreur réseau"); }
                                  finally { setPaRepriseLoading(false); }
                                }}
                                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none", background:(paRepriseLoading||!paRepriseMois)?"#e2e8f0":"#15803d", color:(paRepriseLoading||!paRepriseMois)?"#9ca3af":"#fff", fontWeight:800, fontSize:13, cursor:(paRepriseLoading||!paRepriseMois)?"not-allowed":"pointer" }}>
                                {paRepriseLoading ? "…" : "Confirmer la reprise"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {paCloturModal && (
                        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10001 }}>
                          <div style={{ background:"#fff", borderRadius:16, padding:28, width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>
                            <div style={{ fontSize:28, textAlign:"center", marginBottom:8 }}>🔒</div>
                            <h3 style={{ margin:"0 0 6px", fontSize:17, fontWeight:800, color:"#0f172a", textAlign:"center" }}>Clôturer la classe</h3>
                            <p style={{ textAlign:"center", fontSize:13, color:"#6b7280", marginBottom:20 }}>
                              <strong>{paSelectedGroupe.nom}</strong>
                            </p>
                            {/* Le ton est ambre, pas rouge : depuis l'ajout de « Rouvrir la classe », la
                                clôture n'est plus un point de non-retour. L'annoncer comme irréversible
                                dissuaderait de clôturer des classes qui devraient l'être. */}
                            <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:10, padding:"12px 14px", marginBottom:20, fontSize:12, color:"#78350f", lineHeight:1.7 }}>
                              <div><strong>Cette action va :</strong></div>
                              <div>• Passer le statut du groupe à <strong>"cloture"</strong></div>
                              <div>• Verrouiller la classe - plus aucun ajout possible (apprenants, séances, évaluations)</div>
                              <div>• <strong>Geler la facturation</strong> - les mensualités des mois non dispensés ne seront plus réclamées</div>
                              <div>• Clôturer toutes les évaluations encore publiées</div>
                              <div>• Notifier le coach et les apprenants</div>
                              <div style={{ marginTop:6, fontWeight:700 }}>Les apprenants ne sont pas archivés - ils gardent un accès intact à toutes leurs données.</div>
                              <div style={{ marginTop:6 }}>↩️ Réversible : la classe pourra être rouverte, et la facturation reprendra sans arriérés.</div>
                            </div>
                            <div style={{ display:"flex", gap:10 }}>
                              <button onClick={() => setPaCloturModal(false)} style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                                Annuler
                              </button>
                              <button
                                disabled={paCloturLoading}
                                onClick={async () => {
                                  if (paCloturLoading) return;
                                  setPaCloturLoading(true);
                                  try {
                                    const token = localStorage.getItem("admin_token");
                                    const r = await fetch(`${API_URL}/api/groupes/${paSelectedGroupe.id}/cloture`, {
                                      method: "POST",
                                      headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
                                    });
                                    const d = await r.json();
                                    if (!r.ok) throw new Error(d.error || "Erreur");
                                    const updated = { ...paSelectedGroupe, statut: "cloture" };
                                    setPaSelectedGroupe(updated);
                                    setPaGroupes(prev => prev.map(g => g.id === paSelectedGroupe.id ? { ...g, statut: "cloture" } : g));
                                    // Le gel est la conséquence la moins visible de la clôture : le
                                    // dire ici évite d'avoir à ouvrir un dossier pour vérifier qu'il
                                    // a bien eu lieu.
                                    const gel = d.plans_geles
                                      ? ` - ${d.plans_geles} plan${d.plans_geles > 1 ? "s" : ""} gelé${d.plans_geles > 1 ? "s" : ""}`
                                        + (d.mois_geles ? `, ${d.mois_geles} mois neutralisé${d.mois_geles > 1 ? "s" : ""}` : "")
                                      : "";
                                    toast.success(`✅ Classe "${paSelectedGroupe.nom}" clôturée${gel}`);
                                    setPaCloturModal(false);
                                  } catch(e) {
                                    toast.error(e.message || "Erreur lors de la clôture");
                                  } finally {
                                    setPaCloturLoading(false);
                                  }
                                }}
                                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none", background: paCloturLoading ? "#e5e7eb" : "#dc2626", color:"#fff", fontWeight:800, fontSize:13, cursor: paCloturLoading ? "not-allowed" : "pointer" }}
                              >
                                {paCloturLoading ? "Clôture en cours…" : "🔒 Confirmer la clôture"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Assignation coach */}
                      {(()=>{
                        const handleAssigner = async (coachIdToAssign, coachNomToAssign) => {
                          if (paAssignLoading) return;
                          setPaAssignLoading(true);
                          try {
                            const token = localStorage.getItem("admin_token");
                            const body = coachIdToAssign
                              ? { coach_id: coachIdToAssign }
                              : { coach_nom_manuel: coachNomToAssign };
                            const r = await fetch(`${API_URL}/api/groupes/${paSelectedGroupe.id}`, {
                              method: "PATCH",
                              headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
                              body: JSON.stringify(body),
                            });
                            const d = await r.json();
                            if (!r.ok) throw new Error(d.error || "Erreur");
                            const updated = { ...paSelectedGroupe, coach_id: coachIdToAssign||null, coach_nom: coachNomToAssign };
                            setPaSelectedGroupe(updated);
                            setPaGroupes(prev => prev.map(g => g.id === paSelectedGroupe.id ? { ...g, coach_id: coachIdToAssign||null, coach_nom: coachNomToAssign } : g));
                            toast.success(`✅ Coach "${coachNomToAssign}" assigné au groupe "${paSelectedGroupe.nom}"`);
                            setPaAssignManuel(false); setPaAssignManuelNom(""); setPaAssignCoachId(coachIdToAssign||"");
                          } catch(e) { toast.error(e.message || "Erreur assignation coach"); }
                          finally { setPaAssignLoading(false); }
                        };

                        const coachActuel = paCoachsList.find(c => String(c.id) === String(paSelectedGroupe.coach_id));
                        const niveau = paSelectedGroupe.niveau || "";
                        const searchQ = paAssignSearch.toLowerCase();
                        const filteredCoachs = paCoachsList.filter(c => {
                          // La categorie se deduit de la note ; un coach jamais observe tombe
                          // dans « Non evalue » et non dans la pire categorie.
                          if (paAssignCategorie && categorieCoach(c.moyenne).cle !== paAssignCategorie) return false;
                          if (!searchQ) return true;
                          const fullNom = `${c.prenom||""} ${c.nom||""}`.toLowerCase();
                          const niv = String(c.niveaux||c.coach_info?.niveaux||"").toLowerCase();
                          const spec = String(c.specialite||c.coach_info?.specialite||"").toLowerCase();
                          return fullNom.includes(searchQ)||niv.includes(searchQ)||spec.includes(searchQ);
                        }).sort((a,b)=>{
                          const aNiv = String(a.niveaux||a.coach_info?.niveaux||"");
                          const bNiv = String(b.niveaux||b.coach_info?.niveaux||"");
                          return (bNiv.includes(niveau)?1:0)-(aNiv.includes(niveau)?1:0);
                        });

                        /* ── VUE VERROUILLÉE : coach déjà assigné ── */
                        if (paSelectedGroupe.coach_id) {
                          const photoA    = coachActuel?.avatar_url || coachActuel?.coach_info?.photo_url || null;
                          const initA     = ((coachActuel?.prenom?.[0]||"")+(coachActuel?.nom?.[0]||"")).toUpperCase()||"CO";
                          const filiereA  = coachActuel?.coach_info?.filiere||coachActuel?.departement||"";
                          const matriculeA= coachActuel?.coach_info?.matricule||"";
                          const gradeA    = coachActuel?.grade||coachActuel?.coach_info?.grade||"";
                          const contratA  = coachActuel?.contrat||coachActuel?.coach_info?.contrat||"";
                          const evalA_    = Number(coachActuel?.evaluation||coachActuel?.coach_info?.evaluation||0);
                          const niveauxA  = String(coachActuel?.niveaux||coachActuel?.coach_info?.niveaux||"");
                          const specA     = coachActuel?.specialite||coachActuel?.coach_info?.specialite||"";
                          const telA      = coachActuel?.telephone||coachActuel?.coach_info?.telephone||"";
                          const nbA       = coachActuel?.nbr_contrats_actifs;
                          const nomA      = coachActuel ? `${coachActuel.prenom||""} ${coachActuel.nom||""}`.trim() : (paSelectedGroupe.coach_nom||`Coach #${paSelectedGroupe.coach_id}`);
                          return (
                            <div style={{ borderRadius:12, border:"2px solid #86efac", overflow:"hidden" }}>
                              {/* Bandeau vert verrouillé */}
                              <div style={{ background:"linear-gradient(90deg,#16a34a,#15803d)", padding:"12px 18px", display:"flex", alignItems:"center", gap:10 }}>
                                <span style={{ fontSize:16 }}>🔒</span>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:13, fontWeight:800, color:"#fff" }}>Coach verrouillé</div>
                                  <div style={{ fontSize:11, color:"rgba(255,255,255,.75)", marginTop:1 }}>Le changement est désactivé pour préserver la continuité des sessions en cours.</div>
                                </div>
                                <span style={{ fontSize:10, padding:"3px 10px", borderRadius:99, background:"rgba(255,255,255,.2)", color:"#fff", fontWeight:700 }}>✓ Assigné</span>
                              </div>
                              {/* Carte coach enrichie */}
                              <div style={{ padding:"16px 18px", background:"#f0fdf4" }}>
                                <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                                  <div style={{ position:"relative", flexShrink:0 }}>
                                    {photoA
                                      ? <img src={photoA} alt={nomA} style={{ width:56,height:56,borderRadius:"50%",objectFit:"cover",border:"3px solid #86efac" }} />
                                      : <div style={{ width:56,height:56,borderRadius:"50%",background:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:20,color:"#fff",border:"3px solid #86efac" }}>{initA}</div>
                                    }
                                    <span style={{ position:"absolute",bottom:2,right:2,width:14,height:14,borderRadius:"50%",background:"#22c55e",border:"2px solid #f0fdf4",display:"block" }} />
                                  </div>
                                  <div style={{ flex:1,minWidth:0 }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4, flexWrap:"wrap" }}>
                                      <span style={{ fontWeight:800, color:"#0f172a", fontSize:14 }}>{nomA}</span>
                                      <span style={{ fontSize:9,padding:"1px 7px",borderRadius:99,background:"#dcfce7",color:"#16a34a",fontWeight:700 }}>✓ Coach assigné</span>
                                    </div>
                                    {(filiereA||matriculeA) && (
                                      <div style={{ fontSize:11, color:"#64748b", marginBottom:5, display:"flex", gap:8, flexWrap:"wrap" }}>
                                        {filiereA && <span>🏫 {filiereA}</span>}
                                        {matriculeA && <span style={{ fontFamily:"monospace", background:"#dcfce7", padding:"0 5px", borderRadius:4 }}>#{matriculeA}</span>}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:5 }}>
                                      {niveauxA && <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#e0e7ff",color:"#3730a3",fontWeight:700 }}>📊 {niveauxA}</span>}
                                      {specA && <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#fef3c7",color:"#92400e",fontWeight:600 }}>🎓 {specA}</span>}
                                      {gradeA && <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#f3e8ff",color:"#6d28d9",fontWeight:600 }}>🎖 {gradeA}</span>}
                                      {contratA && <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#f8fafc",color:"#6b7280",fontWeight:600,border:"1px solid #e2e8f0" }}>📄 {contratA}</span>}
                                      {evalA_>0 && <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:"#fffbeb",color:"#d97706",fontWeight:700 }}>⭐ {evalA_.toFixed(1)}/5</span>}
                                      {nbA!==undefined && <span style={{ fontSize:10,padding:"1px 7px",borderRadius:99,background:nbA>0?"#ede9fe":"#f8fafc",color:nbA>0?"#6d28d9":"#9ca3af",fontWeight:600,border:"1px solid #e2e8f0" }}>🤝 {nbA} contrat{nbA!==1?"s":""}</span>}
                                    </div>
                                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginTop:2 }}>
                                      <div style={{ fontSize:11, color:"#94a3b8", display:"flex", gap:14, flexWrap:"wrap" }}>
                                        {coachActuel?.email && <span>✉ {coachActuel.email}</span>}
                                        {telA && <span>📞 {telA}</span>}
                                      </div>
                                      <ChatBtn uid={paSelectedGroupe.coach_id} nom={nomA} role="coach" photo={photoA} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        /* ── VUE ASSIGNATION : pas encore de coach ── */
                        return (
                          <div style={{ borderRadius:12, border:"1.5px solid #fcd34d", overflow:"hidden" }}>
                            {/* Header */}
                            <div style={{ background:"#fffbeb", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                              <div style={{ fontSize:13, fontWeight:800, color:"#92400e" }}>⚠️ Aucun coach - assignez-en un</div>
                              {!paAssignManuel && (
                                <button onClick={()=>{ setPaAssignManuel(true); setPaAssignCoachId(""); }}
                                  style={{ fontSize:11, fontWeight:700, color:"#6b7280", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:6, padding:"4px 10px", cursor:"pointer" }}>
                                  ✏️ Saisie manuelle
                                </button>
                              )}
                            </div>

                            <div style={{ padding:"16px 18px", background:"#fff", display:"flex", flexDirection:"column", gap:14 }}>
                              {/* Saisie manuelle */}
                              {paAssignManuel ? (
                                <div style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"14px 16px" }}>
                                  <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>✏️ Saisie manuelle du nom du coach</div>
                                  <div style={{ display:"flex", gap:8 }}>
                                    <input value={paAssignManuelNom} onChange={e=>setPaAssignManuelNom(e.target.value)}
                                      placeholder="Prénom Nom du coach…"
                                      style={{ flex:1, padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none" }} />
                                    <Btn small color="#16a34a" disabled={!paAssignManuelNom.trim()||paAssignLoading||!peut("classes","update")}
                                      onClick={()=>handleAssigner(null, paAssignManuelNom.trim())}>
                                      {paAssignLoading?"…":peut("classes","update")?"Assigner ✓":"🔒 Assigner"}
                                    </Btn>
                                    <Btn small outline onClick={()=>{ setPaAssignManuel(false); setPaAssignManuelNom(""); }}>Annuler</Btn>
                                  </div>
                                  <div style={{ fontSize:10, color:"#9ca3af", marginTop:6 }}>Utilisez cette option si le coach n'apparaît pas dans la liste.</div>
                                </div>
                              ) : (
                                <>
                                  {/* Barre de recherche */}
                                  <div style={{ position:"relative" }}>
                                    <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#9ca3af", fontSize:14 }}>🔍</span>
                                    <input value={paAssignSearch} onChange={e=>setPaAssignSearch(e.target.value)}
                                      placeholder={`Rechercher par nom, niveau (ex: ${niveau||"B1"}), spécialité…`}
                                      style={{ width:"100%", padding:"9px 12px 9px 32px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                                  </div>

                                  <DispoMoisToggle moisSel={paGroupeDispoMois} setMoisSel={setPaGroupeDispoMois} periodes={getPeriodesDispo()} />

                                  {/* Filtre par categorie de contrat. Le compte est affiche sur
                                      chaque puce : une categorie vide se voit avant d'etre
                                      cliquee, plutot que de renvoyer une liste vide sans raison. */}
                                  <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                                    <span style={{ fontSize:11, color:"#6b7280", fontWeight:600 }}>🏷 Catégorie :</span>
                                    {[{ cle:"", libelle:"Toutes", couleur:"#475569", fond:"#f1f5f9", bord:"#e2e8f0" },
                                      ...CATEGORIES_COACH, CATEGORIE_SANS_NOTE].map(cat => {
                                      const actif = paAssignCategorie === cat.cle;
                                      const nb = cat.cle === ""
                                        ? paCoachsList.length
                                        : paCoachsList.filter(c => categorieCoach(c.moyenne).cle === cat.cle).length;
                                      return (
                                        <button key={cat.cle || "toutes"} type="button"
                                          onClick={()=>setPaAssignCategorie(actif ? "" : cat.cle)}
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

                                  {/* Liste coaches - grille de cartes (même présentation que le
                                      sélecteur de coach d'Onboarding), plus lisible que l'ancienne
                                      liste en pleine largeur qui écrasait le contenu des cartes. */}
                                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(360px, 1fr))", gap:14, maxHeight:560, overflowY:"auto", padding:"2px 0" }}>
                                    {filteredCoachs.length === 0 ? (
                                      <div style={{ gridColumn:"1 / -1", textAlign:"center", padding:"24px 0", color:"#9ca3af", fontSize:12 }}>
                                        Aucun coach trouvé.
                                        <button onClick={()=>setPaAssignManuel(true)} style={{ marginLeft:8, color:PA_COLOR, background:"none", border:"none", cursor:"pointer", fontWeight:700, fontSize:12, textDecoration:"underline" }}>
                                          Saisir manuellement →
                                        </button>
                                      </div>
                                    ) : filteredCoachs.map(c => {
                                      const nom = `${c.prenom||""} ${c.nom||""}`.trim();
                                      const initC = ((c.prenom?.[0]||"")+(c.nom?.[0]||"")).toUpperCase()||"CO";
                                      const photo = c.avatar_url || c.coach_info?.photo_url || null;
                                      const niveaux = String(c.niveaux||c.coach_info?.niveaux||"");
                                      const spec = c.specialite||c.coach_info?.specialite||"";
                                      const eval_ = Number(c.evaluation||c.coach_info?.evaluation||0);
                                      // Note d'évaluation RÉELLE, calculée depuis les rapports d'observation et
                                      // les évaluations. À ne pas confondre avec `eval_`, saisi une fois dans la
                                      // fiche et presque jamais tenu à jour.
                                      const noteMoy = c.moyenne != null ? Number(c.moyenne) : null;
                                      const nbEval  = Number(c.nb_evaluations) || 0;
                                      // Les cinq dernières notes, dans l'ordre chronologique : la barre doit se
                                      // lire de gauche à droite comme une progression.
                                      const dernieresNotes = (c.historique || [])
                                        .slice().sort((a,b) => new Date(a.date) - new Date(b.date))
                                        .slice(-5).map(h => Number(h.note)).filter(n => n > 0);
                                      const grade = c.grade||c.coach_info?.grade||"";
                                      const contrat = c.contrat||c.coach_info?.contrat||"";
                                      const filiere = c.coach_info?.filiere||c.departement||"";
                                      const matricule = c.coach_info?.matricule||"";
                                      const nbContrats = c.nbr_contrats_actifs;
                                      const telephone = c.telephone||c.coach_info?.telephone||"";
                                      const isActif = c.actif !== false;
                                      const isSelected = paAssignCoachId === String(c.id);
                                      const isMatch = niveau && niveaux.includes(niveau);
                                      // Disponibilité réelle - dérivée des groupes actifs déjà assignés à ce coach
                                      const groupesActifsCoach = paGroupes.filter(g => String(g.coach_id) === String(c.id) && g.statut === "actif" && g.id !== paSelectedGroupe.id);
                                      const nbGroupesActifs = groupesActifsCoach.length;
                                      const creneauxOccupesCoach = groupesActifsCoach.flatMap(g => Array.isArray(g.horaires) ? g.horaires : (g.horaires ? [g.horaires] : []));
                                      const dispoCoach = nbGroupesActifs === 0
                                        ? { label:"Disponible", icon:"🟢", color:"#15803d", bg:"#dcfce7" }
                                        : nbGroupesActifs <= 2
                                          ? { label:"Peu chargé", icon:"🟡", color:"#a16207", bg:"#fef9c3" }
                                          : { label:"Chargé", icon:"🔴", color:"#b91c1c", bg:"#fee2e2" };
                                      return (
                                        <div key={c.id} onClick={()=>setPaAssignCoachId(isSelected?"":String(c.id))}
                                          style={{ borderRadius:12, border:`2px solid ${isSelected?PA_COLOR:isMatch?"#86efac":"#e5e7eb"}`, background:isSelected?PA_LIGHT:"#fff", cursor:"pointer", transition:"all .15s", overflow:"hidden", minHeight:240 }}>
                                          {isSelected && <div style={{ height:4, background:PA_GRADIENT }} />}
                                          <div style={{ padding:"18px 20px", display:"flex", gap:16, alignItems:"flex-start" }}>
                                            <div style={{ position:"relative", flexShrink:0 }}>
                                              {photo
                                                ? <img src={photo} alt={nom} style={{ width:64,height:64,borderRadius:"50%",objectFit:"cover",border:`3px solid ${isSelected?PA_COLOR:isMatch?"#86efac":"#e5e7eb"}` }} />
                                                : <div style={{ width:64,height:64,borderRadius:"50%",background:isSelected?PA_COLOR:isMatch?"#bbf7d0":"#e5e7eb",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:21,color:isSelected?"#fff":isMatch?"#166534":"#6b7280",border:`3px solid ${isSelected?PA_COLOR:isMatch?"#86efac":"#e5e7eb"}` }}>{initC}</div>
                                              }
                                              <span style={{ position:"absolute",bottom:2,right:2,width:15,height:15,borderRadius:"50%",background:isActif?"#22c55e":"#ef4444",border:"2.5px solid #fff",display:"block" }} title={isActif?"Actif":"Inactif"} />
                                            </div>
                                            <div style={{ flex:1,minWidth:0 }}>
                                              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6, flexWrap:"wrap" }}>
                                                <span style={{ fontWeight:800, color:isSelected?PA_COLOR:"#0f172a", fontSize:16 }}>{nom}</span>
                                                {isMatch && <span style={{ fontSize:11,padding:"2px 8px",borderRadius:99,background:"#d1fae5",color:"#065f46",fontWeight:700 }}>✓ {niveau}</span>}
                                                {!isActif && <span style={{ fontSize:11,padding:"2px 8px",borderRadius:99,background:"#fee2e2",color:"#b91c1c",fontWeight:700 }}>Inactif</span>}
                                              </div>
                                              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:8 }}>
                                                <span title={`${nbGroupesActifs} groupe(s) actif(s) assigné(s) à ce coach`}
                                                  style={{ fontSize:11.5, fontWeight:700, background:dispoCoach.bg, color:dispoCoach.color, borderRadius:99, padding:"3px 10px" }}>
                                                  {dispoCoach.icon} {dispoCoach.label} · {nbGroupesActifs} groupe{nbGroupesActifs>1?"s":""}
                                                </span>
                                              </div>

                                              {/* Évaluation - même lecture que le classement des coachs :
                                                  la progression des dernières notes, la moyenne dans son
                                                  cercle, la tendance. Le PA voit d'un coup d'œil si le coach
                                                  monte ou descend, pas seulement où il en est. */}
                                              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10,
                                                background: noteMoy ? "#fffdf5" : "#f8fafc",
                                                border:`1px solid ${noteMoy ? "#fde68a" : "#e2e8f0"}`,
                                                borderRadius:12, padding:"8px 14px", width:"fit-content" }}>

                                                {/* Un cercle portant « 3.3 » ne dit pas de quoi il s'agit :
                                                    le libellé nomme la mesure. Le nombre d'évaluations reste
                                                    disponible au survol du cercle. */}
                                                <div style={{ flexShrink:0, lineHeight:1.25 }}>
                                                  <div style={{ fontSize:10.5, fontWeight:800, color: noteMoy ? "#92400e" : "#64748b",
                                                    textTransform:"uppercase", letterSpacing:".05em" }}>
                                                    Note moyenne
                                                  </div>
                                                </div>

                                                {dernieresNotes.length > 0 && (
                                                  <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:26, flexShrink:0 }}>
                                                    {dernieresNotes.map((n, ni) => (
                                                      <div key={ni} title={`Note : ${n}/5`}
                                                        style={{ width:8, borderRadius:3, background:NOTE_COUL(n),
                                                          height:`${(n/5)*100}%`, minHeight:4 }} />
                                                    ))}
                                                  </div>
                                                )}

                                                <div title={noteMoy ? `Moyenne sur ${nbEval} évaluation${nbEval>1?"s":""}` : "Aucune observation notée"}
                                                  style={{ width:46, height:46, borderRadius:"50%", flexShrink:0,
                                                    background:NOTE_FOND(noteMoy), border:`2.5px solid ${NOTE_COUL(noteMoy)}`,
                                                    display:"flex", alignItems:"center", justifyContent:"center",
                                                    fontWeight:900, fontSize:14, color:NOTE_COUL(noteMoy) }}>
                                                  {noteMoy ? noteMoy.toFixed(1) : "-"}
                                                </div>

                                                {/* La categorie de contrat que cette note ouvre. Le chiffre
                                                    seul n'informe que ceux qui connaissent les seuils. */}
                                                <BadgeCategorieCoach note={noteMoy} taille="sm" />

                                                {/* La tendance n'a de sens qu'avec au moins deux notes.
                                                    L'absence d'évaluation est déjà dite par le libellé. */}
                                                {noteMoy && dernieresNotes.length >= 2 && (
                                                  <div title={`Tendance : ${c.tendance}`}
                                                    style={{ fontSize:18, fontWeight:900, color:NOTE_TEND_COUL(c.tendance),
                                                      flexShrink:0, width:22, textAlign:"center" }}>
                                                    {NOTE_TEND_ICO(c.tendance)}
                                                  </div>
                                                )}
                                              </div>
                                              {creneauxOccupesCoach.length > 0 && (
                                                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                                                  {creneauxOccupesCoach.slice(0,4).map((h,i) => (
                                                    <span key={i} style={{ fontSize:11, color:"#64748b", background:"#f1f5f9", borderRadius:6, padding:"2px 8px" }}>🕐 {h}</span>
                                                  ))}
                                                  {creneauxOccupesCoach.length > 4 && <span style={{ fontSize:11, color:"#94a3b8" }}>+{creneauxOccupesCoach.length-4}</span>}
                                                </div>
                                              )}
                                              <CoachDispoBlock coachId={c.id} coachDispoMap={paCoachDispoMap} {...getPeriodesDispo()[paGroupeDispoMois]} />
                                              {(filiere||matricule) && (
                                                <div style={{ fontSize:13, color:"#64748b", marginBottom:8, display:"flex", gap:10, flexWrap:"wrap" }}>
                                                  {filiere && <span>🏫 {filiere}</span>}
                                                  {matricule && <span style={{ fontFamily:"monospace", background:"#f1f5f9", padding:"1px 7px", borderRadius:5 }}>#{matricule}</span>}
                                                </div>
                                              )}
                                              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                                                {niveaux && <span style={{ fontSize:12,padding:"2px 9px",borderRadius:99,background:"#e0e7ff",color:"#3730a3",fontWeight:700 }}>📊 {niveaux}</span>}
                                                {spec && <span style={{ fontSize:12,padding:"2px 9px",borderRadius:99,background:"#fef3c7",color:"#92400e",fontWeight:600 }}>🎓 {spec}</span>}
                                                {grade && <span style={{ fontSize:12,padding:"2px 9px",borderRadius:99,background:"#f3e8ff",color:"#6d28d9",fontWeight:600 }}>🎖 {grade}</span>}
                                                {contrat && <span style={{ fontSize:12,padding:"2px 9px",borderRadius:99,background:"#f8fafc",color:"#6b7280",fontWeight:600,border:"1px solid #e2e8f0" }}>📄 {contrat}</span>}
                                                {eval_>0 && <span style={{ fontSize:12,padding:"2px 9px",borderRadius:99,background:"#fffbeb",color:"#d97706",fontWeight:700 }}>⭐ {eval_.toFixed(1)}/5</span>}
                                                {nbContrats!==undefined && <span style={{ fontSize:12,padding:"2px 9px",borderRadius:99,background:nbContrats>0?"#ede9fe":"#f8fafc",color:nbContrats>0?"#6d28d9":"#9ca3af",fontWeight:600,border:"1px solid #e2e8f0" }}>🤝 {nbContrats} contrat{nbContrats!==1?"s":""}</span>}
                                              </div>
                                              <div style={{ fontSize:12.5, color:"#94a3b8", display:"flex", gap:14, flexWrap:"wrap" }}>
                                                {c.email && <span>✉ {c.email}</span>}
                                                {telephone && <span>📞 {telephone}</span>}
                                              </div>
                                            </div>
                                            {isSelected && <span style={{ color:PA_COLOR,fontWeight:900,fontSize:24,flexShrink:0,marginTop:4 }}>✓</span>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Bouton confirmer */}
                                  {paAssignCoachId && (
                                    <div style={{ display:"flex", justifyContent:"flex-end", paddingTop:4 }}>
                                      <Btn color="#16a34a" disabled={paAssignLoading||!peut("classes","update")}
                                        onClick={()=>{
                                          const c = paCoachsList.find(x=>String(x.id)===paAssignCoachId);
                                          const nom = c ? `${c.prenom||""} ${c.nom||""}`.trim() : `#${paAssignCoachId}`;
                                          handleAssigner(paAssignCoachId, nom);
                                        }}>
                                        {paAssignLoading?"⏳ En cours…":peut("classes","update")?"✅ Assigner ce coach":"🔒 Assigner ce coach"}
                                      </Btn>
                                    </div>
                                  )}
                                </>
                              )}

                              <div style={{ fontSize:11, color:"#9ca3af", borderTop:"1px solid #f1f5f9", paddingTop:10 }}>
                                Le coach recevra une notification et verra ce groupe dans son planning.
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Cartes Onboarding + Assistantes en ligne ── */}
                      {(()=>{ return (<>
                      {/* Carte Assistante Onboarding */}
                      {paSelectedGroupe.created_by_nom && (
                        <div style={{ borderRadius:12, border:"1.5px solid #e0e7ff", overflow:"hidden" }}>
                          <div style={{ background:"linear-gradient(90deg,#4f46e5,#7c3aed)", padding:"12px 18px", display:"flex", alignItems:"center", gap:10 }}>
                            <span style={{ fontSize:16 }}>👤</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:800, color:"#fff" }}>
                                {paSelectedGroupe.created_by_role === "onboarding" ? "Assistante Onboarding" : paSelectedGroupe.created_by_role === "commercial" ? "Assistante Commerciale" : "Créateur du groupe"}
                              </div>
                              <div style={{ fontSize:11, color:"rgba(255,255,255,.75)", marginTop:1 }}>Responsable de la création et du suivi du groupe</div>
                            </div>
                            <span style={{ fontSize:10, padding:"3px 10px", borderRadius:99, background:"rgba(255,255,255,.2)", color:"#fff", fontWeight:700 }}>
                              {paSelectedGroupe.created_by_role === "onboarding" ? "Onboarding" : paSelectedGroupe.created_by_role === "commercial" ? "Commercial" : "-"}
                            </span>
                          </div>
                          <div style={{ padding:"16px 18px", background:"#f5f3ff" }}>
                            <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                              <div style={{ flexShrink:0 }}>
                                {paSelectedGroupe.created_by_photo ? (
                                  <img src={paSelectedGroupe.created_by_photo} alt={paSelectedGroupe.created_by_nom}
                                    style={{ width:52, height:52, borderRadius:"50%", objectFit:"cover", border:"3px solid #c4b5fd" }} />
                                ) : (
                                  <div style={{ width:52, height:52, borderRadius:"50%", background:"#4f46e5", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:18, color:"#fff", border:"3px solid #c4b5fd" }}>
                                    {((paSelectedGroupe.created_by_nom||"?")[0]).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontWeight:800, color:"#1e1b4b", fontSize:14, marginBottom:4 }}>{paSelectedGroupe.created_by_nom}</div>
                                <div style={{ fontSize:11, color:"#7c3aed", fontWeight:700, marginBottom:6 }}>
                                  {paSelectedGroupe.created_by_role === "onboarding" ? "🎓 Assistante Onboarding" : paSelectedGroupe.created_by_role === "commercial" ? "💼 Assistante Commerciale" : paSelectedGroupe.created_by_role || ""}
                                </div>
                                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                                  <div style={{ fontSize:11, color:"#64748b", display:"flex", gap:16, flexWrap:"wrap" }}>
                                    {paSelectedGroupe.created_by_email && <span>✉ {paSelectedGroupe.created_by_email}</span>}
                                    {paSelectedGroupe.created_by_telephone && <span>📞 {paSelectedGroupe.created_by_telephone}</span>}
                                  </div>
                                  <ChatBtn uid={paSelectedGroupe.created_by_utilisateur_id} nom={paSelectedGroupe.created_by_nom} role={paSelectedGroupe.created_by_role} photo={paSelectedGroupe.created_by_photo} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cartes Assistantes Commerciales (en ligne) */}
                      {(paSelectedGroupe.assistantes_commerciales || []).length > 0 && (
                        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                          <div style={{ fontSize:12, fontWeight:800, color:"#64748b", textTransform:"uppercase", letterSpacing:".05em" }}>
                            💼 Assistante{(paSelectedGroupe.assistantes_commerciales||[]).length>1?"s":""} en ligne
                          </div>
                          {(paSelectedGroupe.assistantes_commerciales||[]).map((ac, idx) => (
                            <div key={ac.id||idx} style={{ borderRadius:12, border:"1.5px solid #dbeafe", overflow:"hidden" }}>
                              <div style={{ background:"linear-gradient(90deg,#0891b2,#1d4ed8)", padding:"10px 16px", display:"flex", alignItems:"center", gap:10 }}>
                                <span style={{ fontSize:14 }}>💼</span>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>Assistante en ligne</div>
                                  <div style={{ fontSize:10, color:"rgba(255,255,255,.75)", marginTop:1 }}>Suivi commercial & inscription des apprenants</div>
                                </div>
                                <span style={{ fontSize:10, padding:"3px 10px", borderRadius:99, background:"rgba(255,255,255,.2)", color:"#fff", fontWeight:700 }}>Commercial</span>
                              </div>
                              <div style={{ padding:"14px 16px", background:"#eff6ff" }}>
                                <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                                  <div style={{ flexShrink:0 }}>
                                    {ac.photo_url ? (
                                      <img src={ac.photo_url} alt={ac.nom} style={{ width:46, height:46, borderRadius:"50%", objectFit:"cover", border:"3px solid #93c5fd" }} />
                                    ) : (
                                      <div style={{ width:46, height:46, borderRadius:"50%", background:"#0891b2", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:16, color:"#fff", border:"3px solid #93c5fd" }}>
                                        {((ac.nom||"?")[0]).toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontWeight:800, color:"#0c1a40", fontSize:13, marginBottom:3 }}>{ac.nom || "-"}</div>
                                    <div style={{ fontSize:10, color:"#0891b2", fontWeight:700, marginBottom:5 }}>💼 Assistante Commerciale</div>
                                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                                      <div style={{ fontSize:11, color:"#64748b", display:"flex", gap:14, flexWrap:"wrap" }}>
                                        {ac.email && <span>✉ {ac.email}</span>}
                                        {ac.telephone && <span>📞 {ac.telephone}</span>}
                                      </div>
                                      <ChatBtn uid={ac.utilisateur_id} nom={ac.nom} role="commercial" photo={ac.photo_url} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                          </>
                        );
                      })()}
                    </div>
                    );
                  })()}

                  {/* ─ Apprenants ─ */}
                  {paSubTab === "apprenants" && (
                    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"auto" }}>
                      {paGroupeDetail.apprenants.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>
                          <div style={{ fontSize:36, marginBottom:8 }}>🎓</div>
                          <div style={{ fontWeight:600 }}>Aucun apprenant dans ce groupe</div>
                        </div>
                      ) : (
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                          <thead>
                            <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                              {["Prénom Nom","Email","Niveau","Assistante","Statut"].map(h => (
                                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paGroupeDetail.apprenants.map((ap, i) => {
                              const s = ap.statut;
                              const cfg = s==="actif" ? { color:"#16a34a",bg:"#dcfce7",label:"Actif" } : s==="terminé"||s==="archive" ? { color:"#6b7280",bg:"#f3f4f6",label:"Terminé" } : s==="en_pause" ? { color:"#d97706",bg:"#fef3c7",label:"En pause" } : { color:"#f59e0b",bg:"#fef3c7",label:s||"-" };
                              const nomAp = `${ap.prenom_apprenant||ap.prenom||""} ${ap.nom_apprenant||ap.nom||""}`.trim() || "-";
                              const emailAp = ap.email_apprenant||ap.email||"-";
                              const initAp = nomAp.split(" ").map(w=>w[0]||"").join("").toUpperCase().slice(0,2)||"AP";
                              return (
                                <tr key={ap.id||i}
                                  onClick={async () => {
                                    setPaSelectedApprenant({ ...ap, _nomAp: nomAp, _emailAp: emailAp, _initAp: initAp });
                                    setPaApprenantTab("infos");
                                    setPaApprenantAssignation(null);
                                    setPaApprenantAccesInfo(null);
                                    setPaApprenantParentAcces(null);
                                    setPaApprenantSeancesReelles([]);
                                    setPaApprenantPresencesReelles([]);
                                    setPaApprenantEvals([]);
                                    const token = localStorage.getItem("admin_token");
                                    // Table unifiée `seances` (remplace seances_privees/groupes_cours - le coach
                                    // l'utilise désormais pour toutes ses séances via groupe_id) : sans elle,
                                    // "Séances réalisées" resterait à 0 même quand le coach a bien travaillé.
                                    if (paSelectedGroupe?.id) {
                                      fetch(`${API_URL}/api/seances?groupe_id=${paSelectedGroupe.id}`, { headers:{ Authorization:`Bearer ${token}` } })
                                        .then(r => r.ok ? r.json() : { seances: [] })
                                        .then(d => setPaApprenantSeancesReelles(d.seances || []))
                                        .catch(() => {});
                                      // Présences réelles de CET apprenant - même filtrage par ga_id que côté
                                      // commerciale (fallback nom si ga_id absent sur la ligne de présence),
                                      // jusqu'ici cette modale n'avait aucun onglet Présences du tout, alors que
                                      // Progression/Suivi tentaient (en vain) d'en tirer un résumé depuis
                                      // suivi_presences, un champ jamais alimenté par le travail réel du coach.
                                      setPaApprenantPresencesLoading(true);
                                      const nomRef = nomAp.toLowerCase();
                                      fetch(`${API_URL}/api/groupes/${paSelectedGroupe.id}/presences`, { headers:{ Authorization:`Bearer ${token}` } })
                                        .then(r => r.ok ? r.json() : { presences: [] })
                                        .then(d => {
                                          const mine = (d.presences || []).filter(p =>
                                            (ap.id && (p.ga_id === ap.id || p.ga_id == ap.id)) ||
                                            (nomRef && (p.nom_apprenant||"").toLowerCase().includes(nomRef.split(" ").pop()))
                                          );
                                          setPaApprenantPresencesReelles(mine);
                                        })
                                        .catch(() => {})
                                        .finally(() => setPaApprenantPresencesLoading(false));
                                    }
                                    if (emailAp && emailAp !== "-") {
                                      setPaApprenantLoading(true);
                                      try {
                                        // assignation_id (lien posé dans groupes_apprenants.note à la création de la
                                        // classe privée) est prioritaire et fiable - le match par prospect_email échoue
                                        // pour un coaching privé enfant où prospect_email (le parent) diffère de
                                        // email_apprenant (l'enfant).
                                        const asgUrl = ap.assignation_id
                                          ? `${API_URL}/api/parcours/assignations?id=${encodeURIComponent(ap.assignation_id)}`
                                          : `${API_URL}/api/parcours/assignations?prospect_email=${encodeURIComponent(emailAp)}`;
                                        const [rAsg, rAcc] = await Promise.all([
                                          fetch(asgUrl, { headers:{ Authorization:`Bearer ${token}` } }),
                                          fetch(`${API_URL}/api/apprenants/profil-acces?email=${encodeURIComponent(emailAp)}`, { headers:{ Authorization:`Bearer ${token}` } }),
                                        ]);
                                        const dAsg = await rAsg.json();
                                        const dAcc = rAcc.ok ? await rAcc.json() : null;
                                        const asgFound = (dAsg.assignations||[])[0] || null;
                                        setPaApprenantAssignation(asgFound);
                                        setPaApprenantAccesInfo(dAcc);
                                        // Historique des versements (source/mode, date, montant) - jamais
                                        // chargé pour cette modale (Groupes → détail → apprenant), à la
                                        // différence de celle ouverte depuis l'onglet Apprenants.
                                        if (asgFound?.id) fetchPaiementsApprenant(asgFound.id);
                                        // Profil enfant : le parent a lui aussi son propre compte de
                                        // connexion (portail parent) - l'afficher en plus de celui de l'enfant.
                                        if (asgFound?.profil_type === "enfant" && asgFound?.email_parent) {
                                          fetch(`${API_URL}/api/apprenants/parent-acces?email=${encodeURIComponent(asgFound.email_parent)}`, { headers:{ Authorization:`Bearer ${token}` } })
                                            .then(r => r.ok ? r.json() : null)
                                            .then(d => setPaApprenantParentAcces(d))
                                            .catch(() => {});
                                        }
                                      } catch {}
                                      finally { setPaApprenantLoading(false); }
                                    }
                                  }}
                                  style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer", transition:"background .12s" }}
                                  onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"0d"}
                                  onMouseLeave={e=>e.currentTarget.style.background=""}>
                                  <td style={{ padding:"10px 14px" }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                                      <div style={{ width:32,height:32,borderRadius:"50%",background:ap.acces_bloque?"#dc2626":PA_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,color:ap.acces_bloque?"#fff":PA_COLOR,flexShrink:0 }}>{ap.acces_bloque?"🔒":initAp}</div>
                                      <span style={{ fontWeight:600, color:"#0f172a" }}>{nomAp}</span>
                                      {ap.acces_bloque && <span style={{ fontSize:9, background:"#dc2626", color:"#fff", borderRadius:99, padding:"1px 7px", fontWeight:700, whiteSpace:"nowrap" }}>🔒 SUSPENDU</span>}
                                    </div>
                                  </td>
                                  <td style={{ padding:"10px 14px", color:"#6b7280" }}>{emailAp}</td>
                                  <td style={{ padding:"10px 14px" }}>
                                    {ap.niveau ? <span style={{ background:"#ede9fe", color:PA_COLOR, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{ap.niveau}</span> : "-"}
                                  </td>
                                  <td style={{ padding:"10px 14px", color:"#6b7280" }}>{ap.assistante_nom||"-"}</td>
                                  <td style={{ padding:"10px 14px" }}>
                                    <span style={{ background:cfg.bg, color:cfg.color, borderRadius:99, padding:"2px 10px", fontSize:10, fontWeight:700 }}>{cfg.label}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* ─ Sessions ─ */}
                  {paSubTab === "sessions" && (()=>{
                    const MOIS_LABELS_S = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
                    // Statuts sessions-live
                    const STATUT_LIVE = {
                      planifiee:  { label:"Planifiée",  color:"#0891b2", bg:"#e0f2fe", icon:"📅" },
                      en_cours:   { label:"En cours",   color:"#d97706", bg:"#fef3c7", icon:"▶️" },
                      terminee:   { label:"Terminée",   color:"#16a34a", bg:"#dcfce7", icon:"✅" },
                      annulee:    { label:"Annulée",    color:"#ef4444", bg:"#fee2e2", icon:"❌" },
                    };
                    // Statuts groupes_cours
                    const STATUT_COURS = {
                      dispense:         { label:"Dispensé",         color:"#16a34a", bg:"#dcfce7", icon:"✅" },
                      annule:           { label:"Annulé",           color:"#ef4444", bg:"#fee2e2", icon:"❌" },
                      apprenant_absent: { label:"Apprenant absent", color:"#f59e0b", bg:"#fef3c7", icon:"🎓" },
                      coach_absent:     { label:"Coach absent",     color:"#8b5cf6", bg:"#ede9fe", icon:"👨‍🏫" },
                      catch_up:         { label:"Rattrapage",       color:"#0891b2", bg:"#e0f2fe", icon:"🔄" },
                      holiday:          { label:"Congé",            color:"#6b7280", bg:"#f3f4f6", icon:"🏖️" },
                    };
                    const moisDispo = [...new Set(paSessionsListe.map(s => (s._date||"").slice(0,7)).filter(Boolean))].sort().reverse();
                    const sessionsFiltrees = paSessionsMoisFiltre
                      ? paSessionsListe.filter(s => (s._date||"").startsWith(paSessionsMoisFiltre))
                      : paSessionsListe;
                    const totalSessions = sessionsFiltrees.length;
                    const sessLive  = sessionsFiltrees.filter(s => s._type==="live").length;
                    const sessCours = sessionsFiltrees.filter(s => s._type==="cours").length;
                    const totalPages = Math.max(1, Math.ceil(totalSessions / PA_SESSIONS_PAR_PAGE));
                    const pageClamped = Math.min(paSessionsPage, totalPages);
                    const sessionsPage = sessionsFiltrees.slice((pageClamped-1)*PA_SESSIONS_PAR_PAGE, pageClamped*PA_SESSIONS_PAR_PAGE);
                    return (
                      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                        {/* KPIs */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                          {[
                            { label:"Total sessions", value:totalSessions, color:"#7c3aed" },
                            { label:"Sessions live planifiées", value:sessLive, color:"#0891b2" },
                            { label:"Cours enregistrés", value:sessCours, color:"#16a34a" },
                          ].map(k => (
                            <div key={k.label} style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 16px", textAlign:"center" }}>
                              <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
                              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginTop:2 }}>{k.label}</div>
                            </div>
                          ))}
                        </div>
                        {/* Filtre par mois (chips) */}
                        {moisDispo.length > 0 && (
                          <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
                            <span style={{ fontSize:11, color:"#9ca3af", fontWeight:700 }}>Filtrer :</span>
                            <button onClick={() => { setPaSessionsMoisFiltre(""); setPaSessionsPage(1); }}
                              style={{ padding:"4px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
                                background:!paSessionsMoisFiltre?"#7c3aed":"#f1f5f9", color:!paSessionsMoisFiltre?"#fff":"#64748b" }}>
                              Tous
                            </button>
                            {moisDispo.map(m => {
                              const [y,mo] = m.split("-");
                              const label = `${MOIS_LABELS_S[Number(mo)]} ${y}`;
                              return (
                                <button key={m} onClick={() => { setPaSessionsMoisFiltre(m); setPaSessionsPage(1); }}
                                  style={{ padding:"4px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
                                    background:paSessionsMoisFiltre===m?"#7c3aed":"#f1f5f9", color:paSessionsMoisFiltre===m?"#fff":"#64748b" }}>
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {paSessionsLoading ? (
                          <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>Chargement des sessions…</div>
                        ) : sessionsPage.length === 0 ? (
                          <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>
                            <div style={{ fontSize:32, marginBottom:8 }}>📚</div>
                            <div style={{ fontWeight:600 }}>Aucune session enregistrée pour ce groupe.</div>
                          </div>
                        ) : (
                          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"auto" }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                              <thead>
                                <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0" }}>
                                  {["Date","Type","Titre / Sujet","Statut","Heure / Durée"].map(h => (
                                    <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {sessionsPage.map((s, i) => {
                                  const isLive = s._type === "live";
                                  const sCfg = isLive
                                    ? (STATUT_LIVE[s.statut] || { label:s.statut||"Planifiée", color:"#0891b2", bg:"#e0f2fe", icon:"📅" })
                                    : (STATUT_COURS[s.statut] || { label:s.statut||"Dispensé", color:"#16a34a", bg:"#dcfce7", icon:"✅" });
                                  const titre = isLive
                                    ? (s.titre || s.contenu_titres?.[0] || "Session live")
                                    : (s.objectif || s.sujet_discussion || "Cours");
                                  const heureDuree = isLive
                                    ? `${s.heure||""}${s.duree ? ` · ${s.duree}min` : ""}`
                                    : (s.duree_h ? `${s.duree_h}h` : "-");
                                  return (
                                    <tr key={s.id||i} style={{ borderBottom:"1px solid #f1f5f9" }}>
                                      <td style={{ padding:"10px 14px", color:"#0f172a", fontWeight:600, whiteSpace:"nowrap" }}>{formatDate(s._date)}</td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99,
                                          background:isLive?"#dbeafe":"#f0fdf4", color:isLive?"#1d4ed8":"#15803d" }}>
                                          {isLive ? "🎥 Live" : "📝 Cours"}
                                        </span>
                                      </td>
                                      <td style={{ padding:"10px 14px", color:"#374151", maxWidth:220 }}>{titre}</td>
                                      <td style={{ padding:"10px 14px" }}>
                                        <span style={{ background:sCfg.bg, color:sCfg.color, borderRadius:99, padding:"2px 10px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{sCfg.icon} {sCfg.label}</span>
                                      </td>
                                      <td style={{ padding:"10px 14px", color:"#6b7280", fontSize:12 }}>{heureDuree||"-"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div style={{ display:"flex", gap:6, justifyContent:"center", alignItems:"center", marginTop:4 }}>
                            <button onClick={() => setPaSessionsPage(1)} disabled={pageClamped===1}
                              style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClamped===1?"not-allowed":"pointer", color:pageClamped===1?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>«</button>
                            <button onClick={() => setPaSessionsPage(p => Math.max(1,p-1))} disabled={pageClamped===1}
                              style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClamped===1?"not-allowed":"pointer", color:pageClamped===1?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>‹</button>
                            <span style={{ fontSize:12, color:"#374151", fontWeight:600, padding:"0 6px" }}>Page {pageClamped} / {totalPages}</span>
                            <button onClick={() => setPaSessionsPage(p => Math.min(totalPages,p+1))} disabled={pageClamped===totalPages}
                              style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClamped===totalPages?"not-allowed":"pointer", color:pageClamped===totalPages?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>›</button>
                            <button onClick={() => setPaSessionsPage(totalPages)} disabled={pageClamped===totalPages}
                              style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClamped===totalPages?"not-allowed":"pointer", color:pageClamped===totalPages?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>»</button>
                            <span style={{ fontSize:11, color:"#9ca3af", marginLeft:6 }}>{totalSessions} session{totalSessions!==1?"s":""}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ─ Présences ─ */}
                  {paSubTab === "presences" && (()=>{
                    const MOIS_LABELS_P = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
                    const moisDispoP = [...new Set(paPresences.map(s => (s.date||"").slice(0,7)).filter(Boolean))].sort().reverse();
                    const presencesFiltrees = paPresencesMoisFiltre
                      ? paPresences.filter(s => (s.date||"").startsWith(paPresencesMoisFiltre))
                      : paPresences;
                    const totalPresences = presencesFiltrees.length;
                    const totalPagesP = Math.max(1, Math.ceil(totalPresences / PA_PRESENCES_PAR_PAGE));
                    const pageClampedP = Math.min(paPresencesPage, totalPagesP);
                    const presencesPage = presencesFiltrees.slice((pageClampedP-1)*PA_PRESENCES_PAR_PAGE, pageClampedP*PA_PRESENCES_PAR_PAGE);
                    return (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {paPresencesLoading ? (
                        <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>Chargement des présences…</div>
                      ) : (
                        <>
                          {/* Filtre par mois (chips) */}
                          {moisDispoP.length > 0 && (
                            <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
                              <span style={{ fontSize:11, color:"#9ca3af", fontWeight:700 }}>Filtrer :</span>
                              <button onClick={() => { setPaPresencesMoisFiltre(""); setPaPresencesPage(1); }}
                                style={{ padding:"4px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
                                  background:!paPresencesMoisFiltre?"#7c3aed":"#f1f5f9", color:!paPresencesMoisFiltre?"#fff":"#64748b" }}>
                                Tous
                              </button>
                              {moisDispoP.map(m => {
                                const [y,mo] = m.split("-");
                                const label = `${MOIS_LABELS_P[Number(mo)]} ${y}`;
                                return (
                                  <button key={m} onClick={() => { setPaPresencesMoisFiltre(m); setPaPresencesPage(1); }}
                                    style={{ padding:"4px 12px", borderRadius:99, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
                                      background:paPresencesMoisFiltre===m?"#7c3aed":"#f1f5f9", color:paPresencesMoisFiltre===m?"#fff":"#64748b" }}>
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {presencesPage.length === 0 ? (
                            <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>
                              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                              <div style={{ fontWeight:600 }}>Aucune donnée de présence disponible.</div>
                            </div>
                          ) : (
                            presencesPage.map((session, si) => {
                              const apprenants = session.apprenants || [];
                              const presents = apprenants.filter(a => a.statut==="present").length;
                              const total    = apprenants.length;
                              const taux     = total > 0 ? Math.round((presents/total)*100) : null;
                              return (
                                <div key={si} style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                                  <div style={{ padding:"12px 18px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                                    <span style={{ fontWeight:800, fontSize:13, color:"#0f172a" }}>📅 {formatDate(session.date)}</span>
                                    {taux !== null && (
                                      <span style={{ fontSize:12, fontWeight:700, color: taux>=80?"#16a34a":taux>=50?"#f59e0b":"#ef4444" }}>
                                        Taux présence : {taux}% ({presents}/{total})
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ padding:"8px 0" }}>
                                    {apprenants.map((ap, ai) => {
                                      const pCfg = ap.statut==="present" ? { label:"Présent",color:"#16a34a",bg:"#dcfce7" } : ap.statut==="absent" ? { label:"Absent",color:"#ef4444",bg:"#fee2e2" } : { label:ap.statut||"-",color:"#6b7280",bg:"#f3f4f6" };
                                      return (
                                        <div key={ai} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 18px", borderBottom: ai<apprenants.length-1?"1px solid #f1f5f9":"none" }}>
                                          <span style={{ fontSize:13, color:"#0f172a" }}>{ap.prenom||""} {ap.nom||""}</span>
                                          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                                            {ap.note && <span style={{ fontSize:11, color:"#9ca3af", fontStyle:"italic" }}>{ap.note}</span>}
                                            <span style={{ background:pCfg.bg, color:pCfg.color, borderRadius:99, padding:"2px 10px", fontSize:10, fontWeight:700 }}>{pCfg.label}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })
                          )}
                          {/* Pagination */}
                          {totalPagesP > 1 && (
                            <div style={{ display:"flex", gap:6, justifyContent:"center", alignItems:"center", marginTop:4 }}>
                              <button onClick={() => setPaPresencesPage(1)} disabled={pageClampedP===1}
                                style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClampedP===1?"not-allowed":"pointer", color:pageClampedP===1?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>«</button>
                              <button onClick={() => setPaPresencesPage(p => Math.max(1,p-1))} disabled={pageClampedP===1}
                                style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClampedP===1?"not-allowed":"pointer", color:pageClampedP===1?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>‹</button>
                              <span style={{ fontSize:12, color:"#374151", fontWeight:600, padding:"0 6px" }}>Page {pageClampedP} / {totalPagesP}</span>
                              <button onClick={() => setPaPresencesPage(p => Math.min(totalPagesP,p+1))} disabled={pageClampedP===totalPagesP}
                                style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClampedP===totalPagesP?"not-allowed":"pointer", color:pageClampedP===totalPagesP?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>›</button>
                              <button onClick={() => setPaPresencesPage(totalPagesP)} disabled={pageClampedP===totalPagesP}
                                style={{ padding:"6px 10px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:pageClampedP===totalPagesP?"not-allowed":"pointer", color:pageClampedP===totalPagesP?"#d1d5db":"#374151", fontSize:12, fontWeight:700 }}>»</button>
                              <span style={{ fontSize:11, color:"#9ca3af", marginLeft:6 }}>{totalPresences} séance{totalPresences!==1?"s":""}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    );
                  })()}

                </div>
              </div>
            </div>
          )}

          {/* ── ONGLET COACHS ── */}
          {/* ── ONGLET COACHS ── */}
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

              {/* Filtre par categorie de contrat. Hors du bloc de bascule : il vaut pour
                  la Liste comme pour le Classement, et le remettre a zero en changeant de
                  vue obligerait a le reposer a chaque aller-retour. */}
              <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                <span style={{ fontSize:11.5, color:"#6b7280", fontWeight:700 }}>🏷 Catégorie :</span>
                {[{ cle:"", libelle:"Toutes", couleur:"#475569", fond:"#f1f5f9", bord:"#e2e8f0" },
                  ...CATEGORIES_COACH, CATEGORIE_SANS_NOTE].map(cat => {
                  const actif = paCoachCategorie === cat.cle;
                  const nb = cat.cle === ""
                    ? paCoachsList.length
                    : paCoachsList.filter(c => categorieCoach(c.moyenne).cle === cat.cle).length;
                  return (
                    <button key={cat.cle || "toutes"} type="button"
                      onClick={()=>setPaCoachCategorie(actif ? "" : cat.cle)}
                      style={{ padding:"5px 12px", borderRadius:99, cursor:"pointer",
                        fontSize:11.5, fontWeight:700, lineHeight:1.5,
                        border:`1.5px solid ${actif ? cat.couleur : cat.bord}`,
                        background: actif ? cat.fond : "#fff",
                        color: actif ? cat.couleur : "#64748b",
                        opacity: nb === 0 && cat.cle !== "" ? .5 : 1 }}>
                      {cat.libelle} <span style={{ opacity:.75 }}>({nb})</span>
                    </button>
                  );
                })}
              </div>

              {/* ── VUE CLASSEMENT ── */}
              {paCoachsVue==="classement" && (() => {
                const ncColor = NOTE_COUL;
                const ncBg    = NOTE_FOND;
                const med     = (i, hasEval) => hasEval ? (i===0?"🥇":i===1?"🥈":i===2?"🥉":null) : null;
                // Merge : classement API + coachs sans éval depuis paCoachsList
                const evalIds = new Set(paClassement.map(c => c.id));
                const sansEval = paCoachsList
                  .filter(c => c.actif !== false && !evalIds.has(c.id))
                  .map(c => ({ ...c, moyenne: null, nb_evaluations: 0, tendance: "stable", derniere_periode: null }));
                const listeComplete = [...paClassement, ...sansEval]
                  .filter(c => !paCoachCategorie || categorieCoach(c.moyenne).cle === paCoachCategorie);
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
                              {["#","Coach","Filière","Évaluations","Note moyenne","Catégorie","Tendance"].map(col=>(
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
                                          <NomAvecSurnom prenom={c.prenom} nom={c.nom} surnom={c.surnom} style={{ fontWeight:700, color:"#0f172a" }} />
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
                                  {/* Categorie de contrat ouverte par cette note */}
                                  <td style={{ padding:"12px 16px" }}>
                                    <BadgeCategorieCoach note={moy} taille="xs" />
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
                  if (paCoachCategorie && categorieCoach(c.moyenne).cle !== paCoachCategorie) return false;
                  const q = paCoachSearch.toLowerCase();
                  return !q || `${c.prenom} ${c.nom} ${c.surnom||""} ${c.email} ${c.coach_info?.filiere||""}`.toLowerCase().includes(q);
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
                                    const noteColor = NOTE_COUL(moy);
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
                                      <NomAvecSurnom prenom={c.prenom} nom={c.nom} surnom={c.surnom} style={{ fontWeight:700, color:"#0f172a" }} />
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

          {/* ── MODAL COACH COMPLET ── */}

          {/* ── ONGLET REMPLACEMENTS ── */}
          {activeTab === "remplacements" && (() => {
            const RSTATUT = {
              termine:    { bg:'#D1FAE5', txt:'#065F46', lib:'✅ Terminé'    },
              en_cours:   { bg:'#DBEAFE', txt:'#1D4ED8', lib:'🔵 En cours'  },
              planifie:   { bg:'#FEF9C3', txt:'#92400E', lib:'📅 Planifié'  },
              a_pourvoir: { bg:'#FEE2E2', txt:'#991B1B', lib:'🔴 À pourvoir' },
              refuse:     { bg:'#FEE2E2', txt:'#991B1B', lib:'🚫 Refusée'    },
            };

            function checkClotureAuto(newStatuts, newRemps) {
              const actifs = newRemps.filter(r =>
                (r.statut==='en_cours'||r.statut==='planifie') && r.remplacant_nom && r.sessions_ids?.length>0
              );
              const aClore = actifs.filter(r => r.sessions_ids.every(id => newStatuts[id]==='realisee'));
              if (aClore.length>0) {
                setPaRemplacements(prev => prev.map(r => aClore.find(c=>c.id===r.id)?{...r,statut:'termine'}:r));
                setPaAlertesAuto(prev => [...prev, ...aClore.map(r => ({
                  id:`auto-${r.id}-${Date.now()}`,
                  message:`✅ Délégation de ${r.remplacant_nom} (${r.groupe_nom}) clôturée automatiquement - toutes les sessions ont été réalisées.`,
                  ts: new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),
                }))]);
              }
            }

            function marquerSessionRealisee(sessionId) {
              setPaStatutsSessions(prev => {
                const next = {...prev,[sessionId]:'realisee'};
                checkClotureAuto(next, paRemplacements);
                return next;
              });
            }

            // Renvoie { ok, error? } - auparavant, un échec (ex: 409 "déjà assigné par
            // quelqu'un d'autre") était totalement ignoré : le code construisait quand même un
            // objet "réussi" factice et l'appliquait à l'état local, donnant l'illusion d'un
            // succès à la PA alors que rien n'avait changé en base.
            async function assigner(remplacementId, nomCoach, sessionsIds, coachId) {
              if (remplActionLoading.has(remplacementId)) return { ok:false, error:"Action déjà en cours" };
              setRemplActionLoading(prev => new Set(prev).add(remplacementId));
              try {
                const r = await fetch(`${API_URL}/api/remplacements/${remplacementId}`, {
                  method: "PATCH",
                  headers: { ...authHeaders(), "Content-Type": "application/json" },
                  body: JSON.stringify({
                    remplacant_id:  coachId  || null,
                    remplacant_nom: nomCoach,
                    sessions_ids:   sessionsIds,
                    nb_sessions:    sessionsIds.length,
                    statut:         "en_cours",
                  }),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) { toast?.error?.(d.error || "Erreur lors de l'assignation"); return { ok:false, error:d.error }; }
                const updated = d.remplacement || { id: remplacementId, remplacant: nomCoach, sessions_ids: sessionsIds, nb_sessions: sessionsIds.length, statut: "en_cours" };
                setPaRemplacements(prev => {
                  const next = prev.map(remp => remp.id === remplacementId ? { ...remp, ...updated } : remp);
                  checkClotureAuto(paStatutsSessions, next);
                  return next;
                });
                return { ok:true };
              } catch { toast?.error?.("Erreur lors de l'assignation"); return { ok:false, error:"Erreur réseau" }; }
              finally { setRemplActionLoading(prev => { const n = new Set(prev); n.delete(remplacementId); return n; }); }
            }

            async function cloturerDelegation(remplacementId) {
              if (remplActionLoading.has(remplacementId)) return;
              // La confirmation vit ICI plutôt que sur chaque bouton : la clôture est
              // déclenchée depuis deux endroits (la modale de délégation et la ligne du
              // tableau), et l'un des deux finirait par être oublié.
              const ok = await confirm(
                "La délégation sera marquée terminée : le remplaçant ne sera plus rattaché à ces séances. "
                + "Cette action ne se défait pas depuis cet écran.",
                { titre: "Clôturer cette délégation ?", confirmLabel: "Clôturer", danger: true },
              );
              if (!ok) return;
              setRemplActionLoading(prev => new Set(prev).add(remplacementId));
              try {
                await fetch(`${API_URL}/api/remplacements/${remplacementId}`, {
                  method: "PATCH",
                  headers: { ...authHeaders(), "Content-Type": "application/json" },
                  body: JSON.stringify({ statut: "termine" }),
                });
              } catch {}
              setPaRemplacements(prev => prev.map(r =>
                r.id === remplacementId ? { ...r, statut: "termine" } : r
              ));
              setRemplActionLoading(prev => { const n = new Set(prev); n.delete(remplacementId); return n; });
            }

            async function refuserDemande(remplacementId, motif) {
              if (!motif?.trim() || remplActionLoading.has(remplacementId)) return;
              setRemplActionLoading(prev => new Set(prev).add(remplacementId));
              try {
                const r = await fetch(`${API_URL}/api/remplacements/${remplacementId}`, {
                  method: "PATCH",
                  headers: { ...authHeaders(), "Content-Type": "application/json" },
                  body: JSON.stringify({ statut: "refuse", motif_refus: motif.trim() }),
                });
                if (!r.ok) { const d = await r.json().catch(()=>({})); toast?.error?.(d.error || "Erreur lors du refus"); return; }
                setPaRemplacements(prev => prev.map(rp =>
                  rp.id === remplacementId ? { ...rp, statut: "refuse", motif_refus: motif.trim() } : rp
                ));
                setPaRemplModal(null);
              } catch { toast?.error?.("Erreur lors du refus"); }
              finally { setRemplActionLoading(prev => { const n = new Set(prev); n.delete(remplacementId); return n; }); }
            }

            // ── Remplacement définitif = suspension définitive du coach, avec transfert
            // préalable de tous ses groupes/classes actifs vers un ou plusieurs nouveaux coachs.
            // PATCH /api/coachs/:id/suspension refuse (409) tant qu'il en reste - on s'en sert
            // ici comme "sonde" pour lister exactement ce qu'il reste à transférer.
            async function ouvrirDefinitifModal() {
              setPaDefinitifOpen(true);
              setPaDefinitifStep('choisir_coach');
              setPaDefinitifCoachId('');
              setPaDefinitifRaison('');
              setPaDefinitifItems([]);
              setPaDefinitifErreur('');
              setPaDefinitifRecherche('');
              setPaDefinitifConfirm(false);
            }

            async function chargerItemsATransferer() {
              if (!paDefinitifCoachId) { setPaDefinitifErreur('Sélectionnez un coach.'); return; }
              setPaDefinitifLoading(true);
              setPaDefinitifErreur('');
              try {
                const r = await fetch(`${API_URL}/api/coachs/${paDefinitifCoachId}/suspension`, {
                  method: "PATCH",
                  headers: { ...authHeaders(), "Content-Type": "application/json" },
                  body: JSON.stringify({ bloque: true, definitif: true, raison: paDefinitifRaison, plateforme: "dash" }),
                });
                const d = await r.json().catch(() => ({}));
                if (r.status === 409 && (d.groupes_a_reaffecter || d.classes_a_reaffecter)) {
                  const items = [
                    ...(d.groupes_a_reaffecter || []).map(g => ({ type: 'groupe', id: g.id, nom: g.nom, niveau: g.niveau, nouveau_coach_id: '', motif: '' })),
                    ...(d.classes_a_reaffecter || []).map(c => ({ type: 'classe', id: c.id, nom: c.nom, niveau: c.niveau, nouveau_coach_id: '', motif: '' })),
                  ];
                  setPaDefinitifItems(items);
                  setPaDefinitifStep('transferer');
                } else if (r.ok) {
                  // Aucun groupe/classe actif à transférer - suspension définitive déjà effective.
                  setPaDefinitifStep('termine');
                } else {
                  setPaDefinitifErreur(d.error || "Erreur serveur");
                }
              } catch { setPaDefinitifErreur("Erreur serveur"); }
              finally { setPaDefinitifLoading(false); }
            }

            function appliquerCoachATous(coachId) {
              setPaDefinitifItems(prev => prev.map(it => ({ ...it, nouveau_coach_id: coachId })));
            }

            async function lancerTransfertEtSuspension() {
              if (paDefinitifItems.some(it => !it.nouveau_coach_id || !it.motif?.trim())) {
                setPaDefinitifErreur("Renseignez un nouveau coach et un motif pour chaque ligne.");
                return;
              }
              setPaDefinitifLoading(true);
              setPaDefinitifErreur('');
              try {
                const resultats = await Promise.all(paDefinitifItems.map(async (it) => {
                  const nouveauCoach = paCoachsList.find(c => c.id === it.nouveau_coach_id);
                  const url = it.type === 'groupe'
                    ? `${API_URL}/api/groupes/${it.id}/suspendre-coach`
                    : `${API_URL}/api/classes-elearning/${it.id}/suspendre-coach`;
                  const r = await fetch(url, {
                    method: "PATCH",
                    headers: { ...authHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({
                      nouveau_coach_id:  it.nouveau_coach_id,
                      nouveau_coach_nom: nouveauCoach ? paRemplNomCoach(nouveauCoach) : undefined,
                      motif: it.motif.trim(),
                    }),
                  });
                  const d = await r.json().catch(() => ({}));
                  return { ok: r.ok, nom: it.nom, error: d.error };
                }));
                const echecs = resultats.filter(r => !r.ok);
                if (echecs.length) {
                  setPaDefinitifErreur(`Échec pour ${echecs.map(e => e.nom).join(', ')} : ${echecs[0].error || 'erreur serveur'}`);
                  return;
                }
                // Tous les groupes/classes transférés - la suspension définitive peut désormais aboutir.
                const r2 = await fetch(`${API_URL}/api/coachs/${paDefinitifCoachId}/suspension`, {
                  method: "PATCH",
                  headers: { ...authHeaders(), "Content-Type": "application/json" },
                  body: JSON.stringify({ bloque: true, definitif: true, raison: paDefinitifRaison, plateforme: "dash" }),
                });
                const d2 = await r2.json().catch(() => ({}));
                if (!r2.ok) { setPaDefinitifErreur(d2.error || "Transfert effectué, mais la suspension définitive a échoué - réessayez."); return; }
                setPaDefinitifStep('termine');
              } catch { setPaDefinitifErreur("Erreur serveur"); }
              finally { setPaDefinitifLoading(false); }
            }

            function progressionSessions(r) {
              if (!r.sessions_ids?.length) return null;
              const faites = r.sessions_ids.filter(id => paStatutsSessions[id]==='realisee').length;
              return { faites, total:r.sessions_ids.length };
            }

            const nbEnCours   = paRemplacements.filter(r=>r.statut==='en_cours').length;
            const nbAPourvoir = paRemplacements.filter(r=>r.statut==='a_pourvoir').length;
            const nbPlanifies = paRemplacements.filter(r=>r.statut==='planifie').length;

            // Filtrage - les compteurs KPI ci-dessus restent calculés sur la liste complète
            // (paRemplacements), seule la liste affichée est filtrée.
            const qRempl = paRemplFiltreRecherche.trim().toLowerCase();
            const paRemplacementsFiltres = paRemplacements.filter(r => {
              if (paRemplFiltreStatut !== 'tous' && r.statut !== paRemplFiltreStatut) return false;
              if (paRemplFiltreDateDebut && (!r.date_debut || r.date_debut < paRemplFiltreDateDebut)) return false;
              if (paRemplFiltreDateFin && (!r.date_fin || r.date_fin > paRemplFiltreDateFin)) return false;
              if (qRempl && !(
                (r.absent_nom||'').toLowerCase().includes(qRempl) ||
                (r.remplacant_nom||'').toLowerCase().includes(qRempl) ||
                (r.groupe_nom||'').toLowerCase().includes(qRempl)
              )) return false;
              return true;
            });

            const PA_REMPL_PAGE_SIZE = 15;
            const paRemplNbPages = Math.max(1, Math.ceil(paRemplacementsFiltres.length / PA_REMPL_PAGE_SIZE));
            const paRemplacementsPage = paRemplacementsFiltres.slice((paRemplPage-1)*PA_REMPL_PAGE_SIZE, paRemplPage*PA_REMPL_PAGE_SIZE);

            // Modal detail
            let modalNode = null;
            if (paRemplModal) {
              // Toujours préférer la version à jour dans la liste (rafraîchie périodiquement,
              // voir fetchPaRemplacements) à l'instantané figé au moment de l'ouverture -
              // sinon la modale reste bloquée sur "En cours" même après une clôture
              // automatique survenue pendant qu'elle est restée ouverte.
              const remp = paRemplacements.find(r => r.id === paRemplModal.id) || paRemplModal;
              const rst  = RSTATUT[remp.statut]||RSTATUT.planifie;
              const fmtD = d => { try { return new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}); } catch { return d; } };

              const absentInitiales = (remp.absent_nom||'?').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();

              // Demandes-sœurs issues de la même déclaration d'absence multi-classes (même
              // lot_id) et encore à pourvoir - permet de proposer d'assigner le même remplaçant
              // à tout le lot en une seule action, plutôt que de forcer la PA à rouvrir chaque
              // demande une par une et à retomber sur le garde-fou "déjà engagé sur cette
              // période" en essayant de réassigner le même coach ailleurs.
              const lotSiblings = remp.lot_id
                ? paRemplacements.filter(r => r.lot_id === remp.lot_id && r.id !== remp.id && r.statut === 'a_pourvoir')
                : [];

              // Choix déjà tranché (assigné, terminé ou refusé) - le sélecteur de coach n'est
              // plus une action possible, on le grise pour ne pas laisser croire qu'on peut
              // encore changer le remplaçant depuis ici.
              const choixVerrouille = remp.statut !== 'a_pourvoir';

              const coachesDispo = paCoachsList
                .filter(c => paRemplNomCoach(c) !== remp.absent_nom)
                .filter(c => {
                  const nom = paRemplNomCoach(c);
                  return !paRemplacements.some(r =>
                    r.remplacant_nom===nom && r.id!==remp.id && r.statut!=='termine' && r.statut!=='refuse' &&
                    new Date(r.date_debut)<=new Date(remp.date_fin) && new Date(r.date_fin)>=new Date(remp.date_debut)
                  );
                })
                .map(c => ({
                  ...c,
                  _nom:    paRemplNomCoach(c),
                  _score:  paRemplScoreCompat(c, remp.groupe_nom)*10 + (c.evaluation||c.coach_info?.evaluation||0),
                  _raisons:paRemplRaisons(c, remp.groupe_nom),
                }))
                .sort((a,b) => b._score - a._score);

              const meilleur = coachesDispo[0]||null;
              const effectiveSelCoach = paRemplSelCoach ?? meilleur?.id ?? null;

              const sessionsFaites  = paRemplSessionsSelec.filter(id=>paStatutsSessions[id]==='realisee').length;
              const sessionsTotales = paRemplSessionsSelec.length;
              const pctProgress     = sessionsTotales ? Math.round((sessionsFaites/sessionsTotales)*100) : 0;

              function etoiles(n) {
                if (!n) return <span style={{ color:'#d1d5db', fontSize:12 }}>Non évalué</span>;
                return (
                  <span style={{ color:'#F59E0B', fontSize:13 }}>
                    {'★'.repeat(Math.floor(n))}{'☆'.repeat(5-Math.floor(n))}
                    <span style={{ color:'#6b7280', fontSize:11, marginLeft:5, fontWeight:700 }}>{n.toFixed(1)}</span>
                  </span>
                );
              }

              modalNode = (
                <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10002, backdropFilter:'blur(4px)' }}
                  onClick={()=>setPaRemplModal(null)}>
                  <div style={{ background:'#fff', borderRadius:20, width:'90vw', height:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 28px 72px rgba(0,0,0,0.32)', overflow:'hidden' }}
                    onClick={e=>e.stopPropagation()}>

                    {/* Header */}
                    <div style={{ background:PA_GRADIENT, padding:'20px 28px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
                      <div>
                        <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:4 }}>🔄 Détail du remplacement</div>
                        <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{remp.groupe_nom}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, background:rst.bg, color:rst.txt }}>{rst.lib}</span>
                        <button style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, color:'#fff' }} onClick={()=>setPaRemplModal(null)}>×</button>
                      </div>
                    </div>

                    {/* Corps */}
                    <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

                      {/* Prof absent */}
                      <div style={{ marginBottom:24 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>👤 Professeur absent</div>
                        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px', background:'#FFF5F5', borderRadius:12, border:'1px solid #FECACA', marginBottom:16 }}>
                          <div style={{ width:44, height:44, borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#991B1B', flexShrink:0 }}>{absentInitiales}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:15, fontWeight:800, color:'#0f172a' }}>{remp.absent_nom}</div>
                          </div>
                          <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:20, background:'#FEF3C7', color:'#92400E', fontSize:12, fontWeight:700 }}>🏥 {remp.motif}</div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                          {[['Groupe concerné',remp.groupe_nom],['Nb sessions',`${remp.nb_sessions||0} session${(remp.nb_sessions||0)>1?'s':''}`],['Début',fmtD(remp.date_debut)],['Fin',fmtD(remp.date_fin)]].map(([l,v])=>(
                            <div key={l} style={{ background:'#f8fafc', borderRadius:10, padding:'12px 16px', border:'1px solid #e5e7eb' }}>
                              <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{l}</div>
                              <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Sessions à couvrir */}
                      <div style={{ marginBottom:24 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                          <span>📅</span> Sessions à couvrir
                          <span style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color:'#6b7280' }}>{paRemplSessionsSelec.length} sélectionnée{paRemplSessionsSelec.length>1?'s':''}</span>
                        </div>
                        {paRemplSessionsSelec.length === 0 ? (
                          <div style={{ background:'#f8fafc', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#9ca3af', textAlign:'center', border:'1px dashed #e5e7eb' }}>
                            Aucune session assignée pour ce remplacement.
                            <div style={{ fontSize:11, color:'#d1d5db', marginTop:4 }}>Les sessions apparaîtront ici quand disponibles.</div>
                          </div>
                        ) : (
                          <>
                            {sessionsTotales > 0 && (
                              <div style={{ background:pctProgress===100?'#ECFDF5':'#F5F3FF', borderRadius:10, padding:'10px 14px', marginBottom:10, border:`1px solid ${pctProgress===100?'#6EE7B7':'#DDD6FE'}` }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                                  <span style={{ fontSize:12, fontWeight:700, color:pctProgress===100?'#065F46':PA_COLOR }}>
                                    {pctProgress===100?'✅ Toutes les sessions réalisées - clôture automatique':`Progression : ${sessionsFaites}/${sessionsTotales} session${sessionsTotales>1?'s':''} réalisée${sessionsFaites>1?'s':''}`}
                                  </span>
                                  <span style={{ fontSize:12, fontWeight:800, color:pctProgress===100?'#10B981':PA_COLOR }}>{pctProgress}%</span>
                                </div>
                                <div style={{ height:6, background:pctProgress===100?'#A7F3D0':'#EDE9FE', borderRadius:3, overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${pctProgress}%`, background:pctProgress===100?'#10B981':PA_COLOR, borderRadius:3, transition:'width 0.4s' }} />
                                </div>
                              </div>
                            )}
                            <div style={{ fontSize:11, color:'#6b7280', marginBottom:8 }}>☑ Marquez les sessions réalisées pour déclencher la clôture automatique.</div>
                            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                              {paRemplSessionsSelec.map(id => {
                                const realisee = paStatutsSessions[id]==='realisee';
                                const detail = remp.sessions_detail?.[id];
                                const label = detail
                                  ? `${detail.titre ? detail.titre + ' - ' : ''}${fmtD(detail.date)}${detail.heure ? ` à ${detail.heure.slice(0,5)}` : ''}`
                                  : `Session ${id}`;
                                return (
                                  <div key={id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, border:`1.5px solid ${realisee?'#6EE7B7':PA_COLOR+'44'}`, background:realisee?'#F0FDF4':'#F5F3FF' }}>
                                    <div style={{ width:18, height:18, borderRadius:4, flexShrink:0, background:realisee?'#10B981':PA_COLOR, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                      <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}>✓</span>
                                    </div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:13, fontWeight:700, color:realisee?'#065F46':PA_COLOR }}>{label}</div>
                                    </div>
                                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:realisee?'#D1FAE5':'#EDE9FE', color:realisee?'#065F46':PA_COLOR }}>{realisee?'✅ Réalisée':'🔄 Remplaçant'}</span>
                                    {!realisee && (
                                      <button onClick={()=>marquerSessionRealisee(id)}
                                        style={{ padding:'3px 10px', borderRadius:8, border:'1px solid #6EE7B7', background:'#ECFDF5', color:'#065F46', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:FF }}>
                                        Marquer réalisée
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Règles de délégation */}
                      <div style={{ marginBottom:24 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>📋 Règles de délégation</div>
                        <div style={{ background:'#F0F9FF', borderRadius:10, border:'1px solid #BAE6FD', padding:'12px 16px', display:'flex', flexDirection:'column', gap:7 }}>
                          {[
                            {icone:'✅',txt:'Le remplaçant se connecte avec ses propres identifiants',ok:true},
                            {icone:'✅',txt:'Il accède à la vue et aux outils du titulaire pour ce groupe',ok:true},
                            {icone:'✅',txt:'Saisie des présences, animation du cours, commentaires autorisés',ok:true},
                            {icone:'✅',txt:'Toutes ses actions sont horodatées « [Remplaçant - Prénom NOM] »',ok:true},
                            {icone:'🚫',txt:'Ne peut PAS modifier le programme de cours du titulaire',ok:false},
                            {icone:'🚫',txt:'Ne peut PAS noter définitivement (validation réservée au titulaire)',ok:false},
                          ].map((rule,i) => (
                            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                              <span style={{ fontSize:13, flexShrink:0 }}>{rule.icone}</span>
                              <span style={{ fontSize:12, color:rule.ok?'#0C4A6E':'#7F1D1D', fontWeight:rule.ok?400:600 }}>{rule.txt}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop:8, fontSize:11, color:'#6b7280', display:'flex', alignItems:'center', gap:6 }}>
                          <span>ℹ️</span> Le Conseiller Pédagogique clôture la délégation manuellement à la fin de l'absence.
                        </div>
                      </div>

                      {/* Suggestion automatique */}
                      {meilleur && (
                        <div style={{ marginBottom:24, opacity:choixVerrouille?0.5:1, pointerEvents:choixVerrouille?'none':'auto', transition:'opacity 0.15s' }}>
                          <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>🤖 Suggestion automatique</div>
                          <div style={{ background:'linear-gradient(135deg,#ECFDF5,#D1FAE5)', borderRadius:12, border:'2px solid #6EE7B7', padding:'14px 16px', position:'relative', overflow:'hidden' }}>
                            <div style={{ position:'absolute', top:10, right:12, background:'#10B981', color:'#fff', fontSize:10, fontWeight:800, padding:'3px 9px', borderRadius:20 }}>MEILLEUR CHOIX ★</div>
                            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                              <div style={{ width:40, height:40, borderRadius:'50%', background:'#10B981', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>
                                {meilleur._nom.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase()}
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:14, fontWeight:800, color:'#065F46' }}>{meilleur._nom}</div>
                                <div style={{ fontSize:11, color:'#059669', marginTop:1 }}>{meilleur.specialite||meilleur.coach_info?.specialite||''} · {meilleur.niveaux||meilleur.coach_info?.niveaux||''}</div>
                                <div style={{ marginTop:3 }}>{etoiles(meilleur.evaluation||meilleur.coach_info?.evaluation||0)}</div>
                              </div>
                              <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:10, color:'#6b7280', textTransform:'uppercase', fontWeight:700 }}>Contrat</div>
                                <div style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>{meilleur.type_contrat||meilleur.coach_info?.type_contrat||'-'}</div>
                              </div>
                            </div>
                            {meilleur._raisons.length > 0 && (
                              <div style={{ marginTop:10, background:'rgba(16,185,129,0.1)', borderRadius:8, padding:'8px 12px', display:'flex', flexWrap:'wrap', gap:6 }}>
                                {meilleur._raisons.map((r,i) => (
                                  <span key={i} style={{ fontSize:10, fontWeight:700, color:'#065F46', background:'#A7F3D0', padding:'2px 9px', borderRadius:12 }}>✓ {r}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Liste coachs disponibles */}
                      <div style={{ marginBottom:24, opacity:choixVerrouille?0.5:1, pointerEvents:choixVerrouille?'none':'auto', transition:'opacity 0.15s' }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>📋 Tous les coachs disponibles ({coachesDispo.length})</div>
                        {choixVerrouille && (
                          <div style={{ fontSize:11, color:'#9ca3af', marginBottom:8, fontStyle:'italic' }}>Choix déjà tranché pour cette demande - non modifiable depuis cet écran.</div>
                        )}
                        {coachesDispo.length === 0 ? (
                          <div style={{ textAlign:'center', padding:20, color:'#9ca3af', fontSize:13 }}>Aucun coach disponible sur cette période.</div>
                        ) : (
                          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:200, overflowY:'auto' }}>
                            {coachesDispo.map((c, i) => {
                              const isSel = effectiveSelCoach === c.id;
                              const initiales = c._nom.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
                              return (
                                <div key={c.id} onClick={()=>setPaRemplSelCoach(c.id)}
                                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:10, border:`1.5px solid ${isSel?PA_COLOR:'#e5e7eb'}`, background:isSel?PA_COLOR+'11':'#fff', cursor:'pointer', transition:'all 0.15s' }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                    <div style={{ width:34, height:34, borderRadius:'50%', background:isSel?PA_COLOR:'#e5e7eb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:isSel?'#fff':'#6b7280', flexShrink:0 }}>{initiales}</div>
                                    <div>
                                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                        <span style={{ fontWeight:700, color:'#0f172a', fontSize:13 }}>{c._nom}</span>
                                        {i===0 && <span style={{ fontSize:9, background:'#D1FAE5', color:'#065F46', padding:'1px 7px', borderRadius:10, fontWeight:800 }}>RECOMMANDÉ</span>}
                                        {c._score>=20 && i>0 && <span style={{ fontSize:9, background:'#EDE9FE', color:'#5B21B6', padding:'1px 7px', borderRadius:10, fontWeight:700 }}>Niveaux ✓</span>}
                                      </div>
                                      <div style={{ fontSize:11, color:'#6b7280' }}>{c.specialite||c.coach_info?.specialite||''} · {c.niveaux||c.coach_info?.niveaux||''}</div>
                                    </div>
                                  </div>
                                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                                    <div style={{ textAlign:'right' }}>
                                      {etoiles(c.evaluation||c.coach_info?.evaluation||0)}
                                      <div style={{ fontSize:10, color:'#9ca3af' }}>{c.type_contrat||c.coach_info?.type_contrat||'-'}</div>
                                    </div>
                                    <div style={{ width:20, height:20, borderRadius:'50%', border:`2px solid ${isSel?PA_COLOR:'#d1d5db'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                      {isSel && <div style={{ width:10, height:10, borderRadius:'50%', background:PA_COLOR }} />}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Lot - même absence, plusieurs classes : choix explicite entre un seul
                          remplaçant pour tout le lot ou une assignation séparée par classe. */}
                      {!choixVerrouille && lotSiblings.length > 0 && (
                        <div style={{ marginBottom:24, background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:12, padding:'14px 16px' }}>
                          <div style={{ fontSize:11, fontWeight:800, color:PA_COLOR, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
                            🔗 Cette absence couvre aussi {lotSiblings.length} autre{lotSiblings.length>1?'s':''} classe{lotSiblings.length>1?'s':''}
                          </div>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                            {lotSiblings.map(s => (
                              <span key={s.id} style={{ fontSize:11, fontWeight:600, color:'#5B21B6', background:'#EDE9FE', padding:'3px 10px', borderRadius:12 }}>{s.groupe_nom || 'Groupe'} ({s.nb_sessions||0} séance{(s.nb_sessions||0)>1?'s':''})</span>
                            ))}
                          </div>
                          <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer' }}>
                            <input type="checkbox" checked={paRemplAssignerLot} onChange={e=>setPaRemplAssignerLot(e.target.checked)}
                              style={{ marginTop:2, cursor:'pointer' }} />
                            <span style={{ fontSize:12, color:'#4C1D95' }}>
                              Assigner <strong>{effectiveSelCoach ? (paCoachsList.find(c=>c.id===effectiveSelCoach) ? paRemplNomCoach(paCoachsList.find(c=>c.id===effectiveSelCoach)) : 'ce coach') : 'ce coach'}</strong> à toutes ces classes en une seule fois - sinon chaque classe garde une assignation séparée (vous pourrez choisir un remplaçant différent pour chacune).
                            </span>
                          </label>
                        </div>
                      )}

                    </div>{/* fin corps */}

                    {/* Refus - motif requis, distinct de la clôture (cf. backend PATCH /:id) */}
                    {paRemplRefuseOuvert && remp.statut==='a_pourvoir' && (
                      <div style={{ padding:'14px 28px', borderTop:'1px solid #FECACA', background:'#FEF2F2', flexShrink:0 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:'#991B1B', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Motif du refus (requis)</div>
                        <textarea value={paRemplRefuseMotif} onChange={e=>setPaRemplRefuseMotif(e.target.value)}
                          placeholder="Expliquez pourquoi cette demande est refusée - le coach absent en sera notifié."
                          rows={2} autoFocus
                          style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #FCA5A5', fontSize:13, fontFamily:FF, resize:'vertical', boxSizing:'border-box', outline:'none', marginBottom:8 }} />
                        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                          <button onClick={()=>{ setPaRemplRefuseOuvert(false); setPaRemplRefuseMotif(""); }}
                            style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff', color:'#6b7280', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:FF }}>
                            Annuler
                          </button>
                          <button disabled={!paRemplRefuseMotif.trim() || remplActionLoading.has(remp.id) || !peut("remplacements","update")}
                            title={permBtnTitle("Confirmer le refus", peut("remplacements","update"))}
                            onClick={()=>setPaRemplConfirmAction({ type:'refuse', motif: paRemplRefuseMotif })}
                            style={permBtnStyle({ padding:'8px 18px', borderRadius:8, border:'none', background:'#DC2626', color:'#fff', fontSize:12, fontWeight:700, cursor:(!paRemplRefuseMotif.trim()||remplActionLoading.has(remp.id))?'not-allowed':'pointer', opacity:(!paRemplRefuseMotif.trim())?0.6:1, fontFamily:FF }, peut("remplacements","update"))}>
                            {peut("remplacements","update") ? "🚫 Confirmer le refus" : "🔒 Confirmer le refus"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ padding:'16px 28px', borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end', gap:10, background:'#fff', flexShrink:0 }}>
                      {(remp.statut==='en_cours'||remp.statut==='planifie') && remp.remplacant_nom && (
                        <button disabled={remplActionLoading.has(remp.id)||!peut("remplacements","update")}
                          title={permBtnTitle("Clôturer la délégation", peut("remplacements","update"))}
                          style={permBtnStyle({ marginRight:'auto', padding:'10px 18px', borderRadius:10, border:'1.5px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:13, fontWeight:700, cursor:remplActionLoading.has(remp.id)?'not-allowed':'pointer', fontFamily:FF, display:'flex', alignItems:'center', gap:6 }, peut("remplacements","update"))}
                          onClick={()=>{ cloturerDelegation(remp.id); setPaRemplModal(null); }}>
                          🔒 Clôturer la délégation
                        </button>
                      )}
                      {remp.statut==='a_pourvoir' && !paRemplRefuseOuvert && (
                        <button disabled={remplActionLoading.has(remp.id)||!peut("remplacements","update")}
                          title={permBtnTitle("Refuser la demande", peut("remplacements","update"))}
                          style={permBtnStyle({ marginRight:'auto', padding:'10px 18px', borderRadius:10, border:'1.5px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:13, fontWeight:700, cursor:remplActionLoading.has(remp.id)?'not-allowed':'pointer', fontFamily:FF, display:'flex', alignItems:'center', gap:6 }, peut("remplacements","update"))}
                          onClick={()=>setPaRemplRefuseOuvert(true)}>
                          🚫 Refuser la demande
                        </button>
                      )}
                      {remp.statut==='termine' && (
                        <div style={{ marginRight:'auto', fontSize:12, color:'#065F46', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>✅ Délégation clôturée</div>
                      )}
                      {remp.statut==='refuse' && (
                        <div style={{ marginRight:'auto', fontSize:12, color:'#991B1B', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>🚫 Demande refusée{remp.motif_refus ? ` - ${remp.motif_refus}` : ''}</div>
                      )}
                      <button style={{ padding:'10px 20px', borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', color:'#6b7280', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:FF }}
                        onClick={()=>setPaRemplModal(null)}>Fermer</button>
                      {remp.statut==='a_pourvoir' && !paRemplRefuseOuvert && effectiveSelCoach && paRemplSessionsSelec.length>0 && (
                        <button disabled={remplActionLoading.has(remp.id)||!peut("remplacements","update")}
                          title={permBtnTitle("Confirmer la délégation", peut("remplacements","update"))}
                          style={permBtnStyle({ padding:'10px 24px', borderRadius:10, border:'none', background:PA_COLOR, color:'#fff', cursor:remplActionLoading.has(remp.id)?'not-allowed':'pointer', fontSize:13, fontWeight:700, fontFamily:FF }, peut("remplacements","update"))}
                          onClick={()=>{
                            const coach = paCoachsList.find(c=>c.id===effectiveSelCoach);
                            if (coach) setPaRemplConfirmAction({ type:'assign', coach });
                          }}>
                          {peut("remplacements","update") ? "✅" : "🔒"} Confirmer la délégation ({paRemplSessionsSelec.length} session{paRemplSessionsSelec.length>1?'s':''})
                        </button>
                      )}
                      {remp.statut==='a_pourvoir' && effectiveSelCoach && paRemplSessionsSelec.length===0 && (
                        <button style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'#EF4444', color:'#fff', fontSize:13, fontWeight:700, fontFamily:FF, cursor:'not-allowed', opacity:0.6 }} disabled>
                          Sélectionnez au moins une session
                        </button>
                      )}
                    </div>

                    {/* Confirmation finale - attribution de remplaçant et refus notifient
                        immédiatement plusieurs personnes et sont difficiles à revenir en
                        arrière (cf. garde-fou backend anti-réassignation) : un clic seul ne
                        doit pas suffire à déclencher l'action. */}
                    {paRemplConfirmAction && (
                      <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10003 }}
                        onClick={()=>setPaRemplConfirmAction(null)}>
                        <div style={{ background:'#fff', borderRadius:16, width:420, maxWidth:'90vw', padding:24, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
                          onClick={e=>e.stopPropagation()}>
                          <div style={{ fontSize:15, fontWeight:800, color:'#0f172a', marginBottom:8 }}>
                            {paRemplConfirmAction.type==='assign' ? '✅ Confirmer cette délégation ?' : '🚫 Confirmer ce refus ?'}
                          </div>
                          <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.6, marginBottom:20 }}>
                            {paRemplConfirmAction.type==='assign' ? (
                              paRemplAssignerLot && lotSiblings.length > 0 ? (
                                <>Vous vous apprêtez à assigner <strong>{paRemplNomCoach(paRemplConfirmAction.coach)}</strong> en remplacement de <strong>{remp.absent_nom}</strong> sur <strong>{lotSiblings.length + 1} classes</strong> ({[remp.groupe_nom, ...lotSiblings.map(s=>s.groupe_nom)].filter(Boolean).join(', ')}). Tous les coachs concernés seront notifiés immédiatement.</>
                              ) : (
                                <>Vous vous apprêtez à assigner <strong>{paRemplNomCoach(paRemplConfirmAction.coach)}</strong> en remplacement de <strong>{remp.absent_nom}</strong> sur {paRemplSessionsSelec.length} session{paRemplSessionsSelec.length>1?'s':''} ({remp.groupe_nom}). Les deux coachs seront notifiés immédiatement.</>
                              )
                            ) : (
                              <>Vous vous apprêtez à refuser la demande d'absence de <strong>{remp.absent_nom}</strong> ({remp.groupe_nom}). Motif transmis : « {paRemplConfirmAction.motif} ». Il en sera notifié immédiatement.</>
                            )}
                          </div>
                          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                            <button onClick={()=>setPaRemplConfirmAction(null)}
                              style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff', color:'#6b7280', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:FF }}>
                              Annuler
                            </button>
                            <button
                              disabled={!peut("remplacements","update")}
                              title={permBtnTitle(paRemplConfirmAction.type==='assign' ? "Confirmer" : "Confirmer le refus", peut("remplacements","update"))}
                              onClick={async ()=>{
                                if (!peut("remplacements","update")) return;
                                if (paRemplConfirmAction.type==='assign') {
                                  const nomCoach = paRemplNomCoach(paRemplConfirmAction.coach);
                                  const resultats = await Promise.all([
                                    assigner(remp.id, nomCoach, paRemplSessionsSelec, paRemplConfirmAction.coach.id),
                                    ...(paRemplAssignerLot ? lotSiblings.map(s => assigner(s.id, nomCoach, s.sessions_ids || [], paRemplConfirmAction.coach.id)) : []),
                                  ]);
                                  const echecs = resultats.filter(r => !r?.ok).length;
                                  if (echecs > 0) toast?.error?.(`${echecs} assignation${echecs>1?'s ont':' a'} échoué sur ${resultats.length} - vérifiez la liste.`);
                                } else {
                                  refuserDemande(remp.id, paRemplConfirmAction.motif);
                                }
                                setPaRemplConfirmAction(null);
                                setPaRemplModal(null);
                              }}
                              style={{ padding:'9px 20px', borderRadius:8, border:'none', background:paRemplConfirmAction.type==='assign'?PA_COLOR:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor: peut("remplacements","update") ? 'pointer' : 'not-allowed', fontFamily:FF, opacity: peut("remplacements","update") ? 1 : 0.6 }}>
                              {!peut("remplacements","update") ? '🔒 ' : ''}{paRemplConfirmAction.type==='assign' ? 'Confirmer' : 'Confirmer le refus'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              );
            }

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

                {/* Bandeau KPIs */}
                <div style={{ background:PA_GRADIENT, borderRadius:14, padding:'18px 24px', marginBottom:24, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
                  <div>
                    <div style={{ fontSize:17, fontWeight:800, color:'#fff', marginBottom:3 }}>🔄 Gestion des remplacements</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>Clôture automatique dès que toutes les sessions assignées sont réalisées</div>
                  </div>
                  <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
                    {[{l:'En cours',v:nbEnCours,c:'#C4B5FD',statut:'en_cours'},{l:'À pourvoir',v:nbAPourvoir,c:'#FCA5A5',statut:'a_pourvoir'},{l:'Planifiés',v:nbPlanifies,c:'#FDE68A',statut:'planifie'}].map(k=>(
                      <div key={k.l} onClick={()=>setPaRemplFiltreStatut(prev => prev===k.statut ? 'tous' : k.statut)}
                        style={{ textAlign:'center', cursor:'pointer', padding:'4px 10px', borderRadius:8, background: paRemplFiltreStatut===k.statut ? 'rgba(255,255,255,0.18)' : 'transparent' }}>
                        <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', textTransform:'uppercase' }}>{k.l}</div>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        setPaNewRemplForm({ absent_id:"", groupe_id:"", remplacant_id:"", date_debut:"", date_fin:"", motif:"" });
                        setPaNewRemplGroupes([]); setPaNewRemplSessions([]); setPaNewRemplSessionsSelec([]);
                        setPaNewRemplConfirm(false);
                        setPaNewRemplMode('delegation');
                        setPaNewRemplClassesSelec([]);
                        setPaNewRemplTransfertVers('');
                        setPaNewRemplOpen(true);
                      }}
                      style={{ background:'rgba(255,255,255,0.18)', border:'1.5px solid rgba(255,255,255,0.4)', borderRadius:10, color:'#fff', fontWeight:700, fontSize:13, padding:'9px 18px', cursor:'pointer', whiteSpace:'nowrap', backdropFilter:'blur(4px)' }}
                    >
                      ➕ Remplacement manuel
                    </button>
                    <button
                      onClick={ouvrirDefinitifModal}
                      disabled={!peut("remplacements","create") || !peut("classes","update")}
                      title={permBtnTitle("Remplacement définitif", peut("remplacements","create") && peut("classes","update"))}
                      style={{ background:'rgba(220,38,38,0.25)', border:'1.5px solid rgba(252,165,165,0.6)', borderRadius:10, color:'#fff', fontWeight:700, fontSize:13, padding:'9px 18px', cursor: (peut("remplacements","create") && peut("classes","update")) ? 'pointer' : 'not-allowed', whiteSpace:'nowrap', backdropFilter:'blur(4px)', opacity: (peut("remplacements","create") && peut("classes","update")) ? 1 : 0.5 }}
                    >
                      🔒 Remplacement définitif
                    </button>
                  </div>
                </div>

                {/* Alertes clôture auto */}
                {paAlertesAuto.map(a => (
                  <div key={a.id} style={{ background:'#ECFDF5', border:'1px solid #6EE7B7', borderLeft:'4px solid #10B981', borderRadius:10, padding:'12px 16px', marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:20 }}>🔔</span>
                      <div>
                        <div style={{ fontSize:13, color:'#065F46', fontWeight:700 }}>{a.message}</div>
                        <div style={{ fontSize:11, color:'#059669', marginTop:2 }}>Clôture automatique · {a.ts}</div>
                      </div>
                    </div>
                    <button onClick={()=>setPaAlertesAuto(prev=>prev.filter(x=>x.id!==a.id))}
                      style={{ background:'none', border:'none', fontSize:18, color:'#059669', cursor:'pointer', flexShrink:0 }}>×</button>
                  </div>
                ))}

                {/* Alerte non assignés */}
                {nbAPourvoir > 0 && (
                  <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderLeft:'4px solid #EF4444', borderRadius:10, padding:'12px 16px', marginBottom:20, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>🚨</span>
                    <div style={{ fontSize:13, color:'#991B1B', fontWeight:600 }}>
                      {nbAPourvoir} remplacement{nbAPourvoir>1?'s':''} sans remplaçant assigné - cliquez sur la ligne pour assigner
                    </div>
                  </div>
                )}

                {/* Filtres */}
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'14px 18px', marginBottom:16, display:'flex', flexWrap:'wrap', gap:12, alignItems:'center' }}>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {[
                      { v:'tous', l:'Tous' }, { v:'a_pourvoir', l:'🔴 À pourvoir' }, { v:'en_cours', l:'🔵 En cours' },
                      { v:'planifie', l:'📅 Planifié' }, { v:'termine', l:'✅ Terminé' }, { v:'refuse', l:'🚫 Refusé' },
                    ].map(opt => (
                      <button key={opt.v} onClick={()=>setPaRemplFiltreStatut(opt.v)}
                        style={{ padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:700, border:`1.5px solid ${paRemplFiltreStatut===opt.v?PA_COLOR:'#e5e7eb'}`, background:paRemplFiltreStatut===opt.v?PA_COLOR+'14':'#fff', color:paRemplFiltreStatut===opt.v?PA_COLOR:'#6b7280', cursor:'pointer', fontFamily:FF, whiteSpace:'nowrap' }}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  <input value={paRemplFiltreRecherche} onChange={e=>setPaRemplFiltreRecherche(e.target.value)}
                    placeholder="🔎 Coach absent, remplaçant ou groupe…"
                    style={{ flex:'1 1 220px', minWidth:180, padding:'8px 14px', borderRadius:20, border:'1.5px solid #e5e7eb', fontSize:12, fontFamily:FF, outline:'none' }} />
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <input type="date" value={paRemplFiltreDateDebut} onChange={e=>setPaRemplFiltreDateDebut(e.target.value)}
                      style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:12, fontFamily:FF, outline:'none' }} />
                    <span style={{ fontSize:12, color:'#9ca3af' }}>→</span>
                    <input type="date" value={paRemplFiltreDateFin} onChange={e=>setPaRemplFiltreDateFin(e.target.value)}
                      style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:12, fontFamily:FF, outline:'none' }} />
                  </div>
                  {(paRemplFiltreStatut!=='tous' || paRemplFiltreRecherche || paRemplFiltreDateDebut || paRemplFiltreDateFin) && (
                    <button onClick={()=>{ setPaRemplFiltreStatut('tous'); setPaRemplFiltreRecherche(''); setPaRemplFiltreDateDebut(''); setPaRemplFiltreDateFin(''); }}
                      style={{ padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600, border:'1.5px solid #e5e7eb', background:'#fff', color:'#6b7280', cursor:'pointer', fontFamily:FF }}>
                      ✕ Réinitialiser
                    </button>
                  )}
                  <span style={{ fontSize:11, color:'#9ca3af', marginLeft:'auto' }}>{paRemplacementsFiltres.length} résultat{paRemplacementsFiltres.length>1?'s':''}</span>
                </div>

                {/* Contenu */}
                {paRemplacementsLoading ? (
                  <div style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>Chargement des remplacements…</div>
                ) : paRemplacementsFiltres.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'48px 0', color:'#9ca3af', background:'#fff', borderRadius:12, border:'1px solid #e5e7eb' }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>🔄</div>
                    <div style={{ fontWeight:700, marginBottom:4 }}>Aucun remplacement</div>
                    <div style={{ fontSize:12 }}>{paRemplacements.length === 0 ? "Les remplacements apparaîtront ici dès qu'un coach sera absent." : "Aucun remplacement ne correspond à ces filtres."}</div>
                  </div>
                ) : (
                  <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', border:'1px solid #e5e7eb' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1.4fr 1.8fr 1fr 1fr 1fr 1fr', padding:'10px 20px', background:'#f8fafc', borderBottom:'1px solid #e5e7eb', fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      <span>Prof. absent</span><span>Remplaçant</span><span>Groupe</span><span>Début</span><span>Fin</span><span>Progression</span><span>Statut</span>
                    </div>
                    {paRemplacementsPage.map((r, idx) => {
                      const st   = RSTATUT[r.statut]||RSTATUT.planifie;
                      const prog = progressionSessions(r);
                      const pct  = prog ? Math.round((prog.faites/prog.total)*100) : null;
                      return (
                        <div key={r.id} onClick={()=>setPaRemplModal(r)}
                          style={{ display:'grid', gridTemplateColumns:'1.6fr 1.4fr 1.8fr 1fr 1fr 1fr 1fr', padding:'14px 20px', borderBottom:idx<paRemplacementsPage.length-1?'1px solid #f1f5f9':'none', fontSize:13, alignItems:'center', background:r.statut==='a_pourvoir'?'#FFF5F5':'#fff', cursor:'pointer', transition:'background 0.12s' }}
                          onMouseEnter={e=>e.currentTarget.style.background=r.statut==='a_pourvoir'?'#FEE2E2':'#f8fafc'}
                          onMouseLeave={e=>e.currentTarget.style.background=r.statut==='a_pourvoir'?'#FFF5F5':'#fff'}
                        >
                          <div>
                            <div style={{ fontWeight:700, color:'#0f172a' }}>{r.absent_nom}</div>
                            <div style={{ fontSize:11, color:'#f59e0b', marginTop:2 }}>{r.motif}</div>
                          </div>
                          {r.remplacant_nom
                            ? <span style={{ fontWeight:600, color:PA_COLOR }}>{r.remplacant_nom}</span>
                            : <span style={{ fontSize:11, color:'#EF4444', fontWeight:700, background:'#FEE2E2', padding:'3px 9px', borderRadius:20 }}>Non assigné</span>
                          }
                          <span style={{ fontSize:12, color:'#6b7280' }}>{r.groupe_nom}</span>
                          <span style={{ fontSize:12, color:'#6b7280' }}>{r.date_debut ? new Date(r.date_debut).toLocaleDateString('fr-FR') : '-'}</span>
                          <span style={{ fontSize:12, color:'#6b7280' }}>{r.date_fin ? new Date(r.date_fin).toLocaleDateString('fr-FR') : '-'}</span>
                          <div>
                            {prog ? (
                              <>
                                <div style={{ fontSize:12, fontWeight:700, color:pct===100?'#065F46':'#0f172a', marginBottom:3 }}>{prog.faites}/{prog.total} session{prog.total>1?'s':''}</div>
                                <div style={{ height:5, background:'#f1f5f9', borderRadius:3, overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${pct}%`, background:pct===100?'#10B981':PA_COLOR, borderRadius:3, transition:'width 0.3s' }} />
                                </div>
                              </>
                            ) : (
                              <span style={{ fontSize:12, color:'#d1d5db' }}>-</span>
                            )}
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }} onClick={e=>e.stopPropagation()}>
                            <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, background:st.bg, color:st.txt, width:'fit-content' }}>{st.lib}</span>
                            {(r.statut==='en_cours'||r.statut==='planifie') && r.remplacant_nom && (
                              <button disabled={remplActionLoading.has(r.id)||!peut("remplacements","update")} title={permBtnTitle("Clôturer",peut("remplacements","update"))} onClick={()=>{ if (!peut("remplacements","update")) return; cloturerDelegation(r.id); }}
                                style={{ padding:'2px 8px', borderRadius:6, border:'1px solid #FECACA', background:'#FEF2F2', color:'#991B1B', fontSize:9, fontWeight:700, cursor:(remplActionLoading.has(r.id)||!peut("remplacements","update"))?'not-allowed':'pointer', fontFamily:FF, width:'fit-content', opacity:peut("remplacements","update")?1:0.6 }}>
                                🔒 Clôturer
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {!paRemplacementsLoading && paRemplacementsFiltres.length > PA_REMPL_PAGE_SIZE && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginTop:16 }}>
                    <button disabled={paRemplPage<=1} onClick={()=>setPaRemplPage(p=>Math.max(1,p-1))}
                      style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff', color: paRemplPage<=1?'#d1d5db':'#374151', cursor: paRemplPage<=1?'not-allowed':'pointer', fontSize:12, fontWeight:600, fontFamily:FF }}>
                      ← Précédent
                    </button>
                    <span style={{ fontSize:12, color:'#6b7280' }}>Page {paRemplPage} / {paRemplNbPages}</span>
                    <button disabled={paRemplPage>=paRemplNbPages} onClick={()=>setPaRemplPage(p=>Math.min(paRemplNbPages,p+1))}
                      style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff', color: paRemplPage>=paRemplNbPages?'#d1d5db':'#374151', cursor: paRemplPage>=paRemplNbPages?'not-allowed':'pointer', fontSize:12, fontWeight:600, fontFamily:FF }}>
                      Suivant →
                    </button>
                  </div>
                )}

                {/* ── Modal Remplacement Manuel ── */}
                {paNewRemplOpen && (() => {
                  const absentCoach  = paCoachsList.find(c => String(c.id) === String(paNewRemplForm.absent_id));
                  const remplacant   = paCoachsList.find(c => String(c.id) === String(paNewRemplForm.remplacant_id));
                  const groupeSelec  = paNewRemplGroupes.find(g => String(g.id) === String(paNewRemplForm.groupe_id));
                  // Exclut aussi un coach déjà engagé ailleurs sur une période qui chevauche -
                  // même vérification que le modal "Détail du remplacement" (ligne ~7169) :
                  // sans elle on pouvait assigner ici un coach déjà remplaçant simultané sur
                  // une autre classe, contournant le garde-fou existant par ce second chemin.
                  const coachsDispos = paCoachsList
                    .filter(c => String(c.id) !== String(paNewRemplForm.absent_id) && !c.acces_bloque)
                    .filter(c => {
                      if (!paNewRemplForm.date_debut) return true;
                      const nom = paRemplNomCoach(c);
                      const dateFin = paNewRemplForm.date_fin || paNewRemplForm.date_debut;
                      return !paRemplacements.some(r =>
                        r.remplacant_nom===nom && r.statut!=='termine' && r.statut!=='refuse' &&
                        new Date(r.date_debut)<=new Date(dateFin) && new Date(r.date_fin||r.date_debut)>=new Date(paNewRemplForm.date_debut)
                      );
                    });

                  // Score de compatibilité rapide pour suggestion
                  const niveauGroupe = groupeSelec?.niveau || "";
                  const scoredCoachs = coachsDispos.map(c => {
                    let score = 0;
                    const niveaux = Array.isArray(c.niveaux_enseignes) ? c.niveaux_enseignes : [];
                    if (niveaux.includes(niveauGroupe)) score += 10;
                    if (c.moyenne) score += parseFloat(c.moyenne);
                    return { ...c, _score: score };
                  }).sort((a,b) => b._score - a._score);
                  const suggestion = scoredCoachs[0] || null;

                  const fetchGroupesCoach = async (coachId) => {
                    if (!coachId) { setPaNewRemplGroupes([]); return; }
                    try {
                      const r = await fetch(`${API_URL}/api/groupes?coach_id=${coachId}`, { headers: authHeaders() });
                      const d = r.ok ? await r.json() : { groupes:[] };
                      setPaNewRemplGroupes(d.groupes || []);
                    } catch { setPaNewRemplGroupes([]); }
                  };

                  const fetchSessionsGroupe = async (groupeId) => {
                    if (!groupeId) { setPaNewRemplSessions([]); setPaNewRemplSessionsSelec([]); return; }
                    setPaNewRemplSessionsLoad(true);
                    try {
                      // Séances du groupe (table unifiée `seances`, cf. GET /api/remplacements
                      // validant sessions_ids contre cette même table) - pas de filtre coach_id
                      // car le groupe appartient au coach bloqué : toutes ses séances sont à
                      // couvrir. `sessions_live` (utilisé avant) a son propre espace d'ids,
                      // distinct de `seances.id` : envoyer ces ids-là au POST /api/remplacements
                      // provoquait systématiquement l'erreur "n'appartiennent pas à ce coach ou
                      // à ce groupe", et son statut "terminee" ne filtrait pas les séances déjà
                      // réalisées côté `seances` (statut "realisee").
                      const r = await fetch(`${API_URL}/api/seances?groupe_id=${groupeId}`, { headers: authHeaders() });
                      const d = r.ok ? await r.json() : { seances:[] };
                      const STATUTS_TERMINAUX = ["realisee", "annulee", "coach_absent", "apprenant_absent"];
                      const restantes = (d.seances || []).filter(s => !STATUTS_TERMINAUX.includes(s.statut));
                      setPaNewRemplSessions(restantes);
                      setPaNewRemplSessionsSelec(restantes.map(s => s.id));
                    } catch { setPaNewRemplSessions([]); }
                    finally { setPaNewRemplSessionsLoad(false); }
                  };

                  const handleSave = async () => {
                    if (paNewRemplSaving) return;
                    const { absent_id, groupe_id, remplacant_id, date_debut, motif } = paNewRemplForm;
                    if (!absent_id || !groupe_id || !date_debut) {
                      toast.error("Coach absent, groupe et date de début sont requis."); return;
                    }
                    setPaNewRemplSaving(true);
                    try {
                      const r = await fetch(`${API_URL}/api/remplacements`, {
                        method:"POST",
                        headers:{ ...authHeaders(), "Content-Type":"application/json" },
                        body: JSON.stringify({
                          absent_id,
                          absent_nom:    absentCoach ? `${absentCoach.prenom} ${absentCoach.nom}` : "-",
                          groupe_id,
                          groupe_nom:    groupeSelec?.nom || "-",
                          remplacant_id: remplacant_id || null,
                          remplacant_nom:remplacant ? `${remplacant.prenom} ${remplacant.nom}` : null,
                          date_debut,
                          date_fin:      paNewRemplForm.date_fin || null,
                          motif:         motif || null,
                          sessions_ids:  paNewRemplSessionsSelec,
                          nb_sessions:   paNewRemplSessionsSelec.length,
                          statut:        remplacant_id ? "planifie" : "a_pourvoir",
                          plateforme:    "dash",
                        }),
                      });
                      const d = await r.json();
                      if (!r.ok) { toast.error(d.error || "Erreur"); return; }
                      let remplacement = d.remplacement;

                      // POST /api/remplacements ignore remplacant_id (toujours créé "à pourvoir",
                      // sans remplaçant) - l'assignation réelle passe par le même PATCH que le
                      // bouton "Confirmer la délégation" du modal Détail du remplacement : ça
                      // crée la délégation (table `delegations`), notifie les deux coachs, et ne
                      // touche JAMAIS groupes.coach_id - contrairement à l'ancien PATCH direct
                      // ici, qui réassignait le groupe de façon permanente et irréversible (une
                      // simple clôture de délégation ne pouvait plus jamais le rendre au
                      // titulaire).
                      if (remplacant_id && remplacement?.id) {
                        const r2 = await fetch(`${API_URL}/api/remplacements/${remplacement.id}`, {
                          method: "PATCH",
                          headers: { ...authHeaders(), "Content-Type": "application/json" },
                          body: JSON.stringify({
                            remplacant_id,
                            remplacant_nom: remplacant ? `${remplacant.prenom} ${remplacant.nom}` : null,
                            sessions_ids:   paNewRemplSessionsSelec,
                            nb_sessions:    paNewRemplSessionsSelec.length,
                            statut:         "en_cours",
                          }),
                        });
                        const d2 = await r2.json().catch(() => ({}));
                        if (r2.ok) remplacement = d2.remplacement || remplacement;
                        else toast.error(d2.error || "Remplacement créé, mais l'assignation du remplaçant a échoué.");
                      }

                      toast.success(remplacant_id ? "Remplacement créé et délégation confirmée." : "Remplacement créé.");
                      setPaRemplacements(prev => [remplacement, ...prev]);
                      setPaNewRemplOpen(false);
                    } catch { toast.error("Erreur réseau"); }
                    finally { setPaNewRemplSaving(false); }
                  };

                  const fmtD = d => d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}) : "-";

                  // ── Mode "Transfert" - transfert DÉFINITIF d'une ou plusieurs classes vers un
                  // nouveau coach, sans suspendre le compte du titulaire. Réutilise
                  // PATCH /api/groupes/:id/suspendre-coach (déjà correct : réassigne aussi les
                  // séances futures et sessions_live depuis le correctif précédent).
                  const transfertCoach = paCoachsList.find(c => String(c.id) === String(paNewRemplTransfertVers));
                  const handleTransfert = async () => {
                    if (paNewRemplSaving) return;
                    if (!paNewRemplForm.absent_id || paNewRemplClassesSelec.length === 0 || !paNewRemplTransfertVers || !paNewRemplForm.motif.trim()) {
                      toast.error("Coach, classe(s), nouveau coach et motif sont requis."); return;
                    }
                    setPaNewRemplSaving(true);
                    try {
                      const resultats = await Promise.all(paNewRemplClassesSelec.map(async (groupeId) => {
                        const g = paNewRemplGroupes.find(x => String(x.id) === String(groupeId));
                        const r = await fetch(`${API_URL}/api/groupes/${groupeId}/suspendre-coach`, {
                          method: "PATCH",
                          headers: { ...authHeaders(), "Content-Type": "application/json" },
                          body: JSON.stringify({ nouveau_coach_id: paNewRemplTransfertVers, motif: paNewRemplForm.motif.trim() }),
                        });
                        const d = await r.json().catch(() => ({}));
                        return { ok: r.ok, nom: g?.nom || groupeId, error: d.error };
                      }));
                      const echecs = resultats.filter(r => !r.ok);
                      if (echecs.length) {
                        toast.error(`Échec pour ${echecs.map(e=>e.nom).join(", ")} : ${echecs[0].error || "erreur serveur"}`);
                        if (echecs.length === resultats.length) return;
                      }
                      toast.success(`${resultats.length - echecs.length} classe(s) transférée(s) à ${transfertCoach ? paRemplNomCoach(transfertCoach) : "ce coach"}.`);
                      setPaNewRemplOpen(false);
                    } catch { toast.error("Erreur réseau"); }
                    finally { setPaNewRemplSaving(false); }
                  };

                  return (
                    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10001, padding:16 }}
                      onClick={e=>{ if(e.target===e.currentTarget) setPaNewRemplOpen(false); }}>
                      <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>

                        {/* Header */}
                        <div style={{ background:PA_GRADIENT, padding:"20px 26px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
                          <div>
                            <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>🔄 Nouveau remplacement manuel</div>
                            <div style={{ fontSize:12, color:"rgba(255,255,255,.65)", marginTop:2 }}>Créez un remplacement sans attendre la signalisation du coach</div>
                          </div>
                          <button onClick={()=>setPaNewRemplOpen(false)}
                            style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:"50%", width:32, height:32, color:"#fff", fontSize:18, cursor:"pointer", lineHeight:1 }}>✕</button>
                        </div>

                        {/* Type d'action - délégation temporaire (réversible, coach garde ses
                            classes) vs transfert définitif (une/plusieurs classes changent de
                            titulaire pour de bon, sans suspendre le compte). */}
                        <div style={{ display:"flex", gap:8, padding:"14px 26px 0", flexShrink:0 }}>
                          {[
                            { v:"delegation", l:"🔄 Délégation temporaire" },
                            { v:"transfert",  l:"🔒 Transfert définitif de classe(s)" },
                          ].map(opt => (
                            <button key={opt.v}
                              onClick={()=>{ setPaNewRemplMode(opt.v); setPaNewRemplClassesSelec([]); setPaNewRemplTransfertVers(""); }}
                              style={{ padding:"7px 16px", borderRadius:20, fontSize:12, fontWeight:700, border:`1.5px solid ${paNewRemplMode===opt.v?PA_COLOR:"#e5e7eb"}`, background:paNewRemplMode===opt.v?PA_COLOR+"14":"#fff", color:paNewRemplMode===opt.v?PA_COLOR:"#6b7280", cursor:"pointer", fontFamily:FF }}>
                              {opt.l}
                            </button>
                          ))}
                        </div>

                        {paNewRemplMode === "transfert" ? (
                        <>
                        {/* Corps scrollable - mode Transfert */}
                        <div style={{ overflowY:"auto", padding:"22px 26px", display:"flex", flexDirection:"column", gap:20 }}>

                          <div style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:12, padding:"16px 20px" }}>
                            <div style={{ fontSize:12, fontWeight:800, color:"#991b1b", textTransform:"uppercase", letterSpacing:".04em", marginBottom:10 }}>👤 Coach titulaire actuel</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                              <div>
                                <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Coach <span style={{ color:"#ef4444" }}>*</span></label>
                                <select value={paNewRemplForm.absent_id}
                                  onChange={e => {
                                    const id = e.target.value;
                                    setPaNewRemplForm(p=>({...p, absent_id:id}));
                                    setPaNewRemplClassesSelec([]);
                                    fetchGroupesCoach(id);
                                  }}
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #fca5a5", borderRadius:8, fontSize:13, fontFamily:FF, background:"#fff", outline:"none" }}>
                                  <option value="">- Sélectionner un coach -</option>
                                  {paCoachsList.map(c => (
                                    <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Motif du transfert <span style={{ color:"#ef4444" }}>*</span></label>
                                <input type="text" value={paNewRemplForm.motif}
                                  onChange={e=>setPaNewRemplForm(p=>({...p,motif:e.target.value}))}
                                  placeholder="Ex : réorganisation, surcharge, demande du coach…"
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #fca5a5", borderRadius:8, fontSize:13, fontFamily:FF, outline:"none", boxSizing:"border-box" }} />
                              </div>
                            </div>
                          </div>

                          {paNewRemplForm.absent_id && (
                            <div>
                              <div style={{ fontSize:12, fontWeight:800, color:"#374151", textTransform:"uppercase", letterSpacing:".04em", marginBottom:8 }}>
                                🏫 Classe(s) à transférer {paNewRemplClassesSelec.length>0 && <span style={{ fontWeight:600, textTransform:"none", letterSpacing:0, color:PA_COLOR }}>- {paNewRemplClassesSelec.length} sélectionnée{paNewRemplClassesSelec.length>1?"s":""}</span>}
                              </div>
                              {paNewRemplGroupes.length === 0 ? (
                                <div style={{ textAlign:"center", padding:"12px 0", fontSize:12, color:"#9ca3af" }}>Ce coach n'a aucune classe active.</div>
                              ) : (
                                <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:220, overflowY:"auto" }}>
                                  {paNewRemplGroupes.map(g => {
                                    const checked = paNewRemplClassesSelec.includes(g.id);
                                    return (
                                      <label key={g.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:checked?PA_COLOR+"0D":"#f8fafc", border:`1.5px solid ${checked?PA_COLOR:"#e5e7eb"}`, borderRadius:8, cursor:"pointer" }}>
                                        <input type="checkbox" checked={checked}
                                          onChange={()=>setPaNewRemplClassesSelec(prev=>checked?prev.filter(id=>id!==g.id):[...prev,g.id])}
                                          style={{ width:14, height:14, accentColor:PA_COLOR }} />
                                        <div style={{ flex:1 }}>
                                          <div style={{ fontWeight:700, fontSize:12, color:"#0f172a" }}>{g.nom}</div>
                                          {g.niveau && <div style={{ fontSize:11, color:"#6b7280" }}>{g.niveau}</div>}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {paNewRemplClassesSelec.length > 0 && (
                            <div>
                              <div style={{ fontSize:12, fontWeight:800, color:"#374151", textTransform:"uppercase", letterSpacing:".04em", marginBottom:8 }}>📋 Nouveau titulaire</div>
                              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:240, overflowY:"auto" }}>
                                {paCoachsList.filter(c => String(c.id) !== String(paNewRemplForm.absent_id) && !c.acces_bloque).map(c => {
                                  const selected = paNewRemplTransfertVers === c.id;
                                  return (
                                    <div key={c.id} onClick={()=>setPaNewRemplTransfertVers(selected?"":c.id)}
                                      style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, border:`1.5px solid ${selected?PA_COLOR:"#e5e7eb"}`, background:selected?PA_COLOR+"0D":"#fff", cursor:"pointer" }}>
                                      <div style={{ width:36, height:36, borderRadius:"50%", background:selected?PA_COLOR:PA_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, color:selected?"#fff":PA_COLOR, flexShrink:0 }}>
                                        {((c.prenom?.[0]||"")+(c.nom?.[0]||"")).toUpperCase()}
                                      </div>
                                      <div style={{ flex:1 }}>
                                        <span style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{c.prenom} {c.nom}</span>
                                        <div style={{ fontSize:11, color:"#6b7280" }}>{c.email}</div>
                                      </div>
                                      {selected && <span style={{ fontSize:18, color:PA_COLOR }}>●</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        </div>

                        {/* Footer - mode Transfert */}
                        <div style={{ padding:"16px 26px", borderTop:"1px solid #e5e7eb", display:"flex", alignItems:"center", justifyContent:"flex-end", gap:10, flexShrink:0, background:"#fafafa" }}>
                          <button onClick={()=>setPaNewRemplOpen(false)}
                            style={{ padding:"9px 20px", borderRadius:9, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                            Annuler
                          </button>
                          <button
                            onClick={()=>{
                              if (!paNewRemplForm.absent_id || paNewRemplClassesSelec.length===0 || !paNewRemplTransfertVers || !paNewRemplForm.motif.trim()) {
                                toast.error("Coach, classe(s), nouveau coach et motif sont requis."); return;
                              }
                              setPaNewRemplConfirm(true);
                            }}
                            disabled={paNewRemplSaving||!peut("remplacements","create")||!peut("classes","update")}
                            title={permBtnTitle("Transférer", peut("remplacements","create") && peut("classes","update"))}
                            style={permBtnStyle({ padding:"9px 22px", borderRadius:9, border:"none", background: paNewRemplSaving?"#a78bfa":"#DC2626", color:"#fff", fontSize:13, fontWeight:700, cursor:paNewRemplSaving?"not-allowed":"pointer" }, peut("remplacements","create") && peut("classes","update"))}>
                            {paNewRemplSaving ? "Transfert en cours…" : `${(peut("remplacements","create")&&peut("classes","update"))?"🔒":"🚫"} Transférer ${paNewRemplClassesSelec.length>0?`(${paNewRemplClassesSelec.length} classe${paNewRemplClassesSelec.length>1?"s":""})`:""}`}
                          </button>
                        </div>

                        {paNewRemplConfirm && (
                          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10004 }}
                            onClick={()=>setPaNewRemplConfirm(false)}>
                            <div style={{ background:"#fff", borderRadius:16, width:440, maxWidth:"90vw", padding:24, boxShadow:"0 24px 60px rgba(0,0,0,0.3)" }}
                              onClick={e=>e.stopPropagation()}>
                              <div style={{ fontSize:15, fontWeight:800, color:"#991B1B", marginBottom:8 }}>🔒 Confirmer ce transfert définitif ?</div>
                              <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.6, marginBottom:20 }}>
                                <strong>{transfertCoach ? paRemplNomCoach(transfertCoach) : "Ce coach"}</strong> deviendra titulaire de <strong>{paNewRemplClassesSelec.length} classe{paNewRemplClassesSelec.length>1?"s":""}</strong> à la place de <strong>{absentCoach ? `${absentCoach.prenom} ${absentCoach.nom}` : "ce coach"}</strong> ({paNewRemplGroupes.filter(g=>paNewRemplClassesSelec.includes(g.id)).map(g=>g.nom).join(", ")}). Les séances déjà planifiées, fichiers et contenus pédagogiques suivent. Le compte de {absentCoach?.prenom || "ce coach"} n'est PAS suspendu - il garde ses autres classes et son accès.
                              </div>
                              <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
                                <button onClick={()=>setPaNewRemplConfirm(false)}
                                  style={{ padding:"9px 18px", borderRadius:8, border:"1.5px solid #e5e7eb", background:"#fff", color:"#6b7280", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:FF }}>
                                  Annuler
                                </button>
                                <button onClick={()=>{ if (!peut("remplacements","create") || !peut("classes","update")) return; setPaNewRemplConfirm(false); handleTransfert(); }}
                                  disabled={!peut("remplacements","create")||!peut("classes","update")}
                                  title={permBtnTitle("Confirmer", peut("remplacements","create") && peut("classes","update"))}
                                  style={permBtnStyle({ padding:"9px 20px", borderRadius:8, border:"none", background:"#DC2626", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FF }, peut("remplacements","create") && peut("classes","update"))}>
                                  {(peut("remplacements","create")&&peut("classes","update")) ? "🔒 Confirmer" : "🚫 Confirmer"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        </>
                        ) : (
                        <>
                        {/* Corps scrollable - mode Délégation */}
                        <div style={{ overflowY:"auto", padding:"22px 26px", display:"flex", flexDirection:"column", gap:20 }}>

                          {/* ── Professeur absent ── */}
                          <div style={{ background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:12, padding:"16px 20px" }}>
                            <div style={{ fontSize:12, fontWeight:800, color:"#991b1b", textTransform:"uppercase", letterSpacing:".04em", marginBottom:10 }}>👤 Professeur absent</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                              <div>
                                <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Coach absent <span style={{ color:"#ef4444" }}>*</span></label>
                                <select value={paNewRemplForm.absent_id}
                                  onChange={e => {
                                    const id = e.target.value;
                                    setPaNewRemplForm(p=>({...p, absent_id:id, groupe_id:""}));
                                    setPaNewRemplSessions([]); setPaNewRemplSessionsSelec([]);
                                    fetchGroupesCoach(id);
                                  }}
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #fca5a5", borderRadius:8, fontSize:13, fontFamily:FF, background:"#fff", outline:"none" }}>
                                  <option value="">- Sélectionner un coach -</option>
                                  {paCoachsList.map(c => (
                                    <option key={c.id} value={c.id}>{c.prenom} {c.nom}{c.acces_bloque?" 🔒":""}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Motif de l'absence</label>
                                <input type="text" value={paNewRemplForm.motif}
                                  onChange={e=>setPaNewRemplForm(p=>({...p,motif:e.target.value}))}
                                  placeholder="Ex : Maladie, Congé, Suspension…"
                                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #fca5a5", borderRadius:8, fontSize:13, fontFamily:FF, outline:"none", boxSizing:"border-box" }} />
                              </div>
                            </div>
                            {absentCoach && (
                              <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#fff", borderRadius:8, border:"1px solid #fca5a5" }}>
                                <div style={{ width:38, height:38, borderRadius:"50%", background:PA_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, color:PA_COLOR, flexShrink:0 }}>
                                  {((absentCoach.prenom?.[0]||"")+(absentCoach.nom?.[0]||"")).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontWeight:700, fontSize:13 }}>{absentCoach.prenom} {absentCoach.nom}</div>
                                  <div style={{ fontSize:11, color:"#6b7280" }}>{absentCoach.coach_info?.filiere || absentCoach.departement || "-"}{absentCoach.moyenne ? ` · ⭐ ${Number(absentCoach.moyenne).toFixed(1)}` : ""}</div>
                                  {absentCoach.moyenne ? <div style={{ marginTop:4 }}><BadgeCategorieCoach note={absentCoach.moyenne} taille="xs" /></div> : null}
                                </div>
                                {absentCoach.acces_bloque && <span style={{ fontSize:10, fontWeight:700, background:"#dc2626", color:"#fff", borderRadius:99, padding:"2px 8px" }}>🔒 SUSPENDU</span>}
                              </div>
                            )}
                          </div>

                          {/* ── Groupe & Dates ── */}
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                            <div>
                              <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Groupe / Classe <span style={{ color:"#ef4444" }}>*</span></label>
                              <select value={paNewRemplForm.groupe_id}
                                onChange={e => {
                                  const gid = e.target.value;
                                  setPaNewRemplForm(p=>({...p, groupe_id:gid}));
                                  fetchSessionsGroupe(gid);
                                }}
                                disabled={!paNewRemplForm.absent_id}
                                style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, background: paNewRemplForm.absent_id?"#fff":"#f9fafb", outline:"none" }}>
                                <option value="">- Choisir un groupe -</option>
                                {paNewRemplGroupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Date de début <span style={{ color:"#ef4444" }}>*</span></label>
                              <input type="date" value={paNewRemplForm.date_debut}
                                onChange={e=>setPaNewRemplForm(p=>({...p,date_debut:e.target.value}))}
                                style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, outline:"none", boxSizing:"border-box" }} />
                            </div>
                            <div>
                              <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Date de fin</label>
                              <input type="date" value={paNewRemplForm.date_fin}
                                onChange={e=>setPaNewRemplForm(p=>({...p,date_fin:e.target.value}))}
                                style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, outline:"none", boxSizing:"border-box" }} />
                            </div>
                          </div>

                          {/* ── Sessions à couvrir ── */}
                          {paNewRemplForm.groupe_id && (
                            <div style={{ border:"1.5px solid #e2e8f0", borderRadius:12, padding:"14px 18px" }}>
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                                <div style={{ fontSize:12, fontWeight:800, color:"#374151", textTransform:"uppercase", letterSpacing:".04em" }}>
                                  📋 Sessions à couvrir
                                  {paNewRemplSessions.length > 0 && (
                                    <span style={{ marginLeft:8, fontWeight:400, fontSize:11, color:"#9ca3af", textTransform:"none" }}>
                                      {paNewRemplSessionsSelec.length}/{paNewRemplSessions.length} sélectionnée{paNewRemplSessionsSelec.length>1?"s":""}
                                    </span>
                                  )}
                                </div>
                                {paNewRemplSessions.length > 0 && (
                                  <div style={{ display:"flex", gap:6 }}>
                                    <button onClick={()=>setPaNewRemplSessionsSelec(paNewRemplSessions.map(s=>s.id))}
                                      style={{ fontSize:11, padding:"3px 10px", borderRadius:6, border:`1.5px solid ${PA_COLOR}`, background:PA_COLOR+"15", color:PA_COLOR, fontWeight:700, cursor:"pointer" }}>Tout</button>
                                    <button onClick={()=>setPaNewRemplSessionsSelec([])}
                                      style={{ fontSize:11, padding:"3px 10px", borderRadius:6, border:"1.5px solid #e2e8f0", background:"#fff", color:"#6b7280", fontWeight:600, cursor:"pointer" }}>Aucune</button>
                                  </div>
                                )}
                              </div>
                              {paNewRemplSessionsLoad && <div style={{ textAlign:"center", padding:"12px 0", fontSize:12, color:"#9ca3af" }}>Chargement…</div>}
                              {!paNewRemplSessionsLoad && paNewRemplSessions.length === 0 && (
                                <div style={{ textAlign:"center", padding:"12px 0", fontSize:12, color:"#9ca3af" }}>Aucune session restante pour ce groupe.</div>
                              )}
                              {!paNewRemplSessionsLoad && paNewRemplSessions.length > 0 && (
                                <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:220, overflowY:"auto" }}>
                                  {paNewRemplSessions.map(s => {
                                    const checked = paNewRemplSessionsSelec.includes(s.id);
                                    const dateStr = s.date_seance ? new Date(s.date_seance).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}) : "-";
                                    return (
                                      <label key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:checked?PA_COLOR+"0D":"#f8fafc", border:`1.5px solid ${checked?PA_COLOR:"#e5e7eb"}`, borderRadius:8, cursor:"pointer" }}>
                                        <input type="checkbox" checked={checked}
                                          onChange={()=>setPaNewRemplSessionsSelec(prev=>checked?prev.filter(id=>id!==s.id):[...prev,s.id])}
                                          style={{ width:14, height:14, accentColor:PA_COLOR }} />
                                        <div style={{ flex:1 }}>
                                          <div style={{ fontWeight:700, fontSize:12, color:"#0f172a" }}>{s.titre || "Session"}</div>
                                          <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>📅 {dateStr}{s.heure_debut?` · 🕐 ${s.heure_debut.slice(0,5)}`:""}{s.duree_h?` · ⏱ ${s.duree_h}h`:""}</div>
                                        </div>
                                        <span style={{ fontSize:10, fontWeight:700, color:s.statut==="planifiee"?"#2563eb":"#d97706", background:s.statut==="planifiee"?"#dbeafe":"#fef3c7", borderRadius:99, padding:"2px 8px" }}>
                                          {s.statut==="planifiee"?"Planifiée":s.statut}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Suggestion automatique ── */}
                          {paNewRemplForm.groupe_id && suggestion && (
                            <div>
                              <div style={{ fontSize:12, fontWeight:800, color:"#374151", textTransform:"uppercase", letterSpacing:".04em", marginBottom:8 }}>🏆 Suggestion automatique</div>
                              <div style={{ background:"#f0fdf4", border:"2px solid #86efac", borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"center", gap:14, cursor:"pointer",
                                outline: paNewRemplForm.remplacant_id===suggestion.id?"3px solid #16a34a":"none" }}
                                onClick={()=>setPaNewRemplForm(p=>({...p,remplacant_id:suggestion.id}))}>
                                <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,#16a34a,#22c55e)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:15, color:"#fff", flexShrink:0 }}>
                                  {((suggestion.prenom?.[0]||"")+(suggestion.nom?.[0]||"")).toUpperCase()}
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                    <span style={{ fontWeight:800, fontSize:14, color:"#0f172a" }}>{suggestion.prenom} {suggestion.nom}</span>
                                    <span style={{ fontSize:10, fontWeight:700, background:"#16a34a", color:"#fff", borderRadius:99, padding:"2px 10px" }}>MEILLEUR CHOIX ★</span>
                                  </div>
                                  <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>
                                    {suggestion.coach_info?.filiere || suggestion.departement || "-"}
                                    {suggestion.moyenne ? <span style={{ color:"#f59e0b", marginLeft:8 }}>{"★".repeat(Math.round(suggestion.moyenne))} {Number(suggestion.moyenne).toFixed(1)}</span> : ""}
                                    {suggestion.moyenne ? <BadgeCategorieCoach note={suggestion.moyenne} taille="xs" /> : null}
                                  </div>
                                </div>
                                {paNewRemplForm.remplacant_id===suggestion.id && <span style={{ fontSize:20, color:"#16a34a" }}>✓</span>}
                              </div>
                            </div>
                          )}

                          {/* ── Tous les profs disponibles ── */}
                          {paNewRemplForm.groupe_id && scoredCoachs.length > 0 && (
                            <div>
                              <div style={{ fontSize:12, fontWeight:800, color:"#374151", textTransform:"uppercase", letterSpacing:".04em", marginBottom:8 }}>
                                📋 Tous les profs disponibles ({scoredCoachs.length})
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:240, overflowY:"auto" }}>
                                {scoredCoachs.map(c => {
                                  const selected = paNewRemplForm.remplacant_id === c.id;
                                  const isBest   = suggestion?.id === c.id;
                                  const initC    = ((c.prenom?.[0]||"")+(c.nom?.[0]||"")).toUpperCase();
                                  const niveaux  = Array.isArray(c.niveaux_enseignes) ? c.niveaux_enseignes : [];
                                  const compat   = niveauGroupe && niveaux.includes(niveauGroupe);
                                  return (
                                    <div key={c.id}
                                      onClick={()=>setPaNewRemplForm(p=>({...p,remplacant_id:selected?"":c.id}))}
                                      style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, border:`1.5px solid ${selected?PA_COLOR:"#e5e7eb"}`, background:selected?PA_COLOR+"0D":"#fff", cursor:"pointer", transition:"all .1s" }}>
                                      <div style={{ width:36, height:36, borderRadius:"50%", background:selected?PA_COLOR:PA_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, color:selected?"#fff":PA_COLOR, flexShrink:0 }}>
                                        {initC}
                                      </div>
                                      <div style={{ flex:1 }}>
                                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                                          <span style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{c.prenom} {c.nom}</span>
                                          {isBest && <span style={{ fontSize:9, fontWeight:700, background:"#16a34a", color:"#fff", borderRadius:99, padding:"1px 7px" }}>RECOMMANDÉ</span>}
                                          {compat && !isBest && <span style={{ fontSize:9, fontWeight:700, background:"#dbeafe", color:"#1e40af", borderRadius:99, padding:"1px 7px" }}>Niveaux ✓</span>}
                                        </div>
                                        <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>
                                          {c.coach_info?.filiere || c.departement || "-"}
                                          {c.moyenne ? <span style={{ color:"#f59e0b", marginLeft:6 }}>★ {Number(c.moyenne).toFixed(1)}</span> : ""}
                                          {c.moyenne ? <BadgeCategorieCoach note={c.moyenne} taille="xs" /> : null}
                                        </div>
                                      </div>
                                      {selected && <span style={{ fontSize:18, color:PA_COLOR }}>●</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* ── Règles de délégation ── */}
                          <div style={{ background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:10, padding:"12px 16px" }}>
                            <div style={{ fontSize:11, fontWeight:800, color:"#374151", textTransform:"uppercase", letterSpacing:".04em", marginBottom:8 }}>📜 Règles de délégation</div>
                            {[
                              { ok:true,  txt:"Le remplaçant se connecte avec ses propres identifiants" },
                              { ok:true,  txt:"Il accède à la vue et aux outils du titulaire pour ce groupe" },
                              { ok:true,  txt:"Saisie des présences, animation du cours, commentaires autorisés" },
                              { ok:true,  txt:"Toutes ses actions sont horodatées « [Remplaçant - Prénom NOM] »" },
                              { ok:false, txt:"Ne peut PAS modifier le programme de cours du titulaire" },
                              { ok:false, txt:"Ne peut PAS noter définitivement (validation réservée au titulaire)" },
                            ].map((r,i)=>(
                              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                                <span style={{ color:r.ok?"#16a34a":"#ef4444", fontSize:14 }}>{r.ok?"✅":"🚫"}</span>
                                <span style={{ fontSize:12, color:r.ok?"#374151":"#dc2626", fontWeight:r.ok?400:600 }}>{r.txt}</span>
                              </div>
                            ))}
                          </div>

                        </div>

                        {/* Footer */}
                        <div style={{ padding:"16px 26px", borderTop:"1px solid #e5e7eb", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, background:"#fafafa" }}>
                          <div style={{ fontSize:12, color:"#6b7280" }}>
                            {paNewRemplSessionsSelec.length > 0
                              ? `${paNewRemplSessionsSelec.length} session${paNewRemplSessionsSelec.length>1?"s":""} à couvrir`
                              : "Aucune session sélectionnée"}
                            {paNewRemplForm.date_debut && ` · Du ${fmtD(paNewRemplForm.date_debut)}`}
                            {paNewRemplForm.date_fin && ` au ${fmtD(paNewRemplForm.date_fin)}`}
                          </div>
                          <div style={{ display:"flex", gap:10 }}>
                            <button onClick={()=>setPaNewRemplOpen(false)}
                              style={{ padding:"9px 20px", borderRadius:9, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                              Annuler
                            </button>
                            <button
                              onClick={()=>{
                                if (!paNewRemplForm.absent_id || !paNewRemplForm.groupe_id || !paNewRemplForm.date_debut) {
                                  toast.error("Coach absent, groupe et date de début sont requis."); return;
                                }
                                setPaNewRemplConfirm(true);
                              }}
                              disabled={paNewRemplSaving||!peut("remplacements","create")}
                              title={permBtnTitle("Confirmer la délégation", peut("remplacements","create"))}
                              style={permBtnStyle({ padding:"9px 22px", borderRadius:9, border:"none", background: paNewRemplSaving?"#a78bfa":PA_COLOR, color:"#fff", fontSize:13, fontWeight:700, cursor:paNewRemplSaving?"not-allowed":"pointer" }, peut("remplacements","create"))}>
                              {paNewRemplSaving ? "Enregistrement…" : !peut("remplacements","create") ? "🔒 Confirmer la délégation" : paNewRemplForm.remplacant_id ? `✅ Confirmer la délégation (${paNewRemplSessionsSelec.length} session${paNewRemplSessionsSelec.length>1?"s":""})` : "➕ Créer sans remplaçant"}
                            </button>
                          </div>
                        </div>

                        {/* Confirmation finale - sans cette étape, un clic seul suffisait à créer
                            (et éventuellement réassigner un groupe) sans jamais montrer un
                            récapitulatif de ce qui allait réellement être envoyé. */}
                        {paNewRemplConfirm && (
                          <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10004 }}
                            onClick={()=>setPaNewRemplConfirm(false)}>
                            <div style={{ background:"#fff", borderRadius:16, width:440, maxWidth:"90vw", padding:24, boxShadow:"0 24px 60px rgba(0,0,0,0.3)" }}
                              onClick={e=>e.stopPropagation()}>
                              <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:8 }}>
                                {paNewRemplForm.remplacant_id ? "✅ Confirmer cette délégation ?" : "➕ Créer cette demande sans remplaçant ?"}
                              </div>
                              <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.6, marginBottom:20 }}>
                                {paNewRemplForm.remplacant_id ? (
                                  <>Vous vous apprêtez à assigner <strong>{remplacant ? `${remplacant.prenom} ${remplacant.nom}` : "ce coach"}</strong> en remplacement de <strong>{absentCoach ? `${absentCoach.prenom} ${absentCoach.nom}` : "ce coach"}</strong> sur {paNewRemplSessionsSelec.length} session{paNewRemplSessionsSelec.length>1?"s":""} ({groupeSelec?.nom || "-"}). Délégation temporaire - le groupe reste au titulaire, les deux coachs seront notifiés.</>
                                ) : (
                                  <>Aucun remplaçant n'est sélectionné - la demande sera créée « à pourvoir » pour <strong>{absentCoach ? `${absentCoach.prenom} ${absentCoach.nom}` : "ce coach"}</strong> ({groupeSelec?.nom || "-"}), assignable plus tard.</>
                                )}
                              </div>
                              <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
                                <button onClick={()=>setPaNewRemplConfirm(false)}
                                  style={{ padding:"9px 18px", borderRadius:8, border:"1.5px solid #e5e7eb", background:"#fff", color:"#6b7280", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:FF }}>
                                  Annuler
                                </button>
                                <button
                                  onClick={()=>{ setPaNewRemplConfirm(false); handleSave(); }}
                                  disabled={!peut("remplacements","create")}
                                  title={permBtnTitle("Confirmer", peut("remplacements","create"))}
                                  style={permBtnStyle({ padding:"9px 20px", borderRadius:8, border:"none", background:PA_COLOR, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FF }, peut("remplacements","create"))}>
                                  {peut("remplacements","create") ? "Confirmer" : "🔒 Confirmer"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        </>
                        )}

                      </div>
                    </div>
                  );
                })()}

                {/* Modal "Remplacement définitif" - étape "transférer" calquée sur le modal
                    existant côté bet-elearning (DashboardAdmin.jsx, ModalDetailClasseOnboarding
                    "Suspendre définitivement le coach") : carte coach actuel, grille de coachs
                    candidats cliquables (pas un <select>), palette rouge/danger. */}
                {paDefinitifOpen && (() => {
                  const coachChoisi = paCoachsList.find(c => c.id === paDefinitifCoachId);
                  const initiales = c => `${c?.prenom?.[0]||''}${c?.nom?.[0]||''}`.toUpperCase() || '?';
                  const avatarDe = c => c?.avatar_url || c?.coach_info?.photo_url || null;
                  const AvatarRond = ({ c, taille, actif }) => {
                    const url = avatarDe(c);
                    const base = { width:taille, height:taille, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:taille>40?15:13, fontWeight:800, overflow:'hidden' };
                    if (url) return <img src={url} alt="" style={{ ...base, objectFit:'cover' }} />;
                    return <div style={{ ...base, background: actif?'#dc2626':'#e5e7eb', color: actif?'#fff':'#6b7280' }}>{initiales(c)}</div>;
                  };
                  const LIB_ROLE = { professeur_titulaire:'Titulaire dédié', professeur_remplacant:'Remplaçant dédié', coach:'Coach' };
                  const candidats = paCoachsList.filter(c => c.id !== paDefinitifCoachId);
                  return (
                    <div style={{ position:'fixed', inset:0, background:'rgba(10,18,35,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10002 }}
                      onClick={()=>!paDefinitifLoading && setPaDefinitifOpen(false)}>
                      <div style={{ background:'#fff', borderRadius:18, width:'90vw', maxWidth:'90vw', height: paDefinitifStep==='termine' ? 'auto' : '90vh', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 30px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}
                        onClick={e=>e.stopPropagation()}>

                        <div style={{ padding:'22px 30px', borderBottom:'1px solid #e5e7eb', flexShrink:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'space-between' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                              <div style={{ fontSize:30 }}>🔴</div>
                              <div>
                                <div style={{ fontSize:18, fontWeight:800, color:'#991b1b' }}>Suspendre définitivement le coach</div>
                                <div style={{ fontSize:12.5, color:'#6b7280', marginTop:2 }}>
                                  {paDefinitifStep==='transferer'
                                    ? "Le nouveau coach hérite du contexte pédagogique complet. Les honoraires déjà dus à l'ancien coach ne sont jamais réécrits."
                                    : "Transfère tous les groupes/classes actifs du coach, puis le suspend définitivement."}
                                </div>
                              </div>
                            </div>
                            <button disabled={paDefinitifLoading} onClick={()=>setPaDefinitifOpen(false)}
                              style={{ background:'#f3f4f6', border:'none', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, color:'#6b7280', flexShrink:0 }}>×</button>
                          </div>
                        </div>

                        <div style={{ flex:1, overflowY:'auto', padding:'24px 30px' }}>

                          {paDefinitifStep === 'choisir_coach' && (() => {
                            const q = paDefinitifRecherche.trim().toLowerCase();
                            const candidatsCoach = paCoachsList
                              .filter(c => c.actif !== false)
                              .filter(c => !q || paRemplNomCoach(c).toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q));
                            return (
                              <>
                                <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                                  Coach à remplacer définitivement {paDefinitifCoachId && <span style={{ fontWeight:600, textTransform:'none', letterSpacing:0, color:'#dc2626' }}>- sélectionné : {paRemplNomCoach(paCoachsList.find(c=>c.id===paDefinitifCoachId))}</span>}
                                </div>
                                <input value={paDefinitifRecherche} onChange={e=>setPaDefinitifRecherche(e.target.value)}
                                  placeholder="🔎 Rechercher un coach par nom ou email…"
                                  style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid #e5e7eb', fontSize:13, fontFamily:FF, marginBottom:14, outline:'none', boxSizing:'border-box' }} />
                                {candidatsCoach.length === 0 ? (
                                  <div style={{ padding:'24px', textAlign:'center', color:'#9ca3af', fontSize:13, border:'1px dashed #e5e7eb', borderRadius:10, marginBottom:20 }}>Aucun coach ne correspond à cette recherche.</div>
                                ) : (
                                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:10, marginBottom:20, maxHeight:'46vh', overflowY:'auto', paddingRight:4 }}>
                                    {candidatsCoach.map(c => {
                                      const actif = paDefinitifCoachId === c.id;
                                      return (
                                        <div key={c.id} onClick={()=>setPaDefinitifCoachId(c.id)}
                                          style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, cursor:'pointer', border:`2px solid ${actif?'#dc2626':'#e5e7eb'}`, background: actif?'#fef2f2':'#fff', transition:'all 0.15s' }}>
                                          <AvatarRond c={c} taille={38} actif={actif} />
                                          <div style={{ flex:1, minWidth:0 }}>
                                            <div style={{ fontSize:13.5, fontWeight:700, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{paRemplNomCoach(c)}</div>
                                            <div style={{ fontSize:11.5, color:'#6b7280', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.email}</div>
                                            <div style={{ display:'flex', gap:6, marginTop:5, flexWrap:'wrap' }}>
                                              <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:7, background:'#eef2ff', color:'#4338ca' }}>{c.role === 'professeur_titulaire' ? 'Titulaire dédié' : c.role === 'professeur_remplacant' ? 'Remplaçant dédié' : 'Coach'}</span>
                                              {c.nbr_contrats_actifs != null && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:7, background: c.nbr_contrats_actifs===0?'#ecfdf5':'#fffbeb', color: c.nbr_contrats_actifs===0?'#059669':'#92400e' }}>📚 {c.nbr_contrats_actifs} classe{c.nbr_contrats_actifs>1?'s':''}</span>}
                                            </div>
                                          </div>
                                          {actif && <span style={{ fontSize:16, color:'#dc2626', flexShrink:0 }}>✓</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Motif (raison de la suspension définitive)</div>
                                <textarea value={paDefinitifRaison} onChange={e=>setPaDefinitifRaison(e.target.value)}
                                  placeholder="Ex : départ de l'organisme, fin de contrat…" rows={3}
                                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid #e5e7eb', fontSize:13, fontFamily:FF, resize:'vertical', boxSizing:'border-box', outline:'none' }} />
                              </>
                            );
                          })()}

                          {paDefinitifStep === 'transferer' && (
                            <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

                              {/* Coach actuel */}
                              <div>
                                <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Coach titulaire actuel</div>
                                <div style={{ display:'flex', alignItems:'center', gap:14, background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:12, padding:'14px 18px' }}>
                                  <AvatarRond c={coachChoisi} taille={44} actif={true} />
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontSize:14.5, fontWeight:800, color:'#111827' }}>{coachChoisi ? paRemplNomCoach(coachChoisi) : 'Coach inconnu'}</div>
                                    <div style={{ fontSize:12, color:'#6b7280', marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
                                      {coachChoisi?.email && <span>✉️ {coachChoisi.email}</span>}
                                      {coachChoisi && <span>🎓 {LIB_ROLE[coachChoisi.role] || coachChoisi.role}</span>}
                                      <span>📚 {paDefinitifItems.length} classe{paDefinitifItems.length>1?'s':''} active{paDefinitifItems.length>1?'s':''}</span>
                                    </div>
                                  </div>
                                  <span style={{ fontSize:11, fontWeight:700, color:'#991b1b', background:'#fee2e2', padding:'4px 10px', borderRadius:8 }}>Sera révoqué</span>
                                </div>
                              </div>

                              {paDefinitifItems.length > 1 && (
                                <div>
                                  <select onChange={e=>e.target.value && appliquerCoachATous(e.target.value)} defaultValue=""
                                    style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #DDD6FE', background:'#F5F3FF', fontSize:12, fontFamily:FF, color:PA_COLOR, outline:'none' }}>
                                    <option value="">🔗 Appliquer un même nouveau coach à toutes les classes…</option>
                                    {candidats.filter(c=>c.actif!==false).map(c => (
                                      <option key={c.id} value={c.id}>{paRemplNomCoach(c)}</option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {/* Une section par classe/groupe à transférer */}
                              {paDefinitifItems.map((it, i) => (
                                <div key={it.id}>
                                  <div style={{ fontSize:13, fontWeight:800, color:'#0f172a', marginBottom:10 }}>
                                    {it.type==='groupe' ? '🏫' : '💻'} {it.nom}{it.niveau ? ` · ${it.niveau}` : ''}
                                  </div>

                                  <div style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                                    Nouveau coach titulaire * {candidats.length > 0 && <span style={{ fontWeight:600, textTransform:'none', letterSpacing:0 }}>- {candidats.length} disponible{candidats.length>1?'s':''}</span>}
                                  </div>
                                  {candidats.length === 0 ? (
                                    <div style={{ padding:'16px', textAlign:'center', color:'#9ca3af', fontSize:13, border:'1px dashed #e5e7eb', borderRadius:10, marginBottom:14 }}>Aucun autre coach disponible.</div>
                                  ) : (
                                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:10, marginBottom:14 }}>
                                      {candidats.map(c => {
                                        const actif = it.nouveau_coach_id === c.id;
                                        return (
                                          <div key={c.id} onClick={()=>{
                                            setPaDefinitifItems(prev => prev.map((x,xi)=>xi===i?{...x,nouveau_coach_id:c.id}:x));
                                          }}
                                            style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, cursor:'pointer', border:`2px solid ${actif?'#dc2626':'#e5e7eb'}`, background: actif?'#fef2f2':'#fff', transition:'all 0.15s' }}>
                                            <AvatarRond c={c} taille={38} actif={actif} />
                                            <div style={{ flex:1, minWidth:0 }}>
                                              <div style={{ fontSize:13.5, fontWeight:700, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{paRemplNomCoach(c)}</div>
                                              <div style={{ fontSize:11.5, color:'#6b7280', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.email}</div>
                                              <div style={{ display:'flex', gap:6, marginTop:5, flexWrap:'wrap' }}>
                                                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:7, background:'#eef2ff', color:'#4338ca' }}>{LIB_ROLE[c.role] || c.role}</span>
                                                {c.actif === false && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:7, background:'#f3f4f6', color:'#6b7280' }}>Inactif</span>}
                                              </div>
                                            </div>
                                            {actif && <span style={{ fontSize:16, color:'#dc2626', flexShrink:0 }}>✓</span>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  <label style={{ fontSize:11, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:8 }}>Motif *</label>
                                  <textarea value={it.motif} onChange={e=>{
                                    const v = e.target.value;
                                    setPaDefinitifItems(prev => prev.map((x,xi)=>xi===i?{...x,motif:v}:x));
                                  }} rows={2} placeholder="Ex : abandon de poste, faute grave, fin de contrat…"
                                    style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1.5px solid #e5e7eb', fontSize:13, fontFamily:FF, resize:'vertical', boxSizing:'border-box', outline:'none' }} />
                                </div>
                              ))}
                            </div>
                          )}

                          {paDefinitifStep === 'termine' && (
                            <div style={{ textAlign:'center', padding:'20px 0' }}>
                              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
                              <div style={{ fontSize:15, fontWeight:800, color:'#0f172a', marginBottom:6 }}>Suspension définitive effective</div>
                              <div style={{ fontSize:13, color:'#6b7280' }}>{coachChoisi ? paRemplNomCoach(coachChoisi) : 'Ce coach'} a été suspendu et tous ses groupes/classes ont été transférés.</div>
                            </div>
                          )}

                          {paDefinitifErreur && (
                            <div style={{ marginTop:14, fontSize:12, color:'#991B1B', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'8px 12px' }}>{paDefinitifErreur}</div>
                          )}
                        </div>

                        <div style={{ padding:'16px 28px', borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end', gap:10, background:'#fff', flexShrink:0 }}>
                          <button disabled={paDefinitifLoading} onClick={()=>setPaDefinitifOpen(false)}
                            style={{ padding:'10px 20px', borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', color:'#6b7280', cursor:paDefinitifLoading?'not-allowed':'pointer', fontSize:13, fontWeight:600, fontFamily:FF }}>
                            {paDefinitifStep==='termine' ? 'Fermer' : 'Annuler'}
                          </button>
                          {paDefinitifStep === 'choisir_coach' && (
                            <button disabled={paDefinitifLoading || !paDefinitifCoachId || !peut("remplacements","create") || !peut("classes","update")} title={permBtnTitle("Continuer",peut("remplacements","create") && peut("classes","update"))} onClick={chargerItemsATransferer}
                              style={{ padding:'10px 22px', borderRadius:10, border:'none', background:'#DC2626', color:'#fff', cursor:(paDefinitifLoading||!paDefinitifCoachId||!peut("remplacements","create")||!peut("classes","update"))?'not-allowed':'pointer', fontSize:13, fontWeight:700, fontFamily:FF, opacity:(peut("remplacements","create")&&peut("classes","update"))?1:0.6 }}>
                              {paDefinitifLoading ? 'Vérification…' : (!peut("remplacements","create")||!peut("classes","update")) ? '🔒 Continuer →' : 'Continuer →'}
                            </button>
                          )}
                          {paDefinitifStep === 'transferer' && (
                            <button disabled={paDefinitifLoading || !peut("remplacements","create") || !peut("classes","update")} title={permBtnTitle("Transférer et suspendre définitivement",peut("remplacements","create") && peut("classes","update"))} onClick={()=>setPaDefinitifConfirm(true)}
                              style={{ padding:'10px 22px', borderRadius:10, border:'none', background:'#DC2626', color:'#fff', cursor:(paDefinitifLoading||!peut("remplacements","create")||!peut("classes","update"))?'not-allowed':'pointer', fontSize:13, fontWeight:700, fontFamily:FF, opacity:(peut("remplacements","create")&&peut("classes","update"))?1:0.6 }}>
                              {paDefinitifLoading ? 'Transfert en cours…' : '🔒 Transférer et suspendre définitivement'}
                            </button>
                          )}
                        </div>

                        {/* Confirmation finale - action irréversible (suspension définitive +
                            transfert de N classes) : un clic seul ne doit pas suffire. */}
                        {paDefinitifConfirm && (
                          <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10003 }}
                            onClick={()=>setPaDefinitifConfirm(false)}>
                            <div style={{ background:'#fff', borderRadius:16, width:440, maxWidth:'90vw', padding:24, boxShadow:'0 24px 60px rgba(0,0,0,0.3)' }}
                              onClick={e=>e.stopPropagation()}>
                              <div style={{ fontSize:15, fontWeight:800, color:'#991B1B', marginBottom:8 }}>🔒 Confirmer la suspension définitive ?</div>
                              <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.6, marginBottom:20 }}>
                                <strong>{paCoachsList.find(c=>c.id===paDefinitifCoachId) ? paRemplNomCoach(paCoachsList.find(c=>c.id===paDefinitifCoachId)) : 'Ce coach'}</strong> sera suspendu définitivement et ses {paDefinitifItems.length} classe{paDefinitifItems.length>1?'s':''} transférée{paDefinitifItems.length>1?'s':''} aux coachs choisis. Cette action est irréversible - il ne pourra plus se connecter et ne redeviendra pas titulaire de ces classes automatiquement.
                              </div>
                              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                                <button onClick={()=>setPaDefinitifConfirm(false)}
                                  style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff', color:'#6b7280', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:FF }}>
                                  Annuler
                                </button>
                                <button disabled={!peut("remplacements","create") || !peut("classes","update")} title={permBtnTitle("Confirmer",peut("remplacements","create") && peut("classes","update"))} onClick={()=>{ if (!peut("remplacements","create") || !peut("classes","update")) return; setPaDefinitifConfirm(false); lancerTransfertEtSuspension(); }}
                                  style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, cursor: (peut("remplacements","create") && peut("classes","update")) ? 'pointer' : 'not-allowed', fontFamily:FF, opacity: (peut("remplacements","create") && peut("classes","update")) ? 1 : 0.6 }}>
                                  🔒 Confirmer
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Modal */}
                {modalNode}

              </div>
            );
          })()}

          {/* ── ONGLET RAPPORTS SUPERVISEUR ── */}
          {/* Les apprenants notent chaque cours ; le coach ne voit jamais ces notes. */}
          {activeTab === "eval-apprenants" && (
            <EvaluationsApprenants apiUrl={API_URL} authHeaders={authHeaders} accent={PA_COLOR} accentLight={PA_LIGHT} />
          )}

          {activeTab === "rapports-superviseur" && (() => {
            // Ces listes étaient restées aux cinq critères d'origine, alors que le rapport en
            // porte sept notés depuis la reprise des critères de la feuille terrain : le PA
            // recevait les données sans les voir.
            const CRIT_RP = LIBELLES_CRITERES;
            const LIB_INTER_PA = { excellent:"Excellent", bon:"Bon", acceptable:"Acceptable", insuffisant:"Insuffisant" };
            const LIB_GRAM_PA  = { inductive_claire:"Inductive et claire", inductive_perfectible:"Inductive, à revoir", deductive_claire:"Déductive mais claire", confuse:"Confuse ou erronée" };
            const LIB_SYNTH_PA = { excellent:{ l:"Excellent", c:"#15803d", bg:"#dcfce7" },
                                   satisfaisant:{ l:"Satisfaisant", c:"#b45309", bg:"#fef3c7" },
                                   a_accompagner:{ l:"À accompagner", c:"#b91c1c", bg:"#fee2e2" } };
            const nc  = NOTE_COUL;
            const nbg = NOTE_FOND;

            /* ── Classement calculé côté client ── */
            const getDebutPeriode = (periode) => {
              const now = new Date();
              if (periode === "semaine") {
                const d = new Date(now);
                d.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
                d.setHours(0,0,0,0); return d;
              }
              if (periode === "mois") return new Date(now.getFullYear(), now.getMonth(), 1);
              return null;
            };

            const buildClassement = (periode) => {
              const debut = getDebutPeriode(periode);
              const rapportsPeriode = debut
                ? paAllRapports.filter(r => r.date_observation && new Date(r.date_observation) >= debut)
                : paAllRapports;

              const map = {};
              rapportsPeriode.forEach(r => {
                if (!r.coach?.id) return;
                const id = r.coach.id;
                if (!map[id]) map[id] = { coach: r.coach, notes: [], derniere: null };
                if (r.note_globale) {
                  map[id].notes.push(Number(r.note_globale));
                  if (!map[id].derniere || r.date_observation > map[id].derniere.date) {
                    map[id].derniere = { date: r.date_observation, note: Number(r.note_globale) };
                  }
                }
              });

              return Object.values(map)
                .map(e => {
                  const moy = e.notes.length ? (e.notes.reduce((a,b)=>a+b,0)/e.notes.length) : null;
                  const sorted = [...e.notes];
                  const tendance = sorted.length >= 2
                    ? (sorted[sorted.length-1] > sorted[0] ? "hausse" : sorted[sorted.length-1] < sorted[0] ? "baisse" : "stable")
                    : "stable";
                  return { ...e, moyenne: moy, nb_rapports: e.notes.length, tendance };
                })
                .filter(e => e.moyenne !== null)
                .sort((a,b) => b.moyenne - a.moyenne);
            };

            const rapportsFiltres = paAllRapports.filter(rp => {
              const coachNom = rp.coach ? `${rp.coach.prenom||""} ${rp.coach.nom||""}`.toLowerCase() : "";
              if (paAllRapportCoachFilter && !coachNom.includes(paAllRapportCoachFilter.toLowerCase())) return false;
              if (paAllRapportDateFrom && rp.date_observation && rp.date_observation < paAllRapportDateFrom) return false;
              if (paAllRapportDateTo   && rp.date_observation && rp.date_observation > paAllRapportDateTo)   return false;
              return true;
            });

            const classement = buildClassement(paClassementPeriode);

            return (
              <div style={{ padding:"24px 0 32px" }}>

                {/* ── Barre sous-onglets ── */}
                <div style={{ display:"flex", gap:4, marginBottom:24, background:"#f1f5f9", borderRadius:12, padding:4, width:"fit-content" }}>
                  {[
                    { id:"rapports",    label:"📋 Rapports reçus" },
                    { id:"classement",  label:"🏆 Classement" },
                  ].map(st => (
                    <button key={st.id} onClick={()=>setPaRapportSubTab(st.id)}
                      style={{ padding:"8px 18px", borderRadius:9, border:"none", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6,
                        background: paRapportSubTab===st.id ? "#fff" : "transparent",
                        color: paRapportSubTab===st.id ? PA_COLOR : "#64748b",
                        boxShadow: paRapportSubTab===st.id ? "0 1px 6px rgba(0,0,0,.08)" : "none",
                        transition:"all .15s" }}>
                      {st.label}
                      {st.badge ? <span style={{ background: paRapportSubTab===st.id ? PA_COLOR : "#94a3b8", color:"#fff", borderRadius:20, padding:"1px 7px", fontSize:10, fontWeight:800 }}>{st.badge}</span> : null}
                    </button>
                  ))}
                </div>

                {/* ══════════ SOUS-ONGLET : CLASSEMENT ══════════ */}
                {paRapportSubTab === "classement" && (() => {
                  const labelPeriode = paClassementPeriode==="semaine" ? "cette semaine" : paClassementPeriode==="mois" ? "ce mois" : "toute période";
                  const medalIcon = i => i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
                  const trendIcon = t => t==="hausse"?"↗":t==="baisse"?"↘":"→";
                  const trendCol  = t => t==="hausse"?"#16a34a":t==="baisse"?"#ef4444":"#94a3b8";

                  return (
                    <div>
                      {/* En-tête + filtre période */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                        <div>
                          <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>🏆 Classement des coachs</h2>
                          <p style={{ margin:"4px 0 0", fontSize:13, color:"#94a3b8" }}>
                            Basé sur les notes d'observation du Superviseur · {labelPeriode}
                          </p>
                        </div>
                        <div style={{ display:"flex", gap:6 }}>
                          {[
                            { v:"semaine", l:"Cette semaine" },
                            { v:"mois",    l:"Ce mois" },
                            { v:"tous",    l:"Tout" },
                          ].map(p => (
                            <button key={p.v} onClick={()=>setPaClassementPeriode(p.v)}
                              style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", border:`1.5px solid ${paClassementPeriode===p.v?PA_COLOR:"#e2e8f0"}`, background:paClassementPeriode===p.v?PA_LIGHT:"#fff", color:paClassementPeriode===p.v?PA_COLOR:"#64748b" }}>
                              {p.l}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* KPIs */}
                      {classement.length > 0 && (
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginBottom:20 }}>
                          {[
                            { icon:"👨‍🏫", label:"Coachs évalués",  v:classement.length,                                                        c:PA_COLOR },
                            { icon:"⭐",   label:"Meilleure note",  v:classement[0]?.moyenne ? `${classement[0].moyenne.toFixed(1)}/5`:"-",     c:"#f59e0b", sub:(classement[0]?.coach?.prenom||"")+" "+(classement[0]?.coach?.nom||"") },
                            { icon:"📊",   label:"Note moyenne",    v:classement.length ? (classement.reduce((s,e)=>s+(e.moyenne||0),0)/classement.length).toFixed(1)+"/5":"-", c:"#0891b2" },
                            { icon:"⚠️",   label:"Notes < 3",       v:classement.filter(e=>e.moyenne!==null&&e.moyenne<3).length,               c:"#ef4444" },
                          ].map(s=>(
                            <div key={s.label} style={{ background:"#fff", padding:"14px 16px", borderRadius:12, border:"1.5px solid #e2e8f0", display:"flex", alignItems:"center", gap:12 }}>
                              <span style={{ fontSize:22 }}>{s.icon}</span>
                              <div>
                                <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600 }}>{s.label}</div>
                                <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
                                {s.sub && <div style={{ fontSize:10, color:"#94a3b8", marginTop:1, maxWidth:110, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.sub}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {classement.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"70px 0", background:"#fff", borderRadius:16, border:"1.5px dashed #e2e8f0" }}>
                          <div style={{ fontSize:"3.5rem", marginBottom:12 }}>🏆</div>
                          <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", marginBottom:6 }}>Aucune donnée pour cette période</div>
                          <div style={{ fontSize:13, color:"#94a3b8" }}>Aucun rapport d'observation reçu {labelPeriode}.</div>
                        </div>
                      ) : (
                        <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
                          <div style={{ padding:"12px 20px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"#64748b" }}>Classement par note moyenne · {labelPeriode}</span>
                            <span style={{ fontSize:11, color:"#94a3b8" }}>{classement.length} coach{classement.length>1?"s":""} évalué{classement.length>1?"s":""}</span>
                          </div>
                          {classement.map((entry, i) => {
                            const coach = entry.coach;
                            const photo = coach?.avatar_url;
                            const initiales = ((coach?.prenom?.[0]||"")+(coach?.nom?.[0]||"")).toUpperCase() || "CO";
                            const medal = medalIcon(i);
                            const bg = i===0?"#fffbeb":i===1?"#f8fafc":i===2?"#fff7ed":"#fff";
                            return (
                              <div key={coach?.id||i}
                                onClick={() => { if (coach?.id) { openPaCoachModal(coach); setPaCoachModalTab("evaluations"); } }}
                                title={coach ? `Voir les ${entry.nb_rapports} observation${entry.nb_rapports>1?"s":""} de ${coach.prenom||""} ${coach.nom||""}`.trim() : undefined}
                                style={{ cursor: coach?.id ? "pointer" : "default", display:"flex", alignItems:"center", gap:14, padding:"14px 20px", borderBottom: i<classement.length-1?"1px solid #f1f5f9":"none", background:bg }}>
                                {/* Rang */}
                                <div style={{ width:36, textAlign:"center", flexShrink:0 }}>
                                  {medal
                                    ? <span style={{ fontSize:24 }}>{medal}</span>
                                    : <span style={{ fontSize:13, fontWeight:700, color:"#94a3b8" }}>#{i+1}</span>
                                  }
                                </div>

                                {/* Photo */}
                                <div style={{ position:"relative", flexShrink:0 }}>
                                  {photo
                                    ? <img src={photo} alt={initiales} style={{ width:42, height:42, borderRadius:"50%", objectFit:"cover", border:`2px solid ${nc(entry.moyenne)}40` }} />
                                    : <div style={{ width:42, height:42, borderRadius:"50%", background:PA_LIGHT, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, color:PA_COLOR }}>{initiales}</div>
                                  }
                                  {entry.moyenne && (
                                    <div style={{ position:"absolute", bottom:-4, right:-8, background:nc(entry.moyenne), color:"#fff", borderRadius:20, padding:"1px 5px", fontSize:9, fontWeight:900, border:"2px solid #fff", whiteSpace:"nowrap" }}>
                                      ⭐ {entry.moyenne.toFixed(1)}
                                    </div>
                                  )}
                                </div>

                                {/* Nom + infos */}
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>{coach?.prenom||""} {coach?.nom||""}</div>
                                  <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                                    {entry.nb_rapports} rapport{entry.nb_rapports>1?"s":""} · {labelPeriode}
                                  </div>
                                  <div style={{ marginTop:5 }}>
                                    <BadgeCategorieCoach note={entry.moyenne} taille="xs" />
                                  </div>
                                </div>

                                {/* Barre de notes */}
                                <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:28, flexShrink:0 }}>
                                  {entry.notes.slice(-5).map((n,ni) => (
                                    <div key={ni} title={`Note : ${n}/5`} style={{ width:8, borderRadius:3, background:nc(n), height:`${(n/5)*100}%`, minHeight:4 }} />
                                  ))}
                                </div>

                                {/* Note cercle */}
                                <div style={{ width:52, height:52, borderRadius:"50%", background:nbg(entry.moyenne), border:`2.5px solid ${nc(entry.moyenne)}`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:15, color:nc(entry.moyenne), flexShrink:0 }}>
                                  {entry.moyenne.toFixed(1)}
                                </div>

                                {/* Tendance */}
                                <div style={{ fontSize:18, fontWeight:900, color:trendCol(entry.tendance), flexShrink:0, width:24, textAlign:"center" }} title={`Tendance : ${entry.tendance}`}>
                                  {trendIcon(entry.tendance)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ══════════ SOUS-ONGLET : RAPPORTS REÇUS ══════════ */}
                {paRapportSubTab === "rapports" && (() => {
                const rapportsFiltres = paAllRapports.filter(rp => {
                  const coachNom = rp.coach ? `${rp.coach.prenom||""} ${rp.coach.nom||""}`.toLowerCase() : "";
                  if (paAllRapportCoachFilter && !coachNom.includes(paAllRapportCoachFilter.toLowerCase())) return false;
                  if (paAllRapportDateFrom && rp.date_observation && rp.date_observation < paAllRapportDateFrom) return false;
                  if (paAllRapportDateTo   && rp.date_observation && rp.date_observation > paAllRapportDateTo)   return false;
                  return true;
                });
                return (
                <div>
                {/* Header */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
                  <div>
                    <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>📋 Rapports d'observation reçus</h2>
                    <p style={{ margin:"4px 0 0", fontSize:13, color:"#94a3b8" }}>
                      Rapports transmis par le Superviseur Général · {paAllRapports.length} au total
                    </p>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    {/* Même format que la feuille terrain : un bloc par coach, critères en
                        lignes, observations en colonnes - pour que la direction retrouve
                        exactement le document qu'elle lit déjà. */}
                    <button onClick={()=>exporterAppraisalCoachs({ rapports: rapportsFiltres, nomFichier:`appraisal_coachs_${new Date().toISOString().slice(0,10)}` })}
                      disabled={!rapportsFiltres.length}
                      title={rapportsFiltres.length ? "Exporter au format de la feuille d'évaluation" : "Aucun rapport à exporter"}
                      style={{ padding:"8px 16px", background: rapportsFiltres.length ? "#dcfce7" : "#f1f5f9", border:`1px solid ${rapportsFiltres.length ? "#86efac" : "#e2e8f0"}`, borderRadius:8, fontSize:12, color: rapportsFiltres.length ? "#15803d" : "#94a3b8", fontWeight:600, cursor: rapportsFiltres.length ? "pointer" : "not-allowed" }}>
                      📊 Excel
                    </button>
                    <button onClick={() => {
                      setPaAllRapportsLoading(true);
                      const token = localStorage.getItem("admin_token");
                      fetch(`${API_URL}/api/coachs/rapports-transmis`, { headers:{ Authorization:`Bearer ${token}` } })
                        .then(r=>r.ok?r.json():{rapports:[]}).then(d=>setPaAllRapports(d.rapports||[])).catch(()=>{}).finally(()=>setPaAllRapportsLoading(false));
                    }} style={{ padding:"8px 16px", background:"#e0f2fe", border:"1px solid #bae6fd", borderRadius:8, fontSize:12, color:"#0369a1", fontWeight:600, cursor:"pointer" }}>
                      ↻ Actualiser
                    </button>
                  </div>
                </div>

                {/* Filtres */}
                <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"12px 16px" }}>
                  <input
                    placeholder="🔍 Filtrer par coach…"
                    value={paAllRapportCoachFilter}
                    onChange={e => setPaAllRapportCoachFilter(e.target.value)}
                    style={{ flex:1, minWidth:180, padding:"7px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none" }}
                  />
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600, flexShrink:0 }}>Du</label>
                    <input type="date" value={paAllRapportDateFrom} onChange={e=>setPaAllRapportDateFrom(e.target.value)}
                      style={{ padding:"6px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, outline:"none" }} />
                    <label style={{ fontSize:11, color:"#9ca3af", fontWeight:600, flexShrink:0 }}>au</label>
                    <input type="date" value={paAllRapportDateTo} onChange={e=>setPaAllRapportDateTo(e.target.value)}
                      style={{ padding:"6px 10px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, outline:"none" }} />
                    {(paAllRapportCoachFilter||paAllRapportDateFrom||paAllRapportDateTo) && (
                      <button onClick={()=>{ setPaAllRapportCoachFilter(""); setPaAllRapportDateFrom(""); setPaAllRapportDateTo(""); }}
                        style={{ fontSize:12, color:"#ef4444", background:"transparent", border:"none", cursor:"pointer", fontWeight:700 }}>✕ Réinitialiser</button>
                    )}
                  </div>
                  {rapportsFiltres.length !== paAllRapports.length && (
                    <span style={{ fontSize:12, color:"#0891b2", fontWeight:600 }}>{rapportsFiltres.length} / {paAllRapports.length} affichés</span>
                  )}
                </div>

                {paAllRapportsLoading && (
                  <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8", fontSize:13 }}>Chargement des rapports…</div>
                )}

                {!paAllRapportsLoading && paAllRapports.length === 0 && (
                  <div style={{ textAlign:"center", padding:"80px 0", background:"#fff", borderRadius:16, border:"1.5px dashed #bae6fd" }}>
                    <div style={{ fontSize:"3.5rem", marginBottom:12 }}>📋</div>
                    <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", marginBottom:6 }}>Aucun rapport reçu</div>
                    <div style={{ fontSize:13, color:"#94a3b8" }}>Le Superviseur Général n'a encore transmis aucun rapport d'observation.</div>
                  </div>
                )}

                {!paAllRapportsLoading && rapportsFiltres.length === 0 && paAllRapports.length > 0 && (
                  <div style={{ textAlign:"center", padding:"40px 0", background:"#fff", borderRadius:16, border:"1.5px solid #e2e8f0" }}>
                    <div style={{ fontSize:13, color:"#94a3b8" }}>Aucun rapport ne correspond aux filtres.</div>
                  </div>
                )}

                {!paAllRapportsLoading && rapportsFiltres.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {rapportsFiltres.map((rp) => {
                      const open    = paAllRapportExpanded.has(rp.id);
                      const note    = rp.note_globale ? Number(rp.note_globale) : null;
                      const coachNom = rp.coach ? `${rp.coach.prenom||""} ${rp.coach.nom||""}`.trim() : "Coach inconnu";
                      const depNom  = rp.deputy ? `${rp.deputy.prenom||""} ${rp.deputy.nom||""}`.trim() : "Deputy";
                      const hasTxt  = rp.observations || rp.recommandations || rp.commentaire_superviseur;
                      const toggleR = () => setPaAllRapportExpanded(prev => { const n2 = new Set(prev); n2.has(rp.id) ? n2.delete(rp.id) : n2.add(rp.id); return n2; });
                      return (
                        <div key={rp.id} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #bae6fd", overflow:"hidden" }}>
                          {/* Row résumé */}
                          <div onClick={toggleR} style={{ padding:"14px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:14, background:open?"#e0f2fe":"#fff", transition:"background .15s" }}
                            onMouseEnter={e=>{ if(!open) e.currentTarget.style.background="#f0f9ff"; }}
                            onMouseLeave={e=>{ if(!open) e.currentTarget.style.background="#fff"; }}>
                            <span style={{ fontSize:13, color:"#94a3b8", flexShrink:0, display:"inline-block", transform:open?"rotate(90deg)":"rotate(0deg)", transition:"transform .2s" }}>▶</span>
                            {/* Avatar coach */}
                            {rp.coach?.avatar_url
                              ? <img src={rp.coach.avatar_url} alt={coachNom} style={{ width:38, height:38, borderRadius:"50%", objectFit:"cover", flexShrink:0, border:"2px solid #e0f2fe" }} />
                              : <div style={{ width:38, height:38, borderRadius:"50%", background:"#e0f2fe", color:"#0891b2", fontWeight:800, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                  {coachNom.split(" ").map(w=>w[0]||"").join("").slice(0,2).toUpperCase()}
                                </div>
                            }
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:14, fontWeight:800, color:"#0f172a" }}>{coachNom}</div>
                              <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
                                {rp.date_observation ? new Date(rp.date_observation).toLocaleDateString("fr-FR") : "-"}
                                {rp.classe && <span style={{ marginLeft:8, background:"#e0f2fe", color:"#0369a1", borderRadius:6, padding:"1px 7px", fontSize:11, fontWeight:600 }}>{rp.classe}</span>}
                                {rp.centre && <span style={{ marginLeft:6, color:"#94a3b8" }}>· {rp.centre}</span>}
                                <span style={{ marginLeft:8, color:"#94a3b8" }}>Observé par {depNom}</span>
                                {hasTxt && <span style={{ marginLeft:6, color:"#0891b2" }}>📝</span>}
                              </div>
                            </div>
                            <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:24, flexShrink:0 }}>
                              {Object.keys(CRIT_RP).map(k => {
                                const v = rp[k];
                                return <div key={k} title={CRIT_RP[k].label} style={{ width:7, borderRadius:2, background:v?nc(v):"#e5e7eb", height:v?`${v/5*100}%`:"20%" }} />;
                              })}
                            </div>
                            {note && (
                              <div style={{ width:44, height:44, borderRadius:10, background:nbg(note), display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:16, color:nc(note), flexShrink:0, border:`2px solid ${nc(note)}33` }}>
                                {note.toFixed(1)}
                              </div>
                            )}
                            {rp.transmis_pa_le && (
                              <div style={{ fontSize:10, color:"#94a3b8", flexShrink:0, textAlign:"right", lineHeight:1.3 }}>
                                Transmis<br/>{new Date(rp.transmis_pa_le).toLocaleDateString("fr-FR")}
                              </div>
                            )}
                          </div>

                          {/* Détail déployé */}
                          {open && (
                            <div style={{ padding:"16px 20px", background:"#e0f2fe", borderTop:"1px solid #bae6fd" }}>
                              {/* Synthèse, contexte, séance observée et incident - le rapport
                                  les transporte depuis la reprise des critères de la feuille
                                  terrain, mais cet écran ne les affichait pas : le PA décidait
                                  sur une partie seulement de ce qu'on lui avait transmis. */}
                              <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
                                {rp.synthese && LIB_SYNTH_PA[rp.synthese] && (
                                  <span style={{ padding:"5px 12px", borderRadius:8, fontSize:12, fontWeight:800, background:LIB_SYNTH_PA[rp.synthese].bg, color:LIB_SYNTH_PA[rp.synthese].c }}>{LIB_SYNTH_PA[rp.synthese].l}</span>
                                )}
                                {rp.type_observation && rp.type_observation !== "cours" && (
                                  <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:700, background:"#ede9fe", color:"#6d28d9" }}>
                                    {rp.type_observation === "evaluation" ? "📊" : "🎭"} {libelleObservation(rp.type_observation)}
                                  </span>
                                )}
                                {/* Les rapports anterieurs portent ici un type de CONTENU. */}
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
                                    👥 Interactivité : <strong>{LIB_INTER_PA[rp.interactivite_classe] || rp.interactivite_classe}</strong>
                                  </span>
                                )}
                                {rp.approche_grammaticale && (
                                  <span style={{ padding:"5px 10px", borderRadius:8, fontSize:11.5, fontWeight:600, background:"#fff", border:"1px solid #bae6fd", color:"#475569" }}>
                                    📖 Grammaire : <strong>{LIB_GRAM_PA[rp.approche_grammaticale] || rp.approche_grammaticale}</strong>
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
                              </div>
                              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:8, marginBottom:hasTxt?14:0 }}>
                                {Object.entries(CRIT_RP).map(([key, meta]) => {
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
                                  {/* UN RAPPORT CORRIGÉ N'EST PLUS TOUT À FAIT LE TÉMOIGNAGE DU DEPUTY.
                                      Le conseiller décide de l'affectation et de la catégorie de contrat
                                      d'un coach sur cette note : il doit savoir qu'elle a été rectifiée,
                                      par qui et pourquoi, avant d'en tirer une conclusion. Conserver la
                                      trace sans la montrer au dernier lecteur n'aurait servi à rien. */}
                                  {rp.correction_superviseur && (
                                    <div style={{ gridColumn:"1/-1", background:"#fffbeb", borderRadius:9, padding:"10px 13px", border:"1px solid #fde68a" }}>
                                      <div style={{ fontSize:11, fontWeight:800, color:"#92400e", marginBottom:5 }}>✏️ Rapport corrigé par le superviseur</div>
                                      <p style={{ margin:0, fontSize:12, color:"#78350f", lineHeight:1.6 }}>
                                        Par {[rp.correction_superviseur.par?.prenom, rp.correction_superviseur.par?.nom].filter(Boolean).join(" ") || "le superviseur"}
                                        {rp.correction_superviseur.le ? ` le ${new Date(rp.correction_superviseur.le).toLocaleDateString("fr-FR")}` : ""}.
                                        {rp.correction_superviseur.motif ? ` Motif : « ${rp.correction_superviseur.motif} ».` : ""}
                                        {rp.correction_superviseur.original?.note_globale != null && rp.note_globale != null
                                          && String(rp.correction_superviseur.original.note_globale) !== String(rp.note_globale)
                                          ? ` Note du deputy : ${rp.correction_superviseur.original.note_globale}/5 → ${rp.note_globale}/5.`
                                          : ""}
                                      </p>
                                    </div>
                                  )}
                                  {rp.commentaire_superviseur && (
                                    <div style={{ gridColumn:"1/-1", background:"#fef9c3", borderRadius:9, padding:"10px 13px", border:"1px solid #fde047" }}>
                                      <div style={{ fontSize:11, fontWeight:800, color:"#854d0e", marginBottom:5 }}>💬 Note du Superviseur</div>
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
            );
          })()}

          {/* ── ONGLET MESSAGES ── */}
          {activeTab === "messages" && (
            <div style={{ padding:"0 0 32px" }}>
              {/* Deux canaux distincts : la messagerie privée parle à une personne, le chat
                  de classe parle à TOUS ses apprenants. */}
              <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e7eb", marginBottom:18 }}>
                {[{ key:"prive", label:"💬 Messagerie privée", badge:0 },
                  { key:"groupe", label:"👥 Chat de classe", badge: chatGroupeNonLus },
                  // Les groupes LIBRES - ceux qui ne suivent pas une classe. Onglet distinct :
                  // écrire à une classe atteint des apprenants, écrire à un groupe libre
                  // n'atteint que du personnel. Les confondre ferait partir un message
                  // interne devant des familles.
                  { key:"libre", label:"💬 Groupes", badge: groupesLibresNonLus }].map(t => (
                  <button key={t.key} onClick={() => setMsgSubTab(t.key)}
                    style={{ padding:"10px 20px", border:"none", borderBottom: msgSubTab===t.key ? "2px solid #7c3aed" : "2px solid transparent", marginBottom:-1, fontSize:13, fontWeight:600, cursor:"pointer", background:"transparent", color: msgSubTab===t.key ? "#7c3aed" : "#64748b" }}>
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
                <MessagerieTab accentColor="#7c3aed" openWithUser={paChatTarget} />
              ) : msgSubTab === "libre" ? (
                <GroupesLibres profil={profil} token={localStorage.getItem("admin_token")}
                  accent="#7c3aed" accentClair="#ede9fe" />
              ) : (
                <ChatGroupe
                  groupes={paGroupes}
                  profil={profil}
                  token={localStorage.getItem("admin_token")}
                  accent="#7c3aed"
                  accentClair="#ede9fe"
                />
              )}
            </div>
          )}

          {/* ── ONGLET DOSSIERS À RÉAFFECTER (hors canal) ── */}
          {activeTab === "reaffectations" && (
            <div style={{ padding:"24px 0" }}>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:20, fontWeight:800, color:"#1e1b4b" }}>🔀 Dossiers à réaffecter</div>
                <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>
                  Prospects ayant deux assistantes sur deux canaux différents (ex : présentiel + en ligne) - choisissez la plus qualifiée pour consolider le dossier.
                </div>
              </div>

              {paReaffLoading && <div style={{ color:"#64748b", fontSize:13 }}>Chargement…</div>}

              {!paReaffLoading && paReaffectations.length === 0 && (
                <div style={{ background:"#fff", borderRadius:14, padding:"32px 24px", textAlign:"center", color:"#64748b", fontSize:13, border:"1px solid #ede9fe" }}>
                  ✅ Aucun dossier en attente de réaffectation.
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {paReaffectations.map(notif => {
                  const searchQ = (paReaffSearch[notif.id] || "").toLowerCase();
                  const selectedId = paReaffSelection[notif.id] || "";
                  const dossierChoisi = paReaffDossierChoisi[notif.id] || "nouveau";
                  // Le PA choisit lequel des deux dossiers il réaffecte (carte cliquée) - le
                  // transfert applique assistante_id sur CE dossier précis, donc on ne propose
                  // que des assistantes de son canal, pour éviter qu'une assistante en_ligne se
                  // retrouve avec un dossier présentiel (et inversement). Les anciennes alertes
                  // (créées avant ce correctif) n'ont pas ce canal en meta : dans ce cas on
                  // affiche tout le monde, sans filtrer.
                  const canalCible = dossierChoisi === "ancien" ? (notif.meta?.autre_type_cours || null) : (notif.meta?.type_cours || null);
                  const parCanal = paAssistantesToutes.filter(a => !canalCible || a.type_cours === canalCible);
                  const filtered = parCanal.filter(a => {
                    if (!searchQ) return true;
                    const hay = `${a.prenom || ""} ${a.nom || ""} ${a.email || ""} ${a.centre_nom || ""}`.toLowerCase();
                    return hay.includes(searchQ);
                  });
                  const dossiers = paReaffDossiers[notif.id];
                  const PSTAT = { en_attente:"⏳ En attente", partiel:"🔄 Partiel", reçu:"✅ Payé", confirme:"✅ Payé", paye:"✅ Payé", remboursé:"↩️ Remboursé" };
                  const CarteDossier = ({ label, d, accent, valeur }) => {
                    const isSel = dossierChoisi === valeur;
                    return (
                    <div onClick={() => {
                        // Changer de dossier ciblé invalide le choix d'assistante précédent -
                        // il pouvait correspondre à l'autre canal (cf. filtrage par canal).
                        setPaReaffDossierChoisi(prev => ({ ...prev, [notif.id]: valeur }));
                        setPaReaffSelection(prev => ({ ...prev, [notif.id]: "" }));
                      }}
                      style={{ flex:1, minWidth:220, cursor:"pointer", background: isSel ? accent+"1A" : accent+"0D", border: isSel ? `2px solid ${accent}` : `1.5px solid ${accent}40`, borderRadius:10, padding:"12px 14px", transition:"all .15s" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                        <div style={{ fontSize:10, fontWeight:800, color:accent, textTransform:"uppercase", letterSpacing:".04em" }}>{label}</div>
                        {isSel && <span style={{ fontSize:10, fontWeight:800, color:accent }}>✓ à réaffecter</span>}
                      </div>
                      {!d ? (
                        <div style={{ fontSize:12, color:"#94a3b8" }}>Chargement…</div>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>
                            {d.type_cours === "hybride" ? "⚡ Hybride" : d.type_cours === "presentiel" ? "🏫 Présentiel" : d.type_cours === "en_ligne" ? "🌐 En ligne" : d.type_cours === "domicile" ? "🏠 Domicile" : d.type_cours}
                            {d.type_coaching ? ` · ${d.type_coaching}` : ""}
                          </div>
                          {d.inscription_offre && <div style={{ fontSize:11, color:"#374151" }}>📚 {d.inscription_offre}</div>}
                          {d.centre_nom && <div style={{ fontSize:11, color:"#374151" }}>📍 {d.centre_nom}</div>}
                          <div style={{ fontSize:11, color:"#374151" }}>👤 {d.assistante_nom || "-"}</div>
                          <div style={{ fontSize:11, color:"#374151" }}>
                            {PSTAT[d.statut_paiement] || "⏳ En attente"}
                            {d.montant_paye ? ` · ${Number(d.montant_paye).toLocaleString("fr-FR")} F` : ""}
                          </div>
                          <div style={{ fontSize:10, color:"#94a3b8" }}>Créé le {d.created_at ? new Date(d.created_at).toLocaleDateString("fr-FR") : "-"}</div>
                        </div>
                      )}
                    </div>
                  );};
                  return (
                    <div key={notif.id} style={{ background:"#fff", borderRadius:14, padding:"18px 20px", border:"1.5px solid #fde68a" }}>
                      <div style={{ fontWeight:800, color:"#92400e", fontSize:14, marginBottom:4 }}>{notif.titre}</div>
                      <div style={{ fontSize:13, color:"#475569", marginBottom:14, whiteSpace:"pre-line" }}>{notif.message}</div>

                      {/* ── Détail des deux offres/dossiers en jeu - cliquer pour choisir lequel réaffecter ── */}
                      <div style={{ fontSize:11, color:"#64748b", marginBottom:6 }}>👉 Cliquez sur le dossier que vous voulez réaffecter :</div>
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
                        <CarteDossier label="Nouveau dossier" d={dossiers?.nouveau} accent="#7c3aed" valeur="nouveau" />
                        <CarteDossier label="Dossier existant" d={dossiers?.ancien} accent="#0891b2" valeur="ancien" />
                      </div>

                      {canalCible ? (
                        <div style={{ fontSize:11, color:"#7c3aed", fontWeight:700, marginBottom:8 }}>
                          🔒 Seules les assistantes du canal "{canalCible}" sont proposées ci-dessous, pour rester cohérent avec ce dossier.
                        </div>
                      ) : (
                        <div style={{ fontSize:11, color:"#b45309", fontWeight:700, marginBottom:8 }}>
                          ⚠️ Canal du dossier inconnu (ancienne alerte) - toutes les assistantes sont affichées, vérifiez bien le canal avant de transférer.
                        </div>
                      )}

                      <input
                        value={paReaffSearch[notif.id] || ""}
                        onChange={e => setPaReaffSearch(prev => ({ ...prev, [notif.id]: e.target.value }))}
                        placeholder="🔍 Rechercher une assistante (nom, email, centre…)"
                        style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, marginBottom:10, boxSizing:"border-box" }}
                      />

                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:8, maxHeight:280, overflowY:"auto", marginBottom:14, padding:2 }}>
                        {filtered.length === 0 && (
                          <div style={{ fontSize:12, color:"#94a3b8", gridColumn:"1/-1", textAlign:"center", padding:12 }}>Aucune assistante ne correspond.</div>
                        )}
                        {filtered.map(a => {
                          const isSel = selectedId === a.id;
                          const nom = `${a.prenom || ""} ${a.nom || ""}`.trim();
                          const initiales = nom.split(" ").map(p=>p[0]).filter(Boolean).slice(0,2).join("").toUpperCase() || "?";
                          const CANAL = { en_ligne:{ label:"En ligne", icon:"🌐", color:"#0891b2", bg:"#e0f2fe" }, presentiel:{ label:"Présentiel", icon:"🏫", color:"#7c3aed", bg:"#ede9fe" }, domicile:{ label:"Domicile", icon:"🏠", color:"#d97706", bg:"#fef3c7" } };
                          const canal = CANAL[a.type_cours] || { label:a.type_cours || "-", icon:"❓", color:"#6b7280", bg:"#f3f4f6" };
                          return (
                            <div key={a.id} onClick={() => setPaReaffSelection(prev => ({ ...prev, [notif.id]: a.id }))}
                              style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", borderRadius:10, cursor:"pointer", transition:"all .15s",
                                border: isSel ? "2px solid #7c3aed" : "1px solid #e2e8f0", background: isSel ? "#faf5ff" : "#fff" }}>
                              {a.photo_url ? (
                                <img src={a.photo_url} alt={nom} style={{ width:38, height:38, borderRadius:"50%", objectFit:"cover", flexShrink:0, border:`2px solid ${isSel?"#7c3aed":"#e2e8f0"}` }} />
                              ) : (
                                <div style={{ width:38, height:38, borderRadius:"50%", background: isSel ? "#7c3aed" : "linear-gradient(135deg,#7c3aed,#a855f7)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, color:"#fff", flexShrink:0 }}>
                                  {initiales}
                                </div>
                              )}
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                                  <span style={{ fontWeight:800, fontSize:12.5, color:"#0f172a" }}>{nom || "-"}</span>
                                  {isSel && <span style={{ fontSize:12, color:"#7c3aed" }}>✓</span>}
                                </div>
                                <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap", marginTop:3 }}>
                                  <span style={{ fontSize:9, fontWeight:700, padding:"1px 7px", borderRadius:99, background:canal.bg, color:canal.color }}>{canal.icon} {canal.label}</span>
                                  {a.centre_nom && <span style={{ fontSize:9, color:"#94a3b8" }}>📍 {a.centre_nom}</span>}
                                  {a.profil && <span style={{ fontSize:9, color:"#94a3b8" }}>· {a.profil}</span>}
                                </div>
                                {a.email && <div style={{ fontSize:10, color:"#94a3b8", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>✉️ {a.email}</div>}
                                {a.telephone && <div style={{ fontSize:10, color:"#0891b2", marginTop:1 }}>📞 {a.telephone}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ display:"flex", justifyContent:"flex-end" }}>
                        <button
                          onClick={() => {
                            const assistante = paAssistantesToutes.find(a => a.id === selectedId);
                            setPaReaffConfirm({ notif, assistante });
                          }}
                          disabled={paReaffTransferEnCours === notif.id || !selectedId || !peut("rapports","manage")}
                          title={permBtnTitle("Transférer", peut("rapports","manage"))}
                          style={{ padding:"9px 18px", borderRadius:8, border:"none", background: (!selectedId||!peut("rapports","manage")) ? "#e2e8f0" : "#7c3aed", color: (!selectedId||!peut("rapports","manage")) ? "#94a3b8" : "#fff", fontWeight:700, fontSize:13, cursor: (paReaffTransferEnCours === notif.id || !selectedId || !peut("rapports","manage")) ? "not-allowed" : "pointer" }}
                        >
                          {paReaffTransferEnCours === notif.id ? "Transfert…" : peut("rapports","manage") ? "Transférer →" : "🔒 Transférer"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Modal confirmation transfert ── */}
              {paReaffConfirm && (
                <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:3000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                  onClick={e => { if (e.target === e.currentTarget) setPaReaffConfirm(null); }}>
                  <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:440, padding:"24px 26px", boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", marginBottom:8 }}>Confirmer le transfert ?</div>
                    <div style={{ fontSize:13, color:"#475569", lineHeight:1.6, marginBottom:18 }}>
                      Ce dossier sera consolidé sur <strong>{[paReaffConfirm.assistante?.prenom, paReaffConfirm.assistante?.nom].filter(Boolean).join(" ") || "cette assistante"}</strong>.
                      L'ancienne assistante ne verra plus ce dossier dans ses prospects. Cette action est irréversible depuis cet écran.
                    </div>
                    <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
                      <button onClick={() => setPaReaffConfirm(null)} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                        Annuler
                      </button>
                      <button
                        onClick={() => { const notif = paReaffConfirm.notif; setPaReaffConfirm(null); transfererDossier(notif); }}
                        disabled={!peut("rapports","manage")}
                        title={permBtnTitle("Confirmer le transfert", peut("rapports","manage"))}
                        style={permBtnStyle({ padding:"9px 18px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }, peut("rapports","manage"))}
                      >
                        {peut("rapports","manage") ? "✓ Confirmer le transfert" : "🔒 Confirmer le transfert"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ONGLET NOTIFICATIONS ── */}
          {activeTab === "notifications" && (
            <div style={{ padding: "24px 0" }}>
              <NotificationsTab userId={profil?.id} accentColor="#7c3aed" />
            </div>
          )}

          {/* ── ONGLET ÉVALUATIONS PARENTS ── */}
          {/* Meme ecran que chez le superviseur : un seul composant, une seule
              correction a faire quand il evolue. */}
          {activeTab === "evaluations" && (
            <EvaluationsParents apiUrl={API_URL} authHeaders={authHeaders}
              accent={PA_COLOR} accentLight={PA_LIGHT} accentGradient={PA_GRADIENT} />
          )}

          {/* Modal détail évaluation - infos parent + enfant */}

          </div>{/* fin padding 24 */}
        </div>{/* fin white card */}
      </div>{/* fin outer padding */}

    </div>

    {/* ══════════════════════════════════════════════════
        MODAL DÉTAIL APPRENANT
    ══════════════════════════════════════════════════ */}
    {paSelectedApprenant && (() => {
      const ap  = paSelectedApprenant;
      const asg = paApprenantAssignation;
      const nomAp   = ap._nomAp  || "-";
      const emailAp = ap._emailAp || "-";
      const initAp  = ap._initAp  || "AP";
      const accesInfo = paApprenantAccesInfo;

      const closeModal = () => { setPaSelectedApprenant(null); setPaApprenantAssignation(null); setPaApprenantAccesInfo(null); setPaApprenantParentAcces(null); setPaApprenantEvals([]); };

      const statutCfg = ap.statut==="actif"
        ? { color:"#16a34a", bg:"#dcfce7", label:"Actif" }
        : ap.statut==="terminé"
        ? { color:"#6b7280", bg:"#f3f4f6", label:"Terminé" }
        : { color:"#f59e0b", bg:"#fef3c7", label:ap.statut||"-" };

      const modeLabel = asg?.type_cours==="hybride"?"⚡ Hybride":asg?.type_cours==="en_ligne"?"💻 En ligne"
        : asg?.type_cours==="domicile"?"🏠 À domicile"
        : asg?.type_cours==="presentiel"?`🏢 Présentiel${asg?.centres?.nom?" · "+asg.centres.nom:""}`
        : asg?.type_cours||"-";

      const plan = asg?.plan_paiement || {};
      const tranches = plan.tranches || [];
      const moisPaiements = plan.mois_paiements || [];
      const accesBloque = asg?.acces_bloque || false;
      const today2 = new Date(); today2.setHours(0,0,0,0);

      const paiementCfg = asg?.statut_paiement==="paye" || asg?.statut_paiement==="confirme"
        ? { color:"#16a34a", bg:"#dcfce7", label:"Confirmé ✓" }
        : asg?.statut_paiement==="en_attente"
        ? { color:"#f59e0b", bg:"#fef3c7", label:"En attente" }
        : asg?.statut_paiement==="partiel"
        ? { color:"#0891b2", bg:"#e0f2fe", label:"Partiel" }
        : { color:"#9ca3af", bg:"#f3f4f6", label:"-" };

      // Reçu PDF par versement - même technique que côté Commercial (fenêtre imprimable,
      // aucune dépendance) : le PA doit pouvoir le consulter/imprimer sans repasser par
      // l'assistante, notamment pour du coaching privé qu'il gère lui-même de bout en bout.
      const exporterRecuPaiementPDF = (p) => {
        try {
          const num = `BET-REC-${String(p.id || asg?.id || "").slice(0, 8).toUpperCase()}`;
          const now = new Date().toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" });
          const row = (lbl, val) => val==null || val==="" ? "" : `<tr><td class="lbl">${lbl}</td><td class="val">${val}</td></tr>`;
          const w = window.open("", "_blank", "width=760,height=920");
          w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Reçu de paiement - ${nomAp}</title>
          <style>
            *{box-sizing:border-box}
            body{font-family:Arial,sans-serif;margin:0;padding:40px;color:#1e293b;background:#fff}
            .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #7c3aed;padding-bottom:20px;margin-bottom:28px}
            .logo{font-size:28px;font-weight:900;color:#7c3aed;letter-spacing:-1pxdisplay:flex;align-items:center;gap:11px}.logo::before{content:'';width:40px;height:40px;flex-shrink:0;background:#fff url('https://res.cloudinary.com/nvp7nxqp/image/upload/v1788473005/bet/branding/bet-logo.png') center / 28px 28px no-repeat;border-radius:9px;box-shadow:0 2px 7px rgba(0,0,0,.14)}
            .logo span{color:#0f172a}
            .logo-sub{font-size:11px;color:#6b7280;margin-top:4px;margin-left:51px}
            h2{margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a}
            .num{font-size:11px;color:#6b7280;margin-top:2px}
            section{margin-bottom:20px}
            .section-title{font-size:11px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;border-bottom:1px solid #ede9fe;padding-bottom:4px}
            table{width:100%;border-collapse:collapse}
            td{padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
            .lbl{color:#6b7280;font-weight:500;width:42%}
            .val{font-weight:600;color:#0f172a}
            .amount{text-align:center;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:18px;margin-bottom:20px}
            .amount .big{font-size:28px;font-weight:900;color:#15803d}
            .amount .tag{display:inline-block;margin-top:8px;background:#dcfce7;color:#166534;padding:4px 16px;border-radius:20px;font-weight:700;font-size:12px}
            .footer{margin-top:36px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center;line-height:1.7}
            @media print{body{padding:20px}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}}
          </style></head><body>
          <div class="header">
            <div>
              <div class="logo">BET<span>Languages</span></div>
              <div class="logo-sub">Centre de langues - Abidjan, Côte d'Ivoire</div>
              <div class="logo-sub" style="margin-top:2px">📧 contact@binniesenglish.com · 📞 +225 27 22 40 71 99</div>
            </div>
            <div style="text-align:right">
              <h2>REÇU DE PAIEMENT</h2>
              <div class="num">N° ${num}</div>
              <div class="num">Émis le ${now}</div>
            </div>
          </div>

          <div class="amount">
            <div class="big">${Number(p.montant_recu||0).toLocaleString("fr-FR")} FCFA</div>
            <div class="tag">✅ Paiement reçu</div>
          </div>

          <section><div class="section-title">👤 Client</div><table>
            ${row("Nom complet", nomAp)}
            ${row("Email", asg?.prospect_email)}
            ${row("Téléphone", asg?.prospect_telephone)}
          </table></section>

          <section><div class="section-title">💳 Détails du paiement</div><table>
            ${row("Offre", asg?.inscription_offre)}
            ${row("Mode", modeLabel)}
            ${row("Moyen de paiement", p.mode_paiement)}
            ${row("Date", p.date_paiement ? new Date(p.date_paiement).toLocaleDateString("fr-FR") : null)}
            ${row("Montant dû", p.montant_du ? `${Number(p.montant_du).toLocaleString("fr-FR")} FCFA` : null)}
            ${row("Montant reçu", `${Number(p.montant_recu||0).toLocaleString("fr-FR")} FCFA`)}
            ${row("Référence transaction", p.ref_transaction)}
            ${row("Notes", p.notes)}
          </table></section>

          <div class="footer">
            Ce reçu est généré automatiquement par le système BET Languages. Conservez ce document pour vos archives.<br/>
            BET Languages · Centre de langues agréé · Abidjan, Côte d'Ivoire<br/>
            contact@binniesenglish.com · +225 27 22 40 71 99
          </div>
          <script>window.onload=()=>window.print();</script>
          </body></html>`);
          w.document.close();
          toast.success("Reçu exporté en PDF");
        } catch (e) { toast.error("Erreur lors de l'export du reçu"); }
      };

      const TABS = [
        { id:"infos",       label:"📋 Informations" },
        { id:"presences",   label:"✅ Présences" },
        { id:"paiement",    label:"💳 Paiement" },
        { id:"notes",       label:"📝 Notes" },
      ];

      // Créer ou renvoyer les accès - utile ici car un apprenant en coaching privé
      // (routé par le PA) n'a jamais de commerciale dans son parcours pour le faire.
      const renvoyerAccesApprenant = async () => {
        if (paApprenantAccesCreating || emailAp === "-") return;
        setPaApprenantAccesCreating(true);
        try {
          const token = localStorage.getItem("admin_token");
          const nameParts = nomAp.trim().split(/\s+/);
          const r = await fetch(`${API_URL}/api/apprenants/creer-acces`, {
            method: "POST", headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
            body: JSON.stringify({
              nom:    nameParts.slice(-1)[0] || nomAp,
              prenom: nameParts.slice(0,-1).join(" ") || "",
              email:  emailAp,
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Erreur");
          if (d.mot_de_passe_conserve) {
            toast(`ℹ️ ${nomAp} a déjà son propre mot de passe (compte auto-inscrit) - non modifié.`);
            setPaApprenantAccesInfo(prev => ({ ...prev, has_account:true, profil:{ ...(prev?.profil||{}), mdp_temporaire:false, mdp_initial:null } }));
          } else {
            const ident = d.login_identifier || emailAp;
            toast.success(d.login_type === "telephone"
              ? `📧 Accès envoyés - identifiant : ${ident} (connexion par téléphone)`
              : d.login_type === "technique"
              ? `📧 Accès envoyés - identifiant technique : ${ident} (à communiquer manuellement)`
              : `📧 Accès envoyés à ${ident}`);
            setPaApprenantAccesInfo(prev => ({
              has_account: true,
              profil: { ...(prev?.profil||{}), id:d.user_id, email:d.login_email||emailAp, mdp_temporaire:true, mdp_initial:d.mdp_initial||null, actif:true, role:"apprenant", date_creation: prev?.profil?.date_creation || new Date().toISOString() },
            }));
          }
        } catch (e) { toast.error(e.message || "Erreur lors de l'envoi des accès"); }
        finally { setPaApprenantAccesCreating(false); }
      };

      const Card = ({ label, value, color="#0f172a", bg="#f8fafc", border="#e2e8f0" }) => (
        <div style={{ background:bg, borderRadius:8, padding:"10px 14px", border:`1px solid ${border}` }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>{label}</div>
          <div style={{ fontSize:13, fontWeight:700, color }}>{value||"-"}</div>
        </div>
      );

      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10002, padding:16 }}
          onClick={e=>{ if(e.target===e.currentTarget) closeModal(); }}>
          <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}
            onClick={e=>e.stopPropagation()}>

            {/* ── HEADER ── */}
            <div style={{ background:"linear-gradient(135deg,#0f172a,#4c1d95)", padding:"20px 24px", borderRadius:"16px 16px 0 0", display:"flex", alignItems:"center", gap:14, position:"sticky", top:0, zIndex:10, flexShrink:0 }}>
              <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:18, color:"#fff", flexShrink:0, overflow:"hidden", border:"2px solid rgba(255,255,255,0.3)" }}>
                {accesInfo?.profil?.avatar_url
                  ? <img src={accesInfo.profil.avatar_url} alt={initAp} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : initAp}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:17, fontWeight:800, color:"#fff" }}>{nomAp}</div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", display:"flex", gap:10, flexWrap:"wrap", marginTop:2 }}>
                  {emailAp !== "-" && <span>{emailAp}</span>}
                  {(ap.telephone||asg?.prospect_telephone) && <span>📞 {ap.telephone||asg.prospect_telephone}</span>}
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:5 }}>
                  {ap.niveau && <span style={{ background:"rgba(255,255,255,.18)", borderRadius:6, padding:"1px 8px", color:"#fff", fontWeight:700, fontSize:11 }}>{ap.niveau}</span>}
                  <span style={{ background:statutCfg.bg, color:statutCfg.color, borderRadius:6, padding:"1px 8px", fontWeight:700, fontSize:11 }}>{statutCfg.label}</span>
                  {accesBloque && <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:11, fontWeight:800, padding:"2px 10px" }}>🔒 Accès bloqué</span>}
                </div>
              </div>
              <button onClick={closeModal} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>
            </div>

            {/* ── ONGLETS ── */}
            <div style={{ display:"flex", borderBottom:"2px solid #e2e8f0", background:"#f8fafc", padding:"0 24px", flexWrap:"wrap", flexShrink:0 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={()=>{
                    setPaApprenantTab(t.id);
                    if (t.id==="notes" && paApprenantEvals.length===0 && ap.id) {
                      setPaApprenantEvalsLoading(true);
                      fetch(`${API_URL}/api/groupes/apprenants/${ap.id}/evaluations`, { headers: { Authorization:`Bearer ${localStorage.getItem("admin_token")}` } })
                        .then(r => r.ok ? r.json() : { evaluations: [] })
                        .then(d => setPaApprenantEvals(d.evaluations || []))
                        .catch(() => {})
                        .finally(() => setPaApprenantEvalsLoading(false));
                    }
                  }}
                  style={{ padding:"12px 14px", border:"none", background:"none", cursor:"pointer", fontSize:12, fontWeight:paApprenantTab===t.id?800:500,
                    color:paApprenantTab===t.id?PA_COLOR:"#64748b",
                    borderBottom:paApprenantTab===t.id?`2.5px solid ${PA_COLOR}`:"2.5px solid transparent",
                    marginBottom:-2, whiteSpace:"nowrap", flex:"1 1 110px", textAlign:"center" }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── CONTENU ── */}
            <div style={{ flex:1, overflowY:"auto", padding:"24px" }}>
              {paApprenantLoading ? (
                <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>⏳ Chargement…</div>
              ) : (
                <>
                  {/* ── INFORMATIONS ── */}
                  {paApprenantTab === "infos" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                      {/* ─ Ses tests de niveau ─ « Niveau » ci-dessous n'en montre qu'un,
                          celui du moment ; l'encart dit d'où il vient. Muet s'il n'y a
                          aucun test, pour ne pas alourdir une fiche déjà dense. */}
                      <HistoriqueTestsNiveau
                        apiUrl={API_URL}
                        authHeaders={authHeaders}
                        assignationId={asg?.id || null}
                        gaId={ap.id || null}
                        email={ap.email_apprenant || ap.email || null}
                        mode="compact"
                        titre="🎓 Tests de niveau"
                      />

                      {/* ─ Identité (toujours visible depuis groupes_apprenants) ─ */}
                      <div style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"14px 16px" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>👤 Identité</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:13 }}>
                          <div><span style={{ color:"#9ca3af", fontSize:11 }}>Prénom</span><br/><strong>{ap.prenom_apprenant||ap.prenom||"-"}</strong></div>
                          <div><span style={{ color:"#9ca3af", fontSize:11 }}>Nom</span><br/><strong>{ap.nom_apprenant||ap.nom||"-"}</strong></div>
                          <div><span style={{ color:"#9ca3af", fontSize:11 }}>Email</span><br/><strong style={{ wordBreak:"break-all" }}>{ap.email_apprenant||ap.email||"-"}</strong></div>
                          <div><span style={{ color:"#9ca3af", fontSize:11 }}>Téléphone</span><br/><strong>{ap.telephone||asg?.prospect_telephone||"-"}</strong></div>
                          <div><span style={{ color:"#9ca3af", fontSize:11 }}>Niveau</span><br/><strong>{ap.niveau||"-"}</strong></div>
                          <div><span style={{ color:"#9ca3af", fontSize:11 }}>Statut</span><br/>
                            <span style={{ background:statutCfg.bg, color:statutCfg.color, borderRadius:99, padding:"1px 8px", fontSize:11, fontWeight:700 }}>{statutCfg.label}</span>
                          </div>
                          {ap.date_ajout && <div style={{ gridColumn:"1/-1" }}><span style={{ color:"#9ca3af", fontSize:11 }}>Ajouté le</span><br/><strong>{new Date(ap.date_ajout).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</strong></div>}
                        </div>
                      </div>

                      {/* ─ Formation (depuis assignation) ─ */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                        <Card label="📚 Offre souscrite" value={asg?.inscription_offre} bg="#f0fdf4" border="#bbf7d0" color={asg?.inscription_offre?"#0f172a":"#94a3b8"} />
                        <Card label="🎯 Niveau évalué"  value={asg?.niveau_client||ap.niveau} bg="#faf5ff" border="#ddd6fe" color={asg?.niveau_client||ap.niveau?"#0f172a":"#94a3b8"} />
                        <Card label="📅 Date de début"
                          value={asg?.date_debut_formation ? new Date(asg.date_debut_formation).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}) : "Non renseignée"}
                          bg="#eff6ff" border="#bfdbfe" color={asg?.date_debut_formation?"#0f172a":"#94a3b8"} />
                        <Card label="💳 Statut paiement"
                          value={paiementCfg.label} bg={paiementCfg.bg} border={paiementCfg.color+"40"} color={paiementCfg.color} />
                      </div>

                      {/* L'OBJECTIF DU CLIENT, en pleine largeur et sous les cartes de
                          formation : c'est le seul champ de cette fiche que le conseiller
                          lit pour CHOISIR un coach, et une phrase entière ne tient pas dans
                          une demi-colonne. Quand il manque, on le dit - un objectif absent
                          se remarque alors au lieu de passer pour une case vide de plus. */}
                      <div style={{ marginTop:12, background: asg?.objectif_client ? "#f5f3ff" : "#fffbeb",
                        border:`1.5px solid ${asg?.objectif_client ? "#ddd6fe" : "#fde68a"}`, borderRadius:12, padding:"13px 16px" }}>
                        <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase",
                          color: asg?.objectif_client ? "#6d28d9" : "#92400e", marginBottom:5 }}>
                          🎯 Objectif du client
                        </div>
                        <div style={{ fontSize:13.5, lineHeight:1.65, whiteSpace:"pre-wrap",
                          color: asg?.objectif_client ? "#0f172a" : "#92400e" }}>
                          {asg?.objectif_client
                            || "Non renseigné — demandez-le à l'assistante avant d'affecter un coach."}
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                        {[
                          ["Mode de cours",   modeLabel !== "-" ? modeLabel : paLibelleType(paSelectedGroupe)],
                          ["Coaching",        asg?.type_coaching==="groupe"?"Groupe":asg?.type_coaching==="prive"?"Privé":"Groupe"],
                          ["Source",          asg?.source||"-"],
                          ["Objectif",        asg?.objectif_client||"-"],
                          ["Date inscription",asg?.created_at ? new Date(asg.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "-"],
                        ].map(([l,v]) => <Card key={l} label={l} value={v} />)}
                      </div>
                      {ap.note && (
                        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"12px 14px" }}>
                          <div style={{ fontSize:11, fontWeight:700, color:"#92400e", marginBottom:4 }}>📝 Note interne</div>
                          <div style={{ fontSize:13, color:"#78350f" }}>{ap.note}</div>
                        </div>
                      )}
                      {/* Groupe / Coach */}
                      <div style={{ background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 16px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>🏫 Affectation groupe</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12 }}>
                          <div><span style={{ color:"#9ca3af" }}>Groupe : </span><strong>{paSelectedGroupe?.nom||"-"}</strong></div>
                          <div><span style={{ color:"#9ca3af" }}>Niveau : </span><strong>{paSelectedGroupe?.niveau||"-"}</strong></div>
                          <div><span style={{ color:"#9ca3af" }}>Coach : </span>
                            <strong style={{ color:paSelectedGroupe?.coach_nom?"#0f172a":"#f59e0b" }}>
                              {paSelectedGroupe?.coach_nom||"⚠ Non assigné"}
                            </strong>
                          </div>
                          <div><span style={{ color:"#9ca3af" }}>Ajouté le : </span><strong>{ap.date_ajout?new Date(ap.date_ajout).toLocaleDateString("fr-FR"):"-"}</strong></div>
                        </div>
                      </div>

                      {/* Équipe assignée - assistante, onboarding, coach avec contact direct. */}
                      {(() => {
                        const assistNom = ap.assistante_nom || (asg?.assistantes ? `${asg.assistantes.prenom||""} ${asg.assistantes.nom||""}`.trim() : null);
                        const EQUIPE = [
                          { titre:"Assistante", icone:"💼", nom: assistNom, email: asg?.assistante_email, tel: asg?.assistante_tel || ap.assistante_tel, photo: asg?.assistante_photo },
                          { titre:"Onboarding", icone:"🚀", nom: asg?.onboarding_nom, email: asg?.onboarding_email, tel: asg?.onboarding_telephone },
                          { titre:"Coach",      icone:"👨‍🏫", nom: paSelectedGroupe?.coach_nom, email: paSelectedGroupe?.coach_email, tel: paSelectedGroupe?.coach_telephone, photo: paSelectedGroupe?.coach_photo_url },
                        ];
                        return (
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                            {EQUIPE.map(m => (
                              <div key={m.titre} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px" }}>
                                <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>{m.icone} {m.titre}</div>
                                {m.nom ? (
                                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                    <div style={{ width:32, height:32, borderRadius:"50%", background:`${PA_COLOR}18`, color:PA_COLOR, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:12, flexShrink:0, overflow:"hidden" }}>
                                      {m.photo ? <img src={m.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : m.nom.split(" ").map(w=>w[0]||"").join("").toUpperCase().slice(0,2)}
                                    </div>
                                    <div style={{ minWidth:0 }}>
                                      <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.nom}</div>
                                      {m.tel && <div style={{ fontSize:10, color:"#0891b2" }}>📞 {m.tel}</div>}
                                      {m.email && <div style={{ fontSize:10, color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>✉️ {m.email}</div>}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ fontSize:12, color:"#cbd5e1", fontStyle:"italic" }}>Non affecté</div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {/* Parent si mineur */}
                      {(asg?.nom_parent||asg?.telephone_parent) && (
                        <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"12px 16px" }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#15803d", marginBottom:8 }}>👨‍👩‍👧 Informations parent</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12 }}>
                            {asg.nom_parent && <div><span style={{ color:"#9ca3af" }}>Nom : </span><strong>{asg.nom_parent}</strong></div>}
                            {asg.telephone_parent && <div><span style={{ color:"#9ca3af" }}>Tél : </span><strong>{asg.telephone_parent}</strong></div>}
                            {asg.email_parent && <div><span style={{ color:"#9ca3af" }}>Email : </span><strong>{asg.email_parent}</strong></div>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* ── PROGRESSION ── */}
                  {/* ── PRÉSENCES ── */}
                  {paApprenantTab === "presences" && (() => {
                    const pointees = paApprenantPresencesReelles.filter(p => ["present","absent","retard","excuse"].includes(p.statut));
                    const nbPresent = pointees.filter(p=>p.statut==="present").length;
                    const taux = pointees.length ? Math.round(nbPresent/pointees.length*100) : null;
                    const STATUT_P = {
                      present:{ label:"Présent", bg:"#dcfce7", c:"#166534" }, absent:{ label:"Absent", bg:"#fee2e2", c:"#991b1b" },
                      retard:{ label:"En retard", bg:"#fef3c7", c:"#92400e" }, excuse:{ label:"Excusé", bg:"#dbeafe", c:"#1e40af" },
                      planifiee:{ label:"Planifiée", bg:"#e0e7ff", c:"#3730a3" },
                    };
                    return (
                      <div>
                        {paApprenantPresencesLoading ? (
                          <div style={{ textAlign:"center", padding:"32px 0", color:"#9ca3af", fontSize:13 }}>Chargement…</div>
                        ) : paApprenantPresencesReelles.length === 0 ? (
                          <div style={{ textAlign:"center", padding:"40px 0", color:"#94a3b8", fontSize:13 }}>Aucune feuille de présence enregistrée pour cet apprenant.</div>
                        ) : (
                          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                              <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px", textAlign:"center", border:"1px solid #e5e7eb" }}>
                                <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, marginBottom:4 }}>Séances</div>
                                <div style={{ fontSize:24, fontWeight:900, color:"#0f172a" }}>{paApprenantPresencesReelles.length}</div>
                              </div>
                              <div style={{ background:"#f0fdf4", borderRadius:10, padding:"12px", textAlign:"center", border:"1px solid #bbf7d0" }}>
                                <div style={{ fontSize:10, color:"#15803d", fontWeight:700, marginBottom:4 }}>Présences</div>
                                <div style={{ fontSize:24, fontWeight:900, color:"#0f172a" }}>{nbPresent}</div>
                              </div>
                              <div style={{ background:"#fef2f2", borderRadius:10, padding:"12px", textAlign:"center", border:"1px solid #fca5a5" }}>
                                <div style={{ fontSize:10, color:"#b91c1c", fontWeight:700, marginBottom:4 }}>Taux</div>
                                <div style={{ fontSize:24, fontWeight:900, color:taux>=80?"#15803d":taux>=60?"#d97706":"#ef4444" }}>{taux!==null?`${taux}%`:"-"}</div>
                              </div>
                            </div>
                            <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
                              <div style={{ padding:"8px 14px", background:"#f8fafc", fontSize:11, fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0" }}>Liste des séances</div>
                              {[...paApprenantPresencesReelles].sort((a,b)=>b.date_seance?.localeCompare(a.date_seance||"")||0).map((p,i) => {
                                const st = STATUT_P[p.statut] || { label:p.statut, bg:"#f3f4f6", c:"#374151" };
                                return (
                                  <div key={p.id||i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", borderBottom:i<paApprenantPresencesReelles.length-1?"1px solid #f1f5f9":"none" }}>
                                    <span style={{ fontSize:12, color:"#374151", flex:1 }}>{p.date_seance?new Date(p.date_seance).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",year:"numeric"}):"-"}</span>
                                    <span style={{ fontSize:11, fontWeight:700, color:st.c, padding:"2px 10px", borderRadius:999, background:st.bg }}>{st.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── PAIEMENT ── */}
                  {paApprenantTab === "paiement" && (
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {/* Résumé statut */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                        <Card label="Statut paiement" value={paiementCfg.label} bg={paiementCfg.bg} border={paiementCfg.color+"40"} color={paiementCfg.color} />
                        <Card label="Montant payé" value={asg?.montant_paye ? `${Number(asg.montant_paye).toLocaleString("fr-FR")} F` : "-"} bg="#f0fdf4" border="#bbf7d0" color="#15803d" />
                        <Card label="Mode paiement" value={asg?.mode_paiement||"-"} />
                      </div>
                      {/* Plan mensuel */}
                      {moisPaiements.length > 0 && (
                        <div style={{ borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
                          <div style={{ padding:"10px 16px", background:"#f8fafc", fontSize:12, fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0" }}>📅 Plan mensuel</div>
                          {moisPaiements.map((mois, idx) => {
                            const tPaye = (mois.tranches||[]).filter(t=>(t.statut==="paye"||t.statut==="payé")).reduce((s,t)=>s+(t.montant||0),0);
                            // Un mois gelé a un montant ramené à 0 : sans traitement à part il
                            // tombe dans « payé » et s'affiche ✅ en vert, indiscernable d'un mois
                            // réellement encaissé. On le sort donc de la logique de statut.
                            const gele   = !!mois.neutralise;
                            const statut = tPaye >= mois.montant ? "paye" : tPaye > 0 ? "partiel" : "en_attente";
                            const siCfg = gele ? { icon:"❄️", c:"#0369a1", bg:"#f0f9ff" }
                              : statut==="paye" ? { icon:"✅", c:"#15803d", bg:"#f0fdf4" } : statut==="partiel" ? { icon:"⏳", c:"#0891b2", bg:"#eff6ff" } : { icon:"⏳", c:"#d97706", bg:"#fffbeb" };
                            return (
                              <div key={mois.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderBottom:idx<moisPaiements.length-1?"1px solid #f1f5f9":"none", background:siCfg.bg }}>
                                <span style={{ fontSize:16 }}>{siCfg.icon}</span>
                                <div style={{ flex:1, fontSize:13, fontWeight:700, color:"#0f172a" }}>
                                  {mois.label}
                                  {gele && <span style={{ marginLeft:8, fontSize:10.5, fontWeight:700, color:"#0369a1", background:"#e0f2fe", padding:"2px 8px", borderRadius:999 }}>Gelé - non dû</span>}
                                </div>
                                {statut==="partiel" && !gele && <div style={{ fontSize:11, color:"#0891b2" }}>{Number(tPaye).toLocaleString("fr-FR")} / {Number(mois.montant).toLocaleString("fr-FR")} F</div>}
                                {gele && mois.montant_initial > mois.montant && (
                                  <div style={{ fontSize:11.5, color:"#94a3b8", textDecoration:"line-through" }}>{Number(mois.montant_initial).toLocaleString("fr-FR")} F</div>
                                )}
                                <div style={{ fontSize:13, fontWeight:800, color:siCfg.c }}>{Number(mois.montant).toLocaleString("fr-FR")} F</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Tranches échelonnées */}
                      {tranches.length > 0 && (
                        <div>
                          <div style={{ fontSize:12, fontWeight:800, color:"#374151", marginBottom:8 }}>📅 Tranches échelonnées</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                            {tranches.map((t,i) => {
                              const estPaye = t.statut==="payé" || t.statut==="paye";
                              const d = new Date(t.date_echeance); d.setHours(0,0,0,0);
                              const isLate = !estPaye && d < today2;
                              return (
                                <div key={t.id||i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10, border:`1.5px solid ${estPaye?"#bbf7d0":isLate?"#fca5a5":"#e2e8f0"}`, background:estPaye?"#f0fdf4":isLate?"#fef2f2":"#fff" }}>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontSize:12, fontWeight:800, color:"#0f172a" }}>{t.label}</div>
                                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{Number(t.montant).toLocaleString("fr-FR")} F · Échéance : {t.date_echeance}</div>
                                  </div>
                                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, color:estPaye?"#15803d":isLate?"#b91c1c":"#d97706", background:estPaye?"#dcfce7":isLate?"#fee2e2":"#fef3c7" }}>
                                    {estPaye?"✅ Payé":isLate?"⛔ Retard":"⏳ En attente"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* Versements - historique réel avec source/mode de chaque paiement */}
                      <div style={{ borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
                        <div style={{ padding:"10px 16px", background:"#f8fafc", fontSize:12, fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0" }}>
                          💳 Versements enregistrés {loadingPaiements ? "(…)" : `(${apprenantPaiements.length})`}
                        </div>
                        {!loadingPaiements && apprenantPaiements.length === 0 && (
                          <div style={{ textAlign:"center", padding:"24px 0", color:"#9ca3af", fontSize:12 }}>Aucun versement enregistré.</div>
                        )}
                        {!loadingPaiements && apprenantPaiements.length > 0 && (
                          <div>
                            {apprenantPaiements.map((p,i) => (
                              <div key={p.id||i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderBottom:i<apprenantPaiements.length-1?"1px solid #f1f5f9":"none", background:i%2===0?"#fff":"#fafafa" }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>{Number(p.montant_recu||0).toLocaleString("fr-FR")} F</div>
                                  <div style={{ fontSize:10.5, color:"#94a3b8", marginTop:1 }}>Encaissé le {p.date_paiement ? new Date(p.date_paiement).toLocaleDateString("fr-FR") : "-"} · {p.mode_paiement||"Mode inconnu"}{p.ref_transaction?" · Réf: "+p.ref_transaction:""}</div>
                                  {/* Le mois soldé diffère de la date d'encaissement dès qu'il y a
                                      échelonnement : sans le dire, les deux se confondent. */}
                                  {(()=>{ const lbl=libelleMoisSolde(p, plan); return lbl
                                    ? <div style={{ fontSize:10, fontWeight:700, color:"#0369a1", marginTop:2 }}>{lbl}</div>
                                    : null; })()}
                                </div>
                                <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, color: p.statut==="paye"?"#15803d":p.statut==="partiel"?"#0891b2":"#d97706", background: p.statut==="paye"?"#dcfce7":p.statut==="partiel"?"#e0f2fe":"#fef3c7" }}>
                                  {p.statut==="paye"?"✅ Payé":p.statut==="partiel"?"⏳ Partiel":"⏳ En attente"}
                                </span>
                                <button onClick={() => exporterRecuPaiementPDF(p)} title="Générer le reçu PDF"
                                  style={{ flexShrink:0, padding:"5px 8px", background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:6, cursor:"pointer", fontSize:12, lineHeight:1 }}>
                                  📄
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Accès bloqué */}
                      <div style={{ borderRadius:10, border:`1.5px solid ${accesBloque?"#fca5a5":"#e2e8f0"}`, background:accesBloque?"#fef2f2":"#f8fafc", padding:"12px 16px" }}>
                        <div style={{ fontWeight:800, color:"#0f172a", fontSize:13 }}>{accesBloque?"🔒 Accès formation bloqué":"🔓 Accès formation actif"}</div>
                        <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{accesBloque?"L'apprenant ne peut plus accéder à ses cours.":"L'apprenant a accès à tous ses cours."}</div>
                      </div>
                    </div>
                  )}

                  {/* ── NOTES DE CLASSE (évaluées par le coach) ── */}
                  {paApprenantTab === "notes" && (
                    <div>
                      {paApprenantEvalsLoading ? (
                        <div style={{ textAlign:"center", padding:"32px 0", color:"#9ca3af", fontSize:13 }}>Chargement…</div>
                      ) : paApprenantEvals.length === 0 ? (
                        <div style={{ textAlign:"center", padding:"60px 20px", background:"#f8fafc", borderRadius:14, border:"1px solid #e5e7eb" }}>
                          <div style={{ fontSize:42, marginBottom:10 }}>📝</div>
                          <div style={{ fontWeight:700, color:"#0f172a", marginBottom:4 }}>Aucune évaluation publiée</div>
                          <p style={{ color:"#9ca3af", fontSize:13 }}>Le coach publie et corrige les évaluations depuis son espace.</p>
                        </div>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {paApprenantEvals.map(ev => {
                            const r = ev.resultat || {};
                            const ST = {
                              a_faire: { label:"À faire",  bg:"#f1f5f9", c:"#64748b" },
                              rendu:   { label:"Rendu",    bg:"#e0f2fe", c:"#0891b2" },
                              corrige: { label:"Corrigé",  bg:"#dcfce7", c:"#16a34a" },
                            };
                            const st = ST[r.statut] || ST.a_faire;
                            return (
                              <div key={ev.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", borderRadius:10, border:"1px solid #e2e8f0", background:"#fff" }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                    <span style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{ev.titre || "Évaluation"}</span>
                                    <span style={{ fontSize:10, background:"#ede9fe", color:"#6d28d9", padding:"2px 8px", borderRadius:5, fontWeight:600 }}>{ev.type_evaluation || "devoir"}</span>
                                    <span style={{ fontSize:10, background:st.bg, color:st.c, padding:"2px 8px", borderRadius:5, fontWeight:700 }}>{st.label}</span>
                                  </div>
                                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>
                                    {ev.date_evaluation ? new Date(ev.date_evaluation).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "-"}
                                  </div>
                                  {r.commentaire_coach && (
                                    <div style={{ fontSize:12, color:"#6b7280", marginTop:6, fontStyle:"italic" }}>💬 {r.commentaire_coach}</div>
                                  )}
                                </div>
                                <div style={{ textAlign:"center", flexShrink:0 }}>
                                  <div style={{ fontSize:18, fontWeight:900, color: r.note!=null ? "#0f172a" : "#cbd5e1" }}>
                                    {r.note!=null ? r.note : "-"}<span style={{ fontSize:11, fontWeight:600, color:"#94a3b8" }}>/{r.note_max ?? ev.note_max ?? "-"}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      );
    })()}

      {/* ══ MODAL APPRENANT ══ */}
      {apprenantModal && (() => {
        const a = apprenantModal;
        const initiales = (a.prospect_nom||"?").split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase();
        const sd = a.suivi_demarrage || {};
        const NIVEAU_COLOR = { A1:"#6b7280",A2:"#0891b2",B1:"#16a34a",B2:"#7c3aed",C1:"#d97706",C2:"#dc2626" };
        const niveauColor = NIVEAU_COLOR[sd.niveau_prospect] || "#6b7280";
        const plan = a.plan_paiement || {};
        const tranches = plan.tranches || [];
        const today = new Date(); today.setHours(0,0,0,0);
        const tranchesPaye  = tranches.filter(t=>t.statut==="payé"||t.statut==="paye").reduce((s,t)=>s+(t.montant||0),0);
        const tranchesTotal = tranches.reduce((s,t)=>s+(t.montant||0),0);
        const isSolde = tranchesTotal>0 && tranchesPaye>=tranchesTotal;
        const sp = a.suivi_presences || {};
        const sessions = sp.sessions || [];
        // Séances réellement enregistrées par le coach (table unifiée `seances` /
        // seances_privees, cf. paSeancesPrivees) - prioritaire sur suivi_presences, un blob
        // JSON manuel jamais alimenté par le travail réel du coach. Sans ça, l'onglet
        // "Séances" affiche le bon compte (3) alors que "Suivi"/"Progression" affichent 0.
        const seancesReelles = paSeancesPrivees.filter(s=>s.statut==="effectuee").length;
        const seancesCnt = seancesReelles || sp.seances_effectuees || sessions.length || 0;
        const presencesReelles = paPresencesPrivees.filter(p=>p.statut==="present").length;
        const absReelles = paPresencesPrivees.filter(p=>p.statut==="absent").length;
        const presences = paPresencesPrivees.length>0 ? presencesReelles : (sp.presences || 0);
        const abs = paPresencesPrivees.length>0 ? absReelles : (sp.absences || 0);
        const totalPresences = presences + abs;
        const tauxPart = totalPresences>0 ? Math.round((presences/totalPresences)*100) : null;
        const tauxAbs  = totalPresences>0 ? Math.round((abs/totalPresences)*100) : null;

        const MODAL_TABS = [
          { id:"infos",       label:"📋 Informations" },
          { id:"suivi",       label:"📊 Suivi assiduité" },
          // Le niveau conditionne tout le travail pédagogique : il mérite son onglet, pas une
          // ligne dans « Informations » qui n'en montrait qu'un seul, le dernier.
          { id:"niveau",      label:`🎓 Tests de niveau${paTestsNiveau.length ? ` (${paTestsNiveau.length})` : ""}` },
          { id:"seances_coach", label:`📆 Séances${paSeancesPrivees.length>0?" ("+paSeancesPrivees.length+")":""}` },
          { id:"paiement",    label:"💳 Paiement" },
          { id:"progression", label:"📈 Progression" },
          // Disponibilités = créneaux souhaités pour caler des séances individuelles -
          // n'existe que pour le coaching privé ; un apprenant en groupe suit l'horaire
          // fixe de sa classe, l'onglet n'a donc aucun sens pour lui (cf. "Modifier le
          // dossier" / bloc "Formation suivie", même restriction plus haut).
          ...(a.type_coaching === "prive" ? [{ id:"dispo", label:"📅 Disponibilités" }] : []),
          { id:"notes",       label:"📝 Notes" },
          { id:"chat",        label:"💬 Chat" },
        ];

        // Notes = évaluations de classe (coach), indexées par ga_id (groupes_apprenants.id),
        // pas par assignation_id. a.groupe_id (résolu côté backend via le lien posé dans
        // groupes_apprenants.note à la création de la classe) est absent pour tout apprenant
        // ajouté à son groupe sans ce lien (note vide) - cas réel constaté (ex. Fode Doumbia,
        // ajouté directement à sa classe présentiel). On résout donc systématiquement le
        // ga_id par email via apprenant-by-email, robuste indépendamment de ce lien, avec
        // a.groupe_id comme simple repli si l'email ne donne rien.
        const chargerEvalsApprenant = async () => {
          if (appModalEvalsLoading || appModalEvals.length > 0) return;
          setAppModalEvalsLoading(true);
          try {
            let gaId = null;
            if (a.prospect_email) {
              const rByEmail = await fetch(`${API_URL}/api/groupes/apprenant-by-email?email=${encodeURIComponent(a.prospect_email)}`, { headers: authHeaders() });
              const dByEmail = await rByEmail.json();
              gaId = dByEmail?.groupe?.ga_id || null;
            }
            if (!gaId && a.groupe_id) {
              const rG = await fetch(`${API_URL}/api/groupes/${a.groupe_id}`, { headers: authHeaders() });
              const dG = await rG.json();
              const emailRef = (a.prospect_email || "").toLowerCase();
              const gaMatch = (dG.apprenants || []).find(x => (x.email_apprenant || "").toLowerCase() === emailRef)
                || (dG.apprenants || []).find(x => `${x.prenom_apprenant||""} ${x.nom_apprenant||""}`.trim() === (a.prospect_nom||"").trim());
              gaId = gaMatch?.id || null;
            }
            if (!gaId) { setAppModalEvals([]); return; }
            const rE = await fetch(`${API_URL}/api/groupes/apprenants/${gaId}/evaluations`, { headers: authHeaders() });
            const dE = await rE.json();
            setAppModalEvals(dE.evaluations || []);
          } catch { setAppModalEvals([]); }
          finally { setAppModalEvalsLoading(false); }
        };

        const handleAddSession = async () => {
          if (sessionActionSaving) return;
          setSessionActionSaving(true);
          try {
            const newSessions = [...sessions, { date:sessionForm.date, statut:sessionForm.statut }];
            const newPresences = newSessions.filter(s=>s.statut==="present").length;
            const newAbs       = newSessions.filter(s=>s.statut==="absent").length;
            const newSp = { ...sp, sessions:newSessions, seances_effectuees:newSessions.length, presences:newPresences, absences:newAbs };
            await handleSavePresencesPA(a.id, newSp);
            setAddingSession(false);
          } finally { setSessionActionSaving(false); }
        };

        const handleDeleteSession = async (idx) => {
          if (sessionActionSaving) return;
          setSessionActionSaving(true);
          try {
            const newSessions = sessions.filter((_,i)=>i!==idx);
            const newPresences = newSessions.filter(s=>s.statut==="present").length;
            const newAbs       = newSessions.filter(s=>s.statut==="absent").length;
            const newSp = { ...sp, sessions:newSessions, seances_effectuees:newSessions.length, presences:newPresences, absences:newAbs };
            await handleSavePresencesPA(a.id, newSp);
          } finally { setSessionActionSaving(false); }
        };

        /* FICHE APPRENANT — même gabarit que celles de la commerciale et de l'Onboarding.
           Elle était la seule à sortir de jsPDF : tableaux bruts, sans en-tête BET, sans
           bandeau de titre. Trois services produisant le même document ne peuvent pas le
           produire sous trois apparences - un apprenant qui reçoit l'une puis l'autre y voit
           deux entreprises. `genererPDF` (utils/genererPDF.js) porte la charte commune, et
           ce fichier l'importait déjà sans s'en servir ici. */
        const exporterFicheApprenantPDF = () => {
          try {
            const num = `BET-FA-${String(a.id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
            const infoRow = (lbl, val) => val == null || val === "" ? "" :
              `<div class="info-row"><span class="info-label">${lbl}</span><span class="info-value">${val}</span></div>`;
            const section = (titre, lignes) => {
              const corps = lignes.filter(Boolean).join("");
              return corps ? `<div class="section-title">${titre}</div><div class="info-grid">${corps}</div>` : "";
            };
            const tableau = (titre, entetes, lignes) => {
              if (!lignes.length) return "";
              return `<div class="section-title">${titre}</div>
                <table><thead><tr>${entetes.map(h => `<th>${h}</th>`).join("")}</tr></thead>
                <tbody>${lignes.map(l => `<tr>${l.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
            };
            const objectif = (a.objectif_client || "").trim();

            genererPDF(`
              <div class="doc-header">
                <div>
                  <div class="doc-header-logo">BET Languages</div>
                  <div class="doc-header-sub">Centre de langues - Abidjan, Côte d'Ivoire</div>
                  <div class="doc-header-sub">📧 contact@binniesenglish.com · 📞 +225 27 22 40 71 99</div>
                </div>
                <div class="doc-header-right">
                  N° ${num}<br/>Émise le ${fmtDatePDF(new Date().toISOString())}
                </div>
              </div>
              <div class="doc-title-band">👤 FICHE APPRENANT - ${a.prospect_nom || ""}</div>
              <div class="doc-body">

                ${section("👤 Informations personnelles", [
                  infoRow("Nom complet", a.prospect_nom),
                  infoRow("Email", a.prospect_email),
                  infoRow("Téléphone", a.prospect_telephone),
                  infoRow("Niveau", sd.niveau_prospect || a.niveau_client),
                  infoRow("Type de coaching", a.type_coaching === "prive" ? "Privé" : "Groupe"),
                  infoRow("Conseiller PA", [profil?.prenom, profil?.nom].filter(Boolean).join(" ") || null),
                ])}

                ${/* Pleine largeur, hors de la grille à deux colonnes : c'est une phrase,
                      et la seule information de cette fiche qui dise POURQUOI la personne
                      est là. Absent = signalé, pour qu'un oubli se voie. */
                  objectif
                    ? `<div class="section-title">🎯 Objectif du client</div>
                       <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:12px 16px;font-size:13px;line-height:1.65;color:#0F172A;white-space:pre-wrap">${objectif}</div>`
                    : `<div class="section-title">🎯 Objectif du client</div>
                       <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;font-size:12.5px;color:#92400E">Non renseigné — à demander à l'assistante commerciale.</div>`}

                ${/* TOUS SES PASSAGES. Ce document sert à cadrer le travail pédagogique :
                      « A2 → B1 » dit que l'apprenant a progressé et justifie le changement de
                      classe, là où le niveau seul le laisse tomber du ciel. */""}
                ${tableau("📝 Tests de niveau", ["Date","Niveau","Score","Origine"],
                  lignesTestsPourPDF(paTestsNiveau))}

                <div class="section-title">📅 Assiduité</div>
                <div class="kpi-row">
                  <div class="kpi-card"><div class="kpi-val">${seancesCnt}</div><div class="kpi-lbl">Séances</div></div>
                  <div class="kpi-card"><div class="kpi-val">${presences}</div><div class="kpi-lbl">Présences</div></div>
                  <div class="kpi-card"><div class="kpi-val">${abs}</div><div class="kpi-lbl">Absences</div></div>
                  <div class="kpi-card"><div class="kpi-val">${tauxPart !== null ? tauxPart + "%" : "-"}</div><div class="kpi-lbl">Taux de présence</div></div>
                </div>

                ${a.type_coaching === "prive"
                  ? tableau("🗓 Détail des séances", ["Date","Heure","Durée","Lieu","Statut","Notes"],
                      [...paSeancesPrivees]
                        .sort((x, y2) => y2.date_seance.localeCompare(x.date_seance))
                        .map(s => [
                          s.date_seance ? fmtDatePDF(s.date_seance) : "-",
                          s.heure_debut ? s.heure_debut.slice(0, 5) : "-",
                          s.duree_h ? `${s.duree_h}h` : "-",
                          s.lieu === "domicile" ? "Domicile" : s.lieu === "en_ligne" ? "En ligne" : "Cabinet",
                          s.statut || "-",
                          s.notes || "-",
                        ]))
                  : ""}

                <div class="section-title">💰 Paiement</div>
                <div class="kpi-row">
                  <div class="kpi-card"><div class="kpi-val">${tranchesTotal ? tranchesTotal.toLocaleString("fr-FR") : 0}</div><div class="kpi-lbl">Total plan (FCFA)</div></div>
                  <div class="kpi-card"><div class="kpi-val">${tranchesPaye ? tranchesPaye.toLocaleString("fr-FR") : 0}</div><div class="kpi-lbl">Déjà payé (FCFA)</div></div>
                  <div class="kpi-card"><div class="kpi-val">${tranches.length}</div><div class="kpi-lbl">Échéances</div></div>
                  <div class="kpi-card"><div class="kpi-val">${isSolde ? "Soldé" : tranchesTotal ? "En cours" : "-"}</div><div class="kpi-lbl">Statut</div></div>
                </div>

                ${tableau("💳 Échéances", ["Échéance","Montant","Statut"],
                  tranches.map(t => [
                    t.date_echeance ? fmtDatePDF(t.date_echeance) : "-",
                    t.montant ? `${Number(t.montant).toLocaleString("fr-FR")} FCFA` : "-",
                    t.statut || "-",
                  ]))}

                ${tableau("📝 Évaluations", ["Évaluation","Date","Note","Commentaire"],
                  appModalEvals.map(ev => {
                    const r = ev.resultat || {};
                    return [
                      ev.titre || "Évaluation",
                      ev.date_evaluation ? fmtDatePDF(ev.date_evaluation) : "-",
                      r.note != null ? `${r.note}/${r.note_max ?? ev.note_max ?? "-"}` : "-",
                      r.commentaire_coach || "-",
                    ];
                  }))}

                <div class="doc-footer">
                  <span>BET Languages · Centre de langues agréé · Abidjan, Côte d'Ivoire</span>
                  <span>contact@binniesenglish.com · +225 27 22 40 71 99</span>
                </div>
              </div>
            `, `Fiche apprenant - ${a.prospect_nom || ""}`);
            toast.success("Fiche apprenant exportée en PDF");
          } catch (e) {
            console.error("Fiche apprenant PA:", e);
            toast.error("Erreur lors de l'export PDF");
          }
        };

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}
            onClick={()=>{ setApprenantModal(null); setPaSeancesPrivees([]); setPaPresencesPrivees([]); }}>
            <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.25)", display:"flex", flexDirection:"column" }}
              onClick={e=>e.stopPropagation()}>

              {/* Header gradient */}
              <div style={{ background:PA_GRADIENT, padding:"20px 26px", borderRadius:"18px 18px 0 0", display:"flex", alignItems:"center", gap:14, position:"sticky", top:0, zIndex:10, flexShrink:0 }}>
                <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:18, color:"#fff", flexShrink:0, overflow:"hidden" }}>{a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:17, fontWeight:800, color:"#fff" }}>{a.prospect_nom||"-"}</div>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", display:"flex", gap:12, flexWrap:"wrap", marginTop:2 }}>
                    {a.prospect_email && <span>{a.prospect_email}</span>}
                    {a.prospect_telephone && <span>📞 {a.prospect_telephone}</span>}
                    {sd.niveau_prospect && <span style={{ background:niveauColor, color:"#fff", borderRadius:99, padding:"1px 8px", fontWeight:800, fontSize:11 }}>{sd.niveau_prospect}</span>}
                  </div>
                </div>
                <span style={{ fontSize:11, fontWeight:800, padding:"4px 12px", borderRadius:999, background:"#dcfce7", color:"#15803d" }}>✅ Apprenant</span>
                <button onClick={exporterFicheApprenantPDF} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"rgba(255,255,255,0.15)", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 }}>📄 Export PDF</button>
                <button onClick={()=>{ setApprenantModal(null); setPaSeancesPrivees([]); setPaPresencesPrivees([]); }} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:16, flexShrink:0 }}>✕</button>
              </div>

              {/* Onglets */}
              <div style={{ display:"flex", borderBottom:"2px solid #e2e8f0", background:"#f8fafc", padding:"0 24px", flexShrink:0, overflowX:"auto" }}>
                {MODAL_TABS.map(t=>(
                  <button key={t.id} onClick={()=>{ setApprenantTab(t.id); if (t.id==="notes") chargerEvalsApprenant(); }}
                    style={{ padding:"12px 16px", border:"none", background:"none", cursor:"pointer", fontSize:13, fontWeight:apprenantTab===t.id?800:500, color:apprenantTab===t.id?PA_COLOR:"#64748b", borderBottom:apprenantTab===t.id?`2.5px solid ${PA_COLOR}`:"2.5px solid transparent", marginBottom:-2, whiteSpace:"nowrap" }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Contenu */}
              <div style={{ padding:"24px", flex:1 }}>

                {/* ─── INFOS ─── */}
                {apprenantTab === "infos" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {/* Bloc formation mis en avant - coaching privé uniquement : ces champs
                        (formation_souhaitee, lieu_coaching, coût...) viennent du formulaire
                        "Modifier le dossier" propre au privé et ne sont jamais renseignés pour
                        un apprenant en coaching de groupe (assigné via une classe), donc inutile
                        de lui afficher un avertissement à leur sujet. */}
                    {a.type_coaching === "prive" && (sd.formation_souhaitee ? (
                      <div style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", borderRadius:12, padding:"16px 18px", border:"1.5px solid #c4b5fd" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:PA_COLOR, textTransform:"uppercase", letterSpacing:".06em", marginBottom:8 }}>📚 Formation suivie</div>
                        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                          <div style={{ fontSize:16, fontWeight:900, color:"#0f172a" }}>{sd.formation_souhaitee}</div>
                          {sd.niveau_prospect && (
                            <span style={{ fontSize:12, fontWeight:800, padding:"3px 12px", borderRadius:999, background:niveauColor, color:"#fff" }}>Niveau {sd.niveau_prospect}</span>
                          )}
                          {sd.nb_seances_souhaitees && (
                            <span style={{ fontSize:12, fontWeight:700, color:"#6d28d9", background:"#ede9fe", padding:"3px 10px", borderRadius:999 }}>📅 {sd.nb_seances_souhaitees} mois</span>
                          )}
                        </div>
                        <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:8 }}>
                          {sd.lieu_coaching && (
                            <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:999, background: sd.lieu_coaching==="domicile"?"#fef3c7":"#e0f2fe", color: sd.lieu_coaching==="domicile"?"#d97706":"#0369a1" }}>
                              {sd.lieu_coaching==="domicile" ? "🏠 À domicile" : "🏢 Au cabinet"}
                            </span>
                          )}
                          {sd.lieu_coaching==="domicile" && sd.adresse_coaching && (
                            <span style={{ fontSize:11, color:"#374151", fontStyle:"italic" }}>📍 {sd.adresse_coaching}</span>
                          )}
                          {sd.lieu_coaching==="cabinet" && sd.centre_coaching && (
                            <span style={{ fontSize:11, fontWeight:700, color:"#0369a1" }}>
                              {paCentresList.find(c=>c.key===sd.centre_coaching)?.name || sd.centre_coaching}
                            </span>
                          )}
                        </div>
                        {sd.cout_formation && (
                          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ fontSize:11, color:"#7c3aed", fontWeight:700 }}>Coût total de la formation</div>
                            <div style={{ fontSize:20, fontWeight:900, color:"#0f172a" }}>{Number(sd.cout_formation).toLocaleString("fr-FR")} <span style={{ fontSize:13, fontWeight:600, color:"#6b7280" }}>FCFA</span></div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ background:"#fffbeb", borderRadius:10, padding:"12px 16px", border:"1.5px solid #fde68a", fontSize:12, color:"#92400e", fontWeight:700 }}>
                        ⚠️ Formation non encore renseignée - mettez à jour le dossier.
                      </div>
                    ))}

                    {/* L'OBJECTIF DU CLIENT, avant les infos secondaires et sur toute la largeur.
                        Il ne va pas dans la grille ci-dessous : c'est une phrase, pas une valeur,
                        et une demi-colonne la casserait en lignes illisibles. Il vient AVANT parce
                        qu'il dit pourquoi la personne est là, quand le reste dit comment on l'a
                        organisée. Affiché pour le privé comme pour le groupe - un apprenant de
                        groupe a un objectif tout autant, même si personne ne lui choisit de coach. */}
                    <div style={{ background: a.objectif_client ? "#f5f3ff" : "#fffbeb",
                      border:`1.5px solid ${a.objectif_client ? "#ddd6fe" : "#fde68a"}`,
                      borderRadius:10, padding:"12px 16px" }}>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase",
                        color: a.objectif_client ? "#6d28d9" : "#92400e", marginBottom:5 }}>
                        🎯 Objectif du client
                      </div>
                      <div style={{ fontSize:13.5, lineHeight:1.65, whiteSpace:"pre-wrap",
                        fontWeight: a.objectif_client ? 600 : 700,
                        color: a.objectif_client ? "#0f172a" : "#92400e" }}>
                        {a.objectif_client || "Non renseigné — à demander à l'assistante commerciale."}
                      </div>
                    </div>

                    {/* Infos secondaires */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      {[
                        ["Lieu du coaching",    sd.lieu_coaching === "domicile"
                          ? `🏠 À domicile${sd.adresse_coaching ? " - " + sd.adresse_coaching : ""}`
                          : sd.lieu_coaching === "cabinet"
                            ? `🏢 Au cabinet${sd.centre_coaching ? " - " + (paCentresList.find(c=>c.key===sd.centre_coaching)?.name||sd.centre_coaching) : ""}`
                            : "-"],
                        ["Source",              a.source || "formulaire_domicile"],
                        ["Conseiller PA",       [profil?.prenom, profil?.nom].filter(Boolean).join(" ") || a.assistante_nom || "-"],
                        ["Date de conversion",  formatDate(a.updated_at || a.created_at)],
                      ].map(([l,v])=>(
                        <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px", border:"1px solid #e2e8f0" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>{l}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Équipe assignée - assistante (en ligne/présentiel), onboarding, coach.
                        Contact direct utile au PA sans devoir chercher dans un autre onglet. */}
                    {(() => {
                      // 3 sources possibles pour le coach, du plus spécifique au plus général :
                      // suivi_demarrage.coach_id (assignation présentiel via AssignationCentreModal),
                      // notes_coach/coach_nom (saisie manuelle), puis en dernier repli le coach réel
                      // du groupe (a.groupe_id) - seul lien existant pour une inscription en ligne,
                      // qui ne passe jamais par ces deux premiers chemins.
                      const coachIdRes = sd.coach_id;
                      const coachRes = coachIdRes ? paCoachsList.find(c => String(c.id) === String(coachIdRes)) : null;
                      const groupeRes = a.groupe_id ? paGroupes.find(g => g.id === a.groupe_id) : null;
                      const coachNomRes = a.notes_coach || a.coach_nom
                        || (coachRes ? `${coachRes.prenom||""} ${coachRes.nom||""}`.trim() : null)
                        || groupeRes?.coach_nom
                        || (coachIdRes ? `Coach #${coachIdRes}` : null);
                      const coachEmailRes = coachRes?.email || groupeRes?.coach_email || null;
                      const coachTelRes   = coachRes?.telephone || groupeRes?.coach_telephone || null;
                      const coachPhotoRes = coachRes?.avatar_url || groupeRes?.coach_photo_url || null;
                      const EQUIPE = [
                        { titre:"Assistante", icone:"💼", nom: a.assistante_nom!=="-" ? a.assistante_nom : null, email: a.assistante_email, tel: a.assistante_tel, photo: a.assistante_photo },
                        { titre:"Onboarding", icone:"🚀", nom: a.onboarding_nom, email: a.onboarding_email, tel: a.onboarding_telephone },
                        { titre:"Coach",      icone:"👨‍🏫", nom: coachNomRes, email: coachEmailRes, tel: coachTelRes, photo: coachPhotoRes },
                      ];
                      return (
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                          {EQUIPE.map(m => (
                            <div key={m.titre} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px" }}>
                              <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>{m.icone} {m.titre}</div>
                              {m.nom ? (
                                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  <div style={{ width:32, height:32, borderRadius:"50%", background:`${PA_COLOR}18`, color:PA_COLOR, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:12, flexShrink:0, overflow:"hidden" }}>
                                    {m.photo ? <img src={m.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : m.nom.split(" ").map(w=>w[0]||"").join("").toUpperCase().slice(0,2)}
                                  </div>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.nom}</div>
                                    {m.tel && <div style={{ fontSize:10, color:"#0891b2" }}>📞 {m.tel}</div>}
                                    {m.email && <div style={{ fontSize:10, color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>✉️ {m.email}</div>}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize:12, color:"#cbd5e1", fontStyle:"italic" }}>Non affecté</div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <Btn small onClick={()=>setApprenantTab("chat")}>💬 Chat</Btn>
                      {a.type_coaching === "prive" && (
                        <Btn small outline onClick={()=>{ setProspectModal(a); const sd2=a.suivi_demarrage||{}; const rawDispos2=sd2.disponibilites||{jours:[],creneaux:[]}; setProspectDossier({niveau:sd2.niveau_prospect||a.niveau_client||"",duree_mois:sd2.nb_seances_souhaitees||"",formation:sd2.formation_souhaitee||"",type_coaching:sd2.type_coaching||"classique",lieu:sd2.lieu_coaching||"cabinet",cout_formation:sd2.cout_formation||"",adresse_coaching:sd2.adresse_coaching||"",centre_coaching:sd2.centre_coaching||"",disponibilites:{...rawDispos2,horaires:normalizeHoraires(rawDispos2.horaires)},date_debut:sd2.date_debut_formation||a.date_debut_formation||""}); setApprenantModal(null); setPaSeancesPrivees([]); setPaPresencesPrivees([]); }}>✏️ Modifier le dossier</Btn>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── TESTS DE NIVEAU ─── tous les passages, l'ancien comme le nouveau */}
                {apprenantTab === "niveau" && (
                  <HistoriqueTestsNiveau
                    apiUrl={API_URL}
                    authHeaders={authHeaders}
                    historique={paTestsNiveau}
                    chargement={paTestsNiveauLoading}
                    mode="complet"
                    titre="🎓 Tests de niveau"
                  />
                )}

                {/* ─── SUIVI ASSIDUITÉ ─── */}
                {apprenantTab === "suivi" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {/* KPIs assiduité */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                      <div style={{ background:"#f0fdf4", borderRadius:10, padding:"12px", textAlign:"center", border:"1px solid #bbf7d0" }}>
                        <div style={{ fontSize:10, color:"#15803d", fontWeight:700, marginBottom:4 }}>Séances</div>
                        <div style={{ fontSize:28, fontWeight:900, color:"#0f172a" }}>{seancesCnt}</div>
                        {sd.nb_seances_souhaitees && <div style={{ fontSize:10, color:"#64748b" }}>/ {sd.nb_seances_souhaitees} prévues</div>}
                      </div>
                      <div style={{ background:"#e0f2fe", borderRadius:10, padding:"12px", textAlign:"center", border:"1px solid #bae6fd" }}>
                        <div style={{ fontSize:10, color:"#0369a1", fontWeight:700, marginBottom:4 }}>Participation</div>
                        <div style={{ fontSize:28, fontWeight:900, color:tauxPart===null?"#94a3b8":tauxPart>=80?"#15803d":tauxPart>=60?"#d97706":"#ef4444" }}>{tauxPart!==null?`${tauxPart}%`:"-"}</div>
                      </div>
                      <div style={{ background:"#fef2f2", borderRadius:10, padding:"12px", textAlign:"center", border:"1px solid #fca5a5" }}>
                        <div style={{ fontSize:10, color:"#b91c1c", fontWeight:700, marginBottom:4 }}>Absentéisme</div>
                        <div style={{ fontSize:28, fontWeight:900, color:tauxAbs===null?"#94a3b8":tauxAbs<=10?"#15803d":tauxAbs<=25?"#d97706":"#ef4444" }}>{tauxAbs!==null?`${tauxAbs}%`:"-"}</div>
                      </div>
                    </div>

                    {seancesCnt > 0 && (
                      <div style={{ height:8, background:"#e5e7eb", borderRadius:999, overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:999, width:`${tauxPart||0}%`, background:tauxPart>=80?"#22c55e":tauxPart>=60?"#f59e0b":"#ef4444", transition:"width .4s" }} />
                      </div>
                    )}

                    {/* Alertes */}
                    {(() => {
                      const monday2=new Date(); monday2.setDate(monday2.getDate()-((monday2.getDay()+6)%7)); monday2.setHours(0,0,0,0);
                      const aw=sessions.filter(s=>new Date(s.date)>=monday2&&s.statut==="absent").length;
                      const srt=[...sessions].sort((x,y)=>x.date.localeCompare(y.date));
                      let cc=0,mc=0; for(const s of srt){if(s.statut==="absent"){cc++;if(cc>mc)mc=cc;}else cc=0;}
                      return (
                        <>
                          {aw>2 && <div style={{ padding:"8px 12px", background:"#fff7ed", borderRadius:8, border:"1px solid #fed7aa", fontSize:12, color:"#c2410c", fontWeight:700 }}>🔔 {aw} absences cette semaine</div>}
                          {mc>=3 && <div style={{ padding:"8px 12px", background:"#fef2f2", borderRadius:8, border:"1px solid #fca5a5", fontSize:12, color:"#b91c1c", fontWeight:700 }}>🚨 {mc} absences consécutives - intervention urgente</div>}
                        </>
                      );
                    })()}

                    {/* Liste séances */}
                    <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
                      <div style={{ padding:"8px 14px", background:"#f8fafc", fontSize:11, fontWeight:700, color:"#374151", borderBottom:"1px solid #e2e8f0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span>Liste des séances ({sessions.length})</span>
                        <button onClick={()=>setAddingSession(true)} style={{ padding:"4px 10px", background:PA_COLOR, color:"#fff", border:"none", borderRadius:6, fontSize:11, cursor:"pointer", fontWeight:700 }}>+ Ajouter</button>
                      </div>

                      {addingSession && (
                        <div style={{ padding:"10px 14px", background:"#f5f3ff", borderBottom:"1px solid #e2e8f0", display:"flex", gap:8, alignItems:"center" }}>
                          <input type="date" value={sessionForm.date} onChange={e=>setSessionForm(p=>({...p,date:e.target.value}))} style={{ padding:"6px 8px", border:"1.5px solid #c4b5fd", borderRadius:6, fontSize:12 }} />
                          <select value={sessionForm.statut} onChange={e=>setSessionForm(p=>({...p,statut:e.target.value}))} style={{ padding:"6px 8px", border:"1.5px solid #c4b5fd", borderRadius:6, fontSize:12, background:"#fff" }}>
                            <option value="present">✅ Présent</option>
                            <option value="absent">❌ Absent</option>
                          </select>
                          <button disabled={sessionActionSaving||!peut("inscriptions","update")} title={permBtnTitle("Enregistrer",peut("inscriptions","update"))} onClick={handleAddSession} style={{ padding:"6px 12px", background:PA_COLOR, color:"#fff", border:"none", borderRadius:6, fontSize:12, cursor:sessionActionSaving?"not-allowed":"pointer", fontWeight:700 }}>{sessionActionSaving?"⏳…":!peut("inscriptions","update")?"🔒":"Enregistrer"}</button>
                          <button onClick={()=>setAddingSession(false)} style={{ padding:"6px 10px", background:"#e5e7eb", border:"none", borderRadius:6, fontSize:12, cursor:"pointer" }}>Annuler</button>
                        </div>
                      )}

                      {sessions.length === 0 && !addingSession && <div style={{ padding:"24px", textAlign:"center", fontSize:12, color:"#94a3b8" }}>Aucune séance enregistrée. Cliquez sur + Ajouter pour commencer.</div>}
                      {[...sessions].sort((x,y)=>y.date.localeCompare(x.date)).map((s,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px", borderBottom:i<sessions.length-1?"1px solid #f1f5f9":"none" }}>
                          <span style={{ fontSize:14 }}>{s.statut==="present"?"✅":"❌"}</span>
                          <span style={{ fontSize:12, color:"#374151", flex:1 }}>{s.date && new Date(s.date).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}</span>
                          <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, color:s.statut==="present"?"#15803d":"#ef4444", background:s.statut==="present"?"#dcfce7":"#fee2e2" }}>{s.statut==="present"?"Présent":"Absent"}</span>
                          <button disabled={sessionActionSaving||!peut("inscriptions","update")} title={permBtnTitle("Supprimer",peut("inscriptions","update"))} onClick={()=>handleDeleteSession(sessions.indexOf(s))} style={{ background:"#fee2e2", border:"none", borderRadius:5, padding:"3px 6px", cursor:sessionActionSaving?"not-allowed":"pointer", fontSize:10, color:"#b91c1c" }}>{!peut("inscriptions","update")?"🔒":"✕"}</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── SÉANCES COACH ─── */}
                {apprenantTab === "seances_coach" && (() => {
                  const statutColors = {
                    planifiee:   { bg:"#eff6ff", color:"#2563eb", label:"Planifiée" },
                    effectuee:   { bg:"#f0fdf4", color:"#22c55e", label:"Effectuée" },
                    annulee:     { bg:"#fef2f2", color:"#ef4444", label:"Annulée"   },
                    non_inscrit: { bg:"#f8fafc", color:"#94a3b8", label:"⏳ Non inscrit à cette période" },
                  };
                  const statutPresence = {
                    present: { bg:"#f0fdf4", color:"#22c55e", label:"Présent" },
                    absent:  { bg:"#fef2f2", color:"#ef4444", label:"Absent"  },
                    retard:  { bg:"#fffbeb", color:"#f59e0b", label:"Retard"  },
                    excuse:  { bg:"#f0f9ff", color:"#0891b2", label:"Excusé"  },
                  };
                  const nbEffectuees = paSeancesPrivees.filter(s=>s.statut==="effectuee").length;
                  const nbAvenir     = paSeancesPrivees.filter(s=>s.statut==="planifiee").length;
                  const nbPresent    = paPresencesPrivees.filter(p=>p.statut==="present").length;
                  const nbAbsent     = paPresencesPrivees.filter(p=>p.statut==="absent").length;
                  const taux = paPresencesPrivees.length > 0 ? Math.round((nbPresent/paPresencesPrivees.length)*100) : null;

                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

                      {paSeancesLoading ? (
                        <div style={{ textAlign:"center", padding:28, color:"#94a3b8", fontSize:13 }}>Chargement…</div>
                      ) : (
                        <>
                          {/* KPIs */}
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                            {[
                              { l:"Effectuées", v:nbEffectuees, color:"#22c55e", bg:"#f0fdf4" },
                              { l:"À venir",    v:nbAvenir,     color:"#2563eb", bg:"#eff6ff" },
                              { l:"Total",      v:paSeancesPrivees.length, color:"#64748b", bg:"#f8fafc" },
                              { l:"Taux prés.", v:taux!=null?`${taux}%`:"-", color:PA_COLOR, bg:PA_LIGHT },
                              { l:"Absences",  v:nbAbsent,     color:"#ef4444", bg:"#fef2f2" },
                            ].map(s=>(
                              <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:"10px 8px", textAlign:"center", border:"1px solid #e2e8f0" }}>
                                <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.v}</div>
                                <div style={{ fontSize:10, color:"#64748b", fontWeight:600, marginTop:2 }}>{s.l}</div>
                              </div>
                            ))}
                          </div>

                          {/* Séances */}
                          <div>
                            <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginBottom:8 }}>📆 Séances planifiées par le coach</div>
                            {paSeancesPrivees.length === 0 ? (
                              <div style={{ background:"#f8fafc", borderRadius:10, padding:"20px", textAlign:"center", border:"1.5px dashed #e2e8f0", color:"#94a3b8", fontSize:13 }}>
                                Aucune séance enregistrée par le coach
                              </div>
                            ) : (
                              <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
                                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                                  <thead>
                                    <tr style={{ background:"#f8fafc" }}>
                                      {["Date","Heure","Durée","Lieu","Statut","Notes"].map(h=>(
                                        <th key={h} style={{ padding:"9px 12px", fontWeight:700, color:"#64748b", fontSize:11, textAlign:"left", borderBottom:"1px solid #e2e8f0" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...paSeancesPrivees].sort((a,b)=>b.date_seance.localeCompare(a.date_seance)).map(s=>{
                                      const sc = statutColors[s.statut] || { bg:"#f8fafc", color:"#64748b", label:s.statut };
                                      const lieu = s.lieu==="domicile"?"🏠 Domicile":s.lieu==="en_ligne"?"💻 En ligne":"🏢 Cabinet";
                                      return (
                                        <tr key={s.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                                          <td style={{ padding:"9px 12px", fontWeight:600 }}>{new Date(s.date_seance+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</td>
                                          <td style={{ padding:"9px 12px", color:"#64748b" }}>{s.heure_debut?s.heure_debut.slice(0,5):"-"}</td>
                                          <td style={{ padding:"9px 12px", color:"#64748b" }}>
                                            {s.duree_h}h
                                            {/* Le temps réellement passé en salle, sous la durée
                                                contractuelle : une séance « effectuée » ne disait
                                                pas jusqu'ici si elle avait duré 90 min ou 5, alors
                                                que c'est sur cette durée que l'honoraire est
                                                calculé. L'écart doit se voir au même endroit. */}
                                            {(() => {
                                              const reel = dureeReelleMin(s); if (reel == null) return null;
                                              const prevu = dureePrevueMin(s);
                                              const court = prevu && reel < prevu - 5;
                                              return (
                                                <div title="Temps réellement passé en salle, relevé par le chronomètre du coach"
                                                  style={{ fontSize:10.5, fontWeight:700, color: court ? "#b91c1c" : "#15803d", marginTop:2 }}>
                                                  ⏱ {reel} min réel
                                                </div>
                                              );
                                            })()}
                                          </td>
                                          <td style={{ padding:"9px 12px", fontSize:11 }}>{lieu}</td>
                                          <td style={{ padding:"9px 12px" }}>
                                            <span style={{ padding:"2px 8px", borderRadius:99, fontSize:11, fontWeight:700, background:sc.bg, color:sc.color }}>{sc.label}</span>
                                          </td>
                                          <td style={{ padding:"9px 12px", color:"#64748b", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.notes||"-"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Présences */}
                          <div>
                            <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", marginBottom:8 }}>✅ Feuille de présences</div>
                            {paPresencesPrivees.length === 0 ? (
                              <div style={{ background:"#f8fafc", borderRadius:10, padding:"20px", textAlign:"center", border:"1.5px dashed #e2e8f0", color:"#94a3b8", fontSize:13 }}>
                                Aucune présence enregistrée par le coach
                              </div>
                            ) : (
                              <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
                                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                                  <thead>
                                    <tr style={{ background:"#f8fafc" }}>
                                      {["Date","Statut","Motif","Note"].map(h=>(
                                        <th key={h} style={{ padding:"9px 12px", fontWeight:700, color:"#64748b", fontSize:11, textAlign:"left", borderBottom:"1px solid #e2e8f0" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...paPresencesPrivees].sort((a,b)=>b.date_presence.localeCompare(a.date_presence)).map(p=>{
                                      const sp = statutPresence[p.statut] || { bg:"#f8fafc", color:"#64748b", label:p.statut };
                                      return (
                                        <tr key={p.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                                          <td style={{ padding:"9px 12px", fontWeight:600 }}>{new Date(p.date_presence+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</td>
                                          <td style={{ padding:"9px 12px" }}>
                                            <span style={{ padding:"2px 8px", borderRadius:99, fontSize:11, fontWeight:700, background:sp.bg, color:sp.color }}>{sp.label}</span>
                                          </td>
                                          <td style={{ padding:"9px 12px", color:"#64748b" }}>{p.motif||"-"}</td>
                                          <td style={{ padding:"9px 12px", color:"#64748b" }}>{p.note||"-"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* ─── PAIEMENT ─── */}
                {apprenantTab === "paiement" && (() => {
                  // Consultation uniquement - le PA ne gère jamais les paiements (configurer un
                  // plan, marquer payé, générer le mois suivant, arrêter la récurrence, envoyer
                  // un lien, ajouter un versement) : ça reste le rôle exclusif de la commerciale.
                  // Le PA voit ici les mêmes informations, en lecture seule.
                  const todayStr = new Date().toISOString().slice(0,10);
                  const moisPaiements = plan.mois_paiements || [];
                  const hasPlanMensuel = moisPaiements.length > 0;
                  // Un mois gelé par une pause a son montant ramené au déjà-versé : il passerait
                  // donc pour « payé » dans les compteurs, et gonflerait le nombre de mois réglés
                  // comme le total prévu. On l'écarte des agrégats, sans le cacher de la liste.
                  const moisFactures      = moisPaiements.filter(m => !m.neutralise);
                  const moisGeles         = moisPaiements.filter(m => m.neutralise);
                  const suspensionEnCours = (plan.suspensions || []).find(sp => !sp.fin) || null;
                  const totalPayéMensuel  = hasPlanMensuel ? moisPaiements.reduce((s,m)=>(m.tranches||[]).filter(t=>(t.statut==="paye"||t.statut==="payé")).reduce((ss,t)=>ss+(t.montant||0),s),0) : 0;
                  const moisPayésCount    = hasPlanMensuel ? moisFactures.filter(m=>getMoisStatutPA(m,todayStr,plan.jour_echeance)==="paye").length : 0;
                  const moisRetardCount   = hasPlanMensuel ? moisFactures.filter(m=>getMoisStatutPA(m,todayStr,plan.jour_echeance)==="retard").length : 0;
                  const totalMensuelPrévu = hasPlanMensuel ? moisFactures.reduce((s,m)=>s+(m.montant||0),0) : 0;
                  const SICO = { paye:{icon:"✅",c:"#15803d",bg:"#f0fdf4",border:"#bbf7d0"}, partiel:{icon:"🔄",c:"#0891b2",bg:"#e0f2fe",border:"#bae6fd"}, retard:{icon:"❌",c:"#b91c1c",bg:"#fef2f2",border:"#fca5a5"}, en_attente:{icon:"⏳",c:"#d97706",bg:"#fffbeb",border:"#fde68a"} };

                  return (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                    {/* ── Pause en cours ────────────────────────────────────────────────
                        Seule exception à la lecture seule de cet onglet : le PA ne facture
                        pas, mais il constate un arrêt pédagogique - et cet arrêt a une
                        conséquence financière immédiate qu'il doit pouvoir déclencher et
                        lever lui-même. */}
                    {suspensionEnCours && (
                      <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                        <span style={{ fontSize:22 }}>⏸️</span>
                        <div style={{ flex:1, minWidth:220 }}>
                          <div style={{ fontSize:13.5, fontWeight:800, color:"#92400e" }}>
                            Cours suspendus depuis {suspensionEnCours.debut}
                            {suspensionEnCours.motif ? ` - ${suspensionEnCours.motif}` : ""}
                          </div>
                          <div style={{ fontSize:12, color:"#b45309", marginTop:3 }}>
                            {moisGeles.length} mois neutralisé{moisGeles.length>1?"s":""} ·{" "}
                            {Number(suspensionEnCours.montant_gele||0).toLocaleString("fr-FR")} F non dus
                            {suspensionEnCours.date_reprise_prevue ? ` · reprise prévue le ${suspensionEnCours.date_reprise_prevue}` : ""}
                          </div>
                        </div>
                        <button
                          disabled={paRepriseLoading}
                          onClick={() => setPaRepriseModal({ assignationId: a.id, nom: a.prospect_nom, suspension: suspensionEnCours })}
                          style={{ padding:"9px 18px", borderRadius:8, border:"none", background: paRepriseLoading?"#e2e8f0":"#15803d", color: paRepriseLoading?"#9ca3af":"#fff", fontWeight:800, fontSize:12.5, cursor: paRepriseLoading?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
                          ▶️ Reprendre les cours
                        </button>
                      </div>
                    )}

                    {/* Bloc formation + coût mensuel */}
                    <div style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", borderRadius:12, padding:"14px 18px", border:"1.5px solid #c4b5fd", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:200 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:PA_COLOR, textTransform:"uppercase", letterSpacing:".05em", marginBottom:4 }}>Formation</div>
                        <div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>{sd.formation_souhaitee || <span style={{ color:"#94a3b8", fontStyle:"italic" }}>Non renseignée</span>}</div>
                        <div style={{ display:"flex", gap:8, marginTop:5, flexWrap:"wrap" }}>
                          {sd.niveau_prospect && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, background:niveauColor, color:"#fff" }}>Niveau {sd.niveau_prospect}</span>}
                          {sd.nb_seances_souhaitees && <span style={{ fontSize:11, fontWeight:700, color:"#6d28d9", background:"#ede9fe", padding:"2px 8px", borderRadius:999 }}>📅 {sd.nb_seances_souhaitees} mois</span>}
                          {plan.mensualite>0 && <span style={{ fontSize:11, fontWeight:700, color:PA_COLOR, background:PA_COLOR+"15", padding:"2px 8px", borderRadius:999 }}>💳 {Number(plan.mensualite).toLocaleString("fr-FR")} F/mois</span>}
                        </div>
                      </div>
                      {sd.cout_formation ? (
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:10, fontWeight:700, color:PA_COLOR, textTransform:"uppercase", letterSpacing:".05em", marginBottom:2 }}>Coût total estimé</div>
                          <div style={{ fontSize:24, fontWeight:900, color:"#0f172a" }}>{Number(sd.cout_formation).toLocaleString("fr-FR")} <span style={{ fontSize:13, color:"#6b7280" }}>FCFA</span></div>
                        </div>
                      ) : (
                        <span style={{ fontSize:11, color:"#f59e0b", fontWeight:700 }}>⚠️ Coût non renseigné</span>
                      )}
                    </div>

                    {/* ══ PLAN MENSUEL ══ */}
                    {hasPlanMensuel && (() => {
                      const isOuvert = !plan.date_fin_formation;
                      return (
                        <div style={{ borderRadius:12, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
                          {/* Header plan */}
                          <div style={{ background:`linear-gradient(135deg,#0f172a,${PA_COLOR})`, padding:"12px 16px", color:"#fff" }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                              <div>
                                <div style={{ fontSize:13, fontWeight:800 }}>💳 Plan mensuel - {Number(plan.mensualite||0).toLocaleString("fr-FR")} F/mois</div>
                                <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", marginTop:2 }}>
                                  {plan.date_debut_formation&&`Début : ${new Date(plan.date_debut_formation).toLocaleDateString("fr-FR")}`}
                                  {plan.date_fin_formation&&` · Fin : ${new Date(plan.date_fin_formation).toLocaleDateString("fr-FR")}`}
                                  {isOuvert&&" · Durée ouverte"}
                                </div>
                                {/* L'en-tête donne le prix des PROCHAINS mois, les lignes celui
                                    de chaque mois, figé à sa création. Après un changement de
                                    tarif les deux divergent, et l'écran affichait « 5 F/mois »
                                    au-dessus de mois à 10 F sans l'expliquer. Même correctif que
                                    dans le tableau de bord commercial, qui porte le même bloc. */}
                                {(() => {
                                  /* ── CE QUE CE MESSAGE DOIT DIRE, ET CE QU'IL DISAIT DE FAUX ──
                                     Il comparait TOUS les mois à `plan.mensualite` et sortait un
                                     ⚠ dès qu'un seul différait, en concluant toujours « le
                                     nouveau montant s'applique aux mois créés ensuite ».

                                     Deux mensonges pour un dossier où l'on a coché « dès le mois
                                     en cours ». Vu le 07/10/2026 sur Doumbia seydou : tarif passé
                                     de 10 à 5 F, octobre ET novembre bien réécrits à 5 — la
                                     fonctionnalité avait parfaitement marché. Restait septembre,
                                     passé et réglé 10 F. L'écran l'annonçait en ⚠ comme si
                                     quelque chose n'avait pas pris, et affirmait que le nouveau
                                     tarif ne vaudrait que pour la suite, alors qu'il venait
                                     justement d'être appliqué au mois en cours.

                                     UN MOIS PASSÉ OU DÉJÀ PAYÉ NE SE RÉÉCRIT PAS — c'est la règle
                                     du serveur, et elle est juste : on ne refacture pas ce qui est
                                     encaissé. Le signaler comme une anomalie apprend à ignorer
                                     l'avertissement, qui ne sert alors plus à rien le jour où il
                                     dit vrai.

                                     On sépare donc les deux populations :
                                       · à venir, impayés, encore à l'ancien prix → ACTIONNABLE,
                                         le tarif ne leur a pas été appliqué, ⚠ ;
                                       · passés ou déjà réglés → le passé garde son prix, simple
                                         note, sans alarme. */
                                  const mois = (moisPaiements || []).filter(m => !m.neutralise);
                                  const nouvelle = Number(plan.mensualite || 0);
                                  if (!nouvelle || !mois.length) return null;

                                  const periodeCourante = todayStr.slice(0, 7);
                                  const regle = (m) => (m.tranches || [])
                                    .reduce((t, x) => t + (Number(x.montant) || 0), 0) > 0;

                                  const aRevoir = mois.filter(m =>
                                    Number(m.montant || 0) !== nouvelle
                                    && String(m.periode || "") >= periodeCourante
                                    && !regle(m));
                                  const acquis = mois.filter(m =>
                                    Number(m.montant || 0) !== nouvelle
                                    && !(String(m.periode || "") >= periodeCourante && !regle(m)));

                                  if (!aRevoir.length && !acquis.length) return null;

                                  const chg = Array.isArray(plan.changements_tarif) && plan.changements_tarif.length
                                    ? plan.changements_tarif[plan.changements_tarif.length - 1] : null;
                                  const leChangement = chg?.le
                                    ? ` le ${new Date(chg.le).toLocaleDateString("fr-FR")}` : "";
                                  const f = (n) => Number(n || 0).toLocaleString("fr-FR");

                                  /* Le cas qui APPELLE UNE ACTION passe en premier et seul : s'il
                                     y a quelque chose à corriger, c'est cela qu'on doit lire. */
                                  if (aRevoir.length) {
                                    return (
                                      <div style={{ fontSize:10.5, color:"#fde68a", marginTop:4, lineHeight:1.45 }}>
                                        ⚠ {aRevoir.length} mois à venir {aRevoir.length > 1 ? "sont encore" : "est encore"} à{" "}
                                        {f(aRevoir[0].montant)} F au lieu de {f(nouvelle)} F. Pour les aligner, refaites le
                                        changement de tarif en cochant « appliquer dès le mois en cours ».
                                      </div>
                                    );
                                  }

                                  return (
                                    <div style={{ fontSize:10.5, color:"rgba(255,255,255,0.72)", marginTop:4, lineHeight:1.45 }}>
                                      Tarif passé à {f(nouvelle)} F{leChangement}. {acquis.length} mois déjà réglé
                                      {acquis.length > 1 ? "s restent" : " reste"} à {f(acquis[0].montant)} F : le passé garde son prix.
                                    </div>
                                  );
                                })()}
                              </div>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>{moisPayésCount}/{moisPaiements.length} mois</div>
                                <div style={{ fontSize:13, fontWeight:800 }}>{Number(totalPayéMensuel).toLocaleString("fr-FR")} F payés</div>
                              </div>
                            </div>
                            <div style={{ marginTop:8, height:5, background:"rgba(255,255,255,0.2)", borderRadius:999, overflow:"hidden" }}>
                              <div style={{ height:"100%", borderRadius:999, background:"#22c55e", width:`${totalMensuelPrévu>0?Math.min(100,Math.round(totalPayéMensuel/totalMensuelPrévu*100)):0}%`, transition:"width .4s" }}/>
                            </div>
                          </div>
                          {/* KPIs */}
                          {(moisRetardCount>0||moisPayésCount>0)&&(
                            <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e2e8f0" }}>
                              {[{l:"Payés",v:moisPayésCount,c:"#15803d",bg:"#f0fdf4"},{l:"Retard",v:moisRetardCount,c:"#b91c1c",bg:"#fef2f2"},{l:"Total prévu",v:`${Number(totalMensuelPrévu).toLocaleString("fr-FR")} F`,c:"#0f172a",bg:"#f8fafc"}]
                                .map((s,i,arr)=>(
                                  <div key={s.l} style={{ flex:1, textAlign:"center", padding:"8px 4px", background:s.bg, borderRight:i<arr.length-1?"1px solid #e2e8f0":"none" }}>
                                    <div style={{ fontSize:9, color:"#94a3b8", fontWeight:700 }}>{s.l}</div>
                                    <div style={{ fontSize:13, fontWeight:800, color:s.c }}>{s.v}</div>
                                  </div>
                                ))}
                            </div>
                          )}
                          {/* Liste mois */}
                          <div style={{ display:"flex", flexDirection:"column" }}>
                            {moisPaiements.map((mois,idx)=>{
                              // Cf. l'autre échéancier : un mois gelé est à 0, donc « payé » aux
                              // yeux de getMoisStatutPA. Il lui faut son propre habillage.
                              const gele=!!mois.neutralise;
                              const statut=getMoisStatutPA(mois,todayStr,plan.jour_echeance);
                              const si=gele?{icon:"❄️",c:"#0369a1",bg:"#f0f9ff",border:"#bae6fd"}:(SICO[statut]||SICO.en_attente);
                              const tPaye=(mois.tranches||[]).filter(t=>(t.statut==="paye"||t.statut==="payé")).reduce((s,t)=>s+(t.montant||0),0);
                              const hasTranches=(mois.tranches||[]).length>0;
                              return (
                                <div key={mois.id} style={{ borderBottom:idx<moisPaiements.length-1?"1px solid #f1f5f9":"none", background:si.bg }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px" }}>
                                    <span style={{ fontSize:16, flexShrink:0 }}>{si.icon}</span>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>
                                        {mois.label}
                                        {gele && <span style={{ marginLeft:8, fontSize:10.5, fontWeight:700, color:"#0369a1", background:"#e0f2fe", padding:"2px 8px", borderRadius:999 }}>Gelé - non dû</span>}
                                      </div>
                                      {gele && (
                                        <div style={{ fontSize:11, color:"#0369a1" }}>
                                          Aucun cours dispensé{mois.montant_initial>mois.montant?` - ${Number(mois.montant_initial).toLocaleString("fr-FR")} F non réclamés`:""}
                                        </div>
                                      )}
                                      {!gele&&statut==="partiel"&&<div style={{ fontSize:11, color:"#0891b2" }}>{Number(tPaye).toLocaleString("fr-FR")} F / {Number(mois.montant).toLocaleString("fr-FR")} F payés</div>}
                                      {!gele&&statut==="paye"&&<div style={{ fontSize:11, color:"#15803d" }}>{Number(mois.montant).toLocaleString("fr-FR")} F ✓</div>}
                                    </div>
                                    <div style={{ fontSize:12, fontWeight:800, color:si.c }}>{Number(mois.montant).toLocaleString("fr-FR")} F</div>
                                  </div>
                                  {hasTranches&&(
                                    <div style={{ paddingLeft:38, paddingBottom:8, display:"flex", flexDirection:"column", gap:4 }}>
                                      {(mois.tranches||[]).map((t,ti)=>{
                                        const tsi=(t.statut==="paye"||t.statut==="payé")?SICO.paye:SICO.en_attente;
                                        return (
                                          <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 12px", borderRadius:8, background:tsi.bg, border:`1px solid ${tsi.border}` }}>
                                            <span style={{ fontSize:13 }}>{tsi.icon}</span>
                                            <div style={{ flex:1 }}>
                                              <span style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>Tranche {ti+1} - {Number(t.montant).toLocaleString("fr-FR")} F</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {/* Canaux de rappel - consultation uniquement, le PA ne configure rien ici. */}
                          <div style={{ padding:"10px 14px", borderTop:"1px solid #e2e8f0", fontSize:10.5, color:"#94a3b8" }}>
                            🔔 Rappels : in-app (actif){plan.canal_sms?" · SMS (bientôt)":""}{plan.canal_email?" · Email (bientôt)":""}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Versements enregistrés - consultation uniquement, le PA n'ajoute
                        jamais de versement lui-même (rôle exclusif de la commerciale) ── */}
                    <div style={{ borderTop:"1.5px solid #e2e8f0", paddingTop:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <div style={{ fontSize:12, fontWeight:800, color:"#374151" }}>
                          💳 Versements enregistrés {loadingPaiements ? "(…)" : `(${apprenantPaiements.length})`}
                        </div>
                      </div>

                      {/* Liste versements */}
                      {loadingPaiements && <div style={{ textAlign:"center", padding:"20px 0", fontSize:12, color:"#94a3b8" }}>Chargement…</div>}
                      {!loadingPaiements && apprenantPaiements.length === 0 && (
                        <div style={{ textAlign:"center", padding:"24px 0", color:"#94a3b8", fontSize:12, background:"#f8fafc", borderRadius:8, border:"1px dashed #e2e8f0" }}>Aucun versement enregistré.</div>
                      )}
                      {!loadingPaiements && apprenantPaiements.length > 0 && (
                        <>
                          <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
                            {apprenantPaiements.map((p,i)=>(
                              <div key={p.id||i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderBottom:i<apprenantPaiements.length-1?"1px solid #f1f5f9":"none", background:i%2===0?"#fff":"#fafafa" }}>
                                <div style={{ width:34, height:34, borderRadius:"50%", background:"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>✅</div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>
                                    Encaissé le {p.date_paiement ? new Date(p.date_paiement).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "-"}
                                    {p.mode_paiement && <span style={{ marginLeft:8, fontSize:11, color:"#64748b", fontWeight:400 }}>· {p.mode_paiement}</span>}
                                  </div>
                                  {(()=>{ const lbl=libelleMoisSolde(p, plan); return lbl
                                    ? <div style={{ fontSize:10.5, fontWeight:700, color:"#0369a1", background:"#e0f2fe", display:"inline-block", padding:"1px 8px", borderRadius:999, marginTop:2 }}>{lbl}</div>
                                    : null; })()}
                                  {p.ref_transaction && <div style={{ fontSize:11, color:"#94a3b8" }}>Réf : {p.ref_transaction}</div>}
                                  {p.payment_mode_reel && <div style={{ fontSize:11, color:"#94a3b8" }}>Opérateur : <strong style={{ color:"#374151" }}>{p.payment_mode_reel}</strong></div>}
                                  {p.payment_token && <div style={{ fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>Token TouchPoint : {p.payment_token}</div>}
                                  {p.notes && <div style={{ fontSize:11, color:"#64748b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.notes}</div>}
                                </div>
                                <div style={{ textAlign:"right", flexShrink:0, display:"flex", alignItems:"center", gap:8 }}>
                                  <div>
                                    <div style={{ fontSize:14, fontWeight:800, color:"#22c55e" }}>+{Number(p.montant_recu||0).toLocaleString("fr-FR")} F</div>
                                    {p.montant_du > 0 && p.montant_du !== p.montant_recu && (
                                      <div style={{ fontSize:10, color:"#94a3b8" }}>sur {Number(p.montant_du).toLocaleString("fr-FR")} F</div>
                                    )}
                                  </div>
                                  {p.preuve_image && (
                                    <button onClick={()=>setPreuvePaiementView(p.preuve_image)} title="Voir le justificatif"
                                      style={{ padding:"5px 8px", background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:7, cursor:"pointer", fontSize:14, lineHeight:1 }}>
                                      📎
                                    </button>
                                  )}
                                  <button onClick={()=>ouvrirRecu(p, a)} title="Générer le reçu"
                                    style={{ padding:"5px 8px", background:"#f5f3ff", border:"1.5px solid #ddd6fe", borderRadius:7, cursor:"pointer", fontSize:14, lineHeight:1 }}>
                                    🖨️
                                  </button>
                                </div>
                              </div>
                            ))}
                            <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 14px", background:"#f0fdf4", borderTop:"1.5px solid #bbf7d0", fontSize:13, fontWeight:800 }}>
                              <span>Total versé</span>
                              <span style={{ color:"#16a34a" }}>{Number(apprenantPaiements.reduce((s,p)=>s+(p.montant_recu||0),0)).toLocaleString("fr-FR")} F</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  );
                })()}

                {/* ─── PROGRESSION ─── */}
                {apprenantTab === "progression" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

                    {/* Infos dossier */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                      <div style={{ background:"#f5f3ff", borderRadius:10, padding:"14px", textAlign:"center", border:"1px solid #ddd6fe" }}>
                        <div style={{ fontSize:10, color:PA_COLOR, fontWeight:700, marginBottom:4 }}>Niveau de départ</div>
                        <div style={{ fontSize:24, fontWeight:900, color:"#0f172a" }}>{sd.niveau_prospect || "-"}</div>
                      </div>
                      <div style={{ background:"#f0fdf4", borderRadius:10, padding:"14px", textAlign:"center", border:"1px solid #bbf7d0" }}>
                        <div style={{ fontSize:10, color:"#15803d", fontWeight:700, marginBottom:4 }}>Séances réalisées</div>
                        <div style={{ fontSize:24, fontWeight:900, color:"#0f172a" }}>{seancesCnt}</div>
                        {sd.nb_seances_souhaitees && <div style={{ fontSize:10, color:"#64748b" }}>/ {sd.nb_seances_souhaitees}</div>}
                      </div>
                      <div style={{ background:"#e0f2fe", borderRadius:10, padding:"14px", textAlign:"center", border:"1px solid #bae6fd" }}>
                        <div style={{ fontSize:10, color:"#0369a1", fontWeight:700, marginBottom:4 }}>Formation</div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#0f172a", lineHeight:1.3 }}>{sd.formation_souhaitee || "-"}</div>
                      </div>
                    </div>

                    {/* Barre de progression séances */}
                    {sd.nb_seances_souhaitees && (
                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                          <span style={{ fontSize:12, color:"#64748b" }}>Avancement du parcours</span>
                          <span style={{ fontSize:13, fontWeight:800, color:PA_COLOR }}>{Math.min(100,Math.round((seancesCnt/sd.nb_seances_souhaitees)*100))}%</span>
                        </div>
                        <ProgressBar value={Math.min(100,Math.round((seancesCnt/(sd.nb_seances_souhaitees||1))*100))} />
                      </div>
                    )}

                    {/* Coach */}
                    {(a.notes_coach || a.coach_nom) && (
                      <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 16px", border:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ fontSize:22 }}>👨‍🏫</span>
                        <div>
                          <div style={{ fontSize:12, fontWeight:800, color:"#0f172a" }}>Coach affecté</div>
                          <div style={{ fontSize:13, color:PA_COLOR, fontWeight:700 }}>{a.notes_coach || a.coach_nom}</div>
                        </div>
                      </div>
                    )}

                    {/* Commentaires / notes de suivi */}
                    <div>
                      <div style={{ fontSize:12, fontWeight:800, color:"#374151", marginBottom:8 }}>📝 Notes de progression</div>
                      <textarea
                        value={progNote || progNotes[a.id] || sp.notes_progression || ""}
                        onChange={e=>setProgNote(e.target.value)}
                        placeholder="Observations sur la progression, points à travailler, objectifs atteints…"
                        style={{ width:"100%", minHeight:100, padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, resize:"vertical", outline:"none", boxSizing:"border-box" }}
                      />
                      <button
                        onClick={async()=>{
                          if (savingProgNote) return;
                          setSavingProgNote(true);
                          const newSp = { ...sp, notes_progression:progNote };
                          await handleSavePresencesPA(a.id, newSp);
                          setProgNotes(prev=>({...prev,[a.id]:progNote}));
                          setSavingProgNote(false);
                        }}
                        disabled={savingProgNote}
                        style={{ marginTop:8, padding:"8px 18px", background:PA_COLOR, color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", opacity:savingProgNote?0.6:1 }}>
                        {savingProgNote?"Enregistrement…":"💾 Sauvegarder les notes"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── NOTES DE CLASSE (évaluées par le coach) ─── */}
                {apprenantTab === "notes" && (
                  <div>
                    {appModalEvalsLoading ? (
                      <div style={{ textAlign:"center", padding:"32px 0", color:"#9ca3af", fontSize:13 }}>Chargement…</div>
                    ) : appModalEvals.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"60px 20px", background:"#f8fafc", borderRadius:14, border:"1px solid #e5e7eb" }}>
                        <div style={{ fontSize:42, marginBottom:10 }}>📝</div>
                        <div style={{ fontWeight:700, color:"#0f172a", marginBottom:4 }}>Aucune évaluation publiée</div>
                        <p style={{ color:"#9ca3af", fontSize:13 }}>Le coach publie et corrige les évaluations depuis son espace.</p>
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {appModalEvals.map(ev => {
                          const r = ev.resultat || {};
                          const ST = {
                            a_faire: { label:"À faire",  bg:"#f1f5f9", c:"#64748b" },
                            rendu:   { label:"Rendu",    bg:"#e0f2fe", c:"#0891b2" },
                            corrige: { label:"Corrigé",  bg:"#dcfce7", c:"#16a34a" },
                          };
                          const st = ST[r.statut] || ST.a_faire;
                          return (
                            <div key={ev.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", borderRadius:10, border:"1px solid #e2e8f0", background:"#fff" }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                  <span style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{ev.titre || "Évaluation"}</span>
                                  <span style={{ fontSize:10, background:"#ede9fe", color:"#6d28d9", padding:"2px 8px", borderRadius:5, fontWeight:600 }}>{ev.type_evaluation || "devoir"}</span>
                                  <span style={{ fontSize:10, background:st.bg, color:st.c, padding:"2px 8px", borderRadius:5, fontWeight:700 }}>{st.label}</span>
                                </div>
                                <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>
                                  {ev.date_evaluation ? new Date(ev.date_evaluation).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "-"}
                                </div>
                                {r.commentaire_coach && (
                                  <div style={{ fontSize:12, color:"#6b7280", marginTop:6, fontStyle:"italic" }}>💬 {r.commentaire_coach}</div>
                                )}
                              </div>
                              <div style={{ textAlign:"center", flexShrink:0 }}>
                                <div style={{ fontSize:18, fontWeight:900, color: r.note!=null ? "#0f172a" : "#cbd5e1" }}>
                                  {r.note!=null ? r.note : "-"}<span style={{ fontSize:11, fontWeight:600, color:"#94a3b8" }}>/{r.note_max ?? ev.note_max ?? "-"}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── CHAT ─── */}
                {apprenantTab === "chat" && (
                  <ProspectChatPanel assignation={a} profil={profil} onClose={()=>setApprenantTab("infos")} />
                )}

                {/* ─── DISPONIBILITÉS ─── */}
                {apprenantTab === "dispo" && (() => {
                  const JOURS_PA = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
                  const dispoSaved = sd.disponibilites || {};
                  // Lire horaires (nouveau format) ou convertir depuis ancien format
                  const horairesSaved = Array.isArray(dispoSaved.horaires) && dispoSaved.horaires.length > 0
                    ? dispoSaved.horaires
                    : (Array.isArray(dispoSaved.jours) && dispoSaved.jours.length > 0
                        ? dispoSaved.jours.map(j => ({ jour: JOURS_PA.find(jj => j.toLowerCase().includes(jj.toLowerCase())) || "Lun", debut: "08:00" }))
                        : []);

                  const saveDispoAppr = async () => {
                    if (savingDispoAppr) return;
                    setSavingDispoAppr(true);
                    try {
                      const existingSd = a.suivi_demarrage || {};
                      const newSd = { ...existingSd, disponibilites: { horaires: selDispoAppr } };
                      const r = await fetch(`${API_URL}/api/parcours/assignations/${a.id}`, {
                        method: "PATCH", headers: authHeaders(),
                        body: JSON.stringify({ suivi_demarrage: newSd }),
                      });
                      if (!r.ok) { const d = await r.json().catch(()=>{}); throw new Error(d?.error || `Erreur ${r.status}`); }
                      setApprenantModal(prev => prev?.id === a.id ? { ...prev, suivi_demarrage: newSd } : prev);
                      toast.success("Disponibilités mises à jour ✓");
                      setEditDispoAppr(false);
                    } catch(e) { toast.error(e.message || "Erreur sauvegarde"); }
                    finally { setSavingDispoAppr(false); }
                  };

                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <div>
                          <div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>Créneaux de disponibilité</div>
                          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>Renseignés par l'apprenant à l'inscription ou mis à jour par le PA</div>
                        </div>
                        {!editDispoAppr && (
                          <Btn small outline onClick={()=>{ setSelDispoAppr(horairesSaved.map(h=>({...h}))); setEditDispoAppr(true); }}>✏️ Modifier</Btn>
                        )}
                      </div>

                      {horairesSaved.length === 0 && !editDispoAppr && (
                        <div style={{ background:"#fffbeb", borderRadius:10, padding:"14px 16px", border:"1.5px solid #fde68a", fontSize:13, color:"#92400e", fontWeight:600 }}>
                          ⚠️ Aucune disponibilité renseignée pour cet apprenant.
                          <button onClick={()=>{ setSelDispoAppr([]); setEditDispoAppr(true); }} style={{ marginLeft:10, background:"none", border:"none", color:"#d97706", fontWeight:700, cursor:"pointer", textDecoration:"underline", fontSize:12 }}>Ajouter</button>
                        </div>
                      )}

                      {/* Affichage lecture seule */}
                      {!editDispoAppr && horairesSaved.length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                          {horairesSaved.map((h, i) => (
                            <div key={i} style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", border:"1.5px solid #c4b5fd", borderRadius:10, padding:"8px 14px" }}>
                              <span style={{ fontSize:13, fontWeight:700, color:"#6d28d9" }}>{h.jour}</span>
                              <span style={{ fontSize:12, color:"#7c3aed", marginLeft:6 }}>de {h.debut}{h.fin ? ` à ${h.fin}` : ""}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Mode édition */}
                      {editDispoAppr && (
                        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                          {/* Chips jours */}
                          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                            {JOURS_PA.map(jour => {
                              const active = selDispoAppr.some(d => d.jour === jour);
                              return (
                                <button key={jour} type="button"
                                  onClick={() => setSelDispoAppr(prev => {
                                    if (prev.some(d => d.jour === jour)) return prev.filter(d => d.jour !== jour);
                                    const next = [...prev, { jour, debut: "08:00", fin: "10:00" }];
                                    return next.sort((a,b) => JOURS_PA.indexOf(a.jour) - JOURS_PA.indexOf(b.jour));
                                  })}
                                  style={{ padding:"7px 16px", borderRadius:20, border:`2px solid ${active?"#7c3aed":"#e2e8f0"}`, background:active?"#ede9fe":"#f8fafc", color:active?"#6d28d9":"#64748b", fontWeight:700, fontSize:12, cursor:"pointer", transition:"all .15s" }}>
                                  {jour}
                                </button>
                              );
                            })}
                          </div>
                          {/* Lignes heure début */}
                          {selDispoAppr.length > 0 && (
                            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                              {selDispoAppr.map((row, i) => (
                                <div key={row.jour} style={{ display:"flex", alignItems:"center", gap:10, background:"#f5f3ff", borderRadius:10, padding:"8px 12px", border:"1.5px solid #c4b5fd" }}>
                                  <span style={{ fontWeight:800, fontSize:12, color:"#6d28d9", minWidth:34 }}>{row.jour}</span>
                                  <span style={{ color:"#9ca3af", fontSize:11, flexShrink:0 }}>de</span>
                                  <input type="time" value={row.debut}
                                    onChange={e => setSelDispoAppr(prev => prev.map((d,j) => j===i ? {...d, debut:e.target.value} : d))}
                                    style={{ padding:"5px 8px", borderRadius:8, border:"1px solid #c4b5fd", fontSize:12, outline:"none", cursor:"pointer", background:"#fff", color:"#0f172a" }} />
                                  <span style={{ color:"#9ca3af", fontSize:11, flexShrink:0 }}>à</span>
                                  <input type="time" value={row.fin || ""}
                                    onChange={e => setSelDispoAppr(prev => prev.map((d,j) => j===i ? {...d, fin:e.target.value} : d))}
                                    style={{ padding:"5px 8px", borderRadius:8, border:"1px solid #c4b5fd", fontSize:12, outline:"none", cursor:"pointer", background:"#fff", color:"#0f172a" }} />
                                  <button type="button"
                                    onClick={() => setSelDispoAppr(prev => prev.filter((_,j) => j!==i))}
                                    style={{ marginLeft:"auto", background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:14, padding:"2px 6px", lineHeight:1, flexShrink:0 }}>×</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {selDispoAppr.length === 0 && (
                            <p style={{ fontSize:11, color:"#94a3b8", margin:0 }}>Sélectionnez des jours ci-dessus</p>
                          )}
                          <div style={{ display:"flex", gap:8 }}>
                            <Btn small onClick={saveDispoAppr} disabled={savingDispoAppr||!peut("inscriptions","update")}>{savingDispoAppr ? "Sauvegarde…" : !peut("inscriptions","update") ? "🔒 Enregistrer" : "✅ Enregistrer"}</Btn>
                            <Btn small outline onClick={()=>setEditDispoAppr(false)}>Annuler</Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>

              <div style={{ padding:"16px 24px", borderTop:"1px solid #e2e8f0", display:"flex", justifyContent:"flex-end", flexShrink:0 }}>
                <Btn outline onClick={()=>{ setApprenantModal(null); setPaSeancesPrivees([]); setPaPresencesPrivees([]); }}>Fermer</Btn>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ MODAL - Détail contrat privé ══ */}
      {selectedCours && (() => {
        const c = selectedCours;
        const statInfo = CONTRAT_STATUT[c.statut] || CONTRAT_STATUT.en_attente;
        const typeInfo = CONTRAT_TYPE[c.type_contrat] || { label: c.type_contrat||"-", icon:"📋", color:"#6b7280" };
        const coachNom = c._coachNom || (paCoachsList.find(x=>String(x.id)===String(c.coach_id)) ? `${paCoachsList.find(x=>String(x.id)===String(c.coach_id)).prenom} ${paCoachsList.find(x=>String(x.id)===String(c.coach_id)).nom}`.trim() : "-");
        const appNom   = `${c.apprenant_prenom||""} ${c.apprenant_nom||""}`.trim() || c.apprenant_nom || "-";
        const progression = c.nb_seances_total > 0 ? Math.round((c.nb_seances_realisees / c.nb_seances_total) * 100) : 0;
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}
            onClick={e=>{ if(e.target===e.currentTarget) setSelectedCours(null); }}>
            <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 24px 64px rgba(0,0,0,.2)" }}>

              {/* Header */}
              <div style={{ background:`linear-gradient(135deg,#0f172a 0%,${PA_COLOR} 100%)`, padding:"20px 24px", flexShrink:0, position:"relative" }}>
                <button onClick={()=>setSelectedCours(null)}
                  style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.2)", border:"none", borderRadius:"50%", width:30, height:30, cursor:"pointer", color:"#fff", fontSize:16 }}>✕</button>
                <div style={{ fontSize:11, color:"#c4b5fd", fontWeight:600, marginBottom:4, textTransform:"uppercase", letterSpacing:".06em" }}>📚 Contrat privé</div>
                <div style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:6 }}>{appNom}</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", fontSize:12, color:"rgba(255,255,255,.75)", alignItems:"center" }}>
                  {c.niveau && <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:6, padding:"2px 10px", fontWeight:700, color:"#fff" }}>{c.niveau}</span>}
                  <span>{typeInfo.icon} {typeInfo.label}</span>
                  <span style={{ background:"rgba(255,255,255,0.2)", color:"#fff", borderRadius:6, padding:"2px 10px", fontWeight:700 }}>{statInfo.label}</span>
                </div>
              </div>

              <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

                {/* Infos principales */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".04em", marginBottom:10 }}>👤 Apprenant</div>
                    {[
                      ["Nom complet", appNom],
                      ["Email",       c.apprenant_email    || "-"],
                      ["Téléphone",   c.apprenant_telephone|| "-"],
                      ["Niveau",      c.niveau             || "-"],
                      ["Objectif",    c.objectif           || "-"],
                    ].map(([l,v])=>(
                      <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f1f5f9", fontSize:12 }}>
                        <span style={{ color:"#9ca3af" }}>{l}</span>
                        <span style={{ fontWeight:600, maxWidth:160, textAlign:"right", wordBreak:"break-all" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:".04em", marginBottom:10 }}>📋 Contrat</div>
                    {[
                      ["Coach",         coachNom],
                      ["Type",          `${typeInfo.icon} ${typeInfo.label}`],
                      ["Prix/heure",    c.prix_h ? `${Number(c.prix_h).toLocaleString("fr-FR")} FCFA` : "-"],
                      ["Durée séance",  c.duree_seance_h ? `${c.duree_seance_h}h` : "-"],
                      ["Début",         formatDate(c.date_debut)],
                      ["Fin prévue",    formatDate(c.date_fin)],
                    ].map(([l,v])=>(
                      <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f1f5f9", fontSize:12 }}>
                        <span style={{ color:"#9ca3af" }}>{l}</span>
                        <span style={{ fontWeight:600 }}>{v||"-"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progression des séances */}
                <div style={{ background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:12, padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:"#15803d" }}>📅 Progression des séances</span>
                    <span style={{ fontSize:13, fontWeight:800, color:"#15803d" }}>{c.nb_seances_realisees||0} / {c.nb_seances_total||0}</span>
                  </div>
                  <div style={{ background:"#dcfce7", borderRadius:99, height:8, overflow:"hidden" }}>
                    <div style={{ background:"#16a34a", height:"100%", width:`${progression}%`, borderRadius:99, transition:"width .4s" }} />
                  </div>
                  <div style={{ fontSize:11, color:"#16a34a", marginTop:4, textAlign:"right", fontWeight:600 }}>{progression}%</div>
                </div>

                {/* Paiement */}
                <div style={{ background: c.paiement_confirme ? "#f0fdf4" : "#fffbeb", border:`1.5px solid ${c.paiement_confirme?"#bbf7d0":"#fde68a"}`, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color: c.paiement_confirme ? "#15803d" : "#92400e" }}>
                      {c.paiement_confirme ? "✅ Paiement confirmé" : "⏳ Paiement en attente"}
                    </div>
                    {c.paiement_montant && <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{Number(c.paiement_montant).toLocaleString("fr-FR")} FCFA · {formatDate(c.paiement_date)}</div>}
                  </div>
                  {!c.paiement_confirme && (
                    <button disabled={confirmingPaiementId===c.id||!peut("inscriptions","update")} onClick={() => {
                        if (confirmingPaiementId===c.id) return;
                        setConfirmingPaiementId(c.id);
                        Promise.resolve(handleUpdateContratStatut(c.id, "actif")).then(() =>
                          fetch(`${API_URL}/api/contrats-prives/${c.id}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify({ paiement_confirme:true }) }).then(r=>r.json()).then(d=>{ if(d.contrat){ setCours(p=>p.map(x=>x.id===c.id?d.contrat:x)); setSelectedCours(d.contrat); toast.success("Paiement confirmé - contrat activé"); }}).catch(()=>{})
                        ).finally(() => setConfirmingPaiementId(null));
                      }}
                      title={permBtnTitle("Confirmer paiement", peut("inscriptions","update"))}
                      style={permBtnStyle({ padding:"6px 14px", background:"#22c55e", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:confirmingPaiementId===c.id?"not-allowed":"pointer" }, peut("inscriptions","update"))}>
                      {confirmingPaiementId===c.id ? "⏳…" : peut("inscriptions","update") ? "✅ Confirmer paiement" : "🔒 Confirmer paiement"}
                    </button>
                  )}
                </div>

                {/* Note */}
                {c.note && (
                  <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", fontSize:12, color:"#374151", border:"1px solid #e2e8f0" }}>
                    <span style={{ fontWeight:700, color:"#9ca3af", display:"block", marginBottom:4, fontSize:11 }}>📝 NOTE</span>
                    {c.note}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap" }}>
                  {c.statut === "actif" && (
                    <button onClick={()=>handleUpdateContratStatut(c.id,"suspendu")}
                      disabled={!peut("inscriptions","update")}
                      title={permBtnTitle("Suspendre", peut("inscriptions","update"))}
                      style={permBtnStyle({ padding:"8px 14px", background:"#fef3c7", color:"#92400e", border:"1px solid #fcd34d", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }, peut("inscriptions","update"))}>
                      {peut("inscriptions","update") ? "⏸ Suspendre" : "🔒 Suspendre"}
                    </button>
                  )}
                  {c.statut === "suspendu" && (
                    <button onClick={()=>handleUpdateContratStatut(c.id,"actif")}
                      disabled={!peut("inscriptions","update")}
                      title={permBtnTitle("Reprendre", peut("inscriptions","update"))}
                      style={permBtnStyle({ padding:"8px 14px", background:"#dcfce7", color:"#15803d", border:"1px solid #bbf7d0", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }, peut("inscriptions","update"))}>
                      {peut("inscriptions","update") ? "▶ Reprendre" : "🔒 Reprendre"}
                    </button>
                  )}
                  {(c.statut === "actif" || c.statut === "suspendu") && (
                    <button onClick={()=>handleUpdateContratStatut(c.id,"termine")}
                      disabled={!peut("inscriptions","update")}
                      title={permBtnTitle("Terminer", peut("inscriptions","update"))}
                      style={permBtnStyle({ padding:"8px 14px", background:"#fee2e2", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }, peut("inscriptions","update"))}>
                      {peut("inscriptions","update") ? "🏁 Terminer" : "🔒 Terminer"}
                    </button>
                  )}
                  <button onClick={()=>setSelectedCours(null)}
                    style={{ padding:"8px 18px", background:PA_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ MODAL - Nouveau cours privé ══ */}
      {modalCours && (
        <Modal title="📚 Nouveau cours privé" onClose={()=>setModalCours(false)} wide>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <Input label="Prénom de l'apprenant *" placeholder="Ex : Yao" value={formCours.apprenant_prenom} onChange={e=>setFormCours(p=>({...p,apprenant_prenom:e.target.value}))} />
            <Input label="Nom de l'apprenant *" placeholder="Ex : Kouamé" value={formCours.apprenant_nom} onChange={e=>setFormCours(p=>({...p,apprenant_nom:e.target.value}))} />
            <Input label="Email apprenant" type="email" placeholder="apprenant@email.com" value={formCours.apprenant_email} onChange={e=>setFormCours(p=>({...p,apprenant_email:e.target.value}))} />
            <Input label="Téléphone apprenant" placeholder="+225 07 00 00 00" value={formCours.apprenant_telephone} onChange={e=>setFormCours(p=>({...p,apprenant_telephone:e.target.value}))} />
            <Select label="Type de contrat *" value={formCours.type_contrat} onChange={e=>setFormCours(p=>({...p,type_contrat:e.target.value}))}>
              <option value="en_ligne">En ligne</option>
              <option value="presentiel_bet">Présentiel BET</option>
              <option value="domicile">À domicile</option>
            </Select>
            <Select label="Coach *" value={formCours.coach_id} onChange={e=>setFormCours(p=>({...p,coach_id:e.target.value}))}>
              <option value="">Sélectionner un coach</option>
              {paCoachsList.map(c=>(
                <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
              ))}
            </Select>
            <Select label="Niveau *" value={formCours.niveau} onChange={e=>setFormCours(p=>({...p,niveau:e.target.value}))}>
              {NIVEAUX.map(n=><option key={n}>{n}</option>)}
            </Select>
            <Input label="Objectif" placeholder="Ex : TOEIC, Business English…" value={formCours.objectif} onChange={e=>setFormCours(p=>({...p,objectif:e.target.value}))} />
            <Input label="Prix / heure (FCFA) *" type="number" min={0} placeholder="Ex : 8000" value={formCours.prix_h} onChange={e=>setFormCours(p=>({...p,prix_h:e.target.value}))} />
            <Input label="Nb séances total *" type="number" min={1} placeholder="Ex : 12" value={formCours.nb_seances_total} onChange={e=>setFormCours(p=>({...p,nb_seances_total:e.target.value}))} />
            <Input label="Durée séance (h)" type="number" step="0.5" min={0.5} value={formCours.duree_seance_h} onChange={e=>setFormCours(p=>({...p,duree_seance_h:e.target.value}))} />
            <div />
            <Input label="Date de début *" type="date" value={formCours.date_debut} onChange={e=>setFormCours(p=>({...p,date_debut:e.target.value}))} />
            <Input label="Date de fin" type="date" value={formCours.date_fin} onChange={e=>setFormCours(p=>({...p,date_fin:e.target.value}))} />
            <div style={{ gridColumn:"span 2" }}>
              <Input label="Note interne" placeholder="Observations, contexte…" value={formCours.note} onChange={e=>setFormCours(p=>({...p,note:e.target.value}))} />
            </div>
          </div>

          {formCours.coach_id && formCours.prix_h && formCours.nb_seances_total && (
            <div style={{ marginTop:14, background:PA_LIGHT, borderRadius:10, padding:"12px 14px", fontSize:13 }}>
              <strong>Estimation honoraires :</strong>{" "}
              {formatMoney(+formCours.prix_h * +formCours.duree_seance_h * +formCours.nb_seances_total)}
              <span style={{ fontSize:11, color:"#64748b", marginLeft:6 }}>({formCours.nb_seances_total} séances × {formCours.duree_seance_h}h × {formatMoney(+formCours.prix_h)}/h)</span>
            </div>
          )}

          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:20 }}>
            <Btn outline onClick={()=>setModalCours(false)}>Annuler</Btn>
            <Btn onClick={handleCreerCours} disabled={creatingContrat||!peut("inscriptions","create")}>{creatingContrat ? "Création…" : peut("inscriptions","create") ? "Créer le contrat ✓" : "🔒 Créer le contrat"}</Btn>
          </div>
        </Modal>
      )}

      {/* ══ MODAL - Confirmation validation mensuelle ══ */}
      {modalValidation && (
        <Modal title="✅ Valider le récapitulatif mensuel" onClose={()=>setModalValidation(false)}>
          <div style={{ textAlign:"center", padding:"10px 0 20px" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", marginBottom:8 }}>Confirmer la validation - {moisValidation}</div>
            <div style={{ fontSize:13, color:"#64748b", lineHeight:1.6 }}>
              Vous allez valider les honoraires de <strong>{honorairesParCoach.length} coaches</strong>{" "}
              pour un total de <strong>{formatMoney(honorairesParCoach.reduce((s,h)=>s+h.totalMontant,0))}</strong>.
              <br />Ce récapitulatif sera transmis aux <strong>Ressources Humaines</strong> pour traitement.
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <Btn outline onClick={()=>setModalValidation(false)}>Annuler</Btn>
            <Btn color="#16a34a" disabled={validatingTout||!!validatingCoachId||!peut("honoraires","manage")} onClick={handleValiderTout}>{validatingTout ? "⏳ Validation…" : peut("honoraires","manage") ? "✓ Valider et transmettre aux RH" : "🔒 Valider et transmettre aux RH"}</Btn>
          </div>
        </Modal>
      )}



      {/* ══ MODAL PROSPECT DOMICILE ══ */}
      {prospectModal && (() => {
        const p = prospectModal;
        const st = STATUT_PROSPECT[p.statut] || STATUT_PROSPECT.nouveau;
        const initiales = (p.prospect_nom||"?").split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase();
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}
            onClick={()=>setProspectModal(null)}>
            <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.2)" }}
              onClick={e=>e.stopPropagation()}>

              {/* Header */}
              <div style={{ background:PA_GRADIENT, padding:"20px 24px", borderRadius:"18px 18px 0 0", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:50, height:50, borderRadius:"50%", background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:18, color:"#fff", flexShrink:0, overflow:"hidden" }}>{p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:17, fontWeight:800, color:"#fff" }}>{p.prospect_nom||"-"}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", display:"flex", gap:10, flexWrap:"wrap" }}>
                    {p.prospect_email && <span>{p.prospect_email}</span>}
                    {p.prospect_telephone && <span>📞 {p.prospect_telephone}</span>}
                  </div>
                </div>
                <span style={{ fontSize:11, fontWeight:800, padding:"4px 12px", borderRadius:999, background:st.bg, color:st.color }}>{st.icon} {st.label}</span>
                <button onClick={()=>setProspectModal(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:16, flexShrink:0 }}>✕</button>
              </div>

              <div style={{ padding:"24px", display:"flex", flexDirection:"column", gap:16 }}>

                {/* Infos contact */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {[
                    ["Type de cours",  `${p.type_cours === "en_ligne" ? "💻 En ligne" : p.type_cours === "presentiel" ? "🏢 Présentiel" : p.type_cours === "domicile" ? "🏠 À domicile" : "-"}${p.type_coaching === "prive" ? " / Privé" : p.type_coaching === "groupe" ? " / Groupe" : ""}`],
                    ["Source",          p.source || "formulaire_domicile"],
                    ["Date de demande", formatDate(p.created_at)],
                    ["Conseiller PA",   nomComplet || p.assistante_nom || "-"],
                    ["Profil",          p.profil_type === "enfant" ? "👶 Enfant" : p.profil_type === "etudiant" ? "🎓 Étudiant" : "👤 Adulte"],
                    ...(p.date_debut_formation ? [["Date de début", formatDate(p.date_debut_formation)]] : []),
                  ].map(([l,v])=>(
                    <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px", border:"1px solid #e2e8f0" }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* ─── Coaching privé : validation PA → paiement → routage (workflow "Cours Privé") ─── */}
                {/* assistante_id (colonne brute) n'est jamais renvoyé par l'API - seul l'objet
                    joint `assistantes{...}` l'est. dossier_statut ne peut de toute façon être
                    posé que via le pipeline (transmettre-pa), donc suffisant seul ici. */}
                {p.type_coaching === "prive" && p.dossier_statut && (
                  <div style={{
                    background: p.dossier_statut==="invalide" ? "#fef2f2" : p.dossier_statut==="en_attente_validation" ? "#fffbeb" : "#eff6ff",
                    border:`1.5px solid ${p.dossier_statut==="invalide" ? "#fecaca" : p.dossier_statut==="en_attente_validation" ? "#fde68a" : "#bfdbfe"}`,
                    borderRadius:12, padding:"16px 18px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:20 }}>{ { en_attente_validation:"⏳", valide:"✅", invalide:"❌", paiement_en_attente:"💳", paiement_recu:"💰" }[p.dossier_statut] || "ℹ️" }</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:800, color: p.dossier_statut==="invalide" ? "#dc2626" : "#1d4ed8" }}>
                            {{
                              en_attente_validation: "Dossier reçu - en attente de validation",
                              valide: "Validé - paiement à activer par l'assistante",
                              invalide: "Dossier invalidé",
                              paiement_en_attente: "Validé - paiement en attente côté assistante",
                              paiement_recu: "Paiement reçu - vérifiez le justificatif puis routez",
                            }[p.dossier_statut] }
                          </div>
                          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>Assistante : {(p.assistantes ? `${p.assistantes.prenom||""} ${p.assistantes.nom||""}`.trim() : "") || p.assistante_nom || "-"}</div>
                          {p.dossier_statut === "invalide" && p.motif_invalidation && (
                            <div style={{ fontSize:11, color:"#b91c1c", marginTop:4 }}>Motif : {p.motif_invalidation}</div>
                          )}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        {/* Téléchargement offert à TOUS les statuts, pas seulement « en attente » :
                            le PA cherche un coach avant de valider, mais il peut aussi avoir à
                            renvoyer la fiche plus tard - un coach qui se désiste, un dossier qui
                            change de main. Le restreindre à l'attente obligerait à rouvrir un
                            dossier déjà traité pour en ressortir l'information. */}
                        <button onClick={() => exporterFicheRechercheCoachPDF(p)}
                          title="Fiche à transmettre aux coachs pour trouver celui qui correspond"
                          style={{ padding:"7px 14px", borderRadius:8, border:`1.5px solid ${PA_COLOR}40`,
                            background:"#fff", color:PA_COLOR, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                          📄 Fiche coach
                        </button>
                        {p.dossier_statut === "en_attente_validation" && (
                          <>
                            <button onClick={() => setConfirmValiderTarget(p)} disabled={validationLoading}
                              style={{ padding:"7px 14px", borderRadius:8, border:"none", background:"#16a34a", color:"#fff", fontWeight:700, fontSize:12, cursor: validationLoading?"wait":"pointer" }}>
                              ✅ Valider
                            </button>
                            <button onClick={() => { setInvaliderTarget(p); setInvaliderMotif(""); }} disabled={validationLoading}
                              style={{ padding:"7px 14px", borderRadius:8, border:"1.5px solid #fca5a5", background:"#fff", color:"#dc2626", fontWeight:700, fontSize:12, cursor: validationLoading?"wait":"pointer" }}>
                              ❌ Invalider
                            </button>
                          </>
                        )}
                        {p.dossier_statut === "paiement_recu" && (
                          p.routing_statut ? (
                            <span style={{ fontSize:12, fontWeight:700, padding:"6px 14px", borderRadius:8, background:"#f0fdf4", color:"#15803d", whiteSpace:"nowrap" }}>
                              ✅ Transmis{p.type_cours === "en_ligne" ? " à l'Onboarding" : " à l'assistante"}
                            </span>
                          ) : (
                            <button onClick={() => setConfirmRouterTarget(p)} disabled={validationLoading}
                              style={{ padding:"7px 14px", borderRadius:8, border:"none", background:PA_COLOR, color:"#fff", fontWeight:700, fontSize:12, cursor: validationLoading?"wait":"pointer", whiteSpace:"nowrap" }}>
                              {p.type_cours === "en_ligne" ? "📥 Transmettre à l'Onboarding" : "🏢 Transmettre à l'assistante"}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Infos enfant si mineur */}
                {p.profil_type === "enfant" && (() => {
                  const sd = p.suivi_demarrage || {};
                  const prenom = p.prenom_enfant || sd.prenom_enfant || "";
                  const nom    = p.nom_enfant    || sd.nom_enfant    || "";
                  const age    = p.age_enfant    || sd.age_enfant    || "";
                  const classe = p.niveau_classe_enfant || sd.niveau_classe_enfant || "";
                  if (!prenom && !nom && !age && !classe) return null;
                  return (
                    <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:12, padding:"14px 16px" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1d4ed8", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                        <span>👶</span> Informations de l'enfant
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:13 }}>
                        {(prenom || nom) && <div style={{ gridColumn:"1/-1" }}><span style={{ color:"#9ca3af", fontWeight:600 }}>Nom complet : </span><strong>{`${prenom} ${nom}`.trim()}</strong></div>}
                        {age    && <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Âge : </span><strong>{age}</strong></div>}
                        {classe && <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Classe : </span><strong>{classe}</strong></div>}
                      </div>
                    </div>
                  );
                })()}

                {/* Infos parent si mineur */}
                {p.profil_type === "enfant" && (p.nom_parent || p.telephone_parent) && (
                  <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#92400e", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                      <span>👨‍👩‍👧</span> Informations du parent / tuteur
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:13 }}>
                      {p.nom_parent && <div style={{ gridColumn:"1/-1" }}><span style={{ color:"#9ca3af", fontWeight:600 }}>Nom : </span><strong>{p.nom_parent}</strong></div>}
                      {p.telephone_parent && <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Tél : </span><strong>{p.telephone_parent}</strong></div>}
                      {p.email_parent && <div><span style={{ color:"#9ca3af", fontWeight:600 }}>Email : </span><strong>{p.email_parent}</strong></div>}
                    </div>
                  </div>
                )}

                {/* ─── DOSSIER PROSPECT (besoins) ─── */}
                {(() => {
                  const sd = p.suivi_demarrage || {};
                  const dossierComplet = sd.niveau_prospect && sd.formation_souhaitee;
                  // Coaching privé : dossier désormais rempli par l'assistante (elle le reçoit
                  // en premier) - le PA le lit ici en lecture seule, il ne fait que valider/
                  // invalider (cf. section de validation plus haut dans ce modal).
                  const readOnlyAssistante = p.type_coaching === "prive";
                  // Groupe : même principe - l'assistante (ou le site public) remplit le
                  // dossier, l'affectation du coach se fait désormais via Onboarding + l'onglet
                  // Groupes (PATCH /api/groupes/:id), jamais en éditant ce dossier ici. Avant ce
                  // correctif, le PA pouvait encore éditer niveau/formation/type de coaching
                  // "privé" (Classique/Intensive, lieu domicile/cabinet) sur un dossier groupe,
                  // un formulaire qui ne correspond même pas à une offre groupe.
                  const readOnlyGroupe = p.type_coaching !== "prive";
                  const locked = p.statut === "converti" || readOnlyAssistante || readOnlyGroupe;
                  const disabledStyle = locked ? { background:"#f1f5f9", color:"#64748b", cursor:"not-allowed", opacity:0.75 } : {};

                  // Groupe : contrairement au privé, ce dossier n'utilise pas
                  // suivi_demarrage.niveau_prospect/formation_souhaitee (des champs remplis par
                  // le tunnel de coaching privé) - les infos pertinentes pour un groupe vivent
                  // directement sur la fiche (niveau_client, inscription_offre, objectif_client,
                  // centre_nom). Rendu dédié en lecture seule, séparé du formulaire privé
                  // ci-dessous pour ne rien changer à son comportement.
                  if (readOnlyGroupe) {
                    const _dsp = sd.disponibilites || {};
                    const _hor = Array.isArray(_dsp.horaires) && _dsp.horaires.length > 0 ? _dsp.horaires : [];
                    const _leg = _hor.length === 0 ? [...(_dsp.jours||[]), ...(_dsp.creneaux||[])] : [];
                    const hasDispo = _hor.length > 0 || _leg.length > 0;
                    return (
                      <div style={{ background:"#f0fdf4", borderRadius:12, padding:"16px 18px", border:"1.5px solid #bbf7d0" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                          <span style={{ fontSize:16 }}>✅</span>
                          <div style={{ fontSize:13, fontWeight:800, color:"#15803d" }}>Besoin du client</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f5f3ff", border:"1.5px solid #ddd6fe", borderRadius:9, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#6d28d9", fontWeight:600 }}>
                          <span style={{ fontSize:15 }}>👁️</span>
                          <span>Rempli par l'assistante commerciale - lecture seule ici. L'affectation du coach se fait depuis l'onglet Groupes une fois la classe créée par Onboarding.</span>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom: hasDispo ? 8 : 0 }}>
                          {[
                            ["🎯 Niveau évalué",   p.niveau_client],
                            ["📚 Offre souscrite", p.inscription_offre],
                            ["🎯 Objectif",        p.objectif_client],
                            ...(p.centre_nom ? [["📍 Centre", p.centre_nom]] : []),
                          ].map(([l,v])=>(
                            <div key={l} style={{ background:"#fff", borderRadius:8, padding:"8px 10px", border:"1px solid #bbf7d0" }}>
                              <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", marginBottom:2 }}>{l}</div>
                              <div style={{ fontSize:13, fontWeight:800, color: v ? "#0f172a" : "#94a3b8" }}>{v || "Non renseigné"}</div>
                            </div>
                          ))}
                        </div>
                        {hasDispo && (
                          <div style={{ background:"#fff", borderRadius:8, padding:"8px 12px", border:"1px solid #bbf7d0" }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", marginBottom:5 }}>📅 Disponibilités</div>
                            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                              {_hor.map((h,i)=>(
                                <span key={i} style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"#ede9fe", color:PA_COLOR }}>{h.jour} {h.debut}{h.fin ? `–${h.fin}` : ""}</span>
                              ))}
                              {_leg.map(j=>(
                                <span key={j} style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"#ede9fe", color:PA_COLOR }}>{j}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Coaching privé jamais transmis (dossier_statut null) : l'assistante n'a
                  // pas encore cliqué "Transmettre au PA" - ne pas afficher le formulaire
                  // "Besoin du client" ni la mention Valider/Invalider, sans quoi le PA a
                  // l'impression que le dossier lui est déjà parvenu alors qu'il est encore
                  // en cours de saisie côté Prospects parcours.
                  if (readOnlyAssistante && !p.dossier_statut && p.statut !== "converti") {
                    return (
                      <div style={{ background:"#f8fafc", borderRadius:12, padding:"16px 18px", border:"1.5px dashed #cbd5e1" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:16 }}>⏳</span>
                          <div style={{ fontSize:13, fontWeight:800, color:"#64748b" }}>
                            Dossier pas encore transmis par l'assistante commerciale
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:"#94a3b8", marginTop:6 }}>
                          Elle complète encore le "Besoin du client" dans Prospects parcours. Vous serez notifié dès la transmission.
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div style={{ background: dossierComplet ? "#f0fdf4" : "#fffbeb", borderRadius:12, padding:"16px 18px", border:`1.5px solid ${dossierComplet?"#bbf7d0":"#fde68a"}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                        <span style={{ fontSize:16 }}>{dossierComplet ? "✅" : "⚠️"}</span>
                        <div style={{ fontSize:13, fontWeight:800, color: dossierComplet ? "#15803d" : "#92400e" }}>
                          Besoin du client {dossierComplet ? "(renseigné)" : readOnlyAssistante ? "(en attente de saisie par l'assistante)" : "(à compléter avant affectation)"}
                        </div>
                      </div>

                      {/* Bannière lecture seule - rempli par l'assistante, privé comme groupe */}
                      {(readOnlyAssistante || readOnlyGroupe) && p.statut !== "converti" && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f5f3ff", border:"1.5px solid #ddd6fe", borderRadius:9, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#6d28d9", fontWeight:600 }}>
                          <span style={{ fontSize:15 }}>👁️</span>
                          <span>
                            {readOnlyAssistante
                              ? "Rempli par l'assistante commerciale - lecture seule ici. Utilisez Valider/Invalider ci-dessus."
                              : "Rempli par l'assistante commerciale - lecture seule ici. L'affectation du coach se fait depuis l'onglet Groupes une fois la classe créée par Onboarding."}
                          </span>
                        </div>
                      )}

                      {/* Bannière verrouillage apprenant converti */}
                      {p.statut === "converti" && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:9, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#1d4ed8", fontWeight:600 }}>
                          <span style={{ fontSize:15 }}>🔒</span>
                          <span>Apprenant converti - les données du contrat sont verrouillées. Seules les disponibilités et la durée restent modifiables.</span>
                        </div>
                      )}

                      {/* Affichage si déjà renseigné */}
                      {dossierComplet && (
                        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>
                            {[
                              ["Niveau", sd.niveau_prospect],
                              ["Durée", sd.nb_seances_souhaitees ? sd.nb_seances_souhaitees+" mois" : "-"],
                              ["Formation", sd.formation_souhaitee],
                              ["Coût total", sd.cout_formation ? Number(sd.cout_formation).toLocaleString("fr-FR")+" F" : "-"],
                            ].map(([l,v])=>(
                              <div key={l} style={{ background:"#fff", borderRadius:8, padding:"8px 10px", border:"1px solid #bbf7d0" }}>
                                <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", marginBottom:2 }}>{l}</div>
                                <div style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>{v}</div>
                              </div>
                            ))}
                          </div>

                          {/* L'OBJECTIF DU CLIENT — le champ sur lequel le conseiller choisit un
                              coach. Il manquait ici alors qu'il s'affiche déjà sur les dossiers de
                              GROUPE (plus haut) : quand ce rendu-là a été ajouté, il a été écrit à
                              part « pour ne rien changer au formulaire privé », et le privé est
                              resté sans objectif — celui-là même où il compte le plus.

                              Pleine largeur, pas une cinquième carte : une phrase d'objectif ne tient
                              pas dans un quart de colonne et serait tronquée. Et ambre quand il manque,
                              pour qu'une absence saute aux yeux AVANT le clic sur « Valider » plutôt
                              que de passer pour une case vide de plus. */}
                          <div style={{ background: p.objectif_client ? "#f5f3ff" : "#fffbeb",
                            border:`1.5px solid ${p.objectif_client ? "#ddd6fe" : "#fde68a"}`,
                            borderRadius:8, padding:"10px 12px" }}>
                            <div style={{ fontSize:10, fontWeight:700, letterSpacing:".04em", textTransform:"uppercase",
                              color: p.objectif_client ? "#6d28d9" : "#92400e", marginBottom:4 }}>
                              🎯 Objectif du client
                            </div>
                            <div style={{ fontSize:13, lineHeight:1.6, whiteSpace:"pre-wrap", fontWeight: p.objectif_client ? 600 : 700,
                              color: p.objectif_client ? "#0f172a" : "#92400e" }}>
                              {p.objectif_client
                                || "Non renseigné — demandez-le à l'assistante avant d'affecter un coach."}
                            </div>
                          </div>

                          {/* LE FAMILLE, quand le coaching est pris à plusieurs.
                              Un couple ou une famille = UN dossier, UN montant, UN échéancier,
                              mais plusieurs apprenants. Le PA doit le savoir avant d'affecter
                              un coach : trois personnes dans la même séance, ce n'est pas le
                              même exercice qu'un tête-à-tête, et la classe devra être créée
                              avec la bonne capacité. */}
                          {Array.isArray(sd.membres_famille) && sd.membres_famille.length > 0 && (
                            <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:8, padding:"10px 12px" }}>
                              <div style={{ fontSize:10, fontWeight:700, letterSpacing:".04em", textTransform:"uppercase",
                                color:"#1d4ed8", marginBottom:6 }}>
                                👥 Coaching en famille · {1 + sd.membres_famille.length} apprenants
                              </div>
                              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                                <span style={{ fontSize:11.5, fontWeight:700, padding:"3px 10px", borderRadius:999,
                                  background:"#1d4ed8", color:"#fff" }}>
                                  {p.prospect_nom} · payeur
                                </span>
                                {sd.membres_famille.map((m, i) => (
                                  <span key={i} style={{ fontSize:11.5, fontWeight:700, padding:"3px 10px", borderRadius:999,
                                    background:"#dbeafe", color:"#1e40af" }}>
                                    {[m.prenom, m.nom].filter(Boolean).join(" ")}
                                    {m.lien ? ` · ${m.lien}` : ""}{m.niveau ? ` · ${m.niveau}` : ""}
                                    {(m.telephone || m.email) ? ` · ${m.telephone || m.email}` : ""}
                                  </span>
                                ))}
                              </div>
                              <div style={{ fontSize:10, color:"#64748b", marginTop:6, lineHeight:1.5 }}>
                                Le tarif du dossier est global pour la famille : il ne se multiplie pas par le nombre de personnes.
                              </div>
                            </div>
                          )}

                          {(() => {
                            const _dsp = sd.disponibilites || {};
                            const _hor = Array.isArray(_dsp.horaires) && _dsp.horaires.length > 0 ? _dsp.horaires : [];
                            const _leg = _hor.length === 0 ? [...(_dsp.jours||[]), ...(_dsp.creneaux||[])] : [];
                            const hasAny = _hor.length > 0 || _leg.length > 0;
                            return hasAny ? (
                              <div style={{ background:"#fff", borderRadius:8, padding:"8px 12px", border:"1px solid #bbf7d0" }}>
                                <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", marginBottom:5 }}>📅 Disponibilités</div>
                                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                  {_hor.map((h,i)=>(
                                    <span key={i} style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"#ede9fe", color:PA_COLOR }}>{h.jour} {h.debut}{h.fin ? `–${h.fin}` : ""}</span>
                                  ))}
                                  {_leg.map(j=>(
                                    <span key={j} style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"#ede9fe", color:PA_COLOR }}>{j}</span>
                                  ))}
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {/* Formulaire éditable */}
                      {/* Ligne 1 : Niveau + Formation */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:"#374151" }}>Niveau détecté *</label>
                          <div style={{ display:"flex", gap:6 }}>
                            <select value={prospectDossier.niveau} onChange={e=>setProspectDossier(prev=>({...prev, niveau:e.target.value}))}
                              disabled={locked}
                              style={{ flex:1, padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none", ...disabledStyle }}>
                              <option value="">- Choisir -</option>
                              {NIVEAUX.map(n=><option key={n} value={n}>{n}</option>)}
                            </select>
                            <button type="button"
                              onClick={()=>setShowTestNiveauModal(true)}
                              disabled={locked}
                              style={{ padding:"7px 10px", borderRadius:7, border:`1.5px solid ${locked?"#e2e8f0":PA_COLOR}`, background: locked ? "#f1f5f9" : PA_LIGHT, color: locked ? "#94a3b8" : PA_COLOR, fontSize:11, fontWeight:700, cursor: locked ? "not-allowed" : "pointer", whiteSpace:"nowrap", flexShrink:0 }}>
                              🧪 Tester
                            </button>
                          </div>
                          {prospectDossier.niveau && (
                            <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:CEFR_COLOR[prospectDossier.niveau]+"20", color:CEFR_COLOR[prospectDossier.niveau], width:"fit-content" }}>
                              Niveau {prospectDossier.niveau}
                            </span>
                          )}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:"#374151" }}>Formation souhaitée *</label>
                          {(() => {
                            const offresDomicile   = paCatalogueOffres.filter(o => o.categorie === "domicile");
                            const offresEnLigne    = paCatalogueOffres.filter(o => o.categorie === "en_ligne");
                            const offresPresentiel = paCatalogueOffres.filter(o => o.categorie === "presentiel");
                            const fallback = ["Anglais général","Business English","TOEIC Préparation","IELTS Préparation","Communication professionnelle","Anglais académique","Anglais professionnel"];
                            const renderOpt = (o, prefix) => (
                              <option key={`${prefix}_${o.id}`} value={o.label}>
                                {o.label}{o.prix_str && o.prix_str !== "Sur devis" ? "  -  "+o.prix_str : ""}
                              </option>
                            );
                            const hasCatalogue = paCatalogueOffres.length > 0;
                            // Le prospect a pu saisir une formation qui ne correspond plus à
                            // aucune entrée du catalogue actuel (ex: libellé générique envoyé
                            // par le formulaire, ou offre retirée depuis) - sans cette option de
                            // secours, le <select> l'affiche comme "non choisi" alors que la
                            // donnée existe bel et bien en base (dossier qui semble "vide").
                            const valeursConnues = new Set([
                              ...fallback,
                              ...paCatalogueOffres.map(o => o.label),
                            ]);
                            const formationInconnue = prospectDossier.formation && !valeursConnues.has(prospectDossier.formation);
                            return (
                              <select value={prospectDossier.formation} onChange={e=>setProspectDossier(prev=>({...prev, formation:e.target.value}))}
                                disabled={locked}
                                style={{ padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none", ...disabledStyle }}>
                                <option value="">- Choisir une formation privée -</option>
                                {formationInconnue && (
                                  <option value={prospectDossier.formation}>📝 {prospectDossier.formation} (saisie prospect)</option>
                                )}
                                <optgroup label="🏠 À domicile">
                                  {hasCatalogue
                                    ? (offresDomicile.length > 0 ? offresDomicile : offresPresentiel.length > 0 ? offresPresentiel : offresEnLigne).map(o => renderOpt(o, "dom"))
                                    : fallback.map(f => <option key={`dom_${f}`} value={f}>{f}</option>)
                                  }
                                </optgroup>
                                <optgroup label="💻 En ligne">
                                  {hasCatalogue
                                    ? offresEnLigne.map(o => renderOpt(o, "el"))
                                    : fallback.map(f => <option key={`el_${f}`} value={f}>{f}</option>)
                                  }
                                </optgroup>
                                <optgroup label="🏢 Présentiel (Au cabinet)">
                                  {hasCatalogue
                                    ? offresPresentiel.map(o => renderOpt(o, "pres"))
                                    : fallback.map(f => <option key={`pres_${f}`} value={f}>{f}</option>)
                                  }
                                </optgroup>
                              </select>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Ligne 2 : Type coaching + Lieu */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:"#374151" }}>Type de coaching *</label>
                          <select value={prospectDossier.type_coaching} onChange={e=>{
                            const tc = e.target.value;
                            const tarif = GRILLE_PRIVE[tc]?.[prospectDossier.lieu==="domicile"?"domicile":prospectDossier.lieu==="en_ligne"?"en_ligne":"cabinet"] || 0;
                            const mois  = Number(prospectDossier.duree_mois) || 0;
                            setProspectDossier(prev=>({...prev, type_coaching:tc, cout_formation: mois>0 ? String(tarif*mois) : prev.cout_formation}));
                          }} disabled={locked} style={{ padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none", ...disabledStyle }}>
                            <option value="classique">Classique - 3 séances × 2h/sem</option>
                            <option value="intensive">Intensive - 5 séances/sem</option>
                          </select>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:"#374151" }}>Lieu du coaching *</label>
                          <select value={prospectDossier.lieu} onChange={e=>{
                            const lieu = e.target.value;
                            const tarif = GRILLE_PRIVE[prospectDossier.type_coaching]?.[lieu==="domicile"?"domicile":lieu==="en_ligne"?"en_ligne":"cabinet"] || 0;
                            const mois  = Number(prospectDossier.duree_mois) || 0;
                            setProspectDossier(prev=>({...prev, lieu, cout_formation: mois>0 ? String(tarif*mois) : prev.cout_formation}));
                          }} disabled={locked} style={{ padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none", ...disabledStyle }}>
                            <option value="cabinet">Au cabinet</option>
                            <option value="domicile">À domicile</option>
                            <option value="en_ligne">En ligne</option>
                          </select>
                        </div>
                      </div>
                      {/* Ligne 2b : Adresse domicile OU choix centre */}
                      {prospectDossier.lieu === "domicile" ? (
                        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:10 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:"#374151" }}>🏠 Adresse du domicile *</label>
                          <input
                            type="text"
                            value={prospectDossier.adresse_coaching}
                            onChange={e=>setProspectDossier(prev=>({...prev, adresse_coaching:e.target.value}))}
                            disabled={locked}
                            placeholder="Ex : Cocody Riviera 3, Rue des Jardins, Abidjan"
                            style={{ padding:"8px 10px", border:"1.5px solid #fde68a", borderRadius:7, fontSize:12, outline:"none", ...(locked ? disabledStyle : { background:"#fffbeb" }) }}
                          />
                          <span style={{ fontSize:10, color:"#d97706" }}>Adresse complète pour le déplacement du coach</span>
                        </div>
                      ) : prospectDossier.lieu === "en_ligne" ? (
                        <div style={{ display:"flex", alignItems:"center", gap:8, background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:9, padding:"10px 14px", marginBottom:10, fontSize:12, color:"#1d4ed8", fontWeight:700 }}>
                          💻 Séances en ligne (visio) - aucun centre à sélectionner
                        </div>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:10 }}>
                          <label style={{ fontSize:11, fontWeight:700, color:"#374151" }}>🏢 Centre BET *</label>
                          <select
                            value={prospectDossier.centre_coaching}
                            onChange={e=>setProspectDossier(prev=>({...prev, centre_coaching:e.target.value}))}
                            disabled={locked}
                            style={{ padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none", ...disabledStyle }}
                          >
                            <option value="">- Sélectionner un centre -</option>
                            {/* Valeur enregistrée qui ne correspond plus à une clé connue (cache
                                centres périmé, centre renommé/retiré) - sans cette option de
                                secours, le <select> l'affiche comme "non choisi" alors que la
                                donnée existe en base. */}
                            {prospectDossier.centre_coaching && !paCentresList.some(c => c.key === prospectDossier.centre_coaching) && (
                              <option value={prospectDossier.centre_coaching}>📝 {prospectDossier.centre_coaching} (valeur enregistrée)</option>
                            )}
                            {paCentresList.map(c=>(
                              <option key={c.key} value={c.key}>{c.name}</option>
                            ))}
                          </select>
                          <span style={{ fontSize:10, color:"#6b7280" }}>Centre où se déroulent les séances</span>
                        </div>
                      )}
                      {/* ── Disponibilités - chips jours + heure début ── */}
                      {(() => {
                        const JOURS_FORM = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
                        const horaires = prospectDossier.disponibilites?.horaires || [];
                        const setHoraires = (fn) => setProspectDossier(prev => ({
                          ...prev,
                          disponibilites: { ...prev.disponibilites, horaires: fn(prev.disponibilites?.horaires || []) }
                        }));
                        return (
                          <div style={{ marginBottom:10 }}>
                            <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:8 }}>
                              📅 Disponibilités de l'apprenant
                              {horaires.length > 0 && <span style={{ marginLeft:6, fontSize:10, fontWeight:500, color:PA_COLOR }}>{horaires.length} jour{horaires.length>1?"s":""}</span>}
                            </label>
                            {/* Chips jours */}
                            <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:horaires.length>0?10:0 }}>
                              {JOURS_FORM.map(jour => {
                                const active = horaires.some(h => h.jour === jour);
                                return (
                                  <button key={jour} type="button"
                                    disabled={locked}
                                    onClick={() => { if(locked) return; setHoraires(prev => {
                                      if (prev.some(h => h.jour === jour)) return prev.filter(h => h.jour !== jour);
                                      const next = [...prev, { jour, debut:"08:00", fin:"10:00" }];
                                      return next.sort((a,b) => JOURS_FORM.indexOf(a.jour) - JOURS_FORM.indexOf(b.jour));
                                    }); }}
                                    style={{ padding:"6px 14px", borderRadius:20, border:`2px solid ${active?PA_COLOR:"#e2e8f0"}`,
                                      background:active?PA_COLOR+"15":"#f8fafc", color:active?PA_DARK:"#64748b",
                                      fontWeight:700, fontSize:11, cursor:locked?"not-allowed":"pointer", opacity:locked?0.7:1, transition:"all .15s" }}>
                                    {jour}
                                  </button>
                                );
                              })}
                            </div>
                            {/* Lignes heure début */}
                            {horaires.length > 0 && (
                              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                {horaires.map((h, i) => (
                                  <div key={h.jour} style={{ display:"flex", alignItems:"center", gap:9, padding:"7px 11px", background:PA_COLOR+"0d", border:`1.5px solid ${PA_COLOR}30`, borderRadius:9 }}>
                                    <span style={{ fontWeight:800, fontSize:11, color:PA_DARK, minWidth:32 }}>{h.jour}</span>
                                    <span style={{ fontSize:10, color:"#9ca3af", flexShrink:0 }}>de</span>
                                    <input type="time" value={h.debut||""}
                                      disabled={locked}
                                      onChange={e => setHoraires(prev => prev.map((hh,j) => j===i ? {...hh, debut:e.target.value} : hh))}
                                      style={{ padding:"4px 7px", border:`1px solid ${PA_COLOR}40`, borderRadius:7, fontSize:11, background:"#fff", color:"#0f172a", cursor:locked?"not-allowed":"pointer" }} />
                                    <span style={{ fontSize:10, color:"#9ca3af", flexShrink:0 }}>à</span>
                                    <input type="time" value={h.fin||""}
                                      disabled={locked}
                                      onChange={e => setHoraires(prev => prev.map((hh,j) => j===i ? {...hh, fin:e.target.value} : hh))}
                                      style={{ padding:"4px 7px", border:`1px solid ${PA_COLOR}40`, borderRadius:7, fontSize:11, background:"#fff", color:"#0f172a", cursor:locked?"not-allowed":"pointer" }} />
                                    {!locked && (
                                      <button type="button" onClick={() => setHoraires(prev => prev.filter((_,j) => j!==i))}
                                        style={{ background:"none", border:"none", cursor:"pointer", color:"#ef4444", fontWeight:900, fontSize:14, padding:"0 0 0 4px", marginLeft:"auto", lineHeight:1 }}>×</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {horaires.length === 0 && !locked && (
                              <p style={{ fontSize:10, color:"#9ca3af", margin:0 }}>Cliquez sur un jour pour ajouter un créneau</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* ── Date de début ── */}
                      <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:10 }}>
                        <label style={{ fontSize:11, fontWeight:700, color:"#374151" }}>📅 Date de début de la formation</label>
                        <input type="date"
                          value={prospectDossier.date_debut||""}
                          onChange={e=>setProspectDossier(prev=>({...prev, date_debut:e.target.value}))}
                          disabled={locked}
                          style={{ padding:"8px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:12, outline:"none", ...(locked?disabledStyle:{}) }} />
                      </div>

                      {/* ── Modal Test de niveau ── */}
                      {showTestNiveauModal && (
                        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:4000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
                          onClick={e => { if (e.target === e.currentTarget) setShowTestNiveauModal(false); }}>
                          <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:440, padding:"22px 24px", boxShadow:"0 24px 64px rgba(0,0,0,.25)" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                              <div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>🧪 Test de niveau - {prospectModal?.prospect_nom}</div>
                              <button onClick={()=>setShowTestNiveauModal(false)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#94a3b8" }}>✕</button>
                            </div>

                            {/* Renseigner manuellement */}
                            <div style={{ marginBottom:16 }}>
                              <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>Renseigner manuellement</label>
                              <select value={prospectDossier.niveau} onChange={e=>setProspectDossier(prev=>({...prev, niveau:e.target.value}))}
                                style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, outline:"none" }}>
                                <option value="">- Choisir -</option>
                                {NIVEAUX.map(n=><option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>

                            {/* Envoyer le lien du test */}
                            <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", marginBottom:6 }}>📋 Envoyer le lien du test</div>
                              <p style={{ fontSize:11, color:"#64748b", margin:"0 0 10px" }}>Le prospect passe le test lui-même - dès qu'il valide, son niveau se renseigne automatiquement ici.</p>
                              <button type="button"
                                onClick={()=>{
                                  const email = prospectModal?.prospect_email || "";
                                  const nom   = prospectModal?.prospect_nom   || "";
                                  const lien = `${FRONTEND_URL}/test-niveau?ref=${profil?.id||""}${email?`&email=${encodeURIComponent(email)}`:""}${nom?`&nom=${encodeURIComponent(nom)}`:""}`;
                                  navigator.clipboard.writeText(lien).then(()=>toast.success("Lien test copié !")).catch(()=>toast.error("Impossible de copier"));
                                }}
                                style={{ width:"100%", padding:"9px", borderRadius:8, border:`1.5px solid ${PA_COLOR}`, background:PA_LIGHT, color:PA_COLOR, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                                📋 Copier le lien test
                              </button>
                            </div>

                            {/* Vérifier si déjà passé */}
                            <div style={{ marginBottom:12 }}>
                              <button type="button"
                                onClick={()=>verifierResultatTest(prospectModal?.prospect_email)}
                                disabled={verifyingTestResult}
                                style={{ width:"100%", padding:"9px", borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#374151", fontWeight:700, fontSize:12, cursor:verifyingTestResult?"wait":"pointer" }}>
                                {verifyingTestResult ? "⏳ Vérification…" : "🔄 Vérifier si le test a été passé"}
                              </button>
                            </div>

                            {/* Test oral immédiat (au téléphone) */}
                            <button type="button"
                              onClick={()=>{ setShowTestNiveauModal(false); launchMiniTest(); }}
                              disabled={miniTestLoading}
                              style={{ width:"100%", padding:"9px", borderRadius:8, border:"1.5px dashed #cbd5e1", background:"#fff", color:"#64748b", fontWeight:600, fontSize:12, cursor:"pointer" }}>
                              {miniTestLoading ? "⏳ Chargement…" : "🎤 Ou faire passer un test oral maintenant"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── Mini test de niveau ── */}
                      {miniTestStep !== "idle" && (
                        <div style={{ background:"#f8fafc", border:`1.5px solid ${PA_COLOR}30`, borderRadius:12, padding:16, marginBottom:12 }}>

                          {/* Test actif insuffisant (pas assez de QCM configurés) */}
                          {miniTestStep === "unavailable" && (
                            <div style={{ textAlign:"center", padding:"12px 8px" }}>
                              <div style={{ fontSize:28, marginBottom:8 }}>🧪</div>
                              <div style={{ fontWeight:700, fontSize:13, color:"#0f172a", marginBottom:4 }}>Test de placement rapide indisponible</div>
                              <div style={{ fontSize:12, color:"#64748b" }}>Aucun test de niveau actif avec assez de questions QCM/Vrai-Faux n'est configuré pour le moment. Passez par l'onglet "Test oral" ou contactez un Agent Placement Test.</div>
                              <button type="button" onClick={()=>setMiniTestStep("idle")} style={{ marginTop:12, padding:"7px 16px", background:"#f1f5f9", color:"#374151", border:"1px solid #e2e8f0", borderRadius:8, fontSize:12, cursor:"pointer" }}>Fermer</button>
                            </div>
                          )}

                          {/* En cours */}
                          {miniTestStep === "running" && miniTest && (() => {
                            const answered = Object.keys(miniTestAnswers).length;
                            const total    = miniTest.length;
                            const allDone  = answered === total;
                            return (
                              <div>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>🧪 Test de placement rapide</div>
                                  <span style={{ fontSize:11, color:"#9ca3af" }}>{answered}/{total} répondu{answered!==1?"s":""}</span>
                                </div>
                                {/* Barre progression */}
                                <div style={{ height:4, background:"#e5e7eb", borderRadius:2, marginBottom:14, overflow:"hidden" }}>
                                  <div style={{ height:"100%", width:`${(answered/total)*100}%`, background:PA_COLOR, borderRadius:2, transition:"width .3s" }} />
                                </div>
                                <div style={{ display:"flex", flexDirection:"column", gap:10, maxHeight:320, overflowY:"auto" }}>
                                  {miniTest.map((q, qi) => (
                                    <div key={qi} style={{ background:"#fff", borderRadius:9, padding:"10px 12px", border:`1.5px solid ${miniTestAnswers[qi]!==undefined?PA_COLOR+"50":"#e5e7eb"}` }}>
                                      <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", marginBottom:8 }}>
                                        <span style={{ color:PA_COLOR, marginRight:6 }}>{qi+1}.</span>{q.question}
                                      </div>
                                      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                                        {q.options.map((opt, oi) => (
                                          <button key={oi} type="button"
                                            onClick={()=>setMiniTestAnswers(prev=>({...prev,[qi]:oi}))}
                                            style={{
                                              padding:"6px 10px", borderRadius:7, border:"1.5px solid", textAlign:"left", fontSize:12, cursor:"pointer",
                                              borderColor: miniTestAnswers[qi]===oi ? PA_COLOR : "#e5e7eb",
                                              background:  miniTestAnswers[qi]===oi ? PA_LIGHT : "#f8fafc",
                                              color:       miniTestAnswers[qi]===oi ? PA_COLOR : "#374151",
                                              fontWeight:  miniTestAnswers[qi]===oi ? 700 : 400,
                                            }}>
                                            <span style={{ marginRight:6 }}>{"ABCD"[oi]}.</span>{opt}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button type="button" onClick={finishMiniTest} disabled={!allDone}
                                  style={{ marginTop:12, width:"100%", padding:"9px", background:allDone?PA_COLOR:"#e5e7eb", color:allDone?"#fff":"#9ca3af", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:allDone?"pointer":"not-allowed" }}>
                                  {allDone ? "✅ Voir mon niveau" : `Répondez à toutes les questions (${total-answered} restante${total-answered!==1?"s":""})`}
                                </button>
                              </div>
                            );
                          })()}

                          {/* Résultat */}
                          {miniTestStep === "result" && miniTestResult && (
                            <div style={{ textAlign:"center" }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:14 }}>🎯 Résultat du test de placement</div>
                              <div style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:80, height:80, borderRadius:"50%", background:CEFR_COLOR[miniTestResult.level]+"18", border:`3px solid ${CEFR_COLOR[miniTestResult.level]}`, marginBottom:12 }}>
                                <div>
                                  <div style={{ fontSize:24, fontWeight:900, color:CEFR_COLOR[miniTestResult.level], lineHeight:1 }}>{miniTestResult.level}</div>
                                  <div style={{ fontSize:10, color:"#9ca3af" }}>CECRL</div>
                                </div>
                              </div>
                              <div style={{ fontSize:13, color:"#374151", marginBottom:6 }}>
                                Score : <strong>{miniTestResult.score}/{miniTestResult.total}</strong> - <strong>{miniTestResult.pct}%</strong>
                              </div>
                              {/* Barre score */}
                              <div style={{ height:8, background:"#e5e7eb", borderRadius:4, marginBottom:16, overflow:"hidden", maxWidth:300, margin:"0 auto 16px" }}>
                                <div style={{ height:"100%", width:`${miniTestResult.pct}%`, background:CEFR_COLOR[miniTestResult.level], borderRadius:4 }} />
                              </div>
                              <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
                                <button type="button" onClick={()=>applyTestLevel(miniTestResult.level)}
                                  style={{ padding:"8px 20px", background:CEFR_COLOR[miniTestResult.level], color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                                  ✅ Appliquer le niveau {miniTestResult.level}
                                </button>
                                <button type="button" onClick={()=>{ setMiniTestStep("running"); setMiniTestAnswers({}); setMiniTestResult(null); }}
                                  style={{ padding:"8px 14px", background:"#f1f5f9", color:"#374151", border:"1px solid #e2e8f0", borderRadius:8, fontSize:12, cursor:"pointer" }}>
                                  🔄 Refaire
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={()=>{ if(!locked && peut("inscriptions","update")) saveDossierProspect(p.id); }}
                        disabled={locked || savingDossier || !prospectDossier.niveau || !prospectDossier.formation || !peut("inscriptions","update")}
                        title={permBtnTitle(dossierComplet ? "Mettre à jour le dossier" : "Enregistrer le dossier", peut("inscriptions","update"))}
                        style={{ padding:"8px 18px", background: (locked || !peut("inscriptions","update")) ? "#e2e8f0" : dossierComplet ? "#16a34a" : "#f59e0b", color: (locked || !peut("inscriptions","update")) ? "#94a3b8" : "#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor: (locked || !peut("inscriptions","update")) ? "not-allowed" : "pointer", opacity: (locked||savingDossier||!prospectDossier.niveau||!prospectDossier.formation||!peut("inscriptions","update"))?0.65:1 }}>
                        {savingDossier ? "Enregistrement…" : locked ? "🔒 Dossier verrouillé" : !peut("inscriptions","update") ? "🔒 Dossier" : dossierComplet ? "✓ Mettre à jour le dossier" : "💾 Enregistrer le dossier"}
                      </button>
                    </div>
                  );
                })()}

                {/* ─── PAIEMENT - lecture seule, privé comme groupe ─── L'assistante encaisse et
                    enregistre le paiement ; le PA vérifie ici, avec le justificatif, sans jamais
                    pouvoir ajouter/modifier un versement depuis cet écran. */}
                {(() => {
                  const totalReçuPrive = apprenantPaiements.reduce((s,v)=>s+(v.montant_recu||0),0);
                  return (
                    <div style={{ borderRadius:12, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
                      <div style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", padding:"12px 16px", borderBottom:"1.5px solid #e2e8f0" }}>
                        <div style={{ fontSize:13, fontWeight:800, color:PA_DARK }}>💳 Paiement</div>
                      </div>
                      <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f8fafc", border:"1.5px dashed #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#64748b" }}>
                          <span>👁️</span>
                          <span>Lecture seule - l'assistante commerciale encaisse et enregistre le paiement de ce dossier.</span>
                        </div>
                        {loadingPaiements ? (
                          <div style={{ textAlign:"center", padding:"14px 0", fontSize:12, color:"#94a3b8" }}>Chargement…</div>
                        ) : apprenantPaiements.length === 0 ? (
                          <div style={{ textAlign:"center", padding:"14px 0", fontSize:12, color:"#94a3b8", background:"#f8fafc", borderRadius:8, border:"1px dashed #e2e8f0" }}>Aucun versement enregistré pour l'instant.</div>
                        ) : (
                          <div>
                            <div style={{ fontSize:11, fontWeight:700, color:"#374151", marginBottom:6 }}>Historique ({apprenantPaiements.length})</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:200, overflowY:"auto" }}>
                              {apprenantPaiements.map((v,i)=>(
                                <div key={v.id||i} style={{ display:"flex", alignItems:"center", gap:8, background:"#f8fafc", borderRadius:7, padding:"7px 10px", border:"1px solid #e2e8f0" }}>
                                  <span style={{ fontSize:14 }}>✅</span>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:11, fontWeight:700, color:"#0f172a" }}>
                                      {v.date_paiement ? new Date(v.date_paiement).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}) : "-"}
                                      {v.mode_paiement && <span style={{ marginLeft:6, fontWeight:400, color:"#64748b" }}>· {v.mode_paiement}</span>}
                                    </div>
                                    {v.notes && <div style={{ fontSize:10, color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.notes}</div>}
                                    {v.ref_transaction && <div style={{ fontSize:10, color:"#94a3b8" }}>Réf : {v.ref_transaction}</div>}
                                  </div>
                                  <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                                    <div style={{ fontSize:13, fontWeight:800, color:"#22c55e" }}>+{Number(v.montant_recu||0).toLocaleString("fr-FR")} F</div>
                                    {v.preuve_image && (
                                      <button onClick={()=>setPreuvePaiementView(v.preuve_image)} title="Voir le justificatif"
                                        style={{ padding:"4px 7px", background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:6, cursor:"pointer", fontSize:13, lineHeight:1 }}>
                                        📎
                                      </button>
                                    )}
                                    <button onClick={()=>ouvrirRecu(v, p)} title="Générer le reçu"
                                      style={{ padding:"4px 7px", background:"#f5f3ff", border:"1.5px solid #ddd6fe", borderRadius:6, cursor:"pointer", fontSize:13, lineHeight:1 }}>
                                      🖨️
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{ marginTop:6, fontSize:12, fontWeight:800, color:"#15803d", textAlign:"right" }}>
                              Total versé : {Number(totalReçuPrive).toLocaleString("fr-FR")} F
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Convertir en cours privé */}
                {p.statut === "converti" && (
                  <div style={{ background:"#f0fdf4", borderRadius:10, padding:"12px 16px", border:"1.5px solid #bbf7d0", display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22 }}>✅</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:800, color:"#15803d" }}>Prospect converti</div>
                      <div style={{ fontSize:11, color:"#64748b" }}>Créez le cours privé (groupe dédié).</div>
                    </div>
                    <button onClick={()=>{ setProspectModal(null); setActiveTab("groupes"); setModalCours(true); }}
                      disabled={!peut("inscriptions","create")}
                      title={permBtnTitle("Créer le cours", peut("inscriptions","create"))}
                      style={permBtnStyle({ marginLeft:"auto", padding:"7px 14px", background:"#22c55e", color:"#fff", border:"none", borderRadius:7, fontWeight:700, fontSize:12, cursor:"pointer" }, peut("inscriptions","create"))}>
                      {peut("inscriptions","create") ? "→ Créer le cours" : "🔒 Créer le cours"}
                    </button>
                  </div>
                )}

                <div style={{ display:"flex", justifyContent:"flex-end" }}>
                  <Btn outline onClick={()=>setProspectModal(null)}>Fermer</Btn>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ══ MODAL REÇU DE PAIEMENT ══ */}
      {recuModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", boxShadow:"0 20px 60px rgba(0,0,0,.25)", overflow:"hidden", display:"flex", flexDirection:"column" }}>

            {/* Actions */}
            <div className="no-print" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderBottom:"1px solid #e2e8f0", background:"#f8fafc" }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#374151" }}>Reçu de paiement</span>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>window.print()}
                  style={{ padding:"7px 16px", background:PA_COLOR, color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                  🖨️ Imprimer
                </button>
                <button onClick={()=>setRecuModal(null)}
                  style={{ padding:"7px 14px", background:"#f1f5f9", color:"#374151", border:"1px solid #e2e8f0", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                  Fermer
                </button>
              </div>
            </div>

            {/* Corps du reçu */}
            <div id="recu-print" style={{ padding:"24px 28px", overflowY:"auto", flex:1 }}>

              {/* En-tête BET */}
              <div style={{ textAlign:"center", marginBottom:20, paddingBottom:16, borderBottom:"2px solid #7c3aed" }}>
                <div style={{ fontSize:22, fontWeight:900, color:"#4c1d95", letterSpacing:1 }}>BET</div>
                <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>Business English Training</div>
                <div style={{ fontSize:11, color:"#6b7280" }}>Abidjan, Côte d'Ivoire · bet-formation.com</div>
              </div>

              {/* Titre + numéro */}
              <div style={{ textAlign:"center", marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", textTransform:"uppercase", letterSpacing:1 }}>Reçu de paiement</div>
                <div style={{ fontSize:11, color:"#7c3aed", fontWeight:700, marginTop:4 }}>N° {recuModal.num}</div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
                  {recuModal.date ? new Date(recuModal.date).toLocaleDateString("fr-FR",{ day:"numeric", month:"long", year:"numeric" }) : "-"}
                </div>
              </div>

              {/* Infos client */}
              <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#7c3aed", marginBottom:8, textTransform:"uppercase", letterSpacing:.5 }}>Client</div>
                <div style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>{recuModal.client || "-"}</div>
                {recuModal.telephone && <div style={{ fontSize:11, color:"#6b7280", marginTop:3 }}>📞 {recuModal.telephone}</div>}
                {recuModal.email     && <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>✉️ {recuModal.email}</div>}
              </div>

              {/* Détail paiement */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#7c3aed", marginBottom:8, textTransform:"uppercase", letterSpacing:.5 }}>Détail</div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <tbody>
                    {[
                      ["Formation",      recuModal.formation],
                      recuModal.centre   ? ["Centre",    recuModal.centre]    : null,
                      recuModal.moisLabel ? ["Période",  recuModal.moisLabel] : null,
                      ["Mode de paiement", recuModal.mode],
                      recuModal.ref      ? ["Réf. transaction", recuModal.ref] : null,
                      recuModal.notes    ? ["Notes",     recuModal.notes]     : null,
                    ].filter(Boolean).map(([label, value]) => (
                      <tr key={label} style={{ borderBottom:"1px solid #f1f5f9" }}>
                        <td style={{ padding:"7px 0", color:"#6b7280", width:"42%" }}>{label}</td>
                        <td style={{ padding:"7px 0", fontWeight:600, color:"#0f172a" }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Montant */}
              <div style={{ background:PA_GRADIENT, borderRadius:12, padding:"16px 20px", textAlign:"center", marginBottom:16 }}>
                <div style={{ fontSize:11, color:"#ddd6fe", marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }}>Montant reçu</div>
                <div style={{ fontSize:28, fontWeight:900, color:"#fff" }}>
                  {recuModal.montant.toLocaleString("fr-FR")} <span style={{ fontSize:14, fontWeight:600 }}>FCFA</span>
                </div>
              </div>

              {/* Pied */}
              <div style={{ textAlign:"center", fontSize:10, color:"#94a3b8", borderTop:"1px solid #f1f5f9", paddingTop:12 }}>
                Ce document tient lieu de reçu officiel · BET Formation - {new Date().getFullYear()}
              </div>
            </div>
          </div>
          <style>{`@media print { .no-print { display:none !important; } body > *:not(#recu-print) { display:none !important; } }`}</style>
        </div>
      )}


      {/* ══ MODAL - Accès créés après conversion ══ */}
      {accesCreesModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10000, padding:16 }}
          onClick={() => setAccesCreesModal(null)}>
          <div style={{ background:"#fff", borderRadius:18, width:"90vw", height:"90vh", boxShadow:"0 24px 64px rgba(0,0,0,.25)", display:"flex", flexDirection:"column", overflow:"hidden" }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ background:"linear-gradient(135deg,#011451 0%,#0c33ac 60%,#1e40af 100%)", padding:"22px 26px", borderRadius:"18px 18px 0 0", textAlign:"center" }}>
              <div style={{ fontSize:"2.2rem", marginBottom:6 }}>🎓</div>
              <div style={{ fontSize:18, fontWeight:900, color:"#fff", marginBottom:4 }}>Accès apprenant créés !</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)" }}>Les identifiants ont été envoyés par email</div>
            </div>
            {/* Corps */}
            <div style={{ padding:"24px 28px", display:"flex", flexDirection:"column", gap:16, overflowY:"auto", flex:1 }}>
              <div style={{ background:"linear-gradient(135deg,#f0f4ff,#e8f0fe)", border:"1.5px solid #c7d2fe", borderRadius:14, padding:"18px 20px" }}>
                <div style={{ fontSize:11, fontWeight:800, color:"#0c33ac", textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>🔐 Identifiants de connexion</div>
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600, marginBottom:4 }}>Adresse email</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:"#011451" }}>{accesCreesModal.email}</span>
                    <button onClick={() => { navigator.clipboard.writeText(accesCreesModal.email); toast.success("Copié !"); }}
                      style={{ fontSize:11, padding:"2px 8px", borderRadius:6, border:"1px solid #c7d2fe", background:"#fff", cursor:"pointer", color:"#0c33ac" }}>📋</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600, marginBottom:4 }}>Mot de passe temporaire</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:20, fontWeight:900, color:"#ff2945", letterSpacing:3, fontFamily:"monospace" }}>
                      {showMdpCrees ? accesCreesModal.mdp_temp : "•".repeat(accesCreesModal.mdp_temp?.length || 10)}
                    </span>
                    <button onClick={() => setShowMdpCrees(v => !v)}
                      style={{ fontSize:11, padding:"2px 8px", borderRadius:6, border:"1px solid #e2e8f0", background:"#fff", cursor:"pointer", color:"#64748b" }}>
                      {showMdpCrees ? "🙈" : "👁"}
                    </button>
                    {showMdpCrees && (
                      <button onClick={() => { navigator.clipboard.writeText(accesCreesModal.mdp_temp); toast.success("Copié !"); }}
                        style={{ fontSize:11, padding:"2px 8px", borderRadius:6, border:"1px solid #c7d2fe", background:"#fff", cursor:"pointer", color:"#0c33ac" }}>📋</button>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ background:"#fef3c7", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#92400e" }}>
                ⚠️ <strong>À communiquer à l'apprenant :</strong> il devra changer son mot de passe lors de sa première connexion.
              </div>
              <button onClick={() => { setAccesCreesModal(null); toast.success("✅ Prospect converti en apprenant !"); }}
                style={{ padding:"12px 0", background:"linear-gradient(135deg,#011451,#0c33ac)", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer" }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fiche coach au niveau du rendu, et non dans l'onglet « Coachs » : elle est
          ouverte aussi depuis le classement des rapports superviseur. Enfermee dans
          un onglet, l'etat changeait sans que rien ne s'affiche. */}
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
        const PA_TABS = [
          { id:"infos",          label:"Infos",                                                                          icon:"👤" },
          { id:"evaluations",    label:`Évaluations${paCoachRapportsTransmis.length>0?` (${paCoachRapportsTransmis.length})`:""}`, icon:"⭐" },
          { id:"contrats",       label:`Classes (${paCoachGroupes.length})`,                                              icon:"🏫" },
          { id:"honoraires",     label:"Honoraires",                                                                      icon:"💰" },
          { id:"disponibilite",  label:`Disponibilités${paCoachDispoData.length>0?` (${paCoachDispoData.length})`:""}`,  icon:"📅" },
          { id:"modules",        label:`Modules e-learning${paCoachCours.length>0?` (${paCoachCours.length})`:""}`,        icon:"🧩" },
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
                  const noteColor = NOTE_COUL(noteMoy);
                  /* Les dernières notes, de la plus ancienne à la plus récente. Le
                     classement les renvoie de la plus récente à la plus ancienne : lues
                     dans cet ordre, la courbe se lirait à l'envers. */
                  const dernieres = [...(clmt?.historique || [])]
                    .map(h => Number(h?.note)).filter(n => Number.isFinite(n) && n > 0)
                    .reverse().slice(-6);
                  const tendance = clmt?.tendance || "stable";
                  const nbNotes = clmt?.nb_avec_note ?? clmt?.nb_evaluations ?? dernieres.length;
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

                      {/* LA TENDANCE, à côté de la moyenne. Deux coachs à 3,1 n'ont pas la
                          même trajectoire : l'un remonte, l'autre s'enfonce. Assigner une
                          classe sans le savoir revient à décider sur un instantané. */}
                      {dernieres.length > 0 && (
                        <span style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.14)", borderRadius:8, padding:"3px 10px" }}
                          title={`${nbNotes} note${nbNotes>1?"s":""} - de la plus ancienne à la plus récente : ${dernieres.join(" · ")}`}>
                          <span style={{ fontSize:10.5, color:"rgba(255,255,255,.7)", fontWeight:600 }}>Tendance</span>
                          <span style={{ display:"flex", gap:3, alignItems:"flex-end", height:20 }}>
                            {dernieres.map((n, ni) => (
                              <span key={ni} style={{ width:6, borderRadius:3, background:NOTE_COUL(n),
                                height:`${(n / 5) * 100}%`, minHeight:4, display:"block" }} />
                            ))}
                          </span>
                          {/* La flèche n'a de sens qu'à partir de DEUX notes : avec une
                              seule, il n'y a rien à comparer. */}
                          {dernieres.length >= 2 && (
                            <span style={{ fontSize:15, fontWeight:900, lineHeight:1,
                              color: tendance === "hausse" ? "#4ade80" : tendance === "baisse" ? "#f87171" : "#cbd5e1" }}>
                              {tendance === "hausse" ? "↗" : tendance === "baisse" ? "↘" : "→"}
                            </span>
                          )}
                        </span>
                      )}

                      {/* Le NOMBRE d'évaluations : une moyenne de 4,5 fondée sur une seule
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
              <div style={{ display:"flex", borderBottom:"2px solid #e5e7eb", background:"#fafafa", flexShrink:0, overflowX:"auto" }}>
                {PA_TABS.map(t => (
                  <button key={t.id} onClick={()=>setPaCoachModalTab(t.id)}
                    style={{ padding:"12px 18px", border:"none", borderBottom:`3px solid ${paCoachModalTab===t.id?PA_COLOR:"transparent"}`,
                      background:"transparent", cursor:"pointer", fontWeight:paCoachModalTab===t.id?700:400,
                      color:paCoachModalTab===t.id?PA_COLOR:"#6b7280", fontSize:12, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5 }}>
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
                      const ncColor = NOTE_COUL;
                      const rank = paClassement.filter(c=>c.nb_evaluations>0).findIndex(c=>c.id===paSelectedCoach?.id);
                      const total = paClassement.filter(c=>c.nb_evaluations>0).length;
                      return (
                        <div style={{ background:PA_GRADIENT, borderRadius:14, padding:20, color:"#fff", display:"flex", alignItems:"center", gap:24 }}>
                          <div style={{ textAlign:"center" }}>
                            <div style={{ fontSize:36, fontWeight:900, color: clmt.moyenne >= 4 ? "#6ee7b7" : clmt.moyenne >= 3 ? "#7dd3fc" : clmt.moyenne >= 2.5 ? "#fcd34d" : "#fca5a5" }}>
                              {Number(clmt.moyenne).toFixed(1)}
                            </div>
                            <div style={{ fontSize:11, color:"#c4b5fd", fontWeight:600, marginBottom:6 }}>Note moyenne</div>
                            <BadgeCategorieCoach note={clmt.moyenne} taille="xs" />
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
                    // Ces listes étaient restées aux cinq critères d'origine, alors que le rapport en
                    // porte sept notés depuis la reprise des critères de la feuille terrain : le PA
                    // recevait les données sans les voir.
                    const CRIT_RP = LIBELLES_CRITERES;
                    const LIB_INTER_PA = { excellent:"Excellent", bon:"Bon", acceptable:"Acceptable", insuffisant:"Insuffisant" };
                    const LIB_GRAM_PA  = { inductive_claire:"Inductive et claire", inductive_perfectible:"Inductive, à revoir", deductive_claire:"Déductive mais claire", confuse:"Confuse ou erronée" };
                    const LIB_SYNTH_PA = { excellent:{ l:"Excellent", c:"#15803d", bg:"#dcfce7" },
                                           satisfaisant:{ l:"Satisfaisant", c:"#b45309", bg:"#fef3c7" },
                                           a_accompagner:{ l:"À accompagner", c:"#b91c1c", bg:"#fee2e2" } };
                    const nc2  = n => !n ? "#9ca3af" : n >= 4.5 ? "#16a34a" : n >= 3.5 ? "#0891b2" : n >= 2.5 ? "#f59e0b" : "#ef4444";
                    const nbg2 = n => !n ? "#f3f4f6" : n >= 4.5 ? "#dcfce7" : n >= 3.5 ? "#e0f2fe" : n >= 2.5 ? "#fef3c7" : "#fee2e2";
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
                        {/* Filtres - poses ICI et non dans le bloc des evaluations, qui ne
                            s'affiche jamais : `evaluations_coachs` n'a aucun ecran de saisie.
                            Ce sont ces rapports-la que le PA vient lire. */}
                        {!paCoachRapportsLoading && paCoachRapportsTransmis.length > 0 && (() => {
                          const MOIS_LIB = ["janvier","février","mars","avril","mai","juin",
                            "juillet","août","septembre","octobre","novembre","décembre"];
                          const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
                          // Les annees reellement presentes, pas une liste en dur.
                          const annees = [...new Set(paCoachRapportsTransmis
                            .map(r => r.date_observation && new Date(r.date_observation).getFullYear())
                            .filter(Boolean))].sort((a,b) => b - a);
                          if (!annees.length) annees.push(new Date().getFullYear());
                          // Le mois actif se DEDUIT de la plage : un seul filtre, deux facons
                          // de le poser, jamais deux etats qui se contredisent.
                          const actif = (() => {
                            if (!evalDateFrom || !evalDateTo) return null;
                            const d = new Date(`${evalDateFrom}T00:00:00`);
                            const pr = new Date(d.getFullYear(), d.getMonth(), 1);
                            const de = new Date(d.getFullYear(), d.getMonth()+1, 0);
                            return (iso(pr) === evalDateFrom && iso(de) === evalDateTo)
                              ? { m: d.getMonth(), a: d.getFullYear() } : null;
                          })();
                          const poser = (m, a) => {
                            if (m === "" || a === "") return;
                            setEvalDateFrom(iso(new Date(a, m, 1)));
                            setEvalDateTo(iso(new Date(a, Number(m)+1, 0)));
                          };
                          const anCourante = actif?.a ?? annees[0];
                          const rapportsFiltres = paCoachRapportsTransmis.filter(r => {
                            const d = r.date_observation || "";
                            if (evalDateFrom && d && d < evalDateFrom) return false;
                            if (evalDateTo   && d && d > evalDateTo)   return false;
                            return true;
                          });
                          const champ = { padding:"4px 8px", border:"1.5px solid #bae6fd", borderRadius:7, fontSize:12, outline:"none", background:"#fff" };
                          return (
                          <>
                          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:10,
                            background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10, padding:"8px 12px" }}>
                            <label style={{ fontSize:11, color:"#0369a1", fontWeight:700 }}>Mois</label>
                            <select value={actif ? actif.m : ""}
                              onChange={e => poser(e.target.value === "" ? "" : Number(e.target.value), anCourante)} style={champ}>
                              <option value="">- Tous -</option>
                              {MOIS_LIB.map((lib, k) => <option key={k} value={k}>{lib}</option>)}
                            </select>
                            <select value={anCourante}
                              onChange={e => { if (actif) poser(actif.m, Number(e.target.value)); }} style={champ}>
                              {annees.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                            <label style={{ fontSize:11, color:"#0369a1", fontWeight:700, marginLeft:4 }}>Du</label>
                            <input type="date" value={evalDateFrom} onChange={e=>setEvalDateFrom(e.target.value)} style={champ} />
                            <label style={{ fontSize:11, color:"#0369a1", fontWeight:700 }}>au</label>
                            <input type="date" value={evalDateTo} onChange={e=>setEvalDateTo(e.target.value)} style={champ} />
                            {(evalDateFrom || evalDateTo) && (
                              <button onClick={()=>{ setEvalDateFrom(""); setEvalDateTo(""); }}
                                style={{ padding:"4px 10px", borderRadius:7, border:"1.5px solid #fca5a5", background:"#fef2f2",
                                  fontSize:11, color:"#b91c1c", cursor:"pointer", fontWeight:700 }}>✕ Effacer</button>
                            )}
                            <span style={{ fontSize:11.5, marginLeft:"auto",
                              color: rapportsFiltres.length ? "#94a3b8" : "#b45309",
                              fontWeight: rapportsFiltres.length ? 400 : 700 }}>
                              {rapportsFiltres.length === paCoachRapportsTransmis.length
                                ? `${paCoachRapportsTransmis.length} rapport${paCoachRapportsTransmis.length>1?"s":""}`
                                : rapportsFiltres.length
                                  ? `${rapportsFiltres.length} sur ${paCoachRapportsTransmis.length}`
                                  : "Aucun rapport sur cette période"}
                            </span>
                            <button onClick={()=>exporterAppraisalCoachs({ rapports: rapportsFiltres, nomFichier:`observations_${(coach.nom||"coach").replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}` })}
                              disabled={!rapportsFiltres.length}
                              style={{ padding:"5px 12px", borderRadius:7, border:"none",
                                background: rapportsFiltres.length ? "#16a34a" : "#e2e8f0",
                                color: rapportsFiltres.length ? "#fff" : "#94a3b8",
                                fontSize:11.5, fontWeight:700, cursor: rapportsFiltres.length ? "pointer" : "not-allowed" }}>
                              📊 Excel
                            </button>
                          </div>
                          <div style={{ border:"1.5px solid #bae6fd", borderRadius:14, overflow:"hidden" }}>
                            <div style={{ padding:"8px 14px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <span style={{ fontSize:12, fontWeight:700, color:"#0369a1" }}>{paCoachRapportsTransmis.length} rapport{paCoachRapportsTransmis.length!==1?"s":""}</span>
                              <div style={{ display:"flex", gap:8 }}>
                                <button onClick={()=>setPaRapportExpanded(new Set(paCoachRapportsTransmis.map(r=>r.id)))} style={{ fontSize:11, fontWeight:700, color:"#0891b2", background:"transparent", border:"none", cursor:"pointer" }}>Tout déplier ↓</button>
                                <button onClick={()=>setPaRapportExpanded(new Set())} style={{ fontSize:11, fontWeight:700, color:"#94a3b8", background:"transparent", border:"none", cursor:"pointer" }}>Tout replier ↑</button>
                              </div>
                            </div>
                            {rapportsFiltres.map((rp, idx) => {
                              const rpOpen = paRapportExpanded.has(rp.id);
                              const note   = rp.note_globale ? Number(rp.note_globale) : null;
                              const depNom = rp.deputy ? `${rp.deputy.prenom||""} ${rp.deputy.nom||""}`.trim() : "Deputy";
                              const hasTxt = rp.observations || rp.recommandations || rp.commentaire_superviseur;
                              const toggleRp = () => setPaRapportExpanded(prev => { const n2 = new Set(prev); n2.has(rp.id) ? n2.delete(rp.id) : n2.add(rp.id); return n2; });
                              return (
                                <div key={rp.id} style={{ borderBottom: idx < rapportsFiltres.length-1 ? "1px solid #e0f2fe" : "none" }}>
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
                          </>
                          );
                        })()}
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

                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                      <span style={{ fontSize:11, color:"#9ca3af", fontWeight:700, marginRight:2 }}>Catégorie :</span>
                      {[{v:"tous",l:"Tous"},{v:"groupe",l:"👥 Cours groupe"},{v:"prive",l:"🔒 Cours privés"}].map(t=>(
                        <button key={t.v} onClick={()=>{ setClasseFiltreCategorie(t.v); setClassePage(1); }}
                          style={{ padding:"6px 14px", borderRadius:999, border:`2px solid ${classeFiltreCategorie===t.v?PA_COLOR:"#e5e7eb"}`,
                            background:classeFiltreCategorie===t.v?PA_LIGHT:"#fff",
                            color:classeFiltreCategorie===t.v?PA_COLOR:"#374151",
                            fontWeight:classeFiltreCategorie===t.v?800:600, fontSize:12, cursor:"pointer" }}>
                          {t.l}
                        </button>
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                      <span style={{ fontSize:11, color:"#9ca3af", fontWeight:700, marginRight:2 }}>Statut :</span>
                      {[{v:"tous",l:"Tous"},{v:"actif",l:"Actives"},{v:"cloture",l:"🔒 Terminées"}].map(t=>(
                        <button key={t.v} onClick={()=>{ setClasseFiltreStatut(t.v); setClassePage(1); }}
                          style={{ padding:"6px 14px", borderRadius:999, border:`2px solid ${classeFiltreStatut===t.v?PA_COLOR:"#e5e7eb"}`,
                            background:classeFiltreStatut===t.v?PA_LIGHT:"#fff",
                            color:classeFiltreStatut===t.v?PA_COLOR:"#374151",
                            fontWeight:classeFiltreStatut===t.v?800:600, fontSize:12, cursor:"pointer" }}>
                          {t.l}
                        </button>
                      ))}
                    </div>

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
                                : g.statut==="termine"
                                ? { c:"#475569", bg:"#f1f5f9" }
                                : { c:"#d97706", bg:"#fef9c3" };
                              const sLabel = g.statut==="actif" ? "Actif" : g.statut==="cloture" ? "🔒 Clôturée" : g.statut==="termine" ? "Terminée" : (g.statut||"-");
                              const typeLabel = paCadreType(g, "en_ligne") ? { icon:"💻", label:"En ligne" }
                                : g.type_cours==="domicile"  ? { icon:"🏠", label:"Domicile" }
                                : { icon:"🏢", label:"Présentiel" };
                              const rowBg = idx%2===0?"#fff":"#fafafa";
                              return (
                                <tr key={g.id}
                                  style={{ borderBottom:"1px solid #f1f5f9", background:rowBg, cursor:"pointer", transition:"background .15s" }}
                                  onMouseEnter={e=>e.currentTarget.style.background=PA_COLOR+"0d"}
                                  onMouseLeave={e=>e.currentTarget.style.background=rowBg}
                                  onClick={()=>fetchPaGroupeDetail(g)}
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
                    const typeKey = paCadreType(g, "en_ligne") ? "en_ligne"
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
                                        onClick={()=>fetchPaGroupeDetail(g)}
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
                        body: JSON.stringify({ bloque: newBloque, raison: paCoachBloqueRaison, definitif: false, plateforme: "dash" }),
                      });
                      const d = await r.json();
                      if (!r.ok) { toast.error(d.error || "Erreur"); return; }
                      setPaCoachAccesBloque(newBloque);
                      setPaSelectedCoach(prev => ({ ...prev, acces_bloque: newBloque, actif: !newBloque }));
                      if (!newBloque) setPaCoachBloqueRaison("");
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
                          plateforme:     "dash",
                        }),
                      });
                      const d = await r.json();
                      if (!r.ok) { toast.error(d.error || "Erreur"); return; }
                      let remplacementCree = d.remplacement || {};

                      // POST /api/remplacements ignore remplacant_id (créé "à pourvoir" sans
                      // remplaçant) - l'assignation réelle passe par le même PATCH que
                      // "Confirmer la délégation" : crée la délégation, notifie les deux
                      // coachs, sans jamais réassigner groupes.coach_id de façon permanente
                      // (contrairement à l'ancien PATCH direct ici, irréversible).
                      if (remplacant_id && remplacementCree.id) {
                        const r2 = await fetch(`${API_URL}/api/remplacements/${remplacementCree.id}`, {
                          method: "PATCH",
                          headers: { ...authHeaders(), "Content-Type": "application/json" },
                          body: JSON.stringify({
                            remplacant_id,
                            remplacant_nom: remplacant ? `${remplacant.prenom} ${remplacant.nom}` : null,
                            sessions_ids:   paCoachRemplSessionsSelec,
                            nb_sessions:    paCoachRemplSessionsSelec.length,
                            statut:         "en_cours",
                          }),
                        });
                        const d2 = await r2.json().catch(() => ({}));
                        if (r2.ok) remplacementCree = d2.remplacement || remplacementCree;
                        else toast.error(d2.error || "Remplacement créé, mais l'assignation du remplaçant a échoué.");
                      }

                      toast.success("Remplacement enregistré et délégation confirmée.");
                      setPaCoachRemplacementsListe(prev => [remplacementCree, ...prev]);
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

                        <button
                          onClick={handleToggleAcces}
                          disabled={paCoachAccesLoading || !peut("remplacements","update") || !peut("classes","update")}
                          title={permBtnTitle(paCoachAccesBloque ? "Débloquer l'accès" : "Bloquer l'accès", peut("remplacements","update") && peut("classes","update"))}
                          style={{
                            background: paCoachAccesBloque ? "#16a34a" : "#dc2626",
                            color:"#fff", border:"none", borderRadius:8,
                            padding:"9px 20px", fontWeight:700, fontSize:13,
                            cursor: (paCoachAccesLoading || !peut("remplacements","update") || !peut("classes","update")) ? "not-allowed" : "pointer",
                            opacity: (paCoachAccesLoading || !peut("remplacements","update") || !peut("classes","update")) ? .6 : 1,
                          }}
                        >
                          {paCoachAccesLoading
                            ? "En cours…"
                            : (!peut("remplacements","update") || !peut("classes","update")) ? "🔒 Accès coach"
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
                            title={permBtnTitle("Enregistrer le remplacement", peut("remplacements","create"))}
                            style={permBtnStyle({ background:PA_COLOR, color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:700, fontSize:13, cursor: paCoachRemplSaving?"not-allowed":"pointer", opacity:paCoachRemplSaving?.6:1 }, peut("remplacements","create"))}
                          >
                            {paCoachRemplSaving ? "Enregistrement…" : peut("remplacements","create") ? "✅ Enregistrer le remplacement" : "🔒 Enregistrer le remplacement"}
                          </button>
                          {paCoachRemplSessionsSelec.length > 0 && (
                            <span style={{ fontSize:12, color:"#6b7280" }}>
                              {paCoachRemplSessionsSelec.length} session{paCoachRemplSessionsSelec.length > 1 ? "s" : ""} attribuée{paCoachRemplSessionsSelec.length > 1 ? "s" : ""} au remplaçant
                            </span>
                          )}
                        </div>
                      </div>}

                      {/* ── Historique remplacements ── */}
                      {paCoachRemplacementsListe.length > 0 && (
                        <div style={{ background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:12, padding:"16px 20px" }}>
                          <div style={{ fontWeight:700, fontSize:13, color:"#374151", marginBottom:12 }}>📋 Historique des remplacements</div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                            {paCoachRemplacementsListe.map((r, i) => {
                              const sColor = r.statut==="termine" ? "#16a34a" : r.statut==="en_cours" ? "#2563eb" : r.statut==="planifie" ? "#d97706" : "#dc2626";
                              return (
                                <div key={r.id || i} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:12 }}>
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

      <FooterSaaS couleurTheme={PA_COLOR} />
    </>
  );
}
