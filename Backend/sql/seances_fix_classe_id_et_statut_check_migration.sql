-- CORRECTIF — deux bugs pré-existants découverts en testant la table `seances`,
-- antérieurs et sans rapport avec la migration honoraires précédente. Ensemble,
-- ils bloquent TOUTE insertion dans `seances` (ce qui explique pourquoi cette
-- table et `honoraires_mois` sont vides en production).

-- ── Bug 1 : seances.classe_id est NOT NULL + clé étrangère, mais n'est
-- JAMAIS renseignée par le code applicatif (aucune occurrence de "classe_id"
-- dans Backend/src/routes/seances.js) et n'apparaît pas non plus dans la
-- migration d'origine seances_unifiees_migration.sql — colonne orpheline
-- ajoutée hors migration suivie. Elle bloque inconditionnellement tout
-- insert. On la rend nullable (non destructif, ne supprime rien).
ALTER TABLE seances
  ALTER COLUMN classe_id DROP NOT NULL;

-- ── Bug 2 : la contrainte seances_statut_check en production rejette
-- actuellement TOUTES les valeurs documentées comme valides dans la
-- migration d'origine ('planifiee','realisee','annulee','coach_absent',
-- 'apprenant_absent') — testé par insertion réelle, la définition live
-- diverge du fichier de migration suivi. On la recrée explicitement pour
-- qu'elle corresponde à ce que le code applicatif utilise réellement.
ALTER TABLE seances
  DROP CONSTRAINT IF EXISTS seances_statut_check;

ALTER TABLE seances
  ADD CONSTRAINT seances_statut_check
  CHECK (statut IN ('planifiee', 'realisee', 'annulee', 'coach_absent', 'apprenant_absent'));
