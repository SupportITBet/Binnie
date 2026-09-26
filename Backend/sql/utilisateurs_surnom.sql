-- ============================================================================
--  Surnom des comptes du personnel
-- ============================================================================
--
--  Les dashboards affichaient l'état civil complet — « KOARA KAYABA HONORINE » —
--  là où l'équipe s'appelle par un prénom d'usage. Le surnom devient le titre du
--  dashboard, le nom complet restant affiché en dessous et dans la liste
--  SuperAdmin, puisqu'il reste la référence administrative.
--
--  Renseignable de trois façons : à la création par le SuperAdmin, à l'import
--  Excel, ou par l'utilisateur lui-même depuis « Mon profil ».
--
--  Sans effet sur l'existant : la colonne naît vide, et un surnom vide fait
--  simplement retomber l'affichage sur le nom complet.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS surnom TEXT;

COMMENT ON COLUMN utilisateurs.surnom IS
  'Prénom d''usage affiché en titre du dashboard et sous le nom dans la liste SuperAdmin. Vide = on retombe sur prénom + nom.';

-- Vérification
SELECT COUNT(*) AS total, COUNT(surnom) AS avec_surnom FROM utilisateurs;
