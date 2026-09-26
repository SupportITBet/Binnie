-- Système comptable dédié à dash (facturation, encaissements, dépenses, trésorerie,
-- fournisseurs, comptabilité générale, TVA, immobilisations, budgets, analytique).
-- Entièrement indépendant des tables de bet-elearning (comptabilite_*, préfixées sans
-- "dash_", appartiennent exclusivement à bet-elearning) — ne jamais les réutiliser ici,
-- cf. règle de séparation des plateformes déjà établie. Miroir structurel du système
-- bet-elearning (mêmes mécaniques de partie double SYSCOHADA), tables et routes distinctes.

-- ── Factures ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_factures (
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
CREATE INDEX IF NOT EXISTS idx_dash_compta_factures_statut ON public.dash_comptabilite_factures (statut);
CREATE INDEX IF NOT EXISTS idx_dash_compta_factures_client  ON public.dash_comptabilite_factures (client_nom);

-- ── Paiements reçus (encaissements) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_paiements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id      UUID REFERENCES public.dash_comptabilite_factures(id) ON DELETE SET NULL,
  reference       TEXT,
  client_nom      TEXT NOT NULL,
  client_type     TEXT NOT NULL DEFAULT 'particulier' CHECK (client_type IN ('entreprise','particulier')),
  montant         NUMERIC(12,2) NOT NULL,
  date_paiement   DATE NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement   TEXT NOT NULL DEFAULT 'virement',
  rapproche       BOOLEAN NOT NULL DEFAULT false,
  statut          TEXT NOT NULL DEFAULT 'recu' CHECK (statut IN ('recu','en_attente','en_retard')),
  notes           TEXT,
  created_by      UUID REFERENCES public.utilisateurs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_paiements_facture ON public.dash_comptabilite_paiements (facture_id);
CREATE INDEX IF NOT EXISTS idx_dash_compta_paiements_date    ON public.dash_comptabilite_paiements (date_paiement);

-- ── Dépenses générales (charges) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_depenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie      TEXT NOT NULL, -- loyer | salaires | marketing | materiel | utilities | autre
  libelle        TEXT NOT NULL,
  montant        NUMERIC(12,2) NOT NULL,
  date_depense   DATE NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement  TEXT NOT NULL DEFAULT 'virement',
  beneficiaire   TEXT,
  justificatif_url TEXT,
  statut         TEXT NOT NULL DEFAULT 'payee' CHECK (statut IN ('payee','prevue')),
  axe_analytique_id UUID,
  notes          TEXT,
  created_by     UUID REFERENCES public.utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_depenses_date ON public.dash_comptabilite_depenses (date_depense);

-- ── Registre de trésorerie (journal des mouvements) ─────────────
-- Alimenté automatiquement par le backend à chaque encaissement confirmé, dépense
-- saisie, ou honoraire coach marqué "payé" (honoraires_mois, table dash déjà
-- existante — cf. règle "ne pas dupliquer ce qui existe déjà") — jamais saisi
-- manuellement en double des tables sources, sauf mouvement 'manuel'.
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_tresorerie_mouvements (
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
CREATE INDEX IF NOT EXISTS idx_dash_compta_tresorerie_date ON public.dash_comptabilite_tresorerie_mouvements (date_mouvement);
CREATE INDEX IF NOT EXISTS idx_dash_compta_tresorerie_type ON public.dash_comptabilite_tresorerie_mouvements (type);

-- ── Fiches fournisseurs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_fournisseurs (
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
CREATE INDEX IF NOT EXISTS idx_dash_compta_fournisseurs_nom ON public.dash_comptabilite_fournisseurs (nom);

-- ── Factures d'achat (fournisseurs → nous) ──────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_factures_achat (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero         TEXT UNIQUE NOT NULL,
  fournisseur_id UUID NOT NULL REFERENCES public.dash_comptabilite_fournisseurs(id),
  reference_fournisseur TEXT,
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
  axe_analytique_id UUID,
  notes          TEXT,
  created_by     UUID REFERENCES public.utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_factach_statut      ON public.dash_comptabilite_factures_achat (statut);
CREATE INDEX IF NOT EXISTS idx_dash_compta_factach_fournisseur ON public.dash_comptabilite_factures_achat (fournisseur_id);

-- ── Paiements aux fournisseurs (décaissements) ──────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_paiements_fournisseurs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_achat_id UUID REFERENCES public.dash_comptabilite_factures_achat(id) ON DELETE SET NULL,
  fournisseur_id  UUID NOT NULL REFERENCES public.dash_comptabilite_fournisseurs(id),
  reference       TEXT,
  montant         NUMERIC(12,2) NOT NULL,
  date_paiement   DATE NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement   TEXT NOT NULL DEFAULT 'virement',
  statut          TEXT NOT NULL DEFAULT 'paye' CHECK (statut IN ('paye','en_attente')),
  notes           TEXT,
  created_by      UUID REFERENCES public.utilisateurs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_pmtfourn_facture     ON public.dash_comptabilite_paiements_fournisseurs (facture_achat_id);
CREATE INDEX IF NOT EXISTS idx_dash_compta_pmtfourn_fournisseur ON public.dash_comptabilite_paiements_fournisseurs (fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_dash_compta_pmtfourn_date        ON public.dash_comptabilite_paiements_fournisseurs (date_paiement);

-- ── Plan comptable ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_plan_comptable (
  numero    TEXT PRIMARY KEY,
  libelle   TEXT NOT NULL,
  classe    SMALLINT NOT NULL CHECK (classe BETWEEN 1 AND 9),
  type      TEXT NOT NULL CHECK (type IN ('actif','passif','charge','produit')),
  actif     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Écritures (pièce comptable) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_ecritures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_piece  TEXT UNIQUE NOT NULL, -- ex: VT-2026-0001
  journal       TEXT NOT NULL CHECK (journal IN ('VT','AC','BQ','OD')),
  date_ecriture DATE NOT NULL DEFAULT CURRENT_DATE,
  libelle       TEXT NOT NULL,
  source_type   TEXT, -- facture | paiement | facture_achat | paiement_fournisseur | depense | honoraire_mois | manuel
  source_id     TEXT,
  created_by    UUID REFERENCES public.utilisateurs(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_ecritures_date    ON public.dash_comptabilite_ecritures (date_ecriture);
CREATE INDEX IF NOT EXISTS idx_dash_compta_ecritures_journal ON public.dash_comptabilite_ecritures (journal);

-- ── Lignes d'écriture (débit/crédit) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_ecritures_lignes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecriture_id    UUID NOT NULL REFERENCES public.dash_comptabilite_ecritures(id) ON DELETE CASCADE,
  compte_numero  TEXT NOT NULL REFERENCES public.dash_comptabilite_plan_comptable(numero),
  libelle        TEXT,
  debit          NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ordre          SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_lignes_ecriture ON public.dash_comptabilite_ecritures_lignes (ecriture_id);
CREATE INDEX IF NOT EXISTS idx_dash_compta_lignes_compte   ON public.dash_comptabilite_ecritures_lignes (compte_numero);

-- ── Clôture d'exercice ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_exercices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee               SMALLINT NOT NULL UNIQUE,
  statut              TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','cloture')),
  date_cloture        TIMESTAMPTZ,
  cloture_par         UUID REFERENCES public.utilisateurs(id),
  resultat_exercice   NUMERIC(12,2),
  ecriture_cloture_id UUID REFERENCES public.dash_comptabilite_ecritures(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── TVA — déclarations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_tva_declarations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_mois    SMALLINT NOT NULL CHECK (periode_mois BETWEEN 1 AND 12),
  periode_annee   SMALLINT NOT NULL,
  tva_collectee   NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_deductible  NUMERIC(12,2) NOT NULL DEFAULT 0,
  tva_a_payer     NUMERIC(12,2) NOT NULL DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','declaree','payee')),
  date_declaration DATE,
  date_paiement    DATE,
  ecriture_id      UUID REFERENCES public.dash_comptabilite_ecritures(id),
  notes            TEXT,
  created_by       UUID REFERENCES public.utilisateurs(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (periode_mois, periode_annee)
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_tva_periode ON public.dash_comptabilite_tva_declarations (periode_annee, periode_mois);

-- ── Immobilisations & amortissements ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_immobilisations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle                     TEXT NOT NULL,
  categorie                   TEXT NOT NULL DEFAULT 'materiel',
  valeur_acquisition          NUMERIC(12,2) NOT NULL,
  date_acquisition            DATE NOT NULL DEFAULT CURRENT_DATE,
  duree_amortissement_annees  SMALLINT NOT NULL DEFAULT 5,
  valeur_residuelle           NUMERIC(12,2) NOT NULL DEFAULT 0,
  fournisseur_id              UUID REFERENCES public.dash_comptabilite_fournisseurs(id),
  statut                      TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active','cedee','reformee')),
  date_cession                DATE,
  valeur_cession              NUMERIC(12,2),
  notes                       TEXT,
  created_by                  UUID REFERENCES public.utilisateurs(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dash_comptabilite_immobilisations_amortissements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  immobilisation_id      UUID NOT NULL REFERENCES public.dash_comptabilite_immobilisations(id) ON DELETE CASCADE,
  exercice_annee         SMALLINT NOT NULL,
  montant_amortissement  NUMERIC(12,2) NOT NULL,
  cumul_amortissement    NUMERIC(12,2) NOT NULL,
  valeur_nette_comptable NUMERIC(12,2) NOT NULL,
  ecriture_id            UUID REFERENCES public.dash_comptabilite_ecritures(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (immobilisation_id, exercice_annee)
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_immo_amort_immo ON public.dash_comptabilite_immobilisations_amortissements (immobilisation_id);

-- ── Budgets / prévisionnel ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_budgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annee          SMALLINT NOT NULL,
  categorie      TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('charge','produit')),
  montant_prevu  NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  created_by     UUID REFERENCES public.utilisateurs(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (annee, categorie, type)
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_budgets_annee ON public.dash_comptabilite_budgets (annee);

-- ── Comptabilité analytique (axes/centres de coûts) ───────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_axes_analytiques (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  libelle    TEXT NOT NULL,
  actif      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.dash_comptabilite_axes_analytiques (code, libelle) VALUES
  ('pedagogie', 'Pédagogie'),
  ('commercial', 'Commercial'),
  ('rh', 'RH'),
  ('marketing', 'Marketing'),
  ('administration', 'Administration'),
  ('centres', 'Centres BET')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.dash_comptabilite_depenses
  ADD CONSTRAINT fk_dash_compta_depenses_axe FOREIGN KEY (axe_analytique_id)
  REFERENCES public.dash_comptabilite_axes_analytiques(id);
ALTER TABLE public.dash_comptabilite_factures_achat
  ADD CONSTRAINT fk_dash_compta_factach_axe FOREIGN KEY (axe_analytique_id)
  REFERENCES public.dash_comptabilite_axes_analytiques(id);

-- ── Relances clients (factures impayées/en retard) ────────────────
CREATE TABLE IF NOT EXISTS public.dash_comptabilite_relances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id  UUID NOT NULL REFERENCES public.dash_comptabilite_factures(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'auto' CHECK (type IN ('auto','manuelle')),
  niveau      SMALLINT NOT NULL DEFAULT 1 CHECK (niveau IN (1,2,3)),
  message     TEXT,
  date_relance DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by  UUID REFERENCES public.utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dash_compta_relances_facture ON public.dash_comptabilite_relances (facture_id);

-- ── Plan comptable de départ (SYSCOHADA, adapté BET — centres de coaching présentiel) ──
INSERT INTO public.dash_comptabilite_plan_comptable (numero, libelle, classe, type) VALUES
  ('101000', 'Capital social',                                1, 'passif'),
  ('120000', 'Résultat de l''exercice',                        1, 'passif'),
  ('218000', 'Matériel informatique et mobilier de bureau',    2, 'actif'),
  ('281800', 'Amortissements du matériel',                     2, 'actif'),
  ('401000', 'Fournisseurs',                                   4, 'passif'),
  ('411000', 'Clients',                                        4, 'actif'),
  ('421000', 'Personnel — rémunérations dues',                 4, 'passif'),
  ('443100', 'TVA collectée',                                  4, 'passif'),
  ('444000', 'État, TVA due',                                  4, 'passif'),
  ('445200', 'TVA déductible',                                 4, 'actif'),
  ('447000', 'Autres impôts et taxes',                         4, 'passif'),
  ('512000', 'Banque',                                         5, 'actif'),
  ('571000', 'Caisse',                                         5, 'actif'),
  ('601000', 'Achats de matériel et fournitures',               6, 'charge'),
  ('605000', 'Autres achats (matériel divers)',                 6, 'charge'),
  ('611000', 'Sous-traitance générale (services)',              6, 'charge'),
  ('613000', 'Locations (loyer centres BET)',                   6, 'charge'),
  ('622000', 'Rémunérations d''intermédiaires (honoraires coachs)', 6, 'charge'),
  ('623000', 'Publicité, marketing',                            6, 'charge'),
  ('626000', 'Frais postaux, télécommunications, utilities',    6, 'charge'),
  ('628000', 'Charges diverses',                                6, 'charge'),
  ('661000', 'Rémunérations directes versées au personnel (salaires)', 6, 'charge'),
  ('681000', 'Dotations aux amortissements',                    6, 'charge'),
  ('706000', 'Services vendus (prestations de coaching)',       7, 'produit'),
  ('758000', 'Produits divers',                                 7, 'produit')
ON CONFLICT (numero) DO NOTHING;

ALTER TABLE public.dash_comptabilite_factures                       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_paiements                       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_depenses                        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_tresorerie_mouvements           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_fournisseurs                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_factures_achat                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_paiements_fournisseurs          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_plan_comptable                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_ecritures                       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_ecritures_lignes                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_exercices                       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_tva_declarations                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_immobilisations                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_immobilisations_amortissements  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_budgets                         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_axes_analytiques                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dash_comptabilite_relances                        DISABLE ROW LEVEL SECURITY;

-- ── Permissions par défaut du rôle "comptable" sur les 9 sous-modules ──
-- module est un simple TEXT dans permissions_roles (pas d'enum à étendre).
INSERT INTO public.permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer)
SELECT 'comptable', m, true, true, true, true, true
FROM unnest(ARRAY[
  'dash_finances_facturation','dash_finances_paiements','dash_finances_tresorerie',
  'dash_finances_fournisseurs','dash_finances_generale','dash_finances_tva',
  'dash_finances_immobilisations','dash_finances_budgets','dash_finances_analytique'
]) AS m
ON CONFLICT (role, module) DO NOTHING;
