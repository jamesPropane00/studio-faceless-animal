-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL CODE RECOVERY RPCS
--  supabase/migrations/031_signal_code_recovery_rpcs.sql
--
--  Purpose:
--    1) Guarantee a per-user RPC that can assign/repair Signal Code
--       even when direct client row updates are blocked by policy.
--    2) Reassert full backfill/admin RPC availability for live recovery.
--
--  Safe to run multiple times.
-- ============================================================

BEGIN;

-- Ensure validator/generator exist (idempotent).
CREATE OR REPLACE FUNCTION fas_signal_code_is_valid(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_code IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN upper(trim(p_code)) ~ '^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$';
END;
$$;

CREATE OR REPLACE FUNCTION fas_generate_signal_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_chars CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  TEXT;
  v_part1 TEXT;
  v_part2 TEXT;
  i       INTEGER;
  taken   BOOLEAN;
BEGIN
  LOOP
    v_part1 := '';
    v_part2 := '';

    FOR i IN 1..4 LOOP
      v_part1 := v_part1 || substr(v_chars, 1 + floor(random() * length(v_chars))::INTEGER, 1);
      v_part2 := v_part2 || substr(v_chars, 1 + floor(random() * length(v_chars))::INTEGER, 1);
    END LOOP;

    v_code := 'SIG-' || v_part1 || '-' || v_part2;

    SELECT EXISTS(
      SELECT 1
      FROM member_accounts m
      WHERE m.platform_id IS NOT NULL
        AND upper(m.platform_id) = v_code
    ) INTO taken;

    IF NOT taken THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;

-- Canonical full-table repair pass.
CREATE OR REPLACE FUNCTION fas_backfill_missing_signal_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  updated_count INTEGER := 0;
  need_fix BOOLEAN;
BEGIN
  FOR rec IN
    SELECT m.id, m.platform_id
    FROM member_accounts m
    ORDER BY m.created_at ASC NULLS LAST, m.id ASC
  LOOP
    need_fix := FALSE;

    IF rec.platform_id IS NULL OR NOT fas_signal_code_is_valid(rec.platform_id) THEN
      need_fix := TRUE;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM member_accounts m2
        WHERE m2.id <> rec.id
          AND m2.platform_id IS NOT NULL
          AND upper(m2.platform_id) = upper(rec.platform_id)
      ) THEN
        need_fix := TRUE;
      END IF;
    END IF;

    IF need_fix THEN
      UPDATE member_accounts
      SET platform_id = fas_generate_signal_code()
      WHERE id = rec.id;
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$;

-- Per-user self-heal RPC for live dashboard path.
-- Auth model matches existing custom auth pattern (username + password_hash).
CREATE OR REPLACE FUNCTION ensure_member_signal_code(
  p_username TEXT,
  p_ph TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_username TEXT := lower(trim(p_username));
  v_exists BOOLEAN := FALSE;
  v_current TEXT;
  v_next TEXT;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM member_accounts
    WHERE username = v_username
      AND password_hash = p_ph
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication failed.');
  END IF;

  SELECT platform_id INTO v_current
  FROM member_accounts
  WHERE username = v_username
  LIMIT 1;

  IF v_current IS NOT NULL AND fas_signal_code_is_valid(v_current) THEN
    RETURN jsonb_build_object('ok', true, 'code', upper(trim(v_current)), 'updated', false);
  END IF;

  v_next := fas_generate_signal_code();

  UPDATE member_accounts
  SET platform_id = v_next
  WHERE username = v_username;

  RETURN jsonb_build_object('ok', true, 'code', v_next, 'updated', true);
END;
$$;

-- Reassert admin global backfill RPC (super_admin only).
CREATE OR REPLACE FUNCTION admin_fix_missing_signal_codes(
  p_actor_username TEXT,
  p_actor_ph TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_role TEXT;
  v_updated INTEGER;
BEGIN
  SELECT role INTO v_actor_role
  FROM member_accounts
  WHERE username = lower(trim(p_actor_username))
    AND password_hash = p_actor_ph
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication failed.');
  END IF;

  IF v_actor_role <> 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only super_admin can run full Signal Code backfill.');
  END IF;

  SELECT fas_backfill_missing_signal_codes() INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'updated_count', v_updated);
END;
$$;

DO $$
BEGIN
  PERFORM fas_backfill_missing_signal_codes();
END;
$$;

GRANT EXECUTE ON FUNCTION fas_signal_code_is_valid(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fas_generate_signal_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fas_backfill_missing_signal_codes() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION ensure_member_signal_code(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_fix_missing_signal_codes(TEXT, TEXT) TO anon, authenticated;

COMMIT;
