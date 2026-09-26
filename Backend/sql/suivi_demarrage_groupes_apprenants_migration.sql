-- ══════════════════════════════════════════════════════════════
-- Suivi de démarrage réel des apprenants fraîchement inscrits, sur
-- OnboardingDashboard.jsx (onglet "Suivi démarrage") et sur le
-- dashboard de la commerciale centre (présentiel, son propre suivi).
-- Remplace l'ancienne checklist mockée (INIT_SUIVIS) par un vrai état
-- persistant, porté directement par groupes_apprenants.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE groupes_apprenants ADD COLUMN IF NOT EXISTS suivi_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE groupes_apprenants ADD COLUMN IF NOT EXISTS suivi_notes TEXT;
