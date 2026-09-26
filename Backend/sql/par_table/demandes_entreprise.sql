-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `demandes_entreprise`
-- Généré à partir de 2 fichier(s) de migration, dans l'ordre chronologique
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

-- ── CONSOLIDATION_assignations_parcours.sql  (2026-06-19) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════════
-- CONSOLIDATION — assignations_parcours & tables liées
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
-- Toutes les instructions utilisent IF NOT EXISTS / IF EXISTS
-- → sans danger si les migrations partielles ont déjà été jouées
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Table assistantes (profil B2B) ───────────────────────────
ALTER TABLE public.assistantes
  ADD COLUMN IF NOT EXISTS jours_travail TEXT[],
  ADD COLUMN IF NOT EXISTS profil TEXT NOT NULL DEFAULT 'b2c'
    CHECK (profil IN ('b2c', 'b2b', 'les_deux')),
  ADD COLUMN IF NOT EXISTS onboarding_id UUID;

-- Remplir jours_travail depuis type_semaine si vide
UPDATE public.assistantes
SET jours_travail = '{lundi,mardi,mercredi,jeudi,vendredi}'
WHERE type_semaine = 'semaine' AND jours_travail IS NULL;

UPDATE public.assistantes
SET jours_travail = '{samedi,dimanche}'
WHERE type_semaine = 'weekend' AND jours_travail IS NULL;

UPDATE public.assistantes
SET jours_travail = '{lundi,mardi,mercredi,jeudi,vendredi,samedi,dimanche}'
WHERE type_semaine = 'les_deux' AND jours_travail IS NULL;

-- ── 2. Table assignations_parcours — toutes les colonnes ────────
ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS source           TEXT,
  ADD COLUMN IF NOT EXISTS inscription_offre TEXT,
  ADD COLUMN IF NOT EXISTS montant_paye     INTEGER,
  ADD COLUMN IF NOT EXISTS niveau_client    TEXT,
  ADD COLUMN IF NOT EXISTS objectif_client  TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS profil_type      TEXT DEFAULT 'adulte',
  ADD COLUMN IF NOT EXISTS nom_parent       TEXT,
  ADD COLUMN IF NOT EXISTS telephone_parent TEXT,
  ADD COLUMN IF NOT EXISTS email_parent     TEXT,
  ADD COLUMN IF NOT EXISTS routing_statut   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pa_advisor_id    UUID,
  ADD COLUMN IF NOT EXISTS suivi_demarrage  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suivi_presences  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_paiement    JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS statut_paiement  TEXT DEFAULT 'en_attente',
  ADD COLUMN IF NOT EXISTS mode_paiement    TEXT,
  ADD COLUMN IF NOT EXISTS date_debut_formation DATE,
  ADD COLUMN IF NOT EXISTS documents_dossier JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS notes_coach      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

-- ── 3. Table demandes_entreprise — colonnes supplémentaires ─────
ALTER TABLE public.demandes_entreprise
  ADD COLUMN IF NOT EXISTS commercial_id     UUID,
  ADD COLUMN IF NOT EXISTS centre_id         TEXT,
  ADD COLUMN IF NOT EXISTS notes_commercial  TEXT;

-- ── 3b. Table simulateurs_formation — colonnes supplémentaires ──
ALTER TABLE public.simulateurs_formation
  ADD COLUMN IF NOT EXISTS centre            TEXT,
  ADD COLUMN IF NOT EXISTS notes_commercial  TEXT;

-- ── 4. RLS : assistantes (service role seulement) ───────────────
ALTER TABLE public.assistantes           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignations_parcours DISABLE ROW LEVEL SECURITY;

-- ── 5. Index utiles ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assistantes_profil     ON public.assistantes(profil);
CREATE INDEX IF NOT EXISTS idx_assignations_source    ON public.assignations_parcours(source);
CREATE INDEX IF NOT EXISTS idx_assignations_statut    ON public.assignations_parcours(statut);
CREATE INDEX IF NOT EXISTS idx_assignations_email     ON public.assignations_parcours(prospect_email);

-- ══════════════════════════════════════════════════════════════════
-- VÉRIFICATION FINALE
-- Après exécution, lancez cette requête pour confirmer :
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'assignations_parcours'
-- ORDER BY ordinal_position;
-- ══════════════════════════════════════════════════════════════════

