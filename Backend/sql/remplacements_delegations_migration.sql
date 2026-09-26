-- Implémentation complète du schéma "Absence & remplacement coach"
-- (voir Backend/docs/remplacement-schema.html)

-- La table `remplacements` existe déjà (une ligne par absence signalée).
-- On ajoute juste le champ nécessaire pour savoir qui notifier à la clôture automatique.
ALTER TABLE public.remplacements
  ADD COLUMN IF NOT EXISTS assigne_par_id uuid;

-- Table `delegations` — lue par AuthContext.jsx côté frontend pour le badge "Délégation
-- active" du remplaçant, mais jusqu'ici jamais créée ni alimentée (référence orpheline).
CREATE TABLE IF NOT EXISTS public.delegations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remplacement_id text REFERENCES public.remplacements(id) ON DELETE CASCADE,
  titulaire_id   uuid NOT NULL,
  groupe_id      uuid,
  remplacant_id  uuid NOT NULL,
  sessions_ids   uuid[] NOT NULL DEFAULT '{}',
  date_debut     date,
  date_fin       date,
  statut         text NOT NULL DEFAULT 'active' CHECK (statut IN ('active','terminee')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delegations_remplacant ON public.delegations(remplacant_id, statut);
CREATE INDEX IF NOT EXISTS idx_delegations_remplacement ON public.delegations(remplacement_id);
