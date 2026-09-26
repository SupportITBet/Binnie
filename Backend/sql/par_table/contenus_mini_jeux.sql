-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `contenus_mini_jeux`
-- Généré à partir de 3 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── mini_jeux_max_tentatives_migration.sql  (2026-05-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Permet à Onboarding PA / PA Contenus de configurer le nombre de tentatives
-- autorisées par mini-jeu (au lieu du "1 partie + 1 réessai" fixe en dur).
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE contenus_mini_jeux
  ADD COLUMN IF NOT EXISTS max_tentatives INTEGER NOT NULL DEFAULT 2
  CHECK (max_tentatives >= 1 AND max_tentatives <= 10);

-- ── contenus_onboarding_migration.sql  (2026-07-09) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Backend réel pour le module "Contenus" (Onboarding PA / admin_contenus)
-- Remplace les mocks locaux (MOCK_RESSOURCES, MOCK_BIBLIO_COMMUNAUTAIRE,
-- MOCK_JEUX_ADMIN_INIT) côté bet-elearning par de vraies tables persistées.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contenus_ressources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre       TEXT NOT NULL,
  cat         TEXT NOT NULL CHECK (cat IN ('bienvenue','regles','processus','certification','ressources')),
  type        TEXT NOT NULL CHECK (type IN ('video','pdf','audio','jeu')),
  detail      TEXT,
  fichier_url TEXT,
  visible     BOOLEAN NOT NULL DEFAULT true,
  vues        INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contenus_biblio_communautaire (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('video','audio','jeu')),
  cible       TEXT NOT NULL CHECK (cible IN ('enfant','adolescent','adulte','tous')),
  duree       TEXT,
  niveau      TEXT,
  icone       TEXT DEFAULT '🎵',
  fichier_url TEXT,
  visible     BOOLEAN NOT NULL DEFAULT true,
  vues        INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contenus_mini_jeux (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            TEXT NOT NULL,
  type           TEXT NOT NULL,
  categorie      TEXT NOT NULL CHECK (categorie IN ('enfant','ado_adulte','tous')),
  cible          TEXT NOT NULL DEFAULT 'tous',
  actif          BOOLEAN NOT NULL DEFAULT false,
  nb_questions   INTEGER NOT NULL DEFAULT 10,
  parties_jouees INTEGER NOT NULL DEFAULT 0,
  score_moyen    NUMERIC NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contenus_ressources_cat        ON contenus_ressources(cat);
CREATE INDEX IF NOT EXISTS idx_contenus_biblio_cible           ON contenus_biblio_communautaire(cible);
CREATE INDEX IF NOT EXISTS idx_contenus_mini_jeux_categorie    ON contenus_mini_jeux(categorie);

-- ══════════════════════════════════════════════════════════════
-- Seed : reprise exacte des données mock existantes (MOCK_RESSOURCES,
-- MOCK_BIBLIO_COMMUNAUTAIRE, MOCK_JEUX_ADMIN_INIT) pour ne rien perdre
-- lors du passage au backend réel. Exécuté une seule fois (tables vides).
-- ══════════════════════════════════════════════════════════════

INSERT INTO contenus_ressources (titre, cat, type, detail, visible, vues, created_at) VALUES
  ('Vidéo de bienvenue BET',                'bienvenue',     'video', '3:45',   true,  34, '2026-04-01'),
  ('Présentation de la plateforme',         'bienvenue',     'pdf',   '2.4 Mo', true,  28, '2026-04-05'),
  ('Règles d''utilisation de la plateforme','regles',        'pdf',   '1.1 Mo', true,  22, '2026-04-05'),
  ('Charte de l''apprenant BET',            'regles',        'pdf',   '0.8 Mo', true,  19, '2026-04-10'),
  ('Comment fonctionnent les sessions live','processus',     'video', '5:20',   true,  31, '2026-04-15'),
  ('Guide des niveaux CECR — A1 à C2',      'processus',     'pdf',   '3.2 Mo', true,  25, '2026-04-15'),
  ('Tutoriel connexion Zoom',               'processus',     'video', '2:30',   true,  38, '2026-05-15'),
  ('Processus de certification BET',        'certification', 'video', '4:10',   true,  18, '2026-04-20'),
  ('Conditions pour obtenir le certificat', 'certification', 'pdf',   '1.5 Mo', false,  0, '2026-05-01'),
  ('Vocabulaire essentiel — Module 1',      'ressources',    'pdf',   '0.9 Mo', true,  45, '2026-05-10'),
  ('Fiches de révision A1/A2',              'ressources',    'pdf',   '1.8 Mo', true,  29, '2026-05-20');

INSERT INTO contenus_biblio_communautaire (titre, type, cible, duree, niveau, icone, visible, vues, created_at) VALUES
  ('Comptines en anglais — Nursery Rhymes',     'audio', 'enfant',     '12 min', NULL, '🎵', true,  87,  '2026-04-10'),
  ('Podcast débutants — Learn English A1',      'audio', 'tous',       '20 min', NULL, '🎧', true,  63,  '2026-04-15'),
  ('Vidéo — Les couleurs en chanson (enfants)', 'video', 'enfant',     '4:30',   NULL, '🎬', true,  112, '2026-04-20'),
  ('Vidéo — Documentaire BBC Simple English',   'video', 'adulte',     '18:00',  NULL, '🎬', true,  44,  '2026-05-01'),
  ('Jeu — Vocabulaire des animaux (A1)',        'jeu',   'enfant',     NULL,     'A1', '🎮', true,  156, '2026-05-05'),
  ('Jeu — Verbes irréguliers (B1)',             'jeu',   'adolescent', NULL,     'B1', '🎮', true,  78,  '2026-05-10'),
  ('Podcast — Business English Tips',           'audio', 'adulte',     '15 min', NULL, '🎧', false,  0,  '2026-05-15'),
  ('Chanson — The Alphabet Song',               'audio', 'enfant',     '2 min',  NULL, '🎵', true,  203, '2026-05-20');

INSERT INTO contenus_mini_jeux (nom, type, categorie, cible, actif, nb_questions, parties_jouees, score_moyen) VALUES
  ('QCM Flash — Vocabulaire A1',         'qcm',         'tous',       'tous',       true,  10, 324, 78),
  ('Association — Mots de base',         'association', 'tous',       'enfant',     true,  6,  218, 85),
  ('Mot manquant — Phrases A1',          'lacunes',     'tous',       'tous',       true,  5,  189, 71),
  ('QCM Flash — Business English',       'qcm',         'tous',       'adulte',     false, 10, 0,   0),
  ('Anagramme — Animaux & Couleurs',     'anagramme',   'enfant',     'enfant',     true,  8,  142, 68),
  ('Devine l''image — Corps humain',     'image',       'enfant',     'enfant',     false, 10, 0,   0),
  ('Écoute & Réponds — Sons A1',         'audio',       'enfant',     'enfant',     false, 8,  0,   0),
  ('Coloriage — Les couleurs',           'coloriage',   'enfant',     'enfant',     false, 6,  0,   0),
  ('Sprint vocabulaire — A2',            'sprint',      'ado_adulte', 'adolescent', true,  30, 96,  22),
  ('Conjugaison express — Irréguliers',  'conjugaison', 'ado_adulte', 'adolescent', true,  10, 87,  63),
  ('Vrai ou Faux — Grammaire B1',        'vrai_faux',   'ado_adulte', 'adulte',     true,  10, 74,  71),
  ('Dialogue — Situations du quotidien', 'dialogue',    'ado_adulte', 'tous',       true,  5,  63,  77),
  ('Phrases à réordonner — A1/A2',       'reordre',     'tous',       'tous',       true,  8,  201, 74),
  ('Flashcards — Verbes essentiels',     'flashcards',  'tous',       'tous',       true,  20, 178, 80),
  ('Défi CECR — A1 → A2',                'cecr',        'tous',       'tous',       true,  10, 112, 65),
  ('Dictée éclair — Mots courants',      'dictee',      'tous',       'tous',       true,  10, 89,  58),
  ('Mots croisés — Saisons & Météo',     'mots_croises','tous',       'tous',       false, 1,  0,   0);

-- ── mini_jeux_traduction_motscaches_migration.sql  (2026-07-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Ajout de 2 mini-jeux côté bet-elearning (Traduction inverse, Mots
-- cachés) + activation de "Mots croisés" qui existait déjà dans le
-- catalogue mais n'avait jamais été implémenté côté apprenant.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

UPDATE contenus_mini_jeux SET actif = true WHERE type = 'mots_croises' AND actif = false;

INSERT INTO contenus_mini_jeux (nom, type, categorie, cible, actif, nb_questions, parties_jouees, score_moyen)
SELECT 'Traduction inverse', 'traduction', 'tous', 'tous', true, 10, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM contenus_mini_jeux WHERE type = 'traduction');

INSERT INTO contenus_mini_jeux (nom, type, categorie, cible, actif, nb_questions, parties_jouees, score_moyen)
SELECT 'Mots cachés', 'mots_caches', 'tous', 'tous', true, 5, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM contenus_mini_jeux WHERE type = 'mots_caches');

