-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `cours_elearning`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── cours_elearning_migration.sql  (2026-06-24) ──────────────────────────────
-- cours_elearning : cours créés par les coachs dans EspaceProfesseur
CREATE TABLE IF NOT EXISTS cours_elearning (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titre         TEXT NOT NULL,
  niveau        TEXT NOT NULL DEFAULT 'B1',
  emoji         TEXT DEFAULT '📚',
  color         TEXT DEFAULT '#2563eb',
  description   TEXT DEFAULT '',
  heures_totales INTEGER DEFAULT 20,
  heures_faites  INTEGER DEFAULT 0,
  statut        TEXT DEFAULT 'actif',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- modules_elearning : modules d'un cours e-learning
CREATE TABLE IF NOT EXISTS modules_elearning (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cours_id       UUID NOT NULL REFERENCES cours_elearning(id) ON DELETE CASCADE,
  coach_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom            TEXT NOT NULL,
  titre          TEXT,
  ordre          INTEGER DEFAULT 1,
  fait           BOOLEAN DEFAULT false,
  type_module    TEXT DEFAULT 'presentiel',
  date_seance    DATE,
  objectifs      JSONB DEFAULT '[]',
  duree_estimee  INTEGER DEFAULT 60,
  statut         TEXT DEFAULT 'brouillon',
  blocs          JSONB DEFAULT '[]',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Index pour filtrer par coach
CREATE INDEX IF NOT EXISTS idx_cours_elearning_coach_id ON cours_elearning(coach_id);
CREATE INDEX IF NOT EXISTS idx_modules_elearning_cours_id ON modules_elearning(cours_id);
CREATE INDEX IF NOT EXISTS idx_modules_elearning_coach_id ON modules_elearning(coach_id);

-- RLS
ALTER TABLE cours_elearning ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules_elearning ENABLE ROW LEVEL SECURITY;

-- Les coachs voient uniquement leurs propres cours/modules
CREATE POLICY "coach_own_cours" ON cours_elearning
  USING (coach_id = auth.uid());

CREATE POLICY "coach_own_modules" ON modules_elearning
  USING (coach_id = auth.uid());

