-- ============================================================================
--  Les tests de niveau ne se modifient pas depuis l'espace commercial
-- ============================================================================
--
--  CONSTAT. L'assistante e-learning peut modifier le contenu des tests de niveau
--  depuis son onglet « Tests reçus » : changer une question, supprimer un test,
--  en créer un. Ce n'est pas un défaut d'affichage — le serveur l'autorise
--  réellement.
--
--  POURQUOI. Son compte ne porte pas le rôle `assistant_elearning` (zéro compte
--  en base l'utilise) mais `commercial` : `ROLE_MAP_BET` résout les deux vers la
--  même façade côté écran. Or dans `permissions_roles` :
--
--      assistant_elearning   lire=true  creer=false modif=false suppr=false   ← correct
--      commercial            lire=true  creer=true  modif=true  suppr=true    ← le trou
--
--  Les deux lignes décrivent le même métier et disent l'inverse. C'est celle qui
--  s'applique vraiment — `commercial`, 23 comptes actifs — qui est trop large.
--
--  CE QUE ÇA CHANGE. La banque de tests de niveau est le métier de l'agent
--  Placement (`placement_test`), qui garde tous ses droits. La commerciale et
--  l'assistante gardent la LECTURE : elles consultent les résultats de leurs
--  candidats, ce qui est tout l'objet de l'onglet « Tests reçus ». Elles perdent
--  seulement la possibilité de toucher aux questions, qu'elles n'étaient pas
--  censées avoir.
--
--  La correction du niveau d'un candidat passe par `examens:update` elle aussi
--  (`PATCH /api/bet-elearning/level-test/:id/corriger`) : c'est voulu, corriger
--  une copie relève du Placement, pas du commerce.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

-- Avant : on garde une trace de ce qui est retiré.
SELECT role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer
  FROM permissions_roles
 WHERE module = 'examens' AND role IN ('commercial', 'corporate', 'assistant_elearning');

UPDATE permissions_roles
   SET peut_creer     = false,
       peut_modifier  = false,
       peut_supprimer = false
 WHERE module = 'examens'
   AND role IN ('commercial', 'corporate');

-- Vérification : seuls le Placement et la direction doivent pouvoir écrire.
SELECT role, peut_lire, peut_creer, peut_modifier, peut_supprimer
  FROM permissions_roles
 WHERE module = 'examens'
   AND (peut_creer OR peut_modifier OR peut_supprimer)
 ORDER BY role;
