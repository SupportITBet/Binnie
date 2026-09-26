-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `coachs`
-- Généré à partir de 3 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── coachs_migration.sql  (2026-05-08) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- TABLE COACHS — colonnes complètes
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS nom               TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS prenom            TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS grade             TEXT DEFAULT 'Coach';
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS photo_url         TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS actif             BOOLEAN DEFAULT true;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS biographie        TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS specialites       JSONB DEFAULT '[]';
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS niveaux_enseignes JSONB DEFAULT '[]';
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS experience_annees INT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS email_professionnel TEXT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS type_contrat      TEXT DEFAULT 'Freelance';
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS taux_horaire      INT;
ALTER TABLE public.coachs ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT now();

-- Désactiver RLS (accès service_role depuis backend)
ALTER TABLE public.coachs DISABLE ROW LEVEL SECURITY;

-- Voir ce qui existe après migration
SELECT id, nom, prenom, grade, actif, niveaux_enseignes FROM public.coachs;

-- ── fix_coach_mamadou_doumbia.sql  (2026-06-19) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- FIX : Remplacer MAMADOU DOUMBIA par Thierry Fodé dans les groupes
--        + Supprimer MAMADOU DOUMBIA de la base
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── 1. Vérification préalable (lire avant d'exécuter le reste) ──
SELECT 'MAMADOU DOUMBIA' AS recherche, id, nom, prenom, email, role, actif
FROM public.utilisateurs
WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%'
UNION ALL
SELECT 'THIERRY FODE' AS recherche, id, nom, prenom, email, role, actif
FROM public.utilisateurs
WHERE LOWER(nom) ILIKE '%fod%' AND LOWER(prenom) ILIKE '%thierry%';


-- ── 2. Vérifier les groupes actuellement assignés à Mamadou Doumbia ──
SELECT g.id, g.nom, g.coach_id, g.statut
FROM public.groupes g
WHERE g.coach_id = (
  SELECT id FROM public.utilisateurs
  WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%'
  LIMIT 1
);


-- ══════════════════════════════════════════════════════════════
-- !! EXÉCUTER LES BLOCS CI-DESSOUS SEULEMENT APRÈS VÉRIFICATION !!
-- ══════════════════════════════════════════════════════════════

-- ── 3. Réassigner les groupes de Mamadou Doumbia → Thierry Fodé ──
UPDATE public.groupes
SET coach_id = (
  SELECT id FROM public.utilisateurs
  WHERE LOWER(nom) ILIKE '%fod%' AND LOWER(prenom) ILIKE '%thierry%'
  LIMIT 1
)
WHERE coach_id = (
  SELECT id FROM public.utilisateurs
  WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%'
  LIMIT 1
);


-- ── 4. Supprimer Mamadou Doumbia de la table utilisateurs ──
DELETE FROM public.utilisateurs
WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%';


-- ── 5. Supprimer de la table coachs si entrée existante ──
DELETE FROM public.coachs
WHERE LOWER(nom) ILIKE '%doumbia%' AND LOWER(prenom) ILIKE '%mamadou%';


-- ── 6. Vérification finale ──
SELECT 'Groupes de Thierry Fodé après correction' AS info, g.id, g.nom, g.statut, g.coach_id
FROM public.groupes g
WHERE g.coach_id = (
  SELECT id FROM public.utilisateurs
  WHERE LOWER(nom) ILIKE '%fod%' AND LOWER(prenom) ILIKE '%thierry%'
  LIMIT 1
);

-- ── verif_thierry_fode.sql  (2026-06-19) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- DIAGNOSTIC COMPLET — Thierry Fodé & liste des coachs
-- ══════════════════════════════════════════════════════════════

-- 1. Thierry dans utilisateurs ?
SELECT id, nom, prenom, email, role, actif, coach_info
FROM public.utilisateurs
WHERE LOWER(nom) ILIKE '%fod%' OR LOWER(prenom) ILIKE '%thierry%';

-- 2. Thierry dans coachs ?
SELECT id, nom, prenom, grade
FROM public.coachs
WHERE LOWER(nom) ILIKE '%fod%' OR LOWER(prenom) ILIKE '%thierry%';

-- 3. Tous les utilisateurs role=coach
SELECT id, nom, prenom, email, actif, coach_info
FROM public.utilisateurs
WHERE role = 'coach';

-- 4. Tout ce qui est dans la table coachs
SELECT id, nom, prenom, grade
FROM public.coachs;

-- 5. Groupes et leur coach_id
SELECT id, nom, statut, coach_id
FROM public.groupes
ORDER BY created_at DESC LIMIT 10;

