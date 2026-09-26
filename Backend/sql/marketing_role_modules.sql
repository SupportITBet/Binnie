-- ═══════════════════════════════════════════════════════════════════
-- BET — Découpage détaillé des permissions du rôle "marketing"
-- (remplace la ligne unique "configuration" par 6 modules dédiés au
-- tab Plateforme + "examens" pour Test de niveau, déjà utilisé par
-- PA Advisor/Placement Test)
-- Coller dans : Supabase Dashboard > SQL Editor > New query
-- Pré-requis : marketing_role_setup.sql déjà exécuté (enum bet_role
-- contient 'marketing').
-- ═══════════════════════════════════════════════════════════════════

-- L'ancienne ligne "configuration" n'est plus vérifiée par aucune route
-- pour ce rôle (voir remap backend) — on la retire pour ne pas laisser
-- un module fantôme dans la matrice.
DELETE FROM permissions_roles WHERE role = 'marketing' AND module = 'configuration';

INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('marketing', 'offres_catalogue',  true, true, true, true, true),
('marketing', 'contenu_editorial', true, true, true, true, true),
('marketing', 'boutique',          true, true, true, true, true),
('marketing', 'communication',     true, true, true, true, true),
('marketing', 'equipe_coachs',     true, true, true, true, true),
('marketing', 'trafic',            true, false, false, false, false),
('marketing', 'examens',           true, true, true, true, true)
ON CONFLICT (role, module) DO UPDATE SET
  peut_lire      = EXCLUDED.peut_lire,
  peut_creer     = EXCLUDED.peut_creer,
  peut_modifier  = EXCLUDED.peut_modifier,
  peut_supprimer = EXCLUDED.peut_supprimer,
  peut_gerer     = EXCLUDED.peut_gerer;
