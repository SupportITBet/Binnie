import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  }
);

export async function uploadFichier(bucket, chemin, fichier) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(chemin, fichier, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(chemin);
  return publicUrl;
}

export async function importerCSV(table, csvData) {
  const { data, error } = await supabase
    .from(table)
    .upsert(csvData, { onConflict: 'email' });
  if (error) throw error;
  return data;
}
