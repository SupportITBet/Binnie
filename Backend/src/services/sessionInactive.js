import supabase from "../config/supabase.js";

/**
 * FIN DE SESSION APRÈS INACTIVITÉ — la garde que le navigateur ne peut pas contourner.
 *
 * Le tableau de bord ferme déjà une session inactive, mais un écran ne protège que lui :
 * un jeton copié depuis le stockage d'un navigateur reste valable jusqu'à son expiration,
 * quoi qu'affiche l'interface. Ce module refuse ces jetons-là au niveau du middleware,
 * donc pour les 83 fichiers de routes d'un seul coup.
 *
 * LES MÊMES DÉLAIS QUE L'ÉCRAN, à dessein : deux couches qui répondraient différemment
 * produiraient des déconnexions inexplicables - une personne encore acceptée par son
 * tableau de bord et refusée par l'API à chaque clic.
 *
 * ÉCRITURE AU COMPTE-GOUTTES. Marquer l'activité à chaque requête ferait une écriture en
 * base par appel d'API. On n'écrit donc qu'au-delà de `MINUTES_ENTRE_ECRITURES`, en
 * gardant en mémoire la dernière écriture par utilisateur. L'imprécision qui en résulte
 * est de cinq minutes sur un délai d'une heure : sans conséquence.
 *
 * LE CACHE EST PAR INSTANCE, et c'est volontairement accepté : sur un hébergement qui
 * démarre plusieurs instances, chacune écrira au plus une fois par tranche de cinq
 * minutes. Le pire cas reste très loin d'une écriture par requête, et partager ce cache
 * demanderait un Redis pour une économie dérisoire.
 */

const MINUTES_COACH     = 90;   // un cours se donne sans toucher au tableau de bord
const MINUTES_PERSONNEL = 60;
const MINUTES_ENTRE_ECRITURES = 5;

const ROLES_COACH = /^(coach|professeur_titulaire|professeur_remplacant)$/i;

/** Le délai applicable à un rôle, en millisecondes. */
export function delaiInactiviteMs(role) {
  return (ROLES_COACH.test(String(role || "")) ? MINUTES_COACH : MINUTES_PERSONNEL) * 60 * 1000;
}

/** Dernière écriture connue par utilisateur, pour ne pas écrire à chaque requête. */
const dernieresEcritures = new Map();

/**
 * L'instant d'émission d'un JWT, en millisecondes - ou `null` s'il est illisible.
 *
 * On lit `iat` SANS vérifier la signature : à ce stade, le jeton a déjà été validé par
 * Supabase quelques lignes plus haut. On ne fait qu'y relire une date.
 */
export function emisA(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64").toString("utf8"));
    return Number(payload?.iat) > 0 ? Number(payload.iat) * 1000 : null;
  } catch { return null; }
}

/**
 * La session est-elle périmée ?
 *
 * `null` signifie « jamais mesurée » - les comptes antérieurs à cette mise en place, et
 * ceux qui se connectent pour la première fois. On les considère actifs : déconnecter 340
 * personnes à la première requête parce qu'une colonne vient d'être créée serait une panne,
 * pas une sécurité.
 *
 * UN JETON PLUS RÉCENT QUE LA DERNIÈRE ACTIVITÉ EST UNE NOUVELLE SESSION, et il prime.
 * Sans cette règle, quelqu'un qui revient après deux heures d'absence se reconnecte, reçoit
 * un jeton neuf... et se fait refuser à la première requête parce que le COMPTE, lui, est
 * resté inactif. La porte se refermait sur celui qui venait d'entrer, sans aucune issue.
 * C'est arrivé en test, et c'est le seul cas où l'inactivité mesurée ment.
 */
export function sessionPerimee(profil, token = null) {
  if (!profil?.derniere_activite) return false;
  const derniere = new Date(profil.derniere_activite).getTime();
  if (!Number.isFinite(derniere)) return false;

  const emission = token ? emisA(token) : null;
  if (emission && emission > derniere) return false;   // jeton plus neuf que la trace

  return Date.now() - derniere > delaiInactiviteMs(profil.role);
}

/**
 * Note le passage de l'utilisateur, sans bloquer la requête en cours.
 *
 * Volontairement NON attendue par l'appelant : une écriture de confort ne doit pas ajouter
 * sa latence à chaque appel d'API, ni faire échouer une requête si la base tarde.
 */
export function marquerActiviteServeur(profil) {
  if (!profil?.id) return;
  const maintenant = Date.now();
  const derniere = dernieresEcritures.get(profil.id) || 0;
  if (maintenant - derniere < MINUTES_ENTRE_ECRITURES * 60 * 1000) return;

  dernieresEcritures.set(profil.id, maintenant);
  supabase.from("utilisateurs")
    .update({ derniere_activite: new Date(maintenant).toISOString() })
    .eq("id", profil.id)
    .then(({ error }) => {
      // La colonne peut ne pas exister encore : le SQL est livré à part. On se tait alors
      // plutôt que d'inonder les journaux à chaque requête, et la garde reste inerte.
      if (error && error.code !== "42703" && error.code !== "PGRST204") {
        console.warn("[inactivite] activité non enregistrée :", error.message);
      }
    });
}

/** Le message rendu à une session fermée : il doit dire quoi faire, pas seulement refuser. */
export const MESSAGE_SESSION_EXPIREE =
  "Session fermée après une période d'inactivité. Reconnectez-vous pour continuer.";
