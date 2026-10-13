import supabase from "../config/supabase.js";

/**
 * Lecture séquentielle des contenus — portail bet-elearning.
 *
 * Un contenu marqué `lecture_sequentielle` doit être terminé avant que ceux publiés APRÈS
 * lui ne s'ouvrent. Lui-même reste accessible : s'il se bloquait lui-même, le premier
 * contenu séquentiel d'une classe serait inatteignable et le verrou définitif.
 *
 * ── POURQUOI UN MODULE SÉPARÉ DE `lectureSequentielle.js` ──
 * Le service de dash fait exactement le même calcul, mais sur d'autres tables :
 * `modules_elearning` / `groupe_ids` / `groupes_apprenants`, là où le portail e-learning
 * a `contenus_classes_elearning` / `classe_ids` / `classes_elearning_apprenants`. Un
 * apprenant e-learning n'a aucune ligne dans `groupes_apprenants` : appelé sur lui, le
 * service de dash ne trouvait aucun rattachement et répondait « accessible » pour tout —
 * le verrou n'existait donc pas, silencieusement.
 *
 * Les deux modules partagent en revanche la table `contenus_lus`, qui est la vérité sur
 * ce qui a été lu, quelle que soit la plateforme.
 *
 * ── CE QUI DIFFÈRE DE DASH, ET POURQUOI ──
 * `classes_elearning_apprenants` porte `date_inscription` mais AUCUNE date de sortie, et
 * aucune notion de périodes de présence multiples. La fenêtre est donc simplement « depuis
 * son inscription » : il n'y a ni « publié après votre départ » ni « publié pendant votre
 * absence » à distinguer ici. Inventer ces états sur des colonnes qui n'existent pas aurait
 * produit des cadenas qu'aucune donnée ne justifie.
 *
 * ── L'ORDRE EST CELUI DE LA PUBLICATION (`created_at`) ──
 * La colonne `ordre` existe mais vaut 1 partout : elle n'est pas renseignée par les écrans,
 * s'y fier donnerait une séquence arbitraire.
 *
 * ── LA SÉQUENCE EST PAR CLASSE ──
 * Deux classes partagent des contenus sans partager leur rythme : un apprenant de A ne doit
 * jamais être retenu par un contenu publié vers B, qu'il ne voit même pas.
 */

/** Les trois motifs de fermeture. Un cadenas sans raison est incompréhensible. */
export const MOTIF_EL = {
  AVANT_ARRIVEE: "avant_arrivee",
  SEQUENCE:      "sequence",
};

/** Une colonne absente ne doit pas casser la lecture : la migration n'est peut-être pas jouée. */
const colonneAbsente = (e) =>
  !!e && (e.code === "42703" || /lecture_sequentielle/.test(e.message || ""));

/**
 * Le jour d'une date, en nombre. On compare À LA JOURNÉE et non à la seconde : un apprenant
 * inscrit à 14 h ne doit pas perdre le cours publié à 9 h le même jour.
 */
const jour = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};

/** Les classes d'un apprenant, par identifiant OU par e-mail — les deux coexistent en base. */
export async function classesDeLApprenantEl(user) {
  const CHAMPS = "classe_id, date_inscription, date_ajout, statut";
  const [parId, parEmail] = await Promise.all([
    /* Sans identifiant, on n'interroge pas cet axe : `apprenant_id=eq.null` ne filtre pas
       « les lignes sans compte », il échoue. Le parent qui consulte son enfant par e-mail
       passe par le second axe. */
    user.id
      ? supabase.from("classes_elearning_apprenants").select(CHAMPS).eq("apprenant_id", user.id)
      : Promise.resolve({ data: [] }),
    user.email
      ? supabase.from("classes_elearning_apprenants").select(CHAMPS).ilike("email", user.email)
      : Promise.resolve({ data: [] }),
  ]);
  /* L'identifiant PRIME sur l'e-mail : si la même classe apparaît des deux côtés, on garde
     la ligne liée au compte, la seule dont les dates soient tenues à jour par les écrans de
     gestion. Un apprenant importé puis inscrit en ligne a bien les deux. */
  const vus = new Map();
  for (const r of parId.data || []) if (r?.classe_id) vus.set(r.classe_id, r);
  for (const r of parEmail.data || []) if (r?.classe_id && !vus.has(r.classe_id)) vus.set(r.classe_id, r);
  /* Un apprenant RETIRÉ n'a plus de parcours en cours : ses anciens contenus restent
     consultables, mais sa classe ne doit plus poser de verrou. */
  return [...vus.values()].filter(r => r.statut !== "retire");
}

