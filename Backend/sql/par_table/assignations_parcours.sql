-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `assignations_parcours`
-- Généré à partir de 17 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

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

-- ── preuve_documents_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Ajout preuve_image sur paiements_parcours
-- + documents_dossier sur assignations_parcours
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Preuve de paiement (URL Supabase Storage) pour chèque, RIA, MoneyGram, etc.
ALTER TABLE paiements_parcours
  ADD COLUMN IF NOT EXISTS preuve_image TEXT;

-- 2. Documents du dossier de l'apprenant (URLs Supabase Storage)
--    Format : [{"nom":"Pièce d'identité","type":"id","url":"https://...","chemin":"assignation-id/id-123.jpg","taille":245678,"mimetype":"image/jpeg"}]
ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS documents_dossier JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ══════════════════════════════════════════════════════════════
-- BUCKET SUPABASE STORAGE À CRÉER MANUELLEMENT
-- Supabase Dashboard > Storage > New bucket
-- ══════════════════════════════════════════════════════════════
-- Nom du bucket  : dossiers-apprenants
-- Public         : OUI  (pour que les URLs publiques fonctionnent)
-- Taille max     : 20 Mo par fichier
--
-- Politique RLS Storage (à configurer dans Storage > Policies) :
-- SELECT (lecture publique) : true
-- INSERT / UPDATE / DELETE  : auth.role() = 'authenticated'
-- ══════════════════════════════════════════════════════════════

-- ── suivi_demarrage_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Ajout suivi_demarrage sur assignations_parcours
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Colonne JSONB pour la checklist de suivi de démarrage de l'apprenant
-- Format :
-- {
--   "steps": [
--     { "id": "acces_plateforme", "done": true, "date": "2024-01-15", "note": "" },
--     ...
--   ],
--   "notes_generales": "Texte libre du commercial"
-- }
ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS suivi_demarrage JSONB DEFAULT NULL;

-- ── suivi_presences_migration.sql  (2026-05-12) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Suivi des présences / absences par apprenant
-- Saisie par le formateur (coach) — consultée par la commerciale
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Format JSON :
-- {
--   "seances_effectuees": 10,
--   "presences": 8,
--   "absences": 2,
--   "updated_at": "2026-05-11T14:30:00Z"
-- }
ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS suivi_presences JSONB DEFAULT NULL;

