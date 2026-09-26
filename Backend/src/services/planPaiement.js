/**
 * Plan de paiement - pause et reprise sans arriérés.
 *
 * Le problème : un apprenant arrête en juillet et revient en décembre. Le cron quotidien
 * ne lit ni l'état de la classe ni celui de l'apprenant ; il continue donc de générer des
 * mensualités pour une période sans cours. Et suspendre ne suffit pas : sa boucle repart
 * du DERNIER mois du tableau, si bien qu'une simple réactivation rattrape tout le retard
 * d'un coup - cinq mois d'arriérés le jour même de la reprise.
 *
 * Deux mécanismes répondent à cela, et ils sont volontairement séparés :
 *
 *  • NEUTRALISER un mois - on met son `montant` à ce qui a déjà été versé dessus (0 dans
 *    le cas courant). On ne touche PAS à `statut`, qui est recalculé depuis les versements
 *    à trois endroits du front et serait donc écrasé. Conséquence heureuse : le cron
 *    existant ignore déjà ces mois, puisqu'il saute tout mois dont le payé couvre le dû
 *    (`0 >= 0`). La neutralisation est correcte avant même que le code de lecture soit
 *    déployé. Et l'argent déjà reçu reste visible : on solde le reliquat, on n'efface rien.
 *
 *  • REBASER à la reprise - les mois du creux restent dans le tableau (visibles, à 0), et
 *    le mois de reprise est ajouté APRÈS eux. La boucle du cron, qui regarde le dernier
 *    élément, trouve alors un mois dont l'échéance n'est pas passée et s'arrête aussitôt.
 *
 * Tout tient dans le JSONB `plan_paiement` : aucune migration, donc aucun ordre imposé
 * entre le déploiement et la base.
 */

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin",
                 "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

export const getMoisLabel = (periode) => {
  const [y, m] = String(periode).split("-");
  return `${MOIS_FR[parseInt(m, 10) - 1]} ${y}`;
};

const dernierJourDuMois = (annee, moisIndex0) => new Date(annee, moisIndex0 + 1, 0).getDate();

/**
 * Échéance réelle d'un mois. `echeance_override` l'emporte quand elle existe : une échéance
 * déplacée à la main doit valoir pour les rappels comme pour l'affichage - le cron
 * l'ignorait, et relançait donc sur la mauvaise date tout mois décalé.
 */
export const dateEcheanceMois = (periode, jourEcheance, echeanceOverride = null) => {
  if (echeanceOverride) {
    const d = new Date(echeanceOverride);
    if (!Number.isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); return d; }
  }
  const [y, m] = String(periode).split("-").map(Number);
  const jour = Math.min(jourEcheance || 1, dernierJourDuMois(y, m - 1));
  return new Date(y, m - 1, jour);
};

/** Somme des versements encaissés sur un mois - « paye » et « payé » cohabitent en base. */
export const totalPayeMois = (mois) => (mois?.tranches || [])
  .filter((t) => t.statut === "paye" || t.statut === "payé")
  .reduce((s, t) => s + (t.montant || 0), 0);

/** Un mois gelé par une pause : plus rien n'est dû dessus. */
export const estNeutralise = (mois) => !!mois?.neutralise;

