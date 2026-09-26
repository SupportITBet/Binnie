-- ═══════════════════════════════════════════════════════════════════
-- BET - ASSISTANT MARKETING (suivi prospects)
-- Le volet communication réutilise le carrousel (carousel_slides) et le
-- marquee (marquee_messages) déjà existants - aucune nouvelle table pour ça.
-- Coller dans : Supabase Dashboard > SQL Editor > New query
-- À exécuter UNE SEULE FOIS
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. SUIVI MARKETING (relance, fidélisation, ambassadeur)
--    Peut référencer un dossier existant (assignation_id) ou être un
--    contact marketing pur (salon, réseau, sans dossier BET).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suivis_marketing (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignation_id      uuid        REFERENCES assignations_parcours(id) ON DELETE SET NULL,
  nom                 text        NOT NULL,
  email               text,
  telephone           text,
  statut              text        NOT NULL DEFAULT 'nouveau'
    CHECK (statut IN ('nouveau','relance','fidele','ambassadeur','perdu')),
  canal_dernier_contact text,
  dernier_contact_at  timestamptz,
  prochaine_relance_at timestamptz,
  notes               text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suivis_marketing_assignation ON suivis_marketing(assignation_id);
CREATE INDEX IF NOT EXISTS idx_suivis_marketing_statut      ON suivis_marketing(statut);
CREATE INDEX IF NOT EXISTS idx_suivis_marketing_relance      ON suivis_marketing(prochaine_relance_at);

ALTER TABLE suivis_marketing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_suivis_marketing" ON suivis_marketing;
CREATE POLICY "service_role_all_suivis_marketing" ON suivis_marketing
  FOR ALL USING (true) WITH CHECK (true);
