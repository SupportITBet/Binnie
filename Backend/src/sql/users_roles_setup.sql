-- ═══════════════════════════════════════════════════════════════════
-- BET - SYSTÈME DE GESTION DES UTILISATEURS ET RÔLES
-- Coller dans : Supabase Dashboard > SQL Editor > New query
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 0. NETTOYAGE (repart de zéro si tables/type déjà existants)
-- ─────────────────────────────────────────────────────────────────
DROP VIEW  IF EXISTS vue_utilisateurs_permissions CASCADE;
DROP TABLE IF EXISTS permissions_roles CASCADE;
DROP TABLE IF EXISTS utilisateurs      CASCADE;
DROP TYPE  IF EXISTS bet_role          CASCADE;


-- ─────────────────────────────────────────────────────────────────
-- 1. ENUM DES RÔLES BET
-- ─────────────────────────────────────────────────────────────────
CREATE TYPE bet_role AS ENUM (
  'super_admin',
  'admin',
  'manager',
  'responsable',
  'commercial',
  'gestionnaire',
  'coach',
  'data_collector'
);


-- ─────────────────────────────────────────────────────────────────
-- 2. TABLE DES UTILISATEURS BET
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE utilisateurs (
  id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              text        NOT NULL UNIQUE,
  nom                text        NOT NULL,
  prenom             text        NOT NULL,
  telephone          text,
  role               bet_role    NOT NULL,
  scope              text[]      NOT NULL DEFAULT '{"national"}',
  departement        text,
  actif              boolean     NOT NULL DEFAULT true,
  twofa_active       boolean     NOT NULL DEFAULT false,
  mdp_temporaire     boolean     NOT NULL DEFAULT true,
  cree_par_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  date_creation      timestamptz NOT NULL DEFAULT now(),
  derniere_connexion timestamptz,
  note               text
);

CREATE INDEX idx_utilisateurs_role   ON utilisateurs(role);
CREATE INDEX idx_utilisateurs_actif  ON utilisateurs(actif);
CREATE INDEX idx_utilisateurs_scope  ON utilisateurs USING GIN(scope);


-- ─────────────────────────────────────────────────────────────────
-- 3. TABLE DES PERMISSIONS PAR RÔLE
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE permissions_roles (
  id              bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role            bet_role NOT NULL,
  module          text     NOT NULL,
  peut_lire       boolean  NOT NULL DEFAULT false,
  peut_creer      boolean  NOT NULL DEFAULT false,
  peut_modifier   boolean  NOT NULL DEFAULT false,
  peut_supprimer  boolean  NOT NULL DEFAULT false,
  peut_gerer      boolean  NOT NULL DEFAULT false,
  UNIQUE (role, module)
);

-- Super Admin - accès total
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('super_admin','dashboard',    true,true,true,true,true),
('super_admin','utilisateurs', true,true,true,true,true),
('super_admin','roles',        true,true,true,true,true),
('super_admin','cours',        true,true,true,true,true),
('super_admin','examens',      true,true,true,true,true),
('super_admin','finances',     true,true,true,true,true),
('super_admin','crm',          true,true,true,true,true),
('super_admin','inscriptions', true,true,true,true,true),
('super_admin','planning',     true,true,true,true,true),
('super_admin','rh',           true,true,true,true,true),
('super_admin','mediatheque',  true,true,true,true,true),
('super_admin','rapports',     true,true,true,true,true),
('super_admin','configuration',true,true,true,true,true),
('super_admin','audit',        true,true,true,true,true),
('super_admin','support',      true,true,true,true,true);

-- Admin - élevé, sauf configuration système
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('admin','dashboard',    true, true, true, true, true),
('admin','utilisateurs', true, true, true, true, false),
('admin','cours',        true, true, true, true, true),
('admin','examens',      true, true, true, true, true),
('admin','finances',     true, true, true, true, false),
('admin','inscriptions', true, true, true, true, true),
('admin','planning',     true, true, true, false,false),
('admin','rapports',     true, true, false,false,false),
('admin','support',      true, true, true, false,false),
('admin','configuration',false,false,false,false,false),
('admin','audit',        true, false,false,false,false);

