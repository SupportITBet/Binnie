-- ═══════════════════════════════════════════════════════════
--  MIGRATION : Enrichissement assignations_parcours
--  Ajoute les informations de paiement en ligne et l'offre
--  pour que l'assistante commerciale voie tout le contexte
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS inscription_offre  TEXT,       -- ex : "Anglais Professionnel · En ligne"
  ADD COLUMN IF NOT EXISTS montant_paye       INTEGER,    -- montant déjà réglé (paiement en ligne)
  ADD COLUMN IF NOT EXISTS niveau_client      TEXT,       -- niveau CECRL déclaré : A1-A2, B1-B2…
  ADD COLUMN IF NOT EXISTS objectif_client    TEXT,       -- objectif exprimé par le client
  ADD COLUMN IF NOT EXISTS notes              TEXT;       -- notes libres du superadmin
