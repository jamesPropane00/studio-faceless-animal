/**
 * ============================================================
 *  FACELESS ANIMAL STUDIOS — Member Vault Activity
 *  functions/api/member/vault-activity.js (Cloudflare Pages Function)
 *
 *  Handles POST /api/member/vault-activity
 *  Body: { username, ph }
 *  Returns last 40 combined transfer + spend events.
 *
 *  Economy model:
 *    - credits_balance is the real Signal Coin (SC) balance
 *    - veil is a progression/tier/rate, not a spendable balance
 *    - pulse is staged/not implemented
 * ============================================================
 */

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
  if (!username || !ph) {
    return jsonResponse({ ok: false, error: 'Missing username/ph.' }, 400)
  }

  const identityOk = await verifyIdentity(SUPA_URL, SERVICE_KEY, username, ph)
  if (!identityOk) {
    return jsonResponse({ ok: false, error: 'Authentication failed.' }, 401)
  }

  const row = await getMemberVaultRow(SUPA_URL, SERVICE_KEY, username)
  if (!row || !row.id) {
    return jsonResponse({ ok: false, error: 'Member row not found.' }, 404)
  }

  const memberId = encodeURIComponent(String(row.id))
  const transferPath = `/rest/v1/veil_transactions?select=id,sender_id,recipient_id,sender_code,recipient_code,amount,fee,amount_received,note,created_at,reversed,reversed_at,reversed_by,reversal_reason&or=(sender_id.eq.${memberId},recipient_id.eq.${memberId})&order=created_at.desc&limit=30`
  const spendPath = `/rest/v1/vault_spend_events?select=id,spend_type,amount,metadata,created_at&member_id=eq.${memberId}&order=created_at.desc&limit=30`

  const [transferRes, spendRes] = await Promise.all([
    supabaseFetch(SUPA_URL, SERVICE_KEY, 'GET', transferPath, null),
    supabaseFetch(SUPA_URL, SERVICE_KEY, 'GET', spendPath, null),
  ])

  if (!transferRes.ok || !spendRes.ok) {
    return jsonResponse({ ok: false, error: 'Could not load vault activity.' }, 500)
  }

  let rows = []
  let spendRows = []
  try { rows = await transferRes.json(); if (!Array.isArray(rows)) rows = [] } catch { rows = [] }
  try { spendRows = await spendRes.json(); if (!Array.isArray(spendRows)) spendRows = [] } catch { spendRows = [] }

  const selfId = String(row.id)

  const transferActivity = rows.map((entry) => {
    const isSent = String((entry && entry.sender_id) || '') === selfId
    return {
      id: entry && entry.id ? String(entry.id) : '',
      kind: 'transfer',
      direction: isSent ? 'sent' : 'received',
      amount: toFixedNumber(isSent ? entry.amount : entry.amount_received, 4),
      gross_amount: toFixedNumber((entry && entry.amount) || 0, 4),
      fee: toFixedNumber((entry && entry.fee) || 0, 4),
      amount_received: toFixedNumber((entry && entry.amount_received) || 0, 4),
      counterparty_code: String(((isSent ? entry && entry.recipient_code : entry && entry.sender_code) || '')).toUpperCase(),
      note: String((entry && entry.note) || ''),
      created_at: entry && entry.created_at ? String(entry.created_at) : '',
      reversed: entry && entry.reversed === true,
      reversed_at: entry && entry.reversed_at ? String(entry.reversed_at) : '',
      reversed_by: entry && entry.reversed_by ? String(entry.reversed_by) : '',
      reversal_reason: entry && entry.reversal_reason ? String(entry.reversal_reason) : '',
    }
  })

  const spendActivity = spendRows.map((entry) => ({
    id: entry && entry.id ? String(entry.id) : '',
    kind: 'spend',
    spend_type: String((entry && entry.spend_type) || ''),
    spent: toFixedNumber((entry && entry.amount) || 0, 4),
    metadata: entry && typeof entry.metadata === 'object' ? entry.metadata : {},
    created_at: entry && entry.created_at ? String(entry.created_at) : '',
  }))

  const activity = transferActivity
    .concat(spendActivity)
    .sort((a, b) => {
      const ta = Date.parse(String((a && a.created_at) || '')) || 0
      const tb = Date.parse(String((b && b.created_at) || '')) || 0
      return tb - ta
    })
    .slice(0, 40)

  return jsonResponse({ ok: true, activity }, 200)
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

function toFixedNumber(value, digits) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  const p = Math.pow(10, digits)
  return Math.round(n * p) / p
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
