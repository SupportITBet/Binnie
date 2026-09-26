-- Nouveau rôle "Assistante SAV" (assistant_sav), distinct de "customer_care" —
-- role est un enum Postgres (bet_role), impossible d'insérer cette valeur sans cette migration.
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'assistant_sav';
