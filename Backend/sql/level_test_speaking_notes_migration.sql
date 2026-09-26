-- Ajoute une colonne pour stocker une note d'évaluation + un score indicatif par
-- question speaking, en plus du score/niveau global attribué manuellement par la
-- correctrice. Format : { "<question_id>": { "note": "texte libre", "score": 0-100 } }
ALTER TABLE level_test_results
  ADD COLUMN IF NOT EXISTS speaking_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
