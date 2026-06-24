-- ============================================================
-- WORLD GAME SCHEMA
-- Run this in Supabase SQL Editor to create the world game tables
-- ============================================================

-- ── PLAYER STATES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_player_states (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coins INTEGER NOT NULL DEFAULT 100,
  reputation INTEGER NOT NULL DEFAULT 0,
  current_job_id INTEGER,
  job_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── BUILDING STATES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_building_states (
  id INTEGER PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  building_type TEXT NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  condition INTEGER NOT NULL DEFAULT 100,
  income_rate INTEGER NOT NULL DEFAULT 0,
  last_collected_at TIMESTAMPTZ,
  in_district BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(tile_x, tile_y)
);

-- ── WORLD EVENTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_events (
  id BIGINT PRIMARY KEY,
  event_type TEXT NOT NULL,
  player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tile_x INTEGER,
  tile_y INTEGER,
  radius INTEGER DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_world_building_pos ON world_building_states(tile_x, tile_y);
CREATE INDEX IF NOT EXISTS idx_world_building_owner ON world_building_states(owner_id);
CREATE INDEX IF NOT EXISTS idx_world_events_time ON world_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_world_events_type ON world_events(event_type);

-- ── ROW LEVEL SECURITY ─────────────────────────────────────
ALTER TABLE world_player_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_building_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_events ENABLE ROW LEVEL SECURITY;

-- Player states: anyone authenticated can read, only own row writable
DROP POLICY IF EXISTS "player_states_select" ON world_player_states;
CREATE POLICY "player_states_select" ON world_player_states FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "player_states_insert" ON world_player_states;
CREATE POLICY "player_states_insert" ON world_player_states FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "player_states_update" ON world_player_states;
CREATE POLICY "player_states_update" ON world_player_states FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

-- Building states: anyone can read, authenticated can insert, owner can modify
DROP POLICY IF EXISTS "building_states_select" ON world_building_states;
CREATE POLICY "building_states_select" ON world_building_states FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "building_states_insert" ON world_building_states;
CREATE POLICY "building_states_insert" ON world_building_states FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id OR owner_id IS NULL);

DROP POLICY IF EXISTS "building_states_update" ON world_building_states;
CREATE POLICY "building_states_update" ON world_building_states FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id OR owner_id IS NULL);

DROP POLICY IF EXISTS "building_states_delete" ON world_building_states;
CREATE POLICY "building_states_delete" ON world_building_states FOR DELETE
  TO authenticated USING (auth.uid() = owner_id OR owner_id IS NULL);

-- World events: anyone can read, authenticated can insert
DROP POLICY IF EXISTS "world_events_select" ON world_events;
CREATE POLICY "world_events_select" ON world_events FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "world_events_insert" ON world_events;
CREATE POLICY "world_events_insert" ON world_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── AUTO-CREATE PLAYER STATE ON SIGNUP ─────────────────────
CREATE OR REPLACE FUNCTION handle_new_world_player_state()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO world_player_states (user_id, coins, reputation)
  VALUES (NEW.id, 100, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_world_state ON auth.users;
CREATE TRIGGER on_auth_user_created_world_state
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_world_player_state();

-- ── SERVICE ROLE ACCESS ────────────────────────────────────
-- These policies allow the service role (Cloudflare Functions) to manage all data
DROP POLICY IF EXISTS "service_role_player_states" ON world_player_states;
CREATE POLICY "service_role_player_states" ON world_player_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_building_states" ON world_building_states;
CREATE POLICY "service_role_building_states" ON world_building_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_world_events" ON world_events;
CREATE POLICY "service_role_world_events" ON world_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
