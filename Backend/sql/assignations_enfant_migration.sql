-- Migration : ajouter les champs spécifiques au profil enfant dans assignations_parcours
-- Ces champs sont aussi stockés dans suivi_demarrage (JSONB) comme fallback.

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS prenom_enfant        TEXT,
  ADD COLUMN IF NOT EXISTS nom_enfant           TEXT,
  ADD COLUMN IF NOT EXISTS age_enfant           TEXT,
  ADD COLUMN IF NOT EXISTS niveau_classe_enfant TEXT;

CREATE INDEX IF NOT EXISTS idx_assignations_profil_type
  ON public.assignations_parcours(profil_type);

-- Backfill depuis suivi_demarrage pour les lignes existantes
UPDATE public.assignations_parcours
SET
  prenom_enfant        = suivi_demarrage->>'prenom_enfant',
  nom_enfant           = suivi_demarrage->>'nom_enfant',
  age_enfant           = suivi_demarrage->>'age_enfant',
  niveau_classe_enfant = suivi_demarrage->>'niveau_classe_enfant'
WHERE profil_type = 'enfant'
  AND suivi_demarrage IS NOT NULL
  AND (prenom_enfant IS NULL OR nom_enfant IS NULL);
