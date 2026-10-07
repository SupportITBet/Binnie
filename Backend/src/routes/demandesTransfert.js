import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { notifyUsers } from "../services/notifyRole.js";
import { logAudit } from "../middlewares/logAudit.js";
import { libelleCanalPhrase, estCanal } from "../utils/canal.js";

const router = express.Router();

/**
 * DEMANDES DE TRANSFERT — un dossier qui traverse trois métiers.
 *
 * Le coach constate qu'un apprenant n'est plus à sa place et le signale. L'agent placement
 * test le fait passer et rend un niveau. L'onboarding, et lui seul, exécute le changement de
 * classe. Aucun des trois ne peut mener le dossier seul, et c'est ce passage de relais que
 * ces routes rendent visible - jusqu'ici il se faisait de vive voix, ou pas du tout.
 *
 * LE NIVEAU COMMANDE LA CLASSE CIBLE. D'où le verrou : tant que le test n'est pas revenu, la
 * réaffectation reste fermée. Réaffecter avant, ce serait replacer l'apprenant au jugé -
 * exactement ce que la demande cherchait à corriger.
 *
 * CE QUI SE REMPLIT TOUT SEUL. Le changement de classe passe ensuite par la route de
 * transfert existante, qui pose `statut = transfere`, `date_retrait` et le motif sur
 * l'ancienne inscription. L'archive du coach d'origine - le classeur « LEARNERS' PROFILE » -
 * en est dérivée : rien à écrire de plus ici.
 */

/* Les motifs, en liste fermée. Le texte libre vit dans `detail`.
   POURQUOI UNE LISTE : elle alimente la colonne REASON FOR STOPPING du classeur des coachs,
   qui doit rester dénombrable - en texte libre, « niveau trop bas » et « pas le bon niveau »
   deviennent deux motifs distincts. Et c'est elle qui dira, plus tard, quels motifs
   n'exigent pas de test de niveau. */
export const MOTIFS_TRANSFERT = {
  niveau_trop_eleve:  "Niveau de la classe trop élevé pour l'apprenant",
  niveau_trop_bas:    "Niveau de la classe trop bas pour l'apprenant",
  rythme_inadapte:    "Rythme de la classe inadapté",
  horaire:            "Horaires qui ne conviennent plus",
  relation_groupe:    "Difficulté d'intégration dans le groupe",
  autre:              "Autre (précisé par le coach)",
};

/* MIGRATION DE CANAL — en ligne ↔ présentiel. Un circuit distinct, parce que la question
   posée n'est pas la même : changer de canal n'est pas un problème de NIVEAU, c'est un
   passage de relais entre deux équipes. D'où une liste de motifs propre : les six ci-dessus
   parlent tous de niveau, de rythme ou de groupe, et aucun ne décrit un déménagement.
   Fermée elle aussi, pour rester dénombrable - c'est elle qui dira dans six mois pourquoi
   les gens changent de canal, là où un « autre » généralisé ne renseigne personne. */
export const MOTIFS_MIGRATION_CANAL = {
  demenagement:        "Déménagement ou éloignement du centre",
  horaires_centre:     "Horaires du centre incompatibles",
  preference_client:   "Préférence de l'apprenant ou de sa famille",
  contrainte_connexion:"Contrainte de connexion ou d'équipement",
  decision_commerciale:"Décision commerciale",
  autre:               "Autre (précisé en commentaire)",
};

/* TRANSFERT DE CENTRE À CENTRE — Angré → Yopougon. Troisième circuit, et troisième question :
   ni le NIVEAU (changement_groupe) ni le CANAL (changement_coaching) ne changent, seul le LIEU.
   Un apprenant déménage, change de travail, ou trouve les horaires d'un autre centre plus
   commodes. Aucun des motifs des deux autres listes ne décrit cela - « déménagement » existe
   bien côté canal, mais il y désigne un départ vers le en ligne, pas vers un autre centre. */
export const MOTIFS_CHANGEMENT_CENTRE = {
  demenagement:        "Déménagement",
  rapprochement:       "Rapprochement du domicile ou du lieu de travail",
  horaires_centre:     "Horaires de l'autre centre plus adaptés",
  preference_client:   "Préférence de l'apprenant ou de sa famille",
  places_disponibles:  "Pas de classe à son niveau dans ce centre",
  decision_commerciale:"Décision commerciale",
  autre:               "Autre (précisé en commentaire)",
};

/* Les trois types, nommés une fois. `changement_groupe` reste le défaut : c'est le circuit
   d'origine, et toute valeur inconnue doit y retomber plutôt que d'ouvrir un circuit que
   l'appelant n'a pas demandé. */
const TYPES_DEMANDE = ["changement_groupe", "changement_coaching", "changement_centre"];
const typeDemandeDe = (v) => (TYPES_DEMANDE.includes(v) ? v : "changement_groupe");

/** Les motifs valables pour un type de demande donné. */
const motifsDe = (typeDemande) =>
  typeDemande === "changement_coaching" ? MOTIFS_MIGRATION_CANAL
  : typeDemande === "changement_centre" ? MOTIFS_CHANGEMENT_CENTRE
  : MOTIFS_TRANSFERT;

/* LES DEUX CIRCUITS SANS TEST DE NIVEAU. Changer de canal ou changer de centre ne pose aucune
   question sur ce que l'apprenant sait faire : il garde son niveau, c'est l'endroit où il
   suit ses cours qui change. Les deux attendent donc l'ACCORD d'une équipe, pas le retour
   d'une information - d'où `en_attente_accord` et non `en_attente_test`.
   Nommé une fois : la distinction se décide à six endroits (statut initial, clôture,
   notifications, file, écrans), et la recopier à chaque fois garantissait l'oubli. */
const sansTestDeNiveau = (typeDemande) =>
  typeDemande === "changement_coaching" || typeDemande === "changement_centre";

/* `en_attente_accord` est le pendant de `en_attente_test` pour une migration de canal : le
   dossier attend qu'une PERSONNE accepte, et non qu'une information revienne. */
const STATUTS = ["en_attente_test", "test_fait", "en_attente_accord", "traitee", "refusee"];

/**
 * Le canal visé par une migration : l'opposé de celui d'où l'on part.
 *
 * DÉDUIT PLUTÔT QUE STOCKÉ. Une migration va d'un canal à l'autre par définition - inutile
 * d'ajouter une colonne que la base devrait apprendre, et qui pourrait contredire la classe
 * réellement choisie à l'arrivée. La vérité définitive reste le `type_cours` de la classe
 * d'arrivée, lu au moment de la clôture ; celui-ci ne sert qu'à router la demande vers la
 * bonne file avant qu'une classe soit choisie.
 */
const canalCibleDe = (canalSource) => (canalSource === "en_ligne" ? "presentiel" : "en_ligne");

/**
 * Qui a le droit d'EXÉCUTER une migration vers ce canal ?
 *
 * LA RÈGLE MÉTIER, POSÉE LE 03/10/2026 : pour le EN LIGNE, c'est toujours l'onboarding qui
 * assigne l'apprenant à sa nouvelle classe - jamais une assistante, même celle qui a reçu la
 * demande du client. Cela reprend exactement le partage déjà appliqué par
 * `commercialePeutReaffecter`, et c'est ce qui évite d'avoir à y ouvrir une exception : une
 * exception mal cadrée aurait rouvert le cloisonnement que tout le reste du circuit protège.
 *
 * Vers le PRÉSENTIEL, l'assistante du centre exécute - elle y est son propre onboarding - et
 * l'onboarding le peut aussi, comme sur le circuit existant.
 */
async function peutExecuterVers(canalCible, req) {
  if (canalCible === "en_ligne") {
    return ["onboarding", "admin_onboarding", "super_admin", "admin"].includes(req.role);
  }
  if (estCommerciale(req.role)) return await commercialePeutReaffecter(req.profil);
  return estOnboarding(req.role);
}

/* LES ASSISTANTES PRÉSENTIEL RÉAFFECTENT AUSSI. L'onboarding ne s'occupe que des classes en
   ligne ; en présentiel, c'est la commerciale qui affecte classe et coach. Réserver la
   réaffectation à l'onboarding aurait laissé tous les dossiers présentiel sans personne pour
   les traiter - le coach aurait émis sa demande dans le vide. */
const ROLES_ONBOARDING = ["onboarding", "admin_onboarding", "commercial", "admin_commercial", "super_admin", "admin"];
const ROLES_PLACEMENT  = ["placement_test", "admin_placement", "super_admin", "admin"];
const ROLES_COACH      = ["coach", "professeur_titulaire", "professeur_remplacant"];

const estOnboarding = (r) => ROLES_ONBOARDING.includes(r);
const estCommerciale = (r) => r === "commercial" || r === "admin_commercial";

/**
 * Cette commerciale peut-elle réaffecter ?
 *
 * SEULEMENT SI ELLE EST SUR LE PRÉSENTIEL. En présentiel, l'assistante est son propre
 * onboarding : c'est elle qui affecte classe et coach, personne d'autre ne le fera. En ligne,
 * ce travail revient à l'équipe onboarding - une assistante en ligne qui réaffecterait
 * doublerait leur décision sans qu'ils le sachent.
 *
 * Elle garde l'onglet en LECTURE : elle suit ses apprenants et doit savoir qu'un transfert est
 * demandé pour l'un d'eux. Voir n'est pas décider.
 */
async function canalDeLAssistante(profil) {
  if (!profil?.email) return null;
  const { data } = await supabase
    .from("assistantes").select("type_cours").ilike("email", profil.email).maybeSingle();
  return data?.type_cours || null;   // presentiel | en_ligne | les_deux | null
}

/** La fiche `assistantes` de la personne connectée, ou null si elle n'en a pas. */
async function assistanteDe(profil) {
  if (!profil?.email) return null;
  const { data } = await supabase
    // `centre_id` : c'est lui qui dit quels transferts de centre la concernent.
    .from("assistantes").select("id, type_cours, centre_id").ilike("email", profil.email).maybeSingle();
  return data || null;
}

async function commercialePeutReaffecter(profil) {
  const canal = await canalDeLAssistante(profil);
  // `type_cours` absent : on refuse. Un droit d'écriture ne s'accorde pas par défaut.
  return canal === "presentiel" || canal === "les_deux";
}
const estPlacement  = (r) => ROLES_PLACEMENT.includes(r);
const estCoach      = (r) => ROLES_COACH.includes(r);

/** La table peut ne pas exister encore : le SQL est livré à part. */
const tableAbsente = (e) => e?.code === "42P01" || /demandes_transfert/i.test(e?.message || "") && /does not exist/i.test(e?.message || "");

const nomDe = (p) => `${p?.prenom || ""} ${p?.nom || ""}`.trim() || "Un membre de l'équipe";

/**
 * APPLIQUER UN NOUVEAU TARIF AUX MOIS DÉJÀ ÉCRITS, quand on le demande explicitement.
 *
 * LA RÈGLE PAR DÉFAUT NE CHANGE PAS : `plan.mensualite` commande les mois À VENIR, et les mois
 * déjà dans le tableau gardent le montant figé à leur création. C'est ce qui protège le passé.
 * Mais elle laissait un angle mort : un apprenant transféré le 6 octobre gardait un mois
 * d'octobre NON PAYÉ au prix de son ancien centre. Ni tout à fait le passé, ni la suite.
 *
 * D'où cette option, décidée transfert par transfert plutôt que posée en règle générale - les
 * deux situations existent, et seule l'assistante qui traite le dossier sait laquelle elle a
 * sous les yeux.
 *
 * CE QU'ELLE NE TOUCHE JAMAIS, et c'est ce qui la rend sûre :
 *   · un mois ANTÉRIEUR au mois courant - c'est le passé, il est clos ;
 *   · un mois sur lequel UN VERSEMENT a déjà été reçu - il a commencé à être réglé à
 *     l'ancien prix, et le baisser créerait un trop-perçu fantôme, le monter une dette
 *     que le client n'a pas contractée ;
 *   · un mois NEUTRALISÉ par une pause - son montant à zéro est voulu, le réécrire
 *     ressusciterait une dette que la suspension avait justement effacée.
 *
 * @returns {{plan: object, reprices: number}} le plan modifié et le nombre de mois touchés.
 */
