-- ════════════════════════════════════════════════════════════════════════
-- Corrige les 5 dernières alertes Advisor ("Security Definer View") restées
-- après rls_remediation_2026-08-07.sql — les vues ne sont pas concernées
-- par ENABLE ROW LEVEL SECURITY (ça ne s'applique qu'aux tables), donc
-- elles n'étaient pas couvertes par le script précédent.
--
-- Une vue "SECURITY DEFINER" s'exécute avec les droits de son créateur —
-- elle peut donc lire les tables sous-jacentes en contournant entièrement
-- la RLS qu'on vient d'activer dessus. Passer en "SECURITY INVOKER" (le
-- comportement par défaut recommandé) fait que la vue respecte les droits
-- de la personne qui l'interroge — ni la logique ni les colonnes de la vue
-- ne changent, uniquement son mode d'exécution.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

ALTER VIEW public.vue_ca_mensuel               SET (security_invoker = true);
ALTER VIEW public.vue_utilisateurs_permissions SET (security_invoker = true);
ALTER VIEW public.v_temoignages_attente        SET (security_invoker = true);
ALTER VIEW public.vue_presences_elearning_classe SET (security_invoker = true);
ALTER VIEW public.vue_honoraires_elearning     SET (security_invoker = true);
