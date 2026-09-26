// routes/temoignages.js
import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { notifyRole } from "../services/notifyRole.js";

const router = express.Router();

// ── Lecture publique : témoignages actifs (site frontend) ──────
router.get("/publics", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("temoignages")
      .select("id, nom, role, score, texte, avatar, photo_url, video_url, couleur, etoiles, ordre")
      .eq("actif", true)
      .eq("statut", "actif")
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Soumission apprenant ───────────────────────────────────────
router.post("/soumettre", async (req, res) => {
  const { apprenant_id, texte, etoiles, score, role, photo_url } = req.body;
  if (!apprenant_id || !texte) {
    return res.status(400).json({ error: "apprenant_id et texte requis" });
  }

  try {
    // Vérifier certification
    const { data: certifs } = await supabase
      .from("certifications")
      .select("id, cert_type, score")
      .eq("apprenant_id", apprenant_id)
      .eq("valide", true)
      .limit(1);

    if (!certifs?.length) {
      return res.status(403).json({
        error: "Vous devez avoir au moins une certification BET pour laisser un témoignage.",
      });
    }

    // Vérifier qu'il n'a pas déjà soumis un témoignage en attente ou actif
    const { data: existing } = await supabase
      .from("temoignages")
      .select("id, statut")
      .eq("apprenant_id", apprenant_id)
      .in("statut", ["en_attente", "actif"])
      .limit(1);

    if (existing?.length) {
      return res.status(409).json({
        error:
          existing[0].statut === "actif"
            ? "Votre témoignage est déjà publié."
            : "Votre témoignage est en attente de validation.",
      });
    }

    // Récupérer les infos de l'apprenant
    const { data: apprenant } = await supabase
      .from("apprenants")
      .select("nom, prenom, email")
      .eq("id", apprenant_id)
      .maybeSingle();

    const certif = certifs[0];
    const nom    = apprenant ? `${apprenant.prenom || ""} ${apprenant.nom || ""}`.trim() : "Apprenant BET";

    const { error } = await supabase.from("temoignages").insert({
      nom,
      role:            role || null,
      score:           score || `${certif.cert_type} ${certif.score || ""}`.trim(),
      texte,
      etoiles:         etoiles || 5,
      avatar:          "🎓",
      photo_url:       photo_url?.trim() || null,
      couleur:         "#1e4080",
      statut:          "en_attente",
      source:          "apprenant",
      actif:           false,
      apprenant_id,
      certification_id: certif.id,
    });

    if (error) throw error;
    res.json({ message: "Témoignage soumis avec succès. Il sera publié après validation." });
    await notifyRole(["super_admin"], {
      type: "temoignage",
      titre: "⭐ Nouveau témoignage à modérer",
      message: `${nom} a soumis un témoignage - en attente de validation.`,
      meta: { apprenant_id },
    }).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : liste complète ─────────────────────────────────────
router.get("/", authenticateAdmin, async (req, res) => {
  const { statut } = req.query;
  try {
    let q = supabase
      .from("temoignages")
      .select("*, apprenant:apprenants(nom, prenom, email), certification:certifications(cert_type, score, date_obtention)")
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: false });

    if (statut) q = q.eq("statut", statut);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : créer directement (source admin) ───────────────────
router.post("/", authenticateAdmin, requirePermission("contenu_editorial","create"), async (req, res) => {
  const { nom, role, score, texte, avatar, couleur, etoiles, ordre, photo_url, video_url } = req.body;
  if (!nom || !texte) return res.status(400).json({ error: "nom et texte requis" });

  try {
    const { data, error } = await supabase
      .from("temoignages")
      .insert({
        nom, role, score, texte,
        avatar:    avatar    || "🎓",
        couleur:   couleur   || "#1e4080",
        etoiles:   etoiles   || 5,
        ordre:     ordre     || 0,
        photo_url: photo_url || null,
        video_url: video_url || null,
        statut:  "actif",
        source:  "admin",
        actif:   true,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : modifier ──────────────────────────────────────────
router.patch("/:id", authenticateAdmin, requirePermission("contenu_editorial","update"), async (req, res) => {
  const { id } = req.params;
  const allowed = ["nom","role","score","texte","avatar","photo_url","video_url","couleur","etoiles","actif","ordre","statut","motif_rejet"];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );

  // Si on passe statut actif → on force actif = true
  if (updates.statut === "actif")   updates.actif = true;
  if (updates.statut === "rejeté")  updates.actif = false;

  try {
    const { data, error } = await supabase
      .from("temoignages")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : réordonner (drag & drop) ─────────────────────────
router.post("/reorder", authenticateAdmin, requirePermission("contenu_editorial","update"), async (req, res) => {
  // body: [{ id, ordre }, ...]
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: "items[] requis" });

  try {
    await Promise.all(
      items.map(({ id, ordre }) =>
        supabase.from("temoignages").update({ ordre }).eq("id", id)
      )
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : supprimer (soft = désactiver, hard = vrai delete) ──
router.delete("/:id", authenticateAdmin, requirePermission("contenu_editorial","delete"), async (req, res) => {
  const { id } = req.params;
  const { hard } = req.query;

  try {
    if (hard === "1") {
      const { error } = await supabase.from("temoignages").delete().eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("temoignages")
        .update({ actif: false, statut: "rejeté" })
        .eq("id", id);
      if (error) throw error;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin : liste certifications d'un apprenant ───────────────
router.get("/certifications/:apprenant_id", authenticateAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("certifications")
    .select("*")
    .eq("apprenant_id", req.params.apprenant_id)
    .order("date_obtention", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── Admin : ajouter une certification à un apprenant ──────────
router.post("/certifications", authenticateAdmin, requirePermission("contenu_editorial","create"), async (req, res) => {
  const { apprenant_id, cert_type, score, date_obtention, centre_id } = req.body;
  if (!apprenant_id || !cert_type) return res.status(400).json({ error: "apprenant_id et cert_type requis" });

  const { data, error } = await supabase
    .from("certifications")
    .insert({ apprenant_id, cert_type, score, date_obtention, centre_id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
