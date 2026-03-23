/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — MEMBER DATABASE MODULE
 *  assets/js/member-db.js
 *
 *  Syncs localStorage member sessions with Supabase
 *  member_accounts table. Provides helpers for reading
 *  and writing member profile data.
 *
 *  USAGE (ES module):
 *    import { syncMember, getMember, updateMember, getSession } from './member-db.js'
 * ============================================================
 */

import { supabase, SUPABASE_READY } from './supabase-client.js'

const STORAGE_KEY = 'fas_user'
const MEMBER_KEY  = 'fas_member'

function normalizeVeilState(raw) {
  const v = String(raw || '').toLowerCase().trim()
  if (v === 'veiled') return 'veiled'
  if (v === 'deep') return 'deep'
  return 'unveiled'
}

// ── Session helpers ───────────────────────────────────────────
export function getSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!raw) return null
    raw.veil_state = normalizeVeilState(raw.veil_state)
    return raw
  } catch {
    return null
  }
}

export function isMember() {
  return localStorage.getItem(MEMBER_KEY) === 'true'
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(MEMBER_KEY)
}

export function setSession(username, display, extra) {
  const user = {
    username,
    display: display || username,
    veil_state: normalizeVeilState(extra && extra.veil_state),
    ts: Date.now(),
    ...(extra || {}),
  }
  user.veil_state = normalizeVeilState(user.veil_state)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  localStorage.setItem(MEMBER_KEY, 'true')
}

// ── Supabase sync ─────────────────────────────────────────────

/**
 * Upsert member to Supabase member_accounts.
 * Called on create or sign-in.
 */
