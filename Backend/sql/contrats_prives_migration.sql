-- ══════════════════════════════════════════════════════════════
-- TABLE contrats_prives — Contrats privés coach/apprenant
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contrats_prives (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id                    UUID        NOT NULL,
  apprenant_nom               TEXT        NOT NULL,
  apprenant_prenom            TEXT,
  apprenant_email             TEXT,
  apprenant_telephone         TEXT,
  type_contrat                TEXT        NOT NULL DEFAULT 'en_ligne',
  -- 'en_ligne' | 'presentiel_bet' | 'domicile'
  niveau                      TEXT,
  objectif                    TEXT,
  prix_h                      NUMERIC(10,2) NOT NULL DEFAULT 0,
  nb_seances_total            INT         DEFAULT 0,
  nb_seances_realisees        INT         DEFAULT 0,
  duree_seance_h              NUMERIC(3,1) DEFAULT 1.5,
  date_debut                  DATE,
  date_fin                    DATE,
  statut                      TEXT        NOT NULL DEFAULT 'en_attente',
  -- 'en_attente' | 'actif' | 'suspendu' | 'termine' | 'renouvele' | 'non_renouvele'
  paiement_confirme           BOOLEAN     NOT NULL DEFAULT false,
  paiement_montant            NUMERIC(10,2),
  paiement_date               DATE,
  note                        TEXT,
  renouvellement_statut       TEXT        DEFAULT NULL,
  -- NULL | 'en_attente' | 'confirme' | 'refuse'
  renouvellement_demande_date DATE,
  renouvellement_decision_date DATE,
  renouvellement_note         TEXT,
  created_by                  UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contrats_prives_coach   ON public.contrats_prives(coach_id);
CREATE INDEX IF NOT EXISTS idx_contrats_prives_statut  ON public.contrats_prives(statut);
CREATE INDEX IF NOT EXISTS idx_contrats_prives_datefin ON public.contrats_prives(date_fin);

ALTER TABLE public.contrats_prives DISABLE ROW LEVEL SECURITY;
