-- 0. Colonne de rattachement à un compte apprenant existant (identité stable,
--    au lieu de ne compter que sur une comparaison d'email en texte libre).
ALTER TABLE assignations_parcours ADD COLUMN IF NOT EXISTS apprenant_id uuid REFERENCES utilisateurs(id);

-- Anti-doublon (défense en profondeur au niveau base de données)
-- ⚠️ À exécuter APRÈS avoir nettoyé les doublons existants (voir rapport fourni
-- séparément) — sinon la création des index échouera (Postgres refuse un index
-- unique si des lignes en violent déjà la contrainte).
--
-- Objectif : même si un bug applicatif futur recontourne les vérifications
-- côté code (Backend/src/routes/parcours.js et groupes.js), la base elle-même
-- refuse désormais la création d'un doublon.

-- 1. groupes_apprenants : une même personne (apprenant_id, ou à défaut email)
--    ne peut avoir qu'UNE ligne active (non "retire") par classe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_groupes_apprenants_actif_par_apprenant
  ON groupes_apprenants (groupe_id, apprenant_id)
  WHERE statut <> 'retire' AND apprenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_groupes_apprenants_actif_par_email
  ON groupes_apprenants (groupe_id, lower(email_apprenant))
  WHERE statut <> 'retire' AND apprenant_id IS NULL AND email_apprenant IS NOT NULL;

-- 2. assignations_parcours : un même prospect (email) ne peut avoir qu'UN dossier
--    actif par canal (type_cours + type_coaching + centre_id, coalescés pour que
--    deux NULL soient considérés identiques). Profils "enfant" scopés en plus par
--    l'enfant (un même parent peut légitimement inscrire plusieurs enfants).
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignations_actif_par_canal
  ON assignations_parcours (
    lower(prospect_email), type_cours,
    COALESCE(type_coaching, ''), COALESCE(centre_id::text, '')
  )
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND (profil_type IS DISTINCT FROM 'enfant');

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignations_actif_par_canal_enfant
  ON assignations_parcours (
    lower(prospect_email), type_cours,
    COALESCE(type_coaching, ''), COALESCE(centre_id::text, ''),
    lower(COALESCE(prenom_enfant, '')), lower(COALESCE(nom_enfant, ''))
  )
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND profil_type = 'enfant';
