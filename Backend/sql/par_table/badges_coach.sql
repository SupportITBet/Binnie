-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `badges_coach`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── gamification_coach_migration.sql  (2026-07-29) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════════════
-- gamification_coach_migration.sql
-- Système de gamification des coachs — voir Backend/docs/gamification-coachs.html
-- pour le détail complet (économie de points, paliers, badges, garde-fous).
--
-- Tables dédiées, séparées du système de gamification des apprenants
-- (points_transactions / badges / badges_obtenus) : modèle de score différent
-- (composite glissant sur 3 mois avec paliers, pas un total cumulatif), et
-- aucune raison de mélanger les deux populations dans les mêmes tables.
--
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Grand livre de points (ledger) — une ligne par événement, jamais modifiée.
CREATE TABLE IF NOT EXISTS points_coach (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_id    UUID        NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  source_type TEXT        NOT NULL, -- rapport_superviseur | avis_parent | regularite | mois_sans_anomalie | remplacement_urgence | honoraires_valides
  source_id   TEXT,                 -- id de la ligne source (rapport, avis, remplacement...) — sert à l'idempotence
  points      INTEGER     NOT NULL,
  description TEXT,
  plateforme  TEXT        NOT NULL DEFAULT 'bet-elearning',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_coach_coach_id    ON points_coach(coach_id);
CREATE INDEX IF NOT EXISTS idx_points_coach_created_at  ON points_coach(created_at);
-- Empêche le job mensuel de compter deux fois le même événement source (rapport, avis, etc.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_coach_source ON points_coach(coach_id, source_type, source_id) WHERE source_id IS NOT NULL;

-- 2. Catalogue des badges coach (21 badges statiques, voir doc)
CREATE TABLE IF NOT EXISTS badges_coach (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT   NOT NULL UNIQUE,
  categorie   TEXT   NOT NULL,
  nom         TEXT   NOT NULL,
  icone       TEXT   NOT NULL,
  description TEXT   NOT NULL
);

INSERT INTO badges_coach (code, categorie, nom, icone, description) VALUES
  ('premier_rapport',        'demarrage',          'Premier rapport',            '📋', 'Première note reçue via un rapport d''observation transmis.'),
  ('premier_avis_parent',    'demarrage',          'Premier avis parent',        '👨‍👩‍👧', 'Premier avis parent reçu sur l''espace parent.'),
  ('sans_faute',             'excellence_terrain', 'Sans faute',                 '💯', 'Note globale de 5/5 sur un rapport d''observation.'),
  ('regulier',               'excellence_terrain', 'Régulier',                   '🔥', '3 rapports consécutifs notés ≥ 4,5/5.'),
  ('zero_anomalie',          'excellence_terrain', 'Zéro anomalie',              '🛡️', '6 mois consécutifs sans anomalie superviseur ouverte.'),
  ('toujours_a_lheure',      'excellence_terrain', 'Toujours à l''heure',        '⏰', 'Critère ponctualité à 5/5 sur 5 rapports consécutifs.'),
  ('pedagogue_confirme',     'excellence_terrain', 'Pédagogue confirmé',         '🎓', 'Critère pédagogie ≥ 4,5/5 en moyenne sur 10 rapports.'),
  ('coup_de_coeur_parents',  'excellence_parents', 'Coup de cœur parents',       '❤️', 'Avis parent noté 5/5 sur les 5 critères.'),
  ('progres_reconnu',        'excellence_parents', 'Progrès reconnu',            '📈', 'Critère « progression » ≥ 4,5/5 sur 3 mois consécutifs.'),
  ('toujours_disponible',    'excellence_parents', 'Toujours disponible',        '📞', 'Critère « disponibilité » à 5/5 sur 5 avis parents.'),
  ('constant',               'excellence_parents', 'Constant',                   '🌟', 'Moyenne des avis parents ≥ 4,5/5 sur 6 mois glissants.'),
  ('six_mois_engagement',    'fidelite',           '6 mois d''engagement',       '🗓️', '6 mois d''ancienneté en tant que coach actif.'),
  ('un_an_avec_bet',         'fidelite',           'Un an avec BET',             '🏠', '1 an d''ancienneté, toujours actif.'),
  ('veteran_coach',          'fidelite',           'Vétéran coach',              '🏛️', '2 ans d''ancienneté, toujours actif.'),
  ('depanneur',              'terrain_dispo',      'Dépanneur',                  '🆘', '2 remplacements d''urgence acceptés et honorés.'),
  ('increvable',             'terrain_dispo',      'Increvable',                 '💪', '10 remplacements assurés au total, tous motifs confondus.'),
  ('zero_absence',           'terrain_dispo',      'Zéro absence',               '✅', 'Aucune séance manquée sur un trimestre complet.'),
  ('palier_argent',          'paliers_leadership', 'Palier Argent atteint',      '🥈', 'Premier passage au palier Argent.'),
  ('palier_or',              'paliers_leadership', 'Palier Or atteint',          '🥇', 'Premier passage au palier Or.'),
  ('palier_platine',         'paliers_leadership', 'Palier Platine atteint',     '💎', 'Premier passage au palier Platine.'),
  ('coach_du_mois',          'paliers_leadership', 'Coach du mois',              '🏆', '1ᵉʳ au classement mensuel, tous coachs confondus.')
ON CONFLICT (code) DO NOTHING;

-- 3. Badges débloqués par coach (une ligne par déblocage, jamais retirée)
CREATE TABLE IF NOT EXISTS badges_coach_obtenus (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_id    UUID        NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  badge_id    BIGINT      NOT NULL REFERENCES badges_coach(id) ON DELETE CASCADE,
  obtenu_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, badge_id)
);

-- 4. Stats dénormalisées recalculées par le job mensuel — évite de resommer
--    points_coach à chaque affichage du tableau de bord coach.
CREATE TABLE IF NOT EXISTS stats_gamif_coach (
  coach_id        UUID        PRIMARY KEY REFERENCES utilisateurs(id) ON DELETE CASCADE,
  score_glissant  NUMERIC     NOT NULL DEFAULT 0, -- somme des points sur les 3 derniers mois
  palier          TEXT        NOT NULL DEFAULT 'bronze', -- bronze | argent | or | platine
  rang            INTEGER,                              -- rang dans le classement mensuel (1 = premier)
  eligible_or_platine BOOLEAN NOT NULL DEFAULT true,     -- false si anomalie superviseur ouverte
  derniere_maj    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. avis_parents_coach n'a qu'un coach_nom (texte) — pas de coach_id fiable pour la
--    gamification. Ajout de la colonne + backfill via classe_id -> classes_elearning.coach_id
--    (bet-elearning) OU groupes.coach_id (dash, classe_id y contient un groupes.id) pour les
--    lignes existantes (best-effort ; les nouvelles lignes sont résolues au moment de la
--    soumission, voir POST /api/analytics/avis-parent).
ALTER TABLE avis_parents_coach ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES utilisateurs(id);
UPDATE avis_parents_coach apc
SET coach_id = ce.coach_id
FROM classes_elearning ce
WHERE apc.classe_id = ce.id::text AND apc.coach_id IS NULL;
UPDATE avis_parents_coach apc
SET coach_id = g.coach_id
FROM groupes g
WHERE apc.classe_id = g.id::text AND apc.coach_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_avis_parents_coach_coach_id ON avis_parents_coach(coach_id);

-- ══════════════════════════════════════════════════════════════════════
-- Tables DASH — physiquement séparées des tables bet-elearning ci-dessus
-- (ledger, badges obtenus, stats), à la demande explicite : les deux
-- plateformes ne doivent pas partager la même table de données coach.
-- Seul le catalogue de badges (badges_coach, purement statique — aucune
-- donnée par coach ni par plateforme) reste commun aux deux systèmes.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS points_coach_dash (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_id    UUID        NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  source_type TEXT        NOT NULL,
  source_id   TEXT,
  points      INTEGER     NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_coach_dash_coach_id   ON points_coach_dash(coach_id);
CREATE INDEX IF NOT EXISTS idx_points_coach_dash_created_at ON points_coach_dash(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_coach_dash_source ON points_coach_dash(coach_id, source_type, source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS badges_coach_obtenus_dash (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_id    UUID        NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  badge_id    BIGINT      NOT NULL REFERENCES badges_coach(id) ON DELETE CASCADE,
  obtenu_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, badge_id)
);

CREATE TABLE IF NOT EXISTS stats_gamif_coach_dash (
  coach_id        UUID        PRIMARY KEY REFERENCES utilisateurs(id) ON DELETE CASCADE,
  score_glissant  NUMERIC     NOT NULL DEFAULT 0,
  palier          TEXT        NOT NULL DEFAULT 'bronze',
  rang            INTEGER,
  eligible_or_platine BOOLEAN NOT NULL DEFAULT true,
  derniere_maj    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE points_coach              DISABLE ROW LEVEL SECURITY;
ALTER TABLE badges_coach              DISABLE ROW LEVEL SECURITY;
ALTER TABLE badges_coach_obtenus      DISABLE ROW LEVEL SECURITY;
ALTER TABLE stats_gamif_coach         DISABLE ROW LEVEL SECURITY;
ALTER TABLE points_coach_dash         DISABLE ROW LEVEL SECURITY;
ALTER TABLE badges_coach_obtenus_dash DISABLE ROW LEVEL SECURITY;
ALTER TABLE stats_gamif_coach_dash    DISABLE ROW LEVEL SECURITY;

