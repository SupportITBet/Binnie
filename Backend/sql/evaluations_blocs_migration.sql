-- ══════════════════════════════════════════════════════════════════
-- MIGRATION : blocs multiples (mix QCM + Listening + Audio + Quiz + Speaking)
-- au sein d'une même évaluation, en plus du format unique existant.
-- ══════════════════════════════════════════════════════════════════

-- evaluations_groupes.type accepte désormais aussi 'mixte' : dans ce cas, le
-- contenu réel vit dans "blocs" (liste) plutôt que dans type/questions/ressource_url.
ALTER TABLE evaluations_groupes ADD COLUMN IF NOT EXISTS blocs JSONB DEFAULT '[]';
  -- [{ id, type: qcm|listening|audio|quiz|speaking, questions[], ressource_url, instructions }]

-- Réponses de l'apprenant, par bloc — en complément de reponses_qcm (rétrocompatible
-- avec les évaluations à format unique déjà existantes).
ALTER TABLE resultats_evaluations_groupes ADD COLUMN IF NOT EXISTS reponses_blocs JSONB DEFAULT '{}';
  -- { [bloc_id]: { "0": "optionA", "1": "optionC", texte: "..." } }
