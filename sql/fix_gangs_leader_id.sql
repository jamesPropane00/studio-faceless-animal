-- ============================================================
-- FIX: Make world_gangs.leader_id work with TEXT user_ids
-- ============================================================

-- Step 1: Drop ALL policies on BOTH world_gangs AND world_gang_members
-- (world_gang_members has policies that reference leader_id)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE tablename IN ('world_gangs', 'world_gang_members')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Step 2: Drop the foreign key constraint
ALTER TABLE world_gangs DROP CONSTRAINT IF EXISTS world_gangs_leader_id_fkey;

-- Step 3: Change leader_id from UUID to TEXT
ALTER TABLE world_gangs ALTER COLUMN leader_id TYPE TEXT USING leader_id::TEXT;

-- Step 4: Recreate policies for world_gangs
CREATE POLICY "gangs_select" ON world_gangs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "gangs_insert" ON world_gangs FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "gangs_update" ON world_gangs FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "gangs_delete" ON world_gangs FOR DELETE
  TO authenticated USING (true);

-- Service role policy for world_gangs
CREATE POLICY "service_role_gangs" ON world_gangs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Step 5: Recreate policies for world_gang_members
CREATE POLICY "gang_members_select" ON world_gang_members FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "gang_members_insert" ON world_gang_members FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "gang_members_update" ON world_gang_members FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "gang_members_delete" ON world_gang_members FOR DELETE
  TO authenticated USING (true);

-- Service role policy for world_gang_members
CREATE POLICY "service_role_gang_members" ON world_gang_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);
