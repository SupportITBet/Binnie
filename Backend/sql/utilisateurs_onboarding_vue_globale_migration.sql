-- Permet de désigner UN compte onboarding "vue globale" qui voit toutes les demandes en
-- attente côté onboarding, au lieu d'être limité aux dossiers qui lui sont nommément
-- assignés (onboarding_id) comme le reste des comptes onboarding. N'affecte ni le PA, ni
-- le circuit coaching privé.
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS onboarding_vue_globale BOOLEAN NOT NULL DEFAULT false;
