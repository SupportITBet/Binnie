-- Comptabilité générale en partie double (SYSCOHADA) — bet-elearning
-- Coeur du système comptable : plan comptable + journal d'écritures débit/crédit.
-- Chaque facture, paiement, dépense ou paiement coach génère automatiquement une
-- écriture équilibrée (débit total = crédit total) — jamais de saisie manuelle
-- pour les opérations courantes, seul le module Opérations diverses (OD) permet
-- de saisir une écriture libre.

-- ── Plan comptable ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_plan_comptable (
  numero    TEXT PRIMARY KEY, -- ex: "706000"
  libelle   TEXT NOT NULL,
  classe    SMALLINT NOT NULL CHECK (classe BETWEEN 1 AND 9),
  type      TEXT NOT NULL CHECK (type IN ('actif','passif','charge','produit')),
  actif     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Écritures (pièce comptable) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_ecritures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_piece  TEXT UNIQUE NOT NULL, -- ex: VT-2026-0001
  journal       TEXT NOT NULL CHECK (journal IN ('VT','AC','BQ','OD')), -- Ventes|Achats|Banque|Opérations diverses
  date_ecriture DATE NOT NULL DEFAULT CURRENT_DATE,
  libelle       TEXT NOT NULL,
  source_type   TEXT, -- facture | paiement | facture_achat | paiement_fournisseur | depense | honoraire_mois | manuel
  source_id     TEXT,
  created_by    UUID REFERENCES public.utilisateurs(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_date    ON public.comptabilite_ecritures (date_ecriture);
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_journal ON public.comptabilite_ecritures (journal);

-- ── Lignes d'écriture (débit/crédit) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.comptabilite_ecritures_lignes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecriture_id    UUID NOT NULL REFERENCES public.comptabilite_ecritures(id) ON DELETE CASCADE,
  compte_numero  TEXT NOT NULL REFERENCES public.comptabilite_plan_comptable(numero),
  libelle        TEXT,
  debit          NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ordre          SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_compta_lignes_ecriture ON public.comptabilite_ecritures_lignes (ecriture_id);
CREATE INDEX IF NOT EXISTS idx_compta_lignes_compte   ON public.comptabilite_ecritures_lignes (compte_numero);

ALTER TABLE public.comptabilite_plan_comptable      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptabilite_ecritures            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptabilite_ecritures_lignes     DISABLE ROW LEVEL SECURITY;

-- ── Plan comptable de départ (SYSCOHADA, adapté à une société de services/formation) ──
INSERT INTO public.comptabilite_plan_comptable (numero, libelle, classe, type) VALUES
  ('101000', 'Capital social',                                1, 'passif'),
  ('120000', 'Résultat de l''exercice',                        1, 'passif'),
  ('218000', 'Matériel informatique et mobilier de bureau',    2, 'actif'),
  ('281800', 'Amortissements du matériel',                     2, 'actif'),
  ('401000', 'Fournisseurs',                                   4, 'passif'),
  ('411000', 'Clients',                                        4, 'actif'),
  ('421000', 'Personnel — rémunérations dues',                 4, 'passif'),
  ('443100', 'TVA collectée',                                  4, 'passif'),
  ('445200', 'TVA déductible',                                 4, 'actif'),
  ('447000', 'Autres impôts et taxes',                         4, 'passif'),
  ('512000', 'Banque',                                         5, 'actif'),
  ('571000', 'Caisse',                                         5, 'actif'),
  ('601000', 'Achats de matériel et fournitures',               6, 'charge'),
  ('605000', 'Autres achats (matériel divers)',                 6, 'charge'),
  ('611000', 'Sous-traitance générale (services)',              6, 'charge'),
  ('613000', 'Locations (loyer)',                               6, 'charge'),
  ('622000', 'Rémunérations d''intermédiaires (honoraires coachs)', 6, 'charge'),
  ('623000', 'Publicité, marketing',                            6, 'charge'),
  ('626000', 'Frais postaux, télécommunications, utilities',    6, 'charge'),
  ('628000', 'Charges diverses',                                6, 'charge'),
  ('661000', 'Rémunérations directes versées au personnel (salaires)', 6, 'charge'),
  ('706000', 'Services vendus (prestations de formation)',      7, 'produit'),
  ('758000', 'Produits divers',                                 7, 'produit')
ON CONFLICT (numero) DO NOTHING;
