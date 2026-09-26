-- ══════════════════════════════════════════════════════════════
-- MIGRATION : Ajout colonne source à assignations_parcours
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Valeurs possibles : 'parcours' | 'test_niveau' | NULL (anciens enregistrements)

COMMENT ON COLUMN public.assignations_parcours.source IS
  'Origine de l''assignation : parcours (formulaire standard) ou test_niveau (prospect via page test de niveau)';
