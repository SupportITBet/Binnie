/**
 * Les règles d'upload, en un seul endroit.
 *
 * Elles vivaient auparavant à quatre endroits qui se contredisaient : les `limits` de multer,
 * une revérification après upload, le texte « Taille max : … » affiché à l'utilisateur, et les
 * plafonds réels de Cloudinary. D'où des limites annoncées que personne ne pouvait atteindre -
 * un PDF était promis à 15 Mo alors que Cloudinary refuse les fichiers `raw` au-delà de 10.
 *
 * Deux plafonds s'imposent de l'extérieur et ne se négocient pas :
 *
 *  · CLOUDINARY, par type de ressource (lu sur le compte, plan Free) :
 *      image 10 Mo · vidéo et audio 100 Mo · raw (PDF, Office…) 10 Mo
 *
 *  · VERCEL, 4,5 Mo pour le corps d'une requête vers une fonction serverless, sur TOUS les
 *    plans - Hobby comme Pro. Au-delà, la plateforme répond 413 FUNCTION_PAYLOAD_TOO_LARGE
 *    avant qu'Express ne voie la requête, donc sans les en-têtes CORS qu'Express aurait
 *    posés : le navigateur signale alors une erreur CORS qui n'a rien à voir avec la cause.
 *
 * C'est ce second plafond qui impose l'envoi direct du navigateur vers Cloudinary : le
 * backend ne fait que signer, le fichier ne traverse plus Vercel, et les limites ci-dessous
 * redeviennent atteignables.
 */

/** Plafond de Vercel sur le corps d'une requête. Vaut pour l'ancien chemin d'upload. */
export const LIMITE_VERCEL_MO = 4.5;

/** Plafonds Cloudinary par type de ressource, en Mo (compte plan Free). */
export const LIMITES_CLOUDINARY_MO = { image: 10, video: 100, raw: 10 };

/**
 * Le type de ressource Cloudinary d'un fichier.
 *
 * `auto` n'est pas fiable pour les documents et les archives - un .docx (qui est un ZIP)
 * revient en « unknown file format ». On tranche donc nous-mêmes, comme le faisaient déjà
 * séparément messageStorage, uploadDocument et /dossier.
 * L'audio se range sous `video` chez Cloudinary : c'est voulu, pas une erreur.
 */
export function typeRessource(mimetype = "") {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "video";
  return "raw";
}

/**
 * Catalogue des uploads. Une entrée par route `/api/upload/<clé>`.
 *
 *  · `dossier`    - où le fichier atterrit chez Cloudinary.
 *  · `prefixe`    - début du public_id, pour repérer l'origine d'un fichier.
 *  · `maxMo`      - plafond applicatif, soit un nombre, soit une fonction du mimetype.
 *  · `extensions` - liste blanche ; `null` = tout accepter.
 *  · `roles`      - 'admin' (personnel BET) ou 'user' (tout compte connecté).
 */
