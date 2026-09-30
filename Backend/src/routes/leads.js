// routes/leads.js
import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { publicFormLimiter } from "../middlewares/rateLimiters.js";
import { notifyRole } from "../services/notifyRole.js";

const router = express.Router();

console.log("✅ Route leads chargée");

router.post("/submit", publicFormLimiter, async (req, res) => {
  try {
    const { nom, email, telephone, niveau, objectif, centre_id } = req.body;

    if (!nom || !email || !telephone) {
      return res.status(400).json({ error: "Champs obligatoires manquants (nom, email, telephone)" });
    }

    const { error } = await supabase.from("leads_particuliers").insert({
      nom,
      email,
      telephone,
      niveau:    niveau    || null,
      objectif:  objectif  || null,
      centre_id: centre_id || null,
      statut:    "nouveau",
    });

    if (error) {
      console.error("Erreur Supabase leads :", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Lead enregistré" });
    await notifyRole(["commercial"], {
      type: "lead",
      titre: "🎯 Nouveau lead capturé",
      message: `${nom} (${email}) - ${objectif || "objectif non précisé"}.`,
      meta: { niveau, objectif },
    }).catch(() => {});
  } catch (err) {
    console.error("Erreur serveur leads :", err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// Liste des leads filtrée par scope admin.
// Le filtrage par scope limitait le périmètre géographique mais pas le rôle : n'importe quel
// compte admin lisait les coordonnées de tous les prospects de son centre. Le module `leads`
// réserve cette lecture à qui en a l'usage - Collecte de données, Admin, SuperAdmin, les trois
// seuls écrans qui appellent cette route.
router.get("/all", authenticateAdmin, requirePermission("leads", "read"), async (req, res) => {
  try {
    const scope = req.profil?.scope || [];
    const isNational = scope.includes("national") || req.role === "super_admin";

    let query = supabase
      .from("leads_particuliers")
      .select("id, nom, email, telephone, niveau, objectif, statut, centre_id, created_at")
      .order("created_at", { ascending: false });

    if (!isNational && scope.length > 0) {
      query = query.in("centre_id", scope);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ leads: data || [] });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
