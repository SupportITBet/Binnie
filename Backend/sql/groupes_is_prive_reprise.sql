-- ════════════════════════════════════════════════════════════════════════════════
--  MARQUER LES CLASSES PRIVÉES EXISTANTES
--  À jouer une seule fois, dans l'éditeur SQL de Supabase.
-- ════════════════════════════════════════════════════════════════════════════════
--
--  POURQUOI
--  Jusqu'au 26/09/2026, rien en base ne disait qu'une classe était un coaching privé :
--  le code le déduisait de `capacite_max = 1`, à seize endroits. Cette déduction
--  interdisait le cas le plus banal - un couple ou une famille qui s'inscrit ensemble -
--  puisque augmenter la capacité pour les loger faisait basculer la classe en « groupe »
--  sur tous les écrans à la fois : le badge « Coaching privé » disparaissait, et le
--  sélecteur de classe la traitait comme une classe ordinaire.
--
--  La colonne `is_prive` existait depuis le début sans jamais être renseignée. Elle l'est
--  désormais à la création et se répare d'elle-même à chaque modification de classe. Ce
--  script s'occupe des classes qui ne seront peut-être jamais modifiées.
--
--  APRÈS CE SCRIPT, une classe privée garde son identité quelle que soit sa capacité.
--
-- ════════════════════════════════════════════════════════════════════════════════

-- ── 1. La colonne, si elle n'existait pas ───────────────────────────────────────
alter table groupes add column if not exists is_prive boolean;

-- ── 2. CE QUI VA ÊTRE MARQUÉ — à lire AVANT d'exécuter l'étape 3 ────────────────
--     Vérifiez cette liste : ce sont bien vos coachings privés, et rien d'autre.
select id, nom, capacite_max, is_prive, statut, created_at
from groupes
where is_prive is null
  and (capacite_max = 1 or nom ilike 'coaching priv%')
order by created_at desc;

-- ── 3. La reprise ───────────────────────────────────────────────────────────────
--     Le critère est celui que le code employait déjà : ces classes étaient DÉJÀ
--     traitées comme privées partout. On ne change donc aucun comportement - on écrit
--     seulement noir sur blanc ce qui était deviné, pour que la capacité puisse enfin
--     varier sans effacer l'identité de la classe.
update groupes
   set is_prive = true
 where is_prive is null
   and (capacite_max = 1 or nom ilike 'coaching priv%');

-- ── 4. Contrôle ─────────────────────────────────────────────────────────────────
select
  count(*) filter (where is_prive is true)  as privees,
  count(*) filter (where is_prive is null)  as non_marquees,
  count(*) filter (where is_prive is true and capacite_max > 1) as foyers
from groupes;

-- `non_marquees` doit ne contenir que des classes de groupe.
-- Pour s'en assurer :
-- select nom, capacite_max from groupes where is_prive is null order by capacite_max;
