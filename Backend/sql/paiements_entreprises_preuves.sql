-- ══════════════════════════════════════════════════════════════════════════════
-- DÉCLARATION DE VERSEMENT PAR L'ENTREPRISE, AVEC PREUVES ET VALIDATION
-- À exécuter dans Supabase SQL Editor
--
-- Jusqu'ici, un versement n'existait que saisi par un admin BET : il naissait
-- `statut = 'recu'` (le défaut de la table) et partait aussitôt en trésorerie.
-- Le RH entreprise, lui, ne pouvait que consulter.
--
-- On ouvre une seconde porte d'entrée - le RH déclare son propre versement et
-- joint ses preuves - qui n'encaisse rien tant qu'un humain de BET n'a pas
-- regardé la pièce jointe. D'où les trois statuts :
--
--   'declare'  → déclaré par le RH, en attente de vérification. N'entre dans
--                AUCUN total : le frontend ne somme que les 'recu'
--                (GestionEntreprises.jsx:3168), et c'est justement pourquoi ce
--                flux tient sans toucher au calcul des encaissements.
--   'recu'     → vérifié et validé. C'est À CE MOMENT, et plus à la saisie,
--                que l'encaissement part en trésorerie.
--   'rejete'   → preuve non concluante, motif obligatoire.
--
-- Les versements déjà en base restent 'recu' : ils ont été saisis par un admin,
-- donc déjà vérifiés par construction. Aucune reprise de données.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Les colonnes ───────────────────────────────────────────────────────────

ALTER TABLE public.paiements_entreprises
  -- Les justificatifs, tels que Cloudinary les a rendus :
  -- [{ url, nom, type, taille }]. Un tableau et non une colonne URL unique
  -- parce qu'un virement arrive souvent en deux pièces (ordre + avis de débit).
  ADD COLUMN IF NOT EXISTS preuves          JSONB DEFAULT '[]'::jsonb,

  -- Qui a déclaré. Distinct de cree_par_* : celui-là est renseigné quand c'est
  -- un admin BET qui saisit, celui-ci quand c'est le RH de l'entreprise.
  -- Les deux ne sont jamais remplis ensemble ; c'est ce qui dit d'où vient la ligne.
  ADD COLUMN IF NOT EXISTS declare_par_id   UUID,
  ADD COLUMN IF NOT EXISTS declare_par_nom  TEXT,

  -- Qui a vérifié la preuve et tranché, et quand.
  ADD COLUMN IF NOT EXISTS valide_par_id    UUID,
  ADD COLUMN IF NOT EXISTS valide_par_nom   TEXT,
  ADD COLUMN IF NOT EXISTS valide_le        TIMESTAMPTZ,

  -- Renseigné sur 'rejete' uniquement - le RH doit savoir quoi corriger.
  ADD COLUMN IF NOT EXISTS motif_rejet      TEXT;

-- Les écrans de vérification cherchent « tout ce qui attend », toutes
-- entreprises confondues : c'est le seul accès qui ne filtre pas par entreprise.
CREATE INDEX IF NOT EXISTS idx_paiements_entreprises_statut
  ON public.paiements_entreprises(statut);

-- ── 2. Les droits de l'assistante e-learning sur les versements ───────────────
-- C'est elle qui reçoit la notification, vérifie la pièce jointe et tranche,
-- et c'est elle aussi qui saisit les versements reçus hors déclaration RH.
-- Elle était pourtant en lecture seule sur `finances` (peut_lire = true, le
-- reste false) : le bouton Valider lui aurait renvoyé un 403, et le bouton
-- « + Nouveau versement » ne se serait même pas affiché.
--
-- La matrice ne descend pas sous le module : ce droit couvre `finances` en
-- entier pour la création et la modification. C'est le grain le plus fin
-- disponible. La SUPPRESSION reste fermée - annuler un encaissement déjà
-- enregistré n'appartient qu'aux rôles financiers de BET.

UPDATE public.permissions_roles
   SET peut_creer = true, peut_modifier = true
 WHERE role = 'assistant_elearning'
   AND module = 'finances';

-- ── 3. Vérification ───────────────────────────────────────────────────────────
-- Attendu : les 7 colonnes présentes, et assistant_elearning à modif = true.

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'paiements_entreprises'
   AND column_name IN ('preuves','declare_par_id','declare_par_nom',
                       'valide_par_id','valide_par_nom','valide_le','motif_rejet')
 ORDER BY column_name;

SELECT role, module, peut_lire, peut_creer, peut_modifier, peut_supprimer
  FROM public.permissions_roles
 WHERE module = 'finances'
   AND role IN ('assistant_elearning','commercial','super_admin')
 ORDER BY role;

-- NB : le passage du SuperAdmin en LECTURE SEULE sur les versements entreprise
-- ne se joue pas ici. `requirePermission` ouvre inconditionnellement la route au
-- super_admin (requireAdmin.js:411) et ce garde-fou-là protège toute
-- l'application - le toucher dépasserait de loin les versements. La restriction
-- est donc posée dans l'interface, là où elle décrit qui FAIT le travail :
-- voir `estSuperAdminLectureSeule` dans DashboardAdminShared.jsx,
-- DashboardAdmin.jsx et GestionEntreprises.jsx.
