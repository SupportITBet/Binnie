/**
 * Reconnaître une vidéo HÉBERGÉE (YouTube, Vimeo) et en donner l'URL d'intégration.
 *
 * POURQUOI CE FICHIER EXISTE. Les coachs déposent indifféremment un fichier .mp4 et un lien
 * YouTube dans le même champ « vidéo ». Les vues qui rendaient bêtement `<video src={url}>`
 * affichaient un lecteur noir et muet sur les liens YouTube : la balise `<video>` attend un
 * flux vidéo, elle reçoit une page HTML, et le navigateur répond « No video with supported
 * format and MIME type found ». Le superviseur ne pouvait donc pas contrôler ces contenus.
 *
 * La reconnaissance existait déjà dans l'espace apprenant, recopiée nulle part ailleurs.
 * Elle vit ici pour que les trois vues (apprenant, superviseur, ressources coach) traitent
 * le même lien de la même façon.
 */

/**
 * @param   {string|null} url
 * @returns {string|null} l'URL d'intégration si la plateforme est reconnue, sinon `null`
 *                        (le fichier est alors lisible directement par `<video>`).
 */
export function urlEmbedVideo(url) {
  if (!url) return null;
  const u = String(url);
  // Une VIDÉO : youtu.be/ID, watch?v=ID, embed/ID, shorts/ID, live/ID, v/ID.
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/|youtube\.com\/v\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  /* Une PLAYLIST s'intègre aussi, par `videoseries` - utile quand le coach partage une
     série d'exercices plutôt qu'une vidéo isolée. Une CHAÎNE (`/@nom`, `/c/`, `/user/`),
     elle, ne s'intègre pas : elle ne désigne aucune vidéo. */
  const pl = u.match(/[?&]list=([\w-]+)/);
  if (pl) return `https://www.youtube.com/embed/videoseries?list=${pl[1]}`;
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

/**
 * L'URL désigne-t-elle une CHAÎNE YouTube plutôt qu'une vidéo ?
 *
 * Distinguer ce cas permet de le dire clairement : une chaîne ne contient pas d'identifiant
 * de vidéo, il n'y a donc rien à lire sur place - ce n'est pas une panne, c'est un lien qui
 * ne désigne pas une vidéo précise.
 */
export function estChaineYoutube(url) {
  if (!url) return false;
  return /youtube\.com\/(@|c\/|user\/|channel\/)/.test(String(url));
}

/**
 * L'URL pointe-t-elle vers un FICHIER vidéo que `<video>` sait lire ?
 *
 * Une URL sans extension connue et non reconnue comme plateforme n'est probablement pas une
 * vidéo du tout (page d'un site, lien Drive…). Mieux vaut le dire que d'afficher un lecteur
 * qui restera noir : l'utilisateur croirait à une panne plutôt qu'à un lien inadapté.
 */
export function estFichierVideo(url) {
  if (!url) return false;
  const sansParams = String(url).split(/[?#]/)[0].toLowerCase();
  return /\.(mp4|webm|ogg|ogv|mov|m4v)$/.test(sansParams)
    // Cloudinary sert ses vidéos sous /video/upload/, parfois sans extension.
    || /\/video\/upload\//.test(sansParams);
}

/** Même question pour l'audio, où le piège est identique. */
export function estFichierAudio(url) {
  if (!url) return false;
  const sansParams = String(url).split(/[?#]/)[0].toLowerCase();
  return /\.(mp3|wav|ogg|oga|m4a|aac|weba)$/.test(sansParams)
    // Cloudinary range l'audio sous /video/upload/ lui aussi.
    || /\/video\/upload\//.test(sansParams);
}
