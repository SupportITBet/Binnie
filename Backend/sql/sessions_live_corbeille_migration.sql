-- Ajouter le flag corbeille (soft delete) à sessions_live
ALTER TABLE public.sessions_live
  ADD COLUMN IF NOT EXISTS is_corbeille BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sessions_live_corbeille ON public.sessions_live(is_corbeille);
