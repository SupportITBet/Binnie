import React from "react";

/**
 * L'ÉVOLUTION DU NIVEAU, TEST APRÈS TEST.
 *
 * POURQUOI. Les fiches n'affichaient que le DERNIER test. Or un apprenant en repasse un quand
 * son coach demande son transfert : « C1 » seul ne dit rien, « B1 → C1 » dit qu'il a progressé
 * et explique le changement de classe qu'on lit juste à côté. Sans cette lecture, l'onboarding
 * et la commerciale voient un niveau tomber du ciel.
 *
 * NE S'AFFICHE QU'À PARTIR DE DEUX TESTS. Un seul test n'est pas une évolution : l'afficher
 * comme telle ferait chercher une progression là où il n'y a qu'un point de départ.
 */

const COULEURS = {
  A1: "#6b7280", A2: "#0891b2", B1: "#16a34a",
  B2: "#7c3aed", C1: "#d97706", C2: "#dc2626",
};

const jour = (d) => d
  ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
  : null;

/** Le texte brut de l'évolution, pour les exports PDF qui n'affichent pas de JSX. */
export function texteEvolutionNiveau(tests = []) {
  const suite = (tests || []).filter(t => t?.level);
  if (suite.length < 2) return null;
  return suite.map(t => {
    const d = jour(t.submitted_at);
    return d ? `${String(t.level).toUpperCase()} (${d})` : String(t.level).toUpperCase();
  }).join("  →  ");
}

export default function EvolutionNiveauTests({ tests = [], compact = false }) {
  const suite = (tests || []).filter(t => t?.level);
  if (suite.length < 2) return null;

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
      padding: compact ? "8px 12px" : "12px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase",
        letterSpacing: ".05em", marginBottom: 8 }}>
        Évolution du niveau · {suite.length} tests
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {suite.map((t, i) => {
          const n = String(t.level).toUpperCase();
          const c = COULEURS[n] || "#475569";
          // Le dernier porte la couleur pleine : c'est le niveau qui vaut aujourd'hui.
          const actuel = i === suite.length - 1;
          return (
            <React.Fragment key={t.id || i}>
              {i > 0 && <span style={{ color: "#cbd5e1", fontSize: 13 }}>→</span>}
              <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: actuel ? 13 : 12, fontWeight: 800, padding: "3px 11px", borderRadius: 99,
                  background: actuel ? c : c + "1f", color: actuel ? "#fff" : c }}>
                  {n}
                </span>
                {t.submitted_at && (
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>{jour(t.submitted_at)}</span>
                )}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
