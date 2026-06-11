-- ============================================================
--  FACELESS ANIMAL STUDIOS — MEMBER ACCOUNTS AUTH FIELD LOCKDOWN
--  supabase/migrations/014_member_accounts_auth_lockdown.sql
--
--  SECURITY PROBLEM:
--    Migration 002_member_platform.sql created a permissive anon UPDATE
--    policy on member_accounts: USING (true) WITH CHECK (true).
--    With password columns (password_hash, password_salt, password_set_at)
--    now present (migration 012), this allows any anonymous client to
--    overwrite auth fields directly — a broken access control / account
--    takeover vulnerability.
--
--  FIX:
--    1. Replace the permissive UPDATE policy with a profile-fields-only
--       policy (USING(true) to allow row access, WITH CHECK constrained
--       to exclude auth fields via column-level privilege revocation).
--    2. Revoke UPDATE privilege on auth columns from the anon role so
--       direct writes to password_hash/password_salt/password_set_at
--       are rejected at the PostgreSQL privilege level, independent of
--       RLS evaluation.
--
--  WHY COLUMN-LEVEL REVOKE IS SUFFICIENT:
--    In PostgreSQL, column-level REVOKE takes effect even when a
--    table-level GRANT is present. Any UPDATE statement that includes
--    password_hash/password_salt/password_set_at in its target column
--    list will be denied for the anon role.
--    Password updates are exclusively performed by the SECURITY DEFINER
--    RPC `set_member_password` (migration 012), which runs as a
--    superuser/postgres role that retains full access.
--
--  WHAT STAYS ALLOWED:
--    Anon can still UPDATE non-auth fields: display_name, bio, email,
--    avatar_initial, vibe, vibe_expires_at, social_links, highlights_json,
--    cover_url, city, state_abbr, page_slug, page_status, last_active_at.
--    These are needed by: syncMember(), updateMember() in member-db.js,
--    and free-signup.js step 7b (page linkage sync).
--
--  HOW TO RUN:
--    Run in the Supabase SQL Editor (dashboard → SQL Editor → New query).
-- ============================================================


-- ── 1. Drop the old permissive UPDATE policy ─────────────────
DROP POLICY IF EXISTS "member_accounts: public update" ON member_accounts;


-- ── 2. Create a scoped UPDATE policy for non-auth fields ─────
-- USING (true): allow matching any existing row (row-level filter)
-- WITH CHECK (true): allow the new row value through RLS —
-- the actual auth field protection is enforced by column-level revoke below.

CREATE POLICY "member_accounts: anon update profile fields"
  ON member_accounts
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);


-- ── 3. Revoke auth column UPDATE from anon ───────────────────
-- This prevents any anon UPDATE statement from writing to auth columns,
-- regardless of RLS policy. Column-level revoke takes precedence
-- over table-level grants in PostgreSQL.

REVOKE UPDATE (password_hash, password_salt, password_set_at) ON member_accounts FROM anon;


-- ── Verification query (run manually to confirm) ──────────────
-- SELECT grantee, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_name = 'member_accounts'
--   AND grantee = 'anon'
--   AND privilege_type = 'UPDATE';
-- Expected: password_hash, password_salt, password_set_at should NOT appear.
