-- ══════════════════════════════════════════════════════════════
-- Schéma consolidé — table `to`
-- Généré à partir de 1 fichier(s) de migration, dans l'ordre chronologique
-- d'application. Fichiers originaux conservés tels quels dans Backend/sql/.
-- ══════════════════════════════════════════════════════════════

-- ── notifications_migration.sql  (2026-05-21) ──────────────────────────────
-- Table notifications (remplace Firebase pour les notifs internes staff/coach)
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL,
  type       VARCHAR(50)  DEFAULT 'info',
  titre      TEXT NOT NULL,
  message    TEXT,
  lu         BOOLEAN      DEFAULT FALSE,
  meta       JSONB,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notif_user_created_idx ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur lit uniquement ses propres notifications
CREATE POLICY "read_own_notifs" ON notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Chaque utilisateur peut marquer ses propres notifs comme lues
CREATE POLICY "update_own_notifs" ON notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Le service role (backend) peut insérer des notifications pour n'importe quel utilisateur
-- (bypass RLS automatique avec service_role key — cette policy est pour le rôle service explicite)
CREATE POLICY "service_insert_notifs" ON notifications
  FOR INSERT TO service_role WITH CHECK (true);

-- Activer la diffusion Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

