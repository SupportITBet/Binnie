-- ════════════════════════════════════════════════════════════════════════════
-- Fin de session après inactivité — la garde côté SERVEUR
--
-- POURQUOI. Le tableau de bord déconnecte désormais une personne inactive, mais un écran
-- ne protège que lui-même : un jeton copié depuis le stockage d'un navigateur reste
-- utilisable jusqu'à son expiration, quoi qu'affiche l'interface. Le seul verrou qu'on ne
-- peut pas contourner est celui que le serveur applique à chaque requête.
--
-- UNE COLONNE SÉPARÉE DE `derniere_connexion`. Cette dernière dit quand le compte s'est
-- authentifié — une information qu'on lit ailleurs (comptes dormants, audit). L'écraser à
-- chaque appel d'API la transformerait en « dernière requête » et ferait disparaître la
-- notion même de connexion.
--
-- ÉCRITE AU PLUS UNE FOIS TOUTES LES CINQ MINUTES, depuis le middleware. Une écriture par
-- requête serait absurde sur 83 fichiers de routes ; l'imprécision de cinq minutes est
-- sans conséquence sur un délai d'une heure.
--
-- NULL VEUT DIRE « JAMAIS VU DEPUIS CETTE MISE EN PLACE », et non « inactif depuis
-- toujours » : les 340 comptes existants ne doivent pas se retrouver déconnectés à la
-- première requête. Le middleware traite donc NULL comme une activité à l'instant.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS derniere_activite timestamptz;

-- Le middleware lit cette colonne à chaque requête authentifiée : sans index, chaque appel
-- d'API déclencherait un parcours de la table.
CREATE INDEX IF NOT EXISTS idx_utilisateurs_derniere_activite
  ON utilisateurs (derniere_activite);

COMMENT ON COLUMN utilisateurs.derniere_activite IS
  'Dernier appel d''API authentifié, rafraîchi au plus toutes les 5 min. Distincte de `derniere_connexion` : sert à fermer une session inactive côté serveur. NULL = jamais mesurée, traitée comme active.';
