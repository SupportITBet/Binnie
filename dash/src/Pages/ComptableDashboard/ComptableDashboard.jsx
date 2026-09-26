// src/Pages/ComptableDashboard/ComptableDashboard.jsx
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RangeePastilles } from "../../Components/BarreFiltres";
import NotificationBell from "../../Components/NotificationBell";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import { useNotifPoller } from "../../hooks/useNotifPoller";
import { clearAllSessionStorage } from "../../utils/session";
import { exporterExcelStyle } from "../../utils/exporterExcel";
import { openElearningSSO } from "../../utils/ssoElearning";
import NotificationsTab from "../../Components/NotificationsTab";
import { useLanguage } from "../../contexts/LanguageContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import FooterSaaS from "../../Components/FooterSaaS";
import { assombrirCouleur } from "../../utils/couleurs";
import { useLivePermissions } from "../../utils/permissions";
import MessagerieTab from "../../Components/MessagerieTab";
import { useFirebaseChat } from "../../hooks/useFirebaseChat";
import "../../chartConfig";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { useTabState } from "../../hooks/useTabState";
import { useNotifications } from "../../hooks/useNotifications";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";

import { uploadFichier } from "../../utils/uploadFichier";
import VisionneuseImage from "../../Components/VisionneuseImage";
/* ═══════════════════════════════════════════════════════
   CHARTE COULEURS - Comptable / Trésorier
═══════════════════════════════════════════════════════ */
const API_URL         = process.env.REACT_APP_API_URL || "http://localhost:5001";
const ELEARNING_URL   = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";
const PRIMARY_COLOR   = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur||"#d97706"; } catch { return "#d97706"; } })();
const PRIMARY_LIGHT   = PRIMARY_COLOR + "18";
const GRADIENT_HEADER = `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(PRIMARY_COLOR)} 100%)`;
const FF              = "'Inter','Segoe UI',sans-serif";
const authHdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` });

/* ═══════════════════════════════════════════════════════
   COMPOSANTS RÉUTILISABLES
═══════════════════════════════════════════════════════ */
const StatCard = ({ label, value, color, icon, sub, onClick }) => (
  <div onClick={onClick} style={{ background:"#fff", padding:16, borderRadius:12, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:12, cursor:onClick?"pointer":"default", border:"1px solid #f1f5f9" }}>
    <div style={{ width:46, height:46, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{icon}</div>
    <div style={{ minWidth:0 }}>
      <div style={{ fontSize:11, color:"#9ca3af" }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);

const Badge = ({ label, color, bg }) => (
  <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:99, fontSize:10, fontWeight:700, color, background:bg, whiteSpace:"nowrap" }}>{label}</span>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}>
    <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:wide?760:520, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.2)", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"#f1f5f9", border:"none", borderRadius:8, width:32, height:32, fontSize:16, cursor:"pointer", color:"#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const ProgressBar = ({ value, color = PRIMARY_COLOR }) => (
  <div style={{ height:6, background:"#e5e7eb", borderRadius:99, overflow:"hidden" }}>
    <div style={{ height:"100%", width:`${Math.min(100,value)}%`, background:color, borderRadius:99, transition:"width .4s" }} />
  </div>
);

const Th = ({ children }) => (
  <th style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:".04em", borderBottom:"1px solid #e5e7eb", background:"#f8fafc", whiteSpace:"nowrap" }}>{children}</th>
);
const Td = ({ children, bold, right }) => (
  <td style={{ padding:"10px 14px", fontSize:13, fontWeight:bold?700:400, textAlign:right?"right":"left", borderBottom:"1px solid #f1f5f9" }}>{children}</td>
);

const Field = ({ label, children }) => (
  <div>
    <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>{label}</label>
    {children}
  </div>
);

const inputSt  = { padding:"7px 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:12, fontFamily:FF, width:"100%", boxSizing:"border-box" };
const selectSt = { ...inputSt };

const fmt  = (v) => (Number(v)||0).toLocaleString("fr-FR") + " FCFA";
const fmtD = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}) : "-";

const STATUT_FACTURE = {
  brouillon:{ lib:"Brouillon", color:"#64748b", bg:"#f1f5f9" },
  envoyee:{ lib:"Envoyée", color:"#0369a1", bg:"#e0f2fe" },
  partiellement_payee:{ lib:"Partielle", color:"#d97706", bg:"#fef3c7" },
  payee:{ lib:"Payée", color:"#16a34a", bg:"#dcfce7" },
  en_retard:{ lib:"En retard", color:"#dc2626", bg:"#fee2e2" },
  annulee:{ lib:"Annulée", color:"#94a3b8", bg:"#f1f5f9" },
};
const STATUT_PMT = { "reçu":{ lib:"Reçu", color:"#16a34a", bg:"#dcfce7" }, paye:{ lib:"Payé", color:"#16a34a", bg:"#dcfce7" }, partiel:{ lib:"Partiel", color:"#d97706", bg:"#fef3c7" }, en_attente:{ lib:"En attente", color:"#d97706", bg:"#fef3c7" }, en_retard:{ lib:"En retard", color:"#dc2626", bg:"#fee2e2" } };
const MOIS_LABELS = ["", "Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MOIS_COURT  = ["", "Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];

// Les 12 derniers mois glissants (le plus ancien en premier), utilisés pour les courbes du tableau de bord.
function derniersMois(n = 6) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ mois: d.getMonth() + 1, annee: d.getFullYear(), key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: `${MOIS_COURT[d.getMonth()+1]} ${String(d.getFullYear()).slice(2)}` });
  }
  return out;
}

const CHART_COLORS = ["#d97706","#0369a1","#16a34a","#dc2626","#7c3aed","#0891b2","#ca8a04","#64748b"];
const chartOptsCommon = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ font:{ size:10 } }, grid:{ color:"#f1f5f9" } }, x:{ ticks:{ font:{ size:10 } }, grid:{ display:false } } } };

/* ── Helper fetch générique ── */
async function fetchJSON(url) {
  try {
    const r = await fetch(url, { headers: authHdrs() });
    if (!r.ok) {
      const d = await r.json().catch(()=>({}));
      console.error(`[ComptableDashboard] ${url} → ${r.status}`, d.error || "");
      toast.error(`Chargement échoué (${r.status}) : ${d.error || url.split("/api/")[1]}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error(`[ComptableDashboard] ${url} → réseau`, e);
    toast.error(`Connexion au serveur impossible (${url.split("/api/")[1]})`);
    return null;
  }
}
async function postJSON(url, body, method = "POST") {
  const r = await fetch(url, { method, headers: authHdrs(), body: JSON.stringify(body) });
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d.error || "Erreur serveur");
  return d;
}
function permBtnStyle(style, allowed) {
  return allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
}
function permBtnTitle(label, allowed) {
  return allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";
}

