-- Migration : table FAQ
CREATE TABLE IF NOT EXISTS faq_items (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question   TEXT        NOT NULL,
  reponse    TEXT        NOT NULL,
  categorie  TEXT        NOT NULL DEFAULT 'Général',
  ordre      INTEGER     NOT NULL DEFAULT 0,
  actif      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_categorie ON faq_items (categorie);
CREATE INDEX IF NOT EXISTS idx_faq_actif     ON faq_items (actif);
CREATE INDEX IF NOT EXISTS idx_faq_ordre     ON faq_items (categorie, ordre);
