-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `simulateurs_formation`
-- Généré à partir de 2 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── CONSOLIDATION_assignations_parcours.sql  (2026-06-19) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════════
-- CONSOLIDATION — assignations_parcours & tables liées
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
-- Toutes les instructions utilisent IF NOT EXISTS / IF EXISTS
-- → sans danger si les migrations partielles ont déjà été jouées
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Table assistantes (profil B2B) ───────────────────────────
ALTER TABLE public.assistantes
  ADD COLUMN IF NOT EXISTS jours_travail TEXT[],
  ADD COLUMN IF NOT EXISTS profil TEXT NOT NULL DEFAULT 'b2c'
    CHECK (profil IN ('b2c', 'b2b', 'les_deux')),
  ADD COLUMN IF NOT EXISTS onboarding_id UUID;

-- Remplir jours_travail depuis type_semaine si vide
UPDATE public.assistantes
SET jours_travail = '{lundi,mardi,mercredi,jeudi,vendredi}'
WHERE type_semaine = 'semaine' AND jours_travail IS NULL;

UPDATE public.assistantes
SET jours_travail = '{samedi,dimanche}'
WHERE type_semaine = 'weekend' AND jours_travail IS NULL;

UPDATE public.assistantes
SET jours_travail = '{lundi,mardi,mercredi,jeudi,vendredi,samedi,dimanche}'
WHERE type_semaine = 'les_deux' AND jours_travail IS NULL;

-- ── 2. Table assignations_parcours — toutes les colonnes ────────
ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS source           TEXT,
  ADD COLUMN IF NOT EXISTS inscription_offre TEXT,
  ADD COLUMN IF NOT EXISTS montant_paye     INTEGER,
  ADD COLUMN IF NOT EXISTS niveau_client    TEXT,
  ADD COLUMN IF NOT EXISTS objectif_client  TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS profil_type      TEXT DEFAULT 'adulte',
  ADD COLUMN IF NOT EXISTS nom_parent       TEXT,
  ADD COLUMN IF NOT EXISTS telephone_parent TEXT,
  ADD COLUMN IF NOT EXISTS email_parent     TEXT,
  ADD COLUMN IF NOT EXISTS routing_statut   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pa_advisor_id    UUID,
  ADD COLUMN IF NOT EXISTS suivi_demarrage  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suivi_presences  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_paiement    JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS statut_paiement  TEXT DEFAULT 'en_attente',
  ADD COLUMN IF NOT EXISTS mode_paiement    TEXT,
  ADD COLUMN IF NOT EXISTS date_debut_formation DATE,
  ADD COLUMN IF NOT EXISTS documents_dossier JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS notes_coach      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

-- ── 3. Table demandes_entreprise — colonnes supplémentaires ─────
ALTER TABLE public.demandes_entreprise
  ADD COLUMN IF NOT EXISTS commercial_id     UUID,
  ADD COLUMN IF NOT EXISTS centre_id         TEXT,
  ADD COLUMN IF NOT EXISTS notes_commercial  TEXT;

-- ── 3b. Table simulateurs_formation — colonnes supplémentaires ──
ALTER TABLE public.simulateurs_formation
  ADD COLUMN IF NOT EXISTS centre            TEXT,
  ADD COLUMN IF NOT EXISTS notes_commercial  TEXT;

-- ── 4. RLS : assistantes (service role seulement) ───────────────
ALTER TABLE public.assistantes           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignations_parcours DISABLE ROW LEVEL SECURITY;

-- ── 5. Index utiles ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assistantes_profil     ON public.assistantes(profil);
CREATE INDEX IF NOT EXISTS idx_assignations_source    ON public.assignations_parcours(source);
CREATE INDEX IF NOT EXISTS idx_assignations_statut    ON public.assignations_parcours(statut);
CREATE INDEX IF NOT EXISTS idx_assignations_email     ON public.assignations_parcours(prospect_email);

-- ══════════════════════════════════════════════════════════════════
-- VÉRIFICATION FINALE
-- Après exécution, lancez cette requête pour confirmer :
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'assignations_parcours'
-- ORDER BY ordinal_position;
-- ══════════════════════════════════════════════════════════════════

-- ── simulateurs_formation_nom_contact_migration.sql  (9999) ──────────────────────────────
-- Le nom du responsable/contact saisi dans le formulaire "Votre entreprise" (EntrepriseParcoursModal)
-- n'était jamais persisté : seul email_contact existait, donc "Mes demandes" (dash) retombait
-- sur l'affichage de l'email à la place du nom.
ALTER TABLE public.simulateurs_formation
  ADD COLUMN IF NOT EXISTS nom_contact text;

