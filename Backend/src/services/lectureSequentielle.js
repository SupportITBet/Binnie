import supabase from "../config/supabase.js";

/**
 * Lecture séquentielle des contenus e-learning.
 *
 * Un contenu marqué `lecture_sequentielle` doit être terminé avant que ceux publiés APRÈS
 * lui ne s'ouvrent. Lui-même reste accessible : s'il se bloquait lui-même, le premier
 * contenu séquentiel d'une classe serait inatteignable et le verrou définitif.
 *
 * LA SÉQUENCE EST PAR CLASSE. Deux classes partagent des modules sans partager leur
 * rythme : un apprenant de A ne doit jamais être retenu par un contenu publié vers B,
 * qu'il ne voit même pas.
 *
 * L'ORDRE EST CELUI DE LA PUBLICATION (`created_at`). La colonne `ordre` existe mais vaut
 * 1 partout - elle n'est pas renseignée, s'y fier donnerait une séquence arbitraire.
 *
 * Ce calcul vit ici et non dans une route : la route qui SERT les contenus et celle qui
 * enregistre « terminé » doivent répondre exactement la même chose. Deux implémentations
 * auraient fini par diverger, et un contenu aurait pu être marqué lu tout en restant
 * affiché comme verrouillé.
 */

/**
 * Contexte de verrou gardé en mémoire, par apprenant.
 *
 * Le contrôle coûtait deux vagues d'appels réseau - ses classes et ses lectures, puis les
 * modules - soit ~300 ms AVANT l'écriture, pour une action qui n'envoie qu'un booléen.
 * Or ces données ne bougent quasiment jamais pendant qu'on clique : les classes d'un
 * apprenant et la liste des contenus publiés changent à l'échelle du jour, pas de la
 * seconde.
 *
 * Ce qui bouge, c'est `estLu` - et on le met à jour ici même, sans aller le relire.
 *
 * CONSÉQUENCE ASSUMÉE : un contenu publié à l'instant, ou rendu obligatoire à l'instant,
 * met jusqu'à 60 s à entrer dans le verrou d'un apprenant déjà actif. C'est sans portée -
 * le verrou protège une progression pédagogique, pas un secret.
 */
const TTL_CONTEXTE_MS = 60_000;
const MAX_CONTEXTES   = 2_000;
const contextes = new Map(); // apprenant_id -> { rattachements, modules, estLu, expire }

function lireCache(apprenantId) {
  const e = contextes.get(apprenantId);
  if (!e) return null;
  if (e.expire <= Date.now()) { contextes.delete(apprenantId); return null; }
  return e;
}

function ecrireCache(apprenantId, { rattachements, modules, estLu }) {
  if (contextes.size >= MAX_CONTEXTES) contextes.clear();
  contextes.set(apprenantId, { rattachements, modules, estLu, expire: Date.now() + TTL_CONTEXTE_MS });
}

/**
 * Enregistre localement qu'un contenu vient d'être lu.
 *
 * Sans cela, le cache renverrait « pas encore lu » pendant 60 s après l'écriture, et le
 * contenu suivant resterait verrouillé alors que son prérequis vient d'être rempli - le
 * cache contredirait la base.
 */
export function noterLectureEnCache(apprenantId, contenuId) {
  const e = contextes.get(apprenantId);
  if (e) e.estLu.add(contenuId);
}

/** À appeler quand la progression change hors marquage (démarquage). */
export function oublierContexte(apprenantId) {
  contextes.delete(apprenantId);
}

/**
 * Fusionne les rattachements trouvés par identifiant et par e-mail.
 *
 * Les deux coexistent en base selon que l'apprenant a été importé ou inscrit en ligne.
 * L'identifiant PRIME : si la même classe apparaît des deux côtés, on garde la ligne liée
 * au compte, la seule dont les dates soient tenues à jour par les écrans de gestion.
 */
function fusionnerRattachements(parId, parEmail) {
  const vus = new Map();
  for (const r of parId || []) if (r?.groupe_id) vus.set(r.groupe_id, r);
  for (const r of parEmail || []) if (r?.groupe_id && !vus.has(r.groupe_id)) vus.set(r.groupe_id, r);
  return [...vus.values()];
}