export const UPLOADS = {
  avatar: {
    dossier: "bet/avatars", prefixe: "avatars", maxMo: 5,
    extensions: ["jpg", "jpeg", "png", "webp"], roles: "user",
  },
  message: {
    dossier: "bet/messages", prefixe: "messages", maxMo: 5,
    extensions: null, roles: "user",
  },
  contenu: {
    dossier: "bet/contenus-onboarding", prefixe: "contenus",
    // Une vidéo de 100 Mo est normale ; un PDF de cette taille est presque toujours une
    // erreur de manipulation, et sature le quota Cloudinary pour rien.
    maxMo: (m) => (m.startsWith("video/") ? 100 : m.startsWith("audio/") ? 20 : m.startsWith("image/") ? 5 : 10),
    extensions: null, roles: "admin",
  },
  image: {
    dossier: "bet/images", prefixe: "images", maxMo: 10,
    // HEIC/HEIF sont le format PAR DÉFAUT des photos iPhone, et AVIF celui que produisent
    // les outils web récents : le champ accepte `image/*`, le sélecteur les proposait, et
    // la liste blanche les refusait ensuite en 400. Cloudinary les ingère et les ressert
    // en JPEG/WebP, l'affichage ne change donc pas.
    extensions: ["jpg", "jpeg", "png", "webp", "gif", "svg",
                 "heic", "heif", "avif", "jfif", "bmp", "tif", "tiff"],
    roles: "admin",
  },
  video: {
    dossier: "bet/videos", prefixe: "videos", maxMo: 100,
    extensions: ["mp4", "mov", "avi", "mkv", "webm", "m4v"], roles: "admin",
  },
  audio: {
    dossier: "bet/audio", prefixe: "audio", maxMo: 100,
    extensions: ["mp3", "wav", "ogg", "m4a", "aac"], roles: "admin",
  },
  recording: {
    dossier: "bet/speaking", prefixe: "speaking", maxMo: 50,
    extensions: ["webm", "ogg", "mp3", "wav", "m4a"], roles: "user",
  },
  temoignage: {
    dossier: "bet/temoignages", prefixe: "temoignages", maxMo: 5,
    extensions: ["jpg", "jpeg", "png", "webp"], roles: "user",
  },
  dossier: {
    dossier: "bet/dossiers", prefixe: "dossier", maxMo: 10,
    extensions: null, roles: "admin",
  },
  "fichier-classe": {
    dossier: "bet/fichiers-classes", prefixe: "fichier_classe",
    maxMo: (m) => (m.startsWith("video/") || m.startsWith("audio/") ? 100 : m.startsWith("image/") ? 10 : 10),
    extensions: null, roles: "admin",
  },
  document: {
    // `raw` chez Cloudinary, donc 10 Mo maximum : la route annonçait 50 Mo à multer et
    // l'UI 15 Mo, deux chiffres que Cloudinary n'a jamais acceptés.
    dossier: "bet/documents", prefixe: "documents", maxMo: 10,
    extensions: ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"], roles: "admin",
  },
  "piece-jointe": {
    // Ce qu'on joint à une campagne e-mail : un visuel, un PDF, une archive, une vidéo
    // courte. AUCUNE liste blanche - `document` n'acceptait que du bureautique, et
    // joindre un simple .jpg à une relance échouait en « Format non supporté ».
    dossier: "bet/pieces-jointes", prefixe: "piece_jointe",
    /* Le plafond suit la NATURE du fichier. La vidéo est passée de 100 à 30 Mo : ces
       fichiers atterrissent dans les conversations, où ils sont téléchargés par chaque
       membre et alourdissent le fil pour tout le monde. 30 Mo laissent passer plusieurs
       minutes de vidéo compressée ; au-delà, le lien de partage est le bon outil.
       Cloudinary rabote de toute façon (cf. maxMoPour), ces chiffres ne font que ne pas
       mentir sur ce qui passera. */
    maxMo: (m) => (m.startsWith("video/") ? 30 : m.startsWith("audio/") ? 20 : m.startsWith("image/") ? 10 : 10),
    extensions: null, roles: "admin",
  },
};

/** Le plafond applicatif d'un type d'upload pour un fichier donné, en Mo. */
export function maxMoPour(type, mimetype = "") {
  const conf = UPLOADS[type];
  if (!conf) return 0;
  const applicatif = typeof conf.maxMo === "function" ? conf.maxMo(mimetype) : conf.maxMo;
  // Le plafond Cloudinary prime toujours : promettre plus serait promettre un échec.
  return Math.min(applicatif, LIMITES_CLOUDINARY_MO[typeRessource(mimetype)]);
}

/** Extension d'un nom de fichier, en minuscules, sans le point. */
export const extensionDe = (nom = "") =>
  nom.includes(".") ? nom.split(".").pop().toLowerCase() : "";

/**
 * Valide un fichier contre son type d'upload, sans rien lire de son contenu.
 * Renvoie `null` si tout va bien, sinon le message à afficher tel quel.
 */
export function verifierFichier(type, { nom = "", mimetype = "", taille = 0 }) {
  const conf = UPLOADS[type];
  if (!conf) return `Type d'upload inconnu : ${type}`;

  const ext = extensionDe(nom);
  /* Un fichier SANS extension dont le mimetype annonce déjà sa nature est accepté : une
     image collée depuis le presse-papiers, ou un fichier renommé à la main, arrivait
     sinon en « Format non supporté : .? » - un refus que rien, dans ce que l'utilisateur
     voit, ne permet de comprendre ni de corriger. Le mimetype vient du navigateur, pas
     du nom : c'est la source la plus fiable dont on dispose avant l'envoi. */
  const familleAnnoncee = mimetype.split("/")[0];
  const natureConnue = ["image", "video", "audio"].includes(familleAnnoncee);
  if (conf.extensions && !conf.extensions.includes(ext) && !(ext === "" && natureConnue)) {
    return `Format non supporté : .${ext || "?"} (attendu : ${conf.extensions.join(", ")})`;
  }

  const maxMo = maxMoPour(type, mimetype);
  if (taille > maxMo * 1024 * 1024) {
    return `Fichier trop lourd : ${(taille / 1048576).toFixed(1)} Mo (maximum ${maxMo} Mo)`;
  }
  return null;
}
