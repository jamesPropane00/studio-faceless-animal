-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL BOARD LIVE SCHEMA
--  supabase/migrations/024_signal_board_live_schema.sql
--
--  Purpose:
--    Align signal_posts with the live Signal Board model used by network feed.
--    Required canonical fields: username, platform_id, content, media_url,
--    signal_type, created_at.
-- ============================================================

BEGIN;

ALTER TABLE signal_posts
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS platform_id TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS signal_type TEXT DEFAULT 'drop',
  ADD COLUMN IF NOT EXISTS boost_count INTEGER NOT NULL DEFAULT 0;

-- Keep legacy table compatible while shifting to canonical fields.
UPDATE signal_posts
SET
  username = COALESCE(NULLIF(username, ''), NULLIF(author_username, '')),
  platform_id = COALESCE(NULLIF(platform_id, ''), NULLIF(author_platform_id, '')),
  content = COALESCE(NULLIF(content, ''), NULLIF(body_text, '')),
  signal_type = COALESCE(
    NULLIF(signal_type, ''),
    CASE
      WHEN lower(COALESCE(post_type, '')) = 'audio' THEN 'audio'
      WHEN lower(COALESCE(post_type, '')) IN ('announcement', 'event') THEN 'ping'
      WHEN lower(COALESCE(post_type, '')) IN ('status', 'quote') THEN 'thought'
      WHEN lower(COALESCE(post_type, '')) = 'image' THEN 'drop'
      ELSE 'drop'
    END
  );

ALTER TABLE signal_posts
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN content SET NOT NULL,
  ALTER COLUMN signal_type SET DEFAULT 'drop',
  ALTER COLUMN visibility SET DEFAULT 'public',
  ALTER COLUMN moderation_state SET DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signal_posts_signal_type_check'
  ) THEN
    ALTER TABLE signal_posts
      ADD CONSTRAINT signal_posts_signal_type_check
      CHECK (signal_type IN ('drop','live','audio','thought','file','ping','build'));
  END IF;
END $$;

ALTER TABLE signal_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signal_posts: public read approved" ON signal_posts;
DROP POLICY IF EXISTS "signal_posts: public insert pending" ON signal_posts;
DROP POLICY IF EXISTS "signal_posts: admin full access" ON signal_posts;

CREATE POLICY "signal_posts: live read"
  ON signal_posts FOR SELECT
  TO anon, authenticated
  USING (
    COALESCE(visibility, 'public') = 'public'
    AND COALESCE(moderation_state, 'approved') <> 'removed'
  );

CREATE POLICY "signal_posts: live insert"
  ON signal_posts FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(username)) > 0
    AND char_length(trim(content)) > 0
    AND signal_type IN ('drop','live','audio','thought','file','ping','build')
    AND COALESCE(visibility, 'public') = 'public'
    AND COALESCE(moderation_state, 'approved') = 'approved'
  );

-- Keep admin write path intact for moderation tools.
CREATE POLICY "signal_posts: admin full access"
  ON signal_posts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION boost_signal(p_signal_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE signal_posts
  SET boost_count = COALESCE(boost_count, 0) + 1
  WHERE id = p_signal_id
  RETURNING boost_count INTO v_count;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION boost_signal(UUID) TO anon, authenticated;

COMMIT;
