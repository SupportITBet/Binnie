-- Migration : ajout de la colonne type_coach dans la table utilisateurs
-- Permet de distinguer professeur_titulaire / professeur_remplacant pour les coachs e-learning
-- Note : la colonne role est un enum (bet_role) donc on ne modifie pas sa valeur.
-- Le type coach est uniquement stocké dans type_coach (TEXT).

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS type_coach TEXT DEFAULT NULL;
