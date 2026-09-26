-- Ajoute le cas "refus" au flux de remplacement : le PA Advisor peut refuser une demande
-- d'absence (statut 'a_pourvoir') avec un motif obligatoire, plutôt que de systématiquement
-- assigner un remplaçant. Idempotent — sûr à ré-exécuter.
ALTER TABLE public.remplacements
  ADD COLUMN IF NOT EXISTS motif_refus   TEXT,
  ADD COLUMN IF NOT EXISTS refuse_par_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refuse_le     TIMESTAMPTZ;
