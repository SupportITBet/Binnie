/**
 * Le plan de paiement mensuel, lu côté écran.
 *
 * LES MÊMES RÈGLES QUE LE CRON, délibérément. Les rappels J-7 / J-3 / J-1 que reçoit
 * l'apprenant sont calculés par `Backend/src/services/planPaiement.js` ; si cet écran
 * calculait l'échéance autrement, il annoncerait une date et la notification une autre.
 * Trois règles sont donc recopiées à l'identique, et il faut les faire évoluer ensemble :
 *
 *   · `echeance_override` PRIME sur le jour d'ancrage du plan - un mois peut avoir été
 *     décalé à la main ;
 *   · un mois `neutralise` (gelé par une pause ou un arrêt de formation) n'est plus dû,
 *     jamais rappelé, et ne doit donc jamais apparaître comme prochaine échéance ;
 *   · « paye » et « payé » cohabitent en base - filtrer sur un seul en perd la moitié.
 */

const dernierJourDuMois = (annee, moisIndex) => new Date(annee, moisIndex + 1, 0).getDate();

/** La date à laquelle un mois est dû. */
export const dateEcheanceMois = (periode, jourEcheance, echeanceOverride = null) => {
  if (echeanceOverride) {
    const d = new Date(echeanceOverride);
    if (!Number.isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); return d; }
  }
  const [y, m] = String(periode).split("-").map(Number);
  if (!y || !m) return null;
  const jour = Math.min(jourEcheance || 1, dernierJourDuMois(y, m - 1));
  return new Date(y, m - 1, jour);
};

/** Somme des versements encaissés sur un mois. */
export const totalPayeMois = (mois) => (mois?.tranches || [])
  .filter((t) => t.statut === "paye" || t.statut === "payé")
  .reduce((s, t) => s + (t.montant || 0), 0);

/** Un mois gelé par une pause : plus rien n'est dû dessus. */
export const estNeutralise = (mois) => !!mois?.neutralise;

/** L'état d'un mois : payé, partiel, en retard, ou à venir. */
export const statutMois = (mois, plan, aujourdhui = new Date()) => {
  if (estNeutralise(mois)) return "annule";
  const paye = totalPayeMois(mois);
  if (paye >= (mois.montant || 0)) return "paye";
  if (paye > 0) return "partiel";
  const ech = dateEcheanceMois(mois.periode, plan?.jour_echeance, mois.echeance_override);
  const t = new Date(aujourdhui); t.setHours(0, 0, 0, 0);
  return ech && ech < t ? "retard" : "en_attente";
};

/**
 * Le même calcul, à la signature des écrans de gestion - et SANS l'état « annule ».
 *
 * Les dashboards commerciale et PA détectent eux-mêmes les mois gelés, AVANT d'appeler
 * cette fonction, et habillent la ligne à leur façon (« Annulée » chez l'une, « Gelé -
 * non dû » chez l'autre). Leur renvoyer « annule » changerait le sens de leurs
 * comparaisons `statut !== "paye"` et ferait réapparaître des boutons de paiement sur un
 * mois qui n'est plus dû. Cette variante reste donc sur les quatre états d'origine.
 *
 * @param {string} todayStr  la date du jour au format ISO, comme l'attendaient les écrans
 */
export const statutMoisEcran = (mois, todayStr, jourEcheance = 1) => {
  const paye = totalPayeMois(mois);
  if (paye >= (mois?.montant || 0)) return "paye";
  if (paye > 0) return "partiel";
  const ech = dateEcheanceMois(mois.periode, jourEcheance, mois.echeance_override);
  const t = todayStr ? new Date(todayStr) : new Date();
  t.setHours(0, 0, 0, 0);
  return ech && ech < t ? "retard" : "en_attente";
};

/** `true` si ce plan est un plan mensuel exploitable. */
export const estPlanMensuel = (plan) => Array.isArray(plan?.mois_paiements) && plan.mois_paiements.length > 0;

