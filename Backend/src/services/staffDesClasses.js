import supabase from "../config/supabase.js";

/**
 * Qui suit les apprenants d'une classe - au-delà de qui l'a créée.
 *
 * Créer une classe et suivre un dossier sont deux choses différentes, et la confusion
 * coûtait cher : la publication d'un contenu ne prévenait que `groupes.created_by`, si
 * bien que l'assistante suivant six apprenants sur neuf ne recevait rien, tandis que
 * celle qui avait ouvert la classe des mois plus tôt était notifiée.
 *
 * L'assistante réelle se lit sur le dossier de chaque apprenant
 * (`assignations_parcours.assistantes`), rapproché par l'email. Le créateur du groupe
 * reste dans la liste - il a un intérêt légitime - mais il ne la constitue plus à lui seul.
 */

/** Le compte utilisateur d'une assistante, retrouvé par son email. */
export async function resolveAssistanteUserId(email) {
  if (!email) return null;
  const { data } = await supabase
    .from("utilisateurs").select("id").ilike("email", email).maybeSingle();
  return data?.id || null;
}

/**
 * Les identifiants du personnel à prévenir pour un lot de classes : l'assistante de
 * chaque apprenant, plus le créateur de chaque classe.
 *
 * @param {string[]} groupeIds
 * @returns {Promise<string[]>} identifiants utilisateur, dédoublonnés
 */
export async function staffDesClasses(groupeIds = []) {
  const ids = new Set();
  if (!groupeIds.length) return [];

  try {
    const { data: gas } = await supabase
      .from("groupes_apprenants")
      .select("email_apprenant")
      .in("groupe_id", groupeIds)
      .in("statut", ["actif", "periode_test"]);

    const emails = [...new Set((gas || []).map((g) => g.email_apprenant).filter(Boolean))];
    if (emails.length) {
      // Une seule requête pour tous les dossiers : la résolution une par une coûtait
      // autant d'allers-retours que d'apprenants.
      const { data: dossiers } = await supabase
        .from("assignations_parcours")
        .select("prospect_email, assistantes(email)")
        .in("prospect_email", emails);

      const emailsAssistantes = [...new Set(
        (dossiers || []).map((d) => d.assistantes?.email).filter(Boolean)
      )];
      for (const e of emailsAssistantes) {
        const uid = await resolveAssistanteUserId(e);
        if (uid) ids.add(uid);
      }
    }

    // L'onboarding en VUE GLOBALE suit l'ensemble des classes, pas seulement celles
    // qu'il a ouvertes ni les dossiers qu'il porte : c'est la raison d'être du drapeau
    // `onboarding_vue_globale`. Sans cet ajout, deux personnes chargées de tout superviser
    // ne recevaient que ce qui passait par elles.
    const { data: globaux } = await supabase
      .from("utilisateurs")
      .select("id")
      .eq("role", "onboarding")
      .eq("onboarding_vue_globale", true)
      .eq("actif", true);
    (globaux || []).forEach((u) => ids.add(u.id));

    // Le créateur du groupe, s'il fait partie du personnel commercial ou pédagogique.
    const { data: groupes } = await supabase
      .from("groupes").select("id, created_by").in("id", groupeIds);
    const createurs = [...new Set((groupes || []).map((g) => g.created_by).filter(Boolean))];
    if (createurs.length) {
      const { data: us } = await supabase
        .from("utilisateurs").select("id, role").in("id", createurs);
      (us || [])
        .filter((u) => ["commercial", "onboarding", "assistant_elearning", "customer_care"].includes(u.role))
        .forEach((u) => ids.add(u.id));
    }
  } catch (e) {
    console.warn("[staffDesClasses]", e.message);
  }

  return [...ids];
}