/** Une colonne absente ne doit pas casser la lecture : le module n'est peut-être pas encore migré. */
const colonneAbsente = (e) => e && (e.code === "42703" || /lecture_sequentielle/.test(e.message || ""));

/**
 * Calcule l'état de verrou de chaque contenu pour un apprenant.
 *
 * @param {string} apprenantId
 * @param {object[]} rattachements  [{ groupe_id, date_ajout, date_retrait }]
 * @param {object[]} contenus   les contenus publiés qui le concernent (bruts, avec groupe_ids et created_at)
 * @returns {Promise<Record<string, {verrouille: boolean, bloque_par: {id, titre}|null}>>}
 */
export async function calculerVerrous(apprenantId, rattachements, contenus) {
  const etat = {};
  (contenus || []).forEach(c => { etat[c.id] = { verrouille: false, bloque_par: null, lu: false }; });
  if (!apprenantId || !rattachements?.length || !contenus?.length) return etat;

  // Ce que l'apprenant a deja termine. Une seule requete : la liste est courte et
  // l'interroger par contenu ferait N allers-retours.
  const { data: lus } = await supabase
    .from("contenus_lus").select("contenu_id").eq("apprenant_id", apprenantId);
  const estLu = new Set((lus || []).map(l => l.contenu_id));
  const verrous = verrousDepuis(rattachements, contenus, estLu);
  /* L'état « lu » est renvoyé AVEC les verrous, depuis la requête qui le lit déjà.
     L'écran de l'apprenant n'avait aucun moyen de distinguer un cours terminé d'un cours
     jamais ouvert - les deux s'affichaient à l'identique. Le recalculer côté route aurait
     coûté une seconde lecture de la même table. */
  Object.keys(verrous).forEach(id => { verrous[id].lu = estLu.has(id); });
  return verrous;
}

/**
 * MOTIFS de fermeture d'un contenu. Trois causes distinctes, trois messages : un cadenas
 * sans raison est incompréhensible, et « terminez le précédent » ne se répare pas de la
 * même façon que « publié avant votre arrivée ».
 */
export const MOTIF = {
  AVANT_ARRIVEE:   "avant_arrivee",
  APRES_DEPART:    "apres_depart",
  PENDANT_ABSENCE: "pendant_absence",
  SEQUENCE:        "sequence",
};

/**
 * Le jour d'une date, en nombre. Comparer À LA JOURNÉE et non à la seconde : un apprenant
 * inscrit à 14 h ne doit pas perdre le cours publié à 9 h le même jour.
 */
const jour = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};

/**
 * Le contenu tombe-t-il dans la fenêtre de présence de l'apprenant dans CETTE classe ?
 *
 * Une classe où des apprenants partent et d'autres arrivent ne se clôture jamais : le bon
 * repère n'est pas la classe mais la période pendant laquelle l'apprenant y était.
 */
function dansLaFenetre(contenu, ratt) {
  const pub = jour(contenu.created_at);
  if (pub === null) return { dedans: true, motif: null };

  const periodes = periodesDe(ratt);

  // Avant la toute première arrivée : il n'était pas encore là.
  const premiere = periodes[0];
  if (premiere.debut !== null && pub < premiere.debut) return { dedans: false, motif: MOTIF.AVANT_ARRIVEE };

  for (const p of periodes) {
    const apresDebut = p.debut === null || pub >= p.debut;
    const avantFin   = p.fin   === null || pub <= p.fin;
    if (apresDebut && avantFin) return { dedans: true, motif: null };
  }

  /* Hors de toutes les périodes, deux cas bien différents :
     - après la DERNIÈRE sortie, il est parti et ne revient pas (pour l'instant) ;
     - entre deux périodes, il était absent PUIS revenu. Ce contenu-là reste visible et
       grisé : c'est ce qu'il a manqué, et le lui cacher ne l'aiderait pas à le savoir. */
  const derniere = periodes[periodes.length - 1];
  if (derniere.fin !== null && pub > derniere.fin) return { dedans: false, motif: MOTIF.APRES_DEPART };
  return { dedans: false, motif: MOTIF.PENDANT_ABSENCE };
}

