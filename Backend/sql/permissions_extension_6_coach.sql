-- ═══════════════════════════════════════════════════════════════════
-- BET — Extension du système de permissions (partie 6)
-- À exécuter dans Supabase Dashboard > SQL Editor > New query.
--
-- Contexte : câblage de vraies vérifications de permission sur les routes
-- réellement utilisées par le dashboard Coach (jusqu'ici aucune n'était
-- protégée par requirePermission, seulement authenticateAdmin). Coach étant
-- un rôle utilisé quotidiennement en production, ce script DOIT être exécuté
-- AVANT (ou immédiatement avec) le déploiement du code, sinon :
--   - "planning" (create+modifier=false) → plus aucune Session live ne
--     pourrait être programmée/modifiée (régression immédiate et visible)
--   - "classes" (modifier=false) → la saisie des présences serait bloquée
--   - "cours" (supprimer=false) → suppression d'un devoir bloquée
--   - "mediatheque" (supprimer=false) → suppression d'un contenu de
--     médiathèque bloquée
-- "remplacements" (create=true) et "examens" (create=true) sont déjà bons,
-- rien à changer pour eux.
-- NB : "Fichiers partagés" (fichiersPrives.js) n'est PAS concerné par ce
-- script — cette route est partagée avec dash (EspaceProfesseur.jsx),
-- volontairement laissée non gatée pour ne pas mélanger les deux plateformes.
-- ═══════════════════════════════════════════════════════════════════

UPDATE permissions_roles SET peut_modifier = true
WHERE role = 'coach' AND module = 'classes';

UPDATE permissions_roles SET peut_supprimer = true
WHERE role = 'coach' AND module = 'cours';

UPDATE permissions_roles SET peut_supprimer = true
WHERE role = 'coach' AND module = 'mediatheque';

UPDATE permissions_roles SET peut_creer = true, peut_modifier = true
WHERE role = 'coach' AND module = 'planning';
