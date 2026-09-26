-- ══════════════════════════════════════════════════════════════════
-- Réparation : reconstruction des classes manquantes dans classes_elearning
-- Les inscriptions_elearning (statut='assigne') conservent classe_id + classe_nom
-- Ce script restaure les lignes orphelines sans écraser ce qui existe déjà.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════

INSERT INTO classes_elearning (
  id,
  nom,
  niveau,
  entreprise_id,
  entreprise_nom,
  type_cours,
  statut,
  capacite_max
)
SELECT DISTINCT ON (i.classe_id)
  i.classe_id                                                         AS id,
  COALESCE(NULLIF(i.classe_nom, ''), 'Classe ' || LEFT(i.classe_id::text, 8)) AS nom,
  i.niveau_detecte                                                    AS niveau,
  i.entreprise_id                                                     AS entreprise_id,
  i.entreprise_nom                                                    AS entreprise_nom,
  'en_ligne'                                                          AS type_cours,
  'actif'                                                             AS statut,
  20                                                                  AS capacite_max
FROM inscriptions_elearning i
WHERE i.classe_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM classes_elearning c WHERE c.id = i.classe_id
  )
ORDER BY i.classe_id, i.updated_at DESC NULLS LAST
ON CONFLICT (id) DO NOTHING;

-- Vérification : affiche les classes restaurées
SELECT id, nom, niveau, entreprise_nom, statut
FROM classes_elearning
ORDER BY created_at DESC
LIMIT 20;
