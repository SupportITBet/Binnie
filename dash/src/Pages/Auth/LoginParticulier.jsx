// src/Pages/Auth/LoginParticulier.jsx
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export default function LoginParticulier() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const T = (k) => t("loginParticulier", k);

  const PROFILS = [
    { id:"parent", emoji:"👨‍👩‍👧", color:"#d97706", bg:"#fffbeb", route:"/dashboard/parent" },
    { id:"enfant", emoji:"🎒",      color:"#7c3aed", bg:"#f5f3ff", route:"/espace-apprenant" },
  ];

  // Un logout depuis le dashboard parent renvoie ici avec state.profil="parent" pour aller
  // directement au formulaire de connexion parent, sans repasser par le sélecteur de profil.
  const profilPreselectionne = location.state?.profil;
  const [selectedProfil, setSelectedProfil] = useState(profilPreselectionne || null);
  const [step, setStep]         = useState(profilPreselectionne ? 1 : 0);
  const [modeLogin, setModeLogin] = useState("email"); // 'email' | 'telephone' - parent uniquement
  const [email, setEmail]       = useState("");
  const [telephone, setTelephone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const [forgotOpen,   setForgotOpen]   = useState(false);
  const [forgotEmail,  setForgotEmail]  = useState("");
  const [forgotStatus, setForgotStatus] = useState("idle");
  const [forgotMsg,    setForgotMsg]    = useState("");

  const profil = PROFILS.find(p => p.id === selectedProfil);
  const activeColor = profil?.color || "#d97706";
  const activeBtnBg = profil?.id === "enfant"
    ? `linear-gradient(135deg,#7c3aed,#6d28d9)`
    : `linear-gradient(135deg,#d97706,#b45309)`;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    const parPhone = selectedProfil === "parent" && modeLogin === "telephone";
    if (parPhone ? (!telephone || !password) : (!email || !password)) { setError(T("err_fields")); return; }
    setLoading(true);
    try {
      let loginEmail = email;
      if (parPhone) {
        const rTel = await fetch(`${API_URL}/api/apprenants/resolve-phone-parent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telephone }),
        });
        const dTel = await rTel.json();
        if (!rTel.ok) { setError(dTel.error || T("err_fields")); setLoading(false); return; }
        loginEmail = dTel.email;
      }
      const res  = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || T("err_fields")); return; }
      localStorage.setItem("user_token",       data.session.access_token);
      localStorage.setItem("user_refresh",     data.session.refresh_token);
      localStorage.setItem("user",             JSON.stringify(data.user));
      localStorage.setItem("user_profil_type", selectedProfil);
      navigate(profil?.route || "/dashboard/parent");
    } catch {
      setError(T("err_server"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail || !forgotEmail.includes("@")) {
      setForgotMsg(T("err_email_inv")); setForgotStatus("error"); return;
    }
    setForgotStatus("loading");
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (res.ok) {
        setForgotStatus("sent"); setForgotMsg(T("forgot_sent_msg"));
      } else {
        setForgotStatus("error"); setForgotMsg(T("err_reset"));
      }
    } catch {
      setForgotStatus("error"); setForgotMsg(T("err_server"));
    }
  };

  const pills = [T("pill1"),T("pill2"),T("pill3"),T("pill4"),T("pill5"),T("pill6")];

  return (
    <>
      <div className="par-root">
        {/* ── Gauche ── */}
        <div className="par-left">
          <div className="par-left-bg" />
          <div className="par-blob1" /><div className="par-blob2" /><div className="par-blob3" />
          <div className="par-left-content">
            <div className="par-logo-area">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="par-logo-img" />
              <div className="par-logo-text">
                <div className="par-logo-name"><span>Binnie's</span> English Training</div>
                <div className="par-logo-sub">{T("cert_center")}</div>
              </div>
            </div>
            <h1 className="par-headline">
              {T("headline1")}<br />{T("headline2")}<br /><span>{T("headline3")}</span>
            </h1>
            <p className="par-sub">{T("sub")}</p>
            <div className="par-pills">
              {pills.map(p => <span key={p} className="par-pill">{p}</span>)}
            </div>
            <div className="par-stats">
              <div className="par-stat"><div className="par-stat-n">480+</div><div className="par-stat-l">{T("stat_families")}</div></div>
              <div className="par-stat"><div className="par-stat-n">94%</div><div className="par-stat-l">{T("stat_satisf")}</div></div>
              <div className="par-stat"><div className="par-stat-n">24/7</div><div className="par-stat-l">{T("stat_access")}</div></div>
              <div className="par-stat"><div className="par-stat-n">3–17</div><div className="par-stat-l">{T("stat_ages")}</div></div>
            </div>
          </div>
        </div>

        {/* ── Droite ── */}
        <div className="par-right">
          <div className="par-form-wrap">
            <div className="par-header">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="par-logo-img" />
              <div className="par-header-sep" />
              <div className="par-header-role">{T("role_label")}</div>
            </div>

            {/* ── ÉTAPE 0 : Choix profil ── */}
            {step === 0 && (
              <>
                <div className="par-welcome">{T("welcome")}</div>
                <h2 className="par-title">{T("who_title")}</h2>
                <p className="par-desc">{T("who_desc")}</p>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
                  {PROFILS.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setSelectedProfil(p.id); setStep(1); setError(""); }}
                      style={{ padding:"24px 16px", borderRadius:16, border:`2px solid ${p.color}30`,
                        background:p.bg, cursor:"pointer", textAlign:"center", transition:"all .2s",
                        boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}
                      onMouseEnter={e => { e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow=`0 8px 24px ${p.color}30`; e.currentTarget.style.borderColor=p.color; }}
                      onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor=`${p.color}30`; }}>
                      <div style={{ fontSize:36, marginBottom:10 }}>{p.emoji}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:p.color, marginBottom:6 }}>
                        {p.id === "parent" ? T("parent_label") : T("child_label")}
                      </div>
                      <div style={{ fontSize:11, color:"#64748b", lineHeight:1.4 }}>
                        {p.id === "parent" ? T("parent_desc") : T("child_desc")}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="par-footer">{T("no_account")} <a href="#">{T("contact_center")}</a></div>
              </>
            )}

            {/* ── ÉTAPE 1 : Login ── */}
            {step === 1 && (
              <>
                {profil && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:12,
                    background:profil.bg, border:`1.5px solid ${profil.color}40`, marginBottom:16 }}>
                    <span style={{ fontSize:24 }}>{profil.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:profil.color }}>
                        {profil.id === "parent" ? T("parent_label") : T("child_label")}
                      </div>
                      <div style={{ fontSize:11, color:"#64748b" }}>
                        {profil.id === "parent" ? T("parent_desc") : T("child_desc")}
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => { setStep(0); setSelectedProfil(null); setError(""); setEmail(""); setTelephone(""); setModeLogin("email"); setPassword(""); }}
                      style={{ fontSize:11, color:"#64748b", background:"none", border:"1px solid #e2e8f0", borderRadius:6, padding:"3px 8px", cursor:"pointer" }}>
                      {T("change_btn")}
                    </button>
                  </div>
                )}
                <h2 className="par-title" style={{ fontSize:28 }}>
                  {T("login_title")}<br />{T("login_sub")}
                </h2>
                <p className="par-desc">{T("login_desc")}</p>

                {error && <div className="par-error">⚠️ {error}</div>}

                <form onSubmit={handleLogin}>
                  <div className="par-security">{T("secure")}</div>

                  {selectedProfil === "parent" && (
                    <div style={{ display:"flex", background:"#f1f5f9", borderRadius:10, padding:4, gap:4, marginBottom:18 }}>
                      {[
                        { id:"email",     label:"✉️ Email" },
                        { id:"telephone", label:"📱 Téléphone" },
                      ].map(m => (
                        <button key={m.id} type="button"
                          onClick={() => { setModeLogin(m.id); setError(""); }}
                          style={{ flex:1, padding:"9px 0", borderRadius:8, border:"none", cursor:"pointer",
                            fontSize:12, fontWeight:700, transition:"all .15s",
                            background: modeLogin === m.id ? activeColor : "transparent",
                            color: modeLogin === m.id ? "#fff" : "#64748b" }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedProfil === "parent" && modeLogin === "telephone" ? (
                    <div className="par-field">
                      <label className="par-label">Numéro de téléphone</label>
                      <div className="par-input-wrap">
                        <span className="par-input-icon">📱</span>
                        <input className="par-input" type="tel" placeholder="07 08 XX XX XX"
                          value={telephone} onChange={e => setTelephone(e.target.value)} autoComplete="tel" autoFocus />
                      </div>
                      <div style={{ fontSize:11, color:"#94a3b8", marginTop:5 }}>
                        Le numéro renseigné lors de l'inscription de votre enfant
                      </div>
                    </div>
                  ) : (
                    <div className="par-field">
                      <label className="par-label">{T("email")}</label>
                      <div className="par-input-wrap">
                        <span className="par-input-icon">✉️</span>
                        <input className="par-input" type="email" placeholder={T("email_ph")}
                          value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" autoFocus />
                      </div>
                    </div>
                  )}
                  <div className="par-field">
                    <label className="par-label">{T("password")}</label>
                    <div className="par-input-wrap">
                      <span className="par-input-icon">🔒</span>
                      <input className="par-input" type={showPwd ? "text" : "password"} placeholder="••••••••••••"
                        value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                      <button type="button" className="par-eye" onClick={() => setShowPwd(v => !v)}>
                        {showPwd ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>
                  <div className="par-forgot">
                    <a href="#" onClick={e => { e.preventDefault(); setForgotOpen(true); setForgotStatus("idle"); setForgotEmail(email || ""); setForgotMsg(""); }}>
                      {T("forgot")}
                    </a>
                  </div>
                  <button className="par-btn" type="submit" disabled={loading} style={{ background: activeBtnBg }}>
                    {loading ? <><div className="par-spinner" /> {T("logging_in")}</> : <>{T("login_btn")}</>}
                  </button>
                  <div className="par-footer" style={{ marginTop:18 }}>
                    {T("support")} <a href="#">{T("contact")}</a>
                  </div>
                  {selectedProfil === "parent" && (
                    <button type="button"
                      onClick={() => { setSelectedProfil("enfant"); setStep(1); setError(""); setEmail(""); setPassword(""); }}
                      style={{ width:"100%", marginTop:12, padding:"11px 14px", borderRadius:12,
                        border:"1.5px solid #ede9fe", background:"#faf5ff", cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                        fontSize:13, fontWeight:600, color:"#7c3aed", fontFamily:"'Montserrat','Segoe UI',sans-serif",
                        transition:"all .2s" }}
                      onMouseEnter={e => { e.currentTarget.style.background="#ede9fe"; e.currentTarget.style.borderColor="#7c3aed"; }}
                      onMouseLeave={e => { e.currentTarget.style.background="#faf5ff"; e.currentTarget.style.borderColor="#ede9fe"; }}>
                      {T("connect_child")}
                    </button>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal Mot de passe oublié ── */}
      {forgotOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setForgotOpen(false); }}>
          <div style={{ background:"#fff", borderRadius:20, padding:"32px 36px", width:"100%", maxWidth:420, boxShadow:"0 24px 60px rgba(0,0,0,0.2)", animation:"parFadeIn .25s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{T("forgot_title")}</h3>
              <button onClick={() => setForgotOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>✕</button>
            </div>
            {forgotStatus === "sent" ? (
              <div>
                <div style={{ fontSize:40, textAlign:"center", marginBottom:16 }}>📬</div>
                <p style={{ fontSize:14, color:"#374151", lineHeight:1.7, textAlign:"center", marginBottom:24 }}>{forgotMsg}</p>
                <button onClick={() => setForgotOpen(false)}
                  style={{ width:"100%", padding:"12px", background:activeBtnBg, color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>
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
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:7 }}>{T("forgot_label")}</label>
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}>✉️</span>
                    <input type="email" placeholder={T("email_ph")} value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} autoFocus
                      style={{ width:"100%", padding:"12px 14px 12px 44px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:14, fontFamily:"'Montserrat','Segoe UI',sans-serif", outline:"none", boxSizing:"border-box" }}
                      onFocus={e => { e.target.style.borderColor=activeColor; e.target.style.boxShadow=`0 0 0 3px ${activeColor}20`; }}
                      onBlur={e => { e.target.style.borderColor="#e2e8f0"; e.target.style.boxShadow="none"; }}
                    />
                  </div>
                </div>
                <button type="submit" disabled={forgotStatus==="loading"}
                  style={{ width:"100%", padding:"13px", background:activeBtnBg, color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor: forgotStatus==="loading"?"not-allowed":"pointer", opacity: forgotStatus==="loading"?0.7:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {forgotStatus === "loading" ? <><div className="par-spinner" /> {T("forgot_sending")}</> : <>{T("forgot_send")}</>}
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
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        .par-root { display: flex; height: 100vh; width: 100vw; font-family: 'Montserrat','Segoe UI',sans-serif; }
        .par-left { width: 52%; position: relative; overflow: hidden; background: #78350f; }
        .par-left-bg { position: absolute; inset: 0; background: linear-gradient(160deg, #451a03 0%, #78350f 40%, #92400e 70%, #b45309 100%); }
        .par-blob1 { position: absolute; width: 420px; height: 420px; border-radius: 50%; background: rgba(120,53,15,0.25); top: -80px; left: -100px; animation: parFloat 8s ease-in-out infinite; }
        .par-blob2 { position: absolute; width: 300px; height: 300px; border-radius: 50%; background: rgba(69,26,3,0.3); bottom: -60px; right: -60px; animation: parFloat 11s ease-in-out infinite reverse; }
        .par-blob3 { position: absolute; width: 180px; height: 180px; border-radius: 50%; background: rgba(251,191,36,0.15); top: 40%; left: 55%; animation: parFloat 7s ease-in-out infinite 2s; }
        @keyframes parFloat { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(15px,-20px) scale(1.04)} }
        .par-left-content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 60px 56px; }
        .par-logo-area { display: flex; align-items: center; gap: 14px; margin-bottom: 44px; }
        .par-logo-img { height: 60px; width: 60px; object-fit: contain; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4)); }
        .par-logo-text { display: flex; flex-direction: column; gap: 1px; }
        .par-logo-name { font-size: 17px; font-weight: 900; color: #fff; letter-spacing: 0.02em; line-height: 1.1; }
        .par-logo-name span { color: #fbbf24; }
        .par-logo-sub { font-size: 10px; font-weight: 400; color: rgba(255,255,255,0.5); letter-spacing: 0.18em; text-transform: uppercase; }
        .par-headline { font-size: 46px; font-weight: 900; line-height: 1.08; color: #fff; margin-bottom: 20px; }
        .par-headline span { color: #fbbf24; }
        .par-sub { font-size: 15px; font-weight: 300; color: rgba(255,255,255,0.65); line-height: 1.7; margin-bottom: 40px; max-width: 380px; }
        .par-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 36px; }
        .par-pill { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.15); transition: all .3s; }
        .par-pill:hover { background: rgba(251,191,36,0.2); color: #fbbf24; border-color: rgba(251,191,36,0.45); }
        .par-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .par-stat { padding: 15px 18px; border-radius: 14px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px); }
        .par-stat-n { font-size: 24px; font-weight: 700; color: #fbbf24; }
        .par-stat-l { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 3px; font-weight: 300; }
                /* Écrans courts (13 pouces : 1280×800, 1366×768) - la page tient en 100vh sans
           défilement du body, donc tout ce qui dépasse doit tenir dans la colonne de droite. */
        @media (max-height: 860px) {
          .par-right        { padding: 28px 44px; }
          .par-left-content { padding: 36px 48px; }
          .par-headline     { font-size: 36px; margin-bottom: 14px; }
          .par-stats        { gap: 9px; }
        }
        @media (max-height: 760px) {
          .par-right    { padding: 20px 36px; }
          .par-headline { font-size: 31px; }
          .par-stats    { display: none; }
        }
.par-right { flex: 1; background: #f8fafc; display: flex; align-items: flex-start; justify-content: center; padding: 48px 52px; position: relative; overflow-y: auto; }
        .par-right::before { content:''; position:absolute; bottom:-80px; right:-80px; width:280px; height:280px; border-radius:50%; background:rgba(217,119,6,0.06); }
        .par-right::after  { content:''; position:absolute; top:-60px; left:-60px; width:200px; height:200px; border-radius:50%; background:rgba(251,191,36,0.06); }
        .par-form-wrap { width: 100%; max-width: 380px; position: relative; z-index: 1; margin: auto; }
        .par-header { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
        .par-header-sep { width: 1px; height: 32px; background: #e2e8f0; }
        .par-header-role { font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: 0.12em; text-transform: uppercase; }
        .par-welcome { font-size: 13px; font-weight: 600; color: #d97706; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
        .par-title { font-size: 34px; font-weight: 700; color: #0f172a; margin-bottom: 6px; line-height: 1.15; }
        .par-desc { font-size: 14px; color: #64748b; font-weight: 300; margin-bottom: 24px; }
        .par-field { margin-bottom: 18px; }
        .par-label { display: block; font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 7px; letter-spacing: 0.04em; }
        .par-input-wrap { position: relative; }
        .par-input { width: 100%; padding: 13px 16px 13px 44px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: 'Montserrat','Segoe UI',sans-serif; background: #fff; color: #0f172a; outline: none; transition: border-color .25s, box-shadow .25s; }
        .par-input:focus { border-color: #d97706; box-shadow: 0 0 0 4px rgba(217,119,6,0.1); }
        .par-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
        .par-eye { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; cursor: pointer; color: #94a3b8; background: none; border: none; padding: 0; transition: color .2s; }
        .par-eye:hover { color: #d97706; }
        .par-forgot { text-align: right; margin-top: -10px; margin-bottom: 20px; }
        .par-forgot a { font-size: 12px; color: #d97706; text-decoration: none; font-weight: 500; }
        .par-forgot a:hover { color: #E8273A; text-decoration: underline; }
        .par-error { padding: 10px 14px; border-radius: 10px; background: #fff1f2; border: 1px solid #fecdd3; font-size: 13px; color: #be123c; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .par-security { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; font-size: 12px; color: #92400e; font-weight: 500; margin-bottom: 18px; }
        .par-btn { width: 100%; padding: 14px; color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: 'Montserrat','Segoe UI',sans-serif; cursor: pointer; transition: transform .15s, box-shadow .15s; display: flex; align-items: center; justify-content: center; gap: 8px; position: relative; overflow: hidden; }
        .par-btn:hover { box-shadow: 0 8px 24px rgba(217,119,6,0.35); transform: translateY(-1px); }
        .par-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .par-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: parspin .7s linear infinite; flex-shrink: 0; }
        @keyframes parspin { to { transform: rotate(360deg); } }
        @keyframes parFadeIn { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .par-footer { text-align: center; font-size: 12px; color: #94a3b8; }
        .par-footer a { color: #d97706; text-decoration: none; font-weight: 500; }
        .par-footer a:hover { color: #E8273A; }
      `}</style>
    </>
  );
}
