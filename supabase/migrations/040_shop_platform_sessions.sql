-- Short-lived shop-admin sessions issued after the existing website password
-- flow succeeds. Raw tokens never enter the database.
create table if not exists public.shop_platform_sessions (
  id uuid primary key default gen_random_uuid(),
  username text not null references public.member_accounts(username) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists shop_platform_sessions_lookup
  on public.shop_platform_sessions(username,token_hash,expires_at);
alter table public.shop_platform_sessions enable row level security;
revoke all on public.shop_platform_sessions from public,anon,authenticated;

-- Sensitive identity material must never be selectable through browser keys.
-- PostgreSQL privileges are additive, so revoke the table-level grant first,
-- then grant every current non-sensitive column explicitly.
revoke select on public.member_accounts from anon,authenticated;
do $$
declare safe_columns text;
begin
  select string_agg(quote_ident(column_name), ',')
    into safe_columns
  from information_schema.columns
  where table_schema='public' and table_name='member_accounts'
    and column_name not in (
      'password_hash','password_salt','password_set_at',
      'recovery_code_hash','recovery_code_set_at','email'
    );
  execute format('grant select (%s) on public.member_accounts to anon,authenticated', safe_columns);
end $$;
