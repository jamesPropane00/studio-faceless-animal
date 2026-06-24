-- Update existing houses to have 0.5 income/min
-- This brings old buildings in line with the new BUILDING_TYPES config
-- Only affects house-type buildings (other types keep their existing rates)

UPDATE world_building_states
SET income_rate = 0.5
WHERE building_type = 'house'
  AND income_rate = 0;

-- Verify the update
SELECT building_type, income_rate, COUNT(*) as count
FROM world_building_states
GROUP BY building_type, income_rate
ORDER BY building_type, income_rate;
