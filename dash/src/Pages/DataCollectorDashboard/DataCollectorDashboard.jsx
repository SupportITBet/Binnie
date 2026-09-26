// src/Pages/DataCollector/DataCollectorDashboard.jsx
import React, { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RangeePastilles } from "../../Components/BarreFiltres";
import NotificationsTab from "../../Components/NotificationsTab";
import NotificationBell from "../../Components/NotificationBell";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import { useLanguage } from "../../contexts/LanguageContext";
import { clearAllSessionStorage } from "../../utils/session";
import { exporterExcelStyle } from "../../utils/exporterExcel";
import { openElearningSSO } from "../../utils/ssoElearning";
import { useConfirm } from "../../contexts/ConfirmContext";
import FooterSaaS from "../../Components/FooterSaaS";
import { assombrirCouleur } from "../../utils/couleurs";
import { useTabState } from "../../hooks/useTabState";
import { useNotifications } from "../../hooks/useNotifications";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";

import { uploadFichier } from "../../utils/uploadFichier";
import VisionneuseImage from "../../Components/VisionneuseImage";
/* ═══════════════════════════════════════════════════════
   CHARTE BET
═══════════════════════════════════════════════════════ */
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const ELEARNING_URL = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";
const _DC = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur||"#0891b2"; } catch { return "#0891b2"; } })();
const C = {
  primary:   _DC,
  dark:      "#0e7490",
  light:     "#e0f2fe",
  gradient:  `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(_DC)} 100%)`,
  green:     "#22c55e",
  amber:     "#f59e0b",
  red:       "#ef4444",
  slate:     "#64748b",
};

/* ═══════════════════════════════════════════════════════
   CONSTANTES RÉELLES
═══════════════════════════════════════════════════════ */
const NIVEAUX = ["A1","A2","B1","B2","C1","C2"];
const authHdrs = () => ({ "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("admin_token")}` });

/* ═══════════════════════════════════════════════════════
   COMPOSANTS UI
═══════════════════════════════════════════════════════ */
const Badge = ({ label, color, bg }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:99, fontSize:10, fontWeight:700, color, background:bg, whiteSpace:"nowrap" }}>{label}</span>
);

