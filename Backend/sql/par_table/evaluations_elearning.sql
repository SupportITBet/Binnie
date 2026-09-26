-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `evaluations_elearning`
-- Généré à partir de 2 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── SETUP_PARCOURS_PLACEMENT.sql  (2026-07-02) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════════════════════
-- SETUP COMPLET : Parcours inscription → Onboarding → Placement → Classe
-- À exécuter UNE FOIS dans Supabase SQL Editor (dans l'ordre)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Table inscriptions_elearning ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inscriptions_elearning (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id    UUID        NULL,
  entreprise_nom   TEXT        NULL,
  nom_complet      TEXT        NOT NULL,
  email            TEXT        NULL,
  telephone        TEXT        NULL,
  poste            TEXT        NULL,
  departement      TEXT        NULL,
  langue_souhaitee TEXT        NULL DEFAULT 'Anglais',
  niveau_declare   TEXT        NULL,
  statut           TEXT        NOT NULL DEFAULT 'recu',
  niveau_detecte   TEXT        NULL,
  notes_placement  TEXT        NULL,
  date_test        DATE        NULL,
  classe_id        UUID        NULL REFERENCES public.classes_elearning(id) ON DELETE SET NULL,
  classe_nom       TEXT        NULL,
  date_assignation DATE        NULL,
  source           TEXT        NOT NULL DEFAULT 'entreprise_portail',
  notes_onboarding TEXT        NULL,
  onboarding_id    UUID        NULL,
  placement_id     UUID        NULL,
  pa_id            UUID        NULL,
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


-- ── 2. Colonnes manquantes sur inscriptions_adultes ──────────────────────────
ALTER TABLE public.inscriptions_adultes
  ADD COLUMN IF NOT EXISTS type_client      TEXT DEFAULT 'particulier',
  ADD COLUMN IF NOT EXISTS entreprise_id    UUID,
  ADD COLUMN IF NOT EXISTS entreprise_nom   TEXT,
  ADD COLUMN IF NOT EXISTS notes_placement  TEXT,
  ADD COLUMN IF NOT EXISTS date_test        DATE,
  ADD COLUMN IF NOT EXISTS onboarding_id    UUID;

-- Valeurs de statut étendues pour le parcours placement
-- (statuts existants : nouveau, contacte, inscription_en_cours, inscrit, annule, perdu)
-- Nouveaux statuts pour le parcours e-learning :
-- en_attente_test, test_en_cours, teste, assigne

CREATE INDEX IF NOT EXISTS idx_inscr_adultes_statut_test
  ON public.inscriptions_adultes(statut)
  WHERE statut IN ('en_attente_test', 'test_en_cours', 'teste');

CREATE INDEX IF NOT EXISTS idx_inscr_adultes_onboarding
  ON public.inscriptions_adultes(onboarding_id);


-- ── 3. Table evaluations_elearning (si pas encore créée) ─────────────────────
CREATE TABLE IF NOT EXISTS public.evaluations_elearning (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id                UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  classe_id               UUID REFERENCES classes_elearning(id) ON DELETE SET NULL,
  evaluateur_id           UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  evaluateur_nom          TEXT,
  periode                 TEXT NOT NULL DEFAULT '',
  ponctualite             INTEGER CHECK (ponctualite BETWEEN 1 AND 5),
  qualite_pedagogique     INTEGER CHECK (qualite_pedagogique BETWEEN 1 AND 5),
  satisfaction_apprenants INTEGER CHECK (satisfaction_apprenants BETWEEN 1 AND 5),
  respect_programme       INTEGER CHECK (respect_programme BETWEEN 1 AND 5),
  communication           INTEGER CHECK (communication BETWEEN 1 AND 5),
  note_finale             NUMERIC(3,1),
  rapport                 TEXT,
  points_forts            TEXT,
  axes_amelioration       TEXT,
  statut                  TEXT DEFAULT 'validée' CHECK (statut IN ('validée','planifiée')),
  date_evaluation         TIMESTAMPTZ DEFAULT NOW(),
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_el_coach   ON evaluations_elearning(coach_id);
CREATE INDEX IF NOT EXISTS idx_eval_el_classe  ON evaluations_elearning(classe_id);
CREATE INDEX IF NOT EXISTS idx_eval_el_date    ON evaluations_elearning(date_evaluation DESC);

ALTER TABLE evaluations_elearning ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_full_access_eval_el" ON evaluations_elearning;
CREATE POLICY "admins_full_access_eval_el" ON evaluations_elearning
  FOR ALL USING (true) WITH CHECK (true);

-- ── evaluations_elearning_migration.sql  (2026-07-02) ──────────────────────────────
-- Table dédiée aux évaluations des coachs e-learning (PA Advisor)
-- Séparée de evaluations_coachs qui concerne les coachs BET classiques

CREATE TABLE IF NOT EXISTS evaluations_elearning (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id                UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  classe_id               UUID REFERENCES classes_elearning(id) ON DELETE SET NULL,
  evaluateur_id           UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  evaluateur_nom          TEXT,
  periode                 TEXT NOT NULL,
  -- Critères (1–5)
  ponctualite             INTEGER CHECK (ponctualite BETWEEN 1 AND 5),
  qualite_pedagogique     INTEGER CHECK (qualite_pedagogique BETWEEN 1 AND 5),
  satisfaction_apprenants INTEGER CHECK (satisfaction_apprenants BETWEEN 1 AND 5),
  respect_programme       INTEGER CHECK (respect_programme BETWEEN 1 AND 5),
  communication           INTEGER CHECK (communication BETWEEN 1 AND 5),
  -- Note calculée
  note_finale             NUMERIC(3,1),
  -- Textes libres
  rapport                 TEXT,
  points_forts            TEXT,
  axes_amelioration       TEXT,
  statut                  TEXT DEFAULT 'validée' CHECK (statut IN ('validée','planifiée')),
  date_evaluation         TIMESTAMPTZ DEFAULT NOW(),
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour accélerer les requêtes par coach et par classe
CREATE INDEX IF NOT EXISTS idx_eval_el_coach   ON evaluations_elearning(coach_id);
CREATE INDEX IF NOT EXISTS idx_eval_el_classe  ON evaluations_elearning(classe_id);
CREATE INDEX IF NOT EXISTS idx_eval_el_date    ON evaluations_elearning(date_evaluation DESC);

-- RLS : accessible aux admins authentifiés
ALTER TABLE evaluations_elearning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_full_access_eval_el" ON evaluations_elearning;
CREATE POLICY "admins_full_access_eval_el" ON evaluations_elearning
  FOR ALL USING (true) WITH CHECK (true);

