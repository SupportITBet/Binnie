-- Relances clients (factures impayées/en retard) — bet-elearning, indépendant de dash

CREATE TABLE IF NOT EXISTS public.comptabilite_relances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id  UUID NOT NULL REFERENCES public.comptabilite_factures(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'auto' CHECK (type IN ('auto','manuelle')),
  niveau      SMALLINT NOT NULL DEFAULT 1 CHECK (niveau IN (1,2,3)),
  message     TEXT,
  date_relance DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by  UUID REFERENCES public.utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_relances_facture ON public.comptabilite_relances (facture_id);

ALTER TABLE public.comptabilite_relances DISABLE ROW LEVEL SECURITY;
