import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin, requirePermission } from "../middlewares/requireAdmin.js";
import { authenticateUser }  from "../middlewares/auth.js";
import { notifyRole } from "../services/notifyRole.js";

const router = express.Router();

// ── Vérifie qu'un email est bien un apprenant BET ───────────────────────────
async function isApprenant(email) {
  const [{ data: a }, { data: e }, { data: s }] = await Promise.all([
    supabase.from("inscriptions_adultes").select("id").eq("email", email).maybeSingle(),
    supabase.from("inscriptions_enfants").select("id").eq("email", email).maybeSingle(),
    supabase.from("inscriptions_etudiants").select("id").eq("email", email).maybeSingle(),
  ]);
  return !!(a || e || s);
}

// ── Public : avis actifs ─────────────────────────────────────────────────────
router.get("/publics", async (req, res) => {
  try {
    const { offre_type, offre_id, limit = 50 } = req.query;
    let q = supabase
      .from("avis_offres")
      .select("id, offre_type, offre_id, apprenant_nom, note, texte, created_at")
      .eq("actif", true)
      .order("created_at", { ascending: false })
      .limit(Number(limit));

    if (offre_type) q = q.eq("offre_type", offre_type);
    if (offre_id)   q = q.eq("offre_id", offre_id);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ avis: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Apprenant : soumettre un avis ────────────────────────────────────────────
router.post("/", authenticateUser, async (req, res) => {
  const { offre_type, offre_id, note, texte } = req.body;
  const email = req.user.email;

  if (!offre_type || !texte?.trim() || !note) {
    return res.status(400).json({ error: "offre_type, note et texte sont requis." });
  }
  if (!["cours", "certification"].includes(offre_type)) {
    return res.status(400).json({ error: "offre_type invalide." });
  }
  if (texte.trim().length < 20) {
    return res.status(400).json({ error: "Votre avis doit faire au moins 20 caractères." });
  }

  try {
    const ok = await isApprenant(email);
    if (!ok) {
      return res.status(403).json({
        error: "Seuls les apprenants BET inscrits peuvent laisser un avis.",
      });
    }

    // Vérifier doublon (un avis par offre_type+offre_id par apprenant)
    const { data: existing } = await supabase
      .from("avis_offres")
      .select("id")
      .eq("apprenant_email", email)
      .eq("offre_type", offre_type)
      .eq("offre_id", offre_id || "")
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Vous avez déjà laissé un avis pour cette offre." });
    }

    const meta = req.user.user_metadata || {};
    const nom  = [meta.prenom, meta.nom].filter(Boolean).join(" ") || meta.full_name || email.split("@")[0];

    const { data, error } = await supabase
      .from("avis_offres")
      .insert({
        offre_type,
        offre_id:       offre_id || null,
        apprenant_email: email,
        apprenant_nom:  nom,
        note:           Number(note),
        texte:          texte.trim(),
        actif:          true,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: "Avis publié avec succès !", avis: data });
    await notifyRole(["super_admin"], {
      type: "avis",
      titre: "⭐ Nouvel avis publié",
      message: `${nom} a laissé un avis (${note}/5) sur "${offre_type}" - déjà publié automatiquement.`,
      meta: { avis_id: data?.id, offre_type, offre_id },
    }).catch(() => {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SuperAdmin : liste complète ──────────────────────────────────────────────
router.get("/", authenticateAdmin, async (req, res) => {
  try {
    const { offre_type } = req.query;
    let q = supabase
      .from("avis_offres")
      .select("*")
      .order("created_at", { ascending: false });
    if (offre_type) q = q.eq("offre_type", offre_type);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ avis: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SuperAdmin : activer / désactiver ────────────────────────────────────────
router.patch("/:id", authenticateAdmin, requirePermission("contenu_editorial","update"), async (req, res) => {
  try {
    const { actif } = req.body;
    const { data, error } = await supabase
      .from("avis_offres")
      .update({ actif })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SuperAdmin : supprimer ───────────────────────────────────────────────────
router.delete("/:id", authenticateAdmin, requirePermission("contenu_editorial","delete"), async (req, res) => {
  try {
    const { error } = await supabase.from("avis_offres").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
