-- ══════════════════════════════════════════════════════════════
-- Séances et présences pour cours privés (assignations_parcours)
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Table des séances planifiées
CREATE TABLE IF NOT EXISTS seances_privees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignation_id  UUID NOT NULL REFERENCES assignations_parcours(id) ON DELETE CASCADE,
  coach_id        UUID NOT NULL,
  date_seance     DATE NOT NULL,
  heure_debut     TIME,
  duree_h         NUMERIC(4,2) DEFAULT 1.5,
  lieu            TEXT,          -- 'domicile' | 'cabinet'
  statut          TEXT NOT NULL DEFAULT 'planifiee' CHECK (statut IN ('planifiee','effectuee','annulee')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Table des présences (une ligne par séance)
CREATE TABLE IF NOT EXISTS presences_privees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignation_id  UUID NOT NULL REFERENCES assignations_parcours(id) ON DELETE CASCADE,
  seance_id       UUID REFERENCES seances_privees(id) ON DELETE SET NULL,
  coach_id        UUID NOT NULL,
  date_presence   DATE NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'present' CHECK (statut IN ('present','absent','retard','excuse')),
  motif           TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_seances_privees_assignation ON seances_privees(assignation_id);
CREATE INDEX IF NOT EXISTS idx_presences_privees_assignation ON presences_privees(assignation_id);

-- Table des fichiers partagés coach → apprenant privé
CREATE TABLE IF NOT EXISTS fichiers_prives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignation_id  UUID NOT NULL REFERENCES assignations_parcours(id) ON DELETE CASCADE,
  coach_id        UUID NOT NULL,
  nom             TEXT NOT NULL,
  url             TEXT NOT NULL,
  type_fichier    TEXT DEFAULT 'autre',  -- 'pdf' | 'image' | 'word' | 'audio' | 'video' | 'autre'
  taille_ko       INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fichiers_prives_assignation ON fichiers_prives(assignation_id);

-- RLS désactivé (accès via service_role depuis le backend)
ALTER TABLE seances_privees   DISABLE ROW LEVEL SECURITY;
ALTER TABLE presences_privees DISABLE ROW LEVEL SECURITY;
ALTER TABLE fichiers_prives   DISABLE ROW LEVEL SECURITY;
