-- ============================================================
--  FACELESS ANIMAL STUDIOS — STORAGE POLICIES
--  supabase/migrations/005_storage_policies.sql
--
--  PURPOSE:
--    Adds RLS policies to the profile-images Storage bucket
--    so the intake forms (free.html, paid.html) can upload
--    profile images without authentication.
--
--  WHAT THIS SETS UP:
--
--  1. Anon INSERT (upload) — anyone can upload to:
--       profile-images/{username}/...
--     Used by: free-signup.js, paid-intake.js via uploadProfileImage()
--
--  2. Anon SELECT (read/download) — anyone can read images.
--     Required for avatar_url to work as a public image link.
--     (Also achievable by making the bucket Public in the UI.)
--
--  3. Anon UPDATE/DELETE are NOT granted — uploads are write-once
--     from the client side. The studio manages files via admin.
--
--  ALTERNATIVE (no SQL needed):
--    If the profile-images bucket is set to PUBLIC in the
--    Supabase Storage UI, reads are already open. You still
--    need the INSERT policy below for uploads to work.
--
--  HOW TO RUN:
--    Paste into Supabase SQL Editor → Run.
--    Safe to run multiple times (uses DROP IF EXISTS before CREATE).
-- ============================================================


-- ── Allow anon upload to profile-images ──────────────────────
-- Path pattern: profile-images/{username}/{filename}
-- The WITH CHECK restricts uploads to the bucket only
-- (name = 'profile-images'). No path restriction here so
-- any username can upload — the studio manages the bucket.

DROP POLICY IF EXISTS "profile-images: anon upload" ON storage.objects;

CREATE POLICY "profile-images: anon upload"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'profile-images');


-- ── Allow public read of profile-images ──────────────────────
-- Required if the bucket is PRIVATE. If the bucket is set to
-- PUBLIC in the Supabase UI, this policy is redundant but safe.

DROP POLICY IF EXISTS "profile-images: public read" ON storage.objects;

CREATE POLICY "profile-images: public read"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'profile-images');
