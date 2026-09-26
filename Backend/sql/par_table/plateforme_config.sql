-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `plateforme_config`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── plateforme_config_migration.sql  (2026-06-19) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
--  plateforme_config  —  table de configuration clé/valeur
--  Utilisée pour stocker les paramètres configurables du site
--  (parcours entreprise, centres, etc.)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plateforme_config (
  key         TEXT        PRIMARY KEY,
  valeur      JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour accélérer les lookups par clé
CREATE INDEX IF NOT EXISTS idx_plateforme_config_key ON plateforme_config (key);

-- Politique RLS : lecture publique (le frontend lit sans auth)
ALTER TABLE plateforme_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecture publique plateforme_config"
  ON plateforme_config FOR SELECT
  USING (true);

-- Écriture : service_role uniquement (SuperAdmin utilise la service key)
CREATE POLICY "ecriture service role plateforme_config"
  ON plateforme_config FOR INSERT
  WITH CHECK (true);

CREATE POLICY "update service role plateforme_config"
  ON plateforme_config FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ── Valeur initiale parcours entreprise ────────────────────────
INSERT INTO plateforme_config (key, valeur, updated_at)
VALUES (
  'parcours_entreprise',
  '{
    "formats": [
      {"id":"presentiel","label":"Présentiel",      "icon":"🏢","desc":"Dans nos locaux à Abidjan",     "actif":true},
      {"id":"distanciel","label":"À distance",      "icon":"🌐","desc":"Sessions Zoom / Teams",          "actif":true},
      {"id":"hybride",   "label":"Hybride",         "icon":"⚡","desc":"Mix présentiel & en ligne",      "actif":true},
      {"id":"elearning", "label":"E-learning seul", "icon":"💡","desc":"100% autonome, à votre rythme", "actif":true}
    ],
    "rythmes": [
      {"id":"intensif","label":"Intensif",      "desc":"5 sessions/semaine",   "actif":true},
      {"id":"regulier","label":"Régulier",      "desc":"3 sessions/semaine",   "actif":true},
      {"id":"leger",   "label":"Modéré",        "desc":"2 sessions/semaine",   "actif":true},
      {"id":"weekend", "label":"Week-end only", "desc":"Sam + Dim uniquement", "actif":true}
    ],
    "groupes": [
      {"id":"individuel","label":"Individuel",    "desc":"Cours 100% personnalisé","actif":true},
      {"id":"duo",       "label":"Duo",           "desc":"2 participants",          "actif":true},
      {"id":"petit",     "label":"Petit groupe",  "desc":"3 à 6 participants",      "actif":true},
      {"id":"groupe",    "label":"Groupe",        "desc":"7 à 15 participants",     "actif":true},
      {"id":"classe",    "label":"Grande classe", "desc":"16 à 25 participants",    "actif":true}
    ],
    "niveaux": [
      {"id":"A1","label":"A1 — Débutant",         "icon":"🔵","desc":"Niveau débutant complet",         "actif":true},
      {"id":"A2","label":"A2 — Élémentaire",       "icon":"🟡","desc":"Bases acquises",                  "actif":true},
      {"id":"B1","label":"B1 — Intermédiaire",     "icon":"🟣","desc":"Peut communiquer en anglais",     "actif":true},
      {"id":"B2","label":"B2 — Interm. supérieur", "icon":"🔷","desc":"Bonne aisance à l oral et écrit", "actif":true},
      {"id":"C1","label":"C1 — Avancé",            "icon":"🟢","desc":"Maîtrise professionnelle",         "actif":true},
      {"id":"C2","label":"C2 — Maîtrise",          "icon":"🔴","desc":"Niveau quasi-bilingue",            "actif":true}
    ],
    "objectifs": [
      {"id":"communication","label":"Communication quotidienne", "icon":"💬","actif":true},
      {"id":"business",     "label":"Anglais des affaires",      "icon":"💼","actif":true},
      {"id":"toeic",        "label":"Certification TOEIC",       "icon":"🏆","actif":true},
      {"id":"ielts",        "label":"Certification IELTS",       "icon":"📜","actif":true},
      {"id":"presentations","label":"Présentations & réunions",  "icon":"🎤","actif":true},
      {"id":"redaction",    "label":"Rédaction professionnelle", "icon":"✍️","actif":true},
      {"id":"negociation",  "label":"Négociation commerciale",   "icon":"🤝","actif":true},
      {"id":"technique",    "label":"Anglais technique / IT",    "icon":"💻","actif":true}
    ]
  }',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

