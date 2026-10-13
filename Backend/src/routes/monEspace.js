import express from "express";
import supabase from "../config/supabase.js";
import { bornerAFenetre, annoterFenetre } from "../services/lectureSequentielle.js";
import { classesDeLApprenantEl } from "../services/lectureSequentielleElearning.js";
import { estElearning, inscriptionsElearningDe, classeIdsDe } from "../services/plateformeApprenant.js";
import { emailAutorise } from "../services/accesApprenant.js";
import { authenticateUser } from "../middlewares/auth.js";
import { historiqueTestsDe } from "./levelTest.js";

const router = express.Router();

/**
 * PATCH /api/mon-espace/profil - chacun choisit son surnom.
 *
 * Le surnom existait déjà pour le personnel, via `PATCH /api/admin/me`, une route fermée
 * aux comptes non administrateurs. L'apprenant, le coach et le parent en étaient donc
 * exclus alors que la colonne `surnom` vit sur `utilisateurs`, table où ils figurent tous
 * - 189 coachs, 73 apprenants, 19 parents. Rien ne manquait en base, seulement un chemin.
 *
 * La route n'écrit QUE le surnom, et uniquement sur la ligne de l'appelant identifié par
 * son jeton : ni le rôle, ni l'email, ni le périmètre ne sont modifiables ici.
 */
router.patch("/profil", authenticateUser, async (req, res) => {
  try {
    const { surnom } = req.body || {};
    if (surnom !== undefined && surnom !== null && typeof surnom !== "string") {
      return res.status(400).json({ error: "surnom doit être une chaîne" });
    }
    // Une chaîne vide retire le surnom : c'est le seul moyen d'annuler son choix.
    const valeur = (typeof surnom === "string" && surnom.trim()) ? surnom.trim().slice(0, 40) : null;

    const { data, error } = await supabase
      .from("utilisateurs")
      .update({ surnom: valeur })
      .eq("id", req.user.id)
      .select("id, surnom")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Profil introuvable" });

    res.json({ ok: true, surnom: data.surnom });
  } catch (err) {
    console.error("[PATCH /mon-espace/profil]", err.message || err);
    res.status(500).json({ error: "Enregistrement impossible" });
  }
});

