-- ═══════════════════════════════════════════════════════
-- Migration Corporate B2B — Assistante Commerciale Corporate
-- ═══════════════════════════════════════════════════════

-- ── Table : comptes entreprises ─────────────────────────────
CREATE TABLE IF NOT EXISTS comptes_entreprises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistante_id UUID REFERENCES assistantes(id) ON DELETE SET NULL,
  nom           TEXT NOT NULL,
  rccm          TEXT,
  secteur       TEXT,
  nb_employes   INTEGER,
  referent_rh_nom       TEXT,
  referent_rh_email     TEXT,
  referent_rh_telephone TEXT,
  budget_formation      NUMERIC(12,2),
  ville         TEXT,
  adresse       TEXT,
  site_web      TEXT,
  notes         TEXT,
  statut        TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','inactif','suspendu')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Table : pipeline prospects B2B ──────────────────────────
CREATE TABLE IF NOT EXISTS prospects_b2b (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id   UUID REFERENCES comptes_entreprises(id) ON DELETE CASCADE,
  assistante_id   UUID REFERENCES assistantes(id) ON DELETE SET NULL,
  titre           TEXT NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'prospection'
                    CHECK (statut IN ('prospection','negociation','proposition','conclu','perdu')),
  montant_estime  NUMERIC(12,2),
  date_cloture_prevue DATE,
  notes           TEXT,
  historique      JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Table : documents commerciaux B2B ────────────────────────
CREATE TABLE IF NOT EXISTS documents_b2b (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id   UUID REFERENCES comptes_entreprises(id) ON DELETE CASCADE,
  prospect_id     UUID REFERENCES prospects_b2b(id) ON DELETE SET NULL,
  assistante_id   UUID REFERENCES assistantes(id) ON DELETE SET NULL,
  type_doc        TEXT NOT NULL CHECK (type_doc IN ('proforma','bon_commande','contrat','autre')),
  titre           TEXT NOT NULL,
  fichier_url     TEXT,
  montant         NUMERIC(12,2),
  statut          TEXT DEFAULT 'brouillon' CHECK (statut IN ('brouillon','envoyé','signé','annulé')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Table : factures B2B ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures_b2b (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id   UUID REFERENCES comptes_entreprises(id) ON DELETE CASCADE,
  assistante_id   UUID REFERENCES assistantes(id) ON DELETE SET NULL,
  numero          TEXT NOT NULL,
  objet           TEXT,
  montant_ht      NUMERIC(12,2) NOT NULL DEFAULT 0,
  taux_tva        NUMERIC(5,2) DEFAULT 18,
  montant_ttc     NUMERIC(12,2) GENERATED ALWAYS AS (montant_ht * (1 + taux_tva / 100)) STORED,
  statut          TEXT NOT NULL DEFAULT 'brouillon'
                    CHECK (statut IN ('brouillon','envoyée','payée','en_retard','annulée')),
  date_echeance   DATE,
  date_paiement   DATE,
  mode_paiement   TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_prospects_b2b_statut        ON prospects_b2b(statut);
CREATE INDEX IF NOT EXISTS idx_prospects_b2b_entreprise    ON prospects_b2b(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_factures_b2b_statut         ON factures_b2b(statut);
CREATE INDEX IF NOT EXISTS idx_comptes_entreprises_statut  ON comptes_entreprises(statut);
