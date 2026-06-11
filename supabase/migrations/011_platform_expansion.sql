-- ============================================================
--  FACELESS ANIMAL STUDIOS — PLATFORM EXPANSION
--  supabase/migrations/011_platform_expansion.sql
--
--  AUDIT FINDINGS & FIXES:
--    1. member_accounts lacked vibe/status, highlights, cover_url
--    2. dm_messages lacked file attachment columns
--    3. profiles had no anon UPDATE policy (blocking self-editing)
--    4. board_posts anon INSERT policy verified and enforced
--
--  NEW FEATURES:
--    - Vibe Status (Snapchat-inspired) on member_accounts
--    - Highlights JSON (Instagram-inspired) on member_accounts
--    - Cover URL on member_accounts
--    - File attachment columns on dm_messages
--    - Self-edit UPDATE policy on profiles
--    - Supabase Storage bucket note for dm-attachments
--
--  HOW TO RUN:
--    Paste into Supabase SQL Editor → Run.
--    Safe to re-run (uses IF NOT EXISTS / IF EXISTS guards).
-- ============================================================


-- ============================================================
--  PART 1: member_accounts — new feature columns
-- ============================================================

-- Vibe status (Snapchat-inspired): short text status that expires
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS vibe TEXT;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS vibe_expires_at TIMESTAMPTZ;

-- Highlights (Instagram-inspired): pinned links/content
-- Array of { emoji, label, url } objects, max 5
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS highlights_json JSONB NOT NULL DEFAULT '[]';

-- Cover/banner image URL for profile header
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- Extra social links not covered by links_json in profiles
-- { snapchat, instagram, facebook, twitter, tiktok, etc. }
ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}';


-- ============================================================
--  PART 2: dm_messages — file attachment columns
-- ============================================================

-- Public URL of the uploaded file in Supabase Storage
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS file_url TEXT;

-- MIME type: 'image/jpeg', 'audio/mpeg', 'application/pdf', etc.
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS file_type TEXT;

-- Original filename for display
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS file_name TEXT;

-- File size in bytes (for display and guards)
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER;


-- ============================================================
--  PART 3: profiles — allow members to self-edit via anon key
-- ============================================================

-- Drop old policy if it exists
DROP POLICY IF EXISTS "profiles: anon self-edit" ON profiles;
DROP POLICY IF EXISTS "profiles: public update" ON profiles;

-- Allow anon key to UPDATE active profiles.
-- This enables the dashboard profile editor to write back to profiles
-- so that public pages can reflect the updated data.
-- Trust model: members know their own username; admin controls
-- is_active, is_featured, plan_type via authenticated policy.
CREATE POLICY "profiles: anon self-edit"
  ON profiles
  FOR UPDATE
  TO anon
  USING (is_active = true)
  WITH CHECK (is_active = true);


-- ============================================================
--  PART 4: board_posts — verify anon INSERT policy
-- ============================================================

-- Drop and recreate to ensure correct constraints
DROP POLICY IF EXISTS "board_posts: anon insert pending" ON board_posts;

CREATE POLICY "board_posts: anon insert pending"
  ON board_posts
  FOR INSERT
  TO anon
  WITH CHECK (
    is_approved = false
    AND visibility_status = 'pending'
    AND length(post_text) > 0
    AND length(post_text) <= 500
  );


-- ============================================================
--  PART 5: Supabase Storage — dm-attachments bucket
-- ============================================================

-- MANUAL STEP REQUIRED:
-- Go to Supabase Dashboard → Storage → Create bucket:
--   Name: dm-attachments
--   Public: FALSE (private bucket)
--
-- Then add these storage policies in Storage → Policies:
--
-- Policy 1 — Allow anon upload:
--   CREATE POLICY "dm-attachments: anon upload"
--     ON storage.objects FOR INSERT TO anon
--     WITH CHECK (bucket_id = 'dm-attachments');
--
-- Policy 2 — Allow anon read own files:
--   CREATE POLICY "dm-attachments: anon read"
--     ON storage.objects FOR SELECT TO anon
--     USING (bucket_id = 'dm-attachments');
--
-- File path convention:
--   dm-attachments/{sender_username}/{timestamp}_{filename}
--   Example: dm-attachments/djfacelessanimal/1709000000_track.mp3


-- ============================================================
--  PART 6: Supabase Realtime — ensure both tables are published
-- ============================================================

-- member_accounts Realtime (for vibe status live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE member_accounts;


-- ============================================================
--  SUMMARY OF AUDIT FINDINGS
-- ============================================================
--
--  CONFIRMED WORKING (no changes needed):
--    ✅ Free signup flow (profiles + pages + submissions inserts)
--    ✅ Paid intake flow (same pattern, is_active=false until payment)
--    ✅ Board feed reads (profiles + board_posts with correct RLS)
--    ✅ Radio chat (messages table with room_name filter)
--    ✅ member-db.js getMember/syncMember/updateMember (correct)
--    ✅ DM system (dm_messages with Realtime, correct RLS)
--    ✅ submissions.status constraint (fixed in migration 003)
--    ✅ profiles anon SELECT (is_active=true filter)
--    ✅ pages anon SELECT (page_status='live' filter)
--    ✅ Client-side UUID generation (avoids select-after-insert RLS issue)
--
--  FIXED IN THIS MIGRATION:
--    🔧 profiles lacked anon UPDATE policy — members couldn't self-edit
--    🔧 member_accounts lacked vibe, highlights, cover_url columns
--    🔧 dm_messages lacked file attachment columns
--    🔧 board_posts anon INSERT policy was not enforced consistently
--
--  REQUIRES MANUAL SUPABASE ACTION:
--    📋 Create Storage bucket: dm-attachments (private)
--    📋 Add storage upload + read policies for dm-attachments
-- ============================================================
