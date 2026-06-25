-- ============================================================
-- FACELESS ANIMAL STUDIOS — THE WORLD (CONSOLIDATED)
-- sql/world_schema_consolidated.sql
--
-- Run this SINGLE file in the Supabase SQL Editor to create
-- all tables needed for the multiplayer world simulation.
-- This replaces world_schema.sql and world_game_schema.sql.
--
-- TABLES:
--   world_players         — Player profiles (username, display, position)
--   world_player_states   — Player game state (coins, reputation, job)
--   world_properties      — Owned land/buildings
--   world_businesses      — Player-owned businesses
--   world_gangs           — Gang/clan data
--   world_gang_members    — Gang membership
--   world_events          — God-power events log
--   world_chat_log        — Chat message history
--   world_buildings       — Server-side building state (server.js sim)
--   world_building_states — Persistent building state (Cloudflare functions)
--   world_districts       — Auto-generated districts
-- ============================================================

-- ── PLAYER PROFILES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_players (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT NOT NULL,
  display_name  TEXT,
  coins         INTEGER NOT NULL DEFAULT 100,
  reputation    INTEGER NOT NULL DEFAULT 0,
  gang_id       UUID,
  last_x        REAL NOT NULL DEFAULT 104.0,
  last_y        REAL NOT NULL DEFAULT 104.0,
  total_playtime INTEGER NOT NULL DEFAULT 0,
  god_level     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PLAYER GAME STATE ────────────────────────────────────────
-- Tracks coins, reputation, and job status for Cloudflare Functions.
CREATE TABLE IF NOT EXISTS world_player_states (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coins           INTEGER NOT NULL DEFAULT 100,
  reputation      INTEGER NOT NULL DEFAULT 0,
  current_job_id  INTEGER,
  job_started_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PROPERTY / LAND OWNERSHIP ────────────────────────────────
CREATE TABLE IF NOT EXISTS world_properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES world_players(id) ON DELETE CASCADE,
  tile_x        INTEGER NOT NULL,
  tile_y        INTEGER NOT NULL,
  width         INTEGER NOT NULL DEFAULT 1,
  height        INTEGER NOT NULL DEFAULT 1,
  property_type TEXT NOT NULL DEFAULT 'land',
  name          TEXT,
  price_paid    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tile_x, tile_y)
);

-- ── BUSINESSES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_businesses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES world_players(id) ON DELETE CASCADE,
  property_id   UUID REFERENCES world_properties(id) ON DELETE SET NULL,
  biz_type      TEXT NOT NULL DEFAULT 'shop',
  name          TEXT NOT NULL,
  description   TEXT,
  level         INTEGER NOT NULL DEFAULT 1,
  income_rate   INTEGER NOT NULL DEFAULT 1,
  is_legal      BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GANGS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_gangs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  leader_id     UUID NOT NULL REFERENCES world_players(id),
  tag           TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#a78bfa',
  territory_x   INTEGER,
  territory_y   INTEGER,
  territory_r   INTEGER DEFAULT 0,
  coins         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_gang' AND conrelid = 'world_players'::regclass
  ) THEN
    ALTER TABLE world_players ADD CONSTRAINT fk_gang
      FOREIGN KEY (gang_id) REFERENCES world_gangs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS world_gang_members (
  gang_id   UUID NOT NULL REFERENCES world_gangs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES world_players(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gang_id, player_id)
);

-- ── GOD POWER EVENTS LOG ─────────────────────────────────────
-- UUID PK used by both server.js and Cloudflare Functions.
CREATE TABLE IF NOT EXISTS world_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID REFERENCES world_players(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  tile_x      INTEGER,
  tile_y      INTEGER,
  radius      INTEGER DEFAULT 0,
  cost        INTEGER NOT NULL DEFAULT 0,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── CHAT LOG ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_chat_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID REFERENCES world_players(id) ON DELETE SET NULL,
  username   TEXT NOT NULL,
  message    TEXT NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'world',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── BUILDINGS (server.js in-memory simulation) ───────────────
CREATE TABLE IF NOT EXISTS world_buildings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID REFERENCES world_players(id) ON DELETE SET NULL,
  building_type TEXT NOT NULL,
  tile_x        INTEGER NOT NULL,
  tile_y        INTEGER NOT NULL,
  condition     INTEGER NOT NULL DEFAULT 100,
  income_rate   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_collected TIMESTAMPTZ,
  UNIQUE(tile_x, tile_y)
);

