import React, { useState } from "react";

/**
 * LA PASTILLE D'UN GROUPE OU D'UNE CLASSE - sa photo, ou ses initiales à défaut.
 *
 * Une liste de dix conversations se lisait mot à mot ; une image se reconnaît d'un coup
 * d'œil. Le repli sur les initiales n'est pas un pis-aller : c'est ce que voient tous ceux
 * qui n'ont pas encore de photo.
 *
 * EXTRAIT DE `GroupesLibres.jsx` le jour où les CLASSES ont reçu une photo elles aussi. Le
 * composant est le même des deux côtés à dessein : une classe et son fil de discussion
 * portent la MÊME image - `groupes.photo_url` - pour qu'un apprenant ne voie pas deux
 * visuels différents désigner le même endroit. Deux copies du composant auraient fini par
 * arrondir, cadrer ou replier différemment, et auraient recréé la confusion qu'on évite.
 */
export function initiales(nom) {
  return String(nom || "?").trim().split(/\s+/).slice(0, 2).map(m => m[0]).join("").toUpperCase();
}

export default function PastilleGroupe({ nom, url, taille = 30, accent = "#64748b", agrandissable = false }) {
  const [casse, setCasse] = useState(false);
  const [plein, setPlein] = useState(false);
  const style = { width: taille, height: taille, borderRadius: "50%", flexShrink: 0, objectFit: "cover" };

  // Une URL morte (image supprimée de Cloudinary) ne doit pas laisser un carré vide :
  // on retombe sur les initiales, comme si aucune photo n'avait été posée.
  if (url && !casse) {
    return (
      <>
        <img src={url} alt={`Photo de ${nom}`}
          onClick={agrandissable ? () => setPlein(true) : undefined}
          title={agrandissable ? "Voir la photo en grand" : undefined}
          style={{ ...style, border: "1px solid #e2e8f0", cursor: agrandissable ? "zoom-in" : "default" }}
          onError={() => setCasse(true)} />
        {/* LA PHOTO EN GRAND, par-dessus tout le reste. Une vignette de 54 px ne laisse
            rien voir d'une image ; c'est le geste attendu partout ailleurs. */}
        {plein && (
          <div onClick={() => setPlein(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 10050,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
            <img src={url} alt={`Photo de ${nom}`}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 14, objectFit: "contain", cursor: "default" }} />
            <button onClick={() => setPlein(false)}
              style={{ position: "absolute", top: 18, right: 22, background: "rgba(255,255,255,.15)", color: "#fff",
                border: "none", borderRadius: "50%", width: 38, height: 38, fontSize: 18, cursor: "pointer" }}>✕</button>
            <div style={{ position: "absolute", bottom: 22, color: "rgba(255,255,255,.85)", fontSize: 13, fontWeight: 600 }}>
              {nom}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <span style={{ ...style, background: "#e2e8f0", color: accent, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: Math.round(taille * 0.38), fontWeight: 800 }}>
      {initiales(nom)}
    </span>
  );
}
