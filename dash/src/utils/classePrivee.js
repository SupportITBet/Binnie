/**
 * UNE CLASSE EST-ELLE UN COACHING PRIVÉ ?
 *
 * Cette question se posait à seize endroits du code, et se répondait partout de la même
 * façon : `capacite_max === 1`. Une déduction, pas une donnée - et elle interdisait le cas
 * le plus banal du coaching privé : un couple ou une famille qui s'inscrit ensemble. Monter
 * la capacité à trois pour les loger faisait basculer la classe en « groupe » sur tous les
 * écrans à la fois, sans que personne l'ait demandé.
 *
 * La colonne `groupes.is_prive` existait depuis le début et n'était écrite nulle part.
 * Elle l'est depuis le 26/09/2026 (POST /api/groupes), et c'est elle qui fait foi.
 *
 * LE REPLI SUR LA CAPACITÉ RESTE, ET DOIT RESTER : les classes créées avant cette date
 * n'ont que leur capacité pour dire ce qu'elles sont. Le retirer les ferait toutes basculer
 * en « groupe » du jour au lendemain. Il ne pourra tomber qu'après une reprise de données
 * qui posera `is_prive = true` sur l'existant - et pas avant.
 *
 * LES DEUX FORMES DE NOMMAGE sont acceptées parce que les routes ne parlent pas d'une seule
 * voix : `GET /api/groupes` renvoie l'objet classe tel quel (`is_prive`, `capacite_max`),
 * tandis que la route des apprenants aplatit la classe dans chaque ligne en préfixant ses
 * champs (`groupe_is_prive`, `groupe_capacite_max`). Un helper qui n'en connaîtrait qu'une
 * marcherait sur la moitié des écrans - c'est exactement le genre de demi-fonctionnement
 * qui se découvre trois semaines plus tard.
 */
export function estClassePrivee(g) {
  if (!g) return false;
  if (g.is_prive === true || g.groupe_is_prive === true) return true;
  const capacite = g.capacite_max ?? g.groupe_capacite_max;
  return capacite === 1 || capacite === "1";
}

export default estClassePrivee;
