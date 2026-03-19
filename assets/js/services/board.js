/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — BOARD SERVICE
 *  assets/js/services/board.js
 *
 *  Database reads and writes for the creator network board.
 *
 *  TABLES:
 *    board_posts — creator status updates, releases, announcements
 *    profiles    — looked up by username to resolve profile_id
 *
 *  CONSUMERS:
 *    assets/js/board-feed.js — calls all exports here
 *
 *  RLS (after migration 006):
 *    SELECT: only is_approved=true AND visibility_status='visible'
 *    INSERT: only is_approved=false AND visibility_status='pending'
 *
 *  SCHEMA: supabase/migrations/001_initial_schema.sql
 *          supabase/migrations/006_board_posts_policies.sql
 * ============================================================
 */

import { supabase, SUPABASE_READY } from '../supabase-client.js'


// ── GUARD ─────────────────────────────────────────────────────
function notReady(fn) {
  return { data: null, error: new Error(`[FAS] ${fn}() called but Supabase is not configured.`) }
}


// ── getNetworkCreators(limit) ─────────────────────────────────
/**
 * Fetch active members for the network board grid.
 * Queries member_accounts (the live auth table) so real members
 * appear immediately without waiting for profiles table seeding.
 * Filters out internal test accounts by username pattern.
 *
 * @param {number} [limit=24] - max profiles to return
 * @returns {Promise<{ data: object[]|null, error: Error|null }>}
 */

const TEST_PREFIXES = ['fas_rpc_test_', 'conntest_', 'probe_', 'fastest_', 'smoketest', 'diag', 'uploadtest', 'imgtest', 'testdj_', 'testartist', 'xslx', 'xnbs', 'xdpv', 'xez6', 'xv20', 'xdby', 'xx7u', 'x2q3', 'xeq5', 'xuoj', 'x44r', 'x9qz', 'x7q1', 'xsq2', 'xvl4', 'xo01', 'xvhp', 'x9f2', 'x6nu', 'x9xe', 'xfxk']

function isTestAccount(username) {
  if (!username) return true
  const u = username.toLowerCase()
  return TEST_PREFIXES.some(p => u.startsWith(p))
}

function normalizeMember(m) {
  return {
    id:           m.id,
    username:     m.username,
    display_name: m.display_name,
    bio:          m.bio || null,
    avatar_url:   null,
    category:     null,
    city:         m.city || null,
    state:        m.state_abbr || null,
    plan_type:    m.plan_type || 'free',
    is_featured:  m.plan_type === 'premium',
    slug:         m.page_slug || m.username,
    page_status:  m.page_status || 'none',
  }
}

export async function getNetworkCreators(limit = 24) {
  if (!SUPABASE_READY) return notReady('getNetworkCreators')

  const { data, error } = await supabase
    .from('member_accounts')
    .select('id, username, display_name, bio, city, state_abbr, plan_type, member_status, page_slug, page_status')
    .eq('member_status', 'active')
    .order('plan_type',   { ascending: false })
    .order('created_at',  { ascending: true })
    .limit(limit + 30)

  if (error) {
    console.error('[FAS] getNetworkCreators error:', error.message)
    return { data: null, error }
  }

  const filtered = (data || [])
    .filter(m => !isTestAccount(m.username))
    .slice(0, limit)
    .map(normalizeMember)

  return { data: filtered, error: null }
}


// ── getBoardPosts(opts) ───────────────────────────────────────
/**
 * Fetch approved board posts for the network feed.
 * Joins profiles for display_name, avatar_url, category, slug.
 * Results are ordered: featured first, then most recent.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.limit=20]     - max posts to return
 * @param {boolean} [opts.featuredOnly] - only is_featured posts
 * @returns {Promise<{ data: object[]|null, error: Error|null }>}
 */
export async function getBoardPosts({ limit = 20, featuredOnly = false } = {}) {
  if (!SUPABASE_READY) return notReady('getBoardPosts')

  let query = supabase
    .from('board_posts')
    .select(`
      id,
      username,
      post_text,
      category,
      image_url,
      is_featured,
      created_at,
      profiles ( display_name, avatar_url, category, slug )
    `)
    .eq('is_approved', true)
    .eq('visibility_status', 'visible')
    .order('is_featured', { ascending: false })
    .order('created_at',  { ascending: false })
    .limit(limit)

  if (featuredOnly) query = query.eq('is_featured', true)

  const { data, error } = await query
  if (error) console.error('[FAS] getBoardPosts error:', error.message)
  return { data, error }
}


// ── lookupProfileByUsername(username) ─────────────────────────
/**
 * Look up a member by username for board post submission.
 * Checks profiles table first (has profile_id FK for board_posts).
 * Falls back to member_accounts to confirm the user exists on the platform.
 *
 * @param {string} username
 * @returns {Promise<{ data: object|null, error: Error|null, source: string }>}
 */
export async function lookupProfileByUsername(username) {
  if (!SUPABASE_READY) return notReady('lookupProfileByUsername')

  const clean = username.toLowerCase().trim()

  // 1. Check profiles table (needed for board_posts FK)
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, category')
    .eq('username', clean)
    .eq('is_active', true)
    .single()

  if (profile) return { data: { ...profile, _source: 'profiles' }, error: null }

  // 2. Fall back: check member_accounts (user exists on platform but not in profiles yet)
  const { data: member, error: memberErr } = await supabase
    .from('member_accounts')
    .select('id, display_name')
    .eq('username', clean)
    .eq('member_status', 'active')
    .single()

  if (member) {
    // User exists but profile record not set up — can't create board post yet
    return {
      data: null,
      error: new Error('MEMBER_NOT_IN_PROFILES'),
      _source: 'member_accounts',
      _member: member,
    }
  }

  if (profileErr && profileErr.code !== 'PGRST116') {
    console.error('[FAS] lookupProfileByUsername error:', profileErr.message)
  }

  return { data: null, error: profileErr || memberErr }
}


// ── createBoardPost(data) ─────────────────────────────────────
/**
 * Insert a new board post.
 * Caller must supply a valid profile_id (from lookupProfileByUsername).
 * All posts start as pending — the studio approves before they go live.
 *
 * No SELECT-after-INSERT: uses return=minimal (no .select() chained).
 * The RLS WITH CHECK enforces is_approved=false, visibility_status='pending'.
 *
 * @param {object} data
 * @param {string} data.profile_id  - UUID of the posting profile (required)
 * @param {string} data.username    - creator's username (denormalized)
 * @param {string} data.post_text   - post body (required, max 500 chars)
 * @param {string} [data.category]  - 'release'|'update'|'collab'|'announcement'|'question'
 * @param {string} [data.image_url] - optional image URL
 * @returns {Promise<{ error: Error|null }>}
 */
export async function createBoardPost(data) {
  if (!SUPABASE_READY) return { error: new Error('[FAS] Supabase is not configured.') }

  const { error } = await supabase
    .from('board_posts')
    .insert([{
      profile_id:        data.profile_id,
      username:          data.username,
      post_text:         data.post_text.trim(),
      category:          data.category   || null,
      image_url:         data.image_url  || null,
      is_featured:       false,
      is_approved:       false,
      visibility_status: 'pending',
    }])

  if (error) console.error('[FAS] createBoardPost error:', error.message)
  return { error }
}
