-- Phase 5A: Resource Simulation
-- Buildings have status lifecycle (active → struggling → closing → closed)
-- Income is accumulated via pending_income from simulation ticks

ALTER TABLE world_building_states
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE world_building_states
ADD COLUMN IF NOT EXISTS pending_income NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'world_building_states'
  AND column_name IN ('status', 'pending_income');
