// src/Pages/GestionnaireDashboard/GestionnaireDashboard.jsx
// Route : <Route path="/gestionnaire-dashboard" element={<GestionnaireDashboard />} />

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { clearAllSessionStorage } from "../../utils/session";
import { useLivePermissions } from "../../utils/permissions";
import { openElearningSSO } from "../../utils/ssoElearning";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RangeePastilles } from "../../Components/BarreFiltres";
import NotificationBell from "../../Components/NotificationBell";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import { useNotifPoller } from "../../hooks/useNotifPoller";
import { exporterExcelStyle } from "../../utils/exporterExcel";
import NotificationsTab from "../../Components/NotificationsTab";
import { useLanguage } from "../../contexts/LanguageContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import FooterSaaS from "../../Components/FooterSaaS";
import { assombrirCouleur } from "../../utils/couleurs";
import { useTabState } from "../../hooks/useTabState";
import { useNotifications } from "../../hooks/useNotifications";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";

import { uploadFichier } from "../../utils/uploadFichier";
import VisionneuseImage from "../../Components/VisionneuseImage";
/* ═══════════════════════════════════════════════════════
   CONSTANTES (chartre BET – version EspaceApprenant)
═══════════════════════════════════════════════════════ */
const API_URL          = process.env.REACT_APP_API_URL || "http://localhost:5001";
const ELEARNING_URL    = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";
const PRIMARY_COLOR    = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur||"#dc2626"; } catch { return "#dc2626"; } })();
const PRIMARY_DARK     = PRIMARY_COLOR;
const PRIMARY_LIGHT    = PRIMARY_COLOR + "18";
const GRADIENT_HEADER  = `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(PRIMARY_COLOR)} 100%)`;
const authHdrs = () => ({ "Content-Type":"application/json", Authorization:`Bearer ${localStorage.getItem("admin_token")}` });

const STATUT_BADGE = (statut) => {
  const s = (statut||"").toLowerCase();
  if (["valide","finalise","confirmee","confirmée","validé","validee","payee","payée","traitee","traitée","resolue","résolue","fermee","fermée"].includes(s)) return { bg:"#dcfce7", c:"#166534" };
  if (["refuse","refusée","refusee","annulee","annulée","rejetee","rejetée"].includes(s)) return { bg:"#fee2e2", c:"#991b1b" };
  if (["en_cours","en cours"].includes(s)) return { bg:"#dbeafe", c:"#1e40af" };
  return { bg:"#fef3c7", c:"#92400e" }; // en_attente / nouveau / ouverte / par défaut
};
const th = { padding:"8px 10px", textAlign:"left", fontWeight:700, color:"#6b7280", textTransform:"uppercase", letterSpacing:"0.03em" };

