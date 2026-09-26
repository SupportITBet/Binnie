-- La table `remplacements` avait été créée à l'origine pour l'ancien système "dash"
-- (contrainte vers `groupes`), jamais mise à jour depuis. Le schéma complet qu'on vient
-- d'implémenter (Backend/docs/remplacement-schema.html) fonctionne exclusivement avec les
-- classes bet-elearning (`classes_elearning`) — cette contrainte bloque donc tout insert réel.
ALTER TABLE public.remplacements
  DROP CONSTRAINT IF EXISTS remplacements_groupe_id_fkey;

ALTER TABLE public.remplacements
  ADD CONSTRAINT remplacements_groupe_id_fkey
  FOREIGN KEY (groupe_id) REFERENCES public.classes_elearning(id) ON DELETE SET NULL;

-- Même correction préventive sur `delegations.groupe_id` (table créée dans la migration
-- précédente sans contrainte stricte) — on la pose maintenant vers la bonne table.
ALTER TABLE public.delegations
  ADD CONSTRAINT delegations_groupe_id_fkey
  FOREIGN KEY (groupe_id) REFERENCES public.classes_elearning(id) ON DELETE SET NULL;
