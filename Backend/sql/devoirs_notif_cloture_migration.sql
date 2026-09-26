-- ============================================================
-- devoirs_notif_cloture_migration.sql
-- Ajoute un marqueur pour ne notifier qu'une seule fois les apprenants quand la
-- deadline d'un devoir est dépassée (job périodique côté backend).
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

ALTER TABLE devoirs_elearning ADD COLUMN IF NOT EXISTS deadline_notifiee BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_de_deadline_notifiee ON devoirs_elearning(statut, deadline_notifiee);
