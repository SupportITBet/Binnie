/**
 * Script de réparation : remet app_metadata.role = 'coach' pour les coachs
 * dont le rôle a été corrompu en 'professeur_titulaire' ou 'professeur_remplacant'.
 *
 * Usage : node repair_coach_app_metadata.js
 */

import supabase from "../src/config/supabase.js";

const ROLES_CORROMPUS = ["professeur_titulaire", "professeur_remplacant"];

async function reparer() {
  console.log("🔍 Recherche des coachs avec app_metadata corrompu...");

  // 1. Lister les utilisateurs en DB avec role 'coach' ou type_coach non null
  const { data: utilisateurs, error } = await supabase
    .from("utilisateurs")
    .select("id, email, role, type_coach")
    .or("role.eq.coach,type_coach.neq.null");

  if (error) { console.error("Erreur DB:", error.message); process.exit(1); }

  console.log(`📋 ${utilisateurs.length} utilisateur(s) coach trouvé(s) en base`);

  let repares = 0;
  let erreurs = 0;

  for (const u of utilisateurs) {
    // Récupérer le app_metadata depuis Supabase Auth
    const { data: { user }, error: authErr } = await supabase.auth.admin.getUserById(u.id);
    if (authErr || !user) {
      console.warn(`⚠️  Impossible de récupérer l'auth user ${u.email}: ${authErr?.message}`);
      erreurs++;
      continue;
    }

    const roleAuth = user.app_metadata?.role;
    if (ROLES_CORROMPUS.includes(roleAuth)) {
      console.log(`🔧 Réparation de ${u.email}: app_metadata.role=${roleAuth} → coach`);
      const { error: updateErr } = await supabase.auth.admin.updateUserById(u.id, {
        app_metadata: { ...user.app_metadata, role: "coach" },
      });
      if (updateErr) {
        console.error(`  ❌ Échec: ${updateErr.message}`);
        erreurs++;
      } else {
        console.log(`  ✅ OK`);
        repares++;
      }
    } else if (roleAuth !== "coach") {
      console.log(`  ℹ️  ${u.email}: app_metadata.role=${roleAuth} (non corrompu, ignoré)`);
    }
  }

  console.log(`\n✅ Réparation terminée : ${repares} réparé(s), ${erreurs} erreur(s)`);
}

reparer().catch(console.error);
