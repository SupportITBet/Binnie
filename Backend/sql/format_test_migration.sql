-- ══════════════════════════════════════════════════════════════
-- FORMAT TEST — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- format_test : type de test passé par le prospect
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS format_test TEXT NOT NULL DEFAULT 'mixte';

-- correction_statut : 'auto' (résultat immédiat) | 'en_attente' | 'corrige'
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS correction_statut TEXT NOT NULL DEFAULT 'auto';

-- Index pour filtrer par format
CREATE INDEX IF NOT EXISTS idx_level_test_results_format
  ON public.level_test_results(format_test);
