// src/Pages/PlacementTestDashboard/PlacementTestDashboard.jsx
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import NotificationBell from "../../Components/NotificationBell";
import { useNotifPoller } from "../../hooks/useNotifPoller";
import NotificationsTab from "../../Components/NotificationsTab";
import TestsNiveauTab from "../../Components/TestsNiveauTab";
import { useLanguage } from "../../contexts/LanguageContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import FooterSaaS from "../../Components/FooterSaaS";
import { clearAllSessionStorage } from "../../utils/session";
import { assombrirCouleur } from "../../utils/couleurs";
import { openElearningSSO } from "../../utils/ssoElearning";
import { useLivePermissions } from "../../utils/permissions";
import { exporterExcelStyle } from "../../utils/exporterExcel";
import { genererPDF, fmtDatePDF } from "../../utils/genererPDF";
import "../../chartConfig";
import { Line, Doughnut } from "react-chartjs-2";
import { useTabState } from "../../hooks/useTabState";
import { useNotifications } from "../../hooks/useNotifications";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";

import { uploadFichier } from "../../utils/uploadFichier";
import VisionneuseImage from "../../Components/VisionneuseImage";
import FileDemandesTransfert, { useCompteDemandesTransfert } from "../../Components/DemandeTransfert";
/* ═══════════════════════════════════════════════════════
   CHARTE COULEURS - Agent Placement Test
═══════════════════════════════════════════════════════ */
const API_URL         = process.env.REACT_APP_API_URL || "http://localhost:5001";
const ELEARNING_URL   = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";
const PRIMARY_COLOR   = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur||"#0891b2"; } catch { return "#0891b2"; } })();
const PRIMARY_LIGHT   = PRIMARY_COLOR + "18";
const GRADIENT_HEADER = `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(PRIMARY_COLOR)} 100%)`;
const FF              = "'Inter','Segoe UI',sans-serif";

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
    <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:wide?"90vw":560, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,.2)", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"#f1f5f9", border:"none", borderRadius:8, width:32, height:32, fontSize:16, cursor:"pointer", color:"#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════
   CONSTANTES RÉELLES
