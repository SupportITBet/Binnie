-- Clôture d'exercice — bet-elearning, indépendant de dash

CREATE TABLE IF NOT EXISTS public.comptabilite_exercices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee               SMALLINT NOT NULL UNIQUE,
  statut              TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','cloture')),
  date_cloture        TIMESTAMPTZ,
  cloture_par         UUID REFERENCES public.utilisateurs(id),
  resultat_exercice   NUMERIC(12,2),
  ecriture_cloture_id UUID REFERENCES public.comptabilite_ecritures(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comptabilite_exercices DISABLE ROW LEVEL SECURITY;
