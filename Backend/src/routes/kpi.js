import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { lireAudienceGA4, ga4Configure } from "../services/ga4.js";

const router = express.Router();

console.log("✅ Route KPI cockpit chargée");

/**
 * LE COCKPIT DE PILOTAGE — les indicateurs que le SI sait réellement calculer.
 *
 * POURQUOI CETTE ROUTE EXISTE. Le référentiel KPI compte 90 indicateurs ; un tiers
 * seulement dispose aujourd'hui d'une source alimentée. Publier les 90 ferait cohabiter
 * des chiffres justes et des chiffres vides sans que rien ne les distingue à l'écran -
 * et un tableau de bord auquel on cesse de croire ne sert plus à rien. Cette route ne
 * rend donc QUE les indicateurs dont la donnée existe, et chacun dit d'où il vient.
 *
 * TROIS PARTIS PRIS, qui valent d'être explicités :
 *
 *  1. LE CALCUL EST FAIT ICI, pas dans le navigateur. Le CA par canal croise 251
 *     versements, le délai d'onboarding 78 dossiers, les honoraires 20 séances : envoyer
 *     ces tables au client pour qu'il les additionne coûterait le même réseau à chaque
 *     ouverture d'écran, et ferait diverger le chiffre affiché de celui du futur PDF
 *     mensuel. Une seule définition, un seul endroit.
 *
 *  2. « AUCUNE DONNÉE » N'EST PAS « ZÉRO ». Un indicateur dont l'échantillon est vide
 *     rend `statut: "sans_donnee"` et non `valeur: 0`. Sans cette distinction, une table
 *     jamais alimentée s'affiche exactement comme une contre-performance.
 *
 *  3. CHAQUE TAUX PORTE SON EFFECTIF. Un délai moyen sur 9 dossiers et le même sur 900
 *     ne se pilotent pas pareil. `effectif` accompagne toujours `valeur`.
 *
 * LE FILTRE DES IMPORTS. 68 des 78 dossiers viennent d'une reprise de l'existant
 * (`source = "import_masse_onboarding"`), avec des dates de début antérieures à leur
 * création. Les inclure donne un délai d'onboarding de -56 jours ; les exclure donne
 * +0,6 jour sur 9 dossiers. Le paramètre `imports=1` permet de les réintégrer, mais le
 * défaut - les exclure - est le seul qui produise des chiffres lisibles.
 */

/* ── Outils ─────────────────────────────────────────────────────────────── */

const nb = (v) => Number(v) || 0;
const SOURCE_IMPORT = "import_masse_onboarding";

/** Le mois d'une date, au format `2026-09`. Sert de clé de série temporelle. */
const moisDe = (d) => (d ? String(d).slice(0, 7) : null);

/** Les N derniers mois, du plus ancien au plus récent - l'axe des séries. */
function derniersMois(n = 6) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Fabrique un indicateur normalisé.
 *
 * Le `statut` est déduit de la cible et du SENS de l'indicateur : un taux de churn de 3 %
 * est bon, un taux de présence de 3 % est catastrophique. Sans le sens, la couleur de la
 * pastille serait fausse une fois sur deux.
 */
function kpi({ code, libelle, valeur, unite = "", cible = null, sens = "haut",
               effectif = null, serie = [], source, detail = null, note = null }) {
  let statut = "info";
  if (valeur === null || valeur === undefined || effectif === 0) {
    statut = "sans_donnee";
  } else if (cible !== null) {
    const atteint = sens === "haut" ? valeur >= cible : valeur <= cible;
    // Une marge de 10 % avant de crier : un indicateur qui bascule au rouge pour un
    // dixième de point fait perdre confiance dans tous les autres.
    const marge = sens === "haut" ? valeur >= cible * 0.9 : valeur <= cible * 1.1;
    statut = atteint ? "atteint" : marge ? "surveiller" : "hors_cible";
  }

  /* La variation se lit sur la série : dernier mois complet contre le précédent. On ne
     compare PAS au mois en cours, forcément partiel - la baisse serait un artefact du
     calendrier, pas une information. */
  let variation = null;
  if (serie.length >= 3) {
    const [avant, apres] = [serie[serie.length - 3], serie[serie.length - 2]];
    if (avant?.v > 0) variation = Number((((apres.v - avant.v) / avant.v) * 100).toFixed(1));
  }

  return { code, libelle, valeur, unite, cible, sens, statut, effectif, serie, variation, source, detail, note };
}

