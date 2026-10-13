-- ============================================================================
--  Lecture séquentielle des contenus — portail bet-elearning
-- ============================================================================
--
--  Même mécanisme que `modules_lecture_sequentielle.sql` côté dash, appliqué à la
--  table du portail e-learning.
--
--  Un contenu marqué `lecture_sequentielle` doit être terminé avant que ceux
--  publiés APRÈS lui ne s'ouvrent. Il sert à imposer un ordre là où il compte —
--  on ne commence pas le passé composé avant le présent — sans imposer cet ordre
--  partout : par défaut un contenu est libre, et le coach ne verrouille que les
--  étapes qui le méritent.
--
--  Le défaut est `false`, et c'est important : la colonne s'ajoute sur des
--  contenus déjà publiés et déjà lus. Un défaut `true` les rendrait tous
--  bloquants d'un coup, et une classe entière se retrouverait arrêtée au premier
--  cours qu'un apprenant n'a pas encore marqué comme terminé.
--
--  Pas d'index : la colonne n'est jamais un critère de filtre. Elle est lue avec
--  le contenu, dont la sélection porte déjà sur `classe_ids` (index GIN) et
--  `est_visible`.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE contenus_classes_elearning
  ADD COLUMN IF NOT EXISTS lecture_sequentielle BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN contenus_classes_elearning.lecture_sequentielle IS
  'true = ce contenu doit être terminé avant que ceux publiés après lui ne s''ouvrent, pour les classes qu''il vise. Lui-même reste toujours accessible, sinon le premier contenu séquentiel d''une classe serait inatteignable et le verrou définitif.';

-- Vérification : aucun contenu ne doit être obligatoire par accident après la migration.
SELECT COUNT(*)                                            AS total,
       COUNT(*) FILTER (WHERE lecture_sequentielle)        AS obligatoires,
       COUNT(*) FILTER (WHERE est_visible)                 AS publies
  FROM contenus_classes_elearning;
