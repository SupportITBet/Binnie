/**
 * Numéro WhatsApp → identifiant utilisable dans un lien wa.me.
 *
 * Les numéros sont saisis tels qu'on les lit (« 225 27 22 40 71 99 »), or wa.me
 * n'accepte que des chiffres : l'aperçu affiché au SuperAdmin montrait le numéro brut,
 * espaces compris, donc un lien qui ne fonctionnait pas. Le site applique la même
 * normalisation de son côté (Frontend/src/utils/numerosContact.js).
 */
export function numeroPourLien(brut) {
  const chiffres = String(brut || "").replace(/\D/g, "");
  if (!chiffres) return null;
  // Les numéros ivoiriens conservent leur 0 initial après l'indicatif depuis la
  // renumérotation de 2021 : « 0777880082 » → « 2250777880082 ».
  return chiffres.startsWith("225") ? chiffres : `225${chiffres}`;
}
