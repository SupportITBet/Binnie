-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `level_test_results`
-- Généré à partir de 6 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── centres_migration.sql  (2026-05-03) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- STEP 1 : Table centres + centre_id sur toutes les tables client
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Table maître des centres
CREATE TABLE IF NOT EXISTS public.centres (
  id          TEXT PRIMARY KEY,              -- slug: angre, bouake, etc.
  nom         TEXT NOT NULL,
  ville       TEXT NOT NULL,
  adresse     TEXT,
  telephone   TEXT,
  email       TEXT,
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Données initiales des 6 centres
INSERT INTO public.centres (id, nom, ville, adresse, telephone, email) VALUES
  ('angre',     'BET Angré',        'Abidjan', 'Angré 7ème tranche, près du lycée moderne',               '+225 07 68 55 21 99', 'angre@binniesenglish.com'),
  ('2plateaux', 'BET II Plateaux',  'Abidjan', 'II Plateaux, rue des jardins, à côté de la banque Atlantique', '+225 07 68 55 22 03', '2plateaux@binniesenglish.com'),
  ('yopougon',  'BET Yopougon',     'Abidjan', 'Yopougon, quartier Sicogi, derrière la mairie',           '+225 07 68 55 22 01', 'yopougon@binniesenglish.com'),
  ('koumassi',  'BET Koumassi',     'Abidjan', 'Koumassi, rue des pêcheurs, proche du palais des sports', '+225 07 68 55 22 02', 'koumassi@binniesenglish.com'),
  ('abatta',    'BET Abatta',       'Abidjan', 'Abatta, face station Total',                               '+225 07 68 55 22 00', 'abatta@binniesenglish.com'),
  ('bouake',    'BET Bouaké',       'Bouaké',  'En face de la cité universitaire Sainte Marie, quartier Commerce', '+225 07 68 55 21 98', 'contact@binniesenglish.com')
ON CONFLICT (id) DO NOTHING;

-- 3. Ajout de centre_id sur toutes les tables client
ALTER TABLE public.leads_particuliers
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.inscriptions_adultes
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.inscriptions_enfants
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.inscriptions_etudiants
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

-- Tables optionnelles (si elles existent)
ALTER TABLE public.demandes_devis
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.demandes_entreprise
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.apprenants
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

-- 4. Index pour performances
CREATE INDEX IF NOT EXISTS idx_leads_centre          ON public.leads_particuliers(centre_id);
CREATE INDEX IF NOT EXISTS idx_inscr_adultes_centre  ON public.inscriptions_adultes(centre_id);
CREATE INDEX IF NOT EXISTS idx_inscr_enfants_centre  ON public.inscriptions_enfants(centre_id);
CREATE INDEX IF NOT EXISTS idx_inscr_etudiants_centre ON public.inscriptions_etudiants(centre_id);
CREATE INDEX IF NOT EXISTS idx_contacts_centre       ON public.contacts(centre_id);
CREATE INDEX IF NOT EXISTS idx_level_results_centre  ON public.level_test_results(centre_id);

-- ── level_tests_migration.sql  (2026-05-03) ──────────────────────────────
-- ═══════════════════════════════════════════════════════════════
-- MIGRATION : level_tests + level_questions
-- À exécuter dans l'éditeur SQL de Supabase (une seule fois)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Table des configurations de tests ─────────────────────
CREATE TABLE IF NOT EXISTS public.level_tests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre               TEXT NOT NULL,
  description         TEXT DEFAULT '',
  type                TEXT NOT NULL DEFAULT 'qcm',
    -- Valeurs possibles : 'qcm' | 'listening' | 'reading' | 'mixed' | 'speaking'
  actif               BOOLEAN NOT NULL DEFAULT false,
  programme_le        TIMESTAMPTZ,          -- date de début de diffusion
  programme_jusqu_au  TIMESTAMPTZ,          -- date de fin de diffusion
  params              JSONB DEFAULT '{
    "timerEnabled":    true,
    "timerPerQ":       60,
    "shuffleQ":        false,
    "maxQuestions":    10,
    "passingPct":      50,
    "sendEmail":       true,
    "contactAfter":    true
  }'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Table des questions (multi-format) ────────────────────
