import supabase from "../config/supabase.js";

/**
 * ENVOYER UNE NOTIFICATION SUR L'ÉCRAN DU TÉLÉPHONE.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT. `expo-notifications` était installé dans BinnieApp et la permission
 * demandée au démarrage, mais rien derrière : aucun jeton récupéré, aucune table pour le
 * ranger, aucun envoi. Les notifications arrivaient en base et s'affichaient dans l'onglet
 * Alertes — elles ne pouvaient simplement pas atteindre un téléphone fermé.
 *
 * POURQUOI PASSER PAR L'API D'EXPO plutôt que par APNs et FCM directement. Expo expédie vers
 * les deux à partir d'un seul appel et d'un seul format de jeton, sans certificat Apple ni
 * clé de service Google à gérer sur ce serveur. L'application étant construite avec Expo,
 * c'est le chemin que ses jetons empruntent de toute façon.
 *
 * AUCUN SECRET N'EST REQUIS pour l'envoi : un jeton `ExponentPushToken[...]` est lui-même la
 * seule autorisation nécessaire, et il ne sort jamais de nos tables. (Expo permet d'exiger
 * en plus un `accessToken` sur le compte ; si vous l'activez, renseignez `EXPO_ACCESS_TOKEN`
 * et il sera envoyé — sinon rien ne change.)
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

const URL_EXPO = "https://exp.host/--/api/v2/push/send";

/* Expo accepte 100 messages par requête. Au-delà, il refuse le lot ENTIER plutôt que de le
   tronquer : découper est donc obligatoire, pas une optimisation. */
const TAILLE_LOT = 100;

/** Un jeton Expo valide. Tout le reste est refusé À L'ENREGISTREMENT, pour ne pas polluer la table. */
export const estJetonExpo = (t) =>
  typeof t === "string" && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t.trim());

/** Les jetons des utilisateurs visés, groupés par personne. */
export async function jetonsDe(userIds = []) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("push_tokens")
    .select("user_id, token")
    .in("user_id", ids);
  /* L'ERREUR EST LUE, ET REMONTÉE. Un `select` sur une table absente rend `data: null` sans
     lever : ignorer `error` ferait croire « personne n'a d'appareil » alors que la migration
     SQL n'a simplement pas été passée. */
  if (error) throw new Error(`push_tokens illisible : ${error.message}`);
  const parUtilisateur = {};
  for (const l of data || []) (parUtilisateur[l.user_id] ||= []).push(l.token);
  return parUtilisateur;
}

/**
 * Expédie des messages déjà formés. Rend le détail par jeton, pour que l'appelant sache
 * lesquels ont échoué.
 *
 * @param {Array<{to:string,title:string,body:string,data?:object}>} messages
 */
export async function expedier(messages = []) {
  const valides = messages.filter((m) => estJetonExpo(m?.to) && m?.title);
  if (!valides.length) return { envoyes: 0, echecs: 0, aRetirer: [] };

  const entetes = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) {
    entetes.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  let envoyes = 0;
  let echecs = 0;
  /* LES JETONS MORTS SE RETIRENT, sinon la table enfle d'appareils désinstallés et chaque
     envoi traîne des erreurs qui ne se répareront jamais. Expo le dit explicitement avec
     `DeviceNotRegistered` — c'est le seul code qui justifie une suppression. */
  const aRetirer = [];

  for (let i = 0; i < valides.length; i += TAILLE_LOT) {
    const lot = valides.slice(i, i + TAILLE_LOT);
    try {
      const r = await fetch(URL_EXPO, {
        method: "POST",
        headers: entetes,
        body: JSON.stringify(lot),
      });
      const corps = await r.json().catch(() => null);
      const tickets = Array.isArray(corps?.data) ? corps.data : [];

      if (!r.ok || !tickets.length) {
        echecs += lot.length;
        console.warn("[push] lot refusé :", r.status, JSON.stringify(corps)?.slice(0, 300));
        continue;
      }

      tickets.forEach((t, j) => {
        if (t?.status === "ok") { envoyes++; return; }
        echecs++;
        if (t?.details?.error === "DeviceNotRegistered") aRetirer.push(lot[j].to);
      });
    } catch (e) {
      echecs += lot.length;
      console.warn("[push] lot non expédié :", e.message);
    }
  }

  if (aRetirer.length) {
    await supabase.from("push_tokens").delete().in("token", aRetirer);
    console.log(`[push] ${aRetirer.length} appareil(s) désinscrit(s) retiré(s).`);
  }

  return { envoyes, echecs, aRetirer };
}

/**
 * Raccourci : prévenir une personne, sur tous ses appareils.
 * Rend `{ envoyes, echecs }` — et `{ envoyes: 0 }` si elle n'a aucun appareil enregistré,
 * ce qui n'est pas une erreur : tout le monde n'a pas l'application.
 */
export async function notifierUtilisateur(userId, { titre, message, data = {} }) {
  const parUtilisateur = await jetonsDe([userId]);
  const jetons = parUtilisateur[userId] || [];
  if (!jetons.length) return { envoyes: 0, echecs: 0 };
  return expedier(
    jetons.map((to) => ({
      to,
      sound: "default",
      title: titre,
      body: message,
      data,
    }))
  );
}
