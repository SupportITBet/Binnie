-- ════════════════════════════════════════════════════════════════════════════
--  LES DISPONIBILITÉS D'UN COACH, PAR PLATEFORME
-- ════════════════════════════════════════════════════════════════════════════
--
--  LE PROBLÈME
--
--  `coach_disponibilites` ne porte aucune marque de plateforme. Ses 840 lignes ont toutes
--  été saisies depuis l'Espace Professeur de DASH - c'est le seul écran qui écrive dans
--  cette table. Résultat : l'onglet « Disponibilités » du dossier coach, côté superviseur
--  bet-elearning, affichait les disponibilités déclarées pour le présentiel. On les a
--  retirées plutôt que de laisser croire qu'un coach s'était engagé sur des créneaux
--  e-learning qu'il n'a jamais déclarés.
--
--  Un coach peut être disponible le mardi matin pour un cours en ligne et indisponible pour
--  un cours en présentiel le même jour : le trajet n'est pas le même. Une seule grille pour
--  les deux plateformes ne peut donc pas être juste.
--
--  LA CONTRAINTE D'UNICITÉ DOIT SUIVRE, et c'est le point à ne pas manquer : elle porte
--  aujourd'hui sur (coach_id, mois, annee, jour, creneau). Sans `plateforme` dedans, la
--  déclaration faite sur bet-elearning ÉCRASERAIT celle de dash pour le même créneau -
--  l'`upsert` de `POST /api/coachs/disponibilites` les confondrait. On la remplace.
--
--  BACKFILL À 'dash' : toutes les lignes existantes viennent de là. Les attribuer à
--  bet-elearning, ou les laisser NULL, ferait apparaître côté e-learning des engagements
--  que personne n'y a pris.
--
--  Idempotent : réexécuter ce fichier ne casse rien.
--
--  À EXÉCUTER DANS L'ÉDITEUR SQL DE SUPABASE.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. La colonne ───────────────────────────────────────────────────────────
ALTER TABLE public.coach_disponibilites
  ADD COLUMN IF NOT EXISTS plateforme text NOT NULL DEFAULT 'dash';

COMMENT ON COLUMN public.coach_disponibilites.plateforme IS
  'Plateforme pour laquelle le créneau est déclaré : dash (présentiel) ou bet-elearning. '
  'Un coach peut être disponible sur l''une et pas sur l''autre au même créneau.';

-- ── 2. Les lignes existantes appartiennent toutes à dash ────────────────────
UPDATE public.coach_disponibilites
   SET plateforme = 'dash'
 WHERE plateforme IS NULL OR plateforme = '';

-- ── 3. L'unicité doit inclure la plateforme ─────────────────────────────────
--     Même procédé que coach_disponibilites_mois_migration.sql : on retrouve la contrainte
--     par le catalogue plutôt que par son nom, qui a déjà changé une fois.
DO $$
DECLARE conname text;
BEGIN
  SELECT tc.constraint_name INTO conname
    FROM information_schema.table_constraints tc
   WHERE tc.table_schema = 'public'
     AND tc.table_name = 'coach_disponibilites'
     AND tc.constraint_type = 'UNIQUE'
   LIMIT 1;

  IF conname IS NOT NULL AND conname <> 'coach_dispo_plateforme_key' THEN
    EXECUTE format('ALTER TABLE public.coach_disponibilites DROP CONSTRAINT %I', conname);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'public'
       AND table_name = 'coach_disponibilites'
       AND constraint_name = 'coach_dispo_plateforme_key'
  ) THEN
    ALTER TABLE public.coach_disponibilites
      ADD CONSTRAINT coach_dispo_plateforme_key
      UNIQUE (coach_id, plateforme, mois, annee, jour, creneau);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_coach_dispo_plateforme
  ON public.coach_disponibilites(coach_id, plateforme, mois, annee);


-- ── Vérification ────────────────────────────────────────────────────────────
-- 1. La répartition : tout doit être sur 'dash' juste après la migration.
SELECT plateforme, COUNT(*) AS lignes
  FROM public.coach_disponibilites
 GROUP BY plateforme
 ORDER BY plateforme;

-- 2. La contrainte d'unicité doit porter sur 6 colonnes, plateforme comprise.
SELECT tc.constraint_name,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS colonnes
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
 WHERE tc.table_schema = 'public'
   AND tc.table_name = 'coach_disponibilites'
   AND tc.constraint_type = 'UNIQUE'
 GROUP BY tc.constraint_name;
