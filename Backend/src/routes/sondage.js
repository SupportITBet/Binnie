import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { notifyUser } from "../services/notifyRole.js";

const router = express.Router();

console.log("✅ Route sondage chargée");

// Tracker automatique un clic UTM (public - aucune auth)
router.post("/track-visit", async (req, res) => {
  try {
    const { utm_source, utm_medium, utm_campaign, page } = req.body;
    if (!utm_source) return res.status(400).json({ error: "utm_source requis" });

    const { error } = await supabase.from("utm_visits").insert({
      utm_source,
      utm_medium:   utm_medium   || null,
      utm_campaign: utm_campaign || null,
      page:         page        || null,
    });

    if (error) {
      console.error("Erreur utm_visits :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Soumettre une réponse (public - côté client MonEspace)
router.post("/submit", async (req, res) => {
  try {
    const { email, commercial_id, source, source_detail, utm_source, utm_medium, utm_campaign } = req.body;

    if (!email || !source) {
      return res.status(400).json({ error: "email et source obligatoires" });
    }

    // Vérifier si déjà répondu
    const { data: existing } = await supabase
      .from("sondages")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Déjà répondu", already: true });
    }

    const { error } = await supabase.from("sondages").insert({
      email,
      commercial_id:  commercial_id  || null,
      source,
      source_detail:  source_detail  || null,
      utm_source:     utm_source     || null,
      utm_medium:     utm_medium     || null,
      utm_campaign:   utm_campaign   || null,
    });

    if (error) {
      console.error("Erreur Supabase sondage :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Réponse enregistrée" });
    if (commercial_id) {
      await notifyUser(commercial_id, {
        type: "sondage",
        titre: "📊 Nouvelle réponse au sondage",
        message: `${email} a répondu au sondage de satisfaction (source : ${source}).`,
        meta: { source, source_detail },
      }).catch(() => {});
    }
  } catch (err) {
    console.error("Erreur serveur sondage :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Vérifier si un email a déjà répondu
router.get("/check", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "email requis" });

    const { data } = await supabase
      .from("sondages")
      .select("id, source, source_detail, utm_source")
      .eq("email", email)
      .maybeSingle();

    res.json({ answered: !!data, reponse: data || null });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Réponses des clients assignés à cette commerciale
router.get("/mes-clients", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sondages")
      .select("id, email, source, source_detail, utm_source, utm_medium, utm_campaign, created_at")
      .eq("commercial_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ sondages: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Statistiques sources pour la commerciale
router.get("/stats", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sondages")
      .select("source, utm_source")
      .eq("commercial_id", req.user.id);

    if (error) return res.status(500).json({ error: error.message });

    const counts = {};
    const utmCounts = {};
    (data || []).forEach(({ source, utm_source }) => {
      counts[source] = (counts[source] || 0) + 1;
      if (utm_source) utmCounts[utm_source] = (utmCounts[utm_source] || 0) + 1;
    });

    res.json({ stats: counts, utm_stats: utmCounts, total: (data || []).length });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── SUPER ADMIN : toutes les réponses + visites UTM ────
router.get("/all", authenticateAdmin, async (req, res) => {
  try {
    if (!["super_admin", "admin"].includes(req.role)) {
      return res.status(403).json({ error: "Accès réservé au Super Admin" });
    }

    const [{ data, error }, { data: visits, error: vErr }] = await Promise.all([
      supabase
        .from("sondages")
        .select("id, email, commercial_id, source, source_detail, utm_source, utm_medium, utm_campaign, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("utm_visits")
        .select("utm_source, utm_medium, utm_campaign, visited_at"),
    ]);

    if (error) return res.status(500).json({ error: error.message });

    // Stats sondages manuels
    const sourceStats = {};
    const utmStats    = {};
    (data || []).forEach(({ source, utm_source }) => {
      sourceStats[source] = (sourceStats[source] || 0) + 1;
      if (utm_source) utmStats[utm_source] = (utmStats[utm_source] || 0) + 1;
    });

    // Stats visites UTM (clics bruts)
    const visitStats = {};
    (visits || []).forEach(({ utm_source }) => {
      if (utm_source) visitStats[utm_source] = (visitStats[utm_source] || 0) + 1;
    });

    res.json({
      sondages:     data    || [],
      source_stats: sourceStats,
      utm_stats:    utmStats,
      visit_stats:  visitStats,
      total_visits: (visits || []).length,
      total:        (data   || []).length,
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
