import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { notifyRole } from "../services/notifyRole.js";
import { onAvisParentSoumis } from "../services/gamificationCoach.js";
import { onAvisParentSoumisDash } from "../services/gamificationCoachDash.js";
import { estElearning } from "../services/plateformeApprenant.js";

const router = express.Router();

// Labels lisibles par chemin (pages du site public Frontend)
const PATH_LABELS = {
  "/":                              "Accueil",
  "/about":                         "À propos",
  "/contact":                       "Contact",
  "/faq":                           "FAQ",
  "/blog":                          "Blog",
  "/temoignages":                   "Témoignages",
  "/boutique":                      "Boutique",
  "/test-niveau":                   "Test de niveau",
  "/connexion":                     "Connexion",
  "/mon-espace":                    "Mon Espace",
  "/update-password":               "Mise à jour mot de passe",
  "/paiement/retour":               "Retour paiement",
  "/parcours/particulier":          "Parcours Particulier",
  "/parcours/entreprise":           "Parcours Entreprise",
  "/parcours/inscription":          "Inscription",
  "/lead-magnet/audit-gratuit":     "Audit Gratuit",
  "/lead-magnet/merci":             "Merci Lead Magnet",
};

// ── POST /api/analytics/pageview ──────────────────────────────
// Endpoint public (pas d'auth) - enregistre une vue de page
router.post("/pageview", async (req, res) => {
  try {
    const { path, referrer, session_id, duration_ms, user_role } = req.body;
    if (!path || !session_id) return res.status(400).json({ error: "path et session_id requis" });

    const label = PATH_LABELS[path] || null;

    await supabase.from("page_views").insert({
      path,
      label,
      referrer:    referrer    || null,
      session_id,
      duration_ms: duration_ms || null,
      user_role:   user_role   || null,
    });

    res.json({ ok: true });
  } catch (err) {
    // Silencieux côté client - ne jamais bloquer la navigation
    res.json({ ok: false });
  }
});

