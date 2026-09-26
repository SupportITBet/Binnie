-- ══════════════════════════════════════════════════════════════
-- Permet à Onboarding PA / PA Contenus de configurer le nombre de tentatives
-- autorisées par mini-jeu (au lieu du "1 partie + 1 réessai" fixe en dur).
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE contenus_mini_jeux
  ADD COLUMN IF NOT EXISTS max_tentatives INTEGER NOT NULL DEFAULT 2
  CHECK (max_tentatives >= 1 AND max_tentatives <= 10);
