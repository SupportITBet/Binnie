-- ============================================================================
--  Un devoir donné à plusieurs groupes à la fois — plateforme dash
-- ============================================================================
--
--  Même changement que `devoirs_elearning_multi_classes.sql`, appliqué aux
--  évaluations du présentiel.
--
--  Un coach qui enseigne le même niveau à trois groupes devait créer trois fois
--  la même évaluation : trois consignes, trois fichiers joints, et trois
--  corrections de la consigne le jour où une faute s'y glisse.
--
--  CE QUI NE CHANGE PAS, ET C'EST IMPORTANT. Les routes restent imbriquées sous
--  un groupe (`/api/groupes/:id/evaluations/...`) et c'est volontaire : ce `:id`
--  ne désigne plus la cible du devoir mais LE GROUPE DANS LEQUEL ON TRAVAILLE —
--  celui dont on liste les copies, celui dont on saisit les notes. Un coach
--  corrige une classe à la fois, même quand le sujet est partagé.
--
--  `resultats_evaluations_groupes.groupe_id` garde donc tout son sens : un
--  résultat appartient à UN groupe, celui de l'apprenant qui l'a composé.
--
--  `groupe_id` sur l'évaluation EST CONSERVÉE et reste alimentée avec le premier
--  de la liste : plusieurs écrans la lisent encore, et elle porte une contrainte
--  de clé étrangère qu'un tableau ne peut pas porter.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE evaluations_groupes
  ADD COLUMN IF NOT EXISTS groupe_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN evaluations_groupes.groupe_ids IS
  'Groupes auxquels cette évaluation est donnée. Remplace groupe_id (destinataire unique), qui reste alimentée avec le premier de la liste. Un résultat, lui, reste rattaché au seul groupe de son auteur.';

-- Reprise des évaluations déjà créées : sans elle, elles disparaîtraient des
-- écrans le jour où la lecture passe sur `groupe_ids`.
UPDATE evaluations_groupes
   SET groupe_ids = ARRAY[groupe_id]
 WHERE groupe_id IS NOT NULL
   AND (groupe_ids IS NULL OR groupe_ids = '{}');

-- Le chevauchement (&&) est l'opération de lecture principale : « les évaluations
-- données au groupe de cet apprenant ». Sans index, chaque ouverture de l'onglet
-- deviendrait un parcours complet de la table.
CREATE INDEX IF NOT EXISTS idx_evaluations_groupes_groupe_ids
  ON evaluations_groupes USING GIN (groupe_ids);

-- Vérification : aucune évaluation ne doit rester sans destinataire.
SELECT COUNT(*)                                              AS total,
       COUNT(*) FILTER (WHERE cardinality(groupe_ids) > 0)   AS avec_destinataire,
       COUNT(*) FILTER (WHERE cardinality(groupe_ids) > 1)   AS multi_groupes,
       COUNT(*) FILTER (WHERE groupe_id IS NOT NULL
                          AND cardinality(groupe_ids) = 0)   AS a_reprendre
  FROM evaluations_groupes;
