-- CORRECTIF — deux bugs pré-existants découverts en testant à nouveau la table
-- `seances` (même famille que seances_fix_classe_id_et_statut_check_migration.sql :
-- des colonnes NOT NULL en production, jamais documentées comme telles dans la
-- migration d'origine seances_unifiees_migration.sql). À eux deux, ils bloquent
-- INCONDITIONNELLEMENT tout insert dans `seances` passant par POST /api/seances.
--
-- Bug 1 : `seances.heure_debut` est NOT NULL en base, mais
-- Backend/src/routes/seances.js (POST /api/seances, ligne ~309) insère
-- explicitement `heure_debut: heure_debut || null` — le code applicatif est
-- écrit pour accepter une heure de début absente, ce que la contrainte réelle
-- interdit.
ALTER TABLE seances
  ALTER COLUMN heure_debut DROP NOT NULL;

-- Bug 2 : `seances.heure_fin` est NOT NULL en base mais n'apparaît nulle part
-- dans Backend/src/routes/seances.js (aucune occurrence de "heure_fin") ni dans
-- la migration d'origine pour la table `seances` (elle n'existe, documentée,
-- que sur `sessions_live`) — colonne orpheline ajoutée hors migration suivie,
-- jamais renseignée par le code applicatif.
ALTER TABLE seances
  ALTER COLUMN heure_fin DROP NOT NULL;
