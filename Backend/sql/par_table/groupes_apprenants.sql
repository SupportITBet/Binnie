-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `groupes_apprenants`
-- Généré à partir de 6 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── groupes_migration.sql  (2026-05-21) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- GROUPES & APPRENANTS — Migration BET
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── Groupes de cours ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom           TEXT        NOT NULL,
  niveau        TEXT,
  filiere       TEXT,
  type_cours    TEXT        NOT NULL DEFAULT 'en_ligne',
  coach_id      UUID,
  centre_id     UUID,
  horaire       JSONB       DEFAULT '[]',
  date_debut    DATE,
  date_fin      DATE,
  statut        TEXT        NOT NULL DEFAULT 'actif',
  capacite_max  INT         DEFAULT 20,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID
);

ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS nom          TEXT;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS niveau       TEXT;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS filiere      TEXT;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS type_cours   TEXT NOT NULL DEFAULT 'en_ligne';
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS coach_id     UUID;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS centre_id    UUID;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS horaire      JSONB DEFAULT '[]';
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS date_debut   DATE;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS date_fin     DATE;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS statut       TEXT NOT NULL DEFAULT 'actif';
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS capacite_max INT  DEFAULT 20;
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS created_by   UUID;

-- ── Apprenants dans les groupes (pivot) ────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes_apprenants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id       UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  apprenant_id    TEXT,
  nom_apprenant   TEXT        NOT NULL,
  prenom_apprenant TEXT,
  email_apprenant TEXT,
  telephone       TEXT,
  niveau          TEXT,
  date_ajout      TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_retrait    TIMESTAMPTZ,
  statut          TEXT        NOT NULL DEFAULT 'actif',
  added_by        UUID,
  note            TEXT
);

ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS apprenant_id     TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS prenom_apprenant  TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS email_apprenant   TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS telephone         TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS niveau            TEXT;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS date_retrait      TIMESTAMPTZ;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS added_by          UUID;
ALTER TABLE public.groupes_apprenants ADD COLUMN IF NOT EXISTS note              TEXT;

-- ── Fichiers partagés dans les groupes ────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes_fichiers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id    UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  coach_id     UUID,
  nom          TEXT        NOT NULL,
  url          TEXT        NOT NULL,
  public_id    TEXT,
  type_fichier TEXT        DEFAULT 'autre',
  taille_ko    INT,
  visible      BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.groupes_fichiers ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT true;

-- ── Index ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_groupes_coach   ON public.groupes(coach_id);
CREATE INDEX IF NOT EXISTS idx_groupes_statut  ON public.groupes(statut);
CREATE INDEX IF NOT EXISTS idx_ga_groupe       ON public.groupes_apprenants(groupe_id);
CREATE INDEX IF NOT EXISTS idx_ga_statut       ON public.groupes_apprenants(statut);
CREATE INDEX IF NOT EXISTS idx_gf_groupe       ON public.groupes_fichiers(groupe_id);

-- ── centre_id en TEXT (clé textuelle type "angre", "cocody"…) ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groupes'
      AND column_name = 'centre_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.groupes ALTER COLUMN centre_id TYPE TEXT USING centre_id::TEXT;
  END IF;
END $$;

-- ── Traçabilité : nom lisible du créateur ──────────────────────
ALTER TABLE public.groupes ADD COLUMN IF NOT EXISTS created_by_nom TEXT;

-- ── RLS désactivé (accès service_role depuis backend) ─────────
ALTER TABLE public.groupes           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupes_apprenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupes_fichiers  DISABLE ROW LEVEL SECURITY;

-- ── Présences par séance ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes_presences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id       UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  ga_id           UUID,                          -- groupes_apprenants.id
  nom_apprenant   TEXT        NOT NULL,
  prenom_apprenant TEXT,
  date_seance     DATE        NOT NULL,
  statut          TEXT        NOT NULL DEFAULT 'present', -- present | absent | retard | excuse
  note            TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gp_groupe   ON public.groupes_presences(groupe_id);
CREATE INDEX IF NOT EXISTS idx_gp_date     ON public.groupes_presences(date_seance);
ALTER TABLE public.groupes_presences DISABLE ROW LEVEL SECURITY;

