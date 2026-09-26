// src/Pages/Auth/LoginAdmin.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { clearAllSessionStorage } from "../../utils/session";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const ROUTE_PAR_TYPE = {
  super_admin:         "/dashboard/superAdmin",
  admin:               "/AdminDashboard",
  manager:             "/manager-dashboard",
  superviseur:         "/superviseur-dashboard",
  deputy_superviseur:  "/superviseur-dashboard",
  pedagogical_advisor: "/pedagogical-advisor-dashboard",
  commercial:          "/commercial-dashboard",
  onboarding:          "/onboarding-dashboard",
  gestionnaire:        "/gestionnaire-dashboard",
  rh:                  "/rh-paie-dashboard",
  comptable:           "/comptable-dashboard",
  placement_test:      "/placement-test-dashboard",
  coach:               "/espace-professeur",
  customer_care:       "/customer-care-dashboard",
  assistant_sav:       "/sav-dashboard",
  data_collector:      "/datacollector-dashboard",
  marketing:           "/marketing-dashboard",
  // rétro-compat profils_admin
  admin_pedagogique:   "/AdminDashboard",
  admin_financier:     "/AdminDashboard",
  admin_rh:            "/AdminDashboard",
  admin_commercial:    "/AdminDashboard",
  responsable_centre:  "/AdminDashboard",
  observateur:         "/AdminDashboard",
};

// Labels affichés selon le rôle connecté
const PROFILS_BET = [
  { id:"super_admin",         label:"Super Admin",           emoji:"👑", color:"#dc2626", bg:"#fee2e2", desc:"Accès total à la plateforme" },
  { id:"admin",               label:"Administrateur",        emoji:"🔧", color:"#0891b2", bg:"#e0f2fe", desc:"Gestion complète" },
  { id:"manager",             label:"Manager",               emoji:"👥", color:"#10b981", bg:"#dcfce7", desc:"Supervision & reporting" },
  { id:"superviseur",         label:"Superviseur Global",    emoji:"🔭", color:"#0284c7", bg:"#e0f2fe", desc:"Contrôle & supervision globale" },
  { id:"deputy_superviseur",  label:"Deputy Superviseur",    emoji:"🔍", color:"#0369a1", bg:"#e0f2fe", desc:"Supervision déléguée par centre" },
  { id:"pedagogical_advisor", label:"Conseiller Pédagogique",emoji:"📚", color:"#7c3aed", bg:"#f5f3ff", desc:"Classes privées & honoraires" },
  { id:"commercial",          label:"Commercial",            emoji:"📈", color:"#f59e0b", bg:"#fef3c7", desc:"CRM & inscriptions" },
  { id:"onboarding",          label:"Onboarding",            emoji:"🎯", color:"#0891b2", bg:"#e0f2fe", desc:"Accueil & intégration" },
  { id:"gestionnaire",        label:"Gestionnaire",          emoji:"🗂️", color:"#059669", bg:"#dcfce7", desc:"Administratif & finances" },
  { id:"rh",                  label:"RH",                    emoji:"🤝", color:"#0d9488", bg:"#ccfbf1", desc:"Ressources humaines & paie" },
  { id:"comptable",           label:"Comptable",             emoji:"💰", color:"#d97706", bg:"#fffbeb", desc:"Comptabilité & trésorerie" },
  { id:"coach",               label:"Coach",                 emoji:"🎓", color:"#6366f1", bg:"#eef2ff", desc:"Cours & étudiants" },
  { id:"customer_care",       label:"Customer Care",         emoji:"💬", color:"#0284c7", bg:"#e0f2fe", desc:"Support & fidélisation client" },
  { id:"assistant_sav",       label:"Assistante SAV",        emoji:"🛎️", color:"#0e7490", bg:"#ecfeff", desc:"Service après-vente" },
  { id:"data_collector",        label:"Data Collector",          emoji:"📊", color:"#64748b", bg:"#f1f5f9", desc:"Saisie de données" },
  { id:"placement_test",        label:"Agent Placement Test",    emoji:"🧪", color:"#0891b2", bg:"#e0f2fe", desc:"Validation tests de niveau" },
  { id:"marketing",             label:"Assistant Marketing",     emoji:"📣", color:"#db2777", bg:"#fdf2f8", desc:"Gestion du site web & contenu" },
];

