import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { notifyRole } from "../services/notifyRole.js";

const router = express.Router();

// POST /api/notifications - créer une notification pour un utilisateur
router.post("/", authenticateAdmin, async (req, res) => {
  const { user_id, type, titre, message, meta } = req.body;
  if (!user_id || !titre) {
    return res.status(400).json({ error: "user_id et titre sont requis" });
  }
  const { data, error } = await supabase.from("notifications").insert({
    user_id,
    type:    type    || "info",
    titre,
    message: message || null,
    meta:    meta    || null,
    lu:      false,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, notification: data });
});

// POST /api/notifications/to-role - envoyer une notification à tous les utilisateurs d'un rôle
router.post("/to-role", authenticateAdmin, async (req, res) => {
  const { role, type, titre, message, meta } = req.body;
  if (!role || !titre) {
    return res.status(400).json({ error: "role et titre sont requis" });
  }
  await notifyRole(role, { type: type || "info", titre, message: message || null, meta: meta || null });
  res.json({ ok: true });
});

// GET /api/notifications/mes-notifs - récupérer ses propres notifications (paginé)
// Query params optionnels : ?source=bet-elearning · ?type= · ?page=1 · ?limit=20
//                           ?date_debut=YYYY-MM-DD · ?date_fin=YYYY-MM-DD
//
// ── CHAQUE PLATEFORME NE MONTRE QUE LA SIENNE ──
// `source` sépare les deux cloches, et cette séparation vaut pour TOUS LES RÔLES, direction
// comprise : on change de plateforme pour lire l'autre, on ne les mélange pas dans la même.
// Ce qui faisait échouer ce filtre n'était pas le filtre lui-même mais la source écrite :
// elle valait `dash` par défaut sur 107 des 108 points d'appel, y compris pour des actions
// faites depuis bet-elearning. Elle se déduit désormais de l'en-tête `X-Plateforme` de la
// requête d'origine (services/contextePlateforme.js).
router.get("/mes-notifs", authenticateAdmin, async (req, res) => {
  const userId = req.profil?.id;
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  /* LE CLOISONNEMENT PAR PLATEFORME EST RÉTABLI, POUR TOUT LE MONDE.
     Il avait été levé pour que la direction voie l'ensemble ; l'effet de bord a été que
     chacun voyait l'autre plateforme — un coach e-learning recevait les notifications du
     présentiel. La séparation est voulue jusqu'en haut : la direction consulte les deux
     cloches en changeant de plateforme, elle ne les mélange pas dans la même.
     Ce qui manquait pour que ce filtre fonctionne, c'est que la source d'ÉCRITURE soit
     juste : elle se déduit désormais de l'en-tête de la requête
     (services/contextePlateforme.js) et non d'un défaut figé à `dash`. */
  if (req.query.source) query = query.eq("source", req.query.source);
  if (req.query.type)       query = query.eq("type", req.query.type);
  if (req.query.date_debut) query = query.gte("created_at", req.query.date_debut);
  if (req.query.date_fin)   query = query.lte("created_at", `${req.query.date_fin}T23:59:59`);

  const { data, error, count } = await query.range(from, to);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ notifications: data || [], total: count || 0, page, limit });
});

// PATCH /api/notifications/:id/lu - marquer comme lue
router.patch("/:id/lu", authenticateAdmin, async (req, res) => {
  const { error } = await supabase
    .from("notifications")
    .update({ lu: true })
    .eq("id", req.params.id)
    .eq("user_id", req.profil?.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// PATCH /api/notifications/tout-lire - marquer toutes ses notifications comme lues
// Manquait pour tout rôle hors apprenant (coach, admin, PA, onboarding…) : le front appelait
// cet endpoint mais il n'existait tout simplement pas, donc "tout marquer lu" ne modifiait que
// l'état React local et redevenait "non lu" au premier rechargement de page.
router.patch("/tout-lire", authenticateAdmin, async (req, res) => {
  const userId = req.profil?.id;
  if (!userId) return res.status(401).json({ error: "Non authentifié" });
  const { error } = await supabase
    .from("notifications")
    .update({ lu: true })
    .eq("user_id", userId)
    .eq("lu", false);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// DELETE /api/notifications/:id - fermer/supprimer une notification (uniquement la sienne)
router.delete("/:id", authenticateAdmin, async (req, res) => {
  const userId = req.profil?.id;
  if (!userId) return res.status(401).json({ error: "Non authentifié" });
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
