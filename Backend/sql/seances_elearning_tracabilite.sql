-- ============================================================================
--  Traçabilité et reprogrammation — séances e-learning
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  L'espace professeur de bet-elearning souffre exactement des mêmes manques que
--  celui de `dash`, mais sur un autre modèle de données : il n'écrit pas dans
--  `sessions_live`, il passe par `/api/elearning/seances` → `seances_elearning`.
--
--  Ce que ces colonnes réparent :
--
--  1. Le temps réellement passé en salle. Le chronomètre s'affiche au coach pendant
--     la séance et disparaît à la clôture, qui n'envoie que `statut: "realisee"`.
--     Personne ne peut ensuite dire si un cours prévu 90 min a duré 25 minutes.
--
--  2. L'heure d'ouverture. Sans elle, le chronomètre repart de zéro à chaque
--     rafraîchissement de la page : le coach perd sa salle, et la durée affichée
--     ne veut plus rien dire. Le compteur doit se calculer à partir d'un instant
--     enregistré côté serveur, pas d'un compteur local.
--
--  3. Le report d'une séance non effectuée. Déplacer la date sans conserver
--     l'originale efface le fait qu'un cours n'a pas eu lieu au moment prévu —
--     l'information même que l'on cherche à suivre. `date_initiale` est figée au
--     PREMIER report : elle porte la date d'origine, pas la dernière abandonnée.
-- ============================================================================

ALTER TABLE public.seances_elearning
  ADD COLUMN IF NOT EXISTS demarree_at        timestamptz,
  ADD COLUMN IF NOT EXISTS terminee_at        timestamptz,
  ADD COLUMN IF NOT EXISTS duree_reelle_s     integer,
  ADD COLUMN IF NOT EXISTS date_initiale      date,
  ADD COLUMN IF NOT EXISTS reprogrammee_le    timestamptz,
  ADD COLUMN IF NOT EXISTS reprogrammee_motif text;

COMMENT ON COLUMN public.seances_elearning.demarree_at IS
  'Ouverture effective de la salle par le coach. Distinct de heure_debut, qui est l''horaire prevu.';
COMMENT ON COLUMN public.seances_elearning.terminee_at IS
  'Fermeture de la salle. Distinct de heure_fin, qui est l''horaire prevu.';
COMMENT ON COLUMN public.seances_elearning.duree_reelle_s IS
  'Temps passe en salle, en secondes, releve par le chronometre du coach. A comparer a duree_minutes (prevu).';
COMMENT ON COLUMN public.seances_elearning.date_initiale IS
  'Date prevue a l''origine, figee au premier report. NULL = seance jamais reprogrammee.';
COMMENT ON COLUMN public.seances_elearning.reprogrammee_le IS
  'Horodatage du dernier report.';
COMMENT ON COLUMN public.seances_elearning.reprogrammee_motif IS
  'Motif saisi par le coach lors du dernier report.';

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)                    AS total,
       COUNT(demarree_at)          AS demarrees,
       COUNT(duree_reelle_s)       AS avec_duree_reelle,
       COUNT(date_initiale)        AS reprogrammees
  FROM public.seances_elearning;
