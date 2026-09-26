import { config } from "dotenv";
config();
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const tables = ["profiles","versements","paiements_offre","parcours","entreprises_elearning",
"seances_presences_privees","evaluations_coach","gamification_badges_v2","avis_parents_coach_plateforme",
"remplacements_delegations","honoraires_elearning","planning_assistantes","coach_disponibilites_mois",
"archive_apprenants","assignations_onboarding","assignations_enfant","profil_enfant","boutique","blog",
"carousel","faq","marquee","corporate_b2b"];

for (const t of tables) {
  const { count, error, status, statusText } = await supabase.from(t).select("*", { count: "exact", head: true });
  console.log(t, "count=", count, "error=", error ? error.message : null, "status=", status);
}
