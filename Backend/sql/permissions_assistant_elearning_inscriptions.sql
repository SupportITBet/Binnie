-- ════════════════════════════════════════════════════════════════════════════
--  L'ASSISTANTE E-LEARNING PREND LA MAIN SUR LES INSCRIPTIONS
-- ════════════════════════════════════════════════════════════════════════════
--
--  LE CHANGEMENT D'ORGANISATION
--
--  Jusqu'ici l'Onboarding portait quatre étapes sur six : saisir, vérifier, transmettre au
--  test, puis assigner la classe. Le parcours est redécoupé :
--
--      Assistante e-learning  →  saisit, vérifie, transmet
--      Onboarding             →  assigne la classe, réaffecte
--      PA Advisor             →  assigne le coach
--
--  LE PROBLÈME QUE CE FICHIER RÉSOUT
--
--  `assistant_elearning` est en LECTURE SEULE sur le module `inscriptions` :
--
--      peut_lire = true, peut_creer = FALSE, peut_modifier = FALSE
--
--  Les écrans « Inscrire » et « Parcours » viennent d'être ajoutés à son dashboard, mais
--  sans ce script ils s'afficheraient en se comportant comme s'ils fonctionnaient : la
--  saisie d'un dossier, la validation et la transmission répondraient toutes 403, puisque
--  `requireInscriptionPermission()` (Backend/src/routes/inscriptionsElearning.js) contrôle
--  ces trois actions. On lui accorde donc la création et la modification.
--
--  CE QU'ON NE TOUCHE PAS, ET POURQUOI
--
--   · `peut_supprimer` reste à FALSE. Supprimer un dossier d'inscription efface une
--     personne du parcours ; c'est une opération d'administration, pas de saisie.
--   · L'ONBOARDING GARDE SES DROITS À L'IDENTIQUE (peut_creer = false, peut_modifier =
--     true). Il ne saisit plus, mais `modifier` est ce qui porte l'ASSIGNATION À LA CLASSE
--     (`PATCH /:id/assigner`) - c'est précisément ce qui lui reste. Lui retirer ce droit
--     casserait l'étape dont il a désormais la charge exclusive.
--
--  Idempotent : réexécuter ce fichier ne casse rien.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL DE SUPABASE.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Avant / après, pour vérifier de visu ────────────────────────────────────
SELECT role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer
  FROM public.permissions_roles
 WHERE module = 'inscriptions'
   AND role IN ('assistant_elearning', 'onboarding')
 ORDER BY role;

-- ── Le droit accordé ────────────────────────────────────────────────────────
UPDATE public.permissions_roles
   SET peut_creer    = true,
       peut_modifier = true
 WHERE module = 'inscriptions'
   AND role   = 'assistant_elearning';

-- La ligne pourrait ne pas exister sur une base plus ancienne : on la crée alors.
INSERT INTO public.permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer)
SELECT 'assistant_elearning', 'inscriptions', true, true, true, false
 WHERE NOT EXISTS (
   SELECT 1 FROM public.permissions_roles
    WHERE role = 'assistant_elearning' AND module = 'inscriptions'
 );


-- ── Vérification ────────────────────────────────────────────────────────────
-- Attendu :
--   assistant_elearning | inscriptions | t | t | t | f
--   onboarding          | inscriptions | t | f | t | f      ← inchangé
SELECT role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer
  FROM public.permissions_roles
 WHERE module = 'inscriptions'
   AND role IN ('assistant_elearning', 'onboarding')
 ORDER BY role;
