-- ============================================================
--  FACELESS ANIMAL STUDIOS — ADMIN FEATURE CONTROLS + RECOVERY ACK
--  supabase/migrations/022_admin_feature_controls_and_recovery_ack.sql
--
--  PURPOSE:
--    1) Add persistent moderation/feature toggle fields to member_accounts
--    2) Add one-time recovery acknowledgment state after code reset
--    3) Extend reset_member_recovery_code RPC to require acknowledgment
--    4) Add confirm_member_recovery_ack RPC to clear pending acknowledgment
--
--  NOTES:
--    - DMs and calls are free product features; these fields are moderation controls.
--    - Premium gating should primarily affect file sharing / storage-heavy features.
-- ============================================================

-- ── Recovery acknowledgment fields ───────────────────────────
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS recovery_ack_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_last_rotated_at TIMESTAMPTZ;

COMMENT ON COLUMN member_accounts.recovery_ack_required IS
  'True after a new recovery code is generated and must be acknowledged by member.';

COMMENT ON COLUMN member_accounts.recovery_last_rotated_at IS
  'Timestamp of the latest recovery code reset.';

-- ── Moderation and feature controls ──────────────────────────
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS moderation_state TEXT DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dms_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS calls_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS file_sharing_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS uploads_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS page_publishing_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS public_listing_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS posting_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS premium_features_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_moderation_state;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_moderation_state
  CHECK (moderation_state IN ('clear','warned','limited','suspended','banned'));

COMMENT ON COLUMN member_accounts.dms_enabled IS 'Moderation safety control only. Not a premium gate.';
COMMENT ON COLUMN member_accounts.calls_enabled IS 'Moderation safety control only. Not a premium gate.';
COMMENT ON COLUMN member_accounts.file_sharing_enabled IS 'Feature gate for file sharing and storage-heavy workflows.';
COMMENT ON COLUMN member_accounts.uploads_enabled IS 'Controls whether user can upload media assets.';
COMMENT ON COLUMN member_accounts.page_publishing_enabled IS 'Controls page publish/update actions.';
COMMENT ON COLUMN member_accounts.public_listing_enabled IS 'Controls inclusion in public directory/listing surfaces.';
COMMENT ON COLUMN member_accounts.posting_enabled IS 'Controls board/signal posting capability.';
COMMENT ON COLUMN member_accounts.premium_features_enabled IS 'Controls premium creator feature availability.';

-- Backfill moderation_state from existing status columns when possible.
UPDATE member_accounts
SET moderation_state = CASE
  WHEN lower(coalesce(account_status, member_status, '')) IN ('banned') THEN 'banned'
  WHEN lower(coalesce(account_status, member_status, '')) IN ('suspended') THEN 'suspended'
  WHEN lower(coalesce(account_status, member_status, '')) IN ('limited') THEN 'limited'
  WHEN lower(coalesce(account_status, member_status, '')) IN ('warned') THEN 'warned'
  ELSE 'clear'
END
WHERE moderation_state IS NULL OR moderation_state = 'clear';

-- Free comms defaults remain ON unless account is already suspended/banned.
UPDATE member_accounts
SET dms_enabled = CASE WHEN moderation_state IN ('suspended','banned') THEN false ELSE coalesce(dms_enabled, true) END,
    calls_enabled = CASE WHEN moderation_state IN ('suspended','banned') THEN false ELSE coalesce(calls_enabled, true) END;

-- ── Recovery reset RPC with acknowledgment requirement ────────
CREATE OR REPLACE FUNCTION reset_member_recovery_code(
  p_username           TEXT,
  p_ph                 TEXT,
  p_new_recovery_hash  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE member_accounts
  SET recovery_code_hash      = p_new_recovery_hash,
      recovery_code_set_at    = now(),
      recovery_last_rotated_at= now(),
      recovery_required       = false,
      recovery_ack_required   = true
  WHERE username      = lower(p_username)
    AND password_hash = p_ph;

  RETURN FOUND;
END;
$$;

-- ── Recovery acknowledgment RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION confirm_member_recovery_ack(
  p_username TEXT,
  p_ph       TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE member_accounts
  SET recovery_ack_required = false
  WHERE username      = lower(p_username)
    AND password_hash = p_ph
    AND recovery_code_hash IS NOT NULL;

  RETURN FOUND;
END;
$$;
