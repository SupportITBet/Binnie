/**
 * Numéros de contact BET - lecture unique pour le footer, la page Contact et la FAQ.
 *
 * BET expose trois lignes WhatsApp, saisies par le SuperAdmin dans « Coordonnées
 * centrales ». Elles sont écrites telles qu'on les lit (« 225 27 22 40 71 99 »), alors
 * qu'un lien wa.me n'accepte que des chiffres : l'URL était construite avec les espaces,
 * qui devenaient des %20 - le lien du footer ne menait donc nulle part. On sépare ici
 * les deux besoins : `affichage` pour l'œil, `lien` pour wa.me.
 */

/** Chiffres seuls, préfixés de l'indicatif ivoirien quand il manque. */
export function numeroPourLien(brut) {
  const chiffres = String(brut || "").replace(/\D/g, "");
  if (!chiffres) return null;
  // Les numéros ivoiriens gardent leur 0 initial après l'indicatif depuis la renumérotation
  // de 2021 : « 0777880082 » devient « 2250777880082 », pas « 225777880082 ».
  return chiffres.startsWith("225") ? chiffres : `225${chiffres}`;
}

/** Le numéro tel qu'il a été saisi, espaces compris - plus lisible qu'une suite de chiffres. */
export function numeroPourAffichage(brut) {
  const t = String(brut || "").trim();
  if (!t) return null;
  return t.startsWith("+") ? t : `+${t}`;
}

/**
 * Les numéros renseignés, dans l'ordre de saisie.
 * Un champ vide est simplement absent de la liste : rien à masquer côté composant.
 * Les doublons sont écartés - le même numéro saisi deux fois ne s'affiche qu'une fois.
 */
export function numerosContact(config = {}) {
  const bruts = [config.whatsapp_number, config.whatsapp_number_2, config.whatsapp_number_3];
  const vus = new Set();
  const liste = [];
  for (const brut of bruts) {
    const lien = numeroPourLien(brut);
    if (!lien || vus.has(lien)) continue;
    vus.add(lien);
    liste.push({ lien, affichage: numeroPourAffichage(brut) });
  }
  return liste;
}

/** URL wa.me complète, message pré-rempli compris. */
export function lienWhatsApp(brut, message = "") {
  const num = numeroPourLien(brut);
  if (!num) return null;
  return `https://wa.me/${num}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
