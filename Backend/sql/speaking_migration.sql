-- ════════════════════════════════════════════════════════════════
-- MIGRATION : Support questions Speaking (réponse audio candidat)
-- À exécuter dans l'éditeur SQL de Supabase
-- ════════════════════════════════════════════════════════════════

-- ── 1. Colonne audio_answers dans level_test_results ──────────
-- Stocke { "question_id": "https://cloudinary_url..." } pour les
-- questions de type 'speaking' auxquelles le candidat a répondu
-- par un enregistrement vocal.
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS audio_answers JSONB DEFAULT '{}'::jsonb;

-- ── 2. Index pour requêtes sur audio_answers ──────────────────
CREATE INDEX IF NOT EXISTS idx_level_test_results_audio
  ON public.level_test_results USING gin(audio_answers);

-- ── Vérification ──────────────────────────────────────────────
-- SELECT id, fullname, audio_answers FROM level_test_results
-- WHERE audio_answers != '{}'::jsonb LIMIT 10;