/**
 * Les périodes de présence d'un rattachement, en jours comparables.
 *
 * `note.periodes` ([{debut, fin}]) est écrit par la route d'arrêt/reprise de formation et
 * fait autorité : un apprenant peut partir et revenir, et les cours parus entre les deux
 * ne lui sont pas dus. Les rattachements antérieurs à ce mécanisme - l'immense majorité -
 * n'en ont pas : on retombe alors sur l'unique fenêtre portée par les colonnes, ce qui
 * reproduit exactement l'ancien comportement.
 */
function periodesDe(ratt) {
  let p = null;
  if (Array.isArray(ratt.periodes)) p = ratt.periodes;
  else {
    try { const n = JSON.parse(ratt.note || "{}"); if (Array.isArray(n.periodes)) p = n.periodes; } catch { /* note libre */ }
  }
  const brut = (p && p.length) ? p : [{ debut: ratt.date_ajout, fin: ratt.date_retrait }];
  return brut
    .map(x => ({ debut: jour(x.debut), fin: jour(x.fin) }))
    // Triées : `dansLaFenetre` lit la première et la dernière pour distinguer
    // « avant l'arrivée » de « après le départ ».
    .sort((a, b) => (a.debut ?? -Infinity) - (b.debut ?? -Infinity));
}

/** Le calcul pur, sans acces a la base - pour que les appelants qui ont deja la liste
 *  des lectures n'aient pas a la redemander.
 *
 *  `rattachements` : [{ groupe_id, date_ajout, date_retrait }]. */
function verrousDepuis(rattachements, contenus, estLu) {
  const etat = {};
  (contenus || []).forEach(c => { etat[c.id] = { verrouille: false, motif: null, bloque_par: null }; });

  // Un contenu peut relever de plusieurs classes de l'apprenant. On le declare accessible
  // s'il l'est dans AU MOINS UNE d'elles : « lu » est attache au contenu et non a la
  // classe, donc etre ouvert dans B signifie que les prerequis de B sont reellement
  // termines. Exiger le deblocage dans TOUTES ses classes creerait des blocages croises
  // que l'apprenant ne pourrait pas resoudre - deux classes se retenant mutuellement.
  const accessibleQuelquePart = new Set();
  const motifParContenu = {};   // le motif de la premiere classe qui le ferme
  const concerne = new Set();   // contenus touchant au moins une de ses classes

  const poserMotif = (id, motif, bloqueur) => {
    if (motifParContenu[id]) return;
    motifParContenu[id] = { motif, bloque_par: bloqueur || null };
  };

  for (const ratt of rattachements) {
    const gid = ratt.groupe_id;

    // LA SEQUENCE NE PORTE QUE SUR LA FENETRE DE PRESENCE. Un contenu publie avant son
    // arrivee ne doit pas le retenir : il n'a pas le droit de le consulter, donc il ne
    // pourrait jamais le terminer - le verrou serait definitif et sans issue.
    const aSoi = contenus.filter(c => (c.groupe_ids || []).includes(gid));
    aSoi.forEach(c => concerne.add(c.id));

    const dedans = [];
    for (const c of aSoi) {
      const f = dansLaFenetre(c, ratt);
      if (f.dedans) dedans.push(c);
      else poserMotif(c.id, f.motif, null);
    }
    dedans.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    // Le premier contenu sequentiel non termine ferme tout ce qui le suit dans CETTE classe.
    let bloqueur = null;
    for (const c of dedans) {
      if (bloqueur === null) {
        accessibleQuelquePart.add(c.id);
        if (c.lecture_sequentielle && !estLu.has(c.id)) bloqueur = c;
      } else {
        poserMotif(c.id, MOTIF.SEQUENCE, { id: bloqueur.id, titre: bloqueur.titre || "le cours précédent" });
      }
    }
  }

  for (const c of contenus) {
    // Un contenu qui ne touche AUCUNE des classes de l'apprenant est hors sequence, pas
    // verrouille : il n'appartient a aucun parcours le concernant, et le declarer ferme
    // ferait apparaitre un cadenas sur un cours qu'il n'aurait de toute facon jamais vu.
    if (!concerne.has(c.id)) { etat[c.id] = { verrouille: false, motif: null, bloque_par: null }; continue; }

    if (accessibleQuelquePart.has(c.id)) {
      etat[c.id] = { verrouille: false, motif: null, bloque_par: null };
      continue;
    }
    const m = motifParContenu[c.id] || { motif: MOTIF.SEQUENCE, bloque_par: null };
    etat[c.id] = { verrouille: true, motif: m.motif, bloque_par: m.bloque_par };
  }
  return etat;
}

