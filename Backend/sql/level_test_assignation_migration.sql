-- Rattache un test de niveau (level_test_results) à un dossier précis
-- (assignations_parcours) par clé étrangère, au lieu de ne compter que sur
-- un rapprochement fragile par email + nom côté frontend (CommercialDashboard.jsx
-- findTestForProspect / trouverParEmailEtNom) — cassait systématiquement pour
-- les profils enfant (email partagé avec le parent) et restait fragile pour
-- tous les autres profils (espaces, nom modifié par le prospect, etc.).

ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS assignation_id uuid REFERENCES public.assignations_parcours(id);

CREATE INDEX IF NOT EXISTS idx_level_test_results_assignation
  ON public.level_test_results(assignation_id);
