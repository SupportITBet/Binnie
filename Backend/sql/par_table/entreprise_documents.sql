-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `entreprise_documents`
-- Généré à partir de 3 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── entreprise_documents_migration.sql  (2026-07-11) ──────────────────────────────
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

-- ── entreprise_documents_preuve_depose_par_backfill.sql  (2026-07-29) ──────────────────────────────
-- Complète depose_par_id/depose_par_nom sur les lignes 'preuve_inscription' déjà migrées
-- par entreprise_documents_type_migration.sql (créées avant que syncPreuveDocument()
-- n'enregistre l'acteur) — utilise le créateur de l'entreprise comme meilleure approximation.
UPDATE public.entreprise_documents ed
SET
  depose_par_id  = ce.cree_par_id,
  depose_par_nom = COALESCE(NULLIF(TRIM(CONCAT(u.prenom, ' ', u.nom)), ''), u.email)
FROM public.comptes_entreprises ce
LEFT JOIN public.utilisateurs u ON u.id = ce.cree_par_id
WHERE ed.entreprise_id = ce.id
  AND ed.type = 'preuve_inscription'
  AND ed.depose_par_id IS NULL
  AND ce.cree_par_id IS NOT NULL;

-- ── entreprise_documents_type_migration.sql  (2026-07-29) ──────────────────────────────
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