-- ── Historique des cours par groupe ───────────────────────────
CREATE TABLE IF NOT EXISTS public.groupes_cours (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe_id       UUID        NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  coach_id        UUID,
  date_cours      DATE        NOT NULL,
  objectif        TEXT,
  grammaire       TEXT,
  sujet_discussion TEXT,
  statut          TEXT        NOT NULL DEFAULT 'dispense',
  -- dispense | annule | apprenant_absent | coach_absent | catch_up | holiday
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gc_groupe ON public.groupes_cours(groupe_id);
CREATE INDEX IF NOT EXISTS idx_gc_date   ON public.groupes_cours(date_cours DESC);
ALTER TABLE public.groupes_cours DISABLE ROW LEVEL SECURITY;

-- ── archive_apprenants_migration.sql  (2026-06-19) ──────────────────────────────

-- Migration : colonnes archivage apprenants
-- Table : groupes_apprenants
-- À exécuter dans Supabase SQL Editor

ALTER TABLE groupes_apprenants
  ADD COLUMN IF NOT EXISTS motif_pause         TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS detail_motif        TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duree_pause_estimee TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date_reprise_prevue TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date_pause          TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS date_reactivation   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archive_par         UUID        DEFAULT NULL REFERENCES utilisateurs(id) ON DELETE SET NULL;

-- Permettre les nouveaux statuts
-- (si la colonne statut a une contrainte CHECK, l'adapter)
-- ALTER TABLE groupes_apprenants
--   DROP CONSTRAINT IF EXISTS groupes_apprenants_statut_check;
-- ALTER TABLE groupes_apprenants
--   ADD CONSTRAINT groupes_apprenants_statut_check
--   CHECK (statut IN ('actif','periode_test','transfere','retire','en_pause','archive'));

-- Index pour accélérer les requêtes archives
CREATE INDEX IF NOT EXISTS idx_ga_statut_pause ON groupes_apprenants(statut)
  WHERE statut IN ('en_pause','archive');

-- ── bilans_renouvellement_groupes_apprenants_migration.sql  (2026-07-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Bilans & Renouvellements réels (onglet OnboardingDashboard.jsx)
-- Remplace l'ancienne liste mockée (INIT_BILANS) — les bilans/candidats
-- sont calculés à la volée (groupes.date_fin, groupes_presences,
-- resultats_evaluations_groupes), seul l'état de l'alerte commerciale
-- doit être persisté.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE groupes_apprenants ADD COLUMN IF NOT EXISTS bilan_alerte_envoyee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE groupes_apprenants ADD COLUMN IF NOT EXISTS bilan_alerte_date TIMESTAMPTZ;

-- ── suivi_demarrage_groupes_apprenants_migration.sql  (2026-07-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Suivi de démarrage réel des apprenants fraîchement inscrits, sur
-- OnboardingDashboard.jsx (onglet "Suivi démarrage") et sur le
-- dashboard de la commerciale centre (présentiel, son propre suivi).
-- Remplace l'ancienne checklist mockée (INIT_SUIVIS) par un vrai état
-- persistant, porté directement par groupes_apprenants.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE groupes_apprenants ADD COLUMN IF NOT EXISTS suivi_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE groupes_apprenants ADD COLUMN IF NOT EXISTS suivi_notes TEXT;

-- ── anti_doublon_migration.sql  (9999) ──────────────────────────────
-- 0. Colonne de rattachement à un compte apprenant existant (identité stable,
--    au lieu de ne compter que sur une comparaison d'email en texte libre).
ALTER TABLE assignations_parcours ADD COLUMN IF NOT EXISTS apprenant_id uuid REFERENCES utilisateurs(id);

-- Anti-doublon (défense en profondeur au niveau base de données)
-- ⚠️ À exécuter APRÈS avoir nettoyé les doublons existants (voir rapport fourni
-- séparément) — sinon la création des index échouera (Postgres refuse un index
-- unique si des lignes en violent déjà la contrainte).
--
-- Objectif : même si un bug applicatif futur recontourne les vérifications
-- côté code (Backend/src/routes/parcours.js et groupes.js), la base elle-même
-- refuse désormais la création d'un doublon.

-- 1. groupes_apprenants : une même personne (apprenant_id, ou à défaut email)
--    ne peut avoir qu'UNE ligne active (non "retire") par classe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_groupes_apprenants_actif_par_apprenant
  ON groupes_apprenants (groupe_id, apprenant_id)
  WHERE statut <> 'retire' AND apprenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_groupes_apprenants_actif_par_email
  ON groupes_apprenants (groupe_id, lower(email_apprenant))
  WHERE statut <> 'retire' AND apprenant_id IS NULL AND email_apprenant IS NOT NULL;

-- 2. assignations_parcours : un même prospect (email) ne peut avoir qu'UN dossier
--    actif par canal (type_cours + type_coaching + centre_id, coalescés pour que
--    deux NULL soient considérés identiques). Profils "enfant" scopés en plus par
--    l'enfant (un même parent peut légitimement inscrire plusieurs enfants).
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignations_actif_par_canal
  ON assignations_parcours (
    lower(prospect_email), type_cours,
    COALESCE(type_coaching, ''), COALESCE(centre_id::text, '')
  )
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND (profil_type IS DISTINCT FROM 'enfant');

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignations_actif_par_canal_enfant
  ON assignations_parcours (
    lower(prospect_email), type_cours,
    COALESCE(type_coaching, ''), COALESCE(centre_id::text, ''),
    lower(COALESCE(prenom_enfant, '')), lower(COALESCE(nom_enfant, ''))
  )
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND profil_type = 'enfant';

-- ── nettoyage_doublons_avant_index.sql  (9999) ──────────────────────────────
-- Nettoyage des doublons existants — À EXÉCUTER AVANT anti_doublon_migration.sql
-- (les CREATE UNIQUE INDEX de ce fichier échouent tant que ces doublons existent).
--
-- Principe : rien n'est supprimé physiquement. Pour chaque groupe de doublons,
-- on garde 1 seule ligne "de référence" (la plus avancée : paiement reçu > montant
-- le plus élevé > statut converti > la plus ancienne), et on fait passer les autres
-- au statut d'annulation/retrait déjà utilisé partout ailleurs dans l'app — donc
-- réversible et consultable dans les archives/dossiers annulés.
--
-- ⚠️ Deux groupes ont été signalés comme ambigus (montants différents pouvant être
-- 2 vrais paiements) : ils sont traités par la même règle automatique ci-dessous
-- pour permettre la création des index, mais vérifiez-les après coup :
--   - Siaka koudou (doumbia99siaka@gmail.com, présentiel)
--   - jr valverde (valverde@gmail.com, presentiel/prive)

BEGIN;

-- 1. assignations_parcours : annuler tous les doublons sauf le "meilleur" par groupe
WITH classement AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(prospect_email), type_cours,
        COALESCE(type_coaching, ''), COALESCE(centre_id::text, ''),
        CASE WHEN profil_type = 'enfant' THEN lower(COALESCE(prenom_enfant,'')) END,
        CASE WHEN profil_type = 'enfant' THEN lower(COALESCE(nom_enfant,'')) END
      ORDER BY
        CASE WHEN statut_paiement IN ('reçu','paye','confirme') THEN 0
             WHEN statut_paiement = 'partiel' THEN 1
             ELSE 2 END,
        COALESCE(montant_paye, 0) DESC,
        CASE WHEN statut = 'converti' THEN 0 ELSE 1 END,
        created_at ASC
    ) AS rang
  FROM assignations_parcours
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND prospect_email IS NOT NULL
)
UPDATE assignations_parcours a
SET statut = 'annule',
    notes = COALESCE(notes || E'\n', '') || '[NETTOYAGE DOUBLON] Dossier dupliqué, annulé automatiquement — voir dossier conservé pour ce même prospect/canal.'
FROM classement c
WHERE a.id = c.id AND c.rang > 1;

-- 2. groupes_apprenants : retirer tous les doublons sauf le "meilleur" par classe
WITH classement_ga AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY groupe_id, COALESCE(apprenant_id::text, lower(email_apprenant))
      ORDER BY date_ajout ASC
    ) AS rang
  FROM groupes_apprenants
  WHERE statut <> 'retire'
    AND (apprenant_id IS NOT NULL OR email_apprenant IS NOT NULL)
)
UPDATE groupes_apprenants g
SET statut = 'retire',
    note = COALESCE(note || E'\n', '') || '[NETTOYAGE DOUBLON] Inscription dupliquée, retirée automatiquement.'
FROM classement_ga c
WHERE g.id = c.id AND c.rang > 1;

COMMIT;

-- Vérification rapide après exécution (doit retourner 0 lignes des deux côtés) :
-- SELECT lower(prospect_email), type_cours, COALESCE(type_coaching,''), COALESCE(centre_id::text,''), count(*)
--   FROM assignations_parcours WHERE statut NOT IN ('annule','annulee','refuse','refusee')
--   GROUP BY 1,2,3,4 HAVING count(*) > 1;
-- SELECT groupe_id, COALESCE(apprenant_id::text, lower(email_apprenant)), count(*)
--   FROM groupes_apprenants WHERE statut <> 'retire'
--   GROUP BY 1,2 HAVING count(*) > 1;