-- ── BUILDING STATES (Cloudflare Functions persistent state) ──
CREATE TABLE IF NOT EXISTS world_building_states (
  id               INTEGER PRIMARY KEY,
  owner_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  building_type    TEXT NOT NULL,
  tile_x           INTEGER NOT NULL,
  tile_y           INTEGER NOT NULL,
  condition        INTEGER NOT NULL DEFAULT 100,
  income_rate      INTEGER NOT NULL DEFAULT 0,
  last_collected_at TIMESTAMPTZ,
  in_district      BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(tile_x, tile_y)
);

-- ── DISTRICTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_districts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  district_type TEXT NOT NULL,
  center_x      INTEGER NOT NULL,
  center_y      INTEGER NOT NULL,
  radius        INTEGER NOT NULL DEFAULT 10,
  building_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_world_players_username ON world_players(username);
CREATE INDEX IF NOT EXISTS idx_world_properties_owner ON world_properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_world_properties_pos ON world_properties(tile_x, tile_y);
CREATE INDEX IF NOT EXISTS idx_world_businesses_owner ON world_businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_world_events_time ON world_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_world_events_type ON world_events(event_type);
CREATE INDEX IF NOT EXISTS idx_world_chat_time ON world_chat_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_world_buildings_pos ON world_buildings(tile_x, tile_y);
CREATE INDEX IF NOT EXISTS idx_world_buildings_owner ON world_buildings(owner_id);
CREATE INDEX IF NOT EXISTS idx_world_building_states_pos ON world_building_states(tile_x, tile_y);
CREATE INDEX IF NOT EXISTS idx_world_building_states_owner ON world_building_states(owner_id);
CREATE INDEX IF NOT EXISTS idx_world_districts_pos ON world_districts(center_x, center_y);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE world_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_player_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_gangs ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_gang_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_chat_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_building_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_districts ENABLE ROW LEVEL SECURITY;

-- Players: anyone authenticated can read, only own row writable
DROP POLICY IF EXISTS "players_select" ON world_players;
CREATE POLICY "players_select" ON world_players FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "players_insert" ON world_players;
CREATE POLICY "players_insert" ON world_players FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "players_update" ON world_players;
CREATE POLICY "players_update" ON world_players FOR UPDATE
  TO authenticated USING (auth.uid() = id);

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

-- Properties: anyone can read, only owner can modify
DROP POLICY IF EXISTS "props_select" ON world_properties;
CREATE POLICY "props_select" ON world_properties FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "props_insert" ON world_properties;
CREATE POLICY "props_insert" ON world_properties FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "props_delete" ON world_properties;
CREATE POLICY "props_delete" ON world_properties FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

-- Businesses: anyone can read, only owner can modify
DROP POLICY IF EXISTS "biz_select" ON world_businesses;
CREATE POLICY "biz_select" ON world_businesses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "biz_insert" ON world_businesses;
CREATE POLICY "biz_insert" ON world_businesses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "biz_update" ON world_businesses;
CREATE POLICY "biz_update" ON world_businesses FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id);

-- Gangs: anyone can read, leader can modify
DROP POLICY IF EXISTS "gangs_select" ON world_gangs;
CREATE POLICY "gangs_select" ON world_gangs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "gangs_insert" ON world_gangs;
CREATE POLICY "gangs_insert" ON world_gangs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = leader_id);

