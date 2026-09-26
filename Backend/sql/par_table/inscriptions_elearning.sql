-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `inscriptions_elearning`
-- Généré à partir de 5 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

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

-- ── date_naissance_elearning_migration.sql  (2026-07-02) ──────────────────────────────
-- Ajout de date_naissance dans le parcours e-learning entreprise
-- À exécuter dans Supabase SQL Editor

ALTER TABLE public.inscriptions_elearning
  ADD COLUMN IF NOT EXISTS date_naissance DATE NULL;

ALTER TABLE public.classes_elearning_apprenants
  ADD COLUMN IF NOT EXISTS date_naissance DATE NULL;

-- ── inscriptions_elearning_migration.sql  (2026-07-02) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Migration : inscriptions_elearning
-- Parcours d'inscription entreprise → Onboarding → Placement → Classe
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inscriptions_elearning (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entreprise source
  entreprise_id    UUID        NULL,
  entreprise_nom   TEXT        NULL,

  -- Bénéficiaire
  nom_complet      TEXT        NOT NULL,
  email            TEXT        NULL,
  telephone        TEXT        NULL,
  poste            TEXT        NULL,
  departement      TEXT        NULL,
  langue_souhaitee TEXT        NULL DEFAULT 'Anglais',
  niveau_declare   TEXT        NULL,          -- niveau auto-déclaré par l'entreprise

  -- Statut du parcours
  -- recu → verifie → transmis_placement → teste → assigne → actif
  statut           TEXT        NOT NULL DEFAULT 'recu',

  -- Résultats placement
  niveau_detecte   TEXT        NULL,          -- niveau après test
  notes_placement  TEXT        NULL,
  date_test        DATE        NULL,

  -- Assignation classe
  classe_id        UUID        NULL REFERENCES public.classes_elearning(id) ON DELETE SET NULL,
  classe_nom       TEXT        NULL,
  date_assignation DATE        NULL,

  -- Traçabilité
  source           TEXT        NOT NULL DEFAULT 'entreprise_portail', -- entreprise_portail | onboarding_manuel | onboarding_excel
  notes_onboarding TEXT        NULL,
  onboarding_id    UUID        NULL,          -- utilisateurs.id de l'agent onboarding
  placement_id     UUID        NULL,          -- utilisateurs.id de l'agent placement
  pa_id            UUID        NULL,          -- utilisateurs.id du PA advisor

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

-- ── inscriptions_elearning_parent_migration.sql  (2026-07-03) ──────────────────────────────
-- Migration : ajout colonnes parent + enfant dans inscriptions_elearning ET classes_elearning_apprenants
-- À exécuter dans Supabase SQL Editor

-- 1. inscriptions_elearning
ALTER TABLE public.inscriptions_elearning
  ADD COLUMN IF NOT EXISTS prenom_parent      TEXT    NULL,
  ADD COLUMN IF NOT EXISTS nom_parent         TEXT    NULL,
  ADD COLUMN IF NOT EXISTS email_parent       TEXT    NULL,
  ADD COLUMN IF NOT EXISTS telephone_parent   TEXT    NULL,
  ADD COLUMN IF NOT EXISTS classe             TEXT    NULL,  -- classe scolaire (CM1, 6ème...)
  ADD COLUMN IF NOT EXISTS niveau_cecr_estime TEXT    NULL,  -- niveau estimé (A1, A2, B1...)
  ADD COLUMN IF NOT EXISTS profil_type        TEXT    NULL DEFAULT 'adulte',  -- adulte | enfant | ado
  ADD COLUMN IF NOT EXISTS etablissement      TEXT    NULL;  -- établissement scolaire (profil ado)

COMMENT ON COLUMN public.inscriptions_elearning.prenom_parent      IS 'Prénom du parent/tuteur (profil enfant/ado)';
COMMENT ON COLUMN public.inscriptions_elearning.nom_parent         IS 'Nom du parent/tuteur';
COMMENT ON COLUMN public.inscriptions_elearning.email_parent       IS 'Email du parent/tuteur — utilisé pour le compte parent';
COMMENT ON COLUMN public.inscriptions_elearning.telephone_parent   IS 'Téléphone du parent/tuteur';
COMMENT ON COLUMN public.inscriptions_elearning.classe             IS 'Classe scolaire de l''enfant (CP, CE1, CE2, CM1, CM2, 6ème...)';
COMMENT ON COLUMN public.inscriptions_elearning.niveau_cecr_estime IS 'Niveau CECR estimé par l''entreprise/parent (A1, A2, B1, B2)';
COMMENT ON COLUMN public.inscriptions_elearning.profil_type        IS 'adulte | enfant | ado';
COMMENT ON COLUMN public.inscriptions_elearning.etablissement      IS 'Établissement scolaire (profil ado)';

-- 2. classes_elearning_apprenants — mêmes champs pour propagation au moment de l'assignation
ALTER TABLE public.classes_elearning_apprenants
  ADD COLUMN IF NOT EXISTS prenom_parent      TEXT    NULL,
  ADD COLUMN IF NOT EXISTS nom_parent         TEXT    NULL,
  ADD COLUMN IF NOT EXISTS email_parent       TEXT    NULL,
  ADD COLUMN IF NOT EXISTS telephone_parent   TEXT    NULL,
  ADD COLUMN IF NOT EXISTS classe             TEXT    NULL,
  ADD COLUMN IF NOT EXISTS niveau_cecr_estime TEXT    NULL,
  ADD COLUMN IF NOT EXISTS profil_type        TEXT    NULL DEFAULT 'adulte';

-- 3. Backfill classes_elearning_apprenants depuis inscriptions_elearning (jointure email)
UPDATE public.classes_elearning_apprenants AS cea
SET
  prenom_parent      = ie.prenom_parent,
  nom_parent         = ie.nom_parent,
  email_parent       = ie.email_parent,
  telephone_parent   = ie.telephone_parent,
  classe             = ie.classe,
  niveau_cecr_estime = ie.niveau_cecr_estime,
  profil_type        = COALESCE(ie.profil_type, 'adulte'),
  date_naissance     = COALESCE(cea.date_naissance, ie.date_naissance)
FROM public.inscriptions_elearning ie
WHERE LOWER(cea.email) = LOWER(ie.email)
  AND ie.email IS NOT NULL
  AND cea.email IS NOT NULL;

-- ── update_date_naissance_enfants.sql  (2026-07-03) ──────────────────────────────
-- Mise à jour des dates de naissance (profil enfant 6-12 ans) pour les 10 bénéficiaires
-- Table principale : classes_elearning_apprenants

UPDATE classes_elearning_apprenants
SET date_naissance = CASE
  WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN '2016-03-14'::date  -- Fatou Diallo, 10 ans
  WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN '2017-07-22'::date  -- Seydou Bamba, 9 ans
  WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN '2015-11-05'::date  -- Lucas N'Guessan, 11 ans
  WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN '2018-04-30'::date  -- Aminata Koné, 8 ans
  WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN '2014-09-18'::date  -- Ibrahim Traoré, 12 ans
  WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN '2019-01-09'::date  -- Yann Aboua, 7 ans
  WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN '2016-06-27'::date  -- Hawa Sanogo, 10 ans
  WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN '2017-12-03'::date  -- Kofi Mensah, 9 ans
  WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN '2020-02-15'::date  -- Chloé Coulibaly, 6 ans
  WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN '2015-08-11'::date  -- Marie Ouattara, 11 ans
END
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr',
  'lamine.bamba@outlook.com',
  'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com',
  'moussa.traore@orange.ci',
  'paul.aboua@email.ci',
  'f.sanogo@gmail.com',
  'kwame.mensah@yahoo.fr',
  'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
);

