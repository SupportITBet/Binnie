-- ============================================================================
--  IMPORTS — conservation des lignes source (pour "Relancer")
--
--  Complement de sql/imports_en_masse_migration.sql.
--
--  Le fichier Excel n'existe que dans le navigateur : seules les lignes analysees
--  transitaient vers le serveur, sans etre conservees. Relancer un import
--  supposait donc de retrouver le fichier d'origine et de tout refaire a la main.
--
--  En conservant les lignes, un import interrompu ou annule se rejoue en un clic :
--  l'idempotence (import_ligne_cle) saute celles deja creees et ne cree que les
--  manquantes. C'est exactement le cas d'usage d'un import coupe en cours de route.
-- ============================================================================

ALTER TABLE imports ADD COLUMN IF NOT EXISTS lignes_source jsonb;

COMMENT ON COLUMN imports.lignes_source IS
  'Lignes analysees envoyees par le dashboard, conservees pour permettre de relancer '
  'l''import sans le fichier d''origine. L''idempotence evite tout doublon au rejeu.';
