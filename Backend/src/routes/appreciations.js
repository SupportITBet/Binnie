import express from "express";
import supabase from "../config/supabase.js";
import { authenticateUser } from "../middlewares/auth.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();

/**
 * Appréciation d'une séance par l'apprenant.
 *
 * Le coach est observé quelques fois par trimestre par un deputy, sur une séance choisie.
 * Ceux qui assistent à toutes ses séances n'étaient jamais consultés. Cette note comble
 * l'écart - et c'est précisément pour cela qu'elle doit rester hors de sa vue : un coach
 * qui lit ses notes, surtout nominatives, les rend complaisantes en une séance.
 *
 * Aucune route de ce fichier n'est accessible à un coach. Les lectures exigent
 * `authenticateAdmin` et un rôle de supervision ou de conseil pédagogique.
 */

/** Rôles autorisés à lire les appréciations. Le coach en est absent, délibérément. */
const ROLES_LECTURE = [
  "superviseur", "deputy_superviseur", "pedagogical_advisor",
  "admin", "super_admin", "manager",
];
const requireLecture = (req, res, next) => {
  if (!ROLES_LECTURE.includes(req.role)) {
    return res.status(403).json({ error: "Accès réservé à la supervision" });
  }
  next();
};

/** La table peut ne pas exister encore - le SQL est livré séparément. */
const tableAbsente = (e) =>
  e && (e.code === "42P01" || /appreciations_apprenants/.test(e.message || ""));

