-- Ajoute lot_id à remplacements — identifiant commun généré côté coach quand une même
-- déclaration d'absence couvre plusieurs classes différentes (une ligne remplacements par
-- groupe, cf. envoyerDemandeAbsence côté dash/bet-elearning). Permet à la PA de retrouver les
-- demandes-sœurs d'une même absence et de choisir : un seul remplaçant pour tout le lot, ou
-- une assignation différente par classe.
-- À exécuter dans Supabase SQL Editor.

ALTER TABLE public.remplacements
  ADD COLUMN IF NOT EXISTS lot_id UUID;

CREATE INDEX IF NOT EXISTS idx_remplacements_lot_id ON public.remplacements(lot_id);
