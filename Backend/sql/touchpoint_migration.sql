-- ══════════════════════════════════════════════════════════════
-- TouchPoint (InTouch Group) : table des paiements en ligne reçus
-- Miroir de paiements_cinetpay — voir Backend/sql/cinetpay_migration.sql
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.paiements_touchpoint (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiants TouchPoint
  order_number        TEXT        NOT NULL UNIQUE,   -- généré par BET avant paiement (command_number côté callback)
  payment_token        TEXT,                          -- id de transaction côté TouchPoint (renvoyé par le callback)

  -- Détails client
  client_nom          TEXT        NOT NULL,
  client_prenom       TEXT,
  client_email        TEXT,
  client_telephone    TEXT,
  client_ville        TEXT,
  client_pays         TEXT        DEFAULT 'CI',

  -- Détails offre
  offre_key           TEXT,
  offre_label         TEXT,
  offre_formule       TEXT,
  offre_type          TEXT,
  niveau              TEXT,
  objectif            TEXT,
  message             TEXT,

  -- Paiement
  montant             NUMERIC     NOT NULL DEFAULT 0,
  devise              TEXT        NOT NULL DEFAULT 'XOF',
  payment_mode         TEXT,                          -- opérateur utilisé (renvoyé par le callback)
  statut              TEXT        NOT NULL DEFAULT 'en_attente',
  -- en_attente | validé | échoué | annulé

  -- Traitement assistante
  assistante_id       UUID,
  assistante_nom      TEXT,
  assigned_by         UUID,
  traitee             BOOLEAN     NOT NULL DEFAULT false,
  notes_assistante    TEXT,
  date_traitement     TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_tp_order       ON public.paiements_touchpoint(order_number);
CREATE INDEX IF NOT EXISTS idx_tp_statut      ON public.paiements_touchpoint(statut);
CREATE INDEX IF NOT EXISTS idx_tp_email       ON public.paiements_touchpoint(client_email);
CREATE INDEX IF NOT EXISTS idx_tp_traitee     ON public.paiements_touchpoint(traitee);
CREATE INDEX IF NOT EXISTS idx_tp_created     ON public.paiements_touchpoint(created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_touchpoint_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touchpoint_updated ON public.paiements_touchpoint;
CREATE TRIGGER trg_touchpoint_updated
  BEFORE UPDATE ON public.paiements_touchpoint
  FOR EACH ROW EXECUTE FUNCTION public.set_touchpoint_updated_at();

-- RLS désactivé pour que le backend (service_role) puisse écrire librement
ALTER TABLE public.paiements_touchpoint DISABLE ROW LEVEL SECURITY;
