import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../config/supabase";
import SEO from "../Components/SEO/SEO";

const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

const NAVY  = "#011451";
const ACC   = "#0c33ac";
const RED   = "#ff2945";
const GRIS  = "#94A3B8";
const BLANC = "#FFFFFF";
const FF    = "'Montserrat','Segoe UI',sans-serif";

const FEATURES = [
  { i: "📚", t: "Accès à tous vos cours & modules" },
  { i: "✏️", t: "Exercices interactifs & évaluations" },
  { i: "📈", t: "Suivi de progression en temps réel" },
  { i: "🎥", t: "Sessions en direct avec vos coachs" },
  { i: "🏆", t: "Badges & certifications BET" },
];

const STATS = [
  { n: "1 284", l: "Apprenants actifs" },
  { n: "186",   l: "Sessions / semaine" },
  { n: "94%",   l: "Taux de réussite" },
  { n: "42",    l: "Coachs certifiés" },
];

const Connexion = () => {
  const navigate = useNavigate();

  const [tab,      setTab]      = useState("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);

  const [regNom,    setRegNom]    = useState("");
  const [regPrenom, setRegPrenom] = useState("");
  const [regEmail,  setRegEmail]  = useState("");
  const [regTel,    setRegTel]    = useState("");
  const [regPwd,    setRegPwd]    = useState("");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) navigate("/mon-espace", { replace: true });
    });
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw new Error(err.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : err.message);

      // Le JWT généré à la connexion contient l'app_metadata actuel - lecture directe, aucun appel réseau
      if (data.user?.app_metadata?.acces_bloque === true) {
        // Le motif voyage dans le JWT, aux côtés de acces_bloque : il est donc déjà là,
        // sans requête supplémentaire et avant la déconnexion forcée. L'apprenant lit
        // enfin POURQUOI il est bloqué - 4 absences, une mensualité impayée - au lieu
        // d'un « contactez votre assistante » qui ne lui apprenait rien.
        const motif = data.user.app_metadata.blocage_message;
        await supabase.auth.signOut();
        setError(motif
          || "Vos accès sont momentanément bloqués. Veuillez contacter votre assistante commerciale.");
        return;
      }

      navigate("/mon-espace", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: regNom, prenom: regPrenom, email: regEmail, telephone: regTel, password: regPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'inscription");
      setSuccess("Compte créé ! Connexion en cours…");
      await supabase.auth.signInWithPassword({ email: regEmail, password: regPwd });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/mon-espace` },
    });
    if (err) setError("Erreur Google : " + err.message);
  };

  const inp = (extra = {}) => ({
    border: "1.5px solid #E2E8F0",
    borderRadius: 10,
    fontSize: 14,
    fontFamily: FF,
    outline: "none",
    boxSizing: "border-box",
    color: NAVY,
    transition: "border-color .2s,box-shadow .2s",
    width: "100%",
    ...extra,
  });

  return (
    <div style={{ display:"flex", minHeight:"100vh", fontFamily:FF, overflow:"hidden" }}>
      <SEO title="Connexion - Binnie's English Training" description="Connectez-vous à votre espace BET." canonicalUrl="/connexion" noindex />
      <style>{`
        @keyframes betFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-14px,18px) scale(1.04)}}
        @keyframes betFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes betSpin{to{transform:rotate(360deg)}}
        @media(max-width:800px){.bet-left-panel{display:none!important}.bet-right-panel{width:100%!important}}
      `}</style>

      {/* ── Panneau gauche ── */}
      <div className="bet-left-panel" style={{ width:"48%", position:"relative", overflow:"hidden",
        background:`linear-gradient(160deg, ${NAVY} 0%, #041a6e 40%, #0c33ac 75%, #1e40af 100%)` }}>

        <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%",
          background:"rgba(12,51,172,0.18)", top:-100, left:-120,
          animation:"betFloat 10s ease-in-out infinite" }}/>
        <div style={{ position:"absolute", width:270, height:270, borderRadius:"50%",
          background:"rgba(1,20,81,0.25)", bottom:-70, right:-70,
          animation:"betFloat 14s ease-in-out infinite reverse" }}/>
        <div style={{ position:"absolute", width:160, height:160, borderRadius:"50%",
          background:"rgba(12,51,172,0.1)", top:"35%", left:"58%",
          animation:"betFloat 8s ease-in-out infinite 2s" }}/>
        <div style={{ position:"absolute", width:80, height:80, borderRadius:"50%",
          background:"rgba(255,41,69,0.1)", top:"65%", left:"15%",
          animation:"betFloat 6s ease-in-out infinite .5s" }}/>

        <div style={{ position:"relative", zIndex:2, height:"100%", display:"flex",
          flexDirection:"column", justifyContent:"center", padding:"56px 48px" }}>

          <Link to="/" style={{ display:"flex", alignItems:"center", gap:14, marginBottom:40, textDecoration:"none" }}>
            <div style={{ width:44, height:44, background:RED, borderRadius:14, display:"flex",
              alignItems:"center", justifyContent:"center", fontWeight:900, color:"#fff", fontSize:22,
              border:"2px solid rgba(255,255,255,0.2)" }}>B</div>
            <div>
              <div style={{ fontSize:15, fontWeight:900, color:BLANC }}>
                Binnie's <span style={{ color:RED }}>BET</span>
              </div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)",
                letterSpacing:"0.15em", textTransform:"uppercase", marginTop:2 }}>
                Portail Apprenant
              </div>
            </div>
          </Link>

          <h1 style={{ fontSize:40, fontWeight:900, lineHeight:1.1, color:BLANC, margin:"0 0 18px" }}>
            Apprenez,<br />progressez,<br /><span style={{ color:RED }}>réussissez.</span>
          </h1>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.6)", lineHeight:1.75,
            marginBottom:36, maxWidth:340 }}>
            Accédez à vos cours, suivez vos progrès et participez aux sessions en direct avec vos coachs BET.
          </p>

          <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:36 }}>
            {FEATURES.map(f => (
              <div key={f.t} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:34, height:34, borderRadius:10, flexShrink:0,
                  background:"rgba(255,255,255,0.1)",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{f.i}</div>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.72)" }}>{f.t}</span>
              </div>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:28 }}>
            {STATS.map(s => (
              <div key={s.l} style={{ padding:"12px 14px", borderRadius:12,
                background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontSize:20, fontWeight:800, color:RED }}>{s.n}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.45)", marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
            {["Anglais","Expression orale","Grammaire","TOEIC","Écriture","Phonologie"].map(m => (
              <div key={m} style={{ padding:"4px 12px", borderRadius:20,
                background:"rgba(255,255,255,0.09)", border:"1px solid rgba(255,255,255,0.15)",
                fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.65)" }}>{m}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Panneau droit ── */}
      <div className="bet-right-panel" style={{ flex:1, background:"#F8FAFC", display:"flex",
        alignItems:"center", justifyContent:"center", padding:"48px 40px",
        overflowY:"auto", position:"relative" }}>

        <div style={{ position:"absolute", bottom:-80, right:-80, width:240, height:240,
          borderRadius:"50%", background:"rgba(12,51,172,0.05)", pointerEvents:"none" }}/>

        <div style={{ width:"100%", maxWidth:420, animation:"betFadeIn .3s ease" }}>

          {/* Header droit */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:`${ACC}20`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🎓</div>
            <div style={{ width:1, height:26, background:"#E2E8F0" }}/>
            <div style={{ fontSize:11, fontWeight:600, color:GRIS,
              letterSpacing:"0.1em", textTransform:"uppercase" }}>Espace Apprenant BET</div>
          </div>

          <h2 style={{ fontSize:28, fontWeight:800, color:NAVY, margin:"0 0 6px", lineHeight:1.15 }}>
            Bienvenue sur<br />votre espace 🎓
          </h2>
          <p style={{ fontSize:13, color:GRIS, marginBottom:22, lineHeight:1.6 }}>
            Connectez-vous pour accéder à vos cours, exercices et sessions en direct.
          </p>

          <div style={{ padding:"8px 14px", borderRadius:9, background:"#EFF6FF",
            border:`1px solid ${ACC}40`, fontSize:12, color:NAVY, fontWeight:500, marginBottom:22 }}>
            🔐 Connexion sécurisée - British English Training
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", borderRadius:10, background:"#f0f4ff", padding:4, marginBottom:24, gap:4 }}>
            {[{ k:"login", l:"Connexion" }, { k:"register", l:"Créer un compte" }].map(t => (
              <button key={t.k} onClick={() => { setTab(t.k); setError(""); setSuccess(""); }}
                style={{ flex:1, padding:"9px 0", borderRadius:7, border:"none", fontFamily:FF,
                  fontWeight:700, fontSize:13, cursor:"pointer", transition:"all .2s",
                  background: tab === t.k ? NAVY : "transparent",
                  color:      tab === t.k ? "#fff" : "#64748b",
                  boxShadow:  tab === t.k ? "0 2px 8px rgba(1,20,81,.25)" : "none",
                }}>
                {t.l}
              </button>
            ))}
          </div>

          {/* Erreur / succès */}
          {error   && <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA",
            borderRadius:9, color:"#991B1B", fontSize:13, fontWeight:600, marginBottom:16 }}>⚠️ {error}</div>}
          {success && <div style={{ padding:"10px 14px", background:"#f0fdf4", border:"1px solid #bbf7d0",
            borderRadius:9, color:"#15803d", fontSize:13, fontWeight:600, marginBottom:16 }}>✅ {success}</div>}

          {/* ── CONNEXION ── */}
          {tab === "login" && (
            <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:"#475569", display:"block", marginBottom:6 }}>
                  Adresse email
                </label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>✉️</span>
                  <input type="email" value={email} required onChange={e => setEmail(e.target.value)}
                    placeholder="votre@email.com" autoFocus autoComplete="username"
                    style={inp({ padding:"12px 14px 12px 44px" })}
                    onFocus={e => { e.target.style.borderColor=ACC; e.target.style.boxShadow=`0 0 0 3px ${ACC}25`; }}
                    onBlur={e => { e.target.style.borderColor="#E2E8F0"; e.target.style.boxShadow="none"; }}/>
                </div>
              </div>

              <div>
                <label style={{ fontSize:12, fontWeight:600, color:"#475569", display:"block", marginBottom:6 }}>
                  Mot de passe
                </label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔒</span>
                  <input type={showPwd ? "text" : "password"} value={password} required
                    onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                    autoComplete="current-password"
                    style={inp({ padding:"12px 44px" })}
                    onFocus={e => { e.target.style.borderColor=ACC; e.target.style.boxShadow=`0 0 0 3px ${ACC}25`; }}
                    onBlur={e => { e.target.style.borderColor="#E2E8F0"; e.target.style.boxShadow="none"; }}/>
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                      background:"none", border:"none", cursor:"pointer", fontSize:15, color:GRIS, padding:0 }}>
                    {showPwd ? "🙈" : "👁️"}
                  </button>
                </div>
                <div style={{ marginTop:6, textAlign:"right" }}>
                  <Link to="/update-password" style={{ fontSize:12, color:ACC, fontWeight:600, textDecoration:"none" }}>
                    Mot de passe oublié ?
                  </Link>
                </div>
              </div>

              <button type="submit" disabled={loading}
                style={{ padding:"14px", borderRadius:10, border:"none",
                  background: loading ? "#94A3B8" : `linear-gradient(135deg, ${NAVY}, ${ACC})`,
                  color:BLANC, fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer",
                  fontFamily:FF, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  boxShadow: loading ? "none" : `0 4px 20px ${ACC}50` }}>
                {loading ? (
                  <><div style={{ width:17, height:17, border:"2px solid rgba(255,255,255,0.35)",
                    borderTopColor:BLANC, borderRadius:"50%", animation:"betSpin .7s linear infinite" }}/> Connexion…</>
                ) : "Accéder à mes cours →"}
              </button>
            </form>
          )}

          {/* ── INSCRIPTION ── */}
          {tab === "register" && (
            <form onSubmit={handleRegister} style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:"#475569", display:"block", marginBottom:5 }}>Nom *</label>
                  <input value={regNom} onChange={e => setRegNom(e.target.value)} required placeholder="Dupont"
                    style={inp({ padding:"10px 12px" })}
                    onFocus={e => { e.target.style.borderColor=ACC; e.target.style.boxShadow=`0 0 0 3px ${ACC}25`; }}
                    onBlur={e => { e.target.style.borderColor="#E2E8F0"; e.target.style.boxShadow="none"; }}/>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:"#475569", display:"block", marginBottom:5 }}>Prénom *</label>
                  <input value={regPrenom} onChange={e => setRegPrenom(e.target.value)} required placeholder="Marie"
                    style={inp({ padding:"10px 12px" })}
                    onFocus={e => { e.target.style.borderColor=ACC; e.target.style.boxShadow=`0 0 0 3px ${ACC}25`; }}
                    onBlur={e => { e.target.style.borderColor="#E2E8F0"; e.target.style.boxShadow="none"; }}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:"#475569", display:"block", marginBottom:5 }}>Email *</label>
                <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required placeholder="votre@email.com"
                  style={inp({ padding:"10px 14px" })}
                  onFocus={e => { e.target.style.borderColor=ACC; e.target.style.boxShadow=`0 0 0 3px ${ACC}25`; }}
                  onBlur={e => { e.target.style.borderColor="#E2E8F0"; e.target.style.boxShadow="none"; }}/>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:"#475569", display:"block", marginBottom:5 }}>Téléphone</label>
                <input value={regTel} onChange={e => setRegTel(e.target.value)} placeholder="+225 07 XX XX XX"
                  style={inp({ padding:"10px 14px" })}
                  onFocus={e => { e.target.style.borderColor=ACC; e.target.style.boxShadow=`0 0 0 3px ${ACC}25`; }}
                  onBlur={e => { e.target.style.borderColor="#E2E8F0"; e.target.style.boxShadow="none"; }}/>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:"#475569", display:"block", marginBottom:5 }}>Mot de passe *</label>
                <input type="password" value={regPwd} onChange={e => setRegPwd(e.target.value)} required placeholder="8 caractères minimum"
                  style={inp({ padding:"10px 14px" })}
                  onFocus={e => { e.target.style.borderColor=ACC; e.target.style.boxShadow=`0 0 0 3px ${ACC}25`; }}
                  onBlur={e => { e.target.style.borderColor="#E2E8F0"; e.target.style.boxShadow="none"; }}/>
              </div>
              <button type="submit" disabled={loading}
                style={{ padding:"13px 0", background: loading ? "#94A3B8" : `linear-gradient(135deg,${RED},#e11d48)`,
                  color:"#fff", border:"none", borderRadius:10, fontFamily:FF, fontWeight:800, fontSize:15,
                  cursor:loading?"not-allowed":"pointer", marginTop:4,
                  boxShadow: loading ? "none" : "0 4px 20px rgba(255,41,69,0.4)" }}>
                {loading ? "Création…" : "Créer mon compte →"}
              </button>
            </form>
          )}

          {/* Séparateur */}
          <div style={{ display:"flex", alignItems:"center", gap:10, margin:"20px 0" }}>
            <div style={{ flex:1, height:1, background:"#e2e8f0" }} />
            <span style={{ fontSize:12, color:GRIS, fontWeight:600 }}>ou</span>
            <div style={{ flex:1, height:1, background:"#e2e8f0" }} />
          </div>

          {/* Google */}
          <button onClick={handleGoogle}
            style={{ width:"100%", padding:"12px 0", background:"#fff", border:"1.5px solid #E2E8F0",
              borderRadius:10, fontFamily:FF, fontWeight:700, fontSize:14, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:10,
              color:"#374151", transition:"box-shadow .2s" }}
            onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow="none"}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width:20, height:20 }} />
            Continuer avec Google
          </button>

          <p style={{ textAlign:"center", fontSize:11, color:GRIS, marginTop:20, lineHeight:1.5 }}>
            🔒 Connexion sécurisée · Vos données restent confidentielles<br/>
            <Link to="/" style={{ color:ACC, fontWeight:600, textDecoration:"none" }}>← Retour au site</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Connexion;
