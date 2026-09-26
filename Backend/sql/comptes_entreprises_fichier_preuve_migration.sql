-- ============================================================
-- comptes_entreprises_fichier_preuve_migration.sql
-- Ajoute le stockage d'une preuve d'inscription (contrat signé, bon de commande...)
-- sur une entreprise — remplie côté assistante à la soumission, modifiable côté
-- admin BET à la validation ou à la création directe.
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

ALTER TABLE public.comptes_entreprises ADD COLUMN IF NOT EXISTS fichier_preuve_url TEXT;