-- ── acces_apprenant_migration.sql  (2026-05-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- Colonne acces_apprenant sur assignations_parcours
-- Stocke les identifiants générés lors de la conversion prospect → apprenant
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS acces_apprenant JSONB;

-- Index GIN pour requêtes sur le JSON (optionnel)
CREATE INDEX IF NOT EXISTS idx_assignations_acces_apprenant
  ON public.assignations_parcours USING GIN (acces_apprenant);

-- ── assignations_source_migration.sql  (2026-05-20) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- MIGRATION : Ajout colonne source à assignations_parcours
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Valeurs possibles : 'parcours' | 'test_niveau' | NULL (anciens enregistrements)

COMMENT ON COLUMN public.assignations_parcours.source IS
  'Origine de l''assignation : parcours (formulaire standard) ou test_niveau (prospect via page test de niveau)';

-- ── plan_paiement_migration.sql  (2026-05-20) ──────────────────────────────
-- Migration : plan de paiement échelonné + blocage d'accès
-- Ajoute la colonne plan_paiement (JSONB) à assignations_parcours
-- Structure :
-- {
--   "acces_bloque": false,
--   "raison_blocage": null,
--   "tranches": [
--     {
--       "id": "t1",
--       "label": "Acompte",
--       "montant": 75000,
--       "date_echeance": "2026-06-01",
--       "statut": "en_attente",   -- "en_attente" | "payé" | "retard"
--       "date_paiement_effectif": null,
--       "notes": null
--     }
--   ]
-- }

ALTER TABLE assignations_parcours
  ADD COLUMN IF NOT EXISTS plan_paiement JSONB DEFAULT NULL;

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

-- ── assignations_paiement_migration.sql  (2026-06-19) ──────────────────────────────
-- ═══════════════════════════════════════════════════════════
--  MIGRATION : Enrichissement assignations_parcours
--  Ajoute les informations de paiement en ligne et l'offre
--  pour que l'assistante commerciale voie tout le contexte
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS inscription_offre  TEXT,       -- ex : "Anglais Professionnel · En ligne"
  ADD COLUMN IF NOT EXISTS montant_paye       INTEGER,    -- montant déjà réglé (paiement en ligne)
  ADD COLUMN IF NOT EXISTS niveau_client      TEXT,       -- niveau CECRL déclaré : A1-A2, B1-B2…
  ADD COLUMN IF NOT EXISTS objectif_client    TEXT,       -- objectif exprimé par le client
  ADD COLUMN IF NOT EXISTS notes              TEXT;       -- notes libres du superadmin

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

-- ── profil_enfant_migration.sql  (2026-06-19) ──────────────────────────────
-- MIGRATION : Profil enfant sur assignations_parcours
-- Ajoute la distinction adulte / enfant / etudiant et les coordonnées du parent

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS profil_type       TEXT DEFAULT 'adulte',
  ADD COLUMN IF NOT EXISTS nom_parent        TEXT,
  ADD COLUMN IF NOT EXISTS telephone_parent  TEXT,
  ADD COLUMN IF NOT EXISTS email_parent      TEXT;

COMMENT ON COLUMN public.assignations_parcours.profil_type      IS '''adulte'' | ''enfant'' | ''etudiant''';
COMMENT ON COLUMN public.assignations_parcours.nom_parent       IS 'Nom complet du parent / tuteur (si profil_type = enfant)';
COMMENT ON COLUMN public.assignations_parcours.telephone_parent IS 'Téléphone du parent / tuteur';
COMMENT ON COLUMN public.assignations_parcours.email_parent     IS 'Email du parent / tuteur';

-- ── routing_parcours_migration.sql  (2026-06-19) ──────────────────────────────
                 -- MIGRATION : Routing post-finalisation (PA Advisor / Onboarding)
-- Ajoute le statut de routing et l'ID du PA advisor choisi

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS routing_statut  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pa_advisor_id   UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assignations_parcours.routing_statut IS
  'NULL (pas encore finalisé) | ''pa_en_attente'' | ''pa_affecte'' | ''onboarding_en_attente'' | ''onboarding_affecte''';

COMMENT ON COLUMN public.assignations_parcours.pa_advisor_id IS
  'ID utilisateur du PA Advisor choisi (cours privés uniquement)';

CREATE INDEX IF NOT EXISTS idx_assignations_routing   ON public.assignations_parcours(routing_statut);
CREATE INDEX IF NOT EXISTS idx_assignations_pa_advisor ON public.assignations_parcours(pa_advisor_id);

-- ── assignations_enfant_migration.sql  (2026-06-24) ──────────────────────────────
-- Migration : ajouter les champs spécifiques au profil enfant dans assignations_parcours
-- Ces champs sont aussi stockés dans suivi_demarrage (JSONB) comme fallback.

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS prenom_enfant        TEXT,
  ADD COLUMN IF NOT EXISTS nom_enfant           TEXT,
  ADD COLUMN IF NOT EXISTS age_enfant           TEXT,
  ADD COLUMN IF NOT EXISTS niveau_classe_enfant TEXT;

CREATE INDEX IF NOT EXISTS idx_assignations_profil_type
  ON public.assignations_parcours(profil_type);

-- Backfill depuis suivi_demarrage pour les lignes existantes
UPDATE public.assignations_parcours
SET
  prenom_enfant        = suivi_demarrage->>'prenom_enfant',
  nom_enfant           = suivi_demarrage->>'nom_enfant',
  age_enfant           = suivi_demarrage->>'age_enfant',
  niveau_classe_enfant = suivi_demarrage->>'niveau_classe_enfant'
WHERE profil_type = 'enfant'
  AND suivi_demarrage IS NOT NULL
  AND (prenom_enfant IS NULL OR nom_enfant IS NULL);

-- ── assignations_onboarding_id_migration.sql  (2026-06-24) ──────────────────────────────
-- Migration : ajouter onboarding_id dans assignations_parcours
-- But : figer l'onboarding responsable AU MOMENT de l'inscription.
-- Ainsi, si une commerciale change d'onboarding, ses anciens dossiers
-- restent visibles par l'ancien onboarding (et ne "migrent" pas vers le nouveau).

ALTER TABLE public.assignations_parcours
  ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES public.utilisateurs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignations_onboarding_id
  ON public.assignations_parcours(onboarding_id);

-- Backfill : remplir onboarding_id pour les inscriptions existantes
-- en utilisant l'onboarding_id ACTUEL de l'assistante (meilleure approximation possible).
UPDATE public.assignations_parcours ap
SET    onboarding_id = a.onboarding_id
FROM   public.assistantes a
WHERE  ap.assistante_id = a.id
  AND  a.onboarding_id IS NOT NULL
  AND  ap.onboarding_id IS NULL;

-- ── anti_doublon_migration.sql  (9999) ──────────────────────────────
-- 0. Colonne de rattachement à un compte apprenant existant (identité stable,
--    au lieu de ne compter que sur une comparaison d'email en texte libre).
ALTER TABLE assignations_parcours ADD COLUMN IF NOT EXISTS apprenant_id uuid REFERENCES utilisateurs(id);

-- Anti-doublon (défense en profondeur au niveau base de données)
-- ⚠️ À exécuter APRÈS avoir nettoyé les doublons existants (voir rapport fourni
-- séparément) — sinon la création des index échouera (Postgres refuse un index
-- unique si des lignes en violent déjà la contrainte).
--
-- Objectif : même si un bug applicatif futur recontourne les vérifications
-- côté code (Backend/src/routes/parcours.js et groupes.js), la base elle-même
-- refuse désormais la création d'un doublon.

-- 1. groupes_apprenants : une même personne (apprenant_id, ou à défaut email)
--    ne peut avoir qu'UNE ligne active (non "retire") par classe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_groupes_apprenants_actif_par_apprenant
  ON groupes_apprenants (groupe_id, apprenant_id)
  WHERE statut <> 'retire' AND apprenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_groupes_apprenants_actif_par_email
  ON groupes_apprenants (groupe_id, lower(email_apprenant))
  WHERE statut <> 'retire' AND apprenant_id IS NULL AND email_apprenant IS NOT NULL;

-- 2. assignations_parcours : un même prospect (email) ne peut avoir qu'UN dossier
--    actif par canal (type_cours + type_coaching + centre_id, coalescés pour que
--    deux NULL soient considérés identiques). Profils "enfant" scopés en plus par
--    l'enfant (un même parent peut légitimement inscrire plusieurs enfants).
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignations_actif_par_canal
  ON assignations_parcours (
    lower(prospect_email), type_cours,
    COALESCE(type_coaching, ''), COALESCE(centre_id::text, '')
  )
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND (profil_type IS DISTINCT FROM 'enfant');

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignations_actif_par_canal_enfant
  ON assignations_parcours (
    lower(prospect_email), type_cours,
    COALESCE(type_coaching, ''), COALESCE(centre_id::text, ''),
    lower(COALESCE(prenom_enfant, '')), lower(COALESCE(nom_enfant, ''))
  )
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND profil_type = 'enfant';

-- ── nettoyage_doublons_avant_index.sql  (9999) ──────────────────────────────
-- Nettoyage des doublons existants — À EXÉCUTER AVANT anti_doublon_migration.sql
-- (les CREATE UNIQUE INDEX de ce fichier échouent tant que ces doublons existent).
--
-- Principe : rien n'est supprimé physiquement. Pour chaque groupe de doublons,
-- on garde 1 seule ligne "de référence" (la plus avancée : paiement reçu > montant
-- le plus élevé > statut converti > la plus ancienne), et on fait passer les autres
-- au statut d'annulation/retrait déjà utilisé partout ailleurs dans l'app — donc
-- réversible et consultable dans les archives/dossiers annulés.
--
-- ⚠️ Deux groupes ont été signalés comme ambigus (montants différents pouvant être
-- 2 vrais paiements) : ils sont traités par la même règle automatique ci-dessous
-- pour permettre la création des index, mais vérifiez-les après coup :
--   - Siaka koudou (doumbia99siaka@gmail.com, présentiel)
--   - jr valverde (valverde@gmail.com, presentiel/prive)

BEGIN;

-- 1. assignations_parcours : annuler tous les doublons sauf le "meilleur" par groupe
WITH classement AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(prospect_email), type_cours,
        COALESCE(type_coaching, ''), COALESCE(centre_id::text, ''),
        CASE WHEN profil_type = 'enfant' THEN lower(COALESCE(prenom_enfant,'')) END,
        CASE WHEN profil_type = 'enfant' THEN lower(COALESCE(nom_enfant,'')) END
      ORDER BY
        CASE WHEN statut_paiement IN ('reçu','paye','confirme') THEN 0
             WHEN statut_paiement = 'partiel' THEN 1
             ELSE 2 END,
        COALESCE(montant_paye, 0) DESC,
        CASE WHEN statut = 'converti' THEN 0 ELSE 1 END,
        created_at ASC
    ) AS rang
  FROM assignations_parcours
  WHERE statut NOT IN ('annule','annulee','refuse','refusee')
    AND prospect_email IS NOT NULL
)
UPDATE assignations_parcours a
SET statut = 'annule',
    notes = COALESCE(notes || E'\n', '') || '[NETTOYAGE DOUBLON] Dossier dupliqué, annulé automatiquement — voir dossier conservé pour ce même prospect/canal.'
