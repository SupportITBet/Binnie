-- Migration : plan de paiement échelonné + blocage d'accès
-- Ajoute la colonne plan_paiement (JSONB) à assignations_parcours
-- Structure :
-- {
--   "acces_bloque": false,
--   "raison_blocage": null,
--   "tranches": [
--     {
--       "id": "t1",
--       "label": "Acompte",
--       "montant": 75000,
--       "date_echeance": "2026-06-01",
--       "statut": "en_attente",   -- "en_attente" | "payé" | "retard"
--       "date_paiement_effectif": null,
--       "notes": null
--     }
--   ]
-- }

ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS plan_paiement JSONB DEFAULT NULL;