function appliquerTarifAuxMoisEcrits(plan, nouveauMontant) {
  const mois = Array.isArray(plan?.mois_paiements) ? plan.mois_paiements : [];
  if (!mois.length) return { plan, reprices: 0 };

  const d = new Date();
  const periodeCourante = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const totalPaye = (m) => (m.tranches || []).reduce((t, x) => t + (Number(x.montant) || 0), 0);

  let reprices = 0;
  const majs = mois.map(m => {
    if (!m?.periode || m.periode < periodeCourante) return m;
    if (m.neutralise) return m;
    if (totalPaye(m) > 0) return m;
    if (Number(m.montant) === Number(nouveauMontant)) return m;
    reprices++;
    return { ...m, montant: nouveauMontant };
  });
  return { plan: { ...plan, mois_paiements: majs }, reprices };
}

/**
 * LE DOSSIER COMMERCIAL D'UN APPRENANT, à partir de sa demande de transfert.
 *
 * POURQUOI CE N'EST PAS UNE SIMPLE ÉGALITÉ D'E-MAIL. `demandes_transfert.email_apprenant`
 * recopie `groupes_apprenants.email_apprenant`, qui est parfois un identifiant TECHNIQUE
 * fabriqué à l'inscription - `tel.0789800862.prenomnom@betacademy.app` pour quelqu'un sans
 * adresse propre. Le dossier, lui, porte l'e-mail réellement communiqué. Les deux ne se
 * rejoignent jamais, et la mise à jour partait alors sur ZÉRO ligne sans lever d'erreur :
 * le canal restait « en ligne », le tarif ne bougeait pas, et rien ne le disait.
 * Constaté le 04/10/2026 sur un dossier réel.
 *
 * `apprenant_id` aurait été le lien naturel : il existe des deux côtés, mais n'est renseigné
 * sur AUCUN des 88 dossiers. Inutilisable tant qu'une reprise de données ne l'aura pas posé.
 *
 * ON NE DEVINE JAMAIS PAR LE NOM. Deux dossiers « Coulibaly Naomie » coexistent avec des
 * e-mails différents : rapprocher par nom aurait modifié le tarif du mauvais apprenant. Un
 * critère n'est retenu que s'il désigne UN SEUL dossier - sinon on renonce et on le dit.
 *
 * @returns {Promise<object|null>} le dossier, ou null si rien de sûr ne le désigne.
 */
async function resoudreDossierDepuisDemande(demande) {
  const CHAMPS = "id, prospect_email, prospect_telephone, telephone_parent, plan_paiement";

  const unSeul = (lignes) => (lignes?.length === 1 ? lignes[0] : null);

  // 1. L'e-mail de la demande, puis celui de l'inscription - ils diffèrent parfois.
  const emails = [demande?.email_apprenant];
  let ga = null;
  if (demande?.ga_id) {
    const { data } = await supabase.from("groupes_apprenants")
      .select("email_apprenant, telephone").eq("id", demande.ga_id).maybeSingle();
    ga = data || null;
    if (ga?.email_apprenant) emails.push(ga.email_apprenant);
  }
  for (const e of [...new Set(emails.filter(Boolean))]) {
    const { data } = await supabase.from("assignations_parcours").select(CHAMPS).ilike("prospect_email", e);
    const trouve = unSeul(data);
    if (trouve) return trouve;
  }

  // 2. Le téléphone, comparé sur ses huit derniers chiffres : les indicatifs et les espaces
  //    varient d'une saisie à l'autre, le numéro lui-même non.
  const huit = (t) => String(t || "").replace(/\D/g, "").slice(-8);
  const tel = huit(ga?.telephone) || huit(String(demande?.email_apprenant || "").match(/tel\.(\d+)\./)?.[1]);
  if (tel.length === 8) {
    const { data } = await supabase.from("assignations_parcours").select(CHAMPS);
    const candidats = (data || []).filter(a => huit(a.prospect_telephone) === tel || huit(a.telephone_parent) === tel);
    const trouve = unSeul(candidats);
    if (trouve) return trouve;
  }

  return null;
}


/* ══════════════════════════════════════════════════════════════
   GET /api/demandes-transfert/:id/dossier — le plan de paiement rattaché
══════════════════════════════════════════════════════════════ */
/**
 * L'écran d'acceptation doit MONTRER la mensualité en cours avant d'en proposer une autre :
 * saisir un tarif sans voir l'ancien, c'est décider à l'aveugle.
 *
 * C'est le SERVEUR qui résout le dossier, et pas l'écran. Le rapprochement n'a rien d'évident
 * - l'e-mail de l'inscription est parfois un identifiant technique - et le refaire côté
 * navigateur aurait donné deux résolutions différentes pour la même question, dont une seule
 * juste. Celle-ci est exactement celle qu'emploiera l'écriture au moment de la clôture.
 */
