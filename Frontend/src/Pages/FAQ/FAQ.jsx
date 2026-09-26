import React, { useState, useEffect } from "react";
import Footer from "../Footer/Footer";
import SEO from "../Components/SEO/SEO";
import { lienWhatsApp } from "../../utils/numerosContact";

const API_URL = process.env.REACT_APP_API_URL || "";
const LS_KEY  = "bet_contact_config";

if (!document.querySelector("#bet-faq-fonts")) {
  const l = document.createElement("link"); l.id = "bet-faq-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap";
  document.head.appendChild(l);
}
if (!document.querySelector("#bet-faq-kf")) {
  const s = document.createElement("style"); s.id = "bet-faq-kf";
  s.textContent = `
    @keyframes faqFU  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
    @keyframes faqSI  { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
    @keyframes faqSlide { from{opacity:0;max-height:0} to{opacity:1;max-height:800px} }
    .faq-item-open .faq-answer { animation: faqSlide .3s ease forwards; }
    .faq-card:hover { box-shadow:0 8px 32px rgba(30,58,138,.12)!important; transform:translateY(-2px)!important; }
    .faq-cat-btn:hover { background:#0c33ac!important; color:#fff!important; }
    @media(max-width:768px){
      .faq-hero-title { font-size:1.8rem!important; }
      .faq-cats { flex-wrap:wrap!important; gap:8px!important; }
    }
    @media(max-width:480px){
      .faq-hero-title { font-size:1.4rem!important; }
      .faq-hero-sub   { font-size:.95rem!important; }
    }
  `;
  document.head.appendChild(s);
}

// Icône/couleurs par catégorie - purement présentation (pas stocké en base, faq_items
// n'a que question/reponse/categorie/ordre/actif). Catégorie non listée ici → repli neutre.
const CATEGORY_META = {
  "Cours & formations":         { icon: "📚", color: "#eef1ff", accent: "#0c33ac" },
  "Certifications":              { icon: "🏆", color: "#fef3c7", accent: "#d97706" },
  "Tarifs & paiement":           { icon: "💳", color: "#f0fdf4", accent: "#16a34a" },
  "Nos centres":                 { icon: "📍", color: "#fff0f2", accent: "#ff2945" },
  "Entreprises":                 { icon: "💼", color: "#f3e8ff", accent: "#7c3aed" },
  "Compte & espace personnel":   { icon: "👤", color: "#e0f2fe", accent: "#0891b2" },
};
const DEFAULT_META = { icon: "❓", color: "#f1f5f9", accent: "#475569" };

