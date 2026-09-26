-- ══════════════════════════════════════════════════════════════
-- CinetPay : table des paiements en ligne reçus
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.paiements_cinetpay (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiants CinetPay
  transaction_id      TEXT        NOT NULL UNIQUE,   -- ID généré par BET avant paiement
  cinetpay_ref        TEXT,                          -- référence CinetPay après confirmation

  -- Détails client
  client_nom          TEXT        NOT NULL,
  client_prenom       TEXT,
  client_email        TEXT,
  client_telephone    TEXT,
  client_ville        TEXT,
  client_pays         TEXT        DEFAULT 'CI',

  -- Détails offre
  offre_key           TEXT,        -- ex: "adultes", "entreprises", "interpretariat"
  offre_label         TEXT,        -- ex: "Anglais Pro B2"
  offre_formule       TEXT,        -- ex: "Intensif · 30 000 FCFA/mois"
  offre_type          TEXT,        -- ex: "en_ligne", "domicile", "certification"
  niveau              TEXT,        -- niveau actuel du client
  objectif            TEXT,        -- objectif (ex: "TOEIC")
  message             TEXT,        -- message libre du client

  -- Paiement
  montant             NUMERIC     NOT NULL DEFAULT 0,
  devise              TEXT        NOT NULL DEFAULT 'XOF',
  statut              TEXT        NOT NULL DEFAULT 'en_attente',
  -- en_attente | validé | échoué | annulé

  -- Traitement assistante
  assistante_id       UUID,        -- assignée après validation
  traitee             BOOLEAN     NOT NULL DEFAULT false,
  notes_assistante    TEXT,
  date_traitement     TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_cp_transaction  ON public.paiements_cinetpay(transaction_id);
CREATE INDEX IF NOT EXISTS idx_cp_statut       ON public.paiements_cinetpay(statut);
CREATE INDEX IF NOT EXISTS idx_cp_email        ON public.paiements_cinetpay(client_email);
CREATE INDEX IF NOT EXISTS idx_cp_traitee      ON public.paiements_cinetpay(traitee);
CREATE INDEX IF NOT EXISTS idx_cp_created      ON public.paiements_cinetpay(created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_cinetpay_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_cinetpay_updated ON public.paiements_cinetpay;
CREATE TRIGGER trg_cinetpay_updated
  BEFORE UPDATE ON public.paiements_cinetpay
  FOR EACH ROW EXECUTE FUNCTION public.set_cinetpay_updated_at();

-- RLS désactivé pour que le backend (service_role) puisse écrire librement
-- Les assistantes lisent via le backend authentifié (pas via client Supabase direct)
ALTER TABLE public.paiements_cinetpay DISABLE ROW LEVEL SECURITY;