export async function syncMember(username, display) {
  if (!SUPABASE_READY || !supabase) return null
  const key = username.toLowerCase()
  const payload = {
    username:      key,
    display_name:  display || username,
    avatar_initial: (display || username).charAt(0).toUpperCase(),
    last_active_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('member_accounts')
    .upsert(
      payload,
      { onConflict: 'username', ignoreDuplicates: false }
    )
    .select()
    .single()
  if (error) {
    console.info('[FAS] member-db: syncMember error', error.message)
    return null
  }
  return data
}

/**
 * Fetch member record from Supabase by username.
 */
export async function getMember(username) {
  if (!SUPABASE_READY || !supabase) return null
  const { data, error } = await supabase
    .from('member_accounts')
    .select('*')
    .eq('username', username.toLowerCase())
    .order('last_active_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data
}

/**
 * Update fields on a member record.
 */
export async function updateMember(username, fields) {
  if (!SUPABASE_READY || !supabase) {
    return { ok: false, data: null, error: { message: 'Supabase is not ready.' } }
  }

  const { data: targetRow, error: targetErr } = await supabase
    .from('member_accounts')
    .select('id')
    .eq('username', username.toLowerCase())
    .order('last_active_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (targetErr || !targetRow || !targetRow.id) {
    return {
      ok: false,
      data: null,
      error: {
        message: (targetErr && targetErr.message) || 'Member row not found for save.',
        code: (targetErr && targetErr.code) || null,
        details: (targetErr && targetErr.details) || null,
      },
      strippedFields: [],
    }
  }

  function extractMissingColumn(error) {
    const msg = String((error && error.message) || '')
    const schemaCacheMatch = msg.match(/Could not find the '([^']+)' column/i)
    if (schemaCacheMatch && schemaCacheMatch[1]) return schemaCacheMatch[1]

    const missingColumnMatch = msg.match(/column\s+['"]?([^'"\s]+)['"]?\s+does not exist/i)
    if (missingColumnMatch && missingColumnMatch[1]) return missingColumnMatch[1]

    return null
  }

  async function attemptUpdate(activeFields, strippedFields) {
    const { data, error } = await supabase
      .from('member_accounts')
      .update({ ...activeFields, last_active_at: new Date().toISOString() })
      .eq('id', targetRow.id)
      .select()
      .limit(1)
      .maybeSingle()

    if (!error) return { ok: true, data, error: null, strippedFields }

    const missingColumn = extractMissingColumn(error)
    if (missingColumn && Object.prototype.hasOwnProperty.call(activeFields, missingColumn)) {
      const nextFields = { ...activeFields }
      delete nextFields[missingColumn]
      return attemptUpdate(nextFields, strippedFields.concat(missingColumn))
    }

    console.info('[FAS] member-db: updateMember error', error.message)
    return {
      ok: false,
      data: null,
      error: {
        message: error.message || 'Update failed.',
        code: error.code || null,
        details: error.details || null,
      },
      strippedFields,
    }
  }

  return attemptUpdate(fields, [])
}

/**
 * Touch last_active_at on sign-in.
 */
export async function touchActive(username) {
  if (!SUPABASE_READY || !supabase) return
  await supabase
    .from('member_accounts')
    .update({ last_active_at: new Date().toISOString() })
    .eq('username', username.toLowerCase())
}

/**
 * Best-effort activity tracker.
 * Updates last_active_at, increments momentum, and inserts activity_log.
 * Never throws to callers and should not block user flow.
 */
export async function trackMemberActivity(username, actionType, opts) {
  if (!SUPABASE_READY || !supabase) return false

  const options = opts || {}
  const key = String(username || '').toLowerCase().trim()
  const action = String(actionType || '').trim()
  const momentumDelta = Math.max(0, Number(options.momentumDelta || 1))
  const pagePath = options.pagePath || null
  const source = options.source || 'client'
  const refId = options.refId || null
  const context = options.context && typeof options.context === 'object' ? options.context : {}

  if (!key || !action) return false

  try {
    const nowIso = new Date().toISOString()

    // Always touch last active first.
    await supabase
      .from('member_accounts')
      .update({ last_active_at: nowIso })
      .eq('username', key)

    // Momentum increment is lightweight and best-effort.
    const { data: row } = await supabase
      .from('member_accounts')
      .select('momentum')
      .eq('username', key)
      .single()

    const currentMomentum = Number((row && row.momentum) || 0)
    const nextMomentum = Math.max(0, currentMomentum + momentumDelta)

    await supabase
      .from('member_accounts')
      .update({
        momentum: nextMomentum,
        last_active_at: nowIso,
      })
      .eq('username', key)

    await supabase
      .from('activity_log')
      .insert({
        username: key,
        action_type: action,
        page_path: pagePath,
        context_json: context,
        source: source,
        ref_id: refId,
      })

    return true
  } catch (err) {
    console.info('[FAS] member-db: trackMemberActivity skipped', err && err.message ? err.message : err)
    return false
  }
}

/**
 * Look up public profile from profiles table by username/slug.
 * Returns null if not found (member may not have a built page yet).
 */
export async function getPublicProfile(username) {
  if (!SUPABASE_READY || !supabase) return null
  const { data } = await supabase
    .from('profiles')
    .select('username, display_name, bio, avatar_url, cover_image_url, category, city, state, links_json, plan_type, slug, is_active')
    .eq('username', username.toLowerCase())
    .single()
  return data || null
}

// ── Member plan helpers ───────────────────────────────────────
const PLAN_LABELS = {
  free:    { label: 'Free',          color: 'text-3',       badge: '' },
  access:  { label: 'Active Member', color: 'purple-bright', badge: '●' },
  starter: { label: 'Starter',       color: 'gold-bright',  badge: '★' },
  pro:     { label: 'Pro',           color: 'gold-bright',  badge: '★★' },
  premium: { label: 'Premium',       color: 'gold-bright',  badge: '★★★' },
}

export function getPlanMeta(plan) {
  return PLAN_LABELS[plan] || PLAN_LABELS.free
}

const STATUS_LABELS = {
  free:      { label: 'Free',          cls: 'status-free' },
  active:    { label: 'Active',        cls: 'status-active' },
  paused:    { label: 'Paused',        cls: 'status-paused' },
  suspended: { label: 'Suspended',     cls: 'status-suspended' },
}

export function getStatusMeta(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.free
}
