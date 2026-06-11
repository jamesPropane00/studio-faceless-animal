-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL POSTS FOUNDATION
--  supabase/migrations/020_signal_posts_foundation.sql
--
--  Purpose:
--    1) Add a richer, anonymous-first post model for Signal feed
--    2) Keep moderation-first visibility defaults
--    3) Support dashboard composer + public stream preview
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS signal_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  author_username TEXT NOT NULL,
  author_platform_id TEXT,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  post_type TEXT NOT NULL DEFAULT 'text',
  category TEXT,
  body_text TEXT NOT NULL,

  media_url TEXT,
  audio_url TEXT,

  visibility TEXT NOT NULL DEFAULT 'public',
  moderation_state TEXT NOT NULL DEFAULT 'pending',

  is_pinned BOOLEAN NOT NULL DEFAULT false,
  comments_enabled BOOLEAN NOT NULL DEFAULT true,
  reactions_enabled BOOLEAN NOT NULL DEFAULT true,

  page_slug TEXT,
  source_context TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signal_posts_post_type_check'
  ) THEN
    ALTER TABLE signal_posts
      ADD CONSTRAINT signal_posts_post_type_check
      CHECK (post_type IN ('text','image','audio','link','announcement','status','event','quote','repost'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signal_posts_visibility_check'
  ) THEN
    ALTER TABLE signal_posts
      ADD CONSTRAINT signal_posts_visibility_check
      CHECK (visibility IN ('public','members','private'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signal_posts_moderation_state_check'
  ) THEN
    ALTER TABLE signal_posts
      ADD CONSTRAINT signal_posts_moderation_state_check
      CHECK (moderation_state IN ('pending','approved','hidden','removed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_signal_posts_author_created
  ON signal_posts (author_username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_posts_visibility_state_created
  ON signal_posts (visibility, moderation_state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_posts_pinned_created
  ON signal_posts (is_pinned DESC, created_at DESC);

CREATE OR REPLACE FUNCTION set_signal_posts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signal_posts_updated_at ON signal_posts;
CREATE TRIGGER trg_signal_posts_updated_at
BEFORE UPDATE ON signal_posts
FOR EACH ROW
EXECUTE FUNCTION set_signal_posts_updated_at();

ALTER TABLE signal_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_posts: public read approved"
  ON signal_posts FOR SELECT TO anon
  USING (visibility = 'public' AND moderation_state = 'approved');

CREATE POLICY "signal_posts: public insert pending"
  ON signal_posts FOR INSERT TO anon
  WITH CHECK (
    moderation_state = 'pending'
    AND body_text IS NOT NULL
    AND char_length(trim(body_text)) > 0
  );

CREATE POLICY "signal_posts: admin full access"
  ON signal_posts FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
