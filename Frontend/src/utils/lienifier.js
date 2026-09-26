import React from "react";

/**
 * Rend cliquables les liens et adresses e-mail d'un message.
 *
 * Les messages étaient rendus en texte brut (`<div>{msg.content}</div>`) : une assistante
 * pouvait envoyer un lien de séance ou de paiement, le destinataire ne pouvait que le
 * recopier à la main.
 *
 * Jamais via `dangerouslySetInnerHTML` : le contenu est saisi par un tiers, l'interpréter
 * comme du HTML ouvrirait une injection de script dans la messagerie. On découpe donc le
 * texte et on renvoie des nœuds React - un `<a>` reste un `<a>`, et tout le reste demeure
 * du texte, quoi qu'il contienne.
 *
 * Les liens héritent de la couleur de leur bulle (`color: inherit`) : la même fonction
 * sert sur fond coloré (message envoyé, texte blanc) et sur fond blanc (message reçu).
 */

// Trois formes reconnues : URL complète, domaine en www., adresse e-mail.
const MOTIF = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[\w.+-]+@[\w-]+\.[\w.-]+)/gi;

// La ponctuation finale appartient à la phrase, pas à l'adresse : « voir https://bet.ci. »
// ne doit pas produire un lien terminé par un point. Les parenthèses ne sont retirées que
// si elles ne sont pas ouvertes dans le lien lui-même.
const nettoyerFin = (brut) => {
  let url = brut;
  let suffixe = "";
  while (url.length > 1) {
    const dernier = url[url.length - 1];
    if (".,;:!?»".includes(dernier)) { suffixe = dernier + suffixe; url = url.slice(0, -1); continue; }
    if (dernier === ")" && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
      suffixe = dernier + suffixe; url = url.slice(0, -1); continue;
    }
    break;
  }
  return { url, suffixe };
};

const styleLien = { color: "inherit", textDecoration: "underline", wordBreak: "break-all" };

export function lienifier(texte) {
  if (!texte || typeof texte !== "string") return texte;

  const morceaux = [];
  let dernierIndex = 0;
  let m;
  MOTIF.lastIndex = 0;

  while ((m = MOTIF.exec(texte)) !== null) {
    const { url, suffixe } = nettoyerFin(m[0]);
    if (m.index > dernierIndex) morceaux.push(texte.slice(dernierIndex, m.index));

    const estEmail = !/^https?:\/\//i.test(url) && !/^www\./i.test(url) && url.includes("@");
    const href = estEmail ? `mailto:${url}` : (/^https?:\/\//i.test(url) ? url : `https://${url}`);

    morceaux.push(
      <a
        key={`${m.index}-${url}`}
        href={href}
        target={estEmail ? undefined : "_blank"}
        // noopener : sans lui, la page ouverte garde une référence vers la nôtre via
        // window.opener et peut la rediriger. noreferrer va avec.
        rel={estEmail ? undefined : "noopener noreferrer"}
        onClick={(e) => e.stopPropagation()}
        style={styleLien}
      >
        {url}
      </a>
    );

    if (suffixe) morceaux.push(suffixe);
    dernierIndex = m.index + m[0].length;
  }

  if (!morceaux.length) return texte;
  if (dernierIndex < texte.length) morceaux.push(texte.slice(dernierIndex));
  return morceaux;
}

export default lienifier;
