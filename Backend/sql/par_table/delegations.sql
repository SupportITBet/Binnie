-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `delegations`
-- Généré à partir de 3 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── remplacements_delegations_migration.sql  (2026-07-11) ──────────────────────────────
-- Implémentation complète du schéma "Absence & remplacement coach"
-- (voir Backend/docs/remplacement-schema.html)

-- La table `remplacements` existe déjà (une ligne par absence signalée).
-- On ajoute juste le champ nécessaire pour savoir qui notifier à la clôture automatique.
ALTER TABLE public.remplacements
  ADD COLUMN IF NOT EXISTS assigne_par_id uuid;

-- Table `delegations` — lue par AuthContext.jsx côté frontend pour le badge "Délégation
-- active" du remplaçant, mais jusqu'ici jamais créée ni alimentée (référence orpheline).
CREATE TABLE IF NOT EXISTS public.delegations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remplacement_id text REFERENCES public.remplacements(id) ON DELETE CASCADE,
  titulaire_id   uuid NOT NULL,
  groupe_id      uuid,
  remplacant_id  uuid NOT NULL,
  sessions_ids   uuid[] NOT NULL DEFAULT '{}',
  date_debut     date,
  date_fin       date,
  statut         text NOT NULL DEFAULT 'active' CHECK (statut IN ('active','terminee')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delegations_remplacant ON public.delegations(remplacant_id, statut);
CREATE INDEX IF NOT EXISTS idx_delegations_remplacement ON public.delegations(remplacement_id);

-- ── remplacements_fix_groupe_fk_migration.sql  (2026-07-11) ──────────────────────────────
-- La table `remplacements` avait été créée à l'origine pour l'ancien système "dash"
-- (contrainte vers `groupes`), jamais mise à jour depuis. Le schéma complet qu'on vient
-- d'implémenter (Backend/docs/remplacement-schema.html) fonctionne exclusivement avec les
-- classes bet-elearning (`classes_elearning`) — cette contrainte bloque donc tout insert réel.
ALTER TABLE public.remplacements
  DROP CONSTRAINT IF EXISTS remplacements_groupe_id_fkey;

ALTER TABLE public.remplacements
  ADD CONSTRAINT remplacements_groupe_id_fkey
  FOREIGN KEY (groupe_id) REFERENCES public.classes_elearning(id) ON DELETE SET NULL;

-- Même correction préventive sur `delegations.groupe_id` (table créée dans la migration
-- précédente sans contrainte stricte) — on la pose maintenant vers la bonne table.
ALTER TABLE public.delegations
  ADD CONSTRAINT delegations_groupe_id_fkey
  FOREIGN KEY (groupe_id) REFERENCES public.classes_elearning(id) ON DELETE SET NULL;

-- ── remplacements_plateforme_migration.sql  (2026-07-29) ──────────────────────────────
-- `remplacements` est une table partagée entre bet-elearning et dash (voir le
-- commentaire dans Backend/src/routes/remplacements.js). Jusqu'ici, sa validation
-- et sa logique de réattribution ne connaissaient QUE `seances_elearning`
-- (bet-elearning) — toute demande d'absence créée côté dash échouait donc
-- systématiquement (les séances dash vivent dans `seances`, une table différente).
--
-- Cette colonne permet de savoir, pour chaque remplacement, sur quelle table de
-- séances valider/réattribuer. NULL = bet-elearning (comportement historique,
-- aucune ligne existante n'est affectée).
ALTER TABLE remplacements ADD COLUMN IF NOT EXISTS plateforme TEXT;

-- Blocage structurel découvert en testant : `remplacements.groupe_id` porte une
-- clé étrangère vers `classes_elearning` (table bet-elearning). Elle rejette donc
-- inconditionnellement toute demande dash, dont le groupe_id référence `groupes`
-- (table distincte). Comme cette colonne doit désormais pouvoir pointer vers l'une
-- ou l'autre table selon `plateforme`, une FK unique ne peut plus l'exprimer — on
-- la retire, la validation d'appartenance groupe/coach restant déjà assurée
-- applicativement dans POST /api/remplacements (voir seancesVerif).
ALTER TABLE remplacements DROP CONSTRAINT IF EXISTS remplacements_groupe_id_fkey;

-- Même blocage sur `delegations.groupe_id` (créée dans PATCH /api/remplacements/:id
-- lors de l'assignation d'un remplaçant) — testé et confirmé : même erreur
-- ("Key (groupe_id)=... is not present in table classes_elearning").
ALTER TABLE delegations DROP CONSTRAINT IF EXISTS delegations_groupe_id_fkey;

