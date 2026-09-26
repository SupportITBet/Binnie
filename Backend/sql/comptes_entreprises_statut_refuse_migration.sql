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
