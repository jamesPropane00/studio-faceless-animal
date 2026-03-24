/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — Member Vault Flow Tick
 *  functions/api/member/vault-flow-tick.js (Cloudflare Pages Function)
 *
 *  Handles POST /api/member/vault-flow-tick
 *  Body: { username, ph }
 * ============================================================
 */

const FLOW_BASE_SC_PER_MIN = 0.2
const FLOW_MAX_ELAPSED_MIN = 10

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
    const SUPA_URL = env.SUPABASE_URL
    if (!SERVICE_KEY || !SUPA_URL) {
      console.error('[vault-flow-tick] Missing server credentials:', { SERVICE_KEY, SUPA_URL })
      return jsonResponse({ ok: false, error: 'Server credentials not configured.' }, 503)
    }

    let body
    try {
      body = await request.json()
    } catch (err) {
      console.error('[vault-flow-tick] Invalid request body:', err)
      return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
    }

    const username = String((body && body.username) || '').toLowerCase().trim()
    const ph = String((body && body.ph) || '').trim()
    if (!username || !ph) {
      console.error('[vault-flow-tick] Missing username/ph:', { username, ph })
      return jsonResponse({ ok: false, error: 'Missing username/ph.' }, 400)
    }

    const identityOk = await verifyIdentity(SUPA_URL, SERVICE_KEY, username, ph)
    if (!identityOk) {
      console.error('[vault-flow-tick] Authentication failed for:', username)
      return jsonResponse({ ok: false, error: 'Authentication failed.' }, 401)
    }

    const row = await getMemberVaultRow(SUPA_URL, SERVICE_KEY, username)
    if (!row) {
      console.error('[vault-flow-tick] Member row not found for:', username)
      return jsonResponse({ ok: false, error: 'Member row not found.' }, 404)
    }

    const tickResult = await tickMemberVaultFlow(SUPA_URL, SERVICE_KEY, row)
    if (!tickResult.ok) {
      console.error('[vault-flow-tick] Tick failed:', tickResult.error)
      return jsonResponse({ ok: false, error: tickResult.error || 'Could not persist vault flow tick.' }, 500)
    }

    return jsonResponse({ ok: true, ...tickResult.snapshot }, 200)
  } catch (err) {
    console.error('[vault-flow-tick] Uncaught error:', err)
    return jsonResponse({ ok: false, error: 'Internal server error.' }, 500)
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function verifyIdentity(supabaseUrl, serviceKey, username, ph) {
  if (!username || !ph) return false
  const u = username.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (!u) return false
  const filter = `username=eq.${encodeURIComponent(u)}&password_hash=eq.${encodeURIComponent(ph)}&select=username`
  const res = await supabaseFetch(supabaseUrl, serviceKey, 'GET', `/rest/v1/member_accounts?${filter}`, null)
  if (!res.ok) return false
  try {
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

async function getMemberVaultRow(supabaseUrl, serviceKey, username) {
  const u = String(username || '').toLowerCase().trim()
  if (!u) return null
  const path = `/rest/v1/member_accounts?username=eq.${encodeURIComponent(u)}&select=id,username,display_name,platform_id,veil_level,veil_state,credits_balance,flow_last_tick_at,flow_last_day,flow_earned_today,flow_rate_per_min&limit=1`
  const res = await supabaseFetch(supabaseUrl, serviceKey, 'GET', path, null)
  if (!res.ok) return null
  try {
    const rows = await res.json()
    return Array.isArray(rows) && rows.length ? rows[0] : null
  } catch {
    return null
  }
}

async function tickMemberVaultFlow(supabaseUrl, serviceKey, row) {
  if (!row || !row.username) return { ok: false, error: 'Member row not found.' }

  const profile = vaultProfileForMember(row)
  const now = new Date()
  const nowIso = now.toISOString()
  const todayKey = utcDayKey(now)

  const balance = Math.max(0, Number(row.credits_balance || 0) || 0)
  let earnedToday = Math.max(0, Number(row.flow_earned_today || 0) || 0)
  const storedDay = String(row.flow_last_day || '').slice(0, 10)
  if (!storedDay || storedDay !== todayKey) earnedToday = 0

  const lastTickRaw = String(row.flow_last_tick_at || '')
  const lastTickMs = lastTickRaw ? Date.parse(lastTickRaw) : Date.now()
  const nowMs = Date.now()
  let elapsedMin = Math.max(0, (nowMs - (Number.isFinite(lastTickMs) ? lastTickMs : nowMs)) / 60000)
  elapsedMin = Math.min(elapsedMin, FLOW_MAX_ELAPSED_MIN)

  const flowRate = toFixedNumber(FLOW_BASE_SC_PER_MIN * profile.multiplier, 4)
  let generated = toFixedNumber(elapsedMin * flowRate, 4)

  if (profile.dailyCap != null) {
    const remaining = Math.max(0, Number(profile.dailyCap) - earnedToday)
    generated = Math.min(generated, remaining)
  }

  const nextEarned = toFixedNumber(earnedToday + generated, 4)
  const nextBalance = toFixedNumber(balance + generated, 4)
  const mergedRow = {
    ...row,
    credits_balance: nextBalance,
    flow_last_tick_at: nowIso,
    flow_last_day: todayKey,
    flow_earned_today: nextEarned,
    flow_rate_per_min: flowRate,
  }

  const patchBody = {
    credits_balance: nextBalance,
    flow_last_tick_at: nowIso,
    flow_last_day: todayKey,
    flow_earned_today: nextEarned,
    flow_rate_per_min: flowRate,
  }

  const writePath = `/rest/v1/member_accounts?username=eq.${encodeURIComponent(String(row.username || '').toLowerCase())}`
  const writeRes = await supabaseFetch(supabaseUrl, serviceKey, 'PATCH', writePath, patchBody)
  if (!writeRes.ok) {
    return { ok: false, error: 'Could not persist vault flow tick.' }
  }

  return {
    ok: true,
    row: mergedRow,
    snapshot: vaultSnapshotFromRow(mergedRow, profile, generated, elapsedMin, nowIso),
  }
}

function vaultProfileForMember(row) {
  const level = Number(row && row.veil_level)
  if (Number.isFinite(level)) {
    if (level <= 0) return { tier: 'Veil IV', multiplier: 5, dailyCap: null }
    if (level === 1) return { tier: 'Veil III', multiplier: 3, dailyCap: 1000 }
    if (level === 2) return { tier: 'Veil II', multiplier: 2, dailyCap: 400 }
    if (level === 3) return { tier: 'Veil I', multiplier: 1.5, dailyCap: 150 }
    return { tier: 'Free', multiplier: 1, dailyCap: 50 }
  }
  const state = String((row && row.veil_state) || '').toLowerCase().trim()
  if (state === 'deep') return { tier: 'Veil III', multiplier: 3, dailyCap: 1000 }
  if (state === 'veiled') return { tier: 'Veil I', multiplier: 1.5, dailyCap: 150 }
  return { tier: 'Free', multiplier: 1, dailyCap: 50 }
}

function vaultSnapshotFromRow(row, profile, generated, elapsedMinutes, tickedAt) {
  const activeProfile = profile || vaultProfileForMember(row)
  return {
    credits_balance: toFixedNumber(Math.max(0, Number(row && row.credits_balance || 0) || 0), 4),
    flow_rate_per_min: toFixedNumber(Math.max(0, Number(row && row.flow_rate_per_min || (FLOW_BASE_SC_PER_MIN * activeProfile.multiplier)) || 0), 4),
    flow_earned_today: toFixedNumber(Math.max(0, Number(row && row.flow_earned_today || 0) || 0), 4),
    daily_cap: activeProfile.dailyCap,
    vault_tier_label: activeProfile.tier,
    generated: toFixedNumber(generated || 0, 4),
    elapsed_minutes: toFixedNumber(elapsedMinutes || 0, 4),
    ticked_at: tickedAt || new Date().toISOString(),
  }
}

function toFixedNumber(value, digits) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  const p = Math.pow(10, digits)
  return Math.round(n * p) / p
}

function utcDayKey(date) {
  const d = date instanceof Date ? date : new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function supabaseFetch(supabaseUrl, serviceKey, method, urlPath, jsonBody) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  return fetch(`${supabaseUrl}${urlPath}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  })
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
