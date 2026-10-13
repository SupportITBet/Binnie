-- ============================================================================
--  Minuteur de composition sur les évaluations à rendre en TEXTE — plateforme dash
-- ============================================================================
--
--  Même mécanisme que `devoirs_elearning_duree_composition.sql`, appliqué aux
--  évaluations du présentiel.
--
--  POURQUOI UNE NOUVELLE COLONNE PLUTÔT QUE `duree_min`. `evaluations_groupes`
--  porte déjà une colonne `duree_min`, mais elle a un autre sens : c'est la durée
--  ANNONCÉE de l'épreuve, affichée à titre indicatif, et elle vaut 60 par défaut
--  sur toutes les lignes existantes. La réutiliser comme minuteur aurait
--  chronométré d'un coup TOUTES les évaluations déjà publiées, fermant des copies
--  en cours sur une valeur que personne n'avait choisie dans ce but.
--
--  `duree_composition_min` est nulle par défaut : aucun minuteur tant que le coach
--  ne l'active pas. C'est une option, pas une règle.
--
--  `commence_at` VIT SUR LE RÉSULTAT, PAS SUR L'ÉVALUATION : le chrono est propre
--  à chaque apprenant. Deux élèves ouvrant la même composition à deux heures
--  d'écart ont chacun leur fenêtre. Il est enregistré côté serveur — dans le
--  navigateur, vider son cache suffirait à repartir à zéro.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE evaluations_groupes
  ADD COLUMN IF NOT EXISTS duree_composition_min INTEGER;

COMMENT ON COLUMN evaluations_groupes.duree_composition_min IS
  'Minuteur de composition en minutes, décompté depuis la première ouverture par l''apprenant. NULL = pas de minuteur (défaut). À ne pas confondre avec duree_min, qui est la durée annoncée de l''épreuve.';

ALTER TABLE resultats_evaluations_groupes
  ADD COLUMN IF NOT EXISTS commence_at TIMESTAMPTZ;

COMMENT ON COLUMN resultats_evaluations_groupes.commence_at IS
  'Date et heure de la première ouverture de l''évaluation par cet apprenant. Point de départ du minuteur ; NULL tant qu''il ne l''a pas ouverte.';

CREATE INDEX IF NOT EXISTS idx_resultats_eval_commence_at
  ON resultats_evaluations_groupes (commence_at)
  WHERE commence_at IS NOT NULL;

-- Vérification : aucune évaluation existante ne doit avoir hérité d'un minuteur.
SELECT COUNT(*)                                                AS total,
       COUNT(*) FILTER (WHERE duree_composition_min IS NOT NULL) AS avec_minuteur,
       COUNT(*) FILTER (WHERE duree_min IS NOT NULL)             AS avec_duree_annoncee
  FROM evaluations_groupes;
