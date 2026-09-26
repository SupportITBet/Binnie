-- ══════════════════════════════════════════════════════════════
-- TABLE plaintes — Contrôle qualité & gestion des plaintes clients
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.plaintes (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_type                  TEXT        DEFAULT 'general',
  -- 'parcours' | 'prive' | 'general'
  ref_id                    TEXT,
  -- id de l'assignation (parcours) ou du contrat (prive)
  apprenant_nom             TEXT        NOT NULL,
  apprenant_email           TEXT,
  apprenant_telephone       TEXT,
  coach_id                  UUID,
  coach_nom                 TEXT,
  objet                     TEXT        NOT NULL,
  description               TEXT,
  priorite                  TEXT        NOT NULL DEFAULT 'normale',
  -- 'faible' | 'normale' | 'haute' | 'critique'
  statut                    TEXT        NOT NULL DEFAULT 'ouverte',
  -- 'ouverte' | 'en_cours' | 'resolue' | 'fermee'
  note_resolution           TEXT,
  date_resolution           DATE,
  signale_par_id            UUID,
  signale_par_nom           TEXT,
  prise_en_charge_par_id    UUID,
  prise_en_charge_par_nom   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plaintes_statut    ON public.plaintes(statut);
CREATE INDEX IF NOT EXISTS idx_plaintes_priorite  ON public.plaintes(priorite);
CREATE INDEX IF NOT EXISTS idx_plaintes_created   ON public.plaintes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plaintes_ref       ON public.plaintes(ref_type, ref_id);

ALTER TABLE public.plaintes DISABLE ROW LEVEL SECURITY;
