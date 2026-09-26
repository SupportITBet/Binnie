import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

const PALETTE = [
  "#0891b2","#0c33ac","#7c3aed","#059669",
  "#ff2945","#d97706","#0f766e","#b45309",
  "#ec4899","#14b8a6","#64748b","#0ea5e9",
  "#6366f1","#8b5cf6","#10b981","#f59e0b",
];

const getCurrentColor = () => {
  try { return JSON.parse(localStorage.getItem("admin_profil") || "{}").couleur || "#0891b2"; }
  catch { return "#0891b2"; }
};

/* Sauvegarde en sessionStorage (survit au reload dans le même onglet)
   + déclenche immédiatement le reload, PATCH en arrière-plan.
   Le script dans index.html <head> applique sessionStorage → localStorage
   avant que les modules JS ne s'exécutent. */
const applyColor = async (color, setSaving) => {
  setSaving(true);
  // 1. Guard sessionStorage - survit au reload, bloque le useEffect "freshColor"
  sessionStorage.setItem("_bet_color_guard", "1");
  sessionStorage.setItem("_bet_color", color);

  // 2. localStorage immédiat + backup par userId (survit au logout)
  try {
    const stored = JSON.parse(localStorage.getItem("admin_profil") || "{}");
    if (stored.id) localStorage.setItem(`_bet_color_${stored.id}`, color);
    localStorage.setItem("admin_profil", JSON.stringify({ ...stored, couleur: color }));
  } catch {}

  // 3. PATCH Supabase via le même endpoint que le SuperAdmin (prouvé fonctionnel)
  try {
    const token  = localStorage.getItem("admin_token");
    const profil = JSON.parse(localStorage.getItem("admin_profil") || "{}");
    const userId = profil.id;
    if (token && userId) {
      await Promise.race([
        fetch(`${API_URL}/api/admin/utilisateurs/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ couleur: color }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
      ]);
    }
  } catch (_e) { /* timeout ou réseau - couleur déjà sauvegardée localement */ }
  // Que le PATCH réussisse ou échoue : sessionStorage + localStorage + backup garantissent la couleur

  // 4. Reload - index.html injecte _bet_color dans localStorage avant les modules JS
  window.location.reload();
};

const DashboardColorPicker = () => {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [hex, setHex]       = useState(getCurrentColor);
  const [popupPos, setPopupPos] = useState({ top: 0, right: 0 });
  const btnRef                  = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target) &&
          !document.getElementById("dcp-popup")?.contains(e.target)) {
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
    <div
      id="dcp-popup"
      style={{
        position: "fixed", top: popupPos.top, right: popupPos.right,
        background: "#fff", borderRadius: 14, padding: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
        zIndex: 99999, minWidth: 224, border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>🎨 Couleur du dashboard</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {PALETTE.map(c => (
          <button
            key={c}
            disabled={saving}
            onClick={() => applyColor(c, setSaving)}
            style={{
              width: 36, height: 36, borderRadius: 8, background: c,
              border: hex === c ? "3px solid #0f172a" : "3px solid transparent",
              cursor: saving ? "not-allowed" : "pointer", transition: "transform .12s",
              opacity: saving ? 0.6 : 1,
              boxShadow: hex === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none",
              transform: hex === c ? "scale(1.12)" : "scale(1)",
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color" value={hex}
          onChange={e => setHex(e.target.value)}
          disabled={saving}
          style={{ width: 36, height: 36, border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", padding: 0 }}
        />
        <input
          value={hex}
          onChange={e => setHex(e.target.value)}
          maxLength={7}
          disabled={saving}
          style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, fontFamily: "monospace", color: "#374151" }}
        />
        <button
          disabled={saving}
          onClick={() => applyColor(hex, setSaving)}
          style={{ padding: "6px 14px", background: saving ? "#9ca3af" : hex, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: saving ? "not-allowed" : "pointer", minWidth: 36 }}
        >
          {saving ? "⏳" : "✓"}
        </button>
      </div>

      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
        {saving ? "Enregistrement en cours…" : "La page se rechargera avec la nouvelle couleur."}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title="Changer la couleur du dashboard"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600,
          cursor: "pointer", transition: "background .2s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
      >
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: hex, display: "inline-block", border: "2px solid rgba(255,255,255,0.5)", flexShrink: 0 }} />
        🎨
      </button>
      {popup}
    </>
  );
};

export default DashboardColorPicker;
