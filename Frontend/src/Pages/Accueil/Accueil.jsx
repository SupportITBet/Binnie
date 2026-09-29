import React, { useEffect, useRef, useState, useCallback } from "react";
import Footer from "../Footer/Footer";
import CataloguePdfBanner from "../CataloguePdfBanner";
import { Link, useNavigate } from "react-router-dom";
import SEO from "../Components/SEO/SEO";
import BlogSection from "../Components/BlogSection/BlogSection";
import CoachesSection from "../Components/CoachesSection/CoachesSection";
import EquipeAdminSection from "../Components/EquipeAdminSection/EquipeAdminSection";
import { insertInscriptionAdulte } from "../../services/formsService";
import { supabase } from "../../config/supabase";

/* ═══════════════════════════════════════════════════════════
   ACCUEIL.JSX - BET · Conversion-First · Particuliers
   Philosophie : Hero → Profil → Programme → Paiement (2 clics)
═══════════════════════════════════════════════════════════ */

if (!document.querySelector("#bet-fonts")) {
  const link = document.createElement("link");
  link.id = "bet-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap";
  document.head.appendChild(link);
}

if (!document.querySelector("#bet-kf")) {
  const s = document.createElement("style");
  s.id = "bet-kf";
  s.textContent = `
    @keyframes fadeUp  { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
    @keyframes scaleIn { from{transform:scale(.95);opacity:0} to{transform:scale(1);opacity:1} }
    @keyframes spinSlow{ to{transform:rotate(360deg)} }
    @keyframes pulse   { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.4)} 60%{box-shadow:0 0 0 14px rgba(220,38,38,0)} }
    @keyframes ticker  { from{transform:translateX(0)} to{transform:translateX(-50%)} }
    @keyframes barFill { from{width:0} to{width:var(--w,100%)} }
    @keyframes floatUp { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
    @keyframes slideDown { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }

    .bet-btn-primary:hover { transform:translateY(-3px)!important; box-shadow:0 10px 30px rgba(220,38,38,.45)!important; }
    .bet-btn-secondary:hover { background:rgba(255,255,255,.15)!important; border-color:#fff!important; }
    .bet-card:hover { transform:translateY(-6px)!important; box-shadow:0 24px 56px rgba(0,0,0,.14)!important; }
    .bet-pill:hover { background:#ff2945!important; color:#fff!important; border-color:#ff2945!important; }
    .bet-play:hover .bet-play-icon { transform:scale(1.1)!important; }
    .bet-sticky-btn:hover { background:#b91c1c!important; transform:scale(1.02)!important; }
    .bet-enroll-direct:hover { background:#0c33ac!important; }
    
    @media (max-width:900px){
      .bet-hero-content{padding:0 20px!important;}
      .bet-programs-grid{grid-template-columns:1fr 1fr!important;}
      .bet-proof-strip{grid-template-columns:repeat(2,1fr)!important;}
    }
    @media (max-width:640px){
      .bet-hero-h1{font-size:2rem!important;}
      .bet-programs-grid{grid-template-columns:1fr!important;}
      .bet-hero-ctas{flex-direction:column!important;align-items:stretch!important;}
      .bet-profile-bar{flex-wrap:wrap!important;gap:8px!important;}
      .bet-proof-strip{grid-template-columns:repeat(2,1fr)!important;gap:12px!important;}
      .bet-payment-grid{grid-template-columns:1fr!important;}
      .bet-testi-row{grid-template-columns:1fr!important;}
      .bet-testi-alt-row{grid-template-columns:1fr!important;gap:28px!important;}

      /* ── Sticky bar mobile ── */
      .bet-sticky { padding:10px 14px!important; flex-wrap:nowrap!important; gap:10px!important; }
      .bet-sticky-form { display:none!important; }
      .bet-sticky-sub  { display:none!important; }
      .bet-sticky-icon { display:none!important; }
      .bet-sticky-ctas { gap:6px!important; }
      .bet-sticky-ctas a, .bet-sticky-ctas button {
        padding:8px 12px!important; font-size:.75rem!important;
      }
      .bet-sticky-text { font-size:.8rem!important; }
    }
    @media (max-width:400px){
      .bet-sticky-ctas-secondary { display:none!important; }
    }

    /* ── CARROUSEL D'ACCUEIL SUR PETIT ÉCRAN ──────────────────────────────────
       Le bandeau a une hauteur fixe (70vh, minimum 480px). Sur un écran étroit il
       devient donc haut ET étroit, alors que les visuels sont rarement dans ce
       format : « cover » agrandit l'image jusqu'à remplir la hauteur et rogne tout ce
       qui dépasse sur les côtés. Un visuel promotionnel y perdait la moitié de son
       texte — « ...s de cours », « ...er 2027 offert ».

       ON NE PARIE PAS SUR UN FORMAT. Les visuels sont déposés depuis le back-office
       et changent à chaque campagne : portrait, carré ou panoramique. « contain »
       affiche l'image ENTIÈRE quel que soit son format, au prix de fines bandes
       quand elle ne remplit pas exactement le cadre. Un cadre carré est le meilleur
       compromis pour un format inconnu : il réduit la bande la plus large, qu'on
       reçoive une affiche verticale ou une bannière horizontale.

       Les bandes prennent le bleu BET plutôt que le noir du navigateur, pour qu'elles
       se lisent comme une bordure et non comme une image qui n'a pas chargé. */
    @media (max-width:768px){
      .bet-hero {
        height:auto!important; min-height:280px!important; max-height:78vh!important;
        aspect-ratio:1/1;
      }
      .bet-hero-slide {
        background-size:contain!important; background-repeat:no-repeat!important;
        background-color:#0a1128!important;
      }
      /* Même rognage sur les slides vidéo, même correctif. */
      .bet-hero-video { object-fit:contain!important; background:#0a1128!important; }
    }
  `;
  document.head.appendChild(s);
}

/* ── Hooks ────────────────────────────────────────────── */
function useInView(threshold = 0.18) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true); }, { threshold });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, [threshold]);
  return [ref, v];
}

function useCounter(target, dur = 1800, active = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start = null;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setVal(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [active, target, dur]);
  return val;
}

/* ─────────────────────────────────────────────────────────
   PROGRAMMES DATA
───────────────────────────────────────────────────────── */
/* ── Fallback (utilisé si Supabase n'a pas encore de config) ── */
const PROGRAMS_FALLBACK = [
  {
    id: 1, title: "TOEIC", sub: "Score 700+ garanti", level: "B1 → C1",
    duration: "6 semaines", price: 390000, priceLabel: "390 000 FCFA",
    rating: 4.9, students: 1240, spots: 4,
    img: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80",
    tag: "BESTSELLER", tagColor: "#d97706", tagBg: "#fef3c7", color: "#d97706",
    desc: "La certification la plus demandée par les recruteurs ivoiriens et internationaux.",
    features: ["15 tests blancs chronométrés", "Score garanti 700+", "Coach personnel dédié", "Vocabulaire Business intensif"],
    highlight: "98% de réussite", profiles: ["particulier", "professionnel"], certId: "toeic",
  },
  {
    id: 2, title: "TOEFL iBT", sub: "Accès université mondiale", level: "B2 → C2",
    duration: "8 semaines", price: 450000, priceLabel: "450 000 FCFA",
    rating: 4.8, students: 980, spots: 6,
    img: "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?auto=format&fit=crop&w=600&q=80",
    tag: "TOP NOTÉ", tagColor: "#0891b2", tagBg: "#e0f2fe", color: "#0891b2",
    desc: "Ouvrez les portes des meilleures universités anglophones du monde.",
    features: ["4 compétences Reading/Listening/Speaking/Writing", "200+ exercices accès illimité", "Correction personnalisée", "Coaching Speaking individuel"],
    highlight: "Score 100+ iBT", profiles: ["étudiant", "particulier"], certId: "toefl",
  },
  {
    id: 3, title: "IELTS Academic", sub: "Band 7.0 garanti", level: "B2 → C2",
    duration: "10 semaines", price: 520000, priceLabel: "520 000 FCFA",
    rating: 4.9, students: 870, spots: 3,
    img: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80",
    tag: "COMPLET", tagColor: "#7c3aed", tagBg: "#f3e8ff", color: "#7c3aed",
    desc: "Le passeport pour étudier, travailler ou s'installer dans un pays anglophone.",
    features: ["Academic + General Training", "Tuteur natif anglophone", "Band 7.0 garanti ou remboursé", "Corrections individuelles illimitées"],
    highlight: "Émigration & universités", profiles: ["étudiant", "particulier", "professionnel"], certId: "ielts",
  },
  {
    id: 4, title: "Anglais Pro", sub: "Dès 35 000 FCFA/mois", level: "A2 → B2",
    duration: "Flexible", price: 35000, priceLabel: "À partir de 35 000 FCFA",
    rating: 4.7, students: 2100, spots: 12,
    img: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80",
    tag: "POPULAIRE", tagColor: "#ff2945", tagBg: "#fff0f2", color: "#ff2945",
    desc: "Entretiens, présentations, négociations - parlez enfin l'anglais des affaires.",
    features: ["Planning 100% flexible", "Mise en situation réelle", "Certification BET officielle", "Financement FDFP possible"],
    highlight: "Pour tous niveaux", profiles: ["particulier", "professionnel"], to: "/cours/en-ligne",
  },
];

