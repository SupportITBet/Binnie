-- ============================================================
-- evaluations_groupes_notif_cloture_migration.sql
-- Équivalent dash de devoirs_notif_cloture_migration.sql — marqueur pour ne
-- notifier qu'une seule fois les apprenants + le coach quand la deadline
-- d'une évaluation (devoir/examen/évaluation) est dépassée (job périodique
-- notifierEvaluationsGroupesClotures.js).
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

ALTER TABLE evaluations_groupes ADD COLUMN IF NOT EXISTS deadline_notifiee BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_eg_deadline_notifiee ON evaluations_groupes(statut, deadline_notifiee);
