-- ============================================================================
--  Équipe administrative — séparer les dirigeants des coachs
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  `equipe_photos` ne portait qu'une population : les coachs, 146 lignes toutes
--  titrées « Coach BET ». Le site public n'avait donc aucun moyen de présenter
--  l'équipe qui dirige — CEO, manager, RH, marketing, superviseur, conseillers.
--
--  Une colonne plutôt qu'une seconde table : c'est la même nature de donnée (une
--  photo, un nom, un titre, un ordre), et une table séparée aurait dupliqué le CRUD,
--  les routes, le formulaire d'upload et le composant public — quatre endroits à
--  maintenir en parallèle, donc quatre occasions de diverger.
-- ============================================================================

ALTER TABLE public.equipe_photos
  -- 'coach' par défaut : les 146 lignes existantes restent exactement ce qu'elles
  -- sont, sans migration de données ni risque de les faire disparaître du site.
  ADD COLUMN IF NOT EXISTS categorie text NOT NULL DEFAULT 'coach',
  -- La fonction occupée, distincte du `titre`. Pour un coach, « Coach BET » suffit ;
  -- pour un dirigeant, on veut « Directrice des ressources humaines » sans perdre
  -- la possibilité d'afficher un titre court à côté.
  ADD COLUMN IF NOT EXISTS fonction text;

COMMENT ON COLUMN public.equipe_photos.categorie IS
  'coach | administration. Determine la section du site public ou la personne apparait.';
COMMENT ON COLUMN public.equipe_photos.fonction IS
  'Poste occupe — « Directrice RH ». Renseigne surtout pour la categorie administration.';

ALTER TABLE public.equipe_photos
  DROP CONSTRAINT IF EXISTS equipe_photos_categorie_chk;
ALTER TABLE public.equipe_photos
  ADD CONSTRAINT equipe_photos_categorie_chk
    CHECK (categorie IN ('coach','administration'));

-- Les deux sections se lisent séparément et se trient par `ordre` : sans cet index,
-- chaque affichage public balaierait les 146 lignes pour en retenir une dizaine.
CREATE INDEX IF NOT EXISTS idx_equipe_photos_categorie
  ON public.equipe_photos(categorie, ordre, nom);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT categorie,
       COUNT(*)                            AS total,
       COUNT(*) FILTER (WHERE actif)       AS visibles,
       COUNT(fonction)                     AS avec_fonction
  FROM public.equipe_photos
 GROUP BY categorie
 ORDER BY categorie;
