-- ══════════════════════════════════════════════════════════════
-- TABLE config_competences_elearning — compétences CECR éditables
-- depuis Admin BET → Configuration → Compétences, ligne singleton id=1.
-- Remplace le stockage localStorage précédent (invisible côté apprenant
-- en pratique, puisque chaque navigateur a son propre localStorage).
-- Même convention que config_footer_elearning.
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.config_competences_elearning (
  id          INT         PRIMARY KEY DEFAULT 1,
  data        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT config_competences_elearning_singleton CHECK (id = 1)
);

ALTER TABLE public.config_competences_elearning DISABLE ROW LEVEL SECURITY;
