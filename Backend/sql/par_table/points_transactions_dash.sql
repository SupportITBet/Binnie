-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `points_transactions_dash`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── gamification_dash_migration.sql  (2026-07-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Gamification dash — grand livre de points, catalogue de badges,
-- entièrement séparés de bet-elearning (points_transactions, badges,
-- badges_obtenus, utilisateurs.points_gamif restent réservés à
-- bet-elearning ; jamais lus ni écrits par le côté dash).
-- Même principe que contenus_mini_jeux_dash / contenus_mini_jeux_resultats_dash.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS points_gamif_dash INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS points_transactions_dash (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id UUID NOT NULL REFERENCES utilisateurs(id),
  source_type  TEXT NOT NULL CHECK (source_type IN (
    'session','devoir','devoir_bonus','devoir_correction','mini_jeu','mini_jeu_progression',
    'streak','onboarding','badge','niveau_progression','chat_message','contenu_vue'
  )),
  source_id    TEXT,
  points       INTEGER NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ptd_apprenant     ON points_transactions_dash(apprenant_id);
CREATE INDEX IF NOT EXISTS idx_ptd_apprenant_src ON points_transactions_dash(apprenant_id, source_type, created_at);

CREATE TABLE IF NOT EXISTS badges_dash (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,
  nom              TEXT NOT NULL,
  icone            TEXT NOT NULL,
  description      TEXT NOT NULL,
  categorie        TEXT NOT NULL,
  condition_type   TEXT NOT NULL,
  condition_valeur INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS badges_obtenus_dash (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id UUID NOT NULL REFERENCES utilisateurs(id),
  badge_id     UUID NOT NULL REFERENCES badges_dash(id),
  obtenu_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (apprenant_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_bod_apprenant ON badges_obtenus_dash(apprenant_id);

-- Table de suivi des consultations de contenus par apprenant (badges Explorateur, dash)
CREATE TABLE IF NOT EXISTS contenus_vues_apprenant_dash (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id     UUID NOT NULL REFERENCES utilisateurs(id),
  ressource_id     UUID NOT NULL,
  ressource_table  TEXT NOT NULL,
  cat              TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (apprenant_id, ressource_id, ressource_table)
);
CREATE INDEX IF NOT EXISTS idx_cvad_apprenant ON contenus_vues_apprenant_dash(apprenant_id);

-- ── Catalogue de badges — copie exacte du catalogue bet-elearning ──────────
INSERT INTO badges_dash (code, nom, icone, description, categorie, condition_type, condition_valeur) VALUES
  ('bienvenue',            'Bienvenue !',           '👋', 'Première connexion à BET E-Learning',                              'Démarrage',    'premiere_activite',      NULL),
  ('pret_a_apprendre',     'Prêt à apprendre',      '🧭', 'Guide d''onboarding terminé (4 étapes validées)',                   'Démarrage',    'onboarding_complete',    NULL),
  ('presence_parfaite',    'Présence parfaite',     '🎯', '5 sessions consécutives sans absence',                             'Assiduité',    'presences_consecutives', 5),
  ('serie_7',              'Série de 7',            '🔥', '7 jours d''activité consécutifs sur la plateforme',                 'Assiduité',    'streak_jours',           7),
  ('serie_14',             'Série de 14',           '🔥', '14 jours d''activité consécutifs sur la plateforme',               'Assiduité',    'streak_jours',           14),
  ('serie_30',             'Série de 30',           '🔥', '30 jours d''activité consécutifs sur la plateforme',               'Assiduité',    'streak_jours',           30),
  ('un_mois',              'Un mois avec BET',      '🗓️', '30 jours depuis l''inscription, toujours actif',                    'Assiduité',    'anciennete_jours',       30),
  ('habitue',              'Habitué',               '🏠', '90 jours depuis l''inscription, toujours actif',                   'Assiduité',    'anciennete_jours',       90),
  ('veteran_bet',          'Vétéran BET',           '🏛️', '1 an depuis l''inscription, toujours actif',                       'Assiduité',    'anciennete_jours',       365),
  ('le_retour',            'Le retour',             '🌅', 'De retour après au moins 14 jours d''absence',                     'Assiduité',    'retour_apres_pause',     14),
  ('leve_tot',             'Lève-tôt',              '🌄', '5 connexions avant 8h du matin',                                   'Assiduité',    'connexions_matinales',   5),
  ('premier_devoir',       'Premier devoir',        '✍️', 'Premier devoir rendu sur la plateforme',                           'Devoirs',      'premier_devoir',         NULL),
  ('travailleur_regulier', 'Travailleur régulier',  '📚', '10 devoirs rendus, tous à temps',                                  'Devoirs',      'devoirs_temps',          10),
  ('en_avance',            'En avance',             '📅', '5 devoirs rendus au moins 24h avant la date limite',               'Devoirs',      'devoirs_en_avance',      5),
  ('dossier_complet',      'Dossier complet',       '📎', 'Premier devoir rendu avec un fichier joint',                       'Devoirs',      'premier_devoir_fichier', NULL),
  ('perfectionniste',      'Perfectionniste',       '💯', 'Note de 100 % sur un devoir noté',                                 'Devoirs',      'devoir_note_max',        NULL),
  ('grand_progres',        'Grand progrès',         '📈', 'Note en hausse d''au moins 30 points vs le devoir noté précédent', 'Devoirs',      'progression_note',       30),
  ('joueur_debutant',      'Joueur débutant',       '🕹️', 'Premier mini-jeu terminé',                                        'Mini-jeux',    'premier_jeu',            NULL),
  ('touche_a_tout',        'Touche-à-tout',         '🎲', 'Au moins une partie dans chaque jeu actif',                        'Mini-jeux',    'tous_jeux_actifs',       NULL),
  ('score_parfait',        'Score parfait',         '🏆', 'Score de 100 % sur un mini-jeu',                                   'Mini-jeux',    'jeu_score_parfait',      NULL),
  ('increvable',           'Increvable',            '💪', '10 parties jouées, tous jeux confondus',                           'Mini-jeux',    'parties_jouees',         10),
  ('ca_grimpe',            'Ça grimpe !',           '🪜', 'Passage à un niveau CECR supérieur',                              'Progression',  'niveau_superieur',       NULL),
  ('bilingue_en_herbe',    'Bilingue en herbe',     '🌱', 'Niveau B1 atteint',                                                'Progression',  'niveau_atteint_b1',      NULL),
  ('niveau_maitrise',      'Niveau maîtrisé',       '🎓', 'Niveau C1 atteint',                                                'Progression',  'niveau_atteint_c1',      NULL),
  ('niveau_superieur',     'Niveau supérieur',      '📈', 'Passage confirmé au niveau CECR suivant',                          'Progression',  'niveau_superieur',       NULL),
  ('certifie_bet',         'Certifié BET',          '🎓', 'Certificat de fin de parcours obtenu',                             'Progression',  'certification',          NULL),
  ('esprit_de_classe',     'Esprit de classe',      '💬', 'Premier message envoyé dans le chat de classe',                    'Social',       'premier_message',        NULL),
  ('bon_camarade',         'Bon camarade',          '🤝', '10 messages envoyés dans le chat de classe',                       'Social',       'messages_classe',        10),
  ('ponctuel',             'Ponctuel',              '🎥', '3 sessions live rejointes à l''heure',                             'Sessions live','sessions_a_lheure',      3),
  ('marathonien_live',     'Marathonien live',      '🏅', '20 sessions live suivies au total',                                'Sessions live','sessions_totales',       20),
  ('curieux',              'Curieux',               '🔍', '5 ressources différentes consultées dans la bibliothèque',         'Explorateur',  'ressources_vues',        5),
  ('collectionneur',       'Collectionneur',        '🗂️', 'Contenus consultés dans au moins 4 catégories différentes',        'Explorateur',  'categories_explorees',   4),
  ('podium',               'Podium',                '🥇', 'Top 3 du classement de sa classe, en fin de mois',                 'Distinction',  'podium_mensuel',         NULL)
ON CONFLICT (code) DO NOTHING;

