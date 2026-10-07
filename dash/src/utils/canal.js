/**
 * LE LIBELLÉ D'UN CANAL DE COURS, à un seul endroit.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 *
 * Quatorze endroits du dash écrivaient la même ligne :
 *
 *     a.type_cours === "en_ligne" ? "En ligne" : `Présentiel${centre ? " · " + centre : ""}`
 *
 * C'est un test BINAIRE sur un champ qui a QUATRE valeurs. Tout ce qui n'est pas `en_ligne`
 * y devient « Présentiel » : un dossier `hybride` s'affiche « Présentiel », un coaching
 * `prive` aussi. Constaté le 07/10/2026 — un apprenant migré vers une classe hybride
 * apparaissait « Présentiel · BET Angré » dans la liste de son assistante EN LIGNE, qui
 * pouvait en conclure que sa migration n'avait pas abouti.
 *
 * Le serveur a déjà son équivalent (`Backend/src/utils/canal.js`, écrit pour la même raison).
 * Le dash n'en avait pas, et quatorze copies d'une règle finissent toujours par diverger.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * `type_cours` MÉLANGE DEUX NOTIONS dans cette base, et ce fichier ne prétend pas les
 * démêler — il se contente de ne pas mentir :
 *   · le CANAL         : `en_ligne`, `presentiel`, `hybride` (et `les_deux`, même sens)
 *   · le TYPE DE COACHING : `prive`, qui dit comment on apprend, pas où.
 * `prive` reçoit donc son propre libellé plutôt que d'être rangé de force dans un lieu.
 */

const LIBELLES = {
  en_ligne:   "En ligne",
  presentiel: "Présentiel",
  hybride:    "Hybride",
  les_deux:   "Hybride",
  prive:      "Coaching privé",
};

/** Le canal comporte-t-il une part en centre ? C'est ce qui décide d'afficher le centre. */
const AVEC_CENTRE = new Set(["presentiel", "hybride", "les_deux"]);

/**
 * Le libellé affichable d'un canal, avec le centre quand il en a un.
 *
 * @param {string} typeCours  la valeur brute de `type_cours`
 * @param {string} [centreNom] le nom du centre, ajouté seulement s'il a un sens ici
 * @param {string} [separateur] « · » par défaut ; certains écrans utilisent « - »
 *
 * UNE VALEUR INCONNUE EST RENDUE TELLE QUELLE. Elle sera moins jolie qu'un libellé, mais
 * elle sera VRAIE — et elle se remarque, ce qui est exactement ce qu'on veut le jour où une
 * cinquième valeur apparaît en base. La remplacer par « Présentiel » est précisément le
 * défaut qu'on corrige.
 */
export function libelleCanal(typeCours, centreNom = null, separateur = " · ") {
  if (!typeCours) return centreNom || "—";
  const base = LIBELLES[typeCours] || typeCours;
  return AVEC_CENTRE.has(typeCours) && centreNom ? `${base}${separateur}${centreNom}` : base;
}

/** Le canal seul, sans le centre — pour les écrans qui affichent les deux séparément. */
export const libelleCanalSeul = (typeCours) =>
  (typeCours ? (LIBELLES[typeCours] || typeCours) : "—");

export default libelleCanal;