/**
 * Charge une table entière malgré le plafond de 1 000 lignes de PostgREST.
 *
 * `page_views` dépasse déjà 2 200 lignes : une lecture simple en aurait silencieusement
 * ignoré la moitié, et le nombre de sessions affiché aurait été faux sans que rien ne
 * le signale - le pire des défauts pour un indicateur.
 */
async function toutesLesLignes(table, colonnes) {
  const PAGE = 1000;
  let out = [], de = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(colonnes).range(de, de + PAGE - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < PAGE) break;
    de += PAGE;
  }
  return out;
}

/** La médiane d'une série. */
const mediane = (xs) => {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};

/** Répartit des lignes par mois sur l'axe donné, en sommant `valeurDe`. */
function serieMensuelle(lignes, dateDe, valeurDe = () => 1, axe = derniersMois()) {
  const par = Object.fromEntries(axe.map((m) => [m, 0]));
  (lignes || []).forEach((l) => {
    const m = moisDe(dateDe(l));
    if (m && m in par) par[m] += nb(valeurDe(l));
  });
  return axe.map((m) => ({ mois: m, v: par[m] }));
}

/* ── GET /api/kpi/cockpit ───────────────────────────────────────────────── */

/* Le cockpit croise le chiffre d'affaires, la masse des honoraires et l'effectif : il
   relève du module `rapports`, que la matrice ouvre déjà en lecture aux rôles de pilotage.
   L'adosser à une permission plutôt qu'au seul `authenticateAdmin` fait que retirer les
   rapports à un rôle lui retire aussi le cockpit, sans toucher à ce fichier. */