/**
 * Le calcul pur, sans accès à la base — pour que les appelants qui ont déjà la liste des
 * lectures n'aient pas à la redemander.
 *
 * @param {object[]} rattachements [{ classe_id, date_inscription, date_ajout }]
 * @param {object[]} contenus      [{ id, titre, classe_ids, created_at, lecture_sequentielle }]
 * @param {Set<string>} estLu      les contenu_id déjà terminés
 * @returns {Record<string, { verrouille, motif, bloque_par }>}
 */
export function verrousDepuisEl(rattachements, contenus, estLu) {
  const etat = {};
  (contenus || []).forEach(c => { etat[c.id] = { verrouille: false, motif: null, bloque_par: null }; });
  if (!rattachements?.length || !contenus?.length) return etat;

  /* Un contenu peut relever de plusieurs classes de l'apprenant. On le déclare accessible
     s'il l'est dans AU MOINS UNE d'elles : « lu » est attaché au contenu et non à la
     classe, donc être ouvert dans B signifie que les prérequis de B sont réellement
     terminés. Exiger le déblocage dans TOUTES ses classes créerait des blocages croisés
     qu'il ne pourrait pas résoudre — deux classes se retenant mutuellement. */
  const accessibleQuelquePart = new Set();
  const motifParContenu = {};
  const concerne = new Set();

  const poserMotif = (id, motif, bloqueur) => {
    if (motifParContenu[id]) return;
    motifParContenu[id] = { motif, bloque_par: bloqueur || null };
  };

  for (const ratt of rattachements) {
    const gid = ratt.classe_id;
    const arrivee = jour(ratt.date_inscription || ratt.date_ajout);

    const aSoi = (contenus || []).filter(c => (c.classe_ids || []).includes(gid));
    aSoi.forEach(c => concerne.add(c.id));

    /* LA SÉQUENCE NE PORTE QUE SUR CE QUI A ÉTÉ PUBLIÉ APRÈS SON ARRIVÉE. Un contenu
       antérieur ne doit pas le retenir : il reste consultable, mais l'exiger comme
       prérequis poserait un verrou qu'il n'a pas eu l'occasion de lever. */
    const dedans = [];
    for (const c of aSoi) {
      const pub = jour(c.created_at);
      if (arrivee !== null && pub !== null && pub < arrivee) poserMotif(c.id, MOTIF_EL.AVANT_ARRIVEE, null);
      else dedans.push(c);
    }
    dedans.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    // Le premier contenu séquentiel non terminé ferme tout ce qui le suit DANS CETTE classe.
    let bloqueur = null;
    for (const c of dedans) {
      if (bloqueur === null) {
        accessibleQuelquePart.add(c.id);
        if (c.lecture_sequentielle && !estLu.has(c.id)) bloqueur = c;
      } else {
        poserMotif(c.id, MOTIF_EL.SEQUENCE, { id: bloqueur.id, titre: bloqueur.titre || "le cours précédent" });
      }
    }
  }

  for (const c of contenus) {
    /* Un contenu qui ne touche AUCUNE de ses classes est hors séquence, pas verrouillé :
       il n'appartient à aucun parcours le concernant, et le déclarer fermé ferait
       apparaître un cadenas sur un cours qu'il n'aurait de toute façon jamais vu. */
    if (!concerne.has(c.id) || accessibleQuelquePart.has(c.id)) {
      etat[c.id] = { verrouille: false, motif: null, bloque_par: null };
      continue;
    }
    const m = motifParContenu[c.id] || { motif: MOTIF_EL.SEQUENCE, bloque_par: null };
    /* « Publié avant votre arrivée » ne VERROUILLE pas : le contenu reste lisible, c'est
       seulement un prérequis qu'on ne lui oppose pas. Le marquer fermé lui retirerait des
       cours auxquels il a droit. */
    if (m.motif === MOTIF_EL.AVANT_ARRIVEE) {
      etat[c.id] = { verrouille: false, motif: MOTIF_EL.AVANT_ARRIVEE, bloque_par: null };
      continue;
    }
    etat[c.id] = { verrouille: true, motif: m.motif, bloque_par: m.bloque_par };
  }
  return etat;
}

