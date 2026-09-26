-- ══════════════════════════════════════════════════════════════
-- Migration : tables pour le module Superviseur Général
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Rapports d'observation soumis par les Deputy Superviseurs
CREATE TABLE IF NOT EXISTS rapports_observation (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deputy_id              UUID NOT NULL REFERENCES utilisateurs(id),
  coach_id               UUID NOT NULL REFERENCES utilisateurs(id),
  date_observation       DATE NOT NULL,
  centre                 TEXT,
  classe                 TEXT,
  -- Critères notés de 1 à 5
  ponctualite            SMALLINT CHECK (ponctualite BETWEEN 1 AND 5),
  preparation            SMALLINT CHECK (preparation BETWEEN 1 AND 5),
  pedagogie              SMALLINT CHECK (pedagogie BETWEEN 1 AND 5),
  gestion_classe         SMALLINT CHECK (gestion_classe BETWEEN 1 AND 5),
  respect_programme      SMALLINT CHECK (respect_programme BETWEEN 1 AND 5),
  observations           TEXT,
  recommandations        TEXT,
  note_globale           NUMERIC(3,1),
  -- Cycle de vie côté Superviseur Général
  statut                 TEXT DEFAULT 'soumis' CHECK (statut IN ('soumis','lu','transmis_pa','archivé')),
  commentaire_superviseur TEXT,
  transmis_pa_le         TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Anomalies / non-conformités signalées
CREATE TABLE IF NOT EXISTS anomalies_superviseur (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  superviseur_id   UUID NOT NULL REFERENCES utilisateurs(id),
  coach_id         UUID NOT NULL REFERENCES utilisateurs(id),
  type_anomalie    TEXT NOT NULL,   -- 'cahier_incomplet' | 'absence_non_justifiee' | 'qualite_faible' | 'retard_recurrent' | 'autre'
  description      TEXT NOT NULL,
  gravite          TEXT DEFAULT 'moyenne' CHECK (gravite IN ('haute','moyenne','basse')),
  statut           TEXT DEFAULT 'ouvert'  CHECK (statut IN ('ouvert','en_cours','escaladé','fermé')),
  escalade_a       TEXT,            -- 'pa' | 'ceo' | 'rh'
  escalade_le      TIMESTAMPTZ,
  resolution       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Missions assignées aux Deputy Superviseurs
CREATE TABLE IF NOT EXISTS missions_deputy (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  superviseur_id   UUID NOT NULL REFERENCES utilisateurs(id),
  deputy_id        UUID NOT NULL REFERENCES utilisateurs(id),
  coach_id         UUID REFERENCES utilisateurs(id),
  type_mission     TEXT NOT NULL,   -- 'observation' | 'verification_cahier' | 'suivi_absence' | 'autre'
  titre            TEXT NOT NULL,
  description      TEXT,
  centre           TEXT,
  date_debut       DATE,
  date_fin         DATE,
  statut           TEXT DEFAULT 'assignée' CHECK (statut IN ('assignée','en_cours','terminée','annulée')),
  rapport_id       UUID REFERENCES rapports_observation(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_rapports_observation_deputy_id   ON rapports_observation(deputy_id);
CREATE INDEX IF NOT EXISTS idx_rapports_observation_coach_id    ON rapports_observation(coach_id);
CREATE INDEX IF NOT EXISTS idx_rapports_observation_statut      ON rapports_observation(statut);
CREATE INDEX IF NOT EXISTS idx_anomalies_superviseur_coach_id   ON anomalies_superviseur(coach_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_superviseur_statut     ON anomalies_superviseur(statut);
CREATE INDEX IF NOT EXISTS idx_missions_deputy_deputy_id        ON missions_deputy(deputy_id);
CREATE INDEX IF NOT EXISTS idx_missions_deputy_statut           ON missions_deputy(statut);
