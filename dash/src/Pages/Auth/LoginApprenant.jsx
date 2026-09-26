// src/Pages/Auth/LoginApprenant.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { supabase } from "../../config/supabase";
import { clearAllSessionStorage } from "../../utils/session";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

// Étapes de vérification post-login
const STEPS = [
  { key: "compte_actif",   label: "Compte vérifié",           icon: "🔐" },
  { key: "classe_trouvee", label: "Affectation à une classe", icon: "🏫" },
  { key: "coach_assigne",  label: "Coach assigné",            icon: "👨‍🏫" },
  { key: "classe_active",  label: "Classe ouverte",           icon: "✅" },
];

export default function LoginApprenant() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const T = (k) => t("loginApprenant", k);

  const [identifier, setIdentifier] = useState(""); // email ou téléphone
  const [password, setPassword]     = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  /* Les coordonnées viennent de « Coordonnées centrales » (config_contact), la même
     source que le footer et la page Contact. Elles étaient écrites en dur ici, et
     fausses des deux côtés : un indicatif sénégalais (+221) pour un centre d'Abidjan,
     un numéro resté à l'état de gabarit, et un domaine e-mail inexistant. Les figer à
     nouveau garantirait qu'elles redeviennent fausses au prochain changement. */
  const REPLI = { tel: "+225 27 22 40 71 99", email: "contact@binniesenglish.com" };
  const [contactBET, setContactBET] = useState(REPLI);
  useEffect(() => {
    fetch(`${API_URL}/api/config-contact`)
      .then(r => (r.ok ? r.json() : null))
      .then(c => {
        if (!c) return;
        const brut = c.whatsapp_number || "";
        setContactBET({
          tel:   brut ? (brut.trim().startsWith("+") ? brut.trim() : `+${brut.trim()}`) : REPLI.tel,
          email: c.email_central || REPLI.email,
        });
      })
      .catch(() => { /* le repli reste affiché : une page de connexion ne doit pas dépendre du réseau */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // État "en attente" (compte créé mais conditions pas remplies)
  const [pendingData, setPendingData] = useState(null);

  // Mot de passe oublié
  // Mot de passe oublié - forgotEmail = email ou téléphone
  const [forgotOpen,   setForgotOpen]   = useState(false);
  const [forgotEmail,  setForgotEmail]  = useState("");
  const [forgotStatus, setForgotStatus] = useState("idle");
  const [forgotMsg,    setForgotMsg]    = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setPendingData(null);
    if (!identifier || !password) { setError(T("err_fields")); return; }
    setLoading(true);
    try {
      // Étape 1 : résoudre téléphone → email virtuel si besoin
      let loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        // Numéro de téléphone → chercher l'email via le backend
        const res = await fetch(`${API_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: loginEmail, password }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || T("err_fields")); return; }
        // Connexion par téléphone réussie via backend
        const token = data.session.access_token;
        localStorage.setItem("user_token",   token);
        localStorage.setItem("user_refresh", data.session.refresh_token);
        localStorage.setItem("user",         JSON.stringify(data.user));
        return await verifierAcces(token);
      }

      // Étape 1b : connexion email → directement via Supabase client
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email:    loginEmail,
        password: password,
      });
      if (authErr) {
        setError("Email ou mot de passe incorrect.");
        return;
      }

      // Vérification suspension globale - le JWT généré contient l'app_metadata actuel
      if (authData.user?.app_metadata?.acces_bloque === true) {
        // Le motif est deja dans le JWT, a cote de acces_bloque : aucune requete de plus.
        const motif = authData.user.app_metadata.blocage_message;
        await supabase.auth.signOut();
        setError(motif
          || "Vos accès sont momentanément bloqués. Veuillez contacter votre assistante commerciale.");
        return;
      }

      const token = authData.session.access_token;
      localStorage.setItem("user_token",   token);
      localStorage.setItem("user_refresh", authData.session.refresh_token);
      localStorage.setItem("user",         JSON.stringify({
        id:     authData.user.id,
        email:  authData.user.email,
        nom:    authData.user.user_metadata?.nom    || "",
        prenom: authData.user.user_metadata?.prenom || "",
      }));

      await verifierAcces(token);
    } catch {
      setError(T("err_server"));
    } finally {
      setLoading(false);
    }
  };

  const verifierAcces = async (token) => {
    // Vérifier la suspension globale (couvre le chemin téléphone)
    try {
      const suspRes = await fetch(`${API_URL}/api/apprenants/check-acces`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (suspRes.ok) {
        const suspData = await suspRes.json();
        if (suspData.acces_bloque === true) {
          await supabase.auth.signOut();
          clearAllSessionStorage();
          setError(suspData.blocage_message
            || "Vos accès sont momentanément bloqués. Veuillez contacter votre assistante commerciale.");
          return;
        }
      }
    } catch {}

    // Vérification des conditions d'accès (classe, coach, etc.)
    const check = await fetch(`${API_URL}/api/apprenants/mon-espace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const checkData = check.ok ? await check.json() : null;
    if (checkData?.actif) {
      navigate("/espace-apprenant");
    } else {
      setPendingData(checkData);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail) { setForgotMsg("Identifiant requis"); setForgotStatus("error"); return; }
    // If it's a phone number → no reset possible, show message
    if (!forgotEmail.includes("@")) {
      setForgotMsg(`La réinitialisation par SMS n'est pas disponible. Contactez l'administration au ${contactBET.tel}.`);
      setForgotStatus("error");
      return;
    }
    setForgotStatus("loading");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setForgotStatus("error"); setForgotMsg(T("err_reset"));
      } else {
        setForgotStatus("sent"); setForgotMsg(T("forgot_sent_msg"));
      }
    } catch {
      setForgotStatus("error"); setForgotMsg(T("err_server"));
    }
  };

  const handleLogout = () => {
    clearAllSessionStorage();
    setPendingData(null);
    setIdentifier("");
    setPassword("");
  };

  const pills = [T("pill1"),T("pill2"),T("pill3"),T("pill4"),T("pill5"),T("pill6")];

  // ── Écran d'attente si le dossier est incomplet ──────────────
  if (pendingData) {
    const { profil, statut_detail = {}, message_blocage, groupe } = pendingData;
    const prenom = profil?.prenom || "";
    const nom    = profil?.nom    || "";

    return (
      <>
        <div className="app-root">
          {/* Côté gauche identique */}
          <div className="app-left">
            <div className="app-left-bg" />
            <div className="app-blob1" /><div className="app-blob2" /><div className="app-blob3" />
            <div className="app-left-content">
              <div className="app-logo-area">
                <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="app-logo-img" />
                <div className="app-logo-text">
                  <div className="app-logo-name"><span>Binnie's</span> English Training</div>
                  <div className="app-logo-sub">{T("cert_center")}</div>
                </div>
              </div>
              <h1 className="app-headline">
                {T("headline1")}<br />{T("headline2")}<br /><span>{T("headline3")}</span>
              </h1>
              <p className="app-sub">{T("sub")}</p>
              <div className="app-pills">
                {pills.map(p => <span key={p} className="app-pill">{p}</span>)}
              </div>
              <div className="app-stats">
                <div className="app-stat"><div className="app-stat-n">1 284</div><div className="app-stat-l">{T("stat_users")}</div></div>
                <div className="app-stat"><div className="app-stat-n">94%</div><div className="app-stat-l">{T("stat_success")}</div></div>
                <div className="app-stat"><div className="app-stat-n">24/7</div><div className="app-stat-l">{T("stat_access")}</div></div>
                <div className="app-stat"><div className="app-stat-n">A1→C2</div><div className="app-stat-l">{T("stat_levels")}</div></div>
              </div>
            </div>
          </div>

          {/* Côté droit - écran d'attente */}
          <div className="app-right">
            <div className="app-form-wrap">
              {/* Avatar + nom */}
              <div style={{ textAlign:"center", marginBottom:28 }}>
                <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#059669,#047857)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, margin:"0 auto 14px", boxShadow:"0 4px 18px rgba(5,150,105,0.3)" }}>
                  {prenom ? prenom[0].toUpperCase() : "👤"}
                </div>
                <div style={{ fontSize:20, fontWeight:800, color:"#0f172a" }}>Bonjour, {prenom} {nom} 👋</div>
                <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>{profil?.display_identifier || profil?.email}</div>
              </div>

              {/* Bandeau info */}
              <div style={{ padding:"14px 18px", background:"#fffbeb", border:"1px solid #fde68a", borderRadius:12, marginBottom:24, display:"flex", gap:12, alignItems:"flex-start" }}>
                <span style={{ fontSize:22, flexShrink:0 }}>⏳</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#92400e", marginBottom:3 }}>Dossier en cours de traitement</div>
                  <div style={{ fontSize:12, color:"#78350f", lineHeight:1.6 }}>{message_blocage}</div>
                </div>
              </div>

              {/* Checklist des conditions */}
              <div style={{ marginBottom:28 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>
                  Statut de votre dossier
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {STEPS.map(step => {
                    const ok = !!statut_detail[step.key];
                    return (
                      <div key={step.key} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, background: ok ? "#f0fdf4" : "#f8fafc", border:`1px solid ${ok ? "#a7f3d0" : "#e2e8f0"}` }}>
                        <div style={{ width:28, height:28, borderRadius:"50%", background: ok ? "#059669" : "#e2e8f0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>
                          {ok ? "✓" : step.icon}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color: ok ? "#065f46" : "#374151" }}>{step.label}</div>
                          {step.key === "classe_trouvee" && groupe?.groupes?.nom && (
                            <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>Classe : {groupe.groupes.nom}</div>
                          )}
                          {step.key === "coach_assigne" && ok && groupe?.groupes?.utilisateurs && (
                            <div style={{ fontSize:11, color:"#6b7280", marginTop:1 }}>
                              Coach : {groupe.groupes.utilisateurs.prenom} {groupe.groupes.utilisateurs.nom}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize:12, fontWeight:700, color: ok ? "#059669" : "#9ca3af", flexShrink:0 }}>
                          {ok ? "✅ OK" : "⏳ En attente"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Info contact */}
              <div style={{ padding:"12px 16px", background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10, fontSize:12, color:"#0369a1", marginBottom:20, lineHeight:1.6, textAlign:"center" }}>
                Pour toute question, contactez-nous au <strong>{contactBET.tel}</strong><br />ou par email à <strong>{contactBET.email}</strong>
              </div>

              {/* Bouton déconnexion */}
              <button onClick={handleLogout}
                style={{ width:"100%", padding:"12px", background:"transparent", border:"1.5px solid #e2e8f0", borderRadius:12, fontSize:13, fontWeight:600, color:"#64748b", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                🚪 Se déconnecter et réessayer plus tard
              </button>
            </div>
          </div>
        </div>
        <style>{SHARED_CSS}</style>
      </>
    );
  }

  // ── Formulaire de connexion normal ───────────────────────────
  return (
    <>
      <div className="app-root">
        {/* ── Côté gauche ── */}
        <div className="app-left">
          <div className="app-left-bg" />
          <div className="app-blob1" /><div className="app-blob2" /><div className="app-blob3" />
          <div className="app-left-content">
            <div className="app-logo-area">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="app-logo-img" />
              <div className="app-logo-text">
                <div className="app-logo-name"><span>Binnie's</span> English Training</div>
                <div className="app-logo-sub">{T("cert_center")}</div>
              </div>
            </div>
            <h1 className="app-headline">
              {T("headline1")}<br />{T("headline2")}<br /><span>{T("headline3")}</span>
            </h1>
            <p className="app-sub">{T("sub")}</p>
            <div className="app-pills">
              {pills.map(p => <span key={p} className="app-pill">{p}</span>)}
            </div>
            <div className="app-stats">
              <div className="app-stat"><div className="app-stat-n">1 284</div><div className="app-stat-l">{T("stat_users")}</div></div>
              <div className="app-stat"><div className="app-stat-n">94%</div><div className="app-stat-l">{T("stat_success")}</div></div>
              <div className="app-stat"><div className="app-stat-n">24/7</div><div className="app-stat-l">{T("stat_access")}</div></div>
              <div className="app-stat"><div className="app-stat-n">A1→C2</div><div className="app-stat-l">{T("stat_levels")}</div></div>
            </div>
          </div>
        </div>

        {/* ── Côté droit ── */}
        <div className="app-right">
          <div className="app-profile-switch">
            <button className="app-switch-btn active">{T("btn_apprenant")}</button>
            <button className="app-switch-btn" onClick={() => navigate("/login-particulier")}>{T("btn_parent")}</button>
          </div>

          <div className="app-form-wrap">
            <div className="app-header">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="app-logo-img" />
              <div className="app-header-sep" />
              <div className="app-header-role">{T("role_label")}</div>
            </div>

            <div className="app-welcome">{T("welcome")}</div>
            <h2 className="app-title">{T("title1")}<br />{T("title2")}</h2>
            <p className="app-desc">{T("desc")}</p>

            {error && <div className="app-error">⚠️ {error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="app-security">{T("secure")}</div>
              <div className="app-field">
                <label className="app-label">Email ou numéro de téléphone</label>
                <div className="app-input-wrap">
                  <span className="app-input-icon">{identifier && !identifier.includes("@") ? "📱" : "✉️"}</span>
                  <input className="app-input" type="text" placeholder="Email ou téléphone (ex: 0701234567)"
                    value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" autoFocus />
                </div>
              </div>
              <div className="app-field">
                <label className="app-label">{T("password")}</label>
                <div className="app-input-wrap">
                  <span className="app-input-icon">🔒</span>
                  <input className="app-input" type={showPwd ? "text" : "password"} placeholder="••••••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                  <button type="button" className="app-eye" onClick={() => setShowPwd(v => !v)}>
                    {showPwd ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              <div className="app-forgot">
                <a href="#" onClick={e => { e.preventDefault(); setForgotOpen(true); setForgotStatus("idle"); setForgotEmail(identifier || ""); setForgotMsg(""); }}>
                  {T("forgot")}
                </a>
              </div>
              <button className="app-btn" type="submit" disabled={loading}>
                {loading
                  ? <><div className="app-spinner" /> {loading ? "Vérification en cours…" : T("logging_in")}</>
                  : <>{T("login_btn")}</>}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Modal Mot de passe oublié ── */}
      {forgotOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setForgotOpen(false); }}>
          <div style={{ background:"#fff", borderRadius:20, padding:"32px 36px", width:"100%", maxWidth:420, boxShadow:"0 24px 60px rgba(0,0,0,0.2)", animation:"appFadeIn .25s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{T("forgot_title")}</h3>
              <button onClick={() => setForgotOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>✕</button>
            </div>
            {forgotStatus === "sent" ? (
              <div>
                <div style={{ fontSize:40, textAlign:"center", marginBottom:16 }}>📬</div>
                <p style={{ fontSize:14, color:"#374151", lineHeight:1.7, textAlign:"center", marginBottom:24 }}>{forgotMsg}</p>
                <button onClick={() => setForgotOpen(false)}
                  style={{ width:"100%", padding:"12px", background:"linear-gradient(135deg,#059669,#047857)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  {t("common","close")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit}>
                <p style={{ fontSize:13, color:"#64748b", lineHeight:1.7, marginBottom:20 }}>{T("forgot_desc")}</p>
                {forgotStatus === "error" && (
                  <div style={{ padding:"10px 14px", background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:10, fontSize:13, color:"#be123c", marginBottom:14 }}>
                    ⚠️ {forgotMsg}
                  </div>
                )}
                <div style={{ marginBottom:20 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:7 }}>Email ou numéro de téléphone</label>
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}>{forgotEmail && !forgotEmail.includes("@") ? "📱" : "✉️"}</span>
                    <input type="text" placeholder="Email ou téléphone" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} autoFocus
                      style={{ width:"100%", padding:"12px 14px 12px 44px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:14, fontFamily:"'Montserrat','Segoe UI',sans-serif", outline:"none", boxSizing:"border-box" }}
                      onFocus={e => { e.target.style.borderColor="#059669"; e.target.style.boxShadow="0 0 0 3px rgba(5,150,105,0.1)"; }}
                      onBlur={e => { e.target.style.borderColor="#e2e8f0"; e.target.style.boxShadow="none"; }}
                    />
                  </div>
                </div>
                <button type="submit" disabled={forgotStatus==="loading"}
                  style={{ width:"100%", padding:"13px", background:"linear-gradient(135deg,#059669,#047857)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor: forgotStatus==="loading"?"not-allowed":"pointer", opacity: forgotStatus==="loading"?0.7:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {forgotStatus === "loading" ? <><div className="app-spinner" style={{ borderColor:"rgba(255,255,255,0.35)", borderTopColor:"#fff" }} /> {T("forgot_sending")}</> : <>{T("forgot_send")}</>}
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

      <style>{SHARED_CSS}</style>
    </>
  );
}

const SHARED_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { overflow: hidden; }
  .app-root { display: flex; height: 100vh; width: 100vw; font-family: 'Montserrat','Segoe UI',sans-serif; }
  .app-left { width: 52%; position: relative; overflow: hidden; background: #065f46; }
  .app-left-bg { position: absolute; inset: 0; background: linear-gradient(160deg, #022c22 0%, #065f46 40%, #047857 70%, #059669 100%); }
  .app-blob1 { position: absolute; width: 420px; height: 420px; border-radius: 50%; background: rgba(6,95,70,0.25); top: -80px; left: -100px; animation: appFloat 8s ease-in-out infinite; }
  .app-blob2 { position: absolute; width: 300px; height: 300px; border-radius: 50%; background: rgba(2,44,34,0.3); bottom: -60px; right: -60px; animation: appFloat 11s ease-in-out infinite reverse; }
  .app-blob3 { position: absolute; width: 180px; height: 180px; border-radius: 50%; background: rgba(16,185,129,0.15); top: 40%; left: 55%; animation: appFloat 7s ease-in-out infinite 2s; }
  @keyframes appFloat { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(15px,-20px) scale(1.04)} }
  .app-left-content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 60px 56px; }
  .app-logo-area { display: flex; align-items: center; gap: 14px; margin-bottom: 44px; }
  .app-logo-img { height: 60px; width: 60px; object-fit: contain; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4)); }
  .app-logo-text { display: flex; flex-direction: column; gap: 1px; }
  .app-logo-name { font-size: 17px; font-weight: 900; color: #fff; letter-spacing: 0.02em; line-height: 1.1; }
  .app-logo-name span { color: #6ee7b7; }
  .app-logo-sub { font-size: 10px; font-weight: 400; color: rgba(255,255,255,0.5); letter-spacing: 0.18em; text-transform: uppercase; }
  .app-headline { font-size: 46px; font-weight: 900; line-height: 1.08; color: #fff; margin-bottom: 20px; }
  .app-headline span { color: #6ee7b7; }
  .app-sub { font-size: 15px; font-weight: 300; color: rgba(255,255,255,0.65); line-height: 1.7; margin-bottom: 40px; max-width: 380px; }
  .app-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 36px; }
  .app-pill { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.15); transition: all .3s; }
  .app-pill:hover { background: rgba(110,231,183,0.2); color: #6ee7b7; border-color: rgba(110,231,183,0.45); }
  .app-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .app-stat { padding: 15px 18px; border-radius: 14px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px); }
  .app-stat-n { font-size: 24px; font-weight: 700; color: #6ee7b7; }
  .app-stat-l { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 3px; font-weight: 300; }
    /* Écrans courts (13 pouces : 1280×800, 1366×768) - la page tient en 100vh sans
     défilement du body, donc tout ce qui dépasse doit tenir dans la colonne de droite. */
  @media (max-height: 860px) {
    .app-right        { padding: 28px 44px; }
    .app-left-content { padding: 36px 48px; }
    .app-headline     { font-size: 36px; margin-bottom: 14px; }
    .app-stats        { gap: 9px; }
  }
  @media (max-height: 760px) {
    .app-right    { padding: 20px 36px; }
    .app-headline { font-size: 31px; }
    .app-stats    { display: none; }
  }
.app-right { flex: 1; background: #f8fafc; display: flex; align-items: flex-start; justify-content: center; padding: 48px 52px; position: relative; overflow-y: auto; }
  .app-right::before { content:''; position:absolute; bottom:-80px; right:-80px; width:280px; height:280px; border-radius:50%; background:rgba(5,150,105,0.06); }
  .app-right::after  { content:''; position:absolute; top:-60px; left:-60px; width:200px; height:200px; border-radius:50%; background:rgba(110,231,183,0.06); }
  .app-form-wrap { width: 100%; max-width: 400px; position: relative; z-index: 1; margin: auto; }
  .app-header { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
  .app-header-sep { width: 1px; height: 32px; background: #e2e8f0; }
  .app-header-role { font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: 0.12em; text-transform: uppercase; }
  .app-welcome { font-size: 13px; font-weight: 600; color: #059669; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
  .app-title { font-size: 34px; font-weight: 700; color: #0f172a; margin-bottom: 6px; line-height: 1.15; }
  .app-desc { font-size: 14px; color: #64748b; font-weight: 300; margin-bottom: 24px; }
  .app-field { margin-bottom: 18px; }
  .app-label { display: block; font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 7px; letter-spacing: 0.04em; }
  .app-input-wrap { position: relative; }
  .app-input { width: 100%; padding: 13px 16px 13px 44px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: 'Montserrat','Segoe UI',sans-serif; background: #fff; color: #0f172a; outline: none; transition: border-color .25s, box-shadow .25s; }
  .app-input:focus { border-color: #059669; box-shadow: 0 0 0 4px rgba(5,150,105,0.1); }
  .app-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
  .app-eye { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; cursor: pointer; color: #94a3b8; background: none; border: none; padding: 0; transition: color .2s; }
  .app-eye:hover { color: #059669; }
  .app-forgot { text-align: right; margin-top: -10px; margin-bottom: 20px; }
  .app-forgot a { font-size: 12px; color: #059669; text-decoration: none; font-weight: 500; }
  .app-forgot a:hover { color: #E8273A; text-decoration: underline; }
  .app-error { padding: 10px 14px; border-radius: 10px; background: #fff1f2; border: 1px solid #fecdd3; font-size: 13px; color: #be123c; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .app-security { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; font-size: 12px; color: #065f46; font-weight: 500; margin-bottom: 18px; }
  .app-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #059669, #047857); color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: 'Montserrat','Segoe UI',sans-serif; cursor: pointer; transition: transform .15s, box-shadow .15s; display: flex; align-items: center; justify-content: center; gap: 8px; position: relative; overflow: hidden; }
  .app-btn:hover { box-shadow: 0 8px 24px rgba(5,150,105,0.35); transform: translateY(-1px); }
  .app-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .app-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: appspin .7s linear infinite; flex-shrink: 0; }
  @keyframes appspin { to { transform: rotate(360deg); } }
  @keyframes appFadeIn { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
  .app-profile-switch { position: absolute; top: 22px; right: 22px; display: flex; gap: 5px; z-index: 10; }
  .app-switch-btn { padding: 7px 14px; border-radius: 20px; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 500; cursor: pointer; background: #fff; color: #64748b; transition: all .2s; font-family: 'Montserrat','Segoe UI',sans-serif; }
  .app-switch-btn:hover { border-color: #059669; color: #059669; background: #ecfdf5; }
  .app-switch-btn.active { background: #059669; color: #fff; border-color: #059669; }
`;
