-- ============================================================
-- FIX: Make world_player_states work with TEXT user_ids
-- Similar to world_building_states fix
-- ============================================================

-- Drop the primary key constraint
ALTER TABLE world_player_states DROP CONSTRAINT IF EXISTS world_player_states_pkey;

-- Drop the foreign key constraint
ALTER TABLE world_player_states DROP CONSTRAINT IF EXISTS world_player_states_user_id_fkey;

-- Change user_id from UUID to TEXT
ALTER TABLE world_player_states ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Re-add primary key
ALTER TABLE world_player_states ADD PRIMARY KEY (user_id);

-- Drop ALL existing policies to avoid conflicts
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE tablename = 'world_player_states'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Recreate policies
CREATE POLICY "player_states_select" ON world_player_states FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "player_states_insert" ON world_player_states FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "player_states_update" ON world_player_states FOR UPDATE
  TO authenticated USING (true);

-- Service role policy
CREATE POLICY "service_role_player_states" ON world_player_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);
