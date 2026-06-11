-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL POSTS PAGE TYPE
--  supabase/migrations/025_signal_posts_add_page_type.sql
--
--  Purpose:
--    Extend signal_type to include 'page' for page/profile update signals.
-- ============================================================

BEGIN;

ALTER TABLE signal_posts
  DROP CONSTRAINT IF EXISTS signal_posts_signal_type_check;

ALTER TABLE signal_posts
  ADD CONSTRAINT signal_posts_signal_type_check
  CHECK (signal_type IN ('drop','live','audio','thought','file','ping','build','page'));

DROP POLICY IF EXISTS "signal_posts: live insert" ON signal_posts;

CREATE POLICY "signal_posts: live insert"
  ON signal_posts FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(username)) > 0
    AND char_length(trim(content)) > 0
    AND signal_type IN ('drop','live','audio','thought','file','ping','build','page')
    AND COALESCE(visibility, 'public') = 'public'
    AND COALESCE(moderation_state, 'approved') = 'approved'
  );

COMMIT;
