// Routes placement test - gestion de la file d'attente tests de niveau
import { Router } from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { notifyRole, notifyEntreprise } from "../services/notifyRole.js";

const router = Router();

// ── GET /api/placement/queue ─────────────────────────────────────────────────
// Retourne les inscriptions en attente ou en cours de test de niveau
router.get("/queue", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inscriptions_adultes")
      .select("id, nom_complet, email, telephone, date_naissance, type_client, statut, entreprise_id, entreprise_nom, niveau_detecte, notes_placement, created_at, onboarding_id, profil_type, nom_parent, telephone_parent, email_parent")
      .in("statut", ["en_attente_test", "test_en_cours"])
      .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ queue: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── PATCH /api/placement/:id/statut ─────────────────────────────────────────
// Mettre à jour le statut d'une inscription dans la queue
router.patch("/:id/statut", authenticateAdmin, async (req, res) => {
  try {
    const { statut } = req.body;
    const STATUTS_VALIDES = ["en_attente_test", "test_en_cours", "teste", "assigne"];
    if (!STATUTS_VALIDES.includes(statut)) {
      return res.status(400).json({ error: "Statut invalide" });
    }

    const { data, error } = await supabase
      .from("inscriptions_adultes")
      .update({ statut })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /api/placement/:id/resultat ────────────────────────────────────────
// Enregistrer le résultat du test et passer statut → 'teste'
router.post("/:id/resultat", authenticateAdmin, async (req, res) => {
  try {
    const { niveau_cecr, notes, duree_min, agent_id } = req.body;
    if (!niveau_cecr) return res.status(400).json({ error: "niveau_cecr requis" });

    // Une fois le candidat assigné à une classe par Onboarding (inscriptions_elearning.statut
    // = "assigne"), l'agent Placement Test ne peut plus corriger le niveau détecté - le dossier
    // est déjà engagé pédagogiquement. Avant cette étape, la correction reste possible.
    const { data: existant } = await supabase
      .from("inscriptions_adultes")
      .select("onboarding_id, email")
      .eq("id", req.params.id)
      .maybeSingle();
    if (existant) {
      let elearningLie = null;
      if (existant.onboarding_id) {
        const { data: e1 } = await supabase.from("inscriptions_elearning").select("statut").eq("id", existant.onboarding_id).maybeSingle();
        elearningLie = e1;
      }
      if (!elearningLie && existant.email) {
        const { data: e2 } = await supabase.from("inscriptions_elearning").select("statut").eq("email", existant.email).maybeSingle();
        elearningLie = e2;
      }
      if (elearningLie?.statut === "assigne") {
        return res.status(403).json({ error: "Ce candidat a déjà été assigné à une classe par Onboarding - le résultat ne peut plus être modifié." });
      }
    }

    const { data, error } = await supabase
      .from("inscriptions_adultes")
      .update({
        statut:          "teste",
        niveau_detecte:  niveau_cecr,
        notes_placement: notes || null,
        date_test:       new Date().toISOString().slice(0, 10),
      })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Remonter le résultat dans inscriptions_elearning si lié (onboarding_id = inscriptions_elearning.id)
    // - c'est ce qui fait apparaître le dossier "Testé" dans l'onglet Parcours d'Onboarding.
    const majElearning = {
      statut:          "teste",
      niveau_detecte:  niveau_cecr,
      notes_placement: notes || null,
      date_test:       new Date().toISOString().slice(0, 10),
      placement_id:    req.profil.id,
    };
    let lienElearningOk = false;
    if (data.onboarding_id) {
      const { data: maj, error: errMaj } = await supabase
        .from("inscriptions_elearning")
        .update(majElearning)
        .eq("id", data.onboarding_id)
        .select("id");
      if (errMaj) console.error(`[placement/resultat] update inscriptions_elearning(${data.onboarding_id})`, errMaj.message);
      lienElearningOk = (maj || []).length > 0;
    }
    // Lien cassé (onboarding_id absent ou pointant vers une ligne supprimée) - on retrouve le
    // dossier par email pour ne pas perdre le retour vers Onboarding.
    if (!lienElearningOk && data.email) {
      const { data: candidat } = await supabase
        .from("inscriptions_elearning")
        .select("id")
        .eq("email", data.email)
        .eq("statut", "transmis_placement")
        .maybeSingle();
      if (candidat) {
        await supabase.from("inscriptions_elearning").update(majElearning).eq("id", candidat.id);
        lienElearningOk = true;
      } else {
        console.error(`[placement/resultat] impossible de relier ${data.nom_complet} (${req.params.id}) à un dossier Onboarding - onboarding_id=${data.onboarding_id || "null"}, email=${data.email}`);
      }
    }

    // Notifier les agents Onboarding que le test est terminé
    const agentNom  = `${req.profil.prenom || ''} ${req.profil.nom || ''}`.trim() || 'Agent Placement';
    const entNom    = data.entreprise_nom ? ` (${data.entreprise_nom})` : '';
    const metaTest  = { inscription_adultes_id: req.params.id, nom_complet: data.nom_complet, niveau_cecr, entreprise_nom: data.entreprise_nom };

    await Promise.all([
      // → Onboarding : résultat du test disponible, prêt pour assignation
      await notifyRole(['onboarding', 'admin_onboarding', 'super_admin'], {
        type:    'success',
        titre:   `Test de niveau terminé - ${data.nom_complet}`,
        message: `Niveau ${niveau_cecr} détecté par ${agentNom}${entNom}. À assigner à une classe.`,
        meta:    metaTest,
      }),
      // → PA : un apprenant vient d'être évalué (pour information)
      await notifyRole(['pedagogical_advisor', 'admin_pa_advisor'], {
        type:    'info',
        titre:   `Nouveau résultat de test`,
        message: `${data.nom_complet}${entNom} - niveau ${niveau_cecr} validé. En attente d'assignation de classe.`,
        meta:    metaTest,
      }),
    ]);

    res.json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /api/placement/a-assigner ───────────────────────────────────────────
// Retourne les inscriptions testées en attente d'assignation
router.get("/a-assigner", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inscriptions_adultes")
      .select("id, nom_complet, email, telephone, date_naissance, type_client, entreprise_id, entreprise_nom, niveau_detecte, notes_placement, date_test, created_at, onboarding_id, profil_type, nom_parent, telephone_parent, email_parent")
      .eq("statut", "teste")
      .order("date_test", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ apprenants: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── GET /api/placement/historique ────────────────────────────────────────────
// Apprenants déjà assignés à une classe - le résultat de leur test de niveau doit rester
// consultable en permanence par l'Agent Placement, même une fois le dossier transmis/traité.
router.get("/historique", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inscriptions_adultes")
      .select("id, nom_complet, email, telephone, date_naissance, type_client, entreprise_id, entreprise_nom, niveau_detecte, notes_placement, date_test, created_at, onboarding_id, profil_type, nom_parent, telephone_parent, email_parent")
      .eq("statut", "assigne")
      .order("date_test", { ascending: false })
      .limit(300);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ apprenants: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── PATCH /api/placement/:id/assigner-classe ─────────────────────────────────
// Agent Placement assigne directement un bénéficiaire testé à une classe
router.patch("/:id/assigner-classe", authenticateAdmin, async (req, res) => {
  try {
    const { classe_id, classe_nom } = req.body;
    if (!classe_id) return res.status(400).json({ error: "classe_id requis" });

    // 1. Récupérer l'inscription
    const { data: insc, error: fetchErr } = await supabase
      .from("inscriptions_adultes")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (fetchErr || !insc) return res.status(404).json({ error: "Inscription introuvable" });

    // 2. Récupérer nom classe si non fourni
    let nomClasse = classe_nom;
    if (!nomClasse) {
      const { data: cl } = await supabase.from("classes_elearning").select("nom").eq("id", classe_id).single();
      nomClasse = cl?.nom || null;
    }

    // 3. Inscrire dans classes_elearning_apprenants
    // NB : le contact (email/téléphone) et le profil (enfant/ado/adulte + parent) propagés ici
    // sont ceux résolus par /transmettre - pour un enfant/ado sans contact propre, il s'agit
    // déjà du contact du parent/tuteur (voir inscriptionsElearning.js:/transmettre).
    await supabase.from("classes_elearning_apprenants").upsert({
      classe_id,
      nom_complet:      insc.nom_complet,
      email:            insc.email,
      telephone:        insc.telephone,
      niveau_cecr:      insc.niveau_detecte,
      statut:           "actif",
      profil_type:      insc.profil_type      || 'adulte',
      nom_parent:       insc.nom_parent       || null,
      telephone_parent: insc.telephone_parent || null,
      email_parent:     insc.email_parent     || null,
      date_naissance:   insc.date_naissance   || null,
    }, { onConflict: "classe_id,email" });

    // 4. Marquer comme assigné dans inscriptions_adultes
    const { data, error } = await supabase
      .from("inscriptions_adultes")
      .update({ statut: "assigne" })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // 5. Mettre à jour inscriptions_elearning si lié (onboarding_id = inscriptions_elearning.id)
    if (insc.onboarding_id) {
      await supabase.from("inscriptions_elearning").update({
        statut:          "assigne",
        classe_id,
        classe_nom:      nomClasse,
        date_assignation: new Date().toISOString().slice(0, 10),
        placement_id:    req.profil.id,
      }).eq("id", insc.onboarding_id);
    }

    // 6. Notifier toutes les parties concernées
    const metaAssign = { inscription_adultes_id: req.params.id, nom_complet: insc.nom_complet, classe_nom: nomClasse, entreprise_nom: insc.entreprise_nom };

    await Promise.all([
      // → Onboarding : assignation confirmée
      await notifyRole(['onboarding', 'admin_onboarding', 'super_admin'], {
        type:    'success',
        titre:   `Classe assignée - ${insc.nom_complet}`,
        message: `${insc.nom_complet} a été assigné(e) à la classe "${nomClasse}" par l'Agent Placement.`,
        meta:    metaAssign,
      }),
      // → PA : nouveau bénéficiaire dans leur classe
      await notifyRole(['pedagogical_advisor', 'admin_pa_advisor'], {
        type:    'success',
        titre:   `Nouvel apprenant dans votre classe`,
        message: `${insc.nom_complet} vient d'être assigné(e) à la classe "${nomClasse}".`,
        meta:    metaAssign,
      }),
      // → RH Entreprise : leur bénéficiaire a été placé
      insc.entreprise_id && notifyEntreprise(insc.entreprise_id, {
        type:    'success',
        titre:   `Bénéficiaire intégré - ${insc.nom_complet}`,
        message: `${insc.nom_complet} a été intégré(e) à la classe "${nomClasse}". Le programme de formation commence.`,
        meta:    metaAssign,
      }),
    ].filter(Boolean));

    res.json({ inscription: data, classe_nom: nomClasse });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── POST /api/placement/envoyer ─────────────────────────────────────────────
// Onboarding envoie un apprenant en test de niveau
// Crée ou met à jour l'inscription avec statut 'en_attente_test'
router.post("/envoyer", authenticateAdmin, async (req, res) => {
  try {
    const { nom_complet, email, telephone, date_naissance, type_client, entreprise_id, entreprise_nom, notes, onboarding_id } = req.body;
    if (!nom_complet || !telephone) {
      return res.status(400).json({ error: "nom_complet et telephone sont requis" });
    }

    // Vérifier si déjà en queue
    const { data: existing } = await supabase
      .from("inscriptions_adultes")
      .select("id, statut")
      .eq("telephone", telephone)
      .in("statut", ["en_attente_test", "test_en_cours"])
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Cet apprenant est déjà dans la queue de tests", inscription: existing });
    }

    const { data, error } = await supabase
      .from("inscriptions_adultes")
      .insert({
        nom_complet,
        email:          email || null,
        telephone,
        date_naissance: date_naissance || null,
        type_client:    type_client || "particulier",
        entreprise_id:  entreprise_id || null,
        entreprise_nom: entreprise_nom || null,
        statut:         "en_attente_test",
        onboarding_id:  onboarding_id || null,
        notes_placement: notes || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ inscription: data });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
