-- ============================================================
--  FACELESS ANIMAL STUDIOS — FREE SIGNUP RLS POLICIES
--  supabase/migrations/002_free_signup_policies.sql
--
--  Adds anon INSERT policies so the free.html signup form can
--  write directly to profiles and pages without authentication.
--
--  WHY THIS IS SAFE:
--    - profiles.plan_type is constrained to 'free' for anon inserts
--    - pages.page_status is constrained to 'draft' for anon inserts
--    - Both tables have UNIQUE constraints that prevent duplicates:
--        profiles: username UNIQUE, email UNIQUE
--        pages: page_slug UNIQUE
--    - Admin can deactivate (is_active = false) any fraudulent profile
--    - SELECT on profiles (anon) already requires is_active = true
--
--  HOW TO RUN:
--    Run AFTER 001_initial_schema.sql in the Supabase SQL Editor.
-- ============================================================


-- ── profiles: allow anon INSERT for free signup ───────────────
-- Anon users can only create profiles with plan_type = 'free'.
-- All other plan types require admin creation.

CREATE POLICY "profiles: anon insert free"
  ON profiles
  FOR INSERT
  TO anon
  WITH CHECK (plan_type = 'free');


-- ── pages: allow anon INSERT for draft pages ──────────────────
-- Anon users can only create pages with page_status = 'draft'.
-- Admin promotes pages to 'live' after review.

CREATE POLICY "pages: anon insert draft"
  ON pages
  FOR INSERT
  TO anon
  WITH CHECK (page_status = 'draft');
