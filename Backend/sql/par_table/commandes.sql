-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `commandes`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── boutique_migration.sql  (2026-05-12) ──────────────────────────────
-- ═══════════════════════════════════════════════════════════
--  BOUTIQUE BET — Migration SQL
--  À exécuter dans l'éditeur SQL de Supabase
-- ═══════════════════════════════════════════════════════════

-- Table des produits
CREATE TABLE IF NOT EXISTS produits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  description TEXT,
  prix        NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  categorie   TEXT NOT NULL DEFAULT 'Autre',
  image_url   TEXT,
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table des commandes
CREATE TABLE IF NOT EXISTS commandes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_nom        TEXT NOT NULL,
  client_email      TEXT,
  client_telephone  TEXT,
  items             JSONB NOT NULL DEFAULT '[]',
  total             NUMERIC(10,2) NOT NULL DEFAULT 0,
  statut            TEXT NOT NULL DEFAULT 'en_attente',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colonne images (galerie multi-photos)
ALTER TABLE produits ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_produits_actif      ON produits(actif);
CREATE INDEX IF NOT EXISTS idx_produits_categorie  ON produits(categorie);
CREATE INDEX IF NOT EXISTS idx_commandes_statut    ON commandes(statut);
CREATE INDEX IF NOT EXISTS idx_commandes_created   ON commandes(created_at DESC);

-- Désactiver RLS (accès géré côté backend avec service key)
ALTER TABLE produits  DISABLE ROW LEVEL SECURITY;
ALTER TABLE commandes DISABLE ROW LEVEL SECURITY;

