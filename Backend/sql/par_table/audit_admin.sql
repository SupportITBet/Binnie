-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `audit_admin`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── utilisateurs_migration.sql  (2026-05-18) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- TABLE utilisateurs — Profils staff du dashboard BET
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Créer la table si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS public.utilisateurs (
  id               UUID        PRIMARY KEY,
  email            TEXT        NOT NULL UNIQUE,
  nom              TEXT        NOT NULL,
  prenom           TEXT        NOT NULL,
  telephone        TEXT,
  role             TEXT        NOT NULL DEFAULT 'manager',
  scope            JSONB       NOT NULL DEFAULT '["national"]',
  departement      TEXT,
  actif            BOOLEAN     NOT NULL DEFAULT true,
  twofa_active     BOOLEAN     NOT NULL DEFAULT false,
  mdp_temporaire   BOOLEAN     NOT NULL DEFAULT true,
  mdp_initial      TEXT,
  note             TEXT,
  cree_par_id      UUID,
  date_creation    TIMESTAMPTZ NOT NULL DEFAULT now(),
  derniere_connexion TIMESTAMPTZ
);

-- Ajouter les colonnes manquantes si la table existe déjà
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS scope            JSONB       NOT NULL DEFAULT '["national"]';
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS departement      TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS telephone        TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS actif            BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS twofa_active     BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS mdp_temporaire   BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS mdp_initial      TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS note             TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS cree_par_id      UUID;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS date_creation    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS derniere_connexion TIMESTAMPTZ;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS avatar_url         TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS coach_info         JSONB;

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role   ON public.utilisateurs(role);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_actif  ON public.utilisateurs(actif);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email  ON public.utilisateurs(email);

-- RLS : désactiver pour laisser le backend service_role accéder librement
ALTER TABLE public.utilisateurs DISABLE ROW LEVEL SECURITY;

-- Table audit_admin pour les logs d'actions (si elle n'existe pas)
CREATE TABLE IF NOT EXISTS public.audit_admin (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  acteur_id   UUID,
  acteur_nom  TEXT,
  action      TEXT        NOT NULL,
  cible_id    UUID,
  detail      TEXT,
  statut      TEXT        NOT NULL DEFAULT 'success',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin_acteur  ON public.audit_admin(acteur_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin_action  ON public.audit_admin(action);
CREATE INDEX IF NOT EXISTS idx_audit_admin_created ON public.audit_admin(created_at DESC);

ALTER TABLE public.audit_admin DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- Ajout des rôles manquants à l'enum bet_role
-- ══════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'pedagogical_advisor'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'pedagogical_advisor';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'data_collector'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'data_collector';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'onboarding'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'onboarding';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'customer_care'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'customer_care';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'comptable'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'comptable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'placement_test'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'placement_test';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'superviseur'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'superviseur';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'rh'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'rh';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'deputy_superviseur'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'deputy_superviseur';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'apprenant'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'apprenant';
  END IF;
END $$;

-- Couleur personnalisée du dashboard (optionnel, ex: '#7c3aed')
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS couleur  TEXT;

-- Adresse et photo de profil apprenant
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS adresse    TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS avatar_url TEXT;

