-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `permissions_roles`
-- Généré à partir de 6 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── permissions_extension_1_enum.sql  (2026-07-20) ──────────────────────────────
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

-- ── permissions_extension_2_seed.sql  (2026-07-20) ──────────────────────────────
-- ═══════════════════════════════════════════════════════════════════
-- BET — Extension du système de permissions (partie 2/2)
-- À exécuter APRÈS permissions_extension_1_enum.sql (dans une requête
-- séparée — un ENUM ajouté ne peut pas être utilisé dans la même
-- transaction que son ALTER TYPE).
-- Coller dans : Supabase Dashboard > SQL Editor > New query
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. NOUVEAUX MODULES (nécessaires aux points de contrôle prioritaires
--    identifiés dans l'audit : remplacements, suspension de coach,
--    validation des honoraires — jusqu'ici sans aucune vérification
--    de rôle au-delà de "être un admin connecté")
-- ─────────────────────────────────────────────────────────────────

-- Rôles historiques (déjà dans permissions_roles) — ajout des 3 nouveaux modules.
-- Mapping calé sur les contrôles ad hoc déjà en place dans le code
-- (ROLES_PA / ROLES_ADMIN_BET_PA de remplacements.js et classesElearning.js)
-- pour ne changer aucun comportement actuel, juste le rendre explicite.
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('super_admin','remplacements', true,true,true,true,true),
('super_admin','classes',       true,true,true,true,true),
('super_admin','honoraires',    true,true,true,true,true),
('admin',      'remplacements', true,true,true,false,true),
('admin',      'classes',       true,true,true,false,true),
('admin',      'honoraires',    true,true,true,false,true),
('manager',    'remplacements', true,true,true,false,true),
('manager',    'classes',       true,true,true,false,true),
('manager',    'honoraires',    true,true,true,false,true),
('responsable','remplacements', true,false,false,false,false),
('responsable','classes',       true,false,false,false,false),
('responsable','honoraires',    true,false,false,false,false),
('commercial', 'remplacements', false,false,false,false,false),
('commercial', 'classes',       false,false,false,false,false),
('commercial', 'honoraires',    false,false,false,false,false),
('gestionnaire','remplacements',true,false,false,false,false),
('gestionnaire','classes',      true,false,false,false,false),
('gestionnaire','honoraires',   true,false,false,false,false),
('coach',      'remplacements', true,true,false,false,false),
('coach',      'classes',       true,false,false,false,false),
('coach',      'honoraires',    true,false,false,false,false),
('data_collector','remplacements', true,false,false,false,false),
('data_collector','classes',       true,false,false,false,false),
('data_collector','honoraires',    true,false,false,false,false)
ON CONFLICT (role, module) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 2. RÔLES RÉELS MANQUANTS — accès de base (lecture) sur tous les
--    modules existants, pour ne rien retirer de ce qu'ils voient
--    aujourd'hui (aucune vérification n'existait avant ce script).
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r bet_role;
  m text;
  roles_manquants bet_role[] := ARRAY[
    'pedagogical_advisor','onboarding','customer_care','comptable',
    'superviseur','rh','deputy_superviseur','assistant_elearning','admin_placement'
  ]::bet_role[];
  modules_existants text[] := ARRAY[
    'dashboard','utilisateurs','roles','cours','examens','finances','crm',
    'inscriptions','planning','rapports','rh','support','mediatheque',
    'audit','configuration','remplacements','classes','honoraires'
  ];
BEGIN
  FOREACH r IN ARRAY roles_manquants LOOP
    FOREACH m IN ARRAY modules_existants LOOP
      INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer)
      VALUES (r, m, true, false, false, false, false)
      ON CONFLICT (role, module) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. DROITS SPÉCIFIQUES PAR RÔLE — au-delà de la lecture de base,
--    mappés sur leur fonction réelle (voir docs/gestion-droits-
--    permissions-schema.html section 5).
-- ─────────────────────────────────────────────────────────────────
UPDATE permissions_roles SET peut_creer=true, peut_modifier=true, peut_gerer=true
  WHERE role='pedagogical_advisor' AND module='remplacements';
UPDATE permissions_roles SET peut_modifier=true
  WHERE role='pedagogical_advisor' AND module='classes';

UPDATE permissions_roles SET peut_creer=true, peut_modifier=true, peut_gerer=true
  WHERE role='onboarding' AND module='remplacements';
UPDATE permissions_roles SET peut_creer=true, peut_modifier=true
  WHERE role='onboarding' AND module='classes';
