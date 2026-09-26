-- ══════════════════════════════════════════════════════════════
-- Package personnalisé par entreprise — offre sur-mesure hors
-- catalogue (packages_commerciaux), propre à une seule entreprise.
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.comptes_entreprises
  ADD COLUMN IF NOT EXISTS libelle_personnalise TEXT,
  ADD COLUMN IF NOT EXISTS tarif_personnalise    INTEGER;

COMMENT ON COLUMN public.comptes_entreprises.libelle_personnalise IS 'Nom de l''offre sur-mesure (utilisé quand package_elearning = ''personnalise'')';
COMMENT ON COLUMN public.comptes_entreprises.tarif_personnalise    IS 'Tarif/bénéficiaire (FCFA) saisi librement pour un package personnalisé';
