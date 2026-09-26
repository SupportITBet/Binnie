// Instance unique Supabase - réexportée depuis services/supabase.js
// pour éviter deux clients désynchronisés (session, apikey, realtime)
export { supabase } from '../services/supabase';

export async function uploadFichier(bucket, chemin, fichier) {
  const { supabase: sb } = await import('../services/supabase');
  const { data, error } = await sb.storage.from(bucket).upload(chemin, fichier, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from(bucket).getPublicUrl(chemin);
  return publicUrl;
}

export async function importerCSV(table, csvData) {
  const { supabase: sb } = await import('../services/supabase');
  const { data, error } = await sb.from(table).upsert(csvData, { onConflict: 'email' });
  if (error) throw error;
  return data;
}
