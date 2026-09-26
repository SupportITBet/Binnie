import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../config/supabase";
import { getUTM } from "../../utils/utm";
import Footer from "../Footer/Footer";
import SEO from "../Components/SEO/SEO";
import toast, { Toaster } from "react-hot-toast";
import ParcoursModal from "../Parcours/ParcoursModal";

/* Les routes /api/mon-espace/* exigent désormais un jeton : elles répondaient sans, et
   l'adresse e-mail passée dans l'URL suffisait à lire les données de son porteur. Le jeton
   vient de la session Supabase déjà ouverte sur cette page - rien de nouveau à demander à
   l'utilisateur. */
const entetesSession = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch { return {}; }
};

/* ── Fonts & animations ─────────────────────────────── */
if (!document.querySelector("#me-fonts")) {
  const l = document.createElement("link"); l.id = "me-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#me-kf")) {
  const s = document.createElement("style"); s.id = "me-kf";
  s.textContent = `
    @keyframes meFU { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
    @keyframes meSpin { to{transform:rotate(360deg)} }
    .me-tab-btn:hover { color:#0c33ac !important; }
    .me-card-hov:hover { transform:translateY(-3px); box-shadow:0 12px 24px rgba(0,0,0,.1) !important; }
    .me-inp:focus { border-color:#0c33ac !important; outline:none; }
    @media(max-width:768px){
      .me-tabs { overflow-x:auto; -webkit-overflow-scrolling:touch; }
      .me-tab-btn { padding:10px 14px !important; font-size:.8rem !important; white-space:nowrap; }
      .me-two-col { grid-template-columns:1fr !important; }
      .me-catalog-grid { grid-template-columns:1fr !important; }
      .me-score-row { flex-direction:column !important; gap:12px !important; }
      .me-3col { grid-template-columns:1fr !important; }
      .me-4col { grid-template-columns:repeat(2,1fr) !important; }
    }
    @media(max-width:480px){
      .me-assist-header { flex-wrap:wrap; }
      .me-assist-badge { margin-left:0 !important; order:3; width:100%; margin-top:4px; }
      .me-assist-actions { flex-direction:column !important; }
      .me-assist-actions > * { width:100% !important; min-width:0 !important; }
    }
  `;
  document.head.appendChild(s);
}

const FF = "'Montserrat','Segoe UI',sans-serif";
const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

