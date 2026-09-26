-- ══════════════════════════════════════════════════════════════
-- Suivi réel des résultats de mini-jeux par apprenant (scores, tentatives,
-- pourcentage) — consultable par Onboarding PA / PA Contenus dans un modal
-- de détails par jeu. À exécuter dans Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contenus_mini_jeux_resultats (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jeu_id            UUID NOT NULL REFERENCES contenus_mini_jeux(id) ON DELETE CASCADE,
  apprenant_id      UUID NOT NULL REFERENCES utilisateurs(id),
  apprenant_nom     TEXT,
  score             INTEGER NOT NULL,
  score_max         INTEGER,
  pourcentage       NUMERIC,
  tentative_numero  INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmjr_jeu       ON contenus_mini_jeux_resultats(jeu_id);
CREATE INDEX IF NOT EXISTS idx_cmjr_apprenant ON contenus_mini_jeux_resultats(apprenant_id);
