import supabase from "../config/supabase.js";

/**
 * Le minuteur de composition d'un devoir à rendre en texte.
 *
 * Le chrono démarre à la PREMIÈRE OUVERTURE du devoir par l'apprenant et court
 * `duree_min` minutes. Passé ce délai, la copie est close : plus rien ne peut être
 * déposé, et ce qui a été écrit part au coach en l'état.
 *
 * ── POURQUOI CE CALCUL VIT ICI ──
 * Trois endroits en dépendent : la route qui ouvre le devoir, celle qui reçoit le rendu,
 * et le balayage qui clôture les copies abandonnées. S'ils calculaient chacun leur
 * échéance, ils finiraient par ne plus répondre la même chose — et un apprenant pourrait
 * se voir refuser un dépôt que l'écran croyait encore ouvert.
 *
 * ── DEUX GARDE-FOUS PLUTÔT QU'UN ──
 * Le navigateur envoie la copie quand le compteur tombe à zéro ; c'est le cas normal et
 * c'est lui qui donne une expérience correcte. Mais il ne couvre pas l'onglet fermé, le
 * réseau coupé, la batterie vide — la copie resterait « commencée, jamais rendue ».
 * Le serveur refuse donc tout dépôt tardif, et un balayage périodique clôture ce que
 * personne n'est venu rendre. L'un sans l'autre laisse des copies en suspens.
 */

/**
 * Ce devoir est-il chronométré ? Seuls les rendus en TEXTE le sont — un fichier se prépare
 * hors ligne, un chrono n'y aurait pas le même sens.
 *
 * `duree_min` côté e-learning, `duree_composition_min` côté dash : la seconde existe parce
 * que `evaluations_groupes.duree_min` y porte déjà un autre sens (la durée ANNONCÉE de
 * l'épreuve, à 60 par défaut sur toutes les lignes). La confondre avec le minuteur aurait
 * chronométré d'un coup toutes les évaluations déjà publiées.
 */
/* La migration du minuteur est livrée à part. Tant qu'elle n'est pas jouée, `commence_at`
   n'existe pas : le balayage doit se taire plutôt que de signaler une panne toutes les
   cinq minutes — ce n'en est pas une, la fonctionnalité n'est simplement pas installée. */
const colonneAbsente = (e) =>
  !!e && (e.code === "42703" || /commence_at|duree_composition_min/.test(e.message || ""));

export const dureeComposition = (d) =>
  Number(d?.duree_composition_min ?? d?.duree_min) || 0;

export function estChronometre(devoir) {
  return !!devoir
    && dureeComposition(devoir) > 0
    && devoir.type_rendu === "texte";
}

/**
 * L'échéance de composition d'une copie, ou `null` si elle n'est pas chronométrée.
 *
 * @param {object} devoir  { duree_min, type_rendu }
 * @param {string|Date} commenceAt
 * @returns {Date|null}
 */
export function echeanceComposition(devoir, commenceAt) {
  if (!estChronometre(devoir) || !commenceAt) return null;
  const debut = new Date(commenceAt);
  if (Number.isNaN(debut.getTime())) return null;
  return new Date(debut.getTime() + dureeComposition(devoir) * 60_000);
}

/** Le temps de composition est-il écoulé ? Faux si le devoir n'est pas chronométré. */
export function compositionExpiree(devoir, commenceAt, maintenant = new Date()) {
  const fin = echeanceComposition(devoir, commenceAt);
  return !!fin && maintenant >= fin;
}

/**
 * Enregistre l'ouverture du devoir par un apprenant, et rend son échéance.
 *
 * IDEMPOTENT : la seconde ouverture ne redémarre pas le chrono. C'est tout l'enjeu —
 * sans cela, refermer puis rouvrir l'onglet rendrait le minuteur sans effet.
 *
 * @returns {{ commence_at: string|null, echeance: string|null, expire: boolean }}
 */
export async function demarrerComposition(devoir, inscriptionId, classeId) {
  if (!estChronometre(devoir)) return { commence_at: null, echeance: null, expire: false };

  const { data: existant } = await supabase
    .from("devoirs_rendus_elearning")
    .select("id, commence_at, statut")
    .eq("devoir_id", devoir.id)
    .eq("inscription_id", inscriptionId)
    .maybeSingle();

  /* Une copie déjà rendue ou corrigée ne rouvre aucun chrono : on rend son échéance
     d'origine pour que l'écran affiche l'histoire telle qu'elle s'est passée. */
  if (existant?.commence_at) {
    const fin = echeanceComposition(devoir, existant.commence_at);
    return {
      commence_at: existant.commence_at,
      echeance: fin ? fin.toISOString() : null,
      expire: compositionExpiree(devoir, existant.commence_at),
    };
  }

  const maintenant = new Date().toISOString();
  /* `upsert` et non `insert` : la ligne peut déjà exister sans `commence_at` (une note 0
     posée d'avance, un brouillon). On ne veut pas la dupliquer ni la remplacer. */
  const { error } = await supabase
    .from("devoirs_rendus_elearning")
    .upsert({
      devoir_id:       devoir.id,
      inscription_id:  inscriptionId,
      classe_id:       classeId || devoir.classe_id,
      type_soumission: "texte",
      statut:          existant?.statut || "en_cours",
      commence_at:     maintenant,
    }, { onConflict: "devoir_id,inscription_id" });
  if (error) throw error;

  const fin = echeanceComposition(devoir, maintenant);
  return { commence_at: maintenant, echeance: fin ? fin.toISOString() : null, expire: false };
}

