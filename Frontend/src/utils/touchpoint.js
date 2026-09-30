// Utilitaire partagé pour déclencher un paiement TouchPoint (Checkout page)
// depuis n'importe quelle modale d'inscription. Voir Backend/docs/touchpoint-integration.md
import { confirmerPaiementDefinitif } from "./confirmerPaiement";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";

// Attend que window.sendPaymentInfos soit exposée - le script TouchPoint peut
// terminer son initialisation interne un instant après son propre onload.
function waitForSendPaymentInfos(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (typeof window.sendPaymentInfos === "function") return resolve();
    const start = Date.now();
    const interval = setInterval(() => {
      if (typeof window.sendPaymentInfos === "function") {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Script TouchPoint indisponible."));
      }
    }, 150);
  });
}

// Le script TouchPoint utilise window.CryptoJS en interne (ex: "CryptoJS is
// not defined") sans le charger lui-même - chargé ici défensivement avant lui.
let cryptoJsPromise = null;
function loadCryptoJs() {
  if (typeof window.CryptoJS !== "undefined") return Promise.resolve();
  if (cryptoJsPromise) return cryptoJsPromise;
  cryptoJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js";
    script.type = "text/javascript";
    script.onload = resolve;
    script.onerror = () => { cryptoJsPromise = null; reject(new Error("Échec chargement CryptoJS")); };
    document.body.appendChild(script);
  });
  return cryptoJsPromise;
}

let scriptLoadingPromise = null;
export function loadTouchPointScript(scriptUrl) {
  if (typeof window.sendPaymentInfos === "function") return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;
  scriptLoadingPromise = loadCryptoJs().then(() => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.type = "text/javascript";
    script.onload = () => waitForSendPaymentInfos().then(resolve).catch(reject);
    script.onerror = () => { scriptLoadingPromise = null; reject(new Error("Échec chargement script TouchPoint")); };
    document.body.appendChild(script);
  }));
  return scriptLoadingPromise;
}

// Extrait un montant numérique d'une chaîne de prix catalogue (ex: "50 000 F/mois").
// Retourne null si aucun nombre exploitable (ex: "Sur devis") - dans ce cas, le
// paiement immédiat n'est pas possible et le flow doit retomber sur le
// comportement historique (demande envoyée, paiement géré plus tard).
export function parsePrixFCFA(value) {
  if (typeof value === "number") return value > 0 ? value : null;
  if (!value || typeof value !== "string") return null;
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return n > 0 ? n : null;
}

// Applique la réduction d'un code promo déjà validé (réponse de POST /api/codes-promo/valider,
// { type_reduction, valeur }) à un montant catalogue - même formule que
// Backend/src/routes/parcours.js (application code promo à la création du dossier), pour que
// le montant réellement facturé via TouchPoint corresponde à ce qui est affiché/enregistré.
export function calcMontantReduit(prixInitial, promo) {
  if (!promo || !prixInitial) return prixInitial;
  const reduction = promo.type_reduction === "pourcentage"
    ? Math.round(prixInitial * (Number(promo.valeur) / 100))
    : Math.min(Number(promo.valeur), prixInitial);
  return Math.max(0, prixInitial - reduction);
}

/**
 * Initie un paiement TouchPoint et déclenche SendPaymentInfos() - la
 * navigation vers la page de paiement TouchPoint suit (redirection complète,
 * pas un popup), donc rien à faire après l'appel en cas de succès.
 *
 * @param {object} clientInfo { nom, prenom, email, telephone, ville }
 * @param {number} montant
 * @param {string} offreLabel
 * @param {string} [assignationId] id de la fiche assignations_parcours déjà créée
 *   (permet au callback TouchPoint de mettre à jour son statut_paiement/montant_paye
 *   pour qu'elle apparaisse comme payée côté commerciale - voir touchpoint.js#callback)
 * @param {string} [assistanteId] id de la commerciale déjà assignée au prospect -
 *   sans ça, le paiement confirmé retombe sur un commercial_id bidon côté
 *   paiements_parcours et la commerciale ne reçoit aucune notification.
 * @param {string} [message] métadonnées JSON libres transmises telles quelles à
 *   paiements_touchpoint.message - lues par finalizeSuccessfulPayment pour router
 *   la finalisation (ex: {"context":"boutique","commande_id":"..."}).
 * @throws {Error} si l'initiation échoue (montant invalide, email manquant, etc.)
 */
export async function payerAvecTouchPoint({ clientInfo, montant, offreLabel, assignationId, assistanteId, message }) {
  if (!clientInfo?.email?.trim()) throw new Error("Un email est requis pour payer en ligne.");
  if (!montant || montant <= 0) throw new Error("Montant invalide pour le paiement en ligne.");

  /* LE DERNIER MOMENT OÙ L'ON PEUT ENCORE S'ARRÊTER. Passé cet écran, le paiement part vers
     TouchPoint et aucun remboursement n'est accordé - ce que rien ne disait jusqu'ici.
     Placée ICI, avant `/initiate`, et non plus loin : renoncer ne doit laisser aucune trace
     de paiement côté serveur, sinon la commerciale verrait des initiations fantômes qu'aucun
     encaissement ne vient jamais solder.
     Placée dans CETTE fonction, et non dans les écrans : les huit qui encaissent y passent
     tous, et le neuvième ajouté demain en héritera sans qu'on ait à y penser. */
  const confirme = await confirmerPaiementDefinitif({ montant, offreLabel });
  if (!confirme) {
    const e = new Error("Paiement annulé");
    e.annuleParUtilisateur = true;   // l'appelant distingue un refus d'une vraie panne
    throw e;
  }

  const res = await fetch(`${API_BASE}/api/touchpoint/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_nom:       clientInfo.nom,
      client_prenom:    clientInfo.prenom,
      client_email:     clientInfo.email,
      client_telephone: clientInfo.telephone,
      client_ville:     clientInfo.ville || "Abidjan",
      offre_label:      offreLabel,
      assignation_id:   assignationId || undefined,
      assistante_id:    assistanteId || undefined,
      message:          message || undefined,
      montant,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.order_number) throw new Error(data.error || "Impossible d'initier le paiement.");

  await loadTouchPointScript(data.script_url);

  window.sendPaymentInfos(
    data.order_number, data.agency_code, data.secure_code, data.domain_name,
    data.url_redirection_success, data.url_redirection_failed,
    data.amount, data.city, data.email, data.clientFirstName, data.clientLastName, data.clientPhone
  );
}