/* ══════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
══════════════════════════════════════════════════════ */
const MonEspace = () => {
  const navigate = useNavigate();
  const [user,         setUser]        = useState(null);
  const [session,      setSession]     = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [activeTab,    setActiveTab]   = useState("test");
  const [prospectInfo, setProspectInfo] = useState({ is_apprenant: false, centre: null, commercial: null });

  /* ── Auth : session Supabase (Google + email/password) ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) { navigate("/connexion"); return; }
      setSession(s);
      const meta = s.user.user_metadata || {};
      const fullName =
        (meta.nom && meta.prenom) ? `${meta.nom} ${meta.prenom}`
        : meta.full_name || s.user.email.split("@")[0];
      const resolvedRole = meta.role || "prospect";
      setUser({ ...s.user, displayName: fullName, role: resolvedRole });
      // Charger les infos prospect (centre, statut apprenant, commercial)
      fetch(`${API}/api/auth/prospect-info?email=${encodeURIComponent(s.user.email)}`)
        .then(r => r.ok ? r.json() : {})
        .then(info => { if (info) setProspectInfo(info); })
        .catch(() => {})
        .finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        navigate("/");
      } else if ((event === "USER_UPDATED" || event === "TOKEN_REFRESHED") && s?.user) {
        const meta = s.user.user_metadata || {};
        const fullName = (meta.nom && meta.prenom)
          ? `${meta.nom} ${meta.prenom}`
          : meta.full_name || s.user.email.split("@")[0];
        setUser(prev => ({ ...prev, ...s.user, displayName: fullName, role: meta.role || prev?.role || "prospect" }));
        setSession(s);
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) return (
    <div style={S.page}>
      <div style={{ textAlign:"center", padding:"80px 24px" }}>
        <div style={{ width:36, height:36, border:"3px solid #e2e8f0", borderTopColor:"#0c33ac", borderRadius:"50%", animation:"meSpin .8s linear infinite", margin:"0 auto 16px" }} />
        <p style={{ color:"#64748b" }}>Chargement de votre espace…</p>
      </div>
    </div>
  );
  if (!user) return null;

  /* ── Rôle : "prospect" → vue prospect, sinon → vue apprenant ── */
  const isProspect = user.role === "prospect" && !prospectInfo.is_apprenant;

  return (
    <div style={S.page}>
      <SEO title="Mon espace - BET" description="Votre espace personnel Binnie's English Training." canonicalUrl="/mon-espace" noindex />

      {/* ── HEADER ── */}
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap", justifyContent:"space-between" }}>
            <div>
              {isProspect && (
                <span style={S.prospectBadge}>🔍 Compte Prospect</span>
              )}
              <h1 style={S.headerTitle}>Mon espace</h1>
              <p style={S.headerSub}>Bonjour, {user.displayName} 👋</p>
            </div>
            <button style={S.logoutBtnHeader} onClick={handleLogout}>
              ← Se déconnecter
            </button>
          </div>
        </div>
        <svg viewBox="0 0 1440 48" style={{ display:"block", width:"100%", lineHeight:0 }} preserveAspectRatio="none">
          <path fill="#f8fafc" d="M0,24 C480,48 960,0 1440,24 L1440,48 L0,48 Z" />
        </svg>
      </div>

      <div style={S.container}>
        {isProspect ? (
          <ProspectView
            user={user}
            session={session}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            prospectInfo={prospectInfo}
          />
        ) : (
          <ApprenantView user={user} session={session} prospectInfo={prospectInfo} />
        )}
      </div>

      <Footer />
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   VUE PROSPECT
══════════════════════════════════════════════════════ */
const ProspectView = ({ user, session, activeTab, setActiveTab, prospectInfo }) => {
  const [hasResult, setHasResult] = useState(false);
  // La conseillère/assistante réellement assignée est stockée dans parcours_assignation
  // (écrite par ParcoursModal / TabConseillereContact) - commercial_id n'est jamais
  // renseigné par aucun parcours utilisateur actif, donc ne doit plus servir de verrou.
  const [conseillereOk, setConseillereOk] = useState(!!user.user_metadata?.parcours_assignation);

  // Fallback DB : l'assignation peut avoir été créée côté staff sans jamais
  // être répercutée dans user_metadata - sans ça, les onglets restent verrouillés
  // à tort pour un prospect qui a pourtant déjà une assistante (cf. TabTestNiveau).
  useEffect(() => {
    if (conseillereOk || !user.email) return;
    fetch(`${API}/api/parcours/mon-assignation?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => { if (d.assignation) setConseillereOk(true); })
      .catch(() => {});
  }, [user.email, conseillereOk]);

  const TABS = [
    { id:"test",       label:"📊 Mon test de niveau" },
    { id:"conseiller", label:"🤝 Conseillère & Contact" },
    { id:"catalogue",  label:"📚 Catalogue formations" },
    { id:"paiement",   label:"💳 Paiement" },
    { id:"profil",     label:"👤 Mon profil" },
    { id:"parametres", label:"⚙️ Paramètres" },
  ];

  // "paiement" reste accessible même avant le choix d'une conseillère : un
  // prospect peut avoir déjà payé (ex: coaching privé) sans que l'assignation
  // à une conseillère précise ait encore été confirmée côté staff.
  const TABS_LIBRES = ["test", "conseiller", "paiement"]; // accessibles avant choix conseillère

  const handleTabClick = (tabId) => {
    if (!conseillereOk && hasResult && !TABS_LIBRES.includes(tabId)) {
      toast.error("Choisissez d'abord votre conseillère BET avant d'accéder à cet onglet.", { duration: 3500 });
      setActiveTab("test");
      return;
    }
    setActiveTab(tabId);
  };

  return (
    <>
      <Toaster position="top-center" />
      {/* Bandeau apprenant si statut changé */}
      {prospectInfo.is_apprenant && (
        <div style={{ background:"linear-gradient(135deg,#059669,#0891b2)", borderRadius:14, padding:"16px 22px", marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:"1.6rem" }}>🎓</span>
            <div>
              <div style={{ fontWeight:800, color:"#fff", fontSize:".95rem" }}>Félicitations ! Vous êtes maintenant Apprenant BET</div>
              <div style={{ color:"rgba(255,255,255,.8)", fontSize:".82rem", marginTop:2 }}>Accédez à vos cours en ligne dès maintenant.</div>
            </div>
          </div>
          <a href={`${process.env.REACT_APP_DASH_URL || "http://localhost:3001"}/connexion/apprenant`} target="_blank" rel="noopener noreferrer">
            <button style={{ background:"#fff", color:"#059669", border:"none", borderRadius:999, padding:"9px 20px", fontWeight:800, fontSize:".84rem", cursor:"pointer", whiteSpace:"nowrap" }}>
              Accéder à mon espace →
            </button>
          </a>
        </div>
      )}

      {/* Onglets */}
      <div className="me-tabs" style={S.tabs}>
        {TABS.map(t => {
          const locked = !conseillereOk && hasResult && !TABS_LIBRES.includes(t.id);
          return (
            <button
              key={t.id}
              className="me-tab-btn"
              style={{ ...S.tabBtn, ...(activeTab === t.id ? S.tabActive : {}), ...(locked ? { opacity:.5, cursor:"not-allowed" } : {}) }}
              onClick={() => handleTabClick(t.id)}
              title={locked ? "Choisissez d'abord votre conseillère" : undefined}
            >
              {t.label}{locked ? " 🔒" : ""}
            </button>
          );
        })}
      </div>

      <div style={{ animation:"meFU .4s ease" }}>
        {activeTab === "test"        && <TabTestNiveau user={user}
          onResultLoaded={(hasR) => setHasResult(hasR)}
          setActiveTab={setActiveTab}
        />}
        {activeTab === "conseiller"  && <TabConseillereContact user={user} setActiveTab={setActiveTab} onAssignationConfirmed={() => setConseillereOk(true)} />}
        {activeTab === "catalogue"   && <TabCatalogue />}
        {activeTab === "paiement"    && <TabPaiement email={user.email} />}
        {activeTab === "profil"      && <TabProfil user={user} prospectInfo={prospectInfo} />}
        {activeTab === "parametres"  && <TabParametres user={user} />}
      </div>
    </>
  );
};

/* ── Mini-sondage "Comment nous avez-vous connu ?" ────── */
const SOURCES = [
  { key:"Bouche à oreille",       icon:"🗣️" },
  { key:"Facebook / Instagram",   icon:"📱" },
  { key:"LinkedIn",               icon:"💼" },
  { key:"Google / Recherche web", icon:"🔍" },
  { key:"Radio / Télévision",     icon:"📺" },
  { key:"Affichage / Flyers",     icon:"📋" },
  { key:"Recommandé par un ami",  icon:"👫" },
  { key:"Recommandé par mon entreprise", icon:"🏢" },
  { key:"Autre",                  icon:"✏️" },
];

const SondageCard = ({ user }) => {
  const [answered,     setAnswered]     = useState(null); // null=chargement, false=pas répondu, true=répondu
  const [selected,     setSelected]     = useState("");
  const [detail,       setDetail]       = useState("");
  const [saving,       setSaving]       = useState(false);
  const [,             setDone]         = useState(false);

  useEffect(() => {
    fetch(`${API}/api/sondage/check?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => setAnswered(d.answered))
      .catch(() => setAnswered(false));
  }, [user.email]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const commercialId = user.user_metadata?.commercial_id || null;
      const utm = getUTM();
      const res = await fetch(`${API}/api/sondage/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:          user.email,
          commercial_id:  commercialId,
          source:         selected,
          source_detail:  selected === "Autre" ? detail : null,
          utm_source:     utm?.source   || null,
          utm_medium:     utm?.medium   || null,
          utm_campaign:   utm?.campaign || null,
        }),
      });
      const d = await res.json();
      if (d.already || res.ok) { setAnswered(true); setDone(true); }
    } catch { /* silently fail */ }
    setSaving(false);
  };

  if (answered === null) return null; // chargement silencieux
  if (answered) return (
    <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:14, padding:"18px 22px", marginBottom:20, display:"flex", alignItems:"center", gap:12 }}>
      <span style={{ fontSize:"1.4rem" }}>✅</span>
      <div>
        <div style={{ fontWeight:700, color:"#166534", fontSize:".9rem" }}>Merci pour votre réponse !</div>
        <div style={{ color:"#4ade80", fontSize:".78rem" }}>Votre retour nous aide à améliorer nos services.</div>
      </div>
    </div>
  );

  return (
    <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:16, padding:"22px 24px", marginBottom:20, boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <span style={{ fontSize:"1.4rem" }}>🎯</span>
        <div>
          <div style={{ fontWeight:800, color:"#011451", fontSize:".95rem" }}>Comment avez-vous connu BET ?</div>
          <div style={{ color:"#64748b", fontSize:".78rem" }}>Sondage rapide - 1 question, 10 secondes</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
        {SOURCES.map(s => (
          <button key={s.key} onClick={() => setSelected(s.key)} style={{
            display:"flex", alignItems:"center", gap:8, padding:"10px 14px",
            borderRadius:10, border:`2px solid ${selected === s.key ? "#0c33ac" : "#e2e8f0"}`,
            background: selected === s.key ? "#eef1ff" : "#f8fafc",
            color: selected === s.key ? "#0c33ac" : "#475569",
            fontWeight: selected === s.key ? 700 : 500,
            fontSize:".82rem", cursor:"pointer", textAlign:"left", transition:"all .15s",
          }}>
            <span>{s.icon}</span> {s.key}
          </button>
        ))}
      </div>
      {selected === "Autre" && (
        <input
          value={detail}
          onChange={e => setDetail(e.target.value)}
          placeholder="Précisez..."
          style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:"1.5px solid #cbd5e1", fontSize:".85rem", marginBottom:12, boxSizing:"border-box" }}
        />
      )}
      <button
        onClick={handleSubmit}
        disabled={!selected || saving}
        style={{ padding:"10px 24px", background: selected ? "#0c33ac" : "#cbd5e1", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:".88rem", cursor: selected ? "pointer" : "not-allowed", transition:"background .2s" }}
      >
        {saving ? "Envoi…" : "Envoyer ma réponse →"}
      </button>
    </div>
  );
};

/* ── Onglet 1 : Résultat test de niveau ───────────────── */
const TabTestNiveau = ({ user, onResultLoaded, setActiveTab }) => {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [conseillereAssigned, setConseillereAssigned] = useState(!!user.user_metadata?.parcours_assignation);

  // Resynchronise si les métadonnées utilisateur changent après montage
  // (ex. assignation faite pendant que cet onglet était déjà ouvert)
  useEffect(() => {
    if (user.user_metadata?.parcours_assignation) setConseillereAssigned(true);
  }, [user.user_metadata?.parcours_assignation]);

  // Fallback DB : l'assignation peut exister en base (créée côté staff, ex.
  // CommercialDashboard) sans jamais avoir été répercutée dans user_metadata -
  // sans ce fallback, ce CTA reste affiché à tort (cf. TabConseillereContact
  // qui applique déjà cette même priorité metadata > DB).
  useEffect(() => {
    if (conseillereAssigned || !user.email) return;
    fetch(`${API}/api/parcours/mon-assignation?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => { if (d.assignation) setConseillereAssigned(true); })
      .catch(() => {});
  }, [user.email, conseillereAssigned]);

  useEffect(() => {
    fetch(`${API}/api/level-test/result?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => {
        setResult(d.result || null);
        setLoading(false);
        if (onResultLoaded) onResultLoaded(!!d.result);
      })
      .catch(() => setLoading(false));
  }, [user.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const LEVEL_COLOR = {
    "A1":"#94a3b8","A2":"#64748b","B1":"#3355cc","B2":"#0c33ac","C1":"#7c3aed","C2":"#059669",
  };

  if (loading) return <Loader />;

  if (!result) {
    const refParam = user.user_metadata?.commercial_id
      ? `?ref=${user.user_metadata.commercial_id}`
      : "";
    return (
      <div style={S.emptyCard}>
        <div style={{ fontSize:"3rem", marginBottom:16 }}>📝</div>
        <h3 style={S.emptyTitle}>Aucun test effectué</h3>
        <p style={{ color:"#64748b", marginBottom:24 }}>
          Passez notre test de niveau gratuit pour connaître votre niveau d'anglais (CECRL).
        </p>
        <Link to={`/test-niveau${refParam}`}>
          <button style={S.ctaBtn}>Passer le test gratuit →</button>
        </Link>
      </div>
    );
  }

  const pct = result.points_total
    ? Math.round((result.points_earned / result.points_total) * 100)
    : (result.score || 0);
  const color = LEVEL_COLOR[result.level] || "#0c33ac";

  return (
    <div style={{ maxWidth:700, margin:"0 auto" }}>
      {/* Badge niveau */}
      <div style={{ ...S.levelCard, borderColor: color }}>
        <div style={{ ...S.levelBadge, background: color }}>
          {result.level}
        </div>
        <div>
          <p style={{ color:"#64748b", fontSize:".8rem", margin:0 }}>Votre niveau CECRL</p>
          <h2 style={{ margin:"4px 0 0", fontFamily:FF, fontWeight:800, color:"#011451", fontSize:"1.5rem" }}>
            {LEVEL_LABELS[result.level] || result.level}
          </h2>
          <p style={{ color:"#64748b", fontSize:".82rem", marginTop:4 }}>
            Test passé le {new Date(result.submitted_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })}
          </p>
        </div>
      </div>

      {/* Score */}
      <div style={S.scoreCard}>
        <h4 style={S.cardTitle}>Score détaillé</h4>
        <div className="me-score-row" style={{ display:"flex", gap:24, marginBottom:20 }}>
          {[
            { label:"Score",      val:`${pct}%`,                        color },
            { label:"Points",     val:`${result.points_earned} / ${result.points_total}`, color:"#0891b2" },
            { label:"Réponses",   val:`${result.correct_answers} / ${result.total_questions}`, color:"#10b981" },
          ].map((s, i) => (
            <div key={i} style={{ flex:1, background:"#f8fafc", borderRadius:12, padding:"16px", textAlign:"center", border:`1.5px solid ${s.color}20` }}>
              <div style={{ fontSize:"1.6rem", fontWeight:800, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:".75rem", color:"#64748b", fontWeight:600, marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Barre de progression */}
        <div style={{ background:"#f1f5f9", borderRadius:999, height:10, overflow:"hidden", marginBottom:20 }}>
          <div style={{ width:`${pct}%`, height:"100%", background:`linear-gradient(90deg,${color},${color}aa)`, borderRadius:999, transition:"width 1s ease" }} />
        </div>

        {/* Par catégorie */}
        {result.by_category && Object.keys(result.by_category).length > 0 && (
          <>
            <h5 style={{ fontSize:".82rem", fontWeight:800, color:"#011451", margin:"0 0 12px" }}>Par compétence</h5>
            {Object.entries(result.by_category).map(([cat, data]) => {
              const catPct = Math.round((data.correct / data.total) * 100);
              return (
                <div key={cat} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:".8rem", color:"#475569", marginBottom:4 }}>
                    <span style={{ fontWeight:600 }}>{cat}</span>
                    <span>{data.correct}/{data.total} ({catPct}%)</span>
                  </div>
                  <div style={{ background:"#f1f5f9", borderRadius:999, height:7, overflow:"hidden" }}>
                    <div style={{ width:`${catPct}%`, height:"100%", background:color, borderRadius:999 }} />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Sondage "Comment nous avez-vous connu ?" */}
      <SondageCard user={user} />

      {/* ── CTA vers conseillère (si pas encore assignée) ── */}
      {!conseillereAssigned && setActiveTab && (
        <div style={{ marginBottom:24, background:"linear-gradient(135deg,#011451,#0c33ac)", borderRadius:16, padding:"22px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontWeight:800, color:"#fff", fontSize:".95rem", marginBottom:4 }}>
              👩‍💼 Choisissez votre conseillère BET
            </div>
            <div style={{ color:"rgba(255,255,255,.75)", fontSize:".82rem" }}>
              Elle recevra votre résultat et vous proposera un programme personnalisé.
            </div>
          </div>
          <button
            onClick={() => setActiveTab("conseiller")}
            style={{ padding:"11px 22px", background:"#ff2945", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:".88rem", cursor:"pointer", whiteSpace:"nowrap", fontFamily:"'Montserrat',sans-serif" }}
          >
            Choisir ma conseillère →
          </button>
        </div>
      )}

    </div>
  );
};

const LEVEL_LABELS = {
  A1:"Débutant (A1)", A2:"Élémentaire (A2)",
  B1:"Intermédiaire (B1)", B2:"Intermédiaire avancé (B2)",
  C1:"Avancé (C1)", C2:"Maîtrise (C2)",
};

/* ── Onglet 3 : Catalogue formations ──────────────────── */
const CERTIF_DEFAULTS = {
  toeic: { emoji:"📜", title:"Certification TOEIC", desc:"Préparation complète et passage de l'examen TOEIC." },
  toefl: { emoji:"🎓", title:"Certification TOEFL", desc:"Préparez le TOEFL avec nos coachs experts."        },
  ielts: { emoji:"🌍", title:"Certification IELTS", desc:"Préparation IELTS avec coach natif anglophone."    },
};

const readLS = (key) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } };

const TabCatalogue = () => {
  const [offresEnLigne, setOffresEnLigne] = useState(() => readLS("bet_offres_en_ligne"));
  const [offresDomic,   setOffresDomic]   = useState(() => readLS("bet_offres_domicile"));
  const [centres,       setCentres]       = useState(() => readLS("bet_centres_master"));
  const [certifCfg,     setCertifCfg]     = useState(() => readLS("bet_certifications_config"));
  const [cataloguePdf,  setCataloguePdf]  = useState(() => readLS("bet_catalogue_pdf"));

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "bet_offres_en_ligne")       try { setOffresEnLigne(JSON.parse(e.newValue)); } catch {}
      if (e.key === "bet_offres_domicile")        try { setOffresDomic(JSON.parse(e.newValue));   } catch {}
      if (e.key === "bet_centres_master")         try { setCentres(JSON.parse(e.newValue));        } catch {}
      if (e.key === "bet_certifications_config")  try { setCertifCfg(JSON.parse(e.newValue));      } catch {}
      if (e.key === "bet_catalogue_pdf")          try { setCataloguePdf(JSON.parse(e.newValue));   } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Un type de cours est visible si aucune donnée n'est encore chargée (affichage par défaut)
  // ou si au moins une offre/centre est actif
  const showEnLigne = !offresEnLigne || offresEnLigne.some(o => o.actif !== false);
  const showDomic   = !offresDomic   || offresDomic.some(o => o.actif !== false);
  const showCabinet = !centres       || centres.some(c => c.actif !== false);

  const sections = [
    {
      section: "📚 Cours d'anglais",
      items: [
        showEnLigne  && { emoji:"🎓", title:"Cours en ligne",   desc:"Accès illimité, à votre rythme, de chez vous.",          path:"/cours/en-ligne",  badge:"Populaire" },
        showCabinet  && { emoji:"🏢", title:"Cours en cabinet", desc:"Présentiel dans nos 6 centres en Côte d'Ivoire.",         path:"/cours/cabinet",   badge:null },
        showDomic    && { emoji:"🏠", title:"Cours à domicile", desc:"Un coach certifié se déplace chez vous.",                 path:"/cours/domicile",  badge:null },
      ].filter(Boolean),
    },
    {
      section: "🏆 Certifications internationales",
      items: Object.entries(CERTIF_DEFAULTS).map(([key, def]) => {
        const c = certifCfg?.[key];
        return {
          emoji: def.emoji,
          title: c?.name ? `Certification ${c.name}` : def.title,
          desc:  c?.tagline || def.desc,
          path:  `/certification/${key}`,
          badge: "Certifiant",
        };
      }),
    },
    {
      section: "✨ Services complémentaires",
      items: [
        { emoji:"🎤", title:"Préparation à l'interview",  desc:"Entraînement personnalisé pour réussir vos entretiens.",  path:"/service/interview",      badge:null },
        { emoji:"💬", title:"Discussion avec des natifs", desc:"Pratiquez avec des locuteurs anglophones en ligne.",       path:"/service/natifs",         badge:null },
        { emoji:"🌐", title:"Interprétariat & Traduction",desc:"Interprétation simultanée et traduction de documents.",   path:"/service/interpretariat", badge:null },
      ],
    },
  ].filter(s => s.items.length > 0);

  const badgeBg  = (b) => b === "Certifiant" ? "#eef1ff" : "#fef9c3";
  const badgeClr = (b) => b === "Certifiant" ? "#0c33ac" : "#92400e";

  return (
  <div>
    <div style={{ marginBottom:24 }}>
      <h3 style={{ fontFamily:FF, fontWeight:800, color:"#011451", margin:"0 0 8px" }}>Nos formations & services</h3>
      <p style={{ color:"#64748b", fontSize:".88rem" }}>Découvrez tous nos programmes. Cliquez sur une carte pour en savoir plus.</p>
    </div>

    {sections.map((sec, si) => (
      <div key={si} style={{ marginBottom:28 }}>
        <div style={{ fontSize:".8rem", fontWeight:800, color:"#011451", letterSpacing:".06em", marginBottom:12, paddingBottom:6, borderBottom:"2px solid #f1f5f9" }}>
          {sec.section}
        </div>
        <div className="me-catalog-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
          {sec.items.map((item, i) => (
            <Link key={i} to={item.path} style={{ textDecoration:"none" }}>
              <div className="me-card-hov" style={S.catalogCard}>
                {item.badge && (
                  <span style={{ ...S.catalogBadge, background: badgeBg(item.badge), color: badgeClr(item.badge) }}>
                    {item.badge}
                  </span>
                )}
                <div style={{ fontSize:"2rem", marginBottom:12 }}>{item.emoji}</div>
                <h4 style={{ fontWeight:800, color:"#011451", margin:"0 0 8px", fontSize:".95rem" }}>{item.title}</h4>
                <p style={{ color:"#64748b", fontSize:".82rem", lineHeight:1.6, margin:"0 0 16px" }}>{item.desc}</p>
                <span style={{ color:"#ff2945", fontWeight:700, fontSize:".82rem" }}>Voir le programme →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    ))}

    {/* Catalogue téléchargeable */}
    {cataloguePdf?.url && (
      <div style={{ ...S.scoreCard, marginTop:8, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
        <div>
          <h4 style={{ fontWeight:800, color:"#011451", margin:"0 0 4px" }}>📄 {(cataloguePdf.nom || "Catalogue BET 2025.pdf").replace(/\.pdf$/i,"")}</h4>
          <p style={{ color:"#64748b", fontSize:".82rem", margin:0 }}>Toutes nos formations, tarifs et modalités en un seul document.</p>
        </div>
        <a href={cataloguePdf.url} download={cataloguePdf.nom || "Catalogue-BET.pdf"} target="_blank" rel="noopener noreferrer">
          <button style={S.ctaBtn}>⬇ Télécharger le catalogue</button>
        </a>
      </div>
    )}
  </div>
  );
};

/* ── Onglet fusionné : Conseillère + Contact ──────────── */
const TabConseillereContact = ({ user, setActiveTab, onAssignationConfirmed }) => {
  const [parcoursOpen,  setParcoursOpen]  = useState(false);
  const [parcoursMode,  setParcoursMode]  = useState(null);
  const [currentUser,   setCurrentUser]   = useState(user);
  const [testResult,    setTestResult]    = useState(null);
  const [dbAssignation, setDbAssignation] = useState(null);
  // Si l'assignation est déjà dans user_metadata, pas besoin d'attendre le fetch DB
  // avant d'afficher - sinon on évite le flash "Trouver votre assistante" le temps
  // que la requête revienne (cas où l'assignation n'existe qu'en base).
  const [loadingAssignation, setLoadingAssignation] = useState(!user?.user_metadata?.parcours_assignation);

  useEffect(() => {
    if (!user?.email) return;
    fetch(`${API}/api/level-test/result?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => setTestResult(d.result || null))
      .catch(() => {});
  }, [user.email]);

  // Charger l'assignation depuis la DB (fallback si metadata absente ou vide)
  useEffect(() => {
    if (!user?.email) { setLoadingAssignation(false); return; }
    fetch(`${API}/api/parcours/mon-assignation?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => { if (d.assignation) setDbAssignation(d.assignation); })
      .catch(() => {})
      .finally(() => setLoadingAssignation(false));
  }, [user.email]);

  const openParcours = (mode) => { setParcoursMode(mode); setParcoursOpen(true); };

  // Rafraîchir le user depuis Supabase après fermeture du modal (pour afficher l'assignation)
  const handleParcoursClose = async () => {
    setParcoursOpen(false);
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
    if (session?.user) setCurrentUser(session.user);
    // Recharger depuis la DB aussi
    if (user?.email) {
      fetch(`${API}/api/parcours/mon-assignation?email=${encodeURIComponent(user.email)}`)
        .then(r => r.json())
        .then(d => { if (d.assignation) setDbAssignation(d.assignation); })
        .catch(() => {});
    }
  };

  // Priorité : DB (source de vérité live, reflète les réaffectations faites par un PA
  // Advisor) > metadata Supabase (simple instantané figé au moment de la 1ère
  // assignation, jamais mis à jour ensuite - ne doit servir que de repli tant que
  // le fetch DB n'a pas encore répondu, jamais l'emporter une fois celui-ci résolu).
  const assignation = dbAssignation || currentUser?.user_metadata?.parcours_assignation;

  useEffect(() => {
    if (assignation && onAssignationConfirmed) onAssignationConfirmed();
  }, [assignation, onAssignationConfirmed]);

  const iniAss = assignation
    ? `${assignation.assistante_prenom?.[0]||""}${assignation.assistante_nom?.[0]||""}`.toUpperCase()
    : "?";

  if (loadingAssignation) return <Loader />;

  return (
    <div style={{ maxWidth: 660, margin: "0 auto" }}>

      {/* ── Assignation existante ── */}
      {assignation ? (
        <div style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", borderRadius:16, padding:"24px 28px", marginBottom:24, color:"#fff" }}>
          <div className="me-assist-header" style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
            {assignation.assistante_photo
              ? <img src={assignation.assistante_photo} alt="" style={{ width:56, height:56, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
              : <div style={{ width:56, height:56, borderRadius:"50%", background:"linear-gradient(135deg,#0891b2,#0c33ac)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"1rem", flexShrink:0 }}>{iniAss}</div>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:".68rem", color:"rgba(255,255,255,.6)", fontWeight:700, letterSpacing:".04em", textTransform:"uppercase", marginBottom:3 }}>Votre assistante de parcours</div>
              <div style={{ fontWeight:800, fontSize:"1.05rem" }}>{assignation.assistante_prenom} {assignation.assistante_nom}</div>
              <div style={{ fontSize:".78rem", color:"rgba(255,255,255,.7)", marginTop:2 }}>
                {assignation.type_cours === "en_ligne"
                  ? `En ligne · ${assignation.type_coaching === "groupe" ? "Coaching de groupe" : "Coaching privé"}`
                  : `Présentiel${assignation.centre_nom ? " · "+assignation.centre_nom : ""}`}
                {assignation.type_jour && assignation.type_cours === "presentiel" && (
                  <span style={{ marginLeft:8, background:"rgba(255,255,255,.15)", borderRadius:999, padding:"1px 8px", fontSize:".7rem", whiteSpace:"nowrap" }}>
                    {assignation.type_jour === "weekend" ? "Week-end" : "Lun – Ven"}
                  </span>
                )}
              </div>
            </div>
            <span className="me-assist-badge" style={{ marginLeft:"auto", flexShrink:0, background:"#22c55e", color:"#fff", borderRadius:999, padding:"4px 12px", fontSize:".7rem", fontWeight:800, textAlign:"center" }}>✓ Assignée</span>
          </div>

          <div style={{ background:"rgba(255,255,255,.08)", borderRadius:12, padding:"12px 14px", fontSize:".78rem", color:"rgba(255,255,255,.75)", lineHeight:1.6, marginBottom:14 }}>
            📅 Assignée le {new Date(assignation.date).toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}
            {assignation.type_cours === "presentiel" && assignation.type_jour && (
              <> · assistante <strong>{assignation.type_jour === "weekend" ? "week-end" : "semaine"}</strong> du cabinet {assignation.centre_nom}</>
            )}
          </div>

          {/* Boutons contact rapide */}
          <div className="me-assist-actions" style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {assignation.assistante_tel && (
              <a
                href={`https://wa.me/${(assignation.assistante_tel||"").replace(/[\s+\-()]/g,"")}`}
                target="_blank" rel="noopener noreferrer"
                style={{ flex:1, minWidth:120, display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"#22c55e", color:"#fff", borderRadius:10, padding:"10px 14px", textDecoration:"none", fontWeight:800, fontSize:".82rem" }}
              >
                <svg width="18" height="18" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#fff" fillOpacity=".2"/><path d="M23.5 19.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4-.1-.5-.1-.2-.7-1.8-1-2.4-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.3 4.7 2 .9 2.7.9 3.7.8.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3z" fill="#fff"/></svg>
                WhatsApp
              </a>
            )}
            <div style={{ flex:1, minWidth:120, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.15)", borderRadius:10, padding:"10px 14px", color:"rgba(255,255,255,.6)", fontSize:".78rem", textAlign:"center", lineHeight:1.4 }}>
              🏢 Pour changer d'assistante,<br />rendez-vous dans un cabinet BET
            </div>
          </div>
        </div>
      ) : (
        /* ── Options parcours (aucune assignation) ── */
        <div style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", borderRadius:16, padding:"24px 28px", marginBottom:24, color:"#fff" }}>
          <div style={{ fontSize:"1.6rem", marginBottom:8 }}>🎯</div>
          <h2 style={{ fontFamily:FF, fontWeight:800, margin:"0 0 8px", fontSize:"1.15rem" }}>Trouver votre assistante BET</h2>
          <p style={{ color:"rgba(255,255,255,.75)", fontSize:".88rem", lineHeight:1.6, margin:"0 0 20px" }}>
            Obtenez une assistante dédiée en quelques étapes. Choisissez votre mode d'apprentissage.
          </p>
          <div className="me-3col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            <button
              onClick={() => openParcours("en_ligne")}
              style={{ background:"rgba(255,255,255,.1)", border:"1.5px solid rgba(255,255,255,.25)", borderRadius:12, padding:"18px 16px", cursor:"pointer", textAlign:"center", color:"#fff", transition:"all .2s" }}
              onMouseOver={e => e.currentTarget.style.background="rgba(255,255,255,.18)"}
              onMouseOut={e => e.currentTarget.style.background="rgba(255,255,255,.1)"}
            >
              <div style={{ fontSize:"1.8rem", marginBottom:6 }}>💻</div>
              <div style={{ fontWeight:800, fontSize:".95rem", marginBottom:4 }}>En ligne</div>
              <div style={{ fontSize:".78rem", color:"rgba(255,255,255,.7)", lineHeight:1.5 }}>Cours 100% à distance, assistante disponible rapidement</div>
            </button>
            <button
              onClick={() => openParcours("presentiel")}
              style={{ background:"rgba(255,255,255,.1)", border:"1.5px solid rgba(255,255,255,.25)", borderRadius:12, padding:"18px 16px", cursor:"pointer", textAlign:"center", color:"#fff", transition:"all .2s" }}
              onMouseOver={e => e.currentTarget.style.background="rgba(255,255,255,.18)"}
              onMouseOut={e => e.currentTarget.style.background="rgba(255,255,255,.1)"}
            >
              <div style={{ fontSize:"1.8rem", marginBottom:6 }}>🏢</div>
              <div style={{ fontWeight:800, fontSize:".95rem", marginBottom:4 }}>En présentiel</div>
              <div style={{ fontSize:".78rem", color:"rgba(255,255,255,.7)", lineHeight:1.5 }}>En cabinet dans l'un de nos 6 centres BET</div>
            </button>
            <button
              onClick={() => openParcours("domicile")}
              style={{ background:"rgba(5,150,105,.15)", border:"1.5px solid rgba(5,150,105,.4)", borderRadius:12, padding:"18px 16px", cursor:"pointer", textAlign:"center", color:"#fff", transition:"all .2s" }}
              onMouseOver={e => e.currentTarget.style.background="rgba(5,150,105,.28)"}
              onMouseOut={e => e.currentTarget.style.background="rgba(5,150,105,.15)"}
            >
              <div style={{ fontSize:"1.8rem", marginBottom:6 }}>🏠</div>
              <div style={{ fontWeight:800, fontSize:".95rem", marginBottom:4 }}>À domicile</div>
              <div style={{ fontSize:".78rem", color:"rgba(255,255,255,.7)", lineHeight:1.5 }}>Un coach certifié se déplace chez vous</div>
            </button>
          </div>
        </div>
      )}

      {/* ── Bloc test de niveau ── */}
      {(() => {
        const commercialId = currentUser?.user_metadata?.commercial_id;
        const refParam = commercialId ? `?ref=${commercialId}` : "";
        const LEVEL_COLOR = { A1:"#94a3b8", A2:"#64748b", B1:"#3355cc", B2:"#0c33ac", C1:"#7c3aed", C2:"#059669" };

        if (testResult) {
          const color = LEVEL_COLOR[testResult.level] || "#0c33ac";
          const pct   = testResult.points_total
            ? Math.round((testResult.points_earned / testResult.points_total) * 100)
            : testResult.score || 0;
          return (
            <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"16px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
              <div style={{ width:48, height:48, borderRadius:12, background:color, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"1.1rem", flexShrink:0 }}>
                {testResult.level}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, color:"#011451", fontSize:".9rem" }}>Test de niveau effectué ✅</div>
                <div style={{ fontSize:".78rem", color:"#64748b", marginTop:2 }}>
                  Score : <strong style={{ color }}>{pct}%</strong> · {new Date(testResult.submitted_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })}
                </div>
              </div>
              {setActiveTab && (
                <button
                  onClick={() => setActiveTab("test")}
                  style={{ background:color, color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontWeight:700, fontSize:".8rem", cursor:"pointer", whiteSpace:"nowrap" }}
                >
                  📊 Voir mes résultats →
                </button>
              )}
            </div>
          );
        }

        return (
          <div style={{ background:"#fffbeb", border:"1.5px dashed #fbbf24", borderRadius:14, padding:"16px 20px", marginBottom:16, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
            <span style={{ fontSize:"1.6rem", flexShrink:0 }}>📝</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:800, color:"#92400e", fontSize:".9rem" }}>Test de niveau non effectué</div>
              <div style={{ fontSize:".78rem", color:"#b45309", marginTop:2 }}>
                Votre assistante a besoin de votre niveau pour vous proposer le programme adapté.
              </div>
            </div>
            <Link to={`/test-niveau${refParam}`} style={{ textDecoration:"none", flexShrink:0 }}>
              <button style={{ background:"#f59e0b", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontWeight:700, fontSize:".8rem", cursor:"pointer", whiteSpace:"nowrap" }}>
                Passer le test →
              </button>
            </Link>
          </div>
        );
      })()}

      <ParcoursModal
        isOpen={parcoursOpen}
        onClose={handleParcoursClose}
        user={currentUser}
        defaultMode={parcoursMode}
      />
    </div>
  );
};

