-- Migration : ajout colonnes parent + enfant dans inscriptions_elearning ET classes_elearning_apprenants
-- À exécuter dans Supabase SQL Editor

-- 1. inscriptions_elearning
ALTER TABLE public.inscriptions_elearning
  ADD COLUMN IF NOT EXISTS prenom_parent      TEXT    NULL,
  ADD COLUMN IF NOT EXISTS nom_parent         TEXT    NULL,
  ADD COLUMN IF NOT EXISTS email_parent       TEXT    NULL,
  ADD COLUMN IF NOT EXISTS telephone_parent   TEXT    NULL,
  ADD COLUMN IF NOT EXISTS classe             TEXT    NULL,  -- classe scolaire (CM1, 6ème...)
  ADD COLUMN IF NOT EXISTS niveau_cecr_estime TEXT    NULL,  -- niveau estimé (A1, A2, B1...)
  ADD COLUMN IF NOT EXISTS profil_type        TEXT    NULL DEFAULT 'adulte',  -- adulte | enfant | ado
  ADD COLUMN IF NOT EXISTS etablissement      TEXT    NULL;  -- établissement scolaire (profil ado)

COMMENT ON COLUMN public.inscriptions_elearning.prenom_parent      IS 'Prénom du parent/tuteur (profil enfant/ado)';
COMMENT ON COLUMN public.inscriptions_elearning.nom_parent         IS 'Nom du parent/tuteur';
COMMENT ON COLUMN public.inscriptions_elearning.email_parent       IS 'Email du parent/tuteur — utilisé pour le compte parent';
COMMENT ON COLUMN public.inscriptions_elearning.telephone_parent   IS 'Téléphone du parent/tuteur';
COMMENT ON COLUMN public.inscriptions_elearning.classe             IS 'Classe scolaire de l''enfant (CP, CE1, CE2, CM1, CM2, 6ème...)';
COMMENT ON COLUMN public.inscriptions_elearning.niveau_cecr_estime IS 'Niveau CECR estimé par l''entreprise/parent (A1, A2, B1, B2)';
COMMENT ON COLUMN public.inscriptions_elearning.profil_type        IS 'adulte | enfant | ado';
COMMENT ON COLUMN public.inscriptions_elearning.etablissement      IS 'Établissement scolaire (profil ado)';

-- 2. classes_elearning_apprenants — mêmes champs pour propagation au moment de l'assignation
ALTER TABLE public.classes_elearning_apprenants
  ADD COLUMN IF NOT EXISTS prenom_parent      TEXT    NULL,
  ADD COLUMN IF NOT EXISTS nom_parent         TEXT    NULL,
  ADD COLUMN IF NOT EXISTS email_parent       TEXT    NULL,
  ADD COLUMN IF NOT EXISTS telephone_parent   TEXT    NULL,
  ADD COLUMN IF NOT EXISTS classe             TEXT    NULL,
  ADD COLUMN IF NOT EXISTS niveau_cecr_estime TEXT    NULL,
  ADD COLUMN IF NOT EXISTS profil_type        TEXT    NULL DEFAULT 'adulte';

-- 3. Backfill classes_elearning_apprenants depuis inscriptions_elearning (jointure email)
UPDATE public.classes_elearning_apprenants AS cea
SET
  prenom_parent      = ie.prenom_parent,
  nom_parent         = ie.nom_parent,
  email_parent       = ie.email_parent,
  telephone_parent   = ie.telephone_parent,
  classe             = ie.classe,
  niveau_cecr_estime = ie.niveau_cecr_estime,
  profil_type        = COALESCE(ie.profil_type, 'adulte'),
  date_naissance     = COALESCE(cea.date_naissance, ie.date_naissance)
FROM public.inscriptions_elearning ie
WHERE LOWER(cea.email) = LOWER(ie.email)
  AND ie.email IS NOT NULL
  AND cea.email IS NOT NULL;
