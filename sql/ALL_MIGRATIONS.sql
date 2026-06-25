-- ============================================================
-- FACELESS ANIMAL WORLD — ALL MIGRATIONS (v4 - DROP ALL FKs)
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- 1. HOUSE INCOME: Update houses from 0 to 0.5 income/min
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

-- 4. DROP ALL POLICIES FROM ALL world_* TABLES
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE tablename LIKE 'world_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 5. DROP FOREIGN KEYS (these reference UUID columns)
ALTER TABLE world_player_states DROP CONSTRAINT IF EXISTS world_player_states_user_id_fkey;
ALTER TABLE world_building_states DROP CONSTRAINT IF EXISTS world_building_states_owner_id_fkey;
ALTER TABLE world_events DROP CONSTRAINT IF EXISTS world_events_player_id_fkey;
ALTER TABLE world_gangs DROP CONSTRAINT IF EXISTS world_gangs_leader_id_fkey;

-- 6. DROP PRIMARY KEYS that conflict
ALTER TABLE world_player_states DROP CONSTRAINT IF EXISTS world_player_states_pkey;

-- 7. NOW alter the column types to TEXT
ALTER TABLE world_building_states
ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;

ALTER TABLE world_player_states
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

ALTER TABLE world_gangs
ALTER COLUMN leader_id TYPE TEXT USING leader_id::TEXT;

ALTER TABLE world_events
ALTER COLUMN player_id TYPE TEXT USING player_id::TEXT;

-- 8. Allow NULL on user_id columns
ALTER TABLE world_building_states ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE world_events ALTER COLUMN player_id DROP NOT NULL;

-- 9. RECREATE PRIMARY KEY on world_player_states
ALTER TABLE world_player_states ADD PRIMARY KEY (user_id);

-- 11. PHASE A: DISTRICT DEMOGRAPHICS
ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS wealth INTEGER NOT NULL DEFAULT 0;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS building_breakdown JSONB DEFAULT '{}'::jsonb;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS population INTEGER NOT NULL DEFAULT 0;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

-- 12. GANG SYSTEM TABLES (create BEFORE policies)
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

-- 13. NOW CREATE POLICIES (tables exist)
-- world_building_states
CREATE POLICY "building_states_select" ON world_building_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "building_states_insert" ON world_building_states FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "building_states_update" ON world_building_states FOR UPDATE TO service_role USING (true);
CREATE POLICY "building_states_delete" ON world_building_states FOR DELETE TO service_role USING (true);

-- world_player_states
CREATE POLICY "player_states_select" ON world_player_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "player_states_insert" ON world_player_states FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "player_states_update" ON world_player_states FOR UPDATE TO service_role USING (true);
CREATE POLICY "player_states_delete" ON world_player_states FOR DELETE TO service_role USING (true);

-- world_gangs
CREATE POLICY "gangs_select" ON world_gangs FOR SELECT TO authenticated USING (true);
CREATE POLICY "gangs_insert" ON world_gangs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "gangs_update" ON world_gangs FOR UPDATE TO service_role USING (true);
CREATE POLICY "gangs_delete" ON world_gangs FOR DELETE TO service_role USING (true);

-- world_events
CREATE POLICY "world_events_select" ON world_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "world_events_insert" ON world_events FOR INSERT TO service_role WITH CHECK (true);

-- world_gang_members
CREATE POLICY "gm_select" ON world_gang_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "gm_insert" ON world_gang_members FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "gm_update" ON world_gang_members FOR UPDATE TO service_role USING (true);
CREATE POLICY "gm_delete" ON world_gang_members FOR DELETE TO service_role USING (true);

-- world_district_influence
CREATE POLICY "di_select" ON world_district_influence FOR SELECT TO authenticated USING (true);
CREATE POLICY "di_insert" ON world_district_influence FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "di_update" ON world_district_influence FOR UPDATE TO service_role USING (true);
CREATE POLICY "di_delete" ON world_district_influence FOR DELETE TO service_role USING (true);

-- world_npc_affiliations
CREATE POLICY "na_select" ON world_npc_affiliations FOR SELECT TO authenticated USING (true);
CREATE POLICY "na_insert" ON world_npc_affiliations FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "na_update" ON world_npc_affiliations FOR UPDATE TO service_role USING (true);
CREATE POLICY "na_delete" ON world_npc_affiliations FOR DELETE TO service_role USING (true);

-- world_gang_chat
CREATE POLICY "gc_select" ON world_gang_chat FOR SELECT TO authenticated USING (true);
CREATE POLICY "gc_insert" ON world_gang_chat FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "gc_update" ON world_gang_chat FOR UPDATE TO service_role USING (true);
CREATE POLICY "gc_delete" ON world_gang_chat FOR DELETE TO service_role USING (true);

-- world_gang_events
CREATE POLICY "ge_select" ON world_gang_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "ge_insert" ON world_gang_events FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "ge_update" ON world_gang_events FOR UPDATE TO service_role USING (true);
CREATE POLICY "ge_delete" ON world_gang_events FOR DELETE TO service_role USING (true);

-- 14. VERIFY
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'world_%'
ORDER BY table_name;
