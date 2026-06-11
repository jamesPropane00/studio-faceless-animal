-- ============================================================
--  FACELESS ANIMAL STUDIOS — BOARD POSTS RLS POLICIES
--  supabase/migrations/006_board_posts_policies.sql
--
--  PURPOSE:
--    Enables the creator board post flow on network.html:
--      - Anyone can READ posts that have been approved
--      - Platform creators (matched by username) can INSERT posts
--        that start as pending — the studio approves before publish
--
--  TABLES AFFECTED:
--    board_posts  — creator status updates, releases, announcements
--
--  FLOW:
--    1. Creator fills out post form on network.html
--    2. JS looks up their profile_id by username (profiles SELECT)
--    3. JS inserts board_post with is_approved=false, status='pending'
--    4. Studio reviews in Supabase dashboard and sets:
--         is_approved = true, visibility_status = 'visible'
--    5. Post appears in the live board feed
--
--  HOW TO RUN:
--    Paste into Supabase SQL Editor → Run.
--    Safe to run multiple times (DROP IF EXISTS before each CREATE).
-- ============================================================


-- ── Enable RLS on board_posts (in case it's not already on) ──
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;


-- ── anon SELECT: approved + visible posts only ────────────────
-- Public visitors and unauthenticated users can only read posts
-- that have been explicitly approved by the studio.

DROP POLICY IF EXISTS "board_posts: public read approved" ON board_posts;

CREATE POLICY "board_posts: public read approved"
  ON board_posts
  FOR SELECT
  TO anon
  USING (
    is_approved = true
    AND visibility_status = 'visible'
  );


-- ── anon INSERT: pending posts only ──────────────────────────
-- Platform creators can submit posts without logging in.
-- All submitted posts start as pending until the studio approves.
-- The WITH CHECK enforces these defaults cannot be overridden.

DROP POLICY IF EXISTS "board_posts: anon insert pending" ON board_posts;

CREATE POLICY "board_posts: anon insert pending"
  ON board_posts
  FOR INSERT
  TO anon
  WITH CHECK (
    is_approved = false
    AND visibility_status = 'pending'
    AND is_featured = false
  );
