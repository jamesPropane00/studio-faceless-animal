-- RouteDrop starter schema. Review and test all RLS policies before production.
create extension if not exists pgcrypto;
create extension if not exists postgis;

create type public.user_role as enum ('sender','runner','business','admin');
create type public.request_status as enum ('draft','posted','offers_received','runner_selected','payment_authorized','pickup_ready','picked_up','in_transit','delivered','completed','cancelled','expired','disputed','moderation_hold');
create type public.document_status as enum ('uploaded','under_review','verified_by_vendor','expired','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'sender',
  display_name text not null,
  phone_verified boolean not null default false,
  trust_score numeric(5,2) not null default 0,
  account_status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'US',
  state_code text not null,
  market_code text not null unique,
  enabled boolean not null default false,
  intrastate_only boolean not null default true,
  max_weight_lb numeric not null default 50,
  max_declared_value numeric not null default 300,
  payments_enabled boolean not null default false,
  legal_reviewed_at timestamptz,
  insurance_reviewed_at timestamptz,
  config jsonb not null default '{}'::jsonb
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  year integer,
  make text,
  model text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.runner_routes (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id),
  origin geography(point,4326) not null,
  destination geography(point,4326) not null,
  route_geojson jsonb,
  depart_after timestamptz not null,
  arrive_before timestamptz,
  max_detour_minutes integer not null default 10,
  recurring_rule text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id),
  jurisdiction_id uuid not null references public.jurisdictions(id),
  title text not null,
  category text not null,
  description text,
  pickup geography(point,4326) not null,
  dropoff geography(point,4326) not null,
  pickup_public_area text not null,
  dropoff_public_area text not null,
  pickup_after timestamptz not null,
  deliver_before timestamptz not null,
  weight_lb numeric,
  declared_value numeric,
  offered_amount numeric,
  status public.request_status not null default 'draft',
  restricted_declaration boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.delivery_requests(id) on delete cascade,
  runner_id uuid not null references public.profiles(id),
  amount numeric not null check (amount >= 0),
  note text,
  estimated_pickup timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(request_id, runner_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.delivery_requests(id),
  offer_id uuid not null unique references public.offers(id),
  sender_id uuid not null references public.profiles(id),
  runner_id uuid not null references public.profiles(id),
  pickup_pin_hash text,
  delivery_pin_hash text,
  status public.request_status not null default 'runner_selected',
  picked_up_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  status public.document_status not null default 'uploaded',
  expires_at date,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.runner_routes enable row level security;
alter table public.delivery_requests enable row level security;
alter table public.offers enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.documents enable row level security;

create policy "profile self read" on public.profiles for select using (auth.uid() = id);
create policy "profile self update" on public.profiles for update using (auth.uid() = id);
create policy "sender owns requests" on public.delivery_requests for all using (auth.uid() = sender_id) with check (auth.uid() = sender_id);
create policy "runner owns routes" on public.runner_routes for all using (auth.uid() = runner_id) with check (auth.uid() = runner_id);
create policy "runner owns offers" on public.offers for insert with check (auth.uid() = runner_id);
create policy "offer participants read" on public.offers for select using (
  auth.uid() = runner_id or exists(select 1 from public.delivery_requests r where r.id=request_id and r.sender_id=auth.uid())
);
create policy "job participants read" on public.jobs for select using (auth.uid() = sender_id or auth.uid() = runner_id);
create policy "event participants read" on public.job_events for select using (
  exists(select 1 from public.jobs j where j.id=job_id and (j.sender_id=auth.uid() or j.runner_id=auth.uid()))
);
create policy "document owner read" on public.documents for select using (auth.uid() = owner_id);
create policy "document owner insert" on public.documents for insert with check (auth.uid() = owner_id);

-- Add server-side/admin policies and matching views through migrations, not the browser.
