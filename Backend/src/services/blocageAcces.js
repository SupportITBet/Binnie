import supabase from "../config/supabase.js";
import { sendNotificationEmail } from "./emailService.js";

/**
 * Blocage d'accès d'un apprenant - écriture du MOTIF, et information de l'intéressé.
 *
 * Jusqu'ici `acces_bloque` était un simple booléen : la page de connexion ne pouvait
 * afficher qu'une phrase générique (« contactez votre assistante »), et l'apprenant
 * n'était jamais prévenu. Il découvrait le blocage en essayant de se connecter, sans
 * savoir pourquoi ni quoi faire.
 *
 * Le motif vit dans `app_metadata`, aux côtés de `acces_bloque`, pour une raison
 * précise : ces données voyagent dans le JWT, donc la page de connexion les lit
 * immédiatement après signInWithPassword, sans requête supplémentaire et avant même la
 * déconnexion forcée. Une colonne en table aurait imposé un aller-retour à cet instant.
 *
 * Les trois points de blocage (suspension manuelle, absences côté dash, absences côté
 * e-learning) passent tous par ici : un seul endroit décide de ce que l'apprenant lit
 * et reçoit.
 */

const URL_ESPACE = process.env.FRONTEND_URL || "https://binniesenglish.com";

/**
 * Catalogue des motifs. `message` est ce que l'apprenant lira sur la page de connexion
 * et dans son email - écrit pour lui, pas pour l'administration : ce qui s'est passé,
 * et quoi faire ensuite.
 */
export const MOTIFS_BLOCAGE = {
  absences_repetees: {
    label: "Absences répétées",
    titre: "Accès suspendu - absences répétées",
    message: (ctx = {}) =>
      `Votre accès est suspendu après ${ctx.nb ?? 4} absences`
      + (ctx.groupe ? ` dans la classe « ${ctx.groupe} »` : "")
      + ". Contactez votre assistante commerciale pour faire le point et réactiver votre compte.",
  },
  non_paiement: {
    label: "Paiement en attente",
    titre: "Accès suspendu - paiement en attente",
    message: (ctx = {}) =>
      "Votre accès est suspendu : "
      + (ctx.mois ? `la mensualité de ${ctx.mois} n'a pas été réglée.` : "une mensualité reste impayée.")
      + " Régularisez votre paiement ou contactez votre assistante commerciale pour rétablir votre accès.",
  },
  manuel: {
    label: "Autre motif",
    titre: "Accès suspendu",
    message: (ctx = {}) =>
      ctx.message
      || "Votre accès a été suspendu par l'administration. Contactez votre assistante commerciale pour en connaître la raison et le faire rétablir.",
  },
};

/** Le texte présenté à l'apprenant, quel que soit le motif - jamais de code technique. */
export function messageDeBlocage(motif, contexte = {}) {
  const def = MOTIFS_BLOCAGE[motif] || MOTIFS_BLOCAGE.manuel;
  // Un message explicite prime sur le texte type : celui qui bloque connait souvent le
  // detail (« 3 absences en novembre »), et le lui interdire hors du motif « Autre »
  // l'obligerait a choisir un motif faux pour pouvoir etre precis.
  const texte = contexte.message ? String(contexte.message).trim() : def.message(contexte);
  return { titre: def.titre, message: texte };
}

/** Le catalogue tel que l'affiche le dashboard - libelle + texte exact que lira l'apprenant. */
export function catalogueMotifs() {
  return Object.entries(MOTIFS_BLOCAGE).map(([code, def]) => ({
    code,
    label:   def.label,
    titre:   def.titre,
    message: def.message({}),
  }));
}

/**
 * Bloque un apprenant, en consignant le motif et en le prévenant par email.
 *
 * L'email est « best-effort » : un envoi qui échoue ne doit pas empêcher le blocage,
 * qui est la mesure attendue. L'échec est journalisé pour rester visible.
 */
export async function bloquerAcces({ apprenantId, motif = "manuel", contexte = {}, message = null }) {
  if (!apprenantId) return { ok: false, error: "apprenantId requis" };

  const { titre, message: texte } = messageDeBlocage(motif, { ...contexte, message });

  const { data, error } = await supabase.auth.admin.updateUserById(apprenantId, {
    app_metadata: {
      acces_bloque:     true,
      blocage_motif:    motif,
      blocage_message:  texte,
      blocage_at:       new Date().toISOString(),
    },
  });
  if (error) return { ok: false, error: error.message };

  const user   = data?.user;
  const email  = user?.email || null;
  const prenom = user?.user_metadata?.prenom || user?.user_metadata?.nom || "";

  const envoye = await previenirApprenant({ email, prenom, titre, message: texte, tag: "blocage-acces" });
  return { ok: true, titre, message: texte, emailEnvoye: envoye };
}

/**
 * Envoi à l'apprenant, partagé par le blocage et la réintégration - les deux moments
 * doivent se ressembler, et un seul endroit décide de qui reçoit quoi.
 *
 * Un identifiant technique (@betacademy.app) n'est la boîte de personne : lui écrire ne
 * ferait que gonfler le taux de rebond chez Brevo. L'envoi est « best-effort » : un échec
 * ne doit jamais empêcher le blocage ou la réintégration, qui sont la mesure attendue.
 */
async function previenirApprenant({ email, prenom, titre, message, tag }) {
  const emailReel = email && !/@betacademy\.app$/i.test(email);
  if (!emailReel) return false;
  try {
    await sendNotificationEmail({
      prenom, email, titre, message,
      ctaLabel: "Accéder à mon espace",
      ctaUrl:   `${URL_ESPACE}/connexion`,
      tag,
    });
    return true;
  } catch (e) {
    console.warn("[blocage] email non envoyé à", email, ":", e.message);
    return false;
  }
}

/**
 * Débloque un apprenant : efface le motif et remet le compteur d'absences à zéro.
 *
 * Effacer le motif compte autant que le booléen - un motif laissé derrière réapparaîtrait
 * tel quel au prochain blocage, en annonçant une raison périmée.
 */
export async function debloquerAcces({ apprenantId }) {
  if (!apprenantId) return { ok: false, error: "apprenantId requis" };
  const { data, error } = await supabase.auth.admin.updateUserById(apprenantId, {
    app_metadata: {
      acces_bloque:      false,
      blocage_motif:     null,
      blocage_message:   null,
      blocage_at:        null,
      absences_reset_at: new Date().toISOString(),
    },
  });
  if (error) return { ok: false, error: error.message };

  // Prévenir aussi de la BONNE nouvelle : un apprenant bloqué puis réintégré sans un mot
  // n'a aucune raison de retenter sa connexion, et reste convaincu d'être exclu.
  const user   = data?.user;
  const prenom = user?.user_metadata?.prenom || user?.user_metadata?.nom || "";
  const envoye = await previenirApprenant({
    email:   user?.email || null,
    prenom,
    titre:   "Votre accès a été rétabli",
    message: "Bonne nouvelle : votre accès à l'espace apprenant est de nouveau actif. "
      + "Vous pouvez vous reconnecter dès maintenant et retrouver vos cours, vos séances et vos ressources.",
    tag:     "reintegration-acces",
  });

  return { ok: true, emailEnvoye: envoye };
}
