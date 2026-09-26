import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import Footer from "../Footer/Footer";
import SEO from "../Components/SEO/SEO";

if (!document.querySelector("#bfb-fonts")) {
  const l = document.createElement("link"); l.id = "bfb-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#bfb-kf")) {
  const s = document.createElement("style"); s.id = "bfb-kf";
  s.textContent = `
    @keyframes bfbFU { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
    @keyframes bfbFI { from{opacity:0} to{opacity:1} }
    @keyframes bfbTicker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
    .bfb-benef-card:hover { transform:translateY(-3px) !important; box-shadow:0 10px 28px rgba(0,0,0,.08) !important; }
    .bfb-step:hover .bfb-step-num { transform:scale(1.08); }
    .bfb-faq-q:hover { color:#0c33ac !important; }
  `;
  document.head.appendChild(s);
}
if (!document.querySelector("#bfb-responsive")) {
  const r = document.createElement("style"); r.id = "bfb-responsive";
  r.textContent = `
    .bfb-root { overflow-x:hidden; max-width:100%; }
    @media (max-width:900px) {
      .bfb-hero-layout { grid-template-columns:1fr !important; gap:32px !important; text-align:center; }
      .bfb-hero-ctas, .bfb-hero-trust { justify-content:center !important; }
      .bfb-steps-grid { grid-template-columns:1fr 1fr !important; }
    }
    @media (max-width:768px) {
      .bfb-benef-grid { grid-template-columns:1fr !important; }
      .bfb-hero-title { font-size:1.9rem !important; }
      .bfb-section-title { font-size:1.5rem !important; }
      .bfb-cta-final { flex-direction:column; text-align:center; gap:20px; }
      .bfb-hero-breadcrumb { display:none !important; }
    }
    @media (max-width:640px) {
      .bfb-hero-title { font-size:1.55rem !important; }
      .bfb-steps-grid { grid-template-columns:1fr !important; }
      .bfb-hero-ctas { flex-direction:column; align-items:stretch; }
      .bfb-hero-ctas button, .bfb-hero-ctas a { width:100%; text-align:center; justify-content:center; }
    }
  `;
  document.head.appendChild(r);
}

