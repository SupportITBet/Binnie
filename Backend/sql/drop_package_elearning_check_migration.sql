-- Le catalogue de packages commerciaux est maintenant dynamique (table packages_commerciaux,
-- gérée depuis Configuration > Packages & Contrats) et supporte aussi les packages personnalisés
-- ('personnalise'). L'ancienne contrainte figeait la liste à 4 valeurs historiques
-- ('starter','business','premium','enterprise'), ce qui rejette désormais toute création
-- d'entreprise avec un package ajouté depuis l'admin (ex: "Starter Plus") ou un package
-- personnalisé — d'où l'erreur "violates check constraint comptes_entreprises_package_elearning_c...".
ALTER TABLE comptes_entreprises DROP CONSTRAINT IF EXISTS comptes_entreprises_package_elearning_check;

-- Même contrainte figée sur la table des contrats (colonne "package"), même cause.
ALTER TABLE contrats_entreprises_elearning DROP CONSTRAINT IF EXISTS contrats_entreprises_elearning_package_check;
