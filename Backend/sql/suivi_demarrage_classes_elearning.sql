-- ════════════════════════════════════════════════════════════════════════════
--  LE SUIVI DE DÉMARRAGE DES APPRENANTS E-LEARNING
-- ════════════════════════════════════════════════════════════════════════════
--
--  LE PROBLÈME
--
--  L'onglet « Suivi démarrage » de l'Onboarding lit `/api/groupes/apprenants`, c'est-à-dire
--  `groupes_apprenants` : la table des classes de DASH, partagée entre les deux
--  plateformes. Il affiche donc les apprenants du présentiel dans un écran bet-elearning.
--
--  La table d'ici, `classes_elearning_apprenants`, n'a pas de colonne `suivi_checklist` :
--  c'est pour ça que l'écran était branché sur celle de dash. On la lui ajoute.
--
--  CE QUE LA COLONNE PORTE
--
--  Un objet JSON dont les clés sont les quatre étapes de démarrage, identiques à celles de
--  dash (`ETAPES_DEMARRAGE` côté front) - deux listes différentes donneraient deux
--  pourcentages pour le même dossier :
--
--      { "bienvenue": true, "acces": true, "kit": false, "planning": false }
--
--  Seules `kit` et `planning` y sont réellement stockées. `bienvenue` et `acces` sont
--  DÉDUITES de la présence d'un `apprenant_id` : le compte est créé à l'assignation, donc
--  son existence vaut preuve d'envoi. Les stocker en plus permettrait de les décocher alors
--  que le compte existe - une case qui ment.
--
--  `{}` PAR DÉFAUT ET NON `NULL` : le code lit `a.suivi_checklist || {}`, mais une valeur
--  par défaut évite que chaque première coche parte d'un `null` à remplacer.
--
--  Idempotent : réexécuter ce fichier ne casse rien.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL DE SUPABASE.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.classes_elearning_apprenants
  ADD COLUMN IF NOT EXISTS suivi_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.classes_elearning_apprenants.suivi_checklist IS
  'Étapes de démarrage cochées à la main : { "kit": bool, "planning": bool }. '
  '« bienvenue » et « acces » sont déduites de la présence d''un apprenant_id, jamais stockées.';

-- La date d'ajout sert au filtre par période de l'écran de suivi ; `created_at` existe
-- peut-être déjà sous un autre nom, d'où le IF NOT EXISTS plutôt qu'un ajout sec.
ALTER TABLE public.classes_elearning_apprenants
  ADD COLUMN IF NOT EXISTS date_ajout date DEFAULT CURRENT_DATE;


-- ── Vérification ────────────────────────────────────────────────────────────
-- Attendu : deux lignes, suivi_checklist (jsonb) et date_ajout (date)
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'classes_elearning_apprenants'
   AND column_name IN ('suivi_checklist', 'date_ajout')
 ORDER BY column_name;
