-- ══════════════════════════════════════════════════════════════
-- Dissociation dash / bet-elearning — étape 2 : evaluations_coachs
-- Un coach peut être habilité aux deux plateformes (acces_elearning=true) et donc
-- apparaître dans les deux listes de coachs. Mais ses NOTES doivent rester séparées :
-- une évaluation saisie depuis le PA Advisor de dash ne doit jamais compter côté
-- bet-elearning, et inversement. Même pattern que rapports_observation/anomalies_superviseur/
-- missions_deputy (cf. superviseur_plateforme_migration.sql, déjà exécutée).
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE evaluations_coachs
  ADD COLUMN IF NOT EXISTS plateforme TEXT NOT NULL DEFAULT 'dash'
  CHECK (plateforme IN ('dash', 'bet-elearning'));

CREATE INDEX IF NOT EXISTS idx_evaluations_coachs_plateforme ON evaluations_coachs(plateforme);

-- Note : les lignes existantes sont par défaut rattachées à 'dash' (leur origine réelle
-- jusqu'ici, seul le PA Advisor de dash notant les coachs).
