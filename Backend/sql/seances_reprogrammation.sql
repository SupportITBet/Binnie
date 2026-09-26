-- ============================================================================
--  Reprogrammation d'une séance non effectuée
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Une séance dont la date est passée et dont la salle n'a jamais été ouverte porte
--  désormais le badge « non effectuée ». Le coach doit pouvoir la reposer plus tard.
--
--  Déplacer la date sans rien conserver effacerait le fait : la séance redeviendrait
--  une séance ordinaire à sa nouvelle date, et plus personne — ni le PA, ni la
--  commerciale — ne saurait qu'un cours n'a pas eu lieu au moment prévu. C'est
--  précisément l'information qu'on cherche à suivre.
--
--  `date_seance_initiale` n'est renseignée qu'au PREMIER report : elle porte la date
--  d'origine du contrat pédagogique, pas la dernière date abandonnée. Les reports
--  successifs se lisent alors d'un coup d'œil (écart entre l'initiale et la courante).
-- ============================================================================

ALTER TABLE public.seances
  ADD COLUMN IF NOT EXISTS date_seance_initiale date,
  ADD COLUMN IF NOT EXISTS reprogrammee_le      timestamptz,
  ADD COLUMN IF NOT EXISTS reprogrammee_motif   text;

COMMENT ON COLUMN public.seances.date_seance_initiale IS
  'Date prevue a l''origine, figee au premier report. NULL = seance jamais reprogrammee.';
COMMENT ON COLUMN public.seances.reprogrammee_le IS
  'Horodatage du dernier report.';
COMMENT ON COLUMN public.seances.reprogrammee_motif IS
  'Motif saisi par le coach lors du dernier report.';

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)                        AS total,
       COUNT(date_seance_initiale)     AS reprogrammees
  FROM public.seances;
