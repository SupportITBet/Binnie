// Job mensuel - gamification des coachs (dash). Miroir de gamificationCoachMensuel.js
// (bet-elearning) avec ses propres tables et ses propres sources (groupes au lieu de
// classes_elearning, honoraires_mois au lieu de honoraires_elearning_mois).
import supabase from "../config/supabase.js";
import { attribuerPointsCoachDash, debloquerBadgeCoachDash, recalculerStatsCoachDash } from "../services/gamificationCoachDash.js";

const PLATEFORME = "dash";
const INTERVALLE_MS = 24 * 60 * 60 * 1000;

function moisPrecedent() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return { mois: d.getUTCMonth() + 1, annee: d.getUTCFullYear(), debut: new Date(d), fin: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) };
}

async function bonusRegularite(coachId) {
  const { data } = await supabase.from("rapports_observation")
    .select("note_globale").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .not("note_globale", "is", null).order("date_observation", { ascending: false }).limit(3);
  if ((data || []).length === 3 && data.every(r => parseFloat(r.note_globale) >= 4.5)) {
    const trimestre = Math.ceil((new Date().getUTCMonth() + 1) / 3);
    await attribuerPointsCoachDash(coachId, "regularite", `${new Date().getUTCFullYear()}-T${trimestre}`, 50, "Régularité - 3 rapports consécutifs ≥ 4,5/5");
  }
}

async function bonusMoisSansAnomalie(coachId, periode) {
  const { data } = await supabase.from("anomalies_superviseur")
    .select("id").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .gte("created_at", periode.debut.toISOString()).lt("created_at", periode.fin.toISOString()).limit(1);
  if (!data?.length) {
    await attribuerPointsCoachDash(coachId, "mois_sans_anomalie", `${periode.annee}-${periode.mois}`, 10, `Aucune anomalie - ${periode.mois}/${periode.annee}`);
  }
}

async function bonusRemplacementsUrgents(coachId, periode) {
  const { data: remplacements } = await supabase
    .from("remplacements")
    .select("id, groupe_id, date_debut, created_at")
    .eq("remplacant_id", coachId)
    .not("groupe_id", "is", null)
    .gte("created_at", periode.debut.toISOString()).lt("created_at", periode.fin.toISOString());
  if (!remplacements?.length) return;

  const groupeIds = [...new Set(remplacements.map(r => r.groupe_id))];
  const { data: groupes } = await supabase.from("groupes").select("id").in("id", groupeIds);
  const groupeIdsDash = new Set((groupes || []).map(g => g.id));

  const urgents = remplacements.filter(r =>
    groupeIdsDash.has(r.groupe_id) &&
    r.date_debut && (new Date(r.date_debut).getTime() - new Date(r.created_at).getTime()) < 24 * 3600 * 1000
  ).slice(0, 2);

  for (const r of urgents) {
    await attribuerPointsCoachDash(coachId, "remplacement_urgence", r.id, 25, "Remplacement d'urgence honoré");
  }

  const { data: tousRemplacements } = await supabase
    .from("remplacements").select("id, groupe_id, date_debut, created_at")
    .eq("remplacant_id", coachId).not("groupe_id", "is", null);
  const groupeIdsAll = [...new Set((tousRemplacements || []).map(r => r.groupe_id))];
  const { data: groupesAll } = groupeIdsAll.length
    ? await supabase.from("groupes").select("id").in("id", groupeIdsAll)
    : { data: [] };
  const groupeIdsAllDash = new Set((groupesAll || []).map(g => g.id));
  const remplacementsDash = (tousRemplacements || []).filter(r => groupeIdsAllDash.has(r.groupe_id));
  const nbUrgentsTotal = remplacementsDash.filter(r =>
    r.date_debut && (new Date(r.date_debut).getTime() - new Date(r.created_at).getTime()) < 24 * 3600 * 1000
  ).length;
  if (nbUrgentsTotal >= 2)           await debloquerBadgeCoachDash(coachId, "depanneur");
  if (remplacementsDash.length >= 10) await debloquerBadgeCoachDash(coachId, "increvable");
}

async function bonusHonorairesValides(coachId, periode) {
  const { data } = await supabase.from("honoraires_mois")
    .select("statut").eq("coach_id", coachId).eq("mois", periode.mois).eq("annee", periode.annee).maybeSingle();
  if (data?.statut === "valide") {
    await attribuerPointsCoachDash(coachId, "honoraires_valides", `${periode.annee}-${periode.mois}`, 5, `Honoraires validés - ${periode.mois}/${periode.annee}`);
  }
}

async function badgesAnciennete(coachId, dateCreation) {
  if (!dateCreation) return;
  const joursDepuis = Math.floor((Date.now() - new Date(dateCreation).getTime()) / 86400000);
  if (joursDepuis >= 180) await debloquerBadgeCoachDash(coachId, "six_mois_engagement");
  if (joursDepuis >= 365) await debloquerBadgeCoachDash(coachId, "un_an_avec_bet");
  if (joursDepuis >= 730) await debloquerBadgeCoachDash(coachId, "veteran_coach");
}

async function badgeZeroAnomalieSixMois(coachId) {
  const depuis = new Date();
  depuis.setUTCMonth(depuis.getUTCMonth() - 6);
  const { data } = await supabase.from("anomalies_superviseur")
    .select("id").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .gte("created_at", depuis.toISOString()).neq("statut", "fermé").limit(1);
  if (!data?.length) await debloquerBadgeCoachDash(coachId, "zero_anomalie");
}

export async function runGamificationCoachMensuelDash() {
  try {
    const periode = moisPrecedent();
    const { data: coachs, error } = await supabase
      .from("utilisateurs").select("id, date_creation")
      .eq("role", "coach").eq("actif", true);
    if (error) { console.error("[gamificationCoachMensuelDash]", error.message); return; }
    if (!coachs?.length) return;

    for (const coach of coachs) {
      await bonusRegularite(coach.id);
      await bonusMoisSansAnomalie(coach.id, periode);
      await bonusRemplacementsUrgents(coach.id, periode);
      await bonusHonorairesValides(coach.id, periode);
      await badgesAnciennete(coach.id, coach.date_creation);
      await badgeZeroAnomalieSixMois(coach.id);
      await recalculerStatsCoachDash(coach.id);
    }

    const { data: stats } = await supabase
      .from("stats_gamif_coach_dash").select("coach_id, score_glissant").order("score_glissant", { ascending: false });
    if (stats?.length) {
      for (let i = 0; i < stats.length; i++) {
        await supabase.from("stats_gamif_coach_dash").update({ rang: i + 1 }).eq("coach_id", stats[i].coach_id);
      }
      await debloquerBadgeCoachDash(stats[0].coach_id, "coach_du_mois");
    }

    console.log(`[gamificationCoachMensuelDash] ${coachs.length} coach(s) recalculé(s) pour ${periode.mois}/${periode.annee}.`);
  } catch (err) {
    console.error("[gamificationCoachMensuelDash] échec", err.message);
  }
}

export function demarrerGamificationCoachMensuelDash() {
  setTimeout(runGamificationCoachMensuelDash, 150 * 1000);
  setInterval(runGamificationCoachMensuelDash, INTERVALLE_MS);
}
