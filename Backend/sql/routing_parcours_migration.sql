                 -- MIGRATION : Routing post-finalisation (PA Advisor / Onboarding)
-- Ajoute le statut de routing et l'ID du PA advisor choisi

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS routing_statut  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pa_advisor_id   UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assignations_parcours.routing_statut IS
  'NULL (pas encore finalisé) | ''pa_en_attente'' | ''pa_affecte'' | ''onboarding_en_attente'' | ''onboarding_affecte''';

COMMENT ON COLUMN public.assignations_parcours.pa_advisor_id IS
  'ID utilisateur du PA Advisor choisi (cours privés uniquement)';

CREATE INDEX IF NOT EXISTS idx_assignations_routing   ON public.assignations_parcours(routing_statut);
CREATE INDEX IF NOT EXISTS idx_assignations_pa_advisor ON public.assignations_parcours(pa_advisor_id);
