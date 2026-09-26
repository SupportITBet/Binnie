-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `paiements_parcours`
-- Généré à partir de 3 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── paiements_parcours_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Nouvelle table paiements_parcours (indépendante de l'ancienne)
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS paiements_parcours (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id   UUID        NOT NULL,
  client          TEXT        NOT NULL,
  email           TEXT,
  telephone       TEXT,
  inscription     TEXT,
  montant_du      NUMERIC     NOT NULL DEFAULT 0,
  montant_recu    NUMERIC     NOT NULL DEFAULT 0,
  date_paiement   DATE        NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement   TEXT        NOT NULL DEFAULT 'Mobile Money',
  statut          TEXT        NOT NULL DEFAULT 'en_attente',
  ref_transaction TEXT,
  notes           TEXT,
  assignation_id  UUID        REFERENCES assignations_parcours(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_commercial   ON paiements_parcours(commercial_id);
CREATE INDEX IF NOT EXISTS idx_pp_assignation  ON paiements_parcours(assignation_id);
CREATE INDEX IF NOT EXISTS idx_pp_date         ON paiements_parcours(date_paiement DESC);

ALTER TABLE paiements_parcours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_select ON paiements_parcours;
CREATE POLICY pp_select ON paiements_parcours FOR SELECT USING (commercial_id = auth.uid());

DROP POLICY IF EXISTS pp_insert ON paiements_parcours;
CREATE POLICY pp_insert ON paiements_parcours FOR INSERT WITH CHECK (commercial_id = auth.uid());

DROP POLICY IF EXISTS pp_update ON paiements_parcours;
CREATE POLICY pp_update ON paiements_parcours FOR UPDATE USING (commercial_id = auth.uid());

DROP POLICY IF EXISTS pp_delete ON paiements_parcours;
CREATE POLICY pp_delete ON paiements_parcours FOR DELETE USING (commercial_id = auth.uid());

-- ── preuve_documents_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Ajout preuve_image sur paiements_parcours
-- + documents_dossier sur assignations_parcours
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Preuve de paiement (URL Supabase Storage) pour chèque, RIA, MoneyGram, etc.
ALTER TABLE paiements_parcours
  ADD COLUMN IF NOT EXISTS preuve_image TEXT;

-- 2. Documents du dossier de l'apprenant (URLs Supabase Storage)
--    Format : [{"nom":"Pièce d'identité","type":"id","url":"https://...","chemin":"assignation-id/id-123.jpg","taille":245678,"mimetype":"image/jpeg"}]
ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS documents_dossier JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ══════════════════════════════════════════════════════════════
-- BUCKET SUPABASE STORAGE À CRÉER MANUELLEMENT
-- Supabase Dashboard > Storage > New bucket
-- ══════════════════════════════════════════════════════════════
-- Nom du bucket  : dossiers-apprenants
-- Public         : OUI  (pour que les URLs publiques fonctionnent)
-- Taille max     : 20 Mo par fichier
--
-- Politique RLS Storage (à configurer dans Storage > Policies) :
-- SELECT (lecture publique) : true
-- INSERT / UPDATE / DELETE  : auth.role() = 'authenticated'
-- ══════════════════════════════════════════════════════════════

-- ── paiements_offre_migration.sql  (2026-05-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- MIGRATION : Ajout colonne offre à paiements_parcours
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.paiements_parcours
  ADD COLUMN IF NOT EXISTS offre TEXT;

COMMENT ON COLUMN public.paiements_parcours.offre IS
  'Formation choisie lors du paiement (ex: Anglais Pro B2, Certification TOEIC…)';

