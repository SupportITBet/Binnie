import express from "express";
import supabase, { supabaseAuth } from "../config/supabase.js";
import { authenticateUser } from "../middlewares/auth.js";
import { logAudit } from "../middlewares/logAudit.js";
import { authLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();

// --------------------- Inscription ---------------------
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { nom, prenom, email, telephone, password } = req.body;
    if (!nom || !prenom || !email || !telephone || !password) {
      return res.status(400).json({ error: "Tous les champs sont requis." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nom,
        prenom,
        telephone,
        niveau_anglais: "Non évalué",
        historique_inscriptions: [],
        resultats: [],
        acces_mediatheque: false
      }
    });

    if (authError) {
      console.error("Erreur Auth :", authError);
      return res.status(400).json({ error: authError.message });
    }

    logAudit({
      acteur_id:    authData.user.id,
      acteur_nom:   `${prenom} ${nom}`,
      acteur_email: email,
      acteur_role:  "apprenant",
      action_type:  "REGISTER",
      module:       "auth",
      plateforme:   "dash",
      entite_type:  "user",
      entite_id:    authData.user.id,
      detail:       `Inscription apprenant : ${prenom} ${nom} (${email})`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.status(201).json({
      message: "Inscription réussie",
      user: {
        id: authData.user.id,
        email,
        nom,
        prenom,
        telephone,
        niveau_anglais: "Non évalué",
        acces_mediatheque: false
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// --------------------- Connexion ---------------------
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email: rawEmail, password, identifier } = req.body;
    const rawIdentifier = identifier || rawEmail || "";
    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: "Email/téléphone et mot de passe requis" });
    }

    // Resolve phone → virtual email if needed
    let loginEmail = rawIdentifier.trim();
    if (!loginEmail.includes("@")) {
      // Treat as phone - normalize and build virtual email
      const digits = loginEmail.replace(/\D/g, "").replace(/^00/, "");
      const virtualEmail = `tel.${digits}@betacademy.app`;
      // Verify it exists in utilisateurs
      const { data: found } = await supabase
        .from("utilisateurs")
        .select("email")
        .eq("email", virtualEmail)
        .maybeSingle();
      if (found) {
        loginEmail = virtualEmail;
      } else {
        // Also try by telephone column
        const { data: byPhone } = await supabase
          .from("utilisateurs")
          .select("email")
          .eq("role", "apprenant")
          .ilike("telephone", `%${digits.slice(-8)}%`)
          .maybeSingle();
        if (byPhone) loginEmail = byPhone.email;
        else return res.status(401).json({ error: "Aucun compte trouvé avec ce numéro" });
      }
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: loginEmail, password });
    if (error) {
      logAudit({
        acteur_email: loginEmail,
        action_type:  "LOGIN_FAILED",
        module:       "auth",
        // Cette route n'est jamais appelée par bet-elearning (qui utilise
        // supabase.auth.signInWithPassword côté client, sans passer par le backend) -
        // toujours dash ou le site public, donc pertinente uniquement au journal dash.
        plateforme:   "dash",
        detail:       `Échec de connexion pour ${loginEmail}`,
        ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
        user_agent:   req.headers["user-agent"] || null,
        statut:       "danger",
      }).catch(() => {});
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    // Récupérer les métadonnées
    const metadata = data.user.user_metadata;

    logAudit({
      acteur_id:    data.user.id,
      acteur_nom:   `${metadata?.prenom || ""} ${metadata?.nom || ""}`.trim() || loginEmail,
      acteur_email: data.user.email,
      acteur_role:  "apprenant",
      action_type:  "LOGIN_SUCCESS",
      module:       "auth",
      plateforme:   "dash",
      entite_type:  "user",
      entite_id:    data.user.id,
      detail:       `Connexion réussie : ${loginEmail}`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "success",
    }).catch(() => {});

    res.json({
      message: "Connexion réussie",
      session: data.session,         // contient access_token, refresh_token
      user: {
        id: data.user.id,
        email: data.user.email,
        nom: metadata?.nom || "",
        prenom: metadata?.prenom || "",
        telephone: metadata?.telephone || "",
        niveau_anglais: metadata?.niveau_anglais || "Non évalué",
        acces_mediatheque: metadata?.acces_mediatheque || false
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// --------------------- Mise à jour du profil ---------------------
router.put("/profile", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nom, prenom, telephone, adresse, niveau_anglais, acces_mediatheque, avatar_url } = req.body;

    // Récupérer les métadonnées actuelles
    const { data: { user }, error: fetchError } = await supabase.auth.admin.getUserById(userId);
    if (fetchError) throw fetchError;

    const currentMeta = user.user_metadata || {};
    const updatedMetadata = {
      ...currentMeta,
      nom:               nom               ?? currentMeta.nom,
      prenom:            prenom            ?? currentMeta.prenom,
      telephone:         telephone         ?? currentMeta.telephone,
      adresse:           adresse           ?? currentMeta.adresse,
      niveau_anglais:    niveau_anglais    ?? currentMeta.niveau_anglais,
      acces_mediatheque: acces_mediatheque ?? currentMeta.acces_mediatheque,
      bet_avatar_url:    avatar_url        ?? currentMeta.bet_avatar_url,
    };

    const { data, error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: updatedMetadata
    });
    if (updateError) throw updateError;

    // Synchroniser aussi la table utilisateurs - avatar_url manquait ici : la photo
    // n'était donc écrite QUE dans user_metadata.bet_avatar_url (Supabase Auth), jamais
    // dans utilisateurs.avatar_url, alors que c'est cette colonne que la commerciale lit
    // (Prospects parcours ET Mes apprenants, via parcours.js/apprenants.js/groupes.js) -
    // la photo mise à jour par le prospect restait donc invisible côté staff.
    const syncFields = {};
    if (updatedMetadata.nom)       syncFields.nom       = updatedMetadata.nom;
    if (updatedMetadata.prenom)    syncFields.prenom    = updatedMetadata.prenom;
    if (updatedMetadata.telephone) syncFields.telephone = updatedMetadata.telephone;
    if (updatedMetadata.bet_avatar_url) syncFields.avatar_url = updatedMetadata.bet_avatar_url;
    if (Object.keys(syncFields).length > 0) {
      await supabase.from("utilisateurs").update(syncFields).eq("id", userId);
    }

    res.json({
      message: "Profil mis à jour",
      user: {
        id: data.user.id,
        email: data.user.email,
        nom: updatedMetadata.nom,
        prenom: updatedMetadata.prenom,
        telephone: updatedMetadata.telephone,
        adresse: updatedMetadata.adresse,
        niveau_anglais: updatedMetadata.niveau_anglais,
        acces_mediatheque: updatedMetadata.acces_mediatheque
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la mise à jour" });
  }
});

router.get("/me", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;
    const metadata = user.user_metadata || {};
    res.json({
      id: user.id,
      email: user.email,
      nom: metadata.nom || "",
      prenom: metadata.prenom || "",
      telephone: metadata.telephone || "",
      niveau_anglais: metadata.niveau_anglais || "Non évalué",
      acces_mediatheque: metadata.acces_mediatheque || false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors de la récupération du profil" });
  }
});

router.put("/change-password", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe (min 6 caractères) requis" });
    }
    // Vérifier le mot de passe actuel en tentant une connexion
    const { error: signInError } = await supabaseAuth.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword
    });
    if (signInError) {
      return res.status(401).json({ error: "Mot de passe actuel incorrect" });
    }
    // Mettre à jour le mot de passe
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateError) throw updateError;
    res.json({ message: "Mot de passe modifié avec succès" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur lors du changement de mot de passe" });
  }
});

