-- ══════════════════════════════════════════════════════════════
-- gamification_badges_v2_migration.sql
-- Étend le catalogue de badges (17 nouveaux) + les source_type autorisés dans
-- points_transactions + une table de suivi des consultations de contenus par
-- apprenant (nécessaire pour les badges "Explorateur", absente jusqu'ici — les
-- routes /vue n'incrémentaient qu'un compteur global, jamais par apprenant).
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ══════════════════════════════════════════════════════════════

-- 1. Nouveaux source_type utilisés par les nouveaux badges
ALTER TABLE points_transactions DROP CONSTRAINT IF EXISTS points_transactions_source_type_check;
ALTER TABLE points_transactions ADD CONSTRAINT points_transactions_source_type_check
  CHECK (source_type IN (
    'session','devoir','devoir_bonus','devoir_correction','mini_jeu','mini_jeu_progression',
    'streak','onboarding','badge','niveau_progression','chat_message','contenu_vue'
  ));

-- 2. Table de suivi des consultations de contenus par apprenant (badges Explorateur)
CREATE TABLE IF NOT EXISTS contenus_vues_apprenant (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id     UUID NOT NULL REFERENCES utilisateurs(id),
  ressource_id     UUID NOT NULL,
  ressource_table  TEXT NOT NULL, -- 'contenus_ressources' | 'contenus_biblio_communautaire'
  cat              TEXT,          -- catégorie (contenus_ressources.cat) ou cible (biblio_communautaire.cible)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (apprenant_id, ressource_id, ressource_table)
);
CREATE INDEX IF NOT EXISTS idx_cva_apprenant ON contenus_vues_apprenant(apprenant_id);

-- 3. Nouveaux badges
INSERT INTO badges (code, nom, icone, description, categorie, condition_type, condition_valeur) VALUES
  -- Progression CECR
  ('ca_grimpe',          'Ça grimpe !',            '🪜', 'Passage à un niveau CECR supérieur',                              'Progression', 'niveau_superieur',       NULL),
  ('bilingue_en_herbe',  'Bilingue en herbe',      '🌱', 'Niveau B1 atteint',                                                'Progression', 'niveau_atteint_b1',      NULL),
  ('niveau_maitrise',    'Niveau maîtrisé',        '🎓', 'Niveau C1 atteint',                                                'Progression', 'niveau_atteint_c1',      NULL),
  -- Assiduité (paliers + retour + régularité)
  ('serie_14',           'Série de 14',            '🔥', '14 jours d''activité consécutifs sur la plateforme',               'Assiduité',   'streak_jours',           14),
  ('serie_30',           'Série de 30',            '🔥', '30 jours d''activité consécutifs sur la plateforme',               'Assiduité',   'streak_jours',           30),
  ('le_retour',          'Le retour',              '🌅', 'De retour après au moins 14 jours d''absence',                     'Assiduité',   'retour_apres_pause',     14),
  ('leve_tot',           'Lève-tôt',               '🌄', '5 connexions avant 8h du matin',                                   'Assiduité',   'connexions_matinales',   5),
  ('habitue',            'Habitué',                '🏠', '90 jours depuis l''inscription, toujours actif',                   'Assiduité',   'anciennete_jours',       90),
  ('veteran_bet',        'Vétéran BET',            '🏛️', '1 an depuis l''inscription, toujours actif',                       'Assiduité',   'anciennete_jours',       365),
  -- Devoirs
  ('en_avance',          'En avance',              '📅', '5 devoirs rendus au moins 24h avant la date limite',               'Devoirs',     'devoirs_en_avance',      5),
  ('dossier_complet',    'Dossier complet',        '📎', 'Premier devoir rendu avec un fichier joint',                       'Devoirs',     'premier_devoir_fichier', NULL),
  ('grand_progres',      'Grand progrès',          '📈', 'Note en hausse d''au moins 30 points vs le devoir noté précédent', 'Devoirs',     'progression_note',       30),
  -- Social (chat de classe)
  ('esprit_de_classe',   'Esprit de classe',       '💬', 'Premier message envoyé dans le chat de classe',                    'Social',      'premier_message',        NULL),
  ('bon_camarade',       'Bon camarade',           '🤝', '10 messages envoyés dans le chat de classe',                       'Social',      'messages_classe',        10),
  -- Sessions live
  ('ponctuel',           'Ponctuel',               '🎥', '3 sessions live rejointes à l''heure',                             'Sessions live','sessions_a_lheure',     3),
  ('marathonien_live',   'Marathonien live',       '🏅', '20 sessions live suivies au total',                                'Sessions live','sessions_totales',      20),
  -- Explorateur (bibliothèque de contenus)
  ('curieux',            'Curieux',                '🔍', '5 ressources différentes consultées dans la bibliothèque',         'Explorateur', 'ressources_vues',        5),
  ('collectionneur',     'Collectionneur',         '🗂️', 'Contenus consultés dans au moins 4 catégories différentes',        'Explorateur', 'categories_explorees',   4)
ON CONFLICT (code) DO NOTHING;
