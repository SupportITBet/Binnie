/**
 * Catégorie de contrat d'un coach, déduite de sa note moyenne.
 *
 * Le barème est celui de la direction : la note d'observation ne sert pas seulement à
 * situer un coach dans un classement, elle détermine la catégorie de contrat à laquelle
 * il peut prétendre. D'où l'affichage d'un libellé et pas seulement d'un chiffre - « 3,4 »
 * ne dit rien à qui ne connaît pas les seuils, « BET Group » se lit immédiatement.
 *
 *   ≥ 4          Corporate
 *   ≥ 3  et < 4  BET Group
 *   ≥ 2.5 et < 3 Needs Improvement
 *   < 2.5        Needs Retraining
 *
 * ⚠️ Cette note vient des OBSERVATIONS (superviseur / conseiller pédagogique) :
 * `evaluations_coachs.note_finale` et `rapports_observation.note_globale`. Les
 * appréciations laissées par les apprenants n'y entrent pas - décision explicite, elles
 * ne sont pas comptabilisées pour la catégorie de contrat. Ne pas poser ce badge sur une
 * moyenne issue des appréciations d'apprenants : il y affirmerait le contraire.
 *
 * ⚠️ COPIE VOLONTAIRE de `dash/src/utils/categorieCoach.js`, et les VALEURS DOIVENT RESTER
 * IDENTIQUES. Les deux plateformes ne partagent pas de code, mais elles parlent des mêmes
 * personnes : un barème qui diverge classerait le même coach différemment selon l'écran
 * d'où on le regarde. C'est exactement ce qui se passait avant ce fichier - bet-elearning
 * coloriait les notes à 4,5 / 3,5 / 2,5 dans le classement du PA Advisor, contre 4 / 3 /
 * 2,5 chez dash : un coach à 4,2 était « Corporate » vert d'un côté et bleu de l'autre.
 * Toute correction du barème doit être reportée des deux côtés.
 */

/** Ordre décroissant : le premier seuil atteint gagne. */
export const CATEGORIES_COACH = [
  { cle: 'corporate',   seuil: 4,   libelle: 'Corporate',         court: 'Corporate',  couleur: '#16a34a', fond: '#dcfce7', bord: '#86efac' },
  { cle: 'bet_group',   seuil: 3,   libelle: 'BET Group',         court: 'BET Group',  couleur: '#0891b2', fond: '#e0f2fe', bord: '#7dd3fc' },
  { cle: 'improvement', seuil: 2.5, libelle: 'Needs Improvement', court: 'Improvem.',  couleur: '#f59e0b', fond: '#fef3c7', bord: '#fcd34d' },
  { cle: 'retraining',  seuil: 0,   libelle: 'Needs Retraining',  court: 'Retraining', couleur: '#ef4444', fond: '#fee2e2', bord: '#fca5a5' },
];

/** Catégorie « absente » : un coach jamais observé n'est pas un mauvais coach. */
export const CATEGORIE_SANS_NOTE = {
  cle: 'sans_note', libelle: 'Non évalué', court: 'Non évalué',
  couleur: '#9ca3af', fond: '#f3f4f6', bord: '#e5e7eb',
};

/**
 * @param {number|string|null} note moyenne sur 5
 * @returns la catégorie, ou `CATEGORIE_SANS_NOTE` si la note est absente ou nulle.
 */
export function categorieCoach(note) {
  const n = Number(note);
  if (!Number.isFinite(n) || n <= 0) return CATEGORIE_SANS_NOTE;
  return CATEGORIES_COACH.find(c => n >= c.seuil) || CATEGORIES_COACH[CATEGORIES_COACH.length - 1];
}

/**
 * Couleurs des notes, alignées sur les seuils des catégories.
 *
 * Les faire dériver de la catégorie plutôt que de les redéfinir évite le cas où un coach
 * à 4,2 porterait un badge vert « Corporate » à côté d'un cercle de note bleu - deux
 * verdicts contradictoires sur la même carte.
 */
export const NOTE_COULEUR = (n) => categorieCoach(n).couleur;
export const NOTE_FOND    = (n) => categorieCoach(n).fond;
export const NOTE_BORD    = (n) => categorieCoach(n).bord;

/** Le barème en toutes lettres, pour les infobulles. */
export const BAREME_TEXTE =
  '≥ 4 : Corporate · 3 à 4 : BET Group · 2,5 à 3 : Needs Improvement · < 2,5 : Needs Retraining';

/* ── TENDANCE ──────────────────────────────────────────────────────────────
   La comparaison de la DERNIÈRE note à la PREMIÈRE de la période, et non à la moyenne :
   on veut savoir si le coach progresse, pas s'il est au-dessus de son propre niveau.
   Sous deux notes il n'y a pas de tendance - « stable » serait une affirmation gratuite,
   d'où l'icône neutre et le libellé explicite. */
export const TENDANCES = {
  hausse: { icone: '↗', couleur: '#16a34a', libelle: 'En progression' },
  baisse: { icone: '↘', couleur: '#ef4444', libelle: 'En recul' },
  stable: { icone: '→', couleur: '#94a3b8', libelle: 'Stable' },
};

/**
 * @param {number[]} notes dans l'ordre chronologique
 * @returns {'hausse'|'baisse'|'stable'}
 */
export function tendanceDe(notes = []) {
  if (!Array.isArray(notes) || notes.length < 2) return 'stable';
  const premier = Number(notes[0]);
  const dernier = Number(notes[notes.length - 1]);
  if (!Number.isFinite(premier) || !Number.isFinite(dernier)) return 'stable';
  if (dernier > premier) return 'hausse';
  if (dernier < premier) return 'baisse';
  return 'stable';
}

export default categorieCoach;