router.get("/cockpit", authenticateAdmin, requirePermission("rapports", "read"), async (req, res) => {
  try {
    const avecImports = req.query.imports === "1";
    const axe = derniersMois(6);

    /* Un seul aller-retour par table, en parallèle. Le volume est modeste (quelques
       centaines de lignes) : filtrer côté serveur coûterait plus de requêtes que de
       tout charger une fois et d'agréger en mémoire. À revoir au-delà de ~50 000 lignes. */
    const [rA, rP, rGA, rG, rS, rTP, rN] = await Promise.all([
      supabase.from("assignations_parcours").select("id, source, statut, created_at, date_debut_formation, type_cours, type_coaching, montant_paye, statut_paiement, cycle_statut, premier_contact_at, converti_at, perdu_at"),
      supabase.from("paiements_parcours").select("id, montant_du, montant_recu, mode_paiement, statut, date_paiement, created_at"),
      supabase.from("groupes_apprenants").select("id, statut, date_ajout, date_retrait, groupe_id"),
      supabase.from("groupes").select("id, statut, capacite_max"),
      supabase.from("seances").select("id, date_seance, honoraire_montant, honoraire_statut, honoraire_valide_at, honoraire_paye_at, remplacement_id, coach_id"),
      supabase.from("paiements_touchpoint").select("id, montant, statut, created_at"),
      supabase.from("notifications").select("id, created_at", { count: "exact" }).limit(1),
    ]);

    /* Le cycle de vie peut ne pas être encore installé : on relit alors sans ses colonnes
       plutôt que de priver le cockpit de ses vingt-cinq autres indicateurs. */
    let cycleInstalle = true;
    if (rA.error && (rA.error.code === "42703" || rA.error.code === "PGRST204")) {
      cycleInstalle = false;
      Object.assign(rA, await supabase.from("assignations_parcours")
        .select("id, source, statut, created_at, date_debut_formation, type_cours, type_coaching, montant_paye, statut_paiement"));
    }

    const erreur = [rA, rP, rGA, rG, rS, rTP].find((r) => r.error);
    if (erreur) throw erreur.error;

    const tousDossiers = rA.data || [];
    const dossiers = avecImports ? tousDossiers : tousDossiers.filter((a) => a.source !== SOURCE_IMPORT);
    const nbImportes = tousDossiers.filter((a) => a.source === SOURCE_IMPORT).length;
    const paiements = rP.data || [];
    const rattachements = rGA.data || [];
    const seances = rS.data || [];
    const touchpoint = rTP.data || [];

    const indicateurs = [];

    /* ══ COMMERCIAL ═══════════════════════════════════════════════════════ */

    indicateurs.push(kpi({
      code: "COM-07", libelle: "Inscriptions",
      valeur: dossiers.length, unite: "dossiers", sens: "haut",
      effectif: dossiers.length,
      serie: serieMensuelle(dossiers, (a) => a.created_at, () => 1, axe),
      source: "assignations_parcours",
      note: avecImports ? null : `${nbImportes} dossiers importés exclus`,
    }));

    // Répartition par modalité : une part, pas un total - l'indicateur EST la distribution.
    const modalites = {};
    dossiers.forEach((a) => {
      const canal = a.type_cours === "en_ligne" ? "En ligne" : a.type_cours === "domicile" ? "À domicile" : "Présentiel";
      const type = a.type_coaching === "prive" ? "privé" : "groupe";
      const cle = `${canal} · ${type}`;
      modalites[cle] = (modalites[cle] || 0) + 1;
    });
    indicateurs.push(kpi({
      code: "COM-08", libelle: "Répartition par modalité",
      valeur: Object.keys(modalites).length ? dossiers.length : null,
      unite: "dossiers", effectif: dossiers.length,
      source: "assignations_parcours.type_cours × type_coaching",
      detail: Object.entries(modalites)
        .map(([k, v]) => ({ cle: k, v, part: dossiers.length ? Number(((v / dossiers.length) * 100).toFixed(1)) : 0 }))
        .sort((a, b) => b.v - a.v),
    }));

    // CA encaissé : on somme `montant_recu` et non `montant_du` - le dû n'est pas du CA.
    const encaisse = paiements.filter((p) => nb(p.montant_recu) > 0);
    const parCanal = {};
    encaisse.forEach((p) => {
      const c = p.mode_paiement || "Non précisé";
      parCanal[c] = (parCanal[c] || 0) + nb(p.montant_recu);
    });
    const totalCA = encaisse.reduce((s, p) => s + nb(p.montant_recu), 0);
    indicateurs.push(kpi({
      code: "COM-12", libelle: "CA encaissé",
      valeur: totalCA, unite: "FCFA", sens: "haut", effectif: encaisse.length,
      serie: serieMensuelle(encaisse, (p) => p.date_paiement || p.created_at, (p) => nb(p.montant_recu), axe),
      source: "paiements_parcours.montant_recu",
      detail: Object.entries(parCanal)
        .map(([k, v]) => ({ cle: k, v, part: totalCA ? Number(((v / totalCA) * 100).toFixed(1)) : 0 }))
        .sort((a, b) => b.v - a.v),
    }));

    const actifs = rattachements.filter((g) => g.statut === "actif");
    indicateurs.push(kpi({
      code: "COM-13", libelle: "Apprenants actifs",
      valeur: actifs.length, unite: "apprenants", sens: "haut", effectif: rattachements.length,
      serie: serieMensuelle(actifs, (g) => g.date_ajout, () => 1, axe),
      source: "groupes_apprenants.statut = actif",
    }));

    /* Churn : les départs du mois rapportés à l'effectif de début de mois. La formule du
       référentiel dit « apprenants actifs en début de mois » ; on l'approche par l'effectif
       actuel augmenté des départs, faute d'historique d'effectif. La note le dit. */
    const partis = rattachements.filter((g) => g.date_retrait || g.statut === "retire");
    const base = actifs.length + partis.length;
    indicateurs.push(kpi({
      code: "COM-14", libelle: "Taux de churn",
      valeur: base ? Number(((partis.length / base) * 100).toFixed(1)) : null,
      unite: "%", cible: 5, sens: "bas", effectif: base,
      serie: serieMensuelle(partis, (g) => g.date_retrait, () => 1, axe),
      source: "groupes_apprenants.date_retrait",
      note: "Effectif de référence approché : actifs + partis, faute d'historique d'effectif mensuel",
    }));

    // Durée de vie : mesurée sur les parcours TERMINÉS seuls. Inclure les actifs ferait
    // baisser artificiellement la moyenne à chaque nouvelle inscription.
    const durees = partis
      .filter((g) => g.date_ajout && g.date_retrait)
      .map((g) => (new Date(g.date_retrait) - new Date(g.date_ajout)) / (1000 * 3600 * 24 * 30.44));
    indicateurs.push(kpi({
      code: "COM-15", libelle: "Durée de vie client",
      valeur: durees.length ? Number((durees.reduce((s, x) => s + x, 0) / durees.length).toFixed(1)) : null,
      unite: "mois", cible: 6, sens: "haut", effectif: durees.length,
      source: "groupes_apprenants : date_ajout → date_retrait",
      note: "Calculée sur les parcours terminés uniquement",
    }));

    /* ══ CYCLE COMMERCIAL ═════════════════════════════════════════════════
       Ces huit indicateurs supposent qu'un dossier passe par des ÉTAPES. Tant que le
       cycle n'est pas installé - ou tant qu'aucun dossier ne l'a parcouru - ils rendent
       « aucune donnée » plutôt qu'un taux de 100 % mécanique, qui serait faux.
       Les dossiers repris en masse sont volontairement exclus : leur cycle a été rempli
       d'office à la migration, ils n'ont jamais été qualifiés par personne. */
    /* SANS SUITE : déduit, jamais écrit. Un prospect qui ne donne plus de nouvelles ne
       clique sur rien, et personne n'ira le marquer. On le considère donc sans suite après
       un délai d'inactivité — et, parce que rien n'est figé en base, un dossier dormant
       qui rappelle redevient vivant de lui-même. Un statut écrit aurait demandé un geste
       pour le défaire. */
    /* LE CYCLE NE PORTE QUE SUR LES DOSSIERS POSTÉRIEURS À SON INSTALLATION. Les dossiers
       antérieurs ont été marqués « converti » d'office par la migration — ils le sont
       réellement, mais aucun n'a de premier contact mesuré et aucun n'a jamais pu être
       perdu. Les compter donnerait 100 % de conversion à perpétuité et un taux de prise en
       charge d'un onzième : deux chiffres faux, dans les deux sens. Ils restent comptés
       dans COM-07 (inscriptions), d'où ils ne faussent rien. */
    const DEBUT_CYCLE = "2026-09-24"; // jour d'application de Backend/sql/cycle_vie_prospect.sql
    const auCycle = dossiers.filter((a) => a.created_at >= DEBUT_CYCLE);

    const JOURS_SANS_SUITE = 30;
    const limiteSansSuite = Date.now() - JOURS_SANS_SUITE * 864e5;
    const estSansSuite = (a) => a.cycle_statut !== "converti"
      && new Date(a.premier_contact_at || a.created_at).getTime() < limiteSansSuite;

    const suiviCycle = cycleInstalle ? auCycle : [];
    const prisEnCharge = suiviCycle.filter((a) => a.premier_contact_at);
    const convertis  = suiviCycle.filter((a) => a.cycle_statut === "converti" && a.converti_at);
    const depuisLe   = new Date(DEBUT_CYCLE).toLocaleDateString("fr-FR");
    const noteCycle  = !cycleInstalle
      ? "Cycle de vie non installé (Backend/sql/cycle_vie_prospect.sql)"
      : suiviCycle.length === 0 ? `Aucun dossier depuis l'installation du cycle le ${depuisLe}` : null;

    indicateurs.push(kpi({
      code: "COM-01", libelle: "Prospects pris en charge",
      valeur: suiviCycle.length ? prisEnCharge.length : null,
      unite: "prospects", sens: "haut", effectif: suiviCycle.length,
      serie: serieMensuelle(prisEnCharge, (a) => a.premier_contact_at, () => 1, axe),
      source: "assignations_parcours.premier_contact_at",
      note: noteCycle || `Pris en charge dès qu'une commerciale ouvre le dossier — aucun clic. Dossiers créés depuis le ${depuisLe}.`,
    }));

    /* `COM-02` (taux de qualification) A ÉTÉ RETIRÉ. Qualifier est un JUGEMENT — « son
       projet est sérieux, le budget tient » — qu'aucun système ne déduit d'une ouverture
       d'écran. Calculé sans ce jugement, il vaudrait mécaniquement le taux de prise en
       charge et ne dirait rien. Un indicateur creux à côté d'indicateurs justes les
       décrédibilise tous : mieux vaut son absence, annoncée. */

    /* Le délai de premier contact, en HEURES : la cible du référentiel est de 2 heures
       ouvrées. L'exprimer en jours rendrait tout écart invisible. */
    /* Les dossiers ACQUIS D'EMBLÉE sont écartés du délai : une inscription saisie au
       comptoir ou un paiement en ligne immédiat naissent déjà pris en charge, avec un
       délai nul par construction. Les laisser écraserait la médiane à zéro et masquerait
       le seul cas que cet indicateur doit surveiller : le prospect arrivé seul, que
       personne n'a encore rappelé. */
    const ACQUIS_DEMBLEE = ["inscription_directe", "site_public_paiement"];
    const delaisContact = suiviCycle
      .filter((a) => a.premier_contact_at && !ACQUIS_DEMBLEE.includes(a.source))
      .map((a) => (new Date(a.premier_contact_at) - new Date(a.created_at)) / (1000 * 3600));
    indicateurs.push(kpi({
      code: "COM-03", libelle: "Délai de prise en charge",
      valeur: delaisContact.length ? Number(mediane(delaisContact).toFixed(1)) : null,
      unite: "heures", cible: 2, sens: "bas", effectif: delaisContact.length,
      source: "created_at → premier_contact_at (médiane)",
      note: noteCycle || "Délai avant qu'une commerciale ouvre le dossier — non l'appel, que rien ne trace. Médiane, hors inscriptions directes et paiements immédiats (délai nul par nature).",
    }));

    const perdus = suiviCycle.filter((a) => a.cycle_statut === "perdu" || estSansSuite(a));
    indicateurs.push(kpi({
      code: "COM-05", libelle: "Conversion prospect → client",
      /* SANS le dénominateur « sans suite », ce taux ne compterait que des succès et
         vaudrait 100 % à perpétuité. C'est lui qui donne au chiffre un sens : sur les
         dossiers dont l'issue est connue, quelle part a signé. */
      valeur: suiviCycle.length ? Number(((convertis.length / (convertis.length + perdus.length || 1)) * 100).toFixed(1)) : null,
      unite: "%", cible: 30, sens: "haut", effectif: convertis.length + perdus.length,
      source: `convertis / (convertis + sans suite après ${JOURS_SANS_SUITE} j)`,
      note: noteCycle || `Sans suite : ${JOURS_SANS_SUITE} jours sans conversion ni activité. Déduit, jamais écrit en base.`,
    }));

    const delaisClosing = convertis
      .filter((a) => a.premier_contact_at)
      .map((a) => (new Date(a.converti_at) - new Date(a.premier_contact_at)) / (1000 * 3600 * 24));
    indicateurs.push(kpi({
      code: "COM-06", libelle: "Délai de closing",
      valeur: delaisClosing.length ? Number(mediane(delaisClosing).toFixed(1)) : null,
      unite: "jours", cible: 7, sens: "bas", effectif: delaisClosing.length,
      source: "premier_contact_at → converti_at (médiane)",
      note: noteCycle || "Mesuré depuis le premier contact réel, non depuis la création du dossier",
    }));

    /* ══ SITE WEB ═════════════════════════════════════════════════════════
       LE SI A SON PROPRE TRAÇAGE. `usePageTracking` alimente `page_views` depuis le site
       public - 2 200 pages, 471 sessions à ce jour. Le référentiel désignait GA4 comme
       source unique de ces indicateurs ; quatre d'entre eux se calculent en réalité sur
       nos propres données, sans dépendre d'un outil tiers. Restent hors d'atteinte ceux
       qui exigent le terminal (part mobile) ou l'origine externe (référencement) : le
       traceur n'enregistre ni user-agent, ni domaine référent. */
    const vues = await toutesLesLignes("page_views", "session_id, path, duration_ms, created_at");
    const parSession = {};
    vues.forEach((v) => { (parSession[v.session_id] = parSession[v.session_id] || []).push(v); });
    const sessions = Object.values(parSession);
    const debutSession = (s) => s.reduce((min, v) => (!min || v.created_at < min ? v.created_at : min), null);

    indicateurs.push(kpi({
      code: "WEB-01", libelle: "Sessions uniques",
      valeur: sessions.length, unite: "sessions", sens: "haut", effectif: vues.length,
      serie: serieMensuelle(sessions.map((s) => ({ d: debutSession(s) })), (x) => x.d, () => 1, axe),
      source: "page_views.session_id",
    }));

    // Rebond : une session d'une seule page. La définition du référentiel, appliquée telle quelle.
    const rebonds = sessions.filter((s) => s.length === 1).length;
    indicateurs.push(kpi({
      code: "WEB-02", libelle: "Taux de rebond",
      valeur: sessions.length ? Number(((rebonds / sessions.length) * 100).toFixed(1)) : null,
      unite: "%", cible: 50, sens: "bas", effectif: sessions.length,
      source: "page_views : sessions à une seule page",
    }));

    /* LA MÉDIANE, PAS LA MOYENNE. Un onglet laissé ouvert cinq jours porte la moyenne à
       20 555 secondes quand la médiane est de 135. Publier la moyenne serait publier un
       chiffre vrai et inexploitable ; la cible de 2 min 30 n'aurait plus aucun sens. */
    const dureesSession = sessions
      .map((s) => s.reduce((t, v) => t + nb(v.duration_ms), 0))
      .filter((d) => d > 0);
    indicateurs.push(kpi({
      code: "WEB-03", libelle: "Durée de session (médiane)",
      valeur: dureesSession.length ? Number((mediane(dureesSession) / 1000).toFixed(0)) : null,
      unite: "secondes", cible: 150, sens: "haut", effectif: dureesSession.length,
      source: "page_views.duration_ms — médiane",
      note: "Médiane et non moyenne : un onglet oublié fausse la moyenne d'un facteur 150",
    }));

    indicateurs.push(kpi({
      code: "WEB-04", libelle: "Pages par session",
      valeur: sessions.length ? Number((vues.length / sessions.length).toFixed(1)) : null,
      unite: "pages", cible: 3, sens: "haut", effectif: sessions.length,
      source: "page_views : pages / sessions",
    }));

    /* ── Ce que GA4 seul sait dire ────────────────────────────────────────
       Le terminal et la provenance ne sont enregistrés nulle part chez nous : le traceur
       interne ne retient ni user-agent ni domaine référent. Ces deux indicateurs ne
       peuvent donc venir que de GA4. Non configuré, ils s'affichent « en attente » plutôt
       que de faire échouer l'ensemble. */
    const audience = await lireAudienceGA4(30);

    indicateurs.push(kpi({
      code: "WEB-05", libelle: "Part du trafic mobile",
      valeur: audience?.part_mobile ?? null,
      unite: "%", cible: 60, sens: "haut", effectif: audience?.sessions ?? 0,
      source: "GA4 · deviceCategory (30 jours)",
      note: ga4Configure() ? null : "GA4 non configuré sur le serveur",
    }));

    indicateurs.push(kpi({
      code: "WEB-07", libelle: "Trafic organique",
      valeur: audience?.part_organique ?? null,
      unite: "%", cible: 40, sens: "haut", effectif: audience?.sessions ?? 0,
      source: "GA4 · sessionDefaultChannelGroup (30 jours)",
      detail: audience?.canaux
        ? Object.entries(audience.canaux).map(([k, v]) => ({
            cle: k, v,
            part: audience.sessions ? Number(((v / Object.values(audience.canaux).reduce((s, x) => s + x, 0)) * 100).toFixed(1)) : 0,
          })).sort((a, b) => b.v - a.v)
        : null,
      note: ga4Configure() ? null : "GA4 non configuré sur le serveur",
    }));

    /* Les visiteurs UNIQUES, que notre traceur ne sait pas distinguer : il compte des
       sessions. GA4 les déduplique par identifiant client - c'est la différence entre
       « 471 visites » et « 300 personnes ». */
    indicateurs.push(kpi({
      code: "WEB-01b", libelle: "Visiteurs uniques (GA4)",
      valeur: audience?.visiteurs_uniques ?? null,
      unite: "visiteurs", sens: "haut", effectif: audience?.sessions ?? 0,
      source: "GA4 · totalUsers (30 jours)",
      note: ga4Configure() ? "Dédupliqués par personne, là où le traçage interne compte des sessions" : "GA4 non configuré sur le serveur",
    }));

    const viaSite = tousDossiers.filter((a) => ["site_public_paiement", "formulaire_en_ligne"].includes(a.source));

    indicateurs.push(kpi({
      code: "WEB-09", libelle: "Leads générés par le site",
      valeur: viaSite.length, unite: "leads", sens: "haut", effectif: viaSite.length,
      serie: serieMensuelle(viaSite, (a) => a.created_at, () => 1, axe),
      source: "assignations_parcours.source (site public)",
    }));

    const viaSiteConvertis = viaSite.filter((a) => a.cycle_statut === "converti");
    indicateurs.push(kpi({
      code: "WEB-11", libelle: "Conversion lead → inscription",
      valeur: suiviCycle.length && viaSite.length
        ? Number(((viaSiteConvertis.length / viaSite.length) * 100).toFixed(1)) : null,
      unite: "%", cible: 25, sens: "haut", effectif: viaSite.length,
      source: "leads du site convertis / leads du site", note: noteCycle,
    }));

    /* Conversion du visiteur en dossier. Le référentiel la calcule sur les « visiteurs
       uniques » de GA4 ; on la calcule sur nos sessions, ce qui n'est pas identique - une
       même personne revenue trois fois compte trois fois. La note le dit plutôt que de
       laisser croire à une mesure de visiteurs. */
    indicateurs.push(kpi({
      code: "WEB-08", libelle: "Conversion visite → dossier",
      valeur: sessions.length ? Number(((viaSite.length / sessions.length) * 100).toFixed(2)) : null,
      unite: "%", cible: 3, sens: "haut", effectif: sessions.length,
      source: "assignations_parcours (site) / page_views.session_id",
      note: "Rapporté aux sessions, non aux visiteurs uniques : un même visiteur revenu compte plusieurs fois",
    }));
    indicateurs.push(kpi({
      code: "WEB-13", libelle: "Inscriptions via le site",
      valeur: viaSite.length, unite: "dossiers", sens: "haut", effectif: viaSite.length,
      serie: serieMensuelle(viaSite, (a) => a.created_at, () => 1, axe),
      source: "assignations_parcours.source",
    }));

    /* TouchPoint écrit « validé », avec l'accent : tester `paye`/`confirme` renvoyait 0 F
       alors que six transactions étaient bien passées. */
    const enLigneOk = touchpoint.filter((t) => String(t.statut || "").toLowerCase().startsWith("valid"));
    indicateurs.push(kpi({
      code: "WEB-18", libelle: "CA paiement en ligne",
      valeur: enLigneOk.reduce((s, t) => s + nb(t.montant), 0),
      unite: "FCFA", sens: "haut", effectif: touchpoint.length,
      serie: serieMensuelle(enLigneOk, (t) => t.created_at, (t) => nb(t.montant), axe),
      source: "paiements_touchpoint (statut validé)",
    }));

    indicateurs.push(kpi({
      code: "TECH-07", libelle: "Erreurs de paiement en ligne",
      valeur: touchpoint.length ? Number((((touchpoint.length - enLigneOk.length) / touchpoint.length) * 100).toFixed(1)) : null,
      unite: "%", cible: 1, sens: "bas", effectif: touchpoint.length,
      source: "paiements_touchpoint.statut",
    }));

    /* ══ PÉDAGOGIE ════════════════════════════════════════════════════════ */

    indicateurs.push(kpi({
      code: "PED-06", libelle: "Séances avec remplaçant",
      valeur: seances.length ? Number(((seances.filter((s) => s.remplacement_id).length / seances.length) * 100).toFixed(1)) : null,
      unite: "%", cible: 10, sens: "bas", effectif: seances.length,
      source: "seances.remplacement_id",
    }));

    /* ══ HONORAIRES — le circuit le mieux instrumenté du SI ═══════════════ */

    const avecMontant = seances.filter((s) => nb(s.honoraire_montant) > 0);
    const validees = seances.filter((s) => s.honoraire_valide_at);
    const payees = seances.filter((s) => s.honoraire_paye_at);
    const rejetees = seances.filter((s) => s.honoraire_statut === "rejete");

    /* Le délai de validation n'a de sens que pour une séance DÉJÀ TENUE. La base montre
       une validation en lot le 20 septembre couvrant des séances des 21, 22, 24 et 25 -
       donc encore à venir : les inclure donnait une moyenne NÉGATIVE (-0,9 jour), chiffre
       aussi vrai qu'ininterprétable. On ne retient que les séances passées, et on compte
       les validations anticipées à part : c'est une information de contrôle en soi. */
    const valideesPassees = validees.filter(
      (s) => s.date_seance && new Date(s.honoraire_valide_at) >= new Date(s.date_seance));
    const valideesAvance = validees.length - valideesPassees.length;
    const delaisValidation = valideesPassees
      .map((s) => (new Date(s.honoraire_valide_at) - new Date(s.date_seance)) / (1000 * 3600 * 24));
    indicateurs.push(kpi({
      code: "HON-01", libelle: "Délai de validation",
      valeur: delaisValidation.length ? Number((delaisValidation.reduce((s, x) => s + x, 0) / delaisValidation.length).toFixed(1)) : null,
      unite: "jours", cible: 3, sens: "bas", effectif: delaisValidation.length,
      source: "seances : date_seance → honoraire_valide_at (séances tenues)",
      note: valideesAvance > 0
        ? `${valideesAvance} séance${valideesAvance > 1 ? "s" : ""} validée${valideesAvance > 1 ? "s" : ""} avant d'avoir eu lieu — exclue${valideesAvance > 1 ? "s" : ""} du délai`
        : null,
    }));

    indicateurs.push(kpi({
      code: "HON-02", libelle: "Taux d'erreurs honoraires",
      valeur: seances.length ? Number(((rejetees.length / seances.length) * 100).toFixed(1)) : null,
      unite: "%", cible: 2, sens: "bas", effectif: seances.length,
      source: "seances.honoraire_statut = rejete",
    }));

    indicateurs.push(kpi({
      code: "HON-03", libelle: "Honoraires payés",
      valeur: validees.length ? Number(((payees.length / validees.length) * 100).toFixed(1)) : null,
      unite: "%", cible: 100, sens: "haut", effectif: validees.length,
      source: "seances.honoraire_paye_at / honoraire_valide_at",
      note: "Rapporté aux séances validées, seules réellement payables",
    }));

    indicateurs.push(kpi({
      code: "HON-04", libelle: "Masse honoraires",
      valeur: seances.reduce((s, x) => s + nb(x.honoraire_montant), 0),
      unite: "FCFA", sens: "haut", effectif: avecMontant.length,
      serie: serieMensuelle(seances, (s) => s.date_seance, (s) => nb(s.honoraire_montant), axe),
      source: "seances.honoraire_montant",
    }));

    indicateurs.push(kpi({
      code: "HON-05", libelle: "Coaches bloqués",
      valeur: new Set(rejetees.map((s) => s.coach_id).filter(Boolean)).size,
      unite: "coaches", cible: 0, sens: "bas", effectif: seances.length,
      source: "seances.honoraire_statut = rejete",
    }));

    const delaisComplets = payees
      .filter((s) => s.date_seance)
      .map((s) => (new Date(s.honoraire_paye_at) - new Date(s.date_seance)) / (1000 * 3600 * 24));
    indicateurs.push(kpi({
      code: "HON-06", libelle: "Délai séance → paiement",
      valeur: delaisComplets.length ? Number((delaisComplets.reduce((s, x) => s + x, 0) / delaisComplets.length).toFixed(1)) : null,
      unite: "jours", cible: 10, sens: "bas", effectif: delaisComplets.length,
      source: "seances : date_seance → honoraire_paye_at",
    }));

    /* ══ TECHNIQUE ════════════════════════════════════════════════════════ */

    indicateurs.push(kpi({
      code: "TECH-06", libelle: "Notifications émises",
      valeur: rN.count ?? null, unite: "notifications", sens: "haut", effectif: rN.count ?? 0,
      source: "notifications",
      note: "Le référentiel vise le taux d'envoi dans les délais ; seul le volume est traçable à ce jour",
    }));

    res.json({
      genere_le: new Date().toISOString(),
      axe,
      filtres: { imports_inclus: avecImports, dossiers_importes: nbImportes },
      ga4: { configure: ga4Configure(), donnees: !!audience },
      cycle: { installe: cycleInstalle, dossiers_suivis: suiviCycle.length },
      indicateurs,
      // Les indicateurs du référentiel qu'on ne rend PAS, et la raison. Les taire
      // laisserait croire que le cockpit couvre les 90.
      non_couverts: {
        total: 60,
        raisons: [
          { motif: "Périmètre non lancé : TLG PHARMA, aucun apprenant inscrit", nb: 22 },
          { motif: "Tables existantes mais jamais alimentées : présences, évaluations, devoirs, avis, tickets", nb: 25 },
          { motif: "Outil de mesure absent : PageSpeed, supervision, sauvegardes, audit RGPD", nb: 7 },
          { motif: "Instrumentés — se rempliront dès que GA4 aura son identifiant", nb: 4 },
          { motif: "Cahier de texte : table présente, aucune route ne l'écrit", nb: 1 },
          { motif: "Jugement humain, non déductible : qualification d'un lead (COM-02)", nb: 1 },
        ],
      },

    });
  } catch (err) {
    console.error("[kpi/cockpit]", err.message || err);
    res.status(500).json({ error: "Calcul des indicateurs impossible" });
  }
});

export default router;
