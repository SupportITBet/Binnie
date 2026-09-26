-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `fichiers_classes_elearning`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── fichiers_classes_elearning_migration.sql  (2026-07-02) ──────────────────────────────
-- Fichiers partagés par le coach à sa classe e-learning
-- À exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.fichiers_classes_elearning (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id  UUID        NOT NULL REFERENCES public.classes_elearning(id) ON DELETE CASCADE,
  coach_id   UUID        NOT NULL,
  nom        TEXT        NOT NULL,
  url        TEXT        NOT NULL,
  public_id  TEXT        NULL,
  categorie  TEXT        NOT NULL DEFAULT 'autre',  -- cours | exercice | audio | ressource | autre
  taille_ko  INTEGER     NULL,
  visible    BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fce_classe ON public.fichiers_classes_elearning(classe_id);
CREATE INDEX IF NOT EXISTS idx_fce_coach  ON public.fichiers_classes_elearning(coach_id);

ALTER TABLE public.fichiers_classes_elearning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fce_select" ON public.fichiers_classes_elearning;
CREATE POLICY "fce_select" ON public.fichiers_classes_elearning
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "fce_insert" ON public.fichiers_classes_elearning;
CREATE POLICY "fce_insert" ON public.fichiers_classes_elearning
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "fce_update" ON public.fichiers_classes_elearning;
CREATE POLICY "fce_update" ON public.fichiers_classes_elearning
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "fce_delete" ON public.fichiers_classes_elearning;
CREATE POLICY "fce_delete" ON public.fichiers_classes_elearning
  FOR DELETE USING (auth.role() = 'authenticated');

