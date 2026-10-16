import supabase from "../config/supabase.js";

/**
 * Les cours qu'un coach a rattachés à une session live.
 *
 * Une session porte `contenu_ids`, une simple liste d'identifiants de `modules_elearning`.
 * Trois écrans ont besoin d'en faire quelque chose de lisible — la session live de
 * l'apprenant, la fiche séance du parent, la carte du coach — et chacun le résolvait (ou
 * ne le résolvait pas) à sa façon : l'apprenant n'en voyait que le titre, le parent rien
 * du tout, et le coach avait l'état `sessionsDepliees` sans jamais l'afficher.
 *
 * ── CE QUE LE PARENT ET L'APPRENANT NE DOIVENT PAS VOIR ──
 * Un module `brouillon` reste invisible côté famille jusqu'à publication. Il était pourtant
 * annoncé comme « support de cours partagé » : le titre d'un contenu non publié partait à
 * l'apprenant (constaté sur « BET@ZXHZVW! », une session de la classe A1). Le coach, lui,
 * doit le voir — c'est précisément ce qu'il lui reste à faire.
 *
 * ── LES BLOCS NE SORTENT PAS D'ICI ──
 * On renvoie leur NOMBRE et leurs TYPES, pas leur contenu. Soixante sessions traînant
 * chacune ses vidéos et ses quiz pèseraient lourd sur une route appelée à l'ouverture d'un
 * espace, pour un contenu que l'écran possède déjà par ailleurs — l'apprenant l'a dans sa
 * liste de cours accessibles, le coach dans sa médiathèque.
 */

/** Le résumé d'un module, tel que les écrans le consomment. */
const resumer = (m) => ({
  id:            m.id,
  titre:         m.titre,
  cours_id:      m.cours_id,
  statut:        m.statut,
  type_contenu:  m.type_contenu || "lecon",
  duree_estimee: m.duree_estimee || null,
  nb_blocs:      (m.blocs || []).length,
  types_blocs:   [...new Set((m.blocs || []).map(b => b?.type).filter(Boolean))],
});

/**
 * Les modules désignés par ces identifiants, indexés par identifiant.
 *
 * @param {string[]} ids
 * @param {{ inclureBrouillons?: boolean }} options  `true` pour le personnel uniquement.
 * @returns {Promise<Record<string, object>>} les modules retenus, par identifiant.
 */
export async function modulesParId(ids, { inclureBrouillons = false } = {}) {
  const propres = [...new Set(ids || [])].filter(Boolean);
  if (!propres.length) return {};

  const { data, error } = await supabase
    .from("modules_elearning")
    .select("id, titre, cours_id, statut, type_contenu, duree_estimee, blocs")
    .in("id", propres);
  if (error) {
    /* Un cours illisible ne doit pas faire échouer la séance qui le porte : l'écran
       affichera la session sans son programme, ce qui reste exploitable. */
    console.error("[coursDeSession] lecture modules:", error.message);
    return {};
  }

  const out = {};
  for (const m of data || []) {
    if (!inclureBrouillons && m.statut !== "publie") continue;
    out[m.id] = resumer(m);
  }
  return out;
}

/**
 * Annote chaque session de ses cours rattachés.
 *
 * @param {object[]} sessions   lignes portant `contenu_ids`
 * @param {{ inclureBrouillons?: boolean }} options
 * @returns {Promise<object[]>} les mêmes lignes, enrichies de `contenu_modules` et
 *                              `contenu_titres` (dérivé de la même liste filtrée, pour
 *                              qu'un brouillon masqué ne reparaisse pas par cette porte).
 */
export async function annoterSessionsDeLeursCours(sessions, options = {}) {
  const parId = await modulesParId((sessions || []).flatMap(s => s.contenu_ids || []), options);
  return (sessions || []).map(s => {
    const modules = (s.contenu_ids || []).map(id => parId[id]).filter(Boolean);
    return { ...s, contenu_modules: modules, contenu_titres: modules.map(m => m.titre) };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════
   LE PENDANT BET E-LEARNING
   ═══════════════════════════════════════════════════════════════════════════════════════
   LES DEUX PLATEFORMES NE RANGENT PAS LEURS COURS AU MÊME ENDROIT. `modulesParId` ci-dessus
   lit `modules_elearning`, la table de dash. Les séances de bet-elearning désignent, elles,
   des lignes de `contenus_classes_elearning` — la Médiathèque du coach.

   Mesuré le 15/10/2026 sur les deux séances qui portent des `contenu_ids` : zéro
   correspondance dans `modules_elearning`, deux dans `contenus_classes_elearning`. Le
   résolveur de dash aurait donc TOUJOURS rendu une liste vide, en silence — ce qui explique
   que `contenu_modules` et `contenu_titres` soient restés des tableaux vides en dur dans
   `sessionsElearningDe` plutôt que d'être calculés.

   La règle du brouillon est la même des deux côtés : un contenu non publié n'est pas annoncé
   à la famille. Ici elle se lit sur `statut` ET sur `est_visible`, que l'écran du coach
   manipule pour retirer un cours sans le dépublier. */

/** Le résumé d'un contenu e-learning, dans la MÊME forme que celui de dash. */
const resumerElearning = (c) => ({
  id:            c.id,
  titre:         c.titre,
  cours_id:      c.classe_id || null,
  statut:        c.statut,
  type_contenu:  c.type_contenu || "lecon",
  duree_estimee: c.duree_estimee || null,
  nb_blocs:      (c.blocs || []).length,
  types_blocs:   [...new Set((c.blocs || []).map(b => b?.type).filter(Boolean))],
});

/** Les contenus e-learning désignés par ces identifiants, indexés par identifiant. */
export async function contenusElearningParId(ids, { inclureBrouillons = false } = {}) {
  const propres = [...new Set(ids || [])].filter(Boolean);
  if (!propres.length) return {};

  const { data, error } = await supabase
    .from("contenus_classes_elearning")
    .select("id, titre, classe_id, statut, est_visible, type_contenu, duree_estimee, blocs")
    .in("id", propres);
  if (error) {
    console.error("[coursDeSession] lecture contenus e-learning:", error.message);
    return {};
  }

  const out = {};
  for (const c of data || []) {
    if (!inclureBrouillons && (c.statut !== "publie" || c.est_visible === false)) continue;
    out[c.id] = resumerElearning(c);
  }
  return out;
}

/** `annoterSessionsDeLeursCours`, côté bet-elearning. */
export async function annoterSessionsElearning(sessions, options = {}) {
  const parId = await contenusElearningParId(
    (sessions || []).flatMap(s => s.contenu_ids || []), options);
  return (sessions || []).map(s => {
    const modules = (s.contenu_ids || []).map(id => parId[id]).filter(Boolean);
    return { ...s, contenu_modules: modules, contenu_titres: modules.map(m => m.titre) };
  });
}
