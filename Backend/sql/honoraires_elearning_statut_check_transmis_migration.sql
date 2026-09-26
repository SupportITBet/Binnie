-- La contrainte CHECK sur honoraires_elearning_mois.statut n'autorisait pas
-- encore la valeur 'transmis' (nouvelle étape séparée de la validation, avant
-- l'envoi définitif à la RH/Paie) — cause de l'erreur 500 "violates check
-- constraint honoraires_elearning_mois_statut_check" lors de la transmission.

ALTER TABLE honoraires_elearning_mois
  DROP CONSTRAINT IF EXISTS honoraires_elearning_mois_statut_check;

ALTER TABLE honoraires_elearning_mois
  ADD CONSTRAINT honoraires_elearning_mois_statut_check
  CHECK (statut IN ('en_attente', 'valide', 'transmis', 'paye', 'litige'));
