-- ═══════════════════════════════════════════════════════════════════
-- PATCH seances_elearning
-- 1. Ajouter le type 'presentiel' à la contrainte
-- 2. Ajouter la colonne contenu_ids (tableau d'UUID de cours liés)
-- À exécuter dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Supprimer l'ancienne contrainte CHECK sur type
ALTER TABLE seances_elearning
  DROP CONSTRAINT IF EXISTS seances_elearning_type_check;

-- 2. Recréer la contrainte avec 'presentiel'
ALTER TABLE seances_elearning
  ADD CONSTRAINT seances_elearning_type_check
  CHECK (type IN ('cours','evaluation','rattrapage','decouverte','presentiel'));

-- 3. Ajouter la colonne contenu_ids (JSONB, tableau d'UUID)
ALTER TABLE seances_elearning
  ADD COLUMN IF NOT EXISTS contenu_ids JSONB DEFAULT '[]'::jsonb;

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'seances_elearning'
ORDER BY ordinal_position;
