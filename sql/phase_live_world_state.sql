-- Generic live save records for systems migrating away from localStorage.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS world_live_states (
  user_id TEXT NOT NULL,
  world_instance_id TEXT NOT NULL DEFAULT 'day-one-reset-v1',
  state_key TEXT NOT NULL,
  state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, world_instance_id, state_key)
);

CREATE INDEX IF NOT EXISTS idx_world_live_states_key ON world_live_states(state_key, world_instance_id);
CREATE INDEX IF NOT EXISTS idx_world_live_states_updated ON world_live_states(updated_at DESC);

ALTER TABLE world_live_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_states_select" ON world_live_states;
CREATE POLICY "live_states_select" ON world_live_states
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "live_states_insert" ON world_live_states;
CREATE POLICY "live_states_insert" ON world_live_states
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "live_states_update" ON world_live_states;
CREATE POLICY "live_states_update" ON world_live_states
  FOR UPDATE TO authenticated USING (true);