-- Mettre à jour aussi dans inscriptions_elearning (source)
UPDATE inscriptions_elearning
SET date_naissance = CASE
  WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN '2016-03-14'::date
  WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN '2017-07-22'::date
  WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN '2015-11-05'::date
  WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN '2018-04-30'::date
  WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN '2014-09-18'::date
  WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN '2019-01-09'::date
  WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN '2016-06-27'::date
  WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN '2017-12-03'::date
  WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN '2020-02-15'::date
  WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN '2015-08-11'::date
END
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr',
  'lamine.bamba@outlook.com',
  'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com',
  'moussa.traore@orange.ci',
  'paul.aboua@email.ci',
  'f.sanogo@gmail.com',
  'kwame.mensah@yahoo.fr',
  'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Coordonnées parents + profil_type = 'enfant' (classes_elearning_apprenants)
-- Les emails enregistrés étant déjà ceux des parents (enfants 6-12 ans),
-- email_parent = email du dossier.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE classes_elearning_apprenants
SET
  profil_type        = 'enfant',
  prenom_parent      = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN 'Kadiatou'     -- mère de Fatou Diallo
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN 'Lamine'       -- père de Seydou Bamba
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN 'Henri'        -- père de Lucas N''Guessan
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN 'Djénéba'      -- mère d''Aminata Koné
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN 'Moussa'       -- père d''Ibrahim Traoré
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN 'Paul'         -- père de Yann Aboua
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN 'Fatoumata'    -- mère de Hawa Sanogo
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN 'Kwame'        -- père de Kofi Mensah
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN 'Mariam'       -- mère de Chloé Coulibaly
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN 'Awa'          -- mère de Marie Ouattara
  END,
  nom_parent         = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN 'Diallo'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN 'Bamba'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN 'N''Guessan'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN 'Koné'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN 'Traoré'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN 'Aboua'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN 'Sanogo'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN 'Mensah'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN 'Coulibaly'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN 'Ouattara'
  END,
  email_parent       = email,   -- l'email enregistré appartient au parent
  telephone_parent   = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN '+225 07 11 23 45 67'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN '+225 05 44 56 78 90'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN '+225 01 77 89 01 23'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN '+225 07 22 34 56 78'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN '+225 08 55 67 89 01'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN '+225 05 88 90 12 34'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN '+225 06 33 45 67 89'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN '+225 07 66 78 90 12'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN '+225 01 99 01 23 45'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN '+225 05 44 56 78 91'
  END
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr',
  'lamine.bamba@outlook.com',
  'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com',
  'moussa.traore@orange.ci',
  'paul.aboua@email.ci',
  'f.sanogo@gmail.com',
  'kwame.mensah@yahoo.fr',
  'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
);

