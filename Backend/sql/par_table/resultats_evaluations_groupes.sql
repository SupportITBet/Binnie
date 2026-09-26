-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `resultats_evaluations_groupes`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── evaluations_groupes_migration.sql  (2026-07-06) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════════
-- MIGRATION : evaluations_groupes + resultats_evaluations_groupes
-- /dash — indépendant de bet-elearning
-- EXÉCUTER EN ENTIER dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- TABLE 1 : evaluations_groupes
-- Devoirs / exercices / évaluations créés par le coach pour un groupe /dash
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evaluations_groupes (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID    NOT NULL REFERENCES utilisateurs(id)  ON DELETE CASCADE,
  groupe_id       UUID    NOT NULL REFERENCES groupes(id)       ON DELETE CASCADE,
  titre           TEXT    NOT NULL,

  -- Catégorie pédagogique
  categorie       TEXT    NOT NULL DEFAULT 'evaluation',
    -- devoir | exercice | evaluation | examen

  -- Format du contenu
  type            TEXT    NOT NULL DEFAULT 'qcm',
    -- qcm | texte_libre | listening | audio | quiz | speaking | exercice | positionnement

  -- Type de rendu attendu de l'apprenant
  type_rendu      TEXT    NOT NULL DEFAULT 'texte',
    -- fichier | texte | les_deux

  instructions    TEXT,
  questions       JSONB   DEFAULT '[]',
    -- [{ id, enonce, type, options[], correct, points, explication }]
  ressource_url   TEXT,
  sur_toeic       BOOLEAN NOT NULL DEFAULT FALSE,
  duree_min       INTEGER DEFAULT 60,

  -- Programmation : ouverture (null = disponible dès publication)
  date_ouverture  DATE,
  heure_ouverture TEXT    DEFAULT '00:00',

  -- Deadline soumission
  date_evaluation DATE,
  heure_debut     TEXT    DEFAULT '23:59',

  -- Cycle de vie
  statut          TEXT    NOT NULL DEFAULT 'brouillon',
    -- brouillon | publie | termine

  notifier_eleves BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID    REFERENCES utilisateurs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patch si la table existait déjà sans les nouvelles colonnes
ALTER TABLE evaluations_groupes ADD COLUMN IF NOT EXISTS categorie      TEXT    DEFAULT 'evaluation';
ALTER TABLE evaluations_groupes ADD COLUMN IF NOT EXISTS type_rendu     TEXT    DEFAULT 'texte';
ALTER TABLE evaluations_groupes ADD COLUMN IF NOT EXISTS date_ouverture DATE;
ALTER TABLE evaluations_groupes ADD COLUMN IF NOT EXISTS heure_ouverture TEXT   DEFAULT '00:00';

-- ─────────────────────────────────────────────────────────────────
-- TABLE 2 : resultats_evaluations_groupes
-- Soumissions/rendus des apprenants pour chaque évaluation
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resultats_evaluations_groupes (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id   UUID    NOT NULL REFERENCES evaluations_groupes(id) ON DELETE CASCADE,
  ga_id           UUID    NOT NULL,
    -- id dans groupes_apprenants (inscription au groupe)
  groupe_id       UUID    NOT NULL REFERENCES groupes(id) ON DELETE CASCADE,

  -- Soumission
  type_soumission TEXT,
    -- fichier | texte | qcm
  contenu_texte   TEXT,
  reponses_qcm    JSONB   DEFAULT '{}',
    -- { "0": "optionA", "1": "optionC", ... }
  fichier_url     TEXT,
  fichier_nom     TEXT,

  -- Correction
  note            NUMERIC(5,2),
  note_max        NUMERIC(5,2) DEFAULT 20,
  commentaire_coach TEXT,
  corrige_par     UUID    REFERENCES utilisateurs(id),
  corrige_at      TIMESTAMPTZ,

  -- Cycle de vie
  statut          TEXT    NOT NULL DEFAULT 'a_faire',
    -- a_faire | rendu | corrige | en_retard

  rendu_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (evaluation_id, ga_id)
);

-- Patch si la table existait déjà sans les nouvelles colonnes
ALTER TABLE resultats_evaluations_groupes ADD COLUMN IF NOT EXISTS type_soumission TEXT;
ALTER TABLE resultats_evaluations_groupes ADD COLUMN IF NOT EXISTS contenu_texte   TEXT;
ALTER TABLE resultats_evaluations_groupes ADD COLUMN IF NOT EXISTS reponses_qcm   JSONB DEFAULT '{}';
ALTER TABLE resultats_evaluations_groupes ADD COLUMN IF NOT EXISTS fichier_url     TEXT;
ALTER TABLE resultats_evaluations_groupes ADD COLUMN IF NOT EXISTS fichier_nom     TEXT;
ALTER TABLE resultats_evaluations_groupes ADD COLUMN IF NOT EXISTS corrige_par     UUID;
ALTER TABLE resultats_evaluations_groupes ADD COLUMN IF NOT EXISTS corrige_at      TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────
-- INDEX
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eval_groupes_coach    ON evaluations_groupes(coach_id);
CREATE INDEX IF NOT EXISTS idx_eval_groupes_groupe   ON evaluations_groupes(groupe_id);
CREATE INDEX IF NOT EXISTS idx_eval_groupes_statut   ON evaluations_groupes(statut);
CREATE INDEX IF NOT EXISTS idx_res_eval_eval_id      ON resultats_evaluations_groupes(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_res_eval_ga_id        ON resultats_evaluations_groupes(ga_id);
CREATE INDEX IF NOT EXISTS idx_res_eval_statut       ON resultats_evaluations_groupes(statut);

-- ─────────────────────────────────────────────────────────────────
-- TRIGGER updated_at
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_evaluations_groupes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eval_groupes_updated_at ON evaluations_groupes;
CREATE TRIGGER trg_eval_groupes_updated_at
  BEFORE UPDATE ON evaluations_groupes
  FOR EACH ROW EXECUTE FUNCTION update_evaluations_groupes_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- RLS — accès géré au niveau applicatif (backend)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE evaluations_groupes             DISABLE ROW LEVEL SECURITY;
ALTER TABLE resultats_evaluations_groupes   DISABLE ROW LEVEL SECURITY;

