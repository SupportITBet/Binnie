import { cloturerCompositionsExpirees, cloturerCompositionsExpireesDash } from "../services/minuteurDevoir.js";

/**
 * Clôture les compositions chronométrées que personne n'est venu rendre.
 *
 * LE CAS QU'IL COUVRE. Quand le compte à rebours tombe à zéro, c'est le navigateur de
 * l'apprenant qui envoie sa copie — et c'est le chemin normal. Mais il ne couvre pas
 * l'onglet fermé, le réseau coupé, le téléphone éteint : la copie resterait indéfiniment
 * « commencée, jamais rendue », invisible dans la file de correction du coach alors qu'il
 * y a bien quelque chose à corriger.
 *
 * Ce balayage la remet au coach EN L'ÉTAT, comme si l'apprenant avait rendu au moment où
 * son temps s'est écoulé. Ce qu'il a écrit est conservé ; le reste vaut zéro, et c'est le
 * coach qui tranche la note finale.
 *
 * ── LA CADENCE ──
 * Toutes les cinq minutes. Un chrono se compte en heures : passer une copie en retard de
 * quelques minutes sur sa clôture n'a aucune conséquence pédagogique, alors qu'un
 * balayage à la seconde interrogerait la base inutilement toute la journée.
 *
 * Le premier passage attend deux minutes après le démarrage : au boot, le serveur a mieux
 * à faire que de balayer, et les requêtes de connexion des utilisateurs passent d'abord.
 */
const INTERVALLE_MS = 5 * 60 * 1000;

async function balayer() {
  try {
    // Les deux plateformes : les tables diffèrent, la règle est la même.
    await cloturerCompositionsExpirees();
    await cloturerCompositionsExpireesDash();
  } catch (err) {
    // Un balayage qui échoue ne doit jamais arrêter le serveur : il repassera dans 5 min.
    console.error("[cloturerCompositions] échec:", err.message);
  }
}

export function demarrerCloturerCompositions() {
  setTimeout(balayer, 2 * 60 * 1000);
  setInterval(balayer, INTERVALLE_MS);
}
