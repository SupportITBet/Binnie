-- ============================================================================
--  Lecture séquentielle obligatoire des contenus e-learning
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Le coach publiait ses contenus et l'apprenant les voyait tous d'emblée, dans
--  l'ordre qu'il voulait. « Marquer comme terminé » n'était qu'une case
--  déclarative, sans effet sur ce à quoi il avait accès.
--
--  Un contenu marqué `lecture_sequentielle` doit être terminé avant que les
--  contenus publiés APRÈS lui ne deviennent accessibles. Lui-même reste
--  accessible : c'est bien le suivant qui est retenu, sans quoi le premier
--  contenu séquentiel d'une classe se bloquerait lui-même.
--
--  LA SÉQUENCE EST PAR CLASSE. Un contenu vise plusieurs classes, et deux
--  classes partagent des modules sans partager leur rythme : un apprenant de A
--  progresse dans les contenus publiés vers A, sans être retenu par un contenu
--  publié vers B qu'il ne voit même pas.
--
--  L'ORDRE EST CELUI DE LA PUBLICATION (`created_at`). La colonne `ordre`
--  existe mais vaut 1 partout — elle n'est pas réellement renseignée, et s'y
--  fier aurait produit une séquence arbitraire.
--
--  Aucune table de progression à créer : `contenus_lus` existe déjà et porte
--  exactement la donnée nécessaire (un apprenant, un contenu, une date).
-- ============================================================================

ALTER TABLE public.modules_elearning
  ADD COLUMN IF NOT EXISTS lecture_sequentielle boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.modules_elearning.lecture_sequentielle IS
  'Si true, ce contenu doit etre marque comme termine avant que les contenus publies APRES lui
   (dans la meme classe, par date de publication) ne deviennent accessibles. Le verrou est
   applique cote serveur : les blocs d''un contenu verrouille ne sont pas envoyes.';

-- Les deux lectures chaudes du calcul de verrou : la sequence d'une classe, et ce
-- qu'un apprenant a deja termine.
CREATE INDEX IF NOT EXISTS idx_modules_elearning_created
  ON public.modules_elearning(created_at);

-- `contenus_lus` n'avait pas d'index sur le couple reellement interroge.
CREATE INDEX IF NOT EXISTS idx_contenus_lus_apprenant_contenu
  ON public.contenus_lus(apprenant_id, contenu_id);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)                                          AS total_contenus,
       COUNT(*) FILTER (WHERE lecture_sequentielle)      AS en_lecture_sequentielle,
       COUNT(*) FILTER (WHERE statut = 'publie')         AS publies,
       (SELECT COUNT(*) FROM public.contenus_lus)        AS lectures_enregistrees
  FROM public.modules_elearning;
