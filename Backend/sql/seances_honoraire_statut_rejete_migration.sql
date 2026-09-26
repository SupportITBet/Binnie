-- seances.honoraire_statut n'accepte aujourd'hui que 'en_attente'/'valide' (contrainte
-- seances_honoraire_statut_check confirmée par test direct). Pour permettre au PA de
-- rejeter une séance individuelle (comme côté bet-elearning), il faut 'rejete'.
-- On ajoute aussi la traçabilité par séance (note, qui, quand) — seances a déjà
-- honoraire_valide_par/honoraire_valide_at pour la validation, mais rien pour le rejet.

ALTER TABLE seances
  DROP CONSTRAINT IF EXISTS seances_honoraire_statut_check;

ALTER TABLE seances
  ADD CONSTRAINT seances_honoraire_statut_check
  CHECK (honoraire_statut IN ('en_attente', 'valide', 'rejete'));

ALTER TABLE seances
  ADD COLUMN IF NOT EXISTS honoraire_statut_note text;
