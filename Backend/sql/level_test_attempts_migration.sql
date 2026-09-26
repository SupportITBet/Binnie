-- ════════════════════════════════════════════════════════════════════════
-- level_test_attempts — suivi côté serveur d'un test de niveau EN COURS.
--
-- Objectif : empêcher qu'un rafraîchissement de page (ou une navigation
-- privée) permette de "recommencer" indéfiniment le test de niveau public
-- (/test-niveau). Le minuteur et la progression sont ancrés côté serveur
-- (seconds_remaining, answers, quiz_phase, current_index) et non plus
-- uniquement dans l'état React côté client, qui disparaît à chaque
-- rechargement.
--
-- Un seul enregistrement "in_progress" par email : POST /api/level-test/
-- attempt/start est idempotent (get-or-create), donc une tentative déjà
-- démarrée est toujours reprise à l'identique plutôt que recréée.
--
-- tab_switch_count : incrémenté côté client à chaque fois que l'onglet perd
-- le focus (Page Visibility API) pendant que le test est "live" — signal de
-- triche potentielle remonté au staff dans le résultat final, pas un blocage
-- automatique (techniquement impossible à bloquer depuis un site web).
-- ════════════════════════════════════════════════════════════════════════
create table if not exists level_test_attempts (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  test_id           uuid,
  question_ids      jsonb not null default '[]'::jsonb,  -- ordre figé des questions à la création
  answers           jsonb not null default '{}'::jsonb,
  current_index     int  not null default 0,
  quiz_phase        text not null default 'rules',        -- 'rules' | 'intro' | 'live'
  seconds_remaining int  not null,
  tab_switch_count  int  not null default 0,
  status            text not null default 'in_progress',  -- 'in_progress' | 'submitted' | 'expired'
  started_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists level_test_attempts_email_status_idx
  on level_test_attempts(email, status);

-- Copie du compteur sur le résultat final, pour que le staff le voie directement
-- sur la fiche de résultat sans avoir à consulter level_test_attempts à part.
alter table level_test_results add column if not exists tab_switch_count int not null default 0;
