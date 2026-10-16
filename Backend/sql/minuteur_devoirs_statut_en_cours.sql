-- ════════════════════════════════════════════════════════════════════════════════════════
--  AUTORISER LE STATUT « en_cours » SUR LES COPIES DE DEVOIRS
--
--  CE QUI SE PASSE. `POST /api/elearning/devoirs/:id/commencer` — la route qui démarre le
--  chrono d'une composition — écrit une ligne `devoirs_rendus_elearning` au statut
--  `en_cours`. La contrainte CHECK de la table ne l'accepte pas :
--
--      new row for relation "devoirs_rendus_elearning" violates check constraint
--      "devoirs_rendus_elearning_statut_check"
--
--  Constaté le 16/10/2026 en créant un devoir chronométré de test (duree_min = 2) : la
--  route rend un 500, donc AUCUN chrono ne peut démarrer — ni sur le web, ni sur mobile.
--  Le minuteur n'a donc jamais pu fonctionner, ce qui est passé inaperçu parce qu'aucun
--  devoir publié ne porte de `duree_min` à ce jour.
--
--  Sondage des valeurs effectivement acceptées, le même jour :
--      en_cours   ❌        rendu     ✔
--      brouillon  ❌        corrige   ✔
--      soumis     ❌        non_rendu ❌
--
--  CE QUE FAIT CE SCRIPT. Il remplace la contrainte par une liste qui inclut `en_cours`.
--  Les deux valeurs en usage (`rendu`, `corrige`) sont conservées telles quelles, donc
--  aucune ligne existante n'est touchée — la seule ligne présente en base est `corrige`.
--
--  POURQUOI `en_cours` ET PAS UN SIMPLE `commence_at` NON NUL. Le balayage des copies
--  expirées (`cloturerCompositionsExpirees`) ne ramasse QUE les lignes `en_cours` : c'est
--  ce statut qui distingue une composition ouverte d'une copie déjà rendue. Sans lui, le
--  filet qui sauve la copie d'un apprenant déconnecté ne trouverait rien à sauver.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL SUPABASE. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table devoirs_rendus_elearning
  drop constraint if exists devoirs_rendus_elearning_statut_check;

alter table devoirs_rendus_elearning
  add constraint devoirs_rendus_elearning_statut_check
  check (statut in ('en_cours', 'rendu', 'corrige'));

-- ── Vérification ────────────────────────────────────────────────────────────────────────
-- Doit afficher la contrainte avec les trois valeurs.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'devoirs_rendus_elearning'::regclass
  and contype = 'c'
  and conname = 'devoirs_rendus_elearning_statut_check';
