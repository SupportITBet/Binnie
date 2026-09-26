-- Module Fournisseurs & Factures d'achat — bet-elearning
-- Complète le cycle achats (côté "dépense") symétriquement au cycle ventes déjà en place
-- (comptabilite_factures / comptabilite_paiements). Première brique du passage à une vraie
-- comptabilité en partie double (plan comptable SYSCOHADA à suivre).

-- ── Fiches fournisseurs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_fournisseurs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom           TEXT NOT NULL,
  contact_nom   TEXT,
  email         TEXT,
  telephone     TEXT,
  adresse       TEXT,
  ncc           TEXT, -- Numéro de Compte Contribuable (CI) — identifiant fiscal du fournisseur
  categorie     TEXT DEFAULT 'autre', -- loyer | marketing | materiel | services | utilities | autre
  notes         TEXT,
  actif         BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES public.utilisateurs(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_fournisseurs_nom ON public.comptabilite_fournisseurs (nom);

-- ── Factures d'achat (fournisseurs → nous) ──────────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_factures_achat (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero         TEXT UNIQUE NOT NULL,
  fournisseur_id UUID NOT NULL REFERENCES public.comptabilite_fournisseurs(id),
  reference_fournisseur TEXT, -- numéro de facture tel qu'émis par le fournisseur lui-même
  categorie      TEXT DEFAULT 'autre',
  montant_ht     NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_taux       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  montant_ttc    NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_paye   NUMERIC(12,2) NOT NULL DEFAULT 0,
  date_facture   DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance  DATE,
  statut         TEXT NOT NULL DEFAULT 'recue'
                 CHECK (statut IN ('recue','partiellement_payee','payee','en_retard','annulee')),
  lignes         JSONB DEFAULT '[]'::jsonb,
  justificatif_url TEXT,
  notes          TEXT,
  created_by     UUID REFERENCES public.utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_factach_statut      ON public.comptabilite_factures_achat (statut);
CREATE INDEX IF NOT EXISTS idx_compta_factach_fournisseur ON public.comptabilite_factures_achat (fournisseur_id);

-- ── Paiements aux fournisseurs (décaissements) ──────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_paiements_fournisseurs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_achat_id UUID REFERENCES public.comptabilite_factures_achat(id) ON DELETE SET NULL,
  fournisseur_id  UUID NOT NULL REFERENCES public.comptabilite_fournisseurs(id),
  reference       TEXT,
  montant         NUMERIC(12,2) NOT NULL,
  date_paiement   DATE NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement   TEXT NOT NULL DEFAULT 'virement',
  statut          TEXT NOT NULL DEFAULT 'paye' CHECK (statut IN ('paye','en_attente')),
  notes           TEXT,
  created_by      UUID REFERENCES public.utilisateurs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_pmtfourn_facture     ON public.comptabilite_paiements_fournisseurs (facture_achat_id);
CREATE INDEX IF NOT EXISTS idx_compta_pmtfourn_fournisseur ON public.comptabilite_paiements_fournisseurs (fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_compta_pmtfourn_date        ON public.comptabilite_paiements_fournisseurs (date_paiement);

ALTER TABLE public.comptabilite_fournisseurs           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptabilite_factures_achat          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptabilite_paiements_fournisseurs  DISABLE ROW LEVEL SECURITY;