/**
 * Ne garder d'une liste que ce qui tombe dans les périodes de présence de l'apprenant.
 *
 * LA MÊME RÈGLE QUE POUR LES CONTENUS E-LEARNING, exposée pour les autres écrans :
 * ressources partagées, évaluations, devoirs. Elle vivait implicitement dans
 * `dansLaFenetre`, réservé au calcul des verrous ; les autres routes ne filtraient rien,
 * si bien qu'un apprenant ayant arrêté continuait de recevoir les ressources déposées par
 * son coach après son départ, alors que les cours, eux, lui étaient fermés.
 *
 * @param {object[]} liste
 * @param {object} ratt   le rattachement : { date_ajout, date_retrait, note }
 * @param {(x) => string} dateDe  où lire la date de publication de chaque élément
 */
/**
 * Comme `bornerAFenetre`, mais GRISE au lieu de masquer.
 *
 * POURQUOI LES DEUX COEXISTENT. Masquer convient à ce dont l'absence ne se remarque pas -
 * une séance à laquelle l'apprenant n'a jamais assisté n'a pas à figurer dans son planning.
 * Les ressources partagées, elles, se comptent et se commentent entre apprenants : les faire
 * disparaître laisse celui qui vient d'arriver devant une liste plus courte que celle de ses
 * camarades, sans un mot d'explication. Un document grisé qui dit « déposé avant votre
 * arrivée » informe ; le même document absent laisse croire à une panne.
 *
 * TOUT N'EST PAS GRISÉ POUR AUTANT. `apres_depart` reste masqué : ce que l'ancien coach a
 * déposé APRÈS le transfert appartient à une classe que l'apprenant a quittée. Le lui montrer
 * n'explique rien - il n'y était plus - et ne ferait que l'encombrer.
 *
 * @param {object[]} liste
 * @param {object} ratt            le rattachement : { date_ajout, date_retrait, note }
 * @param {(x) => string} dateDe   où lire la date de publication de chaque élément
 * @param {string[]} motifsGrises  les motifs qui donnent un élément grisé plutôt qu'absent
 */
export function annoterFenetre(liste, ratt, dateDe,
                               motifsGrises = [MOTIF.AVANT_ARRIVEE, MOTIF.PENDANT_ABSENCE]) {
  if (!ratt) return liste || [];
  const fenetres = periodesDe(ratt);
  // Aucune borne connue : on ne grise rien plutôt que de tout barrer.
  if (!fenetres.length || fenetres.every(f => f.debut === null && f.fin === null)) return liste || [];

  const sortie = [];
  for (const x of liste || []) {
    const { dedans, motif } = dansLaFenetre({ created_at: dateDe(x) }, ratt);
    if (dedans) { sortie.push(x); continue; }
    if (!motifsGrises.includes(motif)) continue;   // masqué, comme avant
    sortie.push({ ...x, hors_fenetre: true, motif });
  }
  return sortie;
}

export function bornerAFenetre(liste, ratt, dateDe) {
  if (!ratt) return liste || [];
  const fenetres = periodesDe(ratt);
  // Aucune borne connue : on ne filtre rien plutôt que de tout masquer.
  if (!fenetres.length || fenetres.every(f => f.debut === null && f.fin === null)) return liste || [];

  return (liste || []).filter(x => {
    const d = jour(dateDe(x));
    if (d === null) return true;   // sans date, on ne peut rien conclure : on garde
    return fenetres.some(f => (f.debut === null || d >= f.debut) && (f.fin === null || d <= f.fin));
  });
}