router.get("/:id/dossier", authenticateAdmin, async (req, res) => {
  try {
    const { data: demande, error } = await supabase
      .from("demandes_transfert").select("*").eq("id", req.params.id).maybeSingle();
    if (error && tableAbsente(error)) return res.json({ plan: null, non_installe: true });
    if (!demande) return res.status(404).json({ error: "Demande introuvable" });

    const dossier = await resoudreDossierDepuisDemande(demande);
    if (!dossier) return res.json({ plan: null, dossier_introuvable: true });

    res.json({ assignation_id: dossier.id, plan: dossier.plan_paiement || null });
  } catch (e) {
    console.error("[demandes-transfert dossier]", e.message || e);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/demandes-transfert — le coach émet la demande
══════════════════════════════════════════════════════════════ */
router.post("/", authenticateAdmin, async (req, res) => {
  try {
    const { ga_id, motif, detail, type_demande } = req.body || {};
    if (!ga_id) return res.status(400).json({ error: "L'apprenant concerné est requis." });

    /* Le type fixe la liste de motifs recevable : une migration de canal ne se justifie pas
       par « niveau trop bas », et un changement de groupe pas par « déménagement ». Valider
       contre une seule liste laissait passer n'importe quel motif de l'autre circuit. */
    const typeDemande = typeDemandeDe(type_demande);
    if (!motif || !motifsDe(typeDemande)[motif]) {
      return res.status(400).json({ error: "Choisissez un motif dans la liste." });
    }

    /* UN TRANSFERT DE CENTRE SANS CENTRE D'ARRIVÉE N'EST PAS UNE DEMANDE. Contrairement au
       canal - qui n'a que deux valeurs, donc « l'autre » suffit à le désigner - il y a six
       centres : la destination est un CHOIX, et sans elle personne ne sait à qui montrer le
       dossier. On refuse donc ici, plutôt que de laisser une demande que la file n'adressera
       à aucune équipe et qui dormira indéfiniment. */
    let centreCible = null;
    if (req.body.centre_cible_id) {
      const { data: c } = await supabase
        .from("centres").select("id, nom").eq("id", req.body.centre_cible_id).maybeSingle();
      if (!c) return res.status(404).json({ error: "Centre d'arrivée introuvable." });
      centreCible = c;
    }
    if (typeDemande === "changement_centre" && !centreCible) {
      return res.status(400).json({ error: "Indiquez le centre d'arrivée." });
    }

    /* `note` EST DANS LE SELECT, et son absence n'était pas anodine : le bloc plus bas fait
       `JSON.parse(ga.note)` pour retrouver le dossier commercial par `assignation_id` - la
       seule clé fiable. Sans la colonne, la lecture rendait toujours `{}`, la résolution par
       dossier ne s'exécutait JAMAIS, et on retombait systématiquement sur le rapprochement par
       e-mail - celui-là même qui échoue quand l'inscription porte un identifiant technique
       (`tel.0789800862.nom@betacademy.app`). Résultat : `profil_type` n'était pas transmis, et
       le formulaire de test s'ouvrait sur « Particulier » pour un enfant. */
    const { data: ga } = await supabase
      .from("groupes_apprenants")
      .select("id, groupe_id, apprenant_id, nom_apprenant, prenom_apprenant, email_apprenant, niveau, statut, note")
      .eq("id", ga_id).maybeSingle();
    if (!ga) return res.status(404).json({ error: "Inscription introuvable." });
    /* L'INSCRIPTION DOIT ÊTRE VIVANTE. `transfere` était déjà refusé - l'apprenant a quitté
       cette classe pour une autre. `retire` ne l'était pas, et c'est pire : il a quitté BET,
       il n'y a aucune classe à lui faire quitter, et la demande aurait réveillé le placement
       test pour un test que personne ne ferait passer. Le cas devient atteignable maintenant
       que la commerciale et l'onboarding peuvent demander depuis une fiche, qui reste
       consultable après un arrêt de formation. */
    if (ga.statut === "transfere") {
      return res.status(409).json({ error: "Cet apprenant a déjà quitté cette classe." });
    }
    if (ga.statut === "retire") {
      return res.status(409).json({
        error: "Cet apprenant a arrêté sa formation : reprenez-la avant de demander un transfert.",
      });
    }

    const { data: groupe } = await supabase
      .from("groupes").select("id, nom, niveau, coach_id, type_cours, centre_id").eq("id", ga.groupe_id).maybeSingle();

    /* UN COACH NE DEMANDE QUE POUR SES PROPRES APPRENANTS. L'onboarding et le placement
       peuvent en émettre une aussi - ils voient des cas que le coach ne voit pas - mais
       personne ne doit pouvoir déplacer l'apprenant d'un collègue. */
    if (estCoach(req.role) && groupe?.coach_id !== req.profil.id) {
      return res.status(403).json({ error: "Cet apprenant n'est pas dans l'une de vos classes." });
    }

    // Une demande déjà ouverte sur la même inscription : on ne crée pas de doublon, la file
    // de l'onboarding se remplirait de dossiers identiques.
    const { data: dejaOuverte } = await supabase
      .from("demandes_transfert").select("id, statut")
      /* `en_attente_accord` MANQUAIT, et c'est ainsi qu'une migration pouvait être émise
         autant de fois qu'on cliquait : le garde ne la reconnaissait pas comme ouverte, et la
         file des deux équipes se remplissait de dossiers identiques - exactement ce que ce
         garde existe pour empêcher. Constaté en production le 03/10/2026. */
      .eq("ga_id", ga_id).in("statut", ["en_attente_test", "test_fait", "en_attente_accord"]).limit(1);
    if (dejaOuverte?.length) {
      return res.status(409).json({
        error: "Une demande est déjà en cours pour cet apprenant.",
        demande_id: dejaOuverte[0].id,
      });
    }

    const ligne = {
      ga_id,
      apprenant_id:     ga.apprenant_id || null,
      nom_apprenant:    ga.nom_apprenant || null,
      prenom_apprenant: ga.prenom_apprenant || null,
      email_apprenant:  ga.email_apprenant || null,
      groupe_id:        ga.groupe_id || null,
      groupe_nom:       groupe?.nom || null,
      /* LE NIVEAU DE L'APPRENANT, JAMAIS CELUI DE LA CLASSE.
         Cette ligne disait `ga.niveau || groupe?.niveau`, et c'est un faux ami : quand
         l'inscription n'a pas de niveau propre, elle recopiait le niveau du GROUPE — une
         propriété de la classe, pas de la personne. L'équipe qui recevait le dossier lisait
         donc « Niveau actuel : B1 » pour un apprenant évalué A2, et pouvait l'affecter à une
         classe trop difficile pour lui. Constaté le 07/10/2026 sur kouassi Jean : classe
         « Angklais A2 Matin » portant le niveau B1, apprenant testé A2.
         Le repli correct est le dossier commercial (`assignations_parcours.niveau_client`),
         qui porte le résultat du test de niveau — il est appliqué dans le bloc `dossier`
         plus bas, une fois le dossier résolu.
         ET SI AUCUN DES DEUX N'EXISTE, ON LAISSE null : « non évalué » est une information
         juste, « B1 » emprunté à la classe n'en est pas une. */
      niveau_actuel:    ga.niveau || null,
      // Le canal décide de l'équipe qui traitera : en ligne → onboarding, présentiel →
      // assistante du centre. Copié ici car la classe peut changer d'ici le traitement.
      type_cours:       groupe?.type_cours || null,
      /* LE TRAJET ENTRE CENTRES, FIGÉ ICI. La classe peut changer de centre ou être clôturée
         d'ici le traitement : recopiés à la création, le départ et l'arrivée restent lisibles
         des mois plus tard, dans la file comme dans l'archive. Le centre de départ est
         enregistré pour TOUTE demande présentiel, pas seulement pour un changement de centre :
         il coûte une colonne et répond à « d'où venait-il ? », qu'aucune trace ne disait. */
      centre_source_id: groupe?.centre_id || null,
      centre_cible_id:  centreCible?.id || null,
      coach_id:         groupe?.coach_id || null,
      coach_nom:        null,   // renseigné juste après
      type_demande:     typeDemande,
      motif,
      detail:           (detail || "").trim() || null,
      /* UNE MIGRATION DE CANAL NE PASSE PAS PAR LE TEST DE NIVEAU. L'apprenant garde le sien :
         ce qui change, c'est l'endroit où il suit ses cours, pas ce qu'il sait faire. Le
         dossier attend donc l'ACCORD de l'équipe qui va le recevoir, et non le retour d'une
         information. La valeur `changement_coaching` était acceptée ici depuis le début mais
         ne commandait rien : le dossier partait quand même en attente de test, et la clôture
         le réclamait. */
      statut:           sansTestDeNiveau(typeDemande) ? "en_attente_accord" : "en_attente_test",
      cree_par:         req.profil.id,
    };

    if (ligne.coach_id) {
      const { data: c } = await supabase.from("utilisateurs").select("nom, prenom").eq("id", ligne.coach_id).maybeSingle();
      ligne.coach_nom = c ? `${c.prenom || ""} ${c.nom || ""}`.trim() : null;
    }

    /* LE PROFIL DE L'APPRENANT, pour verrouiller le formulaire de test.
       C'est un transfert, pas une première inscription : le profil est déjà connu, et le
       laisser modifiable exposait à ce que l'apprenant le change par inadvertance - le
       formulaire s'ouvre sur « Particulier » présélectionné par défaut.
       On le cherche d'abord par le dossier posé dans `note` (lien direct et fiable), puis
       par e-mail. Si rien ne sort, on laisse `null` : un choix ouvert vaut mieux qu'une
       valeur figée à tort. */
    try {
      let assignationId = null;
      try { assignationId = JSON.parse(ga.note || "{}").assignation_id || null; } catch { /* note libre */ }
      let dossier = null;
      if (assignationId) {
        ({ data: dossier } = await supabase
          .from("assignations_parcours").select("profil_type, type_cours, assistante_id, niveau_client").eq("id", assignationId).maybeSingle());
      }
      if (!dossier && ligne.email_apprenant) {
        ({ data: dossier } = await supabase
          .from("assignations_parcours").select("profil_type, type_cours, assistante_id, niveau_client")
          .ilike("prospect_email", ligne.email_apprenant)
          .order("created_at", { ascending: false }).limit(1).maybeSingle());
      }
      if (dossier?.profil_type) ligne.profil_type = dossier.profil_type;

      /* LE NIVEAU DE L'APPRENANT, SUITE — voir le commentaire sur `niveau_actuel` plus haut.
         `niveau_client` est le résultat de son test de niveau, porté par le dossier commercial.
         Il ne sert QUE de repli : si l'inscription a son propre niveau, c'est lui qui fait foi,
         car il est réécrit après chaque nouveau test alors que `niveau_client` garde celui de
         l'entrée chez BET. */
      if (!ligne.niveau_actuel && dossier?.niveau_client) {
        ligne.niveau_actuel = dossier.niveau_client;
      }

      /* LE CANAL, QUAND LA CLASSE NE LE DIT PAS. `ligne.type_cours` vient du groupe, et un
         groupe de coaching PRIVÉ porte `prive` - un type de coaching, pas un endroit. Trois
         choses s'en déduisaient alors de travers : l'équipe à qui la demande est adressée,
         le canal d'arrivée annoncé (`canalCibleDe("prive")` rend « en ligne » quoi qu'il
         arrive, même pour quelqu'un qui y est déjà), et le canal réécrit sur le dossier à la
         clôture. Le dossier, lui, porte toujours un vrai canal : c'est lui qui tranche. */
      if (!estCanal(ligne.type_cours) && estCanal(dossier?.type_cours)) {
        ligne.type_cours = dossier.type_cours;
      }

      /* QUI LE SUIVAIT AVANT. `assignations_parcours.assistante_id` est VIVANT : une migration
         de canal comme un transfert de centre le remplacent à l'exécution, et la précédente ne
         survit alors nulle part. Elle ne se devinait qu'indirectement, par le crédit figé des
         paiements déjà encaissés - ce qui laisse sans mémoire les dossiers qui n'ont encore
         rien payé. Figée ici, sur TOUTE demande et pas seulement sur celles qui changent de
         propriétaire : elle ne coûte rien, et c'est précisément le genre de trace dont on
         découvre le besoin une fois qu'elle manque. */
      if (dossier?.assistante_id) ligne.assistante_source_id = dossier.assistante_id;
    } catch (e) {
      console.warn("[demandes-transfert POST] profil non résolu:", e.message);
    }

    /* UNE MIGRATION VERS LE PRÉSENTIEL DOIT DIRE DANS QUEL CENTRE. Elle part d'une classe en
       ligne, qui n'a pas de centre : sans destination, elle s'adressait à « l'équipe
       présentiel » en bloc, c'est-à-dire aux onze assistantes des six centres - dont dix que le
       dossier ne concerne pas. Avec le centre, elle est adressée comme un transfert de centre :
       à celles qui vont réellement accueillir l'apprenant.
       Exigé seulement DANS CE SENS : vers le en ligne, il n'y a pas de centre à choisir, c'est
       l'onboarding qui place l'apprenant.
       PLACÉ HORS DU `try` ci-dessus, dont le `catch` avale les erreurs : à l'intérieur, un
       échec de résolution du dossier aurait sauté la validation et laissé passer une demande
       sans destination - exactement ce qu'elle existe pour empêcher. Et après lui, car
       `ligne.type_cours` peut y être corrigé depuis le dossier. */
    if (typeDemande === "changement_coaching"
        && canalCibleDe(ligne.type_cours) === "presentiel" && !centreCible) {
      return res.status(400).json({
        error: "Indiquez le centre qui accueillera l'apprenant : sans lui, la demande "
             + "s'adresserait à tous les centres à la fois.",
      });
    }

    let { data: demande, error } = await supabase
      .from("demandes_transfert").insert(ligne).select().single();

    /* ── UNE BASE QUI N'A PAS TOUTES LES COLONNES ────────────────────────────────────────
       Cinq colonnes ont été ajoutées après coup, par trois migrations successives. Sur une
       base où l'une d'elles manque, on crée la demande sans elle plutôt que de la refuser :
       le formulaire de test reste modifiable, la file n'est pas cloisonnée - l'ancien
       comportement, dégradé mais vivant.

       ON NE RETIRE QUE CELLE QUI MANQUE, UNE PAR UNE. Le repli les enlevait TOUTES d'un coup,
       et c'est ce qui a cassé le premier transfert de centre réel le 06/10/2026 : la base
       n'avait pas encore `assistante_source_id`, le repli a donc aussi effacé
       `centre_cible_id` - la destination - et la demande est partie sans adresse. Elle n'est
       apparue dans la file de personne, alors que la notification, elle, était bien partie.
       Le garde-fou 503 ci-dessous n'avait rien vu : il ne surveillait que les deux colonnes
       de centre, et l'erreur portait sur une troisième.

       PostgREST nomme la colonne fautive dans son message ; on la retire et on retente. */
    const COLONNES_RECENTES = ["profil_type", "type_cours", "centre_cible_id",
                               "centre_source_id", "assistante_source_id"];
    const retirees = [];
    let essais = 0;
    while (error && essais < COLONNES_RECENTES.length) {
      const manquante = COLONNES_RECENTES.find(
        c => !retirees.includes(c) && new RegExp(c).test(error.message || ""));
      if (!manquante) break;
      retirees.push(manquante);
      const reste = { ...ligne };
      retirees.forEach(c => delete reste[c]);
      ({ data: demande, error } = await supabase
        .from("demandes_transfert").insert(reste).select().single());
      essais++;
    }

    /* UN CHANGEMENT DE CENTRE SANS SA DESTINATION N'EST PAS UNE DEMANDE : la file ne
       l'adresserait à personne et il dormirait indéfiniment. On refuse donc, en nommant le
       fichier SQL à jouer - et on le vérifie APRÈS les tentatives, sur ce qui a réellement
       été retiré, et non sur le texte d'une erreur qui peut porter sur une autre colonne. */
    if (typeDemande === "changement_centre" && retirees.includes("centre_cible_id")) {
      if (demande?.id) await supabase.from("demandes_transfert").delete().eq("id", demande.id);
      return res.status(503).json({
        error: "Le transfert de centre à centre n'est pas encore activé sur cette base : "
             + "rejouez Backend/sql/demandes_transfert_centre_cible.sql (il ajoute trois colonnes).",
      });
    }

    if (error) {
      if (tableAbsente(error)) {
        return res.status(503).json({ error: "Les demandes de transfert ne sont pas encore activées sur cette base (Backend/sql/demandes_transfert.sql)." });
      }
      throw error;
    }

    /* PRÉVENIR LES DEUX MÉTIERS D'UN COUP. Le placement test parce que c'est lui qui fait
       avancer le dossier, l'onboarding pour qu'il le voie arriver. Ne prévenir que l'un des
       deux immobiliserait le dossier chez celui qui n'attend rien. */
    (async () => {
      try {
        const { data: destinataires } = await supabase
          .from("utilisateurs").select("id, role")
          .in("role", [...new Set([...ROLES_ONBOARDING, ...ROLES_PLACEMENT])].filter(r => r !== "super_admin" && r !== "admin"))
          .eq("actif", true);
        const apprenant = `${ligne.prenom_apprenant || ""} ${ligne.nom_apprenant || ""}`.trim() || "Un apprenant";
        /* ON NE SE NOTIFIE PAS SOI-MÊME. La demande peut désormais être émise par l'onboarding
           ou par une commerciale, qui sont tous deux dans la liste des destinataires : sans ce
           filtre, celle qui vient de cliquer reçoit une cloche lui annonçant sa propre
           demande - du bruit qui apprend à ignorer les vraies. */
        const sauf = (ids) => ids.filter(id => String(id) !== String(req.profil.id));
        const pourPlacement = sauf((destinataires || []).filter(u => estPlacement(u.role)).map(u => u.id));
        const pourOnboarding = sauf((destinataires || []).filter(u => estOnboarding(u.role)).map(u => u.id));

        /* LE LIBELLÉ VIENT DE LA BONNE LISTE. `MOTIFS_TRANSFERT[motif]` rendait `undefined`
           sur une migration, dont les motifs vivent dans leur propre liste : les cloches
           annonçaient « Motif : undefined ». */
        const motifLisible = motifsDe(typeDemande)[motif] || motif;
        const migration = typeDemande === "changement_coaching";
        const changementCentre = typeDemande === "changement_centre";

        /* ON NE RÉVEILLE PAS LE PLACEMENT TEST POUR UNE MIGRATION NI POUR UN CHANGEMENT DE
           CENTRE. Ni l'un ni l'autre ne demande de test : l'annoncer lui créerait du travail
           inexistant, puis le laisserait attendre un dossier qui ne lui reviendrait jamais. */
        if (pourPlacement.length && !sansTestDeNiveau(typeDemande)) {
          await notifyUsers(pourPlacement, {
            type:  "demande_transfert",
            titre: `🧪 Test de niveau à faire passer — ${apprenant}`,
            message: `${nomDe(req.profil)} demande le transfert de ${apprenant} (${ligne.groupe_nom || "classe"}). `
                   + `Motif : ${motifLisible}. Le dossier attend votre test de niveau pour avancer.`,
            meta: { demande_id: demande.id, ga_id },
          });
        }
        /* ── LE CENTRE D'ARRIVÉE, ET LUI SEUL ──────────────────────────────────────────────
           Un transfert de centre n'intéresse pas les six centres : il intéresse celui qui va
           recevoir l'apprenant, parce que c'est lui qui doit accepter et lui trouver une
           classe. Prévenir les onze assistantes présentiel noierait la vraie destinataire
           parmi dix personnes que le dossier ne concerne pas - et c'est précisément ce que
           ferait le bloc générique ci-dessous, dont la file ne connaît que le canal.
           On adresse donc nommément les assistantes du centre cible, et on ajoute le
           pilotage, qui suit tous les mouvements d'apprenants. */
        if (changementCentre && centreCible) {
          const { data: assCible } = await supabase
            .from("assistantes").select("email").eq("centre_id", centreCible.id).eq("actif", true);
          const emails = (assCible || []).map(a => a.email).filter(Boolean);
          const dest = new Set();
          if (emails.length) {
            const { data: us } = await supabase
              .from("utilisateurs").select("id, email").in("email", emails).eq("actif", true);
            (us || []).forEach(u => { if (String(u.id) !== String(req.profil.id)) dest.add(u.id); });
          }
          const { data: pilotes } = await supabase
            .from("utilisateurs").select("id")
            .in("role", ["pedagogical_advisor", "admin", "super_admin"]).eq("actif", true);
          (pilotes || []).forEach(u => { if (String(u.id) !== String(req.profil.id)) dest.add(u.id); });

          if (dest.size) {
            await notifyUsers([...dest], {
              type:  "demande_transfert",
              titre: `🏢 Transfert de centre à valider — ${apprenant}`,
              message: `${nomDe(req.profil)} demande le transfert de ${apprenant} `
                     + `(${ligne.groupe_nom || "classe"}) vers ${centreCible.nom}. Motif : ${motifLisible}. `
                     + `Aucun test de niveau n'est requis : le dossier attend l'accord de votre centre, `
                     + `puis l'affectation à une classe.`,
              meta: { demande_id: demande.id, ga_id, centre_cible_id: centreCible.id },
            });
          }
        }

        /* Le bloc générique ne concerne PAS le changement de centre : il s'adresse à
           l'onboarding et aux commerciales sans distinction de centre, alors que la demande
           vient d'être adressée nommément au centre d'arrivée juste au-dessus. */
        if (pourOnboarding.length && !changementCentre) {
          /* Et le message dit la vérité du circuit emprunté : une migration attend un ACCORD,
             pas un test. Annoncer « dès que le test sera passé » aurait fait attendre une
             étape qui n'arrive jamais. */
          const canalCible = canalCibleDe(ligne.type_cours);
          await notifyUsers(pourOnboarding, {
            type:  "demande_transfert",
            titre: migration
              ? `🔀 Migration à valider — ${apprenant}`
              : `🔄 Nouveau dossier à réaffecter — ${apprenant}`,
            message: migration
              ? `${nomDe(req.profil)} demande le passage de ${apprenant} (${ligne.groupe_nom || "classe"}) `
                + `vers le ${canalCible === "en_ligne" ? "en ligne" : "présentiel"}. Motif : ${motifLisible}. `
                + `Aucun test de niveau n'est requis : le dossier attend l'accord de l'équipe qui recevra l'apprenant.`
              : `${nomDe(req.profil)} demande le transfert de ${apprenant} (${ligne.groupe_nom || "classe"}). `
                + `Motif : ${motifLisible}. La réaffectation sera possible dès que le test de niveau sera passé.`,
            meta: { demande_id: demande.id, ga_id },
          });
        }
      } catch (e) {
        console.warn("[demandes-transfert POST] notification:", e.message);
      }
    })();

    logAudit({
      acteur_id: req.profil.id, acteur_nom: nomDe(req.profil), acteur_email: req.profil.email,
      acteur_role: req.role, action_type: "creation", module: "inscriptions",
      entite_type: "demande_transfert", entite_id: demande.id,
      detail: `Demande de transfert de ${ligne.prenom_apprenant || ""} ${ligne.nom_apprenant || ""} — ${motifsDe(typeDemande)[motif]}`,
    }).catch(() => {});

    res.status(201).json({ demande });
  } catch (err) {
    console.error("[demandes-transfert POST]", err.message || err);
    res.status(500).json({ error: "Demande impossible à enregistrer" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/demandes-transfert — la file de travail
══════════════════════════════════════════════════════════════ */
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    let q = supabase.from("demandes_transfert").select("*").order("created_at", { ascending: false });

    if (req.query.statut && STATUTS.includes(req.query.statut)) q = q.eq("statut", req.query.statut);

    /* CHACUN SA FILE. Les classes EN LIGNE relèvent de l'équipe onboarding, le PRÉSENTIEL de
       l'assistante du centre qui y est son propre onboarding. Sans ce partage, les deux
       voyaient les mêmes dossiers et pouvaient traiter celui de l'autre - deux équipes se
       marchant dessus sur les mêmes apprenants, sans le savoir.
       Le placement test, lui, teste TOUT LE MONDE : sa file reste entière.
       `type_cours` nul = demande créée avant cette colonne : montrée aux deux plutôt que
       cachée à tous, un dossier invisible étant pire qu'un dossier vu par le mauvais métier.

       L'HYBRIDE APPARAÎT DANS LES DEUX FILES, et il le faut : une classe hybride se donne au
       centre ET en ligne, les deux équipes la suivent. La demande recopie le `type_cours` de
       la classe (voir plus haut), donc une classe hybride produit une demande « hybride » :
       sans cette liste, le filtre `= en_ligne` l'aurait rendue invisible à l'onboarding comme
       à l'assistante en ligne, et seule la présentiel l'aurait vue - l'inverse du partage
       voulu. Côté présentiel, `neq.en_ligne` la laisse déjà passer.
       QUI VOIT N'EST PAS QUI AGIT : `commercialePeutReaffecter` est inchangé, l'assistante en
       ligne suit ses dossiers sans les réaffecter - c'est l'onboarding qui affecte la classe. */
    const CANAUX_EN_LIGNE = "en_ligne,hybride";
    /* UNE MIGRATION DE CANAL APPARAÎT DANS LES DEUX FILES, et c'est tout son principe : elle
       traverse la frontière entre les deux équipes, donc aucune des deux ne doit la découvrir
       après coup. Celle qui émet suit l'avancement, celle qui reçoit accepte et exécute.
       Sans cette clause, une demande partie du présentiel vers le en ligne serait restée
       invisible à l'onboarding - c'est-à-dire à la seule équipe qui peut la traiter. */
    const MIGRATIONS = "type_demande.eq.changement_coaching";
    if (estCommerciale(req.role)) {
      /* Le canal de l'assistante, pas une règle unique : celle du présentiel traite ses
         dossiers, celle du en ligne suit les siens sans pouvoir agir. Lui montrer la file de
         l'autre lui donnerait du travail qui n'est pas le sien - et lui cacherait le sien. */
      const canal = await canalDeLAssistante(req.profil);
      if (canal === "presentiel")     q = q.or(`type_cours.neq.en_ligne,type_cours.is.null,${MIGRATIONS}`);
      else if (canal === "en_ligne")  q = q.or(`type_cours.in.(${CANAUX_EN_LIGNE}),type_cours.is.null,${MIGRATIONS}`);
      // `les_deux` ou canal inconnu : on ne filtre pas, elle suit les deux périmètres.
    } else if (req.role === "onboarding" || req.role === "admin_onboarding") {
      q = q.or(`type_cours.in.(${CANAUX_EN_LIGNE}),type_cours.is.null,${MIGRATIONS}`);
    }
    // Un coach ne voit QUE les demandes de ses propres classes : celles des collègues ne le
    // regardent pas, et son écran n'a pas à lui montrer des dossiers sur lesquels il ne peut rien.
    if (estCoach(req.role)) q = q.eq("coach_id", req.profil.id);

    let { data, error } = await q;

    /* ── CHACUNE SES APPRENANTS ────────────────────────────────────────────────────────────
       La requête ci-dessus ne filtre que par CANAL. Conséquence constatée en production le
       06/10/2026 : l'assistante de BET II Plateaux voyait les deux dossiers d'Angré, une
       classe qui n'est pas la sienne, dans une ville où elle n'a aucun apprenant. Onze
       assistantes lisaient la même liste, et chacune pouvait traiter le dossier d'une autre.

       LE PÉRIMÈTRE EST CELUI DU DOSSIER, et c'est déjà la règle partout ailleurs : ses
       prospects, ses apprenants, ses paiements et son archive sont bornés par
       `assignations_parcours.assistante_id`, ses classes par celles qu'elle a créées ou qui
       contiennent ses apprenants. La file de transfert était la seule à l'ignorer, et c'est
       pour cela qu'elle fuyait. Borner au CENTRE aurait déjà réduit de onze à deux, mais deux
       reste une de trop : une collègue du même centre qui ne suit pas cet apprenant n'a pas à
       arbitrer son transfert.

       LE TRI SE FAIT ICI et non dans la requête : il demande de remonter de la demande à
       l'inscription puis au dossier, ce que les `or()` de PostgREST ne savent pas exprimer.

       LE PILOTAGE VOIT TOUT : PA, admin et super admin ne suivent aucun apprenant en propre et
       doivent suivre tous les mouvements. */
    if (!error && Array.isArray(data) && estCommerciale(req.role)) {
      const monAssistante = await assistanteDe(req.profil);
      const monCentre = monAssistante?.centre_id || null;

      if (monAssistante?.id) {
        /* À QUI APPARTIENT CHAQUE DOSSIER. Le lien passe par `note.assignation_id` de
           l'inscription - renseigné sur 91/91 - et jamais par l'e-mail, qui peut être un
           identifiant technique sans correspondance. Deux lectures groupées plutôt qu'une par
           demande : la file en contient peu, mais elle se recharge toutes les minutes. */
        const idsGa = [...new Set(data.map(d => d.ga_id).filter(Boolean))];
        const { data: gaRows } = idsGa.length
          ? await supabase.from("groupes_apprenants").select("id, note").in("id", idsGa)
          : { data: [] };
        const assignationDuGa = {};
        for (const g of (gaRows || [])) {
          try { assignationDuGa[g.id] = JSON.parse(g.note || "{}").assignation_id || null; }
          catch { assignationDuGa[g.id] = null; }
        }
        const idsDossiers = [...new Set(Object.values(assignationDuGa).filter(Boolean))];
        const { data: dossiers } = idsDossiers.length
          ? await supabase.from("assignations_parcours").select("id, assistante_id").in("id", idsDossiers)
          : { data: [] };
        const proprietaire = Object.fromEntries((dossiers || []).map(d => [d.id, d.assistante_id]));

        data = data.filter(d => {
          const aid = assignationDuGa[d.ga_id] || null;
          const proprio = aid ? proprietaire[aid] : null;

          // Son apprenant : elle le suit, elle le voit.
          if (proprio && String(proprio) === String(monAssistante.id)) return true;

          /* L'EXCEPTION, ET LA SEULE : un transfert qui ARRIVE dans son centre. L'apprenant
             appartient encore à l'assistante du centre de départ - c'est tout l'objet du
             circuit, elle doit l'accepter avant qu'il devienne le sien. Sans cette ligne, une
             demande Angré → Yopougon ne serait visible de personne à Yopougon. */
          if (monCentre && d.centre_cible_id && String(d.centre_cible_id) === String(monCentre)) return true;

          /* DOSSIER NON RÉSOLU = VISIBLE. Une inscription sans `assignation_id` exploitable
             n'appartient à personne de façon lisible : la cacher à tous la ferait attendre
             indéfiniment, alors qu'un dossier vu par quelqu'un qui n'en fera rien se corrige
             d'un coup d'œil. */
          return !proprio;
        });
      }
    }

    /* La colonne `type_cours` est livrée à part : sur une base non migrée, la filtrer ferait
       échouer la requête et viderait l'onglet ENTIER - pas seulement le cloisonnement. On
       rejoue alors sans le partage par canal : chacun revoit tous les dossiers, comme avant.
       Une file trop large se corrige d'un coup d'œil ; une file vide passe pour une panne. */
    if (error && /type_cours/.test(error.message || "")) {
      let sansCanal = supabase.from("demandes_transfert").select("*").order("created_at", { ascending: false });
      if (req.query.statut && STATUTS.includes(req.query.statut)) sansCanal = sansCanal.eq("statut", req.query.statut);
      if (estCoach(req.role)) sansCanal = sansCanal.eq("coach_id", req.profil.id);
      ({ data, error } = await sansCanal);
    }

    if (error) {
      if (tableAbsente(error)) return res.json({ demandes: [], non_installe: true });
      throw error;
    }

    /* ══ À QUI CE DOSSIER DEMANDE-T-IL QUELQUE CHOSE ? ══════════════════════════════════
       Chaque demande part avec un drapeau `a_traiter_par_moi`, et c'est lui qui alimente le
       badge de l'onglet « Dossiers à réaffecter ».

       POURQUOI ICI ET NON DANS L'ÉCRAN. Les règles d'autorité sont déjà toutes sur le serveur
       (`je_peux_reaffecter`, `je_peux_executer_vers`, `mon_centre`). Les recopier dans le hook
       du badge aurait fait une deuxième version de la même règle, à tenir à jour en double —
       et c'est exactement par là que le badge a commencé à mentir : il ne comptait que
       `test_fait`, donc un transfert de centre, qui attend en `en_attente_accord`, n'y
       apparaissait jamais. L'assistante du centre d'accueil recevait le dossier sans aucun
       compteur pour le lui dire.

       VOIR N'EST PAS AGIR, et le drapeau porte cette différence. Un dossier
       `en_attente_accord` est visible des DEUX côtés : celle qui l'émet en suit l'avancement,
       celle qui reçoit doit l'accepter. Badger les deux rendrait le compteur inutile pour
       l'émettrice — « il y a quelque chose » au lieu de « à vous de jouer ».

       LES TROIS CAS, dans le même ordre que les boutons de l'écran :
         · `en_attente_test`   → le placement test, et lui seul ;
         · `test_fait`         → celui qui réaffecte, selon le canal d'arrivée ;
         · `en_attente_accord` → le centre d'ACCUEIL pour un transfert de centre, le canal
                                 d'arrivée pour une migration.
       Tout le reste (traitée, refusée) n'attend plus personne. */
    const peutVers = {
      en_ligne:   await peutExecuterVers("en_ligne", req),
      presentiel: await peutExecuterVers("presentiel", req),
    };
    const monCentreId = estCommerciale(req.role)
      ? ((await assistanteDe(req.profil))?.centre_id || null) : null;
    const suisOnboarding = estOnboarding(req.role) && !estCommerciale(req.role);

    const aTraiter = (d) => {
      if (d.statut === "en_attente_test") return estPlacement(req.role);

      if (d.statut === "test_fait") {
        // Changement de classe ou de coaching : on reste dans le canal de la classe.
        return !!peutVers[estCanal(d.type_cours) ? d.type_cours : "presentiel"];
      }

      if (d.statut === "en_attente_accord") {
        if (d.type_demande === "changement_centre") {
          // L'autorité est au centre d'ACCUEIL. L'onboarding garde la main pour arbitrer
          // quand un centre ne répond pas — même règle que le bouton.
          return suisOnboarding
            || (!!monCentreId && String(d.centre_cible_id || "") === String(monCentreId));
        }
        // Migration de canal : c'est le canal d'ARRIVÉE qui tranche, jamais celui de départ.
        return !!peutVers[canalCibleDe(d.type_cours)];
      }

      return false;
    };

    const demandes = (data || []).map(d => ({ ...d, a_traiter_par_moi: aTraiter(d) }));

    res.json({
      demandes,
      /* Le compte des dossiers qui attendent VRAIMENT une action de cette personne. Rendu par
         le serveur plutôt que recalculé : le badge et la liste disent alors forcément la même
         chose, et un dossier traité disparaît du compteur au même instant qu'il quitte la
         file. */
      a_traiter: demandes.filter(d => d.a_traiter_par_moi).length,
      motifs: MOTIFS_TRANSFERT,
      /* L'écran sait ainsi quels boutons présenter, sans dupliquer la matrice des rôles - et
         sans se tromper : une assistante EN LIGNE voit la file mais ne réaffecte pas, ce que
         son rôle seul ne suffit pas à dire. La réponse du serveur fait foi. */
      je_peux_reaffecter: estCommerciale(req.role)
        ? await commercialePeutReaffecter(req.profil)
        : estOnboarding(req.role),
      je_peux_tester:     estPlacement(req.role),
      /* POUR LES MIGRATIONS, L'AUTORITÉ SE LIT SUR LE CANAL D'ARRIVÉE, pas sur le rôle seul :
         `je_peux_reaffecter` ne suffit pas à le dire. L'écran saurait sinon qu'une personne
         peut réaffecter « en général » et lui proposerait un bouton que le serveur refuserait
         - côté en ligne, l'affectation revient toujours à l'onboarding. On répond donc
         explicitement, canal par canal. */
      je_peux_executer_vers: peutVers,
      /* MON CENTRE, pour les transferts de centre à centre. L'autorité n'y dépend ni du rôle
         ni du canal mais du CENTRE D'ACCUEIL : seule l'assistante qui va recevoir l'apprenant
         peut accepter. L'écran ne pouvait pas le savoir - il n'avait que les canaux - et
         n'affichait donc aucun bouton sur ces dossiers, pas même à celle qui devait trancher.
         `null` pour l'onboarding et les rôles d'administration, qui n'appartiennent à aucun
         centre et gardent la main sur tout. */
      mon_centre: monCentreId,
      je_suis_onboarding: suisOnboarding,
    });
  } catch (err) {
    console.error("[demandes-transfert GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   PATCH /api/demandes-transfert/:id — faire avancer le dossier
══════════════════════════════════════════════════════════════ */
router.patch("/:id", authenticateAdmin, async (req, res) => {
  try {
    const { data: demande, error: errLecture } = await supabase
      .from("demandes_transfert").select("*").eq("id", req.params.id).maybeSingle();
    if (errLecture && tableAbsente(errLecture)) {
      return res.status(503).json({ error: "Les demandes de transfert ne sont pas encore activées sur cette base." });
    }
    if (!demande) return res.status(404).json({ error: "Demande introuvable" });
    if (demande.statut === "traitee" || demande.statut === "refusee") {
      return res.status(409).json({ error: "Cette demande est déjà close." });
    }

    const maj = { updated_at: new Date().toISOString() };
    /* Ce qui a pu échouer SANS annuler la réaffectation : le canal et le centre du
       dossier, le nouveau tarif. L'écran doit pouvoir le dire plutôt que d'annoncer une
       migration complète alors qu'il en manque la moitié. */
    const resultatMigration = {};
    let action = null;

    /* ── Le placement test rend le niveau ─────────────────────────────────────── */
    if (req.body.niveau_obtenu !== undefined) {
      if (!estPlacement(req.role)) {
        return res.status(403).json({ error: "Seul l'agent placement test peut enregistrer le niveau." });
      }
      const niveau = String(req.body.niveau_obtenu || "").trim();
      if (!niveau) return res.status(400).json({ error: "Le niveau obtenu est requis." });
      maj.niveau_obtenu = niveau;
      maj.level_test_id = req.body.level_test_id || null;
      maj.teste_le      = new Date().toISOString();
      maj.teste_par     = req.profil.id;
      maj.statut        = "test_fait";
      action = "test";

      /* UN NIVEAU ÉVALUÉ EN PRÉSENTIEL EST UN TEST, et doit s'enregistrer comme tel.
         Sans cela il ne vivait que sur ce dossier : la fiche de l'apprenant, son espace, les
         exports et l'historique continuaient d'afficher son ancien niveau comme s'il n'avait
         jamais repassé de test - « B1 » seul, là où la réalité est « B1 → C1 ».
         On ne l'écrit QUE si l'agent a saisi le niveau à la main : quand il vient d'un test
         passé en ligne (`level_test_id` fourni), l'enregistrement existe déjà et le dupliquer
         inventerait un second passage. */
      if (demande.email_apprenant) {
        try {
          /* RATTACHER LE TEST À SON DOSSIER. Sans `assignation_id` ni `commercial_id`, le test
             existe sans propriétaire : le dashboard de la commerciale filtre sa liste sur
             `commercial_id`, la ligne partait donc dans « tests sans conseillère assignée » et
             la fiche de l'apprenant restait sur son ancien niveau. Le rapprochement par
             e-mail seul ne suffit pas non plus - un parent et son enfant la partagent.
             La conseillère se lit dans `assistante_id` : la colonne `commercial_id` décrite
             par sql/CONSOLIDATION_assignations_parcours.sql n'existe pas en base, et la
             demander faisait échouer toute la requête - donc le rattachement entier.
             Vaut pour les DEUX voies : le test passé en ligne via le lien du transfert arrive
             lui aussi sans dossier, le lien ne transportant que l'e-mail et l'id de demande. */
          let assignation = null;
          const { data: gaRow } = await supabase
            .from("groupes_apprenants").select("note").eq("id", demande.ga_id).maybeSingle();
          let assignationId = null;
          try { assignationId = JSON.parse(gaRow?.note || "{}").assignation_id || null; } catch { /* note libre */ }
          if (assignationId) {
            ({ data: assignation } = await supabase.from("assignations_parcours")
              .select("id, assistante_id").eq("id", assignationId).maybeSingle());
          }
          if (!assignation) {
            ({ data: assignation } = await supabase.from("assignations_parcours")
              .select("id, assistante_id").ilike("prospect_email", demande.email_apprenant)
              .order("created_at", { ascending: false }).limit(1).maybeSingle());
          }

          if (req.body.level_test_id) {
            /* Le test existe déjà (passé en ligne) : le dupliquer inventerait un second
               passage. On se contente de lui poser le dossier qui lui manque. */
            if (assignation?.id) {
              await supabase.from("level_test_results")
                .update({ assignation_id: assignation.id, commercial_id: assignation.assistante_id || null })
                .eq("id", req.body.level_test_id).is("assignation_id", null);
            }
          } else {
            /* UN NIVEAU ÉVALUÉ EN PRÉSENTIEL EST UN TEST, et doit s'enregistrer comme tel.
               Sans cela il ne vivait que sur ce dossier : la fiche de l'apprenant, son espace,
               les exports et l'historique continuaient d'afficher son ancien niveau comme s'il
               n'avait jamais repassé de test - « B1 » seul, là où la réalité est « B1 → C1 ». */
            await supabase.from("level_test_results").insert({
              fullname:     [demande.prenom_apprenant, demande.nom_apprenant].filter(Boolean).join(" ") || null,
              email:        demande.email_apprenant,
              assignation_id: assignation?.id || null,
              commercial_id:  assignation?.assistante_id || null,
              level:        niveau,
              source:       "oral",            // évalué par l'agent, pas passé en ligne
              format_test:  "oral",
              correction_statut: "manuelle",
              notes_oral:   `Évaluation lors d'une demande de transfert — ${MOTIFS_TRANSFERT[demande.motif] || demande.motif}`,
              submitted_at: new Date().toISOString(),
            });
          }
        } catch (e) {
          // Non bloquant : le niveau est porté par le dossier, qui suffit à débloquer la
          // réaffectation. L'historique sera simplement incomplet, pas le circuit.
          console.warn("[demandes-transfert PATCH] test non rattaché:", e.message);
        }
      }
    }

    /* ── L'onboarding referme le dossier ──────────────────────────────────────── */
    if (req.body.statut === "traitee") {
      const estMigration       = demande.type_demande === "changement_coaching";
      const estChangementCentre = demande.type_demande === "changement_centre";
      const canalCible         = canalCibleDe(demande.type_cours);

      /* Le garde générique ne vaut pas pour un transfert de CENTRE : celui-ci est exécuté par
         l'assistante du centre d'accueil, qui est une commerciale - `estOnboarding` la couvre
         déjà par sa liste de rôles, mais le contrôle précis se fait quelques lignes plus bas,
         sur son centre. */
      if (!estOnboarding(req.role) && !estChangementCentre) {
        return res.status(403).json({ error: "Seule l'équipe onboarding peut réaffecter un apprenant." });
      }

      if (estMigration) {
        /* L'AUTORITÉ SE LIT SUR LE CANAL D'ARRIVÉE, pas sur celui de départ. Une migration
           traverse la frontière entre les deux équipes : c'est celle qui REÇOIT l'apprenant
           qui a la main, puisque c'est elle qui gère la classe où il atterrit.
           Vers le en ligne, c'est donc toujours l'onboarding - une assistante en ligne suit
           son dossier mais n'assigne jamais la classe. */
        if (!(await peutExecuterVers(canalCible, req))) {
          return res.status(403).json({
            error: canalCible === "en_ligne"
              ? "L'affectation à une classe en ligne revient à l'équipe onboarding. "
                + "Vous suivez cette migration, mais le choix de la classe ne vous revient pas."
              : "L'affectation à une classe présentiel revient à l'assistante du centre d'accueil.",
          });
        }
        if (demande.statut !== "en_attente_accord") {
          return res.status(409).json({ error: "Cette migration n'est plus en attente d'accord." });
        }
      } else if (estChangementCentre) {
        /* ── QUI EXÉCUTE UN TRANSFERT DE CENTRE ───────────────────────────────────────────
           L'ASSISTANTE DU CENTRE D'ARRIVÉE, et personne d'autre : c'est elle qui gère les
           classes où l'apprenant atterrit, donc elle seule peut lui en désigner une. Celle du
           centre de départ voit le dossier avancer, mais ne choisit pas la classe d'un centre
           qui n'est pas le sien - c'est exactement le partage déjà appliqué entre le en ligne
           et le présentiel, transposé entre deux centres.
           L'onboarding et les rôles d'administration gardent la main : ils arbitrent quand un
           centre ne répond pas, et sans eux un dossier pourrait rester bloqué. */
        if (estCommerciale(req.role)) {
          const moi = await assistanteDe(req.profil);
          if (!demande.centre_cible_id || String(moi?.centre_id || "") !== String(demande.centre_cible_id)) {
            return res.status(403).json({
              error: "Ce transfert revient à l'assistante du centre d'accueil. "
                   + "Vous suivez le dossier, mais le choix de la classe ne vous revient pas.",
            });
          }
        } else if (!estOnboarding(req.role)) {
          return res.status(403).json({ error: "Seule l'assistante du centre d'accueil peut traiter ce transfert." });
        }
        if (demande.statut !== "en_attente_accord") {
          return res.status(409).json({ error: "Ce transfert n'est plus en attente d'accord." });
        }
      } else {
        if (estCommerciale(req.role) && !(await commercialePeutReaffecter(req.profil))) {
          return res.status(403).json({
            error: "Les classes en ligne sont réaffectées par l'équipe onboarding. "
                 + "Vous suivez le dossier, mais le changement de classe ne vous revient pas.",
          });
        }
        /* LE VERROU. Le niveau détermine la classe cible : refermer le dossier sans lui, ce
           serait replacer l'apprenant au jugé, et la demande n'aurait servi à rien. L'écran
           grise déjà le bouton ; on le refuse aussi ici, car un bouton grisé n'est pas un droit
           retiré.
           IL NE S'APPLIQUE QU'AU CHANGEMENT DE GROUPE : une migration de canal ne pose aucune
           question de niveau, et l'exiger d'elle reviendrait à faire repasser un test à
           quelqu'un qui déménage. */
        if (demande.statut !== "test_fait") {
          return res.status(409).json({
            error: "Le test de niveau n'a pas encore été passé : la réaffectation n'est pas possible.",
            en_attente_test: true,
          });
        }
      }
      /* PAS DE DOSSIER CLOS SANS CLASSE D'ARRIVÉE. « Réaffecté » veut dire que l'apprenant est
         quelque part : sans `groupe_cible_id`, le dossier quittait la file alors que personne
         n'avait bougé, et l'apprenant restait dans la classe qu'il devait justement quitter -
         une disparition silencieuse, pire que l'absence de bouton. C'est arrivé.
         L'écran demande désormais la classe avant d'appeler ; on l'exige aussi ici, car un
         écran qui pose la question n'est pas une garantie que la réponse arrive. */
      if (!req.body.groupe_cible_id) {
        return res.status(400).json({
          error: "Indiquez la classe d'arrivée : un dossier ne peut pas être marqué réaffecté sans elle.",
        });
      }
      maj.statut          = "traitee";
      maj.groupe_cible_id = req.body.groupe_cible_id;
      maj.traite_le       = new Date().toISOString();
      maj.traite_par      = req.profil.id;
      action = "traitee";

      /* ── LE DOSSIER SUIT LA CLASSE ────────────────────────────────────────────────────
         La route de transfert déplace l'inscription, et c'est tout ce qu'elle fait. Le CANAL
         et le CENTRE vivent sur `assignations_parcours` et n'étaient jamais réécrits : un
         apprenant migré restait affiché « En ligne » indéfiniment, assis dans un centre — et
         c'est ce champ, pas la classe, que lisent les fiches de la commerciale, du PA et de
         l'admin.
         La vérité est le `type_cours` de la classe RÉELLEMENT choisie, pas le canal annoncé à
         l'ouverture : l'assistante peut très bien accepter dans une classe hybride.
         NON BLOQUANT : le changement de classe est l'acte principal, et un échec ici ne doit
         pas l'annuler. Mais il est tracé, parce qu'un dossier à moitié migré est précisément
         ce que ce circuit existe pour éviter. */
      /* ── LE TRANSFERT DE CENTRE SUIT SON PROPRE CHEMIN ────────────────────────────────
         Le canal ne bouge pas - un apprenant d'Angré transféré à Yopougon reste en présentiel -
         donc rien de ce que fait le bloc de migration ne s'applique : ni la réécriture du
         canal, ni le changement de propriétaire par canal. Deux choses changent, et deux
         seulement : le CENTRE du dossier, et son assistante, qui devient celle du centre
         d'accueil - sans quoi l'apprenant resterait dans la liste d'une assistante qui ne le
         voit plus passer, et serait invisible de celle qui le reçoit. */
      if (estChangementCentre) {
        const dossierCentre = await resoudreDossierDepuisDemande(demande);
        if (!dossierCentre) resultatMigration.dossier_introuvable = true;
        try {
          const { data: classeArrivee } = await supabase
            .from("groupes").select("centre_id").eq("id", req.body.groupe_cible_id).maybeSingle();

          /* Le centre de la classe réellement choisie fait foi, et non celui annoncé à
             l'ouverture : l'assistante peut accepter dans une classe d'un centre voisin. Le
             centre demandé ne sert que de repli si la classe n'en porte pas. */
          const centreArrivee = classeArrivee?.centre_id || demande.centre_cible_id || null;
          const majDossier = {};
          if (centreArrivee) majDossier.centre_id = centreArrivee;

          const moi = await assistanteDe(req.profil);
          if (moi?.id) {
            majDossier.assistante_id = moi.id;
            resultatMigration.assistante_id = moi.id;   // pour la prévenir plus bas
          }

          if (Object.keys(majDossier).length && dossierCentre) {
            const { error: eD } = await supabase
              .from("assignations_parcours").update(majDossier).eq("id", dossierCentre.id);
            if (eD) throw eD;
          }
          resultatMigration.centre = { vers: centreArrivee };
        } catch (e) {
          console.warn("[changement centre] dossier non mis à jour:", e.message);
          resultatMigration.dossier_non_maj = e.message;
        }

      }

      if (estMigration) {
        /* Résolu UNE FOIS pour les deux écritures qui suivent. Le rapprochement par e-mail
           seul tombait à côté quand l'inscription porte un identifiant technique. */
        const dossierMigration = await resoudreDossierDepuisDemande(demande);
        if (!dossierMigration) resultatMigration.dossier_introuvable = true;
        try {
          const { data: classeArrivee } = await supabase
            .from("groupes").select("type_cours, centre_id")
            .eq("id", req.body.groupe_cible_id).maybeSingle();

          /* LE CANAL D'ARRIVÉE, ET JAMAIS UN TYPE DE COACHING À SA PLACE. On recopiait le
             `type_cours` de la classe d'arrivée sans regarder sa valeur. Pour un apprenant en
             coaching PRIVÉ, cette classe porte `prive` : le dossier aurait reçu `prive` et
             perdu son canal - la migration aurait effacé exactement l'information qu'elle
             venait de changer, et le dossier serait devenu introuvable dans les deux files.
             Quand la classe d'arrivée ne dit pas de canal, on écrit celui que la migration
             visait : c'est la seule valeur juste dont on dispose. */
          const majDossier = {};
          const canalArrivee = estCanal(classeArrivee?.type_cours) ? classeArrivee.type_cours : canalCible;
          if (canalArrivee) majDossier.type_cours = canalArrivee;

          /* ── À QUI EST L'APPRENANT APRÈS LA MIGRATION ─────────────────────────────────
             `assistante_id` n'était pas touché : le dossier restait la propriété de
             l'assistante du canal qu'il vient de QUITTER. Elle le gardait dans sa liste - qui
             est filtrée sur ce champ - et aucune assistante du nouveau canal ne le voyait.
             Le profil affichait donc l'ancienne assistante sur un dossier parti ailleurs.

             VERS LE PRÉSENTIEL, celle qui accepte prend le dossier : elle a la main sur la
             classe d'arrivée, c'est elle qui suivra l'apprenant. Rien à attribuer ensuite.

             VERS LE EN LIGNE, le dossier devient « à attribuer » : l'onboarding exécute mais
             n'est pas une assistante, et c'est lui qui désignera laquelle des quatorze suivra
             l'apprenant. Tant qu'il ne l'a pas fait, aucune assistante en ligne ne voit le
             dossier - c'est voulu : mieux vaut un dossier visiblement sans propriétaire qu'un
             dossier attribué au hasard.

             CORRECTION D'UNE AFFIRMATION FAUSSE écrite ici : « l'onboarding, lui, le voit, son
             périmètre est global ». Il ne le voyait PAS. Sa vue globale est bornée par
             `.in("assistante_id", [...])` (parcours.js), qui écarte les NULL par construction -
             donc exactement les dossiers que cette ligne vient de créer. Ils sont désormais
             servis par `GET /parcours/dossiers-a-attribuer` et réclamés dans son onglet
             « Mes tâches », parce qu'un dossier sans propriétaire que personne ne voit n'est
             pas « visiblement sans propriétaire » : il est perdu. */
          if (canalCible === "en_ligne") {
            majDossier.assistante_id = null;
            resultatMigration.a_attribuer = true;
          } else {
            const moi = await assistanteDe(req.profil);
            if (moi?.id) {
              majDossier.assistante_id = moi.id;
              resultatMigration.assistante_id = moi.id;   // pour la prévenir plus bas
            }
          }
          /* Le centre d'arrivée, et JAMAIS un effacement : en présentiel → en ligne, on garde
             le centre d'origine comme rattachement historique. Le vider ferait mentir les
             statistiques par centre rétroactivement, et ferait perdre à l'assistante la
             visibilité sur un apprenant qu'elle a suivi. */
          if (classeArrivee?.centre_id) majDossier.centre_id = classeArrivee.centre_id;

          if (Object.keys(majDossier).length && dossierMigration) {
            const { error: eDossier } = await supabase
              .from("assignations_parcours").update(majDossier).eq("id", dossierMigration.id);
            if (eDossier) throw eDossier;
          }
        } catch (e) {
          console.warn("[migration canal] dossier non mis à jour:", e.message);
          resultatMigration.dossier_non_maj = e.message;
        }

      }

      /* ══ LE TARIF, DANS LE MÊME GESTE — POUR LES TROIS CIRCUITS ══════════════════════
         C'est la raison d'être de ce réglage ici plutôt qu'ailleurs : sorti du geste, il se
         perd - personne ne revient sur un écran qu'il a quitté. Un changement de canal, de
         centre ou de CLASSE peut chacun s'accompagner d'un prix différent : passer d'un
         groupe A1 à un coaching plus intensif ne coûte pas la même chose.

         UN SEUL BLOC, ET C'EST VOLONTAIRE. Il était écrit DEUX FOIS - une par circuit - et le
         troisième, le changement de classe, n'en avait aucune : le champ n'y était même pas
         proposé. C'est exactement ainsi que ce projet fabrique ses divergences, et la seule
         parade est de n'avoir qu'un endroit où la règle vit.

         CE QU'ON ÉCRIT : `plan.mensualite`, que les trois générateurs de mois (cron, webhook
         TouchPoint, reprise après pause) lisent au moment de créer un mois. Le passé garde son
         prix. Les mois DÉJÀ ÉCRITS ne bougent que si l'on a explicitement coché « dès le mois
         en cours », et jamais ceux qui portent un versement. */
      const nouvelleMensualite = Number(req.body.nouvelle_mensualite);
      if (nouvelleMensualite > 0) {
        try {
          const dossier = await resoudreDossierDepuisDemande(demande);
          const plan = dossier?.plan_paiement;
          if (!dossier) {
            resultatMigration.tarif_non_maj = "dossier introuvable";
          } else if (!plan || typeof plan !== "object" || plan.type !== "mensuel") {
            // Pas de plan mensuel : il n'y a pas de mensualité à ajuster, et ce n'est pas une
            // erreur - l'écran l'annonce déjà, on ne crée pas un plan par surprise.
            resultatMigration.tarif_non_maj = "aucun plan mensuel";
          } else {
            const ancienne = Number(plan.mensualite) || 0;
            if (ancienne !== nouvelleMensualite) {
              /* Le MOTIF dit lequel des trois circuits a changé le prix : dans six mois, c'est
                 la seule chose qui expliquera l'écart. */
              const motifTarif = estMigration ? "migration_canal"
                : estChangementCentre ? "changement_centre" : "changement_classe";
              let planMaj = {
                ...plan,
                mensualite: nouvelleMensualite,
                // On empile plutôt qu'on remplace : un apprenant peut être transféré deux fois.
                changements_tarif: [...(Array.isArray(plan.changements_tarif) ? plan.changements_tarif : []), {
                  de: ancienne, vers: nouvelleMensualite,
                  motif: motifTarif, demande_id: demande.id,
                  le: new Date().toISOString(), par: req.profil.id,
                  des_le_mois_en_cours: !!req.body.appliquer_mois_en_cours,
                }],
              };
              let reprices = 0;
              if (req.body.appliquer_mois_en_cours) {
                ({ plan: planMaj, reprices } = appliquerTarifAuxMoisEcrits(planMaj, nouvelleMensualite));
              }
              const { error: ePlan } = await supabase
                .from("assignations_parcours").update({ plan_paiement: planMaj }).eq("id", dossier.id);
              if (ePlan) throw ePlan;
              resultatMigration.mensualite = { de: ancienne, vers: nouvelleMensualite, mois_reprices: reprices };
            }
          }
        } catch (e) {
          // Non bloquant : le changement de classe est l'acte principal, et un tarif non
          // appliqué ne doit pas l'annuler. Mais il est tracé.
          console.warn("[demandes-transfert] tarif non appliqué:", e.message);
          resultatMigration.tarif_non_maj = e.message;
        }
      }

      /* LE NIVEAU DU TEST DEVIENT CELUI DE L'APPRENANT, et l'ancien est conservé à côté.
         Sans cela, le test aurait servi à choisir la classe puis aurait été oublié : la fiche
         de l'apprenant aurait continué d'afficher le niveau qui justement ne lui convenait
         pas. Non bloquant - la réaffectation est l'acte principal, et un échec ici ne doit pas
         l'annuler ; le niveau reste alors lisible sur le dossier. */
      if (demande.niveau_obtenu && demande.ga_id) {
        try {
          const { data: gaAvant } = await supabase
            .from("groupes_apprenants")
            .select("niveau, apprenant_id, email_apprenant, note").eq("id", demande.ga_id).maybeSingle();

          /* SUR L'INSCRIPTION OÙ IL EST MAINTENANT, PAS SUR CELLE QU'IL VIENT DE QUITTER.
             Le transfert ne modifie pas la ligne existante : il la ferme et en crée une neuve
             dans la classe d'arrivée, en y RECOPIANT l'ancien niveau. Écrire sur `demande.ga_id`
             mettait donc à jour une ligne close que plus personne ne lit, pendant que la
             nouvelle gardait le niveau périmé - l'apprenant s'affichait en C1 au milieu d'une
             classe de B2, alors même que son test venait de dire B2. */
          let cible = demande.ga_id;
          if (req.body.groupe_cible_id) {
            let q = supabase.from("groupes_apprenants")
              .select("id, niveau").eq("groupe_id", req.body.groupe_cible_id).eq("statut", "actif")
              .order("date_ajout", { ascending: false }).limit(1);
            q = gaAvant?.apprenant_id
              ? q.eq("apprenant_id", gaAvant.apprenant_id)
              : q.ilike("email_apprenant", gaAvant?.email_apprenant || "");
            const { data: nouvelle } = await q.maybeSingle();
            if (nouvelle?.id) cible = nouvelle.id;
          }

          const ancien = (gaAvant?.niveau || "").toUpperCase();
          if (ancien !== demande.niveau_obtenu.toUpperCase()) {
            const { error: errNiveau } = await supabase.from("groupes_apprenants").update({
              niveau:           demande.niveau_obtenu,
              niveau_precedent: gaAvant?.niveau || null,
              niveau_change_le: new Date().toISOString(),
            }).eq("id", cible);
            // La migration peut ne pas être jouée : on écrit au moins le niveau.
            if (errNiveau && /niveau_precedent|niveau_change_le/.test(errNiveau.message || "")) {
              await supabase.from("groupes_apprenants")
                .update({ niveau: demande.niveau_obtenu }).eq("id", cible);
            }

            /* LE DOSSIER COMMERCIAL AUSSI. « Le niveau de l'apprenant » s'écrit à deux endroits :
               sur son inscription en classe (`groupes_apprenants.niveau`) et sur son dossier
               (`assignations_parcours.niveau_client`). Les fiches de la commerciale et du
               conseiller pédagogique lisent le SECOND. Ne mettre à jour que le premier laissait
               donc l'apprenant affiché à son ancien niveau là où on le consulte le plus -
               « A2 » sur sa fiche alors qu'il venait de passer B1. */
            try {
              let assignationId = null;
              try { assignationId = JSON.parse(gaAvant?.note || "{}").assignation_id || null; } catch { /* note libre */ }
              let maj = null;
              if (assignationId) {
                ({ data: maj } = await supabase.from("assignations_parcours")
                  .update({ niveau_client: demande.niveau_obtenu }).eq("id", assignationId).select("id"));
              }
              if (!maj?.length && gaAvant?.email_apprenant) {
                await supabase.from("assignations_parcours")
                  .update({ niveau_client: demande.niveau_obtenu })
                  .ilike("prospect_email", gaAvant.email_apprenant);
              }
            } catch (e) {
              console.warn("[demandes-transfert PATCH] niveau_client non mis à jour:", e.message);
            }
          }
        } catch (e) {
          console.warn("[demandes-transfert PATCH] report du niveau:", e.message);
        }
      }
    }

    /* ── Refus ────────────────────────────────────────────────────────────────── */
    if (req.body.statut === "refusee") {
      if (!estOnboarding(req.role)) {
        return res.status(403).json({ error: "Seule l'équipe onboarding peut refuser une demande." });
      }
      /* REFUSER EST UNE DÉCISION, PAS UN SUIVI. Sur une migration, elle revient à la même
         personne que l'acceptation : celle qui a autorité sur le canal d'ARRIVÉE. Une
         assistante qui ne peut pas accepter voyait pourtant un bouton « Refuser » - elle
         pouvait donc clore un dossier qu'elle n'avait pas qualité pour trancher. */
      if (demande.type_demande === "changement_coaching") {
        if (!(await peutExecuterVers(canalCibleDe(demande.type_cours), req))) {
          return res.status(403).json({
            error: "Vous suivez cette migration, mais la décision revient à l'équipe qui reçoit l'apprenant.",
          });
        }
      } else if (demande.type_demande === "changement_centre") {
        /* MÊME RÈGLE QUE POUR ACCEPTER : le centre d'ACCUEIL décide. Sans cette symétrie,
           l'assistante du centre de départ pourrait refuser sa propre demande, et celle d'un
           troisième centre trancher un dossier qui ne la concerne pas. */
        if (estCommerciale(req.role)) {
          const moi = await assistanteDe(req.profil);
          if (!demande.centre_cible_id || String(moi?.centre_id || "") !== String(demande.centre_cible_id)) {
            return res.status(403).json({
              error: "Vous suivez ce transfert, mais la décision revient à l'assistante du centre d'accueil.",
            });
          }
        }
      } else if (estCommerciale(req.role) && !(await commercialePeutReaffecter(req.profil))) {
        return res.status(403).json({
          error: "Les classes en ligne sont réaffectées par l'équipe onboarding. "
               + "Vous suivez le dossier, mais le changement de classe ne vous revient pas.",
        });
      }
      if (!String(req.body.motif_refus || "").trim()) {
        // Refuser sans dire pourquoi laisserait le coach sans réponse, et il réémettrait
        // la même demande la semaine suivante.
        return res.status(400).json({ error: "Indiquez le motif du refus : le coach doit savoir pourquoi." });
      }
      maj.statut      = "refusee";
      maj.motif_refus = String(req.body.motif_refus).trim();
      maj.traite_le   = new Date().toISOString();
      maj.traite_par  = req.profil.id;
      action = "refusee";
    }

    if (!action) return res.status(400).json({ error: "Aucune modification demandée." });

    const { data, error } = await supabase
      .from("demandes_transfert").update(maj).eq("id", demande.id).select().single();
    if (error) throw error;

    /* Tenir le coach au courant à chaque étape : c'est lui qui a signalé le cas, et il perdait
       le dossier de vue dès qu'il l'avait émis. */
    (async () => {
      const apprenant = `${demande.prenom_apprenant || ""} ${demande.nom_apprenant || ""}`.trim() || "votre apprenant";
      const messages = {
        test:    { titre: `🧪 Test de niveau passé — ${apprenant}`,
                   message: `Le test de ${apprenant} rend le niveau ${maj.niveau_obtenu}. L'onboarding peut maintenant procéder à la réaffectation.` },
        traitee: { titre: `✅ Transfert effectué — ${apprenant}`,
                   message: `${nomDe(req.profil)} a réaffecté ${apprenant}. L'apprenant apparaît désormais dans votre archive, avec sa date de sortie et le motif.` },
        refusee: { titre: `↩️ Demande de transfert refusée — ${apprenant}`,
                   message: `${nomDe(req.profil)} n'a pas donné suite à votre demande concernant ${apprenant}. Motif : ${maj.motif_refus}` },
      };
      const ids = [...new Set([demande.coach_id, demande.cree_par].filter(Boolean))];
      if (ids.length && messages[action]) {
        await notifyUsers(ids, { type: "demande_transfert", ...messages[action], meta: { demande_id: demande.id } })
          .catch(e => console.warn("[demandes-transfert PATCH] notification:", e.message));
      }

      /* LE RÉSULTAT DU TEST VA AUSSI À CEUX QUI RÉAFFECTENT. C'est le moment où le dossier
         devient actionnable pour eux : sans cette notification, il resterait à attendre dans
         l'onglet que quelqu'un pense à l'ouvrir. On prévient l'onboarding ET les assistantes
         présentiel, puisque les deux réaffectent selon le type de classe. */
      /* ── UNE MIGRATION PRÉVIENT TOUTE LA CHAÎNE ─────────────────────────────────────
         Un changement de canal déplace l'apprenant d'une équipe à l'autre : le coach qui le
         perd, celui qui le reçoit, l'assistante qui en hérite, et ceux qui pilotent. Chacun
         l'apprenait jusqu'ici en s'en apercevant - ou pas du tout.
         `ids` couvre déjà le coach d'origine et l'émettrice ; on complète avec le reste, en
         évitant les doublons. Non bloquant : la migration est faite, une notification perdue
         ne doit pas la remettre en cause. */
      if (action === "traitee" && demande.type_demande === "changement_coaching") {
        try {
          const dest = new Set();
          const ajouter = (x) => { if (x && !ids.includes(x)) dest.add(x); };

          const canalArr = canalCibleDe(demande.type_cours);
          let nomClasseArr = null;

          // Le coach qui REÇOIT l'apprenant : il va le voir arriver dans sa classe.
          if (maj.groupe_cible_id) {
            const { data: g } = await supabase
              .from("groupes").select("nom, coach_id").eq("id", maj.groupe_cible_id).maybeSingle();
            nomClasseArr = g?.nom || null;
            ajouter(g?.coach_id);
          }

          // L'assistante qui hérite du dossier - seulement si une l'a pris. Vers le en ligne,
          // il reste à attribuer : c'est l'onboarding qu'on prévient, pas une assistante
          // choisie au hasard.
          if (resultatMigration.assistante_id) {
            const { data: ass } = await supabase
              .from("assistantes").select("email").eq("id", resultatMigration.assistante_id).maybeSingle();
            if (ass?.email) {
              const { data: u } = await supabase
                .from("utilisateurs").select("id").ilike("email", ass.email).maybeSingle();
              ajouter(u?.id);
            }
          }

          // Le pilotage : conseil pédagogique, admin, super admin.
          const { data: pilotes } = await supabase
            .from("utilisateurs").select("id")
            .in("role", ["pedagogical_advisor", "admin", "super_admin"]).eq("actif", true);
          (pilotes || []).forEach(u => ajouter(u.id));

          // Et l'onboarding quand le dossier attend encore un propriétaire.
          if (resultatMigration.a_attribuer) {
            const { data: onb } = await supabase
              .from("utilisateurs").select("id").in("role", ["onboarding", "admin_onboarding"]).eq("actif", true);
            (onb || []).forEach(u => ajouter(u.id));
          }

          if (dest.size) {
            await notifyUsers([...dest], {
              type:  "demande_transfert",
              titre: `🔀 Migration effectuée — ${apprenant}`,
              message: `${apprenant} passe du ${libelleCanalPhrase(demande.type_cours)} au ${libelleCanalPhrase(canalArr)}`
                     + `${demande.groupe_nom ? `, en quittant ${demande.groupe_nom}` : ""}`
                     + `${nomClasseArr ? ` pour ${nomClasseArr}` : ""}. `
                     + `Son niveau, son historique et ses données le suivent.`
                     + `${resultatMigration.a_attribuer ? " ⚠ Le dossier attend encore une assistante en ligne." : ""}`
                     + `${resultatMigration.mensualite ? ` Mensualité : ${resultatMigration.mensualite.de} → ${resultatMigration.mensualite.vers} F.` : ""}`,
              meta: { demande_id: demande.id, groupe_cible_id: maj.groupe_cible_id || null, canal: canalArr },
            });
          }
        } catch (e) {
          console.warn("[demandes-transfert PATCH] notification migration:", e.message);
        }
      }

      /* ── UN TRANSFERT DE CENTRE PRÉVIENT LES DEUX CENTRES ────────────────────────────
         Le dossier change de maison : le centre de départ le perd, celui d'arrivée l'accueille.
         Les deux doivent l'apprendre, et pas en s'en apercevant. On prévient donc, en plus du
         coach qui le reçoit et du pilotage, les assistantes du centre QUITTÉ - elles ne sont
         dans aucune des listes précédentes, et c'est pourtant leur apprenant qui s'en va.
         Non bloquant : le transfert est fait, une notification perdue ne le remet pas en cause. */
      if (action === "traitee" && demande.type_demande === "changement_centre") {
        try {
          const dest = new Set();
          const ajouter = (x) => { if (x && !ids.includes(x)) dest.add(x); };

          let nomClasseArr = null;
          if (maj.groupe_cible_id) {
            const { data: g } = await supabase
              .from("groupes").select("nom, coach_id").eq("id", maj.groupe_cible_id).maybeSingle();
            nomClasseArr = g?.nom || null;
            ajouter(g?.coach_id);   // le coach qui va le voir arriver
          }

          /* Les assistantes du centre de DÉPART : leur apprenant part ailleurs, et rien ne le
             leur disait. Celle qui a émis la demande est déjà dans `ids`, mais sa collègue du
             même centre ne l'est pas. */
          const centresConcernes = [demande.centre_source_id, demande.centre_cible_id].filter(Boolean);
          if (centresConcernes.length) {
            const { data: assCentres } = await supabase
              .from("assistantes").select("email").in("centre_id", centresConcernes).eq("actif", true);
            const emails = (assCentres || []).map(a => a.email).filter(Boolean);
            if (emails.length) {
              const { data: us } = await supabase
                .from("utilisateurs").select("id").in("email", emails).eq("actif", true);
              (us || []).forEach(u => ajouter(u.id));
            }
          }

          const { data: pilotes } = await supabase
            .from("utilisateurs").select("id")
            .in("role", ["pedagogical_advisor", "admin", "super_admin"]).eq("actif", true);
          (pilotes || []).forEach(u => ajouter(u.id));

          // Les noms des centres plutôt que leurs identifiants : « angre » ne se lit pas.
          const { data: cs } = centresConcernes.length
            ? await supabase.from("centres").select("id, nom").in("id", centresConcernes)
            : { data: [] };
          const nomCentre = (id) => (cs || []).find(c => c.id === id)?.nom || id || "—";

          if (dest.size) {
            await notifyUsers([...dest], {
              type:  "demande_transfert",
              titre: `🏢 Transfert de centre effectué — ${apprenant}`,
              message: `${apprenant} passe de ${nomCentre(demande.centre_source_id)} `
                     + `à ${nomCentre(resultatMigration.centre?.vers || demande.centre_cible_id)}`
                     + `${demande.groupe_nom ? `, en quittant ${demande.groupe_nom}` : ""}`
                     + `${nomClasseArr ? ` pour ${nomClasseArr}` : ""}. `
                     + `Son niveau, son historique et ses données le suivent.`
                     + `${resultatMigration.mensualite ? ` Mensualité : ${resultatMigration.mensualite.de} → ${resultatMigration.mensualite.vers} F.` : ""}`,
              meta: { demande_id: demande.id, groupe_cible_id: maj.groupe_cible_id || null,
                      centre_source_id: demande.centre_source_id || null,
                      centre_cible_id: demande.centre_cible_id || null },
            });
          }
        } catch (e) {
          console.warn("[demandes-transfert PATCH] notification centre:", e.message);
        }
      }

      if (action === "test") {
        try {
          const { data: reaffecteurs } = await supabase
            .from("utilisateurs").select("id")
            .in("role", ROLES_ONBOARDING.filter(r => r !== "super_admin" && r !== "admin"))
            .eq("actif", true);
          const pour = (reaffecteurs || []).map(u => u.id).filter(id => !ids.includes(id));
          if (pour.length) {
            await notifyUsers(pour, {
              type:  "demande_transfert",
              titre: `✅ Niveau connu — ${apprenant} peut être réaffecté`,
              message: `Le test de ${apprenant} rend le niveau ${maj.niveau_obtenu}`
                     + `${demande.groupe_nom ? ` (actuellement en ${demande.groupe_nom})` : ""}. `
                     + `Le dossier est prêt dans l'onglet « Dossiers à réaffecter ».`,
              meta: { demande_id: demande.id, niveau: maj.niveau_obtenu },
            });
          }
        } catch (e) {
          console.warn("[demandes-transfert PATCH] notification réaffecteurs:", e.message);
        }
      }
    })();

    res.json({ demande: data,
      ...(Object.keys(resultatMigration).length ? { migration: resultatMigration } : {}) });
  } catch (err) {
    console.error("[demandes-transfert PATCH]", err.message || err);
    res.status(500).json({ error: "Mise à jour impossible" });
  }
});

export default router;
