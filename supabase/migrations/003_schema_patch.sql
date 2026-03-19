-- ============================================================
--  FACELESS ANIMAL STUDIOS — SCHEMA PATCH
--  supabase/migrations/003_schema_patch.sql
--
--  PURPOSE:
--    Aligns the live Supabase database with the intended schema
--    in 001_initial_schema.sql. Run this AFTER 001 and 002.
--
--  WHAT THIS FIXES:
--
--  1. submissions.status check constraint
--     The live DB only accepts 'submitted' and 'rejected'.
--     This patch drops that constraint and recreates it with
--     the full set of valid values used by the platform:
--       'submitted' | 'pending' | 'in_progress' | 'live' | 'rejected'
--
--  2. submissions.page_id NOT NULL
--     The live DB has page_id as NOT NULL. The intended schema
--     has it nullable (SET NULL on cascade). This patch makes
--     it nullable so orphan submissions can exist without a page.
--
--  3. profiles anon SELECT policy
--     Adds the missing anon SELECT policy so public visitors
--     can read active creator profiles (needed for network page).
--
--  4. pages anon SELECT policy
--     Adds the missing anon SELECT policy so live pages are
--     readable by unauthenticated visitors.
--
--  HOW TO RUN:
--    Paste into Supabase SQL Editor → Run.
--    Safe to run multiple times (uses IF EXISTS / IF NOT EXISTS).
-- ============================================================


-- ── 1. Fix submissions.status check constraint ────────────────

-- Drop old constraint (name may vary — try both common names)
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS status_check;

-- Recreate with full value set
ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('submitted', 'pending', 'in_progress', 'live', 'rejected'));


-- ── 2. Make submissions.page_id nullable ──────────────────────

ALTER TABLE submissions
  ALTER COLUMN page_id DROP NOT NULL;


-- ── 3. Add anon SELECT policy on profiles ────────────────────

DROP POLICY IF EXISTS "profiles: public read active" ON profiles;

CREATE POLICY "profiles: public read active"
  ON profiles
  FOR SELECT
  TO anon
  USING (is_active = true);


-- ── 4. Add anon SELECT policy on pages ───────────────────────

DROP POLICY IF EXISTS "pages: public read live" ON pages;

CREATE POLICY "pages: public read live"
  ON pages
  FOR SELECT
  TO anon
  USING (page_status = 'live');
