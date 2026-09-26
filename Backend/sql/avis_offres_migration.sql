-- ══════════════════════════════════════════════════════════════
-- AVIS SUR LES OFFRES (cours en ligne & certifications)
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.avis_offres (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offre_type      TEXT        NOT NULL CHECK (offre_type IN ('cours','certification')),
  offre_id        TEXT,                         -- slug ou id de l'offre (optionnel)
  apprenant_email TEXT        NOT NULL,
  apprenant_nom   TEXT,
  note            INT         NOT NULL DEFAULT 5 CHECK (note BETWEEN 1 AND 5),
  texte           TEXT        NOT NULL,
  actif           BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avis_offre_type ON public.avis_offres(offre_type);
CREATE INDEX IF NOT EXISTS idx_avis_actif      ON public.avis_offres(actif);
CREATE INDEX IF NOT EXISTS idx_avis_email      ON public.avis_offres(apprenant_email);

-- RLS
ALTER TABLE public.avis_offres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avis_read_actif" ON public.avis_offres
  FOR SELECT USING (actif = true);

CREATE POLICY "avis_service_all" ON public.avis_offres
  FOR ALL USING (true) WITH CHECK (true);
