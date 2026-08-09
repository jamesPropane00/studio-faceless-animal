-- Underground Market phase one: approved seller accounts, private seller
-- intake, and buyer requests.
-- Nothing in these tables is a public listing or a payable product until an
-- administrator reviews and deliberately converts it in a later workflow.

create table if not exists public.market_seller_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_code text not null unique default (
    'UXS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  username text not null unique references public.member_accounts(username) on delete restrict,
  seller_handle text not null unique
    check (seller_handle ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended','closed')),
  account_type text not null default 'individual'
    check (account_type in ('individual','business')),
  legal_name text not null check (length(legal_name) between 2 and 160),
  business_name text check (business_name is null or length(business_name) <= 180),
  date_of_birth date not null,
  contact_email text not null check (length(contact_email) between 5 and 254),
  contact_phone text not null check (length(contact_phone) between 7 and 40),
  address_line1 text not null check (length(address_line1) between 3 and 180),
  address_line2 text check (address_line2 is null or length(address_line2) <= 180),
  city text not null check (length(city) between 2 and 100),
  region text not null check (length(region) between 2 and 80),
  postal_code text not null check (postal_code ~ '^[0-9]{5}(?:-[0-9]{4})?$'),
  country_code text not null default 'US' check (country_code = 'US'),
  identity_status text not null default 'not_started'
    check (identity_status in ('not_started','pending','verified','failed')),
  payout_status text not null default 'not_connected'
    check (payout_status in ('not_connected','pending','connected','restricted')),
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  information_certified_at timestamptz not null,
  reviewed_by text references public.member_accounts(username) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_of_birth <= (current_date - interval '18 years')::date)
);

create table if not exists public.market_sell_submissions (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default (
    'SELL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  seller_account_id uuid not null references public.market_seller_accounts(id) on delete restrict,
  status text not null default 'new'
    check (status in ('new','reviewing','needs_info','accepted','declined','converted')),
  selling_mode text not null
    check (selling_mode in ('list_it','listing_help','sell_fast')),
  item_name text not null check (length(item_name) between 2 and 180),
  category text not null check (length(category) between 2 and 100),
  item_condition text not null check (length(item_condition) between 2 and 80),
  item_size text check (item_size is null or length(item_size) <= 80),
  description text check (description is null or length(description) <= 4000),
  desired_price_cents integer check (desired_price_cents is null or desired_price_cents between 0 and 100000000),
  zip_code text not null check (zip_code ~ '^[0-9]{5}(?:-[0-9]{4})?$'),
  contact_name text not null check (length(contact_name) between 2 and 120),
  contact_email text not null check (length(contact_email) between 5 and 254),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  submitted_by_username text check (submitted_by_username is null or length(submitted_by_username) <= 40),
  request_fingerprint text not null,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_sell_images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.market_sell_submissions(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  sort_order smallint not null default 0 check (sort_order between 0 and 4),
  created_at timestamptz not null default now()
);

create table if not exists public.market_buyer_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default (
    'WANT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  status text not null default 'new'
    check (status in ('new','open','matched','fulfilled','closed','rejected')),
  product_name text not null check (length(product_name) between 2 and 180),
  description text check (description is null or length(description) <= 4000),
  maximum_budget_cents integer not null check (maximum_budget_cents between 1 and 100000000),
  condition_preference text not null
    check (condition_preference in ('new','used','either')),
  fulfillment_preference text not null
    check (fulfillment_preference in ('local','shipping','either')),
  zip_code text not null check (zip_code ~ '^[0-9]{5}(?:-[0-9]{4})?$'),
  contact_name text not null check (length(contact_name) between 2 and 120),
  contact_email text not null check (length(contact_email) between 5 and 254),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  submitted_by_username text check (submitted_by_username is null or length(submitted_by_username) <= 40),
  request_fingerprint text not null,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_sell_status_created_idx
  on public.market_sell_submissions(status, created_at desc);
create index if not exists market_sell_category_zip_idx
  on public.market_sell_submissions(category, zip_code);
create index if not exists market_sell_fingerprint_created_idx
  on public.market_sell_submissions(request_fingerprint, created_at desc);
create index if not exists market_sell_images_submission_idx
  on public.market_sell_images(submission_id, sort_order);
create index if not exists market_buyer_status_created_idx
  on public.market_buyer_requests(status, created_at desc);
create index if not exists market_buyer_zip_budget_idx
  on public.market_buyer_requests(zip_code, maximum_budget_cents);
create index if not exists market_buyer_fingerprint_created_idx
  on public.market_buyer_requests(request_fingerprint, created_at desc);
create index if not exists market_seller_status_created_idx
  on public.market_seller_accounts(status, created_at desc);
create index if not exists market_seller_postal_idx
  on public.market_seller_accounts(postal_code);

drop trigger if exists market_seller_accounts_updated on public.market_seller_accounts;
create trigger market_seller_accounts_updated before update on public.market_seller_accounts
  for each row execute function public.set_updated_at();
drop trigger if exists market_sell_submissions_updated on public.market_sell_submissions;
create trigger market_sell_submissions_updated before update on public.market_sell_submissions
  for each row execute function public.set_updated_at();
drop trigger if exists market_buyer_requests_updated on public.market_buyer_requests;
create trigger market_buyer_requests_updated before update on public.market_buyer_requests
  for each row execute function public.set_updated_at();

alter table public.market_seller_accounts enable row level security;
alter table public.market_sell_submissions enable row level security;
alter table public.market_sell_images enable row level security;
alter table public.market_buyer_requests enable row level security;

revoke all on public.market_seller_accounts from public, anon, authenticated;
revoke all on public.market_sell_submissions from public, anon, authenticated;
revoke all on public.market_sell_images from public, anon, authenticated;
revoke all on public.market_buyer_requests from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'market-intake', 'market-intake', false, 8388608,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated storage policies are created. Only backend code using
-- the service role may write or read these private, unreviewed customer images.
