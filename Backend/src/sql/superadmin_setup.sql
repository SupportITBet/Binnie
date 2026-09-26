-- ═══════════════════════════════════════════════════════════════════
-- BET - SYSTÈME DE GESTION DES PROFILS ADMIN
-- Coller dans : Supabase Dashboard > SQL Editor > New query
-- À exécuter UNE SEULE FOIS
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1. TABLE DES PROFILS ADMIN
--    id = auth.users.id (même UUID que l'utilisateur Supabase Auth)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profils_admin (
  id                  uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text        NOT NULL UNIQUE,
  nom                 text        NOT NULL,
  prenom              text        NOT NULL,
  telephone           text,

  -- Type de profil (détermine les accès par défaut)
  profil_type         text        NOT NULL
    CHECK (profil_type IN (
      'super_admin',
      'admin_pedagogique',
      'admin_financier',
      'admin_rh',
      'admin_commercial',
      'responsable_centre',
      'observateur'
    )),

  -- Périmètre : tableau des centres gérés
  -- Ex: ["national"] ou ["angre", "bouake"]
  scope               text[]      NOT NULL DEFAULT '{"national"}',

  -- Département affiché (label lisible)
  departement         text,

  -- Permissions JSON granulaires par module
  -- Ex: { "cours": { "create": true, "read": true, "update": true, "delete": false, "manage": false } }
  permissions         jsonb       NOT NULL DEFAULT '{}',

  -- Statut du compte
  actif               boolean     NOT NULL DEFAULT true,
  twofa_obligatoire   boolean     NOT NULL DEFAULT false,
  mdp_temporaire      boolean     NOT NULL DEFAULT true,

  -- Traçabilité
  cree_par_id         uuid        REFERENCES profils_admin(id) ON DELETE SET NULL,
  date_creation       timestamptz NOT NULL DEFAULT now(),
  derniere_connexion  timestamptz,
  note                text,

  -- Contrainte : UN SEUL super_admin dans le système
  CONSTRAINT unique_super_admin EXCLUDE USING btree (profil_type WITH =)
    WHERE (profil_type = 'super_admin')
);

-- Index pour accélérer les recherches par type et statut
CREATE INDEX IF NOT EXISTS idx_profils_admin_type   ON profils_admin(profil_type);
CREATE INDEX IF NOT EXISTS idx_profils_admin_actif  ON profils_admin(actif);
CREATE INDEX IF NOT EXISTS idx_profils_admin_scope  ON profils_admin USING GIN(scope);


-- ─────────────────────────────────────────────────────────────────
-- 2. TABLE D'AUDIT - trace toutes les actions sur les profils
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_admin (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  acteur_id   uuid        REFERENCES profils_admin(id) ON DELETE SET NULL,
  acteur_nom  text,
  action      text        NOT NULL,   -- 'PROFIL_CREE' | 'PROFIL_MODIFIE' | 'LOGIN' | etc.
  cible_id    uuid,                   -- ID du profil concerné (si applicable)
  detail      text,
  ip          text,
  statut      text        NOT NULL DEFAULT 'success'
    CHECK (statut IN ('success', 'warning', 'danger', 'info'))
);

CREATE INDEX IF NOT EXISTS idx_audit_acteur   ON audit_admin(acteur_id);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_admin(action);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_admin(created_at DESC);


-- ─────────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE profils_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_admin   ENABLE ROW LEVEL SECURITY;

-- Fonction helper : est-ce que l'utilisateur connecté est super_admin ?
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profils_admin
    WHERE id = auth.uid()
      AND profil_type = 'super_admin'
      AND actif = true
  );
$$;

-- Fonction helper : est-ce que l'utilisateur connecté est un admin actif ?
CREATE OR REPLACE FUNCTION is_admin_actif()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profils_admin
    WHERE id = auth.uid()
      AND actif = true
  );
$$;

-- Policies profils_admin
--   Lecture : tout admin actif peut lire les profils
CREATE POLICY "admin_actif_peut_lire"
  ON profils_admin FOR SELECT
  USING (is_admin_actif());

--   Insertion : UNIQUEMENT le super_admin peut créer des profils
CREATE POLICY "super_admin_peut_inserer"
  ON profils_admin FOR INSERT
  WITH CHECK (is_super_admin());

--   Modification : UNIQUEMENT le super_admin peut modifier
CREATE POLICY "super_admin_peut_modifier"
  ON profils_admin FOR UPDATE
  USING (is_super_admin());