const CERT_META = {
  toeic: { tag:"BESTSELLER", tagBg:"#fef3c7", tagColor:"#d97706", color:"#d97706", img:"https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=600&q=80", highlight:"98% de réussite", sub:"Score 700+ garanti", profiles:["particulier","professionnel"], certId:"toeic" },
  toefl: { tag:"TOP NOTÉ",   tagBg:"#e0f2fe", tagColor:"#0891b2", color:"#0891b2", img:"https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?auto=format&fit=crop&w=600&q=80", highlight:"Score 100+ iBT",       sub:"Accès université mondiale", profiles:["étudiant","particulier"],                  certId:"toefl" },
  ielts: { tag:"COMPLET",    tagBg:"#f3e8ff", tagColor:"#7c3aed", color:"#7c3aed", img:"https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80", highlight:"Émigration & universités", sub:"Band 7.0 garanti",      profiles:["étudiant","particulier","professionnel"], certId:"ielts" },
};

function parsePrix(str) { return parseInt((str||"").replace(/\s/g,"").replace(/[^\d]/g,""), 10) || 0; }

// `counts` = { [id]: nb d'inscriptions réelles actives } depuis GET /api/inscriptions/places-restantes.
// Places restantes réelles = capacite_max (défini par l'admin sur l'offre) - inscriptions réelles.
// Si aucune capacite_max n'est configurée pour une offre, on retombe sur un défaut raisonnable
// plutôt que d'afficher 0 partout tant que l'admin n'a pas rempli ce champ.
function placesRestantes(capaciteMax, id, counts, defaut) {
  const cap = parseInt(capaciteMax, 10);
  if (!cap || cap <= 0) return defaut;
  const pris = (counts && counts[id]) || 0;
  return Math.max(0, cap - pris);
}

function buildDynamicPrograms(certifCfg, offresEnLigne, offresDomicile, counts) {
  const list = [];

  // ── Certifications depuis Supabase ──
  if (certifCfg) {
    ["toeic","toefl","ielts"].forEach(key => {
      const c = certifCfg[key]; if (!c || c.actif === false) return;
      const m = CERT_META[key];
      list.push({
        id: key, ...m,
        title: c.name || key.toUpperCase(),
        level: c.level || m.profiles[0],
        duration: c.duration || "",
        price: parsePrix(c.price),
        priceLabel: c.price || "Sur devis",
        rating: c.rating || 4.9,
        students: c.students || 1240,
        spots: placesRestantes(c.capacite_max, key, counts, 4),
        img: c.heroImage || m.img,
        desc: c.tagline || c.description || "",
        features: (c.whatYouLearn || []).slice(0, 4),
      });
    });
  }

  // ── Cours en ligne ──
  const enLigne = (offresEnLigne||[]).filter(o => o.actif !== false);
  if (enLigne.length) {
    const f = enLigne[0];
    list.push({
      id: "cours_ligne", to:"/cours/en-ligne",
      title: "Cours en ligne", sub: f.prix ? `Dès ${f.prix}` : "Formation à distance",
      level: "Tous niveaux", duration: f.duration || "Flexible",
      price: parsePrix(f.prix), priceLabel: f.prix ? `Dès ${f.prix}` : "Sur devis",
      rating: 4.7, students: 2100, spots: placesRestantes(f.capacite_max, "cours_ligne", counts, 12),
      img: f.img || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80",
      tag: "POPULAIRE", tagColor: "#ff2945", tagBg: "#fff0f2", color: "#ff2945",
      desc: f.desc || "Apprenez depuis chez vous avec nos formateurs certifiés. Classes en direct + replay.",
      features: enLigne.slice(0,4).map(o => `${o.label}${o.prix?" - "+o.prix:""}`),
      highlight: "Pour tous niveaux", profiles: ["particulier","professionnel"],
    });
  }

  // ── Cours en cabinet ── (pas de config catalogue dédiée pour l'instant - spots fixe)
  list.push({
    id: "cours_cabinet", to: "/cours/cabinet",
    title: "Cours en cabinet", sub: "En centre · Petits groupes",
    level: "Tous niveaux", duration: "Flexible",
    price: 0, priceLabel: "Voir les offres",
    rating: 4.8, students: 3000, spots: 6,
    img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80",
    tag: "RECOMMANDÉ", tagColor: "#0891b2", tagBg: "#e0f2fe", color: "#0891b2",
    desc: "Apprenez dans nos centres avec des formateurs certifiés. Petits groupes pour un suivi personnalisé.",
    features: ["Petits groupes (max 8 élèves)", "Formateurs certifiés", "Matériel pédagogique inclus", "Accès bibliothèque & labo langues"],
    highlight: "Le + populaire", profiles: ["particulier", "étudiant", "professionnel"],
  });

  // ── Cours à domicile ──
  const domicile = (offresDomicile||[]).filter(o => o.actif !== false);
  if (domicile.length) {
    const f = domicile[0];
    list.push({
      id: "cours_domicile", to:"/cours/domicile",
      title: "Cours à domicile", sub: f.prix ? `Dès ${f.prix}` : "Chez vous",
      level: "Tous niveaux", duration: f.duration || "Flexible",
      price: parsePrix(f.prix), priceLabel: f.prix ? `Dès ${f.prix}` : "Sur devis",
      rating: 4.8, students: 1800, spots: placesRestantes(f.capacite_max, "cours_domicile", counts, 8),
      img: f.img || "https://images.unsplash.com/photo-1560523159-4a9692d222ef?auto=format&fit=crop&w=600&q=80",
      tag: "PREMIUM", tagColor: "#059669", tagBg: "#f0fdf4", color: "#059669",
      desc: f.desc || "Le formateur se déplace chez vous. Programme adapté à votre rythme et objectifs.",
      features: domicile.slice(0,4).map(o => `${o.label}${o.prix?" - "+o.prix:""}`),
      highlight: "100% personnalisé", profiles: ["particulier","professionnel"],
    });
  }

  return list.length ? list : PROGRAMS_FALLBACK;
}

const PROFILES = [
  { id: "tous", label: "Tous les profils", emoji: "🌟" },
  { id: "particulier", label: "Particulier", emoji: "👤" },
  { id: "étudiant", label: "Étudiant", emoji: "🎓" },
  { id: "professionnel", label: "Professionnel", emoji: "💼" },
];

