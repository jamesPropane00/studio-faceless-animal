-- ============================================================
--  FACELESS ANIMAL STUDIOS - FACLESS TV NETWORK
--  supabase/migrations/035_faceless_tv_network.sql
--
--  NEW TABLES:
--    1. tv_channels - branded owner channel + member sub channels
--    2. tv_uploads  - video uploads / broadcast items
--
--  MANUAL STORAGE STEP:
--    Create a Supabase Storage bucket named `tv-media`.
--    Public: true for easy playback in the TV layer.
-- ============================================================

CREATE TABLE IF NOT EXISTS tv_channels (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  account_id      UUID,
  username        TEXT        NOT NULL,
  display_name    TEXT        NOT NULL,
  channel_slug    TEXT        NOT NULL UNIQUE,
  channel_name    TEXT        NOT NULL,
  channel_kind    TEXT        NOT NULL DEFAULT 'member',
  visibility      TEXT        NOT NULL DEFAULT 'public',
  description     TEXT,
  parent_slug     TEXT        DEFAULT 'faceless-animal-studios',
  cover_url       TEXT,
  is_owner        BOOLEAN     NOT NULL DEFAULT false,
  is_featured     BOOLEAN     NOT NULL DEFAULT false,
  invite_code     TEXT,
  external_channel_id   TEXT,
  external_channel_url  TEXT,
  sort_order      INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tv_channels_username
  ON tv_channels (username);

CREATE INDEX IF NOT EXISTS idx_tv_channels_visibility_created
  ON tv_channels (visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tv_channels_parent_slug
  ON tv_channels (parent_slug);

ALTER TABLE tv_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tv_channels: public read" ON tv_channels;
CREATE POLICY "tv_channels: public read"
  ON tv_channels
  FOR SELECT
  TO anon
  USING (visibility = 'public');


CREATE TABLE IF NOT EXISTS tv_uploads (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  account_id      UUID,
  username        TEXT        NOT NULL,
  channel_id      UUID REFERENCES tv_channels(id) ON DELETE SET NULL,
  channel_slug    TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  visibility      TEXT        NOT NULL DEFAULT 'public',
  status          TEXT        NOT NULL DEFAULT 'published',
  duration_seconds INTEGER,
  file_name       TEXT,
  file_type       TEXT,
  file_size_bytes INTEGER,
  storage_path    TEXT,
  source_url      TEXT,
  thumb_url       TEXT,
  external_video_id   TEXT,
  external_video_url  TEXT,
  is_published    BOOLEAN     NOT NULL DEFAULT true,
  publish_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tv_uploads_username
  ON tv_uploads (username);

CREATE INDEX IF NOT EXISTS idx_tv_uploads_channel_created
  ON tv_uploads (channel_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tv_uploads_visibility_status
  ON tv_uploads (visibility, status, created_at DESC);

ALTER TABLE tv_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tv_uploads: public read" ON tv_uploads;
CREATE POLICY "tv_uploads: public read"
  ON tv_uploads
  FOR SELECT
  TO anon
  USING (visibility = 'public' AND status = 'published');


-- Keep the TV layer flexible for now:
-- API routes in functions/api/tv/* use the service role for writes.
-- That lets the front end stay branded while the backend evolves.