CREATE TABLE IF NOT EXISTS public.level_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     UUID NOT NULL REFERENCES public.level_tests(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'qcm',
    -- Valeurs possibles :
    --   'qcm'         → 4 options, 1 bonne réponse
    --   'vrai_faux'   → options = ["Vrai","Faux"]
    --   'texte_trous' → phrase avec trou, réponse = mot exact
    --   'audio_qcm'   → audio_url + QCM
    --   'lecture_qcm' → passage texte + QCM
    --   'libre'       → réponse ouverte (correction manuelle)
  text        TEXT DEFAULT '',
  audio_url   TEXT,                          -- pour type audio_qcm
  image_url   TEXT,                          -- image optionnelle
  passage     TEXT,                          -- pour type lecture_qcm
  options     JSONB DEFAULT '[]'::jsonb,     -- ex: ["is","are","am","be"]
  correct     TEXT DEFAULT '',               -- bonne réponse (texte exact)
  category    TEXT DEFAULT 'Grammaire',
    -- Grammaire | Vocabulaire | Compréhension | Listening | Reading | Speaking | Orthographe | Expression
  cefr        TEXT DEFAULT 'A1',             -- A1 | A2 | B1 | B2 | C1 | C2
  points      INTEGER DEFAULT 1,
  explanation TEXT DEFAULT '',
  actif       BOOLEAN DEFAULT true,
  ordre       INTEGER DEFAULT 0,             -- pour trier les questions dans le test
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 3. Index pour les performances ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_level_questions_test_id
  ON public.level_questions(test_id);

CREATE INDEX IF NOT EXISTS idx_level_questions_ordre
  ON public.level_questions(test_id, ordre);

CREATE INDEX IF NOT EXISTS idx_level_tests_actif
  ON public.level_tests(actif);

-- ── 4. Ajouter test_id dans level_test_results ───────────────
-- (pour lier chaque résultat à un test précis)
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS test_id UUID REFERENCES public.level_tests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_level_test_results_test_id
  ON public.level_test_results(test_id);

-- ── 5. RLS (Row Level Security) ──────────────────────────────
-- Option A : tout public (outil interne → le plus simple)
ALTER TABLE public.level_tests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "level_tests_all"     ON public.level_tests;
DROP POLICY IF EXISTS "level_questions_all" ON public.level_questions;
CREATE POLICY "level_tests_all"     ON public.level_tests     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "level_questions_all" ON public.level_questions FOR ALL USING (true) WITH CHECK (true);

-- ── 6. Trigger updated_at automatique ───────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_level_tests_updated_at ON public.level_tests;
CREATE TRIGGER trg_level_tests_updated_at
  BEFORE UPDATE ON public.level_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 7. Données de démarrage (optionnel) ─────────────────────
-- Un premier test QCM avec questions d'exemple pour démarrer directement

INSERT INTO public.level_tests (titre, description, type, actif, params)
VALUES (
  'Test Standard — Anglais Général',
  'Test de niveau général couvrant la grammaire, le vocabulaire et la compréhension (niveaux A1 à C1).',
  'qcm',
  true,
  '{
    "timerEnabled": true,
    "timerPerQ": 60,
    "shuffleQ": true,
    "maxQuestions": 10,
    "passingPct": 50,
    "sendEmail": true,
    "contactAfter": true
  }'::jsonb
) ON CONFLICT DO NOTHING;

-- Questions du test de démarrage
WITH t AS (SELECT id FROM public.level_tests WHERE titre = 'Test Standard — Anglais Général' LIMIT 1)
INSERT INTO public.level_questions
  (test_id, type, text, options, correct, category, cefr, points, explanation, actif, ordre)
SELECT
  t.id, q.type, q.text, q.options::jsonb, q.correct, q.category, q.cefr, q.points, q.explanation, true, q.ordre