/* ── Reçu PDF (print-to-PDF, même pattern que PaiementRetour.jsx) ── */
const exporterRecuPaiementPDF = (p) => {
  const raw = p.inscription || "";
  const parts = raw.split("||");
  const offre = parts.find(s => s.startsWith("offre::"))?.replace("offre::", "") || null;
  const description = parts.filter(s => !s.startsWith("offre::")).join(" - ") || null;

  const win = window.open("", "_blank", "width=700,height=900");
  win.document.write(`
    <html><head><title>Reçu de paiement - BET</title>
    <style>
      body{font-family:'Segoe UI',Arial,sans-serif;padding:36px;color:#0f172a}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0c33ac;padding-bottom:20px;margin-bottom:28px}
      .logo{font-size:24px;font-weight:900;color:#0c33ac}
      .logo-sub{font-size:11px;color:#6b7280;margin-top:4px}
      h2{margin:0 0 4px;font-size:19px;font-weight:800}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
      .card{background:#f8fafc;border-radius:8px;padding:12px;border:1px solid #e2e8f0}
      .label{font-size:11px;color:#9ca3af;margin-bottom:4px}
      .val{font-size:13px;font-weight:700}
      .badge{display:inline-block;background:#dcfce7;color:#15803d;padding:6px 18px;border-radius:20px;font-weight:800;font-size:13px;margin-top:8px}
      .footer{margin-top:32px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;line-height:1.7}
      @media print{button{display:none}}
    </style></head><body>
    <div class="header">
      <div>
        <div class="logo">Binnie's English Training</div>
        <div class="logo-sub">Centre de langues agréé - Abidjan, Côte d'Ivoire</div>
      </div>
      <div style="text-align:right">
        <h2>REÇU DE PAIEMENT</h2>
        <div class="logo-sub">Émis le ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;text-align:center">
      <div class="label">Montant reçu</div>
      <div style="font-size:24px;font-weight:900;color:#15803d">${Number(p.montant_recu||0).toLocaleString("fr-FR")} FCFA</div>
      <div class="badge">${p.statut === "paye" || p.statut === "validé" ? "✅ Paiement confirmé" : `Statut : ${p.statut || "-"}`}</div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Client</div><div class="val">${p.client||"-"}</div></div>
      ${offre ? `<div class="card"><div class="label">Offre</div><div class="val">${offre}</div></div>` : ""}
      ${description ? `<div class="card"><div class="label">Détail</div><div class="val">${description}</div></div>` : ""}
      ${p.montant_du != null ? `<div class="card"><div class="label">Montant dû</div><div class="val">${Number(p.montant_du).toLocaleString("fr-FR")} FCFA</div></div>` : ""}
      <div class="card"><div class="label">Moyen de paiement</div><div class="val">${p.payment_mode_reel || p.mode_paiement || "-"}</div></div>
      <div class="card"><div class="label">Date</div><div class="val">${p.date_paiement ? new Date(p.date_paiement).toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}) : "-"}</div></div>
      ${p.ref_transaction ? `<div class="card" style="grid-column:1/-1"><div class="label">Référence transaction</div><div class="val" style="font-family:monospace">${p.ref_transaction}</div></div>` : ""}
      ${p.payment_token ? `<div class="card" style="grid-column:1/-1"><div class="label">Token TouchPoint</div><div class="val" style="font-family:monospace">${p.payment_token}</div></div>` : ""}
    </div>
    <div class="footer">
      Ce reçu est généré automatiquement. Conservez ce document pour vos archives.<br/>
      Binnie's English Training - Abidjan, Côte d'Ivoire
    </div>
    <div style="text-align:center;margin-top:20px">
      <button onclick="window.print()" style="padding:10px 24px;background:#0c33ac;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">🖨️ Imprimer / Exporter en PDF</button>
    </div>
    </body></html>`);
  win.document.close();
};

