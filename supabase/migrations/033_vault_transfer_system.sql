-- ============================================================
--  FACELESS ANIMAL STUDIOS — VAULT TRANSFER SYSTEM
--  supabase/migrations/033_vault_transfer_system.sql
--
--  Purpose:
--    Add a private transfer ledger and a server-callable transfer RPC
--    for the existing Signal Vault balance stored in member_accounts.
--
--  Notes:
--    - Uses credits_balance as the canonical Vault currency field.
--    - Keeps the transfer_veil RPC name for compatibility.
--    - Applies a 30% system fee to every transfer.
--    - Locks sender/recipient rows to prevent concurrent balance races.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.veil_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.member_accounts(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.member_accounts(id) ON DELETE CASCADE,
  sender_code TEXT,
  recipient_code TEXT,
  amount NUMERIC(14,4) NOT NULL,
  fee NUMERIC(14,4) NOT NULL,
  amount_received NUMERIC(14,4) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.veil_transactions
  DROP CONSTRAINT IF EXISTS chk_veil_transactions_amount_positive;

ALTER TABLE public.veil_transactions
  ADD CONSTRAINT chk_veil_transactions_amount_positive
  CHECK (amount > 0);

ALTER TABLE public.veil_transactions
  DROP CONSTRAINT IF EXISTS chk_veil_transactions_fee_nonneg;

ALTER TABLE public.veil_transactions
  ADD CONSTRAINT chk_veil_transactions_fee_nonneg
  CHECK (fee >= 0);

ALTER TABLE public.veil_transactions
  DROP CONSTRAINT IF EXISTS chk_veil_transactions_amount_received_nonneg;

ALTER TABLE public.veil_transactions
  ADD CONSTRAINT chk_veil_transactions_amount_received_nonneg
  CHECK (amount_received >= 0);

ALTER TABLE public.veil_transactions
  DROP CONSTRAINT IF EXISTS chk_veil_transactions_distinct_members;

ALTER TABLE public.veil_transactions
  ADD CONSTRAINT chk_veil_transactions_distinct_members
  CHECK (sender_id <> recipient_id);

CREATE INDEX IF NOT EXISTS idx_veil_transactions_sender_created
  ON public.veil_transactions (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_veil_transactions_recipient_created
  ON public.veil_transactions (recipient_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.transfer_veil(
  sender UUID,
  recipient_code TEXT,
  send_amount NUMERIC,
  note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_acc public.member_accounts%ROWTYPE;
  recipient_acc public.member_accounts%ROWTYPE;
  normalized_code TEXT;
  normalized_note TEXT;
  rounded_amount NUMERIC(14,4);
  fee_amount NUMERIC(14,4);
  receive_amount NUMERIC(14,4);
  sender_balance_after NUMERIC(14,4);
BEGIN
  normalized_code := upper(trim(coalesce(recipient_code, '')));
  normalized_note := nullif(left(trim(coalesce(note, '')), 240), '');
  rounded_amount := round(coalesce(send_amount, 0)::numeric, 4);

  IF normalized_code !~ '^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' THEN
    RETURN json_build_object('error', 'Recipient code invalid');
  END IF;

  SELECT * INTO sender_acc
  FROM public.member_accounts
  WHERE id = sender
  FOR UPDATE;

  IF sender_acc IS NULL THEN
    RETURN json_build_object('error', 'Sender not found');
  END IF;

  SELECT * INTO recipient_acc
  FROM public.member_accounts
  WHERE upper(coalesce(platform_id, '')) = normalized_code
  FOR UPDATE;

  IF recipient_acc IS NULL THEN
    RETURN json_build_object('error', 'Recipient not found');
  END IF;

  IF sender_acc.id = recipient_acc.id THEN
    RETURN json_build_object('error', 'Cannot send to yourself');
  END IF;

  IF rounded_amount <= 0 THEN
    RETURN json_build_object('error', 'Invalid amount');
  END IF;

  IF coalesce(sender_acc.credits_balance, 0) < rounded_amount THEN
    RETURN json_build_object('error', 'Insufficient balance');
  END IF;

  fee_amount := round(rounded_amount * 0.30, 4);
  receive_amount := round(rounded_amount - fee_amount, 4);
  sender_balance_after := round(coalesce(sender_acc.credits_balance, 0) - rounded_amount, 4);

  UPDATE public.member_accounts
  SET credits_balance = sender_balance_after
  WHERE id = sender_acc.id;

  UPDATE public.member_accounts
  SET credits_balance = round(coalesce(credits_balance, 0) + receive_amount, 4)
  WHERE id = recipient_acc.id;

  INSERT INTO public.veil_transactions (
    sender_id,
    recipient_id,
    sender_code,
    recipient_code,
    amount,
    fee,
    amount_received,
    note
  ) VALUES (
    sender_acc.id,
    recipient_acc.id,
    upper(coalesce(sender_acc.platform_id, '')),
    upper(coalesce(recipient_acc.platform_id, normalized_code)),
    rounded_amount,
    fee_amount,
    receive_amount,
    normalized_note
  );

  RETURN json_build_object(
    'success', true,
    'sent', rounded_amount,
    'fee', fee_amount,
    'received', receive_amount,
    'sender_balance', sender_balance_after,
    'recipient_code', upper(coalesce(recipient_acc.platform_id, normalized_code))
  );
END;
$$;

COMMIT;