/**
 * La prochaine échéance à régler, ou la raison pour laquelle il n'y en a pas.
 *
 * Retourne toujours un objet : l'écran doit pouvoir DIRE « facturation suspendue » ou
 * « vous êtes à jour » plutôt que d'afficher un vide, qui se lit comme une panne.
 *
 * @returns {{ etat: "aucun_plan"|"suspendu"|"a_jour"|"du",
 *             mois?: object, montant?: number, echeance?: Date, jours?: number,
 *             dernierPaye?: object }}
 */
export function prochaineEcheance(plan, aujourdhui = new Date()) {
  if (!estPlanMensuel(plan)) return { etat: "aucun_plan" };

  const t = new Date(aujourdhui); t.setHours(0, 0, 0, 0);
  const mois = [...plan.mois_paiements].sort((a, b) => String(a.periode).localeCompare(String(b.periode)));

  // Le dernier mois réellement soldé - il sert à dire « à jour jusqu'à … » plutôt qu'un
  // « rien à payer » sans repère.
  const payes = mois.filter((m) => !estNeutralise(m) && totalPayeMois(m) >= (m.montant || 0));
  const dernierPaye = payes[payes.length - 1] || null;

  /* La suspension se teste AVANT de chercher un mois dû. Un plan gelé garde ses mois à
     venir en base, à montant zéro : sans ce test, l'écran annoncerait « 0 F à payer le
     11/10 » à quelqu'un dont la facturation est arrêtée. */
  if (plan.actif === false) {
    const suspension = (plan.suspensions || []).find((s) => !s.fin) || null;
    return { etat: "suspendu", suspension, dernierPaye };
  }

  const du = mois.find((m) => !estNeutralise(m) && totalPayeMois(m) < (m.montant || 0));
  if (!du) return { etat: "a_jour", dernierPaye };

  const echeance = dateEcheanceMois(du.periode, plan.jour_echeance, du.echeance_override);
  const montant = Math.max(0, (du.montant || 0) - totalPayeMois(du));
  // Arrondi à la journée : c'est le seuil qu'emploient les rappels J-7 / J-3 / J-1, et
  // deux comptes différents produiraient un « dans 7 jours » sans rappel, ou l'inverse.
  const jours = echeance ? Math.round((echeance - t) / 86400000) : null;

  return { etat: "du", mois: du, montant, echeance, jours, dernierPaye, partiel: totalPayeMois(du) > 0 };
}

/** « dans 12 jours », « demain », « en retard de 3 jours » - jamais un nombre brut. */
export function delaiLisible(jours) {
  if (jours == null) return "";
  if (jours < -1) return `en retard de ${Math.abs(jours)} jours`;
  if (jours === -1) return "en retard d'un jour";
  if (jours === 0) return "à régler aujourd'hui";
  if (jours === 1) return "demain";
  if (jours <= 7) return `dans ${jours} jours`;
  return `dans ${jours} jours`;
}

/**
 * Le prochain rappel automatique que l'apprenant recevra, s'il y en a un.
 *
 * Le cron notifie à J-7, J-3 et J-1. Le dire sur la carte évite la question « pourquoi
 * personne ne me prévient ? » - et évite surtout que l'écran paraisse contredire une
 * notification déjà reçue.
 */
export function prochainRappel(jours) {
  if (jours == null || jours < 1) return null;
  const seuil = [7, 3, 1].find((s) => s <= jours);
  return seuil ? { seuil, dans: jours - seuil } : null;
}

export const MOIS_FR = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/** « Octobre 2026 » à partir de « 2026-10 ». */
export const libelleMois = (periode) => {
  const [y, m] = String(periode || "").split("-");
  return MOIS_FR[parseInt(m, 10)] ? `${MOIS_FR[parseInt(m, 10)]} ${y}` : (periode || "-");
};
