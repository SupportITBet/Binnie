-- ════════════════════════════════════════════════════════════════════════════
-- Groupes de discussion ouverts aux apprenants
--
-- POURQUOI. La commerciale et l'onboarding réunissent des apprenants de plusieurs
-- classes - un événement, une session d'information, une relance. Jusqu'ici les groupes
-- libres étaient réservés au personnel : `apprenant` figurait dans la liste d'exclusion
-- de `conversations.js`, et aucun groupe ne pouvait en accueillir.
--
-- Plutôt que de retirer cette exclusion - ce qui aurait permis de glisser un apprenant
-- dans N'IMPORTE quel fil, y compris celui du conseil pédagogique ou d'une équipe qui
-- discute de son dossier - chaque groupe déclare à sa création s'il les accueille.
-- La valeur est fixée une fois pour toutes : l'ouvrir après coup exposerait les échanges
-- déjà tenus entre personnels.
--
-- Sans cette colonne, le code retombe exactement sur l'ancien comportement (aucun groupe
-- n'accueille d'apprenant) : la migration peut donc être jouée après le déploiement.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE conversations_groupes
  ADD COLUMN IF NOT EXISTS avec_apprenants boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN conversations_groupes.avec_apprenants IS
  'Le groupe accueille-t-il des apprenants ? Fixé à la création, jamais modifié ensuite.';

-- Les groupes existants sont tous des groupes de personnel : le défaut `false` est le bon.
