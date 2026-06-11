-- ============================================================
--  FACELESS ANIMAL STUDIOS — VAULT SPEND + ADMIN CONTROLS
--  supabase/migrations/034_vault_spend_and_admin_controls.sql
--
--  Purpose:
--    1) Wire internal Signal Credit spending (no cash-out path)
--    2) Add admin wallet freeze/unfreeze controls
--    3) Add admin transfer reversal + audit logging
-- ============================================================

BEGIN;

ALTER TABLE public.member_accounts
  ADD COLUMN IF NOT EXISTS wallet_frozen BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.member_accounts
  ADD COLUMN IF NOT EXISTS wallet_freeze_reason TEXT;

ALTER TABLE public.member_accounts
  ADD COLUMN IF NOT EXISTS wallet_frozen_at TIMESTAMPTZ;

ALTER TABLE public.member_accounts
  ADD COLUMN IF NOT EXISTS wallet_frozen_by TEXT;

CREATE TABLE IF NOT EXISTS public.vault_spend_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.member_accounts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  spend_type TEXT NOT NULL,
  amount NUMERIC(14,4) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_spend_events
  DROP CONSTRAINT IF EXISTS chk_vault_spend_events_amount_pos;

ALTER TABLE public.vault_spend_events
  ADD CONSTRAINT chk_vault_spend_events_amount_pos
  CHECK (amount > 0);

