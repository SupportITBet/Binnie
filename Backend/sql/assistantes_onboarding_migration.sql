-- Migration : lien onboarding ↔ commerciale + date de début de formation
-- À exécuter dans Supabase SQL Editor.

-- 0. Date de début de formation sur assignations_parcours
ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS date_debut_formation DATE;

COMMENT ON COLUMN public.assignations_parcours.date_debut_formation IS
  'Date de début de formation renseignée par la commerciale lors de la finalisation';

-- 1. Colonne onboarding_id sur assistantes (commerciale → onboarding assignée)
ALTER TABLE public.assistantes
  ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assistantes.onboarding_id IS
  'ID de l''assistante onboarding assignée à cette commerciale';

CREATE INDEX IF NOT EXISTS idx_assistantes_onboarding ON public.assistantes(onboarding_id);

-- 2. Colonne onboarding_commercial_id sur utilisateurs (onboarding → sa commerciale)
ALTER TABLE public.utilisateurs
  ADD COLUMN IF NOT EXISTS onboarding_commercial_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.utilisateurs.onboarding_commercial_id IS
  'Pour un compte onboarding : ID de la commerciale qui lui est assignée';

CREATE INDEX IF NOT EXISTS idx_utilisateurs_onboarding_commercial ON public.utilisateurs(onboarding_commercial_id);
