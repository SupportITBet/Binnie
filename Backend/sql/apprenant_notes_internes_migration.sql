-- Colonne de persistance pour l'onglet "Notes internes" du modal détail apprenant
-- (PA Advisor / admin BET) — le champ existait déjà côté frontend mais n'était jamais
-- sauvegardé nulle part, ce qui donnait l'impression d'une fonctionnalité factice.
ALTER TABLE public.classes_elearning_apprenants
  ADD COLUMN IF NOT EXISTS notes_internes text;
