-- Editable Neon Dreams Club character galleries.
create table if not exists public.neon_dreams_characters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  subtitle text,
  description text,
  accent_color text not null default '#ec4899',
  cover_url text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.neon_dreams_media (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.neon_dreams_characters(id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  title text,
  caption text,
  public_url text not null,
  storage_path text not null unique,
  poster_url text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists neon_dreams_characters_order_idx
  on public.neon_dreams_characters(published,sort_order,created_at);
create index if not exists neon_dreams_media_character_idx
  on public.neon_dreams_media(character_id,published,sort_order,created_at);

alter table public.neon_dreams_characters enable row level security;
alter table public.neon_dreams_media enable row level security;

drop policy if exists "public reads published neon characters" on public.neon_dreams_characters;
create policy "public reads published neon characters" on public.neon_dreams_characters
  for select to anon,authenticated using (published = true);

drop policy if exists "public reads published neon media" on public.neon_dreams_media;
create policy "public reads published neon media" on public.neon_dreams_media
  for select to anon,authenticated using (published = true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'neon-dreams-media','neon-dreams-media',true,104857600,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime']
)
on conflict(id) do update set public=true,file_size_limit=104857600;

drop policy if exists "public reads neon dreams media" on storage.objects;
create policy "public reads neon dreams media" on storage.objects
  for select to public using (bucket_id='neon-dreams-media');