/* ─────────────────────────────────────────────────────────
   PAYMENT MODAL (streamlined - 1 seul modal)
───────────────────────────────────────────────────────── */
const PaymentModal = ({ program, onClose }) => {
  const [step, setStep] = useState(1); // 1=infos, 2=paiement, 3=succès
  const [data, setData] = useState({ nom: "", email: "", tel: "", numero: "", consent: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");

  // Pré-remplir depuis la session connectée
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const u    = session.user;
      const meta = u.user_metadata || {};
      const nom  = (meta.prenom && meta.nom)
        ? `${meta.prenom} ${meta.nom}`
        : meta.full_name || u.email?.split("@")[0] || "";
      setData(p => ({
        ...p,
        nom:   p.nom   || nom,
        email: p.email || u.email || "",
        tel:   p.tel   || meta.telephone || "",
      }));
    });
  }, []);

  const upd = (k, v) => {
    setData(p => ({ ...p, [k]: v }));
    setFieldErrors(e => ({ ...e, [k]: "" }));
  };

  const goStep2 = () => {
    const errors = {};
    if (!data.nom.trim())   errors.nom   = "Requis";
    if (!data.email.trim()) errors.email = "Requis";
    if (!data.tel.trim())   errors.tel   = "Requis";
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setStep(2);
  };

  const confirm = async () => {
    if (!data.numero) { setErreur("Entrez votre numéro Mobile Money."); return; }
    if (!data.consent) { setErreur("Acceptez les conditions pour continuer."); return; }
    setErreur("");
    setLoading(true);
    setErreur("");
    try {
      await insertInscriptionAdulte({
        nom_complet: data.nom,
        email: data.email,
        telephone: data.tel,
        offre_titre: program.title,
        offre_id: String(program.id),
        mode_paiement: `Mobile Money - ${data.numero}`,
        statut: "nouveau",
      });
      setStep(3);
    } catch (e) {
      setErreur("Une erreur est survenue. Veuillez réessayer ou nous contacter.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay-mq" style={PS.overlay} onClick={onClose}>
      <div style={PS.modal} onClick={e => e.stopPropagation()}>
        <button style={PS.close} onClick={onClose}>✕</button>

        {/* Header programme */}
        <div style={PS.header}>
          <div style={PS.headerLeft}>
            <span style={{ ...PS.tag, background: program.tagColor + "33", color: program.tagColor }}>{program.tag}</span>
            <h2 style={PS.headerTitle}>{program.title}</h2>
            <p style={PS.headerSub}>{program.sub}</p>
          </div>
          <div style={PS.headerPrice}>
            <div style={PS.price}>{program.priceLabel}</div>
            <div style={PS.priceNote}>par personne · accès complet</div>
            {program.spots != null && (
              <div style={PS.urgency}>🔥 {program.spots} places restantes</div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div style={PS.steps}>
          {[{ n: 1, l: "Vos infos" }, { n: 2, l: "Paiement" }, { n: 3, l: "Confirmé !" }].map(s => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ ...PS.stepDot, background: step >= s.n ? "#ff2945" : "#e2e8f0", color: step >= s.n ? "#fff" : "#94a3b8" }}>{step > s.n ? "✓" : s.n}</div>
              <span style={{ fontSize: ".78rem", fontWeight: 700, color: step >= s.n ? "#011451" : "#94a3b8" }}>{s.l}</span>
              {s.n < 3 && <div style={{ width: 32, height: 2, background: step > s.n ? "#ff2945" : "#e2e8f0", borderRadius: 2 }} />}
            </div>
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={PS.body}>
            <p style={PS.bodyTitle}>Vos informations</p>
            {(data.nom || data.email || data.tel) && (
              <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:".78rem", color:"#166534", fontWeight:600 }}>
                <span>✓</span> Pré-rempli depuis votre compte - vérifiez et modifiez si besoin.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="bet-payment-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={PS.label}>Nom complet *</label>
                  <input style={{ ...PS.input, borderColor: fieldErrors.nom ? "#ff2945" : "#e2e8f0" }} value={data.nom} onChange={e => upd("nom", e.target.value)} placeholder="Jean Kouamé" />
                  {fieldErrors.nom && <p style={PS.ferr}>{fieldErrors.nom}</p>}
                </div>
                <div>
                  <label style={PS.label}>Email *</label>
                  <input style={{ ...PS.input, borderColor: fieldErrors.email ? "#ff2945" : "#e2e8f0" }} type="email" value={data.email} onChange={e => upd("email", e.target.value)} placeholder="jean@exemple.com" />
                  {fieldErrors.email && <p style={PS.ferr}>{fieldErrors.email}</p>}
                </div>
              </div>
              <div>
                <label style={PS.label}>Téléphone *</label>
                <input style={{ ...PS.input, borderColor: fieldErrors.tel ? "#ff2945" : "#e2e8f0" }} type="tel" value={data.tel} onChange={e => upd("tel", e.target.value)} placeholder="+225 07 00 00 00 00" />
                {fieldErrors.tel && <p style={PS.ferr}>{fieldErrors.tel}</p>}
              </div>
              {/* Features incluses */}
              <div style={PS.featBox}>
                <p style={{ fontSize: ".78rem", fontWeight: 800, color: "#011451", margin: "0 0 8px" }}>Ce programme comprend :</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {program.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, fontSize: ".76rem", color: "#334155" }}>
                      <span style={{ color: "#10b981", fontWeight: 800 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
              </div>
              <button style={PS.btnNext} onClick={goStep2}>Continuer vers le paiement →</button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={PS.body}>
            <p style={PS.bodyTitle}>Vos informations de paiement</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={PS.label}>Numéro Mobile Money (Orange · MTN · Moov · Wave) *</label>
                <input style={PS.input} type="tel" value={data.numero} onChange={e => upd("numero", e.target.value)} placeholder="07 00 00 00 00" />
                <p style={{ fontSize: ".72rem", color: "#64748b", marginTop: 4 }}>Une demande de paiement vous sera envoyée sur ce numéro.</p>
              </div>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginTop: 16 }}>
              <input type="checkbox" checked={data.consent} onChange={e => upd("consent", e.target.checked)} style={{ accentColor: "#ff2945", marginTop: 3, flexShrink: 0 }} />
              <span style={{ fontSize: ".78rem", color: "#64748b", lineHeight: 1.5 }}>J'accepte les conditions générales et l'utilisation de mes données pour la gestion de mon inscription.</span>
            </label>

            {erreur && (
              <p style={{ color: "#ff2945", fontSize: ".82rem", marginTop: 12, textAlign: "center" }}>{erreur}</p>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button style={PS.btnBack} onClick={() => setStep(1)}>← Retour</button>
              <button style={{ ...PS.btnNext, flex: 1 }} onClick={confirm} disabled={loading}>
                {loading
                  ? <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}><span style={PS.spinner} /> Traitement...</span>
                  : `🔒 Confirmer - ${program.priceLabel}`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div style={{ textAlign: "center", padding: "40px 32px" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: 12, animation: "floatUp 2s ease infinite" }}>🎉</div>
            <h3 style={{ fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "1.6rem", margin: "0 0 8px", color: "#011451" }}>Inscription confirmée !</h3>
            <p style={{ color: "#475569", lineHeight: 1.7, marginBottom: 8 }}>
              Un email a été envoyé à <strong>{data.email}</strong>.
            </p>
            <p style={{ color: "#475569", lineHeight: 1.7, marginBottom: 28, fontSize: ".92rem" }}>
              Notre équipe vous contacte sous <strong>24h</strong> pour valider votre place et vous donner accès à votre espace apprenant.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {["✓ Certification officielle agréée", "✓ Remboursement 30j", "✓ Accès immédiat à la plateforme"].map((t, i) => (
                <span key={i} style={{ fontSize: ".75rem", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 999, padding: "4px 12px", fontWeight: 700 }}>{t}</span>
              ))}
            </div>
            <button style={{ ...PS.btnNext, marginTop: 28, maxWidth: 200, margin: "28px auto 0" }} onClick={onClose}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
};

const PS = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(8px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "fadeIn .2s ease" },
  modal: { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto", animation: "scaleIn .25s ease", boxShadow: "0 40px 100px rgba(0,0,0,.3)", position: "relative" },
  close: { position: "absolute", top: 12, right: 12, zIndex: 10, background: "rgba(0,0,0,.15)", border: "none", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: ".85rem", color: "#011451", display: "flex", alignItems: "center", justifyContent: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "24px 24px 0", gap: 16, flexWrap: "wrap" },
  headerLeft: { flex: 1 },
  headerPrice: { textAlign: "right" },
  tag: { display: "inline-block", fontSize: ".65rem", fontWeight: 800, letterSpacing: ".06em", borderRadius: 999, padding: "3px 10px", marginBottom: 6 },
  headerTitle: { fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "1.8rem", margin: "0 0 4px", fontWeight: 400, color: "#011451" },
  headerSub: { fontSize: ".88rem", color: "#64748b", margin: 0 },
  price: { fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "1.4rem", color: "#011451", fontWeight: 400 },
  priceNote: { fontSize: ".72rem", color: "#94a3b8", marginTop: 2 },
  urgency: { fontSize: ".75rem", background: "#fef3c7", color: "#d97706", borderRadius: 999, padding: "3px 10px", fontWeight: 700, marginTop: 6, display: "inline-block" },
  steps: { display: "flex", alignItems: "center", gap: 6, padding: "20px 24px 0", flexWrap: "wrap" },
  stepDot: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem", fontWeight: 800, flexShrink: 0 },
  body: { padding: "20px 24px 28px" },
  bodyTitle: { fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "1.1rem", color: "#011451", margin: "0 0 16px", fontWeight: 400 },
  label: { display: "block", fontSize: ".76rem", fontWeight: 700, color: "#011451", marginBottom: 5 },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: ".9rem", fontFamily: "'Montserrat', 'Segoe UI', sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color .2s" },
  featBox: { background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" },
  btnNext: { background: "linear-gradient(135deg,#ff2945,#0c33ac)", color: "#fff", border: "none", borderRadius: 999, padding: "13px 24px", fontWeight: 800, fontSize: ".95rem", cursor: "pointer", width: "100%", fontFamily: "'Montserrat', 'Segoe UI', sans-serif", transition: "opacity .2s" },
  btnBack: { background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 999, padding: "13px 20px", fontWeight: 700, fontSize: ".88rem", cursor: "pointer", fontFamily: "'Montserrat', 'Segoe UI', sans-serif" },
  methodBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "14px", border: "2px solid #e2e8f0", borderRadius: 12, background: "#fff", cursor: "pointer", transition: "all .2s" },
  methodBtnActive: { border: "2px solid #0c33ac", background: "#eef1ff" },
  spinner: { width: 16, height: 16, border: "2.5px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "spinSlow .8s linear infinite", display: "inline-block" },
  ferr: { color: "#ff2945", fontSize: ".72rem", margin: "4px 0 0" },
};

/* ─────────────────────────────────────────────────────────
   1. HERO SECTION
───────────────────────────────────────────────────────── */
/**
 * Flèche de navigation du carrousel, posée à l'une des extrémités de l'image.
 *
 * Remplace les points, qui indiquaient la position sans permettre d'avancer : sur un
 * carrousel, le geste attendu est de cliquer sur le côté pour passer à la suite.
 *
 * La cible fait 44 px - le minimum confortable au doigt. Sur un écran étroit, les flèches
 * se rapprochent du bord pour ne pas recouvrir le sujet de la photo.
 */
const FlecheCarrousel = ({ cote, onClick }) => {
  const [hov, setHov] = React.useState(false);
  const gauche = cote === "gauche";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      aria-label={gauche ? "Image précédente" : "Image suivante"}
      style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        [gauche ? "left" : "right"]: "clamp(8px, 2vw, 22px)",
        zIndex: 12,
        width: 44, height: 44, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hov ? "rgba(255,255,255,.95)" : "rgba(10,17,40,.42)",
        color: hov ? "#0a1128" : "#fff",
        border: "1.5px solid rgba(255,255,255,.55)",
        cursor: "pointer", backdropFilter: "blur(6px)",
        transition: "background .2s, color .2s, transform .2s",
        boxShadow: hov ? "0 6px 18px rgba(0,0,0,.28)" : "none",
        lineHeight: 0, padding: 0,
      }}
    >
      {/* Un SVG plutôt qu'un caractère « ‹ » : le rendu d'un chevron typographique
          varie d'une police à l'autre, et se décale verticalement. */}
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        style={{ transform: gauche ? "translateX(-1px)" : "translateX(1px)" }}>
        <path d={gauche ? "M15 5 L8 12 L15 19" : "M9 5 L16 12 L9 19"}
          stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
};

const HERO_FALLBACK_SLIDES = [
  { id:"f1", type:"image", url:"https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1600&q=80", titre:"", description:"", link_url:"", link_label:"" },
  { id:"f2", type:"image", url:"https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1600&q=80", titre:"", description:"", link_url:"", link_label:"" },
  { id:"f3", type:"image", url:"https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80", titre:"", description:"", link_url:"", link_label:"" },
];

/* ── Helpers vidéo ──────────────────────────────────────── */
function detectVideoType(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/vimeo\.com/i.test(url))             return "vimeo";
  return "native";
}

function extractYoutubeId(url) {
  // youtu.be/ID  ou  youtu.be/ID?si=...
  const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return short[1];
  // youtube.com/watch?v=ID
  const watch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watch) return watch[1];
  // youtube.com/embed/ID
  const embed = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embed) return embed[1];
  // youtube.com/shorts/ID
  const shorts = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shorts) return shorts[1];
  return null;
}

