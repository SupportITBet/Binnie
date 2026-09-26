import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, authenticateUser, requirePermission } from "../middlewares/requireAdmin.js";
import { attribuerPoints, attribuerBonusProgression, verifierBadges } from "../services/gamification.js";
import { logAudit } from "../middlewares/logAudit.js";

const router = express.Router();

console.log("✅ Route contenus onboarding chargée");

// Infos de l'acteur admin pour l'audit log - factorisé car répété à chaque action tracée.
function acteurAudit(req) {
  return {
    acteur_id:    req.profil?.id    || null,
    acteur_nom:   `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || null,
    acteur_email: req.profil?.email || req.user?.email || null,
    acteur_role:  req.role          || "admin",
    plateforme:   "bet-elearning",
  };
}

// Détermine la tranche d'âge d'un apprenant - même logique que côté frontend (calcTranche) et
// que le backfill profil_type déjà utilisé ailleurs dans ce projet.
function trancheDepuisApprenant(a) {
  if (a.profil_type && a.profil_type !== "adulte") return a.profil_type; // "enfant" | "adolescent"
  if (!a.date_naissance) return "adulte";
  const age = Math.floor((Date.now() - new Date(a.date_naissance).getTime()) / (365.25 * 24 * 3600 * 1000));
  if (age <= 12) return "enfant";
  if (age <= 17) return "adolescent";
  return "adulte";
}

// Notifie les apprenants réels de bet-elearning qu'un nouveau contenu vient d'être publié.
// ⚠️ Ne PAS utiliser notifyRole(['apprenant'], ...) ici : le rôle "apprenant" est partagé avec
// dash en base - cibler classes_elearning_apprenants garantit qu'on ne notifie que les vrais
// comptes apprenants de la plateforme bet-elearning, jamais ceux de dash.
async function notifierApprenantsNouveauContenu({ titre, message, meta, cible }) {
  try {
    const { data: apprenants, error } = await supabase
      .from("classes_elearning_apprenants")
      .select("apprenant_id, profil_type, date_naissance")
      .not("apprenant_id", "is", null)
      .neq("statut", "suspendu");
    if (error) { console.error("[notifierApprenantsNouveauContenu]", error.message); return; }

    const cibles = (apprenants || []).filter(a => !cible || cible === "tous" || trancheDepuisApprenant(a) === cible);
    const ids = [...new Set(cibles.map(a => a.apprenant_id))];
    if (!ids.length) return;

    await supabase.from("notifications").insert(
      ids.map(user_id => ({ user_id, type: "nouveau_contenu", titre, message, meta, source: "bet-elearning", lu: false }))
    );
  } catch (err) {
    console.error("[notifierApprenantsNouveauContenu]", err.message);
  }
}

// "admin_onboarding"/"admin_manager" n'existent qu'en façade frontend (remappés au login,
// cf. ROLE_MAP_BET dans bet-elearning/src/pages/auth/LoginAdmin.jsx) - le rôle réel stocké
// en base est "onboarding"/"manager"/"admin"/"super_admin". On accepte les deux formes.
const ROLES_CONTENUS = ["admin_onboarding", "onboarding", "admin_manager", "manager", "admin", "super_admin"];
const requireContenusRole = (req, res, next) => {
  if (!ROLES_CONTENUS.includes(req.role)) {
    return res.status(403).json({ error: "Accès réservé à la gestion des contenus" });
  }
  next();
};

/* ══════════════════════════════════════════════════════════
   GET /api/contenus/ressources/publiques - lecture seule, tout utilisateur connecté
   (apprenant/parent/coach…) - utilisé par le guide d'onboarding de l'apprenant pour
   afficher la vidéo/le PDF de bienvenue lié à chaque étape.
══════════════════════════════════════════════════════════ */
router.get("/ressources/publiques", authenticateUser, async (req, res) => {
  try {
    const { cat } = req.query;
    let q = supabase.from("contenus_ressources").select("id, titre, cat, type, detail, fichier_url, vues").eq("visible", true).order("created_at", { ascending: false });
    if (cat && cat !== "tous") q = q.eq("cat", cat);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ ressources: data || [] });
  } catch (err) {
    console.error("[contenus/ressources/publiques GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/contenus/biblio-communautaire/publiques - lecture seule, tout utilisateur
   connecté - bibliothèque accessible à tous les apprenants (pas liée à l'onboarding),
   filtrable côté client par tranche d'âge (cible).
══════════════════════════════════════════════════════════ */
router.get("/biblio-communautaire/publiques", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contenus_biblio_communautaire")
      .select("id, titre, type, cible, duree, niveau, icone, fichier_url")
      .eq("visible", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ ressources: data || [] });
  } catch (err) {
    console.error("[contenus/biblio-communautaire/publiques GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/contenus/ressources/:id/vue - incrémente le compteur de vues d'une ressource
   d'onboarding. Appelé côté apprenant quand une étape est ouverte / un contenu consulté.
   Lecture puis écriture (non parfaitement atomique sous forte concurrence, mais largement
   suffisant pour un compteur de vues non critique).
══════════════════════════════════════════════════════════ */
router.post("/ressources/:id/vue", authenticateUser, async (req, res) => {
  try {
    const { data: current } = await supabase.from("contenus_ressources").select("vues, cat").eq("id", req.params.id).maybeSingle();
    if (!current) return res.status(404).json({ error: "Ressource introuvable" });
    const { data, error } = await supabase
      .from("contenus_ressources")
      .update({ vues: (current.vues || 0) + 1 })
      .eq("id", req.params.id)
      .select("vues")
      .single();
    if (error) throw error;

    // Suivi par apprenant (badges "Explorateur") - ignore les doublons, une ressource ne
    // compte qu'une fois même si elle est rouverte plusieurs fois.
    const { error: vueErr } = await supabase.from("contenus_vues_apprenant").upsert(
      { apprenant_id: req.user.id, ressource_id: req.params.id, ressource_table: "contenus_ressources", cat: current.cat },
      { onConflict: "apprenant_id,ressource_id,ressource_table", ignoreDuplicates: true }
    );
    if (!vueErr) verifierBadges(req.user.id, "contenu_vue").catch(() => {});

    res.json({ vues: data.vues });
  } catch (err) {
    console.error("[contenus/ressources/vue POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* POST /api/contenus/biblio-communautaire/:id/vue - idem, pour la bibliothèque communautaire */
router.post("/biblio-communautaire/:id/vue", authenticateUser, async (req, res) => {
  try {
    const { data: current } = await supabase.from("contenus_biblio_communautaire").select("vues, cible").eq("id", req.params.id).maybeSingle();
    if (!current) return res.status(404).json({ error: "Ressource introuvable" });
    const { data, error } = await supabase
      .from("contenus_biblio_communautaire")
      .update({ vues: (current.vues || 0) + 1 })
      .eq("id", req.params.id)
      .select("vues")
      .single();
    if (error) throw error;

    const { error: vueErr } = await supabase.from("contenus_vues_apprenant").upsert(
      { apprenant_id: req.user.id, ressource_id: req.params.id, ressource_table: "contenus_biblio_communautaire", cat: current.cible },
      { onConflict: "apprenant_id,ressource_id,ressource_table", ignoreDuplicates: true }
    );
    if (!vueErr) verifierBadges(req.user.id, "contenu_vue").catch(() => {});

    res.json({ vues: data.vues });
  } catch (err) {
    console.error("[contenus/biblio-communautaire/vue POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   RESSOURCES ONBOARDING (bibliothèque)
══════════════════════════════════════════════════════════ */
router.get("/ressources", authenticateAdmin, requireContenusRole, async (req, res) => {
  try {
    const { cat } = req.query;
    let q = supabase.from("contenus_ressources").select("*").order("created_at", { ascending: false });
    if (cat && cat !== "tous") q = q.eq("cat", cat);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ ressources: data || [] });
  } catch (err) {
    console.error("[contenus/ressources GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/ressources", authenticateAdmin, requireContenusRole, requirePermission("contenus_ressources","create"), async (req, res) => {
  try {
    const { titre, cat, type, detail, fichier_url, visible } = req.body;
    if (!titre || !cat || !type) return res.status(400).json({ error: "titre, cat et type requis" });

    const { data, error } = await supabase
      .from("contenus_ressources")
      .insert({ titre, cat, type, detail: detail || null, fichier_url: fichier_url || null, visible: visible !== false, created_by: req.profil.id })
      .select()
      .single();
    if (error) throw error;

    if (data.visible) {
      notifierApprenantsNouveauContenu({
        titre:   "📚 Nouveau contenu disponible",
        message: `"${data.titre}" vient d'être ajouté à votre bibliothèque.`,
        meta:    { ressource_id: data.id, cat: data.cat, type: data.type },
      });
    }

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_CREE",
      module:      "contenus", plateforme: "bet-elearning",
      entite_type: "contenus_ressources",
      entite_id:   data.id,
      detail:      `Ajout d'une ressource${data.visible ? " (publiée)" : " (masquée)"} : "${data.titre}" - ${data.cat}`,
      statut:      "success",
    }).catch(() => {});

    res.status(201).json({ ressource: data });
  } catch (err) {
    console.error("[contenus/ressources POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.patch("/ressources/:id", authenticateAdmin, requireContenusRole, requirePermission("contenus_ressources","update"), async (req, res) => {
  try {
    const { titre, cat, type, detail, fichier_url, visible, vues } = req.body;
    const updates = {};
    if (titre !== undefined)       updates.titre = titre;
    if (cat !== undefined)         updates.cat = cat;
    if (type !== undefined)        updates.type = type;
    if (detail !== undefined)      updates.detail = detail;
    if (fichier_url !== undefined) updates.fichier_url = fichier_url;
    if (visible !== undefined)     updates.visible = visible;
    if (vues !== undefined)        updates.vues = vues;

    let etaitVisible = false;
    if (updates.visible === true) {
      const { data: avant } = await supabase.from("contenus_ressources").select("visible").eq("id", req.params.id).maybeSingle();
      etaitVisible = !!avant?.visible;
    }

    const { data, error } = await supabase.from("contenus_ressources").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;

    if (updates.visible === true && !etaitVisible) {
      notifierApprenantsNouveauContenu({
        titre:   "📚 Nouveau contenu disponible",
        message: `"${data.titre}" vient d'être ajouté à votre bibliothèque.`,
        meta:    { ressource_id: data.id, cat: data.cat, type: data.type },
      });
    }

    if (updates.visible !== undefined) {
      logAudit({
        ...acteurAudit(req),
        action_type: updates.visible ? "CONTENU_PUBLIE" : "CONTENU_MASQUE",
        module:      "contenus", plateforme: "bet-elearning",
        entite_type: "contenus_ressources",
        entite_id:   data.id,
        detail:      `${updates.visible ? "Publication" : "Masquage"} de la ressource "${data.titre}"`,
        statut:      "success",
      }).catch(() => {});
    } else if (Object.keys(updates).length) {
      logAudit({
        ...acteurAudit(req),
        action_type: "CONTENU_MODIFIE",
        module:      "contenus", plateforme: "bet-elearning",
        entite_type: "contenus_ressources",
        entite_id:   data.id,
        detail:      `Modification de la ressource "${data.titre}" (${Object.keys(updates).join(", ")})`,
        statut:      "success",
      }).catch(() => {});
    }

    res.json({ ressource: data });
  } catch (err) {
    console.error("[contenus/ressources PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.delete("/ressources/:id", authenticateAdmin, requireContenusRole, requirePermission("contenus_ressources","delete"), async (req, res) => {
  try {
    const { data: avant } = await supabase.from("contenus_ressources").select("titre, cat").eq("id", req.params.id).maybeSingle();
    const { error } = await supabase.from("contenus_ressources").delete().eq("id", req.params.id);
    if (error) throw error;

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_SUPPRIME",
      module:      "contenus", plateforme: "bet-elearning",
      entite_type: "contenus_ressources",
      entite_id:   req.params.id,
      detail:      `Suppression de la ressource "${avant?.titre || req.params.id}"${avant?.cat ? " - " + avant.cat : ""}`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error("[contenus/ressources DELETE]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   BIBLIOTHÈQUE COMMUNAUTAIRE (accessible à tous les apprenants)
══════════════════════════════════════════════════════════ */
router.get("/biblio-communautaire", authenticateAdmin, requireContenusRole, async (req, res) => {
  try {
    const { data, error } = await supabase.from("contenus_biblio_communautaire").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ ressources: data || [] });
  } catch (err) {
    console.error("[contenus/biblio-communautaire GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/biblio-communautaire", authenticateAdmin, requireContenusRole, requirePermission("contenus_biblio","create"), async (req, res) => {
  try {
    const { titre, type, cible, duree, niveau, icone, fichier_url, visible } = req.body;
    if (!titre || !type || !cible) return res.status(400).json({ error: "titre, type et cible requis" });

    const { data, error } = await supabase
      .from("contenus_biblio_communautaire")
      .insert({
        titre, type, cible,
        duree: duree || null, niveau: niveau || null, icone: icone || "🎵",
        fichier_url: fichier_url || null, visible: visible !== false,
        created_by: req.profil.id,
      })
      .select()
      .single();
    if (error) throw error;

    if (data.visible) {
      notifierApprenantsNouveauContenu({
        titre:   `${data.icone || "🎵"} Nouveau contenu - Bibliothèque communautaire`,
        message: `"${data.titre}" vient d'être publié.`,
        meta:    { ressource_id: data.id, type: data.type, cible: data.cible },
        cible:   data.cible,
      });
    }

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_CREE",
      module:      "contenus", plateforme: "bet-elearning",
      entite_type: "contenus_biblio_communautaire",
      entite_id:   data.id,
      detail:      `Ajout à la bibliothèque communautaire${data.visible ? " (publié)" : " (masqué)"} : "${data.titre}" - cible ${data.cible}`,
      statut:      "success",
    }).catch(() => {});

    res.status(201).json({ ressource: data });
  } catch (err) {
    console.error("[contenus/biblio-communautaire POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.patch("/biblio-communautaire/:id", authenticateAdmin, requireContenusRole, requirePermission("contenus_biblio","update"), async (req, res) => {
  try {
    const { titre, type, cible, duree, niveau, icone, fichier_url, visible, vues } = req.body;
    const updates = {};
    if (titre !== undefined)       updates.titre = titre;
    if (type !== undefined)        updates.type = type;
    if (cible !== undefined)       updates.cible = cible;
    if (duree !== undefined)       updates.duree = duree;
    if (niveau !== undefined)      updates.niveau = niveau;
    if (icone !== undefined)       updates.icone = icone;
    if (fichier_url !== undefined) updates.fichier_url = fichier_url;
    if (visible !== undefined)     updates.visible = visible;
    if (vues !== undefined)        updates.vues = vues;

    let etaitVisible = false;
    if (updates.visible === true) {
      const { data: avant } = await supabase.from("contenus_biblio_communautaire").select("visible").eq("id", req.params.id).maybeSingle();
      etaitVisible = !!avant?.visible;
    }

    const { data, error } = await supabase.from("contenus_biblio_communautaire").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;

    if (updates.visible === true && !etaitVisible) {
      notifierApprenantsNouveauContenu({
        titre:   `${data.icone || "🎵"} Nouveau contenu - Bibliothèque communautaire`,
        message: `"${data.titre}" vient d'être publié.`,
        meta:    { ressource_id: data.id, type: data.type, cible: data.cible },
        cible:   data.cible,
      });
    }

    if (updates.visible !== undefined) {
      logAudit({
        ...acteurAudit(req),
        action_type: updates.visible ? "CONTENU_PUBLIE" : "CONTENU_MASQUE",
        module:      "contenus", plateforme: "bet-elearning",
        entite_type: "contenus_biblio_communautaire",
        entite_id:   data.id,
        detail:      `${updates.visible ? "Publication" : "Masquage"} de "${data.titre}" (bibliothèque communautaire)`,
        statut:      "success",
      }).catch(() => {});
    } else if (Object.keys(updates).length) {
      logAudit({
        ...acteurAudit(req),
        action_type: "CONTENU_MODIFIE",
        module:      "contenus", plateforme: "bet-elearning",
        entite_type: "contenus_biblio_communautaire",
        entite_id:   data.id,
        detail:      `Modification de "${data.titre}" (bibliothèque communautaire) - ${Object.keys(updates).join(", ")}`,
        statut:      "success",
      }).catch(() => {});
    }

    res.json({ ressource: data });
  } catch (err) {
    console.error("[contenus/biblio-communautaire PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.delete("/biblio-communautaire/:id", authenticateAdmin, requireContenusRole, requirePermission("contenus_biblio","delete"), async (req, res) => {
  try {
    const { data: avant } = await supabase.from("contenus_biblio_communautaire").select("titre, cible").eq("id", req.params.id).maybeSingle();
    const { error } = await supabase.from("contenus_biblio_communautaire").delete().eq("id", req.params.id);
    if (error) throw error;

    logAudit({
      ...acteurAudit(req),
      action_type: "CONTENU_SUPPRIME",
      module:      "contenus", plateforme: "bet-elearning",
      entite_type: "contenus_biblio_communautaire",
      entite_id:   req.params.id,
      detail:      `Suppression de "${avant?.titre || req.params.id}" (bibliothèque communautaire)${avant?.cible ? " - cible " + avant.cible : ""}`,
      statut:      "warning",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error("[contenus/biblio-communautaire DELETE]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/contenus/mini-jeux/publiques - lecture seule, tout utilisateur connecté
   (apprenant) - utilisé par la page Mini-jeux pour savoir quels types de jeu sont
   activés par Onboarding PA / PA Contenus avant de les proposer à jouer.
══════════════════════════════════════════════════════════ */
router.get("/mini-jeux/publiques", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase.from("contenus_mini_jeux").select("id, type, actif, max_tentatives");
    if (error) throw error;
    const jeuxActifs = (data || []).filter(j => j.actif);
    const actifs = [...new Set(jeuxActifs.map(j => j.type))];
    // Tentatives max + id par type - pris sur la première ligne active de ce type.
    const maxTentatives = {};
    const idsParType = {};
    jeuxActifs.forEach(j => {
      if (maxTentatives[j.type] === undefined) maxTentatives[j.type] = j.max_tentatives;
      if (idsParType[j.type] === undefined) idsParType[j.type] = j.id;
    });
    res.json({ actifs, maxTentatives, idsParType });
  } catch (err) {
    console.error("[contenus/mini-jeux/publiques GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/contenus/mini-jeux/mes-resultats - l'apprenant récupère SES PROPRES tentatives
   passées, groupées par type de jeu. Sert à réhydrater le compteur de tentatives et l'état
   verrouillé/déverrouillé après un F5 - sans ça, tentativesJeu repartait de 0 en mémoire à
   chaque rechargement de page et le apprenant pouvait rejouer indéfiniment en actualisant.
══════════════════════════════════════════════════════════ */
router.get("/mini-jeux/mes-resultats", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contenus_mini_jeux_resultats")
      .select("jeu_id, score, score_max, pourcentage, tentative_numero, created_at, contenus_mini_jeux(type)")
      .eq("apprenant_id", req.profil.id)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const parType = {};
    (data || []).forEach(r => {
      const type = r.contenus_mini_jeux?.type;
      if (!type) return;
      if (!parType[type]) parType[type] = { tentatives: 0, dernierScore: null, dernierPourcentage: null, meilleurPourcentage: null, pourcentages: [] };
      parType[type].tentatives += 1;
      parType[type].dernierScore = r.score;
      parType[type].dernierPourcentage = r.pourcentage;
      if (r.pourcentage != null) {
        parType[type].pourcentages.push(r.pourcentage);
        parType[type].meilleurPourcentage = parType[type].meilleurPourcentage == null ? r.pourcentage : Math.max(parType[type].meilleurPourcentage, r.pourcentage);
      }
    });
    // Moyenne par type + nettoyage du tableau brut de pourcentages (usage interne uniquement)
    Object.values(parType).forEach(t => {
      t.moyennePourcentage = t.pourcentages.length ? Math.round(t.pourcentages.reduce((s,p)=>s+p,0)/t.pourcentages.length) : null;
      delete t.pourcentages;
    });

    // KPIs globaux tous jeux confondus, pour l'en-tête de l'onglet Mini-jeux de l'apprenant.
    const tousPourcentages = (data || []).map(r => r.pourcentage).filter(p => p != null);
    const kpis = {
      partiesJouees: (data || []).length,
      jeuxJoues: Object.keys(parType).length,
      meilleurScore: tousPourcentages.length ? Math.max(...tousPourcentages) : null,
      scoreMoyen: tousPourcentages.length ? Math.round(tousPourcentages.reduce((s,p)=>s+p,0)/tousPourcentages.length) : null,
    };

    res.json({ parType, kpis });
  } catch (err) {
    console.error("[contenus/mini-jeux/mes-resultats GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/contenus/mini-jeux/:id/resultat - l'apprenant rapporte le résultat d'une
   partie (score, score_max, numéro de tentative). Insère la ligne de détail ET met à jour
   les compteurs agrégés (parties_jouees, score_moyen) sur contenus_mini_jeux.
══════════════════════════════════════════════════════════ */
router.post("/mini-jeux/:id/resultat", authenticateUser, async (req, res) => {
  try {
    const { score, score_max, tentative_numero } = req.body;
    if (score === undefined) return res.status(400).json({ error: "score requis" });

    const pourcentage = score_max ? Math.round((score / score_max) * 100) : null;
    const apprenantNom = `${req.profil?.prenom || ""} ${req.profil?.nom || ""}`.trim() || req.profil?.email || "Apprenant";

    // Meilleur score précédent sur ce jeu - pour le bonus "progression au réessai".
    const { data: precedents } = await supabase
      .from("contenus_mini_jeux_resultats")
      .select("pourcentage")
      .eq("jeu_id", req.params.id)
      .eq("apprenant_id", req.profil.id);
    const meilleurPrecedent = (precedents || []).reduce((m, r) => r.pourcentage != null ? Math.max(m, r.pourcentage) : m, -1);

    const { error: errInsert } = await supabase.from("contenus_mini_jeux_resultats").insert({
      jeu_id: req.params.id,
      apprenant_id: req.profil.id,
      apprenant_nom: apprenantNom,
      score, score_max: score_max || null, pourcentage,
      tentative_numero: tentative_numero || 1,
    });
    if (errInsert) throw errInsert;

    // Recalcule les agrégats à partir de tous les résultats connus pour ce jeu.
    const { data: tousResultats } = await supabase
      .from("contenus_mini_jeux_resultats")
      .select("pourcentage")
      .eq("jeu_id", req.params.id);
    const avecPourcentage = (tousResultats || []).filter(r => r.pourcentage !== null);
    const scoreMoyen = avecPourcentage.length
      ? Math.round(avecPourcentage.reduce((s, r) => s + r.pourcentage, 0) / avecPourcentage.length)
      : 0;

    await supabase.from("contenus_mini_jeux").update({
      parties_jouees: (tousResultats || []).length,
      score_moyen: scoreMoyen,
    }).eq("id", req.params.id);

    // Gamification : points de participation (barème "score % × 0,2", 4 à 20 pts) + bonus
    // "progression au réessai" si ce score bat le meilleur précédent sur ce même jeu.
    const { data: jeuInfo } = await supabase.from("contenus_mini_jeux").select("nom").eq("id", req.params.id).maybeSingle();
    const pointsJeu = pourcentage != null ? Math.max(4, Math.min(20, Math.round(pourcentage * 0.2))) : 4;
    await attribuerPoints(req.profil.id, "mini_jeu", req.params.id, pointsJeu, `Mini-jeu - ${jeuInfo?.nom || "partie"}`);
    if ((tentative_numero || 1) > 1 && pourcentage != null && pourcentage > meilleurPrecedent) {
      await attribuerBonusProgression(req.profil.id, req.params.id);
    }

    res.status(201).json({ ok: true, pourcentage });
  } catch (err) {
    console.error("[contenus/mini-jeux/resultat POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* GET /api/contenus/mini-jeux/:id/resultats - détail par apprenant, pour le modal admin */
router.get("/mini-jeux/:id/resultats", authenticateAdmin, requireContenusRole, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("contenus_mini_jeux_resultats")
      .select("*")
      .eq("jeu_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ resultats: data || [] });
  } catch (err) {
    console.error("[contenus/mini-jeux/resultats GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   MINI-JEUX
══════════════════════════════════════════════════════════ */
router.get("/mini-jeux", authenticateAdmin, requireContenusRole, async (req, res) => {
  try {
    const { data, error } = await supabase.from("contenus_mini_jeux").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ jeux: data || [] });
  } catch (err) {
    console.error("[contenus/mini-jeux GET]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.post("/mini-jeux", authenticateAdmin, requireContenusRole, requirePermission("contenus_minijeux","create"), async (req, res) => {
  try {
    const { nom, type, categorie, cible, nb_questions, max_tentatives } = req.body;
    if (!nom || !type || !categorie) return res.status(400).json({ error: "nom, type et categorie requis" });

    const { data, error } = await supabase
      .from("contenus_mini_jeux")
      .insert({
        nom, type, categorie, cible: cible || "tous", nb_questions: nb_questions || 10,
        max_tentatives: max_tentatives || 2, actif: false, created_by: req.profil.id,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ jeu: data });
  } catch (err) {
    console.error("[contenus/mini-jeux POST]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.patch("/mini-jeux/:id", authenticateAdmin, requireContenusRole, requirePermission("contenus_minijeux","update"), async (req, res) => {
  try {
    const { nom, type, categorie, cible, nb_questions, max_tentatives, actif, reset, parties_jouees, score_moyen } = req.body;
    const updates = {};
    if (nom !== undefined)           updates.nom = nom;
    if (type !== undefined)          updates.type = type;
    if (categorie !== undefined)     updates.categorie = categorie;
    if (cible !== undefined)         updates.cible = cible;
    if (nb_questions !== undefined)  updates.nb_questions = nb_questions;
    if (max_tentatives !== undefined) updates.max_tentatives = max_tentatives;
    if (actif !== undefined) updates.actif = actif;
    if (reset) {
      updates.parties_jouees = 0;
      updates.score_moyen = 0;
      // Purge aussi le détail par apprenant, sinon le prochain résultat recalculerait la
      // moyenne à partir d'un historique censé être remis à zéro.
      await supabase.from("contenus_mini_jeux_resultats").delete().eq("jeu_id", req.params.id);
    }
    if (parties_jouees !== undefined) updates.parties_jouees = parties_jouees;
    if (score_moyen !== undefined) updates.score_moyen = score_moyen;

    const { data, error } = await supabase.from("contenus_mini_jeux").update(updates).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json({ jeu: data });
  } catch (err) {
    console.error("[contenus/mini-jeux PATCH]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

router.delete("/mini-jeux/:id", authenticateAdmin, requireContenusRole, requirePermission("contenus_minijeux","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("contenus_mini_jeux").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("[contenus/mini-jeux DELETE]", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