/* ═══════════════════════════════════════════════════════
   COMPOSANTS RÉUTILISABLES (identiques à EspaceApprenant)
═══════════════════════════════════════════════════════ */
const StatCard = ({ label, value, color, icon, sub, onClick }) => (
  <div onClick={onClick} style={{ background:"#fff", padding:16, borderRadius:12, boxShadow:"0 1px 6px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:12, cursor:onClick?"pointer":"default", transition:"transform .15s", border:"1px solid #f1f5f9" }}>
    <div style={{ width:46, height:46, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{icon}</div>
    <div style={{ minWidth:0 }}>
      <div style={{ fontSize:11, color:"#9ca3af" }}>{label}</div>
      <div style={{ fontSize:21, fontWeight:800, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{sub}</div>}
    </div>
  </div>
);

const ProgressBar = ({ value, color = PRIMARY_COLOR, height = 7 }) => (
  <div style={{ height, background:"#e5e7eb", borderRadius:height, overflow:"hidden" }}>
    <div style={{ height:"100%", width:`${Math.min(100, value)}%`, background:color, borderRadius:height, transition:"width .4s" }} />
  </div>
);

const Modal = ({ title, onClose, children, wide }) => (
  <div style={modalOverlay}>
    <div style={{ ...modalBox, width: wide ? 680 : 520, maxHeight:"90vh", overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <h3 style={{ margin:0, fontSize:16 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const OFFRE_LIST = ["Anglais Adulte", "Anglais Enfant", "Formation Entreprise", "Certification TOEIC", "Business English"];
const PROFIL_LIST = ["Particulier", "Entreprise", "Étudiant"];

const MOIS_LABELS_6 = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
const DERNIERS_MOIS_6 = Array.from({ length: 6 }, (_, i) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
  return { label: `${MOIS_LABELS_6[d.getMonth()+1]} ${d.getFullYear()}`, prefix: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` };
});

/* ═══════════════════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════════════════ */
export default function GestionnaireDashboard() {
  const navigate = useNavigate();
  const profilInitial = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const { profil, peut } = useLivePermissions(profilInitial);
  const prenom = profil?.prenom || profil?.first_name || "";
  const nom    = profil?.nom    || profil?.last_name  || "";
  const nomComplet = [prenom, nom].filter(Boolean).join(" ") || profil?.email || "Gestionnaire";
  // Le surnom devient le titre du dashboard ; nomComplet reste affiche juste en dessous
  // et garde sa valeur partout ailleurs (listes, exports), ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales  = [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "GS";
  const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
  const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";
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
        if (freshColor && freshColor !== PRIMARY_COLOR) window.location.reload();
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  useNotifPoller({ userId: profil?.id, sources: ["inscriptions"] });

  const [activeTab, setActiveTab] = useTabState("dashboard");
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
  // null = pas encore chargé (distinct de [] = chargé mais vide)
  const [dossiers, setDossiers] = useState(null);
  const [paiements, setPaiements] = useState(null);
  const [requetes, setRequetes] = useState(null);
  const [inscriptions, setInscriptions] = useState(null);
  const [detailItem, setDetailItem] = useState(null); // { titre, rows:[[label,val]] } - modal détail lecture seule

  // Filtres
  const [periode, setPeriode] = useState("toutes"); // toutes, semaine, mois, trimestre, année
  const [filtreOffre, setFiltreOffre] = useState("Toutes");
  const [filtreProfil, setFiltreProfil] = useState("Tous");
  const [searchTerm, setSearchTerm] = useState("");

  // Planification d'envoi
  const [showPlanifModal, setShowPlanifModal] = useState(false);
  const [planifConfig, setPlanifConfig] = useState({ frequence: "hebdomadaire", emails: "", format: "pdf" });

  const formatMoney = (val) => (val||0).toLocaleString("fr-FR") + " FCFA";
  const formatDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" }) : "-";

  /* ── Chargement des données réelles ── */
  useEffect(() => {
    fetch(`${API_URL}/api/parcours/assignations`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { assignations: [] })
      .then(d => setDossiers((d.assignations||[]).map(a => ({
        id: a.id,
        client: a.prospect_nom || `${a.prenom_enfant||""} ${a.nom_enfant||""}`.trim() || "-",
        type: a.type_cours || "-",
        statut: a.statut || "en_attente",
        date: a.created_at,
        montant: a.montant_paye || 0,
        _raw: a,
      }))))
      .catch(() => setDossiers([]));

    fetch(`${API_URL}/api/paiements/all`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { paiements: [] })
      .then(d => setPaiements((d.paiements||[]).map(p => ({
        id: p.id,
        client: p.client || "-",
        montant: p.montant_recu || 0,
        moyen: p.mode_paiement || "-",
        date: p.date_paiement,
        statut: p.statut || "-",
        _raw: p,
      }))))
      .catch(() => setPaiements([]));

    fetch(`${API_URL}/api/plaintes`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { plaintes: [] })
      .then(d => setRequetes((d.plaintes||[]).map(p => ({
        id: p.id,
        client: p.apprenant_nom || "-",
        sujet: p.objet || "-",
        statut: p.statut || "ouverte",
        date: p.created_at,
        priorite: p.priorite || "normale",
        _raw: p,
      }))))
      .catch(() => setRequetes([]));

    fetch(`${API_URL}/api/inscriptions/all`, { headers: authHdrs() })
      .then(r => r.ok ? r.json() : { adultes: [], enfants: [], etudiants: [] })
      .then(d => {
        const adultes   = (d.adultes||[]).map(a => ({ id:`a-${a.id}`, nom: a.nom_complet||"-", offre: a.offre_titre||"-", date: a.created_at, statut: a.statut||"nouveau", _raw: a }));
        const enfants   = (d.enfants||[]).map(e => ({ id:`e-${e.id}`, nom: `${e.prenom_enfant||""} ${e.nom_enfant||""}`.trim()||"-", offre: `Enfant (${e.tranche_age||"-"})`, date: e.created_at, statut: e.statut||"nouveau", _raw: e }));
        const etudiants = (d.etudiants||[]).map(e => ({ id:`t-${e.id}`, nom: `${e.prenom||""} ${e.nom||""}`.trim()||"-", offre: e.etablissement||"Étudiant", date: e.created_at, statut: e.statut||"nouveau", _raw: e }));
        setInscriptions([...adultes, ...enfants, ...etudiants].sort((x,y)=> new Date(y.date||0) - new Date(x.date||0)));
      })
      .catch(() => setInscriptions([]));
  }, []);

  // Filtrage par période
  const filterByPeriode = (data, dateField) => {
    if (periode === "toutes") return data;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return data.filter(item => {
      if (!item[dateField]) return false;
      const d = new Date(item[dateField]);
      if (periode === "semaine") {
        const oneWeekAgo = new Date(); oneWeekAgo.setDate(now.getDate() - 7);
        return d >= oneWeekAgo;
      } else if (periode === "mois") {
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      } else if (periode === "trimestre") {
        const quarter = Math.floor(currentMonth / 3);
        const itemQuarter = Math.floor(d.getMonth() / 3);
        return itemQuarter === quarter && d.getFullYear() === currentYear;
      } else if (periode === "annee") {
        return d.getFullYear() === currentYear;
      }
      return true;
    });
  };

  // Données filtrées (null tant que non chargées → [] pour ne rien casser à l'affichage)
  const filteredDossiers = useMemo(() => {
    let filtered = [...(dossiers||[])];
    filtered = filterByPeriode(filtered, "date");
    return filtered;
  }, [dossiers, periode]);

  const filteredPaiements = useMemo(() => {
    let filtered = [...(paiements||[])];
    filtered = filterByPeriode(filtered, "date");
    return filtered;
  }, [paiements, periode]);

  const filteredRequetes = useMemo(() => {
    let filtered = [...(requetes||[])];
    filtered = filterByPeriode(filtered, "date");
    return filtered;
  }, [requetes, periode]);

  const filteredInscriptions = useMemo(() => {
    let filtered = [...(inscriptions||[])];
    if (filtreOffre !== "Toutes") filtered = filtered.filter(i => i.offre === filtreOffre);
    filtered = filterByPeriode(filtered, "date");
    if (searchTerm) filtered = filtered.filter(i => i.nom.toLowerCase().includes(searchTerm.toLowerCase()));
    return filtered;
  }, [inscriptions, filtreOffre, periode, searchTerm]);

  // Stats (calculées sur les listes brutes, pas filtrées par période, pour rester cohérentes avec le header)
  const stats = useMemo(() => ({
    dossiersEnCours: (dossiers||[]).filter(d => d.statut === "en_attente").length,
    paiementsJour: (paiements||[]).filter(p => (p.date||"").slice(0,10) === new Date().toISOString().slice(0,10)).reduce((s,p)=>s+p.montant,0),
    requetesEnAttente: (requetes||[]).filter(r => ["ouverte","ouvert"].includes(r.statut)).length,
    inscriptionsRecentes: (inscriptions||[]).length,
  }), [dossiers, paiements, requetes, inscriptions]);

  // Évolution des dossiers - 6 derniers mois (données réelles)
  const dossiersParMois = useMemo(() => DERNIERS_MOIS_6.map(m => ({
    label: m.label,
    count: (dossiers||[]).filter(d => (d.date||"").startsWith(m.prefix)).length,
  })), [dossiers]);

  // Exports - on exclut id/_raw (champs techniques, pas destinés à l'export)
  const cleanRow = (r) => { const { id, _raw, ...rest } = r; return rest; };

  const exportExcel = (data, filename) => {
    if (!data.length) { toast.error("Aucune donnée à exporter"); return; }
    const rows = data.map(cleanRow);
    const headers = Object.keys(rows[0] || {});
    exporterExcelStyle({
      nomFichier: filename,
      titre: `📊 Export - ${filename}`,
      sousTitre: `${rows.length} ligne${rows.length>1?'s':''} · Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      couleurEntete: '6366F1',
      colonnes: headers.map(h => ({ label: h, width: 20 })),
      lignes: rows.map(r => headers.map(h => r[h] ?? "")),
    });
    toast.success(`Export ${filename}.xlsx effectué`);
  };

  const exportPDF = (data, title) => {
    if (!data.length) { toast.error("Aucune donnée à exporter"); return; }
    const rows = data.map(cleanRow);
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>${title}</title>
      <style>body{font-family:sans-serif; padding:20px;} table{border-collapse:collapse; width:100%} th,td{border:1px solid #ccc; padding:8px; text-align:left}</style>
      </head><body><h1>${title}</h1><table><thead><tr>${Object.keys(rows[0] || {}).map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(row=>`<tr>${Object.values(row).map(v=>`<td>${v}</td>`).join("")}</tr>`).join("")}
      </tbody></table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
    toast.success(`Export PDF de ${title} lancé`);
  };

  const handlePlanifierEnvoi = () => {
    toast.success(`Planification enregistrée : envoi ${planifConfig.frequence} au format ${planifConfig.format} vers ${planifConfig.emails}`);
    setShowPlanifModal(false);
  };

  const { notifications: toutesNotifsG, nbNonLues: notifNonLuesG, marquerLue: marquerNotifLueG } = useNotifications(profil?.id);
  const [banderoleFermeeG, setBanderoleFermeeG] = useState(false);
  const notifsBanderoleG = toutesNotifsG.filter(n => !n.lu).slice(0, 3);

  // ── "Mes tâches" - agrège les compteurs "à traiter" déjà calculés
  const tachesDossiersEnAttente = stats.dossiersEnCours;
  const tachesRequetesOuvertes  = stats.requetesEnAttente;
  const tachesTotal = tachesDossiersEnAttente + tachesRequetesOuvertes;

  const tabs = [
    { key: "taches",        label: "Mes tâches",      icon: "✅", badge: tachesTotal || null },
    { key: "dashboard",     label: "Tableau de bord", icon: "📊" },
    { key: "inscriptions",  label: "Inscriptions",    icon: "📝" },
    { key: "dossiers",      label: "Dossiers",        icon: "📂", badge: stats.dossiersEnCours || null },
    { key: "paiements",     label: "Paiements",       icon: "💳" },
    { key: "requetes",      label: "Requêtes",        icon: "🕒", badge: stats.requetesEnAttente || null },
    { key: "exports",       label: "Exports & envois",icon: "📧" },
    { key: "notifications", label: "Notifications",   icon: "🔔", badge: notifNonLuesG || null },
  ];

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:PRIMARY_LIGHT }}>
      <div style={{ flex:"1 1 auto", padding:0, overflowX:"hidden" }}>

        {/* HERO HEADER (identique EspaceApprenant) */}
        <div style={{ background:GRADIENT_HEADER, padding:"28px 32px 0", color:"#fff", position:"relative", overflow:"hidden" }}>
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
                <div style={{ fontSize:11, color:"#fecaca", fontWeight:600, letterSpacing:"0.08em" }}>Bonjour 👋</div>
                <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:"#fff" }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} /></h1>
              {surnomPerso.trim() && nomComplet !== nomAffiche && (
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:1 }}>{nomComplet}</div>
              )}
              <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                onEnregistre={(v) => setSurnomPerso(v || "")} />
                <div style={{ fontSize:12, color:"#fecaca", marginTop:3, fontWeight:600 }}>Gestionnaire - Administratif &amp; finances</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginTop:2 }}>{profil?.email || ""}</div>
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
              <button onClick={handleLogout} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", transition:"background .2s" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
                <span>🚪</span> Déconnexion
              </button>
            </div>
          </div>
          <div style={{ display:"flex", gap:0, background:"rgba(0,0,0,0.15)", borderRadius:"12px 12px 0 0", overflow:"hidden" }}>
            {[
              { l:"Dossiers en cours", v:stats.dossiersEnCours, c:"#f87171" },
              { l:"Paiements du jour", v:formatMoney(stats.paiementsJour), c:"#34d399" },
              { l:"Requêtes en attente", v:stats.requetesEnAttente, c:"#fbbf24" },
            ].map((s, i, arr) => (
              <div key={s.l} style={{ flex:1, textAlign:"center", padding:"14px 8px", borderRight: i < arr.length-1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:3 }}>{s.l}</div>
                <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:"0 24px 24px" }}>
          <div style={{ background:"#fff", padding:24, borderRadius:"12px", boxShadow:"0 2px 8px rgba(0,0,0,0.05)", marginTop:0 }}>
            
            {/* Tabs */}
            <div style={{ display:"flex", gap:3, marginBottom:20, flexWrap:"wrap", borderBottom:"1px solid #e5e7eb", paddingBottom:8 }}>
              {tabs.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                    padding:"8px 14px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer",
                    fontWeight:600, fontSize:12,
                    background: isActive ? PRIMARY_LIGHT : "transparent",
                    color: isActive ? PRIMARY_COLOR : "#6b7280",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                    flex:"1 1 120px", whiteSpace:"nowrap",
                  }}>
                    <span style={{ fontSize:13 }}>{tab.icon}</span>{tab.label}
                    {tab.badge > 0 && <span style={{ background:"#ef4444", color:"#fff", borderRadius:99, fontSize:10, fontWeight:800, padding:"1px 6px" }}>{tab.badge}</span>}
                  </button>
                );
              })}
            </div>

            {!banderoleFermeeG && notifsBanderoleG.length > 0 && (
              <div style={{ padding:"10px 16px", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:8, marginBottom:16, display:"flex", alignItems:"flex-start", gap:10 }}>
                <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🔔</span>
                <div style={{ flex:1, display:"flex", flexDirection:"column", gap:4 }}>
                  {notifsBanderoleG.map(n => (
                    <div key={n.id} onClick={() => { marquerNotifLueG(n.id); setActiveTab("notifications"); }}
                      style={{ cursor:"pointer", display:"flex", flexDirection:"column" }}>
                      <span style={{ fontWeight:700, color:"#9a3412", fontSize:12 }}>{n.titre}</span>
                      <span style={{ color:"#78716c", fontSize:11 }}>{n.message}</span>
                    </div>
                  ))}
                  {notifNonLuesG > notifsBanderoleG.length && (
                    <button onClick={()=>setActiveTab("notifications")} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"#9a3412", fontWeight:700, fontSize:11, cursor:"pointer", padding:0 }}>
                      +{notifNonLuesG - notifsBanderoleG.length} autre{notifNonLuesG - notifsBanderoleG.length > 1 ? "s" : ""} →
                    </button>
                  )}
                </div>
                <button onClick={()=>setBanderoleFermeeG(true)} title="Masquer" style={{ background:"none", border:"none", cursor:"pointer", color:"#9a3412", fontSize:14, flexShrink:0 }}>✕</button>
              </div>
            )}

            {/* Filtres (sauf pour le dashboard, exports et mes tâches) */}
            {(activeTab !== "dashboard" && activeTab !== "exports" && activeTab !== "taches") && (
              <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
                <select value={periode} onChange={e => setPeriode(e.target.value)} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid #e5e7eb", fontSize:12 }}>
                  <option value="toutes">Toutes périodes</option><option value="semaine">Semaine</option><option value="mois">Mois</option><option value="trimestre">Trimestre</option><option value="annee">Année</option>
                </select>
                {activeTab === "inscriptions" && (
                  <>
                    <select value={filtreOffre} onChange={e => setFiltreOffre(e.target.value)} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid #e5e7eb", fontSize:12 }}>
                      <option value="Toutes">Toutes offres</option>
                      {OFFRE_LIST.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <RangeePastilles valeur={filtreProfil} style={{ marginBottom:0 }}
                      onChange={(v) => setFiltreProfil(v)}
                      options={[{ v:"Tous", l:"Tous profils" }, ...PROFIL_LIST.map(x => ({ v:x, l:x }))]} />
                    <input type="text" placeholder="🔍 Nom apprenant..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ padding:"6px 12px", borderRadius:6, border:"1px solid #e5e7eb", fontSize:12, width:200 }} />
                  </>
                )}
                {(periode !== "toutes" || filtreOffre !== "Toutes" || filtreProfil !== "Tous" || searchTerm) && (
                  <button onClick={() => { setPeriode("toutes"); setFiltreOffre("Toutes"); setFiltreProfil("Tous"); setSearchTerm(""); }} style={btnGhost}>Réinitialiser</button>
                )}
              </div>
            )}

            {/* ══ MES TÂCHES ══ */}
            {activeTab === "taches" && (() => {
              const taches = [
                { icon:"📂", label:"Dossiers en attente",  n:tachesDossiersEnAttente, tab:"dossiers" },
                { icon:"🕒", label:"Requêtes ouvertes",     n:tachesRequetesOuvertes,  tab:"requetes" },
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

            {/* TABLEAU DE BORD */}
            {activeTab === "dashboard" && (
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
                  <StatCard label="Dossiers en cours" value={dossiers===null ? "…" : stats.dossiersEnCours} color={PRIMARY_COLOR} icon="📂" sub="à traiter" />
                  <StatCard label="Paiements du jour" value={paiements===null ? "…" : formatMoney(stats.paiementsJour)} color="#22c55e" icon="💳" sub={paiements===null ? "" : `${paiements.filter(p => (p.date||"").slice(0,10) === new Date().toISOString().slice(0,10)).length} transactions`} />
                  <StatCard label="Requêtes en attente" value={requetes===null ? "…" : stats.requetesEnAttente} color="#ef4444" icon="🕒" sub="non traitées" />
                  <StatCard label="Inscriptions récentes" value={inscriptions===null ? "…" : inscriptions.length} color="#f59e0b" icon="📝" sub="total" />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:16 }}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>📊 Évolution des dossiers (6 derniers mois)</div>
                    {dossiers===null ? <div style={{ fontSize:12, color:"#9ca3af", padding:"20px 0", textAlign:"center" }}>Chargement…</div> : (
                      <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:100 }}>
                        {(() => { const max = Math.max(1, ...dossiersParMois.map(m=>m.count)); return dossiersParMois.map((m,idx)=>(
                          <div key={idx} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }} title={`${m.label} : ${m.count}`}>
                            <div style={{ fontSize:9, color:"#6b7280", marginBottom:2 }}>{m.count}</div>
                            <div style={{ height:`${Math.round(m.count/max*80)}px`, width:"100%", background:PRIMARY_COLOR, borderRadius:"4px 4px 0 0", minHeight:2 }} />
                            <span style={{ fontSize:8, marginTop:4, color:"#9ca3af" }}>{m.label}</span>
                          </div>
                        )); })()}
                      </div>
                    )}
                  </div>
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:16 }}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>📋 Répartition des requêtes par priorité</div>
                    {requetes===null ? <div style={{ fontSize:12, color:"#9ca3af", padding:"20px 0", textAlign:"center" }}>Chargement…</div> : requetes.length===0 ? <div style={{ fontSize:12, color:"#9ca3af", padding:"20px 0", textAlign:"center" }}>Aucune requête.</div> : [
                      { l:"Haute", val:requetes.filter(r=>r.priorite==="haute").length, color:"#ef4444" },
                      { l:"Moyenne", val:requetes.filter(r=>["moyenne","normale"].includes(r.priorite)).length, color:"#f59e0b" },
                      { l:"Basse", val:requetes.filter(r=>r.priorite==="basse").length, color:"#22c55e" },
                    ].map(p => (
                      <div key={p.l} style={{ marginBottom:8 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:2 }}><span>{p.l}</span><span>{p.val}</span></div>
                        <ProgressBar value={(p.val/requetes.length)*100} color={p.color} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* DOSSIERS */}
            {activeTab === "dossiers" && (
              <div>
                {dossiers===null ? <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>Chargement…</div> : filteredDossiers.length===0 ? <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>Aucun dossier pour ce filtre.</div> : (
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"#f9fafb", fontSize:12 }}>
                    <th style={th}>Client</th>
                    <th style={th}>Type</th>
                    <th style={th}>Montant</th>
                    <th style={th}>Statut</th>
                    <th style={th}>Date</th>
                    <th style={th}>Action</th>
                  </tr>
                  </thead>
                  <tbody>
                    {filteredDossiers.map(d => {
                      const b = STATUT_BADGE(d.statut);
                      return (
                      <tr key={d.id} style={{ borderTop:"1px solid #e5e7eb", fontSize:12 }}>
                        <td style={{ padding:8 }}>{d.client}</td>
                        <td style={{ padding:8 }}>{d.type}</td>
                        <td style={{ padding:8 }}>{formatMoney(d.montant)}</td>
                        <td style={{ padding:8 }}><span style={{ padding:"2px 8px", borderRadius:10, background:b.bg, color:b.c }}>{d.statut}</span></td>
                        <td style={{ padding:8 }}>{formatDate(d.date)}</td>
                        <td style={{ padding:8 }}><button onClick={()=>setDetailItem({ titre:`Dossier - ${d.client}`, rows:[["Client",d.client],["Type de cours",d.type],["Montant payé",formatMoney(d.montant)],["Statut",d.statut],["Date",formatDate(d.date)]] })} style={btnIconEdit}>Voir</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {/* PAIEMENTS */}
            {activeTab === "paiements" && (
              <div>
                {paiements===null ? <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>Chargement…</div> : filteredPaiements.length===0 ? <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>Aucun paiement pour ce filtre.</div> : (
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr style={{ background:"#f9fafb", fontSize:12 }}>
                    <th style={th}>Client</th><th style={th}>Montant</th><th style={th}>Moyen</th><th style={th}>Date</th><th style={th}>Statut</th><th style={th}>Action</th>
                  </tr></thead>
                  <tbody>
                    {filteredPaiements.map(p => {
                      const b = STATUT_BADGE(p.statut);
                      return (
                      <tr key={p.id} style={{ borderTop:"1px solid #e5e7eb", fontSize:12 }}>
                        <td style={{ padding:8 }}>{p.client}</td>
                        <td style={{ padding:8 }}>{formatMoney(p.montant)}</td>
                        <td style={{ padding:8 }}>{p.moyen}</td>
                        <td style={{ padding:8 }}>{formatDate(p.date)}</td>
                        <td style={{ padding:8 }}><span style={{ padding:"2px 8px", borderRadius:10, background:b.bg, color:b.c }}>{p.statut}</span></td>
                        <td style={{ padding:8 }}><button onClick={()=>setDetailItem({ titre:`Paiement - ${p.client}`, rows:[["Client",p.client],["Montant reçu",formatMoney(p.montant)],["Moyen de paiement",p.moyen],["Statut",p.statut],["Date",formatDate(p.date)]] })} style={btnIconEdit}>Détail</button></td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {/* REQUÊTES */}
            {activeTab === "requetes" && (
              <div>
                {requetes===null ? <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>Chargement…</div> : filteredRequetes.length===0 ? <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>Aucune requête pour ce filtre.</div> : (
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr style={{ background:"#f9fafb", fontSize:12 }}>
                    <th style={th}>Client</th><th style={th}>Sujet</th><th style={th}>Priorité</th><th style={th}>Statut</th><th style={th}>Date</th><th style={th}>Action</th>
                  </tr></thead>
                  <tbody>
                    {filteredRequetes.map(r => (
                      <tr key={r.id} style={{ borderTop:"1px solid #e5e7eb", fontSize:12, background:r.priorite==="haute"?"#fff5f5":"transparent" }}>
                        <td style={{ padding:8 }}>{r.client}</td>
                        <td style={{ padding:8 }}>{r.sujet}</td>
                        <td style={{ padding:8 }}><span style={{ padding:"2px 8px", borderRadius:10, background:r.priorite==="haute"?"#fee2e2":r.priorite==="moyenne"?"#fef3c7":"#dcfce7", color:r.priorite==="haute"?"#dc2626":r.priorite==="moyenne"?"#92400e":"#166534" }}>{r.priorite}</span></td>
                        <td style={{ padding:8 }}>{r.statut}</td>
                        <td style={{ padding:8 }}>{formatDate(r.date)}</td>
                        <td style={{ padding:8 }}><button onClick={()=>setDetailItem({ titre:`Requête - ${r.client}`, rows:[["Client",r.client],["Sujet",r.sujet],["Priorité",r.priorite],["Statut",r.statut],["Date",formatDate(r.date)],["Description",r._raw?.description||"-"]] })} style={btnIconEdit}>Voir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {/* INSCRIPTIONS */}
            {activeTab === "inscriptions" && (
              <div>
                {inscriptions===null ? <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>Chargement…</div> : filteredInscriptions.length===0 ? <div style={{ textAlign:"center", padding:"40px 0", color:"#9ca3af", fontSize:13 }}>Aucune inscription pour ce filtre.</div> : (
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr style={{ background:"#f9fafb", fontSize:12 }}>
                    <th style={th}>Apprenant</th><th style={th}>Offre</th><th style={th}>Date</th><th style={th}>Statut</th><th style={th}>Action</th>
                  </tr></thead>
                  <tbody>
                    {filteredInscriptions.map(i => {
                      const b = STATUT_BADGE(i.statut);
                      return (
                      <tr key={i.id} style={{ borderTop:"1px solid #e5e7eb", fontSize:12 }}>
                        <td style={{ padding:8 }}>{i.nom}</td>
                        <td style={{ padding:8 }}>{i.offre}</td>
                        <td style={{ padding:8 }}>{formatDate(i.date)}</td>
                        <td style={{ padding:8 }}><span style={{ padding:"2px 8px", borderRadius:10, background:b.bg, color:b.c }}>{i.statut}</span></td>
                        <td style={{ padding:8 }}><button onClick={()=>setDetailItem({ titre:`Inscription - ${i.nom}`, rows:[["Apprenant",i.nom],["Offre",i.offre],["Statut",i.statut],["Date",formatDate(i.date)]] })} style={btnIconEdit}>Voir</button></td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>
            )}

            {/* EXPORTS & PLANIFICATION */}
            {activeTab === "notifications" && (
              <div style={{ padding: "24px 0" }}>
                <NotificationsTab userId={profil?.id} accentColor="#dc2626" />
              </div>
            )}

            {activeTab === "exports" && (
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>📎 Exports manuels</h3>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      <button onClick={() => exportExcel(filteredDossiers, `dossiers_${new Date().toISOString().slice(0,10)}`)} style={btnPrimary}>📊 Dossiers (Excel)</button>
                      <button disabled={!peut("finances","update")} title={permBtnTitle("Paiements (Excel)",peut("finances","update"))} onClick={() => exportExcel(filteredPaiements, `paiements_${new Date().toISOString().slice(0,10)}`)} style={permBtnStyle(btnPrimary,peut("finances","update"))}>{peut("finances","update")?"📊":"🔒"} Paiements (Excel)</button>
                      <button disabled={!peut("support","update")} title={permBtnTitle("Requêtes (Excel)",peut("support","update"))} onClick={() => exportExcel(filteredRequetes, `requetes_${new Date().toISOString().slice(0,10)}`)} style={permBtnStyle(btnPrimary,peut("support","update"))}>{peut("support","update")?"📊":"🔒"} Requêtes (Excel)</button>
                      <button disabled={!peut("inscriptions","manage")} title={permBtnTitle("Inscriptions (Excel)",peut("inscriptions","manage"))} onClick={() => exportExcel(filteredInscriptions, `inscriptions_${new Date().toISOString().slice(0,10)}`)} style={permBtnStyle(btnPrimary,peut("inscriptions","manage"))}>{peut("inscriptions","manage")?"📊":"🔒"} Inscriptions (Excel)</button>
                      <button onClick={() => exportPDF(filteredDossiers, "Rapport_dossiers")} style={btnSecondary}>📄 PDF Dossiers</button>
                    </div>
                  </div>
                  <div style={{ background:"#f8fafc", borderRadius:12, padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>⏱️ Envois automatiques</h3>
                    <p style={{ fontSize:13, color:"#6b7280", marginBottom:16 }}>Planifiez l’envoi de rapports récapitulatifs par email.</p>
                    <button onClick={() => setShowPlanifModal(true)} style={btnPrimary}>📧 Planifier un envoi</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODALE DÉTAIL (lecture seule) */}
        {detailItem && (
          <Modal title={detailItem.titre} onClose={() => setDetailItem(null)}>
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              {detailItem.rows.map(([l,v]) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #f1f5f9", fontSize:13 }}>
                  <span style={{ color:"#6b7280" }}>{l}</span>
                  <span style={{ fontWeight:700, color:"#0f172a", textAlign:"right" }}>{v || "-"}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
              <button onClick={() => setDetailItem(null)} style={btnSecondary}>Fermer</button>
            </div>
          </Modal>
        )}

        {/* MODALE PLANIFICATION */}
        {showPlanifModal && (
          <Modal title="Planifier l'envoi automatique de rapports" onClose={() => setShowPlanifModal(false)}>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div><label style={labelSt}>Fréquence</label><select value={planifConfig.frequence} onChange={e => setPlanifConfig({...planifConfig, frequence: e.target.value})} style={inputSt}><option value="hebdomadaire">Hebdomadaire</option><option value="mensuel">Mensuel</option></select></div>
              <div><label style={labelSt}>Emails destinataires (séparés par des virgules)</label><input type="text" value={planifConfig.emails} onChange={e => setPlanifConfig({...planifConfig, emails: e.target.value})} placeholder="manager@bet.com, rh@entreprise.ci" style={inputSt} /></div>
              <div><label style={labelSt}>Format du rapport</label><select value={planifConfig.format} onChange={e => setPlanifConfig({...planifConfig, format: e.target.value})} style={inputSt}><option value="pdf">PDF</option><option value="excel">Excel (CSV)</option></select></div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:10 }}><button onClick={() => setShowPlanifModal(false)} style={btnSecondary}>Annuler</button><button onClick={handlePlanifierEnvoi} style={btnPrimary}>Enregistrer la planification</button></div>
            </div>
          </Modal>
        )}
      </div>
      <FooterSaaS couleurTheme={PRIMARY_COLOR} />
    </div>
  );
}

/* ═══ STYLES ═══ */
const btnPrimary  = { padding:"9px 16px", background:PRIMARY_COLOR, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnSecondary = { padding:"9px 16px", background:"#e5e7eb", color:"#374151", border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnGhost     = { padding:"5px 10px", background:"none", color:PRIMARY_COLOR, border:"none", borderRadius:6, cursor:"pointer", fontWeight:600, fontSize:12 };
const btnIconEdit  = { padding:"4px 8px", background:PRIMARY_LIGHT, color:PRIMARY_DARK, border:`1px solid ${PRIMARY_COLOR}40`, borderRadius:4, cursor:"pointer", fontSize:11, fontWeight:600 };
const labelSt      = { display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:4 };
const inputSt      = { padding:9, borderRadius:6, border:"1px solid #d1d5db", fontSize:13, width:"100%", boxSizing:"border-box" };
const modalOverlay = { position:"fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000 };
const modalBox     = { background:"#fff", padding:24, borderRadius:14, maxWidth:"92vw" };