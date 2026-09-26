-- Migration : ajout du champ profil sur la table assistantes
-- b2c = Assistante commerciale classique (particuliers)
-- b2b = Assistante Corporate (entreprises)
-- les_deux = Les deux profils

ALTER TABLE assistantes
  ADD COLUMN IF NOT EXISTS profil TEXT NOT NULL DEFAULT 'b2c'
    CHECK (profil IN ('b2c', 'b2b', 'les_deux'));

-- Mettre à jour les assistantes existantes : toutes sont b2c par défaut
UPDATE assistantes SET profil = 'b2c' WHERE profil IS NULL;
