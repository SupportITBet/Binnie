// Notifie les apprenants ET le coach de la classe quand la deadline d'un devoir vient d'être
// dépassée - que le devoir ait été rendu ou non. Les deadlines ne sont jamais "clôturées" par
// une action manuelle du coach (contrairement aux séances) : elles expirent silencieusement à
// l'heure dite, donc ce job scanne périodiquement les devoirs publiés dont la deadline vient
// de passer.
import supabase from "../config/supabase.js";
import { sendNotificationEmail } from "../services/emailService.js";

const INTERVALLE_MS = 15 * 60 * 1000; // 15 min - suffisant, une deadline n'est jamais "urgente à la minute près"

// ⚠️ Ne PAS utiliser notifyRole(['apprenant'], ...) : le rôle "apprenant" est partagé avec
// dash en base - cibler classes_elearning_apprenants garantit qu'on ne notifie que les vrais
// comptes apprenants de la classe concernée sur bet-elearning.
async function notifierApprenantsClasse(classeId, { titre, message, meta }) {
  const { data: apprenants, error } = await supabase
    .from("classes_elearning_apprenants")
    .select("apprenant_id")
    .eq("classe_id", classeId)
    .not("apprenant_id", "is", null)
    .neq("statut", "suspendu");
  if (error) { console.error("[notifierDevoirsClotures] apprenants:", error.message); return; }
  const ids = [...new Set((apprenants || []).map(a => a.apprenant_id))];
  if (!ids.length) return;
  await supabase.from("notifications").insert(
    ids.map(user_id => ({ user_id, type: "devoir", titre, message, meta, source: "bet-elearning", lu: false }))
  );

  const { data: users } = await supabase.from("utilisateurs").select("email, prenom").in("id", ids);
  for (const u of users || []) {
    if (!u.email) continue;
    sendNotificationEmail({ prenom: u.prenom, email: u.email, titre, message, tag: "devoir_cloture" })
      .catch(err => console.error("[notifierDevoirsClotures] email apprenant:", err.message));
  }
}

async function notifierCoachClasse(classeId, nbRendus, nbTotal, { titre: titreDevoir, meta }) {
  const { data: classe } = await supabase
    .from("classes_elearning").select("coach_id, nom").eq("id", classeId).maybeSingle();
  if (!classe?.coach_id) return;
  const titre = "⏰ Deadline devoir atteinte";
  const message = `Le devoir "${titreDevoir}" (${classe.nom || "classe"}) est clôturé - ${nbRendus}/${nbTotal} apprenant(s) ont rendu.`;
  await supabase.from("notifications").insert({
    user_id: classe.coach_id,
    type:    "devoir",
    titre,
    message,
    meta,
    source:  "bet-elearning",
    lu:      false,
  });

  const { data: coach } = await supabase.from("utilisateurs").select("email, prenom").eq("id", classe.coach_id).maybeSingle();
  if (coach?.email) {
    sendNotificationEmail({ prenom: coach.prenom, email: coach.email, titre, message, tag: "devoir_cloture" })
      .catch(err => console.error("[notifierDevoirsClotures] email coach:", err.message));
  }
}

export async function notifierDevoirsClotures() {
  try {
    const maintenant = new Date();
    const aujourdhui  = maintenant.toISOString().slice(0, 10);

    // Pré-filtre large côté DB (date_limite ≤ aujourd'hui) - la comparaison heure précise se
    // fait ensuite en JS pour composer correctement date + heure_limite.
    const { data: devoirs, error } = await supabase
      .from("devoirs_elearning")
      .select("id, titre, classe_id, date_limite, heure_limite")
      .eq("statut", "publie")
      .eq("deadline_notifiee", false)
      .not("date_limite", "is", null)
      .lte("date_limite", aujourdhui);
    if (error) { console.error("[notifierDevoirsClotures]", error.message); return; }
    if (!devoirs?.length) return;

    const expires = devoirs.filter(d => {
      const limite = new Date(`${d.date_limite}T${(d.heure_limite || "23:59").slice(0, 5)}:00`);
      return maintenant >= limite;
    });
    if (!expires.length) return;

    for (const devoir of expires) {
      const meta = { devoir_id: devoir.id, classe_id: devoir.classe_id };
      await notifierApprenantsClasse(devoir.classe_id, {
        titre:   "⏰ Deadline dépassée",
        message: `Le devoir "${devoir.titre}" est maintenant clôturé - la date limite est passée.`,
        meta,
      });

      const [{ count: nbTotal }, { count: nbRendus }] = await Promise.all([
        supabase.from("classes_elearning_apprenants").select("id", { count: "exact", head: true })
          .eq("classe_id", devoir.classe_id).neq("statut", "suspendu"),
        supabase.from("devoirs_rendus_elearning").select("id", { count: "exact", head: true })
          .eq("devoir_id", devoir.id),
      ]);
      await notifierCoachClasse(devoir.classe_id, nbRendus || 0, nbTotal || 0, { titre: devoir.titre, meta });
    }

    await supabase
      .from("devoirs_elearning")
      .update({ deadline_notifiee: true })
      .in("id", expires.map(d => d.id));

    console.log(`[notifierDevoirsClotures] ${expires.length} devoir(s) clôturé(s) - apprenants notifiés.`);
  } catch (err) {
    console.error("[notifierDevoirsClotures] échec", err.message);
  }
}

export function demarrerNotificationDevoirsClotures() {
  setTimeout(notifierDevoirsClotures, 60 * 1000);
  setInterval(notifierDevoirsClotures, INTERVALLE_MS);
}
