// Script : créer les comptes Supabase Auth pour tous les apprenants elearning sans compte
// Usage : node Backend/sql/creer_comptes_apprenants_elearning.js

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function creerCompte({ email, nom_complet, telephone }) {
  const emailLow = email.toLowerCase().trim();
  const mdpTemp  = "BET@" + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(6, "X") + "!";

  // Vérifier si compte auth déjà existant
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = (list?.users || []).find(u => u.email?.toLowerCase() === emailLow);

  let uid;
  if (existing) {
    uid = existing.id;
    await supabase.auth.admin.updateUserById(uid, { password: mdpTemp, email_confirm: true });
    console.log(`  ↺ Compte existant mis à jour : ${email}`);
  } else {
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: emailLow, password: mdpTemp, email_confirm: true,
      user_metadata: { nom: nom_complet, role: 'apprenant' },
    });
    if (authErr) { console.log(`  ✗ Erreur auth pour ${email}: ${authErr.message}`); return null; }
    uid = authData.user.id;
    console.log(`  ✓ Compte créé : ${email}`);
  }

  // Upsert dans utilisateurs
  const parts  = (nom_complet || '').trim().split(' ');
  await supabase.from('utilisateurs').upsert({
    id: uid, email: emailLow,
    nom: parts[0] || nom_complet, prenom: parts.slice(1).join(' ') || '',
    telephone: telephone || null, role: 'apprenant', actif: true,
    mdp_temporaire: true, mdp_initial: mdpTemp,
  }, { onConflict: 'id' });

  // Mettre à jour apprenant_id dans classes_elearning_apprenants
  await supabase.from('classes_elearning_apprenants')
    .update({ apprenant_id: uid })
    .ilike('email', emailLow);

  return { email, mdp_initial: mdpTemp, uid };
}

async function main() {
  console.log('🔍 Récupération des apprenants sans compte...\n');
  const { data: rows, error } = await supabase
    .from('classes_elearning_apprenants')
    .select('email, nom_complet, telephone')
    .is('apprenant_id', null)
    .not('email', 'is', null);

  if (error) { console.error('Erreur:', error.message); process.exit(1); }
  if (!rows || rows.length === 0) { console.log('✅ Tous les apprenants ont déjà un compte.'); return; }

  // Dédupliquer par email
  const seen = new Set();
  const uniques = rows.filter(r => { const k = r.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });

  console.log(`📋 ${uniques.length} apprenant(s) sans compte à traiter :\n`);
  const resultats = [];
  for (const ap of uniques) {
    const r = await creerCompte(ap);
    if (r) resultats.push(r);
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('✅ Résultats — à communiquer aux apprenants :');
  console.log('══════════════════════════════════════════════');
  for (const r of resultats) {
    console.log(`  ${r.email}  →  ${r.mdp_initial}`);
  }
  console.log('\n⚠️  Ces mots de passe sont temporaires. L\'apprenant devra les changer à la première connexion.');
}

main().catch(console.error);
