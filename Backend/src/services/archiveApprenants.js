/**
 * LA LECTURE D'UN PARCOURS D'APPRENANT, EN UN SEUL ENDROIT.
 *
 * POURQUOI CE FICHIER EXISTE. L'archive du coach lisait les motifs de départ, les périodes de
 * présence et les durées depuis cinq fonctions écrites à l'intérieur de sa route. L'archive de
 * la commerciale a besoin des mêmes lectures. Les recopier aurait garanti qu'elles divergent à
 * la première correction - c'est exactement le mode de panne que ce projet collectionne : un
 * champ écrit d'un côté, lu différemment de l'autre, et personne ne sait plus laquelle des deux
 * versions dit la vérité.
 *
 * CE QUE CE MODULE NE FAIT PAS : parler à la base. Il reçoit des lignes déjà chargées et rend
 * des objets. C'est ce qui le rend testable sans Supabase, et c'est ce qui permet aux deux
 * routes de l'appeler avec leurs propres requêtes - le coach part de ses classes, la
 * commerciale de ses dossiers.
 *
 * OÙ VIVENT LES INFORMATIONS, puisque aucune table d'historique n'existe :
 *   · `groupes_apprenants.note`, en JSON : `assignation_id`, `depart`, `arret_formation`,
 *     `periodes`, `dernier_transfert`
 *   · `groupes_apprenants.statut` : `actif` | `transfere` | `retire`
 *   · `demandes_transfert` : le motif PRÉCIS d'un transfert, et le seul endroit où une
 *     migration de canal soit nommée comme telle
 *   · `assignations_parcours.plan_paiement.changements_tarif[]` : les changements de prix
 *
 * Un transfert laisse donc sa trace à DEUX endroits qui ne disent pas la même chose : la `note`
 * porte « Changement de classe », la demande porte « niveau trop élevé ». La seconde est la
 * vraie raison, saisie par l'assistante ; la première est le libellé du geste. On garde les
 * deux, et on affiche la plus précise.
 */

import { libelleCanal as libelleCanalBrut, estCanal } from "../utils/canal.js";

/* ─────────────────────────────────────────────────────────────────────────────────────────
   LECTURES DE BASE
   ───────────────────────────────────────────────────────────────────────────────────────── */

/** `note` contient du JSON la plupart du temps, du texte libre parfois. Jamais d'exception. */
export const lireNote = (r) => {
  try {
    const n = typeof r?.note === "string" ? JSON.parse(r.note || "{}") : (r?.note || {});
    return n && typeof n === "object" ? n : {};
  } catch { return {}; }
};

/** Le dossier commercial auquel une inscription se rattache. Renseigné sur 91/91 en base. */
export const assignationIdDe = (r) => lireNote(r).assignation_id || null;

/**
 * Le motif du départ, déplié depuis `note`.
 *
 * UN TRANSFERT N'EST PAS UN ARRÊT. L'apprenant n'a pas quitté BET : il a changé de classe,
 * souvent parce que le niveau ne lui convenait pas. Afficher « A arrêté · motif non renseigné »
 * dit exactement le contraire de ce qui s'est passé, et fausse le taux de rétention.
 */
export const motifDe = (r) => {
  const n = lireNote(r);
  const a = n.arret_formation;
  if (a?.motif) return { motif: a.motif, detail: a.detail || null, par: a.par || null, arret: true };

  const d = n.depart;
  if (d?.motif) {
    /* LE CHANGEMENT DE NIVEAU DANS LE DÉTAIL. « Transféré vers Anglais B2 » laisse croire à un
       simple changement d'horaire ; « C1 → B2 » dit que le niveau ne convenait pas, ce qui est
       presque toujours la vraie raison. On ne l'affiche que s'il a réellement changé -
       « C1 → C1 » serait du bruit. */
    const bouge = d.niveau_avant && d.niveau_apres
      && String(d.niveau_avant).toUpperCase() !== String(d.niveau_apres).toUpperCase();
    const morceaux = [
      d.vers ? `Transféré vers « ${d.vers} »` : null,
      bouge ? `niveau ${String(d.niveau_avant).toUpperCase()} → ${String(d.niveau_apres).toUpperCase()}` : null,
    ].filter(Boolean);
    return {
      motif:  d.motif,
      detail: morceaux.length ? morceaux.join(" · ") : null,
      par:    d.par || null,
      transfert: d.type === "transfert",
      vers: d.vers || null,
      niveau_avant: d.niveau_avant || null,
      niveau_apres: d.niveau_apres || null,
    };
  }
  // Repli sur les colonnes de pause, renseignées par l'onglet Archive.
  return { motif: r?.motif_pause || null, detail: r?.detail_motif || null, par: null };
};

