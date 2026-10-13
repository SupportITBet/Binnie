-- ============================================================================
--  Minuteur de composition sur les devoirs à rendre en TEXTE
-- ============================================================================
--
--  LE MANQUE. La date limite borne le DÉPÔT, pas la DURÉE de l'épreuve. Un devoir
--  « composition » à rendre pour le 20 octobre pouvait être travaillé pendant six
--  jours, dictionnaire ouvert. Pour une rédaction notée, ce n'est pas la même
--  épreuve selon qu'on y passe deux heures ou une semaine.
--
--  `duree_min` ouvre un chrono qui démarre à la PREMIÈRE OUVERTURE du devoir par
--  l'apprenant — pas à sa publication, sinon il serait écoulé avant d'être lu.
--
--  NULL = AUCUN MINUTEUR, et c'est le défaut. La colonne s'ajoute sur des devoirs
--  déjà publiés : leur donner une durée rétroactivement fermerait des copies en
--  cours. Le minuteur est une option que le coach active, pas une règle imposée.
--
--  `commence_at` VIT SUR LE RENDU, PAS SUR LE DEVOIR : le chrono est propre à
--  chaque apprenant. Deux élèves ouvrant la même composition à deux heures
--  d'écart ont chacun leur fenêtre.
--
--  Il est enregistré CÔTÉ SERVEUR et non dans le navigateur : sinon vider son
--  cache, changer d'appareil ou ouvrir une fenêtre privée suffirait à repartir à
--  zéro.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE devoirs_elearning
  ADD COLUMN IF NOT EXISTS duree_min INTEGER;

COMMENT ON COLUMN devoirs_elearning.duree_min IS
  'Durée de composition en minutes, décomptée depuis la première ouverture par l''apprenant. NULL = pas de minuteur (défaut). Ne s''applique qu''aux devoirs à rendre en texte.';

ALTER TABLE devoirs_rendus_elearning
  ADD COLUMN IF NOT EXISTS commence_at TIMESTAMPTZ;

COMMENT ON COLUMN devoirs_rendus_elearning.commence_at IS
  'Date et heure de la première ouverture du devoir par cet apprenant. Point de départ du minuteur ; NULL tant qu''il ne l''a pas ouvert.';

-- Retrouver les copies en cours dont le chrono a expiré, sans parcourir toute la
-- table : c'est l'unique requête du balayage périodique.
CREATE INDEX IF NOT EXISTS idx_devoirs_rendus_commence_at
  ON devoirs_rendus_elearning (commence_at)
  WHERE commence_at IS NOT NULL;

-- Vérification : aucun devoir existant ne doit avoir hérité d'un minuteur.
SELECT COUNT(*)                                    AS total_devoirs,
       COUNT(*) FILTER (WHERE duree_min IS NOT NULL) AS avec_minuteur,
       (SELECT COUNT(*) FROM devoirs_rendus_elearning WHERE commence_at IS NOT NULL) AS compositions_commencees
  FROM devoirs_elearning;
