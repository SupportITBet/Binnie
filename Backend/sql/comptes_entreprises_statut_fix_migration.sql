-- ============================================================
-- comptes_entreprises_statut_fix_migration.sql
-- La contrainte CHECK d'origine sur comptes_entreprises.statut n'autorisait que
-- ('actif','inactif','suspendu') — mais l'application (frontend ET plusieurs
-- routes backend : soumettre-parcours, validation, expiration de contrat...)
-- utilise aussi 'en_attente', 'expire_bientot', 'prospect', 'certifie'.
-- Résultat : toute soumission d'entreprise en attente de validation échouait
-- avec "violates check constraint comptes_entreprises_statut_check".
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

ALTER TABLE public.comptes_entreprises DROP CONSTRAINT IF EXISTS comptes_entreprises_statut_check;
ALTER TABLE public.comptes_entreprises ADD CONSTRAINT comptes_entreprises_statut_check
  CHECK (statut IN ('actif','inactif','suspendu','en_attente','expire_bientot','prospect','certifie'));

-- ============================================================
-- comptes_entreprises_statut_refuse_migration.sql
-- La route "refuser une inscription" met le statut à 'archive', une valeur qui
-- n'a jamais existé dans la contrainte CHECK — même bug que le précédent fix,
-- juste pas encore déclenché faute d'avoir testé le refus.
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

ALTER TABLE public.comptes_entreprises DROP CONSTRAINT IF EXISTS comptes_entreprises_statut_check;
ALTER TABLE public.comptes_entreprises ADD CONSTRAINT comptes_entreprises_statut_check
  CHECK (statut IN ('actif','inactif','suspendu','en_attente','expire_bientot','prospect','certifie','refuse'));
