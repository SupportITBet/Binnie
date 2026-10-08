import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser, requirePermission } from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";
import { attribuerPoints, attribuerBonusProgression } from "../services/gamificationDash.js";
import { contenuPourType, TYPES_JOUABLES } from "../data/minijeux.js";

const router = express.Router();

console.log("✅ Route contenus onboarding dash chargée");

function acteurAudit(req) {
  return {
    acteur_id:    req.profil?.id    || null,
    acteur_nom:   `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
    acteur_email: req.profil?.email || req.user?.email || null,
    acteur_role:  req.role          || "admin",
    plateforme:   "dash",
  };
}

// "onboarding" est le rôle réel utilisé par dash (cf. OnboardingDashboard.jsx) ; manager/admin/
// super_admin gardent un accès de secours, comme pour le module contenus de bet-elearning.
const ROLES_CONTENUS_DASH = ["onboarding", "manager", "admin", "super_admin"];
const requireContenusRoleDash = (req, res, next) => {
  if (!ROLES_CONTENUS_DASH.includes(req.role)) {
    return res.status(403).json({ error: "Accès réservé à la gestion des contenus" });
  }
  next();
};

// Notifie les apprenants réels de dash (via groupes_apprenants, jamais classes_elearning_apprenants
// qui appartient à bet-elearning) qu'un nouveau contenu vient d'être publié.
async function notifierApprenantsDashNouveauContenu({ titre, message, meta }) {
  try {
    const { data: rows, error } = await supabase
      .from("groupes_apprenants")
      .select("apprenant_id")
      .not("apprenant_id", "is", null)
      .in("statut", ["actif", "archive"]);
    if (error) { console.error("[notifierApprenantsDashNouveauContenu]", error.message); return; }

    const ids = [...new Set((rows || []).map(r => r.apprenant_id))];
    if (!ids.length) return;

    await supabase.from("notifications").insert(
      ids.map(user_id => ({ user_id, type: "nouveau_contenu", titre, message, meta, source: "dash", lu: false }))
    );
  } catch (err) {
    console.error("[notifierApprenantsDashNouveauContenu]", err.message);
  }
}

/* ══════════════════════════════════════════════════════════
   LECTURE PUBLIQUE - tout apprenant dash connecté
══════════════════════════════════════════════════════════ */
router.get("/onboarding/publiques", authenticateUser, async (req, res) => {
  try {
    // Résout le type de coaching réel de l'apprenant via son groupe - le contenu de bienvenue
    // n'a pas le même sens pour un cours en groupe que pour du coaching privé, donc on filtre
    // en conséquence. `groupes.circuit` n'existe pas en base (seule la table `seances` a ce
    // champ) - le vrai signal fiable et déjà utilisé partout ailleurs pour repérer une classe
    // de coaching privé est `is_prive === true`, avec repli sur `capacite_max === 1` pour les
    // classes créées avant que cette colonne soit écrite (cf. dash/src/utils/classePrivee.js
    // ..." dans CommercialDashboard.jsx/OnboardingDashboard.jsx). Si le type ne peut pas être
    // déterminé (aucun groupe encore assigné), on ne montre que les contenus "tous" - le choix
    // le plus sûr plutôt que de deviner ou de tout afficher par défaut.
    /* RÉSOLUTION PAR IDENTIFIANT *OU* PAR E-MAIL, et sur tous les statuts utiles.
       L'ancienne version n'interrogeait que `apprenant_id` + `statut = "actif"`. Or
       `apprenant_id` est renseigné APRÈS COUP, par la route `mon-espace` : à la toute
       première connexion, les deux appels partent ensemble et celui-ci lisait la ligne
       avant le rattachement. `cibleApprenant` tombait alors à `null` et la réponse se
       limitait aux contenus « tous » - l'apprenant perdait la moitié de son onboarding
       le jour où il en avait le plus besoin. Même effet, permanent celui-là, pour un
       rattachement `archive` ou `retire`. */
    const STATUTS_RATTACHEMENT = ["actif", "en_cours", "inscrit", "archive", "retire"];
    const CHAMPS_GA = "groupes(capacite_max)";
    let { data: ga } = await supabase
      .from("groupes_apprenants")
      .select(CHAMPS_GA)
      .eq("apprenant_id", req.user.id)
      .in("statut", STATUTS_RATTACHEMENT)
      .limit(1)
      .maybeSingle();
    if (!ga && req.user.email) {
      ({ data: ga } = await supabase
        .from("groupes_apprenants")
        .select(CHAMPS_GA)
        .ilike("email_apprenant", req.user.email)
        .in("statut", STATUTS_RATTACHEMENT)
        .limit(1)
        .maybeSingle());
    }
    const capaciteMax = ga?.groupes?.capacite_max;
    const cibleApprenant = capaciteMax === 1 ? "prive" : capaciteMax != null ? "particulier" : null;

    let q = supabase
      .from("contenus_onboarding_dash")
      .select("id, titre, cat, type, detail, fichier_url, vues, cible_coaching")
      .eq("visible", true);
    q = cibleApprenant ? q.in("cible_coaching", ["tous", cibleApprenant]) : q.eq("cible_coaching", "tous");

    let { data, error } = await q.order("created_at", { ascending: false });
    // Repli si la migration ajoutant `cible_coaching` n'a pas encore été jouée - ne pas filtrer
    // plutôt que de casser l'affichage des contenus existants.
    if (error && (error.code === "42703" || (error.message || "").includes("cible_coaching"))) {
      const retry = await supabase
        .from("contenus_onboarding_dash")
        .select("id, titre, cat, type, detail, fichier_url, vues")
        .eq("visible", true)
        .order("created_at", { ascending: false });
      data = retry.data; error = retry.error;
    }
    if (error) throw error;
    res.json({ contenus: data || [] });
  } catch (err) {
    console.error("[contenus-dash/onboarding/publiques GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.get("/videos/publiques", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contenus_videos_dash")
      .select("id, titre, type, cible, duree, niveau, icone, fichier_url, vues")
      .eq("visible", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ videos: data || [] });
  } catch (err) {
    console.error("[contenus-dash/videos/publiques GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/onboarding/:id/vue", authenticateUser, async (req, res) => {
  try {
    const { data: current } = await supabase.from("contenus_onboarding_dash").select("vues").eq("id", req.params.id).maybeSingle();
    if (!current) return res.status(404).json({ error: "Contenu introuvable" });
    const { data, error } = await supabase
      .from("contenus_onboarding_dash")
      .update({ vues: (current.vues || 0) + 1 })
      .eq("id", req.params.id)
      .select("vues")
      .single();
    if (error) throw error;
    res.json({ vues: data.vues });
  } catch (err) {
    console.error("[contenus-dash/onboarding/vue POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/videos/:id/vue", authenticateUser, async (req, res) => {
  try {
    const { data: current } = await supabase.from("contenus_videos_dash").select("vues").eq("id", req.params.id).maybeSingle();
    if (!current) return res.status(404).json({ error: "Vidéo introuvable" });
    const { data, error } = await supabase
      .from("contenus_videos_dash")
      .update({ vues: (current.vues || 0) + 1 })
      .eq("id", req.params.id)
      .select("vues")
      .single();
    if (error) throw error;
    res.json({ vues: data.vues });
  } catch (err) {
    console.error("[contenus-dash/videos/vue POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   ADMIN - CONTENUS PAR ÉTAPE D'ONBOARDING
══════════════════════════════════════════════════════════ */
router.get("/onboarding", authenticateAdmin, requireContenusRoleDash, async (req, res) => {
  try {
    const { cat } = req.query;
    let q = supabase.from("contenus_onboarding_dash").select("*").order("created_at", { ascending: false });
    if (cat && cat !== "tous") q = q.eq("cat", cat);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ contenus: data || [] });
  } catch (err) {
    console.error("[contenus-dash/onboarding GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/onboarding", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_ressources", "create"), async (req, res) => {
  try {
    const { titre, cat, type, detail, fichier_url, visible, cible_coaching } = req.body;
    if (!titre || !cat || !type) return res.status(400).json({ error: "titre, cat et type requis" });

    const payload = { titre, cat, type, detail: detail || null, fichier_url: fichier_url || null, visible: visible !== false, cible_coaching: cible_coaching || "tous", created_by: req.profil.id };
    let { data, error } = await supabase.from("contenus_onboarding_dash").insert(payload).select().single();
    // Repli si la migration ajoutant `cible_coaching` n'a pas encore été jouée
    if (error && (error.code === "42703" || (error.message || "").includes("cible_coaching"))) {
      const { cible_coaching: _cc, ...payloadSans } = payload;
      const retry = await supabase.from("contenus_onboarding_dash").insert(payloadSans).select().single();
      data = retry.data; error = retry.error;
    }
    if (error) throw error;

    if (data.visible) {
      notifierApprenantsDashNouveauContenu({
        titre:   "📚 Nouveau contenu disponible",
        message: `"${data.titre}" vient d'être ajouté à votre guide de démarrage.`,
        meta:    { contenu_id: data.id, cat: data.cat, type: data.type },
      });
    }

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_CREE",
      module:      "contenus", plateforme: "dash",
      entite_type: "contenus_onboarding_dash",
      entite_id:   data.id,
      detail:      `Ajout d'un contenu onboarding${data.visible ? " (publié)" : " (masqué)"} : "${data.titre}" - ${data.cat}`,
      statut:      "success",
    }).catch(() => {});

    res.status(201).json({ contenu: data });
  } catch (err) {
    console.error("[contenus-dash/onboarding POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.patch("/onboarding/:id", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_ressources", "update"), async (req, res) => {
  try {
    const { titre, cat, type, detail, fichier_url, visible, cible_coaching } = req.body;
    const updates = {};
    if (titre !== undefined)          updates.titre = titre;
    if (cat !== undefined)            updates.cat = cat;
    if (type !== undefined)           updates.type = type;
    if (detail !== undefined)         updates.detail = detail;
    if (fichier_url !== undefined)    updates.fichier_url = fichier_url;
    if (visible !== undefined)        updates.visible = visible;
    if (cible_coaching !== undefined) updates.cible_coaching = cible_coaching;

    let etaitVisible = false;
    if (updates.visible === true) {
      const { data: avant } = await supabase.from("contenus_onboarding_dash").select("visible").eq("id", req.params.id).maybeSingle();
      etaitVisible = !!avant?.visible;
    }

    let { data, error } = await supabase.from("contenus_onboarding_dash").update(updates).eq("id", req.params.id).select().single();
    // Repli si la migration ajoutant `cible_coaching` n'a pas encore été jouée
    if (error && (error.code === "42703" || (error.message || "").includes("cible_coaching"))) {
      const { cible_coaching: _cc, ...updatesSans } = updates;
      const retry = await supabase.from("contenus_onboarding_dash").update(updatesSans).eq("id", req.params.id).select().single();
      data = retry.data; error = retry.error;
    }
    if (error) throw error;

    if (updates.visible === true && !etaitVisible) {
      notifierApprenantsDashNouveauContenu({
        titre:   "📚 Nouveau contenu disponible",
        message: `"${data.titre}" vient d'être ajouté à votre guide de démarrage.`,
        meta:    { contenu_id: data.id, cat: data.cat, type: data.type },
      });
    }

    if (updates.visible !== undefined) {
      logAudit({
        ...acteurAudit(req),
        action_type: updates.visible ? "CONTENU_PUBLIE" : "CONTENU_MASQUE",
        module:      "contenus", plateforme: "dash",
        entite_type: "contenus_onboarding_dash",
        entite_id:   data.id,
        detail:      `${updates.visible ? "Publication" : "Masquage"} du contenu "${data.titre}"`,
        statut:      "success",
      }).catch(() => {});
    } else if (Object.keys(updates).length) {
      logAudit({
        ...acteurAudit(req),
        action_type: "CONTENU_MODIFIE",
        module:      "contenus", plateforme: "dash",
        entite_type: "contenus_onboarding_dash",
        entite_id:   data.id,
        detail:      `Modification du contenu "${data.titre}" (${Object.keys(updates).join(", ")})`,
        statut:      "success",
      }).catch(() => {});
    }

    res.json({ contenu: data });
  } catch (err) {
    console.error("[contenus-dash/onboarding PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.delete("/onboarding/:id", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_ressources", "delete"), async (req, res) => {
  try {
    const { data: avant } = await supabase.from("contenus_onboarding_dash").select("titre, cat").eq("id", req.params.id).maybeSingle();
    const { error } = await supabase.from("contenus_onboarding_dash").delete().eq("id", req.params.id);
    if (error) throw error;

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_SUPPRIME",
      module:      "contenus", plateforme: "dash",
      entite_type: "contenus_onboarding_dash",
      entite_id:   req.params.id,
      detail:      `Suppression du contenu "${avant?.titre || req.params.id}"${avant?.cat ? " - " + avant.cat : ""}`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error("[contenus-dash/onboarding DELETE]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   ADMIN - BIBLIOTHÈQUE LIBRE ("AUTRES VIDÉOS")
══════════════════════════════════════════════════════════ */
router.get("/videos", authenticateAdmin, requireContenusRoleDash, async (req, res) => {
  try {
    const { data, error } = await supabase.from("contenus_videos_dash").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ videos: data || [] });
  } catch (err) {
    console.error("[contenus-dash/videos GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/videos", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_biblio", "create"), async (req, res) => {
  try {
    const { titre, type, cible, duree, niveau, icone, fichier_url, visible } = req.body;
    if (!titre || !type) return res.status(400).json({ error: "titre et type requis" });

    const { data, error } = await supabase
      .from("contenus_videos_dash")
      .insert({
        titre, type, cible: cible || "tous",
        duree: duree || null, niveau: niveau || null, icone: icone || "🎬",
        fichier_url: fichier_url || null, visible: visible !== false,
        created_by: req.profil.id,
      })
      .select()
      .single();
    if (error) throw error;

    if (data.visible) {
      notifierApprenantsDashNouveauContenu({
        titre:   `${data.icone || "🎬"} Nouvelle vidéo disponible`,
        message: `"${data.titre}" vient d'être publiée.`,
        meta:    { video_id: data.id, type: data.type },
      });
    }

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_CREE",
      module:      "contenus", plateforme: "dash",
      entite_type: "contenus_videos_dash",
      entite_id:   data.id,
      detail:      `Ajout à la bibliothèque de vidéos${data.visible ? " (publié)" : " (masqué)"} : "${data.titre}"`,
      statut:      "success",
    }).catch(() => {});

    res.status(201).json({ video: data });
  } catch (err) {
    console.error("[contenus-dash/videos POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.patch("/videos/:id", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_biblio", "update"), async (req, res) => {
  try {
    const { titre, type, cible, duree, niveau, icone, fichier_url, visible } = req.body;
    const updates = {};
    if (titre !== undefined)       updates.titre = titre;
    if (type !== undefined)        updates.type = type;
    if (cible !== undefined)       updates.cible = cible;
    if (duree !== undefined)       updates.duree = duree;
    if (niveau !== undefined)      updates.niveau = niveau;
    if (icone !== undefined)       updates.icone = icone;
    if (fichier_url !== undefined) updates.fichier_url = fichier_url;
    if (visible !== undefined)     updates.visible = visible;

    let etaitVisible = false;
    if (updates.visible === true) {
      const { data: avant } = await supabase.from("contenus_videos_dash").select("visible").eq("id", req.params.id).maybeSingle();
      etaitVisible = !!avant?.visible;
    }

    const { data, error } = await supabase.from("contenus_videos_dash").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;

    if (updates.visible === true && !etaitVisible) {
      notifierApprenantsDashNouveauContenu({
        titre:   `${data.icone || "🎬"} Nouvelle vidéo disponible`,
        message: `"${data.titre}" vient d'être publiée.`,
        meta:    { video_id: data.id, type: data.type },
      });
    }

    if (updates.visible !== undefined) {
      logAudit({
        ...acteurAudit(req),
        action_type: updates.visible ? "CONTENU_PUBLIE" : "CONTENU_MASQUE",
        module:      "contenus", plateforme: "dash",
        entite_type: "contenus_videos_dash",
        entite_id:   data.id,
        detail:      `${updates.visible ? "Publication" : "Masquage"} de "${data.titre}" (bibliothèque de vidéos)`,
        statut:      "success",
      }).catch(() => {});
    } else if (Object.keys(updates).length) {
      logAudit({
        ...acteurAudit(req),
        action_type: "CONTENU_MODIFIE",
        module:      "contenus", plateforme: "dash",
        entite_type: "contenus_videos_dash",
        entite_id:   data.id,
        detail:      `Modification de "${data.titre}" (bibliothèque de vidéos) - ${Object.keys(updates).join(", ")}`,
        statut:      "success",
      }).catch(() => {});
    }

    res.json({ video: data });
  } catch (err) {
    console.error("[contenus-dash/videos PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.delete("/videos/:id", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_biblio", "delete"), async (req, res) => {
  try {
    const { data: avant } = await supabase.from("contenus_videos_dash").select("titre").eq("id", req.params.id).maybeSingle();
    const { error } = await supabase.from("contenus_videos_dash").delete().eq("id", req.params.id);
    if (error) throw error;

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_SUPPRIME",
      module:      "contenus", plateforme: "dash",
      entite_type: "contenus_videos_dash",
      entite_id:   req.params.id,
      detail:      `Suppression de "${avant?.titre || req.params.id}" (bibliothèque de vidéos)`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error("[contenus-dash/videos DELETE]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   MINI-JEUX - lecture publique (apprenant dash uniquement, jamais
   bet-elearning : table et logique entièrement séparées)
══════════════════════════════════════════════════════════ */
router.get("/mini-jeux/publiques", authenticateUser, async (req, res) => {
  try {
    // Plusieurs instances actives peuvent partager le même `type` (même moteur de
    // jeu, contenu différent nommé par l'admin) - on renvoie donc la liste complète
    // des instances plutôt qu'un dictionnaire par type, pour les distinguer.
    const { data, error } = await supabase.from("contenus_mini_jeux_dash").select("id, type, nom, cible, max_tentatives, nb_questions").eq("actif", true).order("created_at", { ascending: true });
    if (error) throw error;

    /* `jouable` dit si un moteur existe pour ce `type`. Un admin peut créer une instance avec
       un type libre ; sans ce drapeau, le client proposerait une partie qui s'ouvrirait sur un
       écran vide. Les clients s'en servent pour griser la carte au lieu de la masquer — le jeu
       est bien publié, c'est le moteur qui manque. */
    const jeux = (data || []).map(j => ({ ...j, jouable: TYPES_JOUABLES.includes(j.type) }));
    res.json({ jeux });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux/publiques GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.get("/mini-jeux/mes-resultats", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contenus_mini_jeux_resultats_dash")
      .select("jeu_id, score, score_max, pourcentage, tentative_numero, created_at")
      .eq("apprenant_id", req.profil.id)
      .order("created_at", { ascending: true });
    if (error) throw error;

    // Clé par instance (jeu_id) et non par type - chaque instance a son propre
    // compteur de tentatives même si elle partage le moteur d'une autre.
    const parJeu = {};
    (data || []).forEach(r => {
      const id = r.jeu_id;
      if (!parJeu[id]) parJeu[id] = { tentatives: 0, dernierScore: null, dernierPourcentage: null, meilleurPourcentage: null, pourcentages: [] };
      parJeu[id].tentatives += 1;
      parJeu[id].dernierScore = r.score;
      parJeu[id].dernierPourcentage = r.pourcentage;
      if (r.pourcentage != null) {
        parJeu[id].pourcentages.push(r.pourcentage);
        parJeu[id].meilleurPourcentage = parJeu[id].meilleurPourcentage == null ? r.pourcentage : Math.max(parJeu[id].meilleurPourcentage, r.pourcentage);
      }
    });
    Object.values(parJeu).forEach(t => {
      t.moyennePourcentage = t.pourcentages.length ? Math.round(t.pourcentages.reduce((s,p)=>s+p,0)/t.pourcentages.length) : null;
      delete t.pourcentages;
    });

    const tousPourcentages = (data || []).map(r => r.pourcentage).filter(p => p != null);
    const kpis = {
      partiesJouees: (data || []).length,
      jeuxJoues: Object.keys(parJeu).length,
      meilleurScore: tousPourcentages.length ? Math.max(...tousPourcentages) : null,
      scoreMoyen: tousPourcentages.length ? Math.round(tousPourcentages.reduce((s,p)=>s+p,0)/tousPourcentages.length) : null,
    };

    res.json({ parJeu, kpis });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux/mes-resultats GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/**
 * GET /mini-jeux/:id/questions - le contenu jouable d'une instance.
 *
 * POURQUOI CETTE ROUTE EXISTE. Les questions des quinze jeux étaient écrites en dur dans
 * `dash/src/Pages/EspaceApprenant/EspaceApprenant.jsx`, donc dans un seul client : l'application
 * mobile ne pouvait faire jouer aucun jeu sans qu'on recopie 190 lignes de questions dans un
 * second projet. Elles vivent maintenant dans `src/data/minijeux.js` et sont servies ici.
 *
 * ELLE REFUSE DE SERVIR UNE PARTIE DE TROP. Le plafond `max_tentatives` était jusqu'ici une
 * simple politesse du client ; il est désormais vérifié ici ET à l'enregistrement du résultat.
 * Les deux contrôles sont utiles et ne font pas le même travail : celui-ci évite de laisser
 * l'apprenant jouer une partie qui serait refusée à la fin, l'autre est le vrai verrou.
 *
 * `tentatives_restantes` est renvoyé pour que le client puisse l'afficher AVANT la partie, sans
 * recouper lui-même `mes-resultats` avec le plafond.
 */
router.get("/mini-jeux/:id/questions", authenticateUser, async (req, res) => {
  try {
    const { data: jeu, error } = await supabase
      .from("contenus_mini_jeux_dash")
      .select("id, type, nom, cible, max_tentatives, nb_questions, actif")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!jeu) return res.status(404).json({ error: "Jeu introuvable" });
    if (!jeu.actif) return res.status(403).json({ error: "Ce jeu n'est plus publié" });

    const contenu = contenuPourType(jeu.type);
    if (!contenu) {
      return res.status(422).json({
        error: `Aucun moteur de jeu pour le type « ${jeu.type} »`,
        type: jeu.type,
      });
    }

    const { count } = await supabase
      .from("contenus_mini_jeux_resultats_dash")
      .select("id", { count: "exact", head: true })
      .eq("jeu_id", jeu.id)
      .eq("apprenant_id", req.profil.id);

    const faites = count || 0;
    const max = Number(jeu.max_tentatives) || null;
    const restantes = max != null ? Math.max(0, max - faites) : null;

    if (restantes === 0) {
      return res.status(409).json({
        error: "Tentatives épuisées pour ce jeu",
        tentatives_faites: faites,
        tentatives_restantes: 0,
        max_tentatives: max,
      });
    }

    const { nb, ...jouable } = contenu;
    res.json({
      jeu: { id: jeu.id, nom: jeu.nom, type: jeu.type, cible: jeu.cible, max_tentatives: max },
      // `score_max` vient de la banque, pas de la colonne `nb_questions` : c'est la banque qui
      // décide combien de points une partie peut rapporter.
      score_max: nb,
      tentatives_faites: faites,
      tentatives_restantes: restantes,
      contenu: jouable,
    });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux/questions GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/mini-jeux/:id/resultat", authenticateUser, async (req, res) => {
  try {
    const { score, score_max } = req.body;
    if (score === undefined) return res.status(400).json({ error: "score requis" });

    /* ───────────────────────────────────────────────────────────────────────────────────────
       LE PLAFOND DE TENTATIVES EST VÉRIFIÉ ICI, ET C'EST NOUVEAU.

       Cette route acceptait auparavant n'importe quel nombre de résultats et attribuait des
       points à chacun : `max_tentatives` n'existait que parce que l'écran web refusait de
       lancer une 3e partie, et `tentative_numero` était simplement ce que le client affirmait.
       Un second client — l'application mobile — ou un appel direct offrait donc des points
       sans limite.

       `tentative_numero` est maintenant COMPTÉ, plus reçu : c'est la seule valeur en laquelle
       on peut avoir confiance, et elle sert ensuite au bonus de progression.
       ─────────────────────────────────────────────────────────────────────────────────────── */
    const { data: jeuPlafond } = await supabase
      .from("contenus_mini_jeux_dash")
      .select("nom, max_tentatives")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!jeuPlafond) return res.status(404).json({ error: "Jeu introuvable" });

    const { count: dejaFaites } = await supabase
      .from("contenus_mini_jeux_resultats_dash")
      .select("id", { count: "exact", head: true })
      .eq("jeu_id", req.params.id)
      .eq("apprenant_id", req.profil.id);

    const maxTentatives = Number(jeuPlafond.max_tentatives) || null;
    if (maxTentatives != null && (dejaFaites || 0) >= maxTentatives) {
      return res.status(409).json({
        error: "Tentatives épuisées pour ce jeu",
        tentatives_faites: dejaFaites || 0,
        max_tentatives: maxTentatives,
      });
    }
    const tentative_numero = (dejaFaites || 0) + 1;

    const pourcentage = score_max ? Math.round((score / score_max) * 100) : null;
    const apprenantNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Apprenant";

    // Meilleur score précédent sur ce jeu - pour le bonus "progression au réessai".
    const { data: precedents } = await supabase
      .from("contenus_mini_jeux_resultats_dash")
      .select("pourcentage")
      .eq("jeu_id", req.params.id)
      .eq("apprenant_id", req.profil.id);
    const meilleurPrecedent = (precedents || []).reduce((m, r) => r.pourcentage != null ? Math.max(m, r.pourcentage) : m, -1);

    const { error: errInsert } = await supabase.from("contenus_mini_jeux_resultats_dash").insert({
      jeu_id: req.params.id,
      apprenant_id: req.profil.id,
      apprenant_nom: apprenantNom,
      score, score_max: score_max || null, pourcentage,
      tentative_numero,
    });
    if (errInsert) throw errInsert;

    const { data: tousResultats } = await supabase
      .from("contenus_mini_jeux_resultats_dash")
      .select("pourcentage")
      .eq("jeu_id", req.params.id);
    const avecPourcentage = (tousResultats || []).filter(r => r.pourcentage !== null);
    const scoreMoyen = avecPourcentage.length
      ? Math.round(avecPourcentage.reduce((s, r) => s + r.pourcentage, 0) / avecPourcentage.length)
      : 0;

    await supabase.from("contenus_mini_jeux_dash").update({
      parties_jouees: (tousResultats || []).length,
      score_moyen: scoreMoyen,
    }).eq("id", req.params.id);

    // Gamification : points de participation (barème "score % × 0,2", 4 à 20 pts) + bonus
    // "progression au réessai" si ce score bat le meilleur précédent sur ce même jeu.
    const pointsJeu = pourcentage != null ? Math.max(4, Math.min(20, Math.round(pourcentage * 0.2))) : 4;
    attribuerPoints(req.profil.id, "mini_jeu", req.params.id, pointsJeu, `Mini-jeu - ${jeuPlafond.nom || "partie"}`).catch(() => {});
    if (tentative_numero > 1 && pourcentage != null && pourcentage > meilleurPrecedent) {
      attribuerBonusProgression(req.profil.id, req.params.id).catch(() => {});
    }

    /* Le client a besoin de savoir s'il peut rejouer : c'est le serveur qui tranche maintenant,
       inutile de le laisser recouper le plafond lui-même. */
    res.status(201).json({
      ok: true,
      pourcentage,
      points: pointsJeu,
      tentative_numero,
      tentatives_restantes: maxTentatives != null ? Math.max(0, maxTentatives - tentative_numero) : null,
    });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux/resultat POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* GET détail des résultats par apprenant, pour le modal admin */
router.get("/mini-jeux/:id/resultats", authenticateAdmin, requireContenusRoleDash, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contenus_mini_jeux_resultats_dash")
      .select("*")
      .eq("jeu_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ resultats: data || [] });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux/resultats GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   MINI-JEUX - CRUD admin (catalogue de types déjà fixé côté frontend,
   ici on active/désactive une entrée et on règle cible/tentatives)
══════════════════════════════════════════════════════════ */
router.get("/mini-jeux", authenticateAdmin, requireContenusRoleDash, async (req, res) => {
  try {
    const { data, error } = await supabase.from("contenus_mini_jeux_dash").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ jeux: data || [] });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/mini-jeux", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_minijeux", "create"), async (req, res) => {
  try {
    const { nom, type, cible, max_tentatives, nb_questions } = req.body;
    if (!nom || !type) return res.status(400).json({ error: "nom et type requis" });

    const { data, error } = await supabase
      .from("contenus_mini_jeux_dash")
      .insert({ nom, type, cible: cible || "tous", max_tentatives: max_tentatives || 2, nb_questions: nb_questions || null, actif: false, created_by: req.profil.id })
      .select()
      .single();
    if (error) throw error;

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_CREE",
      module:      "contenus", plateforme: "dash",
      entite_type: "contenus_mini_jeux_dash",
      entite_id:   data.id,
      detail:      `Ajout du mini-jeu "${data.nom}" (${data.type})`,
      statut:      "success",
    }).catch(() => {});

    res.status(201).json({ jeu: data });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.patch("/mini-jeux/:id", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_minijeux", "update"), async (req, res) => {
  try {
    const { nom, cible, max_tentatives, nb_questions, actif, reset, parties_jouees, score_moyen } = req.body;
    const updates = {};
    if (nom !== undefined)            updates.nom = nom;
    if (cible !== undefined)          updates.cible = cible;
    if (max_tentatives !== undefined) updates.max_tentatives = max_tentatives;
    if (nb_questions !== undefined)   updates.nb_questions = nb_questions;
    if (actif !== undefined)          updates.actif = actif;
    /* `parties_jouees` et `score_moyen` sont des COMPTEURS DÉRIVÉS de
       `contenus_mini_jeux_resultats_dash` : la route de résultat les recalcule à chaque partie.
       Les accepter depuis le client n'a donc qu'un usage, la remise à zéro — et `reset` le fait
       déjà, mieux, puisqu'il supprime aussi les résultats.

       L'ORDRE COMPTE, ET IL ÉTAIT FAUX. Ces deux affectations venaient APRÈS le bloc `reset` :
       un appel portant `reset:true` ET `parties_jouees` (la valeur affichée à l'écran) effaçait
       les résultats puis réécrivait l'ancien compteur par-dessus le zéro. La table se vidait,
       le compteur restait — c'est l'état trouvé en production le 07/10/2026 : aucun résultat
       enregistré, et pourtant 3 parties annoncées sur deux jeux.

       `reset` a maintenant le dernier mot. */
    if (parties_jouees !== undefined) updates.parties_jouees = parties_jouees;
    if (score_moyen !== undefined)    updates.score_moyen = score_moyen;
    if (reset) {
      updates.parties_jouees = 0;
      updates.score_moyen = 0;
      await supabase.from("contenus_mini_jeux_resultats_dash").delete().eq("jeu_id", req.params.id);
    }

    const { data, error } = await supabase.from("contenus_mini_jeux_dash").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;

    if (updates.actif !== undefined) {
      logAudit({
        ...acteurAudit(req),
        action_type: updates.actif ? "CONTENU_PUBLIE" : "CONTENU_MASQUE",
        module:      "contenus", plateforme: "dash",
        entite_type: "contenus_mini_jeux_dash",
        entite_id:   data.id,
        detail:      `${updates.actif ? "Activation" : "Désactivation"} du mini-jeu "${data.nom}"`,
        statut:      "success",
      }).catch(() => {});
    }

    res.json({ jeu: data });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.delete("/mini-jeux/:id", authenticateAdmin, requireContenusRoleDash, requirePermission("contenus_minijeux", "delete"), async (req, res) => {
  try {
    const { data: avant } = await supabase.from("contenus_mini_jeux_dash").select("nom").eq("id", req.params.id).maybeSingle();
    const { error } = await supabase.from("contenus_mini_jeux_dash").delete().eq("id", req.params.id);
    if (error) throw error;

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_SUPPRIME",
      module:      "contenus", plateforme: "dash",
      entite_type: "contenus_mini_jeux_dash",
      entite_id:   req.params.id,
      detail:      `Suppression du mini-jeu "${avant?.nom || req.params.id}"`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error("[contenus-dash/mini-jeux DELETE]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
