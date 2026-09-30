/**
 * LE LIBELLÉ DE LA MODALITÉ D'UNE CLASSE, dit d'une seule voix.
 *
 * La même chaîne de ternaires était recopiée à quatre endroits du seul tableau de bord
 * commercial, et chaque copie connaissait un jeu de valeurs différent : l'une gérait
 * « domicile » mais pas « hybride », l'autre l'inverse. Une classe pouvait donc s'afficher
 * « ⚡ Hybride » dans la liste et « hybride » brut dans sa fiche, deux clics plus loin.
 *
 * `prive` figure dans cette table parce que la colonne le contient encore sur dix classes :
 * `type_cours` a longtemps mélangé DEUX questions sans rapport - par quel canal le cours se
 * donne-t-il, et est-ce un cours particulier. La seconde a depuis sa propre colonne
 * (`is_prive`, cf. utils/classePrivee.js), mais l'ancienne valeur survit en base et doit
 * rester lisible.
 */
export const LIBELLES_TYPE_COURS = {
  en_ligne:   "🌐 En ligne",
  presentiel: "🏢 Présentiel",
  hybride:    "⚡ Hybride",
  domicile:   "🏠 Domicile",
  prive:      "👤 Privé",
};

/**
 * Le libellé d'une classe, ou son `type_cours` brut si la valeur est inconnue - plutôt qu'un
 * tiret, qui ferait croire à une donnée absente là où elle est seulement inattendue.
 */
export function libelleTypeCours(groupe) {
  const v = groupe?.type_cours;
  return LIBELLES_TYPE_COURS[v] || v || "-";
}

/* Certains écrans dessinent l'icône séparément du texte (colonne d'un tableau, en-tête sur
   fond coloré) : ils ont besoin des deux moitiés, pas de la chaîne assemblée. */
const ICONES_TYPE_COURS = {
  en_ligne: "💻", presentiel: "🏢", hybride: "⚡", domicile: "🏠", prive: "👤",
};
const TEXTES_TYPE_COURS = {
  en_ligne: "En ligne", presentiel: "Présentiel", hybride: "Hybride",
  domicile: "Domicile", prive: "Privé",
};

/**
 * @returns {{icone: string, texte: string}}
 *
 * LE REPLI NE VAUT PLUS « PRÉSENTIEL ». Ces écrans retombaient sur « 🏢 Présentiel » dès que
 * la valeur n'était ni `en_ligne` ni `domicile` : une classe HYBRIDE s'affichait donc
 * « Présentiel » chez le coach, pendant que la commerciale lisait « ⚡ Hybride » sur la même
 * classe. Un repli qui affirme quelque chose de faux est pire qu'un repli qui l'avoue.
 */
export function iconeEtTexteTypeCours(groupe) {
  const v = groupe?.type_cours;
  return { icone: ICONES_TYPE_COURS[v] || "📘", texte: TEXTES_TYPE_COURS[v] || v || "-" };
}

export default libelleTypeCours;
