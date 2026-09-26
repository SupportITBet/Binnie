-- ══════════════════════════════════════════════════════════════
-- TABLE sessions_live — Sessions visio créées par les coachs
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sessions_live (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titre       TEXT        NOT NULL,
  plateforme  TEXT        NOT NULL DEFAULT 'zoom',
  lien        TEXT        NOT NULL,
  date        DATE        NOT NULL,
  heure       TIME        NOT NULL,
  duree       INTEGER     NOT NULL DEFAULT 60,
  groupe_id   UUID        REFERENCES public.groupes(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_sessions_live_coach  ON public.sessions_live(coach_id);
CREATE INDEX IF NOT EXISTS idx_sessions_live_date   ON public.sessions_live(date);
CREATE INDEX IF NOT EXISTS idx_sessions_live_groupe ON public.sessions_live(groupe_id);
