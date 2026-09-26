-- ══════════════════════════════════════════════════════════════
-- honoraires_mois.coach_id n'avait AUCUNE contrainte FK déclarée —
-- une suppression de coach laissait ces honoraires (validés/transmis/payés
-- par le comptable) orphelins en silence, sans qu'aucune erreur ne le
-- signale. On ajoute la même protection que les tables comptabilite_* :
-- ON DELETE RESTRICT bloque explicitement toute suppression tant que des
-- honoraires existent pour ce coach, au lieu de laisser une incohérence
-- silencieuse.
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- NOT VALID : n'exige pas que les lignes existantes soient déjà conformes
-- (au cas où des coach_id orphelins existent déjà) — la contrainte protège
-- quand même immédiatement toute nouvelle écriture ET bloque bien les
-- suppressions futures de coach (RESTRICT s'applique dès l'ajout, même
-- NOT VALID). Validation complète possible plus tard une fois les données
-- vérifiées : ALTER TABLE public.honoraires_mois VALIDATE CONSTRAINT fk_honoraires_mois_coach;
ALTER TABLE public.honoraires_mois
  ADD CONSTRAINT fk_honoraires_mois_coach
  FOREIGN KEY (coach_id) REFERENCES public.utilisateurs(id) ON DELETE RESTRICT
  NOT VALID;
