-- CORRECTIF — cause racine trouvée du "0 ligne dans seances malgré 34 sessions live et
-- 3 séances privées réelles" : `seances.titre` est NOT NULL en production, alors qu'il est
-- déclaré simplement TEXT (nullable) dans la migration d'origine seances_unifiees_migration.sql.
-- Aucun des 3 points d'insertion applicatifs (Backend/src/routes/coachs.js "sessions-live",
-- seancesPrivees.js, groupes.js "cours") ne renseigne jamais `titre` — et chacun avale l'erreur
-- silencieusement (`.catch(() => ({ data: null }))`), donc CHAQUE insertion échouait à 100%,
-- sans jamais remonter d'erreur visible. C'est la même famille de bug que classe_id/heure_debut/
-- heure_fin déjà corrigés — une colonne orpheline NOT NULL jamais suivie dans les migrations.
ALTER TABLE seances
  ALTER COLUMN titre DROP NOT NULL;
