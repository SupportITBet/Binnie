-- Table remplacements : demandes d'absence / remplacement des coachs
CREATE TABLE IF NOT EXISTS remplacements (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  absent_id       UUID        NOT NULL REFERENCES utilisateurs(id),
  absent_nom      TEXT        NOT NULL,
  groupe_id       UUID        REFERENCES groupes(id),
  groupe_nom      TEXT,
  date_debut      DATE        NOT NULL,
  date_fin        DATE        NOT NULL,
  nb_sessions     INTEGER     DEFAULT 0,
  sessions_ids    JSONB       DEFAULT '[]',
  motif           TEXT,
  message         TEXT,
  statut          TEXT        NOT NULL DEFAULT 'a_pourvoir',  -- a_pourvoir | en_cours | termine
  remplacant_id   UUID        REFERENCES utilisateurs(id),
  remplacant_nom  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_remplacements_statut    ON remplacements(statut);
CREATE INDEX IF NOT EXISTS idx_remplacements_absent    ON remplacements(absent_id);
CREATE INDEX IF NOT EXISTS idx_remplacements_created   ON remplacements(created_at DESC);
