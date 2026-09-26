import supabase from "../config/supabase.js";

export const testSupabase = async () => {
  try {
    const { error } = await supabase.from("profils_admin").select("count").limit(1);
    if (error) throw error;
    console.log("✅ Supabase connecté");
  } catch (error) {
    console.error("❌ Supabase erreur :", error.message);
  }

  // Vérifier et corriger l'enum bet_role pour le rôle "apprenant"
  try {
    const { error: enumErr } = await supabase.rpc("check_and_fix_apprenant_role");
    if (!enumErr) {
      console.log("✅ Enum bet_role : rôle 'apprenant' présent");
    }
  } catch (_) {
    // Fallback : tenter un INSERT test pour détecter le problème
    try {
      const { error: testErr } = await supabase
        .from("utilisateurs")
        .select("id").eq("role", "apprenant").limit(1);
      if (testErr?.message?.includes("invalid input value for enum")) {
        console.error("❌ CRITIQUE : Le rôle 'apprenant' est ABSENT de l'enum bet_role.");
        console.error("   → Exécutez dans Supabase SQL Editor :");
        console.error("     ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'apprenant';");
      }
    } catch (_) {}
  }
};