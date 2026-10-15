/**
 * Le vocabulaire du rapport d'observation, écrit une seule fois.
 *
 * Ces libellés étaient recopiés dans six écrans (formulaire du superviseur, lecture du
 * rapport, modal coach, SuperAdmin, export Excel). Renommer un critère obligeait à
 * retrouver les six copies, et en oublier une suffisait à ce que deux écrans nomment
 * différemment la même note.
 */

/** Les sept critères notés de 1 à 5, dans l'ordre de la grille. */
export const CRITERES_OBSERVATION = [
  { cle: "ponctualite",           label: "Ponctualité",           icon: "⏰" },
  { cle: "pedagogie",             label: "Pédagogie",             icon: "🎓" },
  { cle: "preparation",           label: "Organisation du cours", icon: "📝" },
  { cle: "expression_engagement", label: "Expression & engagement", icon: "🗣" },
  { cle: "gestion_classe",        label: "Gestion de classe",     icon: "🧑‍🏫" },
  { cle: "feedback_correction",   label: "Feedback & correction", icon: "✍️" },
  { cle: "professionnalisme",     label: "Professionnalisme",     icon: "🤝" },
];

/**
 * Critères qui ne sont plus saisis mais que portent les rapports antérieurs.
 *
 * `respect_programme` y figurait jusqu'au 27/09/2026 : il n'était plus saisi ni compté
 * dans la note, mais restait affiché sur les anciens rapports sous son vrai nom. La
 * direction a demandé son retrait complet des écrans.
 *
 * LES NOTES RESTENT EN BASE, dans la colonne du même nom - rien n'a été supprimé. Elles ne
 * sont simplement plus lisibles nulle part. Si ce critère devait réapparaître un jour, il
 * suffirait de le remettre dans cette liste : les données l'attendent.
 */
export const CRITERES_HERITES = [];

/** Tout ce qu'un écran de LECTURE doit savoir afficher : l'actuel et l'hérité. */
export const CRITERES_LECTURE = [...CRITERES_OBSERVATION, ...CRITERES_HERITES];

/** Table clé → libellé, pour les écrans qui itèrent sur les colonnes d'un rapport. */
export const LIBELLES_CRITERES = Object.fromEntries(
  CRITERES_LECTURE.map(c => [c.cle, { label: c.label, icon: c.icon, herite: !!c.herite }])
);

/* ── Contexte de l'observation ─────────────────────────────────────────── */

export const TYPES_OBSERVATION = [
  { v: "cours",         l: "Cours normal",  icon: "👁" },
  { v: "evaluation",    l: "Évaluation",    icon: "📊" },
  { v: "mock_teaching", l: "Mock teaching", icon: "🎭" },
];

/**
 * La modalité du cours.
 *
 * ⚠️ Cette colonne décrivait auparavant le CONTENU (Grammaire, Expression orale,
 * Compréhension…). Les rapports antérieurs portent encore ces valeurs-là ; `libelleLecon`
 * les rend telles quelles plutôt que de les afficher vides.
 */
export const TYPES_LECON = [
  { v: "online",        l: "Online",        icon: "💻" },
  { v: "in_person",     l: "In-person",     icon: "🏫" },
  { v: "home_tutoring", l: "Home-tutoring", icon: "🏠" },
];

export const libelleLecon = (v) =>
  !v ? "" : (TYPES_LECON.find(t => t.v === v)?.l || v);

export const libelleObservation = (v) =>
  !v ? "" : (TYPES_OBSERVATION.find(t => t.v === v)?.l || v);

/**
 * État de la connexion pendant la séance. HORS NOTE, délibérément : un coach ne maîtrise
 * pas la stabilité de sa connexion, et l'y noter reviendrait à sanctionner une coupure de
 * courant. C'est un constat de contexte.
 *
 * « Autre » vaut « non applicable » : un cours en salle n'a pas d'état de connexion à
 * constater. Toujours proposé - le conditionner au champ « Type de leçon » le rendait
 * invisible à l'observateur qui venait de choisir une séance en présentiel, ce champ-là
 * n'étant pas encore rempli à ce moment du formulaire.
 */
export const ETATS_INTERNET = [
  { v: "stable",   l: "Stable",   icon: "📶", coul: "#16a34a", fond: "#dcfce7" },
  { v: "instable", l: "Instable", icon: "📉", coul: "#dc2626", fond: "#fee2e2" },
  { v: "autre",    l: "Autre",    icon: "➖", coul: "#64748b", fond: "#f1f5f9",
    aide: "Non applicable - cours en présentiel" },
];

export const libelleInternet = (v) =>
  !v ? "" : (ETATS_INTERNET.find(e => e.v === v)?.l || v);

export default CRITERES_OBSERVATION;
