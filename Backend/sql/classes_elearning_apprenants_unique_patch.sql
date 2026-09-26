-- Patch : contrainte unique partielle sur classes_elearning_apprenants (classe_id, email)
-- Nécessaire pour éviter les doublons quand email est fourni
-- (NULL email non inclus dans la contrainte → plusieurs bénéficiaires sans email possible)

CREATE UNIQUE INDEX IF NOT EXISTS idx_cea_unique_classe_email
  ON public.classes_elearning_apprenants (classe_id, email)
  WHERE email IS NOT NULL;
