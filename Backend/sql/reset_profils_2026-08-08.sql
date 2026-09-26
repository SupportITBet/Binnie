-- ════════════════════════════════════════════════════════════════════════
-- RESET COMPLET DES PROFILS — supprime tous les comptes (utilisateurs +
-- apprenants) et toutes les données opérationnelles qui en dépendent,
-- SAUF le super admin superadmin@bet.ci.
--
-- ⚠️ DESTRUCTIF ET IRRÉVERSIBLE. Une sauvegarde JSON complète (193 tables,
-- 5673 lignes, 153 comptes Auth) a été faite avant ce script.
--
-- Tout est encapsulé dans une transaction : si UNE SEULE ligne échoue
-- (contrainte de clé étrangère non prévue ici), TOUT est annulé
-- automatiquement — rien n'est supprimé à moitié. Le SELECT final montre
-- ce qui reste dans `utilisateurs` une fois le script exécuté (doit être
-- 1 seule ligne : superadmin@bet.ci) — si ce n'est pas le cas après coup,
-- restaurer depuis la sauvegarde JSON plutôt que de continuer.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ID à préserver
CREATE TEMP TABLE keep_id AS
  SELECT id FROM utilisateurs WHERE email = 'superadmin@bet.ci';

-- ── Tables scopées par apprenant (via classes_elearning_apprenants.id) ──
DELETE FROM presences_elearning       WHERE inscription_id IN (SELECT id FROM classes_elearning_apprenants WHERE apprenant_id NOT IN (SELECT id FROM keep_id));
DELETE FROM resultats_elearning       WHERE inscription_id IN (SELECT id FROM classes_elearning_apprenants WHERE apprenant_id NOT IN (SELECT id FROM keep_id));
DELETE FROM devoirs_rendus_elearning  WHERE inscription_id::text IN (SELECT id::text FROM classes_elearning_apprenants WHERE apprenant_id NOT IN (SELECT id FROM keep_id));
DELETE FROM avis_parents_coach        WHERE inscription_id::text IN (SELECT id::text FROM classes_elearning_apprenants WHERE apprenant_id NOT IN (SELECT id FROM keep_id));
DELETE FROM progression_elearning     WHERE inscription_id IN (SELECT id FROM classes_elearning_apprenants WHERE apprenant_id NOT IN (SELECT id FROM keep_id));
DELETE FROM classes_elearning_apprenants WHERE apprenant_id NOT IN (SELECT id FROM keep_id);

-- ── Tables scopées directement par apprenant_id ──
DELETE FROM presences_privees   WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM presences           WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM notes               WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM certifications      WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM temoignages         WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM groupes_apprenants  WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM groupes_presences   WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM contenus_lus        WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM contenus_vues_apprenant      WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM contenus_vues_apprenant_dash WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM badges_obtenus      WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM badges_obtenus_dash WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM points_transactions      WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM points_transactions_dash WHERE apprenant_id NOT IN (SELECT id FROM keep_id);
DELETE FROM resultats_evaluations_groupes WHERE apprenant_id NOT IN (SELECT id FROM keep_id);

-- ── Tables scopées par coach_id ──
DELETE FROM coach_disponibilites      WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM disponibilites_elearning  WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM disponibilites_coach      WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM honoraires_mois           WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM honoraires_elearning_mois WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM evaluations_coach         WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM evaluations_coachs        WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM stats_gamif_coach         WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM stats_gamif_coach_dash    WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM badges_coach_obtenus      WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM badges_coach_obtenus_dash WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM points_coach              WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM points_coach_dash         WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM coach_elearning_profil    WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM contrats_prives           WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM seances_privees           WHERE coach_id NOT IN (SELECT id FROM keep_id);
DELETE FROM seances                   WHERE coach_id NOT IN (SELECT id FROM keep_id);

-- ── Autres tables liées à un utilisateur (staff ou apprenant) ──
DELETE FROM notifications  WHERE user_id NOT IN (SELECT id FROM keep_id);
DELETE FROM delegations    WHERE remplacant_id NOT IN (SELECT id FROM keep_id) OR titulaire_id NOT IN (SELECT id FROM keep_id);

-- ── Pipeline commercial/prospects/paiements — purge intégrale (aucune de
-- ces lignes n'appartient légitimement au super admin) ──
DELETE FROM assignations_parcours;
DELETE FROM paiements_parcours;
DELETE FROM paiements;

-- ── Table apprenants (séparée de utilisateurs) — purge intégrale ──
DELETE FROM apprenants;

-- ── Comptes eux-mêmes ──
DELETE FROM utilisateurs WHERE id NOT IN (SELECT id FROM keep_id);

COMMIT;

-- Vérification post-exécution : doit renvoyer exactement 1 ligne (superadmin@bet.ci)
SELECT id, email, role FROM utilisateurs;
