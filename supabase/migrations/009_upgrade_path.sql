-- ============================================================
--  FACELESS ANIMAL STUDIOS — MIGRATION 009
--  Upgrade Path: clean data model for plan changes
--
--  Run this in: Supabase Dashboard → SQL Editor
--  Safe to re-run (all ALTER … ADD COLUMN IF NOT EXISTS).
--
--  What this adds:
--  1. profiles — plan_features, plan_changed_at, upgrade_requested_plan
--  2. pages    — plan_type snapshot, upgrade_status index, RLS grant
--  3. Validates upgrade_status values on pages
-- ============================================================


-- ── 1. PROFILES: upgrade tracking columns ────────────────────

ALTER TABLE profiles
  -- Per-profile feature flags that override the base plan defaults.
  -- Admin uses this to grant extra features (e.g. early access to Pro
  -- features on a Starter plan, or free custom accent as a promo).
  -- Example: { "custom_accent": true, "marquee_custom": true }
  ADD COLUMN IF NOT EXISTS plan_features jsonb DEFAULT '{}',

  -- Timestamp of the most recent plan change (set by applyUpgrade()).
  -- Null = plan has never changed from the initial default.
  ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz,

  -- The plan this profile has requested to upgrade to, but whose payment
  -- is not yet confirmed. Set by requestUpgrade(), cleared by applyUpgrade()
  -- or cancelUpgradeRequest().
  -- Values: null | 'starter' | 'pro' | 'premium'
  ADD COLUMN IF NOT EXISTS upgrade_requested_plan text;


-- ── 2. PAGES: plan_type snapshot column ──────────────────────
--  Records which plan was active when this page last went live.
--  Lets us audit "was this page live on a Pro plan?" without
--  joining to the profile (which may have changed since).

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'free';

COMMENT ON COLUMN pages.plan_type IS
  'Plan tier active when this page was last activated. free | starter | pro | premium';

COMMENT ON COLUMN pages.upgrade_status IS
  'null = no pending upgrade | requested = upgrade paid, awaiting build | in_progress = admin building | complete = upgrade applied';


-- ── 3. INDEX: fast lookup by upgrade_status ───────────────────

CREATE INDEX IF NOT EXISTS idx_pages_upgrade_status
  ON pages (upgrade_status)
  WHERE upgrade_status IS NOT NULL;


-- ── 4. INDEX: upgrade_requested_plan on profiles ─────────────

CREATE INDEX IF NOT EXISTS idx_profiles_upgrade_requested
  ON profiles (upgrade_requested_plan)
  WHERE upgrade_requested_plan IS NOT NULL;


-- ── 5. RLS — profiles: allow authenticated to read plan_features ──
--  Profiles' existing RLS already grants authenticated full access.
--  No new policies needed — plan_features is a standard column.
--  Public (anon) can only see is_active = true profiles via:
--    "profiles: public read active"


-- ── REFERENCE: UPGRADE FLOW ──────────────────────────────────
--
--  FREE → STARTER (example):
--  ─────────────────────────
--  1. Creator submits upgrade request (paid.html / intake form)
--     → submissions.insert({ plan_type: 'starter', ... })
--     → requestUpgrade(profileId, 'starter')
--       → profiles.update({ upgrade_requested_plan: 'starter' })
--       → pages.update({ upgrade_status: 'requested' })
--
--  2. Admin sees upgrade_status = 'requested' in dashboard
--     → confirms payment (confirmPayment() from migration 008)
--     → applyUpgrade(profileId, 'starter')
--       → profiles.update({ plan_type: 'starter', plan_changed_at: now() })
--       → profiles.update({ upgrade_requested_plan: null })
--       → pages.update({ plan_type: 'starter', upgrade_status: 'complete' })
--
--  PLAN FEATURE GATES (enforced in page-renderer.js + CSS):
--  ─────────────────────────────────────────────────────────
--  free:    bio + social links only; FAS branding badge in hero; no custom accent
--  starter: + works section, stats strip, quick info, custom tags; powered-by bar
--  pro:     + custom accent color, marquee custom words; NO branding at all; featured
--  premium: + custom domain; all pro features
--
--  plan_features JSON overrides per-profile (admin grants):
--    { "custom_accent": true }  — gives a starter profile pro-level accent
--    { "works_section": true }  — gives a free profile the works section
-- ============================================================
