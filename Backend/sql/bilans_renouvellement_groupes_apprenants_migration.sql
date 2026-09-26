-- ══════════════════════════════════════════════════════════════
-- Bilans & Renouvellements réels (onglet OnboardingDashboard.jsx)
-- Remplace l'ancienne liste mockée (INIT_BILANS) — les bilans/candidats
-- sont calculés à la volée (groupes.date_fin, groupes_presences,
-- resultats_evaluations_groupes), seul l'état de l'alerte commerciale
-- doit être persisté.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE groupes_apprenants ADD COLUMN IF NOT EXISTS bilan_alerte_envoyee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE groupes_apprenants ADD COLUMN IF NOT EXISTS bilan_alerte_date TIMESTAMPTZ;
