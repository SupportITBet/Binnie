-- ============================================================
-- audit_migration.sql
-- Creates the audit_logs table, indexes, and RLS policies.
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE).
-- ============================================================

-- Table audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  acteur_id    uuid,
  acteur_nom   text,
  acteur_email text,
  acteur_role  text        DEFAULT 'system',
  action_type  text        NOT NULL,
  module       text        DEFAULT 'system',
  entite_type  text,
  entite_id    text,
  centre       text,
  detail       text,
  metadata     jsonb       DEFAULT '{}',
  ip_address   text,
  user_agent   text,
  statut       text        DEFAULT 'success'
                           CHECK (statut IN ('success', 'warning', 'danger', 'info')),
  created_at   timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_created_at   ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_acteur_id    ON audit_logs (acteur_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_type  ON audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_module       ON audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_audit_centre       ON audit_logs (centre);
CREATE INDEX IF NOT EXISTS idx_audit_statut       ON audit_logs (statut);

-- RLS: only service_role can write; anon cannot read
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy first so the script is idempotent
DROP POLICY IF EXISTS "Service role full access" ON audit_logs;

CREATE POLICY "Service role full access"
  ON audit_logs
  TO service_role
  USING (true)
  WITH CHECK (true);
