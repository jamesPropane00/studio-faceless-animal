-- CJ supplier identifiers and private TikTok Shop listing drafts.
alter table public.product_sources
  add column if not exists supplier_variant_id text,
  add column if not exists supplier_sku text,
  add column if not exists supplier_warehouse_id text;

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  marketplace text not null default 'tiktok_shop',
  status text not null default 'draft',
  external_product_id text,
  category_id text,
  warehouse_id text,
  brand_name text not null default 'No brand',
  country_of_origin text,
  package_weight_grams integer,
  package_length_cm numeric(8,2),
  package_width_cm numeric(8,2),
  package_height_cm numeric(8,2),
  compliance_confirmed_at timestamptz,
  last_error text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, marketplace),
  check (marketplace in ('tiktok_shop')),
  check (status in ('draft','ready','submitted','live','rejected','disabled')),
  check (package_weight_grams is null or package_weight_grams between 1 and 100000),
  check (package_length_cm is null or package_length_cm between 0.1 and 500),
  check (package_width_cm is null or package_width_cm between 0.1 and 500),
  check (package_height_cm is null or package_height_cm between 0.1 and 500)
);

create index if not exists marketplace_listings_status_idx
  on public.marketplace_listings(marketplace, status, updated_at desc);

drop trigger if exists marketplace_listings_updated on public.marketplace_listings;
create trigger marketplace_listings_updated
  before update on public.marketplace_listings
  for each row execute function public.set_updated_at();

alter table public.marketplace_listings enable row level security;
revoke all on public.marketplace_listings from public, anon, authenticated;

comment on table public.marketplace_listings is
  'Private marketplace preparation and synchronization state. Only service-role shop admin functions may access it.';
