-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `apprenants`
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

-- ── temoignages_migration.sql  (2026-05-08) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- TÉMOIGNAGES — certifications + temoignages  (version clean)
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- 0. Nettoyage (repart de zéro proprement)
-- ─────────────────────────────────────────
DROP VIEW  IF EXISTS public.v_temoignages_attente;
DROP TABLE IF EXISTS public.temoignages    CASCADE;
DROP TABLE IF EXISTS public.certifications CASCADE;

-- ─────────────────────────────────────────
-- 1. Table apprenants (si elle n'existe pas)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apprenants (
  id         UUID        PRIMARY KEY,
  email      TEXT        UNIQUE NOT NULL,
  nom        TEXT,
  prenom     TEXT,
  telephone  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- 2. TABLE CERTIFICATIONS
-- ─────────────────────────────────────────
CREATE TABLE public.certifications (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  apprenant_id   UUID        NOT NULL REFERENCES public.apprenants(id) ON DELETE CASCADE,
  cert_type      TEXT        NOT NULL,
  score          TEXT,
  date_obtention DATE        NOT NULL DEFAULT CURRENT_DATE,
  centre_id      TEXT,
  valide         BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_certif_apprenant ON public.certifications(apprenant_id);
CREATE INDEX idx_certif_valide    ON public.certifications(valide);

-- ─────────────────────────────────────────
-- 3. TABLE TEMOIGNAGES
-- ─────────────────────────────────────────
CREATE TABLE public.temoignages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom              TEXT        NOT NULL,
  role             TEXT,
  score            TEXT,
  texte            TEXT        NOT NULL,
  avatar           TEXT        NOT NULL DEFAULT '🎓',
  couleur          TEXT        NOT NULL DEFAULT '#1e4080',
  etoiles          INT         NOT NULL DEFAULT 5 CHECK (etoiles BETWEEN 1 AND 5),
  statut           TEXT        NOT NULL DEFAULT 'en_attente'
                               CHECK (statut IN ('en_attente','actif','rejete')),
  source           TEXT        NOT NULL DEFAULT 'admin'
                               CHECK (source IN ('admin','apprenant')),
  motif_rejet      TEXT,
  actif            BOOLEAN     NOT NULL DEFAULT false,
  ordre            INT         NOT NULL DEFAULT 0,
  apprenant_id     UUID        REFERENCES public.apprenants(id)    ON DELETE SET NULL,
  certification_id UUID        REFERENCES public.certifications(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_temo_statut    ON public.temoignages(statut);
CREATE INDEX idx_temo_actif     ON public.temoignages(actif);
CREATE INDEX idx_temo_ordre     ON public.temoignages(ordre);
CREATE INDEX idx_temo_apprenant ON public.temoignages(apprenant_id);

-- ─────────────────────────────────────────
-- 4. Trigger updated_at
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_temoignages_updated
  BEFORE UPDATE ON public.temoignages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────
ALTER TABLE public.temoignages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "temo_read_actif" ON public.temoignages
  FOR SELECT USING (actif = true AND statut = 'actif');

CREATE POLICY "temo_service_all" ON public.temoignages
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "certif_service_all" ON public.certifications
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────
-- 6. Vue témoignages en attente
-- ─────────────────────────────────────────
CREATE VIEW public.v_temoignages_attente AS
  SELECT
    t.id, t.nom, t.role, t.score, t.texte, t.etoiles,
    t.statut, t.source, t.created_at,
    a.nom   AS apprenant_nom,
    a.email AS apprenant_email,
    c.cert_type       AS certification_type,
    c.score           AS certification_score,
    c.date_obtention
  FROM public.temoignages t
  LEFT JOIN public.apprenants    a ON a.id = t.apprenant_id
  LEFT JOIN public.certifications c ON c.id = t.certification_id
  WHERE t.statut = 'en_attente'
  ORDER BY t.created_at DESC;

-- ─────────────────────────────────────────
-- 7. Données initiales
-- ─────────────────────────────────────────
INSERT INTO public.temoignages
  (nom, role, score, texte, avatar, couleur, etoiles, statut, source, actif, ordre)
VALUES
  ('Awa Koné',        'Étudiante en droit',         'TOEIC 850',
   'En 3 mois j''ai décroché 850 au TOEIC. Les méthodes sont vraiment efficaces et le suivi personnalisé fait toute la différence. Je recommande à 100% !',
   '👩🏾‍⚖️', '#d97706', 5, 'actif', 'admin', true, 1),

  ('Kouamé Brou',     'Directeur Commercial · NSIA','IELTS 7.5',
   'La formation entreprise a transformé notre relation client internationale. Nos équipes communiquent maintenant avec confiance en anglais.',
   '👨🏿‍💼', '#0891b2', 5, 'actif', 'admin', true, 2),

  ('Fatoumata Diallo','Ingénieure IT · MTN CI',     'TOEFL 104',
   'Préparé mon TOEFL en ligne depuis Abidjan. Les corrections rapides et la disponibilité des profs m''ont permis d''atteindre mon score cible.',
   '👩🏽‍💻', '#1e4080', 5, 'actif', 'admin', true, 3),

  ('Sonia Ravin',     'Étudiante · Université HEC', 'TOEIC 920',
   'Programme d''immersion qui a littéralement changé ma vie. 920 points au TOEIC — des portes que je croyais fermées se sont ouvertes.',
   '👨🏽‍🎓', '#e93747', 5, 'actif', 'admin', true, 4);

-- ─────────────────────────────────────────
-- 8. Fonction utilitaire
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apprenant_peut_temoigner(p_apprenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.certifications
    WHERE apprenant_id = p_apprenant_id AND valide = true
  );
$$;

