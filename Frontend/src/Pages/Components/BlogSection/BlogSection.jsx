import React, { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";

const buildEmbedUrl = (url) => {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1&controls=0&mute=1&autoplay=1&loop=1&playlist=${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1&muted=1&loop=1&background=1`;
  return null; // fichier direct (MP4)
};

/* ─── Inject fonts & keyframes once ──────────────────── */
if (!document.querySelector("#bet-blog-kf")) {
  const s = document.createElement("style");
  s.id = "bet-blog-kf";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap');
    @keyframes fadeUp   { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn   { from{opacity:0} to{opacity:1} }

    .bet-blog-hero:hover .bet-blog-hero-img  { transform:scale(1.04)!important; }
    .bet-blog-hero:hover                     { box-shadow:0 32px 72px rgba(0,0,0,.18)!important; }
    .bet-blog-hero:hover .bet-blog-hero-read { background:#ff2945!important; color:#fff!important; padding-right:22px!important; }

    .bet-blog-card:hover                     { transform:translateY(-6px)!important; box-shadow:0 24px 56px rgba(0,0,0,.13)!important; }
    .bet-blog-card:hover .bet-blog-card-img  { transform:scale(1.06)!important; }
    .bet-blog-card:hover .bet-blog-card-read { letter-spacing:.06em!important; color:#ff2945!important; }

    .bet-blog-view-all:hover { background:#ff2945!important; color:#fff!important; border-color:#ff2945!important; transform:translateY(-2px)!important; }

    @media(max-width:900px){
      .bet-blog-layout { grid-template-columns:1fr!important; }
      .bet-blog-secondary { grid-template-columns:1fr 1fr!important; }
    }
    @media(max-width:600px){
      .bet-blog-secondary { grid-template-columns:1fr!important; }
      .bet-blog-hero-body { padding:24px!important; }
    }
  `;
  document.head.appendChild(s);
}

/* ─── IntersectionObserver hook ──────────────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true); }, { threshold });
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, [threshold]);
  return [ref, v];
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

const getCatStyle = (cat) =>
  CAT_COLORS[cat] || { bg: "#f1f5f9", text: "#475569" };

/* ── Miniature vidéo ou photo ────────────────────────── */
const BlogMediaThumb = ({ video_url, image, title, className, style }) => {
  const embedUrl = video_url ? buildEmbedUrl(video_url) : null;
  const isDirectVideo = video_url && !embedUrl;
  const videoRef = useRef(null);

  // Coupe la lecture dès que la miniature sort de l'écran (scroll) - la vidéo est déjà en
  // sourdine, mais la laisser tourner en boucle hors champ reste inutile et distrayant.
  useEffect(() => {
    if (!isDirectVideo || !videoRef.current) return;
    const o = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) videoRef.current?.play().catch(() => {});
      else videoRef.current?.pause();
    }, { threshold: 0.25 });
    o.observe(videoRef.current);
    return () => o.disconnect();
  }, [isDirectVideo]);

  if (embedUrl) {
    return (
      <iframe
        className={className}
        src={embedUrl}
        title={title}
        frameBorder="0"
        allow="autoplay; encrypted-media"
        allowFullScreen
        style={{ ...style, pointerEvents:"none", border:"none" }}
      />
    );
  }
  if (isDirectVideo) {
    return (
      <video
        ref={videoRef}
        className={className}
        src={video_url}
        autoPlay muted loop playsInline
        style={{ ...style, objectFit:"cover" }}
      />
    );
  }
  return <img className={className} src={image} alt={title} style={style} />;
};

