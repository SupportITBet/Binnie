-- ════════════════════════════════════════════════════════════════════════
-- RLS REMEDIATION — corrige les 161 alertes critiques du Security Advisor
-- Supabase ("RLS Disabled in Public" / "Policy Exists RLS Disabled").
--
-- CONTEXTE (voir audit de session) :
-- - Le Backend (Node/Express) utilise exclusivement la clé service_role,
--   qui IGNORE TOUJOURS la RLS — activer la RLS ne casse donc RIEN côté
--   Backend, quelle que soit la table.
-- - Frontend/dash/bet-elearning utilisent la clé publique (anon) et font
--   des appels Supabase DIRECTS depuis le navigateur pour ~17 tables
--   (voir liste des policies ci-dessous) — sans RLS, n'importe qui sur
--   internet peut lire/écrire ces tables via l'API REST brute de Supabase,
--   en contournant entièrement l'authentification et les permissions de
--   l'application.
--
-- STRATÉGIE :
-- 1. RLS activée sur TOUTES les tables du schéma public (refus par défaut
--    pour anon/authenticated tant qu'aucune policy n'est ajoutée — le
--    Backend continue de fonctionner via service_role).
-- 2. Policies ciblées uniquement sur les tables réellement accédées en
--    direct depuis le navigateur (identifiées par grep exhaustif de
--    `supabase.from(...)` dans Frontend/dash/bet-elearning).
-- 3. Niveau de restriction choisi : "authenticated = autorisé" pour les
--    cas où le rôle exact (admin vs apprenant vs parent) n'est pas
--    vérifiable simplement — ferme la faille "n'importe qui sur internet,
--    sans connexion" immédiatement, quitte à affiner plus tard par rôle.
--
-- Rejouable sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS partout).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. RLS activée partout (défaut-deny tant qu'aucune policy n'existe) ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;


-- ══════════════════════════════════════════════════════════════
-- 2. POLICIES CIBLÉES — tables accédées directement depuis le
--    navigateur (clé anon), identifiées dans l'audit de session.
-- ══════════════════════════════════════════════════════════════

-- ── plateforme_config ── config JSON publique (offres, centres, textes du
-- site public) : lecture publique nécessaire, écriture réservée aux
-- utilisateurs connectés (dash/bet-elearning staff, tous authentifiés via
-- Supabase Auth).
DROP POLICY IF EXISTS "plateforme_config_select_public" ON public.plateforme_config;
CREATE POLICY "plateforme_config_select_public" ON public.plateforme_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "plateforme_config_write_auth" ON public.plateforme_config;
CREATE POLICY "plateforme_config_write_auth" ON public.plateforme_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── temoignages ── lecture publique limitée aux témoignages validés et
-- actifs ; un apprenant connecté peut aussi voir SON propre témoignage
-- quel que soit son statut (page "Mon espace" affichant l'état de
-- modération). Écriture : toujours via le Backend (service_role), aucune
-- policy anon/authenticated nécessaire.
DROP POLICY IF EXISTS "temoignages_select_public_actifs" ON public.temoignages;
CREATE POLICY "temoignages_select_public_actifs" ON public.temoignages
  FOR SELECT TO anon, authenticated
  USING (actif = true AND statut = 'actif');

DROP POLICY IF EXISTS "temoignages_select_own" ON public.temoignages;
CREATE POLICY "temoignages_select_own" ON public.temoignages
  FOR SELECT TO authenticated
  USING (apprenant_id = auth.uid());


-- ── certifications ── un apprenant ne voit que ses propres certifications.
DROP POLICY IF EXISTS "certifications_select_own" ON public.certifications;
CREATE POLICY "certifications_select_own" ON public.certifications
  FOR SELECT TO authenticated
  USING (apprenant_id = auth.uid());


-- ── utilisateurs ── lecture réservée aux utilisateurs connectés (couvre
-- à la fois "voir mon propre profil" et les cas de lookup croisé déjà en
-- place — nom d'un titulaire délégant, avatar des enfants d'un parent —
-- qui ne se limitent pas à une seule ligne). Écriture toujours via Backend.
DROP POLICY IF EXISTS "utilisateurs_select_authenticated" ON public.utilisateurs;
CREATE POLICY "utilisateurs_select_authenticated" ON public.utilisateurs
  FOR SELECT TO authenticated USING (true);


-- ── notifications ── strictement la ligne de l'utilisateur connecté —
-- couvre aussi bien les lectures REST que les abonnements Realtime
-- (postgres_changes respecte la RLS de la table).
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ── delegations ── un coach ne voit que les délégations où il est
-- remplaçant ou titulaire délégant.
DROP POLICY IF EXISTS "delegations_select_own" ON public.delegations;
CREATE POLICY "delegations_select_own" ON public.delegations
  FOR SELECT TO authenticated
  USING (remplacant_id = auth.uid() OR titulaire_id = auth.uid());


