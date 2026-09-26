import { config } from "dotenv";
config({ path: "/Users/doumbisss/Desktop/dossier sans titre/binnie/Backend/.env" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function listAllAuthUsers() {
  let page = 1;
  const perPage = 1000;
  let all = [];
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) { console.error("auth listUsers error", error); break; }
    all = all.concat(data.users);
    if (data.users.length < perPage) break;
    page++;
  }
  return all;
}

async function countTable(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return { error: error.message };
  return { count };
}

async function countByRole(table, col) {
  // fetch just the column, paginate, aggregate client-side
  let from = 0;
  const pageSize = 1000;
  const counts = {};
  let total = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(col).range(from, from + pageSize - 1);
    if (error) return { error: error.message };
    if (!data || data.length === 0) break;
    for (const row of data) {
      const v = row[col] === null || row[col] === undefined ? "(null)" : row[col];
      counts[v] = (counts[v] || 0) + 1;
      total++;
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { counts, total };
}

async function main() {
  console.log("=== AUTH USERS ===");
  const authUsers = await listAllAuthUsers();
  console.log("Total auth users:", authUsers.length);
  const admin = authUsers.find(u => u.email === "admin@bet.ci");
  console.log("admin@bet.ci found:", !!admin, admin ? { id: admin.id, email: admin.email, created_at: admin.created_at } : null);
  // breakdown by email domain-ish / provider just in case
  console.log("\nSample of first 5 emails:", authUsers.slice(0,5).map(u=>u.email));

  console.log("\n=== utilisateurs table ===");
  const uCount = await countTable("utilisateurs");
  console.log("utilisateurs total count:", uCount);
  const roleBreakdown = await countByRole("utilisateurs", "role");
  console.log("utilisateurs by role:", JSON.stringify(roleBreakdown, null, 2));

  const tablesToCount = [
    "profils_admin",
    "profiles",
    "comptes_entreprises",
    "demandes_entreprise",
    "simulateurs_formation",
    "beneficiaires_entreprise",
    "classes_elearning_apprenants",
    "classes_elearning",
    "inscriptions_elearning",
    "inscriptions_adultes",
    "assignations_parcours",
    "groupes_apprenants",
    "groupes",
    "presences_privees",
    "notifications",
    "fichiers_prives",
    "groupes_fichiers",
    "versements",
    "paiements_entreprises",
    "paiements_offre",
    "paiements_parcours",
    "audit_logs",
    "plateforme_config",
    "permissions_roles",
    "parcours",
    "cours_elearning",
    "packages_commerciaux",
    "centres",
    "coachs",
    "entreprises_elearning",
    "seances_elearning",
    "seances_presences_privees",
    "devoirs_elearning",
    "evaluations_elearning",
    "evaluations_coach",
    "evaluations_coachs",
    "gamification_badges_v2",
    "level_tests",
    "level_test_attempts",
    "bet_level_tests",
    "bet_level_test_attempts",
    "tickets",
    "plaintes",
    "avis_offres",
    "avis_parents_coach_plateforme",
    "temoignages",
    "remplacements",
    "remplacements_delegations",
    "honoraires_elearning",
    "sessions_live",
    "planning_assistantes",
    "coach_disponibilites_mois",
    "archive_apprenants",
    "assignations_onboarding",
    "assignations_enfant",
    "profil_enfant",
    "contrats_prives",
    "config_contact",
    "boutique",
    "blog",
    "carousel",
    "faq",
    "marquee",
    "partenaires",
    "offre_media",
    "codes_promo",
    "corporate_b2b",
    "entreprise_documents",
  ];

  console.log("\n=== OTHER TABLES ===");
  for (const t of tablesToCount) {
    const r = await countTable(t);
    console.log(t, "=>", JSON.stringify(r));
  }
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
