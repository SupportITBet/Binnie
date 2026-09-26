// Nettoyage automatique des fichiers partagés dans les chats de classe - supprime de Cloudinary
// tout fichier de plus de 30 jours dans le dossier bet/messages, pour ne pas saturer le quota.
// Volontairement simple : ne touche pas à Firestore (pas besoin du Firebase Admin SDK). Le lien
// dans le fil de discussion peut donc devenir mort après suppression - compromis accepté pour
// éviter la dépendance à une clé de compte de service en plus.
import { v2 as cloudinary } from "cloudinary";

const JOURS_RETENTION = 30;
const DOSSIER = "bet/messages";
const RESOURCE_TYPES = ["image", "video", "raw"]; // "video" couvre aussi l'audio chez Cloudinary

async function nettoyerResourceType(resourceType, limite) {
  let supprimes = 0;
  let cursor;
  do {
    const res = await cloudinary.api.resources({
      type: "upload",
      resource_type: resourceType,
      prefix: DOSSIER,
      max_results: 500,
      next_cursor: cursor,
    });
    const expires = (res.resources || [])
      .filter(r => new Date(r.created_at) < limite)
      .map(r => r.public_id);
    if (expires.length) {
      await cloudinary.api.delete_resources(expires, { resource_type: resourceType });
      supprimes += expires.length;
    }
    cursor = res.next_cursor;
  } while (cursor);
  return supprimes;
}

export async function nettoyerFichiersChatExpires() {
  try {
    const limite = new Date(Date.now() - JOURS_RETENTION * 24 * 60 * 60 * 1000);
    let total = 0;
    for (const type of RESOURCE_TYPES) {
      total += await nettoyerResourceType(type, limite);
    }
    if (total > 0) console.log(`[cleanupChatFiles] ${total} fichier(s) de plus de ${JOURS_RETENTION} jours supprimé(s) de Cloudinary (bet/messages).`);
  } catch (err) {
    console.error("[cleanupChatFiles] échec du nettoyage", err.message);
  }
}

// Lance le nettoyage au démarrage (avec un délai pour laisser le serveur finir de démarrer),
// puis une fois toutes les 24h.
export function demarrerNettoyageFichiersChat() {
  setTimeout(nettoyerFichiersChatExpires, 60 * 1000);
  setInterval(nettoyerFichiersChatExpires, 24 * 60 * 60 * 1000);
}
