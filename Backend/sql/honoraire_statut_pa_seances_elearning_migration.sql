-- Permet au PA Advisor de valider ou refuser individuellement chaque séance
-- e-learning réalisée qui entre dans le calcul des honoraires du coach
-- (mirroir du fonctionnement déjà existant côté "seances"/"honoraires_mois"
-- pour les professeurs présentiels, qui ont un honoraire_statut par séance).

ALTER TABLE seances_elearning
  ADD COLUMN IF NOT EXISTS honoraire_statut_pa text NOT NULL DEFAULT 'en_attente';
  -- valeurs : 'en_attente' | 'valide' | 'rejete'

ALTER TABLE seances_elearning
  ADD COLUMN IF NOT EXISTS honoraire_statut_pa_note text;

ALTER TABLE seances_elearning
  ADD COLUMN IF NOT EXISTS honoraire_statut_pa_par uuid REFERENCES utilisateurs(id);

ALTER TABLE seances_elearning
  ADD COLUMN IF NOT EXISTS honoraire_statut_pa_at timestamptz;
