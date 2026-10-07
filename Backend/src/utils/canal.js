/**
 * LE CANAL D'UN DOSSIER, ET QUI PEUT LE PRENDRE.
 *
 * POURQUOI CE FICHIER. Le libellé d'un canal était réécrit à chaque endroit qui en avait
 * besoin - deux copies côté backend, avec deux casses différentes - et le contrôle de
 * compatibilité entre une assistante et un dossier était une simple égalité, écrite en ligne
 * dans la route de transfert. Cette égalité était fausse, et sa fausseté rendait certains
 * dossiers inattribuables.
 *
 * DEUX VOCABULAIRES POUR LA MÊME IDÉE, et il faut vivre avec : une assistante dit `les_deux`
 * quand elle couvre les deux canaux, une classe et un dossier disent `hybride`. Les colonnes
 * sont distinctes, les valeurs n'ont jamais été alignées, et les renommer toucherait des
 * écrans qui n'ont rien demandé. On les traite donc comme deux orthographes du même mot.
 */

/** Couvre les deux canaux à la fois - quelle que soit la table qui le dit. */
const EST_MIXTE = (c) => c === "hybride" || c === "les_deux";

/**
 * Est-ce un CANAL, c'est-à-dire un endroit où l'on suit ses cours ?
 *
 * POURQUOI LA QUESTION SE POSE. `groupes.type_cours` mélange deux notions : trois valeurs
 * disent un canal (`en_ligne`, `presentiel`, `hybride`) et une quatrième dit un TYPE DE
 * COACHING (`prive`, sur 10 classes). Pour un apprenant en coaching privé, le canal ne vit
 * donc pas sur sa classe mais sur son DOSSIER - lequel vaut bien `en_ligne` ou `presentiel`.
 *
 * Confondre les deux a deux conséquences, toutes deux constatées :
 *   · `canalCibleDe("prive")` rend « en ligne » quoi qu'il arrive, puisque la valeur n'est
 *     pas « en_ligne » - on proposerait de migrer vers le en ligne quelqu'un qui y est déjà ;
 *   · à la clôture d'une migration, recopier le `type_cours` d'une classe privée sur le
 *     dossier y écrirait `prive` et EFFACERAIT le canal que la migration venait de changer.
 */
export const estCanal = (c) => c === "en_ligne" || c === "presentiel" || EST_MIXTE(c);

/**
 * Le libellé autonome : un badge, une colonne, une étiquette.
 */
export const libelleCanal = (c) =>
  c === "en_ligne" ? "En ligne"
  : c === "presentiel" ? "Présentiel"
  : EST_MIXTE(c) ? "Hybride"
  : null;

/**
 * Le même, pour l'intérieur d'une phrase : « passe du présentiel au en ligne ».
 * Deux fonctions plutôt qu'une capitale ajoutée après coup, parce que « En ligne » au milieu
 * d'une phrase et « en ligne » sur un badge sont tous les deux fautifs.
 */
export const libelleCanalPhrase = (c) =>
  c === "en_ligne" ? "en ligne"
  : c === "presentiel" ? "présentiel"
  : EST_MIXTE(c) ? "hybride"
  : null;

/**
 * Cette assistante peut-elle prendre ce dossier ?
 *
 * CE QUE L'ÉGALITÉ STRICTE RATAIT, et ce n'était pas théorique :
 *
 *   · UN DOSSIER `hybride` N'ÉTAIT ATTRIBUABLE À PERSONNE. Aucune assistante ne porte le
 *     canal `hybride` - elles sont `en_ligne` ou `presentiel` - donc toute tentative tombait
 *     en 409. Or une migration vers le en ligne produit exactement ce dossier dès que la
 *     classe d'arrivée est hybride : le cas était garanti, pas hypothétique.
 *
 *   · UNE ASSISTANTE `les_deux` NE POUVAIT RIEN PRENDRE, alors que `/assistantes-ligne` la
 *     propose explicitement dans la liste de choix. L'écran offrait donc un choix que le
 *     serveur refusait.
 *
 * LA RÈGLE : un canal mixte est compatible avec tout, d'un côté comme de l'autre. Un canal
 * inconnu ou absent ne bloque pas - on ne refuse pas sur une information qu'on n'a pas. Seule
 * une opposition franche, `en_ligne` contre `presentiel`, est refusée.
 */
export const canauxCompatibles = (canalAssistante, canalDossier) => {
  if (!canalAssistante || !canalDossier) return true;
  if (EST_MIXTE(canalAssistante) || EST_MIXTE(canalDossier)) return true;
  return canalAssistante === canalDossier;
};
