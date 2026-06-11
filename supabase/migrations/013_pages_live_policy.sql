-- ============================================================
--  FACELESS ANIMAL STUDIOS — PAGES RLS POLICY UPDATE
--  supabase/migrations/013_pages_live_policy.sql
--
--  PROBLEM:
--    Migration 002_free_signup_policies.sql constrained anon INSERT
--    on `pages` to page_status = 'draft' only. But the free signup
--    flow (start.html) inserts pages immediately as 'live' so users
--    can see their public profile page right after signing up.
--    This policy mismatch blocks new free signups from going live.
--
--  FIX:
--    Drop the old restrictive draft-only INSERT policy and create a
--    new one that allows anon to INSERT pages with status 'live' or
--    'draft'.
--
--  NOTE ON UPDATE POLICY:
--    No anon UPDATE policy is added here. The dashboard profile save
--    flow writes to `member_accounts` and `profiles` only — not to
--    `pages` directly — so no anon UPDATE on pages is required.
--    Authenticated (admin) role retains full access per existing policy.
--
--  SAFETY:
--    - pages.page_slug must be UNIQUE (existing constraint).
--    - profiles.username must exist (FK via profile_id).
--    - Admin can deactivate by setting profiles.is_active = false.
--    - Public SELECT on pages already requires page_status = 'live'.
--
--  HOW TO RUN:
--    Run in the Supabase SQL Editor (dashboard → SQL Editor → New query).
-- ============================================================


-- ── Drop the old draft-only INSERT policy ────────────────────
DROP POLICY IF EXISTS "pages: anon insert draft" ON pages;

-- Ensure no stale permissive UPDATE policy exists from prior attempts
DROP POLICY IF EXISTS "pages: anon self-update" ON pages;


-- ── New INSERT policy: allow 'live' or 'draft' status ────────
-- Anon can create pages with page_status = 'live' or 'draft'.
-- A 'live' free page is safe because:
--   - profiles INSERT policy already ensures plan_type = 'free'
--   - page_slug UNIQUE constraint prevents duplicate slugs
--   - Admin can deactivate by setting profiles.is_active = false
--     (public SELECT on pages requires page_status = 'live')

CREATE POLICY "pages: anon insert free or draft"
  ON pages
  FOR INSERT
  TO anon
  WITH CHECK (page_status IN ('draft', 'live'));
