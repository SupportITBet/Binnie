-- Nationalité + pays de résidence (tous les profils, coach inclus) et matricule
-- (tous les profils sauf coach, qui a déjà coach_info.matricule).
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS nationalite text;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS pays_residence text;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS matricule text;
