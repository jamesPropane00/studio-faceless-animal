-- ============================================================
-- FIX: Change owner_id to nullable text (no FK constraint)
-- This allows guest users and non-UUID userIds to place buildings
-- ============================================================

-- Drop the foreign key constraint
ALTER TABLE world_building_states DROP CONSTRAINT IF EXISTS world_building_states_owner_id_fkey;

-- Change the column type from UUID to TEXT
-- This is safe because:
-- 1. Existing data (if any) will be converted to text
-- 2. NULL values are preserved
-- 3. No more FK constraint violations
ALTER TABLE world_building_states ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;

-- Make sure the column allows NULL (it should already, but just in case)
ALTER TABLE world_building_states ALTER COLUMN owner_id DROP NOT NULL;

-- Same for world_events table
ALTER TABLE world_events DROP CONSTRAINT IF EXISTS world_events_player_id_fkey;
ALTER TABLE world_events ALTER COLUMN player_id TYPE TEXT USING player_id::TEXT;
ALTER TABLE world_events ALTER COLUMN player_id DROP NOT NULL;

-- Same for world_player_states (in case there are issues there too)
ALTER TABLE world_player_states DROP CONSTRAINT IF EXISTS world_player_states_user_id_fkey;
ALTER TABLE world_player_states ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Verify the changes
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('world_building_states', 'world_events', 'world_player_states')
  AND column_name IN ('owner_id', 'player_id', 'user_id')
ORDER BY table_name, column_name;
