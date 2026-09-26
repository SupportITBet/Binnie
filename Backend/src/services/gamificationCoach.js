import supabase from "../config/supabase.js";

// ══════════════════════════════════════════════════════════════════════
// Moteur de gamification des COACHS - bet-elearning uniquement pour l'instant.
// Voir Backend/docs/gamification-coachs.html pour le détail complet du design.
//
// Deux familles de points :
//  1. Temps réel - déclenchés au moment de l'événement (transmission d'un
//     rapport, soumission d'un avis parent) : voir onRapportTransmis /
//     onAvisParentSoumis, appelés directement depuis les routes concernées.
//  2. Mensuels - calculés en batch par le job (voir jobs/gamificationCoachMensuel.js) :
//     régularité, mois sans anomalie, remplacements d'urgence, honoraires validés,
//     badges d'ancienneté/paliers/classement.
// ══════════════════════════════════════════════════════════════════════

const PLATEFORME = "bet-elearning";

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

// Insertion idempotente - l'index unique (coach_id, source_type, source_id) empêche tout
// doublon si le job ou un hook est rejoué sur le même événement source.
export async function attribuerPointsCoach(coachId, sourceType, sourceId, points, description) {
  if (!coachId || !points) return;
  try {
    const { error } = await supabase.from("points_coach").insert({
      coach_id: coachId, source_type: sourceType, source_id: sourceId ? String(sourceId) : null,
      points, description, plateforme: PLATEFORME,
    });
    // 23505 = violation de contrainte unique → déjà attribué, silencieux (pas une erreur).
    if (error && error.code !== "23505") throw error;
  } catch (err) {
    console.error("[gamificationCoach] attribuerPointsCoach", err.message);
  }
}

export async function debloquerBadgeCoach(coachId, code) {
  try {
    const { data: badge } = await supabase.from("badges_coach").select("id, nom, icone, description").eq("code", code).maybeSingle();
    if (!badge) return;
    const { data: deja } = await supabase.from("badges_coach_obtenus").select("id").eq("coach_id", coachId).eq("badge_id", badge.id).maybeSingle();
    if (deja) return;
    await supabase.from("badges_coach_obtenus").insert({ coach_id: coachId, badge_id: badge.id });
    await supabase.from("notifications").insert({
      user_id: coachId, type: "badge_coach_obtenu",
      titre:   `${badge.icone} Nouveau badge : ${badge.nom}`,
      message: badge.description,
      source:  PLATEFORME, lu: false,
    });
  } catch (err) {
    console.error("[gamificationCoach] debloquerBadgeCoach", err.message);
  }
}

// Recalcule le score glissant (3 derniers mois), le palier et l'éligibilité Or/Platine
// (bloquée par une anomalie superviseur encore ouverte) pour un coach donné.
export async function recalculerStatsCoach(coachId) {
  try {
    const depuis = new Date();
    depuis.setUTCMonth(depuis.getUTCMonth() - 3);

    const { data: transactions } = await supabase
      .from("points_coach")
      .select("points")
      .eq("coach_id", coachId)
      .gte("created_at", depuis.toISOString());
    const score = Math.max(0, Math.min(100, (transactions || []).reduce((s, t) => s + t.points, 0)));

    const { data: anomalie } = await supabase
      .from("anomalies_superviseur")
      .select("id").eq("coach_id", coachId).eq("plateforme", PLATEFORME).neq("statut", "fermé").limit(1).maybeSingle();
    const eligibleOrPlatine = !anomalie;

    const palier = determinerPalier(score, eligibleOrPlatine);

    await supabase.from("stats_gamif_coach").upsert({
      coach_id: coachId, score_glissant: score, palier,
      eligible_or_platine: eligibleOrPlatine, derniere_maj: new Date().toISOString(),
    }, { onConflict: "coach_id" });

    if (palier === "argent")  await debloquerBadgeCoach(coachId, "palier_argent");
    if (palier === "or")      await debloquerBadgeCoach(coachId, "palier_or");
    if (palier === "platine") await debloquerBadgeCoach(coachId, "palier_platine");

    return { score, palier };
  } catch (err) {
    console.error("[gamificationCoach] recalculerStatsCoach", err.message);
    return null;
  }
}