/* ── Onglet Paiement (historique + export PDF) - partagé Prospect + Apprenant ── */
const TabPaiement = ({ email }) => {
  const [paiements, setPaiements] = useState(null);
  const [codePromo, setCodePromo] = useState(null);

  useEffect(() => {
    if (!email) { setPaiements([]); return; }
    fetch(`${API}/api/paiements/mes-paiements-prospect?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => {
        setPaiements(d.paiements || []);
        if (d.code_promo) setCodePromo({ code: d.code_promo, reduction: d.reduction_montant });
      })
      .catch(() => setPaiements([]));
  }, [email]);

  const statutCfg = {
    paye:       { bg:"#d1fae5", c:"#065f46", l:"✅ Payé" },
    validé:     { bg:"#d1fae5", c:"#065f46", l:"✅ Payé" },
    partiel:    { bg:"#fef3c7", c:"#92400e", l:"⚠️ Partiel" },
    en_attente: { bg:"#e0f2fe", c:"#0369a1", l:"⏳ En attente" },
    impaye:     { bg:"#fee2e2", c:"#991b1b", l:"❌ Impayé" },
  };

  if (paiements === null) return <div style={{ maxWidth:700, margin:"0 auto" }}><Loader /></div>;

  return (
    <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
      {codePromo && (
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#fef3c7", color:"#92400e", borderRadius:999, padding:"6px 14px", fontSize:".78rem", fontWeight:800, marginBottom:14 }}>
          🎟️ Code promo {codePromo.code}{codePromo.reduction ? ` · -${Number(codePromo.reduction).toLocaleString("fr-FR")} FCFA` : ""}
        </div>
      )}
      {paiements.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:"2.5rem", marginBottom:10 }}>💳</div>
          <div style={{ fontWeight:700, color:"#0f172a", marginBottom:4 }}>Aucun paiement enregistré</div>
          <p style={{ color:"#9ca3af", fontSize:".84rem" }}>Vos transactions apparaîtront ici dès qu'un paiement aura été enregistré.</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {paiements.map((p) => {
            const raw = p.inscription || "";
            const parts = raw.split("||");
            const offre = parts.find(s => s.startsWith("offre::"))?.replace("offre::", "") || null;
            const st = statutCfg[p.statut] || { bg:"#f1f5f9", c:"#64748b", l:p.statut || "-" };
            return (
              <div key={p.id} style={{ background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:14, padding:"16px 20px", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:10 }}>
                  <div>
                    {offre && <div style={{ fontWeight:800, color:"#0f172a", fontSize:".92rem" }}>{offre}</div>}
                    <div style={{ fontSize:".76rem", color:"#9ca3af", marginTop:2 }}>
                      {p.date_paiement ? new Date(p.date_paiement).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "-"}
                    </div>
                  </div>
                  <span style={{ padding:"4px 12px", borderRadius:20, fontSize:".72rem", fontWeight:800, background:st.bg, color:st.c, whiteSpace:"nowrap" }}>{st.l}</span>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:".82rem", color:"#374151", paddingTop:10, borderTop:"1px solid #f1f5f9" }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#9ca3af" }}>Montant reçu</span>
                    <span style={{ fontWeight:800, color:"#15803d" }}>{Number(p.montant_recu||0).toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  {p.montant_du != null && (
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ color:"#9ca3af" }}>Montant dû</span>
                      <span style={{ fontWeight:700 }}>{Number(p.montant_du).toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#9ca3af" }}>Moyen de paiement</span>
                    <span style={{ fontWeight:700 }}>{p.payment_mode_reel || p.mode_paiement || "-"}</span>
                  </div>
                  {p.ref_transaction && (
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ color:"#9ca3af" }}>Référence</span>
                      <span style={{ fontWeight:600, fontSize:".72rem", color:"#6b7280", fontFamily:"monospace" }}>{p.ref_transaction}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => exporterRecuPaiementPDF(p)}
                  style={{ marginTop:14, width:"100%", padding:"10px 16px", background:"#011451", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:".82rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  📄 Exporter le reçu en PDF
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── Onglet Profil (partagé Prospect + Apprenant) ─────── */
const TabProfil = ({ user, prospectInfo = {} }) => {
  const meta     = user.user_metadata || {};
  const nom      = meta.nom      || "";
  const prenom   = meta.prenom   || "";
  const fullName = (nom && prenom) ? `${nom} ${prenom}` : user.displayName;

  const [tel,          setTel]          = useState(meta.telephone || "");
  const [adresse,      setAdresse]      = useState(meta.adresse || "");
  const [saving,       setSaving]       = useState(false);
  const [saveOk,       setSaveOk]       = useState(false);
  const [saveErr,      setSaveErr]      = useState("");
  const [avatarUrl,    setAvatarUrl]    = useState(meta.bet_avatar_url || "");
  const [avatarHov,    setAvatarHov]    = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [niveauReel,   setNiveauReel]   = useState(meta.niveau_anglais || null);

  useEffect(() => {
    fetch(`${API}/api/level-test/result?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(d => { if (d.result?.level) setNiveauReel(d.result.level); })
      .catch(() => {});
  }, [user.email]);

  useEffect(() => {
    const url = user.user_metadata?.bet_avatar_url;
    if (url) setAvatarUrl(url);
  }, [user.user_metadata?.bet_avatar_url]);

  const handleAvatarUpload = async (file) => {
    setAvatarUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expirée");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/api/upload/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur upload");
      const url = data.file.url;
      // Sauvegarde dans user_metadata (client SDK + admin API pour persistance complète)
      const { error: updateErr } = await supabase.auth.updateUser({ data: { bet_avatar_url: url } });
      if (updateErr) throw new Error(updateErr.message);
      await fetch(`${API}/api/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ nom, prenom, telephone: tel, avatar_url: url }),
      });
      setAvatarUrl(url);
      toast.success("Photo de profil mise à jour !");
    } catch (e) {
      toast.error(e.message || "Erreur upload");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveTel = async () => {
    setSaving(true); setSaveOk(false); setSaveErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expirée");

      // 1. Mise à jour via le backend (table utilisateurs + user_metadata via admin API)
      const res = await fetch(`${API}/api/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${session.access_token}` },
        body: JSON.stringify({ nom, prenom, telephone: tel, adresse }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Erreur serveur"); }

      // 2. Rafraîchir la session pour que user_metadata soit à jour au prochain rechargement
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        // Fallback : mise à jour directe via client SDK
        await supabase.auth.updateUser({ data: { telephone: tel, adresse } });
      }

      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
      <div className="me-two-col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
        {/* Carte infos */}
        <div style={S.scoreCard}>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
            {/* Avatar cliquable */}
            <label htmlFor="avatar-upload"
              onMouseEnter={() => setAvatarHov(true)}
              onMouseLeave={() => setAvatarHov(false)}
              style={{ position:"relative", cursor:"pointer", flexShrink:0 }}
              title="Changer ma photo de profil"
            >
              {avatarUrl
                ? <img src={avatarUrl} alt="profil"
                    style={{ ...S.avatarLg, objectFit:"cover" }}
                    onError={() => setAvatarUrl("")}
                  />
                : <div style={S.avatarLg}>{(fullName[0]||"?").toUpperCase()}</div>
              }
              <div style={{
                position:"absolute", inset:0, borderRadius:"50%",
                background:"rgba(0,0,0,0.45)",
                display:"flex", alignItems:"center", justifyContent:"center",
                opacity: (avatarHov || avatarUploading) ? 1 : 0,
                transition:"opacity .2s",
              }}>
                <span style={{ fontSize:20 }}>{avatarUploading ? "⏳" : "📷"}</span>
              </div>
              <input id="avatar-upload" type="file" accept="image/*" style={{ display:"none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = ""; }}
              />
            </label>
            <div>
              <h2 style={{ fontFamily:FF, fontWeight:800, color:"#011451", margin:"0 0 4px", fontSize:"1.2rem" }}>{fullName}</h2>
              <p style={{ color:"#64748b", fontSize:".82rem", margin:0 }}>
                Niveau : {niveauReel
                  ? <strong style={{ color:"#0c33ac" }}>{niveauReel}</strong>
                  : <span style={{ color:"#ff2945" }}>Non évalué</span>}
              </p>
              <p style={{ color:"#94a3b8", fontSize:".75rem", margin:"3px 0 0", fontStyle:"italic" }}>
                Cliquez sur la photo pour la modifier
              </p>
            </div>
          </div>
          <div style={S.infoRow}><span>📧 Email</span><span style={{ color:"#011451", fontWeight:600 }}>{user.email}</span></div>
          <div style={S.infoRow}>
            <span>📞 Téléphone</span>
            <span style={{ color: tel ? "#011451" : "#94a3b8", fontWeight: tel ? 600 : 400 }}>
              {tel || "Non renseigné"}
            </span>
          </div>
          <div style={S.infoRow}>
            <span>📍 Adresse</span>
            <span style={{ color: adresse ? "#011451" : "#94a3b8", fontWeight: adresse ? 600 : 400 }}>
              {adresse || "Non renseignée"}
            </span>
          </div>
          {prospectInfo.centre && (
            <div style={S.infoRow}>
              <span>🏢 Centre BET</span>
              <span style={{ color:"#011451", fontWeight:600 }}>{prospectInfo.centre.nom} - {prospectInfo.centre.ville}</span>
            </div>
          )}
          {prospectInfo.commercial && (
            <div style={S.infoRow}>
              <span>🤝 Conseillère</span>
              <span style={{ color:"#7c3aed", fontWeight:600 }}>{prospectInfo.commercial.prenom} {prospectInfo.commercial.nom}</span>
            </div>
          )}
          <div style={S.infoRow}>
            <span>🏷️ Statut</span>
            <span style={{ color: prospectInfo.is_apprenant ? "#059669" : "#ff2945", fontWeight:700 }}>
              {prospectInfo.is_apprenant ? "✓ Apprenant BET" : "Prospect"}
            </span>
          </div>
        </div>

        {/* Coordonnées modifiables */}
        <div style={S.scoreCard}>
          <h3 style={{ ...S.cardTitle, marginBottom:6 }}>📞 Mes coordonnées</h3>
          <p style={{ color:"#64748b", fontSize:".83rem", lineHeight:1.6, marginBottom:16 }}>
            Votre conseillère utilisera ces informations pour vous contacter. Renseignez-les pour être joignable rapidement.
          </p>
          <label style={{ fontSize:".76rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:6 }}>Numéro de téléphone</label>
          <input
            type="tel"
            placeholder="+225 07 00 00 00 00"
            value={tel}
            onChange={e => { setTel(e.target.value); setSaveOk(false); setSaveErr(""); }}
            style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1.5px solid #e2e8f0",
              fontSize:".92rem", outline:"none", boxSizing:"border-box", fontFamily:FF,
              transition:"border-color .15s" }}
            onFocus={e => e.target.style.borderColor="#0c33ac"}
            onBlur={e  => e.target.style.borderColor="#e2e8f0"}
          />
          <label style={{ fontSize:".76rem", fontWeight:700, color:"#64748b", display:"block", margin:"14px 0 6px" }}>Adresse</label>
          <input
            type="text"
            placeholder="Ex : Cocody Riviera 2, près du carrefour…"
            value={adresse}
            onChange={e => { setAdresse(e.target.value); setSaveOk(false); setSaveErr(""); }}
            style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1.5px solid #e2e8f0",
              fontSize:".92rem", outline:"none", boxSizing:"border-box", fontFamily:FF,
              transition:"border-color .15s" }}
            onFocus={e => e.target.style.borderColor="#0c33ac"}
            onBlur={e  => e.target.style.borderColor="#e2e8f0"}
          />
          {saveErr && <p style={{ color:"#ff2945", fontSize:".8rem", margin:"6px 0 0", fontWeight:600 }}>⚠ {saveErr}</p>}
          {saveOk  && <p style={{ color:"#059669", fontSize:".8rem", margin:"6px 0 0", fontWeight:600 }}>✅ Coordonnées enregistrées</p>}
          <button onClick={handleSaveTel} disabled={saving || (!tel.trim() && !adresse.trim())}
            style={{ marginTop:14, padding:"10px 22px", background:"#0c33ac", color:"#fff", border:"none",
              borderRadius:8, fontWeight:700, fontSize:".88rem", cursor: (saving || (!tel.trim() && !adresse.trim())) ? "not-allowed" : "pointer",
              opacity: (saving || (!tel.trim() && !adresse.trim())) ? .6 : 1, transition:"opacity .15s" }}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Onglet Paramètres (partagé Prospect + Apprenant) ─── */
const TabParametres = ({ user }) => {
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const [resetError,    setResetError]    = useState("");
  const [loading,       setLoading]       = useState(false);

  const handleSendResetLink = async () => {
    setResetLinkSent(false); setResetError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setResetLinkSent(true);
    } catch (err) {
      setResetError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth:500 }}>
      <div style={S.scoreCard}>
        <h3 style={{ ...S.cardTitle, marginBottom:8 }}>Changer mon mot de passe</h3>
        <p style={{ color:"#64748b", fontSize:".85rem", lineHeight:1.7, marginBottom:20 }}>
          Recevez un lien par email à <strong>{user.email}</strong> pour réinitialiser votre mot de passe de façon sécurisée.
        </p>
        <button
          style={{ ...S.ctaBtn, background:"#ff2945", width:"100%", padding:"13px", opacity: loading ? .7 : 1 }}
          onClick={handleSendResetLink}
          disabled={loading}
        >
          {loading ? "Envoi…" : "Envoyer le lien de réinitialisation"}
        </button>
        {resetLinkSent && (
          <div style={{ background:"#d1fae5", color:"#065f46", padding:"12px 16px", borderRadius:8, fontSize:".82rem", marginTop:16 }}>
            ✓ Email envoyé à <strong>{user.email}</strong>. Cliquez sur le lien reçu pour changer votre mot de passe.
          </div>
        )}
        {resetError && (
          <div style={{ background:"#fee2e2", color:"#ff2945", padding:"12px 16px", borderRadius:8, fontSize:".82rem", marginTop:16 }}>
            ❌ {resetError}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Vue Apprenant (existante, inchangée) ─────────────── */
/* ══════════════════════════════════════════════════════
   SHARED HOOKS / HELPERS pour vues apprenant
══════════════════════════════════════════════════════ */
function useApprenantBase(user) {
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const [resetError,    setResetError]    = useState("");
  const [certifs,       setCertifs]       = useState(null);
  const [niveauReel,    setNiveauReel]    = useState(null);
  const meta     = user.user_metadata || {};
  const nom      = meta.nom      || "";
  const prenom   = meta.prenom   || "";
  const tel      = meta.telephone|| "";
  const fullName = nom && prenom ? `${nom} ${prenom}` : user.displayName;
  useEffect(() => {
    fetch(`${API}/api/level-test/result?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json()).then(d => { if (d.result?.level) setNiveauReel(d.result.level); }).catch(() => {});
  }, [user.email]);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("certifications").select("id, type, score, date_obtention").eq("apprenant_id", user.id).eq("valide", true).order("date_obtention", { ascending: false })
      .then(({ data }) => setCertifs(data || []));
  }, [user?.id]);
  const handleSendResetLink = async () => {
    setResetLinkSent(false); setResetError("");
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ email: user.email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetLinkSent(true);
    } catch (err) { setResetError(err.message); }
  };
  return { resetLinkSent, resetError, certifs, niveauReel, nom, prenom, tel, fullName, handleSendResetLink };
}

