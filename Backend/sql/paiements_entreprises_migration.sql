-- ══════════════════════════════════════════════════════════════
-- TABLE paiements_entreprises — versements enregistrés contre le
-- contrat d'une entreprise cliente (onglet Paiements du modal détail).
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.paiements_entreprises (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID        NOT NULL REFERENCES public.comptes_entreprises(id) ON DELETE CASCADE,
  montant       INTEGER     NOT NULL,
  date          DATE        NOT NULL,     -- nommé "date" (pas "date_paiement") pour matcher
                                           -- directement le champ form.date du frontend
  mode          TEXT,
  reference     TEXT,
  note          TEXT,
  echeance_id   UUID,                 -- réservé pour un futur échéancier, non utilisé pour l'instant
  cree_par_id   UUID,
  -- Le frontend ne calcule "Encaissé"/"Solde restant dû" que sur les versements
  -- statut = 'recu' (voir GestionEntreprises.jsx) — défaut 'recu' car ce backend n'a
  -- pas encore de flux de validation à part (tout versement saisi est considéré reçu).
  statut        TEXT        NOT NULL DEFAULT 'recu',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paiements_entreprises_entreprise ON public.paiements_entreprises(entreprise_id);

ALTER TABLE public.paiements_entreprises DISABLE ROW LEVEL SECURITY;
