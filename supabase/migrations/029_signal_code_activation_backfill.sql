-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL CODE ACTIVATION BACKFILL
--  supabase/migrations/029_signal_code_activation_backfill.sql
--
--  Purpose:
--    1) Enforce platform_id as canonical Signal Code: SIG-XXXX-XXXX
--    2) Backfill all existing users with missing/invalid placeholder codes
--    3) Keep uniqueness case-insensitive
--
--  Safe to run multiple times.
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_accounts_platform_id_upper_unique
  ON member_accounts (upper(platform_id))
  WHERE platform_id IS NOT NULL;

ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_platform_id_format;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_platform_id_format
  CHECK (platform_id IS NULL OR fas_signal_code_is_valid(platform_id));

-- Normalize and clear known placeholder/legacy values so they can be regenerated.
UPDATE member_accounts
SET platform_id = NULL
WHERE platform_id IS NOT NULL
  AND (
    trim(platform_id) = ''
    OR lower(trim(platform_id)) IN ('not assigned yet', 'pending', 'none', 'n/a', 'na')
    OR NOT fas_signal_code_is_valid(platform_id)
  );

UPDATE member_accounts
SET platform_id = fas_generate_signal_code()
WHERE platform_id IS NULL;

COMMIT;
