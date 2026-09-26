-- ── Table codes_promo ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS codes_promo (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT         UNIQUE NOT NULL,
  description      TEXT,
  type_reduction   TEXT         NOT NULL DEFAULT 'pourcentage'
                                CHECK (type_reduction IN ('pourcentage', 'montant_fixe')),
  valeur           NUMERIC      NOT NULL,
  applicable_a     TEXT[]       NOT NULL DEFAULT ARRAY['tous'],
  date_expiration  TIMESTAMPTZ,
  usage_max        INTEGER,
  usage_count      INTEGER      NOT NULL DEFAULT 0,
  actif            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- Index pour la recherche par code (insensible à la casse)
CREATE INDEX IF NOT EXISTS idx_codes_promo_code ON codes_promo (UPPER(code));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_codes_promo_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_codes_promo_updated_at ON codes_promo;
CREATE TRIGGER trg_codes_promo_updated_at
  BEFORE UPDATE ON codes_promo
  FOR EACH ROW EXECUTE FUNCTION update_codes_promo_updated_at();
