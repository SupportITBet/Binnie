import supabase from "../config/supabase.js";

/**
 * Qui a le droit de lire les données d'un apprenant.
 *
 * POURQUOI CE FICHIER EXISTE. Plusieurs routes prenaient l'adresse e-mail de l'apprenant
 * EN PARAMÈTRE D'URL et répondaient sans vérifier quoi que ce soit : connaître l'e-mail de
 * quelqu'un suffisait à lire ses présences, ses séances, ses ressources et son planning.
 * Le paramètre reste - le dashboard parent en a besoin pour consulter son enfant, dont
 * l'identifiant n'est pas le sien - mais il est désormais confronté à l'identité réelle du
 * demandeur.
 *
 * Trois titres à lire, et rien d'autre :
 *   1. l'apprenant lui-même ;
 *   2. un membre du personnel BET, dans l'exercice de son métier ;
 *   3. un parent, pour ses propres enfants - le lien est vérifié en base, pas déclaré.
 */

/**
 * Les rôles du personnel BET. Volontairement énumérés plutôt que déduits d'une négation :
 * un rôle ajouté demain ne doit pas hériter d'un accès par accident.
 */
const ROLES_PERSONNEL = new Set([
  "super_admin", "admin", "manager", "responsable", "gestionnaire",
  "commercial", "onboarding", "customer_care", "assistant_sav",
  "coach", "pedagogical_advisor", "superviseur", "deputy_superviseur",
  "data_collector", "placement_test", "rh", "rh_paie", "comptable",
  "marketing", "admin_elearning", "assistant_elearning",
  // Rôles e-learning équivalents
  "admin_manager", "admin_superviseur", "admin_deputy_superviseur", "admin_placement",
  "admin_onboarding", "admin_customer_care", "admin_pa_advisor", "admin_rh_paie",
  "admin_comptable", "admin_commercial",
  "professeur_titulaire", "professeur_remplacant",
]);

export const estPersonnel = (user) => ROLES_PERSONNEL.has(user?.app_metadata?.role);

const memeEmail = (a, b) =>
  !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * Les e-mails des enfants d'un parent, tels qu'ils apparaissent sur les rattachements.
 *
 * Le lien parent → enfant vit dans `assignations_parcours` : c'est le parent qui remplit le
 * formulaire, donc `email_parent` et `telephone_parent` portent SES coordonnées, tandis que
 * l'enfant a le plus souvent un identifiant technique généré. On part donc du parent pour
 * retrouver les dossiers, puis des dossiers pour retrouver les identifiants des enfants.
 */
async function emailsDesEnfants(user) {
  const email = user?.email || null;
  const tel = user?.user_metadata?.telephone || user?.phone || null;
  if (!email && !tel) return [];

  const ou = [];
  if (email) ou.push(`email_parent.ilike.${email}`, `prospect_email.ilike.${email}`);
  if (tel) {
    // Les huit derniers chiffres : les formats saisis varient (+225, 00225, espaces…),
    // comparer les chaînes entières manquerait le rapprochement une fois sur deux.
    const chiffres = String(tel).replace(/\D/g, "").slice(-8);
    if (chiffres.length === 8) ou.push(`telephone_parent.ilike.%${chiffres}%`);
  }
  if (!ou.length) return [];

  const { data: dossiers } = await supabase
    .from("assignations_parcours")
    .select("id, prospect_email, email_enfant")
    .eq("profil_type", "enfant")
    .or(ou.join(","));
  if (!dossiers?.length) return [];

  const emails = new Set();
  dossiers.forEach((d) => {
    if (d.prospect_email) emails.add(d.prospect_email.toLowerCase());
    if (d.email_enfant) emails.add(d.email_enfant.toLowerCase());
  });

  /* Les rattachements portent parfois un identifiant technique (`tel.…@betacademy.app`)
     absent du dossier : on les résout par `note.assignation_id`, le lien fiable posé à la
     création de la classe. Sans cela, un parent perdait l'accès aux ressources de son
     enfant dès que celui-ci n'avait pas d'adresse propre. */
  const { data: rattachements } = await supabase
    .from("groupes_apprenants")
    .select("email_apprenant, note")
    .or(dossiers.map((d) => `note.ilike.%${d.id}%`).join(","));
  (rattachements || []).forEach((r) => {
    if (r.email_apprenant) emails.add(r.email_apprenant.toLowerCase());
  });

  return [...emails];
}

/**
 * Le demandeur peut-il lire les données de l'apprenant identifié par `emailCible` ?
 *
 * @param {object} user        `req.user`, issu du jeton - jamais du corps de la requête
 * @param {string} emailCible
 * @returns {Promise<boolean>}
 */
export async function peutLireApprenant(user, emailCible) {
  if (!user) return false;
  // Sans cible explicite, la route lira l'utilisateur lui-même : rien à autoriser.
  if (!emailCible) return true;
  if (memeEmail(user.email, emailCible)) return true;
  if (estPersonnel(user)) return true;

  const role = user?.app_metadata?.role;
  if (role === "parent" || role === "admin_parent") {
    const enfants = await emailsDesEnfants(user);
    return enfants.some((e) => memeEmail(e, emailCible));
  }
  return false;
}

/**
 * L'e-mail que la route doit servir : celui demandé s'il est autorisé, sinon celui du
 * demandeur. Répond `null` quand l'accès est refusé, pour que la route rende un 403.
 */
export async function emailAutorise(user, emailDemande) {
  if (!emailDemande) return user?.email || null;
  return (await peutLireApprenant(user, emailDemande)) ? emailDemande : null;
}

/**
 * Le rattachement `groupes_apprenants` appartient-il au demandeur (ou à son enfant) ?
 * Utilisé par les routes qui prennent un `ga_id` plutôt qu'un e-mail.
 */
export async function peutLireRattachement(user, gaId) {
  if (!user || !gaId) return false;
  if (estPersonnel(user)) return true;

  const { data: ga } = await supabase
    .from("groupes_apprenants")
    .select("apprenant_id, email_apprenant")
    .eq("id", gaId)
    .maybeSingle();
  if (!ga) return false;
  if (ga.apprenant_id && ga.apprenant_id === user.id) return true;
  return peutLireApprenant(user, ga.email_apprenant);
}

/** Les classes du demandeur - pour borner ce qu'une route lui renvoie. */
export async function groupesDeLUtilisateur(user) {
  if (!user) return [];
  const [parId, parEmail] = await Promise.all([
    supabase.from("groupes_apprenants").select("groupe_id").eq("apprenant_id", user.id),
    user.email
      ? supabase.from("groupes_apprenants").select("groupe_id").ilike("email_apprenant", user.email)
      : Promise.resolve({ data: [] }),
  ]);
  return [...new Set([...(parId.data || []), ...(parEmail.data || [])]
    .map((r) => r.groupe_id).filter(Boolean))];
}
