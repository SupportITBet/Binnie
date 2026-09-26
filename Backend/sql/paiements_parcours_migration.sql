-- ══════════════════════════════════════════════════════════════
-- Nouvelle table paiements_parcours (indépendante de l'ancienne)
-- À exécuter dans Supabase > SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS paiements_parcours (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id   UUID        NOT NULL,
  client          TEXT        NOT NULL,
  email           TEXT,
  telephone       TEXT,
  inscription     TEXT,
  montant_du      NUMERIC     NOT NULL DEFAULT 0,
  montant_recu    NUMERIC     NOT NULL DEFAULT 0,
  date_paiement   DATE        NOT NULL DEFAULT CURRENT_DATE,
  mode_paiement   TEXT        NOT NULL DEFAULT 'Mobile Money',
  statut          TEXT        NOT NULL DEFAULT 'en_attente',
  ref_transaction TEXT,
  notes           TEXT,
  assignation_id  UUID        REFERENCES assignations_parcours(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pp_commercial   ON paiements_parcours(commercial_id);
CREATE INDEX IF NOT EXISTS idx_pp_assignation  ON paiements_parcours(assignation_id);
CREATE INDEX IF NOT EXISTS idx_pp_date         ON paiements_parcours(date_paiement DESC);

ALTER TABLE paiements_parcours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_select ON paiements_parcours;
CREATE POLICY pp_select ON paiements_parcours FOR SELECT USING (commercial_id = auth.uid());

DROP POLICY IF EXISTS pp_insert ON paiements_parcours;
CREATE POLICY pp_insert ON paiements_parcours FOR INSERT WITH CHECK (commercial_id = auth.uid());

DROP POLICY IF EXISTS pp_update ON paiements_parcours;
CREATE POLICY pp_update ON paiements_parcours FOR UPDATE USING (commercial_id = auth.uid());

DROP POLICY IF EXISTS pp_delete ON paiements_parcours;
CREATE POLICY pp_delete ON paiements_parcours FOR DELETE USING (commercial_id = auth.uid());
