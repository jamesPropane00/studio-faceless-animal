/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — Member Vault Transfer
 *  functions/api/member/vault-transfer.js (Cloudflare Pages Function)
 *
 *  Handles POST /api/member/vault-transfer
 *  Body: { username, ph, recipient_code, send_amount, note? }
 * ============================================================
 */

const FLOW_BASE_SC_PER_MIN = 0.2
const FLOW_MAX_ELAPSED_MIN = 10

export async function onRequestPost(context) {
  const { request, env } = context

  const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  const SUPA_URL = env.SUPABASE_URL
  if (!SERVICE_KEY || !SUPA_URL) {
    return jsonResponse({ ok: false, error: 'Server credentials not configured.' }, 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const username = String((body && body.username) || '').toLowerCase().trim()
  const ph = String((body && body.ph) || '').trim()
  const recipientCode = sanitizeSignalCode(body && body.recipient_code).toUpperCase()
  const rawAmount = Number(body && body.send_amount)
  const sendAmount = toFixedNumber(rawAmount, 4)
  const note = String((body && body.note) || '').trim().slice(0, 240)

  if (!username || !ph) {
    return jsonResponse({ ok: false, error: 'Missing username/ph.' }, 400)
  }
  if (!isValidSignalCode(recipientCode)) {
    return jsonResponse({ ok: false, error: 'Recipient code invalid.' }, 400)
  }
  if (!Number.isFinite(rawAmount) || sendAmount <= 0) {
    return jsonResponse({ ok: false, error: 'Invalid transfer amount.' }, 400)
  }

  const identityOk = await verifyIdentity(SUPA_URL, SERVICE_KEY, username, ph)
  if (!identityOk) {
    return jsonResponse({ ok: false, error: 'Authentication failed.' }, 401)
  }

  const row = await getMemberVaultRow(SUPA_URL, SERVICE_KEY, username)
  if (!row) {
    return jsonResponse({ ok: false, error: 'Member row not found.' }, 404)
  }

  const tickResult = await tickMemberVaultFlow(SUPA_URL, SERVICE_KEY, row)
  if (!tickResult.ok) {
    return jsonResponse({ ok: false, error: tickResult.error || 'Could not refresh vault balance.' }, 500)
  }

  const senderCode = String(tickResult.row.platform_id || '').toUpperCase()
  if (senderCode && senderCode === recipientCode) {
    return jsonResponse({ ok: false, error: 'Cannot send to your own Signal Code.' }, 400)
  }

  const availableBalance = Math.max(0, Number(tickResult.row.credits_balance || 0) || 0)
  if (availableBalance < sendAmount) {
    return jsonResponse({ ok: false, error: 'Insufficient balance.' }, 400)
  }

  const rpcRes = await supabaseFetch(SUPA_URL, SERVICE_KEY, 'POST', '/rest/v1/rpc/transfer_veil', {
    sender: tickResult.row.id,
    recipient_code: recipientCode,
    send_amount: sendAmount,
    note: note || null,
  })

  let rpcPayload = null
  try { rpcPayload = await rpcRes.json() } catch {}

  if (!rpcRes.ok) {
    const message = rpcPayload && (rpcPayload.error || rpcPayload.message || rpcPayload.details)
    return jsonResponse({ ok: false, error: message || 'Transfer failed.' }, 500)
  }

  if (!rpcPayload || rpcPayload.error || rpcPayload.success !== true) {
    return jsonResponse({ ok: false, error: (rpcPayload && rpcPayload.error) || 'Transfer failed.' }, 400)
  }

  const finalRow = await getMemberVaultRow(SUPA_URL, SERVICE_KEY, username)
  if (!finalRow) {
    return jsonResponse({ ok: false, error: 'Transfer completed but vault state could not be reloaded.' }, 500)
  }

  return jsonResponse({
    ok: true,
    ...vaultSnapshotFromRow(finalRow, vaultProfileForMember(finalRow), 0, 0, new Date().toISOString()),
    transfer: {
      sent: toFixedNumber(rpcPayload.sent || sendAmount, 4),
      fee: toFixedNumber(rpcPayload.fee || 0, 4),
      received: toFixedNumber(rpcPayload.received || 0, 4),
      recipient_code: String(rpcPayload.recipient_code || recipientCode).toUpperCase(),
      note: note || '',
    },
  }, 200)
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeSignalCode(rawCode) {
  return String(rawCode || '').trim().replace(/\s+/g, '')
}

function isValidSignalCode(code) {
  return /^SIG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i.test(String(code || '').trim())
}

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

  const writePath = `/rest/v1/member_accounts?username=eq.${encodeURIComponent(String(row.username || '').toLowerCase())}`
  const writeRes = await supabaseFetch(supabaseUrl, serviceKey, 'PATCH', writePath, {
    credits_balance: nextBalance,
    flow_last_tick_at: nowIso,
    flow_last_day: todayKey,
    flow_earned_today: nextEarned,
    flow_rate_per_min: flowRate,
  })
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