/**
 * Les périodes de présence d'une inscription.
 *
 * Un apprenant peut arrêter puis revenir. Sans cette lecture, la reprise remettait
 * `statut = actif` et `date_retrait = null`, et il ressortait de l'archive comme quelqu'un qui
 * n'était jamais parti - avec une ancienneté gonflée de tous les mois où il n'était pas là.
 *
 * `periodes` est écrit par la route d'arrêt/reprise. Les inscriptions antérieures à ce
 * mécanisme n'en ont pas : on retombe alors sur l'unique fenêtre des colonnes, ce qui
 * reproduit exactement l'ancien calcul.
 *
 * LES PÉRIODES SONT BORNÉES À LA FENÊTRE DE L'INSCRIPTION, et ce n'est pas une précaution
 * théorique - c'est la correction de deux bugs réels, constatés en base :
 *
 *   1. UN TRANSFERT RECOPIE `periodes` TELLE QUELLE dans la nouvelle inscription
 *      (`groupes.js` fait `noteObj = JSON.parse(ga.note)` puis ajoute `dernier_transfert`).
 *      La nouvelle inscription hérite donc de périodes antérieures à sa propre existence.
 *      Sommer les périodes de toutes les inscriptions comptait alors deux fois le même temps :
 *      24 jours de formation pour un apprenant arrivé 12 jours plus tôt.
 *
 *   2. LA PÉRIODE OUVERTE DE L'ANCIENNE INSCRIPTION N'EST JAMAIS FERMÉE au transfert : elle
 *      garde `fin: null` alors que `date_retrait` est bien posé. Sa durée courait donc jusqu'à
 *      aujourd'hui au lieu de s'arrêter au départ - l'archive du coach surévaluait le temps
 *      passé dans chaque classe quittée.
 *
 * Borner répare les deux sans toucher aux données : une période est ramenée à
 * [`date_ajout`, `date_retrait`], et celle qui tombe entièrement hors de cette fenêtre est
 * écartée. Pour une inscription sans `periodes`, le repli est la fenêtre elle-même, donc le
 * calcul est inchangé - aucune régression sur les 87 inscriptions qui n'ont pas de pause.
 */
export const periodesDe = (r) => {
  const n = lireNote(r);
  const brut = Array.isArray(n.periodes) && n.periodes.length
    ? n.periodes : [{ debut: r?.date_ajout, fin: r?.date_retrait }];

  const t = (v) => (v ? new Date(v).getTime() : null);
  const ouverture = t(r?.date_ajout);
  const fermeture = t(r?.date_retrait);

  return brut
    .filter(x => x?.debut)
    .map(p => {
      const d0 = t(p.debut), f0 = t(p.fin);
      if (d0 == null || Number.isNaN(d0)) return null;
      // Entièrement avant l'entrée, ou entièrement après la sortie : cette période
      // n'appartient pas à cette inscription (cas de la recopie au transfert).
      if (ouverture != null && f0 != null && f0 <= ouverture) return null;
      if (fermeture != null && d0 >= fermeture) return null;

      const debut = ouverture != null && d0 < ouverture ? ouverture : d0;
      // Une période encore ouverte sur une inscription CLOSE se ferme à la sortie.
      const fin = f0 != null
        ? (fermeture != null && f0 > fermeture ? fermeture : f0)
        : fermeture;
      if (fin != null && fin <= debut) return null;

      return {
        ...p,
        debut: new Date(debut).toISOString(),
        fin: fin != null ? new Date(fin).toISOString() : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut));
};

/**
 * Les périodes de plusieurs inscriptions ramenées à une seule présence chez BET.
 *
 * POURQUOI FUSIONNER. Un transfert ferme une inscription et en ouvre une autre dans la même
 * seconde : additionner leurs durées compte deux fois ce passage, et laisse croire à une
 * interruption là où il n'y en a aucune. Après fusion, un apprenant transféré trois fois a une
 * seule durée de présence, et les trous qui restent sont de vraies absences.
 */
export const fusionnerPeriodes = (periodes) => {
  const triees = [...periodes].filter(p => p?.debut)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut));

  /* LA CLÉ `motif` EST RECOPIÉE TELLE QUELLE, PRÉSENTE OU ABSENTE - jamais posée à `null` par
     commodité. C'est elle qui distingue une pause enregistrée d'un micro-trou de transfert
     (voir `pausesDe`) : la reposer systématiquement transformerait chaque transfert en pause. */
  const copier = (p, fin) => {
    const o = { debut: p.debut, fin: fin ?? null };
    if (Object.prototype.hasOwnProperty.call(p, "motif")) { o.motif = p.motif ?? null; o.par = p.par ?? null; }
    return o;
  };

  const out = [];
  for (const p of triees) {
    const prec = out[out.length - 1];
    const d = new Date(p.debut).getTime();
    const f = p.fin ? new Date(p.fin).getTime() : null;
    // Une période déjà ouverte absorbe tout ce qui suit : rien ne peut commencer « après »
    // une présence sans fin.
    if (prec && prec.fin === null) continue;
    if (prec && d <= new Date(prec.fin).getTime()) {
      /* Chevauchement : on étend. Le motif du précédent tombe, puisqu'il n'y a finalement pas
         eu d'interruption à cet endroit - la période suivante couvrait déjà le trou. */
      if (f === null) { prec.fin = null; delete prec.motif; delete prec.par; }
      else if (f > new Date(prec.fin).getTime()) {
        prec.fin = p.fin;
        delete prec.motif; delete prec.par;
        if (Object.prototype.hasOwnProperty.call(p, "motif")) { prec.motif = p.motif ?? null; prec.par = p.par ?? null; }
      }
      continue;
    }
    out.push(copier(p, p.fin));
  }
  return out;
};

