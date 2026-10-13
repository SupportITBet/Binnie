import express from "express";
import supabase from "../config/supabase.js";
import { authenticateUser, authenticateAdmin } from "../middlewares/requireAdmin.js";
import { attribuerPoints, verifierBadges } from "../services/gamification.js";

const router = express.Router();

console.log("✅ Route gamification chargée");

/* ══════════════════════════════════════════════════════════
   GET /api/gamification/admin/:apprenantId - points + badges d'un apprenant précis, consultés
   par un membre du staff (coach, PA Advisor, Onboarding...) depuis sa fiche détail.
══════════════════════════════════════════════════════════ */
router.get("/admin/:apprenantId", authenticateAdmin, async (req, res) => {
  try {
    const { apprenantId } = req.params;
    const [{ data: u }, { data: catalogue }, { data: obtenus }] = await Promise.all([
      supabase.from("utilisateurs").select("points_gamif").eq("id", apprenantId).maybeSingle(),
      supabase.from("badges").select("*").order("categorie"),
      supabase.from("badges_obtenus").select("badge_id, obtenu_le").eq("apprenant_id", apprenantId),
    ]);
    const obtenuParBadge = {};
    (obtenus || []).forEach(o => { obtenuParBadge[o.badge_id] = o.obtenu_le; });
    const badges = (catalogue || []).map(b => ({ ...b, obtenu: !!obtenuParBadge[b.id], obtenu_le: obtenuParBadge[b.id] || null }));
    res.json({ solde: u?.points_gamif || 0, badges });
  } catch (err) {
    console.error("[gamification/admin] ", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/gamification/onboarding-complete - l'apprenant a validé les 4 étapes du
   guide de bienvenue. Auparavant purement client-side (localStorage) - désormais reporté
   au backend pour déclencher les points + le badge "Prêt à apprendre".
══════════════════════════════════════════════════════════ */
router.post("/onboarding-complete", authenticateUser, async (req, res) => {
  try {
    /* IDEMPOTENT. La route n'avait aucun garde-fou : chaque validation réattribuait 10
       points, et il suffisait de rouvrir le guide depuis son profil pour en regagner.
       Le guide se termine une fois ; la deuxième fois, on répond simplement « c'est
       déjà fait ». */
    if (await onboardingDejaFait(req.user.id)) return res.json({ ok: true, deja_fait: true });
    await attribuerPoints(req.user.id, "onboarding", null, 10, "Guide de bienvenue terminé");
    res.json({ ok: true });
  } catch (err) {
    console.error("[gamification/onboarding-complete]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/gamification/onboarding-complete - ce guide a-t-il déjà été terminé ?

   L'écran ne gardait cette information QUE dans `localStorage`. Elle est donc attachée au
   navigateur, pas au compte : le même apprenant rouvrait les quatre étapes sur son
   téléphone, chez lui, après un nettoyage de cache — et à chaque fois le guide se
   présentait comme s'il découvrait la plateforme. Le fait était pourtant déjà enregistré
   côté serveur depuis la validation ; il n'était simplement jamais relu.
══════════════════════════════════════════════════════════ */
router.get("/onboarding-complete", authenticateUser, async (req, res) => {
  try {
    res.json({ fait: await onboardingDejaFait(req.user.id) });
  } catch (err) {
    console.error("[gamification/onboarding-complete GET]", err.message);
    /* En cas de panne on répond « pas fait » : revoir le guide une fois de trop est sans
       gravité, le cacher à quelqu'un qui ne l'a jamais vu l'est davantage. */
    res.json({ fait: false });
  }
});

/** La trace durable du guide terminé : la transaction de points écrite à sa validation. */
async function onboardingDejaFait(apprenantId) {
  const { data } = await supabase
    .from("points_transactions")
    .select("id")
    .eq("apprenant_id", apprenantId)
    .eq("source_type", "onboarding")
    .limit(1)
    .maybeSingle();
  return !!data;
}

/* ══════════════════════════════════════════════════════════
   POST /api/gamification/chat-message - l'apprenant vient d'envoyer un message dans le chat
   de classe (Firebase - le backend n'a aucune visibilité dessus, donc le frontend "ping"
   cette route après un envoi réussi). Plafonné à 5/jour pour éviter le farm par spam ; le
   badge "Bon camarade" reste atteignable sur plusieurs jours au-delà du plafond.
══════════════════════════════════════════════════════════ */
router.post("/chat-message", authenticateUser, async (req, res) => {
  try {
    await attribuerPoints(req.user.id, "chat_message", null, 1, "Message envoyé dans le chat de classe");
    res.json({ ok: true });
  } catch (err) {
    console.error("[gamification/chat-message]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/gamification/mes-points - solde + historique des transactions de l'apprenant
   connecté (transparence : "pourquoi j'ai ce solde ?").
══════════════════════════════════════════════════════════ */
router.get("/mes-points", authenticateUser, async (req, res) => {
  try {
    const { data: u } = await supabase.from("utilisateurs").select("points_gamif").eq("id", req.user.id).maybeSingle();
    const { data: transactions } = await supabase
      .from("points_transactions")
      .select("*")
      .eq("apprenant_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    res.json({ solde: u?.points_gamif || 0, transactions: transactions || [] });
  } catch (err) {
    console.error("[gamification/mes-points]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/gamification/mes-badges - catalogue complet + statut obtenu/verrouillé pour
   l'apprenant connecté.
══════════════════════════════════════════════════════════ */
router.get("/mes-badges", authenticateUser, async (req, res) => {
  try {
    const [{ data: catalogue }, { data: obtenus }] = await Promise.all([
      supabase.from("badges").select("*").order("categorie"),
      supabase.from("badges_obtenus").select("badge_id, obtenu_le").eq("apprenant_id", req.user.id),
    ]);
    const obtenuParBadge = {};
    (obtenus || []).forEach(o => { obtenuParBadge[o.badge_id] = o.obtenu_le; });
    const badges = (catalogue || []).map(b => ({ ...b, obtenu: !!obtenuParBadge[b.id], obtenu_le: obtenuParBadge[b.id] || null }));
    res.json({ badges });
  } catch (err) {
    console.error("[gamification/mes-badges]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/gamification/classement?classe_id=&limite= - classement par points, global ou
   filtré à une classe (pour l'onglet "Classement de la classe" de l'apprenant).
══════════════════════════════════════════════════════════ */
router.get("/classement", authenticateUser, async (req, res) => {
  try {
    const limite = Math.min(parseInt(req.query.limite) || 20, 100);
    let apprenantIds = null;

    if (req.query.classe_id) {
      const { data: inscriptions } = await supabase
        .from("classes_elearning_apprenants")
        .select("apprenant_id")
        .eq("classe_id", req.query.classe_id);
      apprenantIds = [...new Set((inscriptions || []).map(i => i.apprenant_id).filter(Boolean))];
      if (!apprenantIds.length) return res.json({ classement: [] });
    }

    let q = supabase.from("utilisateurs").select("id, nom, prenom, points_gamif").eq("role", "apprenant").gt("points_gamif", 0).order("points_gamif", { ascending: false }).limit(limite);
    if (apprenantIds) q = q.in("id", apprenantIds);
    const { data, error } = await q;
    if (error) throw error;

    res.json({ classement: (data || []).map((u, i) => ({ rang: i + 1, id: u.id, nom_complet: `${u.prenom || ""} ${u.nom || ""}`.trim(), points: u.points_gamif })) });
  } catch (err) {
    console.error("[gamification/classement]", err.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
