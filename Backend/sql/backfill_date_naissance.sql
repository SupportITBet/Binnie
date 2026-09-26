-- Backfill date_naissance dans classes_elearning_apprenants
-- depuis inscriptions_elearning (join sur email)
UPDATE classes_elearning_apprenants AS cea
SET date_naissance = ie.date_naissance
FROM inscriptions_elearning ie
WHERE LOWER(cea.email) = LOWER(ie.email)
  AND ie.date_naissance IS NOT NULL
  AND cea.date_naissance IS NULL;

-- Vérification : afficher les enregistrements toujours sans date_naissance
SELECT id, nom_complet, email, date_naissance
FROM classes_elearning_apprenants
WHERE date_naissance IS NULL
ORDER BY created_at DESC;
