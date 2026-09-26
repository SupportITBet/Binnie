import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const EMAIL = 'admin@bet.ci';

async function main() {
  const { data: pa, error: e1 } = await supabase.from('profils_admin').select('id, email, twofa_obligatoire, profil_type, scope').ilike('email', EMAIL);
  console.log('profils_admin:', pa, e1?.message);

  const { data: u, error: e2 } = await supabase.from('utilisateurs').select('id, email, twofa_active, role').ilike('email', EMAIL);
  console.log('utilisateurs:', u, e2?.message);

  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const authUser = (listData?.users || []).find(x => x.email?.toLowerCase() === EMAIL.toLowerCase());
  console.log('auth user id:', authUser?.id);
  if (authUser) {
    const { data: factors } = await supabase.auth.admin.mfa.listFactors({ userId: authUser.id });
    console.log('mfa factors:', factors);
  }
}
main();
