BEGIN;

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_note TEXT,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ban_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspension_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'member_accounts_role_check'
  ) THEN
    ALTER TABLE member_accounts
      ADD CONSTRAINT member_accounts_role_check
      CHECK (role IN ('super_admin','admin','moderator','user'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'member_accounts_membership_tier_check'
  ) THEN
    ALTER TABLE member_accounts
      ADD CONSTRAINT member_accounts_membership_tier_check
      CHECK (membership_tier IN ('free','premium','gifted_premium','trial_premium','lifetime_premium'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'member_accounts_account_status_check'
  ) THEN
    ALTER TABLE member_accounts
      ADD CONSTRAINT member_accounts_account_status_check
      CHECK (account_status IN ('active','warned','limited','suspended','banned'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_super_admin
  ON member_accounts ((role))
  WHERE role = 'super_admin';

CREATE INDEX IF NOT EXISTS idx_member_accounts_role
  ON member_accounts (role);

CREATE INDEX IF NOT EXISTS idx_member_accounts_membership_tier
  ON member_accounts (membership_tier);

CREATE INDEX IF NOT EXISTS idx_member_accounts_is_premium
  ON member_accounts (is_premium);

CREATE INDEX IF NOT EXISTS idx_member_accounts_account_status
  ON member_accounts (account_status);

CREATE TABLE IF NOT EXISTS user_permissions_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES member_accounts(id) ON DELETE CASCADE,
  can_upload_music BOOLEAN,
  can_send_messages BOOLEAN,
  can_vote_on_radio BOOLEAN,
  can_make_calls BOOLEAN,
  upload_limit_per_day INTEGER,
  message_limit_per_day INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_permissions_overrides_user_id
  ON user_permissions_overrides (user_id);

CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES member_accounts(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES member_accounts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  action_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_actor_created
  ON admin_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_target_created
  ON admin_logs (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_action_created
  ON admin_logs (action_type, created_at DESC);

ALTER TABLE user_permissions_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

/*
  IMPORTANT:
  Do NOT add broad authenticated policies here.
  We will wire secure access later through trusted logic.
*/

COMMIT;