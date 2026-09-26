-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `config_contact`
-- Généré à partir de 2 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── config_contact_migration.sql  (2026-05-25) ──────────────────────────────
-- Table de configuration du contact central BET
CREATE TABLE IF NOT EXISTS config_contact (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  whatsapp_number TEXT    NOT NULL DEFAULT '2250000000000',
  whatsapp_message TEXT   NOT NULL DEFAULT 'Bonjour ! Je souhaite avoir des informations sur les cours d''anglais chez BET.',
  email_central   TEXT    NOT NULL DEFAULT 'contact@bet-ci.com',
  localisation    TEXT             DEFAULT 'Abidjan, Côte d''Ivoire',
  maps_embed_url  TEXT             DEFAULT '',
  faq_contact     JSONB            DEFAULT '[]',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer la ligne unique si elle n'existe pas
INSERT INTO config_contact (id, whatsapp_number, whatsapp_message, email_central, localisation)
VALUES (1, '2250000000000', 'Bonjour ! Je souhaite avoir des informations sur les cours d''anglais chez BET.', 'contact@bet-ci.com', 'Abidjan, Côte d''Ivoire')
ON CONFLICT (id) DO NOTHING;

-- Ajouter les colonnes si la table existe déjà (migration)
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS localisation             TEXT    DEFAULT 'Abidjan, Côte d''Ivoire';
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS maps_embed_url           TEXT    DEFAULT '';
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS faq_contact              JSONB   DEFAULT '[]';
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_facebook          TEXT    DEFAULT '';
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_facebook_visible  BOOLEAN DEFAULT true;
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_instagram         TEXT    DEFAULT '';
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_instagram_visible BOOLEAN DEFAULT true;
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_linkedin          TEXT    DEFAULT '';
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_linkedin_visible  BOOLEAN DEFAULT true;
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_tiktok            TEXT    DEFAULT '';
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_tiktok_visible    BOOLEAN DEFAULT true;
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_twitter           TEXT    DEFAULT '';
ALTER TABLE config_contact ADD COLUMN IF NOT EXISTS social_twitter_visible   BOOLEAN DEFAULT true;

-- ── config_contact_social_migration.sql  (2026-05-25) ──────────────────────────────
-- Migration : ajout colonnes réseaux sociaux à config_contact
ALTER TABLE config_contact
  ADD COLUMN IF NOT EXISTS social_facebook          TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_facebook_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS social_instagram         TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_instagram_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS social_linkedin          TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_linkedin_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS social_tiktok            TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_tiktok_visible    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS social_twitter           TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_twitter_visible   BOOLEAN NOT NULL DEFAULT TRUE;

