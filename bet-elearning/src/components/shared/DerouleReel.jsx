import React from "react";

/**
 * ⚠️ COPIE de `dash/src/Components/DerouleReel.jsx`, qui fait référence.
 *
 * Les deux applications sont deux projets CRA distincts, sans espace de travail partagé : il
 * n'existe aucun moyen d'importer un composant de l'une dans l'autre. Elles ne partagent pas
 * non plus leurs données - `dash` lit `seances`/`sessions_live`, bet-elearning lit
 * `seances_elearning` - mais la façon de RENDRE COMPTE d'une séance doit rester la même,
 * sans quoi deux écrans décriraient différemment le même fait. Toute modification faite
 * là-bas doit être reportée ici.
 *
 * Les noms de champs sont volontairement identiques des deux côtés (`demarree_at`,
 * `terminee_at`, `duree_reelle_s`) : c'est ce qui permet au composant de fonctionner tel quel
 * sur deux modèles de données pourtant indépendants.
 *
 * Ce qui s'est réellement passé pendant une séance en direct.
 *
 * La salle affiche un chronomètre au coach pendant tout le cours ; à la fermeture de sa
 * fenêtre, ce temps disparaissait. Personne - ni le PA, ni la commerciale, ni l'onboarding,
 * ni le superviseur - ne pouvait ensuite dire si un cours prévu 90 minutes en avait duré 25.
 *
 * Le bloc existait d'abord chez la commerciale seule. L'avoir recopié dans les trois autres
 * écrans aurait garanti la dérive : quatre versions d'une même règle, corrigées une à une.
 *
 * Attend une séance portant `demarree_at`, `terminee_at`, `duree_reelle_s` et, pour la
 * comparaison, `duree_prevue_min` ou `duree` (minutes) ou `duree_h` (heures).
 */
/**
 * Le temps passé en salle, en minutes - ou `null` s'il est inconnu.
 *
 * À défaut du chronomètre, l'écart entre l'ouverture et la fermeture donne la même durée :
 * inutile d'afficher « non relevé » quand les deux horodatages suffisent à la déduire.
 *
 * Exporté pour les écrans trop denses pour accueillir le bloc complet - une liste de séances
 * passées, par exemple - qui n'en affichent qu'une mention d'une ligne. La règle reste ici.
 */
export function dureeReelleMin(seance) {
  if (!seance) return null;
  if (seance.duree_reelle_s != null) return Math.round(seance.duree_reelle_s / 60);
  if (seance.demarree_at && seance.terminee_at) {
    return Math.max(0, Math.round((new Date(seance.terminee_at) - new Date(seance.demarree_at)) / 60000));
  }
  return null;
}

/** La durée prévue, en minutes, quelle que soit la forme sous laquelle elle est portée. */
export function dureePrevueMin(seance) {
  if (!seance) return null;
  /* `duree_minutes` est la forme portée par `seances_elearning` — la quatrième après
     `duree_prevue_min`, `duree` et `duree_h`. Sans elle, le panneau de séance affichait
     « Prévu : - » et l'écart avec le temps réellement passé en salle, qui est tout
     l'intérêt du bloc, ne se calculait pas. */
  return seance.duree_prevue_min ?? seance.duree ?? seance.duree_minutes ??
    (seance.duree_h ? Math.round(parseFloat(seance.duree_h) * 60) : null);
}

export default function DerouleReel({ seance, style }) {
  if (!seance) return null;

  const fait = ["realisee", "terminee"].includes(seance.statut);
  const reelMin = dureeReelleMin(seance);

  // N'a de sens qu'une fois la séance tenue - ou dès qu'une durée existe.
  if (!fait && reelMin == null && !seance.demarree_at) return null;

  const prevuMin = dureePrevueMin(seance);
  const ecart = reelMin != null && prevuMin ? reelMin - prevuMin : null;
  const hhmm = (iso) =>
    iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;

  // On décrit ce qui est constaté, sans en inventer la cause : l'absence de démarrage
  // enregistré peut tenir à une salle jamais ouverte comme à une séance antérieure à la
  // mise en place du suivi, et rien dans les données ne permet de trancher.
  const salleAbandonnee = !!seance.demarree_at && !seance.terminee_at && reelMin == null;
  const message = !seance.demarree_at
    ? "Aucun démarrage de salle n'a été enregistré pour cette séance - la durée est donc inconnue."
    : "La salle a été ouverte mais jamais refermée : le coach a quitté sans clôturer, la durée reste inconnue.";

  return (
    <div style={{ background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:12, padding:"14px 16px", ...style }}>
      <div style={{ fontSize:11, fontWeight:800, color:"#15803d", letterSpacing:".05em", marginBottom:10 }}>
        DÉROULÉ RÉEL
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:12 }}>
        {[
          ["Ouverte à", hhmm(seance.demarree_at) || "-"],
          ["Fermée à", hhmm(seance.terminee_at) || "-"],
          ["Temps en salle", reelMin != null ? `${reelMin} min` : "non relevé"],
          ["Prévu", prevuMin ? `${prevuMin} min` : "-"],
        ].map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize:10, fontWeight:800, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".04em" }}>{l}</div>
            <div style={{ fontSize:15, fontWeight:800, color:"#0f172a", marginTop:2 }}>{v}</div>
          </div>
        ))}
      </div>

      {ecart != null && Math.abs(ecart) >= 5 && (
        <div style={{ marginTop:10, fontSize:12, fontWeight:700, color: ecart < 0 ? "#b91c1c" : "#b45309" }}>
          {ecart < 0 ? `⚠️ ${Math.abs(ecart)} min de moins que prévu` : `+${ecart} min au-delà du prévu`}
        </div>
      )}

      {reelMin == null && (
        <div style={{ marginTop:10, fontSize:11.5, color: salleAbandonnee ? "#b45309" : "#64748b", fontWeight: salleAbandonnee ? 700 : 400 }}>
          {message}
        </div>
      )}
    </div>
  );
}
