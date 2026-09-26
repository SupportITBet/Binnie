-- Ajouter statut à sessions_live (planifiee | en_cours | terminee | annulee)
ALTER TABLE public.sessions_live
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'planifiee',
  ADD COLUMN IF NOT EXISTS heure_fin TIME,
  ADD COLUMN IF NOT EXISTS contenu_ids UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_sessions_live_statut ON public.sessions_live(statut);
