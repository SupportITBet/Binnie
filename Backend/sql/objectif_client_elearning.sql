-- ════════════════════════════════════════════════════════════════════════════
--  L'OBJECTIF DU CLIENT, SUR LA FICHE DE CHAQUE APPRENANT E-LEARNING
-- ════════════════════════════════════════════════════════════════════════════
--
--  POURQUOI CE CHAMP COMPTE PLUS QUE LES AUTRES
--
--  C'est le texte que le CONSEILLER PÉDAGOGIQUE lit pour choisir le coach d'une classe, et
--  que le coach lira ensuite pour savoir ce qu'on attend de lui. Un niveau CECR dit où en
--  est l'apprenant ; l'objectif dit où il veut aller - « préparer un entretien chez Orange »
--  et « IELTS 7.0 avant mars » appellent deux coachs différents à niveau égal.
--
--  Sans lui, l'affectation d'un coach se fait à l'aveugle.
--
--  Dash porte déjà ce champ sous le nom `assignations_parcours.objectif_client`, avec son
--  bloc d'édition dans la fiche client. Le même nom est repris ici À DESSEIN : une même
--  notion ne doit pas changer de nom d'une plateforme à l'autre.
--
--  DEUX TABLES, ET C'EST VOULU
--
--   · `inscriptions_elearning` - l'objectif est saisi au dossier, dès l'inscription ;
--   · `classes_elearning_apprenants` - il y est RECOPIÉ à l'assignation.
--
--  La copie n'est pas une redondance paresseuse : le PA Advisor choisit un coach pour une
--  CLASSE, pas pour un dossier. Il lui faut les objectifs des apprenants DE CETTE CLASSE,
--  sans avoir à remonter à leur inscription d'origine - qui peut avoir été archivée, ou
--  dont l'apprenant a changé de classe depuis. La ligne de classe porte ce qui était vrai
--  au moment où l'apprenant y est entré.
--
--  Idempotent : réexécuter ce fichier ne casse rien.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL DE SUPABASE.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inscriptions_elearning
  ADD COLUMN IF NOT EXISTS objectif_client text;

COMMENT ON COLUMN public.inscriptions_elearning.objectif_client IS
  'Ce que l''apprenant veut atteindre, en toutes lettres. Lu par le conseiller pédagogique '
  'pour choisir le coach, puis par le coach lui-même. Pendant de assignations_parcours.objectif_client côté dash.';

ALTER TABLE public.classes_elearning_apprenants
  ADD COLUMN IF NOT EXISTS objectif_client text;

COMMENT ON COLUMN public.classes_elearning_apprenants.objectif_client IS
  'Recopié depuis l''inscription au moment de l''assignation. Permet au PA Advisor de lire '
  'les objectifs des apprenants d''une classe sans remonter à leurs dossiers.';


-- ── Vérification ────────────────────────────────────────────────────────────
-- Attendu : deux lignes, une par table.
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND column_name  = 'objectif_client'
   AND table_name IN ('inscriptions_elearning', 'classes_elearning_apprenants')
 ORDER BY table_name;
