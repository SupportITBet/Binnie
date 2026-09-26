import supabase from "../config/supabase.js";

// ══════════════════════════════════════════════════════════════════════
// Moteur de gamification des COACHS - dash. Miroir exact de gamificationCoach.js
// (bet-elearning) mais avec ses propres tables (points_coach_dash,
// badges_coach_obtenus_dash, stats_gamif_coach_dash) - les deux plateformes ne
// partagent pas la même donnée de gamification coach, à la demande explicite.
// Seul le catalogue de badges (badges_coach, statique) est commun.
// Voir Backend/docs/gamification-coachs.html pour le détail du design.
// ══════════════════════════════════════════════════════════════════════

const PLATEFORME = "dash";

const SEUILS_PALIER = [
  { palier: "platine", min: 85 },
  { palier: "or",      min: 65 },
  { palier: "argent",  min: 40 },
  { palier: "bronze",  min: 0  },
];

function determinerPalier(score, eligibleOrPlatine) {
  for (const s of SEUILS_PALIER) {
    if (score >= s.min) {
      if ((s.palier === "or" || s.palier === "platine") && !eligibleOrPlatine) continue;
      return s.palier;
    }
  }
  return "bronze";
}

export async function attribuerPointsCoachDash(coachId, sourceType, sourceId, points, description) {
  if (!coachId || !points) return;
  try {
    const { error } = await supabase.from("points_coach_dash").insert({
      coach_id: coachId, source_type: sourceType, source_id: sourceId ? String(sourceId) : null,
      points, description,
    });
    if (error && error.code !== "23505") throw error;
  } catch (err) {
    console.error("[gamificationCoachDash] attribuerPointsCoachDash", err.message);
  }
}

export async function debloquerBadgeCoachDash(coachId, code) {
  try {
    const { data: badge } = await supabase.from("badges_coach").select("id, nom, icone, description").eq("code", code).maybeSingle();
    if (!badge) return;
    const { data: deja } = await supabase.from("badges_coach_obtenus_dash").select("id").eq("coach_id", coachId).eq("badge_id", badge.id).maybeSingle();
    if (deja) return;
    await supabase.from("badges_coach_obtenus_dash").insert({ coach_id: coachId, badge_id: badge.id });
    await supabase.from("notifications").insert({
      user_id: coachId, type: "badge_coach_obtenu",
      titre:   `${badge.icone} Nouveau badge : ${badge.nom}`,
      message: badge.description,
      source:  PLATEFORME, lu: false,
    });
  } catch (err) {
    console.error("[gamificationCoachDash] debloquerBadgeCoachDash", err.message);
  }
}

export async function recalculerStatsCoachDash(coachId) {
  try {
    const depuis = new Date();
    depuis.setUTCMonth(depuis.getUTCMonth() - 3);

    const { data: transactions } = await supabase
      .from("points_coach_dash")
      .select("points")
      .eq("coach_id", coachId)
      .gte("created_at", depuis.toISOString());
    const score = Math.max(0, Math.min(100, (transactions || []).reduce((s, t) => s + t.points, 0)));

    const { data: anomalie } = await supabase
      .from("anomalies_superviseur")
      .select("id").eq("coach_id", coachId).eq("plateforme", PLATEFORME).neq("statut", "fermé").limit(1).maybeSingle();
    const eligibleOrPlatine = !anomalie;

    const palier = determinerPalier(score, eligibleOrPlatine);

    await supabase.from("stats_gamif_coach_dash").upsert({
      coach_id: coachId, score_glissant: score, palier,
      eligible_or_platine: eligibleOrPlatine, derniere_maj: new Date().toISOString(),
    }, { onConflict: "coach_id" });

    if (palier === "argent")  await debloquerBadgeCoachDash(coachId, "palier_argent");
    if (palier === "or")      await debloquerBadgeCoachDash(coachId, "palier_or");
    if (palier === "platine") await debloquerBadgeCoachDash(coachId, "palier_platine");

    return { score, palier };
  } catch (err) {
    console.error("[gamificationCoachDash] recalculerStatsCoachDash", err.message);
    return null;
  }
}

