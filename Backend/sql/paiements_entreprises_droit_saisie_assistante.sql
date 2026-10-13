-- ══════════════════════════════════════════════════════════════════════════════
-- COMPLÉMENT à paiements_entreprises_preuves.sql
--
-- Ce fichier existe parce que la version exécutée de `paiements_entreprises_preuves.sql`
-- n'accordait que `peut_modifier` à l'assistante e-learning. Le droit de SAISIR un
-- versement (`peut_creer`) a été ajouté ensuite, à la demande « l'assistante peut
-- faire un versement aussi » - trop tard pour l'exécution déjà faite.
--
-- Vérifié en base le 11 octobre 2026 :
--   assistant_elearning · finances → creer = false, modifier = true
--
-- Conséquence observée : le bouton « + Nouveau versement » ne s'affichait pas et
-- l'onglet restait marqué « Lecture seule », alors que la validation des
-- déclarations, elle, fonctionnait (elle ne dépend que de `peut_modifier`).
--
-- Si vous exécutez `paiements_entreprises_preuves.sql` dans sa version actuelle,
-- ce fichier-ci est redondant : il fait exactement la même chose, sans dommage.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.permissions_roles
   SET peut_creer = true
 WHERE role = 'assistant_elearning'
   AND module = 'finances';

-- Vérification. Attendu : assistant_elearning en creer = true, modifier = true,
-- supprimer = false (annuler un encaissement reste aux rôles financiers de BET).
SELECT role, peut_lire, peut_creer, peut_modifier, peut_supprimer
  FROM public.permissions_roles
 WHERE module = 'finances'
   AND role IN ('assistant_elearning','commercial','super_admin')
 ORDER BY role;
