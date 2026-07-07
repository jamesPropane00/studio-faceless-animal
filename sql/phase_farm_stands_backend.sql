-- Roadside Stand backend state
-- Run this in Supabase SQL Editor before relying on cross-device stand sync.

CREATE TABLE IF NOT EXISTS world_farm_stands (
  stand_id TEXT NOT NULL,
  world_instance_id TEXT NOT NULL DEFAULT 'day-one-reset-v1',
  owner_id TEXT,
  owner_name TEXT NOT NULL DEFAULT 'Unknown Farmer',
  region_id TEXT NOT NULL DEFAULT 'farmlands',
  tile_x INTEGER NOT NULL DEFAULT 0,
  tile_y INTEGER NOT NULL DEFAULT 0,
  stock JSONB NOT NULL DEFAULT '{}'::jsonb,
  earnings INTEGER NOT NULL DEFAULT 0,
  sales JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stand_id, world_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_world_farm_stands_owner ON world_farm_stands(owner_id);
CREATE INDEX IF NOT EXISTS idx_world_farm_stands_region ON world_farm_stands(region_id, world_instance_id);

ALTER TABLE world_farm_stands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_stands_select" ON world_farm_stands;
CREATE POLICY "farm_stands_select" ON world_farm_stands
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "farm_stands_insert" ON world_farm_stands;
CREATE POLICY "farm_stands_insert" ON world_farm_stands
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "farm_stands_update" ON world_farm_stands;
CREATE POLICY "farm_stands_update" ON world_farm_stands
  FOR UPDATE TO authenticated USING (true);
