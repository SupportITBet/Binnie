-- ══════════════════════════════════════════════════════════════
-- TEST ORAL — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Colonne source : "online" (test en ligne) ou "oral" (saisi manuellement par l'assistante)
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online';

-- Colonne notes_oral : observations de l'assistante lors du test oral
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS notes_oral TEXT;

-- Rendre email optionnel (pour les tests oraux sans compte)
ALTER TABLE public.level_test_results
  ALTER COLUMN email DROP NOT NULL;

-- Index pour filtrer par source
CREATE INDEX IF NOT EXISTS idx_level_test_results_source
  ON public.level_test_results(source);
