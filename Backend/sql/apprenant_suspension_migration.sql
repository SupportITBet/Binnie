-- Ajouter le champ de suspension globale sur les apprenants
ALTER TABLE public.utilisateurs
  ADD COLUMN IF NOT EXISTS acces_bloque BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_utilisateurs_acces_bloque ON public.utilisateurs(acces_bloque);
