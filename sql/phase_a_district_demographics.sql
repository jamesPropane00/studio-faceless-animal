-- Phase A: District Demographics - Add wealth tracking
-- This adds the data layer for the Sim City cascade

-- Add wealth column to districts
ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS wealth INTEGER NOT NULL DEFAULT 0;

-- Add building breakdown column (JSON: {house: 5, shop: 2, club: 1})
ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS building_breakdown JSONB DEFAULT '{}'::jsonb;

-- Add population column (estimated from building count)
ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS population INTEGER NOT NULL DEFAULT 0;

-- Add district level column (every 3 buildings = 1 level)
ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

-- Verify columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'world_districts'
ORDER BY ordinal_position;
