-- ============================================================================
--  CORRECTIF — retirer la contrainte sur type_lecon
-- ============================================================================
--
--  ⚠️  EXÉCUTER CE FICHIER (Supabase → SQL Editor → Run) si vous avez déjà lancé
--      rapports_observation_professionnalisme.sql.
--
--  Ce fichier corrige une erreur du précédent.
--
--  `rapports_observation_type_lecon_chk` y était posée NOT VALID, dans l'idée que
--  les rapports antérieurs — qui portent un type de CONTENU (« Autre »,
--  « Grammaire », « Expression orale »…) et non une modalité — en seraient
--  dispensés.
--
--  C'est faux. NOT VALID dispense les lignes existantes du contrôle AU MOMENT OÙ
--  LA CONTRAINTE EST CRÉÉE, mais toute ligne mise à jour ensuite est revérifiée.
--  Conséquence observée : transmettre au conseil pédagogique un rapport ancien —
--  une simple écriture de `statut` — échouait en 23514, le rapport devenant
--  définitivement intransmissible.
--
--  La décision reste celle prise : les deux vocabulaires cohabitent dans la
--  colonne, la date du rapport les départage. Une contrainte CHECK affirme
--  l'inverse, donc elle n'a pas lieu d'être. C'est le formulaire qui garantit le
--  vocabulaire des nouvelles saisies — il ne propose que les trois modalités.
-- ============================================================================

ALTER TABLE public.rapports_observation
  DROP CONSTRAINT IF EXISTS rapports_observation_type_lecon_chk;

COMMENT ON COLUMN public.rapports_observation.type_lecon IS
  'Modalite du cours : online | in_person | home_tutoring. Les rapports anterieurs y portent
   un type de CONTENU (Grammaire, Expression orale, Autre...). Aucune contrainte : les deux
   vocabulaires cohabitent, la date du rapport les departage.';

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*) FILTER (WHERE type_lecon IN ('online','in_person','home_tutoring')) AS nouveau_vocab,
       COUNT(*) FILTER (WHERE type_lecon IS NOT NULL
                          AND type_lecon NOT IN ('online','in_person','home_tutoring')) AS ancien_vocab,
       NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'rapports_observation_type_lecon_chk') AS contrainte_retiree
  FROM public.rapports_observation;
