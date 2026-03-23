-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL CODE CONTACT MODEL
--  supabase/migrations/027_signal_code_contact_model.sql
--
--  Purpose:
--    1) Make platform_id the canonical Signal Code key for direct contact.
--    2) Add privacy-first contact policy fields on member_accounts.
--    3) Add user_connections table for DM/call permission state.
--
--  Notes:
--    - Existing platform_id values are preserved.
--    - Any missing platform_id values are safely backfilled.
-- ============================================================

BEGIN;

-- Safety backfill for any legacy rows still missing Signal Code.
UPDATE member_accounts
SET platform_id = 'sig_' || lower(left(replace(gen_random_uuid()::text, '-', ''), 12))
WHERE platform_id IS NULL;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS contact_mode TEXT DEFAULT 'signal_code_only',
  ADD COLUMN IF NOT EXISTS auto_accept_code_holders BOOLEAN DEFAULT true;

UPDATE member_accounts
SET
  contact_mode = COALESCE(contact_mode, 'signal_code_only'),
  auto_accept_code_holders = COALESCE(auto_accept_code_holders, true)
WHERE contact_mode IS NULL OR auto_accept_code_holders IS NULL;

ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_contact_mode;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_contact_mode
  CHECK (contact_mode IN ('signal_code_only'));

CREATE TABLE IF NOT EXISTS user_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_username TEXT NOT NULL,
  requester_platform_id TEXT,
  target_username TEXT NOT NULL,
  target_platform_id TEXT,
  pair_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN requester_username < target_username THEN requester_username || '::' || target_username
      ELSE target_username || '::' || requester_username
    END
  ) STORED,
  state TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_connections_pair_key_unique
  ON user_connections (pair_key);

CREATE INDEX IF NOT EXISTS idx_user_connections_requester
  ON user_connections (requester_username, state);

CREATE INDEX IF NOT EXISTS idx_user_connections_target
  ON user_connections (target_username, state);

ALTER TABLE user_connections
  DROP CONSTRAINT IF EXISTS chk_user_connections_state;

ALTER TABLE user_connections
  ADD CONSTRAINT chk_user_connections_state
  CHECK (state IN ('none', 'requested', 'connected', 'blocked'));

CREATE OR REPLACE FUNCTION set_user_connections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_connections_updated_at ON user_connections;

CREATE TRIGGER trg_user_connections_updated_at
BEFORE UPDATE ON user_connections
FOR EACH ROW
EXECUTE FUNCTION set_user_connections_updated_at();

ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_connections: no anon access" ON user_connections;

CREATE POLICY "user_connections: no anon access"
  ON user_connections
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
