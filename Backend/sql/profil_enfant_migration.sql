-- MIGRATION : Profil enfant sur assignations_parcours
-- Ajoute la distinction adulte / enfant / etudiant et les coordonnées du parent

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS profil_type       TEXT DEFAULT 'adulte',
  ADD COLUMN IF NOT EXISTS nom_parent        TEXT,
  ADD COLUMN IF NOT EXISTS telephone_parent  TEXT,
  ADD COLUMN IF NOT EXISTS email_parent      TEXT;

COMMENT ON COLUMN public.assignations_parcours.profil_type      IS '''adulte'' | ''enfant'' | ''etudiant''';
COMMENT ON COLUMN public.assignations_parcours.nom_parent       IS 'Nom complet du parent / tuteur (si profil_type = enfant)';
COMMENT ON COLUMN public.assignations_parcours.telephone_parent IS 'Téléphone du parent / tuteur';
COMMENT ON COLUMN public.assignations_parcours.email_parent     IS 'Email du parent / tuteur';
