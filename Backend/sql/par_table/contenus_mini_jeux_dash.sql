-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `contenus_mini_jeux_dash`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── contenus_mini_jeux_dash_migration.sql  (2026-07-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Mini-jeux côté dash (Onboarding PA — onglet Contenus > Mini-jeux).
-- Table séparée de contenus_mini_jeux (bet-elearning) — plateformes
-- indépendantes. `cible` est ici la source de vérité du filtrage par
-- tranche d'âge côté apprenant (pas de catalogue figé côté frontend).
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contenus_mini_jeux_dash (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('qcm','association','lacunes','anagramme','sprint','vrai_faux','reordre','dialogue','flashcards','conjugaison','cecr','dictee','traduction','mots_croises','mots_caches')),
  cible          TEXT NOT NULL DEFAULT 'tous' CHECK (cible IN ('enfant','etudiant','adulte','tous')),
  actif          BOOLEAN NOT NULL DEFAULT false,
  nb_questions   INTEGER,
  max_tentatives INTEGER NOT NULL DEFAULT 2,
  parties_jouees INTEGER NOT NULL DEFAULT 0,
  score_moyen    NUMERIC NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contenus_mini_jeux_resultats_dash (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jeu_id           UUID NOT NULL REFERENCES contenus_mini_jeux_dash(id) ON DELETE CASCADE,
  apprenant_id     UUID REFERENCES utilisateurs(id),
  apprenant_nom    TEXT,
  score            NUMERIC NOT NULL,
  score_max        NUMERIC,
  pourcentage      NUMERIC,
  tentative_numero INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Défensif : si la table existait déjà (migration lancée avant l'ajout de
-- traduction/mots_croises/mots_caches), on élargit la contrainte sans tout recréer.
ALTER TABLE contenus_mini_jeux_dash DROP CONSTRAINT IF EXISTS contenus_mini_jeux_dash_type_check;
ALTER TABLE contenus_mini_jeux_dash ADD CONSTRAINT contenus_mini_jeux_dash_type_check
  CHECK (type IN ('qcm','association','lacunes','anagramme','sprint','vrai_faux','reordre','dialogue','flashcards','conjugaison','cecr','dictee','traduction','mots_croises','mots_caches'));
ALTER TABLE contenus_mini_jeux_dash ADD COLUMN IF NOT EXISTS nb_questions INTEGER;
-- Multi-instances par type désormais autorisées (comme bet-elearning) : l'admin
-- peut créer plusieurs jeux nommés différemment sur le même moteur de jeu.
ALTER TABLE contenus_mini_jeux_dash DROP CONSTRAINT IF EXISTS contenus_mini_jeux_dash_type_key;

CREATE INDEX IF NOT EXISTS idx_contenus_mini_jeux_dash_cible        ON contenus_mini_jeux_dash(cible);
CREATE INDEX IF NOT EXISTS idx_contenus_mini_jeux_resultats_dash_jeu ON contenus_mini_jeux_resultats_dash(jeu_id);
CREATE INDEX IF NOT EXISTS idx_contenus_mini_jeux_resultats_dash_app ON contenus_mini_jeux_resultats_dash(apprenant_id);

-- ══════════════════════════════════════════════════════════════
-- Seed : les 12 jeux du moteur (déjà codé côté apprenant, voir
-- CATALOGUE_JEUX dans EspaceApprenant.jsx) sont insérés directement,
-- actifs par défaut — pas besoin de les recréer un par un dans l'admin.
-- ON CONFLICT(type) DO NOTHING : sans effet si déjà exécuté une fois.
-- ══════════════════════════════════════════════════════════════
-- cible par défaut : enfant = jeux ludiques/visuels, adulte = grammaire/vocabulaire
-- avancé, etudiant = entraînement chronométré, tous = accessible à toutes les tranches.
-- nb_questions reflète la longueur réelle de chaque banque de contenu (EspaceApprenant.jsx).
INSERT INTO contenus_mini_jeux_dash (nom, type, cible, actif, nb_questions, max_tentatives)
SELECT v.nom, v.type, v.cible, v.actif, v.nb_questions, v.max_tentatives
FROM (VALUES
  ('QCM Flash',              'qcm',         'tous',    true, 10, 2),
  ('Association',            'association', 'tous',    true, 6,  2),
  ('Mot manquant',           'lacunes',     'tous',    true, 5,  2),
  ('Anagramme',              'anagramme',   'enfant',  true, 8,  2),
  ('Sprint vocabulaire',     'sprint',      'etudiant',true, 30, 2),
  ('Vrai ou Faux',           'vrai_faux',   'etudiant',true, 8,  2),
  ('Phrases à réordonner',   'reordre',     'tous',    true, 8,  2),
  ('Complétion de dialogue', 'dialogue',    'etudiant',true, 3,  2),
  ('Flashcards',             'flashcards',  'tous',    true, 10, 2),
  ('Conjugaison express',    'conjugaison', 'adulte',  true, 10, 2),
  ('Défi CECR',              'cecr',        'adulte',  true, 10, 2),
  ('Dictée éclair',          'dictee',      'adulte',  true, 10, 2),
  ('Traduction inverse',     'traduction',   'tous',   true, 10, 2),
  ('Mots croisés',           'mots_croises', 'tous',   true, 4,  2),
  ('Mots cachés',            'mots_caches',  'enfant', true, 5,  2)
) AS v(nom, type, cible, actif, nb_questions, max_tentatives)
WHERE NOT EXISTS (SELECT 1 FROM contenus_mini_jeux_dash existant WHERE existant.type = v.type);

-- Défensif : si les jeux existaient déjà (avant l'ajout de nb_questions), on
-- renseigne la valeur uniquement si elle n'a jamais été définie.
UPDATE contenus_mini_jeux_dash SET nb_questions = 10 WHERE type = 'qcm'         AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 6  WHERE type = 'association' AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 5  WHERE type = 'lacunes'     AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 8  WHERE type = 'anagramme'   AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 30 WHERE type = 'sprint'      AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 8  WHERE type = 'vrai_faux'   AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 8  WHERE type = 'reordre'     AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 3  WHERE type = 'dialogue'    AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 10 WHERE type = 'flashcards'  AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 10 WHERE type = 'conjugaison' AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 10 WHERE type = 'cecr'        AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 10 WHERE type = 'dictee'      AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 10 WHERE type = 'traduction'  AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 4  WHERE type = 'mots_croises' AND nb_questions IS NULL;
UPDATE contenus_mini_jeux_dash SET nb_questions = 5  WHERE type = 'mots_caches'  AND nb_questions IS NULL;

-- Si la table a déjà été seedée avant l'ajout de ces cibles par défaut, on les
-- applique quand même — mais seulement si l'admin n'a jamais touché à `cible`
-- pour ce jeu (encore à 'tous', valeur de départ). Sans effet sur un jeu déjà
-- personnalisé manuellement.
UPDATE contenus_mini_jeux_dash SET cible = 'enfant'   WHERE type = 'anagramme'   AND cible = 'tous';
UPDATE contenus_mini_jeux_dash SET cible = 'etudiant' WHERE type = 'sprint'      AND cible = 'tous';
UPDATE contenus_mini_jeux_dash SET cible = 'etudiant' WHERE type = 'vrai_faux'   AND cible = 'tous';
UPDATE contenus_mini_jeux_dash SET cible = 'etudiant' WHERE type = 'dialogue'    AND cible = 'tous';
UPDATE contenus_mini_jeux_dash SET cible = 'adulte'   WHERE type = 'conjugaison' AND cible = 'tous';
UPDATE contenus_mini_jeux_dash SET cible = 'adulte'   WHERE type = 'cecr'        AND cible = 'tous';
UPDATE contenus_mini_jeux_dash SET cible = 'adulte'   WHERE type = 'dictee'      AND cible = 'tous';
UPDATE contenus_mini_jeux_dash SET cible = 'enfant'   WHERE type = 'mots_caches' AND cible = 'tous';

