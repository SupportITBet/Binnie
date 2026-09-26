-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `utilisateurs`
-- Généré à partir de 11 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── utilisateurs_migration.sql  (2026-05-18) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- TABLE utilisateurs — Profils staff du dashboard BET
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Créer la table si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS public.utilisateurs (
  id               UUID        PRIMARY KEY,
  email            TEXT        NOT NULL UNIQUE,
  nom              TEXT        NOT NULL,
  prenom           TEXT        NOT NULL,
  telephone        TEXT,
  role             TEXT        NOT NULL DEFAULT 'manager',
  scope            JSONB       NOT NULL DEFAULT '["national"]',
  departement      TEXT,
  actif            BOOLEAN     NOT NULL DEFAULT true,
  twofa_active     BOOLEAN     NOT NULL DEFAULT false,
  mdp_temporaire   BOOLEAN     NOT NULL DEFAULT true,
  mdp_initial      TEXT,
  note             TEXT,
  cree_par_id      UUID,
  date_creation    TIMESTAMPTZ NOT NULL DEFAULT now(),
  derniere_connexion TIMESTAMPTZ
);

-- Ajouter les colonnes manquantes si la table existe déjà
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS scope            JSONB       NOT NULL DEFAULT '["national"]';
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS departement      TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS telephone        TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS actif            BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS twofa_active     BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS mdp_temporaire   BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS mdp_initial      TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS note             TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS cree_par_id      UUID;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS date_creation    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS derniere_connexion TIMESTAMPTZ;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS avatar_url         TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS coach_info         JSONB;

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role   ON public.utilisateurs(role);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_actif  ON public.utilisateurs(actif);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email  ON public.utilisateurs(email);

-- RLS : désactiver pour laisser le backend service_role accéder librement
ALTER TABLE public.utilisateurs DISABLE ROW LEVEL SECURITY;

