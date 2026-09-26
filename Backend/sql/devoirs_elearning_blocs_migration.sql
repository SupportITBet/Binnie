-- ══════════════════════════════════════════════════════════════════
-- MIGRATION : portage des améliorations dash (devoirs/exercices/évaluations)
-- vers bet-elearning — catégorie réelle + blocs multiples (QCM + Listening +
-- Audio + Quiz + Speaking combinables dans une même évaluation).
-- ══════════════════════════════════════════════════════════════════

-- Catégorie pédagogique réelle (devoir/exercice/evaluation) — jusqu'ici choisie dans
-- l'UI du coach mais jamais envoyée au serveur, donc jamais stockée.
ALTER TABLE devoirs_elearning ADD COLUMN IF NOT EXISTS categorie TEXT DEFAULT 'devoir';

-- "format_type" accepte désormais aussi 'mixte' : dans ce cas, le contenu réel vit
-- dans "blocs" plutôt que dans format_type/questions/ressource_url seuls.
ALTER TABLE devoirs_elearning DROP CONSTRAINT IF EXISTS devoirs_elearning_format_type_check;
ALTER TABLE devoirs_elearning ADD CONSTRAINT devoirs_elearning_format_type_check
  CHECK (format_type IN ('texte_libre','qcm','listening','audio','quiz','speaking','mixte'));

ALTER TABLE devoirs_elearning ADD COLUMN IF NOT EXISTS blocs JSONB DEFAULT '[]';
  -- [{ id, type: qcm|listening|audio|quiz|speaking, questions[], ressourceUrl, instructions, conseil }]

-- Réponses de l'apprenant, par bloc — en complément de reponses_qcm (rétrocompatible avec
-- les devoirs à format unique déjà existants).
ALTER TABLE devoirs_rendus_elearning ADD COLUMN IF NOT EXISTS reponses_blocs JSONB DEFAULT '{}';
  -- { [bloc_id]: { "0": "optionA", ..., texte: "...", audioUrl: "..." } }
