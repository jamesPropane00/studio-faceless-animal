-- Resell Inventory: curated supplier-direct wholesale lots.
-- A lot points at one normal physical dropship product. Stripe checkout still
-- charges from products.price_cents and products.shipping_price_cents; private
-- supplier economics never leave the admin API.

create table if not exists public.wholesale_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','published','paused')),
  lot_name text not null check (length(trim(lot_name)) between 3 and 180),
  unit_count integer not null check (unit_count between 2 and 100000),
  lot_tier text not null
    check (lot_tier in ('starter','reseller','business','custom')),
  landed_cost_cents integer check (landed_cost_cents is null or landed_cost_cents between 1 and 100000000),
  fee_buffer_bps integer not null default 500 check (fee_buffer_bps between 0 and 3000),
  problem_buffer_cents integer not null default 0 check (problem_buffer_cents between 0 and 10000000),
  suggested_retail_min_cents integer not null check (suggested_retail_min_cents between 1 and 10000000),
  suggested_retail_max_cents integer not null check (suggested_retail_max_cents >= suggested_retail_min_cents),
  freight_status text not null default 'quote_required'
    check (freight_status in ('quote_required','pending','confirmed')),
  freight_checked_at timestamptz,
  warehouse_country text not null check (length(trim(warehouse_country)) between 2 and 80),
  public_supplier_label text not null default 'Supplier Direct'
    check (length(trim(public_supplier_label)) between 2 and 80),
  resale_channels text[] not null default '{}',
  included_resources text[] not null default '{}',
  opportunity_summary text check (opportunity_summary is null or length(opportunity_summary) <= 2000),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (freight_status = 'confirmed' and landed_cost_cents is not null))
);

create index if not exists wholesale_lots_public_idx
  on public.wholesale_lots(status, lot_tier, unit_count, updated_at desc);

drop trigger if exists wholesale_lots_updated on public.wholesale_lots;
create trigger wholesale_lots_updated before update on public.wholesale_lots
  for each row execute function public.set_updated_at();

alter table public.wholesale_lots enable row level security;
revoke all on public.wholesale_lots from public, anon, authenticated;

comment on table public.wholesale_lots is
  'Private wholesale economics and public merchandising metadata. Read through server endpoints only.';
