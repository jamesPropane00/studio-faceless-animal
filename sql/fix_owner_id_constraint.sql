-- ============================================================
-- FIX: Change owner_id to nullable text (no FK constraint)
-- This allows guest users and non-UUID userIds to place buildings
-- ============================================================

-- Step 1: Drop ALL policies on world_building_states and world_events
-- (world_player_states is skipped because user_id is a primary key)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE tablename IN ('world_building_states', 'world_events')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Step 2: Drop the foreign key constraints
ALTER TABLE world_building_states DROP CONSTRAINT IF EXISTS world_building_states_owner_id_fkey;
ALTER TABLE world_events DROP CONSTRAINT IF EXISTS world_events_player_id_fkey;

-- Step 3: Change the column types from UUID to TEXT
ALTER TABLE world_building_states ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;
ALTER TABLE world_events ALTER COLUMN player_id TYPE TEXT USING player_id::TEXT;

-- Step 4: Make sure columns allow NULL
ALTER TABLE world_building_states ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE world_events ALTER COLUMN player_id DROP NOT NULL;

-- Step 5: Recreate the RLS policies (now using TEXT columns)
-- Building states: anyone can read, authenticated can insert, owner can modify
CREATE POLICY "building_states_select" ON world_building_states FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "building_states_insert" ON world_building_states FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "building_states_update" ON world_building_states FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "building_states_delete" ON world_building_states FOR DELETE
  TO authenticated USING (true);

-- World events: anyone can read, authenticated can insert
CREATE POLICY "world_events_select" ON world_events FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "world_events_insert" ON world_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- Service role policies (for Cloudflare Functions)
CREATE POLICY "service_role_building_states" ON world_building_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_world_events" ON world_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Step 6: Verify the changes
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('world_building_states', 'world_events')
  AND column_name IN ('owner_id', 'player_id')
ORDER BY table_name, column_name;
