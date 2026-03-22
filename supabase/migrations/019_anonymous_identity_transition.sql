-- ============================================================
--  FACELESS ANIMAL STUDIOS — ANONYMOUS IDENTITY TRANSITION
--  supabase/migrations/019_anonymous_identity_transition.sql
--
--  Purpose:
--    1) Remove email requirement from account creation path
--    2) Add stable platform Signal ID on member_accounts
--    3) Add hashed recovery code storage + verification RPC
--
--  Run in Supabase SQL Editor after migration 012.
-- ============================================================

BEGIN;

-- Profiles can no longer require email for anonymous-first onboarding.
ALTER TABLE profiles
  ALTER COLUMN email DROP NOT NULL;

-- Add anonymous identity fields on member_accounts.
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS platform_id TEXT,
  ADD COLUMN IF NOT EXISTS recovery_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS recovery_code_set_at TIMESTAMPTZ;

-- Keep platform IDs unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_accounts_platform_id_unique
  ON member_accounts (platform_id)
  WHERE platform_id IS NOT NULL;

-- Backfill platform IDs for existing rows that do not have one yet.
UPDATE member_accounts
SET platform_id = 'sig_' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12)
WHERE platform_id IS NULL;

-- Verify a recovery code hash for username-based recovery checks.
CREATE OR REPLACE FUNCTION verify_member_recovery_code(
  p_username TEXT,
  p_recovery_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM member_accounts
    WHERE username = lower(p_username)
      AND recovery_code_hash IS NOT NULL
      AND recovery_code_hash = p_recovery_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_member_recovery_code(TEXT, TEXT) TO anon;

-- Set recovery code hash exactly once for first-time setup.
CREATE OR REPLACE FUNCTION set_member_recovery_code(
  p_username TEXT,
  p_recovery_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE member_accounts
  SET recovery_code_hash = p_recovery_hash,
      recovery_code_set_at = now()
  WHERE username = lower(p_username)
    AND recovery_code_hash IS NULL;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION set_member_recovery_code(TEXT, TEXT) TO anon;

COMMIT;
