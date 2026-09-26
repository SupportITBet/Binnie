-- ══════════════════════════════════════════════════════════════
-- TABLE tickets — Support client Customer Care (email/whatsapp/chat)
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tickets (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            BIGSERIAL,
  sujet             TEXT        NOT NULL,
  description       TEXT,
  canal             TEXT        NOT NULL DEFAULT 'email',
  -- 'email' | 'whatsapp' | 'chat'
  priorite          TEXT        NOT NULL DEFAULT 'normale',
  -- 'basse' | 'normale' | 'haute'
  statut            TEXT        NOT NULL DEFAULT 'ouvert',
  -- 'ouvert' | 'en_cours' | 'resolu'
  contact_prenom    TEXT,
  contact_nom       TEXT,
  contact_email     TEXT,
  apprenant_nom     TEXT,
  entreprise_nom    TEXT,
  reponse_texte     TEXT,
  date_resolution   DATE,
  cree_par_id       UUID,
  cree_par_nom      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_statut    ON public.tickets(statut);
CREATE INDEX IF NOT EXISTS idx_tickets_canal     ON public.tickets(canal);
CREATE INDEX IF NOT EXISTS idx_tickets_priorite  ON public.tickets(priorite);
CREATE INDEX IF NOT EXISTS idx_tickets_created   ON public.tickets(created_at DESC);

ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY;
