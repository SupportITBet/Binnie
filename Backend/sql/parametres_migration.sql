-- ═══════════════════════════════════════════════════
--  TABLE : parametres
--  Stockage clé/valeur JSON pour les configs BET
--  (grille tarifaire, seuils, paramètres globaux…)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS parametres (
  cle        TEXT        PRIMARY KEY,
  valeur     JSONB       NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE parametres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full" ON parametres FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Valeur initiale de la grille tarifaire
INSERT INTO parametres (cle, valeur) VALUES (
  'grille_tarifaire',
  '{
    "tarifs": {
      "Vacataire":  { "en_ligne": 5000,  "presentiel": 6500,  "domicile": 7500  },
      "CDD":        { "en_ligne": 6500,  "presentiel": 8000,  "domicile": 9000  },
      "CDI":        { "en_ligne": 8000,  "presentiel": 9500,  "domicile": 11000 },
      "Freelance":  { "en_ligne": 6000,  "presentiel": 7500,  "domicile": 8500  }
    },
    "multiplicateurs": {
      "A1-A2": 1.0,
      "B1-B2": 1.2,
      "C1-C2": 1.5
    },
    "durees": [1, 1.5, 2]
  }'
) ON CONFLICT (cle) DO NOTHING;
