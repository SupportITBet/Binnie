-- TVA — synthèse et déclarations (bet-elearning, indépendant de dash)

INSERT INTO public.comptabilite_plan_comptable (numero, libelle, classe, type) VALUES
  ('444000', 'État, TVA due', 4, 'passif')
ON CONFLICT (numero) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.comptabilite_tva_declarations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_mois    SMALLINT NOT NULL CHECK (periode_mois BETWEEN 1 AND 12),
  periode_annee   SMALLINT NOT NULL,
  tva_collectee   NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_deductible  NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_a_payer     NUMERIC(12,2) NOT NULL DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','declaree','payee')),
  date_declaration DATE,
  date_paiement    DATE,
  ecriture_id      UUID REFERENCES public.comptabilite_ecritures(id),
  notes            TEXT,
  created_by       UUID REFERENCES public.utilisateurs(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (periode_mois, periode_annee)
);
CREATE INDEX IF NOT EXISTS idx_compta_tva_periode ON public.comptabilite_tva_declarations (periode_annee, periode_mois);

ALTER TABLE public.comptabilite_tva_declarations DISABLE ROW LEVEL SECURITY;
