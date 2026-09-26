-- ══════════════════════════════════════════════════════════════
-- Ajout preuve_image sur paiements_parcours
-- + documents_dossier sur assignations_parcours
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Preuve de paiement (URL Supabase Storage) pour chèque, RIA, MoneyGram, etc.
ALTER TABLE paiements_parcours
  ADD COLUMN IF NOT EXISTS preuve_image TEXT;

-- 2. Documents du dossier de l'apprenant (URLs Supabase Storage)
--    Format : [{"nom":"Pièce d'identité","type":"id","url":"https://...","chemin":"assignation-id/id-123.jpg","taille":245678,"mimetype":"image/jpeg"}]
ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS documents_dossier JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ══════════════════════════════════════════════════════════════
-- BUCKET SUPABASE STORAGE À CRÉER MANUELLEMENT
-- Supabase Dashboard > Storage > New bucket
-- ══════════════════════════════════════════════════════════════
-- Nom du bucket  : dossiers-apprenants
-- Public         : OUI  (pour que les URLs publiques fonctionnent)
-- Taille max     : 20 Mo par fichier
--
-- Politique RLS Storage (à configurer dans Storage > Policies) :
-- SELECT (lecture publique) : true
-- INSERT / UPDATE / DELETE  : auth.role() = 'authenticated'
-- ══════════════════════════════════════════════════════════════
