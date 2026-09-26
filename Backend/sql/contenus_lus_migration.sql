-- Migration : table contenus_lus
-- Trace les cours/contenus marqués comme "Lu" par les apprenants

CREATE TABLE IF NOT EXISTS contenus_lus (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contenu_id   uuid NOT NULL,
  apprenant_id uuid NOT NULL,
  classe_id    uuid,
  lu_le        timestamptz DEFAULT now(),
  UNIQUE (contenu_id, apprenant_id)
);

CREATE INDEX IF NOT EXISTS idx_contenus_lus_contenu    ON contenus_lus(contenu_id);
CREATE INDEX IF NOT EXISTS idx_contenus_lus_apprenant  ON contenus_lus(apprenant_id);
