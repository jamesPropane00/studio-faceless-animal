-- ============================================================
-- FACELESS ANIMAL WORLD — ALL SQL MIGRATIONS
-- Run these in Supabase SQL Editor in order
-- ============================================================

-- 1. HOUSE INCOME: Update houses from 0 to 0.5 income/min
-- (only if you have old houses with income_rate = 0)
UPDATE world_building_states
SET income_rate = 0.5
WHERE building_type = 'house'
  AND income_rate = 0;

-- 2. INCOME RATE TYPE: Change INTEGER to NUMERIC for decimals
ALTER TABLE world_building_states
ALTER COLUMN income_rate TYPE NUMERIC(6,2) USING income_rate::NUMERIC(6,2);

-- 3. DISTRICT UUID: Ensure pgcrypto + DEFAULT gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE world_districts
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 4. OWNER ID TEXT: For guest users
ALTER TABLE world_building_states
ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;

-- 5. PLAYER STATES USER ID TEXT
ALTER TABLE world_player_states
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- 6. GANG LEADER ID TEXT
ALTER TABLE world_gangs
ALTER COLUMN leader_id TYPE TEXT USING leader_id::TEXT;

-- 7. PHASE A: DISTRICT DEMOGRAPHICS (new columns)
ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS wealth INTEGER NOT NULL DEFAULT 0;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS building_breakdown JSONB DEFAULT '{}'::jsonb;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS population INTEGER NOT NULL DEFAULT 0;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

-- 8. GANG SYSTEM TABLES (if not already created)
-- (See sql/gang_system_schema.sql for full schema)
CREATE TABLE IF NOT EXISTS world_gangs (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  tag         TEXT NOT NULL,
  color       TEXT NOT NULL,
  leader_id   TEXT,
  coin_balance INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_gang_members (
  id        BIGSERIAL PRIMARY KEY,
  gang_id   BIGINT REFERENCES world_gangs(id) ON DELETE CASCADE,
  user_id   TEXT,
  npc_id    TEXT,
  joined_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_district_influence (
  id          BIGSERIAL PRIMARY KEY,
  district_id INTEGER,
  gang_id     BIGINT REFERENCES world_gangs(id) ON DELETE CASCADE,
  percent     INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_npc_affiliations (
  id        BIGSERIAL PRIMARY KEY,
  npc_id    TEXT,
  gang_id   BIGINT REFERENCES world_gangs(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_gang_chat (
  id        BIGSERIAL PRIMARY KEY,
  gang_id   BIGINT REFERENCES world_gangs(id) ON DELETE CASCADE,
  user_id   TEXT,
  message   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_gang_events (
  id        BIGSERIAL PRIMARY KEY,
  gang_id   BIGINT REFERENCES world_gangs(id) ON DELETE CASCADE,
  event_type TEXT,
  data      JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- VERIFY ALL TABLES EXIST
-- ============================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'world_%'
ORDER BY table_name;