// ── GET /api/analytics/stats ──────────────────────────────────
// Retourne toutes les métriques agrégées (admin seulement)
router.get("/stats", authenticateAdmin, async (req, res) => {
  try {
    const { periode = "30j" } = req.query;

    // Calcul de la date de début selon la période
    const now = new Date();
    let dateDebut = null;
    if      (periode === "aujourd_hui") { dateDebut = new Date(now); dateDebut.setHours(0,0,0,0); }
    else if (periode === "7j")          { dateDebut = new Date(now - 7  * 86400000); }
    else if (periode === "30j")         { dateDebut = new Date(now - 30 * 86400000); }
    else if (periode === "3m")          { dateDebut = new Date(now - 90 * 86400000); }
    else if (periode === "1an")         { dateDebut = new Date(now - 365* 86400000); }

    let query = supabase.from("page_views").select("path, label, session_id, duration_ms, user_role, created_at");
    if (dateDebut) query = query.gte("created_at", dateDebut.toISOString());

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];

    // ── Métriques globales ─────────────────────────────────────
    const totalVues      = rows.length;
    const sessions       = new Set(rows.map(r => r.session_id));
    const totalSessions  = sessions.size;

    // Bounce rate : sessions avec 1 seule vue
    const viewsPerSession = {};
    for (const r of rows) {
      viewsPerSession[r.session_id] = (viewsPerSession[r.session_id] || 0) + 1;
    }
    const bouncedSessions = Object.values(viewsPerSession).filter(v => v === 1).length;
    const bounceRate = totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0;

    // Durée moyenne de session (somme des duration_ms par session / nb sessions)
    const durationPerSession = {};
    for (const r of rows) {
      if (r.duration_ms) {
        durationPerSession[r.session_id] = (durationPerSession[r.session_id] || 0) + r.duration_ms;
      }
    }
    const durationsArr = Object.values(durationPerSession);
    const avgDuration  = durationsArr.length > 0
      ? Math.round(durationsArr.reduce((s, v) => s + v, 0) / durationsArr.length)
      : 0;

    // Pages par session moyenne
    const pagesPerSession = totalSessions > 0
      ? Math.round((totalVues / totalSessions) * 10) / 10
      : 0;

    // ── Pages les plus consultées ───────────────────────────────
    const pageCounts = {};
    const pageLabels = {};
    const pageSessionsMap = {};
    for (const r of rows) {
      pageCounts[r.path] = (pageCounts[r.path] || 0) + 1;
      if (r.label) pageLabels[r.path] = r.label;
      if (!pageSessionsMap[r.path]) pageSessionsMap[r.path] = new Set();
      pageSessionsMap[r.path].add(r.session_id);
    }

    const pages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([path, vues]) => ({
        path,
        label:          pageLabels[path] || null,
        vues,
        sessions_uniques: pageSessionsMap[path]?.size || 0,
        pct:            totalVues > 0 ? Math.round((vues / totalVues) * 100) : 0,
      }));

    // ── Évolution journalière (30 derniers jours) ───────────────
    const parJour = {};
    for (const r of rows) {
      const jour = r.created_at.slice(0, 10);
      parJour[jour] = (parJour[jour] || 0) + 1;
    }
    const evolution = Object.entries(parJour)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vues]) => ({ date, vues }));

    // ── Répartition par rôle ─────────────────────────────────────
    const parRole = {};
    for (const r of rows) {
      const role = r.user_role || "anonyme";
      parRole[role] = (parRole[role] || 0) + 1;
    }
    const rolesStats = Object.entries(parRole)
      .sort((a, b) => b[1] - a[1])
      .map(([role, vues]) => ({ role, vues }));

    res.json({
      periode,
      total_vues:      totalVues,
      total_sessions:  totalSessions,
      bounce_rate:     bounceRate,
      avg_duration_ms: avgDuration,
      pages_par_session: pagesPerSession,
      pages,
      evolution,
      roles_stats: rolesStats,
    });
  } catch (err) {
    console.error("[analytics/stats]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/analytics/avis-parent ──────────────────────────
// Endpoint public - enregistre l'avis d'un parent et notifie les PA Advisors
router.post("/avis-parent", async (req, res) => {
  try {
    const { inscription_id, parent_email, coach_nom, classe_id, mois, q1, q2, q3, q4, q5, commentaire } = req.body;
    if (!mois || !q1 || !q2 || !q3 || !q4 || !q5) {
      return res.status(400).json({ error: "Données manquantes" });
    }

    // Gamification coach : résout coach_id + plateforme via la classe/le groupe - classe_id
    // pointe soit vers classes_elearning (bet-elearning), soit vers groupes (dash). Reste
    // null si aucune des deux ne correspond (avis orphelin, hook silencieusement ignoré).
    let coach_id = null;
    let coachPlateforme = null;
    if (classe_id) {
      const { data: classe } = await supabase.from("classes_elearning").select("coach_id").eq("id", classe_id).maybeSingle();
      if (classe?.coach_id) { coach_id = classe.coach_id; coachPlateforme = "bet-elearning"; }
      else {
        const { data: groupe } = await supabase.from("groupes").select("coach_id").eq("id", classe_id).maybeSingle();
        if (groupe?.coach_id) { coach_id = groupe.coach_id; coachPlateforme = "dash"; }
      }
    }

    const { data: avis, error } = await supabase.from("avis_parents_coach").insert({
      inscription_id: inscription_id || null,
      parent_email:   parent_email   || null,
      coach_nom:      coach_nom      || null,
      classe_id:      classe_id      || null,
      coach_id,
      plateforme:     coachPlateforme || "bet-elearning",
      mois, q1, q2, q3, q4, q5,
      commentaire:    commentaire    || null,
    }).select().single();
    if (error) throw error;

    if (coach_id && coachPlateforme === "bet-elearning") {
      onAvisParentSoumis({ id: avis.id, coach_id, q1, q2, q3, q4, q5 })
        .catch(e => console.error("[gamificationCoach] onAvisParentSoumis", e.message));
    } else if (coach_id && coachPlateforme === "dash") {
      onAvisParentSoumisDash({ id: avis.id, coach_id, q1, q2, q3, q4, q5 })
        .catch(e => console.error("[gamificationCoachDash] onAvisParentSoumisDash", e.message));
    }

    // Notifier tous les PA Advisors actifs
    const moy = ((q1 + q2 + q3 + q4 + q5) / 5).toFixed(1);
    await notifyRole(["pedagogical_advisor", "admin_pa_advisor"], {
      type:    "evaluation",
      titre:   `⭐ Nouvel avis parent - ${coach_nom || "Coach"} (${mois})`,
      message: `Un parent a évalué le coach ${coach_nom || ""} avec une moyenne de ${moy}/5.${commentaire ? ` Commentaire : "${commentaire}"` : ""}`,
      meta:    { coach_nom, mois, moy, parent_email },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analytics/evaluations-coach ─────────────────────
// Toutes les évaluations coach reçues depuis le dashboard parent, enrichies avec
// le nom de l'enfant, le nom du parent et le nom de la classe (inscription_id/classe_id
// ne sont que des identifiants bruts dans avis_parents_coach - colonnes texte sans FK).
router.get("/evaluations-coach", authenticateAdmin, async (req, res) => {
  try {
    /* ── CHAQUE PLATEFORME LIT SES PROPRES AVIS ──
       `avis_parents_coach` est commune aux deux mondes et porte une colonne `plateforme`.
       La lecture était figée sur « dash » : le superviseur de bet-elearning n'avait aucun
       moyen d'ouvrir les avis déposés par SES parents, alors que c'est précisément cette
       plateforme qui les collecte. L'inverse reste vrai — dash ne doit pas afficher les
       avis de bet-elearning —, d'où l'aiguillage plutôt qu'un élargissement.

       Les identifiants bruts ne désignent pas les mêmes tables de part et d'autre :
       `inscription_id` pointe sur `groupes_apprenants` côté dash et sur
       `classes_elearning_apprenants` ici, `classe_id` sur `groupes` là et
       `classes_elearning` ici. C'est tout l'objet de la résolution qui suit. */
    const surElearning = estElearning(req);

    const { data, error } = await supabase
      .from("avis_parents_coach")
      .select("*")
      .eq("plateforme", surElearning ? "bet-elearning" : "dash")
      .order("created_at", { ascending: false });
    if (error) throw error;

    if (surElearning) {
      const avisEl = data || [];
      if (!avisEl.length) return res.json({ evaluations: [] });

      const inscrIds = [...new Set(avisEl.map(a => a.inscription_id).filter(Boolean))];
      const classIds = [...new Set(avisEl.map(a => a.classe_id).filter(Boolean))];
      const [{ data: inscrs }, { data: classes }] = await Promise.all([
        inscrIds.length
          ? supabase.from("classes_elearning_apprenants")
              .select("id, nom_complet, email, telephone, niveau_cecr, date_naissance, prenom_parent, nom_parent, email_parent, telephone_parent")
              .in("id", inscrIds)
          : Promise.resolve({ data: [] }),
        classIds.length
          ? supabase.from("classes_elearning").select("id, nom").in("id", classIds)
          : Promise.resolve({ data: [] }),
      ]);
      const parInscr = Object.fromEntries((inscrs  || []).map(i => [String(i.id), i]));
      const parClasse = Object.fromEntries((classes || []).map(c => [String(c.id), c]));

      /* Le parent est porté par l'inscription elle-même ici — `prenom_parent`/`nom_parent` —
         et non par un dossier `assignations_parcours` comme côté dash. Un détour par cette
         table ne rendrait rien pour un apprenant e-learning. */
      return res.json({
        evaluations: avisEl.map(a => {
          const i = a.inscription_id ? parInscr[String(a.inscription_id)] : null;
          const nomParent = i ? `${i.prenom_parent || ""} ${i.nom_parent || ""}`.trim() : "";
          return {
            ...a,
            enfant_nom:       i?.nom_complet || null,
            enfant_email:     i?.email || null,
            enfant_telephone: i?.telephone || null,
            enfant_niveau:    i?.niveau_cecr || null,
            enfant_naissance: i?.date_naissance || null,
            parent_nom:       nomParent || null,
            parent_email:     a.parent_email || i?.email_parent || null,
            parent_telephone: i?.telephone_parent || null,
            classe_nom: a.classe_id ? (parClasse[String(a.classe_id)]?.nom || null) : null,
          };
        }),
      });
    }

    const avis = data || [];
    // inscription_id = groupes_apprenants.id, classe_id = groupes.id (dash - voir
    // POST /api/analytics/avis-parent, qui résout coachPlateforme via ces mêmes tables).
    const inscriptionIds = [...new Set(avis.map(a => a.inscription_id).filter(Boolean))];
    const classeIds      = [...new Set(avis.map(a => a.classe_id).filter(Boolean))];

    const [{ data: gas }, { data: groupes }] = await Promise.all([
      inscriptionIds.length
        ? supabase.from("groupes_apprenants").select("id, prenom_apprenant, nom_apprenant, email_apprenant, telephone, niveau").in("id", inscriptionIds)
        : Promise.resolve({ data: [] }),
      classeIds.length
        ? supabase.from("groupes").select("id, nom").in("id", classeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const emailsApprenants = [...new Set((gas || []).map(g => g.email_apprenant).filter(Boolean))];
    const { data: assigns } = emailsApprenants.length
      ? await supabase.from("assignations_parcours")
          .select("prospect_email, nom_parent, email_parent, telephone_parent")
          .in("prospect_email", emailsApprenants)
      : { data: [] };
    const assignMap = {};
    (assigns || []).forEach(a => { if (a.prospect_email) assignMap[a.prospect_email.toLowerCase().trim()] = a; });

    const gaMap     = Object.fromEntries((gas || []).map(g => [String(g.id), g]));
    const groupeMap = Object.fromEntries((groupes || []).map(g => [String(g.id), g]));

    const enrichies = avis.map(a => {
      const ga     = a.inscription_id ? gaMap[String(a.inscription_id)] : null;
      const assign = ga?.email_apprenant ? assignMap[ga.email_apprenant.toLowerCase().trim()] : null;
      return {
        ...a,
        enfant_nom:        ga ? `${ga.prenom_apprenant || ''} ${ga.nom_apprenant || ''}`.trim() : null,
        enfant_email:      ga?.email_apprenant || null,
        enfant_telephone:  ga?.telephone || null,
        enfant_niveau:     ga?.niveau || null,
        enfant_naissance:  null,
        parent_nom:        assign?.nom_parent || null,
        parent_email:      a.parent_email || assign?.email_parent || null,
        parent_telephone:  assign?.telephone_parent || ga?.telephone || null,
        classe_nom: a.classe_id ? (groupeMap[String(a.classe_id)]?.nom || null) : null,
      };
    });

    res.json({ evaluations: enrichies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
