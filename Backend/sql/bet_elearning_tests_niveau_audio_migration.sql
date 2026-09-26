-- ══════════════════════════════════════════════════════════════
-- Ajout de audio_url sur bet_elearning_tests_niveau_resultats
-- Sans cette colonne, l'enregistrement vocal d'un test Speaking (ancien
-- système, TestNiveau.jsx) n'était jamais transmis à l'Agent Placement —
-- capturé côté navigateur mais jamais uploadé ni sauvegardé.
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.bet_elearning_tests_niveau_resultats
  ADD COLUMN IF NOT EXISTS audio_url TEXT;
