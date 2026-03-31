-- PART 3: SQL / TABLE / RLS

-- 1. Table expectations
alter table accounts
  add constraint accounts_username_unique unique (username);
alter table accounts
  add constraint accounts_internal_email_unique unique (internal_email);
-- If not already present:
-- alter table accounts add column internal_email text unique;
-- alter table accounts add column auth_user_id uuid;
-- If you want to enforce reference to auth.users:
-- alter table accounts add constraint accounts_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id);

-- 2. RLS policies
alter table accounts enable row level security;

-- Public can select for username lookup (dev only)
create policy "accounts_public_read" on accounts
  for select using (true);

-- Authenticated users can update only their own row
create policy "accounts_update_own" on accounts
  for update using (auth.uid() = auth_user_id);

-- 3. Helpful indexes
create index if not exists idx_accounts_username on accounts(username);
create index if not exists idx_accounts_auth_user_id on accounts(auth_user_id);
create index if not exists idx_pages_user_id on pages(user_id);

-- Pages RLS
alter table pages enable row level security;
create policy "pages_owner_crud" on pages
  for all using (auth.uid() = user_id);