DROP POLICY IF EXISTS "gangs_update" ON world_gangs;
CREATE POLICY "gangs_update" ON world_gangs FOR UPDATE
  TO authenticated USING (auth.uid() = leader_id);

-- Gang members: anyone can read, gang leader can modify
DROP POLICY IF EXISTS "gm_select" ON world_gang_members;
CREATE POLICY "gm_select" ON world_gang_members FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "gm_insert" ON world_gang_members;
CREATE POLICY "gm_insert" ON world_gang_members FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = player_id
    OR auth.uid() = (SELECT leader_id FROM world_gangs WHERE id = gang_id)
  );

DROP POLICY IF EXISTS "gm_delete" ON world_gang_members;
CREATE POLICY "gm_delete" ON world_gang_members FOR DELETE
  TO authenticated USING (
    auth.uid() = player_id
    OR auth.uid() = (SELECT leader_id FROM world_gangs WHERE id = gang_id)
  );

-- Events: anyone can read, authenticated can insert (spend coins)
DROP POLICY IF EXISTS "events_select" ON world_events;
CREATE POLICY "events_select" ON world_events FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "events_insert" ON world_events;
CREATE POLICY "events_insert" ON world_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- Chat: anyone can read and insert
DROP POLICY IF EXISTS "chat_select" ON world_chat_log;
CREATE POLICY "chat_select" ON world_chat_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "chat_insert" ON world_chat_log;
CREATE POLICY "chat_insert" ON world_chat_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- Buildings: anyone can read, authenticated can insert, owner can update/delete
DROP POLICY IF EXISTS "buildings_select" ON world_buildings;
CREATE POLICY "buildings_select" ON world_buildings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "buildings_insert" ON world_buildings;
CREATE POLICY "buildings_insert" ON world_buildings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id OR owner_id IS NULL);

DROP POLICY IF EXISTS "buildings_update" ON world_buildings;
CREATE POLICY "buildings_update" ON world_buildings FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id OR owner_id IS NULL);

DROP POLICY IF EXISTS "buildings_delete" ON world_buildings;
CREATE POLICY "buildings_delete" ON world_buildings FOR DELETE
  TO authenticated USING (auth.uid() = owner_id OR owner_id IS NULL);

-- Building states (Cloudflare Functions): anyone can read, authenticated can insert, owner can modify
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

-- Districts: anyone can read, server-only write (service role)
DROP POLICY IF EXISTS "districts_select" ON world_districts;
CREATE POLICY "districts_select" ON world_districts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "districts_insert" ON world_districts;
CREATE POLICY "districts_insert" ON world_districts FOR INSERT
  TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "districts_update" ON world_districts;
CREATE POLICY "districts_update" ON world_districts FOR UPDATE
  TO service_role USING (true);

DROP POLICY IF EXISTS "districts_delete" ON world_districts;
CREATE POLICY "districts_delete" ON world_districts FOR DELETE
  TO service_role USING (true);

-- ── SERVICE ROLE ACCESS ──────────────────────────────────────
-- These policies allow the service role (Cloudflare Functions) to manage all data.
DROP POLICY IF EXISTS "service_role_player_states" ON world_player_states;
CREATE POLICY "service_role_player_states" ON world_player_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_building_states" ON world_building_states;
CREATE POLICY "service_role_building_states" ON world_building_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_world_events" ON world_events;
CREATE POLICY "service_role_world_events" ON world_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_world_buildings" ON world_buildings;
CREATE POLICY "service_role_world_buildings" ON world_buildings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_world_players" ON world_players;
CREATE POLICY "service_role_world_players" ON world_players
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_world_districts" ON world_districts;
CREATE POLICY "service_role_world_districts" ON world_districts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── AUTO-CREATE PLAYER PROFILE ON SIGNUP ─────────────────────
CREATE OR REPLACE FUNCTION handle_new_world_player()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO world_players (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO world_player_states (user_id, coins, reputation)
  VALUES (NEW.id, 100, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_world ON auth.users;
CREATE TRIGGER on_auth_user_created_world
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_world_player();
