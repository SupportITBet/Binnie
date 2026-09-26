-- ============================================================================
--  Traçabilité d'une séance en direct
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  La salle de classe affiche un chronomètre au coach pendant toute la séance.
--  À la clôture, seul `statut: "terminee"` part au serveur : le temps réellement
--  passé, l'heure d'ouverture et l'heure de fermeture disparaissent avec la
--  fenêtre. Personne — ni le PA, ni la commerciale, ni l'onboarding, ni le
--  superviseur — ne peut ensuite dire combien de temps le cours a duré.
--
--  `duree` existait déjà mais porte la durée PRÉVUE, saisie à la programmation.
--  La confondre avec le réel ferait disparaître précisément l'écart qu'on
--  cherche à mesurer : un cours prévu 60 min et tenu 25 min doit se voir.
--
--  Ces trois colonnes sont la mémoire de ce qui s'est passé.
-- ============================================================================

ALTER TABLE public.sessions_live
  ADD COLUMN IF NOT EXISTS demarree_at    timestamptz,
  ADD COLUMN IF NOT EXISTS terminee_at    timestamptz,
  ADD COLUMN IF NOT EXISTS duree_reelle_s integer;

COMMENT ON COLUMN public.sessions_live.demarree_at IS
  'Ouverture effective de la salle par le coach. Distinct de heure, qui est l''horaire prevu.';
COMMENT ON COLUMN public.sessions_live.terminee_at IS
  'Fermeture de la salle. Distinct de heure_fin, qui est l''horaire prevu.';
COMMENT ON COLUMN public.sessions_live.duree_reelle_s IS
  'Temps passe en salle, en secondes, releve par le chronometre du coach. A comparer a duree (prevu).';

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS total,
       COUNT(demarree_at)    AS demarrees,
       COUNT(terminee_at)    AS terminees,
       COUNT(duree_reelle_s) AS avec_duree_reelle
  FROM public.sessions_live;
