-- Drop policies first that depend on these columns
DROP POLICY IF EXISTS "building_states_select" ON world_building_states;
DROP POLICY IF EXISTS "building_states_insert" ON world_building_states;
DROP POLICY IF EXISTS "building_states_update" ON world_building_states;
DROP POLICY IF EXISTS "building_states_delete" ON world_building_states;

DROP POLICY IF EXISTS "player_states_select" ON world_player_states;
DROP POLICY IF EXISTS "player_states_insert" ON world_player_states;
DROP POLICY IF EXISTS "player_states_update" ON world_player_states;
DROP POLICY IF EXISTS "player_states_delete" ON world_player_states;

DROP POLICY IF EXISTS "gangs_select" ON world_gangs;
DROP POLICY IF EXISTS "gangs_insert" ON world_gangs;
DROP POLICY IF EXISTS "gangs_update" ON world_gangs;
DROP POLICY IF EXISTS "gangs_delete" ON world_gangs;

-- Now alter the column types
ALTER TABLE world_building_states
ALTER COLUMN owner_id TYPE TEXT USING owner_id::TEXT;

ALTER TABLE world_player_states
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

ALTER TABLE world_gangs
ALTER COLUMN leader_id TYPE TEXT USING leader_id::TEXT;

-- Recreate policies
CREATE POLICY "building_states_select" ON world_building_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "building_states_insert" ON world_building_states FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "building_states_update" ON world_building_states FOR UPDATE TO service_role USING (true);
CREATE POLICY "building_states_delete" ON world_building_states FOR DELETE TO service_role USING (true);

CREATE POLICY "player_states_select" ON world_player_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "player_states_insert" ON world_player_states FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "player_states_update" ON world_player_states FOR UPDATE TO service_role USING (true);
CREATE POLICY "player_states_delete" ON world_player_states FOR DELETE TO service_role USING (true);

CREATE POLICY "gangs_select" ON world_gangs FOR SELECT TO authenticated USING (true);
CREATE POLICY "gangs_insert" ON world_gangs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "gangs_update" ON world_gangs FOR UPDATE TO service_role USING (true);
CREATE POLICY "gangs_delete" ON world_gangs FOR DELETE TO service_role USING (true);