FROM classement c
WHERE a.id = c.id AND c.rang > 1;

-- 2. groupes_apprenants : retirer tous les doublons sauf le "meilleur" par classe
WITH classement_ga AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY groupe_id, COALESCE(apprenant_id::text, lower(email_apprenant))
      ORDER BY date_ajout ASC
    ) AS rang
  FROM groupes_apprenants
  WHERE statut <> 'retire'
    AND (apprenant_id IS NOT NULL OR email_apprenant IS NOT NULL)
)
UPDATE groupes_apprenants g
SET statut = 'retire',
    note = COALESCE(note || E'\n', '') || '[NETTOYAGE DOUBLON] Inscription dupliquée, retirée automatiquement.'
FROM classement_ga c
WHERE g.id = c.id AND c.rang > 1;

COMMIT;

-- Vérification rapide après exécution (doit retourner 0 lignes des deux côtés) :
-- SELECT lower(prospect_email), type_cours, COALESCE(type_coaching,''), COALESCE(centre_id::text,''), count(*)
--   FROM assignations_parcours WHERE statut NOT IN ('annule','annulee','refuse','refusee')
--   GROUP BY 1,2,3,4 HAVING count(*) > 1;
-- SELECT groupe_id, COALESCE(apprenant_id::text, lower(email_apprenant)), count(*)
--   FROM groupes_apprenants WHERE statut <> 'retire'
--   GROUP BY 1,2 HAVING count(*) > 1;

