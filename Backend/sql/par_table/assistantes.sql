-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `assistantes`
-- Généré à partir de 6 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── assistantes_profil_migration.sql  (2026-05-12) ──────────────────────────────
-- Migration : ajout du champ profil sur la table assistantes
-- b2c = Assistante commerciale classique (particuliers)
-- b2b = Assistante Corporate (entreprises)
-- les_deux = Les deux profils

ALTER TABLE assistantes
  ADD COLUMN IF NOT EXISTS profil TEXT NOT NULL DEFAULT 'b2c'
    CHECK (profil IN ('b2c', 'b2b', 'les_deux'));

-- Mettre à jour les assistantes existantes : toutes sont b2c par défaut
UPDATE assistantes SET profil = 'b2c' WHERE profil IS NULL;

-- ── parcours_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- PARCOURS BET — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── Table assistantes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistantes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT        NOT NULL,
  prenom          TEXT        NOT NULL,
  email           TEXT,
  telephone       TEXT,
  photo_url       TEXT,
  -- 'en_ligne' | 'presentiel' | 'les_deux'
  type_cours      TEXT        NOT NULL DEFAULT 'les_deux',
  -- NULL pour en_ligne, sinon référence au centre
  centre_id       TEXT        REFERENCES public.centres(id) ON DELETE SET NULL,
  -- 'semaine' (lun-ven) | 'weekend' (sam-dim) | 'les_deux'
  type_semaine    TEXT        NOT NULL DEFAULT 'les_deux',
  -- Quota max de prospects/jour
  quota_jour      INTEGER     NOT NULL DEFAULT 10,
  actif           BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Table assignations_parcours ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignations_parcours (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assistante_id       UUID        REFERENCES public.assistantes(id) ON DELETE SET NULL,
  prospect_nom        TEXT        NOT NULL,
  prospect_email      TEXT,
  prospect_telephone  TEXT,
  -- 'en_ligne' | 'presentiel'
  type_cours          TEXT        NOT NULL,
  -- 'groupe' | 'prive' (seulement pour en_ligne)
  type_coaching       TEXT,
  centre_id           TEXT        REFERENCES public.centres(id) ON DELETE SET NULL,
  statut              TEXT        NOT NULL DEFAULT 'en_attente',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Index ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assistantes_actif       ON public.assistantes(actif);
CREATE INDEX IF NOT EXISTS idx_assistantes_type_cours  ON public.assistantes(type_cours);
CREATE INDEX IF NOT EXISTS idx_assistantes_centre      ON public.assistantes(centre_id);
CREATE INDEX IF NOT EXISTS idx_assignations_assistante ON public.assignations_parcours(assistante_id);
CREATE INDEX IF NOT EXISTS idx_assignations_created    ON public.assignations_parcours(created_at DESC);

-- ── Désactiver RLS ───────────────────────────────────────────
ALTER TABLE public.assistantes          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignations_parcours DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- SEED DATA — 2 assistantes par centre + 3 en ligne
-- Adapte les noms/téléphones selon les vraies assistantes
-- ══════════════════════════════════════════════════════════════

-- Assistantes EN LIGNE (groupe + privé)
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour) VALUES
  ('Kouassi',  'Aya',    'aya.kouassi@betlanguages.ci',    '+225 07 11 22 33', 'en_ligne',  NULL, 'les_deux', 10),
  ('Traoré',   'Fanta',  'fanta.traore@betlanguages.ci',   '+225 05 44 55 66', 'en_ligne',  NULL, 'les_deux', 10),
  ('Koffi',    'Adèle',  'adele.koffi@betlanguages.ci',    '+225 01 77 88 99', 'en_ligne',  NULL, 'les_deux', 10)
ON CONFLICT DO NOTHING;

-- Assistantes PRÉSENTIEL — 2 par centre (semaine + weekend)
-- Cabinet 2 Plateaux Mobiles
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Bamba', 'Mariam', 'mariam.bamba@betlanguages.ci', '+225 07 22 33 44', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%plateaux%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Coulibaly', 'Rokia', 'rokia.coulibaly@betlanguages.ci', '+225 05 33 44 55', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%plateaux%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Angré Sicomex
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Diallo', 'Aïssatou', 'aissatou.diallo@betlanguages.ci', '+225 07 44 55 66', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%angré%' OR nom ILIKE '%angre%' OR nom ILIKE '%sicomex%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Soro', 'Karidja', 'karidja.soro@betlanguages.ci', '+225 05 55 66 77', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%angré%' OR nom ILIKE '%angre%' OR nom ILIKE '%sicomex%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Abatta
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Koné', 'Djeneba', 'djeneba.kone@betlanguages.ci', '+225 07 66 77 88', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%abatta%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Touré', 'Salimata', 'salimata.toure@betlanguages.ci', '+225 05 77 88 99', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%abatta%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Koumassi
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Yao', 'Germaine', 'germaine.yao@betlanguages.ci', '+225 07 88 99 00', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%koumassi%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Ouattara', 'Aminata', 'aminata.ouattara@betlanguages.ci', '+225 05 99 00 11', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%koumassi%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Yopougon
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'N''Guessan', 'Adjoua', 'adjoua.nguessan@betlanguages.ci', '+225 07 00 11 22', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%yopougon%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Gbagbo', 'Patricia', 'patricia.gbagbo@betlanguages.ci', '+225 05 11 22 33', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%yopougon%' LIMIT 1
ON CONFLICT DO NOTHING;

