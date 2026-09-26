-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `badges_obtenus`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── gamification_migration.sql  (2026-07-09) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Gamification BET — grand livre de points, catalogue de badges.
-- Implémente le schéma validé (artifact "Gamification BET — schéma & propositions").
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS points_gamif INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS points_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id UUID NOT NULL REFERENCES utilisateurs(id),
  source_type  TEXT NOT NULL CHECK (source_type IN ('session','devoir','devoir_bonus','mini_jeu','mini_jeu_progression','streak','onboarding','badge')),
  source_id    TEXT,
  points       INTEGER NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_apprenant     ON points_transactions(apprenant_id);
CREATE INDEX IF NOT EXISTS idx_pt_apprenant_src ON points_transactions(apprenant_id, source_type, created_at);

CREATE TABLE IF NOT EXISTS badges (
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

-- TODO (amélioration future) : la célébration de déblocage de badge côté frontend est
-- aujourd'hui dédupliquée via un cache localStorage par appareil — un apprenant qui se
-- connecte sur un autre appareil pourrait revoir la célébration d'un badge déjà obtenu
-- ailleurs. Une colonne `notifie_vu BOOLEAN NOT NULL DEFAULT false` ici, mise à jour par
-- l'API au moment où l'apprenant ferme l'overlay de célébration, serait plus robuste.
CREATE TABLE IF NOT EXISTS badges_obtenus (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id UUID NOT NULL REFERENCES utilisateurs(id),
  badge_id     UUID NOT NULL REFERENCES badges(id),
  obtenu_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (apprenant_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_bo_apprenant ON badges_obtenus(apprenant_id);

-- ── Catalogue de badges (schéma "02 — Catalogue" de l'artifact) ────────────
INSERT INTO badges (code, nom, icone, description, categorie, condition_type, condition_valeur) VALUES
  ('bienvenue',           'Bienvenue !',          '👋', 'Première connexion à BET E-Learning',                              'Démarrage',   'premiere_activite',    NULL),
  ('pret_a_apprendre',    'Prêt à apprendre',     '🧭', 'Guide d''onboarding terminé (4 étapes validées)',                   'Démarrage',   'onboarding_complete',  NULL),
  ('presence_parfaite',   'Présence parfaite',    '🎯', '5 sessions consécutives sans absence',                             'Assiduité',   'presences_consecutives', 5),
  ('serie_7',             'Série de 7',           '🔥', '7 jours d''activité consécutifs sur la plateforme',                 'Assiduité',   'streak_jours',          7),
  ('un_mois',             'Un mois avec BET',     '🗓️', '30 jours depuis l''inscription, toujours actif',                    'Assiduité',   'anciennete_jours',     30),
  ('premier_devoir',      'Premier devoir',       '✍️', 'Premier devoir rendu sur la plateforme',                           'Devoirs',     'premier_devoir',       NULL),
  ('travailleur_regulier','Travailleur régulier', '📚', '10 devoirs rendus, tous à temps',                                  'Devoirs',     'devoirs_temps',        10),
  ('perfectionniste',     'Perfectionniste',      '💯', 'Note de 100 % sur un devoir noté',                                 'Devoirs',     'devoir_note_max',      NULL),
  ('joueur_debutant',     'Joueur débutant',      '🕹️', 'Premier mini-jeu terminé',                                        'Mini-jeux',   'premier_jeu',          NULL),
  ('touche_a_tout',       'Touche-à-tout',        '🎲', 'Au moins une partie dans chaque jeu actif',                        'Mini-jeux',   'tous_jeux_actifs',     NULL),
  ('score_parfait',       'Score parfait',        '🏆', 'Score de 100 % sur un mini-jeu',                                   'Mini-jeux',   'jeu_score_parfait',    NULL),
  ('increvable',          'Increvable',           '💪', '10 parties jouées, tous jeux confondus',                           'Mini-jeux',   'parties_jouees',       10),
  ('niveau_superieur',    'Niveau supérieur',     '📈', 'Passage confirmé au niveau CECR suivant',                          'Progression', 'niveau_superieur',     NULL),
  ('certifie_bet',        'Certifié BET',         '🎓', 'Certificat de fin de parcours obtenu',                             'Progression', 'certification',        NULL),
  ('podium',              'Podium',               '🥇', 'Top 3 du classement de sa classe, en fin de mois',                 'Distinction', 'podium_mensuel',       NULL)
ON CONFLICT (code) DO NOTHING;

