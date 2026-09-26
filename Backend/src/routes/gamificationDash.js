import express from "express";
import supabase from "../config/supabase.js";
import { authenticateUser, authenticateAdmin } from "../middlewares/requireAdmin.js";
import { attribuerPoints } from "../services/gamificationDash.js";

const router = express.Router();

console.log("✅ Route gamification dash chargée");

/* ══════════════════════════════════════════════════════════
   GET /api/dash/gamification/admin/:apprenantId - points + badges dash d'un apprenant précis,
   consultés par un membre du staff depuis sa fiche détail.
══════════════════════════════════════════════════════════ */
router.get("/admin/:apprenantId", authenticateAdmin, async (req, res) => {
  try {
    const { apprenantId } = req.params;
    const [{ data: u }, { data: catalogue }, { data: obtenus }] = await Promise.all([
      supabase.from("utilisateurs").select("points_gamif_dash").eq("id", apprenantId).maybeSingle(),
      supabase.from("badges_dash").select("*").order("categorie"),
      supabase.from("badges_obtenus_dash").select("badge_id, obtenu_le").eq("apprenant_id", apprenantId),
    ]);
    const obtenuParBadge = {};
    (obtenus || []).forEach(o => { obtenuParBadge[o.badge_id] = o.obtenu_le; });
    const badges = (catalogue || []).map(b => ({ ...b, obtenu: !!obtenuParBadge[b.id], obtenu_le: obtenuParBadge[b.id] || null }));
    res.json({ solde: u?.points_gamif_dash || 0, badges });
  } catch (err) {
    console.error("[gamification-dash/admin] ", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/dash/gamification/onboarding-complete - guide de bienvenue dash terminé
   (fermeture du modal de bienvenue, 4 étapes affichées).
══════════════════════════════════════════════════════════ */
router.post("/onboarding-complete", authenticateUser, async (req, res) => {
  try {
    await attribuerPoints(req.user.id, "onboarding", null, 10, "Guide de bienvenue terminé");
    res.json({ ok: true });
  } catch (err) {
    console.error("[gamification-dash/onboarding-complete]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/dash/gamification/chat-message - message envoyé dans le chat de groupe dash.
   Plafonné à 5/jour pour éviter le farm par spam.
══════════════════════════════════════════════════════════ */
router.post("/chat-message", authenticateUser, async (req, res) => {
  try {
    await attribuerPoints(req.user.id, "chat_message", null, 1, "Message envoyé dans le chat de groupe");
    res.json({ ok: true });
  } catch (err) {
    console.error("[gamification-dash/chat-message]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/dash/gamification/mes-points - solde + historique dash de l'apprenant connecté.
══════════════════════════════════════════════════════════ */
router.get("/mes-points", authenticateUser, async (req, res) => {
  try {
    const { data: u } = await supabase.from("utilisateurs").select("points_gamif_dash").eq("id", req.user.id).maybeSingle();
    const { data: transactions } = await supabase
      .from("points_transactions_dash")
      .select("*")
      .eq("apprenant_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    res.json({ solde: u?.points_gamif_dash || 0, transactions: transactions || [] });
  } catch (err) {
    console.error("[gamification-dash/mes-points]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/dash/gamification/mes-badges - catalogue dash complet + statut pour l'apprenant.
══════════════════════════════════════════════════════════ */
router.get("/mes-badges", authenticateUser, async (req, res) => {
  try {
    const [{ data: catalogue }, { data: obtenus }] = await Promise.all([
      supabase.from("badges_dash").select("*").order("categorie"),
      supabase.from("badges_obtenus_dash").select("badge_id, obtenu_le").eq("apprenant_id", req.user.id),
    ]);
    const obtenuParBadge = {};
    (obtenus || []).forEach(o => { obtenuParBadge[o.badge_id] = o.obtenu_le; });
    const badges = (catalogue || []).map(b => ({ ...b, obtenu: !!obtenuParBadge[b.id], obtenu_le: obtenuParBadge[b.id] || null }));
    res.json({ badges });
  } catch (err) {
    console.error("[gamification-dash/mes-badges]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/dash/gamification/classement?groupe_id=&limite= - classement par points, filtré au
   groupe de l'apprenant (jamais global).
══════════════════════════════════════════════════════════ */
router.get("/classement", authenticateUser, async (req, res) => {
  try {
    const limite = Math.min(parseInt(req.query.limite) || 20, 100);
    let apprenantIds = null;

    if (req.query.groupe_id) {
      const { data: inscriptions } = await supabase
        .from("groupes_apprenants")
        .select("apprenant_id")
        .eq("groupe_id", req.query.groupe_id)
        .neq("statut", "retire");
      apprenantIds = [...new Set((inscriptions || []).map(i => i.apprenant_id).filter(Boolean))];
      if (!apprenantIds.length) return res.json({ classement: [] });
    }

    let q = supabase.from("utilisateurs").select("id, nom, prenom, points_gamif_dash").eq("role", "apprenant").gt("points_gamif_dash", 0).order("points_gamif_dash", { ascending: false }).limit(limite);
    if (apprenantIds) q = q.in("id", apprenantIds);
    const { data, error } = await q;
    if (error) throw error;

    res.json({ classement: (data || []).map((u, i) => ({ rang: i + 1, id: u.id, nom_complet: `${u.prenom || ""} ${u.nom || ""}`.trim(), points: u.points_gamif_dash })) });
  } catch (err) {
    console.error("[gamification-dash/classement]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
