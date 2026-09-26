-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `config_footer_elearning`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── config_footer_elearning_migration.sql  (2026-07-29) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- TABLE config_footer_elearning — contenu éditable du footer de
-- l'application BET E-Learning (TopNavLayout), ligne singleton id=1.
-- Même convention que config_contact (footer du site public).
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.config_footer_elearning (
  id               INT         PRIMARY KEY DEFAULT 1,
  visible          BOOLEAN     NOT NULL DEFAULT true,
  tagline          TEXT        NOT NULL DEFAULT 'Plateforme E-Learning',
  description      TEXT        NOT NULL DEFAULT 'British English Training — Formation en anglais pour enfants, adolescents et entreprises. Abidjan, Côte d''Ivoire.',
  colonnes         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  copyright_texte  TEXT        NOT NULL DEFAULT 'Tous droits réservés · Abidjan, Côte d''Ivoire',
  version          TEXT        NOT NULL DEFAULT 'v1.0.0',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT config_footer_elearning_singleton CHECK (id = 1)
);

ALTER TABLE public.config_footer_elearning DISABLE ROW LEVEL SECURITY;

