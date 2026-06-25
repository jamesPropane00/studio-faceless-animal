-- Phase 6: Urban DNA — Development Blocks
-- Prototype layer alongside existing building system

CREATE TABLE IF NOT EXISTS world_blocks (
  id BIGSERIAL PRIMARY KEY,
  block_type TEXT NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  owner_id TEXT,
  district_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS world_block_lots (
  id BIGSERIAL PRIMARY KEY,
  block_id BIGINT NOT NULL REFERENCES world_blocks(id) ON DELETE CASCADE,
  lot_index INTEGER NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  lot_type TEXT NOT NULL,
  occupied_building_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_block_lots_block ON world_block_lots(block_id);
