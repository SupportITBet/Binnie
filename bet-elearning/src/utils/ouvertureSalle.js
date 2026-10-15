/**
 * Quand la salle virtuelle d'une session s'ouvre-t-elle ?
 *
 * LA RÈGLE. Le lien n'est cliquable qu'à partir de H-10. Avant cela, il mène à une salle
 * vide : un apprenant qui s'y connecte à l'avance croit à une panne, et un membre de
 * l'encadrement qui veut « vérifier le lien » trois jours plus tôt tombe sur le même vide
 * et signale un problème qui n'existe pas.
 *
 * POURQUOI CE MODULE. La constante et le calcul étaient recopiés dans trois écrans
 * (apprenant, parent, professeur), et absents des quatre dashboards d'encadrement —
 * assistante e-learning, onboarding, superviseur, deputy — où le lien restait donc
 * cliquable en permanence. Une quatrième copie aurait fini par diverger des trois autres :
 * la règle vit ici, et chaque écran la lit.
 *
 * Le PRÉSENTIEL n'a pas de salle à ouvrir : il n'est jamais verrouillé, et l'adresse du
 * centre reste consultable à tout moment.
 */

export const MINUTES_OUVERTURE_SALLE = 10;
const MS_OUVERTURE_SALLE = MINUTES_OUVERTURE_SALLE * 60 * 1000;

/**
 * Une séance CLOSE n'a plus de salle à rejoindre.
 *
 * C'était le trou de la règle : elle ne regardait que l'heure, si bien qu'une séance
 * clôturée par le coach continuait d'afficher « 🔗 Rejoindre » — pour une salle fermée.
 * Le superviseur et le PA, qui ouvrent ces plannings précisément pour vérifier qu'un cours
 * a bien eu lieu, y voyaient un cours encore joignable.
 *
 * Les mêmes statuts que côté dash (`SESSION_CLOSE` dans `Components/PlanningClasse.jsx`),
 * pour que les deux plateformes répondent la même chose.
 */
export const STATUTS_CLOS = ["realisee", "terminee", "annulee", "clos"];
export const seanceClose = (s) =>
  STATUTS_CLOS.includes(s?.statut) || (!!s?.terminee_at && s?.statut !== "en_cours");

export const raisonClose = (s) =>
  s?.statut === "annulee"
    ? "Séance annulée — aucune salle à rejoindre"
    : "Séance terminée — la salle est fermée";

/**
 * Une salle ouverte et jamais refermée reste `en_cours` indéfiniment en base. Au-delà de ce
 * seuil ce n'est plus un direct mais une anomalie, et l'annoncer « en cours » ferait croire
 * à un cours en train de se tenir. Même seuil que dash.
 */
const HEURES_AVANT_SALLE_ABANDONNEE = 4;
const salleAbandonnee = (s, maintenant) =>
  s?.statut === "en_cours" && !!s.demarree_at &&
  (maintenant.getTime() - new Date(s.demarree_at).getTime()) > HEURES_AVANT_SALLE_ABANDONNEE * 3600000;

/** La séance est en direct : le coach a ouvert la salle, et ne l'a pas abandonnée. */
export const enDirect = (s, maintenant = new Date()) =>
  s?.statut === "en_cours" && !salleAbandonnee(s, maintenant);

/** La date de début d'une session, à partir de ses champs — `null` si elle est illisible. */
function debutDe(session) {
  const date  = session?.date_session || session?.date;
  const heure = session?.heure_debut || "00:00";
  if (!date) return null;
  const d = new Date(`${date}T${String(heure).slice(0, 5)}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * L'état d'accès à la salle d'une session.
 *
 * @returns {{
 *   joignable: boolean,      le lien peut être ouvert
 *   presentiel: boolean,     aucune salle à ouvrir
 *   ouvertureA: Date|null,   l'instant où la salle s'ouvre
 *   minutesAvant: number,    minutes restant avant l'ouverture (0 si déjà ouverte)
 *   libelleAttente: string,  « dans 2 h 15 », à afficher sur le bouton verrouillé
 * }}
 */
export function accesSalle(session, maintenant = new Date()) {
  const presentiel = session?.type_session === "presentiel" || session?.type === "presentiel";
  const debut = debutDe(session);
  const base = { joignable: false, presentiel, close: false, enDirect: false,
                 ouvertureA: null, minutesAvant: 0, libelleAttente: "", raison: "" };

  /* LA CLÔTURE PRIME SUR TOUT LE RESTE — y compris sur le présentiel et sur l'heure. Une
     séance terminée ou annulée n'a plus de salle, quelle que soit la date qu'elle porte :
     c'est le cas que la règle laissait passer, et « Rejoindre » survivait à la clôture. */
  if (seanceClose(session)) {
    return { ...base, close: true, raison: raisonClose(session) };
  }

  /* LE DIRECT EST UNE EXCEPTION VOLONTAIRE À LA RÈGLE DES DIX MINUTES. C'est le coach qui a
     ouvert la salle, et c'est précisément ce moment-là qu'un superviseur vient observer :
     lui refuser l'entrée parce qu'il est 19 h 48 n'aurait aucun sens. */
  if (enDirect(session, maintenant)) {
    return { ...base, joignable: true, enDirect: true, raison: "Séance en cours" };
  }

  if (presentiel) {
    return { ...base, joignable: true, presentiel: true };
  }
  /* Sans date exploitable, on NE VERROUILLE PAS : une donnée incomplète ne doit pas
     empêcher d'accéder à un cours qui a peut-être bien lieu. Le verrou protège d'une
     salle vide, il ne garde pas un secret. */
  if (!debut) {
    return { ...base, joignable: true };
  }

  const ouvertureA = new Date(debut.getTime() - MS_OUVERTURE_SALLE);
  const joignable  = maintenant >= ouvertureA;
  const minutesAvant = joignable ? 0 : Math.ceil((ouvertureA - maintenant) / 60000);

  return { ...base, joignable, ouvertureA, minutesAvant, libelleAttente: formaterAttente(minutesAvant) };
}

/**
 * « dans 7 min », « dans 2 h 15 », « dans 3 j ».
 *
 * On ne dit pas « dans 4320 minutes » : au-delà de quelques heures, le chiffre exact
 * n'apprend rien et ce qui compte est l'ordre de grandeur.
 */
export function formaterAttente(minutes) {
  if (minutes <= 0) return "";
  if (minutes < 60) return `dans ${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) {
    const reste = minutes % 60;
    return reste ? `dans ${h} h ${String(reste).padStart(2, "0")}` : `dans ${h} h`;
  }
  const j = Math.floor(h / 24);
  return `dans ${j} j`;
}
