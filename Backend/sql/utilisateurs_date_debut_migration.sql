-- Date de début (collaboration BET) pour tous les profils créés par le SuperAdmin,
-- hors coach qui a déjà son propre champ équivalent dans coach_info.date_debut_bet.
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS date_debut date;
