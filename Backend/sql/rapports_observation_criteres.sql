-- ============================================================================
--  Compléter le rapport d'observation avec les critères de la feuille terrain
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Le rapport d'observation ne portait que cinq critères. La feuille réellement
--  utilisée par les superviseurs — « 2026 Coaches Weekly Performance Appraisal
--  Sheet » — en évalue quatre autres, et ce sont précisément les lignes que les
--  observateurs remplissent le plus :
--
--    · Class Interactivity          → interactivite_classe
--    · Grammar (approche)           → approche_grammaticale
--    · Speaking & Learner Engagement → expression_engagement
--    · Feedback & Error Correction   → feedback_correction
--
--  Deux colonnes de la feuille étaient DÉCLARÉES en en-tête mais jamais remplies,
--  faute de case où les saisir : `LESSON TYPES` et le type d'observation (le second
--  onglet, « Mock Teaching », est un exercice différent d'une observation de cours
--  et n'était distinguable par rien).
--
--  `Network` ne devient pas un critère : un coach ne peut pas être noté sur la
--  stabilité d'une connexion qu'il ne maîtrise pas. Il devient un signalement
--  d'incident, hors note, qui doit remonter à qui peut le résoudre.
-- ============================================================================

ALTER TABLE public.rapports_observation
  -- Échelles fermées : le texte est la source de vérité (c'est ce que l'observateur
  -- choisit), la conversion en points se fait côté serveur pour la moyenne.
  ADD COLUMN IF NOT EXISTS interactivite_classe      text,
  ADD COLUMN IF NOT EXISTS approche_grammaticale     text,
  -- Notes 1 à 5, comme les cinq critères existants : la moyenne reste homogène.
  ADD COLUMN IF NOT EXISTS expression_engagement     smallint,
  ADD COLUMN IF NOT EXISTS feedback_correction       smallint,
  -- Contexte de l'observation.
  ADD COLUMN IF NOT EXISTS type_observation          text DEFAULT 'cours',
  ADD COLUMN IF NOT EXISTS type_lecon                text,
  -- Incident technique — hors note.
  ADD COLUMN IF NOT EXISTS incident_technique        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS incident_technique_detail text,
  -- Synthèse calculée depuis la moyenne, jamais saisie : dans la feuille,
  -- « Satisfaction » était renseignée à la main alors qu'elle résume les autres
  -- critères — d'où des rapports où elle les contredisait.
  ADD COLUMN IF NOT EXISTS synthese                  text;

COMMENT ON COLUMN public.rapports_observation.interactivite_classe IS
  'Echelle fermee : excellent | bon | acceptable | insuffisant. Reprend « Class Interactivity ».';
COMMENT ON COLUMN public.rapports_observation.approche_grammaticale IS
  'Echelle fermee : inductive_claire | inductive_perfectible | deductive_claire | confuse. Reprend « Grammar ».';
COMMENT ON COLUMN public.rapports_observation.expression_engagement IS
  'Note 1-5. Reprend « Speaking & Learner Engagement » (note sur 20 dans la feuille).';
COMMENT ON COLUMN public.rapports_observation.feedback_correction IS
  'Note 1-5. Reprend « Feedback & Error Correction » (note sur 10 dans la feuille).';
COMMENT ON COLUMN public.rapports_observation.type_observation IS
  'cours | mock_teaching. Le second onglet de la feuille est un exercice distinct.';
COMMENT ON COLUMN public.rapports_observation.type_lecon IS
  'Type de lecon observee — colonne « LESSON TYPES » de la feuille, declaree mais jamais remplie.';
COMMENT ON COLUMN public.rapports_observation.incident_technique IS
  'Remplace « Network ». Signalement, hors note : le coach ne maitrise pas la connexion.';
COMMENT ON COLUMN public.rapports_observation.synthese IS
  'excellent | satisfaisant | a_accompagner. CALCULEE depuis note_globale, jamais saisie.';

-- Contraintes de vocabulaire : sans elles, les échelles fermées redeviendraient du
-- texte libre, et c'est exactement ce qu'on corrige.
ALTER TABLE public.rapports_observation
  DROP CONSTRAINT IF EXISTS rapports_observation_interactivite_chk,
  DROP CONSTRAINT IF EXISTS rapports_observation_grammaire_chk,
  DROP CONSTRAINT IF EXISTS rapports_observation_type_obs_chk,
  DROP CONSTRAINT IF EXISTS rapports_observation_synthese_chk;

ALTER TABLE public.rapports_observation
  ADD CONSTRAINT rapports_observation_interactivite_chk
    CHECK (interactivite_classe IS NULL OR interactivite_classe IN ('excellent','bon','acceptable','insuffisant')),
  ADD CONSTRAINT rapports_observation_grammaire_chk
    CHECK (approche_grammaticale IS NULL OR approche_grammaticale IN ('inductive_claire','inductive_perfectible','deductive_claire','confuse')),
  ADD CONSTRAINT rapports_observation_type_obs_chk
    CHECK (type_observation IS NULL OR type_observation IN ('cours','mock_teaching')),
  ADD CONSTRAINT rapports_observation_synthese_chk
    CHECK (synthese IS NULL OR synthese IN ('excellent','satisfaisant','a_accompagner'));

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)                       AS total,
       COUNT(interactivite_classe)    AS avec_interactivite,
       COUNT(expression_engagement)   AS avec_expression,
       COUNT(synthese)                AS avec_synthese,
       COUNT(*) FILTER (WHERE incident_technique) AS incidents
  FROM public.rapports_observation;
