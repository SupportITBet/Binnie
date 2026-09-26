/**
 * L'adresse par laquelle un document doit être servi.
 *
 * POURQUOI NE PAS POINTER DIRECTEMENT SUR CLOUDINARY : le compte refuse la livraison
 * publique des PDF - un réglage de sécurité actif par défaut. Mesuré sur ce compte, un
 * `.pptx` et un `.xlsx` répondent 200, les `.pdf` répondent `401 Unauthorized`. Tous les
 * PDF de la plateforme étaient donc inaccessibles, partout.
 *
 * Le relais du backend signe la requête - le secret du compte ne vit que là - et rend le
 * fichier. `inline` décide si le navigateur l'AFFICHE ou le TÉLÉCHARGE.
 *
 * Les autres formats passent aussi par ce relais : router les PDF seuls obligerait chaque
 * écran à connaître la règle, et la règle changera le jour où le réglage sera activé côté
 * Cloudinary. Un seul chemin, un seul endroit à modifier.
 *
 * ⚠️ La vraie correction est un interrupteur dans la console Cloudinary
 * (Settings › Security › « PDF and ZIP files delivery »). Ce relais fonctionne sans, mais
 * fait transiter chaque document par le serveur - ce qu'une case à cocher éviterait.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/** Les formats que Cloudinary refuse de livrer publiquement sur ce compte. */
const BLOQUES = ["pdf", "zip"];

export const extensionDe = (nom = "") =>
  String(nom).split("?")[0].split(".").pop().toLowerCase();

/** `true` si l'adresse directe échouerait. */
export const livraisonBloquee = (url = "", nom = "") =>
  String(url).includes("cloudinary.com") &&
  BLOQUES.includes(extensionDe(nom || url));

/**
 * @param {string} url      l'adresse Cloudinary d'origine
 * @param {object} options
 * @param {string} [options.nom]     nom de fichier voulu au téléchargement
 * @param {boolean} [options.inline] afficher dans la page plutôt que télécharger
 */
export function urlDocument(url, { nom, inline = false } = {}) {
  if (!url) return url;
  // Ce qui n'est pas hébergé chez Cloudinary n'a rien à gagner à passer par le relais.
  if (!String(url).includes("cloudinary.com")) return url;

  const p = new URLSearchParams({ url });
  if (nom) p.set("nom", nom);
  const ext = extensionDe(nom || url);
  if (ext) p.set("type", ext);
  if (inline) p.set("inline", "1");
  return `${API_URL}/api/upload/download?${p}`;
}
