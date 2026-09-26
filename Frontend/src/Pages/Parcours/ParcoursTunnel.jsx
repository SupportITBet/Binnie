import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
// import Navbar from "../Navbar/Navbar";
import Footer from "../Footer/Footer";
import SEO from "../Components/SEO/SEO";

const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
const F   = "'Montserrat', 'Segoe UI', sans-serif";

/* ── inject styles once ── */
if (!document.querySelector("#pt-styles")) {
  const s = document.createElement("style");
  s.id = "pt-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap');
    @keyframes ptFU { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes ptSpin{ to{transform:rotate(360deg)} }
    @keyframes ptPulse{ 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
    .pt-card:hover { transform:translateY(-4px)!important; box-shadow:0 16px 40px rgba(0,0,0,.12)!important; }
    .pt-assistant-card:hover { border-color:#0891b2!important; transform:translateY(-3px)!important; box-shadow:0 12px 32px rgba(8,145,178,.15)!important; }
    .pt-centre-card:hover { border-color:#0c33ac!important; background:#eef1ff!important; }
    .pt-btn-primary:hover { opacity:.88!important; transform:translateY(-1px)!important; }
    .pt-btn-secondary:hover { background:#f1f5f9!important; }
    @media(max-width:640px){
      .pt-grid-2 { grid-template-columns:1fr!important; }
      .pt-grid-3 { grid-template-columns:1fr!important; }
      .pt-hero-title { font-size:1.6rem!important; }
    }
  `;
  document.head.appendChild(s);
}

const BET_BLUE  = "#0891b2";
const BET_DARK  = "#011451";
const BET_NAVY  = "#0c33ac";

/* ── Step indicator ── */
function StepBar({ step, total }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:32, justifyContent:"center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div style={{
            width: i < step ? 28 : (i === step ? 28 : 24),
            height: i < step ? 28 : (i === step ? 28 : 24),
            borderRadius:"50%",
            background: i < step ? "#22c55e" : (i === step ? BET_BLUE : "#e2e8f0"),
            color: i <= step ? "#fff" : "#94a3b8",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontWeight:800, fontSize:12,
            transition:"all .3s",
            flexShrink:0,
          }}>
            {i < step ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div style={{ flex:1, maxWidth:40, height:2, background: i < step ? "#22c55e" : "#e2e8f0", borderRadius:2, transition:"background .3s" }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── Avatar assistante ── */
function AssistanteAvatar({ a, size = 56 }) {
  const initials = `${a.prenom?.[0] || ""}${a.nom?.[0] || ""}`.toUpperCase();
  if (a.photo_url) {
    return <img src={a.photo_url} alt={a.prenom} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />;
  }
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:`linear-gradient(135deg,${BET_NAVY},${BET_BLUE})`, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:size * 0.3, flexShrink:0, fontFamily:F }}>
      {initials || "?"}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function ParcoursTunnel() {
  // step: 0=mode, 1=sous-type, 2=liste, 3=formulaire, 4=succès
  const [step,           setStep]           = useState(0);
  const [modeCours,      setModeCours]      = useState(null); // 'en_ligne' | 'presentiel'
  const [typeCoaching,   setTypeCoaching]   = useState(null); // 'groupe' | 'prive'
  const [centreChoisi,   setCentreChoisi]   = useState(null); // { id, nom }
  const [assistante,     setAssistante]     = useState(null); // assistante choisie/assignée
  const [assistantes,    setAssistantes]    = useState([]);   // liste pour en_ligne
  const [centres,        setCentres]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [erreur,         setErreur]         = useState("");
  const [form,           setForm]           = useState({ nom:"", email:"", telephone:"" });
  const [formErrors,     setFormErrors]     = useState({});
  const [submitting,     setSubmitting]     = useState(false);
  const [,               setAssignation]    = useState(null);

  /* ── Fetch centres au montage ── */
  useEffect(() => {
    fetch(`${API}/api/parcours/centres`)
      .then(r => r.json())
      .then(d => setCentres(d.centres || []))
      .catch(() => {});
  }, []);

  /* ── Step 0 : choisir le mode ── */
  const choisirMode = (mode) => {
    setModeCours(mode);
    setErreur("");
    setStep(1);
  };

  /* ── Step 1 (ligne) : choisir groupe/privé → fetch assistantes ── */
  const choisirCoaching = async (type) => {
    setTypeCoaching(type);
    setLoading(true); setErreur("");
    try {
      const r = await fetch(`${API}/api/parcours/assistantes-ligne?type_coaching=${type}&profil=b2c`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setAssistantes(d.assistantes || []);
      setStep(2);
    } catch (e) { setErreur(e.message); }
    finally { setLoading(false); }
  };

  /* ── Step 1 (présentiel) : choisir un centre → fetch assistante ── */
  const choisirCentre = async (centre) => {
    setCentreChoisi(centre);
    setLoading(true); setErreur("");
    try {
      const r = await fetch(`${API}/api/parcours/assistantes-presentiel/${centre.id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      setAssistante(d.assistante || null);
      setStep(2);
    } catch (e) { setErreur(e.message); }
    finally { setLoading(false); }
  };

  /* ── Step 2 (ligne) : choisir une assistante ── */
  const choisirAssistante = (a) => {
    setAssistante(a);
    setStep(3);
  };

  /* ── Validation formulaire ── */
  const validateForm = () => {
    const errors = {};
    if (!form.nom.trim()) errors.nom = "Votre nom est requis";
    if (!form.telephone.trim()) errors.telephone = "Votre numéro est requis";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ── Submit assignation ── */
  const submitAssignation = async () => {
    if (!validateForm()) return;
    setSubmitting(true); setErreur("");
    try {
      const r = await fetch(`${API}/api/parcours/assignation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistante_id:      assistante.id,
          prospect_nom:       form.nom.trim(),
          prospect_email:     form.email.trim() || undefined,
          prospect_telephone: form.telephone.trim(),
          type_cours:         modeCours,
          type_coaching:      typeCoaching || undefined,
          centre_id:          centreChoisi?.id || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur lors de l'assignation");
      setAssignation(d.assignation);
      setStep(4);
    } catch (e) { setErreur(e.message); }
    finally { setSubmitting(false); }
  };

  const reset = () => {
    setStep(0); setModeCours(null); setTypeCoaching(null);
    setCentreChoisi(null); setAssistante(null); setAssistantes([]);
    setForm({ nom:"", email:"", telephone:"" }); setFormErrors({});
    setErreur(""); setAssignation(null);
  };

  const totalSteps = 5;

  return (
    <>
      <SEO title="Inscription - BET" description="Finalisez votre inscription chez Binnie's English Training." canonicalUrl="/parcours/inscription" noindex />
      {/* <Navbar /> */}
      <div style={{ fontFamily:F, background:"#f8fafc", minHeight:"100vh" }}>

        {/* ── Hero ── */}
        <div style={{ background:`linear-gradient(135deg,${BET_DARK} 0%,${BET_NAVY} 60%,${BET_BLUE} 100%)`, padding:"56px 24px 48px", textAlign:"center" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.1)", borderRadius:999, padding:"6px 16px", marginBottom:18 }}>
            <span style={{ fontSize:".75rem", color:"rgba(255,255,255,.8)", fontWeight:700, letterSpacing:".08em" }}>DÉMARRER MON PARCOURS</span>
          </div>
          <h1 className="pt-hero-title" style={{ fontFamily:F, fontSize:"2.2rem", color:"#fff", margin:"0 0 14px", fontWeight:800, lineHeight:1.2 }}>
            Choisissez votre formule<br />
            <span style={{ color:"#38bdf8" }}>BET Languages</span>
          </h1>
          <p style={{ color:"rgba(255,255,255,.7)", fontSize:".95rem", maxWidth:480, margin:"0 auto", lineHeight:1.7 }}>
            En quelques clics, trouvez votre assistante dédiée et démarrez votre formation en anglais.
          </p>
        </div>

        {/* ── Wizard ── */}
        <div style={{ maxWidth:720, margin:"0 auto", padding:"40px 20px 80px" }}>

          {step < 4 && <StepBar step={step} total={totalSteps} />}

          {erreur && (
            <div style={{ background:"#fff0f2", border:"1px solid #ffb3bc", borderRadius:12, padding:"12px 18px", color:"#ff2945", fontSize:".88rem", marginBottom:20, animation:"ptFU .3s ease" }}>
              ⚠️ {erreur}
            </div>
          )}

          {loading && (
            <div style={{ textAlign:"center", padding:48 }}>
              <div style={{ width:36, height:36, border:"3px solid #e2e8f0", borderTopColor:BET_BLUE, borderRadius:"50%", animation:"ptSpin .8s linear infinite", margin:"0 auto 14px" }} />
              <p style={{ color:"#64748b", fontSize:".9rem" }}>Recherche des assistantes disponibles…</p>
            </div>
          )}

          {/* ═══ STEP 0 : Choisir le mode ═══ */}
          {step === 0 && !loading && (
            <div style={{ animation:"ptFU .4s ease" }}>
              <h2 style={{ fontFamily:F, fontSize:"1.4rem", color:BET_DARK, textAlign:"center", margin:"0 0 8px", fontWeight:800 }}>Comment souhaitez-vous apprendre ?</h2>
              <p style={{ color:"#64748b", textAlign:"center", marginBottom:32, fontSize:".9rem" }}>Choisissez le mode de formation qui vous convient.</p>
              <div className="pt-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                {[
                  {
                    mode:"en_ligne", icon:"💻",
                    title:"Cours en ligne",
                    desc:"Suivez vos cours depuis chez vous, à votre rythme. Accès à nos coachs via visioconférence.",
                    tags:["Coaching de groupe", "Coaching privé"],
                    color: BET_BLUE,
                  },
                  {
                    mode:"presentiel", icon:"🏫",
                    title:"Cours en présentiel",
                    desc:"Rejoignez l'un de nos 6 cabinets en Côte d'Ivoire pour une expérience immersive.",
                    tags:["Abidjan", "Bouaké", "6 centres"],
                    color: BET_NAVY,
                  },
                ].map(opt => (
                  <div
                    key={opt.mode}
                    className="pt-card"
                    onClick={() => choisirMode(opt.mode)}
                    style={{ background:"#fff", borderRadius:20, border:`2px solid #e2e8f0`, padding:"32px 24px", cursor:"pointer", transition:"all .25s", textAlign:"center", boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}
                  >
                    <div style={{ fontSize:"3rem", marginBottom:14 }}>{opt.icon}</div>
                    <h3 style={{ fontFamily:F, fontSize:"1.15rem", color:BET_DARK, margin:"0 0 10px", fontWeight:800 }}>{opt.title}</h3>
                    <p style={{ fontSize:".85rem", color:"#475569", lineHeight:1.65, margin:"0 0 16px" }}>{opt.desc}</p>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center" }}>
                      {opt.tags.map(t => (
                        <span key={t} style={{ background: opt.color + "18", color: opt.color, borderRadius:999, padding:"3px 10px", fontSize:".72rem", fontWeight:700 }}>{t}</span>
                      ))}
                    </div>
                    <button style={{ marginTop:20, background:`linear-gradient(135deg,${opt.color},${opt.mode==="en_ligne"?BET_NAVY:BET_BLUE})`, color:"#fff", border:"none", borderRadius:999, padding:"11px 28px", fontWeight:800, fontSize:".88rem", cursor:"pointer", fontFamily:F, width:"100%" }}>
                      Choisir →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ STEP 1 (en_ligne) : Groupe ou Privé ═══ */}
          {step === 1 && modeCours === "en_ligne" && !loading && (
            <div style={{ animation:"ptFU .4s ease" }}>
              <button onClick={() => setStep(0)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".85rem", marginBottom:24, display:"flex", alignItems:"center", gap:6 }}>← Retour</button>
              <h2 style={{ fontFamily:F, fontSize:"1.4rem", color:BET_DARK, textAlign:"center", margin:"0 0 8px", fontWeight:800 }}>Quel type de coaching ?</h2>
              <p style={{ color:"#64748b", textAlign:"center", marginBottom:32, fontSize:".9rem" }}>Choisissez entre le coaching en groupe ou un suivi individuel.</p>
              <div className="pt-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                {[
                  { type:"groupe", icon:"👥", title:"Coaching de groupe", desc:"Apprenez avec d'autres apprenants du même niveau. Sessions dynamiques et interactives.", prix:"Dès 35 000 FCFA/mois" },
                  { type:"prive",  icon:"👤", title:"Coaching privé",     desc:"Suivi personnalisé avec votre coach attitré. Progression rapide et agenda flexible.", prix:"Dès 65 000 FCFA/mois" },
                ].map(opt => (
                  <div
                    key={opt.type}
                    className="pt-card"
                    onClick={() => choisirCoaching(opt.type)}
                    style={{ background:"#fff", borderRadius:20, border:"2px solid #e2e8f0", padding:"28px 22px", cursor:"pointer", transition:"all .25s", textAlign:"center", boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}
                  >
                    <div style={{ fontSize:"2.6rem", marginBottom:12 }}>{opt.icon}</div>
                    <h3 style={{ fontFamily:F, fontSize:"1.05rem", color:BET_DARK, margin:"0 0 8px", fontWeight:800 }}>{opt.title}</h3>
                    <p style={{ fontSize:".83rem", color:"#475569", lineHeight:1.65, margin:"0 0 12px" }}>{opt.desc}</p>
                    <span style={{ background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"4px 12px", fontSize:".72rem", fontWeight:700 }}>{opt.prix}</span>
                    <button style={{ marginTop:18, background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", border:"none", borderRadius:999, padding:"10px 24px", fontWeight:800, fontSize:".85rem", cursor:"pointer", fontFamily:F, width:"100%" }}>
                      Choisir →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ STEP 1 (présentiel) : Choisir le cabinet ═══ */}
          {step === 1 && modeCours === "presentiel" && !loading && (
            <div style={{ animation:"ptFU .4s ease" }}>
              <button onClick={() => setStep(0)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".85rem", marginBottom:24, display:"flex", alignItems:"center", gap:6 }}>← Retour</button>
              <h2 style={{ fontFamily:F, fontSize:"1.4rem", color:BET_DARK, textAlign:"center", margin:"0 0 8px", fontWeight:800 }}>Quel cabinet vous convient ?</h2>
              <p style={{ color:"#64748b", textAlign:"center", marginBottom:32, fontSize:".9rem" }}>Sélectionnez le centre le plus proche de chez vous.</p>
              {centres.length === 0 ? (
                <p style={{ textAlign:"center", color:"#94a3b8" }}>Chargement des centres…</p>
              ) : (
                <div className="pt-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  {centres.map(c => (
                    <div
                      key={c.id}
                      className="pt-centre-card"
                      onClick={() => choisirCentre(c)}
                      style={{ background:"#fff", borderRadius:14, border:"2px solid #e2e8f0", padding:"18px 20px", cursor:"pointer", transition:"all .2s", display:"flex", alignItems:"center", gap:14 }}
                    >
                      <div style={{ width:44, height:44, borderRadius:12, background:`${BET_NAVY}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.4rem", flexShrink:0 }}>🏢</div>
                      <div>
                        <div style={{ fontWeight:800, fontSize:".9rem", color:BET_DARK }}>{c.nom}</div>
                        {c.ville && <div style={{ fontSize:".75rem", color:"#64748b", marginTop:2 }}>{c.ville}</div>}
                        {c.adresse && <div style={{ fontSize:".72rem", color:"#94a3b8", marginTop:1 }}>{c.adresse}</div>}
                      </div>
                      <span style={{ marginLeft:"auto", color:BET_NAVY, fontWeight:800, fontSize:"1.1rem" }}>→</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2 (en_ligne) : Liste des assistantes ═══ */}
          {step === 2 && modeCours === "en_ligne" && !loading && (
            <div style={{ animation:"ptFU .4s ease" }}>
              <button onClick={() => setStep(1)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".85rem", marginBottom:24, display:"flex", alignItems:"center", gap:6 }}>← Retour</button>
              <h2 style={{ fontFamily:F, fontSize:"1.4rem", color:BET_DARK, textAlign:"center", margin:"0 0 6px", fontWeight:800 }}>Choisissez votre assistante</h2>
              <p style={{ color:"#64748b", textAlign:"center", marginBottom:28, fontSize:".9rem" }}>
                {assistantes.length} assistante{assistantes.length > 1 ? "s" : ""} disponible{assistantes.length > 1 ? "s" : ""} · Coaching {typeCoaching === "groupe" ? "de groupe" : "privé"}
              </p>
              {assistantes.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px 24px", background:"#fff", borderRadius:16, border:"1.5px dashed #e2e8f0" }}>
                  <div style={{ fontSize:"2rem", marginBottom:12 }}>😔</div>
                  <p style={{ color:"#475569", fontSize:".9rem", lineHeight:1.6 }}>
                    Aucune assistante disponible pour le moment.<br />
                    <strong>Contactez-nous directement</strong> pour être pris(e) en charge.
                  </p>
                  <a href="tel:+2250700000000" style={{ display:"inline-block", marginTop:16, background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", borderRadius:999, padding:"10px 24px", fontWeight:700, textDecoration:"none", fontSize:".88rem" }}>
                    📞 Nous appeler
                  </a>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  {assistantes.map(a => (
                    <div
                      key={a.id}
                      className="pt-assistant-card"
                      onClick={() => choisirAssistante(a)}
                      style={{ background:"#fff", borderRadius:16, border:"2px solid #e2e8f0", padding:"18px 20px", cursor:"pointer", transition:"all .25s", display:"flex", alignItems:"center", gap:16, boxShadow:"0 2px 8px rgba(0,0,0,.04)" }}
                    >
                      <AssistanteAvatar a={a} size={52} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:800, fontSize:"1rem", color:BET_DARK }}>{a.prenom} {a.nom}</div>
                        <div style={{ fontSize:".78rem", color:"#64748b", marginTop:3 }}>Assistante BET Languages</div>
                        <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                          <span style={{ background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"2px 10px", fontSize:".7rem", fontWeight:700 }}>✓ Disponible</span>
                        </div>
                      </div>
                      <button style={{ background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", border:"none", borderRadius:999, padding:"10px 20px", fontWeight:800, fontSize:".82rem", cursor:"pointer", fontFamily:F, flexShrink:0, whiteSpace:"nowrap" }}>
                        Choisir →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2 (présentiel) : Assistante assignée ═══ */}
          {step === 2 && modeCours === "presentiel" && !loading && (
            <div style={{ animation:"ptFU .4s ease" }}>
              <button onClick={() => setStep(1)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".85rem", marginBottom:24, display:"flex", alignItems:"center", gap:6 }}>← Retour</button>
              <h2 style={{ fontFamily:F, fontSize:"1.4rem", color:BET_DARK, textAlign:"center", margin:"0 0 6px", fontWeight:800 }}>Votre assistante pour {centreChoisi?.nom}</h2>
              <p style={{ color:"#64748b", textAlign:"center", marginBottom:28, fontSize:".9rem" }}>
                Notre système vous a automatiquement assigné(e) une assistante disponible.
              </p>
              {!assistante ? (
                <div style={{ textAlign:"center", padding:"40px 24px", background:"#fff", borderRadius:16, border:"1.5px dashed #e2e8f0" }}>
                  <div style={{ fontSize:"2rem", marginBottom:12 }}>😔</div>
                  <p style={{ color:"#475569", fontSize:".9rem", lineHeight:1.6 }}>
                    Aucune assistante disponible pour ce centre aujourd'hui.<br />
                    <strong>Contactez-nous directement</strong> pour être pris(e) en charge.
                  </p>
                  <a href="tel:+2250700000000" style={{ display:"inline-block", marginTop:16, background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", borderRadius:999, padding:"10px 24px", fontWeight:700, textDecoration:"none", fontSize:".88rem" }}>
                    📞 Nous appeler
                  </a>
                </div>
              ) : (
                <>
                  <div style={{ background:"#fff", borderRadius:20, border:`2px solid ${BET_BLUE}`, padding:"28px 28px", textAlign:"center", boxShadow:"0 8px 32px rgba(8,145,178,.1)", animation:"ptPulse 2s ease infinite" }}>
                    <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
                      <AssistanteAvatar a={assistante} size={72} />
                    </div>
                    <h3 style={{ fontFamily:F, fontSize:"1.25rem", color:BET_DARK, margin:"0 0 6px", fontWeight:800 }}>{assistante.prenom} {assistante.nom}</h3>
                    <p style={{ color:"#64748b", fontSize:".85rem", margin:"0 0 16px" }}>Assistante - {centreChoisi?.nom}</p>
                    <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap", marginBottom:20 }}>
                      <span style={{ background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"4px 14px", fontSize:".75rem", fontWeight:700 }}>✓ Disponible aujourd'hui</span>
                      <span style={{ background:`${BET_BLUE}12`, color:BET_BLUE, borderRadius:999, padding:"4px 14px", fontSize:".75rem", fontWeight:700 }}>📍 {centreChoisi?.nom}</span>
                    </div>
                    <p style={{ color:"#475569", fontSize:".83rem", lineHeight:1.65, margin:0 }}>
                      Elle prendra contact avec vous dès réception de vos coordonnées pour planifier votre première session.
                    </p>
                  </div>
                  <button
                    className="pt-btn-primary"
                    onClick={() => setStep(3)}
                    style={{ marginTop:20, width:"100%", background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", border:"none", borderRadius:999, padding:"14px", fontWeight:800, fontSize:"1rem", cursor:"pointer", fontFamily:F, transition:"all .2s" }}
                  >
                    Continuer avec {assistante.prenom} →
                  </button>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP 3 : Formulaire prospect ═══ */}
          {step === 3 && !loading && (
            <div style={{ animation:"ptFU .4s ease" }}>
              <button onClick={() => setStep(2)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:".85rem", marginBottom:24, display:"flex", alignItems:"center", gap:6 }}>← Retour</button>

              {/* Résumé du choix */}
              <div style={{ background:`linear-gradient(135deg,${BET_NAVY}08,${BET_BLUE}08)`, border:"1.5px solid #bae6fd", borderRadius:14, padding:"14px 18px", marginBottom:24, display:"flex", alignItems:"center", gap:14 }}>
                {assistante && <AssistanteAvatar a={assistante} size={44} />}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:".9rem", color:BET_DARK }}>
                    {assistante ? `${assistante.prenom} ${assistante.nom}` : "Assistante assignée"}
                  </div>
                  <div style={{ fontSize:".75rem", color:"#64748b", marginTop:2 }}>
                    {modeCours === "en_ligne" ? `Cours en ligne · ${typeCoaching === "groupe" ? "Coaching de groupe" : "Coaching privé"}` : `Présentiel · ${centreChoisi?.nom || ""}`}
                  </div>
                </div>
                <span style={{ background:"#f0fdf4", color:"#16a34a", borderRadius:999, padding:"3px 10px", fontSize:".72rem", fontWeight:700 }}>✓ Sélectionnée</span>
              </div>

              <h2 style={{ fontFamily:F, fontSize:"1.4rem", color:BET_DARK, margin:"0 0 6px", fontWeight:800 }}>Vos coordonnées</h2>
              <p style={{ color:"#64748b", marginBottom:24, fontSize:".88rem" }}>
                Votre assistante vous contactera dans les plus brefs délais.
              </p>

              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {/* Nom */}
                <div>
                  <label style={{ display:"block", fontSize:".78rem", fontWeight:700, color:BET_DARK, marginBottom:6 }}>Nom complet *</label>
                  <input
                    value={form.nom}
                    onChange={e => { setForm(f => ({ ...f, nom: e.target.value })); setFormErrors(fe => ({ ...fe, nom: "" })); }}
                    placeholder="Ex : Kouamé Yao"
                    style={{ width:"100%", padding:"12px 14px", border:`1.5px solid ${formErrors.nom ? "#ff2945" : "#e2e8f0"}`, borderRadius:10, fontSize:".9rem", fontFamily:F, boxSizing:"border-box", outline:"none" }}
                  />
                  {formErrors.nom && <p style={{ color:"#ff2945", fontSize:".75rem", margin:"4px 0 0" }}>{formErrors.nom}</p>}
                </div>
                {/* Téléphone */}
                <div>
                  <label style={{ display:"block", fontSize:".78rem", fontWeight:700, color:BET_DARK, marginBottom:6 }}>Numéro WhatsApp / Téléphone *</label>
                  <input
                    value={form.telephone}
                    onChange={e => { setForm(f => ({ ...f, telephone: e.target.value })); setFormErrors(fe => ({ ...fe, telephone: "" })); }}
                    placeholder="+225 07 XX XX XX"
                    style={{ width:"100%", padding:"12px 14px", border:`1.5px solid ${formErrors.telephone ? "#ff2945" : "#e2e8f0"}`, borderRadius:10, fontSize:".9rem", fontFamily:F, boxSizing:"border-box", outline:"none" }}
                  />
                  {formErrors.telephone && <p style={{ color:"#ff2945", fontSize:".75rem", margin:"4px 0 0" }}>{formErrors.telephone}</p>}
                </div>
                {/* Email (optionnel) */}
                <div>
                  <label style={{ display:"block", fontSize:".78rem", fontWeight:700, color:BET_DARK, marginBottom:6 }}>Adresse e-mail <span style={{ color:"#94a3b8", fontWeight:400 }}>(optionnel)</span></label>
                  <input
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="votre@email.com"
                    type="email"
                    style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".9rem", fontFamily:F, boxSizing:"border-box", outline:"none" }}
                  />
                </div>

                <button
                  className="pt-btn-primary"
                  onClick={submitAssignation}
                  disabled={submitting}
                  style={{ background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", border:"none", borderRadius:999, padding:"14px", fontWeight:800, fontSize:"1rem", cursor:submitting?"not-allowed":"pointer", fontFamily:F, transition:"all .2s", opacity:submitting?.7:1, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}
                >
                  {submitting ? (
                    <><div style={{ width:16, height:16, border:"2px solid rgba(255,255,255,.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"ptSpin .7s linear infinite" }} /> Envoi en cours…</>
                  ) : "Confirmer et envoyer →"}
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 4 : Succès ═══ */}
          {step === 4 && (
            <div style={{ textAlign:"center", animation:"ptFU .5s ease" }}>
              <div style={{ width:80, height:80, borderRadius:"50%", background:"linear-gradient(135deg,#22c55e,#16a34a)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"2.2rem", margin:"0 auto 24px", boxShadow:"0 8px 24px rgba(34,197,94,.3)" }}>
                ✓
              </div>
              <h2 style={{ fontFamily:F, fontSize:"1.6rem", color:BET_DARK, margin:"0 0 10px", fontWeight:800 }}>Demande envoyée avec succès !</h2>
              <p style={{ color:"#475569", fontSize:".95rem", lineHeight:1.7, marginBottom:24, maxWidth:440, margin:"0 auto 24px" }}>
                <strong>{assistante?.prenom} {assistante?.nom}</strong> a été notifiée et vous contactera très prochainement sur le numéro fourni.
              </p>

              {/* Carte récap */}
              <div style={{ background:"#fff", borderRadius:18, border:"1.5px solid #e2e8f0", padding:"22px 24px", marginBottom:28, textAlign:"left", boxShadow:"0 4px 16px rgba(0,0,0,.06)" }}>
                <div style={{ fontWeight:800, fontSize:".85rem", color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em", marginBottom:14 }}>Récapitulatif</div>
                {[
                  { label:"Prospect",    value:form.nom },
                  { label:"Téléphone",   value:form.telephone },
                  { label:"Assistante",  value:assistante ? `${assistante.prenom} ${assistante.nom}` : "-" },
                  { label:"Mode",        value:modeCours === "en_ligne" ? `En ligne · ${typeCoaching === "groupe" ? "Groupe" : "Privé"}` : `Présentiel · ${centreChoisi?.nom || ""}` },
                ].map(row => (
                  <div key={row.label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f1f5f9", fontSize:".88rem" }}>
                    <span style={{ color:"#64748b" }}>{row.label}</span>
                    <span style={{ fontWeight:700, color:BET_DARK }}>{row.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
                <button
                  onClick={reset}
                  className="pt-btn-secondary"
                  style={{ background:"#f1f5f9", color:BET_DARK, border:"none", borderRadius:999, padding:"12px 26px", fontWeight:700, fontSize:".9rem", cursor:"pointer", fontFamily:F, transition:"background .2s" }}
                >
                  Nouveau parcours
                </button>
                <Link
                  to="/"
                  style={{ background:`linear-gradient(135deg,${BET_BLUE},${BET_NAVY})`, color:"#fff", borderRadius:999, padding:"12px 26px", fontWeight:700, fontSize:".9rem", textDecoration:"none", display:"inline-flex", alignItems:"center" }}
                >
                  Retour à l'accueil →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
