-- ============================================================
--  FACELESS ANIMAL STUDIOS — ADMIN MODERATION RPCS + USER BACKFILL
--  supabase/migrations/023_admin_moderation_rpcs_and_backfill.sql
--
--  PURPOSE:
--    1) Create admin_update_user_feature RPC — lets admin toggle
--       moderation controls (dms_enabled, calls_enabled, posting_enabled,
--       uploads_enabled, moderation_state) from the dashboard without
--       needing service-role Express endpoints.
--    2) Safety re-backfill: platform_id for any remaining NULL rows
--       (idempotent — also handled in 021, safe to re-run).
--    3) Safety re-backfill: recovery_required for accounts missing hash.
--    4) Ensure moderation field defaults are populated on all rows.
--
--  SECURITY MODEL:
--    admin_update_user_feature uses SECURITY DEFINER to bypass RLS.
--    All authorization is enforced INSIDE the function by verifying:
--      a) actor username + password_hash against member_accounts
--      b) actor role is 'super_admin' or 'admin'
--      c) target is not a super_admin (cannot demote/restrict super_admin)
--    The anon key can call this RPC but will always fail auth unless
--    the caller has valid admin credentials.
--
--  SAFE TO RUN: all ALTER TABLEs use IF NOT EXISTS
-- ============================================================


-- ── 1. Ensure moderation columns exist (idempotent) ──────────
-- These were added in 022 but safe to re-run with IF NOT EXISTS.
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS moderation_state TEXT DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS dms_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS calls_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS posting_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS uploads_enabled BOOLEAN DEFAULT true;

-- Ensure constraint exists (drop first to avoid duplicate)
ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_moderation_state;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_moderation_state
  CHECK (moderation_state IN ('clear','warned','limited','suspended','banned'));

-- ── 2. Safety re-backfill: platform_id ───────────────────────
-- Generates sig_ IDs for any rows still missing one.
-- Format: sig_ + 12 lowercase hex chars (from truncated UUID)
UPDATE member_accounts
SET platform_id = 'sig_' || lower(left(replace(gen_random_uuid()::text, '-', ''), 12))
WHERE platform_id IS NULL;

-- ── 3. Safety re-backfill: recovery_required ─────────────────
UPDATE member_accounts
SET recovery_required = true
WHERE recovery_code_hash IS NULL
  AND (recovery_required = false OR recovery_required IS NULL);

-- Safe reset: accounts WITH a recovery hash should not be flagged.
UPDATE member_accounts
SET recovery_required = false
WHERE recovery_code_hash IS NOT NULL
  AND recovery_required = true;

-- ── 4. Ensure moderation defaults on all rows ─────────────────
-- Any row added without explicit values gets correct defaults.
UPDATE member_accounts
SET moderation_state = 'clear'
WHERE moderation_state IS NULL;

UPDATE member_accounts
SET dms_enabled = true
WHERE dms_enabled IS NULL;

UPDATE member_accounts
SET calls_enabled = true
WHERE calls_enabled IS NULL;

UPDATE member_accounts
SET posting_enabled = true
WHERE posting_enabled IS NULL;

UPDATE member_accounts
SET uploads_enabled = true
WHERE uploads_enabled IS NULL;

-- Flip comms to false for banned/suspended users who have them still enabled.
UPDATE member_accounts
SET dms_enabled = false, calls_enabled = false
WHERE moderation_state IN ('suspended', 'banned')
  AND (dms_enabled = true OR calls_enabled = true);


-- ── 5. admin_update_user_feature RPC ─────────────────────────
--
-- Used by the dashboard admin Users tab to toggle per-user
-- moderation controls directly from the browser without needing
-- the Express server (service-role bypass handled internally).
--
-- Supported fields:
--   dms_enabled        — BOOLEAN toggle
--   calls_enabled      — BOOLEAN toggle
--   posting_enabled    — BOOLEAN toggle
--   uploads_enabled    — BOOLEAN toggle
--   moderation_state   — TEXT: 'clear'|'warned'|'limited'|'suspended'|'banned'
--
-- Example call from JS:
--   supabase.rpc('admin_update_user_feature', {
--     p_actor_username: 'adminhandle',
--     p_actor_ph:       'base64hash',
--     p_target_username:'targethandle',
--     p_field:          'dms_enabled',
--     p_value:          'false'
--   })
--
-- Returns: { ok: true } | { ok: false, error: '...' }

CREATE OR REPLACE FUNCTION admin_update_user_feature(
  p_actor_username    TEXT,
  p_actor_ph          TEXT,
  p_target_username   TEXT,
  p_field             TEXT,
  p_value             TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_role   TEXT;
  v_target_role  TEXT;
  v_bool_val     BOOLEAN;
BEGIN
  -- ── Verify actor is an admin ──
  SELECT role INTO v_actor_role
  FROM member_accounts
  WHERE username      = lower(trim(p_actor_username))
    AND password_hash = p_actor_ph
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication failed.');
  END IF;

  IF v_actor_role NOT IN ('super_admin', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized — admin role required.');
  END IF;

  -- ── Verify target exists and is not super_admin ──
  SELECT role INTO v_target_role
  FROM member_accounts
  WHERE username = lower(trim(p_target_username))
  LIMIT 1;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target user not found.');
  END IF;

  IF v_target_role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot modify a super_admin account.');
  END IF;

  -- ── Apply update by field ──
  IF p_field IN ('dms_enabled', 'calls_enabled', 'posting_enabled', 'uploads_enabled') THEN
    v_bool_val := (lower(trim(p_value)) = 'true');

    IF p_field = 'dms_enabled' THEN
      UPDATE member_accounts SET dms_enabled = v_bool_val WHERE username = lower(trim(p_target_username));
    ELSIF p_field = 'calls_enabled' THEN
      UPDATE member_accounts SET calls_enabled = v_bool_val WHERE username = lower(trim(p_target_username));
    ELSIF p_field = 'posting_enabled' THEN
      UPDATE member_accounts SET posting_enabled = v_bool_val WHERE username = lower(trim(p_target_username));
    ELSIF p_field = 'uploads_enabled' THEN
      UPDATE member_accounts SET uploads_enabled = v_bool_val WHERE username = lower(trim(p_target_username));
    END IF;

  ELSIF p_field = 'moderation_state' THEN
    IF p_value NOT IN ('clear','warned','limited','suspended','banned') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Invalid moderation_state value.');
    END IF;

    UPDATE member_accounts
    SET moderation_state = p_value
    WHERE username = lower(trim(p_target_username));

    -- Auto-adjust comms when suspending or banning.
    IF p_value IN ('suspended', 'banned') THEN
      UPDATE member_accounts
      SET dms_enabled = false, calls_enabled = false
      WHERE username = lower(trim(p_target_username));
    END IF;

    -- Auto-restore comms defaults when clearing.
    IF p_value = 'clear' THEN
      UPDATE member_accounts
      SET dms_enabled = true, calls_enabled = true
      WHERE username = lower(trim(p_target_username));
    END IF;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown field: ' || p_field);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grant execute to anon and authenticated (auth check is inside the function)
GRANT EXECUTE ON FUNCTION admin_update_user_feature(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

COMMENT ON FUNCTION admin_update_user_feature IS
  'Admin-only RPC for moderation toggles on member_accounts. '
  'Verifies actor role+hash before applying any write. '
  'SECURITY DEFINER bypasses RLS — all auth enforced internally.';
