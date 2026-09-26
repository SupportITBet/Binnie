// src/Pages/CustomerCareDashboard/CustomerCareDashboard.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RangeePastilles } from "../../Components/BarreFiltres";
import NotificationBell from "../../Components/NotificationBell";
import DashboardColorPicker from "../../Components/DashboardColorPicker";
import NotificationsTab from "../../Components/NotificationsTab";
import MessagerieTab from "../../Components/MessagerieTab";
import { useNotifPoller } from "../../hooks/useNotifPoller";
import { useLanguage } from "../../contexts/LanguageContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import FooterSaaS from "../../Components/FooterSaaS";
import { clearAllSessionStorage } from "../../utils/session";
import { assombrirCouleur } from "../../utils/couleurs";
import { openElearningSSO } from "../../utils/ssoElearning";
import { useLivePermissions } from "../../utils/permissions";
import "../../chartConfig";
import { Line, Doughnut } from "react-chartjs-2";
import { useTabState } from "../../hooks/useTabState";
import { useNotifications } from "../../hooks/useNotifications";
import { useFirebaseChat } from "../../hooks/useFirebaseChat";
import MonProfilModal, { BoutonMonProfil } from "../../Components/MonProfilModal";

import { uploadFichier } from "../../utils/uploadFichier";
import VisionneuseImage from "../../Components/VisionneuseImage";
/* ═══════════════════════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════════════════════ */
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const ELEARNING_URL = process.env.REACT_APP_ELEARNING_URL || "http://localhost:3002";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
});
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "-";
const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const CC_COLOR    = (() => { try { return JSON.parse(localStorage.getItem("admin_profil")||"{}").couleur||"#0e7490"; } catch { return "#0e7490"; } })();
const CC_DARK     = CC_COLOR;
const CC_LIGHT    = CC_COLOR + "18";
const CC_GRADIENT = `linear-gradient(135deg, #0f172a 0%, ${assombrirCouleur(CC_COLOR)} 100%)`;

const PRIORITE_CFG = {
  faible:   { label: "Faible",   color: "#16a34a", bg: "#dcfce7", icon: "🟢", order: 4 },
  normale:  { label: "Normale",  color: "#0891b2", bg: "#e0f2fe", icon: "🔵", order: 3 },
  haute:    { label: "Haute",    color: "#d97706", bg: "#fef3c7", icon: "🟡", order: 2 },
  critique: { label: "Critique", color: "#dc2626", bg: "#fee2e2", icon: "🔴", order: 1 },
};

const STATUT_CFG = {
  ouverte:  { label: "Ouverte",  color: "#dc2626", bg: "#fee2e2", icon: "🔓" },
  en_cours: { label: "En cours", color: "#d97706", bg: "#fef3c7", icon: "⚙️" },
  resolue:  { label: "Résolue",  color: "#16a34a", bg: "#dcfce7", icon: "✅" },
  fermee:   { label: "Fermée",   color: "#6b7280", bg: "#f3f4f6", icon: "🔒" },
};

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

/* ═══════════════════════════════════════════════════════
   COMPOSANTS RÉUTILISABLES
═══════════════════════════════════════════════════════ */
const StatCard = ({ label, value, color, icon, sub, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: "#fff",
      padding: 16,
      borderRadius: 12,
      boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      cursor: onClick ? "pointer" : "default",
      transition: "transform .15s",
      border: "1px solid #f1f5f9",
      flex: 1,
      minWidth: 160,
    }}
  >
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: 10,
        background: color + "18",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color, lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{sub}</div>
      )}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════
   DASHBOARD PRINCIPAL
