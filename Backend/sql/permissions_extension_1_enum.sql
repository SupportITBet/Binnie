-- ═══════════════════════════════════════════════════════════════════
-- BET — Extension du système de permissions à tous les rôles réels
-- Coller dans : Supabase Dashboard > SQL Editor > New query
--
-- Contexte : permissions_roles (créée par users_roles_setup.sql) ne
-- couvre que 8 rôles historiques (super_admin, admin, manager,
-- responsable, commercial, gestionnaire, coach, data_collector) alors
-- que utilisateurs.role contient aujourd'hui ~15 rôles réels en usage.
-- Ce script :
--   1. Étend l'ENUM bet_role aux rôles manquants
--   2. Ajoute 3 nouveaux modules (remplacements, classes, honoraires)
--      nécessaires pour les points de contrôle prioritaires du schéma
--      de sécurité (assignation remplacement, suspension coach,
--      validation honoraires)
--   3. Seed les permissions par défaut pour chaque rôle manquant —
--      calées sur l'accès dont ils disposent DÉJÀ en pratique
--      aujourd'hui (aucune régression, juste rendre explicite ce qui
--      était jusqu'ici un accès non contrôlé)
--   4. Crée permission_exceptions pour les dérogations par utilisateur
--
-- ⚠️ Si l'étape 1 échoue avec une erreur de transaction ("unsafe use
-- of new value"), exécuter d'abord uniquement le bloc 1, valider,
-- puis exécuter le reste dans une nouvelle requête.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. EXTENSION DE L'ENUM bet_role
-- ─────────────────────────────────────────────────────────────────
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'pedagogical_advisor';
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'onboarding';
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'customer_care';
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'comptable';
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'superviseur';
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'rh';
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'deputy_superviseur';
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'assistant_elearning';
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'admin_placement';
