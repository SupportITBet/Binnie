-- ════════════════════════════════════════════════════════════════════════════════
--  GARDER L'ANCIEN NIVEAU À CÔTÉ DU NOUVEAU
--  À jouer une seule fois, dans l'éditeur SQL de Supabase.
-- ════════════════════════════════════════════════════════════════════════════════
--
--  POURQUOI. `groupes_apprenants.niveau` était écrasé à chaque changement : l'ancien niveau
--  disparaissait sans trace. Or un niveau n'a de sens qu'en mouvement - « B1 » ne dit rien,
--  « A2 → B1 » dit une progression, et « B1 → A2 » dit qu'on s'est trompé de classe au
--  départ. C'est précisément ce que le coach, l'agent placement test et l'onboarding ont
--  besoin de voir côte à côte au moment d'un transfert.
--
--  DEUX COLONNES, PAS UN HISTORIQUE COMPLET. Le besoin exprimé est d'afficher « le nouveau
--  niveau et l'ancien juste à côté » : une table d'historique demanderait une jointure à
--  chaque affichage de liste pour une information qu'on lit toujours par paire. Le jour où
--  le parcours complet des niveaux sera nécessaire, il se reconstruira depuis
--  `level_test_results`, qui conserve déjà chaque test passé avec sa date.
--
--  PAS DE VALEUR PAR DÉFAUT. `null` signifie « aucun changement enregistré » - l'écran
--  n'affiche alors que le niveau courant, exactement comme aujourd'hui. Les inscriptions
--  existantes restent donc inchangées à l'affichage tant que personne n'a changé de niveau.
-- ════════════════════════════════════════════════════════════════════════════════

alter table groupes_apprenants
  add column if not exists niveau_precedent  text,
  add column if not exists niveau_change_le  timestamptz;

comment on column groupes_apprenants.niveau_precedent is
  'Niveau détenu avant le dernier changement. NULL = jamais changé ; l''écran n''affiche alors que le niveau courant.';
comment on column groupes_apprenants.niveau_change_le is
  'Date du dernier changement de niveau, pour dater le « A2 → B1 » affiché à côté du niveau.';

-- ── Contrôle ────────────────────────────────────────────────────────────────────
select count(*) as inscriptions,
       count(niveau_precedent) as avec_niveau_precedent
from groupes_apprenants;
