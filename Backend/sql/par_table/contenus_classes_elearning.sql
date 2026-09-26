-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `contenus_classes_elearning`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── contenus_classes_elearning_migration.sql  (2026-07-02) ──────────────────────────────
-- Contenus pédagogiques créés par les coachs dans le portail bet-elearning
-- Liés aux classes_elearning (pas aux groupes BET classiques)

CREATE TABLE IF NOT EXISTS contenus_classes_elearning (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID        NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  classe_id     UUID        REFERENCES classes_elearning(id) ON DELETE SET NULL,
  titre         TEXT        NOT NULL,
  categorie     TEXT        DEFAULT '',        -- regroupement / "module" affiché dans l'UI
  type_contenu  TEXT        DEFAULT 'lecon',   -- lecon | quiz | exercice | ressource | autre
  semaine       INTEGER     DEFAULT 1,
  statut        TEXT        DEFAULT 'brouillon', -- brouillon | publie
  est_visible   BOOLEAN     DEFAULT false,
  blocs         JSONB       DEFAULT '[]',
  objectifs     TEXT        DEFAULT '',
  duree_estimee INTEGER     DEFAULT 30,
  ordre         INTEGER     DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cce_coach  ON contenus_classes_elearning(coach_id);
CREATE INDEX IF NOT EXISTS idx_cce_classe ON contenus_classes_elearning(classe_id);

