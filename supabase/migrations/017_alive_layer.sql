-- ============================================================
--  FACELESS ANIMAL STUDIOS — ALIVE LAYER (MIGRATION 017)
--
--  Adds:
--    1) member_accounts.momentum
--    2) activity_log table
--
--  Goal:
--    Minimal-compatible activity tracking for login, page session start,
--    and successful radio uploads.
-- ============================================================

-- ── 1) member_accounts: momentum ─────────────────────────────
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS momentum INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_member_accounts_momentum
  ON member_accounts (momentum DESC);


-- ── 2) activity_log table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  username     TEXT        NOT NULL,
  action_type  TEXT        NOT NULL,
  page_path    TEXT,
  context_json JSONB       NOT NULL DEFAULT '{}'::jsonb,
  source       TEXT,
  ref_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_log_username_created
  ON activity_log (username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_action_created
  ON activity_log (action_type, created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Compatible with existing anon/session-anchor architecture.
CREATE POLICY "activity_log: public read"
  ON activity_log FOR SELECT TO anon USING (true);

CREATE POLICY "activity_log: public insert"
  ON activity_log FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "activity_log: admin full access"
  ON activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
