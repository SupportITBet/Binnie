CREATE TABLE IF NOT EXISTS public.partenaires (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        TEXT        NOT NULL,
  logo_url   TEXT        NOT NULL,
  site_web   TEXT,
  ordre      INTEGER     NOT NULL DEFAULT 0,
  actif      BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.partenaires DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_partenaires_actif ON public.partenaires(actif);
CREATE INDEX IF NOT EXISTS idx_partenaires_ordre ON public.partenaires(ordre);
