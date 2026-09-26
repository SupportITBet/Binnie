-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `page_views`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── page_views_migration.sql  (2026-07-06) ──────────────────────────────
-- ══════════════════════════════════════════════════
--  Table page_views — Tracking analytics /dash
-- ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.page_views (
  id          BIGSERIAL PRIMARY KEY,
  path        TEXT        NOT NULL,
  label       TEXT,                   -- Nom lisible de la page (ex: "Dashboard SuperAdmin")
  referrer    TEXT,                   -- Page précédente (pour calculer les flux)
  session_id  TEXT        NOT NULL,   -- UUID par session navigateur (sessionStorage)
  duration_ms INT,                    -- Temps passé sur la page précédente (ms)
  user_role   TEXT,                   -- Rôle de l'utilisateur connecté (si dispo)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les requêtes d'agrégation
CREATE INDEX IF NOT EXISTS idx_page_views_path       ON public.page_views (path);
CREATE INDEX IF NOT EXISTS idx_page_views_session    ON public.page_views (session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views (created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_role       ON public.page_views (user_role);

-- RLS : désactivé (endpoint backend sans auth pour le tracking)
ALTER TABLE public.page_views DISABLE ROW LEVEL SECURITY;

