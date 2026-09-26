-- ══════════════════════════════════════════════════════════════
-- Migration : ajout des rôles elearning à l'enum bet_role
-- + colonne acces_elearning sur utilisateurs
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Valeur utilisée par le SuperAdminDashboard (dash)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'assistant_elearning'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'assistant_elearning';
  END IF;

  -- Valeur utilisée par le panel bet-elearning
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_elearning'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_elearning';
  END IF;
END $$;

-- Ajouter la colonne acces_elearning si elle n'existe pas encore
ALTER TABLE public.utilisateurs
  ADD COLUMN IF NOT EXISTS acces_elearning BOOLEAN NOT NULL DEFAULT false;