/**
 * Les contenus publiés qui concernent cet apprenant, annotés de leur état de verrou.
 *
 * Ce calcul vit ici et non dans la route : celle qui SERT les contenus et celle qui
 * enregistre « terminé » doivent répondre exactement la même chose. Deux implémentations
 * auraient fini par diverger, et un contenu aurait pu être marqué lu tout en restant
 * affiché comme verrouillé.
 */
export async function contenusAnnotesEl(user) {
  const rattachements = await classesDeLApprenantEl(user);
  if (!rattachements.length) return { contenus: [], rattachements: [] };

  const classeIds = rattachements.map(r => r.classe_id);
  const champs = "id, titre, categorie, type_contenu, semaine, blocs, objectifs, duree_estimee, ordre, classe_id, classe_ids, created_at, updated_at, lecture_sequentielle";

  const lire = (sel) => supabase
    .from("contenus_classes_elearning").select(sel)
    .overlaps("classe_ids", classeIds).eq("est_visible", true)
    .order("created_at", { ascending: true });

  let { data: contenus, error } = await lire(champs);
  /* La migration n'est peut-être pas jouée : on rejoue sans la colonne plutôt que de
     priver l'apprenant de tous ses cours pour une fonctionnalité facultative. */
  if (colonneAbsente(error)) {
    ({ data: contenus, error } = await lire(champs.replace(", lecture_sequentielle", "")));
    if (!error) (contenus || []).forEach(c => { c.lecture_sequentielle = false; });
  }
  if (error) throw error;

  const { data: lus } = await supabase
    .from("contenus_lus").select("contenu_id, lu_le").eq("apprenant_id", user.id);
  const estLu = new Set((lus || []).map(l => l.contenu_id));
  const luLe = Object.fromEntries((lus || []).map(l => [l.contenu_id, l.lu_le]));

  const verrous = verrousDepuisEl(rattachements, contenus || [], estLu);
  return {
    rattachements,
    contenus: (contenus || []).map(c => ({
      ...c,
      lu:         estLu.has(c.id),
      lu_le:      luLe[c.id] || null,
      verrouille: verrous[c.id]?.verrouille || false,
      motif:      verrous[c.id]?.motif || null,
      bloque_par: verrous[c.id]?.bloque_par || null,
    })),
  };
}

/**
 * Ce contenu est-il accessible à cet apprenant ?
 *
 * Vérifié CÔTÉ SERVEUR et pas seulement dans l'interface : sans ce contrôle, appeler la
 * route dans l'ordre inverse déverrouillerait toute la suite sans avoir rien lu.
 */
export async function contexteMarquageEl(user, contenuId) {
  const { contenus } = await contenusAnnotesEl(user);
  const c = (contenus || []).find(x => x.id === contenuId);
  /* Contenu inconnu de ses classes : on laisse passer. Ce n'est pas un trou de sécurité —
     l'écriture reste tracée et nominative — et refuser bloquerait un apprenant dont le
     rattachement vient de changer, pour un gain nul. */
  if (!c) return { accessible: true, dejaLu: false, motif: null, bloque_par: null };
  return {
    accessible: !c.verrouille,
    dejaLu:     c.lu,
    motif:      c.motif,
    bloque_par: c.bloque_par,
  };
}
