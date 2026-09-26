import React from "react";
import { categorieCoach, BAREME_TEXTE } from "../utils/categorieCoach";

/**
 * Le badge de catégorie de contrat d'un coach, déduit de sa note moyenne d'observation.
 *
 * Trois tailles parce que le badge se pose dans des contextes très différents : une
 * cellule de tableau serrée, une carte d'assignation, le header du coach. Une seule
 * taille aurait obligé chaque écran à surcharger le style, et le badge aurait fini par
 * différer d'un écran à l'autre.
 *
 * `note` absente ou nulle → « Non évalué », en gris : un coach jamais observé n'est pas
 * un coach mal noté, et le montrer en rouge serait un contresens.
 */
export default function BadgeCategorieCoach({ note, taille = "md", avecNote = false, style = {} }) {
  const cat = categorieCoach(note);

  const tailles = {
    xs: { fontSize: 8.5, padding: "1px 5px",   radius: 5, poids: 800 },
    sm: { fontSize: 9.5, padding: "2px 7px",   radius: 6, poids: 800 },
    md: { fontSize: 11,  padding: "3px 10px",  radius: 7, poids: 800 },
    lg: { fontSize: 13,  padding: "5px 14px",  radius: 8, poids: 900 },
  };
  const t = tailles[taille] || tailles.md;

  // Sur les petites tailles le libellé complet déborde des cellules : on garde la forme
  // abrégée, le titre au survol portant le texte entier.
  const libelle = (taille === "xs" && cat.court) ? cat.court : cat.libelle;

  return (
    <span
      title={`${cat.libelle} - ${BAREME_TEXTE}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: cat.fond, color: cat.couleur,
        border: `1px solid ${cat.bord}`,
        borderRadius: t.radius, padding: t.padding,
        fontSize: t.fontSize, fontWeight: t.poids,
        lineHeight: 1.4, whiteSpace: "nowrap",
        ...style,
      }}
    >
      {avecNote && Number(note) > 0 && (
        <strong style={{ fontWeight: 900 }}>{Number(note).toFixed(1)}</strong>
      )}
      {libelle}
    </span>
  );
}
