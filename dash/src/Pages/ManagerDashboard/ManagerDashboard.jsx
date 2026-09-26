// src/Pages/ManagerDashboard/ManagerDashboard.jsx
// Route : <Route path="/manager-dashboard" element={<ManagerDashboard />} />
//
// Rôle Manager (cf. spec) : "Supervision des équipes commerciales et pédagogiques.
// Accès aux tableaux de bord, reporting global et workflows." - niveau d'accès
// "Superviseur", le plus restreint des 3 profils admin (Super Admin > Admin > Manager).
// Ce dashboard est donc volontairement 100% lecture seule : aucune action de création,
// modification ou suppression n'est exposée ici (ça reste le domaine de Super Admin/Admin).
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import NotificationsTab     from "../../Components/NotificationsTab";
import NotificationBell     from "../../Components/NotificationBell";
import MessagerieTab        from "../../Components/MessagerieTab";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import FooterSaaS           from "../../Components/FooterSaaS";
import { useLanguage } from "../../contexts/LanguageContext";
import { useConfirm }  from "../../contexts/ConfirmContext";
import { clearAllSessionStorage } from "../../utils/session";
import { assombrirCouleur } from "../../utils/couleurs";
import "../../chartConfig";
import { Line, Doughnut, Bar } from "react-chartjs-2";
import { genererPDF, fmtDatePDF } from "../../utils/genererPDF";
import { exporterExcelStyle } from "../../utils/exporterExcel";
import toast from "react-hot-toast";
import { RangeePastilles } from "../../Components/BarreFiltres";
import { useLivePermissions } from "../../utils/permissions";
import { useTabState } from "../../hooks/useTabState";
import { useNotifications } from "../../hooks/useNotifications";
import { useFirebaseChat } from "../../hooks/useFirebaseChat";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";
import CockpitKPI from "../../Components/CockpitKPI";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const BET_COLOR    = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur || "#0891b2"; } catch { return "#0891b2"; } })();
const BET_LIGHT    = BET_COLOR + "18";
const BET_GRADIENT = `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(BET_COLOR)} 100%)`;

const authHdrs = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
});

const fmtDate    = d => d ? new Date(d).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric" }) : "-";
const formatMoney = v => (v||0).toLocaleString("fr-FR") + " FCFA";

const MOIS_LABELS = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DERNIERS_MOIS = Array.from({ length: 6 }, (_, i) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
  return { label: `${MOIS_LABELS[d.getMonth()+1]} ${d.getFullYear()}`, prefix: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, mois: d.getMonth()+1, annee: d.getFullYear() };
});

const STATUT_ASSIGN_META = {
  en_attente:  { l:"En attente",  bg:"#fef3c7", c:"#d97706" },
  valide:      { l:"Validé",      bg:"#dcfce7", c:"#16a34a" },
  finalise:    { l:"Finalisé",    bg:"#dcfce7", c:"#16a34a" },
  refuse:      { l:"Refusé",      bg:"#fee2e2", c:"#dc2626" },
  en_cours:    { l:"En cours",    bg:"#e0f2fe", c:"#0369a1" },
};
const statutMeta = s => STATUT_ASSIGN_META[s] || { l:s||"-", bg:"#f1f5f9", c:"#64748b" };

