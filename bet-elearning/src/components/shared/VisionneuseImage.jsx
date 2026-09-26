import React, { useEffect } from "react";

/**
 * Regarder une image en grand - rien de plus.
 *
 * Les en-têtes de dashboard montrent une photo de profil de 64 pixels. Dans dash, cliquer
 * dessus ne faisait rien ; dans bet-elearning, cela ouvrait le sélecteur de fichier, si bien
 * qu'un clic pour voir sa photo devenait un début de remplacement. Dans les deux cas le
 * geste le plus naturel - cliquer pour regarder - n'était pas servi.
 *
 * Le bouton de changement reste où il est, en coin : voir et remplacer sont deux intentions
 * distinctes et méritent deux cibles distinctes.
 */
export default function VisionneuseImage({ url, titre, onClose }) {
  // Échap ferme, comme partout ailleurs. Le nettoyage est indispensable : sans lui,
  // l'écouteur survit à la fermeture et s'accumule à chaque ouverture.
  useEffect(() => {
    if (!url) return undefined;
    const surTouche = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={titre ? `Photo de ${titre}` : "Photo de profil"}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.88)", zIndex: 3000,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 24, gap: 14, cursor: "zoom-out",
      }}
    >
      <img
        src={url}
        alt={titre || "Photo de profil"}
        // Le clic sur l'image ne referme pas : on vient de l'ouvrir pour la regarder.
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(92vw, 720px)", maxHeight: "78vh", objectFit: "contain",
          borderRadius: 12, boxShadow: "0 24px 64px rgba(0,0,0,.5)", background: "#0f172a",
          cursor: "default",
        }}
      />

      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {titre && <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{titre}</span>}
        <a
          href={url} target="_blank" rel="noopener noreferrer"
          style={{ color: "#7dd3fc", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
        >
          Ouvrir en taille réelle ↗
        </a>
        <button
          onClick={onClose}
          style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "none", borderRadius: 8,
            padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          Fermer
        </button>
      </div>

      <div style={{ color: "#94a3b8", fontSize: 11 }}>Cliquez à côté ou appuyez sur Échap pour fermer</div>
    </div>
  );
}