-- Table audit_admin pour les logs d'actions (si elle n'existe pas)
CREATE TABLE IF NOT EXISTS public.audit_admin (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  acteur_id   UUID,
  acteur_nom  TEXT,
  action      TEXT        NOT NULL,
  cible_id    UUID,
  detail      TEXT,
  statut      TEXT        NOT NULL DEFAULT 'success',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin_acteur  ON public.audit_admin(acteur_id);
CREATE INDEX IF NOT EXISTS idx_audit_admin_action  ON public.audit_admin(action);
CREATE INDEX IF NOT EXISTS idx_audit_admin_created ON public.audit_admin(created_at DESC);

ALTER TABLE public.audit_admin DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- Ajout des rôles manquants à l'enum bet_role
-- ══════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'pedagogical_advisor'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'pedagogical_advisor';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'data_collector'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'data_collector';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'onboarding'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'onboarding';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'customer_care'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'customer_care';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'comptable'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'comptable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'placement_test'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'placement_test';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'superviseur'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'superviseur';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'rh'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'rh';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'deputy_superviseur'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'deputy_superviseur';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'apprenant'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'apprenant';
  END IF;
END $$;

-- Couleur personnalisée du dashboard (optionnel, ex: '#7c3aed')
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS couleur  TEXT;

-- Adresse et photo de profil apprenant
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS adresse    TEXT;
ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── assistantes_onboarding_migration.sql  (2026-06-19) ──────────────────────────────
-- Migration : lien onboarding ↔ commerciale + date de début de formation
-- À exécuter dans Supabase SQL Editor.

-- 0. Date de début de formation sur assignations_parcours
ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS date_debut_formation DATE;

COMMENT ON COLUMN public.assignations_parcours.date_debut_formation IS
  'Date de début de formation renseignée par la commerciale lors de la finalisation';

-- 1. Colonne onboarding_id sur assistantes (commerciale → onboarding assignée)
ALTER TABLE public.assistantes
  ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assistantes.onboarding_id IS
  'ID de l''assistante onboarding assignée à cette commerciale';

CREATE INDEX IF NOT EXISTS idx_assistantes_onboarding ON public.assistantes(onboarding_id);

-- 2. Colonne onboarding_commercial_id sur utilisateurs (onboarding → sa commerciale)
ALTER TABLE public.utilisateurs
  ADD COLUMN IF NOT EXISTS onboarding_commercial_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.utilisateurs.onboarding_commercial_id IS
  'Pour un compte onboarding : ID de la commerciale qui lui est assignée';

CREATE INDEX IF NOT EXISTS idx_utilisateurs_onboarding_commercial ON public.utilisateurs(onboarding_commercial_id);

-- ── fix_coach_mamadou_doumbia.sql  (2026-06-19) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- FIX : Remplacer MAMADOU DOUMBIA par Thierry Fodé dans les groupes
--        + Supprimer MAMADOU DOUMBIA de la base
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── 1. Vérification préalable (lire avant d'exécuter le reste) ──
SELECT 'MAMADOU DOUMBIA' AS recherche, id, nom, prenom, email, role, actif
FROM public.utilisateurs
WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%'
UNION ALL
SELECT 'THIERRY FODE' AS recherche, id, nom, prenom, email, role, actif
FROM public.utilisateurs
WHERE LOWER(nom) ILIKE '%fod%' AND LOWER(prenom) ILIKE '%thierry%';


-- ── 2. Vérifier les groupes actuellement assignés à Mamadou Doumbia ──
SELECT g.id, g.nom, g.coach_id, g.statut
FROM public.groupes g
WHERE g.coach_id = (
  SELECT id FROM public.utilisateurs
  WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%'
  LIMIT 1
);


-- ══════════════════════════════════════════════════════════════
-- !! EXÉCUTER LES BLOCS CI-DESSOUS SEULEMENT APRÈS VÉRIFICATION !!
-- ══════════════════════════════════════════════════════════════

-- ── 3. Réassigner les groupes de Mamadou Doumbia → Thierry Fodé ──
UPDATE public.groupes
SET coach_id = (
  SELECT id FROM public.utilisateurs
  WHERE LOWER(nom) ILIKE '%fod%' AND LOWER(prenom) ILIKE '%thierry%'
  LIMIT 1
)
WHERE coach_id = (
  SELECT id FROM public.utilisateurs
  WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%'
  LIMIT 1
);


-- ── 4. Supprimer Mamadou Doumbia de la table utilisateurs ──
DELETE FROM public.utilisateurs
WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%';


-- ── 5. Supprimer de la table coachs si entrée existante ──
DELETE FROM public.coachs
WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%';


-- ── 6. Vérification finale ──
SELECT 'Groupes de Thierry Fodé après correction' AS info, g.id, g.nom, g.statut, g.coach_id
FROM public.groupes g
WHERE g.coach_id = (
  SELECT id FROM public.utilisateurs
  WHERE LOWER(nom) ILIKE '%fod%' AND LOWER(prenom) ILIKE '%thierry%'
  LIMIT 1
);

-- ── verif_thierry_fode.sql  (2026-06-19) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- DIAGNOSTIC COMPLET — Thierry Fodé & liste des coachs
-- ══════════════════════════════════════════════════════════════

-- 1. Thierry dans utilisateurs ?
SELECT id, nom, prenom, email, role, actif, coach_info
FROM public.utilisateurs
WHERE LOWER(nom) ILIKE '%fod%' OR LOWER(prenom) ILIKE '%thierry%';

-- 2. Thierry dans coachs ?
SELECT id, nom, prenom, grade
FROM public.coachs
WHERE LOWER(nom) ILIKE '%fod%' OR LOWER(prenom) ILIKE '%thierry%';

-- 3. Tous les utilisateurs role=coach
SELECT id, nom, prenom, email, actif, coach_info
FROM public.utilisateurs
WHERE role = 'coach';

-- 4. Tout ce qui est dans la table coachs
SELECT id, nom, prenom, grade
FROM public.coachs;

-- 5. Groupes et leur coach_id
SELECT id, nom, statut, coach_id
FROM public.groupes
ORDER BY created_at DESC LIMIT 10;

-- ── acces_elearning_migration.sql  (2026-06-24) ──────────────────────────────
-- Migration : ajout de la colonne acces_elearning dans la table utilisateurs
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS acces_elearning BOOLEAN DEFAULT false;

-- Mettre à false pour tous les utilisateurs existants (sécurité par défaut)
UPDATE utilisateurs
  SET acces_elearning = false
  WHERE acces_elearning IS NULL;

-- ── admin_elearning_migration.sql  (2026-07-02) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Migration : ajout des rôles elearning à l'enum bet_role
-- + colonne acces_elearning sur utilisateurs
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Valeur utilisée par le SuperAdminDashboard (dash)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'assistant_elearning'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'assistant_elearning';
  END IF;

  -- Valeur utilisée par le panel bet-elearning
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_elearning'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_elearning';
  END IF;
END $$;

-- Ajouter la colonne acces_elearning si elle n'existe pas encore
ALTER TABLE public.utilisateurs
  ADD COLUMN IF NOT EXISTS acces_elearning BOOLEAN NOT NULL DEFAULT false;

-- ── apprenant_suspension_migration.sql  (2026-07-02) ──────────────────────────────
-- Ajouter le champ de suspension globale sur les apprenants
ALTER TABLE public.utilisateurs
  ADD COLUMN IF NOT EXISTS acces_bloque BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_utilisateurs_acces_bloque ON public.utilisateurs(acces_bloque);

-- ── entreprises_elearning_migration.sql  (2026-07-02) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════════════
-- Migration : Système Entreprises bet-elearning
-- À exécuter dans Supabase SQL Editor (une seule fois, idempotent)
-- ══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 : Enrichir comptes_entreprises pour bet-elearning
--           (la table existe déjà depuis corporate_b2b_migration.sql)
-- ─────────────────────────────────────────────────────────────────────

-- Logo / visuel
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS logo_url        TEXT;
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS couleur         TEXT DEFAULT '#0891B2';
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS initiales       TEXT;

-- Package elearning souscrit
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS package_elearning TEXT
  CHECK (package_elearning IN ('starter','business','premium','enterprise'));

-- Nombre de licences / bénéficiaires autorisés dans bet-elearning
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS nb_licences     INTEGER DEFAULT 0;

-- Dates du contrat elearning
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS date_debut_contrat DATE;
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS date_fin_contrat   DATE;

-- Options du package
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS option_replay       BOOLEAN DEFAULT false;
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS types_sessions      JSONB   DEFAULT '["ligne"]';

-- Montant du contrat annuel
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS montant_contrat    NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS devise             TEXT DEFAULT 'FCFA';

-- Suivi activité bet-elearning
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS acces_elearning    BOOLEAN DEFAULT false;
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS cree_par_id        UUID;
ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS cree_dans          TEXT DEFAULT 'elearning'
  CHECK (cree_dans IN ('dash','elearning'));


-- ─────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 : Ajouter entreprise_id sur la table utilisateurs
--           → Lie un compte RH ou un apprenant à son entreprise
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.utilisateurs ADD COLUMN IF NOT EXISTS entreprise_id UUID
  REFERENCES public.comptes_entreprises(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_utilisateurs_entreprise ON public.utilisateurs(entreprise_id);


-- ─────────────────────────────────────────────────────────────────────
-- ÉTAPE 3 : Ajouter les rôles entreprise à l'enum bet_role
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Responsable RH côté entreprise (accès au dashboard entreprise)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'client_entreprise'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'client_entreprise';
  END IF;

  -- Employé/bénéficiaire d'une entreprise (= apprenant entreprise)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'beneficiaire_entreprise'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'beneficiaire_entreprise';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- ÉTAPE 4 : Table beneficiaires_entreprise
--           → Lien entre un employé (apprenant) et son entreprise
--           → Suivi de sa progression dans bet-elearning
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.beneficiaires_entreprise (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id    UUID        NOT NULL REFERENCES public.comptes_entreprises(id) ON DELETE CASCADE,
  utilisateur_id   UUID        NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,

  -- Statut dans l'entreprise
  statut           TEXT        NOT NULL DEFAULT 'actif'
                     CHECK (statut IN ('actif','suspendu','termine')),
  date_inscription DATE        NOT NULL DEFAULT CURRENT_DATE,
  date_fin         DATE,

  -- Suivi pédagogique
  progression      NUMERIC(5,2) NOT NULL DEFAULT 0,   -- % cours complétés (0–100)
  nb_seances_faites INTEGER     NOT NULL DEFAULT 0,
  nb_seances_total  INTEGER     NOT NULL DEFAULT 0,
  dernier_acces     TIMESTAMPTZ,

  -- Groupe/classe attribué
  groupe_id        UUID,    -- référence future vers groupes
  niveau_initial   TEXT,    -- niveau CECRL détecté au test de placement
  niveau_actuel    TEXT,

  -- Métadonnées
  notes            TEXT,
  cree_par_id      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (entreprise_id, utilisateur_id)
);

CREATE INDEX IF NOT EXISTS idx_benef_entreprise     ON public.beneficiaires_entreprise(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_benef_utilisateur    ON public.beneficiaires_entreprise(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_benef_statut         ON public.beneficiaires_entreprise(statut);
CREATE INDEX IF NOT EXISTS idx_benef_groupe         ON public.beneficiaires_entreprise(groupe_id);

ALTER TABLE public.beneficiaires_entreprise DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────
-- ÉTAPE 5 : Table contrats_entreprises_elearning
--           → Détail du contrat de formation souscrit par l'entreprise
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contrats_entreprises_elearning (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id    UUID        NOT NULL REFERENCES public.comptes_entreprises(id) ON DELETE CASCADE,

  -- Référence interne
  numero_contrat   TEXT,

  -- Package et licences
  package          TEXT        CHECK (package IN ('starter','business','premium','enterprise')),
  nb_licences      INTEGER     NOT NULL DEFAULT 0,

  -- Financier
  montant_ht       NUMERIC(12,2) NOT NULL DEFAULT 0,
  taux_tva         NUMERIC(5,2) DEFAULT 18,
  devise           TEXT DEFAULT 'FCFA',
  mode_paiement    TEXT,        -- 'virement','cheque','especes','mobile_money'

  -- Durée
  date_debut       DATE        NOT NULL,
  date_fin         DATE        NOT NULL,
  renouvellement_auto BOOLEAN  DEFAULT false,

  -- Options pédagogiques
  option_replay    BOOLEAN     DEFAULT false,
  types_sessions   JSONB       DEFAULT '["ligne"]',
  langues          JSONB       DEFAULT '["anglais"]',
  niveaux_cibles   JSONB       DEFAULT '[]',   -- ex: ["A1","A2","B1"]

  -- Statut
  statut           TEXT        NOT NULL DEFAULT 'actif'
                     CHECK (statut IN ('brouillon','actif','suspendu','expire','resilie')),
  motif_resiliation TEXT,

  -- Documents
  fichier_contrat_url TEXT,

  -- Audit
  cree_par_id      UUID,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contrats_elearning_entreprise ON public.contrats_entreprises_elearning(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_contrats_elearning_statut     ON public.contrats_entreprises_elearning(statut);
CREATE INDEX IF NOT EXISTS idx_contrats_elearning_dates      ON public.contrats_entreprises_elearning(date_debut, date_fin);

ALTER TABLE public.contrats_entreprises_elearning DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────
-- ÉTAPE 6 : Table rapports_entreprise
--           → Rapports mensuels de formation visibles par le RH
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rapports_entreprise (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id    UUID        NOT NULL REFERENCES public.comptes_entreprises(id) ON DELETE CASCADE,

  -- Période
  mois             INTEGER     NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee            INTEGER     NOT NULL,

  -- KPIs du mois
  nb_beneficiaires_actifs INTEGER DEFAULT 0,
  nb_seances_realisees    INTEGER DEFAULT 0,
  nb_heures_formation     NUMERIC(8,2) DEFAULT 0,
  taux_presence           NUMERIC(5,2) DEFAULT 0,   -- %
  progression_moyenne     NUMERIC(5,2) DEFAULT 0,   -- %
  nb_absences             INTEGER DEFAULT 0,

  -- Contenu JSONB (détail par bénéficiaire)
  detail_beneficiaires JSONB DEFAULT '[]',

  -- Statut
  statut           TEXT DEFAULT 'draft' CHECK (statut IN ('draft','publie')),
  publie_par_id    UUID,
  publie_at        TIMESTAMPTZ,

  -- Audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (entreprise_id, mois, annee)
);

CREATE INDEX IF NOT EXISTS idx_rapports_entreprise     ON public.rapports_entreprise(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_rapports_periode        ON public.rapports_entreprise(annee, mois);

ALTER TABLE public.rapports_entreprise DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────
-- ÉTAPE 7 : Table messages_entreprise
--           → Canal de communication RH ↔ Admin BET
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.messages_entreprise (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id    UUID        NOT NULL REFERENCES public.comptes_entreprises(id) ON DELETE CASCADE,
  expediteur_id    UUID        NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  expediteur_role  TEXT        NOT NULL,   -- 'client_entreprise' | 'admin_*'
  contenu          TEXT        NOT NULL,
  piece_jointe_url TEXT,
  lu               BOOLEAN     NOT NULL DEFAULT false,
  lu_at            TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_entreprise     ON public.messages_entreprise(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_messages_expediteur     ON public.messages_entreprise(expediteur_id);
CREATE INDEX IF NOT EXISTS idx_messages_lu             ON public.messages_entreprise(lu);

ALTER TABLE public.messages_entreprise DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────
-- ÉTAPE 8 : Désactiver RLS sur comptes_entreprises
--           (accès backend service_role uniquement)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.comptes_entreprises DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────
-- VÉRIFICATION FINALE
-- ─────────────────────────────────────────────────────────────────────

-- Lister les tables créées/modifiées :
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'comptes_entreprises',
    'beneficiaires_entreprise',
    'contrats_entreprises_elearning',
    'rapports_entreprise',
    'messages_entreprise',
    'utilisateurs'
  )
ORDER BY table_name;

-- Vérifier la colonne entreprise_id sur utilisateurs :
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'utilisateurs'
  AND column_name IN ('entreprise_id', 'acces_elearning', 'role');

-- ── type_coach_migration.sql  (2026-07-02) ──────────────────────────────
-- Migration : ajout de la colonne type_coach dans la table utilisateurs
-- Permet de distinguer professeur_titulaire / professeur_remplacant pour les coachs e-learning
-- Note : la colonne role est un enum (bet_role) donc on ne modifie pas sa valeur.
-- Le type coach est uniquement stocké dans type_coach (TEXT).

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS type_coach TEXT DEFAULT NULL;

-- ── admin_roles_elearning_migration.sql  (2026-07-02) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Migration : ajout des rôles admin_* BET E-Learning à l'enum bet_role
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_placement'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_placement';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_onboarding'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_onboarding';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_customer_care'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_customer_care';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_commercial'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_commercial';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_pa_advisor'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_pa_advisor';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_rh_paie'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_rh_paie';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_comptable'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_comptable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_manager'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_manager';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_superviseur'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_superviseur';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_contenus'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'admin_contenus';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'professeur_titulaire'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'professeur_titulaire';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'professeur_remplacant'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'bet_role')
  ) THEN
    ALTER TYPE bet_role ADD VALUE 'professeur_remplacant';
  END IF;
END $$;


-- ── gamification_migration.sql  (2026-07-09) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Gamification BET — grand livre de points, catalogue de badges.
-- Implémente le schéma validé (artifact "Gamification BET — schéma & propositions").
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS points_gamif INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS points_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id UUID NOT NULL REFERENCES utilisateurs(id),
  source_type  TEXT NOT NULL CHECK (source_type IN ('session','devoir','devoir_bonus','mini_jeu','mini_jeu_progression','streak','onboarding','badge')),
  source_id    TEXT,
  points       INTEGER NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_apprenant     ON points_transactions(apprenant_id);
CREATE INDEX IF NOT EXISTS idx_pt_apprenant_src ON points_transactions(apprenant_id, source_type, created_at);

CREATE TABLE IF NOT EXISTS badges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,
  nom              TEXT NOT NULL,
  icone            TEXT NOT NULL,
  description      TEXT NOT NULL,
  categorie        TEXT NOT NULL,
  condition_type   TEXT NOT NULL,
  condition_valeur INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TODO (amélioration future) : la célébration de déblocage de badge côté frontend est
-- aujourd'hui dédupliquée via un cache localStorage par appareil — un apprenant qui se
-- connecte sur un autre appareil pourrait revoir la célébration d'un badge déjà obtenu
-- ailleurs. Une colonne `notifie_vu BOOLEAN NOT NULL DEFAULT false` ici, mise à jour par
-- l'API au moment où l'apprenant ferme l'overlay de célébration, serait plus robuste.
CREATE TABLE IF NOT EXISTS badges_obtenus (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id UUID NOT NULL REFERENCES utilisateurs(id),
  badge_id     UUID NOT NULL REFERENCES badges(id),
  obtenu_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (apprenant_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_bo_apprenant ON badges_obtenus(apprenant_id);

-- ── Catalogue de badges (schéma "02 — Catalogue" de l'artifact) ────────────
INSERT INTO badges (code, nom, icone, description, categorie, condition_type, condition_valeur) VALUES
  ('bienvenue',           'Bienvenue !',          '👋', 'Première connexion à BET E-Learning',                              'Démarrage',   'premiere_activite',    NULL),
  ('pret_a_apprendre',    'Prêt à apprendre',     '🧭', 'Guide d''onboarding terminé (4 étapes validées)',                   'Démarrage',   'onboarding_complete',  NULL),
  ('presence_parfaite',   'Présence parfaite',    '🎯', '5 sessions consécutives sans absence',                             'Assiduité',   'presences_consecutives', 5),
  ('serie_7',             'Série de 7',           '🔥', '7 jours d''activité consécutifs sur la plateforme',                 'Assiduité',   'streak_jours',          7),
  ('un_mois',             'Un mois avec BET',     '🗓️', '30 jours depuis l''inscription, toujours actif',                    'Assiduité',   'anciennete_jours',     30),
  ('premier_devoir',      'Premier devoir',       '✍️', 'Premier devoir rendu sur la plateforme',                           'Devoirs',     'premier_devoir',       NULL),
  ('travailleur_regulier','Travailleur régulier', '📚', '10 devoirs rendus, tous à temps',                                  'Devoirs',     'devoirs_temps',        10),
  ('perfectionniste',     'Perfectionniste',      '💯', 'Note de 100 % sur un devoir noté',                                 'Devoirs',     'devoir_note_max',      NULL),
  ('joueur_debutant',     'Joueur débutant',      '🕹️', 'Premier mini-jeu terminé',                                        'Mini-jeux',   'premier_jeu',          NULL),
  ('touche_a_tout',       'Touche-à-tout',        '🎲', 'Au moins une partie dans chaque jeu actif',                        'Mini-jeux',   'tous_jeux_actifs',     NULL),
  ('score_parfait',       'Score parfait',        '🏆', 'Score de 100 % sur un mini-jeu',                                   'Mini-jeux',   'jeu_score_parfait',    NULL),
  ('increvable',          'Increvable',           '💪', '10 parties jouées, tous jeux confondus',                           'Mini-jeux',   'parties_jouees',       10),
  ('niveau_superieur',    'Niveau supérieur',     '📈', 'Passage confirmé au niveau CECR suivant',                          'Progression', 'niveau_superieur',     NULL),
  ('certifie_bet',        'Certifié BET',         '🎓', 'Certificat de fin de parcours obtenu',                             'Progression', 'certification',        NULL),
  ('podium',              'Podium',               '🥇', 'Top 3 du classement de sa classe, en fin de mois',                 'Distinction', 'podium_mensuel',       NULL)
ON CONFLICT (code) DO NOTHING;

-- ── gamification_dash_migration.sql  (2026-07-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Gamification dash — grand livre de points, catalogue de badges,
-- entièrement séparés de bet-elearning (points_transactions, badges,
-- badges_obtenus, utilisateurs.points_gamif restent réservés à
-- bet-elearning ; jamais lus ni écrits par le côté dash).
-- Même principe que contenus_mini_jeux_dash / contenus_mini_jeux_resultats_dash.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS points_gamif_dash INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS points_transactions_dash (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id UUID NOT NULL REFERENCES utilisateurs(id),
  source_type  TEXT NOT NULL CHECK (source_type IN (
    'session','devoir','devoir_bonus','devoir_correction','mini_jeu','mini_jeu_progression',
    'streak','onboarding','badge','niveau_progression','chat_message','contenu_vue'
  )),
  source_id    TEXT,
  points       INTEGER NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ptd_apprenant     ON points_transactions_dash(apprenant_id);
CREATE INDEX IF NOT EXISTS idx_ptd_apprenant_src ON points_transactions_dash(apprenant_id, source_type, created_at);

CREATE TABLE IF NOT EXISTS badges_dash (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,
  nom              TEXT NOT NULL,
  icone            TEXT NOT NULL,
  description      TEXT NOT NULL,
  categorie        TEXT NOT NULL,
  condition_type   TEXT NOT NULL,
  condition_valeur INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS badges_obtenus_dash (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id UUID NOT NULL REFERENCES utilisateurs(id),
  badge_id     UUID NOT NULL REFERENCES badges_dash(id),
  obtenu_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (apprenant_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_bod_apprenant ON badges_obtenus_dash(apprenant_id);

-- Table de suivi des consultations de contenus par apprenant (badges Explorateur, dash)
CREATE TABLE IF NOT EXISTS contenus_vues_apprenant_dash (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id     UUID NOT NULL REFERENCES utilisateurs(id),
  ressource_id     UUID NOT NULL,
  ressource_table  TEXT NOT NULL,
  cat              TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (apprenant_id, ressource_id, ressource_table)
);
CREATE INDEX IF NOT EXISTS idx_cvad_apprenant ON contenus_vues_apprenant_dash(apprenant_id);

-- ── Catalogue de badges — copie exacte du catalogue bet-elearning ──────────
INSERT INTO badges_dash (code, nom, icone, description, categorie, condition_type, condition_valeur) VALUES
  ('bienvenue',            'Bienvenue !',           '👋', 'Première connexion à BET E-Learning',                              'Démarrage',    'premiere_activite',      NULL),
  ('pret_a_apprendre',     'Prêt à apprendre',      '🧭', 'Guide d''onboarding terminé (4 étapes validées)',                   'Démarrage',    'onboarding_complete',    NULL),
  ('presence_parfaite',    'Présence parfaite',     '🎯', '5 sessions consécutives sans absence',                             'Assiduité',    'presences_consecutives', 5),
  ('serie_7',              'Série de 7',            '🔥', '7 jours d''activité consécutifs sur la plateforme',                 'Assiduité',    'streak_jours',           7),
  ('serie_14',             'Série de 14',           '🔥', '14 jours d''activité consécutifs sur la plateforme',               'Assiduité',    'streak_jours',           14),
  ('serie_30',             'Série de 30',           '🔥', '30 jours d''activité consécutifs sur la plateforme',               'Assiduité',    'streak_jours',           30),
  ('un_mois',              'Un mois avec BET',      '🗓️', '30 jours depuis l''inscription, toujours actif',                    'Assiduité',    'anciennete_jours',       30),
  ('habitue',              'Habitué',               '🏠', '90 jours depuis l''inscription, toujours actif',                   'Assiduité',    'anciennete_jours',       90),
  ('veteran_bet',          'Vétéran BET',           '🏛️', '1 an depuis l''inscription, toujours actif',                       'Assiduité',    'anciennete_jours',       365),
  ('le_retour',            'Le retour',             '🌅', 'De retour après au moins 14 jours d''absence',                     'Assiduité',    'retour_apres_pause',     14),
  ('leve_tot',             'Lève-tôt',              '🌄', '5 connexions avant 8h du matin',                                   'Assiduité',    'connexions_matinales',   5),
  ('premier_devoir',       'Premier devoir',        '✍️', 'Premier devoir rendu sur la plateforme',                           'Devoirs',      'premier_devoir',         NULL),
  ('travailleur_regulier', 'Travailleur régulier',  '📚', '10 devoirs rendus, tous à temps',                                  'Devoirs',      'devoirs_temps',          10),
  ('en_avance',            'En avance',             '📅', '5 devoirs rendus au moins 24h avant la date limite',               'Devoirs',      'devoirs_en_avance',      5),
  ('dossier_complet',      'Dossier complet',       '📎', 'Premier devoir rendu avec un fichier joint',                       'Devoirs',      'premier_devoir_fichier', NULL),
  ('perfectionniste',      'Perfectionniste',       '💯', 'Note de 100 % sur un devoir noté',                                 'Devoirs',      'devoir_note_max',        NULL),
  ('grand_progres',        'Grand progrès',         '📈', 'Note en hausse d''au moins 30 points vs le devoir noté précédent', 'Devoirs',      'progression_note',       30),
  ('joueur_debutant',      'Joueur débutant',       '🕹️', 'Premier mini-jeu terminé',                                        'Mini-jeux',    'premier_jeu',            NULL),
  ('touche_a_tout',        'Touche-à-tout',         '🎲', 'Au moins une partie dans chaque jeu actif',                        'Mini-jeux',    'tous_jeux_actifs',       NULL),
  ('score_parfait',        'Score parfait',         '🏆', 'Score de 100 % sur un mini-jeu',                                   'Mini-jeux',    'jeu_score_parfait',      NULL),
  ('increvable',           'Increvable',            '💪', '10 parties jouées, tous jeux confondus',                           'Mini-jeux',    'parties_jouees',         10),
  ('ca_grimpe',            'Ça grimpe !',           '🪜', 'Passage à un niveau CECR supérieur',                              'Progression',  'niveau_superieur',       NULL),
  ('bilingue_en_herbe',    'Bilingue en herbe',     '🌱', 'Niveau B1 atteint',                                                'Progression',  'niveau_atteint_b1',      NULL),
  ('niveau_maitrise',      'Niveau maîtrisé',       '🎓', 'Niveau C1 atteint',                                                'Progression',  'niveau_atteint_c1',      NULL),
  ('niveau_superieur',     'Niveau supérieur',      '📈', 'Passage confirmé au niveau CECR suivant',                          'Progression',  'niveau_superieur',       NULL),
  ('certifie_bet',         'Certifié BET',          '🎓', 'Certificat de fin de parcours obtenu',                             'Progression',  'certification',          NULL),
  ('esprit_de_classe',     'Esprit de classe',      '💬', 'Premier message envoyé dans le chat de classe',                    'Social',       'premier_message',        NULL),
  ('bon_camarade',         'Bon camarade',          '🤝', '10 messages envoyés dans le chat de classe',                       'Social',       'messages_classe',        10),
  ('ponctuel',             'Ponctuel',              '🎥', '3 sessions live rejointes à l''heure',                             'Sessions live','sessions_a_lheure',      3),
  ('marathonien_live',     'Marathonien live',      '🏅', '20 sessions live suivies au total',                                'Sessions live','sessions_totales',       20),
  ('curieux',              'Curieux',               '🔍', '5 ressources différentes consultées dans la bibliothèque',         'Explorateur',  'ressources_vues',        5),
  ('collectionneur',       'Collectionneur',        '🗂️', 'Contenus consultés dans au moins 4 catégories différentes',        'Explorateur',  'categories_explorees',   4),
  ('podium',               'Podium',                '🥇', 'Top 3 du classement de sa classe, en fin de mois',                 'Distinction',  'podium_mensuel',         NULL)
ON CONFLICT (code) DO NOTHING;

