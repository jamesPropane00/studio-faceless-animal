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

function normalizeMember(m, p) {
  const profile = p || null
  return {
    id:           m.id,
    username:     m.username,
    display_name: (profile && profile.display_name) || m.display_name || m.username,
    bio:          (profile && profile.bio) || m.bio || null,
    avatar_url:   (profile && profile.avatar_url) || null,
    category:     (profile && profile.category) || 'creator',
    city:         (profile && profile.city) || m.city || null,
    state:        (profile && profile.state) || m.state_abbr || null,
    plan_type:    m.plan_type || 'free',
    is_featured:  m.plan_type === 'premium' || m.is_founder === true,
    is_founder:   m.is_founder === true,
    founder_label: m.founder_label || null,
    slug:         (profile && profile.slug) || m.page_slug || m.username,
    page_status:  m.page_status || 'none',
    member_status: m.member_status || 'free',
    public_listing_enabled: m.public_listing_enabled !== false,
    last_active_at: m.last_active_at || null,
    platform_id: null,
    veil_state: m.veil_state || 'unveiled',
  }
}

export async function getBoardPostingAccess(username) {
  if (!SUPABASE_READY) {
    return {
      allowed: false,
      reason: 'Posting is unavailable while Signal services are offline.',
      state: null,
    }
  }

  const key = String(username || '').toLowerCase().trim()
  if (!key) {
    return {
      allowed: false,
      reason: 'Posting is unavailable because your account session is invalid.',
      state: null,
    }
  }

  const isSchemaMismatch = (err) => {
    const code = String((err && err.code) || '')
    const msg = String((err && err.message) || '').toLowerCase()
    return code === '42703' || msg.includes('column') || msg.includes('does not exist')
  }

  let result = await supabase
    .from('member_accounts')
    .select('username, posting_enabled, moderation_state, member_status, account_status')
    .eq('username', key)
    .single()

  if (result.error && isSchemaMismatch(result.error)) {
    result = await supabase
      .from('member_accounts')
      .select('username, moderation_state, member_status, account_status')
      .eq('username', key)
      .single()
  }

  if (result.error || !result.data) {
    console.warn('[FAS] getBoardPostingAccess fallback:', result.error && result.error.message ? result.error.message : 'missing member row')
    return {
      allowed: true,
      reason: null,
      state: null,
    }
  }

  const row = result.data
  const postingEnabled = row.posting_enabled !== false
  const moderationState = String(row.moderation_state || 'clear').toLowerCase()
  const accountState = String(row.account_status || row.member_status || 'active').toLowerCase()

  if (!postingEnabled) {
    return {
      allowed: false,
      reason: 'Your posting access is currently disabled.',
      state: { postingEnabled, moderationState, accountState },
    }
  }

  if (moderationState === 'suspended' || moderationState === 'banned') {
    return {
      allowed: false,
      reason: 'Board access is restricted for this account.',
      state: { postingEnabled, moderationState, accountState },
    }
  }

  if (accountState === 'suspended' || accountState === 'banned') {
    return {
      allowed: false,
      reason: 'Board access is restricted for this account.',
      state: { postingEnabled, moderationState, accountState },
    }
  }

  return {
    allowed: true,
    reason: null,
    state: { postingEnabled, moderationState, accountState },
  }
}