-- Cabinet Bouaké
INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Fofana', 'Hawa', 'hawa.fofana@betlanguages.ci', '+225 07 22 33 45', 'presentiel', id, 'semaine', 10
FROM public.centres WHERE nom ILIKE '%bouak%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.assistantes (nom, prenom, email, telephone, type_cours, centre_id, type_semaine, quota_jour)
SELECT 'Doumbia', 'Natacha', 'natacha.doumbia@betlanguages.ci', '+225 05 33 44 56', 'presentiel', id, 'weekend', 10
FROM public.centres WHERE nom ILIKE '%bouak%' LIMIT 1
ON CONFLICT DO NOTHING;

-- ── planning_assistantes_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- PLANNING ASSISTANTES — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── Colonne jours_travail sur assistantes ─────────────────────
-- Tableau des jours où l'assistante est disponible
-- Valeurs possibles : lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche
ALTER TABLE public.assistantes
  ADD COLUMN IF NOT EXISTS jours_travail TEXT[]
  DEFAULT '{lundi,mardi,mercredi,jeudi,vendredi}';

-- ── Colonnes paiement sur assignations_parcours ───────────────
ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS mode_paiement    TEXT,
  ADD COLUMN IF NOT EXISTS statut_paiement  TEXT NOT NULL DEFAULT 'en_attente';

-- ── Mise à jour des assistantes existantes ────────────────────
-- Assistantes semaine → lun-ven
UPDATE public.assistantes
SET jours_travail = '{lundi,mardi,mercredi,jeudi,vendredi}'
WHERE type_semaine = 'semaine' AND jours_travail IS NULL;

-- Assistantes weekend → sam-dim
UPDATE public.assistantes
SET jours_travail = '{samedi,dimanche}'
WHERE type_semaine = 'weekend' AND jours_travail IS NULL;

-- Assistantes les_deux → toute la semaine
UPDATE public.assistantes
SET jours_travail = '{lundi,mardi,mercredi,jeudi,vendredi,samedi,dimanche}'
WHERE type_semaine = 'les_deux' AND jours_travail IS NULL;

-- ── Index ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assistantes_jours ON public.assistantes USING GIN(jours_travail);
CREATE INDEX IF NOT EXISTS idx_assignations_paiement ON public.assignations_parcours(statut_paiement);

-- ── assistantes_pa_migration.sql  (2026-05-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Ajout du profil 'pa' (Pedagogical Advisor) à la table assistantes
-- + Insertion exemple du compte PA (remplacer email et nom réels)
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Supprimer l'ancienne contrainte CHECK et en créer une nouvelle
--    qui inclut 'pa'
ALTER TABLE public.assistantes
  DROP CONSTRAINT IF EXISTS assistantes_profil_check;

ALTER TABLE public.assistantes
  ADD CONSTRAINT assistantes_profil_check
  CHECK (profil IN ('b2c', 'b2b', 'les_deux', 'pa'));

-- 2. Insérer le Conseiller Pédagogique dans la table assistantes
--    ⚠️ Remplacer les valeurs ci-dessous par les vraies informations du PA
-- Mettre à jour si l'email existe déjà, sinon insérer
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.assistantes WHERE email = 'email.pa@betlanguages.ci') THEN
    UPDATE public.assistantes
    SET profil = 'pa', actif = true, type_cours = 'domicile'
    WHERE email = 'email.pa@betlanguages.ci';
  ELSE
    INSERT INTO public.assistantes (nom, prenom, email, telephone, profil, actif, type_cours, quota_jour)
    VALUES (
      'thubert',                  
      'thubert',                
      'thubert12@gmail.com', 
      '+225 00 00 00 00',          
      'pa',
      true,
      'domicile',
      50
    );
  END IF;
END $$;

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

-- ── assistantes_onboarding_migration.sql  (2026-06-19) ──────────────────────────────
-- Migration : lien onboarding ↔ commerciale + date de début de formation
-- À exécuter dans Supabase SQL Editor.

-- 0. Date de début de formation sur assignations_parcours
ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS date_debut_formation DATE;

COMMENT ON COLUMN public.assignations_parcours.date_debut_formation IS
  'Date de début de formation renseignée par la commerciale lors de la finalisation';

-- 1. Colonne onboarding_id sur assistantes (commerciale → onboarding assignée)
ALTER TABLE public.assistantes
  ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assistantes.onboarding_id IS
  'ID de l''assistante onboarding assignée à cette commerciale';

CREATE INDEX IF NOT EXISTS idx_assistantes_onboarding ON public.assistantes(onboarding_id);

-- 2. Colonne onboarding_commercial_id sur utilisateurs (onboarding → sa commerciale)
ALTER TABLE public.utilisateurs
  ADD COLUMN IF NOT EXISTS onboarding_commercial_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.utilisateurs.onboarding_commercial_id IS
  'Pour un compte onboarding : ID de la commerciale qui lui est assignée';

CREATE INDEX IF NOT EXISTS idx_utilisateurs_onboarding_commercial ON public.utilisateurs(onboarding_commercial_id);

