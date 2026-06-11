-- ============================================================
--  FACELESS ANIMAL STUDIOS — DM MESSAGES RLS LOCKDOWN
--  supabase/migrations/015_dm_messages_rls_lockdown.sql
--
--  PROBLEM:
--    Migration 002 created permissive anon policies on dm_messages:
--      SELECT: USING (true)  — any anon could read ALL private DMs
--      UPDATE: USING (true) WITH CHECK (true) — any anon could update
--    This is broken access control: private messages readable/writable
--    by anyone with the public anon key.
--
--  FIX:
--    Move ALL dm_messages access to server-proxied endpoints
--    (/api/dm/threads, /api/dm/messages, /api/dm/send, /api/dm/mark-read)
--    implemented in server.js. The server validates caller identity via
--    password_hash against member_accounts, then uses SUPABASE_SERVICE_ROLE_KEY
--    to access dm_messages. The anon key NEVER touches dm_messages.
--
--    Steps:
--      1. Drop all permissive anon policies
--      2. Revoke all DML privileges on dm_messages from anon
--      3. Verify anon has no remaining table access
--
--  HOW TO RUN:
--    Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================


-- ── 1. Drop all existing anon policies on dm_messages ─────────
DROP POLICY IF EXISTS "dm_messages: public read"              ON dm_messages;
DROP POLICY IF EXISTS "dm_messages: public insert"            ON dm_messages;
DROP POLICY IF EXISTS "dm_messages: public update"            ON dm_messages;
DROP POLICY IF EXISTS "dm_messages: sender or recipient can read" ON dm_messages;
DROP POLICY IF EXISTS "dm_messages: recipient can mark read"  ON dm_messages;


-- ── 2. Revoke all DML from anon on dm_messages ────────────────
-- The service_role (used by server.js) bypasses RLS by default
-- and retains full access. Only the anon role is restricted.
REVOKE SELECT, INSERT, UPDATE, DELETE ON dm_messages FROM anon;


-- ── 3. Create a single service-role-only access policy ────────
-- anon has NO policies → any attempt by anon to access the table
-- will be denied by both Postgres REVOKE and RLS (belt + suspenders).
-- service_role bypasses RLS → server.js full access maintained.

-- NOTE: If you still need anon Realtime channel subscriptions for
-- other tables, ensure dm_messages is excluded from realtime
-- replication in Supabase Dashboard → Database → Replication.


-- ── 4. Verification queries (run manually to confirm) ─────────
-- Check no anon grants remain:
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name = 'dm_messages' AND grantee = 'anon';
--   → Should return 0 rows.
--
-- Check no anon RLS policies remain:
--   SELECT policyname, permissive, roles, cmd, qual
--   FROM pg_policies
--   WHERE tablename = 'dm_messages' AND 'anon' = ANY(roles);
--   → Should return 0 rows.
