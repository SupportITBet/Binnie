-- MIGRATION : Pipeline de traitement du coaching privé (assistante → PA → paiement → routage)
-- Ajoute un statut de dossier dédié au coaching privé, distinct de routing_statut
-- (qui reste utilisé tel quel pour le routage final Onboarding/Assistante).

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS dossier_statut       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS motif_invalidation   TEXT DEFAULT NULL;

COMMENT ON COLUMN public.assignations_parcours.dossier_statut IS
  'Pipeline coaching privé (assistante+PA) : NULL | ''en_attente_validation'' | ''valide'' | ''invalide'' | ''paiement_en_attente'' | ''paiement_recu''';

COMMENT ON COLUMN public.assignations_parcours.motif_invalidation IS
  'Motif renseigné par le PA lors d''une invalidation de dossier coaching privé';

CREATE INDEX IF NOT EXISTS idx_assignations_dossier_statut ON public.assignations_parcours(dossier_statut);
