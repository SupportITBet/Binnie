-- Ajoute la traçabilité du code promo appliqué sur un dossier (assignations_parcours) —
-- jusqu'ici le code promo n'était jamais persisté ni réellement déduit du montant facturé,
-- seulement affiché à titre indicatif dans le tunnel d'inscription public.
ALTER TABLE assignations_parcours ADD COLUMN IF NOT EXISTS code_promo text;
ALTER TABLE assignations_parcours ADD COLUMN IF NOT EXISTS reduction_montant numeric;
