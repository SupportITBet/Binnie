-- Comptabilité analytique (axes/centres de coûts) — bet-elearning, indépendant de dash

CREATE TABLE IF NOT EXISTS public.comptabilite_axes_analytiques (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  libelle    TEXT NOT NULL,
  actif      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.comptabilite_axes_analytiques (code, libelle) VALUES
  ('pedagogie', 'Pédagogie'),
  ('commercial', 'Commercial'),
  ('rh', 'RH'),
  ('marketing', 'Marketing'),
  ('administration', 'Administration')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.comptabilite_depenses ADD COLUMN IF NOT EXISTS axe_analytique_id UUID REFERENCES public.comptabilite_axes_analytiques(id);
ALTER TABLE public.comptabilite_factures_achat ADD COLUMN IF NOT EXISTS axe_analytique_id UUID REFERENCES public.comptabilite_axes_analytiques(id);

ALTER TABLE public.comptabilite_axes_analytiques DISABLE ROW LEVEL SECURITY;
