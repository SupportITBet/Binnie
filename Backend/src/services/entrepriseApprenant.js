import supabase from "../config/supabase.js";

/**
 * L'ENTREPRISE D'UN APPRENANT E-LEARNING ET SON RÉFÉRENT RH.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * LE LIEN PASSE PAR LA CLASSE, PAS PAR L'APPRENANT. `utilisateurs.entreprise_id` existe mais
 * n'est renseigné sur AUCUN apprenant (vérifié le 16/10/2026 : zéro ligne) ; c'est
 * `classes_elearning.entreprise_id` qui porte le rattachement réel. Lire l'apprenant aurait
 * rendu `null` pour tout le monde.
 *
 * UNE CLASSE SANS ENTREPRISE EST NORMALE — ce sont les classes « particuliers ». La fonction
 * rend `null`, et l'écran appelant n'affiche simplement pas le bloc.
 *
 * LE CONTRAT N'EN SORT PAS : montant, nombre de licences et dates d'échéance regardent
 * l'entreprise, pas l'apprenant. Il lui faut un nom et un moyen de joindre quelqu'un.
 *
 * Extrait de `routes/apprenants.js` où il était écrit en ligne, pour que `/mon-espace/profil`
 * s'en serve aussi : deux copies auraient fini par ne plus dire la même chose.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */
export async function entrepriseDeLaClasse(classeId) {
  if (!classeId) return null;

  const { data: classe } = await supabase
    .from("classes_elearning")
    .select("entreprise_id")
    .eq("id", classeId)
    .maybeSingle();
  if (!classe?.entreprise_id) return null;

  return entrepriseParId(classe.entreprise_id);
}

/** La même fiche, quand on connaît déjà l'identifiant de l'entreprise. */
export async function entrepriseParId(entrepriseId) {
  if (!entrepriseId) return null;

  const { data: ent } = await supabase
    .from("comptes_entreprises")
    .select("id, nom, logo_url, couleur, initiales, secteur, ville, referent_rh_nom, referent_rh_email, referent_rh_telephone")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (!ent) return null;

  /* Le compte RH porte le nom COMPLET (prénom + nom), là où `referent_rh_nom` ne garde
     souvent que le nom de famille — « Sy » au lieu de « Savane Sy ». On préfère donc le
     compte quand il existe, et on retombe sur la fiche entreprise sinon : toutes les
     entreprises n'ont pas de compte RH ouvert. */
  const { data: comptesRh } = await supabase
    .from("utilisateurs")
    .select("nom, prenom, email, telephone")
    .eq("role", "client_entreprise")
    .eq("entreprise_id", ent.id)
    .eq("actif", true);

  const parEmail = (comptesRh || []).find(
    c => c.email && ent.referent_rh_email &&
         c.email.toLowerCase() === ent.referent_rh_email.toLowerCase());
  const compte = parEmail || (comptesRh || [])[0] || null;

  const nomRh = compte
    ? `${compte.prenom || ""} ${compte.nom || ""}`.trim()
    : (ent.referent_rh_nom || "").trim();

  return {
    id: ent.id,
    nom: ent.nom,
    logo_url: ent.logo_url || null,
    couleur: ent.couleur || null,
    initiales: ent.initiales || null,
    secteur: ent.secteur || null,
    ville: ent.ville || null,
    rh: (nomRh || ent.referent_rh_email || ent.referent_rh_telephone) ? {
      nom:       nomRh || null,
      email:     compte?.email || ent.referent_rh_email || null,
      telephone: compte?.telephone || ent.referent_rh_telephone || null,
    } : null,
  };
}
