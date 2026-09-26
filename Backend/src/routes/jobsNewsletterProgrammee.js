import express from "express";
import supabase from "../config/supabase.js";
import { envoyerCampagneParId } from "./newsletter.js";

const router = express.Router();

/* ══════════════════════════════════════════════════════════════
   GET /api/jobs/newsletter-programmee - déclenché par un cron externe
   (Vercel Cron), toutes les 15 min. Protégé par CRON_SECRET (même
   secret que jobsPaiements.js / jobsBadgesFidelite.js).

   Envoie toute campagne "programmee" dont date_programmee est passée.
══════════════════════════════════════════════════════════════ */
router.get("/newsletter-programmee", async (req, res) => {
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const secret = bearer || req.query.secret || req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const resultat = { campagnes_traitees: 0, campagnes_envoyees: 0, erreurs: [] };

  try {
    const { data: campagnes, error } = await supabase
      .from("newsletter_campagnes")
      .select("id")
      .eq("statut", "programmee")
      .lte("date_programmee", new Date().toISOString());
    if (error) throw error;

    for (const c of campagnes || []) {
      resultat.campagnes_traitees++;
      try {
        await envoyerCampagneParId(c.id);
        resultat.campagnes_envoyees++;
      } catch (err) {
        resultat.erreurs.push({ campagne_id: c.id, erreur: err.message });
      }
    }

    console.log(`[jobsNewsletterProgrammee] ${resultat.campagnes_traitees} campagne(s) traitée(s), ${resultat.campagnes_envoyees} envoyée(s)`);
    res.json(resultat);
  } catch (err) {
    console.error("[jobsNewsletterProgrammee] échec:", err.message);
    res.status(500).json({ error: "Erreur interne", detail: err.message });
  }
});

export default router;
