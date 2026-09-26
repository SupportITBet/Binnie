// src/Pages/Auth/LoginProfesseur.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

export default function LoginProfesseur() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const T = (k) => t("loginProfesseur", k);

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // ── Mot de passe oublié ──────────────────────────────
  const [forgotOpen,   setForgotOpen]   = useState(false);
  const [forgotEmail,  setForgotEmail]  = useState("");
  const [forgotStatus, setForgotStatus] = useState("idle");
  const [forgotMsg,    setForgotMsg]    = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError(T("err_fields")); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, plateforme: 'dash' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || T("err_fields")); return; }
      const role = data.profil?.role;
      if (role !== "coach") { setError(T("err_role")); return; }
      localStorage.setItem("coach_token",   data.session.access_token);
      localStorage.setItem("coach_refresh", data.session.refresh_token);
      localStorage.setItem("coach_profil",  JSON.stringify(data.profil));
      navigate("/espace-professeur");
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
      const res = await fetch(`${API_URL}/api/admin/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (res.ok) {
        setForgotStatus("sent");
        setForgotMsg(T("forgot_sent_msg"));
      } else {
        setForgotStatus("error"); setForgotMsg(T("err_reset"));
      }
    } catch {
      setForgotStatus("error"); setForgotMsg(T("err_server"));
    }
  };

  const pills = [T("pill1"), T("pill2"), T("pill3"), T("pill4"), T("pill5")];

  return (
    <>
      <div className="prf-root">
        {/* ── Gauche ── */}
        <div className="prf-left">
          <div className="prf-left-bg" />
          <div className="prf-blob1" /><div className="prf-blob2" /><div className="prf-blob3" />
          <div className="prf-left-content">
            <div className="prf-logo-area">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="prf-logo-img" />
              <div className="prf-logo-text">
                <div className="prf-logo-name"><span>Binnie's</span> English Training</div>
                <div className="prf-logo-sub">{T("cert_center")}</div>
              </div>
            </div>
            <h1 className="prf-headline">
              {T("headline1")}<br />{T("headline2")}<br /><span>{T("headline3")}</span>
            </h1>
            <p className="prf-sub">{T("sub")}</p>
            <div className="prf-pills">
              {pills.map(p => <span key={p} className="prf-pill">{p}</span>)}
            </div>
            <div className="prf-stats">
              <div className="prf-stat"><div className="prf-stat-n">42</div><div className="prf-stat-l">{T("stat_coaches")}</div></div>
              <div className="prf-stat"><div className="prf-stat-n">128</div><div className="prf-stat-l">{T("stat_classes")}</div></div>
              <div className="prf-stat"><div className="prf-stat-n">24/7</div><div className="prf-stat-l">{T("stat_access")}</div></div>
              <div className="prf-stat"><div className="prf-stat-n">4.8★</div><div className="prf-stat-l">{T("stat_avg")}</div></div>
            </div>
          </div>
        </div>

        {/* ── Droite ── */}
        <div className="prf-right">
          <div className="prf-profile-switch">
            <button className="prf-switch-btn" onClick={() => navigate("/connexion/apprenant")}>{T("btn_apprenant")}</button>
            <button className="prf-switch-btn active">{T("btn_prof")}</button>
            <button className="prf-switch-btn" onClick={() => navigate("/bet-staff-access")}>{T("btn_staff")}</button>
          </div>

          <div className="prf-form-wrap">
            <div className="prf-header">
              <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="Binnie's English Training" className="prf-logo-img" />
              <div className="prf-header-sep" />
              <div className="prf-header-role">{T("role_label")}</div>
            </div>

            <div className="prf-welcome">{T("welcome")}</div>
            <h2 className="prf-title">{T("title1")}<br />{T("title2")}</h2>
            <p className="prf-desc">{T("desc")}</p>

            {error && <div className="prf-error">⚠️ {error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="prf-security">{T("secure")}</div>
              <div className="prf-field">
                <label className="prf-label">{T("email")}</label>
                <div className="prf-input-wrap">
                  <span className="prf-input-icon">✉️</span>
                  <input className="prf-input" type="email" placeholder={T("email_ph")}
                    value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" autoFocus />
                </div>
              </div>
              <div className="prf-field">
                <label className="prf-label">{T("password")}</label>
                <div className="prf-input-wrap">
                  <span className="prf-input-icon">🔒</span>
                  <input className="prf-input" type={showPwd ? "text" : "password"} placeholder="••••••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                  <button type="button" className="prf-eye" onClick={() => setShowPwd(v => !v)}>
                    {showPwd ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              <div className="prf-forgot">
                <a href="#" onClick={e => { e.preventDefault(); setForgotOpen(true); setForgotStatus("idle"); setForgotEmail(email || ""); setForgotMsg(""); }}>
                  {T("forgot")}
                </a>
              </div>
              <button className="prf-btn" type="submit" disabled={loading}>
                {loading ? <><div className="prf-spinner" /> {T("logging_in")}</> : <>{T("login_btn")}</>}
              </button>
              <div className="prf-footer" style={{ marginTop: 18 }}>
                {T("no_account")} <a href="#">{T("contact")}</a>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ── Modal Mot de passe oublié ── */}
      {forgotOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setForgotOpen(false); }}>
          <div style={{ background:"#fff", borderRadius:20, padding:"32px 36px", width:"100%", maxWidth:420, boxShadow:"0 24px 60px rgba(0,0,0,0.2)", animation:"prfFadeIn .25s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{T("forgot_title")}</h3>
              <button onClick={() => setForgotOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#94a3b8" }}>✕</button>
            </div>
            {forgotStatus === "sent" ? (
              <div>
                <div style={{ fontSize:40, textAlign:"center", marginBottom:16 }}>📬</div>
                <p style={{ fontSize:14, color:"#374151", lineHeight:1.7, textAlign:"center", marginBottom:24 }}>{forgotMsg}</p>
                <button onClick={() => setForgotOpen(false)}
                  style={{ width:"100%", padding:"12px", background:"linear-gradient(135deg,#0891b2,#0e7490)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  {T("close") || "Fermer"}
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
                      onFocus={e => { e.target.style.borderColor="#0891b2"; e.target.style.boxShadow="0 0 0 3px rgba(8,145,178,0.1)"; }}
                      onBlur={e => { e.target.style.borderColor="#e2e8f0"; e.target.style.boxShadow="none"; }}
                    />
                  </div>
                </div>
                <button type="submit" disabled={forgotStatus === "loading"}
                  style={{ width:"100%", padding:"13px", background:"linear-gradient(135deg,#0891b2,#0e7490)", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor: forgotStatus==="loading"?"not-allowed":"pointer", opacity: forgotStatus==="loading"?0.7:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {forgotStatus === "loading" ? <><div className="prf-spinner" /> {T("forgot_sending")}</> : <>{T("forgot_send")}</>}
                </button>
                <button type="button" onClick={() => setForgotOpen(false)}
                  style={{ width:"100%", padding:"11px", background:"transparent", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:13, color:"#64748b", cursor:"pointer", marginTop:10 }}>
                  {T("cancel") || "Annuler"}
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
        .prf-root { display: flex; height: 100vh; width: 100vw; font-family: 'Montserrat','Segoe UI',sans-serif; }

        .prf-left { width: 52%; position: relative; overflow: hidden; background: #0f172a; }
        .prf-left-bg { position: absolute; inset: 0; background: linear-gradient(160deg, #0f172a 0%, #0891b2 60%, #0e7490 100%); }
        .prf-blob1 { position: absolute; width: 420px; height: 420px; border-radius: 50%; background: rgba(8,145,178,0.15); top: -80px; left: -100px; animation: prfFloat 8s ease-in-out infinite; }
        .prf-blob2 { position: absolute; width: 300px; height: 300px; border-radius: 50%; background: rgba(14,116,144,0.2); bottom: -60px; right: -60px; animation: prfFloat 11s ease-in-out infinite reverse; }
        .prf-blob3 { position: absolute; width: 180px; height: 180px; border-radius: 50%; background: rgba(220,38,38,0.1); top: 40%; left: 55%; animation: prfFloat 7s ease-in-out infinite 2s; }
        @keyframes prfFloat { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(15px,-20px) scale(1.04)} }

        .prf-left-content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 60px 56px; }
        .prf-logo-area { display: flex; align-items: center; gap: 14px; margin-bottom: 44px; }
        .prf-logo-img { height: 60px; width: 60px; object-fit: contain; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4)); }
        .prf-logo-text { display: flex; flex-direction: column; gap: 1px; }
        .prf-logo-name { font-size: 17px; font-weight: 900; color: #fff; letter-spacing: 0.02em; line-height: 1.1; }
        .prf-logo-name span { color: #f87171; }
        .prf-logo-sub { font-size: 10px; font-weight: 400; color: rgba(255,255,255,0.5); letter-spacing: 0.18em; text-transform: uppercase; }
        .prf-headline { font-size: 46px; font-weight: 900; line-height: 1.08; color: #fff; margin-bottom: 20px; }
        .prf-headline span { color: #22d3ee; }
        .prf-sub { font-size: 15px; font-weight: 300; color: rgba(255,255,255,0.65); line-height: 1.7; margin-bottom: 40px; max-width: 380px; }
        .prf-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 36px; }
        .prf-pill { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.15); transition: all .3s; }
        .prf-pill:hover { background: rgba(34,211,238,0.2); color: #22d3ee; border-color: rgba(34,211,238,0.45); }
        .prf-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .prf-stat { padding: 15px 18px; border-radius: 14px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px); }
        .prf-stat-n { font-size: 24px; font-weight: 700; color: #22d3ee; }
        .prf-stat-l { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 3px; font-weight: 300; }

                /* Écrans courts (13 pouces : 1280×800, 1366×768) - la page tient en 100vh sans
           défilement du body, donc tout ce qui dépasse doit tenir dans la colonne de droite. */
        @media (max-height: 860px) {
          .prf-right        { padding: 28px 44px; }
          .prf-left-content { padding: 36px 48px; }
          .prf-headline     { font-size: 36px; margin-bottom: 14px; }
          .prf-stats        { gap: 9px; }
        }
        @media (max-height: 760px) {
          .prf-right    { padding: 20px 36px; }
          .prf-headline { font-size: 31px; }
          .prf-stats    { display: none; }
        }
.prf-right { flex: 1; background: #f8fafc; display: flex; align-items: flex-start; justify-content: center; padding: 48px 52px; position: relative; overflow-y: auto; }
        .prf-right::before { content:''; position:absolute; bottom:-80px; right:-80px; width:280px; height:280px; border-radius:50%; background:rgba(8,145,178,0.06); }
        .prf-right::after  { content:''; position:absolute; top:-60px; left:-60px; width:200px; height:200px; border-radius:50%; background:rgba(34,211,238,0.05); }

        .prf-form-wrap { width: 100%; max-width: 380px; position: relative; z-index: 1; margin: auto; }
        .prf-header { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
        .prf-header-sep { width: 1px; height: 32px; background: #e2e8f0; }
        .prf-header-role { font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: 0.12em; text-transform: uppercase; }
        .prf-welcome { font-size: 13px; font-weight: 600; color: #0891b2; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
        .prf-title { font-size: 34px; font-weight: 700; color: #0f172a; margin-bottom: 6px; line-height: 1.15; }
        .prf-desc { font-size: 14px; color: #64748b; font-weight: 300; margin-bottom: 24px; }

        .prf-field { margin-bottom: 18px; }
        .prf-label { display: block; font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 7px; letter-spacing: 0.04em; }
        .prf-input-wrap { position: relative; }
        .prf-input { width: 100%; padding: 13px 16px 13px 44px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: 'Montserrat','Segoe UI',sans-serif; background: #fff; color: #0f172a; outline: none; transition: border-color .25s, box-shadow .25s; }
        .prf-input:focus { border-color: #0891b2; box-shadow: 0 0 0 4px rgba(8,145,178,0.1); }
        .prf-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 16px; pointer-events: none; }
        .prf-eye { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; cursor: pointer; color: #94a3b8; background: none; border: none; padding: 0; transition: color .2s; }
        .prf-eye:hover { color: #0891b2; }
        .prf-forgot { text-align: right; margin-top: -10px; margin-bottom: 20px; }
        .prf-forgot a { font-size: 12px; color: #0891b2; text-decoration: none; font-weight: 500; }
        .prf-forgot a:hover { color: #E8273A; text-decoration: underline; }
        .prf-error { padding: 10px 14px; border-radius: 10px; background: #fff1f2; border: 1px solid #fecdd3; font-size: 13px; color: #be123c; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .prf-security { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: #ecfeff; border: 1px solid #a5f3fc; font-size: 12px; color: #0e7490; font-weight: 500; margin-bottom: 18px; }

        .prf-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #0891b2, #0e7490); color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; font-family: 'Montserrat','Segoe UI',sans-serif; cursor: pointer; letter-spacing: 0.03em; transition: transform .15s, box-shadow .15s; display: flex; align-items: center; justify-content: center; gap: 8px; position: relative; overflow: hidden; }
        .prf-btn:hover { box-shadow: 0 8px 24px rgba(8,145,178,0.35); transform: translateY(-1px); }
        .prf-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .prf-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: prfspin .7s linear infinite; flex-shrink: 0; }
        @keyframes prfspin { to { transform: rotate(360deg); } }
        @keyframes prfFadeIn { from { opacity:0; transform:scale(0.96) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }

        .prf-footer { text-align: center; font-size: 12px; color: #94a3b8; }
        .prf-footer a { color: #0891b2; text-decoration: none; font-weight: 500; }
        .prf-footer a:hover { color: #E8273A; }
        .prf-profile-switch { position: absolute; top: 22px; right: 22px; display: flex; gap: 5px; z-index: 10; }
        .prf-switch-btn { padding: 7px 14px; border-radius: 20px; border: 1px solid #e2e8f0; font-size: 11px; font-weight: 500; cursor: pointer; background: #fff; color: #64748b; transition: all .2s; font-family: 'Montserrat','Segoe UI',sans-serif; }
        .prf-switch-btn:hover { border-color: #0891b2; color: #0891b2; background: #ecfeff; }
        .prf-switch-btn.active { background: #0891b2; color: #fff; border-color: #0891b2; }
      `}</style>
    </>
  );
}
