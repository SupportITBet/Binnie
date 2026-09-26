import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

// ── GET /actifs → promos visibles publiquement pour un type d'offre ───────────
// Utilisé par le frontend pour afficher les bannières promo sur les pages/modals.
// Pas d'authentification requise - on expose uniquement code, description, réduction.
router.get("/actifs", async (req, res) => {
  try {
    const { offre_type, centre_id } = req.query;

    const { data, error } = await supabase
      .from("codes_promo")
      .select("code, description, type_reduction, valeur, date_expiration, usage_max, usage_count, applicable_a, centres_ids")
      .eq("actif", true);

    if (error) return res.status(500).json({ error: error.message });

    const now = new Date();
    const actifs = (data || []).filter(c => {
      if (c.date_expiration && new Date(c.date_expiration) < now) return false;
      if (c.usage_max != null && c.usage_count >= c.usage_max) return false;
      const a = c.applicable_a || ["tous"];
      if (offre_type && !a.includes("tous") && !a.includes(offre_type)) return false;
      // Restriction par centre précis - ne s'applique que si des centres ont été
      // explicitement cochés (liste vide = valable pour tous les centres).
      const centres = c.centres_ids || [];
      if (centre_id && centres.length > 0 && !centres.includes(centre_id)) return false;
      return true;
    }).map(({ usage_count, usage_max, applicable_a, centres_ids, ...rest }) => rest);

    res.json({ promos: actifs });
  } catch { res.status(500).json({ error: "Erreur interne" }); }
});

// ── POST /valider → valider un code promo - public, comme /actifs. Un prospect
// non connecté (visiteur anonyme du site public) doit pouvoir vérifier un code
// avant même de créer un compte ; ce endpoint est un simple lookup en lecture
// (aucun req.user/req.profil utilisé ci-dessous), authenticateAdmin bloquait donc
// à tort tout visiteur non-staff avec "Token manquant ou invalide".
router.post("/valider", async (req, res) => {
  const { code, offre_type, centre_id } = req.body;
  if (!code?.trim()) return res.status(400).json({ error: "Code requis" });

  const { data, error } = await supabase
    .from("codes_promo")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("actif", true)
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: "Code invalide ou inexistant" });

  if (data.date_expiration && new Date(data.date_expiration) < new Date()) {
    return res.status(400).json({ error: "Ce code promo a expiré" });
  }

  if (data.usage_max != null && data.usage_count >= data.usage_max) {
    return res.status(400).json({ error: "Ce code a atteint son nombre maximum d'utilisations" });
  }

  const applicable = data.applicable_a || ["tous"];
  if (offre_type && !applicable.includes("tous") && !applicable.includes(offre_type)) {
    return res.status(400).json({ error: "Ce code promo n'est pas applicable à cette offre" });
  }

  // Restriction par centre précis (cumulative avec la catégorie d'offre ci-dessus) -
  // liste vide = valable pour tous les centres.
  const centresAutorises = data.centres_ids || [];
  if (centre_id && centresAutorises.length > 0 && !centresAutorises.includes(centre_id)) {
    return res.status(400).json({ error: "Ce code promo n'est pas applicable à ce centre" });
  }

  res.json({
    valide:         true,
    code:           data.code,
    type_reduction: data.type_reduction,
    valeur:         data.valeur,
    description:    data.description || null,
    applicable_a:   applicable,
  });
});

// ── GET / → lister tous les codes (SuperAdmin) ────────────────────────────────
router.get("/", authenticateAdmin, requirePermission("offres_catalogue","read"), async (req, res) => {
  const { data, error } = await supabase
    .from("codes_promo")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ codes: data || [] });
});

// ── POST / → créer un code (SuperAdmin) ──────────────────────────────────────
router.post("/", authenticateAdmin, requirePermission("offres_catalogue","create"), async (req, res) => {
  const { code, description, type_reduction, valeur, applicable_a, centres_ids, date_expiration, usage_max, actif } = req.body;
  if (!code?.trim()) return res.status(400).json({ error: "Code requis" });
  if (!valeur || isNaN(Number(valeur))) return res.status(400).json({ error: "Valeur invalide" });

  const { data, error } = await supabase
    .from("codes_promo")
    .insert({
      code:            code.trim().toUpperCase(),
      description:     description?.trim() || null,
      type_reduction:  type_reduction || "pourcentage",
      valeur:          Number(valeur),
      applicable_a:    applicable_a?.length ? applicable_a : ["tous"],
      centres_ids:     centres_ids?.length ? centres_ids : [],
      date_expiration: date_expiration || null,
      usage_max:       usage_max ? Number(usage_max) : null,
      actif:           actif !== false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Ce code existe déjà" });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json({ code: data });
});

// ── PUT /:id → modifier un code (SuperAdmin) ──────────────────────────────────
router.put("/:id", authenticateAdmin, requirePermission("offres_catalogue","update"), async (req, res) => {
  const { code, description, type_reduction, valeur, applicable_a, centres_ids, date_expiration, usage_max, actif } = req.body;

  const update = {};
  if (code !== undefined)            update.code            = code.trim().toUpperCase();
  if (description !== undefined)     update.description     = description?.trim() || null;
  if (type_reduction !== undefined)  update.type_reduction  = type_reduction;
  if (valeur !== undefined)          update.valeur          = Number(valeur);
  if (applicable_a !== undefined)    update.applicable_a    = applicable_a?.length ? applicable_a : ["tous"];
  if (centres_ids !== undefined)     update.centres_ids     = centres_ids?.length ? centres_ids : [];
  if (date_expiration !== undefined) update.date_expiration = date_expiration || null;
  if (usage_max !== undefined)       update.usage_max       = usage_max ? Number(usage_max) : null;
  if (actif !== undefined)           update.actif           = actif;

  const { data, error } = await supabase
    .from("codes_promo")
    .update(update)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ code: data });
});

// ── DELETE /:id → supprimer un code (SuperAdmin) ──────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("offres_catalogue","delete"), async (req, res) => {
  const { error } = await supabase
    .from("codes_promo")
    .delete()
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
