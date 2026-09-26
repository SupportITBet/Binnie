// src/Components/LanguageToggle.jsx
// Bouton flottant FR/EN - visible sur toutes les pages
import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";

export default function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();
  const [hovered, setHovered] = useState(false);

  const isEN = lang === "EN";

  return (
    <button
      onClick={toggleLang}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isEN ? "Passer en Français" : "Switch to English"}
      style={{
        position:       "fixed",
        bottom:         24,
        right:          24,
        zIndex:         99999,
        display:        "flex",
        alignItems:     "center",
        gap:            7,
        padding:        "8px 14px",
        borderRadius:   50,
        border:         "1.5px solid",
        borderColor:    hovered ? "#1B3080" : "rgba(27,48,128,0.25)",
        background:     hovered ? "#1B3080" : "#fff",
        color:          hovered ? "#fff"    : "#1B3080",
        cursor:         "pointer",
        fontFamily:     "'Montserrat','Segoe UI',sans-serif",
        fontSize:       12,
        fontWeight:     700,
        letterSpacing:  "0.08em",
        boxShadow:      hovered
          ? "0 6px 20px rgba(27,48,128,0.3)"
          : "0 2px 10px rgba(0,0,0,0.1)",
        transition:     "all .2s ease",
        userSelect:     "none",
      }}
    >
      {/* Flag + libellé actif */}
      <span style={{ fontSize: 16, lineHeight: 1 }}>
        {isEN ? "🇬🇧" : "🇫🇷"}
      </span>
      <span style={{ lineHeight: 1 }}>
        {isEN ? "EN" : "FR"}
      </span>

      {/* Séparateur */}
      <span style={{
        width: 1, height: 12,
        background: hovered ? "rgba(255,255,255,0.35)" : "rgba(27,48,128,0.2)",
        borderRadius: 1,
      }} />

      {/* Langue cible */}
      <span style={{ opacity: 0.6, lineHeight: 1 }}>
        {isEN ? "FR" : "EN"}
      </span>
    </button>
  );
}
