import supabase from "../config/supabase.js";

/**
 * De quelle plateforme vient l'apprenant qui appelle ?
 *
 * ── LE PROBLÈME QUE CE MODULE RÉSOUT ──
 * Les apprenants de BET Languages et ceux de BET E-Learning vivent dans deux jeux de tables
 * sans aucune ligne en commun : `groupes_apprenants` / `seances` / `assignations_parcours`
 * d'un côté, `classes_elearning_apprenants` / `seances_elearning` / `contenus_classes_elearning`
 * de l'autre. Les routes de l'espace apprenant n'interrogeaient que les premières.
 *
 * Mesuré sur un apprenant e-learning réel, à travers l'application mobile : il se connecte
 * (le contrôle d'éligibilité, lui, connaît les deux mondes) puis reçoit `actif: false` et
 * « Vous n'êtes pas encore affecté(e) à une classe » — alors qu'il a une classe, cinq
 * séances, trois cours et un devoir. Séances, présences, évaluations, fichiers, contacts et
 * sessions live répondaient tous une liste vide.
 *
 * ── POURQUOI UN EN-TÊTE PLUTÔT QU'UNE DÉTECTION AUTOMATIQUE ──
 * On pourrait chercher l'apprenant dans les deux mondes et servir celui qui répond. Ce serait
 * une devinette coûteuse (deux lectures par appel) et surtout ambiguë : un même e-mail peut
 * exister des deux côtés — un salarié formé en présentiel puis passé en e-learning — et la
 * route choisirait alors au hasard des données qui ne sont pas celles de l'écran ouvert.
 * Le client sait de quel espace il parle ; il le dit. C'est déjà ce que font `X-Plateforme`
 * côté web et `contexteMarquage` / `contexteMarquageEl` pour le verrou de lecture.
 *
 * ── LA RÈGLE PAR DÉFAUT EST « DASH » ──
 * Sans en-tête, on répond comme avant. Les clients existants — espace web de dash, et les
 * apprenants BET Languages déjà sur l'application mobile — ne voient aucun changement :
 * la branche e-learning ne s'ouvre QUE sur demande explicite.
 */

/** La plateforme déclarée par l'appelant. `dash` tant que rien ne dit le contraire. */
export function plateformeDe(req) {
  const brut = req?.headers?.["x-plateforme"] ?? req?.headers?.["X-Plateforme"];
  return String(brut || "").trim().toLowerCase() === "bet-elearning" ? "bet-elearning" : "dash";
}

/** Raccourci de lecture : `if (estElearning(req)) …`. */
export function estElearning(req) {
  return plateformeDe(req) === "bet-elearning";
}

/**
 * Les inscriptions e-learning d'une personne, par identifiant ET par e-mail.
 *
 * LES DEUX AXES COEXISTENT EN BASE : un apprenant importé par fichier n'a que son e-mail, un
 * apprenant créé depuis l'application a un `apprenant_id`. Chercher sur un seul axe en perd
 * la moitié. L'identifiant prime quand les deux désignent la même inscription — c'est la
 * ligne liée au compte, la seule que les écrans de gestion tiennent à jour.
 *
 * @param {{id?: string, email?: string}} user
 * @returns {Promise<object[]>} les inscriptions, classe jointe, les plus récentes d'abord.
 */
export async function inscriptionsElearningDe(user) {
  const CHAMPS = "*, classe:classes_elearning(*)";
  const [parId, parEmail] = await Promise.all([
    user?.id
      ? supabase.from("classes_elearning_apprenants").select(CHAMPS).eq("apprenant_id", user.id)
      : Promise.resolve({ data: [] }),
    user?.email
      ? supabase.from("classes_elearning_apprenants").select(CHAMPS).ilike("email", user.email)
      : Promise.resolve({ data: [] }),
  ]);

  const vues = new Map();
  for (const r of parId.data || [])    if (r?.id) vues.set(r.id, r);
  for (const r of parEmail.data || []) if (r?.id && !vues.has(r.id)) vues.set(r.id, r);

  return [...vues.values()].sort((a, b) =>
    String(b.date_inscription || b.date_ajout || "").localeCompare(String(a.date_inscription || a.date_ajout || "")));
}

/**
 * L'inscription COURANTE : celle sur laquelle l'apprenant travaille aujourd'hui.
 *
 * Un apprenant retiré garde ses anciennes données consultables, mais ce n'est plus son
 * parcours en cours : on l'écarte ici, et on retombe sur la plus récente s'il n'en reste
 * aucune d'active — mieux vaut montrer un parcours terminé que rien du tout.
 */
export function inscriptionCourante(inscriptions) {
  const liste = inscriptions || [];
  return liste.find(i => i.statut !== "retire" && i.statut !== "suspendu")
      || liste.find(i => i.statut !== "retire")
      || liste[0]
      || null;
}

/** Les identifiants de classe d'une liste d'inscriptions, dédoublonnés. */
export const classeIdsDe = (inscriptions) =>
  [...new Set((inscriptions || []).map(i => i.classe_id).filter(Boolean))];
