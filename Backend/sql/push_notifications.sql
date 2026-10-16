-- ════════════════════════════════════════════════════════════════════════════════════════
--  NOTIFICATIONS PUSH — les deux objets de base qui manquaient
--
--  Constat du 15/10/2026 : `expo-notifications` est installé dans BinnieApp et la permission
--  est bien demandée au démarrage, mais AUCUN jeton n'est jamais récupéré, aucune table ne
--  peut le ranger, et le serveur n'envoie rien. L'application demandait donc la permission
--  d'afficher des notifications qu'elle n'émettait jamais : tout arrivait en base et dans
--  l'onglet Alertes, rien n'atteignait l'écran verrouillé.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL SUPABASE. Les deux instructions sont idempotentes.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Les appareils ────────────────────────────────────────────────────────────────────
--
-- UN APPAREIL, UNE LIGNE — et `token` est UNIQUE, pas `user_id` : une même personne peut
-- avoir un téléphone et une tablette, et doit être prévenue sur les deux. À l'inverse, un
-- appareil prêté puis reconnecté avec un autre compte doit CHANGER de propriétaire et non
-- en accumuler deux, sans quoi l'ancien titulaire recevrait les notifications du nouveau.
-- C'est tout l'objet de la contrainte sur `token` : l'enregistrement se fait en `upsert`
-- sur cette colonne, et `user_id` est simplement réécrit.
create table if not exists push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  token       text not null unique,
  plateforme  text,                       -- ios | android
  appareil    text,                       -- modèle, pour le support
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_push_tokens_user on push_tokens (user_id);

-- ── 2. La trace d'envoi, sur la notification elle-même ──────────────────────────────────
--
-- POURQUOI UNE COLONNE ET PAS UNE TABLE DE SUIVI. Le job qui expédie les push relit les
-- notifications récentes à chaque passage ; sans mémoire, il renverrait les mêmes à chaque
-- tour. Une colonne sur la ligne concernée suffit, se pose dans la même transaction logique
-- que la lecture, et ne demande aucune jointure.
--
-- `null` = jamais poussée. C'est ce que vaudront les lignes déjà en base : elles ne seront
-- pas expédiées rétroactivement, le job ne regardant qu'une fenêtre récente.
alter table notifications add column if not exists push_envoye_at timestamptz;

-- L'index sert exactement la requête du job : « non poussées, récentes d'abord ».
create index if not exists idx_notifications_push_en_attente
  on notifications (created_at desc)
  where push_envoye_at is null;

-- ── 3. Personne ne lit cette table, sauf le serveur ─────────────────────────────────────
--
-- RLS ACTIVÉ, AUCUNE POLICY. Ce n'est pas un oubli : sans policy, `anon` et `authenticated`
-- ne voient rien, et seule la clé de SERVICE — qui ne vit que sur le Backend — contourne la
-- règle. C'est exactement le périmètre voulu, puisque toutes les écritures passent par
-- /api/push et toutes les lectures par le job d'envoi.
--
-- POURQUOI ÇA COMPTE ICI PLUS QU'AILLEURS. Un jeton push est une autorisation d'écrire sur
-- l'écran de quelqu'un : qui le lit peut lui envoyer de fausses notifications au nom de BET.
-- Vérifié le 15/10/2026 : avec la clé anon — celle embarquée dans l'application et dans le
-- site — `seances_elearning` répond et rend ses lignes. Laisser `push_tokens` dans cet état
-- exposerait les jetons de tous les apprenants.
alter table push_tokens enable row level security;
