-- ══════════════════════════════════════════════════════════════
-- Migration : inscriptions_elearning
-- Parcours d'inscription entreprise → Onboarding → Placement → Classe
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inscriptions_elearning (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entreprise source
  entreprise_id    UUID        NULL,
  entreprise_nom   TEXT        NULL,

  -- Bénéficiaire
  nom_complet      TEXT        NOT NULL,
  email            TEXT        NULL,
  telephone        TEXT        NULL,
  poste            TEXT        NULL,
  departement      TEXT        NULL,
  langue_souhaitee TEXT        NULL DEFAULT 'Anglais',
  niveau_declare   TEXT        NULL,          -- niveau auto-déclaré par l'entreprise

  -- Statut du parcours
  -- recu → verifie → transmis_placement → teste → assigne → actif
  statut           TEXT        NOT NULL DEFAULT 'recu',

  -- Résultats placement
  niveau_detecte   TEXT        NULL,          -- niveau après test
  notes_placement  TEXT        NULL,
  date_test        DATE        NULL,

  -- Assignation classe
  classe_id        UUID        NULL REFERENCES public.classes_elearning(id) ON DELETE SET NULL,
  classe_nom       TEXT        NULL,
  date_assignation DATE        NULL,

  -- Traçabilité
  source           TEXT        NOT NULL DEFAULT 'entreprise_portail', -- entreprise_portail | onboarding_manuel | onboarding_excel
  notes_onboarding TEXT        NULL,
  onboarding_id    UUID        NULL,          -- utilisateurs.id de l'agent onboarding
  placement_id     UUID        NULL,          -- utilisateurs.id de l'agent placement
  pa_id            UUID        NULL,          -- utilisateurs.id du PA advisor

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inscr_el_entreprise ON public.inscriptions_elearning(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_inscr_el_statut     ON public.inscriptions_elearning(statut);
CREATE INDEX IF NOT EXISTS idx_inscr_el_classe     ON public.inscriptions_elearning(classe_id);

CREATE OR REPLACE FUNCTION update_inscriptions_elearning_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inscr_el_updated_at ON public.inscriptions_elearning;
CREATE TRIGGER trg_inscr_el_updated_at
  BEFORE UPDATE ON public.inscriptions_elearning
  FOR EACH ROW EXECUTE FUNCTION update_inscriptions_elearning_updated_at();

ALTER TABLE public.inscriptions_elearning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inscr_el_select" ON public.inscriptions_elearning;
CREATE POLICY "inscr_el_select" ON public.inscriptions_elearning
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "inscr_el_insert" ON public.inscriptions_elearning;
CREATE POLICY "inscr_el_insert" ON public.inscriptions_elearning
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "inscr_el_update" ON public.inscriptions_elearning;
CREATE POLICY "inscr_el_update" ON public.inscriptions_elearning
  FOR UPDATE USING (auth.role() = 'authenticated');
