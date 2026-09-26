import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const PALETTE = [
  "#1e4080","#0891b2","#7c3aed","#059669",
  "#dc2626","#d97706","#0f766e","#b45309",
  "#ec4899","#14b8a6","#64748b","#0ea5e9",
  "#6366f1","#8b5cf6","#10b981","#f59e0b",
];

export const getApprenantColor = () => {
  try {
    const session = sessionStorage.getItem("_apprenant_color");
    if (session) return session;
    return localStorage.getItem("apprenant_color") || "#1e4080";
  } catch { return "#1e4080"; }
};

const applyColor = async (color, setSaving) => {
  setSaving(true);
  sessionStorage.setItem("_apprenant_color_guard", "1");
  sessionStorage.setItem("_apprenant_color", color);
  localStorage.setItem("apprenant_color", color);

  try {
    const token = localStorage.getItem("user_token");
    if (token) {
      await Promise.race([
        fetch(`${API_URL}/api/apprenants/preferences`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ couleur: color }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(), 4000)),
      ]);
    }
  } catch { /* couleur déjà sauvegardée localement */ }

  window.location.reload();
};

const ApprenantColorPicker = ({ currentColor }) => {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [hex, setHex]       = useState(currentColor || getApprenantColor());
  const [popupPos, setPopupPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target) &&
          !document.getElementById("acp-popup")?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopupPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  };

  const popup = open ? ReactDOM.createPortal(
    <div id="acp-popup" style={{
      position: "fixed", top: popupPos.top, right: popupPos.right,
      background: "#fff", borderRadius: 14, padding: 16,
      boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
      zIndex: 99999, minWidth: 224, border: "1px solid #e5e7eb",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>🎨 Couleur du dashboard</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {PALETTE.map(c => (
          <button key={c} disabled={saving} onClick={() => applyColor(c, setSaving)} style={{
            width: 36, height: 36, borderRadius: 8, background: c,
            border: hex === c ? "3px solid #0f172a" : "3px solid transparent",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
            boxShadow: hex === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none",
            transform: hex === c ? "scale(1.12)" : "scale(1)",
            transition: "transform .12s",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="color" value={hex} onChange={e => setHex(e.target.value)} disabled={saving}
          style={{ width: 36, height: 36, border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", padding: 0 }} />
        <input value={hex} onChange={e => setHex(e.target.value)} maxLength={7} disabled={saving}
          style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "monospace" }} />
        <button disabled={saving} onClick={() => applyColor(hex, setSaving)} style={{
          padding: "6px 14px", background: saving ? "#9ca3af" : hex, color: "#fff",
          border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12,
          cursor: saving ? "not-allowed" : "pointer",
        }}>{saving ? "⏳" : "✓"}</button>
      </div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
        {saving ? "Enregistrement…" : "La page se rechargera avec la nouvelle couleur."}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button ref={btnRef} onClick={handleToggle} title="Changer la couleur du dashboard" style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 14px",
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600,
        cursor: "pointer", transition: "background .2s",
      }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
      >
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: hex, display: "inline-block", border: "2px solid rgba(255,255,255,0.5)", flexShrink: 0 }} />
        🎨
      </button>
      {popup}
    </>
  );
};

export default ApprenantColorPicker;
