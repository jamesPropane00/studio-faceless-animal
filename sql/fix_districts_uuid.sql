-- Fix: Ensure pgcrypto extension is enabled and DEFAULT gen_random_uuid() is set
-- This fixes "null value in column 'id'" errors on world_districts inserts

-- Enable pgcrypto extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure DEFAULT is set on world_districts.id
ALTER TABLE world_districts
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Verify
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name = 'world_districts' AND column_name = 'id';
