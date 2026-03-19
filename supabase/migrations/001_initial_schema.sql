-- ============================================================
--  FACELESS ANIMAL STUDIOS — INITIAL DATABASE SCHEMA
--  supabase/migrations/001_initial_schema.sql
--
--  HOW TO RUN:
--    1. Go to https://supabase.com → your project
--    2. Click "SQL Editor" in the left sidebar
--    3. Paste this entire file and click "Run"
--
--  TABLES (in dependency order):
--    1. profiles    — creator/business/user profile information
--    2. pages       — page configuration and lifecycle status
--    3. submissions — intake form submissions (free + paid)
--    4. board_posts — creator network board posts
--    5. payments    — payment tracking and plan relationship
--    6. admin_notes — internal management notes
--
--  RLS POLICIES are at the bottom of this file.
--  Indexes are created inline with each table.
-- ============================================================


-- ── 1. TABLE: profiles ────────────────────────────────────────
-- Central profile record for every creator, business, or user on the platform.
-- All other tables reference profiles via profile_id foreign key.
--
-- Created when: an intake submission is approved and a page goes live.
-- Read by:      network.html (board cards), individual creator pages.
-- Written by:   admin after approving a submission.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now()             NOT NULL,

  -- Identity
  username     TEXT UNIQUE NOT NULL,                           -- URL slug (e.g. 'djfacelessanimal')
  display_name TEXT        NOT NULL,                           -- Public display name
  email        TEXT UNIQUE NOT NULL,                           -- Contact email
  bio          TEXT,                                           -- Short profile bio
  avatar_url   TEXT,                                           -- Public image URL from storage

  -- Creator classification
  -- Values: 'artist' | 'dj' | 'producer' | 'gamer' | 'creator' | 'business'
  category     TEXT        NOT NULL DEFAULT 'creator',

  -- Location
  city         TEXT,
  state        TEXT,

  -- Platform links stored as JSON object
  -- Example: { "spotify": "...", "youtube": "...", "instagram": "...", "tiktok": "...", "soundcloud": "...", "website": "..." }
  links_json   JSONB       NOT NULL DEFAULT '{}',

  -- Plan tier: 'free' | 'starter' | 'pro' | 'premium'
  plan_type    TEXT        NOT NULL DEFAULT 'free',

  -- Flags
  is_featured  BOOLEAN     NOT NULL DEFAULT false,             -- Shown in featured sections
  is_active    BOOLEAN     NOT NULL DEFAULT true,              -- Soft delete / pause flag

  -- Canonical page URL slug — must be unique and URL-safe
  slug         TEXT UNIQUE NOT NULL
);

CREATE INDEX idx_profiles_slug        ON profiles (slug);
CREATE INDEX idx_profiles_category    ON profiles (category);
CREATE INDEX idx_profiles_plan_type   ON profiles (plan_type);
CREATE INDEX idx_profiles_is_featured ON profiles (is_featured) WHERE is_featured = true;
CREATE INDEX idx_profiles_is_active   ON profiles (is_active)   WHERE is_active   = true;