/* ── UI atoms ── */
const StatCard = ({ label, value, color, icon, sub }) => (
  <div style={{ background:"#fff", padding:16, borderRadius:12, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:12, border:"1px solid #f1f5f9" }}>
    <div style={{ width:46, height:46, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{icon}</div>
    <div style={{ minWidth:0 }}>
      <div style={{ fontSize:11, color:"#9ca3af" }}>{label}</div>
      <div style={{ fontSize:21, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);
const Badge = ({ label, color, bg }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:99, fontSize:10, fontWeight:700, color, background:bg, whiteSpace:"nowrap" }}>{label}</span>
);
const EmptyState = ({ icon="📭", text }) => (
  <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af" }}>
    <div style={{ fontSize:36, marginBottom:10 }}>{icon}</div>
    <p style={{ fontSize:13 }}>{text}</p>
  </div>
);
const Pagination = ({ page, setPage, totalPages, color=BET_COLOR }) => totalPages > 1 && (
  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginTop:14 }}>
    <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
      style={{ padding:"4px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:page===1?"default":"pointer", color:page===1?"#d1d5db":"#374151", fontWeight:700, fontSize:12 }}>‹</button>
    {Array.from({length:totalPages},(_,i)=>(
      <button key={i} onClick={()=>setPage(i+1)}
        style={{ padding:"4px 10px", borderRadius:7, border:`1.5px solid ${i+1===page?color:"#e2e8f0"}`, background:i+1===page?color+"18":"#fff", color:i+1===page?color:"#374151", fontWeight:700, fontSize:12, cursor:"pointer" }}>{i+1}</button>
    ))}
    <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
      style={{ padding:"4px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:page===totalPages?"default":"pointer", color:page===totalPages?"#d1d5db":"#374151", fontWeight:700, fontSize:12 }}>›</button>
  </div>
);

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLanguage();
  const confirm = useConfirm();
  const profil = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const prenom = profil?.prenom || "";
  const nom    = profil?.nom    || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "Manager";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "MG";
  const token = localStorage.getItem("admin_token");

  const profilInitial = (() => {
    try {
      const stored = localStorage.getItem("admin_profil");
      if (stored) return JSON.parse(stored);
    } catch {}
    return profil;
  })();
  const { profil: profilConnecte, peut } = useLivePermissions(profilInitial);
  const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
  const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";

  const handleLogout = async () => {
    if (!(await confirm("Vous allez être déconnecté(e) de votre session.", { titre:"Se déconnecter ?", confirmLabel:"Se déconnecter", danger:false }))) return;
    clearAllSessionStorage();
    navigate("/bet-staff-access", { replace:true });
  };

  const [activeTab, setActiveTab] = useTabState("overview");
  const { notifications: toutesNotifsMgr, nbNonLues: notifNonLuesMgr, marquerLue: marquerNotifLueMgr } = useNotifications(profilConnecte?.id);
  const { unreadTotal: msgNonLusMgr } = useFirebaseChat();
  const [banderoleFermeeMgr, setBanderoleFermeeMgr] = useState(false);
  const notifsBanderoleMgr = toutesNotifsMgr.filter(n => !n.lu).slice(0, 3);

  const tabs = [
    { key:"overview",        icon:"🏠", label:"Vue d'ensemble" },
    // Le cockpit du référentiel KPI : les seuls indicateurs dont la source est alimentée.
    { key:"cockpit",         icon:"📊", label:"Cockpit KPI" },
    { key:"commercial_team",  icon:"💼", label:"Équipe Commerciale" },
    { key:"pedago_team",     icon:"🎓", label:"Équipe Pédagogique" },
    { key:"reporting",       icon:"📊", label:"Reporting global" },
    { key:"workflows",       icon:"🔀", label:"Workflows" },
    { key:"messagerie",      icon:"💬", label:"Messages", badge: msgNonLusMgr||null },
    { key:"notifications",   icon:"🔔", label:"Notifications", badge: notifNonLuesMgr||null },
  ];

  /* ── Données réelles ── */
  const [coachs,        setCoachs]        = useState(null);
  const [assignations,  setAssignations]  = useState(null);
  const [paiements,     setPaiements]     = useState(null);
  const [seances,       setSeances]       = useState(null);

  const [commPage, setCommPage] = useState(1);
  const [pedaPage, setPedaPage] = useState(1);
  const [repPeriode, setRepPeriode] = useState(DERNIERS_MOIS[DERNIERS_MOIS.length-1].label);
  const [repPage, setRepPage] = useState(1);
  const [wfStatut, setWfStatut] = useState("tous");
  const [wfPage, setWfPage] = useState(1);
  const PER_PAGE = 8;

  const fetchCoachs = useCallback(() => {
    fetch(`${API_URL}/api/admin/utilisateurs?role=coach`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { utilisateurs: [] })
      .then(d => setCoachs(d.utilisateurs || []))
      .catch(() => setCoachs([]));
  }, []);

  const fetchAssignations = useCallback(() => {
    fetch(`${API_URL}/api/parcours/assignations`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { assignations: [] })
      .then(d => setAssignations(d.assignations || []))
      .catch(() => setAssignations([]));
  }, []);

  const fetchPaiements = useCallback(() => {
    fetch(`${API_URL}/api/paiements/all`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { paiements: [] })
      .then(d => setPaiements(d.paiements || []))
      .catch(() => setPaiements([]));
  }, []);

  const fetchSeances = useCallback(() => {
    const now = new Date();
    fetch(`${API_URL}/api/seances/?mois=${now.getMonth()+1}&annee=${now.getFullYear()}`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { seances: [] })
      .then(d => setSeances(d.seances || []))
      .catch(() => setSeances([]));
  }, []);

  useEffect(() => {
    if (activeTab === "overview") {
      if (coachs === null) fetchCoachs();
      if (assignations === null) fetchAssignations();
      if (paiements === null) fetchPaiements();
      if (seances === null) fetchSeances();
    }
    if (activeTab === "commercial_team" && assignations === null) fetchAssignations();
    if (activeTab === "pedago_team" && coachs === null) fetchCoachs();
    if (activeTab === "reporting" && paiements === null) fetchPaiements();
    if (activeTab === "workflows" && assignations === null) fetchAssignations();
  }, [activeTab, coachs, assignations, paiements, seances, fetchCoachs, fetchAssignations, fetchPaiements, fetchSeances]);

  /* ── KPIs dérivés ── */
  const kpis = useMemo(() => {
    const nowPrefix = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();
    const coachsActifs = (coachs||[]).filter(c => c.actif !== false).length;
    const apprenantsTotal = (assignations||[]).filter(a => !["refuse"].includes(a.statut)).length;
    const caMois = (paiements||[]).filter(p => (p.date_paiement||"").startsWith(nowPrefix)).reduce((s,p)=>s+(p.montant_recu||0),0);
    const seancesTotal = (seances||[]).length;
    const seancesRealisees = (seances||[]).filter(s => s.statut === "realisee").length;
    const tauxRealisation = seancesTotal ? Math.round(seancesRealisees/seancesTotal*100) : 0;
    const enAttente = (assignations||[]).filter(a => a.statut === "en_attente").length;
    const valides = (assignations||[]).filter(a => ["valide","finalise"].includes(a.statut)).length;
    const totalDossiers = (assignations||[]).length;
    const tauxValidation = totalDossiers ? Math.round(valides/totalDossiers*100) : 0;
    const assistantesActives = new Set((assignations||[]).map(a => a.assistantes?.id).filter(Boolean)).size;
    return { coachsActifs, apprenantsTotal, caMois, seancesTotal, seancesRealisees, tauxRealisation, enAttente, tauxValidation, assistantesActives };
  }, [coachs, assignations, paiements, seances]);

  /* ── CA par mois (6 derniers mois, pour la courbe Vue d'ensemble) ── */
  const caParMois = useMemo(() => DERNIERS_MOIS.map(m => ({
    label: m.label,
    ca: (paiements||[]).filter(p => (p.date_paiement||"").startsWith(m.prefix)).reduce((s,p)=>s+(p.montant_recu||0),0),
  })), [paiements]);

  /* ── Répartition des dossiers par statut (donut Vue d'ensemble) ── */
  const repartitionStatuts = useMemo(() => {
    const map = {};
    (assignations||[]).forEach(a => { const k = a.statut || "autre"; map[k] = (map[k]||0)+1; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }, [assignations]);

  /* ── Groupement par assistante (Équipe Commerciale) ── */
  const parAssistante = useMemo(() => {
    const map = {};
    (assignations||[]).forEach(a => {
      const nomAss = a.assistantes ? `${a.assistantes.prenom||""} ${a.assistantes.nom||""}`.trim() : "Non assignée";
      if (!map[nomAss]) map[nomAss] = { nom: nomAss, total:0, en_attente:0, valide:0, refuse:0 };
      map[nomAss].total++;
      if (a.statut === "en_attente") map[nomAss].en_attente++;
      else if (["valide","finalise"].includes(a.statut)) map[nomAss].valide++;
      else if (a.statut === "refuse") map[nomAss].refuse++;
    });
    return Object.values(map).sort((a,b)=>b.total-a.total);
  }, [assignations]);

  /* ── Reporting : paiements filtrés par période ── */
  const periodePrefix = DERNIERS_MOIS.find(m => m.label === repPeriode)?.prefix;
  const paiementsFiltres = useMemo(() => (paiements||[]).filter(p => !periodePrefix || (p.date_paiement||"").startsWith(periodePrefix)), [paiements, periodePrefix]);
  const caPeriode = paiementsFiltres.reduce((s,p)=>s+(p.montant_recu||0),0);
  const caPeriodeDu = paiementsFiltres.reduce((s,p)=>s+(p.montant_du||0),0);

  /* ── Workflows : assignations filtrées par statut ── */
  const assignationsFiltres = useMemo(() => (assignations||[]).filter(a => wfStatut === "tous" || a.statut === wfStatut), [assignations, wfStatut]);

  const paginate = (list, page) => list.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const totalPages = list => Math.max(1, Math.ceil(list.length / PER_PAGE));

  /* ══════════════════════════════════════════════════════
     RENDUS PAR ONGLET
  ══════════════════════════════════════════════════════ */
  const exportOverviewPDF = () => {
    const topAssistantes = parAssistante.slice(0,5);
    const ligneCa = caParMois.map(m => `<tr><td>${m.label}</td><td class="td-right">${Math.round(m.ca).toLocaleString("fr-FR")} FCFA</td></tr>`).join("");
    const ligneStatuts = repartitionStatuts.map(([s,v]) => `<tr><td>${statutMeta(s).l}</td><td class="td-right">${v}</td></tr>`).join("");
    const ligneAssistantes = topAssistantes.map(a => `<tr><td>${a.nom}</td><td class="td-right">${a.total}</td><td class="td-right">${a.valide}</td><td class="td-right">${a.en_attente}</td><td class="td-right">${a.refuse}</td></tr>`).join("");
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Manager</div><div class="doc-header-sub">Vue d'ensemble</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}<br/>${nomComplet}</div></div>
      <div class="doc-title-band">📊 VUE D'ENSEMBLE - SUPERVISION COMMERCIALE &amp; PÉDAGOGIQUE</div>
      <div class="doc-body">
        <div class="section-title">Indicateurs clés</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#0891B2"><div class="kpi-val">${kpis.coachsActifs}</div><div class="kpi-lbl">Coachs actifs</div></div>
          <div class="kpi-card" style="border-top-color:#7C3AED"><div class="kpi-val">${kpis.apprenantsTotal}</div><div class="kpi-lbl">Apprenants</div></div>
          <div class="kpi-card" style="border-top-color:#16A34A"><div class="kpi-val">${Math.round(kpis.caMois).toLocaleString("fr-FR")}</div><div class="kpi-lbl">CA du mois (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#D97706"><div class="kpi-val">${kpis.seancesRealisees}/${kpis.seancesTotal}</div><div class="kpi-lbl">Séances ce mois</div></div>
        </div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#D97706"><div class="kpi-val">${kpis.enAttente}</div><div class="kpi-lbl">Dossiers en attente</div></div>
          <div class="kpi-card" style="border-top-color:#16A34A"><div class="kpi-val">${kpis.tauxValidation}%</div><div class="kpi-lbl">Taux de validation</div></div>
          <div class="kpi-card" style="border-top-color:#0891B2"><div class="kpi-val">${kpis.tauxRealisation}%</div><div class="kpi-lbl">Taux réalisation séances</div></div>
          <div class="kpi-card" style="border-top-color:#7C3AED"><div class="kpi-val">${kpis.assistantesActives}</div><div class="kpi-lbl">Assistantes actives</div></div>
        </div>
        <div class="section-title">CA encaissé - 6 derniers mois</div>
        <table><thead><tr><th>Mois</th><th>CA encaissé</th></tr></thead><tbody>${ligneCa}</tbody></table>
        <div class="section-title">Répartition des dossiers par statut</div>
        <table><thead><tr><th>Statut</th><th>Nombre</th></tr></thead><tbody>${ligneStatuts || '<tr><td colspan="2" style="text-align:center;color:#94A3B8">Aucun dossier</td></tr>'}</tbody></table>
        <div class="section-title">Top 5 assistantes par volume</div>
        <table><thead><tr><th>Assistante</th><th>Total</th><th>Validés</th><th>En attente</th><th>Refusés</th></tr></thead>
        <tbody>${ligneAssistantes || '<tr><td colspan="5" style="text-align:center;color:#94A3B8">Aucune donnée</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Vue d'ensemble Manager · Lecture seule</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, "Vue d'ensemble - Manager");
  };

  const exportOverviewExcel = async () => {
    const topAssistantes = parAssistante.slice(0,5);
    try {
      await exporterExcelStyle({
        nomFichier: `manager_vue_ensemble_${new Date().toISOString().slice(0,10)}`,
        couleurEntete: "0891B2",
        feuilles: [
          {
            nom: "KPIs",
            titre: "Vue d'ensemble - Indicateurs clés",
            sousTitre: `Généré le ${new Date().toLocaleDateString("fr-FR")}`,
            colonnes: [{ label:"Indicateur", width:32, bold:true }, { label:"Valeur", width:20, align:"right" }],
            lignes: [
              ["Coachs actifs", kpis.coachsActifs],
              ["Apprenants (parcours)", kpis.apprenantsTotal],
              ["CA du mois (FCFA)", Math.round(kpis.caMois)],
              ["Séances réalisées / total ce mois", `${kpis.seancesRealisees}/${kpis.seancesTotal}`],
              ["Dossiers en attente", kpis.enAttente],
              ["Taux de validation", `${kpis.tauxValidation}%`],
              ["Taux de réalisation séances", `${kpis.tauxRealisation}%`],
              ["Assistantes actives", kpis.assistantesActives],
            ],
          },
          {
            nom: "CA par mois",
            colonnes: [{ label:"Mois", width:20 }, { label:"CA encaissé (FCFA)", width:22, align:"right", numFmt:"#,##0" }],
            lignes: caParMois.map(m => [m.label, Math.round(m.ca)]),
          },
          {
            nom: "Répartition statuts",
            colonnes: [{ label:"Statut", width:24 }, { label:"Nombre", width:16, align:"right" }],
            lignes: repartitionStatuts.map(([s,v]) => [statutMeta(s).l, v]),
          },
          {
            nom: "Top assistantes",
            colonnes: [{ label:"Assistante", width:26, bold:true }, { label:"Total", width:12, align:"right" }, { label:"Validés", width:12, align:"right" }, { label:"En attente", width:14, align:"right" }, { label:"Refusés", width:12, align:"right" }],
            lignes: topAssistantes.map(a => [a.nom, a.total, a.valide, a.en_attente, a.refuse]),
          },
        ],
      });
      toast.success("Export Excel téléchargé");
    } catch { toast.error("Erreur lors de l'export Excel"); }
  };

  const renderOverview = () => {
    const maxCa = Math.max(1, ...caParMois.map(m=>m.ca));
    const totalRepartition = repartitionStatuts.reduce((s,[,v])=>s+v, 0) || 1;
    const DONUT_COLORS = ["#0891b2","#16a34a","#d97706","#dc2626","#7c3aed","#64748b"];
    const topAssistantes = parAssistante.slice(0,5);

    return (
      <div>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginBottom:14 }}>
          <button onClick={exportOverviewExcel} disabled={assignations===null || paiements===null || !peut("rapports","manage")}
            title={permBtnTitle("Export Excel", peut("rapports","manage"))}
            style={permBtnStyle({ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:9, cursor: (assignations===null||paiements===null) ? "default" : "pointer", fontSize:12, fontWeight:700, color:"#16a34a", opacity:(assignations===null||paiements===null)?0.5:1 }, peut("rapports","manage"))}>
            {peut("rapports","manage") ? "⬇️" : "🔒"} Excel
          </button>
          <button onClick={exportOverviewPDF} disabled={assignations===null || paiements===null || !peut("rapports","manage")}
            title={permBtnTitle("Export PDF", peut("rapports","manage"))}
            style={permBtnStyle({ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:9, cursor: (assignations===null||paiements===null) ? "default" : "pointer", fontSize:12, fontWeight:700, color:"#dc2626", opacity:(assignations===null||paiements===null)?0.5:1 }, peut("rapports","manage"))}>
            {peut("rapports","manage") ? "📄" : "🔒"} PDF
          </button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:14 }}>
          <StatCard label="Coachs actifs" value={coachs===null ? "…" : kpis.coachsActifs} color="#0891b2" icon="👨‍🏫" />
          <StatCard label="Apprenants (parcours)" value={assignations===null ? "…" : kpis.apprenantsTotal} color="#7c3aed" icon="🎓" />
          <StatCard label="CA du mois" value={paiements===null ? "…" : formatMoney(kpis.caMois)} color="#16a34a" icon="💰" />
          <StatCard label="Séances ce mois" value={seances===null ? "…" : `${kpis.seancesRealisees}/${kpis.seancesTotal}`} color="#d97706" icon="📅" sub="réalisées / total" />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:24 }}>
          <StatCard label="Dossiers en attente" value={assignations===null ? "…" : kpis.enAttente} color="#d97706" icon="⏳" />
          <StatCard label="Taux de validation" value={assignations===null ? "…" : `${kpis.tauxValidation}%`} color="#16a34a" icon="✅" sub="dossiers validés / total" />
          <StatCard label="Taux de réalisation séances" value={seances===null ? "…" : `${kpis.tauxRealisation}%`} color="#0891b2" icon="📈" />
          <StatCard label="Assistantes actives" value={assignations===null ? "…" : kpis.assistantesActives} color="#7c3aed" icon="👥" sub="avec au moins 1 dossier" />
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:16, marginBottom:16 }}>
          <div style={{ background:"#fff", border:"1px solid #f1f5f9", borderRadius:12, padding:18 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:12 }}>💰 Évolution du CA encaissé (6 derniers mois)</div>
            {paiements === null ? <EmptyState icon="⏳" text="Chargement…" /> : (
              <div style={{ height:230 }}>
                <Line
                  data={{
                    labels: caParMois.map(m=>m.label),
                    datasets: [{
                      label: "CA encaissé",
                      data: caParMois.map(m=>m.ca),
                      borderColor: BET_COLOR,
                      backgroundColor: BET_COLOR+"22",
                      fill: true,
                      tension: 0.35,
                      pointRadius: 3,
                      pointBackgroundColor: BET_COLOR,
                    }],
                  }}
                  options={{
                    responsive:true, maintainAspectRatio:false,
                    plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => formatMoney(ctx.parsed.y) } } },
                    scales:{ y:{ ticks:{ callback:v=>`${(v/1000).toLocaleString("fr-FR")}k` }, suggestedMax: maxCa*1.15 } },
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ background:"#fff", border:"1px solid #f1f5f9", borderRadius:12, padding:18 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:12 }}>🔀 Répartition des dossiers par statut</div>
            {assignations === null ? <EmptyState icon="⏳" text="Chargement…" /> : repartitionStatuts.length === 0 ? <EmptyState text="Aucun dossier." /> : (
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:150, height:150, flexShrink:0 }}>
                  <Doughnut
                    data={{
                      labels: repartitionStatuts.map(([s])=>statutMeta(s).l),
                      datasets: [{ data: repartitionStatuts.map(([,v])=>v), backgroundColor: repartitionStatuts.map((_,i)=>DONUT_COLORS[i%DONUT_COLORS.length]), borderWidth:0 }],
                    }}
                    options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, cutout:"65%" }}
                  />
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8, flex:1 }}>
                  {repartitionStatuts.map(([s,v],i)=>(
                    <div key={s} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                      <span style={{ width:9, height:9, borderRadius:3, background:DONUT_COLORS[i%DONUT_COLORS.length], flexShrink:0 }} />
                      <span style={{ color:"#374151", flex:1 }}>{statutMeta(s).l}</span>
                      <span style={{ fontWeight:700, color:"#0f172a" }}>{v}</span>
                      <span style={{ color:"#9ca3af", fontSize:11 }}>({Math.round(v/totalRepartition*100)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ background:"#fff", border:"1px solid #f1f5f9", borderRadius:12, padding:18, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:12 }}>💼 Top 5 assistantes par volume de dossiers</div>
          {assignations === null ? <EmptyState icon="⏳" text="Chargement…" /> : topAssistantes.length === 0 ? <EmptyState text="Aucun dossier commercial." /> : (
            <div style={{ height:220 }}>
              <Bar
                data={{
                  labels: topAssistantes.map(a=>a.nom),
                  datasets: [
                    { label:"Validés",    data: topAssistantes.map(a=>a.valide),     backgroundColor:"#16a34a" },
                    { label:"En attente", data: topAssistantes.map(a=>a.en_attente), backgroundColor:"#d97706" },
                    { label:"Refusés",    data: topAssistantes.map(a=>a.refuse),     backgroundColor:"#dc2626" },
                  ],
                }}
                options={{
                  responsive:true, maintainAspectRatio:false,
                  plugins:{ legend:{ position:"bottom", labels:{ boxWidth:10, font:{ size:11 } } } },
                  scales:{ x:{ stacked:true }, y:{ stacked:true, ticks:{ precision:0 } } },
                }}
              />
            </div>
          )}
        </div>

        <div style={{ fontSize:12, color:"#9ca3af", fontStyle:"italic" }}>
          Vue synthétique en lecture seule - pour agir sur ces données (modifier un paiement, réassigner un dossier, etc.), passez par Super Admin ou Admin.
        </div>
      </div>
    );
  };

  const renderCommercialTeam = () => {
    if (assignations === null) return <EmptyState icon="⏳" text="Chargement…" />;
    if (parAssistante.length === 0) return <EmptyState text="Aucun dossier commercial pour l'instant." />;
    const paged = paginate(parAssistante, commPage);
    return (
      <div>
        <div style={{ fontSize:12, color:"#9ca3af", marginBottom:14, fontStyle:"italic" }}>💼 Répartition des dossiers prospects/apprenants par assistante commerciale - lecture seule</div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>
              {["Assistante","Total dossiers","En attente","Validés","Refusés"].map(h=>(
                <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:12, color:"#6b7280", background:"#f9fafb", fontWeight:600 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map((a,i)=>(
                <tr key={i} style={{ borderTop:"1px solid #f1f5f9" }}>
                  <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:"#0f172a" }}>{a.nom}</td>
                  <td style={{ padding:"10px 12px", fontSize:13 }}>{a.total}</td>
                  <td style={{ padding:"10px 12px" }}><Badge label={a.en_attente} bg="#fef3c7" color="#d97706" /></td>
                  <td style={{ padding:"10px 12px" }}><Badge label={a.valide} bg="#dcfce7" color="#16a34a" /></td>
                  <td style={{ padding:"10px 12px" }}><Badge label={a.refuse} bg="#fee2e2" color="#dc2626" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={commPage} setPage={setCommPage} totalPages={totalPages(parAssistante)} />
      </div>
    );
  };

  const renderPedagoTeam = () => {
    if (coachs === null) return <EmptyState icon="⏳" text="Chargement…" />;
    if (coachs.length === 0) return <EmptyState text="Aucun coach enregistré." />;
    const paged = paginate(coachs, pedaPage);
    return (
      <div>
        <div style={{ fontSize:12, color:"#9ca3af", marginBottom:14, fontStyle:"italic" }}>🎓 Équipe pédagogique - charge de travail (groupes actifs) - lecture seule</div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>
              {["Coach","Email","Groupes actifs","Statut"].map(h=>(
                <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:12, color:"#6b7280", background:"#f9fafb", fontWeight:600 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map(c=>(
                <tr key={c.id} style={{ borderTop:"1px solid #f1f5f9" }}>
                  <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:"#0f172a" }}>{c.prenom} {c.nom}</td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:"#6b7280" }}>{c.email}</td>
                  <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:BET_COLOR }}>{c.nbr_contrats_actifs ?? 0}</td>
                  <td style={{ padding:"10px 12px" }}>
                    {c.actif !== false
                      ? <Badge label="Actif" bg="#dcfce7" color="#16a34a" />
                      : <Badge label="Inactif" bg="#fee2e2" color="#dc2626" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={pedaPage} setPage={setPedaPage} totalPages={totalPages(coachs)} />
      </div>
    );
  };

  const exportReportingPDF = () => {
    const lignes = paiementsFiltres.map(p => `
      <tr>
        <td>${p.client||"-"}</td>
        <td>${p.commercial_nom||"-"}</td>
        <td class="td-right">${Math.round(p.montant_recu||0).toLocaleString("fr-FR")} FCFA</td>
        <td class="td-right">${Math.round(p.montant_du||0).toLocaleString("fr-FR")} FCFA</td>
        <td>${p.mode_paiement||"-"}</td>
        <td>${p.statut||"-"}</td>
        <td>${fmtDatePDF(p.date_paiement)}</td>
      </tr>`).join("");
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - Manager</div><div class="doc-header-sub">Reporting global</div></div><div class="doc-header-right">Période : ${repPeriode}<br/>Émis le ${fmtDatePDF(new Date().toISOString())}<br/>${nomComplet}</div></div>
      <div class="doc-title-band">📊 REPORTING GLOBAL - ${repPeriode.toUpperCase()}</div>
      <div class="doc-body">
        <div class="section-title">Synthèse</div>
        <div class="kpi-row">
          <div class="kpi-card" style="border-top-color:#16A34A"><div class="kpi-val">${Math.round(caPeriode).toLocaleString("fr-FR")}</div><div class="kpi-lbl">CA encaissé (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#64748B"><div class="kpi-val">${Math.round(caPeriodeDu).toLocaleString("fr-FR")}</div><div class="kpi-lbl">CA dû (FCFA)</div></div>
          <div class="kpi-card" style="border-top-color:#0891B2"><div class="kpi-val">${paiementsFiltres.length}</div><div class="kpi-lbl">Paiements</div></div>
        </div>
        <div class="section-title">Détail des paiements</div>
        <table><thead><tr><th>Client</th><th>Commercial</th><th>Montant reçu</th><th>Montant dû</th><th>Mode</th><th>Statut</th><th>Date</th></tr></thead>
        <tbody>${lignes || '<tr><td colspan="7" style="text-align:center;color:#94A3B8">Aucun paiement pour cette période</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Reporting global Manager · Lecture seule</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, `Reporting global - ${repPeriode}`);
  };

  const exportReportingExcel = async () => {
    try {
      await exporterExcelStyle({
        nomFichier: `manager_reporting_${repPeriode.replace(" ","_")}`,
        titre: `Reporting global - ${repPeriode}`,
        sousTitre: `${paiementsFiltres.length} paiement(s) · CA encaissé : ${Math.round(caPeriode).toLocaleString("fr-FR")} FCFA · Généré le ${new Date().toLocaleDateString("fr-FR")}`,
        couleurEntete: "0891B2",
        colonnes: [
          { label:"Client", width:22, bold:true }, { label:"Commercial", width:20 },
          { label:"Montant reçu", width:16, align:"right", numFmt:"#,##0" }, { label:"Montant dû", width:16, align:"right", numFmt:"#,##0" },
          { label:"Mode", width:14 }, { label:"Statut", width:14 }, { label:"Date", width:16 },
        ],
        lignes: paiementsFiltres.map(p => [p.client||"", p.commercial_nom||"", Math.round(p.montant_recu||0), Math.round(p.montant_du||0), p.mode_paiement||"", p.statut||"", fmtDate(p.date_paiement)]),
      });
      toast.success("Export Excel téléchargé");
    } catch { toast.error("Erreur lors de l'export Excel"); }
  };

  const renderReporting = () => {
    if (paiements === null) return <EmptyState icon="⏳" text="Chargement…" />;
    const paged = paginate(paiementsFiltres, repPage);
    return (
      <div>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginBottom:14 }}>
          <button onClick={exportReportingExcel} disabled={!peut("rapports","manage")}
            title={permBtnTitle("Export Excel", peut("rapports","manage"))}
            style={permBtnStyle({ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:9, cursor:"pointer", fontSize:12, fontWeight:700, color:"#16a34a" }, peut("rapports","manage"))}>
            {peut("rapports","manage") ? "⬇️" : "🔒"} Excel
          </button>
          <button onClick={exportReportingPDF} disabled={!peut("rapports","manage")}
            title={permBtnTitle("Export PDF", peut("rapports","manage"))}
            style={permBtnStyle({ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:9, cursor:"pointer", fontSize:12, fontWeight:700, color:"#dc2626" }, peut("rapports","manage"))}>
            {peut("rapports","manage") ? "📄" : "🔒"} PDF
          </button>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
          <select value={repPeriode} onChange={e=>{setRepPeriode(e.target.value);setRepPage(1);}}
            style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", cursor:"pointer" }}>
            {DERNIERS_MOIS.map(m=><option key={m.label} value={m.label}>{m.label}</option>)}
          </select>
          <span style={{ fontSize:11, color:"#9ca3af", marginLeft:"auto" }}>{paiementsFiltres.length} paiement{paiementsFiltres.length>1?"s":""}</span>
        </div>
        <div style={{ display:"flex", gap:10, marginBottom:16 }}>
          <div style={{ background:"#fff", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"12px 18px", flex:1, textAlign:"center" }}>
            <div style={{ fontSize:20, fontWeight:900, color:"#16a34a" }}>{formatMoney(caPeriode)}</div>
            <div style={{ fontSize:10, color:"#6b7280", fontWeight:700 }}>CA encaissé</div>
          </div>
          <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"12px 18px", flex:1, textAlign:"center" }}>
            <div style={{ fontSize:20, fontWeight:900, color:"#64748b" }}>{formatMoney(caPeriodeDu)}</div>
            <div style={{ fontSize:10, color:"#6b7280", fontWeight:700 }}>CA dû (attendu)</div>
          </div>
        </div>
        {paiementsFiltres.length === 0 ? <EmptyState text="Aucun paiement pour cette période." /> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Client","Commercial","Montant reçu","Montant dû","Mode","Statut","Date"].map(h=>(
                  <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:12, color:"#6b7280", background:"#f9fafb", fontWeight:600 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {paged.map(p=>(
                  <tr key={p.id} style={{ borderTop:"1px solid #f1f5f9" }}>
                    <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:"#0f172a" }}>{p.client||"-"}</td>
                    <td style={{ padding:"10px 12px", fontSize:12, color:"#6b7280" }}>{p.commercial_nom||"-"}</td>
                    <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:"#16a34a" }}>{formatMoney(p.montant_recu)}</td>
                    <td style={{ padding:"10px 12px", fontSize:12, color:"#6b7280" }}>{formatMoney(p.montant_du)}</td>
                    <td style={{ padding:"10px 12px", fontSize:12 }}>{p.mode_paiement||"-"}</td>
                    <td style={{ padding:"10px 12px" }}><Badge label={p.statut||"-"} bg="#e0f2fe" color="#0369a1" /></td>
                    <td style={{ padding:"10px 12px", fontSize:12, color:"#6b7280" }}>{fmtDate(p.date_paiement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={repPage} setPage={setRepPage} totalPages={totalPages(paiementsFiltres)} />
      </div>
    );
  };

  const renderWorkflows = () => {
    if (assignations === null) return <EmptyState icon="⏳" text="Chargement…" />;
    const paged = paginate(assignationsFiltres, wfPage);
    return (
      <div>
        <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
          <RangeePastilles valeur={wfStatut} style={{ marginBottom:0 }}
            onChange={(v)=>{ setWfStatut(v); setWfPage(1); }}
            options={[{ v:"tous", l:"Tous" }, ...Object.keys(STATUT_ASSIGN_META).map(k=>({ v:k, l:statutMeta(k).l }))]}
            compte={(v)=> v==="tous" ? assignations.length : assignations.filter(a=>a.statut===v).length} />
          <span style={{ fontSize:11, color:"#9ca3af", marginLeft:"auto" }}>{assignationsFiltres.length} dossier{assignationsFiltres.length>1?"s":""}</span>
        </div>
        {assignationsFiltres.length === 0 ? <EmptyState text="Aucun dossier pour ce filtre." /> : (
          <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
            {paged.map(a=>{
              const s = statutMeta(a.statut);
              return (
                <div key={a.id} style={{ background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#1e293b" }}>{a.prospect_nom || `${a.prenom_enfant||""} ${a.nom_enfant||""}`.trim() || "-"}</div>
                    <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>
                      {a.type_cours||"-"} · {a.centres?.nom || "En ligne"} · {a.assistantes ? `${a.assistantes.prenom||""} ${a.assistantes.nom||""}`.trim() : "Non assignée"} · 📅 {fmtDate(a.created_at)}
                    </div>
                  </div>
                  <Badge label={s.l} bg={s.bg} color={s.c} />
                </div>
              );
            })}
          </div>
        )}
        <Pagination page={wfPage} setPage={setWfPage} totalPages={totalPages(assignationsFiltres)} />
      </div>
    );
  };

  /* ══════════════════════════════════════════════════════
     RENDU PRINCIPAL
  ══════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#fafafa" }}>

      <div style={{ flexShrink:0, background:BET_GRADIENT, padding:"28px 32px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.04)", zIndex:0 }} />

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
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginTop:3 }}>Manager - Supervision des équipes commerciales &amp; pédagogiques</div>
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <NotificationBell userId={profil?.id} />
            <button onClick={toggleLang} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              {lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}
            </button>
            <DashboardColorPicker />
            <button onClick={handleLogout} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              <span>🚪</span> Déconnexion
            </button>
          </div>
        </div>

        <div style={{ display:"flex", gap:0, background:"rgba(0,0,0,0.15)", borderRadius:"12px 12px 0 0", overflow:"hidden" }}>
          {[
            { l:"Coachs actifs",     v: coachs===null ? "…" : kpis.coachsActifs, c:"#7dd3fc" },
            { l:"Apprenants",       v: assignations===null ? "…" : kpis.apprenantsTotal, c:"#fcd34d" },
            { l:"CA du mois",        v: paiements===null ? "…" : formatMoney(kpis.caMois), c:"#6ee7b7" },
            { l:"Séances ce mois",  v: seances===null ? "…" : `${kpis.seancesRealisees}/${kpis.seancesTotal}`, c:"#c4b5fd" },
          ].map((s,i,arr)=>(
            <div key={s.l} style={{ flex:1, textAlign:"center", padding:"14px 8px", borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.08)":"none" }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:3 }}>{s.l}</div>
              <div style={{ fontSize:20, fontWeight:800, color:s.c, lineHeight:1.2 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:"1 1 auto", padding:"0 24px 24px" }}>
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
                {tab.badge > 0 && <span style={{ padding:"1px 7px", borderRadius:10, fontSize:11, fontWeight:700, background:"#fee2e2", color:"#dc2626" }}>{tab.badge}</span>}
              </button>
            );
          })}
        </div>

        {!banderoleFermeeMgr && notifsBanderoleMgr.length > 0 && (
          <div style={{ padding:"10px 20px", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:8, marginBottom:10, display:"flex", alignItems:"flex-start", gap:10 }}>
            <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
              {notifsBanderoleMgr.map(n => (
                <div key={n.id} onClick={() => { marquerNotifLueMgr(n.id); setActiveTab("notifications"); }}
                  style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                  <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                  <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                </div>
              ))}
              {notifNonLuesMgr > notifsBanderoleMgr.length && (
                <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                  +{notifNonLuesMgr - notifsBanderoleMgr.length} autre{notifNonLuesMgr - notifsBanderoleMgr.length > 1 ? "s" : ""} →
                </button>
              )}
            </div>
            <button onClick={()=>setBanderoleFermeeMgr(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
          </div>
        )}

        <div style={{ background:"#fff", padding:24, borderRadius:"0 12px 12px 12px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)" }}>
          {activeTab === "overview"        && renderOverview()}
          {activeTab === "cockpit"         && <CockpitKPI accent={BET_COLOR} token={token} />}
          {activeTab === "commercial_team" && renderCommercialTeam()}
          {activeTab === "pedago_team"     && renderPedagoTeam()}
          {activeTab === "reporting"       && renderReporting()}
          {activeTab === "workflows"       && renderWorkflows()}
          {activeTab === "messagerie"      && <MessagerieTab accentColor={BET_COLOR} profil={profil} token={token} />}
          {/* Même prop erronée que chez le superviseur : `NotificationsTab` attend `userId`,
              pas `profil`. L'onglet restait vide en silence. */}
          {activeTab === "notifications"   && <NotificationsTab userId={profil?.id} />}
        </div>
      </div>
      <FooterSaaS couleurTheme={BET_COLOR} />
    </div>
  );
}
