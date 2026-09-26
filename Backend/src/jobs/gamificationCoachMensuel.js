// Job mensuel - gamification des coachs (bet-elearning). Calcule les bonus qui ne peuvent pas
// être déclenchés en temps réel (régularité, mois sans anomalie, remplacements d'urgence,
// honoraires validés), les badges liés à l'ancienneté/aux paliers, et le classement mensuel.
// Voir Backend/docs/gamification-coachs.html pour le détail du design.
import supabase from "../config/supabase.js";
import { attribuerPointsCoach, debloquerBadgeCoach, recalculerStatsCoach } from "../services/gamificationCoach.js";

const PLATEFORME = "bet-elearning";
const INTERVALLE_MS = 24 * 60 * 60 * 1000; // 1x/jour - idempotent, donc pas grave si rejoué

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
    const { annee, mois } = moisPrecedent();
    // Un seul bonus par trimestre glissant - clé sur le trimestre civil courant.
    const trimestre = Math.ceil((new Date().getUTCMonth() + 1) / 3);
    await attribuerPointsCoach(coachId, "regularite", `${new Date().getUTCFullYear()}-T${trimestre}`, 50, "Régularité - 3 rapports consécutifs ≥ 4,5/5");
  }
}

async function bonusMoisSansAnomalie(coachId, periode) {
  const { data } = await supabase.from("anomalies_superviseur")
    .select("id").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .gte("created_at", periode.debut.toISOString()).lt("created_at", periode.fin.toISOString()).limit(1);
  if (!data?.length) {
    await attribuerPointsCoach(coachId, "mois_sans_anomalie", `${periode.annee}-${periode.mois}`, 10, `Aucune anomalie - ${periode.mois}/${periode.annee}`);
  }
}

async function bonusRemplacementsUrgents(coachId, periode) {
  // Table remplacements partagée dash/bet-elearning (pas de colonne plateforme) - on ne
  // retient que les remplacements dont groupe_id correspond à une classe bet-elearning.
  const { data: remplacements } = await supabase
    .from("remplacements")
    .select("id, groupe_id, date_debut, created_at, statut")
    .eq("remplacant_id", coachId)
    .not("groupe_id", "is", null)
    .gte("created_at", periode.debut.toISOString()).lt("created_at", periode.fin.toISOString());
  if (!remplacements?.length) return;

  const groupeIds = [...new Set(remplacements.map(r => r.groupe_id))];
  const { data: classes } = await supabase.from("classes_elearning").select("id").in("id", groupeIds);
  const classeIdsBet = new Set((classes || []).map(c => c.id));

  const urgents = remplacements.filter(r =>
    classeIdsBet.has(r.groupe_id) &&
    r.date_debut && (new Date(r.date_debut).getTime() - new Date(r.created_at).getTime()) < 24 * 3600 * 1000
  ).slice(0, 2); // plafond 2/mois

  for (const r of urgents) {
    await attribuerPointsCoach(coachId, "remplacement_urgence", r.id, 25, "Remplacement d'urgence honoré");
  }

  // Badges terrain & disponibilité - comptage all-time, pas seulement le mois écoulé.
  const { data: tousRemplacements } = await supabase
    .from("remplacements").select("id, groupe_id, date_debut, created_at")
    .eq("remplacant_id", coachId).not("groupe_id", "is", null);
  const groupeIdsAll = [...new Set((tousRemplacements || []).map(r => r.groupe_id))];
  const { data: classesAll } = groupeIdsAll.length
    ? await supabase.from("classes_elearning").select("id").in("id", groupeIdsAll)
    : { data: [] };
  const classeIdsAllBet = new Set((classesAll || []).map(c => c.id));
  const remplacementsBet = (tousRemplacements || []).filter(r => classeIdsAllBet.has(r.groupe_id));
  const nbUrgentsTotal = remplacementsBet.filter(r =>
    r.date_debut && (new Date(r.date_debut).getTime() - new Date(r.created_at).getTime()) < 24 * 3600 * 1000
  ).length;
  if (nbUrgentsTotal >= 2)              await debloquerBadgeCoach(coachId, "depanneur");
  if (remplacementsBet.length >= 10)    await debloquerBadgeCoach(coachId, "increvable");
}

async function bonusHonorairesValides(coachId, periode) {
  const { data } = await supabase.from("honoraires_elearning_mois")
    .select("statut").eq("coach_id", coachId).eq("mois", periode.mois).eq("annee", periode.annee).maybeSingle();
  if (data && ["valide", "paye"].includes(data.statut)) {
    await attribuerPointsCoach(coachId, "honoraires_valides", `${periode.annee}-${periode.mois}`, 5, `Honoraires validés sans litige - ${periode.mois}/${periode.annee}`);
  }
}

async function badgesAnciennete(coachId, dateCreation) {
  if (!dateCreation) return;
  const joursDepuis = Math.floor((Date.now() - new Date(dateCreation).getTime()) / 86400000);
  if (joursDepuis >= 180) await debloquerBadgeCoach(coachId, "six_mois_engagement");
  if (joursDepuis >= 365) await debloquerBadgeCoach(coachId, "un_an_avec_bet");
  if (joursDepuis >= 730) await debloquerBadgeCoach(coachId, "veteran_coach");
}

async function badgeZeroAnomalieSixMois(coachId) {
  const depuis = new Date();
  depuis.setUTCMonth(depuis.getUTCMonth() - 6);
  const { data } = await supabase.from("anomalies_superviseur")
    .select("id").eq("coach_id", coachId).eq("plateforme", PLATEFORME)
    .gte("created_at", depuis.toISOString()).neq("statut", "fermé").limit(1);
  if (!data?.length) await debloquerBadgeCoach(coachId, "zero_anomalie");
}

export async function runGamificationCoachMensuel() {
  try {
    const periode = moisPrecedent();
    const { data: coachs, error } = await supabase
      .from("utilisateurs").select("id, date_creation")
      .eq("role", "coach").eq("actif", true).eq("acces_elearning", true);
    if (error) { console.error("[gamificationCoachMensuel]", error.message); return; }
    if (!coachs?.length) return;

    for (const coach of coachs) {
      await bonusRegularite(coach.id);
      await bonusMoisSansAnomalie(coach.id, periode);
      await bonusRemplacementsUrgents(coach.id, periode);
      await bonusHonorairesValides(coach.id, periode);
      await badgesAnciennete(coach.id, coach.date_creation);
      await badgeZeroAnomalieSixMois(coach.id);
      await recalculerStatsCoach(coach.id);
    }

    // Classement mensuel - rang par score glissant décroissant.
    const { data: stats } = await supabase
      .from("stats_gamif_coach").select("coach_id, score_glissant").order("score_glissant", { ascending: false });
    if (stats?.length) {
      for (let i = 0; i < stats.length; i++) {
        await supabase.from("stats_gamif_coach").update({ rang: i + 1 }).eq("coach_id", stats[i].coach_id);
      }
      await debloquerBadgeCoach(stats[0].coach_id, "coach_du_mois");
    }

    console.log(`[gamificationCoachMensuel] ${coachs.length} coach(s) recalculé(s) pour ${periode.mois}/${periode.annee}.`);
  } catch (err) {
    console.error("[gamificationCoachMensuel] échec", err.message);
  }
}

export function demarrerGamificationCoachMensuel() {
  setTimeout(runGamificationCoachMensuel, 120 * 1000);
  setInterval(runGamificationCoachMensuel, INTERVALLE_MS);
}