CREATE INDEX IF NOT EXISTS idx_vault_spend_events_member_created
  ON public.vault_spend_events(member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.vault_admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.member_accounts(id) ON DELETE SET NULL,
  actor_username TEXT,
  target_id UUID REFERENCES public.member_accounts(id) ON DELETE SET NULL,
  target_username TEXT,
  action_type TEXT NOT NULL,
  reference_id UUID,
  amount NUMERIC(14,4),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vault_admin_actions_created
  ON public.vault_admin_actions(created_at DESC);

ALTER TABLE public.veil_transactions
  ADD COLUMN IF NOT EXISTS reversed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.veil_transactions
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

ALTER TABLE public.veil_transactions
  ADD COLUMN IF NOT EXISTS reversed_by TEXT;

ALTER TABLE public.veil_transactions
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE OR REPLACE FUNCTION public.spend_vault_credits(
  p_username TEXT,
  p_ph TEXT,
  p_spend_type TEXT,
  p_amount NUMERIC,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.member_accounts%ROWTYPE;
  v_username TEXT := lower(trim(coalesce(p_username, '')));
  v_spend_type TEXT := lower(trim(coalesce(p_spend_type, '')));
  v_amount NUMERIC(14,4) := round(coalesce(p_amount, 0)::numeric, 4);
  v_balance_after NUMERIC(14,4);
BEGIN
  IF v_username = '' OR coalesce(trim(p_ph), '') = '' THEN
    RETURN json_build_object('error', 'Missing credentials');
  END IF;

  IF v_spend_type NOT IN ('boost_signal', 'visibility_burst', 'featured_highlight') THEN
    RETURN json_build_object('error', 'Invalid spend type');
  END IF;

  IF v_amount <= 0 THEN
    RETURN json_build_object('error', 'Invalid spend amount');
  END IF;

  SELECT * INTO v_member
  FROM public.member_accounts
  WHERE username = v_username
    AND password_hash = p_ph
  FOR UPDATE;

  IF v_member IS NULL THEN
    RETURN json_build_object('error', 'Authentication failed');
  END IF;

  IF coalesce(v_member.wallet_frozen, false) THEN
    RETURN json_build_object(
      'error', 'Wallet is frozen',
      'freeze_reason', coalesce(v_member.wallet_freeze_reason, '')
    );
  END IF;

  IF coalesce(v_member.credits_balance, 0) < v_amount THEN
    RETURN json_build_object('error', 'Insufficient balance');
  END IF;

  v_balance_after := round(coalesce(v_member.credits_balance, 0) - v_amount, 4);

  UPDATE public.member_accounts
  SET credits_balance = v_balance_after
  WHERE id = v_member.id;

  INSERT INTO public.vault_spend_events (
    member_id,
    username,
    spend_type,
    amount,
    metadata
  ) VALUES (
    v_member.id,
    v_member.username,
    v_spend_type,
    v_amount,
    coalesce(p_metadata, '{}'::jsonb)
  );

  RETURN json_build_object(
    'success', true,
    'spend_type', v_spend_type,
    'spent', v_amount,
    'balance', v_balance_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_wallet_frozen(
  p_actor_username TEXT,
  p_actor_ph TEXT,
  p_target_username TEXT,
  p_frozen BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.member_accounts%ROWTYPE;
  v_target public.member_accounts%ROWTYPE;
  v_actor_username TEXT := lower(trim(coalesce(p_actor_username, '')));
  v_target_username TEXT := lower(trim(coalesce(p_target_username, '')));
  v_reason TEXT := nullif(left(trim(coalesce(p_reason, '')), 300), '');
BEGIN
  SELECT * INTO v_actor
  FROM public.member_accounts
  WHERE username = v_actor_username
    AND password_hash = coalesce(p_actor_ph, '')
  LIMIT 1;

  IF v_actor IS NULL THEN
    RETURN json_build_object('error', 'Authentication failed');
  END IF;

  IF lower(coalesce(v_actor.role, 'user')) <> 'super_admin' THEN
    RETURN json_build_object('error', 'Only super_admin can control wallet freeze');
  END IF;

  SELECT * INTO v_target
  FROM public.member_accounts
  WHERE username = v_target_username
  FOR UPDATE;

  IF v_target IS NULL THEN
    RETURN json_build_object('error', 'Target user not found');
  END IF;

  IF v_target.id = v_actor.id THEN
    RETURN json_build_object('error', 'Cannot change your own wallet freeze state');
  END IF;

  IF lower(coalesce(v_target.role, 'user')) = 'super_admin' THEN
    RETURN json_build_object('error', 'Cannot freeze another super_admin');
  END IF;

  UPDATE public.member_accounts
  SET wallet_frozen = coalesce(p_frozen, false),
      wallet_freeze_reason = CASE WHEN coalesce(p_frozen, false) THEN v_reason ELSE NULL END,
      wallet_frozen_at = CASE WHEN coalesce(p_frozen, false) THEN now() ELSE NULL END,
      wallet_frozen_by = CASE WHEN coalesce(p_frozen, false) THEN v_actor.username ELSE NULL END
  WHERE id = v_target.id;

  INSERT INTO public.vault_admin_actions (
    actor_id,
    actor_username,
    target_id,
    target_username,
    action_type,
    reason,
    metadata
  ) VALUES (
    v_actor.id,
    v_actor.username,
    v_target.id,
    v_target.username,
    CASE WHEN coalesce(p_frozen, false) THEN 'wallet_freeze' ELSE 'wallet_unfreeze' END,
    v_reason,
    jsonb_build_object('wallet_frozen', coalesce(p_frozen, false))
  );

  RETURN json_build_object(
    'success', true,
    'target_username', v_target.username,
    'wallet_frozen', coalesce(p_frozen, false),
    'reason', coalesce(v_reason, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reverse_veil_transfer(
  p_actor_username TEXT,
  p_actor_ph TEXT,
  p_transfer_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.member_accounts%ROWTYPE;
  v_sender public.member_accounts%ROWTYPE;
  v_recipient public.member_accounts%ROWTYPE;
  v_tx public.veil_transactions%ROWTYPE;
  v_reason TEXT := nullif(left(trim(coalesce(p_reason, '')), 300), '');
  v_sender_after NUMERIC(14,4);
  v_recipient_after NUMERIC(14,4);
BEGIN
  SELECT * INTO v_actor
  FROM public.member_accounts
  WHERE username = lower(trim(coalesce(p_actor_username, '')))
    AND password_hash = coalesce(p_actor_ph, '')
  LIMIT 1;

  IF v_actor IS NULL THEN
    RETURN json_build_object('error', 'Authentication failed');
  END IF;

  IF lower(coalesce(v_actor.role, 'user')) <> 'super_admin' THEN
    RETURN json_build_object('error', 'Only super_admin can reverse transfers');
  END IF;

  SELECT * INTO v_tx
  FROM public.veil_transactions
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF v_tx IS NULL THEN
    RETURN json_build_object('error', 'Transfer not found');
  END IF;

  IF coalesce(v_tx.reversed, false) THEN
    RETURN json_build_object('error', 'Transfer already reversed');
  END IF;

  SELECT * INTO v_sender
  FROM public.member_accounts
  WHERE id = v_tx.sender_id
  FOR UPDATE;

  SELECT * INTO v_recipient
  FROM public.member_accounts
  WHERE id = v_tx.recipient_id
  FOR UPDATE;

  IF v_sender IS NULL OR v_recipient IS NULL THEN
    RETURN json_build_object('error', 'Sender or recipient missing');
  END IF;

  IF coalesce(v_recipient.credits_balance, 0) < coalesce(v_tx.amount_received, 0) THEN
    RETURN json_build_object('error', 'Recipient balance too low to reverse this transfer');
  END IF;

  v_sender_after := round(coalesce(v_sender.credits_balance, 0) + coalesce(v_tx.amount, 0), 4);
  v_recipient_after := round(coalesce(v_recipient.credits_balance, 0) - coalesce(v_tx.amount_received, 0), 4);

  UPDATE public.member_accounts
  SET credits_balance = v_sender_after
  WHERE id = v_sender.id;

  UPDATE public.member_accounts
  SET credits_balance = v_recipient_after
  WHERE id = v_recipient.id;

  UPDATE public.veil_transactions
  SET reversed = true,
      reversed_at = now(),
      reversed_by = v_actor.username,
      reversal_reason = v_reason
  WHERE id = v_tx.id;

  INSERT INTO public.vault_admin_actions (
    actor_id,
    actor_username,
    target_id,
    target_username,
    action_type,
    reference_id,
    amount,
    reason,
    metadata
  ) VALUES (
    v_actor.id,
    v_actor.username,
    v_recipient.id,
    v_recipient.username,
    'reverse_transfer',
    v_tx.id,
    coalesce(v_tx.amount, 0),
    v_reason,
    jsonb_build_object(
      'sender_username', v_sender.username,
      'recipient_username', v_recipient.username,
      'fee', coalesce(v_tx.fee, 0),
      'amount_received', coalesce(v_tx.amount_received, 0)
    )
  );

  RETURN json_build_object(
    'success', true,
    'transfer_id', v_tx.id,
    'sender_username', v_sender.username,
    'recipient_username', v_recipient.username,
    'sender_balance', v_sender_after,
    'recipient_balance', v_recipient_after,
    'amount', coalesce(v_tx.amount, 0),
    'amount_received', coalesce(v_tx.amount_received, 0),
    'fee', coalesce(v_tx.fee, 0)
  );
END;
$$;

COMMIT;
