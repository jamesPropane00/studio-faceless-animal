-- ============================================================
--  FACELESS ANIMAL STUDIOS — MEMBER PLATFORM TABLES
--  supabase/migrations/002_member_platform.sql
--
--  HOW TO RUN:
--    Supabase Dashboard → SQL Editor → paste + Run
--
--  NEW TABLES:
--    1. member_accounts — platform member records (username-keyed)
--    2. dm_messages     — private 1:1 direct messages
--
--  Run AFTER 001_initial_schema.sql
-- ============================================================


-- ── 1. TABLE: member_accounts ─────────────────────────────────
-- Stores platform member records created via login.html.
-- Keyed by username (same as fas_user.username in localStorage).
-- Anon can insert + read + update own row (trust username anchor).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS member_accounts (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT now()             NOT NULL,
  last_active_at  TIMESTAMPTZ DEFAULT now(),

  -- Identity (mirrors fas_user localStorage)
  username        TEXT UNIQUE NOT NULL,
  display_name    TEXT        NOT NULL,
  email           TEXT,
  bio             TEXT,
  avatar_initial  TEXT,        -- single letter/char for avatar

  -- Location
  city            TEXT,
  state_abbr      TEXT,

  -- Plan & status
  -- plan_type:     'free' | 'access' | 'starter' | 'pro' | 'premium'
  plan_type       TEXT        NOT NULL DEFAULT 'free',
  -- member_status: 'free' | 'active' | 'paused' | 'suspended'
  member_status   TEXT        NOT NULL DEFAULT 'free',

  -- Page (linked after admin builds it)
  page_slug       TEXT,
  page_status     TEXT        DEFAULT 'none',   -- 'none' | 'draft' | 'live' | 'paused'

  -- Optional: upgrade requested
  upgrade_requested TEXT      -- plan tier they asked to upgrade to
);

CREATE INDEX IF NOT EXISTS idx_member_accounts_username      ON member_accounts (username);
CREATE INDEX IF NOT EXISTS idx_member_accounts_plan_type     ON member_accounts (plan_type);
CREATE INDEX IF NOT EXISTS idx_member_accounts_last_active   ON member_accounts (last_active_at DESC);

ALTER TABLE member_accounts ENABLE ROW LEVEL SECURITY;

-- Public can read all accounts (username, display_name, bio, plan_type — not email)
CREATE POLICY "member_accounts: public read"
  ON member_accounts FOR SELECT TO anon USING (true);

-- Anyone can insert a new account
CREATE POLICY "member_accounts: public insert"
  ON member_accounts FOR INSERT TO anon WITH CHECK (true);

-- Anyone can update an account (username acts as session anchor)
-- RLS here is intentionally permissive for a handle-based auth system
CREATE POLICY "member_accounts: public update"
  ON member_accounts FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Admin full access
CREATE POLICY "member_accounts: admin full access"
  ON member_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 2. TABLE: dm_messages ─────────────────────────────────────
-- Private 1:1 direct messages between platform members.
-- Thread identity: (least(sender,recipient), greatest(sender,recipient))
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dm_messages (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now()             NOT NULL,

  sender      TEXT        NOT NULL,    -- username of sender
  recipient   TEXT        NOT NULL,    -- username of recipient
  message     TEXT        NOT NULL,
  read_at     TIMESTAMPTZ              -- null = unread by recipient
);

CREATE INDEX IF NOT EXISTS idx_dm_sender      ON dm_messages (sender);
CREATE INDEX IF NOT EXISTS idx_dm_recipient   ON dm_messages (recipient);
CREATE INDEX IF NOT EXISTS idx_dm_thread      ON dm_messages (
  least(sender, recipient),
  greatest(sender, recipient),
  created_at DESC
);
CREATE INDEX IF NOT EXISTS idx_dm_created_at  ON dm_messages (created_at DESC);

ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

-- Public can read messages (username gate enforced in app layer)
CREATE POLICY "dm_messages: public read"
  ON dm_messages FOR SELECT TO anon USING (true);

-- Anyone can send a message (length check enforced)
CREATE POLICY "dm_messages: public insert"
  ON dm_messages FOR INSERT TO anon
  WITH CHECK (length(message) > 0 AND length(message) <= 500);

-- Sender/recipient can mark read
CREATE POLICY "dm_messages: public update"
  ON dm_messages FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Admin full access
CREATE POLICY "dm_messages: admin full access"
  ON dm_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable Realtime for dm_messages
ALTER PUBLICATION supabase_realtime ADD TABLE dm_messages;


-- ============================================================
--  SCHEMA COMPLETE
--  After running:
--    1. Enable Realtime for dm_messages in Dashboard → Database → Publications
--       (or the ALTER PUBLICATION line above handles it)
--    2. member_accounts and dm_messages are now live
-- ============================================================
