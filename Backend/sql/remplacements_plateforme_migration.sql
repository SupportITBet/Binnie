-- `remplacements` est une table partagée entre bet-elearning et dash (voir le
-- commentaire dans Backend/src/routes/remplacements.js). Jusqu'ici, sa validation
-- et sa logique de réattribution ne connaissaient QUE `seances_elearning`
-- (bet-elearning) — toute demande d'absence créée côté dash échouait donc
-- systématiquement (les séances dash vivent dans `seances`, une table différente).
--
-- Cette colonne permet de savoir, pour chaque remplacement, sur quelle table de
-- séances valider/réattribuer. NULL = bet-elearning (comportement historique,
-- aucune ligne existante n'est affectée).
ALTER TABLE remplacements ADD COLUMN IF NOT EXISTS plateforme TEXT;

-- Blocage structurel découvert en testant : `remplacements.groupe_id` porte une
-- clé étrangère vers `classes_elearning` (table bet-elearning). Elle rejette donc
-- inconditionnellement toute demande dash, dont le groupe_id référence `groupes`
-- (table distincte). Comme cette colonne doit désormais pouvoir pointer vers l'une
-- ou l'autre table selon `plateforme`, une FK unique ne peut plus l'exprimer — on
-- la retire, la validation d'appartenance groupe/coach restant déjà assurée
-- applicativement dans POST /api/remplacements (voir seancesVerif).
ALTER TABLE remplacements DROP CONSTRAINT IF EXISTS remplacements_groupe_id_fkey;

-- Même blocage sur `delegations.groupe_id` (créée dans PATCH /api/remplacements/:id
-- lors de l'assignation d'un remplaçant) — testé et confirmé : même erreur
-- ("Key (groupe_id)=... is not present in table classes_elearning").
ALTER TABLE delegations DROP CONSTRAINT IF EXISTS delegations_groupe_id_fkey;