/**
 * Les pauses : les interruptions RÉELLEMENT ENREGISTRÉES.
 *
 * Une période fermée suivie d'une autre laisse un trou, mais tous les trous ne sont pas des
 * pauses. Un transfert ferme une inscription et en ouvre une autre dans la même seconde - on a
 * mesuré 0,94 seconde d'écart entre `date_retrait` et `date_ajout` - et ce micro-trou faisait
 * passer en « revenu » trois apprenants qui n'avaient jamais interrompu quoi que ce soit.
 *
 * LE DISCRIMINANT N'EST PAS UNE DURÉE MINIMALE, qui serait un seuil arbitraire condamné à
 * couper au mauvais endroit : c'est la PRÉSENCE DE LA CLÉ `motif` sur la période qu'on ferme.
 * La route d'arrêt l'écrit systématiquement (`ouverte.motif = motif || null`, groupes.js:1120),
 * y compris quand l'assistante n'a pas précisé de raison ; un transfert ne l'écrit jamais, et
 * le bornage non plus. Une pause sans motif reste donc détectée, et un transfert ne l'est pas.
 *
 * Une période fermée EN DERNIER n'est pas une pause : c'est un départ, porté ailleurs.
 */
export const pausesDe = (periodes) =>
  periodes.slice(0, -1)
    .map((p, i) => ({ p, suivante: periodes[i + 1] }))
    .filter(({ p }) => p.fin && Object.prototype.hasOwnProperty.call(p, "motif"))
    .map(({ p, suivante }) => ({
      du: p.fin, au: suivante?.debut || null, motif: p.motif || null, par: p.par || null,
    }));

/** Le nombre de jours réellement suivis, trous d'absence exclus. */
export const joursSuivis = (periodes) => {
  const now = Date.now();
  return periodes.reduce((total, p) => {
    const d = new Date(p.debut).getTime();
    const f = p.fin ? new Date(p.fin).getTime() : now;
    if (Number.isNaN(d) || Number.isNaN(f) || f < d) return total;
    return total + (f - d);
  }, 0) / 86400000;
};

/** « 5 mois et 17 jours » à partir d'un nombre de jours. */
export const dureeDepuisJours = (jours) => {
  if (jours == null || jours < 0) return null;
  const mois = Math.floor(jours / 30.44);
  const reste = Math.round(jours - mois * 30.44);
  return { mois, jours: reste, texte: `${mois} mois et ${reste} jour${reste > 1 ? "s" : ""}` };
};

/** « 5 mois et 17 jours » - la forme exacte du classeur des coachs. */
export const dureeLisible = (debut, fin) => {
  if (!debut) return null;
  const d = new Date(debut), f = fin ? new Date(fin) : new Date();
  if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime()) || f < d) return null;
  let mois = (f.getFullYear() - d.getFullYear()) * 12 + (f.getMonth() - d.getMonth());
  let jours = f.getDate() - d.getDate();
  if (jours < 0) { mois -= 1; const prec = new Date(f.getFullYear(), f.getMonth(), 0).getDate(); jours += prec; }
  return { mois: Math.max(0, mois), jours: Math.max(0, jours),
    texte: `${Math.max(0, mois)} mois et ${Math.max(0, jours)} jour${jours > 1 ? "s" : ""}` };
};

