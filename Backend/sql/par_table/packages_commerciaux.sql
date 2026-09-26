-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `packages_commerciaux`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── packages_commerciaux_migration.sql  (2026-07-29) ──────────────────────────────
-- ══════════════════════════════════════════════════════════════
-- TABLE packages_commerciaux — packages tarifaires utilisés à la
-- création d'une entreprise cliente (calcul du CA, échéanciers,
-- versements). Remplace le stockage localStorage précédent.
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- id en TEXT (pas UUID) : les entreprises/contrats déjà enregistrés référencent le
-- package choisi par son id ("starter", "business", "premium", "enterprise" — voir
-- l'ancien mock/entreprises.js). On garde exactement ces mêmes id pour que ces
-- références existantes continuent de résoudre le bon package après la migration.
CREATE TABLE IF NOT EXISTS public.packages_commerciaux (
  id          TEXT        PRIMARY KEY,
  libelle     TEXT        NOT NULL,
  description TEXT,
  tarif       INTEGER     NOT NULL DEFAULT 0,        -- FCFA / bénéficiaire
  max_benef   INTEGER     NOT NULL DEFAULT 10,        -- 999 = illimité (convention existante)
  couleur     TEXT        NOT NULL DEFAULT '#0891B2',
  actif       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.packages_commerciaux DISABLE ROW LEVEL SECURITY;

-- Packages de départ (repris exactement des valeurs + id du mock existant,
-- mock/entreprises.js) — à ajuster librement ensuite depuis Admin BET → Configuration
-- → Packages & Contrats. Les nouveaux packages créés depuis l'UI auront un id généré
-- aléatoirement (pkg-<timestamp>, cf. code existant) — sans lien avec ces id historiques.
INSERT INTO public.packages_commerciaux (id, libelle, description, tarif, max_benef, couleur, actif)
SELECT * FROM (VALUES
  ('starter',    'Starter',    NULL, 200000, 10,  '#94A3B8', true),
  ('business',   'Business',   NULL, 190000, 25,  '#0891B2', true),
  ('premium',    'Premium',    NULL, 183333, 50,  '#8B5CF6', true),
  ('enterprise', 'Enterprise', NULL, 184000, 999, '#F97316', true)
) AS v(id, libelle, description, tarif, max_benef, couleur, actif)
WHERE NOT EXISTS (SELECT 1 FROM public.packages_commerciaux);

