-- ============================================================
-- PHASE 4b: GANGS & TERRITORY INFLUENCE
-- ============================================================

-- ── UPDATE WORLD_GANGS TABLE ─────────────────────────────────
-- Add new columns to existing world_gangs table
ALTER TABLE world_gangs ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#a78bfa';
ALTER TABLE world_gangs ADD COLUMN IF NOT EXISTS total_influence INTEGER DEFAULT 0;
ALTER TABLE world_gangs ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 1;
ALTER TABLE world_gangs ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE world_gangs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ── WORLD_GANG_MEMBERS TABLE ────────────────────────────────
CREATE TABLE IF NOT EXISTS world_gang_members (
  id BIGINT PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id UUID NOT NULL REFERENCES world_gangs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'officer', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contribution_score INTEGER DEFAULT 0,
  UNIQUE(gang_id, user_id)
);

-- ── DISTRICT INFLUENCE TABLE ────────────────────────────────
CREATE TABLE IF NOT EXISTS world_district_influence (
  id BIGINT PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id INTEGER NOT NULL,
  gang_id UUID NOT NULL REFERENCES world_gangs(id) ON DELETE CASCADE,
  influence_percent INTEGER NOT NULL DEFAULT 0 CHECK (influence_percent >= 0 AND influence_percent <= 100),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(district_id, gang_id)
);

-- ── NPC AFFILIATIONS TABLE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS world_npc_affiliations (
  id BIGINT PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id INTEGER NOT NULL,
  gang_id UUID NOT NULL REFERENCES world_gangs(id) ON DELETE CASCADE,
  affiliation_strength INTEGER NOT NULL DEFAULT 50 CHECK (affiliation_strength >= 0 AND affiliation_strength <= 100),
  recruited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  npc_type TEXT NOT NULL CHECK (npc_type IN ('builder', 'guard', 'artist', 'worker')),
  UNIQUE(npc_id, gang_id)
);

-- ── GANG CHAT TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_gang_chat (
  id BIGINT PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id UUID NOT NULL REFERENCES world_gangs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GANG EVENTS TABLE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_gang_events (
  id BIGINT PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id UUID NOT NULL REFERENCES world_gangs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('party', 'charity', 'festival', 'construction')),
  district_id INTEGER,
  influence_gained INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gang_members_gang ON world_gang_members(gang_id);
CREATE INDEX IF NOT EXISTS idx_gang_members_user ON world_gang_members(user_id);
CREATE INDEX IF NOT EXISTS idx_district_influence_district ON world_district_influence(district_id);
CREATE INDEX IF NOT EXISTS idx_district_influence_gang ON world_district_influence(gang_id);
CREATE INDEX IF NOT EXISTS idx_npc_affiliations_gang ON world_npc_affiliations(gang_id);
CREATE INDEX IF NOT EXISTS idx_npc_affiliations_npc ON world_npc_affiliations(npc_id);
CREATE INDEX IF NOT EXISTS idx_gang_chat_gang ON world_gang_chat(gang_id);
CREATE INDEX IF NOT EXISTS idx_gang_chat_time ON world_gang_chat(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gang_events_gang ON world_gang_events(gang_id);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE world_gang_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_district_influence ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_npc_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_gang_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_gang_events ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to avoid conflicts
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE tablename IN ('world_gang_members', 'world_district_influence', 'world_npc_affiliations', 'world_gang_chat', 'world_gang_events')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Gang members: anyone can read, authenticated can insert
CREATE POLICY "gang_members_select" ON world_gang_members FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "gang_members_insert" ON world_gang_members FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "gang_members_update" ON world_gang_members FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "gang_members_delete" ON world_gang_members FOR DELETE
  TO authenticated USING (true);

-- District influence: anyone can read, authenticated can insert/update
CREATE POLICY "district_influence_select" ON world_district_influence FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "district_influence_insert" ON world_district_influence FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "district_influence_update" ON world_district_influence FOR UPDATE
  TO authenticated USING (true);

-- NPC affiliations: anyone can read, authenticated can insert
CREATE POLICY "npc_affiliations_select" ON world_npc_affiliations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "npc_affiliations_insert" ON world_npc_affiliations FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "npc_affiliations_update" ON world_npc_affiliations FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "npc_affiliations_delete" ON world_npc_affiliations FOR DELETE
  TO authenticated USING (true);

-- Gang chat: anyone can read, authenticated can insert
CREATE POLICY "gang_chat_select" ON world_gang_chat FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "gang_chat_insert" ON world_gang_chat FOR INSERT
  TO authenticated WITH CHECK (true);

-- Gang events: anyone can read, authenticated can insert
CREATE POLICY "gang_events_select" ON world_gang_events FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "gang_events_insert" ON world_gang_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- ── SERVICE ROLE POLICIES ────────────────────────────────────
CREATE POLICY "service_role_gang_members" ON world_gang_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_district_influence" ON world_district_influence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_npc_affiliations" ON world_npc_affiliations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_gang_chat" ON world_gang_chat
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_gang_events" ON world_gang_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