/* ══════════════════════════════════════════════════════════════
   GET /api/appreciations/a-noter - ce que l'apprenant connecté doit encore noter
   Alimente le bandeau fixe : tant que la liste n'est pas vide, il reste affiché.
══════════════════════════════════════════════════════════════ */
router.get("/a-noter", authenticateUser, async (req, res) => {
  try {
    /* ══ LA BRANCHE BET E-LEARNING ══════════════════════════════════════════════
       Tout ce qui suit interroge `groupes_apprenants`, `groupes_presences` et
       `seances` : les tables du PRÉSENTIEL. Un apprenant e-learning n'y figure
       nulle part, si bien que `gaIds` était toujours vide et que la route lui
       rendait `{ seances: [] }` — il n'a jamais pu noter son coach, et le PA comme
       le superviseur n'ont jamais eu la moindre note à lire de ce côté.

       Les tables d'ici sont `classes_elearning_apprenants`, `presences_elearning`
       et `seances_elearning`. La table d'écriture, elle, est commune : ses colonnes
       `groupe_id` et `ga_id` accueillent indifféremment une classe ou un groupe —
       c'est d'ailleurs ce que suppose déjà la lecture côté supervision (GET /),
       qui résout `groupe_id` dans l'une ou l'autre paire selon l'en-tête. */
    if (req.headers["x-plateforme"] === "bet-elearning") {
      const [parId, parEmail] = await Promise.all([
        supabase.from("classes_elearning_apprenants").select("id, classe_id").eq("apprenant_id", req.user.id),
        req.user.email
          ? supabase.from("classes_elearning_apprenants").select("id, classe_id").ilike("email", req.user.email)
          : Promise.resolve({ data: [] }),
      ]);
      const rowsId = parId.data || [];
      const vusE   = new Set(rowsId.map(r => r.id));
      const inscrs = [...rowsId, ...(parEmail.data || []).filter(r => !vusE.has(r.id))];
      const inscrIds = inscrs.map(r => r.id);
      if (!inscrIds.length) return res.json({ seances: [] });

      /* Seules les séances SUIVIES comptent : un absent n'a rien vu, sa note ne
         vaudrait rien et fausserait la moyenne du coach. Ici le rapprochement est
         direct — `presences_elearning.seance_id` est renseigné, contrairement au
         présentiel où il faut passer par la paire (groupe, date). */
      const { data: presences } = await supabase
        .from("presences_elearning")
        .select("seance_id, inscription_id, statut")
        .in("inscription_id", inscrIds)
        .in("statut", ["present", "retard"]);
      if (!presences?.length) return res.json({ seances: [] });

      const seanceIds = [...new Set(presences.map(p => p.seance_id).filter(Boolean))];
      if (!seanceIds.length) return res.json({ seances: [] });

      const { data: seances } = await supabase
        .from("seances_elearning")
        .select("id, titre, date_seance, heure_debut, duree_h, classe_id, coach_id, type_cours, statut")
        .in("id", seanceIds)
        .eq("statut", "realisee")
        .order("date_seance", { ascending: false })
        .limit(200);
      const candidates = seances || [];
      if (!candidates.length) return res.json({ seances: [] });

      const coachIdsE = [...new Set(candidates.map(s => s.coach_id).filter(Boolean))];
      const classeIds = [...new Set(candidates.map(s => s.classe_id).filter(Boolean))];
      const [dejaRes, { data: coachs }, { data: classes }] = await Promise.all([
        supabase.from("appreciations_apprenants").select("seance_id")
          .eq("apprenant_id", req.user.id).in("seance_id", candidates.map(s => s.id)),
        coachIdsE.length ? supabase.from("utilisateurs").select("id, nom, prenom").in("id", coachIdsE) : { data: [] },
        classeIds.length ? supabase.from("classes_elearning").select("id, nom").in("id", classeIds)    : { data: [] },
      ]);
      const { data: deja, error: errDeja } = dejaRes;
      if (errDeja && !tableAbsente(errDeja)) throw errDeja;

      const notees   = new Set((deja || []).map(a => a.seance_id));
      const nomCoach = Object.fromEntries((coachs  || []).map(c => [c.id, `${c.prenom || ""} ${c.nom || ""}`.trim()]));
      const nomClasse = Object.fromEntries((classes || []).map(c => [c.id, c.nom]));
      const inscrParClasse = Object.fromEntries(inscrs.map(r => [r.classe_id, r.id]));

      return res.json({
        seances: candidates.filter(s => !notees.has(s.id)).map(s => ({
          ...s,
          // `groupe_id` et `ga_id` : les noms que l'écran et la route d'écriture
          // attendent, quelle que soit la plateforme d'origine.
          groupe_id:  s.classe_id,
          coach_nom:  s.coach_id  ? (nomCoach[s.coach_id]    || null) : null,
          groupe_nom: s.classe_id ? (nomClasse[s.classe_id]  || null) : null,
          ga_id:      inscrParClasse[s.classe_id] || null,
        })),
      });
    }

    // 1. Les rattachements de l'apprenant à ses classes. Les lignes de présence
    //    portent `ga_id`, pas l'identifiant du compte.
    //
    //    Les DEUX resolutions partent ENSEMBLE. Le repli par e-mail etait auparavant
    //    declenche seulement si la premiere ne renvoyait rien : un aller-retour de plus,
    //    en serie, pour tous les apprenants concernes. Chaque appel a Supabase coute ici
    //    200 a 280 ms de latence reseau - l'enchainement se voit a l'ecran.
    const [parId, parEmail] = await Promise.all([
      supabase.from("groupes_apprenants").select("id, groupe_id").eq("apprenant_id", req.user.id),
      req.user.email
        ? supabase.from("groupes_apprenants").select("id, groupe_id").ilike("email_apprenant", req.user.email)
        : Promise.resolve({ data: [] }),
    ]);

    // Le rattachement par identifiant prime ; l'e-mail ne fait que completer.
    const parIdRows = parId.data || [];
    const vus = new Set(parIdRows.map(g => g.id));
    const gaRows = [...parIdRows, ...(parEmail.data || []).filter(g => !vus.has(g.id))];
    const gaIds = gaRows.map(g => g.id);
    if (!gaIds.length) return res.json({ seances: [] });

    // 2. Les séances où il était PRÉSENT. Un absent n'a rien vu : sa note ne
    //    vaudrait rien et fausserait la moyenne du coach.
    const { data: presences } = await supabase
      .from("groupes_presences")
      .select("groupe_id, date_seance, statut, ga_id")
      .in("ga_id", gaIds)
      .in("statut", ["present", "retard"]);

    if (!presences?.length) return res.json({ seances: [] });

    // 3. Les séances réalisées correspondantes. Le rapprochement se fait sur
    //    (groupe, date) : `groupes_presences.seance_id` n'est presque jamais renseigné,
    //    le coach pointant via l'onglet Présences qui ne l'écrit pas.
    const { data: seances } = await supabase
      .from("seances")
      .select("id, titre, date_seance, heure_debut, duree_h, groupe_id, coach_id, type_cours, statut")
      .in("groupe_id", [...new Set(presences.map(p => p.groupe_id))])
      .eq("statut", "realisee")
      .order("date_seance", { ascending: false })
      .limit(200);

    const presentSur = new Set(presences.map(p => `${p.groupe_id}|${p.date_seance}`));
    const gaParGroupe = Object.fromEntries((gaRows || []).map(g => [g.groupe_id, g.id]));
    let candidates = (seances || []).filter(s => presentSur.has(`${s.groupe_id}|${s.date_seance}`));
    if (!candidates.length) return res.json({ seances: [] });

    // 4. Retirer ce qui est déjà noté, et resoudre les noms - EN PARALLELE.
    //
    //    Les noms sont resolus depuis `candidates` et non depuis `restantes`, qui
    //    dependrait de la requete precedente et imposerait donc un aller-retour de plus.
    //    On resout au plus quelques noms inutiles ; c'est sans commune mesure avec le
    //    cout d'un appel reseau supplementaire.
    const coachIds  = [...new Set(candidates.map(s => s.coach_id).filter(Boolean))];
    const groupeIds = [...new Set(candidates.map(s => s.groupe_id).filter(Boolean))];

    const [dejaRes, { data: coachs }, { data: groupes }] = await Promise.all([
      supabase.from("appreciations_apprenants")
        .select("seance_id")
        .eq("apprenant_id", req.user.id)
        .in("seance_id", candidates.map(s => s.id)),
      coachIds.length  ? supabase.from("utilisateurs").select("id, nom, prenom").in("id", coachIds)   : { data: [] },
      groupeIds.length ? supabase.from("groupes").select("id, nom").in("id", groupeIds)               : { data: [] },
    ]);

    const { data: deja, error: errDeja } = dejaRes;
    if (errDeja && !tableAbsente(errDeja)) throw errDeja;

    const notees = new Set((deja || []).map(a => a.seance_id));
    const restantes = candidates.filter(s => !notees.has(s.id));
    const nomCoach  = Object.fromEntries((coachs  || []).map(c => [c.id, `${c.prenom || ""} ${c.nom || ""}`.trim()]));
    const nomGroupe = Object.fromEntries((groupes || []).map(g => [g.id, g.nom]));

    res.json({
      seances: restantes.map(s => ({
        ...s,
        coach_nom:  s.coach_id  ? (nomCoach[s.coach_id]   || null) : null,
        groupe_nom: s.groupe_id ? (nomGroupe[s.groupe_id] || null) : null,
        ga_id:      gaParGroupe[s.groupe_id] || null,
      })),
    });
  } catch (err) {
    console.error("[appreciations/a-noter]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/appreciations - l'apprenant note une séance
══════════════════════════════════════════════════════════════ */
router.post("/", authenticateUser, async (req, res) => {
  try {
    const { seance_id, note, commentaire } = req.body || {};
    const n = Math.round(Number(note));
    if (!seance_id) return res.status(400).json({ error: "seance_id requis" });
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      return res.status(400).json({ error: "La note doit être comprise entre 1 et 5" });
    }

    /* ══ LA BRANCHE BET E-LEARNING ══════════════════════════════════════════════
       Même raison que dans /a-noter : la vérification qui suit cherche la séance et
       l'inscription dans les tables du présentiel, où un apprenant e-learning
       n'existe pas. Sa note était donc refusée avant même d'être écrite.
       La ligne enregistrée reste identique — `groupe_id` reçoit la classe et `ga_id`
       l'inscription — ce que la lecture côté supervision sait déjà interpréter. */
    if (req.headers["x-plateforme"] === "bet-elearning") {
      const { data: sE } = await supabase
        .from("seances_elearning").select("id, classe_id, coach_id, statut, date_seance")
        .eq("id", seance_id).maybeSingle();
      if (!sE) return res.status(404).json({ error: "Séance introuvable" });

      const { data: parId } = await supabase
        .from("classes_elearning_apprenants").select("id, nom_complet")
        .eq("apprenant_id", req.user.id).eq("classe_id", sE.classe_id);
      let insc = parId?.[0] || null;
      if (!insc && req.user.email) {
        const { data: parMail } = await supabase
          .from("classes_elearning_apprenants").select("id, nom_complet")
          .ilike("email", req.user.email).eq("classe_id", sE.classe_id);
        insc = parMail?.[0] || null;
      }
      if (!insc) return res.status(403).json({ error: "Vous n'êtes pas inscrit à cette classe" });

      /* Présent ou en retard, comme côté dash : un absent n'a rien vu de la séance.
         Le rapprochement est direct, `presences_elearning` portant `seance_id`. */
      const { data: pres } = await supabase
        .from("presences_elearning").select("statut")
        .eq("inscription_id", insc.id).eq("seance_id", seance_id).maybeSingle();
      if (!pres || !["present", "retard"].includes(pres.statut)) {
        return res.status(403).json({ error: "Seuls les apprenants présents à cette séance peuvent la noter" });
      }

      const { data: dE, error: eE } = await supabase
        .from("appreciations_apprenants")
        .insert({
          seance_id,
          coach_id:      sE.coach_id  || null,
          groupe_id:     sE.classe_id || null,
          apprenant_id:  req.user.id,
          ga_id:         insc.id,
          nom_apprenant: insc.nom_complet || null,
          note: n,
          commentaire: (commentaire || "").trim().slice(0, 1000) || null,
        })
        .select().single();
      if (eE) {
        if (tableAbsente(eE)) return res.status(503).json({ error: "Les appréciations ne sont pas encore activées." });
        // 23505 : une note existe déjà pour cette séance - on ne note qu'une fois.
        if (eE.code === "23505") return res.status(409).json({ error: "Vous avez déjà noté cette séance." });
        throw eE;
      }
      return res.status(201).json({ appreciation: dE });
    }

    const { data: seance } = await supabase
      .from("seances")
      .select("id, groupe_id, coach_id, statut")
      .eq("id", seance_id)
      .maybeSingle();
    if (!seance) return res.status(404).json({ error: "Séance introuvable" });

    // La règle centrale, verifiee ICI et pas seulement dans l'interface : un client
    // modifie pourrait sinon noter une seance a laquelle il n'a pas assiste.
    const { data: gaRows } = await supabase
      .from("groupes_apprenants")
      .select("id, nom_apprenant, prenom_apprenant")
      .eq("apprenant_id", req.user.id)
      .eq("groupe_id", seance.groupe_id);
    let ga = gaRows?.[0] || null;
    if (!ga && req.user.email) {
      const { data: parEmail } = await supabase
        .from("groupes_apprenants")
        .select("id, nom_apprenant, prenom_apprenant")
        .ilike("email_apprenant", req.user.email)
        .eq("groupe_id", seance.groupe_id);
      ga = parEmail?.[0] || null;
    }
    if (!ga) return res.status(403).json({ error: "Vous n'êtes pas inscrit à cette classe" });

    const { data: seanceDate } = await supabase
      .from("seances").select("date_seance").eq("id", seance_id).maybeSingle();
    const { data: presence } = await supabase
      .from("groupes_presences")
      .select("statut")
      .eq("ga_id", ga.id)
      .eq("groupe_id", seance.groupe_id)
      .eq("date_seance", seanceDate?.date_seance)
      .maybeSingle();

    if (!presence || !["present", "retard"].includes(presence.statut)) {
      return res.status(403).json({
        error: "Seuls les apprenants présents à cette séance peuvent la noter",
      });
    }

    const ligne = {
      seance_id,
      coach_id:     seance.coach_id || null,
      groupe_id:    seance.groupe_id || null,
      apprenant_id: req.user.id,
      ga_id:        ga.id,
      nom_apprenant: `${ga.prenom_apprenant || ""} ${ga.nom_apprenant || ""}`.trim() || null,
      note: n,
      commentaire: (commentaire || "").trim().slice(0, 1000) || null,
    };

    const { data, error } = await supabase
      .from("appreciations_apprenants").insert(ligne).select().single();

    if (error) {
      // 23505 = l'index unique a joue : la seance est deja notee. Ce n'est pas une
      // panne, c'est un double envoi - un rafraichissement de page, le plus souvent.
      if (error.code === "23505") {
        return res.status(409).json({ error: "Vous avez déjà noté cette séance" });
      }
      if (tableAbsente(error)) {
        return res.status(503).json({ error: "Module d'appréciation pas encore activé" });
      }
      throw error;
    }
    res.status(201).json({ appreciation: data });
  } catch (err) {
    console.error("[appreciations POST]", err.message || err);
    res.status(500).json({ error: "Enregistrement impossible" });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /api/appreciations - lecture pour le superviseur et le PA
══════════════════════════════════════════════════════════════ */
router.get("/", authenticateAdmin, requireLecture, async (req, res) => {
  try {
    const { coach_id, groupe_id, du, au } = req.query;
    let q = supabase
      .from("appreciations_apprenants")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (coach_id)  q = q.eq("coach_id", coach_id);
    if (groupe_id) q = q.eq("groupe_id", groupe_id);
    if (du) q = q.gte("created_at", `${du}T00:00:00`);
    if (au) q = q.lte("created_at", `${au}T23:59:59`);

    const { data, error } = await q;
    if (error) {
      if (tableAbsente(error)) return res.json({ appreciations: [] });
      throw error;
    }

    // Enrichir : les écrans affichent le coach, la classe et la date du cours - pas
    // des identifiants.
    const coachIds  = [...new Set((data || []).map(a => a.coach_id).filter(Boolean))];
    const groupeIds = [...new Set((data || []).map(a => a.groupe_id).filter(Boolean))];
    const seanceIds = [...new Set((data || []).map(a => a.seance_id).filter(Boolean))];

    /* CHAQUE PLATEFORME A SES PROPRES CLASSES ET SÉANCES. `appreciations_apprenants` n'a
       pas de colonne `plateforme` : son seul rattachement est `groupe_id`, qui désigne
       soit un `groupes` (classe dash), soit un `classes_elearning`. On résout donc dans la
       paire de tables de la plateforme qui demande, et on ne renvoie que les appréciations
       dont la classe s'y trouve.
       Sans ce filtre, le PA de bet-elearning aurait lu les appréciations laissées sur les
       cours présentiel de dash - la même fuite que celle corrigée sur les modules, les
       apprenants et les messages.
       Dash n'envoie pas l'en-tête : son comportement est inchangé. */
    const versBet = req.headers["x-plateforme"] === "bet-elearning";
    const tableClasses = versBet ? "classes_elearning" : "groupes";
    const tableSeances = versBet ? "seances_elearning" : "seances";

    const sur = (p) => p.then(r => (r?.error ? { data: [] } : r), () => ({ data: [] }));
    const [{ data: coachs }, { data: groupes }, { data: seances }] = await Promise.all([
      coachIds.length  ? sur(supabase.from("utilisateurs").select("id, nom, prenom, avatar_url").in("id", coachIds)) : { data: [] },
      groupeIds.length ? sur(supabase.from(tableClasses).select("id, nom, niveau").in("id", groupeIds))             : { data: [] },
      seanceIds.length ? sur(supabase.from(tableSeances).select("id, titre, date_seance, type_cours").in("id", seanceIds)) : { data: [] },
    ]);
    const mapC = Object.fromEntries((coachs  || []).map(c => [c.id, c]));
    const mapG = Object.fromEntries((groupes || []).map(g => [g.id, g]));
    const mapS = Object.fromEntries((seances || []).map(s => [s.id, s]));

    /* Une appréciation SANS classe résolue appartient à l'autre plateforme : on l'écarte
       plutôt que de l'afficher sans nom de classe, ce qui la ferait passer pour une
       donnée incomplète d'ici. Celles qui n'ont aucun `groupe_id` restent visibles - elles
       ne sont rattachées à rien et ne trahissent aucune plateforme. */
    const retenues = (data || []).filter(a => !a.groupe_id || mapG[a.groupe_id]);

    res.json({
      appreciations: retenues.map(a => ({
        ...a,
        coach:  a.coach_id  ? (mapC[a.coach_id]  || null) : null,
        groupe: a.groupe_id ? (mapG[a.groupe_id] || null) : null,
        seance: a.seance_id ? (mapS[a.seance_id] || null) : null,
      })),
    });
  } catch (err) {
    console.error("[appreciations GET]", err.message || err);
    res.status(500).json({ error: "Lecture impossible" });
  }
});

export default router;
