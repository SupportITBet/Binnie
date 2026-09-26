-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `centres`
-- Généré à partir de 3 fichier(s) de migration, dans l'ordre chronologique
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

-- ── parcours_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- PARCOURS BET — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── Table assistantes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistantes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT        NOT NULL,
  prenom          TEXT        NOT NULL,
  email           TEXT,
  telephone       TEXT,
  photo_url       TEXT,
  -- 'en_ligne' | 'presentiel' | 'les_deux'
  type_cours      TEXT        NOT NULL DEFAULT 'les_deux',
  -- NULL pour en_ligne, sinon référence au centre
  centre_id       TEXT        REFERENCES public.centres(id) ON DELETE SET NULL,
  -- 'semaine' (lun-ven) | 'weekend' (sam-dim) | 'les_deux'
  type_semaine    TEXT        NOT NULL DEFAULT 'les_deux',
  -- Quota max de prospects/jour
  quota_jour      INTEGER     NOT NULL DEFAULT 10,
  actif           BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table assignations_parcours ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignations_parcours (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assistante_id       UUID        REFERENCES public.assistantes(id) ON DELETE SET NULL,
  prospect_nom        TEXT        NOT NULL,
  prospect_email      TEXT,
  prospect_telephone  TEXT,
  -- 'en_ligne' | 'presentiel'
  type_cours          TEXT        NOT NULL,
  -- 'groupe' | 'prive' (seulement pour en_ligne)
  type_coaching       TEXT,
  centre_id           TEXT        REFERENCES public.centres(id) ON DELETE SET NULL,
  statut              TEXT        NOT NULL DEFAULT 'en_attente',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Index ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assistantes_actif       ON public.assistantes(actif);
CREATE INDEX IF NOT EXISTS idx_assistantes_type_cours  ON public.assistantes(type_cours);
CREATE INDEX IF NOT EXISTS idx_assistantes_centre      ON public.assistantes(centre_id);
CREATE INDEX IF NOT EXISTS idx_assignations_assistante ON public.assignations_parcours(assistante_id);
CREATE INDEX IF NOT EXISTS idx_assignations_created    ON public.assignations_parcours(created_at DESC);

-- ── Désactiver RLS ───────────────────────────────────────────
ALTER TABLE public.assistantes          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignations_parcours DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- SEED DATA — 2 assistantes par centre + 3 en ligne
-- Adapte les noms/téléphones selon les vraies assistantes
-- ══════════════════════════════════════════════════════════════

-- Assistantes EN LIGNE (groupe + privé)
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour) VALUES
  ('Kouassi',  'Aya',    'aya.kouassi@betlanguages.ci',    '+225 07 11 22 33', 'en_ligne',  NULL, 'les_deux', 10),
  ('Traoré',   'Fanta',  'fanta.traore@betlanguages.ci',   '+225 05 44 55 66', 'en_ligne',  NULL, 'les_deux', 10),
  ('Koffi',    'Adèle',  'adele.koffi@betlanguages.ci',    '+225 01 77 88 99', 'en_ligne',  NULL, 'les_deux', 10)
ON CONFLICT DO NOTHING;

-- Assistantes PRÉSENTIEL — 2 par centre (semaine + weekend)
-- Cabinet 2 Plateaux Mobiles
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Bamba', 'Mariam', 'mariam.bamba@betlanguages.ci', '+225 07 22 33 44', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%plateaux%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Coulibaly', 'Rokia', 'rokia.coulibaly@betlanguages.ci', '+225 05 33 44 55', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%plateaux%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Angré Sicomex
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Diallo', 'Aïssatou', 'aissatou.diallo@betlanguages.ci', '+225 07 44 55 66', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%angré%' OR nom ILIKE '%angre%' OR nom ILIKE '%sicomex%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Soro', 'Karidja', 'karidja.soro@betlanguages.ci', '+225 05 55 66 77', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%angré%' OR nom ILIKE '%angre%' OR nom ILIKE '%sicomex%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Abatta
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Koné', 'Djeneba', 'djeneba.kone@betlanguages.ci', '+225 07 66 77 88', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%abatta%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Touré', 'Salimata', 'salimata.toure@betlanguages.ci', '+225 05 77 88 99', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%abatta%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Koumassi
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Yao', 'Germaine', 'germaine.yao@betlanguages.ci', '+225 07 88 99 00', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%koumassi%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Ouattara', 'Aminata', 'aminata.ouattara@betlanguages.ci', '+225 05 99 00 11', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%koumassi%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Yopougon
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'N''Guessan', 'Adjoua', 'adjoua.nguessan@betlanguages.ci', '+225 07 00 11 22', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%yopougon%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Gbagbo', 'Patricia', 'patricia.gbagbo@betlanguages.ci', '+225 05 11 22 33', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%yopougon%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Bouaké
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Fofana', 'Hawa', 'hawa.fofana@betlanguages.ci', '+225 07 22 33 45', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%bouak%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Doumbia', 'Natacha', 'natacha.doumbia@betlanguages.ci', '+225 05 33 44 56', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%bouak%' LIMIT 1
ON CONFLICT DO NOTHING;

-- ── centres_patch.sql  (2026-07-02) ──────────────────────────────
-- Patch : colonnes manquantes sur la table centres
ALTER TABLE public.centres ADD COLUMN IF NOT EXISTS couleur    TEXT DEFAULT '#0891B2';
ALTER TABLE public.centres ADD COLUMN IF NOT EXISTS key_local  TEXT;

-- Mettre à jour les key_local depuis les id existants (si pas encore définis)
UPDATE public.centres SET key_local = id WHERE key_local IS NULL;

-- Désactiver RLS
ALTER TABLE public.centres DISABLE ROW LEVEL SECURITY;

