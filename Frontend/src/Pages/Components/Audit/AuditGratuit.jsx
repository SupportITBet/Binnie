// src/Pages/AuditGratuit/AuditGratuit.jsx
// ─────────────────────────────────────────────────────────────────────────────
// INTÉGRATION :
//
//  1. App.jsx  →  ajouter la route :
//     import AuditGratuit from "./Pages/AuditGratuit/AuditGratuit";
//     <Route path="/lead-magnet/audit-gratuit" element={<AuditGratuit />} />
//
//  2. La NavLink "/lead-magnet/audit-gratuit" existe déjà dans votre Navbar ✅
//
//  3. Email réel : remplacer la fonction simulateSend() par un appel
//     EmailJS (gratuit) ou votre endpoint backend.
//     Exemple EmailJS :
//       import emailjs from '@emailjs/browser';
//       await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../../Footer/Footer";

/* ── Fonts & KF ─────────────────────────────────────────── */
if (!document.querySelector("#aud-fonts")) {
  const l = document.createElement("link"); l.id = "aud-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#aud-kf")) {
  const s = document.createElement("style"); s.id = "aud-kf";
  s.textContent = `
    @keyframes audFU  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
    @keyframes audFI  { from{opacity:0} to{opacity:1} }
    @keyframes audSI  { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
    @keyframes audSpin{ to{transform:rotate(360deg)} }
    @keyframes audPulse{0%,100%{box-shadow:0 0 0 0 rgba(30,58,138,.3)}60%{box-shadow:0 0 0 12px rgba(30,58,138,0)}}
    @keyframes audBar { from{width:0} to{width:var(--bw,0%)} }
    .aud-input:focus  { border-color:#0c33ac !important; box-shadow:0 0 0 3px rgba(30,58,138,.1) !important; outline:none; }
    .aud-step-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.1) !important; }
    .aud-benefit:hover { border-color:#0c33ac !important; background:#eef1ff !important; }
    .aud-faq-item { transition:border-color .2s; }
  `;
  document.head.appendChild(s);
}

/* ── Injection responsive ───────────────────────────────── */
if (!document.querySelector("#aud-responsive")) {
  const resp = document.createElement("style");
  resp.id = "aud-responsive";
  resp.textContent = `
    .aud-root { overflow-x: hidden; max-width: 100%; }
    
    /* Hero layout */
    @media (max-width: 900px) {
      .aud-hero-layout {
        grid-template-columns: 1fr !important;
        gap: 32px !important;
        padding-bottom: 40px !important;
      }
      .aud-two-col {
        grid-template-columns: 1fr !important;
        gap: 32px !important;
      }
    }
    
    /* Grilles */
    @media (max-width: 768px) {
      .aud-steps-grid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 20px;
      }
      .aud-cta-band-inner {
        grid-template-columns: 1fr !important;
        text-align: center;
        gap: 24px !important;
      }
      .aud-cta-band-inner > div:last-child {
        justify-content: center;
      }
      .aud-hero-proof-row {
        justify-content: center;
      }
      .aud-hero-tag-row {
        justify-content: center;
      }
      .aud-hero-h1 {
        text-align: center;
      }
      .aud-hero-desc {
        text-align: center;
        margin-left: auto;
        margin-right: auto;
      }
      .aud-form-actions {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }
      .aud-form-actions button {
        width: 100%;
        justify-content: center;
      }
      .aud-obj-grid {
        justify-content: center;
      }
    }
    
    @media (max-width: 640px) {
      .aud-steps-grid {
        grid-template-columns: 1fr !important;
      }
      .aud-hero-pill {
        padding: 8px 12px !important;
        min-width: 70px;
      }
      .aud-hero-pill span:first-child {
        font-size: 0.9rem;
      }
      .aud-hero-pill span:nth-child(2) {
        font-size: 1rem !important;
      }
    }
    
    @media (max-width: 480px) {
      .aud-faq-q {
        font-size: 0.85rem !important;
        padding: 12px 14px !important;
      }
      .aud-faq-a {
        font-size: 0.85rem !important;
      }
      .aud-recap-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
      .aud-recap-val {
        text-align: left;
      }
      .aud-obj-btn {
        font-size: 0.72rem !important;
        padding: 5px 10px !important;
      }
      .aud-form-card-title {
        font-size: 1rem !important;
      }
      .aud-progress-wrap {
        padding: 16px 16px 0 !important;
      }
      .aud-form-card-header {
        padding: 12px 16px 0 !important;
      }
      .aud-form-body {
        padding: 12px 16px 20px !important;
      }
      .aud-success-card {
        padding: 24px 20px !important;
      }
      .aud-success-h1 {
        font-size: 1.4rem !important;
      }
      .aud-success-sub {
        font-size: 0.85rem !important;
      }
    }
  `;
  document.head.appendChild(resp);
}

/* ── InView hook ────────────────────────────────────────── */
function useInView(t = 0.15) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true); }, { threshold: t });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [ref, v];
}

