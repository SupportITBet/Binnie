/**
 * GOOGLE ANALYTICS 4 — la mesure d'audience du site public.
 *
 * POURQUOI CE FICHIER PLUTÔT QU'UNE BALISE DANS `index.html`.
 *
 *  · L'IDENTIFIANT VIT DANS L'ENVIRONNEMENT, pas dans le dépôt. Une balise codée en dur
 *    envoie les visites de la machine de développement dans la propriété de production,
 *    et pollue durablement des chiffres qu'on ne peut plus nettoyer.
 *
 *  · SANS IDENTIFIANT, RIEN NE PART. Le script n'est même pas téléchargé : pas de requête
 *    vers Google, pas de cookie déposé, aucune erreur dans la console. Le site fonctionne
 *    exactement comme avant tant que `REACT_APP_GA4_ID` n'est pas renseigné.
 *
 *  · LE CHARGEMENT EST DIFFÉRÉ. `gtag.js` pèse une trentaine de kilo-octets : le charger
 *    dans le `<head>` retarde le premier affichage, et le référentiel BET fixe justement
 *    une cible de moins de 2,5 secondes (TECH-02). Il est injecté après le premier rendu.
 *
 * CE FICHIER NE REMPLACE PAS le traçage interne (`usePageTracking` → `page_views`), il le
 * complète : notre table sait ce que GA4 ignore - le dossier créé, le paiement encaissé -
 * et GA4 sait ce que notre table ignore : le terminal, la provenance, la campagne.
 */

const ID = (process.env.REACT_APP_GA4_ID || "").trim();

/** GA4 est-il configuré sur cet environnement ? */
export const ga4Actif = () => /^G-[A-Z0-9]{6,}$/i.test(ID);

let charge = false;

/**
 * Injecte `gtag.js` une seule fois et ouvre la mesure.
 *
 * `send_page_view: false` : c'est l'application qui décide quand une page est vue. Sur un
 * site à navigation interne, la vue automatique ne se déclenche qu'au premier chargement
 * et manque tous les changements d'écran suivants.
 */
export function initGA4() {
  if (!ga4Actif() || charge || typeof window === "undefined") return;
  charge = true;

  window.dataLayer = window.dataLayer || [];
  // `gtag` doit rester une FONCTION DÉCLARÉE avec `arguments` : la forme fléchée ne
  // possède pas d'objet `arguments`, et la file de `dataLayer` arriverait vide.
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", ID, {
    send_page_view: false,
    // La durée de vie par défaut des cookies GA4 est de deux ans : ramenée à treize mois,
    // la durée maximale admise par le RGPD pour un traceur de mesure d'audience.
    cookie_expires: 34128000,
    anonymize_ip: true,
  });

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  document.head.appendChild(s);
}

/** Une page vue, déclenchée à chaque changement d'écran. */
export function pageVueGA4(chemin, titre) {
  if (!ga4Actif() || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: chemin,
    page_title: titre || document.title,
    page_location: window.location.href,
  });
}

/**
 * Un événement du tunnel.
 *
 * Les noms suivent la nomenclature GA4 quand elle existe (`select_item`, `generate_lead`,
 * `begin_checkout`, `purchase`) : les rapports standard de la console les reconnaissent
 * et les affichent sans configuration. Un nom inventé obligerait à construire chaque
 * rapport à la main.
 */
export function evenementGA4(nom, params = {}) {
  if (!ga4Actif() || typeof window === "undefined" || !window.gtag) return;
  // Jamais de donnée personnelle : les conditions de Google l'interdisent, et un e-mail
  // envoyé par erreur ne peut plus être retiré de la propriété.
  const { email, telephone, nom: _nom, prenom, ...sains } = params;
  window.gtag("event", nom, sains);
}

/* ── Les événements du tunnel BET, nommés une seule fois ─────────────────── */

export const ga4 = {
  /** Une offre est retenue dans le catalogue ou le parcours. */
  offreChoisie: ({ offre, type_coaching, canal, prix }) =>
    evenementGA4("select_item", {
      item_list_name: "offres_bet",
      items: [{ item_name: offre, item_category: type_coaching, item_variant: canal, price: prix || undefined }],
    }),

  /** Une formule (rythme, pack) est retenue - l'étape qui fixe le tarif réel. */
  formuleChoisie: ({ offre, formule, tarif, canal }) =>
    evenementGA4("select_promotion", { promotion_name: formule, item_name: offre, canal, value: tarif || undefined, currency: "XOF" }),

  /** Le prospect laisse ses coordonnées : la conversion qui compte pour la commerciale. */
  leadEnvoye: ({ canal, type_coaching, offre }) =>
    evenementGA4("generate_lead", { canal, type_coaching, item_name: offre, currency: "XOF" }),

  /** Redirection vers le paiement. */
  paiementLance: ({ montant, offre, canal }) =>
    evenementGA4("begin_checkout", { value: montant || undefined, currency: "XOF", item_name: offre, canal }),

  /** Paiement confirmé au retour de la passerelle. */
  paiementConfirme: ({ montant, reference, offre }) =>
    evenementGA4("purchase", { transaction_id: reference, value: montant || undefined, currency: "XOF", item_name: offre }),

  /** Test de niveau : commencé puis terminé - le référentiel en suit le taux de complétion. */
  testCommence:  ({ test }) => evenementGA4("test_niveau_commence", { test }),
  testTermine:   ({ test, niveau }) => evenementGA4("test_niveau_termine", { test, niveau }),

  /** Téléchargement d'un document (catalogue, brochure d'offre). */
  documentTelecharge: ({ nom, type }) => evenementGA4("file_download", { file_name: nom, file_extension: type }),

  /** Clic sur un bouton WhatsApp - le référentiel le suit par centre. */
  contactWhatsApp: ({ centre }) => evenementGA4("contact_whatsapp", { centre: centre || "non_precise" }),
};