function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function buildHeroEmbedUrl(url) {
  if (!url) return null;
  const ytId = extractYoutubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&rel=0&modestbranding=1&controls=0&enablejsapi=1`;
  if (/vimeo\.com\/(\d+)/.test(url)) {
    const id = url.match(/vimeo\.com\/(\d+)/)[1];
    return `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&background=1`;
  }
  return url;
}

function useInView(t = 0.15) {
  const r = useRef(null); const [v, sv] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) sv(true); }, { threshold: t });
    if (r.current) o.observe(r.current);
    return () => o.disconnect();
  }, [t]);
  return [r, v];
}

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const BENEFITS = [
  { ico: "📊", title: "Audit CECRL offert", desc: "Analyse complète du niveau de vos équipes, recommandations et plan de formation, sans engagement." },
  { ico: "⚡", title: "Réponse sous 24h", desc: "Notre équipe RH vous rappelle le jour ouvré suivant votre demande de devis." },
  { ico: "💼", title: "Tarifs dégressifs & FDFP", desc: "Remises négociées selon l'effectif à former. Financement FDFP disponible pour les entreprises éligibles." },
  { ico: "🏛️", title: "Cabinet agréé État CI", desc: "Certificats officiellement reconnus par le Ministère de l'Emploi de Côte d'Ivoire." },
  { ico: "🌍", title: "6 centres + distanciel", desc: "Formation en présentiel dans nos centres d'Abidjan, Bouaké et Grand-Bassam, ou 100% en ligne." },
  { ico: "📜", title: "Certification incluse", desc: "En fin de formation, chaque collaborateur reçoit un certificat BET officiel." },
];

const SECTORS = ["Finance & Banque", "Télécommunications", "Pharmaceutique", "Industrie & BTP", "Technologie & IT", "Commerce & Distribution", "Éducation", "ONG & Organisations Int."];

const STEPS = [
  { n: "01", title: "Audit gratuit", desc: "On évalue le niveau CECRL de vos équipes et on identifie les besoins réels." },
  { n: "02", title: "Devis personnalisé", desc: "Programme, format (présentiel/distanciel) et budget adaptés à votre entreprise, sous 24h." },
  { n: "03", title: "Formation", desc: "Sessions dans nos centres, en ligne, ou en intra dans vos locaux, avec suivi mensuel RH." },
  { n: "04", title: "Certification", desc: "Chaque collaborateur reçoit un certificat BET officiel en fin de parcours." },
];

const FAQ = [
  { q: "Le financement FDFP est-il vraiment accessible ?", a: "Oui - les entreprises ivoiriennes à jour de leurs cotisations peuvent mobiliser leur quota FDFP pour financer tout ou partie de la formation. Notre équipe RH vous accompagne dans le montage du dossier." },
  { q: "Peut-on former des équipes réparties sur plusieurs villes ?", a: "Oui. Nous combinons présentiel dans nos centres (Abidjan, Bouaké, Grand-Bassam) et cours en ligne pour couvrir des équipes réparties sur plusieurs sites, voire à l'international." },
  { q: "Les certifications sont-elles reconnues officiellement ?", a: "BET est un cabinet de formation agréé par l'État de Côte d'Ivoire (Ministère de l'Emploi). Les certificats délivrés en fin de parcours sont officiellement reconnus, et nous préparons également aux certifications internationales TOEIC, TOEFL et IELTS." },
  { q: "Combien de temps dure une formation type ?", a: "Cela dépend du niveau de départ et des objectifs identifiés lors de l'audit gratuit - de quelques semaines pour une remise à niveau ciblée, à plusieurs mois pour un programme complet avec certification." },
  { q: "Comment se passe le suivi côté RH ?", a: "Les formules Business et Enterprise incluent un tableau de bord RH avec suivi de la progression, taux d'assiduité et rapports mensuels par collaborateur." },
];

const PARTNERS_FALLBACK = [
  { nom: "dot.", logo_url: "/images/partners/dot.png" },
  { nom: "Digital Opportunity Trust", logo_url: "/images/partners/dot_trust.png" },
  { nom: "Business Scouts", logo_url: "/images/partners/business_scouts.png" },
  { nom: "GIZ", logo_url: "/images/partners/giz.png" },
  { nom: "ENSEA", logo_url: "/images/partners/ensea.png" },
  { nom: "Allianz", logo_url: "/images/partners/allianz.png" },
];

const btnPrimary = { padding: "15px 30px", background: "linear-gradient(135deg,#0c33ac,#011451)", color: "#fff", border: "none", borderRadius: 10, fontSize: "1rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 10px 26px rgba(12,51,172,.28)", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" };
const btnSecondary = { padding: "15px 30px", background: "#fff", color: "#011451", border: "2px solid #dbe3f7", borderRadius: 10, fontSize: "1rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" };

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #e5e7eb", padding: "18px 0" }}>
      <div className="bfb-faq-q" onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>
        {item.q}
        <span style={{ fontSize: "1.3rem", color: "#0c33ac", transform: open ? "rotate(45deg)" : "none", transition: "transform .2s" }}>+</span>
      </div>
      {open && <p style={{ marginTop: 12, fontSize: ".95rem", color: "#64748b", lineHeight: 1.7 }}>{item.a}</p>}
    </div>
  );
}

export default function BetForBusiness() {
  const [partners, setPartners] = useState(PARTNERS_FALLBACK);
  const [clients, setClients] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/entreprise/clients-publics`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (Array.isArray(d?.entreprises)) setClients(d.entreprises); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/partenaires/publics`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data) && data.length > 0) setPartners(data); })
      .catch(() => {});
  }, []);

  // ── Média hero (configurable par le SuperAdmin, comme les pages Cours/Certifications) ──
  const [heroMedia, setHeroMedia] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/offre-media/bet_business/publiques`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.media?.length) setHeroMedia(d.media[0]); })
      .catch(() => {});
  }, []);
  const iframeRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const sendYTCmd = (func, args = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  };
  // Distingue une pause voulue (bouton) d'une pause automatique au scroll - seule la première
  // doit empêcher la reprise automatique quand le hero revient dans le champ de vision.
  const manualPauseRef = useRef(false);
  const handleMute = () => { sendYTCmd(isMuted ? "unMute" : "mute"); setIsMuted(m => !m); };
  const handlePlayPause = () => { sendYTCmd(isPlaying ? "pauseVideo" : "playVideo"); manualPauseRef.current = isPlaying; setIsPlaying(p => !p); };
  const handleReplay = () => { sendYTCmd("seekTo", [0, true]); sendYTCmd("playVideo"); setIsPlaying(true); manualPauseRef.current = false; };

  const [heroRef, heroInView] = useInView();
  const [benefRef, benefInView] = useInView();
  const [stepRef, stepInView] = useInView();
  const [faqRef, faqInView] = useInView();

  // Coupe la vidéo hero dès qu'elle sort de l'écran au scroll - reprend seule au retour dans
  // le champ, sauf si l'utilisateur l'avait lui-même mise en pause avant de scroller.
  useEffect(() => {
    if (!heroRef.current || heroMedia?.type !== "video") return;
    const node = heroRef.current;
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (manualPauseRef.current) return;
        sendYTCmd("playVideo");
        setIsPlaying(true);
      } else {
        sendYTCmd("pauseVideo");
        setIsPlaying(false);
      }
    }, { threshold: 0.2 });
    o.observe(node);
    return () => o.disconnect();
  }, [heroMedia]);

  // Toute demande (devis ou audit gratuit) ouvre l'assistant guidé de la Navbar
  // (affectation réelle à une assistante Corporate), plutôt que de renvoyer vers
  // /parcours/entreprise - qui reste accessible via "Voir nos offres & tarifs".
  const openDevisGlobal = () => window.dispatchEvent(new CustomEvent("bet:openEntrepriseModal"));

  return (
    <div className="bfb-root" style={{ fontFamily: "'Montserrat','Segoe UI',sans-serif", background: "#fff" }}>
      <SEO
        title="BET for Business - Formations d'anglais professionnel en entreprise | BET Languages"
        description="Formez vos équipes à l'anglais professionnel avec BET Languages : audit CECRL gratuit, formations sur-mesure, certification officielle, cabinet agréé État de Côte d'Ivoire."
        canonicalUrl="/bet-for-business"
      />

      {/* ── HERO (purement visuel - photo/vidéo configurée par le SuperAdmin) ── */}
      <section ref={heroRef} style={{ background: heroMedia ? "#07111f" : "linear-gradient(135deg,#011451 0%,#061d6e 55%,#0c33ac 100%)", position: "relative", overflow: "hidden", height: heroMedia?.type === "video" ? "clamp(360px, 42vw, 520px)" : "clamp(300px, 34vw, 420px)" }}>
        {!heroMedia && <>
          <div style={{ position: "absolute", width: 420, height: 420, borderRadius: "50%", background: "rgba(233,55,71,.10)", top: -120, right: -100, pointerEvents: "none" }} />
          <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,.05)", bottom: -100, left: -80, pointerEvents: "none" }} />
        </>}

        {/* ── Fond média plein écran (photo ou vidéo, configurable par le SuperAdmin) ── */}
        {heroMedia?.type === "video" && (
          <iframe
            ref={iframeRef}
            src={buildHeroEmbedUrl(heroMedia.url)}
            title={heroMedia.titre || "Présentation BET for Business"}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: "absolute", top: "50%", left: "50%", width: "100%", height: "56.25vw", minWidth: "177.78vh", minHeight: "100%", transform: "translate(-50%,-50%)", zIndex: 0 }}
          />
        )}
        {heroMedia?.type === "image" && (
          <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: `url(${heroMedia.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        )}
        {heroMedia && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", background: heroMedia.type === "video"
            ? "linear-gradient(to bottom,rgba(7,17,31,0) 20%,rgba(7,17,31,.45) 58%,rgba(7,17,31,.96) 100%)"
            : "linear-gradient(135deg,rgba(10,20,50,.75) 0%,rgba(30,58,138,.55) 100%)" }} />
        )}

        {/* ── Breadcrumb flottant en haut ── */}
        {heroMedia && (
          <div className="bfb-hero-breadcrumb" style={{ position: "absolute", top: 22, left: 0, right: 0, zIndex: 3, maxWidth: 1180, margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", gap: 6, fontSize: ".76rem" }}>
            <Link to="/" style={{ color: "rgba(255,255,255,.5)", textDecoration: "none", transition: "color .2s" }} onMouseEnter={e => e.currentTarget.style.color = "#fff"} onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.5)"}>Accueil</Link>
            <span style={{ color: "rgba(255,255,255,.2)" }}>›</span>
            <span style={{ color: "rgba(255,255,255,.7)" }}>BET for Business</span>
          </div>
        )}

        {/* ── Zone titre ancrée en bas (titre + description du média, configurés par le SuperAdmin) ── */}
        {heroMedia && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2, padding: "0 0 36px" }}>
            <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 32px" }}>
              <div style={{ marginBottom: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.1)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,.18)", color: "rgba(255,255,255,.9)", borderRadius: 100, padding: "5px 16px", fontSize: ".7rem", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
                  🏢 BET FOR BUSINESS
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ width: 4, minHeight: 52, borderRadius: 4, background: "linear-gradient(to bottom,#ff2945,#0c33ac)", flexShrink: 0, marginTop: 4 }} />
                <div>
                  <h1 style={{ fontSize: "clamp(1.7rem,4vw,3rem)", color: "#fff", margin: "0 0 6px", fontWeight: 800, lineHeight: 1.1, textShadow: "0 2px 28px rgba(0,0,0,.55)" }}>
                    {heroMedia.titre || "L'anglais professionnel pour vos équipes"}
                  </h1>
                  {heroMedia.description && (
                    <p style={{ color: "rgba(255,255,255,.65)", fontSize: ".95rem", margin: 0, lineHeight: 1.5, maxWidth: 600 }}>
                      {heroMedia.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Barre de contrôle vidéo (uniquement si le média hero est une vidéo) ── */}
      {heroMedia?.type === "video" && (
        <div style={{ background: "#0a1128", padding: "14px 32px", display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "1.5px solid rgba(255,255,255,.06)" }}>
          <button onClick={handlePlayPause} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0c33ac", color: "#fff", border: "none", borderRadius: 10, padding: "11px 28px", fontSize: ".95rem", fontWeight: 800, cursor: "pointer", letterSpacing: ".02em" }}>
            {isPlaying ? "⏸ Pause" : "▶ Jouer"}
          </button>
          <button onClick={handleMute} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, padding: "11px 22px", fontSize: ".9rem", fontWeight: 700, cursor: "pointer" }}>
            {isMuted ? "🔊 Son" : "🔇 Muet"}
          </button>
          <button onClick={handleReplay} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, padding: "11px 22px", fontSize: ".9rem", fontWeight: 700, cursor: "pointer" }}>
            🔁 Rejouer
          </button>
        </div>
      )}

      {/* ── INFOS (BET for Business + Ils nous font confiance) - sous le hero ── */}
      <section style={{ background: "linear-gradient(135deg,#011451 0%,#061d6e 55%,#0c33ac 100%)", padding: "0 24px" }}>
        <div className="bfb-hero-layout" style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 0 60px", display: "grid", gridTemplateColumns: clients.length > 0 ? "1.15fr .85fr" : "1fr", gap: 48, alignItems: "center", opacity: heroInView ? 1 : 0, animation: heroInView ? "bfbFU .7s ease both" : "none" }}>
          <div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 30, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontSize: ".78rem", fontWeight: 700, letterSpacing: ".04em", marginBottom: 22 }}>
              🏢 BET FOR BUSINESS
            </span>
            <h1 className="bfb-hero-title" style={{ fontSize: "2.6rem", fontWeight: 900, color: "#fff", lineHeight: 1.18, marginBottom: 18 }}>
              L'anglais professionnel, au service de la performance de vos équipes.
            </h1>
            <p style={{ fontSize: "1.08rem", color: "rgba(255,255,255,.78)", lineHeight: 1.7, marginBottom: 30, maxWidth: 540 }}>
              Cabinet de formation agréé par l'État de Côte d'Ivoire. Audit linguistique offert, programmes sur-mesure et certification officielle pour faire de l'anglais un vrai levier business pour votre entreprise.
            </p>
            <div className="bfb-hero-ctas" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 30 }}>
              <button onClick={openDevisGlobal} style={btnPrimary}>🔍 Demander l'audit gratuit</button>
            </div>
            <div className="bfb-hero-trust" style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              {["🏛️ Agréé État CI", "📍 6 centres + distanciel", "📜 Certification incluse"].map(t => (
                <span key={t} style={{ color: "rgba(255,255,255,.75)", fontSize: ".85rem", fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
          {clients.length > 0 && (
            <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 18, padding: 30, backdropFilter: "blur(6px)" }}>
              <div style={{ color: "#fff", fontSize: ".82rem", fontWeight: 700, letterSpacing: ".04em", opacity: .7, marginBottom: 18 }}>ILS NOUS FONT CONFIANCE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {clients.map(c => (
                  <div key={c.nom} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.06)" }}>
                    {c.logo_url ? (
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                        <img src={c.logo_url} alt={c.nom} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }}
                          onError={e => { e.currentTarget.parentElement.outerHTML = `<div style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:.8rem;flex-shrink:0">${c.nom.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>`; }}
                        />
                      </div>
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: c.couleur || "rgba(255,255,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: ".8rem", flexShrink: 0 }}>
                        {c.initiales || c.nom.split(" ").map(w => w[0]).slice(0, 2).join("")}
                      </div>
                    )}
                    <span style={{ color: "#fff", fontWeight: 600, fontSize: ".92rem" }}>{c.nom}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── LOGOS PARTENAIRES ── */}
      <section style={{ background: "#f8fafc", padding: "26px 0", borderBottom: "1px solid #eef1f7" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ textAlign: "center", fontSize: ".75rem", fontWeight: 700, letterSpacing: ".08em", color: "#94a3b8", marginBottom: 16 }}>NOS PARTENAIRES INSTITUTIONNELS</div>
          <div style={{ display: "flex", gap: 40, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
            {partners.map(p => (
              <div key={p.nom} title={p.nom} style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={p.logo_url} alt={p.nom} loading="lazy"
                  style={{ maxHeight: 52, maxWidth: 130, objectFit: "contain", opacity: .75, filter: "grayscale(.2)", transition: "opacity .2s" }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = ".75"; }}
                  onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement.insertAdjacentHTML("beforeend", `<span style="font-weight:700;color:#64748b;font-size:.95rem">${p.nom}</span>`); }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── POURQUOI NOUS ── */}
      <section ref={benefRef} style={{ background: "#f8fafc", padding: "70px 24px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 46 }}>
            <span style={{ color: "#0c33ac", fontWeight: 700, fontSize: ".82rem", letterSpacing: ".06em" }}>POURQUOI BET</span>
            <h2 className="bfb-section-title" style={{ fontSize: "2rem", fontWeight: 900, color: "#011451", margin: "10px 0 0" }}>Pourquoi les entreprises nous choisissent</h2>
          </div>
          <div className="bfb-benef-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
            {BENEFITS.map((b, i) => (
              <div key={b.title} className="bfb-benef-card" style={{ background: "#fff", borderRadius: 14, padding: "24px 22px", border: "1px solid #eef1f7", transition: "all .25s ease", opacity: benefInView ? 1 : 0, animation: benefInView ? `bfbFU .6s ease ${i * 0.06}s both` : "none" }}>
                <div style={{ fontSize: "1.6rem", marginBottom: 12 }}>{b.ico}</div>
                <h3 style={{ fontSize: ".98rem", fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>{b.title}</h3>
                <p style={{ fontSize: ".85rem", color: "#64748b", lineHeight: 1.6 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTEURS ── */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "70px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <span style={{ color: "#0c33ac", fontWeight: 700, fontSize: ".82rem", letterSpacing: ".06em" }}>SECTEURS D'ACTIVITÉ</span>
          <h2 className="bfb-section-title" style={{ fontSize: "1.7rem", fontWeight: 900, color: "#011451", margin: "10px 0 0" }}>Des entreprises de tous secteurs nous font confiance</h2>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {SECTORS.map(s => (
            <span key={s} style={{ padding: "9px 18px", borderRadius: 30, background: "#eef1ff", color: "#0c33ac", fontWeight: 700, fontSize: ".85rem", border: "1px solid #dbe3f7" }}>{s}</span>
          ))}
        </div>
      </section>

      {/* ── COMMENT ÇA MARCHE ── */}
      <section ref={stepRef} style={{ background: "linear-gradient(135deg,#011451,#0c33ac)", padding: "74px 24px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 46 }}>
            <span style={{ color: "rgba(255,255,255,.65)", fontWeight: 700, fontSize: ".82rem", letterSpacing: ".06em" }}>NOTRE PROCESSUS</span>
            <h2 className="bfb-section-title" style={{ fontSize: "2rem", fontWeight: 900, color: "#fff", margin: "10px 0 0" }}>Comment ça marche</h2>
          </div>
          <div className="bfb-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 22 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} className="bfb-step" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 16, padding: "26px 20px", opacity: stepInView ? 1 : 0, animation: stepInView ? `bfbFU .6s ease ${i * 0.08}s both` : "none" }}>
                <div className="bfb-step-num" style={{ fontSize: "1.6rem", fontWeight: 900, color: "#ff2945", marginBottom: 10, transition: "transform .25s ease" }}>{s.n}</div>
                <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", marginBottom: 8 }}>{s.title}</h3>
                <p style={{ fontSize: ".85rem", color: "rgba(255,255,255,.72)", lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section ref={faqRef} style={{ background: "#f8fafc", padding: "80px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ color: "#0c33ac", fontWeight: 700, fontSize: ".82rem", letterSpacing: ".06em" }}>QUESTIONS FRÉQUENTES</span>
            <h2 className="bfb-section-title" style={{ fontSize: "1.9rem", fontWeight: 900, color: "#011451", margin: "10px 0 0" }}>Vous vous posez ces questions ?</h2>
          </div>
          <div style={{ background: "#fff", borderRadius: 16, padding: "10px 26px", border: "1px solid #eef1f7", opacity: faqInView ? 1 : 0, animation: faqInView ? "bfbFU .6s ease both" : "none" }}>
            {FAQ.map(item => <FaqItem key={item.q} item={item} />)}
          </div>
        </div>
      </section>

      {/* ── CTA FINALE ── */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px 84px" }}>
        <div className="bfb-cta-final" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 30, background: "linear-gradient(135deg,#011451,#0c33ac)", borderRadius: 22, padding: "48px 46px" }}>
          <div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 900, color: "#fff", marginBottom: 8 }}>Prêt à faire progresser votre équipe ?</h2>
            <p style={{ color: "rgba(255,255,255,.75)", fontSize: ".95rem" }}>Audit CECRL gratuit, sans engagement - réponse sous 24h.</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={openDevisGlobal} style={{ ...btnPrimary, background: "#fff", color: "#011451", boxShadow: "0 10px 26px rgba(0,0,0,.2)" }}>Demander un devis →</button>
            <a href="/contact" style={{ ...btnSecondary, background: "transparent", color: "#fff", border: "2px solid rgba(255,255,255,.3)" }}>Nous contacter</a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
