-- ============================================================
--  FACELESS ANIMAL STUDIOS — PROFILES SEED
--  supabase/seeds/001_profiles_and_posts.sql
--
--  RUN THIS ONCE in the Supabase SQL Editor:
--    supabase.com → Your Project → SQL Editor → Paste & Run
--
--  WHAT IT DOES:
--    1. Deactivates old test profiles in the profiles table
--    2. Inserts/upserts real member profiles (required for board posts)
--    3. Inserts the first featured board post from DJ Faceless Animal
--    4. Updates member_accounts.page_slug for the founder
--
--  WHY:
--    The Supabase anon key only allows free-plan profile inserts.
--    Admin profiles (premium/pro) must be inserted via the SQL editor
--    using Postgres-level access.
--
--  SAFE TO RE-RUN: all statements use INSERT ... ON CONFLICT DO UPDATE
-- ============================================================


-- ── 1. Deactivate test/internal profiles ─────────────────────

UPDATE profiles
SET is_active = false
WHERE username LIKE 'conntest_%'
   OR username LIKE 'diagA_%'
   OR username LIKE 'diag_%'
   OR username LIKE 'probe_%'
   OR username LIKE 'fastest_%'
   OR username LIKE 'fas_rpc_test_%'
   OR username LIKE 'smoketest%'
   OR username LIKE 'testdj_%'
   OR username LIKE 'testartist%'
   OR username LIKE 'uploadtest%'
   OR username LIKE 'imgtest%'
   OR username SIMILAR TO 'x[a-z0-9]{6,}';


-- ── 2. Upsert real member profiles ───────────────────────────

-- DJ Faceless Animal — Platform Founder
INSERT INTO profiles (
  username, display_name, email, bio,
  category, city, state, plan_type,
  is_featured, is_active, slug, links_json
) VALUES (
  'jamespropane00',
  'DJ Faceless Animal',
  'djfacelessanimal@gmail.com',
  'Underground DJ and producer out of Providence, RI. Hip-hop, drill, custom blends. Founder of Faceless Animal Studios. The platform exists because the right tools weren''t available — so I built them.',
  'dj', 'Providence', 'RI', 'premium',
  true, true, 'djfacelessanimal', '[]'::jsonb
)
ON CONFLICT (username) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  email        = EXCLUDED.email,
  bio          = EXCLUDED.bio,
  category     = EXCLUDED.category,
  city         = EXCLUDED.city,
  state        = EXCLUDED.state,
  plan_type    = EXCLUDED.plan_type,
  is_featured  = EXCLUDED.is_featured,
  is_active    = EXCLUDED.is_active,
  slug         = EXCLUDED.slug;


-- Ariana — Premium Member
INSERT INTO profiles (
  username, display_name, bio,
  category, plan_type, is_featured, is_active, slug, links_json
) VALUES (
  'arianamnm',
  'Ariana',
  'Platform member on Faceless Animal Studios.',
  'creator', 'premium', false, true, 'arianamnm', '[]'::jsonb
)
ON CONFLICT (username) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  bio          = EXCLUDED.bio,
  plan_type    = EXCLUDED.plan_type,
  is_active    = EXCLUDED.is_active;


-- KOLD Visual — Creator (reserved)
INSERT INTO profiles (
  username, display_name, bio,
  category, city, state, plan_type, is_featured, is_active, slug, links_json
) VALUES (
  'koldvisual',
  'KOLD Visual',
  'Motion graphics, brand identity, and visual direction for underground artists and independent labels. The work speaks before the name does.',
  'visual_artist', 'Providence', 'RI', 'starter', false, true, 'koldvisual', '[]'::jsonb
)
ON CONFLICT (username) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  bio          = EXCLUDED.bio,
  is_active    = EXCLUDED.is_active;


-- Recluse Beatz — Producer (reserved)
INSERT INTO profiles (
  username, display_name, bio,
  category, city, plan_type, is_featured, is_active, slug, links_json
) VALUES (
  'reclusebeatz',
  'Recluse Beatz',
  'Lo-fi beats and underground sample flips. Making since 2019. Heavy on texture, easy on the drums.',
  'producer', 'New England', 'free', false, true, 'reclusebeatz', '[]'::jsonb
)
ON CONFLICT (username) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  bio          = EXCLUDED.bio,
  is_active    = EXCLUDED.is_active;


-- Eastside Cuts — Business (reserved)
INSERT INTO profiles (
  username, display_name, bio,
  category, city, state, plan_type, is_featured, is_active, slug, links_json
) VALUES (
  'eastsidecuts',
  'Eastside Cuts',
  'Barbershop on the east side. Fades, tapers, lineups, designs. Walk-ins welcome — book online if you want your spot guaranteed. Open 7 days.',
  'business', 'East Providence', 'RI', 'starter', false, true, 'eastsidecuts', '[]'::jsonb
)
ON CONFLICT (username) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  bio          = EXCLUDED.bio,
  is_active    = EXCLUDED.is_active;


-- ── 3. Insert first board post (founder announcement) ─────────
--    This post goes live immediately (is_approved=true, visible)

INSERT INTO board_posts (
  profile_id, username, post_text, category,
  is_featured, is_approved, visibility_status
)
SELECT
  p.id,
  'jamespropane00',
  'The platform is live. Radio is running, pages are building, and the network is open. Underground and growing from Providence, RI. If you create — you belong here.',
  'announcement',
  true,
  true,
  'visible'
FROM profiles p
WHERE p.username = 'jamespropane00'
  AND NOT EXISTS (
    SELECT 1 FROM board_posts bp WHERE bp.username = 'jamespropane00'
  );


-- ── 4. Update member_accounts page_slug for founder ──────────

UPDATE member_accounts
SET page_slug = 'djfacelessanimal', page_status = 'live'
WHERE username = 'jamespropane00';


-- ── Done ──────────────────────────────────────────────────────
SELECT 'Seed complete. ' || COUNT(*) || ' active profiles.' AS status
FROM profiles WHERE is_active = true;
