-- ============================================================================
--  Rattacher un rapport d'observation à la séance réellement observée
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Un rapport d'observation n'enregistrait que `classe` — un texte libre, le nom
--  de la classe. Rien n'indiquait QUELLE séance avait été observée : deux rapports
--  sur la même classe le même jour étaient indiscernables, et une note ne pouvait
--  se rapporter à aucun cours précis.
--
--  Ces trois colonnes relient l'évaluation à la séance, donc à tout ce qu'on sait
--  d'elle : son horaire prévu, son heure d'ouverture réelle, sa durée en salle, ses
--  présences. Un coach noté 2/5 en ponctualité sur un cours ouvert avec 20 minutes
--  de retard devient une observation vérifiable, et non une opinion isolée.
--
--  `classe` est CONSERVÉE en texte à dessein : c'est ce que lisent les écrans
--  existants, et surtout une classe renommée — ou supprimée — ne doit pas effacer
--  l'historique d'un rapport déjà rendu.
--
--  ON DELETE SET NULL, jamais CASCADE : supprimer une séance ne doit pas emporter
--  l'évaluation d'un coach. Le rapport perd son lien, pas son contenu.
-- ============================================================================

ALTER TABLE public.rapports_observation
  ADD COLUMN IF NOT EXISTS seance_id       uuid REFERENCES public.seances(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS groupe_id       uuid REFERENCES public.groupes(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_live_id uuid REFERENCES public.sessions_live(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rapports_observation.seance_id IS
  'Seance reellement observee. NULL = observation sans seance enregistree (presentiel, rapport a posteriori).';
COMMENT ON COLUMN public.rapports_observation.groupe_id IS
  'La classe, en identifiant. Double la colonne texte `classe`, conservee pour l''historique.';
COMMENT ON COLUMN public.rapports_observation.session_live_id IS
  'Session live correspondante quand la seance en a une — porte le lien visio et le chronometre.';

-- Retrouver les rapports d'une séance, et ceux d'une classe, sans balayer la table.
CREATE INDEX IF NOT EXISTS idx_rapports_observation_seance ON public.rapports_observation(seance_id);
CREATE INDEX IF NOT EXISTS idx_rapports_observation_groupe ON public.rapports_observation(groupe_id);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)            AS total,
       COUNT(seance_id)    AS avec_seance,
       COUNT(groupe_id)    AS avec_groupe
  FROM public.rapports_observation;
