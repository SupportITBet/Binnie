-- Nettoyage des doublons existants — À EXÉCUTER AVANT anti_doublon_migration.sql
-- (les CREATE UNIQUE INDEX de ce fichier échouent tant que ces doublons existent).
--
-- Principe : rien n'est supprimé physiquement. Pour chaque groupe de doublons,
-- on garde 1 seule ligne "de référence" (la plus avancée : paiement reçu > montant
-- le plus élevé > statut converti > la plus ancienne), et on fait passer les autres
-- au statut d'annulation/retrait déjà utilisé partout ailleurs dans l'app — donc
-- réversible et consultable dans les archives/dossiers annulés.
--
-- ⚠️ Deux groupes ont été signalés comme ambigus (montants différents pouvant être
-- 2 vrais paiements) : ils sont traités par la même règle automatique ci-dessous
-- pour permettre la création des index, mais vérifiez-les après coup :
--   - Siaka koudou (doumbia99siaka@gmail.com, présentiel)
--   - jr valverde (valverde@gmail.com, presentiel/prive)

BEGIN;

-- 1. assignations_parcours : annuler tous les doublons sauf le "meilleur" par groupe
WITH classement AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(prospect_email), type_cours,
        COALESCE(type_coaching, ''), COALESCE(centre_id::text, ''),
        CASE WHEN profil_type = 'enfant' THEN lower(COALESCE(prenom_enfant,'')) END,
        CASE WHEN profil_type = 'enfant' THEN lower(COALESCE(nom_enfant,'')) END
      ORDER BY
        CASE WHEN statut_paiement IN ('reçu','paye','confirme') THEN 0
             WHEN statut_paiement = 'partiel' THEN 1
             ELSE 2 END,
        COALESCE(montant_paye, 0) DESC,
        CASE WHEN statut = 'converti' THEN 0 ELSE 1 END,
        created_at ASC
    ) AS rang
  FROM assignations_parcours
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND prospect_email IS NOT NULL
)
UPDATE assignations_parcours a
SET statut = 'annule',
    notes = COALESCE(notes || E'\n', '') || '[NETTOYAGE DOUBLON] Dossier dupliqué, annulé automatiquement — voir dossier conservé pour ce même prospect/canal.'
FROM classement c
WHERE a.id = c.id AND c.rang > 1;

-- 2. groupes_apprenants : retirer tous les doublons sauf le "meilleur" par classe
WITH classement_ga AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY groupe_id, COALESCE(apprenant_id::text, lower(email_apprenant))
      ORDER BY date_ajout ASC
    ) AS rang
  FROM groupes_apprenants
  WHERE statut <> 'retire'
    AND (apprenant_id IS NOT NULL OR email_apprenant IS NOT NULL)
)
UPDATE groupes_apprenants g
SET statut = 'retire',
    note = COALESCE(note || E'\n', '') || '[NETTOYAGE DOUBLON] Inscription dupliquée, retirée automatiquement.'
FROM classement_ga c
WHERE g.id = c.id AND c.rang > 1;

COMMIT;

-- Vérification rapide après exécution (doit retourner 0 lignes des deux côtés) :
-- SELECT lower(prospect_email), type_cours, COALESCE(type_coaching,''), COALESCE(centre_id::text,''), count(*)
--   FROM assignations_parcours WHERE statut NOT IN ('annule','annulee','refuse','refusee')
--   GROUP BY 1,2,3,4 HAVING count(*) > 1;
-- SELECT groupe_id, COALESCE(apprenant_id::text, lower(email_apprenant)), count(*)
--   FROM groupes_apprenants WHERE statut <> 'retire'
--   GROUP BY 1,2 HAVING count(*) > 1;
