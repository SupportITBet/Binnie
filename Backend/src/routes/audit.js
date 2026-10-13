import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";

const router = express.Router();

// Résout un entite_id (UUID technique) vers un nom lisible pour l'affichage - clé sur
// entite_type quand il est renseigné (nos logs manuels), sinon sur module (autoAudit).
// select: colonne(s) à lire, label: comment les combiner en texte affichable.
const ENTITE_RESOLVERS = {
  contenus_ressources:            { table: "contenus_ressources",            select: "titre",        label: r => r.titre },
  contenus_biblio_communautaire:  { table: "contenus_biblio_communautaire",  select: "titre",        label: r => r.titre },
  inscriptions_elearning:         { table: "inscriptions_elearning",         select: "nom_complet",  label: r => r.nom_complet },
  classes_elearning:              { table: "classes_elearning",              select: "nom",          label: r => r.nom },
  entreprise:                     { table: "comptes_entreprises",            select: "nom",          label: r => r.nom },
  coachs:                         { table: "coachs",                        select: "nom,prenom",   label: r => [r.prenom, r.nom].filter(Boolean).join(" ") },
  centres:                        { table: "centres",                       select: "nom",          label: r => r.nom },
  groupes:                        { table: "groupes",                       select: "nom",          label: r => r.nom },
  leads:                          { table: "leads_particuliers",            select: "nom",          label: r => r.nom },
  users:                          { table: "utilisateurs",                  select: "nom,prenom",   label: r => [r.prenom, r.nom].filter(Boolean).join(" ") },
};

// Attache un champ "entite_nom" lisible à chaque log, résolu en un batch de requêtes
// (une par table concernée) plutôt qu'une requête par ligne.
async function resolveEntiteNoms(logs) {
  const idsParResolveur = {};
  for (const log of logs) {
    const key = log.entite_type || log.module;
    const resolver = ENTITE_RESOLVERS[key];
    if (resolver && log.entite_id) {
      (idsParResolveur[key] ||= new Set()).add(log.entite_id);
    }
  }

  const nomsParKeyId = {};
  await Promise.all(Object.entries(idsParResolveur).map(async ([key, idsSet]) => {
    const resolver = ENTITE_RESOLVERS[key];
    const { data, error } = await supabase
      .from(resolver.table)
      .select(`id,${resolver.select}`)
      .in("id", [...idsSet]);
    if (error || !data) return;
    nomsParKeyId[key] = {};
    for (const row of data) nomsParKeyId[key][row.id] = resolver.label(row) || null;
  }));

  return logs.map(log => {
    const key = log.entite_type || log.module;
    const nom = nomsParKeyId[key]?.[log.entite_id];
    return nom ? { ...log, entite_nom: nom } : log;
  });
}

