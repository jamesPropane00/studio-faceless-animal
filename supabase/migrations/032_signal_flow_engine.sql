-- ============================================================
--  FACELESS ANIMAL STUDIOS — SIGNAL FLOW ENGINE STORAGE
--  supabase/migrations/032_signal_flow_engine.sql
--
--  Purpose:
--    Persist Signal Vault flow state in member_accounts so credit
--    generation is server-authoritative and timestamp-based.
--
--  Safe to run multiple times (idempotent).
-- ============================================================

BEGIN;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS credits_balance NUMERIC(14,4) DEFAULT 0;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS flow_last_tick_at TIMESTAMPTZ;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS flow_last_day DATE;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS flow_earned_today NUMERIC(14,4) DEFAULT 0;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS flow_rate_per_min NUMERIC(14,4) DEFAULT 0.2;

UPDATE member_accounts
SET credits_balance = 0
WHERE credits_balance IS NULL;

UPDATE member_accounts
SET flow_earned_today = 0
WHERE flow_earned_today IS NULL;

UPDATE member_accounts
SET flow_rate_per_min = 0.2
WHERE flow_rate_per_min IS NULL OR flow_rate_per_min < 0;

ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_credits_balance_nonneg;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_credits_balance_nonneg
  CHECK (credits_balance >= 0);

ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_flow_earned_today_nonneg;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_flow_earned_today_nonneg
  CHECK (flow_earned_today >= 0);

ALTER TABLE member_accounts
  DROP CONSTRAINT IF EXISTS chk_member_accounts_flow_rate_per_min_nonneg;

ALTER TABLE member_accounts
  ADD CONSTRAINT chk_member_accounts_flow_rate_per_min_nonneg
  CHECK (flow_rate_per_min >= 0);

CREATE INDEX IF NOT EXISTS idx_member_accounts_flow_last_day
  ON member_accounts (flow_last_day);

COMMIT;
