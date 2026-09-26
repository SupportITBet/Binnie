-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `inscriptions_adultes`
-- Généré à partir de 4 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── centres_migration.sql  (2026-05-03) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- STEP 1 : Table centres + centre_id sur toutes les tables client
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Table maître des centres
CREATE TABLE IF NOT EXISTS public.centres (
  id          TEXT PRIMARY KEY,              -- slug: angre, bouake, etc.
  nom         TEXT NOT NULL,
  ville       TEXT NOT NULL,
  adresse     TEXT,
  telephone   TEXT,
  email       TEXT,
  actif       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Données initiales des 6 centres
INSERT INTO public.centres (id, nom, ville, adresse, telephone, email) VALUES
  ('angre',     'BET Angré',        'Abidjan', 'Angré 7ème tranche, près du lycée moderne',               '+225 07 68 55 21 99', 'angre@binniesenglish.com'),
  ('2plateaux', 'BET II Plateaux',  'Abidjan', 'II Plateaux, rue des jardins, à côté de la banque Atlantique', '+225 07 68 55 22 03', '2plateaux@binniesenglish.com'),
  ('yopougon',  'BET Yopougon',     'Abidjan', 'Yopougon, quartier Sicogi, derrière la mairie',           '+225 07 68 55 22 01', 'yopougon@binniesenglish.com'),
  ('koumassi',  'BET Koumassi',     'Abidjan', 'Koumassi, rue des pêcheurs, proche du palais des sports', '+225 07 68 55 22 02', 'koumassi@binniesenglish.com'),
  ('abatta',    'BET Abatta',       'Abidjan', 'Abatta, face station Total',                               '+225 07 68 55 22 00', 'abatta@binniesenglish.com'),
  ('bouake',    'BET Bouaké',       'Bouaké',  'En face de la cité universitaire Sainte Marie, quartier Commerce', '+225 07 68 55 21 98', 'contact@binniesenglish.com')
ON CONFLICT (id) DO NOTHING;

-- 3. Ajout de centre_id sur toutes les tables client
ALTER TABLE public.leads_particuliers
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.inscriptions_adultes
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.inscriptions_enfants
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.inscriptions_etudiants
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.level_test_results
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

-- Tables optionnelles (si elles existent)
ALTER TABLE public.demandes_devis
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.demandes_entreprise
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

ALTER TABLE public.apprenants
  ADD COLUMN IF NOT EXISTS centre_id TEXT REFERENCES public.centres(id);

-- 4. Index pour performances
CREATE INDEX IF NOT EXISTS idx_leads_centre          ON public.leads_particuliers(centre_id);
CREATE INDEX IF NOT EXISTS idx_inscr_adultes_centre  ON public.inscriptions_adultes(centre_id);
CREATE INDEX IF NOT EXISTS idx_inscr_enfants_centre  ON public.inscriptions_enfants(centre_id);
CREATE INDEX IF NOT EXISTS idx_inscr_etudiants_centre ON public.inscriptions_etudiants(centre_id);
CREATE INDEX IF NOT EXISTS idx_contacts_centre       ON public.contacts(centre_id);
CREATE INDEX IF NOT EXISTS idx_level_results_centre  ON public.level_test_results(centre_id);

-- ── inscriptions_adultes_migration.sql  (2026-05-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- TABLE inscriptions_adultes — Demandes de cours adultes
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inscriptions_adultes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet     TEXT        NOT NULL,
  email           TEXT,
  telephone       TEXT        NOT NULL,
  date_naissance  DATE,
  offre_id        UUID,
  offre_titre     TEXT,
  mode_paiement   TEXT,
  niveau_detecte  TEXT,
  statut          TEXT        NOT NULL DEFAULT 'nouveau',
  commercial_id   UUID,
  centre_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colonnes manquantes (si table déjà existante)
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS date_naissance  DATE;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS offre_id        UUID;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS offre_titre     TEXT;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS mode_paiement   TEXT;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS niveau_detecte  TEXT;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS statut          TEXT NOT NULL DEFAULT 'nouveau';
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS commercial_id        UUID;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS centre_id            TEXT;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS date_debut_formation DATE;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS type_client          TEXT DEFAULT 'particulier';
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS profil_type          TEXT DEFAULT 'adulte';
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS nom_parent           TEXT;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS telephone_parent     TEXT;
ALTER TABLE public.inscriptions_adultes ADD COLUMN IF NOT EXISTS email_parent         TEXT;

-- Un dossier Onboarding transmis à l'Agent Placement n'a pas toujours de téléphone
-- NI d'email renseignés (ex: profil entreprise incomplet) — ces deux contraintes
-- NOT NULL (email l'a été ajoutée hors de ce fichier de migration, dérive de schéma
-- constatée en base) faisaient échouer silencieusement l'insertion dans la file de
-- placement : le dossier Onboarding était marqué "transmis" et la notification
-- envoyée quand même, sans que l'apprenant n'apparaisse jamais côté Agent Placement.
ALTER TABLE public.inscriptions_adultes ALTER COLUMN telephone DROP NOT NULL;
ALTER TABLE public.inscriptions_adultes ALTER COLUMN email     DROP NOT NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_inscr_adultes_email     ON public.inscriptions_adultes(email);
CREATE INDEX IF NOT EXISTS idx_inscr_adultes_statut    ON public.inscriptions_adultes(statut);
CREATE INDEX IF NOT EXISTS idx_inscr_adultes_created   ON public.inscriptions_adultes(created_at DESC);

-- Désactiver RLS pour accès backend service_role
ALTER TABLE public.inscriptions_adultes DISABLE ROW LEVEL SECURITY;

-- ── SETUP_PARCOURS_PLACEMENT.sql  (2026-07-02) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════════════════════
-- SETUP COMPLET : Parcours inscription → Onboarding → Placement → Classe
-- À exécuter UNE FOIS dans Supabase SQL Editor (dans l'ordre)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Table inscriptions_elearning ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inscriptions_elearning (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id    UUID        NULL,
  entreprise_nom   TEXT        NULL,
  nom_complet      TEXT        NOT NULL,
  email            TEXT        NULL,
  telephone        TEXT        NULL,
  poste            TEXT        NULL,
  departement      TEXT        NULL,
  langue_souhaitee TEXT        NULL DEFAULT 'Anglais',
  niveau_declare   TEXT        NULL,
  statut           TEXT        NOT NULL DEFAULT 'recu',
  niveau_detecte   TEXT        NULL,
  notes_placement  TEXT        NULL,
  date_test        DATE        NULL,
  classe_id        UUID        NULL REFERENCES public.classes_elearning(id) ON DELETE SET NULL,
  classe_nom       TEXT        NULL,
  date_assignation DATE        NULL,
  source           TEXT        NOT NULL DEFAULT 'entreprise_portail',
  notes_onboarding TEXT        NULL,
  onboarding_id    UUID        NULL,
  placement_id     UUID        NULL,
  pa_id            UUID        NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inscr_el_entreprise ON public.inscriptions_elearning(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_inscr_el_statut     ON public.inscriptions_elearning(statut);
CREATE INDEX IF NOT EXISTS idx_inscr_el_classe     ON public.inscriptions_elearning(classe_id);

CREATE OR REPLACE FUNCTION update_inscriptions_elearning_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inscr_el_updated_at ON public.inscriptions_elearning;
CREATE TRIGGER trg_inscr_el_updated_at
  BEFORE UPDATE ON public.inscriptions_elearning
  FOR EACH ROW EXECUTE FUNCTION update_inscriptions_elearning_updated_at();

ALTER TABLE public.inscriptions_elearning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inscr_el_select" ON public.inscriptions_elearning;
CREATE POLICY "inscr_el_select" ON public.inscriptions_elearning
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "inscr_el_insert" ON public.inscriptions_elearning;
CREATE POLICY "inscr_el_insert" ON public.inscriptions_elearning
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "inscr_el_update" ON public.inscriptions_elearning;
CREATE POLICY "inscr_el_update" ON public.inscriptions_elearning
  FOR UPDATE USING (auth.role() = 'authenticated');


-- ── 2. Colonnes manquantes sur inscriptions_adultes ──────────────────────────
ALTER TABLE public.inscriptions_adultes
  ADD COLUMN IF NOT EXISTS type_client      TEXT DEFAULT 'particulier',
  ADD COLUMN IF NOT EXISTS entreprise_id    UUID,
  ADD COLUMN IF NOT EXISTS entreprise_nom   TEXT,
  ADD COLUMN IF NOT EXISTS notes_placement  TEXT,
  ADD COLUMN IF NOT EXISTS date_test        DATE,
  ADD COLUMN IF NOT EXISTS onboarding_id    UUID;

-- Valeurs de statut étendues pour le parcours placement
-- (statuts existants : nouveau, contacte, inscription_en_cours, inscrit, annule, perdu)
-- Nouveaux statuts pour le parcours e-learning :
-- en_attente_test, test_en_cours, teste, assigne

CREATE INDEX IF NOT EXISTS idx_inscr_adultes_statut_test
  ON public.inscriptions_adultes(statut)
  WHERE statut IN ('en_attente_test', 'test_en_cours', 'teste');

CREATE INDEX IF NOT EXISTS idx_inscr_adultes_onboarding
  ON public.inscriptions_adultes(onboarding_id);


-- ── 3. Table evaluations_elearning (si pas encore créée) ─────────────────────
CREATE TABLE IF NOT EXISTS public.evaluations_elearning (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id                UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  classe_id               UUID REFERENCES classes_elearning(id) ON DELETE SET NULL,
  evaluateur_id           UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  evaluateur_nom          TEXT,
  periode                 TEXT NOT NULL DEFAULT '',
  ponctualite             INTEGER CHECK (ponctualite BETWEEN 1 AND 5),
  qualite_pedagogique     INTEGER CHECK (qualite_pedagogique BETWEEN 1 AND 5),
  satisfaction_apprenants INTEGER CHECK (satisfaction_apprenants BETWEEN 1 AND 5),
  respect_programme       INTEGER CHECK (respect_programme BETWEEN 1 AND 5),
  communication           INTEGER CHECK (communication BETWEEN 1 AND 5),
  note_finale             NUMERIC(3,1),
  rapport                 TEXT,
  points_forts            TEXT,
  axes_amelioration       TEXT,
  statut                  TEXT DEFAULT 'validée' CHECK (statut IN ('validée','planifiée')),
  date_evaluation         TIMESTAMPTZ DEFAULT NOW(),
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_el_coach   ON evaluations_elearning(coach_id);
CREATE INDEX IF NOT EXISTS idx_eval_el_classe  ON evaluations_elearning(classe_id);
CREATE INDEX IF NOT EXISTS idx_eval_el_date    ON evaluations_elearning(date_evaluation DESC);

ALTER TABLE evaluations_elearning ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_full_access_eval_el" ON evaluations_elearning;
CREATE POLICY "admins_full_access_eval_el" ON evaluations_elearning
  FOR ALL USING (true) WITH CHECK (true);

-- ── placement_queue_migration.sql  (2026-07-02) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Migration : colonnes placement test sur inscriptions_adultes
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.inscriptions_adultes
  ADD COLUMN IF NOT EXISTS entreprise_id    UUID,
  ADD COLUMN IF NOT EXISTS entreprise_nom   TEXT,
  ADD COLUMN IF NOT EXISTS notes_placement  TEXT,
  ADD COLUMN IF NOT EXISTS date_test        DATE,
  ADD COLUMN IF NOT EXISTS onboarding_id    UUID;

-- Index pour filtrage rapide par statut (queue placement)
CREATE INDEX IF NOT EXISTS idx_inscr_adultes_statut_test
  ON public.inscriptions_adultes(statut)
  WHERE statut IN ('en_attente_test', 'test_en_cours', 'teste');