/**
 * Clôture les compositions dont le chrono est écoulé et que personne n'a rendues.
 *
 * C'est le filet du second garde-fou : l'apprenant a fermé l'onglet, perdu le réseau, ou
 * simplement abandonné. Sa copie part au coach EN L'ÉTAT — ce qu'il a écrit est conservé,
 * le reste vaut zéro, et c'est le coach qui tranche la note finale, exactement comme pour
 * un devoir non rendu à la date limite.
 *
 * On ne touche QUE les copies encore `en_cours` : une copie rendue ou corrigée n'a plus
 * rien à voir avec le minuteur.
 */
/**
 * Même balayage pour les évaluations du présentiel (dash).
 *
 * Deux jeux de tables, un seul calcul : `compositionExpiree` tranche dans les deux cas.
 * Les dupliquer aurait fait diverger les règles — et un apprenant aurait pu voir sa copie
 * close d'un côté et pas de l'autre.
 */
export async function cloturerCompositionsExpireesDash() {
  const { data: enCours, error } = await supabase
    .from("resultats_evaluations_groupes")
    .select("id, evaluation_id, commence_at, statut")
    .not("commence_at", "is", null)
    .eq("statut", "en_cours");
  if (error) {
    if (!colonneAbsente(error)) console.error("[minuteurDevoir dash] lecture:", error.message);
    return 0;   // migration non jouée : rien à balayer, et rien d'anormal à signaler
  }
  if (!enCours?.length) return 0;

  const ids = [...new Set(enCours.map(r => r.evaluation_id))];
  const { data: evals } = await supabase
    .from("evaluations_groupes").select("id, duree_composition_min, type_rendu, titre").in("id", ids);
  const parId = Object.fromEntries((evals || []).map(e => [e.id, e]));

  const aClore = enCours.filter(r => compositionExpiree(parId[r.evaluation_id], r.commence_at));
  if (!aClore.length) return 0;

  const maintenant = new Date().toISOString();
  for (const r of aClore) {
    // `rendu_at` renseigné : la copie A ÉTÉ remise, même si c'est le temps qui l'a remise.
    // Sans cela elle serait comptée « non rendue » et n'entrerait pas dans la file de
    // correction du coach, alors qu'il y a quelque chose à corriger.
    const { error: e } = await supabase
      .from("resultats_evaluations_groupes")
      .update({ statut: "rendu", rendu_at: maintenant })
      .eq("id", r.id);
    if (e) console.error(`[minuteurDevoir dash] clôture ${r.id}:`, e.message);
  }
  console.log(`[minuteurDevoir dash] ${aClore.length} composition(s) close(s) par expiration.`);
  return aClore.length;
}

export async function cloturerCompositionsExpirees() {
  const { data: enCours, error } = await supabase
    .from("devoirs_rendus_elearning")
    .select("id, devoir_id, commence_at, statut, contenu_texte")
    .not("commence_at", "is", null)
    .eq("statut", "en_cours");
  if (error) {
    if (!colonneAbsente(error)) console.error("[minuteurDevoir] lecture:", error.message);
    return 0;   // migration non jouée : rien à balayer, et rien d'anormal à signaler
  }
  if (!enCours?.length) return 0;

  const ids = [...new Set(enCours.map(r => r.devoir_id))];
  const { data: devoirs } = await supabase
    .from("devoirs_elearning").select("id, duree_min, type_rendu, titre").in("id", ids);
  const parId = Object.fromEntries((devoirs || []).map(d => [d.id, d]));

  const aClore = enCours.filter(r => compositionExpiree(parId[r.devoir_id], r.commence_at));
  if (!aClore.length) return 0;

  const maintenant = new Date().toISOString();
  for (const r of aClore) {
    /* `rendu_at` est renseigné : la copie A ÉTÉ remise, même si c'est le temps qui l'a
       remise. Sans cela elle serait comptée comme « non rendue » et le coach ne la
       verrait pas dans sa file de correction — or il y a quelque chose à corriger. */
    const { error: e } = await supabase
      .from("devoirs_rendus_elearning")
      .update({
        statut:  "rendu",
        rendu_at: maintenant,
        commentaire_coach: null,
      })
      .eq("id", r.id);
    if (e) console.error(`[minuteurDevoir] clôture ${r.id}:`, e.message);
  }
  console.log(`[minuteurDevoir] ${aClore.length} composition(s) close(s) par expiration du minuteur.`);
  return aClore.length;
}