const periodeSuivante = (periode) => {
  const d = new Date(`${periode}-01`);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const comparerPeriodes = (a, b) => String(a).localeCompare(String(b));

const nouveauMois = (periode, montant) => ({
  id: `m_${periode}`,
  periode,
  label: getMoisLabel(periode),
  montant,
  statut: "en_attente",
  tranches: [],
});

const trierMois = (mois) => [...mois].sort((a, b) => comparerPeriodes(a.periode, b.periode));

/** Période courante au format YYYY-MM. */
export const periodeDe = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/* ══════════════════════════════════════════════════════════════════
   SUSPENDRE
══════════════════════════════════════════════════════════════════ */

/**
 * Gèle la facturation à partir d'un mois donné.
 *
 * Les mois déjà soldés ne sont jamais touchés : ce qui a été payé pour des cours suivis
 * reste acquis. Seuls les mois non couverts passent à 0 - c'est là que se joue la promesse
 * « il n'a pas eu cours, il ne paie pas ».
 *
 * @returns {{ plan, moisNeutralises: string[], montantGele: number }}
 */
export function suspendrePlan(plan, {
  premierMoisNonFacture = periodeDe(),
  motif = null,
  detail = null,
  dateReprisePrevue = null,
  gaId = null,
  par = null,
} = {}) {
  if (!plan || typeof plan !== "object") return { plan, moisNeutralises: [], montantGele: 0 };

  // Le suffixe aléatoire n'est pas décoratif : deux suspensions créées dans la même
  // milliseconde - un apprenant mis en pause puis sa classe clôturée dans la foulée -
  // partageaient le même identifiant, si bien que refermer l'une refermait l'autre.
  const suspensionId = `susp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const moisNeutralises = [];
  let montantGele = 0;

  const mois = (plan.mois_paiements || []).map((m) => {
    if (comparerPeriodes(m.periode, premierMoisNonFacture) < 0) return m;
    if (estNeutralise(m)) return m;

    const paye = totalPayeMois(m);
    const du = (m.montant || 0) - paye;
    if (du <= 0) return m;  // déjà soldé : rien à geler

    moisNeutralises.push(m.periode);
    montantGele += du;
    return {
      ...m,
      // Le montant tombe à ce qui a déjà été versé : le reliquat disparaît sans effacer
      // l'argent reçu, et le mois devient mécaniquement « soldé » pour tous les lecteurs.
      montant: paye,
      montant_initial: m.montant_initial ?? m.montant,
      neutralise: { suspension_id: suspensionId, motif, le: new Date().toISOString(), par },
    };
  });

  const suspension = {
    id: suspensionId,
    debut: premierMoisNonFacture,
    fin: null,
    motif, detail,
    date_reprise_prevue: dateReprisePrevue,
    mois_neutralises: moisNeutralises,
    montant_gele: montantGele,
    ga_id: gaId,
    cree_par: par,
    cree_le: new Date().toISOString(),
  };

  return {
    plan: {
      ...plan,
      actif: false,                       // l'unique interrupteur que lit le cron
      mois_paiements: mois,
      suspensions: [...(plan.suspensions || []), suspension],
    },
    moisNeutralises,
    montantGele,
  };
}

/* ══════════════════════════════════════════════════════════════════
   REPRENDRE
══════════════════════════════════════════════════════════════════ */

/** La suspension encore ouverte, s'il y en a une. */
export const suspensionOuverte = (plan) =>
  (plan?.suspensions || []).find((s) => !s.fin) || null;

/**
 * Relance la facturation à partir du mois de reprise, sans rattraper le creux.
 *
 * L'ordre compte : on comble d'abord le trou avec des mois neutralisés (sinon l'historique
 * d'un plan ouvert serait muet sur la pause), on rend leur montant aux mois postérieurs à
 * la reprise, puis on garantit le mois de reprise lui-même. C'est lui qui devient le
 * dernier élément du tableau, et c'est ce qui empêche le cron de remonter le temps.
 *
 * @returns {{ plan, moisRepris: string, moisComble: string[], prolongation: number }}
 */
export function reprendrePlan(plan, { moisReprise = periodeDe(), par = null, dateReprise = null } = {}) {
  if (!plan || typeof plan !== "object") return { plan, moisRepris: moisReprise, moisComble: [], prolongation: 0 };

  // Sans pause en cours, il n'y a rien à reprendre - et surtout rien à fabriquer. Le
  // faire quand même ajoutait un mois à la mensualité du contrat, soit une dette créée
  // de toutes pièces par un simple clic sur « Rouvrir » (cas d'une classe clôturée avant
  // l'existence du gel, ou dont aucun mois n'était à geler).
  const suspension = suspensionOuverte(plan);
  if (!suspension) {
    return { plan: { ...plan, actif: true }, moisRepris: moisReprise, moisComble: [], prolongation: 0 };
  }

  let mois = [...(plan.mois_paiements || [])];
  const moisComble = [];

  // 1. Combler le trou - un plan ouvert n'a pas généré les mois de la pause, il faut les
  //    matérialiser pour que l'absence se lise dans l'échéancier plutôt que de disparaître.
  if (mois.length) {
    const dernier = trierMois(mois)[mois.length - 1];
    let p = periodeSuivante(dernier.periode);
    let garde = 0;
    while (comparerPeriodes(p, moisReprise) < 0 && garde < 60) {
      moisComble.push(p);
      mois.push({
        ...nouveauMois(p, 0),
        montant_initial: plan.mensualite || 0,
        neutralise: {
          suspension_id: suspension?.id || null,
          motif: suspension?.motif || null,
          le: new Date().toISOString(),
          par,
        },
      });
      p = periodeSuivante(p);
      garde++;
    }
  }

  // 2. Rendre leur montant aux mois postérieurs à la reprise - cas du plan borné, dont les
  //    douze mois étaient générés d'avance et ont tous été gelés à la pause.
  let nbDegeles = 0;
  mois = mois.map((m) => {
    if (!estNeutralise(m)) return m;
    if (comparerPeriodes(m.periode, moisReprise) < 0) return m;
    nbDegeles++;
    const { neutralise: _retire, montant_initial, ...reste } = m;
    return { ...reste, montant: montant_initial ?? m.montant };
  });

  // 3. Garantir le mois de reprise, à la mensualité du contrat d'origine.
  //
  //    L'échéance est ancrée sur la date réelle de reprise : sans cela, une reprise le 20
  //    avec une échéance au 5 ferait générer le mois suivant dès le lendemain. Le report
  //    vaut aussi pour un mois DÉJÀ présent - celui que le cron avait produit avant la
  //    pause porte une échéance passée, et la seule création du mois ne suffisait donc pas.
  const existant = mois.find((m) => m.periode === moisReprise);
  if (!existant) {
    const m = nouveauMois(moisReprise, plan.mensualite || 0);
    if (dateReprise) m.echeance_override = dateReprise;
    mois.push(m);
  } else if (dateReprise) {
    const echeanceActuelle = dateEcheanceMois(moisReprise, plan.jour_echeance, existant.echeance_override);
    const jourReprise = new Date(dateReprise); jourReprise.setHours(0, 0, 0, 0);
    if (echeanceActuelle < jourReprise) {
      mois = mois.map((m) => (m.periode === moisReprise ? { ...m, echeance_override: dateReprise } : m));
    }
  }

  // 4. Prolonger un plan borné du nombre de mois perdus - le client a acheté N mois de
  //    cours, il doit en recevoir N. Un plan ouvert n'a pas de fin à décaler.
  //
  //    La prolongation est ancrée sur la REPRISE, pas sur l'ancienne fin de contrat : un
  //    retour après le terme (arrêt en juillet, contrat clos en août, retour en décembre)
  //    produirait sinon une date de fin déjà passée, et un échéancier vide.
  //    Le décompte porte sur TOUTES les pauses refermées à l'instant, pas seulement la
  //    première : deux pauses cumulées font perdre la somme de leurs mois. Les listes sont
  //    disjointes (un gel saute les mois déjà neutralisés), mais on dédoublonne par
  //    sécurité pour ne jamais prolonger deux fois le même mois.
  const moisPerdus = [...new Set(
    (plan.suspensions || []).filter((s) => !s.fin).flatMap((s) => s.mois_neutralises || [])
  )].length;
  let prolongation = 0;
  if (plan.date_fin_formation && moisPerdus > 0) {
    prolongation = moisPerdus;
    let p = moisReprise;
    let derniere = moisReprise;
    for (let i = 0; i < moisPerdus; i++) {
      if (!mois.some((m) => m.periode === p)) mois.push(nouveauMois(p, plan.mensualite || 0));
      derniere = p;
      p = periodeSuivante(p);
    }
    const [fy, fm] = derniere.split("-").map(Number);
    const fin = new Date(fy, fm - 1, dernierJourDuMois(fy, fm - 1));
    plan = { ...plan, date_fin_formation: fin.toISOString().slice(0, 10) };
  }

  // 5. Refermer la suspension, puis rallumer - l'ordre importe : le plan doit être cohérent
  //    avant que le cron puisse le voir actif.
  // On referme TOUTES les pauses encore ouvertes, pas seulement celle qu'on a lue. Un
  // apprenant peut en cumuler deux (pause individuelle + clôture de sa classe) ; n'en
  // refermer qu'une laissait le dossier affiché « Cours suspendus » alors que sa
  // facturation avait bel et bien redémarré.
  const suspensions = (plan.suspensions || []).map((s) =>
    s.fin
      ? s
      : { ...s, fin: moisReprise, repris_le: new Date().toISOString(), repris_par: par, mois_degeles: nbDegeles });

  return {
    plan: { ...plan, actif: true, mois_paiements: trierMois(mois), suspensions },
    moisRepris: moisReprise,
    moisComble,
    prolongation,
  };
}