function buildEmbedUrl(url, muted) {
  const type = detectVideoType(url);
  if (type === "youtube") {
    const id = extractYoutubeId(url);
    if (!id) return url; // URL embed déjà formatée ou format inconnu
    const u = new URL(`https://www.youtube.com/embed/${id}`);
    u.searchParams.set("autoplay",       "1");
    u.searchParams.set("mute",           muted ? "1" : "0");
    u.searchParams.set("enablejsapi",    "1");
    u.searchParams.set("controls",       "0");
    u.searchParams.set("rel",            "0");
    u.searchParams.set("modestbranding", "1");
    return u.toString();
  }
  if (type === "vimeo") {
    // Extraire l'ID Vimeo (suite de chiffres)
    const vimeoId = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    const base = vimeoId
      ? `https://player.vimeo.com/video/${vimeoId}`
      : (url.includes("player.vimeo") ? url : url.replace("vimeo.com/", "player.vimeo.com/video/"));
    const u = new URL(base);
    u.searchParams.set("autoplay", "1");
    u.searchParams.set("muted",    muted ? "1" : "0");
    u.searchParams.set("api",      "1");
    u.searchParams.set("controls", "0");
    return u.toString();
  }
  return url; // native MP4/WebM : pas de paramètre
}

const HeroSection = () => {
  const [slideIdx, setSlideIdx]   = useState(0);
  const [slides,   setSlides]     = useState(HERO_FALLBACK_SLIDES);
  const [paused,      setPaused]      = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [muted,       setMuted]       = useState(true);
  const iframeRefs = useRef({});  // { [slide.id]: iframeElement }
  const videoRefs  = useRef({});  // { [slide.id]: videoElement }

  useEffect(() => {
    const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
    fetch(`${API}/api/carousel/publiques`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.slides?.length > 0) setSlides(d.slides); })
      .catch(() => {});
  }, []);

  const nextSlide = useCallback(() => {
    setSlideIdx(p => (p + 1) % slides.length);
    setVideoPaused(false);
  }, [slides.length]);

  // Le modulo sur un nombre négatif renvoie un négatif en JavaScript : on ajoute la
  // longueur avant, sinon reculer depuis la première slide sortirait du tableau.
  const prevSlide = useCallback(() => {
    setSlideIdx(p => (p - 1 + slides.length) % slides.length);
    setVideoPaused(false);
  }, [slides.length]);

  // Avance automatique - suspendu sur les slides vidéo (la vidéo déclenche nextSlide elle-même)
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const current = slides[slideIdx];
    if (current?.type === "video") return; // la vidéo gère sa propre fin
    // Durée propre à chaque image, réglée dans la configuration. Les bornes répètent
    // celles du serveur : une valeur aberrante arrivée d'ailleurs ne doit pas figer
    // le carrousel ni le faire clignoter.
    const secondes = Math.min(30, Math.max(2, Number(current?.duree) || 5));
    const t = setTimeout(nextSlide, secondes * 1000);
    return () => clearTimeout(t);
  }, [slides, slideIdx, paused, nextSlide]);

  // Écoute la fin des vidéos YouTube / Vimeo via postMessage
  useEffect(() => {
    const onMessage = (e) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        // YouTube : playerState 0 = ended
        if (data?.event === "infoDelivery" && data?.info?.playerState === 0) nextSlide();
        // Vimeo : event finish
        if (data?.event === "finish") nextSlide();
      } catch {}
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [nextSlide]);

  // Après une action manuelle, on suspend l'avance automatique : sans cela, la slide
  // choisie serait remplacée au bout de quelques secondes, juste le temps de commencer
  // à la lire.
  const relancerPause = () => { setPaused(true); setTimeout(() => setPaused(false), 12000); };
  const current = slides[slideIdx] || slides[0];
  const isCurrentVideo = current?.type === "video";

  /* ── Commandes vidéo ─────────────────────────────────── */
  const sendYT = (iframe, func, args = "") => {
    try { iframe.contentWindow.postMessage(JSON.stringify({ event:"command", func, args }), "*"); } catch {}
  };
  const sendVimeo = (iframe, method, value) => {
    try { iframe.contentWindow.postMessage(JSON.stringify({ method, value }), "*"); } catch {}
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    const id = current?.id;
    const type = detectVideoType(current?.url || "");
    if (type === "native") {
      const v = videoRefs.current[id];
      if (v) v.muted = next;
    } else if (type === "youtube") {
      const f = iframeRefs.current[id];
      if (f) sendYT(f, next ? "muteVideo" : "unMuteVideo");
    } else if (type === "vimeo") {
      const f = iframeRefs.current[id];
      if (f) sendVimeo(f, "setVolume", next ? 0 : 1);
    }
  };

  // Distingue une pause voulue (bouton) d'une pause automatique au scroll - seule la première
  // doit empêcher la reprise automatique quand le hero revient dans le champ de vision.
  const manualPauseRef = useRef(false);

  const togglePlayPause = () => {
    const next = !videoPaused;
    manualPauseRef.current = next;
    setVideoPaused(next);
    const id = current?.id;
    const type = detectVideoType(current?.url || "");
    if (type === "native") {
      const v = videoRefs.current[id];
      if (v) { next ? v.pause() : v.play().catch(() => {}); }
    } else if (type === "youtube") {
      const f = iframeRefs.current[id];
      if (f) sendYT(f, next ? "pauseVideo" : "playVideo");
    } else if (type === "vimeo") {
      const f = iframeRefs.current[id];
      if (f) sendVimeo(f, next ? "pause" : "play");
    }
  };

  // Coupe la vidéo du hero dès qu'on scrolle en dessous (elle continuerait de jouer/boucler
  // hors champ sinon) - reprend seule au retour en haut de page, sauf pause manuelle.
  const heroRef = useRef(null);
  useEffect(() => {
    if (!heroRef.current || !isCurrentVideo) return;
    const id = current?.id;
    const type = detectVideoType(current?.url || "");
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (manualPauseRef.current) return;
        if (type === "native") videoRefs.current[id]?.play().catch(() => {});
        else if (type === "youtube") { const f = iframeRefs.current[id]; if (f) sendYT(f, "playVideo"); }
        else if (type === "vimeo") { const f = iframeRefs.current[id]; if (f) sendVimeo(f, "play"); }
        setVideoPaused(false);
      } else {
        if (type === "native") videoRefs.current[id]?.pause();
        else if (type === "youtube") { const f = iframeRefs.current[id]; if (f) sendYT(f, "pauseVideo"); }
        else if (type === "vimeo") { const f = iframeRefs.current[id]; if (f) sendVimeo(f, "pause"); }
        setVideoPaused(true);
      }
    }, { threshold: 0.2 });
    o.observe(heroRef.current);
    return () => o.disconnect();
  }, [current?.id, isCurrentVideo]);

  const replay = () => {
    setVideoPaused(false);
    const id = current?.id;
    const type = detectVideoType(current?.url || "");
    if (type === "native") {
      const v = videoRefs.current[id];
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    } else if (type === "youtube") {
      const f = iframeRefs.current[id];
      if (f) { sendYT(f, "seekTo", [0, true]); sendYT(f, "playVideo"); }
    } else if (type === "vimeo") {
      const f = iframeRefs.current[id];
      if (f) { sendVimeo(f, "setCurrentTime", 0); sendVimeo(f, "play"); }
    }
  };

  return (
  <>
    <section ref={heroRef} className="bet-hero" style={HS.hero}>
      {/* Slides : images toujours dans le DOM (crossfade), vidéos seulement quand actives */}
      {slides.map((slide, i) => {
        if (slide.type === "video") {
          /* Vidéo inactive → div vide noire, pas de lecture en arrière-plan */
          if (i !== slideIdx) return <div key={slide.id} className="bet-hero-slide" style={{ ...HS.bg, background:"#000", opacity:0 }} />;
          return (
            <div key={slide.id} className="bet-hero-slide" style={{ ...HS.bg, opacity:1, background:"#000" }}>
              {detectVideoType(slide.url) === "native"
                ? <video
                    ref={el => { videoRefs.current[slide.id] = el; }}
                    src={slide.url}
                    autoPlay muted={muted} playsInline
                    onEnded={nextSlide}
                    className="bet-hero-video"
                    style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", border:"none" }}
                  />
                : <iframe
                    ref={el => { iframeRefs.current[slide.id] = el; }}
                    src={buildEmbedUrl(slide.url, muted)}
                    title={slide.titre || "slide video"}
                    allow="autoplay; fullscreen"
                    style={{ position:"absolute", inset:0, width:"100%", height:"100%", border:"none", pointerEvents:"none" }}
                  />
              }
            </div>
          );
        }
        return <div key={slide.id} className="bet-hero-slide" style={{ ...HS.bg, backgroundImage:`url(${slide.url})`, opacity: i === slideIdx ? 1 : 0 }} />;
      })}


      {/* Flèches de navigation, aux extrémités de l'image. `zIndex` au-dessus du
          dégradé bas, sinon elles seraient couvertes au niveau de la légende. */}
      {slides.length > 1 && (
        <>
          <FlecheCarrousel cote="gauche" onClick={() => { prevSlide(); relancerPause(); }} />
          <FlecheCarrousel cote="droite" onClick={() => { nextSlide(); relancerPause(); }} />
        </>
      )}

      {/* Gradient bas + légende + compteur */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:10, background:"linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.2) 60%, transparent 100%)", padding:"80px 48px 32px" }}>
        <div key={slideIdx} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap:20 }}>
          <div style={{ flex:1, minWidth:0 }}>
            {current?.titre ? (
              <p style={{ margin:"0 0 6px", color:"#fff", fontWeight:800, fontSize:"clamp(1.1rem,2.8vw,1.8rem)", lineHeight:1.25, textShadow:"0 2px 12px rgba(0,0,0,.7)", animation:"fadeUp .45s ease both" }}>
                {current.titre}
              </p>
            ) : null}
            {current?.description ? (
              <p style={{ margin:0, color:"rgba(255,255,255,.85)", fontWeight:500, fontSize:"clamp(.82rem,1.5vw,.95rem)", lineHeight:1.6, textShadow:"0 1px 6px rgba(0,0,0,.5)", animation:"fadeUp .45s ease .12s both" }}>
                {current.description}
              </p>
            ) : null}
            {current?.link_url ? (
              <a href={current.link_url}
                style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:12, background:"#ff2945", color:"#fff", borderRadius:999, padding:"10px 22px", fontWeight:800, fontSize:".88rem", textDecoration:"none", boxShadow:"0 4px 18px rgba(220,38,38,.55)", animation:"fadeUp .45s ease .22s both" }}>
                {current.link_label || "En savoir plus →"}
              </a>
            ) : null}
          </div>
          {/* Les points ne disaient que la position. Les flèches, aux extrémités de
              l'image, permettent en plus de naviguer - c'est le geste attendu sur un
              carrousel. Il ne reste ici qu'un compteur, qui garde le repère. */}
          {slides.length > 1 && (
            <div style={{ flexShrink:0, alignSelf:"flex-end", color:"rgba(255,255,255,.8)",
              fontSize:".82rem", fontWeight:700, letterSpacing:".04em", fontVariantNumeric:"tabular-nums" }}>
              {slideIdx + 1} / {slides.length}
            </div>
          )}
        </div>
      </div>

      {/* Wave de transition vers la section suivante */}
      <div style={HS.wave}>
        <svg viewBox="0 0 1440 64" style={{ display:"block", width:"100%" }} preserveAspectRatio="none">
          <path fill="#fff" d="M0,32 C480,64 960,0 1440,32 L1440,64 L0,64 Z" />
        </svg>
      </div>
    </section>

    {/* ── Barre de contrôle vidéo - visible uniquement sur une slide vidéo ── */}
    {isCurrentVideo && (
      <div style={{ background:"#0a1128", padding:"14px 32px", display:"flex", justifyContent:"center", alignItems:"center", gap:12, flexWrap:"wrap", borderBottom:"1.5px solid rgba(255,255,255,.06)" }}>
        <button onClick={togglePlayPause}
          style={{ display:"flex", alignItems:"center", gap:8, background:"#0c33ac", color:"#fff", border:"none", borderRadius:10, padding:"11px 28px", fontSize:".95rem", fontWeight:800, cursor:"pointer", letterSpacing:".02em" }}
          onMouseEnter={e=>e.currentTarget.style.background="#0a28a0"}
          onMouseLeave={e=>e.currentTarget.style.background="#0c33ac"}>
          {videoPaused ? "▶ Jouer" : "⏸ Pause"}
        </button>
        <button onClick={replay}
          style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.07)", color:"#e2e8f0", border:"1.5px solid rgba(255,255,255,.18)", borderRadius:10, padding:"11px 28px", fontSize:".95rem", fontWeight:700, cursor:"pointer" }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.14)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.07)"}>
          ↺ Rejouer
        </button>
        <button onClick={toggleMute}
          style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.07)", color:"#e2e8f0", border:"1.5px solid rgba(255,255,255,.18)", borderRadius:10, padding:"11px 28px", fontSize:".95rem", fontWeight:700, cursor:"pointer" }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.14)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.07)"}>
          {muted ? "🔊 Son" : "🔇 Muet"}
        </button>
      </div>
    )}
  </>
  );
};

