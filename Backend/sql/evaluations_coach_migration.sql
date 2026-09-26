-- Nouvelle table : avis des parents sur les coaches (séparée de evaluations_coach existante)

CREATE TABLE IF NOT EXISTS public.avis_parents_coach (
  id            BIGSERIAL PRIMARY KEY,
  inscription_id TEXT,
  parent_email  TEXT,
  coach_nom     TEXT,
  classe_id     TEXT,
  mois          TEXT NOT NULL,
  q1            SMALLINT CHECK (q1 BETWEEN 1 AND 5),
  q2            SMALLINT CHECK (q2 BETWEEN 1 AND 5),
  q3            SMALLINT CHECK (q3 BETWEEN 1 AND 5),
  q4            SMALLINT CHECK (q4 BETWEEN 1 AND 5),
  q5            SMALLINT CHECK (q5 BETWEEN 1 AND 5),
  commentaire   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avis_parents_inscription ON public.avis_parents_coach (inscription_id);
CREATE INDEX IF NOT EXISTS idx_avis_parents_mois        ON public.avis_parents_coach (mois);
CREATE INDEX IF NOT EXISTS idx_avis_parents_parent      ON public.avis_parents_coach (parent_email);

ALTER TABLE public.avis_parents_coach DISABLE ROW LEVEL SECURITY;
