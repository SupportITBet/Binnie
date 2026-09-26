-- Nettoyage — suppression de tables mortes (2026-08-01)
-- Vérifié avant génération : 0 référence dans Backend/src, dash/src, bet-elearning/src,
-- Frontend/src (grep exhaustif), 0 ligne de données (count via API Supabase),
-- 0 trace dans les migrations SQL suivies dans ce dossier (hors faux positifs de
-- sous-chaîne écartés manuellement : coach_disponibilites, onboarding_contenus).
--
-- À exécuter manuellement dans le SQL Editor de Supabase après relecture.
-- IF EXISTS partout : sans danger si une table a déjà été supprimée entre-temps.
-- Pas de CASCADE volontairement : si une dépendance existe (FK non détectée),
-- la suppression échouera proprement plutôt que d'entraîner une suppression en chaîne.

DROP TABLE IF EXISTS public.disponibilites_coach;
DROP TABLE IF EXISTS public.historique_acces;
DROP TABLE IF EXISTS public.historique_requetes;
DROP TABLE IF EXISTS public.materiels;
DROP TABLE IF EXISTS public.modules_cours;
DROP TABLE IF EXISTS public.objectifs_apprenants;
DROP TABLE IF EXISTS public.onboarding_contenus;
DROP TABLE IF EXISTS public.onboarding_progression;
DROP TABLE IF EXISTS public.partages_materiel;
DROP TABLE IF EXISTS public.permissions_utilisateur;
DROP TABLE IF EXISTS public.remboursements;
DROP TABLE IF EXISTS public.rendez_vous;