-- Manager - supervision + reporting
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('manager','dashboard',    true, false,false,false,false),
('manager','cours',        true, false,true, false,false),
('manager','examens',      true, false,false,false,false),
('manager','crm',          true, true, true, false,true),
('manager','inscriptions', true, false,false,false,false),
('manager','planning',     true, true, true, false,false),
('manager','rapports',     true, true, false,false,false),
('manager','rh',           true, false,false,false,false);

-- Responsable - coachs, classes, planning, médiathèque
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('responsable','dashboard',  true, false,false,false,false),
('responsable','cours',      true, true, true, false,true),
('responsable','examens',    true, true, true, false,false),
('responsable','planning',   true, true, true, false,true),
('responsable','mediatheque',true, true, true, false,true),
('responsable','rh',         true, false,true, false,false);

-- Commercial - CRM + Ventes
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('commercial','dashboard',    true, false,false,false,false),
('commercial','crm',          true, true, true, false,true),
('commercial','inscriptions', true, true, true, false,false),
('commercial','rapports',     true, false,false,false,false);

-- Gestionnaire - administratif
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('gestionnaire','dashboard',    true, false,false,false,false),
('gestionnaire','inscriptions', true, true, true, false,true),
('gestionnaire','finances',     true, true, true, false,false),
('gestionnaire','planning',     true, false,false,false,false),
('gestionnaire','support',      true, true, true, false,false);

-- Coach - pédagogique
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('coach','dashboard',  true, false,false,false,false),
('coach','cours',      true, true, true, false,false),
('coach','examens',    true, true, true, false,false),
('coach','planning',   true, false,false,false,false),
('coach','mediatheque',true, true, true, false,false);

-- Data Collector - saisie uniquement
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('data_collector','crm',          true,true,true, false,false),
('data_collector','inscriptions', true,true,false,false,false);


-- ─────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE utilisateurs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin_ou_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profils_admin
    WHERE id = auth.uid()
      AND profil_type IN ('super_admin','admin_pedagogique','admin_financier','admin_rh','admin_commercial','responsable_centre')
      AND actif = true
  );
$$;

CREATE POLICY "admins_lisent_utilisateurs"
  ON utilisateurs FOR SELECT USING (is_admin_ou_superadmin());

CREATE POLICY "superadmin_insert_utilisateurs"
  ON utilisateurs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profils_admin WHERE id = auth.uid() AND profil_type = 'super_admin')
  );

CREATE POLICY "superadmin_update_utilisateurs"
  ON utilisateurs FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profils_admin WHERE id = auth.uid() AND profil_type = 'super_admin')
  );

CREATE POLICY "personne_delete_utilisateurs"
  ON utilisateurs FOR DELETE USING (false);

CREATE POLICY "admins_lisent_permissions"
  ON permissions_roles FOR SELECT USING (is_admin_ou_superadmin());

CREATE POLICY "superadmin_gere_permissions"
  ON permissions_roles FOR ALL USING (
    EXISTS (SELECT 1 FROM profils_admin WHERE id = auth.uid() AND profil_type = 'super_admin')
  );


-- ─────────────────────────────────────────────────────────────────
-- 5. VUE - utilisateur + permissions de son rôle
-- ─────────────────────────────────────────────────────────────────
CREATE VIEW vue_utilisateurs_permissions AS
SELECT
  u.id, u.email, u.nom, u.prenom, u.role, u.scope,
  u.departement, u.actif, u.twofa_active,
  u.date_creation, u.derniere_connexion,
  json_agg(json_build_object(
    'module',        p.module,
    'peut_lire',     p.peut_lire,
    'peut_creer',    p.peut_creer,
    'peut_modifier', p.peut_modifier,
    'peut_supprimer',p.peut_supprimer,
    'peut_gerer',    p.peut_gerer
  ) ORDER BY p.module) AS permissions
FROM utilisateurs u
LEFT JOIN permissions_roles p ON p.role = u.role
GROUP BY u.id;


-- ─────────────────────────────────────────────────────────────────
-- 6. VÉRIFICATION
-- ─────────────────────────────────────────────────────────────────
SELECT role, count(*) AS nb_modules
FROM permissions_roles
GROUP BY role
ORDER BY role;
