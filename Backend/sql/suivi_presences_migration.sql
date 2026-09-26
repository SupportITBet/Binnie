-- ══════════════════════════════════════════════════════════════
-- Suivi des présences / absences par apprenant
-- Saisie par le formateur (coach) — consultée par la commerciale
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Format JSON :
-- {
--   "seances_effectuees": 10,
--   "presences": 8,
--   "absences": 2,
--   "updated_at": "2026-05-11T14:30:00Z"
-- }
ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS suivi_presences JSONB DEFAULT NULL;
