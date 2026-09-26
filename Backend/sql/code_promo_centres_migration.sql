-- Ajoute la restriction par centre précis sur un code promo (en plus de la restriction
-- par catégorie d'offre déjà existante via applicable_a). Vide/NULL = valable pour tous
-- les centres ; rempli = restreint aux centres listés (ids de la table centres/centres_master).
ALTER TABLE codes_promo ADD COLUMN IF NOT EXISTS centres_ids jsonb DEFAULT '[]'::jsonb;
