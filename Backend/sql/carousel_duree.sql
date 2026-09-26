-- ============================================================================
--  Carrousel d'accueil — durée d'affichage par photo
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Toutes les photos défilaient au bout de 5 secondes, valeur écrite en dur dans le
--  composant d'accueil. Or une image d'ambiance sans texte se regarde deux secondes,
--  là qu'une affiche promotionnelle chargée de conditions demande le double — et
--  personne ne pouvait l'ajuster sans toucher au code.
--
--  La durée ne concerne QUE les images : une vidéo dure ce qu'elle dure, et c'est sa
--  fin qui fait avancer le carrousel.
-- ============================================================================

ALTER TABLE public.carousel_slides
  -- En secondes, et non en millisecondes : c'est l'unité dans laquelle la personne qui
  -- configure le carrousel pense, et la conversion est l'affaire du code, pas la sienne.
  ADD COLUMN IF NOT EXISTS duree smallint NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.carousel_slides.duree IS
  'Duree d''affichage en SECONDES, images uniquement. Une video dure ce qu''elle dure.';

ALTER TABLE public.carousel_slides
  DROP CONSTRAINT IF EXISTS carousel_slides_duree_chk;
ALTER TABLE public.carousel_slides
  -- Bornes volontairement serrées : sous 2 secondes on ne lit rien, au-delà de 30 le
  -- carrousel paraît figé et le visiteur croit la page bloquée.
  ADD CONSTRAINT carousel_slides_duree_chk CHECK (duree BETWEEN 2 AND 30);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT type, COUNT(*) AS slides, MIN(duree) AS duree_min, MAX(duree) AS duree_max
  FROM public.carousel_slides
 GROUP BY type
 ORDER BY type;
