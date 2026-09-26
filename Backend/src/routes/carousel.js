import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";

const router = express.Router();

// Bornes de la duree d'affichage, en secondes - memes valeurs que la contrainte SQL.
// Sous 2 secondes on ne lit rien ; au-dela de 30 le visiteur croit la page figee.
const DUREE_MIN = 2, DUREE_MAX = 30, DUREE_DEFAUT = 5;
const dureeValide = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(DUREE_MAX, Math.max(DUREE_MIN, n)) : DUREE_DEFAUT;
};

/** La colonne `duree` peut ne pas exister encore (42703) : on sert alors sans elle. */
const colonneDureeAbsente = (err) =>
  err && (err.code === "42703" || /duree/.test(err.message || ""));

// ── Public : slides actives ─────────────────────────────────────────────────
router.get("/publiques", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("carousel_slides")
      .select("id, type, url, titre, description, link_url, link_label, ordre, duree")
      .eq("actif", true)
      .order("ordre", { ascending: true });
    if (error && colonneDureeAbsente(error)) {
      // Migration pas encore jouee : le carrousel retombe sur sa cadence d'origine.
      const repli = await supabase
        .from("carousel_slides")
        .select("id, type, url, titre, description, link_url, link_label, ordre")
        .eq("actif", true)
        .order("ordre", { ascending: true });
      return res.json({ slides: (repli.data || []).map(s => ({ ...s, duree: DUREE_DEFAUT })) });
    }
    if (error) throw error;
    res.json({ slides: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : liste complète ──────────────────────────────────────────────────
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("carousel_slides")
      .select("*")
      .order("ordre", { ascending: true });
    if (error) throw error;
    res.json({ slides: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : création ────────────────────────────────────────────────────────
router.post("/", authenticateAdmin, requirePermission("contenu_editorial","create"), async (req, res) => {
  try {
    const { type, url, titre, description, link_url, link_label, ordre, actif, duree } = req.body;
    if (!url?.trim()) return res.status(400).json({ error: "L'URL est requise" });

    let nextOrdre = ordre != null ? Number(ordre) : 0;
    if (ordre == null) {
      const { data: last } = await supabase
        .from("carousel_slides")
        .select("ordre")
        .order("ordre", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextOrdre = (last?.ordre ?? -1) + 1;
    }

    const { data, error } = await supabase
      .from("carousel_slides")
      .insert({
        type:        type || "image",
        url:         url.trim(),
        titre:       titre?.trim() || "",
        description: description?.trim() || "",
        link_url:    link_url?.trim() || "",
        link_label:  link_label?.trim() || "",
        ordre:       nextOrdre,
        actif:       actif !== false,
        duree:       dureeValide(duree),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : modification ────────────────────────────────────────────────────
router.patch("/:id", authenticateAdmin, requirePermission("contenu_editorial","update"), async (req, res) => {
  try {
    const allowed = ["type", "url", "titre", "description", "link_url", "link_label", "ordre", "actif", "duree"];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (updates.url)         updates.url         = updates.url.trim();
    if (updates.titre)       updates.titre       = updates.titre.trim();
    if (updates.description) updates.description = updates.description.trim();
    if (updates.link_url)    updates.link_url    = updates.link_url.trim();
    if (updates.link_label)  updates.link_label  = updates.link_label.trim();
    if (updates.duree !== undefined) updates.duree = dureeValide(updates.duree);
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("carousel_slides")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin : suppression ─────────────────────────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("contenu_editorial","delete"), async (req, res) => {
  try {
    const { error } = await supabase
      .from("carousel_slides")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ message: "Slide supprimée" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
