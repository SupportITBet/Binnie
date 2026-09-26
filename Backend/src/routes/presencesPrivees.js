import express from "express";
import supabase from "../config/supabase.js";
import { authenticateAdmin } from "../middlewares/requireAdmin.js";
import { logAudit } from "../middlewares/logAudit.js";

const router = express.Router();

// N'utilisait pas notifyRole/notifyUser - cette insertion directe omettait `source`, donc les
// notifications qu'elle produit (assistante, added_by, coach) restaient invisibles dans la
// cloche dash (qui filtre ?source=dash), exactement le même bug que celui déjà corrigé dans
// notifyRole.js cette session, mais ce fichier le contournait entièrement.
async function sendNotif(userId, notif) {
  if (!userId) return;
  try {
    await supabase.from("notifications").insert({
      user_id: userId, type: notif.type || "info",
      titre: notif.titre || "", message: notif.message || "",
      lu: false, meta: notif.meta || null, source: "dash",
    });
  } catch {}
}

// assistantes.utilisateur_id n'existe pas en base (jamais migrée) - le lien vers utilisateurs
// se fait par email. Résout l'id utilisateurs correspondant à l'email d'une assistante.
async function resolveAssistanteUserId(email) {
  if (!email) return null;
  const { data } = await supabase.from("utilisateurs").select("id").ilike("email", email).maybeSingle();
  return data?.id || null;
}

async function checkAutoSuspensionPrivee(assignationId, declencheurId) {
  try {
    const { data: assignation } = await supabase
      .from("assignations_parcours")
      .select("prospect_email, prospect_nom, apprenant_id, assistante_id, assistantes(email), added_by")
      .eq("id", assignationId)
      .maybeSingle();
    if (!assignation?.apprenant_id) return;

    // Déjà suspendu ? ne rien faire
    const { data: authData } = await supabase.auth.admin.getUserById(assignation.apprenant_id);
    if (authData?.user?.app_metadata?.acces_bloque) return;

    // Compter les absences depuis le dernier reset (réintégration)
    const resetAt = authData?.user?.app_metadata?.absences_reset_at;
    let q = supabase
      .from("presences_privees")
      .select("id", { count: "exact", head: true })
      .eq("assignation_id", assignationId)
      .eq("statut", "absent");
    if (resetAt) q = q.gte("created_at", resetAt);
    const { count } = await q;

    if (!count || count < 4) return;

    const nomComplet = assignation.prospect_nom || assignation.prospect_email || "-";

    await supabase.auth.admin.updateUserById(assignation.apprenant_id, {
      app_metadata: { acces_bloque: true },
    });
    logAudit({
      acteur_id:   declencheurId || null,
      acteur_role: "system",
      plateforme:  "dash",
      action_type: "APPRENANT_SUSPENDU_AUTO",
      module:      "presences_privees",
      entite_type: "user",
      entite_id:   assignation.apprenant_id,
      detail:      `Suspension automatique de ${nomComplet} - ${count} absences en cours privé`,
      statut:      "success",
    }).catch(() => {});

    const assistanteUserId = await resolveAssistanteUserId(assignation.assistantes?.email);
    if (assistanteUserId) {
      await sendNotif(assistanteUserId, {
        type:    "absence_repetee",
        titre:   `🔒 Suspension automatique - ${nomComplet}`,
        message: `${nomComplet} a atteint ${count} absences en cours privé. Son accès a été automatiquement bloqué. Veuillez le contacter.`,
        meta:    { assignation_id: assignationId, apprenant_id: assignation.apprenant_id, nb_absences: count },
      });
    }

    if (assignation.added_by) {
      await sendNotif(assignation.added_by, {
        type:    "absence_repetee",
        titre:   `🔒 Suspension automatique - ${nomComplet}`,
        message: `${nomComplet} a atteint ${count} absences en cours privé. Son accès a été automatiquement bloqué. Veuillez le contacter.`,
        meta:    { assignation_id: assignationId, apprenant_id: assignation.apprenant_id, nb_absences: count },
      });
    }

    // Notifier le coach (celui qui a déclenché l'enregistrement)
    if (declencheurId) {
      await sendNotif(declencheurId, {
        type:    "absence_repetee",
        titre:   `🔒 Apprenant bloqué - ${nomComplet}`,
        message: `${nomComplet} a atteint ${count} absences en cours privé. Son accès a été automatiquement bloqué et ne figurera plus dans vos listes de présences.`,
        meta:    { assignation_id: assignationId, apprenant_id: assignation.apprenant_id, nb_absences: count },
      });
    }

    console.log(`[auto-suspension-privee] ${nomComplet} bloqué après ${count} absences privées`);
  } catch (e) {
    console.error("[auto-suspension-privee] erreur:", e.message);
  }
}

// GET /api/presences-privees?assignation_id=xxx
router.get("/", authenticateAdmin, async (req, res) => {
  const { assignation_id } = req.query;
  if (!assignation_id) return res.status(400).json({ error: "assignation_id requis" });
  const { data, error } = await supabase
    .from("presences_privees")
    .select("*, seances_privees(date_seance, heure_debut)")
    .eq("assignation_id", assignation_id)
    .order("date_presence", { ascending: false });
  if (error) { console.error("[presences-privees GET]", error.message); return res.status(500).json({ error: error.message }); }
  res.json({ presences: data || [] });
});

// POST /api/presences-privees
router.post("/", authenticateAdmin, async (req, res) => {
  const { assignation_id, seance_id, date_presence, statut, motif, note } = req.body;
  if (!assignation_id || !date_presence) return res.status(400).json({ error: "assignation_id et date_presence requis" });
  const coach_id = req.profil?.id;
  if (!coach_id) return res.status(401).json({ error: "Profil coach introuvable" });
  const { data, error } = await supabase.from("presences_privees").insert({
    assignation_id, coach_id,
    seance_id:     seance_id    || null,
    date_presence,
    statut:        statut       || "present",
    motif:         motif        || null,
    note:          note         || null,
  }).select().single();
  if (error) { console.error("[presences-privees POST]", error.message); return res.status(500).json({ error: error.message }); }

  if (statut === "absent") {
    checkAutoSuspensionPrivee(assignation_id, coach_id).catch(() => {});
  }

  res.status(201).json({ presence: data });

  // Notifie l'apprenant de sa présence/absence enregistrée - même logique de résolution
  // (apprenant_id direct sinon fallback par prospect_email) que pour les séances privées.
  (async () => {
    const { data: asg } = await supabase.from("assignations_parcours").select("apprenant_id, prospect_email").eq("id", assignation_id).maybeSingle();
    let uid = asg?.apprenant_id || null;
    if (!uid && asg?.prospect_email) {
      const { data: u } = await supabase.from("utilisateurs").select("id").ilike("email", asg.prospect_email).maybeSingle();
      uid = u?.id || null;
    }
    if (!uid) return;
    await sendNotif(uid, {
      type: "presence",
      titre: statut === "absent" ? "❌ Absence enregistrée" : "✅ Présence enregistrée",
      message: statut === "absent"
        ? `Votre coach vous a marqué(e) absent(e) le ${date_presence}.`
        : `Votre présence a été enregistrée pour la séance du ${date_presence}.`,
      meta: { assignation_id, date_presence, statut },
    });
  })().catch(() => {});
});

// DELETE /api/presences-privees/:id
router.delete("/:id", authenticateAdmin, async (req, res) => {
  await supabase.from("presences_privees").delete().eq("id", req.params.id);
  res.json({ ok: true });
});

export default router;
