-- ════════════════════════════════════════════════════════════════════════════════════════
--  OUVRIR LES APPRÉCIATIONS AUX SÉANCES BET E-LEARNING
--
--  CE QUI SE PASSAIT. `appreciations_apprenants` a été créée pour le présentiel, et deux de
--  ses colonnes portent une clé étrangère vers les tables de CE monde-là :
--
--      seance_id  →  seances    (la séance e-learning vit dans `seances_elearning`)
--      groupe_id  →  groupes    (la classe e-learning vit dans `classes_elearning`)
--
--  Une note venue de bet-elearning était donc rejetée par la base, quoi que fasse le code :
--
--      23503 — insert or update on table "appreciations_apprenants" violates foreign key
--              constraint "appreciations_apprenants_seance_id_fkey"
--              Key (seance_id)=(cf57c379-…) is not present in table "seances".
--
--  Constaté le 16/10/2026 en rejouant l'insertion exacte de la route. L'apprenant, lui,
--  lisait « les appréciations ne sont pas encore activées » : le filtre qui reconnaissait
--  une table absente se déclenchait sur TOUT message citant le nom de la table, et masquait
--  donc la vraie cause. Ce filtre est corrigé par ailleurs (routes/appreciations.js).
--
--  CE QUE FAIT CE SCRIPT. Il retire ces deux contraintes. `seance_id` et `groupe_id`
--  deviennent des références POLYMORPHES : leur table de destination dépend de la
--  plateforme de la ligne, exactement comme `contenu_ids` ou `classe_id` ailleurs dans ce
--  projet. Postgres ne sait pas exprimer cela par une clé étrangère.
--
--  CE QU'ON PERD, ET IL FAUT LE SAVOIR : la base ne garantit plus qu'une appréciation
--  désigne une séance existante. C'est la contrepartie assumée — le serveur, lui, vérifie
--  déjà que la séance existe, que l'apprenant y est inscrit ET qu'il y était présent avant
--  d'écrire la moindre ligne (voir routes/appreciations.js). Trois contrôles applicatifs
--  valent ici mieux qu'une contrainte qui exclut la moitié des apprenants.
--
--  Les deux autres clés étrangères sont CONSERVÉES : `coach_id` et `apprenant_id` pointent
--  vers `utilisateurs`, table commune aux deux plateformes. Rien ne justifie de les retirer.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL SUPABASE. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table appreciations_apprenants
  drop constraint if exists appreciations_apprenants_seance_id_fkey;

alter table appreciations_apprenants
  drop constraint if exists appreciations_apprenants_groupe_id_fkey;

-- ── Vérification ────────────────────────────────────────────────────────────────────────
-- Doit renvoyer UNIQUEMENT les clés étrangères de `coach_id` et `apprenant_id`.
select
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name as reference_vers
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.table_name = 'appreciations_apprenants'
  and tc.constraint_type = 'FOREIGN KEY'
order by kcu.column_name;