═══════════════════════════════════════════════════════ */
export default function CustomerCareDashboard() {
  const navigate = useNavigate();
  const profilInitial = JSON.parse(localStorage.getItem("admin_profil") || "null");
  const { profil, peut } = useLivePermissions(profilInitial);
  const prenom = profil?.prenom || "";
  const nom = profil?.nom || "";
  const nomComplet =
    [prenom, nom].filter(Boolean).join(" ") || "Customer Care";
  // Le surnom devient le titre du dashboard ; le nom complet reste juste en dessous et
  // garde sa valeur partout ailleurs, ou l'etat civil fait foi.
  const [surnomPerso, setSurnomPerso] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").surnom || ""; } catch { return ""; }
  });
  const [monProfilOuvert, setMonProfilOuvert] = useState(false);
  const nomAffiche = (surnomPerso || "").trim() || nomComplet;
  const initiales =
    [prenom[0], nom[0]].filter(Boolean).join("").toUpperCase() || "CC";
  const permBtnStyle = (style, allowed) => allowed ? style : { ...style, opacity:0.45, cursor:"not-allowed", filter:"grayscale(70%)" };
  const permBtnTitle = (label, allowed) => allowed ? label : "🔒 Vous n'avez pas la permission pour cette action";

  useNotifPoller({ userId: profil?.id });

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

  // ── Plaintes ──
  const [plaintes, setPlaintes] = useState([]);
  const [plaintesLoading, setPlaintesLoading] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [filtrePriorite, setFiltrePriorite] = useState("tous");
  const [searchQ, setSearchQ] = useState("");
  const [noteResolution, setNoteResolution] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPlaintes = useCallback(async () => {
    setPlaintesLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/plaintes`, {
        headers: authHeaders(),
      });
      const d = await r.json();
      setPlaintes(d.plaintes || []);
    } catch {}
    finally {
      setPlaintesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "plaintes" || activeTab === "dashboard") fetchPlaintes();
  }, [activeTab, fetchPlaintes]);

  const patchPlainte = async (id, updates) => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/plaintes/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      if (!r.ok) throw new Error();
      await fetchPlaintes();
      toast.success("Mis à jour ✓");
    } catch {
      toast.error("Erreur mise à jour");
    } finally {
      setSaving(false);
    }
  };

  // ── KPIs ──
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const kpiOuvertes = useMemo(
    () => plaintes.filter((p) => p.statut === "ouverte").length,
    [plaintes]
  );
  const kpiEnCours = useMemo(
    () => plaintes.filter((p) => p.statut === "en_cours").length,
    [plaintes]
  );
  const kpiResoluesMois = useMemo(
    () =>
      plaintes.filter((p) => {
        if (p.statut !== "resolue") return false;
        const d = new Date(p.date_resolution || p.updated_at || p.created_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      }).length,
    [plaintes, thisMonth, thisYear]
  );
  const kpiTaux = useMemo(() => {
    const total = plaintes.length;
    if (!total) return "-";
    const resolues = plaintes.filter(
      (p) => p.statut === "resolue" || p.statut === "fermee"
    ).length;
    return Math.round((resolues / total) * 100) + "%";
  }, [plaintes]);

  const kpiCritiques = useMemo(
    () => plaintes.filter((p) => ["critique","haute"].includes(p.priorite) && ["ouverte","en_cours"].includes(p.statut)).length,
    [plaintes]
  );

  // ── "Mes tâches" - agrège les compteurs "à traiter" déjà calculés
  const tachesOuvertes = kpiOuvertes;
  const tachesEnCours  = kpiEnCours;
  const tachesTotal    = tachesOuvertes + tachesEnCours;

  const { notifications: toutesNotifsCC, nbNonLues: notifNonLuesCC, marquerLue: marquerNotifLueCC } = useNotifications(profil?.id);
  const { unreadTotal: msgNonLusCC } = useFirebaseChat();
  const [banderoleFermeeCC, setBanderoleFermeeCC] = useState(false);
  const notifsBanderoleCC = toutesNotifsCC.filter(n => !n.lu).slice(0, 3);

  const kpiDelaiMoyen = useMemo(() => {
    const resolues = plaintes.filter((p) => (p.statut === "resolue" || p.statut === "fermee") && p.created_at && (p.date_resolution || p.updated_at));
    if (!resolues.length) return "-";
    const totalJours = resolues.reduce((s, p) => {
      const debut = new Date(p.created_at);
      const fin = new Date(p.date_resolution || p.updated_at);
      return s + Math.max(0, (fin - debut) / 86400000);
    }, 0);
    return `${(totalJours / resolues.length).toFixed(1)} j`;
  }, [plaintes]);

  // Évolution des plaintes - 6 derniers mois (créées vs résolues), données réelles
  const MOIS_LABELS_CC = ["","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
  const plaintesParMois = useMemo(() => {
    const mois = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
      return { label: `${MOIS_LABELS_CC[d.getMonth()+1]} ${d.getFullYear()}`, prefix: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` };
    });
    return mois.map(m => ({
      label: m.label,
      creees: plaintes.filter(p => (p.created_at||"").startsWith(m.prefix)).length,
      resolues: plaintes.filter(p => (p.statut === "resolue" || p.statut === "fermee") && (p.date_resolution||p.updated_at||"").startsWith(m.prefix)).length,
    }));
  }, [plaintes]);

  // Répartition par priorité (donut)
  const repartitionPriorite = useMemo(() => {
    const map = {};
    plaintes.forEach(p => { const k = p.priorite || "normale"; map[k] = (map[k]||0)+1; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }, [plaintes]);

  // ── Filtre et tri ──
  const prioriteOrder = { critique: 1, haute: 2, normale: 3, faible: 4 };

  const plaintesFiltered = useMemo(() => {
    let list = [...plaintes];

    if (filtreStatut !== "tous") {
      list = list.filter((p) => p.statut === filtreStatut);
    }
    if (filtrePriorite !== "tous") {
      list = list.filter((p) => p.priorite === filtrePriorite);
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(
        (p) =>
          (p.apprenant_nom || "").toLowerCase().includes(q) ||
          (p.apprenant_email || "").toLowerCase().includes(q) ||
          (p.objet || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const pa = prioriteOrder[a.priorite] || 3;
      const pb = prioriteOrder[b.priorite] || 3;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return list;
  }, [plaintes, filtreStatut, filtrePriorite, searchQ]);

  // Top 5 plaintes non résolues pour le dashboard
  const plaintesUrgentes = useMemo(() => {
    return [...plaintes]
      .filter((p) => p.statut === "ouverte" || p.statut === "en_cours")
      .sort((a, b) => {
        const pa = prioriteOrder[a.priorite] || 3;
        const pb = prioriteOrder[b.priorite] || 3;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at) - new Date(a.created_at);
      })
      .slice(0, 5);
  }, [plaintes]);

  // ── Déconnexion ──
  const { lang, toggleLang } = useLanguage();
  const confirm = useConfirm();
  const handleLogout = async () => {
    if (!(await confirm('Vous allez être déconnecté(e) de votre session.', { titre: 'Se déconnecter ?', confirmLabel: 'Se déconnecter', danger: false }))) return;
    clearAllSessionStorage();
    navigate("/bet-staff-access");
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
        if (freshColor && freshColor !== CC_COLOR) window.location.reload();
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  /* ══════════════════════════════════════════
     RENDU
  ══════════════════════════════════════════ */
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f0fdfe", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ flexShrink: 0, background: CC_GRADIENT, color: "#fff", padding: "0 24px" }}>
        <div style={{}}>
          {/* Ligne principale */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0 14px" }}>
            {/* Identité */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ position:"relative", flexShrink:0 }} onClick={()=>{ if (avatarUrl) setPhotoProfilOuverte(true); }}>
                <div style={{ width:46, height:46, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:800, overflow:"hidden" , cursor: avatarUrl ? "zoom-in" : "default"}}>
                  {avatarUrl ? <img src={avatarUrl} alt={initiales} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initiales}
                </div>
                {photoProfilOuverte && <VisionneuseImage url={avatarUrl} onClose={()=>setPhotoProfilOuverte(false)} />}
                <label title="Changer la photo" onClick={e=>e.stopPropagation()} style={{ position:"absolute",bottom:0,right:0,width:18,height:18,borderRadius:"50%",background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:10,border:"2px solid #fff" }}>
                  📷<input type="file" accept="image/*" style={{ display:"none" }} onChange={(e)=>{ const f=e.target.files?.[0]; if(f){ uploadFichier(f, "avatar").then(handleAvatarSuccess).catch(e=>{}); } e.target.value=""; }} />
                </label>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{nomAffiche}<BoutonMonProfil onClick={() => setMonProfilOuvert(true)} couleurTexte="#64748b" /></div>
                {surnomPerso.trim() && nomComplet !== nomAffiche && (
                  <div style={{ fontSize:11, color:"#94a3b8" }}>{nomComplet}</div>
                )}
                <MonProfilModal ouvert={monProfilOuvert} onClose={() => setMonProfilOuvert(false)}
                  onEnregistre={(v) => setSurnomPerso(v || "")} />
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {profil?.email || ""}
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>
                  Service Après-Vente · Gestion des plaintes
                </div>
              </div>
            </div>

            {/* Actions header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <NotificationBell userId={profil?.id} accentColor="#fff" />
              <DashboardColorPicker />
              <button onClick={toggleLang} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", transition:"background .2s", letterSpacing:"0.06em" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
                {lang === "FR" ? "🇫🇷 FR" : "🇬🇧 EN"}
              </button>
              {accesElearning && (
                <button type="button" onClick={() => openElearningSSO(ELEARNING_URL)}
                  style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 16px", background:"rgba(8,145,178,0.25)", border:"1.5px solid rgba(8,145,178,0.5)", borderRadius:8, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", transition:"background .2s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(8,145,178,0.45)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(8,145,178,0.25)"}
                  title="Accéder à la plateforme E-Learning BET">
                  <span style={{ fontSize:14 }}>🎓</span> E-Learning
                </button>
              )}
              <button
                onClick={handleLogout}
                style={{
                  padding: "7px 16px", borderRadius: 8,
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                Déconnexion
              </button>
            </div>
          </div>

          {/* Mini-bar stats */}
          <div style={{ display: "flex", gap: 24, paddingBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "Ouvertes", value: kpiOuvertes, color: "#fca5a5" },
              { label: "En cours", value: kpiEnCours, color: "#fde68a" },
              { label: "Résolues (mois)", value: kpiResoluesMois, color: "#86efac" },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: 12, opacity: 0.8 }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Onglets */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { key: "taches",        label: "✅ Mes tâches", badge: tachesTotal || null },
              { key: "dashboard",     label: "🏠 Dashboard" },
              { key: "plaintes",      label: "📋 Plaintes", badge: kpiOuvertes || null },
              { key: "messages",      label: "💬 Messages", badge: msgNonLusCC || null },
              { key: "notifications", label: "🔔 Notifications", badge: notifNonLuesCC || null },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "8px 18px", borderRadius: "8px 8px 0 0",
                  border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: activeTab === t.key ? "#fff" : "rgba(255,255,255,0.12)",
                  color: activeTab === t.key ? CC_DARK : "rgba(255,255,255,0.85)",
                  transition: "all .15s", flex: "1 1 120px", whiteSpace: "nowrap", textAlign: "center",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {t.label}
                {t.badge > 0 && (
                  <span style={{ background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{t.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!banderoleFermeeCC && notifsBanderoleCC.length > 0 && (
        <div style={{ margin: "0 24px", padding: "10px 20px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>🔔</span>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {notifsBanderoleCC.map(n => (
              <div key={n.id} onClick={() => { marquerNotifLueCC(n.id); setActiveTab("notifications"); }}
                style={{ cursor: "pointer", display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 700, color: "#9a3412", fontSize: 12 }}>{n.titre}</span>
                <span style={{ color: "#78716c", fontSize: 11 }}>{n.message}</span>
              </div>
            ))}
            {notifNonLuesCC > notifsBanderoleCC.length && (
              <button onClick={() => setActiveTab("notifications")} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#9a3412", fontWeight: 700, fontSize: 11, cursor: "pointer", padding: 0 }}>
                +{notifNonLuesCC - notifsBanderoleCC.length} autre{notifNonLuesCC - notifsBanderoleCC.length > 1 ? "s" : ""} →
              </button>
            )}
          </div>
          <button onClick={() => setBanderoleFermeeCC(true)} title="Masquer" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a3412", fontSize: 14, flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* ── CONTENU ── */}
      <div style={{ flex: "1 1 auto", padding: "24px 24px 48px" }}>

        {/* ══ MES TÂCHES ══ */}
        {activeTab === "taches" && (() => {
          const taches = [
            { icon: "🔓", label: "Plaintes ouvertes à traiter", n: tachesOuvertes, tab: "plaintes" },
            { icon: "⚙️", label: "Plaintes en cours de suivi",  n: tachesEnCours,  tab: "plaintes" },
          ];
          const enCours = taches.filter(t => t.n > 0);
          return (
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>✅ Mes tâches</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>
                {enCours.length > 0
                  ? `${tachesTotal} élément${tachesTotal > 1 ? "s" : ""} à traiter au total.`
                  : "Rien à traiter pour le moment - tout est à jour."}
              </div>
              {enCours.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 0", color: "#94a3b8" }}>
                  <div style={{ fontSize: "2.4rem", marginBottom: 8 }}>🎉</div>
                  Aucune tâche en attente.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  {enCours.map((t, i) => (
                    <div key={i} onClick={() => setActiveTab(t.tab)}
                      style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "border-color .15s" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = CC_COLOR}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}>
                      <div style={{ fontSize: "1.6rem" }}>{t.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{t.label}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Cliquer pour ouvrir</div>
                      </div>
                      <div style={{ background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 13, fontWeight: 800, padding: "3px 11px", minWidth: 26, textAlign: "center" }}>{t.n}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ════════ DASHBOARD ════════ */}
        {activeTab === "dashboard" && (
          <div>
            {/* KPIs */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
              <StatCard label="Plaintes ouvertes"    value={kpiOuvertes}     color="#dc2626" icon="🔓" onClick={() => { setFiltreStatut("ouverte"); setActiveTab("plaintes"); }} />
              <StatCard label="En cours"             value={kpiEnCours}      color="#d97706" icon="⚙️" onClick={() => { setFiltreStatut("en_cours"); setActiveTab("plaintes"); }} />
              <StatCard label="Résolues ce mois"     value={kpiResoluesMois} color="#16a34a" icon="✅" />
              <StatCard label="Taux de résolution"   value={kpiTaux}         color={CC_COLOR} icon="📊" />
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
              <StatCard label="Critiques/hautes en attente" value={kpiCritiques}  color="#dc2626" icon="🚨" onClick={() => { setFiltrePriorite("critique"); setActiveTab("plaintes"); }} />
              <StatCard label="Délai moyen de résolution"   value={kpiDelaiMoyen} color="#0891b2" icon="⏱️" />
              <StatCard label="Total plaintes"              value={plaintes.length} color="#64748b" icon="📋" />
            </div>

            {/* Courbes */}
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 28 }}>
              <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "20px 22px" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 15, color: CC_DARK }}>📈 Plaintes créées vs résolues (6 derniers mois)</h3>
                {plaintesLoading ? (
                  <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>Chargement…</div>
                ) : (
                  <div style={{ height: 230 }}>
                    <Line
                      data={{
                        labels: plaintesParMois.map(m => m.label),
                        datasets: [
                          { label: "Créées",   data: plaintesParMois.map(m => m.creees),   borderColor: "#dc2626", backgroundColor: "#dc262622", fill: true, tension: 0.35, pointRadius: 3 },
                          { label: "Résolues", data: plaintesParMois.map(m => m.resolues), borderColor: "#16a34a", backgroundColor: "#16a34a22", fill: true, tension: 0.35, pointRadius: 3 },
                        ],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
                        scales: { y: { ticks: { precision: 0 } } },
                      }}
                    />
                  </div>
                )}
              </div>

              <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "20px 22px" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 15, color: CC_DARK }}>🎯 Répartition par priorité</h3>
                {plaintesLoading ? (
                  <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>Chargement…</div>
                ) : repartitionPriorite.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>Aucune plainte.</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 130, height: 130, flexShrink: 0 }}>
                      <Doughnut
                        data={{
                          labels: repartitionPriorite.map(([p]) => (PRIORITE_CFG[p]||PRIORITE_CFG.normale).label),
                          datasets: [{ data: repartitionPriorite.map(([,v]) => v), backgroundColor: repartitionPriorite.map(([p]) => (PRIORITE_CFG[p]||PRIORITE_CFG.normale).color), borderWidth: 0 }],
                        }}
                        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: "65%" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                      {repartitionPriorite.map(([p, v]) => {
                        const cfg = PRIORITE_CFG[p] || PRIORITE_CFG.normale;
                        return (
                          <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 3, background: cfg.color, flexShrink: 0 }} />
                            <span style={{ color: "#374151", flex: 1 }}>{cfg.icon} {cfg.label}</span>
                            <span style={{ fontWeight: 700, color: "#0f172a" }}>{v}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Plaintes urgentes */}
            <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "20px 22px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, color: CC_DARK, display: "flex", alignItems: "center", gap: 8 }}>
                🚨 Plaintes en attente (priorité haute/critique en premier)
              </h3>

              {plaintesLoading ? (
                <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>Chargement…</div>
              ) : plaintesUrgentes.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>
                  ✅ Aucune plainte en attente - tout est traité !
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {plaintesUrgentes.map((p) => {
                    const pCfg = PRIORITE_CFG[p.priorite] || PRIORITE_CFG.normale;
                    const sCfg = STATUT_CFG[p.statut] || STATUT_CFG.ouverte;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: pCfg.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{p.apprenant_nom}</div>
                          <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.objet}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <span style={{ background: pCfg.bg, color: pCfg.color, borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>{pCfg.icon} {pCfg.label}</span>
                          <span style={{ background: sCfg.bg, color: sCfg.color, borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{sCfg.icon} {sCfg.label}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{fmtDateTime(p.created_at)}</div>
                        <button
                          onClick={() => { setActiveTab("plaintes"); }}
                          style={{ padding: "4px 12px", borderRadius: 7, background: CC_LIGHT, color: CC_DARK, border: `1px solid ${CC_COLOR}40`, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                        >
                          Voir →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════ PLAINTES ════════ */}
        {activeTab === "plaintes" && (
          <div>
            {/* Barre de filtres */}
            <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", marginBottom: 18, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              {/* Search */}
              <input
                type="text"
                placeholder="🔍 Rechercher apprenant, objet…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, flex: 1, minWidth: 200, outline: "none" }}
              />

              <RangeePastilles accent={CC_COLOR} valeur={filtreStatut} style={{ marginBottom:0 }}
                onChange={(v) => setFiltreStatut(v)}
                options={["tous", "ouverte", "en_cours", "resolue", "fermee"].map((k) => (
                  { v:k, l: k === "tous" ? "Tous" : (STATUT_CFG[k] ? `${STATUT_CFG[k].icon} ${STATUT_CFG[k].label}` : k) }
                ))}
                compte={(v) => v === "tous" ? plaintes.length : plaintes.filter((p) => p.statut === v).length} />

              <RangeePastilles accent={CC_COLOR} valeur={filtrePriorite} style={{ marginBottom:0 }}
                onChange={(v) => setFiltrePriorite(v)}
                options={[{ v:"tous", l:"Toutes priorités" }, ...Object.entries(PRIORITE_CFG).map(([k, v]) => (
                  { v:k, l:`${v.icon} ${v.label}` }
                ))]}
                compte={(v) => v === "tous" ? plaintes.length : plaintes.filter((p) => p.priorite === v).length} />

              {/* Compteur */}
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8", fontWeight: 600, flexShrink: 0 }}>
                {plaintesFiltered.length} résultat{plaintesFiltered.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Liste des plaintes */}
            {plaintesLoading ? (
              <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 15 }}>Chargement des plaintes…</div>
            ) : plaintesFiltered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 15 }}>Aucune plainte trouvée.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {plaintesFiltered.map((p) => {
                  const pCfg = PRIORITE_CFG[p.priorite] || PRIORITE_CFG.normale;
                  const sCfg = STATUT_CFG[p.statut] || STATUT_CFG.ouverte;
                  return (
                    <div
                      key={p.id}
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        border: "1.5px solid #e5e7eb",
                        overflow: "hidden",
                        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
                      }}
                    >
                      {/* Bande couleur priorité */}
                      <div style={{ height: 4, background: pCfg.color }} />

                      <div style={{ padding: "14px 16px" }}>
                        {/* Header card */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{p.apprenant_nom}</div>
                            {p.apprenant_email && (
                              <div style={{ fontSize: 11, color: "#64748b" }}>{p.apprenant_email}</div>
                            )}
                            {p.apprenant_telephone && (
                              <div style={{ fontSize: 11, color: "#64748b" }}>📞 {p.apprenant_telephone}</div>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <span style={{ background: pCfg.bg, color: pCfg.color, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>
                              {pCfg.icon} {pCfg.label}
                            </span>
                            <span style={{ background: sCfg.bg, color: sCfg.color, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                              {sCfg.icon} {sCfg.label}
                            </span>
                          </div>
                        </div>

                        {/* Objet + coach */}
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ background: "#f0fdfe", color: CC_COLOR, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700, border: `1px solid ${CC_COLOR}30` }}>
                            📋 {p.objet}
                          </span>
                          {p.coach_nom && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>
                              👨‍🏫 {p.coach_nom}
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {p.description && (
                          <div style={{ fontSize: 12, color: "#374151", marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {p.description}
                          </div>
                        )}

                        {/* Meta */}
                        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <span>📅 {fmtDateTime(p.created_at)}</span>
                          {p.signale_par_nom && <span>🚨 Signalé par {p.signale_par_nom}</span>}
                          {p.prise_en_charge_par_nom && <span>⚙️ Pris en charge par {p.prise_en_charge_par_nom}</span>}
                        </div>

                        {/* Note résolution existante */}
                        {p.note_resolution && (
                          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#15803d", marginBottom: 10 }}>
                            ✅ {p.note_resolution}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                          {p.statut === "ouverte" && (
                            <button
                              onClick={() =>
                                patchPlainte(p.id, {
                                  statut: "en_cours",
                                  prise_en_charge_par_id: profil?.id,
                                  prise_en_charge_par_nom: nomComplet,
                                })
                              }
                              disabled={saving || !peut("support", "update")}
                              title={permBtnTitle("Prendre en charge", peut("support", "update"))}
                              style={permBtnStyle({ padding: "6px 14px", background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }, peut("support", "update"))}
                            >
                              {peut("support", "update") ? "⚙️" : "🔒"} Prendre en charge
                            </button>
                          )}

                          {p.statut === "en_cours" && (
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                              <textarea
                                placeholder="Note de résolution…"
                                defaultValue={p.note_resolution || ""}
                                onBlur={(e) => setNoteResolution(e.target.value)}
                                rows={2}
                                style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #a5f3fc", borderRadius: 7, fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
                              />
                              <button
                                onClick={() =>
                                  patchPlainte(p.id, {
                                    statut: "resolue",
                                    note_resolution: noteResolution || p.note_resolution,
                                    date_resolution: new Date().toISOString().slice(0, 10),
                                  })
                                }
                                disabled={saving || !peut("support", "update")}
                                title={permBtnTitle("Marquer résolue", peut("support", "update"))}
                                style={permBtnStyle({ padding: "6px 14px", background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }, peut("support", "update"))}
                              >
                                {peut("support", "update") ? "✅" : "🔒"} Marquer résolue
                              </button>
                            </div>
                          )}

                          {p.statut === "resolue" && (
                            <button
                              onClick={() => patchPlainte(p.id, { statut: "fermee" })}
                              disabled={saving || !peut("support", "update")}
                              title={permBtnTitle("Fermer la plainte", peut("support", "update"))}
                              style={permBtnStyle({ padding: "6px 14px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }, peut("support", "update"))}
                            >
                              {peut("support", "update") ? "🔐" : "🔒"} Fermer la plainte
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════ MESSAGES ════════ */}
        {activeTab === "messages" && (
          <div style={{ padding: "0 0 32px" }}>
            <MessagerieTab accentColor={CC_COLOR} />
          </div>
        )}

        {/* ════════ NOTIFICATIONS ════════ */}
        {activeTab === "notifications" && (
          <NotificationsTab userId={profil?.id} accentColor={CC_COLOR} />
        )}
      </div>
      <FooterSaaS couleurTheme={CC_COLOR} />
    </div>
  );
}
