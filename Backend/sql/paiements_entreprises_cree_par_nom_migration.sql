-- ══════════════════════════════════════════════════════════════
-- Traçabilité des versements — qui a enregistré le paiement.
-- Même convention que entreprise_documents.depose_par_nom : le nom est
-- dénormalisé sur la ligne au moment de la saisie (pas de jointure au
-- moment de la lecture), simple et cohérent avec le reste du code.
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.paiements_entreprises
  ADD COLUMN IF NOT EXISTS cree_par_nom TEXT;
