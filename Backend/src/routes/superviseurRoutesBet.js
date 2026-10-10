// Routes Superviseur / Deputy Superviseur - bet-elearning UNIQUEMENT.
// Scindé depuis l'ancien superviseurRoutes.js (partagé dash + bet-elearning)
// pour que les deux plateformes n'aient plus aucun chemin de code commun sur
// ce module - même principe que gamification.js/gamificationDash.js et
// contenusOnboarding.js/contenusOnboardingDash.js.
// Différence avec la version dash : les actions de mutation passent en plus
// par requirePermission(module, action) - la matrice de permissions
// bet-elearning (GestionDroits.jsx) contrôle réellement ces routes, ce qui
// n'était pas le cas avant (seul un contrôle de rôle fixe existait).
// Voir Backend/sql/permissions_extension_4_superviseur.sql pour les droits
// nécessaires à deputy_superviseur (rapports.manage, remplacements.update)
// - sans ce script, un deputy connecté depuis bet-elearning ne pourra plus
// soumettre de rapport d'observation ni mettre à jour ses missions.
// "missions" (assignation/mise à jour des missions du Deputy) a été extrait
// de "remplacements" - les missions d'observation n'ont rien à voir avec les
// remplacements de coachs. Retombe automatiquement sur les droits déjà
// accordés sur "remplacements" tant qu'aucune ligne "missions" dédiée
// n'existe (voir MODULE_FALLBACK_PARENT dans requireAdmin.js).
import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { onRapportTransmis } from "../services/gamificationCoach.js";
import { noteObservation, syntheseObservation } from "../services/noteObservation.js";

const router = express.Router();

const ROLES_SUP_ALL    = ["superviseur", "deputy_superviseur", "super_admin", "admin_superviseur", "admin_deputy_superviseur"];
const ROLES_SUP_GLOBAL = ["superviseur", "super_admin", "admin_superviseur"];
const IS_DEPUTY = (role) => ["deputy_superviseur", "admin_deputy_superviseur"].includes(role);

const PLATEFORME = "bet-elearning";

// Le rôle "coach" est un concept 100% dash - un coach n'apparaît côté
// bet-elearning que s'il y est habilité (acces_elearning=true).
const requeteCoachsBase = (select) =>
  () => supabase.from("utilisateurs").select(select).eq("role", "coach").eq("actif", true).eq("acces_elearning", true);

const requeteDeputiesBase = (select) =>
  () => supabase.from("utilisateurs").select(select).eq("role", "deputy_superviseur").eq("acces_elearning", true);

const requireSuperviseurRole = (req, res, next) => {
  if (!ROLES_SUP_ALL.includes(req.role)) {
    return res.status(403).json({ error: "Accès réservé aux superviseurs" });
  }
  next();
};

const requireGlobalSuperviseur = (req, res, next) => {
  if (!ROLES_SUP_GLOBAL.includes(req.role)) {
    return res.status(403).json({ error: "Accès réservé au Superviseur Général" });
  }
  next();
};

