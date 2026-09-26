import supabase from "../config/supabase.js";

/**
 * Vérification du jeton, mise en cache quelques secondes.
 *
 * `supabase.auth.getUser(token)` est un appel RÉSEAU vers Supabase Auth, mesuré ici à
 * ~175 ms. Il est payé sur CHAQUE requête authentifiée du backend - et l'écran de
 * l'apprenant en déclenche une dizaine au chargement. C'était, de loin, le premier poste
 * de lenteur : plus cher que l'écriture qu'on venait faire.
 *
 * Le même jeton renvoie forcément le même utilisateur : re-demander à Supabase qui il est,
 * dix fois en deux secondes, ne peut rien apprendre de nouveau.
 *
 * TTL COURT (30 s) ET DÉLIBÉRÉ. Un jeton révoqué ou expiré reste accepté au plus 30
 * secondes - c'est le prix du cache, et il est mesuré : une session Supabase dure une
 * heure, la fenêtre représente moins de 1 % de sa vie. Un TTL long ferait de ce cache un
 * trou de sécurité ; l'absence de cache coûte 175 ms à chaque clic.
 *
 * Cache EN MÉMOIRE, donc par instance : un redémarrage le vide, et plusieurs instances ne
 * le partagent pas. C'est sans conséquence - au pire on refait l'appel réseau, jamais on
 * n'accepte un jeton qu'une autre instance aurait refusé.
 */

const TTL_MS = 30_000;
/** Garde-fou mémoire : au-delà, on vide. Un cache sans borne est une fuite. */
const MAX_ENTREES = 5_000;

const cache = new Map(); // jeton -> { user, expire }

/**
 * @param {string} token  le jeton porteur, tel que reçu dans l'en-tête
 * @returns {Promise<object|null>} l'utilisateur, ou null si le jeton est invalide
 */
export async function utilisateurDuJeton(token) {
  if (!token) return null;

  const hit = cache.get(token);
  if (hit && hit.expire > Date.now()) return hit.user;
  // Entrée périmée : la retirer tout de suite, pour que la Map ne garde pas des jetons
  // morts jusqu'au prochain vidage.
  if (hit) cache.delete(token);

  const { data: { user } = {}, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    // Les échecs ne sont PAS mis en cache : un jeton refusé parce que Supabase Auth était
    // momentanément indisponible doit pouvoir être réessayé tout de suite.
    return null;
  }

  if (cache.size >= MAX_ENTREES) cache.clear();
  cache.set(token, { user, expire: Date.now() + TTL_MS });
  return user;
}

/** À appeler à la déconnexion ou à la révocation, pour ne pas attendre le TTL. */
export function oublierJeton(token) {
  if (token) cache.delete(token);
}

export default utilisateurDuJeton;
