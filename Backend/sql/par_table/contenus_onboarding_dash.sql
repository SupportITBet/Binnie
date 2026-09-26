-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `contenus_onboarding_dash`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── contenus_onboarding_dash_migration.sql  (2026-07-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Backend réel pour le module "Contenus" côté dash (Onboarding PA).
-- Tables séparées de contenus_ressources / contenus_biblio_communautaire
-- (qui appartiennent à bet-elearning) — dash et bet-elearning restent des
-- plateformes indépendantes, y compris pour cette bibliothèque de contenus.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

-- Contenus liés aux 4 étapes d'onboarding (guide de bienvenue affiché à la
-- première connexion de l'apprenant, et consultable à tout moment ensuite).
CREATE TABLE IF NOT EXISTS contenus_onboarding_dash (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre       TEXT NOT NULL,
  cat         TEXT NOT NULL CHECK (cat IN ('bienvenue','regles','processus','certification')),
  type        TEXT NOT NULL CHECK (type IN ('video','pdf','audio')),
  detail      TEXT,
  fichier_url TEXT,
  visible     BOOLEAN NOT NULL DEFAULT true,
  vues        INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bibliothèque libre ("autres vidéos") — accessible en permanence depuis
-- l'onglet Onboarding de l'apprenant, indépendamment des 4 étapes.
-- `cible` filtre par tranche d'âge (enfant/etudiant/adulte), même principe que
-- contenus_biblio_communautaire.cible côté bet-elearning.
CREATE TABLE IF NOT EXISTS contenus_videos_dash (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('video','audio')),
  cible       TEXT NOT NULL DEFAULT 'tous' CHECK (cible IN ('enfant','etudiant','adulte','tous')),
  duree       TEXT,
  niveau      TEXT,
  icone       TEXT DEFAULT '🎬',
  fichier_url TEXT,
  visible     BOOLEAN NOT NULL DEFAULT true,
  vues        INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent : si la table existait déjà (migration précédemment exécutée
-- sans `cible`), on ajoute la colonne sans tout recréer.
ALTER TABLE contenus_videos_dash ADD COLUMN IF NOT EXISTS cible TEXT NOT NULL DEFAULT 'tous';
DO $$ BEGIN
  ALTER TABLE contenus_videos_dash ADD CONSTRAINT contenus_videos_dash_cible_check CHECK (cible IN ('enfant','etudiant','adulte','tous'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_contenus_onboarding_dash_cat ON contenus_onboarding_dash(cat);
CREATE INDEX IF NOT EXISTS idx_contenus_videos_dash_cible  ON contenus_videos_dash(cible);

