-- ============================================================================
--  Appréciation du cours par l'apprenant
-- ============================================================================
--
--  ⚠️  EXÉCUTER TOUT LE FICHIER D'UN SEUL COUP (Supabase → SQL Editor → Run).
--
--  Le coach est observé par les deputies, quelques fois par trimestre, sur une séance
--  choisie. Personne ne demandait rien à ceux qui assistent à TOUTES ses séances.
--
--  Après chaque cours, l'apprenant présent note la séance de 1 à 5 sur une échelle dont
--  chaque niveau porte une description complète — objectifs, clarté des explications,
--  occasions de s'exprimer, interactivité. Une note unique et non quatre curseurs : on
--  choisit la phrase qui correspond, ce qui se répond en quelques secondes après un cours.
--
--  Deux règles gouvernent l'accès :
--
--   · SEULS LES PRÉSENTS NOTENT. Un absent n'a rien vu ; sa note ne vaudrait rien et
--     fausserait la moyenne du coach. La présence est vérifiée à l'écriture.
--
--   · LE COACH NE VOIT JAMAIS CES NOTES. Elles sont destinées au superviseur et au PA.
--     Un coach qui les lit, surtout nominatives, les rend complaisantes en une séance.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appreciations_apprenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE et non SET NULL : l'unicite « un apprenant, une seance » repose sur cette
  -- colonne. Une seance supprimee est une seance qui n'a pas eu lieu — ses appreciations
  -- n'ont plus d'objet, et les laisser orphelines casserait la contrainte.
  seance_id     uuid NOT NULL REFERENCES public.seances(id) ON DELETE CASCADE,

  -- Denormalises a l'ecriture : ce sont les axes d'agregation de tous les ecrans
  -- (moyenne par coach, par classe), et les recalculer par jointure a chaque lecture
  -- couterait cher pour une donnee qui ne change jamais apres coup.
  coach_id      uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  groupe_id     uuid REFERENCES public.groupes(id)      ON DELETE SET NULL,

  -- Qui a note. `apprenant_id` est le compte ; `ga_id` le rattachement a la classe,
  -- qui est ce que portent les lignes de presence.
  apprenant_id  uuid REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  ga_id         uuid,
  nom_apprenant text,

  -- 1 a 5. Les libelles vivent dans l'application : les figer ici obligerait a une
  -- migration a chaque reformulation, et Postgres n'a pas a connaitre la redaction.
  note          smallint NOT NULL,
  commentaire   text,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appreciations_note_chk CHECK (note BETWEEN 1 AND 5)
);

COMMENT ON TABLE public.appreciations_apprenants IS
  'Note de 1 a 5 donnee par un apprenant PRESENT a une seance. Jamais visible du coach :
   destinee au superviseur et au conseiller pedagogique.';

-- Un apprenant ne note qu'une fois une meme seance. Sans cette contrainte, rafraichir la
-- page apres l'envoi suffirait a noter deux fois et a peser double dans la moyenne.
CREATE UNIQUE INDEX IF NOT EXISTS idx_appreciations_unique
  ON public.appreciations_apprenants(seance_id, apprenant_id)
  WHERE apprenant_id IS NOT NULL;

-- La moyenne d'un coach sur une periode : la lecture principale des deux ecrans.
CREATE INDEX IF NOT EXISTS idx_appreciations_coach
  ON public.appreciations_apprenants(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appreciations_seance
  ON public.appreciations_apprenants(seance_id);
-- Retrouver ce qu'un apprenant a deja note — c'est cette liste qui fait disparaitre
-- le bandeau de rappel.
CREATE INDEX IF NOT EXISTS idx_appreciations_apprenant
  ON public.appreciations_apprenants(apprenant_id);

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Vérification (à relancer seule une fois le bloc ci-dessus exécuté)
-- ─────────────────────────────────────────────────────────────────────────
SELECT COUNT(*)                       AS total,
       COUNT(DISTINCT coach_id)       AS coachs_notes,
       COUNT(DISTINCT apprenant_id)   AS apprenants_ayant_note,
       ROUND(AVG(note), 2)            AS moyenne_generale,
       COUNT(commentaire)             AS avec_commentaire
  FROM public.appreciations_apprenants;
