/**
 * L'annulation d'un média n'est pas une erreur - et ne doit pas recouvrir la page.
 *
 * DEUX ÉVÉNEMENTS DISTINCTS produisent le même message, « The fetching process for the
 * media resource was aborted by the user agent at the user's request » :
 *
 *  · un `error` sur la balise, code 1 (`MEDIA_ERR_ABORTED`), quand on ferme l'écran
 *    pendant le chargement ;
 *  · une PROMESSE `play()` REJETÉE en `AbortError`, quand on clique sur « play » alors que
 *    le fichier est encore en cours de téléchargement - le navigateur relance la requête
 *    et abandonne la précédente. C'est ce second cas qu'un `onError` posé sur l'élément ne
 *    voit jamais, et c'est celui que l'on rencontrait.
 *
 * Dans les deux cas, l'overlay de développement de React l'affiche en « Uncaught runtime
 * error » PLEIN ÉCRAN, qui recouvre l'interface : le bouton « Marquer comme terminé »
 * devient inatteignable, d'où l'impression qu'il ne fonctionne pas.
 *
 * VOLONTAIREMENT ÉTROIT. On ne masque que ce qui est réellement une annulation :
 *  · codes 1 et 2 seulement, et uniquement sur une balise `<audio>` ou `<video>` ;
 *  · rejets nommés `AbortError` ou `NotAllowedError` - ce dernier étant le refus
 *    d'autoplay du navigateur, qui n'est pas davantage une panne.
 * Les codes 3 et 4 - décodage impossible, source non supportée - continuent de remonter :
 * les masquer cacherait un fichier réellement cassé.
 *
 * Importé en PREMIER dans `index.js` pour être enregistré avant le reste de l'application.
 */

window.addEventListener("error", (e) => {
  const el = e.target;
  if (!el || (el.tagName !== "AUDIO" && el.tagName !== "VIDEO")) return;
  const code = el.error?.code;
  if (code === 1 || code === 2) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

window.addEventListener("unhandledrejection", (e) => {
  const nom = e.reason?.name;
  if (nom === "AbortError" || nom === "NotAllowedError") {
    // `preventDefault` suffit à marquer le rejet comme traité : c'est ce que l'overlay
    // et la console regardent pour décider d'alerter.
    e.preventDefault();
  }
}, true);
