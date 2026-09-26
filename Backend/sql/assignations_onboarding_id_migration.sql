-- Migration : ajouter onboarding_id dans assignations_parcours
-- But : figer l'onboarding responsable AU MOMENT de l'inscription.
-- Ainsi, si une commerciale change d'onboarding, ses anciens dossiers
-- restent visibles par l'ancien onboarding (et ne "migrent" pas vers le nouveau).

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignations_onboarding_id
  ON public.assignations_parcours(onboarding_id);

-- Backfill : remplir onboarding_id pour les inscriptions existantes
-- en utilisant l'onboarding_id ACTUEL de l'assistante (meilleure approximation possible).
UPDATE public.assignations_parcours ap
SET    onboarding_id = a.onboarding_id
FROM   public.assistantes a
WHERE  ap.assistante_id = a.id
  AND  a.onboarding_id IS NOT NULL
  AND  ap.onboarding_id IS NULL;
