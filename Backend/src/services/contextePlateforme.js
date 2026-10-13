import { AsyncLocalStorage } from "node:async_hooks";

/**
 * La plateforme d'où vient la requête en cours, disponible sans la passer de main en main.
 *
 * LE PROBLÈME QU'IL RÉSOUT. `notifyRole` écrit une colonne `source` qui sépare les cloches
 * des deux plateformes : dash ne montre que `dash`, bet-elearning que `bet-elearning`.
 * Mais cette source était un DÉFAUT de fonction (`'dash'`), posé au hasard de chaque point
 * d'appel : sur 108 appels, 107 partaient en `dash`, y compris ceux déclenchés depuis
 * bet-elearning. Les notifications e-learning atterrissaient donc dans la mauvaise cloche,
 * et les routes partagées — remplacements, cours, classes, séances — n'avaient aucun moyen
 * de savoir laquelle servir : le même code répond aux deux.
 *
 * POURQUOI ICI ET PAS DANS CHAQUE APPEL. Faire remonter `req` jusqu'à `notifyRole`
 * demanderait de modifier les 108 points d'appel, et le 109e écrit demain repartirait du
 * mauvais pied. `AsyncLocalStorage` conserve la valeur pendant toute la durée de la
 * requête, à travers les `await`, sans qu'aucune fonction intermédiaire ait à la porter.
 *
 * Le repli reste `dash` : c'est la plateforme historique, et un client qui n'envoie pas
 * l'en-tête (un cron, un webhook, un ancien build) se comporte comme avant.
 */
const stockage = new AsyncLocalStorage();

export const PLATEFORMES = ["dash", "bet-elearning"];

/** Middleware : ouvre le contexte pour la durée de la requête. */
export function contextePlateforme(req, _res, suite) {
  const entete = String(req.headers["x-plateforme"] || "").trim().toLowerCase();
  const plateforme = PLATEFORMES.includes(entete) ? entete : "dash";
  stockage.run({ plateforme }, suite);
}

/** La plateforme de la requête en cours, ou `dash` hors requête (cron, script). */
export function plateformeCourante() {
  return stockage.getStore()?.plateforme || "dash";
}

export default contextePlateforme;
