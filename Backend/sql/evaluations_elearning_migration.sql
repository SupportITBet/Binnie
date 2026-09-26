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