/* ─────────────────────────────────────────────────────── */
const BlogSection = () => {
  const [ref, inView] = useInView();
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const [nlEmail, setNlEmail] = useState("");
  const [nlStatus, setNlStatus] = useState(null); // "loading" | "ok" | "already" | "error"

  const handleNlSubmit = async (e) => {
    e.preventDefault();
    if (!nlEmail.includes("@")) return;
    setNlStatus("loading");
    try {
      const r = await fetch(`${API_BASE}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nlEmail }),
      });
      if (r.status === 409) { setNlStatus("already"); return; }
      if (!r.ok) throw new Error();
      setNlStatus("ok");
      setNlEmail("");
    } catch {
      setNlStatus("error");
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/blog`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(({ articles }) => setPosts(
        (articles || []).map(a => ({
          id:        a.id,
          title:     a.titre,
          excerpt:   a.extrait,
          category:  a.categorie,
          image:     a.image_url || "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=800&q=80",
          video_url: a.video_url || null,
          date:      a.created_at ? new Date(a.created_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" }) : "",
          readTime:  a.read_time,
          author:    a.auteur,
        }))
      ))
      .catch(() => {})
      .finally(() => setLoadingPosts(false));
  }, []);

  const latest = posts.slice(0, 3);
  const hero = latest[0];
  const secondary = latest.slice(1);
  const heroCat = hero ? getCatStyle(hero.category) : {};

  return (
    <section ref={ref} style={S.section}>
      {/* Fond décoratif */}
      <div style={S.bg} />

      {/* Skeleton loading */}
      {loadingPosts && (
        <div style={{ ...S.inner, textAlign: "center", padding: "60px 24px" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#ff2945", borderRadius: "50%", animation: "fadeUp .8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#94a3b8", fontSize: ".9rem" }}>Chargement des articles…</p>
        </div>
      )}

      {!loadingPosts && hero && (
      <div style={S.inner}>

        {/* ── En-tête ── */}
        <div style={{
          ...S.header,
          opacity: inView ? 1 : 0,
          transform: inView ? "none" : "translateY(20px)",
          transition: "all .6s ease",
        }}>
          <span style={S.badge}>ACTUALITÉS &amp; RESSOURCES</span>
          <h2 style={S.h2}>
            News &amp; Événements
            <span style={S.h2Accent}> BET</span>
          </h2>
          <div style={S.line} />
          <p style={S.sub}>
            Conseils, actualités certifications et ressources pour progresser en anglais.
          </p>

          {/* ── Newsletter inline ── */}
          <div style={S.nlBox}>
            {nlStatus === "ok" ? (
              <p style={S.nlConfirm}>✅ Merci ! Vous êtes bien inscrit(e) à nos newsletters.</p>
            ) : (
              <form onSubmit={handleNlSubmit} style={S.nlForm}>
                <input
                  type="email"
                  required
                  placeholder="Votre adresse e-mail…"
                  value={nlEmail}
                  onChange={e => { setNlEmail(e.target.value); setNlStatus(null); }}
                  style={S.nlInput}
                />
                <button
                  type="submit"
                  disabled={nlStatus === "loading"}
                  style={S.nlBtn}
                >
                  {nlStatus === "loading" ? "…" : "S'abonner"}
                </button>
              </form>
            )}
            {nlStatus === "already" && (
              <p style={S.nlWarn}>⚠️ Cet e-mail est déjà inscrit.</p>
            )}
            {nlStatus === "error" && (
              <p style={S.nlWarn}>❌ Une erreur est survenue, réessayez.</p>
            )}
            <p style={S.nlHint}>📩 Recevez nos dernières actualités et conseils directement dans votre boîte mail.</p>
          </div>
        </div>

        {/* ── Layout grille ── */}
        <div
          className="bet-blog-layout"
          style={{
            ...S.layout,
            opacity: inView ? 1 : 0,
            transition: "opacity .7s ease .15s",
          }}
        >
          {/* ── Article héros (gauche, grand) ── */}
          <Link
            to={`/blog/${hero.id}`}
            className="bet-blog-hero"
            style={S.heroCard}
          >
            <div style={S.heroImgWrap}>
              <BlogMediaThumb
                className="bet-blog-hero-img"
                video_url={hero.video_url}
                image={hero.image}
                title={hero.title}
                style={S.heroImg}
              />
              <div style={S.heroOverlay} />
              {/* Category tag */}
              <div style={{ ...S.catTag, background: heroCat.bg, color: heroCat.text }}>
                {hero.video_url ? "🎬 " : ""}{hero.category}
              </div>
              {/* Numéro éditorial */}
              <div style={S.heroNum}>01</div>
            </div>

            <div className="bet-blog-hero-body" style={S.heroBody}>
              <div style={S.heroMeta}>
                <span style={S.heroDate}>📅 {hero.date}</span>
                {hero.readTime && (
                  <span style={S.heroDate}>⏱ {hero.readTime}</span>
                )}
              </div>
              <h3 style={S.heroTitle}>{hero.title}</h3>
              <p style={S.heroExcerpt}>{hero.excerpt}</p>
              <div
                className="bet-blog-hero-read"
                style={S.heroRead}
              >
                Lire l'article →
              </div>
            </div>
          </Link>

          {/* ── Articles secondaires (droite, empilés) ── */}
          <div className="bet-blog-secondary" style={S.secondary}>
            {secondary.map((post, idx) => {
              const c = getCatStyle(post.category);
              return (
                <Link
                  key={post.id}
                  to={`/blog/${post.id}`}
                  className="bet-blog-card"
                  style={{
                    ...S.card,
                    animationDelay: `${(idx + 1) * 120}ms`,
                  }}
                >
                  <div style={S.cardImgWrap}>
                    <BlogMediaThumb
                      className="bet-blog-card-img"
                      video_url={post.video_url}
                      image={post.image}
                      title={post.title}
                      style={S.cardImg}
                    />
                    <div style={{ ...S.catTag, ...S.catTagCard, background: c.bg, color: c.text }}>
                      {post.video_url ? "🎬 " : ""}{post.category}
                    </div>
                    <div style={S.cardNum}>0{idx + 2}</div>
                  </div>

                  <div style={S.cardBody}>
                    <span style={S.cardDate}>{post.date}</span>
                    <h3 style={S.cardTitle}>{post.title}</h3>
                    <p style={S.cardExcerpt}>{post.excerpt?.slice(0, 100)}…</p>
                    <div style={S.cardFooter}>
                      <span
                        className="bet-blog-card-read"
                        style={S.cardRead}
                      >
                        Lire la suite →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── CTA Voir tous ── */}
        <div style={{
          textAlign: "center",
          marginTop: 52,
          opacity: inView ? 1 : 0,
          transition: "opacity .6s ease .4s",
        }}>
          <Link to="/blog">
            <button
              className="bet-blog-view-all"
              style={S.viewAll}
            >
              Voir tous les articles →
            </button>
          </Link>
        </div>
      </div>
      )}
    </section>
  );
};

/* ─────────────────────────────────────────────────────────
   STYLES
───────────────────────────────────────────────────────── */
const F = "'Montserrat', 'Segoe UI', sans-serif";
const FD = "'Montserrat', 'Segoe UI', sans-serif";

const S = {
  section: {
    padding: "88px 0 96px",
    background: "#f8fafc",
    position: "relative",
    overflow: "hidden",
    fontFamily: F,
  },
  bg: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(ellipse 70% 50% at 80% 30%, rgba(8,145,178,.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  inner: { maxWidth: 1180, margin: "0 auto", padding: "0 24px" },

  /* Header */
  header: { textAlign: "center", marginBottom: 56 },
  badge: {
    display: "inline-block",
    background: "#fff0f2",
    color: "#ff2945",
    border: "1px solid #ffb3bc",
    borderRadius: 999,
    padding: "5px 18px",
    fontSize: ".72rem",
    fontWeight: 800,
    letterSpacing: ".08em",
    marginBottom: 16,
  },
  h2: {
    fontFamily: FD,
    fontSize: "clamp(1.9rem,4vw,2.8rem)",
    fontWeight: 400,
    color: "#011451",
    margin: "0 0 16px",
    lineHeight: 1.15,
  },
  h2Accent: { color: "#ff2945", fontStyle: "italic" },
  line: {
    width: 52,
    height: 3,
    borderRadius: 2,
    background: "linear-gradient(90deg,#ff2945,#0891b2)",
    margin: "0 auto 18px",
  },
  sub: {
    fontSize: ".96rem",
    color: "#64748b",
    lineHeight: 1.7,
    maxWidth: 480,
    margin: "0 auto",
  },

  /* Layout */
  layout: {
    display: "grid",
    gridTemplateColumns: "1.35fr 1fr",
    gap: 28,
    alignItems: "start",
  },

  /* Hero card */
  heroCard: {
    display: "block",
    textDecoration: "none",
    borderRadius: 20,
    overflow: "hidden",
    background: "#fff",
    border: "1.5px solid #e2e8f0",
    transition: "box-shadow .3s ease",
    cursor: "pointer",
  },
  heroImgWrap: {
    position: "relative",
    height: 300,
    overflow: "hidden",
  },
  heroImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "transform .5s ease",
  },
  heroOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(180deg,transparent 40%,rgba(15,23,42,.35))",
  },
  heroNum: {
    position: "absolute",
    top: 14,
    right: 14,
    fontFamily: FD,
    fontSize: "2.8rem",
    color: "rgba(255,255,255,.18)",
    fontStyle: "italic",
    lineHeight: 1,
    pointerEvents: "none",
  },
  heroBody: {
    padding: "28px 32px 32px",
  },
  heroMeta: {
    display: "flex",
    gap: 16,
    marginBottom: 12,
  },
  heroDate: {
    fontSize: ".74rem",
    color: "#94a3b8",
    fontWeight: 600,
  },
  heroTitle: {
    fontFamily: FD,
    fontSize: "1.55rem",
    color: "#011451",
    margin: "0 0 12px",
    fontWeight: 400,
    lineHeight: 1.28,
  },
  heroExcerpt: {
    fontSize: ".9rem",
    color: "#475569",
    lineHeight: 1.68,
    margin: "0 0 24px",
  },
  heroRead: {
    display: "inline-block",
    background: "#f1f5f9",
    color: "#0c33ac",
    borderRadius: 999,
    padding: "9px 20px",
    fontSize: ".82rem",
    fontWeight: 800,
    transition: "all .25s ease",
    letterSpacing: ".02em",
  },

  /* Secondary column */
  secondary: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 20,
  },

  /* Small card */
  card: {
    textDecoration: "none",
    background: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    border: "1.5px solid #e2e8f0",
    transition: "transform .3s ease, box-shadow .3s ease",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
  },
  cardImgWrap: {
    position: "relative",
    height: 180,
    overflow: "hidden",
    flexShrink: 0,
  },
  cardImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "transform .5s ease",
  },
  cardNum: {
    position: "absolute",
    top: 12,
    right: 12,
    fontFamily: FD,
    fontSize: "2rem",
    color: "rgba(255,255,255,.2)",
    fontStyle: "italic",
    lineHeight: 1,
    pointerEvents: "none",
  },
  cardBody: {
    padding: "18px 20px 22px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  cardDate: {
    fontSize: ".72rem",
    color: "#94a3b8",
    fontWeight: 600,
    display: "block",
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: FD,
    fontSize: "1.1rem",
    color: "#011451",
    margin: "0 0 10px",
    fontWeight: 400,
    lineHeight: 1.3,
  },
  cardExcerpt: {
    fontSize: ".82rem",
    color: "#64748b",
    lineHeight: 1.6,
    margin: "0 0 16px",
    flex: 1,
  },
  cardFooter: {
    borderTop: "1px solid #f1f5f9",
    paddingTop: 12,
    marginTop: "auto",
  },
  cardRead: {
    fontSize: ".78rem",
    fontWeight: 800,
    color: "#0c33ac",
    letterSpacing: ".01em",
    transition: "all .2s ease",
  },

  /* Category tag */
  catTag: {
    position: "absolute",
    top: 13,
    left: 13,
    borderRadius: 999,
    padding: "3px 11px",
    fontSize: ".65rem",
    fontWeight: 800,
    letterSpacing: ".06em",
  },
  catTagCard: {
    top: 11,
    left: 11,
  },

  /* Newsletter */
  nlBox: {
    marginTop: 28,
    background: "linear-gradient(135deg,#fff0f2 0%,#eef1ff 100%)",
    border: "1.5px solid #ffd6db",
    borderRadius: 16,
    padding: "22px 28px",
    maxWidth: 520,
    margin: "28px auto 0",
  },
  nlForm: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  nlInput: {
    flex: 1,
    minWidth: 200,
    padding: "11px 16px",
    border: "1.5px solid #e2e8f0",
    borderRadius: 999,
    fontSize: ".88rem",
    fontFamily: F,
    outline: "none",
    background: "#fff",
    color: "#011451",
  },
  nlBtn: {
    padding: "11px 24px",
    background: "#ff2945",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    fontFamily: F,
    fontSize: ".88rem",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background .2s ease",
  },
  nlHint: {
    fontSize: ".76rem",
    color: "#94a3b8",
    margin: "10px 0 0",
    textAlign: "center",
  },
  nlConfirm: {
    fontSize: ".9rem",
    fontWeight: 700,
    color: "#16a34a",
    textAlign: "center",
    margin: 0,
  },
  nlWarn: {
    fontSize: ".8rem",
    color: "#dc2626",
    margin: "6px 0 0",
    textAlign: "center",
  },

  /* View all */
  viewAll: {
    background: "transparent",
    color: "#0c33ac",
    border: "2px solid #0c33ac",
    borderRadius: 999,
    padding: "12px 32px",
    fontSize: ".9rem",
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: F,
    transition: "all .25s ease",
    letterSpacing: ".02em",
  },
};

export default BlogSection;