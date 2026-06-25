-- Phase B: Business Health - makes the cascade affect income
-- Buildings now have health (0-100) that affects their income

ALTER TABLE world_building_states
ADD COLUMN IF NOT EXISTS business_health INTEGER NOT NULL DEFAULT 100;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'world_building_states'
  AND column_name = 'business_health';
