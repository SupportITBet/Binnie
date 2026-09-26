-- Budgets / prévisionnel — bet-elearning, indépendant de dash

CREATE TABLE IF NOT EXISTS public.comptabilite_budgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee          SMALLINT NOT NULL,
  categorie      TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('charge','produit')),
  montant_prevu  NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  created_by     UUID REFERENCES public.utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (annee, categorie, type)
);
CREATE INDEX IF NOT EXISTS idx_compta_budgets_annee ON public.comptabilite_budgets (annee);

ALTER TABLE public.comptabilite_budgets DISABLE ROW LEVEL SECURITY;
