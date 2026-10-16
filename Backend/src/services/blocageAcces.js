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
      // Destinataire : un apprenant. `/connexion` servait l'ecran du personnel.
      ctaUrl:   `${URL_ESPACE}/connexion/apprenant`,
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

/* ════════════════════════════════════════════════════════════════════════════════
   LE COACHING PRIVÉ EN FAMILLE — un impayé vaut pour toute la famille
   ════════════════════════════════════════════════════════════════════════════════

   Un couple ou une famille qui prend un coaching privé ensemble partage UN dossier,
   UN montant, UN échéancier. Bloquer le seul payeur pendant que son conjoint et ses
   enfants continuent de suivre les séances viderait la sanction de son sens : le coach
   se déplace quand même, et la formation continue d'être dispensée sans être payée.

   MAIS SEULEMENT POUR L'IMPAYÉ. Des absences répétées sont le fait d'une personne : en
   punir sa famille serait absurde, et c'est le genre d'automatisme qui fait perdre
   confiance dans un outil. La propagation est donc conditionnée au motif, jamais
   appliquée par défaut.

   LE LIEN DE FAMILLE se lit dans `groupes_apprenants.note`, qui porte l'identifiant de
   l'assignation payeuse pour chaque inscrit. Partager cette assignation, c'est être de
   la même famille - il n'existe pas d'autre cas où plusieurs inscriptions pointent le
   même dossier.
   ════════════════════════════════════════════════════════════════════════════════ */

/** Les comptes des AUTRES membres de la famille d'un apprenant (jamais lui-même). */
export async function comptesDeLaFamille(apprenantId) {
  if (!apprenantId) return [];
  try {
    const { data: siennes } = await supabase
      .from("groupes_apprenants")
      .select("note")
      .eq("apprenant_id", apprenantId);

    const assignations = new Set();
    for (const ligne of siennes || []) {
      try {
        const id = JSON.parse(ligne.note || "{}").assignation_id;
        if (id) assignations.add(id);
      } catch { /* note libre ou illisible : cette ligne ne dit rien de la famille */ }
    }
    if (assignations.size === 0) return [];

    // `note.ilike.%id%` plutôt qu'une jointure : le lien vit dans un JSON stocké en texte,
    // sans clé étrangère. Même technique que la résolution de classe dans parcours.js.
    const { data: parentes } = await supabase
      .from("groupes_apprenants")
      .select("apprenant_id, note")
      .not("apprenant_id", "is", null)
      .or([...assignations].map(id => `note.ilike.%${id}%`).join(","));

    const comptes = new Set();
    for (const ligne of parentes || []) {
      if (!ligne.apprenant_id || ligne.apprenant_id === apprenantId) continue;
      try {
        const id = JSON.parse(ligne.note || "{}").assignation_id;
        if (id && assignations.has(id)) comptes.add(ligne.apprenant_id);
      } catch { /* ignorée */ }
    }
    return [...comptes];
  } catch (e) {
    console.warn("[blocageAcces] famille non résolue :", e.message);
    return [];
  }
}

/**
 * Étend un blocage ou un déblocage aux autres membres de la famille.
 *
 * Silencieux par conception : un échec sur un membre ne doit pas faire échouer l'action
 * principale sur le payeur, qui reste l'acte demandé. On retourne le compte de ce qui a
 * été fait, pour que l'appelant puisse le dire - une propagation partielle annoncée vaut
 * mieux qu'une propagation totale supposée.
 */
export async function propagerALaFamille({ apprenantId, bloque, motif = "non_paiement", message = null }) {
  if (motif !== "non_paiement") return { concernes: 0, traites: 0 };

  const comptes = await comptesDeLaFamille(apprenantId);
  if (comptes.length === 0) return { concernes: 0, traites: 0 };

  let traites = 0;
  for (const id of comptes) {
    const r = bloque
      ? await bloquerAcces({ apprenantId: id, motif: "non_paiement", message })
      : await debloquerAcces({ apprenantId: id });
    if (r.ok) traites++;
    else console.warn(`[blocageAcces] famille - ${id} non traité :`, r.error);
  }
  return { concernes: comptes.length, traites };
}