/* ─────────────────────────────────────────────────────────────────────────────────────────
   LE VOCABULAIRE DES MOTIFS
   Les codes sont écrits par trois écrans différents ; les libellés étaient dans chacun d'eux.
   ───────────────────────────────────────────────────────────────────────────────────────── */

/** Motifs d'un changement de classe (demandes_transfert, type `changement_groupe`). */
export const MOTIFS_TRANSFERT = {
  niveau_trop_eleve:  "Niveau de la classe trop élevé",
  niveau_trop_faible: "Niveau de la classe trop faible",
  horaire:            "Horaires incompatibles",
  rythme_inadapte:    "Rythme inadapté",
  relation_groupe:    "Difficulté relationnelle dans le groupe",
  autre:              "Autre",
};

/** Motifs d'une migration de canal (demandes_transfert, type `changement_coaching`). */
export const MOTIFS_MIGRATION = {
  demenagement:        "Déménagement",
  horaires_centre:     "Horaires du centre incompatibles",
  preference_client:   "Préférence du client",
  contrainte_connexion:"Contrainte de connexion",
  decision_commerciale:"Décision commerciale",
  autre:               "Autre",
};

/** Motifs d'un transfert d'un centre à un autre (type `changement_centre`). */
export const MOTIFS_CENTRE = {
  demenagement:        "Déménagement",
  rapprochement:       "Rapprochement du domicile ou du lieu de travail",
  horaires_centre:     "Horaires de l'autre centre plus adaptés",
  preference_client:   "Préférence du client",
  places_disponibles:  "Pas de classe à son niveau dans le centre d'origine",
  decision_commerciale:"Décision commerciale",
  autre:               "Autre",
};

/** Motifs d'un arrêt de formation ou d'une pause (onglet Archive). */
export const MOTIFS_ARRET = {
  demenagement:   "Déménagement",
  financier:      "Raisons financières",
  travail:        "Contrainte professionnelle",
  sante:          "Raisons de santé",
  scolarite:      "Reprise de la scolarité",
  niveau_suivant: "Passage au niveau suivant",
  insatisfaction: "Insatisfaction",
  pause:          "Pause",
  fin_contrat:    "Fin de contrat",
  // Écrit tel quel par la route d'arrêt/reprise quand l'assistante n'a pas précisé de motif.
  arret:          "Arrêt de formation",
  autre:          "Autre",
};

/**
 * Le libellé d'un motif, quelle que soit son origine.
 *
 * Un motif peut être un CODE (`niveau_trop_eleve`) ou déjà une phrase (« Changement de
 * classe », « Fin de contrat ») selon l'écran qui l'a écrit. On ne traduit donc que ce qu'on
 * reconnaît, et on rend le reste tel quel plutôt que de l'escamoter.
 */
export const libelleMotif = (code) => {
  if (!code) return null;
  const c = String(code);
  return MOTIFS_TRANSFERT[c] || MOTIFS_MIGRATION[c] || MOTIFS_CENTRE[c] || MOTIFS_ARRET[c] || c;
};

/* Le libellé vit dans `utils/canal.js`, avec la règle de compatibilité qui va avec. Réexporté
   ici pour que les appelants de l'archive n'aient pas à importer deux modules - mais défini
   une seule fois, car il l'avait déjà été trois. Le repli « — » reste propre à l'archive :
   une case de tableau ne se laisse pas vide, une phrase si. */
export const libelleCanal = (c) => libelleCanalBrut(c) || "—";

/* ─────────────────────────────────────────────────────────────────────────────────────────
   LE PARCOURS COMPLET D'UN DOSSIER
   ───────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Tout ce qui est arrivé à un apprenant, en une seule suite chronologique.
 *
 * POURQUOI UNE SUITE D'ÉVÉNEMENTS ET NON UNE LISTE DE CLASSES. « Combien d'apprenants j'ai eu,
 * et qui est parti » se répond avec une liste de classes. « Qu'est-il arrivé à celui-ci » ne se
 * répond pas : un transfert, une migration de canal, une pause et un changement de tarif sont
 * quatre choses différentes, écrites dans quatre endroits, et seule leur mise en ordre raconte
 * l'histoire. Les classes seules laissaient croire qu'un apprenant passé du présentiel au en
 * ligne avait simplement changé de groupe.
 *
 * CE QUI EST VOLONTAIREMENT INCLUS : les demandes ENCORE OUVERTES. Un transfert en attente
 * d'accord n'est pas un non-événement - c'est précisément ce que la commerciale doit voir avant
 * d'appeler le client. L'archive s'arrêterait au dernier geste accompli et tairait celui qui est
 * en train de se faire.
 *
 * @param {object}   dossier       la ligne `assignations_parcours`
 * @param {object[]} inscriptions  ses `groupes_apprenants`, dans n'importe quel ordre
 * @param {object}   groupes       { [groupe_id]: { nom, niveau, type_cours, coach_id, centre_id } }
 * @param {object}   coachs        { [coach_id]: nom }
 * @param {object}   centres       { [centre_id]: nom }
 * @param {object}   personnes     { [utilisateur_id]: { nom, role } }
 * @param {object[]} demandes      les `demandes_transfert` dont le `ga_id` est l'une des inscriptions
 * @returns {object[]} événements triés du plus ancien au plus récent
 */
