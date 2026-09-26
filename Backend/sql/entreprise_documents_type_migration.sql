-- Fusionne la "preuve d'inscription" (jusqu'ici stockée dans les colonnes
-- comptes_entreprises.fichier_preuve_url / fichier_preuve_nom) dans la table
-- entreprise_documents, en tant que document comme les autres, distingué par son type.
ALTER TABLE public.entreprise_documents
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'document';

-- Backfill : une ligne 'preuve_inscription' par entreprise ayant déjà un fichier_preuve_url,
-- seulement si elle n'a pas déjà été migrée (évite les doublons si ce script est relancé).
INSERT INTO public.entreprise_documents (entreprise_id, nom, url, type, created_at)
SELECT
  ce.id,
  'Preuve d''inscription',
  ce.fichier_preuve_url,
  'preuve_inscription',
  ce.created_at
FROM public.comptes_entreprises ce
WHERE ce.fichier_preuve_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.entreprise_documents ed
    WHERE ed.entreprise_id = ce.id AND ed.type = 'preuve_inscription'
  );