-- Synchroniser aussi dans inscriptions_elearning
UPDATE inscriptions_elearning
SET
  profil_type        = 'enfant',
  prenom_parent      = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN 'Kadiatou'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN 'Lamine'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN 'Henri'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN 'Djénéba'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN 'Moussa'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN 'Paul'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN 'Fatoumata'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN 'Kwame'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN 'Mariam'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN 'Awa'
  END,
  nom_parent         = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN 'Diallo'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN 'Bamba'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN 'N''Guessan'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN 'Koné'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN 'Traoré'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN 'Aboua'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN 'Sanogo'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN 'Mensah'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN 'Coulibaly'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN 'Ouattara'
  END,
  email_parent       = email,
  telephone_parent   = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN '+225 07 11 23 45 67'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN '+225 05 44 56 78 90'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN '+225 01 77 89 01 23'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN '+225 07 22 34 56 78'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN '+225 08 55 67 89 01'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN '+225 05 88 90 12 34'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN '+225 06 33 45 67 89'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN '+225 07 66 78 90 12'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN '+225 01 99 01 23 45'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN '+225 05 44 56 78 91'
  END
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr',
  'lamine.bamba@outlook.com',
  'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com',
  'moussa.traore@orange.ci',
  'paul.aboua@email.ci',
  'f.sanogo@gmail.com',
  'kwame.mensah@yahoo.fr',
  'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification finale
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  nom_complet,
  email,
  date_naissance,
  DATE_PART('year', AGE(date_naissance::date)) AS age_calcule,
  profil_type,
  prenom_parent || ' ' || nom_parent            AS parent_nom_complet,
  email_parent,
  telephone_parent
FROM classes_elearning_apprenants
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr', 'lamine.bamba@outlook.com', 'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com', 'moussa.traore@orange.ci', 'paul.aboua@email.ci',
  'f.sanogo@gmail.com', 'kwame.mensah@yahoo.fr', 'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
)
ORDER BY age_calcule;

