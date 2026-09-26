import express from "express";
import crypto from "crypto";
import supabase from "../config/supabase.js";
import { notifyRole } from "../services/notifyRole.js";

const router = express.Router();

// ══════════════════════════════════════════════════════════════════════════
// Vérification anti-triche des sessions live (Zoom / Teams) - remplace la
// confiance aveugle faite jusqu'ici au clic "Clôturer" du coach par une preuve
// venant directement de la plateforme de visio (qui a rejoint, quand, combien
// de temps). Contrainte importante : ça ne fonctionne QUE pour les réunions
// créées sous le compte/tenant BET (Zoom Business de BET, Microsoft 365 de
// BET) - un coach qui utilise son compte Zoom/Teams personnel reste invisible
// pour ces webhooks, l'API n'a aucune visibilité hors du tenant/compte propriétaire.
// ══════════════════════════════════════════════════════════════════════════

// Retrouve la session_live BET correspondant à un identifiant externe de
// réunion (Zoom meeting id, ou joinWebUrl Teams) - matché via l'URL collée
// par le coach dans `sessions_live.lien`.
async function trouverSessionLiveParLien(lienPartiel) {
  if (!lienPartiel) return null;
  const { data } = await supabase
    .from("sessions_live")
    .select("id, coach_id, statut")
    .ilike("lien", `%${lienPartiel}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function upsertVerification(sessionLiveId, provider, patch) {
  if (!sessionLiveId) return;
  const { data: existing } = await supabase
    .from("sessions_live_verification")
    .select("id")
    .eq("session_live_id", sessionLiveId)
    .eq("provider", provider)
    .maybeSingle();

  if (existing) {
    await supabase.from("sessions_live_verification").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("sessions_live_verification").insert({ session_live_id: sessionLiveId, provider, ...patch });
  }
}

// Compare la durée réelle à la durée prévue de la séance - un écart trop
// important (session coupée après 2 minutes, ou jamais rejointe par le coach)
// est le signal de triche qu'on cherche à détecter.
async function evaluerSuspicion(sessionLiveId, dureeReelleMin, coachARejoint) {
  const { data: session } = await supabase.from("sessions_live").select("duree, coach_id").eq("id", sessionLiveId).maybeSingle();
  const dureePrevue = session?.duree || 0;
  let statut = "verifiee";
  let motif = null;
  if (coachARejoint === false) {
    statut = "suspecte";
    motif = "Le coach n'a jamais rejoint la réunion.";
  } else if (dureePrevue > 0 && dureeReelleMin < dureePrevue * 0.5) {
    statut = "suspecte";
    motif = `Durée réelle (${dureeReelleMin} min) très inférieure à la durée prévue (${dureePrevue} min).`;
  }
  if (statut === "suspecte" && session?.coach_id) {
    await notifyRole(["pedagogical_advisor", "admin_pa_advisor", "superviseur"], {
      type: "alerte",
      titre: "⚠️ Séance live suspecte",
      message: motif,
      meta: { session_live_id: sessionLiveId, coach_id: session.coach_id },
      source: "dash",
    }).catch(() => {});
  }
  return { statut, motif };
}

// ── ZOOM ──────────────────────────────────────────────────────────────────
// Configuration nécessaire (Zoom Marketplace → app Server-to-Server OAuth) :
// ZOOM_WEBHOOK_SECRET_TOKEN (Feature → Event Subscriptions → Secret Token).
router.post("/zoom", async (req, res) => {
  try {
    const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    if (!secret) return res.status(503).json({ error: "Intégration Zoom non configurée" });

    // Étape de validation d'URL exigée par Zoom à la création de l'abonnement webhook.
    if (req.body?.event === "endpoint.url_validation") {
      const plainToken = req.body.payload?.plainToken;
      const encryptedToken = crypto.createHmac("sha256", secret).update(plainToken).digest("hex");
      return res.json({ plainToken, encryptedToken });
    }

    // Vérification de signature - voir https://developers.zoom.us/docs/api/webhooks/#verify-webhook-events
    const timestamp = req.headers["x-zm-request-timestamp"];
    const signatureRecue = req.headers["x-zm-signature"];
    const message = `v0:${timestamp}:${req.rawBody?.toString() || ""}`;
    const hash = crypto.createHmac("sha256", secret).update(message).digest("hex");
    const signatureAttendue = `v0=${hash}`;
    if (signatureRecue !== signatureAttendue) {
      console.warn("[webhook zoom] signature invalide");
      return res.status(401).json({ error: "Signature invalide" });
    }

    const { event, payload } = req.body;
    const meetingId = payload?.object?.id ? String(payload.object.id) : null;
    const meetingUuid = payload?.object?.uuid || null;

    if (event === "meeting.started") {
      const sl = await trouverSessionLiveParLien(meetingId);
      if (sl) await upsertVerification(sl.id, "zoom", { provider_meeting_id: meetingId, statut: "en_attente", heure_debut_reelle: new Date().toISOString(), raw_payload: payload });
    }

    if (event === "meeting.participant_joined") {
      const sl = await trouverSessionLiveParLien(meetingId);
      if (sl) {
        const participant = payload.object.participant;
        const estCoach = !!participant?.host_id && participant.host_id === payload.object.host_id;
        const { data: v } = await supabase.from("sessions_live_verification").select("participants, coach_a_rejoint").eq("session_live_id", sl.id).eq("provider", "zoom").maybeSingle();
        const participants = [...(v?.participants || []), { nom: participant?.user_name, id: participant?.id, rejoint_a: new Date().toISOString() }];
        await upsertVerification(sl.id, "zoom", { participants, coach_a_rejoint: estCoach || v?.coach_a_rejoint || false, raw_payload: payload });
      }
    }

    if (event === "meeting.ended") {
      const sl = await trouverSessionLiveParLien(meetingId);
      if (sl) {
        const { data: v } = await supabase.from("sessions_live_verification").select("heure_debut_reelle, coach_a_rejoint").eq("session_live_id", sl.id).eq("provider", "zoom").maybeSingle();
        const debut = v?.heure_debut_reelle ? new Date(v.heure_debut_reelle) : null;
        const fin = new Date();
        const dureeReelleMin = debut ? Math.round((fin - debut) / 60000) : 0;
        const { statut, motif } = await evaluerSuspicion(sl.id, dureeReelleMin, v?.coach_a_rejoint ?? false);
        await upsertVerification(sl.id, "zoom", { heure_fin_reelle: fin.toISOString(), duree_reelle_min: dureeReelleMin, statut, motif_suspicion: motif, raw_payload: payload });
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[webhook zoom]", e.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── MICROSOFT TEAMS ──────────────────────────────────────────────────────
// Configuration nécessaire (Azure Portal → App registration + abonnement
// Microsoft Graph créé côté serveur sur /communications/onlineMeetings) :
// TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_TENANT_ID, TEAMS_CLIENT_STATE
// (secret partagé vérifié dans chaque notification pour confirmer qu'elle
// vient bien de notre abonnement).
router.post("/teams", async (req, res) => {
  // Poignée de main de validation exigée par Microsoft Graph à la création
  // de l'abonnement (renvoie le token tel quel, en texte brut).
  if (req.query.validationToken) {
    res.set("Content-Type", "text/plain");
    return res.status(200).send(req.query.validationToken);
  }

  try {
    const notifications = req.body?.value || [];
    for (const n of notifications) {
      if (n.clientState !== process.env.TEAMS_CLIENT_STATE) {
        console.warn("[webhook teams] clientState invalide - notification ignorée");
        continue;
      }
      const meeting = n.resourceData;
      const joinUrl = meeting?.joinWebUrl || meeting?.joinUrl;
      const sl = await trouverSessionLiveParLien(joinUrl);
      if (!sl) continue;

      if (n.changeType === "created" || meeting?.startDateTime) {
        await upsertVerification(sl.id, "teams", { provider_meeting_id: meeting?.id || null, provider_join_url: joinUrl, heure_debut_reelle: meeting?.startDateTime || null, raw_payload: meeting });
      }
      if (meeting?.endDateTime) {
        const debut = meeting?.startDateTime ? new Date(meeting.startDateTime) : null;
        const fin = new Date(meeting.endDateTime);
        const dureeReelleMin = debut ? Math.round((fin - debut) / 60000) : 0;
        // Teams (attendanceReport) donnera la vraie liste de participants une fois
        // l'appel /onlineMeetings/{id}/attendanceReports interrogé - cf. TODO ci-dessous.
        const { statut, motif } = await evaluerSuspicion(sl.id, dureeReelleMin, null);
        await upsertVerification(sl.id, "teams", { heure_fin_reelle: fin.toISOString(), duree_reelle_min: dureeReelleMin, statut, motif_suspicion: motif, raw_payload: meeting });
      }
    }
    res.status(202).json({ ok: true });
  } catch (e) {
    console.error("[webhook teams]", e.message);
    res.status(500).json({ error: "Erreur interne" });
  }
});

// ── Lecture côté dash : statut de vérification d'une séance ──────────────
router.get("/sessions-live/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sessions_live_verification")
      .select("*")
      .eq("session_live_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ verifications: data || [] });
  } catch (e) {
    res.status(500).json({ error: "Erreur interne" });
  }
});

export default router;
