-- ═══════════════════════════════════════════════════
--  TABLE : evaluations_coachs
--  Évaluations périodiques des coachs par le PA/Respo
--  À exécuter dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS evaluations_coachs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id              UUID        NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  evaluateur_id         UUID        NOT NULL,
  evaluateur_nom        TEXT,
  periode               TEXT        NOT NULL,          -- ex: "T1 2026", "Mai 2026"
  date_evaluation       DATE        DEFAULT CURRENT_DATE,

  -- Critères notés de 1 à 5
  ponctualite           SMALLINT    CHECK(ponctualite           BETWEEN 1 AND 5),
  qualite_pedagogique   SMALLINT    CHECK(qualite_pedagogique   BETWEEN 1 AND 5),
  satisfaction_apprenants SMALLINT  CHECK(satisfaction_apprenants BETWEEN 1 AND 5),
  respect_programme     SMALLINT    CHECK(respect_programme     BETWEEN 1 AND 5),
  communication         SMALLINT    CHECK(communication         BETWEEN 1 AND 5),

  note_finale           NUMERIC(3,1),                  -- moyenne pondérée calculée
  rapport               TEXT,
  points_forts          TEXT,
  axes_amelioration     TEXT,
  statut                TEXT        DEFAULT 'validée'  CHECK(statut IN ('brouillon','validée')),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_eval_coachs_coach    ON evaluations_coachs(coach_id);
CREATE INDEX IF NOT EXISTS idx_eval_coachs_eval     ON evaluations_coachs(evaluateur_id);
CREATE INDEX IF NOT EXISTS idx_eval_coachs_date     ON evaluations_coachs(date_evaluation DESC);
CREATE INDEX IF NOT EXISTS idx_eval_coachs_periode  ON evaluations_coachs(periode);

-- RLS
ALTER TABLE evaluations_coachs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full" ON evaluations_coachs FOR ALL TO service_role USING (true) WITH CHECK (true);
