// src/Pages/RHPaieDashboard/RHPaieDashboard.jsx
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { clearAllSessionStorage } from "../../utils/session";
import { useLivePermissions } from "../../utils/permissions";
import { openElearningSSO } from "../../utils/ssoElearning";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import NotificationBell from "../../Components/NotificationBell";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import { useNotifPoller } from "../../hooks/useNotifPoller";
import NotificationsTab from "../../Components/NotificationsTab";
import MessagerieTab from "../../Components/MessagerieTab";
import { useFirebaseChat } from "../../hooks/useFirebaseChat";
import { useLanguage } from "../../contexts/LanguageContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import FooterSaaS from "../../Components/FooterSaaS";
import { assombrirCouleur } from "../../utils/couleurs";
import { genererPDF, fmtDatePDF } from "../../utils/genererPDF";
import { exporterExcelStyle } from "../../utils/exporterExcel";
import { useTabState } from "../../hooks/useTabState";
import { useNotifications } from "../../hooks/useNotifications";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";

import { uploadFichier } from "../../utils/uploadFichier";
import VisionneuseImage from "../../Components/VisionneuseImage";
const API_URL         = process.env.REACT_APP_API_URL || "http://localhost:5001";
const ELEARNING_URL   = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";
const PRIMARY_COLOR   = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur||"#0d9488"; } catch { return "#0d9488"; } })();
const PRIMARY_LIGHT   = PRIMARY_COLOR + "18";
const GRADIENT_HEADER = `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(PRIMARY_COLOR)} 100%)`;
const FF              = "'Inter','Segoe UI',sans-serif";

/* ─── Composants ─── */
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
    <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:wide?740:540, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.2)", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"#f1f5f9", border:"none", borderRadius:8, width:32, height:32, fontSize:16, cursor:"pointer" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const Th = ({ children }) => (
  <th style={{ padding:"10px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:".04em", borderBottom:"1px solid #e5e7eb", background:"#f8fafc", whiteSpace:"nowrap" }}>{children}</th>
);
const Td = ({ children, bold, color }) => (
  <td style={{ padding:"10px 14px", fontSize:13, fontWeight:bold?700:400, color:color||"inherit", borderBottom:"1px solid #f1f5f9" }}>{children}</td>
);

/* ─── Statuts réels du cycle de vie d'une fiche d'honoraires ───
   en_attente → valide (PA a vérifié) → transmis (envoyé à la RH) → paye,
   ou litige à tout moment. */
const STATUT_HON = {
  en_attente: { label:"En attente",         color:"#B45309", bg:"#FEF3C7" },
  valide:     { label:"Validé (à envoyer)", color:"#4338CA", bg:"#E0E7FF" },
  transmis:   { label:"Transmis → RH",      color:"#1D4ED8", bg:"#DBEAFE" },
  paye:       { label:"Payé",               color:"#065F46", bg:"#D1FAE5" },
  litige:     { label:"Litige",             color:"#991B1B", bg:"#FEE2E2" },
};
const STATUT_SEANCE = {
  en_attente: { label:"En attente", color:"#B45309", bg:"#FEF3C7" },
  valide:     { label:"Validée",    color:"#1D4ED8", bg:"#DBEAFE" },
  rejete:     { label:"Rejetée",    color:"#991B1B", bg:"#FEE2E2" },
};
const MOIS_LABELS = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];

const fmt  = v => (v||0).toLocaleString("fr-FR") + " FCFA";
const fmtD = d => d ? new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}) : "-";

