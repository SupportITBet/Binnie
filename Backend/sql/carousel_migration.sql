-- Migration : table carousel_slides
-- À exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS carousel_slides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL DEFAULT 'image' CHECK (type IN ('image','video')),
  url         TEXT NOT NULL,
  titre       TEXT DEFAULT '',
  description TEXT DEFAULT '',
  link_url    TEXT DEFAULT '',
  link_label  TEXT DEFAULT '',
  ordre       INTEGER NOT NULL DEFAULT 0,
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carousel_actif  ON carousel_slides (actif);
CREATE INDEX IF NOT EXISTS idx_carousel_ordre  ON carousel_slides (ordre);

-- Données initiales (slides par défaut)
INSERT INTO carousel_slides (type, url, titre, description, link_url, link_label, ordre, actif) VALUES
  ('image', 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1600&q=80', 'Votre anglais, votre avenir.', 'Certifications TOEIC · TOEFL · IELTS pour particuliers et professionnels.', '', '', 0, true),
  ('image', 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1600&q=80', 'Cabinet agréé de l''État', 'Cours en ligne, en cabinet ou à domicile partout en Côte d''Ivoire.', '', '', 1, true),
  ('image', 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80', '+3 000 apprenants certifiés', 'Rejoignez notre communauté d''apprenants et réussissez votre certification.', '', '', 2, true)
ON CONFLICT DO NOTHING;
