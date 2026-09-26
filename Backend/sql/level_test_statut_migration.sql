-- ══════════════════════════════════════════════════════════════
-- Ajout du suivi de traitement (statut) sur les tests de niveau reçus
-- Sans cette colonne, le badge "nouveau(x)" du dashboard commercial
-- ne peut jamais diminuer : rien ne permet de marquer un test comme
-- contacté/converti/archivé, il reste affiché "nouveau" pour toujours.
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'nouveau';

ALTER TABLE public.level_test_results
  DROP CONSTRAINT IF EXISTS level_test_results_statut_check;

ALTER TABLE public.level_test_results
  ADD CONSTRAINT level_test_results_statut_check
  CHECK (statut IN ('nouveau', 'contacté', 'converti', 'archivé'));
