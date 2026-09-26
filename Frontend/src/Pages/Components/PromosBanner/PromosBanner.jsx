import React, { useState, useEffect } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

/**
 * Affiche les codes promo actifs liés à un type d'offre.
 * Le client voit directement le code à utiliser + la remise.
 *
 * Props :
 *   offreType   - "en_ligne" | "centres" | "domicile" | "certifications"
 *   centreId    - id du centre précis choisi (optionnel - un code peut être restreint
 *                 à un ou plusieurs centres en plus de sa catégorie d'offre)
 *   onApply     - callback(code) appelé si le client clique "Utiliser ce code"
 *   accentColor - couleur de l'encadré (défaut orange promo)
 */
export default function PromosBanner({ offreType, centreId, onApply, accentColor = "#f59e0b" }) {
  const [promos, setPromos] = useState([]);

  useEffect(() => {
    if (!offreType) return;
    const qs = new URLSearchParams({ offre_type: offreType, ...(centreId ? { centre_id: centreId } : {}) });
    fetch(`${API}/api/codes-promo/actifs?${qs.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.promos?.length) setPromos(d.promos); })
      .catch(() => {});
  }, [offreType, centreId]);

  if (!promos.length) return null;

  const fmtReduction = (p) =>
    p.type_reduction === "pourcentage"
      ? `-${p.valeur}%`
      : `-${Number(p.valeur).toLocaleString("fr-FR")} FCFA`;

  return (
    <div style={{
      background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
      border: `1.5px solid ${accentColor}`,
      borderRadius: 12,
      padding: "12px 16px",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: promos.length > 1 ? 8 : 4 }}>
        <span style={{ fontSize: "1.3rem" }}>🏷️</span>
        <span style={{ fontWeight: 800, fontSize: ".82rem", color: "#78350f" }}>
          {promos.length > 1 ? "Offres promotionnelles disponibles !" : "Offre promotionnelle disponible !"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {promos.map(p => (
          <div key={p.code} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, flexWrap: "wrap",
            background: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "7px 10px",
            border: "1px solid #fde68a",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
              <span style={{
                fontFamily: "monospace", fontWeight: 900, fontSize: ".9rem",
                color: "#92400e", background: "#fde68a", padding: "2px 10px",
                borderRadius: 6, letterSpacing: 1,
              }}>{p.code}</span>
              <span style={{ fontWeight: 700, color: "#ff2945", fontSize: ".88rem" }}>
                {fmtReduction(p)}
              </span>
              {p.description && (
                <span style={{ fontSize: ".75rem", color: "#78350f" }}>· {p.description}</span>
              )}
              {p.date_expiration && (
                <span style={{ fontSize: ".7rem", color: "#9ca3af" }}>
                  · Expire le {new Date(p.date_expiration).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>
            {onApply && (
              <button
                onClick={() => onApply(p.code)}
                style={{
                  padding: "5px 13px", background: accentColor, color: "#fff",
                  border: "none", borderRadius: 7, cursor: "pointer",
                  fontWeight: 700, fontSize: ".75rem", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                Utiliser ce code →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
