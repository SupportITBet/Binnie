import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { count: c1 } = await supabase.from('utilisateurs').select('*', { count: 'exact', head: true });
console.log('utilisateurs count:', c1);

const { count: c2, error: e2 } = await supabase.from('classes_elearning_apprenants').select('*', { count: 'exact', head: true });
console.log('classes_elearning_apprenants count:', c2, e2);

// list tables similar name
const { data: tbls, error: e3 } = await supabase.rpc('pg_catalog_tables'); // likely doesn't exist, ignore
console.log(e3?.message);
