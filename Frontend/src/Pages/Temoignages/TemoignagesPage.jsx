import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../config/supabase";
import Footer from "../Footer/Footer";
import SEO from "../Components/SEO/SEO";

/* ── Keyframes & styles globaux ── */
if (!document.querySelector("#bet-temo-page-kf")) {
  const s = document.createElement("style");
  s.id = "bet-temo-page-kf";
  s.textContent = `
    @keyframes fadeUp  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
    @keyframes scaleIn { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
    @keyframes spinSlow{ to{transform:rotate(360deg)} }
    @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }

    .tpg-card {
      background:#fff;
      border-radius:18px;
      border:1.5px solid #e2e8f0;
      overflow:hidden;
      display:flex;
      flex-direction:column;
      transition:box-shadow .22s, transform .22s;
      animation: fadeUp .45s ease both;
    }
    .tpg-card:hover {
      box-shadow: 0 12px 36px rgba(0,0,0,0.10);
      transform: translateY(-4px);
    }

    .tpg-filter-btn {
      padding: 8px 18px;
      border-radius: 999px;
      border: none;
      font-size: .82rem;
      font-weight: 700;
      cursor: pointer;
      transition: background .15s, color .15s, transform .12s;
      font-family: inherit;
    }
    .tpg-filter-btn:hover { transform: translateY(-1px); }
    .tpg-filter-btn--active   { background:#0c33ac; color:#fff; }
    .tpg-filter-btn--inactive { background:#f1f5f9; color:#475569; }

    .tpg-cta-btn {
      background:linear-gradient(135deg,#e93747,#0c33ac);
      color:#fff; border:none; border-radius:999px;
      padding:14px 36px; font-weight:800; font-size:1rem;
      cursor:pointer; font-family:inherit;
      box-shadow:0 6px 24px rgba(233,55,71,.3);
      transition:transform .2s, box-shadow .2s;
    }
    .tpg-cta-btn:hover { transform:translateY(-3px); box-shadow:0 10px 32px rgba(233,55,71,.35); }

    .tpg-back-btn:hover { background:#011451!important; color:#fff!important; }

    @media(max-width:700px){
      .tpg-grid { grid-template-columns:1fr!important; }
      .tpg-hero-h1 { font-size:clamp(1.7rem,6vw,2.4rem)!important; }
      .tpg-stats { flex-direction:column; gap:12px!important; }
    }
  `;
  document.head.appendChild(s);
}

/* ── Embed URL helper (YouTube / Vimeo / fichier direct) ── */
function buildEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null; // MP4 direct
}

/* ── Fallback data ── */
const FALLBACK = [
  { id:"f1", avatar:"👩🏾‍⚖️", nom:"Awa Koné",        role:"Étudiante en droit",          score:"TOEIC 850",  texte:"En 3 mois j'ai décroché 850 au TOEIC. Les méthodes sont vraiment efficaces et le suivi personnalisé fait toute la différence. Je recommande à 100% !", etoiles:5, couleur:"#d97706", video_url:null, photo_url:null },
  { id:"f2", avatar:"👨🏿‍💼", nom:"Kouamé Brou",      role:"Directeur Commercial · NSIA", score:"IELTS 7.5",  texte:"La formation entreprise a transformé notre relation client internationale. Nos équipes communiquent maintenant avec confiance en anglais.", etoiles:5, couleur:"#0891b2", video_url:null, photo_url:null },
  { id:"f3", avatar:"👩🏽‍💻", nom:"Fatoumata Diallo", role:"Ingénieure IT · MTN CI",      score:"TOEFL 104",  texte:"Préparé mon TOEFL en ligne depuis Abidjan. Les corrections rapides et la disponibilité des profs m'ont permis d'atteindre mon score cible.", etoiles:5, couleur:"#0c33ac", video_url:null, photo_url:null },
  { id:"f4", avatar:"👨🏽‍🎓", nom:"Sonia Ravin",      role:"Étudiante · Université HEC",  score:"TOEIC 920",  texte:"Programme d'immersion qui a littéralement changé ma vie. 920 points au TOEIC - des portes que je croyais fermées se sont ouvertes.", etoiles:5, couleur:"#e93747", video_url:null, photo_url:null },
];

