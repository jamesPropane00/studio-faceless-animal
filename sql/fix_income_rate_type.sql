-- Migration: Change income_rate from INTEGER to NUMERIC
-- This allows decimal values like 0.5 (house) and 1.2 (district bonus)
-- INTEGER was rejecting "0.5" with "invalid input syntax for type integer"

ALTER TABLE world_building_states
ALTER COLUMN income_rate TYPE NUMERIC(6,2) USING income_rate::NUMERIC(6,2);

-- Verify the change
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'world_building_states'
  AND column_name = 'income_rate';
