-- ============================================================
-- audit_plateforme_migration.sql
-- Ajoute une colonne plateforme à audit_logs pour empêcher dash
-- et bet-elearning de voir mutuellement leurs journaux d'audit
-- respectifs (même table, deux apps admin distinctes).
-- À exécuter dans Supabase SQL Editor. Safe to run multiple times.
-- ============================================================

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS plateforme text;

CREATE INDEX IF NOT EXISTS idx_audit_plateforme ON audit_logs (plateforme);

-- Backfill des lignes historiques à partir du module — best effort, les modules
-- réellement partagés (entreprise, apprenants, upload, coachs, centres, roles, auth…)
-- restent NULL et continuent d'être visibles des deux côtés (comportement inchangé).
UPDATE audit_logs SET plateforme = 'dash' WHERE plateforme IS NULL AND module IN (
  'boutique','paiements','level_test','level_tests','devis','contact','leads',
  'newsletter','sondage','messages','blog','temoignages','equipe_photos',
  'partenaires','parcours','corporate','marquee','codes_promo','avis',
  'groupes','contrats_prives','plaintes','config_contact','faq','carousel',
  'offre_media','cinetpay','seances_privees','fichiers_prives','cours_elearning',
  'mon_espace','remplacements','seances','presences','presences_privees',
  'inscriptions','simulateur'
);

UPDATE audit_logs SET plateforme = 'bet-elearning' WHERE plateforme IS NULL AND module IN (
  'onboarding','classes','tickets','placement','gamification','bet_elearning',
  'elearning','comptabilite','comptabilite_generale','comptabilite_tva',
  'comptabilite_immobilisations'
);

-- "contenus" est un nom de module réutilisé par deux fichiers de routes différents
-- (contenusOnboardingDash.js pour dash, contenusOnboarding.js pour bet-elearning) —
-- un blanket UPDATE vers une seule plateforme taguerait l'autre à tort. On distingue
-- via entite_type, qui lui est propre à chaque fichier (suffixe "_dash" côté dash).
UPDATE audit_logs SET plateforme = 'dash' WHERE plateforme IS NULL AND module = 'contenus'
  AND entite_type LIKE '%_dash';
UPDATE audit_logs SET plateforme = 'bet-elearning' WHERE plateforme IS NULL AND module = 'contenus'
  AND (entite_type IS NULL OR entite_type NOT LIKE '%_dash');
