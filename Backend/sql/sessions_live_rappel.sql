-- ============================================================================
--  Rappel avant le début d'une séance
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Aucun rappel de séance n'existait : ni pour le coach, ni pour l'apprenant,
--  ni pour l'assistante ou le superviseur. La seule notification partait à la
--  CRÉATION de la session — « une séance a été programmée » — parfois des
--  semaines avant. Le jour venu, personne n'était prévenu, et le lien Zoom
--  restait à retrouver dans un écran.
--
--  Le job /api/jobs/rappels-seances tourne toutes les 15 minutes et prévient
--  30 minutes avant le début. Cette colonne est sa mémoire : sans elle, chaque
--  passage du cron renverrait le même rappel, soit quatre fois par heure.
--
--  Une simple colonne suffit ici — un rappel par séance, contrairement aux
--  emails de publication qui couvrent deux types de ressources.
-- ============================================================================

ALTER TABLE public.sessions_live
  ADD COLUMN IF NOT EXISTS rappel_envoye_at timestamptz;

COMMENT ON COLUMN public.sessions_live.rappel_envoye_at IS
  'Horodatage du rappel T-30min. Non nul = rappel deja parti, le cron passe son chemin.';

-- Le cron cherche les séances du jour non encore rappelées : sans index, il
-- parcourrait toute la table à chaque passage, soit 96 fois par jour.
CREATE INDEX IF NOT EXISTS idx_sessions_live_rappel
  ON public.sessions_live (date, rappel_envoye_at);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS total,
       COUNT(rappel_envoye_at) AS deja_rappelees
  FROM public.sessions_live;