-- ── classes_elearning_apprenants ── l'apprenant lui-même, ou le parent
-- identifié par son email (auth.email() = email_parent, comme déjà utilisé
-- côté application dans DashboardParent.jsx).
DROP POLICY IF EXISTS "cea_select_own_or_parent" ON public.classes_elearning_apprenants;
CREATE POLICY "cea_select_own_or_parent" ON public.classes_elearning_apprenants
  FOR SELECT TO authenticated
  USING (apprenant_id = auth.uid() OR email_parent = auth.email());


-- ── Tables scopées par inscription_id (= id d'une ligne de
-- classes_elearning_apprenants) : présences, résultats, devoirs rendus,
-- avis coach, progression — accès à l'apprenant concerné ou son parent.
DROP POLICY IF EXISTS "presences_elearning_select_own" ON public.presences_elearning;
CREATE POLICY "presences_elearning_select_own" ON public.presences_elearning
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes_elearning_apprenants cea
    WHERE cea.id = presences_elearning.inscription_id
      AND (cea.apprenant_id = auth.uid() OR cea.email_parent = auth.email())
  ));

DROP POLICY IF EXISTS "resultats_elearning_select_own" ON public.resultats_elearning;
CREATE POLICY "resultats_elearning_select_own" ON public.resultats_elearning
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes_elearning_apprenants cea
    WHERE cea.id = resultats_elearning.inscription_id
      AND (cea.apprenant_id = auth.uid() OR cea.email_parent = auth.email())
  ));

DROP POLICY IF EXISTS "devoirs_rendus_elearning_select_own" ON public.devoirs_rendus_elearning;
CREATE POLICY "devoirs_rendus_elearning_select_own" ON public.devoirs_rendus_elearning
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes_elearning_apprenants cea
    WHERE cea.id = devoirs_rendus_elearning.inscription_id
      AND (cea.apprenant_id = auth.uid() OR cea.email_parent = auth.email())
  ));

-- inscription_id/classe_id sont stockées en text sur cette table (contrairement
-- aux autres), d'où le cast explicite vers uuid pour la comparaison à cea.id.
DROP POLICY IF EXISTS "avis_parents_coach_select_own" ON public.avis_parents_coach;
CREATE POLICY "avis_parents_coach_select_own" ON public.avis_parents_coach
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes_elearning_apprenants cea
    WHERE cea.id = avis_parents_coach.inscription_id::uuid
      AND (cea.apprenant_id = auth.uid() OR cea.email_parent = auth.email())
  ));

DROP POLICY IF EXISTS "progression_elearning_select_own" ON public.progression_elearning;
CREATE POLICY "progression_elearning_select_own" ON public.progression_elearning
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes_elearning_apprenants cea
    WHERE cea.id = progression_elearning.inscription_id
      AND (cea.apprenant_id = auth.uid() OR cea.email_parent = auth.email())
  ));


-- ── Tables scopées par classe_id : séances, devoirs, contenus — accès à
-- tout apprenant/parent inscrit à cette classe.
DROP POLICY IF EXISTS "seances_elearning_select_enrolled" ON public.seances_elearning;
CREATE POLICY "seances_elearning_select_enrolled" ON public.seances_elearning
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes_elearning_apprenants cea
    WHERE cea.classe_id = seances_elearning.classe_id
      AND (cea.apprenant_id = auth.uid() OR cea.email_parent = auth.email())
  ));

DROP POLICY IF EXISTS "devoirs_elearning_select_enrolled" ON public.devoirs_elearning;
CREATE POLICY "devoirs_elearning_select_enrolled" ON public.devoirs_elearning
  FOR SELECT TO authenticated
  USING (statut = 'publie' AND EXISTS (
    SELECT 1 FROM public.classes_elearning_apprenants cea
    WHERE cea.classe_id = devoirs_elearning.classe_id
      AND (cea.apprenant_id = auth.uid() OR cea.email_parent = auth.email())
  ));

DROP POLICY IF EXISTS "contenus_classes_elearning_select_enrolled" ON public.contenus_classes_elearning;
CREATE POLICY "contenus_classes_elearning_select_enrolled" ON public.contenus_classes_elearning
  FOR SELECT TO authenticated
  USING (est_visible = true AND EXISTS (
    SELECT 1 FROM public.classes_elearning_apprenants cea
    WHERE cea.classe_id = contenus_classes_elearning.classe_id
      AND (cea.apprenant_id = auth.uid() OR cea.email_parent = auth.email())
  ));


-- ── classes_elearning / remplacements ── lus pour afficher des libellés
-- (nom de classe, "assigné par X") dans des bannières de délégation coach
-- ou des dashboards apprenant/parent. Relation exacte au rôle non
-- vérifiable simplement ici — accès ouvert à tout utilisateur connecté,
-- ferme au moins l'accès anonyme.
DROP POLICY IF EXISTS "classes_elearning_select_authenticated" ON public.classes_elearning;
CREATE POLICY "classes_elearning_select_authenticated" ON public.classes_elearning
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "remplacements_select_authenticated" ON public.remplacements;
CREATE POLICY "remplacements_select_authenticated" ON public.remplacements
  FOR SELECT TO authenticated USING (true);