/**
 * Tout ce que la route « marquer comme terminé » doit savoir, en UN SEUL aller-retour
 * parallèle.
 *
 * La version précédente enchaînait cinq requêtes SÉQUENTIELLES avant de répondre - les
 * deux résolutions de classes, les modules, les lectures, puis l'existence de la ligne.
 * Chaque aller-retour se paie, et derrière un VPN l'addition devenait perceptible :
 * l'apprenant cliquait, et le bouton mettait un temps déraisonnable à réagir.
 *
 * Les trois lectures sont indépendantes : elles partent ensemble.
 */
export async function contexteMarquage(user, contenuId) {
  const cached = lireCache(user.id);
  if (cached) {
    const v = cached.rattachements.length
      ? verrousDepuis(cached.rattachements, cached.modules, cached.estLu)[contenuId]
      : null;
    return {
      rattachements: cached.rattachements,
      dejaLu: cached.estLu.has(contenuId),
      accessible: v ? !v.verrouille : true,
      motif: v ? v.motif : null,
      bloque_par: v ? v.bloque_par : null,
    };
  }

  // Les DATES comptent autant que les classes : c'est la fenetre de presence qui decide.
  // `note` porte les PERIODES de presence : sans elle, un apprenant parti puis revenu
  // recupererait les cours publies pendant son absence.
  const CHAMPS = "groupe_id, date_ajout, date_retrait, statut, note";
  const [parId, parEmail, lus] = await Promise.all([
    supabase.from("groupes_apprenants").select(CHAMPS).eq("apprenant_id", user.id),
    user.email
      ? supabase.from("groupes_apprenants").select(CHAMPS).ilike("email_apprenant", user.email)
      : Promise.resolve({ data: [] }),
    supabase.from("contenus_lus").select("contenu_id").eq("apprenant_id", user.id),
  ]);

  const rattachements = fusionnerRattachements(parId.data, parEmail.data);
  const estLu = new Set((lus.data || []).map(l => l.contenu_id));
  // Tiree de la liste deja chargee : une requete de moins pour savoir si c'est une
  // premiere lecture.
  const dejaLu = estLu.has(contenuId);

  if (!rattachements.length) {
    ecrireCache(user.id, { rattachements, modules: [], estLu });
    return { rattachements, dejaLu, accessible: true, motif: null, bloque_par: null };
  }

  const { data: modules, error } = await supabase
    .from("modules_elearning")
    .select("id, titre, groupe_ids, created_at, lecture_sequentielle")
    .overlaps("groupe_ids", rattachements.map(r => r.groupe_id))
    .eq("statut", "publie");
  if (error) {
    if (colonneAbsente(error)) return { rattachements, dejaLu, accessible: true, motif: null, bloque_par: null };
    throw error;
  }

  ecrireCache(user.id, { rattachements, modules: modules || [], estLu });
  const v = verrousDepuis(rattachements, modules || [], estLu)[contenuId];
  if (!v) return { rattachements, dejaLu, accessible: true, motif: null, bloque_par: null };
  return { rattachements, dejaLu, accessible: !v.verrouille, motif: v.motif, bloque_par: v.bloque_par };
}

/** Les classes d'un apprenant - par identifiant OU par email, les deux coexistent en base. */
export async function classesDeLApprenant(user) {
  const [parId, parEmail] = await Promise.all([
    supabase.from("groupes_apprenants").select("groupe_id").eq("apprenant_id", user.id),
    user.email
      ? supabase.from("groupes_apprenants").select("groupe_id").ilike("email_apprenant", user.email)
      : Promise.resolve({ data: [] }),
  ]);
  return [...new Set([...(parId.data || []), ...(parEmail.data || [])]
    .map(r => r.groupe_id).filter(Boolean))];
}
