-- Cible un contenu de bienvenue selon le type de coaching de l'apprenant (classe groupe
-- classique vs coaching privé) — le message/contenu de bienvenue n'a pas le même sens
-- selon le circuit, donc chaque contenu peut désormais être restreint à l'un des deux,
-- ou laissé à "tous" (comportement par défaut, ne casse rien sur les contenus existants).
ALTER TABLE contenus_onboarding_dash
  ADD COLUMN IF NOT EXISTS cible_coaching TEXT NOT NULL DEFAULT 'tous'
  CHECK (cible_coaching IN ('tous', 'particulier', 'prive'));
