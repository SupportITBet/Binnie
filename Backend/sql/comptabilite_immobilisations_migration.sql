-- Immobilisations & amortissements (bet-elearning, indépendant de dash)

INSERT INTO public.comptabilite_plan_comptable (numero, libelle, classe, type) VALUES
  ('681000', 'Dotations aux amortissements', 6, 'charge')
ON CONFLICT (numero) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.comptabilite_immobilisations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle                     TEXT NOT NULL,
  categorie                   TEXT NOT NULL DEFAULT 'materiel',
  valeur_acquisition          NUMERIC(12,2) NOT NULL,
  date_acquisition            DATE NOT NULL DEFAULT CURRENT_DATE,
  duree_amortissement_annees  SMALLINT NOT NULL DEFAULT 5,
  valeur_residuelle           NUMERIC(12,2) NOT NULL DEFAULT 0,
  fournisseur_id              UUID REFERENCES public.comptabilite_fournisseurs(id),
  statut                      TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active','cedee','reformee')),
  date_cession                DATE,
  valeur_cession               NUMERIC(12,2),
  notes                       TEXT,
  created_by                  UUID REFERENCES public.utilisateurs(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comptabilite_immobilisations_amortissements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  immobilisation_id      UUID NOT NULL REFERENCES public.comptabilite_immobilisations(id) ON DELETE CASCADE,
  exercice_annee         SMALLINT NOT NULL,
  montant_amortissement  NUMERIC(12,2) NOT NULL,
  cumul_amortissement    NUMERIC(12,2) NOT NULL,
  valeur_nette_comptable NUMERIC(12,2) NOT NULL,
  ecriture_id            UUID REFERENCES public.comptabilite_ecritures(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (immobilisation_id, exercice_annee)
);
CREATE INDEX IF NOT EXISTS idx_compta_immo_amort_immo ON public.comptabilite_immobilisations_amortissements (immobilisation_id);

ALTER TABLE public.comptabilite_immobilisations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptabilite_immobilisations_amortissements DISABLE ROW LEVEL SECURITY;
