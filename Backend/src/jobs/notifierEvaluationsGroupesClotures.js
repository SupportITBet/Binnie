// Équivalent dash de notifierDevoirsClotures.js - notifie les apprenants ET le coach du
// groupe quand la deadline d'une évaluation (devoir, examen/composition ou évaluation)
// vient d'être dépassée, que la correction ait été faite ou non. Les deadlines expirent
// silencieusement à l'heure dite, donc ce job scanne périodiquement les évaluations
// publiées dont la deadline vient de passer.
import supabase from "../config/supabase.js";
import { sendNotificationEmail } from "../services/emailService.js";

const INTERVALLE_MS = 15 * 60 * 1000; // 15 min

const LABEL_CATEGORIE = { devoir: "devoir", examen: "examen", evaluation: "évaluation", exercice: "exercice" };

async function notifierApprenantsGroupe(groupeId, { titre, message, meta }) {
  const { data: apprenants, error } = await supabase
    .from("groupes_apprenants")
    .select("apprenant_id")
    .eq("groupe_id", groupeId)
    .not("apprenant_id", "is", null)
    .neq("statut", "retire");
  if (error) { console.error("[notifierEvaluationsGroupesClotures] apprenants:", error.message); return; }
  const ids = [...new Set((apprenants || []).map(a => a.apprenant_id))];
  if (!ids.length) return;
  await supabase.from("notifications").insert(
    ids.map(user_id => ({ user_id, type: "devoir", titre, message, meta, source: "dash", lu: false }))
  );

  const { data: users } = await supabase.from("utilisateurs").select("email, prenom").in("id", ids);
  for (const u of users || []) {
    if (!u.email) continue;
    sendNotificationEmail({ prenom: u.prenom, email: u.email, titre, message, tag: "evaluation_cloturee" })
      .catch(err => console.error("[notifierEvaluationsGroupesClotures] email apprenant:", err.message));
  }
}

async function notifierCoachGroupe(evalu, nbRendus, nbTotal, meta) {
  let coachId = evalu.coach_id;
  if (!coachId) {
    const { data: groupe } = await supabase.from("groupes").select("coach_id").eq("id", evalu.groupe_id).maybeSingle();
    coachId = groupe?.coach_id || null;
  }
  if (!coachId) return;
  const label = LABEL_CATEGORIE[evalu.categorie] || "évaluation";
  const titre = "⏰ Deadline atteinte";
  const message = `${label.charAt(0).toUpperCase() + label.slice(1)} "${evalu.titre}" clôturé(e) - ${nbRendus}/${nbTotal} apprenant(s) ont rendu.`;
  await supabase.from("notifications").insert({
    user_id: coachId,
    type:    "devoir",
    titre,
    message,
    meta,
    source:  "dash",
    lu:      false,
  });

  const { data: coach } = await supabase.from("utilisateurs").select("email, prenom").eq("id", coachId).maybeSingle();
  if (coach?.email) {
    sendNotificationEmail({ prenom: coach.prenom, email: coach.email, titre, message, tag: "evaluation_cloturee" })
      .catch(err => console.error("[notifierEvaluationsGroupesClotures] email coach:", err.message));
  }
}

export async function notifierEvaluationsGroupesClotures() {
  try {
    const maintenant = new Date();
    const aujourdhui  = maintenant.toISOString().slice(0, 10);

    const { data: evaluations, error } = await supabase
      .from("evaluations_groupes")
      .select("id, titre, groupe_id, coach_id, categorie, date_evaluation, heure_debut")
      .eq("statut", "publie")
      .eq("deadline_notifiee", false)
      .not("date_evaluation", "is", null)
      .lte("date_evaluation", aujourdhui);
    if (error) { console.error("[notifierEvaluationsGroupesClotures]", error.message); return; }
    if (!evaluations?.length) return;

    const expirees = evaluations.filter(e => {
      const limite = new Date(`${e.date_evaluation}T${(e.heure_debut || "23:59").slice(0, 5)}:00`);
      return maintenant >= limite;
    });
    if (!expirees.length) return;

    for (const evalu of expirees) {
      const meta = { evaluation_id: evalu.id, groupe_id: evalu.groupe_id };
      const label = LABEL_CATEGORIE[evalu.categorie] || "évaluation";
      await notifierApprenantsGroupe(evalu.groupe_id, {
        titre:   "⏰ Deadline dépassée",
        message: `Le ${label} "${evalu.titre}" est maintenant clôturé(e) - la date limite est passée.`,
        meta,
      });

      const [{ count: nbTotal }, { count: nbRendus }] = await Promise.all([
        supabase.from("groupes_apprenants").select("id", { count: "exact", head: true })
          .eq("groupe_id", evalu.groupe_id).neq("statut", "retire"),
        supabase.from("resultats_evaluations_groupes").select("id", { count: "exact", head: true })
          .eq("evaluation_id", evalu.id),
      ]);
      await notifierCoachGroupe(evalu, nbRendus || 0, nbTotal || 0, meta);
    }

    await supabase
      .from("evaluations_groupes")
      .update({ deadline_notifiee: true })
      .in("id", expirees.map(e => e.id));

    console.log(`[notifierEvaluationsGroupesClotures] ${expirees.length} évaluation(s) clôturée(s) - apprenants + coach notifiés.`);
  } catch (err) {
    console.error("[notifierEvaluationsGroupesClotures] échec", err.message);
  }
}

export function demarrerNotificationEvaluationsGroupesClotures() {
  setTimeout(notifierEvaluationsGroupesClotures, 90 * 1000);
  setInterval(notifierEvaluationsGroupesClotures, INTERVALLE_MS);
}
