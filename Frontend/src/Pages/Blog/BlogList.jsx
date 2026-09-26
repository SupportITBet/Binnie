import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Footer from "../Footer/Footer";
import SEO from "../Components/SEO/SEO";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";

if (!document.querySelector("#bet-bloglist-kf")) {
  const s = document.createElement("style"); s.id = "bet-bloglist-kf";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap');
    @keyframes blFadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes blSpin   { to{transform:rotate(360deg)} }
    .bl-card:hover { transform:translateY(-6px)!important; box-shadow:0 24px 48px rgba(0,0,0,.14)!important; }
    .bl-card:hover .bl-card-img { transform:scale(1.06)!important; }
    .bl-card:hover .bl-read-more { color:#ff2945!important; letter-spacing:.05em!important; }
    .bl-cat-btn:hover { background:#0c33ac!important; color:#fff!important; }
    @media(max-width:768px){ .bl-grid{ grid-template-columns:1fr!important; } }
    @media(max-width:480px){ .bl-hero-title{ font-size:1.8rem!important; } }
  `;
  document.head.appendChild(s);
}

const CAT_COLORS = {
  "Actualités":     { bg:"#f0fdf4", text:"#16a34a" },
  "Événements":     { bg:"#eef1ff", text:"#0c33ac" },
  "Cours":          { bg:"#fef3c7", text:"#d97706" },
  "Certifications": { bg:"#eef1ff", text:"#0c33ac" },
  "Conseils":       { bg:"#fff0f2", text:"#ff2945" },
  "Entreprise":     { bg:"#f3e8ff", text:"#7c3aed" },
  "Annonces":       { bg:"#e0f2fe", text:"#0891b2" },
};
const getCat = (cat) => CAT_COLORS[cat] || { bg:"#f1f5f9", text:"#475569" };

function buildHeroEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&loop=1&playlist=${yt[1]}&rel=0&modestbranding=1&controls=0&enablejsapi=1`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1&muted=1&loop=1&background=1`;
  return url;
}

const BlogList = () => {
  const [posts,     setPosts]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [activeCat, setActiveCat] = useState("Tous");
  const [heroMedia, setHeroMedia] = useState(null);
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
    fetch(`${API_BASE}/api/offre-media/blog/publiques`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.media?.length) setHeroMedia(d.media[0]); })
      .catch(() => {});
  }, []);

  const getYoutubeThumbnail = (url) => {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/blog`)
      .then(r => r.ok ? r.json() : { articles: [] })
      .then(({ articles }) => setPosts(
        (articles || []).map(a => {
          const ytThumb = !a.image_url ? getYoutubeThumbnail(a.video_url) : null;
          return {
            id:        a.id,
            title:     a.titre,
            excerpt:   a.extrait,
            category:  a.categorie,
            image:     a.image_url || ytThumb || null,
            videoOnly: !a.image_url && !!a.video_url && !ytThumb,
            date:      a.created_at ? new Date(a.created_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" }) : "",
            readTime:  a.read_time,
            author:    a.auteur,
          };
        })
      ))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = ["Tous", ...new Set(posts.map(p => p.category))];

  const filtered = posts.filter(p => {
    const matchCat   = activeCat === "Tous" || p.category === activeCat;
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || (p.excerpt||"").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const F = "'Montserrat','Segoe UI',sans-serif";

  return (
    <div style={{ fontFamily:F, minHeight:"100vh", background:"#f8fafc" }}>
      <SEO
        title="Blog - Conseils et actualités anglais | Binnie's English Training"
        description="Astuces, méthodes et actualités pour progresser en anglais : grammaire, vocabulaire, préparation aux certifications TOEIC/TOEFL/IELTS et vie de BET."
        canonicalUrl="/blog"
      />

      {/* ── HERO ── */}
      <div style={heroMedia ? {
        position:"relative", overflow:"hidden",
        height: heroMedia.type==="video" ? "clamp(500px,56.25vw,620px)" : 480,
        background:"#07111f",
      } : {
        position:"relative", overflow:"hidden",
        minHeight:420, background:"#07111f",
        display:"flex", flexDirection:"column",
      }}>

        {/* ── Fond vidéo ── */}
        {heroMedia?.type === "video" && (
          <iframe
            ref={iframeRef}
            src={buildHeroEmbedUrl(heroMedia.url)}
            title={heroMedia.titre || "Blog BET"}
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
        {/* ── Fond fallback ── */}
        {!heroMedia && (
          <>
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg,#011451 0%,#0c33ac 100%)", zIndex:1 }} />
            <div style={{ position:"absolute", top:-60, right:-60, width:300, height:300, borderRadius:"50%", background:"rgba(220,38,38,.06)", zIndex:1, pointerEvents:"none" }} />
            <div style={{ position:"absolute", bottom:-40, left:-40, width:200, height:200, borderRadius:"50%", background:"rgba(8,145,178,.08)", zIndex:1, pointerEvents:"none" }} />
          </>
        )}

        {/* ── Gradient cinématique ── */}
        <div style={{ position:"absolute", inset:0, zIndex:2, pointerEvents:"none",
          background: heroMedia?.type === "video"
            ? "linear-gradient(to bottom,rgba(7,17,31,0) 20%,rgba(7,17,31,.45) 58%,rgba(7,17,31,.96) 100%)"
            : heroMedia?.type === "image"
              ? "linear-gradient(135deg,rgba(7,17,31,.86) 0%,rgba(7,17,31,.48) 100%)"
              : "linear-gradient(135deg,rgba(10,20,50,.80) 0%,rgba(30,58,138,.60) 100%)",
        }} />

        {/* ── Breadcrumb flottant en haut (avec heroMedia) ── */}
        {heroMedia && (
          <div style={{ position:"absolute", top:22, left:0, right:0, zIndex:4, maxWidth:1180, margin:"0 auto", padding:"0 32px", display:"flex", alignItems:"center", gap:6, fontSize:".76rem" }}>
            <a href="/" style={{ color:"rgba(255,255,255,.5)", textDecoration:"none", transition:"color .2s" }} onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.5)"}>Accueil</a>
            <span style={{ color:"rgba(255,255,255,.2)" }}>›</span>
            <span style={{ color:"rgba(255,255,255,.7)" }}>Blog</span>
          </div>
        )}

        {/* ── Zone titre ancrée en bas (avec heroMedia) ── */}
        {heroMedia && (
          <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:3, padding:"0 0 36px" }}>
            <div style={{ maxWidth:1180, margin:"0 auto", padding:"0 32px" }}>
              <div style={{ marginBottom:12 }}>
                <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,255,255,.1)", backdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,.18)", color:"rgba(255,255,255,.9)", borderRadius:100, padding:"5px 16px", fontSize:".7rem", fontWeight:700, letterSpacing:".1em", textTransform:"uppercase" }}>
                  📰 Actualités &amp; Ressources
                </span>
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:20, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:14, flex:1, minWidth:0 }}>
                  <div style={{ width:4, minHeight:52, borderRadius:4, background:"linear-gradient(to bottom,#0891b2,#0c33ac)", flexShrink:0, marginTop:4 }}/>
                  <div>
                    <h1 className="bl-hero-title" style={{ fontFamily:F, fontSize:"clamp(1.7rem,4vw,3rem)", color:"#fff", margin:"0 0 6px", fontWeight:800, lineHeight:1.1, textShadow:"0 2px 28px rgba(0,0,0,.55)" }}>
                      {heroMedia.titre || "News & Événements BET"}
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
          <div style={{ position:"relative", zIndex:3, padding:"80px 24px 52px", textAlign:"center", flex:1, display:"flex", flexDirection:"column", justifyContent:"center" }}>
            <span style={{ display:"inline-block", background:"rgba(220,38,38,.2)", color:"#fca5a5", border:"1px solid rgba(220,38,38,.35)", borderRadius:999, padding:"5px 18px", fontSize:".72rem", fontWeight:800, letterSpacing:".08em", marginBottom:16 }}>
              📰 ACTUALITÉS &amp; RESSOURCES
            </span>
            <h1 className="bl-hero-title" style={{ fontFamily:F, fontSize:"2.6rem", fontWeight:800, color:"#fff", margin:"0 0 16px", lineHeight:1.2 }}>
              News &amp; Événements <span style={{ color:"#f97316", fontStyle:"italic" }}>BET</span>
            </h1>
            <p style={{ color:"rgba(255,255,255,.7)", fontSize:"1rem", maxWidth:500, margin:"0 auto", lineHeight:1.7 }}>
              Conseils pratiques, actualités certifications et ressources pour progresser en anglais.
            </p>
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

      {/* ── CONTENU ── */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"48px 24px" }}>

        {/* Barre de recherche */}
        <div style={{ position:"relative", maxWidth:480, marginBottom:24 }}>
          <input
            type="text"
            placeholder="Rechercher un article…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width:"100%", padding:"12px 20px 12px 46px", borderRadius:999, border:"1.5px solid #e2e8f0", fontSize:".95rem", fontFamily:F, boxSizing:"border-box", outline:"none", background:"#fff", color:"#011451" }}
          />
          <span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", fontSize:"1.1rem", opacity:.5 }}>🔍</span>
        </div>

        {/* Filtres catégories */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:36 }}>
          {categories.map(cat => {
            const isActive = activeCat === cat;
            return (
              <button key={cat} className="bl-cat-btn" onClick={() => setActiveCat(cat)} style={{
                padding:"7px 16px", borderRadius:999, border:"1px solid", fontSize:".82rem", fontWeight:700, cursor:"pointer", transition:"all .2s",
                background: isActive ? "#0c33ac" : "#fff",
                color:      isActive ? "#fff"    : "#475569",
                borderColor:isActive ? "#0c33ac" : "#e2e8f0",
              }}>
                {cat}
                {cat !== "Tous" && <span style={{ marginLeft:6, padding:"1px 6px", borderRadius:9, fontSize:10, background:isActive?"rgba(255,255,255,.2)":"#f1f5f9", color:isActive?"#fff":"#64748b" }}>
                  {posts.filter(p => p.category === cat).length}
                </span>}
              </button>
            );
          })}
        </div>

        {/* Résultats */}
        {loading ? (
          <div style={{ textAlign:"center", padding:80 }}>
            <div style={{ width:40, height:40, border:"4px solid #e2e8f0", borderTopColor:"#ff2945", borderRadius:"50%", animation:"blSpin .8s linear infinite", margin:"0 auto 16px" }} />
            <p style={{ color:"#94a3b8" }}>Chargement des articles…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:80 }}>
            <div style={{ fontSize:"3rem", marginBottom:16 }}>📭</div>
            <h3 style={{ color:"#011451", margin:"0 0 8px" }}>Aucun article trouvé</h3>
            <p style={{ color:"#64748b" }}>Essayez une autre recherche ou catégorie.</p>
            <button onClick={() => { setSearch(""); setActiveCat("Tous"); }} style={{ marginTop:16, padding:"9px 20px", background:"#0c33ac", color:"#fff", border:"none", borderRadius:999, cursor:"pointer", fontWeight:700, fontSize:".85rem" }}>
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize:".82rem", color:"#94a3b8", marginBottom:24 }}>
              {filtered.length} article{filtered.length>1?"s":""} trouvé{filtered.length>1?"s":""}
            </p>
            <div className="bl-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:28 }}>
              {filtered.map((post, idx) => {
                const c = getCat(post.category);
                return (
                  <Link key={post.id} to={`/blog/${post.id}`} className="bl-card" style={{
                    display:"flex", flexDirection:"column", textDecoration:"none",
                    background:"#fff", borderRadius:20, overflow:"hidden",
                    border:"1.5px solid #e2e8f0", transition:"transform .3s ease, box-shadow .3s ease",
                    animation:`blFadeUp .5s ease ${idx * 80}ms both`,
                  }}>
                    {/* Image / Vidéo */}
                    <div style={{ position:"relative", height:210, overflow:"hidden", background:"#011451" }}>
                      {post.image ? (
                        <img className="bl-card-img" src={post.image} alt={post.title} style={{ width:"100%", height:"100%", objectFit:"cover", transition:"transform .5s ease" }} />
                      ) : (
                        <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10 }}>
                          <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, color:"#fff" }}>▶</div>
                          <span style={{ color:"rgba(255,255,255,.5)", fontSize:".75rem", fontWeight:600 }}>Vidéo</span>
                        </div>
                      )}
                      <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,transparent 50%,rgba(15,23,42,.3))" }} />
                      {/* Overlay play sur thumbnail YouTube */}
                      {post.image?.includes("youtube") && (
                        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:50, height:50, borderRadius:"50%", background:"rgba(220,38,38,.85)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:"#fff", pointerEvents:"none" }}>▶</div>
                      )}
                      <div style={{ position:"absolute", top:13, left:13, ...c, borderRadius:999, padding:"3px 11px", fontSize:".65rem", fontWeight:800, letterSpacing:".05em" }}>
                        {post.category}
                      </div>
                      {(post.videoOnly || post.image?.includes("youtube")) && (
                        <div style={{ position:"absolute", top:13, right:13, background:"rgba(220,38,38,.9)", color:"#fff", borderRadius:999, padding:"3px 10px", fontSize:".62rem", fontWeight:800 }}>▶ VIDÉO</div>
                      )}
                    </div>
                    {/* Body */}
                    <div style={{ padding:"20px 22px 24px", flex:1, display:"flex", flexDirection:"column" }}>
                      <div style={{ fontSize:".72rem", color:"#94a3b8", fontWeight:600, marginBottom:8 }}>
                        📅 {post.date} {post.readTime && `· ⏱ ${post.readTime}`}
                      </div>
                      <h3 style={{ fontFamily:F, fontSize:"1.1rem", fontWeight:700, color:"#011451", margin:"0 0 10px", lineHeight:1.3, flex:0 }}>
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p style={{ fontSize:".84rem", color:"#64748b", lineHeight:1.65, margin:"0 0 18px", flex:1 }}>
                          {post.excerpt.slice(0,120)}{post.excerpt.length>120?"…":""}
                        </p>
                      )}
                      <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:".75rem", color:"#94a3b8" }}>✍️ {post.author}</span>
                        <span className="bl-read-more" style={{ fontSize:".78rem", fontWeight:800, color:"#0c33ac", transition:"all .2s", letterSpacing:".01em" }}>
                          Lire l'article →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default BlogList;