FROM t, (VALUES
  ('qcm','What ______ your name?',               '["is","are","am","be"]',                         'is',           'Grammaire',  'A1',1,'On utilise ''is'' avec ''what'' pour les sujets singuliers.',1),
  ('qcm','Which word means the opposite of ''big''?','["tall","small","heavy","old"]',              'small',        'Vocabulaire','A1',1,'Small est l''antonyme de big.',2),
  ('qcm','She ______ to the cinema last Saturday.','["go","goes","went","going"]',                  'went',         'Grammaire',  'A2',1,'Le prétérit de go est went (verbe irrégulier).',3),
  ('qcm','Choose the correct meaning of ''exhausted''.','["Very hungry","Very tired","Very happy","Very cold"]','Very tired','Vocabulaire','A2',1,'Exhausted signifie extrêmement fatigué.',4),
  ('qcm','If I ______ you, I would study harder.','["was","were","am","is"]',                       'were',         'Grammaire',  'B1',2,'Dans les conditionnels hypothétiques on utilise were pour tous les sujets.',5),
  ('qcm','He has been working here ______ five years.','["since","for","during","while"]',          'for',          'Grammaire',  'B1',2,'For avec une durée, since avec un point de départ.',6),
  ('qcm','By the time we arrived, the film ______ already started.','["has","have","had","would have"]','had',     'Grammaire',  'B2',2,'Le plus-que-parfait indique une action antérieure à une autre action passée.',7),
  ('qcm','Choose the best synonym for ''meticulous''.','["Careless","Precise","Generous","Stubborn"]','Precise',  'Vocabulaire','B2',2,'Meticulous signifie très attentif aux détails.',8),
  ('qcm','The report ______ have been submitted by noon.','["should","must","ought to","All are correct"]','All are correct','Grammaire','C1',3,'Should, must et ought to expriment tous une obligation modale.',9),
  ('vrai_faux','In English, the verb always agrees with the subject in number.','["Vrai","Faux"]','Vrai','Grammaire','A2',1,'En anglais le verbe s''accorde en nombre avec le sujet (he goes / they go).',10)
) AS q(type, text, options, correct, category, cefr, points, explanation, ordre)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════
-- FIN DE LA MIGRATION
-- Vérification rapide :
-- SELECT * FROM level_tests;
-- SELECT COUNT(*) FROM level_questions;
-- ════════════════════════════════════════════════

-- ── speaking_migration.sql  (2026-05-03) ──────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- MIGRATION : Support questions Speaking (réponse audio candidat)
-- À exécuter dans l'éditeur SQL de Supabase
-- ════════════════════════════════════════════════════════════════

-- ── 1. Colonne audio_answers dans level_test_results ──────────
-- Stocke { "question_id": "https://cloudinary_url..." } pour les
-- questions de type 'speaking' auxquelles le candidat a répondu
-- par un enregistrement vocal.
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS audio_answers JSONB DEFAULT '{}'::jsonb;

-- ── 2. Index pour requêtes sur audio_answers ──────────────────
CREATE INDEX IF NOT EXISTS idx_level_test_results_audio
  ON public.level_test_results USING gin(audio_answers);

-- ── Vérification ──────────────────────────────────────────────
-- SELECT id, fullname, audio_answers FROM level_test_results
-- WHERE audio_answers != '{}'::jsonb LIMIT 10;

-- ── format_test_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- FORMAT TEST — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- format_test : type de test passé par le prospect
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS format_test TEXT NOT NULL DEFAULT 'mixte';

-- correction_statut : 'auto' (résultat immédiat) | 'en_attente' | 'corrige'
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS correction_statut TEXT NOT NULL DEFAULT 'auto';

-- Index pour filtrer par format
CREATE INDEX IF NOT EXISTS idx_level_test_results_format
  ON public.level_test_results(format_test);

-- ── oral_test_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- TEST ORAL — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Colonne source : "online" (test en ligne) ou "oral" (saisi manuellement par l'assistante)
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online';

-- Colonne notes_oral : observations de l'assistante lors du test oral
ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS notes_oral TEXT;

-- Rendre email optionnel (pour les tests oraux sans compte)
ALTER TABLE public.level_test_results
  ALTER COLUMN email DROP NOT NULL;

-- Index pour filtrer par source
CREATE INDEX IF NOT EXISTS idx_level_test_results_source
  ON public.level_test_results(source);

-- ── level_test_statut_migration.sql  (9999) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Ajout du suivi de traitement (statut) sur les tests de niveau reçus
-- Sans cette colonne, le badge "nouveau(x)" du dashboard commercial
-- ne peut jamais diminuer : rien ne permet de marquer un test comme
-- contacté/converti/archivé, il reste affiché "nouveau" pour toujours.
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'nouveau';

ALTER TABLE public.level_test_results
  DROP CONSTRAINT IF EXISTS level_test_results_statut_check;

ALTER TABLE public.level_test_results
  ADD CONSTRAINT level_test_results_statut_check
  CHECK (statut IN ('nouveau', 'contacté', 'converti', 'archivé'));

