-- Migration : ajout de la colonne acces_elearning dans la table utilisateurs
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS acces_elearning BOOLEAN DEFAULT false;

-- Mettre à false pour tous les utilisateurs existants (sécurité par défaut)
UPDATE utilisateurs
  SET acces_elearning = false
  WHERE acces_elearning IS NULL;