UPDATE permissions_roles SET peut_gerer=true
  WHERE role='onboarding' AND module='inscriptions';

UPDATE permissions_roles SET peut_gerer=true
  WHERE role='customer_care' AND module='support';

UPDATE permissions_roles SET peut_gerer=true
  WHERE role='comptable' AND module IN ('finances','honoraires');

UPDATE permissions_roles SET peut_gerer=true
  WHERE role='superviseur' AND module IN ('classes','rh','rapports');
UPDATE permissions_roles SET peut_modifier=true
  WHERE role='superviseur' AND module='remplacements';

UPDATE permissions_roles SET peut_gerer=true
  WHERE role='rh' AND module='rh';

UPDATE permissions_roles SET peut_gerer=true
  WHERE role='assistant_elearning' AND module IN ('cours','classes','inscriptions');

UPDATE permissions_roles SET peut_gerer=true
  WHERE role='admin_placement' AND module='inscriptions';

-- ─────────────────────────────────────────────────────────────────
-- 4. EXCEPTIONS PAR UTILISATEUR — dérogation ponctuelle à la matrice
--    de son rôle, sans toucher au reste des utilisateurs de ce rôle.
--    Résolution : permissions_roles (rôle) PUIS permission_exceptions
--    (si une ligne existe pour ce module, elle remplace intégralement
--    les 5 flags du rôle pour ce module).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permission_exceptions (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  utilisateur_id  uuid        NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  module          text        NOT NULL,
  peut_lire       boolean     NOT NULL DEFAULT false,
  peut_creer      boolean     NOT NULL DEFAULT false,
  peut_modifier   boolean     NOT NULL DEFAULT false,
  peut_supprimer  boolean     NOT NULL DEFAULT false,
  peut_gerer      boolean     NOT NULL DEFAULT false,
  accorde_par_id  uuid        REFERENCES utilisateurs(id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (utilisateur_id, module)
);

ALTER TABLE permission_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture admin" ON permission_exceptions;
CREATE POLICY "Lecture admin" ON permission_exceptions FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Écriture service uniquement" ON permission_exceptions;
CREATE POLICY "Écriture service uniquement" ON permission_exceptions FOR ALL
  USING (auth.role() = 'service_role');

-- ── permissions_extension_3_contenus_examens.sql  (2026-07-20) ──────────────────────────────
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

-- ── permissions_extension_4_superviseur.sql  (2026-07-20) ──────────────────────────────
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

-- ── permissions_extension_5_onboarding_contenus.sql  (2026-07-29) ──────────────────────────────
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

-- ── permissions_extension_6_coach.sql  (2026-07-29) ──────────────────────────────
-- ═══════════════════════════════════════════════════════════════════
-- BET — Extension du système de permissions (partie 6)
-- À exécuter dans Supabase Dashboard > SQL Editor > New query.
--
-- Contexte : câblage de vraies vérifications de permission sur les routes
-- réellement utilisées par le dashboard Coach (jusqu'ici aucune n'était
-- protégée par requirePermission, seulement authenticateAdmin). Coach étant
-- un rôle utilisé quotidiennement en production, ce script DOIT être exécuté
-- AVANT (ou immédiatement avec) le déploiement du code, sinon :
--   - "planning" (create+modifier=false) → plus aucune Session live ne
--     pourrait être programmée/modifiée (régression immédiate et visible)
--   - "classes" (modifier=false) → la saisie des présences serait bloquée
--   - "cours" (supprimer=false) → suppression d'un devoir bloquée
--   - "mediatheque" (supprimer=false) → suppression d'un contenu de
--     médiathèque bloquée
-- "remplacements" (create=true) et "examens" (create=true) sont déjà bons,
-- rien à changer pour eux.
-- NB : "Fichiers partagés" (fichiersPrives.js) n'est PAS concerné par ce
-- script — cette route est partagée avec dash (EspaceProfesseur.jsx),
-- volontairement laissée non gatée pour ne pas mélanger les deux plateformes.
-- ═══════════════════════════════════════════════════════════════════

UPDATE permissions_roles SET peut_modifier = true
WHERE role = 'coach' AND module = 'classes';

UPDATE permissions_roles SET peut_supprimer = true
WHERE role = 'coach' AND module = 'cours';

UPDATE permissions_roles SET peut_supprimer = true
WHERE role = 'coach' AND module = 'mediatheque';

UPDATE permissions_roles SET peut_creer = true, peut_modifier = true
WHERE role = 'coach' AND module = 'planning';

