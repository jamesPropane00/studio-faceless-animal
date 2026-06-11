-- ============================================================
--  FACELESS ANIMAL STUDIOS — MIGRATION 007
--  Admin Tables: payments + admin_notes
--  + RLS policies for authenticated admin access to all tables
--
--  Run this in: Supabase Dashboard → SQL Editor
-- ============================================================


-- ── PAYMENTS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid         REFERENCES profiles(id) ON DELETE SET NULL,
  provider      text         NOT NULL DEFAULT 'cash_app',
  -- cash_app | stripe | venmo | other
  amount        numeric(10,2),
  payment_type  text,
  -- one_time | monthly | annual | refund
  plan_type     text,
  -- free | starter | pro | premium
  status        text         NOT NULL DEFAULT 'pending',
  -- pending | confirmed | failed | refunded
  notes         text,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read payments"
  ON payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin insert payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin update payments"
  ON payments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin delete payments"
  ON payments FOR DELETE
  TO authenticated
  USING (true);


-- ── ADMIN NOTES TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_notes (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid         REFERENCES profiles(id) ON DELETE SET NULL,
  page_id        uuid         REFERENCES pages(id) ON DELETE SET NULL,
  content        text         NOT NULL,
  current_status text,
  author         text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read notes"
  ON admin_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin insert notes"
  ON admin_notes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin update notes"
  ON admin_notes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin delete notes"
  ON admin_notes FOR DELETE
  TO authenticated
  USING (true);


-- ── ADMIN READ POLICIES FOR EXISTING TABLES ───────────────────
--
--  By default, existing tables are anon-only (limited by is_active,
--  page_status=live, etc.). These policies allow authenticated
--  (admin) sessions to read ALL rows regardless of status.
--
--  If you already have an "authenticated can select" policy on
--  these tables, skip the relevant CREATE POLICY line.
-- ─────────────────────────────────────────────────────────────

-- profiles: allow admin to see all (including inactive)
CREATE POLICY IF NOT EXISTS "Admin read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- profiles: allow admin to update any profile
CREATE POLICY IF NOT EXISTS "Admin update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- pages: allow admin to see all (including draft/paused)
CREATE POLICY IF NOT EXISTS "Admin read all pages"
  ON pages FOR SELECT
  TO authenticated
  USING (true);

-- pages: allow admin to update any page
CREATE POLICY IF NOT EXISTS "Admin update pages"
  ON pages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- submissions: allow admin to read all submissions
CREATE POLICY IF NOT EXISTS "Admin read submissions"
  ON submissions FOR SELECT
  TO authenticated
  USING (true);

-- submissions: allow admin to update submission status
CREATE POLICY IF NOT EXISTS "Admin update submissions"
  ON submissions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- board_posts: allow admin to read all posts (including pending/hidden)
CREATE POLICY IF NOT EXISTS "Admin read all board_posts"
  ON board_posts FOR SELECT
  TO authenticated
  USING (true);

-- board_posts: allow admin to update any post
CREATE POLICY IF NOT EXISTS "Admin update board_posts"
  ON board_posts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