/* ══════════════════════════════════════════════════════════
   GET /api/superviseur/dashboard - KPIs globaux
══════════════════════════════════════════════════════════ */
router.get("/dashboard", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    const [
      { count: nbCoachs },
      { count: nbDeputies },
      { data: evals },
      { data: rapports },
      { data: anomalies },
      { data: missions },
    ] = await Promise.all([
      requeteCoachsBase("id")().then(r => ({ count: (r.data || []).length })),
      requeteDeputiesBase("id")().eq("actif", true).then(r => ({ count: (r.data || []).length })),
      supabase.from("evaluations_coachs").select("coach_id, note_finale, statut").eq("plateforme", PLATEFORME).order("date_evaluation", { ascending: false }).then(r => r.error ? { data: [] } : r),
      supabase.from("rapports_observation").select("id, statut").eq("plateforme", PLATEFORME).then(r => r.error ? { data: [] } : r),
      supabase.from("anomalies_superviseur").select("id, statut").eq("plateforme", PLATEFORME).then(r => r.error ? { data: [] } : r),
      supabase.from("missions_deputy").select("id, statut").eq("plateforme", PLATEFORME).then(r => r.error ? { data: [] } : r),
    ]);

    const coachsEvalues = new Set((evals || []).map(e => e.coach_id)).size;
    const rapportsList  = rapports || [];
    const anomaliesList = anomalies || [];
    const missionsList  = missions || [];

    res.json({
      nb_coachs:              nbCoachs || 0,
      nb_deputies:            nbDeputies || 0,
      nb_coachs_evalues:      coachsEvalues,
      nb_rapports_non_lus:    rapportsList.filter(r => r.statut === "soumis").length,
      nb_rapports_total:      rapportsList.length,
      nb_anomalies_ouvertes:  anomaliesList.filter(a => a.statut === "ouvert").length,
      nb_missions_actives:    missionsList.filter(m => m.statut === "assignée" || m.statut === "en_cours").length,
    });
  } catch (err) {
    console.error("[superviseur/dashboard]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/superviseur/coachs-conformite - liste des coachs + conformité
   ("groupes" est un concept 100% dash, jamais inclus ici)
══════════════════════════════════════════════════════════ */
router.get("/coachs-conformite", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    const { data: coachs } = await requeteCoachsBase("id, nom, prenom, surnom, email, avatar_url, scope, derniere_connexion, actif")()
      .order("nom");

    const { data: evals, error: errEvals } = await supabase
      .from("evaluations_coachs")
      .select("coach_id, note_finale, statut, date_evaluation, periode")
      .eq("plateforme", PLATEFORME)
      .order("date_evaluation", { ascending: false });
    if (errEvals) console.warn("[coachs-conformite] evaluations_coachs:", errEvals.message);

    const { data: rapportsDeputy, error: errRapports } = await supabase
      .from("rapports_observation")
      .select("coach_id, note_globale, statut, date_observation")
      .eq("plateforme", PLATEFORME);
    if (errRapports) console.warn("[coachs-conformite] rapports_observation:", errRapports.message);

    const { data: anomalies, error: errAnomalies } = await supabase
      .from("anomalies_superviseur")
      .select("coach_id, statut")
      .eq("plateforme", PLATEFORME)
      .neq("statut", "fermé");
    if (errAnomalies) console.warn("[coachs-conformite] anomalies:", errAnomalies.message);

    const evalsByCoach = {};
    (evals || []).forEach(e => {
      if (!evalsByCoach[e.coach_id]) evalsByCoach[e.coach_id] = [];
      evalsByCoach[e.coach_id].push(e);
    });

    const rapportsByCoach = {};
    (rapportsDeputy || []).forEach(r => {
      if (!rapportsByCoach[r.coach_id]) rapportsByCoach[r.coach_id] = [];
      rapportsByCoach[r.coach_id].push(r);
    });

    const anomaliesByCoach = {};
    (anomalies || []).forEach(a => {
      anomaliesByCoach[a.coach_id] = (anomaliesByCoach[a.coach_id] || 0) + 1;
    });

    const coachIds = (coachs || []).map(c => c.id);

    /* LES CLASSES DU COACH, vraiment comptées. `nb_groupes` et `groupes` étaient écrits en
       dur à 0 et [] : la colonne « Groupes » affichait zéro pour tout le monde, et serait
       restée à zéro même une fois les classes créées. On lit `classes_elearning` - jamais
       `groupes`, qui est la table de dash. */
    const classesParCoach = {};
    if (coachIds.length) {
      const { data: sesClasses, error: errClasses } = await supabase
        .from("classes_elearning")
        .select("id, nom, niveau, statut, coach_id")
        .in("coach_id", coachIds);
      if (errClasses) console.warn("[coachs-conformite] classes_elearning:", errClasses.message);
      (sesClasses || []).forEach(cl => {
        (classesParCoach[cl.coach_id] = classesParCoach[cl.coach_id] || []).push(cl);
      });
    }

    const authBloqueMap = {};
    if (coachIds.length > 0) {
      const authResults = await Promise.all(
        coachIds.map(id =>
          supabase.auth.admin.getUserById(id)
            .then(r => ({ id, acces_bloque: r.data?.user?.app_metadata?.acces_bloque || false }))
            .catch(() => ({ id, acces_bloque: false }))
        )
      );
      authResults.forEach(r => { authBloqueMap[r.id] = r.acces_bloque; });
    }

    const result = (coachs || []).map(c => {
      const mesEvals     = evalsByCoach[c.id]    || [];
      const mesRapports  = rapportsByCoach[c.id] || [];
      const derniereEval = mesEvals[0] || null;

      const evalNotes    = mesEvals.filter(e => e.note_finale != null).map(e => parseFloat(e.note_finale));
      const rapportNotes = mesRapports.filter(r => r.note_globale != null && parseFloat(r.note_globale) > 0).map(r => parseFloat(r.note_globale));
      const allNotes     = [...evalNotes, ...rapportNotes];
      const moyenneNote  = allNotes.length
        ? (allNotes.reduce((s, n) => s + n, 0) / allNotes.length).toFixed(1)
        : null;

      const aAnomalies       = (anomaliesByCoach[c.id] || 0) > 0;
      const nbEvals          = mesEvals.length;
      const nbRapportsDeputy = mesRapports.length;

      let statut_conformite = "conforme";
      if (aAnomalies)   statut_conformite = "non_conforme";
      else if (nbEvals === 0 && nbRapportsDeputy === 0) statut_conformite = "en_attente";
      else if (moyenneNote && parseFloat(moyenneNote) < 3.0) statut_conformite = "non_conforme";

      return {
        ...c,
        acces_bloque:         authBloqueMap[c.id] || false,
        nb_groupes:           (classesParCoach[c.id] || []).length,
        nb_evaluations:       nbEvals,
        nb_rapports_deputy:   nbRapportsDeputy,
        note_moyenne:         moyenneNote,
        derniere_evaluation:  derniereEval,
        nb_anomalies:         anomaliesByCoach[c.id] || 0,
        statut_conformite,
        groupes:              classesParCoach[c.id] || [],
      };
    });

    res.json({ coachs: result });
  } catch (err) {
    console.error("[superviseur/coachs-conformite]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/superviseur/rapports-deputy - rapports d'observation
══════════════════════════════════════════════════════════ */
router.get("/rapports-deputy", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    const isDeputy = IS_DEPUTY(req.role);
    let q = supabase
      .from("rapports_observation")
      .select(`
        id, deputy_id, coach_id, date_observation, centre, classe,
        seance_id, groupe_id, session_live_id,
        ponctualite, preparation, pedagogie, gestion_classe, respect_programme,
        interactivite_classe, approche_grammaticale, expression_engagement, feedback_correction,
        type_observation, type_lecon, internet,
        professionnalisme, incident_technique, incident_technique_detail,
        observations, recommandations, note_globale, synthese,
        statut, commentaire_superviseur, transmis_pa_le, created_at
      `)
      .eq("plateforme", PLATEFORME)
      .order("created_at", { ascending: false });
    if (isDeputy) q = q.eq("deputy_id", req.profil.id);
    if (req.query.coach_id) q = q.eq("coach_id", req.query.coach_id);
    const { data, error } = await q;

    if (error) {
      if (error.code === "42P01") return res.json({ rapports: [] });
      throw error;
    }

    const rapports = data || [];

    const ids = [...new Set([...rapports.map(r => r.deputy_id), ...rapports.map(r => r.coach_id)].filter(Boolean))];
    let nomMap = {};
    if (ids.length) {
      const { data: users } = await supabase
        .from("utilisateurs")
        .select("id, nom, prenom, avatar_url")
        .in("id", ids);
      (users || []).forEach(u => { nomMap[u.id] = u; });
    }

    // La séance observée, avec ce qu'on sait d'elle - c'est tout l'intérêt du rattachement :
    // une note de ponctualité prend un autre sens à côté d'une salle ouverte avec 20 minutes
    // de retard, et une note de pédagogie à côté d'un cours de 90 min tenu en 34.
    const seanceIds = [...new Set(rapports.map(r => r.seance_id).filter(Boolean))];
    let seanceMap = {};
    if (seanceIds.length) {
      const { data: seances } = await supabase
        .from("seances")
        .select("id, titre, date_seance, heure_debut, heure_fin, duree_h, statut")
        .in("id", seanceIds);
      (seances || []).forEach(x => { seanceMap[x.id] = x; });

      const { data: lives } = await supabase
        .from("sessions_live")
        .select("seance_id, plateforme, duree, demarree_at, terminee_at, duree_reelle_s")
        .in("seance_id", seanceIds);
      (lives || []).forEach(l => {
        if (seanceMap[l.seance_id]) {
          seanceMap[l.seance_id] = {
            ...seanceMap[l.seance_id],
            plateforme:       l.plateforme ?? null,
            duree_prevue_min: l.duree ?? null,
            demarree_at:      l.demarree_at ?? null,
            terminee_at:      l.terminee_at ?? null,
            duree_reelle_s:   l.duree_reelle_s ?? null,
          };
        }
      });
    }

    const enriched = rapports.map(r => ({
      ...r,
      deputy:  nomMap[r.deputy_id]  || null,
      coach:   nomMap[r.coach_id]   || null,
      seance:  r.seance_id ? (seanceMap[r.seance_id] || null) : null,
    }));

    res.json({ rapports: enriched });
  } catch (err) {
    console.error("[superviseur/rapports-deputy]", err);
    res.json({ rapports: [] });
  }
});

/* POST /api/superviseur/rapports-deputy - soumettre un rapport (par un deputy) */
router.post("/rapports-deputy", authenticateAdmin, requireSuperviseurRole, requirePermission("rapports", "manage"), async (req, res) => {
  try {
    const {
      coach_id, date_observation, centre, classe,
      seance_id, groupe_id, session_live_id,
      ponctualite, preparation, pedagogie, gestion_classe, professionnalisme,
      interactivite_classe, approche_grammaticale, expression_engagement, feedback_correction,
      type_observation, type_lecon, internet,
      observations, recommandations,
    } = req.body;

    if (!coach_id || !date_observation) {
      return res.status(400).json({ error: "coach_id et date_observation sont requis" });
    }

    /* LES SEPT CRITÈRES NOTÉS SONT OBLIGATOIRES.
       Un critère vide est écarté AVEC SON POIDS par le barème : le rapport se calcule alors
       sur 30 au lieu de 35, et sa note cesse d'être comparable à celle des autres coachs.
       C'est arrivé sur quatre rapports de septembre 2026, où le professionnalisme n'avait
       pas été saisi - leur coach s'est retrouvé noté sur une échelle qui n'était pas celle
       de ses collègues, sans que personne ne le voie.
       La règle est posée ICI et non seulement dans l'écran : un formulaire se contourne,
       une route non. */
    const REQUIS = {
      preparation:           "Organisation du cours",
      pedagogie:             "Pédagogie",
      expression_engagement: "Expression & engagement",
      gestion_classe:        "Gestion de classe",
      feedback_correction:   "Feedback & correction",
      ponctualite:           "Ponctualité",
      professionnalisme:     "Professionnalisme",
    };
    const valeurs = { preparation, pedagogie, expression_engagement, gestion_classe,
                      feedback_correction, ponctualite, professionnalisme };
    const absents = Object.entries(REQUIS)
      .filter(([cle]) => !(parseFloat(valeurs[cle]) > 0))
      .map(([, libelle]) => libelle);
    if (absents.length) {
      return res.status(400).json({
        error: `Critère(s) non noté(s) : ${absents.join(", ")}. Les sept critères sont requis pour que la note soit calculée sur 35.`,
        criteres_manquants: absents,
      });
    }

    // 0 = "non noté" côté formulaire - la contrainte de la table interdit 0 sur ces
    // colonnes (note attendue entre 1 et 5), donc on normalise en null comme le fait
    // déjà le calcul de note_globale ci-dessous.
    const norm = v => (v !== null && v !== undefined && parseFloat(v) > 0) ? parseFloat(v) : null;
    const ponctualiteN     = norm(ponctualite);
    const preparationN     = norm(preparation);
    const pedagogieN       = norm(pedagogie);
    const gestionClasseN   = norm(gestion_classe);
    // `respect_programme` n'est plus saisi : il portait une autre question et reste
    // lisible tel quel sur les rapports anterieurs.
    const professionnalismeN = norm(professionnalisme);

    const expressionN = norm(expression_engagement);
    const feedbackN    = norm(feedback_correction);

    /* La note suit le BARÈME OFFICIEL BET (/70 sur cinq critères pondérés), ramené sur 5.
       Elle moyennait auparavant neuf éléments à poids égal - les cinq critères plus
       Ponctualité, Professionnalisme, Interactivité et Grammaire - si bien que le
       classement s'inversait entre le tableau de bord et la feuille exportée : un coach
       noté 2.6 totalisait 30/70 quand un autre, noté 2.3, en totalisait 32.

       Ponctualité, Professionnalisme, Interactivité et Grammaire restent enregistrés et
       affichés comme appréciations ; ils ne pèsent plus sur la note ni sur la catégorie
       de contrat. Le calcul vit dans `services/noteObservation.js`, partagé avec la
       plateforme jumelle - il était recopié à l'identique dans les deux. */
    const note_globale = noteObservation({
      preparation: preparationN, pedagogie: pedagogieN,
      expression_engagement: expressionN, gestion_classe: gestionClasseN,
      feedback_correction: feedbackN,
    });
    const synthese = syntheseObservation(note_globale);

    const { data, error } = await supabase
      .from("rapports_observation")
      .insert({
        deputy_id:    req.profil.id,
        coach_id,
        date_observation,
        centre, classe,
        // La séance observée. Facultative : un cours présentiel sans session enregistrée,
        // ou un rapport rédigé a posteriori, restent des observations légitimes - exiger le
        // lien reviendrait à pousser à en inventer un.
        seance_id:       seance_id || null,
        groupe_id:       groupe_id || null,
        session_live_id: session_live_id || null,
        ponctualite: ponctualiteN, preparation: preparationN, pedagogie: pedagogieN,
        gestion_classe: gestionClasseN, professionnalisme: professionnalismeN,
        expression_engagement: expressionN, feedback_correction: feedbackN,
        interactivite_classe:  interactivite_classe  || null,
        approche_grammaticale: approche_grammaticale || null,
        type_observation: type_observation || "cours",
        type_lecon:       type_lecon || null,
        // Hors note, volontairement : le coach ne maîtrise pas la connexion. « autre »
        // vaut « non applicable » - un cours en présentiel n'a pas d'état de connexion.
        internet:         internet || null,
        observations, recommandations,
        note_globale,
        synthese,
        statut: "soumis",
        plateforme: PLATEFORME,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ rapport: data });

    // Prévenir les superviseurs généraux - il n'y avait AUCUNE notification à la soumission
    // d'un rapport. Un deputy pouvait déposer son observation et personne ne l'apprenait :
    // le rapport attendait qu'on pense à ouvrir l'onglet. Or c'est le superviseur qui décide
    // de le transmettre au conseil pédagogique ; sans lui, la chaîne s'arrête là.
    (async () => {
      try {
        const { data: sups } = await supabase
          .from("utilisateurs")
          .select("id")
          .in("role", ["superviseur", "admin_superviseur"])
          .eq("actif", true);
        if (!sups?.length) return;

        const { data: coach } = await supabase
          .from("utilisateurs").select("nom, prenom").eq("id", coach_id).maybeSingle();
        const nomCoach = [coach?.prenom, coach?.nom].filter(Boolean).join(" ").trim() || "un coach";
        const auteur = [req.profil?.prenom, req.profil?.nom].filter(Boolean).join(" ").trim() || "Un deputy";

        await supabase.from("notifications").insert(sups.map(u => ({
          user_id: u.id,
          type:    "rapport_observation",
          titre:   "📋 Nouveau rapport d'observation",
          message: `${auteur} a soumis une observation sur ${nomCoach}`
                 + (data.note_globale ? ` - note ${data.note_globale}/5` : "")
                 + (data.synthese === "a_accompagner" ? " ⚠️ à accompagner" : "")
                 + ".",
          source:  "bet-elearning",
          meta:    { rapport_id: data.id, coach_id, deputy_id: req.profil?.id, synthese: data.synthese || null },
          lu:      false,
        })));
      } catch (e) {
        console.warn("[rapports-deputy POST] notification superviseur:", e.message);
      }
    })();
  } catch (err) {
    console.error("[superviseur/rapports-deputy POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* PATCH /api/superviseur/rapports-deputy/:id - marquer lu / transmettre au PA / commenter */
router.patch("/rapports-deputy/:id", authenticateAdmin, requireGlobalSuperviseur, requirePermission("rapports", "manage"), async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, commentaire_superviseur } = req.body;

    const updates = {};
    if (statut) updates.statut = statut;
    if (commentaire_superviseur !== undefined) updates.commentaire_superviseur = commentaire_superviseur;
    if (statut === "transmis_pa") updates.transmis_pa_le = new Date().toISOString();

    const { data, error } = await supabase
      .from("rapports_observation")
      .update(updates)
      .eq("id", id)
      .eq("plateforme", PLATEFORME)
      .select(`
        id, date_observation, classe, centre, note_globale, ponctualite,
        coach:coach_id(id, nom, prenom),
        deputy:deputy_id(id, nom, prenom)
      `)
      .single();

    if (error) throw error;

    if (statut === "transmis_pa") {
      onRapportTransmis({
        id: data.id, coach_id: data.coach?.id || null,
        note_globale: data.note_globale, ponctualite: data.ponctualite,
      }).catch(e => console.error("[gamificationCoach] onRapportTransmis", e.message));
      const { data: paUsers } = await supabase
        .from("utilisateurs")
        .select("id")
        .eq("role", "pedagogical_advisor")
        .eq("actif", true);

      if (paUsers && paUsers.length > 0) {
        const coachNom = data?.coach
          ? `${data.coach.prenom || ""} ${data.coach.nom || ""}`.trim()
          : "un coach";
        const supNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || "Le Superviseur";
        const dateObs = data?.date_observation
          ? new Date(data.date_observation).toLocaleDateString("fr-FR")
          : "";

        const notifs = paUsers.map(pa => ({
          user_id: pa.id,
          type:    "rapport_superviseur",
          titre:   `📋 Nouveau rapport transmis - ${coachNom}`,
          message: `${supNom} vous a transmis un rapport d'observation de ${coachNom}${dateObs ? ` du ${dateObs}` : ""}${data?.classe ? ` (${data.classe})` : ""}.`,
          meta:    { rapport_id: id, coach_id: data?.coach?.id || null, classe: data?.classe || null },
        }));

        await supabase.from("notifications").insert(notifs);
      }
    }

    // Prévenir l'AUTEUR du rapport. Jusqu'ici, seul le conseil pédagogique était notifié, et
    // seulement à la transmission : le deputy déposait son observation puis n'entendait plus
    // jamais parler d'elle. Il ne savait ni si elle avait été lue, ni si elle avait été
    // transmise, ni si le superviseur l'avait commentée.
    if (data?.deputy?.id && statut && statut !== "soumis") {
      (async () => {
        try {
          const supNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || "Le Superviseur Général";
          const coachNom = data.coach
            ? `${data.coach.prenom || ""} ${data.coach.nom || ""}`.trim()
            : "un coach";
          const dateObs = data.date_observation
            ? new Date(data.date_observation).toLocaleDateString("fr-FR")
            : "";

          const parStatut = {
            lu: {
              titre:   "👁 Votre rapport a été lu",
              message: `${supNom} a lu votre observation sur ${coachNom}${dateObs ? ` du ${dateObs}` : ""}.`,
            },
            transmis_pa: {
              titre:   "✅ Votre rapport a été transmis",
              message: `${supNom} a transmis au conseil pédagogique votre observation sur ${coachNom}${dateObs ? ` du ${dateObs}` : ""}.`,
            },
            "archivé": {
              titre:   "📁 Votre rapport a été archivé",
              message: `Votre observation sur ${coachNom}${dateObs ? ` du ${dateObs}` : ""} a été archivée.`,
            },
          };
          const n = parStatut[statut];
          if (!n) return;

          await supabase.from("notifications").insert({
            user_id: data.deputy.id,
            type:    "rapport_observation",
            titre:   n.titre,
            // Le commentaire du superviseur part avec la notification : c'est le seul retour
            // que le deputy reçoit sur son travail, il ne doit pas rester dans un écran
            // qu'il faut penser à ouvrir.
            message: n.message + (commentaire_superviseur ? ` - « ${commentaire_superviseur} »` : ""),
            source:  "bet-elearning",
            meta:    { rapport_id: id, statut, coach_id: data.coach?.id || null },
            lu:      false,
          });
        } catch (e) {
          console.warn("[rapports-deputy PATCH] notification deputy:", e.message);
        }
      })();
    }

    res.json({ rapport: data });
  } catch (err) {
    console.error("[superviseur/rapports-deputy PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/superviseur/eligibilite - liste coachs éligibles au paiement
══════════════════════════════════════════════════════════ */
router.get("/eligibilite", authenticateAdmin, requireGlobalSuperviseur, async (req, res) => {
  try {
    const { periode } = req.query;

    const [
      { data: coachs },
      { data: evals },
      { data: anomalies },
    ] = await Promise.all([
      requeteCoachsBase("id, nom, prenom, email, scope")(),
      supabase.from("evaluations_coachs").select("coach_id, note_finale, statut, periode").eq("statut", "validée").eq("plateforme", PLATEFORME),
      supabase.from("anomalies_superviseur").select("coach_id, statut").eq("plateforme", PLATEFORME).neq("statut", "fermé").then(r => r.error ? { data: [] } : r),
    ]);

    const evalsByCoach   = {};
    (evals || []).forEach(e => {
      if (!evalsByCoach[e.coach_id]) evalsByCoach[e.coach_id] = [];
      evalsByCoach[e.coach_id].push(e);
    });

    const anomCoachIds = new Set((anomalies || []).map(a => a.coach_id));

    const result = (coachs || []).map(c => {
      const mesEvals  = evalsByCoach[c.id] || [];
      const derniere  = periode
        ? mesEvals.filter(e => e.periode === periode)
        : mesEvals.slice(0, 1);

      const aAnomalies = anomCoachIds.has(c.id);
      const note = derniere.length
        ? (derniere.reduce((s, e) => s + parseFloat(e.note_finale || 0), 0) / derniere.length).toFixed(1)
        : null;

      let eligible = false;
      let raison_non_eligible = [];

      if (aAnomalies) raison_non_eligible.push("Anomalie active non résolue");
      if (!mesEvals.length) raison_non_eligible.push("Aucune évaluation enregistrée");
      else if (parseFloat(note) < 3.0) raison_non_eligible.push("Note qualité insuffisante (< 3.0/5)");

      if (!aAnomalies && mesEvals.length > 0 && (!note || parseFloat(note) >= 3.0)) {
        eligible = true;
      }

      return {
        ...c,
        note_qualite:        note,
        nb_evaluations:      mesEvals.length,
        a_anomalies:         aAnomalies,
        eligible,
        raison_non_eligible: raison_non_eligible.join(" | ") || null,
      };
    });

    res.json({ coachs: result, nb_eligibles: result.filter(c => c.eligible).length });
  } catch (err) {
    console.error("[superviseur/eligibilite]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* POST /api/superviseur/eligibilite/soumettre-pa - soumettre la liste au PA */
router.post("/eligibilite/soumettre-pa", authenticateAdmin, requireGlobalSuperviseur, requirePermission("eligibilite", "manage"), async (req, res) => {
  try {
    const { periode, coach_ids } = req.body;
    if (!periode || !coach_ids?.length) {
      return res.status(400).json({ error: "periode et coach_ids requis" });
    }

    const { data: pas } = await supabase
      .from("utilisateurs")
      .select("id")
      .eq("role", "pedagogical_advisor")
      .eq("actif", true);

    const notifs = (pas || []).map(pa => ({
      user_id:         pa.id,
      type:            "eligibilite_paiement",
      titre:           `Liste d'éligibilité - ${periode}`,
      message:         `Le Superviseur Général a soumis la liste de ${coach_ids.length} coachs éligibles au paiement pour la période ${periode}.`,
      source:          "bet-elearning",
      meta:            { periode, coach_ids, soumis_par: req.profil.id, soumis_le: new Date().toISOString() },
      lu:              false,
    }));

    if (notifs.length) {
      await supabase.from("notifications").insert(notifs);
    }

    res.json({ ok: true, notifies: notifs.length, message: `Liste transmise à ${notifs.length} Pedagogical Advisor(s)` });
  } catch (err) {
    console.error("[superviseur/eligibilite/soumettre-pa]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/superviseur/anomalies - liste des anomalies
══════════════════════════════════════════════════════════ */
router.get("/anomalies", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("anomalies_superviseur")
      .select("*")
      .eq("plateforme", PLATEFORME)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const anomalies = data || [];
    const ids = [...new Set([...anomalies.map(a => a.superviseur_id), ...anomalies.map(a => a.coach_id)].filter(Boolean))];
    let nomMap = {};
    if (ids.length) {
      const { data: users } = await supabase.from("utilisateurs").select("id, nom, prenom").in("id", ids);
      (users || []).forEach(u => { nomMap[u.id] = u; });
    }

    const enriched = anomalies.map(a => ({
      ...a,
      superviseur: nomMap[a.superviseur_id] || null,
      coach:       nomMap[a.coach_id]       || null,
    }));

    res.json({ anomalies: enriched });
  } catch (err) {
    console.error("[superviseur/anomalies]", err);
    res.json({ anomalies: [] });
  }
});

/* POST /api/superviseur/anomalies - signaler une anomalie */
router.post("/anomalies", authenticateAdmin, requireSuperviseurRole, requirePermission("rapports", "manage"), async (req, res) => {
  try {
    const { coach_id, type_anomalie, description, gravite } = req.body;
    if (!coach_id || !type_anomalie || !description) {
      return res.status(400).json({ error: "coach_id, type_anomalie, description requis" });
    }

    const { data, error } = await supabase
      .from("anomalies_superviseur")
      .insert({
        superviseur_id: req.profil.id,
        coach_id,
        type_anomalie,
        description,
        gravite: gravite || "moyenne",
        statut:  "ouvert",
        plateforme: PLATEFORME,
      })
      .select()
      .single();

    if (error) throw error;

    const { data: pas } = await supabase
      .from("utilisateurs")
      .select("id")
      .eq("role", "pedagogical_advisor")
      .eq("actif", true);

    if (pas?.length) {
      await supabase.from("notifications").insert(pas.map(pa => ({
        user_id:         pa.id,
        type:            "anomalie_coach",
        titre:           `Anomalie signalée - ${type_anomalie}`,
        message:         description,
        source:          "bet-elearning",
        meta:            { anomalie_id: data.id, coach_id, gravite },
        lu:              false,
      })));
    }

    res.status(201).json({ anomalie: data });
  } catch (err) {
    console.error("[superviseur/anomalies POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* PATCH /api/superviseur/anomalies/:id */
router.patch("/anomalies/:id", authenticateAdmin, requireSuperviseurRole, requirePermission("rapports", "manage"), async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, escalade_a, resolution } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (statut)     updates.statut     = statut;
    if (resolution) updates.resolution = resolution;
    if (escalade_a) {
      updates.escalade_a  = escalade_a;
      updates.escalade_le = new Date().toISOString();
      updates.statut      = "escaladé";
    }

    const { data, error } = await supabase
      .from("anomalies_superviseur")
      .update(updates)
      .eq("id", id)
      .eq("plateforme", PLATEFORME)
      .select()
      .single();

    if (error) throw error;
    res.json({ anomalie: data });
  } catch (err) {
    console.error("[superviseur/anomalies PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/superviseur/deputies - liste des deputies + missions
══════════════════════════════════════════════════════════ */
router.get("/deputies", authenticateAdmin, requireGlobalSuperviseur, async (req, res) => {
  try {
    const [{ data: deputies }, { data: missions }] = await Promise.all([
      requeteDeputiesBase("id, nom, prenom, email, avatar_url, scope, derniere_connexion, actif")(),
      supabase.from("missions_deputy").select("*").eq("plateforme", PLATEFORME).order("created_at", { ascending: false }).then(r => r.error ? { data: [] } : r),
    ]);

    const missionsByDeputy = {};
    (missions || []).forEach(m => {
      if (!missionsByDeputy[m.deputy_id]) missionsByDeputy[m.deputy_id] = [];
      missionsByDeputy[m.deputy_id].push(m);
    });

    const result = (deputies || []).map(d => ({
      ...d,
      missions:            missionsByDeputy[d.id] || [],
      nb_missions_actives: (missionsByDeputy[d.id] || []).filter(m => ["assignée","en_cours"].includes(m.statut)).length,
      nb_rapports_soumis:  (missions || []).filter(m => m.deputy_id === d.id && m.rapport_id).length,
    }));

    res.json({ deputies: result });
  } catch (err) {
    console.error("[superviseur/deputies]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* POST /api/superviseur/deputies/:id/missions - assigner une mission */
router.post("/deputies/:id/missions", authenticateAdmin, requireGlobalSuperviseur, requirePermission("missions", "update"), async (req, res) => {
  try {
    const deputy_id = req.params.id;
    const { type_mission, titre, description, coach_id, centre, date_debut, date_fin } = req.body;

    if (!type_mission || !titre) {
      return res.status(400).json({ error: "type_mission et titre requis" });
    }

    const { data, error } = await supabase
      .from("missions_deputy")
      .insert({
        superviseur_id: req.profil.id,
        deputy_id,
        coach_id:    coach_id || null,
        type_mission,
        titre,
        description: description || null,
        centre:      centre || null,
        date_debut:  date_debut || null,
        date_fin:    date_fin   || null,
        statut:      "assignée",
        plateforme:  PLATEFORME,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from("notifications").insert({
      user_id:         deputy_id,
      type:            "nouvelle_mission",
      titre:           `Nouvelle mission : ${titre}`,
      message:         description || `Type : ${type_mission}`,
      source:          "bet-elearning",
      meta:            { mission_id: data.id },
      lu:              false,
    }).catch(() => {});

    res.status(201).json({ mission: data });
  } catch (err) {
    console.error("[superviseur/deputies/missions POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* GET /api/superviseur/mes-missions - missions du deputy connecté */
router.get("/mes-missions", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("missions_deputy")
      .select("*, coach:coach_id(id, nom, prenom)")
      .eq("deputy_id", req.profil.id)
      .eq("plateforme", PLATEFORME)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ missions: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* PATCH /api/superviseur/missions/:id */
router.patch("/missions/:id", authenticateAdmin, requireSuperviseurRole, requirePermission("missions", "update"), async (req, res) => {
  try {
    const { statut } = req.body;
    const { data, error } = await supabase
      .from("missions_deputy")
      .update({ statut })
      .eq("id", req.params.id)
      .eq("plateforme", PLATEFORME)
      .select()
      .single();
    if (error) throw error;
    res.json({ mission: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

/**
 * GET /api/superviseur/coachs/:id/ressources
 *
 * Tout ce qu'un coach a mis à la disposition de ses apprenants SUR CETTE PLATEFORME.
 *
 * ⚠️ UNE SEULE SOURCE ICI, LÀ OÙ LA VERSION DASH EN A DEUX, et ce n'est pas un oubli :
 *
 *   · `groupes_fichiers` - les fichiers déposés dans la conversation d'une classe - est une
 *     table de DASH. Le chat de classe de bet-elearning ne lui ressemble pas : il vit dans
 *     Firestore (`classe_chats/{classeId}/messages`), ses pièces jointes n'ont donc aucune
 *     ligne en base. Il n'existe pas de `classes_elearning_fichiers` (vérifié : la table est
 *     absente). Lire `groupes_fichiers` ici afficherait les fichiers de dash dans un écran
 *     bet-elearning - exactement la fuite corrigée ailleurs sur les apprenants, l'audit et
 *     les messages. On ne la lit donc pas.
 *
 *   · Les BLOCS des modules du coach, eux, sont bien de la donnée qui lui appartient :
 *     `modules_elearning` est indexé par `coach_id`, pas par plateforme - c'est le contenu
 *     qu'il a rédigé, comme ses disponibilités sont les siennes.
 *
 * L'onglet « Modules e-learning » montre les MODULES ; celui-ci montre les FICHIERS qu'ils
 * contiennent. Un coach peut avoir publié trois modules portant douze documents : la liste
 * des modules ne le dit pas.
 */
/**
 * Les modules d'un coach QUI APPARTIENNENT À CETTE PLATEFORME.
 *
 * `modules_elearning` n'a pas de colonne `plateforme` : son seul rattachement est
 * `groupe_id` / `groupe_ids`, qui désigne soit un `groupes` (classe dash), soit un
 * `classes_elearning`. Un module n'est donc d'ici QUE si au moins un de ses groupes existe
 * dans `classes_elearning`.
 *
 * Mesuré sur cette base : les 19 modules existants pointent tous vers des classes de dash,
 * aucun vers une classe e-learning. Les lister par `coach_id` seul - ce que faisait la
 * première version de cet écran - affichait donc 19 modules de dash dans un dossier
 * bet-elearning.
 *
 * UN MODULE SANS AUCUN GROUPE est volontairement EXCLU : rien ne permet de l'attribuer, et
 * le montrer des deux côtés recréerait le mélange qu'on cherche à supprimer.
 *
 * @returns {Promise<{modules: object[], nomDe: Record<string,string>}>}
 */
async function modulesElearningDuCoach(coachId) {
  const { data: tous, error } = await supabase
    .from("modules_elearning")
    .select("id, titre, statut, blocs, groupe_id, groupe_ids, created_at")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const groupesDe = (m) => [m.groupe_id, ...(m.groupe_ids || [])].filter(Boolean);
  const tousIds = [...new Set((tous || []).flatMap(groupesDe))];
  const { data: classes } = tousIds.length
    ? await supabase.from("classes_elearning").select("id, nom").in("id", tousIds)
    : { data: [] };
  const nomDe = Object.fromEntries((classes || []).map(c => [c.id, c.nom]));

  const modules = (tous || []).filter(m => groupesDe(m).some(id => nomDe[id]));
  return { modules, nomDe, groupesDe };
}

router.get("/coachs/:id/modules", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    const { modules, nomDe, groupesDe } = await modulesElearningDuCoach(req.params.id);
    res.json({
      modules: modules.map(m => ({
        id: m.id,
        titre: m.titre,
        statut: m.statut,
        nb_blocs: Array.isArray(m.blocs) ? m.blocs.length : 0,
        classes: groupesDe(m).map(id => nomDe[id]).filter(Boolean),
        created_at: m.created_at,
      })),
    });
  } catch (err) {
    console.error("[superviseur-bet/modules]", err.message || err);
    res.status(500).json({ error: "Lecture des modules impossible" });
  }
});

router.get("/coachs/:id/ressources", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    // Mêmes modules que l'onglet « Modules e-learning », donc même filtre de plateforme :
    // sans lui, cet onglet remontait les fichiers des modules de dash.
    const { modules, nomDe, groupesDe } = await modulesElearningDuCoach(req.params.id);

    /**
     * La nature d'un fichier.
     *
     * ATTENTION AU PARAMÈTRE `type` : pour un bloc de module, c'est le type du BLOC
     * (`document`, `video`, `lien`…), pas celui du fichier. « document » est un contenant,
     * pas un format : le retenir tel quel ferait tomber tous les PDF dans la branche
     * « ce format ne se prévisualise pas ». On ne fait donc confiance au `type` que
     * lorsqu'il désigne réellement un format ; sinon on lit l'extension.
     */
    const TYPES_FORMAT = ["image", "audio", "video", "pdf"];
    const natureDe = (nom = "", type = "") => {
      if (TYPES_FORMAT.includes(type)) return type;
      // Sans les paramètres d'URL : « …/doc.pdf?v=2 » donnerait l'extension « pdf?v=2 ».
      const ext = String(nom).split(/[?#]/)[0].split(".").pop().toLowerCase();
      if (["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "avif"].includes(ext)) return "image";
      if (["mp3", "wav", "ogg", "oga", "m4a", "aac", "opus"].includes(ext)) return "audio";
      if (["mp4", "mov", "avi", "mkv", "webm", "m4v"].includes(ext)) return "video";
      if (ext === "pdf") return "pdf";
      return "document";
    };

    const ressources = (modules || []).flatMap(m =>
      (m.blocs || [])
        .filter(b => b?.url)
        .map((b, i) => ({
          id: `module-${m.id}-${i}`,
          origine: "module",
          nom: b.titre || b.nom || `${m.titre} - partie ${i + 1}`,
          url: b.url,
          /* L'extension se lit sur le NOM DE FICHIER (`b.fichier`) ou sur l'URL - jamais sur
             `b.titre`, qui est un intitulé (« Compréhension écrite ») sans extension et
             renverrait systématiquement « document ». */
          nature: natureDe(b.fichier || b.nom || b.url, b.type),
          taille_ko: null,
          classes: groupesDe(m).map(id => nomDe[id]).filter(Boolean),
          contexte: { module_id: m.id, module_titre: m.titre, statut: m.statut },
          created_at: m.created_at,
          masque: m.statut !== "publie",
        })),
    ).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    res.json({
      ressources,
      totaux: {
        total: ressources.length,
        chat: 0,                       // cf. l'en-tête : pas de fichiers de chat en base ici
        modules: ressources.length,
        poids_ko: 0,                   // les médias d'un module ne portent pas leur taille
      },
      // Dit franchement à l'écran pourquoi les pièces jointes du chat n'y sont pas, plutôt
      // que de laisser croire que ce coach n'a rien partagé.
      sans_fichiers_chat: true,
    });
  } catch (err) {
    console.error("[superviseur-bet/ressources]", err.message || err);
    res.status(500).json({ error: "Lecture des ressources impossible" });
  }
});

export default router;
