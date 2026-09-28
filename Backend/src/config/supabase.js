import { config } from "dotenv";
config();
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY;

/* UN SERVEUR NE DÉTIENT PAS DE SESSION.
 *
 * Sans ces options, `createClient` prend ses valeurs par défaut - celles du navigateur :
 * `persistSession: true` et `autoRefreshToken: true`. Le client devient alors un singleton
 * qui garde EN MÉMOIRE la session du dernier utilisateur connecté, partagée par toutes les
 * requêtes du backend, avec un minuteur de rafraîchissement en arrière-plan.
 *
 * CE QUE ÇA CASSAIT. La déconnexion pour inactivité appelle `signOut()` côté navigateur, qui
 * révoque les jetons de rafraîchissement chez Supabase. La session gardée ici devenait donc
 * invalide, et la reconnexion suivante butait dessus : la PREMIÈRE saisie du mot de passe
 * échouait, nettoyait l'état au passage, et la seconde passait. Le symptôme ne se produisait
 * qu'après une déconnexion - jamais après une simple fermeture d'onglet - ce qui le rendait
 * difficile à rapprocher de sa cause.
 *
 * Ici chaque requête est indépendante : on lit la réponse de `signInWithPassword` et on la
 * transmet au client. Rien dans ce projet ne relit une session stockée sur ces clients.
 */
const OPTIONS_SERVEUR = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

// Client admin (service_role) - opérations serveur, bypass RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, OPTIONS_SERVEUR);

// Client public (anon) - utilisé UNIQUEMENT pour signInWithPassword et resetPasswordForEmail
export const supabaseAuth = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, OPTIONS_SERVEUR)
  : supabase; // fallback si anon key non définie

export default supabase;
