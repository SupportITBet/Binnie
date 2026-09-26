-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `permission_exceptions`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

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

