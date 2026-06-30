-- Region isolation for The World.
-- Existing records are city content. New farm/world records must carry region_id.

alter table if exists public.world_building_states
  add column if not exists region_id text not null default 'city';

alter table if exists public.world_districts
  add column if not exists region_id text not null default 'city';

alter table if exists public.world_infrastructure
  add column if not exists region_id text not null default 'city';

alter table if exists public.world_blocks
  add column if not exists region_id text not null default 'city';

alter table if exists public.world_block_lots
  add column if not exists region_id text not null default 'city';

update public.world_building_states set region_id = 'city' where region_id is null or region_id = '';
update public.world_districts set region_id = 'city' where region_id is null or region_id = '';
update public.world_infrastructure set region_id = 'city' where region_id is null or region_id = '';
update public.world_blocks set region_id = 'city' where region_id is null or region_id = '';
update public.world_block_lots set region_id = 'city' where region_id is null or region_id = '';

create index if not exists world_building_states_region_xy_idx
  on public.world_building_states (region_id, tile_x, tile_y);

create index if not exists world_districts_region_idx
  on public.world_districts (region_id);

create index if not exists world_infrastructure_region_xy_idx
  on public.world_infrastructure (region_id, tile_x, tile_y);

create index if not exists world_blocks_region_xy_idx
  on public.world_blocks (region_id, tile_x, tile_y);

create index if not exists world_block_lots_region_idx
  on public.world_block_lots (region_id);

notify pgrst, 'reload schema';
