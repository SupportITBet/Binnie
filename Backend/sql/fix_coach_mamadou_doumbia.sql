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
