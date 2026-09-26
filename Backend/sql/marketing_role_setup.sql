-- ═══════════════════════════════════════════════════════════════════
-- BET — Ajout du rôle "marketing" (Assistant Marketing — gestion du
-- site web / contenu front-end : Plateforme + Trafic web)
-- Coller dans : Supabase Dashboard > SQL Editor > New query
--
-- ⚠️ Exécuter le bloc 1 seul d'abord (ALTER TYPE), valider, PUIS
-- exécuter le bloc 2 dans une nouvelle requête séparée — un ENUM
-- ajouté ne peut pas être utilisé dans la même transaction que son
-- ALTER TYPE.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. EXTENSION DE L'ENUM bet_role
-- ─────────────────────────────────────────────────────────────────
ALTER TYPE bet_role ADD VALUE IF NOT EXISTS 'marketing';

-- ─────────────────────────────────────────────────────────────────
-- 2. PERMISSIONS DU RÔLE — accès complet au module "configuration"
--    (partenaires, marquee, blog, témoignages, FAQ, carrousel,
--    boutique, newsletter, équipe coachs, offres & contenus, centres,
--    codes promo — tout ce qui alimente le tab "Plateforme" du
--    dashboard SuperAdmin, réutilisé tel quel pour ce rôle).
-- ─────────────────────────────────────────────────────────────────
INSERT INTO permissions_roles (role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer, peut_gerer) VALUES
('marketing', 'configuration', true, true, true, true, true)
ON CONFLICT (role, module) DO UPDATE SET
  peut_lire      = true,
  peut_creer     = true,
  peut_modifier  = true,
  peut_supprimer = true,
  peut_gerer     = true;