export function construireParcours({
  dossier, inscriptions = [], groupes = {}, coachs = {}, centres = {}, personnes = {}, demandes = [],
}) {
  const evts = [];
  const qui = (id) => (id && personnes[id] ? personnes[id] : null);
  const ctx = (gid) => {
    const g = groupes[gid] || {};
    return {
      classe_id:  gid || null,
      classe:     g.nom || null,
      niveau:     g.niveau || null,
      canal:      g.type_cours || null,
      coach_nom:  g.coach_id ? (coachs[g.coach_id] || null) : null,
      centre_nom: g.centre_id ? (centres[g.centre_id] || null) : null,
    };
  };

  /* Les demandes rangées par inscription de DÉPART : c'est `ga_id` qui les relie, et une même
     inscription peut en porter plusieurs (une refusée, puis une acceptée). */
  const demandesParGa = {};
  for (const d of demandes) if (d.ga_id) (demandesParGa[d.ga_id] ||= []).push(d);

  const triees = [...inscriptions].sort((a, b) => new Date(a.date_ajout || 0) - new Date(b.date_ajout || 0));

  for (const ins of triees) {
    const c = ctx(ins.groupe_id);
    const n = lireNote(ins);
    const m = motifDe(ins);
    /* ── L'ENTRÉE EN CLASSE ──
       `dernier_transfert` dit que cette entrée est l'arrivée d'un transfert, et non une
       inscription initiale. Les confondre faisait compter autant d'« inscriptions » que de
       changements de classe. */
    const arriveeParTransfert = n.dernier_transfert || null;
    evts.push({
      type: arriveeParTransfert ? "arrivee_transfert" : "inscription",
      date: ins.date_ajout || null,
      ...c,
      depuis_classe: arriveeParTransfert?.ancien_groupe || null,
      motif_code: arriveeParTransfert?.motif || null,
      motif: libelleMotif(arriveeParTransfert?.motif),
      par_nom: qui(ins.added_by)?.nom || null,
      par_role: qui(ins.added_by)?.role || null,
      inscription_id: ins.id,
    });

    /* ── LA SORTIE DE CETTE CLASSE ──
       Trois sorties possibles, et il faut les distinguer : un transfert (il va ailleurs chez
       BET), une migration de canal (il va ailleurs ET change de formule), un arrêt (il ne va
       nulle part). Le `statut` seul ne suffit pas - `transfere` couvre les deux premiers. */
    if (ins.date_retrait || ins.statut === "retire") {
      /* La demande qui a provoqué ce départ, s'il y en a une. Elle porte le motif PRÉCIS,
         là où la `note` ne porte que le libellé du geste - et elle est le seul endroit où
         une migration de canal soit nommée. On prend la demande traitée la plus proche. */
      const dmd = (demandesParGa[ins.id] || [])
        .filter(d => d.statut === "traitee")
        .sort((a, b) => new Date(b.traite_le || 0) - new Date(a.traite_le || 0))[0] || null;
      const estMigration = dmd?.type_demande === "changement_coaching";
      /* UN TRANSFERT DE CENTRE N'EST PAS UN TRANSFERT DE CLASSE. Sans ce type, un apprenant
         passé d'Angré à Yopougon se lisait « transfert de classe » : l'archive perdait
         précisément ce qui s'était passé, et son motif - « rapprochement du domicile » -
         s'affichait en code brut, faute d'être cherché dans la bonne liste. */
      const estCentre = dmd?.type_demande === "changement_centre";

      if (m.arret || ins.statut === "retire") {
        evts.push({
          type: "arret", date: ins.date_retrait || null, ...c,
          motif_code: m.motif || null, motif: libelleMotif(m.motif), detail: m.detail || null,
          par_nom: qui(m.par)?.nom || null, inscription_id: ins.id,
        });
      } else {
        evts.push({
          type: estMigration ? "migration_canal" : estCentre ? "changement_centre" : "transfert",
          date: ins.date_retrait || null,
          ...c,
          vers_classe: m.vers || null,
          /* Le canal d'arrivée se lit sur la classe d'arrivée de la demande, pas sur le canal
             annoncé à l'ouverture : l'assistante peut accepter dans une classe hybride.
             Mais seulement si cette classe dit bien un CANAL : une classe de coaching privé
             porte `prive`, qui est un type de coaching - l'afficher comme destination
             annoncerait « migration vers prive », ce qui ne veut rien dire. */
          vers_canal: estMigration && estCanal(groupes[dmd?.groupe_cible_id]?.type_cours)
            ? groupes[dmd.groupe_cible_id].type_cours : null,
          /* LE TRAJET ENTRE CENTRES, figé sur la demande à sa création : la classe quittée
             peut avoir changé de centre ou été clôturée depuis, et c'est justement l'intérêt
             de l'avoir recopié. */
          depuis_centre: estCentre ? (dmd?.centre_source_id || null) : null,
          vers_centre:   estCentre ? (groupes[dmd?.groupe_cible_id]?.centre_id || dmd?.centre_cible_id || null) : null,
          niveau_avant: m.niveau_avant || null,
          niveau_apres: m.niveau_apres || null,
          /* Le motif de la demande l'emporte : « niveau trop élevé » plutôt que
             « Changement de classe ». Le libellé du geste reste en détail. */
          motif_code: dmd?.motif || m.motif || null,
          motif: libelleMotif(dmd?.motif) || libelleMotif(m.motif),
          detail: [dmd?.motif ? m.motif : null, m.detail].filter(Boolean).join(" · ") || null,
          /* Ni une migration de canal ni un transfert de centre ne passent par un test de
             niveau - c'est leur règle fondatrice : l'apprenant garde son niveau, seul le lieu
             ou la formule change. Un changement de classe, lui, l'exige. */
          test_de_niveau: dmd ? !(estMigration || estCentre) : null,
          demande_id: dmd?.id || null,
          par_nom: qui(dmd?.traite_par)?.nom || qui(m.par)?.nom || null,
          par_role: qui(dmd?.traite_par)?.role || null,
          inscription_id: ins.id,
        });
      }
    }
  }

  /* ── LES PAUSES ET LES REPRISES, UNE SEULE FOIS ──
     Elles se calculent sur la présence FUSIONNÉE, pas inscription par inscription. Deux
     raisons, et la première est un bug constaté : le transfert recopiant `periodes` dans la
     nouvelle inscription, la même pause apparaissait deux fois, une fois par classe. La
     seconde est une question de sens : un apprenant ne se met pas en pause d'une classe, il
     se met en pause de sa formation. Le trou entre deux inscriptions successives, lui, n'est
     pas une pause - la fusion l'absorbe, parce qu'un transfert n'interrompt rien.

     Deux événements par trou, pas un : l'arrêt et le retour ne se lisent pas au même moment,
     et une pause encore ouverte n'a pas de reprise. */
  const presence = fusionnerPeriodes(triees.flatMap(i => periodesDe(i)));
  for (const p of pausesDe(presence)) {
    /* La classe où il était au moment de la pause : celle dont la fenêtre contient la date.
       Sans elle, la ligne dirait « pause » sans dire d'où. */
    const pendant = triees.find(i =>
      new Date(i.date_ajout || 0) <= new Date(p.du)
      && (!i.date_retrait || new Date(i.date_retrait) >= new Date(p.du)));
    evts.push({
      type: "pause", date: p.du, ...ctx(pendant?.groupe_id),
      motif_code: p.motif || null, motif: libelleMotif(p.motif),
      par_nom: qui(p.par)?.nom || p.par || null,
      inscription_id: pendant?.id || null,
    });
    if (p.au) evts.push({ type: "reprise", date: p.au, ...ctx(pendant?.groupe_id), inscription_id: pendant?.id || null });
  }

  /* ── LES CHANGEMENTS DE TARIF ──
     Ils ne vivent dans aucune inscription : ils sont dans le plan de paiement du dossier. Une
     migration de canal en produit un dans le même geste, et c'est sa raison d'être pour la
     comptabilité - le taire laisserait croire que l'apprenant a changé de formule au même prix. */
  const chgts = Array.isArray(dossier?.plan_paiement?.changements_tarif)
    ? dossier.plan_paiement.changements_tarif : [];
  for (const ch of chgts) {
    evts.push({
      type: "changement_tarif", date: ch.le || null,
      de: Number(ch.de) || 0, vers: Number(ch.vers) || 0,
      motif_code: ch.motif || null, motif: libelleMotif(ch.motif),
      demande_id: ch.demande_id || null,
      par_nom: qui(ch.par)?.nom || null, par_role: qui(ch.par)?.role || null,
    });
  }

  /* ── CE QUI EST EN TRAIN DE SE FAIRE ──
     Une demande ouverte n'a pas de date de traitement : elle se range à sa date de création,
     et reste en queue de parcours puisque rien ne s'est produit après. */
  for (const d of demandes) {
    if (d.statut === "traitee" || d.statut === "refusee") continue;
    const estMigration = d.type_demande === "changement_coaching";
    evts.push({
      type: "demande_en_cours", date: d.created_at || null,
      ...ctx(d.groupe_id),
      nature: estMigration ? "migration_canal" : "transfert",
      statut_demande: d.statut,
      motif_code: d.motif || null, motif: libelleMotif(d.motif),
      test_de_niveau: !estMigration,
      demande_id: d.id,
      par_nom: qui(d.cree_par)?.nom || null, par_role: qui(d.cree_par)?.role || null,
    });
  }

  /* Tri chronologique. Les événements SANS DATE ne sont pas jetés - une date manquante est une
     saisie incomplète, pas une raison d'effacer le fait - ils remontent simplement en tête. */
  return evts.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   LA SYNTHÈSE D'UN DOSSIER
   ───────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Ce qu'il faut savoir d'un apprenant sans ouvrir son parcours.
 *
 * UNE LIGNE PAR DOSSIER, ET NON PAR INSCRIPTION. C'est la différence de fond avec l'archive du
 * coach : chez lui une inscription vaut une classe qu'il a enseignée, donc deux inscriptions
 * valent deux lignes. Chez la commerciale, un apprenant transféré deux fois reste UN apprenant
 * qu'elle a vendu une fois. Compter par inscription gonflait son total de tous les transferts.
 *
 * LE STATUT se déduit, parce que `assignations_parcours.statut` ne le porte pas : il vaut
 * `converti` sur 85 dossiers sur 88 et ne redescend jamais, même quand l'apprenant est parti.
 * Seules les inscriptions disent la vérité.
 */
export function synthetiserDossier({ dossier, inscriptions = [], groupes = {}, evenements = [], paiements = [] }) {
  const triees = [...inscriptions].sort((a, b) => new Date(a.date_ajout || 0) - new Date(b.date_ajout || 0));
  const derniere = triees[triees.length - 1] || null;

  /* JAMAIS PLACÉ : vendu, converti, mais aucune inscription en classe. Le coach n'a pas ce cas
     et l'archive commerciale ne peut pas l'ignorer - c'est le seul écran où il se verrait. */
  const jamaisPlace = triees.length === 0;

  /* PARTI DE BET, et rien d'autre. Un `transfere` suit toujours ses cours ailleurs ; le
     compter comme un départ faisait baisser la rétention pour quelqu'un que BET n'a pas perdu.
     La vérité est portée par la DERNIÈRE inscription : c'est elle qui dit où il en est. */
  const partiDeBet = !!derniere && derniere.statut === "retire";

  /* LA PRÉSENCE CHEZ BET, toutes classes confondues et ramenée à une seule suite. Sommer les
     périodes inscription par inscription comptait deux fois le temps d'un apprenant transféré :
     le transfert recopie `periodes` dans la nouvelle inscription, et les deux réclamaient le
     même mois. La fusion règle les deux à la fois - le double comptage et le faux trou que
     laisse un transfert entre deux classes. */
  const presence = fusionnerPeriodes(triees.flatMap(i => periodesDe(i)));
  const toutesPauses = pausesDe(presence);

  /* REVENU : il est là aujourd'hui, mais il s'est absenté. Ni « parti », ni « présent sans
     histoire » - et c'est justement ce que la feuille des pauses existe pour consigner. */
  const revenu = !partiDeBet && !jamaisPlace && toutesPauses.length > 0;

  /* La durée COMPTE LE TEMPS RÉELLEMENT SUIVI, trous d'absence exclus. */
  const duree = presence.length ? dureeDepuisJours(joursSuivis(presence)) : null;

  const m = derniere ? motifDe(derniere) : { motif: null, detail: null };
  const evtSortie = [...evenements].reverse().find(e => e.type === "arret") || null;

  const encaisse = paiements.reduce((s, p) => s + (Number(p.montant_recu) || 0), 0);
  const du       = paiements.reduce((s, p) => s + (Number(p.montant_du) || 0), 0);

  const compte = (t) => evenements.filter(e => e.type === t).length;
  const demandeOuverte = evenements.filter(e => e.type === "demande_en_cours").pop() || null;

  return {
    assignation_id: dossier.id,
    nom: dossier.prospect_nom || "-",
    email: dossier.prospect_email || null,
    telephone: dossier.prospect_telephone || null,
    canal: dossier.type_cours || null,
    centre_id: dossier.centre_id || null,
    profil_type: dossier.profil_type || null,

    /* L'ENTRÉE est la première inscription, ou à défaut la conversion : un dossier jamais placé
       a bien une date d'entrée chez BET, même sans classe. */
    date_entree: triees[0]?.date_ajout || dossier.converti_at || dossier.created_at || null,
    date_sortie: partiDeBet ? (derniere?.date_retrait || null)
      : revenu ? (toutesPauses[toutesPauses.length - 1]?.du || null) : null,

    statut: jamaisPlace ? "jamais_place" : partiDeBet ? "a_arrete" : revenu ? "revenu" : "en_formation",
    parti: partiDeBet,
    revenu,
    jamais_place: jamaisPlace,

    classe_actuelle: partiDeBet || jamaisPlace ? null : (groupes[derniere?.groupe_id]?.nom || null),
    derniere_classe: groupes[derniere?.groupe_id]?.nom || null,
    niveau: derniere?.niveau || groupes[derniere?.groupe_id]?.niveau || null,

    /* LES COMPTEURS DE MOUVEMENT, pour que la ligne dise qu'il s'est passé quelque chose sans
       qu'on ait à déplier le parcours. */
    nb_classes:     triees.length,
    nb_transferts:  compte("transfert"),
    nb_migrations:  compte("migration_canal"),
    nb_changements_centre: compte("changement_centre"),
    nb_pauses:      toutesPauses.length,
    nb_changements_tarif: compte("changement_tarif"),

    duree_texte: duree?.texte || null,
    duree_mois:  duree?.mois ?? null,
    /* La durée brute, parce que « 0 mois et 0 jour » est exact mais illisible : un apprenant
       inscrit et arrêté le même jour existe en base, et l'écran doit pouvoir dire « moins d'un
       jour » plutôt que d'afficher deux zéros. */
    duree_jours: presence.length ? Math.round(joursSuivis(presence) * 10) / 10 : null,

    montant_encaisse: encaisse,
    montant_du: du,
    mensualite: Number(dossier.plan_paiement?.mensualite) || null,

    motif_sortie: evtSortie?.motif || (partiDeBet ? libelleMotif(m.motif) : null),
    detail_motif: evtSortie?.detail || m.detail || null,

    demande_en_cours: demandeOuverte
      ? { nature: demandeOuverte.nature, statut: demandeOuverte.statut_demande,
          motif: demandeOuverte.motif, date: demandeOuverte.date }
      : null,

    evenements,
  };
}

/** Les totaux d'une archive. Appelé par les deux routes, pour que les KPI se calculent pareil. */
export function totauxArchive(lignes) {
  const n = lignes.length;
  const partis = lignes.filter(l => l.parti).length;
  const jamaisPlaces = lignes.filter(l => l.jamais_place).length;
  const avecDuree = lignes.filter(l => l.duree_mois != null);

  /* LE DÉNOMINATEUR DE LA RÉTENTION EXCLUT LES JAMAIS PLACÉS. Ils n'ont pas quitté la
     formation : ils ne l'ont jamais commencée. Les y laisser faisait baisser le taux d'une
     commerciale pour des dossiers que l'onboarding n'avait pas traités. */
  const base = n - jamaisPlaces;
  return {
    total: n,
    en_formation: lignes.filter(l => l.statut === "en_formation").length,
    revenus: lignes.filter(l => l.revenu).length,
    partis,
    jamais_places: jamaisPlaces,
    transferts: lignes.reduce((s, l) => s + l.nb_transferts, 0),
    migrations: lignes.reduce((s, l) => s + l.nb_migrations, 0),
    changements_centre: lignes.reduce((s, l) => s + (l.nb_changements_centre || 0), 0),
    // 0/0 n'est pas 0 % : sans apprenant commencé, le taux n'a pas de sens.
    taux_retention: base > 0 ? Math.round(((base - partis) / base) * 100) : null,
    duree_moyenne_mois: avecDuree.length
      ? Math.round(avecDuree.reduce((s, l) => s + l.duree_mois, 0) / avecDuree.length) : null,
    ca_encaisse: lignes.reduce((s, l) => s + (l.montant_encaisse || 0), 0),
    reste_du: lignes.reduce((s, l) => s + Math.max(0, (l.montant_du || 0) - (l.montant_encaisse || 0)), 0),
  };
}
