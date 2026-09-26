-- ============================================================================
--  Mois soldé par un versement
-- ============================================================================
--
--  `POST /api/paiements/submit` accepte depuis longtemps un `mois_label` dans son
--  corps de requête, mais la colonne n'existait pas : la valeur était acceptée
--  puis perdue en silence, sans erreur ni trace.
--
--  Conséquence observée en production : rien ne relie un versement au mois de
--  cours qu'il règle. Or les deux divergent dès qu'un apprenant paie en
--  plusieurs fois — un plan à 100 000 F/mois réglé par tranches de 50 000 F
--  prend un mois de retard chaque mois, si bien qu'un versement encaissé le
--  1er août peut solder le mois de février. Lu sans cette mention, l'écran des
--  versements se confond avec l'échéancier.
--
--  Le rapprochement se fait pour l'instant côté interface, par la référence de
--  transaction (dash/src/utils/moisDuVersement.js). Cette colonne rend le lien
--  explicite pour les versements à venir, sans rien casser : elle naît vide, et
--  un `mois_label` absent fait simplement retomber l'affichage sur le
--  rapprochement par référence.
--
--  À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE paiements_parcours
  ADD COLUMN IF NOT EXISTS mois_label TEXT;

COMMENT ON COLUMN paiements_parcours.mois_label IS
  'Mois de cours soldé par ce versement (ex. « Février 2026 »). Distinct de date_paiement, qui est la date d''encaissement. Vide = rapprochement par ref_transaction.';

-- Vérification
SELECT COUNT(*) AS total, COUNT(mois_label) AS avec_mois_label FROM paiements_parcours;
