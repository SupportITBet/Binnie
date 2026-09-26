-- ============================================================================
--  IMPORTS EN MASSE — traçabilité, annulation et idempotence
--
--  Avant : un import se déroulait entièrement dans le navigateur, ligne par
--  ligne, sans laisser la moindre trace. Conséquences constatées :
--    - onglet fermé en cours de route = lot à moitié importé, sans signal ;
--    - une ligne échouant après la création du dossier laissait un orphelin ;
--    - aucun moyen d'annuler un lot : il a fallu écrire un script de
--      suppression sur mesure pour nettoyer un import de test ;
--    - réimporter le même fichier recréait tout en double.
--
--  Cette migration pose le socle : chaque import devient un objet suivi, et
--  chaque ligne créée porte l'identifiant de l'import qui l'a produite — ce
--  qui rend l'annulation d'un lot triviale et sûre.
-- ============================================================================

-- 1. Le journal des imports ---------------------------------------------------
CREATE TABLE IF NOT EXISTS imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- classes | groupes | apprenants | prive_presentiel | prive_en_ligne | global
  type           text        NOT NULL,
  fichier_nom    text,
  lance_par_id   uuid,
  lance_par_nom  text,
  lance_par_role text,
  -- Contexte figé au lancement (centre_id, assistante_id, type_cours…) : il
  -- détermine ce qui est créé, donc il doit rester lisible après coup.
  contexte       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  nb_lignes      integer     NOT NULL DEFAULT 0,
  nb_ok          integer     NOT NULL DEFAULT 0,
  nb_erreur      integer     NOT NULL DEFAULT 0,
  nb_ignore      integer     NOT NULL DEFAULT 0,  -- doublons sautés (idempotence)
  -- en_cours | termine | interrompu | annule
  statut         text        NOT NULL DEFAULT 'en_cours',
  resultats      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  termine_at     timestamptz,
  annule_at      timestamptz,
  annule_par_nom text
);

CREATE INDEX IF NOT EXISTS idx_imports_created  ON imports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imports_statut   ON imports (statut);
CREATE INDEX IF NOT EXISTS idx_imports_lance_par ON imports (lance_par_id);

-- 2. Estampille sur tout ce qu'un import crée ---------------------------------
--    ON DELETE SET NULL et non CASCADE : supprimer une ligne du journal ne doit
--    jamais emporter des données métier. L'annulation est une opération
--    explicite, jamais un effet de bord.
ALTER TABLE assignations_parcours ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE groupes               ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE paiements_parcours    ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE groupes_apprenants    ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE utilisateurs          ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignations_import ON assignations_parcours (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_groupes_import      ON groupes               (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paiements_import    ON paiements_parcours    (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grp_appr_import     ON groupes_apprenants    (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_utilisateurs_import ON utilisateurs          (import_id) WHERE import_id IS NOT NULL;

-- 3. Idempotence --------------------------------------------------------------
--    Empreinte stable d'une ligne de fichier (type + identité + rattachement).
--    Rejouer un fichier déjà importé saute les lignes déjà créées au lieu de
--    les dupliquer. L'unicité est PARTIELLE : elle ne s'applique qu'aux lignes
--    issues d'un import, et laisse totalement libres les créations manuelles.
ALTER TABLE assignations_parcours ADD COLUMN IF NOT EXISTS import_ligne_cle text;
ALTER TABLE groupes               ADD COLUMN IF NOT EXISTS import_ligne_cle text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_assignation_ligne_import
  ON assignations_parcours (import_ligne_cle)
  WHERE import_ligne_cle IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_groupe_ligne_import
  ON groupes (import_ligne_cle)
  WHERE import_ligne_cle IS NOT NULL;

-- 4. updated_at tenu à jour ---------------------------------------------------
CREATE OR REPLACE FUNCTION imports_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_imports_updated_at ON imports;
CREATE TRIGGER trg_imports_updated_at
  BEFORE UPDATE ON imports
  FOR EACH ROW EXECUTE FUNCTION imports_touch_updated_at();
