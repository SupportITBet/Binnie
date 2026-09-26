import { envoyerFichier } from "./uploadFichier";

/**
 * Remplaçant de `fetch` pour les envois de fichiers, à la signature identique.
 *
 * Une cinquantaine d'écrans postaient un FormData à `/api/upload/<type>`, chacun avec sa
 * propre gestion de la réponse. Les réécrire un par un pour passer à l'envoi direct vers
 * Cloudinary était long et fragile - une conversion automatique m'a déjà fait casser deux
 * fichiers. Ce shim rend le changement mécanique : `fetch(` devient `fetchUpload(`, et rien
 * d'autre ne bouge.
 *
 * Il rend un objet qui se comporte comme une `Response` pour ce que ces appels en font :
 * `ok`, `status`, et un `json()` à la forme exacte de l'ancienne API - `{ file: {...} }`
 * avec `url`, `public_id`, `size`, `original_name`. Les appelants qui lisent `d.file.url`
 * ou `d.url` continuent donc de fonctionner sans être touchés.
 *
 * Tout ce qui n'est pas un envoi de fichier - une autre URL, un corps qui n'est pas un
 * FormData, un téléchargement - retombe sur le `fetch` natif, inchangé.
 */
export async function fetchUpload(url, options = {}) {
  const correspondance = String(url).match(/\/api\/upload\/([\w-]+)(?:[?#]|$)/);
  const corps = options?.body;
  const fichier = corps instanceof FormData ? corps.get("file") : null;

  // Pas un envoi de fichier reconnu : on ne s'en mêle pas.
  if (!correspondance || !(fichier instanceof File || fichier instanceof Blob)) {
    return fetch(url, options);
  }

  try {
    const f = await envoyerFichier(fichier, correspondance[1]);
    return {
      ok: true,
      status: 200,
      // Même forme que l'ancienne réponse serveur : `url` à la racine pour les quelques
      // appelants qui la lisaient là, `file` pour tous les autres.
      json: async () => ({ message: "Fichier uploadé", url: f.url, file: f }),
      text: async () => JSON.stringify({ file: f }),
    };
  } catch (e) {
    return {
      ok: false,
      status: 400,
      json: async () => ({ error: e.message }),
      text: async () => JSON.stringify({ error: e.message }),
    };
  }
}

export default fetchUpload;
