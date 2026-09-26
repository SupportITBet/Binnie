-- Patch : colonnes manquantes sur la table centres
ALTER TABLE public.centres ADD COLUMN IF NOT EXISTS couleur    TEXT DEFAULT '#0891B2';
ALTER TABLE public.centres ADD COLUMN IF NOT EXISTS key_local  TEXT;

-- Mettre à jour les key_local depuis les id existants (si pas encore définis)
UPDATE public.centres SET key_local = id WHERE key_local IS NULL;

-- Désactiver RLS
ALTER TABLE public.centres DISABLE ROW LEVEL SECURITY;
