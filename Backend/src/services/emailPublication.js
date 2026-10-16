import supabase from "../config/supabase.js";
import { sendNotificationEmail } from "./emailService.js";

/**
 * Email de publication - prévenir les apprenants d'une classe, et leurs parents.
 *
 * Jusqu'ici, publier un contenu ou une évaluation n'insérait qu'une notification dans
 * l'espace de l'apprenant. Un devoir avec échéance ne partait donc nulle part : celui qui
 * ne se connectait pas ne savait pas qu'il était attendu.
 *
 * Deux règles gouvernent ce service, et ce sont elles qui le rendent utilisable :
 *
 *  • UN SEUL ENVOI PAR RESSOURCE. Un coach dépublie et republie volontiers - pour corriger
 *    une faute, ajuster une date. Sans mémoire, trois hésitations font trois emails pour un
 *    seul devoir, et les apprenants se désabonnent de tout. La table
 *    `emails_publication_envoyes` porte cette mémoire, et son index unique en est la
 *    garantie : deux publications simultanées ne peuvent pas la contourner.
 *
 *  • ON N'ÉCRIT QU'À DE VRAIES BOÎTES. Les identifiants @betacademy.app sont générés pour
 *    permettre la connexion d'apprenants sans email ; @example.com appartient aux données de
 *    test. Écrire à ces adresses ne produit que des rebonds, et les rebonds dégradent la
 *    délivrabilité de TOUS les envois, y compris ceux qui comptent.
 */

const URL_ESPACE = process.env.FRONTEND_URL || "https://binniesenglish.com";

/** Une adresse à laquelle on peut réellement écrire. */
const adresseReelle = (email) => {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return false;
  return !/@betacademy\.app$/.test(e) && !/@example\.com$/.test(e);
};

/**
 * Les destinataires d'une publication : les apprenants des classes visées, et le parent
 * rattaché à leur dossier.
 *
 * Le parent se trouve sur `assignations_parcours.email_parent` - il n'existe pas de table
 * de liaison. On rapproche par l'email de l'apprenant, seul lien présent des deux côtés.
 */
export async function destinatairesPourClasses(groupeIds = []) {
  if (!groupeIds.length) return { apprenants: [], parents: [] };

  const { data: gas } = await supabase
    .from("groupes_apprenants")
    .select("apprenant_id, email_apprenant")
    .in("groupe_id", groupeIds)
    .eq("statut", "actif");

  const ids = [...new Set((gas || []).map((g) => g.apprenant_id).filter(Boolean))];
  let apprenants = [];
  if (ids.length) {
    const { data: us } = await supabase
      .from("utilisateurs").select("id, email, prenom, nom").in("id", ids);
    apprenants = (us || []).filter((u) => adresseReelle(u.email));
  }

  // Les apprenants rattachés par email seul (importés sans compte) comptent aussi.
  const emailsGa = [...new Set((gas || []).map((g) => g.email_apprenant).filter(adresseReelle))];
  const dejaVus = new Set(apprenants.map((a) => a.email.toLowerCase()));
  for (const e of emailsGa) {
    if (!dejaVus.has(e.toLowerCase())) {
      apprenants.push({ id: null, email: e, prenom: "", nom: "" });
      dejaVus.add(e.toLowerCase());
    }
  }

  // Parents : un dossier par apprenant, retrouvé sur son email.
  const tousEmails = apprenants.map((a) => a.email).filter(Boolean);
  let parents = [];
  if (tousEmails.length) {
    const { data: dossiers } = await supabase
      .from("assignations_parcours")
      .select("prospect_email, email_parent, nom_parent")
      .in("prospect_email", tousEmails)
      .not("email_parent", "is", null);
    const vus = new Set();
    for (const d of dossiers || []) {
      const e = String(d.email_parent).toLowerCase();
      if (!adresseReelle(e) || vus.has(e)) continue;
      vus.add(e);
      parents.push({ email: d.email_parent, prenom: d.nom_parent || "" });
    }
  }

  return { apprenants, parents };
}

/** L'envoi a-t-il déjà eu lieu pour cette ressource ? */
export async function emailDejaEnvoye(ressourceType, ressourceId) {
  const { data } = await supabase
    .from("emails_publication_envoyes")
    .select("id, envoye_le, nb_destinataires")
    .eq("ressource_type", ressourceType)
    .eq("ressource_id", ressourceId)
    .maybeSingle();
  return data || null;
}