// ── Hook temps réel : rapport d'observation transmis au PA ──────────────────
export async function onRapportTransmisDash(rapport) {
  if (!rapport?.coach_id || rapport.note_globale == null) return;
  const note = parseFloat(rapport.note_globale);
  let points = null, desc = null;
  if (note >= 4.5)      { points = 30; desc = `Rapport superviseur transmis - note ${note}/5`; }
  else if (note >= 3.5) { points = 15; desc = `Rapport superviseur transmis - note ${note}/5`; }
  else if (note < 2.5)  { points = -10; desc = `Rapport superviseur transmis - note ${note}/5 (faible)`; }
  if (points === null) return;

  await attribuerPointsCoachDash(rapport.coach_id, "rapport_superviseur", rapport.id, points, desc);
  if (note === 5) await debloquerBadgeCoachDash(rapport.coach_id, "sans_faute");
  await debloquerBadgeCoachDash(rapport.coach_id, "premier_rapport");
  if (rapport.ponctualite === 5) await verifierBadgePonctualiteDash(rapport.coach_id);
  await verifierBadgeRegulierEtPedagogueDash(rapport.coach_id);
  await recalculerStatsCoachDash(rapport.coach_id);
}

async function verifierBadgePonctualiteDash(coachId) {
  const { data } = await supabase.from("rapports_observation")
    .select("ponctualite").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .order("date_observation", { ascending: false }).limit(5);
  if ((data || []).length === 5 && data.every(r => r.ponctualite === 5)) {
    await debloquerBadgeCoachDash(coachId, "toujours_a_lheure");
  }
}

async function verifierBadgeRegulierEtPedagogueDash(coachId) {
  const { data } = await supabase.from("rapports_observation")
    .select("note_globale, pedagogie").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .order("date_observation", { ascending: false }).limit(10);
  const rapports = data || [];
  if (rapports.length >= 3 && rapports.slice(0, 3).every(r => parseFloat(r.note_globale) >= 4.5)) {
    await debloquerBadgeCoachDash(coachId, "regulier");
  }
  if (rapports.length >= 10) {
    const moyPedagogie = rapports.reduce((s, r) => s + (r.pedagogie || 0), 0) / rapports.length;
    if (moyPedagogie >= 4.5) await debloquerBadgeCoachDash(coachId, "pedagogue_confirme");
  }
}

// ── Hook temps réel : avis parent soumis ─────────────────────────────────────
export async function onAvisParentSoumisDash(avis) {
  if (!avis?.coach_id) return;
  const moy = (avis.q1 + avis.q2 + avis.q3 + avis.q4 + avis.q5) / 5;
  let points = null;
  if (moy >= 4.5)      points = 20;
  else if (moy >= 3.5) points = 10;
  if (points !== null) {
    await attribuerPointsCoachDash(avis.coach_id, "avis_parent", avis.id, points, `Avis parent - moyenne ${moy.toFixed(1)}/5`);
  }
  await debloquerBadgeCoachDash(avis.coach_id, "premier_avis_parent");
  if (moy === 5) await debloquerBadgeCoachDash(avis.coach_id, "coup_de_coeur_parents");
  if (avis.q2 === 5) await verifierBadgeDisponibiliteDash(avis.coach_id);
  await verifierBadgeProgresDash(avis.coach_id);
  await recalculerStatsCoachDash(avis.coach_id);
}

async function verifierBadgeDisponibiliteDash(coachId) {
  const { data } = await supabase.from("avis_parents_coach")
    .select("q2").eq("coach_id", coachId).order("created_at", { ascending: false }).limit(5);
  if ((data || []).length === 5 && data.every(a => a.q2 === 5)) {
    await debloquerBadgeCoachDash(coachId, "toujours_disponible");
  }
}

async function verifierBadgeProgresDash(coachId) {
  const { data } = await supabase.from("avis_parents_coach")
    .select("q5").eq("coach_id", coachId).order("created_at", { ascending: false }).limit(3);
  if ((data || []).length === 3 && data.every(a => a.q5 >= 4.5)) {
    await debloquerBadgeCoachDash(coachId, "progres_reconnu");
  }
}

export { PLATEFORME };
