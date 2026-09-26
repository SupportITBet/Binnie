-- Système comptable dédié à bet-elearning (facturation, encaissements, dépenses, trésorerie).
-- Entièrement indépendant des tables de dash (factures_b2b, paiements_entreprises,
-- paiements_parcours, comptes_entreprises appartiennent à dash/CorporateDashboard —
-- ne jamais les réutiliser ici, cf. règle de séparation des plateformes déjà établie).

-- ── Factures ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_factures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero         TEXT UNIQUE NOT NULL,
  client_nom     TEXT NOT NULL,
  client_type    TEXT NOT NULL DEFAULT 'entreprise' CHECK (client_type IN ('entreprise','particulier')),
  client_email   TEXT,
  montant_ht     NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_taux       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  montant_ttc    NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_paye   NUMERIC(12,2) NOT NULL DEFAULT 0,
  date_emission  DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance  DATE,
  statut         TEXT NOT NULL DEFAULT 'brouillon'
                 CHECK (statut IN ('brouillon','envoyee','partiellement_payee','payee','en_retard','annulee')),
  lignes         JSONB DEFAULT '[]'::jsonb,
  notes          TEXT,
  created_by     UUID REFERENCES public.utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_factures_statut ON public.comptabilite_factures (statut);
CREATE INDEX IF NOT EXISTS idx_compta_factures_client  ON public.comptabilite_factures (client_nom);

-- ── Paiements reçus (encaissements) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_paiements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id      UUID REFERENCES public.comptabilite_factures(id) ON DELETE SET NULL,
  reference       TEXT,
  client_nom      TEXT NOT NULL,
  montant         NUMERIC(12,2) NOT NULL,
  date_paiement   DATE NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement   TEXT NOT NULL DEFAULT 'virement',
  rapproche       BOOLEAN NOT NULL DEFAULT false,
  statut          TEXT NOT NULL DEFAULT 'recu' CHECK (statut IN ('recu','en_attente','en_retard')),
  notes           TEXT,
  created_by      UUID REFERENCES public.utilisateurs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_paiements_facture ON public.comptabilite_paiements (facture_id);
CREATE INDEX IF NOT EXISTS idx_compta_paiements_date    ON public.comptabilite_paiements (date_paiement);

-- ── Dépenses générales (charges) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_depenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie      TEXT NOT NULL, -- loyer | salaires | marketing | materiel | utilities | autre
  libelle        TEXT NOT NULL,
  montant        NUMERIC(12,2) NOT NULL,
  date_depense   DATE NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement  TEXT NOT NULL DEFAULT 'virement',
  beneficiaire   TEXT,
  justificatif_url TEXT,
  statut         TEXT NOT NULL DEFAULT 'payee' CHECK (statut IN ('payee','prevue')),
  notes          TEXT,
  created_by     UUID REFERENCES public.utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_depenses_date ON public.comptabilite_depenses (date_depense);

-- ── Registre de trésorerie (journal des mouvements) ─────────────
-- Alimenté automatiquement par le backend à chaque encaissement confirmé,
-- dépense saisie, ou paiement RH/coach marqué "payé" — jamais saisi
-- manuellement en double des tables sources, sauf mouvement 'manuel'
-- (frais bancaires, régularisations...).
CREATE TABLE IF NOT EXISTS public.comptabilite_tresorerie_mouvements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('entree','sortie')),
  categorie     TEXT NOT NULL, -- encaissement_client | paiement_coach | depense | manuel
  montant       NUMERIC(12,2) NOT NULL,
  date_mouvement DATE NOT NULL DEFAULT CURRENT_DATE,
  source_type   TEXT, -- facture | paiement | honoraire_mois | depense | manuel
  source_id     TEXT,
  description   TEXT,
  mode_paiement TEXT,
  created_by    UUID REFERENCES public.utilisateurs(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_tresorerie_date ON public.comptabilite_tresorerie_mouvements (date_mouvement);
CREATE INDEX IF NOT EXISTS idx_compta_tresorerie_type ON public.comptabilite_tresorerie_mouvements (type);

ALTER TABLE public.comptabilite_factures              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptabilite_paiements              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptabilite_depenses               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptabilite_tresorerie_mouvements  DISABLE ROW LEVEL SECURITY;