/* ═══════════════════════════════════════════════════════ */
export default function RHPaieDashboard() {
  const navigate   = useNavigate();
  const profilInitial = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const { profil, peut } = useLivePermissions(profilInitial);
  const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
  const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";
  const prenom     = profil?.prenom || "";
  const nom        = profil?.nom    || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "Responsable RH";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "RH";

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
        if (data.profil.acces_elearning !== undefined) setAccesElearning(data.profil.acces_elearning === true);
        if (sessionStorage.getItem("_bet_color_guard")) { sessionStorage.removeItem("_bet_color_guard"); return; }
        const freshColor = data.profil.couleur || null;
        const stored = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}"); } catch { return {}; } })();
        const _mp = { ...stored, ...data.profil }; if (!data.profil.couleur && stored.couleur) _mp.couleur = stored.couleur; localStorage.setItem("admin_profil", JSON.stringify(_mp));
        if (freshColor && freshColor !== PRIMARY_COLOR) window.location.reload();
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  useNotifPoller({ userId:profil?.id, sources:["honoraires"] });

  const [activeTab,   setActiveTab]   = useTabState("dashboard");
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
  const authHdr = () => ({ Authorization:`Bearer ${localStorage.getItem("admin_token")||""}` });

  const [coachs, setCoachs] = useState([]);
  const [bulletins, setBulletins] = useState([]);
  const [bulletinsLoading, setBulletinsLoading] = useState(false);
  const [grille, setGrille] = useState(null);
  const [mois, setMois] = useState(new Date().getMonth()+1);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [searchQ, setSearchQ] = useState("");
  const [flash, setFlash] = useState(null);

  // Paiement - modal 2 étapes
  const [payModal, setPayModal] = useState(null); // { hon, coachNom }
  const [payConfirm, setPayConfirm] = useState(false);
  const [payForm, setPayForm] = useState({ mode_paiement:"virement", reference_paiement:"" });
  const [payModalSeances, setPayModalSeances] = useState([]);
  const [payModalSeancesLoading, setPayModalSeancesLoading] = useState(false);
  const [actionEnCours, setActionEnCours] = useState(false);

  // Détail coach - modal à onglets, lecture seule
  const [detailCoach, setDetailCoach] = useState(null);
  const [detailTab, setDetailTab] = useState("infos");
  const [detailHonoraires, setDetailHonoraires] = useState([]);
  const [selectedHonId, setSelectedHonId] = useState(null);
  const [detailSeances, setDetailSeances] = useState([]);
  const [detailSeancesLoading, setDetailSeancesLoading] = useState(false);
  const [detailGroupes, setDetailGroupes] = useState([]);
  const [detailGroupesLoading, setDetailGroupesLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/seances/coachs`, { headers: authHdr() })
      .then(r=>r.json()).then(d=>setCoachs(d.coachs||[])).catch(()=>{});
    fetch(`${API_URL}/api/seances/grille-tarifaire`, { headers: authHdr() })
      .then(r=>r.json()).then(d=>setGrille(d.grille||null)).catch(()=>{});
  }, []);

  function fetchBulletins() {
    setBulletinsLoading(true);
    fetch(`${API_URL}/api/seances/honoraires-mois?mois=${mois}&annee=${annee}`, { headers: authHdr() })
      .then(r=>r.json())
      .then(d => setBulletins((d.honoraires||[]).filter(h => h.statut==="transmis" || h.statut==="paye")))
      .catch(()=>setBulletins([]))
      .finally(()=>setBulletinsLoading(false));
  }
  useEffect(() => { fetchBulletins(); }, [mois, annee]); // eslint-disable-line

  useEffect(() => {
    if (!payModal) { setPayModalSeances([]); return; }
    setPayModalSeancesLoading(true);
    fetch(`${API_URL}/api/seances/honoraires-mois/${payModal.hon.id}/seances`, { headers: authHdr() })
      .then(r=>r.json()).then(d=>setPayModalSeances(d.seances||[]))
      .catch(()=>setPayModalSeances([])).finally(()=>setPayModalSeancesLoading(false));
  }, [payModal?.hon?.id]); // eslint-disable-line

  useEffect(() => {
    if (!selectedHonId) { setDetailSeances([]); return; }
    setDetailSeancesLoading(true);
    fetch(`${API_URL}/api/seances/honoraires-mois/${selectedHonId}/seances`, { headers: authHdr() })
      .then(r=>r.json()).then(d=>setDetailSeances(d.seances||[]))
      .catch(()=>setDetailSeances([])).finally(()=>setDetailSeancesLoading(false));
  }, [selectedHonId]); // eslint-disable-line

  useEffect(() => {
    if (!detailCoach) { setDetailHonoraires([]); setDetailGroupes([]); return; }
    fetch(`${API_URL}/api/seances/honoraires-mois?coach_id=${detailCoach.id}`, { headers: authHdr() })
      .then(r=>r.json()).then(d => {
        const histo = (d.honoraires||[]).filter(h => h.statut==="transmis" || h.statut==="paye")
          .sort((a,b)=>b.annee-a.annee || b.mois-a.mois);
        setDetailHonoraires(histo);
        setSelectedHonId(histo[0]?.id || null);
      }).catch(()=>{});
    setDetailGroupesLoading(true);
    fetch(`${API_URL}/api/groupes?coach_id=${detailCoach.id}`, { headers: authHdr() })
      .then(r=>r.ok ? r.json() : { groupes: [] }).then(d=>setDetailGroupes(d.groupes||[]))
      .catch(()=>setDetailGroupes([])).finally(()=>setDetailGroupesLoading(false));
  }, [detailCoach?.id]); // eslint-disable-line

  const stats = useMemo(() => ({
    coachsActifs:  coachs.filter(c=>c.actif).length,
    aPayer:        bulletins.filter(b=>b.statut==="transmis").length,
    montantAPayer: bulletins.filter(b=>b.statut==="transmis").reduce((s,b)=>s+(b.montant_net??b.montant_total??0),0),
    dejaPayes:     bulletins.filter(b=>b.statut==="paye").length,
  }), [coachs, bulletins]);

  const bulletinsFiltres = useMemo(() =>
    bulletins.filter(b => {
      if (!searchQ) return true;
      const nom = b.coach ? `${b.coach.prenom||""} ${b.coach.nom||""}`.toLowerCase() : "";
      return nom.includes(searchQ.toLowerCase());
    })
  , [bulletins, searchQ]);

  const coachsFiltres = useMemo(() =>
    coachs.filter(c => !searchQ || `${c.prenom||""} ${c.nom||""} ${c.email||""}`.toLowerCase().includes(searchQ.toLowerCase()))
  , [coachs, searchQ]);

  async function marquerPaye() {
    if (actionEnCours || !payModal) return;
    setActionEnCours(true);
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/${payModal.hon.id}/statut`, {
        method:"PATCH", headers:{ ...authHdr(), "Content-Type":"application/json" },
        body: JSON.stringify({ statut:"paye", mode_paiement:payForm.mode_paiement, reference_paiement:payForm.reference_paiement }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setBulletins(prev => prev.map(h => h.id===d.honoraire.id ? { ...d.honoraire, coach:h.coach } : h));
      toast.success(`💵 Paiement enregistré pour ${payModal.coachNom}.`);
      setPayModal(null); setPayConfirm(false); setPayForm({ mode_paiement:"virement", reference_paiement:"" });
    } catch (e) { toast.error(e.message); }
    finally { setActionEnCours(false); }
  }

  async function annulerPaiement(b) {
    if (actionEnCours) return;
    const nom = b.coach ? `${b.coach.prenom||""} ${b.coach.nom||""}`.trim() : "ce coach";
    setActionEnCours(true);
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/${b.id}/statut`, {
        method:"PATCH", headers:{ ...authHdr(), "Content-Type":"application/json" },
        body: JSON.stringify({ statut:"transmis" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setBulletins(prev => prev.map(h => h.id===d.honoraire.id ? { ...d.honoraire, coach:h.coach } : h));
      toast.success(`↩️ Paiement annulé pour ${nom}.`);
    } catch (e) { toast.error(e.message); }
    finally { setActionEnCours(false); }
  }

  async function genererFichePDF(b) {
    const nom = b.coach ? `${b.coach.prenom||""} ${b.coach.nom||""}`.trim() : "Coach";
    let seances = [];
    try {
      const r = await fetch(`${API_URL}/api/seances/honoraires-mois/${b.id}/seances`, { headers: authHdr() });
      const d = await r.json();
      seances = d.seances || [];
    } catch {}
    const periode = `${MOIS_LABELS[b.mois]} ${b.annee}`;
    const lignes = seances.map(s => `
      <tr${s.honoraire_statut==="rejete"?' style="opacity:0.5;text-decoration:line-through"':""}>
        <td>${s.date_seance ? new Date(s.date_seance).toLocaleDateString("fr-FR") : "-"}</td>
        <td>${s.titre||"-"}</td>
        <td class="td-right">${parseFloat(s.duree_h||0).toFixed(1)}h</td>
        <td class="td-right">${Math.round(s.honoraire_montant||0).toLocaleString("fr-FR")} FCFA</td>
      </tr>`).join("");
    genererPDF(`
      <div class="doc-header"><div><div class="doc-header-logo">BET - RH / Paie</div><div class="doc-header-sub">Fiche d'honoraires</div></div><div class="doc-header-right">Période : ${periode}<br/>Émis le ${fmtDatePDF(new Date().toISOString())}<br/>CONFIDENTIEL</div></div>
      <div class="doc-title-band">💰 FICHE D'HONORAIRES - ${nom.toUpperCase()} - ${periode.toUpperCase()}</div>
      <div class="doc-body">
        <div class="section-title">Coach</div>
        <div class="info-grid">
          <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${nom}</span></div>
          <div class="info-row"><span class="info-label">Statut</span><span class="info-value">${b.statut==="paye"?"✅ Payé":"⏳ À payer"}</span></div>
          <div class="info-row"><span class="info-label">Mode de paiement</span><span class="info-value">${b.mode_paiement||"-"}${b.reference_paiement?` (${b.reference_paiement})`:""}</span></div>
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
        </tbody><tfoot><tr><td>NET À PAYER</td><td style="font-size:16px">${Math.round(b.montant_net??b.montant_total).toLocaleString("fr-FR")} FCFA</td></tr></tfoot></table>
        <div class="section-title">Détail des séances réalisées</div>
        <table><thead><tr><th>Date</th><th>Titre</th><th>Durée</th><th>Montant</th></tr></thead>
        <tbody>${lignes || '<tr><td colspan="4" style="text-align:center;color:#94A3B8">Aucune séance</td></tr>'}</tbody></table>
        <div class="doc-footer"><span>BET · Fiche d'honoraires ${periode} · Confidentiel</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
      </div>
    `, `Fiche honoraires ${nom} - ${periode}`);
  }

  const selectSt = { padding:"7px 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:12, background:"#fff", fontFamily:FF };

  const { notifications: toutesNotifsRH, nbNonLues: notifNonLuesRH, marquerLue: marquerNotifLueRH } = useNotifications(profil?.id);
  const { unreadTotal: msgNonLuTotalRH } = useFirebaseChat();
  const [banderoleFermeeRH, setBanderoleFermeeRH] = useState(false);
  const notifsBanderoleRH = toutesNotifsRH.filter(n => !n.lu).slice(0, 3);

  // ── "Mes tâches" - agrège les compteurs "à traiter" déjà calculés
  const tachesBulletinsAPayer = stats.aPayer;
  const tachesTotal = tachesBulletinsAPayer;

  const TABS = [
    { key:"taches",     label:"Mes tâches",          icon:"✅", badge: tachesTotal || null },
    { key:"dashboard",  label:"Tableau de bord",     icon:"📊" },
    { key:"grille",     label:"Grille tarifaire",    icon:"💰" },
    { key:"contrats",   label:"Coachs",               icon:"📄" },
    { key:"recaps",     label:"Bulletins de paie",   icon:"📋", badge:stats.aPayer },
    { key:"messages",        label:"Messages",              icon:"💬", badge: msgNonLuTotalRH || null },
    { key:"notifications",  label:"Notifications",         icon:"🔔", badge: notifNonLuesRH || null },
  ];

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#f0fdfa", fontFamily:FF }}>

      {/* ── HERO ── */}
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
              <div style={{ fontSize:11, color:"#99f6e4", fontWeight:600, letterSpacing:"0.08em" }}>Bonjour 👋</div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff" }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} /></h1>
              {surnomPerso.trim() && nomComplet !== nomAffiche && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:1 }}>{nomComplet}</div>
              )}
              <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                onEnregistre={(v) => setSurnomPerso(v || "")} />
              <div style={{ fontSize:12, color:"#99f6e4", marginTop:3 }}>🤝 Ressources Humaines / Paie · {profil?.email || ""}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {stats.aPayer > 0 && (
              <div style={{ background:"rgba(239,68,68,.28)", border:"1px solid rgba(239,68,68,.5)", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}
                onClick={()=>setActiveTab("recaps")}>
                ⏳ {stats.aPayer} bulletin{stats.aPayer>1?"s":""} à payer
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
        <div style={{ display:"flex", gap:0, background:"rgba(0,0,0,0.15)", borderRadius:"12px 12px 0 0", overflow:"hidden", position:"relative", zIndex:1 }}>
          {[
            { l:"Coaches actifs",     v:stats.coachsActifs,            c:"#99f6e4" },
            { l:"À payer",            v:stats.aPayer,                  c:"#fbbf24" },
            { l:"Net à virer",        v:fmt(stats.montantAPayer),      c:"#fca5a5" },
            { l:"Déjà payés",         v:stats.dejaPayes,               c:"#6ee7b7" },
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
          <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e7eb", flexWrap:"wrap", background:"#fafafa" }}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setActiveTab(t.key)} style={{
                padding:"12px 15px", border:"none",
                borderBottom:activeTab===t.key?`3px solid ${PRIMARY_COLOR}`:"3px solid transparent",
                cursor:"pointer", fontWeight:600, fontSize:12, whiteSpace:"nowrap",
                background:"transparent", color:activeTab===t.key?PRIMARY_COLOR:"#6b7280",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"color .15s",
                flex:"1 1 130px",
              }}>
                <span>{t.icon}</span>{t.label}
                {t.badge>0 && <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px" }}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {!banderoleFermeeRH && notifsBanderoleRH.length > 0 && (
            <div style={{ padding:"10px 24px", background:"#fff7ed", borderBottom:"1px solid #fed7aa", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                {notifsBanderoleRH.map(n => (
                  <div key={n.id} onClick={() => { marquerNotifLueRH(n.id); setActiveTab("notifications"); }}
                    style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                    <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                    <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                  </div>
                ))}
                {notifNonLuesRH > notifsBanderoleRH.length && (
                  <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                    +{notifNonLuesRH - notifsBanderoleRH.length} autre{notifNonLuesRH - notifsBanderoleRH.length > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
              <button onClick={()=>setBanderoleFermeeRH(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
            </div>
          )}

          <div style={{ padding:24 }}>

            {/* ══ MES TÂCHES ══ */}
            {activeTab==="taches" && (() => {
              const taches = [
                { icon:"📋", label:"Bulletins transmis à payer", n:tachesBulletinsAPayer, tab:"recaps" },
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

            {/* ══════ DASHBOARD ══════ */}
            {activeTab==="dashboard" && (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                  <StatCard label="Coaches actifs"  value={stats.coachsActifs}          icon="👨‍🏫" color={PRIMARY_COLOR} onClick={()=>setActiveTab("contrats")} />
                  <StatCard label="Bulletins à payer" value={stats.aPayer}              icon="⏳"  color="#d97706"       onClick={()=>setActiveTab("recaps")} />
                  <StatCard label="Net à virer"     value={fmt(stats.montantAPayer)}    icon="🏦"  color="#7c3aed"       onClick={()=>setActiveTab("recaps")} />
                  <StatCard label="Déjà payés"      value={stats.dejaPayes}             icon="✅"  color="#16a34a"       sub={`${MOIS_LABELS[mois]} ${annee}`} />
                </div>

                <div style={{ background:"#fff", borderRadius:12, padding:20, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <div style={{ fontWeight:800, fontSize:14 }}>📋 Bulletins de paie - {MOIS_LABELS[mois]} {annee}</div>
                    <button onClick={()=>setActiveTab("recaps")} style={{ fontSize:12, color:PRIMARY_COLOR, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>Voir tout →</button>
                  </div>
                  {bulletinsFiltres.length === 0 ? (
                    <div style={{ textAlign:"center", padding:20, color:"#94a3b8", fontSize:13 }}>Aucun bulletin transmis pour ce mois.</div>
                  ) : bulletinsFiltres.slice(0,4).map(b=>{
                    const s = STATUT_HON[b.statut]||STATUT_HON.en_attente;
                    const nom = b.coach ? `${b.coach.prenom||""} ${b.coach.nom||""}`.trim() : "-";
                    return (
                      <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f1f5f9" }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:13 }}>{nom}</div>
                          <div style={{ fontSize:11, color:"#64748b" }}>{b.nb_seances||0} séances · {(b.total_heures||0).toFixed(1)}h</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontWeight:800, color:"#16a34a", fontSize:14 }}>{fmt(b.montant_net??b.montant_total)}</span>
                          <Badge label={s.label} color={s.color} bg={s.bg} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══════ RÉCAPITULATIFS (PAIE) ══════ */}
            {activeTab==="recaps" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  {MOIS_LABELS.slice(1).map((m,i)=>(
                    <button key={m} onClick={()=>setMois(i+1)} style={{ padding:"5px 11px", borderRadius:20, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", background:mois===i+1?PRIMARY_COLOR:"#f1f5f9", color:mois===i+1?"#fff":"#6b7280" }}>{m}</button>
                  ))}
                  {[2024,2025,2026,2027].map(y=>(
                    <button key={y} onClick={()=>setAnnee(y)} style={{ padding:"5px 11px", borderRadius:20, border:"none", fontSize:11, fontWeight:700, cursor:"pointer", background:annee===y?PRIMARY_COLOR:"#f1f5f9", color:annee===y?"#fff":"#6b7280" }}>{y}</button>
                  ))}
                  <input placeholder="🔍 Chercher coach…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{ ...selectSt, width:200 }} />
                  <div style={{ marginLeft:"auto", fontSize:12, color:"#94a3b8" }}>{bulletinsFiltres.length} bulletin{bulletinsFiltres.length>1?"s":""}</div>
                </div>

                {bulletinsLoading ? (
                  <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>⏳ Chargement…</div>
                ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {bulletinsFiltres.map(b=>{
                    const s = STATUT_HON[b.statut]||STATUT_HON.en_attente;
                    const nom = b.coach ? `${b.coach.prenom||""} ${b.coach.nom||""}`.trim() : "-";
                    return (
                      <div key={b.id}
                        style={{ background:"#fff", borderRadius:12, padding:"16px 20px", border:"1.5px solid #e5e7eb", boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            {b.coach?.avatar_url ? (
                              <img src={b.coach.avatar_url} alt={nom} style={{ width:36, height:36, borderRadius:"50%", objectFit:"cover" }} />
                            ) : (
                              <div style={{ width:36, height:36, borderRadius:"50%", background:PRIMARY_COLOR, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13 }}>
                                {nom.split(" ").map(w=>w[0]||"").join("").toUpperCase().slice(0,2)}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight:800, fontSize:14 }}>{nom}</div>
                              <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{b.nb_seances||0} séances · {(b.total_heures||0).toFixed(1)}h</div>
                            </div>
                          </div>
                          <div style={{ textAlign:"right", flexShrink:0 }}>
                            <div style={{ fontSize:20, fontWeight:900, color:"#16a34a" }}>{fmt(b.montant_net??b.montant_total)}</div>
                            <Badge label={s.label} color={s.color} bg={s.bg} />
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:8, marginTop:12, justifyContent:"flex-end", alignItems:"center" }}>
                          <button onClick={()=>genererFichePDF(b)} style={{ padding:"7px 14px", border:"1px solid #e5e7eb", background:"#f8fafc", color:"#374151", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                            📄 Fiche PDF
                          </button>
                          {b.statut==="transmis" ? (
                            <button disabled={!peut("honoraires","manage")} title={permBtnTitle("Marquer payé",peut("honoraires","manage"))} onClick={()=>{ setPayModal({ hon:b, coachNom:nom }); setPayConfirm(false); }} style={permBtnStyle({ padding:"7px 14px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" },peut("honoraires","manage"))}>
                              {peut("honoraires","manage")?"💵":"🔒"} Marquer payé
                            </button>
                          ) : (
                            <>
                              <span style={{ fontSize:11, color:"#94a3b8" }}>{b.mode_paiement||"virement"}{b.reference_paiement?` · ${b.reference_paiement}`:""}</span>
                              <button disabled={actionEnCours||!peut("honoraires","manage")} title={permBtnTitle("Annuler le paiement",peut("honoraires","manage"))} onClick={()=>annulerPaiement(b)} style={permBtnStyle({ padding:"5px 10px", border:"1px solid #fca5a5", background:"#fff5f5", color:"#dc2626", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer" },peut("honoraires","manage"))}>
                                {peut("honoraires","manage")?"↩️":"🔒"} Annuler le paiement
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {bulletinsFiltres.length===0 && (
                    <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>Aucun bulletin transmis pour {MOIS_LABELS[mois]} {annee}.<br/><span style={{ fontSize:12 }}>Les fiches apparaissent ici une fois transmises par le PA.</span></div>
                  )}
                </div>
                )}
              </div>
            )}

            {/* ══════ CONTRATS ══════ */}
            {activeTab==="contrats" && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <input placeholder="🔍 Chercher coach ou email…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{ ...selectSt, width:220 }} />
                  <div style={{ marginLeft:"auto", fontSize:12, color:"#94a3b8" }}>{coachsFiltres.length} coach{coachsFiltres.length>1?"s":""}</div>
                </div>

                <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["Coach","Email","Contrat","Statut",""].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                    <tbody>
                      {coachsFiltres.map(c=>{
                        const nom = `${c.prenom||""} ${c.nom||""}`.trim();
                        return (
                        <tr key={c.id}
                          onClick={()=>{ setDetailCoach(c); setDetailTab("infos"); }}
                          style={{ cursor:"pointer", transition:"background .12s" }}
                          onMouseEnter={e=>e.currentTarget.style.background="#f0fdfa"}
                          onMouseLeave={e=>e.currentTarget.style.background=""}>
                          <Td bold>{nom}</Td>
                          <Td>{c.email}</Td>
                          <Td><Badge label={c.coach_info?.type_contrat||"-"} color="#0891b2" bg="#e0f2fe" /></Td>
                          <Td>
                            <Badge label={c.actif?"Actif":"Inactif"} color={c.actif?"#16a34a":"#6b7280"} bg={c.actif?"#dcfce7":"#f3f4f6"} />
                          </Td>
                          <Td><span style={{ color:PRIMARY_COLOR, fontSize:12, fontWeight:600 }}>Voir →</span></Td>
                        </tr>
                        );
                      })}
                      {coachsFiltres.length===0 && (
                        <tr><td colSpan={5} style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:13 }}>Aucun coach correspondant.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ══════ GRILLE ══════ */}
            {activeTab==="grille" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ fontSize:13, color:"#64748b" }}>Grille tarifaire officielle BET - base de calcul automatique des honoraires (définie par le Pedagogical Advisor)</div>
                {!grille ? (
                  <div style={{ textAlign:"center", padding:40, color:"#94a3b8" }}>⏳ Chargement…</div>
                ) : (
                  <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.04)" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead><tr>{["Type de contrat","En ligne","Présentiel","Domicile"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                      <tbody>
                        {Object.entries(grille.tarifs||{}).map(([contrat,t],i)=>(
                          <tr key={contrat} style={{ background:i%2===0?"#fff":"#f8fafc" }}>
                            <Td><Badge label={contrat} color="#0891b2" bg="#e0f2fe" /></Td>
                            <Td bold color={PRIMARY_COLOR}>{fmt(t.en_ligne)}</Td>
                            <Td bold color={PRIMARY_COLOR}>{fmt(t.presentiel)}</Td>
                            <Td bold color={PRIMARY_COLOR}>{fmt(t.domicile)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ padding:"14px 18px", background:"#f0fdfa", borderRadius:10, border:"1px solid #99f6e4", fontSize:13, color:"#0f172a" }}>
                  💡 <strong>Formule :</strong> Honoraires = Tarif[contrat][modalité] × Multiplicateur[niveau] × Durée (h)
                </div>
              </div>
            )}

            {/* ══════ MESSAGES ══════ */}
            {activeTab==="messages" && (
              <MessagerieTab accentColor={PRIMARY_COLOR} />
            )}

            {/* ══════ NOTIFICATIONS ══════ */}
            {activeTab==="notifications" && (
              <div style={{ padding:"24px 0" }}>
                <NotificationsTab userId={profil?.id} accentColor="#0d9488" />
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Modal marquer payé - étape 1 : vérification + détails du paiement ── */}
      {payModal && !payConfirm && (
        <Modal title="💵 Marquer comme payé" onClose={()=>setPayModal(null)} wide>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:14 }}>{payModal.coachNom} - {MOIS_LABELS[payModal.hon.mois]} {payModal.hon.annee} - {fmt(payModal.hon.montant_net??payModal.hon.montant_total)}</div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
            {[
              { l:"Séances", v:payModal.hon.nb_seances||0 },
              { l:"Heures",  v:`${(payModal.hon.total_heures||0).toFixed(1)}h` },
              { l:"Retenues", v: payModal.hon.retenues ? fmt(payModal.hon.retenues) : "Aucune" },
            ].map(k=>(
              <div key={k.l} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 12px" }}>
                <div style={{ fontSize:10, color:"#94a3b8" }}>{k.l}</div>
                <div style={{ fontWeight:800, fontSize:14 }}>{k.v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:11, color:"#94a3b8", textTransform:"uppercase", fontWeight:700, marginBottom:8 }}>📋 Séances prises en compte</div>
          {payModalSeancesLoading ? (
            <div style={{ textAlign:"center", padding:16, color:"#94a3b8", fontSize:12 }}>⏳ Chargement…</div>
          ) : payModalSeances.length === 0 ? (
            <div style={{ textAlign:"center", padding:16, color:"#94a3b8", fontSize:12, background:"#f8fafc", borderRadius:10 }}>Aucune séance associée.</div>
          ) : (
            <div style={{ border:"1px solid #e5e7eb", borderRadius:10, overflow:"hidden", maxHeight:220, overflowY:"auto", marginBottom:16 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead><tr>{["Date","Titre","Durée","Montant"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                <tbody>
                  {payModalSeances.map(s=>(
                    <tr key={s.id} style={{ background:s.honoraire_statut==="rejete"?"#FEF2F2":"#fff" }}>
                      <Td>{s.date_seance?new Date(s.date_seance).toLocaleDateString("fr-FR"):"-"}</Td>
                      <Td>{s.titre||"-"}</Td>
                      <Td>{parseFloat(s.duree_h||0).toFixed(1)}h</Td>
                      <Td bold color={s.honoraire_statut==="rejete"?"#9ca3af":"#059669"}>{Math.round(s.honoraire_montant||0).toLocaleString("fr-FR")} FCFA</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display:"flex", gap:12, marginBottom:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>Mode de paiement</div>
              <select value={payForm.mode_paiement} onChange={e=>setPayForm(f=>({...f, mode_paiement:e.target.value}))} style={{ ...selectSt, width:"100%" }}>
                <option value="virement">Virement bancaire</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="especes">Espèces</option>
                <option value="cheque">Chèque</option>
              </select>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>Référence (optionnel)</div>
              <input type="text" value={payForm.reference_paiement} onChange={e=>setPayForm(f=>({...f, reference_paiement:e.target.value}))} placeholder="N° de transaction…" style={{ ...selectSt, width:"100%" }} />
            </div>
          </div>

          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button onClick={()=>setPayModal(null)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, cursor:"pointer", background:"#fff", fontSize:12 }}>Annuler</button>
            <button onClick={()=>setPayConfirm(true)} style={{ padding:"8px 18px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" }}>Continuer</button>
          </div>
        </Modal>
      )}

      {/* ── Modal marquer payé - étape 2 : confirmation ── */}
      {payModal && payConfirm && (
        <Modal title="✅ Confirmer le paiement" onClose={()=>setPayConfirm(false)}>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:14 }}>Cette action marque définitivement la fiche comme payée.</div>
          <div style={{ background:"#f8fafc", borderRadius:10, padding:14, marginBottom:12 }}>
            <div style={{ fontSize:11, color:"#94a3b8" }}>Coach</div>
            <div style={{ fontWeight:700, fontSize:14 }}>{payModal.coachNom}</div>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <div style={{ flex:1, background:"#f0fdfa", borderRadius:10, padding:12 }}>
              <div style={{ fontSize:11, color:"#94a3b8" }}>Montant net</div>
              <div style={{ fontWeight:800, fontSize:15, color:"#059669" }}>{fmt(payModal.hon.montant_net??payModal.hon.montant_total)}</div>
            </div>
            <div style={{ flex:1, background:"#eff6ff", borderRadius:10, padding:12 }}>
              <div style={{ fontSize:11, color:"#94a3b8" }}>Mode</div>
              <div style={{ fontWeight:800, fontSize:14, color:"#0369a1" }}>{{ virement:"Virement", mobile_money:"Mobile Money", especes:"Espèces", cheque:"Chèque" }[payForm.mode_paiement]}</div>
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button onClick={()=>setPayConfirm(false)} style={{ padding:"8px 16px", border:"1px solid #e5e7eb", borderRadius:8, cursor:"pointer", background:"#fff", fontSize:12 }}>Retour</button>
            <button onClick={marquerPaye} disabled={actionEnCours||!peut("honoraires","manage")} title={permBtnTitle("Confirmer le paiement",peut("honoraires","manage"))} style={permBtnStyle({ padding:"8px 18px", background:"#059669", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" },peut("honoraires","manage"))}>
              {actionEnCours?"⏳…":peut("honoraires","manage")?"💵 Confirmer le paiement":"🔒 Confirmer le paiement"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal détail coach - à onglets, entièrement en lecture seule ── */}
      {detailCoach && (() => {
        const nom = `${detailCoach.prenom||""} ${detailCoach.nom||""}`.trim();
        const info = detailCoach.coach_info || {};
        const honSel = detailHonoraires.find(h=>h.id===selectedHonId) || detailHonoraires[0];
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 }}
            onClick={e=>{ if (e.target===e.currentTarget) setDetailCoach(null); }}>
            <div style={{ background:"#fff", borderRadius:16, width:"90vw", height:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,.2)" }}>
              <div style={{ padding:"20px 24px", borderBottom:"1px solid #e5e7eb", background:"#f0fdfa", borderRadius:"16px 16px 0 0", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  {detailCoach.avatar_url ? (
                    <img src={detailCoach.avatar_url} alt={nom} style={{ width:52, height:52, borderRadius:"50%", objectFit:"cover" }} />
                  ) : (
                    <div style={{ width:52, height:52, borderRadius:"50%", background:PRIMARY_COLOR, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:18 }}>
                      {nom.split(" ").map(w=>w[0]||"").join("").toUpperCase().slice(0,2)}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight:800, fontSize:16 }}>{nom}</div>
                    <div style={{ fontSize:12, color:"#64748b" }}>{detailCoach.email}</div>
                  </div>
                </div>
                <button onClick={()=>setDetailCoach(null)} style={{ width:30, height:30, borderRadius:"50%", border:"none", background:"#e2e8f0", cursor:"pointer", fontSize:16 }}>×</button>
              </div>

              <div style={{ display:"flex", gap:4, padding:"0 24px", borderBottom:"1px solid #e5e7eb", flexShrink:0 }}>
                {[{id:"infos",lib:"👤 Infos"},{id:"honoraires",lib:"💰 Honoraires"},{id:"classes",lib:"🎓 Classes"}].map(t=>(
                  <button key={t.id} onClick={()=>setDetailTab(t.id)}
                    style={{ padding:"12px 16px", border:"none", borderBottom:`2.5px solid ${detailTab===t.id?PRIMARY_COLOR:"transparent"}`, background:"none", color:detailTab===t.id?PRIMARY_COLOR:"#6b7280", fontSize:13, fontWeight:detailTab===t.id?800:600, cursor:"pointer" }}>
                    {t.lib}
                  </button>
                ))}
              </div>

              <div style={{ padding:24, overflowY:"auto", flex:1 }}>
                {detailTab==="infos" && (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
                    {[
                      { l:"Type contrat", v: info.type_contrat || "-" },
                      { l:"Début BET",    v: info.date_debut_bet ? fmtD(info.date_debut_bet) : "-" },
                      { l:"Lieu",         v: info.lieu_habitation || "-" },
                      { l:"Niveaux enseignés", v: (info.niveaux_enseignes||[]).join(", ") || "-" },
                      { l:"Statut compte", v: detailCoach.actif ? "Actif" : "Inactif" },
                    ].map(k=>(
                      <div key={k.l} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", border:"1px solid #e5e7eb" }}>
                        <div style={{ fontSize:11, color:"#94a3b8", marginBottom:2 }}>{k.l}</div>
                        <div style={{ fontWeight:700, fontSize:13 }}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {detailTab==="honoraires" && (
                  detailHonoraires.length === 0 ? (
                    <div style={{ textAlign:"center", padding:20, color:"#94a3b8", fontSize:12, background:"#f8fafc", borderRadius:10 }}>Aucune fiche transmise pour ce coach.</div>
                  ) : (
                    <>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
                        {detailHonoraires.map(h=>(
                          <button key={h.id} onClick={()=>setSelectedHonId(h.id)}
                            style={{ padding:"5px 11px", borderRadius:20, border:`1.5px solid ${h.id===honSel?.id?PRIMARY_COLOR:"#e5e7eb"}`, background:h.id===honSel?.id?"#f0fdfa":"#fff", color:h.id===honSel?.id?PRIMARY_COLOR:"#6b7280", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                            {MOIS_LABELS[h.mois]} {h.annee}
                          </button>
                        ))}
                      </div>
                      {honSel && (() => {
                        const s = STATUT_HON[honSel.statut]||STATUT_HON.en_attente;
                        return (
                          <>
                            <div style={{ marginBottom:12 }}><Badge label={s.label} color={s.color} bg={s.bg} /></div>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
                              {[
                                { l:"Séances", v:honSel.nb_seances||0 },
                                { l:"Heures",  v:`${(honSel.total_heures||0).toFixed(1)}h` },
                                { l:"Montant net", v:fmt(honSel.montant_net??honSel.montant_total) },
                              ].map(k=>(
                                <div key={k.l} style={{ background:"#f8fafc", borderRadius:10, padding:10 }}>
                                  <div style={{ fontSize:10, color:"#94a3b8" }}>{k.l}</div>
                                  <div style={{ fontWeight:800, fontSize:13 }}>{k.v}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize:11, color:"#94a3b8", textTransform:"uppercase", fontWeight:700, marginBottom:8 }}>Séances réalisées</div>
                            {detailSeancesLoading ? (
                              <div style={{ textAlign:"center", padding:16, color:"#94a3b8", fontSize:12 }}>⏳ Chargement…</div>
                            ) : detailSeances.length === 0 ? (
                              <div style={{ textAlign:"center", padding:16, color:"#94a3b8", fontSize:12, background:"#f8fafc", borderRadius:10 }}>Aucune séance.</div>
                            ) : (
                              <div style={{ border:"1px solid #e5e7eb", borderRadius:10, overflow:"hidden" }}>
                                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                                  <thead><tr>{["Date","Titre","Durée","Montant","Statut"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                                  <tbody>
                                    {detailSeances.map(s=>{
                                      const stS = STATUT_SEANCE[s.honoraire_statut]||STATUT_SEANCE.en_attente;
                                      return (
                                        <tr key={s.id} style={{ background:s.honoraire_statut==="rejete"?"#FEF2F2":"#fff" }}>
                                          <Td>{s.date_seance?new Date(s.date_seance).toLocaleDateString("fr-FR"):"-"}</Td>
                                          <Td>{s.titre||"-"}</Td>
                                          <Td>{parseFloat(s.duree_h||0).toFixed(1)}h</Td>
                                          <Td bold color={s.honoraire_statut==="rejete"?"#9ca3af":"#059669"}>{Math.round(s.honoraire_montant||0).toLocaleString("fr-FR")} FCFA</Td>
                                          <Td><Badge label={stS.label} color={stS.color} bg={stS.bg} /></Td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )
                )}

                {detailTab==="classes" && (
                  detailGroupesLoading ? (
                    <div style={{ textAlign:"center", padding:20, color:"#94a3b8", fontSize:12 }}>⏳ Chargement…</div>
                  ) : detailGroupes.length === 0 ? (
                    <div style={{ textAlign:"center", padding:20, color:"#94a3b8", fontSize:12, background:"#f8fafc", borderRadius:10 }}>Aucune classe assignée.</div>
                  ) : (
                    <div style={{ border:"1px solid #e5e7eb", borderRadius:10, overflow:"hidden" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr>{["Classe","Niveau","Statut"].map(h=><Th key={h}>{h}</Th>)}</tr></thead>
                        <tbody>
                          {detailGroupes.map(g=>(
                            <tr key={g.id}>
                              <Td bold>{g.nom}</Td>
                              <Td>{g.niveau||"-"}</Td>
                              <Td><Badge label={g.statut==="actif"?"Actif":g.statut||"-"} color={g.statut==="actif"?"#16a34a":"#6b7280"} bg={g.statut==="actif"?"#dcfce7":"#f3f4f6"} /></Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })()}
      <FooterSaaS couleurTheme={PRIMARY_COLOR} />
    </div>
  );
}
