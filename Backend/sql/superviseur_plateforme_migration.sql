-- ══════════════════════════════════════════════════════════════
-- Dissociation dash / bet-elearning pour le module Superviseur Général
-- Les tables rapports_observation, anomalies_superviseur et missions_deputy
-- sont partagées par le même Backend/DB entre dash et bet-elearning.
-- Sans discriminant, un Superviseur Général connecté sur dash verrait les
-- rapports/anomalies/missions créés depuis bet-elearning, et inversement.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE rapports_observation
  ADD COLUMN IF NOT EXISTS plateforme TEXT NOT NULL DEFAULT 'dash'
  CHECK (plateforme IN ('dash', 'bet-elearning'));

ALTER TABLE anomalies_superviseur
  ADD COLUMN IF NOT EXISTS plateforme TEXT NOT NULL DEFAULT 'dash'
  CHECK (plateforme IN ('dash', 'bet-elearning'));

ALTER TABLE missions_deputy
  ADD COLUMN IF NOT EXISTS plateforme TEXT NOT NULL DEFAULT 'dash'
  CHECK (plateforme IN ('dash', 'bet-elearning'));

CREATE INDEX IF NOT EXISTS idx_rapports_observation_plateforme ON rapports_observation(plateforme);
CREATE INDEX IF NOT EXISTS idx_anomalies_superviseur_plateforme ON anomalies_superviseur(plateforme);
CREATE INDEX IF NOT EXISTS idx_missions_deputy_plateforme ON missions_deputy(plateforme);

-- Note : les lignes existantes sont par défaut rattachées à 'dash' (leur origine réelle
-- jusqu'ici, bet-elearning n'ayant pas encore d'onglet Superviseur Général actif).
