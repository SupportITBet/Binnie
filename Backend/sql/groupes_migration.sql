-- ══════════════════════════════════════════════════════════════
-- GROUPES & APPRENANTS — Migration BET
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── Groupes de cours ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom           TEXT        NOT NULL,
  niveau        TEXT,
  filiere       TEXT,
  type_cours    TEXT        NOT NULL DEFAULT 'en_ligne',
  coach_id      UUID,
  centre_id     UUID,
  horaire       JSONB       DEFAULT '[]',
  date_debut    DATE,
  date_fin      DATE,
  statut        TEXT        NOT NULL DEFAULT 'actif',
  capacite_max  INT         DEFAULT 20,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID
);

ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS nom          TEXT;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS niveau       TEXT;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS filiere      TEXT;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS type_cours   TEXT NOT NULL DEFAULT 'en_ligne';
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS coach_id     UUID;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS centre_id    UUID;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS horaire      JSONB DEFAULT '[]';
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS date_debut   DATE;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS date_fin     DATE;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS statut       TEXT NOT NULL DEFAULT 'actif';
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS capacite_max INT  DEFAULT 20;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS created_by   UUID;

-- ── Apprenants dans les groupes (pivot) ────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes_apprenants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id       UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  apprenant_id    TEXT,
  nom_apprenant   TEXT        NOT NULL,
  prenom_apprenant TEXT,
  email_apprenant TEXT,
  telephone       TEXT,
  niveau          TEXT,
  date_ajout      TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_retrait    TIMESTAMPTZ,
  statut          TEXT        NOT NULL DEFAULT 'actif',
  added_by        UUID,
  note            TEXT
);

ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS apprenant_id     TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS prenom_apprenant  TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS email_apprenant   TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS telephone         TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS niveau            TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS date_retrait      TIMESTAMPTZ;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS added_by          UUID;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS note              TEXT;

-- ── Fichiers partagés dans les groupes ────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes_fichiers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id    UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  coach_id     UUID,
  nom          TEXT        NOT NULL,
  url          TEXT        NOT NULL,
  public_id    TEXT,
  type_fichier TEXT        DEFAULT 'autre',
  taille_ko    INT,
  visible      BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.groupes_fichiers ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT true;

-- ── Index ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_groupes_coach   ON public.groupes(coach_id);
CREATE INDEX IF NOT EXISTS idx_groupes_statut  ON public.groupes(statut);
CREATE INDEX IF NOT EXISTS idx_ga_groupe       ON public.groupes_apprenants(groupe_id);
CREATE INDEX IF NOT EXISTS idx_ga_statut       ON public.groupes_apprenants(statut);
CREATE INDEX IF NOT EXISTS idx_gf_groupe       ON public.groupes_fichiers(groupe_id);

-- ── centre_id en TEXT (clé textuelle type "angre", "cocody"…) ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groupes'
      AND column_name = 'centre_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.groupes ALTER COLUMN centre_id TYPE TEXT USING centre_id::TEXT;
  END IF;
END $$;

-- ── Traçabilité : nom lisible du créateur ──────────────────────
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS created_by_nom TEXT;

-- ── RLS désactivé (accès service_role depuis backend) ─────────
ALTER TABLE public.groupes           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupes_apprenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupes_fichiers  DISABLE ROW LEVEL SECURITY;

-- ── Présences par séance ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes_presences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id       UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  ga_id           UUID,                          -- groupes_apprenants.id
  nom_apprenant   TEXT        NOT NULL,
  prenom_apprenant TEXT,
  date_seance     DATE        NOT NULL,
  statut          TEXT        NOT NULL DEFAULT 'present', -- present | absent | retard | excuse
  note            TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_groupe   ON public.groupes_presences(groupe_id);
CREATE INDEX IF NOT EXISTS idx_gp_date     ON public.groupes_presences(date_seance);
ALTER TABLE public.groupes_presences DISABLE ROW LEVEL SECURITY;

-- ── Historique des cours par groupe ───────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes_cours (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id       UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  coach_id        UUID,
  date_cours      DATE        NOT NULL,
  objectif        TEXT,
  grammaire       TEXT,
  sujet_discussion TEXT,
  statut          TEXT        NOT NULL DEFAULT 'dispense',
  -- dispense | annule | apprenant_absent | coach_absent | catch_up | holiday
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gc_groupe ON public.groupes_cours(groupe_id);
CREATE INDEX IF NOT EXISTS idx_gc_date   ON public.groupes_cours(date_cours DESC);
ALTER TABLE public.groupes_cours DISABLE ROW LEVEL SECURITY;
