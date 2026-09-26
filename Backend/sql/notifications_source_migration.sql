-- Ajoute une colonne source pour distinguer les notifications bet-elearning / dash

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dash';

-- Les notifications existantes sans source sont considérées comme venant de dash
UPDATE public.notifications SET source = 'dash' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_source ON public.notifications (source);
CREATE INDEX IF NOT EXISTS idx_notifications_user_source ON public.notifications (user_id, source);