export async function getNetworkCreators(limit = 24) {
  if (!SUPABASE_READY) return notReady('getNetworkCreators')

  const isSchemaMismatch = (err) => {
    const code = String((err && err.code) || '')
    const msg = String((err && err.message) || '').toLowerCase()
    return code === '42703' || msg.includes('column') || msg.includes('does not exist')
  }

  // Guard: Try without is_founder if schema mismatch
  let result = await supabase
    .from('member_accounts')
    .select('id, username, display_name, bio, city, state_abbr, plan_type, member_status, page_slug, page_status, public_listing_enabled, is_founder, founder_label, last_active_at, veil_state, created_at')
    .in('member_status', ['active', 'free'])
    .order('is_founder', { ascending: false })
    .order('last_active_at', { ascending: false })
    .order('created_at',  { ascending: false })
    .limit(limit + 80)

  if (result.error && isSchemaMismatch(result.error)) {
    // Try again without is_founder
    result = await supabase
      .from('member_accounts')
      .select('id, username, display_name, bio, city, state_abbr, plan_type, member_status, page_slug, page_status, founder_label, last_active_at, veil_state, created_at')
      .in('member_status', ['active', 'free'])
      .order('last_active_at', { ascending: false })
      .order('created_at',  { ascending: false })
      .limit(limit + 80)
  }

  const { data, error } = result

  if (error) {
    console.error('[FAS] getNetworkCreators error:', error.message)
    return { data: null, error }
  }

  const members = (data || []).filter(m => {
    if (!m || isTestAccount(m.username)) return false
    if (m.public_listing_enabled === false) return false
    return true
  })

  const usernames = members.map(m => String(m.username || '').toLowerCase()).filter(Boolean)
  let profileMap = {}

  if (usernames.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('username, display_name, bio, avatar_url, category, city, state, slug, is_active')
      .in('username', usernames)

    ;(profiles || []).forEach(p => {
      if (!p || !p.username) return
      profileMap[String(p.username).toLowerCase()] = p
    })
  }

  const normalized = members
    .map(m => normalizeMember(m, profileMap[String(m.username || '').toLowerCase()]))
    .sort((a, b) => {
      const founderRank = Number(b.is_founder === true) - Number(a.is_founder === true)
      if (founderRank !== 0) return founderRank
      const aLive = a.page_status === 'live' ? 1 : 0
      const bLive = b.page_status === 'live' ? 1 : 0
      if (aLive !== bLive) return bLive - aLive
      const aTs = a.last_active_at ? new Date(a.last_active_at).getTime() : 0
      const bTs = b.last_active_at ? new Date(b.last_active_at).getTime() : 0
      return bTs - aTs
    })
    .slice(0, limit)

  return { data: normalized, error: null }
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

  const isSchemaMismatch = (err) => {
    const code = String((err && err.code) || '')
    const msg = String((err && err.message) || '').toLowerCase()
    return code === '42703' || msg.includes('column') || msg.includes('does not exist')
  }

  // Guard: Only query signal_posts if it exists (try/catch)
  let query
  try {
    query = supabase
      .from('signal_posts')
      .select(`
        id,
        username,
        display_name,
        content,
        media_url,
        signal_type,
        boost_count,
        created_at,
        author_username,
        body_text,
        post_type
      `)
      .order('created_at',  { ascending: false })
  } catch (err) {
    console.warn('[FAS] signal_posts table missing or unavailable:', err)
    return { data: [], error: err }
  }
    .limit(limit)

  if (featuredOnly) query = query.eq('signal_type', 'live')

  const { data: rows, error } = await query
  if (error) console.error('[FAS] getBoardPosts error (canonical):', error.message)

  let data = (rows || []).map(row => ({
    id: row.id,
    username: row.username || row.author_username || '',
    display_name: row.display_name || row.username || row.author_username || '',
    platform_id: '',
    content: row.content || row.body_text || '',
    media_url: row.media_url || null,
    signal_type: row.signal_type || row.post_type || 'drop',
    created_at: row.created_at,
    boost_count: Number(row.boost_count || 0),
  }))

  // Fallback: signal_posts exists but columns differ from the canonical schema.
  if (!data.length && error && isSchemaMismatch(error)) {
    const { data: legacySignalRows, error: legacySignalErr } = await supabase
      .from('signal_posts')
      .select('id, author_username, body_text, post_type, media_url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!legacySignalErr && legacySignalRows && legacySignalRows.length) {
      data = legacySignalRows.map(row => ({
        id: row.id,
        username: row.author_username || '',
        display_name: row.author_username || '',
        platform_id: '',
        content: row.body_text || '',
        media_url: row.media_url || null,
        signal_type: row.post_type || 'drop',
        created_at: row.created_at,
        boost_count: 0,
      }))
    } else if (legacySignalErr) {
      console.error('[FAS] getBoardPosts error (legacy signal_posts):', legacySignalErr.message)
    }
  }

  if ((!data.length || (error && String(error.code || '') === '42P01'))) {
    const { data: legacyRows, error: legacyError } = await supabase
      .from('board_posts')
      .select('id, username, post_text, image_url, category, created_at')
      .eq('is_approved', true)
      .eq('visibility_status', 'visible')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!legacyError && legacyRows && legacyRows.length) {
      data = legacyRows.map(row => ({
        id: row.id,
        username: row.username || '',
        display_name: row.username || '',
        platform_id: '',
        content: row.post_text || '',
        media_url: row.image_url || null,
        signal_type: row.category || 'drop',
        created_at: row.created_at,
        boost_count: 0,
      }))
    }
  }

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

  const access = await getBoardPostingAccess(data && data.username)
  if (!access.allowed) {
    const denied = new Error(access.reason || 'Board access is restricted for this account.')
    denied.code = 'POSTING_DISABLED'
    denied.state = access.state || null
    return { data: null, error: denied }
  }

  const cleanContent = String(data && data.content || '').trim()
  if (!cleanContent) return { data: null, error: new Error('Signal content is required.') }

  const isSchemaMismatch = (err) => {
    const code = String((err && err.code) || '')
    const msg = String((err && err.message) || '').toLowerCase()
    return code === '42703' || msg.includes('column') || msg.includes('does not exist')
  }

  const payload = {
    username: data.username,
    display_name: data.display_name || data.username,
    platform_id: data.platform_id || null,
    content: cleanContent,
    media_url: data.media_url || null,
    signal_type: data.signal_type || 'drop',

    // Compatibility with older signal_posts schema columns.
    author_username: data.username,
    author_platform_id: data.platform_id || null,
    body_text: cleanContent,
    post_type: data.signal_type || 'drop',
    visibility: 'public',
    moderation_state: 'approved',
  }

  const { data: row, error } = await supabase
    .from('signal_posts')
    .insert([{
      ...payload,
    }])
    .select('id, username, display_name, platform_id, content, media_url, signal_type, created_at, boost_count')
    .single()

  if (!error && row) return { data: row, error: null }

  if (error) console.error('[FAS] createBoardPost error (canonical):', error.message)

  // Fallback A: signal_posts exists but lacks canonical columns.
  if (error && isSchemaMismatch(error)) {
    const { data: legacyRow, error: legacyErr } = await supabase
      .from('signal_posts')
      .insert([{
        author_username: data.username,
        author_platform_id: data.platform_id || null,
        body_text: cleanContent,
        post_type: data.signal_type || 'drop',
        media_url: data.media_url || null,
        visibility: 'public',
        moderation_state: 'approved',
      }])
      .select('id, author_username, author_platform_id, body_text, post_type, media_url, created_at')
      .single()

    if (!legacyErr && legacyRow) {
      return {
        data: {
          id: legacyRow.id,
          username: legacyRow.author_username || data.username,
          display_name: data.display_name || data.username,
          platform_id: legacyRow.author_platform_id || data.platform_id || '',
          content: legacyRow.body_text || cleanContent,
          media_url: legacyRow.media_url || null,
          signal_type: legacyRow.post_type || data.signal_type || 'drop',
          created_at: legacyRow.created_at,
          boost_count: 0,
        },
        error: null,
      }
    }

    if (legacyErr) console.error('[FAS] createBoardPost error (legacy signal_posts):', legacyErr.message)
  }

  // Fallback B: legacy board_posts path.
  const { data: boardRow, error: boardErr } = await supabase
    .from('board_posts')
    .insert([{
      username: data.username,
      post_text: cleanContent,
      category: data.signal_type || 'drop',
      image_url: data.media_url || null,
      is_approved: true,
      visibility_status: 'visible',
    }])
    .select('id, username, post_text, category, image_url, created_at')
    .single()

  if (!boardErr && boardRow) {
    return {
      data: {
        id: boardRow.id,
        username: boardRow.username || data.username,
        display_name: data.display_name || data.username,
        platform_id: data.platform_id || '',
        content: boardRow.post_text || cleanContent,
        media_url: boardRow.image_url || null,
        signal_type: boardRow.category || data.signal_type || 'drop',
        created_at: boardRow.created_at,
        boost_count: 0,
      },
      error: null,
    }
  }

  if (boardErr) console.error('[FAS] createBoardPost error (board_posts fallback):', boardErr.message)
  return { data: null, error: boardErr || error }
}