// ── Hook temps réel : rapport d'observation transmis au PA ──────────────────
export async function onRapportTransmis(rapport) {
  if (!rapport?.coach_id || rapport.note_globale == null) return;
  const note = parseFloat(rapport.note_globale);
  let points = null, desc = null;
  if (note >= 4.5)      { points = 30; desc = `Rapport superviseur transmis - note ${note}/5`; }
  else if (note >= 3.5) { points = 15; desc = `Rapport superviseur transmis - note ${note}/5`; }
  else if (note < 2.5)  { points = -10; desc = `Rapport superviseur transmis - note ${note}/5 (faible)`; }
  if (points === null) return;

  await attribuerPointsCoach(rapport.coach_id, "rapport_superviseur", rapport.id, points, desc);
  if (note === 5) await debloquerBadgeCoach(rapport.coach_id, "sans_faute");
  await debloquerBadgeCoach(rapport.coach_id, "premier_rapport");
  if (rapport.ponctualite === 5) await verifierBadgePonctualite(rapport.coach_id);
  await verifierBadgeRegulierEtPedagogue(rapport.coach_id);
  await recalculerStatsCoach(rapport.coach_id);
}

async function verifierBadgePonctualite(coachId) {
  const { data } = await supabase.from("rapports_observation")
    .select("ponctualite").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .order("date_observation", { ascending: false }).limit(5);
  if ((data || []).length === 5 && data.every(r => r.ponctualite === 5)) {
    await debloquerBadgeCoach(coachId, "toujours_a_lheure");
  }
}

async function verifierBadgeRegulierEtPedagogue(coachId) {
  const { data } = await supabase.from("rapports_observation")
    .select("note_globale, pedagogie").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .order("date_observation", { ascending: false }).limit(10);
  const rapports = data || [];
  if (rapports.length >= 3 && rapports.slice(0, 3).every(r => parseFloat(r.note_globale) >= 4.5)) {
    await debloquerBadgeCoach(coachId, "regulier");
  }
  if (rapports.length >= 10) {
    const moyPedagogie = rapports.reduce((s, r) => s + (r.pedagogie || 0), 0) / rapports.length;
    if (moyPedagogie >= 4.5) await debloquerBadgeCoach(coachId, "pedagogue_confirme");
  }
}

// ── Hook temps réel : avis parent soumis ─────────────────────────────────────
// avis = ligne avis_parents_coach { id, coach_id (résolu par l'appelant via la classe), q1..q5 }
export async function onAvisParentSoumis(avis) {
  if (!avis?.coach_id) return;
  const moy = (avis.q1 + avis.q2 + avis.q3 + avis.q4 + avis.q5) / 5;
  let points = null;
  if (moy >= 4.5)      points = 20;
  else if (moy >= 3.5) points = 10;
  if (points !== null) {
    await attribuerPointsCoach(avis.coach_id, "avis_parent", avis.id, points, `Avis parent - moyenne ${moy.toFixed(1)}/5`);
  }
  await debloquerBadgeCoach(avis.coach_id, "premier_avis_parent");
  if (moy === 5) await debloquerBadgeCoach(avis.coach_id, "coup_de_coeur_parents");
  // q2 = disponibilité, q5 = progression (voir libellés dans DashboardParent.jsx / DashboardAdmin.jsx)
  if (avis.q2 === 5) await verifierBadgeDisponibilite(avis.coach_id);
  await verifierBadgeProgres(avis.coach_id);
  await recalculerStatsCoach(avis.coach_id);
}

async function verifierBadgeDisponibilite(coachId) {
  const { data } = await supabase.from("avis_parents_coach")
    .select("q2").eq("coach_id", coachId).order("created_at", { ascending: false }).limit(5);
  if ((data || []).length === 5 && data.every(a => a.q2 === 5)) {
    await debloquerBadgeCoach(coachId, "toujours_disponible");
  }
}

async function verifierBadgeProgres(coachId) {
  const { data } = await supabase.from("avis_parents_coach")
    .select("q5").eq("coach_id", coachId).order("created_at", { ascending: false }).limit(3);
  if ((data || []).length === 3 && data.every(a => a.q5 >= 4.5)) {
    await debloquerBadgeCoach(coachId, "progres_reconnu");
  }
}

export { PLATEFORME };
