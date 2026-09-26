-- Table de configuration du portail d'accès staff (code partagé demandé sur "/")
CREATE TABLE IF NOT EXISTS access_gate_config (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  code_hash  TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ligne unique, sans code par défaut (le Super Admin le définit depuis son dashboard)
INSERT INTO access_gate_config (id, code_hash)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;
