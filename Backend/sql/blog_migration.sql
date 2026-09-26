-- ══════════════════════════════════════════════════════════════
-- BLOG : Table articles_blog + commentaires_blog
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.articles_blog (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titre       TEXT        NOT NULL,
  extrait     TEXT,
  contenu     TEXT,
  categorie   TEXT        NOT NULL DEFAULT 'Actualités',
  image_url   TEXT,
  auteur      TEXT        NOT NULL DEFAULT 'Admin',
  read_time   TEXT,
  publie      BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commentaires_blog (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  UUID        NOT NULL REFERENCES public.articles_blog(id) ON DELETE CASCADE,
  nom         TEXT        NOT NULL,
  email       TEXT,
  commentaire TEXT        NOT NULL,
  approuve    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_articles_blog_publie    ON public.articles_blog(publie);
CREATE INDEX IF NOT EXISTS idx_articles_blog_categorie ON public.articles_blog(categorie);
CREATE INDEX IF NOT EXISTS idx_commentaires_article    ON public.commentaires_blog(article_id);
CREATE INDEX IF NOT EXISTS idx_commentaires_approuve   ON public.commentaires_blog(approuve);

-- Colonnes media
ALTER TABLE public.commentaires_blog ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.articles_blog     ADD COLUMN IF NOT EXISTS video_url  TEXT;
ALTER TABLE public.articles_blog     ADD COLUMN IF NOT EXISTS images     JSONB DEFAULT '[]';

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_articles_blog_updated ON public.articles_blog;
CREATE TRIGGER trg_articles_blog_updated
  BEFORE UPDATE ON public.articles_blog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
