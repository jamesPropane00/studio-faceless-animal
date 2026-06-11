-- ============================================================
--  FACELESS ANIMAL STUDIOS — IDENTITY HARDENING + STORAGE TRACKING
--  supabase/migrations/021_identity_hardening.sql
--
--  PURPOSE:
--    1. Add storage_used_bytes tracking to member_accounts
--    2. Add is_founder / founder_label for studio founder markers
--    3. Add recovery_required flag for accounts missing recovery hash
--    4. Safety backfill: platform_id for any users still missing one
--    5. Backfill recovery_required=true for accounts without recovery hash
--    6. Mark known studio founders (arianamnm + renee-pattern usernames)
--    7. Add anon INSERT/UPDATE policies to creator-media bucket
--       so platform members can upload their own creator media
--       (mirrors profile-images bucket approach — file validation in JS)
--    8. Add reset_member_recovery_code RPC (password-verified recovery reset)
--       so members can replace their recovery hash from the dashboard
--       without needing a raw admin override
--
--  SAFE TO RUN: all ALTER TABLEs use IF NOT EXISTS
--
--  AFTER RUNNING:
--    - Every member_accounts row will have a platform_id
--    - Every member_accounts row will have recovery_required set correctly
--    - Known founders will have is_founder=true and founder_label set
--    - Members can upload avatar/cover images through the dashboard
--    - Members can generate a new recovery code from the dashboard
-- ============================================================


-- ── 1. Add storage_used_bytes ─────────────────────────────────
-- Cumulative storage used in bytes across all uploaded creator media.
-- Updated client-side after each successful upload.
-- Plan limits enforced in JS:
--   free:    150 MB = 157,286,400 bytes
--   premium: 600 MB = 629,145,600 bytes

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0;

COMMENT ON COLUMN member_accounts.storage_used_bytes IS
  'Cumulative creator media storage used in bytes. '
  'Free plan limit: 157286400 (150 MB). Premium limit: 629145600 (600 MB). '
  'Updated client-side after upload. Display-tracked, not enforced server-side.';


-- ── 2. Add founder markers ────────────────────────────────────
-- Used to mark studio founding members with a visible label
-- in the dashboard identity panel and admin user view.

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS is_founder BOOLEAN DEFAULT false;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS founder_label TEXT;

COMMENT ON COLUMN member_accounts.is_founder IS
  'True if this account is a studio founding member.';

COMMENT ON COLUMN member_accounts.founder_label IS
  'Visible label for founders shown in dashboard identity panel. '
  'Examples: "Studio Founder", "Founding Member", "Early Builder".';


-- ── 3. Add recovery_required flag ────────────────────────────
-- True when the user has not yet set a recovery code.
-- Triggers a "Recovery Setup Required" state in the dashboard.
-- Cleared automatically when reset_member_recovery_code() succeeds.

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS recovery_required BOOLEAN DEFAULT false;

COMMENT ON COLUMN member_accounts.recovery_required IS
  'True if this account has no usable recovery hash and the user '
  'must complete recovery setup on next dashboard visit. '
  'Cleared by reset_member_recovery_code() RPC.';


-- ── 4. Safety backfill: platform_id ──────────────────────────
-- Migration 019 already handles this backfill.
-- This is a safety net for any rows created between migrations
-- or added directly to the database outside the normal signup flow.

UPDATE member_accounts
SET platform_id = 'sig_' || lower(left(replace(gen_random_uuid()::text, '-', ''), 12))
WHERE platform_id IS NULL;


-- ── 5. Backfill recovery_required ────────────────────────────
-- Any account with no recovery_code_hash needs to generate one
-- on their next dashboard visit. This flags them clearly.

UPDATE member_accounts
SET recovery_required = true
WHERE recovery_code_hash IS NULL
  AND (recovery_required = false OR recovery_required IS NULL);


-- ── 6. Mark known studio founders ────────────────────────────
-- arianamnm: confirmed founder username from codebase history.
-- renee: matched by username or display_name (case-insensitive).
-- Additional founders can be marked via admin panel to_do or follow-up migration.

UPDATE member_accounts
SET is_founder    = true,
    founder_label = 'Studio Founder'
WHERE username = 'arianamnm'
  AND (is_founder = false OR is_founder IS NULL);

UPDATE member_accounts
SET is_founder    = true,
    founder_label = 'Studio Founder'
WHERE (
    lower(username)     LIKE '%renee%'
    OR lower(display_name) LIKE '%renee%'
  )
  AND (is_founder = false OR is_founder IS NULL);


-- ── 7. Creator-media: member self-upload RLS ─────────────────
-- Platform members sign in with platform-native auth (not Supabase Auth),
-- so they use the anon Supabase key for all requests.
-- The creator-media bucket currently only allows authenticated inserts
-- (Supabase Auth session required). This blocks member self-upload.
--
-- Fix: add anon INSERT and UPDATE policies, mirroring the existing
-- profile-images bucket approach from migration 005.
--
-- Security model:
--   - Bucket is already public-read (no change)
--   - File type and size validation is enforced in assets/js/services/storage.js
--   - Path structure (username/type/timestamp_filename) is set by JS
--   - Uploaded URLs are only saved to DB after JS verifies they match the member
--   - This is the same trust model used by the intake form profile-images bucket

DROP POLICY IF EXISTS "creator-media: member self-upload" ON storage.objects;
CREATE POLICY "creator-media: member self-upload"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'creator-media');

DROP POLICY IF EXISTS "creator-media: member self-update" ON storage.objects;
CREATE POLICY "creator-media: member self-update"
  ON storage.objects
  FOR UPDATE
  TO anon
  USING (bucket_id = 'creator-media');


-- ── 8. reset_member_recovery_code RPC ────────────────────────
-- Allows a signed-in member to replace their recovery hash from the dashboard.
--
-- Auth model:
--   The function verifies ownership via the current password_hash.
--   The dashboard passes the session's stored password hash (ph field)
--   along with the new recovery hash.
--   If the password_hash does not match, FOUND is false and nothing is updated.
--
-- Flow (client-side):
--   1. User clicks "Generate Recovery Code" in dashboard
--   2. Client generates a random recovery code (generateRecoveryCode())
--   3. Client SHA-256 hashes the normalized code (hashRecoveryCode())
--   4. Client calls this RPC with username, current ph, and new hash
--   5. If return is true: show the raw code to the user once, clear after confirm
--   6. If return is false: show auth failure, prompt re-login
--
-- Returns: TRUE if the recovery hash was updated, FALSE otherwise.

CREATE OR REPLACE FUNCTION reset_member_recovery_code(
  p_username           TEXT,
  p_ph                 TEXT,    -- current password hash (verifies account ownership)
  p_new_recovery_hash  TEXT     -- SHA-256 hash of the new recovery code
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE member_accounts
  SET recovery_code_hash   = p_new_recovery_hash,
      recovery_code_set_at = now(),
      recovery_required    = false
  WHERE username      = lower(p_username)
    AND password_hash = p_ph;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION reset_member_recovery_code IS
  'Replace the recovery code hash for a member account after verifying '
  'current password ownership via password_hash comparison. '
  'Used by the dashboard self-service recovery setup flow. '
  'Returns true if the update succeeded, false if auth verification failed.';
