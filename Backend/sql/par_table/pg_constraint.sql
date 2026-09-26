-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `pg_constraint`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── coach_disponibilites_mois_migration.sql  (2026-07-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Disponibilités coach par mois — la dispo d'un coach change tous les
-- mois, la table doit donc distinguer le planning par (mois, année)
-- au lieu d'un planning hebdomadaire permanent et unique.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE coach_disponibilites
  ADD COLUMN IF NOT EXISTS mois  INTEGER,
  ADD COLUMN IF NOT EXISTS annee INTEGER;

-- Backfill : les lignes existantes représentent le planning actuellement
-- en vigueur → on les rattache au mois courant au moment de la migration.
UPDATE coach_disponibilites
SET mois  = EXTRACT(MONTH FROM now())::int,
    annee = EXTRACT(YEAR  FROM now())::int
WHERE mois IS NULL OR annee IS NULL;

ALTER TABLE coach_disponibilites
  ALTER COLUMN mois  SET NOT NULL,
  ALTER COLUMN annee SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_disponibilites_mois_check'
  ) THEN
    ALTER TABLE coach_disponibilites
      ADD CONSTRAINT coach_disponibilites_mois_check CHECK (mois BETWEEN 1 AND 12);
  END IF;
END $$;

-- Remplace l'ancienne contrainte unique (coach_id, jour, creneau) — quel que
-- soit son nom réel — par une contrainte incluant mois/année.
DO $$
DECLARE
  conname text;
BEGIN
  SELECT tc.constraint_name INTO conname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'coach_disponibilites' AND tc.constraint_type = 'UNIQUE'
  GROUP BY tc.constraint_name
  HAVING array_agg(kcu.column_name::text ORDER BY kcu.column_name::text) = ARRAY['coach_id','creneau','jour']::text[]
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE coach_disponibilites DROP CONSTRAINT %I', conname);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coach_disponibilites_coach_mois_annee_jour_creneau_key'
  ) THEN
    ALTER TABLE coach_disponibilites
      ADD CONSTRAINT coach_disponibilites_coach_mois_annee_jour_creneau_key
      UNIQUE (coach_id, mois, annee, jour, creneau);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_coach_dispo_mois ON coach_disponibilites(coach_id, mois, annee);

