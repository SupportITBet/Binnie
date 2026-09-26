-- avis_parents_coach n'a jamais eu de colonne plateforme : la seule ligne existante
-- (et tout le mécanisme de soumission, bet-elearning/src/pages/parent/DashboardParent.jsx)
-- vient exclusivement de bet-elearning, mais elle s'affichait aussi côté dash
-- (PA advisor > Évaluations parents) faute de filtrage — même famille de bug que
-- les remplacements avant l'ajout de leur colonne plateforme.
ALTER TABLE public.avis_parents_coach
  ADD COLUMN IF NOT EXISTS plateforme TEXT DEFAULT 'bet-elearning';

UPDATE public.avis_parents_coach SET plateforme = 'bet-elearning' WHERE plateforme IS NULL;
