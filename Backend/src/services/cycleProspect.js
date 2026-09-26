import supabase from "../config/supabase.js";

/**
 * LE CYCLE DE VIE DU PROSPECT, SANS UN SEUL CLIC.
 *
 * POURQUOI CE SERVICE EXISTE. Les huit KPI de conversion du référentiel supposent qu'un
 * dossier traverse des étapes. La première version demandait à la commerciale de les
 * marquer à la main : trois clics par dossier, que personne n'aurait faits au bout d'une
 * semaine — et un indicateur qu'on ne remplit pas vaut moins que pas d'indicateur du tout.
 *
 * Les transitions sont donc DÉDUITES de gestes qui existent déjà :
 *
 *   · PRISE EN CHARGE  ← la commerciale ouvre le dossier
 *   · CONVERTI         ← un versement est reçu, ou le dossier part chez l'Onboarding / le PA
 *   · INSCRIPTION MANUELLE → les deux d'un coup : on ne saisit pas à la main quelqu'un
 *     à qui l'on n'a pas parlé, et s'il est saisi, c'est qu'il est acquis.
 *
 * CE QUI N'EST PAS AUTOMATISABLE, et que j'assume plutôt que de simuler :
 *
 *   · LA QUALIFICATION est un jugement — « son projet est sérieux, le budget tient ».
 *     Aucun système ne le déduit d'une ouverture d'écran. `COM-02` (taux de qualification)
 *     a donc été RETIRÉ du cockpit : calculé sans ce jugement, il vaudrait mécaniquement
 *     le taux de prise en charge et ne dirait rien.
 *
 *   · LA PERTE n'est pas un geste : un prospect qui ne donne plus signe de vie ne clique
 *     sur rien. Elle est DÉDUITE À LA LECTURE (voir `kpi.js`) après un délai d'inactivité,
 *     sans jamais être écrite en base — un dossier dormant qui rappelle redevient vivant
 *     tout seul, ce qu'un statut figé en base empêcherait.
 *
 * AUCUNE DE CES FONCTIONS NE LÈVE. Elles accompagnent un paiement, une transmission, une
 * ouverture d'écran : faire échouer l'un de ces actes parce qu'un horodatage de mesure
 * n'est pas passé serait disproportionné.
 */

/** Les dossiers repris en masse n'ont jamais été travaillés : ils restent hors du cycle. */
const SOURCE_IMPORT = "import_masse_onboarding";

/**
 * Le dossier vient d'être pris en charge par quelqu'un.
 *
 * N'écrit QUE si la date est vide : c'est le PREMIER contact qui porte la cible des deux
 * heures. La réécrire à chaque ouverture ferait mesurer le dernier passage, et le délai
 * vaudrait toujours zéro.
 */
export async function marquerPriseEnCharge(assignationId) {
  if (!assignationId) return;
  try {
    const { data } = await supabase
      .from("assignations_parcours")
      .select("id, source, premier_contact_at, cycle_statut")
      .eq("id", assignationId)
      .maybeSingle();
    if (!data || data.source === SOURCE_IMPORT || data.premier_contact_at) return;

    await supabase.from("assignations_parcours").update({
      premier_contact_at: new Date().toISOString(),
    }).eq("id", assignationId);
  } catch { /* la mesure ne doit jamais gêner l'écran qui l'a déclenchée */ }
}

/**
 * Le dossier est acquis : un versement est arrivé, ou il part en production.
 *
 * `converti_at` n'est posé qu'une fois : un second versement sur le même dossier ne doit
 * pas repousser la date de conversion, sinon le délai de closing s'allongerait à chaque
 * échéance payée.
 */
export async function marquerConverti(assignationId, quand = null) {
  if (!assignationId) return;
  try {
    const { data } = await supabase
      .from("assignations_parcours")
      .select("id, source, cycle_statut, converti_at, premier_contact_at")
      .eq("id", assignationId)
      .maybeSingle();
    if (!data || data.source === SOURCE_IMPORT || data.converti_at) return;

    const date = quand || new Date().toISOString();
    await supabase.from("assignations_parcours").update({
      cycle_statut: "converti",
      converti_at:  date,
      // Un dossier converti sans prise en charge tracée est un dossier acquis d'emblée
      // (inscription au comptoir, paiement en ligne immédiat) : le contact a bien eu
      // lieu, au plus tard à cet instant. Sans ce repli, le délai de closing serait
      // incalculable sur ces dossiers — les plus rapides, donc les plus intéressants.
      ...(data.premier_contact_at ? {} : { premier_contact_at: date }),
    }).eq("id", assignationId);
  } catch { /* idem */ }
}

/**
 * Les valeurs de cycle à poser DÈS LA CRÉATION, selon la provenance du dossier.
 *
 * Une inscription saisie à la main par une commerciale est, par construction, un prospect
 * contacté et acquis : elle a la personne devant elle ou au téléphone. Lui demander de le
 * confirmer ensuite d'un clic serait lui faire ressaisir ce qu'elle vient de faire.
 *
 * Un dossier venu du site public sans paiement reste « nouveau » : personne ne l'a encore
 * regardé, et c'est précisément le délai que `COM-03` doit mesurer.
 *
 * @returns {object} les champs à fusionner dans le payload d'insertion
 */
export function cycleALaCreation(source) {
  const maintenant = new Date().toISOString();
  if (source === SOURCE_IMPORT) {
    return { cycle_statut: "converti", converti_at: maintenant };
  }
  if (source === "inscription_directe" || source === "site_public_paiement") {
    return { cycle_statut: "converti", converti_at: maintenant, premier_contact_at: maintenant };
  }
  return { cycle_statut: "nouveau" };
}
