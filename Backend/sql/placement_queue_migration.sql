-- ══════════════════════════════════════════════════════════════
-- Migration : colonnes placement test sur inscriptions_adultes
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.inscriptions_adultes
  ADD COLUMN IF NOT EXISTS entreprise_id    UUID,
  ADD COLUMN IF NOT EXISTS entreprise_nom   TEXT,
  ADD COLUMN IF NOT EXISTS notes_placement  TEXT,
  ADD COLUMN IF NOT EXISTS date_test        DATE,
  ADD COLUMN IF NOT EXISTS onboarding_id    UUID;

-- Index pour filtrage rapide par statut (queue placement)
CREATE INDEX IF NOT EXISTS idx_inscr_adultes_statut_test
  ON public.inscriptions_adultes(statut)
  WHERE statut IN ('en_attente_test', 'test_en_cours', 'teste');