/* ═══════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
═══════════════════════════════════════════════════════ */
export default function ComptableDashboard() {
  const navigate   = useNavigate();
  const profil     = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const prenom     = profil?.prenom || "";
  const nom        = profil?.nom    || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "Comptable";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "CP";

  const profilInitial = (() => {
    try { const stored = localStorage.getItem("admin_profil"); if (stored) return JSON.parse(stored); } catch {}
    return null;
  })();
  const { profil: profilConnecte, peut } = useLivePermissions(profilInitial);

  const { lang, toggleLang } = useLanguage();
  const confirm = useConfirm();
  const handleLogout = async () => {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    clearAllSessionStorage();
    navigate("/bet-staff-access", { replace:true });
  };

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) return;
    fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.profil) return;
        if (data.profil.acces_elearning !== undefined) setAccesElearning(data.profil.acces_elearning === true);
        if (sessionStorage.getItem("_bet_color_guard")) { sessionStorage.removeItem("_bet_color_guard"); return; }
        const freshColor = data.profil.couleur || null;
        const stored = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}"); } catch { return {}; } })();
        const _mp = { ...stored, ...data.profil }; if (!data.profil.couleur && stored.couleur) _mp.couleur = stored.couleur; localStorage.setItem("admin_profil", JSON.stringify(_mp));
        if (freshColor && freshColor !== PRIMARY_COLOR) window.location.reload();
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  useNotifPoller({ userId: profil?.id, sources: ["honoraires","paiements"] });

  const [activeTab,    setActiveTab]    = useTabState("dashboard");
  const [accesElearning, setAccesElearning] = useState(profil?.acces_elearning === true);
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

  const DC = `${API_URL}/api/dash-comptabilite`;
  const DCG = `${API_URL}/api/dash-comptabilite-generale`;
  const DCT = `${API_URL}/api/dash-comptabilite-tva`;
  const DCI = `${API_URL}/api/dash-comptabilite-immobilisations`;
  const DR = `${API_URL}/api/dash-comptabilite-rrd-bc-bacn`;

  /* ── Données réelles ── */
  const [factures, setFactures] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [honoraires, setHonoraires] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [facturesAchat, setFacturesAchat] = useState([]);
  const [tresorerieSynthese, setTresorerieSynthese] = useState(null);
  const [depenses, setDepenses] = useState([]);
  const [planComptable, setPlanComptable] = useState([]);
  const [balance, setBalance] = useState([]);
  const [bilan, setBilan] = useState(null);
  const [compteResultat, setCompteResultat] = useState(null);
  const [exercices, setExercices] = useState([]);
  const [tvaSynthese, setTvaSynthese] = useState(null);
  const [tvaDeclarations, setTvaDeclarations] = useState([]);
  const [immobilisations, setImmobilisations] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [budgetsSuivi, setBudgetsSuivi] = useState([]);
  const [axesAnalytiques, setAxesAnalytiques] = useState([]);
  const [analytiqueRepartition, setAnalytiqueRepartition] = useState([]);
  const [chargement, setChargement] = useState(true);

  const anneeCourante = new Date().getFullYear();

  const rechargerBase = useCallback(async () => {
    const [dFact, dPmt, dHon] = await Promise.all([
      fetchJSON(`${DC}/factures`),
      fetchJSON(`${API_URL}/api/paiements/all`),
      fetchJSON(`${API_URL}/api/seances/honoraires-mois`),
    ]);
    setFactures(dFact?.factures || []);
    setPaiements(Array.isArray(dPmt) ? dPmt : (dPmt?.paiements || []));
    setHonoraires(dHon?.honoraires || []);
    setChargement(false);
  }, [DC]);

  useEffect(() => { rechargerBase(); }, [rechargerBase]);

  // Chargement paresseux par onglet
  useEffect(() => {
    (async () => {
      if (activeTab === "fournisseurs") {
        const [f, fa] = await Promise.all([fetchJSON(`${DC}/fournisseurs`), fetchJSON(`${DC}/factures-achat`)]);
        setFournisseurs(f?.fournisseurs || []); setFacturesAchat(fa?.factures || []);
      }
      if (activeTab === "tresorerie") {
        const [s, d] = await Promise.all([fetchJSON(`${DC}/tresorerie/synthese?mois_historique=6`), fetchJSON(`${DC}/depenses`)]);
        setTresorerieSynthese(s); setDepenses(d?.depenses || []);
      }
      if (activeTab === "generale") {
        const [pc, bal, bil, cr, ex] = await Promise.all([
          fetchJSON(`${DCG}/plan-comptable`), fetchJSON(`${DCG}/balance`),
          fetchJSON(`${DCG}/bilan`), fetchJSON(`${DCG}/compte-resultat?annee=${anneeCourante}`),
          fetchJSON(`${DCG}/exercices`),
        ]);
        setPlanComptable(pc?.comptes || []); setBalance(bal?.balance || []);
        setBilan(bil); setCompteResultat(cr); setExercices(ex?.exercices || []);
      }
      if (activeTab === "tva") {
        const [s, d] = await Promise.all([fetchJSON(`${DCT}/synthese`), fetchJSON(`${DCT}/declarations`)]);
        setTvaSynthese(s); setTvaDeclarations(d?.declarations || []);
      }
      if (activeTab === "immobilisations") {
        const d = await fetchJSON(`${DCI}/`); setImmobilisations(d?.immobilisations || []);
      }
      if (activeTab === "budgets") {
        const [b, s] = await Promise.all([fetchJSON(`${DC}/budgets?annee=${anneeCourante}`), fetchJSON(`${DC}/budgets/suivi?annee=${anneeCourante}`)]);
        setBudgets(b?.budgets || []); setBudgetsSuivi(s?.suivi || []);
      }
      if (activeTab === "analytique") {
        const [a, r] = await Promise.all([fetchJSON(`${DC}/axes-analytiques`), fetchJSON(`${DC}/analytique/repartition`)]);
        setAxesAnalytiques(a?.axes || []); setAnalytiqueRepartition(r?.repartition || []);
      }
    })();
  }, [activeTab, DC, DCG, DCT, DCI, anneeCourante]);

  /* ── KPIs ── */
  const stats = useMemo(() => {
    const now = new Date().toISOString().slice(0,7);
    const caJour  = paiements.filter(p => p.date_paiement === new Date().toISOString().slice(0,10)).reduce((s,p)=>s+Number(p.montant_recu||0),0);
    const caMois  = paiements.filter(p => (p.date_paiement||"").startsWith(now)).reduce((s,p)=>s+Number(p.montant_recu||0),0);
    const caAnnee = paiements.filter(p => (p.date_paiement||"").startsWith(String(anneeCourante))).reduce((s,p)=>s+Number(p.montant_recu||0),0);
    const honorairesMoisArr = honoraires.filter(h => h.mois === (new Date().getMonth()+1) && h.annee === anneeCourante);
    const honorairesMois = honorairesMoisArr.reduce((s,h)=>s+Number(h.montant_net ?? h.montant_total ?? 0),0);
    const soldePrev = caMois - honorairesMois;
    const impayés   = factures.filter(f => f.statut === "en_retard").length;
    const aPayerHon = honoraires.filter(h => h.statut === "transmis").length;
    return { caJour, caMois, caAnnee, honorairesMois, soldePrev, impayés, aPayerHon };
  }, [paiements, factures, honoraires, anneeCourante]);

  /* ── Export Excel générique ── */
  const exportCSV = (data, filename) => {
    if (!data || !data.length) { toast.error("Aucune donnée à exporter"); return; }
    const headers = Object.keys(data[0]).filter(k => typeof data[0][k] !== "object");
    exporterExcelStyle({
      nomFichier: filename,
      titre: `📤 Export - ${filename}`,
      sousTitre: `${data.length} ligne${data.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      couleurEntete: '0F172A',
      colonnes: headers.map(h => ({ label: h, width: 20 })),
      lignes: data.map(r => headers.map(h => r[h] ?? "")),
    });
    toast.success(`Export ${filename}.xlsx effectué`);
  };

  const { notifications: toutesNotifsCP, nbNonLues: notifNonLuesCP, marquerLue: marquerNotifLueCP } = useNotifications(profil?.id);
  const { unreadTotal: msgNonLuTotalCP } = useFirebaseChat();
  const [banderoleFermeeCP, setBanderoleFermeeCP] = useState(false);
  const notifsBanderoleCP = toutesNotifsCP.filter(n => !n.lu).slice(0, 3);

  // ── "Mes tâches" - agrège les compteurs "à traiter" déjà calculés pour
  // chaque onglet, pour un point d'entrée unique.
  const tachesTotal = stats.impayés + stats.aPayerHon;

  const TABS = [
    { key:"taches", label:"Mes tâches", icon:"✅", badge: tachesTotal || null },
    { key:"dashboard",     label:"Tableau de bord",    icon:"📊" },
    { key:"facturation",   label:"Facturation",        icon:"🧾", badge: stats.impayés },
    { key:"paiements",     label:"Paiements",          icon:"💳" },
    { key:"tresorerie",    label:"Trésorerie",          icon:"🏦" },
    { key:"fournisseurs",  label:"Fournisseurs & Achats", icon:"📦" },
    { key:"rrd_bc_bacn",   label:"RRD · BC · BACN",       icon:"📒" },
    { key:"generale",      label:"Comptabilité générale", icon:"📚" },
    { key:"tva",           label:"TVA",                 icon:"🧮" },
    { key:"immobilisations", label:"Immobilisations",   icon:"🏗️" },
    { key:"budgets",       label:"Budgets",             icon:"🎯" },
    { key:"analytique",    label:"Analytique",          icon:"📐" },
    { key:"honoraires",    label:"Honoraires coaches",  icon:"💰", badge: stats.aPayerHon },
    { key:"exports",       label:"Exports comptables",  icon:"📤" },
    { key:"messages",      label:"Messages",            icon:"💬", badge: msgNonLuTotalCP || null },
    { key:"notifications", label:"Notifications",       icon:"🔔", badge: notifNonLuesCP || null },
  ];

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:PRIMARY_LIGHT, fontFamily:FF }}>

      {/* ── HERO HEADER ── */}
      <div style={{ flexShrink:0, background:GRADIENT_HEADER, padding:"28px 32px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.04)", zIndex:0 }} />
        <div style={{ position:"absolute", bottom:-60, right:80, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.03)", zIndex:0 }} />
        <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <div style={{ position:"relative", flexShrink:0 }} onClick={()=>{ if (avatarUrl) setPhotoProfilOuverte(true); }}>
              <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:22, color:"#fff", border:"3px solid rgba(255,255,255,0.3)", overflow:"hidden" , cursor: avatarUrl ? "zoom-in" : "default"}}>
                {avatarUrl ? <img src={avatarUrl} alt={initiales} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : initiales}
              </div>
              {photoProfilOuverte && <VisionneuseImage url={avatarUrl} onClose={()=>setPhotoProfilOuverte(false)} />}
              <label title="Changer la photo" onClick={e=>e.stopPropagation()} style={{ position:"absolute", bottom:0, right:0, width:22, height:22, borderRadius:"50%", background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:12, border:"2px solid #fff" }}>
                📷<input type="file" accept="image/*" style={{ display:"none" }} onChange={(e)=>{ const f=e.target.files?.[0]; if(f){ uploadFichier(f, "avatar").then(handleAvatarSuccess).catch(e=>{}); } e.target.value=""; }} />
              </label>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#fde68a", fontWeight:600, letterSpacing:"0.08em" }}>Bonjour 👋</div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff" }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} /></h1>
              {surnomPerso.trim() && nomComplet !== nomAffiche && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:1 }}>{nomComplet}</div>
              )}
              <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                onEnregistre={(v) => setSurnomPerso(v || "")} />
              <div style={{ fontSize:12, color:"#fde68a", marginTop:3 }}>💰 Comptable / Trésorier · {profil?.email || ""}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <NotificationBell userId={profil?.id} />
            <DashboardColorPicker />
              <button onClick={toggleLang} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", transition:"background .2s", letterSpacing:"0.06em" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
                {lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}
              </button>
            {accesElearning && (
              <button type="button" onClick={() => openElearningSSO(ELEARNING_URL)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", background:"rgba(8,145,178,0.25)", border:"1.5px solid rgba(8,145,178,0.5)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", transition:"background .2s" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(8,145,178,0.45)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(8,145,178,0.25)"}
                title="Accéder à la plateforme E-Learning BET">
                <span style={{ fontSize:15 }}>🎓</span> E-Learning
              </button>
            )}
            <button onClick={handleLogout}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
              <span>🚪</span> Déconnexion
            </button>
          </div>
        </div>
        {/* Mini KPIs */}
        <div style={{ display:"flex", gap:0, background:"rgba(0,0,0,0.15)", borderRadius:"12px 12px 0 0", overflow:"hidden", position:"relative", zIndex:1 }}>
          {[
            { l:"CA du jour",       v:fmt(stats.caJour),     c:"#fde68a" },
            { l:"CA du mois",       v:fmt(stats.caMois),     c:"#6ee7b7" },
            { l:"CA de l'année",    v:fmt(stats.caAnnee),    c:"#93c5fd" },
            { l:"Solde prévisionnel",v:fmt(stats.soldePrev), c:stats.soldePrev>=0?"#6ee7b7":"#fca5a5" },
          ].map((s,i,arr)=>(
            <div key={s.l} style={{ flex:1, textAlign:"center", padding:"14px 8px", borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.08)":"none" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", marginBottom:3 }}>{s.l}</div>
              <div style={{ fontSize:16, fontWeight:800, color:s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:"1 1 auto", padding:"0 24px 32px" }}>
        <div style={{ background:"#fff", borderRadius:"0 0 12px 12px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", overflow:"hidden" }}>

          {/* ── Onglets ── */}
          <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e7eb", flexWrap:"wrap", background:"#fafafa" }}>
            {TABS.map(t => (
              <button key={t.key} onClick={()=>setActiveTab(t.key)} style={{
                padding:"12px 14px", border:"none",
                borderBottom:activeTab===t.key?`3px solid ${PRIMARY_COLOR}`:"3px solid transparent",
                cursor:"pointer", fontWeight:600, fontSize:11.5, whiteSpace:"nowrap",
                background:"transparent", color:activeTab===t.key?PRIMARY_COLOR:"#6b7280",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"color .15s",
                flex:"1 1 120px",
              }}>
                <span style={{ fontSize:14 }}>{t.icon}</span>{t.label}
                {t.badge>0 && <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px" }}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {!banderoleFermeeCP && notifsBanderoleCP.length > 0 && (
            <div style={{ padding:"10px 24px", background:"#fff7ed", borderBottom:"1px solid #fed7aa", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                {notifsBanderoleCP.map(n => (
                  <div key={n.id} onClick={() => { marquerNotifLueCP(n.id); setActiveTab("notifications"); }}
                    style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                    <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                    <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                  </div>
                ))}
                {notifNonLuesCP > notifsBanderoleCP.length && (
                  <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                    +{notifNonLuesCP - notifsBanderoleCP.length} autre{notifNonLuesCP - notifsBanderoleCP.length > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
              <button onClick={()=>setBanderoleFermeeCP(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
            </div>
          )}

          <div style={{ padding:24 }}>

            {/* ══ MES TÂCHES ══ */}
            {activeTab === "taches" && (() => {
              const taches = [
                { icon:"🧾", label:"Factures en retard",           n:stats.impayés,   tab:"facturation" },
                { icon:"💰", label:"Honoraires transmis à payer",  n:stats.aPayerHon, tab:"honoraires" },
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
                          onMouseEnter={e=>e.currentTarget.style.borderColor=PRIMARY_COLOR}
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

            {activeTab === "dashboard" && (
              <OngletVueEnsemble stats={stats} factures={factures} paiements={paiements} honoraires={honoraires} setActiveTab={setActiveTab} chargement={chargement} />
            )}

            {activeTab === "facturation" && (
              <OngletFacturation factures={factures} recharger={rechargerBase} exportCSV={exportCSV} DC={DC} peut={peut} />
            )}

            {activeTab === "paiements" && (
              <OngletPaiements paiements={paiements} exportCSV={exportCSV} />
            )}

            {activeTab === "tresorerie" && (
              <OngletTresorerie synthese={tresorerieSynthese} depenses={depenses} setDepenses={setDepenses} DC={DC} peut={peut} />
            )}

            {activeTab === "fournisseurs" && (
              <OngletFournisseurs fournisseurs={fournisseurs} setFournisseurs={setFournisseurs} facturesAchat={facturesAchat} setFacturesAchat={setFacturesAchat} DC={DC} peut={peut} />
            )}

            {activeTab === "rrd_bc_bacn" && (
              <OngletRrdBcBacn DR={DR} peut={peut} />
            )}

            {activeTab === "generale" && (
              <OngletGenerale planComptable={planComptable} balance={balance} bilan={bilan} compteResultat={compteResultat} exercices={exercices} setExercices={setExercices} anneeCourante={anneeCourante} DCG={DCG} peut={peut} />
            )}

            {activeTab === "tva" && (
              <OngletTva synthese={tvaSynthese} declarations={tvaDeclarations} setDeclarations={setTvaDeclarations} DCT={DCT} peut={peut} />
            )}

            {activeTab === "immobilisations" && (
              <OngletImmobilisations immobilisations={immobilisations} setImmobilisations={setImmobilisations} fournisseurs={fournisseurs} DCI={DCI} peut={peut} />
            )}

            {activeTab === "budgets" && (
              <OngletBudgets budgets={budgets} setBudgets={setBudgets} suivi={budgetsSuivi} anneeCourante={anneeCourante} DC={DC} peut={peut} />
            )}

            {activeTab === "analytique" && (
              <OngletAnalytique axes={axesAnalytiques} setAxes={setAxesAnalytiques} repartition={analytiqueRepartition} DC={DC} />
            )}

            {activeTab === "honoraires" && (
              <OngletHonoraires honoraires={honoraires} recharger={rechargerBase} exportCSV={exportCSV} peut={peut} />
            )}

            {activeTab === "exports" && (
              <OngletExports factures={factures} paiements={paiements} honoraires={honoraires} fournisseurs={fournisseurs} exportCSV={exportCSV} peut={peut} />
            )}

            {activeTab === "messages" && (
              <div style={{ padding: "24px 0" }}>
                <MessagerieTab accentColor="#d97706" />
              </div>
            )}

            {activeTab === "notifications" && (
              <div style={{ padding: "24px 0" }}>
                <NotificationsTab userId={profil?.id} accentColor="#d97706" />
              </div>
            )}

          </div>{/* fin padding 24 */}
        </div>{/* fin white card */}
      </div>{/* fin outer padding */}

      <FooterSaaS couleurTheme={PRIMARY_COLOR} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - VUE D'ENSEMBLE
═══════════════════════════════════════════════════════ */
function OngletVueEnsemble({ stats, factures, paiements, honoraires, setActiveTab, chargement }) {
  const mois12 = useMemo(() => derniersMois(12), []);
  const mois6  = useMemo(() => derniersMois(6), []);

  /* Évolution du CA encaissé (12 mois) */
  const caEvolution = useMemo(() => {
    const parMois = {};
    mois12.forEach(m => { parMois[m.key] = 0; });
    paiements.forEach(p => {
      const key = (p.date_paiement || "").slice(0,7);
      if (key in parMois) parMois[key] += Number(p.montant_recu || 0);
    });
    return {
      labels: mois12.map(m => m.label),
      datasets: [{
        label: "CA encaissé",
        data: mois12.map(m => parMois[m.key]),
        borderColor: PRIMARY_COLOR,
        backgroundColor: PRIMARY_COLOR + "22",
        fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: PRIMARY_COLOR,
      }],
    };
  }, [paiements, mois12]);

  /* Répartition des paiements par mode */
  const modeRepartition = useMemo(() => {
    const map = {};
    paiements.forEach(p => { const m = p.mode_paiement || "Autre"; map[m] = (map[m]||0) + Number(p.montant_recu||0); });
    const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]);
    return {
      labels: entries.map(([m])=>m),
      datasets: [{ data: entries.map(([,v])=>v), backgroundColor: CHART_COLORS, borderWidth: 0 }],
    };
  }, [paiements]);

  /* Honoraires payés vs en attente (6 mois) */
  const honorairesEvolution = useMemo(() => {
    const paye = {}, attente = {};
    mois6.forEach(m => { paye[m.key] = 0; attente[m.key] = 0; });
    honoraires.forEach(h => {
      const key = `${h.annee}-${String(h.mois).padStart(2,"0")}`;
      if (!(key in paye)) return;
      const montant = Number(h.montant_net ?? h.montant_total ?? 0);
      if (h.statut === "paye") paye[key] += montant; else attente[key] += montant;
    });
    return {
      labels: mois6.map(m => m.label),
      datasets: [
        { label: "Payé", data: mois6.map(m => paye[m.key]), backgroundColor: "#16a34a", borderRadius: 4 },
        { label: "En attente", data: mois6.map(m => attente[m.key]), backgroundColor: "#f59e0b", borderRadius: 4 },
      ],
    };
  }, [honoraires, mois6]);

  /* Facturation émise vs encaissée (6 mois) */
  const facturationEvolution = useMemo(() => {
    const emis = {}, encaisse = {};
    mois6.forEach(m => { emis[m.key] = 0; encaisse[m.key] = 0; });
    factures.forEach(f => {
      const key = (f.date_emission || f.created_at || "").slice(0,7);
      if (!(key in emis)) return;
      emis[key] += Number(f.montant_ttc || 0);
      encaisse[key] += Number(f.montant_paye || 0);
    });
    return {
      labels: mois6.map(m => m.label),
      datasets: [
        { label: "Facturé", data: mois6.map(m => emis[m.key]), backgroundColor: "#0369a1", borderRadius: 4 },
        { label: "Encaissé", data: mois6.map(m => encaisse[m.key]), backgroundColor: "#16a34a", borderRadius: 4 },
      ],
    };
  }, [factures, mois6]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        <StatCard label="CA encaissé (mois)"   value={fmt(stats.caMois)}          icon="💵" color={PRIMARY_COLOR}  sub="ce mois-ci"     onClick={()=>setActiveTab("paiements")} />
        <StatCard label="Honoraires (mois)"    value={fmt(stats.honorairesMois)}   icon="💸" color="#dc2626"        sub="à décaisser"    onClick={()=>setActiveTab("honoraires")} />
        <StatCard label="Solde prévisionnel"   value={fmt(stats.soldePrev)}        icon="🏦" color={stats.soldePrev>=0?"#16a34a":"#dc2626"} sub="CA − honoraires" onClick={()=>setActiveTab("tresorerie")} />
        <StatCard label="Factures en retard"   value={stats.impayés}               icon="⚠️" color="#dc2626"        sub="à relancer"     onClick={()=>setActiveTab("facturation")} />
      </div>

      {(stats.impayés > 0 || stats.aPayerHon > 0) && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {stats.impayés > 0 && (
            <div style={{ padding:"10px 16px", background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:10, fontSize:13, color:"#991b1b", fontWeight:600, display:"flex", justifyContent:"space-between", cursor:"pointer" }}
              onClick={()=>setActiveTab("facturation")}>
              <span>⚠️ {stats.impayés} facture{stats.impayés>1?"s":""} en retard - relance requise</span>
              <span style={{ fontSize:11 }}>Voir →</span>
            </div>
          )}
          {stats.aPayerHon > 0 && (
            <div style={{ padding:"10px 16px", background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:10, fontSize:13, color:"#92400e", fontWeight:600, display:"flex", justifyContent:"space-between", cursor:"pointer" }}
              onClick={()=>setActiveTab("honoraires")}>
              <span>💰 {stats.aPayerHon} fiche{stats.aPayerHon>1?"s":""} d'honoraires transmise{stats.aPayerHon>1?"s":""} - virement à effectuer</span>
              <span style={{ fontSize:11 }}>Voir →</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14 }}>
        <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>📈 Évolution du CA encaissé (12 mois)</div>
          <div style={{ height:220 }}>
            <Line data={caEvolution} options={{ ...chartOptsCommon, plugins:{ ...chartOptsCommon.plugins, tooltip:{ callbacks:{ label:(ctx)=>fmt(ctx.parsed.y) } } } }} />
          </div>
        </div>
        <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>🥧 Paiements par mode</div>
          <div style={{ height:220 }}>
            {modeRepartition.labels.length === 0 ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#94a3b8", fontSize:13 }}>Aucune donnée</div>
            ) : (
              <Doughnut data={modeRepartition} options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom", labels:{ boxWidth:10, font:{ size:11 } } }, tooltip:{ callbacks:{ label:(ctx)=>`${ctx.label} : ${fmt(ctx.parsed)}` } } } }} />
            )}
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>💰 Honoraires - payés vs en attente</div>
          <div style={{ height:200 }}>
            <Bar data={honorairesEvolution} options={{ ...chartOptsCommon, plugins:{ legend:{ display:true, position:"bottom", labels:{ boxWidth:10, font:{ size:11 } } }, tooltip:{ callbacks:{ label:(ctx)=>`${ctx.dataset.label} : ${fmt(ctx.parsed.y)}` } } }, scales:{ ...chartOptsCommon.scales, x:{ ...chartOptsCommon.scales.x, stacked:true }, y:{ ...chartOptsCommon.scales.y, stacked:true } } }} />
          </div>
        </div>
        <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>🧾 Facturation - émise vs encaissée</div>
          <div style={{ height:200 }}>
            <Bar data={facturationEvolution} options={{ ...chartOptsCommon, plugins:{ legend:{ display:true, position:"bottom", labels:{ boxWidth:10, font:{ size:11 } } }, tooltip:{ callbacks:{ label:(ctx)=>`${ctx.dataset.label} : ${fmt(ctx.parsed.y)}` } } } }} />
          </div>
        </div>
      </div>

      <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
        <div style={{ fontWeight:800, fontSize:14, marginBottom:14, display:"flex", justifyContent:"space-between" }}>
          <span>🕐 Derniers paiements</span>
          <button onClick={()=>setActiveTab("paiements")} style={{ fontSize:12, color:PRIMARY_COLOR, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>Voir tout →</button>
        </div>
        {chargement ? <div style={{ textAlign:"center", padding:30, color:"#9ca3af", fontSize:13 }}>Chargement…</div> : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{["Client","Montant reçu","Mode","Date","Statut"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {paiements.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign:"center", padding:24, color:"#94a3b8", fontSize:13 }}>Aucun paiement enregistré</td></tr>
              ) : paiements.slice(0,6).map(p => {
                const s = STATUT_PMT[p.statut]||STATUT_PMT.en_attente;
                return (
                  <tr key={p.id}>
                    <Td bold>{p.client}</Td>
                    <Td bold>{fmt(p.montant_recu)}</Td>
                    <Td>{p.mode_paiement}</Td>
                    <Td>{fmtD(p.date_paiement)}</Td>
                    <Td><Badge label={s.lib} color={s.color} bg={s.bg} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - FACTURATION
═══════════════════════════════════════════════════════ */
function OngletFacturation({ factures, recharger, exportCSV, DC, peut }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ client_nom:"", client_type:"entreprise", client_email:"", montant_ht:"", tva_taux:18, date_echeance:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  const soumettre = async () => {
    if (!form.client_nom.trim() || !form.montant_ht) { toast.error("Client et montant HT requis"); return; }
    setSaving(true);
    try {
      await postJSON(`${DC}/factures`, { ...form, montant_ht: Number(form.montant_ht), tva_taux: Number(form.tva_taux) });
      toast.success("Facture créée");
      setShowModal(false); setForm({ client_nom:"", client_type:"entreprise", client_email:"", montant_ht:"", tva_taux:18, date_echeance:"", notes:"" });
      recharger();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const relancer = async (f) => {
    try {
      await postJSON(`${DC}/factures/${f.id}/relancer`, {});
      toast.success(`Relance envoyée pour ${f.client_nom}`);
      recharger();
    } catch (e) { toast.error(e.message); }
  };

  const total = factures.reduce((s,f)=>s+Number(f.montant_ttc||0),0);
  const paye  = factures.reduce((s,f)=>s+Number(f.montant_paye||0),0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:11, color:"#9ca3af" }}>{factures.length} facture{factures.length>1?"s":""}</span>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>exportCSV(factures,"factures")} style={{ padding:"7px 14px", background:"#f1f5f9", color:"#374151", border:"1px solid #e5e7eb", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer" }}>📤 Export</button>
          <button onClick={()=>setShowModal(true)} disabled={!peut("finances","create")} title={permBtnTitle("+ Nouvelle facture", peut("finances","create"))} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{peut("finances","create")?"+":"🔒"} Nouvelle facture</button>
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <div style={{ flex:1, background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Total facturé</div>
          <div style={{ fontSize:15, fontWeight:800, color:PRIMARY_COLOR }}>{fmt(total)}</div>
        </div>
        <div style={{ flex:1, background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Encaissé</div>
          <div style={{ fontSize:15, fontWeight:800, color:"#16a34a" }}>{fmt(paye)}</div>
        </div>
        <div style={{ flex:1, background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Reste à encaisser</div>
          <div style={{ fontSize:15, fontWeight:800, color:"#dc2626" }}>{fmt(total-paye)}</div>
        </div>
      </div>

      <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{["Numéro","Client","Montant TTC","Échéance","Statut",""].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {factures.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucune facture</td></tr>
            ) : factures.map(f => {
              const s = STATUT_FACTURE[f.statut]||STATUT_FACTURE.brouillon;
              return (
                <tr key={f.id} onClick={()=>setDetail(f)} style={{ cursor:"pointer" }}>
                  <Td bold>{f.numero}</Td>
                  <Td>{f.client_nom}</Td>
                  <Td bold>{fmt(f.montant_ttc)}</Td>
                  <Td>{fmtD(f.date_echeance)}</Td>
                  <Td><Badge label={s.lib} color={s.color} bg={s.bg} /></Td>
                  <Td>
                    {(f.statut === "en_retard" || f.statut === "envoyee") && (
                      <button onClick={(e)=>{ e.stopPropagation(); if (!peut("finances","update")) return; relancer(f); }} disabled={!peut("finances","update")} title={permBtnTitle("Relancer", peut("finances","update"))} style={permBtnStyle({ padding:"4px 10px", background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:6, fontSize:11, color:"#92400e", fontWeight:700, cursor:"pointer" }, peut("finances","update"))}>{peut("finances","update")?"📧":"🔒"} Relancer</button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="🧾 Nouvelle facture" onClose={()=>setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Field label="Client *"><input style={inputSt} value={form.client_nom} onChange={e=>setForm(f=>({...f,client_nom:e.target.value}))} /></Field>
            <Field label="Type de client">
              <select style={selectSt} value={form.client_type} onChange={e=>setForm(f=>({...f,client_type:e.target.value}))}>
                <option value="entreprise">Entreprise</option><option value="particulier">Particulier</option>
              </select>
            </Field>
            <Field label="Email"><input style={inputSt} value={form.client_email} onChange={e=>setForm(f=>({...f,client_email:e.target.value}))} /></Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="Montant HT *"><input type="number" style={inputSt} value={form.montant_ht} onChange={e=>setForm(f=>({...f,montant_ht:e.target.value}))} /></Field>
              <Field label="TVA (%)"><input type="number" style={inputSt} value={form.tva_taux} onChange={e=>setForm(f=>({...f,tva_taux:e.target.value}))} /></Field>
            </div>
            <Field label="Date d'échéance"><input type="date" style={inputSt} value={form.date_echeance} onChange={e=>setForm(f=>({...f,date_echeance:e.target.value}))} /></Field>
            <Field label="Notes"><textarea rows={2} style={inputSt} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowModal(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={soumettre} disabled={saving || !peut("finances","create")} title={permBtnTitle("✓ Créer", peut("finances","create"))} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{saving?"⏳…":(peut("finances","create")?"✓ Créer":"🔒 Créer")}</button>
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`🧾 Facture ${detail.numero}`} onClose={()=>setDetail(null)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["Client",detail.client_nom],["Type",detail.client_type],["Montant HT",fmt(detail.montant_ht)],["TVA",`${detail.tva_taux}%`],["Montant TTC",fmt(detail.montant_ttc)],["Payé",fmt(detail.montant_paye)],["Émission",fmtD(detail.date_emission)],["Échéance",fmtD(detail.date_echeance)]].map(([l,v])=>(
              <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 12px" }}>
                <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{v}</div>
              </div>
            ))}
          </div>
          {detail.notes && <div style={{ marginTop:12, padding:"8px 12px", background:"#fef3c7", borderRadius:8, fontSize:12 }}>📝 {detail.notes}</div>}
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - PAIEMENTS
═══════════════════════════════════════════════════════ */
function OngletPaiements({ paiements, exportCSV }) {
  const [filtreStatut, setFiltreStatut] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [detail, setDetail] = useState(null);

  const parMode = useMemo(() => {
    const map = {};
    paiements.forEach(p => { map[p.mode_paiement || "-"] = (map[p.mode_paiement || "-"]||0) + Number(p.montant_recu||0); });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }, [paiements]);

  const filtres = useMemo(() => {
    return paiements.filter(p => {
      if (filtreStatut && p.statut !== filtreStatut) return false;
      if (searchQ && !`${p.client||""} ${p.email||""} ${p.commercial_nom||""}`.toLowerCase().includes(searchQ.toLowerCase())) return false;
      return true;
    });
  }, [paiements, filtreStatut, searchQ]);

  const totalDu = filtres.reduce((s,p)=>s+Number(p.montant_du||0),0);
  const totalRecu = filtres.reduce((s,p)=>s+Number(p.montant_recu||0),0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ padding:"8px 14px", background:"#e0f2fe", border:"1px solid #bae6fd", borderRadius:8, fontSize:12, color:"#0369a1" }}>
        ℹ️ Vue consultative des paiements clients (historique réel - parcours commerciaux). La saisie se fait côté commercial ; le comptable consulte et exporte ici.
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
        <span style={{ fontSize:11, color:"#9ca3af" }}>{filtres.length} paiement{filtres.length>1?"s":""}</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input placeholder="🔎 Rechercher un client…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{ ...inputSt, width:200 }} />
          <RangeePastilles valeur={filtreStatut} style={{ marginBottom:0 }}
            onChange={(v)=>setFiltreStatut(v)}
            options={[{ v:"", l:"Tous" }, { v:"reçu", l:"Reçu" }, { v:"paye", l:"Payé" }, { v:"partiel", l:"Partiel" }]}
            compte={(v)=> v==="" ? paiements.length : paiements.filter(p=>p.statut===v).length} />
          <button onClick={()=>exportCSV(filtres,"paiements")} style={{ padding:"7px 14px", background:"#f1f5f9", color:"#374151", border:"1px solid #e5e7eb", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer" }}>📤 Export</button>
        </div>
      </div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
        <div style={{ flex:"1 1 140px", background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Total dû</div><div style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>{fmt(totalDu)}</div>
        </div>
        <div style={{ flex:"1 1 140px", background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:11, color:"#9ca3af" }}>Total reçu</div><div style={{ fontSize:15, fontWeight:800, color:"#16a34a" }}>{fmt(totalRecu)}</div>
        </div>
        {parMode.map(([mode,total])=>(
          <div key={mode} style={{ flex:"1 1 140px", background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
            <div style={{ fontSize:11, color:"#9ca3af" }}>{mode}</div>
            <div style={{ fontSize:15, fontWeight:800, color:PRIMARY_COLOR }}>{fmt(total)}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{["Client","Commercial","Montant dû","Montant reçu","Mode","Date","Référence","Statut"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {filtres.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucun paiement</td></tr>
            ) : filtres.map(p => {
              const s = STATUT_PMT[p.statut]||STATUT_PMT.en_attente;
              return (
                <tr key={p.id} onClick={()=>setDetail(p)} style={{ cursor:"pointer" }}>
                  <Td bold>{p.client}</Td>
                  <Td>{p.commercial_nom || "-"}</Td>
                  <Td>{fmt(p.montant_du)}</Td>
                  <Td bold>{fmt(p.montant_recu)}</Td>
                  <Td>{p.mode_paiement || "-"}</Td>
                  <Td>{fmtD(p.date_paiement)}</Td>
                  <Td>{p.ref_transaction || "-"}</Td>
                  <Td><Badge label={s.lib} color={s.color} bg={s.bg} /></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal title={`💳 Paiement - ${detail.client}`} onClose={()=>setDetail(null)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["Client",detail.client],["Email",detail.email||"-"],["Téléphone",detail.telephone||"-"],["Commercial",detail.commercial_nom||"-"],["Montant dû",fmt(detail.montant_du)],["Montant reçu",fmt(detail.montant_recu)],["Mode",detail.mode_paiement||"-"],["Date",fmtD(detail.date_paiement)],["Référence",detail.ref_transaction||"-"],["Inscription",detail.inscription||"-"]].map(([l,v])=>(
              <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 12px" }}>
                <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{v}</div>
              </div>
            ))}
          </div>
          {detail.notes && <div style={{ marginTop:12, padding:"8px 12px", background:"#fef3c7", borderRadius:8, fontSize:12 }}>📝 {detail.notes}</div>}
          {detail.payment_token && (
            <div style={{ marginTop:12, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#166534", marginBottom:8, textTransform:"uppercase", letterSpacing:".04em" }}>🌐 Transaction TouchPoint</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12 }}>
                <div><span style={{ color:"#6b7280" }}>Référence : </span><span style={{ fontFamily:"monospace", fontWeight:600 }}>{detail.ref_transaction}</span></div>
                <div><span style={{ color:"#6b7280" }}>Token : </span><span style={{ fontFamily:"monospace", fontWeight:600 }}>{detail.payment_token}</span></div>
                <div><span style={{ color:"#6b7280" }}>Mode / opérateur : </span><span style={{ fontWeight:600 }}>{detail.payment_mode_reel || "-"}</span></div>
                <div><span style={{ color:"#6b7280" }}>Créé le : </span><span style={{ fontWeight:600 }}>{detail.touchpoint_cree_le ? new Date(detail.touchpoint_cree_le).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "-"}</span></div>
                <div><span style={{ color:"#6b7280" }}>Mis à jour le : </span><span style={{ fontWeight:600 }}>{detail.touchpoint_maj_le ? new Date(detail.touchpoint_maj_le).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "-"}</span></div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - TRÉSORERIE
═══════════════════════════════════════════════════════ */
function OngletTresorerie({ synthese, depenses, setDepenses, DC, peut }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ categorie:"loyer", libelle:"", montant:"", date_depense:new Date().toISOString().slice(0,10), mode_paiement:"virement", beneficiaire:"" });
  const [saving, setSaving] = useState(false);

  const soumettre = async () => {
    if (!form.libelle.trim() || !form.montant) { toast.error("Libellé et montant requis"); return; }
    setSaving(true);
    try {
      const d = await postJSON(`${DC}/depenses`, { ...form, montant: Number(form.montant) });
      setDepenses(prev => [d.depense, ...prev]);
      toast.success("Dépense enregistrée");
      setShowModal(false); setForm({ categorie:"loyer", libelle:"", montant:"", date_depense:new Date().toISOString().slice(0,10), mode_paiement:"virement", beneficiaire:"" });
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        <StatCard label="Solde de trésorerie" value={fmt(synthese?.solde ?? 0)} icon="🏦" color="#16a34a" />
        <StatCard label="Entrées (mois)" value={fmt(synthese?.entrees_mois ?? 0)} icon="📈" color={PRIMARY_COLOR} />
        <StatCard label="Sorties (mois)" value={fmt(synthese?.sorties_mois ?? 0)} icon="📉" color="#dc2626" />
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontWeight:800, fontSize:14 }}>💸 Dépenses</div>
        <button onClick={()=>setShowModal(true)} disabled={!peut("finances","create")} title={permBtnTitle("+ Nouvelle dépense", peut("finances","create"))} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{peut("finances","create")?"+":"🔒"} Nouvelle dépense</button>
      </div>

      <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{["Catégorie","Libellé","Montant","Date","Bénéficiaire","Statut"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {depenses.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucune dépense enregistrée</td></tr>
            ) : depenses.map(d => (
              <tr key={d.id}>
                <Td>{d.categorie}</Td>
                <Td bold>{d.libelle}</Td>
                <Td bold>{fmt(d.montant)}</Td>
                <Td>{fmtD(d.date_depense)}</Td>
                <Td>{d.beneficiaire || "-"}</Td>
                <Td><Badge label={d.statut==="payee"?"Payée":"Prévue"} color={d.statut==="payee"?"#16a34a":"#d97706"} bg={d.statut==="payee"?"#dcfce7":"#fef3c7"} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="💸 Nouvelle dépense" onClose={()=>setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Field label="Catégorie">
              <select style={selectSt} value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}>
                <option value="loyer">Loyer</option><option value="salaires">Salaires</option><option value="marketing">Marketing</option>
                <option value="materiel">Matériel</option><option value="utilities">Utilities</option><option value="autre">Autre</option>
              </select>
            </Field>
            <Field label="Libellé *"><input style={inputSt} value={form.libelle} onChange={e=>setForm(f=>({...f,libelle:e.target.value}))} /></Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="Montant *"><input type="number" style={inputSt} value={form.montant} onChange={e=>setForm(f=>({...f,montant:e.target.value}))} /></Field>
              <Field label="Date"><input type="date" style={inputSt} value={form.date_depense} onChange={e=>setForm(f=>({...f,date_depense:e.target.value}))} /></Field>
            </div>
            <Field label="Bénéficiaire"><input style={inputSt} value={form.beneficiaire} onChange={e=>setForm(f=>({...f,beneficiaire:e.target.value}))} /></Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowModal(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={soumettre} disabled={saving || !peut("finances","create")} title={permBtnTitle("✓ Enregistrer", peut("finances","create"))} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{saving?"⏳…":(peut("finances","create")?"✓ Enregistrer":"🔒 Enregistrer")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - FOURNISSEURS & ACHATS
═══════════════════════════════════════════════════════ */
function OngletFournisseurs({ fournisseurs, setFournisseurs, facturesAchat, setFacturesAchat, DC, peut }) {
  const [sousOnglet, setSousOnglet] = useState("fournisseurs");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nom:"", contact_nom:"", email:"", telephone:"", categorie:"autre" });
  const [showModalFA, setShowModalFA] = useState(false);
  const [formFA, setFormFA] = useState({ fournisseur_id:"", categorie:"autre", montant_ht:"", tva_taux:18, date_echeance:"" });
  const [saving, setSaving] = useState(false);

  const creerFournisseur = async () => {
    if (!form.nom.trim()) { toast.error("Nom requis"); return; }
    setSaving(true);
    try {
      const d = await postJSON(`${DC}/fournisseurs`, form);
      setFournisseurs(prev => [d.fournisseur, ...prev]);
      toast.success("Fournisseur créé");
      setShowModal(false); setForm({ nom:"", contact_nom:"", email:"", telephone:"", categorie:"autre" });
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const creerFactureAchat = async () => {
    if (!formFA.fournisseur_id || !formFA.montant_ht) { toast.error("Fournisseur et montant requis"); return; }
    setSaving(true);
    try {
      const d = await postJSON(`${DC}/factures-achat`, { ...formFA, montant_ht: Number(formFA.montant_ht), tva_taux: Number(formFA.tva_taux) });
      setFacturesAchat(prev => [d.facture, ...prev]);
      toast.success("Facture d'achat créée");
      setShowModalFA(false); setFormFA({ fournisseur_id:"", categorie:"autre", montant_ht:"", tva_taux:18, date_echeance:"" });
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:8 }}>
        {[["fournisseurs","🏭 Fournisseurs"],["achats","📄 Factures d'achat"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSousOnglet(k)} style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${sousOnglet===k?PRIMARY_COLOR:"#e5e7eb"}`, background:sousOnglet===k?PRIMARY_COLOR+"15":"#fff", color:sousOnglet===k?PRIMARY_COLOR:"#6b7280", fontWeight:700, fontSize:12, cursor:"pointer" }}>{l}</button>
        ))}
      </div>

      {sousOnglet === "fournisseurs" && (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setShowModal(true)} disabled={!peut("finances","create")} title={permBtnTitle("+ Nouveau fournisseur", peut("finances","create"))} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{peut("finances","create")?"+":"🔒"} Nouveau fournisseur</button>
          </div>
          <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["Nom","Contact","Email","Téléphone","Catégorie"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>
                {fournisseurs.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucun fournisseur</td></tr>
                ) : fournisseurs.map(f => (
                  <tr key={f.id}><Td bold>{f.nom}</Td><Td>{f.contact_nom||"-"}</Td><Td>{f.email||"-"}</Td><Td>{f.telephone||"-"}</Td><Td>{f.categorie}</Td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sousOnglet === "achats" && (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setShowModalFA(true)} disabled={!peut("finances","create")} title={permBtnTitle("+ Nouvelle facture d'achat", peut("finances","create"))} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{peut("finances","create")?"+":"🔒"} Nouvelle facture d'achat</button>
          </div>
          <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["Numéro","Fournisseur","Montant TTC","Échéance","Statut"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>
                {facturesAchat.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucune facture d'achat</td></tr>
                ) : facturesAchat.map(f => {
                  const fourn = fournisseurs.find(x=>x.id===f.fournisseur_id);
                  return (
                    <tr key={f.id}><Td bold>{f.numero}</Td><Td>{fourn?.nom||"-"}</Td><Td bold>{fmt(f.montant_ttc)}</Td><Td>{fmtD(f.date_echeance)}</Td><Td><Badge label={f.statut} color="#0369a1" bg="#e0f2fe" /></Td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <Modal title="🏭 Nouveau fournisseur" onClose={()=>setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Field label="Nom *"><input style={inputSt} value={form.nom} onChange={e=>setForm(f=>({...f,nom:e.target.value}))} /></Field>
            <Field label="Contact"><input style={inputSt} value={form.contact_nom} onChange={e=>setForm(f=>({...f,contact_nom:e.target.value}))} /></Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="Email"><input style={inputSt} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></Field>
              <Field label="Téléphone"><input style={inputSt} value={form.telephone} onChange={e=>setForm(f=>({...f,telephone:e.target.value}))} /></Field>
            </div>
            <Field label="Catégorie">
              <select style={selectSt} value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}>
                <option value="loyer">Loyer</option><option value="marketing">Marketing</option><option value="materiel">Matériel</option>
                <option value="services">Services</option><option value="utilities">Utilities</option><option value="autre">Autre</option>
              </select>
            </Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowModal(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={creerFournisseur} disabled={saving || !peut("finances","create")} title={permBtnTitle("✓ Créer", peut("finances","create"))} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{saving?"⏳…":(peut("finances","create")?"✓ Créer":"🔒 Créer")}</button>
            </div>
          </div>
        </Modal>
      )}

      {showModalFA && (
        <Modal title="📄 Nouvelle facture d'achat" onClose={()=>setShowModalFA(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Field label="Fournisseur *">
              <select style={selectSt} value={formFA.fournisseur_id} onChange={e=>setFormFA(f=>({...f,fournisseur_id:e.target.value}))}>
                <option value="">- Sélectionner -</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="Montant HT *"><input type="number" style={inputSt} value={formFA.montant_ht} onChange={e=>setFormFA(f=>({...f,montant_ht:e.target.value}))} /></Field>
              <Field label="TVA (%)"><input type="number" style={inputSt} value={formFA.tva_taux} onChange={e=>setFormFA(f=>({...f,tva_taux:e.target.value}))} /></Field>
            </div>
            <Field label="Échéance"><input type="date" style={inputSt} value={formFA.date_echeance} onChange={e=>setFormFA(f=>({...f,date_echeance:e.target.value}))} /></Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowModalFA(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={creerFactureAchat} disabled={saving || !peut("finances","create")} title={permBtnTitle("✓ Créer", peut("finances","create"))} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{saving?"⏳…":(peut("finances","create")?"✓ Créer":"🔒 Créer")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - RRD · BC · BACN
   - RRD (Registre des Recettes et Dépenses) : lecture seule, solde cumulé
     calculé sur dash_comptabilite_tresorerie_mouvements.
   - BC (Bon de Caisse) : sortie de caisse formalisée et numérotée.
   - BACN (Bordereau d'Achat Conforme aux Normes) : bon d'achat émis par
     l'acheteur, lignes multiples, pas de mouvement de trésorerie.
═══════════════════════════════════════════════════════ */
const STATUT_BC_DASH   = { valide:{ lib:"Validé", color:"#16a34a", bg:"#dcfce7" }, brouillon:{ lib:"Brouillon", color:"#d97706", bg:"#fef3c7" }, annule:{ lib:"Annulé", color:"#94a3b8", bg:"#f1f5f9" } };
const STATUT_BACN_DASH = { brouillon:{ lib:"Brouillon", color:"#d97706", bg:"#fef3c7" }, valide:{ lib:"Validé", color:"#16a34a", bg:"#dcfce7" }, annule:{ lib:"Annulé", color:"#94a3b8", bg:"#f1f5f9" } };
const LIGNE_BACN_VIDE_DASH = { designation:"", quantite:1, prix_unitaire:"" };

function OngletRrdBcBacn({ DR, peut }) {
  const [sousOnglet, setSousOnglet] = useState("rrd");
  const [registre, setRegistre] = useState([]);
  const [rrdTotaux, setRrdTotaux] = useState({ total_recettes:0, total_depenses:0, solde_final:0 });
  const [bonsCaisse, setBonsCaisse] = useState([]);
  const [bordereaux, setBordereaux] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showBc, setShowBc] = useState(false);
  const [formBc, setFormBc] = useState({ beneficiaire:"", motif:"", montant:"", date_bc:"", mode_paiement:"especes" });

  const [showBacn, setShowBacn] = useState(false);
  const [formBacn, setFormBacn] = useState({ fournisseur_nom:"", date_bacn:"" });
  const [lignesBacn, setLignesBacn] = useState([{ ...LIGNE_BACN_VIDE_DASH }]);

  const charger = useCallback(async () => {
    setChargement(true);
    const [r, bc, bacn] = await Promise.all([fetchJSON(`${DR}/rrd`), fetchJSON(`${DR}/bons-caisse`), fetchJSON(`${DR}/bordereaux-achat`)]);
    setRegistre(r?.registre || []);
    setRrdTotaux({ total_recettes:r?.total_recettes||0, total_depenses:r?.total_depenses||0, solde_final:r?.solde_final||0 });
    setBonsCaisse(bc?.bons_caisse || []);
    setBordereaux(bacn?.bordereaux_achat || []);
    setChargement(false);
  }, [DR]);
  useEffect(() => { charger(); }, [charger]);

  const creerBonCaisse = async () => {
    if (!formBc.beneficiaire.trim() || !formBc.motif.trim() || !formBc.montant) { toast.error("Bénéficiaire, motif et montant requis"); return; }
    setSaving(true);
    try {
      const d = await postJSON(`${DR}/bons-caisse`, formBc);
      setBonsCaisse(prev => [d.bon_caisse, ...prev]);
      toast.success(`Bon de caisse ${d.bon_caisse.numero} créé`);
      setShowBc(false); setFormBc({ beneficiaire:"", motif:"", montant:"", date_bc:"", mode_paiement:"especes" });
      charger();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };
  const annulerBonCaisse = async (id) => {
    try { await postJSON(`${DR}/bons-caisse/${id}/annuler`, {}, "PATCH"); setBonsCaisse(prev => prev.map(b => b.id===id ? { ...b, statut:"annule" } : b)); toast.success("Bon de caisse annulé"); }
    catch (e) { toast.error(e.message); }
  };

  const majLigneBacn = (idx, champ, val) => setLignesBacn(ls => ls.map((l,i) => i===idx ? { ...l, [champ]: val } : l));
  const ajouterLigneBacn = () => setLignesBacn(ls => [...ls, { ...LIGNE_BACN_VIDE_DASH }]);
  const retirerLigneBacn = (idx) => setLignesBacn(ls => ls.length>1 ? ls.filter((_,i)=>i!==idx) : ls);
  const totalBacnForm = lignesBacn.reduce((s,l) => s + (Number(l.quantite)||0)*(Number(l.prix_unitaire)||0), 0);

  const creerBordereauAchat = async () => {
    if (!formBacn.fournisseur_nom.trim()) { toast.error("Fournisseur requis"); return; }
    const lignesValides = lignesBacn.filter(l => l.designation.trim() && Number(l.quantite)>0 && Number(l.prix_unitaire)>0);
    if (lignesValides.length === 0) { toast.error("Au moins une ligne complète requise"); return; }
    setSaving(true);
    try {
      const d = await postJSON(`${DR}/bordereaux-achat`, { ...formBacn, lignes: lignesValides });
      setBordereaux(prev => [d.bordereau_achat, ...prev]);
      toast.success(`Bordereau ${d.bordereau_achat.numero} créé`);
      setShowBacn(false); setFormBacn({ fournisseur_nom:"", date_bacn:"" }); setLignesBacn([{ ...LIGNE_BACN_VIDE_DASH }]);
      charger();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };
  const validerBordereau = async (id) => {
    try { await postJSON(`${DR}/bordereaux-achat/${id}/valider`, {}, "PATCH"); setBordereaux(prev => prev.map(b => b.id===id ? { ...b, statut:"valide" } : b)); toast.success("Bordereau validé"); }
    catch (e) { toast.error(e.message); }
  };
  const annulerBordereau = async (id) => {
    try { await postJSON(`${DR}/bordereaux-achat/${id}/annuler`, {}, "PATCH"); setBordereaux(prev => prev.map(b => b.id===id ? { ...b, statut:"annule" } : b)); toast.success("Bordereau annulé"); }
    catch (e) { toast.error(e.message); }
  };

  const canCreate = peut("finances", "create");

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12 }}>
        <StatCard label="Total recettes" value={fmt(rrdTotaux.total_recettes)} color="#16a34a" icon="💰" />
        <StatCard label="Total dépenses" value={fmt(rrdTotaux.total_depenses)} color="#dc2626" icon="💸" />
        <StatCard label="Solde" value={fmt(rrdTotaux.solde_final)} color="#0891b2" icon="🏦" />
        <StatCard label="Bordereaux en attente" value={bordereaux.filter(b=>b.statut==="brouillon").length} color="#d97706" icon="📋" />
      </div>

      <div style={{ display:"flex", gap:8 }}>
        {[["rrd","📒 RRD - Registre"],["bc","🧾 Bons de caisse"],["bacn","📋 Bordereaux d'achat"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSousOnglet(k)} style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${sousOnglet===k?PRIMARY_COLOR:"#e5e7eb"}`, background:sousOnglet===k?PRIMARY_COLOR+"15":"#fff", color:sousOnglet===k?PRIMARY_COLOR:"#6b7280", fontWeight:700, fontSize:12, cursor:"pointer" }}>{l}</button>
        ))}
      </div>

      {chargement && <div style={{ textAlign:"center", padding:32, color:"#94a3b8" }}>Chargement…</div>}

      {!chargement && sousOnglet === "rrd" && (
        <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{["Date","Description","Recette","Dépense","Solde cumulé"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {registre.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucun mouvement</td></tr>
              ) : registre.map(m => (
                <tr key={m.id}>
                  <Td>{fmtD(m.date_mouvement)}</Td><Td>{m.description||"-"}</Td>
                  <Td right>{m.recette>0?fmt(m.recette):"-"}</Td>
                  <Td right>{m.depense>0?fmt(m.depense):"-"}</Td>
                  <Td right bold>{fmt(m.solde_cumule)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!chargement && sousOnglet === "bc" && (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setShowBc(true)} disabled={!canCreate} title={permBtnTitle("+ Nouveau bon de caisse", canCreate)} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, canCreate)}>{canCreate?"+":"🔒"} Nouveau bon de caisse</button>
          </div>
          <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["N°","Bénéficiaire","Motif","Montant","Date","Statut","Actions"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>
                {bonsCaisse.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucun bon de caisse</td></tr>
                ) : bonsCaisse.map(b => {
                  const st = STATUT_BC_DASH[b.statut] || STATUT_BC_DASH.brouillon;
                  return (
                    <tr key={b.id}>
                      <Td bold>{b.numero}</Td><Td>{b.beneficiaire}</Td><Td>{b.motif}</Td>
                      <Td right bold>{fmt(b.montant)}</Td><Td>{fmtD(b.date_bc)}</Td>
                      <Td><Badge label={st.lib} color={st.color} bg={st.bg} /></Td>
                      <Td>{b.statut === "valide" && <button onClick={()=>annulerBonCaisse(b.id)} style={{ padding:"4px 10px", border:"1px solid #e5e7eb", borderRadius:6, fontSize:11, fontWeight:600, background:"#fff", cursor:"pointer" }}>Annuler</button>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!chargement && sousOnglet === "bacn" && (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setShowBacn(true)} disabled={!canCreate} title={permBtnTitle("+ Nouveau bordereau d'achat", canCreate)} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, canCreate)}>{canCreate?"+":"🔒"} Nouveau bordereau d'achat</button>
          </div>
          <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>{["N°","Fournisseur","Montant total","Date","Statut","Actions"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
              <tbody>
                {bordereaux.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucun bordereau d'achat</td></tr>
                ) : bordereaux.map(b => {
                  const st = STATUT_BACN_DASH[b.statut] || STATUT_BACN_DASH.brouillon;
                  return (
                    <tr key={b.id}>
                      <Td bold>{b.numero}</Td><Td>{b.fournisseur_nom}</Td>
                      <Td right bold>{fmt(b.montant_total)}</Td><Td>{fmtD(b.date_bacn)}</Td>
                      <Td><Badge label={st.lib} color={st.color} bg={st.bg} /></Td>
                      <Td>
                        <div style={{ display:"flex", gap:6 }}>
                          {b.statut === "brouillon" && <button onClick={()=>validerBordereau(b.id)} style={{ padding:"4px 10px", border:"none", borderRadius:6, fontSize:11, fontWeight:700, background:"#dcfce7", color:"#16a34a", cursor:"pointer" }}>Valider</button>}
                          {b.statut !== "annule" && <button onClick={()=>annulerBordereau(b.id)} style={{ padding:"4px 10px", border:"1px solid #e5e7eb", borderRadius:6, fontSize:11, fontWeight:600, background:"#fff", cursor:"pointer" }}>Annuler</button>}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showBc && (
        <Modal title="🧾 Nouveau bon de caisse" onClose={()=>setShowBc(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Field label="Bénéficiaire *"><input style={inputSt} value={formBc.beneficiaire} onChange={e=>setFormBc(f=>({...f,beneficiaire:e.target.value}))} /></Field>
            <Field label="Motif *"><input style={inputSt} value={formBc.motif} onChange={e=>setFormBc(f=>({...f,motif:e.target.value}))} /></Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="Montant *"><input type="number" style={inputSt} value={formBc.montant} onChange={e=>setFormBc(f=>({...f,montant:e.target.value}))} /></Field>
              <Field label="Date"><input type="date" style={inputSt} value={formBc.date_bc} onChange={e=>setFormBc(f=>({...f,date_bc:e.target.value}))} /></Field>
            </div>
            <Field label="Mode de paiement">
              <select style={selectSt} value={formBc.mode_paiement} onChange={e=>setFormBc(f=>({...f,mode_paiement:e.target.value}))}>
                <option value="especes">Espèces</option><option value="cheque">Chèque</option><option value="virement">Virement</option><option value="mobile_money">Mobile Money</option>
              </select>
            </Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowBc(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={creerBonCaisse} disabled={saving || !canCreate} title={permBtnTitle("✓ Créer", canCreate)} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, canCreate)}>{saving?"⏳…":(canCreate?"✓ Créer":"🔒 Créer")}</button>
            </div>
          </div>
        </Modal>
      )}

      {showBacn && (
        <Modal title="📋 Nouveau bordereau d'achat" onClose={()=>setShowBacn(false)} wide>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 }}>
              <Field label="Fournisseur *"><input style={inputSt} value={formBacn.fournisseur_nom} onChange={e=>setFormBacn(f=>({...f,fournisseur_nom:e.target.value}))} /></Field>
              <Field label="Date"><input type="date" style={inputSt} value={formBacn.date_bacn} onChange={e=>setFormBacn(f=>({...f,date_bacn:e.target.value}))} /></Field>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>Lignes d'achat</div>
              {lignesBacn.map((l, idx) => (
                <div key={idx} style={{ display:"grid", gridTemplateColumns:"2.2fr .8fr 1fr 1fr auto", gap:8, marginBottom:8, alignItems:"center" }}>
                  <input placeholder="Désignation" style={inputSt} value={l.designation} onChange={e=>majLigneBacn(idx,"designation",e.target.value)} />
                  <input type="number" placeholder="Qté" style={inputSt} value={l.quantite} onChange={e=>majLigneBacn(idx,"quantite",e.target.value)} />
                  <input type="number" placeholder="Prix unitaire" style={inputSt} value={l.prix_unitaire} onChange={e=>majLigneBacn(idx,"prix_unitaire",e.target.value)} />
                  <span style={{ fontSize:12.5, fontWeight:700, textAlign:"right" }}>{fmt((Number(l.quantite)||0)*(Number(l.prix_unitaire)||0))}</span>
                  <button onClick={()=>retirerLigneBacn(idx)} style={{ background:"none", border:"none", color:"#dc2626", fontSize:16, cursor:"pointer" }}>✕</button>
                </div>
              ))}
              <button onClick={ajouterLigneBacn} style={{ background:"none", border:"1px dashed #e5e7eb", borderRadius:7, padding:"6px 14px", fontSize:12, fontWeight:600, color:PRIMARY_COLOR, cursor:"pointer" }}>+ Ajouter une ligne</button>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", fontSize:14, fontWeight:800, paddingTop:8, borderTop:"1px solid #e5e7eb" }}>Total : {fmt(totalBacnForm)}</div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowBacn(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={creerBordereauAchat} disabled={saving || !canCreate} title={permBtnTitle("✓ Créer", canCreate)} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, canCreate)}>{saving?"⏳…":(canCreate?"✓ Créer":"🔒 Créer")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - COMPTABILITÉ GÉNÉRALE
═══════════════════════════════════════════════════════ */
function OngletGenerale({ planComptable, balance, bilan, compteResultat, exercices, setExercices, anneeCourante, DCG, peut }) {
  const [sousOnglet, setSousOnglet] = useState("balance");
  const cloturer = async () => {
    try {
      const d = await postJSON(`${DCG}/exercices/${anneeCourante}/cloturer`, {});
      setExercices(prev => [d.exercice, ...prev.filter(e=>e.annee!==anneeCourante)]);
      toast.success(`Exercice ${anneeCourante} clôturé`);
    } catch (e) { toast.error(e.message); }
  };
  const exerciceCourant = exercices.find(e=>e.annee===anneeCourante);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {[["balance","⚖️ Balance"],["plan","📚 Plan comptable"],["bilan","🏛️ Bilan"],["resultat","📈 Compte de résultat"],["exercices","🔒 Clôture"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSousOnglet(k)} style={{ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${sousOnglet===k?PRIMARY_COLOR:"#e5e7eb"}`, background:sousOnglet===k?PRIMARY_COLOR+"15":"#fff", color:sousOnglet===k?PRIMARY_COLOR:"#6b7280", fontWeight:700, fontSize:12, cursor:"pointer" }}>{l}</button>
        ))}
      </div>

      {sousOnglet === "balance" && (
        <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{["Compte","Libellé","Débit","Crédit","Solde"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {balance.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucune écriture pour l'instant</td></tr>
              ) : balance.map(b => (
                <tr key={b.compte_numero}><Td bold>{b.compte_numero}</Td><Td>{b.libelle}</Td><Td right>{fmt(b.debit)}</Td><Td right>{fmt(b.credit)}</Td><Td bold right>{fmt(b.solde)}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sousOnglet === "plan" && (
        <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{["Numéro","Libellé","Classe","Type"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>{planComptable.map(c => <tr key={c.numero}><Td bold>{c.numero}</Td><Td>{c.libelle}</Td><Td>{c.classe}</Td><Td>{c.type}</Td></tr>)}</tbody>
          </table>
        </div>
      )}

      {sousOnglet === "bilan" && bilan && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div style={{ background:"#fff", borderRadius:12, padding:18, border:"1px solid #f1f5f9" }}>
            <div style={{ fontWeight:800, marginBottom:10 }}>Actif</div>
            {(bilan.actif||[]).map(l=><div key={l.compte_numero} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"5px 0", borderBottom:"1px solid #f1f5f9" }}><span>{l.libelle}</span><b>{fmt(l.montant)}</b></div>)}
          </div>
          <div style={{ background:"#fff", borderRadius:12, padding:18, border:"1px solid #f1f5f9" }}>
            <div style={{ fontWeight:800, marginBottom:10 }}>Passif</div>
            {(bilan.passif||[]).map(l=><div key={l.compte_numero} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"5px 0", borderBottom:"1px solid #f1f5f9" }}><span>{l.libelle}</span><b>{fmt(l.montant)}</b></div>)}
          </div>
        </div>
      )}

      {sousOnglet === "resultat" && compteResultat && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div style={{ background:"#fff", borderRadius:12, padding:18, border:"1px solid #f1f5f9" }}>
            <div style={{ fontWeight:800, marginBottom:10, color:"#16a34a" }}>Produits</div>
            {(compteResultat.produits||[]).map(l=><div key={l.compte_numero} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"5px 0", borderBottom:"1px solid #f1f5f9" }}><span>{l.libelle}</span><b>{fmt(l.montant)}</b></div>)}
          </div>
          <div style={{ background:"#fff", borderRadius:12, padding:18, border:"1px solid #f1f5f9" }}>
            <div style={{ fontWeight:800, marginBottom:10, color:"#dc2626" }}>Charges</div>
            {(compteResultat.charges||[]).map(l=><div key={l.compte_numero} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"5px 0", borderBottom:"1px solid #f1f5f9" }}><span>{l.libelle}</span><b>{fmt(l.montant)}</b></div>)}
          </div>
          <div style={{ gridColumn:"1/-1", background:PRIMARY_LIGHT, borderRadius:12, padding:18, textAlign:"center" }}>
            <div style={{ fontSize:12, color:"#64748b" }}>Résultat net</div>
            <div style={{ fontSize:22, fontWeight:900, color:compteResultat.resultat>=0?"#16a34a":"#dc2626" }}>{fmt(compteResultat.resultat)}</div>
          </div>
        </div>
      )}

      {sousOnglet === "exercices" && (
        <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div>
              <div style={{ fontWeight:800 }}>Exercice {anneeCourante}</div>
              <div style={{ fontSize:12, color:"#64748b" }}>Statut : {exerciceCourant?.statut === "cloture" ? "🔒 Clôturé" : "🟢 Ouvert"}</div>
            </div>
            {exerciceCourant?.statut !== "cloture" && (
              <button onClick={cloturer} disabled={!peut("finances","update")} title={permBtnTitle("Clôturer l'exercice", peut("finances","update"))} style={permBtnStyle({ padding:"8px 16px", background:"#dc2626", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","update"))}>🔒 Clôturer l'exercice</button>
            )}
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{["Année","Statut","Résultat","Clôturé le"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>{exercices.map(e => <tr key={e.id}><Td bold>{e.annee}</Td><Td>{e.statut}</Td><Td>{fmt(e.resultat_exercice)}</Td><Td>{fmtD(e.date_cloture)}</Td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - TVA
═══════════════════════════════════════════════════════ */
function OngletTva({ synthese, declarations, setDeclarations, DCT, peut }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ periode_mois:new Date().getMonth()+1, periode_annee:new Date().getFullYear(), tva_collectee:"", tva_deductible:"" });
  const [saving, setSaving] = useState(false);

  const soumettre = async () => {
    setSaving(true);
    try {
      const collectee = Number(form.tva_collectee)||0, deductible = Number(form.tva_deductible)||0;
      const d = await postJSON(`${DCT}/declarations`, { ...form, tva_collectee:collectee, tva_deductible:deductible, tva_a_payer: Math.max(0, collectee-deductible) });
      setDeclarations(prev => [d.declaration, ...prev]);
      toast.success("Déclaration créée");
      setShowModal(false);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const marquerDeclaree = async (decl) => {
    try {
      const r = await fetch(`${DCT}/declarations/${decl.id}`, { method:"PATCH", headers: authHdrs(), body: JSON.stringify({ statut:"declaree", date_declaration:new Date().toISOString().slice(0,10) }) });
      const d = await r.json();
      setDeclarations(prev => prev.map(x=>x.id===decl.id?d.declaration:x));
      toast.success("Déclaration marquée comme déposée");
    } catch { toast.error("Erreur"); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        <StatCard label="TVA collectée (mois)" value={fmt(synthese?.tva_collectee ?? 0)} icon="🧮" color={PRIMARY_COLOR} />
        <StatCard label="TVA déductible (mois)" value={fmt(synthese?.tva_deductible ?? 0)} icon="🧾" color="#16a34a" />
        <StatCard label="TVA à payer" value={fmt(synthese?.tva_a_payer ?? 0)} icon="🏦" color="#dc2626" />
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <button onClick={()=>setShowModal(true)} disabled={!peut("finances","create")} title={permBtnTitle("+ Nouvelle déclaration", peut("finances","create"))} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{peut("finances","create")?"+":"🔒"} Nouvelle déclaration</button>
      </div>
      <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{["Période","Collectée","Déductible","À payer","Statut",""].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {declarations.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucune déclaration</td></tr>
            ) : declarations.map(d => (
              <tr key={d.id}>
                <Td bold>{MOIS_LABELS[d.periode_mois]} {d.periode_annee}</Td>
                <Td>{fmt(d.tva_collectee)}</Td><Td>{fmt(d.tva_deductible)}</Td><Td bold>{fmt(d.tva_a_payer)}</Td>
                <Td><Badge label={d.statut} color={d.statut==="payee"?"#16a34a":d.statut==="declaree"?"#0369a1":"#64748b"} bg={d.statut==="payee"?"#dcfce7":d.statut==="declaree"?"#e0f2fe":"#f1f5f9"} /></Td>
                <Td>{d.statut==="brouillon" && <button onClick={()=>marquerDeclaree(d)} disabled={!peut("finances","update")} title={permBtnTitle("Marquer déposée", peut("finances","update"))} style={permBtnStyle({ padding:"4px 10px", background:"#e0f2fe", border:"1px solid #bae6fd", borderRadius:6, fontSize:11, color:"#0369a1", fontWeight:700, cursor:"pointer" }, peut("finances","update"))}>{peut("finances","update")?"":"🔒 "}Marquer déposée</button>}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="🧮 Nouvelle déclaration TVA" onClose={()=>setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="Mois"><select style={selectSt} value={form.periode_mois} onChange={e=>setForm(f=>({...f,periode_mois:Number(e.target.value)}))}>{MOIS_LABELS.slice(1).map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></Field>
              <Field label="Année"><input type="number" style={inputSt} value={form.periode_annee} onChange={e=>setForm(f=>({...f,periode_annee:Number(e.target.value)}))} /></Field>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="TVA collectée"><input type="number" style={inputSt} value={form.tva_collectee} onChange={e=>setForm(f=>({...f,tva_collectee:e.target.value}))} /></Field>
              <Field label="TVA déductible"><input type="number" style={inputSt} value={form.tva_deductible} onChange={e=>setForm(f=>({...f,tva_deductible:e.target.value}))} /></Field>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowModal(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={soumettre} disabled={saving || !peut("finances","create")} title={permBtnTitle("✓ Créer", peut("finances","create"))} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{saving?"⏳…":(peut("finances","create")?"✓ Créer":"🔒 Créer")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - IMMOBILISATIONS
═══════════════════════════════════════════════════════ */
function OngletImmobilisations({ immobilisations, setImmobilisations, fournisseurs, DCI, peut }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ libelle:"", categorie:"materiel", valeur_acquisition:"", date_acquisition:new Date().toISOString().slice(0,10), duree_amortissement_annees:5 });
  const [saving, setSaving] = useState(false);

  const soumettre = async () => {
    if (!form.libelle.trim() || !form.valeur_acquisition) { toast.error("Libellé et valeur requis"); return; }
    setSaving(true);
    try {
      const d = await postJSON(`${DCI}/`, { ...form, valeur_acquisition: Number(form.valeur_acquisition), duree_amortissement_annees: Number(form.duree_amortissement_annees) });
      setImmobilisations(prev => [d.immobilisation, ...prev]);
      toast.success("Immobilisation ajoutée");
      setShowModal(false); setForm({ libelle:"", categorie:"materiel", valeur_acquisition:"", date_acquisition:new Date().toISOString().slice(0,10), duree_amortissement_annees:5 });
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const amortirTout = async () => {
    try {
      await postJSON(`${DCI}/amortir-tout`, { annee: new Date().getFullYear() });
      toast.success("Amortissements calculés pour l'année en cours");
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <button onClick={amortirTout} disabled={!peut("finances","update")} title={permBtnTitle("Amortir tout (année en cours)", peut("finances","update"))} style={permBtnStyle({ padding:"8px 16px", background:"#f1f5f9", color:"#374151", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","update"))}>{peut("finances","update")?"📉":"🔒"} Amortir tout (année en cours)</button>
        <button onClick={()=>setShowModal(true)} disabled={!peut("finances","create")} title={permBtnTitle("+ Nouvelle immobilisation", peut("finances","create"))} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{peut("finances","create")?"+":"🔒"} Nouvelle immobilisation</button>
      </div>
      <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{["Libellé","Catégorie","Valeur acquisition","Acquisition","Durée","Statut"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {immobilisations.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucune immobilisation</td></tr>
            ) : immobilisations.map(im => (
              <tr key={im.id}><Td bold>{im.libelle}</Td><Td>{im.categorie}</Td><Td bold>{fmt(im.valeur_acquisition)}</Td><Td>{fmtD(im.date_acquisition)}</Td><Td>{im.duree_amortissement_annees} ans</Td><Td><Badge label={im.statut} color="#16a34a" bg="#dcfce7" /></Td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="🏗️ Nouvelle immobilisation" onClose={()=>setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Field label="Libellé *"><input style={inputSt} value={form.libelle} onChange={e=>setForm(f=>({...f,libelle:e.target.value}))} /></Field>
            <Field label="Catégorie">
              <select style={selectSt} value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))}>
                <option value="materiel">Matériel</option><option value="mobilier">Mobilier</option><option value="informatique">Informatique</option><option value="autre">Autre</option>
              </select>
            </Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="Valeur d'acquisition *"><input type="number" style={inputSt} value={form.valeur_acquisition} onChange={e=>setForm(f=>({...f,valeur_acquisition:e.target.value}))} /></Field>
              <Field label="Durée amortissement (ans)"><input type="number" style={inputSt} value={form.duree_amortissement_annees} onChange={e=>setForm(f=>({...f,duree_amortissement_annees:e.target.value}))} /></Field>
            </div>
            <Field label="Date d'acquisition"><input type="date" style={inputSt} value={form.date_acquisition} onChange={e=>setForm(f=>({...f,date_acquisition:e.target.value}))} /></Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowModal(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={soumettre} disabled={saving || !peut("finances","create")} title={permBtnTitle("✓ Créer", peut("finances","create"))} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{saving?"⏳…":(peut("finances","create")?"✓ Créer":"🔒 Créer")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - BUDGETS
═══════════════════════════════════════════════════════ */
function OngletBudgets({ budgets, setBudgets, suivi, anneeCourante, DC, peut }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ annee:anneeCourante, categorie:"", type:"charge", montant_prevu:"" });
  const [saving, setSaving] = useState(false);

  const soumettre = async () => {
    if (!form.categorie.trim() || !form.montant_prevu) { toast.error("Catégorie et montant requis"); return; }
    setSaving(true);
    try {
      const d = await postJSON(`${DC}/budgets`, { ...form, annee:Number(form.annee), montant_prevu:Number(form.montant_prevu) });
      setBudgets(prev => [d.budget, ...prev]);
      toast.success("Budget créé");
      setShowModal(false); setForm({ annee:anneeCourante, categorie:"", type:"charge", montant_prevu:"" });
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontWeight:800, fontSize:14 }}>🎯 Budget vs Réel · {anneeCourante}</div>
        <button onClick={()=>setShowModal(true)} disabled={!peut("finances","create")} title={permBtnTitle("+ Nouveau budget", peut("finances","create"))} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{peut("finances","create")?"+":"🔒"} Nouveau budget</button>
      </div>
      <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9" }}>
        {suivi.length === 0 ? (
          <div style={{ textAlign:"center", padding:24, color:"#94a3b8", fontSize:13 }}>Aucun budget défini pour {anneeCourante}</div>
        ) : suivi.map(r => {
          const pct = r.montant_prevu > 0 ? Math.round((r.montant_reel/r.montant_prevu)*100) : 0;
          const color = pct>=100?"#16a34a":pct>=80?PRIMARY_COLOR:"#dc2626";
          return (
            <div key={r.categorie+r.type} style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
                <span style={{ fontWeight:600 }}>{r.categorie} ({r.type})</span>
                <span style={{ fontWeight:700, color }}>{pct}% <span style={{ fontWeight:400, color:"#9ca3af" }}>({fmt(r.montant_reel)} / {fmt(r.montant_prevu)})</span></span>
              </div>
              <ProgressBar value={pct} color={color} />
            </div>
          );
        })}
      </div>
      <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{["Année","Catégorie","Type","Montant prévu"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>{budgets.map(b => <tr key={b.id}><Td>{b.annee}</Td><Td bold>{b.categorie}</Td><Td>{b.type}</Td><Td bold>{fmt(b.montant_prevu)}</Td></tr>)}</tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="🎯 Nouveau budget" onClose={()=>setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Field label="Année"><input type="number" style={inputSt} value={form.annee} onChange={e=>setForm(f=>({...f,annee:e.target.value}))} /></Field>
              <Field label="Type"><select style={selectSt} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="charge">Charge</option><option value="produit">Produit</option></select></Field>
            </div>
            <Field label="Catégorie *"><input style={inputSt} value={form.categorie} onChange={e=>setForm(f=>({...f,categorie:e.target.value}))} /></Field>
            <Field label="Montant prévu *"><input type="number" style={inputSt} value={form.montant_prevu} onChange={e=>setForm(f=>({...f,montant_prevu:e.target.value}))} /></Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowModal(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={soumettre} disabled={saving || !peut("finances","create")} title={permBtnTitle("✓ Créer", peut("finances","create"))} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("finances","create"))}>{saving?"⏳…":(peut("finances","create")?"✓ Créer":"🔒 Créer")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - ANALYTIQUE
═══════════════════════════════════════════════════════ */
function OngletAnalytique({ axes, repartition, DC }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontWeight:800, fontSize:14 }}>📐 Répartition analytique des charges</div>
      <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9" }}>
        {repartition.length === 0 ? (
          <div style={{ textAlign:"center", padding:24, color:"#94a3b8", fontSize:13 }}>Aucune charge ventilée par axe pour l'instant</div>
        ) : repartition.map(r => {
          const total = repartition.reduce((s,x)=>s+Number(x.montant||0),0) || 1;
          const pct = Math.round((r.montant/total)*100);
          return (
            <div key={r.axe} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
                <span style={{ fontWeight:600 }}>{r.axe}</span>
                <span style={{ fontWeight:700, color:PRIMARY_COLOR }}>{fmt(r.montant)} ({pct}%)</span>
              </div>
              <ProgressBar value={pct} />
            </div>
          );
        })}
      </div>
      <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{["Code","Libellé","Statut"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>{axes.map(a => <tr key={a.id}><Td bold>{a.code}</Td><Td>{a.libelle}</Td><Td><Badge label={a.actif?"Actif":"Inactif"} color={a.actif?"#16a34a":"#94a3b8"} bg={a.actif?"#dcfce7":"#f1f5f9"} /></Td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - HONORAIRES COACHES (système déjà existant : /api/seances/honoraires-mois)
═══════════════════════════════════════════════════════ */
function OngletHonoraires({ honoraires, recharger, exportCSV, peut }) {
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ mode_paiement:"virement", reference_paiement:"" });
  const [saving, setSaving] = useState(false);

  const enregistrerVirement = async () => {
    if (!form.reference_paiement.trim()) { toast.error("Référence requise"); return; }
    setSaving(true);
    try {
      await postJSON(`${API_URL}/api/seances/honoraires-mois/${selected.id}/statut`, { statut:"paye", ...form }, "PATCH");
      toast.success("Virement enregistré");
      setShowModal(false); setSelected(null); setForm({ mode_paiement:"virement", reference_paiement:"" });
      recharger();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const enAttente = honoraires.filter(h => h.statut === "transmis");
  const total = honoraires.reduce((s,h)=>s+Number(h.montant_net ?? h.montant_total ?? 0),0);
  const paye  = honoraires.filter(h=>h.statut==="paye").reduce((s,h)=>s+Number(h.montant_net ?? h.montant_total ?? 0),0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:11, color:"#9ca3af" }}>{honoraires.length} fiche{honoraires.length>1?"s":""}</span>
        <button onClick={()=>exportCSV(honoraires,"honoraires_coaches")} style={{ padding:"7px 14px", background:"#f1f5f9", color:"#374151", border:"1px solid #e5e7eb", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer" }}>📤 Export CSV</button>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <div style={{ flex:1, background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}><div style={{ fontSize:11, color:"#9ca3af" }}>Total</div><div style={{ fontSize:15, fontWeight:800, color:PRIMARY_COLOR }}>{fmt(total)}</div></div>
        <div style={{ flex:1, background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}><div style={{ fontSize:11, color:"#9ca3af" }}>Déjà payé</div><div style={{ fontSize:15, fontWeight:800, color:"#16a34a" }}>{fmt(paye)}</div></div>
        <div style={{ flex:1, background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}><div style={{ fontSize:11, color:"#9ca3af" }}>En attente de virement</div><div style={{ fontSize:15, fontWeight:800, color:"#dc2626" }}>{enAttente.length}</div></div>
      </div>

      <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{["Coach","Période","Montant net","Statut","Réf. paiement",""].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
          <tbody>
            {honoraires.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign:"center", padding:32, color:"#94a3b8", fontSize:13 }}>Aucune fiche d'honoraires</td></tr>
            ) : honoraires.map(h => (
              <tr key={h.id}>
                <Td bold>{h.coach ? `${h.coach.prenom||""} ${h.coach.nom||""}`.trim() : "-"}</Td>
                <Td>{MOIS_LABELS[h.mois]} {h.annee}</Td>
                <Td bold>{fmt(h.montant_net ?? h.montant_total)}</Td>
                <Td><Badge label={h.statut} color={h.statut==="paye"?"#16a34a":h.statut==="transmis"?"#d97706":"#64748b"} bg={h.statut==="paye"?"#dcfce7":h.statut==="transmis"?"#fef3c7":"#f1f5f9"} /></Td>
                <Td>{h.reference_paiement || "-"}</Td>
                <Td>{h.statut==="transmis" && <button onClick={()=>{ setSelected(h); setShowModal(true); }} disabled={!peut("honoraires","manage")} title={permBtnTitle("+ Virement", peut("honoraires","manage"))} style={permBtnStyle({ padding:"4px 10px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer" }, peut("honoraires","manage"))}>{peut("honoraires","manage")?"+":"🔒"} Virement</button>}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && selected && (
        <Modal title={`💰 Enregistrer un virement - ${selected.coach?.prenom||""} ${selected.coach?.nom||""}`} onClose={()=>setShowModal(false)}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <Field label="Mode de paiement">
              <select style={selectSt} value={form.mode_paiement} onChange={e=>setForm(f=>({...f,mode_paiement:e.target.value}))}>
                <option value="virement">Virement</option><option value="mobile_money">Mobile Money</option><option value="especes">Espèces</option>
              </select>
            </Field>
            <Field label="Référence de paiement *"><input style={inputSt} value={form.reference_paiement} onChange={e=>setForm(f=>({...f,reference_paiement:e.target.value}))} /></Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:8 }}>
              <button onClick={()=>setShowModal(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Annuler</button>
              <button onClick={enregistrerVirement} disabled={saving || !peut("honoraires","manage")} title={permBtnTitle("✓ Enregistrer", peut("honoraires","manage"))} style={permBtnStyle({ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("honoraires","manage"))}>{saving?"⏳…":(peut("honoraires","manage")?"✓ Enregistrer":"🔒 Enregistrer")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ONGLET - EXPORTS
═══════════════════════════════════════════════════════ */
function OngletExports({ factures, paiements, honoraires, fournisseurs, exportCSV, peut }) {
  const exportsList = [
    { title:"Toutes les factures",  desc:"Journal de facturation complet",           data:factures,     file:"factures" },
    { title:"Tous les paiements",   desc:"Journal des encaissements",                 data:paiements,    file:"paiements" },
    { title:"Honoraires coaches",   desc:"Récapitulatif des décaissements coaches",   data:honoraires,   file:"honoraires_coaches" },
    { title:"Fournisseurs",         desc:"Répertoire fournisseurs",                   data:fournisseurs, file:"fournisseurs" },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:14, color:"#374151", fontWeight:600 }}>📤 Exports comptables</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        {exportsList.map(ex => (
          <div key={ex.file} style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{ex.title}</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>{ex.desc}</div>
            </div>
            <button onClick={()=>exportCSV(ex.data, ex.file)} disabled={!peut("finances","update")} title={permBtnTitle("Export CSV", peut("finances","update"))} style={permBtnStyle({ padding:"8px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }, peut("finances","update"))}>{peut("finances","update")?"📤":"🔒"} CSV</button>
          </div>
        ))}
      </div>
    </div>
  );
}