/* ══════════════════════════════════════════════════════════════
   POST /api/audit/log
   Public / internal endpoint - create a single audit log entry.
   Called from frontend services or other backend modules.
══════════════════════════════════════════════════════════════ */
router.post("/log", async (req, res) => {
  try {
    const {
      acteur_id, acteur_nom, acteur_email, acteur_role,
      action_type, module, entite_type, entite_id,
      centre, detail, metadata, statut,
    } = req.body;

    if (!action_type) {
      return res.status(400).json({ error: "action_type est requis" });
    }

    // Use body values first, fall back to request-level values
    const ip_address =
      req.body.ip_address ||
      req.headers["x-forwarded-for"] ||
      req.ip ||
      null;
    const user_agent =
      req.body.user_agent ||
      req.headers["user-agent"] ||
      null;

    await logAudit({
      acteur_id, acteur_nom, acteur_email, acteur_role,
      action_type, module, entite_type, entite_id,
      centre, detail, metadata, ip_address, user_agent, statut,
    });

    res.status(201).json({ message: "Log enregistré" });
  } catch (err) {
    console.error("Erreur /audit/log:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});


/* ══════════════════════════════════════════════════════════════
   GET /api/audit/logs - admin only
   Query params: module, action_type, acteur_id, centre, statut,
                 date_debut, date_fin, search, page, limit
   Returns: { logs, total, pages }
══════════════════════════════════════════════════════════════ */
// La colonne "plateforme" peut ne pas encore exister (migration audit_plateforme_migration.sql
// pas encore exécutée) - un filtre .or() dessus ferait échouer PostgREST. On tente avec, et on
// retombe sans si l'erreur indique une colonne manquante, plutôt que de casser tout l'onglet.
function buildLogsQuery(req, includePlateforme) {
  const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (req.query.module)      query = query.eq("module",      req.query.module);
  if (req.query.action_type) query = query.eq("action_type", req.query.action_type);
  if (req.query.acteur_id)   query = query.eq("acteur_id",   req.query.acteur_id);
  /* `entite_id` : le journal d'UN dossier, et non celui de toute l'application.
     Le filtre manquait - on pouvait restreindre par module, acteur, centre ou date, mais
     pas par l'objet concerné, ce qui rendait impossible l'onglet « Historique » d'une
     fiche apprenant : sans lui la requête ramène le journal entier, trié par date. */
  if (req.query.entite_id)   query = query.eq("entite_id",   req.query.entite_id);
  if (req.query.entite_type) query = query.eq("entite_type", req.query.entite_type);
  if (req.query.acteur_role) {
    query = query.eq("acteur_role", req.query.acteur_role);
  } else if (req.query.include_non_staff !== "true") {
    // Par défaut, l'onglet Audit du SuperAdmin est un journal des actions STAFF -
    // sans cette exclusion, les événements déclenchés par des routes publiques
    // (inscription/connexion apprenant, commande boutique, jobs automatiques -
    // acteur_role "apprenant"/"system") se mélangeaient avec les vraies actions
    // du staff, rendant l'audit illisible. include_non_staff=true permet de les
    // réafficher explicitement si un jour nécessaire.
    query = query.not("acteur_role", "in", "(apprenant,system)");
  }
  if (req.query.centre)      query = query.eq("centre",      req.query.centre);
  if (req.query.statut)      query = query.eq("statut",      req.query.statut);
  /* ISOLATION STRICTE DASH / BET-ELEARNING.
     Cette ligne acceptait aussi `plateforme IS NULL`, au motif que NULL désignerait « les
     modules réellement partagés ». La base dit le contraire : sur 192 lignes NULL écrites par
     du staff, les modules dominants sont `apprenants`, `upload`, `imports`, `conversations`,
     `campagnes` — et même un module `dash` — avec pour acteurs des commerciaux, du marketing,
     des superviseurs. NULL ne signifie pas « partagé », il signifie « l'écrivain n'a pas tagué
     la ligne », et l'écrasante majorité vient de dash.
     Conséquence : l'onglet Audit de bet-elearning affichait dix-sept lignes de dash sur ses
     vingt premières. Il ne montre désormais que ce qui porte explicitement sa marque.
     Dash n'est pas affecté : il n'envoie pas `plateforme`, donc aucun filtre ne s'y applique
     et il continue de tout voir. */
  if (includePlateforme && req.query.plateforme) query = query.eq("plateforme", req.query.plateforme);
  if (req.query.date_debut)  query = query.gte("created_at", req.query.date_debut);
  if (req.query.date_fin) {
    // Une date seule (YYYY-MM-DD) doit inclure toute la journée, pas juste 00:00.
    const fin = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date_fin) ? `${req.query.date_fin}T23:59:59.999` : req.query.date_fin;
    query = query.lte("created_at", fin);
  }
  if (req.query.search) {
    const s = req.query.search;
    query = query.or(
      `acteur_nom.ilike.%${s}%,acteur_email.ilike.%${s}%,detail.ilike.%${s}%,action_type.ilike.%${s}%`
    );
  }
  return { query, limit };
}

router.get("/logs", authenticateAdmin, async (req, res) => {
  try {
    let { query, limit } = buildLogsQuery(req, true);
    let { data, error, count } = await query;

    if (error && /plateforme/.test(error.message || "")) {
      ({ query } = buildLogsQuery(req, false));
      ({ data, error, count } = await query);
    }
    if (error) throw error;

    res.json({
      logs:  await resolveEntiteNoms(data || []),
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error("Erreur /audit/logs:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});


/* ══════════════════════════════════════════════════════════════
   GET /api/audit/stats - admin only
   Aggregated statistics for the audit dashboard.
══════════════════════════════════════════════════════════════ */
// Isolation dash / bet-elearning, même règle que /logs : une plateforme ne voit que ses
// propres logs + les modules réellement partagés (plateforme NULL).
function scopePlateforme(query, plateforme) {
  // Même correction que dans buildLogsQuery : `plateforme IS NULL` laissait passer l'activité
  // de dash non taguée, ce qui faussait aussi les statistiques de l'onglet Audit.
  return plateforme ? query.eq("plateforme", plateforme) : query;
}

router.get("/stats", authenticateAdmin, async (req, res) => {
  try {
    let plateforme = req.query.plateforme || null;
    if (plateforme) {
      // Sonde légère : si la colonne "plateforme" n'existe pas encore (migration pas
      // exécutée), on désactive le filtre au lieu de faire échouer toutes les requêtes ci-dessous.
      const { error: probeErr } = await supabase.from("audit_logs").select("plateforme").limit(1);
      if (probeErr) plateforme = null;
    }
    const now   = new Date();

    // Start of today (UTC midnight)
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const ago7d  = new Date(now);
    ago7d.setDate(ago7d.getDate() - 7);

    const ago30d = new Date(now);
    ago30d.getDate(); // keep for lint; computed below
    ago30d.setDate(ago30d.getDate() - 30);

    // ── Counts ───────────────────────────────────────────────
    const [resTotal, res7j, res30j, resAlertes, resParStatut] = await Promise.all([
      scopePlateforme(supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString()), plateforme),

      scopePlateforme(supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", ago7d.toISOString()), plateforme),

      scopePlateforme(supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", ago30d.toISOString()), plateforme),

      scopePlateforme(supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString())
        .eq("statut", "danger"), plateforme),

      // Fetch today's logs for module/heure aggregation
      scopePlateforme(supabase
        .from("audit_logs")
        .select("statut")
        .gte("created_at", ago30d.toISOString()), plateforme),
    ]);

    // par_statut (across last 30 days)
    const par_statut = { success: 0, warning: 0, danger: 0, info: 0 };
    for (const row of resParStatut.data || []) {
      if (par_statut[row.statut] !== undefined) par_statut[row.statut]++;
    }

    // ── Today's full rows for module & heure aggregation ─────
    const { data: todayRows } = await scopePlateforme(supabase
      .from("audit_logs")
      .select("module, created_at")
      .gte("created_at", todayStart.toISOString()), plateforme);

    // par_module
    const moduleMap = {};
    for (const row of todayRows || []) {
      const m = row.module || "system";
      moduleMap[m] = (moduleMap[m] || 0) + 1;
    }
    const par_module = Object.entries(moduleMap)
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count);

    // par_heure (00:00 → 23:00)
    const heureMap = {};
    for (const row of todayRows || []) {
      const d = new Date(row.created_at);
      const heure = `${String(d.getUTCHours()).padStart(2, "0")}:00`;
      heureMap[heure] = (heureMap[heure] || 0) + 1;
    }
    const par_heure = Object.entries(heureMap)
      .map(([heure, count]) => ({ heure, count }))
      .sort((a, b) => a.heure.localeCompare(b.heure));

    // ── Top acteurs (last 7 days) ─────────────────────────────
    const { data: acteurRows } = await scopePlateforme(supabase
      .from("audit_logs")
      .select("acteur_nom, acteur_email")
      .gte("created_at", ago7d.toISOString())
      .not("acteur_id", "is", null), plateforme);

    const acteurMap = {};
    for (const row of acteurRows || []) {
      const key = row.acteur_email || row.acteur_nom || "inconnu";
      if (!acteurMap[key]) {
        acteurMap[key] = { acteur_nom: row.acteur_nom, acteur_email: row.acteur_email, count: 0 };
      }
      acteurMap[key].count++;
    }
    const top_acteurs = Object.values(acteurMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      total_today:    resTotal.count  || 0,
      total_7j:       res7j.count     || 0,
      total_30j:      res30j.count    || 0,
      alertes_today:  resAlertes.count || 0,
      par_module,
      par_statut,
      par_heure,
      top_acteurs,
    });
  } catch (err) {
    console.error("Erreur /audit/stats:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});


/* ══════════════════════════════════════════════════════════════
   GET /api/audit/by-profile/:acteur_id - admin only
   All logs for a specific user, last 500, newest first.
══════════════════════════════════════════════════════════════ */
router.get("/by-profile/:acteur_id", authenticateAdmin, async (req, res) => {
  try {
    let query = supabase
      .from("audit_logs")
      .select("*")
      .eq("acteur_id", req.params.acteur_id)
      .order("created_at", { ascending: false })
      .limit(500);
    // Isolation dash / bet-elearning, même règle que /logs : une plateforme ne voit que ses
    // propres logs + les modules réellement partagés (plateforme NULL).
    if (req.query.plateforme) query = query.or(`plateforme.eq.${req.query.plateforme},plateforme.is.null`);

    let { data, error } = await query;
    if (error && /plateforme/.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("audit_logs").select("*").eq("acteur_id", req.params.acteur_id)
        .order("created_at", { ascending: false }).limit(500));
    }
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err) {
    console.error("Erreur /audit/by-profile:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});


/* ══════════════════════════════════════════════════════════════
   GET /api/audit/by-centre/:centre - admin only
   All logs for a specific centre, last 500, newest first.
══════════════════════════════════════════════════════════════ */
router.get("/by-centre/:centre", authenticateAdmin, async (req, res) => {
  try {
    let query = supabase
      .from("audit_logs")
      .select("*")
      .eq("centre", req.params.centre)
      .order("created_at", { ascending: false })
      .limit(500);
    // Isolation dash / bet-elearning, même règle que /logs : une plateforme ne voit que ses
    // propres logs + les modules réellement partagés (plateforme NULL).
    if (req.query.plateforme) query = query.or(`plateforme.eq.${req.query.plateforme},plateforme.is.null`);

    let { data, error } = await query;
    if (error && /plateforme/.test(error.message || "")) {
      ({ data, error } = await supabase
        .from("audit_logs").select("*").eq("centre", req.params.centre)
        .order("created_at", { ascending: false }).limit(500));
    }
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err) {
    console.error("Erreur /audit/by-centre:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});


/* ══════════════════════════════════════════════════════════════
   DELETE /api/audit/clear - admin only
   Hard delete all logs older than 90 days.
══════════════════════════════════════════════════════════════ */
router.delete("/clear", authenticateAdmin, requirePermission("audit","delete"), async (req, res) => {
  try {
    const date90daysAgo = new Date();
    date90daysAgo.setDate(date90daysAgo.getDate() - 90);

    const { error, count } = await supabase
      .from("audit_logs")
      .delete({ count: "exact" })
      .lt("created_at", date90daysAgo.toISOString());

    if (error) throw error;

    // Log the purge itself
    logAudit({
      acteur_id:    req.profil?.id    || null,
      acteur_nom:   req.profil ? `${req.profil.prenom} ${req.profil.nom}` : null,
      acteur_email: req.profil?.email || null,
      acteur_role:  req.role          || req.profil?.role || "admin",
      plateforme:   "dash",
      action_type:  "AUDIT_PURGE",
      module:       "audit",
      detail:       `Purge des logs antérieurs à ${date90daysAgo.toISOString().slice(0, 10)} - ${count ?? "?"} entrée(s) supprimée(s)`,
      ip_address:   req.headers["x-forwarded-for"] || req.ip || null,
      user_agent:   req.headers["user-agent"] || null,
      statut:       "warning",
    }).catch(() => {});

    res.json({
      message: `Logs antérieurs à 90 jours supprimés`,
      deleted: count ?? null,
    });
  } catch (err) {
    console.error("Erreur /audit/clear:", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
