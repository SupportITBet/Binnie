/**
 * DÉCONNEXION AUTOMATIQUE APRÈS INACTIVITÉ.
 *
 * POURQUOI. La session Supabase ne s'arrête jamais d'elle-même : le jeton dure une heure,
 * mais `autoRefreshToken` le renouvelle indéfiniment et `persistSession` le garde dans le
 * `localStorage`, qui survit à la fermeture du navigateur. Quelqu'un qui se connecte lundi
 * matin et oublie de se déconnecter reste connecté des semaines - et sur un poste partagé
 * dans un centre, la personne suivante hérite du dossier complet des apprenants.
 *
 * DEUX DÉLAIS, parce que deux métiers. Une heure pour le personnel administratif, qui
 * travaille devant son écran ; une heure trente pour les coachs, qui donnent cours sans
 * toucher leur tableau de bord. Un délai unique aurait été soit trop court pour les uns,
 * soit trop permissif pour les autres - et c'est le poste administratif, celui qu'on
 * partage dans un centre, qui a le plus besoin d'être fermé vite.
 *
 * MÊME UNE HEURE TRENTE NE COUVRE PAS UN COURS DE DEUX HEURES, et la salle s'ouvre dans une
 * FENÊTRE SÉPARÉE (`window.open`) : l'onglet du tableau de bord ne reçoit alors plus aucun
 * événement, et le compte à rebours courrait pendant que le coach enseigne. D'où
 * `suivreFenetreLive()` : tant qu'une salle ouverte depuis l'application n'est pas fermée,
 * l'utilisateur est considéré comme actif. C'est le seul cas où « ne rien toucher » ne veut
 * pas dire « être parti ».
 *
 * LE COMPTEUR EST PARTAGÉ ENTRE LES ONGLETS, par le `localStorage` : travailler dans l'un
 * ne doit pas laisser expirer les autres, sans quoi revenir sur un onglet ouvert depuis le
 * matin déconnecterait une personne en train de travailler à côté.
 */

/** Dernière activité connue, en millisecondes. Partagée entre les onglets. */
const CLE_ACTIVITE = "bet_derniere_activite";

export const MINUTES_PERSONNEL = 60;
export const MINUTES_COACH      = 90;
export const MINUTES_AVERTISSEMENT = 2;   // le préavis, pour ne couper personne sans prévenir

const MS_AVERTISSEMENT = MINUTES_AVERTISSEMENT * 60 * 1000;

/**
 * Le délai qui s'applique à la personne connectée, en minutes.
 *
 * Le rôle se lit dans le profil stocké, et `coach_token` sert de repli : l'espace
 * professeur ouvre parfois une session sans écrire `admin_profil`, et un coach déconnecté
 * en plein cours parce qu'on n'a pas su le reconnaître serait le pire des résultats.
 */
export function minutesInactivite() {
  try {
    if (localStorage.getItem("coach_token")) return MINUTES_COACH;
    const brut = localStorage.getItem("admin_profil");
    const role = brut ? (JSON.parse(brut)?.role || "") : "";
    return /coach|professeur/i.test(role) ? MINUTES_COACH : MINUTES_PERSONNEL;
  } catch { return MINUTES_PERSONNEL; }
}

/* Les fenêtres de session live ouvertes depuis l'application. On garde la RÉFÉRENCE rendue
   par `window.open` : `ref.closed` dit de façon fiable si la salle est encore ouverte, là
   où un simple drapeau resterait posé pour toujours si la fenêtre était fermée à la main. */
const fenetresLive = new Set();

/** À appeler avec ce que rend `window.open` quand on ouvre une salle de cours. */
export function suivreFenetreLive(ref) {
  if (ref) fenetresLive.add(ref);
}

/** Vrai tant qu'au moins une salle ouverte depuis l'application est encore visible. */
export function sessionLiveEnCours() {
  for (const f of fenetresLive) {
    // `closed` peut lever sur une fenêtre d'une autre origine déjà détruite : on l'oublie
    // alors, plutôt que de laisser une exception interrompre la surveillance.
    let fermee = true;
    try { fermee = !f || f.closed; } catch { fermee = true; }
    if (fermee) fenetresLive.delete(f); else return true;
  }
  return false;
}

export function marquerActivite() {
  try { localStorage.setItem(CLE_ACTIVITE, String(Date.now())); } catch { /* mode privé */ }
}

export function derniereActivite() {
  try {
    const v = Number(localStorage.getItem(CLE_ACTIVITE));
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  } catch { return Date.now(); }
}

/** Les millisecondes restantes avant déconnexion, ou `Infinity` pendant un cours. */
export function tempsRestant() {
  if (sessionLiveEnCours()) { marquerActivite(); return Infinity; }
  return minutesInactivite() * 60 * 1000 - (Date.now() - derniereActivite());
}

export const SEUIL_AVERTISSEMENT = MS_AVERTISSEMENT;

/**
 * Efface la session locale. On ne touche QUE ce qui identifie l'utilisateur : les préférences
 * et les catalogues mis en cache (`bet_*`) n'ont rien à voir avec l'authentification, et les
 * effacer rallongerait le prochain chargement pour rien.
 */
export function effacerSession() {
  ["admin_token", "admin_refresh", "admin_profil",
   "coach_token", "coach_profil",
   "user_token", "user_profil", CLE_ACTIVITE].forEach(k => {
    try { localStorage.removeItem(k); } catch { /* ignoré */ }
  });
}
