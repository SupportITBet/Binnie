-- Ajoute le rôle de celui qui a créé le groupe (onboarding, commercial, admin...) — permet au
-- PA Advisor de savoir d'où vient une classe sans coach dans sa liste "Groupes" (badge
-- "Onboarding"/"Commercial" déjà prévu côté frontend, mais jamais alimenté faute de colonne).
ALTER TABLE groupes ADD COLUMN IF NOT EXISTS created_by_role TEXT;
