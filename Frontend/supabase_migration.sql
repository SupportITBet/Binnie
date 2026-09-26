-- ═══════════════════════════════════════════════════════════════
-- BINNIE'S ENGLISH TRAINING — Migration Supabase
-- À coller dans : Supabase Dashboard > SQL Editor > New query
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. DEMANDES DE DEVIS ─────────────────────────────────────
-- Reçoit les demandes de devis depuis CourseDetail,
-- CertificationDetail et ServiceDetail (bouton "Demander un devis")
CREATE TABLE IF NOT EXISTS demandes_devis (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  nom           text        NOT NULL,
  email         text        NOT NULL,
  tel           text        NOT NULL,
  entreprise    text,
  participants  text        DEFAULT '1',
  message       text,
  source        text,       -- 'cours' | 'certification' | 'service'
  source_nom    text,       -- nom du cours / certification / service
  statut        text        DEFAULT 'nouveau'  -- 'nouveau' | 'en_cours' | 'traité'
);

-- ─── 2. CONTACTS ──────────────────────────────────────────────
-- Reçoit les messages du formulaire de contact général
CREATE TABLE IF NOT EXISTS contacts (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  nom           text        NOT NULL,
  email         text        NOT NULL,
  telephone     text,
  type          text        DEFAULT 'particulier', -- 'particulier' | 'entreprise'
  sujet         text,
  message       text,
  statut        text        DEFAULT 'nouveau'
);

-- ─── 3. DEMANDES ENTREPRISE ───────────────────────────────────
-- Reçoit les demandes d'audit gratuit / devis corporate
CREATE TABLE IF NOT EXISTS demandes_entreprise (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  entreprise    text        NOT NULL,
  contact       text        NOT NULL,
  email         text        NOT NULL,
  telephone     text        NOT NULL,
  nb_employes   text,
  besoins       text,
  statut        text        DEFAULT 'nouveau'
);

-- ─── 4. LEADS PARTICULIERS ────────────────────────────────────
-- Reçoit les demandes de cours d'essai gratuit (particuliers)
CREATE TABLE IF NOT EXISTS leads_particuliers (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  nom           text        NOT NULL,
  email         text        NOT NULL,
  telephone     text        NOT NULL,
  niveau        text,
  objectif      text,
  statut        text        DEFAULT 'nouveau'
);

-- ─── 5. INSCRIPTIONS ADULTES ──────────────────────────────────
-- Reçoit les inscriptions du programme adultes (18+)
CREATE TABLE IF NOT EXISTS inscriptions_adultes (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now(),
  nom_complet     text        NOT NULL,
  email           text        NOT NULL,
  telephone       text        NOT NULL,
  date_naissance  date,
  offre_id        text,
  offre_titre     text,
  niveau_detecte  text,
  adresse         text,
  statut          text        DEFAULT 'nouveau'
);

-- Ajout colonne adresse si table existante
ALTER TABLE inscriptions_adultes ADD COLUMN IF NOT EXISTS adresse text;

-- ─── 6. INSCRIPTIONS ENFANTS ──────────────────────────────────
-- Reçoit les inscriptions du programme enfants (3-17 ans)
CREATE TABLE IF NOT EXISTS inscriptions_enfants (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now(),
  prenom_enfant       text        NOT NULL,
  nom_enfant          text        NOT NULL,
  date_naissance      date,
  tranche_age         text,
  nom_parent          text        NOT NULL,
  email_parent        text        NOT NULL,
  telephone_parent    text        NOT NULL,
  adresse             text,
  notes               text,
  statut              text        DEFAULT 'nouveau'
);

-- ─── 7. INSCRIPTIONS ÉTUDIANTS ────────────────────────────────
-- Reçoit les inscriptions du programme étudiants (18-25 ans)
CREATE TABLE IF NOT EXISTS inscriptions_etudiants (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now(),
  prenom              text        NOT NULL,
  nom                 text        NOT NULL,
  date_naissance      date,
  email               text        NOT NULL,
  telephone           text        NOT NULL,
  etablissement       text,
  filiere             text,
  annee_etudes        text,
  notes               text,
  consentement_donnees boolean    DEFAULT false,
  statut              text        DEFAULT 'nouveau'
);

-- ─── 8. TESTS DE NIVEAU ───────────────────────────────────────
-- Enregistre les résultats du test de niveau + demandes de bilan
CREATE TABLE IF NOT EXISTS tests_niveau (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now(),
  nom             text,
  email           text        NOT NULL,
  telephone       text,
  score           integer,    -- score en %
  niveau_cefr     text,       -- 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  reponses        jsonb,      -- tableau des réponses
  advisor_choice  text,       -- type de conseiller choisi
  advisor_message text,       -- message envoyé au conseiller
  statut          text        DEFAULT 'nouveau'
);

-- ─── 9. SIMULATEURS DE FORMATION ─────────────────────────────
-- Enregistre les simulations de devis entreprise (multi-step)
CREATE TABLE IF NOT EXISTS simulateurs_formation (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        timestamptz DEFAULT now(),
  -- Entreprise
  nom_entreprise    text        NOT NULL,
  secteur           text,
  nb_employes       text,
  email_contact     text        NOT NULL,
  tel               text,
  -- Spécifications
  niveau_actuel     text,
  niveau_cible      text,
  objectifs         jsonb,      -- tableau des objectifs
  format            text,       -- 'presentiel' | 'ligne' | 'hybride'
  rythme            text,
  groupe            text,
  nb_participants   integer,
  duree_semaines    integer,
  -- Options
  certifications    jsonb,      -- tableau : ['TOEIC', 'IELTS', ...]
  avec_support      boolean     DEFAULT false,
  avec_rapport      boolean     DEFAULT true,
  budget_max        numeric,
  -- Devis
  email_devis       text,
  montant_estime    numeric,
  statut            text        DEFAULT 'nouveau'
);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — autoriser les inserts anonymes
-- (les anon keys du front peuvent insérer, mais pas lire/modifier)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE demandes_devis          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes_entreprise     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_particuliers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscriptions_adultes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscriptions_enfants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscriptions_etudiants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests_niveau            ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulateurs_formation   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert" ON demandes_devis         FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert" ON contacts               FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert" ON demandes_entreprise    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert" ON leads_particuliers     FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert" ON inscriptions_adultes   FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert" ON inscriptions_enfants   FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert" ON inscriptions_etudiants FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert" ON tests_niveau           FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert" ON simulateurs_formation  FOR INSERT TO anon WITH CHECK (true);
