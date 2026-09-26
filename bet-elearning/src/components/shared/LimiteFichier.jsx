import React from "react";
import { maxMoPour } from "../../utils/uploadFichier";

/**
 * La taille acceptée pour un champ fichier, calculée et non écrite à la main.
 *
 * Les écrans annonçaient chacun leur chiffre : 200 Mo pour une vidéo ici, 50 Mo là, 20 Mo
 * pour un document ailleurs. Aucun n'était atteignable - le relais backend coupait à 4,5 Mo
 * et Cloudinary refuse les fichiers `raw` au-delà de 10 Mo. Un utilisateur qui préparait une
 * vidéo de 150 Mo sur la foi de ce texte perdait son temps deux fois : à la préparer, puis à
 * comprendre une erreur qui ne parlait pas de taille.
 *
 * Le chiffre vient donc de la même source que la validation, dans utils/uploadFichier.
 */

/** Le type MIME représentatif d'un type d'upload, quand aucun fichier n'est encore choisi. */
const MIME_PAR_DEFAUT = {
  avatar: "image/jpeg",
  image: "image/jpeg",
  video: "video/mp4",
  audio: "audio/mpeg",
  document: "application/pdf",
  dossier: "application/pdf",
  message: "application/pdf",
  contenu: "application/pdf",
  temoignage: "image/jpeg",
  recording: "audio/webm",
  "fichier-classe": "application/pdf",
};

export default function LimiteFichier({
  type = "document",
  /** Formats acceptés, à afficher avant la taille - « PDF, Word » par exemple. */
  formats,
  /** Le fichier déjà choisi : sa taille réelle affine la limite affichée. */
  fichier,
  /** Le type MIME visé quand il dépend d'un choix de l'utilisateur (vidéo vs PDF). */
  mimetype,
  style,
}) {
  const mime = fichier?.type || mimetype || MIME_PAR_DEFAUT[type] || "application/pdf";
  const max = maxMoPour(type, mime);
  const trop = fichier && fichier.size > max * 1024 * 1024;

  return (
    <p style={{ fontSize: 11, color: trop ? "#b91c1c" : "#94a3b8", margin: "5px 0 0", fontWeight: trop ? 700 : 400, ...style }}>
      {formats ? `${formats} - ` : ""}max {max} Mo
      {fichier ? ` · fichier choisi : ${(fichier.size / 1048576).toFixed(1)} Mo` : ""}
      {trop ? " - trop lourd" : ""}
    </p>
  );
}
