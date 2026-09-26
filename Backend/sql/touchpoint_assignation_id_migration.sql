-- ══════════════════════════════════════════════════════════════
-- TouchPoint : lien vers la fiche assignations_parcours d'un prospect
-- pour que le callback puisse marquer le paiement comme reçu côté
-- commerciale (onglet "Prospects parcours"), pas seulement dans
-- l'onglet Paiements. Voir Backend/src/routes/touchpoint.js.
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.paiements_touchpoint
  ADD COLUMN IF NOT EXISTS assignation_id UUID;

CREATE INDEX IF NOT EXISTS idx_tp_assignation ON public.paiements_touchpoint(assignation_id);
