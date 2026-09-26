import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

// GET /api/fichiers-prives?assignation_id=xxx
router.get("/", authenticateAdmin, async (req, res) => {
  const { assignation_id } = req.query;
  if (!assignation_id) return res.status(400).json({ error: "assignation_id requis" });
  const { data, error } = await supabase
    .from("fichiers_prives")
    .select("*")
    .eq("assignation_id", assignation_id)
    .order("created_at", { ascending: false });
  if (error) { console.error("[fichiers-prives GET]", error.message); return res.status(500).json({ error: error.message }); }
  res.json({ fichiers: data || [] });
});

// POST /api/fichiers-prives
router.post("/", authenticateAdmin, async (req, res) => {
  const { assignation_id, nom, url, type_fichier, taille_ko } = req.body;
  if (!assignation_id || !url || !nom) return res.status(400).json({ error: "assignation_id, nom et url requis" });
  const coach_id = req.profil?.id;
  if (!coach_id) return res.status(401).json({ error: "Profil coach introuvable" });
  const { data, error } = await supabase.from("fichiers_prives").insert({
    assignation_id, coach_id, nom,
    url, type_fichier: type_fichier || "autre",
    taille_ko: taille_ko || null,
  }).select().single();
  if (error) { console.error("[fichiers-prives POST]", error.message); return res.status(500).json({ error: error.message }); }
  res.status(201).json({ fichier: data });

  // Notifier l'apprenant (arrière-plan, sans bloquer la réponse déjà envoyée)
  try {
    const { data: assignation } = await supabase
      .from("assignations_parcours")
      .select("apprenant_id, prospect_email")
      .eq("id", assignation_id)
      .maybeSingle();
    // apprenant_id est fréquemment null sur les dossiers privés (confirmé à plusieurs reprises
    // cette session) - sans ce fallback par email, cette notification échouait silencieusement
    // pour la majorité des dossiers, alors que l'insert lui-même ne renvoyait aucune erreur.
    let apprenantId = assignation?.apprenant_id || null;
    if (!apprenantId && assignation?.prospect_email) {
      const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", assignation.prospect_email).maybeSingle();
      apprenantId = u?.id || null;
    }
    if (apprenantId) {
      const typeIcon = { pdf: "📄", video: "🎬", audio: "🎧", lien: "🔗", speaking: "🎤" };
      const icon = typeIcon[type_fichier] || "📎";
      await supabase.from("notifications").insert({
        user_id: apprenantId,
        type: "ressource",
        titre: `${icon} Nouveau fichier partagé`,
        message: `Votre coach vient de partager un fichier : "${nom}"`,
        meta: { fichier_id: data?.id, fichier_nom: nom, type_fichier, assignation_id },
        lu: false,
      });
    }
  } catch (e) {
    console.warn("[fichiers-prives] notif apprenant échouée:", e.message);
  }
});

// DELETE /api/fichiers-prives/:id
router.delete("/:id", authenticateAdmin, requirePermission("contenus_ressources","delete"), async (req, res) => {
  const { error } = await supabase.from("fichiers_prives").delete().eq("id", req.params.id).eq("coach_id", req.profil?.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