const SCORES = ["Tous", "TOEIC", "TOEFL", "IELTS", "Anglais Pro"];

const F = "'Montserrat', 'Segoe UI', sans-serif";

/* ══════════════════════════════════════════════
   CARD COMPOSANT
══════════════════════════════════════════════ */
const TemoVideoPlayer = ({ t, onOpen }) => {
  const videoRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const embedUrl = buildEmbedUrl(t.video_url);

  if (embedUrl) {
    return (
      <div style={{ position:"relative", width:"100%", aspectRatio:"16/9", flexShrink:0, overflow:"hidden", background:"#000" }}>
        <iframe src={embedUrl} title={t.nom} frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen style={{ width:"100%", height:"100%", border:"none", display:"block" }} />
        <span style={{ position:"absolute", top:8, left:10, background:"rgba(0,0,0,.55)", backdropFilter:"blur(6px)", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:5 }}>{t.nom}</span>
        <button onClick={onOpen} title="Agrandir"
          style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,.55)", backdropFilter:"blur(6px)", border:"none", color:"#fff", fontSize:14, width:30, height:30, borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>⛶</button>
      </div>
    );
  }

  // Fichier direct MP4
  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play(); setPlaying(true); }
  };
  return (
    <div style={{ position:"relative", width:"100%", aspectRatio:"16/9", background:`linear-gradient(135deg,${t.couleur||"#0c33ac"}33,${t.couleur||"#0c33ac"}11)`, flexShrink:0, overflow:"hidden" }}>
      <video ref={videoRef} src={t.video_url} style={{ width:"100%", height:"100%", objectFit:"cover", display: playing ? "block" : "none" }}
        onClick={toggle} onEnded={() => setPlaying(false)} />
      {!playing && (
        <>
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
            <div style={{ fontSize:"3.5rem" }}>{t.avatar||"🎓"}</div>
            <div style={{ fontWeight:800, fontSize:".88rem", color:t.couleur||"#0c33ac" }}>{t.nom}</div>
          </div>
          <div onClick={toggle} style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,.08)", cursor:"pointer" }}>
            <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(255,255,255,.92)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(0,0,0,.3)" }}>
              <div style={{ width:0, height:0, borderTop:"9px solid transparent", borderBottom:"9px solid transparent", borderLeft:`15px solid ${t.couleur||"#0c33ac"}`, marginLeft:3 }} />
            </div>
          </div>
        </>
      )}
      <span style={{ position:"absolute", top:8, left:10, background:"rgba(0,0,0,.55)", backdropFilter:"blur(6px)", color:"#fff", fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:5 }}>{t.nom}</span>
      <button onClick={onOpen} title="Agrandir"
        style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,.55)", backdropFilter:"blur(6px)", border:"none", color:"#fff", fontSize:14, width:30, height:30, borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>⛶</button>
    </div>
  );
};

