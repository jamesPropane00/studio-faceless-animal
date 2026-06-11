-- ============================================================
--  FACELESS ANIMAL STUDIOS — PAID INTAKE: COLUMNS + POLICIES
--  supabase/migrations/004_paid_intake_columns.sql
--
--  PURPOSE:
--    Adds columns and RLS policies required by the paid intake
--    form (paid.html → paid-intake.js).
--
--  PART 1: NEW COLUMNS ON submissions
--
--    submissions.extra_notes       TEXT
--      Freeform notes from the customer (anything else we
--      should know before building their page).
--
--    submissions.custom_domain     TEXT
--      Custom domain the customer wants connected to their page.
--      Pro and Premium only. Nullable.
--
--    submissions.payment_ref       TEXT
--      Customer-supplied payment reference: Cash App $cashtag,
--      order ID, or any identifier from their payment.
--      Used to match the submission to the payment manually.
--
--    submissions.payment_verified  BOOLEAN  DEFAULT false
--      Set to true when payment is confirmed — manually by the
--      studio or automatically via a future payment processor
--      webhook. Build should only begin when this is true.
--
--  PART 2: RLS POLICY — paid plan profiles (anon INSERT)
--
--    The existing policy in 002 only allows plan_type = 'free'.
--    Paid intake creates profiles with plan_type = 'starter',
--    'pro', or 'premium'. These profiles start with is_active =
--    false (the studio activates after confirming payment).
--
--    This policy explicitly allows anon INSERT for paid plans,
--    but ONLY when is_active = false (i.e. the row is inactive
--    and won't appear in the public network until the studio
--    flips is_active = true after building the page).
--
--  HOW TO RUN:
--    Paste into Supabase SQL Editor → Run.
--    Safe to run multiple times (all operations are idempotent).
-- ============================================================


-- ── PART 1: New columns on submissions ───────────────────────

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'extra_notes'
  ) THEN
    ALTER TABLE submissions ADD COLUMN extra_notes TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'custom_domain'
  ) THEN
    ALTER TABLE submissions ADD COLUMN custom_domain TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'payment_ref'
  ) THEN
    ALTER TABLE submissions ADD COLUMN payment_ref TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'payment_verified'
  ) THEN
    ALTER TABLE submissions ADD COLUMN payment_verified BOOLEAN NOT NULL DEFAULT false;
  END IF;

END $$;


-- ── PART 2: RLS — allow anon INSERT for paid plan profiles ────
--
-- Paid customers submit their intake form anonymously (no login).
-- These profiles start inactive (is_active = false) and are
-- activated by the studio after payment is confirmed.
--
-- Safety constraints:
--   - is_active must be false (profile won't appear publicly)
--   - plan_type must be a valid paid plan
--   - UNIQUE constraint on username and email prevents flooding

DROP POLICY IF EXISTS "profiles: anon insert paid" ON profiles;

CREATE POLICY "profiles: anon insert paid"
  ON profiles
  FOR INSERT
  TO anon
  WITH CHECK (
    plan_type IN ('starter', 'pro', 'premium')
    AND is_active = false
  );
