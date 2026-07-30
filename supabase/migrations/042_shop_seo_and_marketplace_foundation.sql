-- Search visibility and future marketplace connector foundation.
create extension if not exists pg_trgm;

alter table public.products
  add column if not exists slug text,
  add column if not exists seo_title text,
  add column if not exists meta_description text,
  add column if not exists search_keywords text[] not null default '{}',
  add column if not exists brand text not null default 'Faceless Animal Studios',
  add column if not exists gtin text,
  add column if not exists mpn text,
  add column if not exists google_product_category text,
  add column if not exists ebay_category_id text,
  add column if not exists facebook_category text,
  add column if not exists marketplace_ready boolean not null default false;

update public.products
set slug = trim(both '-' from lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')))
  || '-' || lower(substr(replace(id::text, '-', ''), 1, 8))
where slug is null or trim(slug) = '';

alter table public.products alter column slug set not null;

alter table public.products drop constraint if exists products_slug_format;
alter table public.products add constraint products_slug_format
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) between 2 and 180);

alter table public.products drop constraint if exists products_seo_title_length;
alter table public.products add constraint products_seo_title_length
  check (seo_title is null or length(seo_title) <= 70);

alter table public.products drop constraint if exists products_meta_description_length;
alter table public.products add constraint products_meta_description_length
  check (meta_description is null or length(meta_description) <= 320);

create unique index if not exists products_slug_key on public.products(slug);
create index if not exists products_keywords_idx on public.products using gin(search_keywords);
create index if not exists products_title_trgm_idx
  on public.products using gin(lower(title) gin_trgm_ops);
create index if not exists products_search_document_idx on public.products using gin(
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(category, '') || ' ' ||
    coalesce(brand, '')
  )
);

create table if not exists public.product_marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  channel text not null check (channel in ('ebay', 'facebook_marketplace')),
  external_listing_id text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'published', 'paused', 'ended', 'error')),
  listing_url text,
  sync_payload jsonb not null default '{}'::jsonb,
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, channel)
);

create index if not exists product_marketplace_channel_status_idx
  on public.product_marketplace_listings(channel, status, updated_at desc);

alter table public.product_marketplace_listings enable row level security;
revoke all on public.product_marketplace_listings from public, anon, authenticated;

drop trigger if exists product_marketplace_listings_updated
  on public.product_marketplace_listings;
create trigger product_marketplace_listings_updated
  before update on public.product_marketplace_listings
  for each row execute function public.set_updated_at();
