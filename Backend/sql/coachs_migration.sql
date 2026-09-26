-- ══════════════════════════════════════════════════════════════
-- TABLE COACHS — colonnes complètes
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS nom               TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS prenom            TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS grade             TEXT DEFAULT 'Coach';
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS photo_url         TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS actif             BOOLEAN DEFAULT true;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS biographie        TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS specialites       JSONB DEFAULT '[]';
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS niveaux_enseignes JSONB DEFAULT '[]';
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS experience_annees INT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS email_professionnel TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS type_contrat      TEXT DEFAULT 'Freelance';
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS taux_horaire      INT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT now();

-- Désactiver RLS (accès service_role depuis backend)
ALTER TABLE public.coachs DISABLE ROW LEVEL SECURITY;

-- Voir ce qui existe après migration
SELECT id, nom, prenom, grade, actif, niveaux_enseignes FROM public.coachs;