const FAQ = () => {
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [openItems, setOpenItems] = useState({});
  const [search, setSearch] = useState("");
  const [faqData, setFaqData] = useState(null); // null = pas encore chargé
  const [contactConfig, setContactConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { return {}; }
  });

  useEffect(() => {
    fetch(`${API_URL}/api/config-contact`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setContactConfig(d); localStorage.setItem(LS_KEY, JSON.stringify(d)); } })
      .catch(() => {});
    const handler = (e) => {
      if (e.key === LS_KEY && e.newValue) {
        try { setContactConfig(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/faq/publiques`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => {
        const byCategorie = {};
        (d.items || []).forEach(item => {
          const cat = item.categorie || "Général";
          if (!byCategorie[cat]) byCategorie[cat] = [];
          byCategorie[cat].push({ q: item.question, a: item.reponse });
        });
        const grouped = Object.entries(byCategorie).map(([category, items]) => ({
          category,
          ...(CATEGORY_META[category] || DEFAULT_META),
          items,
        }));
        setFaqData(grouped);
      })
      .catch(() => setFaqData([]));
  }, []);

  const categories = ["Tous", ...(faqData || []).map(c => c.category)];

  const filtered = (faqData || [])
    .filter(c => activeCategory === "Tous" || c.category === activeCategory)
    .map(c => ({
      ...c,
      items: c.items.filter(
        item =>
          !search.trim() ||
          item.q.toLowerCase().includes(search.toLowerCase()) ||
          item.a.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter(c => c.items.length > 0);

  const toggle = (catIdx, itemIdx) => {
    const key = `${catIdx}-${itemIdx}`;
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalCount = (faqData || []).reduce((acc, c) => acc + c.items.length, 0);

  const faqJsonLd = totalCount > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (faqData || []).flatMap(c => c.items).map(item => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  } : null;

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", background: "#f8fafc", minHeight: "100vh" }}>
      <SEO
        title="FAQ - Questions fréquentes sur nos formations | BET"
        description="Toutes les réponses à vos questions sur les cours d'anglais, certifications TOEIC/TOEFL/IELTS, tarifs, inscription et espace apprenant chez Binnie's English Training."
        canonicalUrl="/faq"
        jsonLd={faqJsonLd}
      />

      {/* ── Hero ── */}
      <section style={{
        background: "linear-gradient(135deg,#011451 0%,#011451 55%,#0c33ac 100%)",
        padding: "52px 0 0",
        color: "#fff",
        animation: "faqFU .6s ease",
        position: "relative",
        overflow: "hidden",
        minHeight: 480,
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Orbs déco */}
        <div style={{ position:"absolute", width:360, height:360, borderRadius:"50%", background:"rgba(220,38,38,.12)", top:-100, right:-60, pointerEvents:"none" }} />
        <div style={{ position:"absolute", width:240, height:240, borderRadius:"50%", background:"rgba(30,58,138,.2)", bottom:40, left:-60, pointerEvents:"none" }} />
        <div style={{ position:"absolute", width:180, height:180, borderRadius:"50%", background:"rgba(220,38,38,.07)", top:"35%", left:"38%", pointerEvents:"none" }} />

        {/* Contenu */}
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"0 24px", position:"relative", zIndex:1, width:"100%", boxSizing:"border-box", flex:1, display:"flex", flexDirection:"column", justifyContent:"center", textAlign:"center", paddingTop:28, paddingBottom:48 }}>
          <div style={{ display: "inline-flex", alignSelf:"center", alignItems: "center", gap: 8, background: "rgba(255,255,255,.15)", borderRadius: 100, padding: "6px 18px", fontSize: ".8rem", fontWeight: 600, letterSpacing: ".05em", marginBottom: 20 }}>
            ❓ FOIRE AUX QUESTIONS
          </div>
          <h1 className="faq-hero-title" style={{ fontSize: "2.4rem", fontWeight: 800, margin: "0 0 16px", lineHeight: 1.2 }}>
            Toutes vos questions, <br />
            <span style={{ color: "#fbbf24" }}>nos réponses claires</span>
          </h1>
          <p className="faq-hero-sub" style={{ fontSize: "1.05rem", opacity: .85, maxWidth: 560, margin: "0 auto 36px" }}>
            Retrouvez les réponses aux questions les plus fréquentes sur nos cours, certifications, tarifs et plus encore.
          </p>

          {/* Barre de recherche */}
          <div style={{ maxWidth: 520, margin: "0 auto", position: "relative", width:"100%" }}>
            <input
              type="text"
              placeholder="Rechercher une question…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 48px 14px 20px",
                borderRadius: 50,
                border: "none",
                fontSize: "1rem",
                outline: "none",
                boxShadow: "0 4px 20px rgba(0,0,0,.15)",
                boxSizing: "border-box",
              }}
            />
            <span style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", fontSize: "1.1rem", opacity: .5 }}>🔍</span>
          </div>

          <p style={{ marginTop: 16, opacity: .65, fontSize: ".85rem" }}>{totalCount} questions &amp; réponses</p>
        </div>

        {/* Wave */}
        <div style={{ lineHeight: 0, position: "relative", zIndex: 1 }}>
          <svg viewBox="0 0 1440 56" style={{ display: "block", width: "100%" }} preserveAspectRatio="none">
            <path fill="#fff" d="M0,28 C480,56 960,0 1440,28 L1440,56 L0,56 Z" />
          </svg>
        </div>
      </section>

      {/* ── Filtres catégories ── */}
      <section style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div className="faq-cats" style={{ display: "flex", gap: 4, overflowX: "auto", padding: "16px 0", scrollbarWidth: "none" }}>
            {categories.map(cat => (
              <button
                key={cat}
                className="faq-cat-btn"
                onClick={() => setActiveCategory(cat)}
                style={{
                  whiteSpace: "nowrap",
                  padding: "8px 18px",
                  borderRadius: 50,
                  border: "1.5px solid",
                  borderColor: activeCategory === cat ? "#0c33ac" : "#e2e8f0",
                  background: activeCategory === cat ? "#0c33ac" : "#fff",
                  color: activeCategory === cat ? "#fff" : "#475569",
                  fontWeight: activeCategory === cat ? 700 : 500,
                  fontSize: ".85rem",
                  cursor: "pointer",
                  transition: "all .2s ease",
                  fontFamily: "inherit",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contenu FAQ ── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px 80px" }}>
        {faqData === null ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔍</div>
            <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "#475569" }}>Aucune question trouvée</p>
            <p style={{ fontSize: ".9rem" }}>Essayez un autre mot-clé ou <a href="/contact" style={{ color: "#0c33ac", fontWeight: 600 }}>contactez-nous</a>.</p>
          </div>
        ) : (
          filtered.map((cat, catIdx) => (
            <div key={cat.category} style={{ marginBottom: 48, animation: "faqFU .5s ease" }}>
              {/* En-tête catégorie */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: cat.color, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.3rem", flexShrink: 0,
                }}>
                  {cat.icon}
                </div>
                <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#1e293b" }}>
                  {cat.category}
                </h2>
                <span style={{ marginLeft: "auto", background: cat.color, color: cat.accent, borderRadius: 50, padding: "2px 12px", fontSize: ".78rem", fontWeight: 700 }}>
                  {cat.items.length} question{cat.items.length > 1 ? "s" : ""}
                </span>
              </div>

              {/* Items */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {cat.items.map((item, itemIdx) => {
                  const key = `${catIdx}-${itemIdx}`;
                  const isOpen = !!openItems[key];
                  return (
                    <div
                      key={itemIdx}
                      className={`faq-card ${isOpen ? "faq-item-open" : ""}`}
                      style={{
                        background: "#fff",
                        borderRadius: 14,
                        border: `1.5px solid ${isOpen ? cat.accent : "#e2e8f0"}`,
                        overflow: "hidden",
                        transition: "all .25s ease",
                        cursor: "pointer",
                      }}
                      onClick={() => toggle(catIdx, itemIdx)}
                    >
                      {/* Question */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "18px 22px",
                        gap: 16,
                      }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: ".97rem", color: "#1e293b", lineHeight: 1.4 }}>
                          {item.q}
                        </p>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                          background: isOpen ? cat.accent : "#f1f5f9",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all .25s ease",
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke={isOpen ? "#fff" : "#64748b"} strokeWidth="2.5"
                            style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .25s ease" }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </div>

                      {/* Réponse */}
                      {isOpen && (
                        <div className="faq-answer" style={{
                          padding: "0 22px 20px",
                          color: "#475569",
                          fontSize: ".93rem",
                          lineHeight: 1.7,
                          borderTop: `1px solid ${cat.color}`,
                          paddingTop: 16,
                        }}>
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* CTA Bas de page */}
        <div style={{
          marginTop: 40,
          background: "linear-gradient(135deg, #0c33ac 0%, #1a4fd6 100%)",
          borderRadius: 20,
          padding: "40px 32px",
          textAlign: "center",
          color: "#fff",
          animation: "faqSI .5s ease",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>💬</div>
          <h3 style={{ margin: "0 0 10px", fontSize: "1.3rem", fontWeight: 800 }}>
            Vous n'avez pas trouvé votre réponse ?
          </h3>
          <p style={{ margin: "0 0 24px", opacity: .85, fontSize: ".95rem" }}>
            Notre équipe est disponible pour répondre à toutes vos questions.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="/contact"
              style={{
                background: "#fff",
                color: "#0c33ac",
                padding: "12px 28px",
                borderRadius: 50,
                fontWeight: 700,
                textDecoration: "none",
                fontSize: ".9rem",
                transition: "opacity .2s",
              }}
            >
              Nous contacter
            </a>
            {contactConfig.whatsapp_number && (
              <a
                href={lienWhatsApp(contactConfig.whatsapp_number, contactConfig.whatsapp_message || "")}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "rgba(255,255,255,.15)",
                  color: "#fff",
                  padding: "12px 28px",
                  borderRadius: 50,
                  fontWeight: 700,
                  textDecoration: "none",
                  fontSize: ".9rem",
                  border: "1.5px solid rgba(255,255,255,.3)",
                }}
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default FAQ;