// Route pour demander la réinitialisation du mot de passe
// Route pour demander un lien de réinitialisation de mot de passe
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "L'email est requis." });
    }

    // URL de redirection après clic sur le lien (doit être dans les Redirect URLs de Supabase)
    const redirectTo = `${process.env.FRONTEND_URL || "http://localhost:3000"}/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      console.error("Erreur resetPasswordForEmail :", error);
      // Pour des raisons de sécurité, on ne précise pas si l'email existe
      return res.status(400).json({ error: "Impossible d'envoyer l'email. Vérifiez l'adresse." });
    }

    // Toujours renvoyer un message de succès générique
    res.json({ message: "Si un compte avec cet email existe, un lien de réinitialisation a été envoyé." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

router.post("/sync-profile", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, user_metadata } = req.user;

    let nom = user_metadata?.nom || "";
    let prenom = user_metadata?.prenom || "";
    let telephone = user_metadata?.telephone || "";

    if ((!nom || !prenom) && user_metadata?.full_name) {
      const parts = user_metadata.full_name.trim().split(" ");
      nom = parts[0] || "";
      prenom = parts.slice(1).join(" ") || "";
    }

    const { data: existing, error: findError } = await supabase
      .from("apprenants")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (findError && findError.code !== "PGRST116") throw findError;

    if (!existing) {
      const { error: insertError } = await supabase.from("apprenants").insert({
        id: userId,
        email,
        nom: nom || email.split("@")[0],
        prenom: prenom || "",
        telephone: telephone || "",
      });
      if (insertError) throw insertError;
    } else {
      const { error: updateError } = await supabase
        .from("apprenants")
        .update({ nom, prenom, telephone, email })
        .eq("id", userId);
      if (updateError) throw updateError;
    }

    res.json({ message: "Profil synchronisé", nom, prenom });
  } catch (error) {
    console.error("Erreur sync-profile:", error);
    res.status(500).json({ error: "Erreur lors de la synchronisation" });
  }
});

// ── Infos prospect : centre, statut apprenant, commercial ─
router.get("/prospect-info", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "email requis" });
  try {
    // 1. Vérifier si le prospect est devenu apprenant
    const [{ data: adulte }, { data: enfant }, { data: etudiant }, { data: groupeApp }] = await Promise.all([
      supabase.from("inscriptions_adultes").select("id, centre_id, statut").eq("email", email).maybeSingle(),
      supabase.from("inscriptions_enfants").select("id, centre_id, statut").eq("email", email).maybeSingle(),
      supabase.from("inscriptions_etudiants").select("id, centre_id, statut").eq("email", email).maybeSingle(),
      // Placed in a group = fully onboarded apprenant (neq "retire" pour ne pas
      // reclasser un ancien apprenant d'une classe clôturée comme "jamais inscrit")
      supabase.from("groupes_apprenants").select("id").ilike("email_apprenant", email).neq("statut", "retire").maybeSingle(),
    ]);
    const inscription = adulte || enfant || etudiant;
    // Le statut de inscriptions_adultes/enfants/etudiants n'est PAS fiable pour
    // détecter un vrai apprenant : plusieurs pages (CourseDetail.jsx,
    // CertificationDetail.jsx) posent explicitement "en_attente" dès la
    // soumission du formulaire, avant tout paiement - donc un blacklist sur
    // "nouveau" seul se fait contourner par n'importe quelle autre valeur
    // arbitraire posée à la création. Seul un vrai placement en groupe
    // (groupeApp, posé uniquement par le staff via classes_elearning_apprenants/
    // groupes_apprenants) prouve une inscription réellement effective.
    const is_apprenant = !!groupeApp;

    // 2. Récupérer le dernier test de niveau (centre + commercial)
    const { data: testResult } = await supabase
      .from("level_test_results")
      .select("centre_id, commercial_id")
      .eq("email", email)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const centre_id = inscription?.centre_id || testResult?.centre_id || null;

    // 3. Données du centre
    let centre = null;
    if (centre_id) {
      const { data } = await supabase
        .from("centres")
        .select("id, nom, ville, telephone, adresse")
        .eq("id", centre_id)
        .maybeSingle();
      centre = data;
    }

    // 4. Données de la commercial (si assignée)
    let commercial = null;
    const commercial_id = testResult?.commercial_id || null;
    if (commercial_id) {
      const { data } = await supabase
        .from("utilisateurs")
        .select("id, nom, prenom, telephone, email, scope")
        .eq("id", commercial_id)
        .maybeSingle();
      commercial = data;
    }

    // 5. Assignation active (type_coaching, paiement…)
    let assignation = null;
    const { data: ass } = await supabase
      .from("assignations_parcours")
      .select("id, type_coaching, type_cours, statut_paiement, montant_paye, plan_paiement, suivi_demarrage")
      .ilike("prospect_email", email.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ass) {
      assignation = {
        id:               ass.id,
        type_coaching:    ass.type_coaching || null,
        type_cours:       ass.type_cours    || null,
        statut_paiement:  ass.statut_paiement || null,
        montant_paye:     ass.montant_paye   ?? null,
        plan_paiement:    (() => { try { return ass.plan_paiement ? JSON.parse(ass.plan_paiement) : []; } catch { return []; } })(),
        suivi_demarrage:  ass.suivi_demarrage || null,
      };
    }

    // 6. Groupe le plus récent + coach - neq "retire" pour garder la visibilité
    // sur la classe même si elle a été clôturée depuis (apprenant "archive").
    let groupe = null;
    let coach  = null;
    const { data: ga } = await supabase
      .from("groupes_apprenants")
      .select("id, groupe_id, groupes(id, nom, niveau, filiere, type_cours, horaire, date_debut, coach_id, capacite_max, is_prive)")
      .ilike("email_apprenant", email.trim())
      .neq("statut", "retire")
      .order("date_ajout", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ga?.groupes) {
      const g = ga.groupes;
      let horaire = [];
      try { horaire = Array.isArray(g.horaire) ? g.horaire : (g.horaire ? JSON.parse(g.horaire) : []); } catch {}
      groupe = { id: g.id, nom: g.nom, niveau: g.niveau, filiere: g.filiere, type_cours: g.type_cours, horaire, date_debut: g.date_debut, est_prive: g.is_prive === true || g.capacite_max === 1, ga_id: ga.id };
      if (g.coach_id) {
        const { data: coachData } = await supabase
          .from("utilisateurs")
          .select("id, nom, prenom, telephone, email")
          .eq("id", g.coach_id)
          .maybeSingle();
        if (coachData) coach = { nom: coachData.nom, prenom: coachData.prenom, telephone: coachData.telephone, email: coachData.email };
      }
    }

    // Déduire profil_type
    const type_coaching = assignation?.type_coaching || null;
    const profil_type = type_coaching === "prive" || groupe?.est_prive ? "coaching_prive"
      : groupe ? "coaching_groupe"
      : "standard";

    res.json({ is_apprenant, centre, commercial, assignation, groupe, coach, profil_type });
  } catch (err) {
    console.error("prospect-info:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;