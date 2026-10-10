-- ════════════════════════════════════════════════════════════════════════════
--  LA PHOTO D'UNE CLASSE E-LEARNING
-- ════════════════════════════════════════════════════════════════════════════
--
--  Le pendant de `conversations_groupes.photo_url` (groupes de discussion) et de
--  `groupes.photo_url` (classes présentiel, côté dash), pour les classes e-learning.
--
--  POURQUOI UNE COLONNE PROPRE, et non une réutilisation de celle de dash : les données
--  des deux plateformes ne sont pas liées. Une classe e-learning vit dans
--  `classes_elearning`, une classe présentiel dans `groupes` - deux tables distinctes, deux
--  populations distinctes. Le composant d'affichage, lui, est le même des deux côtés : il
--  reçoit l'URL en prop et ignore de quelle table elle vient.
--
--  CE QUE LA COLONNE HABILLE : la fiche de la classe ET le fil de discussion de cette
--  classe, pour qu'un apprenant ne voie pas deux visuels différents désigner le même
--  endroit - exactement la règle appliquée chez dash.
--
--  `text` et non `varchar(500)` : la longueur est déjà contrôlée côté serveur par
--  `photoValide()` (http(s) uniquement, 500 caractères maximum), qui refuse en prime les
--  URL `javascript:` - cette valeur finit dans un attribut `src`.
--
--  Idempotent : réexécuter ce fichier ne casse rien.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL DE SUPABASE.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.classes_elearning
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.classes_elearning.photo_url IS
  'Photo de la classe (URL Cloudinary). Habille aussi le fil de discussion de la classe. '
  'NULL = repli sur les initiales du nom.';


-- ── Vérification ────────────────────────────────────────────────────────────
-- Doit renvoyer une ligne : photo_url | text | YES
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'classes_elearning'
  AND column_name  = 'photo_url';