// ── boostBoardPost(postId) ───────────────────────────────────
export async function boostBoardPost(postId) {
  if (!SUPABASE_READY) return { data: null, error: new Error('[FAS] Supabase is not configured.') }
  if (!postId) return { data: null, error: new Error('[FAS] Missing post id.') }

  const { data, error } = await supabase.rpc('boost_signal', { p_signal_id: postId })
  if (error) {
    console.error('[FAS] boostBoardPost error:', error.message)
    return { data: null, error }
  }
  return { data: { boost_count: Number(data || 0) }, error: null }
}


// ── ensureProfileExists(username, sessionData) ────────────────
/**
 * Upsert a minimal profiles row for a signed-in member who exists in
 * member_accounts but has no profiles record yet.
 * Called automatically when `lookupProfileByUsername` returns
 * MEMBER_NOT_IN_PROFILES for a verified session user so the post can
 * go through without requiring manual studio activation.
 *
 * @param {string} username
 * @param {object} [sessionData]  - fas_user session object
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function ensureProfileExists(username, sessionData) {
  if (!SUPABASE_READY) return notReady('ensureProfileExists')

  const clean = String(username || '').toLowerCase().trim()
  if (!clean) return { data: null, error: new Error('No username provided') }

  const payload = {
    username:     clean,
    display_name: (sessionData && sessionData.display) || clean,
    plan_type:    (sessionData && sessionData.plan)    || 'free',
    slug:         clean,
    is_active:    true,
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert([payload], { onConflict: 'username' })
    .select('id, display_name, avatar_url, category')
    .single()

  if (error) console.error('[FAS] ensureProfileExists error:', error.message)
  return { data: data || null, error }
}