const HS = {
  hero: { position: "relative", height: "70vh", minHeight: 480, maxHeight: 680, overflow: "hidden" },
  bg: { position: "absolute", inset: 0, backgroundSize: "cover", backgroundPosition: "center", transition: "opacity 1s ease" },
  overlay: { position: "absolute", inset: 0, background: "linear-gradient(120deg, rgba(8,16,40,.9) 0%, rgba(8,16,40,.75) 55%, rgba(8,16,40,.4) 100%)", zIndex: 1 },
  content: { position: "relative", zIndex: 2, maxWidth: 680, margin: "0 auto 0 8%", padding: "80px 24px 100px 48px" },
  badge: { display: "inline-block", background: "rgba(8,145,178,.3)", border: "1px solid rgba(8,145,178,.5)", color: "#7dd3fc", borderRadius: 999, padding: "5px 16px", fontSize: ".72rem", fontWeight: 700, letterSpacing: ".06em", marginBottom: 20 },
  h1: { fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "clamp(2.4rem,5.5vw,4.2rem)", color: "#fff", lineHeight: 1.1, margin: "0 0 18px" },
  accent: { color: "#38bdf8", fontStyle: "italic" },
  sub: { color: "rgba(255,255,255,.78)", fontSize: "1rem", lineHeight: 1.75, margin: "0 0 28px", maxWidth: 500 },
  profileLabel: { color: "rgba(255,255,255,.55)", fontSize: ".8rem", fontWeight: 600, letterSpacing: ".05em", marginBottom: 10, textTransform: "uppercase" },
  profileBar: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 },
  profileBtn: { display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.1)", border: "1.5px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.75)", borderRadius: 999, padding: "8px 18px", fontSize: ".85rem", fontWeight: 600, cursor: "pointer", transition: "all .2s", fontFamily: "'Montserrat', 'Segoe UI', sans-serif" },
  profileBtnActive: { background: "#0891b2", borderColor: "#0891b2", color: "#fff", boxShadow: "0 4px 16px rgba(8,145,178,.4)" },
  ctas: { display: "flex", gap: 12, flexWrap: "wrap" },
  btnPrimary: { background: "linear-gradient(135deg,#ff2945,#cc1530)", color: "#fff", border: "none", borderRadius: 999, padding: "14px 30px", fontSize: "1rem", fontWeight: 800, cursor: "pointer", transition: "all .2s", boxShadow: "0 6px 24px rgba(220,38,38,.4)", fontFamily: "'Montserrat', 'Segoe UI', sans-serif", animation: "pulse 2.5s ease infinite" },
  btnSecondary: { background: "transparent", color: "#fff", border: "2px solid rgba(255,255,255,.45)", borderRadius: 999, padding: "13px 26px", fontSize: ".95rem", fontWeight: 700, cursor: "pointer", transition: "all .2s", fontFamily: "'Montserrat', 'Segoe UI', sans-serif" },
  proof: { display: "flex", alignItems: "center", gap: 14, marginTop: 32 },
  avatarStack: { display: "flex" },
  avatar: { width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,.18)", border: "2px solid rgba(255,255,255,.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".95rem" },
  proofText: { color: "rgba(255,255,255,.8)", fontSize: ".85rem" },
  wave: { position: "absolute", bottom: -1, left: 0, right: 0, zIndex: 3, lineHeight: 0 },
};

/* ─────────────────────────────────────────────────────────
   2. PROOF STRIP (Stats)
───────────────────────────────────────────────────────── */
const STATS = [
  { n: 8000, suf: "+", label: "Apprenants certifiés", icon: "🎓" },
  { n:100, suf: "%", label: "Taux de réussite", icon: "🏆" },
  { n: 6, suf: "", label: "Centres en Côte d'Ivoire", icon: "📍" },
  { n: 8, suf: " ans", label: "D'expertise pédagogique", icon: "⭐" },
];

const Stat = ({ n, suf, label, icon, active }) => {
  const val = useCounter(n, 1800, active);
  return (
    <div style={PRFS.statCard}>
      <div style={PRFS.statIcon}>{icon}</div>
      <div style={PRFS.statNum}>{val.toLocaleString("fr")}{suf}</div>
      <div style={PRFS.statLabel}>{label}</div>
    </div>
  );
};

const ProofStrip = () => {
  const [ref, inView] = useInView();
  return (
    <section ref={ref} style={PRFS.strip}>
      <div style={PRFS.inner}>
        <div className="bet-proof-strip" style={PRFS.grid}>
          {STATS.map((s, i) => <Stat key={i} {...s} active={inView} />)}
        </div>
      </div>
    </section>
  );
};

