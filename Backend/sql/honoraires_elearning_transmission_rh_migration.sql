-- Sépare la validation (le PA vérifie que le calcul est correct) de la
-- transmission à la RH/Paie (envoi définitif pour paiement). Entre les deux,
-- le coach peut contester et le PA peut encore modifier/annuler avant l'envoi.
-- Nouveau statut possible sur honoraires_elearning_mois.statut : 'transmis'
-- (en plus de 'en_attente' | 'valide' | 'litige' | 'paye' déjà existants).

ALTER TABLE honoraires_elearning_mois
  ADD COLUMN IF NOT EXISTS transmis_par uuid REFERENCES utilisateurs(id);

ALTER TABLE honoraires_elearning_mois
  ADD COLUMN IF NOT EXISTS transmis_at timestamptz;
