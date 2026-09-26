-- ══════════════════════════════════════════════════════════════
-- Ajout de 2 mini-jeux côté bet-elearning (Traduction inverse, Mots
-- cachés) + activation de "Mots croisés" qui existait déjà dans le
-- catalogue mais n'avait jamais été implémenté côté apprenant.
-- À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

UPDATE contenus_mini_jeux SET actif = true WHERE type = 'mots_croises' AND actif = false;

INSERT INTO contenus_mini_jeux (nom, type, categorie, cible, actif, nb_questions, parties_jouees, score_moyen)
SELECT 'Traduction inverse', 'traduction', 'tous', 'tous', true, 10, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM contenus_mini_jeux WHERE type = 'traduction');

INSERT INTO contenus_mini_jeux (nom, type, categorie, cible, actif, nb_questions, parties_jouees, score_moyen)
SELECT 'Mots cachés', 'mots_caches', 'tous', 'tous', true, 5, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM contenus_mini_jeux WHERE type = 'mots_caches');