const StatCard = ({ label, value, sub, icon, color, onClick }) => (
  <div onClick={onClick} style={{ background:"#fff", padding:"14px 16px", borderRadius:12, border:`1px solid ${color}22`, boxShadow:"0 1px 4px rgba(0,0,0,0.05)", display:"flex", alignItems:"center", gap:12, cursor:onClick?"pointer":"default" }}>
    <div style={{ width:44, height:44, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{icon}</div>
    <div>
      <div style={{ fontSize:10, color:"#9ca3af", fontWeight:600, textTransform:"uppercase", letterSpacing:".04em" }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"#9ca3af" }}>{sub}</div>}
    </div>
  </div>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000, padding:16 }}>
    <div style={{ background:"#fff", borderRadius:14, padding:24, width: wide ? 720 : 540, maxWidth:"96vw", maxHeight:"92vh", overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h3 style={{ margin:0, fontSize:16, fontWeight:800, color:"#111827" }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#9ca3af", lineHeight:1 }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const QualityBar = ({ taux }) => {
  const color = taux === 100 ? C.green : taux >= 80 ? C.amber : C.red;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ flex:1, height:7, background:"#e5e7eb", borderRadius:7, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${taux}%`, background:color, borderRadius:7, transition:"width .4s" }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, minWidth:32, textAlign:"right" }}>{taux}%</span>
    </div>
  );
};

const statutProspectColors = {
  nouveau:     { label:"Nouveau",     color:C.primary, bg:C.light },
  contacté:    { label:"Contacté",    color:"#92400e",  bg:"#fef3c7" },
  relancé:     { label:"Relancé",     color:"#1d4ed8",  bg:"#dbeafe" },
  à_relancer:  { label:"À relancer",  color:C.red,      bg:"#fee2e2" },
  converti:    { label:"Converti",    color:"#15803d",  bg:"#dcfce7" },
};
const actionColors = {
  LEADS_CREATED: { label:"Création",    color:"#15803d", bg:"#dcfce7" },
  LEADS_UPDATED: { label:"Modification",color:"#92400e", bg:"#fef3c7" },
  LEADS_DELETED: { label:"Suppression", color:C.red,      bg:"#fee2e2" },
};

/* ═══════════════════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════════════════ */
export default function DataCollectorDashboard() {
  const navigate = useNavigate();
  const profil = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const prenom = profil?.prenom || profil?.first_name || "";
  const nom    = profil?.nom    || profil?.last_name  || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || profil?.email || "Data Collector";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "DC";
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
        if (data.profil.acces_elearning !== undefined) setAccesElearning(data.profil.acces_elearning === true);
        if (sessionStorage.getItem("_bet_color_guard")) { sessionStorage.removeItem("_bet_color_guard"); return; }
        const freshColor = data.profil.couleur || null;
        const stored = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}"); } catch { return {}; } })();
        const _mp = { ...stored, ...data.profil }; if (!data.profil.couleur && stored.couleur) _mp.couleur = stored.couleur; localStorage.setItem("admin_profil", JSON.stringify(_mp));
        if (freshColor && freshColor !== _DC) window.location.reload();
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  const [activeTab, setActiveTab]         = useTabState("dashboard");
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
  // null = pas encore chargé
  const [leads, setLeads]                 = useState(null);
  const [centres, setCentres]             = useState([]);
  const [auditLogs, setAuditLogs]         = useState(null);

  // Filtres
  const [prospectSearch, setProspectSearch]= useState("");
  const [prospectStatut, setProspectStatut]= useState("Tous");
  const [histSearch, setHistSearch]       = useState("");

  // Modale
  const [showProspectModal, setShowProspectModal] = useState(false);

  // Import
  const [importStep, setImportStep]   = useState(0); // 0=idle, 1=preview, 3=done
  const [importFile, setImportFile]   = useState(null);
  const [importData, setImportData]   = useState([]);
  const [importErrors, setImportErrors]= useState([]);
  const [importSaving, setImportSaving] = useState(false);
  const [importResult, setImportResult] = useState(null); // { ok, fail }
  const [dragOver, setDragOver]       = useState(false);
  const fileRef                       = useRef();

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}) : "–";

  /* ── Chargement des données réelles ── */
  const fetchLeads = () => {
    fetch(`${API_URL}/api/leads/all`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { leads: [] })
      .then(d => setLeads(d.leads || []))
      .catch(() => setLeads([]));
  };
  useEffect(() => {
    fetchLeads();
    fetch(`${API_URL}/api/centres/admin/all`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { centres: [] })
      .then(d => setCentres(d.centres || []))
      .catch(() => setCentres([]));
    fetch(`${API_URL}/api/audit/logs?module=leads&plateforme=dash&limit=50`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(d => setAuditLogs(d.logs || []))
      .catch(() => setAuditLogs([]));
  }, []);

  const centreNom = (id) => centres.find(c => c.id === id)?.nom || "-";

  /* ── Filtres prospects (leads réels) ── */
  const filteredProspects = useMemo(() => (leads||[]).filter(p => {
    const q = prospectSearch.toLowerCase();
    const matchQ = !q || (p.nom||"").toLowerCase().includes(q) || (p.email||"").toLowerCase().includes(q);
    const matchS = prospectStatut === "Tous" || p.statut === prospectStatut;
    return matchQ && matchS;
  }), [leads, prospectSearch, prospectStatut]);

  /* ── Filtre historique (audit_logs réels) ── */
  const filteredHisto = useMemo(() => (auditLogs||[]).filter(h => {
    const q = histSearch.toLowerCase();
    return !q || (h.acteur_nom||"").toLowerCase().includes(q) || (h.detail||"").toLowerCase().includes(q);
  }), [auditLogs, histSearch]);

  /* ── Stats dashboard (réelles) ── */
  const stats = useMemo(() => {
    const list = leads || [];
    const now = new Date();
    const moisPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const complets = list.filter(l => l.niveau && l.objectif && l.centre_id).length;
    // Doublons réels : même email ou même téléphone utilisé sur plusieurs fiches
    const parEmail = {}; const parTel = {};
    list.forEach(l => { if (l.email) parEmail[l.email] = (parEmail[l.email]||0)+1; if (l.telephone) parTel[l.telephone] = (parTel[l.telephone]||0)+1; });
    const doublons = new Set([
      ...Object.entries(parEmail).filter(([,n])=>n>1).map(([k])=>k),
      ...Object.entries(parTel).filter(([,n])=>n>1).map(([k])=>k),
    ]).size;
    return {
      total: list.length,
      nouveauxMois: list.filter(l => (l.created_at||"").startsWith(moisPrefix)).length,
      completude: Math.round((complets / (list.length||1)) * 100),
      doublons,
    };
  }, [leads]);

  /* ── Création réelle d'un prospect (POST /api/leads/submit) ── */
  const handleSaveProspect = async (p) => {
    try {
      const r = await fetch(`${API_URL}/api/leads/submit`, {
        method: "POST", headers: authHdrs(),
        body: JSON.stringify({ nom: p.nom, email: p.email, telephone: p.telephone, niveau: p.niveau || null, objectif: p.objectif || null, centre_id: p.centre_id || null }),
      });
      if (!r.ok) { const d = await r.json().catch(()=>({})); throw new Error(d.error || "Erreur"); }
      toast.success("Prospect créé");
      setShowProspectModal(false);
      fetchLeads();
    } catch (err) {
      toast.error(err.message || "Erreur lors de la création");
    }
  };

  /* ── Import fichier (CSV réel → POST /api/leads/submit pour chaque ligne) ── */
  const parseCSV = (text) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(/[,;]/).map(h=>h.trim().replace(/"/g,""));
    return lines.slice(1).map((line,i) => {
      const vals = line.split(/[,;]/).map(v=>v.trim().replace(/"/g,""));
      const obj = { _row: i+2 };
      headers.forEach((h,j) => { obj[h] = vals[j] || ""; });
      return obj;
    }).filter(r => Object.values(r).some(v=>v&&v!==String(r._row)));
  };

  const handleFileDrop = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "csv" && ext !== "txt") { toast.error("Seul le format CSV est pris en charge pour l'import."); return; }
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      const errs = [];
      if (parsed.length === 0) errs.push("Fichier vide ou illisible - vérifiez le format (en-têtes : nom, email, telephone, niveau, objectif).");
      if (parsed.length > 40) errs.push("Plus de 40 lignes détectées, vérifiez le fichier.");
      const sansContact = parsed.filter(r => !(r.email||r.Email) && !(r.telephone||r.tel||r.Telephone)).length;
      if (sansContact > 0) errs.push(`${sansContact} ligne(s) sans email ni téléphone - requis par le formulaire (elles seront rejetées).`);
      setImportData(parsed.slice(0,50));
      setImportErrors(errs);
      setImportStep(1);
    };
    reader.readAsText(file, "utf-8");
  };

  const handleFileChange = (e) => { if(e.target.files[0]) handleFileDrop(e.target.files[0]); };

  const handleConfirmImport = async () => {
    setImportSaving(true);
    let ok = 0, fail = 0;
    for (const row of importData) {
      const nom = row.nom || row.Nom || row.NAME;
      const email = row.email || row.Email;
      const telephone = row.telephone || row.tel || row.Telephone;
      if (!nom || (!email && !telephone)) { fail++; continue; }
      try {
        const r = await fetch(`${API_URL}/api/leads/submit`, {
          method: "POST", headers: authHdrs(),
          body: JSON.stringify({ nom, email: email||"", telephone: telephone||"", niveau: row.niveau||row.Niveau||null, objectif: row.objectif||row.Objectif||null }),
        });
        if (r.ok) ok++; else fail++;
      } catch { fail++; }
    }
    setImportSaving(false);
    setImportResult({ ok, fail });
    setImportStep(3);
    fetchLeads();
    if (ok > 0) toast.success(`${ok} prospect(s) importé(s) avec succès`);
    if (fail > 0) toast.error(`${fail} ligne(s) rejetée(s)`);
  };

  const resetImport = () => { setImportStep(0); setImportFile(null); setImportData([]); setImportErrors([]); setImportResult(null); };

  /* ── Export Excel ── */
  const exportCSV = (data, name) => {
    if (!data.length) return toast.error("Aucune donnée");
    const h = Object.keys(data[0]).filter(k => k !== "id");
    exporterExcelStyle({
      nomFichier: name,
      titre: `📊 Export - ${name}`,
      sousTitre: `${data.length} ligne${data.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      couleurEntete: '6366F1',
      colonnes: h.map(k => ({ label: k, width: 20 })),
      lignes: data.map(r => h.map(k => r[k] ?? "")),
    });
    toast.success(`Export ${name}.xlsx effectué`);
  };

  /* ── TABS ── */
  const { notifications: toutesNotifsDC, nbNonLues: notifNonLuesDC, marquerLue: marquerNotifLueDC } = useNotifications(profil?.id);
  const [banderoleFermeeDC, setBanderoleFermeeDC] = useState(false);
  const notifsBanderoleDC = toutesNotifsDC.filter(n => !n.lu).slice(0, 3);

  // ── "Mes tâches" - agrège les compteurs "à traiter" déjà calculés
  const tachesProspectsARelancer = (leads||[]).filter(p=>p.statut==="à_relancer").length;
  const tachesTotal = tachesProspectsARelancer;

  const TABS = [
    { key:"taches",     label:"Mes tâches",          icon:"✅", badge: tachesTotal || null },
    { key:"dashboard",  label:"Tableau de bord",    icon:"📊" },
    { key:"clients",    label:"Clients",             icon:"🏢" },
    { key:"prospects",  label:"Prospects",           icon:"🎯", badge: (leads||[]).filter(p=>p.statut==="à_relancer").length },
    { key:"import",     label:"Import fichiers",     icon:"📥" },
    { key:"qualite",    label:"Qualité des données", icon:"✅" },
    { key:"historique",    label:"Historique",     icon:"🕐" },
    { key:"notifications", label:"Notifications",  icon:"🔔", badge: notifNonLuesDC || null },
  ];

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#f0f9ff", fontFamily:"system-ui, sans-serif" }}>

      {/* ── HERO ── */}
      <div style={{ flexShrink:0, background:C.gradient, padding:"28px 32px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-30, right:-30, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,0.04)", zIndex:0 }} />
        <div style={{ position:"absolute", bottom:-50, right:100, width:100, height:100, borderRadius:"50%", background:"rgba(255,255,255,0.03)", zIndex:0 }} />
        <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:18 }}>
            <div style={{ position:"relative", flexShrink:0 }} onClick={()=>{ if (avatarUrl) setPhotoProfilOuverte(true); }}>
              <div style={{ width:60, height:60, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:20, border:"3px solid rgba(255,255,255,0.3)", overflow:"hidden" , cursor: avatarUrl ? "zoom-in" : "default"}}>
                {avatarUrl ? <img src={avatarUrl} alt={initiales} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}
              </div>
              {photoProfilOuverte && <VisionneuseImage url={avatarUrl} onClose={()=>setPhotoProfilOuverte(false)} />}
              <label title="Changer la photo" onClick={e=>e.stopPropagation()} style={{ position:"absolute",bottom:0,right:0,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11,border:"2px solid #fff" }}>
                📷<input type="file" accept="image/*" style={{ display:"none" }} onChange={(e)=>{ const f=e.target.files?.[0]; if(f){ uploadFichier(f, "avatar").then(handleAvatarSuccess).catch(e=>{}); } e.target.value=""; }} />
              </label>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#7dd3fc", fontWeight:700, letterSpacing:".1em", textTransform:"uppercase" }}>Espace saisie</div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff" }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} /></h1>
              {surnomPerso.trim() && nomComplet !== nomAffiche && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:1 }}>{nomComplet}</div>
              )}
              <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                onEnregistre={(v) => setSurnomPerso(v || "")} />
              <div style={{ fontSize:12, color:"#bae6fd", marginTop:3, fontWeight:600 }}>Data Collector - Saisie &amp; qualité des données</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginTop:1 }}>{profil?.email || ""}</div>
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
            <button type="button" onClick={() => openElearningSSO(ELEARNING_URL)}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 16px", background:"rgba(8,145,178,0.25)", border:"1.5px solid rgba(8,145,178,0.5)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", transition:"background .2s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(8,145,178,0.45)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(8,145,178,0.25)"}
              title="Accéder à la plateforme E-Learning BET">
              <span style={{ fontSize:15 }}>🎓</span> E-Learning
            </button>
          )}
          <button onClick={handleLogout} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", transition:"background .2s" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
            <span>🚪</span> Déconnexion
          </button>
          </div>
        </div>
        {/* Mini-stats hero */}
        <div style={{ display:"flex", background:"rgba(0,0,0,0.15)", borderRadius:"12px 12px 0 0", overflow:"hidden" }}>
          {[
            { l:"Prospects enregistrés", v: leads===null ? "…" : stats.total,    c:"#38bdf8" },
            { l:"Nouveaux ce mois",      v: leads===null ? "…" : stats.nouveauxMois,  c:"#818cf8" },
            { l:"Complétude fiches",     v: leads===null ? "…" : `${stats.completude}%`, c:"#34d399" },
            { l:"Doublons potentiels",   v: leads===null ? "…" : stats.doublons, c:"#fbbf24" },
          ].map((s,i,arr)=>(
            <div key={s.l} style={{ flex:1, textAlign:"center", padding:"13px 8px", borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.08)":"none" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", marginBottom:2 }}>{s.l}</div>
              <div style={{ fontSize:19, fontWeight:800, color:s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CONTENU ── */}
      <div style={{ flex:"1 1 auto", padding:"0 24px 40px" }}>
        <div style={{ background:"#fff", borderRadius:"0 0 12px 12px", boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>

          {/* TABS */}
          <div style={{ display:"flex", borderBottom:"2px solid #e5e7eb", flexWrap:"wrap", background:"#fafafa" }}>
            {TABS.map(tab=>(
              <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{
                padding:"13px 18px", border:"none", borderBottom:activeTab===tab.key?`3px solid ${C.primary}`:"3px solid transparent",
                background:"transparent", cursor:"pointer", fontWeight:700, fontSize:12,
                color:activeTab===tab.key?C.primary:"#6b7280", whiteSpace:"nowrap",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"color .15s",
                flex:"1 1 130px",
              }}>
                <span style={{ fontSize:14 }}>{tab.icon}</span>{tab.label}
                {tab.badge > 0 && <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px", minWidth:18, textAlign:"center", lineHeight:"16px" }}>{tab.badge}</span>}
              </button>
            ))}
          </div>

          {!banderoleFermeeDC && notifsBanderoleDC.length > 0 && (
            <div style={{ padding:"10px 24px", background:"#fff7ed", borderBottom:"1px solid #fed7aa", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                {notifsBanderoleDC.map(n => (
                  <div key={n.id} onClick={() => { marquerNotifLueDC(n.id); setActiveTab("notifications"); }}
                    style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                    <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                    <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                  </div>
                ))}
                {notifNonLuesDC > notifsBanderoleDC.length && (
                  <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                    +{notifNonLuesDC - notifsBanderoleDC.length} autre{notifNonLuesDC - notifsBanderoleDC.length > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
              <button onClick={()=>setBanderoleFermeeDC(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
            </div>
          )}

          <div style={{ padding:24 }}>

            {/* ══ MES TÂCHES ══ */}
            {activeTab==="taches" && (() => {
              const taches = [
                { icon:"🎯", label:"Prospects à relancer", n:tachesProspectsARelancer, tab:"prospects" },
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
                          onMouseEnter={e=>e.currentTarget.style.borderColor=C.primary}
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

            {/* ══════════════════════════════════════
                TAB : DASHBOARD
            ══════════════════════════════════════ */}
            {activeTab==="dashboard" && (
              <div>
                {leads === null ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:C.slate }}>Chargement…</div>
                ) : (
                <>
                {/* Alertes */}
                {(leads||[]).filter(p=>p.statut==="à_relancer").length > 0 && (
                  <div onClick={()=>setActiveTab("prospects")} style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:12, fontWeight:600, color:"#991b1b", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span>🔴 {(leads||[]).filter(p=>p.statut==="à_relancer").length} prospect(s) à relancer - informations à mettre à jour</span>
                    <span style={{ fontSize:11, opacity:.7 }}>Voir →</span>
                  </div>
                )}
                {stats.doublons > 0 && (
                  <div onClick={()=>setActiveTab("qualite")} style={{ background:"#fff7ed", border:"1px solid #fcd34d", borderRadius:10, padding:"10px 16px", marginBottom:20, fontSize:12, fontWeight:600, color:"#92400e", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span>⚠️ {stats.doublons} doublon(s) potentiel(s) détecté(s) (email/téléphone en double)</span>
                    <span style={{ fontSize:11, opacity:.7 }}>Voir →</span>
                  </div>
                )}

                {/* Stat cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
                  <StatCard label="Prospects" value={stats.total} sub={`${(leads||[]).filter(p=>p.statut==="nouveau").length} nouveaux`} icon="🎯" color="#6366f1" onClick={()=>setActiveTab("prospects")} />
                  <StatCard label="Nouveaux ce mois" value={stats.nouveauxMois} icon="🆕" color={C.primary} />
                  <StatCard label="Fiches complètes" value={`${stats.completude}%`} sub="niveau + objectif + centre" icon="✅" color={stats.completude>=90?C.green:C.amber} onClick={()=>setActiveTab("qualite")} />
                  <StatCard label="Doublons potentiels" value={stats.doublons} icon="🔴" color={stats.doublons>0?C.red:C.green} onClick={()=>setActiveTab("qualite")} />
                </div>

                {/* Activité récente + Répartition */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
                  {/* Activité */}
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>🕐 Activité récente</div>
                    {auditLogs === null ? (
                      <div style={{ fontSize:12, color:C.slate, textAlign:"center", padding:16 }}>Chargement…</div>
                    ) : auditLogs.length === 0 ? (
                      <div style={{ fontSize:12, color:C.slate, textAlign:"center", padding:16 }}>Aucune activité enregistrée</div>
                    ) : auditLogs.slice(0,6).map(h=>{
                      const ac = actionColors[h.action_type]||{label:h.action_type, color:C.slate,bg:"#f1f5f9"};
                      return (
                        <div key={h.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid #e5e7eb" }}>
                          <Badge label={ac.label||h.action_type} color={ac.color} bg={ac.bg} />
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{h.detail}</div>
                            <div style={{ fontSize:10, color:"#9ca3af" }}>{h.acteur_nom||"Visiteur"} · {formatDate(h.created_at)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Répartition par niveau CECR */}
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>📊 Répartition par niveau déclaré</div>
                    {(() => {
                      const list = leads||[];
                      const parNiveau = {}; list.forEach(l => { const k = l.niveau || "Non renseigné"; parNiveau[k]=(parNiveau[k]||0)+1; });
                      const total = list.length || 1;
                      const rows = Object.entries(parNiveau).sort((a,b)=>b[1]-a[1]);
                      if (rows.length === 0) return <div style={{ fontSize:12, color:C.slate, fontStyle:"italic" }}>Aucun prospect enregistré.</div>;
                      return rows.map(([label,count])=>(
                        <div key={label} style={{ marginBottom:12 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                            <span style={{ fontWeight:600 }}>{label}</span>
                            <span style={{ fontWeight:800, color:C.primary }}>{count}</span>
                          </div>
                          <div style={{ height:7, background:"#e5e7eb", borderRadius:7, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${(count/total)*100}%`, background:C.primary, borderRadius:7 }} />
                          </div>
                        </div>
                      ));
                    })()}
                    <div style={{ marginTop:20, fontSize:13, fontWeight:700, marginBottom:14 }}>🎯 Statuts prospects</div>
                    {Object.entries(statutProspectColors).map(([k,v])=>{
                      const count = (leads||[]).filter(p=>p.statut===k).length;
                      if (!count) return null;
                      return (
                        <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0", fontSize:12 }}>
                          <Badge label={v.label} color={v.color} bg={v.bg} />
                          <span style={{ fontWeight:700 }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Raccourcis rapides */}
                <div style={{ background:"#f0f9ff", borderRadius:12, padding:18, border:`1px dashed ${C.primary}40` }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>⚡ Actions rapides</div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    <button onClick={()=>setShowProspectModal(true)} style={btnPrimary}>+ Nouveau prospect</button>
                    <button onClick={()=>setActiveTab("import")} style={btnSecondary}>📥 Importer un fichier</button>
                    <button onClick={()=>setActiveTab("qualite")} style={btnSecondary}>✅ Vérifier la qualité</button>
                  </div>
                </div>
                </>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════
                TAB : CLIENTS
            ══════════════════════════════════════ */}
            {activeTab==="clients" && (
              <div style={{ background:"#f8fafc", border:"1.5px dashed #cbd5e1", borderRadius:12, padding:"24px 20px", textAlign:"center", color:"#64748b", fontSize:13 }}>
                ℹ️ Il n'existe pas encore de système de CRM "Clients" distinct des prospects dans la base - les prospects saisis ou importés ici (onglet <strong>Prospects</strong>) sont la seule vraie source de données du Data Collector. Cet onglet n'a donc pas de donnée réelle à afficher pour l'instant.
              </div>
            )}

            {/* ══════════════════════════════════════
                TAB : PROSPECTS
            ══════════════════════════════════════ */}
            {activeTab==="prospects" && (
              <div>
                <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap", alignItems:"center" }}>
                  <input value={prospectSearch} onChange={e=>setProspectSearch(e.target.value)} placeholder="🔍 Nom, email..."
                    style={{ ...inputSt, width:230 }} />
                  <RangeePastilles valeur={prospectStatut} style={{ marginBottom:0 }}
                    onChange={(v)=>setProspectStatut(v)}
                    options={[{ v:"Tous", l:"Tous" }, ...Object.entries(statutProspectColors).map(([k,v])=>({ v:k, l:v.label }))]}
                    compte={(v)=> v==="Tous" ? (leads||[]).length : (leads||[]).filter(x=>x.statut===v).length} />
                  <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                    <button onClick={()=>exportCSV(filteredProspects,"prospects")} style={btnSecondary}>⬇ Exporter CSV</button>
                    <button onClick={()=>setShowProspectModal(true)} style={btnPrimary}>+ Nouveau prospect</button>
                  </div>
                </div>
                {leads === null ? (
                  <div style={{ textAlign:"center", padding:32, color:C.slate, fontSize:13 }}>Chargement…</div>
                ) : (
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead><tr style={{ background:"#f9fafb" }}>
                      <th style={th}>Nom</th><th style={th}>Email</th><th style={th}>Téléphone</th>
                      <th style={th}>Centre</th><th style={th}>Niveau</th><th style={th}>Objectif</th>
                      <th style={th}>Statut</th><th style={th}>Saisi le</th>
                    </tr></thead>
                    <tbody>
                      {filteredProspects.map(p=>{
                        const st = statutProspectColors[p.statut]||{};
                        return (
                          <tr key={p.id} style={{ borderTop:"1px solid #e5e7eb", background:p.statut==="à_relancer"?"#fff9f0":"#fff" }}>
                            <td style={td}><div style={{ fontWeight:700 }}>{p.nom}</div></td>
                            <td style={td}>{p.email||"–"}</td>
                            <td style={td}>{p.telephone||"–"}</td>
                            <td style={td}>{centreNom(p.centre_id)}</td>
                            <td style={td}>{p.niveau||"–"}</td>
                            <td style={td}><span style={{ fontSize:11 }}>{p.objectif||"–"}</span></td>
                            <td style={td}><Badge label={st.label||p.statut} color={st.color||C.slate} bg={st.bg||"#f1f5f9"} /></td>
                            <td style={td}>{formatDate(p.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredProspects.length===0 && <div style={{ textAlign:"center", padding:32, color:C.slate, fontSize:13 }}>Aucun prospect trouvé</div>}
                </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════
                TAB : IMPORT FICHIERS
            ══════════════════════════════════════ */}
            {activeTab==="import" && (
              <div>
                {importStep===0 && (
                  <div>
                    <div style={{ background:"#f0f9ff", border:`1px solid ${C.primary}30`, borderRadius:10, padding:"10px 14px", marginBottom:20, fontSize:12, color:C.dark }}>
                      ℹ️ Chaque ligne du fichier est enregistrée en base en tant que prospect réel (table <code>leads_particuliers</code>), via le même point d'entrée que le formulaire du site - une ligne sans nom ni email/téléphone sera rejetée.
                    </div>

                    {/* Zone de dépôt */}
                    <div
                      onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                      onDragLeave={()=>setDragOver(false)}
                      onDrop={e=>{e.preventDefault();setDragOver(false);handleFileDrop(e.dataTransfer.files[0]);}}
                      onClick={()=>fileRef.current?.click()}
                      style={{
                        border:`2px dashed ${dragOver?C.primary:"#c7d2fe"}`,
                        borderRadius:16, padding:"50px 24px", textAlign:"center",
                        background:dragOver?"#e0f2fe":"#f8faff", cursor:"pointer",
                        transition:"all .2s", marginBottom:24,
                      }}>
                      <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={handleFileChange} />
                      <div style={{ fontSize:40, marginBottom:12 }}>📂</div>
                      <div style={{ fontSize:16, fontWeight:800, color:"#1e40af", marginBottom:6 }}>Glissez-déposez votre fichier ici</div>
                      <div style={{ fontSize:13, color:C.slate }}>ou cliquez pour sélectionner</div>
                      <div style={{ fontSize:11, color:"#9ca3af", marginTop:8 }}>Format accepté : CSV / TXT · Max 5 MB</div>
                    </div>

                    {/* Modèle téléchargeable */}
                    <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                      <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📋 Modèle de fichier</div>
                      <div style={{ background:"#fff", borderRadius:10, padding:14, border:"1px solid #e5e7eb", maxWidth:360 }}>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>🎯 Modèle prospects CSV</div>
                        <div style={{ fontSize:10, color:C.slate, fontFamily:"monospace", background:"#f1f5f9", padding:"6px 8px", borderRadius:6, marginBottom:10 }}>nom, email, telephone, niveau, objectif</div>
                        <button onClick={()=>{
                          const blob = new Blob(["nom,email,telephone,niveau,objectif\nExemple Dupont,exemple@email.ci,+225 01 00 00 00,B1,Anglais professionnel"],{type:"text/csv;charset=utf-8"});
                          const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="modele_prospects.csv"; document.body.appendChild(a);a.click();document.body.removeChild(a);
                          toast.success("Modèle téléchargé");
                        }} style={btnSecondary}>⬇ Télécharger</button>
                      </div>
                    </div>

                    {/* Historique imports (réel) */}
                    <div style={{ marginTop:20, background:"#f8fafc", borderRadius:12, padding:18 }}>
                      <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📜 Dernières entrées enregistrées</div>
                      {auditLogs === null ? (
                        <div style={{ fontSize:12, color:C.slate, textAlign:"center", padding:16 }}>Chargement…</div>
                      ) : auditLogs.filter(h=>h.action_type==="LEADS_CREATED").length === 0 ? (
                        <div style={{ fontSize:12, color:C.slate, textAlign:"center", padding:16 }}>Aucun import effectué</div>
                      ) : auditLogs.filter(h=>h.action_type==="LEADS_CREATED").slice(0,10).map(h=>(
                        <div key={h.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderBottom:"1px solid #e5e7eb", fontSize:12 }}>
                          <span style={{ fontSize:20 }}>📥</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700 }}>{h.detail}</div>
                            <div style={{ fontSize:10, color:C.slate }}>{h.acteur_nom||"Visiteur"} · {formatDate(h.created_at)}</div>
                          </div>
                          <Badge label="Créé" color={C.primary} bg={C.light} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importStep===1 && importData.length>0 && (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                      <div style={{ fontSize:14, fontWeight:800 }}>Aperçu du fichier : <span style={{ color:C.primary }}>{importFile?.name}</span></div>
                      <Badge label={`${importData.length} lignes détectées`} color="#15803d" bg="#dcfce7" />
                    </div>
                    {importErrors.length>0 && (
                      <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#92400e" }}>
                        ⚠️ {importErrors.join(" ")}
                      </div>
                    )}
                    <div style={{ overflowX:"auto", maxHeight:300, overflowY:"auto", borderRadius:10, border:"1px solid #e5e7eb", marginBottom:20 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                        <thead style={{ background:"#f9fafb", position:"sticky", top:0 }}>
                          <tr>{Object.keys(importData[0]||{}).filter(k=>k!=="⁠_row").map(h=><th key={h} style={{ ...th, fontSize:10 }}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {importData.slice(0,20).map((row,i)=>(
                            <tr key={i} style={{ borderTop:"1px solid #e5e7eb" }}>
                              {Object.entries(row).filter(([k])=>k!=="⁠_row").map(([k,v])=>(
                                <td key={k} style={{ ...td, maxWidth:120, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{v||<span style={{ color:"#d1d5db" }}>–</span>}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importData.length>20 && <div style={{ fontSize:11, color:C.slate, marginBottom:12, textAlign:"center" }}>... et {importData.length-20} lignes supplémentaires</div>}
                    <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                      <button onClick={resetImport} disabled={importSaving} style={btnSecondary}>Annuler</button>
                      <button onClick={handleConfirmImport} disabled={importSaving} style={btnPrimary}>{importSaving ? "⏳ Import en cours…" : `✅ Confirmer l'import (${importData.length} lignes)`}</button>
                    </div>
                  </div>
                )}

                {importStep===3 && (
                  <div style={{ textAlign:"center", padding:"40px 20px" }}>
                    <div style={{ fontSize:56, marginBottom:16 }}>{importResult?.ok > 0 ? "🎉" : "⚠️"}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:"#111827", marginBottom:8 }}>{importResult?.ok > 0 ? "Import terminé" : "Import échoué"}</div>
                    <div style={{ fontSize:14, color:C.slate, marginBottom:24 }}>
                      {importResult?.ok || 0} prospect(s) enregistré(s) en base{importResult?.fail > 0 ? ` · ${importResult.fail} ligne(s) rejetée(s)` : ""}
                    </div>
                    <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                      <button onClick={()=>{resetImport();setActiveTab("prospects");}} style={btnPrimary}>Voir les prospects</button>
                      <button onClick={()=>resetImport()} style={btnSecondary}>Nouvel import</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════
                TAB : QUALITÉ DES DONNÉES
            ══════════════════════════════════════ */}
            {activeTab==="qualite" && (
              <div>
                {leads === null ? (
                  <div style={{ textAlign:"center", padding:"40px 0", color:C.slate }}>Chargement…</div>
                ) : (() => {
                  const list = leads;
                  const total = list.length || 1;
                  const champs = [
                    { champ:"Email",     remplis: list.filter(l=>l.email).length },
                    { champ:"Téléphone", remplis: list.filter(l=>l.telephone).length },
                    { champ:"Niveau CECR", remplis: list.filter(l=>l.niveau).length },
                    { champ:"Objectif",  remplis: list.filter(l=>l.objectif).length },
                    { champ:"Centre",    remplis: list.filter(l=>l.centre_id).length },
                  ].map(f => ({ ...f, total: list.length, taux: Math.round((f.remplis/total)*100) }));
                  const scoreGlobal = Math.round(champs.reduce((s,f)=>s+f.taux,0)/champs.length);
                  const incomplets = list.filter(l => !l.niveau || !l.objectif || !l.centre_id);

                  const parEmail = {}; const parTel = {};
                  list.forEach(l => { if (l.email) (parEmail[l.email] ||= []).push(l); if (l.telephone) (parTel[l.telephone] ||= []).push(l); });
                  const doublons = [
                    ...Object.entries(parEmail).filter(([,v])=>v.length>1).map(([k,v])=>({ cle:k, type:"email", items:v })),
                    ...Object.entries(parTel).filter(([,v])=>v.length>1).map(([k,v])=>({ cle:k, type:"téléphone", items:v })),
                  ];

                  const recommandations = [];
                  const sansNiveau = list.filter(l=>!l.niveau).length;
                  const sansObjectif = list.filter(l=>!l.objectif).length;
                  const sansCentre = list.filter(l=>!l.centre_id).length;
                  if (sansNiveau > 0) recommandations.push({ icon:"🎯", text:`Évaluer le niveau CECR pour ${sansNiveau} prospect(s)`, priority: sansNiveau > total*0.3 ? "high" : "medium" });
                  if (sansObjectif > 0) recommandations.push({ icon:"📋", text:`Renseigner l'objectif pour ${sansObjectif} prospect(s)`, priority: "medium" });
                  if (sansCentre > 0) recommandations.push({ icon:"🏢", text:`Associer un centre pour ${sansCentre} prospect(s)`, priority: "low" });
                  if (doublons.length > 0) recommandations.push({ icon:"🔄", text:`Vérifier ${doublons.length} doublon(s) potentiel(s)`, priority:"high" });

                  return (
                    <>
                    {/* Score global */}
                    <div style={{ background:C.gradient, borderRadius:14, padding:"20px 24px", color:"#fff", marginBottom:24, display:"flex", alignItems:"center", gap:20 }}>
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:48, fontWeight:900, lineHeight:1 }}>{scoreGlobal}%</div>
                        <div style={{ fontSize:12, color:"#bae6fd" }}>Score qualité global</div>
                      </div>
                      <div style={{ flex:1, paddingLeft:20, borderLeft:"1px solid rgba(255,255,255,0.15)" }}>
                        <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Qualité des données prospects</div>
                        <div style={{ fontSize:12, color:"#bae6fd" }}>Basé sur {list.length} fiches · {champs.filter(f=>f.taux===100).length} champs à 100% · {champs.filter(f=>f.taux<80).length} champ(s) à améliorer</div>
                        <div style={{ marginTop:12, display:"flex", gap:16 }}>
                          {[
                            { label:"Excellent (100%)", count:champs.filter(f=>f.taux===100).length, color:"#34d399" },
                            { label:"Bon (≥80%)",        count:champs.filter(f=>f.taux>=80&&f.taux<100).length, color:"#fbbf24" },
                            { label:"À améliorer (<80%)",count:champs.filter(f=>f.taux<80).length, color:"#f87171" },
                          ].map(s=>(
                            <div key={s.label}>
                              <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.count}</div>
                              <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)" }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                      {/* Complétude par champ */}
                      <div style={{ background:"#f8fafc", borderRadius:12, padding:18 }}>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:16 }}>📊 Complétude par champ</div>
                        {champs.map(f=>(
                          <div key={f.champ} style={{ marginBottom:14 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:600, marginBottom:5 }}>
                              <span>{f.champ}</span>
                              <span style={{ color:C.slate }}>{f.remplis}/{f.total} fiches</span>
                            </div>
                            <QualityBar taux={f.taux} />
                          </div>
                        ))}
                      </div>

                      {/* Fiches incomplètes */}
                      <div>
                        <div style={{ background:"#fff9f0", borderRadius:12, padding:18, border:"1px solid #fcd34d", marginBottom:16 }}>
                          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>⚠️ Fiches incomplètes</div>
                          {incomplets.slice(0,8).map(l=>(
                            <div key={l.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
                              <div>
                                <div style={{ fontSize:12, fontWeight:700 }}>{l.nom}</div>
                                <div style={{ fontSize:10, color:C.slate }}>
                                  {[!l.niveau&&"niveau manquant", !l.objectif&&"objectif manquant", !l.centre_id&&"centre manquant"].filter(Boolean).join(" · ")}
                                </div>
                              </div>
                              <button onClick={()=>setActiveTab("prospects")} style={{ ...btnIconEdit, fontSize:11 }}>Voir →</button>
                            </div>
                          ))}
                          {incomplets.length===0 && (
                            <div style={{ fontSize:12, color:"#15803d", textAlign:"center", padding:12 }}>✅ Toutes les fiches sont complètes !</div>
                          )}
                        </div>

                        {/* Doublons potentiels (réels) */}
                        <div style={{ background:"#fef2f2", borderRadius:12, padding:18, border:"1px solid #fca5a5" }}>
                          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🔴 Doublons potentiels</div>
                          {doublons.length === 0 ? (
                            <div style={{ fontSize:12, color:"#15803d", textAlign:"center", padding:12 }}>✅ Aucun doublon détecté.</div>
                          ) : doublons.map((d,i)=>(
                            <div key={i} style={{ fontSize:12, color:"#991b1b", padding:"10px 12px", background:"rgba(239,68,68,0.07)", borderRadius:8, marginBottom:10 }}>
                              <div style={{ fontWeight:700 }}>{d.items.map(it=>it.nom).join(" ↔ ")}</div>
                              <div style={{ fontSize:11, marginTop:4 }}>Même {d.type} ({d.cle}) sur {d.items.length} fiches</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Recommandations */}
                    <div style={{ background:"#f0f9ff", borderRadius:12, padding:18, marginTop:20, border:`1px dashed ${C.primary}50` }}>
                      <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>💡 Recommandations</div>
                      {recommandations.length === 0 ? (
                        <div style={{ fontSize:12, color:"#15803d" }}>✅ Rien à signaler, la base est propre.</div>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                          {recommandations.map((r,i)=>(
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, fontSize:12 }}>
                              <span>{r.icon}</span>
                              <span style={{ flex:1 }}>{r.text}</span>
                              <Badge
                                label={r.priority==="high"?"Prioritaire":r.priority==="medium"?"Moyen":"Faible"}
                                color={r.priority==="high"?C.red:r.priority==="medium"?C.amber:"#6b7280"}
                                bg={r.priority==="high"?"#fee2e2":r.priority==="medium"?"#fef3c7":"#f3f4f6"}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ══════════════════════════════════════
                TAB : HISTORIQUE
            ══════════════════════════════════════ */}
            {activeTab==="historique" && (
              <div>
                <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap", alignItems:"center" }}>
                  <input value={histSearch} onChange={e=>setHistSearch(e.target.value)} placeholder="🔍 Nom, opérateur..."
                    style={{ ...inputSt, width:230 }} />
                  <div style={{ marginLeft:"auto" }}>
                    <button onClick={()=>exportCSV(filteredHisto,"historique")} style={btnSecondary}>⬇ Exporter CSV</button>
                  </div>
                </div>

                {auditLogs === null ? (
                  <div style={{ textAlign:"center", padding:32, color:C.slate, fontSize:13 }}>Chargement…</div>
                ) : (
                <div style={{ position:"relative", paddingLeft:28 }}>
                  <div style={{ position:"absolute", left:10, top:0, bottom:0, width:2, background:"#e5e7eb" }} />
                  {filteredHisto.map(h=>{
                    const ac = actionColors[h.action_type]||{label:h.action_type, color:C.slate,bg:"#f1f5f9"};
                    return (
                      <div key={h.id} style={{ position:"relative", marginBottom:16 }}>
                        <div style={{ position:"absolute", left:-22, top:6, width:16, height:16, borderRadius:"50%", background:ac.bg, border:`2px solid ${ac.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:ac.color }}>
                          {h.action_type==="LEADS_CREATED"?"+":h.action_type==="LEADS_UPDATED"?"~":"×"}
                        </div>
                        <div style={{ background:"#fff", borderRadius:10, padding:"12px 16px", border:"1px solid #f1f5f9", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                            <Badge label={ac.label||h.action_type} color={ac.color} bg={ac.bg} />
                            <span style={{ fontSize:10, color:C.slate, marginLeft:"auto" }}>{formatDate(h.created_at)}</span>
                          </div>
                          <div style={{ fontSize:11, color:C.slate }}>{h.detail}</div>
                          <div style={{ fontSize:10, color:"#9ca3af", marginTop:4 }}>Par : {h.acteur_nom||"Visiteur"}</div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredHisto.length===0 && <div style={{ textAlign:"center", padding:32, color:C.slate, fontSize:13 }}>Aucune entrée dans l'historique</div>}
                </div>
                )}
              </div>
            )}
            {/* ══════ NOTIFICATIONS ══════ */}
            {activeTab==="notifications" && (
              <div style={{ padding:"24px 0" }}>
                <NotificationsTab userId={profil?.id} accentColor="#0891b2" />
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ══ MODAL PROSPECT ══ */}
      {showProspectModal && (
        <Modal title="Nouveau prospect" wide onClose={()=>setShowProspectModal(false)}>
          <ProspectForm centres={centres} onSave={handleSaveProspect} onCancel={()=>setShowProspectModal(false)} />
        </Modal>
      )}
      <FooterSaaS couleurTheme={C.primary} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FORMULAIRE
═══════════════════════════════════════════════════════ */
const FRow = ({ children }) => <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>{children}</div>;
const FField = ({ label, children }) => (
  <div>
    <label style={labelSt}>{label}</label>
    {children}
  </div>
);

const ProspectForm = ({ centres, onSave, onCancel }) => {
  const [f, setF] = useState({ nom:"", email:"", telephone:"", niveau:"", objectif:"", centre_id:"" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const submit = async () => {
    if (!f.nom || (!f.email && !f.telephone)) return;
    setSaving(true);
    await onSave(f);
    setSaving(false);
  };
  return (
    <div>
      <FRow>
        <FField label="Nom *"><input style={inputSt} value={f.nom} onChange={e=>set("nom",e.target.value)} required /></FField>
        <FField label="Centre">
          <select style={inputSt} value={f.centre_id} onChange={e=>set("centre_id",e.target.value)}>
            <option value="">– National / en ligne –</option>
            {centres.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </FField>
      </FRow>
      <FRow>
        <FField label="Email"><input type="email" style={inputSt} value={f.email} onChange={e=>set("email",e.target.value)} /></FField>
        <FField label="Téléphone"><input style={inputSt} value={f.telephone} onChange={e=>set("telephone",e.target.value)} placeholder="+225 07 00 00 00" /></FField>
      </FRow>
      <div style={{ fontSize:11, color:"#9ca3af", marginTop:-6, marginBottom:12 }}>Email ou téléphone requis (au moins l'un des deux).</div>
      <FRow>
        <FField label="Niveau CECR">
          <select style={inputSt} value={f.niveau} onChange={e=>set("niveau",e.target.value)}>
            <option value="">– Non évalué –</option>
            {NIVEAUX.map(n=><option key={n}>{n}</option>)}
          </select>
        </FField>
        <FField label="Objectif">
          <input style={inputSt} value={f.objectif} onChange={e=>set("objectif",e.target.value)} placeholder="Ex : Anglais professionnel" />
        </FField>
      </FRow>
      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
        <button onClick={onCancel} disabled={saving} style={btnSecondary}>Annuler</button>
        <button onClick={submit} disabled={saving || !f.nom || (!f.email && !f.telephone)} style={btnPrimary}>{saving ? "⏳ Enregistrement…" : "Enregistrer"}</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════════ */
const CC = "#0891b2";
const CL = "#e0f2fe";
const CD = "#0e7490";
const btnPrimary    = { padding:"9px 18px", background:CC, color:"#fff", border:"none", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:12 };
const btnSecondary  = { padding:"9px 18px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:7, cursor:"pointer", fontWeight:700, fontSize:12 };
const btnIconEdit   = { display:"block", padding:"5px 10px", background:CL, color:CD, border:`1px solid ${CC}40`, borderRadius:5, cursor:"pointer", fontSize:11, fontWeight:700 };
const btnIconDelete = { display:"block", padding:"5px 8px", background:"#fee2e2", color:"#b91c1c", border:"1px solid #ef444440", borderRadius:5, cursor:"pointer", fontSize:11, fontWeight:700 };
const labelSt  = { display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:4 };
const inputSt  = { padding:"9px 10px", borderRadius:7, border:"1px solid #d1d5db", fontSize:13, width:"100%", boxSizing:"border-box" };
const selectSt = { padding:"7px 12px", borderRadius:7, border:"1px solid #e5e7eb", fontSize:12 };
const th = { padding:"9px 10px", textAlign:"left", fontWeight:700, fontSize:11, color:"#374151", borderBottom:"2px solid #e5e7eb" };
const td = { padding:"9px 10px", verticalAlign:"middle" };