const TemoCard = ({ t, delay = 0, onOpenLightbox }) => (
  <div className="tpg-card" style={{ animationDelay: `${delay}ms` }}>

    {/* Vidéo en tête de carte (si disponible) */}
    {t.video_url ? (
      <TemoVideoPlayer t={t} onOpen={() => onOpenLightbox({ type:"video", url:t.video_url, nom:t.nom, embedUrl:buildEmbedUrl(t.video_url), role:t.role, score:t.score, texte:t.texte, etoiles:t.etoiles, avatar:t.avatar, couleur:t.couleur })} />
    ) : (
      <div style={{ height: 5, background: t.couleur || "#0c33ac", flexShrink: 0 }} />
    )}

    <div style={{ padding: "20px 22px 18px", flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Étoiles */}
      <div style={{ marginBottom: 10, fontSize: "1rem", letterSpacing: 1 }}>
        <span style={{ color: "#f59e0b" }}>{"★".repeat(t.etoiles || 5)}</span>
        <span style={{ color: "#e5e7eb" }}>{"☆".repeat(5 - (t.etoiles || 5))}</span>
      </div>

      {/* Texte */}
      <p style={{ fontFamily: F, fontSize: ".92rem", color: "#334155", lineHeight: 1.7, fontStyle: "italic", margin: "0 0 16px", flex: 1 }}>
        « {t.texte} »
      </p>

      {/* Photo diplôme (seulement si pas de vidéo) */}
      {!t.video_url && t.photo_url && (
        <div onClick={() => onOpenLightbox({ type:"photo", url:t.photo_url, nom:t.nom, role:t.role, score:t.score, texte:t.texte, etoiles:t.etoiles, avatar:t.avatar, couleur:t.couleur })}>
          style={{ margin: "0 0 14px", borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0", cursor:"zoom-in", position:"relative" }}>
          <img src={t.photo_url} alt={`Diplôme de ${t.nom}`}
            style={{ width: "100%", height: 130, objectFit: "cover", display: "block", transition:"transform .25s" }}
            onMouseEnter={e => e.currentTarget.style.transform="scale(1.04)"}
            onMouseLeave={e => e.currentTarget.style.transform="scale(1)"} />
          <span style={{ position:"absolute", bottom:6, right:8, background:"rgba(0,0,0,.55)", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, backdropFilter:"blur(4px)" }}>🔍 Agrandir</span>
        </div>
      )}

      {/* Identité */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${t.couleur || "#0c33ac"}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
          {t.avatar || "🎓"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: ".88rem", color: "#011451", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.nom}</div>
          {t.role && <div style={{ fontSize: ".73rem", color: "#64748b", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.role}</div>}
        </div>
        {t.score && (
          <div style={{ background: t.couleur || "#0c33ac", color: "#fff", borderRadius: 999, padding: "4px 12px", fontSize: ".72rem", fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>
            {t.score}
          </div>
        )}
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════
   PAGE PRINCIPALE
══════════════════════════════════════════════ */
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";

function buildHeroEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&loop=1&playlist=${yt[1]}&rel=0&modestbranding=1&controls=0&enablejsapi=1`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1&muted=1&loop=1&background=1`;
  return url;
}

const TemoignagesPage = () => {
  const [temos,     setTemos]     = useState(FALLBACK);
  const [loading,   setLoading]   = useState(true);
  const [filtre,    setFiltre]    = useState("Tous");
  const [search,    setSearch]    = useState("");
  const [heroMedia, setHeroMedia] = useState(null);
  const [lightbox,  setLightbox]  = useState(null); // { type:"photo"|"video", url, nom, embedUrl? }
  const iframeRef   = useRef(null);
  const [isMuted,   setIsMuted]   = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);

  const sendYTCmd = (func, args = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event:"command", func, args }), "*");
  };
  // Distingue une pause voulue (bouton) d'une pause automatique au scroll - seule la première
  // doit empêcher la reprise automatique quand le hero revient dans le champ de vision.
  const manualPauseRef = useRef(false);
  const handleMute      = () => { sendYTCmd(isMuted ? "unMute" : "mute"); setIsMuted(m => !m); };
  const handleReplay    = () => { sendYTCmd("seekTo", [0, true]); sendYTCmd("playVideo"); setIsPlaying(true); manualPauseRef.current = false; };
  const handlePlayPause = () => {
    sendYTCmd(isPlaying ? "pauseVideo" : "playVideo");
    manualPauseRef.current = isPlaying;
    setIsPlaying(p => !p);
  };

  // Coupe la vidéo hero dès qu'elle sort de l'écran au scroll - reprend seule au retour dans
  // le champ, sauf si l'utilisateur l'avait lui-même mise en pause avant de scroller.
  useEffect(() => {
    const node = iframeRef.current;
    if (!node || heroMedia?.type !== "video") return;
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

  useEffect(() => {
    fetch(`${API_BASE}/api/offre-media/temoignages/publiques`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.media?.length) setHeroMedia(d.media[0]); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    supabase
      .from("temoignages")
      .select("id, nom, role, score, texte, avatar, photo_url, video_url, couleur, etoiles, ordre")
      .eq("actif", true)
      .eq("statut", "actif")
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data?.length) setTemos(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const PER_PAGE = 9;
  const [page, setPage] = useState(1);

  /* Filtrage */
  const filtered = temos.filter(t => {
    const matchFiltre = filtre === "Tous" || (t.score || "").toUpperCase().includes(filtre.toUpperCase());
    const q = search.toLowerCase();
    const matchSearch = !q || t.nom?.toLowerCase().includes(q) || t.texte?.toLowerCase().includes(q) || t.role?.toLowerCase().includes(q);
    return matchFiltre && matchSearch;
  });

  // Remettre à la page 1 quand filtre/recherche changent
  useEffect(() => { setPage(1); }, [filtre, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const displayed  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const goTo = (p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div style={{ fontFamily: F, background: "#f8fafc", minHeight: "100vh" }}>
      <SEO
        title="Témoignages de nos apprenants - Binnie's English Training | BET"
        description="Découvrez les témoignages d'apprenants certifiés TOEIC, TOEFL et IELTS chez BET - leurs parcours, leurs progrès et leur réussite en anglais."
        canonicalUrl="/temoignages"
      />

      {/* ══════════ HERO ══════════ */}
      <div style={heroMedia ? {
        position:"relative", overflow:"hidden",
        height: heroMedia.type==="video" ? "clamp(500px,56.25vw,620px)" : 480,
        background:"#07111f",
      } : {
        position:"relative", overflow:"hidden",
        minHeight:480, background:"#07111f",
        display:"flex", flexDirection:"column",
      }}>

        {/* ── Fond vidéo ── */}
        {heroMedia?.type === "video" && (
          <iframe
            ref={iframeRef}
            src={buildHeroEmbedUrl(heroMedia.url)}
            title={heroMedia.titre || "Témoignages BET"}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position:"absolute", top:"50%", left:"50%", width:"100%", height:"56.25vw", minWidth:"177.78vh", minHeight:"100%", transform:"translate(-50%,-50%)", zIndex:1, pointerEvents:"none" }}
          />
        )}
        {/* ── Fond image ── */}
        {heroMedia?.type === "image" && (
          <div style={{ position:"absolute", inset:0, zIndex:1, backgroundImage:`url(${heroMedia.url})`, backgroundSize:"cover", backgroundPosition:"center" }} />
        )}
        {/* ── Fond fallback (orbs) ── */}
        {!heroMedia && (
          <>
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg,#011451 0%,#011451 55%,#0c33ac 100%)", zIndex:1 }} />
            <div style={{ position:"absolute", width:360, height:360, borderRadius:"50%", background:"rgba(220,38,38,.12)", top:-100, right:-60, zIndex:1, pointerEvents:"none" }} />
            <div style={{ position:"absolute", width:240, height:240, borderRadius:"50%", background:"rgba(30,58,138,.2)", bottom:40, left:-60, zIndex:1, pointerEvents:"none" }} />
          </>
        )}

        {/* ── Gradient cinématique ── */}
        <div style={{ position:"absolute", inset:0, zIndex:2, pointerEvents:"none",
          background: heroMedia?.type === "video"
            ? "linear-gradient(to bottom,rgba(7,17,31,0) 20%,rgba(7,17,31,.45) 58%,rgba(7,17,31,.96) 100%)"
            : heroMedia?.type === "image"
              ? "linear-gradient(135deg,rgba(10,20,50,.75) 0%,rgba(30,58,138,.55) 100%)"
              : "linear-gradient(135deg,rgba(10,20,50,.80) 0%,rgba(30,58,138,.60) 100%)",
        }} />

        {/* ── Breadcrumb flottant en haut (avec heroMedia) ── */}
        {heroMedia && (
          <div style={{ position:"absolute", top:22, left:0, right:0, zIndex:4, maxWidth:1180, margin:"0 auto", padding:"0 32px", display:"flex", alignItems:"center", gap:6, fontSize:".76rem" }}>
            <Link to="/" style={{ color:"rgba(255,255,255,.5)", textDecoration:"none", transition:"color .2s" }} onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.5)"}>Accueil</Link>
            <span style={{ color:"rgba(255,255,255,.2)" }}>›</span>
            <span style={{ color:"rgba(255,255,255,.7)" }}>Témoignages</span>
          </div>
        )}

        {/* ── Zone titre ancrée en bas (avec heroMedia) ── */}
        {heroMedia && (
          <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:3, padding:"0 0 36px" }}>
            <div style={{ maxWidth:1180, margin:"0 auto", padding:"0 32px", display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:20, flexWrap:"wrap" }}>
              {/* Badge + barre accent + titre */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ marginBottom:12 }}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,255,255,.1)", backdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,.18)", color:"rgba(255,255,255,.9)", borderRadius:100, padding:"5px 16px", fontSize:".7rem", fontWeight:700, letterSpacing:".1em", textTransform:"uppercase" }}>
                    💬 Témoignages clients
                  </span>
                </div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
                  <div style={{ width:4, minHeight:52, borderRadius:4, background:"linear-gradient(to bottom,#e93747,#0c33ac)", flexShrink:0, marginTop:4 }}/>
                  <div>
                    <h1 className="tpg-hero-h1" style={{ fontFamily:F, fontSize:"clamp(1.7rem,4vw,3rem)", color:"#fff", margin:"0 0 6px", fontWeight:800, lineHeight:1.1, textShadow:"0 2px 28px rgba(0,0,0,.55)" }}>
                      {heroMedia.titre || "Ils ont choisi BET"}
                    </h1>
                    {heroMedia.description && (
                      <p style={{ color:"rgba(255,255,255,.65)", fontSize:".95rem", margin:0, lineHeight:1.5, maxWidth:600 }}>
                        {heroMedia.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Layout centré (sans heroMedia) ── */}
        {!heroMedia && (
          <div style={{ maxWidth:1180, margin:"0 auto", padding:"80px 24px 56px", position:"relative", zIndex:3, width:"100%", boxSizing:"border-box", flex:1, display:"flex", flexDirection:"column", justifyContent:"center", textAlign:"center" }}>
            <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:6, marginBottom:28, fontSize:".78rem" }}>
              <Link to="/" style={{ color:"rgba(255,255,255,.55)", textDecoration:"none", fontWeight:500 }}>Accueil</Link>
              <span style={{ color:"rgba(255,255,255,.3)" }}>›</span>
              <span style={{ color:"rgba(255,255,255,.8)", fontWeight:600 }}>Témoignages</span>
            </div>
            <div style={{ display:"inline-flex", alignSelf:"center", alignItems:"center", gap:8, background:"rgba(255,255,255,.1)", backdropFilter:"blur(8px)", borderRadius:999, padding:"6px 18px", fontSize:".72rem", fontWeight:800, color:"rgba(255,255,255,.85)", letterSpacing:".08em", marginBottom:20 }}>
              💬 ILS ONT RÉUSSI
            </div>
            <h1 className="tpg-hero-h1" style={{ fontFamily:F, fontSize:"clamp(2rem,5vw,3.2rem)", color:"#fff", margin:"0 0 20px", fontWeight:800, lineHeight:1.15 }}>
              Ils ont choisi BET<br /><span style={{ background:"linear-gradient(90deg,#fbbf24,#f97316)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>et ils ne le regrettent pas</span>
            </h1>
            <p style={{ fontSize:"1rem", color:"rgba(255,255,255,.65)", maxWidth:560, margin:"0 auto 40px", lineHeight:1.7 }}>
              Découvrez les parcours de nos apprenants - des résultats concrets, des certifications obtenues, des carrières transformées.
            </p>
          </div>
        )}

        {/* Wave - uniquement sans heroMedia */}
        {!heroMedia && (
          <div style={{ lineHeight:0, position:"relative", zIndex:3 }}>
            <svg viewBox="0 0 1440 56" style={{ display:"block", width:"100%" }} preserveAspectRatio="none">
              <path fill="#f8fafc" d="M0,28 C480,56 960,0 1440,28 L1440,56 L0,56 Z" />
            </svg>
          </div>
        )}
      </div>

      {/* ── Barre de contrôle vidéo ── */}
      {heroMedia?.type === "video" && (
        <div style={{ background:"#0a1128", padding:"14px 32px", display:"flex", justifyContent:"center", alignItems:"center", gap:12, flexWrap:"wrap", borderBottom:"1.5px solid rgba(255,255,255,.06)" }}>
          <button onClick={handlePlayPause} style={{ display:"flex", alignItems:"center", gap:8, background:"#0c33ac", color:"#fff", border:"none", borderRadius:10, padding:"11px 28px", fontSize:".95rem", fontWeight:800, cursor:"pointer", letterSpacing:".02em" }}>
            {isPlaying ? "⏸ Pause" : "▶ Jouer"}
          </button>
          <button onClick={handleReplay} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.07)", color:"#e2e8f0", border:"1.5px solid rgba(255,255,255,.18)", borderRadius:10, padding:"11px 28px", fontSize:".95rem", fontWeight:700, cursor:"pointer" }}>
            ↺ Rejouer
          </button>
          <button onClick={handleMute} style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,.07)", color:"#e2e8f0", border:"1.5px solid rgba(255,255,255,.18)", borderRadius:10, padding:"11px 28px", fontSize:".95rem", fontWeight:700, cursor:"pointer" }}>
            {isMuted ? "🔊 Son" : "🔇 Muet"}
          </button>
        </div>
      )}

      {/* ══════════ CONTENU ══════════ */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Barre filtres + recherche */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
          {/* Filtres certification */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SCORES.map(sc => (
              <button
                key={sc}
                className={`tpg-filter-btn tpg-filter-btn--${filtre === sc ? "active" : "inactive"}`}
                onClick={() => setFiltre(sc)}
              >
                {sc === "Tous" ? `Tous (${temos.length})` : sc}
              </button>
            ))}
          </div>

          {/* Recherche */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: ".9rem", color: "#94a3b8" }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un nom, un rôle…"
              style={{ paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9, border: "1.5px solid #e2e8f0", borderRadius: 999, fontSize: ".83rem", fontFamily: F, width: 220, outline: "none", background: "#fff", transition: "border-color .15s" }}
              onFocus={e => e.target.style.borderColor = "#0c33ac"}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"}
            />
          </div>
        </div>

        {/* Résultat count */}
        <p style={{ fontSize: ".82rem", color: "#94a3b8", marginBottom: 24, fontWeight: 600 }}>
          {loading ? "Chargement…" : `${filtered.length} témoignage${filtered.length > 1 ? "s" : ""}${filtre !== "Tous" ? ` · ${filtre}` : ""}${search ? ` · "${search}"` : ""} - page ${page}/${totalPages}`}
        </p>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>
            <div style={{ width: 40, height: 40, border: "4px solid #e2e8f0", borderTopColor: "#e93747", borderRadius: "50%", animation: "spinSlow .8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ fontSize: ".9rem" }}>Chargement des témoignages…</p>
          </div>
        )}

        {/* Grille */}
        {!loading && displayed.length > 0 && (
          <div className="tpg-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 22 }}>
            {displayed.map((t, i) => (
              <TemoCard key={t.id ?? i} t={t} delay={i * 60} onOpenLightbox={setLightbox} />
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 48, flexWrap: "wrap" }}>
            {/* Précédent */}
            <button
              onClick={() => goTo(page - 1)}
              disabled={page === 1}
              style={{ padding: "9px 18px", borderRadius: 999, border: "1.5px solid #e2e8f0", background: page === 1 ? "#f8fafc" : "#fff", color: page === 1 ? "#cbd5e1" : "#011451", fontWeight: 700, fontSize: ".85rem", cursor: page === 1 ? "not-allowed" : "pointer", fontFamily: F, transition: "all .15s" }}
            >
              ← Précédent
            </button>

            {/* Numéros */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => {
              const isActive = n === page;
              const isNear   = Math.abs(n - page) <= 2 || n === 1 || n === totalPages;
              if (!isNear) {
                const isPrevDot = n === page - 3;
                const isNextDot = n === page + 3;
                if (isPrevDot || isNextDot) return <span key={n} style={{ color: "#94a3b8", fontSize: ".9rem", padding: "0 2px" }}>…</span>;
                return null;
              }
              return (
                <button key={n} onClick={() => goTo(n)}
                  style={{ width: 38, height: 38, borderRadius: "50%", border: isActive ? "none" : "1.5px solid #e2e8f0", background: isActive ? "#0c33ac" : "#fff", color: isActive ? "#fff" : "#011451", fontWeight: 800, fontSize: ".88rem", cursor: "pointer", fontFamily: F, transition: "all .15s", flexShrink: 0 }}>
                  {n}
                </button>
              );
            })}

            {/* Suivant */}
            <button
              onClick={() => goTo(page + 1)}
              disabled={page === totalPages}
              style={{ padding: "9px 18px", borderRadius: 999, border: "1.5px solid #e2e8f0", background: page === totalPages ? "#f8fafc" : "#fff", color: page === totalPages ? "#cbd5e1" : "#011451", fontWeight: 700, fontSize: ".85rem", cursor: page === totalPages ? "not-allowed" : "pointer", fontFamily: F, transition: "all .15s" }}
            >
              Suivant →
            </button>
          </div>
        )}

        {/* Aucun résultat */}
        {!loading && displayed.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 24px", background: "#fff", borderRadius: 18, border: "1.5px dashed #e2e8f0" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔍</div>
            <h3 style={{ fontFamily: F, fontWeight: 800, color: "#011451", margin: "0 0 8px" }}>Aucun résultat</h3>
            <p style={{ color: "#64748b", fontSize: ".9rem" }}>Essayez un autre filtre ou effacez la recherche.</p>
            <button onClick={() => { setFiltre("Tous"); setSearch(""); }}
              style={{ marginTop: 16, padding: "9px 22px", background: "#0c33ac", color: "#fff", border: "none", borderRadius: 999, fontWeight: 700, fontSize: ".85rem", cursor: "pointer", fontFamily: F }}>
              Tout afficher
            </button>
          </div>
        )}

        {/* ══ BANDEAU CTA ══ */}
        <div style={{ marginTop: 72, background: "linear-gradient(135deg,#011451,#0c33ac)", borderRadius: 24, padding: "52px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,.04)" }} />
          <div style={{ position: "absolute", bottom: -40, left: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(233,55,71,.12)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>🚀</div>
            <h2 style={{ fontFamily: F, fontSize: "clamp(1.5rem,3vw,2.2rem)", color: "#fff", margin: "0 0 14px", fontWeight: 800 }}>
              Prêt à écrire votre propre succès ?
            </h2>
            <p style={{ color: "rgba(255,255,255,.65)", fontSize: ".95rem", maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.7 }}>
              Rejoignez +8 000 apprenants qui ont transformé leur carrière avec BET English Training.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link to="/#programmes">
                <button className="tpg-cta-btn">Commencer ma formation →</button>
              </Link>
              <Link to="/test-niveau">
                <button style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "1.5px solid rgba(255,255,255,.25)", borderRadius: 999, padding: "14px 28px", fontWeight: 700, fontSize: ".95rem", cursor: "pointer", fontFamily: F, transition: "background .2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.12)"}>
                  Tester mon niveau gratuitement
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Retour accueil */}
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <Link to="/" className="tpg-back-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#f1f5f9", color: "#011451", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: ".85rem", textDecoration: "none", transition: "all .2s", border: "1.5px solid #e2e8f0" }}>
            ← Retour à l'accueil
          </Link>
        </div>

      </div>

      {/* ══════════ LIGHTBOX (média gauche + infos droite) ══════════ */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", backdropFilter:"blur(6px)", animation:"fadeUp .2s ease" }}>

          {/* Conteneur 2 colonnes */}
          <div onClick={e => e.stopPropagation()}
            style={{ display:"flex", width:"100%", maxWidth:1040, maxHeight:"90vh", borderRadius:20, overflow:"hidden", boxShadow:"0 32px 100px rgba(0,0,0,.7)", background:"#fff" }}>

            {/* ── Colonne gauche : média ── */}
            <div style={{ flex:"0 0 60%", background:"#0a0a0a", display:"flex", alignItems:"center", justifyContent:"center", minHeight:400, position:"relative" }}>
              {lightbox.type === "photo" ? (
                <img src={lightbox.url} alt={lightbox.nom}
                  style={{ width:"100%", height:"100%", objectFit:"contain", display:"block", maxHeight:"90vh" }} />
              ) : lightbox.embedUrl ? (
                <div style={{ width:"100%", aspectRatio:"16/9" }}>
                  <iframe
                    src={lightbox.embedUrl.replace("controls=0","controls=1").replace(/autoplay=1&mute=1&loop=1&playlist=[^&]+/,"autoplay=1").replace(/\?&/,"?")}
                    title={lightbox.nom} frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen style={{ width:"100%", height:"100%", border:"none", display:"block" }} />
                </div>
              ) : (
                <video src={lightbox.url} controls autoPlay
                  style={{ width:"100%", maxHeight:"90vh", display:"block" }} />
              )}
            </div>

            {/* ── Colonne droite : infos témoignage ── */}
            <div style={{ flex:"0 0 40%", display:"flex", flexDirection:"column", padding:"32px 28px", overflowY:"auto", position:"relative" }}>
              {/* Bouton fermer */}
              <button onClick={() => setLightbox(null)}
                style={{ position:"absolute", top:16, right:16, background:"#f1f5f9", border:"none", borderRadius:"50%", width:34, height:34, cursor:"pointer", fontSize:16, color:"#334155", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>✕</button>

              {/* Badge type */}
              <div style={{ display:"inline-flex", alignItems:"center", gap:6, background: lightbox.type==="video" ? "#eef1ff" : "#fff0f2", color: lightbox.type==="video" ? "#0c33ac" : "#e93747", borderRadius:999, padding:"4px 12px", fontSize:".7rem", fontWeight:800, marginBottom:20, alignSelf:"flex-start" }}>
                {lightbox.type === "video" ? "🎬 Vidéo témoignage" : "🖼️ Photo / diplôme"}
              </div>

              {/* Avatar + nom */}
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
                <div style={{ width:54, height:54, borderRadius:"50%", background:`${lightbox.couleur||"#0c33ac"}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.8rem", flexShrink:0, border:`2px solid ${lightbox.couleur||"#0c33ac"}30` }}>
                  {lightbox.avatar || "🎓"}
                </div>
                <div>
                  <div style={{ fontFamily:F, fontWeight:800, fontSize:"1.05rem", color:"#011451" }}>{lightbox.nom}</div>
                  {lightbox.role && <div style={{ fontSize:".78rem", color:"#64748b", marginTop:2 }}>{lightbox.role}</div>}
                </div>
              </div>

              {/* Étoiles */}
              <div style={{ fontSize:"1.3rem", letterSpacing:2, marginBottom:16 }}>
                <span style={{ color:"#f59e0b" }}>{"★".repeat(lightbox.etoiles || 5)}</span>
                <span style={{ color:"#e5e7eb" }}>{"☆".repeat(5 - (lightbox.etoiles || 5))}</span>
              </div>

              {/* Score */}
              {lightbox.score && (
                <div style={{ display:"inline-block", background: lightbox.couleur||"#0c33ac", color:"#fff", borderRadius:999, padding:"5px 16px", fontSize:".8rem", fontWeight:800, marginBottom:18, alignSelf:"flex-start" }}>
                  🏆 {lightbox.score}
                </div>
              )}

              {/* Texte */}
              <p style={{ fontFamily:F, fontSize:".92rem", color:"#334155", lineHeight:1.8, fontStyle:"italic", flex:1, margin:0 }}>
                « {lightbox.texte} »
              </p>
            </div>
          </div>
        </div>
      )}

      <Footer/>
    </div>
  );
};

export default TemoignagesPage;
