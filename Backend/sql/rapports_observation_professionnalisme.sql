-- ============================================================================
--  Rapport d'observation — professionnalisme, état d'Internet, nouvelles listes
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Quatre changements décidés avec la direction :
--
--  1. « Respect du programme » devient « Professionnalisme ». Ce n'est PAS un
--     renommage : « a-t-il suivi le programme ? » et « est-il professionnel ? » ne
--     se notent pas pareil. Réétiqueter la colonne existante aurait fait relire
--     toutes les notes déjà données comme des notes de professionnalisme, ce
--     qu'elles ne sont pas. D'où une colonne NEUVE : `respect_programme` cesse
--     d'être saisie et reste lisible sur les anciens rapports, avec son vrai sens.
--
--  2. `internet` remplace le signalement d'incident technique. HORS NOTE, pour la
--     même raison qui l'avait fait sortir des critères : un coach ne maîtrise pas
--     la stabilité de sa connexion. C'est un constat de contexte, pas une
--     performance — l'inclure dans la moyenne reviendrait à sanctionner une
--     coupure de courant.
--
--  3. `type_observation` accueille « evaluation », d'où la contrainte à refaire :
--     elle n'admettait que 'cours' et 'mock_teaching'.
--
--  4. `type_lecon` change de NATURE : il décrivait le contenu (Grammaire,
--     Expression orale, Compréhension…), il décrit désormais la modalité (online |
--     in_person | home_tutoring). Les anciens rapports gardent leurs valeurs de
--     contenu : les deux vocabulaires cohabitent dans la colonne, la date du
--     rapport les départage. Aucune contrainte de vocabulaire n'y est posée —
--     voir le commentaire en bas de ce fichier, qui dit pourquoi.
-- ============================================================================

ALTER TABLE public.rapports_observation
  -- Note 1 à 5, comme les autres critères : la moyenne reste homogène.
  ADD COLUMN IF NOT EXISTS professionnalisme smallint,
  -- Texte et non booléen : « non applicable » en présentiel n'est ni stable ni
  -- instable, et un booléen aurait forcé à choisir un camp.
  ADD COLUMN IF NOT EXISTS internet          text;

COMMENT ON COLUMN public.rapports_observation.professionnalisme IS
  'Note 1-5. Remplace respect_programme, qui portait une autre question et reste lisible sur les anciens rapports.';
COMMENT ON COLUMN public.rapports_observation.respect_programme IS
  'OBSOLETE — plus saisi depuis l''ajout de professionnalisme. Conserve pour la lecture des rapports anterieurs.';
COMMENT ON COLUMN public.rapports_observation.internet IS
  'stable | instable | autre. HORS NOTE : le coach ne maitrise pas sa connexion. « autre » vaut « non applicable », en presentiel.';
COMMENT ON COLUMN public.rapports_observation.type_lecon IS
  'Modalite du cours : online | in_person | home_tutoring. Les rapports anterieurs y portent un type de CONTENU (Grammaire, Expression orale...).';
COMMENT ON COLUMN public.rapports_observation.type_observation IS
  'cours | evaluation | mock_teaching.';

-- ── Contraintes de vocabulaire ───────────────────────────────────────────
ALTER TABLE public.rapports_observation
  DROP CONSTRAINT IF EXISTS rapports_observation_type_obs_chk,
  DROP CONSTRAINT IF EXISTS rapports_observation_internet_chk,
  DROP CONSTRAINT IF EXISTS rapports_observation_type_lecon_chk,
  DROP CONSTRAINT IF EXISTS rapports_observation_professionnalisme_chk;

ALTER TABLE public.rapports_observation
  ADD CONSTRAINT rapports_observation_type_obs_chk
    CHECK (type_observation IS NULL OR type_observation IN ('cours','evaluation','mock_teaching')),
  ADD CONSTRAINT rapports_observation_internet_chk
    CHECK (internet IS NULL OR internet IN ('stable','instable','autre')),
  ADD CONSTRAINT rapports_observation_professionnalisme_chk
    CHECK (professionnalisme IS NULL OR professionnalisme BETWEEN 1 AND 5);

-- AUCUNE contrainte sur `type_lecon`, volontairement : les rapports anterieurs y
-- portent un type de CONTENU (« Grammaire », « Autre »...) et non une modalite. Une
-- contrainte, meme NOT VALID, les rendrait immodifiables — NOT VALID dispense les
-- lignes existantes du controle a la CREATION de la contrainte, mais toute ligne
-- mise a jour ensuite est revérifiee, et transmettre un ancien rapport au conseil
-- pedagogique echouerait en 23514. C'est le formulaire qui garantit le vocabulaire
-- des nouvelles saisies : il ne propose que les trois modalites.

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)                        AS total,
       COUNT(professionnalisme)        AS avec_professionnalisme,
       COUNT(respect_programme)        AS heritage_respect_programme,
       COUNT(internet)                 AS avec_internet,
       COUNT(*) FILTER (WHERE type_lecon IN ('online','in_person','home_tutoring')) AS lecon_nouveau_vocab,
       COUNT(*) FILTER (WHERE type_lecon IS NOT NULL
                          AND type_lecon NOT IN ('online','in_person','home_tutoring')) AS lecon_ancien_vocab
  FROM public.rapports_observation;
