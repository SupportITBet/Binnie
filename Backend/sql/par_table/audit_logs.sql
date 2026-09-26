-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `audit_logs`
-- Généré à partir de 2 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── audit_migration.sql  (2026-05-25) ──────────────────────────────
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

-- ── audit_plateforme_migration.sql  (2026-07-11) ──────────────────────────────
-- ============================================================
-- audit_plateforme_migration.sql
-- Ajoute une colonne plateforme à audit_logs pour empêcher dash
-- et bet-elearning de voir mutuellement leurs journaux d'audit
-- respectifs (même table, deux apps admin distinctes).
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS plateforme text;

CREATE INDEX IF NOT EXISTS idx_audit_plateforme ON audit_logs (plateforme);

-- Backfill des lignes historiques à partir du module — best effort, les modules
-- réellement partagés (entreprise, apprenants, upload, coachs, centres…) restent
-- NULL et continuent d'être visibles des deux côtés (comportement inchangé).
UPDATE audit_logs SET plateforme = 'dash' WHERE plateforme IS NULL AND module IN (
  'boutique','paiements','level_test','level_tests','devis','contact','leads',
  'newsletter','sondage','messages','blog','temoignages','equipe_photos',
  'partenaires','parcours','corporate','marquee','codes_promo','avis',
  'groupes','contrats_prives','plaintes','config_contact','faq','carousel',
  'offre_media','cinetpay','seances_privees','fichiers_prives','cours_elearning',
  'mon_espace','remplacements','seances'
);

UPDATE audit_logs SET plateforme = 'bet-elearning' WHERE plateforme IS NULL AND module IN (
  'onboarding','classes','contenus','tickets','placement','gamification','bet_elearning'
);

