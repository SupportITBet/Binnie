import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";

const router = express.Router();

// Le coach voit son propre score/palier/rang/badges, mais jamais le détail des autres coachs
// (décision par défaut du document gamification-coachs.html, section 06).
router.get("/moi", authenticateAdmin, async (req, res) => {
  try {
    if (req.role !== "coach") return res.status(403).json({ error: "Réservé aux coachs" });
    const coachId = req.profil.id;

    const [{ data: stats }, { data: badgesObtenus }, { data: catalogue }, { data: historique }] = await Promise.all([
      supabase.from("stats_gamif_coach").select("*").eq("coach_id", coachId).maybeSingle(),
      supabase.from("badges_coach_obtenus").select("badge_id, obtenu_le").eq("coach_id", coachId),
      supabase.from("badges_coach").select("*").order("categorie"),
      supabase.from("points_coach").select("source_type, points, description, created_at")
        .eq("coach_id", coachId).order("created_at", { ascending: false }).limit(30),
    ]);

    const idsObtenus = new Set((badgesObtenus || []).map(b => b.badge_id));
    const dateObtention = Object.fromEntries((badgesObtenus || []).map(b => [b.badge_id, b.obtenu_le]));
    const badges = (catalogue || []).map(b => ({
      ...b, obtenu: idsObtenus.has(b.id), obtenu_le: dateObtention[b.id] || null,
    }));

    res.json({
      score_glissant: stats?.score_glissant ?? 0,
      palier:         stats?.palier ?? "bronze",
      rang:           stats?.rang ?? null,
      eligible_or_platine: stats?.eligible_or_platine ?? true,
      badges,
      historique: historique || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Classement complet - réservé au PA Advisor et au Superviseur (jamais au coach lui-même).
const ROLES_CLASSEMENT = ["pedagogical_advisor", "superviseur", "deputy_superviseur", "super_admin", "manager"];
router.get("/classement", authenticateAdmin, async (req, res) => {
  try {
    if (!ROLES_CLASSEMENT.includes(req.role)) return res.status(403).json({ error: "Accès refusé" });

    const { data: stats, error } = await supabase
      .from("stats_gamif_coach").select("coach_id, score_glissant, palier, rang").order("rang", { ascending: true, nullsFirst: false });
    if (error) throw error;

    const coachIds = (stats || []).map(s => s.coach_id);
    const { data: coachs } = coachIds.length
      ? await supabase.from("utilisateurs").select("id, nom, prenom").in("id", coachIds)
      : { data: [] };
    const coachMap = Object.fromEntries((coachs || []).map(c => [c.id, c]));

    const classement = (stats || []).map(s => ({
      coach_id: s.coach_id,
      nom:      coachMap[s.coach_id] ? `${coachMap[s.coach_id].prenom || ""} ${coachMap[s.coach_id].nom || ""}`.trim() : "Coach",
      score:    s.score_glissant, palier: s.palier, rang: s.rang,
    }));

    res.json({ classement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
