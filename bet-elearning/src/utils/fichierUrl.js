/**
 * Ouvrir ou télécharger un fichier déposé sur Cloudinary.
 *
 * LE PROBLÈME. Cloudinary refuse la livraison publique des fichiers `raw` — PDF, DOCX,
 * PPTX, XLSX — par un réglage de sécurité actif par défaut sur le compte : l'URL rendue à
 * l'upload répond `401 Unauthorized` au navigateur. Les images, les vidéos et les audios
 * passent, eux, sans difficulté : ils sont livrés sous les types `image` et `video`, que
 * ce réglage ne couvre pas. C'est pourquoi un mp3 s'écoutait et un .docx affichait une
 * page d'erreur.
 *
 * LA SOLUTION, déjà en place côté serveur et utilisée partout chez dash :
 * `GET /api/upload/download` récupère le fichier en signant la requête — le secret du
 * compte ne vit que là — et le rend au navigateur avec le bon `Content-Type`.
 *
 * Ce module existe pour que la règle ne soit pas recopiée à chaque bouton. Elle l'était
 * déjà dans quatre écrans de bet-elearning, dont deux l'avaient oubliée ; une cinquième
 * copie aurait fini par diverger à son tour.
 */

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/* Les extensions livrées en `raw`, donc celles qui ont besoin du relais. Tout le reste
   (jpg, png, mp3, mp4, webm…) est livré directement par Cloudinary et n'a rien à gagner à
   transiter par notre serveur — ce serait de la bande passante et de la latence en plus. */
const EXTENSIONS_RAW = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'zip', 'rar'];

/** L'extension d'un nom de fichier ou d'une URL, en minuscules, sans le point. */
export function extensionDe(nomOuUrl) {
  const sansQuery = String(nomOuUrl || '').split('?')[0];
  return sansQuery.includes('.') ? sansQuery.split('.').pop().toLowerCase() : '';
}

/** Ce fichier doit-il passer par le relais pour être lisible ? */
export function passeParLeRelais(url, nom) {
  if (!url || !String(url).includes('cloudinary.com')) return false;
  const ext = extensionDe(nom) || extensionDe(url);
  return EXTENSIONS_RAW.includes(ext);
}

/**
 * L'adresse à mettre dans un `href`.
 *
 * `inline` décide de l'en-tête `Content-Disposition` renvoyé par le relais : `inline`
 * affiche le fichier dans l'onglet (c'est ce qu'on veut derrière « Ouvrir »), sinon le
 * navigateur le télécharge (« Télécharger »). Sans cette distinction, « Ouvrir »
 * déclenchait un téléchargement — un PDF ne pouvait jamais être simplement lu.
 */
export function urlFichier(url, nom, { inline = false } = {}) {
  if (!passeParLeRelais(url, nom)) return url || '';
  const ext = extensionDe(nom) || extensionDe(url);
  const params = new URLSearchParams({ url, nom: nom || `document.${ext}` });
  if (ext) params.set('type', ext);
  if (inline) params.set('inline', '1');
  return `${API}/api/upload/download?${params.toString()}`;
}

/** Raccourci de lecture : « ouvrir ce fichier dans l'onglet ». */
export const urlOuvrir = (url, nom) => urlFichier(url, nom, { inline: true });

/** Raccourci d'écriture : « enregistrer ce fichier sur le disque ». */
export const urlTelecharger = (url, nom) => urlFichier(url, nom, { inline: false });
