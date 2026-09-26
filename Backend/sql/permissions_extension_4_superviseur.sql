-- ═══════════════════════════════════════════════════════════════════
-- BET — Extension du système de permissions (partie 4)
-- À exécuter dans Supabase Dashboard > SQL Editor > New query.
--
-- Contexte : superviseurRoutes.js (partagé dash + bet-elearning) vient
-- d'être scindé en superviseurRoutesDash.js (inchangé) et
-- superviseurRoutesBet.js (bet-elearning uniquement, désormais protégé par
-- requirePermission en plus du contrôle de rôle existant).
--
-- deputy_superviseur n'avait jusqu'ici QUE peut_lire=true sur 'rapports' et
-- 'remplacements' (accès de base accordé par permissions_extension_2, jamais
-- complété). Sans ce script, un Deputy Superviseur connecté depuis
-- bet-elearning ne pourrait plus :
--   - soumettre un rapport d'observation (POST /rapports-deputy)
--   - signaler une anomalie (POST /anomalies)
--   - mettre à jour le statut d'une de ses missions (PATCH /missions/:id)
-- alors que c'est le cœur de son rôle.
-- ═══════════════════════════════════════════════════════════════════

UPDATE permissions_roles
SET peut_gerer = true
WHERE role = 'deputy_superviseur' AND module = 'rapports';

INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer)
VALUES ('deputy_superviseur', 'rapports', true, false, false, false, true)
ON CONFLICT (role, module) DO UPDATE SET peut_gerer = true;

UPDATE permissions_roles
SET peut_modifier = true
WHERE role = 'deputy_superviseur' AND module = 'remplacements';

INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer)
VALUES ('deputy_superviseur', 'remplacements', true, false, true, false, false)
ON CONFLICT (role, module) DO UPDATE SET peut_modifier = true;