/* ── Onglet Profil commun (apprenant) ── */
const TabProfilApprenant = ({ user, prospectInfo, fullName, niveauReel }) => {
  const meta = user.user_metadata || {};
  const tel = meta.telephone || "";
  return (
    <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease", display:"flex", flexDirection:"column", gap:20 }}>
      <div style={S.scoreCard}>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
          <div style={S.avatarLg}>{(fullName[0]||"?").toUpperCase()}</div>
          <div>
            <h2 style={{ fontFamily:FF, fontWeight:800, color:"#011451", margin:"0 0 4px" }}>{fullName}</h2>
            <span style={{ display:"inline-block", background:"#d1fae5", color:"#065f46", borderRadius:999, padding:"2px 12px", fontSize:".76rem", fontWeight:800 }}>✓ Apprenant BET</span>
          </div>
        </div>
        <div style={S.infoRow}><span>📧 Email</span><span>{user.email}</span></div>
        <div style={S.infoRow}><span>📞 Téléphone</span><span>{tel || "Non renseigné"}</span></div>
        <div style={S.infoRow}><span>📍 Adresse</span><span>{meta.adresse || "Non renseignée"}</span></div>
        <div style={S.infoRow}><span>🎓 Niveau</span><span style={{ fontWeight:700, color: niveauReel ? "#0c33ac" : "#ff2945" }}>{niveauReel || "Non évalué"}</span></div>
      </div>
      {prospectInfo.centre && (
        <div style={{ background:"#fff", border:"1.5px solid #bae6fd", borderRadius:16, padding:"20px 24px" }}>
          <h4 style={{ fontFamily:FF, fontWeight:800, color:"#0891b2", margin:"0 0 14px", fontSize:".93rem" }}>🏢 Votre centre BET</h4>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={S.infoRow}><span>Centre</span><span style={{ fontWeight:700, color:"#011451" }}>{prospectInfo.centre.nom} - {prospectInfo.centre.ville}</span></div>
            {prospectInfo.centre.adresse && <div style={S.infoRow}><span>Adresse</span><span style={{ color:"#475569" }}>{prospectInfo.centre.adresse}</span></div>}
            {prospectInfo.centre.telephone && <div style={S.infoRow}><span>Tél. centre</span><a href={`tel:${prospectInfo.centre.telephone}`} style={{ color:"#0891b2", fontWeight:600, textDecoration:"none" }}>{prospectInfo.centre.telephone}</a></div>}
          </div>
        </div>
      )}
      {prospectInfo.commercial && (
        <div style={{ background:"#f5f3ff", border:"1.5px solid #c4b5fd", borderRadius:16, padding:"20px 24px" }}>
          <h4 style={{ fontFamily:FF, fontWeight:800, color:"#7c3aed", margin:"0 0 14px", fontSize:".93rem" }}>🤝 Votre conseillère BET</h4>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#0891b2)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:".85rem", flexShrink:0 }}>
              {(prospectInfo.commercial.prenom?.[0] || "") + (prospectInfo.commercial.nom?.[0] || "")}
            </div>
            <div>
              <div style={{ fontWeight:800, color:"#011451" }}>{prospectInfo.commercial.prenom} {prospectInfo.commercial.nom}</div>
              <div style={{ color:"#7c3aed", fontSize:".8rem", fontWeight:600 }}>Conseillère BET Languages</div>
              {prospectInfo.commercial.telephone && <a href={`tel:${prospectInfo.commercial.telephone}`} style={{ color:"#0891b2", fontSize:".8rem", display:"block", marginTop:3, textDecoration:"none" }}>📞 {prospectInfo.commercial.telephone}</a>}
            </div>
          </div>
        </div>
      )}
      <div style={S.scoreCard}>
        <h3 style={{ ...S.cardTitle, marginBottom:12 }}>Modifier mes informations</h3>
        <p style={{ color:"#64748b", fontSize:".85rem" }}>Pour modifier vos informations, contactez-nous ou utilisez la réinitialisation de mot de passe.</p>
      </div>
    </div>
  );
};

