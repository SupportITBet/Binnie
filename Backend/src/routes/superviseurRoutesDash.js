// Routes Superviseur / Deputy Superviseur - dash UNIQUEMENT.
// Scindé depuis l'ancien superviseurRoutes.js (partagé dash + bet-elearning)
// pour que les deux plateformes n'aient plus aucun chemin de code commun sur
// ce module - même principe que gamification.js/gamificationDash.js et
// contenusOnboarding.js/contenusOnboardingDash.js.
import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { onRapportTransmisDash } from "../services/gamificationCoachDash.js";
import { noteObservation, syntheseObservation } from "../services/noteObservation.js";

const router = express.Router();

const ROLES_SUP_ALL    = ["superviseur", "deputy_superviseur", "super_admin"];
const ROLES_SUP_GLOBAL = ["superviseur", "super_admin"];
const IS_DEPUTY = (role) => role === "deputy_superviseur";

const PLATEFORME = "dash";

// "groupes" (coach ↔ centre) est un concept 100% dash - toujours inclus ici.
const requeteCoachsBase = (select) =>
  () => supabase.from("utilisateurs").select(select).eq("role", "coach").eq("actif", true);

const requeteDeputiesBase = (select) =>
  () => supabase.from("utilisateurs").select(select).eq("role", "deputy_superviseur");

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
══════════════════════════════════════════════════════════ */
router.get("/coachs-conformite", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    const { data: coachs } = await requeteCoachsBase("id, nom, prenom, surnom, email, avatar_url, scope, derniere_connexion, actif")()
      .order("nom");

    const { data: gData, error: errGroupes } = await supabase
      .from("groupes")
      .select("id, nom, coach_id, centre_id, statut");
    if (errGroupes) console.warn("[coachs-conformite] groupes:", errGroupes.message);
    const groupes = gData || [];

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

    const groupesByCoach = {};
    (groupes || []).forEach(g => {
      if (!groupesByCoach[g.coach_id]) groupesByCoach[g.coach_id] = [];
      groupesByCoach[g.coach_id].push(g);
    });

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

    // Récupérer acces_bloque depuis auth pour tous les coachs
    const coachIds = (coachs || []).map(c => c.id);
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
      const mesGroupes   = groupesByCoach[c.id]  || [];
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
      const nbGroupes        = mesGroupes.length;
      const nbEvals          = mesEvals.length;
      const nbRapportsDeputy = mesRapports.length;

      let statut_conformite = "conforme";
      if (aAnomalies)   statut_conformite = "non_conforme";
      else if (nbEvals === 0 && nbRapportsDeputy === 0) statut_conformite = "en_attente";
      else if (moyenneNote && parseFloat(moyenneNote) < 3.0) statut_conformite = "non_conforme";

      return {
        ...c,
        acces_bloque:         authBloqueMap[c.id] || false,
        nb_groupes:           nbGroupes,
        nb_evaluations:       nbEvals,
        nb_rapports_deputy:   nbRapportsDeputy,
        note_moyenne:         moyenneNote,
        derniere_evaluation:  derniereEval,
        nb_anomalies:         anomaliesByCoach[c.id] || 0,
        statut_conformite,
        groupes:              mesGroupes,
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
        statut, commentaire_superviseur, transmis_pa_le, created_at,
        correction_superviseur
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
router.post("/rapports-deputy", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
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
          source:  "superviseur",
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
    const { statut, commentaire_superviseur, correction, motif_correction } = req.body;

    const updates = {};
    if (statut) updates.statut = statut;
    if (commentaire_superviseur !== undefined) updates.commentaire_superviseur = commentaire_superviseur;
    if (statut === "transmis_pa") updates.transmis_pa_le = new Date().toISOString();

    /* ── CORRECTION DU RAPPORT PAR LE SUPERVISEUR ────────────────────────────────────
       Il relit avant de transmettre au conseiller pédagogique, et une erreur de saisie du
       deputy - un critère mal cliqué, une classe confondue - partait jusqu'ici telle quelle.
       Ce n'est pas anodin : la note globale attribue des points au coach à la transmission
       (+30 / +15 / −10) et pèse sur son classement et sa catégorie de contrat.

       MAIS UN RAPPORT EST UN TÉMOIGNAGE. Le réécrire en silence ferait disparaître la
       parole du deputy, et le document perdrait toute valeur de preuve le jour où un coach
       conteste sa note. L'original est donc conservé, et il l'est UNE SEULE FOIS : à la
       première correction. Sans cette précaution, deux corrections successives feraient
       passer la première pour l'observation d'origine.

       LA NOTE GLOBALE EST RECALCULÉE. La laisser en l'état après avoir changé les critères
       attribuerait au coach des points fondés sur une note périmée - l'erreur qu'on vient
       précisément de corriger continuerait de produire ses effets. */
    let correctionAppliquee = null;
    if (correction && typeof correction === "object" && Object.keys(correction).length > 0) {
      const { data: avant, error: errAvant } = await supabase
        .from("rapports_observation")
        .select("*")
        .eq("id", id)
        .eq("plateforme", PLATEFORME)
        .single();
      if (errAvant || !avant) return res.status(404).json({ error: "Rapport introuvable" });

      const CHAMPS_CORRIGEABLES = [
        "ponctualite", "preparation", "pedagogie", "gestion_classe", "professionnalisme",
        "interactivite_classe", "approche_grammaticale", "expression_engagement",
        "feedback_correction", "type_observation", "type_lecon", "internet",
        "observations", "recommandations", "centre", "classe", "date_observation",
      ];
      const NOTES = new Set([
        "ponctualite", "preparation", "pedagogie", "gestion_classe", "professionnalisme",
        "interactivite_classe", "approche_grammaticale", "expression_engagement", "feedback_correction",
      ]);
      // 0 signifie « non noté » côté formulaire, et la table refuse 0 sur ces colonnes :
      // même normalisation que le POST, sans quoi une remise à zéro échouerait en base.
      const norm = v => (v !== null && v !== undefined && parseFloat(v) > 0) ? parseFloat(v) : null;

      for (const champ of CHAMPS_CORRIGEABLES) {
        if (correction[champ] === undefined) continue;
        updates[champ] = NOTES.has(champ) ? norm(correction[champ]) : correction[champ];
      }

      // Recalcul sur les valeurs APRÈS correction, en reprenant celles d'avant pour les
      // critères que le superviseur n'a pas touchés.
      const valeur = c => (updates[c] !== undefined ? updates[c] : norm(avant[c]));
      updates.note_globale = noteObservation({
        preparation:           valeur("preparation"),
        pedagogie:             valeur("pedagogie"),
        expression_engagement: valeur("expression_engagement"),
        gestion_classe:        valeur("gestion_classe"),
        feedback_correction:   valeur("feedback_correction"),
      });
      updates.synthese = syntheseObservation(updates.note_globale);

      updates.correction_superviseur = {
        // L'original ne s'écrit qu'une fois : il doit rester ce que le deputy a soumis.
        original: avant.correction_superviseur?.original
          || Object.fromEntries([...CHAMPS_CORRIGEABLES, "note_globale"].map(c => [c, avant[c]])),
        par: {
          id:     req.profil?.id || null,
          nom:    req.profil?.nom || null,
          prenom: req.profil?.prenom || null,
          role:   req.role || "superviseur",
        },
        le:    new Date().toISOString(),
        motif: (motif_correction || "").trim() || null,
      };
      correctionAppliquee = updates.correction_superviseur;
    }

    const { data, error } = await supabase
      .from("rapports_observation")
      .update(updates)
      .eq("id", id)
      .eq("plateforme", PLATEFORME)
      .select(`
        id, date_observation, classe, centre, note_globale, ponctualite,
        synthese, correction_superviseur,
        coach:coach_id(id, nom, prenom),
        deputy:deputy_id(id, nom, prenom)
      `)
      .single();

    if (error) throw error;

    if (statut === "transmis_pa") {
      onRapportTransmisDash({
        id: data.id, coach_id: data.coach?.id || null,
        note_globale: data.note_globale, ponctualite: data.ponctualite,
      }).catch(e => console.error("[gamificationCoachDash] onRapportTransmisDash", e.message));

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
            source:  "superviseur",
            meta:    { rapport_id: id, statut, coach_id: data.coach?.id || null },
            lu:      false,
          });
        } catch (e) {
          console.warn("[rapports-deputy PATCH] notification deputy:", e.message);
        }
      })();
    }

    /* ── PRÉVENIR LE DEPUTY QUE SON RAPPORT A ÉTÉ CORRIGÉ ────────────────────────────
       La notification ci-dessus ne part qu'au changement de STATUT. Une correction n'en
       change aucun : sans ce second envoi, le deputy verrait un jour son observation
       porter des notes qu'il n'a pas mises, sans avoir jamais été informé - et
       l'apprendrait au mieux par le coach concerné.

       ON LUI DIT CE QUI A CHANGÉ, pas seulement qu'on a changé quelque chose : la note
       d'origine, la nouvelle, et le motif. Une notification qui annonce une correction
       sans la montrer oblige à rouvrir l'écran pour comprendre, et se lit comme un
       reproche là où c'est souvent une simple faute de frappe. */
    if (correctionAppliquee && data?.deputy?.id) {
      (async () => {
        try {
          const supNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || "Le Superviseur Général";
          const coachNom = data.coach
            ? `${data.coach.prenom || ""} ${data.coach.nom || ""}`.trim()
            : "un coach";
          const dateObs = data.date_observation
            ? new Date(data.date_observation).toLocaleDateString("fr-FR")
            : "";
          const avant = correctionAppliquee.original?.note_globale;
          const apres = data.note_globale;
          const noteChangee = avant != null && apres != null && String(avant) !== String(apres);

          await supabase.from("notifications").insert({
            user_id: data.deputy.id,
            type:    "rapport_observation",
            titre:   "✏️ Votre rapport a été corrigé",
            message: `${supNom} a corrigé votre observation sur ${coachNom}${dateObs ? ` du ${dateObs}` : ""}.`
              + (noteChangee ? ` Note : ${avant}/5 → ${apres}/5.` : "")
              + (correctionAppliquee.motif ? ` Motif : « ${correctionAppliquee.motif} ».` : "")
              + " Vos valeurs d'origine sont conservées et restent lisibles sur le rapport.",
            source:  "superviseur",
            meta:    {
              rapport_id:    id,
              correction:    true,
              note_avant:    avant ?? null,
              note_apres:    apres ?? null,
              motif:         correctionAppliquee.motif || null,
              coach_id:      data.coach?.id || null,
            },
            lu: false,
          });
        } catch (e) {
          console.warn("[rapports-deputy PATCH] notification correction:", e.message);
        }
      })();
    }

    /* `correction` remonte explicitement pour que l'écran puisse le confirmer : une
       correction silencieuse laisserait le superviseur incertain de ce qu'il vient
       d'enregistrer - et c'est justement l'acte qui demande le plus de certitude. */
    res.json({ rapport: data, correction: correctionAppliquee });
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
router.post("/eligibilite/soumettre-pa", authenticateAdmin, requireGlobalSuperviseur, async (req, res) => {
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
      source:          "superviseur",
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
router.post("/anomalies", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
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
        source:          "superviseur",
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
router.patch("/anomalies/:id", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
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
router.post("/deputies/:id/missions", authenticateAdmin, requireGlobalSuperviseur, async (req, res) => {
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
      source:          "superviseur",
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
router.patch("/missions/:id", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
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


/* ══════════════════════════════════════════════════════════════
   RESSOURCES PARTAGÉES PAR UN COACH
══════════════════════════════════════════════════════════════ */

/**
 * Tout ce qu'un coach a mis à la disposition de ses apprenants, quelle qu'en soit l'origine.
 *
 * DEUX SOURCES, volontairement réunies. Le superviseur veut savoir ce qui circule, pas par
 * quel écran c'est passé :
 *   · `groupes_fichiers` - ce que le coach dépose dans la conversation d'une classe ;
 *   · les BLOCS de ses modules e-learning - l'audio, la vidéo, le PDF qui vivent à
 *     l'intérieur d'un module et qu'aucun écran ne listait jusqu'ici comme des ressources.
 *
 * L'onglet « Modules e-learning » montre les modules ; celui-ci montre les FICHIERS. Un
 * coach peut avoir publié trois modules contenant douze documents : la liste des modules
 * ne le dit pas.
 */
router.get("/coachs/:id/ressources", authenticateAdmin, requireSuperviseurRole, async (req, res) => {
  try {
    const coachId = req.params.id;

    const vide = { data: [] };
    const sur = (p) => p.then(r => (r?.error ? vide : r), () => vide);

    const [fichiersR, modulesR] = await Promise.all([
      sur(supabase.from("groupes_fichiers").select("*").eq("coach_id", coachId)
        .order("created_at", { ascending: false })),
      sur(supabase.from("modules_elearning").select("id, titre, statut, blocs, groupe_ids, created_at")
        .eq("coach_id", coachId).order("created_at", { ascending: false })),
    ]);

    // Les noms de classes en UNE requête : les résoudre fichier par fichier ferait
    // autant d'allers-retours que de ressources affichées.
    const groupeIds = [...new Set([
      ...(fichiersR.data || []).map(f => f.groupe_id),
      ...(modulesR.data || []).flatMap(m => m.groupe_ids || []),
    ].filter(Boolean))];
    const { data: groupes } = groupeIds.length
      ? await supabase.from("groupes").select("id, nom").in("id", groupeIds)
      : { data: [] };
    const nomDe = Object.fromEntries((groupes || []).map(g => [g.id, g.nom]));

    /**
     * La nature d'un fichier.
     *
     * ATTENTION AU PARAMÈTRE `type` : pour un bloc de module, c'est le type du BLOC
     * (`document`, `video`, `lien`…), pas celui du fichier. « document » est un contenant,
     * pas un format : le retenir tel quel faisait tomber tous les PDF d'un module dans la
     * branche « Ce format ne se prévisualise pas », alors que le même fichier s'affichait
     * parfaitement dans l'onglet Modules e-learning. On ne fait donc confiance au `type`
     * que lorsqu'il désigne réellement un format ; sinon on lit l'extension.
     */
    const TYPES_FORMAT = ["image", "audio", "video", "pdf"];
    const natureDe = (nom = "", type = "") => {
      if (TYPES_FORMAT.includes(type)) return type;
      // Sans les paramètres d'URL : « …/doc.pdf?v=2 » donnait l'extension « pdf?v=2 ».
      const ext = String(nom).split(/[?#]/)[0].split(".").pop().toLowerCase();
      if (["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "avif"].includes(ext)) return "image";
      if (["mp3", "wav", "ogg", "oga", "m4a", "aac", "opus"].includes(ext)) return "audio";
      if (["mp4", "mov", "avi", "mkv", "webm", "m4v"].includes(ext)) return "video";
      if (ext === "pdf") return "pdf";
      return "document";
    };

    const duChat = (fichiersR.data || []).map(f => ({
      id: `chat-${f.id}`,
      origine: "chat",
      nom: f.nom,
      url: f.url,
      nature: natureDe(f.nom, f.type_fichier),
      taille_ko: f.taille_ko || null,
      classes: [nomDe[f.groupe_id]].filter(Boolean),
      contexte: null,
      created_at: f.created_at,
      // Un fichier masqué dans la classe reste visible du superviseur, mais annoncé
      // comme tel : c'est une information de contrôle, pas une ressource active.
      masque: f.visible === false,
    }));

    const desModules = (modulesR.data || []).flatMap(m =>
      (m.blocs || [])
        .filter(b => b?.url)
        .map((b, i) => ({
          id: `module-${m.id}-${i}`,
          origine: "module",
          nom: b.titre || b.nom || `${m.titre} - partie ${i + 1}`,
          url: b.url,
          /* L'extension se lit sur le NOM DE FICHIER (`b.fichier`) ou sur l'URL - jamais
             sur `b.titre`, qui est un intitulé (« Compréhension écrite ») sans extension
             et renvoyait donc systématiquement « document ». */
          nature: natureDe(b.fichier || b.nom || b.url, b.type),
          taille_ko: null,
          classes: (m.groupe_ids || []).map(id => nomDe[id]).filter(Boolean),
          // Le module d'où sort la ressource : sans lui, on voit un fichier sans savoir
          // dans quel cours il est utilisé.
          contexte: { module_id: m.id, module_titre: m.titre, statut: m.statut },
          created_at: m.created_at,
          masque: m.statut !== "publie",
        })),
    );

    const ressources = [...duChat, ...desModules]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    res.json({
      ressources,
      totaux: {
        total: ressources.length,
        chat: duChat.length,
        modules: desModules.length,
        // Le poids n'est connu que pour les fichiers du chat : les médias d'un module
        // ne portent pas leur taille. On ne l'additionne donc que là où il existe.
        poids_ko: duChat.reduce((s, f) => s + (f.taille_ko || 0), 0),
      },
    });
  } catch (err) {
    console.error("[superviseur/ressources]", err.message || err);
    res.status(500).json({ error: "Lecture des ressources impossible" });
  }
});

export default router;
