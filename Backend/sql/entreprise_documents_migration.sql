-- Table de stockage des documents rattachés à une entreprise (contrats, bons de commande,
-- pièces diverses…) — consultable/téléchargeable depuis l'onglet "Documents" du modal détail
-- entreprise, côté admin BET, assistante e-learning et onboarding.
CREATE TABLE IF NOT EXISTS public.entreprise_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.comptes_entreprises(id) ON DELETE CASCADE,
  nom           text NOT NULL,
  url           text NOT NULL,
  format        text,
  taille        integer,
  depose_par_id uuid,
  depose_par_nom text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entreprise_documents_entreprise_id
  ON public.entreprise_documents(entreprise_id);
