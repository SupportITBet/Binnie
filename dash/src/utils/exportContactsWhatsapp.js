/**
 * Export des numéros collectés vers le carnet d'adresses, pour une diffusion WhatsApp
 * manuelle.
 *
 * Le contournement assumé tant que l'envoi automatique n'est pas en place : WhatsApp ne
 * laisse écrire à personne sans passer par une API payante, mais une LISTE DE DIFFUSION
 * depuis le téléphone ne coûte rien. Elle impose en revanche trois règles que le code ne
 * peut pas contourner, seulement rendre visibles :
 *
 *  1. 256 destinataires par liste - d'où le découpage en plusieurs fichiers.
 *  2. Le destinataire ne reçoit le message QUE s'il a le numéro de BET enregistré chez
 *     lui. Une liste de prospects froids part sans erreur et n'arrive nulle part : c'est
 *     la limite la plus coûteuse, et aucune alerte ne la signale.
 *  3. Il faut avoir leur numéro enregistré - c'est l'objet même de ce fichier.
 *
 * Le format vCard plutôt qu'un CSV : c'est le seul qu'un iPhone ou un Android importe
 * directement dans ses contacts. Un CSV obligerait à saisir deux cents numéros à la main.
 */

/** Préfixe des noms importés : il sert à les retrouver, et surtout à les SUPPRIMER en bloc. */
export const PREFIXE_CONTACT = "BET";

/** L'indicatif supposé pour un numéro local saisi sans « + ». */
const PAYS_DEFAUT = "225";

/**
 * Le numéro au format international. Miroir de `normaliserTelephone` côté serveur.
 *
 * Un numéro mal formé n'est pas « corrigé au mieux » mais écarté : un contact au mauvais
 * numéro est pire qu'un contact absent - il part dans la liste et le message atterrit
 * chez un inconnu.
 */
export function normaliserTelephone(brut) {
  if (!brut) return null;
  let t = String(brut).trim();
  const plus = t.startsWith("+") || t.startsWith("00");
  t = t.replace(/\D/g, "");
  if (t.startsWith("00")) t = t.slice(2);
  // Sans le « + » d'origine, on ne suppose l'indicatif que pour une longueur locale
  // plausible : un numéro étranger mal saisi resterait faux, et silencieusement.
  if (!plus && (t.length === 8 || t.length === 10)) t = PAYS_DEFAUT + t;
  if (t.length < 8 || t.length > 15) return null;
  return "+" + t;
}

/** Échappement vCard : ces caractères sont des séparateurs dans le format. */
const echapperVcf = (t) =>
  String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/**
 * Prépare les contacts à partir des lignes d'export.
 *
 * Dédoublonne par NUMÉRO : la même personne peut avoir répondu deux fois, et un doublon
 * dans le carnet donne deux fois le même message.
 */
export function preparerContacts(lignes = [], { seulementConsentants = true } = {}) {
  const par = new Map();
  let sansNumero = 0, invalides = 0, sansConsentement = 0;

  for (const l of lignes) {
    if (!l.telephone) { sansNumero++; continue; }
    const tel = normaliserTelephone(l.telephone);
    if (!tel) { invalides++; continue; }
    const consent = l.consentement === "Oui" || l.consentement === true;
    if (!consent) { sansConsentement++; if (seulementConsentants) continue; }

    if (!par.has(tel)) {
      par.set(tel, {
        telephone: tel,
        nom: (l.nom || "").trim(),
        origine: [l.formulaire, l.canal].filter(Boolean).join(" - "),
        consentement: consent,
      });
    } else if (consent) {
      par.get(tel).consentement = true;
    }
  }

  return { contacts: [...par.values()], sansNumero, invalides, sansConsentement };
}

/** Un contact, en vCard 3.0. Les fins de ligne sont en CRLF, comme l'impose le format. */
function vcard({ telephone, nom, origine }) {
  // Un nom vide donnerait un contact anonyme, impossible à reconnaître dans le carnet :
  // on retombe alors sur le numéro lui-même.
  const affiche = `${PREFIXE_CONTACT} · ${nom || telephone}`;
  const morceaux = (nom || "").split(/\s+/).filter(Boolean);
  const famille = morceaux.length > 1 ? morceaux[morceaux.length - 1] : (nom || telephone);
  const prenom = morceaux.length > 1 ? morceaux.slice(0, -1).join(" ") : "";

  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${echapperVcf(famille)};${echapperVcf(prenom)};;;`,
    `FN:${echapperVcf(affiche)}`,
    `TEL;TYPE=CELL:${telephone}`,
    origine ? `NOTE:${echapperVcf(`Collecte BET - ${origine}`)}` : null,
    "END:VCARD",
  ].filter(Boolean).join("\r\n");
}

/** Plafond WhatsApp : une liste de diffusion n'accepte pas plus de 256 destinataires. */
export const MAX_PAR_LISTE = 256;

/** Découpe en paquets de 256, un par liste de diffusion à créer. */
export function decouperEnListes(contacts, taille = MAX_PAR_LISTE) {
  const lots = [];
  for (let i = 0; i < contacts.length; i += taille) lots.push(contacts.slice(i, i + taille));
  return lots;
}

/** Déclenche un téléchargement local. L'URL objet est libérée : sans ça elle fuit. */
function telecharger(contenu, nomFichier, type) {
  const blob = new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nomFichier;
  document.body.appendChild(a); a.click(); a.remove();
  // Différé : révoquer immédiatement annule le téléchargement sur certains navigateurs.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const base = (titre) =>
  String(titre || "contacts").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 32);

/**
 * Génère les fichiers vCard, un par liste de diffusion.
 * Renvoie le nombre de fichiers produits.
 */
export function exporterVcards(contacts, titre) {
  const lots = decouperEnListes(contacts);
  lots.forEach((lot, i) => {
    const contenu = lot.map(vcard).join("\r\n") + "\r\n";
    // Le numéro de fichier n'apparaît que s'il y en a plusieurs : « contacts-1.vcf »
    // tout seul laisse croire qu'il en manque.
    const suffixe = lots.length > 1 ? `-liste-${i + 1}-sur-${lots.length}` : "";
    telecharger(contenu, `bet-${base(titre)}${suffixe}.vcf`, "text/vcard;charset=utf-8");
  });
  return lots.length;
}

/** La liste brute des numéros, un par ligne - pour un collage rapide ou un outil tiers. */
export function exporterNumeros(contacts, titre) {
  const contenu = contacts.map(c => c.telephone).join("\n") + "\n";
  telecharger(contenu, `bet-${base(titre)}-numeros.txt`, "text/plain;charset=utf-8");
}
