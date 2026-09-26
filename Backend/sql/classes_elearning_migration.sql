-- ══════════════════════════════════════════════════════════════
-- Migration : table classes_elearning
-- Classes propres à la plateforme BET E-Learning (entreprises)
-- Séparées des groupes de l'école physique BET
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.classes_elearning (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT        NOT NULL,
  entreprise_id   UUID        NULL,          -- lien optionnel vers une entreprise
  entreprise_nom  TEXT        NULL,
  niveau          TEXT        NULL,          -- A1, A2, B1, B2, C1, C2
  type_cours      TEXT        NOT NULL DEFAULT 'en_ligne',  -- en_ligne | presentiel | hybride
  coach_id        UUID        NULL,          -- utilisateurs.id du coach assigné
  coach_nom       TEXT        NULL,          -- dénormalisé pour affichage rapide
  horaire         JSONB       NOT NULL DEFAULT '[]',  -- [{jour, debut, fin}]
  date_debut      DATE        NULL,
  date_fin        DATE        NULL,
  capacite_max    INT         NOT NULL DEFAULT 10,
  statut          TEXT        NOT NULL DEFAULT 'actif',  -- actif | inactif | archive
  created_by      UUID        NULL,
  created_by_nom  TEXT        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour filtrage fréquent
CREATE INDEX IF NOT EXISTS idx_classes_elearning_entreprise
  ON public.classes_elearning(entreprise_id);

CREATE INDEX IF NOT EXISTS idx_classes_elearning_statut
  ON public.classes_elearning(statut);

CREATE INDEX IF NOT EXISTS idx_classes_elearning_niveau
  ON public.classes_elearning(niveau);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_classes_elearning_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_classes_elearning_updated_at ON public.classes_elearning;
CREATE TRIGGER trg_classes_elearning_updated_at
  BEFORE UPDATE ON public.classes_elearning
  FOR EACH ROW EXECUTE FUNCTION update_classes_elearning_updated_at();

-- RLS : lecture publique autorisée pour les utilisateurs authentifiés
ALTER TABLE public.classes_elearning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classes_elearning_select" ON public.classes_elearning;
CREATE POLICY "classes_elearning_select" ON public.classes_elearning
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "classes_elearning_insert" ON public.classes_elearning;
CREATE POLICY "classes_elearning_insert" ON public.classes_elearning
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "classes_elearning_update" ON public.classes_elearning;
CREATE POLICY "classes_elearning_update" ON public.classes_elearning
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Table de liaison apprenants ↔ classes_elearning
CREATE TABLE IF NOT EXISTS public.classes_elearning_apprenants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id       UUID        NOT NULL REFERENCES public.classes_elearning(id) ON DELETE CASCADE,
  apprenant_id    UUID        NULL,          -- utilisateurs.id si compte créé
  nom_complet     TEXT        NOT NULL,
  email           TEXT        NULL,
  telephone       TEXT        NULL,
  niveau_cecr     TEXT        NULL,          -- niveau après test de placement
  statut          TEXT        NOT NULL DEFAULT 'actif',  -- actif | suspendu
  date_inscription DATE       NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cea_classe ON public.classes_elearning_apprenants(classe_id);
CREATE INDEX IF NOT EXISTS idx_cea_apprenant ON public.classes_elearning_apprenants(apprenant_id);

ALTER TABLE public.classes_elearning_apprenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cea_select" ON public.classes_elearning_apprenants;
CREATE POLICY "cea_select" ON public.classes_elearning_apprenants
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "cea_insert" ON public.classes_elearning_apprenants;
CREATE POLICY "cea_insert" ON public.classes_elearning_apprenants
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
