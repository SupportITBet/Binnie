-- Colonnes manquantes dans groupes_fichiers
-- À exécuter dans Supabase SQL Editor

ALTER TABLE public.groupes_fichiers ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT true;
