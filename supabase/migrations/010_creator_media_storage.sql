-- ============================================================
--  FACELESS ANIMAL STUDIOS — CREATOR MEDIA STORAGE
--  supabase/migrations/010_creator_media_storage.sql
--
--  PURPOSE:
--    Adds storage infrastructure for creator-uploaded media:
--    profile pictures, page cover images, and board post images.
--
--  WHAT THIS SETS UP:
--
--  1. BUCKET (manual step — see instructions below):
--       creator-media  (public read, authenticated write)
--
--  2. RLS POLICIES on storage.objects for creator-media:
--       - Public read (anon SELECT) — images served in templates
--       - Authenticated write (INSERT/UPDATE/DELETE) — admin only
--
--  3. COLUMN: profiles.cover_image_url
--       Stores the profile-level cover image (banner behind the hero).
--       Separate from avatar_url to allow both without overwriting.
--
--  PATH STRUCTURE (set by assets/js/services/storage.js):
--    creator-media/{username}/avatar/{ts}_{filename}  → profile picture
--    creator-media/{username}/cover/{ts}_{filename}   → page cover image
--    creator-media/{username}/board/{ts}_{filename}   → board post image
--
--  EXISTING BUCKET (NOT replaced):
--    profile-images  — intake form uploads (anon INSERT, anon SELECT)
--    Handled by: migration 005, services/submissions.js
--    This migration only adds the new creator-media bucket.
--
--  HOW TO RUN:
--    1. Paste into Supabase SQL Editor → Run.
--       (Safe to run multiple times — uses IF NOT EXISTS / DROP IF EXISTS)
--
--    2. MANUAL BUCKET CREATION (required once):
--       Supabase Dashboard → Storage → New bucket
--         Name:   creator-media
--         Public: ON  (allows direct image URLs without signed tokens)
--
--    3. After running SQL + creating the bucket, the storage service
--       in assets/js/services/storage.js is fully operational.
-- ============================================================


-- ── 1. profiles.cover_image_url ───────────────────────────────
-- Stores the profile-level banner/cover image URL.
-- Separate from avatar_url so both can exist independently.
-- Written by: admin via storage.updateProfileCover()
-- Read by:    page-renderer.js (sets CSS var or background-image)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

COMMENT ON COLUMN profiles.cover_image_url IS
  'Public URL of the profile cover/banner image in the creator-media bucket. '
  'Path: creator-media/{username}/cover/{timestamp}_{filename}';


-- ── 2. Storage RLS — creator-media: public read ───────────────
-- Allows browser templates and page-renderer.js to load images
-- without any auth token. Equivalent to setting the bucket to Public.
-- (Both the bucket Public toggle AND a SELECT policy can coexist safely.)

DROP POLICY IF EXISTS "creator-media: public read" ON storage.objects;

CREATE POLICY "creator-media: public read"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'creator-media');


-- ── 3. Storage RLS — creator-media: authenticated upload ──────
-- Only logged-in admin users can INSERT files.
-- The anon key alone cannot upload to this bucket.

DROP POLICY IF EXISTS "creator-media: authenticated upload" ON storage.objects;

CREATE POLICY "creator-media: authenticated upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'creator-media');


-- ── 4. Storage RLS — creator-media: authenticated update ──────
-- Allows admin to overwrite files (upsert) and rename.

DROP POLICY IF EXISTS "creator-media: authenticated update" ON storage.objects;

CREATE POLICY "creator-media: authenticated update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'creator-media');


-- ── 5. Storage RLS — creator-media: authenticated delete ──────
-- Admin can remove old files (e.g. when a creator re-uploads their avatar).

DROP POLICY IF EXISTS "creator-media: authenticated delete" ON storage.objects;

CREATE POLICY "creator-media: authenticated delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'creator-media');


-- ============================================================
--  MIGRATION COMPLETE
--
--  Summary of changes:
--    profiles.cover_image_url    TEXT column added
--    storage policy: creator-media: public read
--    storage policy: creator-media: authenticated upload
--    storage policy: creator-media: authenticated update
--    storage policy: creator-media: authenticated delete
--
--  NEXT STEP (manual, required):
--    Create the `creator-media` bucket in Supabase Storage UI.
--    Storage → New bucket → Name: creator-media → Public: ON
--
--  Service file: assets/js/services/storage.js
--  Functions ready to use:
--    uploadAvatar(username, file)         → url, path, error
--    uploadCover(username, file)          → url, path, error
--    uploadBoardImage(username, file)     → url, path, error
--    getPublicUrl(storagePath)            → string
--    deleteMedia(storagePath)             → error
--    updateProfileAvatar(profileId, url)  → error
--    updateProfileCover(profileId, url)   → error
--    updateBoardPostImage(postId, url)    → error
-- ============================================================
