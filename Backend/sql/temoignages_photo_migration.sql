-- Ajouter la colonne photo_url à la table temoignages
-- À exécuter dans Supabase SQL Editor

ALTER TABLE public.temoignages
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN public.temoignages.photo_url IS 'URL Cloudinary de la photo du diplôme / certificat uploadée par l''apprenant';
