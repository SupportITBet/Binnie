-- ════════════════════════════════════════════════════════════════════════
-- RLS REMEDIATION — 2026-10-04
-- Referme les tables créées DEPUIS rls_remediation_2026-08-07.sql.
--
-- POURQUOI UNE SECONDE PASSE. Le script d'août activait la RLS par une
-- boucle sur `pg_tables` : correct au moment où il a été joué, mais une
-- boucle ne protège pas les tables créées APRÈS. Toute table ajoutée
-- depuis est née sans RLS, donc ouverte. Le Security Advisor en signale
-- trois ce jour :
--   · public.assignations_parcours
--   · public.assistantes
--   · public.sessions_live_verification
--
-- CE QUI A ÉTÉ VÉRIFIÉ, et non supposé — sondes exécutées avec la clé
-- `anon` seule, SANS AUCUNE AUTHENTIFICATION :
--   · SELECT  assignations_parcours → 88 lignes rendues (noms, e-mails,
--             téléphones, plans de paiement de tous les apprenants)
--   · SELECT  assistantes           → 25 lignes (noms, e-mails, téléphones)
--   · INSERT  → rejeté par un NOT NULL (23502), donc AUTORISÉ par les droits
--   · UPDATE  → ACCEPTÉ, 1 ligne réécrite
--   · DELETE  → ACCEPTÉ
-- Cette clé `anon` est inlinée dans les bundles JavaScript de `dash`,
-- `frontend` et `bet-elearning` (`REACT_APP_SUPABASE_ANON_KEY`) : elle est
-- lisible par quiconque ouvre le site. Il ne s'agit donc pas d'une faille
-- théorique mais d'un accès en lecture ET EN ÉCRITURE ouvert à internet sur
-- le fichier client de BET.
--
-- POURQUOI CELA NE CASSE RIEN :
--   · le Backend utilise exclusivement la clé `service_role`, qui IGNORE
--     TOUJOURS la RLS ;
--   · aucun frontend n'interroge ces trois tables en direct (grep exhaustif
--     de `supabase.from(...)` sur dash/frontend/bet-elearning/Frontend) —
--     tout passe par le Backend.
--
-- Rejouable sans risque.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. RLS activée partout, y compris sur les tables nées depuis août ──
-- La même boucle qu'en août, volontairement : c'est elle qu'il faut rejouer
-- après toute création de table, et la rejouer est sans effet sur celles qui
-- sont déjà protégées.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;


-- ── 2. AUCUNE POLICY À AJOUTER — et c'est vérifié, pas supposé ──
-- Le risque de l'étape 1 est de couper un écran qui lisait une table en
-- direct. Comparaison faite entre les tables réellement interrogées depuis
-- un navigateur (grep de `supabase.from(...)` sur les quatre frontends) et
-- celles déjà couvertes par une policy : une seule différence,
-- `fichiers_classes_elearning` — et elle porte ses propres policies depuis
-- sa migration d'origine (`fichiers_classes_elearning_migration.sql`, RLS
-- activée + `fce_select`/`fce_insert`/`fce_update` sur `authenticated`).
-- Rien d'autre à écrire ici.
--
-- À NOTER POUR PLUS TARD, sans l'inclure dans ce correctif de sécurité :
-- `fce_select` ouvre la lecture à TOUT utilisateur connecté, là où les
-- tables sœurs (`contenus_classes_elearning`, `devoirs_elearning`) la
-- restreignent aux inscrits de la classe. C'est un resserrement souhaitable
-- mais qui touche aussi les coachs — à traiter à part, pas en urgence.


-- ── 3. La vue SECURITY DEFINER signalée par l'Advisor ──
-- Une vue SECURITY DEFINER s'exécute avec les droits de son créateur : elle
-- lit donc les tables sous-jacentes en contournant la RLS qu'on vient
-- d'activer. `security_invoker` la fait respecter les droits de celui qui
-- l'interroge. Ni la logique ni les colonnes ne changent, seulement le mode
-- d'exécution.
ALTER VIEW public.v_campagne_performance_diffusion SET (security_invoker = true);


-- ── 4. Contrôle — doit ne rien renvoyer ──
-- Toute ligne rendue est une table encore ouverte.
SELECT tablename AS table_sans_rls
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT rowsecurity
ORDER BY tablename;
