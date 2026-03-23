-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL POSTS DISPLAY NAME
--  supabase/migrations/026_signal_posts_display_name.sql
-- ============================================================

BEGIN;

ALTER TABLE signal_posts
  ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE signal_posts sp
SET display_name = COALESCE(
  NULLIF(sp.display_name, ''),
  (
    SELECT p.display_name
    FROM profiles p
    WHERE lower(p.username) = lower(sp.username)
    LIMIT 1
  ),
  sp.username
)
WHERE sp.display_name IS NULL OR trim(sp.display_name) = '';

COMMIT;