/** GET /api/mon-espace/profil - le surnom courant, pour amorcer l'écran. */
router.get("/profil", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("utilisateurs")
      .select("id, nom, prenom, surnom, email, role, avatar_url")
      .eq("id", req.user.id)
      .maybeSingle();
    if (error) throw error;
    res.json({ profil: data || null });
  } catch (err) {
    console.error("[GET /mon-espace/profil]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

const CHAMPS_GA = "id, groupe_id, apprenant_id, nom_apprenant, prenom_apprenant, statut, note, date_ajout, date_retrait";

/* Les statuts d'une inscription encore « vivante » pour l'apprenant : celle qui décrit où il
   en est. `transfere` en est absent - c'est une inscription CLOSE - mais elle appartient
   pleinement à son passé, d'où sa présence dans `parcours` ci-dessous. */
const STATUTS_COURANTS = ["actif", "archive", "retire"];

/**
 * L'apprenant, son inscription courante ET tout son parcours.
 *
 * POURQUOI `parcours` EXISTE
 * Cette fonction ne renvoyait qu'UNE ligne `groupes_apprenants`, la plus récente, en excluant
 * les lignes `transfere`. Or un transfert de classe ne déplace rien : il clôt une ligne et en
 * ouvre une autre, avec un nouvel identifiant. Toutes les lectures qui suivent partant de
 * cette ligne unique - présences, séances, ressources -, l'apprenant transféré perdait d'un
 * coup l'intégralité de son historique : ses présences restaient en base, rattachées à
 * l'ancienne classe, et plus aucun écran ne les lisait.
 *
 * `ga` garde donc exactement son sens d'avant (l'inscription courante, pour « où j'en suis »),
 * et `parcours` porte la suite complète des inscriptions, transferts inclus, pour « ce que
 * j'ai fait ». Chaque ligne y conserve sa fenêtre date_ajout → date_retrait : lire une classe
 * sans sa fenêtre montrerait à l'apprenant une période où il n'y était pas.
 */
async function getIds(email) {
  const propre = email.trim();

  const [{ data: ass }, { data: compte }] = await Promise.all([
    supabase.from("assignations_parcours")
      .select("id")
      .ilike("prospect_email", propre)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // L'email de connexion réel (identifiant technique d'un enfant sans email propre) peut
    // différer de groupes_apprenants.email_apprenant, jamais rétro-mis à jour après création
    // du compte. Sans ce second axe, ces apprenants ne retrouvent rien.
    supabase.from("utilisateurs").select("id").ilike("email", propre).maybeSingle(),
  ]);

  const [{ data: parEmail }, { data: parId }] = await Promise.all([
    supabase.from("groupes_apprenants").select(CHAMPS_GA).ilike("email_apprenant", propre),
    compte?.id
      ? supabase.from("groupes_apprenants").select(CHAMPS_GA).eq("apprenant_id", compte.id)
      : Promise.resolve({ data: [] }),
  ]);

  // Les deux axes se recouvrent le plus souvent : on déduplique sur l'identifiant de ligne.
  const parId_ = new Map();
  [...(parEmail || []), ...(parId || [])].forEach(l => parId_.set(l.id, l));
  const parcours = [...parId_.values()]
    .sort((a, b) => String(a.date_ajout || "").localeCompare(String(b.date_ajout || "")));

  // `ga` = l'inscription courante, choisie comme avant : la plus récente hors `transfere`.
  const ga = [...parcours]
    .filter(l => STATUTS_COURANTS.includes(l.statut))
    .sort((a, b) => String(b.date_ajout || "").localeCompare(String(a.date_ajout || "")))[0] || null;

  // assignation_id posé dans groupes_apprenants.note à la création de la classe privée -
  // lien direct et fiable, prioritaire sur le match par prospect_email ci-dessus qui échoue
  // pour un coaching privé enfant : prospect_email est celui du PARENT (qui a rempli le
  // formulaire), alors que l'email de connexion ici est celui, propre, de l'ENFANT.
  let assignationIdParNote = null;
  if (ga?.note) {
    try { assignationIdParNote = JSON.parse(ga.note).assignation_id || null; } catch {}
  }

  return { assignation_id: assignationIdParNote || ass?.id || null, ga, parcours };
}

/**
 * Les présences d'un apprenant du portail bet-elearning.
 *
 * Elles vivent dans `presences_elearning`, rattachées à l'inscription et à la séance. La
 * lecture de dash passe par `presences_privees` et `groupes_presences`, où un apprenant
 * e-learning n'a aucune ligne : il recevait une liste vide, sur le web comme sur mobile.
 *
 * On rend les mêmes champs que la branche dash — `date_seance`, `statut`, `source` — pour
 * que les écrans n'aient pas à connaître deux formes de présence.
 */
async function presencesElearningDe(email) {
  const propre = email.trim();
  const { data: compte } = await supabase
    .from("utilisateurs").select("id").ilike("email", propre).maybeSingle();

  const inscriptions = await inscriptionsElearningDe({ id: compte?.id || null, email: propre });
  const inscrIds = inscriptions.map(i => i.id);
  if (!inscrIds.length) return [];

  const { data: brutes } = await supabase
    .from("presences_elearning")
    .select("*, seance:seances_elearning(date, heure_debut, heure_fin, type, classe_id, objectifs_session)")
    .in("inscription_id", inscrIds);

  const classeIds = classeIdsDe(inscriptions);
  const { data: classes } = classeIds.length
    ? await supabase.from("classes_elearning").select("id, nom, statut").in("id", classeIds)
    : { data: [] };
  const nomClasse = Object.fromEntries((classes || []).map(c => [c.id, c.nom]));

  return (brutes || [])
    .map(p => ({
      ...p,
      date_seance: p.seance?.date || null,
      heure_debut: p.seance?.heure_debut || null,
      /* Le présentiel existe aussi en e-learning : l'étiqueter « session live » ferait
         passer un cours en salle pour une visio, exactement le défaut corrigé côté dash. */
      source:      p.seance?.type === "presentiel" ? "cours" : "session_live",
      plateforme:  p.seance?.type === "presentiel" ? "presentiel" : null,
      session_titre: p.seance?.objectifs_session || null,
      classe_nom:  nomClasse[p.seance?.classe_id] || null,
    }))
    .sort((a, b) => String(b.date_seance || "").localeCompare(String(a.date_seance || "")));
}

/**
 * Les séances d'un apprenant du portail bet-elearning.
 *
 * ── CE QUI CHANGE PAR RAPPORT À DASH ──
 * Les séances y sont rattachées à une CLASSE (`seances_elearning.classe_id`), pas à une
 * inscription, et `classes_elearning_apprenants` ne porte aucune date de sortie : la
 * fenêtre est donc « depuis son inscription », sans « après son départ » à distinguer.
 * C'est la même limite que celle documentée dans `lectureSequentielleElearning.js`, et on
 * s'y tient plutôt que d'inventer un bornage sur des colonnes qui n'existent pas.
 *
 * Une séance tenue AVANT l'arrivée de l'apprenant n'est pas la sienne : il n'y était pas,
 * et la faire figurer dans son planning laisserait croire à une absence.
 *
 * On renvoie `lien_visio` et `type_session` normalisés comme le reste de l'application :
 * l'écran de planning y applique la règle d'ouverture de salle (H-10) sans avoir à savoir
 * laquelle des trois colonnes `lien_zoom` / `lien_meet` / `lien_teams` le coach a remplie.
 */
async function seancesElearningDe(email) {
  const propre = email.trim();
  const { data: compte } = await supabase
    .from("utilisateurs").select("id").ilike("email", propre).maybeSingle();

  const rattachements = await classesDeLApprenantEl({ id: compte?.id || null, email: propre });
  if (!rattachements.length) return [];

  const classeIds = rattachements.map(r => r.classe_id);
  const [{ data: brutes }, { data: classes }] = await Promise.all([
    supabase.from("seances_elearning").select("*").in("classe_id", classeIds)
      .order("date", { ascending: false }),
    supabase.from("classes_elearning").select("id, nom, statut").in("id", classeIds),
  ]);

  const nomDe = Object.fromEntries((classes || []).map(c => [c.id, c]));
  const arriveeDe = Object.fromEntries(
    rattachements.map(r => [r.classe_id, String(r.date_inscription || r.date_ajout || "").slice(0, 10)])
  );

  return (brutes || [])
    .filter(s => {
      const arrivee = arriveeDe[s.classe_id];
      return !arrivee || String(s.date || "") >= arrivee;
    })
    .map(s => ({
      ...s,
      date_seance: s.date,
      date_cours:  s.date,
      titre:       s.objectifs_session || s.bilan_session || null,
      classe_nom:  nomDe[s.classe_id]?.nom || null,
      classe_passee: nomDe[s.classe_id]?.statut === "termine",
      type_session: s.type === "presentiel" ? "presentiel" : "ligne",
      lien_visio:  s.lien_zoom || s.lien_meet || s.lien_teams || null,
    }));
}

/**
 * Lit une table rattachée à une classe sur TOUT le parcours, chaque classe bornée à la
 * fenêtre où l'apprenant y était réellement inscrit.
 *
 * Le bornage n'est pas un raffinement : un apprenant peut quitter une classe puis y revenir,
 * et sans lui il verrait les séances de la période où il n'y était pas. `bornerAFenetre` sait
 * déjà traiter plusieurs périodes par inscription (note.periodes).
 *
 * Chaque ligne repart avec `_classe` : deux présences du même jour dans deux classes
 * différentes seraient sinon indistinguables une fois fusionnées.
 */
/* `griser` choisit ce qu'on fait de ce qui tombe HORS de la fenêtre de présence : l'écarter
   (défaut) ou le renvoyer marqué, à charge pour l'écran de l'afficher en gris. Voir
   `annoterFenetre` pour la raison du choix selon la nature de la donnée. */
async function lireSurLeParcours(parcours, table, champs, dateDe, affiner, griser = false) {
  const lignes = (parcours || []).filter(l => l.groupe_id);
  if (!lignes.length) return [];

  const resultats = await Promise.all(lignes.map(async (ratt) => {
    let q = supabase.from(table).select(champs).eq("groupe_id", ratt.groupe_id);
    if (affiner) q = affiner(q, ratt);
    const { data, error } = await q;
    if (error) {
      console.warn(`[lireSurLeParcours] ${table} / groupe ${ratt.groupe_id}:`, error.message);
      return [];
    }
    const retenus = griser
      ? annoterFenetre(data || [], ratt, dateDe)
      : bornerAFenetre(data || [], ratt, dateDe);
    return retenus
      .map(x => ({ ...x, _classe: { groupe_id: ratt.groupe_id, ga_id: ratt.id, statut: ratt.statut,
                                    date_ajout: ratt.date_ajout, date_retrait: ratt.date_retrait } }));
  }));

  return resultats.flat();
}

/** Les noms des classes traversées, pour que l'apprenant sache d'où vient chaque ligne. */
async function nomsDesClasses(parcours) {
  const ids = [...new Set((parcours || []).map(l => l.groupe_id).filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await supabase.from("groupes").select("id, nom, niveau").in("id", ids);
  const map = {};
  (data || []).forEach(g => { map[g.id] = g; });
  return map;
}

// GET /api/mon-espace/seances?email=xxx
/* ── SES TESTS DE NIVEAU ────────────────────────────────────────────────────────
   L'apprenant voit sa PROGRESSION, pas sa correction. Le niveau, la date et l'origine
   du test : « A2 → B1 » lui montre le chemin parcouru et explique le changement de
   classe qu'il vient de vivre. Le score chiffré reste hors de cette route - un « 42 % »
   sans accompagnement décourage plus qu'il n'informe, et le détail question par question
   appartient à ceux qui corrigent.
   Bornée à son propre dossier par `emailAutorise` : connaître l'e-mail d'un autre ne
   donne pas accès à son historique. */
router.get("/tests-niveau", authenticateUser, async (req, res) => {
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    /* LE TEST D'UN APPRENANT E-LEARNING N'EST PAS DANS `level_test_results`. Son niveau est
       posé sur son inscription (`inscriptions_elearning.niveau_detecte` + `date_test`), par
       le circuit de placement. L'historique revenait donc vide, et l'écran lui affirmait
       qu'il n'avait jamais passé de test — alors que c'est ce test qui lui a valu sa classe.
       Vérifié : niveau A1 détecté le 11/10/2026, invisible jusqu'ici. */
    if (estElearning(req)) {
      const { data: inscrs } = await supabase
        .from("inscriptions_elearning")
        .select("id, niveau_detecte, date_test, created_at")
        .ilike("email", email.trim())
        .not("niveau_detecte", "is", null);
      return res.json({
        historique: (inscrs || [])
          .map(i => ({
            id: i.id,
            level: i.niveau_detecte,
            submitted_at: i.date_test || i.created_at,
            source: "placement_elearning",
          }))
          .sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || ""))),
      });
    }

    const { assignation_id } = await getIds(email);
    const tous = await historiqueTestsDe({ assignation_id, email });
    res.json({
      historique: tous.map(t => ({
        id: t.id,
        level: t.level,
        submitted_at: t.submitted_at,
        source: t.source,
      })),
    });
  } catch (e) {
    console.error("[mon-espace/tests-niveau]", e.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.get("/seances", authenticateUser, async (req, res) => {
  /* AUTHENTIFIÉE. Cette route répondait sans jeton, l'e-mail passant en clair dans l'URL :
     le connaître suffisait à lire les données de son porteur. Le paramètre reste - le
     dashboard parent consulte son enfant, dont l'identifiant n'est pas le sien - mais il
     est maintenant confronté à l'identité réelle du demandeur. */
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    /* DEUX PLATEFORMES, DEUX JEUX DE TABLES — UNE SEULE ROUTE.
       Un apprenant du portail e-learning n'a aucune ligne dans `groupes_apprenants` ni
       dans `seances` : la lecture ci-dessous ne pouvait donc RIEN lui renvoyer, et son
       onglet « Mon planning » affichait « Aucune séance » alors que son coach en avait
       programmé cinq. Ses séances vivent dans `seances_elearning`, rattachées à sa classe.
       On choisit la source selon la plateforme de la requête — comme `contexteMarquage` /
       `contexteMarquageEl` le font déjà pour le verrou de lecture — plutôt que d'ouvrir une
       seconde route de planning : deux routes rendant la même donnée finissent par
       diverger, et personne ne sait plus laquelle fait foi. */
    if (String(req.headers["x-plateforme"] || "").toLowerCase() === "bet-elearning") {
      return res.json({ seances: await seancesElearningDe(email) });
    }

    const { assignation_id, ga, parcours } = await getIds(email);
    let data = [];

    /* Source actuelle : table unifiée `seances` (remplace seances_privees - le coach
       l'utilise désormais pour toutes ses séances via groupe_id), sans quoi une séance
       récente n'apparaît jamais côté apprenant alors qu'elle est bien comptée dans les
       honoraires du coach.

       LU SUR TOUT LE PARCOURS, et non sur la seule classe du moment : les séances suivies
       dans une classe précédente sont les siennes, il les a faites. Chacune reste bornée à
       la fenêtre de l'inscription correspondante - les séances tenues avant son arrivée ou
       après son départ ne lui appartiennent pas, et c'est ce bornage, pas l'identité de la
       classe, qui doit les écarter. */
    if (parcours?.length) {
      const brutes = await lireSurLeParcours(parcours, "seances", "*", s => s.date_seance);
      const classes = await nomsDesClasses(parcours);
      data = brutes
        .map(s => ({ ...s, classe_nom: classes[s._classe.groupe_id]?.nom || null,
                           classe_passee: s._classe.statut === "transfere" }))
        .sort((a, b) => String(b.date_seance || "").localeCompare(String(a.date_seance || "")));
    }

    if (data.length === 0 && assignation_id) {
      const { data: seancesOld } = await supabase
        .from("seances_privees")
        .select("*")
        .eq("assignation_id", assignation_id)
        .order("date_seance", { ascending: false });
      data = seancesOld || [];
    }

    // Normaliser date_seance → date_cours + calculer heure_fin depuis duree_h
    const seances = data.map(s => {
      let heure_fin = null;
      if (s.heure_debut && s.duree_h) {
        const [h, m] = s.heure_debut.split(":").map(Number);
        const totalMin = h * 60 + m + Math.round(s.duree_h * 60);
        heure_fin = `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
      }
      return { ...s, date_cours: s.date_seance, heure_fin };
    });
    res.json({ seances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mon-espace/presences?email=xxx
router.get("/presences", authenticateUser, async (req, res) => {
  /* AUTHENTIFIÉE. Cette route répondait sans jeton, l'e-mail passant en clair dans l'URL :
     le connaître suffisait à lire les données de son porteur. Le paramètre reste - le
     dashboard parent consulte son enfant, dont l'identifiant n'est pas le sien - mais il
     est maintenant confronté à l'identité réelle du demandeur. */
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    /* `parcours` MANQUAIT DANS CETTE DÉSTRUCTURATION, et c'était un 500 systématique : le bloc 2
       ci-dessous teste `parcours?.length` sur une variable jamais déclarée, ce qui lève un
       `ReferenceError` attrapé par le `catch` et renvoyé en « parcours is not defined ». Toute
       demande de présences échouait donc — dans l'espace apprenant web comme dans le dashboard
       parent — alors que `getIds()` rend bien cette valeur. Vérifié le 07/10/2026 sur un
       apprenant réel : 500 avant, 7 présences après.

       L'optionnel `parcours?.length` est précisément ce qui a caché l'erreur à la relecture : il
       donne au lecteur l'impression que le cas « absent » est géré. Sur une variable non
       déclarée, `?.` ne protège de rien — seul `typeof` le ferait. */
    /* LES PRÉSENCES E-LEARNING SONT AILLEURS. Elles vivent dans `presences_elearning`,
       rattachées à l'inscription et à la séance — pas dans `presences_privees` ni
       `groupes_presences`. Sans cet aiguillage, l'apprenant e-learning recevait une liste
       vide, sur le web comme sur l'application mobile. */
    if (estElearning(req)) {
      return res.json({ presences: await presencesElearningDe(email) });
    }

    const { assignation_id, ga, parcours } = await getIds(email);
    let presences = [];

    // 1. Presences privées (coaching privé - séances régulières)
    if (assignation_id) {
      const { data } = await supabase
        .from("presences_privees")
        .select("*, seances_privees(date_seance, heure_debut)")
        .eq("assignation_id", assignation_id)
        .order("date_presence", { ascending: false });
      if (data?.length) {
        presences = data.map(p => ({
          ...p,
          date_seance: p.date_presence || p.seances_privees?.date_seance || null,
          source: "cours",
        }));
      }
    }

    /* 2. Présences de groupe (groupe coaching ET sessions live) - SUR TOUT LE PARCOURS.
       Une présence appartient à l'apprenant, pas à la classe : celles d'une classe qu'il a
       quittée restaient en base sans qu'aucun écran ne les lise, et son assiduité repartait
       de zéro à chaque transfert. Le rattachement se fait sur le ga_id de CHAQUE inscription,
       avec le repli sur le nom pour les feuilles d'appel saisies sans ga_id. */
    if (parcours?.length) {
      const gpFiltered = (await lireSurLeParcours(
        parcours, "groupes_presences", "*", p => p.date_seance,
      )).filter(p => {
        const ratt = parcours.find(l => l.id === p._classe.ga_id);
        return String(p.ga_id) === String(p._classe.ga_id) ||
          (!!ratt && p.nom_apprenant === ratt.nom_apprenant && p.prenom_apprenant === ratt.prenom_apprenant);
      });

      if (gpFiltered.length > 0) {
        const classes = await nomsDesClasses(parcours);
        /* Croiser avec sessions_live - en RETENANT LA PLATEFORME.
           Seule la date était rapportée, si bien que toute séance issue d'une session
           portait l'étiquette « Session Live » chez l'apprenant, présentiel compris : les
           cinq séances en salle de cette classe s'affichaient comme des visios. */
        const { data: liveSessions } = await supabase
          .from("sessions_live")
          .select("date, plateforme, titre, groupe_id")
          .in("groupe_id", [...new Set(parcours.map(l => l.groupe_id).filter(Boolean))])
          .eq("statut", "terminee");

        // Clé CLASSE + DATE : sur plusieurs classes, deux séances du même jour se
        // confondraient et l'une hériterait de la plateforme de l'autre.
        const parDate = new Map((liveSessions || []).map(s => [`${s.groupe_id}|${s.date}`, s]));

        const gpMapped = gpFiltered.map(p => {
          const sl = parDate.get(`${p._classe.groupe_id}|${p.date_seance}`) || null;
          return {
            ...p,
            source: sl ? "session_live" : "cours",
            // « presentiel » ou le nom du service de visio (zoom, meet, jitsi…) : c'est
            // l'écran qui décide du libellé, pas le serveur.
            plateforme: sl?.plateforme || null,
            session_titre: sl?.titre || null,
            classe_nom: classes[p._classe.groupe_id]?.nom || null,
            classe_passee: p._classe.statut === "transfere",
          };
        });

        // Fusionner : les présences groupes s'ajoutent aux présences privées (pas de doublon de date)
        const existingDates = new Set(presences.map(p => p.date_seance));
        const toAdd = gpMapped.filter(p => !existingDates.has(p.date_seance));
        presences = [...presences, ...toAdd].sort((a, b) =>
          (b.date_seance || "").localeCompare(a.date_seance || "")
        );
      }
    }

    res.json({ presences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mon-espace/fichiers?email=xxx
router.get("/fichiers", authenticateUser, async (req, res) => {
  /* AUTHENTIFIÉE. Cette route répondait sans jeton, l'e-mail passant en clair dans l'URL :
     le connaître suffisait à lire les données de son porteur. Le paramètre reste - le
     dashboard parent consulte son enfant, dont l'identifiant n'est pas le sien - mais il
     est maintenant confronté à l'identité réelle du demandeur. */
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    const { assignation_id, parcours } = await getIds(email);
    let fichiers = [];

    if (assignation_id) {
      const { data } = await supabase
        .from("fichiers_prives")
        .select("*")
        .eq("assignation_id", assignation_id)
        .order("created_at", { ascending: false });
      if (data?.length) fichiers = data;
    }

    /* Fallback : les fichiers des classes, SUR TOUT LE PARCOURS.
       Ils étaient lus sur la seule classe du moment : un apprenant transféré perdait d'un coup
       tous les supports partagés par son coach précédent - des documents qu'il avait pourtant
       reçus et travaillés. Un support déposé pendant qu'il était là lui appartient.

       BORNÉ A SA FENÊTRE DANS CHAQUE CLASSE, et c'est ce qui rend l'ouverture sûre : sans ce
       bornage, il verrait aussi ce que son ancien coach a déposé APRÈS son départ - ses cours
       se ferment, ses ressources doivent se fermer avec.

       GRISÉ, ET NON PLUS MASQUÉ, pour les deux cas qui se produisent en cours de parcours :
       déposé avant son entrée dans la classe, ou pendant une période d'arrêt. Les faire
       disparaître laissait l'apprenant devant une liste plus courte que celle de ses
       camarades, sans un mot d'explication - alors que ses COURS, eux, étaient déjà grisés
       avec leur raison. Ce qui a été déposé après son départ reste masqué : il n'y était
       plus, et ne l'a donc jamais eu. */
    if (fichiers.length === 0 && parcours?.length) {
      const visibles = await lireSurLeParcours(
        parcours, "groupes_fichiers", "*", f => f.created_at, null, true,
      );
      if (visibles.length) {
        const classes = await nomsDesClasses(parcours);
        fichiers = visibles
          .map(f => ({
            ...f,
            nom: f.nom || f.titre,
            url: f.url,
            // D'où vient ce document : sans cela, deux supports homonymes de deux classes
            // différentes seraient indiscernables une fois la liste fusionnée.
            classe_nom: classes[f._classe.groupe_id]?.nom || null,
            classe_passee: f._classe.statut === "transfere",
          }))
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      }
    }

    res.json({ fichiers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mon-espace/cours-groupe?email=xxx
// Cours du groupe (coaching groupe) - séances planifiées par le coach
router.get("/cours-groupe", authenticateUser, async (req, res) => {
  /* AUTHENTIFIÉE. Cette route répondait sans jeton, l'e-mail passant en clair dans l'URL :
     le connaître suffisait à lire les données de son porteur. Le paramètre reste - le
     dashboard parent consulte son enfant, dont l'identifiant n'est pas le sien - mais il
     est maintenant confronté à l'identité réelle du demandeur. */
  const email = await emailAutorise(req.user, req.query.email);
  if (!email) return res.status(403).json({ error: "Accès refusé à ces données" });
  try {
    const { ga } = await getIds(email);
    if (!ga?.groupe_id) return res.json({ cours: [], groupe: null });

    /* CE CAHIER DE TEXTE EST CELUI DE LA CLASSE, PAS LE JOURNAL DE L'APPRENANT.
       Les deux requêtes étaient bornées à sa date d'arrivée : un apprenant intégrant une
       classe déjà commencée - ou transféré, sa date d'arrivée devenant celle du transfert -
       ne voyait rien de ce qui avait été traité avant lui. Il ne pouvait donc pas rattraper
       le programme, alors que c'est précisément ce qu'on attend d'un cahier de texte.

       La borne est levée ici, et ICI SEULEMENT. `/seances` reste bornée : elle répond à
       « quelles séances me concernent » et alimente présences et honoraires. Ce qui précède
       l'arrivée est donc montré, mais MARQUÉ `avant_mon_arrivee` - lisible sans être
       confondu avec ce que l'apprenant a suivi. */
    const debut = ga.date_ajout ? ga.date_ajout.slice(0, 10) : null;
    const avant = (d) => !!debut && !!d && String(d).slice(0, 10) < debut;

    const coursQuery = supabase.from("groupes_cours")
      .select("id, date_cours, objectif, grammaire, sujet_discussion, statut, commentaire, created_at")
      .eq("groupe_id", ga.groupe_id);

    // `groupes_cours` a été remplacée par la table unifiée `seances` : elle est VIDE (0 ligne
    // au total), et cette route n'interrogeait qu'elle. Résultat : l'onglet Planning de tout
    // apprenant en groupe était vide, alors que son coach y avait bien programmé ses séances.
    // On fusionne les deux sources, exactement comme GET /api/groupes/:id/cours.
    const seancesQuery = supabase.from("seances")
      .select("id, date_seance, heure_debut, heure_fin, titre, objectif, statut, notes, duree_h")
      .eq("groupe_id", ga.groupe_id)
      .neq("statut", "corbeille");

    const [{ data: cours }, { data: seancesNew }, { data: groupe }] = await Promise.all([
      coursQuery.order("date_cours", { ascending: false }),
      seancesQuery.order("date_seance", { ascending: false }),
      supabase.from("groupes")
        .select("id, nom, niveau, filiere, horaire, type_cours, coach_id, utilisateurs(nom, prenom)")
        .eq("id", ga.groupe_id)
        .maybeSingle(),
    ]);

    // L'écran de l'apprenant trie et affiche sur `date_cours` : on expose ce nom plutôt que
    // de faire porter le renommage à chaque lecteur.
    const tous = [
      ...(cours || []).map((c) => ({ ...c, avant_mon_arrivee: avant(c.date_cours) })),
      ...(seancesNew || []).map((s) => ({
        ...s,
        date_cours: s.date_seance,
        objectif: s.objectif || s.titre,
        commentaire: s.notes || null,
        avant_mon_arrivee: avant(s.date_seance),
      })),
    ].sort((a, b) => String(b.date_cours || "").localeCompare(String(a.date_cours || "")));

    res.json({ cours: tous, groupe: groupe || null, date_arrivee: debut });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mon-espace/mon-parcours
 *
 * Le dossier de l'apprenant tel qu'il le concerne : son objectif, son niveau et son plan de
 * paiement. Une seule route pour DEUX écrans - « Objectifs » et « Paiement » - parce que
 * c'est une seule ligne en base : les séparer aurait fait deux requêtes pour le même
 * enregistrement, et deux endroits où corriger le jour où le dossier change de forme.
 *
 * LE LIEN EST L'E-MAIL. `assignations_parcours` n'a pas de clé vers `utilisateurs` : le
 * dossier est créé par la commerciale AVANT que le compte n'existe, et `prospect_email` est
 * le seul point commun. `ilike` et non `eq` : les adresses y ont été saisies à la main, la
 * casse varie.
 *
 * ON NE REND JAMAIS LE DOSSIER D'UN AUTRE : la recherche part de l'e-mail du porteur du
 * jeton, jamais d'un paramètre de requête. Et on ne rend que les champs qui le regardent -
 * ni notes internes, ni identité de l'assistante, ni routage commercial.
 */
router.get("/mon-parcours", authenticateUser, async (req, res) => {
  try {
    const { data: moi } = await supabase
      .from("utilisateurs").select("email").eq("id", req.user.id).maybeSingle();
    const email = moi?.email || req.user.email;
    if (!email) return res.json({ parcours: null });

    const { data, error } = await supabase
      .from("assignations_parcours")
      .select("id, niveau_client, objectif_client, type_cours, type_coaching, statut, "
            + "statut_paiement, mode_paiement, montant_paye, plan_paiement, inscription_offre, "
            + "date_debut_formation, created_at")
      .ilike("prospect_email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    // `null` et non une erreur : un apprenant inscrit par son entreprise n'a pas forcément
    // de dossier commercial, et ce n'est pas une anomalie. L'écran le dira.
    res.json({ parcours: data || null });
  } catch (err) {
    console.error("[GET /mon-espace/mon-parcours]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/**
 * POST /api/mon-espace/support - l'apprenant demande de l'aide.
 *
 * La route `/api/plaintes` exige `authenticateAdmin` ET la permission « support.create » :
 * un apprenant n'a ni l'un ni l'autre, et n'avait donc AUCUN moyen de signaler quoi que ce
 * soit. Celle-ci lui ouvre le même registre, avec son identité prise du jeton plutôt que du
 * corps de la requête - sans quoi n'importe qui pourrait déposer une demande au nom d'un
 * autre.
 */
router.post("/support", authenticateUser, async (req, res) => {
  try {
    const { objet, description, priorite } = req.body || {};
    if (!String(objet || "").trim()) return res.status(400).json({ error: "Un objet est requis." });

    const { data: moi } = await supabase
      .from("utilisateurs").select("id, nom, prenom, email, telephone").eq("id", req.user.id).maybeSingle();
    const nom = `${moi?.prenom || ""} ${moi?.nom || ""}`.trim() || moi?.email || "Apprenant";

    const { data, error } = await supabase.from("plaintes").insert({
      ref_type:            "general",
      apprenant_nom:       nom,
      apprenant_email:     moi?.email || null,
      apprenant_telephone: moi?.telephone || null,
      objet:               String(objet).trim().slice(0, 200),
      description:         description ? String(description).trim().slice(0, 4000) : null,
      // L'apprenant ne choisit pas « urgente » : la priorité est un arbitrage interne, et
      // la lui laisser rendrait le tri inutile dès la première demande.
      priorite:            priorite === "haute" ? "haute" : "normale",
      statut:              "ouverte",
      signale_par_id:      moi?.id || null,
      signale_par_nom:     nom,
    }).select().single();
    if (error) throw error;

    res.status(201).json({ demande: data });
  } catch (err) {
    console.error("[POST /mon-espace/support]", err.message || err);
    res.status(500).json({ error: "Envoi impossible" });
  }
});

export default router;
