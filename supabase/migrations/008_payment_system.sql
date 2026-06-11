-- ============================================================
--  FACELESS ANIMAL STUDIOS — MIGRATION 008
--  Payment System: extended schema for full payment lifecycle
--
--  Run this in: Supabase Dashboard → SQL Editor
--
--  What this adds:
--  1. Extends payments table (from migration 007) with tracking columns
--  2. Creates payment_events audit log table
--  3. Adds plan tracking columns to profiles
--  4. Adds activation tracking columns to pages
--  5. RLS policies for all new tables/columns
-- ============================================================


-- ── 1. EXTEND PAYMENTS TABLE ──────────────────────────────────
--  Adds columns for: provider reference ID, confirmation tracking,
--  billing period bounds, and provider-specific metadata.
--  All use IF NOT EXISTS (safe to re-run).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_reference  text,
  -- User-supplied or provider-supplied transaction ID
  -- Examples: Cash App txn ID, Stripe PaymentIntent ID, PayPal order ID

  ADD COLUMN IF NOT EXISTS confirmed_at       timestamptz,
  -- When admin confirmed (manual) or webhook confirmed (automated)

  ADD COLUMN IF NOT EXISTS confirmed_by       text,
  -- Admin email or 'webhook:stripe' / 'webhook:paypal'

  ADD COLUMN IF NOT EXISTS billing_period_start timestamptz,
  -- Start of the billing period this payment covers

  ADD COLUMN IF NOT EXISTS billing_period_end   timestamptz,
  -- End of the billing period this payment covers (used for renewal reminders)

  ADD COLUMN IF NOT EXISTS metadata_json      jsonb;
  -- Raw provider data (Stripe event object, PayPal capture, etc.)
  -- Stored for debugging and future provider integrations

-- Extend the provider comment to include all five providers
COMMENT ON COLUMN payments.provider IS
  'cash_app | venmo | zelle | paypal | stripe';

COMMENT ON COLUMN payments.payment_type IS
  'setup | monthly | annual | upgrade';

COMMENT ON COLUMN payments.status IS
  'pending | processing | confirmed | failed | refunded';


-- ── 2. PAYMENT EVENTS AUDIT LOG ───────────────────────────────
--  Immutable log of every state change in the payment lifecycle.
--  Rows are never updated or deleted — append-only.

CREATE TABLE IF NOT EXISTS payment_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid        REFERENCES payments(id) ON DELETE SET NULL,
  -- Nullable: some events (plan_set, page_live) may not have a direct payment
  event_type   text        NOT NULL,
  -- recorded | confirmed | failed | refunded | plan_set | page_live | page_paused | overdue
  from_status  text,
  to_status    text,
  triggered_by text,
  -- admin email, 'system', 'webhook:stripe', etc.
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Admin read payment_events"
  ON payment_events FOR SELECT
  TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "Admin insert payment_events"
  ON payment_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- Service role can also insert (for webhook handlers)
CREATE POLICY IF NOT EXISTS "Service insert payment_events"
  ON payment_events FOR INSERT
  TO service_role WITH CHECK (true);


-- ── 3. EXTEND PROFILES TABLE — PLAN TRACKING ──────────────────
--  Adds columns to track the current plan state on each profile.
--  plan_type already exists — these are additional fields.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_status       text DEFAULT 'active',
  -- active | pending | past_due | cancelled

  ADD COLUMN IF NOT EXISTS plan_expires_at   timestamptz,
  -- When the current billing period ends (null for free plans)

  ADD COLUMN IF NOT EXISTS setup_fee_paid    boolean DEFAULT false,
  -- true once the one-time setup fee has been confirmed

  ADD COLUMN IF NOT EXISTS billing_start_date timestamptz;
  -- When the first paid billing period started

COMMENT ON COLUMN profiles.plan_status IS
  'active | pending | past_due | cancelled';

COMMENT ON COLUMN profiles.plan_expires_at IS
  'End of current billing period. Null for free plans.';


-- ── 4. EXTEND PAGES TABLE — ACTIVATION TRACKING ───────────────

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS plan_activated_at timestamptz,
  -- When page_status was last set to live via payment confirmation

  ADD COLUMN IF NOT EXISTS activated_by      text;
  -- Admin email or 'webhook:stripe' that triggered activation


-- ── 5. RLS FOR NEW COLUMNS (payments table already has policies) ──
--  payment_events is new — policies added above.
--  profiles and pages RLS policies from migration 007 already grant
--  authenticated full UPDATE access, so the new columns are covered.


-- ── 6. INDEXES FOR COMMON QUERIES ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payments_profile_id
  ON payments(profile_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments(status);

CREATE INDEX IF NOT EXISTS idx_payments_billing_period_end
  ON payments(billing_period_end);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id
  ON payment_events(payment_id);

CREATE INDEX IF NOT EXISTS idx_profiles_plan_status
  ON profiles(plan_status);

CREATE INDEX IF NOT EXISTS idx_profiles_plan_expires_at
  ON profiles(plan_expires_at);


-- ── REFERENCE: FULL PAYMENT FLOW ─────────────────────────────
--
--  MANUAL PAYMENT (Cash App / Venmo / Zelle):
--  ─────────────────────────────────────────
--  1. Creator pays → contacts studio with reference
--  2. Admin records in dashboard:
--       payments.insert({ profile_id, provider:'cash_app', payment_type:'setup',
--                         plan_type:'pro', amount:100, payment_reference:'...' })
--       → payment_events: { event_type:'recorded', to_status:'pending' }
--  3. Admin verifies externally (checks Cash App)
--  4. Admin clicks "Confirm & Activate":
--       payments.update({ status:'confirmed', confirmed_at, confirmed_by, billing_period_end })
--       → payment_events: { event_type:'confirmed' }
--       → profiles.update({ plan_type:'pro', plan_status:'active', plan_expires_at })
--       → payment_events: { event_type:'plan_set' }
--       → pages.update({ page_status:'live', plan_activated_at })  (submitted pages only)
--       → payment_events: { event_type:'page_live' }
--
--  AUTOMATED PAYMENT (Stripe / PayPal) — future:
--  ──────────────────────────────────────────────
--  1. Creator submits checkout form → Stripe PaymentIntent created
--       payments.insert({ ..., status:'processing', payment_reference:'pi_...' })
--  2. Stripe webhook fires:
--       if payment_intent.status === 'succeeded' → confirmPayment(paymentId)
--       if payment_intent.status === 'failed'    → rejectPayment(paymentId)
--
--  MONTHLY RENEWAL:
--  ────────────────
--  1. plan_expires_at approaches → send renewal reminder email
--  2. Creator pays → recordPayment({ payment_type:'monthly', ... })
--  3. Admin confirms → upgradePlan extends plan_expires_at by 30 days
--  4. checkOverdueAccounts() finds profiles past expiry → markPlanOverdue()
--
--  STATUS FLOW SUMMARY:
--  ────────────────────
--  payments.status:  pending → confirmed → (refunded)
--                    pending → failed
--  profiles.plan_status: pending → active → past_due → cancelled
--  pages.page_status:    submitted → live → paused
-- ============================================================