--   Suppression : personne ne peut supprimer (on désactive seulement)
--   Le super_admin utilise UPDATE actif=false à la place
CREATE POLICY "personne_ne_peut_supprimer"
  ON profils_admin FOR DELETE
  USING (false);

-- Policies audit
CREATE POLICY "admin_actif_peut_lire_audit"
  ON audit_admin FOR SELECT
  USING (is_admin_actif());

CREATE POLICY "admin_actif_peut_inserer_audit"
  ON audit_admin FOR INSERT
  WITH CHECK (is_admin_actif());


-- ─────────────────────────────────────────────────────────────────
-- 4. TRIGGER - met à jour derniere_connexion automatiquement
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_derniere_connexion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profils_admin
  SET derniere_connexion = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- Ce trigger se déclenche sur chaque nouvelle session Supabase Auth
CREATE OR REPLACE TRIGGER on_auth_session_created
  AFTER INSERT ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_derniere_connexion();


-- ─────────────────────────────────────────────────────────────────
-- 5. CRÉER LE SUPER ADMIN
--
--    ÉTAPE A : Créer l'utilisateur dans Supabase Auth
--    → Supabase Dashboard > Authentication > Users > "Add user"
--    → Email : superadmin@bet.ci
--    → Mot de passe : [choisir un mot de passe fort]
--    → Copier l'UUID généré (ex: abc123...)
--
--    ÉTAPE B : Exécuter ce bloc en remplaçant :
--      - <UUID_COPIE>   par l'UUID de l'étape A
--      - les champs nom, prenom, email, telephone
-- ─────────────────────────────────────────────────────────────────

-- Permissions totales du super_admin (tous les modules, toutes les actions)
DO $$
DECLARE
  sa_id uuid := '1bc7a878-9db6-4a46-a9c9-fe5a28d4f99e'; -- ← REMPLACER ICI
  perms_totales jsonb := '{
    "dashboard":    { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "users":        { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "roles":        { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "cours":        { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "examens":      { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "finances":     { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "rh":           { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "commercial":   { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "audit":        { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "plateforme":   { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "coachs":       { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "apprenants":   { "create": true, "read": true, "update": true, "delete": true, "manage": true },
    "support":      { "create": true, "read": true, "update": true, "delete": true, "manage": true }
  }';
BEGIN
  -- Insérer le profil super_admin
  INSERT INTO profils_admin (
    id, email, nom, prenom, telephone,
    profil_type, scope, departement,
    permissions, actif, twofa_obligatoire,
    mdp_temporaire, cree_par_id, note
  ) VALUES (
    sa_id,
    'superadmin@bet.ci',        -- ← email du super_admin
    'Kouamé',                   -- ← nom
    'Aya',                      -- ← prénom
    '+225 01 00 00 01',         -- ← téléphone
    'super_admin',
    ARRAY['national'],
    'Direction Générale',
    perms_totales,
    true,
    true,                       -- 2FA obligatoire pour le super_admin
    false,                      -- pas de mdp temporaire (il l'a défini lui-même)
    NULL,                       -- pas de créateur (c'est lui le premier)
    'Compte fondateur BET - accès total et non modifiable'
  );

  -- Marquer dans app_metadata Supabase Auth que c'est le super_admin
  -- (utilisé par le middleware pour bloquer les accès sans aller en DB)
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || '{"role": "super_admin", "actif": true}'::jsonb
  WHERE id = sa_id;

  -- Première entrée dans l'audit
  INSERT INTO audit_admin (acteur_id, acteur_nom, action, cible_id, detail, statut)
  VALUES (sa_id, 'Kouamé Aya', 'SUPER_ADMIN_INITIALISE', sa_id,
          'Compte super_admin créé - initialisation du système BET', 'success');

  RAISE NOTICE 'Super Admin créé avec succès : %', sa_id;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- 6. VÉRIFICATION - lancer après la création
-- ─────────────────────────────────────────────────────────────────
-- Vérifier que le super_admin existe bien :
SELECT
  p.id,
  p.nom || ' ' || p.prenom  AS "Nom complet",
  p.email                    AS "Email",
  p.profil_type              AS "Type de profil",
  p.scope                    AS "Périmètre",
  p.actif                    AS "Actif",
  p.twofa_obligatoire        AS "2FA obligatoire",
  u.raw_app_meta_data->>'role' AS "Rôle Auth",
  p.date_creation            AS "Créé le"
FROM profils_admin p
JOIN auth.users u ON u.id = p.id
WHERE p.profil_type = 'super_admin';
