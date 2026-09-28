import React from "react";

/**
 * LE NIVEAU D'UN APPRENANT, AVEC CELUI QU'IL AVAIT AVANT.
 *
 * POURQUOI LES DEUX. Un niveau seul est une étiquette : « B1 » ne dit rien de plus que le nom
 * de la classe. C'est la paire qui informe - « A2 → B1 » est une progression, « B1 → A2 » dit
 * qu'on s'était trompé de classe au départ, et c'est exactement ce que le coach, l'agent
 * placement test et l'onboarding ont besoin de lire au moment d'un transfert.
 *
 * L'ANCIEN RESTE DISCRET. Il est plus petit, barré et grisé : on lit d'abord où en est
 * l'apprenant aujourd'hui, et l'histoire vient en second. L'inverse ferait hésiter sur le
 * niveau réellement en cours, ce qui est le pire résultat possible sur cette information.
 *
 * `niveau_precedent` vaut `null` tant que rien n'a changé : le composant n'affiche alors que
 * le niveau courant, exactement comme avant son introduction.
 */

const COULEURS = {
  A1: "#6b7280", A2: "#0891b2", B1: "#16a34a",
  B2: "#7c3aed", C1: "#d97706", C2: "#dc2626",
};

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
  : null;

/**
 * L'ANCIEN NIVEAU SEUL, à poser À CÔTÉ d'un badge de niveau existant.
 *
 * Les tableaux de bord ont chacun leur façon d'afficher le niveau - couleurs, tailles,
 * arrondis. Remplacer leur badge par le composant complet aurait uniformisé de force cinq
 * écrans qui n'en demandaient pas tant, et fait courir un risque visuel là où l'ajout suffit.
 * Cette pastille s'ajoute sans rien déplacer, et disparaît quand il n'y a rien à dire.
 */
export function AncienNiveau({ niveau, precedent, changeLe, taille = 10 }) {
  const n = String(niveau || "").toUpperCase();
  const p = String(precedent || "").toUpperCase();
  if (!p || p === n) return null;
  const date = fmtDate(changeLe);
  return (
    <span title={`Niveau ${p} avant ce changement${date ? ` — le ${date}` : ""}`}
      style={{ fontSize: taille, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
        background: "#f1f5f9", color: "#94a3b8", whiteSpace: "nowrap" }}>
      avant : {p}
    </span>
  );
}

export default function NiveauApprenant({ niveau, niveauPrecedent, changeLe, taille = 11, accent }) {
  if (!niveau && !niveauPrecedent) return <span style={{ color: "#cbd5e1" }}>-</span>;

  const n = String(niveau || "").toUpperCase();
  const p = String(niveauPrecedent || "").toUpperCase();
  const couleur = accent || COULEURS[n] || "#475569";
  // Un changement qui ne change rien n'a pas à s'afficher : il ferait douter d'une erreur.
  const montrerAncien = !!p && p !== n;

  const date = fmtDate(changeLe);
  const titre = montrerAncien
    ? `Niveau ${p} avant${date ? ` — changé le ${date}` : ""}, ${n} aujourd'hui`
    : `Niveau ${n}`;

  return (
    <span title={titre} style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      {montrerAncien && (
        <>
          <span style={{ fontSize: taille - 1, fontWeight: 600, color: "#94a3b8", textDecoration: "line-through" }}>{p}</span>
          <span style={{ fontSize: taille - 1, color: "#cbd5e1" }}>→</span>
        </>
      )}
      <span style={{ fontSize: taille, fontWeight: 800, padding: "2px 9px", borderRadius: 99,
        background: couleur + "1f", color: couleur }}>
        {n || "-"}
      </span>
    </span>
  );
}
