-- Mise à jour des dates de naissance (profil enfant 6-12 ans) pour les 10 bénéficiaires
-- Table principale : classes_elearning_apprenants

UPDATE classes_elearning_apprenants
SET date_naissance = CASE
  WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN '2016-03-14'::date  -- Fatou Diallo, 10 ans
  WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN '2017-07-22'::date  -- Seydou Bamba, 9 ans
  WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN '2015-11-05'::date  -- Lucas N'Guessan, 11 ans
  WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN '2018-04-30'::date  -- Aminata Koné, 8 ans
  WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN '2014-09-18'::date  -- Ibrahim Traoré, 12 ans
  WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN '2019-01-09'::date  -- Yann Aboua, 7 ans
  WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN '2016-06-27'::date  -- Hawa Sanogo, 10 ans
  WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN '2017-12-03'::date  -- Kofi Mensah, 9 ans
  WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN '2020-02-15'::date  -- Chloé Coulibaly, 6 ans
  WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN '2015-08-11'::date  -- Marie Ouattara, 11 ans
END
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr',
  'lamine.bamba@outlook.com',
  'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com',
  'moussa.traore@orange.ci',
  'paul.aboua@email.ci',
  'f.sanogo@gmail.com',
  'kwame.mensah@yahoo.fr',
  'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
);

-- Mettre à jour aussi dans inscriptions_elearning (source)
UPDATE inscriptions_elearning
SET date_naissance = CASE
  WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN '2016-03-14'::date
  WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN '2017-07-22'::date
  WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN '2015-11-05'::date
  WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN '2018-04-30'::date
  WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN '2014-09-18'::date
  WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN '2019-01-09'::date
  WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN '2016-06-27'::date
  WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN '2017-12-03'::date
  WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN '2020-02-15'::date
  WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN '2015-08-11'::date
END
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr',
  'lamine.bamba@outlook.com',
  'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com',
  'moussa.traore@orange.ci',
  'paul.aboua@email.ci',
  'f.sanogo@gmail.com',
  'kwame.mensah@yahoo.fr',
  'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Coordonnées parents + profil_type = 'enfant' (classes_elearning_apprenants)
-- Les emails enregistrés étant déjà ceux des parents (enfants 6-12 ans),
-- email_parent = email du dossier.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE classes_elearning_apprenants
SET
  profil_type        = 'enfant',
  prenom_parent      = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN 'Kadiatou'     -- mère de Fatou Diallo
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN 'Lamine'       -- père de Seydou Bamba
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN 'Henri'        -- père de Lucas N''Guessan
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN 'Djénéba'      -- mère d''Aminata Koné
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN 'Moussa'       -- père d''Ibrahim Traoré
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN 'Paul'         -- père de Yann Aboua
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN 'Fatoumata'    -- mère de Hawa Sanogo
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN 'Kwame'        -- père de Kofi Mensah
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN 'Mariam'       -- mère de Chloé Coulibaly
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN 'Awa'          -- mère de Marie Ouattara
  END,
  nom_parent         = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN 'Diallo'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN 'Bamba'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN 'N''Guessan'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN 'Koné'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN 'Traoré'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN 'Aboua'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN 'Sanogo'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN 'Mensah'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN 'Coulibaly'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN 'Ouattara'
  END,
  email_parent       = email,   -- l'email enregistré appartient au parent
  telephone_parent   = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN '+225 07 11 23 45 67'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN '+225 05 44 56 78 90'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN '+225 01 77 89 01 23'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN '+225 07 22 34 56 78'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN '+225 08 55 67 89 01'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN '+225 05 88 90 12 34'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN '+225 06 33 45 67 89'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN '+225 07 66 78 90 12'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN '+225 01 99 01 23 45'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN '+225 05 44 56 78 91'
  END
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr',
  'lamine.bamba@outlook.com',
  'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com',
  'moussa.traore@orange.ci',
  'paul.aboua@email.ci',
  'f.sanogo@gmail.com',
  'kwame.mensah@yahoo.fr',
  'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
);

-- Synchroniser aussi dans inscriptions_elearning
UPDATE inscriptions_elearning
SET
  profil_type        = 'enfant',
  prenom_parent      = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN 'Kadiatou'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN 'Lamine'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN 'Henri'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN 'Djénéba'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN 'Moussa'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN 'Paul'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN 'Fatoumata'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN 'Kwame'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN 'Mariam'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN 'Awa'
  END,
  nom_parent         = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN 'Diallo'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN 'Bamba'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN 'N''Guessan'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN 'Koné'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN 'Traoré'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN 'Aboua'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN 'Sanogo'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN 'Mensah'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN 'Coulibaly'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN 'Ouattara'
  END,
  email_parent       = email,
  telephone_parent   = CASE
    WHEN LOWER(email) = 'k.diallo@yahoo.fr'           THEN '+225 07 11 23 45 67'
    WHEN LOWER(email) = 'lamine.bamba@outlook.com'     THEN '+225 05 44 56 78 90'
    WHEN LOWER(email) = 'henri.nguessan@gmail.com'     THEN '+225 01 77 89 01 23'
    WHEN LOWER(email) = 'djeneba.kone@gmail.com'       THEN '+225 07 22 34 56 78'
    WHEN LOWER(email) = 'moussa.traore@orange.ci'      THEN '+225 08 55 67 89 01'
    WHEN LOWER(email) = 'paul.aboua@email.ci'          THEN '+225 05 88 90 12 34'
    WHEN LOWER(email) = 'f.sanogo@gmail.com'           THEN '+225 06 33 45 67 89'
    WHEN LOWER(email) = 'kwame.mensah@yahoo.fr'        THEN '+225 07 66 78 90 12'
    WHEN LOWER(email) = 'mariam.coulibaly@gmail.com'   THEN '+225 01 99 01 23 45'
    WHEN LOWER(email) = 'awa.ouattara@gmail.com'       THEN '+225 05 44 56 78 91'
  END
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr',
  'lamine.bamba@outlook.com',
  'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com',
  'moussa.traore@orange.ci',
  'paul.aboua@email.ci',
  'f.sanogo@gmail.com',
  'kwame.mensah@yahoo.fr',
  'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification finale
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  nom_complet,
  email,
  date_naissance,
  DATE_PART('year', AGE(date_naissance::date)) AS age_calcule,
  profil_type,
  prenom_parent || ' ' || nom_parent            AS parent_nom_complet,
  email_parent,
  telephone_parent
FROM classes_elearning_apprenants
WHERE LOWER(email) IN (
  'k.diallo@yahoo.fr', 'lamine.bamba@outlook.com', 'henri.nguessan@gmail.com',
  'djeneba.kone@gmail.com', 'moussa.traore@orange.ci', 'paul.aboua@email.ci',
  'f.sanogo@gmail.com', 'kwame.mensah@yahoo.fr', 'mariam.coulibaly@gmail.com',
  'awa.ouattara@gmail.com'
)
ORDER BY age_calcule;
