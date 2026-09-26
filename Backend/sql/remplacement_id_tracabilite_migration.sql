-- Traçabilité : jusqu'ici, une fois `coach_id` réattribué au remplaçant, rien ne
-- distinguait en base une séance "normale" d'une séance "assurée en remplacement"
-- (vérifié : ni seances_elearning ni seances n'avaient de champ pour ça). Ce champ
-- permet d'afficher "séance assurée en remplacement de X" côté honoraires, et sert
-- aussi de marqueur pour ne réattribuer/recalculer qu'une fois.
-- `remplacements.id` est TEXT (pas UUID — voir remplacements_migration.sql:3,
-- `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`), d'où le type ici.
ALTER TABLE seances_elearning ADD COLUMN IF NOT EXISTS remplacement_id TEXT REFERENCES remplacements(id) ON DELETE SET NULL;
ALTER TABLE seances           ADD COLUMN IF NOT EXISTS remplacement_id TEXT REFERENCES remplacements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seances_elearning_remplacement ON seances_elearning(remplacement_id);
CREATE INDEX IF NOT EXISTS idx_seances_remplacement           ON seances(remplacement_id);
