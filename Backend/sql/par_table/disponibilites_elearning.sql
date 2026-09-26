-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `disponibilites_elearning`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── elearning_complet_migration.sql  (2026-07-02) ──────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLÈTE E-LEARNING — Tables dédiées par profil
-- Séparées du système BET classique, sans modifier les tables existantes
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COACH E-LEARNING — Profil enrichi (distinct de utilisateurs BET)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_elearning_profil (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id            UUID NOT NULL UNIQUE REFERENCES utilisateurs(id) ON DELETE CASCADE,
  bio                 TEXT,
  photo_url           TEXT,
  -- Niveaux et spécialisations
  niveaux_enseignes   TEXT[]  DEFAULT '{}',   -- ['A1','B1','C1'...]
  specialisations     TEXT[]  DEFAULT '{}',   -- ['Business English','Kids','TOEFL'...]
  langues_enseignees  TEXT[]  DEFAULT '{"Anglais"}',
  -- Certifications
  certifications      JSONB   DEFAULT '[]',   -- [{nom,organisme,annee,valide}]
  -- Tarification e-learning (distinct du tarif BET)
  tarif_horaire       NUMERIC(10,2) DEFAULT 0,
  devise              TEXT    DEFAULT 'FCFA',
  -- Infos complémentaires
  experience_annees   INTEGER DEFAULT 0,
  linkedin_url        TEXT,
  actif               BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cep_coach ON coach_elearning_profil(coach_id);
ALTER TABLE coach_elearning_profil ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cep_all" ON coach_elearning_profil FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DISPONIBILITÉS E-LEARNING du coach
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disponibilites_elearning (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id     UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  jour         TEXT NOT NULL CHECK (jour IN ('Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche')),
  heure_debut  TIME NOT NULL,
  heure_fin    TIME NOT NULL,
  recurrent    BOOLEAN DEFAULT true,
  date_debut   DATE,    -- si non récurrent : date de début
  date_fin     DATE,    -- si non récurrent : date de fin
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_del_coach ON disponibilites_elearning(coach_id);
ALTER TABLE disponibilites_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "del_all" ON disponibilites_elearning FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SÉANCES E-LEARNING — Sessions individuelles des classes
--    Distinct de sessions_live (BET) et de horaire JSONB (template)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seances_elearning (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id         UUID NOT NULL REFERENCES classes_elearning(id) ON DELETE CASCADE,
  coach_id          UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE SET NULL,
  -- Planification
  date              DATE NOT NULL,
  heure_debut       TIME NOT NULL,
  heure_fin         TIME NOT NULL,
  duree_minutes     INTEGER GENERATED ALWAYS AS (
                      EXTRACT(HOUR FROM (heure_fin - heure_debut))::INTEGER * 60 +
                      EXTRACT(MINUTE FROM (heure_fin - heure_debut))::INTEGER
                    ) STORED,
  -- Type et statut
  type              TEXT DEFAULT 'cours' CHECK (type IN ('cours','evaluation','rattrapage','decouverte')),
  statut            TEXT DEFAULT 'planifiee' CHECK (statut IN ('planifiee','en_cours','realisee','annulee','reportee')),
  -- Lien visio
  lien_zoom         TEXT,
  lien_meet         TEXT,
  lien_teams        TEXT,
  -- Après la séance
  enregistrement_url TEXT,         -- lien replay
  nb_presents        INTEGER DEFAULT 0,
  compte_rendu       TEXT,         -- notes du coach
  objectifs_session  TEXT,         -- ce qui était prévu
  bilan_session      TEXT,         -- ce qui a été fait
  -- Honoraires liés
  tarif_applique     NUMERIC(10,2),   -- tarif horaire au moment de la séance
  montant_seance     NUMERIC(10,2),   -- tarif_applique * duree_minutes/60
  honoraire_valide   BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sel_classe  ON seances_elearning(classe_id);
CREATE INDEX IF NOT EXISTS idx_sel_coach   ON seances_elearning(coach_id);
CREATE INDEX IF NOT EXISTS idx_sel_date    ON seances_elearning(date);
CREATE INDEX IF NOT EXISTS idx_sel_statut  ON seances_elearning(statut);
ALTER TABLE seances_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sel_all" ON seances_elearning FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. APPRENANTS E-LEARNING — Profil enrichi
--    Étend classes_elearning_apprenants (ne le remplace pas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apprenants_elearning (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscription_id      UUID UNIQUE REFERENCES classes_elearning_apprenants(id) ON DELETE CASCADE,
  entreprise_id       UUID REFERENCES comptes_entreprises(id) ON DELETE SET NULL,
  -- Profil
  langue_maternelle   TEXT,
  nationalite         TEXT,
  objectifs           TEXT[]  DEFAULT '{}',  -- ['Professionnel','Voyage','TOEFL','DELF'...]
  motivations         TEXT,
  -- Niveau
  niveau_initial      TEXT,   -- résultat test placement
  niveau_actuel       TEXT,   -- mis à jour au fil du temps
  date_test_placement DATE,
  score_test_placement NUMERIC(5,2),
  -- Suivi
  nb_absences         INTEGER DEFAULT 0,
  nb_seances_suivies  INTEGER DEFAULT 0,
  taux_presence       NUMERIC(5,2) DEFAULT 0,
  derniere_activite   TIMESTAMPTZ,
  notes_internes      TEXT,   -- notes PA Advisor / coach (non visibles par l'apprenant)
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ael_inscription ON apprenants_elearning(inscription_id);
CREATE INDEX IF NOT EXISTS idx_ael_entreprise  ON apprenants_elearning(entreprise_id);
ALTER TABLE apprenants_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ael_all" ON apprenants_elearning FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PRÉSENCES E-LEARNING — Feuille de présence par séance
--    Distinct de suivi_presences (BET)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presences_elearning (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seance_id       UUID NOT NULL REFERENCES seances_elearning(id) ON DELETE CASCADE,
  inscription_id  UUID NOT NULL REFERENCES classes_elearning_apprenants(id) ON DELETE CASCADE,
  -- Présence
  statut          TEXT DEFAULT 'absent' CHECK (statut IN ('present','absent','retard','excuse')),
  heure_connexion      TIMESTAMPTZ,
  heure_deconnexion    TIMESTAMPTZ,
  duree_connexion_min  INTEGER,    -- durée effective en minutes
  -- Observations
  note_participation   INTEGER CHECK (note_participation BETWEEN 1 AND 5),
  observation          TEXT,
  -- Saisie
  saisi_par       UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Unicité : un seul enregistrement par apprenant par séance
  UNIQUE (seance_id, inscription_id)
);

CREATE INDEX IF NOT EXISTS idx_pel_seance      ON presences_elearning(seance_id);
CREATE INDEX IF NOT EXISTS idx_pel_inscription ON presences_elearning(inscription_id);
ALTER TABLE presences_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pel_all" ON presences_elearning FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PROGRESSION E-LEARNING — Avancement apprenant par cours / module
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS progression_elearning (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscription_id  UUID NOT NULL REFERENCES classes_elearning_apprenants(id) ON DELETE CASCADE,
  cours_id        UUID NOT NULL REFERENCES cours_elearning(id) ON DELETE CASCADE,
  module_id       UUID REFERENCES modules_elearning(id) ON DELETE CASCADE,
  statut          TEXT DEFAULT 'non_commence' CHECK (statut IN ('non_commence','en_cours','termine')),
  score           NUMERIC(5,2),     -- 0–100
  temps_passe_min INTEGER DEFAULT 0,
  date_debut      TIMESTAMPTZ,
  date_completion TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (inscription_id, cours_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_prog_inscription ON progression_elearning(inscription_id);
CREATE INDEX IF NOT EXISTS idx_prog_cours       ON progression_elearning(cours_id);
ALTER TABLE progression_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prog_all" ON progression_elearning FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RÉSULTATS E-LEARNING — Notes et évaluations des apprenants
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resultats_elearning (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscription_id  UUID NOT NULL REFERENCES classes_elearning_apprenants(id) ON DELETE CASCADE,
  classe_id       UUID NOT NULL REFERENCES classes_elearning(id) ON DELETE CASCADE,
  seance_id       UUID REFERENCES seances_elearning(id) ON DELETE SET NULL,
  -- Type d'évaluation
  type            TEXT DEFAULT 'controle' CHECK (type IN ('controle','oral','ecrit','final','placement','certification')),
  titre           TEXT,
  -- Notes
  note            NUMERIC(5,2),
  note_max        NUMERIC(5,2) DEFAULT 20,
  mention         TEXT,  -- Excellent, Bien, Assez Bien, Passable, Insuffisant
  -- Compétences évaluées (CECR)
  competences     JSONB DEFAULT '[]',  -- [{id, lib, note}]
  niveau_atteint  TEXT,    -- niveau CECR validé si éval finale
  -- Commentaires
  commentaire_coach TEXT,
  points_forts    TEXT,
  axes_amelioration TEXT,
  -- Saisie
  evalue_par      UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  date_evaluation DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_res_inscription ON resultats_elearning(inscription_id);
CREATE INDEX IF NOT EXISTS idx_res_classe      ON resultats_elearning(classe_id);
ALTER TABLE resultats_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "res_all" ON resultats_elearning FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. HONORAIRES E-LEARNING — Récap mensuel par coach
--    Distinct de honoraires_mois (BET) — même concept, circuit séparé
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS honoraires_elearning_mois (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  mois            INTEGER NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee           INTEGER NOT NULL,
  -- Activité du mois
  nb_seances      INTEGER DEFAULT 0,
  nb_heures       NUMERIC(6,2) DEFAULT 0,
  nb_apprenants   INTEGER DEFAULT 0,  -- total apprenants présents sur le mois
  -- Calcul
  tarif_horaire   NUMERIC(10,2) DEFAULT 0,  -- snapshot du tarif au moment du calcul
  montant_brut    NUMERIC(10,2) DEFAULT 0,
  retenues        NUMERIC(10,2) DEFAULT 0,   -- charges, impôts...
  montant_net     NUMERIC(10,2) DEFAULT 0,
  -- Statut de paiement
  statut          TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente','valide','paye','litige')),
  valide_par      UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  valide_at       TIMESTAMPTZ,
  paye_at         TIMESTAMPTZ,
  mode_paiement   TEXT,     -- virement, espèces, mobile money...
  reference_paiement TEXT,
  note_pa         TEXT,
  -- Détail des séances du mois (snapshot)
  seances_ids     UUID[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (coach_id, mois, annee)
);

CREATE INDEX IF NOT EXISTS idx_hem_coach   ON honoraires_elearning_mois(coach_id);
CREATE INDEX IF NOT EXISTS idx_hem_periode ON honoraires_elearning_mois(annee, mois);
CREATE INDEX IF NOT EXISTS idx_hem_statut  ON honoraires_elearning_mois(statut);
ALTER TABLE honoraires_elearning_mois ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hem_all" ON honoraires_elearning_mois FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. FACTURES ENTREPRISES E-LEARNING
--    Distinct de la facturation BET
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures_entreprises_elearning (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id       UUID NOT NULL REFERENCES comptes_entreprises(id) ON DELETE CASCADE,
  numero_facture      TEXT UNIQUE,     -- EL-2026-001
  periode             TEXT NOT NULL,   -- '2026-06'
  -- Lignes
  nb_licences_actives INTEGER DEFAULT 0,
  nb_heures_realisees NUMERIC(6,2) DEFAULT 0,
  -- Montants
  montant_ht          NUMERIC(12,2) DEFAULT 0,
  taux_tva            NUMERIC(5,2)  DEFAULT 18,
  montant_tva         NUMERIC(12,2) DEFAULT 0,
  montant_ttc         NUMERIC(12,2) DEFAULT 0,
  devise              TEXT DEFAULT 'FCFA',
  -- Statut
  statut              TEXT DEFAULT 'brouillon' CHECK (statut IN ('brouillon','emise','payee','en_retard','annulee')),
  date_emission       DATE,
  date_echeance       DATE,
  date_paiement       DATE,
  mode_paiement       TEXT,
  reference_paiement  TEXT,
  notes               TEXT,
  -- Émetteur
  emis_par            UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fel_entreprise ON factures_entreprises_elearning(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_fel_statut     ON factures_entreprises_elearning(statut);
ALTER TABLE factures_entreprises_elearning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fel_all" ON factures_entreprises_elearning FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- VUES UTILITAIRES
-- ─────────────────────────────────────────────────────────────────────────────

-- Vue : taux de présence par classe (mis à jour depuis presences_elearning)
CREATE OR REPLACE VIEW vue_presences_elearning_classe AS
SELECT
  s.classe_id,
  COUNT(p.id)                                                    AS nb_presences_total,
  COUNT(p.id) FILTER (WHERE p.statut = 'present')               AS nb_presents,
  COUNT(p.id) FILTER (WHERE p.statut = 'absent')                AS nb_absents,
  COUNT(p.id) FILTER (WHERE p.statut = 'retard')                AS nb_retards,
  ROUND(
    COUNT(p.id) FILTER (WHERE p.statut IN ('present','retard'))::NUMERIC
    / NULLIF(COUNT(p.id), 0) * 100, 1
  )                                                              AS taux_presence_pct
FROM presences_elearning p
JOIN seances_elearning s ON s.id = p.seance_id
GROUP BY s.classe_id;

-- Vue : synthèse honoraires coach e-learning (toutes périodes)
CREATE OR REPLACE VIEW vue_honoraires_elearning AS
SELECT
  u.id                              AS coach_id,
  u.prenom || ' ' || u.nom         AS coach_nom,
  u.role,
  p.tarif_horaire,
  COUNT(h.id)                       AS nb_mois,
  COALESCE(SUM(h.nb_seances), 0)    AS total_seances,
  COALESCE(SUM(h.nb_heures), 0)     AS total_heures,
  COALESCE(SUM(h.montant_net), 0)   AS total_paye,
  COALESCE(SUM(h.montant_net) FILTER (WHERE h.statut = 'en_attente'), 0) AS montant_en_attente
FROM utilisateurs u
LEFT JOIN coach_elearning_profil p   ON p.coach_id = u.id
LEFT JOIN honoraires_elearning_mois h ON h.coach_id = u.id
WHERE u.acces_elearning = true
GROUP BY u.id, u.prenom, u.nom, u.role, p.tarif_horaire;

