import React, { useState, useEffect } from "react";

const readLS = (key) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } };

export default function CataloguePdfBanner() {
  const [pdf, setPdf] = useState(() => readLS("bet_catalogue_pdf"));

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "bet_catalogue_pdf") try { setPdf(JSON.parse(e.newValue)); } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!pdf?.url) return null;

  const nom = pdf.nom || "Catalogue BET 2025.pdf";

  return (
    <section style={{ background: "linear-gradient(135deg, #011451 0%, #0891b2 100%)", padding: "48px 24px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>
            📄
          </div>
          <div>
            <div style={{ fontSize: ".72rem", fontWeight: 800, letterSpacing: ".1em", color: "rgba(255,255,255,0.6)", marginBottom: 4, textTransform: "uppercase" }}>
              Document officiel
            </div>
            <div style={{ fontFamily: "'Montserrat','Segoe UI',sans-serif", fontSize: "clamp(1.1rem,2.5vw,1.5rem)", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
              {nom.replace(/\.pdf$/i, "")}
            </div>
            <div style={{ fontSize: ".85rem", color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
              Toutes nos formations, tarifs et modalités en un seul document.
            </div>
          </div>
        </div>
        <a
          href={pdf.url}
          download={nom}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none" }}
        >
          <button style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#fff", color: "#011451",
            border: "none", borderRadius: 999,
            padding: "14px 28px",
            fontFamily: "'Montserrat','Segoe UI',sans-serif",
            fontWeight: 800, fontSize: ".9rem",
            cursor: "pointer", whiteSpace: "nowrap",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            transition: "transform .15s, box-shadow .15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.2)"; }}
          >
            ⬇ Télécharger le catalogue
          </button>
        </a>
      </div>
    </section>
  );
}
