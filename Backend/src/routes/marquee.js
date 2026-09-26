import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

const OFFRE_LABELS = {
  centres:          "nos centres",
  en_ligne:         "les cours en ligne",
  domicile:         "les cours à domicile",
  certifications:   "les certifications",
  tous:             "toutes les offres",
};

// ── Public : messages actifs + codes promo actifs ───────────────────────────
router.get("/publics", async (req, res) => {
  try {
    const now = new Date().toISOString();

    const [{ data: msgs, error: e1 }, { data: promos, error: e2 }] = await Promise.all([
      supabase
        .from("marquee_messages")
        .select("id, texte, code_promo, lien_url, lien_label, ordre")
        .eq("actif", true)
        .or(`date_expiration.is.null,date_expiration.gt.${now}`)
        .order("ordre", { ascending: true }),
      supabase
        .from("codes_promo")
        .select("code, type_reduction, valeur, description, applicable_a, usage_max, usage_count")
        .eq("actif", true)
        .or(`date_expiration.is.null,date_expiration.gt.${now}`),
    ]);

    if (e1) throw e1;

    const promoItems = (promos || [])
      .filter(p => p.usage_max == null || p.usage_count < p.usage_max)
      .map((p, i) => {
      const reduction = p.type_reduction === "pourcentage"
        ? `-${p.valeur}%`
        : `-${Number(p.valeur).toLocaleString("fr-FR")} FCFA`;
      const offres = (p.applicable_a || []).map(k => OFFRE_LABELS[k] || k).join(", ");
      const desc   = p.description ? ` · ${p.description}` : "";
      const sur    = offres ? ` sur ${offres}` : "";
      return {
        id:        `promo_${p.code}`,
        texte:     `🏷️ Offre promo${sur}${desc} - ${reduction}`,
        code_promo: p.code,
        lien_url:  null,
        lien_label: null,
        ordre:     10000 + i,
      };
    });

    res.json({ messages: [...(msgs || []), ...promoItems] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : lecture complète ────────────────────────────────────────────────
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("marquee_messages")
      .select("*")
      .order("ordre", { ascending: true });
    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : création ────────────────────────────────────────────────────────
router.post("/", authenticateAdmin, requirePermission("communication","create"), async (req, res) => {
  try {
    const { texte, code_promo, lien_url, lien_label, date_expiration, actif, ordre } = req.body;
    if (!texte?.trim()) return res.status(400).json({ error: "Le texte est requis" });

    // Ordre par défaut = dernier + 1
    let nextOrdre = ordre != null ? Number(ordre) : 0;
    if (ordre == null) {
      const { data: last } = await supabase
        .from("marquee_messages")
        .select("ordre")
        .order("ordre", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextOrdre = (last?.ordre ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from("marquee_messages")
      .insert({
        texte: texte.trim(),
        code_promo: code_promo?.trim() || null,
        lien_url: lien_url?.trim() || null,
        lien_label: lien_label?.trim() || null,
        date_expiration: date_expiration || null,
        actif: actif !== false,
        ordre: nextOrdre,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : modification ────────────────────────────────────────────────────
router.patch("/:id", authenticateAdmin, requirePermission("communication","update"), async (req, res) => {
  try {
    const allowed = ["texte", "code_promo", "lien_url", "lien_label", "date_expiration", "actif", "ordre"];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    if (updates.texte != null) updates.texte = updates.texte.trim();
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("marquee_messages")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : suppression ─────────────────────────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("communication","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("marquee_messages").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Message supprimé" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
