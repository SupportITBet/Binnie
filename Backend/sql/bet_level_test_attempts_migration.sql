-- ════════════════════════════════════════════════════════════════════════
-- bet_level_test_attempts — équivalent de level_test_attempts (dash/Frontend)
-- pour le test de niveau BET E-Learning (bet-elearning/src/pages/shared/
-- LevelTest.jsx). Même objectif : empêcher qu'un rafraîchissement de page
-- permette de recommencer indéfiniment le test.
--
-- Différence clé avec level_test_attempts : ici il n'y a pas de compte
-- obligatoire (l'email est optionnel côté LevelTest.jsx), donc la clé
-- d'identité est apprenant_id (présent uniquement quand le test est envoyé
-- via un lien ?a=<apprenant_id> à un apprenant déjà connu). Sans apprenant_id
-- (lien public totalement anonyme), aucune tentative n'est créée — la
-- protection anti-rafraîchissement ne s'applique donc qu'aux tests envoyés à
-- un apprenant identifié, pas aux liens publics anonymes (limite assumée).
--
-- Autre différence : le minuteur de LevelTest.jsx est PAR QUESTION (pas un
-- chrono global comme Frontend) — seconds_remaining n'est donc pas utilisé
-- ici, la reprise se fait simplement à current_index avec un minuteur plein
-- pour la question en cours.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists bet_level_test_attempts (
  id                uuid primary key default gen_random_uuid(),
  apprenant_id      uuid not null,
  test_id           uuid,
  question_ids      jsonb not null default '[]'::jsonb,  -- ordre figé des questions à la création
  answers           jsonb not null default '{}'::jsonb,
  audio_answers     jsonb not null default '{}'::jsonb,
  current_index     int  not null default 0,
  quiz_phase        text not null default 'rules',        -- 'rules' | 'intro' | 'live'
  tab_switch_count  int  not null default 0,
  status            text not null default 'in_progress',  -- 'in_progress' | 'submitted' | 'expired'
  started_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists bet_level_test_attempts_apprenant_status_idx
  on bet_level_test_attempts(apprenant_id, test_id, status);

alter table bet_level_test_results add column if not exists tab_switch_count int not null default 0;