-- ── 2. TABLE: pages ───────────────────────────────────────────
-- Stores page-specific configuration and lifecycle status for each creator page.
-- One profile can have multiple pages (e.g. a DJ with a separate business page).
--
-- Status flow: draft → submitted → live → paused
-- Created when: admin builds the page from an approved submission.
-- Read by:      templates/creator.html, templates/business.html (via page_slug).
-- Written by:   admin after building the page.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE pages (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT now()             NOT NULL,

  -- Owner
  profile_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Template configuration
  -- page_type:     'artist' | 'business' | 'creator'
  page_type      TEXT        NOT NULL DEFAULT 'creator',
  -- template_name: specific template variant (e.g. 'dark-minimal', 'grid-heavy')
  template_name  TEXT,

  -- Page content overrides (displayed in the hero/header section)
  title          TEXT,
  subtitle       TEXT,

  -- Visual style variant applied on top of the template
  theme_style    TEXT,

  -- Lifecycle status: 'draft' | 'submitted' | 'live' | 'paused'
  page_status    TEXT        NOT NULL DEFAULT 'draft',

  -- Optional custom domain pointed at this page (e.g. 'djfacelessanimal.com')
  custom_domain  TEXT,

  -- URL-safe page identifier — unique across all pages (e.g. 'koldvisual')
  page_slug      TEXT UNIQUE,

  -- Tracks whether a paid upgrade is: null | 'requested' | 'in_progress' | 'complete'
  upgrade_status TEXT,

  -- Flexible JSON for additional page config:
  -- OG tags, section visibility toggles, accent color, custom section data, etc.
  -- Example: { "og_image": "...", "accent_color": "#ff2d55", "show_works": true }
  metadata_json  JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_pages_profile_id  ON pages (profile_id);
CREATE INDEX idx_pages_page_status ON pages (page_status);
CREATE INDEX idx_pages_page_slug   ON pages (page_slug);


-- ── 3. TABLE: submissions ─────────────────────────────────────
-- Stores all intake form submissions: free signups, paid plan requests, and update requests.
-- Consolidates what was previously two tables (intake_submissions + free_signups).
--
-- Anon INSERT allowed (anyone can submit a form from the public site).
-- SELECT and UPDATE are admin-only.
--
-- Status flow: pending → in_progress → live | rejected
-- profile_id and page_id start as null and are linked once the admin approves + builds.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE submissions (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT now()             NOT NULL,

  -- Linked after approval — null until the profile is created from this submission
  profile_id        UUID        REFERENCES profiles(id) ON DELETE SET NULL,

  -- Linked after build — null until the page is built from this submission
  page_id           UUID        REFERENCES pages(id) ON DELETE SET NULL,

  -- Submission source: 'free_signup' | 'paid_intake' | 'update_request'
  submission_type   TEXT        NOT NULL,

  -- Form fields captured at submission time
  display_name      TEXT        NOT NULL,
  username          TEXT        NOT NULL,                     -- Desired page handle
  bio               TEXT,

  -- Platform links at submission time
  -- Example: { "spotify": "...", "instagram": "..." }
  links_json        JSONB       NOT NULL DEFAULT '{}',

  -- Public URL of profile image uploaded to Supabase Storage (profile-images bucket)
  -- Path pattern: profile-images/{username}/{filename}
  image_url         TEXT,

  style_notes       TEXT,                                     -- Design preferences from the form
  selected_template TEXT,                                     -- Template choice from intake form
  -- Plan selected at submission time: 'free' | 'starter' | 'pro' | 'premium'
  selected_plan     TEXT,

  -- Review status: 'pending' | 'in_progress' | 'live' | 'rejected'
  status            TEXT        NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_submissions_profile_id      ON submissions (profile_id);
CREATE INDEX idx_submissions_status          ON submissions (status);
CREATE INDEX idx_submissions_submission_type ON submissions (submission_type);
CREATE INDEX idx_submissions_username        ON submissions (username);


-- ── 4. TABLE: board_posts ─────────────────────────────────────
-- Stores creator network board posts shown on network.html.
-- Creators post updates, releases, collabs, and announcements.
-- Posts must be approved (is_approved = true) to appear publicly.
--
-- Read by:    board-feed.js (assets/js/services/board.js)
-- Written by: admin or future creator dashboard
-- ──────────────────────────────────────────────────────────────
CREATE TABLE board_posts (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT now()             NOT NULL,

  -- Creator who authored the post
  profile_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Denormalized for performance — avoids join on every board render
  username          TEXT        NOT NULL,

  post_text         TEXT        NOT NULL,

  -- Post type / category: 'release' | 'update' | 'collab' | 'announcement' | 'question'
  category          TEXT,

  -- Optional image attached to the post (stored in Supabase Storage)
  image_url         TEXT,

  is_featured       BOOLEAN     NOT NULL DEFAULT false,       -- Pinned/featured at top of board
  is_approved       BOOLEAN     NOT NULL DEFAULT false,       -- Must be true to show publicly

  -- Visibility: 'pending' | 'visible' | 'hidden'
  visibility_status TEXT        NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_board_posts_profile_id        ON board_posts (profile_id);
CREATE INDEX idx_board_posts_is_approved       ON board_posts (is_approved)   WHERE is_approved = true;
CREATE INDEX idx_board_posts_visibility_status ON board_posts (visibility_status);
CREATE INDEX idx_board_posts_created_at        ON board_posts (created_at DESC);


-- ── 5. TABLE: payments ────────────────────────────────────────
-- Tracks all payment events and their relationship to profiles and pages.
-- Supports multiple providers because the platform accepts manual transfers
-- (Cash App, Venmo, Zelle) in addition to Stripe and PayPal.
-- Payments are admin-only — never readable by anonymous users.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE payments (
  id                 UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         TIMESTAMPTZ    DEFAULT now()             NOT NULL,

  -- Profile this payment belongs to
  profile_id         UUID           NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Page this payment unlocks or upgrades — null for account-level payments
  page_id            UUID           REFERENCES pages(id) ON DELETE SET NULL,

  -- Payment processor: 'stripe' | 'paypal' | 'cashapp' | 'venmo' | 'zelle'
  provider           TEXT           NOT NULL,

  -- Payment category: 'setup' (one-time) | 'monthly' | 'upgrade'
  payment_type       TEXT           NOT NULL,

  -- Amount in standard currency units (dollars for USD)
  amount             NUMERIC(10, 2) NOT NULL,

  -- Currency code (ISO 4217)
  currency           TEXT           NOT NULL DEFAULT 'USD',

  -- Payment lifecycle: 'pending' | 'confirmed' | 'failed' | 'refunded'
  status             TEXT           NOT NULL DEFAULT 'pending',

  -- Provider transaction ID, confirmation number, or admin note
  -- For manual payments (Cash App, Venmo): store the reference code or screenshot note
  external_reference TEXT,

  -- Plan tier this payment corresponds to: 'free' | 'starter' | 'pro' | 'premium'
  plan_type          TEXT
);

CREATE INDEX idx_payments_profile_id ON payments (profile_id);
CREATE INDEX idx_payments_page_id    ON payments (page_id);
CREATE INDEX idx_payments_status     ON payments (status);
CREATE INDEX idx_payments_provider   ON payments (provider);


-- ── 6. TABLE: admin_notes ─────────────────────────────────────
-- Internal management notes attached to profiles or pages.
-- Tracks review progress, build status, and admin communication history.
-- Fully restricted — admin access only, never readable by anon.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE admin_notes (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT now()             NOT NULL,

  -- Notes can be attached to a profile, a page, or both (all are optional)
  profile_id      UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  page_id         UUID        REFERENCES pages(id)    ON DELETE SET NULL,

  note_text       TEXT        NOT NULL,

  -- Internal workflow status:
  -- 'pending_review' | 'in_progress' | 'complete' | 'flagged' | 'on_hold'
  internal_status TEXT,

  -- Admin identifier who last updated this note (username or email)
  updated_by      TEXT
);

CREATE INDEX idx_admin_notes_profile_id      ON admin_notes (profile_id);
CREATE INDEX idx_admin_notes_page_id         ON admin_notes (page_id);
CREATE INDEX idx_admin_notes_internal_status ON admin_notes (internal_status);


-- ============================================================
--  ROW LEVEL SECURITY (RLS) POLICIES
--
--  anon role        = public unauthenticated users (website visitors)
--  authenticated    = logged-in users (admin panel)
--
--  General rules:
--    profiles    — public read (active only) | admin write
--    pages       — public read (live only)   | admin write
--    submissions — public insert only        | admin read/update
--    board_posts — public read (approved)    | admin write
--    payments    — admin only (never public)
--    admin_notes — admin only (never public)
-- ============================================================

ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;


-- ── profiles ──────────────────────────────────────────────────
-- Public can read active profiles (powers the network board and creator page lookups).
-- Admin has full access to create, update, and deactivate profiles.

CREATE POLICY "profiles: public read active"
  ON profiles
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "profiles: admin full access"
  ON profiles
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── pages ─────────────────────────────────────────────────────
-- Public can only read pages that are live (not draft, submitted, or paused).
-- Admin can read and modify all pages at any status.

CREATE POLICY "pages: public read live"
  ON pages
  FOR SELECT
  TO anon
  USING (page_status = 'live');

CREATE POLICY "pages: admin full access"
  ON pages
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── submissions ───────────────────────────────────────────────
-- Anyone can INSERT a submission (public intake forms).
-- Only admin can read, update, or delete submissions.

CREATE POLICY "submissions: public insert"
  ON submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "submissions: admin full access"
  ON submissions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── board_posts ───────────────────────────────────────────────
-- Public can only read posts that are approved AND visible.
-- Admin can read and manage all posts regardless of status.

CREATE POLICY "board_posts: public read approved"
  ON board_posts
  FOR SELECT
  TO anon
  USING (is_approved = true AND visibility_status = 'visible');

CREATE POLICY "board_posts: admin full access"
  ON board_posts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── payments ──────────────────────────────────────────────────
-- Payments are private — admin only, never readable by anon.

CREATE POLICY "payments: admin full access"
  ON payments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ── admin_notes ───────────────────────────────────────────────
-- Admin notes are private — admin only, never readable by anon.

CREATE POLICY "admin_notes: admin full access"
  ON admin_notes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
--  SCHEMA COMPLETE
--
--  Next steps:
--    1. Run this file in the Supabase SQL Editor
--    2. Go to Storage → Create bucket named "profile-images"
--       Set it to Public (for public read of uploaded images)
--    3. Set up auth (if using Supabase Auth for admin login)
--    4. Update assets/js/services/ files to go live
--
--  Table summary:
--    profiles    → creator/business identity (public read if active)
--    pages       → page config + status    (public read if live)
--    submissions → form intake             (public insert only)
--    board_posts → network board feed      (public read if approved)
--    payments    → payment tracking        (admin only)
--    admin_notes → internal notes          (admin only)
-- ============================================================