═══════════════════════════════════════════════════════ */
const NIVEAUX_CECR = ["A1","A2","B1","B2","C1","C2"];
const NIVEAUX_COLOR = { A1:"#94a3b8",A2:"#64748b",B1:"#3b82f6",B2:"#1e40af",C1:"#7c3aed",C2:"#059669" };
const authHdrs = () => ({ "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("admin_token")}` });
const formatDateTime = (d) => d ? new Date(d).toLocaleString("fr-FR", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "-";

/* ═══════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
═══════════════════════════════════════════════════════ */
export default function PlacementTestDashboard() {
  const navigate   = useNavigate();
  const profilInitial = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const { profil, peut } = useLivePermissions(profilInitial);
  const prenom     = profil?.prenom || "";
  const nom        = profil?.nom    || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || "Agent Placement Test";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "PT";
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
        if (data.profil.acces_elearning !== undefined) setAccesElearning(data.profil.acces_elearning === true);
        if (sessionStorage.getItem("_bet_color_guard")) { sessionStorage.removeItem("_bet_color_guard"); return; }
        const freshColor = data.profil.couleur || null;
        const stored = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}"); } catch { return {}; } })();
        const _mp = { ...stored, ...data.profil }; if (!data.profil.couleur && stored.couleur) _mp.couleur = stored.couleur; localStorage.setItem("admin_profil", JSON.stringify(_mp));
        if (freshColor && freshColor !== PRIMARY_COLOR) window.location.reload();
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  useNotifPoller({ userId: profil?.id, sources: ["level_tests"] });

  const [activeTab,  setActiveTab]  = useTabState("overview");
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
  const [tests,      setTests]      = useState(null); // null = pas encore chargé
  const [selected,   setSelected]   = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [editingResultat, setEditingResultat] = useState(false); // "Modifier" sur un test déjà corrigé
  const [searchQ,    setSearchQ]    = useState("");
  const [saving,     setSaving]     = useState(false);
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [rapportDateFrom, setRapportDateFrom] = useState("");
  const [rapportDateTo,   setRapportDateTo]   = useState("");
  const TRAITES_PER_PAGE = 8;

  /* formulaire de correction manuelle (Writing/Speaking) */
  const [niveauChoisi,  setNiveauChoisi]  = useState("");
  const [scoreChoisi,   setScoreChoisi]   = useState(0);
  const [notesOral,     setNotesOral]     = useState("");
  const [speakingNotes, setSpeakingNotes] = useState({});

  const fetchTests = () => {
    fetch(`${API_URL}/api/level-test/all`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => setTests(d.results || []))
      .catch(() => setTests([]));
  };
  useEffect(() => { fetchTests(); }, []);

  const stats = useMemo(() => {
    const list = tests || [];
    return {
      aCorriger: list.filter(t=>t.correction_statut==="en_attente").length,
      traites:   list.filter(t=>t.correction_statut!=="en_attente").length,
      converti:  list.filter(t=>t.statut==="converti").length,
      total:     list.length,
      scoreMoyen: list.length ? Math.round(list.reduce((s,t)=>s+(t.score||0),0)/list.length) : 0,
    };
  }, [tests]);

  const MOIS_LABELS_PT = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
  const testsParMois = useMemo(() => {
    const list = tests || [];
    const mois = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
      return { label: `${MOIS_LABELS_PT[d.getMonth()+1]} ${d.getFullYear()}`, prefix: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` };
    });
    return mois.map(m => ({ label: m.label, count: list.filter(t => (t.submitted_at||"").startsWith(m.prefix)).length }));
  }, [tests]);

  const repartitionNiveau = useMemo(() => {
    const list = tests || [];
    const map = {};
    list.forEach(t => { const k = t.level || "Non défini"; map[k] = (map[k]||0)+1; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }, [tests]);

  const fileAttente = useMemo(() => (tests||[]).filter(t=>t.correction_statut==="en_attente"), [tests]);

  // ── Résultats candidats - TOUS les tests (y compris ceux en attente de
  // correction manuelle), pour que l'agent placement puisse corriger un test
  // directement depuis cette vue, comme le fait déjà la commerciale via
  // openDetail/handleCorriger (édition niveau/score/notes + PATCH /corriger).
  const [resultatsPage, setResultatsPage] = useState(1);
  const testsResultats = useMemo(() => {
    return (tests||[]).filter(t => {
      const qMatch = !searchQ || (t.fullname||"").toLowerCase().includes(searchQ.toLowerCase()) || (t.email||"").toLowerCase().includes(searchQ.toLowerCase());
      const dMatch = (!dateFrom || (t.submitted_at||"") >= dateFrom) && (!dateTo || (t.submitted_at||"") <= dateTo+"T23:59:59");
      return qMatch && dMatch;
    }).sort((a,b)=> new Date(b.submitted_at) - new Date(a.submitted_at));
  }, [tests, searchQ, dateFrom, dateTo]);
  const resultatsTotalPages = Math.max(1, Math.ceil(testsResultats.length / TRAITES_PER_PAGE));
  const resultatsSafePage = Math.min(resultatsPage, resultatsTotalPages);
  const testsResultatsPage = useMemo(() => testsResultats.slice((resultatsSafePage-1)*TRAITES_PER_PAGE, resultatsSafePage*TRAITES_PER_PAGE), [testsResultats, resultatsSafePage]);

  const openDetail = (t) => {
    setSelected(t);
    setNiveauChoisi(t.level || "");
    setScoreChoisi(t.score || 0);
    setNotesOral(t.notes_oral || "");
    setSpeakingNotes(t.speaking_notes || {});
    setEditingResultat(false);
    setShowDetail(true);
  };

  const handleCorriger = async () => {
    if (!selected) return;
    if (!niveauChoisi) { toast.error("Le niveau CECR est requis"); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/level-test/${selected.id}/corriger`, {
        method:"PATCH", headers: authHdrs(),
        body: JSON.stringify({ level: niveauChoisi, score: scoreChoisi, notes_oral: notesOral, speaking_notes: speakingNotes }),
      });
      if (!r.ok) { const d = await r.json().catch(()=>({})); throw new Error(d.error||"Erreur"); }
      toast.success(`Niveau ${niveauChoisi} enregistré ✓`);
      setShowDetail(false);
      fetchTests();
    } catch (err) {
      toast.error(err.message || "Erreur lors de la correction");
    } finally {
      setSaving(false);
    }
  };

  const { notifications: toutesNotifsPT, nbNonLues: notifNonLuesPT, marquerLue: marquerNotifLuePT } = useNotifications(profil?.id);
  // Combien de dossiers de transfert attendent MON action - le badge de l'onglet.
  const dossiersAReaffecter = useCompteDemandesTransfert(authHdrs, "placement");
  const [banderoleFermeePT, setBanderoleFermeePT] = useState(false);
  const notifsBanderolePT = toutesNotifsPT.filter(n => !n.lu).slice(0, 3);

  const TABS = [
    // « Mes tâches » ne comptait que les tests à corriger, alors que les demandes de
    // transfert attendent tout autant cet agent : un dossier bloqué faute de niveau rendu
    // n'apparaissait nulle part sur l'écran censé résumer ce qui reste à faire.
    { key:"taches",         label:"Mes tâches",     icon:"✅", badge: (stats.aCorriger + dossiersAReaffecter) || null },
    { key:"overview",       label:"Vue d'ensemble",  icon:"🏠" },
    { key:"file",           label:"À corriger",      icon:"📥", badge:stats.aCorriger },
    // Les demandes de transfert des coachs : c'est l'agent placement test qui fait avancer
    // le dossier, en rendant le niveau qui determinera la nouvelle classe.
    { key:"transferts",     label:"Demandes de transfert", icon:"🔄", badge: dossiersAReaffecter || null },
    { key:"rapports",       label:"Rapports",        icon:"📊" },
    { key:"test_niveau",    label:"Test de niveau",  icon:"🧪" },
    { key:"resultats_candidats", label:"Résultats candidats", icon:"📋" },
    { key:"notifications",  label:"Notifications",   icon:"🔔", badge: notifNonLuesPT || null },
  ];

  const selectSt = { padding:"7px 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:12, background:"#fff", fontFamily:FF };
  const inputSt  = { padding:"7px 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:12, fontFamily:FF };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"#f0f9ff", fontFamily:FF }}>

      {/* ── HERO HEADER ── */}
      <div style={{ flexShrink:0, background:GRADIENT_HEADER, padding:"28px 32px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.04)", zIndex:0 }} />
        <div style={{ position:"absolute", bottom:-60, right:80, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.03)", zIndex:0 }} />
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
              <div style={{ fontSize:11, color:"#7dd3fc", fontWeight:600, letterSpacing:"0.08em" }}>Bonjour 👋</div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff" }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} /></h1>
              {surnomPerso.trim() && nomComplet !== nomAffiche && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:1 }}>{nomComplet}</div>
              )}
              <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                onEnregistre={(v) => setSurnomPerso(v || "")} />
              <div style={{ fontSize:12, color:"#bae6fd", marginTop:3 }}>🧪 Agent Placement Test · {profil?.email || ""}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {stats.aCorriger > 0 && (
              <div style={{ background:"rgba(239,68,68,.28)", border:"1px solid rgba(239,68,68,.5)", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}
                onClick={()=>setActiveTab("file")}>
                ⏳ {stats.aCorriger} test{stats.aCorriger>1?"s":""} à corriger
              </div>
            )}
            <NotificationBell userId={profil?.id} />
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
            { l:"À corriger",  v: tests===null ? "…" : stats.aCorriger,            c:"#fbbf24" },
            { l:"Traités",     v: tests===null ? "…" : stats.traites,              c:"#6ee7b7" },
            { l:"Convertis",   v: tests===null ? "…" : stats.converti,             c:"#c4b5fd" },
            { l:"Total reçus", v: tests===null ? "…" : stats.total,                c:"#93c5fd" },
          ].map((s,i,arr)=>(
            <div key={s.l} style={{ flex:1, textAlign:"center", padding:"14px 8px", borderRight:i<arr.length-1?"1px solid rgba(255,255,255,0.08)":"none" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", marginBottom:3 }}>{s.l}</div>
              <div style={{ fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex:"1 1 auto", padding:"0 24px 32px" }}>
        <div style={{ background:"#fff", borderRadius:"0 0 12px 12px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", overflow:"hidden" }}>

          {/* ── Onglets ── */}
          <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e7eb", flexWrap:"wrap", background:"#fafafa" }}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setActiveTab(t.key)} style={{
                padding:"12px 18px", border:"none",
                borderBottom:activeTab===t.key?`3px solid ${PRIMARY_COLOR}`:"3px solid transparent",
                cursor:"pointer", fontWeight:600, fontSize:12, whiteSpace:"nowrap",
                background:"transparent", color:activeTab===t.key?PRIMARY_COLOR:"#6b7280",
                display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"color .15s",
                flex:"1 1 140px",
              }}>
                <span style={{ fontSize:14 }}>{t.icon}</span>{t.label}
                {t.badge>0 && <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px" }}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {!banderoleFermeePT && notifsBanderolePT.length > 0 && (
            <div style={{ padding:"10px 24px", background:"#fff7ed", borderBottom:"1px solid #fed7aa", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                {notifsBanderolePT.map(n => (
                  <div key={n.id} onClick={() => { marquerNotifLuePT(n.id); setActiveTab("notifications"); }}
                    style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                    <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                    <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                  </div>
                ))}
                {notifNonLuesPT > notifsBanderolePT.length && (
                  <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                    +{notifNonLuesPT - notifsBanderolePT.length} autre{notifNonLuesPT - notifsBanderolePT.length > 1 ? "s" : ""} →
                  </button>
                )}
              </div>
              <button onClick={()=>setBanderoleFermeePT(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
            </div>
          )}

          <div style={{ padding:24 }}>

            {/* ══════════════ MES TÂCHES ══════════════ */}
            {activeTab === "taches" && (() => {
              const taches = [
                { icon:"📥", label:"Tests à corriger", n:stats.aCorriger, tab:"file" },
                // Ces dossiers-là attendent que cet agent rende le niveau : sans lui, la
                // commerciale ou l'onboarding ne peuvent pas réaffecter l'apprenant.
                { icon:"🔄", label:"Demandes de transfert à traiter", n:dossiersAReaffecter, tab:"transferts" },
              ];
              const enCours = taches.filter(t => t.n > 0);
              const total = enCours.reduce((s,t)=>s+t.n, 0);
              return (
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginBottom:4 }}>✅ Mes tâches</div>
                  <div style={{ fontSize:12, color:"#64748b", marginBottom:18 }}>
                    {enCours.length > 0
                      ? `${total} élément${total>1?"s":""} à traiter au total.`
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

            {/* ══════════════ VUE D'ENSEMBLE ══════════════ */}
            {activeTab === "overview" && (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                {tests === null ? (
                  <div style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:14 }}>Chargement…</div>
                ) : (
                <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                  <StatCard label="Total reçus"  value={stats.total}      icon="📥" color={PRIMARY_COLOR} />
                  <StatCard label="À corriger"    value={stats.aCorriger}  icon="⏳" color="#d97706" onClick={()=>setActiveTab("file")} />
                  <StatCard label="Traités"       value={stats.traites}    icon="✅" color="#16a34a" onClick={()=>setActiveTab("resultats_candidats")} />
                  <StatCard label="Score moyen"   value={`${stats.scoreMoyen}%`} icon="📊" color="#7c3aed" />
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:16 }}>
                  <div style={{ background:"#fff", borderRadius:12, padding:22, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ fontWeight:800, fontSize:14, marginBottom:16 }}>📈 Tests reçus (6 derniers mois)</div>
                    <div style={{ height:230 }}>
                      <Line
                        data={{
                          labels: testsParMois.map(m=>m.label),
                          datasets: [{ label:"Tests reçus", data: testsParMois.map(m=>m.count), borderColor:PRIMARY_COLOR, backgroundColor:PRIMARY_COLOR+"22", fill:true, tension:0.35, pointRadius:3 }],
                        }}
                        options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ precision:0 } } } }}
                      />
                    </div>
                  </div>

                  <div style={{ background:"#fff", borderRadius:12, padding:22, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ fontWeight:800, fontSize:14, marginBottom:16 }}>🎯 Répartition par niveau</div>
                    {repartitionNiveau.length === 0 ? (
                      <div style={{ fontSize:12, color:"#94a3b8", textAlign:"center", padding:20 }}>Aucun test reçu.</div>
                    ) : (
                      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ width:130, height:130, flexShrink:0 }}>
                          <Doughnut
                            data={{
                              labels: repartitionNiveau.map(([n])=>n),
                              datasets: [{ data: repartitionNiveau.map(([,v])=>v), backgroundColor: repartitionNiveau.map(([n])=>NIVEAUX_COLOR[n]||"#94a3b8"), borderWidth:0 }],
                            }}
                            options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, cutout:"65%" }}
                          />
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:8, flex:1 }}>
                          {repartitionNiveau.map(([n,v]) => (
                            <div key={n} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                              <span style={{ width:9, height:9, borderRadius:3, background:NIVEAUX_COLOR[n]||"#94a3b8", flexShrink:0 }} />
                              <span style={{ color:"#374151", flex:1 }}>{n}</span>
                              <span style={{ fontWeight:700, color:"#0f172a" }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </>
                )}
              </div>
            )}

            {/* ══════════════ FILE D'ATTENTE ══════════════ */}
            {activeTab === "file" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ background:"#f0f9ff", border:`1px solid ${PRIMARY_COLOR}30`, borderRadius:10, padding:"10px 14px", fontSize:12, color:"#0369a1" }}>
                  ℹ️ Ces tests nécessitent une correction manuelle (format Writing/Speaking) - l'IA n'a pas pu attribuer de niveau automatiquement.
                </div>
                {tests === null ? (
                  <div style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:14 }}>Chargement…</div>
                ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {fileAttente.map(t=>{
                    return (
                      <div key={t.id} style={{
                        background:"#f0f9ff",
                        borderRadius:12, padding:"16px 20px",
                        border:"1.5px solid #bae6fd",
                        boxShadow:"0 1px 6px rgba(0,0,0,.04)",
                        display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap",
                      }}>
                        {/* Infos prospect */}
                        <div style={{ display:"flex", alignItems:"center", gap:14, flex:1, minWidth:0 }}>
                          <div style={{ width:42, height:42, borderRadius:"50%", background:PRIMARY_COLOR+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                            🎙️
                          </div>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>{t.fullname||"-"}</div>
                            <div style={{ fontSize:12, color:"#64748b", marginTop:1 }}>{t.email||"-"} {t.phone?`· ${t.phone}`:""}</div>
                            <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{t.profile||"-"} · {t.format_test} · {formatDateTime(t.submitted_at)}</div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
                          <Badge label="À corriger" color="#d97706" bg="#fef3c7" />
                          <button onClick={()=>openDetail(t)} style={{
                            padding:"7px 16px", background:PRIMARY_COLOR, color:"#fff",
                            border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                          }}>
                            ✏️ Corriger
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {fileAttente.length===0 && (
                    <div style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:14 }}>
                      ✅ Aucun test en attente de correction manuelle
                    </div>
                  )}
                </div>
                )}
              </div>
            )}

            {/* ══════════════ TRAITÉS ══════════════ */}
            {/* ══════════════ RAPPORTS ══════════════ */}
            {activeTab === "transferts" && (
              <FileDemandesTransfert accent="#0891b2" authHdrs={authHdrs} mode="placement" />
            )}

            {activeTab === "rapports" && (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                {tests === null ? (
                  <div style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:14 }}>Chargement…</div>
                ) : (() => {
                  const list = tests.filter(t => {
                    const d = (t.submitted_at||"").slice(0,10);
                    return (!rapportDateFrom || d >= rapportDateFrom) && (!rapportDateTo || d <= rapportDateTo);
                  });
                  const rapportStats = {
                    total:      list.length,
                    aCorriger:  list.filter(t=>t.correction_statut==="en_attente").length,
                    traites:    list.filter(t=>t.correction_statut!=="en_attente").length,
                    converti:   list.filter(t=>t.statut==="converti").length,
                    scoreMoyen: list.length ? Math.round(list.reduce((s,t)=>s+(t.score||0),0)/list.length) : 0,
                  };
                  const sources = [...new Set(list.map(t=>t.source||"online"))];
                  const parNiveau = NIVEAUX_CECR.map(n => ({ n, count: list.filter(t=>t.level===n).length }));
                  const traitementRepartition = [
                    { label:"Notés automatiquement (IA)", count: list.filter(t=>t.correction_statut==="auto").length },
                    { label:"Corrigés manuellement",       count: list.filter(t=>t.correction_statut==="corrige").length },
                    { label:"En attente de correction",    count: list.filter(t=>t.correction_statut==="en_attente").length },
                  ];
                  const parSource = sources.map(src => ({ src, count: list.filter(t=>(t.source||"online")===src).length }));

                  const exportRapportExcel = () => {
                    exporterExcelStyle({
                      nomFichier: `rapport_tests_placement_${new Date().toISOString().slice(0,10)}`,
                      couleurEntete: PRIMARY_COLOR.replace("#",""),
                      feuilles: [
                        {
                          nom: "KPIs",
                          titre: "Rapport - Agent Placement",
                          sousTitre: `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
                          colonnes: [{ label:"Indicateur", width:28, bold:true }, { label:"Valeur", width:16, align:"right" }],
                          lignes: [
                            ["Tests reçus", rapportStats.total],
                            ["À corriger", rapportStats.aCorriger],
                            ["Traités", rapportStats.traites],
                            ["Convertis", rapportStats.converti],
                            ["Score moyen (%)", rapportStats.scoreMoyen],
                          ],
                        },
                        {
                          nom: "Par niveau CECR",
                          colonnes: [{ label:"Niveau", width:12 }, { label:"Candidats", width:14, align:"right" }],
                          lignes: parNiveau.map(s => [s.n, s.count]),
                        },
                        {
                          nom: "Correction",
                          colonnes: [{ label:"Type", width:28 }, { label:"Nombre", width:14, align:"right" }],
                          lignes: traitementRepartition.map(s => [s.label, s.count]),
                        },
                        {
                          nom: "Par source",
                          colonnes: [{ label:"Source", width:22 }, { label:"Nombre", width:14, align:"right" }],
                          lignes: parSource.map(s => [s.src === "online" ? "En ligne" : s.src === "oral" ? "Oral (assistante)" : s.src, s.count]),
                        },
                      ],
                    });
                    toast.success("Export Excel téléchargé");
                  };

                  const exportRapportPDF = () => {
                    const ligneNiveau = parNiveau.map(s => `<tr><td>${s.n}</td><td class="td-right">${s.count}</td></tr>`).join("");
                    const ligneTraitement = traitementRepartition.map(s => `<tr><td>${s.label}</td><td class="td-right">${s.count}</td></tr>`).join("");
                    const ligneSource = parSource.map(s => `<tr><td>${s.src === "online" ? "En ligne" : s.src === "oral" ? "Oral (assistante)" : s.src}</td><td class="td-right">${s.count}</td></tr>`).join("");
                    const periodeLabel = (rapportDateFrom || rapportDateTo)
                      ? `Période : ${rapportDateFrom ? new Date(rapportDateFrom).toLocaleDateString('fr-FR') : "…"} → ${rapportDateTo ? new Date(rapportDateTo).toLocaleDateString('fr-FR') : "…"}`
                      : "Toutes périodes";
                    genererPDF(`
                      <div class="doc-header"><div><div class="doc-header-logo">BET - Agent Placement</div><div class="doc-header-sub">Rapport des tests de niveau · ${periodeLabel}</div></div><div class="doc-header-right">Émis le ${fmtDatePDF(new Date().toISOString())}</div></div>
                      <div class="doc-title-band">📊 RAPPORT - TESTS DE NIVEAU</div>
                      <div class="doc-body">
                        <div class="section-title">Indicateurs clés</div>
                        <div class="kpi-row">
                          <div class="kpi-card" style="border-top-color:${PRIMARY_COLOR}"><div class="kpi-val">${rapportStats.total}</div><div class="kpi-lbl">Tests reçus</div></div>
                          <div class="kpi-card" style="border-top-color:#D97706"><div class="kpi-val">${rapportStats.aCorriger}</div><div class="kpi-lbl">À corriger</div></div>
                          <div class="kpi-card" style="border-top-color:#16A34A"><div class="kpi-val">${rapportStats.traites}</div><div class="kpi-lbl">Traités</div></div>
                          <div class="kpi-card" style="border-top-color:#7C3AED"><div class="kpi-val">${rapportStats.converti}</div><div class="kpi-lbl">Convertis</div></div>
                        </div>
                        <div class="section-title">Répartition par niveau CECR</div>
                        <table><thead><tr><th>Niveau</th><th>Candidats</th></tr></thead><tbody>${ligneNiveau}</tbody></table>
                        <div class="section-title">Traitement automatique vs manuel</div>
                        <table><thead><tr><th>Type</th><th>Nombre</th></tr></thead><tbody>${ligneTraitement}</tbody></table>
                        <div class="section-title">Tests par source</div>
                        <table><thead><tr><th>Source</th><th>Nombre</th></tr></thead><tbody>${ligneSource}</tbody></table>
                        <div class="doc-footer"><span>BET · Rapport Agent Placement</span><span>Émis le ${fmtDatePDF(new Date().toISOString())}</span></div>
                      </div>
                    `, "Rapport - Agent Placement");
                  };

                  return (
                  <>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <label style={{ fontSize:12, color:"#64748b", display:"flex", alignItems:"center", gap:4 }}>Du
                        <input type="date" value={rapportDateFrom} onChange={e=>setRapportDateFrom(e.target.value)} style={inputSt} />
                      </label>
                      <label style={{ fontSize:12, color:"#64748b", display:"flex", alignItems:"center", gap:4 }}>Au
                        <input type="date" value={rapportDateTo} onChange={e=>setRapportDateTo(e.target.value)} style={inputSt} />
                      </label>
                      {(rapportDateFrom || rapportDateTo) && (
                        <button onClick={()=>{setRapportDateFrom("");setRapportDateTo("");}} style={{ ...selectSt, cursor:"pointer", color:"#dc2626" }}>✕ Réinitialiser</button>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={exportRapportExcel} style={{ padding:"8px 16px", background:"#fff", color:"#16a34a", border:"1.5px solid #bbf7d0", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>📊 Export Excel</button>
                      <button onClick={exportRapportPDF} style={{ padding:"8px 16px", background:"#fff", color:"#dc2626", border:"1.5px solid #fecaca", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>🧾 Export PDF</button>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                    <StatCard label="Tests reçus"       value={rapportStats.total}     icon="📥" color={PRIMARY_COLOR} />
                    <StatCard label="À corriger"         value={rapportStats.aCorriger} icon="⏳" color="#d97706" />
                    <StatCard label="Traités"            value={rapportStats.traites}   icon="✅" color="#16a34a" />
                    <StatCard label="Convertis"          value={rapportStats.converti} icon="🎯" color="#7c3aed" sub={`${rapportStats.total?Math.round((rapportStats.converti/rapportStats.total)*100):0}% de conversion`} />
                  </div>

                  {/* Répartition par niveau */}
                  <div style={{ background:"#fff", borderRadius:12, padding:22, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ fontWeight:800, fontSize:14, marginBottom:16 }}>📊 Répartition par niveau CECR</div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      {NIVEAUX_CECR.map(n=>{
                        const count = list.filter(t=>t.level===n).length;
                        const color = NIVEAUX_COLOR[n]||PRIMARY_COLOR;
                        return (
                          <div key={n} style={{ flex:"1 1 80px", background:color+"10", borderRadius:10, padding:"14px 12px", border:`1.5px solid ${color}30`, textAlign:"center" }}>
                            <div style={{ fontSize:22, fontWeight:900, color }}>{n}</div>
                            <div style={{ fontSize:20, fontWeight:800, color, marginTop:4 }}>{count}</div>
                            <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>test{count>1?"s":""}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Taux de correction manuelle */}
                  <div style={{ background:"#fff", borderRadius:12, padding:22, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ fontWeight:800, fontSize:14, marginBottom:16 }}>🧠 Traitement automatique vs manuel</div>
                    {[
                      { label:"Notés automatiquement (IA)", count: list.filter(t=>t.correction_statut==="auto").length, color:"#16a34a" },
                      { label:"Corrigés manuellement",       count: list.filter(t=>t.correction_statut==="corrige").length, color:"#7c3aed" },
                      { label:"En attente de correction",    count: list.filter(t=>t.correction_statut==="en_attente").length, color:"#d97706" },
                    ].map(s => {
                      const pct = list.length ? Math.round((s.count/list.length)*100) : 0;
                      return (
                        <div key={s.label} style={{ marginBottom:12 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
                            <span style={{ fontWeight:600 }}>{s.label}</span>
                            <span style={{ color:s.color, fontWeight:700 }}>{s.count} <span style={{ color:"#94a3b8", fontWeight:400 }}>({pct}%)</span></span>
                          </div>
                          <div style={{ height:6, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:s.color, borderRadius:3 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Par source */}
                  <div style={{ background:"#fff", borderRadius:12, padding:22, border:"1px solid #f1f5f9", boxShadow:"0 1px 6px rgba(0,0,0,.05)" }}>
                    <div style={{ fontWeight:800, fontSize:14, marginBottom:14 }}>📋 Tests par source</div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      {sources.length === 0 ? <div style={{ fontSize:12, color:"#94a3af" }}>Aucun test.</div> : sources.map(src=>{
                        const count = list.filter(t=>(t.source||"online")===src).length;
                        return (
                          <div key={src} style={{ flex:"1 1 120px", background:"#f8fafc", borderRadius:10, padding:"12px 14px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                            <div style={{ fontSize:12, color:"#64748b" }}>{src === "online" ? "En ligne" : src === "oral" ? "Oral (assistante)" : src}</div>
                            <div style={{ fontSize:24, fontWeight:900, color:PRIMARY_COLOR, marginTop:4 }}>{count}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </>
                  );
                })()}
              </div>
            )}

            {/* ══════ TEST DE NIVEAU ══════ */}
            {activeTab === "test_niveau" && <TestsNiveauTab peut={peut} tabs={["tests", "statistiques"]} />}

            {/* ══════════════ RÉSULTATS CANDIDATS ══════════════ */}
            {/* Tous les candidats testés (en_attente inclus) - l'agent placement corrige ici
                un test exactement comme la commerciale (openDetail/handleCorriger). */}
            {activeTab === "resultats_candidats" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                  <input placeholder="🔍 Rechercher nom, email…" value={searchQ} onChange={e=>{setSearchQ(e.target.value);setResultatsPage(1);}} style={{ ...inputSt, width:220 }} />
                  <label style={{ fontSize:12, color:"#64748b", display:"flex", alignItems:"center", gap:4 }}>Du
                    <input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setResultatsPage(1);}} style={inputSt} />
                  </label>
                  <label style={{ fontSize:12, color:"#64748b", display:"flex", alignItems:"center", gap:4 }}>Au
                    <input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setResultatsPage(1);}} style={inputSt} />
                  </label>
                  {(dateFrom || dateTo) && (
                    <button onClick={()=>{setDateFrom("");setDateTo("");setResultatsPage(1);}} style={{ ...selectSt, cursor:"pointer", color:"#dc2626" }}>✕ Réinitialiser dates</button>
                  )}
                  <div style={{ fontSize:12, color:"#64748b", marginLeft:"auto" }}>{testsResultats.length} candidat(s)</div>
                </div>
                {tests === null ? (
                  <div style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:14 }}>Chargement…</div>
                ) : testsResultats.length === 0 ? (
                  <div style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:14 }}>Aucun candidat trouvé</div>
                ) : (
                <>
                {testsResultatsPage.map(t=>{
                  const nc = NIVEAUX_COLOR[t.level]||PRIMARY_COLOR;
                  return (
                    <div key={t.id} onClick={()=>openDetail(t)} style={{ background:"#fff", borderRadius:12, padding:"16px 20px", border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,.04)", cursor:"pointer" }}
                      onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                      onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:14 }}>{t.fullname||"-"}
                            <span style={{ fontSize:11, color:"#94a3b8", fontWeight:400, marginLeft:8 }}>{t.email}</span>
                          </div>
                          <div style={{ fontSize:12, color:"#64748b", marginTop:3 }}>{t.profile||"-"} · {t.source} · {formatDateTime(t.submitted_at)}</div>
                          {t.notes_oral && (
                            <div style={{ marginTop:10, padding:"8px 12px", background:"#f0f9ff", borderRadius:8, fontSize:12, color:"#0369a1", borderLeft:"3px solid #0891b2" }}>
                              💬 {t.notes_oral}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginBottom:6 }}>
                            {t.correction_statut==="en_attente"
                              ? <Badge label="À corriger" color="#d97706" bg="#fef3c7" />
                              : <Badge label={`Niveau ${t.level}`} color={nc} bg={nc+"18"} />}
                            <Badge label={`Score ${t.score}%`} color="#64748b" bg="#f3f4f6" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {resultatsTotalPages > 1 && (
                  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginTop:6 }}>
                    <button onClick={()=>setResultatsPage(p=>Math.max(1,p-1))} disabled={resultatsSafePage===1}
                      style={{ padding:"4px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:resultatsSafePage===1?"default":"pointer", color:resultatsSafePage===1?"#d1d5db":"#374151", fontWeight:700, fontSize:12 }}>‹</button>
                    {Array.from({length:resultatsTotalPages},(_,i)=>(
                      <button key={i} onClick={()=>setResultatsPage(i+1)}
                        style={{ padding:"4px 10px", borderRadius:7, border:`1.5px solid ${i+1===resultatsSafePage?PRIMARY_COLOR:"#e2e8f0"}`, background:i+1===resultatsSafePage?PRIMARY_COLOR+"18":"#fff", color:i+1===resultatsSafePage?PRIMARY_COLOR:"#374151", fontWeight:700, fontSize:12, cursor:"pointer" }}>{i+1}</button>
                    ))}
                    <button onClick={()=>setResultatsPage(p=>Math.min(resultatsTotalPages,p+1))} disabled={resultatsSafePage===resultatsTotalPages}
                      style={{ padding:"4px 12px", borderRadius:7, border:"1.5px solid #e2e8f0", background:"#fff", cursor:resultatsSafePage===resultatsTotalPages?"default":"pointer", color:resultatsSafePage===resultatsTotalPages?"#d1d5db":"#374151", fontWeight:700, fontSize:12 }}>›</button>
                  </div>
                )}
                </>
                )}
              </div>
            )}

            {/* ══════ NOTIFICATIONS ══════ */}
            {activeTab === "notifications" && (
              <div style={{ padding:"24px 0" }}>
                <NotificationsTab userId={profil?.id} accentColor="#0891b2" />
              </div>
            )}

          </div>{/* fin padding 24 */}
        </div>{/* fin white card */}
      </div>{/* fin outer padding */}

      {/* ══ MODAL DÉTAIL / CORRECTION ══ */}
      {showDetail && selected && (
        <Modal title={`🧪 Test de placement - ${selected.fullname||"-"}`} onClose={()=>setShowDetail(false)} wide>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

            {/* Profil prospect */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                { l:"Nom complet",  v:selected.fullname||"-" },
                { l:"Email",        v:selected.email||"-" },
                { l:"Téléphone",    v:selected.phone||"-" },
                { l:"Profil",       v:selected.profile||"-" },
                { l:"Format",       v:selected.format_test||"-" },
                { l:"Date soumis",  v:formatDateTime(selected.submitted_at) },
              ].map(f=>(
                <div key={f.l} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ fontSize:10, color:"#94a3b8", fontWeight:600 }}>{f.l}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginTop:2 }}>{f.v}</div>
                </div>
              ))}
            </div>

            {/* Score + niveau */}
            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1, background:`${NIVEAUX_COLOR[selected.level]||PRIMARY_COLOR}12`, border:`1.5px solid ${NIVEAUX_COLOR[selected.level]||PRIMARY_COLOR}30`, borderRadius:10, padding:"14px 18px", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#64748b" }}>Score</div>
                <div style={{ fontSize:36, fontWeight:900, color:NIVEAUX_COLOR[selected.level]||PRIMARY_COLOR }}>{selected.score}%</div>
                <div style={{ fontSize:11, color:"#94a3b8" }}>{selected.correct_answers}/{selected.total_questions} bonnes réponses</div>
              </div>
              <div style={{ flex:1, background:"#f0f9ff", border:"1.5px solid #bae6fd", borderRadius:10, padding:"14px 18px", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#64748b" }}>Niveau {selected.correction_statut!=="en_attente"?"attribué":selected.level&&selected.level!=="En attente"?"(auto - à valider)":"(à définir)"}</div>
                <div style={{ fontSize:36, fontWeight:900, color:NIVEAUX_COLOR[selected.level]||PRIMARY_COLOR }}>{selected.level||"-"}</div>
              </div>
            </div>

            {/* Performance par catégorie (si disponible) */}
            {selected.by_category && Object.keys(selected.by_category).length > 0 && (
              <div>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>📋 Performance par catégorie</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {Object.entries(selected.by_category).map(([cat,val]) => {
                    const pct = typeof val === "object" ? Math.round((val.correct/Math.max(1,val.total))*100) : val;
                    return <div key={cat} style={{ padding:"8px 14px", borderRadius:10, background:"#f3f4f6", color:"#374151", fontSize:12, fontWeight:700 }}>{cat} : {pct}%</div>;
                  })}
                </div>
              </div>
            )}

            {/* Détail question par question (QCM, vrai/faux, texte à trous, lecture…) -
                exclut le speaking, déjà couvert par la section audio ci-dessous. */}
            {Array.isArray(selected.answers_details) && selected.answers_details.filter(a => a.type !== "speaking").length > 0 && (
              <div>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>📝 Détail des réponses</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {selected.answers_details.filter(a => a.type !== "speaking").map((a, i) => {
                    const estLibre = a.type === "libre";
                    const correct = a.is_correct === true;
                    const incorrect = a.is_correct === false;
                    return (
                      <div key={a.question_id || i} style={{
                        background: correct ? "#f0fdf4" : incorrect ? "#fef2f2" : "#f8fafc",
                        border: `1px solid ${correct ? "#bbf7d0" : incorrect ? "#fecaca" : "#e2e8f0"}`,
                        borderRadius:10, padding:"10px 14px",
                      }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#0f172a", flex:1 }}>
                            {i+1}. {a.question_text || a.text || "-"}
                          </div>
                          <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                            {a.category && <Badge label={a.category} color="#64748b" bg="#f3f4f6" />}
                            {a.cefr && <Badge label={a.cefr} color={NIVEAUX_COLOR[a.cefr]||PRIMARY_COLOR} bg={(NIVEAUX_COLOR[a.cefr]||PRIMARY_COLOR)+"18"} />}
                            {!estLibre && (correct
                              ? <Badge label="✅ Correct" color="#16a34a" bg="#dcfce7" />
                              : incorrect ? <Badge label="❌ Incorrect" color="#dc2626" bg="#fee2e2" /> : null)}
                          </div>
                        </div>
                        <div style={{ marginTop:6, fontSize:12, color:"#374151" }}>
                          <strong>Réponse donnée :</strong> {a.user_answer || <span style={{ color:"#94a3b8" }}>-</span>}
                        </div>
                        {!estLibre && a.correct_answer && (
                          <div style={{ marginTop:2, fontSize:12, color:"#374151" }}>
                            <strong>Réponse attendue :</strong> {a.correct_answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Enregistrements Speaking */}
            {selected.audio_answers && Object.keys(selected.audio_answers).length > 0 && (
              <div>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:2 }}>🎙️ Réponses vocales</div>
                {selected.correction_statut === "en_attente" && (
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8 }}>Note indicative par question - le score et le niveau final restent à choisir ci-dessous.</div>
                )}
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {Object.entries(selected.audio_answers).map(([qId,url],i) => {
                    if (!url) return null;
                    const sn = speakingNotes[qId] || { note:"", score:"" };
                    const setSN = (patch) => setSpeakingNotes(s => ({ ...s, [qId]: { ...sn, ...patch } }));
                    return (
                      <div key={qId} style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, padding:"10px 14px" }}>
                        <div style={{ fontSize:12, color:"#166534", fontWeight:600, marginBottom:6 }}>🎙️ Enregistrement {i+1}</div>
                        <audio controls src={url} crossOrigin="anonymous" style={{ width:"100%", marginBottom: selected.correction_statut === "en_attente" ? 8 : 0 }} />
                        {selected.correction_statut === "en_attente" && (
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 100px", gap:8 }}>
                            <input
                              placeholder="Note d'évaluation (prononciation, fluidité, vocabulaire…)"
                              value={sn.note}
                              onChange={e => setSN({ note: e.target.value })}
                              style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #86efac", fontSize:12 }}
                            />
                            <input
                              type="number" min={0} max={100} placeholder="Score %"
                              value={sn.score}
                              onChange={e => setSN({ score: e.target.value === "" ? "" : Number(e.target.value) })}
                              style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #86efac", fontSize:12 }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selected.correction_statut === "en_attente" || editingResultat ? (
              <>
                {/* Formulaire de correction manuelle */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Niveau CECR à attribuer *</label>
                    <select value={niveauChoisi} onChange={e=>setNiveauChoisi(e.target.value)} style={{ padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:14, fontWeight:700, width:"100%" }}>
                      <option value="">– Choisir –</option>
                      {NIVEAUX_CECR.map(n=><option key={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Score (%)</label>
                    <input type="number" min={0} max={100} value={scoreChoisi} onChange={e=>setScoreChoisi(Number(e.target.value))} style={{ padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:14, fontWeight:700, width:"100%", boxSizing:"border-box" }} />
                  </div>
                </div>

                {/* Score suggéré, purement indicatif - combine le score QCM déjà calculé (sur
                    les questions auto-corrigeables) et la moyenne des scores speaking notés
                    ci-dessus, pondérés par le nombre de questions de chaque type. Ne modifie
                    jamais le champ Score : l'agent décide seul du score final. */}
                {(() => {
                  const nSpeakingTotal = Object.keys(selected.audio_answers || {}).length;
                  const nLibre = (Array.isArray(selected.answers_details) ? selected.answers_details : []).filter(a => a.type === "libre").length;
                  const nGradable = Math.max(0, (selected.total_questions || 0) - nSpeakingTotal - nLibre);
                  const scored = Object.values(speakingNotes || {}).filter(v => v?.score !== "" && v?.score != null && !isNaN(Number(v.score)));
                  if (scored.length === 0) return null;
                  const speakingAvg = scored.reduce((s,v)=>s+Number(v.score),0) / scored.length;
                  const qcmScore = Number(selected.score) || 0;
                  const totalWeight = nGradable + scored.length;
                  if (totalWeight === 0) return null;
                  const suggested = Math.round((qcmScore * nGradable + speakingAvg * scored.length) / totalWeight);
                  return (
                    <div style={{ fontSize:11, color:"#0369a1", background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:6, padding:"6px 10px" }}>
                      💡 Score suggéré : <strong>{suggested}%</strong> (QCM {qcmScore}% sur {nGradable} question{nGradable>1?"s":""} + speaking {Math.round(speakingAvg)}% sur {scored.length} notée{scored.length>1?"s":""}) - n'écrase pas le champ Score, à ajuster toi-même si tu es d'accord.
                    </div>
                  );
                })()}

                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:5 }}>Notes de correction</label>
                  <textarea
                    rows={3}
                    placeholder="Ex : Accent francophone marqué, recommander B1 intensif avec focus expression orale…"
                    value={notesOral}
                    onChange={e=>setNotesOral(e.target.value)}
                    style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:FF, resize:"vertical", boxSizing:"border-box" }}
                  />
                </div>

                <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                  <button
                    onClick={()=> editingResultat ? setEditingResultat(false) : setShowDetail(false)}
                    disabled={saving}
                    style={{ padding:"9px 18px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}
                  >Annuler</button>
                  <button onClick={handleCorriger} disabled={saving || !niveauChoisi || !peut("examens","update")} title={permBtnTitle(`Enregistrer le niveau ${niveauChoisi||""}`, peut("examens","update"))} style={permBtnStyle({ padding:"9px 20px", background:"#16a34a", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("examens","update"))}>
                    {saving ? "⏳ Enregistrement…" : `${peut("examens","update")?"✅":"🔒"} Enregistrer le niveau ${niveauChoisi||""}`}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                <button onClick={()=>setShowDetail(false)} style={{ padding:"9px 18px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, cursor:"pointer", background:"#fff" }}>Fermer</button>
                <button disabled={!peut("examens","update")} title={permBtnTitle("Modifier le niveau/score", peut("examens","update"))} onClick={()=>setEditingResultat(true)} style={permBtnStyle({ padding:"9px 20px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }, peut("examens","update"))}>
                  {peut("examens","update") ? "✏️ Modifier" : "🔒 Modifier"}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
      <FooterSaaS couleurTheme={PRIMARY_COLOR} />
    </div>
  );
}
