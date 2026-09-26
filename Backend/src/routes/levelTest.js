import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { notifyUser, notifyRole } from "../services/notifyRole.js";
import { sendLevelTestResultEmail } from "../services/emailService.js";
import { publicFormLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();


console.log("✅ Route levelTest chargée")

router.post("/submit", publicFormLimiter, async (req, res) => {
  try {
    const { user, test, submitted_at, assignation_id, attempt_id } = req.body;

    // Pour un test oral saisi par une assistante, l'email peut être absent
    const isOral = test?.source === "oral";
    if (!test?.level) {
      return res.status(400).json({ error: "Le niveau CECRL est requis" });
    }
    if (!isOral && !user?.email) {
      return res.status(400).json({ error: "L'email est requis pour un test en ligne" });
    }

    // Un profil enfant partage forcément l'email de son parent (aucun email propre) - si le
    // parent est lui-même déjà apprenant BET avec son propre test sous cette adresse, l'enfant
    // doit quand même pouvoir passer le sien en ligne. Le lien envoyé transporte assignation_id
    // précisément pour ce cas : on l'utilise pour distinguer "même email, personne différente"
    // et exempter l'enfant de la règle un-test-par-email (jamais l'inverse : un adulte ne peut
    // toujours soumettre qu'un seul test).
    let isEnfantProfile = false;
    if (assignation_id) {
      const { data: assignRow } = await supabase
        .from("assignations_parcours")
        .select("profil_type")
        .eq("id", assignation_id)
        .maybeSingle();
      isEnfantProfile = assignRow?.profil_type === "enfant";
    }

    // Anti-doublon : un même email ne peut soumettre qu'un seul test en ligne - sauf pour un
    // profil enfant (cf. commentaire ci-dessus) ou un test oral (email pas forcément renseigné).
    if (!isOral && !isEnfantProfile && user?.email) {
      const { data: existing, error: existingErr } = await supabase
        .from("level_test_results")
        .select("id")
        .eq("email", user.email)
        .limit(1)
        .maybeSingle();

      if (existingErr) {
        console.error("Erreur Supabase (vérif doublon) :", existingErr);
        return res.status(500).json({ error: existingErr.message });
      }
      if (existing) {
        return res.status(409).json({ error: "Un test de niveau a déjà été soumis pour cet email" });
      }
    }

    const basePayload = {
      fullname:          user.fullname          || null,
      email:             user.email             || null,
      phone:             user.phone             || null,
      profile:           user.profile           || null,
      consent:           user.consent           ?? true,
      centre_id:         user.centre_id         || null,
      commercial_id:     user.commercial_id     || null,
      level:             test.level,
      score:             test.score             ?? 0,
      points_earned:     test.points_earned     ?? 0,
      points_total:      test.points_total      ?? 100,
      correct_answers:   test.correct_answers   ?? 0,
      total_questions:   test.total_questions   ?? 0,
      time_taken_seconds: test.time_taken_seconds ?? 0,
      answers_details:   test.answers_details   || [],
      audio_answers:     test.audio_answers     || {},
      by_category:       test.by_category       || {},
      by_cefr:           test.by_cefr           || {},
      source:            test.source            || "online",
      notes_oral:        test.notes_oral        || null,
      format_test:       test.format_test       || "mixte",
      correction_statut: test.correction_statut || "auto",
      tab_switch_count:  test.tab_switch_count  || 0,
      submitted_at:      submitted_at           || new Date().toISOString(),
    };

    // assignation_id persisté sur le résultat lui-même - indispensable pour que le
    // dashboard puisse relier de façon fiable un test à SON dossier (CommercialDashboard.jsx
    // findTestForProspect), au lieu du seul rapprochement email+nom qui échouait
    // systématiquement pour les profils enfant (email partagé avec le parent).
    let { data: inserted, error } = await supabase.from("level_test_results")
      .insert({ ...basePayload, assignation_id: assignation_id || null })
      .select().single();

    // Repli si la migration ajoutant la colonne `assignation_id` n'a pas encore été jouée
    if (error && (error.message || "").includes("assignation_id")) {
      ({ data: inserted, error } = await supabase.from("level_test_results")
        .insert(basePayload)
        .select().single());
    }

    if (error) {
      console.error("Erreur Supabase :", error);
      return res.status(500).json({ error: error.message });
    }

    // Marque la tentative "en cours" (level_test_attempts) comme soumise -
    // best-effort, ne doit jamais faire échouer la soumission du résultat.
    if (attempt_id) {
      supabase.from("level_test_attempts")
        .update({ status: "submitted", updated_at: new Date().toISOString() })
        .eq("id", attempt_id)
        .then(({ error: closeErr }) => { if (closeErr) console.warn("[level-test/submit] clôture attempt échouée:", closeErr.message); });
    }

    // Auto-remplissage du niveau sur les dossiers en attente (coaching privé
    // notamment) - best-effort, ne doit jamais faire échouer la soumission du test.
    // C'est ce qui permet à une assistante/au PA d'envoyer un lien de test (ou de saisir un
    // test oral) depuis son dashboard et de voir le niveau se renseigner automatiquement.
    (async () => {
      try {
        // Cible précise : le lien de test / la saisie d'un test oral déclenchés depuis un
        // dossier précis transmettent son id - on met à jour CE dossier uniquement, jamais
        // de recherche par email. Indispensable quand parent et enfant partagent le même
        // email/téléphone (le parent inscrit son enfant) : sans ce lien direct, un test pris
        // par l'un se recollait automatiquement sur le dossier de l'autre.
        if (assignation_id) {
          const { data: d } = await supabase
            .from("assignations_parcours")
            .select("id, suivi_demarrage")
            .eq("id", assignation_id)
            .maybeSingle();
          if (d) {
            await supabase.from("assignations_parcours").update({
              niveau_client: test.level,
              suivi_demarrage: { ...(d.suivi_demarrage || {}), niveau_prospect: test.level },
            }).eq("id", d.id);
          }
          return;
        }

        // Repli : aucun dossier précis fourni (test pris "à froid" via le lien public
        // générique) - recherche par email, mais jamais sur un dossier "enfant" : un enfant
        // ne passe jamais ce test lui-même (aucune option "enfant" dans le formulaire), donc
        // un match par email y appartiendrait forcément au parent, pas à l'enfant.
        if (user?.email) {
          const { data: dossiers } = await supabase
            .from("assignations_parcours")
            .select("id, suivi_demarrage, niveau_client")
            .ilike("prospect_email", user.email.trim())
            .is("niveau_client", null)
            .or("profil_type.is.null,profil_type.neq.enfant")
            .not("statut", "in", "(annule,annulee,refuse,refusee)");
          for (const d of dossiers || []) {
            await supabase.from("assignations_parcours").update({
              niveau_client: test.level,
              suivi_demarrage: { ...(d.suivi_demarrage || {}), niveau_prospect: test.level },
            }).eq("id", d.id);
          }
        }
      } catch (e) {
        console.warn("[level-test/submit] auto-remplissage niveau échoué:", e.message);
      }
    })();

    // Notifier la commerciale assignée - jusqu'ici, aucune notification n'était jamais
    // envoyée nulle part dans ce fichier : elle ne découvrait un test reçu qu'en
    // rafraîchissant sa liste par hasard.
    const isManual = test.correction_statut === "en_attente";
    if (user?.commercial_id) {
      await notifyUser(user.commercial_id, {
        type:    "test_niveau",
        titre:   isManual ? "📝 Test reçu - correction requise" : "✅ Test de niveau reçu",
        message: isManual
          ? `${user.fullname || "Un prospect"} a soumis un test ${test.format_test || ""} en attente de correction.`
          : `${user.fullname || "Un prospect"} a passé son test de niveau : ${test.level}.`,
        meta: { level_test_id: inserted.id },
        source: "dash",
      }).catch(() => {});
    }

    // Notifier l'agent Placement dès qu'un test nécessite une correction manuelle -
    // jusqu'ici seule la commerciale était prévenue, l'agent placement ne le découvrait
    // qu'en rafraîchissant l'onglet "À corriger" par hasard.
    if (isManual) {
      await notifyRole(["placement_test", "super_admin"], {
        type:    "test_niveau",
        titre:   "📝 Nouveau test à corriger",
        message: `${user?.fullname || "Un prospect"} a soumis un test ${test.format_test || ""} en attente de correction.`,
        meta:    { level_test_id: inserted.id },
        source:  "dash",
      }, user?.commercial_id || null).catch(() => {});
    }

    // Envoyer le résultat par email au client - jusqu'ici la page affichait "Résultats envoyés
    // par email !" après le test (FreeLevelTest.jsx) alors qu'aucun email n'était réellement
    // envoyé (simple simulation visuelle côté frontend, jamais branchée sur un vrai envoi).
    // isOral ne doit PAS bloquer cet envoi : un test oral saisi par une commerciale a un email
    // réel la plupart du temps (juste pas systématiquement, d'où le isOral utilisé plus haut
    // pour la validation du champ requis) - s'il est présent, l'apprenant doit recevoir son
    // résultat comme pour un test en ligne.
    if (user?.email) {
      await sendLevelTestResultEmail({
        prenom: (user.fullname || "").split(" ")[0] || "",
        email: user.email,
        niveau: test.level,
        score: test.score,
        correctionEnAttente: isManual,
        byCategory: test.by_category || null,
      }).catch(err => console.error("[level-test/submit] email résultat:", err.message));
    }

    res.status(201).json({ message: "Résultat enregistré", result: inserted });
  } catch (err) {
    console.error("Erreur serveur :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Liste des commerciales actives, filtrée par centre si ?centre_id= fourni, ou par id si ?id= fourni
router.get("/commerciaux", async (req, res) => {
  try {
    const { centre_id, id } = req.query;
    let query = supabase
      .from("utilisateurs")
      .select("id, nom, prenom, email, telephone, role, scope")
      .eq("role", "commercial")
      .eq("actif", true)
      .order("prenom");

    if (id) {
      query = query.eq("id", id);
    } else if (centre_id) {
      query = query.or(`scope.cs.{"${centre_id}"},scope.cs.{"national"}`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ commerciaux: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Assigner un commercial à un client (appelé depuis MonEspace)
router.post("/assign-commercial", async (req, res) => {
  try {
    const { client_email, commercial_id, centre_id } = req.body;
    if (!client_email || !commercial_id) {
      return res.status(400).json({ error: "client_email et commercial_id requis" });
    }

    // Anti-doublon : une fois un commercial assigné, ce choix est définitif
    // (cf. MonEspace - "Ce choix est définitif. Pour le modifier, rendez-vous
    // en cabinet."). On bloque toute réassignation via cette route publique,
    // sauf appel idempotent avec le même commercial_id.
    const { data: existingResult, error: existingResultErr } = await supabase
      .from("level_test_results")
      .select("commercial_id")
      .eq("email", client_email)
      .not("commercial_id", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingResultErr) return res.status(500).json({ error: existingResultErr.message });
    if (existingResult?.commercial_id && existingResult.commercial_id !== commercial_id) {
      return res.status(409).json({ error: "Un(e) conseiller(ère) est déjà assigné(e) à ce client" });
    }

    // Vérifier que ce commercial existe bien
    const { data: com, error: comErr } = await supabase
      .from("utilisateurs")
      .select("id, scope")
      .eq("id", commercial_id)
      .eq("role", "commercial")
      .maybeSingle();

    if (comErr || !com) {
      return res.status(400).json({ error: "Commercial introuvable" });
    }

    // Déterminer le centre_id : celui fourni, sinon le premier du scope du commercial
    const resolvedCentreId = centre_id ||
      (Array.isArray(com.scope) && !com.scope.includes("national") ? com.scope[0] : null);

    const updatePayload = { commercial_id };
    if (resolvedCentreId) updatePayload.centre_id = resolvedCentreId;

    const { error: updErr } = await supabase
      .from("level_test_results")
      .update(updatePayload)
      .eq("email", client_email);

    if (updErr) return res.status(500).json({ error: updErr.message });

    res.json({ message: "Conseiller(ère) assigné(e) avec succès" });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Récupérer tous les résultats filtrés par scope admin
router.get("/all", authenticateAdmin, async (req, res) => {
  try {
    const scope = req.profil?.scope || [];
    const isNational = scope.includes("national") || req.role === "super_admin";
    // placement_test est un rôle transverse dédié aux tests de niveau : il doit voir
    // l'ensemble des tests (y compris ceux déjà assignés à une commerciale), pas
    // seulement ceux de son propre centre/scope - contrairement à un rôle "commercial".
    const ROLES_GLOBAUX = ["super_admin", "admin", "responsable", "gestionnaire", "manager", "placement_test"];
    const isGlobal = isNational || ROLES_GLOBAUX.includes(req.role);

    const SELECT_BASE = "id, fullname, email, phone, profile, level, score, points_earned, points_total, correct_answers, total_questions, time_taken_seconds, submitted_at, commercial_id, centre_id, source, notes_oral, format_test, correction_statut, by_category, by_cefr, answers_details, audio_answers";

    const buildQuery = (select) => {
      let q = supabase.from("level_test_results").select(select).order("submitted_at", { ascending: false });
      if (isGlobal) {
        // Accès total
      } else if (scope.length > 0) {
        // Commerciale : tests NON assignés de son centre OU tests directement assignés à elle
        // (évite de voir les tests des autres commerciales du même centre)
        const userId = req.profil?.id;
        const centreFilter = `centre_id.in.(${scope.join(",")})`;
        q = userId
          ? q.or(`and(${centreFilter},commercial_id.is.null),commercial_id.eq.${userId}`)
          : q.or(`and(${centreFilter},commercial_id.is.null)`);
      }
      return q;
    };

    let { data, error } = await buildQuery(`${SELECT_BASE}, statut, assignation_id, speaking_notes`);
    // Replis si les migrations ajoutant `statut`/`assignation_id`/`speaking_notes` n'ont pas encore été jouées
    if (error && (error.message || "").includes("speaking_notes")) {
      ({ data, error } = await buildQuery(`${SELECT_BASE}, statut, assignation_id`));
    }
    if (error && (error.message || "").includes("assignation_id")) {
      ({ data, error } = await buildQuery(`${SELECT_BASE}, statut`));
    }
    if (error && (error.message || "").includes("statut")) {
      ({ data, error } = await buildQuery(SELECT_BASE));
    }
    if (error) return res.status(500).json({ error: error.message });
    res.json({ results: (data || []).map(r => ({ statut: "nouveau", ...r })) });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Marquer le traitement d'un test (contacté / converti / archivé / nouveau)
router.patch("/:id/statut", authenticateAdmin, async (req, res) => {
  try {
    const { statut } = req.body;
    const STATUTS_VALIDES = ["nouveau", "contacté", "converti", "archivé"];
    if (!STATUTS_VALIDES.includes(statut)) {
      return res.status(400).json({ error: "Statut invalide" });
    }

    const { data, error } = await supabase
      .from("level_test_results")
      .update({ statut })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ result: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Corriger un test Writing/Speaking - attribuer score + niveau
router.patch("/:id/corriger", authenticateAdmin, async (req, res) => {
  try {
    const { level, score, notes_oral, speaking_notes } = req.body;
    if (!level) return res.status(400).json({ error: "Le niveau CECRL est requis" });

    // "score" saisi par l'agent est un pourcentage (0-100) - jamais un nombre de points
    // brut. Le copier tel quel dans points_earned cassait l'invariant points_earned/
    // points_total = score dès que points_total ≠ 100 (cas des tests mixtes déjà
    // partiellement auto-corrigés), donnant des pourcentages > 100% à l'affichage.
    const { data: existing } = await supabase
      .from("level_test_results")
      .select("points_total")
      .eq("id", req.params.id)
      .maybeSingle();
    const scorePct      = Number(score) || 0;
    const pointsTotal    = existing?.points_total || 100;
    const pointsEarned   = Math.round((scorePct / 100) * pointsTotal);

    let { data, error } = await supabase
      .from("level_test_results")
      .update({
        level,
        score:             scorePct,
        points_earned:     pointsEarned,
        notes_oral:        notes_oral || null,
        speaking_notes:    speaking_notes || {},
        correction_statut: "corrige",
      })
      .eq("id", req.params.id)
      .select()
      .single();

    // Repli si la migration ajoutant `speaking_notes` n'a pas encore été jouée
    if (error && (error.message || "").includes("speaking_notes")) {
      ({ data, error } = await supabase
        .from("level_test_results")
        .update({
          level,
          score:             scorePct,
          points_earned:     pointsEarned,
          notes_oral:        notes_oral || null,
          correction_statut: "corrige",
        })
        .eq("id", req.params.id)
        .select()
        .single());
    }

    if (error) return res.status(500).json({ error: error.message });

    // Notifier la commerciale assignée que le niveau est prêt - sans ça, elle ne sait jamais
    // qu'une correction Writing/Speaking a été faite et que le suivi peut reprendre.
    if (data.commercial_id) {
      await notifyUser(data.commercial_id, {
        type:    "test_niveau",
        titre:   "✅ Test corrigé",
        message: `Le test de ${data.fullname || "votre prospect"} a été corrigé : niveau ${level}.`,
        meta: { level_test_id: data.id },
        source: "dash",
      }).catch(() => {});
    }

    // Envoyer le résultat définitif au client - jusqu'ici, seul l'accusé de réception "en
    // attente de correction" partait à la soumission (POST /submit) ; une fois la correction
    // Writing/Speaking faite par l'agent Placement/la commerciale, personne ne recevait jamais
    // le vrai niveau CECRL par email.
    if (data.source !== "oral" && data.email) {
      await sendLevelTestResultEmail({
        prenom: (data.fullname || "").split(" ")[0] || "",
        email: data.email,
        niveau: level,
        score: scorePct,
        correctionEnAttente: false,
        byCategory: data.by_category || null,
      }).catch(err => console.error("[level-test/corriger] email résultat:", err.message));
    }

    res.json({ result: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Récupérer le dernier résultat de test par email - ou par assignation_id pour un profil
// enfant, dont l'email est celui du parent (partagé), jamais fiable pour cette recherche.
router.get("/result", async (req, res) => {
  try {
    const { email, assignation_id } = req.query;

    // Même logique que POST /submit : un dossier "enfant" ne se recherche jamais par email
    // (partagé avec le parent, qui a très souvent déjà son propre test sous cette adresse).
    let isEnfantProfile = false;
    if (assignation_id) {
      const { data: assignRow } = await supabase
        .from("assignations_parcours")
        .select("profil_type")
        .eq("id", assignation_id)
        .maybeSingle();
      isEnfantProfile = assignRow?.profil_type === "enfant";
    }

    const SELECT = "level, score, points_earned, points_total, correct_answers, total_questions, submitted_at, by_category";

    if (isEnfantProfile) {
      const { data, error } = await supabase
        .from("level_test_results")
        .select(SELECT)
        .eq("assignation_id", assignation_id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ result: data || null });
    }

    if (!email) return res.status(400).json({ error: "Email requis" });

    // Recherche par email seul (sans assignation_id précis) : plusieurs enfants peuvent
    // partager l'email de leur parent, qui a lui-même très souvent déjà son propre test sous
    // cette adresse. Sans exclusion, "le plus récent sous cet email" retombe sur le test d'un
    // enfant dès qu'il en soumet un - remplaçant à tort l'affichage du parent (Mon Espace,
    // dashboards). On exclut donc tout résultat rattaché à un dossier "enfant" avant de
    // prendre le plus récent restant.
    const { data: candidats, error: candErr } = await supabase
      .from("level_test_results")
      .select(`${SELECT}, assignation_id`)
      .eq("email", email)
      .order("submitted_at", { ascending: false })
      .limit(10);

    if (candErr) return res.status(500).json({ error: candErr.message });

    let result = null;
    if (candidats && candidats.length) {
      const assignIds = [...new Set(candidats.map(c => c.assignation_id).filter(Boolean))];
      let enfantIds = new Set();
      if (assignIds.length) {
        const { data: assignRows } = await supabase
          .from("assignations_parcours")
          .select("id, profil_type")
          .in("id", assignIds);
        enfantIds = new Set((assignRows || []).filter(r => r.profil_type === "enfant").map(r => r.id));
      }
      const match = candidats.find(c => !c.assignation_id || !enfantIds.has(c.assignation_id)) || null;
      if (match) { const { assignation_id: _omit, ...rest } = match; result = rest; }
    }

    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;