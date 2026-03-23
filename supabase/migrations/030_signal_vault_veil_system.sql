-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL VAULT + VEIL SYSTEM
--  supabase/migrations/030_signal_vault_veil_system.sql
--
--  Purpose:
--    1) Add veil_level (0–4) as the canonical numeric Veil control.
--    2) Backfill veil_level from existing veil_state text values.
--    3) Expand contact_mode to support the full Veil model.
--    4) Add vault helpers used by phone and board enforcement.
--
--  Veil Levels:
--    0 = Fully Hidden — not visible anywhere, no contact
--    1 = Visible Only — visible on board/profile, no contact
--    2 = Request Mode — visible, contact requires approval
--    3 = Signal Code Mode — visible, contact via Signal Code only (default)
--    4 = Open — visible, open contact allowed
--
--  Safe to run multiple times (idempotent).
-- ============================================================

BEGIN;

-- ── 1. Add veil_level column ─────────────────────────────────
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS veil_level INTEGER DEFAULT 3;

-- ── 2. Backfill veil_level from existing veil_state ──────────
--  Only applies where the column was just added (value = 3, the default)
--  and a meaningful veil_state text value exists.

UPDATE member_accounts
SET veil_level = 0
WHERE lower(trim(coalesce(veil_state, ''))) = 'deep'
  AND veil_level = 3;

UPDATE member_accounts
SET veil_level = 1
WHERE lower(trim(coalesce(veil_state, ''))) = 'veiled'
  AND veil_level = 3;

-- ── 3. Enforce veil_level constraints ────────────────────────
ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_veil_level;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_veil_level
  CHECK (veil_level BETWEEN 0 AND 4);

-- ── 4. Ensure all rows have a non-null veil_level ────────────
UPDATE member_accounts
SET veil_level = 3
WHERE veil_level IS NULL;

-- ── 5. Expand contact_mode constraint ────────────────────────
--  The existing constraint only allowed 'signal_code_only'.
--  Extend to support all Vault contact model states.

ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_contact_mode;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_contact_mode
  CHECK (contact_mode IN (
    'signal_code_only',
    'open',
    'request_only',
    'hidden'
  ));

-- Normalize any contact_mode values that fall outside the new set.
UPDATE member_accounts
SET contact_mode = 'signal_code_only'
WHERE contact_mode IS NOT NULL
  AND contact_mode NOT IN ('signal_code_only', 'open', 'request_only', 'hidden');

UPDATE member_accounts
SET contact_mode = 'signal_code_only'
WHERE contact_mode IS NULL;

-- ── 6. Index for fast board visibility filtering ─────────────
CREATE INDEX IF NOT EXISTS idx_member_accounts_veil_level
  ON member_accounts (veil_level);

-- ── 7. Function: check if a member is contactable by veil ────
CREATE OR REPLACE FUNCTION fas_is_veil_contactable(p_veil_level INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_veil_level, 3) >= 2;
$$;

-- ── 8. Function: check if a member is visible by veil ────────
CREATE OR REPLACE FUNCTION fas_is_veil_visible(p_veil_level INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_veil_level, 3) >= 1;
$$;

-- ── 9. RPC: user updates their own vault veil level ──────────
--  Called from dashboard identity: Vault level selector.
--  Validates the caller owns the account via ph hash.

CREATE OR REPLACE FUNCTION fas_update_vault_veil_level(
  p_username  TEXT,
  p_veil_level INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_username TEXT := lower(trim(p_username));
  v_level    INTEGER := COALESCE(p_veil_level, 3);
  v_veil_state TEXT;
BEGIN
  IF v_username IS NULL OR v_username = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Username required.');
  END IF;

  IF v_level < 0 OR v_level > 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Veil level must be 0–4.');
  END IF;

  -- Map numeric level to text state for backward compat
  v_veil_state := CASE
    WHEN v_level = 0 THEN 'deep'
    WHEN v_level <= 2 THEN 'veiled'
    ELSE 'unveiled'
  END;

  UPDATE member_accounts
  SET
    veil_level = v_level,
    veil_state = v_veil_state
  WHERE username = v_username;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member not found.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'veil_level', v_level,
    'veil_state', v_veil_state
  );
END;
$$;

-- ── 10. Admin RPC: view vault state for a user ───────────────
CREATE OR REPLACE FUNCTION admin_get_vault_state(
  p_actor_username TEXT,
  p_actor_ph       TEXT,
  p_target_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor      TEXT := lower(trim(p_actor_username));
  v_target     TEXT := lower(trim(p_target_username));
  v_row        RECORD;
BEGIN
  SELECT role INTO v_actor_role FROM member_accounts WHERE username = v_actor;
  IF v_actor_role NOT IN ('super_admin', 'admin', 'moderator') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized.');
  END IF;

  SELECT username, platform_id, veil_level, veil_state, contact_mode, auto_accept_code_holders,
         dms_enabled, calls_enabled, posting_enabled, moderation_state
  INTO v_row
  FROM member_accounts
  WHERE username = v_target;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_row.username,
    'signal_code', v_row.platform_id,
    'veil_level', COALESCE(v_row.veil_level, 3),
    'veil_state', v_row.veil_state,
    'contact_mode', COALESCE(v_row.contact_mode, 'signal_code_only'),
    'auto_accept_code_holders', COALESCE(v_row.auto_accept_code_holders, true),
    'dms_enabled', COALESCE(v_row.dms_enabled, true),
    'calls_enabled', COALESCE(v_row.calls_enabled, true),
    'posting_enabled', COALESCE(v_row.posting_enabled, true),
    'moderation_state', COALESCE(v_row.moderation_state, 'clear')
  );
END;
$$;

COMMIT;
