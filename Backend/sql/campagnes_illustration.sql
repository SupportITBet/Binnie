-- ============================================================================
--  Image d'illustration du formulaire de campagne
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  `image_url` porte la BANNIÈRE — l'en-tête, la première chose que voit la
--  personne qui scanne. Il en faut une seconde : le visuel placé ENTRE la
--  présentation de l'offre et les questions (les tarifs, le programme).
--
--  Deux colonnes et non un tableau d'images : ces deux emplacements ont des
--  rôles distincts et un cadrage différent. Un tableau aurait obligé chaque
--  écran à deviner laquelle est la bannière.
-- ============================================================================

ALTER TABLE public.campagne_formulaires
  ADD COLUMN IF NOT EXISTS illustration_url text;

COMMENT ON COLUMN public.campagne_formulaires.image_url IS
  'Banniere d''en-tete du formulaire — l''affiche de la campagne.';
COMMENT ON COLUMN public.campagne_formulaires.illustration_url IS
  'Visuel place entre la presentation de l''offre et les questions (tarifs, programme...).';

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)                          AS formulaires,
       COUNT(image_url)                  AS avec_banniere,
       COUNT(illustration_url)           AS avec_illustration
  FROM public.campagne_formulaires;
