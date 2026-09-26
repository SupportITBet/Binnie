-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `remplacements`
-- Généré à partir de 7 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── remplacements_migration.sql  (2026-06-24) ──────────────────────────────
-- Table remplacements : demandes d'absence / remplacement des coachs
CREATE TABLE IF NOT EXISTS remplacements (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  absent_id       UUID        NOT NULL REFERENCES utilisateurs(id),
  absent_nom      TEXT        NOT NULL,
  groupe_id       UUID        REFERENCES groupes(id),
  groupe_nom      TEXT,
  date_debut      DATE        NOT NULL,
  date_fin        DATE        NOT NULL,
  nb_sessions     INTEGER     DEFAULT 0,
  sessions_ids    JSONB       DEFAULT '[]',
  motif           TEXT,
  message         TEXT,
  statut          TEXT        NOT NULL DEFAULT 'a_pourvoir',  -- a_pourvoir | en_cours | termine
  remplacant_id   UUID        REFERENCES utilisateurs(id),
  remplacant_nom  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_remplacements_statut    ON remplacements(statut);
CREATE INDEX IF NOT EXISTS idx_remplacements_absent    ON remplacements(absent_id);
CREATE INDEX IF NOT EXISTS idx_remplacements_created   ON remplacements(created_at DESC);

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

-- ── remplacements_refus_migration.sql  (2026-07-20) ──────────────────────────────
-- Ajoute le cas "refus" au flux de remplacement : le PA Advisor peut refuser une demande
-- d'absence (statut 'a_pourvoir') avec un motif obligatoire, plutôt que de systématiquement
-- assigner un remplaçant. Idempotent — sûr à ré-exécuter.
ALTER TABLE public.remplacements
  ADD COLUMN IF NOT EXISTS motif_refus   TEXT,
  ADD COLUMN IF NOT EXISTS refuse_par_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refuse_le     TIMESTAMPTZ;

-- ── remplacements_tracabilite_pa_migration.sql  (2026-07-20) ──────────────────────────────
-- Plusieurs PA Advisors (2 à 5) traitent les remplacements — il faut pouvoir tracer NOMINATIVEMENT
-- qui a assigné ou refusé une demande, pas seulement "le PA" en général. `assigne_par_id` et
-- `refuse_par_id` existaient déjà mais sans nom dénormalisé, coûteux à résoudre à l'affichage
-- (coach et PA n'ont pas forcément accès à la table utilisateurs pour ça). Idempotent.
ALTER TABLE public.remplacements
  ADD COLUMN IF NOT EXISTS assigne_par_nom TEXT,
  ADD COLUMN IF NOT EXISTS refuse_par_nom  TEXT;

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

-- ── remplacements_lot_id_migration.sql  (9999) ──────────────────────────────
-- Ajoute lot_id à remplacements — identifiant commun généré côté coach quand une même
-- déclaration d'absence couvre plusieurs classes différentes (une ligne remplacements par
-- groupe, cf. envoyerDemandeAbsence côté dash/bet-elearning). Permet à la PA de retrouver les
-- demandes-sœurs d'une même absence et de choisir : un seul remplaçant pour tout le lot, ou
-- une assignation différente par classe.
-- À exécuter dans Supabase SQL Editor.

ALTER TABLE public.remplacements
  ADD COLUMN IF NOT EXISTS lot_id UUID;

CREATE INDEX IF NOT EXISTS idx_remplacements_lot_id ON public.remplacements(lot_id);

