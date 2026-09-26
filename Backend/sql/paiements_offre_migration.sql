-- ══════════════════════════════════════════════════════════════
-- MIGRATION : Ajout colonne offre à paiements_parcours
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.paiements_parcours
  ADD COLUMN IF NOT EXISTS offre TEXT;

COMMENT ON COLUMN public.paiements_parcours.offre IS
  'Formation choisie lors du paiement (ex: Anglais Pro B2, Certification TOEIC…)';
