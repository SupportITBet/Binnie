-- Genre (M/F) pour tous les profils créés par le SuperAdmin.
-- (adresse existe déjà sur utilisateurs, utilisée par le profil apprenant/self-edit.)
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS genre text;
