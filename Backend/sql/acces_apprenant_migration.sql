-- ══════════════════════════════════════════════════════════════
-- Colonne acces_apprenant sur assignations_parcours
-- Stocke les identifiants générés lors de la conversion prospect → apprenant
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS acces_apprenant JSONB;

-- Index GIN pour requêtes sur le JSON (optionnel)
CREATE INDEX IF NOT EXISTS idx_assignations_acces_apprenant
  ON public.assignations_parcours USING GIN (acces_apprenant);
