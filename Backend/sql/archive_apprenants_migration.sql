
-- Migration : colonnes archivage apprenants
-- Table : groupes_apprenants
-- À exécuter dans Supabase SQL Editor

ALTER TABLE groupes_apprenants
  ADD COLUMN IF NOT EXISTS motif_pause         TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS detail_motif        TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duree_pause_estimee TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date_reprise_prevue TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date_pause          TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date_reactivation   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archive_par         UUID        DEFAULT NULL REFERENCES utilisateurs(id) ON DELETE SET NULL;

-- Permettre les nouveaux statuts
-- (si la colonne statut a une contrainte CHECK, l'adapter)
-- ALTER TABLE groupes_apprenants
--   DROP CONSTRAINT IF EXISTS groupes_apprenants_statut_check;
-- ALTER TABLE groupes_apprenants
--   ADD CONSTRAINT groupes_apprenants_statut_check
--   CHECK (statut IN ('actif','periode_test','transfere','retire','en_pause','archive'));

-- Index pour accélérer les requêtes archives
CREATE INDEX IF NOT EXISTS idx_ga_statut_pause ON groupes_apprenants(statut)
  WHERE statut IN ('en_pause','archive');
