import React, { createContext, useContext } from "react";

/**
 * Barre de filtres - modèle « pastilles à compteur ».
 *
 * Ce modèle est né dans l'onglet « Groupes de cours » de l'Onboarding, puis a été
 * repris à l'identique dans « Mes classes » (commerciale) et « Groupes » (PA). Il
 * existait jusqu'ici en trois copies inline : ce composant en est l'extraction, pour
 * qu'une évolution du design se fasse en un seul endroit.
 *
 * Principe : les filtres à valeurs fermées (statut, niveau, type…) sont des pastilles
 * portant leur compteur, ce qui évite d'ouvrir un select pour découvrir qu'une valeur
 * ne ramène rien. Les filtres qui ne s'y prêtent pas - recherche libre, liste longue
 * (coachs, centres), plage de dates - restent des champs, alignés dans la même barre.
 *
 * Usage :
 *
 *   <BarreFiltres accent={PA_COLOR}>
 *     <RangeePastilles label="Statut :" valeur={statut} onChange={setStatut}
 *       options={[{ v:"tous", l:"Tous" }, { v:"actif", l:"🟢 Actifs" }]}
 *       compte={(v) => v === "tous" ? tout.length : tout.filter(x => x.statut === v).length} />
 *
 *     <RangeeChamps label="Recherche :" resume={`${filtres.length} / ${tout.length}`}
 *       onReinitialiser={filtreActif ? reinitialiser : null}>
 *       <input style={champFiltre} … />
 *     </RangeeChamps>
 *   </BarreFiltres>
 *
 * La valeur « tous » n'est pas imposée : elle vaut ce que porte l'option (les
 * commerciales utilisent "", le PA "tous"). Le composant ne fait que comparer.
 */

const ACCENT_DEFAUT = "#7c3aed";
const FiltresContexte = createContext(ACCENT_DEFAUT);

/** Style commun aux champs libres (input, select, date) posés dans la barre. */
export const champFiltre = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1.5px solid #e2e8f0",
  fontSize: 12,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};

const styleRangee = {
  display: "flex",
  gap: 8,
  marginBottom: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const styleLegende = {
  fontSize: 11,
  color: "#9ca3af",
  fontWeight: 700,
  marginRight: 2,
};

/** Une pastille seule - utile hors rangée (bascule isolée dans un en-tête). */
export function Pastille({ actif, onClick, children, compteur, accent }) {
  const contexte = useContext(FiltresContexte);
  // La prop l'emporte : une pastille peut vivre hors BarreFiltres (barre existante d'un
  // dashboard qu'on convertit sans la restructurer) et doit alors porter sa couleur.
  const couleur = accent || contexte || ACCENT_DEFAUT;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        border: `2px solid ${actif ? couleur : "#e5e7eb"}`,
        background: actif ? couleur + "10" : "#fff",
        color: actif ? couleur : "#374151",
        fontWeight: actif ? 800 : 600,
        fontSize: 12,
        cursor: "pointer",
        transition: "border-color .12s, background .12s",
      }}
    >
      {children}
      {compteur !== null && compteur !== undefined && (
        <span style={{ marginLeft: 5, fontWeight: 800, fontSize: 11, color: actif ? couleur : "#9ca3af" }}>
          {compteur}
        </span>
      )}
    </button>
  );
}

/**
 * Une rangée de pastilles exclusives.
 *
 * options : [{ v, l, n? }] - `v` la valeur, `l` le libellé (emoji compris), `n` un
 *           compteur figé si on l'a déjà sous la main.
 * compte  : (v) => nombre - alternative à `n`, appelée par option. Omettre les deux
 *           masque les compteurs, ce qui convient quand le calcul serait coûteux.
 */
export function RangeePastilles({ label, options, valeur, onChange, compte, style, accent }) {
  return (
    <div style={{ ...styleRangee, ...style }}>
      {label && <span style={styleLegende}>{label}</span>}
      {options.map((o) => {
        const n = o.n !== undefined ? o.n : compte ? compte(o.v) : null;
        return (
          <Pastille key={String(o.v)} actif={valeur === o.v} onClick={() => onChange(o.v)} compteur={n} accent={accent}>
            {o.l}
          </Pastille>
        );
      })}
    </div>
  );
}

/**
 * La rangée des champs libres. Porte aussi, à droite, le bouton de réinitialisation
 * et le résumé « X / Y » - les deux ne sont rendus que si on les fournit.
 *
 * onReinitialiser : passer null/undefined quand aucun filtre n'est actif ; le bouton
 *                   disparaît alors, plutôt que de rester là sans effet.
 */
export function RangeeChamps({ label, children, onReinitialiser, resume, style }) {
  return (
    <div style={{ ...styleRangee, marginBottom: 0, ...style }}>
      {label && <span style={styleLegende}>{label}</span>}
      {children}
      {onReinitialiser && (
        <button
          type="button"
          onClick={onReinitialiser}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            border: "2px solid #fca5a5",
            background: "#fff5f5",
            color: "#dc2626",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ✕ Réinitialiser
        </button>
      )}
      {resume !== null && resume !== undefined && (
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b", fontWeight: 600 }}>{resume}</span>
      )}
    </div>
  );
}

/** Conteneur : diffuse la couleur d'accent du dashboard à toutes les pastilles. */
export default function BarreFiltres({ accent, children, style }) {
  return (
    <FiltresContexte.Provider value={accent || ACCENT_DEFAUT}>
      <div style={{ marginBottom: 14, ...style }}>{children}</div>
    </FiltresContexte.Provider>
  );
}
