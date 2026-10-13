-- ============================================================================
--  Un devoir donné à plusieurs classes à la fois
-- ============================================================================
--
--  Même changement que `contenus_classes_elearning_multi_classes.sql`, appliqué aux
--  devoirs.
--
--  Un coach qui enseigne le même A2 à trois classes devait créer trois fois le
--  même devoir : trois consignes à écrire, trois fichiers à joindre, et surtout
--  trois corrections de la consigne le jour où une faute s'y glisse. Les rendus
--  des apprenants se retrouvaient répartis sur trois devoirs distincts, qu'aucun
--  écran ne rapprochait.
--
--  `classe_ids` lève cette limite : un devoir, plusieurs classes destinataires,
--  une seule consigne à corriger.
--
--  `classe_id` EST CONSERVÉE et reste alimentée avec la première de la liste.
--  Elle porte une contrainte `REFERENCES classes_elearning(id)` qu'un tableau ne
--  peut pas porter, et surtout `devoirs_rendus_elearning.classe_id` s'y rattache :
--  un rendu appartient à UNE classe — celle de l'apprenant qui l'a déposé — même
--  quand le devoir en vise plusieurs. Les deux colonnes ne décrivent pas la même
--  chose et doivent coexister.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE devoirs_elearning
  ADD COLUMN IF NOT EXISTS classe_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN devoirs_elearning.classe_ids IS
  'Classes auxquelles ce devoir est donné. Remplace classe_id (destinataire unique), qui reste alimentée avec la première de la liste. Un rendu, lui, reste rattaché à la seule classe de son auteur.';

-- Reprise des devoirs déjà créés : sans elle ils deviendraient invisibles le jour
-- où la lecture passe sur `classe_ids`.
UPDATE devoirs_elearning
   SET classe_ids = ARRAY[classe_id]
 WHERE classe_id IS NOT NULL
   AND (classe_ids IS NULL OR classe_ids = '{}');

-- Le chevauchement (&&) est l'opération de lecture principale : « les devoirs donnés
-- à l'une des classes de cet apprenant ». Sans index, chaque ouverture de l'onglet
-- Devoirs deviendrait un parcours complet de la table.
CREATE INDEX IF NOT EXISTS idx_devoirs_el_classe_ids
  ON devoirs_elearning USING GIN (classe_ids);

-- Vérification : aucun devoir ne doit rester sans destinataire après la reprise.
SELECT COUNT(*)                                              AS total,
       COUNT(*) FILTER (WHERE cardinality(classe_ids) > 0)   AS avec_destinataire,
       COUNT(*) FILTER (WHERE cardinality(classe_ids) > 1)   AS multi_classes,
       COUNT(*) FILTER (WHERE classe_id IS NOT NULL
                          AND cardinality(classe_ids) = 0)   AS a_reprendre
  FROM devoirs_elearning;
