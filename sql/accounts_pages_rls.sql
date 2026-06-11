-- PART B: SQL OUTPUT

-- 1. accounts table fixes
create unique index if not exists idx_accounts_username on accounts(username);
create unique index if not exists idx_accounts_internal_email on accounts(internal_email) where internal_email is not null;
create index if not exists idx_accounts_auth_user_id on accounts(auth_user_id);

-- 2. pages table ownership
-- Ensure pages.user_id references auth.users(id)
-- (If not already set, run:)
-- alter table pages add column user_id uuid;
-- alter table pages add constraint pages_user_id_fkey foreign key (user_id) references auth.users(id);
create index if not exists idx_pages_user_id on pages(user_id);

-- 3. RLS policies
alter table accounts enable row level security;
create policy "accounts_public_read" on accounts for select using (true);
create policy "accounts_update_own" on accounts for update using (auth.uid() = auth_user_id);

alter table pages enable row level security;
create policy "pages_owner_crud" on pages for all using (auth.uid() = user_id);
