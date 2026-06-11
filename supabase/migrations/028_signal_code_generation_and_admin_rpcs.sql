-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL CODE GENERATION + ADMIN RPCS
--  supabase/migrations/028_signal_code_generation_and_admin_rpcs.sql
--
--  Purpose:
--    1) Enforce Signal Code format and uniqueness as identity backbone.
--    2) Provide generation + backfill helpers for legacy users.
--    3) Provide super_admin RPCs to regenerate/backfill via dashboard.
--
--  Signal Code format:
--    SIG-XXXX-XXXX
--    Alphabet excludes confusing chars: O, I, 0, 1
-- ============================================================

BEGIN;

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

-- Case-insensitive uniqueness guarantee for Signal Code identity.
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_accounts_platform_id_upper_unique
  ON member_accounts (upper(platform_id))
  WHERE platform_id IS NOT NULL;

ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_platform_id_format;


-- Null out any invalid platform_id values before adding the constraint
UPDATE member_accounts
SET platform_id = NULL
WHERE platform_id IS NOT NULL
  AND NOT fas_signal_code_is_valid(platform_id);

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_platform_id_format
  CHECK (platform_id IS NULL OR fas_signal_code_is_valid(platform_id));

CREATE OR REPLACE FUNCTION set_member_platform_id_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.platform_id IS NULL OR trim(NEW.platform_id) = '' THEN
    NEW.platform_id := fas_generate_signal_code();
    RETURN NEW;
  END IF;

  NEW.platform_id := upper(trim(NEW.platform_id));

  IF NOT fas_signal_code_is_valid(NEW.platform_id) THEN
    NEW.platform_id := fas_generate_signal_code();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_accounts_platform_id_defaults ON member_accounts;

CREATE TRIGGER trg_member_accounts_platform_id_defaults
BEFORE INSERT OR UPDATE OF platform_id ON member_accounts
FOR EACH ROW
EXECUTE FUNCTION set_member_platform_id_defaults();

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
      -- Guard against case-insensitive duplicates from old data.
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

-- One-time migration pass for existing rows.
DO $$
BEGIN
  PERFORM fas_backfill_missing_signal_codes();
END;
$$;

CREATE OR REPLACE FUNCTION admin_regenerate_signal_code(
  p_actor_username TEXT,
  p_actor_ph TEXT,
  p_target_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_role TEXT;
  v_target_role TEXT;
  v_target TEXT;
  v_new_code TEXT;
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
    RETURN jsonb_build_object('ok', false, 'error', 'Only super_admin can regenerate Signal Codes.');
  END IF;

  v_target := lower(trim(p_target_username));

  SELECT role INTO v_target_role
  FROM member_accounts
  WHERE username = v_target
  LIMIT 1;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target user not found.');
  END IF;

  IF v_target_role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot regenerate Signal Code for super_admin account.');
  END IF;

  v_new_code := fas_generate_signal_code();

  UPDATE member_accounts
  SET platform_id = v_new_code
  WHERE username = v_target;

  RETURN jsonb_build_object('ok', true, 'new_code', v_new_code);
END;
$$;

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

GRANT EXECUTE ON FUNCTION fas_signal_code_is_valid(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fas_generate_signal_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_regenerate_signal_code(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_fix_missing_signal_codes(TEXT, TEXT) TO anon, authenticated;

COMMIT;