const PRFS = {
  strip: { background: "linear-gradient(135deg,#011451,#0c33ac)", padding: "52px 0" },
  inner: { maxWidth: 1100, margin: "0 auto", padding: "0 24px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 24 },
  statCard: { textAlign: "center", padding: "20px 16px", borderRadius: 16, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" },
  statIcon: { fontSize: "1.8rem", marginBottom: 10 },
  statNum: { fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "2.2rem", color: "#fff", lineHeight: 1 },
  statLabel: { fontSize: ".82rem", color: "rgba(255,255,255,.6)", marginTop: 6, fontWeight: 600, lineHeight: 1.35 },
};

/* ─────────────────────────────────────────────────────────
   3. PROGRAMMES SECTION - cartes avec S'inscrire direct
───────────────────────────────────────────────────────── */
const ProgramCard = ({ p, inView, delay, onEnroll }) => {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  // Redirige toujours vers une vraie page d'inscription (cours ou certification),
  // qui a le flux complet (choix d'assistante + paiement TouchPoint réel) - l'ancien
  // PaymentModal de cette page ne créait ni assignation ni paiement réel.
  const handleEnroll = () => {
    if (p.to) { navigate(p.to); return; }
    if (p.certId) { navigate(`/certification/${p.certId}`); return; }
    onEnroll(p);
  };
  return (
    <div
      className="bet-card"
      style={{
        ...PG.card,
        opacity: inView ? 1 : 0,
        transform: inView ? (hov ? "translateY(-6px)" : "none") : "translateY(24px)",
        transition: `opacity .5s ease ${delay}ms, transform .3s ease`,
        boxShadow: hov ? "0 24px 56px rgba(0,0,0,.14)" : "0 2px 12px rgba(0,0,0,.07)",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Image */}
      <div style={PG.imgWrap}>
        <img src={p.img} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform .5s", transform: hov ? "scale(1.05)" : "scale(1)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 50%,rgba(0,0,0,.6))" }} />
        {/* Tag */}
        <div style={{ ...PG.tag, background: p.tagBg, color: p.color }}>{p.tag}</div>
        {/* Highlight */}
        <div style={PG.highlight}>{p.highlight}</div>
        {/* Urgence */}
        {p.spots != null && <div style={PG.spots}>🔥 {p.spots} places restantes</div>}
      </div>

      {/* Body */}
      <div style={PG.body}>
        <div style={PG.topRow}>
          <h3 style={PG.title}>{p.title}</h3>
          <div style={PG.rating}><span style={{ color: "#f59e0b" }}>★</span> {p.rating}</div>
        </div>
        <p style={PG.sub}>{p.sub}</p>
        <p style={PG.desc}>{p.desc}</p>

        {/* Features mini */}
        <div style={PG.featMini}>
          {p.features.slice(0, 2).map((f, i) => (
            <span key={i} style={PG.featPill}><span style={{ color: "#10b981" }}>✓</span> {f}</span>
          ))}
        </div>

        {/* Meta */}
        <div style={PG.meta}>
          <span style={PG.metaPill}>⏱ {p.duration}</span>
          <span style={PG.metaPill}>📊 {p.level}</span>
          <span style={PG.metaPill}>👥 {p.students.toLocaleString("fr")} inscrits</span>
        </div>

        {/* Prix + CTA */}
        <div style={PG.footer}>
          <div>
            <div style={PG.price}>{p.priceLabel}</div>
            <div style={{ fontSize: ".7rem", color: "#94a3b8" }}>accès complet · remboursement 30j</div>
          </div>
          <button
            className="bet-enroll-direct"
            style={{ ...PG.enrollBtn, background: p.color }}
            onClick={handleEnroll}
          >
            {p.to ? "Voir les offres →" : "S'inscrire →"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ProgramsSection = ({ activeProfile, onFilter, onEnroll }) => {
  const [ref, inView] = useInView();
  const catalogRef = useRef({
    certif:   (() => { try { return JSON.parse(localStorage.getItem("bet_certifications_config")); } catch { return null; } })(),
    enLigne:  (() => { try { return JSON.parse(localStorage.getItem("bet_offres_en_ligne")); } catch { return null; } })(),
    domicile: (() => { try { return JSON.parse(localStorage.getItem("bet_offres_domicile")); } catch { return null; } })(),
  });
  const countsRef = useRef(null);
  const [programs, setPrograms] = useState(() => buildDynamicPrograms(
    catalogRef.current.certif, catalogRef.current.enLigne, catalogRef.current.domicile, null
  ));
  const rebuild = () => setPrograms(buildDynamicPrograms(
    catalogRef.current.certif, catalogRef.current.enLigne, catalogRef.current.domicile, countsRef.current
  ));

  useEffect(() => {
    supabase.from("plateforme_config").select("key,valeur")
      .in("key", ["certifications_config", "offres_en_ligne", "offres_domicile"])
      .then(({ data }) => {
        (data || []).forEach(row => {
          if (row.key === "certifications_config") { catalogRef.current.certif = row.valeur; localStorage.setItem("bet_certifications_config", JSON.stringify(row.valeur)); }
          if (row.key === "offres_en_ligne") { catalogRef.current.enLigne = row.valeur; localStorage.setItem("bet_offres_en_ligne", JSON.stringify(row.valeur)); }
          if (row.key === "offres_domicile") { catalogRef.current.domicile = row.valeur; localStorage.setItem("bet_offres_domicile", JSON.stringify(row.valeur)); }
        });
        rebuild();
      });

    // Places restantes réelles - inscriptions actives par offre (voir buildDynamicPrograms)
    const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
    fetch(`${API}/api/inscriptions/places-restantes`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.counts) return;
        countsRef.current = d.counts;
        rebuild();
      })
      .catch(() => {});
  }, []);

  const filtered = activeProfile === "tous"
    ? programs
    : programs.filter(p => p.profiles.includes(activeProfile));

  return (
    <section id="programmes" ref={ref} style={{ padding: "80px 0", background: "#fff" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span style={SH.badge}>🎯 NOS CERTIFICATIONS & FORMATIONS</span>
          <h2 style={SH.h2}>
            Choisissez votre programme<br />
            <span style={SH.accent}>et inscrivez-vous maintenant</span>
          </h2>
          <div style={SH.line} />
          <p style={SH.sub}>Cliquez sur <strong>« S'inscrire »</strong> pour accéder directement au paiement - simple, rapide, sécurisé.</p>
        </div>

        {/* Filtre profil */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
          {PROFILES.map(p => (
            <button key={p.id} className="bet-pill" style={{ ...PG.filterBtn, ...(activeProfile === p.id ? PG.filterBtnActive : {}) }} onClick={() => onFilter(p.id)}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>

        {/* Grille */}
        <div className="bet-programs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 24 }}>
          {filtered.map((p, i) => (
            <ProgramCard key={p.id} p={p} inView={inView} delay={i * 90} onEnroll={onEnroll} />
          ))}
        </div>

      </div>
    </section>
  );
};

const PG = {
  card: { borderRadius: 18, overflow: "hidden", border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer" },
  imgWrap: { height: 196, position: "relative", overflow: "hidden" },
  tag: { position: "absolute", top: 12, left: 12, fontSize: ".64rem", fontWeight: 800, letterSpacing: ".07em", borderRadius: 999, padding: "3px 10px" },
  highlight: { position: "absolute", bottom: 12, left: 12, background: "rgba(255,255,255,.95)", color: "#011451", fontSize: ".72rem", fontWeight: 800, borderRadius: 999, padding: "3px 10px" },
  spots: { position: "absolute", top: 12, right: 12, background: "#fef3c7", color: "#d97706", fontSize: ".65rem", fontWeight: 800, borderRadius: 999, padding: "3px 10px" },
  body: { padding: "18px 18px 20px" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  title: { fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "1.3rem", margin: 0, fontWeight: 400, color: "#011451" },
  rating: { fontSize: ".8rem", fontWeight: 700, color: "#f59e0b", whiteSpace: "nowrap" },
  sub: { fontSize: ".78rem", color: "#ff2945", fontWeight: 700, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".04em" },
  desc: { fontSize: ".85rem", color: "#475569", lineHeight: 1.6, margin: "0 0 12px" },
  featMini: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 },
  featPill: { fontSize: ".78rem", color: "#334155", display: "flex", alignItems: "center", gap: 5 },
  meta: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  metaPill: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 9px", fontSize: ".7rem", fontWeight: 600, color: "#475569" },
  footer: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: "1px solid #f1f5f9", paddingTop: 14 },
  price: { fontWeight: 800, fontSize: ".92rem", color: "#011451" },
  enrollBtn: { color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontWeight: 800, fontSize: ".82rem", cursor: "pointer", transition: "background .2s", fontFamily: "'Montserrat', 'Segoe UI', sans-serif", whiteSpace: "nowrap" },
  filterBtn: { background: "#f1f5f9", border: "1.5px solid transparent", borderRadius: 999, padding: "7px 18px", fontSize: ".82rem", fontWeight: 700, cursor: "pointer", transition: "all .2s", fontFamily: "'Montserrat', 'Segoe UI', sans-serif", color: "#475569" },
  filterBtnActive: { background: "#ff2945", color: "#fff", borderColor: "#ff2945" },
  fdfpNote: { display: "flex", gap: 10, alignItems: "center", background: "#eef1ff", border: "1px solid #b3c4ff", borderRadius: 12, padding: "14px 18px", marginTop: 36, fontSize: ".88rem", color: "#0c33ac", lineHeight: 1.55 },
};

const SH = {
  badge: { display: "inline-block", background: "#fff0f2", color: "#ff2945", borderRadius: 999, padding: "5px 16px", fontSize: ".72rem", fontWeight: 800, letterSpacing: ".08em", marginBottom: 14, border: "1px solid #ffb3bc" },
  h2: { fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 400, color: "#011451", margin: "0 0 14px", lineHeight: 1.18 },
  accent: { color: "#ff2945", fontStyle: "italic" },
  line: { width: 52, height: 3, borderRadius: 2, margin: "0 auto 18px", background: "#ffb3bc" },
  sub: { fontSize: ".95rem", color: "#64748b", lineHeight: 1.7, maxWidth: 540, margin: "0 auto" },
};

/* ─────────────────────────────────────────────────────────
   4. BANDE TEST GRATUIT
───────────────────────────────────────────────────────── */
const TestBand = () => {
  const [ref, inView] = useInView();
  return (
    <section ref={ref} style={{ background: "linear-gradient(135deg,#011451,#0891b2)", padding: "60px 24px", textAlign: "center" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", opacity: inView ? 1 : 0, transform: inView ? "none" : "translateY(20px)", transition: "all .6s ease" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🧪</div>
        <h2 style={{ fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "clamp(1.7rem,3.5vw,2.6rem)", color: "#fff", margin: "0 0 12px", fontWeight: 400 }}>
          Vous ne savez pas quel programme<br />
          <em style={{ color: "#38bdf8" }}>choisir ?</em>
        </h2>
        <p style={{ color: "rgba(255,255,255,.72)", fontSize: ".96rem", lineHeight: 1.7, marginBottom: 28 }}>
          Faites notre test de niveau officiel <strong style={{ color: "#fff" }}>CECRL en 10 minutes</strong> - recevez instantanément votre niveau et le programme idéal pour vous.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/test-niveau">
            <button style={TB.btnPrimary}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px) scale(1.03)"}
              onMouseLeave={e => e.currentTarget.style.transform = "none"}>
              🎯 Faire le test gratuit (10 min)
            </button>
          </Link>
        </div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
          {["✓ 100% gratuit", "✓ Résultats immédiats", "✓ Sans inscription", "✓ Recommandation personnalisée"].map((t, i) => (
            <span key={i} style={{ fontSize: ".76rem", color: "rgba(255,255,255,.55)", fontWeight: 600 }}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
};

const TB = {
  btnPrimary: { background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#000", border: "none", borderRadius: 999, padding: "15px 34px", fontSize: "1rem", fontWeight: 800, cursor: "pointer", transition: "all .2s", boxShadow: "0 6px 24px rgba(251,191,36,.4)", fontFamily: "'Montserrat', 'Segoe UI', sans-serif" },
};

/* ─────────────────────────────────────────────────────────
   5. MODES D'APPRENTISSAGE (simplifié)
───────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────
   6. TESTIMONIALS
───────────────────────────────────────────────────────── */
/* Fallback statique - remplacé par Supabase dès le chargement */
const TESTIS = [
  { avatar: "👩🏾‍⚖️", nom: "Awa Koné",         role: "Étudiante en droit",          score: "TOEIC 850",  texte: "En 3 mois j'ai décroché 850 au TOEIC. Les méthodes sont vraiment efficaces et le suivi personnalisé fait toute la différence. Je recommande à 100% !", etoiles: 5, couleur: "#d97706", video_url: null },
  { avatar: "👨🏿‍💼", nom: "Kouamé Brou",       role: "Directeur Commercial · NSIA",  score: "IELTS 7.5",  texte: "La formation entreprise a transformé notre relation client internationale. Nos équipes communiquent maintenant avec confiance en anglais.", etoiles: 5, couleur: "#0891b2", video_url: null },
  { avatar: "👩🏽‍💻", nom: "Fatoumata Diallo",  role: "Ingénieure IT · MTN CI",       score: "TOEFL 104",  texte: "Préparé mon TOEFL en ligne depuis Abidjan. Les corrections rapides et la disponibilité des profs m'ont permis d'atteindre mon score cible.", etoiles: 5, couleur: "#0c33ac", video_url: null },
  { avatar: "👨🏽‍🎓", nom: "Sonia Ravin",       role: "Étudiante · Université HEC",   score: "TOEIC 920",  texte: "Programme d'immersion qui a littéralement changé ma vie. 920 points au TOEIC - des portes que je croyais fermées se sont ouvertes.", etoiles: 5, couleur: "#e93747", video_url: null },
];

function buildTestiEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null; // URL directe (MP4…)
}

const AccPlayBtn = ({ color }) => (
  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,.22)", cursor:"pointer" }}>
    <div style={{ width:60, height:60, borderRadius:"50%", background:"rgba(255,255,255,.92)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 24px rgba(0,0,0,.3)" }}>
      <div style={{ width:0, height:0, borderTop:"11px solid transparent", borderBottom:"11px solid transparent", borderLeft:`18px solid ${color||"#0c33ac"}`, marginLeft:4 }} />
    </div>
  </div>
);

const TestiVideoCard = ({ ti, onOpen }) => {
  const videoRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);

  // Pas de vidéo - carte avatar / photo cliquable
  if (!ti.video_url) {
    if (ti.photo_url) {
      return (
        <div onClick={onOpen} style={{ borderRadius:16, overflow:"hidden", position:"relative", aspectRatio:"16/9", cursor:"zoom-in" }}>
          <img src={ti.photo_url} alt={ti.nom} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block", transition:"transform .3s" }}
            onMouseEnter={e => e.currentTarget.style.transform="scale(1.04)"}
            onMouseLeave={e => e.currentTarget.style.transform="scale(1)"} />
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top,rgba(0,0,0,.55) 0%,transparent 55%)" }} />
          <div style={{ position:"absolute", bottom:12, left:14, color:"#fff", fontWeight:800, fontSize:".9rem" }}>{ti.nom}</div>
          <span style={{ position:"absolute", bottom:12, right:12, background:"rgba(0,0,0,.55)", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:4, backdropFilter:"blur(4px)" }}>🔍 Agrandir</span>
        </div>
      );
    }
    return (
      <div style={{ borderRadius:16, overflow:"hidden", background:`linear-gradient(135deg,${ti.couleur}22,${ti.couleur}08)`, border:`2px solid ${ti.couleur}33`, aspectRatio:"16/9", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
        <div style={{ fontSize:"4rem" }}>{ti.avatar}</div>
        <div style={{ fontWeight:800, fontSize:"1rem", color:ti.couleur }}>{ti.nom}</div>
        <div style={{ fontSize:".8rem", color:"#64748b" }}>{ti.role}</div>
      </div>
    );
  }

  const embedUrl = buildTestiEmbedUrl(ti.video_url);

  // YouTube / Vimeo → iframe directe
  if (embedUrl) {
    return (
      <div style={{ borderRadius:16, overflow:"hidden", position:"relative", background:"#111", aspectRatio:"16/9" }}>
        <iframe src={embedUrl} title={ti.nom} frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen style={{ width:"100%", height:"100%", display:"block", border:"none" }} />
        <button onClick={onOpen} title="Agrandir"
          style={{ position:"absolute", top:10, right:10, background:"rgba(0,0,0,.6)", backdropFilter:"blur(6px)", border:"none", color:"#fff", fontSize:15, width:32, height:32, borderRadius:7, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>⛶</button>
      </div>
    );
  }

  // Fichier direct MP4 / Cloudinary
  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play(); setPlaying(true); }
  };
  return (
    <div style={{ borderRadius:16, overflow:"hidden", position:"relative", background:`linear-gradient(135deg,${ti.couleur||"#0c33ac"}33,${ti.couleur||"#0c33ac"}11)`, aspectRatio:"16/9" }}>
      <video ref={videoRef} src={ti.video_url}
        style={{ width:"100%", height:"100%", objectFit:"cover", display: playing ? "block" : "none", cursor:"pointer" }}
        onClick={toggle} onEnded={() => setPlaying(false)} />
      {!playing && (
        <>
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10 }}>
            <div style={{ fontSize:"4rem" }}>{ti.avatar||"🎓"}</div>
            <div style={{ fontWeight:800, fontSize:".95rem", color:ti.couleur||"#0c33ac" }}>{ti.nom}</div>
          </div>
          <div onClick={toggle} style={{ position:"absolute", inset:0 }}><AccPlayBtn color={ti.couleur} /></div>
        </>
      )}
      <div style={{ position:"absolute", top:12, left:14, background:"rgba(0,0,0,.55)", backdropFilter:"blur(6px)", borderRadius:6, padding:"4px 10px", color:"#fff", fontWeight:700, fontSize:".78rem" }}>{ti.nom}</div>
      <button onClick={onOpen} title="Agrandir"
        style={{ position:"absolute", top:10, right:10, background:"rgba(0,0,0,.6)", backdropFilter:"blur(6px)", border:"none", color:"#fff", fontSize:15, width:32, height:32, borderRadius:7, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>⛶</button>
    </div>
  );
};

const TestiTextCard = ({ ti }) => (
  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: ti.etoiles ?? 5 }).map((_, i) => (
        <span key={i} style={{ color: "#f59e0b", fontSize: "1.1rem" }}>★</span>
      ))}
    </div>
    <h3 style={{ fontFamily: "'Montserrat','Segoe UI',sans-serif", fontSize: "clamp(1.4rem,2.5vw,2rem)", fontWeight: 800, color: "#011451", margin: 0, lineHeight: 1.2 }}>{ti.nom}</h3>
    <p style={{ fontSize: "1rem", color: "#334155", lineHeight: 1.75, margin: 0 }}>"{ti.texte}"</p>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: ".82rem", color: "#64748b" }}>{ti.role}</span>
      <span style={{ background: ti.couleur + "20", color: ti.couleur, borderRadius: 999, padding: "3px 12px", fontSize: ".75rem", fontWeight: 800 }}>{ti.score}</span>
    </div>
  </div>
);

const F_ACC = "'Montserrat','Segoe UI',sans-serif";

const TestimonialsSection = () => {
  const [testis,  setTestis]  = useState(TESTIS);
  const [lightbox, setLightbox] = useState(null); // { type, url, embedUrl?, nom, role, score, texte, etoiles, avatar, couleur }

  useEffect(() => {
    supabase
      .from("temoignages")
      .select("id, nom, role, score, texte, avatar, couleur, etoiles, ordre, video_url, photo_url")
      .eq("actif", true)
      .eq("statut", "actif")
      .order("ordre", { ascending: true })
      .then(({ data }) => { if (data?.length) setTestis(data); });
  }, []);

  const openLightbox = (ti) => {
    if (ti.video_url) {
      setLightbox({ type:"video", url:ti.video_url, embedUrl:buildTestiEmbedUrl(ti.video_url), nom:ti.nom, role:ti.role, score:ti.score, texte:ti.texte, etoiles:ti.etoiles, avatar:ti.avatar, couleur:ti.couleur });
    } else if (ti.photo_url) {
      setLightbox({ type:"photo", url:ti.photo_url, nom:ti.nom, role:ti.role, score:ti.score, texte:ti.texte, etoiles:ti.etoiles, avatar:ti.avatar, couleur:ti.couleur });
    }
  };

  return (
    <section style={{ padding: "80px 0", background: "#eef2f8" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        {/* En-tête */}
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <span style={SH.badge}>💬 ILS ONT RÉUSSI</span>
          <h2 style={{ ...SH.h2, marginTop: 8 }}>Ils ont choisi BET<br /><span style={SH.accent}>et ils ne le regrettent pas</span></h2>
          <p style={{ color: "#64748b", fontSize: ".95rem", maxWidth: 620, margin: "14px auto 0", lineHeight: 1.7 }}>
            Rencontrez certains des apprenants qui ont rejoint BET et ont obtenu de vrais résultats. Ces témoignages illustrent la puissance de notre accompagnement.
          </p>
          <div style={{ ...SH.line, marginTop: 20 }} />
        </div>

        {/* Lignes alternées vidéo / texte */}
        <div style={{ display: "flex", flexDirection: "column", gap: 64 }}>
          {testis.map((ti, i) => (
            <div key={ti.id ?? i} className="bet-testi-alt-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 52, alignItems: "center" }}>
              {i % 2 === 0 ? (
                <><TestiVideoCard ti={ti} onOpen={() => openLightbox(ti)} /><TestiTextCard ti={ti} /></>
              ) : (
                <><TestiTextCard ti={ti} /><TestiVideoCard ti={ti} onOpen={() => openLightbox(ti)} /></>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center", marginTop: 64 }}>
          <p style={{ color: "#64748b", fontSize: ".92rem", marginBottom: 20 }}>Rejoignez +8 000 apprenants qui ont transformé leur carrière avec BET</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#programmes">
              <button style={{ background: "linear-gradient(135deg,#e93747,#0c33ac)", color: "#fff", border: "none", borderRadius: 999, padding: "14px 36px", fontWeight: 800, fontSize: "1rem", cursor: "pointer", fontFamily: F_ACC, boxShadow: "0 6px 24px rgba(233,55,71,.3)", transition: "transform .2s" }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                Commencer ma formation →
              </button>
            </a>
            <Link to="/temoignages">
              <button style={{ background: "#fff", color: "#0c33ac", border: "2px solid #0c33ac", borderRadius: 999, padding: "14px 28px", fontWeight: 700, fontSize: ".95rem", cursor: "pointer", fontFamily: F_ACC, transition: "all .2s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#0c33ac"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#0c33ac"; }}>
                Voir tous les témoignages →
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Lightbox (média gauche + infos droite) ── */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} className="modal-overlay-mq"
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16, backdropFilter:"blur(6px)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ display:"flex", width:"100%", maxWidth:1040, maxHeight:"90vh", borderRadius:20, overflow:"hidden", boxShadow:"0 32px 100px rgba(0,0,0,.7)", background:"#fff" }}>

            {/* Colonne gauche : média */}
            <div style={{ flex:"0 0 60%", background:"#0a0a0a", display:"flex", alignItems:"center", justifyContent:"center", minHeight:400 }}>
              {lightbox.type === "photo" ? (
                <img src={lightbox.url} alt={lightbox.nom}
                  style={{ width:"100%", height:"100%", objectFit:"contain", display:"block", maxHeight:"90vh" }} />
              ) : lightbox.embedUrl ? (
                <div style={{ width:"100%", aspectRatio:"16/9" }}>
                  <iframe src={lightbox.embedUrl} title={lightbox.nom} frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen style={{ width:"100%", height:"100%", border:"none", display:"block" }} />
                </div>
              ) : (
                <video src={lightbox.url} controls autoPlay
                  style={{ width:"100%", maxHeight:"90vh", display:"block" }} />
              )}
            </div>

            {/* Colonne droite : infos */}
            <div style={{ flex:"0 0 40%", display:"flex", flexDirection:"column", padding:"32px 28px", overflowY:"auto", position:"relative" }}>
              <button onClick={() => setLightbox(null)}
                style={{ position:"absolute", top:16, right:16, background:"#f1f5f9", border:"none", borderRadius:"50%", width:34, height:34, cursor:"pointer", fontSize:16, color:"#334155", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>

              <div style={{ display:"inline-flex", alignItems:"center", gap:6, background: lightbox.type==="video" ? "#eef1ff" : "#fff0f2", color: lightbox.type==="video" ? "#0c33ac" : "#e93747", borderRadius:999, padding:"4px 12px", fontSize:".7rem", fontWeight:800, marginBottom:20, alignSelf:"flex-start" }}>
                {lightbox.type === "video" ? "🎬 Vidéo témoignage" : "🖼️ Photo / diplôme"}
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
                <div style={{ width:54, height:54, borderRadius:"50%", background:`${lightbox.couleur||"#0c33ac"}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.8rem", flexShrink:0, border:`2px solid ${lightbox.couleur||"#0c33ac"}30` }}>
                  {lightbox.avatar || "🎓"}
                </div>
                <div>
                  <div style={{ fontFamily:F_ACC, fontWeight:800, fontSize:"1.05rem", color:"#011451" }}>{lightbox.nom}</div>
                  {lightbox.role && <div style={{ fontSize:".78rem", color:"#64748b", marginTop:2 }}>{lightbox.role}</div>}
                </div>
              </div>

              <div style={{ fontSize:"1.3rem", letterSpacing:2, marginBottom:16 }}>
                <span style={{ color:"#f59e0b" }}>{"★".repeat(lightbox.etoiles || 5)}</span>
                <span style={{ color:"#e5e7eb" }}>{"☆".repeat(5 - (lightbox.etoiles || 5))}</span>
              </div>

              {lightbox.score && (
                <div style={{ display:"inline-block", background:lightbox.couleur||"#0c33ac", color:"#fff", borderRadius:999, padding:"5px 16px", fontSize:".8rem", fontWeight:800, marginBottom:18, alignSelf:"flex-start" }}>
                  🏆 {lightbox.score}
                </div>
              )}

              <p style={{ fontFamily:F_ACC, fontSize:".92rem", color:"#334155", lineHeight:1.8, fontStyle:"italic", flex:1, margin:0 }}>
                « {lightbox.texte} »
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};


/* ─────────────────────────────────────────────────────────
   8. PARTNERS MARQUEE
───────────────────────────────────────────────────────── */
const PARTNERS_FALLBACK = [
  { nom: "dot.", logo_url: "/images/partners/dot.png" },
  { nom: "Digital Opportunity Trust", logo_url: "/images/partners/dot_trust.png" },
  { nom: "Business Scouts", logo_url: "/images/partners/business_scouts.png" },
  { nom: "GIZ", logo_url: "/images/partners/giz.png" },
  { nom: "ENSEA", logo_url: "/images/partners/ensea.png" },
  { nom: "Allianz", logo_url: "/images/partners/allianz.png" },
  { nom: "GIZ Full", logo_url: "/images/partners/giz_full.png" },
];

const PartnersSection = () => {
  const [partners, setPartners] = useState(PARTNERS_FALLBACK);

  useEffect(() => {
    fetch(`${API_URL}/api/partenaires/publics`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data) && data.length > 0) setPartners(data); })
      .catch(() => {});
  }, []);

  const items = [...partners, ...partners];

  return (
    <section style={{ padding: "56px 0", background: "#fff", borderTop: "1px solid #f1f5f9", overflow: "hidden" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto 28px", padding: "0 24px", textAlign: "center" }}>
        <p style={{ fontSize: ".78rem", color: "#94a3b8", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
          Ils nous accordent leur confiance
        </p>
        <h2 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "#011451" }}>Nos partenaires</h2>
      </div>
      <div style={{ overflow: "hidden", position: "relative" }}>
        {/* fade gauche/droite */}
        <div style={{ position:"absolute", left:0, top:0, bottom:0, width:80, background:"linear-gradient(to right,#fff,transparent)", zIndex:2, pointerEvents:"none" }} />
        <div style={{ position:"absolute", right:0, top:0, bottom:0, width:80, background:"linear-gradient(to left,#fff,transparent)", zIndex:2, pointerEvents:"none" }} />
        <div style={{ display: "flex", width: "fit-content", animation: "ticker 28s linear infinite" }}>
          {items.map((p, i) => (
            <div key={i} style={{ flexShrink: 0, height: 72, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 48px" }}>
              {p.site_web ? (
                <a href={p.site_web} target="_blank" rel="noopener noreferrer" title={p.nom} style={{ display:"flex", alignItems:"center" }}>
                  <img src={p.logo_url} alt={p.nom} style={{ maxHeight: 56, maxWidth: 140, objectFit: "contain", opacity: 0.7, filter: "grayscale(.2)", transition:"opacity .2s" }}
                    onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="0.7"} />
                </a>
              ) : (
                <img src={p.logo_url} alt={p.nom} style={{ maxHeight: 56, maxWidth: 140, objectFit: "contain", opacity: 0.7, filter: "grayscale(.2)" }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};


const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/* ─────────────────────────────────────────────────────────
   PAGE PRINCIPALE
───────────────────────────────────────────────────────── */
export default function Accueil() {
  const [activeProfile, setActiveProfile] = useState("tous");
  const [enrollProgram, setEnrollProgram] = useState(null);
  useEffect(() => {
  }, []);

  return (
    <>
      <SEO
        title="Binnie's English Training – Formation anglais certifiante en Côte d'Ivoire"
        description="Certifications TOEIC, TOEFL, IELTS et cours d'anglais personnalisés pour particuliers et professionnels. Cabinet agréé État. +8 000 apprenants certifiés."
        canonicalUrl="/"
      />

      <div style={{ fontFamily: "'Montserrat', 'Segoe UI', sans-serif", color: "#011451", overflowX: "hidden", background: "#fff", paddingBottom: 72 }}>
        <HeroSection />
        <ProofStrip />
        <ProgramsSection activeProfile={activeProfile} onFilter={setActiveProfile} onEnroll={setEnrollProgram} />
        <CataloguePdfBanner />
        <TestBand />
        <TestimonialsSection />
        <BlogSection/>
        {/* L'équipe administrative AVANT les coachs : on présente d'abord qui dirige,
            puis qui enseigne. La section ne s'affiche pas tant que personne n'est publié. */}
        <EquipeAdminSection background="#fff" />
        <CoachesSection background="#f8fafc" />
        <PartnersSection />
        <Footer />
      </div>

      {/* Modal paiement unique */}
      {enrollProgram && (
        <PaymentModal program={enrollProgram} onClose={() => setEnrollProgram(null)} />
      )}

    </>
  );
}