/* ── ENVOI BACKEND ───────────────────────────────────────── */
async function sendAudit(data) {
  const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
  const besoins = [
    data.sector && `Secteur : ${data.sector}`,
    data.currentLevel && `Niveau actuel : ${data.currentLevel}`,
    data.objectives?.length && `Objectifs : ${data.objectives.join(", ")}`,
    data.budget && `Budget : ${data.budget}`,
    data.timeline && `Délai : ${data.timeline}`,
    data.role && `Rôle : ${data.role}`,
    data.message,
  ].filter(Boolean).join(" | ");

  const res = await fetch(`${API}/api/entreprise/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entreprise:  data.company,
      contact:     data.name,
      email:       data.email,
      telephone:   data.phone,
      nb_employes: data.employees || data.totalEmployees || null,
      besoins:     besoins || null,
    }),
  });
  if (!res.ok) throw new Error("Erreur serveur");
}

/* ════════════════════════════════════════════════════════
   DONNÉES
════════════════════════════════════════════════════════ */
const SECTORS = ["Finance & Banque","Télécommunications","Pétrole & Gaz","Distribution & Commerce","Industrie & BTP","Santé & Pharmacie","Technologie & IT","Hôtellerie & Tourisme","ONG & Organisations Int.","Autre"];
const LEVELS  = ["Débutants (A1-A2)","Intermédiaires (B1-B2)","Avancés (C1-C2)","Niveaux mixtes","Inconnu / À évaluer"];
const BUDGETS = ["< 500 000 FCFA","500 000 – 1 000 000 FCFA","1 000 000 – 3 000 000 FCFA","3 000 000 – 5 000 000 FCFA","+ 5 000 000 FCFA","À discuter"];
const TIMELINES = ["Immédiatement","Dans 1 mois","Dans 2 à 3 mois","Dans 6 mois","En cours d'année"];
const SIZES   = ["1 – 10","11 – 50","51 – 100","101 – 250","250+"];
const OBJECTIVES = [
  "Préparer aux certifications TOEIC / IELTS",
  "Améliorer la communication client internationale",
  "Former les managers à conduire des réunions en anglais",
  "Préparer des collaborateurs pour des missions à l'étranger",
  "Formation anglais des affaires général",
  "Perfectionnement oral et présentations",
  "Immersion linguistique (séjour)",
];

const BENEFITS = [
  { ico:"🎯", title:"Audit 100% personnalisé",     desc:"Analyse complète des besoins linguistiques de vos équipes selon votre secteur d'activité." },
  { ico:"📊", title:"Rapport détaillé offert",      desc:"Vous recevez un rapport complet avec niveaux CECRL, recommandations et plan de formation." },
  { ico:"⚡", title:"Réponse sous 24h",             desc:"Notre équipe vous contacte le jour ouvré suivant votre demande pour planifier l'audit." },
  { ico:"💼", title:"Tarifs entreprise dégressifs", desc:"Des tarifs négociés selon l'effectif à former, avec financement FDFP disponible." },
  { ico:"🏛️", title:"Cabinet agréé État CI",        desc:"Certification officielle reconnue nationalement pour vos apprenants en fin de formation." },
  { ico:"🌍", title:"6 centres + distanciel",       desc:"Formation dispensée dans nos centres ou en ligne selon votre organisation interne." },
];

const STEPS = [
  { num:"01", ico:"📋", title:"Remplissez le formulaire",    desc:"5 minutes pour décrire votre entreprise, vos équipes et vos objectifs linguistiques." },
  { num:"02", ico:"📧", title:"Confirmation immédiate",      desc:"Vous recevez un email de confirmation automatique avec les prochaines étapes." },
  { num:"03", ico:"📞", title:"Appel de cadrage (30 min)",   desc:"Notre expert RH & formation vous rappelle pour approfondir vos besoins." },
  { num:"04", ico:"📄", title:"Rapport d'audit offert",      desc:"Sous 48h, vous recevez votre rapport personnalisé avec plan de formation et devis." },
];

const FAQ = [
  { q:"L'audit est-il vraiment gratuit ?",              a:"Oui, entièrement gratuit et sans engagement. Il n'existe aucune obligation de souscrire à une formation après l'audit." },
  { q:"Combien de temps dure l'audit ?",                a:"L'appel de cadrage dure 30 minutes. Si un test de positionnement des collaborateurs est souhaité, une demi-journée est nécessaire en présentiel ou à distance." },
  { q:"Quels documents doit-on fournir ?",              a:"Aucun document préalable n'est requis. Le formulaire suffit pour démarrer. Nous adaptons l'audit à vos contraintes." },
  { q:"La formation peut-elle être financée par le FDFP ?", a:"Oui. BET est agréé pour les formations éligibles au financement FDFP. Notre équipe vous accompagne dans les démarches de remboursement." },
  { q:"Combien d'employés minimum pour bénéficier de l'audit ?", a:"L'audit B2B est disponible à partir de 3 employés. Pour les petites équipes, des tarifs adaptés sont disponibles." },
];

/* ════════════════════════════════════════════════════════
   FORMULAIRE PRINCIPAL
════════════════════════════════════════════════════════ */
const AuditGratuit = () => {
  const navigate = useNavigate();

  const INIT = { company:"", sector:"", totalEmployees:"", employees:"", name:"", role:"", email:"", phone:"", currentLevel:"", objectives:[], budget:"", timeline:"", message:"", consent:false };
  const [form,       setForm]       = useState(INIT);
  const [errors,     setErrors]     = useState({});
  const [step,       setStep]       = useState(1); // 1 = Entreprise, 2 = Contact & Objectifs, 3 = Confirmation
  const [submitting, setSubmitting] = useState(false);
  const [sent,       setSent]       = useState(false);
  const [openFaq,    setOpenFaq]    = useState(null);

  const [heroRef,    heroInView]    = useInView();
  const [formRef,    formInView]    = useInView();
  const [stepsRef,   stepsInView]   = useInView();
  const [benefRef,   benefInView]   = useInView();

  const set = (key, val) => { setForm(p => ({ ...p, [key]: val })); setErrors(p => ({ ...p, [key]: null })); };
  const toggleObj = (obj) => set("objectives", form.objectives.includes(obj) ? form.objectives.filter(o => o !== obj) : [...form.objectives, obj]);

  /* Progress */
  const progress = step === 1 ? 33 : step === 2 ? 66 : 100;

  /* Validation */
  const validateStep1 = () => {
    const e = {};
    if (!form.company.trim())       e.company       = "Requis";
    if (!form.sector)               e.sector        = "Requis";
    if (!form.totalEmployees)       e.totalEmployees= "Requis";
    if (!form.employees)            e.employees     = "Requis";
    return e;
  };
  const validateStep2 = () => {
    const e = {};
    if (!form.name.trim())    e.name  = "Requis";
    if (!form.role.trim())    e.role  = "Requis";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Email invalide";
    if (!form.phone.trim())   e.phone = "Requis";
    if (!form.consent)        e.consent = "Requis";
    return e;
  };

  const goNext = () => {
    const errs = step === 1 ? validateStep1() : validateStep2();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior:"smooth" });
  };

  const [erreur, setErreur] = useState("");

  const handleSubmit = async () => {
    const errs = validateStep2();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    setErreur("");
    try {
      await sendAudit(form);
      setSent(true);
      window.scrollTo({ top: 0, behavior:"smooth" });
    } catch {
      setErreur("Une erreur est survenue. Veuillez réessayer ou nous contacter directement.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── SUCCÈS ─────────────────────────────────────── */
  if (sent) return (
    <>
      <div style={{ ...S.page, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"80vh", padding:"40px 16px" }}>
        <div className="aud-success-card" style={{ ...S.successCard, animation:"audSI .5s ease" }}>
          <div style={{ fontSize:"4rem", marginBottom:16 }}>🎉</div>
          <h1 className="aud-success-h1" style={S.successH1}>Demande bien reçue !</h1>
          <p className="aud-success-sub" style={S.successSub}>
            Merci <strong>{form.name}</strong> pour votre confiance.<br />
            Un expert BET va contacter <strong>{form.email}</strong> sous <strong>24h ouvrées</strong>.
          </p>
          <div style={S.successSteps}>
            {[
              { ico:"📧", txt:`Email de confirmation envoyé à ${form.email}` },
              { ico:"📞", txt:"Notre équipe vous rappelle sous 24h pour planifier l'audit" },
              { ico:"📄", txt:"Rapport d'audit personnalisé sous 48h après l'appel" },
            ].map((it, i) => (
              <div key={i} style={S.successStep}>
                <span style={S.successStepIco}>{it.ico}</span>
                <span style={{ fontSize:".9rem", color:"#334155" }}>{it.txt}</span>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", justifyContent:"center" }}>
            <button style={S.btnBlue} onClick={() => navigate("/")}
              onMouseEnter={e => e.currentTarget.style.background="#0c33ac"}
              onMouseLeave={e => e.currentTarget.style.background="#0c33ac"}>
              ← Retour à l'accueil
            </button>
            <button style={S.btnOutline} onClick={() => navigate("/contact")}>
              Nous contacter directement
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );

  return (
    <div className="aud-root" style={S.page}>

      {/* ── HERO ─────────────────────────────────── */}
      <div ref={heroRef} style={S.hero}>
        <div style={S.heroOrb1} /><div style={S.heroOrb2} />
        <div style={S.heroInner}>
          <div style={S.breadcrumb}>
            <span style={S.bLink} onClick={() => navigate("/")}>Accueil</span>
            <span style={S.bSep}>/</span>
            <span style={{ color:"#e2e8f0" }}>Audit gratuit entreprise</span>
          </div>

          <div className="aud-hero-layout" style={S.heroLayout}>
            <div style={{ animation: heroInView ? "audFU .6s ease both" : "none" }}>
              <div className="aud-hero-tag-row" style={S.heroTagRow}>
                <span style={S.tagBlue}>🏛️ CABINET AGRÉÉ ÉTAT CI</span>
                <span style={S.tagRed}>🎁 100% GRATUIT · SANS ENGAGEMENT</span>
              </div>
              <h1 className="aud-hero-h1" style={S.heroH1}>
                Audit linguistique<br />
                <em style={S.heroAccent}>gratuit pour votre entreprise</em>
              </h1>
              <p className="aud-hero-desc" style={S.heroDesc}>
                Évaluez le niveau d'anglais de vos équipes, identifiez les besoins de formation
                et recevez un plan personnalisé avec devis - <strong style={{ color:"#fbbf24" }}>entièrement gratuit</strong>.
              </p>
              <div className="aud-hero-proof-row" style={S.heroProofRow}>
                {[["🏆","500+","Entreprises auditées"],["⭐","96%","Taux de satisfaction"],["⚡","24h","Délai de réponse"]].map(([ico, num, lbl], i) => (
                  <div key={i} className="aud-hero-pill" style={S.heroPill}>
                    <span style={{ fontSize:"1.1rem" }}>{ico}</span>
                    <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:"1.2rem", color:"#fff" }}>{num}</span>
                    <span style={{ fontSize:".72rem", color:"rgba(255,255,255,.6)", fontWeight:600 }}>{lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...S.heroFormCard, animation: heroInView ? "audFU .7s ease .15s both" : "none" }}>
              <p style={{ fontSize:".78rem", fontWeight:800, color:"rgba(255,255,255,.5)", letterSpacing:".08em", textTransform:"uppercase", margin:"0 0 8px" }}>Ce que vous obtenez</p>
              {[
                "Analyse CECRL de vos équipes",
                "Rapport de recommandations personnalisé",
                "Plan de formation sur-mesure",
                "Devis transparent et négociable",
                "Conseil financement FDFP",
              ].map((it, i) => (
                <div key={i} style={S.heroCheckItem}>
                  <span style={S.heroCheckDot}>✓</span>
                  <span style={{ fontSize:".88rem", color:"rgba(255,255,255,.82)" }}>{it}</span>
                </div>
              ))}
              <div style={S.heroFdfpBadge}>
                <span style={{ fontSize:".9rem" }}>💼</span>
                <span style={{ fontSize:".8rem", fontWeight:700, color:"#fde68a" }}>Financement FDFP disponible</span>
              </div>
            </div>
          </div>
        </div>

        {/* Wave */}
        <div style={{ lineHeight:0, marginTop:12 }}>
          <svg viewBox="0 0 1440 48" style={{ display:"block", width:"100%" }} preserveAspectRatio="none">
            <path fill="#f8fafc" d="M0,24 C480,48 960,0 1440,24 L1440,48 L0,48 Z" />
          </svg>
        </div>
      </div>

      {/* ── ÉTAPES ───────────────────────────────── */}
      <div ref={stepsRef} style={S.stepsSection}>
        <div style={S.inner}>
          <div style={{ textAlign:"center", marginBottom:40 }}>
            <span style={S.sectionBadge}>COMMENT ÇA MARCHE</span>
            <h2 style={S.sectionH2}>4 étapes simples vers votre audit</h2>
          </div>
          <div className="aud-steps-grid" style={S.stepsGrid}>
            {STEPS.map((st, i) => (
              <div key={i} className="aud-step-card" style={{ ...S.stepCard, opacity: stepsInView ? 1 : 0, transform: stepsInView ? "none" : "translateY(18px)", transition:`all .5s ease ${i*100}ms` }}>
                <div style={{ ...S.stepNumBadge, background: i % 2 === 0 ? "#0c33ac" : "#ff2945" }}>{st.num}</div>
                <div style={S.stepIco}>{st.ico}</div>
                <h3 style={S.stepTitle}>{st.title}</h3>
                <p style={S.stepDesc}>{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BÉNÉFICES + FORMULAIRE ───────────────── */}
      <div style={S.mainLayout}>
        <div style={S.inner}>
          <div className="aud-two-col" style={S.twoCol}>

            {/* Colonne gauche : bénéfices */}
            <div ref={benefRef} style={S.benefCol}>
              <h2 style={S.sectionH2}>Pourquoi demander l'audit BET ?</h2>
              <div style={S.benefGrid}>
                {BENEFITS.map((b, i) => (
                  <div key={i} className="aud-benefit" style={{ ...S.benefCard, opacity: benefInView?1:0, transform: benefInView?"none":"translateY(14px)", transition:`all .45s ease ${i*90}ms` }}>
                    <div style={S.benefIco}>{b.ico}</div>
                    <div>
                      <h4 style={S.benefTitle}>{b.title}</h4>
                      <p style={S.benefDesc}>{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Clients logo placeholder */}
              <div style={S.clientsBlock}>
                <p style={{ fontSize:".78rem", fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em", margin:"0 0 14px" }}>Entreprises qui nous font confiance</p>
                <div style={S.clientsRow}>
                  {["NSIA","Orange CI","Bolloré","MTN CI","BICICI","SGBCI"].map((c, i) => (
                    <div key={i} style={S.clientPill}>{c}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Colonne droite : FORMULAIRE */}
            <div ref={formRef} style={{ ...S.formCard, opacity: formInView?1:0, transform: formInView?"none":"translateX(24px)", transition:"all .6s ease .1s" }}>

              {/* Progress bar */}
              <div className="aud-progress-wrap" style={S.progressWrap}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  {["Votre entreprise","Contact & Objectifs","Validation"].map((lbl, i) => (
                    <span key={i} style={{ fontSize:".72rem", fontWeight: step === i+1 ? 800 : 500, color: step === i+1 ? "#0c33ac" : step > i+1 ? "#10b981" : "#94a3b8" }}>
                      {step > i+1 ? "✓ " : ""}{lbl}
                    </span>
                  ))}
                </div>
                <div style={S.progressTrack}>
                  <div style={{ ...S.progressFill, "--bw":`${progress}%`, width:`${progress}%`, transition:"width .5s ease" }} />
                </div>
              </div>

              <div className="aud-form-card-header" style={S.formCardHeader}>
                <h2 className="aud-form-card-title" style={S.formCardTitle}>
                  {step === 1 ? "🏢 Parlez-nous de votre entreprise" : step === 2 ? "👤 Vos coordonnées & objectifs" : "✅ Vérification & envoi"}
                </h2>
                <p style={S.formCardSub}>Étape {step} / 3 · {step === 1 ? "Informations générales" : step === 2 ? "Contact et besoins" : "Récapitulatif"}</p>
              </div>

              <div className="aud-form-body" style={S.formBody}>

                {/* ── ÉTAPE 1 ── */}
                {step === 1 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div className="FRow" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      <FField label="Nom de l'entreprise *" error={errors.company}>
                        <input className="aud-input" style={{ ...S.inp, ...(errors.company?S.inpErr:{}) }} placeholder="Mon Entreprise SARL" value={form.company} onChange={e=>set("company",e.target.value)} />
                      </FField>
                      <FField label="Secteur d'activité *" error={errors.sector}>
                        <select className="aud-input" style={{ ...S.inp, ...(errors.sector?S.inpErr:{}), cursor:"pointer" }} value={form.sector} onChange={e=>set("sector",e.target.value)}>
                          <option value="">Sélectionner…</option>
                          {SECTORS.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </FField>
                    </div>
                    <div className="FRow" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      <FField label="Effectif total de l'entreprise *" error={errors.totalEmployees}>
                        <select className="aud-input" style={{ ...S.inp, ...(errors.totalEmployees?S.inpErr:{}), cursor:"pointer" }} value={form.totalEmployees} onChange={e=>set("totalEmployees",e.target.value)}>
                          <option value="">Sélectionner…</option>
                          {SIZES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </FField>
                      <FField label="Nombre d'employés à former *" error={errors.employees}>
                        <select className="aud-input" style={{ ...S.inp, ...(errors.employees?S.inpErr:{}), cursor:"pointer" }} value={form.employees} onChange={e=>set("employees",e.target.value)}>
                          <option value="">Sélectionner…</option>
                          {["1 – 5","6 – 10","11 – 20","21 – 50","50+"].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </FField>
                    </div>
                    <FField label="Niveau anglais actuel estimé">
                      <select className="aud-input" style={{ ...S.inp, cursor:"pointer" }} value={form.currentLevel} onChange={e=>set("currentLevel",e.target.value)}>
                        <option value="">Sélectionner…</option>
                        {LEVELS.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </FField>
                    <FField label="Budget envisagé pour la formation">
                      <select className="aud-input" style={{ ...S.inp, cursor:"pointer" }} value={form.budget} onChange={e=>set("budget",e.target.value)}>
                        <option value="">Sélectionner…</option>
                        {BUDGETS.map(b => <option key={b}>{b}</option>)}
                      </select>
                    </FField>
                    <FField label="Délai souhaité pour démarrer">
                      <select className="aud-input" style={{ ...S.inp, cursor:"pointer" }} value={form.timeline} onChange={e=>set("timeline",e.target.value)}>
                        <option value="">Sélectionner…</option>
                        {TIMELINES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </FField>
                  </div>
                )}

                {/* ── ÉTAPE 2 ── */}
                {step === 2 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                    <div className="FRow" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      <FField label="Nom du responsable *" error={errors.name}>
                        <input className="aud-input" style={{ ...S.inp, ...(errors.name?S.inpErr:{}) }} placeholder="Jean Kouamé" value={form.name} onChange={e=>set("name",e.target.value)} />
                      </FField>
                      <FField label="Poste / Fonction *" error={errors.role}>
                        <input className="aud-input" style={{ ...S.inp, ...(errors.role?S.inpErr:{}) }} placeholder="DRH, Directeur, Manager..." value={form.role} onChange={e=>set("role",e.target.value)} />
                      </FField>
                    </div>
                    <div className="FRow" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      <FField label="Email professionnel *" error={errors.email}>
                        <input className="aud-input" style={{ ...S.inp, ...(errors.email?S.inpErr:{}) }} type="email" placeholder="jean@entreprise.ci" value={form.email} onChange={e=>set("email",e.target.value)} />
                      </FField>
                      <FField label="Téléphone *" error={errors.phone}>
                        <input className="aud-input" style={{ ...S.inp, ...(errors.phone?S.inpErr:{}) }} placeholder="+225 07 00 00 00 00" value={form.phone} onChange={e=>set("phone",e.target.value)} />
                      </FField>
                    </div>

                    {/* Objectifs multi-select */}
                    <FField label="Objectifs principaux (plusieurs choix possibles)">
                      <div className="aud-obj-grid" style={S.objGrid}>
                        {OBJECTIVES.map(obj => (
                          <button key={obj} type="button" className="aud-obj-btn" style={{ ...S.objBtn, ...(form.objectives.includes(obj) ? S.objBtnActive : {}) }}
                            onClick={() => toggleObj(obj)}>
                            {form.objectives.includes(obj) ? "✓ " : ""}{obj}
                          </button>
                        ))}
                      </div>
                    </FField>

                    <FField label="Message complémentaire">
                      <textarea className="aud-input" style={{ ...S.inp, height:90, resize:"vertical" }} placeholder="Précisez vos attentes, contraintes ou questions particulières…" value={form.message} onChange={e=>set("message",e.target.value)} />
                    </FField>

                    {/* Consent */}
                    <label style={S.consentRow}>
                      <input type="checkbox" checked={form.consent} onChange={e=>set("consent",e.target.checked)} style={{ accentColor:"#0c33ac", width:16, height:16, marginTop:2 }} />
                      <span style={{ fontSize:".84rem", color:"#475569", lineHeight:1.6 }}>
                        J'accepte que les informations saisies soient utilisées par Binnie's English Training pour préparer mon audit et me recontacter.
                        <span style={{ color:"#94a3b8" }}> (Données confidentielles · Désinscription facile)</span>
                      </span>
                    </label>
                    {errors.consent && <p style={S.errTxt}>⚠ Veuillez accepter les conditions</p>}
                  </div>
                )}

                {/* ── ÉTAPE 3 : RÉCAP ── */}
                {step === 3 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    <div style={S.recapCard}>
                      <h4 style={S.recapTitle}>🏢 Votre entreprise</h4>
                      {[
                        ["Entreprise",  form.company],
                        ["Secteur",     form.sector],
                        ["Effectif total", form.totalEmployees],
                        ["À former",    form.employees],
                        ["Niveau actuel",form.currentLevel||"Non précisé"],
                        ["Budget",      form.budget||"Non précisé"],
                        ["Délai",       form.timeline||"Non précisé"],
                      ].map(([k,v]) => (
                        <div key={k} className="aud-recap-row" style={S.recapRow}><span style={S.recapKey}>{k}</span><span className="aud-recap-val" style={S.recapVal}>{v}</span></div>
                      ))}
                    </div>
                    <div style={S.recapCard}>
                      <h4 style={S.recapTitle}>👤 Votre contact</h4>
                      {[
                        ["Nom",     form.name],
                        ["Poste",   form.role],
                        ["Email",   form.email],
                        ["Tél.",    form.phone],
                      ].map(([k,v]) => (
                        <div key={k} className="aud-recap-row" style={S.recapRow}><span style={S.recapKey}>{k}</span><span className="aud-recap-val" style={S.recapVal}>{v}</span></div>
                      ))}
                    </div>
                    {form.objectives.length > 0 && (
                      <div style={S.recapCard}>
                        <h4 style={S.recapTitle}>🎯 Objectifs</h4>
                        {form.objectives.map((o, i) => <div key={i} className="aud-recap-row" style={S.recapRow}><span style={{ color:"#059669" }}>✓</span><span className="aud-recap-val" style={S.recapVal}>{o}</span></div>)}
                      </div>
                    )}
                    <div style={S.recapNote}>
                      📧 Un email de confirmation sera envoyé à <strong>{form.email}</strong> et à l'équipe BET.
                    </div>
                  </div>
                )}

                {/* ── BOUTONS NAVIGATION ── */}
                {erreur && <p style={{ ...S.errTxt, textAlign:"center", marginBottom:8 }}>⚠ {erreur}</p>}
                <div className="aud-form-actions" style={S.formActions}>
                  {step > 1 && (
                    <button style={S.btnBack} onClick={() => setStep(s => s-1)}>← Retour</button>
                  )}
                  {step < 3 ? (
                    <button style={S.btnBlue}
                      onMouseEnter={e => e.currentTarget.style.background="#0c33ac"}
                      onMouseLeave={e => e.currentTarget.style.background="#0c33ac"}
                      onClick={goNext}>
                      Continuer →
                    </button>
                  ) : (
                    <button style={{ ...S.btnRed, opacity: submitting ? .7 : 1 }}
                      onMouseEnter={e => { if (!submitting) e.currentTarget.style.background="#b91c1c"; }}
                      onMouseLeave={e => { e.currentTarget.style.background="#ff2945"; }}
                      onClick={handleSubmit} disabled={submitting}>
                      {submitting
                        ? <span style={{ display:"flex", alignItems:"center", gap:10 }}><span style={S.spinner} />Envoi en cours…</span>
                        : "🚀 Envoyer ma demande d'audit"}
                    </button>
                  )}
                </div>

                <p style={{ textAlign:"center", fontSize:".74rem", color:"#94a3b8", marginTop:8 }}>
                  ✓ 100% gratuit · ✓ Sans engagement · ✓ Réponse sous 24h
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FAQ ──────────────────────────────────── */}
      <div style={S.faqSection}>
        <div style={S.inner}>
          <div style={{ textAlign:"center", marginBottom:36 }}>
            <span style={S.sectionBadge}>QUESTIONS FRÉQUENTES</span>
            <h2 style={S.sectionH2}>Tout ce qu'il faut savoir</h2>
          </div>
          <div style={{ maxWidth:720, margin:"0 auto", display:"flex", flexDirection:"column", gap:10 }}>
            {FAQ.map((item, i) => (
              <div key={i} className="aud-faq-item" style={{ ...S.faqItem, borderColor: openFaq===i?"#0c33ac":"#e2e8f0" }}>
                <button className="aud-faq-q" style={S.faqQ} onClick={() => setOpenFaq(openFaq===i?null:i)}>
                  <span>{item.q}</span>
                  <span style={{ fontSize:"1.2rem", color:"#0c33ac", transition:"transform .2s", transform: openFaq===i?"rotate(45deg)":"rotate(0)" }}>+</span>
                </button>
                {openFaq === i && <p className="aud-faq-a" style={S.faqA}>{item.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA FINAL ────────────────────────────── */}
      <div style={S.ctaBand}>
        <div style={S.ctaBandOrb} />
        <div className="aud-cta-band-inner" style={{ ...S.inner, position:"relative", zIndex:1, display:"grid", gridTemplateColumns:"1fr auto", gap:40, alignItems:"center" }}>
          <div>
            <p style={{ color:"rgba(255,255,255,.6)", fontSize:".9rem", marginBottom:10 }}>📞 Vous préférez nous appeler ?</p>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:"clamp(1.5rem,3vw,2.2rem)", color:"#fff", margin:0, fontWeight:400 }}>
              Notre équipe est disponible<br /><span style={{ color:"#38bdf8" }}>7 jours sur 7</span>
            </h2>
          </div>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            <button style={S.ctaBtnGold}
              onMouseEnter={e=>e.currentTarget.style.background="#fbbf24"}
              onMouseLeave={e=>e.currentTarget.style.background="#f59e0b"}
              onClick={()=>navigate("/contact")}>
              📞 Nous appeler
            </button>
            <button style={S.ctaBtnGhost}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}
              onClick={()=>window.scrollTo({top:0,behavior:"smooth"})}>
              Remplir le formulaire ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );

};

/* ── Helpers formulaire ─────────────────────────────── */
const FField = ({ label, children, error }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
    <label style={{ fontSize:".78rem", fontWeight:700, color:"#011451" }}>{label}</label>
    {children}
    {error && <span style={{ fontSize:".73rem", color:"#ff2945", fontWeight:600 }}>⚠ {error}</span>}
  </div>
);

/* ════════════════════════════════════════════════════════
   STYLES (sans les @media internes)
════════════════════════════════════════════════════════ */
const FF = "'Montserrat','Segoe UI',sans-serif";
const FD = "'Montserrat','Segoe UI',sans-serif";

const S = {
  page:         { fontFamily:FF, background:"#f8fafc", minHeight:"100vh", color:"#011451" },
  inner:        { maxWidth:1180, margin:"0 auto", padding:"0 24px" },

  /* HERO */
  hero:         { background:"linear-gradient(135deg,#011451 0%,#011451 55%,#0c33ac 100%)", padding:"52px 0 0", position:"relative", overflow:"hidden" },
  heroOrb1:     { position:"absolute", width:380, height:380, borderRadius:"50%", background:"rgba(220,38,38,.1)", top:-100, right:-60, pointerEvents:"none" },
  heroOrb2:     { position:"absolute", width:240, height:240, borderRadius:"50%", background:"rgba(30,58,138,.2)", bottom:40, left:-50, pointerEvents:"none" },
  heroInner:    { maxWidth:1180, margin:"0 auto", padding:"0 24px", position:"relative", zIndex:1 },
  breadcrumb:   { display:"flex", alignItems:"center", gap:8, marginBottom:24, fontSize:".82rem", flexWrap:"wrap" },
  bLink:        { color:"rgba(255,255,255,.6)", cursor:"pointer", textDecoration:"underline" },
  bSep:         { color:"rgba(255,255,255,.3)" },
  heroLayout:   { display:"grid", gridTemplateColumns:"1fr 340px", gap:48, alignItems:"flex-start", paddingBottom:52 },
  heroTagRow:   { display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" },
  tagBlue:      { background:"rgba(30,58,138,.3)", border:"1px solid rgba(30,58,138,.6)", color:"#93c5fd", borderRadius:999, padding:"4px 14px", fontSize:".72rem", fontWeight:800, letterSpacing:".05em" },
  tagRed:       { background:"rgba(220,38,38,.25)", border:"1px solid rgba(220,38,38,.5)", color:"#fca5a5", borderRadius:999, padding:"4px 14px", fontSize:".72rem", fontWeight:800 },
  heroH1:       { fontFamily:FD, fontSize:"clamp(2rem,4.5vw,3.4rem)", color:"#fff", margin:"0 0 14px", fontWeight:400, lineHeight:1.1 },
  heroAccent:   { color:"#38bdf8", fontStyle:"italic" },
  heroDesc:     { color:"rgba(255,255,255,.75)", fontSize:"1rem", lineHeight:1.75, margin:"0 0 28px", maxWidth:520 },
  heroProofRow: { display:"flex", gap:16, flexWrap:"wrap" },
  heroPill:     { display:"flex", flexDirection:"column", alignItems:"center", gap:3, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.12)", borderRadius:12, padding:"12px 16px", minWidth:90 },
  heroFormCard: { background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:18, padding:"24px 20px", display:"flex", flexDirection:"column", gap:10 },
  heroCheckItem:{ display:"flex", alignItems:"center", gap:10 },
  heroCheckDot: { width:20, height:20, borderRadius:"50%", background:"rgba(16,185,129,.3)", color:"#6ee7b7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".7rem", fontWeight:800, flexShrink:0 },
  heroFdfpBadge:{ background:"rgba(251,191,36,.15)", border:"1px solid rgba(251,191,36,.3)", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:10, marginTop:6 },

  /* ÉTAPES */
  stepsSection: { padding:"64px 0", background:"#f8fafc" },
  stepsGrid:    { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:20 },
  stepCard:     { background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:"24px 18px", textAlign:"center", boxShadow:"0 2px 10px rgba(0,0,0,.05)", transition:"all .25s", cursor:"default" },
  stepNumBadge: { display:"inline-block", color:"#fff", borderRadius:999, padding:"3px 12px", fontSize:".72rem", fontWeight:800, marginBottom:12, letterSpacing:".05em" },
  stepIco:      { fontSize:"1.8rem", marginBottom:10, display:"block" },
  stepTitle:    { fontFamily:FD, fontSize:"1.05rem", margin:"0 0 8px", fontWeight:400, color:"#011451" },
  stepDesc:     { fontSize:".84rem", color:"#64748b", lineHeight:1.6, margin:0 },

  /* SECTION HEADER */
  sectionBadge: { display:"inline-block", background:"#fff0f2", color:"#ff2945", border:"1px solid #ffb3bc", borderRadius:999, padding:"4px 14px", fontSize:".72rem", fontWeight:800, letterSpacing:".07em", marginBottom:12 },
  sectionH2:    { fontFamily:FD, fontSize:"clamp(1.6rem,3vw,2.2rem)", fontWeight:400, margin:"0", color:"#011451" },

  /* MAIN */
  mainLayout:   { padding:"64px 0", background:"#fff" },
  twoCol:       { display:"grid", gridTemplateColumns:"1fr 1fr", gap:48, alignItems:"start" },
  benefCol:     {},
  benefGrid:    { display:"flex", flexDirection:"column", gap:14, marginTop:24 },
  benefCard:    { display:"flex", alignItems:"flex-start", gap:14, background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"16px 14px", transition:"all .22s", cursor:"default" },
  benefIco:     { fontSize:"1.4rem", flexShrink:0 },
  benefTitle:   { fontWeight:800, fontSize:".9rem", color:"#011451", margin:"0 0 4px" },
  benefDesc:    { fontSize:".82rem", color:"#64748b", lineHeight:1.55, margin:0 },
  clientsBlock: { marginTop:28, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:"16px" },
  clientsRow:   { display:"flex", flexWrap:"wrap", gap:8 },
  clientPill:   { background:"#fff", border:"1px solid #e2e8f0", borderRadius:999, padding:"5px 14px", fontSize:".8rem", fontWeight:700, color:"#475569" },

  /* FORMULAIRE CARD */
  formCard:     { background:"#fff", border:"1px solid #e2e8f0", borderRadius:20, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,.08)", transition:"all .6s ease" },
  progressWrap: { padding:"20px 28px 0" },
  progressTrack:{ height:6, background:"#f1f5f9", borderRadius:3, overflow:"hidden" },
  progressFill: { height:"100%", background:"linear-gradient(90deg,#0c33ac,#ff2945)", borderRadius:3, transition:"width .5s ease" },
  formCardHeader:{ padding:"16px 28px 0" },
  formCardTitle: { fontFamily:FD, fontSize:"1.2rem", margin:"0 0 4px", fontWeight:400, color:"#011451" },
  formCardSub:  { fontSize:".8rem", color:"#64748b", margin:0, marginBottom:16 },
  formBody:     { padding:"16px 28px 24px" },
  inp:          { width:"100%", padding:"10px 13px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:".9rem", fontFamily:FF, outline:"none", boxSizing:"border-box", color:"#011451", background:"#fff", transition:"border-color .2s, box-shadow .2s" },
  inpErr:       { borderColor:"#ff2945" },
  errTxt:       { fontSize:".73rem", color:"#ff2945", fontWeight:600, margin:"2px 0 0" },
  objGrid:      { display:"flex", flexWrap:"wrap", gap:8, marginTop:4 },
  objBtn:       { padding:"7px 14px", border:"1.5px solid #e2e8f0", borderRadius:999, background:"#fff", fontSize:".8rem", fontWeight:600, cursor:"pointer", color:"#475569", transition:"all .2s", fontFamily:FF },
  objBtnActive: { background:"#eef1ff", borderColor:"#0c33ac", color:"#0c33ac", fontWeight:800 },
  consentRow:   { display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" },
  formActions:  { display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:22, gap:12, flexWrap:"wrap" },

  /* RECAP */
  recapCard:    { background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:"16px" },
  recapTitle:   { fontSize:".84rem", fontWeight:800, color:"#011451", margin:"0 0 12px" },
  recapRow:     { display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f1f5f9", gap:12, flexWrap:"wrap" },
  recapKey:     { fontSize:".8rem", color:"#94a3b8", fontWeight:600 },
  recapVal:     { fontSize:".84rem", color:"#011451", fontWeight:600, textAlign:"right" },
  recapNote:    { background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"12px 14px", fontSize:".84rem", color:"#166534", fontWeight:500 },

  /* FAQ */
  faqSection:   { padding:"64px 0", background:"#f8fafc" },
  faqItem:      { border:"1.5px solid #e2e8f0", borderRadius:10, overflow:"hidden" },
  faqQ:         { width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", background:"none", border:"none", fontFamily:FF, fontSize:".92rem", fontWeight:600, color:"#011451", cursor:"pointer", textAlign:"left", gap:12 },
  faqA:         { padding:"0 18px 14px", fontSize:".9rem", color:"#475569", lineHeight:1.7, margin:0 },

  /* CTA */
  ctaBand:      { padding:"64px 0", background:"linear-gradient(135deg,#011451,#0c33ac 60%,#0891b2 100%)", position:"relative", overflow:"hidden" },
  ctaBandOrb:   { position:"absolute", width:280, height:280, borderRadius:"50%", background:"rgba(220,38,38,.12)", top:-80, right:120, pointerEvents:"none" },
  ctaBtnGold:   { background:"#f59e0b", color:"#000", border:"none", borderRadius:999, padding:"13px 28px", fontFamily:FF, fontWeight:800, fontSize:".96rem", cursor:"pointer", transition:"background .2s", whiteSpace:"nowrap", boxShadow:"0 4px 16px rgba(245,158,11,.4)" },
  ctaBtnGhost:  { background:"transparent", color:"rgba(255,255,255,.85)", border:"1.5px solid rgba(255,255,255,.35)", borderRadius:999, padding:"12px 24px", fontFamily:FF, fontWeight:700, fontSize:".9rem", cursor:"pointer", transition:"background .2s", whiteSpace:"nowrap" },

  /* BUTTONS */
  btnBlue:   { padding:"12px 28px", background:"#0c33ac", color:"#fff", border:"none", borderRadius:999, fontFamily:FF, fontWeight:800, fontSize:".94rem", cursor:"pointer", transition:"background .2s" },
  btnRed:    { padding:"12px 28px", background:"#ff2945", color:"#fff", border:"none", borderRadius:999, fontFamily:FF, fontWeight:800, fontSize:".94rem", cursor:"pointer", transition:"background .2s", display:"flex", alignItems:"center", gap:10 },
  btnOutline:{ padding:"11px 22px", background:"#fff", color:"#0c33ac", border:"1.5px solid #0c33ac", borderRadius:999, fontFamily:FF, fontWeight:700, fontSize:".88rem", cursor:"pointer" },
  btnBack:   { padding:"10px 20px", background:"none", color:"#64748b", border:"1.5px solid #e2e8f0", borderRadius:999, fontFamily:FF, fontWeight:600, fontSize:".88rem", cursor:"pointer" },
  spinner:   { width:16, height:16, border:"2.5px solid rgba(255,255,255,.35)", borderTopColor:"#fff", borderRadius:"50%", animation:"audSpin .8s linear infinite", display:"inline-block" },

  /* SUCCESS */
  successCard:  { background:"#fff", border:"1px solid #e2e8f0", borderRadius:20, padding:"40px 36px", maxWidth:540, width:"100%", boxShadow:"0 8px 32px rgba(0,0,0,.08)", textAlign:"center" },
  successH1:    { fontFamily:FD, fontSize:"1.8rem", margin:"0 0 12px", fontWeight:400 },
  successSub:   { fontSize:".95rem", color:"#475569", lineHeight:1.7, margin:"0 0 28px" },
  successSteps: { display:"flex", flexDirection:"column", gap:12, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:"18px", marginBottom:28, textAlign:"left" },
  successStep:  { display:"flex", alignItems:"flex-start", gap:12 },
  successStepIco:{ fontSize:"1.1rem", flexShrink:0 },
};

export default AuditGratuit;