export default function LoginAdmin() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const T = (k) => t("loginAdmin", k);
  const [selectedRole, setSelectedRole] = useState(null); // étape 0 : choix du profil
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [twofa, setTwofa]           = useState("");
  const [step, setStep]             = useState(0); // 0=choix profil | 1=login | 2=verify | 3=enroll
  const [showPwd, setShowPwd]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [profil, setProfil]         = useState(null);
  const [session, setSession]       = useState(null);  // session aal1 temporaire
  const [factorId, setFactorId]     = useState(null);
  const [qrCode, setQrCode]         = useState(null);  // SVG string pour l'enrôlement
  const [secret, setSecret]         = useState(null);
  const [enrollFactorId, setEnrollFactorId] = useState(null);
  const [showSecret, setShowSecret] = useState(false);

  // ── État "Mot de passe oublié" ────────────────────────────
  const [forgotOpen,   setForgotOpen]   = useState(false);
  const [forgotEmail,  setForgotEmail]  = useState("");
  const [forgotStatus, setForgotStatus] = useState("idle"); // idle | loading | sent | error
  const [forgotMsg,    setForgotMsg]    = useState("");

  // Session déjà active dans ce navigateur (ex: retour arrière depuis le dashboard alors
  // qu'on est toujours connecté) - on affiche un bandeau plutôt qu'un formulaire vide qui
  // donnerait l'impression trompeuse d'être déconnecté.
  const [sessionExistante] = useState(() => {
    try {
      const token = localStorage.getItem("admin_token");
      const p     = JSON.parse(localStorage.getItem("admin_profil") || "null");
      return token && p ? p : null;
    } catch { return null; }
  });
  const [sessionIgnoree, setSessionIgnoree] = useState(false);
  const roleLabelSession = sessionExistante
    ? (PROFILS_BET.find(p => p.id === (sessionExistante.role || sessionExistante.profil_type))?.label || sessionExistante.role)
    : "";
  const continuerVersDashboard = () => {
    const role = sessionExistante.role || sessionExistante.profil_type;
    navigate(ROUTE_PAR_TYPE[role] || "/dashboard/superAdmin", { replace: true });
  };
  const seDeconnecterPourChanger = () => {
    clearAllSessionStorage();
    setSessionIgnoree(true);
  };

  const redirectDashboard = (p, sess) => {
    const s    = sess || session;
    const role = p.role || p.profil_type;

    localStorage.setItem("admin_token",   s.access_token);
    localStorage.setItem("admin_refresh", s.refresh_token);
    // Si le serveur retourne couleur=null, récupérer le backup local par userId
    const localColorKey = p.id ? `_bet_color_${p.id}` : null;
    const localColor = localColorKey ? localStorage.getItem(localColorKey) : null;
    const profilToStore = { ...p, couleur: p.couleur || localColor || null };
    localStorage.setItem("admin_profil",  JSON.stringify(profilToStore));

    // Si coach : stocker aussi le token coach (lu par EspaceProfesseur, PublicCoachRoute…)
    if (role === "coach") {
      localStorage.setItem("coach_token",   s.access_token);
      localStorage.setItem("coach_refresh", s.refresh_token);
      localStorage.setItem("coach_profil",  JSON.stringify(profilToStore));
    }

    navigate(ROUTE_PAR_TYPE[role] || "/AdminDashboard", { state: { profil: p } });
  };

  // ── Étape 1 : email + mot de passe ─────────────────────────
  const handleStep1 = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError(T("err_fields")); return; }
    setLoading(true);
    // Nettoyage systématique de toute session précédente (staff ou coach) avant une
    // nouvelle tentative de connexion - évite qu'un vieux token d'un autre rôle/compte
    // ne contamine la nouvelle session, même en cas d'échec de connexion plus bas.
    ["admin_token","admin_refresh","admin_profil","coach_token","coach_refresh","coach_profil"]
      .forEach(k => localStorage.removeItem(k));
    try {
      const res  = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, plateforme: 'dash' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || T("err_fields")); return; }

      // Vérifier que le rôle correspond au profil sélectionné
      const roleRecu = data.profil?.role || data.profil?.profil_type;
      if (selectedRole && roleRecu !== selectedRole) {
        const labelRecu = PROFILS_BET.find(p => p.id === roleRecu)?.label || roleRecu;
        const labelAttendu = PROFILS_BET.find(p => p.id === selectedRole)?.label || selectedRole;
        setError(`Ce compte est enregistré comme « ${labelRecu} ». Sélectionnez le bon profil avant de vous connecter (profil attendu : ${labelAttendu}).`);
        return;
      }

      setProfil(data.profil);
      setSession(data.session);

      if (data.requires_mfa) {
        // MFA inscrite → vérifier le code TOTP
        setFactorId(data.factor_id);
        setStep(2);
      } else if (data.requires_enrollment) {
        // MFA obligatoire mais pas encore configurée → enrôlement
        await lancerEnrolement(data.session);
      } else {
        // Pas de MFA → connexion directe
        redirectDashboard(data.profil, data.session);
      }
    } catch {
      setError(T("err_server"));
    } finally {
      setLoading(false);
    }
  };

  // ── Lancer l'enrôlement TOTP (appelé depuis step1 ou manuellement) ─
  const lancerEnrolement = async (sess) => {
    const s = sess || session;
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/mfa/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || T("err_server")); return; }
      setQrCode(data.qr_code);
      setSecret(data.secret);
      setEnrollFactorId(data.factor_id);
      setStep(3);
    } catch {
      setError(T("err_server"));
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 2 : vérifier le code TOTP (MFA déjà configurée) ──
  const handleStep2 = async (e) => {
    e.preventDefault();
    setError("");
    if (twofa.length !== 6) { setError(T("err_code")); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/mfa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token:  session.access_token,
          refresh_token: session.refresh_token,
          factor_id:     factorId,
          code:          twofa,
          plateforme:    'dash',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || T("err_code_inv")); return; }
      redirectDashboard(data.profil, data.session);
    } catch {
      setError(T("err_server"));
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 3 : confirmer l'enrôlement avec le premier code ──
  const handleStep3 = async (e) => {
    e.preventDefault();
    setError("");
    if (twofa.length !== 6) { setError(T("err_code")); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/mfa/enroll/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token:  session.access_token,
          refresh_token: session.refresh_token,
          factor_id:     enrollFactorId,
          code:          twofa,
          plateforme:    'dash',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || T("err_code_inv")); return; }
      redirectDashboard(profil, data.session);
    } catch {
      setError(T("err_server"));
    } finally {
      setLoading(false);
    }
  };

  // ── Envoi du lien de réinitialisation ────────────────────
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail || !forgotEmail.includes("@")) {
      setForgotMsg(T("err_email_inv"));
      setForgotStatus("error");
      return;
    }
    setForgotStatus("loading");
    try {
      const res = await fetch(`${API_URL}/api/admin/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (res.ok) {
        setForgotStatus("sent");
        setForgotMsg(T("forgot_sent_msg"));
      } else {
        setForgotStatus("error");
        setForgotMsg(T("err_reset"));
      }
    } catch {
      setForgotStatus("error");
      setForgotMsg(T("err_server"));
    }
  };

  const modules = [T("pill1"),T("pill2"),T("pill3"),T("pill4"),T("pill5"),T("pill6")];

  return (
    <>
      <div className="adm-root">
        <div className="adm-left">
          <div className="adm-left-bg" />
          <div className="adm-blob1" />
          <div className="adm-blob2" />
          <div className="adm-blob3" />
          <div className="adm-left-content">
            <div className="adm-logo-area">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="adm-logo-img" />
              <div className="adm-logo-text">
                <div className="adm-logo-name">
                  <span>Binnie's</span> English Training
                </div>
                <div className="adm-logo-sub">{T("cert_center")}</div>
              </div>
            </div>
            <h1 className="adm-headline">
              {T("headline1")}<br />{T("headline2")}<br />
              <span>{T("headline3")}</span>
            </h1>
            <p className="adm-sub">{T("sub")}</p>
            <div className="adm-pills">
              {modules.map((m) => (
                <span key={m} className="adm-pill">
                  {m}
                </span>
              ))}
            </div>
            <div className="adm-stats">
              <div className="adm-stat">
                <div className="adm-stat-n">1 284</div>
                <div className="adm-stat-l">{T("stat_users")}</div>
              </div>
              <div className="adm-stat">
                <div className="adm-stat-n">99.9%</div>
                <div className="adm-stat-l">{T("stat_uptime")}</div>
              </div>
              <div className="adm-stat">
                <div className="adm-stat-n">247</div>
                <div className="adm-stat-l">{T("stat_sessions")}</div>
              </div>
              <div className="adm-stat">
                <div className="adm-stat-n">SSL</div>
                <div className="adm-stat-l">{T("stat_ssl")}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="adm-right">
          <div className="adm-profile-switch">
            {/* <button className="adm-switch-btn" onClick={() => navigate("/login-apprenant")}>Apprenant</button> */}
            <button className="adm-switch-btn active">{T("btn_staff")}</button>
          </div>

          <div className="adm-form-wrap">
            <div className="adm-header">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="adm-logo-img" />
              <div className="adm-header-sep" />
              <div className="adm-header-role">
                {selectedRole ? PROFILS_BET.find(p=>p.id===selectedRole)?.label : T("btn_staff")}
              </div>
            </div>

            {/* Session déjà active - retour arrière navigateur pendant qu'on est connecté */}
            {sessionExistante && !sessionIgnoree && (
              <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:12, padding:"14px 16px", marginBottom:18, display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ fontSize:13, color:"#1e3a8a" }}>
                  ✅ Vous êtes déjà connecté(e) en tant que <strong>{sessionExistante.prenom} {sessionExistante.nom}</strong> ({roleLabelSession}).
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button onClick={continuerVersDashboard} style={{ padding:"8px 16px", background:"#1B3080", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontWeight:700, fontSize:12 }}>
                    → Continuer vers mon espace
                  </button>
                  <button onClick={seDeconnecterPourChanger} style={{ padding:"8px 16px", background:"#fff", color:"#1e3a8a", border:"1px solid #bfdbfe", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:12 }}>
                    Se déconnecter pour changer de compte
                  </button>
                </div>
              </div>
            )}

            {/* ── ÉTAPE 0 : Sélection du profil ── */}
            {step === 0 && (
              <>
                <div className="adm-welcome">{T("role_select_q")}</div>
                <h2 className="adm-title">{T("role_select_h")}<br />{T("role_select_h2")}</h2>
                <p className="adm-desc">{T("role_select_d")}</p>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:20 }}>
                  {PROFILS_BET.map(p => (
                    <button key={p.id} type="button" onClick={()=>{setSelectedRole(p.id);setStep(1);setError("");}}
                      style={{ padding:"12px 10px", borderRadius:12, border:`2px solid ${selectedRole===p.id?p.color:"#e2e8f0"}`,
                        background:p.bg, cursor:"pointer", textAlign:"left", transition:"all .2s",
                        boxShadow: selectedRole===p.id?`0 0 0 3px ${p.color}30`:"none" }}>
                      <div style={{ fontSize:22, marginBottom:4 }}>{p.emoji}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:p.color }}>{p.label}</div>
                      <div style={{ fontSize:10, color:"#64748b", marginTop:2 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ── ÉTAPES 1-3 : Formulaire de connexion ── */}
            {step >= 1 && (
              <>
                {selectedRole && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10,
                    background: PROFILS_BET.find(p=>p.id===selectedRole)?.bg,
                    border:`1.5px solid ${PROFILS_BET.find(p=>p.id===selectedRole)?.color}40`,
                    marginBottom:16 }}>
                    <span style={{ fontSize:22 }}>{PROFILS_BET.find(p=>p.id===selectedRole)?.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color: PROFILS_BET.find(p=>p.id===selectedRole)?.color }}>
                        {PROFILS_BET.find(p=>p.id===selectedRole)?.label}
                      </div>
                      <div style={{ fontSize:11, color:"#64748b" }}>{PROFILS_BET.find(p=>p.id===selectedRole)?.desc}</div>
                    </div>
                    <button type="button" onClick={()=>{setStep(0);setSelectedRole(null);setError("");setEmail("");setPassword("");}}
                      style={{ fontSize:11, color:"#64748b", background:"none", border:"1px solid #e2e8f0", borderRadius:6, padding:"3px 8px", cursor:"pointer" }}>
                      {T("change_btn")}
                    </button>
                  </div>
                )}
                <h2 className="adm-title">
                  {step === 1 && <>{T("step_login_h")}<br />{T("step_login_s")}</>}
                  {step === 2 && <>{T("step_2fa_h")}<br />{T("step_2fa_s")}</>}
                  {step === 3 && <>{T("step_enroll_h")}<br />{T("step_enroll_s")}</>}
                </h2>
                <p className="adm-desc">
                  {step === 1 && T("desc_step1")}
                  {step === 2 && T("desc_step2")}
                  {step === 3 && T("desc_step3")}
                </p>
              </>
            )}

            {error && <div className="adm-error">⚠️ {error}</div>}

            {step === 1 && (
              <form onSubmit={handleStep1}>
                <div className="adm-security">{T("secure")}</div>
                <div className="adm-field">
                  <label className="adm-label">{T("email")}</label>
                  <div className="adm-input-wrap">
                    <span className="adm-input-icon">✉️</span>
                    <input
                      className="adm-input"
                      type="email"
                      placeholder="admin@bet.ci"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="adm-field">
                  <label className="adm-label">{T("password")}</label>
                  <div className="adm-input-wrap">
                    <span className="adm-input-icon">🔒</span>
                    <input
                      className="adm-input"
                      type={showPwd ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="adm-eye"
                      onClick={() => setShowPwd((v) => !v)}
                    >
                      {showPwd ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>
                <div className="adm-forgot">
                  <a href="#" onClick={e => { e.preventDefault(); setForgotOpen(true); setForgotStatus("idle"); setForgotEmail(email || ""); setForgotMsg(""); }}>
                    {T("forgot")}
                  </a>
                </div>
                <button className="adm-btn" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <div className="adm-spinner" /> {T("logging_in")}
                    </>
                  ) : (
                    <>{T("login_btn")}</>
                  )}
                </button>
                <div className="adm-footer" style={{ marginTop: 18 }}>
                  {T("support")} <a href="#">{T("contact")}</a>
                </div>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleStep2}>
                <div className="adm-security">{T("desc_step2")}</div>
                <div className="adm-field">
                  <label className="adm-label">{T("otp_confirm_h")}</label>
                  <div className="adm-otp-row">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <input
                        key={i}
                        className="adm-otp-inp"
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={twofa[i] || ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/, "");
                          const arr = twofa.split("");
                          arr[i] = v;
                          setTwofa(arr.join("").slice(0, 6));
                          if (v && e.target.nextElementSibling)
                            e.target.nextElementSibling.focus();
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Backspace" &&
                            !twofa[i] &&
                            e.target.previousElementSibling
                          )
                            e.target.previousElementSibling.focus();
                        }}
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>
                  <p className="adm-otp-hint">{T("otp_hint")}</p>
                </div>
                <button
                  className="adm-btn"
                  type="submit"
                  disabled={loading || twofa.length !== 6}
                  style={{ opacity: twofa.length === 6 && !loading ? 1 : 0.5 }}
                >
                  {loading ? (
                    <>
                      <div className="adm-spinner" /> {T("verifying")}
                    </>
                  ) : (
                    <>{T("verify_btn")}</>
                  )}
                </button>
                <button
                  type="button"
                  className="adm-btn-back"
                  onClick={() => {
                    setStep(1);
                    setTwofa("");
                    setError("");
                  }}
                >
                  {T("back_ids")}
                </button>
                <div className="adm-footer">
                  {T("otp_footer")}
                </div>
              </form>
            )}

            {/* ── Étape 3 : enrôlement TOTP (premier usage) ── */}
            {step === 3 && (
              <form onSubmit={handleStep3}>
                <div className="adm-security">{T("desc_step3")}</div>

                {qrCode && (
                  <div style={{ textAlign:"center", margin:"12px 0" }}>
                    <div
                      dangerouslySetInnerHTML={{ __html: qrCode }}
                      style={{ display:"inline-block", background:"#fff", padding:10, borderRadius:12, border:"1.5px solid #e2e8f0" }}
                    />
                  </div>
                )}

                <div style={{ marginBottom:14 }}>
                  <button
                    type="button"
                    onClick={() => setShowSecret(v => !v)}
                    style={{ fontSize:11, color:"#1B3080", background:"none", border:"none", cursor:"pointer", textDecoration:"underline", padding:0 }}
                  >
                    {showSecret ? T("secret_hide") : T("secret_show")}
                  </button>
                  {showSecret && secret && (
                    <div style={{ marginTop:8, padding:"8px 12px", background:"#f1f5f9", borderRadius:8, fontFamily:"monospace", fontSize:13, letterSpacing:"0.1em", color:"#0f172a", wordBreak:"break-all" }}>
                      {secret}
                    </div>
                  )}
                </div>

                <div className="adm-field">
                  <label className="adm-label">{T("otp_confirm_h")}</label>
                  <div className="adm-otp-row">
                    {[0,1,2,3,4,5].map((i) => (
                      <input
                        key={i}
                        className="adm-otp-inp"
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={twofa[i] || ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/, "");
                          const arr = twofa.split("");
                          arr[i] = v;
                          setTwofa(arr.join("").slice(0, 6));
                          if (v && e.target.nextElementSibling) e.target.nextElementSibling.focus();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !twofa[i] && e.target.previousElementSibling)
                            e.target.previousElementSibling.focus();
                        }}
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>
                  <p className="adm-otp-hint">{T("otp_confirm_d")}</p>
                </div>

                <button
                  className="adm-btn"
                  type="submit"
                  disabled={loading || twofa.length !== 6}
                  style={{ opacity: twofa.length === 6 && !loading ? 1 : 0.5 }}
                >
                  {loading ? <><div className="adm-spinner" /> {T("activating")}</> : <>{T("activate_btn")}</>}
                </button>
                <div className="adm-footer" style={{ marginTop:12 }}>
                  {T("enroll_footer")}
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
      {/* ── Modal "Mot de passe oublié" ── */}
      {forgotOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setForgotOpen(false); }}>
          <div style={{ background:"#fff", borderRadius:20, padding:"32px 36px", width:"100%", maxWidth:420, boxShadow:"0 24px 60px rgba(0,0,0,0.2)", animation:"admFadeIn .25s ease" }}>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{T("forgot_title")}</h3>
              <button onClick={() => setForgotOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#94a3b8", lineHeight:1 }}>✕</button>
            </div>

            {forgotStatus === "sent" ? (
              <div>
                <div style={{ fontSize:40, textAlign:"center", marginBottom:16 }}>📬</div>
                <p style={{ fontSize:14, color:"#374151", lineHeight:1.7, textAlign:"center", marginBottom:24 }}>{forgotMsg}</p>
                <button onClick={() => setForgotOpen(false)}
                  style={{ width:"100%", padding:"12px", background:"linear-gradient(135deg,#1B3080,#0d1a4a)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  {t("common","close")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit}>
                <p style={{ fontSize:13, color:"#64748b", lineHeight:1.7, marginBottom:20 }}>
                  {T("forgot_desc")}
                </p>

                {forgotStatus === "error" && (
                  <div style={{ padding:"10px 14px", background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:10, fontSize:13, color:"#be123c", marginBottom:14 }}>
                    ⚠️ {forgotMsg}
                  </div>
                )}

                <div style={{ marginBottom:20 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:7 }}>{T("forgot_label")}</label>
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}>✉️</span>
                    <input
                      type="email"
                      placeholder="admin@bet.ci"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      autoFocus
                      style={{ width:"100%", padding:"12px 14px 12px 44px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:14, fontFamily:"'Montserrat','Segoe UI',sans-serif", outline:"none", boxSizing:"border-box" }}
                      onFocus={e => { e.target.style.borderColor="#1B3080"; e.target.style.boxShadow="0 0 0 3px rgba(27,48,128,0.1)"; }}
                      onBlur={e => { e.target.style.borderColor="#e2e8f0"; e.target.style.boxShadow="none"; }}
                    />
                  </div>
                </div>

                <button type="submit" disabled={forgotStatus === "loading"}
                  style={{ width:"100%", padding:"13px", background:"linear-gradient(135deg,#1B3080,#0d1a4a)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor: forgotStatus === "loading" ? "not-allowed" : "pointer", opacity: forgotStatus === "loading" ? 0.7 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {forgotStatus === "loading"
                    ? <><div className="adm-spinner" /> {T("forgot_sending")}</>
                    : <>{T("forgot_send")}</>}
                </button>
                <button type="button" onClick={() => setForgotOpen(false)}
                  style={{ width:"100%", padding:"11px", background:"transparent", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:13, color:"#64748b", cursor:"pointer", marginTop:10 }}>
                  {t("common","cancel")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        .adm-right::-webkit-scrollbar { width: 4px; }
        .adm-right::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .adm-right::-webkit-scrollbar-track { background: transparent; }
        .adm-root { display: flex; height: 100vh; width: 100vw; font-family: 'Montserrat','Segoe UI',sans-serif; }

        .adm-left { width: 52%; position: relative; overflow: hidden; background: #1B3080; }
        .adm-left-bg { position: absolute; inset: 0; background: linear-gradient(160deg, #0d1a4a 0%, #1B3080 40%, #1e3a8a 70%, #2a4aad 100%); }
        .adm-blob1 { position: absolute; width: 420px; height: 420px; border-radius: 50%; background: rgba(27,48,128,0.22); top: -80px; left: -100px; animation: admFloat 8s ease-in-out infinite; }
        .adm-blob2 { position: absolute; width: 300px; height: 300px; border-radius: 50%; background: rgba(13,26,74,0.3); bottom: -60px; right: -60px; animation: admFloat 11s ease-in-out infinite reverse; }
        .adm-blob3 { position: absolute; width: 180px; height: 180px; border-radius: 50%; background: rgba(232,39,58,0.12); top: 40%; left: 55%; animation: admFloat 7s ease-in-out infinite 2s; }
        @keyframes admFloat { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(15px,-20px) scale(1.04)} }

        .adm-left-content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 60px 56px; }
        .adm-logo-area { display: flex; align-items: center; gap: 14px; margin-bottom: 44px; }
        .adm-logo-img { height: 60px; width: 60px; object-fit: contain; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4)); }
        .adm-logo-text { display: flex; flex-direction: column; gap: 1px; }
        .adm-logo-name { font-family: 'Montserrat','Segoe UI',sans-serif; font-size: 17px; font-weight: 900; color: #fff; letter-spacing: 0.02em; line-height: 1.1; }
        .adm-logo-name span { color: #f87171; }
        .adm-logo-sub { font-size: 10px; font-weight: 400; color: rgba(255,255,255,0.5); letter-spacing: 0.18em; text-transform: uppercase; }
        .adm-headline { font-family: 'Montserrat','Segoe UI',sans-serif; font-size: 46px; font-weight: 900; line-height: 1.08; color: #fff; margin-bottom: 20px; }
        .adm-headline span { color: #f87171; }
        .adm-sub { font-size: 15px; font-weight: 300; color: rgba(255,255,255,0.65); line-height: 1.7; margin-bottom: 40px; max-width: 380px; }
        .adm-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 36px; }
        .adm-pill { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.15); letter-spacing: 0.04em; transition: all .3s; }
        .adm-pill:hover { background: rgba(232,39,58,0.22); color: #f87171; border-color: rgba(232,39,58,0.45); }
        .adm-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .adm-stat { padding: 15px 18px; border-radius: 14px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px); }
        .adm-stat-n { font-size: 24px; font-weight: 700; color: #f87171; font-family: 'Montserrat','Segoe UI',sans-serif; }
        .adm-stat-l { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 3px; font-weight: 300; }

        .adm-right { flex: 1; background: #f8fafc; display: flex; align-items: flex-start; justify-content: center; padding: 48px 52px; position: relative; overflow-y: auto; }
        .adm-right::before { content: ''; position: absolute; bottom: -80px; right: -80px; width: 280px; height: 280px; border-radius: 50%; background: rgba(27,48,128,0.06); }
        .adm-right::after  { content: ''; position: absolute; top: -60px; left: -60px; width: 200px; height: 200px; border-radius: 50%; background: rgba(232,39,58,0.04); }

        /* Centrage par marge auto, pas par align-items:center sur le parent : l'alignement
           rend inatteignable ce qui dépasse par le haut d'un conteneur scrollable - c'est
           ce qui empêchait d'atteindre « Continuer vers mon espace » sur un 13 pouces. */
        .adm-form-wrap { width: 100%; max-width: 380px; position: relative; z-index: 1; margin: auto; }
        .adm-header { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
        .adm-header-logo { height: 40px; object-fit: contain; }
        .adm-header-sep { width: 1px; height: 32px; background: #e2e8f0; }
        .adm-header-role { font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: 0.12em; text-transform: uppercase; }
        .adm-welcome { font-size: 13px; font-weight: 600; color: #1B3080; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
        .adm-title { font-family: 'Montserrat','Segoe UI',sans-serif; font-size: 34px; font-weight: 700; color: #0f172a; margin-bottom: 6px; line-height: 1.15; }
        .adm-desc { font-size: 14px; color: #64748b; font-weight: 300; margin-bottom: 24px; }

        .adm-steps { display: flex; gap: 8px; align-items: center; margin-bottom: 22px; }
        .adm-step { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; transition: all .3s; flex-shrink: 0; }
        .adm-step.done    { background: #1B3080; color: #fff; }
        .adm-step.current { background: #1B3080; color: #fff; box-shadow: 0 0 0 4px rgba(27,48,128,0.15); }
        .adm-step.pending { background: #e2e8f0; color: #94a3b8; }
        .adm-step-line { flex: 1; height: 2px; background: #e2e8f0; border-radius: 2px; overflow: hidden; }
        .adm-step-fill  { height: 100%; background: #1B3080; transition: width .5s ease; }
        .adm-step-label { font-size: 11px; color: #94a3b8; white-space: nowrap; }

        .adm-field { margin-bottom: 18px; }
        .adm-label { display: block; font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 7px; letter-spacing: 0.04em; }
        .adm-input-wrap { position: relative; }
        .adm-input { width: 100%; padding: 13px 16px 13px 44px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: 'Montserrat','Segoe UI',sans-serif; background: #fff; color: #0f172a; outline: none; transition: border-color .25s, box-shadow .25s; }
        .adm-input:focus { border-color: #1B3080; box-shadow: 0 0 0 4px rgba(27,48,128,0.1); }
        .adm-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
        .adm-eye { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; cursor: pointer; color: #94a3b8; transition: color .2s; background: none; border: none; padding: 0; }
        .adm-eye:hover { color: #1B3080; }
        .adm-forgot { text-align: right; margin-top: -10px; margin-bottom: 20px; }
        .adm-forgot a { font-size: 12px; color: #1B3080; text-decoration: none; font-weight: 500; }
        .adm-forgot a:hover { color: #E8273A; text-decoration: underline; }
        .adm-error { padding: 10px 14px; border-radius: 10px; background: #fff1f2; border: 1px solid #fecdd3; font-size: 13px; color: #be123c; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }

        .adm-otp-row { display: flex; gap: 10px; justify-content: space-between; margin-bottom: 10px; }
        .adm-otp-inp { width: 48px; height: 56px; border: 1.5px solid #e2e8f0; border-radius: 12px; text-align: center; font-size: 22px; font-weight: 700; font-family: 'Montserrat','Segoe UI',sans-serif; color: #0f172a; background: #fff; outline: none; transition: border-color .25s, box-shadow .25s; }
        .adm-otp-inp:focus { border-color: #1B3080; box-shadow: 0 0 0 4px rgba(27,48,128,0.1); }
        .adm-otp-hint { font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 22px; }

        .adm-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #1B3080, #0d1a4a); color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 500; font-family: 'DM Sans', sans-serif; cursor: pointer; letter-spacing: 0.03em; transition: transform .15s, box-shadow .15s; display: flex; align-items: center; justify-content: center; gap: 8px; position: relative; overflow: hidden; }
        .adm-btn::after { content: ''; position: absolute; inset: 0; background: rgba(255,255,255,0); transition: background .2s; }
        .adm-btn:hover::after { background: rgba(255,255,255,0.09); }
        .adm-btn:hover { box-shadow: 0 8px 24px rgba(27,48,128,0.32); transform: translateY(-1px); }
        .adm-btn:active { transform: translateY(0); box-shadow: none; }
        .adm-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .adm-btn-back { width: 100%; padding: 11px; background: transparent; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: 'Montserrat','Segoe UI',sans-serif; color: #64748b; cursor: pointer; margin-top: 10px; transition: border-color .2s, color .2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .adm-btn-back:hover { border-color: #1B3080; color: #1B3080; }
        .adm-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: admspin .7s linear infinite; }
        @keyframes admspin { to { transform: rotate(360deg); } }
        @keyframes admFadeIn { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }

        .adm-security { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: #eef2ff; border: 1px solid #c7d2fe; font-size: 12px; color: #1B3080; font-weight: 500; margin-bottom: 18px; }

        .adm-footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 20px; }
        .adm-footer a { color: #1B3080; text-decoration: none; font-weight: 500; }
        .adm-footer a:hover { color: #E8273A; }
        .adm-profile-switch { position: absolute; top: 22px; right: 22px; display: flex; gap: 5px; z-index: 10; }
        .adm-switch-btn { padding: 7px 14px; border-radius: 20px; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 500; cursor: pointer; background: #fff; color: #64748b; transition: all .2s; font-family: 'Montserrat','Segoe UI',sans-seriff; }
        .adm-switch-btn:hover { border-color: #1B3080; color: #1B3080; background: #eef2ff; }
        .adm-switch-btn.active { background: #1B3080; color: #fff; border-color: #1B3080; }

        /* ── Écrans courts : 13 pouces (1280×800, 1366×768) ──────────────────────────
           La page est haute de 100vh sans défilement du body : tout ce qui dépasse doit
           tenir dans la colonne de droite. On rend d'abord l'espace vertical, avant de
           compter sur le scroll - dix-huit cartes de rôles ne tiennent pas en 768 px. */
        @media (max-height: 860px) {
          .adm-right        { padding: 28px 44px; }
          .adm-header       { margin-bottom: 16px; }
          .adm-title        { font-size: 26px; }
          .adm-left-content { padding: 36px 48px; }
          .adm-headline     { font-size: 36px; margin-bottom: 14px; }
          .adm-sub          { margin-bottom: 24px; line-height: 1.55; }
          .adm-stats        { gap: 9px; }
        }
        @media (max-height: 760px) {
          .adm-right    { padding: 20px 36px; }
          .adm-title    { font-size: 23px; }
          .adm-headline { font-size: 31px; }
          /* Les statistiques décoratives cèdent la place avant le contenu utile. */
          .adm-stats    { display: none; }
        }
      `}</style>
    </>
  );
}