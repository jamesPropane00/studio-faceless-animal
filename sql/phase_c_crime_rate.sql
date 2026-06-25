-- Phase C: Crime & Safety
-- Districts now track crime rate (0-100)
-- Hide buildings raise crime, crime reduces business health

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS crime_rate INTEGER NOT NULL DEFAULT 0;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'world_districts'
  AND column_name = 'crime_rate';
