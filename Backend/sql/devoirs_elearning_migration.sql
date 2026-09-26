-- ─────────────────────────────────────────────────────────────────────────────
-- DEVOIRS E-LEARNING
-- Table 1 : devoirs_elearning       — assignation créée par le coach
-- Table 2 : devoirs_rendus_elearning — soumissions des apprenants
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Devoirs assignés par le coach
CREATE TABLE IF NOT EXISTS public.devoirs_elearning (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  classe_id         UUID        NOT NULL REFERENCES public.classes_elearning(id) ON DELETE CASCADE,
  coach_id          UUID        NOT NULL REFERENCES public.utilisateurs(id)      ON DELETE CASCADE,
  contenu_id        UUID        REFERENCES public.contenus_classes_elearning(id) ON DELETE SET NULL,

  titre             TEXT        NOT NULL,
  instructions      TEXT        DEFAULT '',

  -- Format pédagogique
  format_type       TEXT        DEFAULT 'texte_libre'
    CHECK (format_type IN ('texte_libre','qcm','listening','audio','quiz','speaking')),

  -- Type de rendu attendu
  type_rendu        TEXT        DEFAULT 'texte'
    CHECK (type_rendu IN ('fichier','texte','les_deux')),

  -- Ressource externe (listening / audio)
  ressource_url     TEXT        DEFAULT '',

  -- Questions QCM / Quiz (JSONB) : [{texte, options[], correct}]
  questions         JSONB       DEFAULT '[]',

  -- Programmation : ouverture (null = disponible dès la publication)
  date_ouverture    DATE,
  heure_ouverture   TIME        DEFAULT '00:00',

  -- Deadline
  date_limite       DATE,
  heure_limite      TIME        DEFAULT '23:59',

  -- Cycle de vie
  statut            TEXT        DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon','publie')),

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_de_classe  ON public.devoirs_elearning(classe_id);
CREATE INDEX IF NOT EXISTS idx_de_coach   ON public.devoirs_elearning(coach_id);
CREATE INDEX IF NOT EXISTS idx_de_statut  ON public.devoirs_elearning(statut);

ALTER TABLE public.devoirs_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devoirs_all" ON public.devoirs_elearning FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────

-- 2. Rendus des apprenants
CREATE TABLE IF NOT EXISTS public.devoirs_rendus_elearning (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  devoir_id         UUID        NOT NULL REFERENCES public.devoirs_elearning(id)              ON DELETE CASCADE,
  inscription_id    UUID        NOT NULL REFERENCES public.classes_elearning_apprenants(id)   ON DELETE CASCADE,
  classe_id         UUID        NOT NULL REFERENCES public.classes_elearning(id)              ON DELETE CASCADE,

  -- Soumission
  type_soumission   TEXT        CHECK (type_soumission IN ('fichier','texte')),
  contenu_texte     TEXT,
  reponses_qcm      JSONB       DEFAULT '{}',   -- { "0": "réponse choisie", ... }
  fichier_url       TEXT,
  fichier_nom       TEXT,

  -- Cycle de vie
  statut            TEXT        DEFAULT 'a_rendre'
    CHECK (statut IN ('a_rendre','rendu','corrige','en_retard')),

  -- Correction
  note              NUMERIC(5,2),
  note_max          NUMERIC(5,2) DEFAULT 20,
  commentaire_coach TEXT,
  corrige_par       UUID        REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  corrige_at        TIMESTAMPTZ,
  rendu_at          TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(devoir_id, inscription_id)
);

CREATE INDEX IF NOT EXISTS idx_dr_devoir      ON public.devoirs_rendus_elearning(devoir_id);
CREATE INDEX IF NOT EXISTS idx_dr_inscription ON public.devoirs_rendus_elearning(inscription_id);
CREATE INDEX IF NOT EXISTS idx_dr_statut      ON public.devoirs_rendus_elearning(statut);

ALTER TABLE public.devoirs_rendus_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rendus_all" ON public.devoirs_rendus_elearning FOR ALL USING (true) WITH CHECK (true);
