import React from "react";

/**
 * Le nom d'une personne dans une liste, suivi de son surnom quand elle en a choisi un.
 *
 * Dans les écrans de pilotage - la liste SuperAdmin, le tableau des coachs du PA, le cahier
 * du superviseur - l'état civil reste la référence : c'est lui qui figure sur les contrats
 * et les bulletins. Le surnom vient en complément, jamais à la place, sinon on ne peut plus
 * rapprocher une ligne d'un document administratif.
 *
 * Écrit une fois plutôt que quatre : la forme doit rester la même d'un écran à l'autre,
 * faute de quoi le même utilisateur paraît différent selon l'écran qui l'affiche.
 */
export default function NomAvecSurnom({ nom, prenom, surnom, complet, style, styleSurnom }) {
  const etatCivil = (complet || `${prenom || ""} ${nom || ""}`.trim() || "-");
  const s = (surnom || "").trim();

  if (!s) return <span style={style}>{etatCivil}</span>;

  return (
    <span style={style}>
      {etatCivil}
      <span
        title="Surnom choisi par l'intéressé"
        style={{ marginLeft: 6, color: "#0891b2", fontWeight: 600, fontStyle: "italic", ...styleSurnom }}
      >
        « {s} »
      </span>
    </span>
  );
}

/** La même chose en texte, pour un export ou un attribut `title`. */
export function nomAvecSurnomTexte({ nom, prenom, surnom, complet }) {
  const etatCivil = (complet || `${prenom || ""} ${nom || ""}`.trim() || "-");
  const s = (surnom || "").trim();
  return s ? `${etatCivil} « ${s} »` : etatCivil;
}
