-- Porte côté dash les mêmes garanties déjà en place côté bet-elearning :
-- séparation validation/transmission, suivi de paiement, retenues.
-- La table honoraires_mois n'a aujourd'hui que : statut ('en_attente'|'valide'),
-- pa_id, valide_at, note_pa — rien pour la transmission RH ni le paiement.

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS retenues numeric NOT NULL DEFAULT 0;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS montant_net numeric;

-- Initialise montant_net = montant_total pour les lignes existantes (aucune pour l'instant,
-- table vide en production, mais gardé par sécurité/idempotence).
UPDATE honoraires_mois SET montant_net = montant_total - COALESCE(retenues,0) WHERE montant_net IS NULL;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS valide_par uuid REFERENCES utilisateurs(id);

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS transmis_par uuid REFERENCES utilisateurs(id);

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS transmis_at timestamptz;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS paye_at timestamptz;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS mode_paiement text;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS reference_paiement text;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS seances_ids uuid[];

-- Élargit la contrainte de statut (si elle existe) pour couvrir tout le cycle de vie.
ALTER TABLE honoraires_mois
  DROP CONSTRAINT IF EXISTS honoraires_mois_statut_check;

ALTER TABLE honoraires_mois
  ADD CONSTRAINT honoraires_mois_statut_check
  CHECK (statut IN ('en_attente', 'valide', 'transmis', 'paye', 'litige'));
