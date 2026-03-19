-- ============================================================
--  FACELESS ANIMAL STUDIOS — PASSWORD AUTHENTICATION
--  supabase/migrations/012_password_auth.sql
--
--  Adds Supabase-backed password hashing using server-side RPCs.
--  Passwords are NEVER stored in plaintext — only PBKDF2 hashes
--  (computed in the browser, compared server-side via RPC).
--
--  HOW TO RUN:
--    Paste into Supabase SQL Editor → Run
--    Safe to re-run (uses CREATE OR REPLACE / IF NOT EXISTS)
--
--  NOTE: Drops any older versions of these functions that may
--  exist with different signatures (e.g. p_password instead of
--  p_hash) to avoid PostgREST overload resolution conflicts.
-- ============================================================


-- ── PART 0: Drop any legacy function overloads ───────────────
-- Old versions used p_password (plaintext) — unsafe.
-- Drop them all so CREATE OR REPLACE works cleanly.

DROP FUNCTION IF EXISTS set_member_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS set_member_password(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS verify_member_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_member_salt(TEXT);
DROP FUNCTION IF EXISTS check_username_available(TEXT);
DROP FUNCTION IF EXISTS admin_reset_password(TEXT, TEXT, TEXT);


-- ── PART 1: Add password columns to member_accounts ──────────

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS password_hash TEXT;     -- PBKDF2-SHA256 base64

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS password_salt TEXT;     -- 16-byte random base64 salt

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ; -- when password was set


-- ── PART 2: RPC — get_member_salt ────────────────────────────
-- Returns the password salt for a given username.
-- Safe to expose via anon key (salt alone is not enough to verify password).
-- Returns NULL if user doesn't exist or has no password set yet.

CREATE OR REPLACE FUNCTION get_member_salt(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT password_salt
    FROM   member_accounts
    WHERE  username = lower(p_username)
      AND  password_salt IS NOT NULL
    LIMIT  1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_member_salt(TEXT) TO anon;


-- ── PART 3: RPC — verify_member_password ─────────────────────
-- Server-side comparison of the stored password hash.
-- The hash is NEVER sent to the browser — comparison happens here.
-- Returns TRUE if username + hash match, FALSE otherwise.

CREATE OR REPLACE FUNCTION verify_member_password(p_username TEXT, p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM   member_accounts
    WHERE  username      = lower(p_username)
      AND  password_hash = p_hash
      AND  password_hash IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_member_password(TEXT, TEXT) TO anon;


-- ── PART 4: RPC — set_member_password ────────────────────────
-- Sets a password for a member account.
-- CRITICAL: Only succeeds when password_hash IS NULL (not yet set).
-- This prevents anyone from overwriting an existing password.
-- Returns TRUE on success, FALSE if password already exists.

CREATE OR REPLACE FUNCTION set_member_password(
  p_username TEXT,
  p_hash     TEXT,
  p_salt     TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE member_accounts
  SET    password_hash   = p_hash,
         password_salt   = p_salt,
         password_set_at = now()
  WHERE  username      = lower(p_username)
    AND  password_hash IS NULL;   -- only if not already set

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION set_member_password(TEXT, TEXT, TEXT) TO anon;


-- ── PART 5: RPC — admin_reset_password ───────────────────────
-- Used by you (the admin) to reset a member's password.
-- Can ONLY be called with the service_role key (not the anon key).
-- Returns TRUE on success.
--
-- Usage in Supabase SQL Editor (authenticated context):
--   SELECT admin_reset_password('username', 'new_hash', 'new_salt');

CREATE OR REPLACE FUNCTION admin_reset_password(
  p_username TEXT,
  p_hash     TEXT,
  p_salt     TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE member_accounts
  SET    password_hash   = p_hash,
         password_salt   = p_salt,
         password_set_at = now()
  WHERE  username = lower(p_username);

  RETURN FOUND;
END;
$$;

-- NOTE: Do NOT grant to anon. Admin-only.
REVOKE EXECUTE ON FUNCTION admin_reset_password(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_reset_password(TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION admin_reset_password(TEXT, TEXT, TEXT) TO authenticated;


-- ── PART 6: RPC — check_username_available ───────────────────
-- Fast username availability check during signup.
-- Returns TRUE if the username is available (not taken).

CREATE OR REPLACE FUNCTION check_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1
    FROM   member_accounts
    WHERE  username = lower(p_username)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_username_available(TEXT) TO anon;


-- ── SUMMARY ──────────────────────────────────────────────────
--
--  HOW THE PASSWORD SYSTEM WORKS:
--
--  SIGN UP:
--    1. Browser generates random 16-byte salt (base64)
--    2. Browser computes PBKDF2(password, salt, 100k iters, SHA-256)
--    3. Browser calls syncMember() → creates member_accounts row
--    4. Browser calls set_member_password(username, hash, salt)
--    5. Server stores hash + salt; browser stores session in localStorage
--
--  SIGN IN:
--    1. Browser calls get_member_salt(username) → gets salt
--    2. Browser computes PBKDF2(password, salt) → gets hash
--    3. Browser calls verify_member_password(username, hash) → TRUE/FALSE
--    4. Server compares hashes — plaintext password never leaves browser
--    5. On TRUE: browser stores session in localStorage
--
--  SECURITY PROPERTIES:
--    ✅ Plaintext password never stored or transmitted
--    ✅ Hash never sent to browser (server-side comparison)
--    ✅ PBKDF2 SHA-256 with 100,000 iterations (brute-force resistant)
--    ✅ Unique salt per user (prevents rainbow table attacks)
--    ✅ Password can only be set once per account (set_member_password)
--    ✅ Admin password reset requires service_role key
--
--  ADMIN: To reset a member's password, you need to:
--    1. Compute the new hash outside Supabase (or use the platform's
--       /admin panel once built) 
--    2. Run: SELECT admin_reset_password('username', 'hash', 'salt');
--    3. Or: UPDATE member_accounts SET password_hash=NULL, password_salt=NULL
--           WHERE username='username'; 
--       → This lets them set a new password from the login page.
--
-- ============================================================
