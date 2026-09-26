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
