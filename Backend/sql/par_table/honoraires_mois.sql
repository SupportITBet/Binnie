-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `honoraires_mois`
-- Généré à partir de 2 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── seances_unifiees_migration.sql  (2026-07-02) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- SYSTÈME SÉANCES UNIFIÉ — BET
-- Migration idempotente : gère le cas où la table existe déjà
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. TABLE CENTRALE : seances
-- Création complète si elle n'existe pas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  circuit             TEXT        NOT NULL DEFAULT 'groupe',
  coach_id            UUID        NOT NULL,
  pa_id               UUID,
  groupe_id           UUID,
  contrat_prive_id    UUID,
  session_live_id     UUID,
  assignation_id      UUID,
  titre               TEXT,
  date_seance         DATE        NOT NULL,
  heure_debut         TIME,
  duree_h             NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  lieu                TEXT,
  type_cours          TEXT        DEFAULT 'presentiel',
  niveau              TEXT,
  grade_coach         TEXT,
  objectif            TEXT,
  notes               TEXT,
  statut              TEXT        NOT NULL DEFAULT 'planifiee',
  honoraire_montant   NUMERIC(10,2) DEFAULT 0,
  honoraire_statut    TEXT        NOT NULL DEFAULT 'en_attente',
  honoraire_valide_par UUID,
  honoraire_valide_at  TIMESTAMPTZ,
  honoraire_paye_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ajout des colonnes manquantes si la table existait déjà
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS circuit             TEXT        NOT NULL DEFAULT 'groupe';
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS coach_id            UUID;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS pa_id               UUID;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS groupe_id           UUID;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS contrat_prive_id    UUID;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS session_live_id     UUID;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS assignation_id      UUID;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS titre               TEXT;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS date_seance         DATE;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS heure_debut         TIME;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS duree_h             NUMERIC(4,2) DEFAULT 1.5;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS lieu                TEXT;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS type_cours          TEXT        DEFAULT 'presentiel';
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS niveau              TEXT;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS grade_coach         TEXT;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS objectif            TEXT;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS notes               TEXT;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS statut              TEXT        NOT NULL DEFAULT 'planifiee';
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS honoraire_montant   NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS honoraire_statut    TEXT        NOT NULL DEFAULT 'en_attente';
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS honoraire_valide_par UUID;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS honoraire_valide_at  TIMESTAMPTZ;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS honoraire_paye_at    TIMESTAMPTZ;
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.seances ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Contraintes CHECK (ajout conditionnel via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'seances' AND constraint_name = 'seances_circuit_check'
  ) THEN
    ALTER TABLE public.seances ADD CONSTRAINT seances_circuit_check
      CHECK (circuit IN ('groupe', 'prive', 'live'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'seances' AND constraint_name = 'seances_type_cours_check'
  ) THEN
    ALTER TABLE public.seances ADD CONSTRAINT seances_type_cours_check
      CHECK (type_cours IN ('presentiel', 'en_ligne', 'domicile'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'seances' AND constraint_name = 'seances_statut_check'
  ) THEN
    ALTER TABLE public.seances ADD CONSTRAINT seances_statut_check
      CHECK (statut IN ('planifiee', 'realisee', 'annulee', 'coach_absent', 'apprenant_absent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'seances' AND constraint_name = 'seances_honoraire_statut_check'
  ) THEN
    ALTER TABLE public.seances ADD CONSTRAINT seances_honoraire_statut_check
      CHECK (honoraire_statut IN ('en_attente', 'valide', 'paye'));
  END IF;
END $$;

-- FK vers tables existantes (conditionnel)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'seances' AND constraint_name = 'seances_groupe_id_fkey'
  ) THEN
    ALTER TABLE public.seances
      ADD CONSTRAINT seances_groupe_id_fkey
      FOREIGN KEY (groupe_id) REFERENCES public.groupes(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'seances' AND constraint_name = 'seances_contrat_prive_id_fkey'
  ) THEN
    ALTER TABLE public.seances
      ADD CONSTRAINT seances_contrat_prive_id_fkey
      FOREIGN KEY (contrat_prive_id) REFERENCES public.contrats_prives(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_seances_coach      ON public.seances(coach_id);
CREATE INDEX IF NOT EXISTS idx_seances_date       ON public.seances(date_seance);
CREATE INDEX IF NOT EXISTS idx_seances_groupe     ON public.seances(groupe_id);
CREATE INDEX IF NOT EXISTS idx_seances_contrat    ON public.seances(contrat_prive_id);
CREATE INDEX IF NOT EXISTS idx_seances_statut     ON public.seances(statut);
CREATE INDEX IF NOT EXISTS idx_seances_hon_statut ON public.seances(honoraire_statut);

ALTER TABLE public.seances DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 2. TABLE CENTRALE : seances_presences
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seances_presences (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seance_id        UUID        NOT NULL REFERENCES public.seances(id) ON DELETE CASCADE,
  apprenant_id     UUID,
  ga_id            UUID,
  nom_apprenant    TEXT        NOT NULL,
  prenom_apprenant TEXT,
  email_apprenant  TEXT,
  statut           TEXT        NOT NULL DEFAULT 'present'
                   CHECK (statut IN ('present', 'absent', 'retard', 'excuse')),
  motif            TEXT,
  note_seance      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.seances_presences ADD COLUMN IF NOT EXISTS apprenant_id     UUID;
ALTER TABLE public.seances_presences ADD COLUMN IF NOT EXISTS ga_id            UUID;
ALTER TABLE public.seances_presences ADD COLUMN IF NOT EXISTS prenom_apprenant TEXT;
ALTER TABLE public.seances_presences ADD COLUMN IF NOT EXISTS email_apprenant  TEXT;
ALTER TABLE public.seances_presences ADD COLUMN IF NOT EXISTS motif            TEXT;
ALTER TABLE public.seances_presences ADD COLUMN IF NOT EXISTS note_seance      TEXT;

CREATE INDEX IF NOT EXISTS idx_sp_seance     ON public.seances_presences(seance_id);
CREATE INDEX IF NOT EXISTS idx_sp_apprenant  ON public.seances_presences(apprenant_id);
CREATE INDEX IF NOT EXISTS idx_sp_ga         ON public.seances_presences(ga_id);

ALTER TABLE public.seances_presences DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 3. LIEN RÉTROCOMPATIBILITÉ
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.groupes_cours
  ADD COLUMN IF NOT EXISTS seance_id UUID REFERENCES public.seances(id) ON DELETE SET NULL;

ALTER TABLE public.groupes_presences
  ADD COLUMN IF NOT EXISTS seance_id UUID REFERENCES public.seances(id) ON DELETE SET NULL;

ALTER TABLE public.seances_privees
  ADD COLUMN IF NOT EXISTS seance_id UUID REFERENCES public.seances(id) ON DELETE SET NULL;

ALTER TABLE public.presences_privees
  ADD COLUMN IF NOT EXISTS seance_id_unifie UUID REFERENCES public.seances(id) ON DELETE SET NULL;

ALTER TABLE public.sessions_live
  ADD COLUMN IF NOT EXISTS seance_id UUID REFERENCES public.seances(id) ON DELETE SET NULL;

ALTER TABLE public.sessions_live
  ADD COLUMN IF NOT EXISTS heure_fin TIME;

-- statut sur sessions_live (conditionnel pour éviter conflit de CHECK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions_live' AND column_name = 'statut'
  ) THEN
    ALTER TABLE public.sessions_live
      ADD COLUMN statut TEXT DEFAULT 'planifiee'
        CHECK (statut IN ('planifiee', 'en_cours', 'terminee', 'annulee'));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 4. TABLE RÉCAP MENSUEL : honoraires_mois
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.honoraires_mois (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID        NOT NULL,
  pa_id         UUID,
  mois          INT         NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee         INT         NOT NULL,
  nb_seances    INT         NOT NULL DEFAULT 0,
  total_heures  NUMERIC(6,2) NOT NULL DEFAULT 0,
  montant_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  statut        TEXT        NOT NULL DEFAULT 'en_attente'
                CHECK (statut IN ('en_attente', 'valide', 'paye')),
  valide_at     TIMESTAMPTZ,
  paye_at       TIMESTAMPTZ,
  note_pa       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coach_id, mois, annee)
);

ALTER TABLE public.honoraires_mois ADD COLUMN IF NOT EXISTS pa_id         UUID;
ALTER TABLE public.honoraires_mois ADD COLUMN IF NOT EXISTS total_heures  NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE public.honoraires_mois ADD COLUMN IF NOT EXISTS note_pa       TEXT;
ALTER TABLE public.honoraires_mois ADD COLUMN IF NOT EXISTS valide_at     TIMESTAMPTZ;
ALTER TABLE public.honoraires_mois ADD COLUMN IF NOT EXISTS paye_at       TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hm_coach   ON public.honoraires_mois(coach_id);
CREATE INDEX IF NOT EXISTS idx_hm_periode ON public.honoraires_mois(annee, mois);

ALTER TABLE public.honoraires_mois DISABLE ROW LEVEL SECURITY;

-- ── honoraires_mois_transmission_paiement_migration.sql  (2026-07-29) ──────────────────────────────
-- Porte côté dash les mêmes garanties déjà en place côté bet-elearning :
-- séparation validation/transmission, suivi de paiement, retenues.
-- La table honoraires_mois n'a aujourd'hui que : statut ('en_attente'|'valide'),
-- pa_id, valide_at, note_pa — rien pour la transmission RH ni le paiement.

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS retenues numeric NOT NULL DEFAULT 0;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS montant_net numeric;

-- Initialise montant_net = montant_total pour les lignes existantes (aucune pour l'instant,
-- table vide en production, mais gardé par sécurité/idempotence).
UPDATE honoraires_mois SET montant_net = montant_total - COALESCE(retenues,0) WHERE montant_net IS NULL;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS valide_par uuid REFERENCES utilisateurs(id);

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS transmis_par uuid REFERENCES utilisateurs(id);

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS transmis_at timestamptz;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS paye_at timestamptz;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS mode_paiement text;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS reference_paiement text;

ALTER TABLE honoraires_mois
  ADD COLUMN IF NOT EXISTS seances_ids uuid[];

-- Élargit la contrainte de statut (si elle existe) pour couvrir tout le cycle de vie.
ALTER TABLE honoraires_mois
  DROP CONSTRAINT IF EXISTS honoraires_mois_statut_check;

ALTER TABLE honoraires_mois
  ADD CONSTRAINT honoraires_mois_statut_check
  CHECK (statut IN ('en_attente', 'valide', 'transmis', 'paye', 'litige'));

