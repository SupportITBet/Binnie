-- ============================================================
-- conversations_groupes_plateforme_migration.sql
--
-- Sépare les groupes de discussion entre dash et bet-elearning.
--
-- POURQUOI. `conversations_groupes` n'avait aucune notion de plateforme : les deux
-- applications lisaient la même table via /api/conversations, et chacune affichait donc
-- les groupes de l'autre. Un Deputy Superviseur connecté à bet-elearning voyait les six
-- groupes créés depuis dash.
--
-- CE QUE CELA CHANGE, ET QU'IL FAUT ASSUMER. Un groupe appartient désormais à UNE
-- plateforme. Les membres qui travaillent sur les deux n'y accèdent plus que depuis
-- celle d'origine. C'est l'inverse du choix documenté jusqu'ici dans GroupesLibres.jsx
-- (« un groupe libre est un objet unique »), et c'est une décision assumée : chaque
-- plateforme ne montre que son contenu.
--
-- REMPLISSAGE. Les six groupes existants ont tous été créés entre le 22 et le 30
-- septembre 2026 par des rôles dash — pedagogical_advisor, commercial (x4), onboarding.
-- Ils partent donc à 'dash', avec leurs 22 appartenances intactes ; bet-elearning
-- redémarre sans aucun groupe, ce qui est l'état correct pour lui.
--
-- À exécuter dans l'éditeur SQL de Supabase. Réexécutable sans risque.
-- ============================================================

ALTER TABLE conversations_groupes
  ADD COLUMN IF NOT EXISTS plateforme text;

CREATE INDEX IF NOT EXISTS idx_conversations_groupes_plateforme
  ON conversations_groupes (plateforme);

-- Les groupes antérieurs à cette séparation viennent tous de dash.
UPDATE conversations_groupes
   SET plateforme = 'dash'
 WHERE plateforme IS NULL;

-- Toute ligne créée ensuite sans plateforme explicite retombe sur 'dash' : c'est la
-- plateforme historique, et un oubli côté serveur ne doit pas rendre un groupe
-- invisible des deux côtés.
ALTER TABLE conversations_groupes
  ALTER COLUMN plateforme SET DEFAULT 'dash';

-- Contrôle
SELECT plateforme, count(*) FROM conversations_groupes GROUP BY plateforme;
