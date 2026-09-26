-- ============================================================================
--  Médiathèque du coach — un contenu publié vers plusieurs classes
-- ============================================================================
--
--  Le modèle rattachait un contenu à UNE seule classe (`groupe_id`). Un coach
--  enseignant le même B1 à trois classes devait donc créer trois fois le même
--  contenu — et c'est précisément pour contourner cette limite qu'une fonction
--  « Dupliquer vers une autre classe » avait été construite. Elle copiait le
--  module, si bien que corriger une faute obligeait à la corriger dans chaque
--  copie.
--
--  `groupe_ids` remplace ce rattachement unique : un contenu, plusieurs
--  destinataires, une seule source à corriger. La fonction de duplication
--  disparaît avec la limite qui la justifiait.
--
--  Le type est un vrai tableau Postgres (et non du JSONB) pour deux raisons :
--  l'opérateur de chevauchement `&&` permet de répondre à « quels contenus
--  pour les classes de cet apprenant ? » en une requête, et un index GIN le
--  rend efficace quand le volume montera.
--
--  Sans risque sur l'existant : les tables `cours_elearning` et
--  `modules_elearning` sont vides au moment de cette migration, aucune reprise
--  de données n'est donc nécessaire. `groupe_id` est conservée — non utilisée,
--  mais laissée en place plutôt que supprimée, pour qu'un déploiement partiel
--  ne casse rien.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE modules_elearning
  ADD COLUMN IF NOT EXISTS groupe_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN modules_elearning.groupe_ids IS
  'Classes vers lesquelles ce contenu est publié. Remplace groupe_id (rattachement unique). Tableau vide = brouillon non diffusé.';

-- Reprise de l''ancien rattachement unique, au cas où des lignes existeraient.
UPDATE modules_elearning
   SET groupe_ids = ARRAY[groupe_id]
 WHERE groupe_id IS NOT NULL
   AND (groupe_ids IS NULL OR groupe_ids = '{}');

-- Le chevauchement (&&) est l''opération de lecture principale : « les contenus
-- destinés à l''une des classes de cet apprenant ». Sans index, elle deviendrait
-- un parcours complet de la table.
CREATE INDEX IF NOT EXISTS idx_modules_elearning_groupe_ids
  ON modules_elearning USING GIN (groupe_ids);

-- Vérification
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE cardinality(groupe_ids) > 0) AS publies,
       COUNT(*) FILTER (WHERE cardinality(groupe_ids) > 1) AS multi_classes
  FROM modules_elearning;
