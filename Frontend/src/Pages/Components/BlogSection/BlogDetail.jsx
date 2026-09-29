import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useUser } from "../../../context/UserContext";
import { supabase } from "../../../config/supabase";
import SEO from "../SEO/SEO";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";

const buildBlogEmbedUrl = (url) => {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
};

/* ─── Inject fonts & keyframes once ──────────────────── */
if (!document.querySelector("#bet-blog-detail-kf")) {
  const s = document.createElement("style");
  s.id = "bet-blog-detail-kf";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap');
    @keyframes fadeUp   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
    @keyframes scaleIn  { from{transform:scale(.97);opacity:0} to{transform:scale(1);opacity:1} }
    @keyframes spinSlow { to{transform:rotate(360deg)} }
    @keyframes barFill  { from{width:0} to{width:100%} }

    /* Reading progress bar */
    #bet-reading-bar {
      position: fixed;
      top: 0; left: 0;
      height: 3px;
      background: linear-gradient(90deg,#ff2945,#0891b2);
      z-index: 9999;
      transition: width .1s linear;
    }

    /* Prose styles (inside dangerouslySetInnerHTML) */
    .bet-prose h2, .bet-prose h3 {
      font-family: ''Montserrat', 'Segoe UI', sans-serif;
      color: #011451;
      font-weight: 400;
      line-height: 1.3;
      margin: 2rem 0 1rem;
    }
    .bet-prose h2 { font-size: 1.65rem; }
    .bet-prose h3 { font-size: 1.3rem; }
    .bet-prose p  { margin-bottom: 1.2rem; color: #334155; font-size: 1.02rem; line-height: 1.82; }
    .bet-prose ul, .bet-prose ol {
      padding-left: 1.5rem;
      margin: 1rem 0 1.4rem;
    }
    .bet-prose li { margin-bottom: .5rem; color: #334155; font-size: 1rem; line-height: 1.7; }
    .bet-prose blockquote {
      border-left: 4px solid #ff2945;
      padding: 14px 20px;
      background: #fff0f2;
      border-radius: 0 12px 12px 0;
      margin: 1.5rem 0;
      font-style: italic;
      color: #475569;
    }
    .bet-prose strong { color: #011451; font-weight: 700; }
    .bet-prose a      { color: #0891b2; font-weight: 600; text-decoration: none; border-bottom: 1px solid #bae6fd; }
    .bet-prose a:hover { color: #0369a1; }
    .bet-prose img    { width: 100%; border-radius: 14px; margin: 1.5rem 0; }
    .bet-prose hr     { border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0; }

    /* Sidebar links */
    .bet-sidebar-link:hover .bet-sidebar-title { color: #ff2945!important; }
    .bet-sidebar-link:hover                     { transform: translateX(4px)!important; }

    /* Comment input */
    .bet-comment-input:focus { border-color: #0891b2!important; outline: none; box-shadow: 0 0 0 3px rgba(8,145,178,.12)!important; }

    /* Share btn */
    .bet-share-btn:hover { opacity: .8!important; transform: translateY(-2px)!important; }

    /* Back btn */
    .bet-back-btn:hover { background: #011451!important; color: #fff!important; }

    /* Responsive */
    @media(max-width:900px){
      .bet-detail-layout { grid-template-columns:1fr!important; }
      .bet-sidebar { position:static!important; }
      .bet-hero-h1 { font-size:1.9rem!important; }
    }
    @media(max-width:600px){
      .bet-article-body { padding:24px!important; }
      .bet-hero-meta    { flex-wrap:wrap!important; gap:8px!important; }
    }
  `;
  document.head.appendChild(s);
}

/* ─── Category color map ──────────────────────────────── */
const CAT_COLORS = {
  "Conseils":       { bg: "#fff0f2", text: "#ff2945" },
  "Certifications": { bg: "#eef1ff", text: "#0c33ac" },
  "TOEIC":          { bg: "#fef3c7", text: "#d97706" },
  "TOEFL":          { bg: "#e0f2fe", text: "#0891b2" },
  "IELTS":          { bg: "#f3e8ff", text: "#7c3aed" },
  "Actualités":     { bg: "#f0fdf4", text: "#16a34a" },
  "Entreprise":     { bg: "#fef3c7", text: "#d97706" },
};
const getCat = (cat) => CAT_COLORS[cat] || { bg: "#f1f5f9", text: "#475569" };

/* ─── Reading progress ────────────────────────────────── */
function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const scrolled = el.scrollTop || document.body.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      setPct(total > 0 ? Math.round((scrolled / total) * 100) : 0);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <div id="bet-reading-bar" style={{ width: `${pct}%` }} />;
}

/* ─── Comment component ───────────────────────────────── */
function CommentsBlock({ articleId, initialComments }) {
  const { user: ctxUser } = useUser();
  const navigate  = useNavigate();
  const [text,     setText]     = useState("");
  const [comments, setComments] = useState(initialComments || []);
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [sbUser,   setSbUser]   = useState(null);

  useEffect(() => { setComments(initialComments || []); }, [initialComments]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setSbUser(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSbUser(s?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Supabase user en priorité, sinon UserContext (backend)
  const isConnected = !!(sbUser || ctxUser);
  const userName = (() => {
    if (sbUser) {
      const meta = sbUser.user_metadata || {};
      if (meta.nom && meta.prenom) return `${meta.prenom} ${meta.nom}`;
      if (meta.full_name) return meta.full_name;
      return sbUser.email?.split("@")[0] || "";
    }
    return ctxUser?.name || ctxUser?.nom || "";
  })();
  const userEmail  = sbUser?.email || ctxUser?.email || "";
  const userAvatar = sbUser?.user_metadata?.bet_avatar_url || null;

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/blog/${articleId}/commentaires`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: userName, email: userEmail || undefined, commentaire: text.trim(), avatar_url: userAvatar || undefined }),
      });
      const d = await r.json();
      if (r.ok) {
        const newComment = d.commentaire || { id: Date.now(), nom: userName, commentaire: text.trim(), avatar_url: userAvatar || null, created_at: new Date().toISOString() };
        setComments(prev => [newComment, ...prev]);
        setText("");
        setSent(true);
        setTimeout(() => setSent(false), 4000);
      }
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div style={CS.wrap}>
      {/* Header */}
      <div style={CS.header}>
        <span style={CS.icon}>💬</span>
        <h3 style={CS.title}>
          Commentaires
          {comments.length > 0 && (
            <span style={CS.count}>{comments.length}</span>
          )}
        </h3>
      </div>

      {/* Form */}
      <div style={CS.form}>
        {!isConnected ? (
          /* ── Non connecté ── */
          <div style={{ textAlign:"center", padding:"28px 20px", background:"#f8fafc", borderRadius:14, border:"1.5px dashed #cbd5e1" }}>
            <div style={{ fontSize:"2rem", marginBottom:12 }}>🔒</div>
            <p style={{ color:"#475569", fontSize:".93rem", margin:"0 0 18px", lineHeight:1.6 }}>
              Connectez-vous à votre espace pour laisser un commentaire.
            </p>
            <button
              onClick={() => navigate("/mon-espace")}
              style={{ background:"linear-gradient(135deg,#0c33ac,#0891b2)", color:"#fff", border:"none", borderRadius:999, padding:"10px 26px", fontWeight:700, fontSize:".88rem", cursor:"pointer" }}
            >
              Se connecter →
            </button>
          </div>
        ) : sent ? (
          /* ── Envoyé ── */
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"16px 20px", color:"#166534", fontSize:".9rem", lineHeight:1.6 }}>
            ✅ <strong>Commentaire publié !</strong> Il est désormais visible sur cet article.
          </div>
        ) : (
          /* ── Connecté ── */
          <>
            {/* Profil de l'utilisateur */}
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, padding:"10px 14px", background:"#eef1ff", borderRadius:10, border:"1px solid #b3c4ff" }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:"linear-gradient(135deg,#0c33ac,#0891b2)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"1rem", flexShrink:0, overflow:"hidden" }}>
                {userAvatar
                  ? <img src={userAvatar} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : userName[0]?.toUpperCase() || "?"}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:".88rem", color:"#0c33ac" }}>{userName}</div>
                {userEmail && <div style={{ fontSize:".72rem", color:"#64748b" }}>{userEmail}</div>}
              </div>
              <span style={{ marginLeft:"auto", fontSize:".7rem", color:"#16a34a", fontWeight:700, background:"#f0fdf4", padding:"3px 10px", borderRadius:999, border:"1px solid #bbf7d0" }}>✓ Connecté</span>
            </div>
            <label style={CS.label}>Votre commentaire *</label>
            <textarea className="bet-comment-input" style={CS.textarea} value={text} onChange={e => setText(e.target.value)} placeholder="Partagez votre avis sur cet article..." />
            <button
              style={{ ...CS.btn, opacity: !text.trim() ? .5 : 1 }}
              onClick={submit}
              disabled={!text.trim() || loading}
            >
              {loading
                ? <span style={{ display:"flex", alignItems:"center", gap:8 }}><span style={CS.spinner} /> Publication...</span>
                : "Publier mon commentaire →"}
            </button>
          </>
        )}
      </div>

      {/* List */}
      {comments.length === 0 ? (
        <div style={CS.empty}>
          <span style={{ fontSize: "1.8rem", display: "block", marginBottom: 8 }}>🗨️</span>
          Soyez le premier à commenter cet article.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
          {comments.map(c => (
            <div key={c.id} style={CS.item}>
              <div style={CS.itemHeader}>
                <div style={{ ...CS.avatar, overflow:"hidden", padding:0 }}>
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    : (c.nom || c.name || "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <div style={CS.commentName}>{c.nom || c.name}</div>
                  <div style={CS.commentDate}>{c.date || (c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" }) : "")}</div>
                </div>
              </div>
              <p style={CS.commentText}>{c.commentaire || c.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CS = {
  wrap: { marginTop: 52, paddingTop: 36, borderTop: "1px solid #e2e8f0" },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
  icon: { fontSize: "1.4rem" },
  title: { fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "1.4rem", color: "#011451", margin: 0, fontWeight: 400, display: "flex", alignItems: "center", gap: 10 },
  count: { background: "#ff2945", color: "#fff", borderRadius: 999, padding: "1px 9px", fontSize: ".75rem", fontWeight: 800, fontFamily: "'Montserrat', 'Segoe UI', sans-serif" },
  form: { background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "22px 24px", marginBottom: 8 },
  label: { display: "block", fontSize: ".76rem", fontWeight: 700, color: "#011451", marginBottom: 6 },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: ".9rem", fontFamily: "'Montserrat', 'Segoe UI', sans-serif", boxSizing: "border-box", transition: "all .2s", background: "#fff" },
  textarea: { width: "100%", minHeight: 110, padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: ".9rem", fontFamily: "'Montserrat', 'Segoe UI', sans-serif", resize: "vertical", marginBottom: 14, boxSizing: "border-box", transition: "all .2s", background: "#fff" },
  btn: { background: "linear-gradient(135deg,#011451,#0c33ac)", color: "#fff", border: "none", borderRadius: 999, padding: "11px 26px", fontWeight: 800, fontSize: ".88rem", cursor: "pointer", fontFamily: "'Montserrat', 'Segoe UI', sans-serif", transition: "opacity .2s" },
  spinner: { width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spinSlow .8s linear infinite", display: "inline-block" },
  empty: { textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: ".88rem", fontStyle: "italic" },
  item: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", animation: "fadeUp .4s ease" },
  itemHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 },
  avatar: { width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#0c33ac,#0891b2)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".95rem", flexShrink: 0 },
  commentName: { fontWeight: 700, fontSize: ".88rem", color: "#011451" },
  commentDate: { fontSize: ".72rem", color: "#94a3b8", marginTop: 1 },
  commentText: { fontSize: ".9rem", color: "#334155", lineHeight: 1.68, margin: 0 },
};

/* ─────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────── */
const BlogDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [current,  setCurrent]  = useState(null);
  const [others,   setOthers]   = useState([]);
  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isMuted,   setIsMuted]   = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const iframeRef = useRef(null);

  const sendYTCmd = (cmd, args = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event:"command", func:cmd, args }), "*");
  };
  // Distingue une pause voulue par l'utilisateur (bouton) d'une pause automatique au scroll -
  // seule la première doit empêcher la reprise automatique au retour dans le champ.
  const userPausedRef = useRef(false);
  const handleMute      = () => { sendYTCmd(isMuted ? "unMute" : "mute"); setIsMuted(m => !m); };
  const handleReplay    = () => { sendYTCmd("seekTo", [0, true]); sendYTCmd("playVideo"); setIsPlaying(true); userPausedRef.current = false; };
  const handlePlayPause = () => {
    sendYTCmd(isPlaying ? "pauseVideo" : "playVideo");
    userPausedRef.current = isPlaying;
    setIsPlaying(p => !p);
  };

  // Coupe la vidéo hero dès qu'elle sort de l'écran au scroll (déjà en sourdine, mais la
  // laisser tourner en boucle hors champ est inutile) - reprend seule au retour dans le
  // champ, sauf si l'utilisateur l'avait lui-même mise en pause avant de scroller.
  useEffect(() => {
    const node = iframeRef.current;
    if (!node || !current?.video_url) return;
    const estVideo = node.tagName === "VIDEO";
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (userPausedRef.current) return;
        if (estVideo) node.play?.().catch(() => {}); else sendYTCmd("playVideo");
        setIsPlaying(true);
      } else {
        if (estVideo) node.pause?.(); else sendYTCmd("pauseVideo");
        setIsPlaying(false);
      }
    }, { threshold: 0.2 });
    o.observe(node);
    return () => o.disconnect();
  }, [current?.video_url]);

  useEffect(() => {
    setLoading(true); setNotFound(false);
    fetch(`${API_BASE}/api/blog/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(data => {
        if (!data) return;
        const a = data.article;
        setCurrent({
          id:        a.id,
          title:     a.titre,
          excerpt:   a.extrait,
          content:   a.contenu,
          category:  a.categorie,
          image:     a.image_url || "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1200&q=80",
          images:    (a.images || []).filter(u => u && u.trim()),
          video_url: a.video_url || null,
          date:      a.created_at ? new Date(a.created_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" }) : "",
          readTime:  a.read_time,
          author:    a.auteur,
        });
        setComments(data.commentaires || []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));

    // Charger des articles "similaires"
    fetch(`${API_BASE}/api/blog`)
      .then(r => r.ok ? r.json() : { articles: [] })
      .then(({ articles }) => setOthers(
        (articles || []).filter(a => a.id !== id).slice(0, 5).map(a => ({
          id: a.id, title: a.titre, excerpt: a.extrait, category: a.categorie,
          image: a.image_url || "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=800&q=80",
          date: a.created_at ? new Date(a.created_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long" }) : "",
        }))
      ))
      .catch(() => {});
  }, [id]);

  // Share handler
  const handleShare = (platform) => {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(current?.title || "");
    const links = {
      twitter:  `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/shareArticle?url=${url}&title=${title}`,
      whatsapp: `https://api.whatsapp.com/send?text=${title}%20${url}`,
    };
    if (links[platform]) window.open(links[platform], "_blank");
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div style={{ fontFamily:"'Montserrat','Segoe UI',sans-serif", minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafc" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:40, height:40, border:"4px solid #e2e8f0", borderTopColor:"#ff2945", borderRadius:"50%", animation:"spinSlow .8s linear infinite", margin:"0 auto 16px" }} />
          <p style={{ color:"#64748b" }}>Chargement de l'article…</p>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (notFound || !current) {
    return (
      <div style={{ fontFamily: "'Montserrat', 'Segoe UI', sans-serif", minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "4rem 2rem", background: "#f8fafc" }}>
        <div style={{ fontSize: "3rem" }}>🔍</div>
        <h2 style={{ fontFamily: "'Montserrat', 'Segoe UI', sans-serif", fontSize: "1.8rem", color: "#011451", margin: 0 }}>Article introuvable</h2>
        <p style={{ color: "#64748b" }}>Cet article n'existe pas ou a été supprimé.</p>
        <Link to="/blog" style={{ background: "linear-gradient(135deg,#ff2945,#0c33ac)", color: "#fff", borderRadius: 999, padding: "11px 26px", fontWeight: 700, textDecoration: "none", fontSize: ".9rem" }}>
          ← Voir tous les articles
        </Link>
      </div>
    );
  }

  const cat = getCat(current.category);

  /* UN ARTICLE PEUT N'AVOIR AUCUN CORPS. Certains ne portent qu'une vidéo, désormais
     affichée dans le bandeau : sous la barre de partage, il ne restait alors qu'un trait
     de séparation suivi d'une centaine de pixels de blanc, avant les commentaires.
     On mesure donc ce qui suit réellement la barre de partage - le texte débarrassé de
     ses balises, la galerie, les tags - pour ne poser le séparateur que s'il sépare
     quelque chose. */
  const aDuTexte  = !!String(current.content || "").replace(/<[^>]*>/g, "").trim();
  const aDesImages = (current.images?.length || 0) > 0;
  const aDesTags   = (current.tags?.length || 0) > 0;
  const corpsVide  = !aDuTexte && !aDesImages && !aDesTags;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: current.title,
    description: current.excerpt || undefined,
    image: current.image || undefined,
    author: { "@type": "Person", name: current.author || "Binnie's English Training" },
    publisher: { "@type": "Organization", name: "Binnie's English Training", logo: { "@type": "ImageObject", url: "https://binniesenglish.com/assets/BIINIES-ENGLISH-LOGO.png" } },
  };

  return (
    <>
      <SEO
        title={`${current.title} | Blog BET`}
        description={current.excerpt || current.title}
        canonicalUrl={`/blog/${current.id}`}
        image={current.image}
        type="article"
        jsonLd={articleJsonLd}
      />
      <ReadingProgress />

      <div style={D.page}>

        {/* ══════════════ HERO HEADER ══════════════ */}
        <div style={D.heroWrap}>
          {/* Fond : vidéo ou image */}
          <div style={D.heroImg}>
            {current.video_url ? (() => {
              const embed = buildBlogEmbedUrl(current.video_url);
              return embed ? (
                <iframe
                  ref={iframeRef}
                  src={`${embed}&autoplay=1&mute=1&loop=1&controls=0&enablejsapi=1&playlist=${embed.split('/embed/')[1]?.split('?')[0] || ""}`}
                  width="100%" height="100%" frameBorder="0" allowFullScreen
                  allow="autoplay; encrypted-media"
                  style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }}
                  title={current.title} />
              ) : (
                <video ref={iframeRef} src={current.video_url} autoPlay muted loop playsInline
                  style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
              );
            })() : (
              <img src={current.image} alt={current.title} style={D.heroImgTag} />
            )}
            <div style={D.heroGrad} />
          </div>

          {/* Breadcrumb top-left */}
          <div style={{ position:"absolute", top:20, left:0, right:0, zIndex:4 }}>
            <div style={{ maxWidth:1180, margin:"0 auto", padding:"0 28px" }}>
              <div style={D.breadcrumb}>
                <Link to="/" style={D.breadLink}>Accueil</Link>
                <span style={{ color: "rgba(255,255,255,.4)", margin: "0 8px" }}>›</span>
                <Link to="/blog" style={D.breadLink}>Blog</Link>
                <span style={{ color: "rgba(255,255,255,.4)", margin: "0 8px" }}>›</span>
                <span style={{ color: "rgba(255,255,255,.65)", fontSize: ".78rem" }}>{current.title?.slice(0, 32)}…</span>
              </div>
            </div>
          </div>

          {/* Contenu hero - ancré en bas */}
          <div style={D.heroContent}>
            <div style={D.heroInner}>
              {/* Category */}
              <div style={{ ...D.heroTag, background: cat.bg, color: cat.text }}>
                {current.video_url ? "🎬 " : ""}{current.category}
              </div>

              {/* Title */}
              <h1 className="bet-hero-h1" style={D.heroH1}>{current.title}</h1>

              {/* Meta */}
              <div className="bet-hero-meta" style={D.heroMeta}>
                <span style={D.metaItem}>📅 {current.date}</span>
                {current.readTime && <span style={D.metaItem}>⏱ {current.readTime}</span>}
                {current.author && <span style={D.metaItem}>✍️ {current.author}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════ BARRE CONTRÔLES VIDÉO ══════════════ */}
        {current.video_url && (
          <div style={{ background:"#0a1128", padding:"14px 32px", display:"flex", justifyContent:"center", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <button
              onClick={handlePlayPause}
              style={{ background:"rgba(255,255,255,.12)", border:"1.5px solid rgba(255,255,255,.25)", color:"#fff", borderRadius:999, padding:"9px 22px", fontWeight:700, fontSize:".9rem", cursor:"pointer", fontFamily:"'Montserrat','Segoe UI',sans-serif", display:"flex", alignItems:"center", gap:7, transition:"background .2s" }}
              onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.22)"}
              onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,.12)"}
            >
              {isPlaying ? "⏸ Pause" : "▶ Jouer"}
            </button>
            <button
              onClick={handleReplay}
              style={{ background:"rgba(255,255,255,.12)", border:"1.5px solid rgba(255,255,255,.25)", color:"#fff", borderRadius:999, padding:"9px 22px", fontWeight:700, fontSize:".9rem", cursor:"pointer", fontFamily:"'Montserrat','Segoe UI',sans-serif", display:"flex", alignItems:"center", gap:7, transition:"background .2s" }}
              onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.22)"}
              onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,.12)"}
            >
              ↺ Rejouer
            </button>
            <button
              onClick={handleMute}
              style={{ background:"rgba(255,255,255,.12)", border:"1.5px solid rgba(255,255,255,.25)", color:"#fff", borderRadius:999, padding:"9px 22px", fontWeight:700, fontSize:".9rem", cursor:"pointer", fontFamily:"'Montserrat','Segoe UI',sans-serif", display:"flex", alignItems:"center", gap:7, transition:"background .2s" }}
              onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.22)"}
              onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,.12)"}
            >
              {isMuted ? "🔊 Son" : "🔇 Muet"}
            </button>
          </div>
        )}

        {/* ══════════════ BODY ══════════════ */}
        <div style={D.bodyWrap}>
          <div className="bet-detail-layout" style={D.layout}>

            {/* ── Colonne article ── */}
            <main style={D.main}>
              {/* Article card */}
              <article style={D.articleCard}>

                {/* Share bar */}
                <div style={corpsVide
                  ? { ...D.shareBar, marginBottom: 0, paddingBottom: 0, borderBottom: "none" }
                  : D.shareBar}>
                  <span style={D.shareLabel}>Partager :</span>
                  {[
                    { id: "twitter",  icon: "𝕏",  bg: "#000" },
                    { id: "facebook", icon: "f",   bg: "#1877f2" },
                    { id: "linkedin", icon: "in",  bg: "#0077b5" },
                    { id: "whatsapp", icon: "✉",   bg: "#25d366" },
                  ].map(sh => (
                    <button
                      key={sh.id}
                      className="bet-share-btn"
                      style={{ ...D.shareBtn, background: sh.bg }}
                      onClick={() => handleShare(sh.id)}
                      title={`Partager sur ${sh.id}`}
                    >
                      {sh.icon}
                    </button>
                  ))}
                </div>

                {/* Prose content */}
                {aDuTexte && (
                  <div
                    className="bet-article-body bet-prose"
                    style={D.prose}
                    dangerouslySetInnerHTML={{ __html: current.content }}
                  />
                )}

                {/* LA VIDÉO NE S'AFFICHE PLUS ICI.
                    Elle apparaissait deux fois sur la page : en bandeau tout en haut, et
                    une seconde fois au milieu de l'article. Le lecteur du bas n'apportait
                    rien - le bandeau porte déjà la même vidéo, avec sa barre « Pause /
                    Rejouer / Son » juste en dessous, donc de quoi l'écouter, la mettre en
                    pause et la reprendre. Voir deux fois le même contenu à quelques lignes
                    d'intervalle donne surtout l'impression d'une page mal montée. */}

                {/* Galerie images du contenu */}
                {current.images?.length > 0 && (
                  <div style={{ marginTop: 32, marginBottom: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: current.images.length === 1 ? "1fr" : "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
                      {current.images.map((src, idx) => (
                        <div key={idx} style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.1)" }}>
                          <img
                            src={src}
                            alt={`Illustration ${idx + 1}`}
                            style={{ width: "100%", height: current.images.length === 1 ? 360 : 220, objectFit: "cover", display: "block", transition: "transform .4s ease", cursor: "pointer" }}
                            onMouseEnter={e => e.currentTarget.style.transform = "scale(1.03)"}
                            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {current.tags?.length > 0 && (
                  <div style={D.tagsRow}>
                    {current.tags.map((t, i) => (
                      <span key={i} style={D.tag}># {t}</span>
                    ))}
                  </div>
                )}

                {/* Comments */}
                <CommentsBlock articleId={current.id} initialComments={comments} />

                {/* Navigation prev/next */}
                <div style={D.navRow}>
                  <button
                    className="bet-back-btn"
                    style={D.backBtn}
                    onClick={() => navigate(-1)}
                  >
                    ← Retour
                  </button>
                  <Link to="/blog/1" style={D.allPostsLink}>
                    Tous les articles →
                  </Link>
                </div>
              </article>
            </main>

            {/* ── Sidebar ── */}
            <aside className="bet-sidebar" style={D.sidebar}>

              {/* CTA test gratuit */}
              <div style={D.sideWidget}>
                <div style={D.sideCtaGrad} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ fontSize: "1.6rem", marginBottom: 10 }}>🧪</div>
                  <h4 style={D.sideCtaTitle}>Évaluez votre niveau</h4>
                  <p style={D.sideCtaText}>Test CECRL officiel - résultats en 10 minutes, gratuit et sans engagement.</p>
                  <Link to="/test-niveau">
                    <button style={D.sideCtaBtn}>Faire le test →</button>
                  </Link>
                </div>
              </div>

              {/* Articles récents */}
              <div style={D.sideBlock}>
                <div style={D.sideBlockHeader}>
                  <h3 style={D.sideBlockTitle}>Articles récents</h3>
                  <div style={D.sideBlockLine} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {others.map(post => {
                    const rc = getCat(post.category);
                    return (
                      <Link
                        key={post.id}
                        to={`/blog/${post.id}`}
                        className="bet-sidebar-link"
                        style={D.sidePost}
                      >
                        <div style={D.sidePostImgWrap}>
                          <img src={post.image} alt={post.title} style={D.sidePostImg} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ ...D.sidePostCat, background: rc.bg, color: rc.text }}>{post.category}</span>
                          <h4 className="bet-sidebar-title" style={D.sidePostTitle}>{post.title}</h4>
                          <span style={D.sidePostDate}>{post.date}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Programmes CTA */}
              <div style={D.sideBlock}>
                <div style={D.sideBlockHeader}>
                  <h3 style={D.sideBlockTitle}>Nos formations</h3>
                  <div style={D.sideBlockLine} />
                </div>
                {[
                  { title: "TOEIC", sub: "Score 700+ garanti", color: "#d97706" },
                  { title: "TOEFL iBT", sub: "Accès université", color: "#0891b2" },
                  { title: "IELTS Academic", sub: "Band 7.0 garanti", color: "#7c3aed" },
                  { title: "Anglais Pro", sub: "Dès 35 000 FCFA", color: "#ff2945" },
                ].map((prog, i) => (
                  <Link key={i} to="/#programmes" style={{ textDecoration: "none" }}>
                    <div style={D.sideProgCard}>
                      <div style={{ ...D.sideProgDot, background: prog.color }} />
                      <div>
                        <div style={D.sideProgTitle}>{prog.title}</div>
                        <div style={D.sideProgSub}>{prog.sub}</div>
                      </div>
                      <span style={{ ...D.sideProgArrow, color: prog.color }}>→</span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Cabinet agréé */}
              <div style={D.sideAgreee}>
                <span style={{ fontSize: "1.4rem" }}>🏛️</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: ".82rem", color: "#011451", marginBottom: 3 }}>Cabinet agréé par l'État</div>
                  <div style={{ fontSize: ".75rem", color: "#64748b", lineHeight: 1.5 }}>Certifications officiellement reconnues en Côte d'Ivoire.</div>
                </div>
              </div>

            </aside>
          </div>
        </div>

      </div>
    </>
  );
};

/* ─────────────────────────────────────────────────────────
   STYLES
───────────────────────────────────────────────────────── */
const F  = "'Montserrat', 'Segoe UI', sans-serif";
const FD = "'Montserrat', 'Segoe UI', sans-serif";

const D = {
  page: { fontFamily: F, color: "#011451", background: "#f8fafc", minHeight: "100vh" },

  /* Hero */
  heroWrap: { position: "relative", height: "clamp(420px,56.25vw,600px)", overflow: "hidden" },
  heroImg: { position: "absolute", inset: 0 },
  heroImgTag: { width: "100%", height: "100%", objectFit: "cover" },
  heroGrad: { position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,20,50,.3) 0%,rgba(10,20,50,.82) 100%)" },
  heroContent: { position: "absolute", inset: 0, display: "flex", alignItems: "flex-end" },
  heroInner: { maxWidth: 860, margin: "0 auto", width: "100%", padding: "0 24px 44px", animation: "fadeUp .8s ease .1s both" },
  breadcrumb: { display: "flex", alignItems: "center", marginBottom: 14 },
  breadLink: { color: "rgba(255,255,255,.6)", fontSize: ".78rem", textDecoration: "none", transition: "color .2s", fontWeight: 500 },
  heroTag: { display: "inline-block", borderRadius: 999, padding: "4px 14px", fontSize: ".68rem", fontWeight: 800, letterSpacing: ".06em", marginBottom: 14 },
  heroH1: { fontFamily: FD, fontSize: "clamp(1.7rem,4.5vw,2.8rem)", color: "#fff", lineHeight: 1.18, margin: "0 0 18px", fontWeight: 400 },
  heroMeta: { display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" },
  metaItem: { fontSize: ".8rem", color: "rgba(255,255,255,.72)", fontWeight: 600 },

  /* Body layout */
  bodyWrap: { maxWidth: 1180, margin: "0 auto", padding: "48px 24px 80px" },
  layout: { display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" },

  /* Article card */
  main: {},
  articleCard: { background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,.06)", border: "1px solid #e2e8f0", padding: "36px 44px", animation: "fadeUp .6s ease both" },

  /* Share bar */
  shareBar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" },
  shareLabel: { fontSize: ".78rem", fontWeight: 700, color: "#64748b", marginRight: 4 },
  shareBtn: { width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer", color: "#fff", fontWeight: 800, fontSize: ".78rem", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", flexShrink: 0 },

  /* Prose */
  prose: { fontSize: "1.02rem", lineHeight: 1.82, color: "#334155", paddingBottom: 8 },

  /* Tags */
  tagsRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 32, paddingTop: 24, borderTop: "1px solid #f1f5f9" },
  tag: { background: "#f1f5f9", color: "#475569", borderRadius: 999, padding: "4px 14px", fontSize: ".72rem", fontWeight: 700 },

  /* Nav row */
  navRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 36, paddingTop: 24, borderTop: "1px solid #f1f5f9" },
  backBtn: { background: "#f1f5f9", color: "#011451", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: ".85rem", cursor: "pointer", fontFamily: F, transition: "all .2s" },
  allPostsLink: { color: "#0c33ac", fontWeight: 800, fontSize: ".88rem", textDecoration: "none", transition: "color .2s" },

  /* Sidebar */
  sidebar: { display: "flex", flexDirection: "column", gap: 22, position: "sticky", top: 100 },
  sideBlock: { background: "#fff", borderRadius: 18, padding: "22px 20px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 12px rgba(0,0,0,.05)" },
  sideBlockHeader: { marginBottom: 18 },
  sideBlockTitle: { fontFamily: FD, fontSize: "1.1rem", color: "#011451", margin: "0 0 8px", fontWeight: 400 },
  sideBlockLine: { width: 32, height: 2, borderRadius: 2, background: "linear-gradient(90deg,#ff2945,#0891b2)" },

  /* Side CTA */
  sideWidget: { background: "linear-gradient(135deg,#011451,#0c33ac)", borderRadius: 18, padding: "24px 22px", position: "relative", overflow: "hidden" },
  sideCtaGrad: { position: "absolute", width: 120, height: 120, borderRadius: "50%", background: "rgba(8,145,178,.2)", top: -30, right: -30, pointerEvents: "none" },
  sideCtaTitle: { fontFamily: FD, fontSize: "1.15rem", color: "#fff", margin: "0 0 8px", fontWeight: 400 },
  sideCtaText: { fontSize: ".82rem", color: "rgba(255,255,255,.65)", lineHeight: 1.6, margin: "0 0 16px" },
  sideCtaBtn: { background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#000", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 800, fontSize: ".84rem", cursor: "pointer", fontFamily: F, transition: "opacity .2s", width: "100%" },

  /* Side posts */
  sidePost: { display: "flex", gap: 12, alignItems: "flex-start", textDecoration: "none", transition: "transform .2s ease" },
  sidePostImgWrap: { width: 68, height: 68, borderRadius: 12, overflow: "hidden", flexShrink: 0 },
  sidePostImg: { width: "100%", height: "100%", objectFit: "cover" },
  sidePostCat: { display: "inline-block", borderRadius: 999, padding: "2px 8px", fontSize: ".6rem", fontWeight: 800, letterSpacing: ".05em", marginBottom: 4 },
  sidePostTitle: { fontSize: ".84rem", fontWeight: 700, color: "#011451", margin: "0 0 4px", lineHeight: 1.35, transition: "color .2s" },
  sidePostDate: { fontSize: ".7rem", color: "#94a3b8" },

  /* Side prog */
  sideProgCard: { display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 8, transition: "all .2s", cursor: "pointer" },
  sideProgDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  sideProgTitle: { fontWeight: 800, fontSize: ".85rem", color: "#011451" },
  sideProgSub: { fontSize: ".72rem", color: "#64748b", marginTop: 1 },
  sideProgArrow: { marginLeft: "auto", fontWeight: 800, fontSize: "1rem" },

  /* Cabinet */
  sideAgreee: { display: "flex", gap: 12, alignItems: "flex-start", background: "#eef1ff", border: "1px solid #b3c4ff", borderRadius: 14, padding: "14px 16px" },
};

export default BlogDetail;