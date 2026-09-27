/**
 * La note d'un rapport d'observation - une seule formule, un seul endroit.
 *
 * Elle vivait en DOUBLE, recopiée à l'identique dans `superviseurRoutesDash.js` et
 * `superviseurRoutesBet.js`, et elle ne disait pas la même chose que la feuille Excel
 * exportée. Concrètement, sur deux observations du même coach :
 *
 *     SHITTU  note affichée 2.6   TOTAL /70 = 30
 *     KONE    note affichée 2.3   TOTAL /70 = 32
 *
 * Le classement s'inversait d'un écran à l'autre. La cause n'était pas un arrondi : la
 * note moyennait NEUF éléments - les cinq critères pédagogiques plus Ponctualité,
 * Professionnalisme, Interactivité et Grammaire - alors que le barème officiel BET n'en
 * compte que CINQ, pondérés. Un coach faible en pédagogie mais ponctuel passait devant un
 * coach meilleur en classe.
 *
 * C'est le barème officiel qui fait foi. La note est donc le `TOTAL /35` ramené sur 5,
 * c'est-à-dire une MOYENNE PONDÉRÉE des notes /5 par le poids de chaque critère :
 *
 *     note = Σ(note_i × poids_i) / Σ(poids_i)
 *
 * Les notes étant des entiers de 1 à 5 et les poids des multiples de 5, la conversion
 * tombe toujours juste : le total affiché dans la feuille et la note ne peuvent plus
 * diverger d'un dixième.
 *
 * Interactivité et Grammaire restent des APPRÉCIATIONS qualitatives, hors note. Ponctualité
 * et Professionnalisme, eux, sont entrés dans le calcul le 27/09/2026 (voir plus bas).
 */

/**
 * ── BARÈME RÉVISÉ LE 27/09/2026 ────────────────────────────────────────────────────
 *
 * SEPT CRITÈRES, CHACUN SUR 5, TOTAL SUR 35. La pondération précédente (5/20/20/15/10
 * sur 70) est abandonnée à la demande de la direction : la feuille d'appraisal officielle
 * note désormais chaque critère sur 5, sans poids.
 *
 * CE QUE CE CHANGEMENT DÉPLACE, et il faut le savoir en relisant un classement :
 * Ponctualité et Professionnalisme entraient jusqu'ici dans le rapport comme de simples
 * appréciations, hors de la note. Ils y pèsent maintenant autant que la pédagogie - qui
 * passe de 28,6 % à 14,3 %. Un coach régulier et irréprochable sur la forme remonte donc
 * face à un meilleur pédagogue. C'est une décision de management, pas un effet de bord.
 *
 * `respect_programme` ne figure ni ici ni ailleurs : retiré du produit le même jour.
 */
export const CRITERES_NOTES = [
  { cle: "preparation",           poids: 5, libelle: "Class Organization" },
  { cle: "pedagogie",             poids: 5, libelle: "Teaching Methodology" },
  { cle: "expression_engagement", poids: 5, libelle: "Speaking & Learner Engagement" },
  { cle: "gestion_classe",        poids: 5, libelle: "Classroom Management" },
  { cle: "feedback_correction",   poids: 5, libelle: "Feedback & Error Correction" },
  { cle: "ponctualite",           poids: 5, libelle: "Punctuality" },
  { cle: "professionnalisme",     poids: 5, libelle: "Professionalism (Behaviour, Hw, sheet, Meet; administrative compliance)" },
];

export const BAREME_TOTAL = CRITERES_NOTES.reduce((s, c) => s + c.poids, 0);   // 35

/** Une note saisie, ou `null`. Le formulaire envoie 0 pour « non noté ». */
const noteValide = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Le total sur 35, et le barème réellement applicable.
 *
 * Un critère non noté est exclu AVEC SON POIDS : un rapport où seules Pédagogie et
 * Feedback sont remplies se calcule sur 10, pas sur 35. Le compter sur 70 rendrait tout
 * rapport partiel catastrophique, ce qui punirait l'observateur pressé plutôt que le coach.
 */
export function totalObservation(rapport = {}) {
  let points = 0, bareme = 0;
  for (const c of CRITERES_NOTES) {
    const n = noteValide(rapport[c.cle]);
    if (n === null) continue;
    points += (n / 5) * c.poids;
    bareme += c.poids;
  }
  return { points: Math.round(points), bareme, complet: bareme === BAREME_TOTAL };
}

/**
 * La note sur 5 - celle qu'affichent les tableaux de bord et qui décide de la catégorie
 * de contrat. Renvoie une CHAÎNE à une décimale, comme la colonne `numeric` de la table.
 * `null` si aucun critère n'a été noté : une note inventée vaudrait moins que pas de note.
 */
export function noteObservation(rapport = {}) {
  const { points, bareme } = totalObservation(rapport);
  if (!bareme) return null;
  return ((points / bareme) * 5).toFixed(1);
}

/**
 * La synthèse, déduite de la note.
 *
 * Elle était saisie à la main dans la feuille d'origine alors qu'elle résume les autres
 * critères - d'où des rapports où elle les contredisait. Seuils inchangés : 85 % et 65 %
 * de la note maximale.
 */
export function syntheseObservation(note) {
  if (note === null || note === undefined) return null;
  const n = parseFloat(note);
  if (!Number.isFinite(n)) return null;
  return n >= 4.25 ? "excellent" : n >= 3.25 ? "satisfaisant" : "a_accompagner";
}

/**
 * Les points des deux échelles fermées.
 *
 * Elles ne comptent PLUS dans la note - le barème officiel ne les porte pas - mais la
 * conversion reste ici, en un seul endroit, parce que les écrans de lecture et les
 * exports continuent de les afficher et qu'aucun ne doit la réinventer.
 */
export const POINTS_INTERACTIVITE = { excellent: 5, bon: 4, acceptable: 3, insuffisant: 1 };
export const POINTS_GRAMMAIRE = {
  inductive_claire: 5, inductive_perfectible: 4, deductive_claire: 3, confuse: 1,
};
