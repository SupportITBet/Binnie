-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `bet_elearning_tests_niveau_resultats`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── bet_elearning_tests_niveau_migration.sql  (2026-07-09) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Bibliothèque de tests de niveau + résultats — BET E-Learning uniquement.
-- ⚠️ Ne PAS confondre avec level_tests / level_test_results (utilisées par dash) :
-- les deux plateformes doivent rester dissociées, ces tables sont propres à bet-elearning.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bet_elearning_tests_niveau (
  id                    TEXT PRIMARY KEY,
  titre                 TEXT NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'qcm', -- qcm | listening | audio | quiz | speaking
  niveau                TEXT,
  duree_min             INTEGER DEFAULT 30,
  tranche_cible         TEXT DEFAULT 'tous',
  questions             JSONB NOT NULL DEFAULT '[]',
  ressource_url         TEXT,
  speak_type            TEXT,
  speak_consigne        TEXT,
  speak_audio_url       TEXT,
  speak_texte_passage   TEXT,
  speak_tip             TEXT,
  speak_niveau          TEXT,
  speak_prep_time       INTEGER,
  speak_record_time     INTEGER,
  notifier_eleves       BOOLEAN NOT NULL DEFAULT true,
  notifier_responsable  BOOLEAN NOT NULL DEFAULT false,
  nb_utilisations       INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bet_elearning_tests_niveau_resultats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id          TEXT NOT NULL REFERENCES public.bet_elearning_tests_niveau(id) ON DELETE CASCADE,
  apprenant_id     UUID NOT NULL, -- inscriptions_elearning.id
  score            INTEGER,
  total            INTEGER,
  niveau_detecte   TEXT,
  duree_min        INTEGER,
  detail_reponses  JSONB,
  type             TEXT,
  titre_test       TEXT,
  speak_consigne   TEXT,
  speak_type       TEXT,
  notes_agent      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_belt_niveau_res_apprenant ON public.bet_elearning_tests_niveau_resultats(apprenant_id);
CREATE INDEX IF NOT EXISTS idx_belt_niveau_res_test      ON public.bet_elearning_tests_niveau_resultats(test_id);

