-- ════════════════════════════════════════════════════════════════════════════
--  CORRECTIF SÉCURITÉ - v_campagne_formulaire_stats contourne la RLS
--  Signalé par l'Advisor Supabase : « Security Definer View » (CRITICAL)
-- ════════════════════════════════════════════════════════════════════════════
--
--  LE PROBLÈME
--
--  Une vue PostgreSQL s'exécute par défaut avec les droits de SON PROPRIÉTAIRE, et non
--  avec ceux de celui qui la lit. Les politiques RLS des tables sous-jacentes sont donc
--  évaluées pour le propriétaire - qui les outrepasse - au lieu du lecteur réel.
--
--  Mesuré sur cette base avec la clé `anon`, celle qui est embarquée dans le bundle
--  JavaScript du navigateur et donc publique :
--
--      campagne_formulaires   ->  0 ligne   (RLS active, elle protège)
--      campagne_reponses      ->  0 ligne   (RLS active, elle protège)
--      campagne_diffusions    ->  0 ligne   (RLS active, elle protège)
--      v_campagne_formulaire_stats -> 2 LIGNES LISIBLES  ← la fuite
--
--  Un visiteur non connecté pouvait donc lire les titres, les slugs et les compteurs de
--  réponses et de conversions de toutes les campagnes, alors même que chaque table d'où
--  ces chiffres proviennent le lui refusait.
--
--  LE CORRECTIF
--
--  `security_invoker = true` (PostgreSQL 15+) inverse la règle : la vue s'exécute avec
--  les droits du LECTEUR, et la RLS des tables s'applique enfin à lui.
--
--  CE QUI CHANGE, CONCRÈTEMENT
--
--   · La clé `anon` et les comptes connectés ne verront plus que ce que la RLS des trois
--     tables leur accorde - aujourd'hui, rien. C'est le comportement voulu.
--   · Le Backend n'est PAS affecté : il interroge Supabase avec la clé de service, qui
--     outrepasse la RLS de toute façon. Aucune route ne change de comportement.
--   · Aucun code ne lit cette vue par son nom (vérifié sur Backend/src, dash/src et
--     bet-elearning/src) : rien ne peut casser côté application.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL DE SUPABASE.
-- ════════════════════════════════════════════════════════════════════════════

ALTER VIEW public.v_campagne_formulaire_stats SET (security_invoker = true);


-- ── Vérification ────────────────────────────────────────────────────────────
-- Doit renvoyer une ligne contenant `security_invoker=true`.
SELECT c.relname AS vue, c.reloptions AS options
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'v_campagne_formulaire_stats';
