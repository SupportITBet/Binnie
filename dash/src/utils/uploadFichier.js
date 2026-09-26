/**
 * Envoi d'un fichier - directement du navigateur vers Cloudinary.
 *
 * Le chemin historique postait le fichier à `/api/upload/<type>`, qui le relayait à
 * Cloudinary. Ce relais n'apportait rien - le backend ne conserve aucun fichier - et coûtait
 * très cher : Vercel plafonne le corps d'une requête à 4,5 Mo sur TOUS ses plans. Au-delà,
 * la plateforme répondait 413 avant Express, donc sans en-têtes CORS, et le navigateur
 * affichait « No 'Access-Control-Allow-Origin' header » - un message qui n'avait aucun
 * rapport avec la cause et rendait la panne indéchiffrable.
 *
 * Ici, le backend ne signe que l'autorisation (quelques centaines d'octets) ; le fichier va
 * directement chez Cloudinary. Les limites redeviennent celles de Cloudinary : 100 Mo pour
 * une vidéo, 10 Mo pour une image ou un PDF.
 *
 * Le repli sur l'ancienne route existe pour les déploiements où `/signature` n'est pas
 * encore en ligne, et il n'est tenté que sous la limite de Vercel - au-delà, il échouerait
 * de la même façon incompréhensible qu'avant.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";

/** Plafond de Vercel sur le corps d'une requête. Vaut pour l'ancien chemin uniquement. */
export const LIMITE_RELAIS_MO = 4.5;

/** Plafonds Cloudinary par type de ressource - ils priment sur toute limite applicative. */
const LIMITES_CLOUDINARY_MO = { image: 10, video: 100, raw: 10 };

/** Le type de ressource Cloudinary d'un fichier. L'audio se range sous `video`. */
function typeRessource(mimetype = "") {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "video";
  return "raw";
}

/**
 * Les plafonds applicatifs, miroir de `Backend/src/config/uploads.js`. Le serveur reste
 * l'autorité - ceci sert à refuser AVANT le réseau, avec un message juste, plutôt que de
 * laisser l'utilisateur attendre l'envoi d'un fichier voué à être rejeté.
 */
const MAX_MO = {
  avatar: 5,
  message: 5,
  contenu: (m) => (m.startsWith("video/") ? 100 : m.startsWith("audio/") ? 20 : m.startsWith("image/") ? 5 : 10),
  image: 10,
  video: 100,
  audio: 100,
  recording: 50,
  temoignage: 5,
  dossier: 10,
  "fichier-classe": (m) => (m.startsWith("video/") || m.startsWith("audio/") ? 100 : 10),
  document: 10,
  // Miroir de `piece-jointe` cote serveur. Sans cette entree, le repli `?? 10` refuserait
  // une video de 30 Mo AVANT meme d'interroger le serveur, qui l'aurait acceptee.
  "piece-jointe": (m) => (m.startsWith("video/") ? 30 : m.startsWith("audio/") ? 20 : 10),
};

/** Le plafond réel pour un type d'upload et un fichier donnés, en Mo. */
export function maxMoPour(type, mimetype = "") {
  const regle = MAX_MO[type];
  const applicatif = typeof regle === "function" ? regle(mimetype) : (regle ?? 10);
  return Math.min(applicatif, LIMITES_CLOUDINARY_MO[typeRessource(mimetype)]);
}

/** Le texte à afficher sous un champ fichier, pour que l'UI cesse d'inventer ses chiffres. */
export function libelleLimite(type, mimetype = "") {
  return `Taille max : ${maxMoPour(type, mimetype)} Mo`;
}

const entetes = () => {
  const token = localStorage.getItem("admin_token") || localStorage.getItem("user_token") || localStorage.getItem("coach_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Envoi via l'ancienne route de relais - conservé comme repli sous la limite de Vercel. */
async function envoyerParRelais(fichier, type, onProgress) {
  const fd = new FormData();
  fd.append("file", fichier);
  const r = await fetch(`${API_URL}/api/upload/${type}`, { method: "POST", headers: entetes(), body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Échec de l'envoi");
  onProgress?.(100);
  const f = d.file || d;
  return { url: f.url || d.url, public_id: f.public_id, size: f.size, original_name: f.original_name, resource_type: f.resource_type };
}

/**
 * Envoie un fichier et renvoie `{ url, public_id, size, original_name, resource_type }`,
 * c'est-à-dire exactement la forme que renvoyaient déjà les routes de relais.
 *
 * @param {File}   fichier
 * @param {string} type        clé de `/api/upload/<type>` : "contenu", "video", "document"…
 * @param {object} [options]
 * @param {(pct:number)=>void} [options.onProgress] progression 0→100
 */
export async function uploadFichier(fichier, type, { onProgress } = {}) {
  if (!fichier) throw new Error("Aucun fichier sélectionné");

  // Refuser tout de suite ce qui sera refusé de toute façon : un envoi de 80 Mo qui échoue
  // au bout de deux minutes est bien pire qu'un refus immédiat et explicite.
  const maxMo = maxMoPour(type, fichier.type || "");
  if (fichier.size > maxMo * 1024 * 1024) {
    throw new Error(`Fichier trop lourd : ${(fichier.size / 1048576).toFixed(1)} Mo (maximum ${maxMo} Mo)`);
  }

  let sign;
  try {
    const r = await fetch(`${API_URL}/api/upload/signature`, {
      method: "POST",
      headers: { ...entetes(), "Content-Type": "application/json" },
      body: JSON.stringify({ type, nom: fichier.name, mimetype: fichier.type || "", taille: fichier.size }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Un refus motivé du serveur (format, taille, droits) doit remonter tel quel ; seule
      // une route absente justifie le repli.
      if (r.status !== 404) throw new Error(d.error || "Envoi refusé");
      sign = null;
    } else {
      sign = d;
    }
  } catch (e) {
    if (e.message && e.message !== "Failed to fetch") throw e;
    sign = null;
  }

  if (!sign) {
    if (fichier.size > LIMITE_RELAIS_MO * 1024 * 1024) {
      throw new Error(
        `Envoi direct indisponible et fichier trop lourd pour le relais (${(fichier.size / 1048576).toFixed(1)} Mo, maximum ${LIMITE_RELAIS_MO} Mo). Le serveur doit être redéployé.`
      );
    }
    return envoyerParRelais(fichier, type, onProgress);
  }

  const fd = new FormData();
  fd.append("file", fichier);
  fd.append("api_key",   sign.api_key);
  fd.append("timestamp", sign.timestamp);
  fd.append("signature", sign.signature);
  fd.append("folder",    sign.folder);
  fd.append("public_id", sign.public_id);
  // Le serveur demande une conversion (HEIC d'iPhone, AVIF, TIFF -> JPEG). Ce champ est
  // SIGNE : l'omettre invaliderait la signature, l'envoi serait refuse.
  if (sign.format) fd.append("format", sign.format);

  // XHR plutôt que fetch : c'est le seul moyen d'obtenir la progression d'un envoi, et sur
  // une vidéo de 80 Mo une barre de progression n'est pas un confort mais une nécessité.
  const resultat = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", sign.url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let d = {};
      try { d = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) return resolve(d);
      reject(new Error(d?.error?.message || `Cloudinary a refusé le fichier (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Connexion interrompue pendant l'envoi"));
    xhr.send(fd);
  });

  onProgress?.(100);
  return {
    url:           resultat.secure_url,
    public_id:     resultat.public_id,
    size:          resultat.bytes,
    original_name: fichier.name,
    resource_type: resultat.resource_type,
  };
}

export default uploadFichier;
