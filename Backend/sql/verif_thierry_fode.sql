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
