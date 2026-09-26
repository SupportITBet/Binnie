-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `messages_entreprise`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

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

