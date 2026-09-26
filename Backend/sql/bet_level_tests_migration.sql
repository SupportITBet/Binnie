-- ══════════════════════════════════════════════════════════════
-- MIGRATION : bet_level_tests + bet_level_questions + bet_level_test_results
-- Réplique côté bet-elearning du modèle "test de niveau" de dash
-- (level_tests / level_questions / level_test_results), avec des tables
-- entièrement séparées — bet-elearning et dash ne doivent jamais partager
-- de tables. Coexiste avec le système existant (bet_elearning_tests_niveau)
-- qui reste en place tel quel.
-- À exécuter dans l'éditeur SQL de Supabase (une seule fois)
-- ══════════════════════════════════════════════════════════════

-- ── 1. Table des configurations de tests ─────────────────────
CREATE TABLE IF NOT EXISTS public.bet_level_tests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre               TEXT NOT NULL,
  description         TEXT DEFAULT '',
  type                TEXT NOT NULL DEFAULT 'qcm',
    -- Valeurs possibles : 'qcm' | 'listening' | 'reading' | 'mixed' | 'speaking'
  actif               BOOLEAN NOT NULL DEFAULT false,
  programme_le        TIMESTAMPTZ,
  programme_jusqu_au  TIMESTAMPTZ,
  params              JSONB DEFAULT '{
    "timerEnabled":    true,
    "timerPerQ":       60,
    "shuffleQ":        false,
    "maxQuestions":    10,
    "passingPct":      50,
    "sendEmail":       true,
    "contactAfter":    true
  }'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Table des questions (multi-format, par question) ──────
CREATE TABLE IF NOT EXISTS public.bet_level_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     UUID NOT NULL REFERENCES public.bet_level_tests(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'qcm',
    -- 'qcm' | 'vrai_faux' | 'texte_trous' | 'audio_qcm' | 'lecture_qcm' | 'libre' | 'speaking'
  text        TEXT DEFAULT '',
  audio_url   TEXT,
  image_url   TEXT,
  passage     TEXT,
  options     JSONB DEFAULT '[]'::jsonb,
  correct     TEXT DEFAULT '',
  category    TEXT DEFAULT 'Grammaire',
  cefr        TEXT DEFAULT 'A1',
  points      INTEGER DEFAULT 1,
  explanation TEXT DEFAULT '',
  actif       BOOLEAN DEFAULT true,
  ordre       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bet_level_questions_test_id ON public.bet_level_questions(test_id);
CREATE INDEX IF NOT EXISTS idx_bet_level_questions_ordre   ON public.bet_level_questions(test_id, ordre);
CREATE INDEX IF NOT EXISTS idx_bet_level_tests_actif       ON public.bet_level_tests(actif);

-- ── 3. Table des résultats ────────────────────────────────────
-- apprenant_id référence inscriptions_adultes (même convention que
-- bet_elearning_tests_niveau_resultats) — nullable car un test peut aussi
-- être passé "à froid" via un lien générique avant qu'un dossier existe.
CREATE TABLE IF NOT EXISTS public.bet_level_test_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             UUID REFERENCES public.bet_level_tests(id) ON DELETE SET NULL,
  apprenant_id        UUID REFERENCES public.inscriptions_adultes(id) ON DELETE SET NULL,
  entreprise_id       UUID,
  fullname            TEXT,
  email               TEXT,
  phone               TEXT,
  level               TEXT,
  score               NUMERIC DEFAULT 0,
  points_earned       NUMERIC DEFAULT 0,
  points_total        NUMERIC DEFAULT 100,
  correct_answers     INTEGER DEFAULT 0,
  total_questions     INTEGER DEFAULT 0,
  time_taken_seconds  INTEGER DEFAULT 0,
  answers_details     JSONB DEFAULT '[]'::jsonb,
  audio_answers       JSONB DEFAULT '{}'::jsonb,
  by_category         JSONB DEFAULT '{}'::jsonb,
  by_cefr             JSONB DEFAULT '{}'::jsonb,
  format_test         TEXT NOT NULL DEFAULT 'mixte',
  correction_statut   TEXT NOT NULL DEFAULT 'auto', -- 'auto' | 'en_attente' | 'corrige'
  notes_agent         TEXT,
  statut              TEXT NOT NULL DEFAULT 'nouveau', -- 'nouveau' | 'contacté' | 'converti' | 'archivé'
  submitted_at        TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bet_level_results_test_id      ON public.bet_level_test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_bet_level_results_apprenant_id ON public.bet_level_test_results(apprenant_id);
CREATE INDEX IF NOT EXISTS idx_bet_level_results_correction   ON public.bet_level_test_results(correction_statut);
CREATE INDEX IF NOT EXISTS idx_bet_level_results_audio        ON public.bet_level_test_results USING gin(audio_answers);

-- ── 4. RLS ────────────────────────────────────────────────────
ALTER TABLE public.bet_level_tests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_level_questions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_level_test_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bet_level_tests_all"        ON public.bet_level_tests;
DROP POLICY IF EXISTS "bet_level_questions_all"    ON public.bet_level_questions;
DROP POLICY IF EXISTS "bet_level_test_results_all" ON public.bet_level_test_results;
CREATE POLICY "bet_level_tests_all"        ON public.bet_level_tests        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "bet_level_questions_all"    ON public.bet_level_questions    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "bet_level_test_results_all" ON public.bet_level_test_results FOR ALL USING (true) WITH CHECK (true);

-- ── 5. Trigger updated_at (réutilise set_updated_at() si déjà créée par
--       level_tests_migration.sql, sinon la (re)crée — idempotent) ──────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bet_level_tests_updated_at ON public.bet_level_tests;
CREATE TRIGGER trg_bet_level_tests_updated_at
  BEFORE UPDATE ON public.bet_level_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════
-- FIN DE LA MIGRATION
-- Vérification rapide :
-- SELECT * FROM bet_level_tests;
-- SELECT COUNT(*) FROM bet_level_questions;
-- SELECT * FROM bet_level_test_results LIMIT 5;
-- ════════════════════════════════════════════════
