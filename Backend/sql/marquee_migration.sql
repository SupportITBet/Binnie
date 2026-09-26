-- ── Table : messages défilants (marquee) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS marquee_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texte            TEXT        NOT NULL,
  code_promo       TEXT,
  lien_url         TEXT,
  lien_label       TEXT,
  date_expiration  TIMESTAMPTZ,
  actif            BOOLEAN     NOT NULL DEFAULT true,
  ordre            INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages par défaut
INSERT INTO marquee_messages (texte, actif, ordre) VALUES
  ('🎓 Nouveau · Cours intensifs TOEIC — Session de Juin ouverte !',               true, 0),
  ('🌍 Séjours linguistiques UK, USA, Canada — Places limitées !',                  true, 1),
  ('📢 Test de niveau 100% gratuit — Connaissez votre niveau en 20 min !',          true, 2),
  ('🏆 Nos apprenants obtiennent en moyenne 750+ au TOEIC dès le 1er passage !',   true, 3),
  ('💼 Formations entreprises : tarifs dégressifs à partir de 5 employés !',        true, 4),
  ('🎁 Offre spéciale · -15% sur l''inscription en ligne jusqu''au 30 juin !',     true, 5)
ON CONFLICT DO NOTHING;
