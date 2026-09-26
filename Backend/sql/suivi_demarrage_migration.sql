-- ══════════════════════════════════════════════════════════════
-- Ajout suivi_demarrage sur assignations_parcours
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Colonne JSONB pour la checklist de suivi de démarrage de l'apprenant
-- Format :
-- {
--   "steps": [
--     { "id": "acces_plateforme", "done": true, "date": "2024-01-15", "note": "" },
--     ...
--   ],
--   "notes_generales": "Texte libre du commercial"
-- }
ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS suivi_demarrage JSONB DEFAULT NULL;
