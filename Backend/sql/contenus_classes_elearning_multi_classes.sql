-- ============================================================================
--  Médiathèque du coach (bet-elearning) — un contenu publié vers plusieurs classes
-- ============================================================================
--
--  Même changement que `modules_elearning_multi_classes.sql` côté dash, appliqué
--  à la table du portail e-learning.
--
--  `contenus_classes_elearning.classe_id` rattachait un contenu à UNE classe. Un
--  coach enseignant le même B1 à trois classes devait donc créer trois fois la
--  même leçon, et corriger une faute l'obligeait à la corriger dans chaque copie.
--  `classe_ids` lève cette limite : un contenu, plusieurs destinataires, une
--  seule source à corriger.
--
--  Un vrai tableau Postgres, et non du JSONB, pour deux raisons : l'opérateur de
--  chevauchement `&&` répond en une requête à « quels contenus pour les classes
--  de cet apprenant ? », et un index GIN le garde efficace quand le volume
--  montera.
--
--  `classe_id` EST CONSERVÉE, et le serveur continue de l'écrire avec la
--  première classe de la liste. Ce n'est pas de la prudence gratuite : la
--  colonne porte une contrainte `REFERENCES classes_elearning(id) ON DELETE SET
--  NULL` qu'un tableau ne peut pas porter, et surtout l'espace apprenant lit
--  encore `classe_id` directement via le client Supabase. Tant que les deux
--  fronts ne sont pas déployés ensemble, la laisser juste évite qu'un apprenant
--  perde ses cours entre les deux déploiements.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE contenus_classes_elearning
  ADD COLUMN IF NOT EXISTS classe_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN contenus_classes_elearning.classe_ids IS
  'Classes vers lesquelles ce contenu est publié. Remplace classe_id (rattachement unique), qui reste alimentée avec la première de la liste. Tableau vide = contenu sans destinataire, lu par personne.';

-- Reprise de l'ancien rattachement unique pour les contenus déjà créés : sans
-- cela ils deviendraient invisibles le jour où la lecture passe sur `classe_ids`.
UPDATE contenus_classes_elearning
   SET classe_ids = ARRAY[classe_id]
 WHERE classe_id IS NOT NULL
   AND (classe_ids IS NULL OR classe_ids = '{}');

-- Le chevauchement (&&) est l'opération de lecture principale : « les contenus
-- destinés à l'une des classes de cet apprenant ». Sans index, chaque ouverture
-- de l'espace apprenant deviendrait un parcours complet de la table.
CREATE INDEX IF NOT EXISTS idx_cce_classe_ids
  ON contenus_classes_elearning USING GIN (classe_ids);

-- Vérification : aucune ligne ne doit rester avec un `classe_id` renseigné et un
-- `classe_ids` vide — ce serait un contenu orphelin, visible du coach et de
-- personne d'autre.
SELECT COUNT(*)                                                          AS total,
       COUNT(*) FILTER (WHERE cardinality(classe_ids) > 0)               AS diffuses,
       COUNT(*) FILTER (WHERE cardinality(classe_ids) > 1)               AS multi_classes,
       COUNT(*) FILTER (WHERE classe_id IS NOT NULL
                          AND cardinality(classe_ids) = 0)               AS a_reprendre
  FROM contenus_classes_elearning;
