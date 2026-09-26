-- Ajoute client_type directement sur comptabilite_paiements pour ne plus dépendre
-- d'une jointure vers comptabilite_factures (les versements entreprises enregistrés
-- via enregistrerEncaissementEntreprise n'ont pas de facture_id, donc étaient toujours
-- classés "particulier" par défaut côté frontend).

ALTER TABLE public.comptabilite_paiements
  ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'particulier'
    CHECK (client_type IN ('entreprise', 'particulier'));

-- Backfill : paiements liés à une facture → type de la facture
UPDATE public.comptabilite_paiements p
SET client_type = f.client_type
FROM public.comptabilite_factures f
WHERE p.facture_id = f.id;

-- Backfill : paiements sans facture (tous issus du miroir des versements entreprises
-- de bet-elearning, cf. enregistrerEncaissementEntreprise) → entreprise
UPDATE public.comptabilite_paiements
SET client_type = 'entreprise'
WHERE facture_id IS NULL;
