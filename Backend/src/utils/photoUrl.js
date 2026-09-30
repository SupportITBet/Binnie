/**
 * Validation d'une URL de photo, partagée par tout ce qui en accepte une.
 *
 * POURQUOI C'EST UNE VALIDATION DE SÉCURITÉ, et pas une simple politesse : cette valeur
 * finit dans un attribut `src`. Une chaîne `javascript:…` y serait exécutée par le
 * navigateur de chaque personne qui affiche l'image - les membres d'un groupe, les
 * apprenants d'une classe, leurs parents. On n'accepte donc que http(s), et rien d'autre.
 *
 * `v === undefined` SIGNIFIE « CHAMP ABSENT », PAS « PHOTO INVALIDE ». La distinction a
 * déjà coûté cher : la création de groupe libre n'envoyait pas `photo_url` du tout,
 * `String(undefined)` valait `"undefined"`, la regex le rejetait, et toute création
 * répondait 400 « Photo invalide » - un message impossible à comprendre puisque aucune
 * photo n'avait été proposée. Créer un groupe était devenu impossible.
 *
 * @param {*} v
 * @returns {string|null|undefined} l'URL, `null` s'il n'y en a pas,
 *          ou `undefined` si la valeur est inexploitable - c'est ce cas que l'appelant refuse.
 */
export const photoValide = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  return /^https?:\/\//i.test(s) && s.length <= 500 ? s : undefined;   // undefined = refusée
};

export default photoValide;
