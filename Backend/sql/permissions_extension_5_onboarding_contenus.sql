-- ═══════════════════════════════════════════════════════════════════
-- BET — Extension du système de permissions (partie 5)
-- À exécuter dans Supabase Dashboard > SQL Editor > New query.
--
-- Contexte : le module "cours" d'Onboarding est à false sur toute la ligne
-- (lire/créer/modifier/supprimer/gérer). Les 3 sous-modules Contenus
-- (Ressources / Bibliothèque communautaire / Mini-jeux) n'ont jamais eu leur
-- propre ligne en base, donc ils retombent sur "cours" via le mécanisme de
-- repli (MODULE_FALLBACK_PARENT dans requireAdmin.js) — résultat : Onboarding
-- ne peut aujourd'hui ni créer, ni modifier, ni supprimer de ressource, de
-- contenu de bibliothèque communautaire, ni de mini-jeu, alors que c'est leur
-- onglet Contenus utilisé activement. Ce script donne des lignes dédiées
-- directement sur les 3 sous-modules, sans toucher à "cours" (qui ne sert
-- plus à rien pour ce rôle).
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer)
VALUES
  ('onboarding', 'contenus_ressources', true, true, true, true, true),
  ('onboarding', 'contenus_biblio',     true, true, true, true, true),
  ('onboarding', 'contenus_minijeux',   true, true, true, true, true)
ON CONFLICT (role, module) DO UPDATE SET
  peut_lire = true, peut_creer = true, peut_modifier = true, peut_supprimer = true, peut_gerer = true;
