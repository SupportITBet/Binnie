-- Ajout de date_naissance dans le parcours e-learning entreprise
-- À exécuter dans Supabase SQL Editor

ALTER TABLE public.inscriptions_elearning
  ADD COLUMN IF NOT EXISTS date_naissance DATE NULL;

ALTER TABLE public.classes_elearning_apprenants
  ADD COLUMN IF NOT EXISTS date_naissance DATE NULL;