/**
 * Envoie l'email de publication, une fois et une seule.
 *
 * L'ordre compte : on RÉSERVE d'abord l'envoi en base, puis on écrit. Réserver après
 * l'envoi laisserait une fenêtre pendant laquelle une seconde publication partirait aussi.
 * Si la réservation échoue sur l'index unique, c'est que quelqu'un a déjà envoyé.
 *
 * L'envoi est « best-effort » : une adresse qui échoue n'interrompt pas les suivantes, et
 * un échec global n'annule jamais la publication elle-même, qui est la mesure attendue.
 *
 * @returns {{ envoye: boolean, raison?: string, apprenants?: number, parents?: number }}
 */
export async function envoyerEmailPublication({
  ressourceType,          // "contenu" | "evaluation"
  ressourceId,
  titre,
  message,
  /* CHAQUE AUDIENCE A SA PAGE, et c'est possible parce que les deux envois sont deja des
     boucles separees plus bas. Ce parametre valait `/connexion`, l'ecran du PERSONNEL :
     apprenants comme parents atterrissaient sur « Super Admin / Manager / Superviseur... ».
     Il n'existe plus aucune page d'accueil commune a plusieurs profils - laisser une valeur
     unique obligerait a envoyer la moitie des destinataires au mauvais endroit.
     `ctaUrl` reste surchargeable par l'appelant : s'il le passe, il vaut pour tout le monde. */
  ctaUrl = null,
  ctaLabel = "Ouvrir mon espace",
  groupeIds = [],
  parEmailParents = true,
  acteurId = null,
}) {
  try {
    if (!ressourceId || !groupeIds.length) {
      return { envoye: false, raison: "aucune classe destinataire" };
    }

    const { apprenants, parents } = await destinatairesPourClasses(groupeIds);
    const listeParents = parEmailParents ? parents : [];
    if (!apprenants.length && !listeParents.length) {
      return { envoye: false, raison: "aucune adresse réelle parmi les destinataires" };
    }

    // Réservation AVANT envoi : l'index unique tranche en cas de republication.
    const { error: errReserve } = await supabase
      .from("emails_publication_envoyes")
      .insert({
        ressource_type: ressourceType,
        ressource_id: ressourceId,
        titre: titre || null,
        nb_destinataires: apprenants.length,
        nb_parents: listeParents.length,
        envoye_par: acteurId,
      });
    if (errReserve) {
      // Distinguer le doublon du reste : sur une violation d'unicité, l'email est
      // légitimement déjà parti. Sur toute autre erreur - table absente, base
      // injoignable - annoncer « déjà envoyé » masquerait une panne derrière un
      // message rassurant, et personne ne recevrait jamais rien.
      const duplicata = errReserve.code === "23505"
        || /duplicate key|already exists/i.test(errReserve.message || "");
      if (duplicata) {
        return { envoye: false, raison: "email déjà envoyé pour cette publication" };
      }
      console.error(
        "[emailPublication] réservation impossible - aucun email envoyé.",
        errReserve.message,
        "\n→ La table emails_publication_envoyes existe-t-elle ? Exécuter sql/emails_publication_envoyes.sql."
      );
      return { envoye: false, raison: `envoi impossible : ${errReserve.message}` };
    }

    let ok = 0;
    for (const a of apprenants) {
      try {
        await sendNotificationEmail({
          prenom: a.prenom || "", email: a.email,
          titre, message, ctaLabel,
          ctaUrl: ctaUrl || `${URL_ESPACE}/connexion/apprenant`,
          tag: `publication-${ressourceType}`,
        });
        ok++;
      } catch (e) {
        console.warn("[emailPublication] échec pour", a.email, ":", e.message);
      }
    }

    for (const p of listeParents) {
      try {
        await sendNotificationEmail({
          prenom: p.prenom || "", email: p.email,
          titre,
          // Le parent n'est pas l'élève : on le lui rappelle, sinon le message se lit
          // comme une consigne qui lui serait adressée.
          message: `${message}\n\nVous recevez ce message en tant que parent, pour information.`,
          ctaLabel,
          ctaUrl: ctaUrl || `${URL_ESPACE}/connexion/parent`,
          tag: `publication-${ressourceType}-parent`,
        });
        ok++;
      } catch (e) {
        console.warn("[emailPublication] échec parent", p.email, ":", e.message);
      }
    }

    console.log(`[emailPublication] ${ressourceType} ${ressourceId} - ${ok} email(s) envoyé(s)`);
    return { envoye: true, apprenants: apprenants.length, parents: listeParents.length, reussis: ok };
  } catch (e) {
    console.error("[emailPublication]", e.message);
    return { envoye: false, raison: e.message };
  }
}