/* ── Onglet Paramètres commun (apprenant) ── */
const TabParametresApprenant = ({ handleSendResetLink, resetLinkSent, resetError }) => (
  <div style={{ maxWidth:500, animation:"meFU .4s ease" }}>
    <div style={S.scoreCard}>
      <h3 style={S.cardTitle}>Changer mon mot de passe</h3>
      <p style={{ color:"#64748b", fontSize:".85rem", marginBottom:20 }}>Recevez un lien par email pour réinitialiser votre mot de passe de façon sécurisée.</p>
      <button style={{ ...S.ctaBtn, background:"#e93747", width:"100%", padding:"13px" }} onClick={handleSendResetLink}>Envoyer le lien de réinitialisation</button>
      {resetLinkSent && <div style={{ background:"#d1fae5", color:"#065f46", padding:"10px 14px", borderRadius:8, fontSize:".82rem", marginTop:16 }}>✓ Email envoyé. Consultez votre boîte mail.</div>}
      {resetError    && <div style={{ background:"#fee2e2", color:"#e93747", padding:"10px 14px", borderRadius:8, fontSize:".82rem", marginTop:16 }}>❌ {resetError}</div>}
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════
   VUE COACHING PRIVÉ
══════════════════════════════════════════════════════ */
const CoachingPriveView = ({ user, prospectInfo }) => {
  const [activeTab, setActiveTab] = useState("planning");
  const { resetLinkSent, resetError, certifs, niveauReel, fullName, handleSendResetLink } = useApprenantBase(user);
  const [seances,   setSeances]   = useState(null);
  const [presences, setPresences] = useState(null);
  const [fichiers,  setFichiers]  = useState(null);

  const { groupe, coach, assignation } = prospectInfo;

  const fetchSeances   = async () => { if (seances !== null) return; fetch(`${API}/api/mon-espace/seances?email=${encodeURIComponent(user.email)}`, { headers: await entetesSession() }).then(r=>r.json()).then(d=>setSeances(d.seances||[])).catch(()=>setSeances([])); };
  const fetchPresences = async () => { if (presences !== null) return; fetch(`${API}/api/mon-espace/presences?email=${encodeURIComponent(user.email)}`, { headers: await entetesSession() }).then(r=>r.json()).then(d=>setPresences(d.presences||[])).catch(()=>setPresences([])); };
  const fetchFichiers  = async () => { if (fichiers !== null) return; fetch(`${API}/api/mon-espace/fichiers?email=${encodeURIComponent(user.email)}`, { headers: await entetesSession() }).then(r=>r.json()).then(d=>setFichiers(d.fichiers||[])).catch(()=>setFichiers([])); };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : "-";
  const fmtH    = (h) => h ? h.slice(0,5) : null;

  const TABS = [
    { id:"planning",  label:"📅 Planning" },
    { id:"sessions",  label:"🗓️ Mes sessions" },
    { id:"presences", label:"✅ Présences" },
    { id:"fichiers",  label:"📁 Ressources" },
    { id:"paiement",  label:"💳 Paiement" },
    { id:"coach",     label:"🎓 Mon coach" },
    { id:"temoignage",label:"💬 Témoignage" },
    { id:"profil",    label:"👤 Profil" },
    { id:"parametres",label:"⚙️ Paramètres" },
  ];

  const ACCENT = "#7c3aed";

  return (
    <>
      {/* Badge profil */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, background:"linear-gradient(135deg,#ede9fe,#f5f3ff)", border:"1.5px solid #c4b5fd", borderRadius:12, padding:"12px 18px" }}>
        <span style={{ fontSize:"1.3rem" }}>🔒</span>
        <div>
          <div style={{ fontWeight:800, color:"#6d28d9", fontSize:".95rem" }}>Coaching Privé BET</div>
          <div style={{ fontSize:".78rem", color:"#7c3aed" }}>{groupe?.nom || "Votre programme personnalisé"}{groupe?.niveau ? ` · Niveau ${groupe.niveau}` : ""}</div>
        </div>
      </div>

      <div className="me-tabs" style={{ ...S.tabs, borderColor:"#c4b5fd" }}>
        {TABS.map(t => (
          <button key={t.id} className="me-tab-btn"
            style={{ ...S.tabBtn, ...(activeTab===t.id ? { color:ACCENT, borderBottom:`2px solid ${ACCENT}` } : {}) }}
            onClick={() => {
              setActiveTab(t.id);
              if (t.id==="sessions")  fetchSeances();
              if (t.id==="presences") fetchPresences();
              if (t.id==="fichiers")  fetchFichiers();
            }}>{t.label}
          </button>
        ))}
      </div>

      {/* ── PLANNING ── */}
      {activeTab==="planning" && (
        <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
          <div style={{ background:"linear-gradient(135deg,#6d28d9,#7c3aed)", borderRadius:20, padding:"28px 28px 22px", marginBottom:20, color:"#fff" }}>
            <div style={{ fontSize:".75rem", color:"#ddd6fe", fontWeight:800, textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>📅 Planning officiel validé</div>
            <div style={{ fontSize:"1.3rem", fontWeight:900, marginBottom:4 }}>{groupe?.nom || "Votre groupe"}</div>
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:".82rem", color:"#ddd6fe" }}>
              {groupe?.niveau    && <span>📊 {groupe.niveau}</span>}
              {groupe?.filiere   && <span>🎓 {groupe.filiere}</span>}
              {groupe?.date_debut && <span>📅 Début : {new Date(groupe.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}</span>}
            </div>
          </div>
          {(!groupe?.horaire || groupe.horaire.length === 0) ? (
            <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:14, padding:"28px", textAlign:"center" }}>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>📅</div>
              <div style={{ fontWeight:700, color:"#92400e" }}>Planning en cours de définition</div>
              <p style={{ color:"#78350f", fontSize:".84rem", marginTop:6 }}>Votre coach vous communiquera les créneaux très bientôt.</p>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {groupe.horaire.map((h, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:16, background:"#fff", border:"1.5px solid #c4b5fd", borderRadius:14, padding:"16px 20px", boxShadow:"0 2px 8px rgba(124,58,237,.07)" }}>
                  <div style={{ width:52, height:52, borderRadius:12, background:"linear-gradient(135deg,#7c3aed,#6d28d9)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ color:"#fff", fontWeight:900, fontSize:".85rem" }}>{h.jour}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"1.1rem", fontWeight:800, color:"#6d28d9" }}>{fmtH(h.debut) || "-"}{h.fin ? ` – ${fmtH(h.fin)}` : ""}</div>
                    {h.debut && h.fin && (() => {
                      try {
                        const [dh,dm]=[...h.debut.split(":").map(Number)], [fh,fm]=[...h.fin.split(":").map(Number)];
                        const dur=(fh*60+fm)-(dh*60+dm);
                        return <div style={{ fontSize:".78rem", color:"#7c3aed", marginTop:2 }}>Durée : {Math.floor(dur/60)}h{dur%60>0?String(dur%60).padStart(2,"0"):""}</div>;
                      } catch { return null; }
                    })()}
                  </div>
                  <span style={{ background:"#ede9fe", color:"#6d28d9", borderRadius:99, padding:"4px 12px", fontSize:".72rem", fontWeight:800 }}>Récurrent</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SESSIONS ── */}
      {activeTab==="sessions" && (
        <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
          {seances === null ? <Loader /> : seances.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:10 }}>🗓️</div>
              <div style={{ fontWeight:700, color:"#0f172a", marginBottom:4 }}>Aucune session programmée</div>
              <p style={{ color:"#9ca3af", fontSize:".84rem" }}>Vos séances apparaîtront ici au fur et à mesure de leur programmation par votre coach.</p>
            </div>
          ) : (() => {
            const now = new Date();
            const futures = seances.filter(s => new Date(s.date_cours||s.date_seance) >= now);
            const passees = seances.filter(s => new Date(s.date_cours||s.date_seance) < now);
            const statutStyle = { planifiee:{bg:"#e0f2fe",c:"#0369a1",l:"Planifiée"}, planifie:{bg:"#e0f2fe",c:"#0369a1",l:"Planifiée"}, effectuee:{bg:"#d1fae5",c:"#065f46",l:"Effectuée"}, effectue:{bg:"#d1fae5",c:"#065f46",l:"Effectuée"}, annulee:{bg:"#fee2e2",c:"#991b1b",l:"Annulée"}, annule:{bg:"#fee2e2",c:"#991b1b",l:"Annulée"} };
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                  {[{l:"Total",v:seances.length,c:"#0f172a",bg:"#f8fafc"},{l:"À venir",v:futures.length,c:"#0369a1",bg:"#e0f2fe"},{l:"Effectuées",v:passees.length,c:"#065f46",bg:"#d1fae5"}].map(s=>(
                    <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:"14px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                      <div style={{ fontSize:"1.5rem", fontWeight:900, color:s.c }}>{s.v}</div>
                      <div style={{ fontSize:".72rem", color:"#9ca3af", marginTop:2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {futures.length > 0 && (
                  <div>
                    <div style={{ fontSize:".72rem", fontWeight:800, color:"#0369a1", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>📅 Prochaines sessions</div>
                    {futures.map((s,i) => { const sc = statutStyle[s.statut] || statutStyle.planifiee; return (
                      <div key={s.id||i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", background:"#fff", border:"1px solid #e0f2fe", borderRadius:12, marginBottom:8 }}>
                        <div>
                          <div style={{ fontWeight:700, color:"#0f172a", fontSize:".9rem" }}>{fmtDate(s.date_seance||s.date_cours)}</div>
                          {(s.heure_debut||s.heure_fin) && <div style={{ fontSize:".78rem", color:"#64748b", marginTop:2 }}>🕐 {fmtH(s.heure_debut)}{s.heure_fin?` – ${fmtH(s.heure_fin)}`:""}</div>}
                          {s.lieu && <div style={{ fontSize:".75rem", color:"#9ca3af", marginTop:1 }}>📍 {s.lieu}</div>}
                        </div>
                        <span style={{ padding:"3px 10px", borderRadius:99, fontSize:".72rem", fontWeight:700, background:sc.bg, color:sc.c }}>{sc.l}</span>
                      </div>
                    ); })}
                  </div>
                )}
                {passees.length > 0 && (
                  <div>
                    <div style={{ fontSize:".72rem", fontWeight:800, color:"#6b7280", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>⏳ Sessions passées</div>
                    {passees.slice(0,10).map((s,i) => { const sc = statutStyle[s.statut] || statutStyle.effectuee; return (
                      <div key={s.id||i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"#fafafa", border:"1px solid #f1f5f9", borderRadius:12, marginBottom:6 }}>
                        <div style={{ fontWeight:600, color:"#374151", fontSize:".86rem" }}>{fmtDate(s.date_seance||s.date_cours)}</div>
                        <span style={{ padding:"3px 10px", borderRadius:99, fontSize:".72rem", fontWeight:700, background:sc.bg, color:sc.c }}>{sc.l}</span>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── PRÉSENCES ── */}
      {activeTab==="presences" && (
        <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
          {presences === null ? <Loader /> : presences.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:10 }}>✅</div>
              <div style={{ fontWeight:700, color:"#0f172a", marginBottom:4 }}>Aucune présence enregistrée</div>
              <p style={{ color:"#9ca3af", fontSize:".84rem" }}>Vos présences seront enregistrées par votre coach après chaque séance.</p>
            </div>
          ) : (() => {
            const presents = presences.filter(p=>p.statut==="present").length;
            const absents  = presences.filter(p=>p.statut==="absent").length;
            const retards  = presences.filter(p=>p.statut==="retard").length;
            const taux     = Math.round(presents/presences.length*100);
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div className="me-4col" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                  {[{l:"Séances",v:presences.length,c:"#0f172a"},{l:"Présent",v:presents,c:"#059669"},{l:"Absent",v:absents,c:"#dc2626"},{l:"Retard",v:retards,c:"#d97706"}].map(s=>(
                    <div key={s.l} style={{ background:"#f8fafc", borderRadius:10, padding:"12px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                      <div style={{ fontSize:"1.4rem", fontWeight:900, color:s.c }}>{s.v}</div>
                      <div style={{ fontSize:".7rem", color:"#9ca3af", marginTop:2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background:"#f8fafc", borderRadius:10, padding:"14px 18px", border:"1px solid #e5e7eb" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:".84rem", marginBottom:8 }}>
                    <span style={{ fontWeight:700 }}>Taux de présence</span>
                    <span style={{ fontWeight:800, color:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626" }}>{taux}%</span>
                  </div>
                  <div style={{ height:8, background:"#e5e7eb", borderRadius:99, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${taux}%`, background:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626", borderRadius:99 }}/>
                  </div>
                </div>
                <div style={{ borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                  {presences.map((p,i) => {
                    const cfg = { present:{bg:"#d1fae5",c:"#065f46",l:"✅ Présent"}, absent:{bg:"#fee2e2",c:"#991b1b",l:"❌ Absent"}, retard:{bg:"#fef3c7",c:"#92400e",l:"⏰ Retard"} };
                    const s = cfg[p.statut] || cfg.present;
                    return (
                      <div key={p.id||i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 16px", background:i%2===0?"#fff":"#fafafa", borderBottom:"1px solid #f1f5f9" }}>
                        <span style={{ fontSize:".86rem", fontWeight:600, color:"#0f172a" }}>{fmtDate(p.date_seance||p.date_presence)}</span>
                        <span style={{ padding:"3px 10px", borderRadius:20, fontSize:".72rem", fontWeight:700, background:s.bg, color:s.c }}>{s.l}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── FICHIERS / RESSOURCES ── */}
      {activeTab==="fichiers" && (
        <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
          {fichiers === null ? <Loader /> : fichiers.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:10 }}>📁</div>
              <div style={{ fontWeight:700, color:"#0f172a", marginBottom:4 }}>Aucune ressource partagée</div>
              <p style={{ color:"#9ca3af", fontSize:".84rem" }}>Votre coach partagera des documents et ressources pédagogiques ici.</p>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:".72rem", fontWeight:800, color:"#6b7280", textTransform:"uppercase", letterSpacing:".07em", marginBottom:4 }}>{fichiers.length} ressource{fichiers.length>1?"s":""} disponible{fichiers.length>1?"s":""}</div>
              {fichiers.map((f,i) => {
                const ext = (f.nom||f.titre||"").split(".").pop()?.toLowerCase() || "";
                const iconMap = { pdf:"📄", mp4:"🎥", mp3:"🎵", jpg:"🖼️", jpeg:"🖼️", png:"🖼️", docx:"📝", doc:"📝", pptx:"📊", xlsx:"📊" };
                const icon = iconMap[ext] || "📎";
                return (
                  <div key={f.id||i} style={{ display:"flex", alignItems:"center", gap:14, background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:12, padding:"14px 18px", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:"#ede9fe", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>{icon}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, color:"#0f172a", fontSize:".9rem", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{f.nom||f.titre||"Fichier"}</div>
                      {f.created_at && <div style={{ fontSize:".72rem", color:"#9ca3af", marginTop:2 }}>Partagé le {new Date(f.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>}
                    </div>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ padding:"7px 16px", background:"#ede9fe", color:"#6d28d9", borderRadius:8, fontSize:".78rem", fontWeight:700, textDecoration:"none", flexShrink:0, whiteSpace:"nowrap" }}>
                        Télécharger →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PAIEMENT ── */}
      {activeTab==="paiement" && (
        <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
          {!assignation ? (
            <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:10 }}>💳</div>
              <div style={{ fontWeight:700, color:"#0f172a" }}>Informations de paiement non disponibles</div>
            </div>
          ) : (() => {
            const sc = { paye:{bg:"#d1fae5",c:"#065f46",l:"✅ Payé"}, partiel:{bg:"#fef3c7",c:"#92400e",l:"⚠️ Partiel"}, en_attente:{bg:"#e0f2fe",c:"#0369a1",l:"⏳ En attente"}, impaye:{bg:"#fee2e2",c:"#991b1b",l:"❌ Impayé"} };
            const st = sc[assignation.statut_paiement] || { bg:"#f1f5f9", c:"#64748b", l:assignation.statut_paiement||"-" };
            const tranches = Array.isArray(assignation.plan_paiement) ? assignation.plan_paiement : [];
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ background:"linear-gradient(135deg,#1e1b4b,#312e81)", borderRadius:16, padding:"24px 28px", color:"#fff", display:"flex", gap:20, alignItems:"center", flexWrap:"wrap" }}>
                  <div style={{ fontSize:"2.5rem" }}>💳</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:".72rem", color:"#a5b4fc", fontWeight:700, marginBottom:4 }}>STATUT</div>
                    <span style={{ display:"inline-block", padding:"4px 14px", borderRadius:20, background:st.bg, color:st.c, fontWeight:800, fontSize:".86rem" }}>{st.l}</span>
                  </div>
                  {assignation.montant_paye != null && (
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:".72rem", color:"#a5b4fc", fontWeight:700 }}>MONTANT PAYÉ</div>
                      <div style={{ fontSize:"1.6rem", fontWeight:900 }}>{Number(assignation.montant_paye).toLocaleString("fr-FR")} <span style={{ fontSize:".85rem" }}>FCFA</span></div>
                    </div>
                  )}
                </div>
                {tranches.length > 0 && (
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                    <div style={{ padding:"14px 18px", background:"#f8fafc", borderBottom:"1px solid #e5e7eb", fontWeight:800, color:"#0f172a", fontSize:".86rem" }}>🗓️ Plan de paiement ({tranches.length} tranche{tranches.length>1?"s":""})</div>
                    {tranches.map((t,i) => {
                      const paid = t.statut==="paye"||t.paid||t.payee;
                      return (
                        <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 18px", background:i%2===0?"#fff":"#fafafa", borderBottom:i<tranches.length-1?"1px solid #f1f5f9":"none" }}>
                          <div>
                            <div style={{ fontWeight:700, color:"#0f172a", fontSize:".86rem" }}>Tranche {i+1}</div>
                            {(t.date||t.echeance) && <div style={{ fontSize:".72rem", color:"#9ca3af", marginTop:1 }}>📅 {new Date(t.date||t.echeance).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>}
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontWeight:800, color:"#0f172a" }}>{t.montant!=null?Number(t.montant).toLocaleString("fr-FR")+" FCFA":"-"}</div>
                            <span style={{ display:"inline-block", marginTop:2, padding:"2px 8px", borderRadius:20, fontSize:".68rem", fontWeight:700, background:paid?"#d1fae5":"#fef3c7", color:paid?"#065f46":"#92400e" }}>{paid?"Payé":"En attente"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ padding:"12px 16px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, fontSize:".82rem", color:"#1e40af" }}>
                  🔒 Pour toute question sur votre paiement, contactez votre conseillère BET.
                </div>
                <div>
                  <div style={{ fontSize:".72rem", fontWeight:800, color:"#6b7280", textTransform:"uppercase", letterSpacing:".07em", marginBottom:8 }}>🧾 Historique des transactions</div>
                  <TabPaiement email={user.email} />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── MON COACH ── */}
      {activeTab==="coach" && (
        <div style={{ maxWidth:500, margin:"0 auto", animation:"meFU .4s ease" }}>
          {!coach ? (
            <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:10 }}>🎓</div>
              <div style={{ fontWeight:700, color:"#0f172a" }}>Coach non encore assigné</div>
              <p style={{ color:"#9ca3af", fontSize:".84rem", marginTop:6 }}>Votre coach sera affiché ici une fois l'assignation confirmée.</p>
            </div>
          ) : (
            <div style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", border:"1.5px solid #c4b5fd", borderRadius:20, padding:"32px 28px", textAlign:"center" }}>
              <div style={{ width:80, height:80, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#6d28d9)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2rem", fontWeight:800, margin:"0 auto 16px" }}>
                {(coach.prenom?.[0]||"")+(coach.nom?.[0]||"")}
              </div>
              <div style={{ fontSize:"1.2rem", fontWeight:900, color:"#0f172a", marginBottom:4 }}>{coach.prenom} {coach.nom}</div>
              <div style={{ fontSize:".84rem", color:"#7c3aed", fontWeight:700, marginBottom:20 }}>🎓 Votre coach BET Languages</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {coach.telephone && (
                  <a href={`tel:${coach.telephone}`} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:"#7c3aed", color:"#fff", borderRadius:10, padding:"12px 20px", textDecoration:"none", fontWeight:700, fontSize:".88rem" }}>
                    📞 Appeler : {coach.telephone}
                  </a>
                )}
                {groupe?.nom && (
                  <div style={{ background:"#fff", borderRadius:10, padding:"12px 16px", fontSize:".84rem", color:"#374151", border:"1px solid #e5e7eb" }}>
                    📚 Groupe : <strong>{groupe.nom}</strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab==="temoignage" && <TabTemoignage user={user} certifs={certifs} estCertifie={Array.isArray(certifs) && certifs.length > 0} />}
      {activeTab==="profil" && <TabProfilApprenant user={user} prospectInfo={prospectInfo} fullName={fullName} niveauReel={niveauReel} />}
      {activeTab==="parametres" && <TabParametresApprenant handleSendResetLink={handleSendResetLink} resetLinkSent={resetLinkSent} resetError={resetError} />}
    </>
  );
};

/* ══════════════════════════════════════════════════════
   VUE COACHING GROUPE
══════════════════════════════════════════════════════ */
const CoachingGroupeView = ({ user, prospectInfo }) => {
  const [activeTab, setActiveTab] = useState("planning");
  const { resetLinkSent, resetError, certifs, niveauReel, fullName, handleSendResetLink } = useApprenantBase(user);
  const [presences, setPresences] = useState(null);
  const [fichiers,  setFichiers]  = useState(null);

  const { groupe, coach } = prospectInfo;
  const fetchPresences = async () => { if (presences !== null) return; fetch(`${API}/api/mon-espace/presences?email=${encodeURIComponent(user.email)}`, { headers: await entetesSession() }).then(r=>r.json()).then(d=>setPresences(d.presences||[])).catch(()=>setPresences([])); };
  const fetchFichiers  = async () => { if (fichiers !== null) return; fetch(`${API}/api/mon-espace/fichiers?email=${encodeURIComponent(user.email)}`, { headers: await entetesSession() }).then(r=>r.json()).then(d=>setFichiers(d.fichiers||[])).catch(()=>setFichiers([])); };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : "-";
  const fmtH    = (h) => h ? h.slice(0,5) : null;
  const ACCENT  = "#0891b2";

  const TABS = [
    { id:"planning",  label:"📅 Planning" },
    { id:"presences", label:"✅ Mes présences" },
    { id:"ressources",label:"📁 Ressources" },
    { id:"temoignage",label:"💬 Témoignage" },
    { id:"profil",    label:"👤 Profil" },
    { id:"parametres",label:"⚙️ Paramètres" },
  ];

  return (
    <>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, background:"linear-gradient(135deg,#e0f7fa,#e0f2fe)", border:"1.5px solid #7dd3fc", borderRadius:12, padding:"12px 18px" }}>
        <span style={{ fontSize:"1.3rem" }}>🏫</span>
        <div>
          <div style={{ fontWeight:800, color:"#0369a1", fontSize:".95rem" }}>Coaching de Groupe BET</div>
          <div style={{ fontSize:".78rem", color:"#0891b2" }}>{groupe?.nom || "Votre groupe"}{groupe?.niveau ? ` · Niveau ${groupe.niveau}` : ""}</div>
        </div>
      </div>

      <div className="me-tabs" style={{ ...S.tabs, borderColor:"#7dd3fc" }}>
        {TABS.map(t => (
          <button key={t.id} className="me-tab-btn"
            style={{ ...S.tabBtn, ...(activeTab===t.id ? { color:ACCENT, borderBottom:`2px solid ${ACCENT}` } : {}) }}
            onClick={() => {
              setActiveTab(t.id);
              if (t.id==="presences") fetchPresences();
              if (t.id==="ressources") fetchFichiers();
            }}>{t.label}
          </button>
        ))}
      </div>

      {/* PLANNING */}
      {activeTab==="planning" && (
        <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
          <div style={{ background:"linear-gradient(135deg,#0891b2,#0369a1)", borderRadius:20, padding:"24px 28px 20px", marginBottom:20, color:"#fff" }}>
            <div style={{ fontSize:".72rem", color:"#bae6fd", fontWeight:800, textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>📅 Planning de votre groupe</div>
            <div style={{ fontSize:"1.2rem", fontWeight:900, marginBottom:4 }}>{groupe?.nom || "Votre groupe"}</div>
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:".8rem", color:"#bae6fd" }}>
              {groupe?.niveau && <span>📊 {groupe.niveau}</span>}
              {coach && <span>🎓 Coach : {coach.prenom} {coach.nom}</span>}
              {groupe?.date_debut && <span>📅 Début : {new Date(groupe.date_debut).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}</span>}
            </div>
          </div>
          {(!groupe?.horaire || groupe.horaire.length === 0) ? (
            <div style={{ background:"#fffbeb", border:"1.5px solid #fde68a", borderRadius:14, padding:"28px", textAlign:"center" }}>
              <div style={{ fontSize:"2rem", marginBottom:8 }}>📅</div>
              <div style={{ fontWeight:700, color:"#92400e" }}>Planning en cours de définition</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {groupe.horaire.map((h, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:16, background:"#fff", border:"1.5px solid #7dd3fc", borderRadius:14, padding:"16px 20px" }}>
                  <div style={{ width:52, height:52, borderRadius:12, background:"linear-gradient(135deg,#0891b2,#0369a1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ color:"#fff", fontWeight:900, fontSize:".85rem" }}>{h.jour}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:"1.1rem", fontWeight:800, color:"#0369a1" }}>{fmtH(h.debut)||"-"}{h.fin?` – ${fmtH(h.fin)}`:""}</div>
                    {h.debut && h.fin && (() => {
                      try {
                        const [dh,dm]=[...h.debut.split(":").map(Number)],[fh,fm]=[...h.fin.split(":").map(Number)];
                        const dur=(fh*60+fm)-(dh*60+dm);
                        return <div style={{ fontSize:".75rem", color:"#0891b2", marginTop:2 }}>Durée : {Math.floor(dur/60)}h{dur%60>0?String(dur%60).padStart(2,"0"):""}</div>;
                      } catch { return null; }
                    })()}
                  </div>
                  <span style={{ background:"#e0f2fe", color:"#0369a1", borderRadius:99, padding:"4px 12px", fontSize:".72rem", fontWeight:800 }}>Récurrent</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PRESENCES */}
      {activeTab==="presences" && (
        <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
          {presences === null ? <Loader /> : presences.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:10 }}>✅</div>
              <div style={{ fontWeight:700, color:"#0f172a" }}>Aucune présence enregistrée</div>
              <p style={{ color:"#9ca3af", fontSize:".84rem" }}>Vos présences seront enregistrées après chaque séance.</p>
            </div>
          ) : (() => {
            const presents = presences.filter(p=>p.statut==="present").length;
            const taux = Math.round(presents/presences.length*100);
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                  {[{l:"Séances",v:presences.length,c:"#0f172a"},{l:"Présent",v:presents,c:"#059669"},{l:"Taux",v:`${taux}%`,c:taux>=80?"#059669":taux>=60?"#d97706":"#dc2626"}].map(s=>(
                    <div key={s.l} style={{ background:"#f8fafc", borderRadius:10, padding:"14px", border:"1px solid #e5e7eb", textAlign:"center" }}>
                      <div style={{ fontSize:"1.4rem", fontWeight:900, color:s.c }}>{s.v}</div>
                      <div style={{ fontSize:".7rem", color:"#9ca3af", marginTop:2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ borderRadius:12, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                  {presences.map((p,i) => {
                    const cfg = { present:{bg:"#d1fae5",c:"#065f46",l:"✅ Présent"}, absent:{bg:"#fee2e2",c:"#991b1b",l:"❌ Absent"}, retard:{bg:"#fef3c7",c:"#92400e",l:"⏰ Retard"} };
                    const s = cfg[p.statut]||cfg.present;
                    return (
                      <div key={p.id||i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 16px", background:i%2===0?"#fff":"#fafafa", borderBottom:"1px solid #f1f5f9" }}>
                        <span style={{ fontSize:".86rem", fontWeight:600, color:"#0f172a" }}>{fmtDate(p.date_seance||p.date_presence)}</span>
                        <span style={{ padding:"3px 10px", borderRadius:20, fontSize:".72rem", fontWeight:700, background:s.bg, color:s.c }}>{s.l}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* RESSOURCES */}
      {activeTab==="ressources" && (
        <div style={{ maxWidth:700, margin:"0 auto", animation:"meFU .4s ease" }}>
          {fichiers === null ? <Loader /> : fichiers.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 24px", background:"#f8fafc", borderRadius:16, border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:10 }}>📁</div>
              <div style={{ fontWeight:700, color:"#0f172a" }}>Aucune ressource disponible</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {fichiers.map((f,i) => {
                const ext = (f.nom||"").split(".").pop()?.toLowerCase() || "";
                const iconMap = { pdf:"📄",mp4:"🎥",jpg:"🖼️",png:"🖼️",docx:"📝",pptx:"📊" };
                return (
                  <div key={f.id||i} style={{ display:"flex", alignItems:"center", gap:14, background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:12, padding:"14px 18px" }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:"#e0f2fe", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>{iconMap[ext]||"📎"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, color:"#0f172a", fontSize:".9rem", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{f.nom||f.titre||"Fichier"}</div>
                      {f.created_at && <div style={{ fontSize:".72rem", color:"#9ca3af", marginTop:2 }}>{new Date(f.created_at).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}</div>}
                    </div>
                    {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ padding:"7px 16px", background:"#e0f2fe", color:"#0369a1", borderRadius:8, fontSize:".78rem", fontWeight:700, textDecoration:"none", flexShrink:0 }}>Télécharger →</a>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab==="temoignage" && <TabTemoignage user={user} certifs={certifs} estCertifie={Array.isArray(certifs) && certifs.length > 0} />}
      {activeTab==="profil" && <TabProfilApprenant user={user} prospectInfo={prospectInfo} fullName={fullName} niveauReel={niveauReel} />}
      {activeTab==="parametres" && <TabParametresApprenant handleSendResetLink={handleSendResetLink} resetLinkSent={resetLinkSent} resetError={resetError} />}
    </>
  );
};

/* ══════════════════════════════════════════════════════
   VUE APPRENANT (dispatch selon profil)
══════════════════════════════════════════════════════ */
const ApprenantView = ({ user, session, prospectInfo = {} }) => {
  const { profil_type } = prospectInfo;
  if (profil_type === "coaching_prive")  return <CoachingPriveView  user={user} prospectInfo={prospectInfo} />;
  if (profil_type === "coaching_groupe") return <CoachingGroupeView user={user} prospectInfo={prospectInfo} />;
  return <StandardApprenantView user={user} session={session} prospectInfo={prospectInfo} />;
};

/* ── Vue standard (apprenants sans profil coaching spécifique) ── */
const StandardApprenantView = ({ user, prospectInfo = {} }) => {
  const [activeTab, setActiveTab] = useState("espace");
  const { resetLinkSent, resetError, certifs, niveauReel, fullName, handleSendResetLink } = useApprenantBase(user);
  const estCertifie = Array.isArray(certifs) && certifs.length > 0;

  const TABS = [
    { id:"espace",      label:"🖥️ Mon espace en ligne" },
    { id:"temoignage",  label:"💬 Mon témoignage" },
    { id:"profil",      label:"👤 Mon profil" },
    { id:"parametres",  label:"⚙️ Paramètres" },
  ];

  return (
    <>
      <div className="me-tabs" style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} className="me-tab-btn"
            style={{ ...S.tabBtn, ...(activeTab === t.id ? S.tabActive : {}) }}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {activeTab === "espace" && (
        <div style={{ animation:"meFU .4s ease" }}>
          <div style={{ maxWidth:640, margin:"0 auto" }}>
            <div style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", borderRadius:20, padding:"36px 32px", textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:"3rem", marginBottom:16 }}>🖥️</div>
              <h2 style={{ fontFamily:FF, color:"#fff", fontWeight:800, margin:"0 0 12px", fontSize:"1.5rem" }}>Votre espace apprenant en ligne</h2>
              <p style={{ color:"rgba(255,255,255,.75)", fontSize:".9rem", lineHeight:1.7, margin:"0 0 28px" }}>Accédez à vos cours, exercices, documents pédagogiques et suivez votre progression.</p>
              <a href={`${process.env.REACT_APP_DASH_URL || "http://localhost:3001"}/connexion/apprenant`} target="_blank" rel="noopener noreferrer">
                <button style={{ background:"#ff2945", color:"#fff", border:"none", borderRadius:999, padding:"14px 36px", fontWeight:800, fontSize:"1rem", cursor:"pointer", fontFamily:FF, boxShadow:"0 8px 24px rgba(220,38,38,.35)" }}>Accéder à mon espace en ligne →</button>
              </a>
            </div>
            {prospectInfo.centre && (
              <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:16, padding:"20px 24px", marginBottom:16 }}>
                <h4 style={{ fontFamily:FF, fontWeight:800, color:"#011451", margin:"0 0 14px", fontSize:".95rem" }}>🏢 Votre centre BET</h4>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ display:"flex", gap:10, fontSize:".88rem" }}><span style={{ color:"#64748b", minWidth:80 }}>Centre</span><span style={{ color:"#011451", fontWeight:700 }}>{prospectInfo.centre.nom} - {prospectInfo.centre.ville}</span></div>
                  {prospectInfo.centre.adresse && <div style={{ display:"flex", gap:10, fontSize:".88rem" }}><span style={{ color:"#64748b", minWidth:80 }}>Adresse</span><span style={{ color:"#475569" }}>{prospectInfo.centre.adresse}</span></div>}
                  {prospectInfo.centre.telephone && <div style={{ display:"flex", gap:10, fontSize:".88rem" }}><span style={{ color:"#64748b", minWidth:80 }}>Tél.</span><a href={`tel:${prospectInfo.centre.telephone}`} style={{ color:"#0891b2", fontWeight:600, textDecoration:"none" }}>{prospectInfo.centre.telephone}</a></div>}
                </div>
              </div>
            )}
            {prospectInfo.commercial && (
              <div style={{ background:"#f5f3ff", border:"1.5px solid #c4b5fd", borderRadius:16, padding:"20px 24px", marginBottom:16 }}>
                <h4 style={{ fontFamily:FF, fontWeight:800, color:"#011451", margin:"0 0 14px", fontSize:".95rem" }}>🤝 Votre conseillère BET</h4>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:48, height:48, borderRadius:"50%", background:"linear-gradient(135deg,#0c33ac,#2563b8)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:".9rem", flexShrink:0 }}>
                    {(prospectInfo.commercial.prenom?.[0]||"")+(prospectInfo.commercial.nom?.[0]||"")}
                  </div>
                  <div>
                    <div style={{ fontWeight:800, color:"#011451" }}>{prospectInfo.commercial.prenom} {prospectInfo.commercial.nom}</div>
                    <div style={{ color:"#0c33ac", fontSize:".82rem", fontWeight:600 }}>Conseillère BET Languages</div>
                    {prospectInfo.commercial.telephone && <a href={`tel:${prospectInfo.commercial.telephone}`} style={{ color:"#0c33ac", fontSize:".8rem", display:"block", marginTop:3, textDecoration:"none" }}>📞 {prospectInfo.commercial.telephone}</a>}
                  </div>
                </div>
              </div>
            )}
            {certifs === null ? null : estCertifie ? (
              <div onClick={()=>setActiveTab("temoignage")} style={{ background:"linear-gradient(135deg,#0c33ac,#e93747)", borderRadius:16, padding:"20px 24px", cursor:"pointer", display:"flex", alignItems:"center", gap:16 }} onMouseEnter={e=>e.currentTarget.style.opacity=".88"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                <div style={{ fontSize:"2rem" }}>💬</div>
                <div style={{ flex:1 }}><div style={{ fontWeight:800, color:"#fff", fontSize:".95rem" }}>Partagez votre expérience</div><div style={{ color:"rgba(255,255,255,.75)", fontSize:".82rem", marginTop:2 }}>Votre témoignage inspire les futurs apprenants BET.</div></div>
                <div style={{ color:"#fff", fontSize:"1.2rem" }}>→</div>
              </div>
            ) : (
              <div style={{ background:"#f8fafc", border:"1.5px dashed #cbd5e1", borderRadius:16, padding:"18px 22px", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ fontSize:"1.6rem" }}>🔒</div>
                <div><div style={{ fontWeight:700, color:"#334155", fontSize:".88rem" }}>Témoignage disponible après certification</div><div style={{ color:"#94a3b8", fontSize:".78rem", marginTop:2 }}>Finalisez votre parcours TOEIC / TOEFL / IELTS pour débloquer cette fonctionnalité.</div></div>
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab==="temoignage" && <TabTemoignage user={user} certifs={certifs} estCertifie={estCertifie} />}
      {activeTab==="profil" && <TabProfilApprenant user={user} prospectInfo={prospectInfo} fullName={fullName} niveauReel={niveauReel} />}
      {activeTab==="parametres" && <TabParametresApprenant handleSendResetLink={handleSendResetLink} resetLinkSent={resetLinkSent} resetError={resetError} />}
    </>
  );
};

/* ══════════════════════════════════════════════════════
   ONGLET TÉMOIGNAGE (ApprenantView)
══════════════════════════════════════════════════════ */
const EMOJI_TEMO_ME = ["🎓","🌟","💪","🏆","👩🏽‍💻","👨🏿‍💼","👩🏾‍⚖️","👨🏽‍🎓","✨","👑"];

const TabTemoignage = ({ user, certifs, estCertifie }) => {
  const [existant,       setExistant]       = useState(null);
  const [loadingEx,      setLoadingEx]      = useState(true);
  const [form,           setForm]           = useState({ texte:"", etoiles:5, avatar:"🎓", role:"" });
  const [submitting,     setSubmitting]     = useState(false);
  const [msg,            setMsg]            = useState(null);
  const [photoPreview,   setPhotoPreview]   = useState(null);
  const [photoUrl,       setPhotoUrl]       = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError,     setPhotoError]     = useState("");
  const photoInputRef = React.useRef(null);

  const meta      = user.user_metadata || {};
  const prenom    = meta.prenom || "";
  const nom       = meta.nom    || "";
  const fullName  = prenom && nom ? `${prenom} ${nom}` : user.email?.split("@")[0] || "";

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("temoignages")
      .select("id, statut, texte, etoiles, avatar, photo_url, role, score, actif, created_at")
      .eq("apprenant_id", user.id)
      .in("statut", ["en_attente","actif"])
      .maybeSingle()
      .then(({ data }) => { setExistant(data); setLoadingEx(false); });
  }, [user?.id]);

  const certifPrincipale = certifs?.[0];

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Seules les images sont acceptées."); return; }
    if (file.size > 5 * 1024 * 1024) { setPhotoError("La photo ne doit pas dépasser 5 Mo."); return; }
    setPhotoError(""); setPhotoUploading(true);
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`${API}/api/upload/temoignage`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s?.access_token}` },
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur upload");
      setPhotoUrl(d.url || d.file?.url);
    } catch (err) { setPhotoError(err.message); setPhotoPreview(null); setPhotoUrl(null); }
    finally { setPhotoUploading(false); }
  };

  const handleSubmit = async () => {
    if (!form.texte.trim()) return;
    setSubmitting(true); setMsg(null);
    try {
      const res = await fetch(`${API}/api/temoignages/soumettre`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          apprenant_id: user.id,
          texte:     form.texte.trim(),
          etoiles:   form.etoiles,
          role:      form.role.trim() || null,
          photo_url: photoUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ type:"ok", text: data.message });
      const { data: ex } = await supabase
        .from("temoignages")
        .select("id, statut, texte, etoiles, avatar, photo_url, role, score, actif, created_at")
        .eq("apprenant_id", user.id)
        .in("statut", ["en_attente","actif"])
        .maybeSingle();
      setExistant(ex);
    } catch (err) {
      setMsg({ type:"err", text: err.message });
    } finally { setSubmitting(false); }
  };

  // Chargement initial
  if (loadingEx || certifs === null) {
    return (
      <div style={{ textAlign:"center", padding:"48px 24px" }}>
        <div style={{ width:28, height:28, border:"3px solid #e2e8f0", borderTopColor:"#0c33ac", borderRadius:"50%", animation:"meSpin .8s linear infinite", margin:"0 auto" }} />
      </div>
    );
  }

  // Non certifié
  if (!estCertifie) {
    return (
      <div style={{ maxWidth:540, margin:"0 auto", animation:"meFU .4s ease" }}>
        <div style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", borderRadius:20, padding:"36px 32px", textAlign:"center" }}>
          <div style={{ fontSize:"3rem", marginBottom:16 }}>🔒</div>
          <h3 style={{ fontFamily:FF, color:"#fff", fontWeight:800, margin:"0 0 12px", fontSize:"1.3rem" }}>
            Possible après la formation
          </h3>
          <p style={{ color:"rgba(255,255,255,.75)", fontSize:".88rem", lineHeight:1.7, margin:"0 0 24px" }}>
            Finalisez votre parcours et obtenez votre certification BET (TOEIC, TOEFL, IELTS…) pour partager votre expérience avec la communauté.
          </p>
          <div style={{ background:"rgba(255,255,255,.1)", borderRadius:12, padding:"14px 20px", fontSize:".82rem", color:"rgba(255,255,255,.6)" }}>
            💡 Votre témoignage sera vérifié par l'équipe BET avant publication.
          </div>
        </div>
      </div>
    );
  }

  // Témoignage déjà soumis
  if (existant) {
    const statutStyle = existant.statut === "actif"
      ? { bg:"#d1fae5", color:"#065f46", label:"✅ Publié sur le site" }
      : { bg:"#fef9c3", color:"#92400e", label:"⏳ En attente de validation" };
    return (
      <div style={{ maxWidth:600, margin:"0 auto", animation:"meFU .4s ease" }}>
        <div style={S.scoreCard}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
            <h3 style={{ ...S.cardTitle, margin:0 }}>💬 Votre témoignage</h3>
            <span style={{ background:statutStyle.bg, color:statutStyle.color, borderRadius:999, padding:"4px 14px", fontSize:".76rem", fontWeight:800 }}>
              {statutStyle.label}
            </span>
          </div>
          <div style={{ background:"#f8fafc", borderRadius:12, padding:"20px 22px", borderLeft:"4px solid #0c33ac", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <div style={{ width:44, height:44, borderRadius:"50%", overflow:"hidden", background:"#0c33ac", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontSize:"1.3rem" }}>{existant.avatar || "🎓"}</span>
              </div>
              <div>
                <div style={{ fontWeight:800, color:"#011451", fontSize:".9rem" }}>{fullName}</div>
                {existant.role && <div style={{ fontSize:".77rem", color:"#64748b" }}>{existant.role}</div>}
              </div>
            </div>
            <div style={{ fontSize:"1.3rem", marginBottom:8, color:"#f59e0b" }}>{"★".repeat(existant.etoiles)}</div>
            <p style={{ fontFamily:FF, fontSize:".95rem", color:"#334155", lineHeight:1.7, margin:"0 0 12px", fontStyle:"italic" }}>
              "{existant.texte}"
            </p>
            {existant.photo_url && (
              <div style={{ borderRadius:8, overflow:"hidden", border:"1px solid #e2e8f0", maxHeight:130 }}>
                <img src={existant.photo_url} alt="Diplôme" style={{ width:"100%", height:130, objectFit:"cover", display:"block" }} />
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:12, fontSize:".82rem", color:"#64748b", flexWrap:"wrap" }}>
            {existant.score && <span>🏆 {existant.score}</span>}
            {existant.role  && <span>💼 {existant.role}</span>}
            <span>📅 {new Date(existant.created_at).toLocaleDateString("fr-FR")}</span>
          </div>
          {existant.statut !== "actif" && (
            <div style={{ marginTop:16, background:"#eef1ff", borderRadius:10, padding:"12px 16px", fontSize:".82rem", color:"#0c33ac" }}>
              🕐 Votre témoignage est en cours d'examen par l'équipe BET. Vous recevrez une confirmation sous 24-48h.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Formulaire de soumission
  return (
    <div style={{ maxWidth:600, margin:"0 auto", animation:"meFU .4s ease" }}>
      {/* Badge certification */}
      <div style={{ background:"#d1fae5", border:"1.5px solid #6ee7b7", borderRadius:12, padding:"12px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:"1.2rem" }}>🏆</span>
        <div style={{ fontSize:".83rem", color:"#065f46", fontWeight:600 }}>
          Certifié {certifPrincipale?.cert_type} - {certifPrincipale?.score || "Score enregistré"}
          <span style={{ fontWeight:400, marginLeft:8, opacity:.7 }}>
            · {new Date(certifPrincipale?.date_obtention).toLocaleDateString("fr-FR")}
          </span>
        </div>
      </div>

      <div style={S.scoreCard}>
        <h3 style={{ ...S.cardTitle, marginBottom:4 }}>Partagez votre expérience 💬</h3>
        <p style={{ color:"#64748b", fontSize:".83rem", marginBottom:24 }}>
          Votre témoignage sera vérifié par l'équipe BET avant d'être publié sur le site.
        </p>

        {/* Note en étoiles */}
        <label style={{ fontSize:".83rem", fontWeight:700, color:"#334155", display:"block", marginBottom:8 }}>Note *</label>
        <div style={{ display:"flex", gap:6, marginBottom:20 }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setForm(p => ({...p, etoiles:n}))} style={{
              fontSize:"1.6rem", background:"none", border:"none", cursor:"pointer",
              color: n <= form.etoiles ? "#f59e0b" : "#e2e8f0", transition:"color .15s",
            }}>★</button>
          ))}
        </div>

        {/* Photo du diplôme */}
        <label style={{ fontSize:".83rem", fontWeight:700, color:"#334155", display:"block", marginBottom:6 }}>
          🎓 Photo de votre diplôme / certificat <span style={{ fontWeight:400, color:"#94a3b8" }}>(optionnelle - max 10 Mo)</span>
        </label>
        <p style={{ fontSize:".75rem", color:"#94a3b8", margin:"0 0 10px" }}>Une photo de votre certificat TOEIC, TOEFL, IELTS… sera affichée avec votre témoignage.</p>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20 }}>
          <div style={{ width:90, height:64, borderRadius:10, border:"2px dashed #e2e8f0", overflow:"hidden", flexShrink:0, background:"#f8fafc", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {photoPreview
              ? <img src={photoPreview} alt="Aperçu diplôme" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <span style={{ fontSize:"1.8rem" }}>🏅</span>}
          </div>
          <div style={{ flex:1 }}>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handlePhotoChange} />
            <button onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
              style={{ padding:"8px 18px", background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:9, cursor:"pointer", fontWeight:700, fontSize:".8rem", color:"#334155" }}>
              {photoUploading ? "⏳ Upload en cours…" : photoUrl ? "✅ Changer la photo du diplôme" : "📁 Ajouter la photo du diplôme"}
            </button>
            {photoError && <p style={{ color:"#e93747", fontSize:".75rem", margin:"6px 0 0" }}>{photoError}</p>}
            {photoUrl && !photoUploading && <p style={{ color:"#065f46", fontSize:".75rem", margin:"6px 0 0" }}>✓ Photo du diplôme prête à l'envoi</p>}
          </div>
        </div>

        {/* Avatar emoji (si pas de photo) */}
        {!photoUrl && (
          <>
            <label style={{ fontSize:".83rem", fontWeight:700, color:"#334155", display:"block", marginBottom:8 }}>Avatar emoji</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
              {EMOJI_TEMO_ME.map(e => (
                <button key={e} onClick={() => setForm(p => ({...p, avatar:e}))} style={{
                  fontSize:"1.3rem", width:40, height:40, borderRadius:10, border:`2px solid ${form.avatar===e?"#0c33ac":"#e2e8f0"}`,
                  background: form.avatar===e ? "#eef1ff" : "#fff", cursor:"pointer", transition:"all .15s",
                }}>{e}</button>
              ))}
            </div>
          </>
        )}

        {/* Rôle / titre */}
        <label style={{ fontSize:".83rem", fontWeight:700, color:"#334155", display:"block", marginBottom:6 }}>
          Votre rôle / situation <span style={{ fontWeight:400, color:"#94a3b8" }}>(optionnel)</span>
        </label>
        <input
          className="me-inp"
          placeholder="Ex : Étudiante en droit · HEC, Ingénieur IT · MTN…"
          value={form.role}
          onChange={e => setForm(p => ({...p, role: e.target.value}))}
          style={{ width:"100%", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"10px 14px", fontSize:".88rem", fontFamily:FF, marginBottom:20, boxSizing:"border-box" }}
        />

        {/* Texte */}
        <label style={{ fontSize:".83rem", fontWeight:700, color:"#334155", display:"block", marginBottom:6 }}>Votre témoignage *</label>
        <textarea
          className="me-inp"
          rows={5}
          placeholder="Racontez votre parcours : vos progrès, ce qui vous a marqué, votre score…"
          value={form.texte}
          onChange={e => setForm(p => ({...p, texte: e.target.value}))}
          style={{ width:"100%", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"12px 14px", fontSize:".88rem", fontFamily:FF, resize:"vertical", boxSizing:"border-box", marginBottom:8 }}
        />
        <p style={{ color:"#94a3b8", fontSize:".75rem", marginBottom:20 }}>{form.texte.length}/600 caractères</p>

        {/* Aperçu */}
        {form.texte.length > 20 && (
          <div style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", borderRadius:14, padding:"20px 22px", marginBottom:20 }}>
            <div style={{ color:"#f59e0b", fontSize:"1.1rem", marginBottom:8 }}>{"★".repeat(form.etoiles)}</div>
            <p style={{ fontFamily:FF, color:"#fff", fontSize:".9rem", lineHeight:1.65, margin:"0 0 14px", fontStyle:"italic" }}>
              "{form.texte}"
            </p>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.1rem", overflow:"hidden" }}>
                {photoPreview ? <img src={photoPreview} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : form.avatar}
              </div>
              <div>
                <div style={{ fontWeight:800, color:"#fff", fontSize:".85rem" }}>{fullName}</div>
                {form.role && <div style={{ color:"rgba(255,255,255,.6)", fontSize:".75rem" }}>{form.role}</div>}
              </div>
              <div style={{ marginLeft:"auto", background:"#e93747", color:"#fff", borderRadius:999, padding:"3px 12px", fontSize:".72rem", fontWeight:800 }}>
                {certifPrincipale?.cert_type} {certifPrincipale?.score || ""}
              </div>
            </div>
          </div>
        )}

        {msg && (
          <div style={{ background: msg.type==="ok" ? "#d1fae5":"#fee2e2", color: msg.type==="ok" ? "#065f46":"#e93747", borderRadius:10, padding:"12px 16px", fontSize:".83rem", marginBottom:16 }}>
            {msg.type==="ok" ? "✅" : "❌"} {msg.text}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || form.texte.trim().length < 20}
          style={{ ...S.ctaBtn, background:"#0c33ac", width:"100%", padding:"13px", opacity: (submitting || form.texte.trim().length < 20) ? .5 : 1, cursor: (submitting || form.texte.trim().length < 20) ? "not-allowed":"pointer" }}
        >
          {submitting ? "Envoi en cours…" : "Soumettre mon témoignage →"}
        </button>
      </div>
    </div>
  );
};

/* ── Helpers ─────────────────────────────────────────── */
const Loader = () => (
  <div style={{ textAlign:"center", padding:"48px 24px" }}>
    <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#0c33ac", borderRadius:"50%", animation:"meSpin .8s linear infinite", margin:"0 auto" }} />
  </div>
);

/* ── Styles ──────────────────────────────────────────── */
const S = {
  page:            { fontFamily:FF, background:"#f8fafc", minHeight:"100vh", color:"#011451" },
  header:          { background:"linear-gradient(135deg,#011451 0%,#0c33ac 100%)", padding:"40px 0 0", position:"relative" },
  headerInner:     { maxWidth:1180, margin:"0 auto", padding:"0 24px 32px" },
  headerTitle:     { fontFamily:FF, fontSize:"2rem", color:"#fff", margin:"4px 0 0", fontWeight:800 },
  headerSub:       { color:"rgba(255,255,255,.7)", fontSize:"1rem", margin:"6px 0 0" },
  logoutBtnHeader: { background:"rgba(255,255,255,.12)", color:"#fff", border:"1.5px solid rgba(255,255,255,.25)", borderRadius:999, padding:"9px 20px", fontWeight:700, fontSize:".84rem", cursor:"pointer", fontFamily:FF },
  prospectBadge:   { display:"inline-block", background:"rgba(220,38,38,.25)", border:"1px solid rgba(220,38,38,.5)", color:"#fca5a5", borderRadius:999, padding:"3px 14px", fontSize:".72rem", fontWeight:800, letterSpacing:".06em", marginBottom:8 },
  container:       { maxWidth:1180, margin:"32px auto 64px", padding:"0 24px" },

  upgradeBanner:   { background:"#eef1ff", border:"1.5px solid #b3c4ff", borderRadius:14, padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap", marginBottom:28 },
  upgradeBtn:      { background:"#0c33ac", color:"#fff", border:"none", borderRadius:999, padding:"10px 22px", fontWeight:800, fontSize:".84rem", cursor:"pointer", fontFamily:FF, whiteSpace:"nowrap" },

  tabs:            { display:"flex", gap:4, borderBottom:"2px solid #e2e8f0", marginBottom:32 },
  tabBtn:          { background:"none", border:"none", padding:"12px 22px", fontSize:".88rem", fontWeight:600, color:"#64748b", cursor:"pointer", transition:"all .2s", fontFamily:FF, whiteSpace:"nowrap" },
  tabActive:       { color:"#ff2945", borderBottom:"2px solid #ff2945" },

  emptyCard:       { background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:20, padding:"56px 32px", textAlign:"center", maxWidth:480, margin:"0 auto" },
  emptyTitle:      { fontFamily:FF, fontWeight:800, fontSize:"1.2rem", margin:"0 0 12px" },
  ctaBtn:          { background:"#0c33ac", color:"#fff", border:"none", borderRadius:999, padding:"12px 28px", fontWeight:800, fontSize:".9rem", cursor:"pointer", fontFamily:FF, transition:"all .2s" },

  levelCard:       { background:"#fff", border:"2px solid", borderRadius:20, padding:"28px 24px", display:"flex", alignItems:"center", gap:24, marginBottom:20, boxShadow:"0 4px 16px rgba(0,0,0,.06)" },
  levelBadge:      { width:80, height:80, borderRadius:16, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2rem", fontWeight:900, flexShrink:0 },
  scoreCard:       { background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:16, padding:"24px", marginBottom:16, boxShadow:"0 2px 8px rgba(0,0,0,.04)" },
  cardTitle:       { fontFamily:FF, fontWeight:800, color:"#011451", margin:"0 0 4px", fontSize:"1rem" },

  catalogCard:     { background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:16, padding:"22px", height:"100%", boxShadow:"0 2px 8px rgba(0,0,0,.04)", transition:"all .25s", position:"relative" },
  catalogBadge:    { position:"absolute", top:14, right:14, borderRadius:999, padding:"3px 10px", fontSize:".7rem", fontWeight:800 },

  label:           { display:"block", fontSize:".78rem", fontWeight:700, marginBottom:6, color:"#011451" },
  input:           { width:"100%", padding:"10px 13px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".88rem", fontFamily:FF, boxSizing:"border-box", background:"#fff", transition:"border-color .2s" },
  infoRow:         { display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #f1f5f9", fontSize:".88rem" },
  avatarLg:        { width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#0c33ac,#0891b2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.8rem", color:"#fff", fontWeight:800, flexShrink:0 },
};

export default MonEspace;
