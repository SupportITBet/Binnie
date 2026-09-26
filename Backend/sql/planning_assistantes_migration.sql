-- ══════════════════════════════════════════════════════════════
-- PLANNING ASSISTANTES — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── Colonne jours_travail sur assistantes ─────────────────────
-- Tableau des jours où l'assistante est disponible
-- Valeurs possibles : lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche
ALTER TABLE public.assistantes
  ADD COLUMN IF NOT EXISTS jours_travail TEXT[]
  DEFAULT '{lundi,mardi,mercredi,jeudi,vendredi}';

-- ── Colonnes paiement sur assignations_parcours ───────────────
ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS mode_paiement    TEXT,
  ADD COLUMN IF NOT EXISTS statut_paiement  TEXT NOT NULL DEFAULT 'en_attente';

-- ── Mise à jour des assistantes existantes ────────────────────
-- Assistantes semaine → lun-ven
UPDATE public.assistantes
SET jours_travail = '{lundi,mardi,mercredi,jeudi,vendredi}'
WHERE type_semaine = 'semaine' AND jours_travail IS NULL;

-- Assistantes weekend → sam-dim
UPDATE public.assistantes
SET jours_travail = '{samedi,dimanche}'
WHERE type_semaine = 'weekend' AND jours_travail IS NULL;

-- Assistantes les_deux → toute la semaine
UPDATE public.assistantes
SET jours_travail = '{lundi,mardi,mercredi,jeudi,vendredi,samedi,dimanche}'
WHERE type_semaine = 'les_deux' AND jours_travail IS NULL;

-- ── Index ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assistantes_jours ON public.assistantes USING GIN(jours_travail);
CREATE INDEX IF NOT EXISTS idx_assignations_paiement ON public.assignations_parcours(statut_paiement);
