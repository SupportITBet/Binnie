-- ═══════════════════════════════════════════════════════════════════
-- BET — Extension du système de permissions (partie 3)
-- À exécuter dans Supabase Dashboard > SQL Editor > New query.
--
-- Contexte : audit des sous-onglets par profil (suite au ticket "onboarding
-- Contenus"). Deux points de contrôle qui n'existaient pas encore côté
-- serveur viennent d'être câblés :
--   1. Support (tickets) — POST/PATCH/DELETE /api/tickets — customer_care
--      n'a que peut_gerer=true sur 'support' (permissions_extension_2), ce
--      qui suffit déjà (le code vérifie l'action "manage"), rien à changer.
--   2. Tests de niveau (Placement) — POST/PATCH/DELETE
--      /api/bet-elearning/tests-niveau — gérés désormais via le module
--      'examens'. admin_placement n'a QUE peut_lire=true sur 'examens'
--      (accordé en lecture de base par permissions_extension_2, jamais
--      complété) : sans ce script, la création/modification/suppression
--      de tests de niveau serait bloquée pour ce rôle dès le déploiement.
-- ═══════════════════════════════════════════════════════════════════

UPDATE permissions_roles
SET peut_creer = true, peut_modifier = true, peut_supprimer = true, peut_gerer = true
WHERE role = 'admin_placement' AND module = 'examens';

-- Au cas où la ligne n'existerait pas encore pour ce rôle/module (l'UPDATE
-- ci-dessus ne fait rien si la ligne est absente).
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer)
VALUES ('admin_placement', 'examens', true, true, true, true, true)
ON CONFLICT (role, module) DO UPDATE SET
  peut_creer = true, peut_modifier = true, peut_supprimer = true, peut_gerer = true;
